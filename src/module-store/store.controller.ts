import { Body, Controller, Delete, ForbiddenException, Get, Param, Post, Put, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { DetailDescriptionLimit, FinanceBizType, HotelWalkInContact, ModuleCode, PermissionCode, QuickProductFlag, RecordStatus, ShopImageLimit, StoreDeliveryField, StorePayMethod } from '../common/constants';
import { ShopContext } from '../common/context/shop-context';
import { CurrentAccount } from '../common/decorators/current-account.decorator';
import { RequireModule, RequirePermission, RequiresShop } from '../common/decorators/auth.decorators';
import { PageQueryDto } from '../common/dto/page-query.dto';
import { LoginAccountContext } from '../common/interfaces/login-account-context';
import { isEmpty } from '../common/tools';
import { FinanceBillService } from '../core/finance/finance-bill.service';
import { StoreService } from './store.service';

/**
 * 保存商品分类。
 */
export class SaveStoreProductCategoryDto {
  @IsString()
  @IsNotEmpty()
  categoryName: string;

  @IsIn(Object.values(RecordStatus))
  status: string;
}

/**
 * 拖动排序提交的编号列表。
 */
export class SortIdListDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  idList: string[];
}

/**
 * 商品详细描述。
 */
export class StoreProductDescriptionDto {
  @IsOptional()
  @IsString()
  @MaxLength(DetailDescriptionLimit.MAX_LENGTH)
  content?: string;
}

/**
 * 保存商品。
 */
export class SaveStoreProductDto {
  @IsString()
  @IsNotEmpty()
  categoryId: string;

  @IsString()
  @IsNotEmpty()
  productName: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => StoreProductDescriptionDto)
  description?: StoreProductDescriptionDto;

  @IsString()
  @IsNotEmpty()
  barcode: string;

  @IsNotEmpty()
  salePrice: string | number;

  @IsNotEmpty()
  costPrice: string | number;

  @IsBoolean()
  quickProduct: boolean;

  @IsIn(Object.values(RecordStatus))
  status: string;
}

/**
 * 进货明细行。
 */
export class StorePurchaseItemDto {
  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsNotEmpty()
  costPrice: string | number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;
}

/**
 * 创建进货单。
 */
export class CreateStorePurchaseDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => StorePurchaseItemDto)
  itemList: StorePurchaseItemDto[];

  @IsOptional()
  @IsString()
  remark?: string;
}

/**
 * 销售明细行。
 */
export class StoreSaleItemDto {
  @IsString()
  @IsNotEmpty()
  productId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;
}

/**
 * 后台创建销售单。
 */
export class CreateStoreSaleDto {
  @IsIn(Object.values(StorePayMethod))
  payMethod: string;

  @IsOptional()
  @IsString()
  memberId?: string;

  @IsOptional()
  @IsString()
  remark?: string;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => StoreSaleItemDto)
  itemList: StoreSaleItemDto[];
}

/**
 * 按关键字找会员。
 */
export class StoreMemberKeywordDto {
  @IsString()
  @IsNotEmpty()
  keyword: string;
}

/**
 * 解开付款码。
 */
export class StorePayQrDto {
  @IsString()
  @IsNotEmpty()
  cipherText: string;
}

/**
 * 当前门店财务流水查询参数。
 */
export class StoreBillQueryDto extends PageQueryDto {
  @IsOptional()
  @IsString()
  bizType?: string;

  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;
}

/**
 * 后台销售单查询。时间按创建时间，都不传则不限。
 */
export class StoreSaleQueryDto extends PageQueryDto {
  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;
}

/**
 * 商品分页查询。
 */
export class StoreProductQueryDto extends PageQueryDto {
  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsIn([QuickProductFlag.QUERY_ONLY])
  quickProduct?: string;
}

/**
 * 小程序创建销售单。
 */
export class CreateAppStoreSaleDto {
  @IsString()
  @IsNotEmpty()
  shopId: string;

  @IsString()
  @IsNotEmpty()
  cipherText: string;

