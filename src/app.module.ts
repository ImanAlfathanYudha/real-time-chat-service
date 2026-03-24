import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UserEntity } from './users/user.entity';
import { UserModule } from './users/user.module'; 
import { RedisModule } from './common/redis/redis.module';
import { ChatModule } from './chats/chat.module';
import { ChatRoomEntity } from './rooms/room.entity';
import { RoomModule } from './rooms/room.module';
import { MessageEntity } from './common/entities/message.entity';
import { KafkaModule } from './common/kafka/kafka.module';
@Module({
  imports: [
    // Load file .env
    ConfigModule.forRoot({ isGlobal: true }),

    // Koneksi PostgreSQL
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('DB_HOST'),
        port: +config.get('DB_PORT'),
        username: config.get('DB_USERNAME'),
        password: config.get('DB_PASSWORD'),
        database: config.get('DB_NAME'),
        entities: [UserEntity, ChatRoomEntity, MessageEntity],
        synchronize: false, // pakai schema.sql yang sudah kita import
      }),
    }),
    UserModule,
    RedisModule,
    ChatModule,
    RoomModule,
    KafkaModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }