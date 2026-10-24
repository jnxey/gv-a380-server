import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MemberModule } from '../member/member.module';
import { SysUser } from '../rbac/sys.entities';
import { ShopModule } from '../shop/shop.module';
import { FinanceBill } from './finance-bill.entity';
import { FinanceBillController } from './finance-bill.controller';
import { FinanceBillService } from './finance-bill.service';

/**
 * 统一账务查询模块。
 */
@Module({
  imports: [TypeOrmModule.forFeature([FinanceBill, SysUser]), forwardRef(() => MemberModule), ShopModule],
  controllers: [FinanceBillController],
  providers: [FinanceBillService],
  exports: [FinanceBillService],
})
export class FinanceModule {}
