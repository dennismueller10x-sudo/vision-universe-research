// Supertrader — einheitlicher Signal-Lifecycle fuer alle Strategien.
//
// DISCOVERED -> WATCH -> SETUP -> ENTRY_READY -> TRIGGERED -> ACTIVE
//   -> WARNING -> EXIT -> CLOSED, sowie INVALIDATED vor dem Einstieg.
//
// DISCOVERED und WATCH sind Momentaufnahmen des Scanners (jeden Tag neu).
// Ab SETUP wird ein Signal dauerhaft protokolliert: jeder weitere
// Zustandswechsel ist ein Eintrag mit Regel-ID, Datum und Preis. Geloescht
// wird nichts - auch keine Verlierer.

export const STATES = ['DISCOVERED', 'WATCH', 'SETUP', 'ENTRY_READY', 'TRIGGERED', 'ACTIVE', 'WARNING', 'EXIT', 'CLOSED', 'INVALIDATED'];
export const SCANNER_STATES = ['DISCOVERED', 'WATCH', 'SETUP', 'ENTRY_READY'];
export const PERSISTED_FROM = 'SETUP';
export const TERMINAL = new Set(['CLOSED', 'INVALIDATED']);
export const PENDING = new Set(['SETUP', 'ENTRY_READY']);
export const OPEN_POSITION = new Set(['TRIGGERED', 'ACTIVE', 'WARNING', 'EXIT']);

// Erlaubte Uebergaenge. Alles andere ist ein Engine-Fehler, kein Datenfall.
export const TRANSITIONS = {
  SETUP: ['ENTRY_READY', 'TRIGGERED', 'INVALIDATED'],
  ENTRY_READY: ['SETUP', 'TRIGGERED', 'INVALIDATED'],
  TRIGGERED: ['ACTIVE', 'WARNING', 'EXIT', 'CLOSED'],
  ACTIVE: ['WARNING', 'EXIT', 'CLOSED'],
  WARNING: ['ACTIVE', 'EXIT', 'CLOSED'],
  EXIT: ['CLOSED'],
  CLOSED: [],
  INVALIDATED: [],
};

export function assertTransition(from, to) {
  if (from === null) {
    if (to !== 'SETUP' && to !== 'ENTRY_READY') throw new Error(`Signal darf nicht mit ${to} beginnen`);
    return;
  }
  if (!(TRANSITIONS[from] || []).includes(to)) throw new Error(`Unzulaessiger Uebergang ${from} -> ${to}`);
}

export const STATE_LABELS = {
  DISCOVERED: 'Entdeckt', WATCH: 'Beobachten', SETUP: 'Setup', ENTRY_READY: 'Einstieg bereit',
  TRIGGERED: 'Ausgelöst', ACTIVE: 'Aktiv', WARNING: 'Warnung', EXIT: 'Ausstieg', CLOSED: 'Abgeschlossen',
  INVALIDATED: 'Ungültig',
};
