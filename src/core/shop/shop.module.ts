import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SysUserShop } from '../rbac/sys.entities';
import { ShopImage } from './shop-image.entity';
import { Shop } from './shop.entity';
import { ShopService } from './shop.service';

/**
 * 门店主数据模块。
 */
@Module({
  imports: [TypeOrmModule.forFeature([Shop, ShopImage, SysUserShop])],
  providers: [ShopService],
  exports: [ShopService],
})
export class ShopModule {}
