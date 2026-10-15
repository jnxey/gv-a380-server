import { Global, Injectable, Module, OnModuleInit } from '@nestjs/common';
import { registerShopScopeQueryFilter } from './shop-scope.query';

/**
 * 应用启动后安装门店 SQL 过滤器，只执行一次。
 */
@Injectable()
export class ShopScopeRegistrar implements OnModuleInit {
  /**
   * 安装 QueryBuilder 门店条件注入。
   */
  onModuleInit(): void {
    registerShopScopeQueryFilter();
  }
}

@Global()
@Module({
  providers: [ShopScopeRegistrar],
  exports: [ShopScopeRegistrar],
})
export class ShopScopeModule {}
