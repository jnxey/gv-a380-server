import { randomUUID } from 'crypto';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { join } from 'path';
import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import Decimal from 'decimal.js';
import { DataSource, FindOptionsWhere, In, Repository } from 'typeorm';
import {
  BusinessNoPrefix,
  FinanceBizType,
  HotelBusinessDay,
  HotelOrderStatus,
  HotelRoomStatus,
  HotelStayStatus,
  HotelWalkInContact,
  HotelWalkInNight,
  PageSetting,
  RecordStatus,
  TimeSpan,
  ShopImageLimit,
  ShopImageMime,
  ShopType,
  NumberBoundary,
} from '../common/constants';
import { ShopContext } from '../common/context/shop-context';
import { MiniappSignService } from '../common/crypto/miniapp-sign.service';
import { BusinessException } from '../common/exceptions/business.exception';
import { PageResult } from '../common/interfaces/page-result';
import {
  calculateNightCount,
  createBusinessNo,
  formatShanghaiDate,
  formatShanghaiDateTime,
  isDuplicateEntryError,
  isEmpty,
  isNumber,
  isOneOf,
  isPositiveMoney,
  resolvePage,
  toIdentifier,
  toMoneyString,
} from '../common/tools';
import { MemberBalanceService } from '../core/member/member-balance.service';
import { MemberQueryService } from '../core/member/member-query.service';
import { NotifyService } from '../core/notify/notify.service';
import { ShopService } from '../core/shop/shop.service';
import { HotelBookingOrder, HotelRoom, HotelRoomType, HotelRoomTypeImage, HotelStayRecord } from './hotel.entities';

/**
 * 小程序创建酒店预订的入参。
 */
export interface CreateHotelBookingCommand {
  shopId: string;
  roomTypeId: string;
  checkInDate: string;
  checkOutDate: string;
}

/**
 * 保存房型的入参。
 */
export interface SaveHotelRoomTypeCommand {
  typeName: string;
  price: string | number;
  status: string;
}

/**
 * 前端使用的一张房型图片。
 */
export interface HotelRoomTypeImageView {
  imageId: string;
  imageUrl: string;
}

/**
 * 上传文件里服务需要的字段。
 */
export interface HotelRoomTypeImageFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

/**
 * 带图片列表的房型。
 */
export interface HotelRoomTypeView {
  id: string;
  shopId: string;
  typeName: string;
  price: string;
  status: string;
  imageList: HotelRoomTypeImageView[];
}

/**
 * 保存房间的入参。
 */
export interface SaveHotelRoomCommand {
  roomTypeId: string;
  roomNo: string;
  floorNo: string;
  roomStatus: string;
}

/**
 * 酒店订单展示行。
 */
export interface HotelBookingOrderView {
  bookingOrderId: string;
  shopId: string;
  orderNo: string;
  memberId: string;
  username: string;
  contact: string;
  roomTypeId: string;
  typeName: string;
  roomId: string;
  roomNo: string;
  checkInDate: string;
  checkOutDate: string;
  amount: string;
  orderStatus: string;
  stayStatus: string;
  createdAt: string;
}

/**
 * 酒店房型、房间、预订、入住、续住和退房结算。
 */
