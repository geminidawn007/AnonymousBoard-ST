/* Anonymous Board · RP Companion v0.2
 * A standalone SillyTavern UI extension: a virtual phone with two anonymous forums (2ch / 4chan).
 * It never edits presets, prompts or chat history. The only thing it reads from the chat is
 * (optionally) recent messages or the Summarize extension's summary, sent as private background.
 */
(() => {
'use strict';
if (globalThis.__anonymousBoardV2) return;
globalThis.__anonymousBoardV2 = true;

const VERSION = '0.2.6';
const KEY = 'st_anonymous_board_v2';
const LEGACY_KEY = 'st_anonymous_board_v1';
const MAX_POSTS = 1000;
const FAB = 46;

/* ------------------------------------------------------------------ utils */
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const clean = s => String(s ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
const bound = (s, n) => clean(s).slice(0, n);
const oneLine = s => clean(s).replace(/\s+/g, ' ');
const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const uuid = () => globalThis.crypto?.randomUUID?.() || `ab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
const pad = (n, w = 2) => String(n).padStart(w, '0');
const clone = o => JSON.parse(JSON.stringify(o));
const isObj = o => o && typeof o === 'object' && !Array.isArray(o);
function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function merge(base, extra) {
  for (const [k, v] of Object.entries(extra || {})) {
    if (isObj(v) && isObj(base[k])) merge(base[k], v); else if (v !== undefined) base[k] = v;
  }
  return base;
}
const ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function makeUid() {
  let s = '';
  for (let i = 0; i < 8; i++) s += ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)];
  return s + '0adMrp'[Math.floor(Math.random() * 6)];
}
/* Full-width anchors (＞＞１２) and HTML-escaped ones become plain >>12 */
function normText(s) {
  return clean(s)
    .replace(/\\n/g, '\n')
    .replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&')
    .replace(/[＞]/g, '>')
    .replace(/>>([０-９]+)/g, (_, d) => '>>' + d.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)));
}

const JA_DAYS = '日月火水木金土';
const EN_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function fmt2ch(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}(${JA_DAYS[d.getDay()]}) ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(Math.floor(d.getMilliseconds() / 10))}`;
}
function fmt4ch(ts) {
  const d = new Date(ts);
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${pad(d.getFullYear() % 100)}(${EN_DAYS[d.getDay()]})${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
const fmtClock = (ts = Date.now()) => { const d = new Date(ts); return `${d.getHours()}:${pad(d.getMinutes())}`; };
const shortTime = ts => { const d = new Date(ts); return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };

function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k === 'svg') e.innerHTML = v; // only ever fed constant SVG strings from ICONS
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else if (k === 'style' && isObj(v)) Object.assign(e.style, v);
      else if (k === 'dataset') Object.assign(e.dataset, v);
      else if (k in e && typeof v !== 'string') e[k] = v;
      else e.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return e;
}

/* ------------------------------------------------------------------ icons (original artwork) */
const S_ATTR = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
const ICONS = {
  mask: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.4 3.6h13.2a3.2 3.2 0 0 1 3.2 3.2v8a3.2 3.2 0 0 1-3.2 3.2h-6l-4.4 3.3c-.6.45-1.4 0-1.4-.7v-2.6H5.4a3.2 3.2 0 0 1-3.2-3.2v-8a3.2 3.2 0 0 1 3.2-3.2z" fill="currentColor" fill-opacity=".16" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path fill="currentColor" fill-rule="evenodd" d="M5.3 8.2c2-1.15 4.6-1 6.7.45 2.1-1.45 4.7-1.6 6.7-.45.45 2.35-.55 4.5-2.45 5.1-1.55.5-3.1-.1-4.25-1.35-1.15 1.25-2.7 1.85-4.25 1.35-1.9-.6-2.9-2.75-2.45-5.1zm2.35 2.05c.8-.75 2.1-.75 2.9 0-.8.75-2.1.75-2.9 0zm5.8 0c.8-.75 2.1-.75 2.9 0-.8.75-2.1.75-2.9 0z"/></svg>`,
  list: `<svg ${S_ATTR}><path d="M9 6h11M9 12h11M9 18h11"/><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" stroke-width="2.6"/></svg>`,
  grid: `<svg ${S_ATTR}><rect x="4" y="4" width="6.5" height="6.5" rx="1.4"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.4"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.4"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.4"/></svg>`,
  compose: `<svg ${S_ATTR}><path d="M12 4H6.5A2.5 2.5 0 0 0 4 6.5v11A2.5 2.5 0 0 0 6.5 20h11a2.5 2.5 0 0 0 2.5-2.5V12"/><path d="M17.6 3.6a2 2 0 0 1 2.8 2.8L12.5 14.3l-3.6.8.8-3.6z"/></svg>`,
  sliders: `<svg ${S_ATTR}><path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/></svg>`,
  back: `<svg ${S_ATTR}><path d="M14.5 5.5 8 12l6.5 6.5"/></svg>`,
  close: `<svg ${S_ATTR}><path d="M6.5 9.5 12 15l5.5-5.5"/></svg>`,
  more: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5.5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="18.5" cy="12" r="1.8"/></svg>`,
  top: `<svg ${S_ATTR}><path d="M5 4.5h14M12 20V9.5M7.5 13.5 12 9l4.5 4.5"/></svg>`,
  bottom: `<svg ${S_ATTR}><path d="M5 19.5h14M12 4v10.5M7.5 10.5 12 15l4.5-4.5"/></svg>`,
  refresh: `<svg ${S_ATTR}><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v4.6h-4.6"/></svg>`,
  write: `<svg ${S_ATTR}><path d="M4.5 19.5h4L19 9a2.6 2.6 0 0 0-3.7-3.7L4.5 15.5z"/><path d="M13.8 6.8l3.4 3.4"/></svg>`,
  signal: `<svg viewBox="0 0 20 14" fill="currentColor" aria-hidden="true"><rect x="0" y="9" width="3.4" height="5" rx="1"/><rect x="5.4" y="6.2" width="3.4" height="7.8" rx="1"/><rect x="10.8" y="3.2" width="3.4" height="10.8" rx="1"/><rect x="16.2" y="0" width="3.4" height="14" rx="1"/></svg>`,
  wifi: `<svg viewBox="0 0 18 14" fill="currentColor" aria-hidden="true"><path d="M9 2.4c2.6 0 5 1 6.8 2.7l1.3-1.4A11.4 11.4 0 0 0 9 .5 11.4 11.4 0 0 0 .9 3.7l1.3 1.4A9.6 9.6 0 0 1 9 2.4zm0 3.7c1.6 0 3.1.6 4.2 1.7l1.3-1.4A7.8 7.8 0 0 0 9 4.2 7.8 7.8 0 0 0 3.5 6.4l1.3 1.4A6 6 0 0 1 9 6.1zm0 3.6c.7 0 1.3.3 1.8.7L9 12.3l-1.8-1.9c.5-.4 1.1-.7 1.8-.7z"/></svg>`,
  battery: `<svg viewBox="0 0 27 13" aria-hidden="true"><rect x=".6" y=".6" width="22.6" height="11.8" rx="3.4" fill="none" stroke="currentColor" stroke-opacity=".45" stroke-width="1.1"/><rect x="2.4" y="2.4" width="16.4" height="8.2" rx="1.9" fill="currentColor"/><path d="M24.6 4.4v4.2c.9-.3 1.5-1.1 1.5-2.1s-.6-1.8-1.5-2.1z" fill="currentColor" fill-opacity=".45"/></svg>`,
};
const icon = (name, cls = 'ab-ic') => h('span', { class: cls, svg: ICONS[name] });

/* ------------------------------------------------------------------ forum copy */
const UI = {
  '2ch': {
    board: 'ニュー速VIP', boardSub: '2ch掲示板', defaultName: '名無しさん',
    tabList: 'スレ一覧', tabNew: 'スレ立て', tabSettings: '設定',
    catalog: 'スレ一覧', top: '先頭', bottom: '末尾', update: '新着', write: '書く',
    newThread: '新規スレッド作成', reply: '書き込み',
    fName: '名前', fMail: 'E-mail', fTitle: 'タイトル', fBody: '本文',
    phMail: '（省略可）', phTitle: 'スレタイ', phBody: '>>1 の本文', phReply: 'レス内容',
    submitThread: '新規スレッド作成', submitReply: '書き込む', cancel: 'キャンセル',
    autoFetch: '書き込み後に新着を取得',
    empty: 'まだスレッドがありません。', emptyCta: 'スレを立てる',
    noPosts: 'まだレスがありません。', fetching: '新着レスを取得中', divider: 'ここから新着',
    replyTo: n => `>>${n} に返信`, showReplies: n => `このレスへの返信（${n}）`, copy: '本文をコピー', del: 'あぼーん（削除）',
    copyThread: 'スレ全体をコピー', delThread: 'このスレを削除',
    delThreadQ: 'このスレッドと全レスを削除しますか？', delPostQ: n => `>>${n} をあぼーんしますか？`, delOk: '削除',
    res: n => `${n}レス`, momentum: '勢い', newCount: n => `新着${n}`,
    over: 'このスレッドは1000を超えました。\nもう書けないので、新しいスレッドを立ててください。',
    got: n => `新着レス ${n}件`, gotElsewhere: (n, title) => `「${title}」に新着 ${n}件`,
    copied: 'コピーしました', jumpNew: n => `新着 ${n}件`, deleted: 'あぼーん',
    needBody: '本文を入力してください', needTitle: 'タイトルを入力してください', posted: '書き込みました',
    tooLong: '本文が長すぎます（3000文字まで）',
    stop: '中止', stopping: 'このバッチが終わったら止めます', stopped: n => `中止しました（${n}件取得）`,
  },
  '4ch': {
    board: '/b/ - Random', boardSub: 'Anonymous imageboard', defaultName: 'Anonymous',
    tabList: 'Catalog', tabNew: 'New thread', tabSettings: 'Settings',
    catalog: 'Catalog', top: 'Top', bottom: 'Bottom', update: 'Update', write: 'Reply',
    newThread: 'Start a New Thread', reply: 'Reply to Thread',
    fName: 'Name', fMail: 'Options', fTitle: 'Subject', fBody: 'Comment',
    phMail: 'sage', phTitle: '', phBody: '', phReply: '',
    submitThread: 'Post', submitReply: 'Post', cancel: 'Cancel',
    autoFetch: 'Update after posting',
    empty: 'No threads yet.', emptyCta: 'Start a thread',
    noPosts: 'No replies yet.', fetching: 'Updating', divider: 'New replies',
    replyTo: n => `Quote >>${n}`, showReplies: n => `Replies (${n})`, copy: 'Copy text', del: 'Delete post',
    copyThread: 'Copy thread as text', delThread: 'Delete thread',
    delThreadQ: 'Delete this thread and every reply in it?', delPostQ: n => `Delete post No.${n}?`, delOk: 'Delete',
    res: n => `R: ${n}`, momentum: '', newCount: n => `${n} new`,
    over: 'Thread is archived (1000 posts).\nStart a new thread to keep posting.',
    got: n => `${n} new ${n === 1 ? 'reply' : 'replies'}`, gotElsewhere: (n, title) => `${n} new in “${title}”`,
    copied: 'Copied', jumpNew: n => `${n} new`, deleted: '[deleted]',
    needBody: 'Comment field is empty', needTitle: 'Subject is empty', posted: 'Post successful',
    tooLong: 'Comment is too long (3000 characters max)',
    stop: 'Stop', stopping: 'Stopping after this batch', stopped: n => `Stopped (${n} new)`,
  },
};

/* ------------------------------------------------------------------ boards
   Each board has its own default poster name, a vibe line that goes into the prompt (in the forum's language),
   and a short Chinese description for the picker. 4chan worksafe boards use the blue Yotsuba B style. */
const BOARDS = {
  '2ch': [
    { id: 'news4vip', name: 'ニュー速VIP', short: 'VIP', anon: '以下、名無しにかわりましてVIPがお送りします', desc: '什么都聊：闲聊、整活、安価、求助',
      vibe: 'VIPPERのノリ。ネタスレ、安価（「>>5が決める」）、「kwsk」「うｐ」「支援」、AAや顔文字が多め。悪ノリするが根は暇人の集まりで、たまに妙に親切。' },
    { id: 'livejupiter', name: 'なんでも実況J', short: 'なんJ', anon: '風吹けば名無し', desc: '棒球和闲聊，满屏なんJ语',
      vibe: 'なんJ民のノリ。「ワイ」「〜ンゴ」「〜やで」「〜で草」「ニキ／ネキ」「彡(ﾟ)(ﾟ)」「(ヽ´ん`)」、何でも野球や身内ネタに絡める。スレタイ大喜利と煽り合いが多い。' },
    { id: 'newsplus', name: 'ニュース速報+', short: 'ニュー速+', anon: '名無しさん', desc: '时事新闻讨论',
      vibe: '時事ニュースとして扱う。「ソースは？」、皮肉、陰謀論っぽい書き込み、長文で語る人と一行で切り捨てる人が混在。差別的な書き込みはしない。' },
    { id: 'mnewsplus', name: '芸スポ速報+', short: '芸スポ', anon: '名無しさん＠恐縮です', desc: '娱乐圈、体育八卦',
      vibe: '芸能・有名人の話題として盛り上がる。「誰？」「劣化した」「ステマ乙」「事務所の力」、ファンとアンチの言い合い。実在の人物名は出さない。' },
    { id: 'loveplus', name: '恋愛サロン', short: '恋愛', anon: '恋する名無しさん', desc: '恋爱咨询、秀恩爱、失恋',
      vibe: '恋愛相談板。親身なアドバイス、経験談の自分語り、「脈あり／脈なし」判定、「リア充爆発しろ」、厳しい現実を突きつける人。' },
    { id: 'occult', name: 'オカルト', short: 'オカ板', anon: '本当にあった怖い名無し', desc: '怪谈、都市传说、灵异体验',
      vibe: '洒落怖・体験談の文化。「続きはよ」「創作乙」「釣りだろ」、霊感持ちを名乗る人、科学で否定する人。不気味さを楽しむ。' },
    { id: 'campus', name: '大学生活', short: '大学', anon: '学生さんは名前がない', desc: '校园生活、社团、学分',
      vibe: '学生のノリ。単位・レポート・サークル・バイト・ぼっちネタ、「リア充」「ぼっち飯」、学歴いじり。' },
    { id: 'anime', name: 'アニメ', short: 'アニメ', anon: '風の谷の名無しさん＠実況は実況板で', desc: '动画感想、考据',
      vibe: 'アニメ視聴者。作画・声優・考察・円盤の売上の話、「神回」「作画崩壊」「〇〇は俺の嫁」、原作厨とアニメ勢の対立。' },
  ],
  '4ch': [
    { id: 'b', name: '/b/ - Random', short: '/b/', anon: 'Anonymous', ws: false, desc: '随机版，什么都有，最混乱',
      vibe: 'Pure chaos: shitposting, greentext stories, rolling for dubs and trips, derailing everything, OP gets no mercy.' },
    { id: 'a', name: '/a/ - Anime & Manga', short: '/a/', anon: 'Anonymous', ws: true, desc: '动画和漫画',
      vibe: 'Seasonal anime talk, best girl wars, manga readers lording spoilers over anime-onlys, "this is peak", "dropped", reaction images described in words.' },
    { id: 'v', name: '/v/ - Video Games', short: '/v/', anon: 'Anonymous', ws: true, desc: '电子游戏',
      vibe: 'Console war bait, "it\'s shit", "play the game", contrarian reviews of beloved games, everyone pretending they never have fun.' },
    { id: 'tv', name: '/tv/ - Television & Film', short: '/tv/', anon: 'Anonymous', ws: true, desc: '电视剧和电影',
      vibe: 'Film and TV talk, "kino" versus trash, hating on superhero movies, ironic shilling, plot holes argued for hours.' },
    { id: 'mu', name: '/mu/ - Music', short: '/mu/', anon: 'Anonymous', ws: true, desc: '音乐',
      vibe: 'Taste gatekeeping, patrician versus pleb, unsolicited album recommendations, "post your charts", obscure bands nobody else has heard of.' },
    { id: 'lit', name: '/lit/ - Literature', short: '/lit/', anon: 'Anonymous', ws: true, desc: '文学和读书',
      vibe: 'Pretentious recommendations, "start with the Greeks", contempt for popular bestsellers, someone writing a novel they will never finish.' },
    { id: 'adv', name: '/adv/ - Advice', short: '/adv/', anon: 'Anonymous', ws: true, desc: '求助和人生/感情建议',
      vibe: 'Anons ask for life and relationship advice. Replies range from genuinely helpful to brutally honest to "just talk to her"; OP gets interrogated for details and called out for leaving things out.' },
    { id: 'x', name: '/x/ - Paranormal', short: '/x/', anon: 'Anonymous', ws: true, desc: '灵异、超自然、阴谋论',
      vibe: 'Creepy stories and "post more", believers versus skeptics, someone sure it is a skinwalker, people claiming the thread is being watched, LARPers.' },
    { id: 'fit', name: '/fit/ - Fitness', short: '/fit/', anon: 'Anonymous', ws: true, desc: '健身',
      vibe: 'Lifting talk, "post body", "eat more", "just lift", routine wars, everything turned into a fitness problem.' },
    { id: 'ck', name: '/ck/ - Food & Cooking', short: '/ck/', anon: 'Anonymous', ws: true, desc: '美食和做饭',
      vibe: 'Food and cooking, "rate my meal", "that\'s raw", fights about pineapple on pizza and well-done steak, someone eating something cursed.' },
  ],
};
const DEFAULT_SUB = { '2ch': 'news4vip', '4ch': 'b' };
const boardsFor = forum => [...BOARDS[forum], ...((S?.customBoards?.[forum]) || [])];
const boardDef = (forum, id) => boardsFor(forum).find(b => b.id === id) || BOARDS[forum][0];
const curSub = forum => boardDef(forum, S.sub?.[forum]).id;
const boardOf = t => boardDef(t.board, t.sub);
const anonOf = (forum, bd) => clean(bd?.anon) || UI[forum].defaultName;

/* ------------------------------------------------------------------ state */
const DEFAULTS = {
  v: 2,
  board: '2ch',
  screen: 'list',
  selected: null,
  threads: [],
  count: 5,
  autoFetch: true,
  ctx: { mode: 'recent', n: 8 },
  lore: '',
  lang: { '2ch': 'auto', '4ch': 'auto' },
  theme: 'classic',
  names: { '2ch': { name: '', mail: '' }, '4ch': { name: '', mail: '' } },
  fab: { side: 'right', y: 0.6, tucked: false, autoTuck: false, hidden: false, hinted: false },
  win: { x: null, y: null, w: 380, h: 760 },
  pid4: 0,
  // AI source: 'st' follows SillyTavern's current connection; 'custom' is the plugin's own OpenAI-compatible API.
  api: { mode: 'st', url: '', key: '', model: '', route: 'proxy', temp: 1 },
  // Forum clock: 'auto' follows the date/time written in the roleplay, 'manual' runs from a set moment, 'real' = device time.
  clock: { mode: 'auto', manual: null, manualAt: null },
  // Board being browsed in each forum, and boards the user made up (e.g. an in-story school forum).
  sub: { '2ch': 'news4vip', '4ch': 'b' },
  customBoards: { '2ch': [], '4ch': [] },
  tone: 'normal', // 'gentle' | 'normal' | 'harsh'
};

let S;
let migratedCount = 0;

function migrateV1() {
  let old = null;
  try { old = JSON.parse(localStorage.getItem(LEGACY_KEY) || 'null'); } catch { return null; }
  if (!old || !Array.isArray(old.threads)) return null;
  const board = old.skin === '4ch' ? '4ch' : '2ch';
  migratedCount = old.threads.length;
  // v0.1 desktop window coordinates are deliberately NOT carried over: they pushed the panel off phone screens.
  return {
    board,
    count: Number(old.count) || 5,
    ctx: { mode: ['none', 'recent', 'summary'].includes(old.context) ? old.context : 'recent', n: 8 },
    selected: old.selected || null,
    threads: old.threads.map(t => ({
      id: t.id, board, title: t.title, created: Date.now(),
      posts: (t.posts || []).map(p => ({ no: p.no, name: p.name, text: p.text, tsText: typeof p.ts === 'string' ? p.ts : undefined, you: !!p.author })),
    })),
  };
}

function nextPid() {
  S.pid4 += Math.random() < 0.15 ? rand(40, 400) : rand(1, 38);
  return S.pid4;
}

function normThread(t) {
  const board = t.board === '4ch' ? '4ch' : '2ch';
  const created = Number(t.created) || Date.now();
  const out = {
    id: String(t.id || uuid()), board, sub: boardsFor(board).some(b => b.id === t.sub) ? t.sub : DEFAULT_SUB[board], title: bound(t.title, 120), created,
    bumped: Number(t.bumped) || created, userUid: t.userUid || makeUid(), unread: Number(t.unread) || 0, posts: [],
  };
  const legacyIds = new Map();
  (Array.isArray(t.posts) ? t.posts : []).forEach((p, i) => {
    if (!p) return;
    const no = i + 1;
    const ts = Number(p.ts) || created;
    let pid = Number(p.pid);
    if (board === '2ch') pid = no;
    else if (!pid) pid = nextPid();
    let uid = p.uid;
    if (board === '2ch' && !uid) {
      if (p.you) uid = out.userUid;
      else { const k = String(p.name || ''); uid = legacyIds.get(k) || makeUid(); legacyIds.set(k, uid); }
    }
    out.posts.push({
      no, pid, name: bound(p.name || UI[board].defaultName, 40), mail: p.mail === 'sage' ? 'sage' : '',
      uid: board === '2ch' ? uid : undefined, text: normText(p.text), ts, tsText: p.tsText || undefined,
      you: !!p.you, del: !!p.del,
    });
  });
  return out;
}

function load() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { console.warn('[AnonymousBoard] Could not read saved data', e); }
  if (!raw) raw = migrateV1();
  S = merge(clone(DEFAULTS), raw || {});
  if (!['2ch', '4ch'].includes(S.board)) S.board = '2ch';
  if (!['list', 'thread', 'new', 'settings'].includes(S.screen)) S.screen = 'list';
  if (!['classic', 'dark', 'auto'].includes(S.theme)) S.theme = 'classic';
  if (!['none', 'recent', 'summary'].includes(S.ctx.mode)) S.ctx.mode = 'recent';
  S.count = clamp(Math.round(Number(S.count) || 5), 1, 200);
  S.ctx.n = clamp(Number(S.ctx.n) || 8, 2, 30);
  if (!['st', 'custom'].includes(S.api.mode)) S.api.mode = 'st';
  if (!['auto', 'manual', 'real'].includes(S.clock.mode)) S.clock.mode = 'auto';
  if (!TONES.includes(S.tone)) S.tone = 'normal';
  for (const f of ['2ch', '4ch']) {
    S.customBoards[f] = (Array.isArray(S.customBoards[f]) ? S.customBoards[f] : [])
      .filter(b => b && b.id && clean(b.name))
      .map(b => ({ id: String(b.id), name: bound(b.name, 60), short: bound(b.short || b.name, 16), anon: bound(b.anon, 40), desc: bound(b.desc, 60), vibe: bound(b.vibe, 1200), ws: b.ws !== false, custom: true }));
    if (!boardsFor(f).some(b => b.id === S.sub[f])) S.sub[f] = DEFAULT_SUB[f];
  }
  if (!Number.isFinite(S.clock.manual)) S.clock.manual = null;
  if (!['proxy', 'direct'].includes(S.api.route)) S.api.route = 'proxy';
  S.api.temp = clamp(Number.isFinite(+S.api.temp) ? +S.api.temp : 1, 0, 2);
  for (const k of ['url', 'key', 'model']) S.api[k] = String(S.api[k] ?? '');
  if (!S.pid4) S.pid4 = 930000000 + rand(0, 5000000);
  S.threads = (Array.isArray(S.threads) ? S.threads : []).filter(t => t && t.id).map(normThread);
  if (S.selected && !S.threads.some(t => t.id === S.selected)) S.selected = null;
  if (S.screen === 'thread' && !S.selected) S.screen = 'list';
  if (migratedCount) save();
}

let saveFailedOnce = false;
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(S));
    saveFailedOnce = false;
  } catch (e) {
    console.warn('[AnonymousBoard] Save failed', e);
    if (!saveFailedOnce) toast('浏览器存储已满，帖子没能保存。请在设置里导出备份后删除旧帖。', 'error');
    saveFailedOnce = true;
  }
}

