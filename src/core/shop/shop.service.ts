import { randomUUID } from 'crypto';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { join } from 'path';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { RecordStatus, ShopImageLimit, ShopImageMime, ShopType } from '../../common/constants';
import { BusinessException } from '../../common/exceptions/business.exception';
import { isDuplicateEntryError, isEmpty, toIdentifier } from '../../common/tools';
import { SysUserShop } from '../rbac/sys.entities';
import { ShopImage } from './shop-image.entity';
import { Shop, ShopAddressLocation, ShopBusinessHours } from './shop.entity';

/**
 * 前端使用的一张门店图片。
 */
export interface ShopImageView {
  imageId: string;
  imageUrl: string;
}

/**
 * 上传文件里服务需要的字段。
 */
export interface ShopImageFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

/**
 * 保存门店时的输入。
 */
export interface SaveShopCommand {
  shopCode: string;
  shopName: string;
  address: string;
  contactPhone: string;
  status: string;
  operatorId: string;
  boundShopIdList: string[];
  timeZone?: string;
  businessHours?: { startTime?: string; endTime?: string } | null;
  shopAddress?: { longitude?: number | null; latitude?: number | null; addressText?: string } | null;
}

/**
 * 门店主数据。业务订房前用这里确认门店类型和启停状态。
 */
@Injectable()
export class ShopService {
  constructor(
    @InjectRepository(Shop)
    private readonly shopRepository: Repository<Shop>,
    @InjectRepository(SysUserShop)
    private readonly sysUserShopRepository: Repository<SysUserShop>,
    @InjectRepository(ShopImage)
    private readonly shopImageRepository: Repository<ShopImage>,
  ) {}

  /**
   * 按主键读取启用中的门店，并校验门店类型。
   */
  async findEnabledShop(shopId: string, shopType: string): Promise<Shop> {
    const shop = await this.shopRepository.findOne({
      where: { id: shopId, shopType, status: RecordStatus.ENABLED },
    });
    if (isEmpty(shop)) {
      throw new BusinessException('门店不存在或已停用');
    }
    return shop;
  }

  /**
   * 在调用方事务中读取启用门店，保证和后续写入看到同一批数据。
   */
  async findEnabledShopInManager(entityManager: EntityManager, shopId: string, shopType: string): Promise<Shop> {
    const shop = await entityManager.getRepository(Shop).findOne({
      where: { id: shopId, shopType, status: RecordStatus.ENABLED },
    });
    if (isEmpty(shop)) {
      throw new BusinessException('门店不存在或已停用');
    }
    return shop;
  }

  /**
   * 按门店编码读取启用中的门店。编码全表唯一，不区分门店类型。
   */
  async findEnabledShopByCode(shopCode: string): Promise<Shop> {
    const shop = await this.shopRepository.findOne({
      where: { shopCode, status: RecordStatus.ENABLED },
    });
    if (isEmpty(shop)) {
      throw new BusinessException('门店不存在或已停用');
    }
    return shop;
  }

  /**
   * 在调用方事务中按门店编码读取启用门店。
   */
  async findEnabledShopByCodeInManager(entityManager: EntityManager, shopCode: string): Promise<Shop> {
    const shop = await entityManager.getRepository(Shop).findOne({
      where: { shopCode, status: RecordStatus.ENABLED },
    });
    if (isEmpty(shop)) {
      throw new BusinessException('门店不存在或已停用');
    }
    return shop;
  }

  /**
   * 按主键读取门店，不限制启停。供门店类型校验使用。
   */
  async findById(shopId: string): Promise<Shop> {
    const shop = await this.shopRepository.findOne({ where: { id: shopId } });
    if (isEmpty(shop)) {
      throw new BusinessException('门店不存在');
    }
    return shop;
  }

  /**
   * 按主键批量读取门店。
   */
  async findByIdList(shopIdList: string[]): Promise<Shop[]> {
    if (shopIdList.length === 0) {
      return [];
    }
    return this.shopRepository.find({ where: { id: In(shopIdList) } });
  }

