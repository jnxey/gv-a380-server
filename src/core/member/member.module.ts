import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FinanceModule } from '../finance/finance.module';
import { FinanceBill } from '../finance/finance-bill.entity';
import { AuthModule } from '../auth/auth.module';
import { MerchantAuthModule } from '../../common/merchant-auth/merchant-auth.module';
import { ChatUserClient } from './chat-user.client';
import { MemberAccount } from './member-account.entity';
import { MemberAdminController, MemberAppController, MemberCommonController } from './member.controller';
import { MemberBalanceService } from './member-balance.service';
import { MemberPointLog } from './member-point-log.entity';
import { MemberQueryService } from './member-query.service';
import { PointBalanceClient } from './point-balance.client';

/**
 * 会员中台。只导出服务，不把 member_account 仓储暴露给业务模块。
 */
@Module({
  imports: [forwardRef(() => AuthModule), TypeOrmModule.forFeature([MemberAccount, MemberPointLog, FinanceBill]), forwardRef(() => FinanceModule), MerchantAuthModule],
  controllers: [MemberAdminController, MemberAppController, MemberCommonController],
  providers: [MemberBalanceService, MemberQueryService, ChatUserClient, PointBalanceClient],
  exports: [MemberBalanceService, MemberQueryService, ChatUserClient],
})
export class MemberModule {}
