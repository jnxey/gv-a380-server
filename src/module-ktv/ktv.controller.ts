import { Body, Controller, Delete, Get, Param, Post, Put, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { KtvBookingHour, KtvOrderStatus, KtvRoomStatus, ModuleCode, PermissionCode, RecordStatus, ShopImageLimit } from '../common/constants';
import { PageQueryDto } from '../common/dto/page-query.dto';
import { CurrentAccount } from '../common/decorators/current-account.decorator';
import { RequireModule, RequirePermission, RequiresShop } from '../common/decorators/auth.decorators';
import { LoginAccountContext } from '../common/interfaces/login-account-context';
import { KtvService } from './ktv.service';

/**
 * 后台保存包厢类型。
 */
export class SaveKtvRoomTypeDto {
  @IsString()
  @IsNotEmpty()
  typeName: string;

  @IsNotEmpty()
  hourlyPrice: string | number;

  @IsIn(Object.values(RecordStatus))
  status: string;
}

/**
 * 手动切换包厢运营状态。线下开包厢可以把空闲写成使用中。
 */
export class UpdateKtvRoomStatusDto {
  @IsIn(Object.values(KtvRoomStatus))
  roomStatus: string;
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
 * 后台 KTV 接口。查询条件中的门店由 @RequiresShop 注入，不信任请求里的 shopId。
 */
@Controller('admin/ktv')
@RequireModule(ModuleCode.KTV)
@RequiresShop()
export class KtvAdminController {
  constructor(private readonly ktvService: KtvService) {}

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
    await this.ktvService.updateRoomStatus(roomId, updateKtvRoomStatusDto.roomStatus);
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
      ktvBookingQueryDto.page,
      ktvBookingQueryDto.pageSize,
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
}
