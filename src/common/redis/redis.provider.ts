import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

// Token untuk inject Redis di tempat lain
// Kita pakai string token karena Redis bukan class buatan kita
export const REDIS_CLIENT = 'REDIS_CLIENT';
export const REDIS_SUBSCRIBER = 'REDIS_SUBSCRIBER';

export const RedisProviders: Provider[] = [
    // Koneksi 1: untuk get/set/publish
    {
        provide: REDIS_CLIENT,
        inject: [ConfigService],
        useFactory: (config: ConfigService) => {
            const redis = new Redis({
                host: config.get('REDIS_HOST', 'localhost'),
                port: +config.get('REDIS_PORT', 6379),
            });
            redis.on('connect', () => console.log('Redis CLIENT connected'));
            redis.on('error', (err) => console.error('Redis CLIENT error', err));
            return redis;
        },
    },

    // Koneksi 2: khusus subscribe
    // Redis tidak bisa publish & subscribe di koneksi yang sama
    // makanya harus 2 koneksi terpisah
    {
        provide: REDIS_SUBSCRIBER,
        inject: [ConfigService],
        useFactory: (config: ConfigService) => {
            const redis = new Redis({
                host: config.get('REDIS_HOST', 'localhost'),
                port: +config.get('REDIS_PORT', 6379),
            });
            redis.on('connect', () => console.log('Redis SUBSCRIBER connected'));
            redis.on('error', (err) => console.error('Redis SUBSCRIBER error', err));
            return redis;
        },
    },

];
