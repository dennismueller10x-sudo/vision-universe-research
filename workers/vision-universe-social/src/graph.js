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

  /* Die Rohdaten des Fehlers reisen mit. `classify` bildet auf einen
     kanonischen Grund ab — das ist richtig fuer die Entscheidung, aber
     zu wenig fuer eine Diagnose: ohne `code`, `error_subcode` und
     `fbtrace_id` ist eine Ruecksprache mit dem Meta-Support wertlos,
     und ohne sie laesst sich auch nicht nachlesen, welcher der vielen
     Faelle hinter einem Grund eingetreten ist.
     Kein Token: `message` ist bereits geschwaerzt, die uebrigen Felder
     sind Zahlen und Kennungen. */
  return Object.assign(classify(response.status, error, message), {
    httpStatus: response.status,
    metaCode: error.code === undefined ? null : error.code,
    metaSubcode: error.error_subcode === undefined ? null : error.error_subcode,
    metaType: error.type || null,
    fbtraceId: error.fbtrace_id || null
  });
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

/* ------------------------------------------------------------------ */
/* WELCHE ASSETS HAT DER NUTZER TATSAECHLICH AUSGEWAEHLT              */
/* ------------------------------------------------------------------ */

/**
 * Liest die granularen Scopes des Tokens.
 *
 * Bei einer Business-Anmeldung waehlt der Nutzer im Dialog einzelne
 * Seiten und Konten aus. Welche das waren, steht NICHT im Token und
 * nicht in /me/permissions — dort steht nur, WELCHE Rechte erteilt
 * wurden, nicht FUER WELCHE Assets.
 *
 * `granular_scopes` beantwortet genau das: pro Recht eine Liste von
 * `target_ids`. Das ist der dokumentierte Weg, und er ist hier
 * entscheidend: er trennt "der Nutzer hat die Seite gar nicht
 * freigegeben" von "die Seite ist frei, aber /me/accounts zeigt sie
 * nicht".
 *
 * Braucht ein App-Token (`<app-id>|<app-secret>`). Das ist kein
 * zusaetzliches Recht — es ist dasselbe Geheimnis, das der Worker
 * ohnehin fuer den Code-Tausch benutzt.
 */
export async function debugToken(ctx, { appId, appSecret, inputToken }) {
  const result = await graph(ctx, "debug_token", {
    input_token: inputToken,
    access_token: `${appId}|${appSecret}`
  });
  if (!result.ok) return result;

  const data = (result.data && result.data.data) || {};
  const granular = Array.isArray(data.granular_scopes) ? data.granular_scopes : [];
  return ok({
    scopes: Array.isArray(data.scopes) ? data.scopes : [],
    /* Nur Recht und Ziel-IDs — keine Tokens, keine Nutzerdaten. */
    granular: granular.map((entry) => ({
      scope: String(entry.scope || ""),
      targetIds: Array.isArray(entry.target_ids) ? entry.target_ids.map(String) : null
    }))
  });
}

/**
 * Fragt die API, ueber WELCHES Feld eine Seite ihr Instagram-Konto
 * nennt — statt es zu raten.
 *
 * Der Grund fuer diese Umstaendlichkeit: `instagram_business_account`
 * ist das Feld, das die Dokumentation nennt, aber es ist nicht das
 * einzige, ueber das eine Seite mit einem Instagram-Konto verbunden
 * sein kann. Welches im konkreten Fall gefuellt ist, haengt daran, WIE
 * die Verknuepfung entstanden ist — und das laesst sich von aussen
 * nicht ansehen.
 *
 * Jedes Feld wird EINZELN abgefragt. Ein Feld, das diese API-Version
 * nicht kennt oder das dieser Zugang nicht lesen darf, wuerde in einer
 * Sammelabfrage die ganze Antwort kippen; einzeln kostet es nur eine
 * Fehlermeldung, die wir protokollieren.
 *
 * Diese Funktion urteilt nicht. Sie berichtet, was die API sagt.
 */
const LINKAGE_FIELDS = [
  "instagram_business_account",
  "connected_instagram_account",
  "page_backed_instagram_accounts"
];

