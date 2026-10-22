import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { IsArray, IsIn, IsNumber, IsObject, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { Public } from '../common/decorators/auth.decorators';
import { MerchantAuthGuard } from '../common/merchant-auth/merchant-auth.guard';
import { isEmpty } from '../common/tools';
import { PointLedgerDirection } from './point.constants';
import { PointLedgerService } from './point-ledger.service';
import { PointMemberService } from './point-member.service';

class PointBalanceQueryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  account: string;
}

class PointFindPagerDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  account: string;

  @IsNumber()
  @Min(1)
  page_size: number;

  @IsOptional()
  @IsNumber()
  last_id?: number;

  @IsOptional()
  @IsNumber()
  last_sort_value?: number;
}

class PointCreateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  account: string;

  @IsString()
  @MinLength(1)
  biz_type: string;

  @IsIn([PointLedgerDirection.INCREASE, PointLedgerDirection.DECREASE])
  direction: string;

  @IsNumber()
  @Min(0.00001)
  amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  referrer_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;

  @IsOptional()
  @IsObject()
  describe_json?: Record<string, unknown>;
}

class PointFindByReferrerIdsDto {
  @IsNumber()
  timestamp: number;

  @IsArray()
  @IsString({ each: true })
  referrer_id: string[];
}

class PointVerifyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  member_account: string;

  @IsString()
  password: string;
}

/**
 * 商家 HMAC 积分接口。路径对齐 gv-admin-point。
 */
@Public()
@UseGuards(MerchantAuthGuard)
@Controller()
export class PointMerchantController {
  constructor(
    private readonly pointLedgerService: PointLedgerService,
    private readonly pointMemberService: PointMemberService,
  ) {}

  /**
   * 查询积分账号当前余额。
   */
  @Get('api/v1/ledger-member-points/current-balance')
  async currentBalance(@Query() pointBalanceQueryDto: PointBalanceQueryDto) {
    const balanceView = await this.pointLedgerService.getCurrentBalanceByAccount(pointBalanceQueryDto.account);
    return this.pointLedgerService.wrapMerchantSuccess(balanceView);
  }

  /**
   * 积分流水分页。
   */
  @Post('api/v1/ledger-member-points/find-pager')
  async findPager(@Body() pointFindPagerDto: PointFindPagerDto) {
    const pagerResult = await this.pointLedgerService.findPager({
      account: pointFindPagerDto.account,
      pageSize: pointFindPagerDto.page_size,
      lastId: pointFindPagerDto.last_id,
      lastSortValue: pointFindPagerDto.last_sort_value,
    });
    return this.pointLedgerService.wrapMerchantSuccess(pagerResult);
  }

  /**
   * 创建积分记账。
   */
  @Post('api/v1/ledger-member-points/create')
  async create(@Body() pointCreateDto: PointCreateDto) {
    const createdRow = await this.pointLedgerService.create({
      account: pointCreateDto.account,
      bizType: pointCreateDto.biz_type,
      direction: pointCreateDto.direction,
      amount: pointCreateDto.amount,
      referrerId: pointCreateDto.referrer_id,
      remark: pointCreateDto.remark,
      describeJson: pointCreateDto.describe_json,
    });
    return this.pointLedgerService.wrapMerchantSuccess(createdRow);
  }

  /**
   * 按原帐 ID 批量查流水。
   */
  @Post('api/v1/ledger-member-points/find-by-referrer-ids')
  async findByReferrerIds(@Body() pointFindByReferrerIdsDto: PointFindByReferrerIdsDto) {
    const result = await this.pointLedgerService.findByReferrerIds(
      pointFindByReferrerIdsDto.timestamp,
      isEmpty(pointFindByReferrerIdsDto.referrer_id) ? [] : pointFindByReferrerIdsDto.referrer_id,
    );
    return this.pointLedgerService.wrapMerchantSuccess(result);
  }

  /**
   * 校验会员号/密码，返回积分账号密文。
   */
  @Post('api/v1/ledger-member-points/verify-member')
  async verify(@Body() pointVerifyDto: PointVerifyDto) {
    const verifyResult = await this.pointMemberService.verifyMember(pointVerifyDto.member_account, pointVerifyDto.password);
    return this.pointMemberService.wrapMerchantSuccess(verifyResult);
  }
}
