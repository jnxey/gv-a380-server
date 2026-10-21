import { Controller, Get, Query } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { ModuleCode, PermissionCode } from '../../common/constants';
import { PageQueryDto } from '../../common/dto/page-query.dto';
import { RequireModule, RequirePermission, RequiresShop } from '../../common/decorators/auth.decorators';
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
}

/**
 * 后台财务流水。只返回当前门店的数据。
 */
@Controller('admin/finance/bills')
@RequireModule(ModuleCode.CORE)
@RequiresShop()
export class FinanceBillController {
  constructor(private readonly financeBillService: FinanceBillService) {}

  /**
   * 分页查询当前门店财务流水。
   */
  @Get()
  @RequirePermission(PermissionCode.FINANCE_BILL_QUERY)
  pageBills(@Query() financeBillQueryDto: FinanceBillQueryDto) {
    return this.financeBillService.pageBills(
      financeBillQueryDto.bizType || '',
      financeBillQueryDto.keyword || '',
      financeBillQueryDto.page,
      financeBillQueryDto.pageSize,
    );
  }
}
