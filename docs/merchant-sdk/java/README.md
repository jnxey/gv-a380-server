# Java 商家 SDK 示例

零第三方依赖，需 **JDK 11+**（使用 `java.net.http.HttpClient`）。

## 文件说明

| 文件 | 说明 |
|------|------|
| `MerchantHmacClient.java` | HMAC 签名与 HTTP 请求封装 |
| `MerchantApiExample.java` | 三接口调用示例 |

## 编译

```bash
cd docs/merchant-sdk/java
javac -encoding UTF-8 MerchantHmacClient.java MerchantApiExample.java
```

## 运行

```bash
# 使用默认配置（须与平台 .env 中 AppId/Secret 一致）
java MerchantApiExample

# 或通过环境变量传入
set MERCHANT_BASE_URL=http://127.0.0.1:8001
set MERCHANT_APP_ID=demo_merchant_001
set MERCHANT_APP_SECRET=demo_secret_change_me_before_prod
set MERCHANT_POINTS_ACCOUNT=your_points_account_here
java MerchantApiExample
```

Linux / macOS：

```bash
export MERCHANT_BASE_URL=http://127.0.0.1:8001
export MERCHANT_APP_ID=demo_merchant_001
export MERCHANT_APP_SECRET=demo_secret_change_me_before_prod
export MERCHANT_POINTS_ACCOUNT=your_points_account_here
java MerchantApiExample
```

## 注意事项

1. POST 请求 **不要** 在 URL query 传 `account`，只放在 JSON body 中。
2. 签名使用的 body 字符串必须与 HTTP 发送内容**完全一致**。
3. 生产环境请使用 HTTPS，并妥善保管 `MERCHANT_APP_SECRET`。

完整对接说明见 [merchant-backend-integration.md](../../merchant-backend-integration.md)。
