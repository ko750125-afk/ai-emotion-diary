import { supabase } from './supabase.js';

/**
 * Extracts and verifies the user from the authorization header.
 * @param {import('http').IncomingMessage} req 
 * @returns {Promise<{user: any, error?: {status: number, message: string}}>}
 */
export async function verifyUser(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return { error: { status: 401, message: '인증 토큰이 없습니다. 로그인이 필요합니다.' } };
    }

    const token = authHeader.replace(/^Bearer\s+/, '');
    
    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) {
            console.error("Auth Verification Error:", authError);
            return { error: { status: 401, message: '유효하지 않거나 만료된 토큰입니다.' } };
        }
        return { user };
    } catch (e) {
        console.error("Auth system error:", e);
        return { error: { status: 500, message: '인증 처리 중 서버 오류가 발생했습니다.' } };
    }
}

/**
 * Standard JSON response helper
 */
export function sendError(res, status, message) {
    return res.status(status).json({ error: message });
}