  @IsString()
  @IsNotEmpty({ message: '请填写收货人' })
  @MaxLength(HotelWalkInContact.MAX_LENGTH, { message: '收货人过长' })
  receiverName: string;

  @IsString()
  @IsNotEmpty({ message: '请填写联系方式' })
  @MaxLength(HotelWalkInContact.MAX_LENGTH, { message: '联系方式过长' })
  contact: string;

  @IsString()
  @IsNotEmpty()
  deliveryAddress: string;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => StoreSaleItemDto)
  itemList: StoreSaleItemDto[];
}

/**
 * 收银台开始送货。送货号和备注可以不填。必带房间号的门店，送货人和联系方式也可以不填。
 */
export class StartStoreDeliveryDto {
  @IsString()
  @MaxLength(StoreDeliveryField.COURIER_NAME_MAX_LENGTH, { message: '送货人过长' })
  courierName: string;

  @IsString()
  @MaxLength(StoreDeliveryField.COURIER_CONTACT_MAX_LENGTH, { message: '联系方式过长' })
  courierContact: string;

  @IsOptional()
  @IsString()
  @MaxLength(StoreDeliveryField.DELIVERY_NO_MAX_LENGTH, { message: '送货号过长' })
  deliveryNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(StoreDeliveryField.REMARK_MAX_LENGTH, { message: '送货备注过长' })
  deliveryRemark?: string;
}

/**
 * 后台商铺接口。
 */
@Controller('admin/store')
@RequireModule(ModuleCode.STORE)
@RequiresShop()
export class StoreAdminController {
  constructor(
    private readonly storeService: StoreService,
    private readonly financeBillService: FinanceBillService,
  ) {}

  /**
   * 读取本次请求已经校验过的当前门店。
   */
  private readCurrentShopId(): string {
    const currentShopId = ShopContext.getCurrentShopId();
    if (isEmpty(currentShopId)) {
      throw new ForbiddenException('请选择门店');
    }
    return currentShopId;
  }

  /**
   * 收银台操作需要现金或会员收款权限之一。
   */
  private assertCashierPermission(loginAccountContext: LoginAccountContext): void {
    const permissionCodeList = loginAccountContext.permissionCodeList;
    if (permissionCodeList.includes(PermissionCode.STORE_SALE_CASH) !== true && permissionCodeList.includes(PermissionCode.STORE_SALE_MEMBER) !== true) {
      throw new ForbiddenException('没有收款权限');
    }
  }

  /**
   * 汇总当前门店的收入和支出。只看商铺销售扣款。
   */
  @Get('bills/summary')
  @RequirePermission(PermissionCode.STORE_BILL_QUERY)
  summarizeBills(@Query() storeBillQueryDto: StoreBillQueryDto) {
    const currentShopId = this.readCurrentShopId();
    return this.financeBillService.summarizeBills(
      [currentShopId],
      currentShopId,
      storeBillQueryDto.bizType || FinanceBizType.STORE_SALE,
      storeBillQueryDto.startDate || '',
      storeBillQueryDto.endDate || '',
      FinanceBizType.RECHARGE,
    );
  }

  /**
   * 按当前筛选条件导出当前门店财务流水。默认只看商铺销售，不含会员充值。
   */
  @Get('bills/export')
  @RequirePermission(PermissionCode.STORE_BILL_QUERY)
  exportBills(@Query() storeBillQueryDto: StoreBillQueryDto) {
    const currentShopId = this.readCurrentShopId();
    return this.financeBillService.listBillsForExport(
      [currentShopId],
      currentShopId,
      storeBillQueryDto.bizType || FinanceBizType.STORE_SALE,
      storeBillQueryDto.keyword || '',
      storeBillQueryDto.startDate || '',
      storeBillQueryDto.endDate || '',
      FinanceBizType.RECHARGE,
    );
  }

