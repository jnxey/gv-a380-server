import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { RedisSetting } from '../constants';
import { isNumber } from '../tools';

export const REDIS_CLIENT = 'REDIS_CLIENT';

/**
 * Redis 用于 JWT 黑名单和商家验签 Nonce，不承担消息队列。
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): Redis => {
        const redisHost = configService.get<string>('REDIS_HOST');
        const redisPortText = configService.get<string>('REDIS_PORT');
        const redisPort = isNumber(redisPortText) ? Number(redisPortText) : RedisSetting.DEFAULT_PORT;
        return new Redis({
          host: redisHost,
          port: redisPort,
          maxRetriesPerRequest: 1,
          lazyConnect: false,
        });
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
