import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { decimalTransformer } from '../common/tools/column';

/**
 * KTV 包厢类型。每小时价格在类型上，包厢仍保留自己的预订价格。
 */
@Entity('ktv_room_type')
export class KtvRoomType {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ type: 'bigint', unsigned: true })
  shopId: string;

  @Column({ type: 'varchar', length: 64 })
  typeName: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, transformer: decimalTransformer })
  hourlyPrice: string;

  @Column({ type: 'varchar', length: 16 })
  status: string;

  @Column({ type: 'int', unsigned: true, default: 0 })
  sortOrder: number;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: string;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt: string;
}

/**
 * KTV 包厢类型图片。一个类型最多 6 张，张数由服务校验。
 */
@Entity('ktv_room_type_image')
export class KtvRoomTypeImage {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ type: 'bigint', unsigned: true })
  roomTypeId: string;

  @Column({ type: 'varchar', length: 255 })
  imageUrl: string;

  @Column({ type: 'int', unsigned: true, default: 0 })
  sortOrder: number;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: string;
}

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

  @Column({ type: 'bigint', unsigned: true })
  roomTypeId: string;

  @Column({ type: 'int' })
  capacity: number;

  @Column({ type: 'varchar', length: 16 })
  status: string;

  @Column({ type: 'int', unsigned: true, default: 0 })
  sortOrder: number;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: string;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt: string;
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
  roomTypeId: string;

  @Column({ type: 'bigint', unsigned: true, nullable: true })
  roomId: string | null;

  @Column({ type: 'date' })
  bookingDate: string;

  @Column({ type: 'time' })
  startTime: string;

  @Column({ type: 'time' })
  endTime: string;

  @Column({ type: 'int', unsigned: true })
  durationHours: number;

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