@Injectable()
export class HotelService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(HotelRoomType)
    private readonly hotelRoomTypeRepository: Repository<HotelRoomType>,
    @InjectRepository(HotelRoomTypeImage)
    private readonly hotelRoomTypeImageRepository: Repository<HotelRoomTypeImage>,
    @InjectRepository(HotelRoom)
    private readonly hotelRoomRepository: Repository<HotelRoom>,
    @InjectRepository(HotelBookingOrder)
    private readonly hotelBookingOrderRepository: Repository<HotelBookingOrder>,
    @InjectRepository(HotelStayRecord)
    private readonly hotelStayRecordRepository: Repository<HotelStayRecord>,
    private readonly shopService: ShopService,
    private readonly memberBalanceService: MemberBalanceService,
    private readonly memberQueryService: MemberQueryService,
    private readonly miniappSignService: MiniappSignService,
    private readonly notifyService: NotifyService,
  ) {}

  /**
   * 查询当前门店全部房型，并带上图片。
   */
  async pageRoomTypes(): Promise<PageResult<HotelRoomTypeView>> {
    const roomTypeList = await this.hotelRoomTypeRepository.find({
      order: { sortOrder: 'ASC', id: 'ASC' },
    });
    const list = await this.toRoomTypeViewList(roomTypeList);
    return { list, total: list.length, page: PageSetting.DEFAULT_PAGE, pageSize: list.length };
  }

  /**
   * 小程序查询某酒店可预订房型。
   */
  async listEnabledRoomTypes(shopId: string): Promise<HotelRoomType[]> {
    const shop = await this.shopService.findEnabledShop(shopId, ShopType.HOTEL);
    return this.hotelRoomTypeRepository.find({
      where: { shopId: toIdentifier(shop.id), status: RecordStatus.ENABLED },
      order: { id: 'ASC' },
    });
  }

  /**
   * 新建当前门店房型。
   */
  async createRoomType(command: SaveHotelRoomTypeCommand): Promise<HotelRoomTypeView> {
    this.assertRoomTypeCommand(command);
    const hotelRoomType = new HotelRoomType();
    hotelRoomType.shopId = this.requireCurrentShopId();
    hotelRoomType.sortOrder = await this.nextSortOrder(this.hotelRoomTypeRepository);
    this.fillRoomType(hotelRoomType, command);
    const savedRoomType = await this.hotelRoomTypeRepository.save(hotelRoomType);
    return this.toRoomTypeView(savedRoomType, []);
  }

  /**
   * 修改当前门店房型。
   */
  async updateRoomType(roomTypeId: string, command: SaveHotelRoomTypeCommand): Promise<HotelRoomTypeView> {
    this.assertRoomTypeCommand(command);
    const hotelRoomType = await this.hotelRoomTypeRepository.findOne({ where: { id: roomTypeId } });
    if (isEmpty(hotelRoomType)) {
      throw new BusinessException('房型不存在');
    }
    this.fillRoomType(hotelRoomType, command);
    const savedRoomType = await this.hotelRoomTypeRepository.save(hotelRoomType);
    const viewList = await this.toRoomTypeViewList([savedRoomType]);
    return viewList[0];
  }

  /**
   * 按拖动结果重排当前门店的全部房型。
   */
  async sortRoomTypes(idList: string[]): Promise<void> {
    await this.applySortOrder(this.hotelRoomTypeRepository, HotelRoomType, idList, '房型排序不完整');
  }

  /**
   * 给当前门店的房型追加一张图片。
   */
  async addRoomTypeImage(roomTypeId: string, file: HotelRoomTypeImageFile): Promise<HotelRoomTypeImageView> {
    const hotelRoomType = await this.requireRoomType(roomTypeId);
    if (isEmpty(file) || isEmpty(file.buffer) || file.buffer.length === 0) {
      throw new BusinessException('请选择图片');
    }
    const extension = this.resolveImageExtension(file.mimetype);
    if (file.size > ShopImageLimit.MAX_BYTES) {
      throw new BusinessException('图片不能超过5MB');
    }
    const roomTypeIdValue = toIdentifier(hotelRoomType.id);
    const imageCount = await this.hotelRoomTypeImageRepository.count({ where: { roomTypeId: roomTypeIdValue } });
    if (imageCount >= ShopImageLimit.MAX_COUNT) {
      throw new BusinessException('房型图片最多6张');
    }
    const fileName = `${randomUUID()}${extension}`;
    const directoryPath = join(process.cwd(), 'uploads', 'hotel-room-type', roomTypeIdValue);
    await mkdir(directoryPath, { recursive: true });
    await writeFile(join(directoryPath, fileName), file.buffer);
    const roomTypeImage = new HotelRoomTypeImage();
    roomTypeImage.roomTypeId = roomTypeIdValue;
    roomTypeImage.imageUrl = `/uploads/hotel-room-type/${roomTypeIdValue}/${fileName}`;
    roomTypeImage.sortOrder = imageCount;
    const savedImage = await this.hotelRoomTypeImageRepository.save(roomTypeImage);
    return this.toImageView(savedImage);
  }

  /**
   * 删除当前门店房型的一张图片，并删掉磁盘文件。
   */
  async removeRoomTypeImage(roomTypeId: string, imageId: string): Promise<void> {
    const hotelRoomType = await this.requireRoomType(roomTypeId);
    const roomTypeIdValue = toIdentifier(hotelRoomType.id);
    const roomTypeImage = await this.hotelRoomTypeImageRepository.findOne({ where: { id: imageId, roomTypeId: roomTypeIdValue } });
    if (isEmpty(roomTypeImage)) {
      throw new BusinessException('房型图片不存在');
    }
    const fileName = roomTypeImage.imageUrl.slice(roomTypeImage.imageUrl.lastIndexOf('/') + 1);
    const filePath = join(process.cwd(), 'uploads', 'hotel-room-type', roomTypeIdValue, fileName);
    try {
      await unlink(filePath);
    } catch (error) {
      const errorCode = (error as { code?: string }).code;
      if (errorCode !== 'ENOENT') {
        throw error;
      }
    }
    await this.hotelRoomTypeImageRepository.delete({ id: roomTypeImage.id });
  }

  /**
   * 查询当前门店房间。不传页码时返回全部，传入页码时仍分页。可按房态、房型筛选。
   */
  async pageRooms(roomStatus: string, roomTypeId: string, pageValue: unknown, pageSizeValue: unknown): Promise<PageResult<HotelRoom>> {
    if (!isEmpty(roomStatus) && !isOneOf(roomStatus, Object.values(HotelRoomStatus))) {
      throw new BusinessException('房态不正确');
    }
    const whereCondition: FindOptionsWhere<HotelRoom> = {};
    if (!isEmpty(roomStatus)) {
      whereCondition.roomStatus = roomStatus;
    }
    if (!isEmpty(roomTypeId)) {
      whereCondition.roomTypeId = roomTypeId;
    }
    if (isNumber(pageValue) !== true) {
      const list = await this.hotelRoomRepository.find({
        where: whereCondition,
        order: { sortOrder: 'ASC', id: 'ASC' },
      });
      return { list, total: list.length, page: PageSetting.DEFAULT_PAGE, pageSize: list.length };
    }
    const pageResult = resolvePage(pageValue, pageSizeValue);
    const [list, total] = await this.hotelRoomRepository.findAndCount({
      where: whereCondition,
      order: { sortOrder: 'ASC', id: 'ASC' },
      skip: pageResult.skip,
      take: pageResult.pageSize,
    });
    return { list, total, page: pageResult.page, pageSize: pageResult.pageSize };
  }

  /**
   * 新建当前门店房间。房型必须属于当前门店。
   */
  async createRoom(command: SaveHotelRoomCommand): Promise<HotelRoom> {
    this.assertRoomCommand(command);
    const currentShopId = this.requireCurrentShopId();
    await this.requireRoomType(command.roomTypeId);
    const hotelRoom = new HotelRoom();
    hotelRoom.shopId = currentShopId;
    hotelRoom.sortOrder = await this.nextSortOrder(this.hotelRoomRepository);
    this.fillRoom(hotelRoom, command);
    try {
      return await this.hotelRoomRepository.save(hotelRoom);
    } catch (error) {
      if (isDuplicateEntryError(error)) {
        throw new BusinessException('房间号已存在');
      }
      throw error;
    }
  }

  /**
   * 把空闲、打扫中或维修的房间改成另一种。在住房必须先退房，不能从这里改成在住。
   */
  async updateRoomStatus(roomId: string, roomStatus: string): Promise<void> {
    // 1. 只接受空闲、打扫中和维修
    if (roomStatus !== HotelRoomStatus.IDLE && roomStatus !== HotelRoomStatus.CLEANING && roomStatus !== HotelRoomStatus.MAINTENANCE) {
      throw new BusinessException('只能改为空闲、打扫中或维修');
    }
    // 2. 房间必须存在，在住不能从这里改
    const hotelRoom = await this.hotelRoomRepository.findOne({ where: { id: roomId } });
    if (isEmpty(hotelRoom)) {
      throw new BusinessException('房间不存在');
    }
    if (hotelRoom.roomStatus === HotelRoomStatus.OCCUPIED) {
      throw new BusinessException('在住房请先退房');
    }
    // 3. 写入新房态
    hotelRoom.roomStatus = roomStatus;
    await this.hotelRoomRepository.save(hotelRoom);
  }

  /**
   * 解开付款码，再按里面的用户名找到余额账户。
   */
  async findMemberByPayQr(cipherText: string) {
    await this.requireEnabledHotelShop();
    const username = this.miniappSignService.readPayRechargeUsername(cipherText);
    return this.requireMemberByUsername(username);
  }

  /**
   * 按当前酒店门店扣减会员余额，并返回扣完后的会员资料。不关联预订单。
   */
  async deductMemberBalance(memberId: string, amount: string | number, remark: string, operatorId: string) {
    if (!isPositiveMoney(amount)) {
      throw new BusinessException('扣款金额必须大于0');
    }
    const shopId = await this.requireEnabledHotelShop();
    const cleanedRemark = remark.trim();
    await this.dataSource.transaction(async (entityManager) => {
      await this.memberBalanceService.deductBalance({
        entityManager,
        memberId,
        shopId,
        amount: toMoneyString(amount),
        bizType: FinanceBizType.HOTEL_IN_STORE,
        bizOrderNo: '',
        operatorId,
        remark: isEmpty(cleanedRemark) ? '酒店扣款' : cleanedRemark,
      });
    });
    const memberAccount = await this.memberQueryService.findById(memberId);
    if (isEmpty(memberAccount)) {
      throw new BusinessException('没有找到会员');
    }
    return this.memberQueryService.toMemberView(memberAccount);
  }

  /**
   * 打扫完成后把房间改回空闲。
   */
  async finishCleaning(roomId: string): Promise<void> {
    const hotelRoom = await this.hotelRoomRepository.findOne({ where: { id: roomId } });
    if (isEmpty(hotelRoom)) {
      throw new BusinessException('房间不存在');
    }
    if (hotelRoom.roomStatus !== HotelRoomStatus.CLEANING) {
      throw new BusinessException('房间不是打扫中');
    }
    hotelRoom.roomStatus = HotelRoomStatus.IDLE;
    await this.hotelRoomRepository.save(hotelRoom);
  }

  /**
   * 修改当前门店房间。
   */
  async updateRoom(roomId: string, command: SaveHotelRoomCommand): Promise<HotelRoom> {
    this.assertRoomCommand(command);
    const hotelRoom = await this.hotelRoomRepository.findOne({ where: { id: roomId } });
    if (isEmpty(hotelRoom)) {
      throw new BusinessException('房间不存在');
    }
    await this.requireRoomType(command.roomTypeId);
    this.fillRoom(hotelRoom, command);
    try {
      return await this.hotelRoomRepository.save(hotelRoom);
    } catch (error) {
      if (isDuplicateEntryError(error)) {
        throw new BusinessException('房间号已存在');
      }
      throw error;
    }
  }

  /**
   * 按拖动结果重排当前门店的全部房间。
   */
  async sortRooms(idList: string[]): Promise<void> {
    await this.applySortOrder(this.hotelRoomRepository, HotelRoom, idList, '房间排序不完整');
  }

  /**
   * 创建酒店预订。此时不扣会员余额。
   */
  async createBooking(memberId: string, command: CreateHotelBookingCommand): Promise<HotelBookingOrder> {
    if (command.checkOutDate <= command.checkInDate) {
      throw new BusinessException('离店日期必须晚于入住日期');
    }
    return this.dataSource.transaction(async (entityManager) => {
      // 1. 校验酒店门店
      const shop = await this.shopService.findEnabledShopInManager(entityManager, command.shopId, ShopType.HOTEL);
      const shopId = toIdentifier(shop.id);
      // 2. 房型必须属于这家酒店且可售
      const hotelRoomType = await entityManager.getRepository(HotelRoomType).findOne({
        where: { id: command.roomTypeId, shopId, status: RecordStatus.ENABLED },
      });
      if (isEmpty(hotelRoomType)) {
        throw new BusinessException('房型不存在或已停用');
      }
      // 3. 写入未支付的预订订单
      const bookingOrder = new HotelBookingOrder();
      bookingOrder.shopId = shopId;
      bookingOrder.orderNo = createBusinessNo(BusinessNoPrefix.HOTEL_BOOKING);
      bookingOrder.memberId = memberId;
      bookingOrder.contact = '';
      bookingOrder.roomTypeId = toIdentifier(hotelRoomType.id);
      bookingOrder.roomId = null;
      bookingOrder.checkInDate = command.checkInDate;
      bookingOrder.checkOutDate = command.checkOutDate;
      bookingOrder.amount = toMoneyString(NumberBoundary.ZERO);
      bookingOrder.orderStatus = HotelOrderStatus.BOOKED;
      const savedOrder = await entityManager.getRepository(HotelBookingOrder).save(bookingOrder);
      await this.notifyService.createMemberMessage(entityManager, {
        shopId,
        memberId,
        title: '酒店预订成功',
        content: `订单${savedOrder.orderNo}已预订，入住时再结算房费`,
      });
      return savedOrder;
    });
  }

  /**
   * 后台分页查询当前门店酒店订单。
   */
  async pageBookingOrders(pageValue: unknown, pageSizeValue: unknown): Promise<PageResult<HotelBookingOrderView>> {
    const pageResult = resolvePage(pageValue, pageSizeValue);
    const [bookingOrderList, total] = await this.hotelBookingOrderRepository.findAndCount({
      order: { id: 'DESC' },
      skip: pageResult.skip,
      take: pageResult.pageSize,
    });
    const viewList = await this.toBookingViewList(bookingOrderList);
    return { list: viewList, total, page: pageResult.page, pageSize: pageResult.pageSize };
  }

  /**
   * 小程序查询当前会员的酒店订单。
   */
  async pageMemberBookingOrders(memberId: string, pageValue: unknown, pageSizeValue: unknown): Promise<PageResult<HotelBookingOrderView>> {
    const pageResult = resolvePage(pageValue, pageSizeValue);
    const [bookingOrderList, total] = await this.hotelBookingOrderRepository.findAndCount({
      where: { memberId },
      order: { id: 'DESC' },
      skip: pageResult.skip,
      take: pageResult.pageSize,
    });
    const viewList = await this.toBookingViewList(bookingOrderList);
    return { list: viewList, total, page: pageResult.page, pageSize: pageResult.pageSize };
  }

  /**
   * 办理入住。分配空闲房间，不扣房费。
   */
  async checkIn(bookingOrderId: string, roomId: string): Promise<void> {
    await this.dataSource.transaction(async (entityManager) => {
      // 1. 锁定待入住订单
      const bookingOrder = await entityManager
        .getRepository(HotelBookingOrder)
        .createQueryBuilder('bookingOrder')
        .setLock('pessimistic_write')
        .where('bookingOrder.id = :bookingOrderId', { bookingOrderId })
        .getOne();
      if (isEmpty(bookingOrder)) {
        throw new BusinessException('订单不存在');
      }
      if (bookingOrder.orderStatus !== HotelOrderStatus.BOOKED) {
        throw new BusinessException('当前状态不能入住');
      }
      // 2. 锁定房间，必须是本店、同房型、空闲
      const hotelRoom = await entityManager
        .getRepository(HotelRoom)
        .createQueryBuilder('hotelRoom')
        .setLock('pessimistic_write')
        .where('hotelRoom.id = :roomId', { roomId })
        .getOne();
      if (isEmpty(hotelRoom)) {
        throw new BusinessException('房间不存在');
      }
      if (toIdentifier(hotelRoom.roomTypeId) !== toIdentifier(bookingOrder.roomTypeId)) {
        throw new BusinessException('房间与预订房型不一致');
      }
      if (hotelRoom.roomStatus !== HotelRoomStatus.IDLE) {
        throw new BusinessException('房间不是空闲状态');
      }
      // 3. 占用房间并写入入住记录
      hotelRoom.roomStatus = HotelRoomStatus.OCCUPIED;
      await entityManager.getRepository(HotelRoom).save(hotelRoom);
      bookingOrder.roomId = toIdentifier(hotelRoom.id);
      bookingOrder.orderStatus = HotelOrderStatus.CHECKED_IN;
      await entityManager.getRepository(HotelBookingOrder).save(bookingOrder);
      const stayRecord = new HotelStayRecord();
      stayRecord.shopId = toIdentifier(bookingOrder.shopId);
      stayRecord.bookingOrderId = toIdentifier(bookingOrder.id);
      stayRecord.roomId = toIdentifier(hotelRoom.id);
      stayRecord.memberId = toIdentifier(bookingOrder.memberId);
      stayRecord.stayStatus = HotelStayStatus.IN_HOUSE;
      stayRecord.actualCheckIn = formatShanghaiDateTime(new Date());
      stayRecord.actualCheckOut = null;
      stayRecord.plannedCheckOutDate = String(bookingOrder.checkOutDate).slice(0, 10);
      await entityManager.getRepository(HotelStayRecord).save(stayRecord);
    });
  }

  /**
   * 没有预订时按今天办理入住。只保存联系方式，不查找会员，并立即占用这间房。
   */
  async walkIn(roomId: string, contact: string, nightCount: number): Promise<void> {
    // 1. 晚数必须在允许范围内，联系方式不能空也不能超长
    if (isNumber(nightCount) !== true || Number.isInteger(nightCount) !== true) {
      throw new BusinessException('入住晚数不正确');
    }
    if (nightCount < HotelWalkInNight.MIN_COUNT || nightCount > HotelWalkInNight.MAX_COUNT) {
      throw new BusinessException('入住晚数不正确');
    }
    const contactText = contact.trim();
    if (isEmpty(contactText)) {
      throw new BusinessException('请填写联系方式');
    }
    if (contactText.length > HotelWalkInContact.MAX_LENGTH) {
      throw new BusinessException('联系方式过长');
    }
    await this.dataSource.transaction(async (entityManager) => {
      // 2. 锁定房间，必须空闲
      const hotelRoom = await entityManager
        .getRepository(HotelRoom)
        .createQueryBuilder('hotelRoom')
        .setLock('pessimistic_write')
        .where('hotelRoom.id = :roomId', { roomId })
        .getOne();
      if (isEmpty(hotelRoom)) {
        throw new BusinessException('房间不存在');
      }
      if (hotelRoom.roomStatus !== HotelRoomStatus.IDLE) {
        throw new BusinessException('房间不是空闲状态');
      }
      // 3. 房型必须可售，并写入订单
      const shop = await this.shopService.findEnabledShopInManager(entityManager, toIdentifier(hotelRoom.shopId), ShopType.HOTEL);
      const shopId = toIdentifier(shop.id);
      const hotelRoomType = await entityManager.getRepository(HotelRoomType).findOne({
        where: { id: toIdentifier(hotelRoom.roomTypeId), shopId, status: RecordStatus.ENABLED },
      });
      if (isEmpty(hotelRoomType)) {
        throw new BusinessException('房型不存在或已停用');
      }
      // 4. 入住日按门店时区的今天。早上 6 点前仍算前一天，离店日再加上晚数
      const checkInDate = this.hotelBusinessDateText(new Date(), shop.timeZone);
      const checkOutDate = this.addCalendarDays(checkInDate, nightCount);
      const bookingOrder = new HotelBookingOrder();
      bookingOrder.shopId = shopId;
      bookingOrder.orderNo = createBusinessNo(BusinessNoPrefix.HOTEL_BOOKING);
      bookingOrder.memberId = null;
      bookingOrder.contact = contactText;
      bookingOrder.roomTypeId = toIdentifier(hotelRoomType.id);
      bookingOrder.roomId = null;
      bookingOrder.checkInDate = checkInDate;
      bookingOrder.checkOutDate = checkOutDate;
      bookingOrder.amount = toMoneyString(NumberBoundary.ZERO);
      bookingOrder.orderStatus = HotelOrderStatus.BOOKED;
      const savedOrder = await entityManager.getRepository(HotelBookingOrder).save(bookingOrder);
      // 5. 占用房间并写入入住记录
      hotelRoom.roomStatus = HotelRoomStatus.OCCUPIED;
      await entityManager.getRepository(HotelRoom).save(hotelRoom);
      savedOrder.roomId = toIdentifier(hotelRoom.id);
      savedOrder.orderStatus = HotelOrderStatus.CHECKED_IN;
      await entityManager.getRepository(HotelBookingOrder).save(savedOrder);
      const stayRecord = new HotelStayRecord();
      stayRecord.shopId = shopId;
      stayRecord.bookingOrderId = toIdentifier(savedOrder.id);
      stayRecord.roomId = toIdentifier(hotelRoom.id);
      stayRecord.memberId = null;
      stayRecord.stayStatus = HotelStayStatus.IN_HOUSE;
      stayRecord.actualCheckIn = formatShanghaiDateTime(new Date());
      stayRecord.actualCheckOut = null;
      stayRecord.plannedCheckOutDate = checkOutDate;
      await entityManager.getRepository(HotelStayRecord).save(stayRecord);
    });
  }

  /**
   * 续住。只延长离店日期，不扣款。
   */
  async extendStay(bookingOrderId: string, checkOutDate: string): Promise<void> {
    await this.dataSource.transaction(async (entityManager) => {
      const bookingOrder = await entityManager
        .getRepository(HotelBookingOrder)
        .createQueryBuilder('bookingOrder')
        .setLock('pessimistic_write')
        .where('bookingOrder.id = :bookingOrderId', { bookingOrderId })
        .getOne();
      if (isEmpty(bookingOrder)) {
        throw new BusinessException('订单不存在');
      }
      if (bookingOrder.orderStatus !== HotelOrderStatus.CHECKED_IN) {
        throw new BusinessException('入住后才能续住');
      }
      const currentCheckOutDate = String(bookingOrder.checkOutDate).slice(0, 10);
      if (checkOutDate <= currentCheckOutDate) {
        throw new BusinessException('续住日期必须晚于当前离店日期');
      }
      const stayRecord = await entityManager.getRepository(HotelStayRecord).findOne({
        where: { bookingOrderId: toIdentifier(bookingOrder.id) },
      });
      if (isEmpty(stayRecord)) {
        throw new BusinessException('入住记录不存在');
      }
      bookingOrder.checkOutDate = checkOutDate;
      await entityManager.getRepository(HotelBookingOrder).save(bookingOrder);
      stayRecord.plannedCheckOutDate = checkOutDate;
      stayRecord.stayStatus = HotelStayStatus.EXTENDED;
      await entityManager.getRepository(HotelStayRecord).save(stayRecord);
    });
  }

  /**
   * 退房结算。按实际入住晚数乘房型单价，调用 core 扣房费。
   */
  async checkOut(bookingOrderId: string, operatorId: string): Promise<void> {
    await this.dataSource.transaction(async (entityManager) => {
      // 1. 锁定在住订单和入住记录
      const bookingOrder = await entityManager
        .getRepository(HotelBookingOrder)
        .createQueryBuilder('bookingOrder')
        .setLock('pessimistic_write')
        .where('bookingOrder.id = :bookingOrderId', { bookingOrderId })
        .getOne();
      if (isEmpty(bookingOrder)) {
        throw new BusinessException('订单不存在');
      }
      if (bookingOrder.orderStatus !== HotelOrderStatus.CHECKED_IN) {
        throw new BusinessException('当前状态不能退房');
      }
      const stayRecord = await entityManager
        .getRepository(HotelStayRecord)
        .createQueryBuilder('stayRecord')
        .setLock('pessimistic_write')
        .where('stayRecord.bookingOrderId = :bookingOrderId', { bookingOrderId: toIdentifier(bookingOrder.id) })
        .getOne();
      if (isEmpty(stayRecord) || isEmpty(stayRecord.actualCheckIn)) {
        throw new BusinessException('入住记录不存在');
      }
      // 2. 用实际入住日和今天计算晚数，再乘当前房型单价
      const hotelRoomType = await entityManager.getRepository(HotelRoomType).findOne({
        where: { id: toIdentifier(bookingOrder.roomTypeId) },
      });
      if (isEmpty(hotelRoomType)) {
        throw new BusinessException('房型不存在');
      }
      const checkOutDateText = formatShanghaiDate(new Date());
      const nightCount = calculateNightCount(String(stayRecord.actualCheckIn), checkOutDateText);
      const roomFee = new Decimal(hotelRoomType.price).times(nightCount);
      const roomFeeText = toMoneyString(roomFee);
      // 3. 有会员才扣房费。现场入住没有会员，只把房费记在订单上
      if (isEmpty(bookingOrder.memberId) !== true) {
        await this.memberBalanceService.deductBalance({
          entityManager,
          memberId: toIdentifier(bookingOrder.memberId),
          shopId: toIdentifier(bookingOrder.shopId),
          amount: roomFeeText,
          bizType: FinanceBizType.HOTEL_ROOM_FEE,
          bizOrderNo: bookingOrder.orderNo,
          operatorId,
          remark: `酒店房费${nightCount}晚`,
        });
      }
      // 4. 完成退房，房间改为打扫中
      bookingOrder.amount = roomFeeText;
      bookingOrder.orderStatus = HotelOrderStatus.CHECKED_OUT;
      bookingOrder.checkOutDate = checkOutDateText;
      await entityManager.getRepository(HotelBookingOrder).save(bookingOrder);
      stayRecord.stayStatus = HotelStayStatus.CHECKED_OUT;
      stayRecord.actualCheckOut = formatShanghaiDateTime(new Date());
      await entityManager.getRepository(HotelStayRecord).save(stayRecord);
      if (!isEmpty(bookingOrder.roomId)) {
        const hotelRoom = await entityManager.getRepository(HotelRoom).findOne({
          where: { id: toIdentifier(bookingOrder.roomId) },
        });
        if (!isEmpty(hotelRoom)) {
          hotelRoom.roomStatus = HotelRoomStatus.CLEANING;
          await entityManager.getRepository(HotelRoom).save(hotelRoom);
        }
      }
    });
  }

  /**
   * 取消尚未入住的预订。未扣款，因此不退款。
   */
  async cancelBooking(bookingOrderId: string): Promise<void> {
    const bookingOrder = await this.hotelBookingOrderRepository.findOne({ where: { id: bookingOrderId } });
    if (isEmpty(bookingOrder)) {
      throw new BusinessException('订单不存在');
    }
    if (bookingOrder.orderStatus !== HotelOrderStatus.BOOKED) {
      throw new BusinessException('只有未入住的订单可以取消');
    }
    bookingOrder.orderStatus = HotelOrderStatus.CANCELLED;
    await this.hotelBookingOrderRepository.save(bookingOrder);
  }

  /**
   * 校验房型参数。
   */
  private assertRoomTypeCommand(command: SaveHotelRoomTypeCommand): void {
    if (!isOneOf(command.status, Object.values(RecordStatus))) {
      throw new BusinessException('房型状态不正确');
    }
    if (!isPositiveMoney(command.price)) {
      throw new BusinessException('房价必须大于0');
    }
  }

  /**
   * 校验房间参数。
   */
  private assertRoomCommand(command: SaveHotelRoomCommand): void {
    if (!isOneOf(command.roomStatus, Object.values(HotelRoomStatus))) {
      throw new BusinessException('房态不正确');
    }
    if (isEmpty(command.roomNo) || isEmpty(command.floorNo)) {
      throw new BusinessException('房间号和楼层不能为空');
    }
  }

  /**
   * 新建时排到当前门店最后。没有记录时从 0 开始。
   */
  private async nextSortOrder(repository: Repository<HotelRoomType> | Repository<HotelRoom>): Promise<number> {
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
    repository: Repository<HotelRoomType> | Repository<HotelRoom>,
    entity: typeof HotelRoomType | typeof HotelRoom,
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
   * 写入房型字段。
   */
  private fillRoomType(hotelRoomType: HotelRoomType, command: SaveHotelRoomTypeCommand): void {
    hotelRoomType.typeName = command.typeName;
    hotelRoomType.price = toMoneyString(command.price);
    hotelRoomType.status = command.status;
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
  private toImageView(roomTypeImage: HotelRoomTypeImage): HotelRoomTypeImageView {
    return {
      imageId: toIdentifier(roomTypeImage.id),
      imageUrl: roomTypeImage.imageUrl,
    };
  }

  /**
   * 转成带图片列表的房型字段。
   */
  private toRoomTypeView(roomType: HotelRoomType, imageList: HotelRoomTypeImageView[]): HotelRoomTypeView {
    return {
      id: toIdentifier(roomType.id),
      shopId: toIdentifier(roomType.shopId),
      typeName: roomType.typeName,
      price: roomType.price,
      status: roomType.status,
      imageList,
    };
  }

  /**
   * 批量转成带图片列表的房型字段。
   */
  private async toRoomTypeViewList(roomTypeList: HotelRoomType[]): Promise<HotelRoomTypeView[]> {
    const roomTypeIdList = roomTypeList.map((roomType) => toIdentifier(roomType.id));
    const imageList = roomTypeIdList.length === 0 ? [] : await this.hotelRoomTypeImageRepository.find({
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
   * 写入房间字段。
   */
  private fillRoom(hotelRoom: HotelRoom, command: SaveHotelRoomCommand): void {
    hotelRoom.roomTypeId = command.roomTypeId;
    hotelRoom.roomNo = command.roomNo;
    hotelRoom.floorNo = command.floorNo;
    hotelRoom.roomStatus = command.roomStatus;
  }

  /**
   * 确认房型属于当前门店。数据权限会滤掉其他门店房型。
   */
  private async requireRoomType(roomTypeId: string): Promise<HotelRoomType> {
    const hotelRoomType = await this.hotelRoomTypeRepository.findOne({ where: { id: roomTypeId } });
    if (isEmpty(hotelRoomType)) {
      throw new BusinessException('房型不存在');
    }
    return hotelRoomType;
  }

  /**
   * 当前请求必须选中一家启用中的酒店。
   */
  private async requireEnabledHotelShop(): Promise<string> {
    const shopId = ShopContext.getCurrentShopId();
    if (isEmpty(shopId)) {
      throw new BusinessException('请选择门店后再扣款');
    }
    const shop = await this.shopService.findEnabledShop(shopId, ShopType.HOTEL);
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
   * 门店当地的入住日。早上 6 点前仍算前一天。没有时区或偏移无效时按东八区。
   */
  private hotelBusinessDateText(now: Date, timeZoneOffset: string): string {
    const shopNow = this.toShopWallClock(now, timeZoneOffset);
    let businessTime = shopNow.getTime();
    if (shopNow.getUTCHours() < HotelBusinessDay.START_HOUR) {
      businessTime -= TimeSpan.MILLISECONDS_PER_DAY;
    }
    return this.formatUtcDate(new Date(businessTime));
  }

  /**
   * 把门店时区偏移换成分钟。没有偏移或写错时用东八区。
   */
  private timeZoneOffsetMinutes(timeZoneOffset: string): number {
    const offsetText = isEmpty(timeZoneOffset) ? HotelBusinessDay.DEFAULT_TIME_ZONE_OFFSET : timeZoneOffset;
    const signText = offsetText.slice(0, 1);
    const hourText = offsetText.slice(1, 3);
    const minuteText = offsetText.slice(4, 6);
    if (isNumber(hourText) !== true || isNumber(minuteText) !== true) {
      if (offsetText === HotelBusinessDay.DEFAULT_TIME_ZONE_OFFSET) {
        return HotelBusinessDay.DEFAULT_OFFSET_MINUTES;
      }
      return this.timeZoneOffsetMinutes(HotelBusinessDay.DEFAULT_TIME_ZONE_OFFSET);
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
    const offsetMinutes = this.timeZoneOffsetMinutes(timeZoneOffset);
    const offsetMilliseconds = offsetMinutes * 60 * 1000;
    return new Date(now.getTime() + offsetMilliseconds);
  }

  /**
   * 把 UTC 日期格式化成 YYYY-MM-DD。
   */
  private formatUtcDate(date: Date): string {
    const yearText = String(date.getUTCFullYear());
    const monthText = String(date.getUTCMonth() + 1).padStart(2, '0');
    const dayText = String(date.getUTCDate()).padStart(2, '0');
    return `${yearText}-${monthText}-${dayText}`;
  }

  /**
   * 给 YYYY-MM-DD 加上若干天。
   */
  private addCalendarDays(dateText: string, dayCount: number): string {
    const date = new Date(`${dateText}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + dayCount);
    return this.formatUtcDate(date);
  }

  /**
   * 读取当前已校验门店。
   */
  private requireCurrentShopId(): string {
    const currentShopId = ShopContext.getCurrentShopId();
    if (isEmpty(currentShopId)) {
      throw new BusinessException('请选择门店');
    }
    return currentShopId;
  }

  /**
   * 组装订单展示数据。
   */
  private async toBookingViewList(bookingOrderList: HotelBookingOrder[]): Promise<HotelBookingOrderView[]> {
    if (bookingOrderList.length === 0) {
      return [];
    }
    const roomTypeIdList = bookingOrderList.map((bookingOrder) => toIdentifier(bookingOrder.roomTypeId));
    const roomIdList = bookingOrderList
      .map((bookingOrder) => toIdentifier(bookingOrder.roomId))
      .filter((roomId) => !isEmpty(roomId));
    const memberIdList = bookingOrderList
      .map((bookingOrder) => toIdentifier(bookingOrder.memberId))
      .filter((memberId) => isEmpty(memberId) !== true);
    const bookingOrderIdList = bookingOrderList.map((bookingOrder) => toIdentifier(bookingOrder.id));
    const roomTypeList = await this.hotelRoomTypeRepository.find({ where: { id: In(roomTypeIdList) } });
    const roomList = roomIdList.length === 0 ? [] : await this.hotelRoomRepository.find({ where: { id: In(roomIdList) } });
    const memberAccountList = await this.memberQueryService.findByIdList(memberIdList);
    const stayRecordList = await this.hotelStayRecordRepository.find({ where: { bookingOrderId: In(bookingOrderIdList) } });
    return bookingOrderList.map((bookingOrder) => {
      const hotelRoomType = roomTypeList.find((roomType) => toIdentifier(roomType.id) === toIdentifier(bookingOrder.roomTypeId));
      const hotelRoom = roomList.find((room) => toIdentifier(room.id) === toIdentifier(bookingOrder.roomId));
      const memberAccount = memberAccountList.find((member) => toIdentifier(member.id) === toIdentifier(bookingOrder.memberId));
      const stayRecord = stayRecordList.find((record) => toIdentifier(record.bookingOrderId) === toIdentifier(bookingOrder.id));
      return {
        bookingOrderId: toIdentifier(bookingOrder.id),
        shopId: toIdentifier(bookingOrder.shopId),
        orderNo: bookingOrder.orderNo,
        memberId: toIdentifier(bookingOrder.memberId),
        username: isEmpty(memberAccount) ? '' : memberAccount.username,
        contact: isEmpty(bookingOrder.contact) ? '' : bookingOrder.contact,
        roomTypeId: toIdentifier(bookingOrder.roomTypeId),
        typeName: isEmpty(hotelRoomType) ? '' : hotelRoomType.typeName,
        roomId: toIdentifier(bookingOrder.roomId),
        roomNo: isEmpty(hotelRoom) ? '' : hotelRoom.roomNo,
        checkInDate: String(bookingOrder.checkInDate).slice(0, 10),
        checkOutDate: String(bookingOrder.checkOutDate).slice(0, 10),
        amount: bookingOrder.amount,
        orderStatus: bookingOrder.orderStatus,
        stayStatus: isEmpty(stayRecord) ? '' : stayRecord.stayStatus,
        createdAt: bookingOrder.createdAt,
      };
    });
  }
}
