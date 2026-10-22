import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import Decimal from 'decimal.js';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { BusinessException } from '../common/exceptions/business.exception';
import { isEmpty, isNumber, isObject } from '../common/tools';
import { PointBindEntity } from './entities/point-bind';
import { PointDatabase, PointLedgerDirection, PointLedgerTable, PointMerchantResponse } from './point.constants';
import { PointMonthTableTool } from './tools/point-month-table.tool';
import { PointSnowflakeService } from './tools/point-snowflake.service';

export interface PointLedgerCreateCommand {
  account: string;
  bizType: string;
  direction: string;
  amount: number;
  referrerId?: string;
  remark?: string;
  describeJson?: Record<string, unknown>;
}

export interface PointLedgerRowView {
  id: number;
  ledger_id: string;
  account: string;
  biz_type: string;
  direction: string;
  amount: number;
  balance: number;
  increase_cumulative: number;
  referrer_id: string | null;
  remark: string | null;
  describe_json: Record<string, unknown>;
  created_by: string;
  created_at: number;
}

/**
 * 积分账簿：余额、分页、记账、按 referrer 查询。
 */
@Injectable()
export class PointLedgerService {
  constructor(
    @InjectDataSource(PointDatabase.CONNECTION_NAME)
    private readonly pointDataSource: DataSource,
    @InjectRepository(PointBindEntity, PointDatabase.CONNECTION_NAME)
    private readonly pointBindRepository: Repository<PointBindEntity>,
    private readonly pointSnowflakeService: PointSnowflakeService,
  ) {}

  /**
   * 按积分账号读当前余额。没有快照时为 0。
   */
  async getCurrentBalanceByAccount(account: string): Promise<{ balance: number }> {
    const cleanedAccount = account.trim();
    if (isEmpty(cleanedAccount)) {
      throw new BusinessException('积分账号不能为空');
    }
    const bindRow = await this.pointBindRepository.findOne({ where: { account: cleanedAccount } });
    if (isEmpty(bindRow)) {
      return { balance: 0 };
    }
    return { balance: Number(bindRow.balance) };
  }

  /**
   * 创建一笔积分流水并刷新快照。
   */
  async create(command: PointLedgerCreateCommand): Promise<PointLedgerRowView> {
    const cleanedAccount = command.account.trim();
    if (isEmpty(cleanedAccount)) {
      throw new BusinessException('积分账号不能为空');
    }
    if (command.direction !== PointLedgerDirection.INCREASE && command.direction !== PointLedgerDirection.DECREASE) {
      throw new BusinessException('记账方向不正确');
    }
    if (isNumber(command.amount) !== true || command.amount <= 0) {
      throw new BusinessException('记账金额必须大于0');
    }
    return this.pointDataSource.transaction(async (entityManager) => {
      await entityManager.query('SELECT GET_LOCK(?, 10) AS locked', [`lmwp_${cleanedAccount}`]);
      try {
        return await this.insertSingleRow(entityManager, {
          ...command,
          account: cleanedAccount,
        });
      } finally {
        await entityManager.query('SELECT RELEASE_LOCK(?) AS released', [`lmwp_${cleanedAccount}`]);
      }
    });
  }

  /**
   * 键集游标分页。只扫最近 12 个月存在的分表。
   */
  async findPager(command: {
    account: string;
    pageSize: number;
    lastId?: number;
    lastSortValue?: number;
  }): Promise<{ list: PointLedgerRowView[]; has_more: boolean; next_cursor?: { last_id: number; last_sort_value: number }; total: number }> {
    const cleanedAccount = command.account.trim();
    if (isEmpty(cleanedAccount)) {
      throw new BusinessException('积分账号不能为空');
    }
    const pageSize = Math.min(Math.max(Number(command.pageSize) || 20, 1), 200);
    const tableNameList = await PointMonthTableTool.filterExistingTableNames(
      this.pointDataSource,
      PointMonthTableTool.listBackwardTableNames(PointLedgerTable.BASE, new Date(), 12),
    );
    if (PointMonthTableTool.isEmptyTableList(tableNameList)) {
      return { list: [], has_more: false, total: 0 };
    }
    const unionSql = tableNameList.map((tableName) => `SELECT * FROM \`${tableName}\` WHERE account = ?`).join(' UNION ALL ');
    const parameterList: Array<string | number> = tableNameList.map(() => cleanedAccount);
    let cursorSql = '';
    if (isNumber(command.lastId) === true && isNumber(command.lastSortValue) === true) {
      cursorSql = ' AND (created_at < ? OR (created_at = ? AND id < ?))';
      parameterList.push(command.lastSortValue as number, command.lastSortValue as number, command.lastId as number);
    }
    const countRowList = (await this.pointDataSource.query(
      `SELECT COUNT(1) AS total FROM (${unionSql}) AS point_union WHERE 1 = 1`,
      tableNameList.map(() => cleanedAccount),
    )) as Array<{ total: number }>;
    const total = Number(countRowList[0]?.total || 0);
    const rowList = (await this.pointDataSource.query(
      `SELECT * FROM (${unionSql}) AS point_union WHERE 1 = 1${cursorSql} ORDER BY created_at DESC, id DESC LIMIT ?`,
      [...parameterList, pageSize + 1],
    )) as Array<Record<string, unknown>>;
    const hasMore = rowList.length > pageSize;
    const pageRowList = hasMore ? rowList.slice(0, pageSize) : rowList;
    const list = pageRowList.map((rawRow) => this.toRowView(rawRow));
    const lastRow = list[list.length - 1];
    return {
      list,
      has_more: hasMore,
      next_cursor: isEmpty(lastRow)
        ? undefined
        : {
            last_id: lastRow.id,
            last_sort_value: lastRow.created_at,
          },
      total,
    };
  }

