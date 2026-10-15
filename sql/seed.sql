-- 初始化数据。后台账号密码均为 Admin@123
USE gv_a380;

INSERT INTO shop (id, shop_code, shop_name, shop_type, address, contact_phone, status) VALUES
(1, 'KTV01', 'KTV01店', 'KTV', '集团园区A座', '010-60000001', 'ENABLED'),
(2, 'KTV02', 'KTV02店', 'KTV', '集团园区B座', '010-60000002', 'ENABLED'),
(3, 'HOTEL01', 'HOTEL01店', 'HOTEL', '集团园区C座', '010-60000003', 'ENABLED');

INSERT INTO sys_user (id, username, password_hash, real_name, mobile, status) VALUES
(1, 'superadmin', '$2b$10$wEDiBpnTEGyi6MeMC2oSE.ro1xJRqiVRMQvjBSFUpjJq62yrt3FYW', '集团超级管理员', '13900000001', 'ENABLED'),
(2, 'finance01', '$2b$10$wEDiBpnTEGyi6MeMC2oSE.ro1xJRqiVRMQvjBSFUpjJq62yrt3FYW', '集团财务', '13900000002', 'ENABLED'),
(3, 'ktvadmin01', '$2b$10$wEDiBpnTEGyi6MeMC2oSE.ro1xJRqiVRMQvjBSFUpjJq62yrt3FYW', 'KTV门店管理员', '13900000003', 'ENABLED'),
(4, 'ktvfront01', '$2b$10$wEDiBpnTEGyi6MeMC2oSE.ro1xJRqiVRMQvjBSFUpjJq62yrt3FYW', 'KTV前台', '13900000004', 'ENABLED'),
(5, 'hoteladmin01', '$2b$10$wEDiBpnTEGyi6MeMC2oSE.ro1xJRqiVRMQvjBSFUpjJq62yrt3FYW', '酒店门店管理员', '13900000005', 'ENABLED'),
(6, 'hotelfront01', '$2b$10$wEDiBpnTEGyi6MeMC2oSE.ro1xJRqiVRMQvjBSFUpjJq62yrt3FYW', '酒店前台', '13900000006', 'ENABLED');

INSERT INTO sys_role (id, role_code, role_name, role_scope) VALUES
(1, 'GROUP_SUPER_ADMIN', '集团超级管理员', 'GROUP'),
(2, 'GROUP_FINANCE', '集团财务', 'GROUP'),
(3, 'KTV_SHOP_ADMIN', 'KTV门店管理员', 'KTV'),
(4, 'KTV_FRONT_DESK', 'KTV前台操作员', 'KTV'),
(5, 'HOTEL_SHOP_ADMIN', 'Hotel门店管理员', 'HOTEL'),
(6, 'HOTEL_FRONT_DESK', 'Hotel前台操作员', 'HOTEL');

INSERT INTO sys_user_role (id, user_id, role_id) VALUES
(1, 1, 1),
(2, 2, 2),
(3, 3, 3),
(4, 4, 4),
(5, 5, 5),
(6, 6, 6);

INSERT INTO sys_permission (id, permission_code, permission_name, module_code) VALUES
(1, 'member:query', '会员查询', 'CORE'),
(2, 'member:recharge', '会员充值', 'CORE'),
(3, 'finance:bill:query', '财务流水查询', 'CORE'),
(4, 'ktv:shop:query', 'KTV门店查询', 'KTV'),
(5, 'ktv:shop:save', 'KTV门店保存', 'KTV'),
(6, 'ktv:room:query', 'KTV包厢查询', 'KTV'),
(7, 'ktv:room:save', 'KTV包厢保存', 'KTV'),
(8, 'ktv:order:query', 'KTV订单查询', 'KTV'),
(9, 'ktv:order:verify', 'KTV订单核销', 'KTV'),
(10, 'ktv:order:consume', 'KTV店内消费', 'KTV'),
(11, 'ktv:order:cancel', 'KTV订单取消', 'KTV'),
(12, 'hotel:room-type:query', '酒店房型查询', 'HOTEL'),
(13, 'hotel:room-type:save', '酒店房型保存', 'HOTEL'),
(14, 'hotel:room:query', '酒店房间查询', 'HOTEL'),
(15, 'hotel:room:save', '酒店房间保存', 'HOTEL'),
(16, 'hotel:order:query', '酒店订单查询', 'HOTEL'),
(17, 'hotel:stay:check-in', '酒店入住', 'HOTEL'),
(18, 'hotel:stay:extend', '酒店续住', 'HOTEL'),
(19, 'hotel:stay:check-out', '酒店退房', 'HOTEL'),
(20, 'hotel:order:cancel', '酒店订单取消', 'HOTEL');

