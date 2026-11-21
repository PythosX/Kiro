// Provider-independent AI layer: any OpenAI-compatible endpoint via env vars.
async function authUser(req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return null;
  const r = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: process.env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } });
  return r.ok ? r.json() : null;
}
const SYSTEM = (now, tz, style, tasks) => `You are KIRO, a calm, friendly personal productivity assistant.
Current local time: ${now} (timezone ${tz}). Interpret all relative dates ("tomorrow", "next Friday") from this. Response style: ${style}.
User's open tasks (JSON): ${JSON.stringify(tasks)}
Reply with ONLY a JSON object, no markdown:
{"reply": string, "action": null | {"type":"create_task","title":string,"description":string,"category":"Study|Work|Personal|Health|Finance|General","priority":"low|medium|important|critical","due_at":"ISO 8601 with timezone offset or null"} | {"type":"complete_task","query":string} | {"type":"delete_task","query":string} | {"type":"snooze","minutes":number} | {"type":"list","range":"today|upcoming|overdue|all"} | {"type":"plan"}}
Rules: if date or time is ambiguous or missing for a reminder, set action null and ask ONE short clarifying question. Exams/deadlines default to "important". Never claim a task was created; the app confirms after saving, so phrase reply as "I'll set that up". Keep replies short.`;
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const user = await authUser(req);
  if (!user) return res.status(401).json({ error: 'Not signed in' });
  if (!process.env.AI_API_KEY) return res.status(503).json({ error: 'AI not configured' });
  const { messages = [], now, tz, style = 'concise', tasks = [] } = req.body || {};
  try {
    const r = await fetch(`${process.env.AI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.AI_API_KEY}` },
      body: JSON.stringify({ model: process.env.AI_MODEL, temperature: 0.2, response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: SYSTEM(now, tz, style, tasks.slice(0, 40)) }, ...messages.slice(-12)] })
    });
    if (!r.ok) return res.status(502).json({ error: 'AI provider error' });
    const j = await r.json();
    let out;
    try { out = JSON.parse(j.choices[0].message.content.replace(/```json|```/g, '')); }
    catch { out = { reply: j.choices?.[0]?.message?.content || 'Sorry, I could not understand that.', action: null }; }
    res.json(out);
  } catch { res.status(502).json({ error: 'AI request failed' }); }
}
