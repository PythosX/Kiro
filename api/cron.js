import webpush from 'web-push';
const U = process.env.SUPABASE_URL, K = process.env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json', Prefer: 'return=representation' };
const q = (p, o = {}) => fetch(`${U}/rest/v1/${p}`, { headers: H, ...o }).then(r => r.json());
export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).end();
  webpush.setVapidDetails(process.env.VAPID_SUBJECT, process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  const due = await q(`reminders?status=eq.pending&scheduled_at=lte.${new Date().toISOString()}&select=*,tasks(title,status,due_at)&limit=200`);
  let sent = 0, failed = 0;
  for (const r of Array.isArray(due) ? due : []) {
    const claim = await q(`reminders?id=eq.${r.id}&status=eq.pending`, { method: 'PATCH', body: JSON.stringify({ status: 'sending' }) });
    if (!claim.length) continue; // another run claimed it: no duplicates
    if (!r.tasks || r.tasks.status === 'done') { await q(`reminders?id=eq.${r.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'cancelled' }) }); continue; }
    const subs = await q(`push_subscriptions?user_id=eq.${r.user_id}`);
    const payload = JSON.stringify({ title: 'KIRO reminder', body: r.tasks.title, taskId: r.task_id, reminderId: r.id });
    let ok = false;
    for (const s of subs) {
      try { await webpush.sendNotification(s.subscription, payload); ok = true; }
      catch (e) { if (e.statusCode === 404 || e.statusCode === 410) await q(`push_subscriptions?id=eq.${s.id}`, { method: 'DELETE' }); }
    }
    const retry = (r.retry_count || 0) + 1;
    const patch = ok ? { status: 'sent', sent_at: new Date().toISOString() } : retry >= 3 ? { status: 'failed', retry_count: retry } : { status: 'pending', retry_count: retry };
    await q(`reminders?id=eq.${r.id}`, { method: 'PATCH', body: JSON.stringify(patch) });
    ok ? sent++ : failed++;
  }
  res.json({ checked: Array.isArray(due) ? due.length : 0, sent, failed });
}
