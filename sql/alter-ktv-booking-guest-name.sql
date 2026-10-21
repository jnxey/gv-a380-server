-- 已有库给 KTV 预订订单补上预定人和联系方式。
ALTER TABLE ktv_booking_order
  ADD COLUMN guest_name VARCHAR(64) NOT NULL DEFAULT '' COMMENT '预定人' AFTER member_id,
  ADD COLUMN contact VARCHAR(64) NOT NULL DEFAULT '' COMMENT '联系方式' AFTER guest_name;
