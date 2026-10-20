import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import Decimal from 'decimal.js';
import { FindOptionsWhere, In, Like, Repository } from 'typeorm';
import { NumberBoundary, RecordStatus } from '../../common/constants';
import { BusinessException } from '../../common/exceptions/business.exception';
import { PageResult } from '../../common/interfaces/page-result';
import { isDuplicateEntryError, isEmpty, resolvePage, toIdentifier, toMoneyString } from '../../common/tools';
import { MemberAccount } from './member-account.entity';

/**
 * 会员查询。余额变动仍由余额服务负责。第一次用签名进入时在这里建账户。
 */
@Injectable()
export class MemberQueryService {
  constructor(
    @InjectRepository(MemberAccount)
    private readonly memberAccountRepository: Repository<MemberAccount>,
  ) {}

  /**
   * 按主键读取会员。
   */
  async findById(memberId: string): Promise<MemberAccount | null> {
    return this.memberAccountRepository.findOne({ where: { id: memberId } });
  }

  /**
   * 按聊天用户名读取余额账户。
   */
  async findByUsername(username: string): Promise<MemberAccount | null> {
    return this.memberAccountRepository.findOne({ where: { username } });
  }

  /**
   * 按聊天用户名读取余额的整数元。没有账户或已停用时返回 0，不新建账户。
   */
  async readBalanceYuan(username: string): Promise<number> {
    const memberAccount = await this.findByUsername(username);
    if (isEmpty(memberAccount) || memberAccount.status !== RecordStatus.ENABLED) {
      return NumberBoundary.ZERO;
    }
    return new Decimal(memberAccount.balance).trunc().toNumber();
  }

  /**
   * 按用户名拿到启用中的余额账户。没有就建一条余额为 0 的账户，并写入联系方式和昵称。
   * 多个请求同时进来时，唯一键只允许建成一条，后来的请求再查一次并补上联系方式和昵称。
   */
  async ensureEnabledByUsername(username: string, contact: string | null, nickname: string | null): Promise<MemberAccount> {
    // 1. 已有账户时同步联系方式和昵称。停用的不另建
    const existedMemberAccount = await this.findByUsername(username);
    if (isEmpty(existedMemberAccount) !== true) {
      const enabledMemberAccount = this.assertMemberEnabled(existedMemberAccount);
      const contactSyncedMemberAccount = await this.syncContact(enabledMemberAccount, contact);
      return this.syncNickname(contactSyncedMemberAccount, nickname);
    }
    // 2. 没有账户时插入。用户名、昵称、联系方式、余额 0、启用
    try {
      const memberAccount = new MemberAccount();
      memberAccount.username = username;
      memberAccount.nickname = nickname === null ? '' : nickname;
      memberAccount.contact = contact === null ? '' : contact;
      memberAccount.balance = toMoneyString(NumberBoundary.ZERO);
      memberAccount.status = RecordStatus.ENABLED;
      return await this.memberAccountRepository.save(memberAccount);
    } catch (error) {
      if (isDuplicateEntryError(error) !== true) {
        throw error;
      }
    }
    // 3. 唯一键冲突说明别的请求已经建成，再查一次并补上联系方式和昵称
    const createdMemberAccount = await this.findByUsername(username);
    if (isEmpty(createdMemberAccount)) {
      throw new UnauthorizedException('会员不存在或已停用');
    }
    const enabledMemberAccount = this.assertMemberEnabled(createdMemberAccount);
    const contactSyncedMemberAccount = await this.syncContact(enabledMemberAccount, contact);
    return this.syncNickname(contactSyncedMemberAccount, nickname);
  }

  /**
   * 签名里带了联系方式且和库里不同时更新。旧签名没有该字段时不覆盖。
   */
  private async syncContact(memberAccount: MemberAccount, contact: string | null): Promise<MemberAccount> {
    if (contact === null || memberAccount.contact === contact) {
      return memberAccount;
    }
    memberAccount.contact = contact;
    return this.memberAccountRepository.save(memberAccount);
  }

