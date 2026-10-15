import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * 门店主表。
 */
@Entity('shop')
export class Shop {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ type: 'varchar', length: 32 })
  shopCode: string;

  @Column({ type: 'varchar', length: 64 })
  shopName: string;

  @Column({ type: 'varchar', length: 16 })
  shopType: string;

  @Column({ type: 'varchar', length: 255, default: '' })
  address: string;

  @Column({ type: 'varchar', length: 32, default: '' })
  contactPhone: string;

  @Column({ type: 'varchar', length: 16 })
  status: string;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: string;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt: string;
}
