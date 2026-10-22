import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BusinessException } from '../../common/exceptions/business.exception';
import { isEmpty, isNumber } from '../../common/tools';

/**
 * 积分记账用的简易雪花 ID（秒级时间戳 + worker + 序号）。
 */
@Injectable()
export class PointSnowflakeService {
  private currentSecondKey = 0;
  private sequence = 1;
  private readonly workerId: string;

  constructor(private readonly configService: ConfigService) {
    const configuredWorkerId = this.configService.get<string>('POINT_WORKER_ID');
    this.workerId = isEmpty(configuredWorkerId) ? '8' : configuredWorkerId;
  }

  /**
   * 生成下一个 ledger_id。
   */
  nextId(): string {
    const now = new Date();
    const secondKey = Number(
      `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`,
    );
    if (secondKey < this.currentSecondKey) {
      throw new BusinessException('系统时间回拨，请联系管理员');
    }
    if (secondKey > this.currentSecondKey) {
      this.currentSecondKey = secondKey;
      this.sequence = 1;
    } else {
      this.sequence += 1;
      if (this.sequence > 999) {
        throw new BusinessException('请求过于频繁，请稍后再试');
      }
    }
    const randomDigit = Math.floor(Math.random() * 10);
    return `${secondKey}${this.workerId}${randomDigit}${String(this.sequence).padStart(3, '0')}`;
  }

  /**
   * 从 ledger_id 前 14 位解析出 Unix 秒。
   */
  parseUnixSeconds(ledgerId: string): number {
    if (isEmpty(ledgerId) || ledgerId.length < 14) {
      return Math.floor(Date.now() / 1000);
    }
    const yearText = ledgerId.slice(0, 4);
    const monthText = ledgerId.slice(4, 6);
    const dayText = ledgerId.slice(6, 8);
    const hourText = ledgerId.slice(8, 10);
    const minuteText = ledgerId.slice(10, 12);
    const secondText = ledgerId.slice(12, 14);
    if (
      isNumber(yearText) !== true ||
      isNumber(monthText) !== true ||
      isNumber(dayText) !== true ||
      isNumber(hourText) !== true ||
      isNumber(minuteText) !== true ||
      isNumber(secondText) !== true
    ) {
      return Math.floor(Date.now() / 1000);
    }
    const createdAt = new Date(
      Number(yearText),
      Number(monthText) - 1,
      Number(dayText),
      Number(hourText),
      Number(minuteText),
      Number(secondText),
    );
    return Math.floor(createdAt.getTime() / 1000);
  }
}
