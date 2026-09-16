/* =========================================================================
   vision-universe-social — src/index.js
   DIE SERVERSEITIGE RUNTIME FUER DAS, WAS GITHUB PAGES NICHT KANN

   -------------------------------------------------------------------------
   ABGRENZUNG — WAS DIESER WORKER IST UND WAS ER NICHT IST
   -------------------------------------------------------------------------

   ER IST: der OAuth-Endpunkt und der Ort, an dem das Meta-Token liegt.

   ER IST NICHT: ein VU-Backend. Die Engines, die Content-Pipeline, die
   Learning Engine, das Command Center und die Datenartefakte bleiben, wo
   sie sind — im Repository, ausgefuehrt von GitHub Actions, ausgeliefert
   von GitHub Pages. Nichts davon wandert hierher.

   Der Grund fuer diesen Worker ist genau einer: ein OAuth-Callback ist ein
   HTTP-Endpunkt, und ein statischer Hoster hat keinen. Alles, was ohne
   Server-Laufzeit auskommt, bleibt draussen (§35: keine Technologie
   einsetzen, nur weil sie existiert).

   -------------------------------------------------------------------------
   ROUTEN
   -------------------------------------------------------------------------

     GET  /social/meta/connect      Autorisierung starten     [Admin]
     GET  /social/meta/callback     Rueckweg von Meta         [state + Cookie]
     GET  /social/meta/status       Zustand als JSON          [Admin]
     GET  /social/meta/verify       Faehigkeiten live pruefen [Admin]
     POST /social/meta/disconnect   trennen und loeschen      [Admin]
     GET  /health                   Lebendtest                [oeffentlich]

   -------------------------------------------------------------------------
   WARUM /status EINEN ADMIN-SCHLUESSEL BRAUCHT
   -------------------------------------------------------------------------

   Weil es Kontokennungen und Rechte preisgibt. Das Command Center liest
   den Zustand deshalb NICHT direkt aus dem Browser — es liest, wie alles
   andere auch, ein Artefakt, das ein GitHub-Actions-Lauf erzeugt hat. Der
   Schluessel liegt damit im Actions-Secret und nie im Browser.

   -------------------------------------------------------------------------
   WARUM /connect EINEN ADMIN-SCHLUESSEL BRAUCHT
   -------------------------------------------------------------------------

   Ohne ihn koennte ein Fremder den Flow starten, SEIN Instagram-Konto
   autorisieren und damit die gespeicherte Verbindung ueberschreiben. Der
   Endpunkt waere eine Uebernahme mit einem Klick.
   ========================================================================= */

import { createState, verifyState, clearStateCookie, timingSafeEqual } from "./state.js";
import {
  authorizationUrl, loginMode, exchangeCode, exchangeForLongLived, resolveAccounts,
  debugToken, probePageLinkage, resolveAccountsFromAssets,
  createMediaContainer, mediaContainerStatus, publishMediaContainer, verifyMedia,
  mediaInsights, MEDIA_INSIGHT_CALLS,
  fetchPermissions, probeAccount, accountInsights, recentMedia, revokePermissions,
  REQUIRED_SCOPES, DEFAULT_API_VERSION
} from "./graph.js";
import { deriveCapabilities, assessConnection } from "./capabilities.js";
import { readConnection, writeConnection, deleteConnection, readPublic, updateHealth, readSmokeLog, appendSmokeLog } from "./store.js";
import { redact, redactText, fingerprint } from "./redact.js";
import { successPage, errorPage, disconnectedPage, indexPage, htmlResponse } from "./pages.js";

/* Ein Admin-Schluessel unter dieser Laenge wird abgelehnt. Der Worker hat
   keinen Zaehler fuer Fehlversuche; die einzige belastbare Verteidigung
   gegen Durchprobieren ist deshalb ein Schluessel, der sich nicht
   durchprobieren laesst. */
const MIN_ADMIN_KEY_LENGTH = 32;

const SECURITY_HEADERS = {
  "cache-control": "no-store",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY"
};

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body, null, 2) + "\n", {
    status,
    headers: Object.assign({ "content-type": "application/json; charset=utf-8" },
      SECURITY_HEADERS, headers)
  });
}

/* ------------------------------------------------------------------ */
/* Konfiguration                                                       */
/* ------------------------------------------------------------------ */

function configProblems(env) {
  const missing = [];
  if (!env.META_APP_ID) missing.push("META_APP_ID");
  if (!env.META_APP_SECRET) missing.push("META_APP_SECRET");
  if (!env.VU_SOCIAL_ADMIN_KEY) missing.push("VU_SOCIAL_ADMIN_KEY");
  if (!env.VU_SOCIAL_KV) missing.push("VU_SOCIAL_KV (KV-Bindung)");
  if (!env.PUBLIC_BASE_URL) missing.push("PUBLIC_BASE_URL (Variable)");

  const weak = [];
  if (env.VU_SOCIAL_ADMIN_KEY && String(env.VU_SOCIAL_ADMIN_KEY).length < MIN_ADMIN_KEY_LENGTH) {
    weak.push(`VU_SOCIAL_ADMIN_KEY ist kuerzer als ${MIN_ADMIN_KEY_LENGTH} Zeichen`);
  }
  return { missing, weak };
}

function redirectUri(env) {
  return String(env.PUBLIC_BASE_URL).replace(/\/+$/, "") + "/social/meta/callback";
}

function graphContext(env) {
  return {
    apiVersion: env.META_API_VERSION || DEFAULT_API_VERSION,
    appSecret: env.META_APP_SECRET,
    fetchImpl: env.__fetchImpl || undefined
  };
}

/* ------------------------------------------------------------------ */
/* Zugangskontrolle                                                    */
/* ------------------------------------------------------------------ */

function extractAdminKey(request, url) {
  const header = request.headers.get("authorization");
  if (header && /^Bearer\s+/i.test(header)) return header.replace(/^Bearer\s+/i, "").trim();
  const param = url.searchParams.get("key");
  if (param) return param;
  return null;
}

