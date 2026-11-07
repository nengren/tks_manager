-- 删除问题日志（数据不可恢复）
drop table if exists public.tks_issues cascade;

-- 客服模板里有一条提示写着“处理完记录到问题日志”，一并改掉
update public.tks_cs_templates
set tip_zh = '主动提出补发或退款，请客户私信。',
    tip_en = 'Offer replacement or refund, ask them to message us.'
where tip_en like '%Issue Log%';
