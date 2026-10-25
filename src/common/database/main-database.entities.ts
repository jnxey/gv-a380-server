import { FinanceBill } from '../../core/finance/finance-bill.entity';
import { MemberAccount } from '../../core/member/member-account.entity';
import { NotifyMessage } from '../../core/notify/notify-message.entity';
import {
  SysMenu,
  SysPermission,
  SysRole,
  SysRoleMenu,
  SysRolePermission,
  SysUser,
  SysUserRole,
  SysUserShop,
} from '../../core/rbac/sys.entities';
import { ShopImage } from '../../core/shop/shop-image.entity';
import { ShopReview } from '../../core/shop/shop-review.entity';
import { Shop } from '../../core/shop/shop.entity';
import {
  HotelBookingOrder,
  HotelRoom,
  HotelRoomType,
  HotelRoomTypeImage,
  HotelStayRecord,
} from '../../module-hotel/hotel.entities';
import {
  KtvBookingOrder,
  KtvConsumeOrder,
  KtvRoom,
  KtvRoomType,
  KtvRoomTypeImage,
} from '../../module-ktv/ktv.entities';
import {
  StoreProduct,
  StoreProductCategory,
  StoreProductImage,
  StorePurchase,
  StorePurchaseItem,
  StoreSale,
  StoreSaleItem,
} from '../../module-store/store.entities';

/**
 * 主库 TypeORM 实体列表。
 * ncc 打包后不能用 __dirname glob，必须显式列出，否则会报 No metadata for Entity。
 */
export const MainDatabaseEntities = [
  SysUser,
  SysRole,
  SysUserRole,
  SysPermission,
  SysRolePermission,
  SysMenu,
  SysRoleMenu,
  SysUserShop,
  Shop,
  ShopImage,
  ShopReview,
  MemberAccount,
  FinanceBill,
  NotifyMessage,
  KtvRoomType,
  KtvRoomTypeImage,
  KtvRoom,
  KtvBookingOrder,
  KtvConsumeOrder,
  HotelRoomType,
  HotelRoomTypeImage,
  HotelRoom,
  HotelBookingOrder,
  HotelStayRecord,
  StoreProductCategory,
  StoreProduct,
  StoreProductImage,
  StorePurchase,
  StorePurchaseItem,
  StoreSale,
  StoreSaleItem,
];
