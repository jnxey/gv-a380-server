import { Controller, Get, Query } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { ModuleCode, PermissionCode } from '../../common/constants';
import { CurrentAccount } from '../../common/decorators/current-account.decorator';
import { PageQueryDto } from '../../common/dto/page-query.dto';
import { RequireModule, RequirePermission } from '../../common/decorators/auth.decorators';
import { LoginAccountContext } from '../../common/interfaces/login-account-context';
import { FinanceBillService } from './finance-bill.service';

/**
 * 财务流水查询参数。
 */
export class FinanceBillQueryDto extends PageQueryDto {
  @IsOptional()
  @IsString()
  bizType?: string;

  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsString()
  shopId?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;
}

/**
 * 后台财务流水。只返回账号已绑定门店的数据。
 */
@Controller('admin/finance/bills')
@RequireModule(ModuleCode.CORE)
export class FinanceBillController {
  constructor(private readonly financeBillService: FinanceBillService) {}

  /**
   * 按门店汇总收入和支出。关键字与明细一致，限定到该会员。
   */
  @Get('summary')
  @RequirePermission(PermissionCode.FINANCE_BILL_QUERY)
  summarizeBills(@Query() financeBillQueryDto: FinanceBillQueryDto, @CurrentAccount() loginAccountContext: LoginAccountContext) {
    return this.financeBillService.summarizeBills(
      loginAccountContext.boundShopIdList,
      financeBillQueryDto.shopId || '',
      financeBillQueryDto.bizType || '',
      financeBillQueryDto.startDate || '',
      financeBillQueryDto.endDate || '',
      '',
      financeBillQueryDto.keyword || '',
    );
  }

  /**
   * 按当前筛选条件导出财务流水。不分页，有条数上限。
   */
  @Get('export')
  @RequirePermission(PermissionCode.FINANCE_BILL_QUERY)
  exportBills(@Query() financeBillQueryDto: FinanceBillQueryDto, @CurrentAccount() loginAccountContext: LoginAccountContext) {
    return this.financeBillService.listBillsForExport(
      loginAccountContext.boundShopIdList,
      financeBillQueryDto.shopId || '',
      financeBillQueryDto.bizType || '',
      financeBillQueryDto.keyword || '',
      financeBillQueryDto.startDate || '',
      financeBillQueryDto.endDate || '',
    );
  }

  /**
   * 分页查询已绑定门店的财务流水。
   */
  @Get()
  @RequirePermission(PermissionCode.FINANCE_BILL_QUERY)
  pageBills(@Query() financeBillQueryDto: FinanceBillQueryDto, @CurrentAccount() loginAccountContext: LoginAccountContext) {
    return this.financeBillService.pageBills(
      loginAccountContext.boundShopIdList,
      financeBillQueryDto.shopId || '',
      financeBillQueryDto.bizType || '',
      financeBillQueryDto.keyword || '',
      financeBillQueryDto.startDate || '',
      financeBillQueryDto.endDate || '',
      financeBillQueryDto.page,
      financeBillQueryDto.pageSize,
    );
  }
}
