#!/usr/bin/env node
/* Mission IX — Tabellen fuer den Abschlussbericht aus den Evidenzdateien (keine Zahl wird von Hand uebertragen).
     node scripts/technical/hsab/render-m9.mjs --dir quant/data/technical-intelligence/historical-accuracy/mission9 --out docs/technical-intelligence/hsab/MISSION9_TABLES.md */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

function arg(k, d) { const i = process.argv.indexOf("--" + k); return i >= 0 ? process.argv[i + 1] : d; }
const dir = arg("dir"), out = arg("out");
const load = (f) => (existsSync(join(dir, f)) ? JSON.parse(readFileSync(join(dir, f), "utf8")) : null);
const pct = (v, d = 1) => (typeof v === "number" ? (v * 100).toFixed(d) + " %" : "–");
const pp = (v) => (typeof v === "number" ? (v >= 0 ? "+" : "") + (v * 100).toFixed(1) : "–");
const ci = (a, f = pp) => (a && typeof a[0] === "number" ? "[" + f(a[0]) + "; " + f(a[1]) + "]" : "");
const x2 = (v) => (typeof v === "number" ? v.toFixed(2) : "–");
const ciX = (a) => (a && typeof a[0] === "number" ? "[" + x2(a[0]) + "; " + x2(a[1]) + "]" : "");
const num = (v, d = 2) => (typeof v === "number" ? v.toFixed(d) : "–");
const L = [];
const h = (s) => L.push("", s, "");

L.push("# Mission IX: Tabellen", "", "Automatisch erzeugt aus `quant/data/technical-intelligence/historical-accuracy/mission9/` (`render-m9.mjs`). Keine Kurse, nur Kennzahlen.");

/* ---------------- Track A ---------------- */
const TA = [["W_DEV (Woche, verbraucht)", load("local/tracka-w-dev.json")], ["W_VAL (Woche, verbraucht)", load("local/tracka-w-val.json")], ["A9_CONFIRM (Tag, neue Titel)", load("ci/a9-confirm-tracka.json")]].filter((x) => x[1]);
const taRow = (r) => `| ${r.bucket} | ${r.n} | ${pct(r.shareOfEvents)} | ${pct(r.hit)} | ${pct(r.control)} | ${pp(r.lift)} ${ci(r.liftCi)} | ${pct(r.randomWalkExpectation)} | ${num(r.medianTargetAtr)} / ${num(r.medianInvalidationAtr)} | ${num(r.payoffRatio)} | ${num(r.expectancyR)} | ${num(r.excessR)} | ${r.trendOnly ? pp(r.trendOnly.lift) : "–"} |`;
const taHead = "| Klasse | n | Anteil | Treffer | Kontrolle D | Lift Pp. [95 %] | Random Walk b/(a+b) | Ziel / Inv. (ATR, Median) | Payoff | E[R] | Überschuss R | Lift TREND_ONLY |\n|---|---|---|---|---|---|---|---|---|---|---|---|";
for (const [name, d] of TA) {
  h(`## Track A — ${name}`);
  L.push(`Ereignisse ${d.events}, Analysezeitpunkte ${d.analysisPoints ?? "–"}. Entscheidung HA1: **${d.decision ? d.decision.HA1 : "–"}**.`, "");
  L.push("### Nach Chance/Risiko (CRV = Zielabstand / Invalidationsabstand)", "", taHead, taRow(d.all), ...d.byRewardRisk.filter((r) => r.n).map(taRow));
  L.push("", "### Richtung × CRV", "", taHead, ...d.byDirectionRR.filter((r) => r.n).map(taRow));
  L.push("", "### Selektivität (symmetrisch, günstig, alle)", "", taHead, ...[...d.selectivitySymmetric, ...d.selectivityFavorable, ...d.selectivityAll].filter((r) => r.n).map(taRow));
  if (d.decision) {
    const D = d.decision;
    L.push("", "### Präregistrierte Entscheidung", "", "| Stufe | n | Treffer | Lift | HAC erfüllt | p (Holm, einseitig) |", "|---|---|---|---|---|---|",
      ...(D.symmetricAll ? [`| SYM·ALL (robust) | ${D.symmetricAll.n} | ${pct(D.symmetricAll.hit)} | ${pp(D.symmetricAll.lift)} ${ci(D.symmetricAll.liftCi)} | ${D.symmetricAll.meetsHac ? "ja" : "nein"} | – |`] : []),
      ...D.selectiveTiers.map((t) => `| ${t.bucket} | ${t.n} | ${pct(t.hit)} | ${pp(t.lift)} ${ci(t.liftCi)} | ${t.meetsHac ? "ja" : "nein"} | ${num(t.pHolm, 4)} |`));
    L.push("", `HA2 (Selektivität): ${D.HA2.map((x) => `${x.bucket} ${pp(x.lift)} ${ci(x.liftCi)} → nachweisbar ${x.detected ? "ja" : "nein"}, relevant ${x.meaningful ? "ja" : "nein"}`).join("; ")}.`);
    if (D.HA3) L.push("", `HA3 (Geometrie): in CRV < 0,5 trifft die Kontrolle ${pct(D.HA3.controlHit)}, VU ${pct(D.HA3.hit)}, Random Walk ${pct(D.HA3.randomWalk)}.`);
    L.push("", `HA4 (Trend allein): Differenz FULL − TREND_ONLY: ALL ${pp(D.HA4["ALL·ALL"])} Pp., SYM ${pp(D.HA4["SYM·ALL"])} Pp.`);
    L.push("", `HA5 (Erwartung): strukturell ${num(D.HA5.ALL.expectancyR, 3)} R (Überschuss gegen D ${num(D.HA5.ALL.excessR, 3)} R); Ausführung nach Kosten ${pct(D.HA5.ALL.trading.meanReturnAfterCosts, 2)} gegen gematchte Kontrolle ${pct(D.HA5.ALL.trading.controlMeanReturn, 2)}.`);
  }
}

