import { CallHandler, ExecutionContext, ForbiddenException, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { isShopTypeMatched } from '../auth/access-rule';
import { AccountType, MetadataKey, ModuleCode, RequestHeaderName } from '../constants';
import { ShopContext } from '../context/shop-context';
import { isEmpty, toIdentifier } from '../tools';
import { ShopService } from '../../core/shop/shop.service';
import { AuthenticatedRequest } from '../guards/jwt-auth.guard';

/**
 * 解析当前门店并写入上下文。
 * 只接受用户绑定列表中的门店，忽略请求体里的 shop_id。
 */
@Injectable()
export class ShopScopeInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly shopService: ShopService,
  ) {}

  /**
   * 有 @RequiresShop() 时校验门店绑定和门店类型，再执行业务。
   */
  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const requiresShop = this.reflector.getAllAndOverride<boolean>(MetadataKey.REQUIRES_SHOP, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (requiresShop !== true) {
      return next.handle();
    }
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const loginAccountContext = request.loginAccountContext;
    // 1. 只有后台账号存在门店绑定
    if (isEmpty(loginAccountContext) || loginAccountContext.accountType !== AccountType.SYS_USER) {
      throw new ForbiddenException('当前账号不能访问门店数据');
    }
    // 2. 请求头里的门店必须在绑定列表中；单门店账号可以不传
    const currentShopId = this.resolveCurrentShopId(request, loginAccountContext.boundShopIdList);
    // 3. 门店必须存在。停用门店仍可被管理员查看，但业务线必须和门店类型一致
    const shop = await this.shopService.findById(currentShopId);
    const requiredModuleCode = this.reflector.getAllAndOverride<string>(MetadataKey.REQUIRE_MODULE, [
      context.getHandler(),
      context.getClass(),
    ]);
    const moduleCode = isEmpty(requiredModuleCode) ? ModuleCode.CORE : requiredModuleCode;
    if (isShopTypeMatched(shop.shopType, moduleCode) !== true) {
      throw new ForbiddenException('当前门店不能访问该业务');
    }
    // 4. 后续查询只认这个门店 ID
    return ShopContext.run(currentShopId, () => next.handle());
  }

  /**
   * 从绑定门店中确定本次请求的门店，不采用请求体中的门店参数。
   */
  private resolveCurrentShopId(request: AuthenticatedRequest, boundShopIdList: string[]): string {
    if (boundShopIdList.length === 0) {
      throw new ForbiddenException('当前账号未绑定门店');
    }
    const headerShopId = request.headers[RequestHeaderName.SHOP_ID];
    const headerShopIdText = Array.isArray(headerShopId) ? headerShopId[0] : headerShopId;
    if (isEmpty(headerShopIdText)) {
      if (boundShopIdList.length === 1) {
        return boundShopIdList[0];
      }
      throw new ForbiddenException('请选择门店');
    }
    const normalizedHeaderShopId = toIdentifier(headerShopIdText);
    const matchedShopId = boundShopIdList.find((boundShopId) => boundShopId === normalizedHeaderShopId);
    if (isEmpty(matchedShopId)) {
      throw new ForbiddenException('无权访问该门店');
    }
    return matchedShopId;
  }
}