  /**
   * 签名里带了昵称且和库里不同时更新。旧签名没有该字段时不覆盖。
   */
  private async syncNickname(memberAccount: MemberAccount, nickname: string | null): Promise<MemberAccount> {
    if (nickname === null || memberAccount.nickname === nickname) {
      return memberAccount;
    }
    memberAccount.nickname = nickname;
    return this.memberAccountRepository.save(memberAccount);
  }

  /**
   * 停用账户拒绝进入。
   */
  private assertMemberEnabled(memberAccount: MemberAccount): MemberAccount {
    if (memberAccount.status !== RecordStatus.ENABLED) {
      throw new UnauthorizedException('会员不存在或已停用');
    }
    return memberAccount;
  }

  /**
   * 按主键批量读取会员，用于订单列表展示用户名。
   */
  async findByIdList(memberIdList: string[]): Promise<MemberAccount[]> {
    if (memberIdList.length === 0) {
      return [];
    }
    return this.memberAccountRepository.find({ where: { id: In(memberIdList) } });
  }

  /**
   * 按聊天用户资料写回昵称和联系方式。空字符串也会覆盖。账户不存在时拒绝。
   */
  async syncProfile(username: string, nickname: string, contact: string): Promise<ReturnType<MemberQueryService['toMemberView']>> {
    const memberAccount = await this.findByUsername(username);
    if (isEmpty(memberAccount)) {
      throw new BusinessException('会员不存在');
    }
    memberAccount.nickname = nickname;
    memberAccount.contact = contact;
    const savedMemberAccount = await this.memberAccountRepository.save(memberAccount);
    return this.toMemberView(savedMemberAccount);
  }

  /**
   * 后台按用户名分页查询。传入精确用户名时不再模糊匹配。余额集团通用，这里不做门店截断。
   */
  async pageMembers(keyword: string, username: string, pageValue: unknown, pageSizeValue: unknown): Promise<PageResult<MemberAccount>> {
    const pageResult = resolvePage(pageValue, pageSizeValue);
    const whereCondition = this.buildMemberWhere(keyword, username);
    const [list, total] = await this.memberAccountRepository.findAndCount({
      where: whereCondition,
      order: { id: 'DESC' },
      skip: pageResult.skip,
      take: pageResult.pageSize,
    });
    return {
      list,
      total,
      page: pageResult.page,
      pageSize: pageResult.pageSize,
    };
  }

  /**
   * 有精确用户名时只匹配这一条。否则按关键字模糊匹配用户名。
   */
  private buildMemberWhere(keyword: string, username: string): FindOptionsWhere<MemberAccount> | undefined {
    const cleanedUsername = username.trim();
    if (isEmpty(cleanedUsername) !== true) {
      return { username: cleanedUsername };
    }
    return this.buildKeywordWhere(keyword);
  }

  /**
   * 关键字匹配用户名。
   */
  private buildKeywordWhere(keyword: string): FindOptionsWhere<MemberAccount> | undefined {
    if (isEmpty(keyword)) {
      return undefined;
    }
    const cleanedKeyword = keyword.replace(/%/g, '').trim();
    if (isEmpty(cleanedKeyword)) {
      return undefined;
    }
    const likeKeyword = `%${cleanedKeyword}%`;
    return { username: Like(likeKeyword) };
  }

  /**
   * 把余额账户转换成对外展示字段。
   */
  toMemberView(memberAccount: MemberAccount): {
    memberId: string;
    username: string;
    nickname: string;
    contact: string;
    balance: string;
    status: string;
  } {
    return {
      memberId: toIdentifier(memberAccount.id),
      username: memberAccount.username,
      nickname: memberAccount.nickname,
      contact: memberAccount.contact,
      balance: memberAccount.balance,
      status: memberAccount.status,
    };
  }
}
