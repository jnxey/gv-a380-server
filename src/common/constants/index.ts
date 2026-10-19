/**
 * 账号类型。会员与后台账号严禁混用。
 */
export const AccountType = {
  MEMBER: 'MEMBER',
  SYS_USER: 'SYS_USER',
} as const;

/**
 * 后台密码哈希。轮数与现有种子哈希一致。
 */
export const PasswordHash = {
  SALT_ROUNDS: 10,
} as const;

/**
 * 后台角色编码。
 */
export const RoleCode = {
  GROUP_SUPER_ADMIN: 'GROUP_SUPER_ADMIN',
  GROUP_FINANCE: 'GROUP_FINANCE',
  KTV_SHOP_ADMIN: 'KTV_SHOP_ADMIN',
  KTV_FRONT_DESK: 'KTV_FRONT_DESK',
  HOTEL_SHOP_ADMIN: 'HOTEL_SHOP_ADMIN',
  HOTEL_FRONT_DESK: 'HOTEL_FRONT_DESK',
} as const;

/**
 * 角色数据范围。
 */
export const RoleScope = {
  GROUP: 'GROUP',
  KTV: 'KTV',
  HOTEL: 'HOTEL',
} as const;

/**
 * 业务模块编码。
 */
export const ModuleCode = {
  CORE: 'CORE',
  KTV: 'KTV',
  HOTEL: 'HOTEL',
} as const;

/**
 * 门店类型。
 */
export const ShopType = {
  KTV: 'KTV',
  HOTEL: 'HOTEL',
} as const;

/**
 * 门店图片数量和大小上限。
 */
export const ShopImageLimit = {
  MAX_COUNT: 6,
  MAX_BYTES: 5 * 1024 * 1024,
} as const;

/**
 * 允许上传的门店图片类型。
 */
export const ShopImageMime = {
  JPEG: 'image/jpeg',
  PNG: 'image/png',
  WEBP: 'image/webp',
} as const;

/**
 * 通用启停状态。
 */
export const RecordStatus = {
  ENABLED: 'ENABLED',
  DISABLED: 'DISABLED',
} as const;

/**
 * 财务流水业务类型。
 */
export const FinanceBizType = {
  RECHARGE: 'RECHARGE',
  KTV_BOOKING: 'KTV_BOOKING',
  KTV_IN_STORE: 'KTV_IN_STORE',
  HOTEL_ROOM_FEE: 'HOTEL_ROOM_FEE',
  REFUND: 'REFUND',
} as const;

/**
 * 财务流水方向。
 */
export const FinanceDirection = {
  IN: 'IN',
  OUT: 'OUT',
} as const;

/**
 * KTV 预订订单状态。
 */
export const KtvOrderStatus = {
  PENDING_VERIFY: 'PENDING_VERIFY',
  VERIFIED: 'VERIFIED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  REFUNDED: 'REFUNDED',
} as const;

/**
 * 仍占用包厢时段的 KTV 订单状态。
 */
export const KtvBookingActiveStatusList = [
  KtvOrderStatus.PENDING_VERIFY,
  KtvOrderStatus.VERIFIED,
  KtvOrderStatus.COMPLETED,
];

/**
 * 允许取消并退款的 KTV 订单状态。
 */
export const KtvBookingCancelableStatusList = [
  KtvOrderStatus.PENDING_VERIFY,
  KtvOrderStatus.VERIFIED,
];

/**
 * 单笔预订的演唱小时数。
 */
export const KtvBookingHour = {
  MIN: 1,
  MAX: 24,
} as const;

/**
 * 可预约的开唱刻度。今天从下一档可用刻度起到 23:30，后四天每天 00:00 到 23:30。
 */
export const KtvBookingSlot = {
  DAY_COUNT: 5,
  STEP_MINUTES: 30,
  LEAD_MINUTES: 15,
} as const;

/**
 * KTV 包厢运营状态。使用中只由核销写入，其余可手动切换。
 */
export const KtvRoomStatus = {
  IDLE: 'IDLE',
  IN_USE: 'IN_USE',
  CLEANING: 'CLEANING',
  MAINTENANCE: 'MAINTENANCE',
  CLOSED: 'CLOSED',
} as const;

/**
 * KTV 店内消费单状态。
 */
export const KtvConsumeStatus = {
  COMPLETED: 'COMPLETED',
} as const;

/**
 * 酒店预订订单状态。
 */
export const HotelOrderStatus = {
  BOOKED: 'BOOKED',
  CHECKED_IN: 'CHECKED_IN',
  CHECKED_OUT: 'CHECKED_OUT',
  CANCELLED: 'CANCELLED',
} as const;

/**
 * 酒店入住记录状态。
 */
export const HotelStayStatus = {
  IN_HOUSE: 'IN_HOUSE',
  EXTENDED: 'EXTENDED',
  CHECKED_OUT: 'CHECKED_OUT',
} as const;

/**
 * 酒店房间房态。
 */
