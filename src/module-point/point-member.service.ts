import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createCipheriv, createHash, randomBytes } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { AesGcmSetting } from '../common/constants';
import { BusinessException } from '../common/exceptions/business.exception';
import { isEmpty } from '../common/tools';
import { PointMemberEntity } from './entities/point-member';
import { PointDatabase, PointMemberStatus, PointMerchantResponse } from './point.constants';

/**
 * 积分侧会员校验：查 gv_admin.member 明文密码，并签发积分账号密文。
 */
@Injectable()
export class PointMemberService {
  constructor(
    @InjectRepository(PointMemberEntity, PointDatabase.CONNECTION_NAME)
    private readonly pointMemberRepository: Repository<PointMemberEntity>,
    private readonly configService: ConfigService,
  ) {}

  /**
   * 校验会员号和密码，返回积分账号及供聊天绑定用的密文。
   */
  async verifyMember(memberAccount: string, password: string): Promise<{
    member_id: number;
    member_account: string;
    points_account: string;
    points_account_cipher: string;
  }> {
    const cleanedMemberAccount = memberAccount.trim();
    if (isEmpty(cleanedMemberAccount)) {
      throw new BusinessException('会员号不能为空');
    }
    const memberRow = await this.pointMemberRepository.findOne({
      where: { account: cleanedMemberAccount },
      select: ['id', 'account', 'password', 'status', 'pointsAccount'],
    });
    if (isEmpty(memberRow)) {
      throw new BusinessException('会员号或密码错误');
    }
    if (memberRow.status !== PointMemberStatus.NORMAL) {
      throw new BusinessException('会员已停用');
    }
    const storedPassword = isEmpty(memberRow.password) ? '' : memberRow.password;
    const requestPassword = isEmpty(password) ? '' : password;
    if (storedPassword !== requestPassword) {
      throw new BusinessException('会员号或密码错误');
    }
    const pointsAccount = isEmpty(memberRow.pointsAccount) ? '' : memberRow.pointsAccount;
    if (isEmpty(pointsAccount)) {
      throw new BusinessException('会员未绑定积分账号');
    }
    return {
      member_id: memberRow.id,
      member_account: memberRow.account,
      points_account: pointsAccount,
      points_account_cipher: this.encryptPointsAccount(pointsAccount),
    };
  }

  /**
   * 组装商家成功响应。
   */
  wrapMerchantSuccess<T>(data: T) {
    return {
      code: PointMerchantResponse.SUCCESS_CODE,
      msg: PointMerchantResponse.SUCCESS_MESSAGE,
      data,
    };
  }

  /**
   * 用与聊天服务相同的 AES 密钥加密积分账号，供绑定密文接口使用。
   */
  private encryptPointsAccount(pointsAccount: string): string {
    const aesSecret = this.configService.get<string>('APP_CRYPTO_AES_SECRET');
    if (isEmpty(aesSecret)) {
      throw new BusinessException('加密密钥未配置');
    }
    const aesKey = createHash('sha256').update(aesSecret, 'utf8').digest();
    const plaintext = JSON.stringify({
      cot: pointsAccount,
      tsp: Date.now(),
    });
    const initializationVector = randomBytes(AesGcmSetting.IV_LENGTH);
    const cipher = createCipheriv('aes-256-gcm', aesKey, initializationVector);
    const cipherBytes = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authenticationTag = cipher.getAuthTag();
    return Buffer.concat([initializationVector, cipherBytes, authenticationTag]).toString('base64');
  }
}
