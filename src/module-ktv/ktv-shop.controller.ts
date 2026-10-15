import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ModuleCode, PermissionCode, RecordStatus, ShopType } from '../common/constants';
import { RequireModule, RequirePermission, RequiresShop } from '../common/decorators/auth.decorators';
import { CurrentAccount } from '../common/decorators/current-account.decorator';
import { LoginAccountContext } from '../common/interfaces/login-account-context';
import { ShopService } from '../core/shop/shop.service';

/**
 * 保存 KTV 门店。
 */
export class SaveKtvShopDto {
  @IsString()
  @IsNotEmpty()
  shopCode: string;

  @IsString()
  @IsNotEmpty()
  shopName: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  contactPhone?: string;

  @IsIn(Object.values(RecordStatus))
  status: string;
}

/**
 * 小程序门店查询。
 */
export class AppShopQueryDto {
  @IsIn(Object.values(ShopType))
  shopType: string;
}

/**
 * 后台 KTV 门店维护。只处理 KTV 类型，且只能改已绑定门店。
 */
@Controller('admin/ktv/shops')
@RequireModule(ModuleCode.KTV)
@RequiresShop()
export class KtvShopAdminController {
  constructor(private readonly shopService: ShopService) {}

  /**
   * 查询当前账号绑定的 KTV 门店。
   */
  @Get()
  @RequirePermission(PermissionCode.KTV_SHOP_QUERY)
  async listShops(@CurrentAccount() loginAccountContext: LoginAccountContext) {
    const shopList = await this.shopService.listBoundShops(loginAccountContext.boundShopIdList, ShopType.KTV);
    return shopList.map((shop) => this.shopService.toShopView(shop));
  }

  /**
   * 新建 KTV 门店并绑定到当前操作人。
   */
  @Post()
  @RequirePermission(PermissionCode.KTV_SHOP_SAVE)
  async createShop(@Body() saveKtvShopDto: SaveKtvShopDto, @CurrentAccount() loginAccountContext: LoginAccountContext) {
    const shop = await this.shopService.createKtvShop({
      shopCode: saveKtvShopDto.shopCode,
      shopName: saveKtvShopDto.shopName,
      address: saveKtvShopDto.address || '',
      contactPhone: saveKtvShopDto.contactPhone || '',
      status: saveKtvShopDto.status,
      operatorId: loginAccountContext.accountId,
      boundShopIdList: loginAccountContext.boundShopIdList,
    });
    return this.shopService.toShopView(shop);
  }

  /**
   * 修改已绑定的 KTV 门店。
   */
  @Put(':shopId')
  @RequirePermission(PermissionCode.KTV_SHOP_SAVE)
  async updateShop(
    @Param('shopId') shopId: string,
    @Body() saveKtvShopDto: SaveKtvShopDto,
    @CurrentAccount() loginAccountContext: LoginAccountContext,
  ) {
    const shop = await this.shopService.updateKtvShop(shopId, {
      shopCode: saveKtvShopDto.shopCode,
      shopName: saveKtvShopDto.shopName,
      address: saveKtvShopDto.address || '',
      contactPhone: saveKtvShopDto.contactPhone || '',
      status: saveKtvShopDto.status,
      operatorId: loginAccountContext.accountId,
      boundShopIdList: loginAccountContext.boundShopIdList,
    });
    return this.shopService.toShopView(shop);
  }
}

/**
 * 小程序选择门店。这是消费选店，不是后台数据权限。
 */
@Controller('app/shops')
export class ShopAppController {
  constructor(private readonly shopService: ShopService) {}

  /**
   * 按门店类型列出启用门店。
   */
  @Get()
  async listShops(@Query() appShopQueryDto: AppShopQueryDto) {
    const shopList = await this.shopService.listEnabledByType(appShopQueryDto.shopType);
    return shopList.map((shop) => this.shopService.toShopView(shop));
  }
}
