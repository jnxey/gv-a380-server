import { EntityManager, QueryRunner } from 'typeorm';
import { BusinessException } from '../exceptions/business.exception';
import { isEmpty } from './index';

/** MySQL `GET_LOCK(name, timeout)` 默认等待秒数（记账等命名锁共用） */
export const SIM_ORM_GET_LOCK_TIMEOUT_SEC = 5;

/**
 * 判断值是否为数组。
 */
function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/**
 * 轻量 SQL 拼装工具（非完整 ORM）。
 *
 * 已知局限与可改进方向（调用方按需迭代）：
 * - 表名、列名直接拼进 SQL，未做标识符转义；勿将用户输入用作 table / columns / orderBy。
 * - WHERE 仅支持 column = ? 的 AND 组合，无 IN / OR / LIKE / 范围查询。
 * - 无 JOIN、子查询、GROUP BY、HAVING。
 * - insert 仅单行；无批量 insert、无 upsert。
 * - 无软删、无乐观锁版本字段。
 * - update/delete 无 RETURNING（可按驱动扩展）。
 * - getLock / releaseLock 为 MySQL/MariaDB 命名锁（GET_LOCK / RELEASE_LOCK），勿用于其他方言。
 * - foreignKeyChecksOff / foreignKeyChecksOn 为当前会话级别的 SET FOREIGN_KEY_CHECKS（与 TypeORM Transaction 共用连接时即用该连接的会话）。
 */
export class SimOrm {
  /**
   * 校验非负整数参数。
   */
  private static assertNonNegInt(name: string, value: number): void {
    if (!Number.isInteger(value) || value < 0) {
      throw new TypeError(`SimOrm: ${name} must be a non-negative integer`);
    }
  }

  /**
   * 查询列表
   * @param options.columns 查询列，默认 `*`；勿拼接不可信字符串
   * @param options.orderBy ORDER BY 子句内容（不含关键字），如 `id DESC` 或 `created_at DESC, id DESC`
   * @param options.limit / options.offset 使用参数绑定，避免注入
   */
  static async select<T = Record<string, any>>(
    dataSource: { query: (sql: string, params?: any[]) => Promise<T[]> },
    table: string,
    where: Record<string, any> = {},
    options: { orderBy?: string; limit?: number; offset?: number; columns?: string } = {},
  ): Promise<T[]> {
    const cols = options.columns?.trim() ? options.columns!.trim() : '*';
    let sql = `SELECT ${cols} FROM ${table}`;
    const params: any[] = [];

    if (Object.keys(where).length > 0) {
      const whereStr = Object.keys(where)
        .map((key) => `${key} = ?`)
        .join(' AND ');
      sql += ` WHERE ${whereStr}`;
      params.push(...Object.values(where));
    }

    if (options.orderBy) {
      sql += ` ORDER BY ${options.orderBy}`;
    }

    if (!isEmpty(options.offset) && isEmpty(options.limit)) {
      throw new TypeError('SimOrm.select: offset requires limit');
    }

    if (!isEmpty(options.limit)) {
      SimOrm.assertNonNegInt('limit', options.limit);
      sql += ` LIMIT ?`;
      params.push(options.limit);
    }

    if (!isEmpty(options.offset)) {
      SimOrm.assertNonNegInt('offset', options.offset);
      sql += ` OFFSET ?`;
      params.push(options.offset);
    }

    return dataSource.query(sql, params);
  }

  /**
   * 查询单条（按 id DESC 取一条，适合主键/唯一条件）
   */
  static async find<T = Record<string, any>>(
    dataSource: { query: (sql: string, params?: any[]) => Promise<T[]> },
    table: string,
    where: Record<string, any>,
  ): Promise<T | null> {
    const list = await this.select(dataSource, table, where, { orderBy: 'id DESC', limit: 1 });
    return list[0] ?? null;
  }

  /**
   * 插入
   */
  static async insert(dataSource: { query: (sql: string, params?: any[]) => Promise<any> }, table: string, data: Record<string, any>) {
    const keys = Object.keys(data);
    const cols = keys.join(', ');
    const placeholders = keys.map(() => '?').join(', ');
    const values = Object.values(data);
    const sql = `INSERT INTO ${table} (${cols}) VALUES (${placeholders})`;
    return dataSource.query(sql, values);
  }

