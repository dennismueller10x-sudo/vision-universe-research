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
  fetchPermissions, probeAccount, accountInsights, recentMedia, revokePermissions,
  REQUIRED_SCOPES, DEFAULT_API_VERSION
} from "./graph.js";
import { deriveCapabilities, assessConnection } from "./capabilities.js";
import { readConnection, writeConnection, deleteConnection, readPublic, updateHealth } from "./store.js";
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

  const accounts = await resolveAccounts(ctx, userToken, permissions.data.granted);
  if (!accounts.ok) {
    return errorPage(accounts.reason, accounts.message || "Kontoaufloesung fehlgeschlagen.",
      accounts.reason === "noInstagramAccount" ? 400 : 502, { "set-cookie": clearCookie });
  }

  /* Bei mehreren Konten: entweder das konfigurierte, sonst das erste —
     und die Mehrdeutigkeit wird im Datensatz vermerkt, nicht verschwiegen. */
  const preferred = env.META_IG_ACCOUNT_ID
    ? accounts.data.accounts.find((a) => a.instagramAccountId === String(env.META_IG_ACCOUNT_ID))
    : null;
  if (env.META_IG_ACCOUNT_ID && !preferred) {
    return errorPage("accountMismatch",
      "Der Zugang hat Instagram-Konten, aber keines davon ist das konfigurierte " +
      "(META_IG_ACCOUNT_ID). Es wurde nichts gespeichert.", 400, { "set-cookie": clearCookie });
  }
  const chosen = preferred || accounts.data.accounts[0];

  if (!chosen.pageAccessToken) {
    return errorPage("noPageToken",
      "Fuer die gewaehlte Seite wurde kein Seiten-Token geliefert. Ohne dieses Token laesst sich " +
      "Instagram nicht bedienen.", 502, { "set-cookie": clearCookie });
  }

  /* Lebendtest mit dem PAGE-Token, bevor es gespeichert wird. Ein Token,
     das nicht funktioniert, soll gar nicht erst in den Speicher. */
  const probe = await probeAccount(ctx, {
    instagramAccountId: chosen.instagramAccountId, pageAccessToken: chosen.pageAccessToken
  });
  if (!probe.ok) {
    return errorPage(probe.reason,
      "Das Seiten-Token wurde ausgestellt, aber ein Testabruf des Instagram-Kontos schlug fehl: " +
      (probe.message || "unbekannt") + " Es wurde nichts gespeichert.", 502,
      { "set-cookie": clearCookie });
  }

  const now = new Date().toISOString();
  const record = {
    version: 1,
    connectedAt: now,
    pageId: chosen.pageId,
    pageName: chosen.pageName,
    /* Das PAGE-Token — laeuft nicht ab und verlaesst den Worker nie. */
    pageAccessToken: chosen.pageAccessToken,
    tokenExpiresAt: null,
    userTokenExpiresAt,
    instagramAccountId: chosen.instagramAccountId,
    instagramUsername: chosen.instagramUsername,
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
    connection: publicRecord
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
    loginMode: loginMode(env.META_LOGIN_CONFIG_ID)
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
