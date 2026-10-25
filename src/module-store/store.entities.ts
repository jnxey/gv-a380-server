import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { decimalTransformer } from '../common/tools/column';

/**
 * 商铺商品分类。按门店隔离。
 */
@Entity('store_product_category')
export class StoreProductCategory {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ type: 'bigint', unsigned: true })
  shopId: string;

  @Column({ type: 'varchar', length: 64 })
  categoryName: string;

  @Column({ type: 'int', unsigned: true, default: 0 })
  sortOrder: number;

  @Column({ type: 'varchar', length: 16 })
  status: string;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: string;
}

/**
 * 商铺商品。库存只由进货和销售改。
 */
/**
 * 商品详细描述。
 */
export interface StoreProductDescription {
  content: string;
}

@Entity('store_product')
export class StoreProduct {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ type: 'bigint', unsigned: true })
  shopId: string;

  @Column({ type: 'bigint', unsigned: true })
  categoryId: string;

  @Column({ type: 'varchar', length: 64 })
  productName: string;

  @Column({ type: 'json' })
  description: StoreProductDescription;

  @Column({ type: 'varchar', length: 32, default: '' })
  barcode: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, transformer: decimalTransformer })
  salePrice: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0, transformer: decimalTransformer })
  pointDeductAmount: string = '0.00';

  @Column({ type: 'int', unsigned: true, default: 0 })
  pointDeductPoints: number = 0;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0, transformer: decimalTransformer })
  costPrice: string;

  @Column({ type: 'int', unsigned: true, default: 0 })
  stockQuantity: number;

  @Column({ type: 'int', unsigned: true, default: 0 })
  sortOrder: number;

  @Column({ type: 'tinyint', width: 1, default: 0 })
  quickProduct: number = 0;

  @Column({ type: 'varchar', length: 16 })
  status: string;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: string;
}

/**
 * 商铺商品图片。一个商品最多 6 张，张数由服务校验。
 */
@Entity('store_product_image')
export class StoreProductImage {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ type: 'bigint', unsigned: true })
  productId: string;

  @Column({ type: 'varchar', length: 255 })
  imageUrl: string;

  @Column({ type: 'int', unsigned: true, default: 0 })
  sortOrder: number;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: string;
}

/**
 * 进货单。确认后增加库存。
 */
@Entity('store_purchase')
export class StorePurchase {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ type: 'bigint', unsigned: true })
  shopId: string;

  @Column({ type: 'varchar', length: 32 })
  purchaseNo: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, transformer: decimalTransformer })
  amount: string;

  @Column({ type: 'bigint', unsigned: true, nullable: true })
  operatorId: string | null;

  @Column({ type: 'varchar', length: 128, default: '' })
  remark: string;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: string;
}

/**
 * 进货明细。记下当时的品名和进价。
 */
@Entity('store_purchase_item')
export class StorePurchaseItem {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ type: 'bigint', unsigned: true })
  purchaseId: string;

  @Column({ type: 'bigint', unsigned: true })
  productId: string;

  @Column({ type: 'varchar', length: 64 })
  productName: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, transformer: decimalTransformer })
  costPrice: string;

  @Column({ type: 'int', unsigned: true })
  quantity: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, transformer: decimalTransformer })
  lineAmount: string;
}

/**
 * 销售单。会员余额会扣款，现金只记这张单。
 */
@Entity('store_sale')
export class StoreSale {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ type: 'bigint', unsigned: true })
  shopId: string;

  @Column({ type: 'varchar', length: 32 })
  saleNo: string;

  @Column({ type: 'bigint', unsigned: true, nullable: true })
  memberId: string | null;

  @Column({ type: 'varchar', length: 16 })
  payMethod: string;

  @Column({ type: 'varchar', length: 32, default: 'COMPLETED' })
  saleStatus: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, transformer: decimalTransformer })
  amount: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0, transformer: decimalTransformer })
  pointDeductAmount: string = '0.00';

  @Column({ type: 'int', unsigned: true, default: 0 })
  pointDeductPoints: number = 0;

  @Column({ type: 'bigint', unsigned: true, nullable: true })
  operatorId: string | null;

  @Column({ type: 'varchar', length: 128, default: '' })
  remark: string;

  @Column({ type: 'varchar', length: 255, default: '' })
  deliveryAddress: string;

  @Column({ type: 'varchar', length: 64, default: '' })
  receiverName: string;

  @Column({ type: 'varchar', length: 64, default: '' })
  contact: string;

  @Column({ type: 'varchar', length: 64, default: '' })
  courierName: string;

  @Column({ type: 'varchar', length: 64, default: '' })
  courierContact: string;

  @Column({ type: 'varchar', length: 64, default: '' })
  deliveryNo: string;

  @Column({ type: 'varchar', length: 128, default: '' })
  deliveryRemark: string;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: string;
}

/**
 * 销售明细。记下当时的品名和售价。
 */
@Entity('store_sale_item')
export class StoreSaleItem {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ type: 'bigint', unsigned: true })
  saleId: string;

  @Column({ type: 'bigint', unsigned: true })
  productId: string;

  @Column({ type: 'varchar', length: 64 })
  productName: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, transformer: decimalTransformer })
  salePrice: string;

  @Column({ type: 'int', unsigned: true })
  quantity: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, transformer: decimalTransformer })
  lineAmount: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0, transformer: decimalTransformer })
  pointDeductAmount: string = '0.00';

  @Column({ type: 'int', unsigned: true, default: 0 })
  pointDeductPoints: number = 0;
}
