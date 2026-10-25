-- 初始化数据。后台账号密码均为 Admin@123
USE gv_a380;

INSERT INTO shop (id, shop_code, shop_name, shop_type, address, contact_phone, status) VALUES
(1, 'A380', 'A380中心', 'A380', '集团总部', '', 'ENABLED'),
(2, 'KTV01', 'KTV01店', 'KTV', '集团园区A座', '010-60000001', 'ENABLED'),
(3, 'HOTEL01', 'HOTEL01店', 'HOTEL', '集团园区C座', '010-60000003', 'ENABLED'),
(4, 'STORE01', 'STORE01店', 'STORE', '集团园区D座', '010-60000004', 'ENABLED');

INSERT INTO sys_user (id, username, password_hash, real_name, mobile, status) VALUES
(1, 'superadmin', '$2b$10$wEDiBpnTEGyi6MeMC2oSE.ro1xJRqiVRMQvjBSFUpjJq62yrt3FYW', '集团超级管理员', '13900000001', 'ENABLED'),
(2, 'finance01', '$2b$10$wEDiBpnTEGyi6MeMC2oSE.ro1xJRqiVRMQvjBSFUpjJq62yrt3FYW', '集团财务', '13900000002', 'ENABLED'),
(3, 'ktvadmin01', '$2b$10$wEDiBpnTEGyi6MeMC2oSE.ro1xJRqiVRMQvjBSFUpjJq62yrt3FYW', 'KTV门店管理员', '13900000003', 'ENABLED'),
(4, 'ktvfront01', '$2b$10$wEDiBpnTEGyi6MeMC2oSE.ro1xJRqiVRMQvjBSFUpjJq62yrt3FYW', 'KTV前台', '13900000004', 'ENABLED'),
(5, 'hoteladmin01', '$2b$10$wEDiBpnTEGyi6MeMC2oSE.ro1xJRqiVRMQvjBSFUpjJq62yrt3FYW', '酒店门店管理员', '13900000005', 'ENABLED'),
(6, 'hotelfront01', '$2b$10$wEDiBpnTEGyi6MeMC2oSE.ro1xJRqiVRMQvjBSFUpjJq62yrt3FYW', '酒店前台', '13900000006', 'ENABLED'),
(7, 'storeadmin01', '$2b$10$wEDiBpnTEGyi6MeMC2oSE.ro1xJRqiVRMQvjBSFUpjJq62yrt3FYW', '商铺门店管理员', '13900000007', 'ENABLED'),
(8, 'storecashier01', '$2b$10$wEDiBpnTEGyi6MeMC2oSE.ro1xJRqiVRMQvjBSFUpjJq62yrt3FYW', '商铺收银员', '13900000008', 'ENABLED');

INSERT INTO sys_role (id, role_code, role_name, role_scope) VALUES
(1, 'GROUP_SUPER_ADMIN', '集团超级管理员', 'GROUP'),
(2, 'GROUP_FINANCE', '集团财务', 'GROUP'),
(3, 'KTV_SHOP_ADMIN', 'KTV门店管理员', 'KTV'),
(4, 'KTV_FRONT_DESK', 'KTV前台操作员', 'KTV'),
(5, 'HOTEL_SHOP_ADMIN', 'Hotel门店管理员', 'HOTEL'),
(6, 'HOTEL_FRONT_DESK', 'Hotel前台操作员', 'HOTEL'),
(7, 'STORE_SHOP_ADMIN', '商铺门店管理员', 'STORE'),
(8, 'STORE_CASHIER', '商铺收银员', 'STORE');

INSERT INTO sys_user_role (id, user_id, role_id) VALUES
(1, 1, 1),
(2, 2, 2),
(3, 3, 3),
(4, 4, 4),
(5, 5, 5),
(6, 6, 6),
(7, 7, 7),
(8, 8, 8);