/* runtime-only UI state */
const ui = {
  open: false, compact: false, dividerAt: null, drafts: {}, newDraft: {}, layers: [],
  clock: null, busy: new Map(), lastScroll: {},
};
const R = {};
const current = () => S.threads.find(t => t.id === S.selected) || null;
const byId = id => S.threads.find(t => t.id === id) || null;
const L = () => UI[S.board];
const visiblePosts = t => t.posts.filter(p => !(t.board === '4ch' && p.del));

/* ------------------------------------------------------------------ SillyTavern bridge */
const ST = () => { try { return globalThis.SillyTavern?.getContext?.() || null; } catch { return null; } };

function stripMarkup(s) { return String(s || '').replace(/<[^>]*>/g, ' ').replace(/[ \t]+/g, ' ').trim(); }

function readRpContext() {
  if (S.ctx.mode === 'none') return '';
  const c = ST();
  if (!c) return '';
  try {
    const chat = Array.isArray(c.chat) ? c.chat : [];
    if (S.ctx.mode === 'summary') {
      for (let i = chat.length - 1; i >= 0; i--) {
        const m = chat[i]?.extra?.memory;
        if (m) return bound(m, 3000);
      }
    }
    const msgs = chat.filter(m => m && !m.is_system && m.mes).slice(-S.ctx.n)
      .map(m => `${m.name || (m.is_user ? 'User' : 'Character')}: ${bound(stripMarkup(m.mes), 700)}`);
    return msgs.join('\n').slice(-5200);
  } catch (e) {
    console.warn('[AnonymousBoard] Could not read chat context', e);
    return '';
  }
}

/* ------------------------------------------------------------------ story clock (BEGIN) */
/* The forum lives at the story's date, not the real one. Dates and times the roleplay itself writes down
   (status lines, narration, the author's note, the card's scenario) are read locally; nothing is sent anywhere. */
