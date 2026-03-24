import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { UserEntity } from '../users/user.entity';

export enum RoomStatus {
  WAITING = 'waiting',
  ACTIVE = 'active',
  CLOSED = 'closed',
}

@Entity('chat_rooms') // nama tabel di PostgreSQL
export class ChatRoomEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255, nullable: true })
  room_name: string;

  // Customer yang buat room
  @Column()
  created_by: string;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'created_by' })
  customer: UserEntity;

  // Agent yang handle room
  // nullable karena awalnya belum ada agent (status: waiting)
  @Column({ nullable: true })
  agent_id: string;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'agent_id' })
  agent: UserEntity;

  @Column({
    type: 'enum',
    enum: RoomStatus,
    default: RoomStatus.WAITING,
  })
  status: RoomStatus;

  @CreateDateColumn()
  created_at: Date;

  @Column({ nullable: true })
  deleted_at: Date;
}