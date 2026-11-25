#!/usr/bin/env node
/* =========================================================================
   Elliott von oben — Rückwärtstest (Forschung, nicht zertifiziert). Schreibt nur mit --out.

   Je Titel (quant/data/market/discover-series-long, Wochenschlusskurse seit Handelsbeginn) und Stichtag (alle --step Wochen ab --from,
   mindestens 104 Wochen Vorlauf) rechnet elliott-topdown.js nur mit den Kursen bis zum Stichtag. Danach (höchstens --horizon Wochen,
   Wochenschluss):

   M1 Zone vor Ungültig: Erreicht der Kurs die nächste offene Zone des Pfads (nahe Kante der ersten offenen Stufe), bevor er die
      Ungültig-Marke der Zählung schließt? Vergleich „gespiegelt“: dieselben Abstände in Gegenrichtung (Zone so weit entgegengesetzt,
      Ungültig-Marke gespiegelt). Vorsprung = Treffer − gespiegelt; er misst, ob die Richtung der Zählung mehr trifft als die Geometrie.
   M2 Einstieg im HKCM-Stil: Ist der nächste Schritt eine Korrektur gegen die grosse Richtung, gilt deren Zone als Einstiegszone,
      Absicherung 1 % jenseits der äusseren Zonenkante (Stufe EXTENDED), Kursziel = nahe Kante der Zone des Folgeschritts. Ausgang:
      Ziel zuerst (+R = Ziel−Einstieg ÷ Einstieg−Absicherung), Absicherung zuerst (−1 R), sonst offen. Einstieg = erster Wochenschluss
      in der Zone. Kennzahl: Trefferquote, mittleres R (auch mit Gewinnen gedeckelt auf 5 R). Vergleich „beliebiger Rücksetzer“:
      derselbe Titel an anderen Stichtagen, dieselbe Geometrie in Prozent; er hat dieselbe Bedingung (Einstieg erst bei Erreichen der
      Kante) und sieht keine Zukunft. Vergleiche, die erst nach dem Wissen um den späteren Einstieg entstehen, sind verzerrt und fehlen.

   Aufruf: node scripts/technical/elliott-topdown/backtest.mjs --out /tmp/td [--step 13] [--from 2010-01-01] [--horizon 78] [--every 1]
   ========================================================================= */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const TD = createRequire(import.meta.url)(join(ROOT, "quant/engines/technical/elliott/elliott-topdown.js"));
const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i >= 0 ? process.argv[i + 1] : d; };
const OUT = arg("out", null); if (!OUT) { console.error("--out fehlt"); process.exit(2); }
const STEP = Number(arg("step", 13)), FROM = arg("from", "2010-01-01"), H = Number(arg("horizon", 78)), EVERY = Number(arg("every", 1));
const D = join(ROOT, "quant/data/market/discover-series-long");

function firstHit(c, t0, up, dn) {   // up/dn: Schranken (null = keine); Ergebnis 1 = oben zuerst, -1 = unten zuerst, 0 = offen
  for (let i = t0 + 1; i <= Math.min(c.length - 1, t0 + H); i++) { if (up !== null && c[i] >= up) return 1; if (dn !== null && c[i] <= dn) return -1; }
  return 0;
}
const acc = () => ({ n: 0, hit: 0, miss: 0, open: 0, mHit: 0, mMiss: 0 });
const M1 = { all: acc(), SUB: acc(), BIG: acc(), UP: acc(), DOWN: acc(), anchored: acc() };
const CAP = 5;   // robuste Kennzahl: Gewinne hoechstens 5 R (einzelne sehr enge Absicherungen sollen das Mittel nicht tragen)
const M2 = { n: 0, filled: 0, win: 0, loss: 0, open: 0, rSum: 0, cSum: 0, rr: [], byDeg: {}, pull: { n: 0, filled: 0, win: 0, loss: 0, rSum: 0, cSum: 0 } };
/* Fairer Vergleich M2 („beliebiger Rücksetzer“): derselbe Titel, ein anderer Stichtag b (deterministisch versetzt), dieselbe
   Geometrie in Prozent vom Kurs am Stichtag (Abstand bis zur Einstiegskante, Absicherung, Ziel). Misst, ob die Elliott-Zone mehr
   bringt als irgendein Rücksetzer gleicher Tiefe. */