const CN_DIGITS = { '〇': 0, '零': 0, '一': 1, '二': 2, '两': 2, '兩': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };
function cnNum(s) {
  s = String(s ?? '');
  if (/^\d+$/.test(s)) return +s;
  if (/^[〇零一二三四五六七八九]{4}$/.test(s)) return +[...s].map(c => CN_DIGITS[c]).join('');
  const m = s.match(/^([一二两三四五六七八九])?十([一二三四五六七八九])?$/);
  if (m) return (m[1] ? CN_DIGITS[m[1]] : 1) * 10 + (m[2] ? CN_DIGITS[m[2]] : 0);
  if (s.length === 1 && s in CN_DIGITS) return CN_DIGITS[s];
  return NaN;
}
const MONTHS_EN = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const ERA_BASE = { '明治': 1867, '大正': 1911, '昭和': 1925, '平成': 1988, '令和': 2018 };
const RX_NUM = '(\\d{1,2}|[一二两三四五六七八九十]{1,3})';
const RX_YEAR = '(\\d{4}|[〇零一二三四五六七八九]{4})';
const RX_MON_EN = '(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sept?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';
const RX_PERIOD = '(上午|下午|晚上|夜里|夜裡|夜晚|夜间|凌晨|中午|正午|早上|早晨|清晨|傍晚|黄昏|深夜|半夜|午前|午後|夕方|朝|昼|夜)';
const monEn = s => MONTHS_EN[String(s).slice(0, 3).toLowerCase()];
/* Rules run in this order; a later rule never reuses text an earlier one already matched. */
const DATE_RULES = [
  { re: new RegExp(`(?:公元|西元|西暦)?${RX_YEAR}\\s*年\\s*${RX_NUM}\\s*月\\s*${RX_NUM}\\s*[日号號]?`, 'g'), base: 7, get: m => ({ y: cnNum(m[1]), mo: cnNum(m[2]), d: cnNum(m[3]) }) },
  { re: new RegExp(`(明治|大正|昭和|平成|令和)\\s*(元|\\d{1,2}|[一二三四五六七八九十]{1,3})\\s*年(?:\\s*${RX_NUM}\\s*月(?:\\s*${RX_NUM}\\s*日)?)?`, 'g'), base: 7, get: m => ({ y: ERA_BASE[m[1]] + (m[2] === '元' ? 1 : cnNum(m[2])), mo: m[3] ? cnNum(m[3]) : undefined, d: m[4] ? cnNum(m[4]) : undefined }) },
  { re: /(^|[^\d])(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?!\d)/g, base: 7, lead: 1, get: m => ({ y: +m[2], mo: +m[3], d: +m[4] }) },
  { re: new RegExp(`\\b${RX_MON_EN}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(\\d{4})\\b)?`, 'gi'), base: 5, get: m => ({ mo: monEn(m[1]), d: +m[2], y: m[3] ? +m[3] : undefined }) },
  { re: new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${RX_MON_EN}\\b\\.?(?:,?\\s+(\\d{4})\\b)?`, 'gi'), base: 5, get: m => ({ d: +m[1], mo: monEn(m[2]), y: m[3] ? +m[3] : undefined }) },
  { re: new RegExp(`${RX_NUM}\\s*月\\s*${RX_NUM}\\s*[日号號]`, 'g'), base: 4, get: m => ({ mo: cnNum(m[1]), d: cnNum(m[2]) }) },
  { re: new RegExp(`(?:公元|西元|西暦)?${RX_YEAR}\\s*年(?!代|前|後|后|間|间|来|來|级|級|生|度|頃|左右|内|內)`, 'g'), base: 3, yearOnly: true, get: m => ({ y: cnNum(m[1]) }) },
  { re: /\b(?:year|anno|AD)\s*[:：]?\s*((?:1\d|2\d)\d{2})\b/gi, base: 3, yearOnly: true, get: m => ({ y: +m[1] }) },
  { re: /\b[Ii]n\s+((?:1[5-9]|2[0-2])\d{2})\b/g, base: 1, yearOnly: true, get: m => ({ y: +m[1] }) },
];
const TIME_RULES = [
  { re: new RegExp(`(^|[^\\d:])(?:${RX_PERIOD}\\s*)?(\\d{1,2})\\s*:\\s*(\\d{2})(?:\\s*:\\s*\\d{2})?(?:\\s*([AaPp])\\.?\\s*[Mm]\\b\\.?)?(?![\\d:])`, 'g'), base: 5, lead: 1, get: m => ({ p: m[2], h: +m[3], mi: +m[4], ap: m[5], strong: true }) },
  { re: new RegExp(`(?:${RX_PERIOD}\\s*)?(\\d{1,2}|[一二两三四五六七八九十]{1,3})\\s*[点點時时](?![间間候代期])(?:\\s*(\\d{1,2}|[一二三四五六七八九十]{1,3})\\s*分|\\s*(半)|\\s*(整|钟|鐘))?`, 'g'), base: 3, get: m => ({ p: m[1], h: cnNum(m[2]), mi: m[3] ? cnNum(m[3]) : m[4] ? 30 : 0, cjk: !/^\d/.test(m[2]), strong: !!(m[1] || m[3] || m[4] || m[5]) }) },
  { re: /\b(\d{1,2})\s*([ap])\.?m\b\.?/gi, base: 4, get: m => ({ h: +m[1], mi: 0, ap: m[2], strong: true }) },
  { re: /\b(\d{1,2})\s+o'clock\b/gi, base: 3, get: m => ({ h: +m[1], mi: 0, strong: true }) },
];
const RX_LABEL = /(时间|時間|日期|日付|时刻|時刻|现在|現在|当前|今天|今日|Time|Date|Now|Today|📅|🗓|📆|⏰|⏱|⌚|🕰|[\u{1F550}-\u{1F567}])/iu;
/* a bare year right after these words is someone's past, not the story's present */
const RX_PAST_YEAR = /(出生|生于|生於|诞生|誕生|毕业|畢業|卒業|入学|入學|结婚|結婚|去世|逝世|born|graduated|died|married|since)\s*(?:in|于|於|在)?\s*$/i;
const RX_WEEKDAY = /(星期|礼拜|禮拜|周|週)[一二三四五六日天]|[（(][月火水木金土日](?:曜日?)?[)）]|[月火水木金土日]曜日?|\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*\b/i;

/* 12-hour words → 24-hour clock. "晚上9点" = 21, "夜里2点" = 2, "中午1点" = 13, "12 am" = 0. */
function to24(h, p = '', ap = '') {
  if (!Number.isFinite(h) || h > 24) return NaN;
  if (ap) { const pm = /p/i.test(ap); if (h > 12) return NaN; return pm ? (h % 12) + 12 : h % 12; }
  if (/下午|傍晚|黄昏|午後|夕方/.test(p)) return h < 12 ? h + 12 : h;
  if (/^(晚上|夜晚|夜里|夜裡|夜间|夜)$/.test(p)) return h === 12 ? 0 : h >= 6 && h < 12 ? h + 12 : h;
  if (/深夜|半夜|凌晨/.test(p)) return h === 12 ? 0 : h >= 9 && h < 12 ? h + 12 : h;
  if (/上午|早上|早晨|清晨|午前|朝/.test(p)) return h === 12 ? 0 : h;
  if (/中午|正午|昼/.test(p)) return h <= 5 ? h + 12 : h;
  return h === 24 ? 0 : h;
}
function validDate({ y, mo, d }) {
  if (y !== undefined && !(y >= 1000 && y <= 2999)) return false;
  if (mo === undefined && d === undefined) return y !== undefined;
  if (!(mo >= 1 && mo <= 12 && d >= 1 && d <= 31)) return false;
  const t = new Date(y ?? 2000, mo - 1, d);
  return t.getMonth() === mo - 1;
}
const snippetAt = (text, i, j) => oneLine(text.slice(Math.max(0, i - 14), Math.min(text.length, j + 22)));

/* Best date / year / time written in one piece of text. strict = only explicitly labelled ones (card descriptions). */
function scanText(raw, strict = false) {
  const text = String(raw || '').replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/[：]/g, ':');
  const taken = [];
  const free = (a, b) => !taken.some(([x, y]) => a < y && b > x);
  const labelled = i => RX_LABEL.test(text.slice(Math.max(0, i - 12), i));
  const dates = [];
  for (const rule of DATE_RULES) {
    rule.re.lastIndex = 0;
    for (const m of text.matchAll(rule.re)) {
      const start = m.index + (rule.lead ? m[rule.lead].length : 0), end = m.index + m[0].length;
      if (!free(start, end)) continue;
      const v = rule.get(m);
      if (!validDate(v)) continue;
      taken.push([start, end]);
      if (rule.yearOnly && RX_PAST_YEAR.test(text.slice(Math.max(0, start - 10), start))) continue;
      let score = rule.base + (labelled(start) ? 4 : 0) + (RX_WEEKDAY.test(text.slice(end, end + 12)) ? 2 : 0);
      if (strict && !labelled(start)) continue;
      dates.push({ ...v, start, end, score });
    }
  }
  const times = [];
  for (const rule of TIME_RULES) {
    rule.re.lastIndex = 0;
    for (const m of text.matchAll(rule.re)) {
      const start = m.index + (rule.lead ? m[rule.lead].length : 0), end = m.index + m[0].length;
      if (!free(start, end)) continue;
      const v = rule.get(m);
      if (v.cjk && !v.strong) continue; // "一点" / "两点" are usually "a little" / "two points"
      const hh = to24(v.h, v.p || '', v.ap || '');
      if (!Number.isFinite(hh) || hh > 23 || !(v.mi >= 0 && v.mi < 60)) continue;
      taken.push([start, end]);
      const nearDate = dates.some(d => start >= d.end - 1 && start - d.end <= 30);
      let score = (v.strong ? rule.base : 1) + (labelled(start) ? 4 : 0) + (nearDate ? 3 : 0);
      if (strict && !labelled(start) && !nearDate) continue;
      times.push({ hh, mm: v.mi, start, end, score });
    }
  }
  for (const d of dates) if (times.some(t => t.start >= d.end - 1 && t.start - d.end <= 30)) d.score += 3;
  const best = list => list.reduce((a, b) => (!a || b.score > a.score || (b.score === a.score && b.start > a.start) ? b : a), null);
  const date = best(dates.filter(d => d.mo !== undefined));
  const year = best(dates.filter(d => d.y !== undefined));
  const time = best(times);
  const cut = c => c && { ...c, snippet: snippetAt(text, c.start, c.end) };
  return { date: cut(date), year: cut(year), time: cut(time) };
}

function storySources(c) {
  const out = [];
  const chat = Array.isArray(c?.chat) ? c.chat : [];
  let n = 0;
  for (let i = chat.length - 1; i >= 0 && n < 40; i--) {
    const m = chat[i];
    if (!m || typeof m.mes !== 'string' || !m.mes.trim()) continue;
    n++;
    out.push({ label: n === 1 ? '最新一条消息' : `倒数第 ${n} 条消息`, text: stripMarkup(m.mes).slice(0, 8000) });
  }
  const note = c?.chatMetadata?.note_prompt;
  if (note) out.push({ label: '作者注释', text: String(note) });
  const ch = c?.characters?.[c?.characterId];
  if (ch) {
    const scenario = ch.scenario || ch.data?.scenario;
    if (scenario) out.push({ label: '角色卡「场景」', text: String(scenario) });
    const desc = ch.description || ch.data?.description;
    if (desc) out.push({ label: '角色卡「描述」', text: String(desc), strict: true });
  }
  return out;
}

const RX_NEXT_DAY = /第二天|次日|隔天|隔日|翌日|翌朝|次の日|明くる日|the next (?:day|morning)|next morning|the following (?:day|morning)/i;

/* Newest information wins: the date from the newest source that has one, a time no older than that date,
   and the year from the date itself or else the newest believable year anywhere (e.g. the card's scenario).
   Messages newer than the dated one can move the day on: "第二天…" / "the next morning", or a clock time
   earlier than the one written next to the date (21:30 on the 14th, then "早上8点" → the 15th). */
function detectStoryTime(c) {
  const sources = storySources(c);
  let date = null, time = null;
  const years = [];
  sources.forEach((src, i) => {
    const r = scanText(src.text, src.strict);
    if (!date && r.date) date = { ...r.date, src, i, own: r.time };
    if (!time && r.time && !(date && date.i < i)) time = { ...r.time, src, i };
    if (r.year) years.push({ ...r.year, src, i });
  });
  let year = date?.y !== undefined ? { y: date.y, src: date.src, snippet: date.snippet } : null;
  if (!year && years.length) year = years.find(y => y.score >= 3) || years[0];
  if (!date && !time && !year) return null;
  let roll = 0, rollWhy = '';
  if (date) {
    roll = sources.slice(0, date.i).filter(s => RX_NEXT_DAY.test(s.text)).length;
    if (roll) rollWhy = `之后的消息里说到「第二天」，日期顺延 ${roll} 天`;
    else if (time && time.i < date.i && date.own && time.hh * 60 + time.mm < date.own.hh * 60 + date.own.mm) {
      roll = 1;
      rollWhy = '之后消息里的钟点比那天写的更早，按第二天算';
    }
    roll = Math.min(roll, 7);
  }
  const info = { y: year?.y, mo: date?.mo, d: date?.d, roll, hh: time?.hh, mm: time?.mm, notes: [] };
  info.key = `${info.y ?? '?'}-${info.mo ?? '?'}-${info.d ?? '?'}+${roll} ${info.hh ?? '?'}:${info.mm ?? '?'}`;
  const where = x => `${x.src.label}「…${x.snippet}…」`;
  if (date && time && date.src === time.src) info.notes.push(`日期和时间：${where(date)}`);
  else {
    if (date) info.notes.push(`日期：${where(date)}`);
    if (time) info.notes.push(`时间：${where(time)}`);
  }
  if (year && (!date || date.y === undefined)) info.notes.push(`年份：${where(year)}`);
  if (roll) info.notes.push(`（${rollWhy}）`);
  const missing = [!year && '年份', !date && '月日', !time && '钟点'].filter(Boolean);
  if (missing.length) info.notes.push(`没找到${missing.join('、')}，这部分先用现实时间补上。`);
  return info;
}
/* ------------------------------------------------------------------ story clock (END) */

/* Forum clock. Follow-story mode anchors to the detected moment and then ticks like a real clock (capped,
   so a quiet chat does not let the forum run hours ahead); a new time in the chat re-anchors it. */
const STORY_DRIFT_MAX = 3 * 3600e3;
const storyClock = { sig: null, info: null, anchor: null };

function refreshStory(force = false) {
  const c = ST();
  const chat = Array.isArray(c?.chat) ? c.chat : [];
  const last = String(chat[chat.length - 1]?.mes || '');
  const sig = [c?.chatId, c?.characterId, c?.groupId, chat.length, last.length, hash(last.slice(-3000)), String(c?.chatMetadata?.note_prompt || '').length].join('|');
  if (!force && sig === storyClock.sig) return storyClock.info;
  storyClock.sig = sig;
  let info = null;
  try { info = c ? detectStoryTime(c) : null; } catch (e) { console.warn('[AnonymousBoard] story time detection failed', e); }
  storyClock.info = info;
  if (!info) { storyClock.anchor = null; return null; }
  if (storyClock.anchor?.key !== info.key) {
    const now = new Date();
    const at = new Date(info.y ?? now.getFullYear(), (info.mo ?? now.getMonth() + 1) - 1, (info.d ?? now.getDate()) + (info.roll || 0),
      info.hh ?? now.getHours(), info.mm ?? now.getMinutes(), info.hh === undefined ? now.getSeconds() : 0);
    storyClock.anchor = { key: info.key, story: at.getTime(), real: Date.now() };
  }
  return info;
}

function forumNow(mode = S.clock.mode) {
  if (mode === 'real') return Date.now();
  if (mode === 'manual') return S.clock.manual != null ? S.clock.manual + Math.max(0, Date.now() - (S.clock.manualAt || Date.now())) : Date.now();
  refreshStory();
  const a = storyClock.anchor;
  return a ? a.story + Math.min(Math.max(0, Date.now() - a.real), STORY_DRIFT_MAX) : Date.now();
}

/* Posted times never change on their own: only the forum's "now" follows the story. The user can still move a
   whole thread by hand (thread menu), e.g. one written under the real-world clock; gaps between posts are kept. */
function shiftThread(t, delta) {
  if (!delta) return;
  for (const p of t.posts) if (p.ts) p.ts += delta;
  t.created = (Number(t.created) || 0) + delta;
  t.bumped = (Number(t.bumped) || t.created) + delta;
}

const pad2 = n => String(n).padStart(2, '0');
function fmtDay(ts, board) {
  const d = new Date(ts);
  return board === '4ch'
    ? `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}/${pad2(d.getFullYear() % 100)}(${EN_DAYS[d.getDay()]})`
    : `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}(${JA_DAYS[d.getDay()]})`;
}
const CN_WEEK = '日一二三四五六';
function fmtFull(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 星期${CN_WEEK[d.getDay()]} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
const EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const EN_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/* Tells the crowd what day it is in their world, so nobody quotes memes or tech from the future. */
function storyDateLine(board, ts) {
  const d = new Date(ts);
  const hm = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  if (board === '2ch') return `【作中の現在日時】${fmtDay(ts, '2ch')} ${hm}ごろ。住民はこの日時を生きている。これより後の出来事・技術・流行語・ネタは知らない。スラングもこの年代に実在したものだけ使う。`;
  return `IN-WORLD DATE: ${EN_WEEK[d.getDay()]}, ${EN_MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}, around ${hm}. Anons live on this date: they know nothing that happened, was invented or became a meme after it, and only use slang that already existed then.`;
}

async function callGenerateRaw(fn, o) {
  // SillyTavern ≥1.13 takes one options object; older builds take positional arguments.
  if (fn.length >= 2) return fn(o.prompt, null, false, false, o.systemPrompt, o.responseLength);
  return fn({ prompt: o.prompt, systemPrompt: o.systemPrompt, responseLength: o.responseLength, trimNames: false });
}

/* ------------------------------------------------------------------ independent OpenAI-compatible API */
const API_PRESETS = [
  ['OpenAI', 'https://api.openai.com/v1'],
  ['DeepSeek', 'https://api.deepseek.com/v1'],
  ['OpenRouter', 'https://openrouter.ai/api/v1'],
  ['硅基流动', 'https://api.siliconflow.cn/v1'],
  ['Ollama', 'http://127.0.0.1:11434/v1'],
  ['LM Studio', 'http://127.0.0.1:1234/v1'],
];

class ApiError extends Error {
  constructor(message, status = 0) { super(message); this.status = status; }
}

/* "api.example.com/v1/" or a pasted ".../chat/completions" both become "https://api.example.com/v1" */
function normBaseUrl(u) {
  let s = String(u || '').trim();
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1)/i.test(s) ? 'http://' : 'https://') + s;
  return s.replace(/\/+$/, '').replace(/\/(chat\/completions|completions|models)$/i, '');
}
const customReady = () => !!(normBaseUrl(S.api.url) && clean(S.api.model));
const apiKeyHeader = () => (clean(S.api.key) ? `Bearer ${clean(S.api.key)}` : '');

function explainHttp(status, detail) {
  const d = detail ? `：${oneLine(detail).slice(0, 140)}` : '';
  if (status === 401 || status === 403) return `API Key 无效或没有权限（${status}）${d}`;
  if (status === 404) return `地址或模型不存在（404）。API 地址一般以 /v1 结尾，也请检查模型名称${d}`;
  if (status === 429) return `请求太频繁，或账户额度用完（429）${d}`;
  if (status === 400) return `请求被拒绝（400）${d}`;
  if (status >= 500) return `API 服务出错（${status}）${d}`;
  return `请求失败（${status}）${d}`;
}
/* SillyTavern relays only the upstream status text ("Unauthorized"…); turn it back into a code. */
const STATUS_WORDS = { 'bad request': 400, unauthorized: 401, forbidden: 403, 'not found': 404, 'too many requests': 429, 'internal server error': 500, 'bad gateway': 502, 'service unavailable': 503, 'gateway timeout': 504 };

async function withTimeout(ms, run) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try { return await run(ctrl.signal); } catch (e) {
    if (e?.name === 'AbortError') throw new ApiError(`等了 ${Math.round(ms / 1000)} 秒还没有回应，已取消。`);
    throw e;
  } finally { clearTimeout(timer); }
}

async function readJson(res) {
  const text = await res.text();
  try { return { json: JSON.parse(text), text }; } catch { return { json: null, text }; }
}

/* Through SillyTavern's server ('proxy', no CORS problems) or straight from the browser ('direct'). */
async function apiCall(path, body, timeoutMs) {
  const base = normBaseUrl(S.api.url);
  if (!base) throw new ApiError('先在设置里填写 API 地址。');
  if (S.api.route === 'direct') {
    return withTimeout(timeoutMs, async signal => {
      let res;
      try {
        res = await fetch(base + path, {
          method: body ? 'POST' : 'GET', signal,
          headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(apiKeyHeader() ? { Authorization: apiKeyHeader() } : {}) },
          body: body ? JSON.stringify(body) : undefined,
        });
      } catch (e) {
        if (e?.name === 'AbortError') throw e;
        throw new ApiError('浏览器无法直连这个地址，多半是跨域（CORS）限制或地址写错了。可以把「连接方式」改成「经酒馆转发」。');
      }
      const { json, text } = await readJson(res);
      if (!res.ok) throw new ApiError(explainHttp(res.status, json?.error?.message || json?.message || text), res.status);
      if (!json) throw new ApiError('API 返回的不是 JSON，请检查 API 地址。');
      return json;
    });
  }
  const c = ST();
  const headers = typeof c?.getRequestHeaders === 'function' ? c.getRequestHeaders() : { 'Content-Type': 'application/json' };
  // Our Authorization header replaces the key SillyTavern keeps for its own Custom source, so that key never reaches this URL.
  const relay = { chat_completion_source: 'custom', custom_url: base, custom_include_headers: JSON.stringify({ Authorization: apiKeyHeader() }) };
  const endpoint = body ? '/api/backends/chat-completions/generate' : '/api/backends/chat-completions/status';
  return withTimeout(timeoutMs, async signal => {
    let res;
    try {
      res = await fetch(endpoint, { method: 'POST', signal, headers, body: JSON.stringify({ ...relay, ...(body || {}), stream: false }) });
    } catch (e) {
      if (e?.name === 'AbortError') throw e;
      throw new ApiError('连不上酒馆服务器，请确认酒馆还在运行。');
    }
    const { json, text } = await readJson(res);
    if (res.status === 403 && !json?.error?.message) throw new ApiError('酒馆拒绝了这个请求（403）。刷新页面后再试。', 403);
    if (!res.ok || json?.error) {
      const msg = String(json?.error?.message || (json?.error === true ? '' : text) || '').trim();
      const code = STATUS_WORDS[msg.toLowerCase()] || (res.ok ? 0 : res.status);
      if (/ECONNREFUSED|ENOTFOUND|EAI_AGAIN|getaddrinfo|Connection refused|fetch failed|ETIMEDOUT|ECONNRESET|certificate/i.test(msg)) {
        const why = /ECONNREFUSED|Connection refused/i.test(msg) ? '连接被拒绝'
          : /ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(msg) ? '域名无法解析'
            : /ETIMEDOUT/i.test(msg) ? '连接超时'
              : /certificate/i.test(msg) ? 'HTTPS 证书有问题' : '网络错误';
        throw new ApiError(`酒馆服务器连不上这个地址（${why}）。本地模型请确认已经启动，并且这个地址能从运行酒馆的那台电脑访问。`);
      }
      if (!body) throw new ApiError('模型列表获取失败：地址不可用，或 Key 不对。也可以直接手动填写模型名称。', code);
      throw new ApiError(code ? explainHttp(code) : `请求失败：${msg.slice(0, 140) || '未知错误'}`, code);
    }
    return json;
  });
}

function extractContent(json) {
  const choice = json?.choices?.[0];
  let c = choice?.message?.content ?? choice?.text ?? json?.output_text ?? json?.content;
  if (Array.isArray(c)) c = c.map(p => (typeof p === 'string' ? p : p?.text ?? '')).join('');
  return typeof c === 'string' ? c : '';
}

async function generateCustom({ systemPrompt, prompt, responseLength }) {
  const base = { model: clean(S.api.model), messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: prompt }] };
  let json;
  try {
    json = await apiCall('/chat/completions', { ...base, temperature: S.api.temp, max_tokens: responseLength }, 180000);
  } catch (e) {
    // Some models reject max_tokens or a non-default temperature: retry once with the bare request.
    if (e instanceof ApiError && e.status === 400) json = await apiCall('/chat/completions', base, 180000);
    else throw e;
  }
  const text = extractContent(json);
  if (!text.trim()) {
    const why = json?.choices?.[0]?.finish_reason;
    throw new ApiError(`模型返回了空内容${why ? `（finish_reason: ${why}）` : ''}。`);
  }
  return text;
}

async function fetchModels() {
  const json = await apiCall('/models', null, 30000);
  const list = Array.isArray(json?.data) ? json.data : Array.isArray(json?.models) ? json.models : Array.isArray(json) ? json : [];
  const ids = [...new Set(list.map(m => (typeof m === 'string' ? m : m?.id || m?.name)).filter(Boolean).map(String))].sort((a, b) => a.localeCompare(b));
  if (!ids.length) throw new ApiError('这个地址没有返回模型列表，可以直接手动填写模型名称。');
  return ids;
}

/* What would stop a generation right now, in words the user can act on (null = good to go). */
function sourceProblem(Lb) {
  if (S.api.mode === 'custom') return customReady() ? null : '独立 API 还没设置好：请在「设定 / Settings」里填写 API 地址和模型名称。';
  const c = ST();
  if (typeof c?.generateRaw !== 'function') return '当前酒馆版本没有 generateRaw 接口，无法跟随酒馆生成。请更新 SillyTavern，或改用独立 API。';
  if (c.onlineStatus === 'no_connection') return `酒馆还没有连接模型。先在「API 连接」里连上一个模型，或改用独立 API，再点「${Lb.update}」。`;
  return null;
}

async function generate(o) {
  if (S.api.mode === 'custom') return generateCustom(o);
  return callGenerateRaw(ST().generateRaw, o);
}

const sourceLabel = () => (S.api.mode === 'custom' ? `独立 API${clean(S.api.model) ? `（${clean(S.api.model)}）` : ''}` : '跟随酒馆');

function switchSource() {
  if (S.api.mode === 'custom') {
    S.api.mode = 'st';
    save();
    toast('AI 来源：跟随酒馆');
    return;
  }
  S.api.mode = 'custom';
  save();
  if (!customReady()) { go('settings', { scroll: 'top' }); toast('已切换到独立 API，请先填写地址和模型名称'); }
  else toast(`AI 来源：${sourceLabel()}`);
}

/* ------------------------------------------------------------------ prompts */
const LANG_RULE = {
  '2ch': {
    ja: '書き込みは全て日本語。スレ主が日本語以外で書いても住民は日本語で返す（外国語なことにツッコむのはあり）。',
    zh: '書き込みは全て簡体字中国語で書く。ただし2chの文化（名無しさん、アンカー、ID、スレのノリ、ツッコミ）はそのまま保つ。',
    en: '書き込みは全て英語で書く。ただし2chの文化（名無しさん、アンカー、ID、スレのノリ、ツッコミ）はそのまま保つ。',
  },
  '4ch': {
    en: 'Write every post in English. If OP writes in another language, anons still answer in English (and may call it out).',
    zh: 'Write every post in Simplified Chinese, but keep 4chan culture intact: Anonymous, greentext lines starting with ">", >>quotes, blunt tone.',
    ja: 'Write every post in Japanese, but keep 4chan culture intact: Anonymous, greentext lines starting with ">", >>quotes, blunt tone.',
  },
};

/* How nice the crowd is. Culture (short posts, anchors, greentext, slang, derails) stays the same at every level;
   only the attitude changes. Each block wins over a harsher board description and over earlier rude posts. */
const TONES = ['gentle', 'normal', 'harsh'];
const TONE_2CH = {
  gentle: `# 住民の態度（口調：やさしめ）
- 住民は基本的に好意的。イッチを応援したり、親身に相談に乗ったり、一緒に盛り上がったりする。
- ツッコミやいじりは軽く、笑いで終わる程度。煽り、人格否定、罵倒、「釣り乙」「ググれカス」のような突き放しはしない。
- 違う意見を言う人がいても、言い方はやわらかい。
- 2chらしさ（短文、アンカー、顔文字、スラング、脱線、自分語り）はそのまま。
- 下の「板の空気」や、スレの前のほうのレスが荒れていても、この口調を優先する。`,
  normal: `# 住民の態度（口調：ふつう）
- 住民の性格はバラバラ：親切な人、マジレスする人、ツッコミ担当、ネタに走る人、自分語り、関係ない雑談、ちょっと疑ってかかる人。
- 大半は好意的か中立。皮肉やいじりは1回の書き込み群で1〜2レスまで、笑える範囲にとどめる。
- イッチ本人への人格攻撃や罵倒はしない。「釣りか？」程度の軽口はたまにならOK。
- 全員が同じ意見になる必要はないが、ギスギスさせない。
- ID文化（同じ人の連投、「自演乙」）はたまに軽く。
- 下の「板の空気」や、スレの前のほうのレスが荒れていても、この口調を優先する。`,
  harsh: `# 住民の態度（口調：毒舌）
- 「ググれ」「釣り乙」「はい論破」のような突き放しや、ID文化のツッコミ（「自演乙」「ID真っ赤」）もあり。
- 毒舌・皮肉・ブラックジョークはOK（ただし下の「禁止」は必ず守る）。`,
};
const TONE_4CH = {
  gentle: `# Attitude (tone: friendly)
- These are the friendly anons of the board: supportive, joking WITH OP rather than at OP, calling people "fren", wholesome or absurd greentext, genuinely useful advice.
- Light ribbing at most. No insults, no dunking on OP, no calling OP fake, no "who asked" style dismissals.
- Someone may disagree, but kindly.
- Keep the 4chan form (short posts, greentext, quotes, slang, derails).
- If the board description or earlier posts in the thread are harsher, follow this tone instead.`,
  normal: `# Attitude (tone: mixed)
- A mixed crowd: mostly neutral, funny or helpful anons, a few contrarians.
- At most one or two sarcastic or teasing replies per batch, and they stay funny rather than cruel. Dark humor only lightly.
- Nobody insults OP personally or piles on. A mild "fake and..." style doubt is fine once in a while.
- If the board description or earlier posts in the thread are harsher, follow this tone instead.`,
  harsh: `# Attitude (tone: unfiltered)
- Blunt, dark humor, irony, deadpan shitposting, contrarians, someone calling OP a LARPer or fake, one rare sincere helpful anon.
- Dismissive slang is fair game: cope, seethe, ngmi, who asked, nice blogpost, rent free, touch grass, absolute state of this thread.
- No group agreement, no wholesome group hugs. Rude, crude and edgy is fine; hateful is not (the hard limits below always apply).`,
};
const toneOf = () => (TONES.includes(S.tone) ? S.tone : 'normal');
const TONE_LABEL = { gentle: '温和', normal: '普通', harsh: '毒舌' };
const TONE_OPTIONS = TONES.map(v => [v, TONE_LABEL[v]]);

function system2ch(lang, bd) {
  const anon = anonOf('2ch', bd);
  return `あなたは匿名掲示板「2ちゃんねる（2ch）」のスレッドに書き込む住民たちを、何人も同時に演じる。これはロールプレイ本編とは別枠のおまけ機能で、本編の物語を語ったり進めたりはしない。

# 言語
${LANG_RULE['2ch'][lang]}

# 2chらしさ
- 名前はほぼ全員この板のデフォルト名「${anon}」。コテハンはごく稀。
- スレ主は「イッチ」「>>1」と呼ばれる。
- 1レスは短く、1〜3行。改行多め、句読点少なめ、タメ口。丁寧語は浮く。
- 住民の性格はバラバラ：ツッコミ、煽り、揚げ足取り、マジレス、親切な人、スレタイしか読んでない人、自分語り、関係ない雑談、ネタにマジレスする人、「釣りだろ」と疑う人。全員が同意したり、同じノリで盛り上がったりしない。
- ネットスラングは作中の年代に実在したものだけ、自然に、毎回違うものを少しずつ（例：草、ｗ、それな、kwsk、マジレスすると、乙、おまいら、ワイ、〜ンゴ、ﾜﾛﾀ、うｐ、ソースは？、知ってた、定期、ガチ、ニキ、〜で草、なお、ファッ!?）。同じ語の連発はしない。
- 顔文字 (´・ω・｀) (ﾟ∀ﾟ) ( ﾟдﾟ) や一行AAはたまに。
- アンカーは「>>番号」。複数アンカー「>>3 >>5」もあり。アンカー先の内容にちゃんと反応する。
- sage進行を好む人は mail を "sage" にする。

