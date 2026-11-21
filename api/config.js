export default function handler(req, res) {
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.json({
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
    vapidPublicKey: process.env.VAPID_PUBLIC_KEY || '',
    aiConfigured: !!process.env.AI_API_KEY
  });
}
