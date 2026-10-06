#!/usr/bin/env node
/* Mission VIII — Markdown-Tabellen aus Auswertungsdateien (evaluate.mjs), damit Berichtszahlen nicht abgeschrieben werden.
     node scripts/technical/hsab/render-tables.mjs NAME=FILE [NAME=FILE …] > tables.md */
import { readFileSync } from "node:fs";

const files = process.argv.slice(2).map((a) => { const [n, f] = a.split("="); return [n, JSON.parse(readFileSync(f, "utf8"))]; });
const pct = (v) => (typeof v === "number" ? (v * 100).toFixed(1) + " %" : "–");
const pp = (v) => (typeof v === "number" ? (v >= 0 ? "+" : "") + (v * 100).toFixed(1) : "–");
const ci = (c) => (c && typeof c[0] === "number" ? `${pp(c[0])} … ${pp(c[1])}` : "–");
const num = (v) => (typeof v === "number" ? v.toLocaleString("de-DE") : "–");
const out = [];
const T = (title, head, rows) => { out.push(`\n### ${title}\n`, "| " + head.join(" | ") + " |", "|" + head.map(() => "---").join("|") + "|", ...rows.map((r) => "| " + r.join(" | ") + " |")); };

T("Hauptgröße und Kontrollen", ["Phase", "n", "PSS", "D", "Lift D (KI)", "E", "Lift E", "P", "Lift P", "P∩E", "Lift P∩E", "B", "Lift B", "C", "Lift C (KI)", "Gegenrichtung", "Δ Gegenr. (KI)", "Abdeckung", "Random-Walk b/(a+b)"],
  files.map(([n, d]) => { const P = d.tables.primary; return [n, num(P.vsD.n), pct(P.vsD.rate), pct(P.vsD.base), `${pp(P.vsD.lift)} (${ci(P.vsD.liftCi)})`, pct(P.vsE.base), pp(P.vsE.lift), pct(P.vsP_timingMatched.base), pp(P.vsP_timingMatched.lift),
    pct(P.vsPE_timingTrendMatched.base), pp(P.vsPE_timingTrendMatched.lift), pct(P.vsB.base), pp(P.vsB.lift), pct(P.vsC.base), `${pp(P.vsC.lift)} (${ci(P.vsC.liftCi)})`, pct(P.vsOppositeDirection.b), `${pp(P.vsOppositeDirection.diff)} (${ci(P.vsOppositeDirection.ci)})`, pct(P.coverageOfPoints), pct(P.martingale)]; }));
T("Weitere Outcomes", ["Phase", "Ziel 2", "Invalidation zuerst", "Zeitablauf", "Bestätigung", "Primär ∪ Alternative", "keine von beiden", "Umdeutung (Analysezeitpunkte)", "Umdeutung (je Bar)", "Niveauverschiebung (je Bar)", "Median Bars bis Ziel 1"],
  files.map(([n, d]) => { const S = d.tables.secondary, R = S.relabelBeforeResolution; return [n, pct(S.target2.rate), pct(S.invalidationFirst.rate), pct(S.timeout.rate), pct(S.confirmation.rate), pct(S.primaryOrAlternative.rate), pct(S.primaryOrAlternative.neitherResolvedShare),
    pct(R.dpBased.rate), R.perBarSample.n ? `${pct(R.perBarSample.rate)} (n ${num(R.perBarSample.n)})` : "–", R.levelShiftPerBar.n ? pct(R.levelShiftPerBar.rate) : "–", d.tables.primary.medianBars]; }));
T("Sensitivitäten der Hauptgröße", ["Phase", "Kundensicht Raster: Lift (KI)", "Zonenmitte", "Ziel per Schluss", "ohne grobe Rundung", "Quartal", "Jahr", "Union-Pool", "disjunkte Titel", "Kundensicht trivial = Misserfolg (PSS)", "inkl. unvollst. Horizont (PSS)", "Ausführung vs. D (KI)", "Erwartungswert R (Ereignis)", "R-Lift vs. D (KI)", "R-Lift vs. Gegenrichtung"],
  files.map(([n, d]) => { const P = d.tables.primary, S = P.sensitivity, G = d.tables.customerGridView; return [n, G ? `${pp(G.vsD.lift)} (${ci(G.vsD.liftCi)})` : "–", pp(P.ruleZoneMid.lift), pp(P.ruleCloseTarget.lift), pp(S.excludingCoarseRounding.lift), pp(P.vsD_blockQuarter.lift), pp(P.vsD_blockYear.lift),
    P.vsD_unionPool ? pp(P.vsD_unionPool.lift) : "–", S.disjointFromDailyDevSymbols ? pp(S.disjointFromDailyDevSymbols.lift) : "–", pct(S.customerViewTrivialAsFailure.rate), pct(S.incompleteHorizonIncluded.rate),
    `${pp(P.entryBasedVsD.lift)} (${ci(P.entryBasedVsD.liftCi)})`, P.expectedR.event.mean?.toFixed(3), `${P.expectedR.liftVsD.mean?.toFixed(3)} (${P.expectedR.liftVsD.ci?.map((x) => x?.toFixed(3)).join(" … ")})`, P.expectedR.liftVsOpposite.mean?.toFixed(3)]; }));
