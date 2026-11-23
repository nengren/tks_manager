-- 打开聊天消息表的实时推送（Realtime），工具不再每隔几秒拉消息
-- 可重复运行
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tks_messages'
  ) then
    alter publication supabase_realtime add table public.tks_messages;
  end if;
end $$;

-- 检查：返回一行 tks_messages 就说明已打开
select schemaname, tablename from pg_publication_tables
where pubname = 'supabase_realtime' and tablename = 'tks_messages';
