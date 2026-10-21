-- 集团内部综合消费系统 gv_a380
-- MySQL 8，模块化单体：core / ktv / hotel
-- 金额字段统一 DECIMAL(12,2)

CREATE DATABASE IF NOT EXISTS gv_a380 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE gv_a380;

-- ----------------------------
-- core：门店
-- ----------------------------
CREATE TABLE shop (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  shop_code VARCHAR(32) NOT NULL COMMENT '门店编码',
  shop_name VARCHAR(64) NOT NULL COMMENT '门店名称',
  shop_type VARCHAR(16) NOT NULL COMMENT '门店类型：KTV、HOTEL',
  address VARCHAR(255) NOT NULL DEFAULT '' COMMENT '地址',
  time_zone VARCHAR(64) NOT NULL DEFAULT '' COMMENT '门店时区，IANA 时区名',
  business_hours JSON NULL COMMENT '营业时间，开始到结束',
  shop_address JSON NULL COMMENT '门店地址，经纬度加地址描述',
  contact_phone VARCHAR(32) NOT NULL DEFAULT '' COMMENT '联系电话',
  status VARCHAR(16) NOT NULL COMMENT '状态：ENABLED、DISABLED',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_shop_code (shop_code),
  KEY idx_shop_type_status (shop_type, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='门店主表';

CREATE TABLE shop_image (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  shop_id BIGINT UNSIGNED NOT NULL COMMENT '门店ID',
  image_url VARCHAR(255) NOT NULL COMMENT '图片访问路径',
  sort_order INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '排序，从0开始',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (id),
  KEY idx_shop_image_shop_id (shop_id, sort_order),
  CONSTRAINT fk_shop_image_shop FOREIGN KEY (shop_id) REFERENCES shop (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='门店图片';

-- ----------------------------
-- core：后台账号与 RBAC（与会员账号隔离）
-- ----------------------------
CREATE TABLE sys_user (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  username VARCHAR(64) NOT NULL COMMENT '登录名',
  password_hash VARCHAR(128) NOT NULL COMMENT '密码哈希',
  real_name VARCHAR(64) NOT NULL COMMENT '姓名',
  mobile VARCHAR(32) NOT NULL DEFAULT '' COMMENT '手机号',
  status VARCHAR(16) NOT NULL COMMENT '状态：ENABLED、DISABLED',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_sys_user_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='后台管理账号';

CREATE TABLE sys_role (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  role_code VARCHAR(64) NOT NULL COMMENT '角色编码',
  role_name VARCHAR(64) NOT NULL COMMENT '角色名称',
  role_scope VARCHAR(16) NOT NULL COMMENT '角色范围：GROUP、KTV、HOTEL',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_sys_role_code (role_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='角色';

CREATE TABLE sys_user_role (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  user_id BIGINT UNSIGNED NOT NULL COMMENT '后台用户ID',
  role_id BIGINT UNSIGNED NOT NULL COMMENT '角色ID',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_sys_user_role (user_id, role_id),
  KEY idx_sys_user_role_role_id (role_id),
  CONSTRAINT fk_sys_user_role_user FOREIGN KEY (user_id) REFERENCES sys_user (id),
  CONSTRAINT fk_sys_user_role_role FOREIGN KEY (role_id) REFERENCES sys_role (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='后台用户与角色';

CREATE TABLE sys_permission (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  permission_code VARCHAR(64) NOT NULL COMMENT '权限编码',
  permission_name VARCHAR(64) NOT NULL COMMENT '权限名称',
  module_code VARCHAR(16) NOT NULL COMMENT '所属模块：CORE、KTV、HOTEL',
  menu_id BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '所属页面菜单ID，0表示未挂页面',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_sys_permission_code (permission_code),
  KEY idx_sys_permission_menu_id (menu_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='接口功能权限';

CREATE TABLE sys_role_permission (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  role_id BIGINT UNSIGNED NOT NULL COMMENT '角色ID',
  permission_id BIGINT UNSIGNED NOT NULL COMMENT '权限ID',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_sys_role_permission (role_id, permission_id),
  KEY idx_sys_role_permission_permission_id (permission_id),
  CONSTRAINT fk_sys_role_permission_role FOREIGN KEY (role_id) REFERENCES sys_role (id),
  CONSTRAINT fk_sys_role_permission_permission FOREIGN KEY (permission_id) REFERENCES sys_permission (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='角色与功能权限';

CREATE TABLE sys_menu (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  parent_id BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '父菜单ID，0为顶级',
  menu_name VARCHAR(64) NOT NULL COMMENT '菜单名称',
  menu_path VARCHAR(128) NOT NULL DEFAULT '' COMMENT '前端路由路径',
  component_path VARCHAR(128) NOT NULL DEFAULT '' COMMENT '前端组件标识',
  permission_code VARCHAR(64) NOT NULL DEFAULT '' COMMENT '关联权限编码，目录可空',
  module_code VARCHAR(16) NOT NULL COMMENT '所属模块：CORE、KTV、HOTEL',
  sort_order INT NOT NULL DEFAULT 0 COMMENT '排序',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (id),
  KEY idx_sys_menu_parent_id (parent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='后台菜单';

CREATE TABLE sys_role_menu (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  role_id BIGINT UNSIGNED NOT NULL COMMENT '角色ID',
  menu_id BIGINT UNSIGNED NOT NULL COMMENT '菜单ID',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_sys_role_menu (role_id, menu_id),
  KEY idx_sys_role_menu_menu_id (menu_id),
  CONSTRAINT fk_sys_role_menu_role FOREIGN KEY (role_id) REFERENCES sys_role (id),
  CONSTRAINT fk_sys_role_menu_menu FOREIGN KEY (menu_id) REFERENCES sys_menu (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='角色与菜单';

CREATE TABLE sys_user_shop (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  user_id BIGINT UNSIGNED NOT NULL COMMENT '后台用户ID',
  shop_id BIGINT UNSIGNED NOT NULL COMMENT '门店ID',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_sys_user_shop (user_id, shop_id),
  KEY idx_sys_user_shop_shop_id (shop_id),
  CONSTRAINT fk_sys_user_shop_user FOREIGN KEY (user_id) REFERENCES sys_user (id),
  CONSTRAINT fk_sys_user_shop_shop FOREIGN KEY (shop_id) REFERENCES shop (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='后台用户与门店绑定';

-- ----------------------------
-- core：A380 余额账户。人在聊天 App，这里只挂用户名、余额和状态
-- ----------------------------
CREATE TABLE member_account (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  username VARCHAR(64) NOT NULL COMMENT '聊天用户名',
  nickname VARCHAR(128) NOT NULL DEFAULT '' COMMENT '昵称',
  contact VARCHAR(256) NOT NULL DEFAULT '' COMMENT '联系方式',
  balance DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT '余额',
  status VARCHAR(16) NOT NULL COMMENT '状态：ENABLED、DISABLED',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_member_account_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='A380余额账户';

CREATE TABLE member_point_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  member_id BIGINT UNSIGNED NOT NULL COMMENT '会员ID',
  shop_id BIGINT UNSIGNED NOT NULL COMMENT '业务发生门店ID',
  change_type VARCHAR(16) NOT NULL COMMENT '变动类型：EARN',
  change_points INT NOT NULL COMMENT '变动积分',
  points_before INT NOT NULL COMMENT '变动前积分',
  points_after INT NOT NULL COMMENT '变动后积分',
  biz_type VARCHAR(32) NOT NULL COMMENT '业务类型',
  biz_order_no VARCHAR(64) NOT NULL DEFAULT '' COMMENT '业务单号',
  remark VARCHAR(255) NOT NULL DEFAULT '' COMMENT '备注',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (id),
  KEY idx_member_point_log_member_created (member_id, created_at),
  KEY idx_member_point_log_shop_created (shop_id, created_at),
  CONSTRAINT fk_member_point_log_member FOREIGN KEY (member_id) REFERENCES member_account (id),
  CONSTRAINT fk_member_point_log_shop FOREIGN KEY (shop_id) REFERENCES shop (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='会员积分流水';

CREATE TABLE finance_bill (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  bill_no VARCHAR(64) NOT NULL COMMENT '账单号',
  member_id BIGINT UNSIGNED NOT NULL COMMENT '会员ID',
  shop_id BIGINT UNSIGNED NOT NULL COMMENT '业务发生门店ID',
  biz_type VARCHAR(32) NOT NULL COMMENT '业务类型：RECHARGE、KTV_BOOKING、KTV_IN_STORE、HOTEL_ROOM_FEE、REFUND、SHOP_SCAN_PAY',
  biz_order_no VARCHAR(64) NOT NULL DEFAULT '' COMMENT '业务单号',
  direction VARCHAR(16) NOT NULL COMMENT '方向：IN、OUT',
  amount DECIMAL(12,2) NOT NULL COMMENT '金额',
  balance_before DECIMAL(12,2) NOT NULL COMMENT '变动前余额',
  balance_after DECIMAL(12,2) NOT NULL COMMENT '变动后余额',
  operator_id BIGINT UNSIGNED NULL COMMENT '后台操作人，会员侧消费为空',
  remark VARCHAR(255) NOT NULL DEFAULT '' COMMENT '备注',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_finance_bill_bill_no (bill_no),
  KEY idx_finance_bill_member_created (member_id, created_at),
  KEY idx_finance_bill_shop_created (shop_id, created_at),
  KEY idx_finance_bill_shop_biz_created (shop_id, biz_type, created_at),
  CONSTRAINT fk_finance_bill_member FOREIGN KEY (member_id) REFERENCES member_account (id),
  CONSTRAINT fk_finance_bill_shop FOREIGN KEY (shop_id) REFERENCES shop (id),
  CONSTRAINT fk_finance_bill_operator FOREIGN KEY (operator_id) REFERENCES sys_user (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='统一财务流水';

CREATE TABLE notify_message (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  shop_id BIGINT UNSIGNED NOT NULL COMMENT '门店ID',
  receiver_type VARCHAR(16) NOT NULL COMMENT '接收人类型：MEMBER、SYS_USER',
  receiver_id BIGINT UNSIGNED NOT NULL COMMENT '接收人ID',
  title VARCHAR(128) NOT NULL COMMENT '标题',
  content VARCHAR(500) NOT NULL COMMENT '内容',
  read_status VARCHAR(16) NOT NULL COMMENT '阅读状态：UNREAD、READ',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (id),
  KEY idx_notify_message_receiver (receiver_type, receiver_id, read_status),
  KEY idx_notify_message_shop_created (shop_id, created_at),
  CONSTRAINT fk_notify_message_shop FOREIGN KEY (shop_id) REFERENCES shop (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='站内消息';

-- ----------------------------
-- module-ktv
-- ----------------------------
CREATE TABLE ktv_room_type (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  shop_id BIGINT UNSIGNED NOT NULL COMMENT '门店ID',
  type_name VARCHAR(64) NOT NULL COMMENT '包厢类型名称',
  hourly_price DECIMAL(12,2) NOT NULL COMMENT '每小时价格',
  status VARCHAR(16) NOT NULL COMMENT '状态：ENABLED、DISABLED',
  sort_order INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '排序，从0开始',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  KEY idx_ktv_room_type_shop_status (shop_id, status),
  KEY idx_ktv_room_type_shop_sort (shop_id, sort_order),
  CONSTRAINT fk_ktv_room_type_shop FOREIGN KEY (shop_id) REFERENCES shop (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='KTV包厢类型';

CREATE TABLE ktv_room_type_image (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  room_type_id BIGINT UNSIGNED NOT NULL COMMENT '包厢类型ID',
  image_url VARCHAR(255) NOT NULL COMMENT '图片访问路径',
  sort_order INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '排序，从0开始',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (id),
  KEY idx_ktv_room_type_image_type_id (room_type_id, sort_order),
  CONSTRAINT fk_ktv_room_type_image_type FOREIGN KEY (room_type_id) REFERENCES ktv_room_type (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='KTV包厢类型图片';

CREATE TABLE ktv_room (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  shop_id BIGINT UNSIGNED NOT NULL COMMENT '门店ID',
  room_no VARCHAR(32) NOT NULL COMMENT '包厢编号',
  room_name VARCHAR(64) NOT NULL COMMENT '包厢名称',
  room_type_id BIGINT UNSIGNED NOT NULL COMMENT '包厢类型ID',
  capacity INT NOT NULL COMMENT '容纳人数',
  status VARCHAR(16) NOT NULL COMMENT '状态：ENABLED、DISABLED',
  room_status VARCHAR(16) NOT NULL DEFAULT 'IDLE' COMMENT '包厢状态：IDLE空闲、IN_USE使用中、CLEANING打扫中、MAINTENANCE维修中、CLOSED临时关闭',
  occupy_end_at DATETIME NULL COMMENT '使用中的结束时间',
  occupy_extend_hours INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '使用中累计延长的小时数',
  sort_order INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '排序，从0开始',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_ktv_room_shop_room_no (shop_id, room_no),
  KEY idx_ktv_room_shop_status (shop_id, status),
  KEY idx_ktv_room_shop_sort (shop_id, sort_order),
  KEY idx_ktv_room_type_id (room_type_id),
  CONSTRAINT fk_ktv_room_shop FOREIGN KEY (shop_id) REFERENCES shop (id),
  CONSTRAINT fk_ktv_room_type FOREIGN KEY (room_type_id) REFERENCES ktv_room_type (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='KTV包厢';

CREATE TABLE ktv_booking_order (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  shop_id BIGINT UNSIGNED NOT NULL COMMENT '门店ID',
  order_no VARCHAR(64) NOT NULL COMMENT '订单号',
  member_id BIGINT UNSIGNED NOT NULL COMMENT '会员ID',
  room_type_id BIGINT UNSIGNED NOT NULL COMMENT '包厢类型ID',
  room_id BIGINT UNSIGNED NULL COMMENT '包厢ID，核销后分配',
  booking_date DATE NOT NULL COMMENT '预订日期',
  start_time TIME NOT NULL COMMENT '开始时间',
  end_time TIME NOT NULL COMMENT '结束时间',
  duration_hours INT UNSIGNED NOT NULL COMMENT '演唱小时数',
  amount DECIMAL(12,2) NOT NULL COMMENT '订单金额',
  order_status VARCHAR(32) NOT NULL COMMENT '订单状态：PENDING_VERIFY、VERIFIED、COMPLETED、CANCELLED、REFUNDED',
  verify_code VARCHAR(32) NOT NULL COMMENT '核销码',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_ktv_booking_order_no (order_no),
  KEY idx_ktv_booking_room_date (shop_id, room_id, booking_date),
  KEY idx_ktv_booking_type_date (shop_id, room_type_id, booking_date),
  KEY idx_ktv_booking_shop_status (shop_id, order_status),
  KEY idx_ktv_booking_member (member_id),
  KEY idx_ktv_booking_verify_code (verify_code),
  CONSTRAINT fk_ktv_booking_shop FOREIGN KEY (shop_id) REFERENCES shop (id),
  CONSTRAINT fk_ktv_booking_member FOREIGN KEY (member_id) REFERENCES member_account (id),
  CONSTRAINT fk_ktv_booking_room FOREIGN KEY (room_id) REFERENCES ktv_room (id),
  CONSTRAINT fk_ktv_booking_room_type FOREIGN KEY (room_type_id) REFERENCES ktv_room_type (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='KTV预订订单';

CREATE TABLE ktv_consume_order (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  shop_id BIGINT UNSIGNED NOT NULL COMMENT '门店ID',
  order_no VARCHAR(64) NOT NULL COMMENT '消费单号',
  booking_order_id BIGINT UNSIGNED NOT NULL COMMENT '预订订单ID',
  member_id BIGINT UNSIGNED NOT NULL COMMENT '会员ID',
  amount DECIMAL(12,2) NOT NULL COMMENT '消费金额',
  order_status VARCHAR(32) NOT NULL COMMENT '状态：COMPLETED',
  remark VARCHAR(255) NOT NULL DEFAULT '' COMMENT '备注',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_ktv_consume_order_no (order_no),
  KEY idx_ktv_consume_shop_status (shop_id, order_status),
  KEY idx_ktv_consume_booking (booking_order_id),
  CONSTRAINT fk_ktv_consume_shop FOREIGN KEY (shop_id) REFERENCES shop (id),
  CONSTRAINT fk_ktv_consume_booking FOREIGN KEY (booking_order_id) REFERENCES ktv_booking_order (id),
  CONSTRAINT fk_ktv_consume_member FOREIGN KEY (member_id) REFERENCES member_account (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='KTV店内消费单';

-- ----------------------------
-- module-hotel
-- ----------------------------
CREATE TABLE hotel_room_type (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  shop_id BIGINT UNSIGNED NOT NULL COMMENT '门店ID',
  type_name VARCHAR(64) NOT NULL COMMENT '房型名称',
  price DECIMAL(12,2) NOT NULL COMMENT '每晚价格',
  status VARCHAR(16) NOT NULL COMMENT '状态：ENABLED、DISABLED',
  sort_order INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '排序，从0开始',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  KEY idx_hotel_room_type_shop_status (shop_id, status),
  KEY idx_hotel_room_type_shop_sort (shop_id, sort_order),
  CONSTRAINT fk_hotel_room_type_shop FOREIGN KEY (shop_id) REFERENCES shop (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='酒店房型';

CREATE TABLE hotel_room_type_image (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  room_type_id BIGINT UNSIGNED NOT NULL COMMENT '房型ID',
  image_url VARCHAR(255) NOT NULL COMMENT '图片访问路径',
  sort_order INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '排序，从0开始',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (id),
  KEY idx_hotel_room_type_image_type_id (room_type_id, sort_order),
  CONSTRAINT fk_hotel_room_type_image_type FOREIGN KEY (room_type_id) REFERENCES hotel_room_type (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='酒店房型图片';

CREATE TABLE hotel_room (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  shop_id BIGINT UNSIGNED NOT NULL COMMENT '门店ID',
  room_type_id BIGINT UNSIGNED NOT NULL COMMENT '房型ID',
  room_no VARCHAR(32) NOT NULL COMMENT '房间号',
  floor_no VARCHAR(16) NOT NULL COMMENT '楼层',
  room_status VARCHAR(16) NOT NULL COMMENT '房态：IDLE、OCCUPIED、MAINTENANCE',
  sort_order INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '排序，从0开始',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_hotel_room_shop_room_no (shop_id, room_no),
  KEY idx_hotel_room_shop_status (shop_id, room_status),
  KEY idx_hotel_room_shop_sort (shop_id, sort_order),
  KEY idx_hotel_room_type_id (room_type_id),
  CONSTRAINT fk_hotel_room_shop FOREIGN KEY (shop_id) REFERENCES shop (id),
  CONSTRAINT fk_hotel_room_type FOREIGN KEY (room_type_id) REFERENCES hotel_room_type (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='酒店房间';

CREATE TABLE hotel_booking_order (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  shop_id BIGINT UNSIGNED NOT NULL COMMENT '门店ID',
  order_no VARCHAR(64) NOT NULL COMMENT '订单号',
  member_id BIGINT UNSIGNED NOT NULL COMMENT '会员ID',
  room_type_id BIGINT UNSIGNED NOT NULL COMMENT '房型ID',
  room_id BIGINT UNSIGNED NULL COMMENT '入住房间ID，预订时为空',
  check_in_date DATE NOT NULL COMMENT '计划入住日期',
  check_out_date DATE NOT NULL COMMENT '计划离店日期',
  amount DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT '结算房费，退房前为0',
  order_status VARCHAR(32) NOT NULL COMMENT '订单状态：BOOKED、CHECKED_IN、CHECKED_OUT、CANCELLED',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_hotel_booking_order_no (order_no),
  KEY idx_hotel_booking_shop_status (shop_id, order_status),
  KEY idx_hotel_booking_member (member_id),
  KEY idx_hotel_booking_room (room_id),
  CONSTRAINT fk_hotel_booking_shop FOREIGN KEY (shop_id) REFERENCES shop (id),
  CONSTRAINT fk_hotel_booking_member FOREIGN KEY (member_id) REFERENCES member_account (id),
  CONSTRAINT fk_hotel_booking_room_type FOREIGN KEY (room_type_id) REFERENCES hotel_room_type (id),
  CONSTRAINT fk_hotel_booking_room FOREIGN KEY (room_id) REFERENCES hotel_room (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='酒店预订订单';

CREATE TABLE hotel_stay_record (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  shop_id BIGINT UNSIGNED NOT NULL COMMENT '门店ID',
  booking_order_id BIGINT UNSIGNED NOT NULL COMMENT '预订订单ID',
  room_id BIGINT UNSIGNED NOT NULL COMMENT '房间ID',
  member_id BIGINT UNSIGNED NOT NULL COMMENT '会员ID',
  stay_status VARCHAR(32) NOT NULL COMMENT '入住状态：IN_HOUSE、EXTENDED、CHECKED_OUT',
  actual_check_in DATETIME NULL COMMENT '实际入住时间',
  actual_check_out DATETIME NULL COMMENT '实际退房时间',
  planned_check_out_date DATE NOT NULL COMMENT '计划离店日期',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  KEY idx_hotel_stay_shop_status (shop_id, stay_status),
  KEY idx_hotel_stay_booking (booking_order_id),
  CONSTRAINT fk_hotel_stay_shop FOREIGN KEY (shop_id) REFERENCES shop (id),
  CONSTRAINT fk_hotel_stay_booking FOREIGN KEY (booking_order_id) REFERENCES hotel_booking_order (id),
  CONSTRAINT fk_hotel_stay_room FOREIGN KEY (room_id) REFERENCES hotel_room (id),
  CONSTRAINT fk_hotel_stay_member FOREIGN KEY (member_id) REFERENCES member_account (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='酒店入住记录';
