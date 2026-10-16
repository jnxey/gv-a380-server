import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, FindOptionsWhere, In, Repository } from 'typeorm';
import {
  BusinessNoPrefix,
  FinanceBizType,
  KtvBookingActiveStatusList,
  KtvBookingCancelableStatusList,
  KtvConsumeStatus,
  KtvOrderStatus,
  PageSetting,
  RecordStatus,
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
import { KtvBookingOrder, KtvConsumeOrder, KtvRoom, KtvRoomType } from './ktv.entities';

/**
 * 小程序创建 KTV 预订的入参。门店和包厢都会在服务端再次核对归属。
 */
export interface CreateKtvBookingCommand {
  shopId: string;
  roomId: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
}

/**
 * 后台保存包厢类型的入参。门店取当前上下文。
 */
export interface SaveKtvRoomTypeCommand {
  typeName: string;
  status: string;
}

/**
 * 后台保存包厢的入参。门店取当前上下文，不使用调用方传入的门店。
 */
export interface SaveKtvRoomCommand {
  roomNo: string;
  roomName: string;
  roomTypeId: string;
  capacity: number;
  price: string | number;
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
  roomId: string;
  roomNo: string;
  roomName: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
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
   * 后台分页查询当前门店包厢类型。
   */
  async pageRoomTypes(pageValue: unknown, pageSizeValue: unknown): Promise<PageResult<KtvRoomType>> {
    const pageResult = resolvePage(pageValue, pageSizeValue);
    const [list, total] = await this.ktvRoomTypeRepository.findAndCount({
      order: { id: 'DESC' },
      skip: pageResult.skip,
      take: pageResult.pageSize,
    });
    return { list, total, page: pageResult.page, pageSize: pageResult.pageSize };
  }

  /**
   * 新建当前门店包厢类型。
   */
  async createRoomType(command: SaveKtvRoomTypeCommand): Promise<KtvRoomType> {
    this.assertRoomTypeCommand(command);
    const ktvRoomType = new KtvRoomType();
    ktvRoomType.shopId = this.requireCurrentShopId();
    this.fillRoomType(ktvRoomType, command);
    return this.ktvRoomTypeRepository.save(ktvRoomType);
  }

  /**
   * 修改当前门店包厢类型。
   */
  async updateRoomType(roomTypeId: string, command: SaveKtvRoomTypeCommand): Promise<KtvRoomType> {
    this.assertRoomTypeCommand(command);
    const ktvRoomType = await this.ktvRoomTypeRepository.findOne({ where: { id: roomTypeId } });
    if (isEmpty(ktvRoomType)) {
      throw new BusinessException('包厢类型不存在');
    }
    this.fillRoomType(ktvRoomType, command);
    return this.ktvRoomTypeRepository.save(ktvRoomType);
  }

  /**
   * 查询当前门店全部包厢。
   */
  async pageRooms(): Promise<PageResult<KtvRoom>> {
    const list = await this.ktvRoomRepository.find({
      order: { id: 'DESC' },
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
   * 新建当前门店的包厢。
   */
  async createRoom(command: SaveKtvRoomCommand): Promise<KtvRoom> {
    this.assertRoomCommand(command);
    const currentShopId = this.requireCurrentShopId();
    await this.requireRoomType(command.roomTypeId);
    const ktvRoom = new KtvRoom();
    ktvRoom.shopId = currentShopId;
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
   * 创建预订订单，并在同一事务内扣减会员余额。
   */
  async createBooking(memberId: string, command: CreateKtvBookingCommand): Promise<KtvBookingOrder> {
    if (command.startTime >= command.endTime) {
      throw new BusinessException('结束时间必须晚于开始时间');
    }
    return this.dataSource.transaction(async (entityManager) => {
      // 1. 校验门店真实存在且为启用中的 KTV，不以请求里的门店文本直接落库
      const shop = await this.shopService.findEnabledShopInManager(entityManager, command.shopId, ShopType.KTV);
      const shopId = toIdentifier(shop.id);
      // 2. 锁定包厢，确认它属于该门店且仍在售
      const ktvRoom = await entityManager
        .getRepository(KtvRoom)
        .createQueryBuilder('ktvRoom')
        .setLock('pessimistic_write')
        .where('ktvRoom.id = :roomId', { roomId: command.roomId })
        .andWhere('ktvRoom.shopId = :shopId', { shopId })
        .getOne();
      if (isEmpty(ktvRoom) || ktvRoom.status !== RecordStatus.ENABLED) {
        throw new BusinessException('包厢不存在或已停用');
      }
      // 3. 同一包厢、同一天的有效订单时段不能重叠
      const conflictOrder = await entityManager
        .getRepository(KtvBookingOrder)
        .createQueryBuilder('bookingOrder')
        .setLock('pessimistic_write')
        .where('bookingOrder.shopId = :shopId', { shopId })
        .andWhere('bookingOrder.roomId = :roomId', { roomId: toIdentifier(ktvRoom.id) })
        .andWhere('bookingOrder.bookingDate = :bookingDate', { bookingDate: command.bookingDate })
        .andWhere('bookingOrder.orderStatus IN (:...activeStatusList)', { activeStatusList: KtvBookingActiveStatusList })
        .andWhere('bookingOrder.startTime < :endTime', { endTime: command.endTime })
        .andWhere('bookingOrder.endTime > :startTime', { startTime: command.startTime })
        .getOne();
      if (!isEmpty(conflictOrder)) {
        throw new BusinessException('该时段包厢已被预订');
      }
      // 4. 写入待核销订单，金额等于包厢价格
      const bookingOrder = new KtvBookingOrder();
      bookingOrder.shopId = shopId;
      bookingOrder.orderNo = createBusinessNo(BusinessNoPrefix.KTV_BOOKING);
      bookingOrder.memberId = memberId;
      bookingOrder.roomId = toIdentifier(ktvRoom.id);
      bookingOrder.bookingDate = command.bookingDate;
      bookingOrder.startTime = command.startTime;
      bookingOrder.endTime = command.endTime;
      bookingOrder.amount = toMoneyString(ktvRoom.price);
      bookingOrder.orderStatus = KtvOrderStatus.PENDING_VERIFY;
      bookingOrder.verifyCode = await this.createUniqueVerifyCode(entityManager);
      const savedOrder = await entityManager.getRepository(KtvBookingOrder).save(bookingOrder);
      // 5. 调用 core 扣余额。失败会连同订单一起回滚
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
      // 6. 通知会员预订结果
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
   * 到店核销。只改状态，不再次扣包厢费。
   */
  async verifyBooking(bookingOrderId: string): Promise<void> {
    const bookingOrder = await this.ktvBookingOrderRepository.findOne({ where: { id: bookingOrderId } });
    if (isEmpty(bookingOrder)) {
      throw new BusinessException('订单不存在');
    }
    if (bookingOrder.orderStatus !== KtvOrderStatus.PENDING_VERIFY) {
      throw new BusinessException('当前状态不能核销');
    }
    bookingOrder.orderStatus = KtvOrderStatus.VERIFIED;
    await this.ktvBookingOrderRepository.save(bookingOrder);
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
    if (!isPositiveMoney(command.price)) {
      throw new BusinessException('包厢价格必须大于0');
    }
  }

  /**
   * 把保存参数写进包厢类型。
   */
  private fillRoomType(ktvRoomType: KtvRoomType, command: SaveKtvRoomTypeCommand): void {
    ktvRoomType.typeName = command.typeName;
    ktvRoomType.status = command.status;
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
    ktvRoom.price = toMoneyString(command.price);
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
   * 给订单补上包厢和会员展示字段。
   */
  private async toBookingViewList(bookingOrderList: KtvBookingOrder[]): Promise<KtvBookingOrderView[]> {
    if (bookingOrderList.length === 0) {
      return [];
    }
    const roomIdList = bookingOrderList.map((bookingOrder) => toIdentifier(bookingOrder.roomId));
    const memberIdList = bookingOrderList.map((bookingOrder) => toIdentifier(bookingOrder.memberId));
    const roomList = await this.ktvRoomRepository.find({ where: { id: In(roomIdList) } });
    const memberAccountList = await this.memberQueryService.findByIdList(memberIdList);
    return bookingOrderList.map((bookingOrder) => {
      const ktvRoom = roomList.find((room) => toIdentifier(room.id) === toIdentifier(bookingOrder.roomId));
      const memberAccount = memberAccountList.find((member) => toIdentifier(member.id) === toIdentifier(bookingOrder.memberId));
      return {
        bookingOrderId: toIdentifier(bookingOrder.id),
        shopId: toIdentifier(bookingOrder.shopId),
        orderNo: bookingOrder.orderNo,
        memberId: toIdentifier(bookingOrder.memberId),
        memberName: isEmpty(memberAccount) ? '' : memberAccount.memberName,
        mobile: isEmpty(memberAccount) ? '' : memberAccount.mobile,
        roomId: toIdentifier(bookingOrder.roomId),
        roomNo: isEmpty(ktvRoom) ? '' : ktvRoom.roomNo,
        roomName: isEmpty(ktvRoom) ? '' : ktvRoom.roomName,
        bookingDate: String(bookingOrder.bookingDate).slice(0, 10),
        startTime: String(bookingOrder.startTime).slice(0, 8),
        endTime: String(bookingOrder.endTime).slice(0, 8),
        amount: bookingOrder.amount,
        orderStatus: bookingOrder.orderStatus,
        verifyCode: bookingOrder.verifyCode,
        createdAt: bookingOrder.createdAt,
      };
    });
  }
}
