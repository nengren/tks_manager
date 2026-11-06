-- 客服模板表 CS reply templates
-- 在 Supabase SQL Editor 运行一次即可（先运行 SQL，再合并代码）

create table if not exists public.tks_cs_templates (
  id          uuid primary key default gen_random_uuid(),
  category    text not null default 'other',   -- before / thanks / review / other
  sort_order  integer not null default 0,
  question_zh text not null,
  question_en text not null default '',
  tip_zh      text,
  tip_en      text,
  reply       text not null,
  created_by  uuid,
  updated_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
grant select, insert, update, delete on public.tks_cs_templates to anon, authenticated;

-- 初始模板（只在表为空时插入，重复运行不会重复插入）
insert into public.tks_cs_templates (category, sort_order, question_zh, question_en, tip_zh, tip_en, reply)
select * from (values
('before',10,'地板革：买 1 个是多长？能不能分段？','Linoleum: How long is 1 qty? Can it be cut into pieces?',
 '按码卖，1 码 = 3 尺长，宽度固定 6 尺。不管买几码，都是一整段。','Sold per yard. 1 yard = 3 ft long, width is fixed at 6 ft. One continuous piece no matter how many yards.',
$t$Magandang araw po ma'am/sir! 😊 Para sigurado po sa order ninyo:
• 1 qty = 1 yard = 3 ft ang haba
• Ang lapad ay FIXED na 6 ft
• Halimbawa: Order 3 qty = 3 yards (9 ft ang haba)
Isang tuloy-tuloy na putol lang po ang dadating, kahit ilang yards ang order. Salamat po!$t$),
('before',20,'隔热棉：4mm 是 4 米吗？买 1 个是多长？','Insulation foam: Is 4mm = 4 meters? How long is 1 qty?',
 'mm 是厚度不是长度。按米卖，1 个 = 1 米长、1 米宽，买多少米就是一整卷，不剪断。','"mm" is THICKNESS, not length. Sold per meter: 1 qty = 1 m long, 1 m wide. Ships as one continuous roll.',
$t$Magandang araw po ma'am/sir! 😊 Paalala lang po:
• Ang "mm" ay KAPAL (thickness), HINDI haba. Hal. 4mm = 4 millimeter ang kapal, hindi 4 metro.
• 1 qty = 1 meter ang haba, 1 meter ang lapad
• Kailangan ng 10 meters? Order lang po ng 10 qty — isang tuloy-tuloy na roll po ito, hindi puputulin.
Salamat po!$t$),
('before',30,'客户要求选快递 / 要加急','Customer wants to choose the courier / express delivery',
 '快递是 TikTok 系统自动分配的，卖家选不了。','The courier is assigned by the TikTok system. Sellers cannot choose it.',
$t$Pasensya na po ma'am/sir, hindi po kami ang pumipili ng courier o express delivery — ang system po ng TikTok ang nag-a-assign nito. Salamat po sa pag-unawa! 🙏$t$),
('before',40,'客户要求发货前拍实物照片','Customer asks for a photo of the actual item before shipping',
 '订单多，不单独拍照，但发货前都会检查。','Too many orders to send photos, but every order is checked before shipping.',
$t$Pasensya na po, hindi po kami makapag-send ng actual photo ng bawat order dahil sa dami ng orders. Pero sinisiguro po naming maingat na chine-check ang bawat order bago i-ship. Salamat po sa pag-unawa! 🙏$t$),
('thanks',10,'客户刚下单：感谢','Customer just placed an order: say thank you',
 '每个订单只邀评一次。','Ask for a review only ONCE per order.',
$t$Maraming salamat po sa pag-checkout at pagtangkilik sa aming shop! 💙
Sana po ay magustuhan ninyo ang inyong order. Pagka-receive po, paki-click ang "Order Received" at mag-iwan po ng rating at review. Malaking tulong po ito sa aming maliit na negosyo. Salamat po at God bless!$t$),
('thanks',20,'客户已签收：邀请评价','Order delivered: invite the customer to leave a review',
 '先请客户有问题私信我们，再邀请评价。每单只发一次。','Ask them to message us first if there is a problem. Send only ONCE per order.',
$t$Hi! 😊 We hope you've received your order safely and that you're happy with your purchase.
If you've had a chance to try the product, we'd really appreciate it if you could leave us a rating and a short review. Your feedback helps our small business grow and helps other customers shop with confidence.
If there's anything wrong with your order or you have any concerns, please send us a message first. We'll do our best to resolve the issue as quickly as possible.
Thank you so much for your support, and we look forward to serving you again! ❤️$t$),
('thanks',30,'买得多的老客户：简短感谢','Repeat / bulk buyer: short thank-you',
 null,null,
$t$Thank you so much for your purchase! We truly appreciate your support and hope you love your order. If you have any questions or need any assistance, feel free to message us anytime. Have a wonderful day!$t$),
('review',10,'收到 5 星评价','Received a 5-star review',
 null,null,
$t$Maraming salamat po sa 5-star review! 😊 Natutuwa po kaming nagustuhan ninyo ang produkto. Sana po ay makabili ulit kayo sa amin!$t$),
('review',20,'收到 4 星评价','Received a 4-star review',
 null,null,
$t$Salamat po sa review! 😊 Natutuwa po kaming nagustuhan ninyo ito. Kung may napansin po kayong pwede pa naming i-improve, i-message lang po kami — gusto po naming maibigay ang 5-star experience sa susunod. Maraming salamat po sa tiwala! 🙏$t$),
('review',30,'收到 3 星评价','Received a 3-star review',
 null,null,
$t$Salamat po sa review! 😊 Sabihin lang po ninyo kung ano pa ang pwede naming i-improve — message lang po kayo anytime. 🙏$t$),
('review',40,'收到 1–2 星差评（一般情况）','Received a 1–2 star review (general)',
 '目标是把客户引到私信解决，不要在评价区争辩。绝对不要请客户改评分。','Goal: move the customer to private messages. Do not argue in public. NEVER ask them to change the rating.',
$t$Pasensya na po sa hindi magandang experience. 🙏 Gusto po naming maayos ito — paki-message po kami directly para matulungan namin kayo agad. Salamat po.$t$),
('review',50,'发错货 / 破损 / 缺件','Wrong item / damaged / missing item',
 '主动提出补发或退款，请客户私信。处理完记录到问题日志。','Offer replacement or refund, ask them to message us. Log it in the Issue Log afterwards.',
$t$Hi po, sorry po sa naging experience ninyo 🙏 Hindi po ito ang standard na gusto naming ibigay sa customers namin. Please message us directly para ma-check namin at mabigyan namin kayo ng proper solution (replacement/refund). Salamat po sa feedback ninyo!$t$),
('review',60,'客户嫌贵 / 嫌质量差','Customer says it is too expensive / low quality',
 '语气要软，不要跟客户争。','Stay polite and soft. Do not argue with the customer.',
$t$Pasensya na po kung hindi namin naabot ang inyong inaasahan. 🙏 Ang presyo po ng aming produkto ay naaayon sa kalidad at materyales na ginagamit namin. Kung may problema po sa natanggap ninyo, paki-message po kami para ma-check namin agad. Patuloy po naming pinapabuti ang aming produkto at serbisyo. Salamat po sa feedback!$t$),
('review',70,'客户嫌太薄 / 太厚','Customer says it is too thin / too thick',
 '不要说"厚度刚好"，说明厚度和页面一致，怀疑发错就私信。','Do not say "it is just right". Explain the thickness matches the listing; if they think it is wrong, ask them to message us.',
$t$Pasensya na po kung hindi ito tumugma sa inaasahan ninyo. Ang kapal po ng produkto ay ayon sa nakalagay sa listing (hal. 4mm / 5mm / 10mm). Kung sa tingin po ninyo ay mali ang natanggap ninyo, paki-message po kami at titingnan namin agad. Salamat po!$t$)
) as v(category, sort_order, question_zh, question_en, tip_zh, tip_en, reply)
where not exists (select 1 from public.tks_cs_templates);

-- 回退（如需撤销）：drop table if exists public.tks_cs_templates;
