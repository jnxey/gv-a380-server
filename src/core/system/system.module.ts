import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  SysMenu,
  SysPermission,
  SysRole,
  SysRoleMenu,
  SysRolePermission,
  SysUser,
  SysUserRole,
  SysUserShop,
} from '../rbac/sys.entities';
import { Shop } from '../shop/shop.entity';
import { SystemAdminService } from './system-admin.service';
import { SystemRoleController } from './system-role.controller';
import { SystemUserController } from './system-user.controller';

/**
 * 账号、角色权限和菜单配置。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      SysUser,
      SysRole,
      SysUserRole,
      SysPermission,
      SysRolePermission,
      SysMenu,
      SysRoleMenu,
      SysUserShop,
      Shop,
    ]),
  ],
  controllers: [SystemUserController, SystemRoleController],
  providers: [SystemAdminService],
})
export class SystemModule {}
