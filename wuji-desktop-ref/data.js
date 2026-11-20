/* ============================================================
   模拟数据 —— 字段命名对应报告 §7.1 桌面版 schema
   weather 为枚举 id（报告 §3.6），不是字符串
   ============================================================ */

const WEATHERS = [
  { id: 1, name: '晴',   icon: '☀️' },
  { id: 2, name: '多云', icon: '⛅' },
  { id: 3, name: '阴',   icon: '☁️' },
  { id: 4, name: '雨',   icon: '🌧️' },
  { id: 5, name: '雷',   icon: '⛈️' },
  { id: 6, name: '冰雹', icon: '🧊' },
  { id: 7, name: '雾',   icon: '🌫️' },
  { id: 8, name: '雪',   icon: '🌨️' },
  { id: 9, name: '霾',   icon: '😶‍🌫️' },
  { id: 10, name: '夜晚', icon: '🌙' },
];
const weatherOf = id => WEATHERS.find(w => w.id === id) || WEATHERS[0];

const MOODS = ['😔','😐','🙂','😊','😄'];

const CATEGORIES = [
  { id: 1, name: '生活', color: '#00CCBB' },
  { id: 2, name: '工作', color: '#8695B2' },
  { id: 3, name: '旅行', color: '#f0885a' },
  { id: 4, name: '读书', color: '#7b7fd0' },
];
const catOf = id => CATEGORIES.find(c => c.id === id);

const ALL_TAGS = ['家人','朋友','运动','美食','电影','随笔','加班','周末','海边','猫'];

/* 程序生成占位图（渐变色块，素材自备） */
function ph(seed, w = 400, h = 300){
  const hues = [[160,70],[210,60],[30,75],[265,55],[340,60],[190,65]];
  const [hh, s] = hues[seed % hues.length];
  return `linear-gradient(135deg,hsl(${hh},${s}%,72%),hsl(${(hh+40)%360},${s}%,58%))`;
}

function mk(id, y, m, d, hh, mi, o){
  const dt = new Date(y, m - 1, d, hh, mi);
  return Object.assign({
    id, occurred_at: dt, created_at: dt, updated_at: dt,
    year_month: `${y}-${String(m).padStart(2,'0')}`,
    day: `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`,
    weekday: dt.getDay(),
    category_id: 1, tags: [], weather: 1, address: '',
    background: 'paper-1', sync_status: 1, deleted: 0, rev: 1,
    cover: null, is_passby: 0, praise_count: 0,
    week_gone: 0, month_gone: 0, year_gone: 0,
  }, o);
}

/* 有日记的日期集合："2026-11-14" -> 篇数 */
const DAY_COUNT = {};
function reg(e){
  const key = `${e.occurred_at.getFullYear()}-${String(e.occurred_at.getMonth()+1).padStart(2,'0')}-${String(e.occurred_at.getDate()).padStart(2,'0')}`;
  DAY_COUNT[key] = (DAY_COUNT[key] || 0) + 1;
}