${TONE_2CH[toneOf()]}

# この板（${bd.name}）の空気
${bd.vibe || 'この板の話題に沿って書き込む。'}

# 禁止
差別語、属性への憎悪表現、実在人物への中傷、露骨な性描写、未成年が関わる性的内容、自傷・自殺の勧め。

# 住民が知っていること
住民が知っているのはスレタイとこのスレのレスだけ（「公開設定」があれば、それはこの世界の常識として知っている）。「作者用メモ」は雰囲気の参考で、住民は読んでいない。住民の推測は推測のまま扱う。スレ主になりすまさない。小説の地の文・ナレーション・説明文は書かない。

# 出力形式
JSON配列のみを出力。コードブロック・前置き・後書きは禁止。
[{"id":"new1","name":"${anon}","mail":"","text":"本文（改行は\\n）"}]
- id：前に書き込んだ住民がまた書くなら、そのIDをそのまま使う（例 "aB3dE9fG0"）。新しい住民は "new1" "new2"…（同じラベル＝同じ人）。スレ主のIDは絶対に使わない。`;
}

function system4ch(lang, bd) {
  const anon = anonOf('4ch', bd);
  return `You play a crowd of anonymous users replying in a thread on ${bd.name}, a board of a fictional 4chan-style imageboard. This is a side feature next to a roleplay: never narrate or advance the main story.

# Language
${LANG_RULE['4ch'][lang]}

# What makes it 4chan
- Everyone is "${anon}". Very rarely someone posts with a name or tripcode ("name !Ab3dE9fG") and gets told to drop it.
- Posts are short: 1–3 lines, mostly lowercase, little punctuation. No greetings, no sign-offs, no hashtags, almost no emoji.
- Greentext is core: lines starting with ">" for implying, quoting, or mini-stories (">be me\\n>open thread\\n>mfw"). Several posts per batch should use it.
- Quote with >>number, using the exact post numbers shown in the thread. Replying to OP is common; anons also talk to each other, not only to OP.
- Varied slang that already existed at the in-world date (skip anything newer), never the same handful every time: kek, lmao, based, it's over, we're so back, anon, OP, fren, tl;dr, sauce?, this, /thread, bump, checked, lurk moar.
- Derailing is part of the culture: at least one anon goes off-topic (what they are eating, something weird at work, an unrelated question, a greentext story that goes nowhere).

${TONE_4CH[toneOf()]}

# This board (${bd.name})
${bd.vibe || 'Stay on this board\'s topic.'}${bd.ws ? '\nIt is a worksafe board: no explicit sexual content or gore.' : ''}

# Hard limits
No slurs of any kind (including any "-fag" compound), no hate against protected groups, no harassment of real people, no explicit sexual content, nothing sexual involving minors, never tell anyone to kill or harm themselves.

# What anons know
Only the subject and the posts in this thread (plus PUBLIC SETTING facts, if given: those are common knowledge in this world). AUTHOR BACKGROUND is a private tone reference that anons have never seen. Theories stay theories. Never post as OP. No prose narration, no stage directions.

# Output
A JSON array only. No code fences, no commentary before or after.
[{"name":"${anon}","text":"post body, \\n for line breaks"}]`;
}

function langOf(board) {
  const v = S.lang[board];
  return v && v !== 'auto' && LANG_RULE[board][v] ? v : (board === '2ch' ? 'ja' : 'en');
}

/* OP + as many of the latest posts as fit the budget */
function pickPosts(t, budget = 9000, max = 40) {
  const posts = t.posts.filter(p => !(t.board === '4ch' && p.del));
  if (!posts.length) return { posts: [], gap: false };
  const first = posts[0];
  const tail = [];
  let used = (first.text || '').length;
  for (let i = posts.length - 1; i > 0 && tail.length < max - 1; i--) {
    const len = Math.min(700, (posts[i].text || '').length) + 60;
    if (used + len > budget) break;
    used += len;
    tail.unshift(posts[i]);
  }
  return { posts: [first, ...tail], gap: tail.length && tail[0] !== posts[1] };
}

function buildPrompt(t, count, futurePids, cont = false) {
  const lang = langOf(t.board);
  const lore = bound(S.lore, 1500);
  const bg = readRpContext();
  const { posts, gap } = pickPosts(t);
  const lastYou = [...t.posts].reverse().find(p => p.you && !p.del);
  if (t.board === '2ch') {
    const lines = posts.map((p, i) => {
      const head = p.del ? `${p.no} ：あぼーん` : `${p.no} ：${p.name}${p.mail ? `[${p.mail}]` : ''}：${p.tsText || fmt2ch(p.ts)} ID:${p.uid}${p.uid === t.userUid ? '（スレ主）' : ''}`;
      return (gap && i === 1 ? '（…中略…）\n\n' : '') + head + (p.del ? '' : '\n' + bound(p.text, 700));
    });
    const ids = [...new Set(t.posts.filter(p => !p.del && p.uid !== t.userUid).map(p => p.uid))].slice(-20);
    const start = t.posts.length + 1;
    const prompt = [
      `【板】${boardOf(t).name}（2ch）`,
      `【スレタイ】${t.title}`,
      `【スレ主のID】${t.userUid}（このIDでは書き込まない）`,
      ids.length ? `【これまでの住民ID】${ids.join(' ')}` : '',
      '【スレの内容】', lines.join('\n\n'),
      lore ? `【公開設定（この世界の住民なら誰でも知っていること）】\n${lore}` : '',
      bg ? `【作者用メモ（住民は読んでいない。雰囲気の参考だけ）】\n${bg}` : '',
      storyDateLine('2ch', forumNow()),
      `【指示】新しいレスを${count}件書く。レス番号は${start}〜${start + count - 1}になる（同じバッチ内のレスにアンカーしてもよい）。${cont ? '直前のレスの流れを引き継いでスレを続ける（新しい住民の参加、言い合いの続き、脱線もあり）。前に出たネタの繰り返しは避ける。' : `直近の書き込み${lastYou ? `、特に>>${lastYou.no}` : ''}への反応を中心に、古いレスへのアンカーや脱線も少し混ぜる。`}JSON配列のみを出力。`,
    ].filter(Boolean).join('\n');
    return { systemPrompt: system2ch(lang, boardOf(t)), prompt };
  }
  const op = posts[0];
  const lines = posts.map((p, i) => {
    const head = `${p.name} No.${p.pid}${p.pid === op?.pid ? ' (OP)' : ''}${p.you && p.pid !== op?.pid ? ' (OP again)' : ''}`;
    return (gap && i === 1 ? '[…older replies omitted…]\n\n' : '') + head + '\n' + bound(p.text, 700);
  });
  const prompt = [
    `Board: ${boardOf(t).name}`,
    `Thread subject: ${t.title || '(no subject)'}`,
    `OP's post number: ${op?.pid}`,
    '--- THREAD ---', lines.join('\n\n'), '--- END ---',
    lore ? `PUBLIC SETTING (things everyone in this world knows):\n${lore}` : '',
    bg ? `AUTHOR BACKGROUND (private; anons have NOT seen this; tone reference only):\n${bg}` : '',
    storyDateLine('4ch', forumNow()),
    `TASK: Write ${count} new replies. They will be posted as ${futurePids.map(n => 'No.' + n).join(', ')} in this order (later ones may quote earlier ones). ${cont ? 'Continue the thread from the latest replies: new anons join, arguments carry on, derails happen; do not repeat earlier jokes.' : `React mostly to the newest posts${lastYou ? `, especially No.${lastYou.pid}` : ''}; at least one anon derails off-topic.`} Output the JSON array only.`,
  ].filter(Boolean).join('\n');
  return { systemPrompt: system4ch(lang, boardOf(t)), prompt };
}

/* ------------------------------------------------------------------ parsing model output */
/* Escape raw newlines/tabs that sit inside JSON strings so JSON.parse accepts them. */
function sanitizeJsonish(s) {
  let out = '', inStr = false, esc = false;
  for (const ch of s) {
    if (inStr) {
      if (esc) { esc = false; out += ch; continue; }
      if (ch === '\\') { esc = true; out += ch; continue; }
      if (ch === '"') { inStr = false; out += ch; continue; }
      if (ch === '\n') { out += '\\n'; continue; }
      if (ch === '\r') continue;
      if (ch === '\t') { out += '\\t'; continue; }
      out += ch;
    } else {
      if (ch === '"') inStr = true;
      out += ch;
    }
  }
  return out;
}
/* Pull every complete top-level {...} object out of (possibly truncated) text. */
function salvageObjects(s) {
  const found = [];
  let depth = 0, start = -1, inStr = false, esc = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') { if (depth === 0) start = i; depth++; }
    else if (ch === '}' && depth > 0) {
      depth--;
      if (depth === 0 && start >= 0) {
        try { found.push(JSON.parse(s.slice(start, i + 1))); } catch { /* skip broken object */ }
        start = -1;
      }
    }
  }
  return found;
}
function parseRows(raw) {
  let s = typeof raw === 'string' ? raw : (raw?.content ?? raw?.text ?? JSON.stringify(raw ?? ''));
  s = s.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').replace(/```(?:json)?/gi, '').trim();
  s = sanitizeJsonish(s);
  const a = s.indexOf('['), z = s.lastIndexOf(']');
  if (a >= 0 && z > a) {
    try {
      const v = JSON.parse(s.slice(a, z + 1));
      if (Array.isArray(v) && v.some(isObj)) return v.filter(isObj);
    } catch { /* fall through */ }
  }
  const objs = salvageObjects(s);
  if (objs.length === 1 && !('text' in objs[0])) {
    const arr = Object.values(objs[0]).find(Array.isArray);
    if (arr) return arr.filter(isObj);
  }
  return objs.filter(o => 'text' in o || 'comment' in o || 'body' in o || 'content' in o);
}

/* ------------------------------------------------------------------ posting */
const lastPostTs = t => Math.max(Number(t.created) || 0, ...t.posts.map(p => Number(p.ts) || 0));
function makePost(t, { name, mail, text, you = false, uid, ts, pid }) {
  if (ts == null) ts = Math.max(forumNow(), lastPostTs(t) + 1000);
  const no = t.posts.length + 1;
  const post = {
    no,
    pid: t.board === '4ch' ? (pid || nextPid()) : no,
    name: bound(name || anonOf(t.board, boardOf(t)), 40),
    mail: /sage/i.test(mail || '') ? 'sage' : '',
    uid: t.board === '2ch' ? (uid || (you ? t.userUid : makeUid())) : undefined,
    text: normText(text).slice(0, 3000),
    ts, you,
  };
  if (post.mail !== 'sage') t.bumped = Math.max(t.bumped || 0, ts);
  return post;
}

function addUserPost(t, { name, mail, text }) {
  const p = makePost(t, { name, mail, text, you: true });
  t.posts.push(p);
  S.names[t.board] = { name: bound(name, 40), mail: bound(mail, 20) };
  return p;
}

function appendAiPosts(t, rows, futurePids, count) {
  const now = forumNow();
  const valid = rows.map(r => ({ r, text: normText(r.text ?? r.comment ?? r.body ?? r.content ?? '') })).filter(x => x.text).slice(0, count + 2);
  if (!valid.length) return [];
  // Replies arrive around the forum's "now", never before the latest post. A thread that sat quiet while the
  // story moved on gets its new replies at the new time instead of right after the old posts.
  const lastTs = Math.max(0, ...t.posts.map(p => p.ts || 0)) || now - valid.length * 30000;
  let cursor = Math.max(lastTs, now - valid.length * 45000);
  const gap = clamp((now - cursor) / valid.length, 8000, 60000); // a fresh thread still gets replies seconds apart, not milliseconds
  const known = new Map();
  for (const p of t.posts) if (p.uid && p.uid !== t.userUid) known.set(p.uid.toLowerCase(), p.uid);
  const batch = new Map();
  const added = [];
  const youName = t.posts.find(p => p.you)?.name; // the crowd never borrows the player's handle
  valid.forEach(({ r, text }, i) => {
    if (t.posts.length >= MAX_POSTS) return;
    let uid;
    if (t.board === '2ch') {
      const key = String(r.id ?? r.poster ?? r.uid ?? '').trim().replace(/^ID:/i, '');
      uid = known.get(key.toLowerCase()) || batch.get(key) || null;
      if (!uid) { uid = makeUid(); if (key) batch.set(key, uid); }
      if (uid === t.userUid) uid = makeUid();
    }
    cursor += Math.round(gap * (0.45 + Math.random() * 1.1));
    let name = bound(r.name || '', 40);
    const anon = anonOf(t.board, boardOf(t));
    // Generic defaults the model falls back to become this board's own default name (なんJ → 風吹けば名無し).
    if (!name || /^(名無しさん|名無し|anonymous|anon)$/i.test(name) || (youName && name === youName && youName !== anon)) name = anon;
    const p = makePost(t, { name, mail: r.mail ?? r.email ?? r.options ?? '', text: text.slice(0, 1500), uid, ts: cursor, pid: futurePids[i] });
    t.posts.push(p);
    added.push(p);
  });
  if (t.board === '4ch') {
    t.posts.sort((a, b) => a.pid - b.pid);
    t.posts.forEach((p, i) => { p.no = i + 1; });
  }
  return added;
}

/* One model reply holds at most BATCH posts (long replies get cut off mid-JSON); bigger requests run as
   consecutive batches, each one reading what the previous batch wrote. */
const BATCH = 10;
const MAX_COUNT = 200;
const isViewing = t => ui.open && S.screen === 'thread' && S.selected === t.id && document.visibilityState === 'visible';

async function summon(threadId) {
  const t = byId(threadId);
  if (!t) return;
  const Lb = UI[t.board];
  const running = ui.busy.get(t.id);
  if (running) {
    // A second tap while a multi-batch run is going stops it after the current batch.
    if (running.total > BATCH && !running.stop) { running.stop = true; refreshBusy(); toast(Lb.stopping); }
    return;
  }
  if (t.posts.length >= MAX_POSTS) { toast(Lb.over.split('\n')[0]); return; }
  if (!t.posts.length) { toast(Lb.noPosts); return; }
  const problem = sourceProblem(Lb);
  if (problem) { toast(problem, 'error'); return; }
  const run = { done: 0, total: clamp(Math.round(Number(S.count) || 5), 1, MAX_COUNT), stop: false };
  ui.busy.set(t.id, run);
  refreshBusy();
  let got = 0;
  let firstNo = null;
  try {
    while (run.done < run.total && !run.stop) {
      const th = byId(t.id);
      if (!th || th.posts.length >= MAX_POSTS) break;
      const count = Math.min(BATCH, run.total - run.done, MAX_POSTS - th.posts.length);
      const futurePids = th.board === '4ch' ? Array.from({ length: count }, nextPid) : [];
      let added = [];
      try {
        const { systemPrompt, prompt } = buildPrompt(th, count, futurePids, got > 0);
        const raw = await generate({ prompt, systemPrompt, responseLength: Math.min(2600, 300 + count * 180) });
        const rows = parseRows(raw);
        const now = byId(t.id);
        if (!now) return;
        added = rows.length ? appendAiPosts(now, rows, futurePids, count) : [];
        if (!added.length) throw new Error('FORMAT');
      } catch (e) {
        if (!got) throw e;
        // Keep what earlier batches wrote; explain why the run ended early.
        const msg = String(e?.message || e);
        toast(`第 ${Math.floor(run.done / BATCH) + 1} 批${msg === 'FORMAT' ? '模型没有按格式返回' : '生成失败：' + msg.slice(0, 80)}，已保留前面的 ${got} 条。`, 'error');
        break;
      }
      run.done += count;
      got += added.length;
      save();
      const batchFirst = Math.min(...added.map(p => p.no));
      const th2 = byId(t.id);
      if (isViewing(th2)) {
        if (firstNo == null) { firstNo = batchFirst; ui.dividerAt = batchFirst; }
        render({ scroll: 'arrival', arrived: got, anchorNo: got > added.length ? batchFirst : null });
      } else {
        th2.unread = (th2.unread || 0) + added.length;
        save();
        if (ui.open && S.screen === 'list' && !ui.layers.length) render({ scroll: 'keep' }); // never rebuild a form the user is typing in
        updateBadge(true);
      }
    }
    const th = byId(t.id);
    if (th && got && !isViewing(th) && ui.open) toast(Lb.gotElsewhere(got, oneLine(th.title || th.posts[0]?.text || '').slice(0, 18)));
    if (run.stop && got) toast(Lb.stopped(got));
  } catch (e) {
    console.error('[AnonymousBoard]', e);
    const msg = String(e?.message || e);
    if (msg === 'FORMAT') toast(`模型没有按格式返回回复。再点一次「${Lb.update}」重试，多次失败可以换个模型。`, 'error');
    else toast('生成失败：' + msg.slice(0, 120), 'error');
  } finally {
    ui.busy.delete(t.id);
    refreshBusy();
  }
}

function fetchingRow(t) {
  const Lb = UI[t.board];
  const run = ui.busy.get(t.id);
  const multi = run && run.total > BATCH;
  return h('div', { class: 'ab-fetching', role: 'status' },
    Lb.fetching + (multi ? ` ${run.done}/${run.total}` : ''),
    h('span', { class: 'ab-dots' }, h('i'), h('i'), h('i')),
    multi ? (run.stop
      ? h('span', { class: 'ab-fetching-note' }, Lb.stopping)
      : h('button', { type: 'button', class: 'ab-textbtn ab-fetching-stop', onclick: () => summon(t.id) }, Lb.stop)) : null);
}

/* ------------------------------------------------------------------ thread helpers */
const QUOTE_SPLIT = /(>>\d{1,10}(?:-\d{1,4})?)/;
const QUOTE_ALL = />>(\d{1,10})(?:-(\d{1,4}))?/g;
function quotesIn(text) {
  const out = [];
  for (const m of String(text || '').matchAll(QUOTE_ALL)) {
    const a = +m[1];
    out.push(a);
    if (m[2]) { const b = +m[2]; if (b > a && b - a <= 20) for (let i = a + 1; i <= b; i++) out.push(i); }
  }
  return out;
}
function threadCtx(t) {
  const byPid = new Map(), back = new Map(), you = new Set(), idTot = new Map(), idIdx = new Map();
  for (const p of t.posts) {
    byPid.set(p.pid, p);
    if (p.you) you.add(p.pid);
    if (p.uid && !p.del) { const n = (idTot.get(p.uid) || 0) + 1; idTot.set(p.uid, n); idIdx.set(p.pid, n); }
  }
  for (const p of t.posts) {
    if (p.del) continue;
    for (const q of new Set(quotesIn(p.text))) {
      if (q === p.pid || !byPid.has(q)) continue;
      if (!back.has(q)) back.set(q, []);
      back.get(q).push(p.pid);
    }
  }
  return { t, board: t.board, byPid, back, you, idTot, idIdx, opPid: t.posts[0]?.pid };
}
const quotesYou = (p, ctx) => !p.you && quotesIn(p.text).some(q => ctx.you.has(q));