  /**
   * 分页查询当前门店财务流水。默认只看商铺销售。
   */
  @Get('bills')
  @RequirePermission(PermissionCode.STORE_BILL_QUERY)
  pageBills(@Query() storeBillQueryDto: StoreBillQueryDto) {
    const currentShopId = this.readCurrentShopId();
    return this.financeBillService.pageBills(
      [currentShopId],
      currentShopId,
      storeBillQueryDto.bizType || FinanceBizType.STORE_SALE,
      storeBillQueryDto.keyword || '',
      storeBillQueryDto.startDate || '',
      storeBillQueryDto.endDate || '',
      storeBillQueryDto.page,
      storeBillQueryDto.pageSize,
      FinanceBizType.RECHARGE,
    );
  }

  /**
   * 查询当前门店商品分类。
   */
  @Get('product-categories')
  @RequirePermission(PermissionCode.STORE_CATEGORY_QUERY)
  listProductCategories() {
    return this.storeService.listProductCategories();
  }

  /**
   * 新建商品分类。
   */
  @Post('product-categories')
  @RequirePermission(PermissionCode.STORE_CATEGORY_SAVE)
  createProductCategory(@Body() saveStoreProductCategoryDto: SaveStoreProductCategoryDto) {
    return this.storeService.createProductCategory({
      categoryName: saveStoreProductCategoryDto.categoryName,
      status: saveStoreProductCategoryDto.status,
    });
  }

  /**
   * 按拖动结果保存商品分类顺序。
   */
  @Put('product-categories/sort')
  @RequirePermission(PermissionCode.STORE_CATEGORY_SAVE)
  async sortProductCategories(@Body() sortIdListDto: SortIdListDto) {
    await this.storeService.sortProductCategories(sortIdListDto.idList);
    return null;
  }

  /**
   * 修改商品分类。
   */
  @Put('product-categories/:categoryId')
  @RequirePermission(PermissionCode.STORE_CATEGORY_SAVE)
  updateProductCategory(@Param('categoryId') categoryId: string, @Body() saveStoreProductCategoryDto: SaveStoreProductCategoryDto) {
    return this.storeService.updateProductCategory(categoryId, {
      categoryName: saveStoreProductCategoryDto.categoryName,
      status: saveStoreProductCategoryDto.status,
    });
  }

  /**
   * 分页查询商品。
   */
  @Get('products')
  @RequirePermission(PermissionCode.STORE_PRODUCT_QUERY)
  pageProducts(@Query() storeProductQueryDto: StoreProductQueryDto) {
    return this.storeService.pageProducts(
      storeProductQueryDto.keyword || '',
      storeProductQueryDto.categoryId || '',
      Number(storeProductQueryDto.page),
      Number(storeProductQueryDto.pageSize),
      storeProductQueryDto.quickProduct === QuickProductFlag.QUERY_ONLY,
    );
  }

  /**
   * 新建商品。
   */
  @Post('products')
  @RequirePermission(PermissionCode.STORE_PRODUCT_SAVE)
  createProduct(@Body() saveStoreProductDto: SaveStoreProductDto) {
    return this.storeService.createProduct({
      categoryId: saveStoreProductDto.categoryId,
      productName: saveStoreProductDto.productName,
      description: saveStoreProductDto.description,
      barcode: saveStoreProductDto.barcode,
      salePrice: saveStoreProductDto.salePrice,
      costPrice: saveStoreProductDto.costPrice,
      quickProduct: saveStoreProductDto.quickProduct,
      status: saveStoreProductDto.status,
    });
  }

  /**
   * 按拖动结果保存商品顺序。
   */
  @Put('products/sort')
  @RequirePermission(PermissionCode.STORE_PRODUCT_SAVE)
  async sortProducts(@Body() sortIdListDto: SortIdListDto) {
    await this.storeService.sortProducts(sortIdListDto.idList);
    return null;
  }

  /**
   * 修改商品。
   */
  @Put('products/:productId')
  @RequirePermission(PermissionCode.STORE_PRODUCT_SAVE)
  updateProduct(@Param('productId') productId: string, @Body() saveStoreProductDto: SaveStoreProductDto) {
    return this.storeService.updateProduct(productId, {
      categoryId: saveStoreProductDto.categoryId,
      productName: saveStoreProductDto.productName,
      description: saveStoreProductDto.description,
      barcode: saveStoreProductDto.barcode,
      salePrice: saveStoreProductDto.salePrice,
      costPrice: saveStoreProductDto.costPrice,
      quickProduct: saveStoreProductDto.quickProduct,
      status: saveStoreProductDto.status,
    });
  }

