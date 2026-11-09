#!/usr/bin/env node
/* =========================================================================
   Namensanzeige gegen den NEUEN Namensstand (Wochenlauf Security Master).

   Der Wochenlauf baut Discover nicht neu (SMW-2). NM3 prueft die ausgelieferten
   Seiten deshalb gegen den committeten Namensstand. Damit dabei nichts verdeckt
   wird, listet dieses Skript jede Seite, deren angezeigter Name vom NEUEN
   Stand abweicht - mit altem und neuem Namen, Quelle und CIK. Es aendert nichts
   und schreibt nur nach --out.

     node scripts/market/report-name-display-drift.mjs --next <company-names.json>
          [--prev <company-names.json>] [--out <bericht.json>]

   Abweichungen mit CIK-Wechsel gegenueber --prev (anderer Emittent unter dem
   Ticker) werden eigens gezaehlt. Ob sie uebernommen werden duerfen, entscheidet
   das Gate (G9, Freigabeliste); dieses Skript blockiert nicht, es macht sichtbar.
   Mit --fail-on-issuer-change endet es bei einem solchen Fall mit Exit 1.
   ========================================================================= */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const argv = process.argv.slice(2), arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const J = (p) => JSON.parse(readFileSync(p, "utf8"));

export function nameDisplayDrift({ next, prev = null, searchIndex, pageOf }) {
  const nextBy = new Map(next.rows.map((r) => [r.ticker, r]));
  const prevBy = prev ? new Map(prev.rows.map((r) => [r.ticker, r])) : new Map();
  const drift = [];
  let checked = 0;
  for (const e of searchIndex.entries) {
    const r = nextBy.get(e.s);
    if (!r || r.status !== "RESOLVED") continue;
    const page = pageOf(e.s);
    if (!page) continue;
    checked++;
    const shown = (page.stock || page).companyName ?? null, want = r.displayName || r.companyName;
    if (shown === want && e.n === want) continue;
    const p = prevBy.get(e.s) || null;
    drift.push({ ticker: e.s, securityId: r.securityId, shownOnPage: shown, shownInSearch: e.n ?? null, next: want, nameSource: r.nameSource,
      cikPrev: p ? p.cik || null : null, cikNext: r.cik || null, issuerChanged: !!(p && p.cik && r.cik && p.cik !== r.cik) });
  }
  return { checked, drift, issuerChanged: drift.filter((d) => d.issuerChanged).length };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const nextFile = arg("--next");
  if (!nextFile) { console.error("--next fehlt"); process.exit(2); }
  const data = join(root, "discover", "data");
  const rep = nameDisplayDrift({
    next: J(nextFile), prev: arg("--prev") ? J(arg("--prev")) : null, searchIndex: J(join(data, "search", "US_REAL.json")),
    pageOf: (t) => { const f = join(data, "stocks", "US_REAL", t + ".json"); return existsSync(f) ? J(f) : null; }
  });
  if (arg("--out")) writeFileSync(arg("--out"), JSON.stringify(rep, null, 2) + "\n");
  console.log(`[namensanzeige] ${rep.checked} Seiten geprueft · ${rep.drift.length} zeigen noch den alten Namen (naechster Discover-Neubau) · ${rep.issuerChanged} mit CIK-Wechsel`);
  for (const d of rep.drift.slice(0, 50)) console.log(`  ${d.ticker}: "${d.shownOnPage}" -> "${d.next}" (${d.nameSource}${d.issuerChanged ? ", CIK " + d.cikPrev + " -> " + d.cikNext : ""})`);
  process.exit(rep.issuerChanged && argv.includes("--fail-on-issuer-change") ? 1 : 0);
}
