import { Body, Controller, Delete, Get, Param, Post, Put, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ArrayNotEmpty, IsArray, IsDefined, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ModuleCode, PermissionCode, RecordStatus, ShopImageLimit, ShopType } from '../common/constants';
import { RequireModule, RequirePermission, RequiresShop } from '../common/decorators/auth.decorators';
import { CurrentAccount } from '../common/decorators/current-account.decorator';
import { LoginAccountContext } from '../common/interfaces/login-account-context';
import { ShopService } from '../core/shop/shop.service';

/**
 * 图片排序。按顺序写入，第一张是封面。
 */
export class HotelShopImageSortDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  idList: string[];
}

/**
 * 营业时间。结束早于开始表示跨到次日。
 */
export class HotelShopBusinessHoursDto {
  @IsString()
  @IsNotEmpty()
  startTime: string;

  @IsString()
  @IsNotEmpty()
  endTime: string;
}

/**
 * 酒店门店地址。经纬度是数字，描述是文字。
 */
export class HotelShopAddressDto {
  @IsNumber()
  longitude: number;

  @IsNumber()
  latitude: number;

  @IsString()
  addressText: string;
}

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
  contactPhone?: string;

  @IsString()
  @IsNotEmpty()
  timeZone: string;

  @IsDefined()
  @ValidateNested()
  @Type(() => HotelShopBusinessHoursDto)
  businessHours: HotelShopBusinessHoursDto;

  @IsDefined()
  @ValidateNested()
  @Type(() => HotelShopAddressDto)
  shopAddress: HotelShopAddressDto;

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
    return this.shopService.toShopViewList(shopList);
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
      address: '',
      contactPhone: saveHotelShopDto.contactPhone || '',
      status: saveHotelShopDto.status,
      timeZone: saveHotelShopDto.timeZone,
      businessHours: saveHotelShopDto.businessHours ?? null,
      shopAddress: saveHotelShopDto.shopAddress,
      operatorId: loginAccountContext.accountId,
      boundShopIdList: loginAccountContext.boundShopIdList,
    });
    return this.shopService.toShopViewWithImages(shop);
  }

  /**
   * 给已绑定的酒店门店上传一张图片。
   */
  @Post(':shopId/images')
  @RequirePermission(PermissionCode.HOTEL_SHOP_SAVE)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: ShopImageLimit.MAX_BYTES } }))
  async addImage(
    @Param('shopId') shopId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentAccount() loginAccountContext: LoginAccountContext,
  ) {
    return this.shopService.addShopImage(shopId, ShopType.HOTEL, loginAccountContext.boundShopIdList, file);
  }

  /**
   * 重排已绑定酒店门店的图片。第一张是封面。
   */
  @Post(':shopId/images/sort')
  @RequirePermission(PermissionCode.HOTEL_SHOP_SAVE)
  async sortImages(
    @Param('shopId') shopId: string,
    @Body() hotelShopImageSortDto: HotelShopImageSortDto,
    @CurrentAccount() loginAccountContext: LoginAccountContext,
  ) {
    await this.shopService.sortShopImages(shopId, ShopType.HOTEL, loginAccountContext.boundShopIdList, hotelShopImageSortDto.idList);
    return null;
  }

  /**
   * 删除已绑定酒店门店的一张图片。
   */
  @Delete(':shopId/images/:imageId')
  @RequirePermission(PermissionCode.HOTEL_SHOP_SAVE)
  async removeImage(
    @Param('shopId') shopId: string,
    @Param('imageId') imageId: string,
    @CurrentAccount() loginAccountContext: LoginAccountContext,
  ) {
    await this.shopService.removeShopImage(shopId, imageId, ShopType.HOTEL, loginAccountContext.boundShopIdList);
    return null;
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
      address: '',
      contactPhone: saveHotelShopDto.contactPhone || '',
      status: saveHotelShopDto.status,
      timeZone: saveHotelShopDto.timeZone,
      businessHours: saveHotelShopDto.businessHours ?? null,
      shopAddress: saveHotelShopDto.shopAddress,
      operatorId: loginAccountContext.accountId,
      boundShopIdList: loginAccountContext.boundShopIdList,
    });
    return this.shopService.toShopViewWithImages(shop);
  }
}
