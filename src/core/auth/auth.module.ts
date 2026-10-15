import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtSetting } from '../../common/constants';
import { isEmpty, isNumber } from '../../common/tools';
import { MemberModule } from '../member/member.module';
import { RbacModule } from '../rbac/rbac.module';
import { SysUser } from '../rbac/sys.entities';
import { AuthAccountLoader } from './auth-account.loader';
import { AppAuthController, AuthController } from './auth.controller';
import { AuthService } from './auth.service';

/**
 * 鉴权模块。JWT 全局可用，账号加载服务供 Guard 注入。
 */
@Module({
  imports: [
    MemberModule,
    RbacModule,
    TypeOrmModule.forFeature([SysUser]),
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const secret = configService.get<string>('JWT_SECRET');
        if (isEmpty(secret)) {
          throw new Error('JWT_SECRET 未配置');
        }
        const expiresText = configService.get<string>('JWT_EXPIRES_SECONDS');
        const expiresIn = isNumber(expiresText) ? Number(expiresText) : JwtSetting.DEFAULT_EXPIRES_SECONDS;
        return {
          secret,
          signOptions: { expiresIn },
        };
      },
    }),
  ],
  controllers: [AuthController, AppAuthController],
  providers: [AuthService, AuthAccountLoader],
  exports: [AuthService, AuthAccountLoader],
})
export class AuthModule {}
