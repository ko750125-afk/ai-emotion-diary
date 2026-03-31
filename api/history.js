import { supabase } from './_utils/supabase.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: '인증 토큰이 없습니다. 로그인이 필요합니다.' });
    }
    const token = authHeader.replace(/^Bearer\s+/, '');
    
    // 유저 검증
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({ error: '유효하지 않거나 만료된 토큰입니다.' });
    }

    // Supabase에서 현재 유저의 일기 목록 최신순으로 가져오기
    const { data: diaries, error } = await supabase
      .from('diaries')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Supabase query error:', error);
      return res.status(500).json({ error: '데이터를 불러오는 중 DB 오류가 발생했습니다.' });
    }

    // 클라이언트 포맷에 맞추어 변환 (기존 프론트엔드 호환성 위해)
    const histories = diaries.map(item => ({
      originalText: item.diary_content,
      aiResponse: item.ai_response,
      timestamp: item.created_at
    }));

    return res.status(200).json({ data: histories });
  } catch (error) {
    console.error('History API 에러:', error);
    return res.status(500).json({ error: '데이터를 처리하는 중 오류가 발생했습니다.' });
  }
}
