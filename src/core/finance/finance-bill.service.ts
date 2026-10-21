import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { FinanceBizType, PageSetting } from '../../common/constants';
import { BusinessException } from '../../common/exceptions/business.exception';
import { PageResult } from '../../common/interfaces/page-result';
import { isEmpty, isOneOf, resolvePage, toIdentifier } from '../../common/tools';
import { ChatUserClient } from '../member/chat-user.client';
import { MemberQueryService } from '../member/member-query.service';
import { FinanceBill } from './finance-bill.entity';

/**
 * 财务流水只读查询。写流水只发生在会员余额服务里。
 */
@Injectable()
export class FinanceBillService {
  constructor(
    @InjectRepository(FinanceBill)
    private readonly financeBillRepository: Repository<FinanceBill>,
    @Inject(forwardRef(() => MemberQueryService))
    private readonly memberQueryService: MemberQueryService,
    @Inject(forwardRef(() => ChatUserClient))
    private readonly chatUserClient: ChatUserClient,
  ) {}

  /**
   * 分页查询当前门店流水。门店条件由数据权限过滤器自动追加。
   */
  async pageBills(bizType: string, keyword: string, pageValue: unknown, pageSizeValue: unknown): Promise<PageResult<FinanceBill>> {
    if (!isEmpty(bizType) && !isOneOf(bizType, Object.values(FinanceBizType))) {
      throw new BusinessException('流水类型不正确');
    }
    const pageResult = resolvePage(pageValue, pageSizeValue);
    const whereCondition: { bizType?: string; memberId?: string } = {};
    if (isEmpty(bizType) !== true) {
      whereCondition.bizType = bizType;
    }
    // 1. 有关键字时按用户名、手机号或邮箱解析到会员。没有会员账户时返回空页
    const cleanedKeyword = isEmpty(keyword) ? '' : keyword.trim();
    if (isEmpty(cleanedKeyword) !== true) {
      const chatUserProfile = await this.chatUserClient.findByKeyword(cleanedKeyword);
      const memberAccount = await this.memberQueryService.findByUsername(chatUserProfile.username);
      if (isEmpty(memberAccount)) {
        return {
          list: [],
          total: 0,
          page: pageResult.page,
          pageSize: pageResult.pageSize,
        };
      }
      whereCondition.memberId = toIdentifier(memberAccount.id);
    }
    // 2. 查出本页流水
    const [billList, total] = await this.financeBillRepository.findAndCount({
      where: whereCondition,
      order: { id: 'DESC' },
      skip: pageResult.skip,
      take: pageResult.pageSize,
    });
    // 3. 用会员主键补用户名，没有会员时用户名为空
    const memberIdList = billList.map((financeBill) => toIdentifier(financeBill.memberId));
    const memberAccountList = await this.memberQueryService.findByIdList(memberIdList);
    const usernameByMemberId = new Map<string, string>();
    for (const memberAccount of memberAccountList) {
      usernameByMemberId.set(toIdentifier(memberAccount.id), memberAccount.username);
    }
    const list = billList.map((financeBill) => {
      const username = usernameByMemberId.get(toIdentifier(financeBill.memberId));
      return {
        ...financeBill,
        username: isEmpty(username) ? '' : username,
      };
    });
    return {
      list,
      total,
      page: pageResult.page,
      pageSize: pageResult.pageSize,
    };
  }

  /**
   * 查询当前门店最近的店内消费和扫码付款。门店条件由数据权限过滤器自动追加。
   */
  async listRecentPaymentNotices(): Promise<FinanceBill[]> {
    return this.financeBillRepository.find({
      where: { bizType: In([FinanceBizType.KTV_IN_STORE, FinanceBizType.SHOP_SCAN_PAY]) },
      order: { id: 'DESC' },
      take: PageSetting.PAYMENT_NOTICE_SIZE,
    });
  }

  /**
   * 分页查询某个会员的流水。供小程序会员中心使用，按会员主键限定，不按后台门店绑定过滤。
   */
  async pageMemberBills(memberId: string, bizType: string, pageValue: unknown, pageSizeValue: unknown): Promise<PageResult<FinanceBill>> {
    if (!isEmpty(bizType) && !isOneOf(bizType, Object.values(FinanceBizType))) {
      throw new BusinessException('流水类型不正确');
    }
    const pageResult = resolvePage(pageValue, pageSizeValue);
    const whereCondition: { memberId: string; bizType?: string } = { memberId };
    if (!isEmpty(bizType)) {
      whereCondition.bizType = bizType;
    }
    const [list, total] = await this.financeBillRepository.findAndCount({
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
}
