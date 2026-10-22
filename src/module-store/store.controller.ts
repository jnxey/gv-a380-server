import { Body, Controller, ForbiddenException, Get, Param, Post, Put, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { FinanceBizType, ModuleCode, PermissionCode, RecordStatus, StorePayMethod } from '../common/constants';
import { ShopContext } from '../common/context/shop-context';
import { CurrentAccount } from '../common/decorators/current-account.decorator';
import { RequireModule, RequirePermission, RequiresShop } from '../common/decorators/auth.decorators';
import { PageQueryDto } from '../common/dto/page-query.dto';
import { LoginAccountContext } from '../common/interfaces/login-account-context';
import { isEmpty } from '../common/tools';
import { FinanceBillService } from '../core/finance/finance-bill.service';
import { StoreService } from './store.service';

/**
 * 保存商品。
 */
export class SaveStoreProductDto {
  @IsString()
  @IsNotEmpty()
  productName: string;

  @IsOptional()
  @IsString()
  barcode?: string;

  @IsNotEmpty()
  salePrice: string | number;

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
 * 商品分页查询。
 */
export class StoreProductQueryDto extends PageQueryDto {
  @IsOptional()
  @IsString()
  keyword?: string;
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

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => StoreSaleItemDto)
  itemList: StoreSaleItemDto[];
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
   * 分页查询商品。
   */
  @Get('products')
  @RequirePermission(PermissionCode.STORE_PRODUCT_QUERY)
  pageProducts(@Query() storeProductQueryDto: StoreProductQueryDto) {
    return this.storeService.pageProducts(storeProductQueryDto.keyword || '', Number(storeProductQueryDto.page), Number(storeProductQueryDto.pageSize));
  }

  /**
   * 新建商品。
   */
  @Post('products')
  @RequirePermission(PermissionCode.STORE_PRODUCT_SAVE)
  createProduct(@Body() saveStoreProductDto: SaveStoreProductDto) {
    return this.storeService.createProduct({
      productName: saveStoreProductDto.productName,
      barcode: saveStoreProductDto.barcode || '',
      salePrice: saveStoreProductDto.salePrice,
      status: saveStoreProductDto.status,
    });
  }

  /**
   * 修改商品。
   */
  @Put('products/:productId')
  @RequirePermission(PermissionCode.STORE_PRODUCT_SAVE)
  updateProduct(@Param('productId') productId: string, @Body() saveStoreProductDto: SaveStoreProductDto) {
    return this.storeService.updateProduct(productId, {
      productName: saveStoreProductDto.productName,
      barcode: saveStoreProductDto.barcode || '',
      salePrice: saveStoreProductDto.salePrice,
      status: saveStoreProductDto.status,
    });
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
  pageSales(@Query() pageQueryDto: PageQueryDto) {
    return this.storeService.pageSales(Number(pageQueryDto.page), Number(pageQueryDto.pageSize));
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
}
