import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import { DatabaseSetting } from '../common/constants';
import { MerchantAuthModule } from '../common/merchant-auth/merchant-auth.module';
import { isNumber } from '../common/tools';
import { MemberModule } from '../core/member/member.module';
import { PointBindEntity } from './entities/point-bind';
import { PointLedgerEntity } from './entities/point-ledger';
import { PointMemberEntity } from './entities/point-member';
import { PointAdminController } from './point-admin.controller';
import { PointAppController } from './point-app.controller';
import { PointDatabase } from './point.constants';
import { PointLedgerService } from './point-ledger.service';
import { PointMemberService } from './point-member.service';
import { PointMerchantController } from './point-merchant.controller';
import { PointSnowflakeService } from './tools/point-snowflake.service';

/**
 * 积分模块：连 gv_admin，对外商家接口 + 小程序明细。
 */
@Module({
  imports: [
    ConfigModule,
    MerchantAuthModule,
    MemberModule,
    TypeOrmModule.forRootAsync({
      name: PointDatabase.CONNECTION_NAME,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const portText = configService.get<string>('POINT_DB_PORT') || configService.get<string>('DB_PORT');
        return {
          name: PointDatabase.CONNECTION_NAME,
          type: 'mysql' as const,
          host: configService.get<string>('POINT_DB_HOST') || configService.get<string>('DB_HOST'),
          port: isNumber(portText) ? Number(portText) : DatabaseSetting.DEFAULT_PORT,
          username: configService.get<string>('POINT_DB_USERNAME') || configService.get<string>('DB_USERNAME'),
          password: configService.get<string>('POINT_DB_PASSWORD') || configService.get<string>('DB_PASSWORD'),
          database: configService.get<string>('POINT_DB_DATABASE') || 'gv_admin',
          entities: [PointMemberEntity, PointBindEntity, PointLedgerEntity],
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
    TypeOrmModule.forFeature([PointMemberEntity, PointBindEntity, PointLedgerEntity], PointDatabase.CONNECTION_NAME),
  ],
  controllers: [PointMerchantController, PointAppController, PointAdminController],
  providers: [PointLedgerService, PointMemberService, PointSnowflakeService],
  exports: [PointLedgerService],
})
export class PointModule {}
