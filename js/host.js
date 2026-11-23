/* ============================================================
   主播周表现 Host Weekly Performance
   独立文件：打开这个页面时才加载（不影响其他页面速度）
   数据：tks_host_rooms（直播间）+ tks_host_weeks（每周汇总）
   排名规则：直播时长满 40 小时的在前，按 GMV/小时 从高到低；
            不满 40 小时的排在后面，同样按 GMV/小时 从高到低。
            小时数按显示的一位小数判断（显示 40.0 即算满）。
   ============================================================ */
(function(){
const HOST_MIN_HOURS=40;
let hostTab='overview',hostWeek='',hostDetailRoom='',hostRooms=[],hostWeeks=[],hostEditRoom=null,hostCharts=[];
const hostCanEdit=()=>U.role==='admin'||U.role==='S'||U.role==='secretary';
const fmtP=n=>(Number(n)||0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,',');
const hrs1=sec=>Math.round((Number(sec)||0)/360)/10; // 一位小数的小时数

function calc(w){
  const net=Math.max(0,(+w.gmv||0)-(+w.cancel||0));
  const hrs=hrs1(w.dur_sec);
  const gmvH=hrs>0?net/((+w.dur_sec||0)/3600):0;
  const cvr=w.views>0?(w.orders/w.views*100):0;
  const aov=w.orders>0?net/w.orders:0;
  const cancelRate=w.gmv>0?((+w.cancel||0)/w.gmv*100):0;
  return {net,hrs,gmvH,cvr,aov,cancelRate,full:hrs>=HOST_MIN_HOURS};
}
function rankRows(rows){
  return rows.sort((a,b)=>(a.c.full===b.c.full?0:a.c.full?-1:1)||(b.c.gmvH-a.c.gmvH));
}
async function load(){
  const [r,w]=await Promise.all([
    sb.get('tks_host_rooms','order=created_at.asc').catch(()=>null),
    sb.get('tks_host_weeks','order=week_key.desc').catch(()=>null)
  ]);
  if(!Array.isArray(r)||!Array.isArray(w))return false;
  hostRooms=r;hostWeeks=w;return true;
}
const roomName=r=>r?(r.host_name||r.account||'-'):'-';

window.rHost=async function(el){
  if(!(await load())){el.innerHTML='<div class="main-header"><h1>🎥 主播周表现 Host Weekly</h1></div><div class="card" style="color:var(--bad)">⚠️ 数据表还没建好，请管理员先在 Supabase 运行建表 SQL。<br>Tables not found — admin needs to run the setup SQL.</div>';return}
  const tabs=[['overview','🏆 总览排名 Ranking'],['detail','👤 主播详情 Host detail']];
  if(hostCanEdit())tabs.push(['import','📥 导入数据 Import'],['rooms','🎙️ 直播间 Rooms']);
  if(!tabs.some(t=>t[0]===hostTab))hostTab='overview';
  el.innerHTML=`<div class="main-header"><h1>🎥 主播周表现 Host Weekly Performance</h1><p>每周导入 TikTok 直播数据，自动排名 · Import TikTok LIVE data weekly, ranked automatically</p></div>
    <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">${tabs.map(([v,l])=>`<button class="btn ${hostTab===v?'btn-pri':'btn-ghost'} btn-sm" style="width:auto" onclick="hostGo('${v}')">${l}</button>`).join('')}</div>
    <div id="hostBody"></div>`;
  ({overview:renderOverview,detail:renderDetail,import:renderImport,rooms:renderRooms})[hostTab]();
};
window.hostGo=function(t){hostTab=t;rHost(document.getElementById('mainBody'))};

/* ---------- 总览排名 ---------- */
function weekList(){return [...new Set(hostWeeks.map(w=>w.week_key))].sort().reverse()}
function renderOverview(){
  const box=document.getElementById('hostBody');const weeks=weekList();
  if(!weeks.length){box.innerHTML='<div class="card" style="text-align:center;color:var(--text3)">暂无数据，请先导入 · No data yet, please import first</div>';return}
  if(!weeks.includes(hostWeek))hostWeek=weeks[0];
  const rows=rankRows(hostWeeks.filter(w=>w.week_key===hostWeek).map(w=>({w,room:hostRooms.find(r=>r.id===w.room_id),c:calc(w)})).filter(x=>x.room));
  let h=`<div class="card" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
    <label style="font-size:.85rem;font-weight:600">周 Week</label>
    <select onchange="hostWeek=this.value;hostGo('overview')" style="padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;font-family:inherit">${weeks.map(w=>`<option value="${w}"${w===hostWeek?' selected':''}>${w}${w===weeks[0]?'（最新 latest）':''}</option>`).join('')}</select>
    <button class="btn btn-pri btn-sm" style="width:auto;margin-left:auto" onclick="hostPrint()">🖨️ 打印 Print</button></div>
  <div id="hostPrint" class="card host-print">
    <div class="host-print-title">🎥 主播周表现 Host Weekly Performance <span>${esc(hostWeek)}</span></div>
    <div class="host-rule">排名：直播满 ${HOST_MIN_HOURS} 小时的按 GMV/小时排名；不满 ${HOST_MIN_HOURS} 小时的排在后面 · Ranking: hosts with ≥${HOST_MIN_HOURS}h ranked by GMV/hour first; under ${HOST_MIN_HOURS}h listed after</div>
    <table class="host-tbl"><thead><tr><th>#</th><th>主播<br><small>HOST</small></th><th>房间号<br><small>ROOM#</small></th><th>店铺账号<br><small>ACCOUNT</small></th>
      <th class="num">净GMV<br><small>NET GMV</small></th><th class="num">时长(H)<br><small>HOURS</small></th><th class="num">GMV/H</th><th class="num">新粉<br><small>FOLLOWERS</small></th>
      <th class="num">转化率<br><small>CVR</small></th><th class="num">客单价<br><small>AOV</small></th><th class="num">退单₱<br><small>CANCEL</small></th><th class="num">退单率<br><small>RATE</small></th></tr></thead><tbody>`;
  let sepDone=false;
  rows.forEach((x,i)=>{
    if(!x.c.full&&!sepDone){sepDone=true;h+=`<tr class="host-sep"><td colspan="12">⏱️ 以下直播不满 ${HOST_MIN_HOURS} 小时 · Below: under ${HOST_MIN_HOURS} hours</td></tr>`}
    h+=`<tr${x.c.full?'':' class="host-under"'}><td>${i+1}</td>
      <td><a class="host-link" onclick="hostDetailRoom='${x.room.id}';hostGo('detail')">${esc(roomName(x.room))}</a></td>
      <td>${esc(x.room.room_num||'')}</td><td>${esc(x.room.account||'')}</td>
      <td class="num">₱${fmtP(x.c.net)}</td><td class="num${x.c.full?'':' host-bad'}">${x.c.hrs.toFixed(1)}</td>
      <td class="num"><b>₱${fmtP(x.c.gmvH)}</b></td><td class="num">${x.w.followers}</td>
      <td class="num">${x.c.cvr.toFixed(2)}%</td><td class="num">₱${fmtP(x.c.aov)}</td>
      <td class="num">₱${fmtP(x.w.cancel)}</td><td class="num${x.c.cancelRate>10?' host-bad':''}">${x.c.cancelRate.toFixed(1)}%</td></tr>`;
  });
  h+='</tbody></table></div>';
  const missing=hostRooms.filter(r=>r.is_active&&!rows.some(x=>x.room.id===r.id));
  if(missing.length&&hostCanEdit())h+=`<div class="card" style="font-size:.85rem;color:#b45309">⚠️ 这周还没导入 Not imported this week: ${missing.map(r=>esc(roomName(r))).join('、')}</div>`;
  box.innerHTML=h;
}
window.hostPrint=function(){
  document.body.classList.add('printing-host');
  setTimeout(()=>{window.print();setTimeout(()=>document.body.classList.remove('printing-host'),300)},50);
};

/* ---------- 主播详情 ---------- */
function destroyCharts(){hostCharts.forEach(c=>{try{c.destroy()}catch(e){}});hostCharts=[]}
function renderDetail(){
  destroyCharts();
  const box=document.getElementById('hostBody');
  const opts=hostRooms.filter(r=>r.is_active||hostWeeks.some(w=>w.room_id===r.id));
  if(!opts.length){box.innerHTML='<div class="card" style="text-align:center;color:var(--text3)">还没有直播间 · No rooms yet</div>';return}
  if(!opts.some(r=>r.id===hostDetailRoom))hostDetailRoom=opts[0].id;
  const room=hostRooms.find(r=>r.id===hostDetailRoom);
  const hist=hostWeeks.filter(w=>w.room_id===hostDetailRoom).sort((a,b)=>a.week_key<b.week_key?-1:1);
  let h=`<div class="card"><select onchange="hostDetailRoom=this.value;hostGo('detail')" style="padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;font-family:inherit;min-width:260px">${opts.map(r=>`<option value="${r.id}"${r.id===hostDetailRoom?' selected':''}>${esc(roomName(r))} ${r.room_num?'('+esc(r.room_num)+')':''}</option>`).join('')}</select></div>`;
  if(!hist.length){box.innerHTML=h+'<div class="card" style="text-align:center;color:var(--text3)">暂无数据 · No data yet</div>';return}
  const cur=hist[hist.length-1],prev=hist.length>1?hist[hist.length-2]:null,c=calc(cur);
  const kpi=(v,l,bad)=>`<div class="host-kpi"><div class="v${bad?' host-bad':''}">${v}</div><div class="l">${l}</div></div>`;
  h+=`<div class="card"><h3>${esc(roomName(room))} <small style="color:var(--text3);font-weight:400">${esc(room.account||'')} ${esc(room.room_num||'')}</small></h3>
    <div class="hm-sub" style="margin-bottom:10px">${esc(cur.week_key)} · ${cur.sessions} 场直播 sessions</div>
    <div class="host-kpis">${kpi('₱'+fmtP(c.net),'净GMV Net GMV')}${kpi('₱'+fmtP(c.gmvH),'GMV/小时 GMV/Hour')}${kpi(cur.followers,'新粉 Followers')}${kpi(c.hrs.toFixed(1)+'h','时长 Hours',!c.full)}
      ${kpi(c.cvr.toFixed(2)+'%','转化率 CVR')}${kpi('₱'+fmtP(c.aov),'客单价 AOV')}${kpi('₱'+fmtP(cur.cancel),'退单 Cancel')}${kpi(c.cancelRate.toFixed(1)+'%','退单率 Cancel rate',c.cancelRate>10)}</div></div>`;
  if(hist.length>1)h+=`<div class="card"><h3>净GMV 与 GMV/小时趋势 · Net GMV & GMV/Hour</h3><div class="host-chart"><canvas id="hostC1"></canvas></div></div>
    <div class="card"><h3>新粉趋势 · Followers</h3><div class="host-chart"><canvas id="hostC2"></canvas></div></div>`;
  h+=`<div class="card"><h3>📝 分析评价 · Insights</h3><div style="line-height:1.9;font-size:.88rem">${insight(cur,prev)}</div></div>
    <div class="card"><h3>历史数据 · History</h3><table class="host-tbl"><thead><tr><th>周 Week</th><th class="num">净GMV</th><th class="num">GMV/H</th><th class="num">新粉</th><th class="num">时长(H)</th><th class="num">退单₱</th>${hostCanEdit()?'<th></th>':''}</tr></thead><tbody>
    ${hist.slice().reverse().map(w=>{const x=calc(w);return `<tr><td>${esc(w.week_key)}</td><td class="num">₱${fmtP(x.net)}</td><td class="num">₱${fmtP(x.gmvH)}</td><td class="num">${w.followers}</td><td class="num${x.full?'':' host-bad'}">${x.hrs.toFixed(1)}</td><td class="num">₱${fmtP(w.cancel)}</td>${hostCanEdit()?`<td><button class="btn btn-ghost btn-sm" style="width:auto" onclick="hostDelWeek('${w.id}')">🗑️</button></td>`:''}</tr>`}).join('')}
    </tbody></table></div>`;
  box.innerHTML=h;
  if(hist.length>1)drawCharts(hist);
}
async function drawCharts(hist){
  try{await loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/Chart.js/3.9.1/chart.min.js')}catch(e){return}
  const labels=hist.map(w=>{const p=w.week_key.split('~');return p.length===2?p[0].slice(5):w.week_key});
  const mk=(id,sets)=>{const cv=document.getElementById(id);if(!cv)return;
    hostCharts.push(new Chart(cv.getContext('2d'),{type:'line',data:{labels,datasets:sets.map(s=>({label:s.l,data:hist.map(s.f),borderColor:s.c,backgroundColor:'transparent',tension:.3,pointRadius:4}))},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{usePointStyle:true,boxWidth:8}}},scales:{x:{grid:{display:false}},y:{beginAtZero:false}}}}))};
  mk('hostC1',[{l:'净GMV Net GMV (₱)',c:'#0071e3',f:w=>calc(w).net},{l:'GMV/小时 GMV/Hour (₱)',c:'#34c759',f:w=>calc(w).gmvH}]);
  mk('hostC2',[{l:'新粉 Followers',c:'#ff9500',f:w=>w.followers}]);
}
function insight(cur,prev){
  const c=calc(cur);const L=[];
  L.push(`本周净GMV ₱${fmtP(c.net)}，GMV/小时 ₱${fmtP(c.gmvH)}，共 ${cur.sessions} 场、${c.hrs.toFixed(1)} 小时。<br><span class="hm-sub">Net GMV ₱${fmtP(c.net)}, GMV/hour ₱${fmtP(c.gmvH)}, ${cur.sessions} sessions, ${c.hrs.toFixed(1)}h.</span>`);
  if(!c.full)L.push(`⏱️ 直播时长不满 ${HOST_MIN_HOURS} 小时。<span class="hm-sub">Under ${HOST_MIN_HOURS} hours this week.</span>`);
  if(!prev){L.push('暂无上周数据，下周导入后可以看到对比。<span class="hm-sub">No previous week yet.</span>');return L.join('<br>')}
  const p=calc(prev);
  const chg=(a,b)=>b?((a-b)/b*100):0;
  const g=chg(c.gmvH,p.gmvH),f=chg(cur.followers,prev.followers);
  if(g>15)L.push(`📈 GMV/小时较上周提升 ${g.toFixed(1)}%。<span class="hm-sub">GMV/hour up ${g.toFixed(1)}%.</span>`);
  else if(g<-15)L.push(`📉 GMV/小时较上周下降 ${Math.abs(g).toFixed(1)}%，需关注直播内容与时段。<span class="hm-sub">GMV/hour down ${Math.abs(g).toFixed(1)}%, review content & schedule.</span>`);
  else L.push(`➡️ GMV/小时与上周基本持平（${g>=0?'+':''}${g.toFixed(1)}%）。<span class="hm-sub">GMV/hour stable.</span>`);
  if(f>20)L.push(`👥 新粉增长 ${f.toFixed(1)}%。<span class="hm-sub">Followers up ${f.toFixed(1)}%.</span>`);
  else if(f<-20)L.push(`🔻 新粉减少 ${Math.abs(f).toFixed(1)}%，建议加强关注引导与互动。<span class="hm-sub">Followers down ${Math.abs(f).toFixed(1)}%, improve CTA.</span>`);
  else L.push(`👤 新粉变化不大（${f>=0?'+':''}${f.toFixed(1)}%）。<span class="hm-sub">Followers stable.</span>`);
  L.push(`🛒 转化率 ${c.cvr.toFixed(2)}%。<span class="hm-sub">CVR ${c.cvr.toFixed(2)}%.</span>`);
  if(c.cancelRate>10)L.push(`⚠️ 退单率 ${c.cancelRate.toFixed(1)}% 偏高，请检查产品描述或物流。<span class="hm-sub">Cancel rate high, check product description/logistics.</span>`);
  else if(c.cancelRate>5)L.push(`📋 退单率 ${c.cancelRate.toFixed(1)}%，持续关注。<span class="hm-sub">Cancel rate OK, keep watching.</span>`);
  else L.push(`✅ 退单率 ${c.cancelRate.toFixed(1)}%，正常。<span class="hm-sub">Cancel rate healthy.</span>`);
  return L.join('<br>');
}
window.hostDelWeek=async function(id){
  if(!confirm('删除这一周的数据？\nDelete this week\'s data?'))return;
  const r=await sb.del('tks_host_weeks',{id}).catch(()=>null);
  if(!r||!r.ok){toast('❌ 删除失败 Delete failed');return}
  toast('🗑️ 已删除 Deleted');rHost(document.getElementById('mainBody'));
};

