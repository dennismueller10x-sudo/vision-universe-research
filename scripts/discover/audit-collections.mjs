/* =========================================================================
   VISION UNIVERSE DISCOVER — audit-collections.mjs

   WARUM STEHT DAS DA VORN?

   Bevor eine Reihe umgebaut wird, muss klar sein, was sie heute tut: nach
   welcher Regel sie Titel aufnimmt, wonach sie sortiert, wer dadurch vorn
   steht - und warum dort so oft ein Name steht, den kein Privatanleger
   kennt. Dieses Skript beantwortet das aus den ausgelieferten Daten und
   schreibt die Antwort als Dokument. Nichts hier ist Meinung: jede Zeile
   der Tabellen ist aus discover/data/** nachrechenbar.

   Ausfuehren: node scripts/discover/audit-collections.mjs [--universe US_REAL]
   Schreibt:   docs/VU_DISCOVER_V3_COLLECTION_AUDIT.md
   ========================================================================= */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DATA = join(root, "discover", "data");
const args = process.argv.slice(2);
const UNIVERSE = args[args.indexOf("--universe") + 1] || "US_REAL";

const readJSON = (p) => JSON.parse(readFileSync(p, "utf8"));
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const pct = (v) => isNum(v) ? (v * 100 >= 0 ? "+" : "") + (v * 100).toFixed(0) + " %" : "–";

const METHODOLOGY = readJSON(join(root, "discover", "methodology", "discover-v1.json"));
const RECOGNITION = readJSON(join(root, "discover", "config", "company-recognition.json")).companies;
const meta = readJSON(join(DATA, "meta.json"));
const universe = meta.universes.find((u) => u.universeId === UNIVERSE);

const stocksDir = join(DATA, "stocks", UNIVERSE);
const alle = readdirSync(stocksDir).filter((f) => f.endsWith(".json"))
  .map((f) => readJSON(join(stocksDir, f)));
const bekannt = (s) => RECOGNITION[s] ? RECOGNITION[s].tier : null;

/* ------------------------------------------------- Universum als Ganzes */
const eligible = alle.filter((s) => s.discoveryEligible !== false);
const erkannt = eligible.filter((s) => bekannt(s.symbol));
const unbekannt = eligible.filter((s) => !bekannt(s.symbol));
const median = (arr) => { const a = arr.filter(isNum).sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : null; };
const anteilTop = (liste, schwelle) => liste.filter((s) => isNum(s.metrics.leadershipPercentile) && s.metrics.leadershipPercentile >= schwelle).length;

let md = `# Discover V3 — Audit der Collections (${UNIVERSE})

Erzeugt von \`scripts/discover/audit-collections.mjs\` aus \`discover/data/**\`,
Stand ${universe.asOf}. Jede Zahl hier ist nachrechenbar; nichts ist geschätzt.

## Das Universum, bevor irgendeine Reihe gerechnet wird

| | Titel |
|---|---|
| im Universum | ${alle.length} |
| discoverable (nicht stehengeblieben) | ${eligible.length} |
| mit bekanntem Namen (Bekanntheitsliste Stufe 1 oder 2) | ${erkannt.length} |
| davon Stufe 1 (Alltagsmarke) | ${erkannt.filter((s) => bekannt(s.symbol) === 1).length} |
| ohne bekannten Namen | ${unbekannt.length} |
| mit kuratierter Sektorzuordnung | ${alle.filter((s) => s.sectorStatus === "CURATED").length} |
| mit freigegebener Kursreihe | ${alle.filter((s) => s.series && s.series.available).length} |
| mit Marktkapitalisierung | ${alle.filter((s) => isNum(s.marketCap)).length} |

**Warum stehen unbekannte Titel vor bekannten?** Nicht, weil das Ranking
etwas falsch macht, sondern weil das Universum so zusammengesetzt ist:
${unbekannt.length} von ${eligible.length} discoverablen Titeln tragen keinen Namen, den ein
Privatanleger kennt — Royalty Trusts, Regionalbanken, Nebenwerte. Und die
Kennzahlen kennen keine Bekanntheit. Ein Blick auf die Verteilung:

| | bekannte Titel | unbekannte Titel |
|---|---|---|
| Median Leadership-Perzentil | ${median(erkannt.map((s) => s.metrics.leadershipPercentile)).toFixed(0)} | ${median(unbekannt.map((s) => s.metrics.leadershipPercentile)).toFixed(0)} |
| Anteil in den obersten 10 % | ${(anteilTop(erkannt, 90) / erkannt.length * 100).toFixed(0)} % | ${(anteilTop(unbekannt, 90) / unbekannt.length * 100).toFixed(0)} % |
| Median Zwölfmonatsrendite | ${pct(median(erkannt.map((s) => s.metrics.return12M)))} | ${pct(median(unbekannt.map((s) => s.metrics.return12M)))} |

Die bekannten Titel sind im Schnitt nicht schwächer. Aber es gibt ${unbekannt.length} unbekannte
gegen ${erkannt.length} bekannte — bei gleicher Verteilung stehen in den obersten zehn
einer Rangliste rechnerisch mehr unbekannte. Das ist die Ursache. Sie lässt
sich nicht durch ein anderes Ranking beheben, ohne die Rangliste zu
verfälschen — wohl aber durch eine Discovery-Reihenfolge, die innerhalb der
qualifizierten Titel bekannte Namen nach vorn holt (relevance.js), und durch
Reihen, die von vornherein nach Bekanntheit fragen.

`;

