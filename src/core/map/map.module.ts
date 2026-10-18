import { Module } from '@nestjs/common';
import { MapController } from './map.controller';
import { MapService } from './map.service';

/**
 * 地图代理。瓦片和逆地址解析都走高德，密钥留在服务端。
 */
@Module({
  controllers: [MapController],
  providers: [MapService],
})
export class MapModule {}
