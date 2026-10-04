// VU Hausstrategie HS1 (PREREGISTRATION-HS1.json): Faktoren zum Stichtag und Monatsportfolio
// mit Gesamtrendite, Kosten und Delisting-Szenarien. Rein (ohne Netz und Dateien), damit die
// Tests es mit kleinen Reihen pruefen koennen.
//
// Eingabe je Aktie (prepareStock): { id, survivor, delisted, date[], open[], high[], close[]
//   (split-bereinigt), rawClose[], rawVolume[], divAdj[], fund: { eps, rev } | null }
// eps/rev: [[periodEnd, value, firstFiled, derived, periodStart], ...] wie sec-pit.mjs.

export const HS1 = Object.freeze({
  minRawPrice: 5, minBars: 273, topLiquid: 1000, dvWindow: 63,
  momFrom: 252, momSkip: 21, volShort: 126, volLong: 252, highWindow: 252,
  fundMaxAgeDays: 135, sueQuarters: 8, sueMin: 4,
  slippageBps: 10, commissionBps: 1, bufferMult: 2, resizeLow: 0.5, resizeHigh: 2, regimeExposure: 0.5, regimeSma: 200,
  // HS2 (PREREGISTRATION-HS2.json)
  indexTop: 500, dvWeightWindow: 252, weightCap: 0.06, bandRel: 0.25, bandAbs: 0.0005,
  // HS3 (PREREGISTRATION-HS3.json)
  mcapCap: 0.10, sharesMaxAgeDays: 400,
  // HS4 (PREREGISTRATION-HS4.json)
  smaLong: 200, near52: 0.80, udvWindow: 50, accWindow: 63,
});

const DAY = 864e5;
const dayDiff = (a, b) => (Date.parse(b) - Date.parse(a)) / DAY;

// Bereitet eine Aktie vor: Kalenderindex je Balken, Gesamtrenditeindex, Praefixsummen.
export function prepareStock(s, calIndex) {
  const n = s.date.length;
  const dIdx = new Int32Array(n);
  for (let i = 0; i < n; i++) { const k = calIndex.get(s.date[i]); if (k === undefined) throw new Error(`Balken ausserhalb des Kalenders: ${s.id} ${s.date[i]}`); dIdx[i] = k; }
  const tri = new Float64Array(n), r = new Float64Array(n);
  const pR = new Float64Array(n + 1), pR2 = new Float64Array(n + 1), pDv = new Float64Array(n + 1), pSplit = new Float64Array(n + 1), pC = new Float64Array(n + 1);
  tri[0] = 1;
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      const p = s.close[i - 1], c = s.close[i];
      const x = p > 0 && c > 0 ? (c + (s.divAdj[i] || 0)) / p - 1 : 0;
      r[i] = Number.isFinite(x) ? x : 0;
      tri[i] = tri[i - 1] * (1 + r[i]);
    }
    pR[i + 1] = pR[i] + r[i]; pR2[i + 1] = pR2[i] + r[i] * r[i];
    const dv = (s.rawClose[i] || 0) * (s.rawVolume[i] || 0);
    pDv[i + 1] = pDv[i] + (Number.isFinite(dv) ? dv : 0);
    const sf = s.split ? s.split[i] : 1;
    pSplit[i + 1] = pSplit[i] + (sf > 0 && Number.isFinite(sf) ? Math.log(sf) : 0);
    pC[i + 1] = pC[i] + (s.close[i] > 0 ? s.close[i] : 0);
  }
  return { ...s, n, dIdx, tri, r, pR, pR2, pDv, pSplit, pC, firstK: dIdx[0], lastK: dIdx[n - 1] };
}

// Letzter Balkenindex mit Kalenderindex <= k (binaere Suche), sonst -1.
export function barAtOrBefore(st, k) {
  let lo = 0, hi = st.n - 1, ans = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (st.dIdx[m] <= k) { ans = m; lo = m + 1; } else hi = m - 1; }
  return ans;
}

function volOver(st, t, w) {
  const a = t - w + 1; if (a < 1) return NaN;
  const s = st.pR[t + 1] - st.pR[a], s2 = st.pR2[t + 1] - st.pR2[a];
  const mu = s / w, v = s2 / w - mu * mu;
  return v > 0 ? Math.sqrt(v * 252) : NaN;
}