  /**
   * 更新
   */
  static async update(
    dataSource: { query: (sql: string, params?: any[]) => Promise<any> },
    table: string,
    data: Record<string, any>,
    where: Record<string, any>,
  ) {
    const dataSets = Object.keys(data)
      .map((key) => `${key} = ?`)
      .join(', ');
    const whereStr = Object.keys(where)
      .map((key) => `${key} = ?`)
      .join(' AND ');
    const sql = `UPDATE ${table} SET ${dataSets} WHERE ${whereStr}`;
    const params = [...Object.values(data), ...Object.values(where)];
    return dataSource.query(sql, params);
  }

  /**
   * 删除
   */
  static async delete(dataSource: { query: (sql: string, params?: any[]) => Promise<any> }, table: string, where: Record<string, any>) {
    const whereStr = Object.keys(where)
      .map((key) => `${key} = ?`)
      .join(' AND ');
    const sql = `DELETE FROM ${table} WHERE ${whereStr}`;
    return dataSource.query(sql, Object.values(where));
  }

  /**
   * 原生SQL
   */
  static async query<T = any>(dataSource: { query: (sql: string, params?: any[]) => Promise<T> }, sql: string, params: any[] = []) {
    return dataSource.query(sql, params);
  }

  /**
   * MySQL GET_LOCK。lockName 可传一个锁名，或按加锁顺序排好的锁名数组。
   * 字符串会先包成单元素数组，再按顺序逐个获取。不在此处重排。
   * timeoutSeconds 是这一整次调用的总等待秒数，不按锁的把数相乘。
   * 锁名为空、或数组长度为 0 时直接返回，不执行 GET_LOCK。数组里的空锁名跳过。
   * 某一把在剩余时间内没拿到（GET_LOCK 返回不是 1）时，先释放本轮已经拿到的锁，再抛出繁忙错误。
   * @returns 最后一次 GET_LOCK 的驱动原始结果；没有实际加锁时返回 undefined
   */
  static async getLock(
    dataSource: { query: (sql: string, params?: any[]) => Promise<any> },
    lockName: string | Array<string | null | undefined> | null | undefined,
    timeoutSeconds = SIM_ORM_GET_LOCK_TIMEOUT_SEC,
  ): Promise<unknown> {
    if (isEmpty(lockName)) {
      return;
    }
    const lockNameList = isArray(lockName) ? lockName : [lockName];
    if (lockNameList.length === 0) {
      return;
    }
    SimOrm.assertNonNegInt('timeoutSeconds', timeoutSeconds);
    // 步骤 1：整组锁共用一个截止时间。前面的锁等到了，后面的锁只使用剩下的秒数。
    const lockWaitDeadlineMs = Date.now() + timeoutSeconds * 1000;
    const acquiredLockNameList: string[] = [];
    let lockResult: unknown;
    for (let lockNameIndex = 0; lockNameIndex < lockNameList.length; lockNameIndex++) {
      const currentLockName = lockNameList[lockNameIndex];
      if (isEmpty(currentLockName) || !String(currentLockName).length) {
        continue;
      }
      // 步骤 2：按剩余时间换算本次 GET_LOCK 的等待秒数。时间已经用完则传 0，只试一次，不再额外等待。
      const remainingWaitMs = lockWaitDeadlineMs - Date.now();
      const remainingWaitSeconds = remainingWaitMs <= 0 ? 0 : Math.ceil(remainingWaitMs / 1000);
      lockResult = await dataSource.query('SELECT GET_LOCK(?, ?) AS get_lock_result', [currentLockName, remainingWaitSeconds]);
      const getLockResult = isArray(lockResult) ? (lockResult[0] as { get_lock_result?: unknown } | undefined)?.get_lock_result : undefined;
      // 步骤 3：没拿到这把锁。先放开本轮已拿到的锁，再把繁忙错误抛给接口，避免连接回池后仍占着锁。
      if (String(getLockResult) !== '1') {
        await SimOrm.releaseLock(dataSource, acquiredLockNameList);
        throw new BusinessException('系统繁忙，请稍后重试');
      }
      acquiredLockNameList.push(String(currentLockName));
    }
    return lockResult;
  }

