'use strict';

const crypto = require('crypto');

/** 空 body 的 SHA256 十六进制（与服务端一致）。 */
const MERCHANT_AUTH_EMPTY_BODY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

/**
 * 对字符串做 SHA256，返回小写十六进制。
 */
function sha256Hex(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * 使用 AppSecret 对签名字符串做 HMAC-SHA256，返回小写十六进制。
 */
function hmacSha256Hex(appSecret, signContent) {
  return crypto.createHmac('sha256', appSecret).update(signContent, 'utf8').digest('hex');
}

/**
 * 将 query 对象规范化为签名字符串：key 字典序，value 做 encodeURIComponent。
 */
function buildCanonicalQueryString(query) {
  const sortedKeys = Object.keys(query).sort();
  const pairList = [];
  for (const key of sortedKeys) {
    const value = query[key];
    if (value === undefined || value === null || value === '') {
      continue;
    }
    if (Array.isArray(value)) {
      const arrayText = value.map((item) => String(item)).join(',');
      pairList.push(`${key}=${encodeURIComponent(arrayText)}`);
      continue;
    }
    pairList.push(`${key}=${encodeURIComponent(String(value))}`);
  }
  return pairList.join('&');
}

/**
 * 组装 HMAC 待签名字符串（6 行，末尾无换行）。
 */
function buildMerchantSignContent(params) {
  const lineList = [
    params.method.toUpperCase(),
    params.path,
    params.canonicalQuery,
    params.bodySha256,
    params.timestamp,
    params.nonce
  ];
  return lineList.join('\n');
}

/**
 * 计算请求 body 的 SHA256 十六进制。
 */
function resolveRequestBodySha256(rawBody, httpMethod) {
  const methodUpper = httpMethod.toUpperCase();
  if (methodUpper === 'GET' || methodUpper === 'HEAD') {
    return MERCHANT_AUTH_EMPTY_BODY_SHA256;
  }
  const bodyString = rawBody === undefined || rawBody === null ? '' : String(rawBody);
  if (bodyString.length === 0) {
    return MERCHANT_AUTH_EMPTY_BODY_SHA256;
  }
  return sha256Hex(bodyString);
}

/**
 * 生成鉴权请求头（不含 Content-Type；POST 时由调用方补充）。
 */
function buildAuthHeaders(appId, appSecret, method, path, query, rawBody) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = crypto.randomBytes(16).toString('hex');
  const canonicalQuery = buildCanonicalQueryString(query || {});
  const httpMethod = method.toUpperCase();
  const bodySha256 = resolveRequestBodySha256(rawBody, httpMethod);
  const signContent = buildMerchantSignContent({
    method: httpMethod,
    path,
    canonicalQuery,
    bodySha256,
    timestamp,
    nonce
  });
  const sign = hmacSha256Hex(appSecret, signContent);
  return {
    'X-App-Id': appId,
    'X-Timestamp': timestamp,
    'X-Nonce': nonce,
    'X-Sign': sign
  };
}

/**
 * 商家 HMAC 积分 API 客户端。
 */
class MerchantHmacClient {
  /**
   * @param {object} options
   * @param {string} options.baseUrl 如 http://127.0.0.1:8001
   * @param {string} options.appId
   * @param {string} options.appSecret
   */
  constructor(options) {
    this.baseUrl = String(options.baseUrl || '').replace(/\/$/, '');
    this.appId = options.appId;
    this.appSecret = options.appSecret;
  }

  /**
   * 发送 GET 请求（query 参与签名）。
   */
  async get(path, query) {
    const queryRecord = query || {};
    const queryString = buildCanonicalQueryString(queryRecord);
    const url = queryString.length > 0 ? `${this.baseUrl}${path}?${queryString}` : `${this.baseUrl}${path}`;
    const headers = buildAuthHeaders(this.appId, this.appSecret, 'GET', path, queryRecord, '');
    const response = await fetch(url, { method: 'GET', headers });
    return await response.json();
  }

  /**
   * 发送 POST JSON 请求（body 原始字符串参与签名；不在 query 传 account）。
   */
  async post(path, bodyObject) {
    const rawBody = JSON.stringify(bodyObject);
    const headers = {
      ...buildAuthHeaders(this.appId, this.appSecret, 'POST', path, {}, rawBody),
      'Content-Type': 'application/json'
    };
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, { method: 'POST', headers, body: rawBody });
    return await response.json();
  }
}

module.exports = {
  MERCHANT_AUTH_EMPTY_BODY_SHA256,
  sha256Hex,
  hmacSha256Hex,
  buildCanonicalQueryString,
  buildMerchantSignContent,
  resolveRequestBodySha256,
  buildAuthHeaders,
  MerchantHmacClient
};
