-- 已有库补上商铺业务：表、角色、菜单、权限和示例门店。
USE gv_a380;

CREATE TABLE IF NOT EXISTS store_product (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  shop_id BIGINT UNSIGNED NOT NULL COMMENT '门店ID',
  product_name VARCHAR(64) NOT NULL COMMENT '商品名称',
  barcode VARCHAR(32) NOT NULL DEFAULT '' COMMENT '条码',
  sale_price DECIMAL(12,2) NOT NULL COMMENT '售价',
  cost_price DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT '进价',
  stock_quantity INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '库存数量',
  status VARCHAR(16) NOT NULL COMMENT '状态：ENABLED、DISABLED',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (id),
  KEY idx_store_product_shop (shop_id, status),
  KEY idx_store_product_barcode (shop_id, barcode),
  CONSTRAINT fk_store_product_shop FOREIGN KEY (shop_id) REFERENCES shop (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='商铺商品';

CREATE TABLE IF NOT EXISTS store_purchase (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  shop_id BIGINT UNSIGNED NOT NULL COMMENT '门店ID',
  purchase_no VARCHAR(32) NOT NULL COMMENT '进货单号',
  amount DECIMAL(12,2) NOT NULL COMMENT '进货金额',
  operator_id BIGINT UNSIGNED NULL COMMENT '操作人后台账号ID',
  remark VARCHAR(128) NOT NULL DEFAULT '' COMMENT '备注',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_store_purchase_no (purchase_no),
  KEY idx_store_purchase_shop (shop_id),
  CONSTRAINT fk_store_purchase_shop FOREIGN KEY (shop_id) REFERENCES shop (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='商铺进货单';

CREATE TABLE IF NOT EXISTS store_purchase_item (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  purchase_id BIGINT UNSIGNED NOT NULL COMMENT '进货单ID',
  product_id BIGINT UNSIGNED NOT NULL COMMENT '商品ID',
  product_name VARCHAR(64) NOT NULL COMMENT '商品名称快照',
  cost_price DECIMAL(12,2) NOT NULL COMMENT '进价快照',
  quantity INT UNSIGNED NOT NULL COMMENT '数量',
  line_amount DECIMAL(12,2) NOT NULL COMMENT '行金额',
  PRIMARY KEY (id),
  KEY idx_store_purchase_item_purchase (purchase_id),
  CONSTRAINT fk_store_purchase_item_purchase FOREIGN KEY (purchase_id) REFERENCES store_purchase (id),
  CONSTRAINT fk_store_purchase_item_product FOREIGN KEY (product_id) REFERENCES store_product (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='商铺进货明细';

CREATE TABLE IF NOT EXISTS store_sale (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  shop_id BIGINT UNSIGNED NOT NULL COMMENT '门店ID',
  sale_no VARCHAR(32) NOT NULL COMMENT '销售单号',
  member_id BIGINT UNSIGNED NULL COMMENT '会员ID，现金可空',
  pay_method VARCHAR(16) NOT NULL COMMENT '收款方式：MEMBER、CASH',
  amount DECIMAL(12,2) NOT NULL COMMENT '销售金额',
  operator_id BIGINT UNSIGNED NULL COMMENT '操作人后台账号ID',
  remark VARCHAR(128) NOT NULL DEFAULT '' COMMENT '备注',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_store_sale_no (sale_no),
  KEY idx_store_sale_shop (shop_id),
  KEY idx_store_sale_member (member_id),
  CONSTRAINT fk_store_sale_shop FOREIGN KEY (shop_id) REFERENCES shop (id),
  CONSTRAINT fk_store_sale_member FOREIGN KEY (member_id) REFERENCES member_account (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='商铺销售单';

CREATE TABLE IF NOT EXISTS store_sale_item (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  sale_id BIGINT UNSIGNED NOT NULL COMMENT '销售单ID',
  product_id BIGINT UNSIGNED NOT NULL COMMENT '商品ID',
  product_name VARCHAR(64) NOT NULL COMMENT '商品名称快照',
  sale_price DECIMAL(12,2) NOT NULL COMMENT '售价快照',
  quantity INT UNSIGNED NOT NULL COMMENT '数量',
  line_amount DECIMAL(12,2) NOT NULL COMMENT '行金额',
  PRIMARY KEY (id),
  KEY idx_store_sale_item_sale (sale_id),
  CONSTRAINT fk_store_sale_item_sale FOREIGN KEY (sale_id) REFERENCES store_sale (id),
  CONSTRAINT fk_store_sale_item_product FOREIGN KEY (product_id) REFERENCES store_product (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='商铺销售明细';

INSERT INTO shop (shop_code, shop_name, shop_type, address, contact_phone, status)
SELECT 'STORE01', 'STORE01店', 'STORE', '集团园区D座', '010-60000004', 'ENABLED'
WHERE NOT EXISTS (SELECT 1 FROM shop WHERE shop_code = 'STORE01');

INSERT INTO sys_role (role_code, role_name, role_scope)
SELECT 'STORE_SHOP_ADMIN', '商铺门店管理员', 'STORE'
WHERE NOT EXISTS (SELECT 1 FROM sys_role WHERE role_code = 'STORE_SHOP_ADMIN');

INSERT INTO sys_role (role_code, role_name, role_scope)
SELECT 'STORE_CASHIER', '商铺收银员', 'STORE'
WHERE NOT EXISTS (SELECT 1 FROM sys_role WHERE role_code = 'STORE_CASHIER');

INSERT INTO sys_menu (id, parent_id, menu_name, menu_path, component_path, permission_code, module_code, sort_order)
SELECT 6, 0, '商铺业务', '/store', '', '', 'STORE', 45
WHERE NOT EXISTS (SELECT 1 FROM sys_menu WHERE id = 6 OR menu_path = '/store');

INSERT INTO sys_menu (id, parent_id, menu_name, menu_path, component_path, permission_code, module_code, sort_order)
SELECT 61, 6, '门店管理', '/store/shop', 'store/shop', 'store:shop:query', 'STORE', 61
WHERE NOT EXISTS (SELECT 1 FROM sys_menu WHERE id = 61 OR menu_path = '/store/shop');

INSERT INTO sys_menu (id, parent_id, menu_name, menu_path, component_path, permission_code, module_code, sort_order)
SELECT 62, 6, '商品管理', '/store/product', 'store/product', 'store:product:query', 'STORE', 62
WHERE NOT EXISTS (SELECT 1 FROM sys_menu WHERE id = 62 OR menu_path = '/store/product');

INSERT INTO sys_menu (id, parent_id, menu_name, menu_path, component_path, permission_code, module_code, sort_order)
SELECT 63, 6, '进货入库', '/store/purchase', 'store/purchase', 'store:purchase:query', 'STORE', 63
WHERE NOT EXISTS (SELECT 1 FROM sys_menu WHERE id = 63 OR menu_path = '/store/purchase');

INSERT INTO sys_menu (id, parent_id, menu_name, menu_path, component_path, permission_code, module_code, sort_order)
SELECT 64, 6, '收银台', '/store/cashier', 'store/cashier', 'store:sale:query', 'STORE', 64
WHERE NOT EXISTS (SELECT 1 FROM sys_menu WHERE id = 64 OR menu_path = '/store/cashier');

INSERT INTO sys_menu (id, parent_id, menu_name, menu_path, component_path, permission_code, module_code, sort_order)
SELECT 65, 6, '销售单', '/store/sale', 'store/sale', 'store:sale:query', 'STORE', 65
WHERE NOT EXISTS (SELECT 1 FROM sys_menu WHERE id = 65 OR menu_path = '/store/sale');

INSERT INTO sys_menu (id, parent_id, menu_name, menu_path, component_path, permission_code, module_code, sort_order)
SELECT 66, 6, '财务流水', '/store/bill', 'store/bill', 'store:bill:query', 'STORE', 66
WHERE NOT EXISTS (SELECT 1 FROM sys_menu WHERE id = 66 OR menu_path = '/store/bill');

INSERT INTO sys_permission (permission_code, permission_name, module_code, menu_id)
SELECT 'store:shop:query', '商铺门店查询', 'STORE', 61
WHERE NOT EXISTS (SELECT 1 FROM sys_permission WHERE permission_code = 'store:shop:query');

INSERT INTO sys_permission (permission_code, permission_name, module_code, menu_id)
SELECT 'store:shop:save', '商铺门店保存', 'STORE', 61
WHERE NOT EXISTS (SELECT 1 FROM sys_permission WHERE permission_code = 'store:shop:save');

INSERT INTO sys_permission (permission_code, permission_name, module_code, menu_id)
SELECT 'store:product:query', '商铺商品查询', 'STORE', 62
WHERE NOT EXISTS (SELECT 1 FROM sys_permission WHERE permission_code = 'store:product:query');

INSERT INTO sys_permission (permission_code, permission_name, module_code, menu_id)
SELECT 'store:product:save', '商铺商品保存', 'STORE', 62
WHERE NOT EXISTS (SELECT 1 FROM sys_permission WHERE permission_code = 'store:product:save');

INSERT INTO sys_permission (permission_code, permission_name, module_code, menu_id)
SELECT 'store:purchase:query', '商铺进货查询', 'STORE', 63
WHERE NOT EXISTS (SELECT 1 FROM sys_permission WHERE permission_code = 'store:purchase:query');

INSERT INTO sys_permission (permission_code, permission_name, module_code, menu_id)
SELECT 'store:purchase:save', '商铺进货保存', 'STORE', 63
WHERE NOT EXISTS (SELECT 1 FROM sys_permission WHERE permission_code = 'store:purchase:save');

INSERT INTO sys_permission (permission_code, permission_name, module_code, menu_id)
SELECT 'store:sale:query', '商铺销售查询', 'STORE', 65
WHERE NOT EXISTS (SELECT 1 FROM sys_permission WHERE permission_code = 'store:sale:query');

INSERT INTO sys_permission (permission_code, permission_name, module_code, menu_id)
SELECT 'store:sale:cash', '商铺现金收款', 'STORE', 64
WHERE NOT EXISTS (SELECT 1 FROM sys_permission WHERE permission_code = 'store:sale:cash');

INSERT INTO sys_permission (permission_code, permission_name, module_code, menu_id)
SELECT 'store:sale:member', '商铺会员收款', 'STORE', 64
WHERE NOT EXISTS (SELECT 1 FROM sys_permission WHERE permission_code = 'store:sale:member');

INSERT INTO sys_permission (permission_code, permission_name, module_code, menu_id)
SELECT 'store:bill:query', '商铺财务流水查询', 'STORE', 66
WHERE NOT EXISTS (SELECT 1 FROM sys_permission WHERE permission_code = 'store:bill:query');

INSERT INTO sys_role_permission (role_id, permission_id)
SELECT sys_role.id, sys_permission.id
FROM sys_role
JOIN sys_permission ON sys_permission.permission_code LIKE 'store:%'
WHERE sys_role.role_code = 'GROUP_SUPER_ADMIN'
  AND NOT EXISTS (
    SELECT 1 FROM sys_role_permission
    WHERE sys_role_permission.role_id = sys_role.id
      AND sys_role_permission.permission_id = sys_permission.id
  );

INSERT INTO sys_role_permission (role_id, permission_id)
SELECT sys_role.id, sys_permission.id
FROM sys_role
JOIN sys_permission ON sys_permission.permission_code LIKE 'store:%'
WHERE sys_role.role_code = 'STORE_SHOP_ADMIN'
  AND NOT EXISTS (
    SELECT 1 FROM sys_role_permission
    WHERE sys_role_permission.role_id = sys_role.id
      AND sys_role_permission.permission_id = sys_permission.id
  );

INSERT INTO sys_role_permission (role_id, permission_id)
SELECT sys_role.id, sys_permission.id
FROM sys_role
JOIN sys_permission ON sys_permission.permission_code IN ('store:product:query', 'store:sale:query', 'store:sale:cash', 'store:sale:member')
WHERE sys_role.role_code = 'STORE_CASHIER'
  AND NOT EXISTS (
    SELECT 1 FROM sys_role_permission
    WHERE sys_role_permission.role_id = sys_role.id
      AND sys_role_permission.permission_id = sys_permission.id
  );

INSERT INTO sys_role_menu (role_id, menu_id)
SELECT sys_role.id, sys_menu.id
FROM sys_role
JOIN sys_menu ON sys_menu.module_code = 'STORE' OR sys_menu.id = 6
WHERE sys_role.role_code = 'GROUP_SUPER_ADMIN'
  AND NOT EXISTS (
    SELECT 1 FROM sys_role_menu
    WHERE sys_role_menu.role_id = sys_role.id
      AND sys_role_menu.menu_id = sys_menu.id
  );

INSERT INTO sys_role_menu (role_id, menu_id)
SELECT sys_role.id, sys_menu.id
FROM sys_role
JOIN sys_menu ON sys_menu.module_code = 'STORE' OR sys_menu.id = 6
WHERE sys_role.role_code = 'STORE_SHOP_ADMIN'
  AND NOT EXISTS (
    SELECT 1 FROM sys_role_menu
    WHERE sys_role_menu.role_id = sys_role.id
      AND sys_role_menu.menu_id = sys_menu.id
  );

INSERT INTO sys_role_menu (role_id, menu_id)
SELECT sys_role.id, sys_menu.id
FROM sys_role
JOIN sys_menu ON sys_menu.menu_path IN ('/store', '/store/product', '/store/cashier', '/store/sale')
WHERE sys_role.role_code = 'STORE_CASHIER'
  AND NOT EXISTS (
    SELECT 1 FROM sys_role_menu
    WHERE sys_role_menu.role_id = sys_role.id
      AND sys_role_menu.menu_id = sys_menu.id
  );

INSERT INTO sys_user_shop (user_id, shop_id)
SELECT sys_user.id, shop.id
FROM sys_user
JOIN shop ON shop.shop_code = 'STORE01'
WHERE sys_user.username = 'superadmin'
  AND NOT EXISTS (
    SELECT 1 FROM sys_user_shop
    WHERE sys_user_shop.user_id = sys_user.id
      AND sys_user_shop.shop_id = shop.id
  );

INSERT INTO store_product (shop_id, product_name, barcode, sale_price, cost_price, stock_quantity, status)
SELECT shop.id, '矿泉水', '690000000001', 2.00, 1.00, 100, 'ENABLED'
FROM shop
WHERE shop.shop_code = 'STORE01'
  AND NOT EXISTS (
    SELECT 1 FROM store_product
    WHERE store_product.shop_id = shop.id
      AND store_product.barcode = '690000000001'
  );

INSERT INTO store_product (shop_id, product_name, barcode, sale_price, cost_price, stock_quantity, status)
SELECT shop.id, '方便面', '690000000002', 5.00, 3.00, 50, 'ENABLED'
FROM shop
WHERE shop.shop_code = 'STORE01'
  AND NOT EXISTS (
    SELECT 1 FROM store_product
    WHERE store_product.shop_id = shop.id
      AND store_product.barcode = '690000000002'
  );
