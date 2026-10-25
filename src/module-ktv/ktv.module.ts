import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../core/auth/auth.module';
import { FinanceModule } from '../core/finance/finance.module';
import { MemberModule } from '../core/member/member.module';
import { NotifyModule } from '../core/notify/notify.module';
import { ShopModule } from '../core/shop/shop.module';
import { PointModule } from '../module-point/point.module';
import { KtvShopAdminController, ShopAppController } from './ktv-shop.controller';
import { KtvAdminController, KtvAppController } from './ktv.controller';
import { KtvBookingOrder, KtvConsumeOrder, KtvRoom, KtvRoomType, KtvRoomTypeImage } from './ktv.entities';
import { KtvService } from './ktv.service';

/**
 * KTV 业务模块。只调用 core 服务扣余额，不注入会员账户仓储。
 */
@Module({
  imports: [TypeOrmModule.forFeature([KtvRoomType, KtvRoomTypeImage, KtvRoom, KtvBookingOrder, KtvConsumeOrder]), forwardRef(() => AuthModule), FinanceModule, MemberModule, NotifyModule, ShopModule, PointModule],
  controllers: [KtvAdminController, KtvAppController, KtvShopAdminController, ShopAppController],
  providers: [KtvService],
})
export class KtvModule {}