// Jüngstes Quartal mit firstFiled < D (streng: am Stichtag Eingereichtes zaehlt erst am Folgetag).
function latestFiled(rows, D) {
  let best = -1;
  for (let i = 0; i < rows.length; i++) if (rows[i][2] < D && (best < 0 || rows[i][0] > rows[best][0])) best = i;
  return best;
}
// Wert der Periode, die ~1 Jahr vor `end` endet, nur wenn ebenfalls vor D eingereicht.
function yearAgo(rows, end, D) {
  for (const r of rows) { const d = dayDiff(r[0], end); if (d >= 350 && d <= 380 && r[2] < D) return r; }
  return null;
}

export function sueAt(fund, D, P = HS1) {
  const eps = fund?.eps; if (!eps?.length) return NaN;
  const i = latestFiled(eps, D); if (i < 0) return NaN;
  const cur = eps[i];
  if (dayDiff(cur[2], D) > P.fundMaxAgeDays) return NaN;
  const known = eps.filter((r) => r[2] < D && r[0] <= cur[0]).sort((a, b) => a[0].localeCompare(b[0]));
  const diffs = [];
  for (let j = known.length - 1; j >= 0 && diffs.length < P.sueQuarters; j--) { const y = yearAgo(known, known[j][0], D); if (y) diffs.push(known[j][1] - y[1]); }
  if (diffs.length < P.sueMin) return NaN;
  const mu = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  const sd = Math.sqrt(diffs.reduce((a, b) => a + (b - mu) ** 2, 0) / (diffs.length - 1));
  return sd > 0 ? diffs[0] / sd : NaN;
}

export function revgAt(fund, D, P = HS1) {
  const rev = fund?.rev; if (!rev?.length) return NaN;
  const i = latestFiled(rev, D); if (i < 0) return NaN;
  const cur = rev[i];
  if (dayDiff(cur[2], D) > P.fundMaxAgeDays) return NaN;
  const y = yearAgo(rev, cur[0], D);
  return y && y[1] > 0 ? cur[1] / y[1] - 1 : NaN;
}

// HS3: Marktkapitalisierung an Balken t (Datum D) aus der juengsten vor D eingereichten Aktienanzahl,
// umgerechnet mit allen Splits nach deren Stichtag bis einschliesslich D.
export function mcapAt(st, t, D, P = HS1, opts = {}) {
  const rows = st.fund?.shares; if (!rows?.length) return NaN;
  const splitMultTo = (end) => { let lo = 0, hi = st.n - 1, i = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (st.date[m] <= end) { i = m; lo = m + 1; } else hi = m - 1; } return Math.exp(st.pSplit[t + 1] - st.pSplit[i + 1]); };
  let best = null;
  for (const r of rows) if (r[2] < D && r[0] <= D && (!best || r[0] > best[0] || (r[0] === best[0] && r[2] < best[2]))) best = r;
  if (!best || dayDiff(best[0], D) > P.sharesMaxAgeDays) return NaN;
  let lo = 0, hi = st.n - 1, iEnd = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (st.date[m] <= best[0]) { iEnd = m; lo = m + 1; } else hi = m - 1; }
  const mult = Math.exp(st.pSplit[t + 1] - st.pSplit[iEnd + 1]);
  if (opts.plausibility) {
    // HS3-D3: Wert nur, wenn er split-bereinigt hoechstens Faktor 3 vom Median der eigenen, vor D eingereichten
    // Meldungen der letzten 730 Tage abweicht (mind. 3 Meldungen; sonst ohne Pruefung).
    const peers = rows.filter((r) => r[2] < D && dayDiff(r[0], D) <= 730).map((r) => r[1] * splitMultTo(r[0])).sort((a, b) => a - b);
    if (peers.length >= 3) { const med = peers[Math.floor(peers.length / 2)], cur = best[1] * mult; if (cur > 3 * med || cur < med / 3) return NaN; }
  }
  const v = st.rawClose[t] * best[1] * mult;
  return v > 0 && Number.isFinite(v) ? v : NaN;
}

