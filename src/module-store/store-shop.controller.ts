import { Body, Controller, Delete, Get, Param, Post, Put, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsDefined, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ModuleCode, PermissionCode, RecordStatus, ShopImageLimit, ShopType } from '../common/constants';
import { RequireModule, RequirePermission, RequiresShop } from '../common/decorators/auth.decorators';
import { CurrentAccount } from '../common/decorators/current-account.decorator';
import { LoginAccountContext } from '../common/interfaces/login-account-context';
import { ShopService } from '../core/shop/shop.service';

/**
 * 商铺门店地址。经纬度是数字，描述是文字。
 */
export class StoreShopAddressDto {
  @IsNumber()
  longitude: number;

  @IsNumber()
  latitude: number;

  @IsString()
  addressText: string;
}

/**
 * 保存商铺门店。
 */
export class SaveStoreShopDto {
  @IsString()
  @IsNotEmpty()
  shopCode: string;

  @IsString()
  @IsNotEmpty()
  shopName: string;

  @IsOptional()
  @IsString()
  contactPhone?: string;

  @IsString()
  @IsNotEmpty()
  timeZone: string;

  @IsDefined()
  @ValidateNested()
  @Type(() => StoreShopAddressDto)
  shopAddress: StoreShopAddressDto;

  @IsIn(Object.values(RecordStatus))
  status: string;
}

/**
 * 后台商铺门店维护。只处理商铺类型，且只能改已绑定门店。
 */
@Controller('admin/store/shops')
@RequireModule(ModuleCode.STORE)
@RequiresShop()
export class StoreShopAdminController {
  constructor(private readonly shopService: ShopService) {}

  /**
   * 查询当前账号绑定的商铺门店。
   */
  @Get()
  @RequirePermission(PermissionCode.STORE_SHOP_QUERY)
  async listShops(@CurrentAccount() loginAccountContext: LoginAccountContext) {
    const shopList = await this.shopService.listBoundShops(loginAccountContext.boundShopIdList, ShopType.STORE);
    return this.shopService.toShopViewList(shopList);
  }

  /**
   * 新建商铺门店并绑定到当前操作人。
   */
  @Post()
  @RequirePermission(PermissionCode.STORE_SHOP_SAVE)
  async createShop(@Body() saveStoreShopDto: SaveStoreShopDto, @CurrentAccount() loginAccountContext: LoginAccountContext) {
    const shop = await this.shopService.createStoreShop({
      shopCode: saveStoreShopDto.shopCode,
      shopName: saveStoreShopDto.shopName,
      address: '',
      contactPhone: saveStoreShopDto.contactPhone || '',
      status: saveStoreShopDto.status,
      timeZone: saveStoreShopDto.timeZone,
      shopAddress: saveStoreShopDto.shopAddress,
      operatorId: loginAccountContext.accountId,
      boundShopIdList: loginAccountContext.boundShopIdList,
    });
    return this.shopService.toShopViewWithImages(shop);
  }

  /**
   * 给已绑定的商铺门店上传一张图片。
   */
  @Post(':shopId/images')
  @RequirePermission(PermissionCode.STORE_SHOP_SAVE)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: ShopImageLimit.MAX_BYTES } }))
  async addImage(
    @Param('shopId') shopId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentAccount() loginAccountContext: LoginAccountContext,
  ) {
    return this.shopService.addShopImage(shopId, ShopType.STORE, loginAccountContext.boundShopIdList, file);
  }

  /**
   * 删除已绑定商铺门店的一张图片。
   */
  @Delete(':shopId/images/:imageId')
  @RequirePermission(PermissionCode.STORE_SHOP_SAVE)
  async removeImage(
    @Param('shopId') shopId: string,
    @Param('imageId') imageId: string,
    @CurrentAccount() loginAccountContext: LoginAccountContext,
  ) {
    await this.shopService.removeShopImage(shopId, imageId, ShopType.STORE, loginAccountContext.boundShopIdList);
    return null;
  }

  /**
   * 修改已绑定的商铺门店。
   */
  @Put(':shopId')
  @RequirePermission(PermissionCode.STORE_SHOP_SAVE)
  async updateShop(
    @Param('shopId') shopId: string,
    @Body() saveStoreShopDto: SaveStoreShopDto,
    @CurrentAccount() loginAccountContext: LoginAccountContext,
  ) {
    const shop = await this.shopService.updateStoreShop(shopId, {
      shopCode: saveStoreShopDto.shopCode,
      shopName: saveStoreShopDto.shopName,
      address: '',
      contactPhone: saveStoreShopDto.contactPhone || '',
      status: saveStoreShopDto.status,
      timeZone: saveStoreShopDto.timeZone,
      shopAddress: saveStoreShopDto.shopAddress,
      operatorId: loginAccountContext.accountId,
      boundShopIdList: loginAccountContext.boundShopIdList,
    });
    return this.shopService.toShopViewWithImages(shop);
  }
}
