import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import Decimal from 'decimal.js';
import { DataSource, EntityManager } from 'typeorm';
import {
  FinanceBizType,
  FinanceDirection,
  NumberBoundary,
  PointChangeType,
  PointRule,
  RecordStatus,
  BusinessNoPrefix,
} from '../../common/constants';
import { BusinessException } from '../../common/exceptions/business.exception';
import { ShopContext } from '../../common/context/shop-context';
import { calculateEarnedPoints, createBusinessNo, isEmpty, isPositiveMoney, toIdentifier, toMoneyString } from '../../common/tools';
import { FinanceBill } from '../finance/finance-bill.entity';
import { MemberAccount } from './member-account.entity';
import { MemberPointLog } from './member-point-log.entity';

/**
 * 余额变动命令。必须带着调用方的 EntityManager，以便加入同一个事务。
 */
export interface BalanceChangeCommand {
  entityManager: EntityManager;
  memberId: string;
  shopId: string;
  amount: string;
  direction: string;
  bizType: string;
  bizOrderNo: string;
  operatorId: string | null;
  remark: string;
}

/**
 * 后台充值命令。门店取当前已校验门店，不接收前端传入的 shopId。
 */
export interface RechargeCommand {
  memberId: string;
  amount: string | number;
  operatorId: string;
  remark: string;
}

/**
 * 扣款命令。业务类型由 KTV 或酒店传入。
 */
export interface DeductBalanceCommand {
  entityManager: EntityManager;
  memberId: string;
  shopId: string;
  amount: string;
  bizType: string;
  bizOrderNo: string;
  operatorId: string | null;
  remark: string;
}

/**
 * 退款命令。业务单号指向原订单。
 */
export interface RefundBalanceCommand {
  entityManager: EntityManager;
  memberId: string;
  shopId: string;
  amount: string;
  bizOrderNo: string;
  operatorId: string | null;
  remark: string;
}

/**
 * 会员余额、积分的唯一写入口。
 * KTV 与酒店模块只能调用这里，不能自己更新 member_account。
 */
