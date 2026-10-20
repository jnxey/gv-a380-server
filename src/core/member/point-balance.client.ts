import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Decimal from 'decimal.js';
import { MerchantAuthService } from '../../common/merchant-auth/merchant-auth.service';
import { BusinessException } from '../../common/exceptions/business.exception';
import { isNumber, isObject } from '../../common/tools';

/** 积分服务按账号查当前余额的路径。 */
const PointBalanceApi = {
  PATH: '/api/v1/ledger-member-points/current-balance',
  DEFAULT_BASE_URL: 'http://127.0.0.1:3300',
  SUCCESS_CODE: 1000,
  TIMEOUT_MILLISECONDS: 10000,
} as const;

/**
 * 向积分服务查询积分账号余额。
 */
@Injectable()
export class PointBalanceClient {
  constructor(
    private readonly configService: ConfigService,
    private readonly merchantAuthService: MerchantAuthService,
  ) {}

  /**
   * 按积分账号读取整数余额。没有这个账号时积分服务返回 0。连不上或被拒绝时失败。
   */
  async readPointBalance(account: string): Promise<number> {
    const requestUrl = `${this.readBaseUrl()}${PointBalanceApi.PATH}?account=${encodeURIComponent(account)}`;
    const signHeaders = this.merchantAuthService.createGetSignHeaders(PointBalanceApi.PATH, { account });
    const abortController = new AbortController();
    const timer = setTimeout(() => abortController.abort(), PointBalanceApi.TIMEOUT_MILLISECONDS);
    let upstreamResponse: Response;
    try {
      upstreamResponse = await fetch(requestUrl, {
        method: 'GET',
        headers: signHeaders,
        signal: abortController.signal,
      });
    } catch {
      throw new BusinessException('积分服务暂时不可用');
    } finally {
      clearTimeout(timer);
    }
    const responseBody: unknown = await upstreamResponse.json().catch(() => null);
    return this.readPointYuan(responseBody);
  }

  /**
   * 从积分服务的成功响应里取出整数余额。
   */
  private readPointYuan(responseBody: unknown): number {
    if (!isObject(responseBody) || responseBody.code !== PointBalanceApi.SUCCESS_CODE || !isObject(responseBody.data)) {
      throw new BusinessException('积分服务暂时不可用');
    }
    const balance = responseBody.data.balance;
    if (isNumber(balance) !== true) {
      throw new BusinessException('积分服务暂时不可用');
    }
    return new Decimal(balance as Decimal.Value).trunc().toNumber();
  }

  /**
   * 积分服务根地址。没配时用本地默认端口。
   */
  private readBaseUrl(): string {
    const configuredBaseUrl = this.configService.get<string>('POINT_SERVER_BASE_URL');
    const baseUrl = configuredBaseUrl && configuredBaseUrl.trim() !== '' ? configuredBaseUrl.trim() : PointBalanceApi.DEFAULT_BASE_URL;
    return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  }
}