export const HotelRoomStatus = {
  IDLE: 'IDLE',
  OCCUPIED: 'OCCUPIED',
  MAINTENANCE: 'MAINTENANCE',
} as const;

/**
 * 积分变动类型。
 */
export const PointChangeType = {
  EARN: 'EARN',
} as const;

/**
 * 消费入账时，每 1 元向下取整后增加的积分。
 */
export const PointRule = {
  EARN_PER_YUAN: 1,
} as const;

/**
 * 消息接收人类型。
 */
export const ReceiverType = {
  MEMBER: 'MEMBER',
  SYS_USER: 'SYS_USER',
} as const;

/**
 * 消息阅读状态。
 */
export const ReadStatus = {
  UNREAD: 'UNREAD',
  READ: 'READ',
} as const;

/**
 * 接口功能权限编码，与 sys_permission.permission_code 一致。
 */
export const PermissionCode = {
  MEMBER_QUERY: 'member:query',
  MEMBER_RECHARGE: 'member:recharge',
  FINANCE_BILL_QUERY: 'finance:bill:query',
  KTV_SHOP_QUERY: 'ktv:shop:query',
  KTV_SHOP_SAVE: 'ktv:shop:save',
  KTV_ROOM_TYPE_QUERY: 'ktv:room-type:query',
  KTV_ROOM_TYPE_SAVE: 'ktv:room-type:save',
  KTV_ROOM_QUERY: 'ktv:room:query',
  KTV_ROOM_SAVE: 'ktv:room:save',
  KTV_ORDER_QUERY: 'ktv:order:query',
  KTV_ORDER_VERIFY: 'ktv:order:verify',
  KTV_ORDER_CONSUME: 'ktv:order:consume',
  KTV_ORDER_CANCEL: 'ktv:order:cancel',
  HOTEL_SHOP_QUERY: 'hotel:shop:query',
  HOTEL_SHOP_SAVE: 'hotel:shop:save',
  HOTEL_ROOM_TYPE_QUERY: 'hotel:room-type:query',
  HOTEL_ROOM_TYPE_SAVE: 'hotel:room-type:save',
  HOTEL_ROOM_QUERY: 'hotel:room:query',
  HOTEL_ROOM_SAVE: 'hotel:room:save',
  HOTEL_ORDER_QUERY: 'hotel:order:query',
  HOTEL_STAY_CHECK_IN: 'hotel:stay:check-in',
  HOTEL_STAY_EXTEND: 'hotel:stay:extend',
  HOTEL_STAY_CHECK_OUT: 'hotel:stay:check-out',
  HOTEL_ORDER_CANCEL: 'hotel:order:cancel',
  SYSTEM_USER_QUERY: 'system:user:query',
  SYSTEM_USER_SAVE: 'system:user:save',
  SYSTEM_ROLE_QUERY: 'system:role:query',
  SYSTEM_ROLE_SAVE: 'system:role:save',
} as const;

/**
 * 系统管理菜单路径。
 */
export const SystemMenuPath = {
  ROOT: '/system',
  USER: '/system/user',
  ROLE: '/system/role',
} as const;

/**
 * 集团超级管理员保存角色时必须保留的系统管理权限和菜单。
 */
export const SuperAdminKeep = {
  PERMISSION_CODE_LIST: [
    PermissionCode.SYSTEM_USER_QUERY,
    PermissionCode.SYSTEM_USER_SAVE,
    PermissionCode.SYSTEM_ROLE_QUERY,
    PermissionCode.SYSTEM_ROLE_SAVE,
  ],
  MENU_PATH_LIST: [SystemMenuPath.ROOT, SystemMenuPath.USER, SystemMenuPath.ROLE],
} as const;

/**
 * 请求路径前缀。
 */
export const RequestPathPrefix = {
  APP: '/app',
  ADMIN: '/admin',
} as const;

/**
 * 请求头名称。Express 会把请求头转成小写。
 */
export const RequestHeaderName = {
  SHOP_ID: 'x-shop-id',
} as const;

/**
 * 授权方案。
 */
export const AuthorizationScheme = {
  BEARER: 'Bearer',
} as const;

/**
 * 小程序身份签名明文里的 type。与聊天服务端签发的类型一致。
 */
export const MiniappSignType = {
  MINIAPP_SIGN: 'MP_SIGN',
} as const;

/**
 * 小程序身份签名明文里的附加字段名。与聊天服务端签发的字段一致。
 */
export const MiniappSignField = {
  CONTACT: 'contact',
  NICKNAME: 'nickname',
} as const;

/**
 * AES-GCM 密文布局。12 字节 IV 在前，16 字节认证标签在后。
 */
export const AesGcmSetting = {
  IV_LENGTH: 12,
  TAG_LENGTH: 16,
} as const;

/**
 * Redis 键前缀。只用于 JWT 黑名单。
 */
export const RedisKey = {
  JWT_BLACKLIST_PREFIX: 'auth:blacklist:',
} as const;

/**
 * Redis 连接默认值。
 */
