/* ============================================================
   地板皮革 · 分析页（只有 admin 能看）
   独立文件：打开分析页时才加载
   数据：tks_lino_daily（按天×店×SKU 汇总的销量）
        tks_lino_price_log（改价记录）+ tks_lino_prices（当前价）
        tks_lino_settings（基准日、成本、佣金等参数）
   规则：
   - 初始价格日（之前叫基准日）之前的改价 = 初始录入，不算调价；这天之前的订单按这天的价格算
   - 每天的价格 = 当天最后一次改价后的价格
   - 利润 = 销售额 ×(1 − 佣金%) − 每单固定费 − 成本×码数（Ken 的公式：销售额×0.8 − ₱5/单）
   - 断货/清货按 SKU 整体（所有店合计）判断，因为库存是共用的
   ============================================================ */
(function(){
if(!document.getElementById('laCss')){const st=document.createElement('style');st.id='laCss';st.textContent=`.la-head{display:flex;flex-wrap:wrap;gap:12px;justify-content:space-between;align-items:flex-start}.la-ctrl{display:flex;flex-wrap:wrap;gap:8px}.la-ctrl .lino-seg button{padding:6px 10px;font-size:.78rem}
.la-b{display:inline-block;font-size:.68rem;font-weight:700;border-radius:6px;padding:1px 6px;margin:2px 4px 0 0;white-space:nowrap}.la-b.star{background:#fef3c7;color:#92400e}.la-b.dead{background:#f1f5f9;color:#475569}.la-b.out{background:#fee2e2;color:#b91c1c}.la-b.slow{background:#ffedd5;color:#9a3412}.la-b.new{background:#dcfce7;color:#166534}
.la-ins{display:grid;gap:8px;margin-bottom:10px}.la-in{border-radius:10px;padding:10px 14px;border:1px solid var(--border);background:#fff;font-size:.85rem;line-height:1.7}.la-in summary{cursor:pointer;font-weight:700}.la-in>div{margin-top:6px}.la-in.bad{border-left:4px solid #ef4444}.la-in.warn{border-left:4px solid #f97316}.la-in.good{border-left:4px solid #10b981}.la-in.info{border-left:4px solid #0ea5e9}
.la-table td{min-width:70px}.la-main{font-weight:700}.la-price{font-size:.7rem;color:var(--text3)}.la-tot{background:#f8fafc}.la-detail{margin-top:14px}.la-set{margin-top:14px}.la-set summary{cursor:pointer;font-weight:700}
.la-qgrid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px;font-size:.82rem}.la-qgrid>div{background:#f8fafc;border-radius:8px;padding:8px 12px}
.la-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.la-kpis>div{background:#f8fafc;border-radius:10px;padding:12px}.la-kpis .v{font-size:1.3rem;font-weight:800}.la-kpis .l{font-size:.75rem;color:var(--text3)}
.la-bar{height:10px;background:#f1f5f9;border-radius:5px;overflow:hidden}.la-bar span{display:block;height:100%;background:linear-gradient(90deg,#10b981,#0ea5e9)}
.la-sim td,.la-sim th{padding:6px 8px}.la-sim .now{background:#fef9c3}
@media(max-width:760px){.la-qgrid,.la-kpis{grid-template-columns:1fr 1fr}}`;document.head.appendChild(st)}
const LA={win:'all',view:'quad',metric:'yards',sort:'yards',tier:'all',detail:null,data:null,charts:[],qchart:null,simP:''};
const winLabel=w=>w==='all'?'全部 All':w+' 天 days';
const DAY=86400000;
const addD=(d,n)=>{const x=new Date(d+'T00:00:00Z');x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10)};
const fmt0=n=>Math.round(n).toLocaleString();
const fmt1=n=>(Math.round(n*10)/10).toLocaleString(undefined,{minimumFractionDigits:1,maximumFractionDigits:1});
const peso=n=>(n<0?'-₱':'₱')+Math.abs(Math.round(n)).toLocaleString();
const pct=n=>(n*100).toFixed(1)+'%';
const peso1=n=>(n<0?'-₱':'₱')+Math.abs(n).toFixed(1);

async function getAll(table,query){
  const out=[];
  for(let off=0;off<200000;off+=1000){
    const r=await sb.get(table,query+'&limit=1000&offset='+off);
    if(!Array.isArray(r))throw new Error(table+' 读取失败 load failed');
    out.push(...r);if(r.length<1000)break;
  }
  return out;
}

async function loadAll(){
  const [last,settingsR]=await Promise.all([
    sb.get('tks_lino_daily','select=sale_date&order=sale_date.desc&limit=1'),
    sb.get('tks_lino_settings','id=eq.1')
  ]);
  if(!Array.isArray(settingsR))throw new Error('参数表不存在，请先运行 SQL · Settings table missing, run the SQL first');
  const S=settingsR[0]||{baseline_date:'2026-11-18',cost_per_yard:45,commission_pct:20,per_order_fee:5};
  if(!Array.isArray(last)||!last.length)return {empty:true,S};
  const E=last[0].sale_date;
  const [daily,log]=await Promise.all([
    getAll('tks_lino_daily','select=sale_date,store,sku,qty,orders&order=sale_date.asc'),
    getAll('tks_lino_price_log','select=sku,store,old_price,new_price,effective_date,changed_at&order=changed_at.asc')
  ]);
  return {E,S,daily,log};
}

/* ---------- 计算 ---------- */
function compute(raw){
  const {E,S,daily,log}=raw;
  const base=String(S.baseline_date).slice(0,10);
  const k=(sku,st)=>sku+'||'+st;
  // 价格历史：每个 SKU×店 的改价记录（按时间）
  const hist={};
  for(const r of log){(hist[k(r.sku,r.store)]=hist[k(r.sku,r.store)]||[]).push(r)}
  const priceOn=(key,d)=>{
    const dd=d<base?base:d;                            // 初始价格日之前：按初始价格日当天的价格算
    const h=hist[key];
    if(!h){const p=lino.prices[key];return p==null?undefined:p}  // 没有任何记录：用当前价
    let p;let found=false;
    for(const e of h){if(e.effective_date<=dd){p=e.new_price==null?null:Number(e.new_price);found=true}else break}
    if(!found)p=h[0].old_price==null?null:Number(h[0].old_price); // 后来才第一次填：之前用改前价
    if(d<base&&p==null){const f=h.find(e=>e.new_price!=null);if(f)p=Number(f.new_price)} // 早期有卖、后来才填价：用第一次填的价
    return p;                                          // null = 没上架
  };
  // 每个 SKU×店×日 的销量
  const q={},o={};const skuDay={},qm={},sd={};
  for(const r of daily){const key=k(r.sku,r.store);const qt=Number(r.qty)||0,od=Number(r.orders)||0;
    (q[key]=q[key]||{})[r.sale_date]=qt;(o[key]=o[key]||{})[r.sale_date]=od;
    (skuDay[r.sku]=skuDay[r.sku]||{})[r.sale_date]=(skuDay[r.sku][r.sale_date]||0)+qt;
    qm[key+'||'+r.sale_date]=(qm[key+'||'+r.sale_date]||0)+qt;sd[r.store+'||'+r.sale_date]=(sd[r.store+'||'+r.sale_date]||0)+qt;
  }
  const keepFactor=1-S.commission_pct/100;
  const stores=lino.stores.filter(s=>s.is_active);
  const skus=lino.skus.filter(s=>s.is_active);
  const res={E,base,S,keepFactor,stores,skus,qm,sd,win:{}};
  const first=daily.length?daily[0].sale_date:E;res.first=first;
  const allN=Math.round((new Date(E)-new Date(first))/DAY)+1;
  for(const W of [7,30,'all']){
    const N=W==='all'?allN:W;
    const days=[];for(let i=N-1;i>=0;i--)days.push(addD(E,-i));
    const storeTot={};const cell={};const skuTot={};
    for(const st of stores){storeTot[st.store]=0}
    for(const sk of skus){
      const T={qty:0,profit:0,rev:0,pq:0,po:0,unpricedQty:0};
      for(const st of stores){
        const key=k(sk.sku,st.store);let qty=0,profit=0,rev=0,pq=0,po=0,unpricedQty=0;
        if(q[key])for(const d of days){
          const qt=q[key][d]||0;if(!qt)continue;const od=(o[key]&&o[key][d])||0;qty+=qt;
          const p=priceOn(key,d);
          if(p!=null&&p>0){rev+=qt*p;pq+=qt;po+=od;profit+=qt*(p*keepFactor-S.cost_per_yard)-od*S.per_order_fee}
          else unpricedQty+=qt;
        }
        storeTot[st.store]+=qty;
        cell[key]={qty,perDay:qty/N,profit,profitPerDay:pq?profit/N:null,unpricedQty};
        T.qty+=qty;T.profit+=profit;T.rev+=rev;T.pq+=pq;T.po+=po;T.unpricedQty+=unpricedQty;
      }
      T.perDay=T.qty/N;T.profitPerDay=T.profit/N;
      T.avgPrice=T.pq?T.rev/T.pq:null;T.margin=T.pq?T.profit/T.pq:null;T.feePerYard=T.pq?T.po*S.per_order_fee/T.pq:0;
      skuTot[sk.sku]=T;
    }
    for(const key in cell){const st=key.split('||')[1];cell[key].share=storeTot[st]?cell[key].qty/storeTot[st]:0}
    res.win[W]={N,days,storeTot,cell,skuTot};
  }
  // SKU 整体标记（所有店合计，含不在列表里的店）
  const d30=res.win[30].days;
  res.flag={};
  for(const sk of skus){
    const sd=skuDay[sk.sku]||{};
    const shipped30=d30.filter(d=>(sd[d]||0)>0).length;
    const firstSale=Object.keys(sd).filter(d=>sd[d]>0).sort()[0];
    let streak=0;for(let i=0;i<30;i++){if((sd[addD(E,-i)]||0)>0)break;streak++}
    let before=0;for(let i=streak;i<streak+14;i++){if((sd[addD(E,-i)]||0)>0)before++}
    let f=null;
    if(!firstSale)f={t:'zero',zh:'60 天无销量',en:'No sales in 60 days'};
    else if(firstSale>addD(E,-14))f={t:'new',zh:'新品（14 天内才开始出货）',en:'New (first sale within 14 days)'};
    else if(streak>=2&&before>=12)f={t:'out',zh:`可能断货：已连续 ${streak} 天没出货（之前 14 天有 ${before} 天出货）`,en:`Possible stockout: no shipments for ${streak} days`};
    else if(shipped30===0)f={t:'zero',zh:'30 天无销量，考虑清货',en:'No sales in 30 days, consider clearing'};
    else if(shipped30<15)f={t:'slow',zh:`断断续续：30 天里只有 ${shipped30} 天出货，考虑清货`,en:`Intermittent: shipped on ${shipped30}/30 days, consider clearing`};
    res.flag[sk.sku]={...(f||{}),shipped30,streak};
  }
  // 分级：明星 = 30 天日均利润前 20%（无标记）；滞销 = 断断续续/无销量；其余普通
  const ranked=skus.filter(s=>!['slow','zero'].includes(res.flag[s.sku].t)).sort((a,b)=>res.win[30].skuTot[b.sku].profitPerDay-res.win[30].skuTot[a.sku].profitPerDay);
  const starN=Math.max(1,Math.round(skus.length*0.2));
  res.tier={};
  for(const s of skus)res.tier[s.sku]=['slow','zero'].includes(res.flag[s.sku].t)?'dead':'normal';
  ranked.slice(0,starN).forEach(s=>{if(res.win[30].skuTot[s.sku].qty>0)res.tier[s.sku]='star'});
  // 真正的调价（基准日之后，且当天最终价与前一天不同）
  res.changes=[];
  for(const key in hist){
    const h=hist[key].filter(e=>e.effective_date>base);if(!h.length)continue;
    const dates=[...new Set(h.map(e=>e.effective_date))].sort();
    for(const d of dates){const before=priceOn(key,addD(d,-1)),after=priceOn(key,d);
      if((before??null)!==(after??null)){const [sku,store]=key.split('||');res.changes.push({sku,store,date:d,from:before??null,to:after??null})}}
  }
  res.changes.sort((a,b)=>a.date<b.date?1:-1);
  // 四象限：用有销量 SKU 的中位数分界
  for(const W of [7,30,'all']){const w=res.win[W];
    const sold=skus.filter(s=>w.skuTot[s.sku].pq>0);
    const med=a=>{a=[...a].sort((x,y)=>x-y);return a.length?a[Math.floor(a.length/2)]:0};
    w.mx=med(sold.map(s=>w.skuTot[s.sku].perDay));w.my=med(sold.map(s=>w.skuTot[s.sku].margin));
    w.quad={};for(const s of sold){const t=w.skuTot[s.sku];w.quad[s.sku]=t.perDay>=w.mx?(t.margin>=w.my?'A':'B'):(t.margin>=w.my?'C':'D')}
  }
  return res;
}

/* ---------- 页面 ---------- */
window.rLinoAnalysis=async function(box){
  box.innerHTML='<div class="page-loading"><span></span>正在计算 Calculating...</div>';
  try{
    await linoLoad();
    const raw=await loadAll();
    if(raw.empty){box.innerHTML=settingsHtml(raw.S)+'<div class="card" style="text-align:center;color:var(--text3)">还没有导入销量 · No sales imported yet</div>';return}
    LA.data=compute(raw);render(box);
  }catch(e){box.innerHTML=`<div class="card" style="color:var(--bad)">❌ ${esc(e.message||String(e))}</div>`}
};
function tierBadge(t){return t==='star'?'<span class="la-b star">⭐ 明星 Star</span>':t==='dead'?'<span class="la-b dead">滞销 Slow</span>':''}
function flagBadge(f){if(!f||!f.t)return '';const m={out:['⚠️','out'],slow:['🧹','slow'],zero:['🧹','slow'],new:['🆕','new']}[f.t];return `<span class="la-b ${m[1]}" title="${esc(f.zh+' · '+f.en)}">${m[0]} ${esc(f.zh.split('：')[0].split('（')[0])}</span>`}
function heat(share){const a=Math.min(1,share/0.12);return `background:rgba(14,165,233,${(a*0.55).toFixed(2)})`}

const QUAD={A:{zh:'主力款：量大利厚 → 优先保证订货，别断货',en:'Core: high volume, high margin → keep in stock',short:'🟢 主力',c:'#10b981'},
  B:{zh:'走量款：量大利薄 → 可以试着涨价',en:'Volume: high volume, thin margin → try a higher price',short:'🔵 可涨价',c:'#0ea5e9'},
  C:{zh:'潜力款：量小利厚 → 可以试着降价冲量',en:'Potential: low volume, high margin → try a lower price',short:'🟠 可降价冲量',c:'#f59e0b'},
  D:{zh:'弱势款：量小利薄 → 少订或清货',en:'Weak: low volume, thin margin → order less / clear',short:'⚪ 少订/清货',c:'#94a3b8'}};
function quadBadge(W,sku){const q=W.quad[sku];return q?`<span class="la-b" style="background:${QUAD[q].c}22;color:${QUAD[q].c}" title="${esc(QUAD[q].zh+' · '+QUAD[q].en)}">${QUAD[q].short}</span>`:''}
function skuCell(D,W,sk){const img=sk.image_thumb||sk.image_src;
  return `<div class="lino-skucell">${img?`<span class="lino-imgwrap" onclick="linoZoom('${esc(sk.sku)}')"><img src="${esc(img)}" loading="lazy" class="lino-img"></span>`:''}
      <div><a class="host-link" onclick="laDetail('${esc(sk.sku)}')">${esc(sk.sku)}</a><div>${tierBadge(D.tier[sk.sku])}${flagBadge(D.flag[sk.sku])}</div></div></div>`}

function render(box){
  const D=LA.data,W=D.win[LA.win];
  if(LA.qchart){try{LA.qchart.destroy()}catch(e){}LA.qchart=null}
  const nStar=D.skus.filter(s=>D.tier[s.sku]==='star').length,nFlag=D.skus.filter(s=>['out','slow','zero'].includes(D.flag[s.sku].t)).length;
  let h=`<div class="card la-head">
    <div><b>数据截至 Data up to ${D.E}</b> · ${winLabel(LA.win)}（${W.days[0]} ~ ${D.E}，${W.N} 天）
      <div class="hm-sub">利润 = 销售额 × ${(D.keepFactor*100).toFixed(0)}% − 每单 ₱${D.S.per_order_fee} − 成本 ₱${D.S.cost_per_yard}/码 · Profit = sales × ${(D.keepFactor*100).toFixed(0)}% − ₱${D.S.per_order_fee}/order − ₱${D.S.cost_per_yard}/yard<br>
      ${D.first<D.base?`${D.base} 之前的订单按 ${D.base} 当天的价格算 · Orders before ${D.base} use that day's price`:''}</div></div>
    <div class="la-ctrl">
      ${seg('win',[[7,'7 天 days'],[30,'30 天 days'],['all','全部 All']])}
      ${seg('view',[['quad','🎯 四象限 Quadrant'],['rank','🏆 利润排行 Profit ranking'],['matrix','🔢 店铺矩阵 Store matrix']])}
    </div></div>`;
  h+=insightsHtml(D);
  if(LA.view==='quad')h+=quadHtml(D,W);
  else if(LA.view==='rank')h+=rankHtml(D,W);
  else h+=matrixHtml(D,W,nStar,nFlag);
  h+=settingsHtml(D.S);
  box.innerHTML=h+'<div id="laDetail"></div>';
  if(LA.view==='quad')drawQuad(D,W);
  if(LA.detail)laDetail(LA.detail,true);
}

/* ---------- 🎯 四象限 ---------- */
function quadHtml(D,W){
  const cnt={A:0,B:0,C:0,D:0};for(const k in W.quad)cnt[W.quad[k]]++;
  return `<div class="card"><h3 style="margin-bottom:4px">🎯 每个 SKU 在哪个位置 · Where each SKU stands</h3>
    <div class="hm-sub">横轴 = 每天卖几码（所有店合计）· 竖轴 = 每卖 1 码赚多少 · 圆越大 = 每天赚得越多 · 虚线 = 每天赚同样多的线 · 点圆圈看详情<br>
    X = yards per day · Y = profit per yard · bigger bubble = more profit per day · dashed = same daily profit · click a bubble for details</div>
    <div style="height:560px;margin-top:10px"><canvas id="laQuad"></canvas></div>
    <div class="la-qgrid">${['C','A','D','B'].map(q=>`<div style="border-left:4px solid ${QUAD[q].c}"><b>${QUAD[q].short}（${cnt[q]}）</b><br>${QUAD[q].zh}<br><span class="hm-sub">${QUAD[q].en}</span></div>`).join('')}</div>
    <div class="hm-sub" style="margin-top:6px">分界线 = 中位数：每天 ${fmt1(W.mx)} 码、每码 ${peso1(W.my)} · Split lines = medians</div></div>`;
}
async function drawQuad(D,W){
  try{await loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/Chart.js/3.9.1/chart.min.js')}catch(e){return}
  const cv=document.getElementById('laQuad');if(!cv)return;
  const pts=D.skus.filter(s=>W.skuTot[s.sku].pq>0).map(s=>{const t=W.skuTot[s.sku];return {x:Math.max(t.perDay,0.05),y:t.margin,p:t.profitPerDay,sku:s.sku,t}});
  const maxP=Math.max(1,...pts.map(p=>p.p));
  pts.forEach(p=>p.r=Math.max(3,Math.sqrt(Math.max(p.p,0)/maxP)*26));
  const lab=new Set([...pts].sort((a,b)=>b.p-a.p).slice(0,12).map(p=>p.sku));
  [...pts].sort((a,b)=>b.x-a.x).slice(0,6).forEach(p=>lab.add(p.sku));
  const xmin=Math.max(0.05,Math.min(...pts.map(p=>p.x))*0.8),xmax=Math.max(...pts.map(p=>p.x))*1.3;
  const ymin=Math.min(0,...pts.map(p=>p.y))-2,ymax=Math.max(...pts.map(p=>p.y))+4;
  // 等利润线：每天赚 ₱P 的曲线 y = P / x
  const levels=[100,250,500,1000,2000,4000].filter(v=>v<maxP*1.6);
  const xs=[];for(let i=0;i<=60;i++)xs.push(xmin*Math.pow(xmax/xmin,i/60));
  const iso=levels.map(v=>({type:'line',label:'₱'+v+'/天',data:xs.map(x=>({x,y:v/x})).filter(p=>p.y<=ymax&&p.y>=0),borderColor:'#cbd5e1',borderDash:[5,5],borderWidth:1,pointRadius:0,fill:false,_iso:v}));
  const plugin={id:'laQ',afterDatasetsDraw(c){const {ctx,scales:{x,y},chartArea:a}=c;ctx.save();
    // 中位数分界线
    ctx.strokeStyle='#94a3b8';ctx.setLineDash([2,3]);ctx.beginPath();const mx=x.getPixelForValue(W.mx),my=y.getPixelForValue(W.my);
    ctx.moveTo(mx,a.top);ctx.lineTo(mx,a.bottom);ctx.moveTo(a.left,my);ctx.lineTo(a.right,my);ctx.stroke();ctx.setLineDash([]);
    ctx.font='bold 12px sans-serif';
    [['C',a.left+8,a.top+16,'left'],['A',a.right-8,a.top+16,'right'],['D',a.left+8,a.bottom-8,'left'],['B',a.right-8,a.bottom-8,'right']].forEach(([q,px,py,al])=>{ctx.fillStyle=QUAD[q].c;ctx.textAlign=al;ctx.fillText(QUAD[q].short,px,py)});
    // 等利润线标签
    ctx.font='11px sans-serif';ctx.fillStyle='#94a3b8';ctx.textAlign='right';
    c.data.datasets.forEach(ds=>{if(!ds._iso||!ds.data.length)return;const l=ds.data[ds.data.length-1];ctx.fillText(ds.label,x.getPixelForValue(l.x)-2,y.getPixelForValue(l.y)-4)});
    // SKU 名
    ctx.font='bold 11px sans-serif';ctx.fillStyle='#0f172a';ctx.textAlign='left';
    pts.forEach(p=>{if(lab.has(p.sku))ctx.fillText(p.sku.replace(/^Li-/,''),x.getPixelForValue(p.x)+p.r+2,y.getPixelForValue(p.y)+4)});
    ctx.restore()}};
  LA.qchart=new Chart(cv.getContext('2d'),{type:'bubble',data:{datasets:[
    {label:'SKU',data:pts,backgroundColor:pts.map(p=>(QUAD[W.quad[p.sku]]||QUAD.D).c+'99'),borderColor:pts.map(p=>(QUAD[W.quad[p.sku]]||QUAD.D).c),borderWidth:1},...iso]},
    options:{responsive:true,maintainAspectRatio:false,animation:false,
      onClick:(e,els)=>{const el=els.find(x=>x.datasetIndex===0);if(el)laDetail(pts[el.index].sku)},
      onHover:(e,els)=>{e.native.target.style.cursor=els.some(x=>x.datasetIndex===0)?'pointer':'default'},
      plugins:{legend:{display:false},tooltip:{filter:i=>i.datasetIndex===0,callbacks:{label:i=>{const p=pts[i.dataIndex],t=p.t;return [p.sku,`每天 ${fmt1(t.perDay)} 码 · 均价 ₱${t.avgPrice.toFixed(2)}`,`每码赚 ${peso1(t.margin)} · 每天赚 ${peso(t.profitPerDay)}`]}}}},
      scales:{x:{type:'logarithmic',min:xmin,max:xmax,title:{display:true,text:'每天卖几码 Yards per day（对数刻度 log scale）'},ticks:{callback:v=>[0.1,0.2,0.5,1,2,5,10,20,50,100,200,500].includes(+v)?v:''}},
        y:{min:ymin,max:ymax,title:{display:true,text:'每码赚多少 ₱ Profit per yard'}}}},plugins:[plugin]});
}

/* ---------- 🏆 利润排行 ---------- */
function rankHtml(D,W){
  let skus=D.skus.filter(s=>W.skuTot[s.sku].qty>0).sort((a,b)=>W.skuTot[b.sku].profitPerDay-W.skuTot[a.sku].profitPerDay);
  const tot=skus.reduce((a,s)=>a+Math.max(0,W.skuTot[s.sku].profitPerDay),0);
  const neg=skus.filter(s=>W.skuTot[s.sku].profitPerDay<0);
  let cum=0,n50=0,n80=0;skus.forEach((s,i)=>{cum+=Math.max(0,W.skuTot[s.sku].profitPerDay);if(!n50&&cum>=tot*.5)n50=i+1;if(!n80&&cum>=tot*.8)n80=i+1});
  const maxP=Math.max(1,...skus.map(s=>W.skuTot[s.sku].profitPerDay));
  let h=`<div class="card"><h3 style="margin-bottom:6px">🏆 谁贡献的利润最多 · Who makes the most profit</h3>
    <div class="la-kpis"><div><div class="v">${peso(tot)}</div><div class="l">所有 SKU 每天合计利润<br>Total profit per day</div></div>
      <div><div class="v">${n50} 个</div><div class="l">前 ${n50} 个 SKU 贡献一半利润<br>Top ${n50} SKUs = 50% of profit</div></div>
      <div><div class="v">${n80} 个</div><div class="l">前 ${n80} 个 SKU 贡献 80% 利润<br>Top ${n80} SKUs = 80% of profit</div></div>
      <div><div class="v" style="${neg.length?'color:var(--bad)':''}">${neg.length} 个</div><div class="l">卖一单亏一单的 SKU<br>SKUs losing money</div></div></div>
    <div class="hm-sub" style="margin:8px 0">订货时优先照顾前 ${n80} 个 · Prioritize the top ${n80} when ordering · 点 SKU 看详情和调价模拟 Click a SKU for details & price simulator</div>
    <div class="lino-wrap" style="max-height:calc(100vh - 200px)"><table class="host-tbl la-rank"><thead><tr><th>#</th><th>SKU</th><th class="num">码/天<br><small>Yards/day</small></th><th class="num">平均售价<br><small>Avg price</small></th><th class="num">每码赚<br><small>Profit/yard</small></th><th class="num">每天赚<br><small>Profit/day</small></th><th style="min-width:220px">占总利润<br><small>Share of profit</small></th><th class="num">累计<br><small>Cumulative</small></th><th>建议<br><small>Suggestion</small></th></tr></thead><tbody>`;
  cum=0;
  skus.forEach((sk,i)=>{const t=W.skuTot[sk.sku];cum+=Math.max(0,t.profitPerDay);const sh=tot?Math.max(0,t.profitPerDay)/tot:0;
    if(i===n80)h+=`<tr class="host-sep"><td colspan="9">↑ 以上贡献 80% 利润 · Above = 80% of profit</td></tr>`;
    h+=`<tr><td>${i+1}</td><td>${skuCell(D,W,sk)}</td><td class="num">${fmt1(t.perDay)}</td><td class="num">${t.avgPrice!=null?'₱'+t.avgPrice.toFixed(2):'—'}</td>
      <td class="num" style="${t.margin<0?'color:var(--bad);font-weight:700':''}">${t.margin!=null?peso1(t.margin):'—'}</td><td class="num"><b style="${t.profitPerDay<0?'color:var(--bad)':''}">${peso(t.profitPerDay)}</b></td>
      <td><div class="la-bar"><span style="width:${Math.max(0,t.profitPerDay)/maxP*100}%"></span></div><small>${pct(sh)}</small></td><td class="num">${pct(tot?cum/tot:0)}</td><td>${quadBadge(W,sk.sku)}</td></tr>`});
  return h+'</tbody></table></div></div>';
}

/* ---------- 🔢 店铺矩阵 ---------- */
function matrixHtml(D,W,nStar,nFlag){
  let skus=[...D.skus];
  if(LA.tier!=='all')skus=skus.filter(s=>LA.tier==='flag'?['out','slow','zero'].includes(D.flag[s.sku].t):D.tier[s.sku]===LA.tier);
  if(LA.sort==='yards')skus.sort((a,b)=>W.skuTot[b.sku].qty-W.skuTot[a.sku].qty);
  else if(LA.sort==='profit')skus.sort((a,b)=>W.skuTot[b.sku].profitPerDay-W.skuTot[a.sku].profitPerDay);
  else skus.sort(linoSkuCmp);
  let h=`<div class="la-ctrl" style="margin:4px 0 8px">
      ${seg('metric',[['yards','日均码数 Yards/day'],['share','占本店 % Share'],['profit','日均利润 Profit/day']])}
      ${seg('sort',[['yards','按销量 By sales'],['profit','按利润 By profit'],['sku','按 SKU']])}
      ${seg('tier',[['all','全部 All'],['star',`⭐ 明星 (${nStar})`],['flag',`⚠️🧹 需处理 Flagged (${nFlag})`]])}</div>
  <div class="hm-sub" style="margin:6px 2px">格子颜色 = 占本店销量比例（越深越高，抵消店铺流量差异）· 小字 = 当前价 · 点 SKU 看详情<br>Cell color = share of the store's sales · small text = current price · click a SKU for details</div>
  <div class="lino-wrap" style="max-height:calc(100vh - 220px)"><table class="lino-table la-table"><thead><tr><th class="lino-sticky">SKU</th><th>合计 Total<br><small>码/天 · ₱/天</small></th>`;
  for(const st of D.stores)h+=`<th>${esc(st.label)}<br><small>${fmt1(W.storeTot[st.store]/W.N)} 码/天</small></th>`;
  h+='</tr></thead><tbody>';
  for(const sk of skus){
    const T=W.skuTot[sk.sku];
    h+=`<tr><td class="lino-sticky">${skuCell(D,W,sk)}</td>
      <td class="la-tot"><b>${fmt1(T.perDay)}</b><br><small>${peso(T.profitPerDay)}</small></td>`;
    for(const st of D.stores){
      const key=sk.sku+'||'+st.store,c=W.cell[key],p=lino.prices[key];
      let main='';
      if(LA.metric==='yards')main=c.qty?fmt1(c.perDay):'';
      else if(LA.metric==='share')main=c.qty?pct(c.share):'';
      else main=c.profitPerDay!=null&&c.qty?peso(c.profitPerDay):'';
      h+=`<td style="${c.qty?heat(c.share):''}" title="${esc(sk.sku)} @ ${esc(st.label)} · ${fmt0(c.qty)} 码 yards · 占本店 ${pct(c.share)}${c.profitPerDay!=null?' · 日均利润 '+peso(c.profitPerDay):''}${c.unpricedQty?' · 其中 '+fmt0(c.unpricedQty)+' 码价格未知':''}">
        <div class="la-main">${main||'<span class="lino-empty">·</span>'}</div><div class="la-price">${p!=null?'₱'+linoFmt(p):'<span style="color:#cbd5e1">未上架</span>'}</div></td>`;
    }
    h+='</tr>';
  }
  return h+'</tbody></table></div>';
}
function seg(name,opts){return `<div class="lino-seg">${opts.map(([v,l])=>`<button class="${String(LA[name])===String(v)?'on':''}" onclick="laSet('${name}','${v}')">${l}</button>`).join('')}</div>`}
window.laSet=function(n,v){LA[n]=n==='win'&&v!=='all'?Number(v):v;render(document.getElementById('linoBody'))};

/* ---------- 自动发现 ---------- */
function insightsHtml(D){
  const W7=D.win[7],W30=D.win[30];const items=[];
  // 1) 可能断货 / 清货
  const out=D.skus.filter(s=>D.flag[s.sku].t==='out');
  const slow=D.skus.filter(s=>['slow','zero'].includes(D.flag[s.sku].t));
  if(out.length)items.push({c:'bad',t:`⚠️ 可能断货 Possible stockout（${out.length}）`,b:out.map(s=>`<b>${esc(s.sku)}</b> ${esc(D.flag[s.sku].zh.replace('可能断货：',''))}`).join('<br>')});
  if(slow.length)items.push({c:'warn',t:`🧹 断断续续 / 无销量，考虑清货 Consider clearing（${slow.length}）`,b:slow.sort((a,b)=>D.flag[a.sku].shipped30-D.flag[b.sku].shipped30).map(s=>`<b>${esc(s.sku)}</b> 30 天出货 ${D.flag[s.sku].shipped30} 天 · ${fmt0(W30.skuTot[s.sku].qty)} 码`).join('<br>')});
  // 2) 好卖但有店没上架
  const top=[...D.skus].filter(s=>D.flag[s.sku].t!=='out').sort((a,b)=>W30.skuTot[b.sku].qty-W30.skuTot[a.sku].qty).slice(0,15);
  const miss=[];
  for(const s of top){const no=D.stores.filter(st=>lino.prices[s.sku+'||'+st.store]==null);if(no.length&&no.length<D.stores.length)miss.push(`<b>${esc(s.sku)}</b>（日均 ${fmt1(W30.skuTot[s.sku].perDay)} 码）没上架：${no.map(x=>esc(x.label)).join('、')}`)}
  if(miss.length)items.push({c:'info',t:`🏪 卖得好但有的店没上架 Top sellers not listed in some stores（${miss.length}）`,b:miss.join('<br>')});
  // 3) 同一个 SKU：贵 ₱5 以上的店，占本店比例反而更高（看最近 7 天，价格是基准日后的）
  const pairs=[];
  for(const s of D.skus){
    const rows=D.stores.map(st=>({st,p:lino.prices[s.sku+'||'+st.store],c:W7.cell[s.sku+'||'+st.store]})).filter(x=>x.p!=null&&x.c.qty>=5);
    for(const a of rows)for(const b of rows){if(a.p>=b.p+5&&a.c.share>b.c.share)pairs.push({s,a,b,r:a.c.share/b.c.share})}
  }
  pairs.sort((x,y)=>y.r-x.r);
  if(pairs.length)items.push({c:'good',t:`💡 贵 ₱5 以上，占比反而更高（最近 7 天）Higher price, higher share（${pairs.length}）`,b:pairs.slice(0,12).map(x=>`<b>${esc(x.s.sku)}</b>：${esc(x.a.st.label)} ₱${linoFmt(x.a.p)} 占 ${pct(x.a.c.share)} &gt; ${esc(x.b.st.label)} ₱${linoFmt(x.b.p)} 占 ${pct(x.b.c.share)} → 便宜的店可以考虑涨价 · cheaper store may raise price`).join('<br>')+(pairs.length>12?`<br><span class="hm-sub">…还有 ${pairs.length-12} 条 more</span>`:'')});
  // 4) 有销量没价格
  let np=0;for(const s of D.skus)for(const st of D.stores){const key=s.sku+'||'+st.store;if(lino.prices[key]==null&&W7.cell[key].qty>0)np++}
  if(np)items.push({c:'bad',t:`🔴 最近 7 天有销量但没填价格 Selling but no price（${np} 格）`,b:'请秘书在价格表里补上，否则这些销量算不了利润 · Ask the secretary to fill these in the price table'});
  // 5) 调价记录
  items.push({c:'info',t:`📝 ${D.base} 之后的调价 Price changes after ${D.base}（${D.changes.length}）`,b:D.changes.length?D.changes.slice(0,15).map(c=>`${c.date} · <b>${esc(c.sku)}</b> @ ${esc((D.stores.find(s=>s.store===c.store)||{label:c.store}).label)}：${c.from==null?'未上架':'₱'+linoFmt(c.from)} → ${c.to==null?'下架':'₱'+linoFmt(c.to)}`).join('<br>')+(D.changes.length>15?`<br><span class="hm-sub">…还有 ${D.changes.length-15} 条</span>`:''):'还没有调价。调价后 7 天，就能在 SKU 详情里看到前后对比 · No changes yet; before/after comparison appears 7 days after a change'});
  return `<div class="la-ins">${items.map(i=>`<details class="la-in ${i.c}"${i.c==='bad'?' open':''}><summary>${i.t}</summary><div>${i.b}</div></details>`).join('')}</div>`;
}

/* ---------- 单个 SKU 详情 ---------- */
window.laDetail=async function(sku,noScroll){
  LA.detail=sku;const D=LA.data;const box=document.getElementById('laDetail');if(!box)return;
  LA.charts.forEach(c=>{try{c.destroy()}catch(e){}});LA.charts=[];
  const s=D.skus.find(x=>x.sku===sku);if(!s){box.innerHTML='';return}
  const W7=D.win[7],W30=D.win[30],WW=D.win[LA.win],TT=WW.skuTot[sku],img=s.image_thumb||s.image_src;
  const rows=D.stores.map(st=>{const key=sku+'||'+st.store;return {st,p:lino.prices[key],c7:W7.cell[key],c30:W30.cell[key]}}).sort((a,b)=>b.c30.qty-a.c30.qty);
  const ch=D.changes.filter(c=>c.sku===sku);
  let h=`<div class="card la-detail"><div style="display:flex;gap:14px;align-items:center;justify-content:space-between">
    <div style="display:flex;gap:12px;align-items:center">${img?`<img src="${esc(img)}" class="lino-img lino-img-big" onclick="linoZoom('${esc(sku)}')" style="cursor:zoom-in">`:''}
      <div><div style="font-size:1.2rem;font-weight:800">${esc(sku)} ${tierBadge(D.tier[sku])}${flagBadge(D.flag[sku])}</div>
      <div class="hm-sub">全部店合计 All stores（${winLabel(LA.win)}，${WW.N} 天）：${fmt0(TT.qty)} 码 · 日均 ${fmt1(TT.perDay)} 码 · 均价 ${TT.avgPrice!=null?'₱'+TT.avgPrice.toFixed(2):'—'} · 每码赚 ${TT.margin!=null?peso1(TT.margin):'—'} · 每天赚 ${peso(TT.profitPerDay)} · 30 天出货 ${D.flag[sku].shipped30} 天 ${quadBadge(WW,sku)}</div></div></div>
    <button class="btn btn-ghost btn-sm" style="width:auto" onclick="LA_close()">✕ 关闭 Close</button></div>
    <div class="host-chart" style="margin-top:12px"><canvas id="laChart"></canvas></div>
    <table class="host-tbl" style="margin-top:10px"><thead><tr><th>店铺 Store</th><th class="num">当前价 Price</th><th class="num">7 天 码/天</th><th class="num">30 天 码/天</th><th class="num">占本店 7天 Share</th><th class="num">占本店 30天</th><th class="num">每天赚 ${winLabel(LA.win)}<br><small>Profit/day</small></th></tr></thead><tbody>
    ${rows.map(r=>{const cw=WW.cell[sku+'||'+r.st.store];return `<tr><td><b>${esc(r.st.label)}</b></td><td class="num">${r.p!=null?'₱'+linoFmt(r.p):'<span class="hm-sub">未上架</span>'}</td><td class="num">${fmt1(r.c7.perDay)}</td><td class="num">${fmt1(r.c30.perDay)}</td><td class="num">${pct(r.c7.share)}</td><td class="num">${pct(r.c30.share)}</td><td class="num">${cw.profitPerDay!=null&&cw.qty?peso(cw.profitPerDay):'—'}</td></tr>`}).join('')}
    </tbody></table>`+simHtml(D,TT);
  if(ch.length){
    h+=`<div class="sec-title">📝 调价前后对比 Before / after price change（各 7 天 · 7 days each）</div><table class="host-tbl"><thead><tr><th>日期 Date</th><th>店铺 Store</th><th>调价 Change</th><th class="num">之前 码/天</th><th class="num">之后 码/天</th><th class="num">之前 占本店</th><th class="num">之后 占本店</th></tr></thead><tbody>`;
    for(const c of ch){const r=beforeAfter(D,c);const st=D.stores.find(x=>x.store===c.store);
      h+=`<tr><td>${c.date}</td><td>${esc(st?st.label:c.store)}</td><td>${c.from==null?'未上架':'₱'+linoFmt(c.from)} → ${c.to==null?'下架':'₱'+linoFmt(c.to)}</td>
        <td class="num">${fmt1(r.bq/r.bn)}</td><td class="num">${r.an?fmt1(r.aq/r.an):'—'}${r.an<7?` <span class="hm-sub">(${r.an}天)</span>`:''}</td><td class="num">${pct(r.bs)}</td><td class="num">${r.an?pct(r.as):'—'}</td></tr>`}
    h+='</tbody></table><div class="hm-sub">调价后不足 7 天的，括号里是已有天数，结论仅供参考 · Fewer than 7 days after = preliminary</div>';
  }
  box.innerHTML=h+'</div>';
  if(!noScroll)box.scrollIntoView({behavior:'smooth',block:'start'});
  try{await loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/Chart.js/3.9.1/chart.min.js')}catch(e){return}
  const cv=document.getElementById('laChart');if(!cv)return;
  const days=(WW.N>30?WW:W30).days,colors=['#0ea5e9','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899'];
  const top=rows.filter(r=>r.c30.qty>0).slice(0,6);
  const ds=top.map((r,i)=>({label:r.st.label,data:days.map(d=>dayQty(D,sku,r.st.store,d)),borderColor:colors[i],backgroundColor:'transparent',tension:.25,pointRadius:2}));
  LA.charts.push(new Chart(cv.getContext('2d'),{type:'line',data:{labels:days.map(d=>d.slice(5)),datasets:ds},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{usePointStyle:true,boxWidth:8}},title:{display:true,text:`每天销量（码）· Daily yards（${days[0]} ~ ${D.E}）`}},scales:{x:{grid:{display:false}},y:{beginAtZero:true}}}}));
};
window.LA_close=function(){LA.detail=null;const b=document.getElementById('laDetail');if(b)b.innerHTML=''};
function dayQty(D,sku,store,d){return D.qm[sku+'||'+store+'||'+d]||0}
function beforeAfter(D,c){
  const key=c.sku+'||'+c.store;let bq=0,aq=0,bn=7,an=0,bst=0,ast=0;
  for(let i=1;i<=7;i++){const d=addD(c.date,-i);bq+=dayQty(D,c.sku,c.store,d);bst+=D.sd[c.store+'||'+d]||0}
  for(let i=0;i<7;i++){const d=addD(c.date,i);if(d>D.E)break;an++;aq+=dayQty(D,c.sku,c.store,d);ast+=D.sd[c.store+'||'+d]||0}
  return {bq,aq,bn,an,bs:bst?bq/bst:0,as:ast?aq/ast:0};
}