function threadAsText(t) {
  const Lb = UI[t.board];
  const head = t.board === '2ch' ? `【${boardOf(t).name}】${t.title}` : `${boardOf(t).name}  ${t.title || ''}`.trim();
  return head + '\n\n' + t.posts.filter(p => !p.del).map(p => t.board === '2ch'
    ? `${p.no} ：${p.name}：${p.tsText || fmt2ch(p.ts)} ID:${p.uid}\n${p.text}`
    : `${p.name} ${p.tsText || fmt4ch(p.ts)} No.${p.pid}\n${p.text}`).join('\n\n');
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fallback below */ }
  const ta = h('textarea', { style: { position: 'fixed', opacity: '0', top: '0', left: '0' } });
  ta.value = text;
  document.body.append(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  ta.remove();
  return ok;
}

/* ------------------------------------------------------------------ post views */
function quoteLink(n, label, ctx) {
  const target = ctx.byPid.get(n);
  let text = label;
  if (ctx.board === '4ch' && target) {
    if (ctx.you.has(n)) text += ' (You)';
    else if (n === ctx.opPid) text += ' (OP)';
  }
  const alive = target && !target.del;
  return h('button', {
    type: 'button', class: 'ab-q' + (alive ? '' : ' is-dead'), text,
    onclick: e => { e.stopPropagation(); if (alive) showPosts([n], ctx); },
  });
}

function bodyView(text, ctx) {
  const box = h('div', { class: 'ab-text' });
  const lines = String(text || '').split('\n');
  lines.forEach((line, i) => {
    let host = box;
    if (ctx.board === '4ch' && /^\s*>(?!>\d)/.test(line)) { host = h('span', { class: 'ab-green' }); box.append(host); }
    for (const part of line.split(QUOTE_SPLIT)) {
      if (!part) continue;
      const m = part.match(/^>>(\d+)(?:-\d+)?$/);
      host.append(m ? quoteLink(+m[1], part, ctx) : part);
    }
    if (i < lines.length - 1) box.append(h('br'));
  });
  return box;
}

function post2ch(p, ctx, inPop) {
  const Lb = UI['2ch'];
  const replies = ctx.back.get(p.pid) || [];
  const cls = ['ab-p2'];
  if (p.you) cls.push('is-you');
  if (quotesYou(p, ctx)) cls.push('to-you');
  if (p.del) cls.push('is-del');
  const num = h('button', { type: 'button', class: 'ab-p2-no' + (replies.length ? ' has-replies' : ''), text: String(p.no), onclick: () => postActions(p, ctx) });
  const head = h('div', { class: 'ab-p2-head' }, num);
  if (replies.length) head.append(h('button', { type: 'button', class: 'ab-p2-rc', text: `(${replies.length})`, onclick: () => showPosts(replies, ctx) }));
  if (p.del) {
    head.append(' ：', h('span', { class: 'ab-p2-name' }, Lb.deleted), '：', Lb.deleted);
    return h('article', { class: cls.join(' '), dataset: { no: p.no } }, head, h('div', { class: 'ab-p2-body' }, Lb.deleted));
  }
  const total = ctx.idTot.get(p.uid) || 1;
  head.append(
    ' ：', h('span', { class: 'ab-p2-name' + (p.mail ? ' has-mail' : ''), title: p.mail ? `mailto:${p.mail}` : null }, p.name), '：',
    h('span', { class: 'ab-p2-date' }, p.tsText || fmt2ch(p.ts)), ' ',
    h('span', { class: 'ab-p2-id' + (total >= 5 ? ' is-hot' : '') }, `ID:${p.uid}`, total > 1 ? h('span', { class: 'ab-p2-idc' }, ` (${ctx.idIdx.get(p.pid)}/${total})`) : null),
  );
  const body = h('div', { class: 'ab-p2-body' }, bodyView(p.text, ctx));
  return h('article', { class: cls.join(' '), dataset: { no: p.no }, id: inPop ? null : `ab-post-${p.no}` }, head, body);
}

function thumbStyle(seed) {
  const x = hash(seed);
  const h1 = x % 360, h2 = (x >>> 9) % 360, h3 = (x >>> 17) % 360;
  return {
    background: `radial-gradient(circle at ${20 + (x % 50)}% ${25 + ((x >>> 5) % 45)}%, hsl(${h1} 70% 78% / .95), transparent 55%), linear-gradient(${x % 180}deg, hsl(${h2} 38% 52%), hsl(${h3} 45% 28%))`,
  };
}

function post4ch(p, ctx, inPop) {
  const t = ctx.t;
  const isOP = p.pid === ctx.opPid;
  const replies = ctx.back.get(p.pid) || [];
  const head = h('div', { class: 'ab-p4-head' });
  if (isOP && t.title) head.append(h('span', { class: 'ab-p4-subject' }, t.title), ' ');
  head.append(h('span', { class: 'ab-p4-name' }, p.name));
  if (p.you) head.append(h('span', { class: 'ab-p4-you' }, ' (You)'));
  head.append(' ',
    h('span', { class: 'ab-p4-date' }, p.tsText || fmt4ch(p.ts)), ' ',
    h('button', { type: 'button', class: 'ab-p4-no', onclick: () => postActions(p, ctx) }, 'No.', String(p.pid)),
  );
  if (replies.length) {
    const bl = h('span', { class: 'ab-p4-back' });
    for (const r of replies) bl.append(quoteLink(r, `>>${r}`, ctx), ' ');
    head.append(' ', bl);
  }
  const body = h('blockquote', { class: 'ab-p4-body' }, bodyView(p.text, ctx));
  const cls = (isOP ? 'ab-op4' : 'ab-r4') + (quotesYou(p, ctx) ? ' to-you' : '') + (p.you ? ' is-you' : '');
  if (isOP) {
    const x = hash(t.id);
    const file = h('div', { class: 'ab-p4-file' }, 'File: ', h('span', { class: 'ab-p4-fname' }, `${t.created}.jpg`), ` (${40 + (x % 400)} KB, ${[500, 640, 800, 1024][x % 4]}x${[375, 480, 600, 768][(x >>> 3) % 4]})`);
    return h('div', { class: cls, dataset: { no: p.no }, id: inPop ? null : `ab-post-${p.no}` }, file, h('div', { class: 'ab-p4-thumb', style: thumbStyle(t.id), 'aria-hidden': 'true' }), head, body);
  }
  const inner = h('div', { class: cls }, head, body);
  return h('div', { class: 'ab-r4wrap', dataset: { no: p.no }, id: inPop ? null : `ab-post-${p.no}` }, h('span', { class: 'ab-r4arrows', 'aria-hidden': 'true' }, '>>'), inner);
}

const postView = (p, ctx, inPop = false) => ctx.board === '2ch' ? post2ch(p, ctx, inPop) : post4ch(p, ctx, inPop);

/* ------------------------------------------------------------------ overlays (sheets, dialogs, popups, toast) */
function openLayer(node, { key = 'layer', backdrop = 'dim', onClose } = {}) {
  closeLayer(key, true);
  const wrap = h('div', { class: `ab-layer-item ab-bd-${backdrop}`, dataset: { key } });
  if (backdrop !== 'none') wrap.append(h('div', { class: 'ab-backdrop', onclick: () => closeLayer(key) }));
  wrap.append(node);
  R.layer.append(wrap);
  requestAnimationFrame(() => wrap.classList.add('is-in'));
  ui.layers.push({ key, wrap, onClose });
  return wrap;
}
function closeLayer(key, instant = false) {
  const idx = key ? ui.layers.findIndex(l => l.key === key) : ui.layers.length - 1;
  if (idx < 0) return false;
  const [l] = ui.layers.splice(idx, 1);
  l.onClose?.();
  if (instant || matchMedia('(prefers-reduced-motion: reduce)').matches) l.wrap.remove();
  else { l.wrap.classList.remove('is-in'); setTimeout(() => l.wrap.remove(), 220); }
  return true;
}
function closeAllLayers() { while (ui.layers.length) closeLayer(undefined, true); }

function actionSheet(title, actions) {
  const Lb = L();
  const sheet = h('div', { class: 'ab-actions', role: 'menu' },
    title ? h('div', { class: 'ab-actions-title' }, title) : null,
    h('div', { class: 'ab-actions-group' }, actions.map(a => h('button', {
      type: 'button', class: 'ab-action' + (a.danger ? ' is-danger' : ''), role: 'menuitem',
      onclick: () => { closeLayer('actions'); a.run(); },
    }, a.label))),
    h('button', { type: 'button', class: 'ab-action ab-action-cancel', onclick: () => closeLayer('actions') }, Lb.cancel));
  openLayer(sheet, { key: 'actions' });
}

function confirmDialog(message, okLabel, cancelLabel = L().cancel) {
  return new Promise(resolve => {
    let done = false;
    const finish = v => { if (done) return; done = true; closeLayer('dialog'); resolve(v); };
    const box = h('div', { class: 'ab-dialog', role: 'alertdialog' },
      h('p', { class: 'ab-dialog-msg' }, message),
      h('div', { class: 'ab-dialog-btns' },
        h('button', { type: 'button', class: 'ab-dialog-btn', onclick: () => finish(false) }, cancelLabel),
        h('button', { type: 'button', class: 'ab-dialog-btn is-danger', onclick: () => finish(true) }, okLabel)));
    openLayer(box, { key: 'dialog', onClose: () => { if (!done) { done = true; resolve(false); } } });
  });
}

function showPosts(pids, ctx) {
  const posts = pids.map(n => ctx.byPid.get(n)).filter(p => p && !p.del);
  if (!posts.length) return;
  const card = h('div', { class: `ab-pop ab-thread-${ctx.board}` }, posts.map(p => postView(p, ctx, true)));
  openLayer(card, { key: 'pop', backdrop: 'clear' });
}

function postActions(p, ctx) {
  const Lb = UI[ctx.board];
  const t = ctx.t;
  const n = ctx.board === '2ch' ? p.no : p.pid;
  const replies = ctx.back.get(p.pid) || [];
  const acts = [];
  if (!p.del && t.posts.length < MAX_POSTS) acts.push({ label: Lb.replyTo(n), run: () => openCompose(t, `>>${n}\n`) });
  if (replies.length) acts.push({ label: Lb.showReplies(replies.length), run: () => showPosts(replies, ctx) });
  if (!p.del) acts.push({ label: Lb.copy, run: async () => toast((await copyText(p.text)) ? Lb.copied : '复制失败，请长按文字手动复制') });
  if (!p.del) acts.push({
    label: Lb.del, danger: true,
    run: async () => {
      if (!(await confirmDialog(Lb.delPostQ(n), Lb.delOk))) return;
      p.del = true;
      save();
      render({ scroll: 'keep' });
    },
  });
  actionSheet(ctx.board === '2ch' ? `>>${n}` : `No.${n}`, acts);
}

/* Board list for one forum: thread counts and unread per board, custom boards at the end. */
function openBoardPicker(forum, onPick) {
  const cur = curSub(forum);
  const list = h('div', { class: 'ab-boardlist', role: 'listbox', 'aria-label': forum === '2ch' ? '板一覧' : 'Boards' });
  for (const bd of boardsFor(forum)) {
    const mine = S.threads.filter(t => t.board === forum && t.sub === bd.id);
    const unread = mine.reduce((a, t) => a + (t.unread || 0), 0);
    list.append(h('div', { class: 'ab-boardrow' + (bd.id === cur ? ' is-on' : '') },
      h('button', {
        type: 'button', class: 'ab-boardpick', role: 'option', 'aria-selected': String(bd.id === cur),
        onclick: () => { closeLayer('boards'); onPick(bd.id); },
      },
      h('span', { class: 'ab-bp-name' }, bd.name),
      h('span', { class: 'ab-bp-desc' }, bd.custom ? (bd.desc || '自定义板块') : bd.desc)),
      unread ? h('span', { class: 'ab-badge' }, UI[forum].newCount(unread)) : mine.length ? h('span', { class: 'ab-bp-count' }, `${mine.length} 串`) : null,
      bd.custom ? h('button', { type: 'button', class: 'ab-textbtn ab-bp-edit', onclick: () => editCustomBoard(forum, bd, id => { closeLayer('boards'); onPick(id); }) }, '编辑') : null));
  }
  list.append(h('button', { type: 'button', class: 'ab-bp-add', onclick: () => editCustomBoard(forum, null, id => { closeLayer('boards'); onPick(id); }) }, '＋ 自定义板块'));
  const sheet = h('div', { class: 'ab-sheet ab-picker ab-boards', role: 'dialog', 'aria-label': forum === '2ch' ? '板一覧' : 'Boards' },
    h('div', { class: 'ab-sheet-grab', 'aria-hidden': 'true' }),
    h('div', { class: 'ab-sheet-head' },
      h('button', { type: 'button', class: 'ab-textbtn', onclick: () => closeLayer('boards') }, UI[forum].cancel),
      h('div', { class: 'ab-sheet-title' }, forum === '2ch' ? '板一覧' : 'Boards'),
      h('span', { class: 'ab-sheet-spacer' })),
    list);
  openLayer(sheet, { key: 'boards' });
}

/* Create or edit a board of the user's own – e.g. a forum that exists inside the story. */
function editCustomBoard(forum, bd, onDone) {
  const name = h('input', { class: 'ab-input', type: 'text', maxLength: 60, value: bd?.name || '', placeholder: forum === '2ch' ? '例如：アイドル板、桜ヶ丘学園板' : '例如：/vt/ - Virtual YouTubers', autocomplete: 'off' });
  const anon = h('input', { class: 'ab-input', type: 'text', maxLength: 40, value: bd?.anon || '', placeholder: UI[forum].defaultName, autocomplete: 'off' });
  const vibe = h('textarea', { class: 'ab-input ab-ta', rows: 4, maxLength: 1200, placeholder: '这个板块聊什么、住民是什么样的人。也可以写成剧情世界里的论坛，例如：桜ヶ丘学园的校内匿名版，住民都是在校学生，大家都认识学生会长。' });
  vibe.value = bd?.vibe || '';
  let ws = bd ? bd.ws !== false : true;
  const save1 = () => {
    const n = oneLine(name.value).slice(0, 60);
    if (!n) { toast('请填写板块名称', 'error'); name.focus(); return; }
    const v = clean(vibe.value).slice(0, 1200);
    const def = {
      id: bd?.id || `c-${uuid().slice(0, 8)}`, name: n, short: (n.match(/^\/[^/\s]+\//)?.[0] || n).slice(0, 16),
      anon: oneLine(anon.value).slice(0, 40), desc: oneLine(v).slice(0, 40) || '自定义板块', vibe: v, ws, custom: true,
    };
    const list = S.customBoards[forum];
    const i = list.findIndex(x => x.id === def.id);
    if (i >= 0) list[i] = def; else list.push(def);
    save();
    closeLayer('boardedit');
    toast(bd ? '板块已更新' : '板块已创建');
    onDone(def.id);
  };
  const remove = async () => {
    const n = S.threads.filter(t => t.board === forum && t.sub === bd.id).length;
    const fallback = BOARDS[forum][0];
    if (!(await confirmDialog(n ? `删除「${bd.name}」？板里的 ${n} 个帖子会移到「${fallback.name}」。` : `删除「${bd.name}」？`, '删除', '取消'))) return;
    for (const t of S.threads) if (t.board === forum && t.sub === bd.id) t.sub = fallback.id;
    S.customBoards[forum] = S.customBoards[forum].filter(x => x.id !== bd.id);
    if (S.sub[forum] === bd.id) S.sub[forum] = fallback.id;
    save();
    closeLayer('boardedit');
    onDone(S.sub[forum]);
  };
  const sheet = h('div', { class: 'ab-sheet ab-boardedit', role: 'dialog', 'aria-label': bd ? '编辑板块' : '自定义板块' },
    h('div', { class: 'ab-sheet-grab', 'aria-hidden': 'true' }),
    h('div', { class: 'ab-sheet-head' },
      h('button', { type: 'button', class: 'ab-textbtn', onclick: () => closeLayer('boardedit') }, '取消'),
      h('div', { class: 'ab-sheet-title' }, bd ? '编辑板块' : '自定义板块'),
      h('button', { type: 'button', class: 'ab-btn ab-btn-primary', onclick: save1 }, '保存')),
    h('div', { class: 'ab-form ab-boardedit-form' },
      field('板块名称', name),
      field('默认名字', anon),
      field('板块说明（会告诉 AI 这个板块的话题和住民）', vibe, 'is-body'),
      forum === '4ch' ? h('div', { class: 'ab-inline-opt' }, switchBtn(ws, v => { ws = v; }, '全年龄板块'), h('span', {}, '全年龄板块（蓝色版面）')) : null,
      bd ? h('button', { type: 'button', class: 'ab-btn is-danger ab-boardedit-del', onclick: remove }, '删除这个板块') : null));
  openLayer(sheet, { key: 'boardedit' });
  if (!ui.compact) setTimeout(() => name.focus({ preventScroll: true }), 80);
}

/* Move a whole thread in time (gaps kept): pick when its first post was written. */
function adjustThreadTime(t) {
  const first = Number(t.posts[0]?.ts) || Number(t.created) || forumNow();
  const last = lastPostTs(t);
  const input = h('input', { class: 'ab-input ab-datetime', type: 'datetime-local', step: '60', value: toLocalInput(first) });
  const toNow = h('button', { type: 'button', class: 'ab-btn' }, '让最后一帖落在论坛现在');
  toNow.addEventListener('click', () => { input.value = toLocalInput(forumNow() - (last - first)); });
  const apply = () => {
    const ts = new Date(input.value).getTime();
    if (!Number.isFinite(ts)) { toast('请选择日期和时间', 'error'); return; }
    shiftThread(t, Math.round((ts - first) / 60000) * 60000);
    save();
    closeLayer('timeedit');
    render({ scroll: 'keep' });
    toast(`这串从 ${fmtFull(Number(t.posts[0]?.ts) || ts)} 开始`);
  };
  const sheet = h('div', { class: 'ab-sheet ab-timeedit', role: 'dialog', 'aria-label': '调整这串的时间' },
    h('div', { class: 'ab-sheet-grab', 'aria-hidden': 'true' }),
    h('div', { class: 'ab-sheet-head' },
      h('button', { type: 'button', class: 'ab-textbtn', onclick: () => closeLayer('timeedit') }, '取消'),
      h('div', { class: 'ab-sheet-title' }, '调整这串的时间'),
      h('button', { type: 'button', class: 'ab-btn ab-btn-primary', onclick: apply }, '保存')),
    h('div', { class: 'ab-form ab-boardedit-form' },
      field('第一帖的时间', input),
      h('p', { class: 'ab-row-note ab-timeedit-note' }, `整串帖子一起平移，帖子之间的间隔不变。现在：${fmtFull(first)} 到 ${fmtFull(last)}。`),
      toNow));
  openLayer(sheet, { key: 'timeedit' });
}

function threadMenu(t) {
  const Lb = UI[t.board];
  actionSheet(null, [
    { label: `网友语气：${TONE_LABEL[toneOf()]}（点此更改）`, run: () => actionSheet('网友语气', TONE_OPTIONS.map(([v, l]) => ({ label: (v === toneOf() ? '✓ ' : '') + l, run: () => { S.tone = v; save(); toast(`网友语气：${l}，之后的回复生效`); } }))) },
    { label: `AI 来源改用${S.api.mode === 'custom' ? '「跟随酒馆」' : '「独立 API」'}`, run: switchSource },
    { label: '调整这串的时间', run: () => adjustThreadTime(t) },
    { label: Lb.copyThread, run: async () => toast((await copyText(threadAsText(t))) ? Lb.copied : '复制失败') },
    {
      label: Lb.delThread, danger: true,
      run: async () => {
        if (!(await confirmDialog(Lb.delThreadQ, Lb.delOk))) return;
        S.threads = S.threads.filter(x => x.id !== t.id);
        S.selected = null;
        go('list');
      },
    },
  ]);
}

function toast(message, kind = 'info') {
  if (!R.toast) return;
  if (!ui.open) {
    // Panel closed: fall back to SillyTavern's own toastr so the message is still seen.
    const tr = globalThis.toastr;
    if (tr) { (kind === 'error' ? tr.error : tr.info).call(tr, message, 'Anonymous Board'); return; }
  }
  R.toast.textContent = message;
  R.toast.className = `ab-toast is-${kind} is-in`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { R.toast.className = `ab-toast is-${kind}`; }, kind === 'error' ? 5200 : 2600);
}

/* ------------------------------------------------------------------ compose */
function field(label, input, cls = '') {
  return h('label', { class: 'ab-field ' + cls }, h('span', { class: 'ab-field-label' }, label), input);
}
function switchBtn(on, onChange, label) {
  const b = h('button', { type: 'button', class: 'ab-switch', role: 'switch', 'aria-checked': String(!!on), 'aria-label': label || null });
  b.addEventListener('click', () => { const v = b.getAttribute('aria-checked') !== 'true'; b.setAttribute('aria-checked', String(v)); onChange(v); });
  return b;
}
function autoFetchRow(Lb) {
  return h('div', { class: 'ab-inline-opt' }, switchBtn(S.autoFetch, v => { S.autoFetch = v; save(); }, Lb.autoFetch), h('span', {}, Lb.autoFetch));
}

function openCompose(t, insert) {
  const Lb = UI[t.board];
  if (t.posts.length >= MAX_POSTS) { toast(Lb.over.split('\n')[0]); return; }
  const d = ui.drafts[t.id] || (ui.drafts[t.id] = { text: '' });
  if (insert) d.text = (d.text && !d.text.endsWith('\n') ? d.text + '\n' : d.text) + insert;
  const remembered = S.names[t.board] || {};
  const name = h('input', { class: 'ab-input', type: 'text', maxLength: 40, placeholder: anonOf(t.board, boardOf(t)), value: remembered.name || '', autocomplete: 'off' });
  const mail = h('input', { class: 'ab-input', type: 'text', maxLength: 20, placeholder: Lb.phMail, value: remembered.mail || '', autocomplete: 'off', autocapitalize: 'off' });
  const ta = h('textarea', { class: 'ab-input ab-ta', maxLength: 3000, placeholder: Lb.phReply, rows: 5 });
  ta.value = d.text;
  ta.addEventListener('input', () => { d.text = ta.value; });
  const submit = () => {
    const text = clean(ta.value);
    if (!text) { toast(Lb.needBody); ta.focus(); return; }
    addUserPost(t, { name: name.value, mail: mail.value, text });
    d.text = '';
    save();
    closeLayer('compose');
    ui.dividerAt = null;
    render({ scroll: 'bottom' });
    if (S.autoFetch) summon(t.id);
  };
  ta.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); } });
  const form = t.board === '2ch'
    ? h('div', { class: 'ab-form ab-form-2ch' },
      h('div', { class: 'ab-form-row2' }, field(Lb.fName, name), field(Lb.fMail, mail)),
      field(Lb.fBody, ta, 'is-body'))
    : h('div', { class: 'ab-form ab-form-4ch' },
      h('div', { class: 'ab-pf-row' }, h('span', { class: 'ab-postblock' }, Lb.fName), name),
      h('div', { class: 'ab-pf-row' }, h('span', { class: 'ab-postblock' }, Lb.fMail), mail),
      h('div', { class: 'ab-pf-row is-body' }, h('span', { class: 'ab-postblock' }, Lb.fBody), ta));
  const sheet = h('div', { class: 'ab-sheet ab-compose', role: 'dialog', 'aria-label': Lb.reply },
    h('div', { class: 'ab-sheet-grab', 'aria-hidden': 'true' }),
    h('div', { class: 'ab-sheet-head' },
      h('button', { type: 'button', class: 'ab-textbtn', onclick: () => closeLayer('compose') }, Lb.cancel),
      h('div', { class: 'ab-sheet-title' }, Lb.reply),
      h('button', { type: 'button', class: 'ab-btn ab-btn-primary', onclick: submit }, Lb.submitReply)),
    form,
    autoFetchRow(Lb));
  openLayer(sheet, { key: 'compose' });
  setTimeout(() => { ta.focus({ preventScroll: true }); ta.setSelectionRange(ta.value.length, ta.value.length); }, 60);
}