let ENTRIES = [
  mk('e01', 2026,11,16, 22,10, {
    title: '秋夜的江边散步',
    content: '晚上沿着江边走了很久。风把梧桐叶吹得满地都是，踩上去沙沙响。\n最近工作节奏有点快，难得有这样一个完全属于自己的晚上。\n想到一句话：日子是自己的，要把平凡过成诗。',
    weather: 10, address: '滨江西路', category_id: 1,
    tags: ['随笔','周末'], cover: ph(1), mood: 3,
  }),
  mk('e02', 2026,11,16, 8,5, {
    title: '晨跑五公里',
    content: '起得比闹钟早。跑完买了豆浆和油条，路边桂花开了，整条街都是甜的。',
    weather: 1, address: '小区东门', category_id: 1,
    tags: ['运动'], mood: 4,
  }),
  mk('e03', 2026,11,14, 21,30, {
    title: '周末的火锅局',
    content: '和老同学约了火锅，聊了很多小时候的糗事。\n原来大家都一样，成年以后反而更怀念那些没心没肺的日子。',
    weather: 2, address: '老城火锅', category_id: 1,
    tags: ['朋友','美食'], cover: ph(2), mood: 4,
  }),
  mk('e04', 2026,11,9, 20,0, {
    title: '读完《山茶文具店》',
    content: '替人写信的人，自己也有很多说不出的话。\n「与其苦苦追寻失去的东西，还不如好好珍惜自己眼前拥有的东西。」',
    weather: 3, address: '家', category_id: 4,
    tags: ['读书'], mood: 2,
  }),
  mk('e05', 2026,10,26, 15,40, {
    title: '海边的两天',
    content: '住在海边的民宿，早上被浪声叫醒。\n沿着海岸线骑了一下午自行车，晒黑了，但值得。',
    weather: 1, address: '东极岛', category_id: 3,
    tags: ['旅行','海边'], cover: ph(3), cover2: ph(4), mood: 4,
  }),
  mk('e06', 2026,9,30, 18,20, {
    title: '三季度复盘',
    content: '这个季度最大的收获是学会了说不。把精力集中在最重要的一两件事上，效率反而高了。',
    weather: 1, address: '公司', category_id: 2,
    tags: ['工作'], mood: 3,
  }),
  mk('e07', 2026,8,15, 22,0, {
    title: '捡到一只猫',
    content: '楼下的橘猫跟我上了六楼。喂了一根火腿肠，它决定留下来。\n取名「年糕」。以后也是有猫的人了。',
    weather: 4, address: '家', category_id: 1,
    tags: ['猫'], cover: ph(5), mood: 4,
  }),
  mk('e08', 2025,12,31, 23,50, {
    title: '跨年夜',
    content: '在阳台上看了整城的烟花。新的一年，希望家人平安，自己从容。',
    weather: 10, address: '家', category_id: 1,
    tags: ['家人'], mood: 4,
  }),
  mk('e09', 2025,6,18, 9,0, {
    title: '毕业那天',
    content: '拍了毕业照，把宿舍钥匙交还给了楼管阿姨。\n四年装进两个行李箱，原来青春这么轻，又这么重。',
    weather: 1, address: '母校', category_id: 1,
    tags: ['朋友'], cover: ph(6), mood: 1,
  }),
  mk('e10', 2026,11,12, 23,0, {
    title: '', content: '加班到十一点，地铁上几乎没有人。城市的另一面也很安静。',
    weather: 10, address: '地铁二号线', category_id: 2,
    tags: ['加班'], sync_status: 0, mood: 1,   /* 未同步：时间轴显示同步图标 */
  }),
  mk('e11', 2026,11,8, 14,0, {
    title: '过客 · 一段想说的话',
    content: '匿名网友：今天在公交车上给一位老人让了座，他冲我笑了很久。原来快乐可以这么便宜。',
    is_passby: 1, praise_count: 128, category_id: 1, tags: [],
  }),
  mk('e12', 2026,11,6, 9,30, {
    title: '过客 · 树洞',
    content: '匿名网友：辞职的第三十天，存款在减少，但睡眠回来了。算不算一种赚？',
    is_passby: 1, praise_count: 86, category_id: 1, tags: [],
  }),
];
ENTRIES.forEach(reg);

/* 时光隧道标记（报告 §3.7：week/month/year_gone） */
const TUNNEL_DAYS = {
  '2026-10-02': { week_gone: 1 },
  '2026-10-09': { month_gone: 1 },
  '2025-07-04': { year_gone: 1 },
};

/* 设置页菜单（报告 §4.5：JSON 表驱动，这里用 JS 常量模拟那张 setting.json） */
const MINE_MENUS = [
  { group: '记录', items: [
    { icon: '🏷️', title: '分类管理', act: 'cats' },
    { icon: '🖼️', title: '日记相册', act: 'album' },
    { icon: '🗑️', title: '回收站', act: 'bin', badge: () => ENTRIES.filter(e => e.deleted).length },
  ]},
  { group: '找回与分享', items: [
    { icon: '🔍', title: '搜索', act: 'search' },
    { icon: '📤', title: '导出日记', act: 'export' },
    { icon: '🎞️', title: '时光隧道', act: 'tunnel' },
  ]},
  { group: '外观', items: [
    { icon: '🎨', title: '主题外观', act: 'theme' },
    { icon: '🌙', title: '夜间模式', act: 'night', switch: true },
    { icon: '🌌', title: '过客广场', act: 'passer', switch: true },
  ]},
];

const THEMES = [
  { key: 'default', name: '默认青', color: '#00CCBB' },
  { key: 'forest',  name: '林间',   color: '#3aa76d' },
  { key: 'dusk',    name: '暮紫',   color: '#7b7fd0' },
  { key: 'sunset',  name: '暖橙',   color: '#f0885a' },
  { key: 'ink',     name: '黛蓝',   color: '#4a5a72' },
];
