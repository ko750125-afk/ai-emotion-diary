export default function handler(req, res) {
    // 프론트엔드에서 참조 가능한 পাবলিক URL과 Anon Key만 노출합니다.
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
        return res.status(500).json({ error: 'Supabase environment variables are missing.' });
    }

    res.status(200).json({
        supabaseUrl,
        supabaseAnonKey
    });
}
