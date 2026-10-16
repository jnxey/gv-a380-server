import { Body, Controller, Delete, Get, Param, Post, Put, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ModuleCode, PermissionCode, RecordStatus, ShopImageLimit, ShopType } from '../common/constants';
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
    return this.shopService.toShopViewList(shopList);
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
    return this.shopService.toShopViewWithImages(shop);
  }

  /**
   * 给已绑定的 KTV 门店上传一张图片。
   */
  @Post(':shopId/images')
  @RequirePermission(PermissionCode.KTV_SHOP_SAVE)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: ShopImageLimit.MAX_BYTES } }))
  async addImage(
    @Param('shopId') shopId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentAccount() loginAccountContext: LoginAccountContext,
  ) {
    return this.shopService.addShopImage(shopId, ShopType.KTV, loginAccountContext.boundShopIdList, file);
  }

  /**
   * 删除已绑定 KTV 门店的一张图片。
   */
  @Delete(':shopId/images/:imageId')
  @RequirePermission(PermissionCode.KTV_SHOP_SAVE)
  async removeImage(
    @Param('shopId') shopId: string,
    @Param('imageId') imageId: string,
    @CurrentAccount() loginAccountContext: LoginAccountContext,
  ) {
    await this.shopService.removeShopImage(shopId, imageId, ShopType.KTV, loginAccountContext.boundShopIdList);
    return null;
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
    return this.shopService.toShopViewWithImages(shop);
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
    return this.shopService.toShopViewList(shopList);
  }
}
