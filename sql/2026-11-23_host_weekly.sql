-- 主播周表现：直播间 + 每周汇总数据
-- 可重复运行
create table if not exists public.tks_host_rooms (
  id          uuid primary key default gen_random_uuid(),
  room_num    text,                 -- 房间号，如 tkshop#4
  account     text,                 -- 店铺账号
  host_name   text,                 -- 主播
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
create table if not exists public.tks_host_weeks (
  id           uuid primary key default gen_random_uuid(),
  room_id      uuid not null references public.tks_host_rooms(id) on delete cascade,
  week_key     text not null,       -- 2026-11-16~2026-11-22
  date_range   text,
  gmv          numeric not null default 0,   -- Direct GMV
  gross        numeric not null default 0,
  dur_sec      numeric not null default 0,   -- 直播总时长（秒）
  orders       integer not null default 0,
  followers    integer not null default 0,
  views        integer not null default 0,
  items        integer not null default 0,
  custs        integer not null default 0,
  prod_imps    integer not null default 0,
  prod_clks    integer not null default 0,
  likes        integer not null default 0,
  comments     integer not null default 0,
  shares       integer not null default 0,
  sessions     integer not null default 0,
  cancel       numeric not null default 0,   -- 取消订单金额
  imported_by  uuid,
  imported_at  timestamptz not null default now(),
  unique (room_id, week_key)
);
do $$ declare t text; begin
  foreach t in array array['tks_host_rooms','tks_host_weeks'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_app_access', t);
    execute format('create policy %I on public.%I for all to anon, authenticated using (true) with check (true)', t||'_app_access', t);
    execute format('grant select, insert, update, delete on public.%I to anon, authenticated', t);
  end loop;
end $$;