export const RedisSetting = {
  DEFAULT_PORT: 6379,
} as const;

/**
 * 黑名单占位值。
 */
export const RedisValue = {
  BLACKLISTED: '1',
} as const;

/**
 * 统一响应码。
 */
export const ResponseCode = {
  SUCCESS: 0,
  FAIL: 1,
} as const;

/**
 * 统一响应文案。
 */
export const ResponseMessage = {
  SUCCESS: 'ok',
} as const;

/**
 * 菜单根节点父级 ID。
 */
export const MenuRoot = {
  PARENT_ID: '0',
} as const;

/**
 * 分页默认值。
 */
export const PageSetting = {
  DEFAULT_PAGE: 1,
  DEFAULT_PAGE_SIZE: 10,
  MAX_PAGE_SIZE: 100,
} as const;

/**
 * 金额小数位。
 */
export const MoneyScale = {
  AMOUNT: 2,
} as const;

/**
 * 入住计费规则。
 */
export const StayRule = {
  MIN_NIGHT_COUNT: 1,
} as const;

/**
 * 时间跨度。
 */
export const TimeSpan = {
  MILLISECONDS_PER_DAY: 86400000,
  MILLISECONDS_PER_SECOND: 1000,
  MIN_REDIS_TTL_SECONDS: 1,
} as const;

/**
 * 单号与核销码规则。
 */
export const BusinessNoRule = {
  RANDOM_UPPER: 1000000,
  RANDOM_LENGTH: 6,
} as const;

/**
 * 业务单号前缀。
 */
export const BusinessNoPrefix = {
  FINANCE_BILL: 'FB',
  KTV_BOOKING: 'KTVB',
  KTV_CONSUME: 'KTVC',
  HOTEL_BOOKING: 'HTLB',
} as const;

/**
 * 密码哈希成本。
 */
export const PasswordSetting = {
  SALT_ROUNDS: 10,
} as const;

/**
 * JWT 默认有效秒数。配置缺失时使用，6 小时。
 */
export const JwtSetting = {
  DEFAULT_EXPIRES_SECONDS: 6 * 60 * 60,
} as const;

/**
 * 服务监听端口默认值。
 */
export const ServerSetting = {
  DEFAULT_PORT: 3000,
} as const;

/**
 * 数据库连接默认端口。
 */
export const DatabaseSetting = {
  DEFAULT_PORT: 3306,
} as const;

/**
 * 数值边界。
 */
export const NumberBoundary = {
  ZERO: 0,
} as const;

/**
 * 核销码冲突时的最大重试次数。
 */
export const VerifyCodeRule = {
  MAX_RETRY_TIMES: 5,
} as const;

/**
 * MySQL 驱动错误码。
 */
export const MysqlErrorCode = {
  DUPLICATE_ENTRY: 'ER_DUP_ENTRY',
} as const;

/**
 * 参与门店隔离的业务表。member_account、shop、sys_user_shop 不在此列。
 */
export const ShopScopedTableName = {
  KTV_ROOM_TYPE: 'ktv_room_type',
  KTV_ROOM: 'ktv_room',
  KTV_BOOKING_ORDER: 'ktv_booking_order',
  KTV_CONSUME_ORDER: 'ktv_consume_order',
  HOTEL_ROOM_TYPE: 'hotel_room_type',
  HOTEL_ROOM: 'hotel_room',
  HOTEL_BOOKING_ORDER: 'hotel_booking_order',
  HOTEL_STAY_RECORD: 'hotel_stay_record',
  FINANCE_BILL: 'finance_bill',
  MEMBER_POINT_LOG: 'member_point_log',
  NOTIFY_MESSAGE: 'notify_message',
} as const;

export const ShopScopedTableNameList: string[] = [
  ShopScopedTableName.KTV_ROOM_TYPE,
  ShopScopedTableName.KTV_ROOM,
  ShopScopedTableName.KTV_BOOKING_ORDER,
  ShopScopedTableName.KTV_CONSUME_ORDER,
  ShopScopedTableName.HOTEL_ROOM_TYPE,
  ShopScopedTableName.HOTEL_ROOM,
  ShopScopedTableName.HOTEL_BOOKING_ORDER,
  ShopScopedTableName.HOTEL_STAY_RECORD,
  ShopScopedTableName.FINANCE_BILL,
  ShopScopedTableName.MEMBER_POINT_LOG,
  ShopScopedTableName.NOTIFY_MESSAGE,
];

/**
 * 装饰器元数据键。
 */
export const MetadataKey = {
  PUBLIC: 'publicRoute',
  REQUIRE_PERMISSION: 'requirePermission',
  REQUIRE_MODULE: 'requireModule',
  REQUIRES_SHOP: 'requiresShop',
} as const;

/**
 * TypeORM 查询类型。
 */
export const QueryType = {
  SELECT: 'select',
  INSERT: 'insert',
  UPDATE: 'update',
  DELETE: 'delete',
} as const;