  /**
   * 给当前门店的商品上传一张图片。
   */
  @Post('products/:productId/images')
  @RequirePermission(PermissionCode.STORE_PRODUCT_SAVE)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: ShopImageLimit.MAX_BYTES } }))
  addProductImage(@Param('productId') productId: string, @UploadedFile() file: Express.Multer.File) {
    return this.storeService.addProductImage(productId, file);
  }

  /**
   * 删除当前门店商品的一张图片。
   */
  @Delete('products/:productId/images/:imageId')
  @RequirePermission(PermissionCode.STORE_PRODUCT_SAVE)
  async removeProductImage(@Param('productId') productId: string, @Param('imageId') imageId: string) {
    await this.storeService.removeProductImage(productId, imageId);
    return null;
  }

  /**
   * 分页查询进货单。
   */
  @Get('purchases')
  @RequirePermission(PermissionCode.STORE_PURCHASE_QUERY)
  pagePurchases(@Query() pageQueryDto: PageQueryDto) {
    return this.storeService.pagePurchases(Number(pageQueryDto.page), Number(pageQueryDto.pageSize));
  }

  /**
   * 确认进货入库。
   */
  @Post('purchases')
  @RequirePermission(PermissionCode.STORE_PURCHASE_SAVE)
  createPurchase(@Body() createStorePurchaseDto: CreateStorePurchaseDto, @CurrentAccount() loginAccountContext: LoginAccountContext) {
    return this.storeService.createPurchase(
      createStorePurchaseDto.itemList,
      createStorePurchaseDto.remark || '',
      loginAccountContext.accountId,
    );
  }

  /**
   * 分页查询销售单。
   */
  @Get('sales')
  @RequirePermission(PermissionCode.STORE_SALE_QUERY)
  pageSales(@Query() storeSaleQueryDto: StoreSaleQueryDto) {
    return this.storeService.pageSales(
      Number(storeSaleQueryDto.page),
      Number(storeSaleQueryDto.pageSize),
      storeSaleQueryDto.startDate || '',
      storeSaleQueryDto.endDate || '',
    );
  }

  /**
   * 查询当前门店最近的扫码付款，供收银台到账提示。不含商铺销售，避免收银台自己收款再报一次。
   */
  @Get('payment-notices')
  listPaymentNotices(@CurrentAccount() loginAccountContext: LoginAccountContext) {
    this.assertCashierPermission(loginAccountContext);
    return this.financeBillService.listRecentPaymentNotices([FinanceBizType.SHOP_SCAN_PAY]);
  }

  /**
   * 当前门店的待发货销售单。
   */
  @Get('sales/pending-delivery')
  listPendingDeliverySales(@CurrentAccount() loginAccountContext: LoginAccountContext) {
    this.assertCashierPermission(loginAccountContext);
    return this.storeService.listPendingDeliverySales();
  }

  /**
   * 把待发货销售单改为送货中。
   */
  @Post('sales/:saleId/deliver')
  startDelivery(
    @Param('saleId') saleId: string,
    @Body() startStoreDeliveryDto: StartStoreDeliveryDto,
    @CurrentAccount() loginAccountContext: LoginAccountContext,
  ) {
    this.assertCashierPermission(loginAccountContext);
    return this.storeService.startDelivery(saleId, {
      courierName: startStoreDeliveryDto.courierName,
      courierContact: startStoreDeliveryDto.courierContact,
      deliveryNo: startStoreDeliveryDto.deliveryNo || '',
      deliveryRemark: startStoreDeliveryDto.deliveryRemark || '',
    });
  }

  /**
   * 取消当前门店的待发货销售单。
   */
  @Post('sales/:saleId/cancel')
  cancelSale(@Param('saleId') saleId: string, @CurrentAccount() loginAccountContext: LoginAccountContext) {
    this.assertCashierPermission(loginAccountContext);
    return this.storeService.cancelAdminSale(saleId, loginAccountContext.accountId);
  }

  /**
   * 按关键字找会员，供收银台会员余额收款使用。
   */
  @Get('members')
  @RequirePermission(PermissionCode.STORE_SALE_MEMBER)
  findMember(@Query() storeMemberKeywordDto: StoreMemberKeywordDto) {
    return this.storeService.findMemberByKeyword(storeMemberKeywordDto.keyword);
  }

  /**
   * 解开付款码，返回对应会员。
   */
  @Post('pay-qr')
  @RequirePermission(PermissionCode.STORE_SALE_MEMBER)
  findMemberByPayQr(@Body() storePayQrDto: StorePayQrDto) {
    return this.storeService.findMemberByPayQr(storePayQrDto.cipherText);
  }

  /**
   * 收银台创建销售单。现金和会员余额走不同权限。
   */
  @Post('sales')
  createSale(@Body() createStoreSaleDto: CreateStoreSaleDto, @CurrentAccount() loginAccountContext: LoginAccountContext) {
    if (createStoreSaleDto.payMethod === StorePayMethod.MEMBER) {
      if (loginAccountContext.permissionCodeList.includes(PermissionCode.STORE_SALE_MEMBER) !== true) {
        throw new ForbiddenException('没有会员收款权限');
      }
    } else if (createStoreSaleDto.payMethod === StorePayMethod.CASH) {
      if (loginAccountContext.permissionCodeList.includes(PermissionCode.STORE_SALE_CASH) !== true) {
        throw new ForbiddenException('没有现金收款权限');
      }
    }
    return this.storeService.createAdminSale({
      payMethod: createStoreSaleDto.payMethod,
      memberId: createStoreSaleDto.memberId || '',
      remark: createStoreSaleDto.remark || '',
      itemList: createStoreSaleDto.itemList,
      operatorId: loginAccountContext.accountId,
    });
  }
}