function pullback(c, b, longT, nearPct, stopPct, tgtPct, acc2) {
  if (b < 1 || b >= c.length - 2) return;
  acc2.n++;
  const zN = longT ? c[b] * (1 - nearPct) : c[b] * (1 + nearPct), st = longT ? zN * (1 - stopPct) : zN * (1 + stopPct), tg = longT ? zN * (1 + tgtPct) : zN * (1 - tgtPct);
  let fill = -1;
  for (let i = b + 1; i <= Math.min(c.length - 1, b + H); i++) { if (longT ? c[i] <= zN : c[i] >= zN) { fill = i; break; } }
  if (fill < 0) return;
  acc2.filled++;
  const e = c[fill]; if (longT ? e <= st : e >= st) { acc2.loss++; acc2.rSum -= 1; acc2.cSum -= 1; return; }
  const oo = longT ? firstHit(c, fill, tg, st) : firstHit(c, fill, st, tg), win = longT ? oo === 1 : oo === -1, loss = longT ? oo === -1 : oo === 1;
  const R = Math.abs(tg - e) / Math.abs(e - st);
  if (win) { acc2.win++; acc2.rSum += R; acc2.cSum += Math.min(CAP, R); } else if (loss) { acc2.loss++; acc2.rSum -= 1; acc2.cSum -= 1; }
}
/* M3 faire Trefferquote: Richtung des nächsten Schritts, Schranken gleich weit (log) über und unter dem Kurs, Abstand = Abstand zur
   nahen Zonenkante. Zufall = 50 %; „immer aufwärts“ zeigt die Marktdrift derselben Fälle. Filter: Haupt- und Alternativzählung einig
   (erster Pfadschritt gleiche Richtung), klarer Abstand zur Alternative (≥ 0,1), Richtlinien gut erfüllt (≥ 0,8), Grad des Schritts. */
const M3 = {};
function m3(key, hit, upFirst) { const m = (M3[key] = M3[key] || { n: 0, hit: 0, up: 0 }); m.n++; if (hit) m.hit++; if (upFirst) m.up++; }
const files = readdirSync(D).filter((f) => f.endsWith(".json"));
/* Filter für M3 (kausal am Stichtag): Trend = Schluss über dem 40-Wochen-Schnitt, Momentum = 26-Wochen-Rendite > 0,
   Relative Stärke = Drittel der 52-Wochen-Rendite im Querschnitt aller Titel am selben Wochendatum. Jeder Filter wird auch allein
   gemessen (Richtung des Filters, gleiche Fälle, gleiche Schranken): so zeigt sich, ob Elliott über den Filter hinaus etwas beiträgt. */
