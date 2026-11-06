-- 修复：新建的 tks_cs_templates 表被自动开启了行级安全(RLS)但没有放行规则，导致页面看不到/存不进
-- 这里加一条放行规则，让它和其他 tks_ 表一样可以从页面读写（与目前整个工具的安全级别一致）
alter table public.tks_cs_templates enable row level security;
drop policy if exists tks_cs_templates_app_access on public.tks_cs_templates;
create policy tks_cs_templates_app_access on public.tks_cs_templates
  for all to anon, authenticated using (true) with check (true);
grant select, insert, update, delete on public.tks_cs_templates to anon, authenticated;
