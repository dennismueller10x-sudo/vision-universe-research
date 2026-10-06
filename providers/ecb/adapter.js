/* =========================================================================
   VISION UNIVERSE — providers/ecb/adapter.js   (Currency Layer, O-7)

   DIE EUROPAEISCHE ZENTRALBANK ALS HISTORISCHER FALLBACK.

   Der Owner-Entscheid O-7 hat die Bedingung erfuellt, die §6 und §38 an
   eine zweite Quelle stellen: die benoetigte Faehigkeit fehlt bei Tiingo
   objektiv. Gemessen ist sie fehlend, nicht vermutet - die FX-Historie
   des Anbieters beginnt am 2020-02-29, und Vision Universe braucht
   EUR-Darstellung fuer 10J, MAX und Fundamentals davor.

   DIE ROLLE IST FALLBACK, NICHT ZWEITE WAHRHEIT

   Die EZB fuellt ausschliesslich die Luecke VOR dem Beginn der
   Anbieterhistorie. Wo Tiingo liefert, gewinnt Tiingo - nicht weil seine
   Zahl besser waere, sondern weil eine Reihe, in der je Tag zwischen zwei
   Quellen entschieden wird, nicht reproduzierbar ist. Die Prioritaet
   steht in quant/config/fx-license.json und wird von fx-rates.js
   durchgesetzt.

   WAS DIE EZB IST - UND WAS SIE NICHT IST

   Sie veroeffentlicht EINEN Referenzkurs je Waehrung und Handelstag,
   ueblicherweise gegen 16:00 MEZ erhoben. Das ist kein Schlusskurs eines
   Handelsplatzes und kein Mittelkurs des Tages; es ist ein Fixing.

   Fuer historische Umrechnung ist das genau das Richtige: ein
   reproduzierbarer, von einer oeffentlichen Stelle veroeffentlichter
   Stand, der sich nicht nachtraeglich aendert. Fuer Intraday oder
   Realtime ist es ungeeignet, und die EZB gibt auch nichts her - deshalb
   traegt sie in der Faehigkeitsmatrix fxIntraday und fxRealtime auf
   false und nicht auf null. Hier ist "nicht vorhanden" gemessen, nicht
   ungeprueft: die Quelle veroeffentlicht es schlicht nicht.

   ALLE KURSE SIND EUR-BASIERT

   Die Reihe notiert je Waehrung, wie viele Einheiten davon ein Euro
   kostet: EUR/USD = 1,1726 heisst, ein Euro kostet 1,1726 Dollar. Ein
   Kreuzkurs zwischen zwei Fremdwaehrungen entsteht daraus durch
   Triangulation ueber EUR - und weil beide Beine aus demselben Fixing
   desselben Tages stammen, ist dieses Kreuz sauberer als eines aus zwei
   verschiedenen Quellen.

   LIZENZ

   Die EZB gestattet die Wiedergabe ihrer Referenzkurse unter Nennung der
   Quelle. Die Nennung erfolgt (attributionText in fx-license.json).
   Deshalb - und nur deshalb - duerfen aus EZB-Kursen abgeleitete
   EUR-Werte oeffentlich angezeigt werden, waehrend Tiingo-basierte es bis
   zur Klaerung der Vertragsfrage nicht duerfen.
   ========================================================================= */
"use strict";

const PROVIDER_ID = "ecb";
const DATA_SOURCE_ID = "ds_ecb_eurofxref";

/* Die drei veroeffentlichten Dateien. Der Adapter waehlt nach Bedarf:
   der Vollbestand ist gross, und wer nur den letzten Stand braucht,
   soll ihn nicht herunterladen. */
const FEEDS = {
  DAILY: {
    id: "DAILY",
    url: "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml",
    label: "Referenzkurse des letzten Handelstages",
    approxBytes: 4_000
  },
  NINETY_DAYS: {
    id: "NINETY_DAYS",
    url: "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml",
    label: "Referenzkurse der letzten 90 Tage",
    approxBytes: 120_000
  },
  FULL_HISTORY: {
    id: "FULL_HISTORY",
    url: "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist.xml",
    label: "Vollstaendige Historie ab 1999-01-04",
    approxBytes: 12_000_000
  }
};

/**
 * Parst den SDMX-XML-Bestand der EZB.
 *
 * Bewusst ohne XML-Bibliothek: die Struktur ist flach und stabil seit
 * Jahren, und eine Abhaengigkeit fuer zwei verschachtelte Elemente waere
 * teurer als dreissig Zeilen. Der Parser ist streng - was nicht passt,
 * wird gezaehlt und verworfen, nicht geraten.
 *
 * Form:
 *   <Cube time='2026-09-22'>
 *     <Cube currency='USD' rate='1.1726'/>
 *     ...
 *   </Cube>
 */
