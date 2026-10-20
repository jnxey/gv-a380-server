# 商家后端对接文档

本文档面向**合作商家服务端**开发人员，说明如何通过 **AppId + AppSecret + HMAC-SHA256** 调用积分服务 API。

平台会分配 `AppId`、`AppSecret` 及可调用的积分账号范围；请仅在商家服务端保存密钥，勿写入前端或公开仓库。

### 积分账号说明

文档中的 **积分账号**（API 字段 `account`）用于标识积分余额与流水所属账号，是独立于会员档案的标识；通常与 `member.points_account` 相同以便关联，但 **接口 3 create 不要求 member 已建档**（可先记账，后续再创建 member 并绑定相同积分账号）。取值可以是以下任一形式：

- **E.164 手机号**（如 `+855123456789`）
- **邮箱**（如 `user@example.com`）
- **财务会员号**（平台为会员分配的财务编号）

接口 1～4 中的 `account` / `points_account` 均指上述积分账号；接口 5 校验成功后返回的 `points_account` 亦同。若商家侧仅有会员号，可先调用 **接口 5** 取得积分账号，再查余额或流水。

## 接口总览

本服务共提供 **5 个**业务接口（均需商家 HMAC 鉴权），用于合作商家在自有系统中查询会员积分、写入积分流水，以及校验会员身份：

| # | 方法 | 路径 | 用途 |
|---|------|------|------|
| 1 | GET | `/api/v1/ledger-member-points/current-balance` | 查询指定积分账号的**当前余额** |
| 2 | POST | `/api/v1/ledger-member-points/find-pager` | 按积分账号**分页查询流水**（键集游标） |
| 3 | POST | `/api/v1/ledger-member-points/create` | **创建一笔积分记账**（增加或减少） |
| 4 | POST | `/api/v1/ledger-member-points/find-by-referrer-ids` | 按发生月份 + **原帐 ID 数组**批量查关联流水 |
| 5 | POST | `/api/v1/member/verify` | 校验**会员号与密码**，获取对应积分账号 |

典型调用顺序：若已知积分账号，可直接调用 **接口 1 / 2 / 3**；若仅有会员号，先用 **接口 5** 确认身份并取得 `points_account`，再查余额或流水；需要记账时调用 **接口 3**（不要求 member 已存在）；若业务侧持有原帐 ID（如消费、退回关联），可用 **接口 4** 反查对应积分流水。

各接口详细参数与示例见下文 **第 3 节**。

---

## 1. 概述

| 项目 | 说明 |
|------|------|
| 协议 | HTTPS（生产环境必须） |
| 基础路径 | `{BASE_URL}/api/v1` |
| 数据格式 | JSON（POST 须 `Content-Type: application/json`） |
| 鉴权 | 请求头 `X-App-Id`、`X-Timestamp`、`X-Nonce`、`X-Sign` |
| 响应格式 | `{ "code": number, "msg": string, "data": any }` |

### 1.1 响应码

| code | 含义 |
|------|------|
| 1000 | 成功 |
| 1001 | 业务或参数错误 |
| 1002 | 鉴权失败（签名、AppId、账号权限等） |

HTTP 状态码通常为 200，请以 body 中 `code` 为准。

---

## 2. 鉴权与签名

### 2.1 请求头

每个业务请求必须携带：

| Header | 必填 | 说明 |
|--------|------|------|
| `X-App-Id` | 是 | 平台分配的 AppId |
| `X-Timestamp` | 是 | Unix **秒**级时间戳，与服务端偏差不超过 300 秒 |
| `X-Nonce` | 是 | 随机字符串，长度 8~64，**不可重复使用** |
| `X-Sign` | 是 | HMAC-SHA256 签名，**小写** 64 位十六进制 |

POST 另需：`Content-Type: application/json`

### 2.2 签名步骤

**步骤 1：Body SHA256**

- `GET` / `HEAD`：固定使用空串哈希  
  `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`
