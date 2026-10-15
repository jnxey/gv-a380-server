import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { canAccessModule } from '../auth/access-rule';
import { AccountType, MetadataKey } from '../constants';
import { isEmpty } from '../tools';
import { AuthenticatedRequest } from './jwt-auth.guard';

/**
 * 功能权限与业务线守卫。
 * 先看角色能不能进模块，再看有没有接口权限。
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  /**
   * 校验模块范围和功能权限。未声明权限的接口只要求已登录。
   */
  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(MetadataKey.PUBLIC, [context.getHandler(), context.getClass()]);
    if (isPublic === true) {
      return true;
    }
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const loginAccountContext = request.loginAccountContext;
    if (isEmpty(loginAccountContext)) {
      throw new ForbiddenException('请先登录');
    }
    const requiredModuleCode = this.reflector.getAllAndOverride<string>(MetadataKey.REQUIRE_MODULE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!isEmpty(requiredModuleCode)) {
      if (loginAccountContext.accountType !== AccountType.SYS_USER) {
        throw new ForbiddenException('无权访问该模块');
      }
      const moduleAllowed = canAccessModule(loginAccountContext.roleList, requiredModuleCode);
      if (moduleAllowed !== true) {
        throw new ForbiddenException('无权访问该业务模块');
      }
    }
    const requiredPermissionCode = this.reflector.getAllAndOverride<string>(MetadataKey.REQUIRE_PERMISSION, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isEmpty(requiredPermissionCode)) {
      return true;
    }
    if (loginAccountContext.accountType !== AccountType.SYS_USER) {
      throw new ForbiddenException('无权访问该功能');
    }
    const permissionAllowed = loginAccountContext.permissionCodeList.some((permissionCode) => permissionCode === requiredPermissionCode);
    if (permissionAllowed !== true) {
      throw new ForbiddenException('无权访问该功能');
    }
    return true;
  }
}
