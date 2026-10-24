import { Body, Controller, Delete, ForbiddenException, Get, Param, Post, Put, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ArrayNotEmpty, IsArray, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { FinanceBizType, HotelRoomStatus, HotelWalkInContact, HotelWalkInNight, ModuleCode, PermissionCode, RecordStatus, ShopImageLimit } from '../common/constants';
import { PageQueryDto } from '../common/dto/page-query.dto';
import { CurrentAccount } from '../common/decorators/current-account.decorator';
import { ShopContext } from '../common/context/shop-context';
import { RequireModule, RequirePermission, RequiresShop } from '../common/decorators/auth.decorators';
import { LoginAccountContext } from '../common/interfaces/login-account-context';
import { isEmpty } from '../common/tools';
import { FinanceBillService } from '../core/finance/finance-bill.service';
import { HotelService } from './hotel.service';

/**
 * 保存房型。
 */
export class SaveHotelRoomTypeDto {
  @IsString()
  @IsNotEmpty()
  typeName: string;

  @IsNotEmpty()
  price: string | number;

  @IsIn(Object.values(RecordStatus))
  status: string;
}

/**
 * 拖动排序提交的编号列表。
 */
export class SortIdListDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  idList: string[];
}

/**
 * 保存房间。
 */
export class SaveHotelRoomDto {
  @IsString()
  @IsNotEmpty()
  roomTypeId: string;

  @IsString()
  @IsNotEmpty()
  roomNo: string;

  @IsString()
  @IsNotEmpty()
  floorNo: string;

  @IsIn(Object.values(HotelRoomStatus))
  roomStatus: string;
}

/**
 * 房间查询。
 */
export class HotelRoomQueryDto extends PageQueryDto {
  @IsOptional()
  @IsIn(Object.values(HotelRoomStatus))
  roomStatus?: string;

  @IsOptional()
  @IsString()
  roomTypeId?: string;
}

/**
 * 入住分配房间。
 */
export class HotelCheckInDto {
  @IsString()
  @IsNotEmpty()
  roomId: string;
}

/**
 * 续住。
 */
export class HotelExtendDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  checkOutDate: string;
}

/**
 * 手动切换空闲、打扫中或维修。在住不从这里改。
 */
export class UpdateHotelRoomStatusDto {
  @IsIn([HotelRoomStatus.IDLE, HotelRoomStatus.CLEANING, HotelRoomStatus.MAINTENANCE])
  roomStatus: string;
}

/**
 * 解开付款码。
 */
export class HotelPayQrDto {
  @IsString()
  @IsNotEmpty()
  cipherText: string;
}

/**
 * 当前门店扣减会员余额。
 */
export class HotelDeductDto {
  @IsString()
  @IsNotEmpty()
  memberId: string;

  @IsNotEmpty()
  amount: string | number;

  @IsOptional()
  @IsString()
  remark?: string;
}

/**
 * 没有预订时按今天入住。联系方式不查会员，晚数决定离店日。
 */
export class HotelWalkInDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(HotelWalkInContact.MAX_LENGTH)
  contact: string;

  @IsInt()
  @Min(HotelWalkInNight.MIN_COUNT)
  @Max(HotelWalkInNight.MAX_COUNT)
  nightCount: number;
}

/**
 * 当前门店财务流水查询参数。门店不接收前端传入。
 */
export class HotelBillQueryDto extends PageQueryDto {
  @IsOptional()
  @IsString()
  bizType?: string;

  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;
}

/**
 * 小程序预订酒店。
 */
export class CreateHotelBookingDto {
  @IsString()
  @IsNotEmpty()
  shopId: string;

  @IsString()
  @IsNotEmpty()
  roomTypeId: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  checkInDate: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  checkOutDate: string;

  @IsString()
  @IsNotEmpty({ message: '请填写预定人' })
  @MaxLength(HotelWalkInContact.MAX_LENGTH, { message: '预定人过长' })
  guestName: string;

  @IsString()
  @IsNotEmpty({ message: '请填写联系方式' })
  @MaxLength(HotelWalkInContact.MAX_LENGTH, { message: '联系方式过长' })
  contact: string;

  @IsString()
  @IsNotEmpty()
  cipherText: string;
}

/**
 * 后台酒店接口。
 */
