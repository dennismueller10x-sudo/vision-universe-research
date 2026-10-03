/* Praezisions-/Abdeckungs-Grenze der Anwendbarkeit 3.2 (Mission III §19): je Schwelle Abdeckung (Anteil ausgegebener Zaehlungen),
   Praezision der Hauptzaehlung, Haupt-oder-Alternative, falsche Sicherheit; dazu AUC (Trennschaerfe) je Layout. Liest
   $VU_CALIB_DIR/appl32-SPLIT-*.json, schreibt quant/data/technical-intelligence/elliott-validation/frontier/applicability-frontier-SPLIT.json */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const split = process.argv[2] || "VALIDATION", DIR = (process.env.VU_CALIB_DIR || tmpdir()) + "/";
const TH = [0, 0.2, 0.35, 0.5, 0.6, 0.7, 0.75, 0.8, 0.9];
function auc(rows) { const pos = rows.filter((r) => r.hit).map((r) => r.appl), neg = rows.filter((r) => !r.hit).map((r) => r.appl); if (!pos.length || !neg.length) return null; let s = 0; for (const p of pos) for (const q of neg) s += p > q ? 1 : p === q ? 0.5 : 0; return +(s / pos.length / neg.length).toFixed(3); }
const out = { schemaVersion: "vu-elliott-frontier-1.0.0", generatedAt: new Date().toISOString(), split, note: "Positive Faelle (keine Negativklassen); abgeschlossen = Ende-Stufen, laufend = Mitte/P-Stufen; alle Rauschstufen.", layouts: {} };
for (const L of ["A", "B", "C1", "C2", "C3"]) {
  const f = DIR + "appl32-" + split + "-" + L + ".json"; if (!existsSync(f)) continue;
  const all = JSON.parse(readFileSync(f)).filter((r) => !r.neg && r.appl != null);
  const res = {};
  for (const [k, rows] of [["complete", all.filter((r) => !r.mid)], ["developing", all.filter((r) => r.mid)]]) {
    res[k] = { n: rows.length, auc: auc(rows), curve: TH.map((t) => { const s = rows.filter((r) => r.appl >= t); return { threshold: t, coverage: +(s.length / Math.max(1, rows.length)).toFixed(3), primaryPrecision: s.length ? +(s.filter((r) => r.hit).length / s.length).toFixed(3) : null, primaryOrAltPrecision: s.length ? +(s.filter((r) => r.alts).length / s.length).toFixed(3) : null, falseShare: s.length ? +(1 - s.filter((r) => r.hit).length / s.length).toFixed(3) : null, n: s.length }; }) };
  }
  out.layouts[L] = res;
}
mkdirSync(join(ROOT, "quant/data/technical-intelligence/elliott-validation/frontier"), { recursive: true });
writeFileSync(join(ROOT, "quant/data/technical-intelligence/elliott-validation/frontier/applicability-frontier-" + split.toLowerCase() + "-3.2.0.json"), JSON.stringify(out, null, 1));
for (const [L, r] of Object.entries(out.layouts)) for (const k of ["complete", "developing"]) console.log(L.padEnd(3), k.padEnd(10), "AUC", r[k].auc, r[k].curve.filter((c) => [0, 0.35, 0.6, 0.75].includes(c.threshold)).map((c) => `≥${c.threshold}: cov ${c.coverage} prec ${c.primaryPrecision} p+a ${c.primaryOrAltPrecision}`).join(" | "));
