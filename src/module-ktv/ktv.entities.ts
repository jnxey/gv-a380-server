import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { decimalTransformer } from '../common/tools/column';

/**
 * KTV 包厢。
 */
@Entity('ktv_room')
export class KtvRoom {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ type: 'bigint', unsigned: true })
  shopId: string;

  @Column({ type: 'varchar', length: 32 })
  roomNo: string;

  @Column({ type: 'varchar', length: 64 })
  roomName: string;

  @Column({ type: 'varchar', length: 32 })
  roomType: string;

  @Column({ type: 'int' })
  capacity: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, transformer: decimalTransformer })
  price: string;

  @Column({ type: 'varchar', length: 16 })
  status: string;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: string;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt: string;
}

/**
 * KTV 包厢图片。一个包厢最多 6 张，张数由服务校验。
 */
@Entity('ktv_room_image')
export class KtvRoomImage {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ type: 'bigint', unsigned: true })
  roomId: string;

  @Column({ type: 'varchar', length: 255 })
  imageUrl: string;

  @Column({ type: 'int', unsigned: true, default: 0 })
  sortOrder: number;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: string;
}

/**
 * KTV 预订订单。创建时即扣包厢费。
 */
@Entity('ktv_booking_order')
export class KtvBookingOrder {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ type: 'bigint', unsigned: true })
  shopId: string;

  @Column({ type: 'varchar', length: 64 })
  orderNo: string;

  @Column({ type: 'bigint', unsigned: true })
  memberId: string;

  @Column({ type: 'bigint', unsigned: true })
  roomId: string;

  @Column({ type: 'date' })
  bookingDate: string;

  @Column({ type: 'time' })
  startTime: string;

  @Column({ type: 'time' })
  endTime: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, transformer: decimalTransformer })
  amount: string;

  @Column({ type: 'varchar', length: 32 })
  orderStatus: string;

  @Column({ type: 'varchar', length: 32 })
  verifyCode: string;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: string;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt: string;
}

/**
 * KTV 店内消费单。核销后另行扣款。
 */
@Entity('ktv_consume_order')
export class KtvConsumeOrder {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ type: 'bigint', unsigned: true })
  shopId: string;

  @Column({ type: 'varchar', length: 64 })
  orderNo: string;

  @Column({ type: 'bigint', unsigned: true })
  bookingOrderId: string;

  @Column({ type: 'bigint', unsigned: true })
  memberId: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, transformer: decimalTransformer })
  amount: string;

  @Column({ type: 'varchar', length: 32 })
  orderStatus: string;

  @Column({ type: 'varchar', length: 255, default: '' })
  remark: string;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: string;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt: string;
}
