import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { MerchantAuthService } from './merchant-auth.service';

/**
 * 商家 HMAC 守卫。用在跳过登录令牌、但仍要核对聊天服务签名的接口上。
 */
@Injectable()
export class MerchantAuthGuard implements CanActivate {
  constructor(private readonly merchantAuthService: MerchantAuthService) {}

  /**
   * 签名通过才放行。
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    await this.merchantAuthService.verify(request);
    return true;
  }
}