INSERT INTO sys_permission (id, permission_code, permission_name, module_code, menu_id) VALUES
(1, 'member:query', '会员查询', 'CORE', 11),
(2, 'member:recharge', '会员充值', 'CORE', 12),
(3, 'finance:bill:query', '财务流水查询', 'CORE', 21),
(4, 'ktv:shop:query', 'KTV门店查询', 'KTV', 31),
(5, 'ktv:shop:save', 'KTV门店保存', 'KTV', 31),
(6, 'ktv:room:query', 'KTV包厢查询', 'KTV', 32),
(7, 'ktv:room:save', 'KTV包厢保存', 'KTV', 32),
(27, 'ktv:room-type:query', 'KTV包厢类型查询', 'KTV', 34),
(28, 'ktv:room-type:save', 'KTV包厢类型保存', 'KTV', 34),
(8, 'ktv:order:query', 'KTV订单查询', 'KTV', 33),
(9, 'ktv:order:verify', 'KTV订单核销', 'KTV', 33),
(10, 'ktv:order:consume', 'KTV店内消费', 'KTV', 33),
(11, 'ktv:order:cancel', 'KTV订单取消', 'KTV', 33),
(29, 'ktv:deduct', 'KTV付款', 'KTV', 35),
(30, 'ktv:bill:query', 'KTV财务流水查询', 'KTV', 36),
(12, 'hotel:room-type:query', '酒店房型查询', 'HOTEL', 41),
(13, 'hotel:room-type:save', '酒店房型保存', 'HOTEL', 41),
(14, 'hotel:room:query', '酒店房间查询', 'HOTEL', 42),
(15, 'hotel:room:save', '酒店房间保存', 'HOTEL', 42),
(16, 'hotel:order:query', '酒店订单查询', 'HOTEL', 43),
(17, 'hotel:stay:check-in', '酒店入住', 'HOTEL', 43),
(18, 'hotel:stay:extend', '酒店续住', 'HOTEL', 43),
(19, 'hotel:stay:check-out', '酒店退房', 'HOTEL', 43),
(20, 'hotel:order:cancel', '酒店订单取消', 'HOTEL', 43),
(31, 'hotel:bill:query', '酒店财务流水查询', 'HOTEL', 45),
(32, 'hotel:deduct', '酒店付款', 'HOTEL', 44),
(25, 'hotel:shop:query', '酒店门店查询', 'HOTEL', 40),
(26, 'hotel:shop:save', '酒店门店保存', 'HOTEL', 40),
(33, 'store:shop:query', '商铺门店查询', 'STORE', 61),
(34, 'store:shop:save', '商铺门店保存', 'STORE', 61),
(35, 'store:product:query', '商铺商品查询', 'STORE', 62),
(36, 'store:product:save', '商铺商品保存', 'STORE', 62),
(37, 'store:purchase:query', '商铺进货查询', 'STORE', 63),
(38, 'store:purchase:save', '商铺进货保存', 'STORE', 63),
(39, 'store:sale:query', '商铺销售查询', 'STORE', 65),
(40, 'store:sale:cash', '商铺现金收款', 'STORE', 64),
(41, 'store:sale:member', '商铺会员收款', 'STORE', 64),
(42, 'store:bill:query', '商铺财务流水查询', 'STORE', 66),
(43, 'store:category:query', '商铺商品分类查询', 'STORE', 67),
(44, 'store:category:save', '商铺商品分类保存', 'STORE', 67),
(45, 'ktv:review:query', 'KTV评价查询', 'KTV', 37),
(46, 'hotel:review:query', '酒店评价查询', 'HOTEL', 46),
(47, 'store:review:query', '商铺评价查询', 'STORE', 68),
(48, 'finance:point:query', '用户积分查询', 'CORE', 24),
(21, 'system:user:query', '账号查询', 'CORE', 51),
(22, 'system:user:save', '账号保存', 'CORE', 51),
(23, 'system:role:query', '角色查询', 'CORE', 52),
(24, 'system:role:save', '角色保存', 'CORE', 52);

