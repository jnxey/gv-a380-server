# 积分服务对接说明（平台方）

本文档供 **gv-admin-point 平台运维** 使用。  
合作商家后端对接请直接提供：[商家后端对接文档](merchant-backend-integration.md)

---

## 商家文档与 SDK

| 资源 | 路径 |
|------|------|
| 商家对接文档（可外发） | [docs/merchant-backend-integration.md](merchant-backend-integration.md) |
| Node.js SDK | [docs/merchant-sdk/nodejs/](merchant-sdk/nodejs/) |
| Java SDK（JDK 11+） | [docs/merchant-sdk/java/](merchant-sdk/java/) |
| 快捷脚本 | `node scripts/merchant-sign-sample.cjs` |

---

## 平台 env 配置

在 gv-admin-point 的 `.env` 中配置商家 HMAC 凭证：

```env
MERCHANT_AUTH_ENABLED=true
MERCHANT_AUTH_APP_ID=your_app_id
MERCHANT_AUTH_APP_SECRET=your_app_secret
MERCHANT_AUTH_APP_NAME=商家名称
MERCHANT_AUTH_ALLOW_ALL_ACCOUNTS=false
MERCHANT_AUTH_ALLOWED_ACCOUNTS=points_account_1,points_account_2
MERCHANT_AUTH_TIMESTAMP_TOLERANCE_SEC=300
MERCHANT_AUTH_NONCE_TTL_SEC=600
```

| 变量 | 说明 |
|------|------|
| `MERCHANT_AUTH_ENABLED` | `false` 仅本地调试，生产必须为 `true` |
| `MERCHANT_AUTH_APP_ID` / `MERCHANT_AUTH_APP_SECRET` | 与提供给商家的凭证一致 |
| `MERCHANT_AUTH_ALLOW_ALL_ACCOUNTS` | `true` 可操作任意积分账号；生产建议 `false` |
| `MERCHANT_AUTH_ALLOWED_ACCOUNTS` | 逗号分隔积分账号（`allow_all_accounts=false` 时生效） |
| `MERCHANT_AUTH_NONCE_TTL_SEC` | 须 ≥ `MERCHANT_AUTH_TIMESTAMP_TOLERANCE_SEC` |

启用鉴权时，若 AppId/Secret 为空或时间窗口配置非法，服务启动将失败。

---

## 业务接口一览

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/ledger-member-points/current-balance?account=` | 查余额 |
| POST | `/api/v1/ledger-member-points/find-pager` | 流水分页 |
| POST | `/api/v1/ledger-member-points/create` | 创建记账 |

Swagger：`{BASE_URL}/api/v1/docs`（Swagger 本身无需 HMAC）

签名算法、请求示例、枚举与排查清单见 [商家后端对接文档](merchant-backend-integration.md)。

---

## 部署说明

- Nonce 防重放使用**进程内存**；多实例部署时各实例独立，建议网关限流或后续接入 Redis。
- 商家 AppSecret 仅配置在服务端 env，勿提交版本库。
