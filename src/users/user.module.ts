import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from './user.entity';
import { UserController } from './user.controller';
import { UserService } from './user.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity]), // daftarkan entity agar bisa di-inject
  ],
  controllers: [UserController],
  providers: [UserService],
})
export class UserModule {}