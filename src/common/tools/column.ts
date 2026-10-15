import { isEmpty, toMoneyString } from './index';

/**
 * DECIMAL 列与字符串金额互转，避免使用浮点。
 */
export const decimalTransformer = {
  /**
   * 写入数据库前格式化为两位小数。
   */
  to(value: string | null): string | null {
    if (isEmpty(value)) {
      return null;
    }
    return toMoneyString(value);
  },
  /**
   * 从数据库读出后仍保持两位小数字符串。
   */
  from(value: string | null): string {
    if (isEmpty(value)) {
      return toMoneyString('0');
    }
    return toMoneyString(value);
  },
};
