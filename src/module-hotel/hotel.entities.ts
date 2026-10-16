import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { decimalTransformer } from '../common/tools/column';

/**
 * 酒店房型。
 */
@Entity('hotel_room_type')
export class HotelRoomType {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ type: 'bigint', unsigned: true })
  shopId: string;

  @Column({ type: 'varchar', length: 64 })
  typeName: string;

  @Column({ type: 'varchar', length: 32 })
  bedType: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, transformer: decimalTransformer })
  price: string;

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
 * 酒店房型图片。一个房型最多 6 张，张数由服务校验。
 */
@Entity('hotel_room_type_image')
export class HotelRoomTypeImage {
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
 * 酒店房间。
 */
@Entity('hotel_room')
export class HotelRoom {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ type: 'bigint', unsigned: true })
  shopId: string;

  @Column({ type: 'bigint', unsigned: true })
  roomTypeId: string;

  @Column({ type: 'varchar', length: 32 })
  roomNo: string;

  @Column({ type: 'varchar', length: 16 })
  floorNo: string;

  @Column({ type: 'varchar', length: 16 })
  roomStatus: string;

  @Column({ type: 'int', unsigned: true, default: 0 })
  sortOrder: number;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: string;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt: string;
}

/**
 * 酒店预订订单。预订不扣款，退房时结算房费。
 */
@Entity('hotel_booking_order')
export class HotelBookingOrder {
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
  checkInDate: string;

  @Column({ type: 'date' })
  checkOutDate: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0, transformer: decimalTransformer })
  amount: string;

  @Column({ type: 'varchar', length: 32 })
  orderStatus: string;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: string;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt: string;
}

/**
 * 酒店入住、续住、退房过程。
 */
@Entity('hotel_stay_record')
export class HotelStayRecord {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ type: 'bigint', unsigned: true })
  shopId: string;

  @Column({ type: 'bigint', unsigned: true })
  bookingOrderId: string;

  @Column({ type: 'bigint', unsigned: true })
  roomId: string;

  @Column({ type: 'bigint', unsigned: true })
  memberId: string;

  @Column({ type: 'varchar', length: 32 })
  stayStatus: string;

  @Column({ type: 'datetime', nullable: true })
  actualCheckIn: string | null;

  @Column({ type: 'datetime', nullable: true })
  actualCheckOut: string | null;

  @Column({ type: 'date' })
  plannedCheckOutDate: string;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: string;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt: string;
}
