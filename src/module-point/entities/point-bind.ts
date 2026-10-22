import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * gv_admin._bind_ledger_member_points。积分余额快照。
 */
@Entity('_bind_ledger_member_points')
export class PointBindEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 100 })
  account: string;

  @Column({ type: 'decimal', precision: 14, scale: 5 })
  balance: string;

  @Column({ type: 'decimal', precision: 20, scale: 5, name: 'increase_cumulative', default: 0 })
  increaseCumulative: string;

  @Column({ type: 'int', name: 'update_at' })
  updateAt: number;
}
