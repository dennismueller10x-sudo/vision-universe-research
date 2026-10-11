// Minervini Rule Fidelity – private Kursdiagnose: reine Funktionen (Power Play, Basismessung, oeffentliche Zeile).
// Definitionen: scripts/supertrader/fidelity/MINERVINI-RULE-FIDELITY-PRIVATE-DIAG-PREREG.json (vor diesem Code festgeschrieben).
// Reine Diagnose: keine Engine-Regel, kein Parameter, keine Rueckwirkung. Alle Zahlen stammen aus den Quellen
// (Q-POWERPLAY-DEF, Q-FLAG, Flat Base 10 bis 15 % / 4 bis 7 Wochen); es gibt keine angepasste Schwelle.
import { decomposeBase } from '../replication/minervini/vcp.mjs';

export const PP = Object.freeze({
  highLookback: 30,        // 6 Wochen x 5: laengste Flaggendauer (Q-FLAG)
  flagMin: 12,             // „some can emerge after only 12 days“ (Q-FLAG)
  thrustMaxSessions: 39,   // „less than 8 weeks“ = hoechstens 39 Sitzungen
  thrustRatio: 2.0,        // „100 % or more“
  depthStrict: 0.20, depthLoose: 0.25, // „not correcting more than 20 to 25 %“
  tight: 0.10,             // „doesn't correct the stock more than 10 %“
});
export const BASE = Object.freeze({
  maxBaseSessions: 225,    // wie vcp.maxBaseSessions der eingefrorenen Engine (nur zum Nachrechnen)
  minBaseSessions: 15,     // wie vcp.minBaseSessions
  flatMaxSessionsFloor: 20, // „4 to 7 weeks“: mindestens 4 Wochen
  flatRange: 0.15, flatRangeTight: 0.10,
  pauseLe: [0.10, 0.15, 0.25],
});

const fin = Number.isFinite;
const argmaxLast = (arr, from, to) => { let idx = -1, v = -Infinity; for (let i = from; i <= to; i++) if (arr[i] >= v) { v = arr[i]; idx = i; } return idx; };
const minOf = (arr, from, to) => { let m = Infinity; for (let i = from; i <= to; i++) if (arr[i] < m) m = arr[i]; return m; };

// Wie detectVcp: hoechstes Hoch der letzten maxBaseSessions (Gleichstand: juengerer Balken). null bei Datenluecke (wie DATA_GAP).
export function engineBase(high, low, t, maxBase = BASE.maxBaseSessions) {
  const ws = Math.max(0, t - maxBase);
  for (let i = ws; i <= t; i++) if (!fin(high[i]) || !fin(low[i]) || !(low[i] > 0)) return null;
  const h1 = argmaxLast(high, ws, t);
  return { ws, h1, baseSessions: t - h1 };
}

export function powerPlayAt(bars, t) {
  const { high, low, close } = bars;
  const from = Math.max(0, t - PP.highLookback);
  const hi = argmaxLast(high, from, t);
  const flagSessions = t - hi;
  const s0 = Math.max(0, hi - PP.thrustMaxSessions);
  const minLow = minOf(low, s0, hi), minClose = minOf(close, s0, hi);
  const thrustLooseRatio = high[hi] / minLow, thrustStrictRatio = close[hi] / minClose;
  const flagMinLow = flagSessions >= 1 ? minOf(low, hi + 1, t) : high[hi];
  const flagDepth = 1 - flagMinLow / high[hi];
  const flagLenOk = flagSessions >= PP.flagMin && flagSessions <= PP.highLookback;
  const contractions = flagSessions >= 2 ? decomposeBase(high, low, hi, t) : [];
  const vcpLike = contractions.length >= 2 && contractions.every((c, k) => k === 0 || c.depth < contractions[k - 1].depth);
  const thrustLoose = thrustLooseRatio >= PP.thrustRatio, thrustStrict = thrustStrictRatio >= PP.thrustRatio;
  const tightOk = flagDepth <= PP.tight || vcpLike;
  const ppStrict = thrustStrict && flagLenOk && flagDepth <= PP.depthStrict && tightOk;
  const ppLoose = thrustLoose && flagLenOk && flagDepth <= PP.depthLoose && tightOk;
  const firstFail = ppLoose ? null : !thrustLoose ? 'THRUST' : !flagLenOk ? 'FLAG_LENGTH' : !(flagDepth <= PP.depthLoose) ? 'FLAG_DEPTH' : 'FLAG_TIGHTNESS';
  return {
    verdict: ppStrict ? 'YES' : ppLoose ? 'POSSIBLE' : 'NO', firstFail,
    thrustStrict, thrustLoose, flagSessions, flagLenOk, flagLe10: flagDepth <= PP.tight, flagLe20: flagDepth <= PP.depthStrict, flagLe25: flagDepth <= PP.depthLoose, vcpLike,
    detail: { hi, thrustLooseRatio, thrustStrictRatio, flagDepth, contractions: contractions.map((c) => c.depth) },
  };
}