export async function probePageLinkage(ctx, pageId, token) {
  const findings = [];
  for (const field of LINKAGE_FIELDS) {
    const result = await graph(ctx, String(pageId), { fields: `${field}{id,username}` }, token);
    if (!result.ok) {
      findings.push({ field, readable: false, note: String(result.message || "").slice(0, 120) });
      continue;
    }
    const value = result.data ? result.data[field] : null;
    /* page_backed_instagram_accounts ist eine Liste, die anderen sind Objekte. */
    const node = Array.isArray(value && value.data) ? (value.data[0] || null) : value;
    findings.push({
      field,
      readable: true,
      present: Boolean(node && node.id),
      instagramAccountId: node && node.id ? String(node.id) : null,
      instagramUsername: node && node.username ? String(node.username) : null
    });
  }
  return findings;
}


/**
 * Was von einer Seitenzeile berichtet werden darf.
 *
 * Ausdruecklich OHNE `access_token`: die Zeilen aus /me/accounts tragen
 * je ein Page-Token, und dieser Bericht landet auf einer Seite im
 * Browser des Owners. Deshalb wird hier aufgezaehlt, was mitkommt,
 * statt auszuschliessen, was nicht mitkommen soll — eine Positivliste
 * vergisst nichts, wenn die API spaeter ein Feld hinzufuegt.
 */
