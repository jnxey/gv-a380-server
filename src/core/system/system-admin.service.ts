import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { DataSource, Repository } from 'typeorm';
import { MenuRoot, PasswordHash, RecordStatus, RoleCode, SuperAdminKeep } from '../../common/constants';
import { BusinessException } from '../../common/exceptions/business.exception';
import { LoginAccountContext } from '../../common/interfaces/login-account-context';
import { isEmpty, toIdentifier } from '../../common/tools';
import { Shop } from '../shop/shop.entity';
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
import type { CreateSystemUserDto, UpdateSystemUserDto } from './system-user.controller';
import type { UpdateSystemRoleDto } from './system-role.controller';

/**
 * 账号列表中的门店。
 */
export interface SystemShopView {
  shopId: string;
  shopCode: string;
  shopName: string;
  shopType: string;
}

/**
 * 账号列表行。
 */
export interface SystemUserView {
  userId: string;
  username: string;
  realName: string;
  mobile: string;
  status: string;
  roleId: string;
  roleName: string;
  shopList: SystemShopView[];
}

/**
 * 可选角色。
 */
export interface SystemRoleOption {
  roleId: string;
  roleCode: string;
  roleName: string;
  roleScope: string;
}

/**
 * 权限勾选项。
 */
export interface SystemPermissionOption {
  permissionId: string;
  permissionCode: string;
  permissionName: string;
  moduleCode: string;
  menuId: string;
}

/**
 * 菜单勾选项。
 */
export interface SystemMenuOption {
  menuId: string;
  parentId: string;
  menuName: string;
  menuPath: string;
}

/**
 * 角色及其已分配的权限和菜单。
 */
export interface SystemRoleDetail extends SystemRoleOption {
  permissionIdList: string[];
  menuIdList: string[];
  permissionList: SystemPermissionOption[];
  menuList: SystemMenuOption[];
}

/**
 * 后台账号、角色权限和菜单分配。不新建角色编码。
 */
