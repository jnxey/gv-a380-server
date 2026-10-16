import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ModuleCode, PermissionCode, RecordStatus, ShopType } from '../common/constants';
import { RequireModule, RequirePermission, RequiresShop } from '../common/decorators/auth.decorators';
import { CurrentAccount } from '../common/decorators/current-account.decorator';
import { LoginAccountContext } from '../common/interfaces/login-account-context';
import { ShopService } from '../core/shop/shop.service';

/**
 * 保存酒店门店。
 */
export class SaveHotelShopDto {
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
 * 后台酒店门店维护。只处理酒店类型，且只能改已绑定门店。
 */
@Controller('admin/hotel/shops')
@RequireModule(ModuleCode.HOTEL)
@RequiresShop()
export class HotelShopAdminController {
  constructor(private readonly shopService: ShopService) {}

  /**
   * 查询当前账号绑定的酒店门店。
   */
  @Get()
  @RequirePermission(PermissionCode.HOTEL_SHOP_QUERY)
  async listShops(@CurrentAccount() loginAccountContext: LoginAccountContext) {
    const shopList = await this.shopService.listBoundShops(loginAccountContext.boundShopIdList, ShopType.HOTEL);
    return shopList.map((shop) => this.shopService.toShopView(shop));
  }

  /**
   * 新建酒店门店并绑定到当前操作人。
   */
  @Post()
  @RequirePermission(PermissionCode.HOTEL_SHOP_SAVE)
  async createShop(@Body() saveHotelShopDto: SaveHotelShopDto, @CurrentAccount() loginAccountContext: LoginAccountContext) {
    const shop = await this.shopService.createHotelShop({
      shopCode: saveHotelShopDto.shopCode,
      shopName: saveHotelShopDto.shopName,
      address: saveHotelShopDto.address || '',
      contactPhone: saveHotelShopDto.contactPhone || '',
      status: saveHotelShopDto.status,
      operatorId: loginAccountContext.accountId,
      boundShopIdList: loginAccountContext.boundShopIdList,
    });
    return this.shopService.toShopView(shop);
  }

  /**
   * 修改已绑定的酒店门店。
   */
  @Put(':shopId')
  @RequirePermission(PermissionCode.HOTEL_SHOP_SAVE)
  async updateShop(
    @Param('shopId') shopId: string,
    @Body() saveHotelShopDto: SaveHotelShopDto,
    @CurrentAccount() loginAccountContext: LoginAccountContext,
  ) {
    const shop = await this.shopService.updateHotelShop(shopId, {
      shopCode: saveHotelShopDto.shopCode,
      shopName: saveHotelShopDto.shopName,
      address: saveHotelShopDto.address || '',
      contactPhone: saveHotelShopDto.contactPhone || '',
      status: saveHotelShopDto.status,
      operatorId: loginAccountContext.accountId,
      boundShopIdList: loginAccountContext.boundShopIdList,
    });
    return this.shopService.toShopView(shop);
  }
}
