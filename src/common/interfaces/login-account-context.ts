/**
 * 当前请求对应的登录账号。会员没有角色和门店绑定。
 */
export interface LoginAccountContext {
  accountId: string;
  accountType: string;
  roleList: RoleBinding[];
  permissionCodeList: string[];
  boundShopIdList: string[];
  tokenId: string;
  tokenExpiredAt: number;
}

/**
 * 角色编码及其数据范围。
 */
export interface RoleBinding {
  roleCode: string;
  roleScope: string;
}
