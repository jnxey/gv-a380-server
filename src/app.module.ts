import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionGuard } from './common/guards/permission.guard';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { ShopScopeInterceptor } from './common/interceptors/shop-scope.interceptor';
import { RedisModule } from './common/redis/redis.module';
import { ShopScopeModule } from './common/shop-scope/shop-scope.module';
import { DatabaseSetting } from './common/constants';
import { isNumber } from './common/tools';
import { AuthModule } from './core/auth/auth.module';
import { FinanceModule } from './core/finance/finance.module';
import { MemberModule } from './core/member/member.module';
import { NotifyModule } from './core/notify/notify.module';
import { RbacModule } from './core/rbac/rbac.module';
import { ShopModule } from './core/shop/shop.module';
import { SystemModule } from './core/system/system.module';
import { MapModule } from './core/map/map.module';
import { HotelModule } from './module-hotel/hotel.module';
import { KtvModule } from './module-ktv/ktv.module';
import { StoreModule } from './module-store/store.module';
import { PointModule } from './module-point/point.module';

/**
 * 模块化单体入口。core、KTV、酒店、商铺跑在同一个进程里。
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const portText = configService.get<string>('DB_PORT');
        return {
          type: 'mysql' as const,
          host: configService.get<string>('DB_HOST'),
          port: isNumber(portText) ? Number(portText) : DatabaseSetting.DEFAULT_PORT,
          username: configService.get<string>('DB_USERNAME'),
          password: configService.get<string>('DB_PASSWORD'),
          database: configService.get<string>('DB_DATABASE'),
          entities: [
            __dirname + '/**/*.entity.js',
            __dirname + '/**/*.entities.js',
            __dirname + '/**/*.entity.ts',
            __dirname + '/**/*.entities.ts',
          ],
          synchronize: false,
          namingStrategy: new SnakeNamingStrategy(),
          timezone: '+08:00',
          extra: {
            supportBigNumbers: true,
            bigNumberStrings: true,
            dateStrings: true,
          },
        };
      },
    }),
    RedisModule,
    ShopScopeModule,
    AuthModule,
    RbacModule,
    ShopModule,
    SystemModule,
    MemberModule,
    FinanceModule,
    NotifyModule,
    KtvModule,
    HotelModule,
    StoreModule,
    PointModule,
    MapModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
    { provide: APP_INTERCEPTOR, useClass: ShopScopeInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
  ],
})
export class AppModule {}
