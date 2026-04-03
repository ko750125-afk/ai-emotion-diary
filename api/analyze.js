import { supabase } from './_utils/supabase.js';
import { redis } from './_utils/redis.js';
import { withAuth } from './_utils/handler.js';
import { analyzeDiary } from './_utils/ai.js';

async function analyzeHandler(req, res, user) {
    const { text } = req.body;
    if (!text) {
        throw new Error('일기 내용을 전달받지 못했습니다.');
    }

    // 1. AI 분석 수행
    const resultText = await analyzeDiary(text);

    // 2. 데이터 저장 (Supabase) - 비동기로 처리하되 결과 로깅
    const dbPromise = supabase.from('diaries').insert([{ 
        user_id: user.id, 
        diary_content: text, 
        ai_response: resultText 
    }]);

    // 3. 데이터 저장 (Redis) - 선택 사항
    let redisPromise = Promise.resolve();
    if (redis) {
        const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
        const redisKey = `user:${user.id}:diary:${timestamp}`;
        redisPromise = redis.set(redisKey, JSON.stringify({
            userId: user.id,
            diaryText: text,
            aiReply: resultText,
            timestamp: new Date().toISOString()
        }));
    }

    // 작업 결과 대기 및 로깅
    const [dbRes] = await Promise.all([dbPromise, redisPromise]);
    if (dbRes.error) {
        console.error("Supabase Save Error:", dbRes.error);
    }

    return res.status(200).json({ result: resultText });
}

// withAuth 래퍼를 사용하여 익스포트
export default withAuth(analyzeHandler, { methods: ['POST'] });
