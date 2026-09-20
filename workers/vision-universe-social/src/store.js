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

/* =========================================================================
   DIE PROJIZIERTE WARTESCHLANGE

   -------------------------------------------------------------------------
   WARUM DER WORKER SIE NICHT SELBST BERECHNET
   -------------------------------------------------------------------------

   Weil "wartet auf den Owner" eine Aussage der Zustandsmaschine ist,
   und die steht im Repository: social/engines/owner-decision.js. Der
   Worker haette sie nachbauen muessen - und zwei Definitionen desselben
   Begriffs gehen auseinander, meist genau dann, wenn eine von beiden
   gerade wichtig ist.

   Dieses Projekt hat den Fall schon gehabt: ein Bericht zaehlte Dateien
   im Kandidatenordner, die Maschine zaehlte Zustaende. Sechs gegen null,
   und beide "richtig gerechnet".

   Also haelt der Worker eine PROJEKTION: berechnet im Repository,
   uebertragen ueber einen admin-geschuetzten Endpunkt, hier nur
   gespeichert und gezeigt. `activeCount` wird uebernommen, nie
   ermittelt.

   -------------------------------------------------------------------------
   EIN SCHLUESSEL, KEINE HISTORIE
   -------------------------------------------------------------------------

   Die Schlange ist ein Jetzt-Zustand. Alte Staende aufzuheben hiesse,
   eine zweite Wahrheit aufzubewahren, die niemand pflegt. Die Historie
   der Kandidaten liegt im Repository, wo sie hingehoert.
   ========================================================================= */

const QUEUE_KEY = "approval:queue:v1";

