import { Global, Module } from '@nestjs/common';
import { RedisProviders } from './redis.provider';

@Global() // ← artinya module ini otomatis tersedia di seluruh app
@Module({
  providers: [...RedisProviders],
  exports: [...RedisProviders],
})
export class RedisModule {}