/* ---------------- Track B ---------------- */
const TB = [["Überlebende DEV (Bucket 0/2)", load("local/trackb-w-dev.json")], ["Überlebende VAL (Bucket 1/2)", load("local/trackb-w-val.json")], ["Überlebende DEV, Sensitivität Anomalie-Tor inkl. Zukunft", load("local/trackb-w-dev-gatefull.json")], ["Delistete Kohorte (CI, verbraucht)", load("ci/tb-delisted.json")], ["Delistete Kohorte, Sensitivität Anomalie-Tor inkl. Zukunft (CI)", load("ci/tb-delisted-gatefull.json")],
            ["Wave-3-Forensik DEV (Bucket 0/4)", load("local/trackb-wave3-dev.json")], ["Wave-3-Forensik VAL (Bucket 1/4)", load("local/trackb-wave3-val.json")],
            ["Wave-3-Forensik DEV, Anomalie-Tor inkl. Zukunft", load("local/trackb-wave3-dev-gatefull.json")], ["Wave-3-Forensik VAL, Anomalie-Tor inkl. Zukunft", load("local/trackb-wave3-val-gatefull.json")]].filter((x) => x[1]);
for (const [name, d] of TB) {
  h(`## Track B — ${name}`);
  L.push(`Einheiten (Titel × Quartal) ${d.units}, Titel ${d.symbols}, davon delistet ${d.delistedUnits}; Fenster mit Datenanomalie ausgeschlossen: ${d.anomalyExcludedUnitHorizons} (Tor: ${(d.opts && d.opts.anomalyGate) || "past+future (Version 1.0)"}); Code ${d.version}. „gg. Schicht“ = gegen nicht markierte Einheiten derselben Schicht (ab 1.1.0).`, "");
  for (const H of ["12M", "24M", "36M"]) {
    L.push(`### Horizont ${H}: Fang und Präzision`, "", "| Signal | Abdeckung | 2× Präz. | 2× gg. Schicht | 3× Präz. | 3× gg. Schicht | 5× Präz. | 5× Recall | 5× gg. Schicht [95 %] | 5× gg. Datum | 10× Präz. | 10× gg. Schicht | Fehlentdeckung 5× |", "|---|---|---|---|---|---|---|---|---|---|---|---|---|");
    for (const r of d.results.filter((x) => x.horizon === H && x.mult)) {
      const m = r.mult;
      L.push(`| ${r.signal} | ${pct(r.coverage)} | ${pct(m["2x"].precision)} | ${x2(m["2x"].liftRatio)} | ${pct(m["3x"].precision)} | ${x2(m["3x"].liftRatio)} | ${pct(m["5x"].precision, 2)} | ${pct(m["5x"].recall)} | ${x2(m["5x"].liftRatio)} ${ciX(m["5x"].liftRatioCi)} | ${x2(m["5x"].liftRatioDateOnly)} | ${pct(m["10x"].precision, 2)} | ${x2(m["10x"].liftRatio)} | ${pct(m["5x"].falseDiscovery)} |`);
    }
    L.push("");
  }
  L.push("### Horizont 24M: Renditeverteilung (Kauf am Quartalsende, Halten 24 Monate, keine Kosten)", "", "| Signal | Mittel | Median | gestutzt 5 % | Trefferquote | Ø Gewinner | Median Gewinner | Ø Verlierer | Median Verlierer | Payoff | MFE Median | MAE Median | Top-1-%-Anteil | Top-5-%-Anteil | Mittel ohne Top 1 % | ohne Top 5 % | Überschuss gg. Schicht [95 %] | gedeckelt 4× | gg. Datum |", "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const r of d.results.filter((x) => x.horizon === "24M" && x.returns)) {
    const R = r.returns;
    L.push(`| ${r.signal} | ${pct(R.mean)} | ${pct(R.median)} | ${pct(R.trimmedMean5)} | ${pct(R.winRate)} | ${pct(R.avgWinner)} | ${pct(R.medianWinner)} | ${pct(R.avgLoser)} | ${pct(R.medianLoser)} | ${num(R.payoffRatio)} | ${pct(R.medianMfe)} | ${pct(R.medianMae)} | ${pct(R.top1PctShareOfGains)} | ${pct(R.top5PctShareOfGains)} | ${pct(R.meanWithoutTop1Pct)} | ${pct(R.meanWithoutTop5Pct)} | ${pp(R.excessMean)} ${ci(R.excessMeanCi)} | ${pp(R.excessMeanCapped4x)} | ${pp(R.excessMeanDateOnly)} |`);
  }
  if (d.earlyDetection) {
    L.push("", "### Frühe Erkennung (Episoden: erstes Quartal, ab dem ein Titel binnen 24 Monaten 5× erreicht)", "", "| Signal | Episoden | im Jahr davor markiert | Anteil | Median Quartale früher | Median verbleibendes Max-Vielfaches |", "|---|---|---|---|---|---|");
    for (const [k, v] of Object.entries(d.earlyDetection)) L.push(`| ${k} | ${v.episodes5x24M} | ${v.flaggedBefore5x} | ${pct(v.shareFlagged)} | ${v.medianQuartersEarly ?? "–"} | ${num(v.medianRemainingMaxMultiple24M)} |`);
  }
  if (d.wave3IncrementalWithin) {
    L.push("", `### Zusatzwert von ${d.wave3Signal} innerhalb einer Basisgruppe (gleiche Schicht, mit gegen ohne W3)`, "", "| Basis | Horizont | Basis-Einheiten | mit W3 | 2× Verhältnis [95 %] | 5× Verhältnis [95 %] | 10× Verhältnis | gedeckelter Überschuss 5×-Zeile [95 %] |", "|---|---|---|---|---|---|---|---|");
    for (const [bn, v] of Object.entries(d.wave3IncrementalWithin)) for (const hn of ["12M", "24M", "36M"]) { const x = v[hn]; if (!x) continue;
      L.push(`| ${bn} | ${hn} | ${x.baseUnits} | ${x.withW3} | ${x["2x"] ? x2(x["2x"].ratio) + " " + ciX(x["2x"].ratioCi) : "–"} | ${x["5x"] ? x2(x["5x"].ratio) + " " + ciX(x["5x"].ratioCi) : "–"} | ${x["10x"] ? x2(x["10x"].ratio) : "–"} | ${x["5x"] ? pp(x["5x"].cappedExcess) + " " + ci(x["5x"].cappedExcessCi) : "–"} |`); }
  }
  if (d.wave3WithinTrendMom) {
    L.push("", `### Wave 3 innerhalb TREND_MOM (Signal ${d.wave3Signal || "EW_EARLY_MOTIVE_INTERNAL"})`, "", "| Horizont | TREND_MOM-Einheiten | mit W3 | 2× mit / ohne | 5× mit / ohne | Median Endrendite mit / ohne |", "|---|---|---|---|---|---|");
    for (const [k, v] of Object.entries(d.wave3WithinTrendMom)) L.push(`| ${k} | ${v.trendMomUnits} | ${v.withW3} | ${pct(v["2x"].withW3)} / ${pct(v["2x"].withoutW3)} | ${pct(v["5x"].withW3, 2)} / ${pct(v["5x"].withoutW3, 2)} | ${pct(v.medianEndWith)} / ${pct(v.medianEndWithout)} |`);
  }
}

