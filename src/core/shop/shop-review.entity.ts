import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * 门店评价。一单一评，只评门店。
 */
@Entity('shop_review')
export class ShopReview {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ type: 'bigint', unsigned: true })
  shopId: string;

  @Column({ type: 'varchar', length: 16 })
  shopType: string;

  @Column({ type: 'bigint', unsigned: true })
  memberId: string;

  @Column({ type: 'varchar', length: 32 })
  bizType: string;

  @Column({ type: 'bigint', unsigned: true })
  bizOrderId: string;

  @Column({ type: 'varchar', length: 64 })
  bizOrderNo: string;

  @Column({ type: 'int', unsigned: true })
  starRating: number;

  @Column({ type: 'varchar', length: 500, default: '' })
  content: string;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: string;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt: string;
}