- `POST`：对**原始 HTTP body 字符串**（UTF-8，与发送字节完全一致）做 SHA256，输出小写 hex

**步骤 2：规范化 Query**

- 取 URL 中 `?` 后的参数
- 参数名按**字典序**排序
- 拼接为 `key1=value1&key2=value2`，value 使用 `encodeURIComponent`
- 跳过空值（null / undefined / ''）
- 无 query 时用空字符串

**步骤 3：待签名字符串**

共 6 行，用 `\n` 连接（**最后一行后无换行**）：

```text
{HTTP_METHOD}
{URL_PATH}
{CANONICAL_QUERY}
{BODY_SHA256}
{TIMESTAMP}
{NONCE}
```

| 占位符 | 说明 |
|--------|------|
| `HTTP_METHOD` | 大写，如 `GET`、`POST` |
| `URL_PATH` | 含前缀的路径，如 `/api/v1/ledger-member-points/current-balance`（**不含** query） |
| `CANONICAL_QUERY` | 步骤 2 结果 |
| `BODY_SHA256` | 步骤 1 结果 |
| `TIMESTAMP` | 与请求头 `X-Timestamp` 相同 |
| `NONCE` | 与请求头 `X-Nonce` 相同 |

**步骤 4：计算签名**

```text
X-Sign = HMAC-SHA256(key=AppSecret, message=待签名字符串).toLowerCase()
```

### 2.3 重要约束

1. **POST 接口**：`account` 只放在 **JSON body** 中，**不要**在 URL query 传 `account`（权限与业务均只认 body.account）。
2. 若 query 与 body 同时出现 `account` 且值不一致，返回 `code=1002`。
3. 每次请求使用**新 Nonce**；网络重试须重新签名并换新 Nonce。
4. POST 签名用的 body 字符串必须与 HTTP 实际发送 body **完全一致**（建议 `JSON.stringify` 后直接发送，勿再格式化）。

### 2.4 签名示例（GET 查余额）

```text
GET
/api/v1/ledger-member-points/current-balance
account=test_points_001
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
1735689600
a1b2c3d4e5f67890
```

### 2.5 签名示例（POST）

Body 原始字符串：

```json
{"account":"test_points_001","page_size":10,"order_by":"created_at","order_type":"DESC"}
```

待签名字符串第 3 行（CANONICAL_QUERY）为空，即连续两个 `\n`：

```text
POST
/api/v1/ledger-member-points/find-pager

{a body_sha256 hex}
1735689600
b2c3d4e5f6789012
```

---

## 3. 业务接口

### 3.1 查询积分余额

| 项目 | 值 |
|------|-----|
| Method | GET |
| Path | `/api/v1/ledger-member-points/current-balance` |
| Query | `account`（必填，积分账号） |

**请求示例**

```http
GET /api/v1/ledger-member-points/current-balance?account=test_points_001 HTTP/1.1
X-App-Id: your_app_id
X-Timestamp: 1735689600
X-Nonce: a1b2c3d4e5f67890
X-Sign: {签名}
```

**成功响应 data**

```json
{
  "balance": 100.5
}
```

---

### 3.2 流水分页（键集游标）

| 项目 | 值 |
|------|-----|
| Method | POST |
| Path | `/api/v1/ledger-member-points/find-pager` |
| Body | JSON |

**Body 字段**

| 字段 | 必填 | 说明 |
|------|------|------|
| account | 是 | 积分账号 |
| page_size | 是 | 每页条数，1~20000 |
| order_by | 否 | 排序字段，默认 `created_at`；为 `id` 时游标只需 `last_id` |
| order_type | 否 | `ASC` 或 `DESC` |
| last_id | 否 | 上一页最后一条 id |
| last_sort_value | 否 | 上一页最后一条排序列值（与 order_by 一致） |
| biz_type | 否 | 业务类型数组，多选筛选 |
| amount | 否 | 金额精确匹配 |
| created_by | 否 | 创建人精确匹配 |
| create_at_start | 否 | 创建时间起（Unix 秒） |
| create_at_end | 否 | 创建时间止（Unix 秒） |