@Controller('admin/hotel')
@RequireModule(ModuleCode.HOTEL)
@RequiresShop()
export class HotelAdminController {
  constructor(
    private readonly hotelService: HotelService,
    private readonly financeBillService: FinanceBillService,
  ) {}

  /**
   * 读取本次请求已经校验过的当前门店。
   */
  private readCurrentShopId(): string {
    const currentShopId = ShopContext.getCurrentShopId();
    if (isEmpty(currentShopId)) {
      throw new ForbiddenException('请选择门店');
    }
    return currentShopId;
  }

  /**
   * 汇总当前门店的收入和支出。
   */
  @Get('bills/summary')
  @RequirePermission(PermissionCode.HOTEL_BILL_QUERY)
  summarizeBills(@Query() hotelBillQueryDto: HotelBillQueryDto) {
    const currentShopId = this.readCurrentShopId();
    return this.financeBillService.summarizeBills(
      [currentShopId],
      currentShopId,
      hotelBillQueryDto.bizType || '',
      hotelBillQueryDto.startDate || '',
      hotelBillQueryDto.endDate || '',
      FinanceBizType.RECHARGE,
    );
  }

  /**
   * 查询当前门店最近的酒店店内消费和扫码付款，供前台到账提示。
   */
  @Get('payment-notices')
  @RequirePermission(PermissionCode.HOTEL_ROOM_QUERY)
  listPaymentNotices() {
    return this.financeBillService.listRecentPaymentNotices([FinanceBizType.HOTEL_IN_STORE, FinanceBizType.SHOP_SCAN_PAY]);
  }

  /**
   * 按当前筛选条件导出当前门店财务流水。不含会员充值。
   */
  @Get('bills/export')
  @RequirePermission(PermissionCode.HOTEL_BILL_QUERY)
  exportBills(@Query() hotelBillQueryDto: HotelBillQueryDto) {
    const currentShopId = this.readCurrentShopId();
    return this.financeBillService.listBillsForExport(
      [currentShopId],
      currentShopId,
      hotelBillQueryDto.bizType || '',
      hotelBillQueryDto.keyword || '',
      hotelBillQueryDto.startDate || '',
      hotelBillQueryDto.endDate || '',
      FinanceBizType.RECHARGE,
    );
  }

  /**
   * 分页查询当前门店财务流水。
   */
  @Get('bills')
  @RequirePermission(PermissionCode.HOTEL_BILL_QUERY)
  pageBills(@Query() hotelBillQueryDto: HotelBillQueryDto) {
    const currentShopId = this.readCurrentShopId();
    return this.financeBillService.pageBills(
      [currentShopId],
      currentShopId,
      hotelBillQueryDto.bizType || '',
      hotelBillQueryDto.keyword || '',
      hotelBillQueryDto.startDate || '',
      hotelBillQueryDto.endDate || '',
      hotelBillQueryDto.page,
      hotelBillQueryDto.pageSize,
      FinanceBizType.RECHARGE,
    );
  }

  /**
   * 解开付款码，返回对应会员。
   */
  @Post('pay-qr')
  @RequirePermission(PermissionCode.HOTEL_DEDUCT)
  findMemberByPayQr(@Body() hotelPayQrDto: HotelPayQrDto) {
    return this.hotelService.findMemberByPayQr(hotelPayQrDto.cipherText);
  }

  /**
   * 按当前酒店门店扣减会员余额。
   */
  @Post('deduct')
  @RequirePermission(PermissionCode.HOTEL_DEDUCT)
  deduct(@Body() hotelDeductDto: HotelDeductDto, @CurrentAccount() loginAccountContext: LoginAccountContext) {
    return this.hotelService.deductMemberBalance(hotelDeductDto.memberId, hotelDeductDto.amount, hotelDeductDto.remark || '', loginAccountContext.accountId);
  }

  /**
   * 查询当前门店全部房型。
   */
  @Get('room-types')
  @RequirePermission(PermissionCode.HOTEL_ROOM_TYPE_QUERY)
  pageRoomTypes() {
    return this.hotelService.pageRoomTypes();
  }

