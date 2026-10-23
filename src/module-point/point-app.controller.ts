import { Controller, Get, Query } from '@nestjs/common';
import { CurrentAccount } from '../common/decorators/current-account.decorator';
import { PageQueryDto } from '../common/dto/page-query.dto';
import { LoginAccountContext } from '../common/interfaces/login-account-context';
import { FinanceDirection } from '../common/constants';
import { isEmpty } from '../common/tools';
import { ChatUserClient } from '../core/member/chat-user.client';
import { MemberQueryService } from '../core/member/member-query.service';
import { PointBizTypeLabel, PointLedgerDirection } from './point.constants';
import { PointLedgerService } from './point-ledger.service';

class PointBillQueryDto extends PageQueryDto {}

/**
 * 小程序积分明细。用聊天用户已绑定的 point_account 查积分账簿。
 */
@Controller('app/point')
export class PointAppController {
  constructor(
    private readonly pointLedgerService: PointLedgerService,
    private readonly memberQueryService: MemberQueryService,
    private readonly chatUserClient: ChatUserClient,
  ) {}

  /**
   * 当前会员的积分余额。
   */
  @Get('summary')
  async summary(@CurrentAccount() loginAccountContext: LoginAccountContext) {
    const pointsAccount = await this.resolvePointsAccount(loginAccountContext.accountId);
    if (isEmpty(pointsAccount)) {
      return { pointsAccount: '', balance: '0' };
    }
    const balanceView = await this.pointLedgerService.getCurrentBalanceByAccount(pointsAccount);
    return {
      pointsAccount,
      balance: String(Math.trunc(balanceView.balance)),
    };
  }

  /**
   * 当前会员的积分流水。
   */
  @Get('bills')
  async bills(@Query() pointBillQueryDto: PointBillQueryDto, @CurrentAccount() loginAccountContext: LoginAccountContext) {
    const pointsAccount = await this.resolvePointsAccount(loginAccountContext.accountId);
    if (isEmpty(pointsAccount)) {
      return { list: [], total: 0 };
    }
    const pageResult = await this.pointLedgerService.pageBillsByAccount(pointsAccount, pointBillQueryDto.page, pointBillQueryDto.pageSize);
    return {
      list: pageResult.list.map((ledgerRow) => {
        const isIncome = ledgerRow.direction === PointLedgerDirection.INCREASE;
        return {
          id: String(ledgerRow.id),
          bizType: PointBizTypeLabel[ledgerRow.biz_type] || ledgerRow.biz_type,
          direction: isIncome ? FinanceDirection.IN : FinanceDirection.OUT,
          amount: String(ledgerRow.amount),
          balanceAfter: String(ledgerRow.balance),
          remark: isEmpty(ledgerRow.remark) ? '' : ledgerRow.remark,
          createdAt: this.formatUnixSeconds(ledgerRow.created_at),
        };
      }),
      total: pageResult.total,
    };
  }

  /**
   * 按会员用户名向聊天服务取 point_account。未绑定或查不到时返回空。
   */
  private async resolvePointsAccount(memberId: string): Promise<string> {
    const memberAccount = await this.memberQueryService.findById(memberId);
    if (isEmpty(memberAccount) || isEmpty(memberAccount.username)) {
      return '';
    }
    try {
      const chatUserProfile = await this.chatUserClient.findByKeyword(memberAccount.username);
      return isEmpty(chatUserProfile.pointAccount) ? '' : chatUserProfile.pointAccount.trim();
    } catch {
      return '';
    }
  }

  /**
   * Unix 秒转成本地时间文案。
   */
  private formatUnixSeconds(unixSeconds: number): string {
    const dateValue = new Date(unixSeconds * 1000);
    const monthText = String(dateValue.getMonth() + 1).padStart(2, '0');
    const dayText = String(dateValue.getDate()).padStart(2, '0');
    const hourText = String(dateValue.getHours()).padStart(2, '0');
    const minuteText = String(dateValue.getMinutes()).padStart(2, '0');
    const secondText = String(dateValue.getSeconds()).padStart(2, '0');
    return `${dateValue.getFullYear()}-${monthText}-${dayText} ${hourText}:${minuteText}:${secondText}`;
  }
}
