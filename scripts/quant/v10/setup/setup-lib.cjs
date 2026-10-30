'use strict';
// V10 Strang SETUP: gemeinsame Hilfen fuer Bestandsaufnahme, Rekonstruktion und Entscheidungsvorlage.
// Nur Research. Kein Produktlesepfad importiert dieses Modul.
//  - NYSE-Handelskalender aus festen Regeln plus belegten Sonderschliessungen (fuer Reifedaten)
//  - Unabhaengigkeitsmodell wie scripts/quant/v9/setup-independence.py (Methode uebernommen, JS-Neuimplementierung):
//      Cov(r_i, r_j)/Var(r) = rho_ij * overlap(i,j)/H, rho_ij = 1 gleicher Titel, sonst rho (mittlere paarweise Korrelation)
//      N_eff = n^2 / sum_ij rho_ij * overlap_ij / H
const DAY = 86400000;
const iso = t => new Date(t).toISOString().slice(0, 10);
const utc = d => Date.parse(d + 'T00:00:00Z');
const dow = d => new Date(utc(d)).getUTCDay();

// Belegte ausserplanmaessige NYSE-Schliessungen (Staatstrauer, Wetter). Zukuenftige sind unbekannt -> "fruehestens".
const SPECIAL_CLOSURES = Object.freeze(['2001-09-11', '2001-09-12', '2001-09-13', '2001-09-14', '2004-06-11', '2007-01-02', '2012-10-29', '2012-10-30', '2018-12-05', '2025-01-09']);

function easterSunday(y) { // anonymer gregorianischer Algorithmus (Meeus/Jones/Butcher)
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(Date.UTC(y, month - 1, day));
}
const nthWeekday = (y, month, weekday, n) => { const first = new Date(Date.UTC(y, month - 1, 1)).getUTCDay(); return iso(Date.UTC(y, month - 1, 1 + ((weekday - first + 7) % 7) + 7 * (n - 1))); };
const lastWeekday = (y, month, weekday) => { const last = new Date(Date.UTC(y, month, 0)); return iso(Date.UTC(y, month - 1, last.getUTCDate() - ((last.getUTCDay() - weekday + 7) % 7))); };
function observed(d, saturdayToFriday = true) { const w = dow(d); if (w === 6) return saturdayToFriday ? iso(utc(d) - DAY) : null; if (w === 0) return iso(utc(d) + DAY); return d; }
function nyseHolidays(y) {
  const out = [observed(`${y}-01-01`, false), nthWeekday(y, 1, 1, 3), nthWeekday(y, 2, 1, 3), iso(utc(easterSunday(y)) - 2 * DAY), lastWeekday(y, 5, 1)];
  if (y >= 2022) out.push(observed(`${y}-06-19`));
  out.push(observed(`${y}-07-04`), nthWeekday(y, 9, 1, 1), nthWeekday(y, 11, 4, 4), observed(`${y}-12-25`));
  return out.filter(Boolean).sort();
}
const holidayCache = new Map();
function isSession(d) {
  const w = dow(d); if (w === 0 || w === 6) return false;
  const y = +d.slice(0, 4); if (!holidayCache.has(y)) holidayCache.set(y, new Set(nyseHolidays(y)));
  return !holidayCache.get(y).has(d) && !SPECIAL_CLOSURES.includes(d);
}
function sessions(from, to) { const out = []; for (let t = utc(from); t <= utc(to); t += DAY) { const d = iso(t); if (isSession(d)) out.push(d); } return out; }
function nextSession(d) { let t = utc(d) + DAY; while (!isSession(iso(t))) t += DAY; return iso(t); }
function addSessions(d, n) { let x = d; for (let k = 0; k < n; k++) x = nextSession(x); return x; }

// Mittlere paarweise Korrelation standardisierter Spalten (Zeilen = Perioden).
function meanPairwiseCorr(columns) {
  const n = columns.length, T = columns[0].length; if (n < 2) return null;
  const s = Array(T).fill(0);
  for (const col of columns) {
    const m = col.reduce((a, b) => a + b, 0) / T, sd = Math.sqrt(col.reduce((a, b) => a + (b - m) ** 2, 0) / T);
    for (let t = 0; t < T; t++) s[t] += (col[t] - m) / sd;
  }
  return (s.reduce((a, b) => a + b * b, 0) / T - n) / (n * (n - 1));
}

// events: [{t: Titel, p: ganzzahlige Position auf der Achse}], H in Achseneinheiten.
function nEff(events, rho, H) {
  if (!events.length) return { n: 0, nEff: null };
  const byPos = new Map();
  for (const { t, p } of events) { if (!byPos.has(p)) byPos.set(p, new Map()); const m = byPos.get(p); m.set(t, (m.get(t) || 0) + 1); }
  const pos = [...byPos.keys()].sort((a, b) => a - b), cnt = new Map(pos.map(p => [p, [...byPos.get(p).values()].reduce((a, b) => a + b, 0)]));
  let total = 0;
  for (let i = 0; i < pos.length; i++) for (let j = i; j < pos.length && pos[j] - pos[i] < H; j++) {
    const a = pos[i], b = pos[j], ov = H - (b - a);
    let [small, large] = [byPos.get(a), byPos.get(b)]; if (small.size > large.size) [small, large] = [large, small];
    let same = 0; for (const [t, c] of small) same += c * (large.get(t) || 0);
    const term = ov / H * (rho * (cnt.get(a) * cnt.get(b) - same) + same);
    total += i === j ? term : 2 * term;
  }
  return { n: events.length, nEff: events.length * events.length / total, designEffect: total / events.length };
}
// Nicht ueberlappende Horizontbloecke im Abdeckungsbereich [erste, letzte Einstiegsposition].
const nonOverlappingBlocks = (positions, H) => positions.length ? Math.floor((Math.max(...positions) - Math.min(...positions)) / H) + 1 : 0;
// Greedy-Zaehlung disjunkter Horizontfenster (frueheste zuerst): mindestens so streng wie die Spannenformel.
function disjointWindows(positions, H) { let k = 0, end = -Infinity; for (const p of [...new Set(positions)].sort((a, b) => a - b)) if (p >= end) { k++; end = p + H; } return k; }

module.exports = { SPECIAL_CLOSURES, easterSunday, nyseHolidays, isSession, sessions, nextSession, addSessions, meanPairwiseCorr, nEff, nonOverlappingBlocks, disjointWindows, utc, iso };
