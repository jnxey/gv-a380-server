import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FinanceModule } from '../finance/finance.module';
import { FinanceBill } from '../finance/finance-bill.entity';
import { MemberAccount } from './member-account.entity';
import { MemberAdminController, MemberAppController } from './member.controller';
import { MemberBalanceService } from './member-balance.service';
import { MemberPointLog } from './member-point-log.entity';
import { MemberQueryService } from './member-query.service';

/**
 * 会员中台。只导出服务，不把 member_account 仓储暴露给业务模块。
 */
@Module({
  imports: [TypeOrmModule.forFeature([MemberAccount, MemberPointLog, FinanceBill]), FinanceModule],
  controllers: [MemberAdminController, MemberAppController],
  providers: [MemberBalanceService, MemberQueryService],
  exports: [MemberBalanceService, MemberQueryService],
})
export class MemberModule {}
