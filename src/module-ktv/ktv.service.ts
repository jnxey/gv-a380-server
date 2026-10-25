import { randomUUID } from 'crypto';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { join } from 'path';
import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import Decimal from 'decimal.js';
import { DataSource, EntityManager, FindOptionsWhere, In, Repository, SelectQueryBuilder, Between } from 'typeorm';
import {
  BusinessNoPrefix,
  DetailDescriptionLimit,
  FinanceBizType,
  KtvBookingActiveStatusList,
  KtvBookingCancelableStatusList,
  HotelWalkInContact,
  KtvBookingHour,
  KtvOccupyDuration,
  KtvBookingSlot,
  KtvConsumeStatus,
  KtvRoomStatus,
  KtvOrderStatus,
  KtvPendingVerifyWindow,
  MemberBookingCancelLead,
  PageSetting,
  ShopPayQr,
  RecordStatus,
  ShopImageLimit,
  ShopImageMime,
  ShopType,
  TimeSpan,
  UploadSetting,
  VerifyCodeRule,
  NumberBoundary,
} from '../common/constants';
import { ShopContext } from '../common/context/shop-context';
import { MiniappSignService } from '../common/crypto/miniapp-sign.service';
import { BusinessException } from '../common/exceptions/business.exception';
import { PageResult } from '../common/interfaces/page-result';
import { createBusinessNo, createVerifyCode, isDuplicateEntryError, isEmpty, isNumber, isOneOf, isPositiveMoney, resolvePage, toIdentifier, toMoneyString } from '../common/tools';
import { SimOrm } from '../common/tools/sim-orm';
import { MemberBalanceService } from '../core/member/member-balance.service';
import { ChatUserClient } from '../core/member/chat-user.client';
import { MemberQueryService } from '../core/member/member-query.service';
import { NotifyService } from '../core/notify/notify.service';
import { Shop } from '../core/shop/shop.entity';
import { ShopService } from '../core/shop/shop.service';
import { KtvBookingOrder, KtvConsumeOrder, KtvRoom, KtvRoomType, KtvRoomTypeDescription, KtvRoomTypeImage } from './ktv.entities';

/**
 * 小程序创建 KTV 预订的入参。只选包厢类型，具体包厢到店再分配。
 */
export interface CreateKtvBookingCommand {
  shopId: string;
  roomTypeId: string;
  bookingDate: string;
  startTime: string;
  durationHours: number;
  guestName: string;
  contact: string;
  cipherText: string;
}

/**
 * 后台保存包厢类型的入参。门店取当前上下文。
 */
export interface SaveKtvRoomTypeCommand {
  typeName: string;
  description?: Partial<KtvRoomTypeDescription>;
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
  description: KtvRoomTypeDescription;
  hourlyPrice: string;
  status: string;
  /** 挂在该类型下的包厢数量。 */
  roomCount: number;
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
  username: string;
  guestName: string;
  contact: string;
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
  canCancel: boolean;
  createdAt: string;
}

/**
 * KTV 包厢、预订、核销、店内消费和取消退款。
 */