/* ---------------- Fallstudie ---------------- */
const cs = load("local/case-study-pltr.json");
if (cs) {
  h("## Fallstudie PLTR (nur Erklärung, eingefrorene Engine, Daten bis zum Stichtag)");
  L.push("| Stichtag | Wochen Historie | VU-Ausblick | Klarheit | Hauptszenario | interner bester IMPULSE (Richtung, Wellen, vollständig, Rang) | 52W-Rendite | Abstand 52W-Hoch | danach: 26W / 52W / 104W | Max-Vielfaches bis heute |", "|---|---|---|---|---|---|---|---|---|---|");
  for (const r of cs.rows) {
    const I = r.elliottInternal && r.elliottInternal.IMPULSE;
    L.push(`| ${r.date} | ${r.barsOfHistory}${r.belowHsabMinimum ? " (< 160)" : ""} | ${r.shown.outlook} | ${r.shown.clarity} | ${r.shown.primary ? r.shown.primary.direction + " " + r.shown.primary.template : "–"} | ${I ? (I.dir > 0 ? "auf" : "ab") + ", " + I.waves + ", " + (I.complete ? "ja" : "nein") + ", " + (I.pos + 1) : "–"} | ${pct(r.simple.ret52)} | ${pct(r.simple.dist52)} | ${x2(r.revealedAfterwards.m26)} / ${x2(r.revealedAfterwards.m52)} / ${x2(r.revealedAfterwards.m104)} | ${x2(r.revealedAfterwards.maxMultipleToEnd)} |`);
  }
}
writeFileSync(out, L.join("\n") + "\n");
console.log("[render-m9] " + out);
