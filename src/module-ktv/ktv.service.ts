import { randomUUID } from 'crypto';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { join } from 'path';
import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import Decimal from 'decimal.js';
import { DataSource, EntityManager, FindOptionsWhere, In, Repository, SelectQueryBuilder } from 'typeorm';
import {
  BusinessNoPrefix,
  FinanceBizType,
  KtvBookingActiveStatusList,
  KtvBookingCancelableStatusList,
  KtvBookingHour,
  KtvBookingSlot,
  KtvConsumeStatus,
  KtvOrderStatus,
  PageSetting,
  RecordStatus,
  ShopImageLimit,
  ShopImageMime,
  ShopType,
  VerifyCodeRule,
  NumberBoundary,
} from '../common/constants';
import { ShopContext } from '../common/context/shop-context';
import { BusinessException } from '../common/exceptions/business.exception';
import { PageResult } from '../common/interfaces/page-result';
import { createBusinessNo, createVerifyCode, isDuplicateEntryError, isEmpty, isNumber, isOneOf, isPositiveMoney, resolvePage, toIdentifier, toMoneyString } from '../common/tools';
import { MemberBalanceService } from '../core/member/member-balance.service';
import { MemberQueryService } from '../core/member/member-query.service';
import { NotifyService } from '../core/notify/notify.service';
import { ShopService } from '../core/shop/shop.service';
import { KtvBookingOrder, KtvConsumeOrder, KtvRoom, KtvRoomType, KtvRoomTypeImage } from './ktv.entities';

/**
 * 小程序创建 KTV 预订的入参。只选包厢类型，具体包厢到店再分配。
 */
export interface CreateKtvBookingCommand {
  shopId: string;
  roomTypeId: string;
  bookingDate: string;
  startTime: string;
  durationHours: number;
}

/**
 * 后台保存包厢类型的入参。门店取当前上下文。
 */
export interface SaveKtvRoomTypeCommand {
  typeName: string;
  hourlyPrice: string | number;
  status: string;
}

/**
 * 前端使用的一张包厢类型图片。
 */
export interface KtvRoomTypeImageView {
  imageId: string;
  imageUrl: string;
}

/**
 * 上传文件里服务需要的字段。
 */
export interface KtvRoomTypeImageFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

/**
 * 带图片列表的包厢类型。
 */
export interface KtvRoomTypeView {
  id: string;
  shopId: string;
  typeName: string;
  hourlyPrice: string;
  status: string;
  imageList: KtvRoomTypeImageView[];
}

/**
 * 后台保存包厢的入参。门店取当前上下文，不使用调用方传入的门店。
 */
export interface SaveKtvRoomCommand {
  roomNo: string;
  roomName: string;
  roomTypeId: string;
  capacity: number;
  status: string;
}

/**
 * KTV 预订列表展示行。
 */
export interface KtvBookingOrderView {
  bookingOrderId: string;
  shopId: string;
  orderNo: string;
  memberId: string;
  memberName: string;
  mobile: string;
  roomTypeId: string;
  roomTypeName: string;
  roomId: string;
  roomNo: string;
  roomName: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  durationHours: number;
  amount: string;
  orderStatus: string;
  verifyCode: string;
  createdAt: string;
}

/**
 * KTV 包厢、预订、核销、店内消费和取消退款。
 */