INSERT INTO sys_role_permission (id, role_id, permission_id) VALUES
(1, 1, 1),(2, 1, 2),(3, 1, 3),(4, 1, 4),(5, 1, 5),
(6, 1, 6),(7, 1, 7),(8, 1, 8),(9, 1, 9),(10, 1, 10),
(11, 1, 11),(12, 1, 12),(13, 1, 13),(14, 1, 14),(15, 1, 15),
(16, 1, 16),(17, 1, 17),(18, 1, 18),(19, 1, 19),(20, 1, 20),
(21, 2, 1),(22, 2, 2),(23, 2, 3),
(24, 3, 4),(25, 3, 5),(26, 3, 6),(27, 3, 7),(28, 3, 8),(29, 3, 9),(30, 3, 10),(31, 3, 11),
(32, 4, 6),(33, 4, 8),(34, 4, 9),(35, 4, 10),(36, 4, 11),
(37, 5, 12),(38, 5, 13),(39, 5, 14),(40, 5, 15),(41, 5, 16),(42, 5, 17),(43, 5, 18),(44, 5, 19),(45, 5, 20),
(46, 6, 14),(47, 6, 16),(48, 6, 17),(49, 6, 18),(50, 6, 19),(51, 6, 20);

INSERT INTO sys_menu (id, parent_id, menu_name, menu_path, component_path, permission_code, module_code, sort_order) VALUES
(1, 0, 'A380中心', '/member', '', '', 'CORE', 10),
(2, 0, '财务管理', '/finance', '', '', 'CORE', 20),
(3, 0, 'KTV业务', '/ktv', '', '', 'KTV', 30),
(4, 0, '酒店业务', '/hotel', '', '', 'HOTEL', 40),
(11, 1, 'A380查询', '/member/query', 'member/query', 'member:query', 'CORE', 11),
(12, 1, 'A380充值', '/member/recharge', 'member/recharge', 'member:recharge', 'CORE', 12),
(21, 2, '财务流水', '/finance/bill', 'finance/bill', 'finance:bill:query', 'CORE', 21),
(31, 3, '门店管理', '/ktv/shop', 'ktv/shop', 'ktv:shop:query', 'KTV', 31),
(32, 3, '包厢管理', '/ktv/room', 'ktv/room', 'ktv:room:query', 'KTV', 32),
(33, 3, '订单核销', '/ktv/verify', 'ktv/verify', 'ktv:order:query', 'KTV', 33),
(41, 4, '房型管理', '/hotel/room-type', 'hotel/room-type', 'hotel:room-type:query', 'HOTEL', 41),
(42, 4, '房间管理', '/hotel/room', 'hotel/room', 'hotel:room:query', 'HOTEL', 42),
(43, 4, '入住退房', '/hotel/stay', 'hotel/stay', 'hotel:order:query', 'HOTEL', 43);

INSERT INTO sys_role_menu (id, role_id, menu_id) VALUES
(1, 1, 1),(2, 1, 2),(3, 1, 3),(4, 1, 4),
(5, 1, 11),(6, 1, 12),(7, 1, 21),(8, 1, 31),(9, 1, 32),(10, 1, 33),
(11, 1, 41),(12, 1, 42),(13, 1, 43),
(14, 2, 1),(15, 2, 2),(16, 2, 11),(17, 2, 12),(18, 2, 21),
(19, 3, 3),(20, 3, 31),(21, 3, 32),(22, 3, 33),
(23, 4, 3),(24, 4, 33),
(25, 5, 4),(26, 5, 41),(27, 5, 42),(28, 5, 43),
(29, 6, 4),(30, 6, 43);

INSERT INTO sys_user_shop (id, user_id, shop_id) VALUES
(1, 1, 1),(2, 1, 2),(3, 1, 3),
(4, 2, 1),(5, 2, 2),(6, 2, 3),
(7, 3, 1),(8, 3, 2),
(9, 4, 1),
(10, 5, 3),
(11, 6, 3);

INSERT INTO member_account (id, member_no, member_name, mobile, balance, points, status, shop_id) VALUES
(1, 'M3800001', '测试会员', '13800000000', 1000.00, 0, 'ENABLED', 1);

INSERT INTO ktv_room (id, shop_id, room_no, room_name, room_type, capacity, price, status) VALUES
(1, 1, 'A01', 'KTV01小包', 'SMALL', 4, 200.00, 'ENABLED'),
(2, 1, 'A02', 'KTV01中包', 'MEDIUM', 8, 400.00, 'ENABLED'),
(3, 2, 'B01', 'KTV02中包', 'MEDIUM', 8, 300.00, 'ENABLED');

INSERT INTO hotel_room_type (id, shop_id, type_name, bed_type, price, status) VALUES
(1, 3, '大床房', 'LARGE', 300.00, 'ENABLED'),
(2, 3, '双床房', 'TWIN', 320.00, 'ENABLED');

INSERT INTO hotel_room (id, shop_id, room_type_id, room_no, floor_no, room_status) VALUES
(1, 3, 1, '801', '8', 'IDLE'),
(2, 3, 1, '802', '8', 'IDLE'),
(3, 3, 2, '803', '8', 'IDLE');
