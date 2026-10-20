import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { AesGcmSetting, MiniappSignField, MiniappSignType } from '../constants';
import { BusinessException } from '../exceptions/business.exception';
import { isEmpty, isNumber, isObject } from '../tools';

/** 付款二维码时间戳允许偏离的毫秒数，和聊天服务签发时限一致。 */
const PAY_QR_MAX_SKEW_MILLISECONDS = 5 * 60 * 1000;

/** 公司服务集群公用 AES 密钥。与聊天服务端使用同一项。 */
const APP_CRYPTO_AES_SECRET = 'APP_CRYPTO_AES_SECRET';

/**
 * 解开后的小程序身份签名。用户名对应会员号，过期时间是毫秒时间戳。
 */
export interface MiniappSignContent {
  username: string;
  expireAtMilliseconds: number;
  contact: string | null;
  nickname: string | null;
}

/**
 * 解密聊天 App 签发的小程序身份签名。
 */
@Injectable()
export class MiniappSignService {
  constructor(private readonly configService: ConfigService) {}

  /**
   * 解密身份签名，并核对类型和过期时间。
   * 失败时按未登录拒绝，不返回明文。
   */
  readMiniappSign(cipherText: string): MiniappSignContent {
    // 1. 解开密文。解不开时按登录失效拒绝
    const decryptedText = this.decryptCipherText(cipherText);
    let parsedPayload: unknown;
    try {
      parsedPayload = JSON.parse(decryptedText);
    } catch (error) {
      throw new UnauthorizedException('登录已失效');
    }
    if (isObject(parsedPayload) !== true) {
      throw new UnauthorizedException('登录已失效');
    }
    const signPayload = parsedPayload as Record<string, unknown>;
    // 2. 类型必须是小程序身份签名
    if (signPayload.type !== MiniappSignType.MINIAPP_SIGN) {
      throw new UnauthorizedException('登录已失效');
    }
    // 3. 用户名不能为空，过期时间必须晚于当前毫秒时间
    const username = signPayload.cot;
    if (typeof username !== 'string' || isEmpty(username)) {
      throw new UnauthorizedException('登录已失效');
    }
    const expireAtMilliseconds = signPayload.exp;
    if (isNumber(expireAtMilliseconds) !== true) {
      throw new UnauthorizedException('登录已失效');
    }
    const expireAt = Number(expireAtMilliseconds);
    const serverNowMilliseconds = Date.now();
    if (expireAt <= serverNowMilliseconds) {
      throw new UnauthorizedException('登录已失效');
    }
    // 4. 旧签名没有联系方式时留空，避免覆盖已经保存的值
    const contactText = signPayload[MiniappSignField.CONTACT];
    const contact = typeof contactText === 'string' ? contactText : null;
    // 5. 旧签名没有昵称时留空，避免覆盖已经保存的值
    const nicknameText = signPayload[MiniappSignField.NICKNAME];
    const nickname = typeof nicknameText === 'string' ? nicknameText : null;
    return {
      username,
      expireAtMilliseconds: expireAt,
      contact,
      nickname,
    };
  }

  /**
   * 解开付款/充值二维码，返回里面的用户名。
   * 类型必须是付款码，时间戳偏离超过 5 分钟算无效。解不开时不返回明文。
   */
  readPayRechargeUsername(cipherText: string): string {
    let decryptedText = '';
    try {
      decryptedText = this.decryptCipherText(cipherText);
    } catch {
      throw new BusinessException('二维码无效');
    }
    let parsedPayload: unknown;
    try {
      parsedPayload = JSON.parse(decryptedText);
    } catch {
      throw new BusinessException('二维码无效');
    }
    if (isObject(parsedPayload) !== true) {
      throw new BusinessException('二维码无效');
    }
    if (parsedPayload.type !== MiniappSignType.PAY_RECHARGE) {
      throw new BusinessException('二维码无效');
    }
    const username = parsedPayload.cot;
    if (typeof username !== 'string' || isEmpty(username)) {
      throw new BusinessException('二维码无效');
    }
    const timestamp = parsedPayload.tsp;
    if (!isNumber(timestamp)) {
      throw new BusinessException('二维码无效');
    }
    if (Math.abs(Date.now() - Number(timestamp)) > PAY_QR_MAX_SKEW_MILLISECONDS) {
      throw new BusinessException('二维码无效');
    }
    return username;
  }