function pageReport(rows) {
  return rows.map((page) => ({
    pageId: page.id ? String(page.id) : null,
    pageName: page.name || null,
    hasInstagramBusinessAccount: Boolean(page.instagram_business_account &&
      page.instagram_business_account.id),
    instagramAccountId: (page.instagram_business_account && page.instagram_business_account.id)
      ? String(page.instagram_business_account.id) : null,
    instagramUsername: (page.instagram_business_account && page.instagram_business_account.username)
      ? String(page.instagram_business_account.username) : null
  }));
}

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

  /* ZWEI LAGEN, DIE BISHER DENSELBEN NAMEN TRUGEN.
     `noInstagramAccount` hat frueher beides gemeldet: "gar keine Seite
     sichtbar" und "Seite sichtbar, aber ohne Instagram". Das sind
     voellig verschiedene Ursachen mit verschiedenen Loesungen, und die
     gemeinsame Meldung hat sie ununterscheidbar gemacht. */
  if (rows.length === 0) {
    return fail("noPagesVisible",
      "Dieser Zugang sieht KEINE einzige Facebook-Seite — die Seitenliste ist leer, obwohl " +
      "das Recht `pages_show_list` erteilt wurde. Ueber die Instagram-Verbindung ist damit " +
      "nichts gesagt: es gab nichts, woran sie haette haengen koennen. Zu pruefen ist, ob " +
      "die Seite im Business-Login-Dialog tatsaechlich ausgewaehlt wurde — die granularen " +
      "Scopes im Bericht sagen, welche Assets der Zugang nennt.",
      { pages: pageReport(rows) });
  }

  if (connected.length === 0) {
    return fail("noInstagramAccount",
      "Die Seitenliste ist NICHT leer, aber keine der sichtbaren Seiten nennt ein " +
      "Instagram-Konto im Feld `instagram_business_account`. Das heisst nicht zwingend, " +
      "dass keine Verbindung besteht: eine Seite kann ihr Instagram-Konto ueber ein anderes " +
      "Feld fuehren, je nachdem wie die Verknuepfung entstanden ist. Der Bericht nennt, was " +
      "die API pro Feld tatsaechlich geantwortet hat.",
      { pages: pageReport(rows) });
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

/* ------------------------------------------------------------------ */
/* DER BUSINESS-LOGIN-PFAD                                             */
/* ------------------------------------------------------------------ */

/**
 * Die drei Rechte, die dasselbe Instagram-Konto nennen muessen.
 *
 * Sie stehen hier zusammen, weil ihre Uebereinstimmung die eigentliche
 * Pruefung ist: drei unabhaengig erteilte Rechte, die auf dieselbe ID
 * zeigen, sind ein Beleg. Eine ID aus einem einzelnen Recht waere nur
 * eine Behauptung.
 */
const IG_ASSET_SCOPES = [
  "instagram_basic",
  "instagram_manage_insights",
  "instagram_content_publish"
];

const PAGE_ASSET_SCOPE = "pages_show_list";

/**
 * Liest die autorisierten Assets aus den granularen Scopes.
 *
 * -----------------------------------------------------------------------
 * WARUM DIESER WEG UEBERHAUPT GEBRAUCHT WIRD
 * -----------------------------------------------------------------------
 *
 * `/me/accounts` zaehlt die Seiten auf, die der angemeldete Mensch als
 * Person verwaltet. Beim Business Login mit gezielter Asset-Auswahl
 * entsteht der Zugriff aber nicht ueber diese persoenliche Liste,
 * sondern als Freigabe am Token — und dann bleibt `/me/accounts` leer,
 * obwohl Seite und Konto freigegeben sind.
 *
 * Real beobachtet am 2026-09-16: `pages: []`, waehrend `granular_scopes`
 * sowohl die Seite als auch das Instagram-Konto mit konkreten
 * `target_ids` nannte.
 *
 * -----------------------------------------------------------------------
 * WARUM NICHT EINFACH DIE ID UEBERNOMMEN WIRD
 * -----------------------------------------------------------------------
 *
 * Eine `target_id` ist eine Zahl aus einer Antwort. Sie sagt, dass IRGEND
 * etwas freigegeben wurde — nicht, dass es das richtige Konto ist, nicht
 * einmal, dass es ein Instagram-Konto ist. Deshalb:
 *
 *   1. muessen alle drei Instagram-Rechte DIESELBE Menge nennen,
 *   2. wird die ID danach bei der API gegengeprueft,
 *   3. und der Handle gegen die Allowlist gehalten.
 *
 * Bei jeder Abweichung: nichts speichern.
 */
export function assetsFromGranularScopes(granular) {
  const eintraege = Array.isArray(granular) ? granular : [];
  const nach = (scope) => eintraege.find((e) => e.scope === scope) || null;

  const fehlend = IG_ASSET_SCOPES.filter((s) => {
    const e = nach(s);
    return !e || !Array.isArray(e.targetIds) || e.targetIds.length === 0;
  });
  if (fehlend.length) {
    return fail("assetScopesIncomplete",
      "Die granularen Scopes nennen kein vollstaendiges Instagram-Asset. Ohne Ziel-IDs bei " +
      fehlend.join(", ") + " laesst sich nicht belegen, WELCHES Konto autorisiert wurde. " +
      "Es wird nichts gespeichert.",
      { missingAssetScopes: fehlend });
  }

  /* Drei Mengen, die identisch sein muessen. Sortiert verglichen, damit
     die Reihenfolge in der Antwort keine Rolle spielt. */
  const mengen = IG_ASSET_SCOPES.map((s) => [...new Set(nach(s).targetIds.map(String))].sort());
  const referenz = mengen[0].join(",");
  const abweichend = IG_ASSET_SCOPES.filter((s, i) => mengen[i].join(",") !== referenz);

  if (abweichend.length) {
    return fail("assetScopesInconsistent",
      "Die Instagram-Rechte nennen NICHT dasselbe Konto. " +
      IG_ASSET_SCOPES.map((s, i) => `${s} -> [${mengen[i].join(", ")}]`).join(" · ") +
      ". Bei einer solchen Abweichung wird nichts gespeichert: welches der genannten Konten " +
      "gemeint ist, liesse sich nur raten.",
      { instagramTargetsByScope: Object.fromEntries(IG_ASSET_SCOPES.map((s, i) => [s, mengen[i]])) });
  }

  const seiten = nach(PAGE_ASSET_SCOPE);
  return ok({
    instagramAccountIds: mengen[0],
    pageIds: (seiten && Array.isArray(seiten.targetIds)) ? [...new Set(seiten.targetIds.map(String))] : [],
    /* Die Seite ist ein EIGENES Asset. Sie wird getrennt behandelt und
       ist nicht die Quelle der Instagram-ID. */
    pageScopePresent: Boolean(seiten)
  });
}

/**
 * Bestaetigt bei der API, dass hinter einer ID wirklich das
 * Instagram-Professional-Konto steht.
 *
 * Ohne diesen Schritt waere die Allowlist wertlos: sie prueft einen
 * Handle, und der Handle kaeme sonst aus derselben Antwort, die man
 * gerade pruefen will.
 */
export async function validateInstagramAsset(ctx, instagramAccountId, token) {
  const result = await graph(ctx, String(instagramAccountId),
    { fields: "id,username,name" }, token);
  if (!result.ok) return result;

  const data = result.data || {};
  if (!data.id || String(data.id) !== String(instagramAccountId)) {
    return fail("assetIdentityMismatch",
      "Die API antwortet unter dieser ID mit einer anderen ID. Es wird nichts gespeichert.");
  }
  if (!data.username) {
    return fail("assetNotInstagram",
      "Unter dieser ID liefert die API keinen Instagram-Handle. Ein Konto ohne `username` ist " +
      "kein Instagram-Professional-Konto — es wird nichts gespeichert.");
  }
  return ok({
    instagramAccountId: String(data.id),
    instagramUsername: String(data.username),
    instagramName: data.name ? String(data.name) : null
  });
}

/** Holt Name und Seiten-Token zu einer autorisierten Seite. */
export async function resolvePageAsset(ctx, pageId, token) {
  const result = await graph(ctx, String(pageId), { fields: "id,name,access_token" }, token);
  if (!result.ok) return result;
  const data = result.data || {};
  return ok({
    pageId: String(data.id || pageId),
    pageName: data.name || null,
    pageAccessToken: data.access_token || null
  });
}

/**
 * Loest die Verbindung ueber die autorisierten Assets auf.
 *
 * Reihenfolge und Begruendung:
 *
 *   1. Assets aus den granularen Scopes lesen und auf Konsistenz pruefen
 *   2. jede Instagram-ID bei der API gegenpruefen (Handle holen)
 *   3. die Seite getrennt aufloesen — sie liefert das Seiten-Token,
 *      NICHT die Instagram-ID
 *
 * Schritt 3 ist bewusst nachrangig: schlaegt er fehl, ist die
 * Instagram-Verbindung trotzdem belegt. Das Seiten-Token ist dann nicht
 * verfuegbar, und der Aufrufer entscheidet, ob er mit dem
 * Nutzer-Token weiterarbeitet. Eine fehlende Seite darf ein belegtes
 * Konto nicht entwerten.
 */
export async function resolveAccountsFromAssets(ctx, userToken, granular) {
  const assets = assetsFromGranularScopes(granular);
  if (!assets.ok) return assets;

  const konten = [];
  for (const id of assets.data.instagramAccountIds) {
    const geprueft = await validateInstagramAsset(ctx, id, userToken);
    if (!geprueft.ok) {
      /* Fail closed: eine ID, die sich nicht bestaetigen laesst, wird
         nicht stillschweigend uebersprungen. Sie stand in einem
         erteilten Recht — wenn die API sie nicht kennt, stimmt etwas
         nicht, und das gehoert gemeldet statt weggelassen. */
      return fail("assetValidationFailed",
        `Die autorisierte Instagram-ID ${id} liess sich nicht bestaetigen: ` +
        (geprueft.message || geprueft.reason) + " Es wird nichts gespeichert.",
        { instagramAccountId: String(id) });
    }
    konten.push(geprueft.data);
  }

  /* Die Seite: ein eigenes Asset, eigene Aufloesung. */
  let seite = { pageId: null, pageName: null, pageAccessToken: null };
  const ersteSeite = assets.data.pageIds[0] || null;
  if (ersteSeite) {
    const aufgeloest = await resolvePageAsset(ctx, ersteSeite, userToken);
    if (aufgeloest.ok) seite = aufgeloest.data;
    else seite = { pageId: String(ersteSeite), pageName: null, pageAccessToken: null };
  }

  return ok({
    source: "granularScopes",
    accounts: konten.map((k) => Object.assign({
      pageId: seite.pageId,
      pageName: seite.pageName,
      pageAccessToken: seite.pageAccessToken
    }, k)),
    pagesWithoutInstagram: 0,
    authorizedPageIds: assets.data.pageIds
  });
}

/* ------------------------------------------------------------------ */
/* VEROEFFENTLICHEN — ZWEI SCHRITTE, GETRENNT GEHALTEN                 */
/* ------------------------------------------------------------------ */

/**
 * Instagram veroeffentlicht in zwei Schritten: erst ein Container, dann
 * dessen Freigabe. Sie stehen hier als ZWEI Funktionen, nicht als eine.
 *
 * Der Grund ist nicht Stilfrage. Zwischen beiden liegt der einzige
 * Moment, in dem sich noch nichts Oeffentliches ereignet hat: der
 * Container existiert, ist pruefbar, und niemand sieht ihn. Wer beides
 * in eine Funktion legt, verliert diesen Moment — und mit ihm die
 * Moeglichkeit, vor der Veroeffentlichung abzubrechen.
 *
 * Die Graph API kennt ausserdem KEIN Idempotenz-Token. Ein
 * wiederholter media_publish-Aufruf erzeugt einen zweiten Beitrag. Das
 * Verhindern davon ist deshalb Sache des Aufrufers und nicht dieser
 * Schicht — hier steht nur, dass es so ist.
 */
export async function createMediaContainer(ctx, { instagramAccountId, accessToken, imageUrl, caption }) {
  const params = { image_url: String(imageUrl) };
  if (caption) params.caption = String(caption);

  const result = await graph(ctx, `${instagramAccountId}/media`, params, accessToken, { method: "POST" });
  if (!result.ok) return result;
  if (!result.data || !result.data.id) {
    return fail("containerNotCreated",
      "Die Plattform hat keinen Container-Bezeichner geliefert. Es wurde nichts veroeffentlicht.");
  }
  return ok({ containerId: String(result.data.id) });
}

/**
 * Der Zustand eines Containers.
 *
 * Bei einem Bild ist er meist sofort FINISHED. Gefragt wird trotzdem:
 * ein Container in ERROR laesst sich zwar freigeben, aber die Freigabe
 * schlaegt dann fehl — und zwar NACH dem Punkt, an dem man noch
 * folgenlos haette abbrechen koennen.
 */
export async function mediaContainerStatus(ctx, { containerId, accessToken }) {
  const result = await graph(ctx, String(containerId),
    { fields: "status_code,status" }, accessToken);
  if (!result.ok) return result;
  return ok({
    statusCode: (result.data && result.data.status_code) ? String(result.data.status_code) : null,
    status: (result.data && result.data.status) ? String(result.data.status) : null
  });
}

/** Die Freigabe. Ab hier ist der Beitrag oeffentlich. */
export async function publishMediaContainer(ctx, { instagramAccountId, accessToken, containerId }) {
  const result = await graph(ctx, `${instagramAccountId}/media_publish`,
    { creation_id: String(containerId) }, accessToken, { method: "POST" });
  if (!result.ok) return result;
  if (!result.data || !result.data.id) {
    return fail("publishNoMediaId",
      "Die Freigabe meldete keinen Medien-Bezeichner. Ob etwas veroeffentlicht wurde, ist damit " +
      "OFFEN — es darf nicht erneut versucht werden, ohne im Konto nachzusehen.");
  }
  return ok({ mediaId: String(result.data.id) });
}

/**
 * Liest den veroeffentlichten Beitrag zurueck.
 *
 * Eine Medien-ID aus der Antwort ist eine Zusage. Der Permalink ist der
 * Beleg — er laesst sich oeffnen.
 */
export async function verifyMedia(ctx, { mediaId, accessToken }) {
  const result = await graph(ctx, String(mediaId),
    { fields: "id,permalink,timestamp,media_type,caption" }, accessToken);
  if (!result.ok) return result;

  const data = result.data || {};
  if (String(data.id) !== String(mediaId)) {
    return fail("mediaIdentityMismatch",
      "Die API antwortet unter dieser Medien-ID mit einer anderen ID.");
  }
  return ok({
    mediaId: String(data.id),
    permalink: data.permalink ? String(data.permalink) : null,
    timestamp: data.timestamp ? String(data.timestamp) : null,
    mediaType: data.media_type ? String(data.media_type) : null,
    caption: data.caption ? String(data.caption) : null
  });
}
