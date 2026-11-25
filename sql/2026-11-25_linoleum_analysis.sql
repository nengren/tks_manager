-- 地板皮革分析：参数设置（只有一行，可在页面上修改）
-- 可重复运行
create table if not exists public.tks_lino_settings (
  id               integer primary key default 1 check (id = 1),
  baseline_date    date    not null default '2026-11-18',  -- 价格基准日：之前的改价算初始录入，之前的订单不算利润
  cost_per_yard    numeric not null default 45,            -- 每码成本 ₱
  commission_pct   numeric not null default 20,            -- 平台佣金 %
  per_order_fee    numeric not null default 3,             -- 每单固定扣费 ₱
  creator_share_pct numeric not null default 30,           -- 达人单占比 %
  creator_comm_pct numeric not null default 10,            -- 达人佣金 %
  updated_by       uuid,
  updated_at       timestamptz not null default now()
);
insert into public.tks_lino_settings (id) values (1) on conflict (id) do nothing;
alter table public.tks_lino_settings enable row level security;
drop policy if exists tks_lino_settings_app_access on public.tks_lino_settings;
create policy tks_lino_settings_app_access on public.tks_lino_settings
  for all to anon, authenticated using (true) with check (true);
grant select, insert, update, delete on public.tks_lino_settings to anon, authenticated;
