import { Body, Controller, Get, Post } from '@nestjs/common';
import { IsNotEmpty, IsString } from 'class-validator';
import { CurrentAccount } from '../../common/decorators/current-account.decorator';
import { Public } from '../../common/decorators/auth.decorators';
import { LoginAccountContext } from '../../common/interfaces/login-account-context';
import { AuthService } from './auth.service';
import { RbacService } from '../rbac/rbac.service';

/**
 * 后台登录参数。
 */
export class LoginDto {
  @IsString()
  @IsNotEmpty()
  username: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}

/**
 * 修改当前后台账号密码。
 */
export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  oldPassword: string;

  @IsString()
  @IsNotEmpty()
  newPassword: string;
}

/**
 * 后台认证接口。小程序没有对应的登录接口。
 */
@Controller('admin/auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly rbacService: RbacService,
  ) {}

  /**
   * 后台账号登录。
   */
  @Public()
  @Post('login')
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto.username, loginDto.password);
  }

  /**
   * 注销当前访问令牌。
   */
  @Post('logout')
  logout(@CurrentAccount() loginAccountContext: LoginAccountContext) {
    return this.authService.logout(loginAccountContext);
  }

  /**
   * 当前登录人资料与绑定门店。
   */
  @Get('profile')
  profile(@CurrentAccount() loginAccountContext: LoginAccountContext) {
    return this.authService.getProfile(loginAccountContext);
  }

  /**
   * 按旧密码修改当前登录人的密码。
   */
  @Post('password')
  changePassword(@CurrentAccount() loginAccountContext: LoginAccountContext, @Body() changePasswordDto: ChangePasswordDto) {
    return this.authService.changePassword(loginAccountContext, changePasswordDto.oldPassword, changePasswordDto.newPassword);
  }

  /**
   * 按角色返回菜单树，供前端动态注册路由。
   */
  @Get('menus')
  menus(@CurrentAccount() loginAccountContext: LoginAccountContext) {
    return this.rbacService.listMenuTree(loginAccountContext.accountId);
  }
}

/**
 * 小程序只提供登出，把当前访问令牌加入黑名单。不提供登录。
 */
@Controller('app/auth')
export class AppAuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * 注销当前会员访问令牌。
   */
  @Post('logout')
  logout(@CurrentAccount() loginAccountContext: LoginAccountContext) {
    return this.authService.logout(loginAccountContext);
  }
}