@Injectable()
export class SystemAdminService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(SysUser)
    private readonly sysUserRepository: Repository<SysUser>,
    @InjectRepository(SysRole)
    private readonly sysRoleRepository: Repository<SysRole>,
    @InjectRepository(SysUserRole)
    private readonly sysUserRoleRepository: Repository<SysUserRole>,
    @InjectRepository(SysUserShop)
    private readonly sysUserShopRepository: Repository<SysUserShop>,
    @InjectRepository(SysPermission)
    private readonly sysPermissionRepository: Repository<SysPermission>,
    @InjectRepository(SysRolePermission)
    private readonly sysRolePermissionRepository: Repository<SysRolePermission>,
    @InjectRepository(SysMenu)
    private readonly sysMenuRepository: Repository<SysMenu>,
    @InjectRepository(SysRoleMenu)
    private readonly sysRoleMenuRepository: Repository<SysRoleMenu>,
    @InjectRepository(Shop)
    private readonly shopRepository: Repository<Shop>,
  ) {}

  /**
   * 列出全部后台账号，带上角色和绑定门店。
   */
  async listUsers(): Promise<SystemUserView[]> {
    const sysUserList = await this.sysUserRepository.find({ order: { id: 'ASC' } });
    const userViewList: SystemUserView[] = [];
    for (const sysUser of sysUserList) {
      userViewList.push(await this.getUserView(toIdentifier(sysUser.id)));
    }
    return userViewList;
  }

  /**
   * 返回表单要用的角色和全部门店。
   */
  async listUserOptions(): Promise<{ roleList: SystemRoleOption[]; shopList: SystemShopView[] }> {
    const sysRoleList = await this.sysRoleRepository.find({ order: { id: 'ASC' } });
    const shopList = await this.shopRepository.find({ order: { id: 'ASC' } });
    return {
      roleList: sysRoleList.map((sysRole) => this.toRoleOption(sysRole)),
      shopList: shopList.map((shop) => this.toShopView(shop)),
    };
  }

  /**
   * 新建后台账号，并绑定一个角色和至少一家门店。
   */
  async createUser(createSystemUserDto: CreateSystemUserDto): Promise<SystemUserView> {
    // 1. 登录名不能重复，角色和门店必须真实存在
    const existedUser = await this.sysUserRepository.findOne({ where: { username: createSystemUserDto.username } });
    if (!isEmpty(existedUser)) {
      throw new BusinessException('登录名已存在');
    }
    await this.assertRoleExists(createSystemUserDto.roleId);
    const shopIdList = await this.assertShopIdList(createSystemUserDto.shopIdList);
    // 2. 写入账号、唯一角色和门店绑定
    const passwordHash = await bcrypt.hash(createSystemUserDto.password, PasswordHash.SALT_ROUNDS);
    const savedUser = await this.dataSource.transaction(async (entityManager) => {
      const sysUser = await entityManager.save(SysUser, {
        username: createSystemUserDto.username,
        passwordHash,
        realName: createSystemUserDto.realName,
        mobile: isEmpty(createSystemUserDto.mobile) ? '' : createSystemUserDto.mobile,
        status: createSystemUserDto.status,
      });
      await entityManager.save(SysUserRole, {
        userId: sysUser.id,
        roleId: createSystemUserDto.roleId,
      });
      const sysUserShopList = shopIdList.map((shopId) => ({
        userId: sysUser.id,
        shopId,
      }));
      await entityManager.save(SysUserShop, sysUserShopList);
      return sysUser;
    });
    return this.getUserView(toIdentifier(savedUser.id));
  }

  /**
   * 修改后台账号。登录名不变；密码留空则不改。一人只保留一个角色。
   */
  async updateUser(
    userId: string,
    updateSystemUserDto: UpdateSystemUserDto,
    loginAccountContext: LoginAccountContext,
  ): Promise<SystemUserView> {
    // 1. 账号必须存在，且不能停用当前登录人
    const sysUser = await this.sysUserRepository.findOne({ where: { id: userId } });
    if (isEmpty(sysUser)) {
      throw new BusinessException('账号不存在');
    }
    if (
      toIdentifier(sysUser.id) === toIdentifier(loginAccountContext.accountId) &&
      updateSystemUserDto.status === RecordStatus.DISABLED
    ) {
      throw new BusinessException('不能停用当前登录账号');
    }
    await this.assertRoleExists(updateSystemUserDto.roleId);
    const shopIdList = await this.assertShopIdList(updateSystemUserDto.shopIdList);
    // 2. 更新资料，并替换角色和门店绑定
    await this.dataSource.transaction(async (entityManager) => {
      await entityManager.update(SysUser, sysUser.id, {
        realName: updateSystemUserDto.realName,
        mobile: isEmpty(updateSystemUserDto.mobile) ? '' : updateSystemUserDto.mobile,
        status: updateSystemUserDto.status,
      });
      if (!isEmpty(updateSystemUserDto.password)) {
        const passwordHash = await bcrypt.hash(updateSystemUserDto.password, PasswordHash.SALT_ROUNDS);
        await entityManager.update(SysUser, sysUser.id, { passwordHash });
      }
      await entityManager.delete(SysUserRole, { userId: sysUser.id });
      await entityManager.save(SysUserRole, {
        userId: sysUser.id,
        roleId: updateSystemUserDto.roleId,
      });
      await entityManager.delete(SysUserShop, { userId: sysUser.id });
      const sysUserShopList = shopIdList.map((shopId) => ({
        userId: sysUser.id,
        shopId,
      }));
      await entityManager.save(SysUserShop, sysUserShopList);
    });
    return this.getUserView(toIdentifier(sysUser.id));
  }

  /**
   * 列出现有角色。编码和范围只读。
   */
  async listRoles(): Promise<SystemRoleOption[]> {
    const sysRoleList = await this.sysRoleRepository.find({ order: { id: 'ASC' } });
    return sysRoleList.map((sysRole) => this.toRoleOption(sysRole));
  }

  /**
   * 读取一个角色当前勾选的权限、菜单，以及全部可选项。
   */
  async getRole(roleId: string): Promise<SystemRoleDetail> {
    const sysRole = await this.sysRoleRepository.findOne({ where: { id: roleId } });
    if (isEmpty(sysRole)) {
      throw new BusinessException('角色不存在');
    }
    const rolePermissionList = await this.sysRolePermissionRepository.find({ where: { roleId: sysRole.id } });
    const roleMenuList = await this.sysRoleMenuRepository.find({ where: { roleId: sysRole.id } });
    const permissionList = await this.sysPermissionRepository.find({ order: { id: 'ASC' } });
    const menuList = await this.sysMenuRepository.find({ order: { sortOrder: 'ASC' } });
    return {
      ...this.toRoleOption(sysRole),
      permissionIdList: rolePermissionList.map((rolePermission) => toIdentifier(rolePermission.permissionId)),
      menuIdList: roleMenuList.map((roleMenu) => toIdentifier(roleMenu.menuId)),
      permissionList: permissionList.map((sysPermission) => ({
        permissionId: toIdentifier(sysPermission.id),
        permissionCode: sysPermission.permissionCode,
        permissionName: sysPermission.permissionName,
        moduleCode: sysPermission.moduleCode,
        menuId: toIdentifier(sysPermission.menuId),
      })),
      menuList: menuList.map((sysMenu) => ({
        menuId: toIdentifier(sysMenu.id),
        parentId: toIdentifier(sysMenu.parentId),
        menuName: sysMenu.menuName,
        menuPath: sysMenu.menuPath,
      })),
    };
  }

  /**
   * 整组替换角色的权限和菜单。勾选子菜单时带上父菜单。
   */
  async updateRole(roleId: string, updateSystemRoleDto: UpdateSystemRoleDto): Promise<SystemRoleOption> {
    // 1. 角色、权限、菜单都必须存在
    const sysRole = await this.sysRoleRepository.findOne({ where: { id: roleId } });
    if (isEmpty(sysRole)) {
      throw new BusinessException('角色不存在');
    }
    const permissionIdList = this.distinctIdentifierList(updateSystemRoleDto.permissionIdList);
    const menuIdList = this.distinctIdentifierList(updateSystemRoleDto.menuIdList);
    const permissionList = await this.sysPermissionRepository.find();
    const menuList = await this.sysMenuRepository.find();
    this.assertIdentifierListKnown(
      permissionIdList,
      permissionList.map((sysPermission) => toIdentifier(sysPermission.id)),
      '权限不存在',
    );
    this.assertIdentifierListKnown(
      menuIdList,
      menuList.map((sysMenu) => toIdentifier(sysMenu.id)),
      '菜单不存在',
    );
    // 2. 子菜单自动带上父级，超级管理员不能拿掉系统管理
    const expandedMenuIdList = this.expandMenuIdList(menuIdList, menuList);
    if (sysRole.roleCode === RoleCode.GROUP_SUPER_ADMIN) {
      this.assertSuperAdminKeep(permissionIdList, expandedMenuIdList, permissionList, menuList);
    }
    // 3. 替换该角色原来的权限和菜单
    await this.dataSource.transaction(async (entityManager) => {
      await entityManager.delete(SysRolePermission, { roleId: sysRole.id });
      if (!isEmpty(permissionIdList)) {
        const rolePermissionList = permissionIdList.map((permissionId) => ({
          roleId: sysRole.id,
          permissionId,
        }));
        await entityManager.save(SysRolePermission, rolePermissionList);
      }
      await entityManager.delete(SysRoleMenu, { roleId: sysRole.id });
      if (!isEmpty(expandedMenuIdList)) {
        const roleMenuList = expandedMenuIdList.map((menuId) => ({
          roleId: sysRole.id,
          menuId,
        }));
        await entityManager.save(SysRoleMenu, roleMenuList);
      }
    });
    return this.toRoleOption(sysRole);
  }

  /**
   * 组装单个账号的角色和门店。没有角色时角色名为空。
   */
  private async getUserView(userId: string): Promise<SystemUserView> {
    const sysUser = await this.sysUserRepository.findOne({ where: { id: userId } });
    if (isEmpty(sysUser)) {
      throw new BusinessException('账号不存在');
    }
    const userRoleList = await this.sysUserRoleRepository.find({
      where: { userId: sysUser.id },
      order: { id: 'ASC' },
    });
    const firstUserRole = userRoleList[0];
    let roleId = '';
    let roleName = '';
    if (!isEmpty(firstUserRole)) {
      const sysRole = await this.sysRoleRepository.findOne({ where: { id: firstUserRole.roleId } });
      if (!isEmpty(sysRole)) {
        roleId = toIdentifier(sysRole.id);
        roleName = sysRole.roleName;
      }
    }
    const userShopList = await this.sysUserShopRepository.find({
      where: { userId: sysUser.id },
      order: { id: 'ASC' },
    });
    const shopViewList: SystemShopView[] = [];
    for (const userShop of userShopList) {
      const shop = await this.shopRepository.findOne({ where: { id: userShop.shopId } });
      if (!isEmpty(shop)) {
        shopViewList.push(this.toShopView(shop));
      }
    }
    return {
      userId: toIdentifier(sysUser.id),
      username: sysUser.username,
      realName: sysUser.realName,
      mobile: sysUser.mobile,
      status: sysUser.status,
      roleId,
      roleName,
      shopList: shopViewList,
    };
  }

  /**
   * 角色必须已存在。这里不创建新角色编码。
   */
  private async assertRoleExists(roleId: string): Promise<void> {
    const sysRole = await this.sysRoleRepository.findOne({ where: { id: roleId } });
    if (isEmpty(sysRole)) {
      throw new BusinessException('角色不存在');
    }
  }

  /**
   * 至少绑定一家真实门店，并去掉重复的门店主键。
   */
  private async assertShopIdList(shopIdList: string[]): Promise<string[]> {
    const distinctShopIdList = this.distinctIdentifierList(shopIdList);
    if (isEmpty(distinctShopIdList)) {
      throw new BusinessException('请至少绑定一家门店');
    }
    const shopList = await this.shopRepository.find();
    this.assertIdentifierListKnown(
      distinctShopIdList,
      shopList.map((shop) => toIdentifier(shop.id)),
      '门店不存在',
    );
    return distinctShopIdList;
  }

  /**
   * 去掉空值和重复主键。
   */
  private distinctIdentifierList(identifierList: string[]): string[] {
    const distinctIdentifierList: string[] = [];
    identifierList.forEach((identifier) => {
      const identifierText = toIdentifier(identifier);
      if (isEmpty(identifierText)) {
        return;
      }
      if (distinctIdentifierList.includes(identifierText) !== true) {
        distinctIdentifierList.push(identifierText);
      }
    });
    return distinctIdentifierList;
  }

  /**
   * 提交的主键必须都能在已有数据里找到。
   */
  private assertIdentifierListKnown(identifierList: string[], knownIdentifierList: string[], message: string): void {
    const unknownIdentifier = identifierList.some((identifier) => knownIdentifierList.includes(identifier) !== true);
    if (unknownIdentifier === true) {
      throw new BusinessException(message);
    }
  }

  /**
   * 选中子菜单时，沿父级一直补到根菜单。
   */
  private expandMenuIdList(menuIdList: string[], menuList: SysMenu[]): string[] {
    const menuById = new Map(menuList.map((sysMenu) => [toIdentifier(sysMenu.id), sysMenu]));
    const expandedMenuIdList: string[] = [];
    menuIdList.forEach((menuId) => {
      let currentMenu = menuById.get(menuId);
      while (!isEmpty(currentMenu)) {
        const currentMenuId = toIdentifier(currentMenu.id);
        if (expandedMenuIdList.includes(currentMenuId) !== true) {
          expandedMenuIdList.push(currentMenuId);
        }
        if (toIdentifier(currentMenu.parentId) === MenuRoot.PARENT_ID) {
          break;
        }
        currentMenu = menuById.get(toIdentifier(currentMenu.parentId));
      }
    });
    return expandedMenuIdList;
  }

  /**
   * 集团超级管理员必须留下系统管理的权限和三个菜单。
   */
  private assertSuperAdminKeep(
    permissionIdList: string[],
    menuIdList: string[],
    permissionList: SysPermission[],
    menuList: SysMenu[],
  ): void {
    const keptPermissionCodeList = permissionList
      .filter((sysPermission) => permissionIdList.includes(toIdentifier(sysPermission.id)))
      .map((sysPermission) => sysPermission.permissionCode);
    const permissionKept = SuperAdminKeep.PERMISSION_CODE_LIST.every((permissionCode) => {
      return keptPermissionCodeList.includes(permissionCode);
    });
    const keptMenuPathList = menuList
      .filter((sysMenu) => menuIdList.includes(toIdentifier(sysMenu.id)))
      .map((sysMenu) => sysMenu.menuPath);
    const menuKept = SuperAdminKeep.MENU_PATH_LIST.every((menuPath) => keptMenuPathList.includes(menuPath));
    if (permissionKept !== true || menuKept !== true) {
      throw new BusinessException('集团超级管理员必须保留系统管理权限和菜单');
    }
  }

  /**
   * 转换角色选项。
   */
  private toRoleOption(sysRole: SysRole): SystemRoleOption {
    return {
      roleId: toIdentifier(sysRole.id),
      roleCode: sysRole.roleCode,
      roleName: sysRole.roleName,
      roleScope: sysRole.roleScope,
    };
  }

  /**
   * 转换门店选项。
   */
  private toShopView(shop: Shop): SystemShopView {
    return {
      shopId: toIdentifier(shop.id),
      shopCode: shop.shopCode,
      shopName: shop.shopName,
      shopType: shop.shopType,
    };
  }
}
