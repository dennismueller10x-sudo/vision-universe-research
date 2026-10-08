// Generischer VU-Datenlayer (Forschung): SEC-Branchenschluessel (SIC) point-in-time.
//
// Die SIC in data.sec.gov/submissions ist nur der HEUTIGE Wert (Rueckschaufehler, z. B. Fiserv 7374 -> 7389).
// Der Kopf jeder Einreichung (<accession>.hdr.sgml, Feld ASSIGNED-SIC bzw. 'STANDARD INDUSTRIAL CLASSIFICATION')
// friert die SIC zum Einreichungszeitpunkt ein. Historie je CIK: [[filingDate, accession, sic]].
// SIC(cik, d) = SIC der juengsten Einreichung mit filingDate < d. Vor der ersten bekannten Einreichung: unbekannt
// (kein Rueckfuellen = kein Zukunftswissen). Umklassifizierungen ohne Einreichung werden erst mit der naechsten sichtbar.
export const SCHEMA = 'vu-sec-industry-sic-1.0.0';
// 6770 Blank Checks (SPAC/Mantel); 6799 'Investors, NEC' ist breiter als Mantelgesellschaften, wird aber wie in
// der Phase-2B-Gruppenanalyse (Worker D) ausgeschlossen, weil dort ueberwiegend Vehikel ohne operatives Geschaeft liegen.
export const SPAC_SHELL_SIC = Object.freeze(['6770', '6799']);

// Kombinierte Einreichungen (z. B. Versorger-Mutter + Toechter) fuehren mehrere FILER-Bloecke: es zaehlt der Block
// mit der CIK des Emittenten. Ohne FILER-Bloecke (aeltere Koepfe) der erste Wert. SIC 0000 = unbekannt.
export function parseHeaderSic(text, cik) {
  const s = String(text || '');
  const one = (t) => {
    let m = t.match(/<ASSIGNED-SIC>\s*(\d{3,4})/i);
    if (!m) m = t.match(/STANDARD INDUSTRIAL CLASSIFICATION:[^\[\n]*\[(\d{3,4})\]/i);
    if (!m) return null;
    const v = m[1].padStart(4, '0');
    return v === '0000' ? null : v;
  };
  const blocks = s.split(/<FILER>|FILER:\s*\n/i).slice(1);
  if (blocks.length > 1 && cik !== undefined && cik !== null) {
    const want = Number(cik);
    const own = blocks.find((b) => { const m = b.match(/<CIK>\s*(\d+)|CENTRAL INDEX KEY:\s*(\d+)/i); return m && Number(m[1] || m[2]) === want; });
    return own ? one(own) : null;
  }
  return one(s);
}

export function sicAt(history, d) {
  let best = null;
  for (const h of history || []) if (h[0] < d && (!best || h[0] >= best[0])) best = h;
  return best ? best[2] : null;
}

// Gruppenschluessel: 2 = Hauptgruppe, 3 = Industriegruppe, 4 = Industrie.
export function industryGroup(sic, level) {
  if (!sic || !/^\d{4}$/.test(sic) || sic === '0000') return null;
  if (![2, 3, 4].includes(level)) throw new Error('industryGroup: level 2|3|4');
  return sic.slice(0, level);
}

// VU-FORMALISIERUNG (keine Minervini-Regel, kein IBD-Gruppenrang): Gruppenstaerke = Median der RS-Perzentile
// der Mitglieder am Tag d, ohne den Titel selbst (leave-one-out). members: [{id, sic, rsPct}].
// opts = {level, fallbackLevel, minMembers} - alle ausdruecklich anzugeben (keine Defaults).
export function groupStrength(members, selfId, selfSic, opts) {
  const { level, fallbackLevel, minMembers } = opts || {};
  if (!level || !fallbackLevel || !minMembers) throw new Error('groupStrength: level, fallbackLevel, minMembers angeben');
  if (!selfSic || SPAC_SHELL_SIC.includes(selfSic)) return null;
  for (const lv of [level, fallbackLevel]) {
    const g = industryGroup(selfSic, lv);
    const vals = members.filter((m) => m.id !== selfId && m.sic && !SPAC_SHELL_SIC.includes(m.sic) && industryGroup(m.sic, lv) === g && Number.isFinite(m.rsPct)).map((m) => m.rsPct).sort((a, b) => a - b);
    if (vals.length >= minMembers) {
      const k = vals.length, med = k % 2 ? vals[(k - 1) / 2] : (vals[k / 2 - 1] + vals[k / 2]) / 2;
      return { level: lv, group: g, members: k, medianRs: med };
    }
  }
  return null;
}

// Kandidaten fuer das Kopflesen: alle periodischen Originaleinreichungen (10-K/10-Q, bis 2008 auch 10-KSB/10-QSB,
// 20-F/40-F; ohne /A) ab fromYear,
// aufsteigend nach Datum, ohne doppelte Accessions.
export function periodicFilings(pages, fromYear) {
  const seen = new Set(), out = [];
  for (const p of pages || []) {
    const n = Array.isArray(p?.form) ? p.form.length : 0;
    for (let i = 0; i < n; i++) {
      const f = p.form[i], d = p.filingDate?.[i], a = p.accessionNumber?.[i];
      if (!d || !a || !/^(10-K|10-Q|10-KSB|10-QSB|20-F|40-F)$/.test(f) || seen.has(a) || Number(d.slice(0, 4)) < fromYear) continue;
      seen.add(a);
      out.push({ filingDate: d, accession: a, form: f });
    }
  }
  return out.sort((x, y) => x.filingDate.localeCompare(y.filingDate) || x.accession.localeCompare(y.accession));
}

// SIC-Historie per Bisektion: liest den Kopf der ersten und letzten Einreichung; sind beide gleich, gilt die SIC
// dazwischen als unveraendert (dokumentierte Annahme: ein Wechsel A -> B -> A ohne Zwischenstand bleibt unentdeckt).
// Sonst wird halbiert, bis jeder Wechsel auf zwei benachbarte Einreichungen eingegrenzt ist. Ergebnis:
// [[filingDate, accession, sic]] nur fuer gelesene Koepfe; der Wechsel gilt ab der ersten Einreichung mit neuer SIC.
// readSic(filing) -> Promise<sic|null>; null-Koepfe werden uebersprungen (Nachbar wird gelesen).
export async function sicHistoryByBisection(filings, readSic) {
  const got = new Map();
  const read = async (i) => { if (!got.has(i)) got.set(i, await readSic(filings[i])); return got.get(i); };
  // erstes/letztes lesbares Element suchen
  let lo = 0, hi = filings.length - 1;
  while (lo <= hi && !(await read(lo))) lo++;
  while (hi > lo && !(await read(hi))) hi--;
  if (lo > hi) return [];
  const stack = [[lo, hi]];
  while (stack.length) {
    const [a, b] = stack.pop();
    if (b - a <= 1 || got.get(a) === got.get(b)) continue;
    let m = Math.floor((a + b) / 2), sm = await read(m);
    // unlesbare Mitte: naechstes lesbares Element zwischen a und b
    while (!sm && m < b - 1) { m++; sm = await read(m); }
    if (!sm) continue;
    stack.push([a, m], [m, b]);
  }
  return [...got.entries()].filter(([, sic]) => sic).sort((x, y) => x[0] - y[0]).map(([i, sic]) => [filings[i].filingDate, filings[i].accession, sic]);
}
