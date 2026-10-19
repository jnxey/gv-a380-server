import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccountType, RecordStatus, TimeSpan } from '../../common/constants';
import { LoginAccountContext } from '../../common/interfaces/login-account-context';
import { isEmpty, isNumber, toIdentifier } from '../../common/tools';
import { MemberQueryService } from '../member/member-query.service';
import { RbacService } from '../rbac/rbac.service';
import { SysUser } from '../rbac/sys.entities';

/**
 * JWT 载荷。会员令牌由宿主签发，后台令牌由本服务签发，字段保持一致。
 */
export interface AccessTokenPayload {
  sub: string;
  accountType: string;
  jti?: string;
  exp?: number;
}

/**
 * 把令牌载荷加载成当前请求的账号上下文。
 */
@Injectable()
export class AuthAccountLoader {
  constructor(
    private readonly memberQueryService: MemberQueryService,
    private readonly rbacService: RbacService,
    @InjectRepository(SysUser)
    private readonly sysUserRepository: Repository<SysUser>,
  ) {}

  /**
   * 按账号类型加载会员或后台用户，并带上角色、权限、绑定门店。
   */
  async load(payload: AccessTokenPayload): Promise<LoginAccountContext> {
    const accountId = toIdentifier(payload.sub);
    const tokenId = isEmpty(payload.jti) ? '' : String(payload.jti);
    const tokenExpiredAt = isNumber(payload.exp) ? Number(payload.exp) : 0;
    if (payload.accountType === AccountType.MEMBER) {
      return this.loadMember(accountId, tokenId, tokenExpiredAt);
    }
    if (payload.accountType === AccountType.SYS_USER) {
      return this.loadSysUser(accountId, tokenId, tokenExpiredAt);
    }
    throw new UnauthorizedException('账号类型不正确');
  }

  /**
   * 加载启用中的会员。会员没有后台角色和门店绑定。
   */
  private async loadMember(accountId: string, tokenId: string, tokenExpiredAt: number): Promise<LoginAccountContext> {
    const memberAccount = await this.memberQueryService.findById(accountId);
    if (isEmpty(memberAccount) || memberAccount.status !== RecordStatus.ENABLED) {
      throw new UnauthorizedException('会员不存在或已停用');
    }
    return {
      accountId,
      accountType: AccountType.MEMBER,
      roleList: [],
      permissionCodeList: [],
      boundShopIdList: [],
      tokenId,
      tokenExpiredAt,
    };
  }

  /**
   * 按聊天用户名加载余额账户。没有就建一条。小程序签名没有 jti，不进入登出黑名单。
   */
  async loadMemberByUsername(username: string, contact: string | null, nickname: string | null, expireAtMilliseconds: number): Promise<LoginAccountContext> {
    const memberAccount = await this.memberQueryService.ensureEnabledByUsername(username, contact, nickname);
    const tokenExpiredAt = Math.floor(expireAtMilliseconds / TimeSpan.MILLISECONDS_PER_SECOND);
    return {
      accountId: toIdentifier(memberAccount.id),
      accountType: AccountType.MEMBER,
      roleList: [],
      permissionCodeList: [],
      boundShopIdList: [],
      tokenId: '',
      tokenExpiredAt,
    };
  }

  /**
   * 加载启用中的后台账号及其权限数据。
   */
  private async loadSysUser(accountId: string, tokenId: string, tokenExpiredAt: number): Promise<LoginAccountContext> {
    const sysUser = await this.sysUserRepository.findOne({ where: { id: accountId } });
    if (isEmpty(sysUser) || sysUser.status !== RecordStatus.ENABLED) {
      throw new UnauthorizedException('账号不存在或已停用');
    }
    const roleList = await this.rbacService.listRoleBindings(accountId);
    const permissionCodeList = await this.rbacService.listPermissionCodes(accountId);
    const boundShopList = await this.rbacService.listBoundShops(accountId);
    return {
      accountId,
      accountType: AccountType.SYS_USER,
      roleList,
      permissionCodeList,
      boundShopIdList: boundShopList.map((boundShop) => boundShop.shopId),
      tokenId,
      tokenExpiredAt,
    };
  }
}
