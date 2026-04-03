import { supabase } from './_utils/supabase.js';
import { withAuth } from './_utils/handler.js';

async function historyHandler(req, res, user) {
    // 1. Supabase에서 현재 유저의 일기 목록 최신순으로 가져오기
    const { data: diaries, error } = await supabase
        .from('diaries')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Supabase query error:', error);
        throw new Error('데이터를 불러오는 중 오류가 발생했습니다.');
    }

    // 2. 클라이언트 포맷에 맞추어 변환
    const histories = (diaries || []).map(item => ({
        originalText: item.diary_content,
        aiResponse: item.ai_response,
        timestamp: item.created_at
    }));

    return res.status(200).json({ data: histories });
}

// GET 요청만 허용하는 withAuth 래퍼
export default withAuth(historyHandler, { methods: ['GET'] });
