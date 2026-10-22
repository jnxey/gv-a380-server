import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../core/auth/auth.module';
import { FinanceModule } from '../core/finance/finance.module';
import { MemberModule } from '../core/member/member.module';
import { ShopModule } from '../core/shop/shop.module';
import { StoreAdminController, StoreAppController } from './store.controller';
import { StoreShopAdminController } from './store-shop.controller';
import { StoreProduct, StoreProductImage, StorePurchase, StorePurchaseItem, StoreSale, StoreSaleItem } from './store.entities';
import { StoreService } from './store.service';

/**
 * 商铺业务模块。进货加库存，销售减库存，会员收款走 core 余额服务。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([StoreProduct, StoreProductImage, StorePurchase, StorePurchaseItem, StoreSale, StoreSaleItem]),
    AuthModule,
    FinanceModule,
    MemberModule,
    ShopModule,
  ],
  controllers: [StoreAdminController, StoreAppController, StoreShopAdminController],
  providers: [StoreService],
})
export class StoreModule {}
