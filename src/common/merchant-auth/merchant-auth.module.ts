import { Module } from '@nestjs/common';
import { MerchantAuthGuard } from './merchant-auth.guard';
import { MerchantAuthService } from './merchant-auth.service';

/**
 * 商家验签。供对外查询接口核对聊天服务发出的 HMAC。
 */
@Module({
  providers: [MerchantAuthService, MerchantAuthGuard],
  exports: [MerchantAuthGuard, MerchantAuthService],
})
export class MerchantAuthModule {}
