import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { decimalTransformer } from '../../common/tools/column';

/**
 * A380 余额账户。人在聊天 App，这里只挂用户名、余额和状态。
 * 业务模块禁止注入本实体的 Repository 去改余额。
 */
@Entity('member_account')
export class MemberAccount {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ type: 'varchar', length: 64 })
  username: string;

  @Column({ type: 'varchar', length: 256, default: '' })
  contact: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, transformer: decimalTransformer })
  balance: string;

  @Column({ type: 'varchar', length: 16 })
  status: string;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: string;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt: string;
}
