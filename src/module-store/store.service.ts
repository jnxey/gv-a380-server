import { mkdir, unlink, writeFile } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import Decimal from 'decimal.js';
import { DataSource, EntityManager, FindOptionsWhere, In, Repository, Between } from 'typeorm';
import {
  BusinessNoPrefix,
  DetailDescriptionLimit,
  FinanceBizType,
  HotelWalkInContact,
  RecordStatus,
  ShopImageLimit,
  ShopImageMime,
  ShopType,
  StorePayMethod,
  StoreDeliveryField,
  StoreSaleItemLimit,
  StoreSaleStatus,
  QuickProductFlag,
  UploadSetting,
} from '../common/constants';
import { ShopContext } from '../common/context/shop-context';
import { MiniappSignService } from '../common/crypto/miniapp-sign.service';
import { BusinessException } from '../common/exceptions/business.exception';
import { PageResult } from '../common/interfaces/page-result';
import { createBusinessNo, isEmpty, isNumber, isOneOf, isPositiveMoney, resolvePage, toIdentifier, toMoneyString } from '../common/tools';
import { SimOrm } from '../common/tools/sim-orm';
import { ChatUserClient } from '../core/member/chat-user.client';
import { MemberBalanceService } from '../core/member/member-balance.service';
import { MemberQueryService } from '../core/member/member-query.service';
import { ShopService } from '../core/shop/shop.service';
import { StoreProduct, StoreProductCategory, StoreProductImage, StorePurchase, StorePurchaseItem, StoreSale, StoreSaleItem } from './store.entities';

/**
 * 保存商品分类的入参。
 */
export interface SaveStoreProductCategoryCommand {
  categoryName: string;
  status: string;
}

/**
 * 保存商品的入参。
 */
export interface SaveStoreProductCommand {
  categoryId: string;
  productName: string;
  description?: { content?: string };
  barcode: string;
  salePrice: string | number;
  costPrice: string | number;
  quickProduct: boolean;
  status: string;
}

/**
 * 进货行。
 */
export interface StorePurchaseLineCommand {
  productId: string;
  costPrice: string | number;
  quantity: number;
}

/**
 * 销售行。
 */
export interface StoreSaleLineCommand {
  productId: string;
  quantity: number;
}

/**
 * 后台创建销售单的入参。
 */
export interface CreateStoreSaleCommand {
  payMethod: string;
  memberId: string;
  remark: string;
  itemList: StoreSaleLineCommand[];
  operatorId: string;
}

/**
 * 小程序创建销售单的入参。
 */
export interface CreateAppStoreSaleCommand {
  shopId: string;
  cipherText: string;
  receiverName: string;
  contact: string;
  deliveryAddress: string;
  itemList: StoreSaleLineCommand[];
}

/**
 * 开始送货时填写的送货信息。
 */
export interface StartStoreDeliveryCommand {
  courierName: string;
  courierContact: string;
  deliveryNo: string;
  deliveryRemark: string;
}

/**
 * 商品图片展示。
 */
export interface StoreProductImageView {
  imageId: string;
  imageUrl: string;
}

/**
 * 上传商品图片时的文件。
 */
export interface StoreProductImageFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

/**
 * 商品展示。
 */
export interface StoreProductCategoryView {
  categoryId: string;
  shopId: string;
  categoryName: string;
  sortOrder: number;
  status: string;
  /** 挂在该分类下的商品数量。 */
  productCount: number;
}

export interface StoreProductView {
  productId: string;
  shopId: string;
  categoryId: string;
  categoryName: string;
  productName: string;
  description: { content: string };
  barcode: string;
  salePrice: string;
  costPrice: string;
  stockQuantity: number;
  quickProduct: boolean;
  status: string;
  imageList: StoreProductImageView[];
}

/**
 * 进货单展示。
 */
export interface StorePurchaseView {
  purchaseId: string;
  purchaseNo: string;
  amount: string;
  remark: string;
  createdAt: string;
  itemList: Array<{
    productId: string;
    productName: string;
    costPrice: string;
    quantity: number;
    lineAmount: string;
  }>;
}

/**
 * 销售单展示。
 */
export interface StoreSaleView {
  saleId: string;
  saleNo: string;
  memberId: string;
  username: string;
  payMethod: string;
  saleStatus: string;
  amount: string;
  remark: string;
  receiverName: string;
  contact: string;
  deliveryAddress: string;
  courierName: string;
  courierContact: string;
  deliveryNo: string;
  deliveryRemark: string;
  createdAt: string;
  itemList: Array<{
    productId: string;
    productName: string;
    salePrice: string;
    quantity: number;
    lineAmount: string;
  }>;
}

/**
 * 商铺进销存与收银。
 */
/** 订单创建时间筛选只接受年月日。 */
const OrderDateTextPattern = /^\d{4}-\d{2}-\d{2}$/;

