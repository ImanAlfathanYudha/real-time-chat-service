import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MessageEntity, MessageType } from '../common/entities/message.entity';
import { REDIS_CLIENT } from '../common/redis/redis.provider';
import { RoomService } from '../rooms/room.service';
import Redis from 'ioredis';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    @InjectRepository(MessageEntity)
    private messageRepo: Repository<MessageEntity>,

    @Inject(REDIS_CLIENT)
    private redis: Redis,

    private roomService: RoomService,
  ) {}

  // ─────────────────────────────────────────────────────
  // Customer kirim pesan
  // ─────────────────────────────────────────────────────
  async sendMessage(payload: {
    sender_id: string;
    content: string;
    message_type?: MessageType;
    idempotency_key: string;
  }) {
    // Step 1: Cek duplicate via idempotency_key di Redis
    const dupKey = `idempotency:${payload.idempotency_key}`;
    const isDuplicate = await this.redis.get(dupKey);

    if (isDuplicate) {
      this.logger.warn(`Duplicate message: ${payload.idempotency_key}`);
      throw new ConflictException('Duplicate message');
    }

    // Step 2: Cari atau buat room untuk customer ini
    const room = await this.roomService.findOrCreateRoom(payload.sender_id);

    // Step 3: Simpan pesan ke PostgreSQL
    const message = this.messageRepo.create({
      room_id: room.id,
      sender_id: payload.sender_id,
      content: payload.content,
      message_type: payload.message_type || MessageType.TEXT,
      idempotency_key: payload.idempotency_key,
    });

    const savedMessage = await this.messageRepo.save(message);
    this.logger.log(`Pesan disimpan ke DB: ${savedMessage.id}`);

    // Step 4: Tandai idempotency_key di Redis (expire 24 jam)
    await this.redis.set(dupKey, '1', 'EX', 86400);

    // Step 5: Publish ke Redis channel room:{room_id}
    // Nanti semua node yang subscribe channel ini akan dapat pesannya
    await this.redis.publish(
      `room:${room.id}`,
      JSON.stringify({
        event: 'new_message',
        room_id: room.id,
        message: savedMessage,
      }),
    );

    this.logger.log(`Pesan dipublish ke Redis channel room:${room.id}`);

    return { status: 'sent', room_id: room.id, message: savedMessage };
  }

  // ─────────────────────────────────────────────────────
  // Agent balas pesan
  // Sama seperti sendMessage tapi room_id sudah diketahui
  // ─────────────────────────────────────────────────────
  async agentReply(payload: {
    sender_id: string;
    room_id: string;
    content: string;
    message_type?: MessageType;
    idempotency_key: string;
  }) {
    // Cek duplicate
    const dupKey = `idempotency:${payload.idempotency_key}`;
    const isDuplicate = await this.redis.get(dupKey);

    if (isDuplicate) {
      this.logger.warn(`Duplicate message: ${payload.idempotency_key}`);
      throw new ConflictException('Duplicate message');
    }

    // Validasi room ada
    const room = await this.roomService.findById(payload.room_id);

    // Simpan pesan
    const message = this.messageRepo.create({
      room_id: room.id,
      sender_id: payload.sender_id,
      content: payload.content,
      message_type: payload.message_type || MessageType.TEXT,
      idempotency_key: payload.idempotency_key,
    });

    const savedMessage = await this.messageRepo.save(message);

    // Tandai idempotency_key
    await this.redis.set(dupKey, '1', 'EX', 86400);

    // Publish ke Redis channel
    await this.redis.publish(
      `room:${room.id}`,
      JSON.stringify({
        event: 'new_message',
        room_id: room.id,
        message: savedMessage,
      }),
    );

    return { status: 'sent', room_id: room.id, message: savedMessage };
  }

  // ─────────────────────────────────────────────────────
  // Ambil history pesan di room
  // Dipanggil saat client join room
  // ─────────────────────────────────────────────────────
  async getRoomMessages(roomId: string): Promise<MessageEntity[]> {
    // Cek cache Redis dulu
    const cacheKey = `messages:${roomId}`;
    const cached = await this.redis.get(cacheKey);

    if (cached) {
      this.logger.log(`Cache HIT: messages room ${roomId}`);
      return JSON.parse(cached);
    }

    // Cache miss → ambil dari DB
    const messages = await this.messageRepo.find({
      where: { room_id: roomId },
      order: { created_at: 'ASC' },
      take: 50, // ambil 50 pesan terakhir
    });

    // Simpan ke Redis cache (expire 5 menit)
    await this.redis.set(cacheKey, JSON.stringify(messages), 'EX', 300);

    return messages;
  }
}
