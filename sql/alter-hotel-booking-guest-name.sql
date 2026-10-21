-- 已有库给酒店预订订单补上预定人。
ALTER TABLE hotel_booking_order
  ADD COLUMN guest_name VARCHAR(64) NOT NULL DEFAULT '' COMMENT '预定人' AFTER contact;
