#!/usr/bin/env node
/* Erzeugt docs/technical-intelligence/ELLIOTT_RULE_MATRIX.md aus quant/engines/technical/elliott/sources.js
   (eine Quelle der Wahrheit) und prueft, welche Tests jede Regel abdecken. */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { ROOT } from "./lib/ti-data.mjs";
const require = createRequire(import.meta.url);
const S = require(join(ROOT, "quant/engines/technical/elliott/sources.js"));
const tests = readFileSync(join(ROOT, "quant/tests/ti-elliott-v2.test.mjs"), "utf8");
const testsFor = (id) => { const ids = []; const re = /test\("(EV2-[A-Z0-9]+)[^]*?\n\}\);/g; let m; while ((m = re.exec(tests))) if (m[0].includes(id)) ids.push(m[1]); return ids.length ? ids.join(", ") : "EV2-Q1 (Matrix-Konsistenz)"; };
const impl = { HARD_RULE: "patterns.js · Regelfunktion des Musters (`notBeyondAgainst` / `beyond` / Wert)", DEFINITION: "patterns.js · Regelfunktion des Musters", GUIDELINE: "patterns.js · `*Guidelines()` (band/near, 0–1)", VU_OPERATIONAL: "patterns.js · Regelfunktion (VU-Grenzwert)" };
const row = (id, m, kind) => `| \`${id}\` | ${m.statement} | ${S.SOURCES[m.source].title.split(",")[0]} — ${m.locator} | ${S.SOURCES[m.source].quality} | ${m.class} | ${kind === "C" ? "elliott-v2.js · countQuality/ruleAudit/applicability" : impl[m.class]} | ${testsFor(id)} | ${m.influence}${m.note ? " · " + m.note : ""} |`;
const head = "| ID | Beschreibung | Quelle — Fundstelle | Qualität | Klasse | Umsetzung | Test | Einfluss auf Count Quality |\n|---|---|---|---|---|---|---|---|";
const md = `# Elliott-Regelmatrix (quellengebunden)

> Automatisch erzeugt aus \`quant/engines/technical/elliott/sources.js\` von \`scripts/technical/elliott-rule-matrix.mjs\`. Nicht von Hand bearbeiten.

**Grundsatz:** „Hohe Count Quality" heißt bei Vision Universe: Die Zählung erfüllt die unten dokumentierten Regeln und Richtlinien, ist auf Quellen zurückführbar, algorithmisch reproduzierbar und unabhängig prüfbar — nicht, dass ein Mensch oder ein Sprachmodell den Chart „gut findet".

## Quellen

| Kürzel | Werk | Qualität | Rolle |
|---|---|---|---|
${Object.entries(S.SOURCES).map(([k, v]) => `| ${k} | ${v.title} | ${v.quality} | ${v.role} |`).join("\n")}

**Verifikation:** ${S.VERIFICATION}. Der Volltext liegt nicht im Repository, und die Domain des Verlags ist in der Arbeitsumgebung gesperrt. Seitenzahlen werden deshalb nicht angegeben. Zahlenwerte für Musterdefinitionen, die das Standardwerk nur qualitativ beschreibt, stammen aus dem Lehrwerk desselben Instituts (Qualität B) und sind so gekennzeichnet.

## Klassen

| Klasse | Bedeutung | Wirkung |
|---|---|---|
| HARD_RULE | unverletzliche Regel der Literatur | Verletzung → Zählung ungültig; **nie** durch Richtlinien oder Scores ausgleichbar |
| DEFINITION | Bestandteil der Musterdefinition | Verletzung → anderes Muster bzw. ungültig |
| GUIDELINE | Richtlinie der Literatur | ändert nur die Plausibilität (Rang, Count Quality), nie die Gültigkeit |
| VU_OPERATIONAL | VU-Grenzwert, wo die Literatur keinen nennt | wirkt wie eine Definition, ist aber **keine** klassische Regel |
| VU_HEURISTIC | VU-Ingenieurskriterium | Anwendbarkeit/Eindeutigkeit; keine Elliott-Regel |
| VU_MEASUREMENT | gemessene Eigenschaft | Audit und Anzeige; keine Elliott-Regel |

Eine **eigene empirische Beobachtung** von Vision Universe (z. B. aus der Validierungsstudie) wird nie als Elliott-Regel bezeichnet; sie steht ausschließlich in TECHNICAL_EVIDENCE / ELLIOTT_VALIDATION_REPORT.

## Regeln und Definitionen

${head}
${Object.entries(S.RULES).map(([k, m]) => row(k, m, "R")).join("\n")}

## Richtlinien

${head}
${Object.entries(S.GUIDELINES).map(([k, m]) => row(k, m, "G")).join("\n")}

## Count-Quality-Bestandteile und weitere Audit-Dimensionen

${head}
${Object.entries(S.CRITERIA).map(([k, m]) => row(k, m, "C")).join("\n")}

## Gewichtung der Count Quality (a priori, vor jeder Ergebnisbetrachtung festgelegt)

Count Quality = gewichtetes Mittel der verfügbaren Bestandteile: Richtlinien 0,25 · höherer Grad 0,20 · Unterteilung 0,15 · Zeitproportion 0,15 · Eindeutigkeit 0,15 · Wellencharakter 0,10. Stufen: hoch ≥ 0,70, mittel ≥ 0,55, sonst niedrig. **Ungültig**, sobald eine Regel oder Definition verletzt ist (kein Score).
Begründung: Richtlinien bündeln den Hauptinhalt der Lehrbuch-Plausibilität; Grad-Konsistenz ist für Praktiker zentral; Unterteilung ist Definition, aber durch die Auflösung der feineren Pivotskala oft nicht entscheidbar (0,5); Wellencharakter ist in der Literatur qualitativ und nur grob formalisierbar (RSI-Divergenz) → geringstes Gewicht.
Ob eine höhere Count Quality mit besseren späteren Ergebnissen einhergeht, ist eine **empirische** Frage — beantwortet in ELLIOTT_VALIDATION_REPORT (Qualitäts-Kalibrierung), nicht durch die Definition.
`;
writeFileSync(join(ROOT, "docs/technical-intelligence/ELLIOTT_RULE_MATRIX.md"), md);
console.log("ELLIOTT_RULE_MATRIX.md geschrieben:", Object.keys(S.RULES).length, "Regeln,", Object.keys(S.GUIDELINES).length, "Richtlinien,", Object.keys(S.CRITERIA).length, "Kriterien");