  /**
   * 小程序按门店类型列出可预订的启用门店。
   */
  async listEnabledByType(shopType: string): Promise<Shop[]> {
    return this.shopRepository.find({
      where: { shopType, status: RecordStatus.ENABLED },
      order: { id: 'ASC' },
    });
  }

  /**
   * 列出当前账号已绑定、且类型匹配的门店。未绑定任何门店时返回空列表。
   */
  async listBoundShops(boundShopIdList: string[], shopType: string): Promise<Shop[]> {
    if (boundShopIdList.length === 0) {
      return [];
    }
    return this.shopRepository.find({
      where: { id: In(boundShopIdList), shopType },
      order: { id: 'ASC' },
    });
  }

  /**
   * 新建 KTV 门店，并把创建人绑定到该门店。
   */
  async createKtvShop(command: SaveShopCommand): Promise<Shop> {
    const shop = new Shop();
    shop.shopCode = command.shopCode;
    shop.shopName = command.shopName;
    shop.shopType = ShopType.KTV;
    this.fillKtvShopProfile(shop, command);
    shop.contactPhone = isEmpty(command.contactPhone) ? '' : command.contactPhone;
    shop.status = command.status;
    try {
      return await this.shopRepository.manager.transaction(async (entityManager) => {
        const savedShop = await entityManager.getRepository(Shop).save(shop);
        const sysUserShop = new SysUserShop();
        sysUserShop.userId = command.operatorId;
        sysUserShop.shopId = toIdentifier(savedShop.id);
        await entityManager.getRepository(SysUserShop).save(sysUserShop);
        return savedShop;
      });
    } catch (error) {
      if (isDuplicateEntryError(error)) {
        throw new BusinessException('门店编码已存在');
      }
      throw error;
    }
  }

  /**
   * 修改已绑定的 KTV 门店。不能改门店类型，也不能改未绑定的门店。
   */
  async updateKtvShop(shopId: string, command: SaveShopCommand): Promise<Shop> {
    if (!command.boundShopIdList.includes(toIdentifier(shopId))) {
      throw new BusinessException('无权修改该门店');
    }
    const shop = await this.shopRepository.findOne({ where: { id: shopId, shopType: ShopType.KTV } });
    if (isEmpty(shop)) {
      throw new BusinessException('KTV门店不存在');
    }
    shop.shopCode = command.shopCode;
    shop.shopName = command.shopName;
    this.fillKtvShopProfile(shop, command);
    shop.contactPhone = isEmpty(command.contactPhone) ? '' : command.contactPhone;
    shop.status = command.status;
    try {
      return await this.shopRepository.save(shop);
    } catch (error) {
      if (isDuplicateEntryError(error)) {
        throw new BusinessException('门店编码已存在');
      }
      throw error;
    }
  }

  /**
   * 新建酒店门店，并把创建人绑定到该门店。
   */
  async createHotelShop(command: SaveShopCommand): Promise<Shop> {
    const shop = new Shop();
    shop.shopCode = command.shopCode;
    shop.shopName = command.shopName;
    shop.shopType = ShopType.HOTEL;
    shop.address = isEmpty(command.address) ? '' : command.address;
    shop.timeZone = '';
    shop.businessHours = null;
    shop.shopAddress = null;
    shop.contactPhone = isEmpty(command.contactPhone) ? '' : command.contactPhone;
    shop.status = command.status;
    try {
      return await this.shopRepository.manager.transaction(async (entityManager) => {
        const savedShop = await entityManager.getRepository(Shop).save(shop);
        const sysUserShop = new SysUserShop();
        sysUserShop.userId = command.operatorId;
        sysUserShop.shopId = toIdentifier(savedShop.id);
        await entityManager.getRepository(SysUserShop).save(sysUserShop);
        return savedShop;
      });
    } catch (error) {
      if (isDuplicateEntryError(error)) {
        throw new BusinessException('门店编码已存在');
      }
      throw error;
    }
  }

