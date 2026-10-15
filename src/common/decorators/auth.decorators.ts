import { SetMetadata } from '@nestjs/common';
import { MetadataKey } from '../constants';

/**
 * 标记接口不需要登录令牌。仅用于后台登录。
 */
export const Public = () => SetMetadata(MetadataKey.PUBLIC, true);

/**
 * 标记接口需要的功能权限编码。
 */
export const RequirePermission = (permissionCode: string) => SetMetadata(MetadataKey.REQUIRE_PERMISSION, permissionCode);

/**
 * 标记接口所属业务模块，用于拦住跨业务线访问。
 */
export const RequireModule = (moduleCode: string) => SetMetadata(MetadataKey.REQUIRE_MODULE, moduleCode);

/**
 * 标记接口必须按当前用户绑定门店做数据隔离。
 */
export const RequiresShop = () => SetMetadata(MetadataKey.REQUIRES_SHOP, true);
