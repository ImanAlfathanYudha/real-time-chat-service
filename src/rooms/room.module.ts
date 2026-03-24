import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatRoomEntity } from './room.entity';
import { RoomService } from './room.service';

@Module({
  imports: [TypeOrmModule.forFeature([ChatRoomEntity])],
  providers: [RoomService],
  exports: [RoomService],
})
export class RoomModule {}