  /**
   * 修改已绑定的酒店门店。不能改门店类型，也不能改未绑定的门店。
   */
  async updateHotelShop(shopId: string, command: SaveShopCommand): Promise<Shop> {
    if (!command.boundShopIdList.includes(toIdentifier(shopId))) {
      throw new BusinessException('无权修改该门店');
    }
    const shop = await this.shopRepository.findOne({ where: { id: shopId, shopType: ShopType.HOTEL } });
    if (isEmpty(shop)) {
      throw new BusinessException('酒店门店不存在');
    }
    shop.shopCode = command.shopCode;
    shop.shopName = command.shopName;
    shop.address = isEmpty(command.address) ? '' : command.address;
    shop.contactPhone = isEmpty(command.contactPhone) ? '' : command.contactPhone;
    shop.status = command.status;
    try {
      return await this.shopRepository.save(shop);
    } catch (error) {
      if (isDuplicateEntryError(error)) {
        throw new BusinessException('门店编码已存在');
      }
      throw error;
    }
  }

  /**
   * 给一家已绑定门店追加图片。超过张数、类型或大小时拒绝。
   */
  async addShopImage(shopId: string, shopType: string, boundShopIdList: string[], file: ShopImageFile): Promise<ShopImageView> {
    await this.findWritableShop(shopId, shopType, boundShopIdList);
    if (isEmpty(file) || isEmpty(file.buffer) || file.buffer.length === 0) {
      throw new BusinessException('请选择图片');
    }
    const extension = this.resolveImageExtension(file.mimetype);
    if (file.size > ShopImageLimit.MAX_BYTES) {
      throw new BusinessException('图片不能超过5MB');
    }
    const imageCount = await this.shopImageRepository.count({ where: { shopId } });
    if (imageCount >= ShopImageLimit.MAX_COUNT) {
      throw new BusinessException('门店图片最多6张');
    }
    const fileName = `${randomUUID()}${extension}`;
    const directoryPath = join(process.cwd(), 'uploads', 'shop', toIdentifier(shopId));
    await mkdir(directoryPath, { recursive: true });
    await writeFile(join(directoryPath, fileName), file.buffer);
    const shopImage = new ShopImage();
    shopImage.shopId = toIdentifier(shopId);
    shopImage.imageUrl = `/uploads/shop/${toIdentifier(shopId)}/${fileName}`;
    shopImage.sortOrder = imageCount;
    const savedImage = await this.shopImageRepository.save(shopImage);
    return this.toImageView(savedImage);
  }

  /**
   * 删除一张已绑定门店的图片，并删掉磁盘文件。
   */
  async removeShopImage(shopId: string, imageId: string, shopType: string, boundShopIdList: string[]): Promise<void> {
    await this.findWritableShop(shopId, shopType, boundShopIdList);
    const shopImage = await this.shopImageRepository.findOne({ where: { id: imageId, shopId } });
    if (isEmpty(shopImage)) {
      throw new BusinessException('门店图片不存在');
    }
    const fileName = shopImage.imageUrl.slice(shopImage.imageUrl.lastIndexOf('/') + 1);
    const filePath = join(process.cwd(), 'uploads', 'shop', toIdentifier(shopId), fileName);
    try {
      await unlink(filePath);
    } catch (error) {
      const errorCode = (error as { code?: string }).code;
      if (errorCode !== 'ENOENT') {
        throw error;
      }
    }
    await this.shopImageRepository.delete({ id: shopImage.id });
  }

  /**
   * 转成带图片列表的门店字段。
   */
  async toShopViewWithImages(shop: Shop): Promise<ReturnType<ShopService['toShopView']> & { imageList: ShopImageView[] }> {
    const viewList = await this.toShopViewList([shop]);
    return viewList[0];
  }

  /**
   * 批量转成带图片列表的门店字段。
   */
  async toShopViewList(shopList: Shop[]): Promise<Array<ReturnType<ShopService['toShopView']> & { imageList: ShopImageView[] }>> {
    const shopIdList = shopList.map((shop) => toIdentifier(shop.id));
    const imageList = shopIdList.length === 0 ? [] : await this.shopImageRepository.find({
      where: { shopId: In(shopIdList) },
      order: { sortOrder: 'ASC', id: 'ASC' },
    });
    return shopList.map((shop) => {
      const shopId = toIdentifier(shop.id);
      return {
        ...this.toShopView(shop),
        imageList: imageList.filter((shopImage) => toIdentifier(shopImage.shopId) === shopId).map((shopImage) => this.toImageView(shopImage)),
      };
    });
  }