@Injectable()
export class StoreService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(StoreProduct) private readonly storeProductRepository: Repository<StoreProduct>,
    @InjectRepository(StoreProductCategory) private readonly storeProductCategoryRepository: Repository<StoreProductCategory>,
    @InjectRepository(StoreProductImage) private readonly storeProductImageRepository: Repository<StoreProductImage>,
    @InjectRepository(StorePurchase) private readonly storePurchaseRepository: Repository<StorePurchase>,
    @InjectRepository(StorePurchaseItem) private readonly storePurchaseItemRepository: Repository<StorePurchaseItem>,
    @InjectRepository(StoreSale) private readonly storeSaleRepository: Repository<StoreSale>,
    @InjectRepository(StoreSaleItem) private readonly storeSaleItemRepository: Repository<StoreSaleItem>,
    private readonly shopService: ShopService,
    private readonly memberBalanceService: MemberBalanceService,
    private readonly memberQueryService: MemberQueryService,
    private readonly chatUserClient: ChatUserClient,
    private readonly miniappSignService: MiniappSignService,
  ) {}

  /**
   * 读取并校验当前请求里的商铺门店。
   */
  private async requireEnabledStoreShop(): Promise<string> {
    const currentShopId = ShopContext.getCurrentShopId();
    if (isEmpty(currentShopId)) {
      throw new BusinessException('请选择门店');
    }
    await this.shopService.findEnabledShop(currentShopId, ShopType.STORE);
    return toIdentifier(currentShopId);
  }

  /**
   * 按用户名找到启用中的会员。
   */
  private async requireMemberByUsername(username: string) {
    const memberAccount = await this.memberQueryService.findByUsername(username);
    if (isEmpty(memberAccount)) {
      throw new BusinessException('没有找到会员');
    }
    return this.memberQueryService.toMemberView(memberAccount);
  }

  /**
   * 取出业务异常上的中文提示。不是业务异常时返回空。
   */
  private readBusinessMessage(error: unknown): string {
    if (!(error instanceof BusinessException)) {
      return '';
    }
    const response = error.getResponse();
    if (typeof response === 'string') {
      return response;
    }
    if (typeof response === 'object' && response !== null && 'message' in response && typeof response.message === 'string') {
      return response.message;
    }
    return '';
  }

  /**
   * 按用户名、手机号或邮箱找到余额账户。
   */
  async findMemberByKeyword(keyword: string) {
    await this.requireEnabledStoreShop();
    const cleanedKeyword = keyword.trim();
    if (isEmpty(cleanedKeyword)) {
      throw new BusinessException('没有找到会员');
    }
    let username = '';
    try {
      const chatUserProfile = await this.chatUserClient.findByKeyword(cleanedKeyword);
      username = chatUserProfile.username;
    } catch (error) {
      if (this.readBusinessMessage(error) === '未找到该用户') {
        throw new BusinessException('没有找到会员');
      }
      throw error;
    }
    return this.requireMemberByUsername(username);
  }

  /**
   * 解开付款码，再按里面的用户名找到余额账户。
   */
  async findMemberByPayQr(cipherText: string) {
    await this.requireEnabledStoreShop();
    const username = this.miniappSignService.readPayRechargeUsername(cipherText);
    return this.requireMemberByUsername(username);
  }

  /**
   * 查询当前门店全部商品分类，并带上每个分类下的商品数。
   */
  async listProductCategories(): Promise<StoreProductCategoryView[]> {
    const shopId = await this.requireEnabledStoreShop();
    const categoryList = await this.storeProductCategoryRepository.find({
      where: { shopId },
      order: { sortOrder: 'ASC', id: 'ASC' },
    });
    const categoryIdList = categoryList.map((categoryRow) => toIdentifier(categoryRow.id));
    const productCountByCategoryId = new Map<string, number>();
    if (isEmpty(categoryIdList) !== true) {
      const productCountRowList = await this.storeProductRepository
        .createQueryBuilder('storeProduct')
        .select('storeProduct.categoryId', 'categoryId')
        .addSelect('COUNT(1)', 'productCount')
        .where('storeProduct.shopId = :shopId', { shopId })
        .andWhere('storeProduct.categoryId IN (:...categoryIdList)', { categoryIdList })
        .groupBy('storeProduct.categoryId')
        .getRawMany<{ categoryId: string; productCount: string | number }>();
      for (const productCountRow of productCountRowList) {
        productCountByCategoryId.set(toIdentifier(productCountRow.categoryId), Number(productCountRow.productCount));
      }
    }
    return categoryList.map((categoryRow) => {
      const productCount = productCountByCategoryId.get(toIdentifier(categoryRow.id));
      return this.toProductCategoryView(categoryRow, isEmpty(productCount) ? 0 : productCount);
    });
  }

  /**
   * 新建商品分类。排序排到当前门店最后。
   */
  async createProductCategory(command: SaveStoreProductCategoryCommand): Promise<StoreProductCategoryView> {
    const shopId = await this.requireEnabledStoreShop();
    const categoryName = command.categoryName.trim();
    if (isEmpty(categoryName)) {
      throw new BusinessException('请填写分类名称');
    }
    if (isOneOf(command.status, Object.values(RecordStatus)) !== true) {
      throw new BusinessException('分类状态不正确');
    }
    const categoryRow = new StoreProductCategory();
    categoryRow.shopId = shopId;
    categoryRow.categoryName = categoryName;
    categoryRow.sortOrder = await this.nextProductCategorySortOrder(shopId);
    categoryRow.status = command.status;
    const savedCategory = await this.storeProductCategoryRepository.save(categoryRow);
    return this.toProductCategoryView(savedCategory);
  }

  /**
   * 修改商品分类。不改排序。
   */
  async updateProductCategory(categoryId: string, command: SaveStoreProductCategoryCommand): Promise<StoreProductCategoryView> {
    const shopId = await this.requireEnabledStoreShop();
    const categoryRow = await this.storeProductCategoryRepository.findOne({ where: { id: categoryId, shopId } });
    if (isEmpty(categoryRow)) {
      throw new BusinessException('分类不存在');
    }
    const categoryName = command.categoryName.trim();
    if (isEmpty(categoryName)) {
      throw new BusinessException('请填写分类名称');
    }
    if (isOneOf(command.status, Object.values(RecordStatus)) !== true) {
      throw new BusinessException('分类状态不正确');
    }
    categoryRow.categoryName = categoryName;
    categoryRow.status = command.status;
    const savedCategory = await this.storeProductCategoryRepository.save(categoryRow);
    return this.toProductCategoryView(savedCategory);
  }

  /**
   * 按拖动结果重排当前门店的全部商品分类。
   */
  async sortProductCategories(idList: string[]): Promise<void> {
    const shopId = await this.requireEnabledStoreShop();
    if (isEmpty(idList)) {
      throw new BusinessException('分类排序不完整');
    }
    // 1. 取出当前门店全部分类编号
    const categoryList = await this.storeProductCategoryRepository.find({ where: { shopId } });
    const existingIdSet = new Set(categoryList.map((categoryRow) => toIdentifier(categoryRow.id)));
    if (idList.length !== existingIdSet.size) {
      throw new BusinessException('分类排序不完整');
    }
    // 2. 不能缺、不能多、不能重复
    const seenIdSet = new Set<string>();
    idList.forEach((categoryId) => {
      if (existingIdSet.has(categoryId) !== true || seenIdSet.has(categoryId)) {
        throw new BusinessException('分类排序不完整');
      }
      seenIdSet.add(categoryId);
    });
    // 3. 下标就是新的排序
    await SimOrm.transaction(this.dataSource, async (entityManager) => {
      for (let sortOrder = 0; sortOrder < idList.length; sortOrder += 1) {
        await entityManager.update(StoreProductCategory, { id: idList[sortOrder], shopId }, { sortOrder });
      }
    });
  }

  /**
   * 分页查询当前门店商品。
   */
  async pageProducts(
    keyword: string,
    categoryId: string,
    page: number,
    pageSize: number,
    quickProductOnly: boolean,
  ): Promise<PageResult<StoreProductView>> {
    const shopId = await this.requireEnabledStoreShop();
    const pageSetting = resolvePage(page, pageSize);
    const queryBuilder = this.storeProductRepository.createQueryBuilder('storeProduct').where('storeProduct.shopId = :shopId', { shopId });
    const cleanedKeyword = isEmpty(keyword) ? '' : keyword.trim();
    if (isEmpty(cleanedKeyword) !== true) {
      queryBuilder.andWhere('(storeProduct.productName LIKE :keyword OR storeProduct.barcode LIKE :keyword)', {
        keyword: `%${cleanedKeyword}%`,
      });
    }
    if (isEmpty(categoryId) !== true) {
      queryBuilder.andWhere('storeProduct.categoryId = :categoryId', { categoryId: toIdentifier(categoryId) });
    }
    if (quickProductOnly === true) {
      queryBuilder.andWhere('storeProduct.quickProduct = :quickProduct', { quickProduct: QuickProductFlag.YES });
    }
    queryBuilder.orderBy('storeProduct.sortOrder', 'ASC').addOrderBy('storeProduct.id', 'ASC');
    const total = await queryBuilder.getCount();
    const productList = await queryBuilder.skip(pageSetting.skip).take(pageSetting.pageSize).getMany();
    return {
      list: await this.toProductViewList(productList),
      total,
      page: pageSetting.page,
      pageSize: pageSetting.pageSize,
    };
  }

  /**
   * 小程序查询指定商铺启用中的商品分类。
   */
  async listEnabledProductCategories(shopId: string): Promise<StoreProductCategoryView[]> {
    const enabledShop = await this.shopService.findEnabledShop(shopId, ShopType.STORE);
    const categoryList = await this.storeProductCategoryRepository.find({
      where: { shopId: toIdentifier(enabledShop.id), status: RecordStatus.ENABLED },
      order: { sortOrder: 'ASC', id: 'ASC' },
    });
    return categoryList.map((categoryRow) => this.toProductCategoryView(categoryRow));
  }

  /**
   * 小程序查询启用中的商品。只返回有库存的可售商品。
   */
  async listEnabledProducts(shopId: string): Promise<StoreProductView[]> {
    const enabledShop = await this.shopService.findEnabledShop(shopId, ShopType.STORE);
    const productList = await this.storeProductRepository.find({
      where: { shopId: toIdentifier(enabledShop.id), status: RecordStatus.ENABLED },
      order: { sortOrder: 'ASC', id: 'ASC' },
    });
    return this.toProductViewList(productList);
  }

  /**
   * 新建商品。库存从 0 开始。排序排到当前门店最后。
   */
  async createProduct(command: SaveStoreProductCommand): Promise<StoreProductView> {
    const shopId = await this.requireEnabledStoreShop();
    const productName = command.productName.trim();
    if (isEmpty(productName)) {
      throw new BusinessException('请填写商品名称');
    }
    const descriptionContent = this.readDescriptionContent(command.description);
    if (descriptionContent.length > DetailDescriptionLimit.MAX_LENGTH) {
      throw new BusinessException(`详细描述不能超过${DetailDescriptionLimit.MAX_LENGTH}字`);
    }
    const barcode = isEmpty(command.barcode) ? '' : command.barcode.trim();
    if (isEmpty(barcode)) {
      throw new BusinessException('请填写条码');
    }
    await this.assertBarcodeAvailable(shopId, barcode, '');
    const categoryRow = await this.requireProductCategory(shopId, command.categoryId);
    if (isPositiveMoney(command.salePrice) !== true) {
      throw new BusinessException('售价必须大于0');
    }
    const costPriceText = this.resolveCostPrice(command.costPrice);
    if (isOneOf(command.status, Object.values(RecordStatus)) !== true) {
      throw new BusinessException('商品状态不正确');
    }
    const storeProduct = new StoreProduct();
    storeProduct.shopId = shopId;
    storeProduct.categoryId = toIdentifier(categoryRow.id);
    storeProduct.productName = productName;
    storeProduct.description = { content: descriptionContent };
    storeProduct.barcode = barcode;
    storeProduct.salePrice = toMoneyString(command.salePrice);
    storeProduct.costPrice = costPriceText;
    storeProduct.stockQuantity = 0;
    storeProduct.sortOrder = await this.nextProductSortOrder(shopId);
    storeProduct.quickProduct = command.quickProduct === true ? QuickProductFlag.YES : QuickProductFlag.NO;
    storeProduct.status = command.status;
    const savedProduct = await this.storeProductRepository.save(storeProduct);
    return this.toProductView(savedProduct, [], categoryRow.categoryName);
  }

  /**
   * 按拖动结果重排商品。只改提交编号在本店内的相对顺序，兼容分页与筛选。
   */
  async sortProducts(idList: string[]): Promise<void> {
    const shopId = await this.requireEnabledStoreShop();
    if (isEmpty(idList)) {
      throw new BusinessException('商品排序不完整');
    }
    // 1. 编号不能重复，且必须都属于当前门店
    const seenIdSet = new Set<string>();
    idList.forEach((productId) => {
      if (seenIdSet.has(productId)) {
        throw new BusinessException('商品排序不完整');
      }
      seenIdSet.add(productId);
    });
    const productList = await this.storeProductRepository.find({
      where: { shopId, id: In(idList) },
    });
    if (productList.length !== idList.length) {
      throw new BusinessException('商品排序不完整');
    }
    // 2. 取出这些商品原来的排序值，按从小到大排好
    const sortOrderList = productList.map((storeProduct) => storeProduct.sortOrder).sort((left, right) => left - right);
    // 3. 按拖动后的顺序把排序值写回去
    await SimOrm.transaction(this.dataSource, async (entityManager) => {
      for (let index = 0; index < idList.length; index += 1) {
        await entityManager.update(StoreProduct, { id: idList[index], shopId }, { sortOrder: sortOrderList[index] });
      }
    });
  }

  /**
   * 修改商品资料。不改库存。
   */
  async updateProduct(productId: string, command: SaveStoreProductCommand): Promise<StoreProductView> {
    const shopId = await this.requireEnabledStoreShop();
    const storeProduct = await this.storeProductRepository.findOne({ where: { id: productId, shopId } });
    if (isEmpty(storeProduct)) {
      throw new BusinessException('商品不存在');
    }
    const productName = command.productName.trim();
    if (isEmpty(productName)) {
      throw new BusinessException('请填写商品名称');
    }
    const descriptionContent = this.readDescriptionContent(command.description);
    if (descriptionContent.length > DetailDescriptionLimit.MAX_LENGTH) {
      throw new BusinessException(`详细描述不能超过${DetailDescriptionLimit.MAX_LENGTH}字`);
    }
    const barcode = isEmpty(command.barcode) ? '' : command.barcode.trim();
    if (isEmpty(barcode)) {
      throw new BusinessException('请填写条码');
    }
    await this.assertBarcodeAvailable(shopId, barcode, toIdentifier(storeProduct.id));
    const categoryRow = await this.requireProductCategory(shopId, command.categoryId);
    if (isPositiveMoney(command.salePrice) !== true) {
      throw new BusinessException('售价必须大于0');
    }
    const costPriceText = this.resolveCostPrice(command.costPrice);
    if (isOneOf(command.status, Object.values(RecordStatus)) !== true) {
      throw new BusinessException('商品状态不正确');
    }
    storeProduct.categoryId = toIdentifier(categoryRow.id);
    storeProduct.productName = productName;
    storeProduct.description = { content: descriptionContent };
    storeProduct.barcode = barcode;
    storeProduct.salePrice = toMoneyString(command.salePrice);
    storeProduct.costPrice = costPriceText;
    storeProduct.quickProduct = command.quickProduct === true ? QuickProductFlag.YES : QuickProductFlag.NO;
    storeProduct.status = command.status;
    const savedProduct = await this.storeProductRepository.save(storeProduct);
    const productViewList = await this.toProductViewList([savedProduct]);
    return productViewList[0];
  }

  /**
   * 给当前门店的商品追加一张图片。
   */
  async addProductImage(productId: string, file: StoreProductImageFile): Promise<StoreProductImageView> {
    const storeProduct = await this.requireProduct(productId);
    if (isEmpty(file) || isEmpty(file.buffer) || file.buffer.length === 0) {
      throw new BusinessException('请选择图片');
    }
    const extension = this.resolveImageExtension(file.mimetype);
    if (file.size > ShopImageLimit.MAX_BYTES) {
      throw new BusinessException('图片不能超过5MB');
    }
    const productIdValue = toIdentifier(storeProduct.id);
    const imageCount = await this.storeProductImageRepository.count({ where: { productId: productIdValue } });
    if (imageCount >= ShopImageLimit.MAX_COUNT) {
      throw new BusinessException('商品图片最多6张');
    }
    const fileName = `${randomUUID()}${extension}`;
    const directoryPath = join(UploadSetting.DISK_ROOT, 'store-product', productIdValue);
    await mkdir(directoryPath, { recursive: true });
    await writeFile(join(directoryPath, fileName), file.buffer);
    const productImage = new StoreProductImage();
    productImage.productId = productIdValue;
    productImage.imageUrl = `${UploadSetting.URL_PREFIX}/store-product/${productIdValue}/${fileName}`;
    productImage.sortOrder = imageCount;
    const savedImage = await this.storeProductImageRepository.save(productImage);
    return this.toProductImageView(savedImage);
  }

  /**
   * 删除当前门店商品的一张图片，并删掉磁盘文件。
   */
  async removeProductImage(productId: string, imageId: string): Promise<void> {
    const storeProduct = await this.requireProduct(productId);
    const productIdValue = toIdentifier(storeProduct.id);
    const productImage = await this.storeProductImageRepository.findOne({ where: { id: imageId, productId: productIdValue } });
    if (isEmpty(productImage)) {
      throw new BusinessException('商品图片不存在');
    }
    const fileName = productImage.imageUrl.slice(productImage.imageUrl.lastIndexOf('/') + 1);
    const filePath = join(UploadSetting.DISK_ROOT, 'store-product', productIdValue, fileName);
    try {
      await unlink(filePath);
    } catch (error) {
      const errorCode = (error as { code?: string }).code;
      if (errorCode !== 'ENOENT') {
        throw error;
      }
    }
    await this.storeProductImageRepository.delete({ id: productImage.id });
  }

  /**
   * 分页查询进货单。
   */
  async pagePurchases(page: number, pageSize: number): Promise<PageResult<StorePurchaseView>> {
    const shopId = await this.requireEnabledStoreShop();
    const pageSetting = resolvePage(page, pageSize);
    const [purchaseList, total] = await this.storePurchaseRepository.findAndCount({
      where: { shopId },
      order: { id: 'DESC' },
      skip: pageSetting.skip,
      take: pageSetting.pageSize,
    });
    return {
      list: await this.toPurchaseViewList(purchaseList),
      total,
      page: pageSetting.page,
      pageSize: pageSetting.pageSize,
    };
  }

  /**
   * 确认进货。同一事务里加库存并回写进价。
   */
  async createPurchase(itemList: StorePurchaseLineCommand[], remark: string, operatorId: string): Promise<StorePurchaseView> {
    const shopId = await this.requireEnabledStoreShop();
    const cleanedItemList = this.normalizePurchaseItemList(itemList);
    return SimOrm.transaction(this.dataSource, async (entityManager) => {
      // 1. 锁住商品行，确认都属于当前门店
      const productIdList = cleanedItemList.map((purchaseLine) => toIdentifier(purchaseLine.productId));
      const productList = await entityManager
        .getRepository(StoreProduct)
        .createQueryBuilder('storeProduct')
        .setLock('pessimistic_write')
        .where('storeProduct.shopId = :shopId', { shopId })
        .andWhere('storeProduct.id IN (:...productIdList)', { productIdList })
        .getMany();
      if (productList.length !== productIdList.length) {
        throw new BusinessException('进货商品不存在');
      }
      // 2. 写进货单和明细，金额按进价乘数量累加
      let purchaseAmount = new Decimal(0);
      const purchase = new StorePurchase();
      purchase.shopId = shopId;
      purchase.purchaseNo = createBusinessNo(BusinessNoPrefix.STORE_PURCHASE);
      purchase.amount = toMoneyString(0);
      purchase.operatorId = operatorId;
      purchase.remark = isEmpty(remark) ? '' : remark.trim();
      const savedPurchase = await entityManager.getRepository(StorePurchase).save(purchase);
      const purchaseItemList: StorePurchaseItem[] = [];
      for (const purchaseLine of cleanedItemList) {
        const storeProduct = productList.find((productRow) => toIdentifier(productRow.id) === toIdentifier(purchaseLine.productId));
        if (isEmpty(storeProduct)) {
          throw new BusinessException('进货商品不存在');
        }
        const costPriceText = toMoneyString(purchaseLine.costPrice);
        const lineAmount = new Decimal(costPriceText).times(purchaseLine.quantity);
        purchaseAmount = purchaseAmount.plus(lineAmount);
        const purchaseItem = new StorePurchaseItem();
        purchaseItem.purchaseId = toIdentifier(savedPurchase.id);
        purchaseItem.productId = toIdentifier(storeProduct.id);
        purchaseItem.productName = storeProduct.productName;
        purchaseItem.costPrice = costPriceText;
        purchaseItem.quantity = purchaseLine.quantity;
        purchaseItem.lineAmount = toMoneyString(lineAmount);
        purchaseItemList.push(purchaseItem);
        storeProduct.stockQuantity = storeProduct.stockQuantity + purchaseLine.quantity;
        storeProduct.costPrice = costPriceText;
      }
      await entityManager.getRepository(StorePurchaseItem).save(purchaseItemList);
      savedPurchase.amount = toMoneyString(purchaseAmount);
      await entityManager.getRepository(StorePurchase).save(savedPurchase);
      await entityManager.getRepository(StoreProduct).save(productList);
      return (await this.toPurchaseViewList([savedPurchase], entityManager))[0];
    });
  }

  /**
   * 把开始、结束日期收成当天的起止时间。都不传则不限时间。
   */
  private resolveOrderTimeRange(startDate: string, endDate: string): { startAt: string; endAt: string } | null {
    const cleanedStartDate = isEmpty(startDate) ? '' : startDate.trim();
    const cleanedEndDate = isEmpty(endDate) ? '' : endDate.trim();
    if (isEmpty(cleanedStartDate) && isEmpty(cleanedEndDate)) {
      return null;
    }
    if (isEmpty(cleanedStartDate) || isEmpty(cleanedEndDate)) {
      throw new BusinessException('请选择完整的时间范围');
    }
    if (OrderDateTextPattern.test(cleanedStartDate) !== true || OrderDateTextPattern.test(cleanedEndDate) !== true) {
      throw new BusinessException('时间范围不正确');
    }
    if (cleanedEndDate < cleanedStartDate) {
      throw new BusinessException('结束日期不能早于开始日期');
    }
    return {
      startAt: `${cleanedStartDate} 00:00:00`,
      endAt: `${cleanedEndDate} 23:59:59`,
    };
  }

  /**
   * 分页查询销售单。
   */
  async pageSales(page: number, pageSize: number, startDate: string, endDate: string): Promise<PageResult<StoreSaleView>> {
    const shopId = await this.requireEnabledStoreShop();
    const pageSetting = resolvePage(page, pageSize);
    const whereCondition: FindOptionsWhere<StoreSale> = { shopId };
    const orderTimeRange = this.resolveOrderTimeRange(startDate, endDate);
    if (orderTimeRange !== null) {
      whereCondition.createdAt = Between(orderTimeRange.startAt, orderTimeRange.endAt);
    }
    const [saleList, total] = await this.storeSaleRepository.findAndCount({
      where: whereCondition,
      order: { id: 'DESC' },
      skip: pageSetting.skip,
      take: pageSetting.pageSize,
    });
    return {
      list: await this.toSaleViewList(saleList),
      total,
      page: pageSetting.page,
      pageSize: pageSetting.pageSize,
    };
  }

  /**
   * 当前门店还没送出的销售单。给收银台右侧面板用。
   */
  async listPendingDeliverySales(): Promise<StoreSaleView[]> {
    const shopId = await this.requireEnabledStoreShop();
    const saleList = await this.storeSaleRepository.find({
      where: { shopId, saleStatus: StoreSaleStatus.PENDING_DELIVERY },
      order: { id: 'ASC' },
    });
    return this.toSaleViewList(saleList);
  }

  /**
   * 把待发货销售单改为送货中，并记下送货信息。
   */
  async startDelivery(saleId: string, command: StartStoreDeliveryCommand): Promise<StoreSaleView> {
    const shopId = await this.requireEnabledStoreShop();
    const enabledShop = await this.shopService.findEnabledShop(shopId, ShopType.STORE);
    const deliveryInfoOptional = enabledShop.requireRoomNo === 1;
    const courierName = deliveryInfoOptional
      ? this.readOptionalDeliveryText(command.courierName, StoreDeliveryField.COURIER_NAME_MAX_LENGTH, '送货人过长')
      : this.readRequiredDeliveryText(command.courierName, StoreDeliveryField.COURIER_NAME_MAX_LENGTH, '请填写送货人', '送货人过长');
    const courierContact = deliveryInfoOptional
      ? this.readOptionalDeliveryText(command.courierContact, StoreDeliveryField.COURIER_CONTACT_MAX_LENGTH, '联系方式过长')
      : this.readRequiredDeliveryText(
          command.courierContact,
          StoreDeliveryField.COURIER_CONTACT_MAX_LENGTH,
          '请填写联系方式',
          '联系方式过长',
        );
    const deliveryNo = this.readOptionalDeliveryText(command.deliveryNo, StoreDeliveryField.DELIVERY_NO_MAX_LENGTH, '送货号过长');
    const deliveryRemark = this.readOptionalDeliveryText(command.deliveryRemark, StoreDeliveryField.REMARK_MAX_LENGTH, '送货备注过长');
    return SimOrm.transaction(this.dataSource, async (entityManager) => {
      // 1. 锁住销售单，只允许当前门店的待发货单进入送货
      const storeSale = await this.lockStoreSale(entityManager, saleId);
      if (toIdentifier(storeSale.shopId) !== toIdentifier(shopId)) {
        throw new BusinessException('订单不存在');
      }
      if (storeSale.saleStatus !== StoreSaleStatus.PENDING_DELIVERY) {
        throw new BusinessException('当前状态不能送货');
      }
      // 2. 写入送货信息并改为送货中
      storeSale.courierName = courierName;
      storeSale.courierContact = courierContact;
      storeSale.deliveryNo = deliveryNo;
      storeSale.deliveryRemark = deliveryRemark;
      storeSale.saleStatus = StoreSaleStatus.DELIVERING;
      const savedSale = await entityManager.getRepository(StoreSale).save(storeSale);
      return (await this.toSaleViewList([savedSale], entityManager))[0];
    });
  }

  /**
   * 收银台取消待发货销售单。库存加回，会员余额退回。
   */
  async cancelAdminSale(saleId: string, operatorId: string): Promise<StoreSaleView> {
    const shopId = await this.requireEnabledStoreShop();
    return this.cancelPendingDeliverySale({
      saleId,
      shopId,
      memberId: null,
      operatorId,
    });
  }

  /**
   * 会员取消自己的待发货销售单。库存加回，余额退回。
   */
  async cancelAppSale(memberId: string, saleId: string): Promise<StoreSaleView> {
    return this.cancelPendingDeliverySale({
      saleId,
      shopId: null,
      memberId,
      operatorId: null,
    });
  }

  /**
   * 会员确认收货。只接受送货中的本人订单，确认后进入待评价。
   */
  async confirmAppReceipt(memberId: string, saleId: string): Promise<StoreSaleView> {
    return SimOrm.transaction(this.dataSource, async (entityManager) => {
      const storeSale = await this.lockStoreSale(entityManager, saleId);
      if (isEmpty(storeSale.memberId) || toIdentifier(storeSale.memberId) !== toIdentifier(memberId)) {
        throw new BusinessException('只能确认自己的订单');
      }
      if (storeSale.saleStatus !== StoreSaleStatus.DELIVERING) {
        throw new BusinessException('当前状态不能确认收货');
      }
      storeSale.saleStatus = StoreSaleStatus.PENDING_REVIEW;
      const savedSale = await entityManager.getRepository(StoreSale).save(storeSale);
      return (await this.toSaleViewList([savedSale], entityManager))[0];
    });
  }

  /**
   * 取消待发货销售单：回库存，会员支付则退余额。
   */
  private async cancelPendingDeliverySale(command: {
    saleId: string;
    shopId: string | null;
    memberId: string | null;
    operatorId: string | null;
  }): Promise<StoreSaleView> {
    return SimOrm.transaction(this.dataSource, async (entityManager) => {
      // 1. 锁住销售单，确认还是待发货，并且是当前门店或本人的单
      const storeSale = await this.lockStoreSale(entityManager, command.saleId);
      if (isEmpty(command.shopId) !== true && toIdentifier(storeSale.shopId) !== toIdentifier(command.shopId)) {
        throw new BusinessException('订单不存在');
      }
      if (isEmpty(command.memberId) !== true && (isEmpty(storeSale.memberId) || toIdentifier(storeSale.memberId) !== toIdentifier(command.memberId))) {
        throw new BusinessException('只能取消自己的订单');
      }
      if (storeSale.saleStatus !== StoreSaleStatus.PENDING_DELIVERY) {
        throw new BusinessException('当前状态不能取消');
      }
      // 2. 按明细把库存加回去
      const saleItemList = await entityManager.getRepository(StoreSaleItem).find({
        where: { saleId: toIdentifier(storeSale.id) },
      });
      if (saleItemList.length === 0) {
        throw new BusinessException('订单没有商品');
      }
      const productIdList = saleItemList.map((saleItem) => toIdentifier(saleItem.productId));
      const productList = await entityManager
        .getRepository(StoreProduct)
        .createQueryBuilder('storeProduct')
        .setLock('pessimistic_write')
        .where('storeProduct.id IN (:...productIdList)', { productIdList })
        .getMany();
      for (const saleItem of saleItemList) {
        const storeProduct = productList.find((productRow) => toIdentifier(productRow.id) === toIdentifier(saleItem.productId));
        if (isEmpty(storeProduct)) {
          throw new BusinessException('商品不存在');
        }
        storeProduct.stockQuantity = storeProduct.stockQuantity + saleItem.quantity;
      }
      await entityManager.getRepository(StoreProduct).save(productList);
      // 3. 会员余额支付的单退回余额，然后改为已取消
      if (storeSale.payMethod === StorePayMethod.MEMBER && isEmpty(storeSale.memberId) !== true) {
        await this.memberBalanceService.refundBalance({
          entityManager,
          memberId: toIdentifier(storeSale.memberId),
          shopId: toIdentifier(storeSale.shopId),
          amount: storeSale.amount,
          bizOrderNo: storeSale.saleNo,
          operatorId: command.operatorId,
          remark: '商铺订单取消退款',
        });
      }
      storeSale.saleStatus = StoreSaleStatus.CANCELLED;
      const savedSale = await entityManager.getRepository(StoreSale).save(storeSale);
      return (await this.toSaleViewList([savedSale], entityManager))[0];
    });
  }

  /**
   * 锁住一张销售单。找不到就当订单不存在。
   */
  private async lockStoreSale(entityManager: EntityManager, saleId: string): Promise<StoreSale> {
    const storeSale = await entityManager
      .getRepository(StoreSale)
      .createQueryBuilder('storeSale')
      .setLock('pessimistic_write')
      .where('storeSale.id = :saleId', { saleId: toIdentifier(saleId) })
      .getOne();
    if (isEmpty(storeSale)) {
      throw new BusinessException('订单不存在');
    }
    return storeSale;
  }

  /**
   * 必填送货文字。去掉空白后不能空，也不能超过长度。
   */
  private readRequiredDeliveryText(value: string, maxLength: number, emptyMessage: string, tooLongMessage: string): string {
    const deliveryText = isEmpty(value) ? '' : value.trim();
    if (isEmpty(deliveryText)) {
      throw new BusinessException(emptyMessage);
    }
    if (deliveryText.length > maxLength) {
      throw new BusinessException(tooLongMessage);
    }
    return deliveryText;
  }

  /**
   * 可空送货文字。有内容时不能超过长度。
   */
  private readOptionalDeliveryText(value: string, maxLength: number, tooLongMessage: string): string {
    const deliveryText = isEmpty(value) ? '' : value.trim();
    if (deliveryText.length > maxLength) {
      throw new BusinessException(tooLongMessage);
    }
    return deliveryText;
  }

  /**
   * 会员分页查询自己的销售单。
   */
  async pageMemberSales(memberId: string, pageValue: unknown, pageSizeValue: unknown): Promise<PageResult<StoreSaleView>> {
    const pageSetting = resolvePage(pageValue, pageSizeValue);
    const [saleList, total] = await this.storeSaleRepository.findAndCount({
      where: { memberId: toIdentifier(memberId) },
      order: { id: 'DESC' },
      skip: pageSetting.skip,
      take: pageSetting.pageSize,
    });
    return {
      list: await this.toSaleViewList(saleList),
      total,
      page: pageSetting.page,
      pageSize: pageSetting.pageSize,
    };
  }

  /**
   * 后台收银台创建销售单。会员余额会扣款，现金只记单。
   */
  async createAdminSale(command: CreateStoreSaleCommand): Promise<StoreSaleView> {
    const shopId = await this.requireEnabledStoreShop();
    if (isOneOf(command.payMethod, Object.values(StorePayMethod)) !== true) {
      throw new BusinessException('收款方式不正确');
    }
    if (command.payMethod === StorePayMethod.MEMBER && isEmpty(command.memberId)) {
      throw new BusinessException('请选择会员');
    }
    if (command.payMethod === StorePayMethod.CASH && isEmpty(command.memberId) !== true) {
      throw new BusinessException('现金收款不要选择会员');
    }
    return this.createSaleInTransaction({
      shopId,
      payMethod: command.payMethod,
      memberId: isEmpty(command.memberId) ? null : toIdentifier(command.memberId),
      remark: command.remark,
      receiverName: '',
      contact: '',
      deliveryAddress: '',
      itemList: command.itemList,
      operatorId: command.operatorId,
      securityKeyUsername: '',
    });
  }

  /**
   * 小程序会员余额下单。先校验安全密钥，再扣库存和余额。
   */
  async createAppSale(memberId: string, command: CreateAppStoreSaleCommand): Promise<StoreSaleView> {
    const enabledShop = await this.shopService.findEnabledShop(command.shopId, ShopType.STORE);
    const shopId = toIdentifier(enabledShop.id);
    const receiverName = isEmpty(command.receiverName) ? '' : command.receiverName.trim();
    const contact = isEmpty(command.contact) ? '' : command.contact.trim();
    const deliveryAddress = isEmpty(command.deliveryAddress) ? '' : command.deliveryAddress.trim();
    if (isEmpty(receiverName)) {
      throw new BusinessException('请填写收货人');
    }
    if (isEmpty(contact)) {
      throw new BusinessException('请填写联系方式');
    }
    if (receiverName.length > HotelWalkInContact.MAX_LENGTH) {
      throw new BusinessException('收货人过长');
    }
    if (contact.length > HotelWalkInContact.MAX_LENGTH) {
      throw new BusinessException('联系方式过长');
    }
    if (isEmpty(deliveryAddress)) {
      throw new BusinessException('请填写收货地址');
    }
    const securityKeyUsername = this.miniappSignService.readConsumerDoorLockUsername(command.cipherText);
    const memberAccount = await this.memberQueryService.findById(memberId);
    if (isEmpty(memberAccount) || memberAccount.username !== securityKeyUsername) {
      throw new BusinessException('安全密钥无效');
    }
    return this.createSaleInTransaction({
      shopId,
      payMethod: StorePayMethod.MEMBER,
      memberId: toIdentifier(memberId),
      remark: '小程序购买',
      receiverName,
      contact,
      deliveryAddress,
      itemList: command.itemList,
      operatorId: null,
      securityKeyUsername,
    });
  }

  /**
   * 同一事务里先扣库存写入待支付销售单，再完成收款。收银台改为已完成，小程序改为待发货。
   */
  private async createSaleInTransaction(command: {
    shopId: string;
    payMethod: string;
    memberId: string | null;
    remark: string;
    receiverName: string;
    contact: string;
    deliveryAddress: string;
    itemList: StoreSaleLineCommand[];
    operatorId: string | null;
    securityKeyUsername: string;
  }): Promise<StoreSaleView> {
    const cleanedItemList = this.normalizeSaleItemList(command.itemList);
    void command.securityKeyUsername;
    return SimOrm.transaction(this.dataSource, async (entityManager) => {
      // 1. 锁住商品，确认可售且库存够
      const productIdList = cleanedItemList.map((saleLine) => toIdentifier(saleLine.productId));
      const productList = await entityManager
        .getRepository(StoreProduct)
        .createQueryBuilder('storeProduct')
        .setLock('pessimistic_write')
        .where('storeProduct.shopId = :shopId', { shopId: command.shopId })
        .andWhere('storeProduct.id IN (:...productIdList)', { productIdList })
        .getMany();
      if (productList.length !== productIdList.length) {
        throw new BusinessException('商品不存在');
      }
      let saleAmount = new Decimal(0);
      const saleItemList: StoreSaleItem[] = [];
      for (const saleLine of cleanedItemList) {
        const storeProduct = productList.find((productRow) => toIdentifier(productRow.id) === toIdentifier(saleLine.productId));
        if (isEmpty(storeProduct)) {
          throw new BusinessException('商品不存在');
        }
        if (storeProduct.status !== RecordStatus.ENABLED) {
          throw new BusinessException(`${storeProduct.productName}已停用`);
        }
        if (storeProduct.stockQuantity < saleLine.quantity) {
          throw new BusinessException(`${storeProduct.productName}库存不足`);
        }
        const lineAmount = new Decimal(storeProduct.salePrice).times(saleLine.quantity);
        saleAmount = saleAmount.plus(lineAmount);
        storeProduct.stockQuantity = storeProduct.stockQuantity - saleLine.quantity;
        const saleItem = new StoreSaleItem();
        saleItem.productId = toIdentifier(storeProduct.id);
        saleItem.productName = storeProduct.productName;
        saleItem.salePrice = storeProduct.salePrice;
        saleItem.quantity = saleLine.quantity;
        saleItem.lineAmount = toMoneyString(lineAmount);
        saleItemList.push(saleItem);
      }
      if (saleAmount.lte(0)) {
        throw new BusinessException('销售金额必须大于0');
      }
      // 2. 先写入待支付销售单和明细，并扣库存占货
      const storeSale = new StoreSale();
      storeSale.shopId = command.shopId;
      storeSale.saleNo = createBusinessNo(BusinessNoPrefix.STORE_SALE);
      storeSale.memberId = command.memberId;
      storeSale.payMethod = command.payMethod;
      storeSale.saleStatus = StoreSaleStatus.PENDING_PAY;
      storeSale.amount = toMoneyString(saleAmount);
      storeSale.operatorId = command.operatorId;
      storeSale.remark = isEmpty(command.remark) ? '' : command.remark.trim();
      storeSale.receiverName = isEmpty(command.receiverName) ? '' : command.receiverName.trim();
      storeSale.contact = isEmpty(command.contact) ? '' : command.contact.trim();
      storeSale.deliveryAddress = isEmpty(command.deliveryAddress) ? '' : command.deliveryAddress.trim();
      storeSale.courierName = '';
      storeSale.courierContact = '';
      storeSale.deliveryNo = '';
      storeSale.deliveryRemark = '';
      const savedSale = await entityManager.getRepository(StoreSale).save(storeSale);
      for (const saleItem of saleItemList) {
        saleItem.saleId = toIdentifier(savedSale.id);
      }
      await entityManager.getRepository(StoreSaleItem).save(saleItemList);
      await entityManager.getRepository(StoreProduct).save(productList);
      // 3. 会员余额收款时扣款；现金视为当场已收。以后接外部支付时，在回调里再改成已完成
      if (command.payMethod === StorePayMethod.MEMBER) {
        if (isEmpty(command.memberId)) {
          throw new BusinessException('请选择会员');
        }
        await this.memberBalanceService.deductBalance({
          entityManager,
          memberId: command.memberId,
          shopId: command.shopId,
          amount: savedSale.amount,
          bizType: FinanceBizType.STORE_SALE,
          bizOrderNo: savedSale.saleNo,
          operatorId: command.operatorId,
          remark: isEmpty(savedSale.remark) ? '商铺销售' : savedSale.remark,
        });
      }
      // 收银台直接已完成。小程序进入待发货
      if (isEmpty(command.operatorId) !== true) {
        savedSale.saleStatus = StoreSaleStatus.COMPLETED;
      } else {
        savedSale.saleStatus = StoreSaleStatus.PENDING_DELIVERY;
      }
      await entityManager.getRepository(StoreSale).save(savedSale);
      return (await this.toSaleViewList([savedSale], entityManager))[0];
    });
  }

  /**
   * 整理进货行。数量和进价都要合法。
   */
  private normalizePurchaseItemList(itemList: StorePurchaseLineCommand[]): StorePurchaseLineCommand[] {
    if (isEmpty(itemList) || itemList.length === 0) {
      throw new BusinessException('请选择进货商品');
    }
    if (itemList.length > StoreSaleItemLimit.MAX_COUNT) {
      throw new BusinessException('一次进货商品过多');
    }
    const cleanedItemList: StorePurchaseLineCommand[] = [];
    const productIdSet = new Set<string>();
    for (const purchaseLine of itemList) {
      const productId = toIdentifier(purchaseLine.productId);
      if (isEmpty(productId)) {
        throw new BusinessException('进货商品不存在');
      }
      if (productIdSet.has(productId)) {
        throw new BusinessException('进货商品重复');
      }
      if (Number.isInteger(purchaseLine.quantity) !== true || purchaseLine.quantity < 1) {
        throw new BusinessException('进货数量必须是正整数');
      }
      if (new Decimal(toMoneyString(purchaseLine.costPrice)).lt(0)) {
        throw new BusinessException('进价不能为负');
      }
      productIdSet.add(productId);
      cleanedItemList.push({
        productId,
        costPrice: purchaseLine.costPrice,
        quantity: purchaseLine.quantity,
      });
    }
    return cleanedItemList;
  }

  /**
   * 整理销售行。数量必须是正整数。
   */
  private normalizeSaleItemList(itemList: StoreSaleLineCommand[]): StoreSaleLineCommand[] {
    if (isEmpty(itemList) || itemList.length === 0) {
      throw new BusinessException('请选择商品');
    }
    if (itemList.length > StoreSaleItemLimit.MAX_COUNT) {
      throw new BusinessException('一次购买商品过多');
    }
    const cleanedItemList: StoreSaleLineCommand[] = [];
    const productIdSet = new Set<string>();
    for (const saleLine of itemList) {
      const productId = toIdentifier(saleLine.productId);
      if (isEmpty(productId)) {
        throw new BusinessException('商品不存在');
      }
      if (productIdSet.has(productId)) {
        throw new BusinessException('商品重复');
      }
      if (Number.isInteger(saleLine.quantity) !== true || saleLine.quantity < 1) {
        throw new BusinessException('购买数量必须是正整数');
      }
      productIdSet.add(productId);
      cleanedItemList.push({
        productId,
        quantity: saleLine.quantity,
      });
    }
    return cleanedItemList;
  }

  /**
   * 确认商品属于当前门店。
   */
  private async requireProduct(productId: string): Promise<StoreProduct> {
    const shopId = await this.requireEnabledStoreShop();
    const storeProduct = await this.storeProductRepository.findOne({ where: { id: productId, shopId } });
    if (isEmpty(storeProduct)) {
      throw new BusinessException('商品不存在');
    }
    return storeProduct;
  }

  /**
   * 按图片类型得到后缀。不支持的类型直接拒绝。
   */
  private resolveImageExtension(mimetype: string): string {
    if (mimetype === ShopImageMime.JPEG) {
      return '.jpg';
    }
    if (mimetype === ShopImageMime.PNG) {
      return '.png';
    }
    if (mimetype === ShopImageMime.WEBP) {
      return '.webp';
    }
    throw new BusinessException('只支持 jpg、png、webp');
  }

  /**
   * 转成前端使用的图片字段。
   */
  private toProductImageView(productImage: StoreProductImage): StoreProductImageView {
    return {
      imageId: toIdentifier(productImage.id),
      imageUrl: productImage.imageUrl,
    };
  }

  /**
   * 新建分类时排到当前门店最后。没有记录时从 0 开始。
   */
  private async nextProductCategorySortOrder(shopId: string): Promise<number> {
    const maxRow = await this.storeProductCategoryRepository
      .createQueryBuilder('categoryRow')
      .select('MAX(categoryRow.sortOrder)', 'maxSortOrder')
      .where('categoryRow.shopId = :shopId', { shopId })
      .getRawOne<{ maxSortOrder: number | string | null }>();
    if (isEmpty(maxRow) || isEmpty(maxRow.maxSortOrder)) {
      return 0;
    }
    return Number(maxRow.maxSortOrder) + 1;
  }

  /**
   * 校验进价：必须是数字且不能为负，再格式成金额字符串。
   */
  private resolveCostPrice(costPrice: string | number): string {
    if (isNumber(costPrice) !== true) {
      throw new BusinessException('进价不正确');
    }
    const costPriceText = toMoneyString(costPrice);
    if (new Decimal(costPriceText).lt(0)) {
      throw new BusinessException('进价不能为负');
    }
    return costPriceText;
  }

  /**
   * 新建商品时排到当前门店最后。没有记录时从 0 开始。
   */
  private async nextProductSortOrder(shopId: string): Promise<number> {
    const maxRow = await this.storeProductRepository
      .createQueryBuilder('storeProduct')
      .select('MAX(storeProduct.sortOrder)', 'maxSortOrder')
      .where('storeProduct.shopId = :shopId', { shopId })
      .getRawOne<{ maxSortOrder: number | string | null }>();
    if (isEmpty(maxRow) || isEmpty(maxRow.maxSortOrder)) {
      return 0;
    }
    return Number(maxRow.maxSortOrder) + 1;
  }

  /**
   * 校验分类属于当前门店。
   */
  private async requireProductCategory(shopId: string, categoryId: string): Promise<StoreProductCategory> {
    if (isEmpty(categoryId)) {
      throw new BusinessException('请选择商品分类');
    }
    const categoryRow = await this.storeProductCategoryRepository.findOne({
      where: { id: toIdentifier(categoryId), shopId },
    });
    if (isEmpty(categoryRow)) {
      throw new BusinessException('分类不存在');
    }
    return categoryRow;
  }

  /**
   * 同门店条码不可重复。excludeProductId 用于改商品时排除自身。
   */
  private async assertBarcodeAvailable(shopId: string, barcode: string, excludeProductId: string): Promise<void> {
    const queryBuilder = this.storeProductRepository
      .createQueryBuilder('storeProduct')
      .where('storeProduct.shopId = :shopId', { shopId })
      .andWhere('storeProduct.barcode = :barcode', { barcode });
    if (isEmpty(excludeProductId) !== true) {
      queryBuilder.andWhere('storeProduct.id != :excludeProductId', { excludeProductId });
    }
    const existingProduct = await queryBuilder.getOne();
    if (isEmpty(existingProduct) !== true) {
      throw new BusinessException('条码已存在');
    }
  }

  /**
   * 转成前端使用的分类字段。
   */
  private toProductCategoryView(categoryRow: StoreProductCategory, productCount = 0): StoreProductCategoryView {
    return {
      categoryId: toIdentifier(categoryRow.id),
      shopId: toIdentifier(categoryRow.shopId),
      categoryName: categoryRow.categoryName,
      sortOrder: categoryRow.sortOrder,
      status: categoryRow.status,
      productCount,
    };
  }

  /**
   * 取出详细描述正文。没有时为空串。
   */
  private readDescriptionContent(description: { content?: string } | null | undefined): string {
    if (isEmpty(description) || isEmpty(description.content)) {
      return '';
    }
    return description.content.trim();
  }

  /**
   * 转成前端使用的详细描述。没有正文时 content 为空串。
   */
  private toDescriptionView(description: { content?: string } | null | undefined): { content: string } {
    return { content: this.readDescriptionContent(description) };
  }

  /**
   * 快捷商品在库里是 0/1，有的驱动会读成布尔值。
   */
  private readQuickProduct(quickProduct: number | boolean): boolean {
    return quickProduct === true || quickProduct === QuickProductFlag.YES;
  }

  /**
   * 把商品实体转成前端字段。
   */
  private toProductView(storeProduct: StoreProduct, imageList: StoreProductImageView[], categoryName: string): StoreProductView {
    return {
      productId: toIdentifier(storeProduct.id),
      shopId: toIdentifier(storeProduct.shopId),
      categoryId: toIdentifier(storeProduct.categoryId),
      categoryName: isEmpty(categoryName) ? '' : categoryName,
      productName: storeProduct.productName,
      description: this.toDescriptionView(storeProduct.description),
      barcode: isEmpty(storeProduct.barcode) ? '' : storeProduct.barcode,
      salePrice: storeProduct.salePrice,
      costPrice: storeProduct.costPrice,
      stockQuantity: storeProduct.stockQuantity,
      quickProduct: this.readQuickProduct(storeProduct.quickProduct),
      status: storeProduct.status,
      imageList,
    };
  }

  /**
   * 批量转成带图片、分类名称的商品字段。
   */
  private async toProductViewList(productList: StoreProduct[]): Promise<StoreProductView[]> {
    const productIdList = productList.map((storeProduct) => toIdentifier(storeProduct.id));
    const imageList = productIdList.length === 0
      ? []
      : await this.storeProductImageRepository.find({
          where: { productId: In(productIdList) },
          order: { sortOrder: 'ASC', id: 'ASC' },
        });
    const categoryIdList = Array.from(
      new Set(productList.map((storeProduct) => toIdentifier(storeProduct.categoryId)).filter((categoryId) => isEmpty(categoryId) !== true)),
    );
    const categoryList = categoryIdList.length === 0
      ? []
      : await this.storeProductCategoryRepository.find({ where: { id: In(categoryIdList) } });
    const categoryNameMap = new Map(categoryList.map((categoryRow) => [toIdentifier(categoryRow.id), categoryRow.categoryName]));
    return productList.map((storeProduct) => {
      const productId = toIdentifier(storeProduct.id);
      const productImageList = imageList
        .filter((productImage) => toIdentifier(productImage.productId) === productId)
        .map((productImage) => this.toProductImageView(productImage));
      const categoryName = categoryNameMap.get(toIdentifier(storeProduct.categoryId)) || '';
      return this.toProductView(storeProduct, productImageList, categoryName);
    });
  }

  /**
   * 给进货单补上明细。
   */
  private async toPurchaseViewList(purchaseList: StorePurchase[], entityManager?: EntityManager): Promise<StorePurchaseView[]> {
    if (purchaseList.length === 0) {
      return [];
    }
    const purchaseIdList = purchaseList.map((purchase) => toIdentifier(purchase.id));
    const purchaseItemRepository = isEmpty(entityManager)
      ? this.storePurchaseItemRepository
      : entityManager.getRepository(StorePurchaseItem);
    const purchaseItemList = await purchaseItemRepository.find({ where: { purchaseId: In(purchaseIdList) } });
    return purchaseList.map((purchase) => {
      const itemList = purchaseItemList.filter((purchaseItem) => toIdentifier(purchaseItem.purchaseId) === toIdentifier(purchase.id));
      return {
        purchaseId: toIdentifier(purchase.id),
        purchaseNo: purchase.purchaseNo,
        amount: purchase.amount,
        remark: isEmpty(purchase.remark) ? '' : purchase.remark,
        createdAt: purchase.createdAt,
        itemList: itemList.map((purchaseItem) => ({
          productId: toIdentifier(purchaseItem.productId),
          productName: purchaseItem.productName,
          costPrice: purchaseItem.costPrice,
          quantity: purchaseItem.quantity,
          lineAmount: purchaseItem.lineAmount,
        })),
      };
    });
  }

  /**
   * 给销售单补上明细和会员用户名。
   */
  private async toSaleViewList(saleList: StoreSale[], entityManager?: EntityManager): Promise<StoreSaleView[]> {
    if (saleList.length === 0) {
      return [];
    }
    const saleIdList = saleList.map((sale) => toIdentifier(sale.id));
    const saleItemRepository = isEmpty(entityManager) ? this.storeSaleItemRepository : entityManager.getRepository(StoreSaleItem);
    const saleItemList = await saleItemRepository.find({ where: { saleId: In(saleIdList) } });
    const memberIdList = saleList.map((sale) => toIdentifier(sale.memberId)).filter((memberId) => isEmpty(memberId) !== true);
    const memberAccountList = memberIdList.length === 0 ? [] : await this.memberQueryService.findByIdList(memberIdList);
    return saleList.map((sale) => {
      const itemList = saleItemList.filter((saleItem) => toIdentifier(saleItem.saleId) === toIdentifier(sale.id));
      const memberAccount = memberAccountList.find((member) => toIdentifier(member.id) === toIdentifier(sale.memberId));
      return {
        saleId: toIdentifier(sale.id),
        saleNo: sale.saleNo,
        memberId: isEmpty(sale.memberId) ? '' : toIdentifier(sale.memberId),
        username: isEmpty(memberAccount) ? '' : memberAccount.username,
        payMethod: sale.payMethod,
        saleStatus: sale.saleStatus,
        amount: sale.amount,
        remark: isEmpty(sale.remark) ? '' : sale.remark,
        receiverName: isEmpty(sale.receiverName) ? '' : sale.receiverName,
        contact: isEmpty(sale.contact) ? '' : sale.contact,
        deliveryAddress: isEmpty(sale.deliveryAddress) ? '' : sale.deliveryAddress,
        courierName: isEmpty(sale.courierName) ? '' : sale.courierName,
        courierContact: isEmpty(sale.courierContact) ? '' : sale.courierContact,
        deliveryNo: isEmpty(sale.deliveryNo) ? '' : sale.deliveryNo,
        deliveryRemark: isEmpty(sale.deliveryRemark) ? '' : sale.deliveryRemark,
        createdAt: sale.createdAt,
        itemList: itemList.map((saleItem) => ({
          productId: toIdentifier(saleItem.productId),
          productName: saleItem.productName,
          salePrice: saleItem.salePrice,
          quantity: saleItem.quantity,
          lineAmount: saleItem.lineAmount,
        })),
      };
    });
  }
}