**首页请求 Body 示例**

```json
{
  "account": "test_points_001",
  "page_size": 10,
  "order_by": "created_at",
  "order_type": "DESC"
}
```

**成功响应 data 示例**

```json
{
  "list": [
    {
      "account": "test_points_001",
      "biz_type": "601",
      "direction": "2",
      "amount": 10,
      "balance": 90.5,
      "ledger_id": "1234567890123456789",
      "created_at": 1735689600,
      "created_by": "operator"
    }
  ],
  "has_more": true,
  "next_cursor": {
    "last_sort_value": 1735689600,
    "last_id": 10001
  },
  "total": 25
}
```

**翻页**：当 `has_more=true` 时，下一页请求带上 `next_cursor` 中的 `last_sort_value`、`last_id`（与 `order_by` 规则一致）。

---

### 3.3 创建积分记账

| 项目 | 值 |
|------|-----|
| Method | POST |
| Path | `/api/v1/ledger-member-points/create` |
| Body | JSON |

**Body 字段**

| 字段 | 必填 | 说明 |
|------|------|------|
| account | 是 | 积分账号；可先记账后建档 member |
| biz_type | 是 | 业务类型，见下表 |
| direction | 是 | `1` 增加，`2` 减少 |
| amount | 是 | 金额，最多 5 位小数，最小 0.00001 |
| referrer_id | 否 | 关联原账 ID |
| remark | 否 | 备注 |
| describe_json | 否 | 扩展 JSON 对象 |

**请求 Body 示例（增加积分）**

```json
{
  "account": "test_points_001",
  "biz_type": "601",
  "direction": "1",
  "amount": 10,
  "remark": "消费赠送积分"
}
```

**成功响应 data**：返回本条流水主要字段（含 `ledger_id`、`balance` 等）。

写接口重试时请使用**新 Nonce** 重新签名；勿重复提交相同 Nonce 的请求。

---

### 3.4 按原帐 ID 批量查流水

| 项目 | 值 |
|------|-----|
| Method | POST |
| Path | `/api/v1/ledger-member-points/find-by-referrer-ids` |
| Body | JSON |

**Body 字段**

| 字段 | 必填 | 说明 |
|------|------|------|
| timestamp | 是 | 发生月份时间戳（Unix **秒**），用于定位月分表 |
| referrer_id | 是 | 关联原帐 ID 字符串数组，1~100 条，每项最长 80 |

**请求 Body 示例**

```json
{
  "timestamp": 1735689600,
  "referrer_id": ["20260101120000123456", "20260101120000987654"]
}
```

**成功响应 data**

```json
{
  "list": [
    {
      "id": 10001,
      "ledger_id": "20260101120000987654",
      "account": "test_points_001",
      "biz_type": "602",
      "direction": "1",
      "amount": 10,
      "balance": 100.5,
      "increase_cumulative": 500,
      "referrer_id": "20260101120000123456",
      "remark": null,
      "describe_json": {},
      "created_by": "operator",
      "created_at": 1735689600
    }
  ]
}
```

当月分表尚未创建，或 ID 无匹配流水时，`list` 为空数组 `[]`。

---

### 3.5 校验会员号/密码

| 项目 | 值 |
|------|-----|
| Method | POST |
| Path | `/api/v1/member/verify` |
| Body | JSON |

**Body 字段**

| 字段 | 必填 | 说明 |
|------|------|------|
| member_account | 是 | 会员号（`member.account`） |
| password | 是 | 密码；库内未设密码时须传空字符串 `""` |

> 请求体使用 `member_account` 而非 `account`，避免与商家 HMAC 积分账号权限字段混淆。

**请求 Body 示例**

```json
{
  "member_account": "member001",
  "password": "your_password"
}
```

