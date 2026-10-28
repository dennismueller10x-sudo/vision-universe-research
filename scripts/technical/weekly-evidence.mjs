#!/usr/bin/env node
/* =========================================================================
   VISION UNIVERSE TECHNICAL — weekly-evidence.mjs
   LANGFRISTIGE EVIDENZ TECHNISCHER SIGNALE AUF WOCHENBASIS (beschreibend)

   Daten: quant/data/market/discover-series-long (Wochenschluesse, SPLIT_ADJUSTED, je Titel bis 1990 zurueck,
   Median rund 10 Jahre) und fuer die Marktphase SPY taeglich (quant/data/market/multi-asset/series/SPY.json,
   ab 1995). Nur Schlusskurse: Signale brauchen deshalb weder Hoch/Tief noch Volumen.

   Kausal: Ein Signal an Woche t nutzt nur Wochenschluesse bis t. Gemessen wird ab dem Schluss der Woche t+DELAY
   (Standard 0; Robustheit 1 Woche Verzug) bis t+DELAY+H, H = 4, 13, 26 Wochen, minus dem Mittel aller Titel mit
   Schluss in denselben beiden Kalenderwochen (mindestens 100 Titel). Baerische Signale mit umgekehrtem Vorzeichen.
   Wochen werden ueber den Kalender ausgerichtet (Montag-Woche); fehlt einem Titel eine Woche, zaehlt der Schritt
   nicht. Einzelne Ueberrenditen werden auf ±100 % begrenzt (Kleinwerte mit Kurssprung dominieren sonst das Mittel).

   Schutz vor Ueberoptimierung:
     • Die Kombinationen (COMBOS) sind VOR dem ersten Lauf festgelegt und im Code eingefroren; der Test prueft die
       Liste. Es wird nichts nach Ergebnis ausgewaehlt; alle Zeilen werden gemeldet.
     • Ergebnisse getrennt nach Zeitraum: bis 2015 (Entwicklung) und ab 2016 (Pruefung). Eine Aussage gilt nur,
       wenn sie in beiden Teilen dasselbe Vorzeichen hat.
     • Bonferroni ueber alle Zeilen x Horizonte; Mittel und Intervall ueber Datums-Cluster.
   Grenze: Survivorship Bias. Die Reihen enthalten nur heute gelistete Titel; Delistings fehlen. Das hebt
   Renditen in der Vergangenheit an; der Querschnittsabzug mildert es, beseitigt es aber nicht.

   Schreibt nichts ausser mit --out (JSON). Aufruf:
     node scripts/technical/weekly-evidence.mjs [--out FILE] [--limit N] [--delay 0|1] [--min-close P]
   ========================================================================= */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { stats, zFor } from "./candlestick-evidence.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const LONG = join(root, "quant/data/market/discover-series-long");
const SPY = join(root, "quant/data/market/multi-asset/series/SPY.json");

export const WEEKLY_EVIDENCE_VERSION = "technical-weekly-evidence-1.0.0";
export const HORIZONS = [4, 13, 26], MIN_N = 100, MIN_XSEC = 100, CLIP = 1, SPLIT_YEAR = 2016;

function isNum(v) { return typeof v === "number" && Number.isFinite(v); }
function arg(name, def) { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : def; }
const r4 = (v) => (isNum(v) ? Math.round(v * 1e4) / 1e4 : null);

/** Kalenderwoche als laufende Nummer (Woche beginnt Montag; 1970-01-05 ist ein Montag). */
export function weekIndex(iso) { return Math.floor((Date.parse(String(iso).slice(0, 10) + "T00:00:00Z") - Date.UTC(1970, 0, 5)) / 604800000); }

function sma(c, n) { const out = new Array(c.length).fill(NaN); let s = 0; for (let i = 0; i < c.length; i++) { s += c[i]; if (i >= n) s -= c[i - n]; if (i >= n - 1) out[i] = s / n; } return out; }
/** RSI nach Wilder (Startwert: Mittel der ersten n Aenderungen). */
function rsi(c, n) {
  const out = new Array(c.length).fill(NaN);
  if (c.length <= n) return out;
  let g = 0, l = 0;
  for (let i = 1; i <= n; i++) { const d = c[i] - c[i - 1]; if (d > 0) g += d; else l -= d; }
  g /= n; l /= n; out[n] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  for (let i = n + 1; i < c.length; i++) { const d = c[i] - c[i - 1]; g = (g * (n - 1) + Math.max(d, 0)) / n; l = (l * (n - 1) + Math.max(-d, 0)) / n; out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); }
  return out;
}
/** Linien eines Titels; jede an Index i nur aus Schluessen bis i. Eine Luecke im Kalender bricht die Reihe nicht,
    aber Signale an einer Luecke (Woche i nicht direkt nach i−1) werden verworfen. */
