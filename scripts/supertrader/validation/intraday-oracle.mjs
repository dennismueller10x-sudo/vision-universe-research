// Supertrader R9 - Minutenquelle fuer den Simulator (opts.intradayOracle) und die
// gemeinsame Aufloesung eines Kauf-Stop-Tags aus IEX-Minuten (intraday-study.mjs).
// Minuten bestimmen die Reihenfolge (Kaufminute, Tief vor/nach dem Kauf, Stop-Treffer);
// der Ausfuehrungspreis bleibt beim Tagesbalken-Modell (Nachtrag A1).

// Uhrzeit New York (Tiingo liefert UTC; Sommer-/Winterzeit ueber die Zeitzonendatenbank).
export const etClock = (ts) => new Date(ts).toLocaleTimeString('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false });

// Wahrheit aus Minutenbalken (Rohkurse). rec traegt bereinigte Tageswerte und rawFactor.
export function resolve(rec, bars, engineId) {
  if (!bars || !bars.length) return { status: 'NO_INTRADAY' };
  const f = rec.rawFactor;
  const rawH = rec.high * f, rawL = rec.low * f;
  const iexH = Math.max(...bars.map((b) => b.high)), iexL = Math.min(...bars.map((b) => b.low));
  if (Math.abs(iexH / rawH - 1) > 0.01 || Math.abs(iexL / rawL - 1) > 0.01) return { status: 'IDENTITY_MISMATCH', iexHighGap: iexH / rawH - 1, iexLowGap: iexL / rawL - 1 };
  const trig = rec.trigger * f;
  const gap = bars[0].open >= trig;
  let e = gap ? 0 : bars.findIndex((b) => b.high >= trig);
  if (e < 0) return { status: 'IEX_HIGH_BELOW_TRIGGER', shortfall: iexH / trig - 1 };
  // Nachtrag A1 (vor dem Hauptlauf): IEX druckt bei weniger liquiden Titeln nicht jede
  // Minute; der erste IEX-Druck ueber dem Trigger liegt dann nach einem Sprung. Die
  // Minuten bestimmen deshalb nur die REIHENFOLGE; der Preis bleibt beim Tagesbalken-
  // Modell (max(Eroeffnung, Trigger)). Der Sprung wird als Diagnose berichtet.
  const printJump = gap ? null : bars[e].open > trig ? bars[e].open / trig - 1 : 0;
  const fill = rec.fill * f;
  let stop;
  if (engineId === 'MOMENTUM_BREAKOUT') {
    let pre = Infinity; for (let i = 0; i <= e; i++) pre = Math.min(pre, bars[i].low);
    if (gap) pre = Math.min(pre, bars[0].open);
    const cap = Number.isFinite(rec.adr) ? fill * (1 - rec.adr) : -Infinity;
    stop = Math.max(Math.min(pre, fill * 0.9999), cap);
  } else stop = rec.stop * f;
  let exitIdx = -1;
  for (let i = e + 1; i < bars.length; i++) if (bars[i].low <= stop) { exitIdx = i; break; }
  const minuteAmbiguous = exitIdx < 0 && bars[e].low <= stop && !gap && engineId !== 'MOMENTUM_BREAKOUT';
  const minOf = (i) => etClock(bars[i].date);
  return {
    status: 'RESOLVED', gap, entryMinute: minOf(e), entryIndex: e,
    fillRaw: fill, fillAdj: fill / f, modelFillAdj: rec.fill, fillDiff: printJump ?? 0, printJump, iexGapAgrees: gap === (rec.open >= rec.trigger),
    stopAdj: stop / f, engineStopAdj: rec.stop, stopDiff: stop / f / rec.stop - 1,
    exitSameDay: exitIdx >= 0 || minuteAmbiguous, minuteAmbiguous, exitMinute: exitIdx >= 0 ? minOf(exitIdx) : null,
    dayLowAfterEntry: (() => { let lo = Infinity, at = -1; for (let i = 0; i < bars.length; i++) if (bars[i].low < lo) { lo = bars[i].low; at = i; } return at > e; })(),
    iexOpenVsRaw: bars[0].open / (rec.open * f) - 1,
  };
}


export async function getJson(url, key) {
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fetch(url, { headers: { Authorization: 'Token ' + key } });
      if (r.status === 429 || r.status >= 500) { await new Promise((res) => setTimeout(res, 2000 * (a + 1))); continue; }
      const t = await r.text(); let b = null; try { b = JSON.parse(t); } catch { b = null; }
      return { status: r.status, body: b };
    } catch { await new Promise((res) => setTimeout(res, 2000)); }
  }
  return { status: 0, body: null };
}
export const fetchMinutes = (t, d, key) => getJson(`https://api.tiingo.com/iex/${encodeURIComponent(t)}/prices?startDate=${d}&endDate=${d}&resampleFreq=1min&columns=open,high,low,close,volume`, key);


const tickerOf = (id) => (String(id).includes(':') ? String(id).split(':')[2] : String(id));

// Kompaktes Cache-Format (Runde 9b): je Tag Startzeit und Spalten statt Objekten - der
// erste r9b-Lauf scheiterte, weil ~20 000 Tage als Objekte nicht in einen String passten.
const r4 = (x) => Math.round(x * 1e4) / 1e4;
export function compactBars(bars) {
  if (!Array.isArray(bars) || !bars.length) return { t0: null, m: [], o: [], h: [], l: [] };
  const t0 = Date.parse(bars[0].date);
  return { t0, m: bars.map((b) => Math.round((Date.parse(b.date) - t0) / 60000)), o: bars.map((b) => r4(b.open)), h: bars.map((b) => r4(b.high)), l: bars.map((b) => r4(b.low)) };
}
export function expandBars(c) {
  if (Array.isArray(c)) return c; // altes Format (Studie)
  if (!c || !c.m || !c.m.length) return [];
  return c.m.map((mm, i) => ({ date: new Date(c.t0 + mm * 60000).toISOString(), open: c.o[i], high: c.h[i], low: c.l[i] }));
}

// Simulator-Quelle: cache[ticker|datum] = Minutenbalken (roh). Fehlt ein Tag ab `from`,
// wird er in `misses` vermerkt (fuer den naechsten Abrufdurchgang) und die Tagesbalken-
// Annahme gilt.
export function createOracle(cache, { from = '2017-01-01' } = {}) {
  const misses = new Set();
  const oracle = (ctx, t, sig, e) => {
    const date = ctx.bars.date[t], ticker = tickerOf(ctx.symbol);
    if (date < from) return { status: 'BEFORE_IEX_HISTORY' };
    const k = `${ticker}|${date}`;
    if (!(k in cache)) { misses.add(k); return { status: 'NOT_FETCHED' }; }
    const rec = { trigger: sig.levels.trigger, fill: e.price, stop: e.stop, open: ctx.bars.open[t], high: ctx.bars.high[t], low: ctx.bars.low[t], close: ctx.bars.close[t],
      rawFactor: ctx.raw ? ctx.raw.close[t] / ctx.bars.close[t] : 1, adr: ctx.ind.adr20[t - 1] }; // live: juengste Tage ohne spaeteren Split, Identitaetspruefung faengt Abweichungen
    const r = resolve(rec, expandBars(cache[k]), sig.strategyId);
    if (r.status !== 'RESOLVED') return r;
    return { status: 'RESOLVED', fill: e.price, stop: r.stopAdj, exitSameDay: r.exitSameDay, exitPrice: r.stopAdj, entryMinute: r.entryMinute };
  };
  return { oracle, misses };
}
