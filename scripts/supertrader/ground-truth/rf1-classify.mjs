// Minervini Rule Fidelity RF1 – Ursachenklassifikation der verpassten MAIN-Faelle (reproduzierbar, keine Handeintraege).
// Eingabe: eingefrorene Replay-Ergebnisse (Universum/Trend/VCP an t*) + RF1-Validierung (SEPA auf Kern-Daten 1.23.0).
// Regel der Zuordnung (vorab, in dieser Reihenfolge, je Fall genau eine Hauptklasse):
//   DATA_UNIVERSE      SEPA-Daten fehlen (Auslandsemittent ohne vierteljaehrliche US-GAAP-Reihe; Personengesellschaft: EPS-Tag nur in 10-K) oder Messrahmen (MR-UNI-01) verletzt
//   PRE_PROFIT         SEPA scheitert mit SEPA_BASE_NOT_POSITIVE (Vorjahres- UND aktuelles Quartal ohne Gewinn)
//   PRACTICE_BEYOND_RULES alle uebrigen Ablehnungen (Umsatz, Beschleunigung, RS, Basislaenge ...): Ermessen/Einstiegsart/Proxy
// Die Klassenzahlen haengen von der Reihenfolge ab (Review F10): Wuerde BASE_TOO_SHORT vor SEPA gelten, waeren es 5/3/4 statt 7/3/2.
// Zusatzmerkmal: vcpShortBase = VCP scheitert an BASE_TOO_SHORT (Einstiegsart Cheat/Power Play/Fortsetzung moeglich).
// node rf1-classify.mjs <rf1-validation.json> <out.json>
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url)); const FID = path.resolve(here, '../../../scripts/supertrader/fidelity');
const [VAL, OUT] = process.argv.slice(2);
const val = JSON.parse(fs.readFileSync(VAL, 'utf8')).rows;
const frozen = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(FID, 'MINERVINI-GROUND-TRUTH-RESULTS.json'), 'utf8')).cases.map((c) => [c.case_id, c]));
const out = [];
for (const r of val.filter((x) => x.group === 'MAIN' && !x.skipped)) {
  const rp = frozen[r.id].replay; const sepa = r.core?.sepa11 || r.sepa11;
  const blockers = [];
  if (!rp.universe?.ok) blockers.push({ layer: 'UNIVERSE', rule: 'MR-UNI-01', detail: !rp.universe.dollarVolumeOk ? 'Dollarumsatz' : 'Rohkurs' });
  if (!rp.trend?.ok) blockers.push({ layer: 'TREND', rule: (rp.trend.failed || []).join(','), detail: `RS ${rp.trend.rsPercentile}` });
  if (!rp.vcp?.ok) blockers.push({ layer: 'VCP', rule: 'MR-VCP-01/08', detail: `${rp.vcp.reason} (${rp.vcp.baseLength})` });
  if (!sepa.ok) blockers.push({ layer: 'SEPA', rule: sepa.rule, detail: sepa.reason });
  if (frozen[r.id].replay.decision === 'DETECTED') { out.push({ id: r.id, ticker: r.ticker, decision: 'DETECTED', blockers: [] }); continue; }
  let cls = 'PRACTICE_BEYOND_RULES';
  if (sepa.reason === 'SEPA_DATA_MISSING' || sepa.reason === 'SEPA_STALE' || !rp.universe?.ok) cls = 'DATA_UNIVERSE';
  else if (sepa.reason === 'SEPA_BASE_NOT_POSITIVE') cls = 'PRE_PROFIT';
  out.push({ id: r.id, ticker: r.ticker, decision: 'REJECTED', mainClass: cls, vcpShortBase: rp.vcp?.reason === 'BASE_TOO_SHORT', soleBlocker: blockers.length === 1 ? blockers[0] : null, blockers, correctedByRF1: !!r.core?.flippedV1 });
}
const rej = out.filter((o) => o.decision === 'REJECTED');
const counts = {}; for (const o of rej) counts[o.mainClass] = (counts[o.mainClass] || 0) + 1;
const summary = { schema: 'vu-minervini-rule-fidelity-case-classes-1.0.0', dataBasis: 'SEPA auf Kern 1.23.0 (Erstmeldung ueber alle Tags); Universum/Trend/VCP aus dem eingefrorenen Replay', main: out.length, detected: out.filter((o) => o.decision === 'DETECTED').length, rejected: rej.length, classes: counts,
  vcpShortBaseCases: rej.filter((o) => o.vcpShortBase).map((o) => o.ticker), soleBlockerCases: rej.filter((o) => o.soleBlocker).map((o) => ({ ticker: o.ticker, layer: o.soleBlocker.layer, detail: o.soleBlocker.detail })), correctedByRF1: rej.filter((o) => o.correctedByRF1).map((o) => o.ticker), cases: out };
fs.writeFileSync(OUT, JSON.stringify(summary, null, 1));
console.log(JSON.stringify({ main: summary.main, detected: summary.detected, rejected: summary.rejected, classes: summary.classes, vcpShortBase: summary.vcpShortBaseCases, soleBlocker: summary.soleBlockerCases, correctedByRF1: summary.correctedByRF1 }, null, 1));
for (const o of rej) console.log(o.ticker.padEnd(5), o.mainClass.padEnd(22), 'short=' + (o.vcpShortBase ? 1 : 0), o.blockers.map((b) => b.layer + ':' + b.detail).join(' | '));