export async function readQueue(env) {
  if (!env.VU_SOCIAL_KV) return null;
  const raw = await env.VU_SOCIAL_KV.get(QUEUE_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (err) { return null; }
}

export async function writeQueue(env, projektion) {
  if (!env.VU_SOCIAL_KV) throw new Error("KV-Bindung VU_SOCIAL_KV fehlt");
  await env.VU_SOCIAL_KV.put(QUEUE_KEY, JSON.stringify(projektion));
  return projektion;
}

export { QUEUE_KEY };

/* =========================================================================
   DER MANUELLE LAUF — WANN ER ZULETZT ANGESTOSSEN WURDE

   -------------------------------------------------------------------------
   WOZU DAS HIER STEHT
   -------------------------------------------------------------------------

   Der Owner tippt auf JETZT PRUEFEN. Das Netz ist langsam, die Seite
   laedt, er tippt noch einmal. Zwei Dispatches, zwei Laeufe - und der
   zweite wartet dann in der Concurrency-Gruppe, um danach einen
   zweiten Zyklus zu fahren.

   Die Lease im Repository faengt das ab, aber erst im Lauf. Hier wird
   es frueher abgefangen: ein zweiter Druck innerhalb der Sperrfrist
   loest gar nichts aus und sagt, wann es wieder geht.

   DIE SPERRFRIST IST KEINE FREQUENZENTSCHEIDUNG. Sie schuetzt nur vor
   dem doppelten Druck derselben Absicht. Ob wirklich ein Beitrag
   entsteht, entscheidet die Kadenz im Lauf - und nicht diese Datei.
   ========================================================================= */
const MANUAL_RUN_KEY = "approval:manual-run:v1";

export async function readManualRun(env) {
  if (!env.VU_SOCIAL_KV) return null;
  const raw = await env.VU_SOCIAL_KV.get(MANUAL_RUN_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (err) { return null; }
}

export async function recordManualRun(env, eintrag) {
  if (!env.VU_SOCIAL_KV) throw new Error("KV-Bindung VU_SOCIAL_KV fehlt");
  const wert = {
    requestedAt: eintrag.requestedAt,
    /* Wie es ausgegangen ist. Ein fehlgeschlagener Dispatch darf die
       Sperrfrist NICHT ausloesen - sonst haelt ein Fehler den Owner
       von seinem naechsten Versuch ab. */
    ok: eintrag.ok === true,
    status: eintrag.status === undefined ? null : eintrag.status,
    /* Ausdruecklich kein Token, kein Header, keine URL mit Parametern
       (§10). Was hier steht, darf ein Log sehen. */
    hinweis: eintrag.hinweis || null
  };
  await env.VU_SOCIAL_KV.put(MANUAL_RUN_KEY, JSON.stringify(wert));
  return wert;
}

export { MANUAL_RUN_KEY };

/* =========================================================================
   DAS ENTSCHEIDUNGSJOURNAL

   -------------------------------------------------------------------------
   WOHIN EINE OWNER-ENTSCHEIDUNG GEHOERT
   -------------------------------------------------------------------------

   Ins Repository. Dort liegen die Kandidaten, dort steht die
   Zustandsmaschine, dort wertet decide-candidate.mjs eine Ablehnung als
   Rueckmeldung ueber die AUSWAHL aus - und ausdruecklich nicht als
   Leistung.

   Der Worker kann nicht ins Repository schreiben. Also haelt er die
   Entscheidung so lange fest, bis der Orchestrator sie abholt und durch
   den bestehenden Weg schickt. Dieses Journal ist ein Briefkasten, kein
   zweiter Datenbestand.

   -------------------------------------------------------------------------
   EIN SCHLUESSEL JE ENTSCHEIDUNG
   -------------------------------------------------------------------------

   Und nicht eine Liste unter einem Schluessel: zwei Entscheidungen
   kurz hintereinander wuerden sich sonst ueberschreiben, und die
   verlorene waere die, von der niemand weiss, dass es sie gab.

   -------------------------------------------------------------------------
   EINMAL ENTSCHIEDEN, BLEIBT ENTSCHIEDEN
   -------------------------------------------------------------------------

   Eine Entscheidung wird nicht ersetzt. Der zweite Druck auf denselben
   Knopf findet die erste vor und fuehrt zu nichts Neuem - das ist die
   Haelfte des Doppelklick-Schutzes, die VOR dem Anspruch greift.

   Angereichert wird sie: eine Freigabe bekommt Medien-ID und Permalink,
   sobald es sie gibt. Das ist kein Ueberschreiben, sondern das Ergebnis
   derselben Entscheidung.

   -------------------------------------------------------------------------
   WAS HIER NIEMALS STEHT
   -------------------------------------------------------------------------

   Eine Leistungsaussage. Ein abgelehnter Beitrag wurde nie
   veroeffentlicht; er hat keine Reichweite, weder eine schlechte noch
   eine gute. Es gibt in diesem Datensatz kein Feld dafuer - nicht als
   null, sondern gar nicht. Ein Feld, das es nicht gibt, kann auch nicht
   versehentlich gefuellt werden.
   ========================================================================= */

const DECISION_PREFIX = "approval:decision:";

function decisionKey(candidateId) {
  return DECISION_PREFIX + String(candidateId);
}

export async function readDecision(env, candidateId) {
  if (!env.VU_SOCIAL_KV) return null;
  const raw = await env.VU_SOCIAL_KV.get(decisionKey(candidateId));
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (err) { return null; }
}

/**
 * Traegt eine Entscheidung ein - aber nur, wenn keine besteht.
 *
 * @returns { ok, decision, reason }
 *
 * `ok: false` mit `reason: "alreadyDecided"` ist kein Fehler, sondern
 * die Antwort auf einen zweiten Druck. Der Aufrufer zeigt dann, was
 * beim ersten Mal herauskam.
 */
export async function recordDecision(env, eintrag) {
  if (!env.VU_SOCIAL_KV) {
    return { ok: false, decision: null, reason: "noStorage" };
  }
  const vorhanden = await readDecision(env, eintrag.candidateId);
  if (vorhanden) return { ok: false, decision: vorhanden, reason: "alreadyDecided" };

  const datensatz = {
    version: 1,
    candidateId: String(eintrag.candidateId),
    /* Der Abdruck, der zum Zeitpunkt der Entscheidung galt. Ohne ihn
       liesse sich spaeter nicht sagen, WORUEBER entschieden wurde. */
    contentHash: eintrag.contentHash || null,
    decision: eintrag.decision,
    reason: eintrag.reason || null,
    decidedBy: eintrag.decidedBy || "owner",
    decidedAt: eintrag.decidedAt || new Date().toISOString(),
    decisionSource: "approval_center",
    published: false,
    mediaId: null,
    permalink: null,
    publishedAt: null,
    /* Wann der Orchestrator sie ins Repository getragen hat. Solange
       das nicht geschehen ist, kennt nur der Worker sie. */
    consumedAt: null
  };
  await env.VU_SOCIAL_KV.put(decisionKey(datensatz.candidateId), JSON.stringify(datensatz));
  return { ok: true, decision: datensatz, reason: null };
}

/** Haelt das Ergebnis einer Freigabe fest, ohne die Entscheidung zu aendern. */
export async function settleDecision(env, candidateId, patch) {
  if (!env.VU_SOCIAL_KV) return null;
  const vorhanden = await readDecision(env, candidateId);
  if (!vorhanden) return null;
  const naechste = Object.assign({}, vorhanden, {
    published: Boolean(vorhanden.published || patch.published),
    mediaId: vorhanden.mediaId || patch.mediaId || null,
    permalink: vorhanden.permalink || patch.permalink || null,
    publishedAt: vorhanden.publishedAt || patch.publishedAt || null,
    /* Ein Betriebszustand (§12). Er sagt etwas ueber den Versand und
       nichts ueber den Beitrag. */
    lastError: patch.lastError === undefined ? (vorhanden.lastError || null) : patch.lastError
  });
  await env.VU_SOCIAL_KV.put(decisionKey(candidateId), JSON.stringify(naechste));
  return naechste;
}

/** Alle Entscheidungen. Wenige, und deshalb ohne Seitenlauf-Ehrgeiz. */
export async function listDecisions(env, options = {}) {
  if (!env.VU_SOCIAL_KV || typeof env.VU_SOCIAL_KV.list !== "function") return [];
  const alle = [];
  let cursor;
  do {
    const seite = await env.VU_SOCIAL_KV.list({ prefix: DECISION_PREFIX, cursor });
    for (const k of seite.keys || []) {
      const raw = await env.VU_SOCIAL_KV.get(k.name);
      if (!raw) continue;
      try { alle.push(JSON.parse(raw)); } catch (err) { /* eine kaputte Zeile
        darf die anderen nicht verschlucken */ }
    }
    cursor = seite.list_complete ? null : seite.cursor;
  } while (cursor);

  return options.onlyOpen ? alle.filter((d) => !d.consumedAt) : alle;
}

/** Quittiert die Uebernahme ins Repository. */
export async function markDecisionConsumed(env, candidateId, at) {
  const vorhanden = await readDecision(env, candidateId);
  if (!vorhanden) return null;
  const naechste = Object.assign({}, vorhanden,
    { consumedAt: at || new Date().toISOString() });
  await env.VU_SOCIAL_KV.put(decisionKey(candidateId), JSON.stringify(naechste));
  return naechste;
}

export { DECISION_PREFIX, decisionKey };
