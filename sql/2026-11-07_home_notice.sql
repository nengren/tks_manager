-- 首页“老板寄语”表（只有一行）
create table if not exists public.tks_home_notice (
  id          integer primary key default 1 check (id = 1),
  message     text,
  updated_by  uuid,
  updated_at  timestamptz not null default now()
);
alter table public.tks_home_notice enable row level security;
drop policy if exists tks_home_notice_app_access on public.tks_home_notice;
create policy tks_home_notice_app_access on public.tks_home_notice
  for all to anon, authenticated using (true) with check (true);
grant select, insert, update, delete on public.tks_home_notice to anon, authenticated;
