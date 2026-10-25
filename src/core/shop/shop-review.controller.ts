import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ModuleCode, PermissionCode, ShopReviewBizType, ShopReviewLimit } from '../../common/constants';
import { CurrentAccount } from '../../common/decorators/current-account.decorator';
import { RequireModule, RequirePermission, RequiresShop } from '../../common/decorators/auth.decorators';
import { PageQueryDto } from '../../common/dto/page-query.dto';
import { LoginAccountContext } from '../../common/interfaces/login-account-context';
import { ShopReviewService } from './shop-review.service';

/**
 * 提交门店评价。
 */
export class CreateShopReviewDto {
  @IsIn(Object.values(ShopReviewBizType))
  bizType: string;

  @IsString()
  @IsNotEmpty()
  bizOrderId: string;

  @Type(() => Number)
  @IsInt()
  @Min(ShopReviewLimit.STAR_MIN)
  @Max(ShopReviewLimit.STAR_MAX)
  starRating: number;

  @IsOptional()
  @IsString()
  @MaxLength(ShopReviewLimit.CONTENT_MAX_LENGTH)
  content?: string;
}

/**
 * 小程序按门店查评价。
 */
export class ShopReviewQueryDto extends PageQueryDto {
  @IsString()
  @IsNotEmpty()
  shopId: string;
}

/**
 * 后台评价列表查询。可按创建日期筛选。
 */
export class AdminShopReviewQueryDto extends PageQueryDto {
  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;
}

/**
 * 小程序门店评价。
 */
@Controller('app/shop-reviews')
export class ShopReviewAppController {
  constructor(private readonly shopReviewService: ShopReviewService) {}

  /**
   * 按门店分页查评价。
   */
  @Get()
  pageReviews(@Query() shopReviewQueryDto: ShopReviewQueryDto) {
    return this.shopReviewService.pageByShopId(shopReviewQueryDto.shopId, shopReviewQueryDto.page, shopReviewQueryDto.pageSize);
  }

  /**
   * 会员提交评价。
   */
  @Post()
  createReview(@Body() createShopReviewDto: CreateShopReviewDto, @CurrentAccount() loginAccountContext: LoginAccountContext) {
    return this.shopReviewService.createReview(loginAccountContext.accountId, {
      bizType: createShopReviewDto.bizType,
      bizOrderId: createShopReviewDto.bizOrderId,
      starRating: createShopReviewDto.starRating,
      content: createShopReviewDto.content || '',
    });
  }
}

/**
 * KTV 后台评价列表。
 */
@Controller('admin/ktv/reviews')
@RequireModule(ModuleCode.KTV)
@RequiresShop()
export class KtvReviewAdminController {
  constructor(private readonly shopReviewService: ShopReviewService) {}

  /**
   * 分页查当前 KTV 门店评价。
   */
  @Get()
  @RequirePermission(PermissionCode.KTV_REVIEW_QUERY)
  pageReviews(@Query() adminShopReviewQueryDto: AdminShopReviewQueryDto) {
    return this.shopReviewService.pageByCurrentShop(
      adminShopReviewQueryDto.page,
      adminShopReviewQueryDto.pageSize,
      adminShopReviewQueryDto.startDate || '',
      adminShopReviewQueryDto.endDate || '',
    );
  }
}

/**
 * 酒店后台评价列表。
 */
@Controller('admin/hotel/reviews')
@RequireModule(ModuleCode.HOTEL)
@RequiresShop()
export class HotelReviewAdminController {
  constructor(private readonly shopReviewService: ShopReviewService) {}

  /**
   * 分页查当前酒店门店评价。
   */
  @Get()
  @RequirePermission(PermissionCode.HOTEL_REVIEW_QUERY)
  pageReviews(@Query() adminShopReviewQueryDto: AdminShopReviewQueryDto) {
    return this.shopReviewService.pageByCurrentShop(
      adminShopReviewQueryDto.page,
      adminShopReviewQueryDto.pageSize,
      adminShopReviewQueryDto.startDate || '',
      adminShopReviewQueryDto.endDate || '',
    );
  }
}

/**
 * 商铺后台评价列表。
 */
@Controller('admin/store/reviews')
@RequireModule(ModuleCode.STORE)
@RequiresShop()
export class StoreReviewAdminController {
  constructor(private readonly shopReviewService: ShopReviewService) {}

  /**
   * 分页查当前商铺门店评价。
   */
  @Get()
  @RequirePermission(PermissionCode.STORE_REVIEW_QUERY)
  pageReviews(@Query() adminShopReviewQueryDto: AdminShopReviewQueryDto) {
    return this.shopReviewService.pageByCurrentShop(
      adminShopReviewQueryDto.page,
      adminShopReviewQueryDto.pageSize,
      adminShopReviewQueryDto.startDate || '',
      adminShopReviewQueryDto.endDate || '',
    );
  }
}
