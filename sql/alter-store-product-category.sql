-- 已有库补上商品分类、商品分类外键、同门店条码唯一。
USE gv_a380;

CREATE TABLE IF NOT EXISTS store_product_category (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  shop_id BIGINT UNSIGNED NOT NULL COMMENT '门店ID',
  category_name VARCHAR(64) NOT NULL COMMENT '分类名称',
  sort_order INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '排序，从0开始',
  status VARCHAR(16) NOT NULL COMMENT '状态：ENABLED、DISABLED',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (id),
  KEY idx_store_product_category_shop (shop_id, status, sort_order),
  CONSTRAINT fk_store_product_category_shop FOREIGN KEY (shop_id) REFERENCES shop (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='商铺商品分类';

-- 每个有商品的门店补一个默认分类。
INSERT INTO store_product_category (shop_id, category_name, sort_order, status)
SELECT DISTINCT store_product.shop_id, '未分类', 0, 'ENABLED'
FROM store_product
WHERE NOT EXISTS (
  SELECT 1 FROM store_product_category
  WHERE store_product_category.shop_id = store_product.shop_id
);

-- 商品加分类列（可空），再回填默认分类。
SET @category_column_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'store_product'
    AND COLUMN_NAME = 'category_id'
);
SET @add_category_sql := IF(
  @category_column_exists = 0,
  'ALTER TABLE store_product ADD COLUMN category_id BIGINT UNSIGNED NULL COMMENT ''分类ID'' AFTER shop_id',
  'SELECT 1'
);
PREPARE add_category_stmt FROM @add_category_sql;
EXECUTE add_category_stmt;
DEALLOCATE PREPARE add_category_stmt;

UPDATE store_product
INNER JOIN store_product_category
  ON store_product_category.shop_id = store_product.shop_id
  AND store_product_category.category_name = '未分类'
SET store_product.category_id = store_product_category.id
WHERE store_product.category_id IS NULL;

-- 空条码先改成唯一占位，再加唯一索引。
UPDATE store_product
SET barcode = CONCAT('NOBARCODE-', id)
WHERE barcode = '' OR barcode IS NULL;

SET @barcode_unique_exists := (
  SELECT COUNT(1)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'store_product'
    AND INDEX_NAME = 'uk_store_product_shop_barcode'
);
SET @add_barcode_unique_sql := IF(
  @barcode_unique_exists = 0,
  'ALTER TABLE store_product ADD UNIQUE KEY uk_store_product_shop_barcode (shop_id, barcode)',
  'SELECT 1'
);
PREPARE add_barcode_unique_stmt FROM @add_barcode_unique_sql;
EXECUTE add_barcode_unique_stmt;
DEALLOCATE PREPARE add_barcode_unique_stmt;

SET @category_fk_exists := (
  SELECT COUNT(1)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'store_product'
    AND CONSTRAINT_NAME = 'fk_store_product_category'
);
SET @fix_category_sql := IF(
  @category_fk_exists = 0,
  'ALTER TABLE store_product MODIFY COLUMN category_id BIGINT UNSIGNED NOT NULL COMMENT ''分类ID'', ADD CONSTRAINT fk_store_product_category FOREIGN KEY (category_id) REFERENCES store_product_category (id)',
  'SELECT 1'
);
PREPARE fix_category_stmt FROM @fix_category_sql;
EXECUTE fix_category_stmt;
DEALLOCATE PREPARE fix_category_stmt;

INSERT INTO sys_menu (id, parent_id, menu_name, menu_path, component_path, permission_code, module_code, sort_order)
SELECT 67, 6, '商品分类', '/store/category', 'store/category', 'store:category:query', 'STORE', 615
WHERE NOT EXISTS (SELECT 1 FROM sys_menu WHERE id = 67 OR menu_path = '/store/category');

INSERT INTO sys_permission (permission_code, permission_name, module_code, menu_id)
SELECT 'store:category:query', '商铺商品分类查询', 'STORE', 67
WHERE NOT EXISTS (SELECT 1 FROM sys_permission WHERE permission_code = 'store:category:query');

INSERT INTO sys_permission (permission_code, permission_name, module_code, menu_id)
SELECT 'store:category:save', '商铺商品分类保存', 'STORE', 67
WHERE NOT EXISTS (SELECT 1 FROM sys_permission WHERE permission_code = 'store:category:save');

INSERT INTO sys_role_permission (role_id, permission_id)
SELECT sys_role.id, sys_permission.id
FROM sys_role
JOIN sys_permission ON sys_permission.permission_code IN ('store:category:query', 'store:category:save')
WHERE sys_role.role_code IN ('GROUP_SUPER_ADMIN', 'STORE_SHOP_ADMIN')
  AND NOT EXISTS (
    SELECT 1 FROM sys_role_permission
    WHERE sys_role_permission.role_id = sys_role.id
      AND sys_role_permission.permission_id = sys_permission.id
  );

INSERT INTO sys_role_permission (role_id, permission_id)
SELECT sys_role.id, sys_permission.id
FROM sys_role
JOIN sys_permission ON sys_permission.permission_code = 'store:category:query'
WHERE sys_role.role_code = 'STORE_CASHIER'
  AND NOT EXISTS (
    SELECT 1 FROM sys_role_permission
    WHERE sys_role_permission.role_id = sys_role.id
      AND sys_role_permission.permission_id = sys_permission.id
  );

INSERT INTO sys_role_menu (role_id, menu_id)
SELECT sys_role.id, 67
FROM sys_role
WHERE sys_role.role_code IN ('GROUP_SUPER_ADMIN', 'STORE_SHOP_ADMIN', 'STORE_CASHIER')
  AND NOT EXISTS (
    SELECT 1 FROM sys_role_menu
    WHERE sys_role_menu.role_id = sys_role.id
      AND sys_role_menu.menu_id = 67
  );