// HS4: Verhaeltnis des Dollar-Umsatzes an Plus- zu Minustagen (Tagesschluss gegen Vortag), letzte w Tage.
export function upDownVolume(st, t, w) {
  let up = 0, dn = 0;
  for (let i = t - w + 1; i <= t; i++) {
    if (i < 1) return NaN;
    const dv = (st.rawClose[i] || 0) * (st.rawVolume[i] || 0);
    if (st.close[i] > st.close[i - 1]) up += dv; else if (st.close[i] < st.close[i - 1]) dn += dv;
  }
  return dn > 0 ? up / dn : NaN;
}
// HS4: Akkumulation (Chaikin-Art): umsatzgewichtete Lage des Schlusses in der Tagesspanne, letzte w Tage, in [-1, 1].
export function accumulation(st, t, w) {
  if (!st.low) return NaN;
  let num = 0, den = 0;
  for (let i = t - w + 1; i <= t; i++) {
    if (i < 0) return NaN;
    const h = st.high[i], l = st.low[i], c = st.close[i], dv = (st.rawClose[i] || 0) * (st.rawVolume[i] || 0);
    if (!(h > l) || !(dv > 0)) continue;
    num += (((c - l) - (h - c)) / (h - l)) * dv; den += dv;
  }
  return den > 0 ? num / den : NaN;
}

// HS4: konzentriertes Depot. Universum wie HS3-D3 (500 groesste, US-Inland), Filter Trend und Naehe zum Hoch,
// Rang aus den Faktoren der Variante, Top N mit Puffer 2N fuer gehaltene Titel; Gewichte gleich oder ~ Wurzel(Marktkap.).
export function concentratedWeights(elig, cfg, held, P = HS1) {
  const uniW = indexTiltWeights(elig, { sizeBy: 'MCAP', mcapRule: 'D3', factors: [] }, P);
  const inUni = new Set(uniW.keys());
  const pool = elig.filter((e) => inUni.has(e.st.id) && e.ABOVE200 && e.HIGH52 >= P.near52);
  if (!pool.length) return new Map();
  const ranked = (cfg.random != null ? pool.map((e) => ({ id: e.st.id, st: e.st, score: hashRand(cfg.random, e.st.id + e.t) })) : scoreSection(pool, cfg.factors))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const rankOf = new Map(ranked.map((x, i) => [x.id, i + 1]));
  const keep = [...held].filter((id) => (rankOf.get(id) ?? Infinity) <= P.bufferMult * cfg.n).sort((a, b) => rankOf.get(a) - rankOf.get(b));
  const target = keep.slice(0, cfg.n);
  for (const x of ranked) { if (target.length >= cfg.n) break; if (!target.includes(x.id)) target.push(x.id); }
  const byId = new Map(pool.map((e) => [e.st.id, e]));
  const raw = new Map(target.map((id) => [id, cfg.sqrtCap ? Math.sqrt(byId.get(id).MCAP3) : 1]));
  const w = capWeights(raw, cfg.sqrtCap ? 0.15 : 1);
  return new Map([...w].map(([id, v]) => [id, { w: v, st: byId.get(id).st }]));
}

// Querschnitt an Kalendertag k (Datum D). Liefert zulaessige Titel mit Rohfaktoren.
export function crossSection(stocks, k, D, P = HS1) {
  const cand = [];
  for (const st of stocks) {
    if (st.firstK > k || st.lastK < k) continue;
    const t = barAtOrBefore(st, k);
    if (t < 0 || st.dIdx[t] !== k) continue;
    if (t + 1 < P.minBars) continue;
    if (!(st.rawClose[t] >= P.minRawPrice)) continue;
    const dv = (st.pDv[t + 1] - st.pDv[t + 1 - P.dvWindow]) / P.dvWindow;
    if (!(dv > 0)) continue;
    const dvW = (st.pDv[t + 1] - st.pDv[t + 1 - P.dvWeightWindow]) / P.dvWeightWindow;
    cand.push({ st, t, dv, dvW });
  }
  cand.sort((a, b) => b.dv - a.dv || a.st.id.localeCompare(b.st.id));
  const elig = cand.slice(0, P.topLiquid);
  for (const e of elig) {
    const { st, t } = e;
    e.MOM = st.tri[t - P.momSkip] / st.tri[t - P.momFrom] - 1;
    const v126 = volOver(st, t, P.volShort);
    e.MOMV = Number.isFinite(v126) && v126 > 0 ? e.MOM / v126 : NaN;
    const v252 = volOver(st, t, P.volLong);
    e.LVOL = Number.isFinite(v252) ? -v252 : NaN;
    let hi = -Infinity; for (let i = t - P.highWindow + 1; i <= t; i++) if (st.high[i] > hi) hi = st.high[i];
    e.HIGH52 = hi > 0 ? st.close[t] / hi : NaN;
    e.SUE = sueAt(st.fund, D, P);
    e.REVG = revgAt(st.fund, D, P);
    e.MCAP = mcapAt(st, t, D, P);
    e.MCAP3 = mcapAt(st, t, D, P, { plausibility: true });
    // HS4: Trend und Volumenprofil (nur Balken bis t).
    e.ABOVE200 = st.close[t] > (st.pC[t + 1] - st.pC[t + 1 - P.smaLong]) / P.smaLong;
    e.UDV = upDownVolume(st, t, P.udvWindow);
    e.ACC = accumulation(st, t, P.accWindow);
  }
  return elig;
}

