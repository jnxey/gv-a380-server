import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import Redis from 'ioredis';
import { AccountType, PasswordHash, RecordStatus, RedisKey, RedisValue, TimeSpan } from '../../common/constants';
import { BusinessException } from '../../common/exceptions/business.exception';
import { LoginAccountContext } from '../../common/interfaces/login-account-context';
import { REDIS_CLIENT } from '../../common/redis/redis.module';
import { isEmpty, toIdentifier } from '../../common/tools';
import { RbacService } from '../rbac/rbac.service';
import { SysUser } from '../rbac/sys.entities';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';

/**
 * 后台登录结果。
 */
export interface LoginResult {
  accessToken: string;
  accountId: string;
  username: string;
  realName: string;
}

/**
 * 后台登录、登出。会员不在这里登录。
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly rbacService: RbacService,
    @InjectRepository(SysUser)
    private readonly sysUserRepository: Repository<SysUser>,
    @Inject(REDIS_CLIENT)
    private readonly redisClient: Redis,
  ) {}

  /**
   * 校验后台账号密码并签发 JWT。
   */
  async login(username: string, password: string): Promise<LoginResult> {
    // 1. 按登录名读取账号，密码列默认不查询，这里单独取出
    const sysUser = await this.sysUserRepository
      .createQueryBuilder('sysUser')
      .addSelect('sysUser.passwordHash')
      .where('sysUser.username = :username', { username })
      .getOne();
    if (isEmpty(sysUser) || sysUser.status !== RecordStatus.ENABLED) {
      throw new UnauthorizedException('账号或密码错误');
    }
    // 2. 校验密码。失败时与账号不存在使用同一提示，避免探测账号
    const passwordMatched = await bcrypt.compare(password, sysUser.passwordHash);
    if (passwordMatched !== true) {
      throw new UnauthorizedException('账号或密码错误');
    }
    // 3. 签发后台账号令牌。刷新令牌不发给管理端以外的调用方，小程序拿不到后台令牌
    const accessToken = await this.jwtService.signAsync(
      {
        sub: toIdentifier(sysUser.id),
        accountType: AccountType.SYS_USER,
      },
      { jwtid: randomUUID() },
    );
    return {
      accessToken,
      accountId: toIdentifier(sysUser.id),
      username: sysUser.username,
      realName: sysUser.realName,
    };
  }

  /**
   * 为仍在使用的后台账号再签一张访问令牌。旧令牌保持到原来的过期时间。
   */
  async renewAccessToken(loginAccountContext: LoginAccountContext): Promise<{ accessToken: string }> {
    // 1. 只给仍持有后台令牌的账号续期
    if (loginAccountContext.accountType !== AccountType.SYS_USER || isEmpty(loginAccountContext.tokenId)) {
      throw new UnauthorizedException('登录已失效');
    }
    // 2. 新的令牌编号，有效期仍按现有 JWT 配置
    const accessToken = await this.jwtService.signAsync(
      {
        sub: loginAccountContext.accountId,
        accountType: AccountType.SYS_USER,
      },
      { jwtid: randomUUID() },
    );
    return { accessToken };
  }

  /**
   * 把当前访问令牌的 jti 放入 Redis，直到原过期时间，实现登出立即失效。
   */
  async logout(loginAccountContext: LoginAccountContext): Promise<void> {
    if (isEmpty(loginAccountContext.tokenId)) {
      throw new BusinessException('登录令牌无效');
    }
    const nowSeconds = Math.floor(Date.now() / TimeSpan.MILLISECONDS_PER_SECOND);
    let ttlSeconds = loginAccountContext.tokenExpiredAt - nowSeconds;
    if (ttlSeconds < TimeSpan.MIN_REDIS_TTL_SECONDS) {
      ttlSeconds = TimeSpan.MIN_REDIS_TTL_SECONDS;
    }
    const blacklistKey = `${RedisKey.JWT_BLACKLIST_PREFIX}${loginAccountContext.tokenId}`;
    await this.redisClient.set(blacklistKey, RedisValue.BLACKLISTED, 'EX', ttlSeconds);
  }

  /**
   * 读取当前后台用户的资料、角色、权限和绑定门店。
   */
  async getProfile(loginAccountContext: LoginAccountContext): Promise<{
    accountId: string;
    username: string;
    realName: string;
    roleList: LoginAccountContext['roleList'];
    permissionCodeList: string[];
    shopList: Awaited<ReturnType<RbacService['listBoundShops']>>;
  }> {
    const sysUser = await this.sysUserRepository.findOne({ where: { id: loginAccountContext.accountId } });
    if (isEmpty(sysUser)) {
      throw new UnauthorizedException('账号不存在');
    }
    const shopList = await this.rbacService.listBoundShops(loginAccountContext.accountId);
    return {
      accountId: loginAccountContext.accountId,
      username: sysUser.username,
      realName: sysUser.realName,
      roleList: loginAccountContext.roleList,
      permissionCodeList: loginAccountContext.permissionCodeList,
      shopList,
    };
  }

  /**
   * 按旧密码修改当前后台账号的密码。
   */
  async changePassword(loginAccountContext: LoginAccountContext, oldPassword: string, newPassword: string): Promise<void> {
    // 1. 按当前登录人读取账号，密码列默认不查询，这里单独取出
    const sysUser = await this.sysUserRepository
      .createQueryBuilder('sysUser')
      .addSelect('sysUser.passwordHash')
      .where('sysUser.id = :accountId', { accountId: loginAccountContext.accountId })
      .getOne();
    if (isEmpty(sysUser)) {
      throw new UnauthorizedException('账号不存在');
    }
    // 2. 旧密码不对时不更新
    const oldPasswordMatched = await bcrypt.compare(oldPassword, sysUser.passwordHash);
    if (oldPasswordMatched !== true) {
      throw new BusinessException('旧密码不正确');
    }
    // 3. 写入新密码哈希
    const passwordHash = await bcrypt.hash(newPassword, PasswordHash.SALT_ROUNDS);
    await this.sysUserRepository.update(sysUser.id, { passwordHash });
  }
}
