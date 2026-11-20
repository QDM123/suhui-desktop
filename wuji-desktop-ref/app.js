/* ============================================================
   吾记桌面版界面参考 · 交互逻辑
   视图对应 QStackedWidget；状态栏显示 Qt 实现要点（报告出处）
   ============================================================ */

const $ = s => document.querySelector(s);
const content = $('#content'), insp = $('#inspector');
const NOW = new Date();
const TODAY_KEY = fmtDay(NOW);

const S = {
  view: 'timeline',
  selId: null,            // 时间轴当前选中
  night: false, theme: 'default',
  calY: NOW.getFullYear(), calM: NOW.getMonth(),
  editing: null, _draft: null,
};

/* ---------- 工具 ---------- */
function fmtDay(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function fmtTime(d){ return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; }
function esc(s){ return (s||'').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
const WEEK_CN = ['周日','周一','周二','周三','周四','周五','周六'];
const titleOf = e => e.title || (e.content||'').split('\n')[0].slice(0,20) || '（无标题）';
const active = () => ENTRIES.filter(e => !e.deleted && !e.is_passby);
const sorted = () => active().sort((a,b) => b.occurred_at - a.occurred_at);

function status(hint){ $('#status-hint').innerHTML = hint; }
function statusRight(){ $('#status-count').textContent = `${active().length} 篇日记 · ${CATEGORIES.length} 个分类`; }
function toast(msg, ms=2000){ const t=$('#toast'); t.textContent=msg; t.hidden=false; clearTimeout(t._tm); t._tm=setTimeout(()=>t.hidden=true,ms); }

function dialog({title, body, btns}){
  $('#dialog-title').textContent = title;
  $('#dialog-body').innerHTML = body || '';
  const box = $('#dialog-btns'); box.innerHTML='';
  btns.forEach(b=>{ const el=document.createElement('button'); el.textContent=b.text; if(b.cls)el.className=b.cls;
    el.onclick=()=>{closeDialog(); b.onClick&&b.onClick();}; box.appendChild(el); });
  $('#dialog-mask').hidden = false;
}
function closeDialog(){ $('#dialog-mask').hidden = true; }
$('#dialog-mask').addEventListener('click', e=>{ if(e.target.id==='dialog-mask') closeDialog(); });
document.addEventListener('keydown', e=>{ if(e.key==='Escape' && !$('#dialog-mask').hidden) closeDialog(); });

function applyTheme(){
  $('#window').dataset.theme = S.night ? 'night' : (S.theme==='default' ? '' : S.theme);
}

/* ---------- 导航 ---------- */
document.querySelectorAll('.nav-item[data-view]').forEach(n => n.onclick = () => go(n.dataset.view));
function go(view){
  S.view = view;
  document.querySelectorAll('.nav-item[data-view]').forEach(n => n.classList.toggle('active', n.dataset.view===view));
  ({ timeline:renderTimeline, write:()=>renderEditor(), calendar:renderCalendar,
     tunnel:renderTunnel, album:renderAlbum, bin:renderBin, export:renderExport, settings:renderSettings })[view]();
  statusRight();
}
function toggleSidebar(){ $('#window').classList.toggle('collapsed'); }

/* ---------- 全局搜索（标题+正文+标签，FTS5） ---------- */
function globalSearch(q){
  if (S.view !== 'timeline') go('timeline');
  renderTimelineList(q.trim());
  status(`全局搜索：<b>${esc(q)||'…'}</b> —— Qt 侧用 SQLite FTS5 虚表 <code>entries_fts(title, content, tags)</code>，输入防抖 300ms 触发查询` +
    `<div style="opacity:.7;margin-top:4px">出处：报告 §4.5（拼音索引）/ 清单 §4.3</div>`);
}

/* ============ 时间轴：主从视图 ============ */
function renderTimeline(){
  content.innerHTML = `<div class="tl-wrap">
    <div class="tl-list">
      <div class="tools">
        <div class="seg"><button class="on">全部</button></div>
        <div class="chip-row" style="flex:1">
          ${CATEGORIES.map(c=>`<span class="chip" onclick="filterCat(this,${c.id})"><i class="cat-dot" style="background:${c.color}"></i>${c.name}</span>`).join('')}
        </div>
      </div>
      <div class="tl-scroll" id="tl-scroll"></div>
    </div>
    <div class="reader" id="reader"></div>
  </div>`;
  renderTimelineList('');
  if (!S.selId || !ENTRIES.find(e => e.id===S.selId && !e.deleted)) S.selId = sorted()[0]?.id;
  renderReader();
  renderInspector();

  status(`<b>时间轴主从视图</b> —— QSplitter( QListView | QTextBrowser )；条目委托显示 日期/星期/摘要/时间/同步状态；
    分类过滤 = <code>WHERE category_id = ?</code>（单选，报告 §6-3）`);
}
let curCatFilter = null;
function filterCat(el, cid){
  document.querySelectorAll('.tl-list .chip').forEach(c=>c.classList.remove('on'));
  if (curCatFilter === cid){ curCatFilter = null; }
  else { curCatFilter = cid; el.classList.add('on'); }
  renderTimelineList($('#global-q').value.trim());
}
function renderTimelineList(q){
  const box = $('#tl-scroll'); if (!box) return;
  let list = sorted();
  if (curCatFilter) list = list.filter(e => e.category_id === curCatFilter);
  if (q) list = list.filter(e => e.title.includes(q) || e.content.includes(q) || e.tags.some(t=>t.includes(q)));
  const hl = s => esc(s).replace(new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g'), m=>`<span class="hit">${m}</span>`);
  const groups = {};
  list.forEach(e => (groups[e.year_month] = groups[e.year_month]||[]).push(e));
  let html = '';
  if (!list.length) html = `<div class="empty" style="padding:40px 10px;"><span class="big">🍃</span>没有匹配的日记</div>`;
  for (const ym of Object.keys(groups).sort().reverse()){
    const [y,m] = ym.split('-');
    html += `<div class="ym-head"><span>${y}年 ${Number(m)}月</span><span>${groups[ym].length} 篇</span></div>`;
    for (const e of groups[ym]){
      const w = weatherOf(e.weather);
      html += `<div class="tl-item ${e.id===S.selId?'sel':''}" onclick="selectEntry('${e.id}')">
        <div class="t1"><span class="d">${e.occurred_at.getDate()}</span><span class="w">${WEEK_CN[e.weekday]}</span>
          <span class="time">${e.sync_status?'':'⏳ '}${fmtTime(e.occurred_at)}</span></div>
        <div class="t2">${q?hl(titleOf(e)):esc(titleOf(e))}</div>
        <div class="t3"><span>${w.icon} ${w.name}</span><span>${catOf(e.category_id)?.name||''}</span>
          ${e.tags.map(t=>`<span>#${t}</span>`).join('')}</div>
      </div>`;
    }
  }
  box.innerHTML = html;
}
function selectEntry(id){ S.selId = id; renderTimelineList($('#global-q').value.trim()); renderReader(); renderInspector(); }

function renderReader(){
  const e = ENTRIES.find(x => x.id===S.selId);
  const r = $('#reader'); if (!r) return;
  if (!e){ r.innerHTML = `<div class="empty"><span class="big">📖</span>选择一篇日记开始阅读</div>`; return; }
  const w = weatherOf(e.weather);
  const list = sorted(); const idx = list.findIndex(x=>x.id===e.id);
  r.innerHTML = `
    <div class="bar">
      <button class="tool-btn" ${idx<=0?'disabled style="opacity:.35"':''} onclick="step(-1)" title="上一篇">↑</button>
      <button class="tool-btn" ${idx>=list.length-1?'disabled style="opacity:.35"':''} onclick="step(1)" title="下一篇">↓</button>
      <span style="font-size:12px;color:var(--text-secondary)">${idx+1} / ${list.length}</span>
      <span class="sp"></span>
      <button class="tool-btn" onclick="renderEditor('${e.id}')" title="编辑">✏️</button>
      <button class="tool-btn" onclick="askDelete('${e.id}')" title="删除">🗑️</button>
      <button class="tool-btn" onclick="toast('长图渲染：QPainter 自绘整篇为竖长图')" title="生成长图">🖼️</button>
    </div>
    <div class="paper ${S.night?'paper-5':(e.background||'paper-1')}">
      <div class="meta">
        <span>${e.occurred_at.getFullYear()} 年 ${e.occurred_at.getMonth()+1} 月 ${e.occurred_at.getDate()} 日 ${WEEK_CN[e.weekday]} ${fmtTime(e.occurred_at)}</span>
        <span>${w.icon} ${w.name}</span>
        ${e.address?`<span>📍 ${esc(e.address)}</span>`:''}
        ${e.mood!=null?`<span>${['😔','😐','🙂','😊','😄'][e.mood]}</span>`:''}
      </div>
      <h1>${esc(titleOf(e))}</h1>
      <div class="body">${esc(e.content)}</div>
      ${e.cover?`<div class="r-imgs"><div style="background:${e.cover}"></div>${e.cover2?`<div style="background:${e.cover2}"></div>`:''}</div>`:''}
      <div class="meta" style="margin-top:24px;font-size:11.5px;">
        <span>分类：${catOf(e.category_id)?.name||'未分类'}</span>
        ${e.tags.map(t=>`<span>#${t}</span>`).join('')}
        <span>已更新 ${e.rev} 次</span>
      </div>
    </div>`;
}
function step(d){
  const list = sorted(); const idx = list.findIndex(x=>x.id===S.selId);
  const n = idx + d;
  if (n<0) return toast('已经是第一篇日记了');
  if (n>=list.length) return toast('已经是最后一篇日记了');
  selectEntry(list[n].id);
  status(`翻页 = 模型行移动 + <code>scrollTo(index)</code>；到头提示「已经是第一篇/最后一篇日记了」（报告 §4.4）`);
}

/* 删除 —— 报告 §4.2 逐字文案 */
function askDelete(id){
  dialog({
    title:'删除日记',
    body:'确定删除日记？已经同步的日记，此操作可以在回收站恢复',
    btns:[
      {text:'取消'},
      {text:'删除', cls:'danger', onClick(){
        ENTRIES.find(x=>x.id===id).deleted = 1;
        if (S.selId===id) S.selId = null;
        toast('已移入回收站'); refresh();
      }},
    ],
  });
  status(`删除确认弹窗 —— 逐字引用实证文案；软删 = <code>UPDATE entries SET deleted=1</code>（报告 §3.2）`);
}
function refresh(){
  ({timeline:renderTimeline, calendar:renderCalendar, tunnel:renderTunnel, album:renderAlbum, bin:renderBin})[S.view]?.();
  if (S.view==='timeline'){ renderReader(); renderInspector(); }
  statusRight();
}

/* 属性面板（QDockWidget） */
function renderInspector(){
  const e = ENTRIES.find(x=>x.id===S.selId);
  insp.innerHTML = `
    <h3>属性</h3>
    ${e ? `
      <div class="insp-row"><span class="k">日期</span><span>${e.occurred_at.getFullYear()}-${e.occurred_at.getMonth()+1}-${e.occurred_at.getDate()}</span></div>
      <div class="insp-row"><span class="k">时间</span><span>${fmtTime(e.occurred_at)}</span></div>
      <div class="insp-row"><span class="k">星期</span><span>${WEEK_CN[e.weekday]}</span></div>
      <div class="insp-row"><span class="k">天气</span><span>${weatherOf(e.weather).icon} ${weatherOf(e.weather).name}</span></div>
      <div class="insp-row"><span class="k">地址</span><span>${esc(e.address)||'—'}</span></div>
      <div class="insp-row"><span class="k">分类</span><span>${catOf(e.category_id)?.name||'未分类'}</span></div>
      <div class="insp-row"><span class="k">标签</span><span>${e.tags.map(t=>'#'+t).join(' ')||'—'}</span></div>
      <div class="insp-row"><span class="k">同步状态</span><span>${e.sync_status?'已同步':'未同步'}</span></div>
      <div class="insp-row"><span class="k">信笺</span><span>${e.background||'paper-1'}</span></div>
    ` : `<div style="font-size:13px;color:var(--text-secondary)">未选中条目</div>`}
    <h3>Qt 映射</h3>
    <div class="insp-tip">
      本面板 = <b>QDockWidget</b>，随选中条目刷新（<b>QItemSelectionModel</b> 的 currentChanged 信号）。<br>
      字段即 <b>entries 表列</b>，直接 <code>QSqlRecord → setXxx</code>，无需 DTO 转换。
    </div>`;
}

/* ============ 编辑器 ============ */
let saveTimer=null;
function renderEditor(id){
  S.editing = id || null;
  const e = id ? ENTRIES.find(x=>x.id===id) : null;
  S._draft = e ? {...e, tags:[...e.tags]} : {weather:1, category_id:1, tags:[], mood:null, address:''};
  const d = e ? e.occurred_at : new Date();
  const maxDay = fmtDay(NOW);
  content.innerHTML = `<div class="ed-wrap">
    <div class="ed-toolbar">
      <button class="tool-btn" onclick="go('timeline')" title="返回">‹</button>
      <span style="font-size:13.5px;font-weight:700">${e?'编辑日记':'写日记'}</span>
      <span class="sp"></span>
      <span id="save-state" style="font-size:11.5px;color:var(--text-secondary)"></span>
      <button class="tool-btn" onclick="pickMood()" title="心情">${S._draft.mood!=null?['😔','😐','🙂','😊','😄'][S._draft.mood]:'😶'}</button>
      <button class="tool-btn" onclick="pickWeather()" title="天气">${weatherOf(S._draft.weather).icon}</button>
      <button class="tool-btn" onclick="pickAddress()" title="地址">📍</button>
      <button class="tool-btn" onclick="pickCategory()" title="分类（单选）">🏷️</button>
      <button class="tool-btn" onclick="pickTags()" title="标签（多选）">#</button>
      <button class="tool-btn" onclick="toast('每篇最多 20 张图片（报告 §3.5）')" title="图片">🖼️</button>
      <button class="btn sm" onclick="saveEntry()">完成</button>
    </div>
    <div class="ed-paper ${S.night?'paper-5':(e?.background||'paper-1')}" id="ed-paper">
      <div class="ed-date">
        <input type="date" id="ed-day" value="${fmtDay(d)}" max="${maxDay}" onchange="guardFuture(this)">
        <input type="time" id="ed-time" value="${fmtTime(d)}">
        <span>🚫 未来日期不可写 · 每日新增上限 150 篇</span>
      </div>
      <input id="ed-title" placeholder="标题（可留空）" value="${esc(e?.title||'')}" oninput="scheduleSave()">
      <textarea id="ed-content" placeholder="此刻，想说点什么…" oninput="scheduleSave()">${esc(e?.content||'')}</textarea>
      <div class="paper-pick" id="paper-pick"></div>
    </div>
  </div>`;
  renderPaperPick(e?.background||'paper-1');
  insp.innerHTML = `<h3>编辑器结构</h3>
    <div class="insp-tip">
      中央区 = <b>QTextEdit</b>（富文本）+ 顶部 <b>QToolBar</b>；信笺背景 = 编辑器 viewport 的样式表背景。<br><br>
      <b>自动保存</b>：QTextEdit::textChanged → QTimer::singleShot(3000) 防抖落盘，状态栏显示"已保存 HH:MM"（草稿 §7.1-4）。<br><br>
      天气=<b>枚举 id</b>、分类=<b>单选</b>、标签=<b>多选</b>（报告 §3.6 / §6-3）。
    </div>`;
  status(`编辑器 —— 停止输入 3 秒自动保存；日期 max=今天 即"未来不可写"；图片 ≤20 张/篇、≤150 篇/日（报告 §3.5）`);
}
function renderPaperPick(cur){
  const papers=['paper-1','paper-2','paper-3','paper-4','paper-6'];
  $('#paper-pick').innerHTML = papers.map(p=>
    `<div class="paper-thumb ${p} ${p===cur?'on':''}" onclick="setPaper('${p}')"></div>`).join('');
}
function setPaper(p){
  $('#ed-paper').className = `ed-paper ${S.night?'paper-5':p}`;
  document.querySelectorAll('.paper-thumb').forEach(t=>t.classList.toggle('on', t.classList.contains(p)));
  scheduleSave();
}
function guardFuture(inp){ if (inp.value > fmtDay(NOW)){ inp.value = fmtDay(NOW); toast('未来不可写哦'); } scheduleSave(); }
function scheduleSave(){
  const el=$('#save-state'); if(!el) return;
  el.textContent='正在保存…';
  clearTimeout(saveTimer);
  saveTimer=setTimeout(()=>{ el.textContent=`已保存 ${fmtTime(new Date())}`; },3000);
}
function saveEntry(){
  clearTimeout(saveTimer);
  const id=S.editing;
  const day=$('#ed-day').value, time=$('#ed-time').value;
  const dt=new Date(day+'T'+time);
  const base=id?ENTRIES.find(x=>x.id===id):null;
  const data={ title:$('#ed-title').value, content:$('#ed-content').value,
    occurred_at:dt, updated_at:new Date(), rev:(base?.rev||0)+1,
    year_month:day.slice(0,7), day, weekday:dt.getDay(),
    ...S._draft,
    background:[...$('#ed-paper').classList].find(c=>c.startsWith('paper-')) };
  delete data.occurred_at_copy;
  if (base) Object.assign(base,data);
  else ENTRIES.unshift(Object.assign(mk('e'+Date.now(),dt.getFullYear(),dt.getMonth()+1,dt.getDate(),dt.getHours(),dt.getMinutes(),{}),data));
  toast(base?'已更新':'日记已保存');
  S.selId = id || ENTRIES[0].id;
  go('timeline');
}

/* 编辑器选择弹窗 */
function pickWeather(){
  dialog({ title:'今天天气',
    body:`<div class="chip-row" style="justify-content:center">${WEATHERS.map(w=>
      `<span class="chip ${S._draft.weather===w.id?'on':''}" onclick="S._draft.weather=${w.id};closeDialog();pickWeather()">${w.icon} ${w.name}</span>`).join('')}</div>`,
    btns:[{text:'确定',cls:'primary'}] });
}
function pickCategory(){
  dialog({ title:'选择分类（单选）',
    body:`<div class="chip-row" style="justify-content:center">${CATEGORIES.map(c=>
      `<span class="chip ${S._draft.category_id===c.id?'on':''}" onclick="S._draft.category_id=${c.id};closeDialog();pickCategory()"><i class="cat-dot" style="background:${c.color}"></i>${c.name}</span>`).join('')}</div>`,
    btns:[{text:'确定',cls:'primary'}] });
}
function pickTags(){
  const tags = S._draft.tags || (S._draft.tags=[]);
  dialog({ title:'选择标签（多选）',
    body:`<div class="chip-row" style="justify-content:center">${ALL_TAGS.map(t=>
      `<span class="chip ${tags.includes(t)?'on':''}" onclick="toggleTag('${t}')">${t}</span>`).join('')}</div>`,
    btns:[{text:'确定',cls:'primary'}] });
}
function toggleTag(t){
  S._draft.tags = S._draft.tags.includes(t) ? S._draft.tags.filter(x=>x!==t) : [...S._draft.tags,t];
  closeDialog(); pickTags();
}
function pickMood(){
  dialog({ title:'此刻心情',
    body:`<div style="font-size:30px;letter-spacing:12px;text-align:center">${['😔','😐','🙂','😊','😄'].map((m,i)=>
      `<span style="cursor:pointer;opacity:${S._draft.mood===i?1:.35}" onclick="S._draft.mood=${i};closeDialog()">${m}</span>`).join('')}</div>`,
    btns:[{text:'确定',cls:'primary'}] });
}
function pickAddress(){
  const recent=[...new Set(ENTRIES.map(x=>x.address).filter(Boolean))].slice(0,4);
  dialog({ title:'所在位置', body: recent.length
      ? `最近使用：<div class="chip-row" style="justify-content:center;margin-top:8px">${recent.map(a=>
          `<span class="chip" onclick="S._draft.address='${a}';closeDialog()">${a}</span>`).join('')}</div>`
      : '自由文本输入',
    btns:[{text:'确定',cls:'primary'}] });
}

/* ============ 日历（月视图 + 侧栏当日列表） ============ */
function renderCalendar(){
  const y=S.calY, m=S.calM;
  const first=new Date(y,m,1), pad=first.getDay(), dim=new Date(y,m+1,0).getDate();
  const MN=['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'];
  let cells='';
  ['日','一','二','三','四','五','六'].forEach(w=>cells+=`<div class="wk">周${w}</div>`);
  for(let i=0;i<pad;i++) cells+='<div></div>';
  for(let d=1;d<=dim;d++){
    const dt=new Date(y,m,d), key=fmtDay(dt);
    const has=!onlyDeleted(key);
    const tunnel=TUNNEL_DAYS[key];
    const isFuture=dt>new Date(NOW.getFullYear(),NOW.getMonth(),NOW.getDate());
    const evs=has?sorted().filter(e=>fmtDay(e.occurred_at)===key):[];
    const cls=['cal-cell', d===NOW.getDate()&&y===NOW.getFullYear()&&m===NOW.getMonth()?'today':'',
      isFuture?'future':'', tunnel?'tunnel':''].join(' ');
    cells+=`<div class="${cls}" onclick="calClick('${key}',${has},${isFuture},${!!tunnel})">
      <span class="n">${d}</span>
      ${evs.slice(0,2).map(e=>`<span class="cal-ev">${esc(titleOf(e))}</span>`).join('')}
      ${evs.length>2?`<span class="cal-ev more">+${evs.length-2} 篇</span>`:''}
      ${!has&&tunnel?`<span class="cal-ev more">时光隧道</span>`:''}
    </div>`;
  }
  content.innerHTML = `<div class="view" style="display:block;">
    <div class="cal-wrap">
      <div class="cal-main card" style="padding:18px;">
        <div class="cal-head">
          <button onclick="S.calM--;if(S.calM<0){S.calM=11;S.calY--;}renderCalendar()">‹ ${MN[(m+11)%12]}</button>
          <span class="h">${y} 年 ${MN[m]}</span>
          <button onclick="S.calM++;if(S.calM>11){S.calM=0;S.calY++;}renderCalendar()">${MN[(m+1)%12]} ›</button>
          <span style="margin-left:auto"><button onclick="go('tunnel')">🕳️ 年视图 · 时光隧道</button></span>
        </div>
        <div class="cal-grid">${cells}</div>
        <div class="cal-legend">
          <span><i style="background:var(--accent)"></i>有日记</span>
          <span><i style="background:var(--accent-soft);border:1px dashed var(--accent)"></i>时光隧道（整段空白）</span>
          <span><i style="border:1.5px solid var(--accent);background:transparent"></i>今天</span>
          <span style="margin-left:auto">未来日期禁止点击</span>
        </div>
      </div>
      <div class="cal-side">
        <div class="card" style="padding:14px;">
          <div style="font-size:13px;font-weight:700;margin-bottom:8px;">📌 这一天</div>
          <div id="on-day" style="font-size:12.5px;color:var(--text-secondary)">点击左侧日期查看当日日记</div>
        </div>
        <div class="card" style="padding:14px;margin-top:12px;">
          <div style="font-size:13px;font-weight:700;margin-bottom:8px;">🌤️ 今天</div>
          <div style="font-size:12.5px;color:var(--text-secondary);line-height:2;">
            ${weatherOf(1).icon} 晴 · ${TODAY_KEY}<br>已有 ${DAY_COUNT[TODAY_KEY]||0} 篇日记
          </div>
        </div>
      </div>
    </div>
  </div>`;
  insp.innerHTML = `<h3>日历实现</h3>
    <div class="insp-tip">月视图 = 自绘 <b>QWidget</b>(7×n 网格) 或改造 QCalendarWidget；有日记的格子内嵌当日标题列表。<br><br>
    点击三分支弹窗（§4.2）：今天无日记 →「今天还没有写日记哦，快补上...」；历史无日记 → 补记；未来 → 禁止。<br><br>
    右栏"这一天" = 第二个 dock 或内嵌面板。</div>`;
  status(`日历月视图 —— 有日记日期显示条目预览；虚线格 = 时光隧道标记（week/month/year_gone，报告 §3.7）`);
}
function onlyDeleted(key){ return !ENTRIES.some(e=>!e.deleted&&fmtDay(e.occurred_at)===key); }
function calClick(key, has, isFuture, isTunnel){
  if (isFuture) return toast('未来不可写哦');
  const box=$('#on-day');
  if (has){
    const evs=sorted().filter(e=>fmtDay(e.occurred_at)===key);
    box.innerHTML=evs.map(e=>`<div style="padding:7px 0;border-bottom:1px dashed var(--line);cursor:pointer;color:var(--accent)" onclick="S.selId='${e.id}';go('timeline')">▸ ${esc(titleOf(e))} <span style="color:var(--text-secondary)">${fmtTime(e.occurred_at)}</span></div>`).join('');
    return;
  }
  const isToday=key===TODAY_KEY;
  dialog({ title:isToday?'今日日记':(isTunnel?'时光隧道':'补记日记'),
    body: isToday?'今天还没有写日记哦，快补上...'
        : isTunnel?'这段日子被时光带走了，要写点什么把它找回来吗？'
        : '这一天还没有日记哦，要补一下吗？',
    btns:[{text:'取消'},{text:'确定',cls:'primary',onClick(){renderEditor(null);$('#ed-day').value=key;}}] });
  status(`日历空状态弹窗 —— 逐字实证文案（CalendarFragment）；注意：草稿里的「补上/不了」按钮是自创改进，原 App 用「确定/取消」（报告 §4.2 修正）`);
}

/* ============ 时光隧道（年视图） ============ */
function renderTunnel(){
  const y=S.calY;
  const thisYear=y===NOW.getFullYear();
  const months=[];
  const maxM=thisYear?NOW.getMonth():11;
  for(let m=0;m<=maxM;m++){
    let cnt=0; const d=new Date(y,m,1);
    while(d.getMonth()===m){ cnt+=DAY_COUNT[fmtDay(d)]||0; d.setDate(d.getDate()+1); }
    months.push({m:m+1,cnt});
  }
  const gone=Object.keys(TUNNEL_DAYS).filter(k=>k.startsWith(String(y))).map(k=>Number(k.slice(5,7)));
  content.innerHTML = `<div class="view">
    <div class="view-head"><h1>${y} 年 · 时光隧道</h1><span class="sub">整周 / 整月 / 整年没有日记的时段会沉入隧道</span>
      <span style="margin-left:auto;display:flex;gap:8px;">
        <button class="btn plain sm" onclick="S.calY--;renderTunnel()">‹ 上一年</button>
        <button class="btn plain sm" onclick="S.calY++;renderTunnel()">下一年 ›</button>
      </span></div>
    <div class="year-grid card" style="padding:18px;display:grid;grid-template-columns:repeat(4,1fr);gap:10px;">
      ${months.map(({m,cnt})=>`
        <div class="cal-cell" style="min-height:86px;${cnt?'':'border-style:dashed;'}" onclick="${cnt?`toast('${m}月共 ${cnt} 篇')`:gone.includes(m)?`calClick('${y}-${String(m).padStart(2,'0')}-15',false,false,true)`:`renderEditor(null)`}">
          <span class="n">${m}月</span>
          ${cnt?`<span class="cal-ev">${cnt} 篇日记</span>`:gone.includes(m)?`<span class="cal-ev more">🕳️ 整月空白</span>`:`<span class="cal-ev more" style="color:var(--text-secondary)">还没有日记</span>`}
        </div>`).join('')}
    </div>
    <div class="empty" style="padding-top:30px;"><span class="big" style="font-size:34px;">🕳️</span>
      点击空白月份可以直接补记 —— 这是吾记区别于普通日记 App 的差异化记忆点</div>
  </div>`;
  insp.innerHTML = `<h3>时光隧道</h3>
    <div class="insp-tip">判定逻辑：<code>week_gone || month_gone || year_gone</code>（报告 §3.7）。<br><br>
    实现成本极低：一张日期表 + 三个布尔标记，强烈建议抄。<br><br>
    Qt 侧 = QGridLayout 年视图 + 标记列查询。</div>`;
  status(`时光隧道年视图 —— 官网从未宣传的特色功能；成本极低价值高（报告 §7.2 必抄三项之一）`);
}

/* ============ 相册 ============ */
function renderAlbum(){
  const items=[];
  sorted().forEach(e=>{ if(e.cover) items.push({e, bg:e.cover}); if(e.cover2) items.push({e, bg:e.cover2}); });
  content.innerHTML = `<div class="view">
    <div class="view-head"><h1>日记相册</h1><span class="sub">自动汇集日记中的图片 · ${items.length} 张</span></div>
    <div class="album-grid">${items.map(({e,bg})=>`
      <div class="ph" style="background:${bg}" onclick="S.selId='${e.id}';go('timeline')">
        <span>${fmtDay(e.occurred_at)} · ${esc(titleOf(e))}</span></div>`).join('')}
    </div>
    <div class="empty" style="padding-top:24px;">图片按日记时间自动归档，无需手动整理；可扩展 EXIF GPS → 地图视图</div>
  </div>`;
  insp.innerHTML = `<h3>相册</h3><div class="insp-tip">扫描媒体关联表自动汇集（官网"自动汇集"实证）。<br><br>Qt 侧：QFileSystemModel 或 SQL 查询 + QListView(IconMode)。</div>`;
  status(`日记相册 —— 从日记媒体字段自动聚合，按时间排序`);
}

/* ============ 回收站 ============ */
function renderBin(){
  const list=ENTRIES.filter(e=>e.deleted);
  content.innerHTML = `<div class="view">
    <div class="view-head"><h1>回收站</h1><span class="sub">删除后 30 天内可恢复（本地版自定保留期）</span></div>
    ${list.map(e=>`
      <div class="table-row">
        <span style="font-size:18px">📄</span>
        <span class="grow"><span class="t">${esc(titleOf(e))}</span>
          <div class="s">${fmtDay(e.occurred_at)} · 原文 ${e.content.length} 字</div></span>
        <button class="btn sm ghost" onclick="restoreEntry('${e.id}')">恢复</button>
        <button class="btn sm danger" onclick="purgeEntry('${e.id}')">彻底删除</button>
      </div>`).join('') || '<div class="empty"><span class="big">🗑️</span>回收站是空的</div>'}
  </div>`;
  insp.innerHTML = `<h3>回收站</h3><div class="insp-tip">软删 + 恢复；原 App 仅"已同步"可恢复，本地版无此区分，统一可恢复。<br><br>恢复提示「恢复成功 / 恢复失败」（报告 §3.2）。</div>`;
  status(`回收站 —— deleted 标记 + 定时清理任务（建议保留 30 天）`);
}
function restoreEntry(id){ ENTRIES.find(x=>x.id===id).deleted=0; toast('恢复成功'); refresh(); }
function purgeEntry(id){
  dialog({ title:'彻底删除', body:'彻底删除后无法恢复，确定吗？',
    btns:[{text:'取消'},{text:'删除',cls:'danger',onClick(){ENTRIES=ENTRIES.filter(x=>x.id!==id);toast('已彻底删除');refresh();}}] });
}

/* ============ 导出 ============ */
function renderExport(){
  content.innerHTML = `<div class="view">
    <div class="view-head"><h1>导出日记</h1><span class="sub">会员墙 8 条功能清单，桌面版全部开放</span></div>
    <div class="card" style="padding:16px;margin-bottom:14px;">
      <div style="font-size:13.5px;font-weight:700;margin-bottom:10px;">按分类导出 <span style="font-weight:400;color:var(--text-secondary);font-size:12px">（pdf_select_category）</span></div>
      <div class="chip-row">${CATEGORIES.map(c=>`<span class="chip" onclick="this.classList.toggle('on')"><i class="cat-dot" style="background:${c.color}"></i>${c.name}</span>`).join('')}</div>
    </div>
    <div class="export-opt" onclick="toast('Qt: QTextDocument → QPdfWriter，导出到本地目录')">
      <span class="ico">📄</span><span><div class="t">导出 PDF</div><div class="s">导出到本地目录，可预览、可分享（原 App 用 iText 生成 / PDFium 预览）</div></span></div>
    <div class="export-opt" onclick="toast('Qt: QTextDocument → HTML → doc/docx 打包')">
      <span class="ico">📝</span><span><div class="t">导出 Word</div><div class="s">合并为单个文档，方便打印存档；原 App 必须走邮箱，本地版直接落盘</div></span></div>
    <div class="export-opt" onclick="toast('Qt: QPainter 自绘整篇为竖长图 QImage')">
      <span class="ico">🖼️</span><span><div class="t">生成长图</div><div class="s">整篇日记渲染为一张竖长图；原 App 免费用户限 2 次/天，本地版不限</div></span></div>
    <div class="card" style="padding:16px;margin-top:4px;">
      <div style="font-size:13.5px;font-weight:700;margin-bottom:10px;">已导出文件 <span style="font-weight:400;color:var(--text-secondary);font-size:12px">（选中可删除）</span></div>
      ${['2026年10月.pdf · 2.4 MB','2026年三季度.docx · 1.8 MB'].map(f=>`
        <div class="table-row" style="cursor:pointer" onclick="askDeleteExport(this)">
          <span style="font-size:18px">${f.includes('pdf')?'📄':'📝'}</span>
          <span class="grow"><span class="t">${f.split(' · ')[0]}</span><div class="s">${f.split(' · ')[1]} · 导出历史</div></span>
        </div>`).join('')}
    </div>
  </div>`;
  insp.innerHTML = `<h3>导出</h3><div class="insp-tip">原 App 由 ExportBackgroundService 后台执行（Qt 对应 QThread + 信号进度）。<br><br><b>值得抄的细节</b>：按分类导出、导出后文件可删除（报告 §7.3）。</div>`;
  status(`导出 —— 三种形态规则各异（报告 §3.3）；本地后台服务导出`);
}
function askDeleteExport(el){
  dialog({ title:'删除导出文件', body:'确定删除该导出文件？',
    btns:[{text:'取消'},{text:'删除',cls:'danger',onClick(){el.remove();toast('已删除导出文件');}}] });
}

/* ============ 设置 ============ */
function renderSettings(){
  content.innerHTML = `<div class="view" style="max-width:640px;">
    <div class="view-head"><h1>设置</h1></div>
    <div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;letter-spacing:1px;">主题外观 —— 原 App 免费 4 款 / 会员 40 款，本地版 5 款 + 夜间</div>
    <div class="card" style="padding:16px;margin-bottom:14px;">
      <div class="theme-grid">
        ${THEMES.map(t=>`<div class="theme-swatch ${S.theme===t.key&&!S.night?'on':''}" style="background:${t.color}" onclick="S.theme='${t.key}';S.night=false;applyTheme();renderSettings()"><span>${t.name}</span></div>`).join('')}
      </div>
    </div>
    <div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;letter-spacing:1px;">偏好</div>
    <div class="set-group">
      <div class="set-row"><span>🌙</span><span class="grow">夜间模式<div class="s">原 App 走资源限定符，桌面版建议两套 QSS 文件切换</div></span>
        <span class="switch ${S.night?'on':''}" onclick="S.night=!S.night;applyTheme();renderSettings()"></span></div>
      <div class="set-row"><span>🔔</span><span class="grow">提醒写日记<div class="s">本地定时提醒，失约不追罚；自定义提醒是原 App 会员功能，桌面版开放</div></span>
        <span class="switch" onclick="toast('Qt: QTimer / 系统托盘定时')"></span></div>
      <div class="set-row"><span>🔒</span><span class="grow">隐私密码锁<div class="s">≥6 位，本地哈希存储（报告 §3.4）</div></span>
        <span class="switch" onclick="toast('Qt: 启动校验 QCryptographicHash')"></span></div>
    </div>
    <div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;letter-spacing:1px;">数据</div>
    <div class="set-group">
      <div class="set-row" style="cursor:pointer" onclick="toast('加密备份到指定目录')"><span>💾</span><span class="grow">导出加密备份<div class="s">替代原 App 的云同步</div></span><span style="color:var(--text-secondary)">›</span></div>
      <div class="set-row" style="cursor:pointer" onclick="toast('演示版')"><span>📂</span><span class="grow">数据目录<div class="s">md + SQLite 双写（草稿方案）</div></span><span style="color:var(--text-secondary)">›</span></div>
    </div>
  </div>`;
  insp.innerHTML = `<h3>主题机制</h3><div class="insp-tip">CSS 变量 = 将来注入 QSS 的变量集：<code>--accent / --text-main / --line / --summary</code>。<br><br>
    原 App 把主题/菜单/天气全做成 JSON 表驱动（报告 §4.5），Qt 用 QJsonDocument 读表 → 生成 QSS 注入。</div>`;
  status(`设置 —— 主题 JSON 表驱动 → QSS 注入；菜单项数据驱动，新增功能不改 UI 代码`);
}

/* ---------- 启动 ---------- */
applyTheme();
go('timeline');
