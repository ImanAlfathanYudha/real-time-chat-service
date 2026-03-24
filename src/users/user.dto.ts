import { IsEmail, IsEnum, IsString } from 'class-validator';
import { UserRole } from './user.entity';

export class CreateUserDto {
  @IsString()
  username: string;

  @IsEmail()
  email: string;

  @IsEnum(UserRole)
  role: UserRole;
}