INSERT INTO sys_role_permission (id, role_id, permission_id) VALUES
(1, 1, 1),(2, 1, 2),(3, 1, 3),(4, 1, 4),(5, 1, 5),
(6, 1, 6),(7, 1, 7),(8, 1, 8),(9, 1, 9),(10, 1, 10),
(11, 1, 11),(12, 1, 12),(13, 1, 13),(14, 1, 14),(15, 1, 15),
(60, 1, 27),(61, 1, 28),
(16, 1, 16),(17, 1, 17),(18, 1, 18),(19, 1, 19),(20, 1, 20),
(21, 2, 1),(22, 2, 2),(23, 2, 3),
(24, 3, 4),(25, 3, 5),(26, 3, 6),(27, 3, 7),(28, 3, 8),(29, 3, 9),(30, 3, 10),(31, 3, 11),
(62, 3, 27),(63, 3, 28),
(32, 4, 6),(33, 4, 8),(34, 4, 9),(35, 4, 10),(36, 4, 11),
(70, 1, 29),(71, 3, 29),(72, 4, 29),
(73, 1, 30),(74, 3, 30),(75, 4, 30),
(37, 5, 12),(38, 5, 13),(39, 5, 14),(40, 5, 15),(41, 5, 16),(42, 5, 17),(43, 5, 18),(44, 5, 19),(45, 5, 20),
(46, 6, 14),(47, 6, 16),(48, 6, 17),(49, 6, 18),(50, 6, 19),(51, 6, 20),
(52, 1, 21),(53, 1, 22),(54, 1, 23),(55, 1, 24),
(56, 1, 25),(57, 1, 26),
(58, 5, 25),(59, 5, 26),
(76, 1, 31),(77, 5, 31),(78, 6, 31),
(79, 6, 12),
(80, 1, 32),(81, 5, 32),(82, 6, 32),
(83, 1, 33),(84, 1, 34),(85, 1, 35),(86, 1, 36),(87, 1, 37),(88, 1, 38),(89, 1, 39),(90, 1, 40),(91, 1, 41),(92, 1, 42),
(107, 1, 43),(108, 1, 44),
(93, 7, 33),(94, 7, 34),(95, 7, 35),(96, 7, 36),(97, 7, 37),(98, 7, 38),(99, 7, 39),(100, 7, 40),(101, 7, 41),(102, 7, 42),
(109, 7, 43),(110, 7, 44),
(103, 8, 35),(104, 8, 39),(105, 8, 40),(106, 8, 41),(111, 8, 43),
(112, 1, 45),(113, 3, 45),(114, 4, 45),
(115, 1, 46),(116, 5, 46),(117, 6, 46),
(118, 1, 47),(119, 7, 47),(120, 8, 47),
(121, 1, 48),(122, 2, 48);

