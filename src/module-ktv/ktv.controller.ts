import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Min } from 'class-validator';
import { KtvRoomType, ModuleCode, PermissionCode, RecordStatus } from '../common/constants';
import { PageQueryDto } from '../common/dto/page-query.dto';
import { CurrentAccount } from '../common/decorators/current-account.decorator';
import { RequireModule, RequirePermission, RequiresShop } from '../common/decorators/auth.decorators';
import { LoginAccountContext } from '../common/interfaces/login-account-context';
import { KtvService } from './ktv.service';

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

  @IsIn(Object.values(KtvRoomType))
  roomType: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  capacity: number;

  @IsNotEmpty()
  price: string | number;

  @IsIn(Object.values(RecordStatus))
  status: string;
}

/**
 * 后台预订查询。
 */
export class KtvBookingQueryDto extends PageQueryDto {
  @IsOptional()
  @IsString()
  verifyCode?: string;
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
 * 小程序创建预订。
 */
export class CreateKtvBookingDto {
  @IsString()
  @IsNotEmpty()
  shopId: string;

  @IsString()
  @IsNotEmpty()
  roomId: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  bookingDate: string;

  @Matches(/^\d{2}:\d{2}:\d{2}$/)
  startTime: string;

  @Matches(/^\d{2}:\d{2}:\d{2}$/)
  endTime: string;
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
    return this.ktvService.pageBookingOrders(ktvBookingQueryDto.verifyCode || '', ktvBookingQueryDto.page, ktvBookingQueryDto.pageSize);
  }

  /**
   * 核销到店订单。
   */
  @Post('booking-orders/:bookingOrderId/verify')
  @RequirePermission(PermissionCode.KTV_ORDER_VERIFY)
  verifyBooking(@Param('bookingOrderId') bookingOrderId: string) {
    return this.ktvService.verifyBooking(bookingOrderId);
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
}

/**
 * 小程序 KTV 订房。会员身份来自令牌，不接收会员 ID。
 */
@Controller('app/ktv')
export class KtvAppController {
  constructor(private readonly ktvService: KtvService) {}

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
