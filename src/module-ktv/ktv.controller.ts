import { Body, Controller, Delete, ForbiddenException, Get, Param, Post, Put, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { DetailDescriptionLimit, HotelWalkInContact, KtvBookingHour, KtvOccupyDuration, KtvOrderStatus, KtvPendingVerifyWindow, KtvRoomStatus, ModuleCode, PermissionCode, RecordStatus, ShopImageLimit } from '../common/constants';
import { PageQueryDto } from '../common/dto/page-query.dto';
import { CurrentAccount } from '../common/decorators/current-account.decorator';
import { ShopContext } from '../common/context/shop-context';
import { RequireModule, RequirePermission, RequiresShop } from '../common/decorators/auth.decorators';
import { LoginAccountContext } from '../common/interfaces/login-account-context';
import { isEmpty } from '../common/tools';
import { FinanceBillService } from '../core/finance/finance-bill.service';
import { KtvService } from './ktv.service';

/**
 * 包厢类型描述。预定简述、退订规则、预订须知。
 */
export class KtvRoomTypeDescriptionDto {
  @IsOptional()
  @IsString()
  @MaxLength(DetailDescriptionLimit.MAX_LENGTH)
  bookingSummary?: string;

  @IsOptional()
  @IsString()
  @MaxLength(DetailDescriptionLimit.MAX_LENGTH)
  cancelRule?: string;

  @IsOptional()
  @IsString()
  @MaxLength(DetailDescriptionLimit.MAX_LENGTH)
  bookingNotice?: string;
}

/**
 * 后台保存包厢类型。
 */
export class SaveKtvRoomTypeDto {
  @IsString()
  @IsNotEmpty()
  typeName: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => KtvRoomTypeDescriptionDto)
  description?: KtvRoomTypeDescriptionDto;

  @IsNotEmpty()
  hourlyPrice: string | number;

  @IsIn(Object.values(RecordStatus))
  status: string;
}

/**
 * 手动切换包厢运营状态。线下开包厢可以把空闲写成使用中，并带上演唱时长。
 */
export class UpdateKtvRoomStatusDto {
  @IsIn(Object.values(KtvRoomStatus))
  roomStatus: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn(KtvOccupyDuration.HOUR_LIST)
  durationHours?: number;
}

/**
 * 延长使用中包厢。每次只能延长 1 小时。
 */
export class ExtendOccupyDto {
  @Type(() => Number)
  @IsInt()
  @IsIn([KtvOccupyDuration.EXTEND_HOURS])
  durationHours: number;
}

/**
 * 后台保存包厢。
 */
export class SaveKtvRoomDto {
  @IsString()
  @IsNotEmpty()
  roomNo: string;

  @IsString()
  @IsNotEmpty()
  roomName: string;

  @IsString()
  @IsNotEmpty()
  roomTypeId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  capacity: number;

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
 * 后台预订查询。
 */
export class KtvBookingQueryDto extends PageQueryDto {
  @IsOptional()
  @IsString()
  verifyCode?: string;

  @IsOptional()
  @IsIn(Object.values(KtvOrderStatus))
  orderStatus?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([KtvPendingVerifyWindow.HOURS])
  recentHours?: number;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;
}

/**
 * 店内消费。
 */
export class KtvConsumeDto {
  @IsNotEmpty()
  amount: string | number;

  @IsOptional()
  @IsString()
  remark?: string;
}

/**
 * 核销时分配的包厢。
 */
export class VerifyKtvBookingDto {
  @IsString()
  @IsNotEmpty()
  roomId: string;
}

/**
 * 小程序创建预订。
 */
export class CreateKtvBookingDto {
  @IsString()
  @IsNotEmpty()
  shopId: string;

  @IsString()
  @IsNotEmpty()
  roomTypeId: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  bookingDate: string;

  @Matches(/^\d{2}:\d{2}:\d{2}$/)
  startTime: string;

