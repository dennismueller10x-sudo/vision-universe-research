/**
 * Fama-French-49-Branchen aus SIC-Codes (FP-ST-03). Reine Funktionen, kein Netz.
 *
 * Quelle der Zuordnung: Kenneth R. French Data Library, `Siccodes49.zip` -> `Siccodes49.txt` (Stand der Datei
 * 08.01.2020). Die Tabelle `ff49-siccodes.json` ist aus genau dieser Datei erzeugt und mit ihrem SHA-256 gepinnt:
 *   node scripts/supertrader/source-faithful/groups/ff49.mjs --from <Siccodes49.txt> --out <ff49-siccodes.json>
 *
 * Was die Tabelle NICHT entscheidet: Ein SIC-Code, der in keinem Bereich der 49 Branchen steht, ist UNMAPPED. Er
 * wird nicht still der Branche 49 (Other) zugeschlagen; was ein Aufrufer damit tut, ist seine deklarierte Annahme.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const FF49_SCHEMA = 'supertrader-ff49-siccodes/1.0.0';
export const FF49_SOURCE = Object.freeze({
  url: 'https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/Siccodes49.zip',
  member: 'Siccodes49.txt',
  library: 'Kenneth R. French Data Library, 49 Industry Portfolios (SIC-Definitionen)',
});
export const FF49_STATUS = Object.freeze({ MAPPED: 'MAPPED', UNMAPPED: 'UNMAPPED', NO_SIC: 'NO_SIC' });

/** Siccodes49.txt -> { industries: [{ id, short, name, ranges: [[lo, hi, label]] }] }. Wirft bei Ueberlappung. */
export function parseSiccodes49(text) {
  const industries = [];
  let cur = null;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) continue;
    const range = /^\s+(\d{4})-(\d{4})\s*(.*)$/.exec(line);
    if (range && cur) { cur.ranges.push([range[1], range[2], range[3].trim()]); continue; }
    const head = /^\s?(\d{1,2})\s+(\S+)\s+(.+)$/.exec(line);
    if (head) {
      cur = { id: Number(head[1]), short: head[2], name: head[3].trim(), ranges: [] };
      industries.push(cur);
      continue;
    }
    throw new Error('FF49_UNPARSEABLE_LINE: ' + JSON.stringify(raw));
  }
  // Die Datei fuehrt "49 Other" zweimal (zwei Bloecke derselben Branche): zusammenfuehren.
  const byId = new Map();
  for (const ind of industries) {
    const prev = byId.get(ind.id);
    if (prev) {
      if (prev.short !== ind.short) throw new Error('FF49_ID_REUSED: ' + ind.id);
      prev.ranges.push(...ind.ranges);
    } else byId.set(ind.id, ind);
  }
  const merged = [...byId.values()].sort((a, b) => a.id - b.id);
  if (merged.length !== 49 || merged.some((x, i) => x.id !== i + 1)) throw new Error('FF49_EXPECTED_49_INDUSTRIES: ' + merged.length);
  const all = merged.flatMap((x) => x.ranges.map((r) => ({ id: x.id, lo: +r[0], hi: +r[1] }))).sort((a, b) => a.lo - b.lo || a.hi - b.hi);
  for (let i = 0; i < all.length; i++) {
    if (all[i].lo > all[i].hi) throw new Error(`FF49_EMPTY_RANGE: ${all[i].lo}-${all[i].hi}`);
    if (i && all[i].lo <= all[i - 1].hi) throw new Error(`FF49_OVERLAP: ${all[i - 1].lo}-${all[i - 1].hi} (${all[i - 1].id}) / ${all[i].lo}-${all[i].hi} (${all[i].id})`);
  }
  return { industries: merged };
}

/** Tabelle -> Suche (sortierte, ueberlappungsfreie Bereiche, binaere Suche). */
export function createFf49(table) {
  if (!table || table.schema !== FF49_SCHEMA) throw new Error('FF49_SCHEMA_MISMATCH');
  const meta = new Map(table.industries.map((x) => [x.id, Object.freeze({ id: x.id, short: x.short, name: x.name })]));
  const ranges = table.industries.flatMap((x) => x.ranges.map((r) => [+r[0], +r[1], x.id])).sort((a, b) => a[0] - b[0]);
  function of(sic) {
    if (sic == null || !/^\d{4}$/.test(String(sic))) return { status: FF49_STATUS.NO_SIC, industry: null };
    const s = +sic;
    let lo = 0, hi = ranges.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1, r = ranges[mid];
      if (s < r[0]) hi = mid - 1; else if (s > r[1]) lo = mid + 1; else return { status: FF49_STATUS.MAPPED, industry: meta.get(r[2]) };
    }
    return { status: FF49_STATUS.UNMAPPED, industry: null };
  }
  return { of, industries: [...meta.values()], sourceSha256: table.source?.sha256 ?? null };
}

const TABLE_URL = new URL('./ff49-siccodes.json', import.meta.url);
let cached = null;
/** Die gepinnte Tabelle aus dem Repository. */
export function loadFf49() {
  cached ||= createFf49(JSON.parse(readFileSync(TABLE_URL, 'utf8')));
  return cached;
}

/** Quelldatei (Bytes) -> Tabelle mit Pin. */
export function buildFf49Table(bytes) {
  const parsed = parseSiccodes49(Buffer.from(bytes).toString('latin1'));
  return {
    schema: FF49_SCHEMA,
    source: { ...FF49_SOURCE, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length },
    unmappedPolicy: 'UNMAPPED_IS_NOT_OTHER',
    industries: parsed.industries,
  };
}

// CLI: Tabelle aus der Quelldatei erzeugen (einmalig; das Ergebnis ist eingecheckt und gepinnt).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
  const from = arg('--from'), out = arg('--out');
  if (!from || !out) { console.error('Aufruf: ff49.mjs --from <Siccodes49.txt> --out <datei.json>'); process.exit(2); }
  const table = buildFf49Table(readFileSync(from));
  writeFileSync(out, JSON.stringify(table, null, 1) + '\n');
  console.log(`FF49: ${table.industries.length} Branchen, ${table.industries.reduce((n, x) => n + x.ranges.length, 0)} Bereiche, sha256 ${table.source.sha256} -> ${out}`);
}
