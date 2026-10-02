/* =========================================================================
   VU Technical Intelligence — Produktschicht (API v3), geteilt von Build und
   Drift-Pruefung.

   1. ELLIOTT-REPLAY MIT PERSISTENZ
      Die Elliott-Engine (2.2) haelt eine Lesart, bis eine andere um mehr als
      die Hysterese besser ist. Dafuer braucht sie den Vortageszustand. Das
      Produkt rechnet deshalb die letzten WARMUP + STEPS Bars sequenziell
      (nur Elliott, billig) und uebergibt den Zustand von t−1 an die
      Endanalyse. Kausal: jeder Schritt nutzt nur Bars <= t.
      Nebenprodukt: Neuzuordnungs-Risiko (wie oft die Lesart in den letzten
      26 Schritten ohne Abschluss/Bruch gewechselt hat) und die Replay-
      Schnappschuesse fuer die Zeitachse.
   2. DATENVERTRAG (overlays): Zonen, Ziele, Ungueltig-Linien, Wellen,
      Szenario-Pfade mit Unsicherheitskorridor — das Frontend zeichnet, ohne
      Engine-Interna zu kennen.
   3. ZWEI EBENEN: "Was der Chart zeigt" (Strukturklarheit, deskriptiv) und
      "Was die Historie nahelegt" (Evidenz-Status) — nie vermischt.
   ========================================================================= */
import { join } from "node:path";
import { createRequire } from "node:module";
import { ROOT } from "./ti-data.mjs";

const require = createRequire(import.meta.url);
const TI = require(join(ROOT, "quant/engines/technical/ti/engine.js"));
const EV2 = require(join(ROOT, "quant/engines/technical/elliott/elliott-v2.js"));

export const REPLAY_STEPS = 26, WARMUP = 26;
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const r4 = (v) => (isNum(v) ? Math.round(v * 1e4) / 1e4 : v);

function info(E, close) {
  const p = E && E.primary;
  if (!p) return null;
  return { key: p.persistenceKey, scaleId: E.degrees.analysis, complete: p.complete, inv: p.invalidation ? p.invalidation.price : null, invDir: p.invalidation ? p.invalidation.direction : null };
}
/** Uebergang zweier aufeinanderfolgender Lesarten (gleich definiert wie in der Validierungsstudie). */
export function transition(prev, cur, close) {
  if (!prev || !cur) return prev || cur ? "CHANGE" : "NONE";
  if (prev.key === cur.key) return "SAME";
  const broke = isNum(prev.inv) && (prev.invDir === "below" ? close < prev.inv : close > prev.inv);
  return prev.complete || broke ? "RESET" : "RELABEL";
}

/**
 * Sequenzielles Elliott-Replay der letzten WARMUP+STEPS Bars mit Persistenz.
 * @returns { states: {t → previous-Zustand fuer Bar t}, relabels, transitions, lifetime }
 */
export function elliottReplay(series, P, steps = REPLAY_STEPS, warm = WARMUP) {
  const n = series.length, prep = P.main, start = Math.max(1, n - steps - warm);
  const states = {}, seq = [];
  let prevState = null, prevInfo = null;
  for (let t = start; t < n; t++) {
    states[t] = prevState;
    const E = EV2.analyzeElliottV2({ series, features: prep.features, pivots: prep.pivots, asOfIndex: t, barsPerYear: prep.profile.barsPerYear, previous: prevState });
    const cur = info(E, series.close[t]);
    if (t >= n - steps) seq.push({ t, tr: transition(prevInfo, cur, series.close[t]) });
    prevInfo = cur;
    prevState = E.primary ? { key: E.primary.persistenceKey, scaleId: E.degrees.analysis } : null;
  }
  const relabels = seq.filter((x) => x.tr === "RELABEL").length;
  let lifetime = 0; for (let k = seq.length - 1; k >= 0 && seq[k].tr === "SAME"; k--) lifetime++;
  return { states, relabels, resets: seq.filter((x) => x.tr === "RESET").length, steps: seq.length, lifetime,
           relabelingRisk: relabels === 0 ? "LOW" : relabels <= 2 ? "MEDIUM" : "HIGH" };
}

