import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import Redis from 'ioredis';
import { MerchantAuthHeader, MerchantAuthSetting, RedisKey, RedisValue } from '../constants';
import { BusinessException } from '../exceptions/business.exception';
import { REDIS_CLIENT } from '../redis/redis.module';
import { isEmpty } from '../tools';

/**
 * 规范化 query 时的分隔符。与聊天服务生成签名时一致。
 */
const MerchantAuthQueryMark = {
  PAIR_SEPARATOR: '&',
  KEY_VALUE_SEPARATOR: '=',
  ARRAY_SEPARATOR: ',',
  LINE_SEPARATOR: '\n',
} as const;

/**
 * 发给积分服务的签名头。对方不区分大小写。
 */
const MerchantAuthOutboundHeader = {
  APP_ID: 'X-App-Id',
  TIMESTAMP: 'X-Timestamp',
  NONCE: 'X-Nonce',
  SIGN: 'X-Sign',
} as const;

/**
 * 核对聊天服务发出的商家 HMAC。只验 6 行签名，不追加账号行。
 */
@Injectable()
export class MerchantAuthService {
  constructor(
    private readonly configService: ConfigService,
    @Inject(REDIS_CLIENT)
    private readonly redisClient: Redis,
  ) {}

  /**
   * 为对外的 GET 生成 6 行商家签名头。凭证没配时拒绝。
   */
  createGetSignHeaders(requestPath: string, queryRecord: Record<string, string>): Record<string, string> {
    const appId = this.configService.get<string>('MERCHANT_AUTH_APP_ID');
    const appSecret = this.configService.get<string>('MERCHANT_AUTH_APP_SECRET');
    if (isEmpty(appId) || isEmpty(appSecret)) {
      throw new BusinessException('积分服务暂时不可用');
    }
    const timestampText = String(Math.floor(Date.now() / 1000));
    const nonceText = randomBytes(MerchantAuthSetting.NONCE_BYTE_LENGTH).toString('hex');
    const canonicalQuery = this.buildCanonicalQueryString(queryRecord);
    const lineList = ['GET', requestPath, canonicalQuery, MerchantAuthSetting.EMPTY_BODY_SHA256, timestampText, nonceText];
    const signHex = createHmac('sha256', appSecret).update(lineList.join(MerchantAuthQueryMark.LINE_SEPARATOR), 'utf8').digest('hex');
    return {
      [MerchantAuthOutboundHeader.APP_ID]: appId,
      [MerchantAuthOutboundHeader.TIMESTAMP]: timestampText,
      [MerchantAuthOutboundHeader.NONCE]: nonceText,
      [MerchantAuthOutboundHeader.SIGN]: signHex,
    };
  }

  /**
   * 核对 AppId、时间戳、签名，并把本次 Nonce 写入 Redis。失败一律拒绝。
   */
  async verify(request: Request): Promise<void> {
    const appId = this.configService.get<string>('MERCHANT_AUTH_APP_ID');
    const appSecret = this.configService.get<string>('MERCHANT_AUTH_APP_SECRET');
    if (isEmpty(appId) || isEmpty(appSecret)) {
      throw new UnauthorizedException('签名无效');
    }
    const headerAppId = this.readHeader(request, MerchantAuthHeader.APP_ID);
    const headerTimestamp = this.readHeader(request, MerchantAuthHeader.TIMESTAMP);
    const headerNonce = this.readHeader(request, MerchantAuthHeader.NONCE);
    const headerSign = this.readHeader(request, MerchantAuthHeader.SIGN);
    if (isEmpty(headerAppId) || headerAppId !== appId) {
      throw new UnauthorizedException('签名无效');
    }
    if (isEmpty(headerTimestamp) || this.isTimestampFresh(headerTimestamp) !== true) {
      throw new UnauthorizedException('签名无效');
    }
    if (this.isNonceLengthValid(headerNonce) !== true) {
      throw new UnauthorizedException('签名无效');
    }
    if (headerSign.length !== MerchantAuthSetting.SIGN_HEX_LENGTH) {
      throw new UnauthorizedException('签名无效');
    }
    const signContent = this.buildSignContent(request, headerTimestamp, headerNonce);
    const expectedSign = createHmac('sha256', appSecret).update(signContent, 'utf8').digest('hex');
    if (this.isSameSign(expectedSign, headerSign.toLowerCase()) !== true) {
      throw new UnauthorizedException('签名无效');
    }
    await this.rememberNonce(headerAppId, headerNonce);
  }

  /**
   * 读取单个请求头。多个同名头只取第一个。
   */
  private readHeader(request: Request, headerName: string): string {
    const headerValue = request.headers[headerName];
    if (Array.isArray(headerValue)) {
      return headerValue[0] || '';
    }
    if (typeof headerValue === 'string') {
      return headerValue;
    }
    return '';
  }

