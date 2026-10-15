import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * 后台管理账号。与会员账户完全独立。
 */
@Entity('sys_user')
export class SysUser {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ type: 'varchar', length: 64 })
  username: string;

  @Column({ type: 'varchar', length: 128, select: false })
  passwordHash: string;

  @Column({ type: 'varchar', length: 64 })
  realName: string;

  @Column({ type: 'varchar', length: 32, default: '' })
  mobile: string;

  @Column({ type: 'varchar', length: 16 })
  status: string;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: string;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt: string;
}

/**
 * 后台角色。
 */
@Entity('sys_role')
export class SysRole {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ type: 'varchar', length: 64 })
  roleCode: string;

  @Column({ type: 'varchar', length: 64 })
  roleName: string;

  @Column({ type: 'varchar', length: 16 })
  roleScope: string;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: string;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt: string;
}

/**
 * 后台用户与角色。
 */
@Entity('sys_user_role')
export class SysUserRole {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ type: 'bigint', unsigned: true })
  userId: string;

  @Column({ type: 'bigint', unsigned: true })
  roleId: string;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: string;
}

/**
 * 接口功能权限。
 */
@Entity('sys_permission')
export class SysPermission {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ type: 'varchar', length: 64 })
  permissionCode: string;

  @Column({ type: 'varchar', length: 64 })
  permissionName: string;

  @Column({ type: 'varchar', length: 16 })
  moduleCode: string;

  @Column({ type: 'bigint', unsigned: true, default: 0 })
  menuId: string;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: string;
}

/**
 * 角色与功能权限。
 */
@Entity('sys_role_permission')
export class SysRolePermission {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ type: 'bigint', unsigned: true })
  roleId: string;

  @Column({ type: 'bigint', unsigned: true })
  permissionId: string;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: string;
}

/**
 * 后台菜单。
 */
@Entity('sys_menu')
export class SysMenu {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ type: 'bigint', unsigned: true, default: 0 })
  parentId: string;

  @Column({ type: 'varchar', length: 64 })
  menuName: string;

  @Column({ type: 'varchar', length: 128, default: '' })
  menuPath: string;

  @Column({ type: 'varchar', length: 128, default: '' })
  componentPath: string;

  @Column({ type: 'varchar', length: 64, default: '' })
  permissionCode: string;

  @Column({ type: 'varchar', length: 16 })
  moduleCode: string;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: string;
}

/**
 * 角色与菜单。
 */
@Entity('sys_role_menu')
export class SysRoleMenu {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ type: 'bigint', unsigned: true })
  roleId: string;

  @Column({ type: 'bigint', unsigned: true })
  menuId: string;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: string;
}

/**
 * 后台用户与门店的多对多绑定。数据权限只认这张表。
 */
@Entity('sys_user_shop')
export class SysUserShop {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ type: 'bigint', unsigned: true })
  userId: string;

  @Column({ type: 'bigint', unsigned: true })
  shopId: string;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: string;
}
