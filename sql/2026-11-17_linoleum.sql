-- 地板皮革价格表 + 销量（第一阶段）
-- 在 Supabase SQL Editor 运行一次；可重复运行

create table if not exists public.tks_lino_stores (
  store         text primary key,              -- 马帮店铺名
  label         text not null,                 -- 显示简称，如 #2
  sort_order    integer not null default 0,
  is_active     boolean not null default true,
  checked_at    timestamptz,                   -- 最后一次“本店已核对”
  checked_by    uuid,
  created_at    timestamptz not null default now()
);
create table if not exists public.tks_lino_skus (
  sku           text primary key,              -- 马帮库存SKU
  image_src     text,                          -- 马帮原图链接
  image_thumb   text,                          -- 压缩后的小图（存在 Supabase）
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);
create table if not exists public.tks_lino_prices (
  sku           text not null references public.tks_lino_skus(sku) on update cascade on delete cascade,
  store         text not null references public.tks_lino_stores(store) on update cascade on delete cascade,
  price         numeric(10,2) not null,        -- 折扣价 Deal price
  updated_by    uuid,
  updated_at    timestamptz not null default now(),
  primary key (sku, store)
);
create table if not exists public.tks_lino_price_log (
  id             uuid primary key default gen_random_uuid(),
  sku            text not null,
  store          text not null,
  old_price      numeric(10,2),                -- 空 = 原来没上架
  new_price      numeric(10,2),                -- 空 = 下架/清空
  effective_date date not null default current_date,
  changed_by     uuid,
  changed_at     timestamptz not null default now()
);
create index if not exists tks_lino_price_log_idx on public.tks_lino_price_log (sku, store, effective_date);
create table if not exists public.tks_lino_sales (
  order_id      text not null,
  sku           text not null,
  store         text not null,
  sale_date     date not null,                 -- 发货日期
  qty           numeric(10,2) not null,
  source        text,                          -- mabang / fee
  imported_at   timestamptz not null default now(),
  primary key (order_id, sku)
);
create index if not exists tks_lino_sales_date_idx on public.tks_lino_sales (sale_date);

-- 按天×店×SKU 汇总（分析只读这个，避免卡）
create or replace view public.tks_lino_daily as
  select sale_date, store, sku, sum(qty) as qty, count(*) as orders
  from public.tks_lino_sales group by sale_date, store, sku;

