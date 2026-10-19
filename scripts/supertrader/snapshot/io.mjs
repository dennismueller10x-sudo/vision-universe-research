// Supertrader — Durable Research Snapshot: aufzeichnende und abspielende Eingabequelle fuer loadPitData.
//
// Capture: loadPitData laeuft EINMAL gegen die Live-Quellen; jede gelesene Eingabe (Tickerliste,
// Repository-Datei, R2-Objekt, auch ein 404) wird bytegleich aufgezeichnet.
// Konsument: loadPitData laeuft gegen die Aufzeichnung. Was dort fehlt, ist ein Fehler
// (SOURCE_OBJECT_MISSING), nie ein stiller Rueckgriff auf Live-Daten. Schreiben ist gesperrt.
import { fail, REASON } from './contract.mjs';

// Nutzungszaehler der Nullkostenschranke sind Betriebszustand, keine Eingabe: nie aufgezeichnet.
export const isUsageKey = (key) => /\/_usage\//.test(String(key));

export function createRecordingIO(live) {
  const rec = { tickerZip: null, repoFiles: new Map(), objects: new Map() };
  let realDriver = null;
  const io = {
    kind: 'RECORDING',
    rec,
    async fetchTickerZip() {
      if (rec.tickerZip) return rec.tickerZip; // eine Tickerliste je Capture, nie zwei Abrufe
      rec.tickerZip = await live.fetchTickerZip();
      return rec.tickerZip;
    },
    readRepoFile(rel) {
      if (!rec.repoFiles.has(rel)) rec.repoFiles.set(rel, live.readRepoFile(rel));
      return rec.repoFiles.get(rel);
    },
    async createDriver() {
      realDriver ||= await live.createDriver();
      const d = realDriver;
      return {
        kind: d.kind, endpoint: d.endpoint, bucket: d.bucket,
        async get(key) {
          const b = await d.get(key);
          if (!isUsageKey(key)) rec.objects.set(key, b ? Buffer.from(b) : null);
          return b;
        },
        head: (key) => d.head(key),
        list: (prefix) => d.list(prefix),
        // loadPitData schreibt nicht; ein Schreibversuch im Capture waere ein Fehler im Ablauf.
        async put() { fail(REASON.SNAPSHOT_READ_ONLY, 'capture recording'); },
      };
    },
    realDriver: () => realDriver,
  };
  return io;
}

export function createReplayIO({ tickerZip, repoFiles, objects }) {
  return {
    kind: 'SNAPSHOT',
    async fetchTickerZip() { if (!tickerZip) fail(REASON.TICKER_LIST_NOT_IN_SNAPSHOT); return tickerZip; },
    readRepoFile(rel) { if (!repoFiles.has(rel)) fail(REASON.SOURCE_OBJECT_MISSING, rel); return repoFiles.get(rel); },
    async createDriver() {
      return {
        kind: 'snapshot',
        async get(key) {
          if (isUsageKey(key)) return null;
          if (!objects.has(key)) fail(REASON.SOURCE_OBJECT_MISSING, key);
          return objects.get(key);
        },
        async head() { fail(REASON.SNAPSHOT_READ_ONLY, 'head'); },
        async list() { fail(REASON.SNAPSHOT_READ_ONLY, 'list'); },
        async put() { fail(REASON.SNAPSHOT_READ_ONLY, 'put'); },
      };
    },
  };
}