@Injectable()
export class KtvService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(KtvRoomType)
    private readonly ktvRoomTypeRepository: Repository<KtvRoomType>,
    @InjectRepository(KtvRoomTypeImage)
    private readonly ktvRoomTypeImageRepository: Repository<KtvRoomTypeImage>,
    @InjectRepository(KtvRoom)
    private readonly ktvRoomRepository: Repository<KtvRoom>,
    @InjectRepository(KtvBookingOrder)
    private readonly ktvBookingOrderRepository: Repository<KtvBookingOrder>,
    private readonly shopService: ShopService,
    private readonly memberBalanceService: MemberBalanceService,
    private readonly memberQueryService: MemberQueryService,
    private readonly notifyService: NotifyService,
  ) {}

  /**
   * 查询当前门店全部包厢类型，并带上图片。
   */
  async pageRoomTypes(): Promise<PageResult<KtvRoomTypeView>> {
    const roomTypeList = await this.ktvRoomTypeRepository.find({
      order: { sortOrder: 'ASC', id: 'ASC' },
    });
    const list = await this.toRoomTypeViewList(roomTypeList);
    return { list, total: list.length, page: PageSetting.DEFAULT_PAGE, pageSize: list.length };
  }

  /**
   * 新建当前门店包厢类型。
   */
  async createRoomType(command: SaveKtvRoomTypeCommand): Promise<KtvRoomTypeView> {
    this.assertRoomTypeCommand(command);
    const ktvRoomType = new KtvRoomType();
    ktvRoomType.shopId = this.requireCurrentShopId();
    ktvRoomType.sortOrder = await this.nextSortOrder(this.ktvRoomTypeRepository);
    this.fillRoomType(ktvRoomType, command);
    const savedRoomType = await this.ktvRoomTypeRepository.save(ktvRoomType);
    return this.toRoomTypeView(savedRoomType, []);
  }

  /**
   * 修改当前门店包厢类型。
   */
  async updateRoomType(roomTypeId: string, command: SaveKtvRoomTypeCommand): Promise<KtvRoomTypeView> {
    this.assertRoomTypeCommand(command);
    const ktvRoomType = await this.ktvRoomTypeRepository.findOne({ where: { id: roomTypeId } });
    if (isEmpty(ktvRoomType)) {
      throw new BusinessException('包厢类型不存在');
    }
    this.fillRoomType(ktvRoomType, command);
    const savedRoomType = await this.ktvRoomTypeRepository.save(ktvRoomType);
    const viewList = await this.toRoomTypeViewList([savedRoomType]);
    return viewList[0];
  }

  /**
   * 按拖动结果重排当前门店的全部包厢类型。
   */
  async sortRoomTypes(idList: string[]): Promise<void> {
    await this.applySortOrder(this.ktvRoomTypeRepository, KtvRoomType, idList, '包厢类型排序不完整');
  }

  /**
   * 给当前门店的包厢类型追加一张图片。
   */
  async addRoomTypeImage(roomTypeId: string, file: KtvRoomTypeImageFile): Promise<KtvRoomTypeImageView> {
    const ktvRoomType = await this.requireRoomType(roomTypeId);
    if (isEmpty(file) || isEmpty(file.buffer) || file.buffer.length === 0) {
      throw new BusinessException('请选择图片');
    }
    const extension = this.resolveImageExtension(file.mimetype);
    if (file.size > ShopImageLimit.MAX_BYTES) {
      throw new BusinessException('图片不能超过5MB');
    }
    const roomTypeIdValue = toIdentifier(ktvRoomType.id);
    const imageCount = await this.ktvRoomTypeImageRepository.count({ where: { roomTypeId: roomTypeIdValue } });
    if (imageCount >= ShopImageLimit.MAX_COUNT) {
      throw new BusinessException('包厢类型图片最多6张');
    }
    const fileName = `${randomUUID()}${extension}`;
    const directoryPath = join(process.cwd(), 'uploads', 'ktv-room-type', roomTypeIdValue);
    await mkdir(directoryPath, { recursive: true });
    await writeFile(join(directoryPath, fileName), file.buffer);
    const roomTypeImage = new KtvRoomTypeImage();
    roomTypeImage.roomTypeId = roomTypeIdValue;
    roomTypeImage.imageUrl = `/uploads/ktv-room-type/${roomTypeIdValue}/${fileName}`;
    roomTypeImage.sortOrder = imageCount;
    const savedImage = await this.ktvRoomTypeImageRepository.save(roomTypeImage);
    return this.toImageView(savedImage);
  }

  /**
   * 删除当前门店包厢类型的一张图片，并删掉磁盘文件。
   */
  async removeRoomTypeImage(roomTypeId: string, imageId: string): Promise<void> {
    const ktvRoomType = await this.requireRoomType(roomTypeId);
    const roomTypeIdValue = toIdentifier(ktvRoomType.id);
    const roomTypeImage = await this.ktvRoomTypeImageRepository.findOne({ where: { id: imageId, roomTypeId: roomTypeIdValue } });
    if (isEmpty(roomTypeImage)) {
      throw new BusinessException('包厢类型图片不存在');
    }
    const fileName = roomTypeImage.imageUrl.slice(roomTypeImage.imageUrl.lastIndexOf('/') + 1);
    const filePath = join(process.cwd(), 'uploads', 'ktv-room-type', roomTypeIdValue, fileName);
    try {
      await unlink(filePath);
    } catch (error) {
      const errorCode = (error as { code?: string }).code;
      if (errorCode !== 'ENOENT') {
        throw error;
      }
    }
    await this.ktvRoomTypeImageRepository.delete({ id: roomTypeImage.id });
  }

  /**
   * 查询当前门店全部包厢。
   */
  async pageRooms(): Promise<PageResult<KtvRoom>> {
    const list = await this.ktvRoomRepository.find({
      order: { sortOrder: 'ASC', id: 'ASC' },
    });
    return { list, total: list.length, page: PageSetting.DEFAULT_PAGE, pageSize: list.length };
  }

  /**
   * 小程序按门店查询可预订包厢。先确认门店是启用中的 KTV。
   */
  async listEnabledRooms(shopId: string): Promise<KtvRoom[]> {
    const shop = await this.shopService.findEnabledShop(shopId, ShopType.KTV);
    return this.ktvRoomRepository.find({
      where: { shopId: toIdentifier(shop.id), status: RecordStatus.ENABLED },
      order: { roomNo: 'ASC' },
    });
  }

  /**
   * 小程序按门店查询可预订的包厢类型。没有启用包厢的类型不返回。
   */
  async listEnabledRoomTypes(shopId: string): Promise<KtvRoomType[]> {
    const shop = await this.shopService.findEnabledShop(shopId, ShopType.KTV);
    const currentShopId = toIdentifier(shop.id);
    const roomTypeList = await this.ktvRoomTypeRepository.find({
      where: { shopId: currentShopId, status: RecordStatus.ENABLED },
      order: { sortOrder: 'ASC', id: 'ASC' },
    });
    if (roomTypeList.length === 0) {
      return [];
    }
    const enabledRoomList = await this.ktvRoomRepository.find({
      where: {
        shopId: currentShopId,
        roomTypeId: In(roomTypeList.map((roomType) => toIdentifier(roomType.id))),
        status: RecordStatus.ENABLED,
      },
    });
    const bookableRoomTypeIdSet = new Set(enabledRoomList.map((room) => toIdentifier(room.roomTypeId)));
    return roomTypeList.filter((roomType) => bookableRoomTypeIdSet.has(toIdentifier(roomType.id)));
  }

  /**
   * 新建当前门店的包厢。
   */
  async createRoom(command: SaveKtvRoomCommand): Promise<KtvRoom> {
    this.assertRoomCommand(command);
    const currentShopId = this.requireCurrentShopId();
    await this.requireRoomType(command.roomTypeId);
    const ktvRoom = new KtvRoom();
    ktvRoom.shopId = currentShopId;
    ktvRoom.sortOrder = await this.nextSortOrder(this.ktvRoomRepository);
    this.fillRoom(ktvRoom, command);
    try {
      return await this.ktvRoomRepository.save(ktvRoom);
    } catch (error) {
      this.rethrowDuplicateRoom(error);
    }
  }

  /**
   * 修改当前门店的包厢。其他门店的包厢会被数据权限滤掉。
   */
  async updateRoom(roomId: string, command: SaveKtvRoomCommand): Promise<KtvRoom> {
    this.assertRoomCommand(command);
    const ktvRoom = await this.ktvRoomRepository.findOne({ where: { id: roomId } });
    if (isEmpty(ktvRoom)) {
      throw new BusinessException('包厢不存在');
    }
    await this.requireRoomType(command.roomTypeId);
    this.fillRoom(ktvRoom, command);
    try {
      return await this.ktvRoomRepository.save(ktvRoom);
    } catch (error) {
      this.rethrowDuplicateRoom(error);
    }
  }

  /**
   * 按拖动结果重排当前门店的全部包厢。
   */
  async sortRooms(idList: string[]): Promise<void> {
    await this.applySortOrder(this.ktvRoomRepository, KtvRoom, idList, '包厢排序不完整');
  }

  /**
   * 创建预订订单，并在同一事务内扣减会员余额。
   */
  async createBooking(memberId: string, command: CreateKtvBookingCommand): Promise<KtvBookingOrder> {
    const durationHours = Number(command.durationHours);
    if (Number.isInteger(durationHours) !== true || durationHours < KtvBookingHour.MIN || durationHours > KtvBookingHour.MAX) {
      throw new BusinessException('演唱小时数必须在1到24之间');
    }
    this.assertBookableSlot(command.bookingDate, command.startTime);
    const bookingRange = this.resolveBookingRange(command.bookingDate, command.startTime, durationHours);
    return this.dataSource.transaction(async (entityManager) => {
      // 1. 校验门店真实存在且为启用中的 KTV，不以请求里的门店文本直接落库
      const shop = await this.shopService.findEnabledShopInManager(entityManager, command.shopId, ShopType.KTV);
      const shopId = toIdentifier(shop.id);
      // 2. 锁定包厢类型，确认它属于该门店且仍在售
      const ktvRoomType = await entityManager
        .getRepository(KtvRoomType)
        .createQueryBuilder('ktvRoomType')
        .setLock('pessimistic_write')
        .where('ktvRoomType.id = :roomTypeId', { roomTypeId: command.roomTypeId })
        .andWhere('ktvRoomType.shopId = :shopId', { shopId })
        .getOne();
      if (isEmpty(ktvRoomType) || ktvRoomType.status !== RecordStatus.ENABLED) {
        throw new BusinessException('包厢类型不存在或已停用');
      }
      const roomTypeId = toIdentifier(ktvRoomType.id);
      // 3. 可售数量只数该类型启用中的包厢。一间都没有时，不是时段订满
      const enabledRoomList = await entityManager.getRepository(KtvRoom).find({
        where: { shopId, roomTypeId, status: RecordStatus.ENABLED },
      });
      if (enabledRoomList.length === 0) {
        throw new BusinessException('该包厢类型没有可售包厢');
      }
      // 4. 锁住时段相交的有效订单，跨天也算相交，名额用完则拒绝
      const occupiedQuery = entityManager
        .getRepository(KtvBookingOrder)
        .createQueryBuilder('bookingOrder')
        .setLock('pessimistic_write')
        .where('bookingOrder.shopId = :shopId', { shopId })
        .andWhere('bookingOrder.roomTypeId = :roomTypeId', { roomTypeId });
      this.appendOccupiedRange(occupiedQuery, 'bookingOrder', bookingRange.rangeStart, bookingRange.rangeEnd);
      const occupiedOrderList = await occupiedQuery.getMany();
      if (occupiedOrderList.length >= enabledRoomList.length) {
        throw new BusinessException('该时段已订满');
      }
      // 5. 写入待核销订单，先不分配具体包厢。金额等于每小时价格乘以小时数
      const bookingOrder = new KtvBookingOrder();
      bookingOrder.shopId = shopId;
      bookingOrder.orderNo = createBusinessNo(BusinessNoPrefix.KTV_BOOKING);
      bookingOrder.memberId = memberId;
      bookingOrder.roomTypeId = roomTypeId;
      bookingOrder.roomId = null;
      bookingOrder.bookingDate = command.bookingDate;
      bookingOrder.startTime = command.startTime;
      bookingOrder.endTime = bookingRange.endTime;
      bookingOrder.durationHours = durationHours;
      bookingOrder.amount = toMoneyString(new Decimal(ktvRoomType.hourlyPrice).times(durationHours));
      bookingOrder.orderStatus = KtvOrderStatus.PENDING_VERIFY;
      bookingOrder.verifyCode = await this.createUniqueVerifyCode(entityManager);
      const savedOrder = await entityManager.getRepository(KtvBookingOrder).save(bookingOrder);
      // 6. 调用 core 扣余额。失败会连同订单一起回滚
      await this.memberBalanceService.deductBalance({
        entityManager,
        memberId,
        shopId,
        amount: savedOrder.amount,
        bizType: FinanceBizType.KTV_BOOKING,
        bizOrderNo: savedOrder.orderNo,
        operatorId: null,
        remark: 'KTV包厢预订',
      });
      // 7. 通知会员预订结果
      await this.notifyService.createMemberMessage(entityManager, {
        shopId,
        memberId,
        title: 'KTV预订成功',
        content: `订单${savedOrder.orderNo}已预订，核销码${savedOrder.verifyCode}`,
      });
      return savedOrder;
    });
  }

  /**
   * 后台分页查询当前门店预订订单。
   */
  async pageBookingOrders(verifyCode: string, pageValue: unknown, pageSizeValue: unknown): Promise<PageResult<KtvBookingOrderView>> {
    const pageResult = resolvePage(pageValue, pageSizeValue);
    const whereCondition: FindOptionsWhere<KtvBookingOrder> = {};
    if (!isEmpty(verifyCode)) {
      whereCondition.verifyCode = verifyCode;
    }
    const [bookingOrderList, total] = await this.ktvBookingOrderRepository.findAndCount({
      where: whereCondition,
      order: { id: 'DESC' },
      skip: pageResult.skip,
      take: pageResult.pageSize,
    });
    const viewList = await this.toBookingViewList(bookingOrderList);
    return { list: viewList, total, page: pageResult.page, pageSize: pageResult.pageSize };
  }

  /**
   * 小程序查询当前会员的预订订单。
   */
  async pageMemberBookingOrders(memberId: string, pageValue: unknown, pageSizeValue: unknown): Promise<PageResult<KtvBookingOrderView>> {
    const pageResult = resolvePage(pageValue, pageSizeValue);
    const [bookingOrderList, total] = await this.ktvBookingOrderRepository.findAndCount({
      where: { memberId },
      order: { id: 'DESC' },
      skip: pageResult.skip,
      take: pageResult.pageSize,
    });
    const viewList = await this.toBookingViewList(bookingOrderList);
    return { list: viewList, total, page: pageResult.page, pageSize: pageResult.pageSize };
  }

  /**
   * 到店核销并分配空闲包厢。分不到包厢时订单保持待核销。
   */
  async verifyBooking(bookingOrderId: string, roomId: string): Promise<void> {
    await this.dataSource.transaction(async (entityManager) => {
      // 1. 锁定待核销订单
      const bookingOrder = await entityManager
        .getRepository(KtvBookingOrder)
        .createQueryBuilder('bookingOrder')
        .setLock('pessimistic_write')
        .where('bookingOrder.id = :bookingOrderId', { bookingOrderId })
        .getOne();
      if (isEmpty(bookingOrder)) {
        throw new BusinessException('订单不存在');
      }
      if (bookingOrder.orderStatus !== KtvOrderStatus.PENDING_VERIFY) {
        throw new BusinessException('当前状态不能核销');
      }
      // 2. 包厢必须属于当前门店、订单上的类型，并且仍启用
      const ktvRoom = await entityManager
        .getRepository(KtvRoom)
        .createQueryBuilder('ktvRoom')
        .setLock('pessimistic_write')
        .where('ktvRoom.id = :roomId', { roomId })
        .andWhere('ktvRoom.shopId = :shopId', { shopId: toIdentifier(bookingOrder.shopId) })
        .getOne();
      if (isEmpty(ktvRoom) || ktvRoom.status !== RecordStatus.ENABLED) {
        throw new BusinessException('包厢不存在或已停用');
      }
      if (toIdentifier(ktvRoom.roomTypeId) !== toIdentifier(bookingOrder.roomTypeId)) {
        throw new BusinessException('包厢类型不匹配');
      }
      // 3. 该包厢在订单时段内不能已有另一笔已分配的有效订单，跨天同样相交
      const assignedRange = this.resolveBookingRange(
        String(bookingOrder.bookingDate).slice(0, 10),
        String(bookingOrder.startTime).slice(0, 8),
        bookingOrder.durationHours,
      );
      const conflictQuery = entityManager
        .getRepository(KtvBookingOrder)
        .createQueryBuilder('assignedOrder')
        .setLock('pessimistic_write')
        .where('assignedOrder.shopId = :shopId', { shopId: toIdentifier(bookingOrder.shopId) })
        .andWhere('assignedOrder.roomId = :roomId', { roomId: toIdentifier(ktvRoom.id) })
        .andWhere('assignedOrder.id != :bookingOrderId', { bookingOrderId: toIdentifier(bookingOrder.id) });
      this.appendOccupiedRange(conflictQuery, 'assignedOrder', assignedRange.rangeStart, assignedRange.rangeEnd);
      const conflictOrder = await conflictQuery.getOne();
      if (isEmpty(conflictOrder) !== true) {
        throw new BusinessException('该时段没有空闲包厢');
      }
      bookingOrder.roomId = toIdentifier(ktvRoom.id);
      bookingOrder.orderStatus = KtvOrderStatus.VERIFIED;
      await entityManager.getRepository(KtvBookingOrder).save(bookingOrder);
    });
  }

  /**
   * 列出这笔待核销订单在该时段还能分配的包厢。
   */
  async listFreeRooms(bookingOrderId: string): Promise<KtvRoom[]> {
    const bookingOrder = await this.ktvBookingOrderRepository.findOne({ where: { id: bookingOrderId } });
    if (isEmpty(bookingOrder)) {
      throw new BusinessException('订单不存在');
    }
    if (bookingOrder.orderStatus !== KtvOrderStatus.PENDING_VERIFY) {
      throw new BusinessException('当前状态不能核销');
    }
    const roomList = await this.ktvRoomRepository.find({
      where: {
        shopId: toIdentifier(bookingOrder.shopId),
        roomTypeId: toIdentifier(bookingOrder.roomTypeId),
        status: RecordStatus.ENABLED,
      },
      order: { roomNo: 'ASC' },
    });
    const occupiedRange = this.resolveBookingRange(
      String(bookingOrder.bookingDate).slice(0, 10),
      String(bookingOrder.startTime).slice(0, 8),
      bookingOrder.durationHours,
    );
    const occupiedQuery = this.ktvBookingOrderRepository
      .createQueryBuilder('bookingOrder')
      .where('bookingOrder.shopId = :shopId', { shopId: toIdentifier(bookingOrder.shopId) })
      .andWhere('bookingOrder.roomId IS NOT NULL');
    this.appendOccupiedRange(occupiedQuery, 'bookingOrder', occupiedRange.rangeStart, occupiedRange.rangeEnd);
    const occupiedOrderList = await occupiedQuery.getMany();
    const occupiedRoomIdSet = new Set(occupiedOrderList.map((occupiedOrder) => toIdentifier(occupiedOrder.roomId)));
    return roomList.filter((room) => occupiedRoomIdSet.has(toIdentifier(room.id)) !== true);
  }

  /**
   * 店内消费。预订必须已核销，消费金额另记一笔扣款。
   */
  async createConsume(bookingOrderId: string, amount: string | number, remark: string, operatorId: string): Promise<KtvConsumeOrder> {
    if (!isPositiveMoney(amount)) {
      throw new BusinessException('消费金额必须大于0');
    }
    return this.dataSource.transaction(async (entityManager) => {
      // 1. 锁定已核销的预订单，避免重复或越店消费
      const bookingOrder = await entityManager
        .getRepository(KtvBookingOrder)
        .createQueryBuilder('bookingOrder')
        .setLock('pessimistic_write')
        .where('bookingOrder.id = :bookingOrderId', { bookingOrderId })
        .getOne();
      if (isEmpty(bookingOrder)) {
        throw new BusinessException('订单不存在');
      }
      if (bookingOrder.orderStatus !== KtvOrderStatus.VERIFIED) {
        throw new BusinessException('订单核销后才能记店内消费');
      }
      // 2. 写入消费单
      const consumeOrder = new KtvConsumeOrder();
      consumeOrder.shopId = toIdentifier(bookingOrder.shopId);
      consumeOrder.orderNo = createBusinessNo(BusinessNoPrefix.KTV_CONSUME);
      consumeOrder.bookingOrderId = toIdentifier(bookingOrder.id);
      consumeOrder.memberId = toIdentifier(bookingOrder.memberId);
      consumeOrder.amount = toMoneyString(amount);
      consumeOrder.orderStatus = KtvConsumeStatus.COMPLETED;
      consumeOrder.remark = isEmpty(remark) ? '' : remark;
      const savedConsumeOrder = await entityManager.getRepository(KtvConsumeOrder).save(consumeOrder);
      // 3. 调用 core 扣减余额
      await this.memberBalanceService.deductBalance({
        entityManager,
        memberId: toIdentifier(bookingOrder.memberId),
        shopId: toIdentifier(bookingOrder.shopId),
        amount: savedConsumeOrder.amount,
        bizType: FinanceBizType.KTV_IN_STORE,
        bizOrderNo: savedConsumeOrder.orderNo,
        operatorId,
        remark: isEmpty(remark) ? 'KTV店内消费' : remark,
      });
      return savedConsumeOrder;
    });
  }

  /**
   * 取消已支付且未完成的预订，并通过 core 退回包厢费。
   */
  async cancelBooking(bookingOrderId: string, operatorId: string): Promise<void> {
    await this.dataSource.transaction(async (entityManager) => {
      // 1. 锁定订单并确认还能退
      const bookingOrder = await entityManager
        .getRepository(KtvBookingOrder)
        .createQueryBuilder('bookingOrder')
        .setLock('pessimistic_write')
        .where('bookingOrder.id = :bookingOrderId', { bookingOrderId })
        .getOne();
      if (isEmpty(bookingOrder)) {
        throw new BusinessException('订单不存在');
      }
      const cancelable = KtvBookingCancelableStatusList.some((orderStatus) => orderStatus === bookingOrder.orderStatus);
      if (cancelable !== true) {
        throw new BusinessException('当前状态不能取消');
      }
      // 2. 先改成已退款，再退余额。任一步失败都会回滚
      bookingOrder.orderStatus = KtvOrderStatus.REFUNDED;
      await entityManager.getRepository(KtvBookingOrder).save(bookingOrder);
      await this.memberBalanceService.refundBalance({
        entityManager,
        memberId: toIdentifier(bookingOrder.memberId),
        shopId: toIdentifier(bookingOrder.shopId),
        amount: bookingOrder.amount,
        bizOrderNo: bookingOrder.orderNo,
        operatorId,
        remark: 'KTV预订取消退款',
      });
    });
  }

  /**
   * 校验包厢类型参数。
   */
  private assertRoomTypeCommand(command: SaveKtvRoomTypeCommand): void {
    if (isEmpty(command.typeName)) {
      throw new BusinessException('包厢类型名称不能为空');
    }
    if (!isPositiveMoney(command.hourlyPrice)) {
      throw new BusinessException('每小时价格必须大于0');
    }
    if (!isOneOf(command.status, Object.values(RecordStatus))) {
      throw new BusinessException('包厢类型状态不正确');
    }
  }

  /**
   * 校验包厢保存参数。
   */
  private assertRoomCommand(command: SaveKtvRoomCommand): void {
    if (!isOneOf(command.status, Object.values(RecordStatus))) {
      throw new BusinessException('包厢状态不正确');
    }
    if (!isNumber(command.capacity) || Number(command.capacity) <= NumberBoundary.ZERO) {
      throw new BusinessException('容纳人数必须大于0');
    }
  }

  /**
   * 新建时排到当前门店最后。没有记录时从 0 开始。
   */
  private async nextSortOrder(repository: Repository<KtvRoomType> | Repository<KtvRoom>): Promise<number> {
    const maxRow = await repository
      .createQueryBuilder('record')
      .select('MAX(record.sortOrder)', 'maxSortOrder')
      .getRawOne<{ maxSortOrder: number | string | null }>();
    if (isEmpty(maxRow) || isEmpty(maxRow.maxSortOrder)) {
      return 0;
    }
    return Number(maxRow.maxSortOrder) + 1;
  }

  /**
   * 核对编号就是当前门店的全部记录，再按数组下标写回排序。
   */
  private async applySortOrder(
    repository: Repository<KtvRoomType> | Repository<KtvRoom>,
    entity: typeof KtvRoomType | typeof KtvRoom,
    idList: string[],
    incompleteMessage: string,
  ): Promise<void> {
    if (isEmpty(idList)) {
      throw new BusinessException(incompleteMessage);
    }
    // 1. 只取当前门店的编号，门店条件由数据权限加上
    const recordList = await repository.find();
    const existingIdSet = new Set(recordList.map((record) => toIdentifier(record.id)));
    if (idList.length !== existingIdSet.size) {
      throw new BusinessException(incompleteMessage);
    }
    // 2. 不能缺、不能多、不能重复
    const seenIdSet = new Set<string>();
    idList.forEach((recordId) => {
      if (existingIdSet.has(recordId) !== true || seenIdSet.has(recordId)) {
        throw new BusinessException(incompleteMessage);
      }
      seenIdSet.add(recordId);
    });
    // 3. 下标就是新的排序
    await this.dataSource.transaction(async (entityManager) => {
      for (let sortOrder = 0; sortOrder < idList.length; sortOrder += 1) {
        await entityManager.update(entity, { id: idList[sortOrder] }, { sortOrder });
      }
    });
  }

  /**
   * 把保存参数写进包厢类型。
   */
  private fillRoomType(ktvRoomType: KtvRoomType, command: SaveKtvRoomTypeCommand): void {
    ktvRoomType.typeName = command.typeName;
    ktvRoomType.hourlyPrice = toMoneyString(command.hourlyPrice);
    ktvRoomType.status = command.status;
  }

  /**
   * 按图片类型得到后缀。不支持的类型直接拒绝。
   */
  private resolveImageExtension(mimetype: string): string {
    if (mimetype === ShopImageMime.JPEG) {
      return '.jpg';
    }
    if (mimetype === ShopImageMime.PNG) {
      return '.png';
    }
    if (mimetype === ShopImageMime.WEBP) {
      return '.webp';
    }
    throw new BusinessException('只支持 jpg、png、webp');
  }

  /**
   * 转成前端使用的图片字段。
   */
  private toImageView(roomTypeImage: KtvRoomTypeImage): KtvRoomTypeImageView {
    return {
      imageId: toIdentifier(roomTypeImage.id),
      imageUrl: roomTypeImage.imageUrl,
    };
  }

  /**
   * 转成带图片列表的包厢类型字段。
   */
  private toRoomTypeView(roomType: KtvRoomType, imageList: KtvRoomTypeImageView[]): KtvRoomTypeView {
    return {
      id: toIdentifier(roomType.id),
      shopId: toIdentifier(roomType.shopId),
      typeName: roomType.typeName,
      hourlyPrice: roomType.hourlyPrice,
      status: roomType.status,
      imageList,
    };
  }

  /**
   * 批量转成带图片列表的包厢类型字段。
   */
  private async toRoomTypeViewList(roomTypeList: KtvRoomType[]): Promise<KtvRoomTypeView[]> {
    const roomTypeIdList = roomTypeList.map((roomType) => toIdentifier(roomType.id));
    const imageList = roomTypeIdList.length === 0 ? [] : await this.ktvRoomTypeImageRepository.find({
      where: { roomTypeId: In(roomTypeIdList) },
      order: { sortOrder: 'ASC', id: 'ASC' },
    });
    return roomTypeList.map((roomType) => {
      const roomTypeId = toIdentifier(roomType.id);
      const roomTypeImageList = imageList
        .filter((roomTypeImage) => toIdentifier(roomTypeImage.roomTypeId) === roomTypeId)
        .map((roomTypeImage) => this.toImageView(roomTypeImage));
      return this.toRoomTypeView(roomType, roomTypeImageList);
    });
  }

  /**
   * 确认包厢类型属于当前门店。数据权限会滤掉其他门店类型。
   */
  private async requireRoomType(roomTypeId: string): Promise<KtvRoomType> {
    const ktvRoomType = await this.ktvRoomTypeRepository.findOne({ where: { id: roomTypeId } });
    if (isEmpty(ktvRoomType)) {
      throw new BusinessException('包厢类型不存在');
    }
    return ktvRoomType;
  }

  /**
   * 把保存参数写进包厢实体。
   */
  private fillRoom(ktvRoom: KtvRoom, command: SaveKtvRoomCommand): void {
    ktvRoom.roomNo = command.roomNo;
    ktvRoom.roomName = command.roomName;
    ktvRoom.roomTypeId = command.roomTypeId;
    ktvRoom.capacity = Number(command.capacity);
    ktvRoom.status = command.status;
  }

  /**
   * 读取当前已校验门店。后台写包厢时不能改用请求体里的门店。
   */
  private requireCurrentShopId(): string {
    const currentShopId = ShopContext.getCurrentShopId();
    if (isEmpty(currentShopId)) {
      throw new BusinessException('请选择门店');
    }
    return currentShopId;
  }

  /**
   * 包厢编号在同一门店重复时给出明确提示。
   */
  private rethrowDuplicateRoom(error: unknown): never {
    if (isDuplicateEntryError(error)) {
      throw new BusinessException('包厢编号已存在');
    }
    throw error;
  }

  /**
   * 生成当前可见范围内不重复的核销码。
   */
  private async createUniqueVerifyCode(entityManager: EntityManager): Promise<string> {
    let retryTimes = NumberBoundary.ZERO;
    while (retryTimes < VerifyCodeRule.MAX_RETRY_TIMES) {
      const verifyCode = createVerifyCode();
      const existedOrder = await entityManager.getRepository(KtvBookingOrder).findOne({ where: { verifyCode } });
      if (isEmpty(existedOrder)) {
        return verifyCode;
      }
      retryTimes += 1;
    }
    throw new BusinessException('核销码生成失败，请重试');
  }

  /**
   * 开唱时间必须是当前时间之后的 8 个半小时刻度之一。
   */
  private assertBookableSlot(bookingDate: string, startTime: string): void {
    const startTimeText = startTime.slice(0, 8);
    const slotList = this.listBookableSlots(new Date());
    const matchedSlot = slotList.find((slot) => slot.bookingDate === bookingDate && slot.startTime === startTimeText);
    if (isEmpty(matchedSlot)) {
      throw new BusinessException('请选择可预约的开唱时间');
    }
  }

  /**
   * 从可预约的第一档开唱时间起，列出全部刻度。
   */
  private listBookableSlots(now: Date): { bookingDate: string; startTime: string }[] {
    const stepMilliseconds = KtvBookingSlot.STEP_MINUTES * 60 * 1000;
    const leadMilliseconds = KtvBookingSlot.LEAD_MINUTES * 60 * 1000;
    // 1. 正好落在刻度上时，这个刻度已经不大于当前时间，再往后推一档
    let nextSlotTime = Math.ceil(now.getTime() / stepMilliseconds) * stepMilliseconds;
    if (nextSlotTime <= now.getTime()) {
      nextSlotTime += stepMilliseconds;
    }
    // 2. 离下一档不足 15 分钟时，从再下一档开始
    if (nextSlotTime - now.getTime() < leadMilliseconds) {
      nextSlotTime += stepMilliseconds;
    }
    // 3. 连续取出 8 个刻度
    const slotList: { bookingDate: string; startTime: string }[] = [];
    for (let slotIndex = 0; slotIndex < KtvBookingSlot.COUNT; slotIndex += 1) {
      const slotTime = new Date(nextSlotTime + slotIndex * stepMilliseconds);
      slotList.push({
        bookingDate: this.formatDate(slotTime),
        startTime: this.formatClockTime(slotTime),
      });
    }
    return slotList;
  }

  /**
   * 格式化成本地日期。
   */
  private formatDate(dateTime: Date): string {
    const monthText = String(dateTime.getMonth() + 1).padStart(2, '0');
    const dayText = String(dateTime.getDate()).padStart(2, '0');
    return `${dateTime.getFullYear()}-${monthText}-${dayText}`;
  }

  /**
   * 格式化成本地钟点，秒固定为 0。
   */
  private formatClockTime(dateTime: Date): string {
    const hourText = String(dateTime.getHours()).padStart(2, '0');
    const minuteText = String(dateTime.getMinutes()).padStart(2, '0');
    return `${hourText}:${minuteText}:00`;
  }

  /**
   * 用开唱日期、开唱时间和小时数算出占用区间。结束钟点可以落到第二天。
   */
  private resolveBookingRange(bookingDate: string, startTime: string, durationHours: number): {
    rangeStart: string;
    rangeEnd: string;
    endTime: string;
  } {
    const datePartList = bookingDate.split('-').map((datePart) => Number(datePart));
    const timePartList = startTime.split(':').map((timePart) => Number(timePart));
    const startAt = new Date(datePartList[0], datePartList[1] - 1, datePartList[2], timePartList[0], timePartList[1], timePartList[2] || 0);
    const endAt = new Date(startAt.getTime());
    endAt.setHours(endAt.getHours() + durationHours);
    return {
      rangeStart: this.formatDateTime(startAt),
      rangeEnd: this.formatDateTime(endAt),
      endTime: `${String(endAt.getHours()).padStart(2, '0')}:${String(endAt.getMinutes()).padStart(2, '0')}:${String(endAt.getSeconds()).padStart(2, '0')}`,
    };
  }

  /**
   * 格式化成本地日期时间，供区间比较使用。
   */
  private formatDateTime(dateTime: Date): string {
    const monthText = String(dateTime.getMonth() + 1).padStart(2, '0');
    const dayText = String(dateTime.getDate()).padStart(2, '0');
    const hourText = String(dateTime.getHours()).padStart(2, '0');
    const minuteText = String(dateTime.getMinutes()).padStart(2, '0');
    const secondText = String(dateTime.getSeconds()).padStart(2, '0');
    return `${dateTime.getFullYear()}-${monthText}-${dayText} ${hourText}:${minuteText}:${secondText}`;
  }

  /**
   * 给查询加上有效订单的时段相交条件。区间按开唱时刻加小时数计算，不限制在同一天。
   */
  private appendOccupiedRange(queryBuilder: SelectQueryBuilder<KtvBookingOrder>, aliasName: string, rangeStart: string, rangeEnd: string): void {
    queryBuilder
      .andWhere(`${aliasName}.orderStatus IN (:...activeStatusList)`, { activeStatusList: KtvBookingActiveStatusList })
      .andWhere(`TIMESTAMP(${aliasName}.bookingDate, ${aliasName}.startTime) < :rangeEnd`, { rangeEnd })
      .andWhere(`DATE_ADD(TIMESTAMP(${aliasName}.bookingDate, ${aliasName}.startTime), INTERVAL ${aliasName}.durationHours HOUR) > :rangeStart`, { rangeStart });
  }

  /**
   * 给订单补上包厢和会员展示字段。
   */
  private async toBookingViewList(bookingOrderList: KtvBookingOrder[]): Promise<KtvBookingOrderView[]> {
    if (bookingOrderList.length === 0) {
      return [];
    }
    const roomIdList = bookingOrderList
      .map((bookingOrder) => toIdentifier(bookingOrder.roomId))
      .filter((roomId) => isEmpty(roomId) !== true);
    const roomTypeIdList = bookingOrderList.map((bookingOrder) => toIdentifier(bookingOrder.roomTypeId));
    const memberIdList = bookingOrderList.map((bookingOrder) => toIdentifier(bookingOrder.memberId));
    const roomList = roomIdList.length === 0 ? [] : await this.ktvRoomRepository.find({ where: { id: In(roomIdList) } });
    const roomTypeList = await this.ktvRoomTypeRepository.find({ where: { id: In(roomTypeIdList) } });
    const memberAccountList = await this.memberQueryService.findByIdList(memberIdList);
    return bookingOrderList.map((bookingOrder) => {
      const ktvRoom = roomList.find((room) => toIdentifier(room.id) === toIdentifier(bookingOrder.roomId));
      const ktvRoomType = roomTypeList.find((roomType) => toIdentifier(roomType.id) === toIdentifier(bookingOrder.roomTypeId));
      const memberAccount = memberAccountList.find((member) => toIdentifier(member.id) === toIdentifier(bookingOrder.memberId));
      return {
        bookingOrderId: toIdentifier(bookingOrder.id),
        shopId: toIdentifier(bookingOrder.shopId),
        orderNo: bookingOrder.orderNo,
        memberId: toIdentifier(bookingOrder.memberId),
        memberName: isEmpty(memberAccount) ? '' : memberAccount.memberName,
        mobile: isEmpty(memberAccount) ? '' : memberAccount.mobile,
        roomTypeId: toIdentifier(bookingOrder.roomTypeId),
        roomTypeName: isEmpty(ktvRoomType) ? '' : ktvRoomType.typeName,
        roomId: toIdentifier(bookingOrder.roomId),
        roomNo: isEmpty(ktvRoom) ? '' : ktvRoom.roomNo,
        roomName: isEmpty(ktvRoom) ? '' : ktvRoom.roomName,
        bookingDate: String(bookingOrder.bookingDate).slice(0, 10),
        startTime: String(bookingOrder.startTime).slice(0, 8),
        endTime: String(bookingOrder.endTime).slice(0, 8),
        durationHours: bookingOrder.durationHours,
        amount: bookingOrder.amount,
        orderStatus: bookingOrder.orderStatus,
        verifyCode: bookingOrder.verifyCode,
        createdAt: bookingOrder.createdAt,
      };
    });
  }
}
