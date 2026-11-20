// 離線功能（打包時自動產生，不要手動改）
const VERSION = '7bd7a921';
const PAGES = ["./", "index.html", "favicon.png", "icon-180.png", "icon-512.png", "abc/", "color/", "dots/", "draw/", "match/", "memory/", "onet/", "puzzle/", "shop/", "slide/", "span/", "who/", "wire/"];      // 遊戲頁面：每個版本一份
const DATA = ["photos.json?v=5dc631653a", "pokemon-g1.json?v=8054860e13", "pokemon-g2.json?v=b5f233ab72", "pokemon-g3.json?v=806272ead0", "pokemon-g4.json?v=148f140145", "pokemon-g5.json?v=018f4c424f", "pokemon-g6.json?v=b835cd544c", "pokemon-g7.json?v=a2aeb7e3ca", "pokemon-g8.json?v=ca2a6e58ff", "pokemon-g9.json?v=38cd161e37"];        // 照片、寶可夢圖片：網址有版本號，沒變就不重新下載
const SIZES = {"index.html": 0.01, "favicon.png": 0.01, "icon-180.png": 0.02, "icon-512.png": 0.1, "abc/": 0.11, "color/": 13.66, "dots/": 13.66, "draw/": 0.05, "match/": 0.04, "memory/": 0.03, "onet/": 0.04, "puzzle/": 0.03, "shop/": 0.02, "slide/": 0.03, "span/": 0.03, "who/": 0.03, "wire/": 0.02, "photos.json?v=5dc631653a": 30.22, "pokemon-g1.json?v=8054860e13": 4.76, "pokemon-g2.json?v=b5f233ab72": 2.86, "pokemon-g3.json?v=806272ead0": 3.96, "pokemon-g4.json?v=148f140145": 3.17, "pokemon-g5.json?v=018f4c424f": 4.71, "pokemon-g6.json?v=b835cd544c": 2.31, "pokemon-g7.json?v=a2aeb7e3ca": 2.9, "pokemon-g8.json?v=ca2a6e58ff": 2.78, "pokemon-g9.json?v=38cd161e37": 3.73};
const PAGE_CACHE = 'pages-' + VERSION, DATA_CACHE = 'data';
const abs = u => new URL(u, self.registration.scope).href;
const noSearch = u => { const x = new URL(u); x.search = ''; return x.href; };

self.addEventListener('install', e => {
  e.waitUntil(caches.open(PAGE_CACHE).then(c => c.addAll(['./', 'index.html'].map(u => new Request(u, {cache: 'reload'})))).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

async function tell(msg){ (await self.clients.matchAll({includeUncontrolled: true})).forEach(c => c.postMessage(msg)); }
let preparing = null;
async function prepare(){
  const pc = await caches.open(PAGE_CACHE), dc = await caches.open(DATA_CACHE);
  const jobs = PAGES.map(u => [pc, u]).concat(DATA.map(u => [dc, u]));
  const total = jobs.length, totalMB = Object.values(SIZES).reduce((a, b) => a + b, 0);
  let done = 0, doneMB = 0, failed = 0;
  for (const [c, key] of jobs) {
    const u = abs(key);
    if (!(await c.match(u))) {
      try { const r = await fetch(u, {cache: 'reload'}); if (!r.ok) throw 0; await c.put(u, r); }
      catch(e) { failed++; }
    }
    done++; doneMB += SIZES[key] || 0;
    tell({type: 'offline-progress', done, total, doneMB, totalMB});
  }
  if (failed) { tell({type: 'offline-error', failed, total}); return; }
  // 全部準備好了，才清掉舊版本（避免還沒下載完就把舊的刪掉，結果離線不能玩）
  for (const k of await caches.keys()) if (k.startsWith('pages-') && k !== PAGE_CACHE) await caches.delete(k);
  const keep = new Set(DATA.map(abs));
  for (const r of await dc.keys()) if (!keep.has(r.url)) await dc.delete(r);
  tell({type: 'offline-ready', version: VERSION, totalMB});
}
self.addEventListener('message', e => {
  if (e.data === 'prepare') { if (!preparing) preparing = prepare().finally(() => { preparing = null; }); e.waitUntil(preparing); }
});

const timeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url); if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/version.json') || url.pathname.endsWith('/sw.js')) return;
  if (/\/(photos|pokemon-g\d+)\.json$/.test(url.pathname)) {          // 大檔：先用存好的
    e.respondWith((async () => {
      const dc = await caches.open(DATA_CACHE);
      const hit = await dc.match(req); if (hit) return hit;
      try { const r = await fetch(req); if (r.ok) dc.put(req, r.clone()); return r; }
      catch(err) { return (await dc.match(req, {ignoreSearch: true})) || Response.error(); }
    })());
    return;
  }
  e.respondWith((async () => {                                         // 頁面：有網路用最新的，沒網路用存好的
    try { const r = await timeout(fetch(req), 4000); if (r.ok) { const copy = r.clone(); caches.open(PAGE_CACHE).then(c => c.put(noSearch(req.url), copy)); } return r; }
    catch(err) { return (await caches.match(noSearch(req.url), {ignoreSearch: true})) || (await caches.match(req, {ignoreSearch: true})) || Response.error(); }
  })());
});
