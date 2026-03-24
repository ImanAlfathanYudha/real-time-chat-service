import { Global, Module } from '@nestjs/common';
import { KafkaProducerProvider } from './kafka.producer';

@Global()
@Module({
  providers: [KafkaProducerProvider],
  exports: [KafkaProducerProvider],
})
export class KafkaModule {}