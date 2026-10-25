/**
 * 积分模块用到的库连接名、表名和业务常量。
 */
export const PointDatabase = {
  CONNECTION_NAME: 'point',
} as const;

export const PointLedgerTable = {
  BASE: 'ledger_member_points',
  BIND: '_bind_ledger_member_points',
  MEMBER: 'member',
  SHARD_PREFIX: 'zzs_',
} as const;

export const PointLedgerDirection = {
  INCREASE: '1',
  DECREASE: '2',
} as const;

/** 下单抵扣与取消退回使用的积分流水业务类型。 */
export const PointBizType = {
  CONSUME: '601',
  CONSUME_REFUND: '602',
} as const;

export const PointMemberStatus = {
  NORMAL: '1',
  DISABLED: '2',
} as const;

export const PointMerchantResponse = {
  SUCCESS_CODE: 1000,
  SUCCESS_MESSAGE: 'ok',
} as const;

/**
 * 积分流水业务类型文案，供小程序明细展示。
 */
export const PointBizTypeLabel: Record<string, string> = {
  '98': '手工单', // 投注赢
  '99': '手工单', // 投注输
  '100': '手工单修改', // 投注变更
  '601': '积分消费',
  '602': '消费退回',
  '603': '酒店预订',
  '604': '商城预订',
  '605': '车队预订',
  '606': '积分转出',
  '607': '积分转入',
  '608': '积分过期',
  '609': '平台酒店',
  '610': '平台KTV',
  '611': '平台酒吧',
  '612': '平台台球',
  '613': '平台餐饮',
  '614': '平台外卖',
  '615': '平台闪购',
  '616': '平台足疗',
  '617': '平台机票',
  '618': '平台出行',
};