  /**
   * 按月份时间戳 + referrer_id 列表查流水。
   */
  async findByReferrerIds(timestamp: number, referrerIdList: string[]): Promise<{ list: PointLedgerRowView[] }> {
    if (isEmpty(referrerIdList)) {
      return { list: [] };
    }
    const monthTableName = PointMonthTableTool.resolveTableName(PointLedgerTable.BASE, timestamp);
    if ((await PointMonthTableTool.tableExists(this.pointDataSource, monthTableName)) !== true) {
      return { list: [] };
    }
    const placeholderText = referrerIdList.map(() => '?').join(', ');
    const rowList = (await this.pointDataSource.query(
      `SELECT * FROM \`${monthTableName}\` WHERE referrer_id IN (${placeholderText}) ORDER BY created_at DESC, id DESC`,
      referrerIdList,
    )) as Array<Record<string, unknown>>;
    return { list: rowList.map((rawRow) => this.toRowView(rawRow)) };
  }

  /**
   * 小程序用：按页码翻最近流水。
   */
  async pageBillsByAccount(account: string, pageValue: unknown, pageSizeValue: unknown): Promise<{ list: PointLedgerRowView[]; total: number }> {
    const page = Math.max(Number(pageValue) || 1, 1);
    const pageSize = Math.min(Math.max(Number(pageSizeValue) || 20, 1), 100);
    const pagerResult = await this.findPager({
      account,
      pageSize: page * pageSize,
    });
    const startIndex = (page - 1) * pageSize;
    return {
      list: pagerResult.list.slice(startIndex, startIndex + pageSize),
      total: pagerResult.total,
    };
  }

  /**
   * 组装商家成功响应。
   */
  wrapMerchantSuccess<T>(data: T) {
    return {
      code: PointMerchantResponse.SUCCESS_CODE,
      msg: PointMerchantResponse.SUCCESS_MESSAGE,
      data,
    };
  }

  /**
   * 写入单条流水并刷新 bind。
   */
  private async insertSingleRow(entityManager: EntityManager, command: PointLedgerCreateCommand): Promise<PointLedgerRowView> {
    const ledgerId = this.pointSnowflakeService.nextId();
    const createdAt = this.pointSnowflakeService.parseUnixSeconds(ledgerId);
    const monthTableName = await PointMonthTableTool.ensureMonthTable(entityManager, PointLedgerTable.BASE, createdAt);
    const prevBalance = await this.readPrevBalance(entityManager, command.account, createdAt);
    if (command.direction === PointLedgerDirection.DECREASE && prevBalance < command.amount) {
      throw new BusinessException('积分余额不足');
    }
    const nextBalance =
      command.direction === PointLedgerDirection.INCREASE
        ? new Decimal(prevBalance).plus(command.amount).toDecimalPlaces(5, Decimal.ROUND_DOWN).toNumber()
        : new Decimal(prevBalance).minus(command.amount).toDecimalPlaces(5, Decimal.ROUND_DOWN).toNumber();
    const prevIncrease = await this.readPrevIncrease(entityManager, command.account);
    const increaseCumulative =
      command.direction === PointLedgerDirection.INCREASE
        ? new Decimal(prevIncrease).plus(command.amount).toDecimalPlaces(5, Decimal.ROUND_DOWN).toNumber()
        : prevIncrease;
    await entityManager.query(
      `INSERT INTO \`${monthTableName}\` (ledger_id, account, biz_type, direction, amount, balance, increase_cumulative, order_id, shoe_no, round_no, referrer_id, remark, describe_json, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?, ?, ?)`,
      [
        ledgerId,
        command.account,
        command.bizType,
        command.direction,
        command.amount,
        nextBalance,
        increaseCumulative,
        isEmpty(command.referrerId) ? null : command.referrerId,
        isEmpty(command.remark) ? null : command.remark,
        JSON.stringify(isEmpty(command.describeJson) ? {} : command.describeJson),
        '-',
        createdAt,
      ],
    );
    await this.upsertBind(entityManager, command.account, nextBalance, createdAt, command.direction === PointLedgerDirection.INCREASE ? increaseCumulative : undefined);
    const insertedRowList = (await entityManager.query(`SELECT * FROM \`${monthTableName}\` WHERE ledger_id = ? LIMIT 1`, [ledgerId])) as Array<
      Record<string, unknown>
    >;
    return this.toRowView(insertedRowList[0] || {});
  }