const R52 = new Map();
for (let k = 0; k < files.length; k += EVERY) {
  let j; try { j = JSON.parse(readFileSync(join(D, files[k]), "utf8")); } catch { continue; }
  const pts = j.points || [];
  for (let i = 52; i < pts.length; i++) { const d = pts[i][0], v = pts[i][1] / pts[i - 52][1] - 1; if (!R52.has(d)) R52.set(d, []); R52.get(d).push(v); }
}
for (const [, a] of R52) a.sort((x, y) => x - y);
function rsTercile(d, v) { const a = R52.get(d); if (!a || a.length < 50) return null; let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < v) lo = m + 1; else hi = m; } const q = lo / a.length; return q < 1 / 3 ? -1 : q > 2 / 3 ? 1 : 0; }
let cuts = 0;
for (let k = 0; k < files.length; k += EVERY) {
  let j; try { j = JSON.parse(readFileSync(join(D, files[k]), "utf8")); } catch { continue; }
  const pts = j.points || [], c = pts.map((p) => p[1]), t = pts.map((p) => p[0]);
  for (let a = 104; a < c.length - 8; a += STEP) {
    if (t[a] < FROM) continue;
    let r; try { r = TD.analyzeTopDown({ close: c, times: t, asOfIndex: a }); } catch { continue; }
    if (!r || r.status !== "OK" || !r.primary.invalidation || !r.path.length) continue;
    cuts++;
    const now = c[a], inv = r.primary.invalidation.price;
    const step = r.path.find((s) => !s.exhausted); if (!step) continue;
    const open = step.zone.tiers.find((z) => !z.passed); if (!open) continue;
    const up = step.direction === "UP", near = up ? open.low : open.high;
    if (up ? near <= now : near >= now) continue;   // Kurs schon in der Zone
    const invOk = r.primary.invalidation.direction === "below" ? inv < now : inv > now;
    if (!invOk) continue;
    /* M1 */
    const o = up ? firstHit(c, a, near, r.primary.invalidation.direction === "below" ? inv : null) : firstHit(c, a, r.primary.invalidation.direction === "above" ? inv : null, near);
    const res = o === 0 ? "open" : (up ? o === 1 : o === -1) ? "hit" : "miss";
    const mNear = 2 * now - near, mInv = 2 * now - inv;   // gespiegelt
    const mo = up ? firstHit(c, a, mInv > now ? mInv : null, mNear) : firstHit(c, a, mNear, mInv < now ? mInv : null);
    const mres = mo === 0 ? "open" : (up ? mo === -1 : mo === 1) ? "hit" : "miss";
    for (const key of ["all", step.degree, step.direction].concat(r.primary.anchor === 1 ? ["anchored"] : [])) {
      const m = M1[key]; m.n++; m[res]++; if (mres === "hit") m.mHit++; if (mres === "miss") m.mMiss++;
    }
    {
      const dl = Math.abs(Math.log(near / now)), U = now * Math.exp(dl), Dn = now * Math.exp(-dl), o3 = firstHit(c, a, U, Dn);
      if (o3 !== 0) {
        const hit = up ? o3 === 1 : o3 === -1, upF = o3 === 1;
        const altStep = (r.alternativePath || []).find((x) => !x.exhausted), agree = !!(altStep && altStep.direction === step.direction);
        const gap = r.candidates && r.candidates.gap !== null ? r.candidates.gap : 1, fit = r.primary.guidelineFit;
        m3("alle", hit, upF); m3("grad " + step.degree, hit, upF); m3(step.direction === "UP" ? "Richtung aufwärts" : "Richtung abwärts", hit, upF);
        m3(agree ? "Haupt+Alternative einig" : "Haupt+Alternative uneinig", hit, upF);
        if (gap >= 0.1) m3("klarer Abstand ≥ 0,1", hit, upF);
        if (fit >= 0.8) m3("Richtlinien ≥ 0,8", hit, upF);
        if (agree && gap >= 0.1 && fit >= 0.8) m3("alle drei Filter", hit, upF);
        /* Trend, Momentum, Relative Staerke: Elliott mit dem Filter einig, und der Filter allein */
        let sma = 0; for (let q = a - 39; q <= a; q++) sma += c[q]; sma /= 40;
        const trend = c[a] > sma ? 1 : -1, mom = a >= 26 ? (c[a] > c[a - 26] ? 1 : -1) : 0, rs = a >= 52 ? rsTercile(t[a], c[a] / c[a - 52] - 1) : null;
        const ed = up ? 1 : -1, hitDir = (d) => (d > 0 ? o3 === 1 : o3 === -1);
        m3("Filter allein: Trend", hitDir(trend), upF);
        if (ed === trend) m3("Elliott + Trend einig", hit, upF); else m3("Elliott gegen Trend", hit, upF);
        if (mom) { m3("Filter allein: Momentum", hitDir(mom), upF); if (ed === mom) m3("Elliott + Momentum einig", hit, upF); }
        if (rs === 1 || rs === -1) { m3("Filter allein: RS oberes/unteres Drittel", hitDir(rs), upF); if (ed === rs) m3("Elliott + RS einig", hit, upF); }
        if (ed === trend && ed === mom && rs === ed) { m3("Elliott + Trend + Momentum + RS", hit, upF); }
        if (trend === mom && rs === trend) m3("Filter allein: Trend + Momentum + RS", hitDir(trend), upF);
      }
    }
    /* M2: Korrektur gegen die grosse Richtung, danach Folgeschritt */
    const bigUp = r.primary.direction === "UP" ? (r.primary.kind === "IMPULSE") : (r.primary.kind !== "IMPULSE");
    const idx = r.path.indexOf(step), nxt = r.path[idx + 1];
    const against = (step.direction === "UP") !== bigUp;
    if (against && nxt && nxt.direction !== step.direction) {
      const zb = step.zone.tiers.find((z) => z.tier === "BASE"), ze = step.zone.tiers.find((z) => z.tier === "EXTENDED") || zb;
      if (!zb) continue;
      const longT = nxt.direction === "UP";
      const zNear = longT ? zb.high : zb.low, zFar = longT ? ze.low : ze.high;
      const stop = longT ? zFar * 0.99 : zFar * 1.01;
      const tz = nxt.zone.tiers[0], target = longT ? tz.low : tz.high;
      if (longT ? !(target > zNear) : !(target < zNear)) continue;
      M2.n++;
      let fill = -1;
      for (let i = a + 1; i <= Math.min(c.length - 1, a + H); i++) { if (longT ? c[i] <= zNear : c[i] >= zNear) { fill = i; break; } if (longT ? c[i] <= stop : c[i] >= stop) break; }
      if (fill < 0) continue;
      const entry = c[fill]; if (longT ? entry <= stop : entry >= stop) { M2.filled++; M2.loss++; M2.rSum -= 1; M2.cSum -= 1; continue; }
      M2.filled++;
      const R = Math.abs(target - entry) / Math.abs(entry - stop); M2.rr.push(R);
      const oo = longT ? firstHit(c, fill, target, stop) : firstHit(c, fill, stop, target);
      const win = longT ? oo === 1 : oo === -1, loss = longT ? oo === -1 : oo === 1;
      for (const off of [-39, -26, 26, 39]) pullback(c, a + off, longT, Math.abs(zNear - now) / now, Math.abs(zNear - stop) / zNear, Math.abs(target - zNear) / zNear, M2.pull);
      const d = (M2.byDeg[step.degree] = M2.byDeg[step.degree] || { filled: 0, win: 0, loss: 0, rSum: 0 }); d.filled++;
      if (win) { M2.win++; M2.rSum += R; M2.cSum += Math.min(CAP, R); d.win++; d.rSum += R; } else if (loss) { M2.loss++; M2.rSum -= 1; M2.cSum -= 1; d.loss++; d.rSum -= 1; } else M2.open++;
    }
  }
}
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);
const m1 = Object.fromEntries(Object.entries(M1).map(([k, m]) => [k, { faelle: m.n, trefferQuote: pct(m.hit, m.hit + m.miss), gespiegeltQuote: pct(m.mHit, m.mHit + m.mMiss), vorsprungPp: m.hit + m.miss && m.mHit + m.mMiss ? Math.round((m.hit / (m.hit + m.miss) - m.mHit / (m.mHit + m.mMiss)) * 1000) / 10 : null, offen: m.open }]));
const decided = M2.win + M2.loss;
const m2 = { kandidaten: M2.n, eingestiegen: M2.filled, ziel: M2.win, absicherung: M2.loss, offen: M2.open, trefferQuote: pct(M2.win, decided), medianChanceRisiko: M2.rr.length ? Math.round(M2.rr.sort((x, y) => x - y)[M2.rr.length >> 1] * 100) / 100 : null,
  erwartungR: decided ? Math.round((M2.rSum / decided) * 100) / 100 : null, erwartungRGedeckelt: decided ? Math.round((M2.cSum / decided) * 100) / 100 : null, nachGrad: Object.fromEntries(Object.entries(M2.byDeg).map(([k, d]) => [k, { eingestiegen: d.filled, trefferQuote: pct(d.win, d.win + d.loss), erwartungR: d.win + d.loss ? Math.round((d.rSum / (d.win + d.loss)) * 100) / 100 : null }])),
  beliebigerRuecksetzer: { faelle: M2.pull.filled, trefferQuote: pct(M2.pull.win, M2.pull.win + M2.pull.loss), erwartungR: M2.pull.win + M2.pull.loss ? Math.round((M2.pull.rSum / (M2.pull.win + M2.pull.loss)) * 100) / 100 : null, erwartungRGedeckelt: M2.pull.win + M2.pull.loss ? Math.round((M2.pull.cSum / (M2.pull.win + M2.pull.loss)) * 100) / 100 : null } };
mkdirSync(OUT, { recursive: true });
const m3o = Object.fromEntries(Object.entries(M3).map(([k, m]) => [k, { faelle: m.n, trefferQuote: pct(m.hit, m.n), immerAufwaerts: pct(m.up, m.n) }]));
const out = { schema: "vu-elliott-topdown-backtest-1", label: "Forschung, nicht zertifiziert", engine: TD.VERSION, generatedAt: new Date().toISOString(), params: { step: STEP, from: FROM, horizonWeeks: H, every: EVERY }, titel: Math.ceil(files.length / EVERY), stichtage: cuts, M1: m1, M2: m2, M3: m3o };
writeFileSync(join(OUT, "backtest.json"), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
