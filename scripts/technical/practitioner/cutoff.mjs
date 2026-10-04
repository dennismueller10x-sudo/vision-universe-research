/* Practitioner Reference Benchmark — Analyse-Stichtag (Protokoll §5).

   analysisCutoff = letzter VOLLSTAENDIG bekannter Tagesbar zum Veroeffentlichungszeitpunkt:
     • Tagesbar D zaehlt nur, wenn der Schluss von D strikt VOR dem (fruehestmoeglichen) Veroeffentlichungszeitpunkt lag.
       US-Aktien/ETFs 16:00 America/New_York, Xetra 17:30 Europe/Berlin, Krypto: Tagesbar D endet 00:00 UTC von D+1,
       FX/Rohstoffe konservativ 17:00 America/New_York, Tokio 15:30 Asia/Tokyo.
     • Genauigkeit DAY  → fruehestmoeglicher Zeitpunkt = 00:00 des angegebenen Datums in publication.timezone
                          (damit konservativ "letzter Schluss VOR dem Veroeffentlichungsdatum").
       Genauigkeit HOUR → Beginn der angegebenen Stunde.  MINUTE → Zeitstempel (Sekunden verworfen).
     • Feiertage kennt dieser Kalender nicht (nur Wochentage); die Wiedergabe nimmt den letzten TATSAECHLICH vorhandenen Bar
       der VU-Reihe mit Datum <= analysisCutoff (snapToBars). Dadurch kann der Stichtag nie nach der Veroeffentlichung liegen.
     • Wochenbar nur, wenn die Woche abgeschlossen war: lastCompleteWeekEnd().
   Zeitzonen ausschliesslich ueber Intl.DateTimeFormat (keine Abhaengigkeiten). */

export const MARKETS = Object.freeze({
  US_EQUITY: { tz: "America/New_York", closeH: 16, closeM: 0, sessionDays: [1, 2, 3, 4, 5], weekFinalDow: 5, note: "NYSE/Nasdaq Schluss 16:00 New York" },
  XETRA: { tz: "Europe/Berlin", closeH: 17, closeM: 30, sessionDays: [1, 2, 3, 4, 5], weekFinalDow: 5, note: "Xetra Schluss 17:30 Berlin" },
  CRYPTO: { tz: "UTC", closeH: 24, closeM: 0, sessionDays: [0, 1, 2, 3, 4, 5, 6], weekFinalDow: 0, note: "Tagesbar endet 00:00 UTC; Woche Mo–So" },
  US_COMMODITY: { tz: "America/New_York", closeH: 17, closeM: 0, sessionDays: [1, 2, 3, 4, 5], weekFinalDow: 5, note: "FX/Metalle/Energie: konservativ 17:00 New York" },
  JP_EQUITY: { tz: "Asia/Tokyo", closeH: 15, closeM: 30, sessionDays: [1, 2, 3, 4, 5], weekFinalDow: 5, note: "TSE Schluss 15:30 Tokio (vor Nov. 2024 15:00; 15:30 ist konservativ)" }
});

const DAY = 86400000;
const TS_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const fmtCache = new Map();
function fmt(tz) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    fmtCache.set(tz, f);
  }
  return f;
}
export function isValidTimeZone(tz) { try { fmt(tz); return typeof tz === "string" && tz.length > 0; } catch { return false; } }

/** Wandkalender-Teile eines Zeitpunkts in einer IANA-Zone. */
export function zonedParts(ms, tz) {
  const o = {};
  for (const p of fmt(tz).formatToParts(new Date(ms))) if (p.type !== "literal") o[p.type] = +p.value;
  return o;
}
/** Offset (Minuten, lokal − UTC) einer Zone zu einem Zeitpunkt. */
export function tzOffsetMinutes(ms, tz) {
  const p = zonedParts(ms, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60000);
}
/** Lokale Wanduhrzeit (Datum + h:m) in Zone tz → UTC-Millisekunden (DST-fest durch zweifache Korrektur). */
export function zonedToUtc(dateStr, h, m, tz) {
  const [Y, M, D] = dateStr.split("-").map(Number);
  const naive = Date.UTC(Y, M - 1, D, h, m, 0);
  let utc = naive - tzOffsetMinutes(naive, tz) * 60000;
  utc = naive - tzOffsetMinutes(utc, tz) * 60000;
  return utc;
}
export function localDate(ms, tz) {
  const p = zonedParts(ms, tz);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}
export function addDays(dateStr, n) { return new Date(Date.parse(dateStr + "T00:00:00Z") + n * DAY).toISOString().slice(0, 10); }
export function dow(dateStr) { return new Date(dateStr + "T00:00:00Z").getUTCDay(); }

/** Schlusszeitpunkt (UTC ms) des Tagesbars `dateStr` im Markt. */
export function closeInstant(dateStr, marketId) {
  const m = MARKETS[marketId];
  if (!m) throw new Error("unbekannter Markt " + marketId);
  if (m.closeH === 24) return Date.parse(addDays(dateStr, 1) + "T00:00:00Z");
  return zonedToUtc(dateStr, m.closeH, m.closeM, m.tz);
}
export function isSessionDay(dateStr, marketId) { return MARKETS[marketId].sessionDays.includes(dow(dateStr)); }

