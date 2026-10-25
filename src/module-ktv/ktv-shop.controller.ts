import { Body, Controller, Delete, Get, Param, Post, Put, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ArrayNotEmpty, IsArray, IsDefined, IsIn, IsNotEmpty, IsNumber, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ModuleCode, PermissionCode, RecordStatus, ShopImageLimit, ShopType } from '../common/constants';
import { RequireModule, RequirePermission, RequiresShop } from '../common/decorators/auth.decorators';
import { CurrentAccount } from '../common/decorators/current-account.decorator';
import { LoginAccountContext } from '../common/interfaces/login-account-context';
import { ShopService } from '../core/shop/shop.service';
import { KtvService } from './ktv.service';

/**
 * 图片排序。按顺序写入，第一张是封面。
 */
export class ShopImageSortDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  idList: string[];
}

/**
 * 营业时间。结束早于开始表示跨到次日。
 */
export class ShopBusinessHoursDto {
  @IsString()
  @IsNotEmpty()
  startTime: string;

  @IsString()
  @IsNotEmpty()
  endTime: string;
}

/**
 * 门店地址。经纬度是数字，描述是文字。
 */
export class ShopAddressDto {
  @IsNumber()
  longitude: number;

  @IsNumber()
  latitude: number;

  @IsString()
  addressText: string;
}

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

  @IsString()
  @IsNotEmpty()
  contactPhone: string;

  @IsString()
  @IsNotEmpty()
  timeZone: string;

  @IsDefined()
  @ValidateNested()
  @Type(() => ShopBusinessHoursDto)
  businessHours: ShopBusinessHoursDto;

  @IsDefined()
  @ValidateNested()
  @Type(() => ShopAddressDto)
  shopAddress: ShopAddressDto;

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
      address: '',
      contactPhone: saveKtvShopDto.contactPhone || '',
      status: saveKtvShopDto.status,
      timeZone: saveKtvShopDto.timeZone,
      businessHours: saveKtvShopDto.businessHours ?? null,
      shopAddress: saveKtvShopDto.shopAddress ?? null,
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
   * 重排已绑定 KTV 门店的图片。第一张是封面。
   */
  @Post(':shopId/images/sort')
  @RequirePermission(PermissionCode.KTV_SHOP_SAVE)
  async sortImages(
    @Param('shopId') shopId: string,
    @Body() shopImageSortDto: ShopImageSortDto,
    @CurrentAccount() loginAccountContext: LoginAccountContext,
  ) {
    await this.shopService.sortShopImages(shopId, ShopType.KTV, loginAccountContext.boundShopIdList, shopImageSortDto.idList);
    return null;
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
      address: '',
      contactPhone: saveKtvShopDto.contactPhone || '',
      status: saveKtvShopDto.status,
      timeZone: saveKtvShopDto.timeZone,
      businessHours: saveKtvShopDto.businessHours ?? null,
      shopAddress: saveKtvShopDto.shopAddress ?? null,
      operatorId: loginAccountContext.accountId,
      boundShopIdList: loginAccountContext.boundShopIdList,
    });
    return this.shopService.toShopViewWithImages(shop);
  }
}

/**
 * 扫门店收款码付款。
 */
export class ShopPayDto {
  @IsString()
  @IsNotEmpty()
  shopPayCode: string;

  @IsNotEmpty()
  amount: string | number;

  @IsString()
  @IsNotEmpty()
  securityKeyCipher: string;
}

/**
 * 小程序选择门店。这是消费选店，不是后台数据权限。
 */
@Controller('app/shops')
export class ShopAppController {
  constructor(
    private readonly shopService: ShopService,
    private readonly ktvService: KtvService,
  ) {}

  /**
   * 按门店类型列出启用和休息的门店。
   */
  @Get()
  async listShops(@Query() appShopQueryDto: AppShopQueryDto) {
    const shopList = await this.shopService.listByType(appShopQueryDto.shopType);
    return this.shopService.toShopViewList(shopList);
  }

  /**
   * 扫门店收款码付款。
   */
  @Post('pay')
  async payShop(@Body() shopPayDto: ShopPayDto, @CurrentAccount() loginAccountContext: LoginAccountContext) {
    return this.ktvService.payByShopQr(loginAccountContext.accountId, shopPayDto.shopPayCode, shopPayDto.amount, shopPayDto.securityKeyCipher);
  }
}