  /**
   * 解开安全密钥校验密文，返回里面的用户名。
   * 类型必须是安全密钥，时间戳偏离超过 5 分钟算无效。解不开时不返回明文。
   */
  readConsumerDoorLockUsername(cipherText: string): string {
    let decryptedText = '';
    try {
      decryptedText = this.decryptCipherText(cipherText);
    } catch {
      throw new BusinessException('安全密钥无效');
    }
    let parsedPayload: unknown;
    try {
      parsedPayload = JSON.parse(decryptedText);
    } catch {
      throw new BusinessException('安全密钥无效');
    }
    if (isObject(parsedPayload) !== true) {
      throw new BusinessException('安全密钥无效');
    }
    if (parsedPayload.type !== MiniappSignType.CONSUMER_DOOR_LOCK) {
      throw new BusinessException('安全密钥无效');
    }
    const username = parsedPayload.cot;
    if (typeof username !== 'string' || isEmpty(username)) {
      throw new BusinessException('安全密钥无效');
    }
    const timestamp = parsedPayload.tsp;
    if (!isNumber(timestamp)) {
      throw new BusinessException('安全密钥无效');
    }
    if (Math.abs(Date.now() - Number(timestamp)) > PAY_QR_MAX_SKEW_MILLISECONDS) {
      throw new BusinessException('安全密钥无效');
    }
    return username;
  }

  /**
   * 签发一张发给聊天服务的查询令牌。
   * 明文含类型、查询词和当前毫秒时间。聊天服务只接受 5 分钟内的令牌。
   */
  createServiceToken(content: string, signType: string): string {
    // 1. 类型、查询词和时间戳写进同一段明文
    const plaintext = JSON.stringify({
      type: signType,
      cot: content,
      tsp: Date.now(),
    });
    // 2. 按 IV、密文、认证标签拼成 Base64
    const initializationVector = randomBytes(AesGcmSetting.IV_LENGTH);
    const cipher = createCipheriv('aes-256-gcm', this.readAesKey(), initializationVector);
    const cipherBytes = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authenticationTag = cipher.getAuthTag();
    return Buffer.concat([initializationVector, cipherBytes, authenticationTag]).toString('base64');
  }

  /**
   * 用公用 AES 密钥解开 Base64 密文。
   * 布局是 12 字节 IV、密文、16 字节认证标签。
   */
  private decryptCipherText(cipherText: string): string {
    try {
      // 1. 按 IV、密文、认证标签拆开
      const packedBytes = Buffer.from(cipherText, 'base64');
      if (packedBytes.length < AesGcmSetting.IV_LENGTH + AesGcmSetting.TAG_LENGTH) {
        throw new Error('cipher text is too short');
      }
      const initializationVector = packedBytes.subarray(0, AesGcmSetting.IV_LENGTH);
      const authenticationTag = packedBytes.subarray(packedBytes.length - AesGcmSetting.TAG_LENGTH);
      const cipherBytes = packedBytes.subarray(AesGcmSetting.IV_LENGTH, packedBytes.length - AesGcmSetting.TAG_LENGTH);
      // 2. 用派生密钥解密
      const decipher = createDecipheriv('aes-256-gcm', this.readAesKey(), initializationVector);
      decipher.setAuthTag(authenticationTag);
      return Buffer.concat([decipher.update(cipherBytes), decipher.final()]).toString('utf8');
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('登录已失效');
    }
  }

  /**
   * 读取公用密钥，并派生 AES-256 要用的 32 字节。
   * 没配置时按登录失效拒绝，避免把密钥内容写进错误信息。
   */
  private readAesKey(): Buffer {
    const aesSecret = this.configService.get<string>(APP_CRYPTO_AES_SECRET);
    if (isEmpty(aesSecret)) {
      throw new UnauthorizedException('登录已失效');
    }
    return createHash('sha256').update(aesSecret, 'utf8').digest();
  }
}