-- 权限（与工具其他表一致）
do $$ declare t text; begin
  foreach t in array array['tks_lino_stores','tks_lino_skus','tks_lino_prices','tks_lino_price_log','tks_lino_sales'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_app_access', t);
    execute format('create policy %I on public.%I for all to anon, authenticated using (true) with check (true)', t||'_app_access', t);
    execute format('grant select, insert, update, delete on public.%I to anon, authenticated', t);
  end loop;
end $$;
grant select on public.tks_lino_daily to anon, authenticated;

-- 初始店铺（9-10月有地板皮革销量的 TikTok 店，不含 Shopee）
insert into public.tks_lino_stores (store,label,sort_order) values
  ('tk-matspace#1','#1',1),
  ('tk-nestorahomes#2','#2',2),
  ('tk-sweethome08#3','#3',3),
  ('tk-smarttools#4','#4',4),
  ('tk-sweetbahay#5','#5',5),
  ('tk-coolhouse#6','#6',6),
  ('tk-smartdiy#7','#7',7),
  ('tk-matshield#10','#10',10),
  ('tk-smartlivinghome#11','#11',11),
  ('tk#14 RaveVamp','#14',14),
  ('tk#15 rideshield','#15',15)
on conflict (store) do nothing;

-- 初始 SKU：马帮图片表（目前只有 Li-K）+ 9-10月有销量的（含 Li-X，暂无图片，之后补导）；全部默认在售，可在页面上停用
insert into public.tks_lino_skus (sku,image_src,is_active) values
  ('Li-K-11114A','https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/72a53f3e6dc947d5a8fcc6bbc6c919ae~tplv-aphluv4xwc-origin-jpeg.jpeg?dr=15568&t=555f072d&ps=933b5bde&shp=54477afb&shcp=3c3d9ffb&idc=my2&from=1413970683',true),
  ('Li-K-11118A','https://cos-java-picture.mabangerp.com/54/1/3890878_1773404573946.jpg',true),
  ('Li-K-1143A','https://cos-java-picture.mabangerp.com/54/1/3989424_1779167989976.jpg',true),
  ('Li-K-1143B','https://cos-java-picture.mabangerp.com/54/1/4113396_1786431771232.jpg',true),
  ('Li-K-11502A','https://cos-java-picture.mabangerp.com/54/1/3890865_1773404571982.jpg',true),
  ('Li-K-11907A','https://cos-java-picture.mabangerp.com/54/1/3890805_1773402931395.jpg',true),
  ('Li-K-12401B','https://cos-java-picture.mabangerp.com/54/1/4232167_1794307663617.jpg',true),
  ('Li-K-12939A','https://cos-java-picture.mabangerp.com/54/1/4113216_1786414878613.jpg',true),
  ('Li-K-12940A','https://cos-java-picture.mabangerp.com/54/1/4113295_1786421028460.jpg',true),
  ('Li-K-1303A','https://cos-java-picture.mabangerp.com/54/1/3890864_1773404573326.jpg',true),
  ('Li-K-13207A','https://cos-java-picture.mabangerp.com/54/1/3890886_1773404575257.jpg',true),
  ('Li-K-13208A','https://cos-java-picture.mabangerp.com/54/1/3952191_1777650426520.jpg',true),
  ('Li-K-13404A','https://cos-java-picture.mabangerp.com/54/1/3900304_1774583856297.jpg',true),
  ('Li-K-14538A','https://cos-java-picture.mabangerp.com/54/1/4112460_1786358453444.jpg',true),
  ('Li-K-15301A','https://cos-java-picture.mabangerp.com/54/1/3890874_1773404575186.jpg',true),
  ('Li-K-16705A','https://cos-java-picture.mabangerp.com/54/1/3890862_1773404572698.jpg',true),
  ('Li-K-16706A','https://global.mabangerp.com/image/photo_default.jpg',true),
  ('Li-K-16825A','https://cos-java-picture.mabangerp.com/54/1/4112463_1786358581814.jpg',true),
  ('Li-K-16829A','https://cos-java-picture.mabangerp.com/54/1/4125421_1787140356503.jpg',true),
  ('Li-K-17125A','https://cos-java-picture.mabangerp.com/54/1/3954518_1777978957145.jpg',true),
  ('Li-K-19025A','https://cos-java-picture.mabangerp.com/54/1/4112866_1786405698061.jpg',true),
  ('Li-K-19042A','https://cos-java-picture.mabangerp.com/54/1/4190554_1791195043683.jpg',true),
  ('Li-K-19905A','https://cos-java-picture.mabangerp.com/54/1/3900354_1774584723329.jpg',true),
  ('Li-K-2025A','https://cos-java-picture.mabangerp.com/54/1/4112466_1786358763250.jpg',true),
  ('Li-K-23311A','https://cos-java-picture.mabangerp.com/54/1/3890857_1773404569738.jpg',true),
  ('Li-K-25203A','https://cos-java-picture.mabangerp.com/54/1/3890859_1773404572458.jpg',true),
  ('Li-K-25313A','https://cos-java-picture.mabangerp.com/54/1/3890883_1773404577159.jpg',true),
  ('Li-K-25702A','https://cos-java-picture.mabangerp.com/59/1/3711082_1769295420326.jpg',true),
  ('Li-K-28514A','https://cos-java-picture.mabangerp.com/54/1/3890885_1773404576413.jpg',true),
  ('Li-K-28803A','https://cos-java-picture.mabangerp.com/54/1/3914405_1775887315035.jpg',true),
  ('Li-K-28804A','https://cos-java-picture.mabangerp.com/54/1/3890880_1773404577112.jpg',true),
  ('Li-K-28805A','https://cos-java-picture.mabangerp.com/59/1/3710723_1769246761940.jpg',true),
  ('Li-K-28808A','https://cos-java-picture.mabangerp.com/54/1/4090170_1784860741234.jpg',true),
  ('Li-K-33013A','https://cos-java-picture.mabangerp.com/54/1/3890882_1773404578867.jpg',true),
  ('Li-K-33801A','https://cos-java-picture.mabangerp.com/54/1/3890860_1773404571684.jpg',true),
  ('Li-K-34901A','https://cos-java-picture.mabangerp.com/54/1/3900369_1774585009312.jpg',true),
  ('Li-K-34902A','https://cos-java-picture.mabangerp.com/54/1/3890856_1773404569211.jpg',true),
  ('Li-K-35309A','https://cos-java-picture.mabangerp.com/54/1/3914378_1775882501018.jpg',true),
  ('Li-K-35313A','https://cos-java-picture.mabangerp.com/54/1/3952404_1777699207511.jpg',true),
  ('Li-K-35316A','https://cos-java-picture.mabangerp.com/54/1/3890881_1773404578837.jpg',true),
  ('Li-K-35704A','https://cos-java-picture.mabangerp.com/59/1/3711674_1769390854641.jpg',true),
  ('Li-K-36201A','https://cos-java-picture.mabangerp.com/54/1/4170961_1789642977171.jpg',true),
  ('Li-K-36202A','https://cos-java-picture.mabangerp.com/54/1/4090057_1784857111454.jpg',true),
  ('Li-K-400A','https://cos-java-picture.mabangerp.com/54/1/3890887_1773404575616.jpg',true),
  ('Li-K-4902A','https://cos-java-picture.mabangerp.com/59/1/3739366_1773425356108.jpg',true),
  ('Li-K-49825B','https://cos-java-picture.mabangerp.com/54/1/4129230_1787450442664.jpg',true),
  ('Li-K-59124A','https://cos-java-picture.mabangerp.com/54/1/4112479_1786359790536.jpg',true),
  ('Li-K-59624B','https://cos-java-picture.mabangerp.com/54/1/4128709_1787391978473.jpg',true),
  ('Li-K-7012A','https://cos-java-picture.mabangerp.com/54/1/3900273_1774580720306.jpg',true),
  ('Li-K-X1143A',null,true),
  ('Li-K-X12940',null,true),
  ('Li-K-X48324A',null,true),
  ('Li-K-X49825A',null,true),
  ('Li-K-X59624A',null,true),
  ('Li-K-X9329',null,true),
  ('Li-K-hellokitty','https://cos-java-picture.mabangerp.com/54/1/3900315_1774584543024.jpg',true),
  ('Li-X-12524A',null,true),
  ('Li-X-12939A',null,true),
  ('Li-X-14541A',null,true),
  ('Li-X-16109A',null,true),
  ('Li-X-16704A',null,true),
  ('Li-X-16706A',null,true),
  ('Li-X-18904A',null,true),
  ('Li-X-19042A',null,true),
  ('Li-X-19507A',null,true),
  ('Li-X-19803A',null,true),
  ('Li-X-2501A',null,true),
  ('Li-X-25313A',null,true),
  ('Li-X-2604A',null,true),
  ('Li-X-29205A',null,true),
  ('Li-X-29206A',null,true),
  ('Li-X-30002A',null,true),
  ('Li-X-3002A',null,true),
  ('Li-X-30102A',null,true),
  ('Li-X-32801A',null,true),
  ('Li-X-32802A',null,true),
  ('Li-X-32806A',null,true),
  ('Li-X-33201A',null,true),
  ('Li-X-43603A',null,true),
  ('Li-X-56128A',null,true),
  ('Li-i-30710A',null,true)
on conflict (sku) do nothing;

-- 最近30天每店每SKU销量（价格表用来标“有销量但没填价格”，数据量很小）
create or replace view public.tks_lino_recent30 as
  select store, sku, sum(qty) as qty
  from public.tks_lino_sales where sale_date >= current_date - 30
  group by store, sku;
grant select on public.tks_lino_recent30 to anon, authenticated;
