import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, In, Like, Repository } from 'typeorm';
import { PageResult } from '../../common/interfaces/page-result';
import { isEmpty, resolvePage, toIdentifier } from '../../common/tools';
import { MemberAccount } from './member-account.entity';

/**
 * 会员只读查询。不负责改余额。
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
   * 按会员号读取会员。小程序身份签名里的用户名对应会员号。
   */
  async findByMemberNo(memberNo: string): Promise<MemberAccount | null> {
    return this.memberAccountRepository.findOne({ where: { memberNo } });
  }

  /**
   * 按主键批量读取会员，用于订单列表展示姓名。
   */
  async findByIdList(memberIdList: string[]): Promise<MemberAccount[]> {
    if (memberIdList.length === 0) {
      return [];
    }
    return this.memberAccountRepository.find({ where: { id: In(memberIdList) } });
  }

  /**
   * 后台按手机号、会员号或姓名分页查询。会员余额集团通用，这里不做门店截断。
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
   * 关键字同时匹配手机号、会员号和姓名。
   */
  private buildKeywordWhere(keyword: string): FindOptionsWhere<MemberAccount>[] | undefined {
    if (isEmpty(keyword)) {
      return undefined;
    }
    const cleanedKeyword = keyword.replace(/%/g, '').trim();
    if (isEmpty(cleanedKeyword)) {
      return undefined;
    }
    const likeKeyword = `%${cleanedKeyword}%`;
    return [{ mobile: Like(likeKeyword) }, { memberNo: Like(likeKeyword) }, { memberName: Like(likeKeyword) }];
  }

  /**
   * 把会员转换成对外展示字段，避免把内部对象原样散落。
   */
  toMemberView(memberAccount: MemberAccount): {
    memberId: string;
    memberNo: string;
    memberName: string;
    mobile: string;
    balance: string;
    points: number;
    status: string;
    shopId: string;
  } {
    return {
      memberId: toIdentifier(memberAccount.id),
      memberNo: memberAccount.memberNo,
      memberName: memberAccount.memberName,
      mobile: memberAccount.mobile,
      balance: memberAccount.balance,
      points: memberAccount.points,
      status: memberAccount.status,
      shopId: toIdentifier(memberAccount.shopId),
    };
  }
}