/**
 * 小程序商铺购买。会员身份来自令牌，只支持余额收款。
 */
@Controller('app/store')
export class StoreAppController {
  constructor(private readonly storeService: StoreService) {}

  /**
   * 查询指定商铺启用中的商品分类。
   */
  @Get('product-categories')
  listProductCategories(@Query('shopId') shopId: string) {
    return this.storeService.listEnabledProductCategories(shopId);
  }

  /**
   * 查询指定商铺的可售商品。
   */
  @Get('products')
  listProducts(@Query('shopId') shopId: string) {
    return this.storeService.listEnabledProducts(shopId);
  }

  /**
   * 提交购买并扣减余额。
   */
  @Post('sales')
  createSale(@Body() createAppStoreSaleDto: CreateAppStoreSaleDto, @CurrentAccount() loginAccountContext: LoginAccountContext) {
    return this.storeService.createAppSale(loginAccountContext.accountId, createAppStoreSaleDto);
  }

  /**
   * 查询我的商铺销售单。
   */
  @Get('sales')
  pageSales(@Query() pageQueryDto: PageQueryDto, @CurrentAccount() loginAccountContext: LoginAccountContext) {
    return this.storeService.pageMemberSales(loginAccountContext.accountId, pageQueryDto.page, pageQueryDto.pageSize);
  }

  /**
   * 确认收到送货中的订单。
   */
  @Post('sales/:saleId/receive')
  confirmReceipt(@Param('saleId') saleId: string, @CurrentAccount() loginAccountContext: LoginAccountContext) {
    return this.storeService.confirmAppReceipt(loginAccountContext.accountId, saleId);
  }

  /**
   * 取消自己的待发货订单。
   */
  @Post('sales/:saleId/cancel')
  cancelSale(@Param('saleId') saleId: string, @CurrentAccount() loginAccountContext: LoginAccountContext) {
    return this.storeService.cancelAppSale(loginAccountContext.accountId, saleId);
  }
}
