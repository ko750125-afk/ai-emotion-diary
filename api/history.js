import { Redis } from 'ioredis';

const redis = process.env.REDIS_URL ? new Redis(process.env.REDIS_URL) : null;

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  if (!redis) {
    return res.status(500).json({ error: '서버에 REDIS_URL이 설정되지 않아 내역을 불러올 수 없습니다.' });
  }

  try {
    // diary- 로 시작하는 모든 키 찾기
    const keys = await redis.keys('diary-*');

    if (keys.length === 0) {
      return res.status(200).json({ data: [] });
    }

    // 키에 해당하는 값 모두 가져오기
    const rawValues = await redis.mget(keys);

    // 파싱 및 timestamp 기준 최신순 정렬
    const histories = rawValues
      .filter((val) => val !== null) // null 방어
      .map((val) => JSON.parse(val))
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)); // 내림차순

    return res.status(200).json({ data: histories });
  } catch (error) {
    console.error('History API 에러:', error);
    return res.status(500).json({ error: '데이터를 불러오는 중 오류가 발생했습니다.' });
  }
}
