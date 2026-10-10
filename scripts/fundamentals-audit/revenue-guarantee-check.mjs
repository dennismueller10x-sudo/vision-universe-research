#!/usr/bin/env node
// Prueft die Zusage von E2-R ueber das ganze Universum: jede Umsatzzelle (gleiches Periodenende) traegt im korrigierten
// Bundle entweder den Wert von main oder einen groesseren. Kleinere Werte sind nur zulaessig, wenn eine andere belegte
// Ursache vorliegt (E9 Waehrung: Einheit im Bundle-Kopf geaendert; E3/E3b: Periodenlabel geaendert) - sie werden
// getrennt gezaehlt und mit Beispielen ausgegeben, nicht weggefiltert.
//   node revenue-guarantee-check.mjs <old-dir> <new-dir> <out.json>
import fs from "node:fs";
import path from "node:path";

const [oldDir, newDir, outPath] = process.argv.slice(2);
const TOL = 0.005;
const counts = { cells: 0, equal: 0, larger: 0, smallerLabelChanged: 0, smallerUnitChanged: 0, smallerUnexplained: 0 };
const examples = { smallerUnexplained: [], smallerLabelChanged: [], smallerUnitChanged: [] };
const issuers = { larger: new Set(), smallerUnexplained: new Set() };
for (const f of fs.readdirSync(newDir).filter((x) => /^CIK\d+\.json$/.test(x)).sort()) {
  if (!fs.existsSync(path.join(oldDir, f))) continue;
  const a = JSON.parse(fs.readFileSync(path.join(oldDir, f), "utf8"));
  const b = JSON.parse(fs.readFileSync(path.join(newDir, f), "utf8"));
  const ticker = (b.tickers || [])[0] || b.cik;
  const unitChanged = (a.units?.revenue || "USD") !== (b.units?.revenue || "USD");
  for (const section of ["annual", "quarterly"]) {
    const ra = new Map((a[section]?.revenue || []).map((r) => [r[2], r]));
    for (const r of b[section]?.revenue || []) {
      const o = ra.get(r[2]);
      if (!o) continue;
      counts.cells += 1;
      const x = o[3]; const y = r[3];
      const scale = Math.max(Math.abs(x), Math.abs(y), 1);
      if (Math.abs(x - y) <= TOL * scale) { counts.equal += 1; continue; }
      if (y > x) {
        counts.larger += 1; issuers.larger.add(ticker);
        // Q4 = FY - 9M: steigt nur Q4, waehrend Q1-Q3 desselben Jahres gleich bleiben und das FY um denselben Betrag
        // steigt, hat Q4 einen Konzeptwechsel zwischen 10-K und 10-Q aufgenommen (Gesamt- minus Teilumsatz).
        if (section === "quarterly" && r[1] === "Q4") {
          const fyNew = (b.annual?.revenue || []).find((z) => z[2] === r[2]);
          const fyOld = (a.annual?.revenue || []).find((z) => z[2] === r[2]);
          const sameYear = (b.quarterly?.revenue || []).filter((z) => z[0] === r[0] && z[1] !== "Q4");
          const q13Unchanged = sameYear.length === 3 && sameYear.every((z) => { const q = ra.get(z[2]); return q && Math.abs(q[3] - z[3]) <= TOL * Math.max(Math.abs(q[3]), 1); });
          if (fyNew && fyOld && q13Unchanged && Math.abs((fyNew[3] - fyOld[3]) - (y - x)) <= TOL * scale) {
            counts.q4AbsorbsConceptSwitch = (counts.q4AbsorbsConceptSwitch || 0) + 1;
            (examples.q4AbsorbsConceptSwitch ||= []).length < 40 && examples.q4AbsorbsConceptSwitch.push({ ticker, end: r[2], main: x, corrected: y, fyMain: fyOld[3], fyCorrected: fyNew[3] });
          }
        }
        continue;
      }
      const labelChanged = o[0] !== r[0] || o[1] !== r[1];
      const key = unitChanged ? "smallerUnitChanged" : labelChanged ? "smallerLabelChanged" : "smallerUnexplained";
      counts[key] += 1;
      if (key === "smallerUnexplained") issuers.smallerUnexplained.add(ticker);
      if (examples[key].length < 40) examples[key].push({ ticker, section, end: r[2], main: x, corrected: y, label: `${o[0]}${o[1]} -> ${r[0]}${r[1]}` });
    }
  }
}
const out = { schema: "vu-fundamental-revenue-guarantee-1.0.0", tolerance: TOL, counts,
  issuers: { larger: issuers.larger.size, smallerUnexplained: issuers.smallerUnexplained.size }, examples };
fs.writeFileSync(outPath, JSON.stringify(out, null, 1));
console.log(JSON.stringify({ counts, issuers: out.issuers }));
for (const e of examples.smallerUnexplained.slice(0, 25)) console.log(JSON.stringify(e));
for (const e of (examples.q4AbsorbsConceptSwitch || []).slice(0, 15)) console.log('Q4', JSON.stringify(e));
