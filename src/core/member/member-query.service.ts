import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, In, Like, Repository } from 'typeorm';
import { NumberBoundary, RecordStatus } from '../../common/constants';
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
   * 按用户名拿到启用中的余额账户。没有就建一条余额为 0 的账户，并写入联系方式。
   * 多个请求同时进来时，唯一键只允许建成一条，后来的请求再查一次并补上联系方式。
   */
  async ensureEnabledByUsername(username: string, contact: string | null): Promise<MemberAccount> {
    // 1. 已有账户时同步联系方式。停用的不另建
    const existedMemberAccount = await this.findByUsername(username);
    if (isEmpty(existedMemberAccount) !== true) {
      return this.syncContact(this.assertMemberEnabled(existedMemberAccount), contact);
    }
    // 2. 没有账户时插入。用户名、联系方式、余额 0、启用
    try {
      const memberAccount = new MemberAccount();
      memberAccount.username = username;
      memberAccount.contact = contact === null ? '' : contact;
      memberAccount.balance = toMoneyString(NumberBoundary.ZERO);
      memberAccount.status = RecordStatus.ENABLED;
      return await this.memberAccountRepository.save(memberAccount);
    } catch (error) {
      if (isDuplicateEntryError(error) !== true) {
        throw error;
      }
    }
    // 3. 唯一键冲突说明别的请求已经建成，再查一次并补上联系方式
    const createdMemberAccount = await this.findByUsername(username);
    if (isEmpty(createdMemberAccount)) {
      throw new UnauthorizedException('会员不存在或已停用');
    }
    return this.syncContact(this.assertMemberEnabled(createdMemberAccount), contact);
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
   * 后台按用户名分页查询。余额集团通用，这里不做门店截断。
   */
  async pageMembers(keyword: string, pageValue: unknown, pageSizeValue: unknown): Promise<PageResult<MemberAccount>> {
    const pageResult = resolvePage(pageValue, pageSizeValue);
    const whereCondition = this.buildKeywordWhere(keyword);
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
    contact: string;
    balance: string;
    status: string;
  } {
    return {
      memberId: toIdentifier(memberAccount.id),
      username: memberAccount.username,
      contact: memberAccount.contact,
      balance: memberAccount.balance,
      status: memberAccount.status,
    };
  }
}