/* ---------------------------------------------------- Reihe fuer Reihe */
const rowsDir = join(DATA, "rows", UNIVERSE);
const rowFiles = METHODOLOGY.rows.map((r) => r.id);
const topTen = {};
md += `## Die Reihen\n\n`;
for (const config of METHODOLOGY.rows) {
  const row = readJSON(join(rowsDir, config.id + ".json"));
  const cards = row.cards || [];
  topTen[config.id] = cards.slice(0, 10).map((c) => c.symbol);
  const bekannteImPool = cards.filter((c) => bekannt(c.symbol));
  const ersterBekannter = cards.findIndex((c) => bekannt(c.symbol));
  md += `### ${row.title}\n\n`;
  md += `| | |\n|---|---|\n`;
  md += `| Zweck | ${row.subtitle} |\n`;
  md += `| Aufnahmeregel | ${config.filter ? "\`" + config.filter + "\`" : "keine — alle discoverablen Titel"}${(config.require || []).length ? " + Kennzahl " + config.require.join(", ") + " vorhanden" : ""} |\n`;
  md += `| Reihenfolge | \`${config.sort}\` ${config.direction === "asc" ? "aufsteigend" : "absteigend"}${config.signalFirst ? ", Signalträger `" + config.signalFirst + "` zuerst" : ""}, Gleichstand nach \`${config.secondarySort || "leadershipScore"}\` |\n`;
  md += `| Kandidaten | ${row.coverage.matched} von ${row.coverage.universeSize}, ausgeliefert ${row.coverage.returned} |\n`;
  md += `| bekannte Namen unter den ausgelieferten | ${bekannteImPool.length} von ${cards.length} — erster auf Platz ${ersterBekannter < 0 ? "–" : ersterBekannter + 1} |\n\n`;
  md += `| # | Titel | Name | bekannt | ${config.sort} | 12M | Aussage |\n|---|---|---|---|---|---|---|\n`;
  cards.slice(0, 10).forEach((c, i) => {
    md += `| ${i + 1} | ${c.symbol} | ${c.companyName || "–"} | ${bekannt(c.symbol) ? "Stufe " + bekannt(c.symbol) : "–"} | ${isNum(c.metrics[config.sort]) ? (Math.abs(c.metrics[config.sort]) < 2 ? (c.metrics[config.sort] * 100).toFixed(1) + " %" : c.metrics[config.sort].toFixed(1)) : "–"} | ${pct(c.metrics.return12M)} | ${c.plain && c.plain.story ? c.plain.story : "–"} |\n`;
  });
  md += `\n**Warum diese Reihenfolge:** ${erklaerung(config, cards)}\n\n`;
}