@Injectable()
export class MemberBalanceService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * 后台充值。自己开启本地事务，增加余额并写入 RECHARGE 流水，不产生积分。
   */
  async recharge(command: RechargeCommand): Promise<FinanceBill> {
    if (!isPositiveMoney(command.amount)) {
      throw new BusinessException('充值金额必须大于0');
    }
    const currentShopId = ShopContext.getCurrentShopId();
    if (isEmpty(currentShopId)) {
      throw new BusinessException('请选择门店后再充值');
    }
    const remark = isEmpty(command.remark) ? '会员充值' : command.remark;
    return this.dataSource.transaction(async (entityManager) => {
      return this.applyBalanceChange({
        entityManager,
        memberId: command.memberId,
        shopId: currentShopId,
        amount: toMoneyString(command.amount),
        direction: FinanceDirection.IN,
        bizType: FinanceBizType.RECHARGE,
        bizOrderNo: '',
        operatorId: command.operatorId,
        remark,
      });
    });
  }

  /**
   * 扣减余额。加入调用方事务，不单独提交。
   */
  async deductBalance(command: DeductBalanceCommand): Promise<FinanceBill> {
    if (!isPositiveMoney(command.amount)) {
      throw new BusinessException('扣款金额必须大于0');
    }
    return this.applyBalanceChange({
      entityManager: command.entityManager,
      memberId: command.memberId,
      shopId: command.shopId,
      amount: toMoneyString(command.amount),
      direction: FinanceDirection.OUT,
      bizType: command.bizType,
      bizOrderNo: command.bizOrderNo,
      operatorId: command.operatorId,
      remark: command.remark,
    });
  }

  /**
   * 退款入账。加入调用方事务，增加余额并写入 REFUND 流水。
   */
  async refundBalance(command: RefundBalanceCommand): Promise<FinanceBill> {
    if (!isPositiveMoney(command.amount)) {
      throw new BusinessException('退款金额必须大于0');
    }
    return this.applyBalanceChange({
      entityManager: command.entityManager,
      memberId: command.memberId,
      shopId: command.shopId,
      amount: toMoneyString(command.amount),
      direction: FinanceDirection.IN,
      bizType: FinanceBizType.REFUND,
      bizOrderNo: command.bizOrderNo,
      operatorId: command.operatorId,
      remark: command.remark,
    });
  }

  /**
   * 在已有事务里锁会员行、改余额、写财务流水，消费时同步记积分。
   */
  private async applyBalanceChange(command: BalanceChangeCommand): Promise<FinanceBill> {
    // 1. 按会员主键加行锁，避免并发扣减把余额扣成负数
    const memberAccount = await command.entityManager
      .getRepository(MemberAccount)
      .createQueryBuilder('memberAccount')
      .setLock('pessimistic_write')
      .where('memberAccount.id = :memberId', { memberId: command.memberId })
      .getOne();
    if (isEmpty(memberAccount)) {
      throw new BusinessException('会员不存在');
    }
    if (memberAccount.status !== RecordStatus.ENABLED) {
      throw new BusinessException('会员已停用');
    }

    // 2. 计算变动后余额。扣款时余额不足则整笔事务回滚
    const balanceBefore = new Decimal(memberAccount.balance);
    const changeAmount = new Decimal(command.amount);
    let balanceAfter = balanceBefore.plus(changeAmount);
    if (command.direction === FinanceDirection.OUT) {
      balanceAfter = balanceBefore.minus(changeAmount);
      if (balanceAfter.lessThan(NumberBoundary.ZERO)) {
        throw new BusinessException('会员余额不足');
      }
    }
    const balanceBeforeText = toMoneyString(balanceBefore);
    const balanceAfterText = toMoneyString(balanceAfter);
    memberAccount.balance = balanceAfterText;

    // 3. 仅消费扣款按金额向下取整记积分，充值和退款不改积分
    let earnedPoints: number = NumberBoundary.ZERO;
    if (command.direction === FinanceDirection.OUT) {
      earnedPoints = calculateEarnedPoints(changeAmount, PointRule.EARN_PER_YUAN);
      if (earnedPoints > NumberBoundary.ZERO) {
        const pointsBefore = memberAccount.points;
        const pointsAfter = pointsBefore + earnedPoints;
        memberAccount.points = pointsAfter;
        const memberPointLog = new MemberPointLog();
        memberPointLog.memberId = toIdentifier(memberAccount.id);
        memberPointLog.shopId = command.shopId;
        memberPointLog.changeType = PointChangeType.EARN;
        memberPointLog.changePoints = earnedPoints;
        memberPointLog.pointsBefore = pointsBefore;
        memberPointLog.pointsAfter = pointsAfter;
        memberPointLog.bizType = command.bizType;
        memberPointLog.bizOrderNo = command.bizOrderNo;
        memberPointLog.remark = command.remark;
        await command.entityManager.getRepository(MemberPointLog).save(memberPointLog);
      }
    }

    // 4. 回写会员余额。这是 member_account 唯一的更新位置
    await command.entityManager.getRepository(MemberAccount).save(memberAccount);

    // 5. 写入统一财务流水，保留变动前后余额
    const financeBill = new FinanceBill();
    financeBill.billNo = createBusinessNo(BusinessNoPrefix.FINANCE_BILL);
    financeBill.memberId = toIdentifier(memberAccount.id);
    financeBill.shopId = command.shopId;
    financeBill.bizType = command.bizType;
    financeBill.bizOrderNo = isEmpty(command.bizOrderNo) ? '' : command.bizOrderNo;
    financeBill.direction = command.direction;
    financeBill.amount = toMoneyString(changeAmount);
    financeBill.balanceBefore = balanceBeforeText;
    financeBill.balanceAfter = balanceAfterText;
    financeBill.operatorId = isEmpty(command.operatorId) ? null : command.operatorId;
    financeBill.remark = command.remark;
    return command.entityManager.getRepository(FinanceBill).save(financeBill);
  }
}