  @Type(() => Number)
  @IsInt()
  @Min(KtvBookingHour.MIN)
  @Max(KtvBookingHour.MAX)
  durationHours: number;

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
 * 按用户名、手机号或邮箱查找会员。
 */
export class KtvMemberKeywordDto {
  @IsString()
  @IsNotEmpty()
  keyword: string;
}

/**
 * 付款/充值二维码密文。
 */
export class KtvPayQrDto {
  @IsString()
  @IsNotEmpty()
  cipherText: string;
}

/**
 * 当前门店扣减会员余额。
 */
export class KtvDeductDto {
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
 * 当前门店财务流水查询参数。门店不接收前端传入。
 */
export class KtvBillQueryDto extends PageQueryDto {
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
 * 后台 KTV 接口。查询条件中的门店由 @RequiresShop 注入，不信任请求里的 shopId。
 */
@Controller('admin/ktv')
@RequireModule(ModuleCode.KTV)
@RequiresShop()
export class KtvAdminController {
  constructor(
    private readonly ktvService: KtvService,
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
  @RequirePermission(PermissionCode.KTV_BILL_QUERY)
  summarizeBills(@Query() ktvBillQueryDto: KtvBillQueryDto) {
    const currentShopId = this.readCurrentShopId();
    return this.financeBillService.summarizeBills(
      [currentShopId],
      currentShopId,
      ktvBillQueryDto.bizType || '',
      ktvBillQueryDto.startDate || '',
      ktvBillQueryDto.endDate || '',
    );
  }

  /**
   * 按当前筛选条件导出当前门店财务流水。
   */
  @Get('bills/export')
  @RequirePermission(PermissionCode.KTV_BILL_QUERY)
  exportBills(@Query() ktvBillQueryDto: KtvBillQueryDto) {
    const currentShopId = this.readCurrentShopId();
    return this.financeBillService.listBillsForExport(
      [currentShopId],
      currentShopId,
      ktvBillQueryDto.bizType || '',
      ktvBillQueryDto.keyword || '',
      ktvBillQueryDto.startDate || '',
      ktvBillQueryDto.endDate || '',
    );
  }

  /**
   * 分页查询当前门店财务流水。
   */
  @Get('bills')
  @RequirePermission(PermissionCode.KTV_BILL_QUERY)
  pageBills(@Query() ktvBillQueryDto: KtvBillQueryDto) {
    const currentShopId = this.readCurrentShopId();
    return this.financeBillService.pageBills(
      [currentShopId],
      currentShopId,
      ktvBillQueryDto.bizType || '',
      ktvBillQueryDto.keyword || '',
      ktvBillQueryDto.startDate || '',
      ktvBillQueryDto.endDate || '',
      ktvBillQueryDto.page,
      ktvBillQueryDto.pageSize,
    );
  }

  /**
   * 查询当前门店最近的店内消费和扫码付款，供前台到账提示。
   */
  @Get('payment-notices')
  @RequirePermission(PermissionCode.KTV_ROOM_QUERY)
  listPaymentNotices() {
    return this.financeBillService.listRecentPaymentNotices();
  }

  /**
   * 查询当前门店全部包厢类型。
   */
  @Get('room-types')
  @RequirePermission(PermissionCode.KTV_ROOM_TYPE_QUERY)
  pageRoomTypes() {
    return this.ktvService.pageRoomTypes();
  }

  /**
   * 新建包厢类型。
   */
  @Post('room-types')
  @RequirePermission(PermissionCode.KTV_ROOM_TYPE_SAVE)
  createRoomType(@Body() saveKtvRoomTypeDto: SaveKtvRoomTypeDto) {
    return this.ktvService.createRoomType(saveKtvRoomTypeDto);
  }

  /**
   * 给当前门店的包厢类型上传一张图片。
   */
  @Post('room-types/:roomTypeId/images')
  @RequirePermission(PermissionCode.KTV_ROOM_TYPE_SAVE)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: ShopImageLimit.MAX_BYTES } }))
  addRoomTypeImage(@Param('roomTypeId') roomTypeId: string, @UploadedFile() file: Express.Multer.File) {
    return this.ktvService.addRoomTypeImage(roomTypeId, file);
  }

  /**
   * 重排当前门店包厢类型的图片。第一张是封面。
   */
  @Post('room-types/:roomTypeId/images/sort')
  @RequirePermission(PermissionCode.KTV_ROOM_TYPE_SAVE)
  async sortRoomTypeImages(@Param('roomTypeId') roomTypeId: string, @Body() sortIdListDto: SortIdListDto) {
    await this.ktvService.sortRoomTypeImages(roomTypeId, sortIdListDto.idList);
    return null;
  }

  /**
   * 删除当前门店包厢类型的一张图片。
   */
  @Delete('room-types/:roomTypeId/images/:imageId')
  @RequirePermission(PermissionCode.KTV_ROOM_TYPE_SAVE)
  async removeRoomTypeImage(@Param('roomTypeId') roomTypeId: string, @Param('imageId') imageId: string) {
    await this.ktvService.removeRoomTypeImage(roomTypeId, imageId);
    return null;
  }

