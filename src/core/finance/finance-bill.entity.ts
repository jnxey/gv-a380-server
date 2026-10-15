import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { decimalTransformer } from '../../common/tools/column';

/**
 * 统一财务流水。充值、KTV、酒店、退款都写这张表。
 */
@Entity('finance_bill')
export class FinanceBill {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ type: 'varchar', length: 64 })
  billNo: string;

  @Column({ type: 'bigint', unsigned: true })
  memberId: string;

  @Column({ type: 'bigint', unsigned: true })
  shopId: string;

  @Column({ type: 'varchar', length: 32 })
  bizType: string;

  @Column({ type: 'varchar', length: 64, default: '' })
  bizOrderNo: string;

  @Column({ type: 'varchar', length: 16 })
  direction: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, transformer: decimalTransformer })
  amount: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, transformer: decimalTransformer })
  balanceBefore: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, transformer: decimalTransformer })
  balanceAfter: string;

  @Column({ type: 'bigint', unsigned: true, nullable: true })
  operatorId: string | null;

  @Column({ type: 'varchar', length: 255, default: '' })
  remark: string;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: string;
}
