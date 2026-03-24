import { Body, Controller, Get, Post } from '@nestjs/common';
import { UserService } from './user.service';
import { CreateUserDto } from './user.dto';

@Controller('users') // semua endpoint di sini prefix-nya /users
export class UserController {
  constructor(private userService: UserService) {}

  // POST /users
  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.userService.create(dto);
  }

  // GET /users
  @Get()
  findAll() {
    return this.userService.findAll();
  }
}