// Erster Treffer in t*-5 .. t*+5 (Signaltoleranz der Engine); Offset relativ zu t*.
export function powerPlayWindow(bars, tStar, span = 5) {
  for (let k = -span; k <= span; k++) {
    const t = tStar + k; if (t < 1 || t >= bars.close.length) continue;
    const r = powerPlayAt(bars, t);
    if (r.verdict !== 'NO') return { offset: k, verdict: r.verdict };
  }
  return { offset: null, verdict: 'NO' };
}

function longestWindow(high, low, t, threshold, maxBase) {
  let mx = -Infinity, mn = Infinity, len = 0;
  for (let i = t; i >= Math.max(0, t - maxBase); i--) {
    if (high[i] > mx) mx = high[i]; if (low[i] < mn) mn = low[i];
    if ((mx - mn) / mx > threshold) break;
    len = t - i + 1;
  }
  return len;
}

export function baseMeasures(bars, t, maxBase = BASE.maxBaseSessions) {
  const { high, low } = bars;
  const eb = engineBase(high, low, t, maxBase);
  if (!eb) return { engine: null, baseFinding: 'DATA_GAP' };
  const { ws, h1, baseSessions } = eb;
  const pauseSessions = t - h1;
  const pauseDepth = pauseSessions >= 1 ? 1 - minOf(low, h1 + 1, t) / high[h1] : 0;
  const flat15 = longestWindow(high, low, t, BASE.flatRange, maxBase), flat10 = longestWindow(high, low, t, BASE.flatRangeTight, maxBase);
  const short = baseSessions < BASE.minBaseSessions;
  const flatMissed = short && flat15 >= BASE.flatMaxSessionsFloor;
  const baseFinding = !short ? 'NOT_SHORT' : flatMissed ? 'FLAT_BASE_MISSED' : (pauseDepth <= 0.15) ? 'SHORT_PAUSE_AT_HIGHS' : 'NO_BASE_STRUCTURE';
  return {
    baseSessions, pauseSessions,
    pauseLe10: pauseDepth <= 0.10, pauseLe15: pauseDepth <= 0.15, pauseLe25: pauseDepth <= 0.25,
    flatSessions15: flat15, flatSessions10: flat10, baseFinding,
    detail: { pauseDepth, h1 },
  };
}

// Oeffentliche Zeile: nur Wahrheitswerte, null, ganze Zahlen und kurze Kennungen/Enums. Alles andere bricht ab (Datenschutz).
const ID = /^[A-Za-z0-9_.+-]{1,48}$/;
export function publicRow(o) {
  const out = {};
  for (const [k, v] of Object.entries(o)) {
    if (v === null || typeof v === 'boolean' || (typeof v === 'number' && Number.isInteger(v)) || (typeof v === 'string' && ID.test(v))) out[k] = v;
    else throw new Error(`publicRow: Wert fuer ${k} ist weder Wahrheitswert noch ganze Zahl noch Kennung (${typeof v})`);
  }
  return out;
}
