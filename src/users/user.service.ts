import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from './user.entity';
import { CreateUserDto } from './user.dto';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(UserEntity)
    private userRepo: Repository<UserEntity>,
  ) {}

  // Buat user baru
  async create(dto: CreateUserDto): Promise<UserEntity> {
    const user = this.userRepo.create(dto); // bikin object user
    return this.userRepo.save(user);        // simpan ke DB
  }

  // Ambil semua user
  async findAll(): Promise<UserEntity[]> {
    return this.userRepo.find();
  }
}