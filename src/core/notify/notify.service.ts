import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { ReadStatus, ReceiverType } from '../../common/constants';
import { NotifyMessage } from './notify-message.entity';

/**
 * 创建会员消息的命令。
 */
export interface CreateMemberMessageCommand {
  shopId: string;
  memberId: string;
  title: string;
  content: string;
}

/**
 * 站内消息。写入时加入业务事务，避免订单成功但消息丢失时难以对账。
 */
@Injectable()
export class NotifyService {
  /**
   * 给会员写一条未读消息。
   */
  async createMemberMessage(entityManager: EntityManager, command: CreateMemberMessageCommand): Promise<void> {
    const notifyMessage = new NotifyMessage();
    notifyMessage.shopId = command.shopId;
    notifyMessage.receiverType = ReceiverType.MEMBER;
    notifyMessage.receiverId = command.memberId;
    notifyMessage.title = command.title;
    notifyMessage.content = command.content;
    notifyMessage.readStatus = ReadStatus.UNREAD;
    await entityManager.getRepository(NotifyMessage).save(notifyMessage);
  }
}