/* ------------------------------------------------------------------ screens */
function go(screen, opts) {
  closeAllLayers();
  S.screen = screen;
  save();
  render(opts);
}
function openThread(t) {
  S.selected = t.id;
  if (t.unread > 0) {
    const firstNew = t.posts.length - t.unread + 1;
    ui.dividerAt = firstNew > 1 ? (t.posts[firstNew - 1]?.no ?? null) : null;
    t.unread = 0;
  } else ui.dividerAt = null;
  go('thread', { scroll: ui.dividerAt ? 'divider' : (ui.lastScroll[t.id] != null ? ui.lastScroll[t.id] : 'bottom') });
  updateBadge();
}

function appbar({ back, title, sub, right = [], titleCls = '' }) {
  return h('header', { class: 'ab-appbar' },
    back ? h('button', { type: 'button', class: 'ab-iconbtn', 'aria-label': '返回', onclick: back }, icon('back')) : h('span', { class: 'ab-iconbtn-space' }),
    h('div', { class: 'ab-appbar-title ' + titleCls }, h('div', { class: 'ab-appbar-main' }, title), sub ? h('div', { class: 'ab-appbar-sub' }, sub) : null),
    h('div', { class: 'ab-appbar-right' }, right,
      h('button', { type: 'button', class: 'ab-iconbtn', 'aria-label': '收起论坛', title: '收起', onclick: () => setOpen(false) }, icon('close'))));
}

function boardSwitch() {
  const other = S.board === '2ch' ? '4ch' : '2ch';
  const otherUnread = S.threads.filter(t => t.board === other).reduce((a, t) => a + (t.unread || 0), 0);
  const seg = h('div', { class: 'ab-boardswitch', role: 'tablist', 'aria-label': '切换论坛' });
  for (const [b, label] of [['2ch', '2ch'], ['4ch', '4chan']]) {
    seg.append(h('button', {
      type: 'button', role: 'tab', class: 'ab-bs-btn' + (S.board === b ? ' is-on' : ''), 'aria-selected': String(S.board === b),
      onclick: () => { if (S.board === b) return; S.board = b; save(); syncRootAttrs(); render({ scroll: 'top' }); },
    }, label, b === other && otherUnread ? h('span', { class: 'ab-dot', 'aria-label': '有新回复' }) : null));
  }
  return seg;
}

function bottomNav() {
  const Lb = L();
  const tab = (id, ic, label) => h('button', {
    type: 'button', class: 'ab-tab' + (S.screen === id ? ' is-on' : ''), 'aria-current': S.screen === id ? 'page' : null,
    onclick: () => go(id, { scroll: 'top' }),
  }, icon(ic), h('span', { class: 'ab-tab-label' }, label));
  return h('nav', { class: 'ab-tabs' }, tab('list', S.board === '2ch' ? 'list' : 'grid', Lb.tabList), tab('new', 'compose', Lb.tabNew), tab('settings', 'sliders', Lb.tabSettings));
}

function momentum(t) {
  const secs = Math.max(60, (Math.max(forumNow(), lastPostTs(t)) - t.created) / 1000);
  return Math.round(t.posts.filter(p => !p.del).length / (secs / 86400));
}

function viewList() {
  const Lb = L();
  const bd = boardDef(S.board, curSub(S.board));
  const threads = S.threads.filter(t => t.board === S.board && t.sub === bd.id).sort((a, b) => (b.bumped || 0) - (a.bumped || 0));
  const body = h('main', { class: 'ab-body ab-list ab-list-' + S.board });
  if (!threads.length) {
    body.append(h('div', { class: 'ab-empty' },
      h('div', { class: 'ab-empty-mark' }, icon('mask', 'ab-empty-ic')),
      h('p', {}, Lb.empty),
      h('button', { type: 'button', class: 'ab-btn ab-btn-primary', onclick: () => go('new') }, Lb.emptyCta)));
  } else if (S.board === '2ch') {
    const ol = h('ol', { class: 'ab-subjects' });
    threads.forEach((t, i) => {
      const n = t.posts.filter(p => !p.del).length;
      ol.append(h('li', {}, h('button', { type: 'button', class: 'ab-subject', onclick: () => openThread(t) },
        h('span', { class: 'ab-subject-no' }, `${i + 1}:`),
        h('span', { class: 'ab-subject-main' },
          h('span', { class: 'ab-subject-title' }, t.title || '（無題）', h('span', { class: 'ab-subject-count' }, ` (${n})`)),
          h('span', { class: 'ab-subject-meta' },
            h('span', {}, `${Lb.momentum} ${momentum(t).toLocaleString()}`),
            h('span', {}, shortTime(t.bumped || t.created)),
            ui.busy.has(t.id) ? h('span', { class: 'ab-subject-busy' }, Lb.fetching + '…') : null)),
        t.unread ? h('span', { class: 'ab-badge' }, Lb.newCount(t.unread)) : null)));
    });
    body.append(ol);
  } else {
    const grid = h('div', { class: 'ab-catalog' });
    for (const t of threads) {
      const op = t.posts[0];
      const n = t.posts.filter(p => !p.del).length - 1;
      grid.append(h('button', { type: 'button', class: 'ab-cat', onclick: () => openThread(t) },
        h('span', { class: 'ab-cat-thumb', style: thumbStyle(t.id) }, t.unread ? h('span', { class: 'ab-badge' }, Lb.newCount(t.unread)) : null),
        h('span', { class: 'ab-cat-meta' }, `R: ${Math.max(0, n)} / I: 0`),
        h('span', { class: 'ab-cat-teaser' },
          t.title ? h('b', {}, t.title + ': ') : null,
          oneLine(op?.text || '').slice(0, 90))));
    }
    body.append(grid);
  }
  const today = fmtDay(forumNow(), S.board);
  const elsewhere = S.threads.some(t => t.board === S.board && t.sub !== bd.id && t.unread);
  const pick = h('button', {
    type: 'button', class: 'ab-boardbtn', 'aria-haspopup': 'dialog', title: S.board === '2ch' ? '板を選ぶ' : 'Choose a board',
    onclick: () => openBoardPicker(S.board, id => { S.sub[S.board] = id; save(); render({ scroll: 'top' }); }),
  }, h('span', { class: 'ab-boardbtn-name' }, bd.name), icon('close', 'ab-ic ab-ic-chev'), elsewhere ? h('span', { class: 'ab-dot ab-dot-inline', 'aria-label': '其他板块有新回复' }) : null);
  const title = S.board === '2ch'
    ? appbar({ title: pick, sub: `${Lb.boardSub}　${today}`, titleCls: 'is-board' })
    : appbar({ title: pick, sub: today, titleCls: 'is-board' });
  return [title, boardSwitch(), body, bottomNav()];
}

function viewThread(t) {
  const Lb = UI[t.board];
  const ctx = threadCtx(t);
  const body = h('main', { class: `ab-body ab-thread ab-thread-${t.board}` });
  if (t.board === '2ch') body.append(h('h1', { class: 'ab-t2-title' }, t.title || '（無題）'));
  if (!t.posts.length) body.append(h('p', { class: 'ab-note-inline' }, Lb.noPosts));
  for (const p of t.posts) {
    if (t.board === '4ch' && p.del) continue;
    if (ui.dividerAt && p.no === ui.dividerAt) body.append(h('div', { class: 'ab-divider', id: 'ab-divider' }, h('span', {}, Lb.divider)));
    body.append(postView(p, ctx));
  }
  if (ui.busy.has(t.id)) body.append(fetchingRow(t));
  if (t.posts.length >= MAX_POSTS) body.append(h('div', { class: 'ab-over' }, Lb.over));
  body.addEventListener('scroll', () => {
    ui.lastScroll[t.id] = body.scrollTop;
    if (R.jump && body.scrollHeight - body.scrollTop - body.clientHeight < 60) R.jump.classList.remove('is-in');
  }, { passive: true });

  const busy = ui.busy.has(t.id);
  const tool = (ic, label, run, extra = '') => h('button', { type: 'button', class: 'ab-tool ' + extra, onclick: run }, icon(ic), h('span', { class: 'ab-tab-label' }, label));
  const updateTool = () => { const b = tool('refresh', Lb.update, () => summon(t.id), 'is-primary' + (busy ? ' is-busy' : '')); b.title = `AI 来源：${sourceLabel()}`; return b; };
  const toolbar = h('nav', { class: 'ab-toolbar' },
    tool(t.board === '2ch' ? 'list' : 'grid', Lb.catalog, () => go('list', { scroll: 'top' })),
    tool('top', Lb.top, () => body.scrollTo({ top: 0, behavior: 'smooth' })),
    tool('bottom', Lb.bottom, () => body.scrollTo({ top: body.scrollHeight, behavior: 'smooth' })),
    updateTool(),
    tool('write', Lb.write, () => openCompose(t)));
  const jump = h('button', { type: 'button', class: 'ab-jump', onclick: () => { scrollToDivider(body); jump.classList.remove('is-in'); } });
  R.jump = jump;

  const head = t.board === '2ch'
    ? appbar({ back: () => go('list'), title: t.title || '（無題）', sub: `${boardOf(t).short}　${Lb.res(t.posts.filter(p => !p.del).length)}`, right: [h('button', { type: 'button', class: 'ab-iconbtn', 'aria-label': 'メニュー', onclick: () => threadMenu(t) }, icon('more'))], titleCls: 'is-thread' })
    : appbar({ back: () => go('list'), title: boardOf(t).name, sub: `No.${t.posts[0]?.pid ?? ''}`, right: [h('button', { type: 'button', class: 'ab-iconbtn', 'aria-label': 'Menu', onclick: () => threadMenu(t) }, icon('more'))], titleCls: 'is-board is-small' });
  return [head, body, jump, toolbar];
}

function scrollToDivider(body) {
  const d = body.querySelector('#ab-divider');
  if (d) body.scrollTo({ top: Math.max(0, d.offsetTop - 8), behavior: 'smooth' });
  else body.scrollTo({ top: body.scrollHeight, behavior: 'smooth' });
}

function viewNew() {
  const b = S.board, Lb = UI[b];
  const d = ui.newDraft[b] || (ui.newDraft[b] = { title: '', body: '' });
  const remembered = S.names[b] || {};
  const bd = boardDef(b, curSub(b));
  const name = h('input', { class: 'ab-input', type: 'text', maxLength: 40, placeholder: anonOf(b, bd), value: d.name ?? remembered.name ?? '', autocomplete: 'off' });
  const mail = h('input', { class: 'ab-input', type: 'text', maxLength: 20, placeholder: Lb.phMail, value: d.mail ?? remembered.mail ?? '', autocomplete: 'off', autocapitalize: 'off' });
  name.addEventListener('input', () => { d.name = name.value; });
  mail.addEventListener('input', () => { d.mail = mail.value; });
  const boardBtn = h('button', {
    type: 'button', class: 'ab-input ab-boardfield', 'aria-haspopup': 'dialog',
    onclick: () => openBoardPicker(b, id => { S.sub[b] = id; save(); render({ scroll: 'keep' }); }),
  }, h('span', { class: 'ab-boardfield-name' }, bd.name), icon('close', 'ab-ic ab-ic-chev'));
  const title = h('input', { class: 'ab-input', type: 'text', maxLength: 96, placeholder: Lb.phTitle, value: d.title, autocomplete: 'off' });
  const ta = h('textarea', { class: 'ab-input ab-ta', maxLength: 3000, placeholder: Lb.phBody, rows: 8 });
  ta.value = d.body;
  title.addEventListener('input', () => { d.title = title.value; });
  ta.addEventListener('input', () => { d.body = ta.value; });
  const submit = () => {
    const tt = oneLine(title.value).slice(0, 96), text = clean(ta.value);
    if (b === '2ch' && !tt) { toast(Lb.needTitle); title.focus(); return; }
    if (!text) { toast(Lb.needBody); ta.focus(); return; }
    const now = forumNow();
    const t = { id: uuid(), board: b, sub: bd.id, title: tt, created: now, bumped: now, userUid: makeUid(), unread: 0, posts: [] };
    addUserPost(t, { name: name.value, mail: mail.value, text });
    S.threads.push(t);
    S.selected = t.id;
    ui.newDraft[b] = { title: '', body: '' };
    S.sub[b] = bd.id;
    ui.dividerAt = null;
    go('thread', { scroll: 'top' });
    if (S.autoFetch) summon(t.id);
  };
  ta.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); } });
  const form = b === '2ch'
    ? h('div', { class: 'ab-form ab-form-2ch' },
      field('板', boardBtn),
      field(Lb.fTitle, title),
      h('div', { class: 'ab-form-row2' }, field(Lb.fName, name), field(Lb.fMail, mail)),
      field(Lb.fBody, ta, 'is-body'),
      h('div', { class: 'ab-form-actions' }, h('button', { type: 'button', class: 'ab-btn ab-btn-primary', onclick: submit }, Lb.submitThread)),
      autoFetchRow(Lb))
    : h('div', { class: 'ab-form ab-form-4ch' },
      h('div', { class: 'ab-pf-row' }, h('span', { class: 'ab-postblock' }, 'Board'), boardBtn),
      h('div', { class: 'ab-pf-row' }, h('span', { class: 'ab-postblock' }, Lb.fName), name),
      h('div', { class: 'ab-pf-row' }, h('span', { class: 'ab-postblock' }, Lb.fMail), mail),
      h('div', { class: 'ab-pf-row' }, h('span', { class: 'ab-postblock' }, Lb.fTitle), h('span', { class: 'ab-pf-inline' }, title, h('button', { type: 'button', class: 'ab-btn ab-btn-primary', onclick: submit }, Lb.submitThread))),
      h('div', { class: 'ab-pf-row is-body' }, h('span', { class: 'ab-postblock' }, Lb.fBody), ta),
      autoFetchRow(Lb));
  const body = h('main', { class: 'ab-body ab-newthread' }, form);
  return [appbar({ back: () => go('list'), title: Lb.newThread, titleCls: b === '4ch' ? 'is-postform' : '' }), body, bottomNav()];
}

