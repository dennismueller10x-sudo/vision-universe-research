/* =========================================================================
   VISION UNIVERSE SOCIAL — scripts/social/sync-creative-invocations.mjs

   DER LEDGER FUEHRT SICH SELBST

   -------------------------------------------------------------------------
   DER BEFUND
   -------------------------------------------------------------------------

   Der Agent meldete zu PR 101 sechsmal STARTED. Im Ledger standen
   ZWEI davon — die beiden, die ich zufaellig gesehen und von Hand
   nachgetragen hatte. Die anderen vier fehlten, und niemandem waere
   das aufgefallen.

   Ein Ledger, dessen Vollstaendigkeit davon abhaengt, dass ein
   Beobachter zur richtigen Zeit hinsieht, beantwortet die Frage nicht
   mehr, wie oft etwas lief. Genau diese Frage ist aber sein einziger
   Zweck — und die Einstufung LOOP_PROTECTION_OPERATIONALLY_SUPPORTED
   haengt daran.

   -------------------------------------------------------------------------
   WAS ES TUT
   -------------------------------------------------------------------------

   Es liest die Invocation-Meldungen des Agenten von einem Pull Request,
   traegt jede noch nicht erfasste in den Ledger ein und bestimmt aus
   den Beobachtungen den Lebenszustand des Laufs.

   Erfasst wird, was in der Meldung steht — delivery_id, processing_key,
   brief_id, content_id, brief_blob_sha, Zeitpunkt, Status — und
   nichts, was daraus geschlossen waere.

   -------------------------------------------------------------------------
   MEHRFACHES STARTED BLEIBT SICHTBAR
   -------------------------------------------------------------------------

   Es wird nicht zusammengefasst und nicht entdoppelt. Sechs Anlaeufe
   sind sechs Eintraege, weil sechs Anlaeufe eine Tatsache sind.

   Die Idempotenzgrenze liegt woanders und bleibt, wo sie ist: am
   Processing Key und am unveraenderlichen abgeschlossenen Ergebnis.
   Sichtbarkeit und Verarbeitung sind zwei verschiedene Dinge —
   sie zu vermengen war der Fehler, der die vier Meldungen verschluckt
   hat.

   Ausfuehren:
     node scripts/social/sync-creative-invocations.mjs --pr 101
     node scripts/social/sync-creative-invocations.mjs --pr 101 --write
     node scripts/social/sync-creative-invocations.mjs --comments <datei.json> --write
   ========================================================================= */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const Ledger = require(join(ROOT, "social/engines/invocation-ledger.js"));
const Lifecycle = require(join(ROOT, "social/engines/provider-lifecycle.js"));

export const LEDGER_DATEI = "social/data/creative-invocations.json";
export const MARKER = "VU_CREATIVE_AGENT_INVOCATION";

/* ------------------------------------------------------------------ */
/* DIE MELDUNG LESEN                                                   */
/*                                                                     */
/* Das Format ist Zeile fuer Zeile "schluessel: wert". Bewusst kein    */
/* JSON-Parser mit Toleranz: was nicht dem Format entspricht, ist      */
/* keine Meldung und wird nicht geraten.                               */
/* ------------------------------------------------------------------ */

/** Liest eine Invocation-Meldung. null, wenn der Text keine ist. */
export function parseInvocation(body) {
  const text = String(body || "");
  if (!text.includes(MARKER)) return null;

  const felder = {};
  for (const zeile of text.split(/\r?\n/)) {
    const treffer = zeile.match(/^\s*([a-z_]+)\s*:\s*(.+?)\s*$/);
    if (treffer) felder[treffer[1]] = treffer[2];
  }

  /* Ohne Processing Key ist die Meldung nicht zuzuordnen. Sie zu
     erraten waere schlimmer, als sie zu verwerfen. */
  if (!felder.processing_key) return null;

  return {
    processingKey: felder.processing_key,
    contentId: felder.content_id || null,
    briefId: felder.brief_id || null,
    briefBlobSha: felder.brief_blob_sha || null,
    deliveryId: felder.delivery_id || null,
    trigger: felder.trigger || null,
    action: felder.action || null,
    status: felder.status || null
  };
}

/** Der Ledger-Zustand zu einem gemeldeten Agent-Status. */
export function zustandFuer(status) {
  switch (String(status || "").toUpperCase()) {
    case "STARTED":   return "IN_FLIGHT";
    case "COMPLETED": return "RESULT_AVAILABLE";
    case "FAILED":    return "PROVIDER_FAILED";
    default:          return null;
  }
}

/**
 * Traegt alle Meldungen ein, die noch nicht im Ledger stehen.
 *
 * Gleichheit heisst: derselbe Processing Key, dieselbe Delivery UND
 * derselbe Zeitpunkt. Zwei Anlaeufe zur selben Delivery
 * unterscheiden sich im Zeitpunkt — und genau die sollen beide
 * sichtbar bleiben.
 */
