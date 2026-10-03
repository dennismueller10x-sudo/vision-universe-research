#!/usr/bin/env node
/* Engine-3.3-Vorstudie (Mission IV §16–§24): Laufende Zaehlungen, Enthaltung, Qualitaetsmodell, Musterbalance.
   Liest die VALIDATION-Laeufe aller Stufen (nicht HOLDOUT):
     node scripts/technical/elliott-corpus-eval.mjs --v3 --split VALIDATION --layout C1|C2|C3 --tag m4-research
   Kennzahlen
     laufend (P60/P75/P90): Engine erkennt "laufend" (Hauptzaehlung nicht abgeschlossen) · richtig (judgeMid) ·
                            vorzeitig abgeschlossen (Hauptzaehlung abgeschlossen, obwohl das Muster laeuft) · falsche Sicherheit (falsch unter HOCH/MITTEL)
     abgeschlossen (C_EARLY/C_LATE): faelschlich "laufend" · richtig (beobachtbare Wahrheit)
     Enthaltung: Quote, Trefferquote mit/ohne Enthaltung
     Qualitaetsmodell: AUC des Anwendbarkeitswerts fuer "richtig" — gesamt, nur abgeschlossene, nur laufende Stufen
                       (trennt der Wert nur abgeschlossen von laufend, faellt die AUC innerhalb der Stufen auf ~0,5)
     Musterbalance: gewaehlte Hauptmuster vs. wahre Klassen (abgeschlossen, alle Rauschstufen)
   Ausgabe: quant/data/technical-intelligence/elliott-validation/engine33/research-validation.json */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./lib/ti-data.mjs";
import { CLASSES } from "../../quant/tests/elliott-corpus.mjs";

const DIR = join(ROOT, "quant/data/technical-intelligence/elliott-validation/corpus");
const pct = (a, b) => (b ? +(100 * a / b).toFixed(1) : null);
function auc(rows) {
  const s = rows.filter((r) => typeof r.applScore === "number"), pos = s.filter((r) => r.ok), neg = s.filter((r) => !r.ok);
  if (!pos.length || !neg.length) return { auc: null, n: s.length };
  let w = 0; for (const p of pos) for (const q of neg) w += p.applScore > q.applScore ? 1 : p.applScore === q.applScore ? 0.5 : 0;
  return { auc: +(w / (pos.length * neg.length)).toFixed(3), n: s.length, pos: pos.length };
}
const family = (pat) => (/IMPULSE|DIAGONAL/.test(pat || "") ? "MOTIVE" : pat ? "CORRECTIVE" : "NONE");
const truthPattern = (cls) => (CLASSES[cls] && CLASSES[cls].expect ? CLASSES[cls].expect[0] : cls);

const out = { schemaVersion: "vu-elliott-engine33-research-1.0.0", generatedAt: new Date().toISOString(), split: "VALIDATION", layouts: {} };
const pooled = [];
for (const L of ["C1", "C2", "C3"]) {
  const f = join(DIR, "corpus-validation-layout" + L + "-" + (process.argv[2] || "m4-research") + ".json");
  if (!existsSync(f)) { out.layouts[L] = { missing: true }; continue; }
  const j = JSON.parse(readFileSync(f, "utf8"));
  const rows = j.rows.filter((r) => CLASSES[r.cls] && !CLASSES[r.cls].negativeOf && !CLASSES[r.cls].unsupported).map((r) => {
    const noise = r.id.split("|")[1], mid = !!r.mid;
    const ok = mid ? r.rank === 0 : !!(r.obs && r.obs.valid && r.obs.rank === 0);
    return { L, cls: r.cls, noise, mid, stage: r.stage, ok, obsValid: mid ? true : !!(r.obs && r.obs.valid), abstain: r.abstain, level: r.applicability, applScore: r.applScore, complete: r.primaryComplete, pattern: r.primaryPattern };
  });
  pooled.push(...rows);
  out.layouts[L] = summarize(rows);
}
out.pooled = summarize(pooled);
function summarize(rows) {
  const P = rows.filter((r) => r.mid), C = rows.filter((r) => !r.mid && r.obsValid), Cnlm = C.filter((r) => r.noise !== "high");
  const conf = (a) => a.filter((r) => r.level === "HIGH" || r.level === "MODERATE");
  const patterns = {}; C.forEach((r) => { const k = r.pattern || "NONE"; patterns[k] = patterns[k] || { chosen: 0, correct: 0 }; patterns[k].chosen++; if (r.ok) patterns[k].correct++; });
  const truth = {}; C.forEach((r) => { const k = truthPattern(r.cls); truth[k] = (truth[k] || 0) + 1; });
  return {
    developing: { n: P.length, recognizedDeveloping: pct(P.filter((r) => r.complete === false).length, P.length), correct: pct(P.filter((r) => r.ok).length, P.length),
                  prematureComplete: pct(P.filter((r) => r.complete === true).length, P.length), confident: conf(P).length, falseConfidence: pct(conf(P).filter((r) => !r.ok).length, conf(P).length),
                  byStage: Object.fromEntries(["P60", "P75", "P90"].map((st) => { const a = P.filter((r) => r.stage === st); return [st, { n: a.length, correct: pct(a.filter((r) => r.ok).length, a.length), recognizedDeveloping: pct(a.filter((r) => r.complete === false).length, a.length) }]; })) },
    completed: { n: C.length, correctNlm: pct(Cnlm.filter((r) => r.ok).length, Cnlm.length), falseDeveloping: pct(C.filter((r) => r.complete === false).length, C.length) },
    abstention: { rate: pct(rows.filter((r) => r.abstain).length, rows.length), rateCompleted: pct(C.filter((r) => r.abstain).length, C.length), rateDeveloping: pct(P.filter((r) => r.abstain).length, P.length),
                  correctWhenNotAbstained: pct(C.filter((r) => !r.abstain && r.ok).length, C.filter((r) => !r.abstain).length), correctWhenAbstained: pct(C.filter((r) => r.abstain && r.ok).length, C.filter((r) => r.abstain).length),
                  correctAmongAbstainedAllStages: pct(rows.filter((r) => r.abstain && r.ok).length, rows.filter((r) => r.abstain).length) },
    qualityModel: { aucAllStages: auc(rows.filter((r) => r.obsValid)), aucCompletedOnly: auc(C), aucDevelopingOnly: auc(P), aucCompletedNlm: auc(Cnlm) },
    patternBalanceCompleted: { chosen: patterns, truth, familyChosen: C.reduce((a, r) => { const k = family(r.pattern); a[k] = (a[k] || 0) + 1; return a; }, {}),
                               familyTruth: C.reduce((a, r) => { const k = family(truthPattern(r.cls)); a[k] = (a[k] || 0) + 1; return a; }, {}) }
  };
}
mkdirSync(join(ROOT, "quant/data/technical-intelligence/elliott-validation/engine33"), { recursive: true });
writeFileSync(join(ROOT, "quant/data/technical-intelligence/elliott-validation/engine33/research-validation-" + (process.argv[2] || "m4-research") + ".json"), JSON.stringify(out, null, 1));
const p = out.pooled;
console.log(JSON.stringify({ developing: p.developing, completed: p.completed, abstention: p.abstention, qualityModel: p.qualityModel, familyChosen: p.patternBalanceCompleted.familyChosen, familyTruth: p.patternBalanceCompleted.familyTruth }, null, 1));