for (const [n, d] of files) {
  T(`Abdeckung–Genauigkeit (${n})`, ["Stufe", "Ereignisse", "Abdeckung", "Abdeckung wertbar", "Erfolg", "Kontrolle D", "Lift (KI)", "Umdeutung je Bar"],
    d.tables.coverageAccuracy.map((r) => [r.tier, num(r.events), pct(r.coverage), pct(r.coverageScorable), pct(r.rate), pct(r.base), r.lift !== undefined ? `${pp(r.lift)} (${ci(r.liftCi)})` : "–", r.relabelRatePerBar !== undefined && r.relabelRatePerBar !== null ? pct(r.relabelRatePerBar) : "–"]));
  T(`Strukturklarheit (${n})`, ["Stufe", "n", "Erfolg", "D", "Lift (KI)", "Invalidation zuerst", "Zeitablauf", "Umdeutung je Bar", "Median Bars bis Umdeutung"],
    Object.entries(d.tables.structureClarity).map(([k, v]) => [k, num(v.n), pct(v.rate), pct(v.base), `${pp(v.lift)} (${ci(v.liftCi)})`, pct(v.invalidationFirst), pct(v.timeoutShare), v.relabelPerBar !== null ? pct(v.relabelPerBar) : "–", v.medianBarsToRelabel ?? "–"]));
  T(`Ablation gepaart (${n})`, ["Variante", "mit Szenario", "identisch", "n", "Δ (FULL − Variante) kontrollbereinigt (KI)"],
    Object.entries(d.tables.ablationPaired).map(([k, v]) => [k, pct(v.eventsWithVariantScenario), pct(v.identicalScenarioShare), num(v.n), `${pp(v.diff)} (${ci(v.ci)})`]));
  T(`Ablation eigene Ereignisse (${n})`, ["Variante", "Ereignisse", "Abdeckung", "Erfolg", "D", "Lift (KI)"],
    Object.entries(d.tables.ablation).map(([k, v]) => [k, num(v.events), pct(v.coverage), pct(v.rate), pct(v.base), `${pp(v.lift)} (${ci(v.liftCi)})`]));
  T(`Richtung: Modelle an Analysezeitpunkten (${n})`, ["Modell", "Abdeckung", "Long-Anteil", "Barriere ±2 ATR", "Barriere-Lift vs. Datum (KI)", "13W/63T marktbereinigt", "Ø Überrendite"],
    Object.entries(d.tables.directional).map(([k, v]) => [k, pct(v.coverage), pct(v.longShare), pct(v.barrier2Atr.rate), `${pp(v.barrierLiftVsSameDate.mean)} (${ci(v.barrierLiftVsSameDate.ci)})`, pct(v.fwdMarketAdjustedHit.rate), pct(v.meanSignedExcessReturn.mean)]));
  T(`Familienbedingungen (${n})`, ["Familie", "stützt: n / Lift", "neutral: n / Lift", "widerspricht: n / Lift"],
    Object.entries(d.tables.familyCondition).map(([k, v]) => [k, ...["SUPPORTS", "NEUTRAL", "CONTRADICTS"].map((s) => (v[s] ? `${num(v[s].n)} / ${v[s].suppressed ? "–" : pp(v[s].lift) + " (" + ci(v[s].liftCi) + ")"}` : "–"))]));
  T(`Konfluenzzahl und Konflikt (${n})`, ["Gruppe", "n", "Lift (KI)"],
    [...Object.entries(d.tables.confluenceCount), ...Object.entries(d.tables.conflict)].map(([k, v]) => [k, num(v.n), v.suppressed ? "–" : `${pp(v.lift)} (${ci(v.liftCi)})`]));
  const E = d.tables.elliott;
  T(`Elliott (${n})`, ["Gruppe", "n", "Erfolg", "Lift (KI)"],
    [["Anteil Zeitpunkte, an denen Elliott spricht", pct(E.speakShareOfPoints), "", ""],
     ...["asFilter", "hypothesis", "motiveVsCorrective", "applicability", "higherDegree", "shapedScenario"].flatMap((g) => Object.entries(E[g]).map(([k, v]) => [g + ": " + k, num(v.n), pct(v.rate), v.suppressed ? "(n < Mindestzahl)" : `${pp(v.lift)} (${ci(v.liftCi)})`])),
     ...["SPEAKS", "ABSTAINS"].map((k) => { const v = E.prospectiveConsistency[k]; return ["Prospektive Konsistenz: " + k, num(v.n), pct(v.rate), `${pp(v.lift)} (${ci(v.liftCi)}); Umzählung zuerst ${v.relabelledFirstPerBar !== null ? pct(v.relabelledFirstPerBar) : "–"} (n ${v.relabelN})`]; })]);
  for (const [sn, tab] of Object.entries(d.tables.segments)) T(`Segment ${sn} (${n})`, ["Wert", "n", "Erfolg", "D", "Lift (KI)", "q (BH)"],
    Object.entries(tab).map(([k, v]) => [k, num(v.n), v.suppressed ? "–" : pct(v.rate), v.suppressed ? "–" : pct(v.base), v.suppressed ? "(n < Mindestzahl)" : `${pp(v.lift)} (${ci(v.liftCi)})`, v.qBH ?? "–"]));
  const C = d.tables.concentration; out.push(`\n**Konzentration (${n}):** ${num(C.symbolsWithEvents)} Titel mit Ereignissen, Median ${C.eventsPerSymbolMedian} je Titel, Maximum ${C.eventsPerSymbolMax}, Top-10-Anteil ${pct(C.top10Share)}, HHI ${C.hhi}.`);
  const U = d.universe; out.push(`\n**Universum (${n}):** ${num(U.symbolsWithPoints)} Titel mit Analysezeitpunkten, ${U.firstPoint} – ${U.lastPoint}. Titel je Jahr: ${Object.entries(U.symbolsByYear).map(([y, c]) => y + ": " + c).join(", ")}.`);
}
console.log(out.join("\n"));