const FUND = new Set(['SUE', 'REVG']);
// Perzentilrang (mittlere Raenge bei Gleichstand) in [0,1]; fehlend: Fundamentalwert 0,5, Kurswert NaN.
export function rankFactor(elig, key) {
  const vals = elig.map((e, i) => [e[key], i]).filter(([v]) => Number.isFinite(v)).sort((a, b) => a[0] - b[0]);
  const out = new Float64Array(elig.length).fill(FUND.has(key) ? 0.5 : NaN);
  const m = vals.length;
  for (let i = 0; i < m;) {
    let j = i; while (j + 1 < m && vals[j + 1][0] === vals[i][0]) j++;
    const pr = m > 1 ? ((i + j) / 2) / (m - 1) : 0.5;
    for (let q = i; q <= j; q++) out[vals[q][1]] = pr;
    i = j + 1;
  }
  return out;
}

export function scoreSection(elig, factors) {
  const ranks = factors.map((f) => rankFactor(elig, f));
  return elig.map((e, i) => { let s = 0; for (const r of ranks) s += r[i]; return { id: e.st.id, st: e.st, t: e.t, score: s / factors.length }; })
    .filter((x) => Number.isFinite(x.score));
}

// Gewichte mit Obergrenze: Ueberschuss iterativ proportional auf die uebrigen verteilen.
export function capWeights(raw, cap) {
  const ids = [...raw.keys()];
  let w = new Map(ids.map((id) => [id, raw.get(id)]));
  const tot0 = ids.reduce((a, id) => a + w.get(id), 0);
  if (!(tot0 > 0)) return new Map();
  for (const id of ids) w.set(id, w.get(id) / tot0);
  if (cap * ids.length < 1) return new Map(ids.map((id) => [id, 1 / ids.length]));
  for (let it = 0; it < 100; it++) {
    let excess = 0, freeSum = 0;
    for (const id of ids) { const v = w.get(id); if (v > cap) { excess += v - cap; w.set(id, cap); } else if (v < cap) freeSum += v; }
    if (excess <= 1e-15) break;
    for (const id of ids) { const v = w.get(id); if (v < cap && freeSum > 0) w.set(id, v + excess * (v / freeSum)); }
  }
  return w;
}

