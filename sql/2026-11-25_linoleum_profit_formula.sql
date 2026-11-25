-- 地板皮革分析：按 Ken 的利润公式更新参数
-- 利润 = 销售额 × 80% − 每单 ₱5 − 成本 ₱45/码（不再单独算达人佣金）
update public.tks_lino_settings
   set commission_pct = 20,
       per_order_fee = 5,
       cost_per_yard = 45,
       creator_share_pct = 0,
       updated_at = now()
 where id = 1;