INSERT INTO sys_menu (id, parent_id, menu_name, menu_path, component_path, permission_code, module_code, sort_order) VALUES
(1, 0, 'A380中心', '/member', '', '', 'CORE', 10),
(2, 0, '财务管理', '/finance', '', '', 'CORE', 20),
(3, 0, 'KTV业务', '/ktv', '', '', 'KTV', 30),
(4, 0, '酒店业务', '/hotel', '', '', 'HOTEL', 40),
(11, 1, 'A380查询', '/member/query', 'member/query', 'member:query', 'CORE', 11),
(12, 1, 'A380充值', '/member/recharge', 'member/recharge', 'member:recharge', 'CORE', 12),
(21, 2, '财务流水', '/finance/bill', 'finance/bill', 'finance:bill:query', 'CORE', 21),
(22, 2, '用户流水', '/finance/member-bill', 'finance/member-bill', 'finance:bill:query', 'CORE', 22),
(23, 0, '积分管理', '/finance/point', '', '', 'CORE', 25),
(24, 23, '用户积分', '/finance/point/account', 'finance/point-account', 'finance:point:query', 'CORE', 24),
(31, 3, '门店管理', '/ktv/shop', 'ktv/shop', 'ktv:shop:query', 'KTV', 31),
(34, 3, '包厢类型', '/ktv/room-type', 'ktv/room-type', 'ktv:room-type:query', 'KTV', 32),
(32, 3, '包厢管理', '/ktv/room', 'ktv/room', 'ktv:room:query', 'KTV', 33),
(35, 3, 'KTV前台', '/ktv/room-status', 'ktv/room-status', 'ktv:room:query', 'KTV', 34),
(33, 3, '订单管理', '/ktv/verify', 'ktv/verify', 'ktv:order:query', 'KTV', 35),
(36, 3, '财务流水', '/ktv/bill', 'ktv/bill', 'ktv:bill:query', 'KTV', 36),
(37, 3, '评价管理', '/ktv/review', 'ktv/review', 'ktv:review:query', 'KTV', 37),
(40, 4, '门店管理', '/hotel/shop', 'hotel/shop', 'hotel:shop:query', 'HOTEL', 40),
(41, 4, '房型管理', '/hotel/room-type', 'hotel/room-type', 'hotel:room-type:query', 'HOTEL', 41),
(42, 4, '房间管理', '/hotel/room', 'hotel/room', 'hotel:room:query', 'HOTEL', 42),
(44, 4, '酒店前台', '/hotel/room-status', 'hotel/room-status', 'hotel:room:query', 'HOTEL', 43),
(43, 4, '订单管理', '/hotel/order', 'hotel/order', 'hotel:order:query', 'HOTEL', 44),
(45, 4, '财务流水', '/hotel/bill', 'hotel/bill', 'hotel:bill:query', 'HOTEL', 45),
(46, 4, '评价管理', '/hotel/review', 'hotel/review', 'hotel:review:query', 'HOTEL', 46),
(6, 0, '商铺业务', '/store', '', '', 'STORE', 45),
(61, 6, '门店管理', '/store/shop', 'store/shop', 'store:shop:query', 'STORE', 61),
(67, 6, '商品分类', '/store/category', 'store/category', 'store:category:query', 'STORE', 615),
(62, 6, '商品管理', '/store/product', 'store/product', 'store:product:query', 'STORE', 62),
(63, 6, '进货入库', '/store/purchase', 'store/purchase', 'store:purchase:query', 'STORE', 63),
(64, 6, '商铺前台', '/store/cashier', 'store/cashier', 'store:sale:query', 'STORE', 64),
(65, 6, '销售单', '/store/sale', 'store/sale', 'store:sale:query', 'STORE', 65),
(66, 6, '财务流水', '/store/bill', 'store/bill', 'store:bill:query', 'STORE', 66),
(68, 6, '评价管理', '/store/review', 'store/review', 'store:review:query', 'STORE', 68),
(5, 0, '系统管理', '/system', '', '', 'CORE', 50),
(51, 5, '账号管理', '/system/user', 'system/user', 'system:user:query', 'CORE', 51),
(52, 5, '角色权限', '/system/role', 'system/role', 'system:role:query', 'CORE', 52);