/** Endanalyse mit Persistenz (identisch in Build und Drift-Pruefung). */
export function analyzeProduct(series, opts) {
  const P = TI.prepare(series);
  const rep = elliottReplay(series, P);
  const t = series.length - 1;
  const res = TI.analyzeAt(P, t, Object.assign({}, opts, { elliottPrevious: rep.states[t] || null }));
  return { P, res, replay: rep };
}

/** Kompakte Replay-Schnappschuesse: was die Analyse an jedem der letzten Schritte gezeigt haette. */
export function replaySnapshots(series, P, rep, opts, every) {
  const n = series.length, out = [];
  for (let t = n - REPLAY_STEPS * every; t < n; t += every) {
    if (t < 1 || !(t in rep.states) && every === 1) continue;
    const state = rep.states[t] !== undefined ? rep.states[t] : null;
    const res = TI.analyzeAt(P, t, Object.assign({}, opts, { elliottPrevious: state }));
    const s = res.scenarios[0] || null, E = res.methods.elliott;
    out.push({
      d: res.asOf, c: r4(res.price.close), o: res.outlook.label, st: res.outlook.structure, cl: clarityOf(res).level,
      sc: s ? { k: s.kind, dir: s.direction, tpl: s.template, e: s.entryZone ? [s.entryZone.zoneLow, s.entryZone.zoneHigh] : null, t1: s.targets && s.targets[0] ? [s.targets[0].zoneLow, s.targets[0].zoneHigh] : null,
                t2: s.targets && s.targets[1] ? [s.targets[1].zoneLow, s.targets[1].zoneHigh] : null, inv: s.invalidation ? s.invalidation.price : null, r: s.range ? [[s.range.support.zoneLow, s.range.support.zoneHigh], [s.range.resistance.zoneLow, s.range.resistance.zoneHigh]] : null } : null,
      ew: E && E.primary ? { p: E.primary.patternName, w: E.primary.complete ? "abgeschlossen" : E.primary.currentWave.label, key: E.primary.persistenceKey, ab: !!(E.applicability && E.applicability.abstain),
                             waves: E.primary.waves.map((w) => [w.toTime, r4(w.toPrice), w.label, w.status === "DEVELOPING" ? 1 : 0]) } : null
    });
  }
  return out;
}

/**
 * Strukturklarheit (Konsument): beschreibt, wie eindeutig das Chartbild ist — KEINE Treffersicherheit.
 * CLEAR: Verfahren einig und keine Mischlage; AMBIGUOUS: gemischtes Bild oder geringe Einigkeit.
 */
export function clarityOf(res) {
  const agr = res.confidence && res.confidence.agreement, mixed = res.outlook.label === "MIXED";
  const level = mixed || agr === "LOW" ? "AMBIGUOUS" : agr === "HIGH" ? "CLEAR" : "MODERATE";
  return { level, text: { CLEAR: "Die Verfahren zeichnen ein klares, gleichgerichtetes Bild.", MODERATE: "Das Bild ist überwiegend gleichgerichtet, aber nicht in allen Punkten.", AMBIGUOUS: "Mehrere Lesarten sind gerade gleich plausibel." }[level],
           note: "Beschreibt die Eindeutigkeit des Chartbilds, nicht die Wahrscheinlichkeit eines Ergebnisses." };
}

/**
 * Evidenz-Status des Hauptszenarios (Ebene "Was die Historie nahelegt").
 * NOT_ESTABLISHED: geprueft, kein belastbarer Vorteil gegenueber Zufall mit gleicher Geometrie.
 * EXPERIMENTAL:   im Studienzeitraum etwas besser als Zufall, aber nicht vorab registriert bestaetigt.
 * NO_DATA:        zu wenige vergleichbare Faelle.
 * (VALIDATED waere nur nach bestandenem, vorab registriertem Bestaetigungstest moeglich — derzeit fuer keine Lage.)
 */
export function evidenceBadge(res) {
  const e = res.confidence && res.confidence.empirical;
  if (!e || e.status !== "OK") return { level: "NO_DATA", label: "Zu wenig Vergleichsfälle", text: "Für diese Lage gibt es zu wenige vergleichbare historische Fälle." };
  const better = isNum(e.upliftCiLow) ? e.upliftCiLow > 0 : isNum(e.liftCiLow) ? e.liftCiLow > 0 : false;
  return better
    ? { level: "EXPERIMENTAL", label: "Experimentell", text: "Vergleichbare Lagen erreichten Zielzone 1 im Studienzeitraum etwas häufiger als Zufall – nicht unabhängig bestätigt.", n: e.n, hit: e.t1HitRate, base: e.baselineRate }
    : { level: "NOT_ESTABLISHED", label: "Kein Vorteil belegt", text: "Für diese Lage ist kein verlässlicher Prognosevorteil gegenüber dem Zufall belegt.", n: e.n, hit: e.t1HitRate, base: e.baselineRate };
}

