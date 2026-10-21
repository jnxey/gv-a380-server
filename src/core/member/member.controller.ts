import { Body, Controller, Get, Post, Query, UnauthorizedException, UseGuards } from '@nestjs/common';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import Decimal from 'decimal.js';
import { FinanceDirection, MerchantResponseCode, MerchantResponseMessage, ModuleCode, PermissionCode } from '../../common/constants';
import { PageQueryDto } from '../../common/dto/page-query.dto';
import { CurrentAccount } from '../../common/decorators/current-account.decorator';
import { Public, RequireModule, RequirePermission, RequiresShop } from '../../common/decorators/auth.decorators';
import { MerchantAuthGuard } from '../../common/merchant-auth/merchant-auth.guard';
import { BusinessException } from '../../common/exceptions/business.exception';
import { LoginAccountContext } from '../../common/interfaces/login-account-context';
import { isEmpty, toIdentifier } from '../../common/tools';
import { MiniappSignService } from '../../common/crypto/miniapp-sign.service';
import { FinanceBillService } from '../finance/finance-bill.service';
import { MemberBalanceService } from './member-balance.service';
import { ChatUserClient } from './chat-user.client';
import { MemberQueryService } from './member-query.service';
import { PointBalanceClient } from './point-balance.client';

/**
 * 会员查询参数。
 */
export class MemberQueryDto extends PageQueryDto {
  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsString()
  username?: string;
}

/**
 * 按聊天用户名开余额账户。
 */
export class OpenMemberAccountDto {
  @IsString()
  @IsNotEmpty()
  username: string;
}

/**
 * 按聊天用户名同步昵称和联系方式。
 */
export class SyncMemberProfileDto {
  @IsString()
  @IsNotEmpty()
  username: string;
}

/**
 * 按用户名、手机号或邮箱查询聊天用户。
 */
export class ChatUserQueryDto {
  @IsString()
  @IsNotEmpty()
  keyword: string;
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
 * 付款/充值二维码密文。
 */
export class PayQrDto {
  @IsString()
  @IsNotEmpty()
  cipherText: string;
}

/**
 * 服务页查询积分余额。account 是积分账号。
 */
export class PointBalanceQueryDto {
  @IsString()
  @IsNotEmpty()
  account: string;
}

/**
 * 付款/充值状态。正文是付款二维码密文。
 */
export class PaymentRechargeStatusDto {
  @IsString()
  @IsNotEmpty()
  cipher_text: string;
}

/**
 * 服务页查询 A380 余额。account 只参与验签，不查积分。
 */
export class CommonBalanceQueryDto {
  @IsString()
  @IsNotEmpty()
  chat_account: string;

  @IsOptional()
  @IsString()
  account?: string;
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
    private readonly chatUserClient: ChatUserClient,
    private readonly miniappSignService: MiniappSignService,
  ) {}

  /**
   * 按关键字分页查询会员。传入用户名时按该用户名精确查询。
   */
  @Get()
  @RequirePermission(PermissionCode.MEMBER_QUERY)
  async pageMembers(@Query() memberQueryDto: MemberQueryDto) {
    const pageResult = await this.memberQueryService.pageMembers(
      memberQueryDto.keyword || '',
      memberQueryDto.username || '',
      memberQueryDto.page,
      memberQueryDto.pageSize,
    );
    return {
      ...pageResult,
      list: pageResult.list.map((memberAccount) => this.memberQueryService.toMemberView(memberAccount)),
    };
  }

  /**
   * 按用户名、手机号或邮箱向聊天服务取用户资料。
   */
  @Get('chat-user')
  @RequirePermission(PermissionCode.MEMBER_QUERY)
  findChatUser(@Query() chatUserQueryDto: ChatUserQueryDto) {
    return this.chatUserClient.findByKeyword(chatUserQueryDto.keyword);
  }

  /**
   * 把聊天服务里该用户名的昵称和联系方式写回余额账户。
   */
  @Post('sync')
  @RequirePermission(PermissionCode.MEMBER_QUERY)
  async syncProfile(@Body() syncMemberProfileDto: SyncMemberProfileDto) {
    const chatUserProfile = await this.chatUserClient.findByKeyword(syncMemberProfileDto.username);
    const contact = this.chatUserClient.resolveContact(chatUserProfile.phone, chatUserProfile.email);
    return this.memberQueryService.syncProfile(syncMemberProfileDto.username, chatUserProfile.nickname, contact);
  }

