import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * 营业时间。结束早于开始时表示跨到第二天。
 */
export interface ShopBusinessHours {
  startTime: string;
  endTime: string;
}

/**
 * 门店地址。经纬度和地址描述放在一起。
 */
export interface ShopAddressLocation {
  longitude: number | null;
  latitude: number | null;
  addressText: string;
}

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

  @Column({ type: 'varchar', length: 64, default: '' })
  timeZone: string;

  @Column({ type: 'json', nullable: true })
  businessHours: ShopBusinessHours | null;

  @Column({ type: 'json', nullable: true })
  shopAddress: ShopAddressLocation | null;

  @Column({ type: 'varchar', length: 32, default: '' })
  contactPhone: string;

  @Column({ type: 'varchar', length: 16 })
  status: string;

  @Column({ type: 'tinyint', width: 1, default: 0 })
  requireRoomNo: number = 0;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: string;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt: string;
}
