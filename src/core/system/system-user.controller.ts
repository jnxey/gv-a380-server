import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { IsArray, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ModuleCode, PermissionCode, RecordStatus } from '../../common/constants';
import { RequireModule, RequirePermission } from '../../common/decorators/auth.decorators';
import { CurrentAccount } from '../../common/decorators/current-account.decorator';
import { LoginAccountContext } from '../../common/interfaces/login-account-context';
import { SystemAdminService } from './system-admin.service';

/**
 * 新建后台账号。
 */
export class CreateSystemUserDto {
  @IsString()
  @IsNotEmpty()
  username: string;

  @IsString()
  @IsNotEmpty()
  password: string;

  @IsString()
  @IsNotEmpty()
  realName: string;

  @IsOptional()
  @IsString()
  mobile?: string;

  @IsIn(Object.values(RecordStatus))
  status: string;

  @IsString()
  @IsNotEmpty()
  roleId: string;

  @IsArray()
  @IsString({ each: true })
  shopIdList: string[];
}

/**
 * 修改后台账号。密码留空表示不修改。
 */
export class UpdateSystemUserDto {
  @IsString()
  @IsNotEmpty()
  realName: string;

  @IsOptional()
  @IsString()
  mobile?: string;

  @IsIn(Object.values(RecordStatus))
  status: string;

  @IsString()
  @IsNotEmpty()
  roleId: string;

  @IsArray()
  @IsString({ each: true })
  shopIdList: string[];

  @IsOptional()
  @IsString()
  password?: string;
}

/**
 * 后台账号维护。不按门店隔离。
 */
@Controller('admin/system/users')
@RequireModule(ModuleCode.CORE)
export class SystemUserController {
  constructor(private readonly systemAdminService: SystemAdminService) {}

  /**
   * 查询全部后台账号。
   */
  @Get()
  @RequirePermission(PermissionCode.SYSTEM_USER_QUERY)
  listUsers() {
    return this.systemAdminService.listUsers();
  }

  /**
   * 新建和编辑表单需要的角色、门店选项。
   */
  @Get('options')
  @RequirePermission(PermissionCode.SYSTEM_USER_QUERY)
  listUserOptions() {
    return this.systemAdminService.listUserOptions();
  }

  /**
   * 新建后台账号。
   */
  @Post()
  @RequirePermission(PermissionCode.SYSTEM_USER_SAVE)
  createUser(@Body() createSystemUserDto: CreateSystemUserDto) {
    return this.systemAdminService.createUser(createSystemUserDto);
  }

  /**
   * 修改后台账号、角色和门店绑定。
   */
  @Put(':userId')
  @RequirePermission(PermissionCode.SYSTEM_USER_SAVE)
  updateUser(
    @Param('userId') userId: string,
    @Body() updateSystemUserDto: UpdateSystemUserDto,
    @CurrentAccount() loginAccountContext: LoginAccountContext,
  ) {
    return this.systemAdminService.updateUser(userId, updateSystemUserDto, loginAccountContext);
  }
}