**成功响应 data**

```json
{
  "member_id": 123,
  "member_account": "member001",
  "points_account": "test_points_001"
}
```

失败时 `code=1001`（会员不存在、密码错误、账号停用）；若商家 env 未授权该会员的积分账号，则 `code=1002`。

本接口**不签发 JWT**，仅校验身份并返回积分账号，供后续余额/流水接口使用。

---

## 4. 枚举说明

### 4.1 direction（方向）

| 值 | 含义 |
|----|------|
| 1 | 增加 |
| 2 | 减少 |

### 4.2 biz_type（业务类型）

| 值 | 含义 |
|----|------|
| 98 | 手工单录入1 |
| 99 | 手工单录入2 |
| 100 | 手工单修改 |
| 601 | 柜机消费 |
| 602 | 柜机退回 |
| 603 | 酒店订房 |
| 604 | 商品订单 |
| 605 | 派车订单 |
| 606 | 积分转出 |
| 607 | 积分转入 |
| 608 | 积分过期 |
| 609 | 平台-酒店 |
| 610 | 平台-KTV |
| 611 | 平台-酒吧 |
| 612 | 平台-台球厅 |
| 613 | 平台-美食 |
| 614 | 平台-外卖 |
| 615 | 平台-闪购 |
| 616 | 平台-足疗/按摩 |
| 617 | 平台-机票 |
| 618 | 平台-打车 |

---

## 5. 鉴权错误（code=1002）

| msg（中文） | 原因 |
|-------------|------|
| 缺少请求头 X-App-Id | 未传 AppId |
| 缺少请求头 X-Timestamp | 未传时间戳 |
| 缺少请求头 X-Nonce | 未传 Nonce |
| 缺少请求头 X-Sign | 未传签名 |
| AppId 不存在 | AppId 与平台配置不一致 |
| 签名验证失败 | 待签名字符串或 AppSecret 错误 |
| 请求已过期，请检查服务器时间 | 时间戳超出允许窗口 |
| Nonce 已被使用，请勿重复提交 | Nonce 重复 |
| 无权访问该积分账号 | 该 account 不在授权范围 |
| query 与 body 中的 account 不一致 | POST 的 query/body account 冲突 |

---

## 6. 签名失败排查

1. **Path**：是否包含 `/api/v1` 前缀，且无尾斜杠差异。
2. **Query**：参数名是否字典序；value 是否 `encodeURIComponent`；POST 是否误在 query 传了 `account`。
3. **Body**：POST 参与哈希的是**原始字符串**，是否与 HTTP body 字节一致。
4. **时间**：商家服务器时钟是否与标准时间同步（偏差 ≤300 秒）。
5. **Nonce**：重试是否复用了同一 Nonce。
6. **AppSecret**：是否与平台分配一致，无多余空格或换行。

---

## 7. 示例代码（SDK）

仓库提供可复用客户端与完整调用示例：

| 语言 | 目录 |
|------|------|
| Node.js | [docs/merchant-sdk/nodejs/](merchant-sdk/nodejs/) |
| Java（JDK 11+） | [docs/merchant-sdk/java/](merchant-sdk/java/) |

快速运行（Node.js）：

```bash
# 修改 example 内配置后
node docs/merchant-sdk/nodejs/merchant-api-example.cjs
```

或沿用根目录快捷脚本：

```bash
node scripts/merchant-sign-sample.cjs
```

---

## 8. 安全建议

1. AppSecret 仅保存在商家服务端。
2. 生产环境必须使用 HTTPS。
3. 写接口重试时使用新 Nonce 重新签名。
4. 日志中勿打印 AppSecret 与完整签名密钥材料。

---

## 9. 附录：Swagger

字段说明与在线调试（Swagger 页面本身无需 HMAC）：  
`{BASE_URL}/api/v1/docs`

业务接口 `/api/v1/ledger-member-points/*` 调用时须按本文档签名。
