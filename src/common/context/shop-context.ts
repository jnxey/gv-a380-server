import { AsyncLocalStorage } from 'async_hooks';
import { isEmpty } from '../tools';

interface ShopContextStore {
  currentShopId: string;
}

const shopContextStorage = new AsyncLocalStorage<ShopContextStore>();

/**
 * 保存当前请求已校验通过的门店 ID。
 * 查询过滤器只认这里的值，不认前端另外传入的 shop_id。
 */
export class ShopContext {
  /**
   * 在门店上下文中执行后续异步逻辑。
   */
  static run<T>(currentShopId: string, callback: () => T): T {
    return shopContextStorage.run({ currentShopId }, callback);
  }

  /**
   * 读取当前门店 ID。没有进入门店上下文时返回空字符串。
   */
  static getCurrentShopId(): string {
    const shopContextStore = shopContextStorage.getStore();
    if (isEmpty(shopContextStore)) {
      return '';
    }
    if (isEmpty(shopContextStore.currentShopId)) {
      return '';
    }
    return shopContextStore.currentShopId;
  }
}
