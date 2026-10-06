// Supertrader — einheitlicher Signal-Lifecycle fuer alle Strategien.
//
// Interne Zustaende (im Ledger gespeichert, stabil):
//   DISCOVERED, WATCH          -> Phase KANDIDAT (nur Momentaufnahme)
//   SETUP, ENTRY_READY         -> Phase EINSTIEG VORBEREITET (Trigger + Invalidation bekannt)
//   TRIGGERED                  -> Phase EINSTIEG BESTAETIGT (Trigger per Schluss bestaetigt,
//                                 Modelleinstieg steht zur naechsten Eroeffnung aus)
//   ACTIVE                     -> Phase MODELLPOSITION AKTIV (Einstieg erfasst - keine reale Order)
//   WARNING                    -> Phase WARNUNG
//   EXIT                       -> Phase AUSSTIEG AUSGELOEST (Ausfuehrung steht aus)
//   CLOSED                     -> Phase GESCHLOSSEN
//   INVALIDATED                -> Phase UNGUELTIG (vor dem Modelleinstieg)
//
// Ab SETUP wird ein Signal dauerhaft protokolliert: jeder Zustandswechsel ist
// ein Eintrag mit Regel-ID, Datenstand, Regelversion und Preis. Geloescht wird
// nichts - auch keine Verlierer und keine ungueltigen Setups.

export const STATES = ['DISCOVERED', 'WATCH', 'SETUP', 'ENTRY_READY', 'TRIGGERED', 'ACTIVE', 'WARNING', 'EXIT', 'CLOSED', 'INVALIDATED'];
export const SCANNER_STATES = ['DISCOVERED', 'WATCH', 'SETUP', 'ENTRY_READY'];
export const PERSISTED_FROM = 'SETUP';
export const TERMINAL = new Set(['CLOSED', 'INVALIDATED']);
export const PENDING = new Set(['SETUP', 'ENTRY_READY']);
export const OPEN_POSITION = new Set(['ACTIVE', 'WARNING', 'EXIT']);

// Erlaubte Uebergaenge. Alles andere ist ein Engine-Fehler, kein Datenfall.
export const TRANSITIONS = {
  SETUP: ['ENTRY_READY', 'TRIGGERED', 'INVALIDATED'],
  ENTRY_READY: ['SETUP', 'TRIGGERED', 'INVALIDATED'],
  // Nach der Bestaetigung: Modelleinstieg zur Eroeffnung (ACTIVE) - oder kein
  // Einstieg, weil die Eroeffnung die Gap-Politik oder den Stop verletzt.
  TRIGGERED: ['ACTIVE', 'INVALIDATED'],
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

// Nutzerphasen: strikt getrennt, damit "nahe am Trigger" nie wie ein
// bestaetigter Einstieg aussieht.
export const PHASES = {
  CANDIDATE: { label: 'Kandidat', states: ['DISCOVERED', 'WATCH'], plain: 'Bedingungen für ein mögliches Setup werden beobachtet. Noch kein Setup.' },
  PREPARED: { label: 'Einstieg vorbereitet', states: ['SETUP', 'ENTRY_READY'], plain: 'Gültiges Setup mit bekanntem Trigger und bekannter Invalidation. Noch kein Einstieg.' },
  CONFIRMED: { label: 'Einstieg bestätigt', states: ['TRIGGERED'], plain: 'Der Trigger ist nach der Daten- und Zeitregel eingetreten. Der Modelleinstieg folgt zur nächsten Eröffnung.' },
  POSITION: { label: 'Modellposition aktiv', states: ['ACTIVE'], plain: 'Ein Einstieg wurde nach der Simulationsregel erfasst. Das ist keine reale Order.' },
  WARNING: { label: 'Warnung', states: ['WARNING'], plain: 'Die Modellposition läuft, eine Warnregel ist ausgelöst.' },
  EXIT: { label: 'Ausstieg ausgelöst', states: ['EXIT'], plain: 'Eine Ausstiegsregel hat ausgelöst. Die Modellausführung folgt zur nächsten Eröffnung.' },
  CLOSED: { label: 'Geschlossen', states: ['CLOSED'], plain: 'Die Modellposition ist vollständig geschlossen.' },
  INVALIDATED: { label: 'Ungültig', states: ['INVALIDATED'], plain: 'Das Setup wurde vor einem Modelleinstieg ungültig.' },
};
export function phaseOf(state) {
  for (const [k, v] of Object.entries(PHASES)) if (v.states.includes(state)) return k;
  return null;
}

export const STATE_LABELS = {
  DISCOVERED: 'Kandidat', WATCH: 'Kandidat', SETUP: 'Einstieg vorbereitet', ENTRY_READY: 'Einstieg vorbereitet · nahe Trigger',
  TRIGGERED: 'Einstieg bestätigt', ACTIVE: 'Modellposition aktiv', WARNING: 'Warnung', EXIT: 'Ausstieg ausgelöst', CLOSED: 'Geschlossen',
  INVALIDATED: 'Ungültig',
};