/* ---------- 导入 ---------- */
function renderImport(){
  const box=document.getElementById('hostBody');
  const rooms=hostRooms.filter(r=>r.is_active);
  box.innerHTML=`<div class="card">
    <div class="sec-title" style="margin-top:0">📥 导入一个直播间的一周数据 · Import one room's weekly data</div>
    ${rooms.length?'':'<div style="color:var(--bad);margin-bottom:8px">请先在"直播间"里添加直播间 · Add rooms first</div>'}
    <div class="fg"><label>直播间 Room *</label><select id="hiRoom" style="padding:9px 10px;border:1.5px solid var(--border);border-radius:8px;font-family:inherit;min-width:280px"><option value="">-- 选择直播间 Select room --</option>${rooms.map(r=>`<option value="${r.id}">${esc(roomName(r))} ${r.room_num?'('+esc(r.room_num)+')':''}</option>`).join('')}</select></div>
    <div class="fg"><label>① 直播数据 Excel（TikTok LIVE 导出）* · LIVE data Excel</label><input type="file" id="hiLive" accept=".xlsx,.xls"></div>
    <div class="fg"><label>② 取消订单 CSV（可选）· Cancelled orders CSV (optional)</label><input type="file" id="hiCancel" accept=".csv"></div>
    <button class="btn btn-pri" style="width:auto" onclick="hostImport()">导入 Import</button>
    <div id="hiMsg" style="margin-top:10px;font-size:.88rem"></div></div>
    <div class="card hm-sub">周期以 Excel 第一行的日期范围为准；同一直播间同一周重复导入会提示覆盖。<br>The week comes from the date range in the Excel's first row; re-importing the same week asks to overwrite.</div>`;
}
function parsePeso(v){if(v==null)return 0;if(typeof v==='number')return v;const s=String(v).replace(/[₱,\s\t]/g,'');const k=s.match(/^([\d.]+)[Kk]$/);if(k)return parseFloat(k[1])*1000;const n=parseFloat(s);return isNaN(n)?0:n}
function parseIntK(v){if(v==null)return 0;if(typeof v==='number')return Math.round(v);const s=String(v).trim().replace(/,/g,'');const k=s.match(/^([\d.]+)[Kk]$/);if(k)return Math.round(parseFloat(k[1])*1000);const n=parseInt(s);return isNaN(n)?0:n}
function parseLiveExcel(buf){
  const CN2EN={'直播间信息':'Livestream','直播开始时间':'Start time','直播时长':'Duration','总成交额':'Gross revenue','直接 GMV':'Direct GMV','成交件数':'Items sold','客户数量':'Customers','平均价格':'Avg. price','支付订单次数':'Orders paid for','GMV/每千次曝光':'GMV/1K shows','GMV/每千次观看':'GMV/1K views','直播间观看次数':'Views','累计在线人数':'Viewers','最高在线观看人数':'Peak viewers','新增粉丝数':'New followers','平均观看时长':'Avg. view duration','点赞数':'Likes','评论数':'Comments','分享次数':'Shares','商品曝光次数':'Product impressions','商品点击次数':'Product clicks','看播-点击转化率':'CTR','点击成交转化率（SKU 订单）':'CTOR (SKU orders)'};
  const EN_ALIAS={'Attributed GMV':'Direct GMV','Attributed items sold':'Items sold','Attributed orders':'Orders paid for','Attributed SKU orders':'SKU orders','AOV':'Avg. price','Avg. viewing duration':'Avg. view duration','LIVE impressions':'Impressions','GMV Per Hour':'GMV/Hour','Show GPM':'GMV/1K shows','Watch GPM':'GMV/1K views','Room Title':'Livestream'};
  const MARK=['Livestream','直播间信息','Room ID'];
  const wb=XLSX.read(buf,{type:'array'});const ws=wb.Sheets[wb.SheetNames[0]];
  const data=XLSX.utils.sheet_to_json(ws,{header:1,defval:'',blankrows:false});
  const dateRange=data[0]&&data[0][0]?String(data[0][0]).trim():'';
  let hIdx=-1;for(let i=0;i<Math.min(data.length,10);i++){if(MARK.includes(String(data[i]&&data[i][0]||'').trim())){hIdx=i;break}}
  if(hIdx<0)throw new Error('未找到表头行（Livestream / 直播间信息）Header row not found');
  const headers=data[hIdx].map(h=>{h=String(h).trim();const m=CN2EN[h]||h;return EN_ALIAS[m]||m});
  const rows=[];for(let i=hIdx+1;i<data.length;i++){const r=data[i];if(!r||r.every(c=>c===''||c==null))continue;const o={};headers.forEach((h,j)=>o[h]=r[j]!==undefined?r[j]:'');rows.push(o)}
  return {dateRange,rows};
}
function aggregate(rows){
  const a={gmv:0,gross:0,dur_sec:0,orders:0,followers:0,views:0,items:0,custs:0,prod_imps:0,prod_clks:0,likes:0,comments:0,shares:0,sessions:rows.length};
  rows.forEach(r=>{
    a.gmv+=parsePeso(r['Direct GMV']);a.gross+=parsePeso(r['Gross revenue']||r['Direct GMV']);
    if(r['Duration']){const dv=r['Duration'];
      if(typeof dv==='number')a.dur_sec+=dv;
      else{const ds=String(dv).trim();let m;
        if((m=ds.match(/(\d+)h\s*(\d+)m/)))a.dur_sec+=parseInt(m[1])*3600+parseInt(m[2])*60;
        else if((m=ds.match(/^(\d+)h$/)))a.dur_sec+=parseInt(m[1])*3600;
        else if((m=ds.match(/^(\d+)m$/)))a.dur_sec+=parseInt(m[1])*60;
        else a.dur_sec+=parseFloat(ds)||0;}
    }else if(r['Start Time']&&r['End Time']){const d=(new Date(r['End Time'])-new Date(r['Start Time']))/1000;if(d>0)a.dur_sec+=d}
    a.orders+=parseIntK(r['Orders paid for']);a.followers+=parseIntK(r['New followers']);a.views+=parseIntK(r['Views']);a.items+=parseIntK(r['Items sold']);a.custs+=parseIntK(r['Customers']);
    a.prod_imps+=parseIntK(r['Product impressions']);a.prod_clks+=parseIntK(r['Product clicks']);a.likes+=parseIntK(r['Likes']);a.comments+=parseIntK(r['Comments']);a.shares+=parseIntK(r['Shares']);
  });
  return a;
}
function parseCSVLine(line){const cols=[];let cur='',q=false;for(const ch of line){if(ch==='"')q=!q;else if(ch===','&&!q){cols.push(cur.replace(/\t/g,'').trim());cur=''}else cur+=ch}cols.push(cur.replace(/\t/g,'').trim());return cols}
function parseCancelCSV(text){
  if(text.charCodeAt(0)===0xFEFF)text=text.slice(1);
  const lines=text.split(/\r?\n/).filter(l=>l.trim());if(lines.length<2)return 0;
  const hdr=parseCSVLine(lines[0]);const i=hdr.findIndex(h=>h.replace(/[\t\s]/g,'').toLowerCase()==='orderamount');if(i<0)return 0;
  let t=0;for(let k=1;k<lines.length;k++)t+=parsePeso(parseCSVLine(lines[k])[i]);return t;
}
window.hostImport=async function(){
  const msg=document.getElementById('hiMsg');const say=t=>{msg.innerHTML=t};
  const roomId=document.getElementById('hiRoom').value,live=document.getElementById('hiLive').files[0],cf=document.getElementById('hiCancel').files[0];
  if(!roomId){toast('请先选择直播间 Select a room first');return}
  if(!live){toast('请上传直播数据 Excel · Upload the LIVE Excel');return}
  try{
    say('⏳ 读取中 Reading...');
    await linoLoadXlsx();
    const {dateRange,rows}=parseLiveExcel(await live.arrayBuffer());
    if(!rows.length){say('❌ Excel 里没有数据 No data in Excel');return}
    const parts=dateRange.split('~').map(s=>s.trim());
    const week_key=parts.length===2?parts[0]+'~'+parts[1]:dateRange.replace(/\s/g,'');
    if(!week_key){say('❌ 无法识别日期范围（Excel 第一行）Cannot read the date range');return}
    const a=aggregate(rows);
    const exists=hostWeeks.find(w=>w.room_id===roomId&&w.week_key===week_key);
    // 重新导入时没附取消订单 CSV：保留原来的退单金额，不清零
    a.cancel=cf?parseCancelCSV(await cf.text()):(exists?(+exists.cancel||0):0);
    if(exists&&!confirm(`${week_key} 这一周已经有数据，覆盖吗？${!cf&&+exists.cancel?`\n（没有上传取消订单 CSV，保留原来的退单 ₱${fmtP(exists.cancel)}）`:''}\nThis week already exists. Overwrite?`)){say('');return}
    const rec={room_id:roomId,week_key,date_range:dateRange,...a,imported_by:U.id,imported_at:new Date().toISOString()};
    const r=await sb.upsertOn('tks_host_weeks','room_id,week_key',rec);
    if(!Array.isArray(r))throw new Error(r&&r.message||'save failed');
    const c=calc(rec);
    say(`✅ 导入成功 Imported：<b>${esc(week_key)}</b> · ${a.sessions} 场 sessions · ${c.hrs.toFixed(1)} 小时 h · 净GMV ₱${fmtP(c.net)} · GMV/H ₱${fmtP(c.gmvH)}${cf?' · 退单 ₱'+fmtP(a.cancel):''}`);
    document.getElementById('hiLive').value='';document.getElementById('hiCancel').value='';
    hostWeek=week_key;await load();
  }catch(e){say('❌ 导入失败 Import failed: '+esc(e.message||String(e)))}
};

