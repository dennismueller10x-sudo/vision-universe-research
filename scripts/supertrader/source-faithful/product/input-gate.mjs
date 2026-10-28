/**
 * Supertrader 8.0 – Eingangsprüfung für einen (noch nicht aktivierten) Tageslauf der Research-Kandidaten.
 *
 * Owner-Entscheidung O-2 (2026-10-26): Ein Tageslauf blockiert, wenn Eingaben fehlen oder veraltet sind. Er
 * liefert dann keinen neuen Stand, statt alte Daten als aktuell auszugeben. Die Prüfung ist rein lesend und
 * kommt ohne Netzzugriff aus.
 *
 *   MISSING  eine Pflichtquelle (SOURCES) fehlt oder ist leer
 *   STALE    der Marktstand der Tagesbalken liegt vor der letzten abgeschlossenen XNYS-Sitzung vor `today`, oder eine
 *            Nebenquelle (Wochenreihen, Kontinuität, SEC-SIC, Namen, Stammdaten) ist älter als ihre Höchstdauer
 *            (AUX_MAX_AGE_DAYS) bzw. trägt kein Erzeugungsdatum (Review SF8-R2 MEDIUM)
 *   CALENDAR `today` liegt außerhalb der Kalenderabdeckung (Feiertage nicht belegt, Sitzungen nicht bestimmbar)
 *   CURRENT  alles vorhanden, Stand = letzte abgeschlossene Sitzung (oder neuer)
 *
 * `today` ist das UTC-Datum des Laufs. Eine Sitzung gilt erst am Folgetag als abgeschlossen, denn die
 * Materialisierung der Tagesbalken entsteht nachts nach Handelsschluss.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, SOURCES } from './eod-adapter.mjs';

export const INPUT_GATE_VERSION = 'sf8-input-gate-1.0.0';
export const GATE_STATUS = Object.freeze({ CURRENT: 'CURRENT', STALE: 'STALE', MISSING: 'MISSING', CALENDAR: 'CALENDAR' });

/** Letzte XNYS-Sitzung strikt vor `today` (höchstens 14 Kalendertage zurück). */
export function lastCompletedSession(calendar, today) {
  let d = calendar.addDays(today, -1);
  for (let k = 0; k < 14; k++, d = calendar.addDays(d, -1)) if (calendar.isSession(d)) return d;
  return null;
}

/**
 * Höchstalter der Nebenquellen in Kalendertagen, gemessen am Erzeugungszeitpunkt (`generatedAt`). Die Taktung folgt
 * den bestehenden Erzeugern: Wochenreihen, Listing-Kontinuität und SEC-SIC entstehen nächtlich bzw. wöchentlich, die
 * Namensliste und der Security Master seltener.
 */
export const AUX_MAX_AGE_DAYS = Object.freeze({ weeklyLong: 10, continuity: 10, sic: 10, names: 45, master: 60 });
const AUX_FILE = Object.freeze({ weeklyLong: 'index.json' });

export function staleAuxiliary(root = ROOT, today) {
  const out = [];
  for (const [key, maxDays] of Object.entries(AUX_MAX_AGE_DAYS)) {
    const p = path.join(root, SOURCES[key], AUX_FILE[key] ?? '');
    let at = null;
    try { at = JSON.parse(fs.readFileSync(p, 'utf8')).generatedAt ?? null; } catch { at = null; }
    const ageDays = at ? (Date.parse(`${today}T00:00:00Z`) - Date.parse(at)) / 864e5 : null;
    if (!Number.isFinite(ageDays) || ageDays > maxDays) out.push({ source: key, generatedAt: at, maxDays });
  }
  return out;
}

export function missingSources(root = ROOT) {
  const out = [];
  for (const [key, rel] of Object.entries(SOURCES)) {
    const p = path.join(root, rel);
    if (!fs.existsSync(p)) { out.push(key); continue; }
    const st = fs.statSync(p);
    if (st.isDirectory() ? fs.readdirSync(p).length === 0 : st.size === 0) out.push(key);
  }
  return out;
}

export function checkInputs({ root = ROOT, today, asOf, calendar }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(today))) throw new Error('INPUT_GATE_TODAY_REQUIRED');
  const missing = missingSources(root);
  if (missing.length) return { version: INPUT_GATE_VERSION, status: GATE_STATUS.MISSING, today, asOf: asOf ?? null, expectedSession: null, missing };
  if (!calendar.inCoverage(today)) return { version: INPUT_GATE_VERSION, status: GATE_STATUS.CALENDAR, today, asOf: asOf ?? null, expectedSession: null, missing: [] };
  const expectedSession = lastCompletedSession(calendar, today);
  const staleSources = staleAuxiliary(root, today);
  if (!asOf || !expectedSession || asOf < expectedSession || staleSources.length) return { version: INPUT_GATE_VERSION, status: GATE_STATUS.STALE, today, asOf: asOf ?? null, expectedSession, missing: [], staleSources };
  return { version: INPUT_GATE_VERSION, status: GATE_STATUS.CURRENT, today, asOf, expectedSession, missing: [], staleSources: [] };
}
