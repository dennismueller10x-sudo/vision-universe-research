/* =========================================================================
   vision-universe-social — src/graph.js
   DER EINZIGE ORT IM WORKER MIT META-KENNTNIS

   Dieselbe Schichtung wie in social/providers/meta/adapter.js und aus
   demselben Grund: oberhalb dieser Datei gibt es keine Meta-Fehlercodes,
   keine Graph-Feldnamen und keine Vendor-Payloads.

   -------------------------------------------------------------------------
   WARUM DAS PAGE-TOKEN UND NICHT DAS USER-TOKEN GESPEICHERT WIRD
   -------------------------------------------------------------------------

   Ein langlebiges USER-Token laeuft nach rund 60 Tagen ab. Ein
   PAGE-Token, das aus einem langlebigen User-Token abgeleitet wurde,
   laeuft nicht ab, solange der Nutzer die Berechtigung nicht entzieht und
   sein Passwort nicht aendert.

   Instagram-Veroeffentlichung und -Insights laufen ohnehin ueber das
   Page-Token. Deshalb: User-Token besorgen, Page-Token daraus ableiten,
   Page-Token speichern, User-Token verwerfen.

   Das ist der Unterschied zwischen "alle 60 Tage neu autorisieren" und
   "einmal autorisieren".
   ========================================================================= */

import { redactText } from "./redact.js";

const GRAPH_HOST = "https://graph.facebook.com";
export const DEFAULT_API_VERSION = "v21.0";

/* Die Rechte, die das System tatsaechlich braucht — nicht mehr (§9.4). */
export const REQUIRED_SCOPES = [
  "instagram_basic",
  "instagram_content_publish",
  "instagram_manage_insights",
  "instagram_manage_comments",
  "pages_show_list",
  "pages_read_engagement"
];

/** appsecret_proof: HMAC-SHA256 des Tokens mit dem App-Secret. */
export async function appSecretProof(token, appSecret) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(String(appSecret)),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(String(token)));
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function ok(data) { return { ok: true, reason: null, data, message: null }; }

function fail(reason, message, extra = {}) {
  return Object.assign({ ok: false, reason, data: null, message }, extra);
}

/**
 * Bildet einen Meta-Fehler auf einen kanonischen Grund ab.
 * Oberhalb dieser Funktion existiert kein Meta-Code mehr.
 */
function classify(status, error, message) {
  const code = Number(error && error.code);
  const subcode = Number(error && error.error_subcode);

  if (code === 190 || subcode === 463 || subcode === 467) {
    return fail("tokenExpired", "Das Zugangstoken ist abgelaufen oder ungueltig. " + message);
  }
  if (code === 10 || code === 200 || code === 3 || subcode === 458 || subcode === 459) {
    return fail("permissionRevoked", "Die noetige Berechtigung fehlt oder wurde entzogen. " + message);
  }
  if (code === 4 || code === 17 || code === 32 || code === 613 || code === 80007) {
    return fail("rateLimited", "Ratenbegrenzung der Plattform erreicht. " + message,
      { retryable: true, retryAfterSeconds: 900 });
  }
  if (code === 1 || code === 2 || status >= 500) {
    return fail("providerOutage", "Die Plattform meldet einen voruebergehenden Fehler. " + message,
      { retryable: true, retryAfterSeconds: 300 });
  }
  if (code === 9004 || code === 2207026 || code === 36003) {
    return fail("invalidMedia", "Das Medium wurde abgelehnt. " + message);
  }
  return fail("providerError", message);
}

/**
 * Ein Graph-Aufruf.
 *
 * @param ctx { apiVersion, appSecret, fetchImpl }
 */
export async function graph(ctx, path, params = {}, token = null, init = {}) {
  const fetchImpl = ctx.fetchImpl || fetch;
  const url = new URL(`${GRAPH_HOST}/${ctx.apiVersion || DEFAULT_API_VERSION}/${String(path).replace(/^\//, "")}`);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }
  if (token) {
    url.searchParams.set("access_token", token);
    if (ctx.appSecret) url.searchParams.set("appsecret_proof", await appSecretProof(token, ctx.appSecret));
  }

  let response;
  try {
    response = await fetchImpl(url.toString(), init);
  } catch (err) {
    return fail("networkError", "Netzwerkfehler beim Graph-Aufruf: " +
      redactText(String(err && err.message).slice(0, 200), [ctx.appSecret, token]),
      { retryable: true, retryAfterSeconds: 30 });
  }

  let text = "";
  try { text = await response.text(); } catch (err) { text = ""; }

  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch (err) { body = null; }

  if (response.ok && body && !body.error) return ok(body);

  const error = (body && body.error) || {};
  /* Die Meldung wird HIER bereinigt und nicht erst beim Ausgeben: Meta
     spiegelt regelmaessig den gesamten Request zurueck. */
  const message = redactText(error.message || text || `HTTP ${response.status}`,
    [ctx.appSecret, token]);
  return classify(response.status, error, message);
}

