import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import Redis from 'ioredis';
import { AccessTokenPayload, AuthAccountLoader } from '../../core/auth/auth-account.loader';
import { AccountType, AuthorizationScheme, MetadataKey, RedisKey, RequestPathPrefix } from '../constants';
import { MiniappSignService } from '../crypto/miniapp-sign.service';
import { LoginAccountContext } from '../interfaces/login-account-context';
import { REDIS_CLIENT } from '../redis/redis.module';
import { isEmpty } from '../tools';

/**
 * 扩展请求，挂上已解析的登录账号。
 */
export interface AuthenticatedRequest extends Request {
  loginAccountContext?: LoginAccountContext;
}

/**
 * 全局登录守卫。/app 使用小程序身份签名，/admin 使用 JWT。业务控制器不再自行校验。
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly authAccountLoader: AuthAccountLoader,
    private readonly miniappSignService: MiniappSignService,
    @Inject(REDIS_CLIENT)
    private readonly redisClient: Redis,
  ) {}

  /**
   * /app 按小程序身份签名识别会员。其余接口校验 JWT、黑名单，并限制账号不能串接口。
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(MetadataKey.PUBLIC, [context.getHandler(), context.getClass()]);
    if (isPublic === true) {
      return true;
    }
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.path.startsWith(RequestPathPrefix.APP)) {
      return this.activateByMiniappSign(request);
    }
    // 1. 取出 Bearer token
    const accessToken = this.extractBearerToken(request);
    if (isEmpty(accessToken)) {
      throw new UnauthorizedException('请先登录');
    }
    // 2. 校验签名和过期时间
    let payload: AccessTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<AccessTokenPayload>(accessToken);
    } catch (error) {
      throw new UnauthorizedException('登录已失效');
    }
    if (isEmpty(payload) || isEmpty(payload.jti) || isEmpty(payload.sub) || isEmpty(payload.accountType)) {
      throw new UnauthorizedException('登录已失效');
    }
    // 3. 命中 Redis 黑名单则视为已登出
    const blacklistKey = `${RedisKey.JWT_BLACKLIST_PREFIX}${payload.jti}`;
    const blacklistValue = await this.redisClient.get(blacklistKey);
    if (!isEmpty(blacklistValue)) {
      throw new UnauthorizedException('登录已失效');
    }
    // 4. 会员只能访问 /app，后台账号只能访问 /admin
    this.assertAccountTypeMatchesPath(payload.accountType, request.path);
    // 5. 加载账号、角色、权限和绑定门店，供后续守卫使用
    request.loginAccountContext = await this.authAccountLoader.load(payload);
    return true;
  }

  /**
   * 用小程序身份签名识别会员。签名里的用户名对应会员号。
   */
  private async activateByMiniappSign(request: AuthenticatedRequest): Promise<boolean> {
    // 1. 取出 Bearer 密文
    const cipherText = this.extractBearerToken(request);
    if (isEmpty(cipherText)) {
      throw new UnauthorizedException('请先登录');
    }
    // 2. 解密并核对类型和过期时间
    const miniappSign = this.miniappSignService.readMiniappSign(cipherText);
    // 3. 按会员号加载启用中的会员
    request.loginAccountContext = await this.authAccountLoader.loadMemberByUsername(miniappSign.username, miniappSign.expireAtMilliseconds);
    return true;
  }

  /**
   * 从 Authorization 头解析 Bearer token。
   */
  private extractBearerToken(request: Request): string {
    const authorizationHeader = request.headers.authorization;
    if (isEmpty(authorizationHeader) || typeof authorizationHeader !== 'string') {
      return '';
    }
    const headerParts = authorizationHeader.split(' ');
    if (headerParts.length !== 2 || headerParts[0] !== AuthorizationScheme.BEARER) {
      return '';
    }
    return headerParts[1];
  }

  /**
   * 按路径前缀限制账号类型，避免两套账号混用。
   */
  private assertAccountTypeMatchesPath(accountType: string, requestPath: string): void {
    if (requestPath.startsWith(RequestPathPrefix.APP) && accountType !== AccountType.MEMBER) {
      throw new ForbiddenException('会员接口不能使用后台账号');
    }
    if (requestPath.startsWith(RequestPathPrefix.ADMIN) && accountType !== AccountType.SYS_USER) {
      throw new ForbiddenException('后台接口不能使用会员账号');
    }
  }
}
