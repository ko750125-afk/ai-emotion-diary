// 백엔드(Vercel API) 역할을 할 analyze.js 파일 예시입니다.
// 클라이언트에서 /api/analyze 로 POST 요청을 보내면 이 함수가 실행됩니다.
import { Redis } from 'ioredis';

// Vercel 환경 변수에서 REDIS_URL을 가져와 연결 (존재할 경우)
const redis = process.env.REDIS_URL ? new Redis(process.env.REDIS_URL) : null;

export default async function handler(req, res) {
  // CORS 처리 (필요에 따라 설정)
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // POST 요청만 허용하도록 제한
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // 1. 클라이언트(프론트엔드)에서 보낸 일기 내용 받기
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ error: '일기 내용을 전달받지 못했습니다.' });
    }

    // 2. 서버 환경변수에서 API 키 불러오기
    // ⚠️ Vercel 배포 시, Vercel 대시보드 Settings > Environment Variables 에 해당 키를 등록해야 합니다.
    const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: '서버에 API 키가 설정되지 않았습니다.' });
    }

    // 3. Gemini API 프롬프트 구성
    const prompt = `너는 심리 상담가야. 사용자가 작성한 일기 내용을 읽고, 사용자의 감정을 한 단어(예: 기쁨, 슬픔, 분노, 불안, 평온)로 요약해줘. 그리고 그 감정에 공감해주고, 따뜻한 응원의 메시지를 2~3문장으로 작성해줘. 답변 형식은 반드시 '감정: [요약된 감정]\n\n[응원 메시지]'와 같이 줄바꿈을 포함해서 보내줘.\n\n사용자 일기:\n${text}`;

    // 4. Gemini API 서버로 요청 보내기
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }]
      })
    });

    if (!response.ok) {
        const errorData = await response.text();
        console.error("Gemini API Error:", errorData);
        return res.status(response.status).json({ error: 'Gemini API 호출에 실패했습니다.' });
    }

    // 5. 구글에서 받은 결과를 분석
    const data = await response.json();
    const resultText = data.candidates[0].content.parts[0].text;

    // Redis에 데이터 저장 로직 (선택 사항 - Redis가 연결된 경우만 작동)
    if (redis) {
      try {
        // YYYYMMDDHHMMSS 포맷으로 ID 생성
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        
        const timestamp = `${year}${month}${day}${hours}${minutes}${seconds}`;
        const key = `diary-${timestamp}`;
        
        const value = JSON.stringify({
          originalText: text,
          aiResponse: resultText,
          timestamp: now.toISOString()
        });

        // 결과값을 Redis에 저장
        await redis.set(key, value);
        console.log(`Redis 데이터 저장 성공: ${key}`);
      } catch (redisError) {
        // Redis 저장에 실패해도 사용자에게 결과는 반환해야 하므로 에러만 로깅
        console.error('Redis 저장 에러:', redisError);
      }
    } else {
      console.warn('REDIS_URL 환경 변수가 등록되지 않아 데이터가 저장되지 않았습니다.');
    }

    // 6. 우리 서비스의 프론트엔드로 최종 결과 돌려주기
    return res.status(200).json({ result: resultText });

  } catch (error) {
    console.error('Vercel Serverless Function 에러:', error);
    return res.status(500).json({ error: '서버 내부에서 알 수 없는 오류가 발생했습니다.' });
  }
}
