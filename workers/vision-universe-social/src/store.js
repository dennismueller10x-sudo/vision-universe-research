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

/* ------------------------------------------------------------------ */
/* DAS PROTOKOLL DES SMOKE-TESTS                                       */
/* ------------------------------------------------------------------ */

/**
 * Eigener Schluessel, nicht Teil der Verbindung.
 *
 * Der Grund: ein Trennen loescht die Verbindung. Das Protokoll eines
 * bereits veroeffentlichten Beitrags darf davon nicht verschwinden —
 * der Beitrag ist ja noch da. Wer beides in einen Datensatz legt,
 * verliert beim Trennen den Beleg dafuer, dass etwas oeffentlich
 * gemacht wurde.
 */
const SMOKE_KEY = "smoke:publish:v1";

export async function readSmokeLog(env) {
  if (!env.VU_SOCIAL_KV) return null;
  const raw = await env.VU_SOCIAL_KV.get(SMOKE_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (err) { return null; }
}

export async function appendSmokeLog(env, eintrag) {
  if (!env.VU_SOCIAL_KV) return null;
  const vorhanden = await readSmokeLog(env);
  const log = {
    version: 1,
    attempts: (vorhanden && Array.isArray(vorhanden.attempts) ? vorhanden.attempts : []).concat([eintrag]),
    lastAttemptAt: eintrag.at,
    /* Einmal veroeffentlicht, bleibt veroeffentlicht. Ein spaeterer
       Fehlversuch darf diesen Beleg nicht ueberschreiben. */
    published: Boolean((vorhanden && vorhanden.published) || eintrag.mediaId),
    mediaId: (vorhanden && vorhanden.mediaId) || eintrag.mediaId || null,
    permalink: (vorhanden && vorhanden.permalink) || eintrag.permalink || null
  };
  await env.VU_SOCIAL_KV.put(SMOKE_KEY, JSON.stringify(log));
  return log;
}

export { SMOKE_KEY };

/* =========================================================================
   DIE VEROEFFENTLICHUNGS-ANSPRUECHE

   -------------------------------------------------------------------------
   WARUM EIN ANSPRUCH UND KEIN PROTOKOLL
   -------------------------------------------------------------------------

   Ein Protokoll haelt fest, was passiert IST. Zwischen `POST /media` und
   `POST /media_publish` liegen zwei Aufrufe, und stirbt der Worker
   dazwischen, weiss ein zweiter Versuch nicht, ob der Beitrag schon
   existiert — die Graph API kennt kein Idempotenz-Token, das die Frage
   beantworten koennte.

   Deshalb wird der Anspruch VOR dem ersten Graph-Aufruf angemeldet. Er
   sagt: "fuer dieses Inhaltsobjekt laeuft gerade ein Versuch". Ein
   zweiter Aufruf sieht ihn und veroeffentlicht NICHT — auch dann nicht,
   wenn der erste abgestuerzt ist. Der Preis ist ein Zustand, den ein
   Mensch aufloesen muss; der Gegenwert ist, dass niemals zwei Beitraege
   aus einem Inhaltsobjekt entstehen.

   Lieber ein haengender Anspruch als ein doppelter Beitrag. Ein
   haengender Anspruch faellt auf und ist reparierbar; ein doppelter
   Beitrag faellt dem Publikum auf und ist es nicht.
   ========================================================================= */

const CLAIM_PREFIX = "publish:claim:";

/** Zustaende eines Anspruchs. Mehr gibt es nicht, und das ist Absicht. */
const CLAIM_STATES = ["IN_FLIGHT", "PUBLISHED", "FAILED"];

function claimKey(contentId) {
  return CLAIM_PREFIX + String(contentId);
}

export async function readClaim(env, contentId) {
  if (!env.VU_SOCIAL_KV) return null;
  const raw = await env.VU_SOCIAL_KV.get(claimKey(contentId));
  return raw ? JSON.parse(raw) : null;
}

/**
 * Meldet einen Anspruch an — aber nur, wenn keiner besteht.
 *
 * Gibt `{ ok: false, claim }` zurueck, wenn schon einer da ist. Der
 * Aufrufer entscheidet dann anhand des Zustands, was das bedeutet; diese
 * Funktion urteilt nicht.
 *
 * KV ist nicht transaktional. Zwei gleichzeitige Aufrufe koennten beide
 * "frei" sehen. Das ist bekannt und wird nicht wegdiskutiert: der
 * Endpunkt ist admin-geschuetzt und wird von einem Scheduler mit
 * Nebenlaeufigkeitssperre aufgerufen, nicht von Publikum. Die Sperre
 * hier faengt den haeufigen Fall (Wiederholung nach Absturz), nicht den
 * seltenen (echte Gleichzeitigkeit).
 */
export async function claimPublish(env, contentId, meta) {
  if (!env.VU_SOCIAL_KV) {
    return { ok: false, claim: null, reason: "noStorage",
      message: "Ohne KV laesst sich kein Anspruch anmelden — und ohne Anspruch " +
        "darf nicht veroeffentlicht werden." };
  }

  const vorhanden = await readClaim(env, contentId);
  if (vorhanden) return { ok: false, claim: vorhanden, reason: "claimExists" };

  const claim = {
    version: 1,
    contentId: String(contentId),
    state: "IN_FLIGHT",
    claimedAt: (meta && meta.now) || new Date().toISOString(),
    attempts: 1,
    mediaId: null,
    permalink: null,
    fingerprint: (meta && meta.fingerprint) || null,
    /* Warum dieser Beitrag entstehen durfte. Ein Anspruch, der das nicht
       traegt, beantwortet spaeter die Frage "wer wollte das" nicht mehr —
       und das ist bei einem oeffentlichen Beitrag die erste Frage. */
    via: (meta && meta.via) || null,
    approval: (meta && meta.approval) || null
  };
  await env.VU_SOCIAL_KV.put(claimKey(contentId), JSON.stringify(claim));
  return { ok: true, claim };
}

/** Haelt das Ergebnis fest. Ein Anspruch wird nie geloescht. */
export async function settleClaim(env, contentId, patch) {
  if (!env.VU_SOCIAL_KV) return null;
  const vorhanden = (await readClaim(env, contentId)) || { contentId: String(contentId) };

  /* Einmal PUBLISHED bleibt PUBLISHED. Ein spaeterer Fehlversuch darf
     den Beleg nicht ueberschreiben — der Beitrag ist dann ja da. */
  const state = vorhanden.state === "PUBLISHED" ? "PUBLISHED" : (patch.state || vorhanden.state);

  const claim = Object.assign({}, vorhanden, patch, {
    state,
    mediaId: vorhanden.mediaId || patch.mediaId || null,
    permalink: vorhanden.permalink || patch.permalink || null,
    settledAt: patch.now || new Date().toISOString()
  });
  delete claim.now;
  await env.VU_SOCIAL_KV.put(claimKey(contentId), JSON.stringify(claim));
  return claim;
}

export { CLAIM_PREFIX, CLAIM_STATES, claimKey };
