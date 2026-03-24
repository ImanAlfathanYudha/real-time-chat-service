import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Producer } from 'kafkajs';

export const KAFKA_PRODUCER = 'KAFKA_PRODUCER';

export const KafkaProducerProvider: Provider = {
  provide: KAFKA_PRODUCER,
  inject: [ConfigService],
  useFactory: async (config: ConfigService) => {
    const kafka = new Kafka({
      clientId: 'chat-service',
      brokers: [config.get('KAFKA_BROKER', 'localhost:9092')],
    });

    const producer: Producer = kafka.producer();
    await producer.connect();
    console.log('Kafka Producer connected');

    return producer;
  },
};