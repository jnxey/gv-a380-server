import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { RecordStatus, ShopType } from '../../common/constants';
import { BusinessException } from '../../common/exceptions/business.exception';
import { isDuplicateEntryError, isEmpty, toIdentifier } from '../../common/tools';
import { SysUserShop } from '../rbac/sys.entities';
import { Shop } from './shop.entity';

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
    shop.address = isEmpty(command.address) ? '' : command.address;
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
   * 转成前端使用的门店字段。
   */
  toShopView(shop: Shop): { shopId: string; shopCode: string; shopName: string; shopType: string; address: string; contactPhone: string; status: string } {
    return {
      shopId: toIdentifier(shop.id),
      shopCode: shop.shopCode,
      shopName: shop.shopName,
      shopType: shop.shopType,
      address: shop.address,
      contactPhone: shop.contactPhone,
      status: shop.status,
    };
  }
}
