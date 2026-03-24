import { Module } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MessageEntity } from '../common/entities/message.entity';
import { RoomModule } from 'src/rooms/room.module';
import { ChatService } from './chat.service';
import { ChatWithKafkaService } from './chatWithKafka.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([MessageEntity]),
    RoomModule, // import RoomModule agar ChatService bisa pakai RoomService
  ],
  providers: [ChatGateway, ChatService, ChatWithKafkaService],
})
export class ChatModule {}