  /**
   * 向前找上一笔余额。
   */
  private async readPrevBalance(entityManager: EntityManager, account: string, anchorAt: number): Promise<number> {
    const tableNameList = await PointMonthTableTool.filterExistingTableNames(
      entityManager,
      PointMonthTableTool.listBackwardTableNames(PointLedgerTable.BASE, anchorAt, 12),
    );
    for (const tableName of tableNameList) {
      const rowList = (await entityManager.query(
        `SELECT balance FROM \`${tableName}\` WHERE account = ? AND created_at <= ? ORDER BY created_at DESC, id DESC LIMIT 1`,
        [account, anchorAt],
      )) as Array<{ balance: string | number }>;
      if (rowList.length > 0) {
        return Number(rowList[0].balance);
      }
    }
    return 0;
  }

  /**
   * 读 bind 上的累计增加额。
   */
  private async readPrevIncrease(entityManager: EntityManager, account: string): Promise<number> {
    const bindRow = await entityManager.getRepository(PointBindEntity).findOne({ where: { account } });
    if (isEmpty(bindRow)) {
      return 0;
    }
    return Number(bindRow.increaseCumulative);
  }

  /**
   * 刷新积分余额快照。
   */
  private async upsertBind(entityManager: EntityManager, account: string, balance: number, updateAt: number, increaseCumulative?: number): Promise<void> {
    const bindRepository = entityManager.getRepository(PointBindEntity);
    const existedBind = await bindRepository.findOne({ where: { account } });
    if (isEmpty(existedBind) !== true) {
      existedBind.balance = String(balance);
      existedBind.updateAt = updateAt;
      if (isNumber(increaseCumulative) === true) {
        existedBind.increaseCumulative = String(increaseCumulative);
      }
      await bindRepository.save(existedBind);
      return;
    }
    await bindRepository.insert({
      account,
      balance: String(balance),
      updateAt,
      increaseCumulative: String(isNumber(increaseCumulative) === true ? increaseCumulative : 0),
    });
  }

  /**
   * raw 行转商家响应字段。
   */
  private toRowView(rawRow: Record<string, unknown>): PointLedgerRowView {
    let describeJson: Record<string, unknown> = {};
    const rawDescribeJson = rawRow.describe_json;
    if (isObject(rawDescribeJson) === true) {
      describeJson = rawDescribeJson as Record<string, unknown>;
    } else if (typeof rawDescribeJson === 'string' && isEmpty(rawDescribeJson) !== true) {
      try {
        describeJson = JSON.parse(rawDescribeJson) as Record<string, unknown>;
      } catch {
        describeJson = {};
      }
    }
    return {
      id: Number(rawRow.id || 0),
      ledger_id: String(rawRow.ledger_id || ''),
      account: String(rawRow.account || ''),
      biz_type: String(rawRow.biz_type || ''),
      direction: String(rawRow.direction || ''),
      amount: Number(rawRow.amount || 0),
      balance: Number(rawRow.balance || 0),
      increase_cumulative: Number(rawRow.increase_cumulative || 0),
      referrer_id: isEmpty(rawRow.referrer_id) ? null : String(rawRow.referrer_id),
      remark: isEmpty(rawRow.remark) ? null : String(rawRow.remark),
      describe_json: describeJson,
      created_by: String(rawRow.created_by || ''),
      created_at: Number(rawRow.created_at || 0),
    };
  }
}
