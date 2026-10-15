import { RoleBinding } from '../interfaces/login-account-context';
import { ModuleCode, RoleCode, RoleScope, ShopType } from '../constants';

/**
 * 判断角色能否进入某个业务模块。
 * 集团角色可进 KTV 和酒店，门店角色不能跨业务线。
 */
export function canAccessModule(roleList: RoleBinding[], moduleCode: string): boolean {
  if (moduleCode === ModuleCode.CORE) {
    return true;
  }
  const hasGroupRole = roleList.some((roleBinding) => {
    return roleBinding.roleCode === RoleCode.GROUP_SUPER_ADMIN || roleBinding.roleCode === RoleCode.GROUP_FINANCE;
  });
  if (hasGroupRole) {
    return true;
  }
  if (moduleCode === ModuleCode.KTV) {
    return roleList.some((roleBinding) => roleBinding.roleScope === RoleScope.KTV);
  }
  if (moduleCode === ModuleCode.HOTEL) {
    return roleList.some((roleBinding) => roleBinding.roleScope === RoleScope.HOTEL);
  }
  return false;
}

/**
 * 判断当前门店类型是否允许访问该模块。
 */
export function isShopTypeMatched(shopType: string, moduleCode: string): boolean {
  if (moduleCode === ModuleCode.KTV) {
    return shopType === ShopType.KTV;
  }
  if (moduleCode === ModuleCode.HOTEL) {
    return shopType === ShopType.HOTEL;
  }
  return true;
}