export function syncInvocations(ledger, kommentare, options) {
  options = options || {};
  /* Verglichen wird nur gegen BEOBACHTETES. Eine von Hand nachgetragene
     Notiz zum selben Zeitpunkt darf die echte Meldung nicht verdecken —
     sonst bliebe ausgerechnet die belastbare Fassung draussen. */
  const vorhanden = new Set(ledger.all()
    .filter((e) => e.observed === true)
    .map((e) => [e.processingKey, e.deliveryId || "", e.at || ""].join("|")));

  const neu = [];
  for (const k of kommentare) {
    const m = parseInvocation(k.body);
    if (!m) continue;

    const state = zustandFuer(m.status);
    if (!state) continue;

    const at = k.created_at || k.createdAt || null;
    const schluessel = [m.processingKey, m.deliveryId || "", at || ""].join("|");
    if (vorhanden.has(schluessel)) continue;
    vorhanden.add(schluessel);

    const eintrag = {
      processingKey: m.processingKey,
      state: state,
      at: at,
      contentId: m.contentId,
      briefId: m.briefId,
      briefBlobSha: m.briefBlobSha,
      pullRequest: options.pullRequest === undefined ? null : options.pullRequest,
      deliveryId: m.deliveryId,
      /* -----------------------------------------------------------
         BEOBACHTUNG ODER NOTIZ

         Der Unterschied ist nicht kosmetisch. Im Ledger standen fuenf
         von Hand nachgetragene Eintraege, vier davon mit ERFUNDENEN
         Zeitstempeln — zwei sogar in der Zukunft. Beim ersten Lauf
         gegen echte Daten zaehlte die Auswertung daraufhin neun
         STARTED statt sechs und hielt einen seit Stunden
         stehengebliebenen Lauf fuer IN_FLIGHT.

         Ein Ledger, das Beobachtetes und Notiertes vermengt, kann die
         Frage nicht beantworten, wie oft etwas lief. Nur was
         `observed: true` traegt, geht in die Auswertung ein.
         ----------------------------------------------------------- */
      observed: true,
      note: "Selbsttaetig erfasst aus der Agent-Meldung (" + m.status + ", " +
        m.trigger + "/" + m.action + "). Nicht von Hand nachgetragen."
    };
    const befund = ledger.record(eintrag);
    neu.push({ eintrag, written: befund.written, reason: befund.reason });
  }
  return neu;
}

/** Fasst zusammen, was zu einem Processing Key beobachtbar ist. */
export function beobachtung(ledger, processingKey, extra) {
  const alle = ledger.all().filter((e) => e.processingKey === processingKey);

  /* Nur Beobachtetes. Eine Notiz ist kein Lauf. */
  const gesehen = alle.filter((e) => e.observed === true);
  const started = gesehen.filter((e) => e.state === "IN_FLIGHT");
  const letzte = gesehen.map((e) => e.at).filter(Boolean).sort();

  return Object.assign({
    startedCount: started.length,
    /* Beide Enden. Die letzte Aktivitaet misst die Ruhe, die erste den
       ganzen Vorgang — ein Anbieter im Backoff setzt sonst mit jeder
       Meldung die Uhr zurueck und wird nie stale. */
    firstActivityAt: letzte.length ? letzte[0] : null,
    lastActivityAt: letzte.length ? letzte[letzte.length - 1] : null,
    deliveryIds: Array.from(new Set(gesehen.map((e) => e.deliveryId).filter(Boolean))),
    entries: alle.length,
    observedEntries: gesehen.length,
    unobservedEntries: alle.length - gesehen.length
  }, extra || {});
}

/* --------------------------------------------------------------- Lauf */
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const arg = (n, d) => { const i = args.indexOf("--" + n); return i === -1 ? d : args[i + 1]; };
  const WRITE = args.includes("--write");

  const PR = arg("pr", null);
  const DATEI = arg("comments", null);
  const NOW = arg("now", new Date().toISOString());

  if (!DATEI) {
    console.error("Kein --comments <datei.json>.");
    console.error("Die Kommentare werden ausserhalb geholt und hier hineingereicht:");
    console.error("dieses Skript greift nicht selbst ins Netz, damit derselbe");
    console.error("Eingabestand zweimal dasselbe Ergebnis liefert.");
    process.exit(2);
  }
  if (!existsSync(join(ROOT, DATEI)) && !existsSync(DATEI)) {
    console.error("Datei nicht gefunden: " + DATEI);
    process.exit(2);
  }
  const pfadK = existsSync(DATEI) ? DATEI : join(ROOT, DATEI);
  const kommentare = JSON.parse(readFileSync(pfadK, "utf8"));

  const pfadL = join(ROOT, LEDGER_DATEI);
  const roh = existsSync(pfadL) ? JSON.parse(readFileSync(pfadL, "utf8")) : { entries: [] };
  const ledger = Ledger.createLedger(roh.entries || []);

  const vorher = ledger.all().length;
  const neu = syncInvocations(ledger, kommentare,
    { pullRequest: PR ? Number(PR) : null });

  console.log("VISION UNIVERSE SOCIAL — Invocation-Sync");
  console.log("Kommentare gelesen:  " + kommentare.length);
  console.log("Meldungen erkannt:   " + neu.length);
  console.log("Ledger vorher/nachher: " + vorher + " / " + ledger.all().length);

  const schluessel = Array.from(new Set(neu.map((x) => x.eintrag.processingKey)));
  for (const k of schluessel) {
    const b = beobachtung(ledger, k);
    const z = Lifecycle.classify(b, { now: NOW });
    console.log("\n--- " + k + " ---");
    console.log("STARTED-Meldungen: " + b.startedCount +
      " | Deliveries: " + (b.deliveryIds.join(", ") || "—"));
    console.log("Letzte Aktivitaet: " + b.lastActivityAt);
    console.log("Zustand:           " + z.state +
      (z.blocking ? "  (blockiert den Graphen)" : "  (blockiert den Graphen NICHT)"));
    console.log("Frist:             " + z.lease.seconds + " s — " + z.lease.explanation);
    console.log(z.explanation);
  }

  if (!WRITE) {
    console.log("\n(Kein --write: es wurde nichts geschrieben.)");
    process.exit(0);
  }
  mkdirSync(dirname(pfadL), { recursive: true });
  writeFileSync(pfadL, JSON.stringify(ledger.snapshot({ now: NOW }), null, 2) + "\n");
  console.log("\nGeschrieben: " + LEDGER_DATEI);
}
