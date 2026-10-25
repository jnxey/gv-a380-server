import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, EntityManager, FindOptionsWhere, Repository } from 'typeorm';
import {
  HotelOrderStatus,
  KtvOrderStatus,
  MysqlErrorCode,
  ShopReviewBizType,
  ShopReviewLimit,
  ShopType,
  StoreSaleStatus,
} from '../../common/constants';
import { BusinessException } from '../../common/exceptions/business.exception';
import { PageResult } from '../../common/interfaces/page-result';
import { ShopContext } from '../../common/context/shop-context';
import { isEmpty, isNumber, isOneOf, resolvePage, toIdentifier } from '../../common/tools';
import { SimOrm } from '../../common/tools/sim-orm';
import { HotelBookingOrder } from '../../module-hotel/hotel.entities';
import { KtvBookingOrder } from '../../module-ktv/ktv.entities';
import { StoreSale } from '../../module-store/store.entities';
import { MemberQueryService } from '../member/member-query.service';
import { ShopReview } from './shop-review.entity';
import { ShopService } from './shop.service';

const ReviewDateTextPattern = /^\d{4}-\d{2}-\d{2}$/;

export interface CreateShopReviewCommand {
  bizType: string;
  bizOrderId: string;
  starRating: number;
  content: string;
}

export interface ShopReviewView {
  reviewId: string;
  shopId: string;
  shopType: string;
  memberId: string;
  username: string;
  bizType: string;
  bizOrderId: string;
  bizOrderNo: string;
  starRating: number;
  content: string;
  createdAt: string;
}

/**
 * 门店评价：按店分页查询，会员对可评价单据提交星级和文字。
 */
@Injectable()
export class ShopReviewService {
  constructor(
    @InjectRepository(ShopReview) private readonly shopReviewRepository: Repository<ShopReview>,
    private readonly dataSource: DataSource,
    private readonly memberQueryService: MemberQueryService,
    private readonly shopService: ShopService,
  ) {}

  /**
   * 按门店分页查评价，给小程序店铺评价 Tab 用。
   */
  async pageByShopId(shopId: string, pageValue: unknown, pageSizeValue: unknown): Promise<PageResult<ShopReviewView>> {
    if (isEmpty(shopId)) {
      throw new BusinessException('门店不存在');
    }
    await this.shopService.findById(shopId);
    return this.pageReviews({ shopId }, pageValue, pageSizeValue, '', '');
  }

  /**
   * 后台按当前门店分页查评价，可按创建日期筛选。
   */
  async pageByCurrentShop(
    pageValue: unknown,
    pageSizeValue: unknown,
    startDate = '',
    endDate = '',
  ): Promise<PageResult<ShopReviewView>> {
    const shopId = ShopContext.getCurrentShopId();
    if (isEmpty(shopId)) {
      throw new BusinessException('请选择门店');
    }
    return this.pageReviews({ shopId }, pageValue, pageSizeValue, startDate, endDate);
  }

  /**
   * 会员提交门店评价。校验单据归属与待评价状态，写评价并把单据落到终态。
   */
  async createReview(memberId: string, command: CreateShopReviewCommand): Promise<ShopReviewView> {
    this.assertCreateCommand(command);
    const bizOrderId = toIdentifier(command.bizOrderId);
    const starRating = Number(command.starRating);
    const contentText = isEmpty(command.content) ? '' : command.content.trim();
    try {
      const savedReview = await SimOrm.transaction(this.dataSource, async (entityManager) => {
        if (command.bizType === ShopReviewBizType.KTV_BOOKING) {
          return this.createKtvReview(entityManager, memberId, bizOrderId, starRating, contentText);
        }
        if (command.bizType === ShopReviewBizType.HOTEL_BOOKING) {
          return this.createHotelReview(entityManager, memberId, bizOrderId, starRating, contentText);
        }
        if (command.bizType === ShopReviewBizType.STORE_SALE) {
          return this.createStoreReview(entityManager, memberId, bizOrderId, starRating, contentText);
        }
        throw new BusinessException('评价业务类型不正确');
      });
      const viewList = await this.toReviewViewList([savedReview]);
      return viewList[0];
    } catch (error) {
      this.rethrowDuplicateReview(error);
    }
  }

  /**
   * 校验提交评价参数。
   */
  private assertCreateCommand(command: CreateShopReviewCommand): void {
    if (isOneOf(command.bizType, Object.values(ShopReviewBizType)) !== true) {
      throw new BusinessException('评价业务类型不正确');
    }
    if (isEmpty(command.bizOrderId)) {
      throw new BusinessException('订单不存在');
    }
    if (isNumber(command.starRating) !== true) {
      throw new BusinessException('请选择星级');
    }
    const starRating = Number(command.starRating);
    if (Number.isInteger(starRating) !== true || starRating < ShopReviewLimit.STAR_MIN || starRating > ShopReviewLimit.STAR_MAX) {
      throw new BusinessException(`星级须在${ShopReviewLimit.STAR_MIN}到${ShopReviewLimit.STAR_MAX}之间`);
    }
    const contentText = isEmpty(command.content) ? '' : command.content.trim();
    if (contentText.length > ShopReviewLimit.CONTENT_MAX_LENGTH) {
      throw new BusinessException(`评价内容不能超过${ShopReviewLimit.CONTENT_MAX_LENGTH}字`);
    }
  }

