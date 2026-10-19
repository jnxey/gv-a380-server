-- 已有库把会员账户收成用户名、余额、状态。原会员号作为用户名保留。
ALTER TABLE member_account
  ADD COLUMN username VARCHAR(64) NULL COMMENT '聊天用户名' AFTER id;

UPDATE member_account SET username = member_no;

ALTER TABLE member_account
  DROP FOREIGN KEY fk_member_account_shop,
  DROP INDEX uk_member_account_member_no,
  DROP INDEX uk_member_account_mobile,
  DROP INDEX idx_member_account_shop_id,
  DROP COLUMN member_no,
  DROP COLUMN member_name,
  DROP COLUMN mobile,
  DROP COLUMN points,
  DROP COLUMN shop_id;

ALTER TABLE member_account
  MODIFY username VARCHAR(64) NOT NULL COMMENT '聊天用户名',
  ADD UNIQUE KEY uk_member_account_username (username);
