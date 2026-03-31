// 백엔드(Vercel API) 역할을 할 analyze.js 파일 예시입니다.
// 클라이언트에서 /api/analyze 로 POST 요청을 보내면 이 함수가 실행됩니다.
import { supabase } from './_utils/supabase.js';
import { redis } from './_utils/redis.js';

function getFormattedTimestamp() {
  const now = new Date();
  return now.toISOString().replace(/[-:T]/g, '').slice(0, 14); // YYYYMMDDHHMMSS 형식
}

export default async function handler(req, res) {
  // CORS 처리
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // POST 요청만 허용
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // 1. 인증 토큰 확인
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: '인증 토큰이 없습니다. 로그인이 필요합니다.' });
    }
    const token = authHeader.replace(/^Bearer\s+/, '');
    
    // 유저 검증
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      console.error("Auth Error:", authError);
      return res.status(401).json({ error: '유효하지 않거나 만료된 토큰입니다.' });
    }

    // 2. 클라이언트(프론트엔드)에서 보낸 일기 내용 받기
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ error: '일기 내용을 전달받지 못했습니다.' });
    }

    // 3. 서버 환경변수에서 API 키 불러오기
    const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: '서버에 API 키가 설정되지 않았습니다.' });
    }

    // 4. Gemini API 프롬프트 구성
    const prompt = `너는 심리 상담가야. 사용자가 작성한 일기 내용을 읽고, 사용자의 감정을 한 단어(예: 기쁨, 슬픔, 분노, 불안, 평온)로 요약해줘. 그리고 그 감정에 공감해주고, 따뜻한 응원의 메시지를 2~3문장으로 작성해줘. 답변 형식은 반드시 '감정: [요약된 감정]\n\n[응원 메시지]'와 같이 줄바꿈을 포함해서 보내줘.\n\n사용자 일기:\n${text}`;

    // 5. Gemini API 서버로 요청 보내기
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

    // 6. 구글에서 받은 결과를 분석
    const data = await response.json();
    const resultText = data.candidates[0].content.parts[0].text;

    // 7. Supabase Database에 저장
    const { error: dbError } = await supabase
      .from('diaries')
      .insert([
        { 
          user_id: user.id, 
          diary_content: text, 
          ai_response: resultText 
        }
      ]);

    if (dbError) {
      console.error("Supabase Save Error:", dbError);
    } else {
      console.log(`Supabase 데이터 저장 성공 - User: ${user.id}`);
    }

    // 8. Redis (Serverless Redis) 에 사용자별 데이터 저장 (Prompt 04 추가 요청 사항)
    if (redis) {
      const timestamp = getFormattedTimestamp();
      const redisKey = `user:${user.id}:diary:${timestamp}`;
      const diaryData = JSON.stringify({
        userId: user.id,
        diaryText: text,
        aiReply: resultText,
        timestamp: new Date().toISOString()
      });

      try {
        await redis.set(redisKey, diaryData);
        console.log(`Redis 데이터 저장 성공 - Key: ${redisKey}`);
      } catch (redisError) {
        console.error("Redis Save Error:", redisError);
      }
    }

    // 9. 최종 결과 돌려주기
    return res.status(200).json({ result: resultText });

  } catch (error) {
    console.error('Vercel Serverless Function 에러:', error);
    return res.status(500).json({ error: '서버 내부에서 알 수 없는 오류가 발생했습니다.' });
  }
}
