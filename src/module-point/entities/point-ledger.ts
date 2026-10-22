import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * gv_admin.ledger_member_points 基表实体。月分表结构与此相同。
 */
@Entity('ledger_member_points')
export class PointLedgerEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 64, name: 'ledger_id' })
  ledgerId: string;

  @Column({ type: 'varchar', length: 100 })
  account: string;

  @Column({ type: 'varchar', length: 32, name: 'biz_type' })
  bizType: string;

  @Column({ type: 'varchar', length: 8 })
  direction: string;

  @Column({ type: 'decimal', precision: 14, scale: 5 })
  amount: string;

  @Column({ type: 'decimal', precision: 14, scale: 5 })
  balance: string;

  @Column({ type: 'decimal', precision: 20, scale: 5, name: 'increase_cumulative', default: 0 })
  increaseCumulative: string;

  @Column({ type: 'varchar', length: 80, name: 'referrer_id', nullable: true })
  referrerId: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  remark: string | null;

  @Column({ type: 'json', name: 'describe_json' })
  describeJson: Record<string, unknown>;

  @Column({ type: 'varchar', length: 64, name: 'created_by' })
  createdBy: string;

  @Column({ type: 'int', name: 'created_at' })
  createdAt: number;
}