export function linesOf(close) {
  const n = close.length, hi52 = new Array(n).fill(NaN), lo52 = new Array(n).fill(NaN);
  for (let i = 52; i < n; i++) { let h = -Infinity, l = Infinity; for (let j = i - 52; j < i; j++) { if (close[j] > h) h = close[j]; if (close[j] < l) l = close[j]; } hi52[i] = h; lo52[i] = l; }
  return { close, sma10: sma(close, 10), sma40: sma(close, 40), rsi14: rsi(close, 14), hi52, lo52 };
}
const up = (a, b, i) => isNum(a[i]) && isNum(b[i]) && isNum(a[i - 1]) && isNum(b[i - 1]) && a[i - 1] <= b[i - 1] && a[i] > b[i];
const down = (a, b, i) => isNum(a[i]) && isNum(b[i]) && isNum(a[i - 1]) && isNum(b[i - 1]) && a[i - 1] >= b[i - 1] && a[i] < b[i];
/** Konstante Linie (RSI-Schwelle) mit derselben Indexschnittstelle wie eine Reihe. */
const lvl = (v) => new Proxy({}, { get: () => v });
const L30 = lvl(30), L70 = lvl(70);
/** Erstes neues 52-Wochen-Schlusshoch nach mindestens 4 Wochen ohne. */
const newHigh = (L, i) => isNum(L.hi52[i]) && L.close[i] > L.hi52[i] && ![1, 2, 3, 4].some((k) => isNum(L.hi52[i - k]) && L.close[i - k] > L.hi52[i - k]);
const newLow = (L, i) => isNum(L.lo52[i]) && L.close[i] < L.lo52[i] && ![1, 2, 3, 4].some((k) => isNum(L.lo52[i - k]) && L.close[i - k] < L.lo52[i - k]);

/** Einzelsignale (5 Paare). */
export const EVENTS = [
  { id: "crossAbove40w", name: "Schluss kreuzt die 40-Wochen-Linie aufwärts", dir: 1, at: (L, i) => up(L.close, L.sma40, i) },
  { id: "crossBelow40w", name: "Schluss kreuzt die 40-Wochen-Linie abwärts", dir: -1, at: (L, i) => down(L.close, L.sma40, i) },
  { id: "weeklyGolden", name: "10- kreuzt 40-Wochen-Linie aufwärts", dir: 1, at: (L, i) => up(L.sma10, L.sma40, i) },
  { id: "weeklyDeath", name: "10- kreuzt 40-Wochen-Linie abwärts", dir: -1, at: (L, i) => down(L.sma10, L.sma40, i) },
  { id: "newHigh52w", name: "Neues 52-Wochen-Schlusshoch (erstes nach 4 Wochen)", dir: 1, at: newHigh },
  { id: "newLow52w", name: "Neues 52-Wochen-Schlusstief (erstes nach 4 Wochen)", dir: -1, at: newLow },
  { id: "rsiWExitOversold", name: "Wochen-RSI 14 von unten über 30", dir: 1, at: (L, i) => up(L.rsi14, L30, i) },
  { id: "rsiWExitOverbought", name: "Wochen-RSI 14 von oben unter 70", dir: -1, at: (L, i) => down(L.rsi14, L70, i) }
];
/** Kombinationen, VOR dem ersten Lauf festgelegt (nicht nach Ergebnis veraendern; neue Kombinationen nur zusaetzlich
    und mit eigener Begruendung). `base` nennt das Einzelsignal, gegen das die Kombination verglichen wird. */