/* settings use the user's own language (Chinese) – they configure the plugin, not the forum */
function seg(options, value, onPick) {
  const box = h('div', { class: 'ab-seg', role: 'radiogroup' });
  for (const [v, label] of options) {
    box.append(h('button', {
      type: 'button', role: 'radio', class: 'ab-seg-btn' + (v === value ? ' is-on' : ''), 'aria-checked': String(v === value),
      onclick: () => {
        box.querySelectorAll('.ab-seg-btn').forEach(x => { const on = x.dataset.v === v; x.classList.toggle('is-on', on); x.setAttribute('aria-checked', String(on)); });
        onPick(v);
      },
      dataset: { v },
    }, label));
  }
  return box;
}
/* Number field with − / + : type a value, tap to step, or hold a button to repeat (speeds up after a moment). */
function stepper(value, lo, hi, onChange, step = 1, digits = 0) {
  const fmt = v => Number(v).toFixed(digits);
  let cur = Number(value);
  const input = h('input', { class: 'ab-step-val', type: 'text', inputMode: digits ? 'decimal' : 'numeric', value: fmt(cur), 'aria-label': `数值（${lo}–${hi}）`, autocomplete: 'off', spellcheck: false });
  const set = v => {
    if (!Number.isFinite(v)) v = cur;
    v = +clamp(Math.round(v / step) * step, lo, hi).toFixed(digits);
    input.value = fmt(v);
    if (v !== cur) { cur = v; onChange(v); }
  };
  input.addEventListener('focus', () => input.select());
  input.addEventListener('change', () => set(parseFloat(input.value.replace(/[^\d.\-]/g, ''))));
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); set(parseFloat(input.value)); input.blur(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); set(cur + step); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); set(cur - step); }
  });
  const btn = (label, dir, aria) => {
    const b = h('button', { type: 'button', class: 'ab-step-btn', 'aria-label': aria }, label);
    let timer = 0, n = 0;
    const stopHold = () => { clearTimeout(timer); timer = 0; };
    b.addEventListener('contextmenu', e => e.preventDefault());
    b.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      n = 0;
      set(cur + dir * step);
      const tick = () => { n++; set(cur + dir * step * (n > 12 ? 5 : 1)); timer = setTimeout(tick, n > 4 ? 70 : 150); };
      timer = setTimeout(tick, 420);
    });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, stopHold);
    b.addEventListener('click', e => { if (e.detail === 0) set(cur + dir * step); }); // keyboard Enter / Space
    return b;
  };
  return h('div', { class: 'ab-stepper' }, btn('−', -1, '减少'), input, btn('+', 1, '增加'));
}
function stackRow(label, note, ...controls) {
  return h('div', { class: 'ab-row ab-row-stack' }, h('div', { class: 'ab-row-label' }, label, note ? h('small', {}, note) : null), controls);
}

function openModelPicker(ids, onPick) {
  const search = h('input', { class: 'ab-input', type: 'text', placeholder: `在 ${ids.length} 个模型中搜索`, autocomplete: 'off', autocapitalize: 'off', spellcheck: false });
  const list = h('div', { class: 'ab-picklist', role: 'listbox', 'aria-label': '模型' });
  const draw = () => {
    const q = search.value.trim().toLowerCase();
    const hits = ids.filter(id => !q || id.toLowerCase().includes(q));
    list.replaceChildren(...hits.slice(0, 400).map(id => h('button', {
      type: 'button', role: 'option', class: 'ab-pick' + (id === S.api.model ? ' is-on' : ''), 'aria-selected': String(id === S.api.model),
      onclick: () => { closeLayer('picker'); onPick(id); },
    }, id)));
    if (!hits.length) list.append(h('p', { class: 'ab-row-note' }, '没有匹配的模型。可以关掉这里，直接手动输入名称。'));
  };
  search.addEventListener('input', draw);
  draw();
  const sheet = h('div', { class: 'ab-sheet ab-picker', role: 'dialog', 'aria-label': '选择模型' },
    h('div', { class: 'ab-sheet-grab', 'aria-hidden': 'true' }),
    h('div', { class: 'ab-sheet-head' },
      h('button', { type: 'button', class: 'ab-textbtn', onclick: () => closeLayer('picker') }, '取消'),
      h('div', { class: 'ab-sheet-title' }, '选择模型'),
      h('span', { class: 'ab-sheet-spacer' })),
    h('div', { class: 'ab-picker-search' }, search),
    list);
  openLayer(sheet, { key: 'picker' });
  if (!ui.compact) setTimeout(() => search.focus({ preventScroll: true }), 80);
}

async function busyButton(btn, label, task) {
  const old = btn.textContent;
  btn.disabled = true;
  btn.textContent = label;
  try { await task(); } finally { btn.disabled = false; btn.textContent = old; }
}

const toLocalInput = ts => { const d = new Date(ts); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };

function clockGroup() {
  const rows = [row('时间来源', seg([['auto', '跟随剧情'], ['manual', '手动设定'], ['real', '现实时间']], S.clock.mode, v => {
    if (v === 'manual' && S.clock.mode !== 'manual') { S.clock.manual = forumNow(); S.clock.manualAt = Date.now(); }
    S.clock.mode = v;
    save();
    render({ scroll: 'keep' });
  }))];
  rows.push(row('论坛现在', h('span', { class: 'ab-clock-now' }, fmtFull(forumNow()))));
  if (S.clock.mode === 'auto') {
    const info = refreshStory(true);
    const lines = info ? info.notes : ['最近 40 条聊天、作者注释和角色卡场景里都没找到日期或时间，暂时使用现实时间。在剧情里写明时间（例如「2015年3月14日 21:30」）就能识别，或者改用「手动设定」。'];
    rows.push(h('div', { class: 'ab-row-note ab-clock-notes' }, lines.map(l => h('div', {}, l))));
    rows.push(row('识别依据', h('button', {
      type: 'button', class: 'ab-btn',
      onclick: () => { refreshStory(true); tickClock(); render({ scroll: 'keep' }); toast(storyClock.info ? `论坛时间：${fmtFull(forumNow())}` : '没有在剧情里找到时间'); },
    }, '重新识别'), '只在本地读取最近的聊天、作者注释和角色卡场景，不会发送任何内容。剧情时间一变，论坛就跟着变；没变时论坛时钟会继续走，最多走 3 小时。'));
  } else if (S.clock.mode === 'manual') {
    const input = h('input', { class: 'ab-input ab-datetime', type: 'datetime-local', step: '60', value: toLocalInput(forumNow()) });
    input.addEventListener('change', () => {
      const ts = new Date(input.value).getTime();
      if (!Number.isFinite(ts)) return;
      S.clock.manual = ts; S.clock.manualAt = Date.now();
      save(); tickClock(); render({ scroll: 'keep' });
    });
    rows.push(stackRow('设定时间', '论坛时钟从这个时间开始，跟现实一样往前走。', input));
  } else {
    rows.push(h('p', { class: 'ab-row-note' }, '使用这台设备的当前时间。'));
  }
  return group('论坛时间', ...rows);
}

function apiGroup() {
  const rows = [row('生成方式', seg([['st', '跟随酒馆'], ['custom', '独立 API']], S.api.mode, v => { S.api.mode = v; save(); render({ scroll: 'keep' }); }))];
  if (S.api.mode === 'st') {
    const status = ST()?.onlineStatus;
    rows.push(h('p', { class: 'ab-row-note' }, status && status !== 'no_connection'
      ? `使用酒馆当前的模型和 API 连接：${status}`
      : '酒馆当前没有连接模型。在酒馆「API 连接」里连上之后就能用，或者改用独立 API。'));
    return group('AI 来源', ...rows);
  }
  const persist = () => { clearTimeout(apiGroup.t); apiGroup.t = setTimeout(save, 300); };
  const url = h('input', { class: 'ab-input', type: 'url', inputMode: 'url', placeholder: 'https://api.example.com/v1', value: S.api.url, autocomplete: 'off', autocapitalize: 'off', spellcheck: false });
  url.addEventListener('input', () => { S.api.url = url.value.trim(); persist(); });
  url.addEventListener('change', () => { const n = normBaseUrl(url.value); if (n) { url.value = n; S.api.url = n; save(); } });
  const chips = h('div', { class: 'ab-chips' }, API_PRESETS.map(([name, href]) => h('button', {
    type: 'button', class: 'ab-chip' + (normBaseUrl(S.api.url) === href ? ' is-on' : ''),
    onclick: () => { url.value = href; S.api.url = href; save(); chips.querySelectorAll('.ab-chip').forEach(c => c.classList.toggle('is-on', c.dataset.href === href)); },
    dataset: { href },
  }, name)));

  const key = h('input', { class: 'ab-input', type: 'password', placeholder: 'sk-…（本地模型可以留空）', value: S.api.key, autocomplete: 'off', autocapitalize: 'off', spellcheck: false, 'data-lpignore': 'true' });
  key.addEventListener('input', () => { S.api.key = key.value.trim(); persist(); });
  const reveal = h('button', { type: 'button', class: 'ab-btn', 'aria-pressed': 'false' }, '显示');
  reveal.addEventListener('click', () => { const show = key.type === 'password'; key.type = show ? 'text' : 'password'; reveal.textContent = show ? '隐藏' : '显示'; reveal.setAttribute('aria-pressed', String(show)); });

  const model = h('input', { class: 'ab-input', type: 'text', placeholder: '例如 gpt-4o-mini、deepseek-chat', value: S.api.model, autocomplete: 'off', autocapitalize: 'off', spellcheck: false });
  model.addEventListener('input', () => { S.api.model = model.value.trim(); persist(); });
  const listBtn = h('button', { type: 'button', class: 'ab-btn' }, '获取列表');
  listBtn.addEventListener('click', () => busyButton(listBtn, '获取中…', async () => {
    try {
      const ids = await fetchModels();
      openModelPicker(ids, id => { model.value = id; S.api.model = id; save(); toast(`模型：${id}`); });
    } catch (e) { toast(String(e?.message || e), 'error'); }
  }));

  const testBtn = h('button', { type: 'button', class: 'ab-btn ab-btn-primary' }, '测试连接');
  testBtn.addEventListener('click', () => busyButton(testBtn, '测试中…', async () => {
    save();
    if (!customReady()) { toast('先填写 API 地址和模型名称', 'error'); return; }
    const t0 = performance.now();
    try {
      const reply = await generateCustom({ systemPrompt: 'This is a connection test. Reply with the single word OK.', prompt: 'ping', responseLength: 200 });
      toast(`连接成功，用时 ${((performance.now() - t0) / 1000).toFixed(1)} 秒。模型回复：${oneLine(reply).slice(0, 40)}`);
    } catch (e) { toast('连接失败：' + String(e?.message || e), 'error'); }
  }));

  rows.push(
    stackRow('API 地址', '兼容 OpenAI 接口的地址，一般以 /v1 结尾', url, chips),
    stackRow('API Key', '只保存在这个浏览器里；导出备份时不会包含', h('div', { class: 'ab-inputrow' }, key, reveal)),
    stackRow('模型名称', null, h('div', { class: 'ab-inputrow' }, model, listBtn)),
    row('连接方式', seg([['proxy', '经酒馆转发'], ['direct', '浏览器直连']], S.api.route, v => { S.api.route = v; save(); }), '转发可避开跨域限制；酒馆在远程服务器、模型在本机时用直连'),
    row('温度', stepper(S.api.temp, 0, 2, v => { S.api.temp = v; save(); }, 0.1, 1)),
    row('检查设置', testBtn, '发送一条很短的测试消息'),
  );
  return group('AI 来源', ...rows);
}
function row(label, control, note) {
  return h('div', { class: 'ab-row' + (note ? ' has-note' : '') },
    h('div', { class: 'ab-row-label' }, label, note ? h('small', {}, note) : null),
    h('div', { class: 'ab-row-control' }, control));
}
function group(title, ...rows) {
  return h('section', { class: 'ab-group' }, title ? h('h3', { class: 'ab-group-title' }, title) : null, h('div', { class: 'ab-group-box' }, rows));
}

function viewSettings() {
  const ctxRows = [
    row('读取方式', seg([['none', '不读取'], ['recent', '最近聊天'], ['summary', '剧情摘要']], S.ctx.mode, v => { S.ctx.mode = v; save(); render({ scroll: 'keep' }); })),
  ];
  if (S.ctx.mode === 'recent') ctxRows.push(row('读取条数', stepper(S.ctx.n, 2, 30, v => { S.ctx.n = v; save(); })));
  if (S.ctx.mode === 'summary') ctxRows.push(h('p', { class: 'ab-row-note' }, '使用酒馆「总结 Summarize」扩展生成的最新摘要；没有摘要时改读最近聊天。'));
  const lore = h('textarea', { class: 'ab-input ab-ta ab-lore', rows: 3, maxLength: 1500, placeholder: '论坛住民都知道的世界观事实，可留空。\n例如：主角是当红乐队主唱，上周刚上过热搜。' });
  lore.value = S.lore;
  lore.addEventListener('input', () => { S.lore = lore.value; clearTimeout(viewSettings.t); viewSettings.t = setTimeout(save, 400); });
  ctxRows.push(h('div', { class: 'ab-row ab-row-stack' }, h('div', { class: 'ab-row-label' }, '公共设定', h('small', {}, '住民会当作常识；剧情内容只当背景，住民不会知道。')), lore));

  const fileIn = h('input', { type: 'file', accept: 'application/json,.json', class: 'ab-hidden-file', onchange: () => importData(fileIn) });

  const body = h('main', { class: 'ab-body ab-settings' },
    apiGroup(),
    clockGroup(),
    group('论坛',
      row('2ch 回复语言', seg([['auto', '日本語'], ['zh', '中文'], ['en', 'English']], S.lang['2ch'], v => { S.lang['2ch'] = v; save(); })),
      row('4chan 回复语言', seg([['auto', 'English'], ['zh', '中文'], ['ja', '日本語']], S.lang['4ch'], v => { S.lang['4ch'] = v; save(); })),
      row('配色', seg([['classic', '经典'], ['dark', '夜间'], ['auto', '跟随系统']], S.theme, v => { S.theme = v; save(); syncRootAttrs(); }))),
    group('网友回复',
      row('网友语气', seg(TONE_OPTIONS, toneOf(), v => { S.tone = v; save(); }), '温和：基本友善，会帮你出主意；普通：有好有坏，偶尔吐槽；毒舌：原汁原味的匿名版，嘴很毒'),
      row('每次回复数', stepper(S.count, 1, MAX_COUNT, v => { S.count = v; save(); }), `1–${MAX_COUNT}，可直接输入。超过 ${BATCH} 条会每 ${BATCH} 条一批接着生成，生成中再点「新着 / Update」可以停止`),
      row('发帖后自动获取回复', switchBtn(S.autoFetch, v => { S.autoFetch = v; save(); }, '发帖后自动获取回复'))),
    group('剧情参考（可选）', ...ctxRows),
    group('悬浮按钮',
      row('闲置时自动收起', switchBtn(S.fab.autoTuck, v => { S.fab.autoTuck = v; save(); scheduleTuck(); }, '闲置时自动收起'), '4 秒不操作就贴边收起；长按按钮也能收起'),
      row('显示悬浮按钮', switchBtn(!S.fab.hidden, v => { setFabHidden(!v); }, '显示悬浮按钮'), '隐藏后可从酒馆魔杖菜单或 /anonboard 打开'),
      row('按钮位置', h('button', { type: 'button', class: 'ab-btn', onclick: () => { resetFab(); toast('悬浮按钮已回到右侧'); } }, '重置'))),
    group('数据',
      row('备份', h('div', { class: 'ab-btnrow' },
        h('button', { type: 'button', class: 'ab-btn', onclick: exportData }, '导出'),
        h('button', { type: 'button', class: 'ab-btn', onclick: () => fileIn.click() }, '导入'), fileIn)),
      row('全部帖子', h('button', {
        type: 'button', class: 'ab-btn is-danger',
        onclick: async () => {
          if (!(await confirmDialog('删除两个论坛里的全部帖子？此操作无法撤销，建议先导出备份。', '全部删除', '取消'))) return;
          S.threads = []; S.selected = null; save(); render({ scroll: 'keep' }); updateBadge(); toast('已清空');
        },
      }, '清空'), `共 ${S.threads.length} 个帖子`)),
    h('p', { class: 'ab-foot' }, `Anonymous Board v${VERSION}。插件不修改预设，也不往聊天记录里写任何东西。帖子和 API 设置只保存在这个浏览器里，换设备请用导出／导入（API Key 不会被导出）。`));
  return [appbar({ back: () => go('list'), title: L().tabSettings }), body, bottomNav()];
}

/* ------------------------------------------------------------------ import / export */
function exportData() {
  // The API key never leaves the browser through a backup file.
  const state = { ...S, api: { ...S.api, key: '' } };
  const data = JSON.stringify({ app: 'AnonymousBoard-ST', version: VERSION, exported: new Date().toISOString(), state }, null, 1);
  const blob = new Blob([data], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: `anonymous-board-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  toast('备份已导出');
}
function importData(input) {
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result || ''));
      const src = data.state || data;
      const list = Array.isArray(src.threads) ? src.threads : [];
      const legacyBoard = src.skin === '4ch' ? '4ch' : null;
      const have = new Set(S.threads.map(t => t.id));
      let n = 0;
      for (const raw of list) {
        if (!raw || have.has(raw.id)) continue;
        const t = normThread(legacyBoard && !raw.board ? { ...raw, board: legacyBoard } : raw);
        S.threads.push(t);
        n++;
      }
      save();
      render({ scroll: 'keep' });
      updateBadge();
      toast(n ? `导入了 ${n} 个帖子` : '没有新的帖子可导入（已存在的会跳过）');
    } catch (e) {
      console.error('[AnonymousBoard] import failed', e);
      toast('导入失败：这不是 Anonymous Board 的备份文件', 'error');
    }
  };
  reader.readAsText(file);
}

/* ------------------------------------------------------------------ render */
function syncRootAttrs() {
  if (!R.root) return;
  const theme = S.theme === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'classic') : S.theme;
  R.root.dataset.board = S.board;
  R.root.dataset.theme = theme;
  R.root.dataset.ws = S.board === '4ch' && boardDef('4ch', curSub('4ch')).ws ? '1' : '0';
}

function render(opts = {}) {
  if (!R.app) return;
  syncRootAttrs();
  tickClock();
  let t = current();
  if (S.screen === 'thread' && !t) S.screen = 'list';
  const oldBody = R.app.querySelector('.ab-body');
  const prev = oldBody ? { top: oldBody.scrollTop, near: oldBody.scrollHeight - oldBody.scrollTop - oldBody.clientHeight < 90 } : null;
  if (S.screen === 'thread' && t) { S.board = t.board; S.sub[t.board] = t.sub; }
  syncRootAttrs();
  R.jump = null;
  const parts = S.screen === 'thread' ? viewThread(t) : S.screen === 'new' ? viewNew() : S.screen === 'settings' ? viewSettings() : viewList();
  const hadFocus = R.phone.contains(document.activeElement);
  R.app.replaceChildren(...parts);
  // Keep keyboard focus (and Escape) inside the phone when the focused control was just replaced,
  // but never pull focus away from SillyTavern's own input.
  if (ui.open && hadFocus && (!document.activeElement || document.activeElement === document.body)) R.phone.focus({ preventScroll: true });
  const body = R.app.querySelector('.ab-body');
  const scroll = opts.scroll ?? 'keep';
  if (body) {
    if (scroll === 'top') body.scrollTop = 0;
    else if (scroll === 'bottom') body.scrollTop = body.scrollHeight;
    else if (typeof scroll === 'number') body.scrollTop = scroll;
    else if (scroll === 'divider') { const d = body.querySelector('#ab-divider'); body.scrollTop = d ? Math.max(0, d.offsetTop - 8) : body.scrollHeight; }
    else if (scroll === 'arrival') {
      // Stay where the reader is. If they were at the end, bring the first new reply into view
      // only when it landed below the fold; otherwise offer a "new replies" pill.
      const d = (opts.anchorNo && body.querySelector(`#ab-post-${opts.anchorNo}`)) || body.querySelector('#ab-divider');
      body.scrollTop = prev ? prev.top : 0;
      if (prev?.near && d) {
        if (d.offsetTop > body.scrollTop + body.clientHeight - 140) body.scrollTop = Math.max(0, d.offsetTop - 8);
      } else if (R.jump) {
        R.jump.textContent = '↓ ' + UI[S.board].jumpNew(opts.arrived || 0);
        R.jump.classList.add('is-in');
      }
    } else if (prev) body.scrollTop = prev.top;
  }
  updateBadge();
}