/**
 * Publikation parsen. Liefert den Zeitpunkt laut Zeitstempel und den fruehestmoeglichen Zeitpunkt gemaess Genauigkeit.
 * Wirft bei fehlendem Offset, unbekannter Zone oder unbekannter Genauigkeit.
 */
export function parsePublication(pub) {
  if (!pub || typeof pub !== "object") throw new Error("publication fehlt");
  const m = TS_RE.exec(String(pub.timestamp || ""));
  if (!m) throw new Error("publication.timestamp ist kein ISO-8601 mit Offset: " + pub.timestamp);
  if (!isValidTimeZone(pub.timezone)) throw new Error("publication.timezone ist keine IANA-Zone: " + pub.timezone);
  const ms = Date.parse(pub.timestamp);
  if (!Number.isFinite(ms)) throw new Error("publication.timestamp nicht lesbar: " + pub.timestamp);
  const prec = pub.timestampPrecision;
  const datePart = `${m[1]}-${m[2]}-${m[3]}`;
  let earliest;
  if (prec === "DAY") earliest = Math.min(ms, zonedToUtc(datePart, 0, 0, pub.timezone));
  else if (prec === "HOUR") earliest = ms - (+m[5]) * 60000 - (+(m[6] || 0)) * 1000;
  else if (prec === "MINUTE") earliest = ms - (+(m[6] || 0)) * 1000;
  else throw new Error("publication.timestampPrecision unbekannt: " + prec);
  const off = m[7] === "Z" ? 0 : (m[7][0] === "-" ? -1 : 1) * (+m[7].slice(1, 3) * 60 + +m[7].slice(4, 6));
  return { instantMs: ms, earliestMs: earliest, statedOffsetMinutes: off, zoneOffsetMinutes: tzOffsetMinutes(ms, pub.timezone), datePart, precision: prec };
}

/** Offset im Zeitstempel passt nicht zur IANA-Zone (z. B. +01:00 in Berlin im Sommer) → Hinweis, kein stilles Korrigieren. */
export function timestampConsistency(pub) {
  const p = parsePublication(pub);
  return p.statedOffsetMinutes === p.zoneOffsetMinutes ? null
    : `Offset ${p.statedOffsetMinutes} min im Zeitstempel passt nicht zu ${pub.timezone} (${p.zoneOffsetMinutes} min zu diesem Zeitpunkt)`;
}

/**
 * Stichtag berechnen. Nie von Hand setzen (Protokoll §5).
 * @returns {{analysisCutoff:string, closeInstantUtc:string, effectivePublicationUtc:string, market:string, rule:string}}
 */
export function computeAnalysisCutoff(publication, marketId) {
  if (!MARKETS[marketId]) throw new Error("unbekannter Markt " + marketId);
  const p = parsePublication(publication);
  const eff = p.earliestMs;
  let d = addDays(localDate(eff, MARKETS[marketId].tz), 1);
  for (let k = 0; k < 20; k++, d = addDays(d, -1)) {
    if (!isSessionDay(d, marketId)) continue;
    const ci = closeInstant(d, marketId);
    if (ci < eff) {
      return { analysisCutoff: d, closeInstantUtc: new Date(ci).toISOString(), effectivePublicationUtc: new Date(eff).toISOString(), market: marketId,
               rule: `${p.precision}: letzter Schluss strikt vor ${new Date(eff).toISOString()} (${MARKETS[marketId].note})` };
    }
  }
  throw new Error("kein Stichtag gefunden");
}

/** Ende (Datum der letzten Sitzung) der letzten zum Stichtag ABGESCHLOSSENEN Woche (Mo–So-Woche). */
export function lastCompleteWeekEnd(cutoffDate, marketId) {
  const m = MARKETS[marketId];
  const wd = dow(cutoffDate);                    // 0 = So
  const monday = addDays(cutoffDate, -((wd + 6) % 7));
  const finalOffset = (m.weekFinalDow + 6) % 7;  // Fr → 4, So → 6 Tage nach Montag
  const final = addDays(monday, finalOffset);
  return cutoffDate >= final ? final : addDays(final, -7);
}
/** ISO-Wochenschluessel (Montag) eines Datums. */
export function weekKey(dateStr) { return addDays(dateStr, -((dow(dateStr) + 6) % 7)); }

/** Letzter tatsaechlich vorhandener Bar mit Datum <= date (Feiertage/Wochenenden ergeben sich aus der Reihe). */
export function snapToBars(sortedDates, date) {
  let lo = 0, hi = sortedDates.length - 1, ans = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (sortedDates[mid] <= date) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
  return ans < 0 ? null : { index: ans, date: sortedDates[ans] };
}

/** Handelstage zwischen zwei Daten (exklusive Start, inklusive Ende; Vorzeichen nach Reihenfolge), nur Wochentagskalender. */
export function sessionDaysBetween(a, b, marketId) {
  if (a === b) return 0;
  const sgn = a < b ? 1 : -1, [x, y] = a < b ? [a, b] : [b, a];
  let n = 0;
  for (let d = addDays(x, 1); d <= y; d = addDays(d, 1)) if (isSessionDay(d, marketId)) n++;
  return sgn * n;
}

export function isIsoDate(s) { return typeof s === "string" && DATE_RE.test(s) && new Date(s + "T00:00:00Z").toISOString().slice(0, 10) === s; }
