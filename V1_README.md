# KIRO — AI Personal Assistant (V1)

Vanilla HTML/CSS/JS frontend · Supabase (Auth, Postgres, RLS) · Vercel serverless (`/api`) · Web Push.

## Structure
```
index.html  css/styles.css  js/app.js  sw.js  icons/icon.svg
api/config.js  api/ai.js  api/cron.js
supabase/schema.sql  vercel.json  package.json  .env.example
```

## Setup
1. **Supabase**: create a project → SQL editor → run `supabase/schema.sql`. Auth → URL config: add your Vercel URL as Site URL / redirect.
2. **Env vars** (see `.env.example`): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `CRON_SECRET`.
3. **AI provider**: any OpenAI-compatible endpoint (Groq, OpenRouter, etc.). Without `AI_API_KEY`, basic commands still work ("remind me to … tomorrow at 9am", "list today", "mark … done", "delete …").
4. **VAPID keys**: `npx web-push generate-vapid-keys`.
5. **Run locally**: `npm i -g vercel && npm i && vercel dev`. **Deploy**: push to GitHub → import in Vercel → add env vars.
6. **Reminder worker**: `/api/cron` needs header `Authorization: Bearer $CRON_SECRET`. Vercel Hobby crons run once a day, which is too coarse. Call it every minute from Supabase `pg_cron` + `pg_net`, GitHub Actions, or cron-job.org.

## Behaviour notes (honest limits)
- Task/reminder success is only shown after the database write succeeds.
- In-app reminders fire only while KIRO is open. Closed-browser reminders need push permission, VAPID keys and the cron worker.
- Quiet hours are enforced by the in-app reminder check only, not by `/api/cron`.
- Daily summary is stored as a preference but not sent in V1. Reminder retries: 3 attempts, then `failed`.
- Voice input uses the Web Speech API (Chrome/Edge/Safari); other browsers get a clear fallback message.
- Not in V1: geofencing, native app, calendar sync, WhatsApp/Telegram, background listening.

## Troubleshooting
- "Setup needed" screen → Supabase env vars missing. Signup does nothing → check email confirmation setting.
- No AI replies → check `AI_*` vars and Vercel function logs. Push not arriving → check VAPID keys, cron secret, and that you clicked "Enable notifications".
- RLS errors → re-run `schema.sql` fully.

## Testing status
Code was syntax-checked only. It has not been run against a live Supabase project, so run through the checklist (signup, task CRUD, reminders, voice, mobile) after deploying.