/* ------------------------------------------------------------------ OAuth */

/**
 * Der Autorisierungsdialog. Ohne `state` gibt es keinen Link.
 *
 * -----------------------------------------------------------------------
 * ZWEI DIALOGE, NICHT EINER
 * -----------------------------------------------------------------------
 *
 * Meta hat zwei verschiedene Anmeldungen, die dieselbe Adresse benutzen:
 *
 *   Facebook Login (klassisch)     — die Rechte stehen in `scope`
 *   Facebook Login for Business    — die Rechte stehen in einer
 *                                    Konfiguration, und die Adresse
 *                                    nennt nur deren `config_id`
 *
 * Bei der Business-Anmeldung darf `scope` NICHT mitgeschickt werden:
 * `config_id` ersetzt es. Wer beides schickt, beschreibt zwei
 * verschiedene Rechtemengen und bekommt keine davon.
 *
 * `override_default_response_type=true` gehoert dazu: die Konfiguration
 * bringt eine eigene Vorgabe fuer den Antworttyp mit. Ohne dieses Flag
 * gewinnt sie, und wenn sie auf `token` steht, kommt das Token im
 * URL-Fragment zurueck — dort, wo ein Server es nie zu sehen bekommt.
 * Der Callback saehe dann eine Anfrage ohne `code` und koennte nur
 * melden, dass Parameter fehlen. Mit dem Flag gilt, was hier steht.
 *
 * Welcher der beiden Wege gilt, entscheidet allein, ob eine
 * Konfigurations-ID hinterlegt ist. Sie ist kein Geheimnis.
 */
export function authorizationUrl(ctx, { appId, redirectUri, state, scopes, configId }) {
  const url = new URL(`https://www.facebook.com/${ctx.apiVersion || DEFAULT_API_VERSION}/dialog/oauth`);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");

  const id = configId === undefined || configId === null ? "" : String(configId).trim();
  if (id) {
    url.searchParams.set("config_id", id);
    url.searchParams.set("override_default_response_type", "true");
  } else {
    url.searchParams.set("scope", (scopes && scopes.length ? scopes : REQUIRED_SCOPES).join(","));
  }
  return url.toString();
}

/** Welcher Dialog gilt — ablesbar, ohne den Dialog zu oeffnen. */
export function loginMode(configId) {
  const id = configId === undefined || configId === null ? "" : String(configId).trim();
  return id ? "business" : "classic";
}

/** Autorisierungscode gegen ein kurzlebiges User-Token. */
export async function exchangeCode(ctx, { appId, appSecret, redirectUri, code }) {
  const result = await graph(ctx, "oauth/access_token", {
    client_id: appId, client_secret: appSecret, redirect_uri: redirectUri, code
  });
  if (!result.ok) return result;
  if (!result.data || !result.data.access_token) {
    return fail("exchangeFailed", "Die Plattform hat kein Token geliefert.");
  }
  return ok({ token: result.data.access_token, expiresIn: Number(result.data.expires_in) || null });
}

/** Kurzlebiges User-Token gegen ein langlebiges (rund 60 Tage). */
export async function exchangeForLongLived(ctx, { appId, appSecret, token }) {
  const result = await graph(ctx, "oauth/access_token", {
    grant_type: "fb_exchange_token", client_id: appId, client_secret: appSecret,
    fb_exchange_token: token
  });
  if (!result.ok) return result;
  if (!result.data || !result.data.access_token) {
    return fail("exchangeFailed", "Kein langlebiges Token erhalten.");
  }
  return ok({ token: result.data.access_token, expiresIn: Number(result.data.expires_in) || null });
}

/* ------------------------------------------------------------ Aufloesung */

/**
 * Loest Facebook-Seiten und das daran haengende
 * Instagram-Professional-Konto auf — und gibt je Seite das PAGE-TOKEN
 * zurueck, mit dem spaeter gearbeitet wird.
 */