  /**
   * 按拖动结果保存包厢类型顺序。
   */
  @Put('room-types/sort')
  @RequirePermission(PermissionCode.KTV_ROOM_TYPE_SAVE)
  async sortRoomTypes(@Body() sortIdListDto: SortIdListDto) {
    await this.ktvService.sortRoomTypes(sortIdListDto.idList);
    return null;
  }

  /**
   * 修改包厢类型。
   */
  @Put('room-types/:roomTypeId')
  @RequirePermission(PermissionCode.KTV_ROOM_TYPE_SAVE)
  updateRoomType(@Param('roomTypeId') roomTypeId: string, @Body() saveKtvRoomTypeDto: SaveKtvRoomTypeDto) {
    return this.ktvService.updateRoomType(roomTypeId, saveKtvRoomTypeDto);
  }

  /**
   * 查询当前门店全部包厢。
   */
  @Get('rooms')
  @RequirePermission(PermissionCode.KTV_ROOM_QUERY)
  pageRooms() {
    return this.ktvService.pageRooms();
  }

  /**
   * 新建包厢。
   */
  @Post('rooms')
  @RequirePermission(PermissionCode.KTV_ROOM_SAVE)
  createRoom(@Body() saveKtvRoomDto: SaveKtvRoomDto) {
    return this.ktvService.createRoom(saveKtvRoomDto);
  }

  /**
   * 按拖动结果保存包厢顺序。
   */
  @Put('rooms/sort')
  @RequirePermission(PermissionCode.KTV_ROOM_SAVE)
  async sortRooms(@Body() sortIdListDto: SortIdListDto) {
    await this.ktvService.sortRooms(sortIdListDto.idList);
    return null;
  }

  /**
   * 手动切换包厢运营状态。
   */
  @Put('rooms/:roomId/room-status')
  @RequirePermission(PermissionCode.KTV_ROOM_SAVE)
  async updateRoomStatus(@Param('roomId') roomId: string, @Body() updateKtvRoomStatusDto: UpdateKtvRoomStatusDto) {
    await this.ktvService.updateRoomStatus(roomId, updateKtvRoomStatusDto.roomStatus, updateKtvRoomStatusDto.durationHours);
    return null;
  }

  /**
   * 延长使用中包厢的结束时间。
   */
  @Post('rooms/:roomId/extend-occupy')
  @RequirePermission(PermissionCode.KTV_ORDER_VERIFY)
  async extendOccupy(@Param('roomId') roomId: string, @Body() extendOccupyDto: ExtendOccupyDto) {
    await this.ktvService.extendOccupy(roomId, extendOccupyDto.durationHours);
    return null;
  }

  /**
   * 修改包厢。
   */
  @Put('rooms/:roomId')
  @RequirePermission(PermissionCode.KTV_ROOM_SAVE)
  updateRoom(@Param('roomId') roomId: string, @Body() saveKtvRoomDto: SaveKtvRoomDto) {
    return this.ktvService.updateRoom(roomId, saveKtvRoomDto);
  }

  /**
   * 分页查询预订订单。
   */
  @Get('booking-orders')
  @RequirePermission(PermissionCode.KTV_ORDER_QUERY)
  pageBookingOrders(@Query() ktvBookingQueryDto: KtvBookingQueryDto) {
    return this.ktvService.pageBookingOrders(
      ktvBookingQueryDto.verifyCode || '',
      ktvBookingQueryDto.orderStatus || '',
      ktvBookingQueryDto.recentHours,
      ktvBookingQueryDto.page,
      ktvBookingQueryDto.pageSize,
      ktvBookingQueryDto.startDate || '',
      ktvBookingQueryDto.endDate || '',
    );
  }

  /**
   * 查询这笔订单还能分配的空闲包厢。
   */
  @Get('booking-orders/:bookingOrderId/free-rooms')
  @RequirePermission(PermissionCode.KTV_ORDER_VERIFY)
  listFreeRooms(@Param('bookingOrderId') bookingOrderId: string) {
    return this.ktvService.listFreeRooms(bookingOrderId);
  }

