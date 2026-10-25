import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MenuRoot } from '../../common/constants';
import { RoleBinding } from '../../common/interfaces/login-account-context';
import { isEmpty, toIdentifier } from '../../common/tools';
import { SysMenu, SysPermission, SysRole, SysRoleMenu, SysRolePermission, SysUserRole, SysUserShop } from './sys.entities';
import { Shop } from '../shop/shop.entity';

/**
 * 菜单树节点。
 */
export interface MenuTreeNode {
  menuId: string;
  parentId: string;
  menuName: string;
  menuPath: string;
  componentPath: string;
  moduleCode: string;
  sortOrder: number;
  children: MenuTreeNode[];
}

/**
 * 账号可访问的门店摘要。
 */
export interface BoundShopView {
  shopId: string;
  shopCode: string;
  shopName: string;
  shopType: string;
  timeZone: string;
  requireRoomNo: boolean;
}

/**
 * 角色、权限、菜单、门店绑定查询。
 */
@Injectable()
export class RbacService {
  constructor(
    @InjectRepository(SysUserRole)
    private readonly sysUserRoleRepository: Repository<SysUserRole>,
    @InjectRepository(SysRole)
    private readonly sysRoleRepository: Repository<SysRole>,
    @InjectRepository(SysRolePermission)
    private readonly sysRolePermissionRepository: Repository<SysRolePermission>,
    @InjectRepository(SysPermission)
    private readonly sysPermissionRepository: Repository<SysPermission>,
    @InjectRepository(SysRoleMenu)
    private readonly sysRoleMenuRepository: Repository<SysRoleMenu>,
    @InjectRepository(SysMenu)
    private readonly sysMenuRepository: Repository<SysMenu>,
    @InjectRepository(SysUserShop)
    private readonly sysUserShopRepository: Repository<SysUserShop>,
    @InjectRepository(Shop)
    private readonly shopRepository: Repository<Shop>,
  ) {}

  /**
   * 读取用户角色编码和角色范围。
   */
  async listRoleBindings(userId: string): Promise<RoleBinding[]> {
    const userRoleList = await this.sysUserRoleRepository.find({ where: { userId } });
    if (userRoleList.length === 0) {
      return [];
    }
    const roleIdList = userRoleList.map((userRole) => toIdentifier(userRole.roleId));
    const roleList = await this.sysRoleRepository
      .createQueryBuilder('sysRole')
      .where('sysRole.id IN (:...roleIdList)', { roleIdList })
      .getMany();
    return roleList.map((sysRole) => ({
      roleCode: sysRole.roleCode,
      roleScope: sysRole.roleScope,
    }));
  }

  /**
   * 汇总用户全部功能权限编码。
   */
  async listPermissionCodes(userId: string): Promise<string[]> {
    const permissionList = await this.sysPermissionRepository
      .createQueryBuilder('sysPermission')
      .innerJoin(SysRolePermission, 'sysRolePermission', 'sysRolePermission.permissionId = sysPermission.id')
      .innerJoin(SysUserRole, 'sysUserRole', 'sysUserRole.roleId = sysRolePermission.roleId')
      .where('sysUserRole.userId = :userId', { userId })
      .distinct(true)
      .getMany();
    return permissionList.map((sysPermission) => sysPermission.permissionCode);
  }

  /**
   * 读取用户绑定的门店。
   */
  async listBoundShops(userId: string): Promise<BoundShopView[]> {
    const userShopList = await this.sysUserShopRepository.find({ where: { userId } });
    if (userShopList.length === 0) {
      return [];
    }
    const shopIdList = userShopList.map((userShop) => toIdentifier(userShop.shopId));
    const shopList = await this.shopRepository
      .createQueryBuilder('shop')
      .where('shop.id IN (:...shopIdList)', { shopIdList })
      .orderBy('shop.id', 'ASC')
      .getMany();
    return shopList.map((shop) => ({
      shopId: toIdentifier(shop.id),
      shopCode: shop.shopCode,
      shopName: shop.shopName,
      shopType: shop.shopType,
      timeZone: isEmpty(shop.timeZone) ? '' : shop.timeZone,
      requireRoomNo: shop.requireRoomNo === 1,
    }));
  }

  /**
   * 按角色返回菜单树。同一菜单只出现一次。
   */
  async listMenuTree(userId: string): Promise<MenuTreeNode[]> {
    const menuList = await this.sysMenuRepository
      .createQueryBuilder('sysMenu')
      .innerJoin(SysRoleMenu, 'sysRoleMenu', 'sysRoleMenu.menuId = sysMenu.id')
      .innerJoin(SysUserRole, 'sysUserRole', 'sysUserRole.roleId = sysRoleMenu.roleId')
      .where('sysUserRole.userId = :userId', { userId })
      .distinct(true)
      .orderBy('sysMenu.sortOrder', 'ASC')
      .getMany();
    return this.buildMenuTree(menuList);
  }

  /**
   * 把平铺菜单组装成两级树。
   */
  private buildMenuTree(menuList: SysMenu[]): MenuTreeNode[] {
    const rootMenuList = menuList
      .filter((sysMenu) => toIdentifier(sysMenu.parentId) === MenuRoot.PARENT_ID)
      .sort((leftMenu, rightMenu) => leftMenu.sortOrder - rightMenu.sortOrder);
    return rootMenuList.map((rootMenu) => {
      const childMenuList = menuList
        .filter((sysMenu) => toIdentifier(sysMenu.parentId) === toIdentifier(rootMenu.id))
        .sort((leftMenu, rightMenu) => leftMenu.sortOrder - rightMenu.sortOrder)
        .map((sysMenu) => this.toMenuNode(sysMenu, []));
      return this.toMenuNode(rootMenu, childMenuList);
    });
  }

  /**
   * 转换单个菜单节点。
   */
  private toMenuNode(sysMenu: SysMenu, children: MenuTreeNode[]): MenuTreeNode {
    return {
      menuId: toIdentifier(sysMenu.id),
      parentId: toIdentifier(sysMenu.parentId),
      menuName: sysMenu.menuName,
      menuPath: sysMenu.menuPath,
      componentPath: isEmpty(sysMenu.componentPath) ? '' : sysMenu.componentPath,
      moduleCode: sysMenu.moduleCode,
      sortOrder: sysMenu.sortOrder,
      children,
    };
  }
}
