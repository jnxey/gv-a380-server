import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FinanceBizType } from '../../common/constants';
import { BusinessException } from '../../common/exceptions/business.exception';
import { PageResult } from '../../common/interfaces/page-result';
import { isEmpty, isOneOf, resolvePage } from '../../common/tools';
import { FinanceBill } from './finance-bill.entity';

/**
 * 财务流水只读查询。写流水只发生在会员余额服务里。
 */
@Injectable()
export class FinanceBillService {
  constructor(
    @InjectRepository(FinanceBill)
    private readonly financeBillRepository: Repository<FinanceBill>,
  ) {}

  /**
   * 分页查询当前门店流水。门店条件由数据权限过滤器自动追加。
   */
  async pageBills(bizType: string, pageValue: unknown, pageSizeValue: unknown): Promise<PageResult<FinanceBill>> {
    if (!isEmpty(bizType) && !isOneOf(bizType, Object.values(FinanceBizType))) {
      throw new BusinessException('流水类型不正确');
    }
    const pageResult = resolvePage(pageValue, pageSizeValue);
    const whereCondition = isEmpty(bizType) ? {} : { bizType };
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
