import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatRoomEntity, RoomStatus } from './room.entity';
import { REDIS_CLIENT } from '../common/redis/redis.provider';
import Redis from 'ioredis';

@Injectable()
export class RoomService {
  private readonly logger = new Logger(RoomService.name);

  constructor(
    @InjectRepository(ChatRoomEntity)
    private roomRepo: Repository<ChatRoomEntity>,

    @Inject(REDIS_CLIENT)
    private redis: Redis,
  ) {}

  // ─────────────────────────────────────────────
  // Cari atau buat room untuk customer
  // Dipanggil otomatis saat customer kirim pesan
  // ─────────────────────────────────────────────
  async findOrCreateRoom(customerId: string): Promise<ChatRoomEntity> {
    // Step 1: Cek Redis dulu
    const cacheKey = `room:customer:${customerId}`;
    const cachedRoomId = await this.redis.get(cacheKey);

    if (cachedRoomId) {
      this.logger.log(`Cache HIT: room ${cachedRoomId}`);
      const room = await this.roomRepo.findOne({ where: { id: cachedRoomId } });

      // Pastikan room masih aktif (belum closed)
      if (room && room.status !== RoomStatus.CLOSED) {
        return room;
      }
    }

    // Step 2: Cache miss → cek PostgreSQL
    this.logger.log(`Cache MISS: cek PostgreSQL untuk customer ${customerId}`);
    const existingRoom = await this.roomRepo.findOne({
      where: [
        { created_by: customerId, status: RoomStatus.WAITING },
        { created_by: customerId, status: RoomStatus.ACTIVE },
      ],
    });

    if (existingRoom) {
      // Simpan ke Redis untuk request berikutnya
      await this.redis.set(cacheKey, existingRoom.id, 'EX', 86400); // expire 24 jam
      this.logger.log(`Room ditemukan di DB: ${existingRoom.id}`);
      return existingRoom;
    }

    // Step 3: Belum ada room → buat baru
    this.logger.log(`Membuat room baru untuk customer ${customerId}`);
    const newRoom = this.roomRepo.create({
      created_by: customerId,
      status: RoomStatus.WAITING,
    });

    const savedRoom = await this.roomRepo.save(newRoom);

    // Simpan ke Redis
    await this.redis.set(cacheKey, savedRoom.id, 'EX', 86400);

    return savedRoom;
  }

  // ─────────────────────────────────────────────
  // Agent assign dirinya ke room
  // status: waiting → active
  // ─────────────────────────────────────────────
  async assignAgent(roomId: string, agentId: string): Promise<ChatRoomEntity> {
    const room = await this.roomRepo.findOne({ where: { id: roomId } });
    if (!room) throw new NotFoundException('Room tidak ditemukan');

    room.agent_id = agentId;
    room.status = RoomStatus.ACTIVE;

    return this.roomRepo.save(room);
  }

  // ─────────────────────────────────────────────
  // Tutup room setelah chat selesai
  // ─────────────────────────────────────────────
  async closeRoom(roomId: string): Promise<ChatRoomEntity> {
    const room = await this.roomRepo.findOne({ where: { id: roomId } });
    if (!room) throw new NotFoundException('Room tidak ditemukan');

    room.status = RoomStatus.CLOSED;
    room.deleted_at = new Date();

    // Hapus cache Redis
    const cacheKey = `room:customer:${room.created_by}`;
    await this.redis.del(cacheKey);

    return this.roomRepo.save(room);
  }

  // ─────────────────────────────────────────────
  // Ambil semua room yang masih waiting
  // Untuk dashboard agent
  // ─────────────────────────────────────────────
  async getWaitingRooms(): Promise<ChatRoomEntity[]> {
    return this.roomRepo.find({
      where: { status: RoomStatus.WAITING },
      order: { created_at: 'ASC' },
    });
  }

  async findById(roomId: string): Promise<ChatRoomEntity> {
    const room = await this.roomRepo.findOne({ where: { id: roomId } });
    if (!room) throw new NotFoundException('Room tidak ditemukan');
    return room;
  }
}