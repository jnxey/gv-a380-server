-- 已有库补上商品排序字段。
USE gv_a380;

SET @sort_column_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'store_product'
    AND COLUMN_NAME = 'sort_order'
);
SET @add_sort_sql := IF(
  @sort_column_exists = 0,
  'ALTER TABLE store_product ADD COLUMN sort_order INT UNSIGNED NOT NULL DEFAULT 0 COMMENT ''排序，从0开始'' AFTER stock_quantity',
  'SELECT 1'
);
PREPARE add_sort_stmt FROM @add_sort_sql;
EXECUTE add_sort_stmt;
DEALLOCATE PREPARE add_sort_stmt;

-- 按门店、原 id 顺序回填排序。
UPDATE store_product
INNER JOIN (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY shop_id ORDER BY id) - 1 AS new_sort_order
  FROM store_product
) ranked ON ranked.id = store_product.id
SET store_product.sort_order = ranked.new_sort_order;

SET @shop_index_exists := (
  SELECT COUNT(1)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'store_product'
    AND INDEX_NAME = 'idx_store_product_shop'
    AND COLUMN_NAME = 'sort_order'
);
SET @fix_shop_index_sql := IF(
  @shop_index_exists = 0,
  'ALTER TABLE store_product DROP INDEX idx_store_product_shop, ADD KEY idx_store_product_shop (shop_id, status, sort_order)',
  'SELECT 1'
);
PREPARE fix_shop_index_stmt FROM @fix_shop_index_sql;
EXECUTE fix_shop_index_stmt;
DEALLOCATE PREPARE fix_shop_index_stmt;
