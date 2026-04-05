import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { RoomService } from './room.service';


@Controller('rooms') // semua endpoint di sini prefix-nya /users
export class RoomController {
  constructor(private roomService: RoomService) { }

  // GET /room/waiting
  @Get('waiting')
  findWaitingRooms() {
    return this.roomService.getWaitingRooms();
  }

  // GET /room/waiting
  @Get()
  getAllRoom() {
    return this.roomService.findAll()
  }

  @Get(':id')
  findRoomById(@Param('id') id: string) {
    return this.roomService.findById(id)
  }
}