import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FinanceBill } from './finance-bill.entity';
import { FinanceBillController } from './finance-bill.controller';
import { FinanceBillService } from './finance-bill.service';

/**
 * 统一账务查询模块。
 */
@Module({
  imports: [TypeOrmModule.forFeature([FinanceBill])],
  controllers: [FinanceBillController],
  providers: [FinanceBillService],
  exports: [FinanceBillService],
})
export class FinanceModule {}