  /**
   * 在同一条连接上做事务：开始事务、由回调里的 getLock 加锁、执行记账、提交或回滚，然后再放锁，最后归还连接。
   * 回调不要自己 releaseLock。锁名可以在回调里读完数据再确定。多次 getLock 按调用顺序持有，提交或回滚之后一次放开。
   */
  static async transaction<T>(
    dataSource: { createQueryRunner(): QueryRunner },
    work: (
      manager: EntityManager,
      getLock: (lockName: string | Array<string | null | undefined> | null | undefined, timeoutSeconds?: number) => Promise<unknown>,
    ) => Promise<T>,
  ): Promise<T> {
    const queryRunner = dataSource.createQueryRunner();
    const heldLockNameList: Array<string | null | undefined> = [];
    try {
      await queryRunner.connect();
      // 步骤 1：在这条连接上开启事务
      await queryRunner.startTransaction();
      try {
        // 步骤 2：回调通过 getLock 加锁。成功拿到的锁名记下来，等事务结束再放
        const getLock = async (
          lockName: string | Array<string | null | undefined> | null | undefined,
          timeoutSeconds = SIM_ORM_GET_LOCK_TIMEOUT_SEC,
        ) => {
          const lockResult = await SimOrm.getLock(queryRunner, lockName, timeoutSeconds);
          if (isEmpty(lockName)) {
            return lockResult;
          }
          const lockNameList = isArray(lockName) ? lockName : [lockName];
          for (let lockNameIndex = 0; lockNameIndex < lockNameList.length; lockNameIndex++) {
            heldLockNameList.push(lockNameList[lockNameIndex]);
          }
          return lockResult;
        };
        // 步骤 3：记账。成功则提交，失败则回滚。放锁放在这两步之后
        const result = await work(queryRunner.manager, getLock);
        await queryRunner.commitTransaction();
        return result;
      } catch (error) {
        if (queryRunner.isTransactionActive) {
          await queryRunner.rollbackTransaction();
        }
        throw error;
      } finally {
        // 步骤 4：事务已经提交或回滚，再放开本轮拿到的命名锁
        await SimOrm.releaseLock(queryRunner, heldLockNameList);
      }
    } finally {
      // 步骤 5：连接还回池子。命名锁已经在上一步放开
      await queryRunner.release();
    }
  }

  /**
   * MySQL RELEASE_LOCK。lockName 可传一个锁名，或与 getLock 相同顺序的锁名数组。
   * 字符串会先包成单元素数组，再按相反顺序逐个释放。不在此处重排。
   * 锁名为空、或数组长度为 0 时直接返回，不执行 RELEASE_LOCK。数组里的空锁名跳过。
   */
  static async releaseLock(
    dataSource: { query: (sql: string, params?: any[]) => Promise<any> },
    lockName: string | Array<string | null | undefined> | null | undefined,
  ): Promise<unknown> {
    if (isEmpty(lockName)) {
      return;
    }
    const lockNameList = isArray(lockName) ? lockName : [lockName];
    if (lockNameList.length === 0) {
      return;
    }
    let lockResult: unknown;
    for (let lockNameIndex = lockNameList.length - 1; lockNameIndex >= 0; lockNameIndex--) {
      const currentLockName = lockNameList[lockNameIndex];
      if (isEmpty(currentLockName) || !String(currentLockName).length) {
        continue;
      }
      lockResult = await dataSource.query('SELECT RELEASE_LOCK(?)', [currentLockName]);
    }
    return lockResult;
  }

  /**
   * 本会话关闭外键检查：`SET SESSION FOREIGN_KEY_CHECKS = 0`（MySQL / MariaDB）。
   * @see foreignKeyChecksOn 必须成对或在 finally 中恢复，避免泄漏到连接池其它借用方。
   */
  static async foreignKeyChecksOff(dataSource: { query: (sql: string, params?: any[]) => Promise<any> }): Promise<unknown> {
    return dataSource.query('SET FOREIGN_KEY_CHECKS = 0');
  }

  /**
   * 本会话恢复外键检查：`SET SESSION FOREIGN_KEY_CHECKS = 1`。
   */
  static async foreignKeyChecksOn(dataSource: { query: (sql: string, params?: any[]) => Promise<any> }): Promise<unknown> {
    return dataSource.query('SET FOREIGN_KEY_CHECKS = 1');
  }
}
