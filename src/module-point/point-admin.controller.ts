import { Controller, Get, Query } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { FinanceDirection, ModuleCode, PermissionCode } from '../common/constants';
import { RequireModule, RequirePermission } from '../common/decorators/auth.decorators';
import { PageQueryDto } from '../common/dto/page-query.dto';
import { isEmpty } from '../common/tools';
import { ChatUserClient } from '../core/member/chat-user.client';
import { PointBizTypeLabel, PointLedgerDirection } from './point.constants';
import { PointLedgerService } from './point-ledger.service';

/**
 * 后台用户积分查询参数。
 */
export class AdminPointBillQueryDto extends PageQueryDto {
  @IsOptional()
  @IsString()
  keyword?: string;
}

/**
 * 后台按聊天用户查询积分账号、余额和流水。
 */
@Controller('admin/point/bills')
@RequireModule(ModuleCode.CORE)
export class PointAdminController {
  constructor(
    private readonly pointLedgerService: PointLedgerService,
    private readonly chatUserClient: ChatUserClient,
  ) {}

  /**
   * 按账号、手机号或邮箱查积分明细。没有关键字时不查全部账号。
   */
  @Get()
  @RequirePermission(PermissionCode.FINANCE_POINT_QUERY)
  async pageBills(@Query() adminPointBillQueryDto: AdminPointBillQueryDto) {
    const cleanedKeyword = isEmpty(adminPointBillQueryDto.keyword) ? '' : adminPointBillQueryDto.keyword.trim();
    if (isEmpty(cleanedKeyword)) {
      return {
        username: '',
        pointsAccount: '',
        balance: '0',
        list: [],
        total: 0,
      };
    }
    // 1. 按账号、手机号或邮箱找到聊天用户
    const chatUserProfile = await this.chatUserClient.findByKeyword(cleanedKeyword);
    const pointsAccount = isEmpty(chatUserProfile.pointAccount) ? '' : chatUserProfile.pointAccount.trim();
    if (isEmpty(pointsAccount)) {
      return {
        username: chatUserProfile.username,
        pointsAccount: '',
        balance: '0',
        list: [],
        total: 0,
      };
    }
    // 2. 读当前余额和这一页流水
    const balanceView = await this.pointLedgerService.getCurrentBalanceByAccount(pointsAccount);
    const pageResult = await this.pointLedgerService.pageBillsByAccount(
      pointsAccount,
      adminPointBillQueryDto.page,
      adminPointBillQueryDto.pageSize,
    );
    return {
      username: chatUserProfile.username,
      pointsAccount,
      balance: String(Math.trunc(balanceView.balance)),
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
