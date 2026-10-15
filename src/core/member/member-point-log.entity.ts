import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * 会员积分变动记录。
 */
@Entity('member_point_log')
export class MemberPointLog {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ type: 'bigint', unsigned: true })
  memberId: string;

  @Column({ type: 'bigint', unsigned: true })
  shopId: string;

  @Column({ type: 'varchar', length: 16 })
  changeType: string;

  @Column({ type: 'int' })
  changePoints: number;

  @Column({ type: 'int' })
  pointsBefore: number;

  @Column({ type: 'int' })
  pointsAfter: number;

  @Column({ type: 'varchar', length: 32 })
  bizType: string;

  @Column({ type: 'varchar', length: 64, default: '' })
  bizOrderNo: string;

  @Column({ type: 'varchar', length: 255, default: '' })
  remark: string;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: string;
}