/** Datenvertrag fuer das Chart: alles, was gezeichnet wird, ohne Engine-Interna. */
export function overlaysOf(res) {
  const atr = res.price.atr, close = res.price.close, zones = [], invalidations = [], paths = [];
  (res.scenarios || []).forEach((s) => {
    if (s.entryZone) zones.push({ scenario: s.kind, kind: s.kind === "TAIL" ? "DEEPER" : "ENTRY", low: s.entryZone.zoneLow, high: s.entryZone.zoneHigh });
    (s.targets || []).slice(0, 2).forEach((z, q) => zones.push({ scenario: s.kind, kind: "TARGET", order: q + 1, low: z.zoneLow, high: z.zoneHigh }));
    if (s.range) { zones.push({ scenario: s.kind, kind: "RANGE_LOW", low: s.range.support.zoneLow, high: s.range.support.zoneHigh }); zones.push({ scenario: s.kind, kind: "RANGE_HIGH", low: s.range.resistance.zoneLow, high: s.range.resistance.zoneHigh }); }
    if (s.invalidation && isNum(s.invalidation.price)) invalidations.push({ scenario: s.kind, price: s.invalidation.price, direction: s.invalidation.direction, basis: "CLOSE" });
    /* Szenario-Pfad: Schritte ohne Datum; Korridor waechst mit dem Abstand zu heute (Unsicherheit). */
    const pts = [{ step: 0, price: close, half: 0 }];
    if (s.entryZone && !(close >= s.entryZone.zoneLow && close <= s.entryZone.zoneHigh)) pts.push({ step: 1, price: r4((s.entryZone.zoneLow + s.entryZone.zoneHigh) / 2), half: r4(0.6 * atr) });
    (s.targets || []).slice(0, 2).forEach((z, q) => pts.push({ step: pts.length, price: r4((z.zoneLow + z.zoneHigh) / 2), half: r4((1.2 + 1.0 * q) * atr * (1 + 0.25 * pts.length)) }));
    if (pts.length > 1) paths.push({ scenario: s.kind, direction: s.direction, points: pts });
  });
  const E = res.methods.elliott, ab = !!(E && E.applicability && E.applicability.abstain);
  const waveList = (c) => c ? c.waves.map((w) => ({ label: w.label, notation: w.notation, time: w.toTime, price: w.toPrice, fromTime: w.fromTime, fromPrice: w.fromPrice, status: w.status })) : [];
  return { zones, invalidations, projectedPaths: paths,
           waves: { primary: waveList(E && E.primary), alternative: waveList(E && E.alternatives && E.alternatives[0]), consumerVisible: !!(E && E.primary) && !ab, degree: E && E.degrees ? E.degrees.analysis : null },
           note: "Pfade sind Szenarien ohne Zeitangabe; die Breite des Korridors zeigt wachsende Unsicherheit." };
}

/** Elliott-Transparenz fuer die Profi-Ansicht (§54/§123). */
export function elliottTransparency(res, rep) {
  const E = res.methods.elliott;
  if (!E || !E.primary) return null;
  const p = E.primary, viol = (p.rules || []).filter((x) => x.passed === false).length, open = (p.rules || []).filter((x) => x.passed === null).length;
  return {
    status: p.complete ? "COMPLETE" : "DEVELOPING", currentWave: p.currentWave, degree: E.degrees, countQuality: p.countQuality, applicability: E.applicability,
    detection: p.detection, ruleViolations: viol, openRules: open, guidelineFit: p.rankComponents ? p.rankComponents.guidelines : null,
    higherDegreeAgreement: p.rankComponents ? p.rankComponents.higherDegree : null, candidateTree: E.candidateTree,
    relabeling: rep ? { risk: rep.relabelingRisk, relabelsLast26: rep.relabels, resetsLast26: rep.resets, stableFor: rep.lifetime } : null
  };
}
