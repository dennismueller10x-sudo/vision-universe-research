#!/usr/bin/env node
/* VU MISSION X — Einstufung je Setup × Variante aus DEV und VAL (Regeln: ELLIOTT_SETUP_SPEC.json evidenceLevels).
   ROBUST_EDGE ist historisch nicht erreichbar (keine unberuehrten Wochendaten) und bleibt dem prospektiven Register vorbehalten.
     node scripts/technical/elliott-setups/decide-setups.mjs --dev F --val F --out F */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SPEC, SPEC_SHA256 } from "./setup-library.mjs";

function arg(k, d) { const i = process.argv.indexOf("--" + k); return i >= 0 ? process.argv[i + 1] : d; }
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const L = SPEC.evidenceLevels;

export function classifyOne(dev, val) {
  if (!val || !val.n || val.n < L.minEventsVal) return { status: "INSUFFICIENT_EVIDENCE", reason: "n VAL = " + ((val && val.n) || 0) + " < " + L.minEventsVal };
  const ub = (c) => (c && isNum(c[1]) ? c[1] : null), lb = (c) => (c && isNum(c[0]) ? c[0] : null);
  if (dev && dev.n && ub(dev.liftDCi) < 0 && ub(val.liftDCi) < 0) return { status: "REJECT", reason: "Lift gegen dieselbe Geometrie (D) mit Obergrenze < 0 auf DEV und VAL" };
  const level2 = val.liftD >= 0.03 && lb(val.liftDCi) > 0 && lb(val.liftTRCi) > 0 && dev && dev.liftD > 0;
  if (level2) return { status: "INCREMENTAL_UTILITY", reason: "LEVEL 2: Lift gegen D und gegen Trend+RS auf VAL gesichert, DEV gleiches Vorzeichen (verbrauchte Daten)" };
  const level1 = dev && dev.expectancyR > 0 && val.expectancyR > 0 && lb(val.expectancyRCi) > 0;
  if (level1) return { status: "POSITIVE_UTILITY", reason: "LEVEL 1: strukturelle Erwartung > 0 auf DEV und VAL, Untergrenze VAL > 0" };
  return { status: "STRUCTURAL_ONLY", reason: "tritt auf, Invalidation und Projektion definiert, aber weder LEVEL 1 noch LEVEL 2" };
}

export function decideSetups(dev, val) {
  const out = {};
  for (const fam of SPEC.families.map((f) => f.id)) { out[fam] = {};
    for (const vr of Object.keys(val.results[fam])) out[fam][vr] = { ...classifyOne(dev.results[fam][vr].all, val.results[fam][vr].all), nDev: dev.results[fam][vr].all.n || 0, nVal: val.results[fam][vr].all.n || 0 }; }
  /* Produkt-Einstufung je Setup: angezeigte Variante PURE (Kundensicht); ENGINE_PRIMARY nur Forschung */
  const product = Object.fromEntries(Object.keys(out).map((f) => [f, out[f].PURE.status]));
  return { schemaVersion: "elliott-setup-decision-1.0.0", specSha256: SPEC_SHA256, rules: L, level3Note: L.LEVEL3_ROBUST_EDGE, perSetup: out, productClassification: product };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const dev = JSON.parse(readFileSync(arg("dev"), "utf8")), val = JSON.parse(readFileSync(arg("val"), "utf8"));
  if (dev.specSha256 !== SPEC_SHA256 || val.specSha256 !== SPEC_SHA256) throw new Error("Auswertung mit anderer Setup-Spec");
  const res = decideSetups(dev, val); writeFileSync(arg("out"), JSON.stringify(res, null, 1));
  console.log("[decide-setups] " + JSON.stringify(res.productClassification));
}
