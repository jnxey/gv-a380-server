import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Shop } from '../shop/shop.entity';
import { RbacService } from './rbac.service';
import { SysMenu, SysPermission, SysRole, SysRoleMenu, SysRolePermission, SysUserRole, SysUserShop } from './sys.entities';

/**
 * 权限与菜单模块。
 */
@Module({
  imports: [TypeOrmModule.forFeature([SysRole, SysUserRole, SysPermission, SysRolePermission, SysMenu, SysRoleMenu, SysUserShop, Shop])],
  providers: [RbacService],
  exports: [RbacService, TypeOrmModule],
})
export class RbacModule {}
