import { DataSource, EntityManager } from 'typeorm';
import { PointLedgerTable } from '../point.constants';
import { isEmpty } from '../../common/tools';

const safeTableNamePattern = /^[a-zA-Z0-9_]+$/;

/**
 * 积分月分表工具：解析表名、判断是否存在、按需 CREATE LIKE。
 */
export class PointMonthTableTool {
  /**
   * 生成分月物理表全名。
   */
  static resolveTableName(baseTable: string, at: Date | number = new Date()): string {
    if (safeTableNamePattern.test(baseTable) !== true) {
      throw new Error(`Invalid base table name: ${baseTable}`);
    }
    const dateValue = PointMonthTableTool.toDate(at);
    const yearText = dateValue.getFullYear();
    const monthText = String(dateValue.getMonth() + 1).padStart(2, '0');
    return `${PointLedgerTable.SHARD_PREFIX}${baseTable}_${yearText}${monthText}`;
  }

  /**
   * 判断物理表是否存在。
   */
  static async tableExists(executor: EntityManager | DataSource, tableName: string): Promise<boolean> {
    if (safeTableNamePattern.test(tableName) !== true) {
      return false;
    }
    const rowList = (await executor.query(
      'SELECT 1 AS ok FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1',
      [tableName],
    )) as Array<{ ok: number }>;
    return rowList.length > 0;
  }

  /**
   * 分表不存在时按基表 CREATE LIKE。
   */
  static async ensureMonthTable(executor: EntityManager | DataSource, baseTable: string, at: Date | number): Promise<string> {
    const monthTableName = PointMonthTableTool.resolveTableName(baseTable, at);
    if ((await PointMonthTableTool.tableExists(executor, monthTableName)) === true) {
      return monthTableName;
    }
    await executor.query(`CREATE TABLE IF NOT EXISTS \`${monthTableName}\` LIKE \`${baseTable}\``);
    return monthTableName;
  }

  /**
   * 从某时刻向前枚举最多 monthCount 个月的分表名（新到旧）。
   */
  static listBackwardTableNames(baseTable: string, at: Date | number, monthCount: number): string[] {
    const dateValue = PointMonthTableTool.toDate(at);
    const tableNameList: string[] = [];
    for (let monthIndex = 0; monthIndex < monthCount; monthIndex += 1) {
      const cursor = new Date(dateValue.getFullYear(), dateValue.getMonth() - monthIndex, 1);
      tableNameList.push(PointMonthTableTool.resolveTableName(baseTable, cursor));
    }
    return tableNameList;
  }

  /**
   * 把秒/毫秒时间戳或 Date 统一成 Date。
   */
  private static toDate(at: Date | number): Date {
    if (at instanceof Date) {
      return at;
    }
    const timestampValue = Number(at);
    return new Date(timestampValue < 1e12 ? timestampValue * 1000 : timestampValue);
  }

  /**
   * 过滤出库里真实存在的表名。
   */
  static async filterExistingTableNames(executor: EntityManager | DataSource, tableNameList: string[]): Promise<string[]> {
    const existedTableNameList: string[] = [];
    for (const tableName of tableNameList) {
      if ((await PointMonthTableTool.tableExists(executor, tableName)) === true) {
        existedTableNameList.push(tableName);
      }
    }
    return existedTableNameList;
  }

  /**
   * 空表名列表时返回空。
   */
  static isEmptyTableList(tableNameList: string[]): boolean {
    return isEmpty(tableNameList);
  }
}