export const COMBOS = [
  { id: "pullbackInUptrend", name: "Wochen-RSI über 30 bei Schluss über der 40-Wochen-Linie", dir: 1, base: "rsiWExitOversold", at: (L, i, m) => up(L.rsi14, L30, i) && L.close[i] > L.sma40[i] },
  { id: "breakoutInUptrend", name: "Neues 52-Wochen-Hoch bei 10- über 40-Wochen-Linie", dir: 1, base: "newHigh52w", at: (L, i, m) => newHigh(L, i) && L.sma10[i] > L.sma40[i] },
  { id: "breakdownInDowntrend", name: "Neues 52-Wochen-Tief bei 10- unter 40-Wochen-Linie", dir: -1, base: "newLow52w", at: (L, i, m) => newLow(L, i) && L.sma10[i] < L.sma40[i] },
  { id: "cross40wMarketUp", name: "Schluss über 40-Wochen-Linie bei SPY über seiner 40-Wochen-Linie", dir: 1, base: "crossAbove40w", at: (L, i, m) => up(L.close, L.sma40, i) && m === "UP" },
  { id: "overboughtInDowntrend", name: "Wochen-RSI unter 70 bei Schluss unter der 40-Wochen-Linie", dir: -1, base: "rsiWExitOverbought", at: (L, i, m) => down(L.rsi14, L70, i) && L.close[i] < L.sma40[i] },
  { id: "goldenWithMomentum", name: "10- über 40-Wochen-Linie bei Wochen-RSI über 50", dir: 1, base: "weeklyGolden", at: (L, i, m) => up(L.sma10, L.sma40, i) && L.rsi14[i] > 50 }
];

/** Marktphase je Kalenderwoche aus SPY: Wochenschluss (letzter Handelstag der Woche) ueber seiner 40-Wochen-Linie. */
export function marketPhases(daily) {
  const wk = new Map();
  for (const [d, v] of daily) if (isNum(v)) wk.set(weekIndex(d), v);
  const keys = [...wk.keys()].sort((a, b) => a - b), c = keys.map((k) => wk.get(k)), s = sma(c, 40), out = new Map();
  keys.forEach((k, i) => { if (isNum(s[i])) out.set(k, c[i] > s[i] ? "UP" : "DOWN"); });
  return out;
}

