import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * 门店图片。一家门店最多 6 张，张数由服务校验。
 */
@Entity('shop_image')
export class ShopImage {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ type: 'bigint', unsigned: true })
  shopId: string;

  @Column({ type: 'varchar', length: 255 })
  imageUrl: string;

  @Column({ type: 'int', unsigned: true, default: 0 })
  sortOrder: number;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: string;
}
