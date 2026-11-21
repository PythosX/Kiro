// KIRO V1 — vanilla JS SPA. Sections: util, data, reminders, AI/chat, voice, views, router.
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const IC = { home: 'M3 11l9-8 9 8v10a1 1 0 01-1 1h-5v-7H9v7H4a1 1 0 01-1-1z', list: 'M9 6h12M9 12h12M9 18h12M3 6h.01M3 12h.01M3 18h.01', bot: 'M12 3v3M5 8h14a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2v-8a2 2 0 012-2zM9 14h.01M15 14h.01', bell: 'M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9M10 21h4', gear: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19 12l2-1-2-4-2 1-2-1-1-2h-4l-1 2-2 1-2-1-2 4 2 1v2l-2 1 2 4 2-1 2 1 1 2h4l1-2 2-1 2 1 2-4-2-1z', mic: 'M12 2a3 3 0 00-3 3v6a3 3 0 006 0V5a3 3 0 00-3-3zM19 11a7 7 0 01-14 0M12 18v4', send: 'M22 2L11 13M22 2l-7 20-4-9-9-4z', plus: 'M12 5v14M5 12h14', out: 'M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9', check: 'M5 12l5 5L20 7', menu: 'M3 6h18M3 12h18M3 18h18' };
const ic = (n, s = 20) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${IC[n]}"/></svg>`;
const LOGO = `<div class="orb sm" data-state="idle"><i></i></div>`;
const S = { cfg: {}, sb: null, user: null, profile: null, tasks: [], rems: [], loading: true, f: { view: 'all', q: '', pri: '', cat: '', sort: 'due', page: 1 }, chat: [], conv: null, orb: 'idle', collapsed: false };
const DEF = { spoken: false, style: 'concise', early_minutes: 60, quiet_on: false, quiet_start: '22:00', quiet_end: '07:00', daily_summary: false, sound: true };
const set = () => ({ ...DEF, ...(S.profile?.settings || {}) });
const tz = () => S.profile?.timezone && S.profile.timezone !== 'UTC' ? S.profile.timezone : Intl.DateTimeFormat().resolvedOptions().timeZone;
const fmt = d => d ? new Date(d).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: tz() }) : 'No date';
const sameDay = (a, b) => new Date(a).toLocaleDateString('en-CA', { timeZone: tz() }) === new Date(b).toLocaleDateString('en-CA', { timeZone: tz() });
const overdue = t => t.status === 'open' && t.due_at && new Date(t.due_at) < new Date();
const toast = (m, k = '') => { const e = document.createElement('div'); e.className = 'toast ' + k; e.textContent = m; $('#toasts').append(e); setTimeout(() => e.remove(), 4500); };
const fail = (e, m = 'Something went wrong') => { console.error(e); toast(m + (e?.message ? ': ' + e.message : ''), 'err'); };
const orb = st => { S.orb = st; document.querySelectorAll('.orb:not(.sm)').forEach(o => o.dataset.state = st); const l = $('#ostate'); if (l) l.textContent = { idle: '', listening: 'Listening…', thinking: 'Processing…', speaking: 'Speaking…', error: 'Microphone unavailable' }[st]; };

/* ---------- Data ---------- */
async function loadData() {
  S.loading = true;
  const [t, r] = await Promise.all([
    S.sb.from('tasks').select('*').order('due_at', { ascending: true, nullsFirst: false }).limit(500),
    S.sb.from('reminders').select('*,tasks(title,status)').order('scheduled_at', { ascending: false }).limit(100)]);
  if (t.error) fail(t.error, 'Could not load tasks'); if (r.error) fail(r.error, 'Could not load reminders');
  S.tasks = t.data || []; S.rems = r.data || []; S.loading = false;
}
function plan(task) { // reminder schedule by priority
  if (!task.due_at) return [];
  const due = new Date(task.due_at).getTime(), e = set().early_minutes, now = Date.now();
  const map = { low: [['at_due', 0]], medium: [['at_due', 0], ...(task.early ? [['early', e]] : [])], important: [['day_before', 1440], ['hour_before', 60], ['at_due', 0]], critical: [['day_before', 1440], ['early', e], ['at_due', 0]] };
  return (map[task.priority] || []).map(([type, m]) => ({ type, at: due - m * 60000 })).filter(x => x.at > now - 60000);
}
async function syncReminders(task, early) {
  await S.sb.from('reminders').update({ status: 'cancelled' }).eq('task_id', task.id).eq('status', 'pending');
  if (task.status === 'done') return;
  const rows = plan({ ...task, early }).map(x => ({ user_id: S.user.id, task_id: task.id, scheduled_at: new Date(x.at).toISOString(), reminder_type: x.type }));
  if (rows.length) { const { error } = await S.sb.from('reminders').insert(rows); if (error) throw error; }
}
async function saveTask(f, id) {
  const row = { title: f.title.trim(), description: f.description || '', category: f.category || 'General', priority: f.priority || 'medium', due_at: f.due_at || null };
  if (!row.title) throw new Error('Title is required');
  const q = id ? S.sb.from('tasks').update(row).eq('id', id) : S.sb.from('tasks').insert({ ...row, user_id: S.user.id });
  const { data, error } = await q.select().single();
  if (error) throw error;
  await syncReminders(data, f.early);
  await loadData(); return data;
}
async function setDone(id, done) {
  const { data, error } = await S.sb.from('tasks').update({ status: done ? 'done' : 'open' }).eq('id', id).select().single();
  if (error) return fail(error);
  await syncReminders(data); await loadData(); route(); toast(done ? 'Task completed' : 'Task reopened', 'ok');
}
async function delTask(id) {
  if (!confirm('Delete this task? This cannot be undone.')) return false;
  const { error } = await S.sb.from('tasks').delete().eq('id', id); if (error) { fail(error); return false; }
  await loadData(); route(); toast('Task deleted', 'ok'); return true;
}
async function snooze(remId, mins) {
  const { data: r } = await S.sb.from('reminders').select('*').eq('id', remId).single(); if (!r) return;
  const until = new Date(Date.now() + mins * 60000).toISOString();
  const { error } = await S.sb.from('reminders').insert({ user_id: S.user.id, task_id: r.task_id, scheduled_at: until, reminder_type: 'snooze', snoozed_until: until });
  if (error) return fail(error); await loadData(); route(); toast(`Snoozed for ${mins >= 60 ? mins / 60 + ' hour' : mins + ' minutes'}`, 'ok');
}