function parseEurofxref(xml) {
  if (typeof xml !== "string" || !xml.length) {
    return { days: [], rejected: 0, reason: "emptyDocument" };
  }
  const days = [];
  let rejected = 0;

  /* Jeder Tagesblock beginnt mit einem Cube, der ein time-Attribut
     traegt, und endet vor dem naechsten. */
  const dayPattern = /<Cube\s+time=['"](\d{4}-\d{2}-\d{2})['"]\s*>([\s\S]*?)<\/Cube>/g;
  let match;
  while ((match = dayPattern.exec(xml)) !== null) {
    const date = match[1];
    const body = match[2];
    const rates = {};
    const ratePattern = /<Cube\s+currency=['"]([A-Z]{3})['"]\s+rate=['"]([\d.]+)['"]\s*\/?>/g;
    let r;
    while ((r = ratePattern.exec(body)) !== null) {
      const value = Number(r[2]);
      if (!Number.isFinite(value) || value <= 0) { rejected++; continue; }
      rates[r[1]] = value;
    }
    if (Object.keys(rates).length) days.push({ date, rates });
    else rejected++;
  }

  /* Die EZB liefert neueste zuerst. Der Store erwartet nichts
     Bestimmtes, aber ein aufsteigender Bestand ist leichter zu pruefen. */
  days.sort((a, b) => a.date.localeCompare(b.date));
  return { days, rejected, reason: days.length ? null : "noCubeElements" };
}

/**
 * Formt die Tagesbloecke in Paarreihen um.
 *
 * Aus n Tagen mit je m Waehrungen werden m Reihen der Form EUR/<code>.
 * Genau so, wie die EZB notiert - nicht invertiert. Die Gegenrichtung
 * bildet fx-rates.js durch Inversion, und beim Ingest zu invertieren
 * hiesse, eine gerundete Zahl zu speichern und das Original zu verlieren.
 */
function toPairSeries(days) {
  const byCurrency = new Map();
  for (const day of days) {
    for (const [code, rate] of Object.entries(day.rates)) {
      if (!byCurrency.has(code)) byCurrency.set(code, []);
      byCurrency.get(code).push([day.date, rate]);
    }
  }
  return [...byCurrency.entries()]
    .map(([quote, points]) => ({
      base: "EUR", quote, points,
      first: points[0] ? points[0][0] : null,
      last: points.length ? points[points.length - 1][0] : null,
      observations: points.length
    }))
    .sort((a, b) => a.quote.localeCompare(b.quote));
}

/**
 * Die Faehigkeiten dieser Quelle.
 *
 * Anders als bei Tiingo stehen hier ausdrueckliche false-Werte und keine
 * null: dass die EZB kein Intraday und kein Realtime veroeffentlicht, ist
 * keine ungepruefte Annahme, sondern die Eigenschaft einer taeglich
 * publizierten Statistik.
 */
const CAPABILITIES = {
  fxCurrent: true,
  fxDaily: true,
  fxHistoricalDaily: true,
  fxIntraday: false,
  fxRealtime: false,
  fxWebsocket: false,
  fxCrossPairs: false,      // alles notiert gegen EUR; Kreuze entstehen durch Triangulation
  fxBulkQuotes: true        // eine Anfrage liefert alle Waehrungen eines Tages
};

const EARLIEST_PUBLISHED = "1999-01-04";

/* ---------------------------------------------------------------------
   LEITZINSEN (Multi-Asset Core)

   Dieselbe Institution, dieselbe Lizenzgrundlage, ein anderer Datensatz:
   das ECB Data Portal fuehrt die Zinssaetze des Eurosystems als Reihe
   FM (Financial Markets). Gemessen (multi-asset-probe.json): die taegliche
   Reihe der Einlagefazilitaet (FM/D.U2.EUR.4F.KR.DFR.LEV) reicht bis
   1999-01-01 zurueck und aendert ihren Wert 63-mal - eine Stufenserie.

   Gespeichert werden nur die Stufen (Tag des Inkrafttretens, Satz) und
   der Tag der letzten Beobachtung. Zwischen zwei Stufen gilt der Satz
   weiter; das ist die Natur der Reihe, keine Fortschreibung.
   --------------------------------------------------------------------- */
const KEY_RATES = {
  ECB_DFR: "FM/D.U2.EUR.4F.KR.DFR.LEV"
};

function keyRateUrl(key) {
  return "https://data-api.ecb.europa.eu/service/data/" + key + "?format=csvdata";
}

/* csvdata traegt Titelspalten in Anfuehrungszeichen, die selbst Kommas
   enthalten koennen. Ein naives split(",") verschiebt dann die Spalten. */
function splitCsvLine(line) {
  const out = [];
  let cur = "", quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

/** csvdata -> {steps: [[effectiveDate, percent]], observedThrough} */
function parseKeyRateCsv(text) {
  const lines = String(text || "").split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { steps: [], observedThrough: null };
  const header = splitCsvLine(lines[0]);
  const iT = header.indexOf("TIME_PERIOD"), iV = header.indexOf("OBS_VALUE");
  if (iT === -1 || iV === -1) return { steps: [], observedThrough: null };
  const rows = [];
  for (const line of lines.slice(1)) {
    const c = splitCsvLine(line);
    const v = parseFloat(c[iV]);
    if (/^\d{4}-\d{2}-\d{2}$/.test(c[iT]) && isFinite(v)) rows.push([c[iT], v]);
  }
  rows.sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const steps = [];
  for (const r of rows) if (!steps.length || steps[steps.length - 1][1] !== r[1]) steps.push(r);
  return { steps, observedThrough: rows.length ? rows[rows.length - 1][0] : null };
}

module.exports = {
  PROVIDER_ID, DATA_SOURCE_ID, FEEDS, CAPABILITIES, EARLIEST_PUBLISHED,
  parseEurofxref, toPairSeries,
  KEY_RATES, keyRateUrl, parseKeyRateCsv, splitCsvLine
};
