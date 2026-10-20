import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * 商家 HMAC 积分 API 客户端（零第三方依赖，JDK 11+）。
 * 签名规则与 docs/merchant-backend-integration.md 一致。
 */
public class MerchantHmacClient {

    /** 空 body 的 SHA256 十六进制。 */
    public static final String MERCHANT_AUTH_EMPTY_BODY_SHA256 =
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

    private final String baseUrl;
    private final String appId;
    private final String appSecret;
    private final HttpClient httpClient;
    private final SecureRandom secureRandom = new SecureRandom();

    public MerchantHmacClient(String baseUrl, String appId, String appSecret) {
        this.baseUrl = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
        this.appId = appId;
        this.appSecret = appSecret;
        this.httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(30)).build();
    }

    /**
     * 发送 GET 请求。
     */
    public String get(String path, Map<String, String> query) throws Exception {
        Map<String, String> queryRecord = query == null ? Collections.emptyMap() : query;
        String canonicalQuery = buildCanonicalQueryString(queryRecord);
        String url = canonicalQuery.isEmpty()
                ? baseUrl + path
                : baseUrl + path + "?" + canonicalQuery;
        Map<String, String> authHeaders = buildAuthHeaders("GET", path, queryRecord, "");
        HttpRequest.Builder requestBuilder = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .timeout(Duration.ofSeconds(60))
                .GET();
        for (Map.Entry<String, String> headerEntry : authHeaders.entrySet()) {
            requestBuilder.header(headerEntry.getKey(), headerEntry.getValue());
        }
        HttpResponse<String> response = httpClient.send(requestBuilder.build(), HttpResponse.BodyHandlers.ofString());
        return response.body();
    }

    /**
     * 发送 POST JSON 请求（body 原始字符串参与签名）。
     */
    public String post(String path, String rawBody) throws Exception {
        Map<String, String> authHeaders = buildAuthHeaders("POST", path, Collections.emptyMap(), rawBody);
        HttpRequest.Builder requestBuilder = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + path))
                .timeout(Duration.ofSeconds(60))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(rawBody, StandardCharsets.UTF_8));
        for (Map.Entry<String, String> headerEntry : authHeaders.entrySet()) {
            requestBuilder.header(headerEntry.getKey(), headerEntry.getValue());
        }
        HttpResponse<String> response = httpClient.send(requestBuilder.build(), HttpResponse.BodyHandlers.ofString());
        return response.body();
    }

    /**
     * 对字符串做 SHA256，返回小写十六进制。
     */
    public static String sha256Hex(String content) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        byte[] hashBytes = digest.digest(content.getBytes(StandardCharsets.UTF_8));
        return bytesToHexLower(hashBytes);
    }

    /**
     * 使用 AppSecret 对签名字符串做 HMAC-SHA256，返回小写十六进制。
     */
    public static String hmacSha256Hex(String appSecret, String signContent) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        SecretKeySpec secretKeySpec = new SecretKeySpec(appSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
        mac.init(secretKeySpec);
        byte[] hashBytes = mac.doFinal(signContent.getBytes(StandardCharsets.UTF_8));
        return bytesToHexLower(hashBytes);
    }

    /**
     * 将 query 规范化为签名字符串。
     */
    public static String buildCanonicalQueryString(Map<String, String> query) {
        if (query == null || query.isEmpty()) {
            return "";
        }
        TreeMap<String, String> sortedMap = new TreeMap<>(query);
        List<String> pairList = new ArrayList<>();
        for (Map.Entry<String, String> entry : sortedMap.entrySet()) {
            String key = entry.getKey();
            String value = entry.getValue();
            if (value == null || value.isEmpty()) {
                continue;
            }
            pairList.add(key + "=" + encodeURIComponent(value));
        }
        return String.join("&", pairList);
    }

    /**
     * 组装待签名字符串。
     */
    public static String buildMerchantSignContent(
            String method,
            String path,
            String canonicalQuery,
            String bodySha256,
            String timestamp,
            String nonce
    ) {
        return method.toUpperCase() + "\n"
                + path + "\n"
                + canonicalQuery + "\n"
                + bodySha256 + "\n"
                + timestamp + "\n"
                + nonce;
    }

    /**
     * 生成鉴权请求头。
     */
    public Map<String, String> buildAuthHeaders(
            String method,
            String path,
            Map<String, String> query,
            String rawBody
    ) throws Exception {
        String timestamp = String.valueOf(System.currentTimeMillis() / 1000);
        String nonce = generateNonce();
        String canonicalQuery = buildCanonicalQueryString(query);
        String bodySha256 = resolveRequestBodySha256(rawBody, method);
        String signContent = buildMerchantSignContent(method, path, canonicalQuery, bodySha256, timestamp, nonce);
        String sign = hmacSha256Hex(appSecret, signContent);

        Map<String, String> headerMap = new LinkedHashMap<>();
        headerMap.put("X-App-Id", appId);
        headerMap.put("X-Timestamp", timestamp);
        headerMap.put("X-Nonce", nonce);
        headerMap.put("X-Sign", sign);
        return headerMap;
    }

    /**
     * 计算 body SHA256。
     */
    public static String resolveRequestBodySha256(String rawBody, String httpMethod) throws Exception {
        String methodUpper = httpMethod.toUpperCase();
        if ("GET".equals(methodUpper) || "HEAD".equals(methodUpper)) {
            return MERCHANT_AUTH_EMPTY_BODY_SHA256;
        }
        if (rawBody == null || rawBody.isEmpty()) {
            return MERCHANT_AUTH_EMPTY_BODY_SHA256;
        }
        return sha256Hex(rawBody);
    }

    /**
     * 生成 32 位十六进制 Nonce。
     */
    private String generateNonce() {
        byte[] randomBytes = new byte[16];
        secureRandom.nextBytes(randomBytes);
        return bytesToHexLower(randomBytes);
    }

    /**
     * 与 JavaScript encodeURIComponent 对齐的编码。
     */
    private static String encodeURIComponent(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8)
                .replace("+", "%20")
                .replace("%21", "!")
                .replace("%27", "'")
                .replace("%28", "(")
                .replace("%29", ")")
                .replace("%7E", "~");
    }

    private static String bytesToHexLower(byte[] bytes) {
        StringBuilder builder = new StringBuilder(bytes.length * 2);
        for (byte singleByte : bytes) {
            builder.append(String.format("%02x", singleByte));
        }
        return builder.toString();
    }
}