/* Busy state changes only touch what shows it, so typing in a sheet is never interrupted. */
function refreshBusy() {
  if (!ui.open) return;
  const t = current();
  if (S.screen === 'thread' && t) {
    const body = R.app.querySelector('.ab-body');
    const near = body && body.scrollHeight - body.scrollTop - body.clientHeight < 90;
    const busy = ui.busy.has(t.id);
    R.app.querySelector('.ab-tool.is-primary')?.classList.toggle('is-busy', busy);
    const ind = body?.querySelector('.ab-fetching');
    if (busy && body) {
      if (ind) ind.replaceWith(fetchingRow(t));
      else { body.append(fetchingRow(t)); if (near) body.scrollTop = body.scrollHeight; }
    } else if (!busy && ind) ind.remove();
  } else if (S.screen === 'list' && !ui.layers.length) render({ scroll: 'keep' });
}

/* ------------------------------------------------------------------ open / close + desktop window */
function setOpen(open) {
  if (open === ui.open) return;
  ui.open = open;
  R.root.classList.toggle('is-open', open);
  R.phone.setAttribute('aria-hidden', String(!open));
  if (open) {
    if (S.fab.tucked) { S.fab.tucked = false; placeFab(true); }
    applyWin();
    if (S.screen === 'thread' && current()?.unread) openThread(current());
    else render({ scroll: S.screen === 'thread' ? (ui.lastScroll[S.selected] ?? 'bottom') : 'keep' });
    tickClock();
    clearInterval(ui.clock);
    ui.clock = setInterval(tickClock, 15000);
    setTimeout(() => { if (ui.open && !ui.compact) R.phone.focus({ preventScroll: true }); }, 50);
  } else {
    closeAllLayers();
    clearInterval(ui.clock);
    scheduleTuck();
  }
  R.fab.classList.toggle('is-active', open);
  R.fab.setAttribute('aria-expanded', String(open));
}
const togglePanel = () => setOpen(!ui.open);

function tickClock() { if (R.clock) R.clock.textContent = fmtClock(forumNow()); }

function applyWin() {
  if (!R.phone) return;
  if (ui.compact) { R.phone.style.cssText = ''; return; }
  const W = innerWidth, H = innerHeight;
  const w = clamp(S.win.w || 380, 330, Math.min(560, W - 16));
  const hh = clamp(S.win.h || 760, 520, Math.min(1000, H - 16));
  let x = S.win.x, y = S.win.y;
  if (x == null || y == null) {
    x = S.fab.side === 'left' ? 76 : W - w - 76;
    y = (H - hh) / 2;
  }
  x = clamp(x, 8, Math.max(8, W - w - 8));
  y = clamp(y, 8, Math.max(8, H - hh - 8));
  Object.assign(R.phone.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${hh}px` });
}

function bindWindowDrag(handle) {
  let drag = null;
  handle.addEventListener('pointerdown', e => {
    if (ui.compact || e.button !== 0 || e.target.closest('button, input, textarea, a, label')) return;
    const r = R.phone.getBoundingClientRect();
    drag = { dx: e.clientX - r.left, dy: e.clientY - r.top, id: e.pointerId };
    handle.setPointerCapture(e.pointerId);
    R.phone.classList.add('is-moving');
  });
  handle.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    S.win.x = clamp(e.clientX - drag.dx, 8, innerWidth - R.phone.offsetWidth - 8);
    S.win.y = clamp(e.clientY - drag.dy, 8, innerHeight - R.phone.offsetHeight - 8);
    R.phone.style.left = `${S.win.x}px`;
    R.phone.style.top = `${S.win.y}px`;
  });
  const end = () => { if (!drag) return; drag = null; R.phone.classList.remove('is-moving'); save(); };
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
}

function bindResize(grip) {
  let rs = null;
  grip.addEventListener('pointerdown', e => {
    if (ui.compact || e.button !== 0) return;
    e.preventDefault();
    const r = R.phone.getBoundingClientRect();
    rs = { x: e.clientX, y: e.clientY, w: r.width, h: r.height, left: r.left, top: r.top, id: e.pointerId };
    S.win.x = r.left; S.win.y = r.top;
    grip.setPointerCapture(e.pointerId);
    R.phone.classList.add('is-moving');
  });
  grip.addEventListener('pointermove', e => {
    if (!rs || e.pointerId !== rs.id) return;
    S.win.w = clamp(rs.w + e.clientX - rs.x, 330, Math.min(560, innerWidth - rs.left - 8));
    S.win.h = clamp(rs.h + e.clientY - rs.y, 520, Math.min(1000, innerHeight - rs.top - 8));
    R.phone.style.width = `${S.win.w}px`;
    R.phone.style.height = `${S.win.h}px`;
  });
  const end = () => { if (!rs) return; rs = null; R.phone.classList.remove('is-moving'); save(); };
  grip.addEventListener('pointerup', end);
  grip.addEventListener('pointercancel', end);
}

/* ------------------------------------------------------------------ floating button */
const fab = { x: 0, y: 0, start: null, lp: 0, suppress: false, tuckTimer: 0 };

function safeInsets() {
  if (!R.probe) return { top: 0, right: 0, bottom: 0, left: 0 };
  const cs = getComputedStyle(R.probe);
  return { top: parseFloat(cs.paddingTop) || 0, right: parseFloat(cs.paddingRight) || 0, bottom: parseFloat(cs.paddingBottom) || 0, left: parseFloat(cs.paddingLeft) || 0 };
}

/* The usable strip between SillyTavern's top bar and its input form, inside the safe area. */
function fabBounds() {
  const W = innerWidth, H = innerHeight, safe = safeInsets();
  let top = safe.top + 8, bottom = H - safe.bottom - 8;
  const bar = document.getElementById('top-bar') || document.getElementById('top-settings-holder');
  const rb = bar?.getBoundingClientRect();
  if (rb && rb.height > 0 && rb.bottom > 0 && rb.bottom < H * 0.35) top = Math.max(top, rb.bottom + 8);
  const form = document.getElementById('form_sheld') || document.getElementById('send_form');
  const rf = form?.getBoundingClientRect();
  if (rf && rf.height > 0 && rf.top > H * 0.5 && rf.top < H) bottom = Math.min(bottom, rf.top - 8);
  if (bottom - top < FAB + 16) { top = safe.top + 8; bottom = H - safe.bottom - 8; }
  return { left: safe.left + 6, right: W - safe.right - 6, top, bottom };
}

function placeFab(animate) {
  if (!R.fab) return;
  const b = fabBounds();
  const x = S.fab.side === 'left' ? b.left : b.right - FAB;
  const span = Math.max(0, b.bottom - FAB - b.top);
  const y = b.top + span * clamp(S.fab.y, 0, 1);
  fab.x = x; fab.y = y;
  const hide = S.fab.tucked ? (S.fab.side === 'left' ? -(FAB * 0.64 + b.left) : FAB * 0.64 + (innerWidth - b.right)) : 0;
  R.fab.classList.toggle('is-animating', !!animate);
  R.fab.classList.toggle('is-tucked', !!S.fab.tucked);
  R.fab.dataset.side = S.fab.side;
  R.fab.style.transform = `translate3d(${Math.round(x + hide)}px, ${Math.round(y)}px, 0)`;
}

function setTucked(v, persist = true) {
  if (S.fab.tucked === v) return;
  S.fab.tucked = v;
  if (persist) save();
  placeFab(true);
  R.fab.setAttribute('aria-label', v ? '展开匿名论坛按钮' : '打开匿名论坛');
}

function scheduleTuck() {
  clearTimeout(fab.tuckTimer);
  if (!S.fab.autoTuck || ui.open || S.fab.tucked) return;
  fab.tuckTimer = setTimeout(() => { if (!ui.open && !fab.start) setTucked(true, false); }, 4000);
}

function setFabHidden(hidden) {
  S.fab.hidden = hidden;
  save();
  R.fab.hidden = hidden;
  const cb = document.getElementById('ab-st-showfab');
  if (cb) cb.checked = !hidden;
}

function resetFab() {
  S.fab.side = 'right'; S.fab.y = DEFAULTS.fab.y; S.fab.tucked = false;
  save();
  placeFab(true);
}

function updateBadge(pulse = false) {
  if (!R.badge) return;
  const n = S.threads.reduce((a, t) => a + (t.unread || 0), 0);
  R.badge.textContent = n > 99 ? '99+' : String(n);
  R.badge.hidden = n === 0;
  R.fab.classList.toggle('has-unread', n > 0);
  R.fab.setAttribute('aria-label', n ? `打开匿名论坛（${n} 条新回复）` : '打开匿名论坛');
  if (pulse && n) { R.fab.classList.remove('is-ping'); void R.fab.offsetWidth; R.fab.classList.add('is-ping'); }
}

function bindFab(el) {
  el.addEventListener('contextmenu', e => e.preventDefault());
  el.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    fab.suppress = false;
    clearTimeout(fab.tuckTimer);
    const r = el.getBoundingClientRect();
    fab.start = { px: e.clientX, py: e.clientY, x: r.left, y: r.top, cx: r.left, cy: r.top, id: e.pointerId, moved: false };
    try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    el.classList.add('is-pressed');
    clearTimeout(fab.lp);
    fab.lp = setTimeout(() => {
      if (!fab.start || fab.start.moved) return;
      fab.start = null;
      fab.suppress = true;
      el.classList.remove('is-pressed');
      navigator.vibrate?.(12);
      setTucked(!S.fab.tucked);
      if (S.fab.tucked) toast('按钮已收起，点一下即可展开', 'info');
    }, 520);
  });
  el.addEventListener('pointermove', e => {
    const s = fab.start;
    if (!s || e.pointerId !== s.id) return;
    const dx = e.clientX - s.px, dy = e.clientY - s.py;
    if (!s.moved && Math.hypot(dx, dy) < 7) return;
    if (!s.moved) { s.moved = true; clearTimeout(fab.lp); el.classList.add('is-dragging'); el.classList.remove('is-tucked', 'is-animating'); }
    const x = clamp(s.x + dx, 0, innerWidth - FAB), y = clamp(s.y + dy, 0, innerHeight - FAB);
    el.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
    s.cx = x; s.cy = y;
  });
  const end = e => {
    clearTimeout(fab.lp);
    el.classList.remove('is-pressed', 'is-dragging');
    const s = fab.start;
    fab.start = null;
    if (!s) return;
    if (s.moved) {
      fab.suppress = true;
      const b = fabBounds();
      S.fab.side = (s.cx + FAB / 2) < innerWidth / 2 ? 'left' : 'right';
      const span = Math.max(1, b.bottom - FAB - b.top);
      S.fab.y = clamp((s.cy - b.top) / span, 0, 1);
      S.fab.tucked = false;
      save();
      placeFab(true);
      setTimeout(() => { fab.suppress = false; }, 400);
      scheduleTuck();
    } else if (e.type === 'pointercancel') {
      scheduleTuck();
    }
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('click', () => {
    if (fab.suppress) { fab.suppress = false; return; }
    if (S.fab.tucked) { setTucked(false, true); scheduleTuck(); return; }
    el.classList.remove('is-pop'); void el.offsetWidth; el.classList.add('is-pop');
    togglePanel();
  });
}

function showFabHint() {
  if (S.fab.hinted || S.fab.hidden) return;
  S.fab.hinted = true;
  save();
  const tip = h('div', { class: 'ab-fab-hint', role: 'note' }, '拖动可移动，长按收起');
  R.root.append(tip);
  const r = R.fab.getBoundingClientRect();
  const left = S.fab.side === 'left' ? r.right + 10 : r.left - 10 - 160;
  Object.assign(tip.style, { left: `${clamp(left, 8, innerWidth - 168)}px`, top: `${r.top + FAB / 2 - 15}px` });
  requestAnimationFrame(() => tip.classList.add('is-in'));
  setTimeout(() => { tip.classList.remove('is-in'); setTimeout(() => tip.remove(), 400); }, 4200);
}

/* ------------------------------------------------------------------ viewport */
function syncViewport() {
  const vv = globalThis.visualViewport;
  const vh = vv ? vv.height : innerHeight;
  const vt = vv ? vv.offsetTop : 0;
  R.root.style.setProperty('--ab-vvh', `${Math.round(vh)}px`);
  R.root.style.setProperty('--ab-vvt', `${Math.round(vt)}px`);
  const compact = innerWidth <= 640 || innerHeight <= 540;
  if (compact !== ui.compact) { ui.compact = compact; R.root.classList.toggle('is-compact', compact); }
  applyWin();
  if (!fab.start) placeFab(false);
}

/* ------------------------------------------------------------------ SillyTavern entry points */
function mountStHooks() {
  const settingsHost = document.getElementById('extensions_settings2') || document.getElementById('extensions_settings');
  if (settingsHost && !document.getElementById('ab-st-settings')) {
    const wrap = document.createElement('div');
    wrap.id = 'ab-st-settings';
    wrap.innerHTML = `<div class="inline-drawer">
  <div class="inline-drawer-toggle inline-drawer-header"><b>匿名掲示板 · Anonymous Board</b><div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div></div>
  <div class="inline-drawer-content">
    <div class="flex-container"><div class="menu_button" id="ab-st-open">打开论坛</div><div class="menu_button" id="ab-st-reset">重置悬浮按钮位置</div></div>
    <label class="checkbox_label" for="ab-st-showfab"><input type="checkbox" id="ab-st-showfab"><span>显示悬浮按钮</span></label>
    <small>v${VERSION}。其余设置在论坛里的「设定 / Settings」页。</small>
  </div>
</div>`;
    settingsHost.append(wrap);
    wrap.querySelector('#ab-st-open').addEventListener('click', () => setOpen(true));
    wrap.querySelector('#ab-st-reset').addEventListener('click', () => { setFabHidden(false); resetFab(); });
    const cb = wrap.querySelector('#ab-st-showfab');
    cb.checked = !S.fab.hidden;
    cb.addEventListener('change', () => setFabHidden(!cb.checked));
  }
  const menu = document.getElementById('extensionsMenu');
  if (menu && !document.getElementById('ab-wand-item')) {
    const item = document.createElement('div');
    item.id = 'ab-wand-item';
    item.className = 'list-group-item flex-container flexGap5';
    item.title = '打开匿名论坛';
    item.innerHTML = '<div class="fa-solid fa-masks-theater extensionsMenuExtensionButton"></div><span>匿名掲示板</span>';
    item.addEventListener('click', () => setOpen(true));
    menu.append(item);
  }
  return !!(settingsHost && menu);
}

function registerCommand() {
  const c = ST();
  if (!c) return;
  const callback = () => { setOpen(true); return ''; };
  try {
    if (c.SlashCommandParser?.addCommandObject && c.SlashCommand?.fromProps) {
      c.SlashCommandParser.addCommandObject(c.SlashCommand.fromProps({ name: 'anonboard', callback, helpString: '打开匿名论坛 Anonymous Board' }));
    } else if (typeof c.registerSlashCommand === 'function') {
      c.registerSlashCommand('anonboard', callback, [], '打开匿名论坛 Anonymous Board', true, true);
    }
  } catch (e) { console.warn('[AnonymousBoard] slash command not registered', e); }
}

/* ------------------------------------------------------------------ init */
function init() {
  if (document.getElementById('ab-root')) return;
  load();

  R.root = h('div', { class: 'ab-root', id: 'ab-root' });
  R.probe = h('div', { class: 'ab-safe-probe', 'aria-hidden': 'true' });
  R.badge = h('span', { class: 'ab-fab-badge', hidden: true });
  R.fab = h('button', { type: 'button', class: 'ab-fab', 'aria-label': '打开匿名论坛', 'aria-expanded': 'false', 'aria-controls': 'ab-phone', title: '匿名掲示板' },
    h('span', { class: 'ab-fab-face' }, icon('mask', 'ab-fab-ic')), R.badge);
  R.fab.hidden = !!S.fab.hidden;

  R.clock = h('span', { class: 'ab-clock' }, fmtClock(forumNow()));
  R.status = h('div', { class: 'ab-status' },
    R.clock, h('span', { class: 'ab-island', 'aria-hidden': 'true' }),
    h('span', { class: 'ab-status-icons', 'aria-hidden': 'true' }, icon('signal', 'ab-si'), icon('wifi', 'ab-si'), icon('battery', 'ab-si ab-si-bat')));
  R.app = h('div', { class: 'ab-app' });
  R.toast = h('div', { class: 'ab-toast', role: 'status', 'aria-live': 'polite' });
  R.layer = h('div', { class: 'ab-layer' });
  const grip = h('div', { class: 'ab-grip', 'aria-hidden': 'true', title: '拖动调整大小' });
  R.screen = h('div', { class: 'ab-screen' }, R.status, R.app,
    h('button', { type: 'button', class: 'ab-home', 'aria-label': '收起论坛', onclick: () => setOpen(false) }),
    R.layer, R.toast);
  R.phone = h('section', { class: 'ab-phone', id: 'ab-phone', 'aria-label': 'Anonymous Board', 'aria-hidden': 'true', tabindex: '-1' }, R.screen, grip);
  R.root.append(R.probe, R.fab, R.phone);
  document.body.append(R.root);

  // Keep SillyTavern's global hotkeys (swipes, regenerate, Escape) away from anything typed in here.
  for (const type of ['keydown', 'keyup', 'keypress']) {
    R.phone.addEventListener(type, e => {
      if (type === 'keydown' && e.key === 'Escape') {
        if (!closeLayer()) setOpen(false);
        e.preventDefault();
      }
      e.stopPropagation();
    });
  }

  bindFab(R.fab);
  bindWindowDrag(R.status);
  bindAppbarDrag();
  bindResize(grip);

  syncViewport();
  syncRootAttrs();
  render();
  updateBadge();
  addEventListener('resize', syncViewport);
  globalThis.visualViewport?.addEventListener('resize', syncViewport);
  globalThis.visualViewport?.addEventListener('scroll', syncViewport);
  addEventListener('orientationchange', () => setTimeout(syncViewport, 250));
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', syncRootAttrs);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && ui.open && S.screen === 'thread' && current()?.unread) openThread(current());
  });
  // SillyTavern's bars settle a moment after load; re-measure so the button lands between them.
  setTimeout(() => placeFab(false), 600);
  setTimeout(() => placeFab(false), 2000);

  if (S.fab.autoTuck) setTucked(true, false);
  setTimeout(showFabHint, 1200);
  if (migratedCount) setTimeout(() => toast(`已从 v0.1 迁移 ${migratedCount} 个帖子`), 1500);

  let tries = 0;
  const hook = () => { if (!mountStHooks() && ++tries < 20) setTimeout(hook, 500); };
  hook();
  registerCommand();
}

/* The app bar doubles as a drag handle on desktop (the status bar is the primary one). */
function bindAppbarDrag() {
  let drag = null;
  R.app.addEventListener('pointerdown', e => {
    if (ui.compact || e.button !== 0 || !e.target.closest('.ab-appbar') || e.target.closest('button, input, textarea, a, label')) return;
    const r = R.phone.getBoundingClientRect();
    drag = { dx: e.clientX - r.left, dy: e.clientY - r.top, id: e.pointerId, el: e.target };
    try { e.target.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    R.phone.classList.add('is-moving');
  });
  R.app.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    S.win.x = clamp(e.clientX - drag.dx, 8, innerWidth - R.phone.offsetWidth - 8);
    S.win.y = clamp(e.clientY - drag.dy, 8, innerHeight - R.phone.offsetHeight - 8);
    R.phone.style.left = `${S.win.x}px`;
    R.phone.style.top = `${S.win.y}px`;
  });
  const end = () => { if (!drag) return; drag = null; R.phone.classList.remove('is-moving'); save(); };
  R.app.addEventListener('pointerup', end);
  R.app.addEventListener('pointercancel', end);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
else init();
})();
