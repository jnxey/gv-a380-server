import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * gv_admin.member。仅用于积分会员号/密码校验。
 */
@Entity('member')
export class PointMemberEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 100 })
  account: string;

  @Column({ type: 'varchar', length: 100, nullable: true, select: false })
  password: string | null;

  @Column({ type: 'varchar', length: 8 })
  status: string;

  @Column({ type: 'varchar', length: 100, name: 'points_account' })
  pointsAccount: string;
}
