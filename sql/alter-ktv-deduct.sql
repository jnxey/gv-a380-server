-- KTV 扣款权限。挂在包厢状态菜单上。已有库执行一次。
USE gv_a380;

INSERT INTO sys_permission (permission_code, permission_name, module_code, menu_id)
SELECT 'ktv:deduct', 'KTV扣款', 'KTV', sys_menu.id
FROM sys_menu
WHERE sys_menu.menu_path = '/ktv/room-status'
  AND NOT EXISTS (
    SELECT 1 FROM sys_permission WHERE permission_code = 'ktv:deduct'
  )
LIMIT 1;

INSERT INTO sys_role_permission (role_id, permission_id)
SELECT sys_role.id, sys_permission.id
FROM sys_role
INNER JOIN sys_permission ON sys_permission.permission_code = 'ktv:deduct'
WHERE sys_role.role_code IN ('GROUP_SUPER_ADMIN', 'KTV_SHOP_ADMIN', 'KTV_FRONT_DESK')
  AND NOT EXISTS (
    SELECT 1
    FROM sys_role_permission
    WHERE sys_role_permission.role_id = sys_role.id
      AND sys_role_permission.permission_id = sys_permission.id
  );
