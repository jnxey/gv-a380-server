import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { IsIn, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';
import { HotelBedType, HotelRoomStatus, ModuleCode, PermissionCode, RecordStatus } from '../common/constants';
import { PageQueryDto } from '../common/dto/page-query.dto';
import { CurrentAccount } from '../common/decorators/current-account.decorator';
import { RequireModule, RequirePermission, RequiresShop } from '../common/decorators/auth.decorators';
import { LoginAccountContext } from '../common/interfaces/login-account-context';
import { HotelService } from './hotel.service';

/**
 * 保存房型。
 */
export class SaveHotelRoomTypeDto {
  @IsString()
  @IsNotEmpty()
  typeName: string;

  @IsIn(Object.values(HotelBedType))
  bedType: string;

  @IsNotEmpty()
  price: string | number;

  @IsIn(Object.values(RecordStatus))
  status: string;
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
}

/**
 * 后台酒店接口。
 */
@Controller('admin/hotel')
@RequireModule(ModuleCode.HOTEL)
@RequiresShop()
export class HotelAdminController {
  constructor(private readonly hotelService: HotelService) {}

  /**
   * 分页查询房型。
   */
  @Get('room-types')
  @RequirePermission(PermissionCode.HOTEL_ROOM_TYPE_QUERY)
  pageRoomTypes(@Query() pageQueryDto: PageQueryDto) {
    return this.hotelService.pageRoomTypes(pageQueryDto.page, pageQueryDto.pageSize);
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
   * 修改房型。
   */
  @Put('room-types/:roomTypeId')
  @RequirePermission(PermissionCode.HOTEL_ROOM_TYPE_SAVE)
  updateRoomType(@Param('roomTypeId') roomTypeId: string, @Body() saveHotelRoomTypeDto: SaveHotelRoomTypeDto) {
    return this.hotelService.updateRoomType(roomTypeId, saveHotelRoomTypeDto);
  }

  /**
   * 分页查询房间。
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
   * 退房并结算房费。
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
