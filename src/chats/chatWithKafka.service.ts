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
import { KAFKA_PRODUCER } from '../common/kafka/kafka.producer';
import { RoomService } from '../rooms/room.service';
import Redis from 'ioredis';
import type{ Producer } from 'kafkajs';

@Injectable()
export class ChatWithKafkaService {
  private readonly logger = new Logger(ChatWithKafkaService.name);

  constructor(
    @InjectRepository(MessageEntity)
    private messageRepo: Repository<MessageEntity>,

    @Inject(REDIS_CLIENT)
    private redis: Redis,

    @Inject(KAFKA_PRODUCER)
    private kafkaProducer: Producer,

    private roomService: RoomService,
  ) {}

  // ─────────────────────────────────────────────────────
  // Customer kirim pesan
  // Sekarang lempar ke Kafka, bukan langsung simpan DB
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

    // Step 2: Cari atau buat room
    const room = await this.roomService.findOrCreateRoom(payload.sender_id);

    // Step 3: Tandai idempotency_key di Redis dulu
    // Supaya kalau ada request duplicate masuk sebelum worker selesai, tetap ditolak
    await this.redis.set(dupKey, '1', 'EX', 86400);

    // Step 4: Publish ke Kafka topic chat.inbound
    // Worker yang akan simpan ke DB dan publish ke Redis
    await this.kafkaProducer.send({
      topic: 'chat.inbound',
      messages: [
        {
          key: room.id, // pakai room_id sebagai key agar pesan di room yang sama masuk partition yang sama
          value: JSON.stringify({
            room_id: room.id,
            sender_id: payload.sender_id,
            content: payload.content,
            message_type: payload.message_type || MessageType.TEXT,
            idempotency_key: payload.idempotency_key,
          }),
        },
      ],
    });

    this.logger.log(`Pesan dipublish ke Kafka topic chat.inbound, room: ${room.id}`);

    return { status: 'sent', room_id: room.id };
  }

  // ─────────────────────────────────────────────────────
  // Agent balas pesan
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

    // Tandai idempotency_key
    await this.redis.set(dupKey, '1', 'EX', 86400);

    // Publish ke Kafka
    await this.kafkaProducer.send({
      topic: 'chat.inbound',
      messages: [
        {
          key: room.id,
          value: JSON.stringify({
            room_id: room.id,
            sender_id: payload.sender_id,
            content: payload.content,
            message_type: payload.message_type || MessageType.TEXT,
            idempotency_key: payload.idempotency_key,
          }),
        },
      ],
    });

    this.logger.log(`Agent reply dipublish ke Kafka, room: ${room.id}`);

    return { status: 'sent', room_id: room.id };
  }

  // ─────────────────────────────────────────────────────
  // Ambil history pesan di room
  // ─────────────────────────────────────────────────────
  async getRoomMessages(roomId: string): Promise<MessageEntity[]> {
    const cacheKey = `messages:${roomId}`;
    const cached = await this.redis.get(cacheKey);

    if (cached) {
      this.logger.log(`Cache HIT: messages room ${roomId}`);
      return JSON.parse(cached);
    }

    const messages = await this.messageRepo.find({
      where: { room_id: roomId },
      order: { created_at: 'ASC' },
      take: 50,
    });

    await this.redis.set(cacheKey, JSON.stringify(messages), 'EX', 300);

    return messages;
  }
}