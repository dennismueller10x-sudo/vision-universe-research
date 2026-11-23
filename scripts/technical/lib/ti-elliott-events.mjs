/* Elliott-Alarme und Rückenwind (Owner 23.11.2026). Rechnet nichts Neues an der Zählung: liest die veröffentlichte Zählung von oben
   (elliottTopDown) und vergleicht den letzten Lauf mit dem jetzigen.
   - Rückenwind: Trend (Schluss über dem 40-Wochen-Schnitt), Momentum (26-Wochen-Rendite > 0), Relative Stärke (Perzentil der
     26-Wochen-Rendite im Querschnitt, ti-projection.mjs#rsRanks). Forschung: diese drei tragen mehr Richtungsinformation als die
     Zählung (docs/technical/TECHNICAL_WORLD_PROGRESS.md, Rückwärtstest M3).
   - Indexzeile `td`: Schlüssel der Lesart, Ungültig-Marke, Einstiegszone und Kursziel 1 (Rollen wie elliott/bigpicture.js#plan).
   - Ereignisse: Einstiegszone erreicht, Kursziel erreicht, Zählung ungültig, Neuzählung – nur gegen die Zeile des letzten Laufs. */

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const r4 = (v) => (isNum(v) ? Number(v.toPrecision(4)) : null);

/** Rückenwind aus der Wochenreihe (kausal, letzter Schluss); rs = Perzentil 0..1 oder null. */
export function tailwind(close, rs) {
  if (!close || close.length < 40) return null;
  const n = close.length, c = close[n - 1];
  let sma = 0; for (let i = n - 40; i < n; i++) sma += close[i]; sma /= 40;
  const trend = c > sma ? 1 : -1, mom = n > 26 && close[n - 27] > 0 ? (c > close[n - 27] ? 1 : -1) : 0;
  const rsT = isNum(rs) ? (rs >= 2 / 3 ? 1 : rs <= 1 / 3 ? -1 : 0) : 0;
  const score = trend + mom + rsT;
  return { trend, mom, rs: isNum(rs) ? Math.round(rs * 100) / 100 : null, rsT, score, dir: score >= 2 ? "UP" : score <= -2 ? "DOWN" : "MIXED" };
}

/** Rollen im Pfad wie im Großen Bild: dreht der Pfad nach dem ersten Schritt, ist dessen Zone die Einstiegszone. */
export function roles(path) {
  const P = path || [], turn = P.length > 1 && P[0].dir !== P[1].dir, dirT = turn ? P[1].dir : P[0] && P[0].dir;
  const core = (s) => { const t = s.tiers.filter((z) => !z.done); const z = t[0] || s.tiers[s.tiers.length - 1]; return z ? { lo: z.lo, hi: z.hi, dir: s.dir, l: s.disp } : null; };
  const entry = turn ? core(P[0]) : null, target = P.find((s, k) => s.dir === dirT && (k > 0 || !turn));
  return { entry, target: target ? core(target) : null };
}

/** Kompakte Indexzeile der Zählung von oben (für Ereignisse, Radar und Startseite). */
export function tdRow(td) {
  if (!td || td.status !== "OK" || !td.primary) return null;
  const p = td.primary, ro = roles(td.path);
  return { k: p.kind + ":" + p.dir + ":" + p.cur + ":" + (p.waves[0] && String(p.waves[0].ft).slice(0, 7)), cur: p.cur, kind: p.kind, dir: p.dir,
           inv: p.inv ? [p.inv.p, p.inv.d] : null, e: ro.entry, t1: ro.target, rw: td.rw ? td.rw.dir : null };
}

const reached = (z, close) => z && isNum(close) && (z.dir === "UP" ? close >= z.lo : close <= z.hi);
const broken = (inv, close) => inv && isNum(close) && (inv[1] === "below" ? close < inv[0] : close > inv[0]);

/** Ereignisse zwischen zwei Läufen: prev/cur = Indexzeilen { t, close, asOf, td }. */
export function eventsFor(prev, cur) {
  const a = prev && prev.td, b = cur && cur.td;
  if (!a || !cur || !isNum(cur.close) || (prev.asOf && cur.asOf && prev.asOf >= cur.asOf)) return [];
  const ev = [], base = { t: cur.t, asOf: cur.asOf, close: r4(cur.close) };
  if (broken(a.inv, cur.close) && !broken(a.inv, prev.close)) ev.push({ ...base, type: "INVALIDATED", level: r4(a.inv[0]), text: "Zählung ungültig: Schluss " + (a.inv[1] === "below" ? "unter " : "über ") + r4(a.inv[0]) + " – Neuzählung" });
  else if (b && a.k !== b.k) ev.push({ ...base, type: "RECOUNT", text: "Neue Lesart: Welle [" + b.cur + "] statt [" + a.cur + "]" });
  if (a.e && reached(a.e, cur.close) && !reached(a.e, prev.close)) ev.push({ ...base, type: "ENTRY_REACHED", zone: [r4(a.e.lo), r4(a.e.hi)], wave: a.e.l, text: "Einstiegszone erreicht (" + a.e.l + " " + r4(a.e.lo) + "–" + r4(a.e.hi) + ")" });
  if (a.t1 && reached(a.t1, cur.close) && !reached(a.t1, prev.close)) ev.push({ ...base, type: "TARGET_REACHED", zone: [r4(a.t1.lo), r4(a.t1.hi)], wave: a.t1.l, text: "Kursziel erreicht (" + a.t1.l + " " + r4(a.t1.lo) + "–" + r4(a.t1.hi) + ")" });
  return ev;
}