  /**
   * 确认门店已绑定，且类型与当前业务一致。
   */
  private async findWritableShop(shopId: string, shopType: string, boundShopIdList: string[]): Promise<Shop> {
    if (!boundShopIdList.includes(toIdentifier(shopId))) {
      throw new BusinessException('无权修改该门店');
    }
    const shop = await this.shopRepository.findOne({ where: { id: shopId, shopType } });
    if (isEmpty(shop)) {
      throw new BusinessException('门店不存在');
    }
    return shop;
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
  private toImageView(shopImage: ShopImage): ShopImageView {
    return {
      imageId: toIdentifier(shopImage.id),
      imageUrl: shopImage.imageUrl,
    };
  }

  /**
   * 写入 KTV 门店的时区、营业时间和地址。地址描述同时写回原来的地址文本。
   */
  private fillKtvShopProfile(shop: Shop, command: SaveShopCommand): void {
    if (isEmpty(command.timeZone)) {
      throw new BusinessException('请填写门店时区');
    }
    if (isEmpty(command.contactPhone)) {
      throw new BusinessException('请填写电话');
    }
    shop.timeZone = command.timeZone;
    shop.businessHours = this.normalizeBusinessHours(command.businessHours);
    shop.shopAddress = this.normalizeShopAddress(command.shopAddress);
    shop.address = shop.shopAddress.addressText;
  }

  /**
   * 营业时间的开始和结束都必须有，且结束要晚于开始。
   */
  private normalizeBusinessHours(businessHours: { startTime?: string; endTime?: string } | null | undefined): ShopBusinessHours {
    const startTime = isEmpty(businessHours) || isEmpty(businessHours.startTime) ? '' : businessHours.startTime;
    const endTime = isEmpty(businessHours) || isEmpty(businessHours.endTime) ? '' : businessHours.endTime;
    if (isEmpty(startTime) || isEmpty(endTime)) {
      throw new BusinessException('请填写营业时间');
    }
    if (endTime <= startTime) {
      throw new BusinessException('结束时间必须晚于开始时间');
    }
    return {
      startTime,
      endTime,
    };
  }

  /**
   * 门店位置必须有经纬度。地址描述可以空。
   */
  private normalizeShopAddress(shopAddress: { longitude?: number | null; latitude?: number | null; addressText?: string } | null | undefined): ShopAddressLocation {
    const addressText = isEmpty(shopAddress) || isEmpty(shopAddress.addressText) ? '' : shopAddress.addressText;
    const longitude = isEmpty(shopAddress) || isEmpty(shopAddress.longitude) ? null : shopAddress.longitude;
    const latitude = isEmpty(shopAddress) || isEmpty(shopAddress.latitude) ? null : shopAddress.latitude;
    if (isEmpty(longitude) || isEmpty(latitude)) {
      throw new BusinessException('请选择门店位置');
    }
    return {
      longitude,
      latitude,
      addressText,
    };
  }

  /**
   * 转成前端使用的门店字段。
   */
  toShopView(shop: Shop): {
    shopId: string;
    shopCode: string;
    shopName: string;
    shopType: string;
    address: string;
    contactPhone: string;
    status: string;
    timeZone: string;
    businessHours: ShopBusinessHours | null;
    shopAddress: ShopAddressLocation | null;
  } {
    return {
      shopId: toIdentifier(shop.id),
      shopCode: shop.shopCode,
      shopName: shop.shopName,
      shopType: shop.shopType,
      address: shop.address,
      contactPhone: shop.contactPhone,
      status: shop.status,
      timeZone: isEmpty(shop.timeZone) ? '' : shop.timeZone,
      businessHours: isEmpty(shop.businessHours) ? null : shop.businessHours,
      shopAddress: isEmpty(shop.shopAddress) ? null : shop.shopAddress,
    };
  }
}