  /**
   * 新建房型。
   */
  @Post('room-types')
  @RequirePermission(PermissionCode.HOTEL_ROOM_TYPE_SAVE)
  createRoomType(@Body() saveHotelRoomTypeDto: SaveHotelRoomTypeDto) {
    return this.hotelService.createRoomType(saveHotelRoomTypeDto);
  }

  /**
   * 给当前门店的房型上传一张图片。
   */
  @Post('room-types/:roomTypeId/images')
  @RequirePermission(PermissionCode.HOTEL_ROOM_TYPE_SAVE)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: ShopImageLimit.MAX_BYTES } }))
  addRoomTypeImage(@Param('roomTypeId') roomTypeId: string, @UploadedFile() file: Express.Multer.File) {
    return this.hotelService.addRoomTypeImage(roomTypeId, file);
  }

  /**
   * 重排当前门店房型的图片。第一张是封面。
   */
  @Post('room-types/:roomTypeId/images/sort')
  @RequirePermission(PermissionCode.HOTEL_ROOM_TYPE_SAVE)
  async sortRoomTypeImages(@Param('roomTypeId') roomTypeId: string, @Body() sortIdListDto: SortIdListDto) {
    await this.hotelService.sortRoomTypeImages(roomTypeId, sortIdListDto.idList);
    return null;
  }

  /**
   * 删除当前门店房型的一张图片。
   */
  @Delete('room-types/:roomTypeId/images/:imageId')
  @RequirePermission(PermissionCode.HOTEL_ROOM_TYPE_SAVE)
  async removeRoomTypeImage(@Param('roomTypeId') roomTypeId: string, @Param('imageId') imageId: string) {
    await this.hotelService.removeRoomTypeImage(roomTypeId, imageId);
    return null;
  }

  /**
   * 按拖动结果保存房型顺序。
   */
  @Put('room-types/sort')
  @RequirePermission(PermissionCode.HOTEL_ROOM_TYPE_SAVE)
  async sortRoomTypes(@Body() sortIdListDto: SortIdListDto) {
    await this.hotelService.sortRoomTypes(sortIdListDto.idList);
    return null;
  }

  /**
   * 修改房型。
   */
  @Put('room-types/:roomTypeId')
  @RequirePermission(PermissionCode.HOTEL_ROOM_TYPE_SAVE)
  updateRoomType(@Param('roomTypeId') roomTypeId: string, @Body() saveHotelRoomTypeDto: SaveHotelRoomTypeDto) {
    return this.hotelService.updateRoomType(roomTypeId, saveHotelRoomTypeDto);
  }

  /**
   * 查询当前门店房间。不传页码时返回全部，传入页码时仍分页。房态和房型筛选仍然生效。
   */
  @Get('rooms')
  @RequirePermission(PermissionCode.HOTEL_ROOM_QUERY)
  pageRooms(@Query() hotelRoomQueryDto: HotelRoomQueryDto) {
    return this.hotelService.pageRooms(
      hotelRoomQueryDto.roomStatus || '',
      hotelRoomQueryDto.roomTypeId || '',
      hotelRoomQueryDto.page,
      hotelRoomQueryDto.pageSize,
    );
  }

  /**
   * 新建房间。
   */
  @Post('rooms')
  @RequirePermission(PermissionCode.HOTEL_ROOM_SAVE)
  createRoom(@Body() saveHotelRoomDto: SaveHotelRoomDto) {
    return this.hotelService.createRoom(saveHotelRoomDto);
  }

  /**
   * 按拖动结果保存房间顺序。
   */
  @Put('rooms/sort')
  @RequirePermission(PermissionCode.HOTEL_ROOM_SAVE)
  async sortRooms(@Body() sortIdListDto: SortIdListDto) {
    await this.hotelService.sortRooms(sortIdListDto.idList);
    return null;
  }

  /**
   * 没有预订时按今天入住这间房。
   */
  @Post('rooms/:roomId/walk-in')
  @RequirePermission(PermissionCode.HOTEL_STAY_CHECK_IN)
  async walkIn(@Param('roomId') roomId: string, @Body() hotelWalkInDto: HotelWalkInDto) {
    await this.hotelService.walkIn(roomId, hotelWalkInDto.contact, hotelWalkInDto.nightCount);
    return null;
  }

  /**
   * 打扫完成，房间改回空闲。
   */
  @Post('rooms/:roomId/finish-cleaning')
  @RequirePermission(PermissionCode.HOTEL_STAY_CHECK_OUT)
  async finishCleaning(@Param('roomId') roomId: string) {
    await this.hotelService.finishCleaning(roomId);
    return null;
  }

  /**
   * 手动切换空闲、打扫中或维修。在住房必须先退房。
   */
  @Post('rooms/:roomId/room-status')
  @RequirePermission(PermissionCode.HOTEL_ROOM_SAVE)
  async updateRoomStatus(@Param('roomId') roomId: string, @Body() updateHotelRoomStatusDto: UpdateHotelRoomStatusDto) {
    await this.hotelService.updateRoomStatus(roomId, updateHotelRoomStatusDto.roomStatus);
    return null;
  }

  /**
   * 修改房间。
   */
  @Put('rooms/:roomId')
  @RequirePermission(PermissionCode.HOTEL_ROOM_SAVE)
  updateRoom(@Param('roomId') roomId: string, @Body() saveHotelRoomDto: SaveHotelRoomDto) {
    return this.hotelService.updateRoom(roomId, saveHotelRoomDto);
  }

  /**
   * 分页查询酒店订单。
   */
  @Get('booking-orders')
  @RequirePermission(PermissionCode.HOTEL_ORDER_QUERY)
  pageBookingOrders(@Query() pageQueryDto: PageQueryDto) {
    return this.hotelService.pageBookingOrders(pageQueryDto.page, pageQueryDto.pageSize);
  }

  /**
   * 办理入住。
   */
  @Post('booking-orders/:bookingOrderId/check-in')
  @RequirePermission(PermissionCode.HOTEL_STAY_CHECK_IN)
  checkIn(@Param('bookingOrderId') bookingOrderId: string, @Body() hotelCheckInDto: HotelCheckInDto) {
    return this.hotelService.checkIn(bookingOrderId, hotelCheckInDto.roomId);
  }

  /**
   * 续住。
   */
  @Post('booking-orders/:bookingOrderId/extend')
  @RequirePermission(PermissionCode.HOTEL_STAY_EXTEND)
  extendStay(@Param('bookingOrderId') bookingOrderId: string, @Body() hotelExtendDto: HotelExtendDto) {
    return this.hotelService.extendStay(bookingOrderId, hotelExtendDto.checkOutDate);
  }

  /**
   * 退房。房费记在订单上，不扣会员余额。
   */
  @Post('booking-orders/:bookingOrderId/check-out')
  @RequirePermission(PermissionCode.HOTEL_STAY_CHECK_OUT)
  checkOut(@Param('bookingOrderId') bookingOrderId: string, @CurrentAccount() loginAccountContext: LoginAccountContext) {
    return this.hotelService.checkOut(bookingOrderId, loginAccountContext.accountId);
  }

  /**
   * 取消未入住订单。
   */
  @Post('booking-orders/:bookingOrderId/cancel')
  @RequirePermission(PermissionCode.HOTEL_ORDER_CANCEL)
  cancelBooking(@Param('bookingOrderId') bookingOrderId: string) {
    return this.hotelService.cancelBooking(bookingOrderId);
  }
}

/**
 * 小程序酒店订房。预订不扣款。
 */
@Controller('app/hotel')
export class HotelAppController {
  constructor(private readonly hotelService: HotelService) {}

  /**
   * 查询指定酒店的可售房型。
   */
  @Get('room-types')
  listRoomTypes(@Query('shopId') shopId: string) {
    return this.hotelService.listEnabledRoomTypes(shopId);
  }

  /**
   * 提交预订。
   */
  @Post('booking-orders')
  createBooking(@Body() createHotelBookingDto: CreateHotelBookingDto, @CurrentAccount() loginAccountContext: LoginAccountContext) {
    return this.hotelService.createBooking(loginAccountContext.accountId, createHotelBookingDto);
  }

  /**
   * 查询我的酒店订单。
   */
  @Get('booking-orders')
  pageBookingOrders(@Query() pageQueryDto: PageQueryDto, @CurrentAccount() loginAccountContext: LoginAccountContext) {
    return this.hotelService.pageMemberBookingOrders(loginAccountContext.accountId, pageQueryDto.page, pageQueryDto.pageSize);
  }
}
