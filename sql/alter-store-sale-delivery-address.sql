-- 已有库补上商铺销售单收货地址。
USE gv_a380;

ALTER TABLE store_sale
  ADD COLUMN delivery_address VARCHAR(255) NOT NULL DEFAULT '' COMMENT '收货地址' AFTER remark;