// HS2: Zielgewichte im 500er-Universum (elig nach dv absteigend sortiert).
export function indexTiltWeights(elig, cfg, P = HS1) {
  let uni, base;
  if (cfg.sizeBy === 'MCAP') {
    // HS3: je CIK ein Listing (hoechster 63-Tage-Umsatz; elig ist danach sortiert), dann die 500 groessten.
    const seen = new Set(); const one = [];
    const mc = cfg.mcapRule === 'D3' ? 'MCAP3' : 'MCAP';
    let pool = elig.filter((e) => Number.isFinite(e[mc]));
    if (cfg.mcapRule === 'D2' || cfg.mcapRule === 'D3') pool = pool.filter((e) => (e.st.fund?.eps?.length || 0) > 0); // HS3-D2: nur 10-Q-Melder (US-Inlandsemittenten)
    if (cfg.mcapRule === 'D1' || cfg.mcapRule === 'D2' || cfg.mcapRule === 'D3') {
      // HS3-D1: keine ADR und keine IFRS-Emittenten (Aktienanzahl passt nicht zum Hinterlegungsschein, nicht im S&P 500);
      // Mehrgattungs-CIK mit Kursabstand > 2x zwischen ihren Listings an D wird ausgelassen (Stueckzahl nicht einer Gattung zuordenbar).
      pool = pool.filter((e) => e.st.cls !== 'ADR' && e.st.fund?.taxonomy !== 'ifrs-full');
      const px = new Map();
      for (const e of elig) { const c = e.st.fund?.cik; if (!c) continue; const p = e.st.rawClose[e.t]; const v = px.get(c) || [Infinity, 0]; px.set(c, [Math.min(v[0], p), Math.max(v[1], p)]); }
      pool = pool.filter((e) => { const v = px.get(e.st.fund?.cik); return !v || v[1] <= 2 * v[0]; });
    }
    for (const e of pool) { const c = e.st.fund?.cik || e.st.id; if (seen.has(c)) continue; seen.add(c); one.push(e); }
    uni = one.sort((a, b) => b[mc] - a[mc] || a.st.id.localeCompare(b.st.id)).slice(0, P.indexTop);
    base = capWeights(new Map(uni.map((e) => [e.st.id, e[mc]])), P.mcapCap);
    if (cfg.diagnose) {
      // Diagnose: die 20 liquidesten Titel, die nicht im Universum sind, mit Grund.
      const inU = new Set(uni.map((e) => e.st.id)), why = [];
      for (const e of elig) { if (why.length >= 20) break; if (inU.has(e.st.id)) continue;
        const r = !e.st.fund?.shares?.length ? 'NO_SHARES' : !Number.isFinite(e.MCAP) ? 'SHARES_STALE' : !Number.isFinite(e[mc]) ? 'IMPLAUSIBLE' : e.st.cls === 'ADR' || e.st.fund?.taxonomy === 'ifrs-full' ? 'ADR_IFRS' : !(e.st.fund?.eps?.length) ? 'NO_10Q' : 'MULTICLASS_OR_DUP_OR_RANK';
        why.push([e.st.id.split(':')[2], r]); }
      cfg.diagnose.push(why);
    }
  } else {
    uni = elig.slice(0, P.indexTop).filter((e) => e.dvW > 0);
    base = capWeights(new Map(uni.map((e) => [e.st.id, e.dvW])), P.weightCap);
  }
  const cap = cfg.sizeBy === 'MCAP' ? P.mcapCap : P.weightCap;
  let raw;
  if (!cfg.factors?.length) raw = base;
  else {
    const scored = scoreSection(uni, cfg.factors);
    const s = new Map(scored.map((x) => [x.id, x.score]));
    raw = new Map();
    for (const e of uni) {
      const sc = s.get(e.st.id); if (!Number.isFinite(sc)) continue;
      const b = base.get(e.st.id) || 0;
      if (cfg.cut) { if (sc >= 0.5) raw.set(e.st.id, b); }
      else raw.set(e.st.id, b * Math.max(0, 1 + cfg.tau * (2 * sc - 1)));
    }
  }
  const w = capWeights(raw, cap);
  const byId = new Map(uni.map((e) => [e.st.id, e.st]));
  return new Map([...w].filter(([, v]) => v > 0).map(([id, v]) => [id, { w: v, st: byId.get(id) }]));
}

