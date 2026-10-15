import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { ServerSetting } from './common/constants';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { isNumber } from './common/tools';

/**
 * 启动单体服务。
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Shop-Id'],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  const configService = app.get(ConfigService);
  const portText = configService.get<string>('PORT');
  const port = isNumber(portText) ? Number(portText) : ServerSetting.DEFAULT_PORT;
  await app.listen(port);
}

void bootstrap();
