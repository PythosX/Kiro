-- KIRO schema. Run in Supabase SQL editor.
create extension if not exists "pgcrypto";
create table public.profiles(
  id uuid primary key references auth.users on delete cascade,
  display_name text, timezone text default 'UTC',
  settings jsonb not null default '{"spoken":false,"style":"concise","early_minutes":60,"quiet_start":"22:00","quiet_end":"07:00","quiet_on":false,"daily_summary":false,"sound":true}',
  created_at timestamptz default now());
create table public.tasks(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  title text not null check (char_length(title) between 1 and 300),
  description text default '', category text default 'General',
  priority text not null default 'medium' check (priority in ('low','medium','important','critical')),
  due_at timestamptz, status text not null default 'open' check (status in ('open','done')),
  created_at timestamptz default now(), updated_at timestamptz default now());
create index on public.tasks(user_id,status,due_at);
create table public.reminders(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  task_id uuid not null references public.tasks on delete cascade,
  scheduled_at timestamptz not null, reminder_type text default 'at_due',
  status text not null default 'pending' check (status in ('pending','sending','sent','cancelled','failed')),
  sent_at timestamptz, snoozed_until timestamptz, retry_count int default 0,
  created_at timestamptz default now());
create index on public.reminders(status,scheduled_at);
create unique index on public.reminders(task_id,scheduled_at,reminder_type) where status='pending';
create table public.conversations(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade, created_at timestamptz default now());
create table public.messages(id uuid primary key default gen_random_uuid(), conversation_id uuid not null references public.conversations on delete cascade, user_id uuid not null references auth.users on delete cascade, role text not null check (role in ('user','assistant')), content text not null, created_at timestamptz default now());
create index on public.messages(conversation_id,created_at);
create table public.push_subscriptions(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade, endpoint text unique not null, subscription jsonb not null, created_at timestamptz default now());

create function public.touch() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
create trigger tasks_touch before update on public.tasks for each row execute function public.touch();
create function public.new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin insert into public.profiles(id,display_name) values(new.id,coalesce(new.raw_user_meta_data->>'name',split_part(new.email,'@',1))); return new; end $$;
create trigger on_signup after insert on auth.users for each row execute function public.new_user();

alter table public.profiles enable row level security;
alter table public.tasks enable row level security;
alter table public.reminders enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.push_subscriptions enable row level security;
create policy own_profile on public.profiles for all using (id=auth.uid()) with check (id=auth.uid());
create policy own_tasks on public.tasks for all using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy own_rem on public.reminders for all using (user_id=auth.uid()) with check (user_id=auth.uid() and exists(select 1 from public.tasks t where t.id=task_id and t.user_id=auth.uid()));
create policy own_conv on public.conversations for all using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy own_msg on public.messages for all using (user_id=auth.uid()) with check (user_id=auth.uid() and exists(select 1 from public.conversations c where c.id=conversation_id and c.user_id=auth.uid()));
create policy own_push on public.push_subscriptions for all using (user_id=auth.uid()) with check (user_id=auth.uid());

create function public.delete_my_account() returns void language plpgsql security definer set search_path=public,auth as $$
begin delete from auth.users where id=auth.uid(); end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