/**
 * Findet die Instagram-Konten hinter den Seiten dieses Zugangs.
 *
 * `grantedScopes` ist nicht optional aus Bequemlichkeit, sondern weil
 * ohne sie zwei voellig verschiedene Lagen gleich aussehen:
 *
 *   /me/accounts ohne `pages_show_list` liefert 200 und eine LEERE
 *   Liste — keinen Fehler. Genau dasselbe liefert ein Zugang, dessen
 *   Seiten kein Instagram-Konto haben.
 *
 * Ohne diese Unterscheidung schickt die Meldung den Owner in die
 * Business-Suite, um eine Verbindung zu reparieren, die in Ordnung ist,
 * waehrend die eigentliche Ursache eine Zeile in der
 * Login-Konfiguration ist.
 */
export async function resolveAccounts(ctx, userToken, grantedScopes) {
  const result = await graph(ctx, "me/accounts", {
    fields: "id,name,access_token,instagram_business_account{id,username,name}"
  }, userToken);
  if (!result.ok) return result;

  const rows = (result.data && Array.isArray(result.data.data)) ? result.data.data : [];
  const connected = rows
    .filter((page) => page.instagram_business_account && page.instagram_business_account.id)
    .map((page) => ({
      pageId: page.id,
      pageName: page.name || null,
      pageAccessToken: page.access_token || null,     /* bleibt im Worker */
      instagramAccountId: page.instagram_business_account.id,
      instagramUsername: page.instagram_business_account.username || null,
      instagramName: page.instagram_business_account.name || null
    }));

  /* Erst die Erlaubnis, dann die Einrichtung. Die Reihenfolge ist der
     ganze Punkt: fehlt das Recht, ist ueber die Einrichtung nichts
     ausgesagt — wir haben sie gar nicht sehen koennen. */
  const granted = Array.isArray(grantedScopes) ? grantedScopes : null;
  if (rows.length === 0 && granted && !granted.includes("pages_show_list")) {
    return fail("missingPagePermission",
      "Dieser Zugang darf keine Seitenliste lesen: das Recht `pages_show_list` wurde nicht " +
      "erteilt. Ohne es liefert die Plattform eine leere Liste — nicht, weil keine Seite da " +
      "waere, sondern weil keine gezeigt werden darf. Ueber die Instagram-Verbindung ist damit " +
      "nichts gesagt; sie wurde nicht geprueft. Bei einer Business-Anmeldung stehen die Rechte " +
      "in der Login-Konfiguration bei Meta, nicht in dieser Anfrage.");
  }

  if (connected.length === 0) {
    return fail("noInstagramAccount",
      "Keine Facebook-Seite dieses Zugangs hat ein verbundenes Instagram-Professional-Konto. " +
      "Das ist eine Einrichtungsfrage in Meta und kein Fehler des Abrufs: In der Meta-Business-Suite " +
      "muss das Instagram-Konto ein Professional-Konto sein UND mit einer Seite verbunden, " +
      "auf die dieser Zugang Rechte hat.");
  }
  if (rows.length > 0 && connected.length < rows.length) {
    return ok({ accounts: connected, pagesWithoutInstagram: rows.length - connected.length });
  }
  return ok({ accounts: connected, pagesWithoutInstagram: 0 });
}

/** Die tatsaechlich erteilten Rechte — nicht die angefragten. */
export async function fetchPermissions(ctx, userToken) {
  const result = await graph(ctx, "me/permissions", {}, userToken);
  if (!result.ok) return result;
  const rows = (result.data && Array.isArray(result.data.data)) ? result.data.data : [];
  return ok({
    granted: rows.filter((r) => r.status === "granted").map((r) => r.permission),
    declined: rows.filter((r) => r.status !== "granted").map((r) => r.permission)
  });
}

/** Ein leichter Lebendtest fuer das gespeicherte Page-Token. */
export async function probeAccount(ctx, { instagramAccountId, pageAccessToken }) {
  return graph(ctx, String(instagramAccountId), {
    fields: "id,username,followers_count,media_count"
  }, pageAccessToken);
}

/** Kontokennzahlen — lesend, erzeugt nichts. */
export async function accountInsights(ctx, { instagramAccountId, pageAccessToken, period = "day" }) {
  return graph(ctx, `${instagramAccountId}/insights`, {
    metric: "impressions,reach,profile_views", period
  }, pageAccessToken);
}

/** Die letzten Medien — Nachweis fuer Lesezugriff, ohne etwas zu erzeugen. */
export async function recentMedia(ctx, { instagramAccountId, pageAccessToken, limit = 3 }) {
  return graph(ctx, `${instagramAccountId}/media`, {
    fields: "id,permalink,timestamp,media_type", limit
  }, pageAccessToken);
}

/** Widerruf der erteilten Rechte. */
export async function revokePermissions(ctx, userToken) {
  return graph(ctx, "me/permissions", {}, userToken, { method: "DELETE" });
}

export { ok as graphOk, fail as graphFail };
