import { Controller, Get, Param, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsNumber, Max, Min } from 'class-validator';
import { PermissionCode } from '../../common/constants';
import { RequirePermission } from '../../common/decorators/auth.decorators';
import { MapTileMaxIndex, MapTileMaxZoom } from './map.constants';
import { MapService } from './map.service';

/**
 * 获取瓦片的路径参数。
 */
export class MapTileParamsDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MapTileMaxZoom)
  z: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MapTileMaxIndex)
  x: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MapTileMaxIndex)
  y: number;
}

/**
 * 逆地址解析的查询参数。
 */
export class ReverseGeocodeQueryDto {
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat: number;

  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng: number;
}

/**
 * 地图代理。登录后、有门店保存权限即可用，不依赖当前门店。
 */
@Controller('admin/map')
export class MapController {
  constructor(private readonly mapService: MapService) {}

  /**
   * 获取一张地图瓦片。
   */
  @Get('tiles/:z/:x/:y')
  @RequirePermission(PermissionCode.KTV_SHOP_SAVE)
  getTile(@Param() params: MapTileParamsDto) {
    return this.mapService.getTile(params.z, params.x, params.y);
  }

  /**
   * 把经纬度解析成地址。
   */
  @Get('reverse')
  @RequirePermission(PermissionCode.KTV_SHOP_SAVE)
  reverseGeocode(@Query() query: ReverseGeocodeQueryDto) {
    return this.mapService.reverseGeocode(query.lat, query.lng);
  }
}
