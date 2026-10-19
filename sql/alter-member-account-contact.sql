-- 已有库给余额账户补上联系方式。
ALTER TABLE member_account
  ADD COLUMN contact VARCHAR(256) NOT NULL DEFAULT '' COMMENT '联系方式' AFTER username;
