import Decimal from 'decimal.js';
import { MoneyScale, TimeSpan, StayRule, BusinessNoRule, PageSetting, MysqlErrorCode } from '../constants';

/**
 * 判断值是否为空。null、undefined、空白字符串、空数组视为空。
 */
export function isEmpty(value: unknown): value is null | undefined | '' {
  if (value === null || value === undefined) {
    return true;
  }
  if (typeof value === 'string' && value.trim() === '') {
    return true;
  }
  if (Array.isArray(value) && value.length === 0) {
    return true;
  }
  return false;
}

/**
 * 判断值是否为有限数字，或可转换为有限数字的非空字符串。
 */
export function isNumber(value: unknown): boolean {
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  if (typeof value === 'string' && value.trim() !== '') {
    return Number.isFinite(Number(value));
  }
  return false;
}

/**
 * 判断值是否为普通对象。
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  if (value === null || value === undefined) {
    return false;
  }
  if (Array.isArray(value)) {
    return false;
  }
  return typeof value === 'object';
}

/**
 * 把主键或外键统一成字符串，便于全等比较。
 */
export function toIdentifier(value: unknown): string {
  if (isEmpty(value)) {
    return '';
  }
  return String(value);
}

/**
 * 判断金额是否为大于 0 的数字。
 */
export function isPositiveMoney(value: unknown): boolean {
  if (!isNumber(value)) {
    return false;
  }
  const amount = new Decimal(value as Decimal.Value);
  return amount.isFinite() && amount.greaterThan(0);
}

/**
 * 把金额格式化为两位小数字符串。
 */
export function toMoneyString(value: Decimal.Value): string {
  return new Decimal(value).toDecimalPlaces(MoneyScale.AMOUNT, Decimal.ROUND_HALF_UP).toFixed(MoneyScale.AMOUNT);
}

/**
 * 按消费金额计算应增加的积分。不足 1 元不计积分。
 */
export function calculateEarnedPoints(amount: Decimal.Value, earnPerYuan: number): number {
  const earnedPoints = new Decimal(amount).floor().times(earnPerYuan);
  return earnedPoints.toNumber();
}

/**
 * 计算入住晚数。同一天按最少 1 晚计费。
 */
export function calculateNightCount(checkInDateText: string, checkOutDateText: string): number {
  const checkInTime = Date.parse(`${checkInDateText.slice(0, 10)}T00:00:00+08:00`);
  const checkOutTime = Date.parse(`${checkOutDateText.slice(0, 10)}T00:00:00+08:00`);
  const dayCount = Math.round((checkOutTime - checkInTime) / TimeSpan.MILLISECONDS_PER_DAY);
  if (dayCount < StayRule.MIN_NIGHT_COUNT) {
    return StayRule.MIN_NIGHT_COUNT;
  }
  return dayCount;
}

/**
 * 格式化为上海时区日期，形如 2026-10-15。
 */
export function formatShanghaiDate(date: Date): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date);
}

/**
 * 格式化为上海时区日期时间，形如 2026-10-15 12:00:00。
 */
export function formatShanghaiDateTime(date: Date): string {
  const dateText = formatShanghaiDate(date);
  const timeFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  return `${dateText} ${timeFormatter.format(date)}`;
}

/**
 * 生成业务单号。
 */
export function createBusinessNo(prefix: string): string {
  const timeText = formatShanghaiDateTime(new Date()).replace(/[-: ]/g, '');
  const randomNumber = Math.floor(Math.random() * BusinessNoRule.RANDOM_UPPER);
  const randomText = String(randomNumber).padStart(BusinessNoRule.RANDOM_LENGTH, '0');
  return `${prefix}${timeText}${randomText}`;
}

/**
 * 生成 6 位数字核销码。
 */
export function createVerifyCode(): string {
  const randomNumber = Math.floor(Math.random() * BusinessNoRule.RANDOM_UPPER);
  return String(randomNumber).padStart(BusinessNoRule.RANDOM_LENGTH, '0');
}

/**
 * 判断字符串是否等于候选列表中的某一项。
 */
export function isOneOf(value: string, candidateList: readonly string[]): boolean {
  return candidateList.some((candidate) => candidate === value);
}

/**
 * 判断是否为 MySQL 唯一键冲突。
 */
export function isDuplicateEntryError(error: unknown): boolean {
  if (!isObject(error)) {
    return false;
  }
  const queryError = error as { code?: string; driverError?: { code?: string } };
  if (queryError.code === MysqlErrorCode.DUPLICATE_ENTRY) {
    return true;
  }
  const driverError = queryError.driverError;
  if (isObject(driverError) && driverError.code === MysqlErrorCode.DUPLICATE_ENTRY) {
    return true;
  }
  return false;
}

/**
 * 解析分页参数，超出上限时截断。
 */
export function resolvePage(pageValue: unknown, pageSizeValue: unknown): { page: number; pageSize: number; skip: number } {
  const page = isNumber(pageValue) ? Number(pageValue) : PageSetting.DEFAULT_PAGE;
  let pageSize = isNumber(pageSizeValue) ? Number(pageSizeValue) : PageSetting.DEFAULT_PAGE_SIZE;
  const safePage = page < PageSetting.DEFAULT_PAGE ? PageSetting.DEFAULT_PAGE : page;
  if (pageSize < PageSetting.DEFAULT_PAGE) {
    pageSize = PageSetting.DEFAULT_PAGE_SIZE;
  }
  if (pageSize > PageSetting.MAX_PAGE_SIZE) {
    pageSize = PageSetting.MAX_PAGE_SIZE;
  }
  const skip = (safePage - 1) * pageSize;
  return { page: safePage, pageSize, skip };
}
