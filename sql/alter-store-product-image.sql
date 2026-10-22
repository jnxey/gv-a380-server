-- 已有库补上商铺商品图片表。
USE gv_a380;

CREATE TABLE IF NOT EXISTS store_product_image (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  product_id BIGINT UNSIGNED NOT NULL COMMENT '商品ID',
  image_url VARCHAR(255) NOT NULL COMMENT '图片访问路径',
  sort_order INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '排序，从0开始',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (id),
  KEY idx_store_product_image_product_id (product_id, sort_order),
  CONSTRAINT fk_store_product_image_product FOREIGN KEY (product_id) REFERENCES store_product (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='商铺商品图片';
