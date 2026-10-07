#!/usr/bin/env node
/* Mission X — Tabellen je Setup × Variante aus den Evidenzdateien (keine Handwerte).
     node scripts/technical/elliott-setups/render-m10.mjs --dir quant/data/technical-intelligence/elliott-setups --out docs/technical-intelligence/hsab/MISSION10_SETUP_TABLES.md */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

function arg(k, d) { const i = process.argv.indexOf("--" + k); return i >= 0 ? process.argv[i + 1] : d; }
const dir = arg("dir"), load = (f) => (existsSync(join(dir, f)) ? JSON.parse(readFileSync(join(dir, f), "utf8")) : null);
const pct = (v, d = 1) => (typeof v === "number" ? (v * 100).toFixed(d) + " %" : "–");
const pp = (v) => (typeof v === "number" ? (v >= 0 ? "+" : "") + (v * 100).toFixed(1) : "–");
const ci = (a, f = pp) => (a && typeof a[0] === "number" ? " [" + f(a[0]) + "; " + f(a[1]) + "]" : "");
const n2 = (v) => (typeof v === "number" ? v.toFixed(2) : "–");
const L = ["# Mission X: Setup-Tabellen", "", "Automatisch erzeugt (`render-m10.mjs`) aus `quant/data/technical-intelligence/elliott-setups/`. Woche, Überlebende; DEV = Titelhälfte 0/2 (Entwicklung), VAL = Titelhälfte 1/2 (Validierung nach Freeze). Beides sind verbrauchte Daten.", ""];
const dec = load("setup-decision.json");
if (dec) { L.push("## Einstufung (mechanisch, `decide-setups.mjs`)", "", "| Setup | Variante | n DEV | n VAL | Einstufung | Begründung |", "|---|---|---|---|---|---|");
  for (const [f, V] of Object.entries(dec.perSetup)) for (const [v, x] of Object.entries(V)) L.push(`| ${f} | ${v} | ${x.nDev} | ${x.nVal} | **${x.status}** | ${x.reason} |`); L.push(""); }
for (const [ph, file] of [["VAL", "setup-eval-w-val.json"], ["DEV", "setup-eval-w-dev.json"]]) {
  const d = load(file); if (!d) continue;
  L.push(`## ${ph}: kurzer Horizont (26 Wochen), Ziel 1 vor Invalidation`, "", `Aufgelöste Ereignisse ${d.rowsResolved}; Erkennungspunkte ${d.detectionPoints}. Status: ${Object.entries(d.statusCounts).map(([k, v]) => k + " " + v).join(", ")}.`, "",
    "| Setup | Variante | Richtung | n | Treffer [95 %] | Kontrolle D | Lift D | Lift Trend | Lift Trend+RS | Lift gleiche Aktie (C) | Ziel / Inv. (ATR) | CRV | Payoff | E[R] | Invalidiert zuerst | Umdeutung | Bestätigung | Abdeckung |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const [f, V] of Object.entries(d.results)) for (const [v, X] of Object.entries(V)) for (const side of ["all", "up", "down"]) { const a = X[side]; if (!a || !a.n) continue;
    L.push(`| ${f} | ${v} | ${side} | ${a.n} | ${pct(a.hit)}${ci(a.hitCi, (x) => (x * 100).toFixed(1))} | ${pct(a.controlD)} | ${pp(a.liftD)}${ci(a.liftDCi)} | ${pp(a.liftT)} | ${pp(a.liftTR)}${ci(a.liftTRCi)} | ${pp(a.liftC)} | ${n2(a.geometry.medianTargetAtr)} / ${n2(a.geometry.medianInvalidationAtr)} | ${n2(a.geometry.medianRewardRisk)} | ${n2(a.payoff.payoffRatio)} | ${n2(a.expectancyR)}${ci(a.expectancyRCi, n2)} | ${pct(a.invalidatedFirst)} | ${pct(a.relabelBeforeResolution)} | ${pct(a.confirmationBeforeExit)} | ${pct(a.coverageOfDetectionPoints, 2)} |`); }
  L.push("", `## ${ph}: lange Horizonte (nur Aufwärts-Setups)`, "", "| Setup | Variante | Horizont | n | Median | Mittel (4× gedeckelt) | Überschuss gg. Datum [95 %] | gg. Trend×RS [95 %] | 2× / 3× / 5× | 2× gg. Datum [95 %] | 2× gg. Trend×RS | MFE / MAE (Median) |", "|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const [f, V] of Object.entries(d.results)) for (const [v, X] of Object.entries(V)) { const a = X.up; if (!a || !a.long) continue;
    for (const [hn, x] of Object.entries(a.long)) { if (!x || !(x.n >= 20)) continue;
      L.push(`| ${f} | ${v} | ${hn} | ${x.n} | ${pct(x.medianReturn)} | ${pct(x.meanReturnCapped4x)} | ${pp(x.excessVsDate)}${ci(x.excessVsDateCi)} | ${pp(x.excessVsTrendRsCell)}${ci(x.excessVsTrendRsCellCi)} | ${pct(x.rate2x)} / ${pct(x.rate3x)} / ${pct(x.rate5x)} | ${n2(x.ratio2xVsDate)}${ci(x.ratio2xVsDateCi, n2)} | ${n2(x.ratio2xVsTrendRs)} | ${pct(x.medianMfe)} / ${pct(x.medianMae)} |`); } }
  L.push("");
}
const cs = load("case-study-pltr-setups.json");
if (cs) { L.push("## Fallstudie PLTR unter Library V1 (nur Erklärung)", "", "| Datum | VU-Ausblick | Primärzählung | Setup (Status, angezeigt) | Trend | RS26-Rang | Marktstruktur | interne Welle 3 | danach 26W / 52W / 104W |", "|---|---|---|---|---|---|---|---|---|");
  for (const r of cs.rows) { if (r.skip) { L.push(`| ${r.date} | ${r.skip} | | | | | | | |`); continue; }
    L.push(`| ${r.date} | ${r.outlook} / ${r.clarity} | ${r.primary ? r.primary.pattern + (r.primary.complete ? " fertig" : " Welle " + r.primary.wave) + ", weiter " + r.primary.nextMove + (r.primary.abstain ? ", enthält sich" : "") : "–"} | ${r.setup ? r.setup.id + " " + r.setup.status + (r.setup.displayed ? ", angezeigt" : ", nicht angezeigt") : "–"} | ${r.trend} | ${n2(r.rs26Rank)} | ${n2(r.marketStructureVote)} | ${r.researchInternalWave3 ? (r.researchInternalWave3.qualifies ? "ja" : "nein") + " (Rang " + (r.researchInternalWave3.rank + 1) + ")" : "–"} | ${n2(r.after.m26)} / ${n2(r.after.m52)} / ${n2(r.after.m104)} |`); } }
writeFileSync(arg("out"), L.join("\n") + "\n"); console.log("[render-m10] " + arg("out"));
