import { ForbiddenException, Inject, Injectable, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import Decimal from 'decimal.js';
import { Between, FindOptionsWhere, In, MoreThanOrEqual, Not, Repository } from 'typeorm';
import { FinanceBizType, FinanceDirection, PageSetting } from '../../common/constants';
import { BusinessException } from '../../common/exceptions/business.exception';
import { PageResult } from '../../common/interfaces/page-result';
import { isEmpty, isOneOf, resolvePage, toIdentifier, toMoneyString } from '../../common/tools';
import { ChatUserClient } from '../member/chat-user.client';
import { MemberQueryService } from '../member/member-query.service';
import { SysUser } from '../rbac/sys.entities';
import { ShopService } from '../shop/shop.service';
import { FinanceBill } from './finance-bill.entity';

/** 查询日期必须是 YYYY-MM-DD。 */
const BillDateTextPattern = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 一个门店在所选条件下的收入和支出。
 */
export interface FinanceBillShopSummary {
  shopId: string;
  shopName: string;
  inAmount: string;
  outAmount: string;
}

/**
 * 门店汇总和全部合计。
 */
export interface FinanceBillSummaryResult {
  list: FinanceBillShopSummary[];
  inAmount: string;
  outAmount: string;
}

/**
 * 财务流水只读查询。写流水只发生在会员余额服务里。
 */
@Injectable()
export class FinanceBillService {
  constructor(
    @InjectRepository(FinanceBill)
    private readonly financeBillRepository: Repository<FinanceBill>,
    @InjectRepository(SysUser)
    private readonly sysUserRepository: Repository<SysUser>,
    @Inject(forwardRef(() => MemberQueryService))
    private readonly memberQueryService: MemberQueryService,
    @Inject(forwardRef(() => ChatUserClient))
    private readonly chatUserClient: ChatUserClient,
    private readonly shopService: ShopService,
  ) {}

  /**
   * 分页查询已绑定门店的流水。关键字可再限定到一个会员。
   */
  async pageBills(
    boundShopIdList: string[],
    shopId: string,
    bizType: string,
    keyword: string,
    startDate: string,
    endDate: string,
    pageValue: unknown,
    pageSizeValue: unknown,
    excludedBizType = '',
  ): Promise<PageResult<FinanceBill>> {
    if (!isEmpty(bizType) && !isOneOf(bizType, Object.values(FinanceBizType))) {
      throw new BusinessException('流水类型不正确');
    }
    if (!isEmpty(excludedBizType) && !isOneOf(excludedBizType, Object.values(FinanceBizType))) {
      throw new BusinessException('流水类型不正确');
    }
    const pageResult = resolvePage(pageValue, pageSizeValue);
    const shopIdList = this.resolveBillShopIdList(boundShopIdList, shopId);
    const billTimeRange = this.resolveBillTimeRange(startDate, endDate);
    if (isEmpty(bizType) !== true && bizType === excludedBizType) {
      return {
        list: [],
        total: 0,
        page: pageResult.page,
        pageSize: pageResult.pageSize,
      };
    }
    const whereCondition: FindOptionsWhere<FinanceBill> = { shopId: In(shopIdList) };
    if (isEmpty(bizType) !== true) {
      whereCondition.bizType = bizType;
    } else if (isEmpty(excludedBizType) !== true) {
      whereCondition.bizType = Not(excludedBizType);
    }
    if (isEmpty(billTimeRange) !== true) {
      whereCondition.createdAt = Between(billTimeRange.startAt, billTimeRange.endAt);
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
    // 3. 补用户名、门店名和操作人。没有会员、门店或操作人时对应名称为空
    const list = await this.attachBillDisplayFields(billList);
    return {
      list,
      total,
      page: pageResult.page,
      pageSize: pageResult.pageSize,
    };
  }

  /**
   * 按当前筛选条件列出财务流水，供导出。超过上限时直接失败。
   */
  async listBillsForExport(
    boundShopIdList: string[],
    shopId: string,
    bizType: string,
    keyword: string,
    startDate: string,
    endDate: string,
    excludedBizType = '',
  ): Promise<{ list: Array<FinanceBill & { username: string; shopName: string; operatorName: string }> }> {
    if (!isEmpty(bizType) && !isOneOf(bizType, Object.values(FinanceBizType))) {
      throw new BusinessException('流水类型不正确');
    }
    if (!isEmpty(excludedBizType) && !isOneOf(excludedBizType, Object.values(FinanceBizType))) {
      throw new BusinessException('流水类型不正确');
    }
    const shopIdList = this.resolveBillShopIdList(boundShopIdList, shopId);
    const billTimeRange = this.resolveBillTimeRange(startDate, endDate);
    if (isEmpty(bizType) !== true && bizType === excludedBizType) {
      return { list: [] };
    }
    const whereCondition: FindOptionsWhere<FinanceBill> = { shopId: In(shopIdList) };
    if (isEmpty(bizType) !== true) {
      whereCondition.bizType = bizType;
    } else if (isEmpty(excludedBizType) !== true) {
      whereCondition.bizType = Not(excludedBizType);
    }
    if (isEmpty(billTimeRange) !== true) {
      whereCondition.createdAt = Between(billTimeRange.startAt, billTimeRange.endAt);
    }
    // 1. 有关键字时按用户名、手机号或邮箱解析到会员。没有会员账户时返回空列表
    const cleanedKeyword = isEmpty(keyword) ? '' : keyword.trim();
    if (isEmpty(cleanedKeyword) !== true) {
      const chatUserProfile = await this.chatUserClient.findByKeyword(cleanedKeyword);
      const memberAccount = await this.memberQueryService.findByUsername(chatUserProfile.username);
      if (isEmpty(memberAccount)) {
        return { list: [] };
      }
      whereCondition.memberId = toIdentifier(memberAccount.id);
    }
    // 2. 先数总数，超过导出上限就拒绝
    const total = await this.financeBillRepository.count({ where: whereCondition });
    if (total > PageSetting.FINANCE_BILL_EXPORT_MAX) {
      throw new BusinessException(`导出不能超过 ${PageSetting.FINANCE_BILL_EXPORT_MAX} 条，请缩小时间范围或筛选条件`);
    }
    // 3. 查出全部符合条件的流水并补展示字段
    const billList = await this.financeBillRepository.find({
      where: whereCondition,
      order: { id: 'DESC' },
      take: PageSetting.FINANCE_BILL_EXPORT_MAX,
    });
    const list = await this.attachBillDisplayFields(billList);
    return { list };
  }

  /**
   * 给流水补用户名、门店名和操作人姓名。
   */
  private async attachBillDisplayFields(
    billList: FinanceBill[],
  ): Promise<Array<FinanceBill & { username: string; shopName: string; operatorName: string }>> {
    const memberIdList = billList.map((financeBill) => toIdentifier(financeBill.memberId));
    const memberAccountList = await this.memberQueryService.findByIdList(memberIdList);
    const usernameByMemberId = new Map<string, string>();
    for (const memberAccount of memberAccountList) {
      usernameByMemberId.set(toIdentifier(memberAccount.id), memberAccount.username);
    }
    const shopIdOnPageList = billList.map((financeBill) => toIdentifier(financeBill.shopId));
    const shopList = await this.shopService.findByIdList(shopIdOnPageList);
    const shopNameByShopId = new Map<string, string>();
    for (const shop of shopList) {
      shopNameByShopId.set(toIdentifier(shop.id), shop.shopName);
    }
    // 1. 收集有操作人的账号，再查姓名；没有真实姓名时用登录名
    const operatorIdList: string[] = [];
    for (const financeBill of billList) {
      if (isEmpty(financeBill.operatorId)) {
        continue;
      }
      operatorIdList.push(toIdentifier(financeBill.operatorId));
    }
    const operatorNameById = new Map<string, string>();
    if (isEmpty(operatorIdList) !== true) {
      const operatorList = await this.sysUserRepository.find({
        where: { id: In(operatorIdList) },
      });
      for (const operator of operatorList) {
        const operatorName = isEmpty(operator.realName) ? operator.username : operator.realName;
        operatorNameById.set(toIdentifier(operator.id), operatorName);
      }
    }
    return billList.map((financeBill) => {
      const username = usernameByMemberId.get(toIdentifier(financeBill.memberId));
      const shopName = shopNameByShopId.get(toIdentifier(financeBill.shopId));
      const operatorName = isEmpty(financeBill.operatorId) ? '' : operatorNameById.get(toIdentifier(financeBill.operatorId));
      return {
        ...financeBill,
        username: isEmpty(username) ? '' : username,
        shopName: isEmpty(shopName) ? '' : shopName,
        operatorName: isEmpty(operatorName) ? '' : operatorName,
      };
    });
  }

  /**
   * 按门店汇总收入和支出。没有流水的门店也返回，金额为 0.00。
   * 传入关键字时与明细一样限定到该会员；没有会员账户时汇总全 0。
   */
  async summarizeBills(
    boundShopIdList: string[],
    shopId: string,
    bizType: string,
    startDate: string,
    endDate: string,
    excludedBizType = '',
    keyword = '',
  ): Promise<FinanceBillSummaryResult> {
    if (!isEmpty(bizType) && !isOneOf(bizType, Object.values(FinanceBizType))) {
      throw new BusinessException('流水类型不正确');
    }
    if (!isEmpty(excludedBizType) && !isOneOf(excludedBizType, Object.values(FinanceBizType))) {
      throw new BusinessException('流水类型不正确');
    }
    const shopIdList = this.resolveBillShopIdList(boundShopIdList, shopId);
    const billTimeRange = this.resolveBillTimeRange(startDate, endDate);
    // 1. 有关键字时按用户名、手机号或邮箱解析到会员。没有会员账户时汇总为 0
    let memberIdFilter = '';
    const cleanedKeyword = isEmpty(keyword) ? '' : keyword.trim();
    if (isEmpty(cleanedKeyword) !== true) {
      const chatUserProfile = await this.chatUserClient.findByKeyword(cleanedKeyword);
      const memberAccount = await this.memberQueryService.findByUsername(chatUserProfile.username);
      if (isEmpty(memberAccount)) {
        return this.buildEmptySummary(shopIdList);
      }
      memberIdFilter = toIdentifier(memberAccount.id);
    }
    // 2. 按门店和方向求和
    const queryBuilder = this.financeBillRepository
      .createQueryBuilder('financeBill')
      .select('financeBill.shopId', 'shopId')
      .addSelect('financeBill.direction', 'direction')
      .addSelect('SUM(financeBill.amount)', 'totalAmount')
      .where('financeBill.shopId IN (:...shopIdList)', { shopIdList });
    if (isEmpty(memberIdFilter) !== true) {
      queryBuilder.andWhere('financeBill.memberId = :memberId', { memberId: memberIdFilter });
    }
    if (isEmpty(bizType) !== true && bizType !== excludedBizType) {
      queryBuilder.andWhere('financeBill.bizType = :bizType', { bizType });
    }
    if (isEmpty(excludedBizType) !== true) {
      queryBuilder.andWhere('financeBill.bizType <> :excludedBizType', { excludedBizType });
    }
    if (isEmpty(billTimeRange) !== true) {
      queryBuilder.andWhere('financeBill.createdAt >= :startAt', { startAt: billTimeRange.startAt });
      queryBuilder.andWhere('financeBill.createdAt <= :endAt', { endAt: billTimeRange.endAt });
    }
    const rawRowList = await queryBuilder.groupBy('financeBill.shopId').addGroupBy('financeBill.direction').getRawMany();
    // 3. 每个门店都留一行，并算出全部合计
    const amountByShopId = new Map<string, { inAmount: Decimal; outAmount: Decimal }>();
    for (const rawRow of rawRowList) {
      const rawShopId = toIdentifier(rawRow.shopId);
      const existingShopAmount = amountByShopId.get(rawShopId);
      const shopAmount = isEmpty(existingShopAmount) ? { inAmount: new Decimal(0), outAmount: new Decimal(0) } : existingShopAmount;
      const totalAmountText = rawRow.totalAmount;
      const totalAmount = isEmpty(totalAmountText) ? new Decimal(0) : new Decimal(String(totalAmountText));
      if (rawRow.direction === FinanceDirection.IN) {
        shopAmount.inAmount = shopAmount.inAmount.plus(totalAmount);
      }
      if (rawRow.direction === FinanceDirection.OUT) {
        shopAmount.outAmount = shopAmount.outAmount.plus(totalAmount);
      }
      amountByShopId.set(rawShopId, shopAmount);
    }
    return this.buildSummaryResult(shopIdList, amountByShopId);
  }

  /**
   * 没有会员账户时，各门店收入支出都返回 0.00。
   */
  private async buildEmptySummary(shopIdList: string[]): Promise<FinanceBillSummaryResult> {
    return this.buildSummaryResult(shopIdList, new Map());
  }

  /**
   * 按门店金额表组装汇总结果，并补上门店名称。
   */
  private async buildSummaryResult(
    shopIdList: string[],
    amountByShopId: Map<string, { inAmount: Decimal; outAmount: Decimal }>,
  ): Promise<FinanceBillSummaryResult> {
    const shopList = await this.shopService.findByIdList(shopIdList);
    const shopNameByShopId = new Map<string, string>();
    for (const shop of shopList) {
      shopNameByShopId.set(toIdentifier(shop.id), shop.shopName);
    }
    let totalInAmount = new Decimal(0);
    let totalOutAmount = new Decimal(0);
    const list = shopIdList.map((boundShopId) => {
      const existingShopAmount = amountByShopId.get(boundShopId);
      const shopAmount = isEmpty(existingShopAmount) ? { inAmount: new Decimal(0), outAmount: new Decimal(0) } : existingShopAmount;
      totalInAmount = totalInAmount.plus(shopAmount.inAmount);
      totalOutAmount = totalOutAmount.plus(shopAmount.outAmount);
      const shopName = shopNameByShopId.get(boundShopId);
      return {
        shopId: boundShopId,
        shopName: isEmpty(shopName) ? '' : shopName,
        inAmount: toMoneyString(shopAmount.inAmount),
        outAmount: toMoneyString(shopAmount.outAmount),
      };
    });
    return {
      list,
      inAmount: toMoneyString(totalInAmount),
      outAmount: toMoneyString(totalOutAmount),
    };
  }

  /**
   * 确定本次可查的门店。未选门店时用全部绑定门店，选了就必须在绑定列表里。
   */
  private resolveBillShopIdList(boundShopIdList: string[], shopId: string): string[] {
    if (isEmpty(boundShopIdList)) {
      throw new ForbiddenException('当前账号未绑定门店');
    }
    const cleanedShopId = isEmpty(shopId) ? '' : toIdentifier(shopId);
    if (isEmpty(cleanedShopId)) {
      return boundShopIdList.map((boundShopId) => toIdentifier(boundShopId));
    }
    const matchedShopId = boundShopIdList.find((boundShopId) => toIdentifier(boundShopId) === cleanedShopId);
    if (isEmpty(matchedShopId)) {
      throw new ForbiddenException('无权访问该门店');
    }
    return [toIdentifier(matchedShopId)];
  }

  /**
   * 把开始、结束日期收成当天的起止时间。都不传则不限时间。
   */
  private resolveBillTimeRange(startDate: string, endDate: string): { startAt: string; endAt: string } | null {
    const cleanedStartDate = isEmpty(startDate) ? '' : startDate.trim();
    const cleanedEndDate = isEmpty(endDate) ? '' : endDate.trim();
    if (isEmpty(cleanedStartDate) && isEmpty(cleanedEndDate)) {
      return null;
    }
    if (isEmpty(cleanedStartDate) || isEmpty(cleanedEndDate)) {
      throw new BusinessException('请选择完整的时间范围');
    }
    if (BillDateTextPattern.test(cleanedStartDate) !== true || BillDateTextPattern.test(cleanedEndDate) !== true) {
      throw new BusinessException('时间范围不正确');
    }
    if (cleanedEndDate < cleanedStartDate) {
      throw new BusinessException('结束日期不能早于开始日期');
    }
    return {
      startAt: `${cleanedStartDate} 00:00:00`,
      endAt: `${cleanedEndDate} 23:59:59`,
    };
  }

  /**
   * 查询当前门店最近的到账流水。不传类型时仍是 KTV 店内消费和扫码付款。门店条件由数据权限过滤器自动追加。
   */
  async listRecentPaymentNotices(bizTypeList?: string[]): Promise<FinanceBill[]> {
    const noticeBizTypeList = isEmpty(bizTypeList) ? [FinanceBizType.KTV_IN_STORE, FinanceBizType.SHOP_SCAN_PAY] : bizTypeList;
    for (const bizType of noticeBizTypeList) {
      if (isOneOf(bizType, Object.values(FinanceBizType)) !== true) {
        throw new BusinessException('流水类型不正确');
      }
    }
    return this.financeBillRepository.find({
      where: { bizType: In(noticeBizTypeList) },
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

  /**
   * 取付款码发出之后，该会员最新的一笔充值、店内消费或商铺会员付款。没有则返回空。
   */
  async findLatestPayRechargeBill(memberId: string, sinceAt: string): Promise<FinanceBill | null> {
    if (isEmpty(memberId) || isEmpty(sinceAt)) {
      return null;
    }
    return this.financeBillRepository.findOne({
      where: {
        memberId,
        bizType: In([
          FinanceBizType.RECHARGE,
          FinanceBizType.KTV_IN_STORE,
          FinanceBizType.HOTEL_IN_STORE,
          FinanceBizType.STORE_SALE,
        ]),
        createdAt: MoreThanOrEqual(sinceAt),
      },
      order: { createdAt: 'DESC', id: 'DESC' },
    });
  }
}
