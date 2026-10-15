import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { IsArray, IsString } from 'class-validator';
import { ModuleCode, PermissionCode } from '../../common/constants';
import { RequireModule, RequirePermission } from '../../common/decorators/auth.decorators';
import { SystemAdminService } from './system-admin.service';

/**
 * 替换角色的权限和菜单。
 */
export class UpdateSystemRoleDto {
  @IsArray()
  @IsString({ each: true })
  permissionIdList: string[];

  @IsArray()
  @IsString({ each: true })
  menuIdList: string[];
}

/**
 * 已有角色的权限和菜单分配。不新建角色。
 */
@Controller('admin/system/roles')
@RequireModule(ModuleCode.CORE)
export class SystemRoleController {
  constructor(private readonly systemAdminService: SystemAdminService) {}

  /**
   * 查询全部角色。
   */
  @Get()
  @RequirePermission(PermissionCode.SYSTEM_ROLE_QUERY)
  listRoles() {
    return this.systemAdminService.listRoles();
  }

  /**
   * 查询一个角色的权限、菜单和可选项。
   */
  @Get(':roleId')
  @RequirePermission(PermissionCode.SYSTEM_ROLE_QUERY)
  getRole(@Param('roleId') roleId: string) {
    return this.systemAdminService.getRole(roleId);
  }

  /**
   * 保存一个角色的权限和菜单。
   */
  @Put(':roleId')
  @RequirePermission(PermissionCode.SYSTEM_ROLE_SAVE)
  updateRole(@Param('roleId') roleId: string, @Body() updateSystemRoleDto: UpdateSystemRoleDto) {
    return this.systemAdminService.updateRole(roleId, updateSystemRoleDto);
  }
}