/* ---------- 直播间 ---------- */
function renderRooms(){
  const box=document.getElementById('hostBody');
  const e=hostEditRoom?hostRooms.find(r=>r.id===hostEditRoom):null;
  box.innerHTML=`<div class="card"><div class="sec-title" style="margin-top:0">${e?'✏️ 编辑直播间 Edit room':'➕ 添加直播间 Add room'}</div>
    <div class="form-row"><div class="fg"><label>主播 Host *</label><input id="hrHost" value="${esc(e?.host_name||'')}" placeholder="RYAN"></div>
      <div class="fg"><label>房间号 Room#</label><input id="hrNum" value="${esc(e?.room_num||'')}" placeholder="tkshop#4"></div>
      <div class="fg"><label>店铺账号 Account</label><input id="hrAcct" value="${esc(e?.account||'')}" placeholder="smarttools831"></div></div>
    <div style="display:flex;gap:8px"><button class="btn btn-pri" style="width:auto" onclick="hostSaveRoom()">💾 ${e?'保存 Save':'添加 Add'}</button>${e?`<button class="btn btn-ghost" style="width:auto" onclick="hostEditRoom=null;hostGo('rooms')">取消 Cancel</button>`:''}</div></div>
  <div class="card"><table class="host-tbl"><thead><tr><th>#</th><th>主播 Host</th><th>房间号 Room#</th><th>店铺账号 Account</th><th>已导入周数 Weeks</th><th></th></tr></thead><tbody>
    ${hostRooms.filter(r=>r.is_active).map((r,i)=>`<tr><td>${i+1}</td><td><b>${esc(r.host_name||'')}</b></td><td>${esc(r.room_num||'')}</td><td>${esc(r.account||'')}</td><td>${hostWeeks.filter(w=>w.room_id===r.id).length}</td>
      <td style="white-space:nowrap"><button class="btn btn-ghost btn-sm" style="width:auto" onclick="hostEditRoom='${r.id}';hostGo('rooms')">✏️</button> <button class="btn btn-ghost btn-sm" style="width:auto" onclick="hostDelRoom('${r.id}')">🗑️</button></td></tr>`).join('')||'<tr><td colspan="6" style="text-align:center;color:var(--text3)">还没有直播间 · No rooms yet</td></tr>'}
  </tbody></table><div class="hm-sub" style="margin-top:8px">主播换人时，直接编辑主播名即可，历史数据保留在这个直播间下 · When the host changes, just edit the name; history stays with the room</div></div>`;
}
window.hostSaveRoom=async function(){
  const d={host_name:document.getElementById('hrHost').value.trim(),room_num:document.getElementById('hrNum').value.trim(),account:document.getElementById('hrAcct').value.trim()};
  if(!d.host_name){toast('请填主播名 Enter host name');return}
  const r=hostEditRoom?await sb.patch('tks_host_rooms',{id:hostEditRoom},d).catch(()=>null):await sb.post('tks_host_rooms',d).catch(()=>null);
  if(!Array.isArray(r)||!r.length){toast('❌ 保存失败 Save failed');return}
  hostEditRoom=null;toast('✅ 已保存 Saved');rHost(document.getElementById('mainBody'));
};
window.hostDelRoom=async function(id){
  const r=hostRooms.find(x=>x.id===id);const n=hostWeeks.filter(w=>w.room_id===id).length;
  if(!confirm(`删除直播间「${roomName(r)}」？${n?`\n它的 ${n} 周数据会保留在历史里，但不再出现在列表中。`:''}\nDelete this room?`))return;
  const x=await sb.patch('tks_host_rooms',{id},{is_active:false}).catch(()=>null);
  if(!Array.isArray(x)||!x.length){toast('❌ 失败 Failed');return}
  toast('🗑️ 已删除 Deleted');rHost(document.getElementById('mainBody'));
};
})();
