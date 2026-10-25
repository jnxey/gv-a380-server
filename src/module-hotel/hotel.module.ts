import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../core/auth/auth.module';
import { FinanceModule } from '../core/finance/finance.module';
import { MemberModule } from '../core/member/member.module';
import { NotifyModule } from '../core/notify/notify.module';
import { ShopModule } from '../core/shop/shop.module';
import { PointModule } from '../module-point/point.module';
import { HotelAdminController, HotelAppController } from './hotel.controller';
import { HotelShopAdminController } from './hotel-shop.controller';
import { HotelBookingOrder, HotelRoom, HotelRoomType, HotelRoomTypeImage, HotelStayRecord } from './hotel.entities';
import { HotelService } from './hotel.service';

/**
 * 酒店业务模块。房费扣减只调用 core 的余额服务。
 */
@Module({
  imports: [TypeOrmModule.forFeature([HotelRoomType, HotelRoomTypeImage, HotelRoom, HotelBookingOrder, HotelStayRecord]), AuthModule, FinanceModule, MemberModule, NotifyModule, ShopModule, PointModule],
  controllers: [HotelAdminController, HotelAppController, HotelShopAdminController],
  providers: [HotelService],
})
export class HotelModule {}
