import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MemberModule } from '../member/member.module';
import { SysUserShop } from '../rbac/sys.entities';
import {
  HotelReviewAdminController,
  KtvReviewAdminController,
  ShopReviewAppController,
  StoreReviewAdminController,
} from './shop-review.controller';
import { ShopReview } from './shop-review.entity';
import { ShopReviewService } from './shop-review.service';
import { ShopImage } from './shop-image.entity';
import { Shop } from './shop.entity';
import { ShopService } from './shop.service';

/**
 * 门店主数据模块，并挂载共用门店评价。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Shop, ShopImage, SysUserShop, ShopReview]),
    forwardRef(() => MemberModule),
  ],
  controllers: [ShopReviewAppController, KtvReviewAdminController, HotelReviewAdminController, StoreReviewAdminController],
  providers: [ShopService, ShopReviewService],
  exports: [ShopService, ShopReviewService],
})
export class ShopModule {}