INSERT INTO sys_role_menu (id, role_id, menu_id) VALUES
(1, 1, 1),(2, 1, 2),(3, 1, 3),(4, 1, 4),
(5, 1, 11),(6, 1, 12),(7, 1, 21),(43, 1, 22),(8, 1, 31),(9, 1, 32),(38, 1, 35),(10, 1, 33),(36, 1, 34),
(11, 1, 41),(12, 1, 42),(13, 1, 43),
(14, 2, 1),(15, 2, 2),(16, 2, 11),(17, 2, 12),(18, 2, 21),(44, 2, 22),
(19, 3, 3),(20, 3, 31),(21, 3, 32),(39, 3, 35),(22, 3, 33),(37, 3, 34),
(23, 4, 3),(24, 4, 33),(42, 4, 36),
(40, 1, 36),(41, 3, 36),
(72, 1, 37),(73, 3, 37),(74, 4, 37),
(25, 5, 4),(26, 5, 41),(27, 5, 42),(28, 5, 43),
(45, 1, 44),(46, 5, 44),(47, 6, 44),
(48, 1, 45),(49, 5, 45),(50, 6, 45),
(75, 1, 46),(76, 5, 46),(77, 6, 46),
(29, 6, 4),(30, 6, 43),
(31, 1, 5),(32, 1, 51),(33, 1, 52),
(34, 1, 40),
(35, 5, 40),
(51, 1, 6),(52, 1, 61),(69, 1, 67),(53, 1, 62),(54, 1, 63),(55, 1, 64),(56, 1, 65),(57, 1, 66),(78, 1, 68),
(58, 7, 6),(59, 7, 61),(70, 7, 67),(60, 7, 62),(61, 7, 63),(62, 7, 64),(63, 7, 65),(64, 7, 66),(79, 7, 68),
(65, 8, 6),(71, 8, 67),(66, 8, 62),(67, 8, 64),(68, 8, 65),(80, 8, 68),
(121, 1, 23),(122, 1, 24),(123, 2, 23),(124, 2, 24);

INSERT INTO sys_user_shop (id, user_id, shop_id) VALUES
(1, 1, 1),(2, 1, 2),(3, 1, 3),(12, 1, 4),
(4, 2, 1),(5, 2, 2),(6, 2, 3),(13, 2, 4),
(7, 3, 2),
(9, 4, 2),
(10, 5, 3),
(11, 6, 3),
(14, 7, 4),
(15, 8, 4);

INSERT INTO member_account (id, username, balance, status) VALUES
(1, 'M3800001', 1000.00, 'ENABLED');

INSERT INTO ktv_room_type (id, shop_id, type_name, description, hourly_price, status, sort_order) VALUES
(1, 2, '小包', '{"bookingSummary":"","cancelRule":"","bookingNotice":""}', 200.00, 'ENABLED', 2),
(2, 2, '中包', '{"bookingSummary":"","cancelRule":"","bookingNotice":""}', 400.00, 'ENABLED', 1),
(3, 2, '大包', '{"bookingSummary":"","cancelRule":"","bookingNotice":""}', 600.00, 'ENABLED', 0);

INSERT INTO ktv_room (id, shop_id, room_no, room_name, room_type_id, capacity, status, room_status, sort_order) VALUES
(1, 2, 'A01', 'KTV01小包', 1, 4, 'ENABLED', 'IDLE', 1),
(2, 2, 'A02', 'KTV01中包', 2, 8, 'ENABLED', 'IDLE', 0);

INSERT INTO hotel_room_type (id, shop_id, type_name, description, price, status, sort_order) VALUES
(1, 3, '大床房', '{"bedType":"","roomSize":"","floorText":"","guestCount":"","breakfast":"","freeParking":"","bookingNotice":""}', 300.00, 'ENABLED', 1),
(2, 3, '双床房', '{"bedType":"","roomSize":"","floorText":"","guestCount":"","breakfast":"","freeParking":"","bookingNotice":""}', 320.00, 'ENABLED', 0);

INSERT INTO hotel_room (id, shop_id, room_type_id, room_no, floor_no, room_status, sort_order) VALUES
(1, 3, 1, '801', '8', 'IDLE', 0),
(2, 3, 1, '802', '8', 'IDLE', 1),
(3, 3, 2, '803', '8', 'IDLE', 2);

INSERT INTO store_product_category (id, shop_id, category_name, sort_order, status) VALUES
(1, 4, '未分类', 0, 'ENABLED');

INSERT INTO store_product (id, shop_id, category_id, product_name, description, barcode, sale_price, cost_price, stock_quantity, sort_order, status) VALUES
(1, 4, 1, '矿泉水', '{"content":""}', '690000000001', 2.00, 1.00, 100, 0, 'ENABLED'),
(2, 4, 1, '方便面', '{"content":""}', '690000000002', 5.00, 3.00, 50, 1, 'ENABLED');
