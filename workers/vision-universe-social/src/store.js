/* =========================================================================
   vision-universe-social — src/store.js
   DIE MINIMALE PERSISTENZ (§3 der Owner-Information)

   -------------------------------------------------------------------------
   WAS GESPEICHERT WIRD — UND WARUM NICHT WENIGER
   -------------------------------------------------------------------------

   GENAU EIN Datensatz: die aktuelle Meta-Verbindung.

     - das Page-Token (laeuft nicht ab, siehe graph.js)
     - Page-ID, Instagram-Account-ID, Benutzername
     - die tatsaechlich erteilten Rechte
     - die daraus abgeleiteten Faehigkeiten
     - Verbindungszeitpunkt und letzter erfolgreicher Abruf

   Der Worker hat zwischen zwei Anfragen kein Gedaechtnis. Ein Token, das
   nur im Arbeitsspeicher liegt, ist nach dem Callback verloren — und der
   Owner muesste sich bei jedem Abruf neu autorisieren.

   -------------------------------------------------------------------------
   WARUM KV UND NICHT D1
   -------------------------------------------------------------------------

   D1 waere eine relationale Datenbank fuer eine Zeile. KV ist ein
   Schluessel-Wert-Speicher, und genau das brauchen wir: ein Schluessel,
   ein Wert, kein Schema, keine Migration.

   Kosten: Der kostenlose Tarif deckt 100.000 Lesevorgaenge und 1.000
   Schreibvorgaenge am Tag ab. Dieser Worker schreibt bei einer
   Autorisierung und danach hoechstens einmal je Abruf den
   Gesundheitszeitstempel — einstellig pro Tag. Der Abstand zur Freigrenze
   ist drei Groessenordnungen; dieselbe Haltung wie in
   quant/engines/zero-cost-guard.js, nur ist hier nichts auszurechnen.

   -------------------------------------------------------------------------
   WAS NICHT GESPEICHERT WIRD
   -------------------------------------------------------------------------

   Der OAuth-`state` (er ist selbst-verifizierbar, siehe state.js) und das
   langlebige USER-Token (es wird nur zur Ableitung des Page-Tokens
   gebraucht und danach verworfen).

   -------------------------------------------------------------------------
   DIE REGEL, DIE ALLES ANDERE TRAEGT
   -------------------------------------------------------------------------

   DAS TOKEN VERLAESST DEN WORKER NIE.

   Es gibt keinen Endpunkt, der es zurueckgibt. `readPublic()` ist die
   einzige Form, in der ein Verbindungsdatensatz nach aussen geht, und sie
   entfernt das Token, bevor der Aufrufer es sehen kann.

   Das ist der Sicherheitsgewinn gegenueber der urspruenglich empfohlenen
   manuellen Variante: dort haette das Token als GitHub-Secret vorgelegen,
   also an einem zweiten Ort, mit einem zweiten Kreis von Leseberechtigten.
   ========================================================================= */

import { fingerprint } from "./redact.js";

const CONNECTION_KEY = "meta:connection:v1";

/** Liest den vollstaendigen Datensatz — NUR fuer den Worker selbst. */
export async function readConnection(env) {
  if (!env.VU_SOCIAL_KV) return null;
  const raw = await env.VU_SOCIAL_KV.get(CONNECTION_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (err) { return null; }
}

export async function writeConnection(env, record) {
  if (!env.VU_SOCIAL_KV) throw new Error("KV-Bindung VU_SOCIAL_KV fehlt");
  await env.VU_SOCIAL_KV.put(CONNECTION_KEY, JSON.stringify(record));
  return record;
}

export async function deleteConnection(env) {
  if (!env.VU_SOCIAL_KV) return false;
  await env.VU_SOCIAL_KV.delete(CONNECTION_KEY);
  return true;
}

/**
 * Die einzige Form, in der ein Verbindungsdatensatz den Worker verlaesst.
 *
 * Das Token wird nicht geschwaerzt, sondern ENTFERNT — und durch einen
 * Fingerabdruck ersetzt, aus dem es sich nicht rekonstruieren laesst. Ein
 * geschwaerztes Feld laedt dazu ein, die Schwaerzung "nur zum Debuggen"
 * abzuschalten. Ein Feld, das es nicht gibt, nicht.
 */
export async function readPublic(env) {
  const record = await readConnection(env);
  if (!record) {
    return {
      connected: false,
      state: "not_connected",
      explanation: "Es besteht keine Meta-Verbindung. Der Worker ist bereit, " +
                   "aber niemand hat ihn autorisiert."
    };
  }
  return toPublic(record);
}

export async function toPublic(record) {
  return {
    connected: true,
    state: record.health && record.health.state ? record.health.state : "connected",
    connectedAt: record.connectedAt || null,
    /* Oeffentliche Kennungen: eine Adresse, kein Geheimnis. */
    instagramAccountId: record.instagramAccountId || null,
    instagramUsername: record.instagramUsername || null,
    pageId: record.pageId || null,
    pageName: record.pageName || null,
    /* Der Fingerabdruck beantwortet "ist das noch dasselbe Token?" ohne
       das Token zu zeigen. */
    tokenFingerprint: await fingerprint(record.pageAccessToken),
    tokenKind: "page",
    tokenExpiresAt: record.tokenExpiresAt || null,
    permissions: {
      granted: (record.permissions && record.permissions.granted) || [],
      declined: (record.permissions && record.permissions.declined) || [],
      missing: (record.permissions && record.permissions.missing) || []
    },
    capabilities: record.capabilities || null,
    health: record.health || null,
    lastSuccessAt: record.lastSuccessAt || null,
    lastVerifiedAt: record.lastVerifiedAt || null
  };
}

/** Aktualisiert den Gesundheitszustand, ohne den Rest anzufassen. */
export async function updateHealth(env, patch) {
  const record = await readConnection(env);
  if (!record) return null;
  const next = Object.assign({}, record, {
    health: Object.assign({}, record.health, patch.health || {}),
    lastSuccessAt: patch.lastSuccessAt || record.lastSuccessAt,
    lastVerifiedAt: patch.lastVerifiedAt || record.lastVerifiedAt
  });
  await writeConnection(env, next);
  return next;
}

export { CONNECTION_KEY };