  /**
   * 聊天里有这个用户、A380 还没有余额账户时开户。已有启用账户直接返回，停用的不另建。
   */
  @Post('open')
  @RequirePermission(PermissionCode.MEMBER_RECHARGE)
  async openAccount(@Body() openMemberAccountDto: OpenMemberAccountDto) {
    // 1. 用户名必须能在聊天服务里对上
    const chatUserProfile = await this.chatUserClient.findByKeyword(openMemberAccountDto.username);
    const contact = this.chatUserClient.resolveContact(chatUserProfile.phone, chatUserProfile.email);
    // 2. 没有账户就建余额为 0 的启用账户，并带上昵称和联系方式
    try {
      const memberAccount = await this.memberQueryService.ensureEnabledByUsername(chatUserProfile.username, contact, chatUserProfile.nickname);
      return this.memberQueryService.toMemberView(memberAccount);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw new BusinessException('会员已停用');
      }
      throw error;
    }
  }

  /**
   * 解开付款/充值二维码，只返回用户名。
   */
  @Post('pay-qr')
  @RequirePermission(PermissionCode.MEMBER_RECHARGE)
  readPayQr(@Body() payQrDto: PayQrDto) {
    const username = this.miniappSignService.readPayRechargeUsername(payQrDto.cipherText);
    return { username };
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

/**
 * 给聊天服务页查询 A380 余额。不使用登录令牌，改为核对商家签名。
 */
@Controller('api/v1/common')
export class MemberCommonController {
  constructor(
    private readonly memberQueryService: MemberQueryService,
    private readonly pointBalanceClient: PointBalanceClient,
    private readonly miniappSignService: MiniappSignService,
    private readonly financeBillService: FinanceBillService,
  ) {}

  /**
   * 按聊天用户名返回整数元余额。
   */
  @Public()
  @UseGuards(MerchantAuthGuard)
  @Get('balance')
  async balance(@Query() commonBalanceQueryDto: CommonBalanceQueryDto) {
    const a380 = await this.memberQueryService.readBalanceYuan(commonBalanceQueryDto.chat_account);
    return { a380 };
  }

  /**
   * 按积分账号返回整数积分。积分服务没有这个账号时为 0。
   */
  @Public()
  @UseGuards(MerchantAuthGuard)
  @Get('point-balance')
  async pointBalance(@Query() pointBalanceQueryDto: PointBalanceQueryDto) {
    const point = await this.pointBalanceClient.readPointBalance(pointBalanceQueryDto.account);
    return { point };
  }

  /**
   * 按付款码查询这张码发出之后有没有充值或店内消费。没有时仍返回成功，供 App 继续轮询。
   */
  @Public()
  @UseGuards(MerchantAuthGuard)
  @Post('payment-recharge-status')
  async paymentRechargeStatus(@Body() paymentRechargeStatusDto: PaymentRechargeStatusDto) {
    const payRechargeIssue = this.miniappSignService.readPayRechargeIssue(paymentRechargeStatusDto.cipher_text);
    if (isEmpty(payRechargeIssue)) {
      return this.buildMerchantStatus(false, false, 0);
    }
    // 1. 还没有余额账户时，不可能已经产生充值或店内消费
    const memberAccount = await this.memberQueryService.findByUsername(payRechargeIssue.username);
    if (isEmpty(memberAccount)) {
      return this.buildMerchantStatus(false, false, 0);
    }
    // 2. 只认这张码发出之后的最新一笔充值或店内消费
    const financeBill = await this.financeBillService.findLatestPayRechargeBill(
      toIdentifier(memberAccount.id),
      this.formatIssuedAt(payRechargeIssue.issuedAtMilliseconds),
    );
    if (isEmpty(financeBill)) {
      return this.buildMerchantStatus(false, false, 0);
    }
    const billAmount = new Decimal(financeBill.amount);
    const signedAmount = financeBill.direction === FinanceDirection.OUT ? billAmount.negated() : billAmount;
    return this.buildMerchantStatus(true, true, signedAmount.toNumber());
  }

  /**
   * 组装 App 要的成功结构。code 用 1000，文案字段是 msg。
   */
  private buildMerchantStatus(find: boolean, done: boolean, amount: number) {
    return {
      code: MerchantResponseCode.SUCCESS,
      msg: MerchantResponseMessage.SUCCESS,
      data: {
        find,
        done,
        amount,
      },
    };
  }

  /**
   * 把付款码签发时刻格式化成本地时间，用来和流水创建时间比较。
   */
  private formatIssuedAt(issuedAtMilliseconds: number): string {
    const issuedAt = new Date(issuedAtMilliseconds);
    const monthText = String(issuedAt.getMonth() + 1).padStart(2, '0');
    const dayText = String(issuedAt.getDate()).padStart(2, '0');
    const hourText = String(issuedAt.getHours()).padStart(2, '0');
    const minuteText = String(issuedAt.getMinutes()).padStart(2, '0');
    const secondText = String(issuedAt.getSeconds()).padStart(2, '0');
    return `${issuedAt.getFullYear()}-${monthText}-${dayText} ${hourText}:${minuteText}:${secondText}`;
  }
}
