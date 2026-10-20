'use strict';

/**
 * 商家积分 API 调用示例（Node.js）。
 * 演示：查余额、流水分页（含翻页）、创建记账。
 *
 * 用法：node docs/merchant-sdk/nodejs/merchant-api-example.cjs
 */

const { MerchantHmacClient } = require('./merchant-hmac-client.cjs');

const BASE_URL = process.env.MERCHANT_BASE_URL || 'http://127.0.0.1:8001';
const APP_ID = process.env.MERCHANT_APP_ID || 'demo_merchant_001';
const APP_SECRET = process.env.MERCHANT_APP_SECRET || 'demo_secret_change_me_before_prod';
const POINTS_ACCOUNT = process.env.MERCHANT_POINTS_ACCOUNT || 'your_points_account_here';

const PATH_CURRENT_BALANCE = '/api/v1/ledger-member-points/current-balance';
const PATH_FIND_PAGER = '/api/v1/ledger-member-points/find-pager';
const PATH_CREATE = '/api/v1/ledger-member-points/create';

/** direction：增加 */
const LEDGER_DIRECTION_INCREASE = '1';

/** biz_type：柜机消费 */
const BIZ_TYPE_POINTS_EXPENSE = '601';

async function demoCurrentBalance(client) {
  const result = await client.get(PATH_CURRENT_BALANCE, { account: POINTS_ACCOUNT });
  console.log('[current-balance]', JSON.stringify(result, null, 2));
  return result;
}

async function demoFindPager(client) {
  const firstPageBody = {
    account: POINTS_ACCOUNT,
    page_size: 10,
    order_by: 'created_at',
    order_type: 'DESC'
  };
  const firstPageResult = await client.post(PATH_FIND_PAGER, firstPageBody);
  console.log('[find-pager page1]', JSON.stringify(firstPageResult, null, 2));

  if (firstPageResult.code !== 1000 || !firstPageResult.data?.has_more) {
    return firstPageResult;
  }

  const nextCursor = firstPageResult.data.next_cursor;
  const secondPageBody = {
    account: POINTS_ACCOUNT,
    page_size: 10,
    order_by: 'created_at',
    order_type: 'DESC',
    last_id: nextCursor.last_id,
    last_sort_value: nextCursor.last_sort_value
  };
  const secondPageResult = await client.post(PATH_FIND_PAGER, secondPageBody);
  console.log('[find-pager page2]', JSON.stringify(secondPageResult, null, 2));
  return secondPageResult;
}

async function demoCreate(client) {
  const createBody = {
    account: POINTS_ACCOUNT,
    biz_type: BIZ_TYPE_POINTS_EXPENSE,
    direction: LEDGER_DIRECTION_INCREASE,
    amount: 1,
    remark: 'merchant-sdk-nodejs-demo'
  };
  const result = await client.post(PATH_CREATE, createBody);
  console.log('[create]', JSON.stringify(result, null, 2));
  return result;
}

async function main() {
  const client = new MerchantHmacClient({
    baseUrl: BASE_URL,
    appId: APP_ID,
    appSecret: APP_SECRET
  });

  await demoCurrentBalance(client);
  await demoFindPager(client);
  await demoCreate(client);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
