import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // 백엔드 로직에서는 관리자 권한을 위해 Service Role Key 사용

// Supabase 환경 변수가 없는 경우 에러 처리
if (!supabaseUrl || !supabaseKey) {
    console.warn('Missing Supabase Environment Variables in Backend');
}

export const supabase = createClient(supabaseUrl, supabaseKey);