/* ---------- 🧮 调价模拟 ---------- */
// 假设所有店统一改成某个价：要卖多少码，才能和现在每天赚得一样多
function simRow(D,T,price,isNow){
  const m=price*D.keepFactor-D.S.cost_per_yard-T.feePerYard;
  const nowY=T.pq/LA.data.win[LA.win].N,need=isNow?nowY:(m>0?T.profitPerDay/m:null),ratio=need!=null&&nowY?need/nowY-1:null;
  let say;
  if(m<=0)say='<span style="color:var(--bad);font-weight:700">每卖 1 码都亏钱 · Loses money on every yard</span>';
  else if(isNow)say='现在 Now';
  else if(ratio>0)say=`销量要 <b style="color:var(--bad)">多卖 ${(ratio*100).toFixed(0)}%</b> 以上才划算 · Need +${(ratio*100).toFixed(0)}% volume`;
  else say=`销量 <b style="color:#059669">少卖 ${(-ratio*100).toFixed(0)}%</b> 以内都不亏 · Can lose up to ${(-ratio*100).toFixed(0)}% volume`;
  return `<tr class="${isNow?'now':''}"><td><b>₱${price.toFixed(2)}</b></td><td class="num">${peso1(m)}</td><td class="num">${need!=null?fmt1(need):'—'}</td><td>${say}</td></tr>`;
}
function simHtml(D,T){
  if(!T.pq||T.profitPerDay<=0||!T.perDay)return `<div class="sec-title">🧮 调价模拟 Price simulator</div><div class="hm-sub">这个 SKU 目前没有利润数据，算不了 · Not enough data</div>`;
  const now=Math.round(T.avgPrice*100)/100;
  const prices=[...new Set([69.9,74.9,79.9,85.9,89.9,now])].sort((a,b)=>a-b);
  return `<div class="sec-title">🧮 调价模拟：所有店统一改成这个价，要卖多少码才能赚得和现在一样多 · Price simulator</div>
    <div class="hm-sub">现在 Now：平均售价 ₱${now.toFixed(2)} · 每天 ${fmt1(T.pq/LA.data.win[LA.win].N)} 码 · 每天赚 ${peso(T.profitPerDay)}（每码已摊每单费 ₱${T.feePerYard.toFixed(2)}）</div>
    <table class="host-tbl la-sim" style="margin-top:6px"><thead><tr><th>售价 Price</th><th class="num">每码赚 Profit/yard</th><th class="num">保本要卖 码/天<br><small>Yards/day to match</small></th><th>结论 Verdict</th></tr></thead>
    <tbody id="laSimBody">${prices.map(p=>simRow(D,T,p,p===now)).join('')}</tbody></table>
    <div style="display:flex;gap:8px;align-items:center;margin-top:8px;flex-wrap:wrap"><span>自己输入一个价 Try a price：₱</span><input type="number" step="0.1" id="laSimIn" style="width:100px;padding:6px 8px;border:1.5px solid var(--border);border-radius:8px" oninput="laSim()" placeholder="例如 72.9">
    <table class="host-tbl la-sim" style="width:auto;flex:1"><tbody id="laSimOne"></tbody></table></div>
    <div class="hm-sub" style="margin-top:4px">这只是算账，不是预测：真实销量要改价后看「调价前后对比」· This is math, not a forecast — check the before/after table after changing</div>`;
}
window.laSim=function(){const v=parseFloat(document.getElementById('laSimIn').value);const D=LA.data,T=D.win[LA.win].skuTot[LA.detail];
  document.getElementById('laSimOne').innerHTML=v>0?simRow(D,T,v,false):''};