  /**
   * 核销到店订单，并写入前台分配的包厢。
   */
  @Post('booking-orders/:bookingOrderId/verify')
  @RequirePermission(PermissionCode.KTV_ORDER_VERIFY)
  verifyBooking(@Param('bookingOrderId') bookingOrderId: string, @Body() verifyKtvBookingDto: VerifyKtvBookingDto) {
    return this.ktvService.verifyBooking(bookingOrderId, verifyKtvBookingDto.roomId);
  }

  /**
   * 登记店内消费并扣款。
   */
  @Post('booking-orders/:bookingOrderId/consume')
  @RequirePermission(PermissionCode.KTV_ORDER_CONSUME)
  createConsume(
    @Param('bookingOrderId') bookingOrderId: string,
    @Body() ktvConsumeDto: KtvConsumeDto,
    @CurrentAccount() loginAccountContext: LoginAccountContext,
  ) {
    return this.ktvService.createConsume(bookingOrderId, ktvConsumeDto.amount, ktvConsumeDto.remark || '', loginAccountContext.accountId);
  }

  /**
   * 取消预订并退款。
   */
  @Post('booking-orders/:bookingOrderId/cancel')
  @RequirePermission(PermissionCode.KTV_ORDER_CANCEL)
  cancelBooking(@Param('bookingOrderId') bookingOrderId: string, @CurrentAccount() loginAccountContext: LoginAccountContext) {
    return this.ktvService.cancelBooking(bookingOrderId, loginAccountContext.accountId);
  }

  /**
   * 按用户名、手机号或邮箱查找可扣款的会员。
   */
  @Get('members')
  @RequirePermission(PermissionCode.KTV_DEDUCT)
  findMember(@Query() ktvMemberKeywordDto: KtvMemberKeywordDto) {
    return this.ktvService.findMemberByKeyword(ktvMemberKeywordDto.keyword);
  }

  /**
   * 解开付款/充值二维码，返回对应会员。
   */
  @Post('pay-qr')
  @RequirePermission(PermissionCode.KTV_DEDUCT)
  findMemberByPayQr(@Body() ktvPayQrDto: KtvPayQrDto) {
    return this.ktvService.findMemberByPayQr(ktvPayQrDto.cipherText);
  }

  /**
   * 按当前 KTV 门店扣减会员余额。
   */
  @Post('deduct')
  @RequirePermission(PermissionCode.KTV_DEDUCT)
  deduct(@Body() ktvDeductDto: KtvDeductDto, @CurrentAccount() loginAccountContext: LoginAccountContext) {
    return this.ktvService.deductMemberBalance(ktvDeductDto.memberId, ktvDeductDto.amount, ktvDeductDto.remark || '', loginAccountContext.accountId);
  }
}

/**
 * 小程序 KTV 订房。会员身份来自令牌，不接收会员 ID。
 */
@Controller('app/ktv')
export class KtvAppController {
  constructor(private readonly ktvService: KtvService) {}

  /**
   * 查询指定 KTV 的可预订包厢类型。
   */
  @Get('room-types')
  listRoomTypes(@Query('shopId') shopId: string) {
    return this.ktvService.listEnabledRoomTypes(shopId);
  }

  /**
   * 查询指定 KTV 的可售包厢。
   */
  @Get('rooms')
  listRooms(@Query('shopId') shopId: string) {
    return this.ktvService.listEnabledRooms(shopId);
  }

  /**
   * 提交预订并扣减余额。
   */
  @Post('booking-orders')
  createBooking(@Body() createKtvBookingDto: CreateKtvBookingDto, @CurrentAccount() loginAccountContext: LoginAccountContext) {
    return this.ktvService.createBooking(loginAccountContext.accountId, createKtvBookingDto);
  }

  /**
   * 查询我的 KTV 订单。
   */
  @Get('booking-orders')
  pageBookingOrders(@Query() pageQueryDto: PageQueryDto, @CurrentAccount() loginAccountContext: LoginAccountContext) {
    return this.ktvService.pageMemberBookingOrders(loginAccountContext.accountId, pageQueryDto.page, pageQueryDto.pageSize);
  }

  /**
   * 会员取消自己的预订。开唱前半小时内不可取消。
   */
  @Post('booking-orders/:bookingOrderId/cancel')
  cancelBooking(@Param('bookingOrderId') bookingOrderId: string, @CurrentAccount() loginAccountContext: LoginAccountContext) {
    return this.ktvService.cancelMemberBooking(loginAccountContext.accountId, bookingOrderId);
  }
}