  /**
   * 按条件分页查评价并拼会员账号。
   */
  private async pageReviews(
    whereCondition: { shopId: string },
    pageValue: unknown,
    pageSizeValue: unknown,
    startDate: string,
    endDate: string,
  ): Promise<PageResult<ShopReviewView>> {
    const pageResult = resolvePage(pageValue, pageSizeValue);
    const reviewWhere: FindOptionsWhere<ShopReview> = { shopId: whereCondition.shopId };
    const reviewTimeRange = this.resolveReviewTimeRange(startDate, endDate);
    if (isEmpty(reviewTimeRange) !== true) {
      reviewWhere.createdAt = Between(reviewTimeRange.startAt, reviewTimeRange.endAt);
    }
    const [reviewList, total] = await this.shopReviewRepository.findAndCount({
      where: reviewWhere,
      order: { id: 'DESC' },
      skip: pageResult.skip,
      take: pageResult.pageSize,
    });
    return {
      list: await this.toReviewViewList(reviewList),
      total,
      page: pageResult.page,
      pageSize: pageResult.pageSize,
    };
  }

  /**
   * 把开始、结束日期收成当天的起止时间。都不传则不限时间。
   */
  private resolveReviewTimeRange(startDate: string, endDate: string): { startAt: string; endAt: string } | null {
    const cleanedStartDate = isEmpty(startDate) ? '' : startDate.trim();
    const cleanedEndDate = isEmpty(endDate) ? '' : endDate.trim();
    if (isEmpty(cleanedStartDate) && isEmpty(cleanedEndDate)) {
      return null;
    }
    if (isEmpty(cleanedStartDate) || isEmpty(cleanedEndDate)) {
      throw new BusinessException('请选择完整的时间范围');
    }
    if (ReviewDateTextPattern.test(cleanedStartDate) !== true || ReviewDateTextPattern.test(cleanedEndDate) !== true) {
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
   * 提交 KTV 预订评价并把订单改为已完成。
   */
  private async createKtvReview(
    entityManager: EntityManager,
    memberId: string,
    bizOrderId: string,
    starRating: number,
    contentText: string,
  ): Promise<ShopReview> {
    const bookingOrder = await entityManager
      .getRepository(KtvBookingOrder)
      .createQueryBuilder('bookingOrder')
      .setLock('pessimistic_write')
      .where('bookingOrder.id = :bizOrderId', { bizOrderId })
      .getOne();
    if (isEmpty(bookingOrder)) {
      throw new BusinessException('订单不存在');
    }
    if (toIdentifier(bookingOrder.memberId) !== toIdentifier(memberId)) {
      throw new BusinessException('只能评价自己的订单');
    }
    if (bookingOrder.orderStatus !== KtvOrderStatus.PENDING_REVIEW) {
      throw new BusinessException('当前订单不可评价');
    }
    bookingOrder.orderStatus = KtvOrderStatus.COMPLETED;
    await entityManager.getRepository(KtvBookingOrder).save(bookingOrder);
    return this.saveReviewRow(entityManager, {
      shopId: toIdentifier(bookingOrder.shopId),
      shopType: ShopType.KTV,
      memberId: toIdentifier(memberId),
      bizType: ShopReviewBizType.KTV_BOOKING,
      bizOrderId: toIdentifier(bookingOrder.id),
      bizOrderNo: bookingOrder.orderNo,
      starRating,
      contentText,
    });
  }

  /**
   * 提交酒店预订评价并把订单改为已退房。
   */
  private async createHotelReview(
    entityManager: EntityManager,
    memberId: string,
    bizOrderId: string,
    starRating: number,
    contentText: string,
  ): Promise<ShopReview> {
    const bookingOrder = await entityManager
      .getRepository(HotelBookingOrder)
      .createQueryBuilder('bookingOrder')
      .setLock('pessimistic_write')
      .where('bookingOrder.id = :bizOrderId', { bizOrderId })
      .getOne();
    if (isEmpty(bookingOrder)) {
      throw new BusinessException('订单不存在');
    }
    if (isEmpty(bookingOrder.memberId) || toIdentifier(bookingOrder.memberId) !== toIdentifier(memberId)) {
      throw new BusinessException('只能评价自己的订单');
    }
    if (bookingOrder.orderStatus !== HotelOrderStatus.PENDING_REVIEW) {
      throw new BusinessException('当前订单不可评价');
    }
    bookingOrder.orderStatus = HotelOrderStatus.CHECKED_OUT;
    await entityManager.getRepository(HotelBookingOrder).save(bookingOrder);
    return this.saveReviewRow(entityManager, {
      shopId: toIdentifier(bookingOrder.shopId),
      shopType: ShopType.HOTEL,
      memberId: toIdentifier(memberId),
      bizType: ShopReviewBizType.HOTEL_BOOKING,
      bizOrderId: toIdentifier(bookingOrder.id),
      bizOrderNo: bookingOrder.orderNo,
      starRating,
      contentText,
    });
  }

  /**
   * 提交商铺销售评价并把销售单改为已完成。
   */
  private async createStoreReview(
    entityManager: EntityManager,
    memberId: string,
    bizOrderId: string,
    starRating: number,
    contentText: string,
  ): Promise<ShopReview> {
    const storeSale = await entityManager
      .getRepository(StoreSale)
      .createQueryBuilder('storeSale')
      .setLock('pessimistic_write')
      .where('storeSale.id = :bizOrderId', { bizOrderId })
      .getOne();
    if (isEmpty(storeSale)) {
      throw new BusinessException('订单不存在');
    }
    if (isEmpty(storeSale.memberId) || toIdentifier(storeSale.memberId) !== toIdentifier(memberId)) {
      throw new BusinessException('只能评价自己的订单');
    }
    if (storeSale.saleStatus !== StoreSaleStatus.PENDING_REVIEW) {
      throw new BusinessException('当前订单不可评价');
    }
    storeSale.saleStatus = StoreSaleStatus.COMPLETED;
    await entityManager.getRepository(StoreSale).save(storeSale);
    return this.saveReviewRow(entityManager, {
      shopId: toIdentifier(storeSale.shopId),
      shopType: ShopType.STORE,
      memberId: toIdentifier(memberId),
      bizType: ShopReviewBizType.STORE_SALE,
      bizOrderId: toIdentifier(storeSale.id),
      bizOrderNo: storeSale.saleNo,
      starRating,
      contentText,
    });
  }

  /**
   * 写入一条门店评价。
   */
  private async saveReviewRow(
    entityManager: EntityManager,
    command: {
      shopId: string;
      shopType: string;
      memberId: string;
      bizType: string;
      bizOrderId: string;
      bizOrderNo: string;
      starRating: number;
      contentText: string;
    },
  ): Promise<ShopReview> {
    const shopReview = new ShopReview();
    shopReview.shopId = command.shopId;
    shopReview.shopType = command.shopType;
    shopReview.memberId = command.memberId;
    shopReview.bizType = command.bizType;
    shopReview.bizOrderId = command.bizOrderId;
    shopReview.bizOrderNo = command.bizOrderNo;
    shopReview.starRating = command.starRating;
    shopReview.content = command.contentText;
    return entityManager.getRepository(ShopReview).save(shopReview);
  }

  /**
   * 评价列表拼会员账号。
   */
  private async toReviewViewList(reviewList: ShopReview[]): Promise<ShopReviewView[]> {
    if (reviewList.length === 0) {
      return [];
    }
    const memberIdList = reviewList.map((reviewRow) => toIdentifier(reviewRow.memberId));
    const memberAccountList = await this.memberQueryService.findByIdList(memberIdList);
    return reviewList.map((reviewRow) => {
      const memberAccount = memberAccountList.find((member) => toIdentifier(member.id) === toIdentifier(reviewRow.memberId));
      return {
        reviewId: toIdentifier(reviewRow.id),
        shopId: toIdentifier(reviewRow.shopId),
        shopType: reviewRow.shopType,
        memberId: toIdentifier(reviewRow.memberId),
        username: isEmpty(memberAccount) ? '' : memberAccount.username,
        bizType: reviewRow.bizType,
        bizOrderId: toIdentifier(reviewRow.bizOrderId),
        bizOrderNo: reviewRow.bizOrderNo,
        starRating: reviewRow.starRating,
        content: isEmpty(reviewRow.content) ? '' : reviewRow.content,
        createdAt: reviewRow.createdAt,
      };
    });
  }

  /**
   * 唯一约束冲突时提示已评价。
   */
  private rethrowDuplicateReview(error: unknown): never {
    if (isMysqlDuplicateEntry(error)) {
      throw new BusinessException('该订单已评价');
    }
    throw error;
  }
}

/**
 * 判断是否 MySQL 唯一键冲突。
 */
function isMysqlDuplicateEntry(error: unknown): boolean {
  if (isEmpty(error) || typeof error !== 'object') {
    return false;
  }
  const errorRecord = error as { code?: string; errno?: number; driverError?: { code?: string; errno?: number } };
  const errorCode = errorRecord.code || errorRecord.driverError?.code;
  if (errorCode === MysqlErrorCode.DUPLICATE_ENTRY) {
    return true;
  }
  return false;
}
