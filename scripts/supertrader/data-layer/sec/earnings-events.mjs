// Generischer VU-Datenlayer (Forschung): Ergebnis-Ereignisse aus SEC-Einreichungen, point-in-time.
//
// Quelle: data.sec.gov/submissions/CIK##########.json (+ aeltere Seiten filings.files), kostenlos, offiziell.
// Ein Ereignis ist eine 8-K mit Item 2.02 ('Results of Operations and Financial Condition', seit 23.08.2004).
// Nicht Minervini-spezifisch: Der Datensatz kann spaeter von Quant/Discover genutzt werden (eigener PR).
//
// Sichtbarkeit (konservativ): bekannt ab dem ersten Handelstag NACH dem Einreichungsdatum. Der Annahmezeitpunkt
// (acceptanceDateTime) wird gespeichert, aber nicht genutzt: er ist bei manchen Emittenten um 4-5 Stunden versetzt
// (Phase-2B-Befund, z. B. AAPL), und ein Ereignis vor Boersenbeginn kostet so hoechstens einen Tag.
// Nicht ableitbar: der NAECHSTE Termin (kuenftige Daten stehen nicht in SEC-Daten).
//
// Ereignis: [filingDate, accession, form, eventType, reportDate, acceptanceDateTime]
export const SCHEMA = 'vu-sec-earnings-events-1.0.0';
export const EV = Object.freeze({ FILED: 0, ACCN: 1, FORM: 2, TYPE: 3, REPORT: 4, ACCEPTED: 5 });
export const EVENT = Object.freeze({ EARNINGS_RELEASE: 'EARNINGS_RELEASE', AMENDMENT: 'EARNINGS_RELEASE_AMENDMENT', PERIODIC_REPORT: 'PERIODIC_REPORT', DUPLICATE: 'EARNINGS_RELEASE_DUPLICATE' });
const PERIODIC = new Set(['10-Q', '10-K', '10-QT', '10-KT', '20-F', '40-F']);
// Gleiche Ergebnismitteilung mehrfach eingereicht (z. B. AAPL 2005-01-11/12): fruehestes Ereignis zaehlt.
// Bekannte Grenze: eine echte Mitteilung binnen 10 Tagen nach einer Vorab-Mitteilung gilt als Duplikat (Datenklempnerei,
// wirkt nur auf Protokolle, nicht auf Regeln).
export const DUPLICATE_WINDOW_DAYS = 10;

const hasItem = (items, code) => String(items || '').split(',').map((s) => s.trim()).includes(code);
const days = (a, b) => (Date.parse(b) - Date.parse(a)) / 864e5;

// pages: Liste von Objekten im Format von filings.recent bzw. der aelteren Seiten (spaltenorientierte Arrays).
export function extractEarningsEvents(pages) {
  const raw = [];
  for (const p of pages || []) {
    const n = Array.isArray(p?.form) ? p.form.length : 0;
    for (let i = 0; i < n; i++) {
      const form = p.form[i];
      const row = [p.filingDate?.[i], p.accessionNumber?.[i], form, null, p.reportDate?.[i] || null, p.acceptanceDateTime?.[i] || null];
      if (!row[EV.FILED] || !row[EV.ACCN]) continue;
      if ((form === '8-K' || form === '8-K/A') && hasItem(p.items?.[i], '2.02')) row[EV.TYPE] = form === '8-K' ? EVENT.EARNINGS_RELEASE : EVENT.AMENDMENT;
      else if (PERIODIC.has(form)) row[EV.TYPE] = EVENT.PERIODIC_REPORT;
      else continue;
      raw.push(row);
    }
  }
  raw.sort((a, b) => a[EV.FILED].localeCompare(b[EV.FILED]) || String(a[EV.ACCN]).localeCompare(String(b[EV.ACCN])));
  // Doppelte Accessions (recent + alte Seite) entfernen; Mehrfacheinreichungen derselben Mitteilung markieren.
  const seen = new Set(), out = [];
  let lastRelease = null;
  for (const r of raw) {
    if (seen.has(r[EV.ACCN])) continue;
    seen.add(r[EV.ACCN]);
    if (r[EV.TYPE] === EVENT.EARNINGS_RELEASE) {
      if (lastRelease && days(lastRelease, r[EV.FILED]) <= DUPLICATE_WINDOW_DAYS) { r[EV.TYPE] = EVENT.DUPLICATE; }
      else lastRelease = r[EV.FILED];
    }
    out.push(r);
  }
  return out;
}

// Point-in-time: nur Ereignisse mit Einreichungsdatum < Handelstag d (bekannt ab dem Folgehandelstag).
export function eventsKnownAt(events, d) { return (events || []).filter((e) => e[EV.FILED] < d); }

// Letzte bekannte Ergebnismitteilung (ohne Aenderungen und Duplikate) und Abstand in Kalendertagen.
export function lastEarningsRelease(events, d) {
  const known = eventsKnownAt(events, d).filter((e) => e[EV.TYPE] === EVENT.EARNINGS_RELEASE);
  if (!known.length) return null;
  const e = known[known.length - 1];
  return { filed: e[EV.FILED], accession: e[EV.ACCN], calendarDaysSince: days(e[EV.FILED], d) };
}
