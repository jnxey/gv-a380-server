import { BadRequestException } from '@nestjs/common';

/**
 * 业务规则不满足时抛出的异常，例如余额不足、状态不允许。
 */
export class BusinessException extends BadRequestException {
  /**
   * 使用中文提示创建业务异常。
   */
  constructor(message: string) {
    super(message);
  }
}
