import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import Decimal from 'decimal.js';
import { DataSource, FindOptionsWhere, In, Repository } from 'typeorm';
import {
  BusinessNoPrefix,
  FinanceBizType,
  HotelBedType,
  HotelOrderStatus,
  HotelRoomStatus,
  HotelStayStatus,
  RecordStatus,
  ShopType,
  NumberBoundary,
} from '../common/constants';
import { ShopContext } from '../common/context/shop-context';
import { BusinessException } from '../common/exceptions/business.exception';
import { PageResult } from '../common/interfaces/page-result';
import {
  calculateNightCount,
  createBusinessNo,
  formatShanghaiDate,
  formatShanghaiDateTime,
  isDuplicateEntryError,
  isEmpty,
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
import { HotelBookingOrder, HotelRoom, HotelRoomType, HotelStayRecord } from './hotel.entities';

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
  bedType: string;
  price: string | number;
  status: string;
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
  memberName: string;
  mobile: string;
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
    @InjectRepository(HotelRoom)
    private readonly hotelRoomRepository: Repository<HotelRoom>,
    @InjectRepository(HotelBookingOrder)
    private readonly hotelBookingOrderRepository: Repository<HotelBookingOrder>,
    @InjectRepository(HotelStayRecord)
    private readonly hotelStayRecordRepository: Repository<HotelStayRecord>,
    private readonly shopService: ShopService,
    private readonly memberBalanceService: MemberBalanceService,
    private readonly memberQueryService: MemberQueryService,
    private readonly notifyService: NotifyService,
  ) {}

  /**
   * 后台分页查询当前门店房型。
   */
  async pageRoomTypes(pageValue: unknown, pageSizeValue: unknown): Promise<PageResult<HotelRoomType>> {
    const pageResult = resolvePage(pageValue, pageSizeValue);
    const [list, total] = await this.hotelRoomTypeRepository.findAndCount({
      order: { id: 'DESC' },
      skip: pageResult.skip,
      take: pageResult.pageSize,
    });
    return { list, total, page: pageResult.page, pageSize: pageResult.pageSize };
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
  async createRoomType(command: SaveHotelRoomTypeCommand): Promise<HotelRoomType> {
    this.assertRoomTypeCommand(command);
    const hotelRoomType = new HotelRoomType();
    hotelRoomType.shopId = this.requireCurrentShopId();
    this.fillRoomType(hotelRoomType, command);
    return this.hotelRoomTypeRepository.save(hotelRoomType);
  }

  /**
   * 修改当前门店房型。
   */
  async updateRoomType(roomTypeId: string, command: SaveHotelRoomTypeCommand): Promise<HotelRoomType> {
    this.assertRoomTypeCommand(command);
    const hotelRoomType = await this.hotelRoomTypeRepository.findOne({ where: { id: roomTypeId } });
    if (isEmpty(hotelRoomType)) {
      throw new BusinessException('房型不存在');
    }
    this.fillRoomType(hotelRoomType, command);
    return this.hotelRoomTypeRepository.save(hotelRoomType);
  }

  /**
   * 后台分页查询当前门店房间。
   */
  async pageRooms(roomStatus: string, roomTypeId: string, pageValue: unknown, pageSizeValue: unknown): Promise<PageResult<HotelRoom>> {
    if (!isEmpty(roomStatus) && !isOneOf(roomStatus, Object.values(HotelRoomStatus))) {
      throw new BusinessException('房态不正确');
    }
    const pageResult = resolvePage(pageValue, pageSizeValue);
    const whereCondition: FindOptionsWhere<HotelRoom> = {};
    if (!isEmpty(roomStatus)) {
      whereCondition.roomStatus = roomStatus;
    }
    if (!isEmpty(roomTypeId)) {
      whereCondition.roomTypeId = roomTypeId;
    }
    const [list, total] = await this.hotelRoomRepository.findAndCount({
      where: whereCondition,
      order: { roomNo: 'ASC' },
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
      // 3. 扣房费。余额不足时订单、房态和余额一起回滚
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
      // 4. 完成退房并释放房间
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
          hotelRoom.roomStatus = HotelRoomStatus.IDLE;
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
    if (!isOneOf(command.bedType, Object.values(HotelBedType))) {
      throw new BusinessException('床型不正确');
    }
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
   * 写入房型字段。
   */
  private fillRoomType(hotelRoomType: HotelRoomType, command: SaveHotelRoomTypeCommand): void {
    hotelRoomType.typeName = command.typeName;
    hotelRoomType.bedType = command.bedType;
    hotelRoomType.price = toMoneyString(command.price);
    hotelRoomType.status = command.status;
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
    const memberIdList = bookingOrderList.map((bookingOrder) => toIdentifier(bookingOrder.memberId));
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
        memberName: isEmpty(memberAccount) ? '' : memberAccount.memberName,
        mobile: isEmpty(memberAccount) ? '' : memberAccount.mobile,
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