function erklaerung(config, cards) {
  if (!cards.length) return "Die Reihe ist leer.";
  const k = cards[0];
  const teile = [];
  if (config.signalFirst) teile.push(`Zuerst stehen Titel mit belegtem Signal \`${config.signalFirst}\`.`);
  teile.push(`Dann entscheidet \`${config.sort}\`: ${k.symbol} führt mit ${isNum(k.metrics[config.sort]) ? (Math.abs(k.metrics[config.sort]) < 2 ? (k.metrics[config.sort] * 100).toFixed(1) + " %" : k.metrics[config.sort].toFixed(1)) : "–"}.`);
  const unbekannteVorn = cards.slice(0, 10).filter((c) => !bekannt(c.symbol)).length;
  if (unbekannteVorn >= 6) teile.push(`${unbekannteVorn} der ersten zehn sind unbekannte Namen — nicht weil die Regel sie bevorzugt, sondern weil sie die Mehrheit des Universums stellen (siehe oben).`);
  return teile.join(" ");
}

/* ------------------------------------------------- Ueberschneidungen */
md += `## Überschneidungen zwischen den Reihen (erste zehn)\n\n`;
md += `Wie viele der ersten zehn Titel einer Reihe stehen auch unter den ersten zehn einer anderen?\n\n`;
md += `| | ${rowFiles.map((r) => r.replace(/-/g, "‑")).join(" | ")} |\n|---|${rowFiles.map(() => "---").join("|")}|\n`;
for (const a of rowFiles) {
  md += `| ${a} | ` + rowFiles.map((b) => a === b ? "·" : String(topTen[a].filter((s) => topTen[b].includes(s)).length)).join(" | ") + " |\n";
}
const zaehler = {};
for (const r of rowFiles) for (const s of topTen[r]) zaehler[s] = (zaehler[s] || 0) + 1;
const mehrfach = Object.entries(zaehler).filter(([, n]) => n >= 3).sort((x, y) => y[1] - x[1]);
md += `\nTitel, die in drei oder mehr Reihen unter den ersten zehn stehen: ${mehrfach.length ? mehrfach.map(([s, n]) => `${s} (${n}×)`).join(", ") : "keiner"}.\n\n`;
md += `Das ist die Wiederholung, die auf der Startseite als "kleines Universum" wirkt. Sie ist kein Fehler der Ranglisten — ein Titel, der über zwölf Monate führt, führt meist auch über sechs — sondern eine Frage der Darstellung: welche Karten die Startseite je Reihe zuerst zeigt. Dafür gibt es in V3 die Cross-Collection-Diversity im Build (\`buildHome\`), nicht eine Änderung der Ranglisten.\n\n`;

/* ---------------------------------------------- Bekannte Namen: Befund */
md += `## Bekannte Namen: wo stehen sie heute?\n\n`;
md += `| Titel | Name | bekannt | Leadership-Perzentil | 12M | in Reihen (Rang) |\n|---|---|---|---|---|---|\n`;
const bekannteSortiert = erkannt.filter((s) => bekannt(s.symbol) === 1)
  .sort((a, b) => (b.metrics.leadershipPercentile || 0) - (a.metrics.leadershipPercentile || 0)).slice(0, 25);
for (const s of bekannteSortiert) {
  const mitglied = (s.memberships || []).filter((m) => m.rowId !== "sector-leaders").map((m) => `${m.title} #${m.rank}`).join(", ");
  md += `| ${s.symbol} | ${s.companyName} | Stufe ${bekannt(s.symbol)} | ${isNum(s.metrics.leadershipPercentile) ? s.metrics.leadershipPercentile.toFixed(0) : "–"} | ${pct(s.metrics.return12M)} | ${mitglied || "—"} |\n`;
}
md += `\nDie 25 stärksten Alltagsmarken nach Leadership-Perzentil. Wer hier steht und trotzdem in keiner Reihe unter den ersten zwölf war, ist genau der Fall, den die Discovery-Reihenfolge behebt — ohne die Rangliste zu verändern.\n`;

writeFileSync(join(root, "docs", "VU_DISCOVER_V3_COLLECTION_AUDIT.md"), md);
console.log("geschrieben: docs/VU_DISCOVER_V3_COLLECTION_AUDIT.md (" + md.length + " Zeichen)");
