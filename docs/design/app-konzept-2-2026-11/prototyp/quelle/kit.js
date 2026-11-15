// Mock-up-Baukasten im VU-Look (Schwarz, Weiß, Neongrün #c8f531, Inter)
const REPO = '/home/user/vision-universe-research';
const css = `
@font-face{font-family:Inter;src:url(file://${REPO}/assets/fonts/inter-latin.woff2) format("woff2");font-weight:100 900}
@font-face{font-family:Inter;src:url(file://${REPO}/assets/fonts/inter-latin-ext.woff2) format("woff2");font-weight:100 900;unicode-range:U+0100-02BA,U+20A0-20C0}
*{box-sizing:border-box}
body{margin:0;width:390px;height:844px;overflow:hidden;background:#000;color:#f4f5f1;font:500 15px/1.35 Inter,sans-serif;position:relative;-webkit-font-smoothing:antialiased}
.top{height:58px;display:flex;align-items:center;gap:9px;padding:0 16px;border-bottom:1px solid rgba(255,255,255,.09)}
.top .ic{width:32px;height:32px;border-radius:10px;background:#0e1013;border:1px solid rgba(255,255,255,.14);display:grid;place-items:center;color:#c8f531}
.top b{font-size:18px;font-weight:800;letter-spacing:-.02em}
.sp{flex:1}
.rnd{width:36px;height:36px;border-radius:99px;background:#151516;display:grid;place-items:center;color:#fff;flex:none}
.rnd.w{background:#fff;color:#000}.rnd.l{background:#c8f531;color:#101318}
.atlas{height:36px;padding:0 13px;border-radius:99px;background:#c8f531;color:#101318;font-weight:800;font-size:13.5px;display:flex;align-items:center;gap:5px}
.wrap{padding:14px 16px 0}
.eb{font-size:10.5px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#a1a7af}
.eb.l{color:#c8f531}
h1{font-size:33px;line-height:1;font-weight:900;letter-spacing:-.045em;margin:6px 0 8px}
h2{font-size:20px;line-height:1.1;font-weight:800;letter-spacing:-.025em;margin:0}
h3{font-size:16px;line-height:1.15;font-weight:800;letter-spacing:-.015em;margin:0}
p{margin:0}
.lead{color:#a1a7af;font-size:15px;line-height:1.35}
.card{background:#151516;border-radius:22px;padding:14px}
.card.line{background:none;border:1px solid rgba(255,255,255,.16)}
.card.lime{background:#c8f531;color:#101318}
.card.wh{background:#fff;color:#000}
.pill{display:inline-flex;align-items:center;gap:5px;height:26px;padding:0 10px;border-radius:999px;background:#c8f531;color:#101318;font-size:12.5px;font-weight:800;white-space:nowrap;flex:none}
.pill.dk{background:#232325;color:#f4f5f1}.pill.wh{background:#fff;color:#000}.pill.bk{background:#000;color:#fff}
.pill.ol{background:none;border:1px solid rgba(255,255,255,.28);color:#f4f5f1}
.pill.sm{height:21px;font-size:10.5px;padding:0 8px;letter-spacing:.04em;text-transform:uppercase}
.chip{height:38px;padding:0 14px;border-radius:999px;background:#151516;font-weight:700;font-size:14px;display:inline-flex;align-items:center;gap:6px;white-space:nowrap;flex:none}
.chip.on{background:#fff;color:#000}.chip.l{background:#c8f531;color:#101318}
.btn{height:52px;border-radius:999px;background:#c8f531;color:#101318;font-weight:800;font-size:16px;display:flex;align-items:center;justify-content:center;gap:8px}
.btn.ol{background:none;border:1px solid rgba(255,255,255,.28);color:#fff}.btn.wh{background:#fff;color:#000}.btn.bk{background:#000;color:#fff}
.row{display:flex;align-items:center;gap:12px;padding:11px 0;border-bottom:1px solid rgba(255,255,255,.09)}
.row.nb{border:0}
.lg{width:40px;height:40px;border-radius:12px;background:#fff;object-fit:contain;padding:5px;flex:none}
.lg.s{width:30px;height:30px;border-radius:9px;padding:4px}.lg.b{width:52px;height:52px;border-radius:15px;padding:7px}
.av{width:40px;height:40px;border-radius:99px;background:#fff;color:#000;display:grid;place-items:center;font-weight:900;font-size:14px;flex:none}
.hud{width:40px;height:40px;border-radius:12px;background:#0e1013;border:1px solid rgba(200,245,49,.25);display:grid;place-items:center;color:#c8f531;flex:none}
.dock{position:absolute;left:12px;right:12px;bottom:12px;height:66px;border-radius:26px;background:#0b0b0c;border:1px solid rgba(255,255,255,.16);display:flex;padding:6px;gap:2px}
.dock div{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;font-size:10.5px;font-weight:700;color:#a1a7af;border-radius:20px}
.dock .on{background:#c8f531;color:#101318}
.num{font-weight:900;letter-spacing:-.045em;line-height:1}
.mut{color:#a1a7af}.sec{color:#c3c7cc}.sm{font-size:12.5px}.xs{font-size:11px}.md{font-size:14px}
.b7{font-weight:700}.b8{font-weight:800}.lc{color:#c8f531}
.fl{display:flex;align-items:center}.col{display:flex;flex-direction:column}.g4{gap:4px}.g6{gap:6px}.g8{gap:8px}.g10{gap:10px}.g12{gap:12px}.g16{gap:16px}.sb{justify-content:space-between}.wr{flex-wrap:wrap}
.f1{flex:1;min-width:0}.mt4{margin-top:4px}.mt8{margin-top:8px}.mt12{margin-top:12px}.mt16{margin-top:16px}.mt20{margin-top:20px}.mt24{margin-top:24px}
.bar{height:8px;border-radius:9px;background:#2a2a2d;overflow:hidden}.bar i{display:block;height:100%;background:#fff;border-radius:9px}.bar.l i{background:#c8f531}
.rail{display:flex;gap:10px;overflow:hidden;margin-right:-16px}
.hr{height:1px;background:rgba(255,255,255,.09)}
.find{height:52px;border-radius:99px;background:#151516;display:flex;align-items:center;gap:10px;padding:0 6px 0 16px;color:#a1a7af;font-size:15.5px}
.find.wh{background:#fff;color:#55595f}
.seg{display:flex;background:#151516;border-radius:99px;padding:4px;font-weight:700;font-size:13.5px}.seg span{flex:1;text-align:center;padding:8px 0;border-radius:99px;color:#a1a7af}.seg .on{background:#fff;color:#000}
.tabs{display:flex;gap:6px;overflow:hidden;margin-right:-16px}
.poster{width:112px;flex:none;background:#151516;border-radius:18px;padding:10px}
.img{border-radius:18px;object-fit:cover;display:block}
.dot{width:8px;height:8px;border-radius:9px;background:#c8f531;flex:none}
.q{width:20px;height:20px;border-radius:99px;background:#fff;color:#000;display:grid;place-items:center;font-size:12px;font-weight:900;flex:none}
.note{position:absolute;left:0;right:0;bottom:0;height:120px;background:linear-gradient(transparent,#000 60%)}
`;
const I = {
  search: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>',
  user: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-5 15-5 16 0"/></svg>',
  spark: '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1l2.6 8.4L23 12l-8.4 2.6L12 23l-2.6-8.4L1 12l8.4-2.6z"/></svg>',
  heute: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8v9a1 1 0 01-1 1h-5v-6h-6v6H4a1 1 0 01-1-1z"/></svg>',
  entdecken: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/></svg>',
  analyse: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 20V10M12 20V4M19 20v-7"/></svg>',
  methoden: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4"/></svg>',
  meins: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7.5-4.6-9.3-9.4C1.4 8 3.6 4.5 7 4.5c2 0 3.700 1.100 5 3 1.300-1.900 3-3 5-3 3.400 0 5.600 3.500 4.300 7.100C19.500 16.400 12 21 12 21z"/></svg>',
  heart: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"><path d="M12 21s-7.5-4.6-9.3-9.4C1.400 8 3.600 4.500 7 4.500c2 0 3.700 1.100 5 3 1.300-1.900 3-3 5-3 3.400 0 5.600 3.500 4.300 7.100C19.500 16.400 12 21 12 21z"/></svg>',
  chev: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
  back: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  check: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5l5 5L20 6.500"/></svg>',
  x: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M5 5l14 14M19 5L5 19"/></svg>',
  flame: '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c1 4 5 5.500 5 10.500A5 5 0 017 13c0-1.500.5-2.500 1.500-3.500C9 11 10 11.500 10.500 11 11.500 9 10 6 12 2z"/><path d="M12 22a3.200 3.200 0 01-3.200-3.200c0-2 3.200-4.800 3.200-4.800s3.200 2.800 3.200 4.800A3.200 3.200 0 0112 22z" opacity=".55"/></svg>',
  lock: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/></svg>',
  bell: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 16V11a6 6 0 0112 0v5l2 2H4zM10 21h4"/></svg>',
  mic: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/></svg>',
  star: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3 6.500 7 .9-5.200 4.800 1.400 7L12 17.700 5.800 21.200l1.400-7L2 9.400l7-.9z"/></svg>',
  up: '▲', down: '▼'
};
const logo = (t, cls = '') => `<img class="lg ${cls}" src="file://${REPO}/discover/logos/files/${t}.png">`;
const theme = (n, w, h) => `<img class="img" src="file://${REPO}/assets/themen/${n}.webp" style="width:${w}px;height:${h}px">`;
const top = (title, right = '') => `<div class="top"><div class="ic">${I.spark}</div><b>${title}</b><div class="sp"></div>${right || `<div class="rnd">${I.search}</div><div class="atlas">${I.spark} Atlas</div><div class="rnd w">${I.user}</div>`}</div>`;
const topBack = (title, sub = '', right = '') => `<div class="top"><div class="rnd">${I.back}</div><div class="col"><b style="font-size:16px">${title}</b>${sub ? `<span class="xs mut">${sub}</span>` : ''}</div><div class="sp"></div>${right || `<div class="rnd">${I.heart}</div>`}</div>`;
const dock = (on) => `<div class="dock">${[['heute', 'Heute'], ['entdecken', 'Entdecken'], ['analyse', 'Analyse'], ['methoden', 'Methoden'], ['meins', 'Meins']].map(([k, l]) => `<div class="${k === on ? 'on' : ''}">${I[k]}${l}</div>`).join('')}</div>`;
// Kurslinie aus Zufallslauf, deterministisch
function rnd(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
function line(seed, w, h, trend = 0.4, n = 60, opt = {}) {
  const r = rnd(seed); let v = 50; const pts = [];
  for (let i = 0; i < n; i++) { const t = opt.peak ? (i < n * opt.peak ? Math.abs(trend) : -Math.abs(trend) * 1.6) : trend; v += (r() - 0.5 + t * 0.12) * 9; pts.push(v); }
  const mn = Math.min(...pts), mx = Math.max(...pts);
  const xy = pts.map((p, i) => [(i / (n - 1)) * w, h - 4 - ((p - mn) / (mx - mn || 1)) * (h - 8)]);
  const d = xy.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('');
  const last = xy[n - 1]; const c = opt.color || '#fff';
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block">${opt.fill ? `<defs><linearGradient id="g${seed}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c8f531" stop-opacity=".38"/><stop offset="1" stop-color="#c8f531" stop-opacity="0"/></linearGradient></defs><path d="${d}L${w} ${h}L0 ${h}Z" fill="url(#g${seed})"/>` : ''}${opt.base ? `<path d="M0 ${xy[0][1].toFixed(1)}H${w}" stroke="#5d636b" stroke-dasharray="3 4"/>` : ''}${opt.extra || ''}<path d="${d}" fill="none" stroke="${c}" stroke-width="${opt.sw || 2}" stroke-linejoin="round" stroke-linecap="round"/>${opt.dot === false ? '' : `<circle cx="${last[0] - 1}" cy="${last[1]}" r="4" fill="#c8f531" stroke="#000" stroke-width="1.5"/>`}</svg>`;
}
const ring = (pct, size = 54, sw = 6, label = '') => { const r = (size - sw) / 2, c = 2 * Math.PI * r; return `<div style="position:relative;width:${size}px;height:${size}px;flex:none"><svg width="${size}" height="${size}" style="transform:rotate(-90deg)"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#2a2a2d" stroke-width="${sw}"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#c8f531" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct / 100)}"/></svg><div style="position:absolute;inset:0;display:grid;place-items:center;font-weight:900;font-size:${Math.round(size * 0.27)}px;letter-spacing:-.03em">${label}</div></div>`; };
const chg = (v, big) => { const up = !/^[−-]/.test(v); return `<span class="pill ${up ? '' : 'wh'}" ${big ? 'style="height:34px;font-size:16px;padding:0 13px"' : ''}>${up ? '▲' : '▼'} ${v}</span>`; };
const bars = (vals, w = 150, h = 50, hi = -1) => { const mx = Math.max(...vals), bw = w / vals.length; return `<svg width="${w}" height="${h}">${vals.map((v, i) => `<rect x="${(i * bw + bw * 0.14).toFixed(1)}" y="${(h - (v / mx) * h).toFixed(1)}" width="${(bw * 0.72).toFixed(1)}" height="${((v / mx) * h).toFixed(1)}" rx="3" fill="${i === (hi < 0 ? vals.length - 1 : hi) ? '#c8f531' : '#fff'}"/>`).join('')}</svg>`; };
const S = (...parts) => `<!doctype html><meta charset="utf-8"><style>${css}</style><body>${parts.join('')}</body>`;
module.exports = { css, I, logo, theme, top, topBack, dock, line, ring, chg, bars, S, REPO };
