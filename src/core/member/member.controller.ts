import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ModuleCode, PermissionCode } from '../../common/constants';
import { PageQueryDto } from '../../common/dto/page-query.dto';
import { CurrentAccount } from '../../common/decorators/current-account.decorator';
import { RequireModule, RequirePermission, RequiresShop } from '../../common/decorators/auth.decorators';
import { BusinessException } from '../../common/exceptions/business.exception';
import { LoginAccountContext } from '../../common/interfaces/login-account-context';
import { isEmpty } from '../../common/tools';
import { FinanceBillService } from '../finance/finance-bill.service';
import { MemberBalanceService } from './member-balance.service';
import { MemberQueryService } from './member-query.service';

/**
 * 会员查询参数。
 */
export class MemberQueryDto extends PageQueryDto {
  @IsOptional()
  @IsString()
  keyword?: string;
}

/**
 * 后台充值参数。不接收 shopId。
 */
export class RechargeDto {
  @IsString()
  @IsNotEmpty()
  memberId: string;

  @IsNotEmpty()
  amount: string | number;

  @IsOptional()
  @IsString()
  remark?: string;
}

/**
 * 小程序流水查询。
 */
export class MemberBillQueryDto extends PageQueryDto {
  @IsOptional()
  @IsString()
  bizType?: string;
}

/**
 * 后台会员查询和充值。
 */
@Controller('admin/members')
@RequireModule(ModuleCode.CORE)
@RequiresShop()
export class MemberAdminController {
  constructor(
    private readonly memberQueryService: MemberQueryService,
    private readonly memberBalanceService: MemberBalanceService,
  ) {}

  /**
   * 按关键字分页查询会员。
   */
  @Get()
  @RequirePermission(PermissionCode.MEMBER_QUERY)
  async pageMembers(@Query() memberQueryDto: MemberQueryDto) {
    const pageResult = await this.memberQueryService.pageMembers(memberQueryDto.keyword || '', memberQueryDto.page, memberQueryDto.pageSize);
    return {
      ...pageResult,
      list: pageResult.list.map((memberAccount) => this.memberQueryService.toMemberView(memberAccount)),
    };
  }

  /**
   * 为会员充值。流水记在当前选择的门店下。
   */
  @Post('recharge')
  @RequirePermission(PermissionCode.MEMBER_RECHARGE)
  recharge(@Body() rechargeDto: RechargeDto, @CurrentAccount() loginAccountContext: LoginAccountContext) {
    return this.memberBalanceService.recharge({
      memberId: rechargeDto.memberId,
      amount: rechargeDto.amount,
      operatorId: loginAccountContext.accountId,
      remark: rechargeDto.remark || '',
    });
  }
}

/**
 * 小程序会员中心。只读余额、充值记录和流水，不能自行入账。
 */
@Controller('app/member')
export class MemberAppController {
  constructor(
    private readonly memberQueryService: MemberQueryService,
    private readonly financeBillService: FinanceBillService,
  ) {}

  /**
   * 查询当前会员余额和积分。
   */
  @Get('summary')
  async summary(@CurrentAccount() loginAccountContext: LoginAccountContext) {
    const memberAccount = await this.memberQueryService.findById(loginAccountContext.accountId);
    if (isEmpty(memberAccount)) {
      throw new BusinessException('会员不存在');
    }
    return this.memberQueryService.toMemberView(memberAccount);
  }

  /**
   * 查询当前会员流水。传入充值类型时即为充值记录。
   */
  @Get('bills')
  bills(@Query() memberBillQueryDto: MemberBillQueryDto, @CurrentAccount() loginAccountContext: LoginAccountContext) {
    return this.financeBillService.pageMemberBills(
      loginAccountContext.accountId,
      memberBillQueryDto.bizType || '',
      memberBillQueryDto.page,
      memberBillQueryDto.pageSize,
    );
  }
}