/* ---------- 参数设置 ---------- */
function settingsHtml(S){
  const f=(id,l,v,step)=>`<div class="fg"><label>${l}</label><input type="${id==='baseline_date'?'date':'number'}" id="la_${id}" value="${esc(String(v??''))}" ${step?`step="${step}"`:''}></div>`;
  return `<details class="card la-set"><summary>⚙️ 参数设置 Settings（利润 = 销售额 × ${100-S.commission_pct}% − 每单 ₱${S.per_order_fee} − 成本 ₱${S.cost_per_yard}/码 · 初始价格日 ${esc(String(S.baseline_date).slice(0,10))}）</summary>
    <div class="form-row" style="margin-top:10px">${f('commission_pct','平台扣点 % Platform cut（销售额×80% 就填 20）',S.commission_pct,'0.1')}${f('per_order_fee','每单固定费 ₱ Per-order fee',S.per_order_fee,'0.01')}${f('cost_per_yard','每码成本 ₱ Cost/yard',S.cost_per_yard,'0.01')}</div>
    <div class="form-row">${f('baseline_date','初始价格日 Initial price date（这天之前的订单按这天的价格算 · orders before use this day\'s price）',String(S.baseline_date).slice(0,10))}</div>
    <button class="btn btn-pri btn-sm" style="width:auto" onclick="laSaveSettings()">💾 保存 Save</button></details>`;
}
window.laSaveSettings=async function(){
  const v=id=>document.getElementById('la_'+id).value;
  const d={id:1,baseline_date:v('baseline_date'),cost_per_yard:+v('cost_per_yard'),commission_pct:+v('commission_pct'),per_order_fee:+v('per_order_fee'),updated_by:U.id,updated_at:new Date().toISOString()};
  if(!d.baseline_date||[d.cost_per_yard,d.commission_pct,d.per_order_fee].some(x=>isNaN(x)||x<0)||d.commission_pct>=100){toast('参数不对 Invalid settings');return}
  const r=await sb.upsertOn('tks_lino_settings','id',d).catch(()=>null);
  if(!Array.isArray(r)){toast('❌ 保存失败 Save failed');return}
  toast('✅ 已保存，重新计算 Saved, recalculating');rLinoAnalysis(document.getElementById('linoBody'));
};

})();
