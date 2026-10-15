import { ForbiddenException } from '@nestjs/common';
import { ObjectLiteral, QueryBuilder } from 'typeorm';
import { QueryType, ShopScopedTableNameList } from '../constants';
import { ShopContext } from '../context/shop-context';
import { isEmpty, isObject, toIdentifier } from '../tools';

const shopScopeAppliedFlag = Symbol('shopScopeApplied');
let shopScopeQueryFilterRegistered = false;

/**
 * 注册查询过滤器。
 * 当前请求存在已校验门店时，自动给隔离表加上 shop_id 条件，并拒绝写入其他门店。
 */
export function registerShopScopeQueryFilter(): void {
  if (shopScopeQueryFilterRegistered) {
    return;
  }
  const originalGetQueryAndParameters = QueryBuilder.prototype.getQueryAndParameters;
  QueryBuilder.prototype.getQueryAndParameters = function patchedGetQueryAndParameters(this: QueryBuilder<ObjectLiteral>) {
    applyShopScope(this);
    return originalGetQueryAndParameters.call(this);
  };
  shopScopeQueryFilterRegistered = true;
}

/**
 * 按查询类型注入当前门店条件。
 */
function applyShopScope(queryBuilder: QueryBuilder<ObjectLiteral>): void {
  const queryBuilderRecord = queryBuilder as QueryBuilder<ObjectLiteral> & { [shopScopeAppliedFlag]?: boolean };
  if (queryBuilderRecord[shopScopeAppliedFlag] === true) {
    return;
  }
  const currentShopId = ShopContext.getCurrentShopId();
  if (isEmpty(currentShopId)) {
    return;
  }
  const entityMetadata = queryBuilder.expressionMap.mainAlias?.metadata;
  if (isEmpty(entityMetadata)) {
    return;
  }
  if (!ShopScopedTableNameList.includes(entityMetadata.tableName)) {
    return;
  }
  const queryType = queryBuilder.expressionMap.queryType;
  if (queryType === QueryType.INSERT) {
    forceInsertShopId(queryBuilder, currentShopId);
    queryBuilderRecord[shopScopeAppliedFlag] = true;
    return;
  }
  if (queryType === QueryType.UPDATE) {
    rejectMismatchedShopId(queryBuilder.expressionMap.valuesSet, currentShopId);
  }
  if (queryType !== QueryType.SELECT && queryType !== QueryType.UPDATE && queryType !== QueryType.DELETE) {
    return;
  }
  const shopColumn = entityMetadata.findColumnWithPropertyName('shopId');
  if (isEmpty(shopColumn)) {
    return;
  }
  const aliasName = queryBuilder.expressionMap.mainAlias?.name;
    const whereBuilder = queryBuilder as QueryBuilder<ObjectLiteral> & {
      andWhere(condition: string, parameters?: ObjectLiteral): void;
    };
    if (queryType === QueryType.SELECT) {
      if (isEmpty(aliasName)) {
        return;
      }
      whereBuilder.andWhere(`${aliasName}.${shopColumn.propertyName} = :shopScopeCurrentShopId`, {
        shopScopeCurrentShopId: currentShopId,
      });
    } else {
      whereBuilder.andWhere(`${shopColumn.databaseName} = :shopScopeCurrentShopId`, {
        shopScopeCurrentShopId: currentShopId,
      });
    }
  queryBuilderRecord[shopScopeAppliedFlag] = true;
}

/**
 * 插入时强制写入当前门店。请求体里的门店与当前门店不一致则拒绝。
 */
function forceInsertShopId(queryBuilder: QueryBuilder<ObjectLiteral>, currentShopId: string): void {
  const valuesSet = queryBuilder.expressionMap.valuesSet;
  if (Array.isArray(valuesSet)) {
    valuesSet.forEach((row) => {
      assignShopId(row as Record<string, unknown>, currentShopId);
    });
    return;
  }
  if (isObject(valuesSet)) {
    assignShopId(valuesSet as Record<string, unknown>, currentShopId);
  }
}

/**
 * 把一行插入数据的门店改成当前门店。
 */
function assignShopId(row: Record<string, unknown>, currentShopId: string): void {
  assertShopIdMatches(row, currentShopId);
  row.shopId = currentShopId;
}

/**
 * 更新语句里如果携带了别的门店，直接拒绝。
 */
function rejectMismatchedShopId(valuesSet: unknown, currentShopId: string): void {
  if (Array.isArray(valuesSet)) {
    valuesSet.forEach((row) => {
      assertShopIdMatches(row, currentShopId);
    });
    return;
  }
  if (isObject(valuesSet)) {
    assertShopIdMatches(valuesSet as Record<string, unknown>, currentShopId);
  }
}

/**
 * 插入或更新的门店必须等于当前门店。
 */
function assertShopIdMatches(row: Record<string, unknown>, currentShopId: string): void {
  const incomingShopId = !isEmpty(row.shopId) ? row.shopId : row.shop_id;
  if (!isEmpty(incomingShopId) && toIdentifier(incomingShopId) !== currentShopId) {
    throw new ForbiddenException('禁止写入非当前门店的数据');
  }
}
