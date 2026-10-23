import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthorizationScheme, MiniappSignType } from '../../common/constants';
import { MiniappSignService } from '../../common/crypto/miniapp-sign.service';
import { BusinessException } from '../../common/exceptions/business.exception';
import { isEmpty, isObject } from '../../common/tools';

/** 聊天服务按联系方式查用户的路径。 */
const ChatUserApiPath = {
  PROFILE: '/api/users/a380/profile',
} as const;

/** 访问聊天服务时的 HTTP 状态。 */
const UpstreamHttpStatus = {
  OK: 200,
  NOT_FOUND: 404,
} as const;

/** 聊天服务请求超时毫秒数。 */
const ChatUserRequestTimeout = {
  MILLISECONDS: 10000,
} as const;

/**
 * 聊天服务返回的用户资料。
 */
export interface ChatUserProfile {
  username: string;
  nickname: string;
  phone: string;
  email: string;
  avatar: string;
  signature: string;
  status: string;
  /** 聊天用户已绑定的积分账号。未绑定时为空字符串。 */
  pointAccount: string;
}

/**
 * 用 5 分钟令牌向聊天服务查询用户。
 */
@Injectable()
export class ChatUserClient {
  constructor(
    private readonly configService: ConfigService,
    private readonly miniappSignService: MiniappSignService,
  ) {}

  /**
   * 按用户名、手机号或邮箱取一条聊天用户资料。没有这个人时拒绝。
   */
  async findByKeyword(keyword: string): Promise<ChatUserProfile> {
    // 1. 用公用密钥把查询词签成 5 分钟令牌
    const cipherText = this.miniappSignService.createServiceToken(keyword, MiniappSignType.USER_QUERY);
    const profileUrl = `${this.readChatServerBaseUrl()}${ChatUserApiPath.PROFILE}`;
    // 2. 带上令牌请求聊天服务
    const abortController = new AbortController();
    const timer = setTimeout(() => abortController.abort(), ChatUserRequestTimeout.MILLISECONDS);
    let upstreamResponse: Response;
    try {
      upstreamResponse = await fetch(profileUrl, {
        method: 'GET',
        headers: {
          Authorization: `${AuthorizationScheme.BEARER} ${cipherText}`,
        },
        signal: abortController.signal,
      });
    } catch {
      throw new BusinessException('聊天服务暂时不可用');
    } finally {
      clearTimeout(timer);
    }
    // 3. 没有这个人，或服务没有正常返回
    if (upstreamResponse.status === UpstreamHttpStatus.NOT_FOUND) {
      throw new BusinessException('未找到该用户');
    }
    if (upstreamResponse.status !== UpstreamHttpStatus.OK) {
      throw new BusinessException('聊天服务暂时不可用');
    }
    const responseBody: unknown = await upstreamResponse.json().catch(() => null);
    return this.readChatUserProfile(responseBody);
  }

  /**
   * 联系方式只留一个。有手机号用手机号，否则用邮箱。都没有时给空字符串。
   */
  resolveContact(phone: string, email: string): string {
    if (isEmpty(phone) !== true) {
      return phone;
    }
    if (isEmpty(email) !== true) {
      return email;
    }
    return '';
  }

  /**
   * 读取聊天服务根地址。没配置时拒绝，不把地址写进错误信息。
   */
  private readChatServerBaseUrl(): string {
    const baseUrl = this.configService.get<string>('CHAT_SERVER_BASE_URL');
    if (isEmpty(baseUrl)) {
      throw new BusinessException('聊天服务未配置');
    }
    if (baseUrl.endsWith('/')) {
      return baseUrl.slice(0, -1);
    }
    return baseUrl;
  }

  /**
   * 核对聊天服务返回的用户资料。缺用户名时按服务不可用拒绝。
   */
  private readChatUserProfile(responseBody: unknown): ChatUserProfile {
    if (isObject(responseBody) !== true) {
      throw new BusinessException('聊天服务暂时不可用');
    }
    const username = responseBody.username;
    if (typeof username !== 'string' || isEmpty(username)) {
      throw new BusinessException('聊天服务暂时不可用');
    }
    return {
      username,
      nickname: this.readTextField(responseBody.nickname),
      phone: this.readTextField(responseBody.phone),
      email: this.readTextField(responseBody.email),
      avatar: this.readTextField(responseBody.avatar),
      signature: this.readTextField(responseBody.signature),
      status: this.readTextField(responseBody.status),
      pointAccount: this.readTextField(responseBody.point_account),
    };
  }

  /**
   * 文本字段不是字符串时给空字符串。
   */
  private readTextField(value: unknown): string {
    if (typeof value !== 'string') {
      return '';
    }
    return value;
  }
}