export function build({ limit = 0, delay = 0, minClose = 0 } = {}) {
  const spy = JSON.parse(readFileSync(SPY, "utf8")).points;
  const phase = marketPhases(spy);
  const titles = [];
  for (const f of readdirSync(LONG).filter((x) => x.endsWith(".json") && x !== "index.json").sort()) {
    const j = JSON.parse(readFileSync(join(LONG, f), "utf8"));
    if (j.priceSeriesType !== "SPLIT_ADJUSTED" || !Array.isArray(j.points) || j.points.length < 60) continue;
    const pts = j.points.filter((p) => isNum(p[1]) && p[1] > 0);
    titles.push({ ticker: j.ticker, wk: pts.map((p) => weekIndex(p[0])), year: pts.map((p) => Number(String(p[0]).slice(0, 4))), close: pts.map((p) => p[1]) });
    if (limit && titles.length >= limit) break;
  }
  /* Querschnitt: Mittel der Rendite von Woche a nach Woche a+H ueber alle Titel mit beiden Schluessen. */
  const xsec = HORIZONS.map(() => new Map());
  for (const t of titles) {
    const pos = new Map(t.wk.map((w, i) => [w, i]));
    HORIZONS.forEach((H, h) => {
      for (let i = 0; i < t.wk.length; i++) {
        const j = pos.get(t.wk[i] + H); if (j === undefined) continue;
        const r = Math.max(-CLIP, Math.min(CLIP, t.close[j] / t.close[i] - 1)), m = xsec[h].get(t.wk[i]) || { s: 0, n: 0 };
        m.s += r; m.n++; xsec[h].set(t.wk[i], m);
      }
    });
  }
  const defs = EVENTS.map((e) => ({ ...e, kind: "EVENT" })).concat(COMBOS.map((c) => ({ ...c, kind: "COMBO" })));
  const SLICES = ["all", "is", "oos", "up", "down", "p1", "p2", "p3"];
  const rows = new Map(defs.map((d) => [d.id, { d, titles: new Set(), x: Object.fromEntries(SLICES.map((s) => [s, HORIZONS.map(() => [])])) }]));
  for (const t of titles) {
    const L = linesOf(t.close), pos = new Map(t.wk.map((w, i) => [w, i]));
    for (let i = 53; i < t.close.length; i++) {
      if (t.wk[i] !== t.wk[i - 1] + 1) continue;                        /* Luecke: kein Signal */
      if (minClose && !(t.close[i] >= minClose)) continue;
      const m = phase.get(t.wk[i]) || null;
      for (const d of defs) {
        if (!d.at(L, i, m)) continue;
        const row = rows.get(d.id); row.titles.add(t.ticker);
        const e0 = pos.get(t.wk[i] + delay); if (e0 === undefined) continue;
        HORIZONS.forEach((H, h) => {
          const e1 = pos.get(t.wk[i] + delay + H), xs = xsec[h].get(t.wk[i] + delay);
          if (e1 === undefined || !xs || xs.n < MIN_XSEC) return;
          const r = Math.max(-CLIP, Math.min(CLIP, t.close[e1] / t.close[e0] - 1)), ex = r - xs.s / xs.n, v = d.dir < 0 ? -ex : ex;
          const key = String(t.wk[i]), y = t.year[i];
          const push = (s) => row.x[s][h].push([key, v]);
          push("all"); push(y < SPLIT_YEAR ? "is" : "oos");
          if (m) push(m === "UP" ? "up" : "down");
          push(y < 2010 ? "p1" : y < 2020 ? "p2" : "p3");
        });
      }
    }
  }
  const cnt = [...rows.values()].filter((r) => r.x.all[HORIZONS.length - 1].length >= MIN_N).length;
  const z = zFor(0.05 / Math.max(1, cnt * HORIZONS.length));
  const fmt = (xs) => { if (xs.length < MIN_N) return { n: xs.length }; const s = stats(xs); return { n: s.n, dates: s.dates, mean: s.mean, ci95: s.ci95, hitRate: s.hitRate, significant: Math.abs(s.t) > z }; };
  const out = [...rows.values()].map((r) => {
    const o = { id: r.d.id, kind: r.d.kind, name: r.d.name, direction: r.d.dir > 0 ? "BULLISH" : "BEARISH", base: r.d.base || null, titles: r.titles.size };
    for (const s of SLICES) o[s] = Object.fromEntries(HORIZONS.map((H, h) => ["h" + H, fmt(r.x[s][h])]));
    const isS = o.is.h13, oosS = o.oos.h13;
    o.consistentH13 = isNum(isS.mean) && isNum(oosS.mean) ? Math.sign(isS.mean) === Math.sign(oosS.mean) : null;
    return o;
  });
  const allWeeks = titles.flatMap((t) => [t.wk[0], t.wk[t.wk.length - 1]]).sort((a, b) => a - b);
  const wkDate = (w) => new Date(Date.UTC(1970, 0, 5) + w * 604800000).toISOString().slice(0, 10);
  return {
    schemaVersion: WEEKLY_EVIDENCE_VERSION, titles: titles.length, window: { from: wkDate(allWeeks[0]), to: wkDate(allWeeks[allWeeks.length - 1]) },
    horizonsWeeks: HORIZONS, delayWeeks: delay, minClose: minClose || null, minN: MIN_N, clip: CLIP, splitYear: SPLIT_YEAR,
    slices: { all: "alle", is: "bis " + (SPLIT_YEAR - 1), oos: "ab " + SPLIT_YEAR, up: "SPY über 40-Wochen-Linie", down: "SPY unter 40-Wochen-Linie", p1: "bis 2009", p2: "2010–2019", p3: "ab 2020" },
    bonferroniZ: r4(z), rows: out
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const started = Date.now();
  const res = build({ limit: Number(arg("--limit", "0")) || 0, delay: Number(arg("--delay", "0")) || 0, minClose: Number(arg("--min-close", "0")) || 0 });
  const out = arg("--out", null);
  if (out) writeFileSync(out, JSON.stringify(res, null, 1) + "\n");
  console.log(`${res.titles} Titel, ${res.window.from} bis ${res.window.to}, Verzug ${res.delayWeeks} W, z(Bonferroni) ${res.bonferroniZ}, ${Math.round((Date.now() - started) / 1000)} s`);
  const f = (s) => (s && s.mean !== undefined ? ((s.mean * 100).toFixed(2) + "±" + (s.ci95 * 100).toFixed(2) + (s.significant ? "*" : "")) : "n=" + (s ? s.n : 0)).padEnd(14);
  console.log("id".padEnd(24), "n13".padStart(7), " alle h13      bis2015 h13   ab2016 h13    SPY↑ h13      SPY↓ h13      alle h26");
  for (const r of res.rows) console.log(r.id.padEnd(24), String(r.all.h13.n).padStart(7), " " + f(r.all.h13) + f(r.is.h13) + f(r.oos.h13) + f(r.up.h13) + f(r.down.h13) + f(r.all.h26), r.consistentH13 === false ? "VORZEICHEN WECHSELT" : "");
}