/* ---------- In-app reminders (only while the app is open; push covers closed state) ---------- */
function quiet() { const s = set(); if (!s.quiet_on) return false; const n = new Date().toLocaleTimeString('en-GB', { timeZone: tz(), hour: '2-digit', minute: '2-digit' }); return s.quiet_start > s.quiet_end ? (n >= s.quiet_start || n < s.quiet_end) : (n >= s.quiet_start && n < s.quiet_end); }
async function tick() {
  if (!S.user || quiet()) return;
  const { data } = await S.sb.from('reminders').select('*,tasks(title,status)').eq('status', 'pending').lte('scheduled_at', new Date().toISOString()).limit(10);
  for (const r of data || []) {
    const { data: claimed } = await S.sb.from('reminders').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', r.id).eq('status', 'pending').select(); // claim prevents duplicates
    if (!claimed?.length) continue;
    if (!r.tasks || r.tasks.status === 'done') continue;
    showReminder(r);
  }
}
function showReminder(r) {
  if (set().sound) try { const a = new AudioContext(), o = a.createOscillator(); o.connect(a.destination); o.frequency.value = 660; o.start(); o.stop(a.currentTime + .15); } catch { }
  if ('Notification' in window && Notification.permission === 'granted') new Notification('KIRO reminder', { body: r.tasks.title, icon: '/icons/icon.svg' });
  const e = document.createElement('div'); e.className = 'toast ok';
  e.innerHTML = `<b>⏰ ${esc(r.tasks.title)}</b><div class="row" style="margin-top:8px"><button class="btn sm" data-act="rdone" data-id="${r.task_id}">Complete</button><button class="btn sm" data-act="rsnz" data-id="${r.id}" data-m="10">10 min</button><button class="btn sm" data-act="rsnz" data-id="${r.id}" data-m="60">1 hour</button><button class="btn sm" data-act="open" data-id="${r.task_id}">Open</button></div>`;
  $('#toasts').append(e); loadData().then(() => { if (['#/dashboard', '#/reminders'].includes(location.hash)) route(); });
}
async function enablePush() {
  if (!('Notification' in window)) return toast('This browser does not support notifications. In-app reminders still work while KIRO is open.', 'err');
  const p = await Notification.requestPermission();
  if (p !== 'granted') return toast('Notifications are blocked. Reminders will only appear while KIRO is open.', 'err');
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !S.cfg.vapidPublicKey) { toast('Notifications enabled while KIRO is open. Background push is not configured.', 'ok'); return route(); }
  try {
    const reg = await navigator.serviceWorker.ready;
    const key = Uint8Array.from(atob(S.cfg.vapidPublicKey.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    const { error } = await S.sb.from('push_subscriptions').upsert({ user_id: S.user.id, endpoint: sub.endpoint, subscription: sub.toJSON() }, { onConflict: 'endpoint' });
    if (error) throw error; toast('Push notifications enabled', 'ok'); route();
  } catch (e) { fail(e, 'Could not enable push'); }
}

/* ---------- AI / chat ---------- */
function dayWord(t) {
  const d = new Date(); const wd = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  if (/tomorrow/.test(t)) d.setDate(d.getDate() + 1); else if (/today|tonight/.test(t)); else {
    const i = wd.findIndex(w => t.includes(w)); if (i < 0) return null; let add = (i - d.getDay() + 7) % 7 || 7; if (/next /.test(t) && add < 7) add += 0; d.setDate(d.getDate() + add);
  } return d;
}
function fallback(text) { // works without any AI key
  const t = text.toLowerCase().trim();
  if (/^(list|show|what|plan|what's coming|what do i)/.test(t) || /upcoming|due today|complete today/.test(t)) return { reply: 'Here is what I found.', action: { type: /plan/.test(t) ? 'plan' : { type: 'list', range: /today/.test(t) ? 'today' : /overdue/.test(t) ? 'overdue' : 'upcoming' }.type, range: /today/.test(t) ? 'today' : /overdue/.test(t) ? 'overdue' : 'upcoming' } };
  let m = t.match(/^(?:mark|complete|finish|done)\s+(?:my\s+)?(.+?)(?:\s+(?:as\s+)?(?:completed|done))?$/); if (m) return { reply: 'On it.', action: { type: 'complete_task', query: m[1] } };
  m = t.match(/^delete\s+(?:my\s+)?(.+)$/); if (m) return { reply: 'Okay.', action: { type: 'delete_task', query: m[1] } };
  m = t.match(/^(?:remind me to|remind me|add task|create (?:a )?(?:high-priority |important |critical )?task(?: to)?|add)\s+(.+)$/i);
  if (m) {
    let title = m[1]; const d = dayWord(t); const tm = t.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/);
    if (!d) return { reply: 'When should I remind you? For example: "tomorrow at 9 AM".', action: null };
    let h = tm ? +tm[1] % 12 + (tm[3] === 'pm' ? 12 : 0) : 9; d.setHours(h, tm?.[2] ? +tm[2] : 0, 0, 0);
    title = title.replace(/\s+(tomorrow|today|tonight|on \w+day|next \w+day|\w+day)\b.*$/i, '').replace(/\s+at\s+\d.*$/i, '').trim();
    return { reply: "I'll set that up.", action: { type: 'create_task', title: title.charAt(0).toUpperCase() + title.slice(1), description: '', category: 'General', priority: /critical/.test(t) ? 'critical' : /high|important|exam/.test(t) ? 'important' : 'medium', due_at: d.toISOString() } };
  }
  return { reply: 'Without an AI key I understand: "remind me to … tomorrow at 9am", "list today", "mark … done", "delete …". Add an AI key in the environment for natural conversation.', action: null };
}
const findTask = q => { q = q.toLowerCase(); return S.tasks.filter(t => t.status === 'open').find(t => t.title.toLowerCase().includes(q) || q.includes(t.title.toLowerCase())); };
const taskLine = t => `• ${t.title} — ${fmt(t.due_at)}${overdue(t) ? ' (overdue)' : ''} [${t.priority}]`;
async function runAction(a) {
  if (!a) return {};
  try {
    if (a.type === 'create_task') {
      const t = await saveTask({ title: a.title, description: a.description, category: a.category, priority: a.priority, due_at: a.due_at, early: true });
      return { text: `Done — "${t.title}" is scheduled for ${fmt(t.due_at)}.`, card: t };
    }
    if (['complete_task', 'delete_task'].includes(a.type)) {
      const t = findTask(a.query || ''); if (!t) return { text: `I couldn't find an open task matching "${a.query}".` };
      if (a.type === 'delete_task') return (await delTask(t.id)) ? { text: `Deleted "${t.title}".` } : { text: 'Okay, I kept it.' };
      if (t.priority === 'critical' && !confirm(`Mark critical task "${t.title}" as complete?`)) return { text: 'Okay, left it open.' };
      await setDone(t.id, true); return { text: `Marked "${t.title}" as completed.` };
    }
    if (a.type === 'snooze') { const r = S.rems.find(r => r.status === 'sent'); if (!r) return { text: 'There is no recent reminder to snooze.' }; await snooze(r.id, a.minutes || 10); return { text: `Snoozed for ${a.minutes || 10} minutes.` }; }
    if (a.type === 'list') {
      const o = S.tasks.filter(t => t.status === 'open'); const l = a.range === 'today' ? o.filter(t => t.due_at && sameDay(t.due_at, new Date())) : a.range === 'overdue' ? o.filter(overdue) : a.range === 'all' ? o : o.filter(t => t.due_at && new Date(t.due_at) >= new Date());
      return { text: l.length ? l.slice(0, 10).map(taskLine).join('\n') : "You're all caught up." };
    }
    if (a.type === 'plan') {
      const w = { critical: 0, important: 1, medium: 2, low: 3 }; const o = S.tasks.filter(t => t.status === 'open' && (!t.due_at || new Date(t.due_at) < new Date(Date.now() + 864e5))).sort((x, y) => w[x.priority] - w[y.priority] || new Date(x.due_at || 9e15) - new Date(y.due_at || 9e15));
      return { text: o.length ? 'Suggested order for today:\n' + o.slice(0, 6).map((t, i) => `${i + 1}. ${t.title} (${fmt(t.due_at)})`).join('\n') : 'Nothing urgent. Enjoy the space.' };
    }
  } catch (e) { return { text: `I couldn't complete that: ${e.message}. Nothing was changed.`, error: true }; }
  return {};
}
async function persist(role, content) {
  try {
    if (!S.conv) { const { data, error } = await S.sb.from('conversations').insert({ user_id: S.user.id }).select().single(); if (error) throw error; S.conv = data.id; }
    await S.sb.from('messages').insert({ conversation_id: S.conv, user_id: S.user.id, role, content });
  } catch (e) { console.warn('history not saved', e); }
}
async function ask(text) {
  const now = Date.now(); S.chat.push({ role: 'user', content: text, at: now }); persist('user', text); orb('thinking');
  let res;
  if (S.cfg.aiConfigured) {
    try {
      const { data: { session } } = await S.sb.auth.getSession();
      const r = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token }, body: JSON.stringify({ messages: S.chat.map(m => ({ role: m.role, content: m.content })), now: new Date().toLocaleString('en-US', { timeZone: tz(), dateStyle: 'full', timeStyle: 'short' }), tz: tz(), style: set().style, tasks: S.tasks.filter(t => t.status === 'open').map(t => ({ title: t.title, due: t.due_at, priority: t.priority })) }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'AI unavailable'); res = await r.json();
    } catch (e) { toast('AI unavailable, using basic commands', 'err'); res = fallback(text); }
  } else res = fallback(text);
  const out = await runAction(res.action);
  const reply = out.text || res.reply || 'Okay.'; // success wording only comes from the real DB result
  S.chat.push({ role: 'assistant', content: reply, card: out.card, at: Date.now() }); persist('assistant', reply);
  orb('idle'); if (set().spoken) speak(reply); return S.chat[S.chat.length - 1];
}

/* ---------- Voice ---------- */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition; let rec, lastReply = '';
function speak(t) {
  if (!('speechSynthesis' in window)) return; lastReply = t; speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(t); u.onstart = () => orb('speaking'); u.onend = u.onerror = () => orb('idle'); speechSynthesis.speak(u);
}
function listen(inputSel) {
  if (!SR) return toast('Voice input is not supported in this browser. Try Chrome or Edge, or type instead.', 'err');
  if (rec) { rec.stop(); return; }
  rec = new SR(); rec.lang = navigator.language || 'en-US'; rec.interimResults = true; rec.continuous = false;
  rec.onstart = () => orb('listening');
  rec.onresult = e => { const i = $(inputSel); if (i) i.value = [...e.results].map(r => r[0].transcript).join(''); };
  rec.onerror = e => { orb('error'); toast(e.error === 'not-allowed' ? 'Microphone permission denied.' : 'Voice error: ' + e.error, 'err'); setTimeout(() => orb('idle'), 2500); };
  rec.onend = () => { rec = null; if (S.orb === 'listening') orb('idle'); $(inputSel)?.focus(); };
  try { rec.start(); } catch { rec = null; }
}

/* ---------- Views ---------- */
const greet = () => { const h = +new Date().toLocaleString('en-GB', { hour: 'numeric', hour12: false, timeZone: tz() }); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };
const askBox = (id, ph = 'Ask KIRO or say "remind me to…"') => `<form class="askbox" data-form="ask" data-input="#${id}"><input id="${id}" placeholder="${ph}" aria-label="Message KIRO" autocomplete="off"><button type="button" class="icon btn" data-act="mic" data-input="#${id}" aria-label="Voice input">${ic('mic')}</button><button class="btn pri" aria-label="Send">${ic('send')}</button></form>`;
const chips = ['Plan my day', 'Add a reminder', "What's coming up?", 'Create a task'];
function taskRow(t) {
  return `<div class="task ${t.status}" data-id="${t.id}"><span class="ckw"><button class="ck ${t.status === 'done' ? 'on' : ''}" data-act="toggle" data-id="${t.id}" aria-label="${t.status === 'done' ? 'Reopen' : 'Complete'} ${esc(t.title)}">${t.status === 'done' ? ic('check', 14) : ''}</button></span>
  <div class="grow"><div class="tt">${esc(t.title)}</div><div class="muted" style="font-size:12px">${fmt(t.due_at)} · ${esc(t.category)}</div></div>
  ${overdue(t) ? '<span class="pill od">Overdue</span>' : ''}<span class="pill p-${t.priority}">${t.priority}</span>
  <button class="icon" data-act="edit" data-id="${t.id}" aria-label="Edit">✎</button><button class="icon" data-act="del" data-id="${t.id}" aria-label="Delete">🗑</button></div>`;
}
const skel = n => Array(n).fill('<div class="sk"></div>').join('');
const empty = (t, s, cta = '') => `<div class="empty"><b>${t}</b>${s}<div style="margin-top:14px">${cta}</div></div>`;
function shell(body, on) {
  const nav = [['dashboard', 'home', 'Dashboard'], ['tasks', 'list', 'My Tasks'], ['assistant', 'bot', 'AI Assistant'], ['reminders', 'bell', 'Reminders'], ['settings', 'gear', 'Settings']];
  return `<div class="shell ${S.collapsed ? 'col' : ''}"><aside class="side"><div class="logo">${LOGO}<span class="lbl">KIRO</span></div>
  ${nav.map(([r, i, l]) => `<a class="nav ${on === r ? 'on' : ''}" href="#/${r}">${ic(i)}<span class="lbl">${l}</span></a>`).join('')}
  <button class="nav" data-act="collapse" aria-label="Collapse sidebar">${ic('menu')}<span class="lbl">Collapse</span></button><div class="grow"></div>
  <div class="nav"><span class="pill">${esc((S.profile?.display_name || '?')[0].toUpperCase())}</span><span class="lbl">${esc(S.profile?.display_name || '')}</span></div>
  <button class="nav" data-act="logout">${ic('out')}<span class="lbl">Logout</span></button></aside>
  <div><div class="top"><div class="logo" style="padding:0">${LOGO}KIRO</div><button class="icon" data-act="quick" aria-label="Quick add">${ic('plus')}</button></div>
  <main class="main">${body}</main></div></div>
  <nav class="bnav" aria-label="Main">${nav.map(([r, i, l]) => `<a class="${on === r ? 'on' : ''}" href="#/${r}" aria-label="${l}">${ic(i)}<span>${l.replace('My ', '').replace('AI ', '')}</span></a>`).join('')}</nav>
  <a class="fab" href="#/assistant" aria-label="Open assistant">${ic('mic', 24)}</a>`;
}
const V = {};
V.dashboard = () => {
  const open = S.tasks.filter(t => t.status === 'open'), today = S.tasks.filter(t => t.due_at && sameDay(t.due_at, new Date())), dn = today.filter(t => t.status === 'done').length, pct = today.length ? Math.round(dn / today.length * 100) : 0;
  const up = open.filter(t => t.due_at).slice(0, 4), w = { critical: 0, important: 1, medium: 2, low: 3 }, focus = [...open].sort((a, b) => overdue(b) - overdue(a) || w[a.priority] - w[b.priority]).slice(0, 3);
  const act = [...S.tasks].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)).slice(0, 5);
  return `<div class="row"><div class="grow"><h1>${greet()}${S.profile?.display_name ? ', ' + esc(S.profile.display_name) : ''}</h1><p class="muted">${new Date().toLocaleDateString([], { dateStyle: 'full', timeZone: tz() })} · Let's make today count.</p></div>
  <span class="pill">${'Notification' in window && Notification.permission === 'granted' ? '🔔 Notifications on' : '🔕 Notifications off'}</span><button class="btn pri" data-act="quick">${ic('plus')} Quick add</button></div>
  <section class="card hero-ai"><div class="orb" data-state="${S.orb}"><i></i></div><div class="grow"><div id="ostate" class="muted" style="min-height:22px"></div>${askBox('dashq')}<div class="chips">${chips.map(c => `<button class="chip" data-act="chip" data-t="${c}">${c}</button>`).join('')}</div><div id="dashreply" class="muted" style="white-space:pre-wrap;margin-top:12px"></div></div></section>
  ${S.loading ? skel(3) : `<div class="grid">
  <section class="card hv"><h2>Today's tasks</h2><div class="row"><b style="font-size:28px">${dn}/${today.length}</b><span class="muted">${today.length - dn} remaining</span></div><div class="prog" style="margin-top:12px"><b style="width:${pct}%"></b></div></section>
  <section class="card hv"><h2>Upcoming deadlines</h2>${up.length ? up.map(t => `<div class="row" style="justify-content:space-between;margin-bottom:6px"><span>${esc(t.title)}</span><span class="pill p-${t.priority}">${fmt(t.due_at)}</span></div>`).join('') : '<p class="muted">No upcoming deadlines.</p>'}</section>
  <section class="card hv"><h2>Focus list</h2>${focus.length ? focus.map(taskRow).join('') : '<p class="muted">Your task list is clear.</p>'}</section>
  <section class="card hv"><h2>Recent activity</h2>${act.length ? act.map(t => `<div class="muted" style="margin-bottom:6px">${t.status === 'done' ? '✓ Completed' : '＋ Task'}: <span style="color:var(--tx)">${esc(t.title)}</span></div>`).join('') : '<p class="muted">Nothing yet.</p>'}${S.rems.filter(r => r.status === 'sent').slice(0, 2).map(r => `<div class="muted">🔔 Reminder: ${esc(r.tasks?.title)}</div>`).join('')}</section></div>`}`;
};
V.tasks = () => {
  const f = S.f, now = new Date();
  let l = S.tasks.filter(t => ({ all: 1, today: t.status === 'open' && t.due_at && sameDay(t.due_at, now), upcoming: t.status === 'open' && t.due_at && new Date(t.due_at) > now, completed: t.status === 'done', overdue: overdue(t) })[f.view]);
  if (f.q) l = l.filter(t => (t.title + t.description).toLowerCase().includes(f.q.toLowerCase())); if (f.pri) l = l.filter(t => t.priority === f.pri); if (f.cat) l = l.filter(t => t.category === f.cat);
  const w = { critical: 0, important: 1, medium: 2, low: 3 }; l.sort(f.sort === 'priority' ? (a, b) => w[a.priority] - w[b.priority] : f.sort === 'created' ? (a, b) => new Date(b.created_at) - new Date(a.created_at) : (a, b) => new Date(a.due_at || 9e15) - new Date(b.due_at || 9e15));
  const cats = [...new Set(S.tasks.map(t => t.category))], shown = l.slice(0, f.page * 30);
  return `<div class="row"><h1 class="grow">My Tasks</h1><button class="btn pri" data-act="quick">${ic('plus')} New task</button></div>
  <div class="tabs">${['all', 'today', 'upcoming', 'completed', 'overdue'].map(v => `<button class="chip ${f.view === v ? 'on' : ''}" data-act="view" data-v="${v}">${v[0].toUpperCase() + v.slice(1)}</button>`).join('')}</div>
  <div class="bar"><input class="search" data-f="q" placeholder="Search tasks" value="${esc(f.q)}" aria-label="Search"><select class="search" data-f="pri" aria-label="Priority"><option value="">Any priority</option>${['low', 'medium', 'important', 'critical'].map(p => `<option ${f.pri === p ? 'selected' : ''}>${p}</option>`).join('')}</select><select class="search" data-f="cat" aria-label="Category"><option value="">Any category</option>${cats.map(c => `<option ${f.cat === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select><select class="search" data-f="sort" aria-label="Sort"><option value="due">Sort: due date</option><option value="priority" ${f.sort === 'priority' ? 'selected' : ''}>Sort: priority</option><option value="created" ${f.sort === 'created' ? 'selected' : ''}>Sort: newest</option></select></div>
  <div id="tl">${S.loading ? skel(5) : shown.length ? shown.map(taskRow).join('') + (l.length > shown.length ? '<button class="btn" data-act="more" style="width:100%">Load more</button>' : '') : empty("You're all caught up.", 'No tasks match this view.', '<button class="btn pri" data-act="quick">Create a task</button>')}</div>`;
};
V.assistant = () => `<div class="row"><div class="orb" style="--sz:64px" data-state="${S.orb}"><i></i></div><div class="grow"><h1>AI Assistant</h1><div id="ostate" class="muted" style="min-height:22px"></div></div><button class="btn sm" data-act="replay">Replay</button><button class="btn sm" data-act="mute">${set().spoken ? 'Mute' : 'Unmute'}</button><button class="btn sm danger" data-act="clearchat">Clear</button></div>
  ${!S.cfg.aiConfigured ? '<div class="card" style="margin:12px 0;border-color:var(--warn)">AI key not configured. Basic commands work (create, list, complete, delete). See README → AI provider.</div>' : ''}
  <div class="chat"><div class="msgs" id="msgs">${msgsHtml()}</div><div class="chips" style="margin-top:8px">${chips.map(c => `<button class="chip" data-act="chip" data-t="${c}">${c}</button>`).join('')}</div>${askBox('chatq')}</div>`;
function msgsHtml() {
  if (!S.chat.length) return empty('Say hello to KIRO', 'Try: "Remind me to submit my assignment tomorrow at 9 AM."');
  return S.chat.map(m => `<div class="m ${m.role}">${esc(m.content)}${m.card ? `<div class="tcard"><b>${esc(m.card.title)}</b><div class="muted">${fmt(m.card.due_at)} · ${m.card.priority}</div><div class="row" style="margin-top:8px"><button class="btn sm" data-act="edit" data-id="${m.card.id}">Edit</button><button class="btn sm" data-act="toggle" data-id="${m.card.id}">Complete</button></div></div>` : ''}<small>${new Date(m.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</small></div>`).join('');
}
V.reminders = () => {
  const p = S.rems.filter(r => r.status === 'pending' && r.tasks?.status === 'open').sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at)), h = S.rems.filter(r => r.status === 'sent');
  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  const row = (r, a) => `<div class="task"><div class="grow"><div>${esc(r.tasks?.title)}</div><div class="muted" style="font-size:12px">${fmt(r.scheduled_at)} · ${r.reminder_type.replace('_', ' ')}</div></div>${a ? `<button class="btn sm" data-act="rsnz" data-id="${r.id}" data-m="10">10m</button><button class="btn sm" data-act="rsnz" data-id="${r.id}" data-m="60">1h</button><button class="btn sm" data-act="rdone" data-id="${r.task_id}">Done</button>` : ''}<button class="btn sm" data-act="open" data-id="${r.task_id}">Open</button></div>`;
  return `<h1>Reminders</h1><div class="card" style="margin:16px 0"><b>Notifications: ${perm}</b><p class="muted">${perm === 'granted' ? (S.cfg.vapidPublicKey ? 'Background push is configured for this device if you enabled it below.' : 'In-app reminders work while KIRO is open. Background push is not configured on this deployment.') : perm === 'unsupported' ? 'Your browser does not support notifications. In-app reminders work while KIRO is open.' : 'Enable notifications to be reminded.'}</p><button class="btn pri" data-act="push" style="margin-top:8px">Enable notifications</button></div>
  <h2>Upcoming</h2>${S.loading ? skel(3) : p.length ? p.map(r => row(r, 1)).join('') : empty('No upcoming reminders.', 'Tasks with a due date get reminders automatically.')}<h2 style="margin-top:20px">Recently sent</h2>${h.length ? h.slice(0, 10).map(r => row(r)).join('') : '<p class="muted">Nothing sent yet.</p>'}`;
};
V.settings = () => {
  const s = set(), th = localStorage.getItem('kiro-theme') || 'system';
  return `<h1>Settings</h1><form data-form="settings" style="max-width:560px;margin-top:16px">
  <div class="card" style="margin-bottom:16px"><h2>Profile</h2><label class="field">Name<input name="display_name" value="${esc(S.profile?.display_name)}"></label><label class="field">Email<input value="${esc(S.user.email)}" disabled></label><label class="field">Timezone<input name="timezone" value="${esc(tz())}"></label></div>
  <div class="card" style="margin-bottom:16px"><h2>Assistant</h2><label class="row"><input type="checkbox" name="spoken" ${s.spoken ? 'checked' : ''}> Speak responses aloud</label><label class="field" style="margin-top:10px">Response style<select name="style"><option ${s.style === 'concise' ? 'selected' : ''}>concise</option><option ${s.style === 'friendly' ? 'selected' : ''}>friendly</option><option ${s.style === 'detailed' ? 'selected' : ''}>detailed</option></select></label></div>
  <div class="card" style="margin-bottom:16px"><h2>Reminders</h2><label class="field">Early reminder (minutes before)<input type="number" name="early_minutes" min="0" max="10080" value="${s.early_minutes}"></label><label class="row"><input type="checkbox" name="quiet_on" ${s.quiet_on ? 'checked' : ''}> Quiet hours</label><div class="row" style="margin:8px 0"><input type="time" name="quiet_start" value="${s.quiet_start}" class="search" style="width:auto"><input type="time" name="quiet_end" value="${s.quiet_end}" class="search" style="width:auto"></div><label class="row"><input type="checkbox" name="sound" ${s.sound ? 'checked' : ''}> Sound</label><label class="row"><input type="checkbox" name="daily_summary" ${s.daily_summary ? 'checked' : ''}> Daily summary (preference saved; sending not in V1)</label></div>
  <div class="card" style="margin-bottom:16px"><h2>Appearance</h2><select class="search" id="theme">${['system', 'dark', 'light'].map(x => `<option ${th === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
  <button class="btn pri">Save settings</button></form>
  <div class="card" style="max-width:560px;margin-top:16px"><h2>Account</h2><div class="row"><button class="btn" data-act="resetpw">Send password reset email</button><button class="btn" data-act="logout">Logout</button><button class="btn danger" data-act="delacct">Delete account</button></div></div>`;
};
const authView = m => `<div class="auth"><div class="card"><a href="#/" class="logo">${LOGO}KIRO</a><h2>${m === 'login' ? 'Welcome back' : m === 'signup' ? 'Create your account' : 'Reset password'}</h2>
<form data-form="${m}" novalidate>${m === 'signup' ? '<label class="field">Name<input name="name" required autocomplete="name"></label>' : ''}<label class="field">Email<input type="email" name="email" required autocomplete="email"></label>${m !== 'reset' ? `<label class="field">Password<input type="password" name="password" minlength="8" required autocomplete="${m === 'login' ? 'current' : 'new'}-password"></label>` : ''}
<div class="err-t" id="aerr" role="alert"></div><button class="btn pri" style="width:100%">${m === 'login' ? 'Log in' : m === 'signup' ? 'Sign up' : 'Send reset link'}</button></form>
<p class="muted" style="margin-top:14px;font-size:13px">${m === 'login' ? '<a href="#/reset">Forgot password?</a> · <a href="#/signup">Create account</a>' : '<a href="#/login">Back to log in</a>'}</p></div></div>`;
V.landing = () => `<div class="land"><nav><div class="logo" style="padding:0">${LOGO}KIRO</div><div class="row"><a class="btn" href="#/login">Log in</a></div></nav>
<header class="hero"><div class="float" style="left:2%;top:90px">✅ Submit assignment · 9:00 AM</div><div class="float" style="right:2%;top:200px;animation-delay:1s">🔔 Exam in 2 days</div><div class="float" style="left:8%;top:330px;animation-delay:2s">🎙 “Remind me in 30 minutes”</div>
<div class="orb" style="--sz:150px;margin:0 auto" data-state="idle"><i></i></div><h1>Your day, understood.</h1><p class="muted" style="font-size:18px;max-width:560px;margin:0 auto 28px">Meet KIRO — your personal AI assistant for tasks, reminders and everything you don't want to forget.</p>
<div class="row" style="justify-content:center"><a class="btn pri" href="#/signup">Get Started</a><a class="btn" href="#features">Explore KIRO</a></div></header>
<section class="sec" id="features"><div class="grid">${[['🎙 Talk naturally', 'Speak or type. KIRO pulls out the task, date and priority.'], ['🔔 Smart reminders', 'Important tasks get day-before, hour-before and at-deadline nudges.'], ['📅 Your day in one place', 'Today, upcoming and overdue at a glance.'], ['⏳ Stay ahead of deadlines', 'Snooze, reschedule or complete in a tap.']].map(([a, b]) => `<div class="card hv"><h2>${a}</h2><p class="muted">${b}</p></div>`).join('')}</div></section>
<section class="sec" style="text-align:center"><h2>Make space for what matters.</h2><a class="btn pri" href="#/signup">Start with KIRO</a></section></div>`;

/* ---------- Modal ---------- */
function taskModal(t = {}) {
  const dt = t.due_at ? new Date(new Date(t.due_at) - new Date(t.due_at).getTimezoneOffset() * 6e4).toISOString().slice(0, 16) : '';
  const m = $('#modal'); m.innerHTML = `<form data-form="task" data-id="${t.id || ''}"><h2>${t.id ? 'Edit task' : 'New task'}</h2>
  <label class="field">Title<input name="title" required maxlength="300" value="${esc(t.title)}"></label><label class="field">Description<textarea name="description">${esc(t.description)}</textarea></label>
  <label class="field">Due<input type="datetime-local" name="due" value="${dt}"></label>
  <div class="row"><label class="field grow">Priority<select name="priority">${['low', 'medium', 'important', 'critical'].map(p => `<option ${(t.priority || 'medium') === p ? 'selected' : ''}>${p}</option>`).join('')}</select></label><label class="field grow">Category<input name="category" list="cats" value="${esc(t.category || 'General')}"><datalist id="cats"><option>Study<option>Work<option>Personal<option>Health<option>Finance</datalist></label></div>
  <label class="row" style="margin-bottom:14px"><input type="checkbox" name="early" checked> Early reminder (medium priority; important/critical use their schedule)</label><div class="err-t" id="merr"></div>
  <div class="row" style="justify-content:flex-end"><button type="button" class="btn" data-act="closem">Cancel</button><button class="btn pri">Save</button></div></form>`; m.showModal(); m.querySelector('input').focus();
}

/* ---------- Events ---------- */
const A = {
  logout: async () => { await S.sb.auth.signOut(); },
  collapse: () => { S.collapsed = !S.collapsed; route(); },
  quick: () => taskModal(), closem: () => $('#modal').close(),
  edit: d => taskModal(S.tasks.find(t => t.id === d.id)), del: d => delTask(d.id),
  toggle: d => setDone(d.id, S.tasks.find(t => t.id === d.id)?.status !== 'done'), rdone: d => setDone(d.id, true),
  rsnz: d => snooze(d.id, +d.m), open: d => { location.hash = '#/tasks'; setTimeout(() => A.edit(d), 200); },
  view: d => { S.f.view = d.v; S.f.page = 1; route(); }, more: () => { S.f.page++; route(); },
  mic: d => listen(d.input), push: enablePush, replay: () => lastReply ? speak(lastReply) : toast('Nothing to replay yet'),
  mute: () => { saveSettings({ spoken: !set().spoken }); }, clearchat: () => { S.chat = []; S.conv = null; route(); },
  chip: d => { const i = $('#chatq') || $('#dashq'); i.value = d.t; i.form.requestSubmit(); },
  resetpw: async () => { const { error } = await S.sb.auth.resetPasswordForEmail(S.user.email, { redirectTo: location.origin + '/#/login' }); error ? fail(error) : toast('Reset email sent', 'ok'); },
  delacct: async () => { if (!confirm('Permanently delete your account and all data?') || prompt('Type DELETE to confirm') !== 'DELETE') return; const { error } = await S.sb.rpc('delete_my_account'); if (error) return fail(error); await S.sb.auth.signOut(); toast('Account deleted', 'ok'); }
};
async function saveSettings(patch, extra = {}) {
  const settings = { ...set(), ...patch }; const { data, error } = await S.sb.from('profiles').update({ settings, ...extra }).eq('id', S.user.id).select().single();
  if (error) return fail(error); S.profile = data; route();
}
document.addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (b) { e.preventDefault(); A[b.dataset.act]?.(b.dataset); } });
document.addEventListener('change', e => {
  if (e.target.dataset.f) { S.f[e.target.dataset.f] = e.target.value; S.f.page = 1; route(); }
  if (e.target.id === 'theme') { localStorage.setItem('kiro-theme', e.target.value); applyTheme(); }
});
document.addEventListener('input', e => { if (e.target.dataset.f === 'q') { S.f.q = e.target.value; S.f.page = 1; const p = e.target.selectionStart; clearTimeout(window._d); window._d = setTimeout(() => { route(); const i = $('[data-f=q]'); i?.focus(); i?.setSelectionRange(p, p); }, 250); } });
document.addEventListener('submit', async e => {
  const f = e.target, k = f.dataset.form; if (!k) return; e.preventDefault(); const d = Object.fromEntries(new FormData(f)), btn = f.querySelector('.pri'); const err = $('#aerr') || $('#merr');
  try {
    if (k === 'ask') { const inp = $(f.dataset.input); const text = inp.value.trim(); if (!text) return; inp.value = ''; if (location.hash === '#/assistant') { $('#msgs').innerHTML = msgsHtml() + '<div class="m assistant typing"><span></span><span></span><span></span></div>'; $('#msgs').scrollTop = 1e9; }
      const r = await ask(text); if (location.hash === '#/assistant') { $('#msgs').innerHTML = msgsHtml(); $('#msgs').scrollTop = 1e9; } else { const o = $('#dashreply'); if (o) o.textContent = r.content; } return; }
    btn && (btn.disabled = true);
    if (k === 'login') { const { error } = await S.sb.auth.signInWithPassword(d); if (error) throw error; }
    if (k === 'signup') { if (d.password.length < 8) throw new Error('Password must be at least 8 characters'); const { data, error } = await S.sb.auth.signUp({ email: d.email, password: d.password, options: { data: { name: d.name } } }); if (error) throw error; if (!data.session) { toast('Check your email to confirm your account', 'ok'); location.hash = '#/login'; } }
    if (k === 'reset') { const { error } = await S.sb.auth.resetPasswordForEmail(d.email, { redirectTo: location.origin + '/#/login' }); if (error) throw error; toast('Reset link sent if the account exists', 'ok'); }
    if (k === 'task') { await saveTask({ title: d.title, description: d.description, category: d.category, priority: d.priority, due_at: d.due ? new Date(d.due).toISOString() : null, early: !!d.early }, f.dataset.id || null); $('#modal').close(); route(); toast('Task saved', 'ok'); }
    if (k === 'settings') { await saveSettings({ spoken: !!d.spoken, style: d.style, early_minutes: +d.early_minutes || 0, quiet_on: !!d.quiet_on, quiet_start: d.quiet_start, quiet_end: d.quiet_end, sound: !!d.sound, daily_summary: !!d.daily_summary }, { display_name: d.display_name, timezone: d.timezone }); toast('Settings saved', 'ok'); }
  } catch (x) { if (err) err.textContent = x.message; else fail(x); } finally { btn && (btn.disabled = false); }
});

/* ---------- Router / boot ---------- */
function applyTheme() { const t = localStorage.getItem('kiro-theme') || 'system'; document.documentElement.dataset.theme = t === 'system' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : t; }
function route() {
  const r = (location.hash.replace('#/', '').split('?')[0]) || ''; const app = $('#app'); const keep = document.activeElement?.id;
  if (!S.sb) return app.innerHTML = `<div class="auth"><div class="card"><h2>Setup needed</h2><p class="muted">Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in your environment and redeploy. See README.</p></div></div>`;
  if (!S.user) { app.innerHTML = ['login', 'signup', 'reset'].includes(r) ? authView(r) : V.landing(); return; }
  const pages = ['dashboard', 'tasks', 'assistant', 'reminders', 'settings']; const p = pages.includes(r) ? r : 'dashboard'; if (r !== p) return (location.hash = '#/' + p);
  app.innerHTML = shell(V[p](), p); orb(S.orb); const m = $('#msgs'); if (m) m.scrollTop = 1e9; if (keep) $('#' + keep)?.focus();
}
window.addEventListener('hashchange', route);
async function boot() {
  applyTheme(); matchMedia('(prefers-color-scheme: light)').addEventListener('change', applyTheme);
  try { S.cfg = await (await fetch('/api/config')).json(); } catch { S.cfg = {}; }
  if (S.cfg.supabaseUrl && window.supabase) S.sb = supabase.createClient(S.cfg.supabaseUrl, S.cfg.supabaseAnonKey);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => { });
  if (!S.sb) return route();
  const onUser = async session => {
    S.user = session?.user || null;
    if (S.user) {
      const { data } = await S.sb.from('profiles').select('*').eq('id', S.user.id).single(); S.profile = data;
      if (data && data.timezone === 'UTC') { const z = Intl.DateTimeFormat().resolvedOptions().timeZone; S.sb.from('profiles').update({ timezone: z }).eq('id', S.user.id).then(() => { }); S.profile.timezone = z; }
      if (!location.hash || /login|signup|reset|^#\/?$/.test(location.hash)) location.hash = '#/dashboard';
      route(); await loadData(); route();
    } else { S.tasks = []; S.rems = []; S.chat = []; S.conv = null; route(); }
  };
  S.sb.auth.onAuthStateChange((ev, s) => { if (ev === 'INITIAL_SESSION' || ev === 'SIGNED_IN' || ev === 'SIGNED_OUT') onUser(s); });
  setInterval(tick, 30000);
}
boot();