// Deterministische Zufallszahl je (seed, id, D) fuer die Kontrolle RANDOM.
export function hashRand(seed, s) {
  let h = 2166136261 ^ seed;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

export const SCENARIOS = Object.freeze({
  S0_LAST_PRICE: (last, distress, slip) => last * (1 - slip),
  S1_MINUS_30: (last) => last * 0.7,
  S2_DISTRESS_ZERO: (last, distress) => (distress ? 0 : last * 0.7),
});

// Monatsletzte Handelstage im Kalender zwischen fromK und toK (inklusive).
export function monthEnds(calendar, fromK, toK) {
  const out = [];
  for (let k = fromK; k <= toK; k++) { const nx = calendar[k + 1]; if (!nx || nx.slice(0, 7) !== calendar[k].slice(0, 7)) out.push(k); }
  return out;
}

// Distress-Signatur wie lib.distressSignature (Rohschluss < 1 USD oder −50 % in 60 Sitzungen).
function distressOf(st) {
  const n = st.n, last = st.rawClose[n - 1];
  if (last < 1) return true;
  return n > 60 && st.rawClose[n - 61] > 0 && last / st.rawClose[n - 61] - 1 <= -0.5;
}

// Portfolio-Simulation. cfg: { factors, n, regime, scenario, slippageBps, commissionBps, random: seed|null,
//   ewUniverse: bool, startK, endK, spySma: Float64Array|null (SPY-Schluss/SMA200 je k), sectionCache }
export function simulate(stocks, calendar, cfg, P = HS1) {
  const slip = (cfg.slippageBps ?? P.slippageBps) / 1e4, comm = (cfg.commissionBps ?? P.commissionBps) / 1e4;
  const scen = SCENARIOS[cfg.scenario || 'S1_MINUS_30'];
  const decisions = new Set(monthEnds(calendar, cfg.startK, cfg.endK - 1));
  let cash = 1, lastExposure = null;
  const pos = new Map(); // id -> { st, shares, last, entryK }
  const equity = [], log = [];
  let pending = null, traded = 0, costs = 0, divs = 0, terminalCount = 0, holdingsSum = 0, holdingsDays = 0;
  const priceAt = (st, k, field) => { const t = barAtOrBefore(st, k); return t >= 0 && st.dIdx[t] === k ? st[field][t] : NaN; };
  for (let k = cfg.startK; k <= cfg.endK; k++) {
    // 1. Dividenden (gehalten zum Vortagesschluss)
    for (const p of pos.values()) { if (p.entryK >= k) continue; const t = barAtOrBefore(p.st, k); if (t >= 0 && p.st.dIdx[t] === k && p.st.divAdj[t] > 0) { const d = p.shares * p.st.divAdj[t]; cash += d; divs += d; } }
    // 2. Ausfuehrung der Entscheidung vom Vortag zur Eroeffnung
    if (pending) {
      for (const [id, q] of pending.sells) {
        const p = pos.get(id); if (!p) continue;
        const o = priceAt(p.st, k, 'open'); if (!(o > 0)) continue; // ohne Balken: Order verfaellt, Position bleibt
        const qty = Math.min(q, p.shares), g = qty * o * (1 - slip), c = qty * o * comm;
        cash += g - c; costs += c + qty * o * slip; traded += qty * o; p.shares -= qty;
        if (p.shares <= 1e-12) pos.delete(id);
      }
      const buys = [];
      for (const b of pending.buys) { const o = priceAt(b.st, k, 'open'); if (o > 0) buys.push({ ...b, px: o * (1 + slip), o }); }
      const need = buys.reduce((a, b) => a + b.value * (1 + comm), 0);
      const scale = need > cash && need > 0 ? Math.max(0, cash) / need : 1;
      for (const b of buys) {
        const val = b.value * scale, qty = val / b.px, c = val * comm;
        if (!(qty > 0)) continue;
        cash -= val + c; costs += c + qty * b.o * slip; traded += qty * b.o;
        const p = pos.get(b.st.id);
        if (p) p.shares += qty; else pos.set(b.st.id, { st: b.st, shares: qty, last: b.o, entryK: k });
      }
      pending = null;
    }
    // 3. Reihenende (Delisting oder Reihenbruch): Abrechnung nach Szenario
    for (const [id, p] of pos) {
      if (p.st.lastK < k && p.st.delisted) {
        const px = scen(p.st.close[p.st.n - 1], distressOf(p.st), slip);
        cash += p.shares * px; terminalCount++; pos.delete(id);
      }
    }
    // 4. Bewertung zum Schluss
    let val = 0;
    for (const p of pos.values()) { const c = priceAt(p.st, k, 'close'); if (c > 0) p.last = c; val += p.shares * p.last; }
    const eq = cash + val;
    equity.push({ k, date: calendar[k], equity: eq, exposure: eq > 0 ? val / eq : 0, positions: pos.size });
    holdingsSum += pos.size; holdingsDays++;
    // 5. Monatsentscheidung
    if (decisions.has(k)) {
      const D = calendar[k];
      const elig = cfg.sectionCache ? cfg.sectionCache(k) : crossSection(stocks, k, D, P);
      let ranked;
      if (cfg.ewUniverse) ranked = elig.map((e) => ({ id: e.st.id, st: e.st, score: 0 }));
      else if (cfg.random != null) ranked = elig.map((e) => ({ id: e.st.id, st: e.st, score: hashRand(cfg.random, e.st.id + D) })).sort((a, b) => b.score - a.score);
      else ranked = scoreSection(elig, cfg.factors).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
      if (cfg.weighting === 'INDEX_TILT' || cfg.concentrated) {
        // HS2: Zielgewichte nach Groesse mit Faktorneigung; Handel nur ausserhalb des Bandes.
        const tw = cfg.concentrated ? concentratedWeights(elig, cfg, new Set(pos.keys()), P) : indexTiltWeights(elig, cfg, P);
        const sells = new Map(), buys = [];
        for (const [id, p] of pos) if (!tw.has(id)) sells.set(id, p.shares);
        for (const [id, x] of tw) {
          const p = pos.get(id), cur = p ? p.shares * p.last : 0, want = x.w * eq;
          if (!p) { if (want > 0) buys.push({ st: x.st, value: want }); continue; }
          if (Math.abs(cur - want) / eq <= Math.max(P.bandRel * x.w, P.bandAbs)) continue;
          if (want > cur) buys.push({ st: p.st, value: want - cur }); else sells.set(id, (cur - want) / p.last);
        }
        pending = { sells, buys };
        const top = [...tw.entries()].sort((a, b) => b[1].w - a[1].w);
        log.push({ date: D, eligible: elig.length, exposure: 1, universe: tw.size, holdings: top.slice(0, 60).map(([id]) => id), topWeights: top.slice(0, 25).map(([id, x]) => [id.split(':')[2], +x.w.toFixed(4)]), sells: sells.size, buys: buys.length });
        continue;
      }
      const exposure = cfg.regime && cfg.spySma && cfg.spySma[k] < 1 ? P.regimeExposure : 1;
      const N = cfg.ewUniverse ? ranked.length : cfg.n;
      const rankOf = new Map(ranked.map((x, i) => [x.id, i + 1]));
      const keep = [];
      for (const id of pos.keys()) { const r = rankOf.get(id); if (r !== undefined && (cfg.ewUniverse || r <= P.bufferMult * N)) keep.push(id); }
      keep.sort((a, b) => rankOf.get(a) - rankOf.get(b));
      const target = keep.slice(0, N);
      for (const x of ranked) { if (target.length >= N) break; if (!target.includes(x.id)) target.push(x.id); }
      const tset = new Set(target), w = N > 0 ? exposure / N : 0;
      const sells = new Map(), buys = [];
      for (const [id, p] of pos) if (!tset.has(id)) sells.set(id, p.shares);
      const byId = new Map(ranked.map((x) => [x.id, x.st]));
      for (const id of target) {
        const p = pos.get(id);
        if (!p) { buys.push({ st: byId.get(id), value: w * eq }); continue; }
        const cw = (p.shares * p.last) / eq;
        if (lastExposure !== exposure || cw < P.resizeLow * w || cw > P.resizeHigh * w) {
          const diff = w * eq - p.shares * p.last;
          if (diff > 0) buys.push({ st: p.st, value: diff }); else if (diff < 0) sells.set(id, -diff / p.last);
        }
      }
      lastExposure = exposure;
      pending = { sells, buys };
      log.push({ date: D, eligible: elig.length, exposure, holdings: target.slice(0, 60), sells: sells.size, buys: buys.length });
    }
  }
  const years = (Date.parse(calendar[cfg.endK]) - Date.parse(calendar[cfg.startK])) / (365.25 * DAY);
  const meanEq = equity.reduce((a, p) => a + p.equity, 0) / equity.length;
  const finalVal = [...pos.values()].reduce((a, p) => a + p.shares * p.last, 0);
  return { equity, log, cashEnd: cash, openValueEnd: finalVal, turnover: traded / 2 / meanEq / years, costs, dividends: divs, terminalCount, meanPositions: holdingsSum / holdingsDays };
}