function requireAdmin(request, url, env) {
  const expected = env.VU_SOCIAL_ADMIN_KEY;
  if (!expected) {
    return { ok: false, response: json({
      error: "notConfigured",
      message: "VU_SOCIAL_ADMIN_KEY ist nicht gesetzt. Ohne diesen Schluessel bleiben die " +
               "Admin-Endpunkte geschlossen — ein offener /connect waere eine Uebernahme mit einem Klick."
    }, 503) };
  }
  if (String(expected).length < MIN_ADMIN_KEY_LENGTH) {
    return { ok: false, response: json({
      error: "weakAdminKey",
      message: `VU_SOCIAL_ADMIN_KEY ist kuerzer als ${MIN_ADMIN_KEY_LENGTH} Zeichen und wird abgelehnt.`
    }, 503) };
  }
  const provided = extractAdminKey(request, url);
  if (!provided || !timingSafeEqual(provided, expected)) {
    /* Keine Auskunft darueber, ob der Schluessel fehlte oder falsch war. */
    return { ok: false, response: json({
      error: "unauthorized",
      message: "Kein gueltiger Admin-Schluessel."
    }, 401, { "www-authenticate": "Bearer" }) };
  }
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Routen                                                              */
/* ------------------------------------------------------------------ */

/**
 * Welche Rechte diese Anmeldung angefragt hat.
 *
 * Bei der klassischen Anmeldung stehen sie in `scope` — wir wissen es,
 * weil wir sie selbst hingeschrieben haben. Bei der Business-Anmeldung
 * stehen sie in einer Konfiguration bei Meta, die dieser Worker nicht
 * lesen kann: dann ist die Antwort NICHT "keine", sondern `null`.
 *
 * Der Unterschied ist kein Feinschliff. `deriveCapabilities` macht aus
 * "angefragt und nicht erteilt" ein geprueftes UNAVAILABLE und aus "nicht
 * angefragt" ein ungeprueftes null. Wuerden wir bei der
 * Business-Anmeldung REQUIRED_SCOPES als angefragt ausgeben, meldete der
 * Bericht Rechte als geprueft-nicht-verfuegbar, die niemand je verlangt
 * hat — und der Owner suchte einen Fehler, den es nicht gibt.
 */
function requestedScopes(env) {
  return loginMode(env.META_LOGIN_CONFIG_ID) === "business" ? null : REQUIRED_SCOPES;
}

async function handleConnect(request, url, env) {
  const { missing, weak } = configProblems(env);
  if (missing.length || weak.length) {
    return htmlResponse("Nicht konfiguriert", `
<div class="card bad"><strong>Der Worker ist nicht vollstaendig konfiguriert.</strong></div>
<div class="card"><strong>Fehlt</strong><ul>
${missing.map((m) => `<li><code>${m}</code></li>`).join("") || "<li>nichts</li>"}
</ul>${weak.length ? `<strong>Schwach</strong><ul>${weak.map((w) => `<li>${w}</li>`).join("")}</ul>` : ""}
<p class="muted">Werte werden ausschliesslich ueber <code>wrangler secret put</code> bzw. als
Variable gesetzt — niemals im Repository.</p></div>`, 503);
  }

  const { state, cookie } = await createState(env.META_APP_SECRET);
  /* Ist eine Konfigurations-ID hinterlegt, gilt der Business-Dialog und
     `scopes` bleibt ungenutzt — die Rechte stehen dann in der
     Konfiguration bei Meta, nicht hier. */
  const target = authorizationUrl(graphContext(env), {
    appId: env.META_APP_ID,
    redirectUri: redirectUri(env),
    state,
    scopes: REQUIRED_SCOPES,
    configId: env.META_LOGIN_CONFIG_ID
  });

  /* 302 statt einer Zwischenseite: je weniger Schritte, desto weniger
     Gelegenheit, den Link weiterzureichen — und der `state` lebt nur
     zehn Minuten. */
  return new Response(null, {
    status: 302,
    headers: Object.assign({ location: target, "set-cookie": cookie }, SECURITY_HEADERS)
  });
}



/* ------------------------------------------------------------------ */
/* ZIEL-ALLOWLIST                                                      */
/* ------------------------------------------------------------------ */

/**
 * Welche Instagram-Konten ueberhaupt Ziel sein duerfen.
 *
 * Zwei Wege, weil zwei verschiedene Dinge bekannt sind:
 *
 *   META_IG_ALLOWED_USERNAMES  der Handle — bekannt, bevor je eine
 *                              Verbindung bestand
 *   META_IG_ACCOUNT_ID         die numerische ID — erst nach der ersten
 *                              erfolgreichen Aufloesung bekannt, dafuer
 *                              unveraenderlich
 *
 * Ein Handle laesst sich umbenennen, eine ID nicht. Sobald die ID
 * bekannt ist, gehoert sie eingetragen — dann traegt die Sperre nicht
 * mehr an einem Namen, den jemand aendern koennte.
 *
 * Sind beide gesetzt, muessen BEIDE passen. Das ist kein Doppel-Gemoppel:
 * stimmt die ID und der Handle nicht, ist irgendwo etwas vertauscht, und
 * das soll auffallen statt durchzurutschen.
 */
function allowedTargets(env) {
  const usernames = String(env.META_IG_ALLOWED_USERNAMES || "")
    .split(",").map((s) => s.trim().toLowerCase().replace(/^@/, "")).filter(Boolean);
  const accountId = String(env.META_IG_ACCOUNT_ID || "").trim();

  const teile = [];
  if (usernames.length) teile.push(usernames.map((u) => "@" + u).join(" oder "));
  if (accountId) teile.push("Konto-ID " + accountId);

  return {
    usernames,
    accountId: accountId || null,
    configured: usernames.length > 0 || Boolean(accountId),
    beschreibung: teile.join(" UND ") || "(keine Einschraenkung)"
  };
}

function isAllowedTarget(account, erlaubt) {
  if (!erlaubt.configured) return true;
  if (erlaubt.usernames.length) {
    const handle = String(account.instagramUsername || "").toLowerCase().replace(/^@/, "");
    if (!handle || !erlaubt.usernames.includes(handle)) return false;
  }
  if (erlaubt.accountId && String(account.instagramAccountId) !== erlaubt.accountId) return false;
  return true;
}


/* ------------------------------------------------------------------ */
/* DER SMOKE-TEST: GENAU EIN BEITRAG, AUSDRUECKLICH AUSGELOEST         */
/* ------------------------------------------------------------------ */

/* Die Bestaetigung ist absichtlich unbequem zu tippen. Ein `?confirm=1`
   waere in einer Browserzeile versehentlich erzeugt, dieses hier nicht. */
const SMOKE_CONFIRM = "PUBLISH-ONE-TEST-POST";
const SMOKE_AGAIN = "JA-ICH-WEISS-DASS-EIN-ZWEITER-BEITRAG-ENTSTEHT";

/* Wie lange auf einen Container gewartet wird, bevor aufgegeben wird.
   Ein Bild ist normalerweise sofort fertig; die Schleife ist fuer den
   Fall, dass es das ausnahmsweise nicht ist. */
const CONTAINER_TRIES = 5;
const CONTAINER_WAIT_MS = 1500;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Traegt einen Meta-Fehler vollstaendig zusammen — ohne Token.
 *
 * Bei einem fehlgeschlagenen Beitrag ist die Frage nicht "hat es
 * geklappt", sondern "woran genau lag es". Meta beantwortet das in
 * `code`, `error_subcode` und `fbtrace_id`; ohne diese drei ist eine
 * Ruecksprache mit dem Support wertlos.
 *
 * Die Meldung selbst laeuft durch dieselbe Schwaerzung wie alles
 * andere: Meta spiegelt regelmaessig den ganzen Request zurueck, und
 * darin steht das Token.
 */
function metaFehlerdaten(result, env) {
  if (!result || result.ok) return null;
  const geheim = [env && env.META_APP_SECRET, env && env.VU_SOCIAL_ADMIN_KEY];
  return {
    reason: result.reason || null,
    message: redactText(String(result.message || "").slice(0, 500), geheim),
    metaCode: result.metaCode === undefined ? null : result.metaCode,
    metaSubcode: result.metaSubcode === undefined ? null : result.metaSubcode,
    metaType: result.metaType || null,
    fbtraceId: result.fbtraceId || null,
    httpStatus: result.httpStatus === undefined ? null : result.httpStatus,
    retryable: Boolean(result.retryable)
  };
}

/**
 * Prueft, dass das Bild ueberhaupt erreichbar ist — BEVOR Meta es
 * abholen soll.
 *
 * Ohne diesen Schritt kommt ein unerreichbares Bild als Meta-Fehlercode
 * zurueck, der nach einem Problem mit dem Konto aussieht. Der Unterschied
 * zwischen "Instagram mag das Bild nicht" und "die Adresse antwortet
 * nicht" gehoert festgestellt, bevor Meta gefragt wird.
 */
async function pruefeBild(imageUrl, fetchImpl) {
  const holen = fetchImpl || fetch;
  let antwort;
  try {
    antwort = await holen(imageUrl, { method: "HEAD" });
  } catch (err) {
    return { ok: false, reason: "imageUnreachable",
      message: "Die Bildadresse ist nicht erreichbar: " + String(err && err.message).slice(0, 160) };
  }
  if (!antwort.ok) {
    return { ok: false, reason: "imageUnreachable",
      message: `Die Bildadresse antwortet mit HTTP ${antwort.status}. Meta koennte sie ebenfalls ` +
        "nicht abholen." };
  }
  const typ = String(antwort.headers.get("content-type") || "");
  if (!/^image\/jpe?g/i.test(typ)) {
    return { ok: false, reason: "imageNotJpeg",
      message: `Die Bildadresse liefert \`${typ || "keinen Inhaltstyp"}\`. Instagram nimmt fuer ` +
        "einen Bildbeitrag JPEG." };
  }
  return { ok: true, contentType: typ,
    contentLength: Number(antwort.headers.get("content-length")) || null };
}

async function handleSmokePublish(request, url, env) {
  const gate = requireAdmin(request, url, env);
  if (!gate.ok) return gate.response;

  if (url.searchParams.get("confirm") !== SMOKE_CONFIRM) {
    return json({
      error: "confirmationRequired",
      message: "Dieser Endpunkt veroeffentlicht einen ECHTEN Beitrag im verbundenen " +
        "Instagram-Konto. Er laeuft nur mit ausdruecklicher Bestaetigung.",
      confirmWith: `?confirm=${SMOKE_CONFIRM}`,
      published: false
    }, 400);
  }

  const record = await readConnection(env);
  if (!record) {
    return json({ error: "notConnected",
      message: "Es besteht keine Verbindung. Es wurde nichts veroeffentlicht.", published: false }, 409);
  }

  /* Die Allowlist noch einmal, gegen den GESPEICHERTEN Datensatz. Sie
     wurde beim Verbinden geprueft — aber zwischen damals und jetzt kann
     die Konfiguration geaendert worden sein, und ein Beitrag ist nicht
     zuruecknehmbar. */
  const erlaubt = allowedTargets(env);
  if (!isAllowedTarget({
    instagramAccountId: record.instagramAccountId,
    instagramUsername: record.instagramUsername
  }, erlaubt)) {
    return json({
      error: "targetNotAllowed",
      message: "Das gespeicherte Konto steht nicht (mehr) auf der Ziel-Allowlist. Es wurde nichts " +
        "veroeffentlicht.",
      storedAccount: record.instagramUsername || record.instagramAccountId,
      allowed: erlaubt.beschreibung,
      published: false
    }, 403);
  }

  /* GENAU EINER. Die Graph API kennt kein Idempotenz-Token: ein zweiter
     Aufruf erzeugt einen zweiten Beitrag. Diese Sperre ist die einzige,
     die das verhindert. */
  const vorher = await readSmokeLog(env);
  if (vorher && vorher.published && url.searchParams.get("again") !== SMOKE_AGAIN) {
    return json({
      error: "alreadyPublished",
      message: "Der Smoke-Test wurde bereits durchgefuehrt. Ein erneuter Aufruf erzeugt einen " +
        "ZWEITEN Beitrag — die Graph API kennt kein Idempotenz-Token.",
      mediaId: vorher.mediaId,
      permalink: vorher.permalink,
      published: true,
      repeatWith: `&again=${SMOKE_AGAIN}`
    }, 409);
  }

  const ctx = graphContext(env);
  const imageUrl = String(env.VU_SOCIAL_SMOKE_IMAGE_URL || "").trim();
  const caption = String(env.VU_SOCIAL_SMOKE_CAPTION || "").trim();
  const beginn = new Date().toISOString();

  if (!imageUrl) {
    return json({ error: "noImageConfigured",
      message: "VU_SOCIAL_SMOKE_IMAGE_URL ist nicht gesetzt. Ohne Bild kein Bildbeitrag.",
      published: false }, 400);
  }

  const bild = await pruefeBild(imageUrl, ctx.fetchImpl);
  if (!bild.ok) {
    const eintrag = { at: beginn, stage: "imageCheck", ok: false,
      imageUrl, error: { reason: bild.reason, message: bild.message } };
    await appendSmokeLog(env, eintrag);
    return json({ error: bild.reason, message: bild.message, published: false, stage: "imageCheck" }, 400);
  }

  /* 1. Container. Bis hierher ist nichts oeffentlich. */
  const container = await createMediaContainer(ctx, {
    instagramAccountId: record.instagramAccountId,
    accessToken: record.pageAccessToken,
    imageUrl, caption
  });
  if (!container.ok) {
    const fehler = metaFehlerdaten(container, env);
    await appendSmokeLog(env, { at: beginn, stage: "createContainer", ok: false, imageUrl, error: fehler });
    return json({ error: container.reason, stage: "createContainer", meta: fehler,
      published: false }, 502);
  }

  /* 2. Zustand abfragen, bevor freigegeben wird. */
  let zustand = null;
  for (let i = 0; i < CONTAINER_TRIES; i += 1) {
    const s = await mediaContainerStatus(ctx, {
      containerId: container.data.containerId, accessToken: record.pageAccessToken
    });
    zustand = s.ok ? s.data : null;
    if (!zustand || zustand.statusCode === "FINISHED" || zustand.statusCode === null) break;
    if (zustand.statusCode === "ERROR" || zustand.statusCode === "EXPIRED") break;
    await sleep(CONTAINER_WAIT_MS);
  }

  if (zustand && (zustand.statusCode === "ERROR" || zustand.statusCode === "EXPIRED")) {
    const fehler = { reason: "containerNotUsable",
      message: `Der Container steht auf ${zustand.statusCode}: ${zustand.status || "ohne Begruendung"}. ` +
        "Es wurde nichts veroeffentlicht." };
    await appendSmokeLog(env, { at: beginn, stage: "containerStatus", ok: false,
      imageUrl, containerId: container.data.containerId, error: fehler });
    return json({ error: fehler.reason, message: fehler.message, stage: "containerStatus",
      containerId: container.data.containerId, published: false }, 502);
  }

  /* 3. Ab hier ist es oeffentlich. */
  const freigabe = await publishMediaContainer(ctx, {
    instagramAccountId: record.instagramAccountId,
    accessToken: record.pageAccessToken,
    containerId: container.data.containerId
  });
  if (!freigabe.ok) {
    const fehler = metaFehlerdaten(freigabe, env);
    await appendSmokeLog(env, { at: beginn, stage: "publish", ok: false,
      imageUrl, containerId: container.data.containerId, error: fehler });
    return json({ error: freigabe.reason, stage: "publish", meta: fehler,
      containerId: container.data.containerId,
      message: "Die Freigabe schlug fehl. Ob dabei etwas veroeffentlicht wurde, ist NICHT sicher — " +
        "vor einem zweiten Versuch im Konto nachsehen.",
      published: false }, 502);
  }

  /* 4. Zurueckgelesen. Eine Medien-ID ist eine Zusage, der Permalink ist
        der Beleg. */
  const geprueft = await verifyMedia(ctx, {
    mediaId: freigabe.data.mediaId, accessToken: record.pageAccessToken
  });

  const eintrag = {
    at: beginn,
    finishedAt: new Date().toISOString(),
    stage: "verify",
    ok: geprueft.ok,
    imageUrl,
    imageContentType: bild.contentType,
    containerId: container.data.containerId,
    containerStatus: zustand ? zustand.statusCode : null,
    mediaId: freigabe.data.mediaId,
    permalink: geprueft.ok ? geprueft.data.permalink : null,
    mediaType: geprueft.ok ? geprueft.data.mediaType : null,
    timestamp: geprueft.ok ? geprueft.data.timestamp : null,
    instagramAccountId: record.instagramAccountId,
    instagramUsername: record.instagramUsername,
    error: geprueft.ok ? null : metaFehlerdaten(geprueft, env)
  };
  const log = await appendSmokeLog(env, eintrag);

  return json({
    published: true,
    mediaId: freigabe.data.mediaId,
    permalink: eintrag.permalink,
    mediaType: eintrag.mediaType,
    timestamp: eintrag.timestamp,
    containerId: container.data.containerId,
    account: record.instagramUsername,
    verified: geprueft.ok,
    verifyError: eintrag.error,
    attempts: log ? log.attempts.length : 1,
    note: "Ein einzelner Testbeitrag. Es laeuft keine Automatik — der naechste Beitrag " +
      "entsteht nur durch einen weiteren ausdruecklichen Aufruf."
  }, geprueft.ok ? 200 : 207);
}

/**
 * Die gemessene Leistung der eigenen Beitraege.
 *
 * -------------------------------------------------------------------------
 * WARUM DAS DIE WURZEL DES RUECKWEGS IST
 * -------------------------------------------------------------------------
 *
 * Der Kreislauf kann vorwaerts laufen, ohne je etwas gemessen zu haben:
 * Signale, Gelegenheiten, Strategie, Content, Pruefung. Zurueck kommt er
 * nur ueber Zahlen, die tatsaechlich erhoben wurden. Ohne diesen Endpunkt
 * bleibt "Leistung vergleichbarer Beitraege" fuer immer ungemessen, und
 * jede Strategie waere eine Meinung.
 *
 * Er VEROEFFENTLICHT NICHTS. Er liest, was ohnehin schon oeffentlich
 * geworden ist, und nur fuer das verbundene Konto.
 *
 * Ohne `?media=` werden die zuletzt veroeffentlichten Beitraege des
 * Kontos gelesen; mit `?media=<id>[,<id>]` genau diese. Der zweite Weg
 * traegt den Fall, den es hier wirklich gibt: ein archivierter Beitrag
 * taucht in der Medienliste nicht mehr auf, ueber seine Kennung ist er
 * weiterhin abfragbar.
 */
async function handleInsights(request, url, env) {
  const gate = requireAdmin(request, url, env);
  if (!gate.ok) return gate.response;

  const record = await readConnection(env);
  if (!record) {
    return json({ error: "notConnected",
      message: "Es besteht keine Verbindung. Es kann nichts gemessen werden." }, 409);
  }

  const ctx = graphContext(env);
  const token = record.pageAccessToken;

  const gewuenscht = String(url.searchParams.get("media") || "")
    .split(",").map((s) => s.trim()).filter(Boolean);

  let ids = gewuenscht;
  let quelle = "angefragt";
  if (!ids.length) {
    const liste = await recentMedia(ctx, {
      instagramAccountId: record.instagramAccountId,
      pageAccessToken: token,
      limit: Number(url.searchParams.get("limit")) || 25
    });
    if (!liste.ok) {
      return json({ error: liste.reason, message: liste.message,
        meta: metaFehlerdaten(liste, env) }, 502);
    }
    ids = ((liste.data && liste.data.data) || []).map((m) => String(m.id));
    quelle = "Medienliste des Kontos";
  }

  /* -----------------------------------------------------------------
     DAS SUBREQUEST-BUDGET
     -----------------------------------------------------------------

     Ein Cloudflare Worker darf pro Anfrage nur eine begrenzte Zahl
     ausgehender Aufrufe machen (50 im Standardplan). Jeder Beitrag
     kostet ZWEI — Stammdaten und Kennzahlen —, die Medienliste kostet
     einen weiteren.

     Beim ersten echten Lauf wurden 26 Beitraege angefragt: 53 Aufrufe.
     Die ersten liefen, die letzten neun kamen als `networkError`
     zurueck. Das sah aus wie ein Netzproblem bei Meta und war eine
     Obergrenze bei uns.

     Deshalb wird hier GERECHNET statt gehofft, und was nicht mehr
     hineinpasst, wird ausdruecklich als offen gemeldet — nicht als
     gescheitert. Der Aufrufer holt den Rest mit `?media=` nach. */
  const BUDGET = Math.max(1, Number(env.VU_SOCIAL_SUBREQUEST_BUDGET) || 40);
  /* Stammdaten (1) plus je eine Abfrage je Metrikgruppe. Abgeleitet und
     nicht eingetragen: als die dritte Gruppe dazukam, stand hier eine 2,
     und dreizehn Beitraege kamen als "Too many subrequests" zurueck —
     ein Fehler, der wie ein Netzproblem bei Meta aussah. */
  const proBeitrag = 1 + MEDIA_INSIGHT_CALLS;
  const schonVerbraucht = quelle === "Medienliste des Kontos" ? 1 : 0;
  const passt = Math.max(1, Math.floor((BUDGET - schonVerbraucht) / proBeitrag));

  const zuHolen = ids.slice(0, passt);
  const vertagt = ids.slice(passt);

  const beitraege = [];
  for (const id of zuHolen) {
    /* Stammdaten und Kennzahlen getrennt: schlaegt das eine fehl, ist
       das andere deswegen nicht wertlos. Ein Beitrag, von dem wir den
       Zeitstempel haben und die Reichweite nicht, ist etwas anderes als
       ein Beitrag, ueber den wir nichts wissen. */
    const stamm = await verifyMedia(ctx, { mediaId: id, accessToken: token });
    const zahlen = await mediaInsights(ctx, { mediaId: id, accessToken: token });

    beitraege.push({
      mediaId: String(id),
      media: stamm.ok ? stamm.data : null,
      mediaError: stamm.ok ? null : metaFehlerdaten(stamm, env),
      metrics: zahlen.ok ? zahlen.data.metrics : null,
      unanswered: zahlen.ok ? zahlen.data.unanswered : null,
      metricsError: zahlen.ok ? null : metaFehlerdaten(zahlen, env),
      /* Woher die Zahl stammt, reist mit ihr. Eine Kennzahl ohne
         Herkunft ist spaeter nicht von einer geschaetzten zu
         unterscheiden (§11). */
      provenance: {
        source: "instagram.graph",
        apiVersion: ctx.apiVersion || DEFAULT_API_VERSION,
        accountId: record.instagramAccountId,
        account: record.instagramUsername || null,
        fetchedAt: new Date().toISOString(),
        measured: zahlen.ok
      }
    });
  }

  return json({
    account: record.instagramUsername || null,
    accountId: record.instagramAccountId,
    source: quelle,
    requested: ids.length,
    fetched: zuHolen.length,
    measured: beitraege.filter((b) => b.metrics).length,
    /* Was nicht abgefragt wurde, ist OFFEN und nicht gescheitert. Der
       Unterschied entscheidet, ob jemand nach einem Fehler sucht oder
       einfach nachfasst. */
    deferred: vertagt,
    deferredReason: vertagt.length
      ? "Das Subrequest-Budget des Workers (" + BUDGET + ") reicht fuer " + passt +
        " Beitraege je Anfrage. Die uebrigen sind nicht gemessen worden und nicht " +
        "fehlgeschlagen — mit ?media=<id>,<id> nachholen."
      : null,
    posts: beitraege,
    note: "Nur gelesen. Es wurde nichts veroeffentlicht und nichts veraendert."
  });
}

/**
 * Sammelt, was die API im Fehlerfall tatsaechlich gesagt hat.
 *
 * Drei Fragen, die zusammen entscheiden, wo die Ursache liegt:
 *
 *   1. Welche Assets hat der Nutzer im Dialog freigegeben?
 *      (`granular_scopes` — nur dort steht das, nicht in
 *      /me/permissions)
 *   2. Welche Seiten sieht der Zugang?
 *   3. Ueber welches Feld nennt eine Seite ihr Instagram-Konto — und
 *      was antwortet die API auf die anderen Felder?
 *
 * Erst diese drei zusammen trennen "im Dialog nicht ausgewaehlt" von
 * "ausgewaehlt, aber nicht sichtbar" von "sichtbar, aber ueber ein
 * anderes Feld verknuepft". Einzeln sieht jede Lage aus wie die anderen.
 *
 * Jeder Teil darf fehlschlagen, ohne den Bericht zu verlieren: ein
 * unvollstaendiger Befund ist mehr wert als keiner.
 */
async function linkageReport(ctx, env, userToken, accounts) {
  const report = {
    pages: accounts.pages || [],
    grantedAssets: null,
    linkageProbe: null,
    /* Was der Asset-Weg gesagt hat, falls er ueberhaupt lief. */
    assetPath: accounts.assetPathReason
      ? { reason: accounts.assetPathReason, message: accounts.assetPathMessage }
      : null
  };

  try {
    const debug = await debugToken(ctx, {
      appId: env.META_APP_ID, appSecret: env.META_APP_SECRET, inputToken: userToken
    });
    report.grantedAssets = debug.ok ? debug.data.granular : { error: debug.reason };
  } catch (err) {
    report.grantedAssets = { error: "unreadable" };
  }

  /* Die Feldprobe nur, wenn es ueberhaupt eine Seite gibt — sonst gibt
     es nichts zu befragen. */
  const first = (report.pages || [])[0];
  if (first && first.pageId) {
    try {
      report.linkageProbe = await probePageLinkage(ctx, first.pageId, userToken);
    } catch (err) {
      report.linkageProbe = { error: "unreadable" };
    }
  }
  return report;
}

async function handleCallback(request, url, env) {
  const { missing } = configProblems(env);
  if (missing.length) {
    return errorPage("notConfigured",
      "Der Worker ist nicht vollstaendig konfiguriert: " + missing.join(", ") + ".", 503);
  }

  /* Meta meldet Abbrueche ueber error-Parameter, nicht ueber HTTP-Status. */
  const metaError = url.searchParams.get("error");
  if (metaError) {
    const description = url.searchParams.get("error_description") || "";
    if (metaError === "access_denied") {
      return errorPage("accessDenied",
        "Die Autorisierung wurde im Meta-Dialog abgebrochen oder abgelehnt. Es wurde nichts " +
        "gespeichert und eine bestehende Verbindung ist unveraendert.", 400);
    }
    return errorPage(String(metaError).slice(0, 60),
      redactText(description, [env.META_APP_SECRET]).slice(0, 300), 400);
  }

  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (!state || !code) {
    return errorPage("missingParameters",
      "Der Rueckweg von Meta trug keinen Autorisierungscode oder keinen state-Wert.", 400);
  }

  /* SPERRE 1: der state muss von uns stammen, frisch sein und im selben
     Browser angekommen sein. */
  const verified = await verifyState(env.META_APP_SECRET, state, request.headers.get("cookie"));
  if (!verified.valid) {
    const explanations = {
      signatureMismatch: "Der state-Wert wurde nicht von diesem Worker ausgestellt.",
      expired: "Der Autorisierungsvorgang ist aelter als zehn Minuten. Bitte neu starten.",
      missingCookie: "Das Sitzungs-Cookie fehlt. Der Vorgang muss im selben Browser beendet " +
                     "werden, in dem er begonnen wurde.",
      cookieMismatch: "Das Sitzungs-Cookie passt nicht zum state-Wert.",
      futureTimestamp: "Der state-Wert traegt einen Zeitstempel aus der Zukunft.",
      malformedState: "Der state-Wert ist unlesbar.",
      malformedPayload: "Der state-Wert ist unlesbar."
    };
    /* Es wird KEIN Token-Tausch versucht. Bei CSRF-Verdacht geht nichts
       hinaus. */
    return errorPage(verified.reason,
      (explanations[verified.reason] || "Der state-Wert ist ungueltig.") +
      " Aus Sicherheitsgruenden wurde der Vorgang abgebrochen, bevor ein Token angefordert wurde.",
      400);
  }

  const ctx = graphContext(env);
  const clearCookie = clearStateCookie();

  /* SPERRE 2: Code gegen kurzlebiges Token — serverseitig, mit App-Secret. */
  const short = await exchangeCode(ctx, {
    appId: env.META_APP_ID, appSecret: env.META_APP_SECRET,
    redirectUri: redirectUri(env), code
  });
  if (!short.ok) {
    return errorPage(short.reason, short.message || "Der Token-Tausch wurde abgelehnt.", 502,
      { "set-cookie": clearCookie });
  }

  const long = await exchangeForLongLived(ctx, {
    appId: env.META_APP_ID, appSecret: env.META_APP_SECRET, token: short.data.token
  });
  if (!long.ok) {
    return errorPage(long.reason, long.message || "Kein langlebiges Token erhalten.", 502,
      { "set-cookie": clearCookie });
  }

  const userToken = long.data.token;
  const userTokenExpiresAt = long.data.expiresIn
    ? new Date(Date.now() + long.data.expiresIn * 1000).toISOString() : null;

  /* Rechte VOR der Kontoaufloesung: ohne instagram_basic und
     pages_show_list scheitert die Aufloesung ohnehin, und die Meldung
     "keine Seite gefunden" waere dann irrefuehrend. */
  const permissions = await fetchPermissions(ctx, userToken);
  if (!permissions.ok) {
    return errorPage(permissions.reason, permissions.message || "Die Rechte liessen sich nicht lesen.",
      502, { "set-cookie": clearCookie });
  }

  const capabilities = deriveCapabilities(permissions.data.granted, requestedScopes(env));
  if (!capabilities.operational) {
    return errorPage("missingEssentialPermissions",
      capabilities.explanation + " Es wurde nichts gespeichert.", 400, { "set-cookie": clearCookie });
  }

  /* ZWEI QUELLEN, IN DIESER REIHENFOLGE.

     `/me/accounts` zaehlt die Seiten auf, die der angemeldete Mensch als
     Person verwaltet. Beim Business Login mit gezielter Asset-Auswahl
     entsteht der Zugriff aber als Freigabe am Token — dann bleibt die
     Liste leer, obwohl Seite und Konto freigegeben sind. Real beobachtet
     am 2026-09-16.

     `/me/accounts` bleibt trotzdem die erste Quelle: es liefert das
     Seiten-Token gleich mit und deckt den klassischen Weg ab. Es ist nur
     nicht mehr die EINZIGE. */
  let accounts = await resolveAccounts(ctx, userToken, permissions.data.granted);

  if (!accounts.ok && ["noPagesVisible", "noInstagramAccount"].includes(accounts.reason)) {
    const debug = await debugToken(ctx, {
      appId: env.META_APP_ID, appSecret: env.META_APP_SECRET, inputToken: userToken
    });
    if (debug.ok) {
      const ausAssets = await resolveAccountsFromAssets(ctx, userToken, debug.data.granular);
      /* Nur ein ERFOLG ersetzt den ersten Befund. Scheitert auch dieser
         Weg, bleibt die urspruengliche Meldung stehen — sonst wuerde ein
         Folgefehler die eigentliche Ursache verdecken. */
      if (ausAssets.ok) accounts = ausAssets;
      else accounts = Object.assign({}, accounts, {
        assetPathReason: ausAssets.reason,
        assetPathMessage: ausAssets.message
      });
    }
  }

  if (!accounts.ok) {
    /* Ein Abbruch verliert sonst seine eigene Ursache: der Code ist
       verbraucht, das Token nirgends gespeichert, und die naechste Frage
       waere wieder "bitte noch einmal einloggen". Deshalb wird HIER
       gemessen, solange das Token noch in der Hand ist. */
    const befund = await linkageReport(ctx, env, userToken, accounts);
    const status = ["noInstagramAccount", "noPagesVisible", "missingPagePermission"]
      .includes(accounts.reason) ? 400 : 502;
    return errorPage(accounts.reason, accounts.message || "Kontoaufloesung fehlgeschlagen.",
      status, { "set-cookie": clearCookie }, befund);
  }

  /* DIE ZIEL-ALLOWLIST.

     Ein Autorisierungsdialog zeigt alles, worauf der angemeldete Mensch
     Rechte hat — auch private Konten und Konten anderer Projekte. Ein
     Fehlgriff dort ist schnell passiert und faellt erst auf, wenn ein
     Beitrag am falschen Ort steht. Dann ist er veroeffentlicht.

     Deshalb entscheidet nicht der Dialog, welches Konto zulaessig ist,
     sondern diese Liste. Sie wird VOR dem Speichern geprueft: ein Konto,
     das nicht daraufsteht, wird nicht gespeichert und damit nie zum
     Publishing-Ziel. */
  const erlaubt = allowedTargets(env);
  const zulaessig = accounts.data.accounts.filter((a) => isAllowedTarget(a, erlaubt));

  if (erlaubt.configured && zulaessig.length === 0) {
    return errorPage("targetNotAllowed",
      `Der Zugang nennt ${accounts.data.accounts.length} Instagram-Konto(en), aber keines ` +
      "davon steht auf der Ziel-Allowlist. Es wurde nichts gespeichert. Zulaessig ist " +
      `ausschliesslich: ${erlaubt.beschreibung}.`,
      400, { "set-cookie": clearCookie },
      { gefunden: accounts.data.accounts.map((a) => ({
        instagramAccountId: a.instagramAccountId,
        instagramUsername: a.instagramUsername,
        pageName: a.pageName
      })), erlaubt: erlaubt.beschreibung });
  }

  const auswahl = erlaubt.configured ? zulaessig : accounts.data.accounts;
  const chosen = auswahl[0];

  /* WELCHES TOKEN GESPEICHERT WIRD.

     Das Seiten-Token ist das bessere: es laeuft nicht ab. Ueber den
     Asset-Weg kommt aber nicht zwingend eines mit — dort ist die Seite
     ein eigenes Asset, und ihre Aufloesung kann fehlschlagen, ohne dass
     die Instagram-Verbindung dadurch unbelegt waere.

     Frueher war das ein harter Abbruch. Das war zu streng: das
     langlebige NUTZER-Token traegt bei einer Business-Anmeldung
     `instagram_content_publish` fuer genau dieses Konto. Es funktioniert
     also — es laeuft nur nach rund 60 Tagen ab.

     Also: Seiten-Token bevorzugen, sonst das Nutzer-Token nehmen UND das
     Ablaufdatum festhalten. Was der Lebendtest gleich prueft, ist genau
     das Token, das danach gespeichert wird — sonst pruefte er etwas
     anderes als das, was spaeter benutzt wird. */
  const tokenArt = chosen.pageAccessToken ? "page" : "user";
  const wirkToken = chosen.pageAccessToken || userToken;

  if (!wirkToken) {
    return errorPage("noUsableToken",
      "Weder ein Seiten-Token noch ein Nutzer-Token steht zur Verfuegung. Es wurde nichts " +
      "gespeichert.", 502, { "set-cookie": clearCookie });
  }

  /* Lebendtest, bevor gespeichert wird. Ein Token, das nicht
     funktioniert, soll gar nicht erst in den Speicher. */
  const probe = await probeAccount(ctx, {
    instagramAccountId: chosen.instagramAccountId, pageAccessToken: wirkToken
  });
  if (!probe.ok) {
    return errorPage(probe.reason,
      `Ein Testabruf des Instagram-Kontos mit dem ${tokenArt === "page" ? "Seiten" : "Nutzer"}-Token ` +
      "schlug fehl: " + (probe.message || "unbekannt") + " Es wurde nichts gespeichert.", 502,
      { "set-cookie": clearCookie });
  }

  const now = new Date().toISOString();
  const record = {
    version: 1,
    connectedAt: now,
    pageId: chosen.pageId,
    pageName: chosen.pageName,
    /* Das wirksame Token — verlaesst den Worker nie. Ein Seiten-Token
       laeuft nicht ab, ein Nutzer-Token nach rund 60 Tagen; welches es
       ist, steht daneben, damit niemand das eine fuer das andere haelt. */
    pageAccessToken: wirkToken,
    tokenType: tokenArt,
    tokenExpiresAt: tokenArt === "page" ? null : (userTokenExpiresAt || null),
    userTokenExpiresAt,
    instagramAccountId: chosen.instagramAccountId,
    instagramUsername: chosen.instagramUsername,
    /* Ueber welchen Weg das Konto gefunden wurde. Steht im Datensatz,
       weil die beiden Wege verschiedene Gewaehr tragen. */
    resolvedVia: accounts.data.source || "meAccounts",
    instagramName: chosen.instagramName,
    permissions: {
      granted: permissions.data.granted,
      declined: permissions.data.declined,
      requested: REQUIRED_SCOPES,
      missing: capabilities.missing
    },
    capabilities,
    ambiguousAccounts: accounts.data.accounts.length > 1
      ? accounts.data.accounts.map((a) => a.instagramAccountId) : null,
    health: { state: "connected", message: "Verbindung hergestellt und mit einem Testabruf bestaetigt." },
    lastSuccessAt: now,
    lastVerifiedAt: now,
    profile: {
      followersCount: probe.data && probe.data.followers_count !== undefined
        ? probe.data.followers_count : null,
      mediaCount: probe.data && probe.data.media_count !== undefined ? probe.data.media_count : null
    }
  };

  await writeConnection(env, record);

  const publicRecord = await readPublic(env);
  const checks = assessConnection(capabilities).map((check) =>
    check.id === "accountResolved" ? Object.assign({}, check, { ok: true }) : check);

  /* Das Nonce-Cookie hat seinen Zweck erfuellt und wird mit derselben
     Antwort geloescht. */
  return successPage(publicRecord, checks, { "set-cookie": clearCookie });
}

async function handleStatus(request, url, env) {
  const { missing, weak } = configProblems(env);
  const publicRecord = env.VU_SOCIAL_KV ? await readPublic(env) : {
    connected: false, state: "not_configured",
    explanation: "Keine KV-Bindung — es kann nichts gespeichert oder gelesen werden."
  };

  return json({
    worker: "vision-universe-social",
    generatedAt: new Date().toISOString(),
    apiVersion: env.META_API_VERSION || DEFAULT_API_VERSION,
    configured: missing.length === 0 && weak.length === 0,
    /* NUR Namen. Niemals Werte (§36). */
    missingConfiguration: missing,
    weakConfiguration: weak,
    connection: publicRecord,
    /* Das Smoke-Protokoll. Es steht hier, weil es sonst nirgends
       ablesbar waere: es liegt in KV, und KV liest nur der Worker.
       Ohne diese Zeile liesse sich nach einem Testbeitrag nicht
       nachpruefen, was gespeichert wurde — man haette die Antwort des
       Aufrufs und sonst nichts.
       Enthaelt Kennungen, Zeitstempel und Fehlergruende. Kein Token. */
    smokePublish: env.VU_SOCIAL_KV ? await readSmokeLog(env) : null,
    /* Was der Testbeitrag OEFFENTLICH zeigen wuerde — aus der Umgebung
       des laufenden Workers, nicht aus der Datei im Repository.

       Der Unterschied ist der ganze Zweck: dass ein Deployment auf einem
       bestimmten Commit lief, belegt noch nicht, was der Worker jetzt
       traegt. Hier steht, was er tatsaechlich schicken wuerde — dieselben
       zwei Werte, die auch der Container bekommt, aus derselben Quelle.

       Beide sind fuer die Veroeffentlichung bestimmt und damit ohnehin
       oeffentlich; hinter dem Admin-Schluessel stehen sie trotzdem, weil
       /status schon dort steht. */
    smokePost: {
      imageUrl: String(env.VU_SOCIAL_SMOKE_IMAGE_URL || "") || null,
      caption: String(env.VU_SOCIAL_SMOKE_CAPTION || "") || null
    }
  });
}

/**
 * Die Verifikation laeuft IM WORKER, nicht beim Aufrufer.
 *
 * Das ist der Kern der Speicherentscheidung: `verify` braucht das Token,
 * und das Token liegt hier. Ein Endpunkt, der das Token herausgibt, damit
 * jemand anders prueft, waere ein Exfiltrationsendpunkt mit guter Absicht.
 *
 * Er veroeffentlicht nichts. Er liest.
 */
async function handleVerify(request, url, env) {
  const record = await readConnection(env);
  if (!record) {
    return json({
      verdict: "NOT_CONNECTED",
      checks: [],
      message: "Es besteht keine Verbindung. Zuerst /social/meta/connect ausfuehren."
    }, 409);
  }

  const ctx = graphContext(env);
  const checks = [];
  const add = (name, result, note) => checks.push({ name, result, note: note || null });

  const probe = await probeAccount(ctx, record);
  if (probe.ok) {
    add("Konto erreichbar", "PASS",
      "@" + (probe.data.username || record.instagramUsername || record.instagramAccountId));
  } else {
    add("Konto erreichbar", "FAIL", probe.message);
  }

  add("Instagram-Professional-Konto erkannt", record.instagramAccountId ? "PASS" : "FAIL",
    record.instagramAccountId ? `ID ${record.instagramAccountId}, Seite ${record.pageId}` : null);

  const granted = (record.permissions && record.permissions.granted) || [];
  const missingScopes = (record.permissions && record.permissions.missing) || [];
  add("Tatsaechliche Rechte", missingScopes.length ? "WARN" : "PASS",
    granted.join(", ") + (missingScopes.length ? " — nicht erteilt: " + missingScopes.join(", ") : ""));

  const caps = record.capabilities || deriveCapabilities(granted, requestedScopes(env));
  add("Publishing Capability", caps.sets.publish.publishImage === "SUPPORTED" ? "PASS" : "FAIL",
    caps.sets.publish.publishImage === "SUPPORTED"
      ? "instagram_content_publish erteilt — nachgewiesen ueber das Recht, nicht ueber einen Testbeitrag"
      : "instagram_content_publish fehlt");

  const insights = await accountInsights(ctx, record);
  if (insights.ok) {
    const names = (insights.data && Array.isArray(insights.data.data))
      ? insights.data.data.map((row) => row.name) : [];
    add("Insights Capability", "PASS", names.join(", ") || "Antwort ohne Kennzahlen");
  } else if (insights.reason === "permissionRevoked") {
    add("Insights Capability", "FAIL", insights.message);
  } else {
    /* Ein frisches Konto ohne Reichweite liefert leere Insights — das ist
       kein Rechteproblem und wird nicht als solches gemeldet. */
    add("Insights Capability", "WARN", insights.message);
  }

  const media = await recentMedia(ctx, record);
  add("Analytics Read", media.ok ? "PASS" : "FAIL",
    media.ok
      ? ((media.data && Array.isArray(media.data.data) ? media.data.data.length : 0) + " Medien lesbar")
      : media.message);

  const failed = checks.filter((c) => c.result === "FAIL");
  const verdict = failed.length === 0 ? "VERIFIED" : "INCOMPLETE";
  const now = new Date().toISOString();

  await updateHealth(env, {
    health: {
      state: verdict === "VERIFIED" ? "connected" : "degraded",
      message: verdict === "VERIFIED"
        ? "Alle Pruefungen bestanden."
        : failed.map((f) => f.name).join(", ") + " fehlgeschlagen."
    },
    lastVerifiedAt: now,
    lastSuccessAt: probe.ok ? now : (record.lastSuccessAt || null)
  });

  return json({
    verdict,
    generatedAt: now,
    provider: "meta",
    account: {
      instagramAccountId: record.instagramAccountId,
      instagramUsername: record.instagramUsername,
      pageId: record.pageId
    },
    permissions: { granted, missing: missingScopes },
    capabilities: caps.sets,
    checks,
    published: false,
    note: "Dieser Lauf veroeffentlicht nichts. Die Publishing-Faehigkeit ist ueber das erteilte " +
          "Recht nachgewiesen, nicht ueber einen Testbeitrag — ein Testbeitrag waere ein echter Beitrag."
  }, verdict === "VERIFIED" ? 200 : 409);
}

async function handleDisconnect(request, url, env) {
  const record = await readConnection(env);
  if (!record) {
    return json({ disconnected: false, message: "Es bestand keine Verbindung." }, 404);
  }

  /* Erst bei Meta widerrufen, dann lokal loeschen. Andersherum bliebe bei
     einem Fehler ein gueltiges Token ohne Datensatz zurueck — also ein
     Zugang, von dem niemand mehr weiss. */
  let revoked = false;
  let revokeMessage = null;
  const attempt = await revokePermissions(graphContext(env), record.pageAccessToken);
  revoked = attempt.ok;
  if (!attempt.ok) revokeMessage = attempt.message;

  await deleteConnection(env);

  const wantsHtml = (request.headers.get("accept") || "").includes("text/html");
  if (wantsHtml) return disconnectedPage(revoked);

  return json({
    disconnected: true,
    revokedAtMeta: revoked,
    message: revoked
      ? "Verbindung getrennt, Datensatz geloescht, Rechte bei Meta widerrufen."
      : "Verbindung getrennt und Datensatz geloescht. Der Widerruf bei Meta konnte nicht " +
        "bestaetigt werden (" + (revokeMessage || "unbekannt") + "). Bitte die Berechtigung " +
        "zusaetzlich in den Meta-Einstellungen entfernen."
  });
}

/* Lebendtest. Absichtlich ohne Zustand und ohne Kontodaten: er beantwortet
   "laeuft der Worker", nicht "wer ist verbunden". */
function handleHealth(env) {
  const { missing, weak } = configProblems(env);
  return json({
    worker: "vision-universe-social",
    alive: true,
    configured: missing.length === 0 && weak.length === 0,
    missingConfiguration: missing,
    weakConfiguration: weak,
    /* Welcher Meta-Dialog gilt. Ohne Schluessel ablesbar, weil genau das
       die Frage ist, die man von aussen beantworten koennen muss, wenn
       der Dialog die Redirect-URI ablehnt: schickt dieser Worker
       ueberhaupt die Business-Anmeldung? Die Konfigurations-ID selbst
       steht hier nicht — sie ist zwar kein Geheimnis, aber sie gehoert
       auch nicht in eine offene Antwort. */
    loginMode: loginMode(env.META_LOGIN_CONFIG_ID),

    /* WELCHE FASSUNG HIER ANTWORTET.
       ----------------------------------------------------------------
       Ein Deployment gilt nicht in derselben Sekunde ueberall. Drei Mal
       in diesem Projekt hat ein Schritt unmittelbar nach dem Deploy die
       ALTE Fassung erwischt und ihr Ergebnis fuer das neue gehalten —
       einmal fehlte ein Feld, einmal ein Endpunkt, einmal rechnete ein
       Budget mit einer veralteten Zahl. Jedes Mal antwortete die alte
       Fassung brav mit HTTP 200, und auf einen Statuscode zu warten half
       deshalb nicht.
     
       Diese Zeile beendet die Fehlerklasse: der Aufrufer wartet, bis
       hier der Commit steht, den er gerade deployt hat. Kein Statuscode,
       keine Zeitspanne — die Identitaet der Fassung. */
    build: env.VU_SOCIAL_BUILD || null
  });
}

/* ------------------------------------------------------------------ */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    try {
      if (path === "/health") return handleHealth(env);

      /* Der Callback traegt keinen Admin-Schluessel — Meta wuerde ihn
         nicht mitschicken. Er ist durch state und Cookie geschuetzt. */
      if (path === "/social/meta/callback") {
        if (request.method !== "GET") return json({ error: "methodNotAllowed" }, 405);
        return await handleCallback(request, url, env);
      }

      const auth = requireAdmin(request, url, env);
      if (!auth.ok) return auth.response;

      if (path === "/social/meta/connect") {
        if (request.method !== "GET") return json({ error: "methodNotAllowed" }, 405);
        return await handleConnect(request, url, env);
      }
      if (path === "/social/meta/status") {
        if (request.method !== "GET") return json({ error: "methodNotAllowed" }, 405);
        return await handleStatus(request, url, env);
      }
      if (path === "/social/meta/verify") {
        if (request.method !== "GET" && request.method !== "POST") {
          return json({ error: "methodNotAllowed" }, 405);
        }
        return await handleVerify(request, url, env);
      }
      if (path === "/social/meta/disconnect") {
        /* Nur POST: ein Trennen per GET waere ueber einen untergeschobenen
           Link ausloesbar. */
        if (request.method !== "POST") {
          return json({
            error: "methodNotAllowed",
            message: "Trennen nur per POST — ein GET waere ueber einen Link ausloesbar."
          }, 405);
        }
        return await handleDisconnect(request, url, env);
      }
      if (path === "/social/meta/smoke-publish") {
        /* Nur POST. Ein GET waere ueber einen untergeschobenen Link
           ausloesbar — und das Ergebnis waere ein oeffentlicher Beitrag. */
        if (request.method !== "POST") {
          return json({
            error: "methodNotAllowed",
            message: "Veroeffentlichen nur per POST — ein GET waere ueber einen Link ausloesbar.",
            published: false
          }, 405);
        }
        return await handleSmokePublish(request, url, env);
      }
      if (path === "/social/meta/insights") {
        /* Lesend. GET genuegt, weil nichts entsteht — im Gegensatz zu
           allem, was einen Beitrag erzeugt. */
        if (request.method !== "GET") return json({ error: "methodNotAllowed" }, 405);
        return await handleInsights(request, url, env);
      }
      if (path === "/" || path === "/social" || path === "/social/meta") {
        const publicRecord = env.VU_SOCIAL_KV ? await readPublic(env) : { connected: false };
        return indexPage(publicRecord);
      }

      return json({ error: "notFound", path }, 404);
    } catch (err) {
      /* Ein unerwarteter Fehler darf nichts verraten. Die Meldung laeuft
         durch dieselbe Bereinigung wie alles andere. */
      return json({
        error: "internalError",
        message: redactText(String(err && err.message).slice(0, 200),
          [env && env.META_APP_SECRET, env && env.VU_SOCIAL_ADMIN_KEY])
      }, 500);
    }
  }
};

/* Fuer die Tests: die Bausteine einzeln pruefbar halten. */
export const __internals = {
  configProblems, redirectUri, requireAdmin, extractAdminKey,
  handleConnect, handleCallback, handleStatus, handleVerify, handleDisconnect,
  MIN_ADMIN_KEY_LENGTH
};