/** 订单创建时间筛选只接受年月日。 */
const OrderDateTextPattern = /^\d{4}-\d{2}-\d{2}$/;

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
    private readonly chatUserClient: ChatUserClient,
    private readonly miniappSignService: MiniappSignService,
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
    const directoryPath = join(UploadSetting.DISK_ROOT, 'ktv-room-type', roomTypeIdValue);
    await mkdir(directoryPath, { recursive: true });
    await writeFile(join(directoryPath, fileName), file.buffer);
    const roomTypeImage = new KtvRoomTypeImage();
    roomTypeImage.roomTypeId = roomTypeIdValue;
    roomTypeImage.imageUrl = `${UploadSetting.URL_PREFIX}/ktv-room-type/${roomTypeIdValue}/${fileName}`;
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
    const filePath = join(UploadSetting.DISK_ROOT, 'ktv-room-type', roomTypeIdValue, fileName);
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
   * 按传入顺序重排包厢类型图片。第一张是封面。必须正好是该类型现有全部图片。
   */
  async sortRoomTypeImages(roomTypeId: string, imageIdList: string[]): Promise<void> {
    await this.requireRoomType(roomTypeId);
    const roomTypeIdValue = toIdentifier(roomTypeId);
    const cleanedIdList = imageIdList.map((imageId) => toIdentifier(imageId));
    if (isEmpty(cleanedIdList)) {
      throw new BusinessException('请选择图片');
    }
    const roomTypeImageList = await this.ktvRoomTypeImageRepository.find({
      where: { roomTypeId: roomTypeIdValue },
      order: { sortOrder: 'ASC', id: 'ASC' },
    });
    if (roomTypeImageList.length !== cleanedIdList.length) {
      throw new BusinessException('图片列表已变化，请刷新后重试');
    }
    const roomTypeImageById = new Map<string, KtvRoomTypeImage>();
    for (const roomTypeImage of roomTypeImageList) {
      roomTypeImageById.set(toIdentifier(roomTypeImage.id), roomTypeImage);
    }
    for (const imageId of cleanedIdList) {
      if (isEmpty(roomTypeImageById.get(imageId))) {
        throw new BusinessException('包厢类型图片不存在');
      }
    }
    // 1. 按新顺序写回 sortOrder，第一张作为封面
    for (let sortOrder = 0; sortOrder < cleanedIdList.length; sortOrder += 1) {
      await this.ktvRoomTypeImageRepository.update({ id: cleanedIdList[sortOrder], roomTypeId: roomTypeIdValue }, { sortOrder });
    }
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
   * 小程序按门店查询可预订的包厢类型。没有空闲包厢的类型不返回，结果带上类型图片。
   */
  async listEnabledRoomTypes(shopId: string): Promise<KtvRoomTypeView[]> {
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
        roomStatus: KtvRoomStatus.IDLE,
      },
    });
    const bookableRoomTypeIdSet = new Set(enabledRoomList.map((room) => toIdentifier(room.roomTypeId)));
    const bookableRoomTypeList = roomTypeList.filter((roomType) => bookableRoomTypeIdSet.has(toIdentifier(roomType.id)));
    return this.toRoomTypeViewList(bookableRoomTypeList);
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
    ktvRoom.roomStatus = KtvRoomStatus.IDLE;
    ktvRoom.occupyExtendHours = 0;
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
   * 手动切换包厢运营状态。使用中只允许从空闲开包厢写入，并记下结束时间。
   * 离开使用中时，同房已核销订单改为待评价。
   */
  async updateRoomStatus(roomId: string, roomStatus: string, durationHours?: number): Promise<void> {
    if (!isOneOf(roomStatus, Object.values(KtvRoomStatus))) {
      throw new BusinessException('包厢状态不正确');
    }
    await SimOrm.transaction(this.dataSource, async (entityManager) => {
      const ktvRoom = await entityManager
        .getRepository(KtvRoom)
        .createQueryBuilder('ktvRoom')
        .setLock('pessimistic_write')
        .where('ktvRoom.id = :roomId', { roomId })
        .getOne();
      if (isEmpty(ktvRoom)) {
        throw new BusinessException('包厢不存在');
      }
      if (roomStatus === KtvRoomStatus.IN_USE && ktvRoom.roomStatus !== KtvRoomStatus.IDLE) {
        throw new BusinessException('只有空闲包厢可以开包厢');
      }
      const wasInUse = ktvRoom.roomStatus === KtvRoomStatus.IN_USE;
      // 1. 开成使用中必须选列表里的演唱小时，结束时间从现在起算
      if (roomStatus === KtvRoomStatus.IN_USE) {
        const durationHourCount = Number(durationHours);
        const durationHourMatched = KtvOccupyDuration.HOUR_LIST.some((hourCount) => hourCount === durationHourCount);
        if (!isNumber(durationHours) || !Number.isInteger(durationHourCount) || !durationHourMatched) {
          throw new BusinessException(`请选择${KtvOccupyDuration.HOUR_LIST.join('、')}小时`);
        }
        const endAt = new Date();
        endAt.setHours(endAt.getHours() + durationHourCount);
        ktvRoom.occupyEndAt = this.formatDateTime(endAt);
        ktvRoom.occupyExtendHours = 0;
      } else {
        // 2. 离开使用中后不再提醒到点，累计延长也清掉
        ktvRoom.occupyEndAt = null;
        ktvRoom.occupyExtendHours = 0;
      }
      ktvRoom.roomStatus = roomStatus;
      await entityManager.getRepository(KtvRoom).save(ktvRoom);
      // 3. 从使用中离开时，把该包厢已核销预订改成待评价
      if (wasInUse === true && roomStatus !== KtvRoomStatus.IN_USE) {
        await this.markVerifiedBookingPendingReview(entityManager, toIdentifier(ktvRoom.id));
      }
    });
  }

  /**
   * 包厢结束使用后，把同房最新一笔已核销订单改成待评价。
   */
  private async markVerifiedBookingPendingReview(entityManager: EntityManager, roomId: string): Promise<void> {
    const bookingOrder = await entityManager
      .getRepository(KtvBookingOrder)
      .createQueryBuilder('bookingOrder')
      .setLock('pessimistic_write')
      .where('bookingOrder.roomId = :roomId', { roomId })
      .andWhere('bookingOrder.orderStatus = :orderStatus', { orderStatus: KtvOrderStatus.VERIFIED })
      .orderBy('bookingOrder.id', 'DESC')
      .getOne();
    if (isEmpty(bookingOrder)) {
      return;
    }
    bookingOrder.orderStatus = KtvOrderStatus.PENDING_REVIEW;
    await entityManager.getRepository(KtvBookingOrder).save(bookingOrder);
  }

  /**
   * 延长使用中包厢的结束时间，并累加延长小时。每次只加 1 小时。
   */
  async extendOccupy(roomId: string, durationHours: number): Promise<void> {
    const durationHourCount = Number(durationHours);
    if (!isNumber(durationHours) || durationHourCount !== KtvOccupyDuration.EXTEND_HOURS) {
      throw new BusinessException(`每次只能延长${KtvOccupyDuration.EXTEND_HOURS}小时`);
    }
    const ktvRoom = await this.ktvRoomRepository.findOne({ where: { id: roomId } });
    if (isEmpty(ktvRoom)) {
      throw new BusinessException('包厢不存在');
    }
    if (ktvRoom.roomStatus !== KtvRoomStatus.IN_USE) {
      throw new BusinessException('只有使用中的包厢可以延长');
    }
    // 1. 结束时间从当前到期时刻往后加；没有到期时刻时从现在起算。读出来是 Date，不能当字符串裁剪
    const occupyEndValue: unknown = ktvRoom.occupyEndAt;
    let occupyEndAt = new Date();
    if (isEmpty(occupyEndValue) !== true) {
      if (occupyEndValue instanceof Date) {
        occupyEndAt = new Date(occupyEndValue.getTime());
      } else {
        const occupyEndText = String(occupyEndValue).trim();
        occupyEndAt = new Date(occupyEndText.replace(' ', 'T'));
      }
    }
    if (Number.isNaN(occupyEndAt.getTime())) {
      throw new BusinessException('包厢结束时间不正确');
    }
    occupyEndAt.setHours(occupyEndAt.getHours() + durationHourCount);
    ktvRoom.occupyEndAt = this.formatDateTime(occupyEndAt);
    // 2. 累计延长小时，页面只显示这个总数
    const currentExtendHours = Number(ktvRoom.occupyExtendHours);
    const extendHourBase = Number.isInteger(currentExtendHours) ? currentExtendHours : 0;
    ktvRoom.occupyExtendHours = extendHourBase + durationHourCount;
    await this.ktvRoomRepository.save(ktvRoom);
  }

  /**
   * 按拖动结果重排当前门店的全部包厢。
   */
  async sortRooms(idList: string[]): Promise<void> {
    await this.applySortOrder(this.ktvRoomRepository, KtvRoom, idList, '包厢排序不完整');
  }

  /**
   * 按用户名、手机号或邮箱找到余额账户。聊天里没有这个人，或还没有余额账户，都算没有找到会员。
   */
  async findMemberByKeyword(keyword: string) {
    await this.requireEnabledKtvShop();
    const cleanedKeyword = keyword.trim();
    if (isEmpty(cleanedKeyword)) {
      throw new BusinessException('没有找到会员');
    }
    let username = '';
    try {
      const chatUserProfile = await this.chatUserClient.findByKeyword(cleanedKeyword);
      username = chatUserProfile.username;
    } catch (error) {
      if (this.readBusinessMessage(error) === '未找到该用户') {
        throw new BusinessException('没有找到会员');
      }
      throw error;
    }
    return this.requireMemberByUsername(username);
  }

  /**
   * 解开付款/充值二维码，再按里面的用户名找到余额账户。
   */
  async findMemberByPayQr(cipherText: string) {
    await this.requireEnabledKtvShop();
    const username = this.miniappSignService.readPayRechargeUsername(cipherText);
    return this.requireMemberByUsername(username);
  }

  /**
   * 按当前 KTV 门店从会员余额付款，并返回付完后的会员资料。不关联预订单。
   */
  async deductMemberBalance(memberId: string, amount: string | number, remark: string, operatorId: string) {
    if (!isPositiveMoney(amount)) {
      throw new BusinessException('付款金额必须大于0');
    }
    const shopId = await this.requireEnabledKtvShop();
    const cleanedRemark = remark.trim();
    await SimOrm.transaction(this.dataSource, async (entityManager) => {
      await this.memberBalanceService.deductBalance({
        entityManager,
        memberId,
        shopId,
        amount: toMoneyString(amount),
        bizType: FinanceBizType.KTV_IN_STORE,
        bizOrderNo: '',
        operatorId,
        remark: isEmpty(cleanedRemark) ? 'KTV付款' : cleanedRemark,
      });
    });
    const memberAccount = await this.memberQueryService.findById(memberId);
    if (isEmpty(memberAccount)) {
      throw new BusinessException('没有找到会员');
    }
    return this.memberQueryService.toMemberView(memberAccount);
  }

  /**
   * 会员扫门店收款码付款。校验安全密钥后，按该门店扣余额。
   */
  async payByShopQr(memberId: string, shopPayCode: string, amount: string | number, securityKeyCipher: string): Promise<{ shopName: string; amount: string }> {
    // 1. 金额必须大于 0
    if (!isPositiveMoney(amount)) {
      throw new BusinessException('扣款金额必须大于0');
    }
    // 2. 收款码必须以 GP_ 开头，后面是门店编码
    const trimmedShopPayCode = shopPayCode.trim();
    if (!trimmedShopPayCode.startsWith(ShopPayQr.PREFIX)) {
      throw new BusinessException('请扫描门店收款码');
    }
    const shopCode = trimmedShopPayCode.slice(ShopPayQr.PREFIX.length).trim();
    if (isEmpty(shopCode)) {
      throw new BusinessException('请扫描门店收款码');
    }
    // 3. 安全密钥必须属于当前会员
    const securityKeyUsername = this.miniappSignService.readConsumerDoorLockUsername(securityKeyCipher);
    const memberAccount = await this.memberQueryService.findById(memberId);
    if (isEmpty(memberAccount) || memberAccount.username !== securityKeyUsername) {
      throw new BusinessException('安全密钥无效');
    }
    // 4. 门店必须存在且启用
    await this.shopService.findEnabledShopByCode(shopCode);
    const paidAmount = toMoneyString(amount);
    // 5. 事务内再次确认门店仍启用，再扣余额
    const paidShop = await SimOrm.transaction(this.dataSource, async (entityManager) => {
      const shop = await this.shopService.findEnabledShopByCodeInManager(entityManager, shopCode);
      await this.memberBalanceService.deductBalance({
        entityManager,
        memberId,
        shopId: toIdentifier(shop.id),
        amount: paidAmount,
        bizType: FinanceBizType.SHOP_SCAN_PAY,
        bizOrderNo: '',
        operatorId: null,
        remark: ShopPayQr.REMARK,
      });
      return shop;
    });
    return { shopName: paidShop.shopName, amount: paidAmount };
  }

  /**
   * 当前请求必须选中一家启用中的 KTV。
   */
  private async requireEnabledKtvShop(): Promise<string> {
    const shopId = ShopContext.getCurrentShopId();
    if (isEmpty(shopId)) {
      throw new BusinessException('请选择门店后再付款');
    }
    const shop = await this.shopService.findEnabledShop(shopId, ShopType.KTV);
    return toIdentifier(shop.id);
  }

  /**
   * 按用户名读取余额账户。没有则拒绝。
   */
  private async requireMemberByUsername(username: string) {
    const memberAccount = await this.memberQueryService.findByUsername(username);
    if (isEmpty(memberAccount)) {
      throw new BusinessException('没有找到会员');
    }
    return this.memberQueryService.toMemberView(memberAccount);
  }

  /**
   * 取出业务异常上的中文提示。不是业务异常时返回空。
   */
  private readBusinessMessage(error: unknown): string {
    if (!(error instanceof BusinessException)) {
      return '';
    }
    const response = error.getResponse();
    if (typeof response === 'string') {
      return response;
    }
    if (typeof response === 'object' && response !== null && 'message' in response && typeof response.message === 'string') {
      return response.message;
    }
    return '';
  }

  /**
   * 创建预订订单，并在同一事务内扣减会员余额。
   */
  async createBooking(memberId: string, command: CreateKtvBookingCommand): Promise<KtvBookingOrder> {
    const durationHours = Number(command.durationHours);
    if (Number.isInteger(durationHours) !== true || durationHours < KtvBookingHour.MIN || durationHours > KtvBookingHour.MAX) {
      throw new BusinessException('演唱小时数必须在1到24之间');
    }
    // 预定人和联系方式去空白后不能空，也不能超过订单字段长度
    const guestNameText = isEmpty(command.guestName) ? '' : command.guestName.trim();
    const contactText = isEmpty(command.contact) ? '' : command.contact.trim();
    if (isEmpty(guestNameText)) {
      throw new BusinessException('请填写预定人');
    }
    if (isEmpty(contactText)) {
      throw new BusinessException('请填写联系方式');
    }
    if (guestNameText.length > HotelWalkInContact.MAX_LENGTH) {
      throw new BusinessException('预定人过长');
    }
    if (contactText.length > HotelWalkInContact.MAX_LENGTH) {
      throw new BusinessException('联系方式过长');
    }
    const enabledShop = await this.shopService.findEnabledShop(command.shopId, ShopType.KTV);
    this.assertBookableSlot(enabledShop, command.bookingDate, command.startTime);
    const bookingRange = this.resolveBookingRange(command.bookingDate, command.startTime, durationHours);
    const securityKeyUsername = this.miniappSignService.readConsumerDoorLockUsername(command.cipherText);
    const memberAccount = await this.memberQueryService.findById(memberId);
    if (isEmpty(memberAccount) || memberAccount.username !== securityKeyUsername) {
      throw new BusinessException('安全密钥无效');
    }
    return SimOrm.transaction(this.dataSource, async (entityManager) => {
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
      // 3. 可售数量只数该类型启用且空闲的包厢。一间都没有时，不是时段订满
      const enabledRoomList = await entityManager.getRepository(KtvRoom).find({
        where: { shopId, roomTypeId, status: RecordStatus.ENABLED, roomStatus: KtvRoomStatus.IDLE },
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
      // 5. 先写入待支付订单占时段，先不分配具体包厢。金额等于每小时价格乘以小时数
      const bookingOrder = new KtvBookingOrder();
      bookingOrder.shopId = shopId;
      bookingOrder.orderNo = createBusinessNo(BusinessNoPrefix.KTV_BOOKING);
      bookingOrder.memberId = memberId;
      bookingOrder.guestName = guestNameText;
      bookingOrder.contact = contactText;
      bookingOrder.roomTypeId = roomTypeId;
      bookingOrder.roomId = null;
      bookingOrder.bookingDate = command.bookingDate;
      bookingOrder.startTime = command.startTime;
      bookingOrder.endTime = bookingRange.endTime;
      bookingOrder.durationHours = durationHours;
      bookingOrder.amount = toMoneyString(new Decimal(ktvRoomType.hourlyPrice).times(durationHours));
      bookingOrder.orderStatus = KtvOrderStatus.PENDING_PAY;
      bookingOrder.verifyCode = await this.createUniqueVerifyCode(entityManager);
      const savedOrder = await entityManager.getRepository(KtvBookingOrder).save(bookingOrder);
      // 6. 本平台余额支付：扣款成功后进入待核销。以后接外部支付时，在回调里再改成待核销
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
      savedOrder.orderStatus = KtvOrderStatus.PENDING_VERIFY;
      await entityManager.getRepository(KtvBookingOrder).save(savedOrder);
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
   * 把开始、结束日期收成当天的起止时间。都不传则不限时间。
   */
  private resolveOrderTimeRange(startDate: string, endDate: string): { startAt: string; endAt: string } | null {
    const cleanedStartDate = isEmpty(startDate) ? '' : startDate.trim();
    const cleanedEndDate = isEmpty(endDate) ? '' : endDate.trim();
    if (isEmpty(cleanedStartDate) && isEmpty(cleanedEndDate)) {
      return null;
    }
    if (isEmpty(cleanedStartDate) || isEmpty(cleanedEndDate)) {
      throw new BusinessException('请选择完整的时间范围');
    }
    if (OrderDateTextPattern.test(cleanedStartDate) !== true || OrderDateTextPattern.test(cleanedEndDate) !== true) {
      throw new BusinessException('时间范围不正确');
    }
    if (cleanedEndDate < cleanedStartDate) {
      throw new BusinessException('结束日期不能早于开始日期');
    }
    return {
      startAt: `${cleanedStartDate} 00:00:00`,
      endAt: `${cleanedEndDate} 23:59:59`,
    };
  }

  /**
   * 后台分页查询当前门店预订订单。传入订单状态时只查该状态。传入近期小时数时，只留开唱时间落在现在前后这个小时数内的订单。
   */
  async pageBookingOrders(
    verifyCode: string,
    orderStatus: string,
    recentHours: number | undefined,
    pageValue: unknown,
    pageSizeValue: unknown,
    startDate: string,
    endDate: string,
  ): Promise<PageResult<KtvBookingOrderView>> {
    const pageResult = resolvePage(pageValue, pageSizeValue);
    if (isEmpty(recentHours)) {
      const whereCondition: FindOptionsWhere<KtvBookingOrder> = {};
      if (!isEmpty(verifyCode)) {
        whereCondition.verifyCode = verifyCode;
      }
      if (!isEmpty(orderStatus)) {
        whereCondition.orderStatus = orderStatus;
      }
      const orderTimeRange = this.resolveOrderTimeRange(startDate, endDate);
      if (orderTimeRange !== null) {
        whereCondition.createdAt = Between(orderTimeRange.startAt, orderTimeRange.endAt);
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
    if (recentHours !== KtvPendingVerifyWindow.HOURS) {
      throw new BusinessException('待核销查询范围不正确');
    }
    // 1. 开唱时刻落在现在往前、往后各一段小时内
    const now = new Date();
    const rangeStartAt = new Date(now.getTime());
    rangeStartAt.setHours(rangeStartAt.getHours() - KtvPendingVerifyWindow.HOURS);
    const rangeEndAt = new Date(now.getTime());
    rangeEndAt.setHours(rangeEndAt.getHours() + KtvPendingVerifyWindow.HOURS);
    const bookingOrderQuery = this.ktvBookingOrderRepository.createQueryBuilder('bookingOrder');
    if (!isEmpty(verifyCode)) {
      bookingOrderQuery.andWhere('bookingOrder.verifyCode = :verifyCode', { verifyCode });
    }
    if (!isEmpty(orderStatus)) {
      bookingOrderQuery.andWhere('bookingOrder.orderStatus = :orderStatus', { orderStatus });
    }
    bookingOrderQuery.andWhere('TIMESTAMP(bookingOrder.bookingDate, bookingOrder.startTime) >= :rangeStart', {
      rangeStart: this.formatDateTime(rangeStartAt),
    });
    bookingOrderQuery.andWhere('TIMESTAMP(bookingOrder.bookingDate, bookingOrder.startTime) <= :rangeEnd', {
      rangeEnd: this.formatDateTime(rangeEndAt),
    });
    bookingOrderQuery.orderBy('bookingOrder.id', 'DESC');
    bookingOrderQuery.skip(pageResult.skip);
    bookingOrderQuery.take(pageResult.pageSize);
    const [bookingOrderList, total] = await bookingOrderQuery.getManyAndCount();
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
    await SimOrm.transaction(this.dataSource, async (entityManager) => {
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
      if (ktvRoom.roomStatus !== KtvRoomStatus.IDLE) {
        throw new BusinessException('包厢不是空闲状态');
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
      ktvRoom.roomStatus = KtvRoomStatus.IN_USE;
      const occupyEndAt = new Date();
      occupyEndAt.setHours(occupyEndAt.getHours() + bookingOrder.durationHours);
      ktvRoom.occupyEndAt = this.formatDateTime(occupyEndAt);
      ktvRoom.occupyExtendHours = 0;
      await entityManager.getRepository(KtvRoom).save(ktvRoom);
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
        roomStatus: KtvRoomStatus.IDLE,
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
    return SimOrm.transaction(this.dataSource, async (entityManager) => {
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
   * 后台取消预订。待支付只关单；待核销关单并退回包厢费。不受会员半小时限制。
   */
  async cancelBooking(bookingOrderId: string, operatorId: string): Promise<void> {
    await SimOrm.transaction(this.dataSource, async (entityManager) => {
      const bookingOrder = await this.lockBookingOrderForCancel(entityManager, bookingOrderId);
      await this.applyKtvBookingCancel(entityManager, bookingOrder, operatorId);
    });
  }

  /**
   * 会员自助取消。须本人订单，且开唱前至少半小时。
   */
  async cancelMemberBooking(memberId: string, bookingOrderId: string): Promise<void> {
    await SimOrm.transaction(this.dataSource, async (entityManager) => {
      // 1. 锁定订单，确认归属与状态
      const bookingOrder = await this.lockBookingOrderForCancel(entityManager, bookingOrderId);
      if (toIdentifier(bookingOrder.memberId) !== toIdentifier(memberId)) {
        throw new BusinessException('订单不存在');
      }
      // 2. 开唱前不足半小时不可取消
      const shop = await this.shopService.findById(toIdentifier(bookingOrder.shopId));
      if (this.isKtvMemberCancelLeadMet(bookingOrder, shop, new Date()) !== true) {
        throw new BusinessException('开唱前半小时内不可取消');
      }
      await this.applyKtvBookingCancel(entityManager, bookingOrder, null);
    });
  }

  /**
   * 校验包厢类型参数。
   */
  private assertRoomTypeCommand(command: SaveKtvRoomTypeCommand): void {
    if (isEmpty(command.typeName)) {
      throw new BusinessException('包厢类型名称不能为空');
    }
    this.normalizeRoomTypeDescription(command.description);
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
    await SimOrm.transaction(this.dataSource, async (entityManager) => {
      for (let sortOrder = 0; sortOrder < idList.length; sortOrder += 1) {
        await entityManager.update(entity, { id: idList[sortOrder] }, { sortOrder });
      }
    });
  }

  /**
   * 整理包厢描述。缺省为空串，超长直接拒绝。
   */
  private normalizeRoomTypeDescription(description: Partial<KtvRoomTypeDescription> | null | undefined): KtvRoomTypeDescription {
    const bookingSummary = isEmpty(description) || isEmpty(description.bookingSummary) ? '' : description.bookingSummary.trim();
    const cancelRule = isEmpty(description) || isEmpty(description.cancelRule) ? '' : description.cancelRule.trim();
    const bookingNotice = isEmpty(description) || isEmpty(description.bookingNotice) ? '' : description.bookingNotice.trim();
    if (bookingSummary.length > DetailDescriptionLimit.MAX_LENGTH) {
      throw new BusinessException(`预定简述不能超过${DetailDescriptionLimit.MAX_LENGTH}字`);
    }
    if (cancelRule.length > DetailDescriptionLimit.MAX_LENGTH) {
      throw new BusinessException(`退订规则不能超过${DetailDescriptionLimit.MAX_LENGTH}字`);
    }
    if (bookingNotice.length > DetailDescriptionLimit.MAX_LENGTH) {
      throw new BusinessException(`预订须知不能超过${DetailDescriptionLimit.MAX_LENGTH}字`);
    }
    return { bookingSummary, cancelRule, bookingNotice };
  }

  /**
   * 把保存参数写进包厢类型。
   */
  private fillRoomType(ktvRoomType: KtvRoomType, command: SaveKtvRoomTypeCommand): void {
    ktvRoomType.typeName = command.typeName;
    ktvRoomType.description = this.normalizeRoomTypeDescription(command.description);
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
  private toRoomTypeView(roomType: KtvRoomType, imageList: KtvRoomTypeImageView[], roomCount = 0): KtvRoomTypeView {
    return {
      id: toIdentifier(roomType.id),
      shopId: toIdentifier(roomType.shopId),
      typeName: roomType.typeName,
      description: this.normalizeRoomTypeDescription(roomType.description),
      hourlyPrice: roomType.hourlyPrice,
      status: roomType.status,
      roomCount,
      imageList,
    };
  }

  /**
   * 批量转成带图片列表和关联包厢数的包厢类型字段。
   */
  private async toRoomTypeViewList(roomTypeList: KtvRoomType[]): Promise<KtvRoomTypeView[]> {
    const roomTypeIdList = roomTypeList.map((roomType) => toIdentifier(roomType.id));
    const imageList = roomTypeIdList.length === 0 ? [] : await this.ktvRoomTypeImageRepository.find({
      where: { roomTypeId: In(roomTypeIdList) },
      order: { sortOrder: 'ASC', id: 'ASC' },
    });
    // 1. 按类型统计挂了多少间包厢
    const roomCountByTypeId = new Map<string, number>();
    if (isEmpty(roomTypeIdList) !== true) {
      const roomCountRowList = await this.ktvRoomRepository
        .createQueryBuilder('ktvRoom')
        .select('ktvRoom.roomTypeId', 'roomTypeId')
        .addSelect('COUNT(1)', 'roomCount')
        .where('ktvRoom.roomTypeId IN (:...roomTypeIdList)', { roomTypeIdList })
        .groupBy('ktvRoom.roomTypeId')
        .getRawMany<{ roomTypeId: string; roomCount: string | number }>();
      for (const roomCountRow of roomCountRowList) {
        roomCountByTypeId.set(toIdentifier(roomCountRow.roomTypeId), Number(roomCountRow.roomCount));
      }
    }
    return roomTypeList.map((roomType) => {
      const roomTypeId = toIdentifier(roomType.id);
      const roomTypeImageList = imageList
        .filter((roomTypeImage) => toIdentifier(roomTypeImage.roomTypeId) === roomTypeId)
        .map((roomTypeImage) => this.toImageView(roomTypeImage));
      const roomCount = roomCountByTypeId.get(roomTypeId);
      return this.toRoomTypeView(roomType, roomTypeImageList, isEmpty(roomCount) ? 0 : roomCount);
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
   * 开唱时间必须落在该门店近 5 天、营业时间内的可预约刻度里。
   */
  private assertBookableSlot(shop: Shop, bookingDate: string, startTime: string): void {
    const startTimeText = startTime.slice(0, 8);
    const slotList = this.listBookableSlots(new Date(), shop);
    const matchedSlot = slotList.find((slot) => slot.bookingDate === bookingDate && slot.startTime === startTimeText);
    if (isEmpty(matchedSlot)) {
      throw new BusinessException('请选择可预约的开唱时间');
    }
  }

  /**
   * 把门店时区偏移换成分钟。没有偏移时用本机偏移，钟面与当前一致。
   */
  private timeZoneOffsetMinutes(timeZoneOffset: string, now: Date): number {
    if (isEmpty(timeZoneOffset)) {
      return -now.getTimezoneOffset();
    }
    const signText = timeZoneOffset.slice(0, 1);
    const hourText = timeZoneOffset.slice(1, 3);
    const minuteText = timeZoneOffset.slice(4, 6);
    if (isNumber(hourText) !== true || isNumber(minuteText) !== true) {
      return -now.getTimezoneOffset();
    }
    const absoluteMinutes = Number(hourText) * 60 + Number(minuteText);
    if (signText === '-') {
      return -absoluteMinutes;
    }
    return absoluteMinutes;
  }

  /**
   * 把当前时刻平移成门店钟面。日期和钟点读 UTC 字段，避免本机时区。
   */
  private toShopWallClock(now: Date, timeZoneOffset: string): Date {
    const offsetMinutes = this.timeZoneOffsetMinutes(timeZoneOffset, now);
    const offsetMilliseconds = offsetMinutes * 60 * 1000;
    return new Date(now.getTime() + offsetMilliseconds);
  }

  /**
   * 到店钟点是否落在营业时间内。开始包含，结束不包含。结束早于开始时按跨天算。没有营业时间时整天可约。
   */
  private isInsideBusinessHours(startTime: string, businessHours: Shop['businessHours']): boolean {
    if (isEmpty(businessHours) || isEmpty(businessHours.startTime) || isEmpty(businessHours.endTime)) {
      return true;
    }
    const clockText = startTime.slice(0, 5);
    // 1. 当天营业：落在 [开始, 结束)
    if (businessHours.endTime > businessHours.startTime) {
      if (clockText < businessHours.startTime) {
        return false;
      }
      if (clockText >= businessHours.endTime) {
        return false;
      }
      return true;
    }
    // 2. 跨天营业：落在 [开始, 24:00) 或 [00:00, 结束)
    if (clockText >= businessHours.startTime) {
      return true;
    }
    if (clockText < businessHours.endTime) {
      return true;
    }
    return false;
  }

  /**
   * 列出近 5 天可预约的半小时刻度。今天只留剩余刻度，后四天是全天，再按营业时间过滤。
   */
  private listBookableSlots(now: Date, shop: Shop): { bookingDate: string; startTime: string }[] {
    const shopNow = this.toShopWallClock(now, shop.timeZone);
    const stepMilliseconds = KtvBookingSlot.STEP_MINUTES * 60 * 1000;
    const leadMilliseconds = KtvBookingSlot.LEAD_MINUTES * 60 * 1000;
    const minutesPerDay = 24 * 60;
    const slotsPerDay = minutesPerDay / KtvBookingSlot.STEP_MINUTES;
    // 1. 正好落在刻度上时，这个刻度已经不大于当前时间，再往后推一档
    let nextSlotTime = Math.ceil(shopNow.getTime() / stepMilliseconds) * stepMilliseconds;
    if (nextSlotTime <= shopNow.getTime()) {
      nextSlotTime += stepMilliseconds;
    }
    // 2. 离下一档不足 15 分钟时，从再下一档开始
    if (nextSlotTime - shopNow.getTime() < leadMilliseconds) {
      nextSlotTime += stepMilliseconds;
    }
    const todayText = this.formatDate(shopNow);
    const slotList: { bookingDate: string; startTime: string }[] = [];
    // 3. 今天从第一档可用刻度收到当天结束
    let todaySlotTime = nextSlotTime;
    while (this.formatDate(new Date(todaySlotTime)) === todayText) {
      slotList.push({
        bookingDate: todayText,
        startTime: this.formatClockTime(new Date(todaySlotTime)),
      });
      todaySlotTime += stepMilliseconds;
    }
    // 4. 后四天每天从 00:00 到 23:30
    const todayStart = new Date(Date.UTC(shopNow.getUTCFullYear(), shopNow.getUTCMonth(), shopNow.getUTCDate()));
    for (let dayOffset = 1; dayOffset < KtvBookingSlot.DAY_COUNT; dayOffset += 1) {
      const dayStart = new Date(todayStart.getTime());
      dayStart.setUTCDate(todayStart.getUTCDate() + dayOffset);
      for (let slotIndex = 0; slotIndex < slotsPerDay; slotIndex += 1) {
        const slotTime = new Date(dayStart.getTime() + slotIndex * stepMilliseconds);
        slotList.push({
          bookingDate: this.formatDate(slotTime),
          startTime: this.formatClockTime(slotTime),
        });
      }
    }
    // 5. 只留营业时间内的到店刻度。没有营业时间时整天都保留
    const openSlotList: { bookingDate: string; startTime: string }[] = [];
    for (let builtIndex = 0; builtIndex < slotList.length; builtIndex += 1) {
      const builtSlot = slotList[builtIndex];
      if (this.isInsideBusinessHours(builtSlot.startTime, shop.businessHours)) {
        openSlotList.push(builtSlot);
      }
    }
    return openSlotList;
  }

  /**
   * 格式化成门店钟面日期。入参须是平移后的钟面时间。
   */
  private formatDate(dateTime: Date): string {
    const monthText = String(dateTime.getUTCMonth() + 1).padStart(2, '0');
    const dayText = String(dateTime.getUTCDate()).padStart(2, '0');
    return `${dateTime.getUTCFullYear()}-${monthText}-${dayText}`;
  }

  /**
   * 格式化成门店钟点，秒固定为 0。入参须是平移后的钟面时间。
   */
  private formatClockTime(dateTime: Date): string {
    const hourText = String(dateTime.getUTCHours()).padStart(2, '0');
    const minuteText = String(dateTime.getUTCMinutes()).padStart(2, '0');
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
   * 锁定待取消的预订订单，并确认状态允许取消。
   */
  private async lockBookingOrderForCancel(entityManager: EntityManager, bookingOrderId: string): Promise<KtvBookingOrder> {
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
    return bookingOrder;
  }

  /**
   * 待支付只关单；待核销关单并退回包厢费。
   */
  private async applyKtvBookingCancel(
    entityManager: EntityManager,
    bookingOrder: KtvBookingOrder,
    operatorId: string | null,
  ): Promise<void> {
    if (bookingOrder.orderStatus === KtvOrderStatus.PENDING_PAY) {
      bookingOrder.orderStatus = KtvOrderStatus.CANCELLED;
      await entityManager.getRepository(KtvBookingOrder).save(bookingOrder);
      return;
    }
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
  }

  /**
   * 开唱日期时间按门店钟面解析成可比时刻（UTC 字段存钟面）。
   */
  private ktvBookingStartWallClock(bookingOrder: KtvBookingOrder): Date {
    const bookingDateText = String(bookingOrder.bookingDate).slice(0, 10);
    const startTimeText = String(bookingOrder.startTime).slice(0, 8);
    const datePartList = bookingDateText.split('-').map((datePart) => Number(datePart));
    const timePartList = startTimeText.split(':').map((timePart) => Number(timePart));
    return new Date(Date.UTC(datePartList[0], datePartList[1] - 1, datePartList[2], timePartList[0], timePartList[1], timePartList[2] || 0));
  }

  /**
   * 会员自助取消是否满足开唱前半小时。状态不可取消时直接否。
   */
  private isKtvMemberCancelLeadMet(bookingOrder: KtvBookingOrder, shop: Shop, now: Date): boolean {
    const cancelable = KtvBookingCancelableStatusList.some((orderStatus) => orderStatus === bookingOrder.orderStatus);
    if (cancelable !== true) {
      return false;
    }
    const shopNow = this.toShopWallClock(now, shop.timeZone);
    const startWallClock = this.ktvBookingStartWallClock(bookingOrder);
    const leadMilliseconds = MemberBookingCancelLead.MINUTES * 60 * TimeSpan.MILLISECONDS_PER_SECOND;
    return shopNow.getTime() <= startWallClock.getTime() - leadMilliseconds;
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
    const shopIdList = bookingOrderList.map((bookingOrder) => toIdentifier(bookingOrder.shopId));
    const roomList = roomIdList.length === 0 ? [] : await this.ktvRoomRepository.find({ where: { id: In(roomIdList) } });
    const roomTypeList = await this.ktvRoomTypeRepository.find({ where: { id: In(roomTypeIdList) } });
    const memberAccountList = await this.memberQueryService.findByIdList(memberIdList);
    const shopList = await this.shopService.findByIdList(shopIdList);
    const now = new Date();
    return bookingOrderList.map((bookingOrder) => {
      const ktvRoom = roomList.find((room) => toIdentifier(room.id) === toIdentifier(bookingOrder.roomId));
      const ktvRoomType = roomTypeList.find((roomType) => toIdentifier(roomType.id) === toIdentifier(bookingOrder.roomTypeId));
      const memberAccount = memberAccountList.find((member) => toIdentifier(member.id) === toIdentifier(bookingOrder.memberId));
      const shop = shopList.find((shopRow) => toIdentifier(shopRow.id) === toIdentifier(bookingOrder.shopId));
      const canCancel = isEmpty(shop) ? false : this.isKtvMemberCancelLeadMet(bookingOrder, shop, now);
      return {
        bookingOrderId: toIdentifier(bookingOrder.id),
        shopId: toIdentifier(bookingOrder.shopId),
        orderNo: bookingOrder.orderNo,
        memberId: toIdentifier(bookingOrder.memberId),
        username: isEmpty(memberAccount) ? '' : memberAccount.username,
        guestName: isEmpty(bookingOrder.guestName) ? '' : bookingOrder.guestName,
        contact: isEmpty(bookingOrder.contact) ? '' : bookingOrder.contact,
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
        canCancel,
        createdAt: bookingOrder.createdAt,
      };
    });
  }
}
