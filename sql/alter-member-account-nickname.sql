-- 已有库给余额账户补上昵称。
ALTER TABLE member_account
  ADD COLUMN nickname VARCHAR(128) NOT NULL DEFAULT '' COMMENT '昵称' AFTER username;
