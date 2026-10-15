import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * 站内消息。
 */
@Entity('notify_message')
export class NotifyMessage {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ type: 'bigint', unsigned: true })
  shopId: string;

  @Column({ type: 'varchar', length: 16 })
  receiverType: string;

  @Column({ type: 'bigint', unsigned: true })
  receiverId: string;

  @Column({ type: 'varchar', length: 128 })
  title: string;

  @Column({ type: 'varchar', length: 500 })
  content: string;

  @Column({ type: 'varchar', length: 16 })
  readStatus: string;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: string;
}
