import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Inject, Logger, OnModuleInit } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
// import { ChatService } from './chat.service';
import { ChatWithKafkaService } from './chatWithKafka.service';
import { REDIS_SUBSCRIBER } from '../common/redis/redis.provider';
import Redis from 'ioredis';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/chat',
})
export class ChatGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    // private chatService: ChatService,
    private chatService: ChatWithKafkaService,

    @Inject(REDIS_SUBSCRIBER)
    private redisSubscriber: Redis,
  ) {}

  // ─────────────────────────────────────────────────────
  // Setup Redis Subscriber saat module pertama kali load
  // Ini yang bikin pub/sub antar node bekerja
  // kita pakai untuk subscribe ke Redis channel — 
  // karena kita mau subscribe sekali saja saat app start, bukan setiap kali ada client connect.
  // ─────────────────────────────────────────────────────
  onModuleInit() {
    // Subscribe ke semua channel yang formatnya room:*
    this.redisSubscriber.psubscribe('room:*', (err) => {
      if (err) this.logger.error('Redis subscribe error', err);
      else this.logger.log('Subscribed ke Redis channel: room:*');
    });

    // Setiap ada pesan masuk dari Redis channel
    this.redisSubscriber.on('pmessage', (_pattern, channel, message) => {
      // Ambil room_id dari nama channel
      // channel formatnya: room:{room_id}
      const roomId = channel.split(':')[1];
      const payload = JSON.parse(message);

      this.logger.log(`Redis message masuk untuk room ${roomId}`);

      // Push ke semua Socket.IO client yang ada di room ini
      this.server.to(`room:${roomId}`).emit('new_message', payload);
    });
  }

  // ─────────────────────────────────────────────────────
  // Lifecycle: client connect
  // ─────────────────────────────────────────────────────
  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
    client.emit('connected', { message: 'Selamat datang di chat service!' });
  }

  // ─────────────────────────────────────────────────────
  // Lifecycle: client disconnect
  // ─────────────────────────────────────────────────────
  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  // ─────────────────────────────────────────────────────
  // Event: join_room
  // Client join room agar dapat notif pesan baru
  // ─────────────────────────────────────────────────────
  @SubscribeMessage('join_room')
  async handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: any,
  ) {
    const data = typeof payload === 'string' ? JSON.parse(payload) : payload;

    // Join Socket.IO room
    client.join(`room:${data.room_id}`);
    this.logger.log(`User ${data.user_id} joined room ${data.room_id}`);

    // Kirim history pesan saat join
    const messages = await this.chatService.getRoomMessages(data.room_id);
    client.emit('room_history', { room_id: data.room_id, messages });

    return { status: 'ok', room_id: data.room_id };
  }

  // ─────────────────────────────────────────────────────
  // Event: send_message (dari Customer)
  // ─────────────────────────────────────────────────────
  @SubscribeMessage('send_message')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: any,
  ) {
    const data = typeof payload === 'string' ? JSON.parse(payload) : payload;

    try {
      const result = await this.chatService.sendMessage({
        sender_id: data.sender_id,
        content: data.content,
        message_type: data.message_type,
        idempotency_key: data.idempotency_key,
      });

      // Beritahu sender bahwa pesan berhasil terkirim
      client.emit('message_status', {
        idempotency_key: data.idempotency_key,
        status: 'sent',
        room_id: result.room_id,
      });

    } catch (error) {
      // Duplicate atau error lainnya
      client.emit('message_status', {
        idempotency_key: data.idempotency_key,
        status: error.status === 409 ? 'duplicate' : 'failed',
        error: error.message,
      });
    }
  }

  // ─────────────────────────────────────────────────────
  // Event: agent_reply (dari Agent)
  // Agent harus join room dulu sebelum bisa reply
  // ─────────────────────────────────────────────────────
  @SubscribeMessage('agent_reply')
  async handleAgentReply(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: any,
  ) {
    const data = typeof payload === 'string' ? JSON.parse(payload) : payload;

    try {
      const result = await this.chatService.agentReply({
        sender_id: data.sender_id,
        room_id: data.room_id,
        content: data.content,
        message_type: data.message_type,
        idempotency_key: data.idempotency_key,
      });

      client.emit('message_status', {
        idempotency_key: data.idempotency_key,
        status: 'sent',
        room_id: result.room_id,
      });

    } catch (error) {
      client.emit('message_status', {
        idempotency_key: data.idempotency_key,
        status: error.status === 409 ? 'duplicate' : 'failed',
        error: error.message,
      });
    }
  }
}