import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
    console.warn('Missing REDIS_URL Environment Variable in Backend');
}

// Vercel Serverless 환경에서는 연결을 관리하기 위해 싱글톤 패턴이 권장될 수 있으나,
// 간단한 구현을 위해 기본 클라이언트를 익스포트합니다.
export const redis = redisUrl ? new Redis(redisUrl) : null;