  /**
   * 时间戳必须是秒级整数，并且与当前时间相差不超过允许窗口。
   */
  private isTimestampFresh(headerTimestamp: string): boolean {
    if (/^\d+$/.test(headerTimestamp) !== true) {
      return false;
    }
    const timestampSeconds = Number(headerTimestamp);
    if (Number.isSafeInteger(timestampSeconds) !== true) {
      return false;
    }
    const nowSeconds = Math.floor(Date.now() / 1000);
    const elapsedSeconds = Math.abs(nowSeconds - timestampSeconds);
    return elapsedSeconds <= MerchantAuthSetting.TIMESTAMP_TOLERANCE_SECONDS;
  }

  /**
   * Nonce 长度落在文档要求的 8 到 64。
   */
  private isNonceLengthValid(headerNonce: string): boolean {
    if (isEmpty(headerNonce)) {
      return false;
    }
    return headerNonce.length >= MerchantAuthSetting.NONCE_MIN_LENGTH && headerNonce.length <= MerchantAuthSetting.NONCE_MAX_LENGTH;
  }

  /**
   * 组装 6 行待签名字符串。GET 的 body 固定用空串哈希。
   */
  private buildSignContent(request: Request, headerTimestamp: string, headerNonce: string): string {
    const canonicalQuery = this.buildCanonicalQueryString(request.query as Record<string, unknown>);
    const lineList = [
      request.method.toUpperCase(),
      request.path,
      canonicalQuery,
      MerchantAuthSetting.EMPTY_BODY_SHA256,
      headerTimestamp,
      headerNonce,
    ];
    return lineList.join(MerchantAuthQueryMark.LINE_SEPARATOR);
  }

  /**
   * 参数名按字典序拼接。空值不参与签名，值用 encodeURIComponent。
   */
  private buildCanonicalQueryString(queryRecord: Record<string, unknown>): string {
    const sortedKeyList = Object.keys(queryRecord).sort();
    if (sortedKeyList.length > MerchantAuthSetting.QUERY_KEY_MAX_COUNT) {
      throw new UnauthorizedException('签名无效');
    }
    const pairList: string[] = [];
    for (const queryKey of sortedKeyList) {
      if (queryKey.length === 0 || queryKey.length > MerchantAuthSetting.QUERY_KEY_MAX_LENGTH) {
        throw new UnauthorizedException('签名无效');
      }
      const queryValue = queryRecord[queryKey];
      if (queryValue === null || queryValue === undefined || queryValue === '') {
        continue;
      }
      const canonicalValue = this.resolveCanonicalQueryValue(queryValue);
      if (canonicalValue.length > MerchantAuthSetting.QUERY_VALUE_MAX_LENGTH) {
        throw new UnauthorizedException('签名无效');
      }
      pairList.push(`${queryKey}${MerchantAuthQueryMark.KEY_VALUE_SEPARATOR}${encodeURIComponent(canonicalValue)}`);
    }
    return pairList.join(MerchantAuthQueryMark.PAIR_SEPARATOR);
  }

  /**
   * 把一个非空 query 值变成编码前的文本。对象不能参与签名。
   */
  private resolveCanonicalQueryValue(queryValue: unknown): string {
    if (typeof queryValue === 'string' || typeof queryValue === 'boolean') {
      return String(queryValue);
    }
    if (typeof queryValue === 'number') {
      if (Number.isFinite(queryValue) !== true) {
        throw new UnauthorizedException('签名无效');
      }
      return String(queryValue);
    }
    if (Array.isArray(queryValue)) {
      const itemTextList: string[] = [];
      for (const queryItem of queryValue) {
        if (typeof queryItem === 'string' || typeof queryItem === 'boolean') {
          itemTextList.push(String(queryItem));
          continue;
        }
        if (typeof queryItem === 'number' && Number.isFinite(queryItem)) {
          itemTextList.push(String(queryItem));
          continue;
        }
        throw new UnauthorizedException('签名无效');
      }
      return itemTextList.join(MerchantAuthQueryMark.ARRAY_SEPARATOR);
    }
    throw new UnauthorizedException('签名无效');
  }

  /**
   * 比较两段等长十六进制签名。长度不同直接视为不一致。
   */
  private isSameSign(expectedSign: string, actualSign: string): boolean {
    const expectedBuffer = Buffer.from(expectedSign, 'utf8');
    const actualBuffer = Buffer.from(actualSign, 'utf8');
    if (expectedBuffer.length !== actualBuffer.length) {
      return false;
    }
    return timingSafeEqual(expectedBuffer, actualBuffer);
  }

  /**
   * 签名通过后占用 Nonce。同一 Nonce 在时间窗口内不能再用。
   */
  private async rememberNonce(headerAppId: string, headerNonce: string): Promise<void> {
    const nonceKey = `${RedisKey.MERCHANT_NONCE_PREFIX}${headerAppId}:${headerNonce}`;
    const stored = await this.redisClient.set(
      nonceKey,
      RedisValue.BLACKLISTED,
      'EX',
      MerchantAuthSetting.TIMESTAMP_TOLERANCE_SECONDS,
      'NX',
    );
    if (stored !== 'OK') {
      throw new UnauthorizedException('签名无效');
    }
  }
}
