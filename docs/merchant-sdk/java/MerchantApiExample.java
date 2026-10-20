import java.util.HashMap;
import java.util.Map;

/**
 * 商家积分 API 调用示例（Java）。
 * 演示：查余额、流水分页（含翻页）、创建记账。
 */
public class MerchantApiExample {

    private static final String BASE_URL = System.getenv().getOrDefault("MERCHANT_BASE_URL", "http://127.0.0.1:8001");
    private static final String APP_ID = System.getenv().getOrDefault("MERCHANT_APP_ID", "demo_merchant_001");
    private static final String APP_SECRET = System.getenv().getOrDefault("MERCHANT_APP_SECRET", "demo_secret_change_me_before_prod");
    private static final String POINTS_ACCOUNT = System.getenv().getOrDefault("MERCHANT_POINTS_ACCOUNT", "your_points_account_here");

    private static final String PATH_CURRENT_BALANCE = "/api/v1/ledger-member-points/current-balance";
    private static final String PATH_FIND_PAGER = "/api/v1/ledger-member-points/find-pager";
    private static final String PATH_CREATE = "/api/v1/ledger-member-points/create";

    /** direction：增加 */
    private static final String LEDGER_DIRECTION_INCREASE = "1";

    /** biz_type：柜机消费 */
    private static final String BIZ_TYPE_POINTS_EXPENSE = "601";

    public static void main(String[] args) throws Exception {
        MerchantHmacClient client = new MerchantHmacClient(BASE_URL, APP_ID, APP_SECRET);

        demoCurrentBalance(client);
        demoFindPager(client);
        demoCreate(client);
    }

    /**
     * 查询积分余额。
     */
    private static void demoCurrentBalance(MerchantHmacClient client) throws Exception {
        Map<String, String> query = new HashMap<>();
        query.put("account", POINTS_ACCOUNT);
        String responseBody = client.get(PATH_CURRENT_BALANCE, query);
        System.out.println("[current-balance] " + responseBody);
    }

    /**
     * 流水分页：首页 + 使用 next_cursor 翻第二页。
     */
    private static void demoFindPager(MerchantHmacClient client) throws Exception {
        String firstPageBody = "{"
                + "\"account\":\"" + escapeJson(POINTS_ACCOUNT) + "\","
                + "\"page_size\":10,"
                + "\"order_by\":\"created_at\","
                + "\"order_type\":\"DESC\""
                + "}";
        String firstPageResponse = client.post(PATH_FIND_PAGER, firstPageBody);
        System.out.println("[find-pager page1] " + firstPageResponse);

        // 简化演示：若需自动翻页，可解析 JSON 中 has_more / next_cursor 后构造第二页 body
        // 此处给出第二页 body 构造示例（需替换为 page1 返回的实际 last_id / last_sort_value）
        String secondPageBody = "{"
                + "\"account\":\"" + escapeJson(POINTS_ACCOUNT) + "\","
                + "\"page_size\":10,"
                + "\"order_by\":\"created_at\","
                + "\"order_type\":\"DESC\","
                + "\"last_id\":10001,"
                + "\"last_sort_value\":1735689600"
                + "}";
        String secondPageResponse = client.post(PATH_FIND_PAGER, secondPageBody);
        System.out.println("[find-pager page2 demo] " + secondPageResponse);
    }

    /**
     * 创建积分记账（增加积分）。
     */
    private static void demoCreate(MerchantHmacClient client) throws Exception {
        String createBody = "{"
                + "\"account\":\"" + escapeJson(POINTS_ACCOUNT) + "\","
                + "\"biz_type\":\"" + BIZ_TYPE_POINTS_EXPENSE + "\","
                + "\"direction\":\"" + LEDGER_DIRECTION_INCREASE + "\","
                + "\"amount\":1,"
                + "\"remark\":\"merchant-sdk-java-demo\""
                + "}";
        String responseBody = client.post(PATH_CREATE, createBody);
        System.out.println("[create] " + responseBody);
    }

    /**
     * JSON 字符串值转义（仅用于示例拼接，生产建议用 Jackson/Gson）。
     */
    private static String escapeJson(String text) {
        return text.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
