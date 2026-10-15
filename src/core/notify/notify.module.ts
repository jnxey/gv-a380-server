import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotifyMessage } from './notify-message.entity';
import { NotifyService } from './notify.service';

/**
 * 消息模块。
 */
@Module({
  imports: [TypeOrmModule.forFeature([NotifyMessage])],
  providers: [NotifyService],
  exports: [NotifyService],
})
export class NotifyModule {}
