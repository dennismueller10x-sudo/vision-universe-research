/* =========================================================================
   VISION UNIVERSE SOCIAL — providers/meta/adapter.js
   META / INSTAGRAM (§9)

   Der erste produktive Provider. Node-only, CommonJS, wird von keiner
   Seite geladen — dieselbe Regel wie providers/twelve-data/adapter.js und
   aus demselben Grund: alles, was der Browser laedt, ist oeffentlich.

   -------------------------------------------------------------------------
   WAS AUF GITHUB PAGES NICHT GEHT, UND WAS DARAUS FOLGT
   -------------------------------------------------------------------------

   Ein OAuth-Callback ist ein HTTP-Endpunkt. GitHub Pages hat keinen. Der
   Code-gegen-Token-Tausch braucht ausserdem META_APP_SECRET, das niemals
   in den Browser gelangen darf.

   Dieser Adapter loest das NICHT, indem er so tut, als ginge es. Er
   trennt den Ablauf in zwei Teile:

     1. TOKEN-BESCHAFFUNG   ist heute MANUAL_REQUIRED. Der Owner fuehrt den
                            Login einmal durch (Graph API Explorer oder ein
                            spaeterer Endpunkt) und legt das langlebige
                            Token als GitHub-Secret ab.

     2. ALLES DANACH        Verlaengerung, Ablaufpruefung, Kontoaufloesung,
                            Veroeffentlichung, Kennzahlen, Kommentare laeuft
                            unveraendert serverseitig im Workflow.

   `exchangeCode()` ist vollstaendig implementiert und getestet. Sie
   wartet auf einen Ort, an dem sie laufen kann — die Optionen stehen in
   docs/VU_SOCIAL_OWNER_DECISIONS.md. Bis dahin meldet die Capability
   `serverSideTokenExchange: MANUAL_REQUIRED`, nicht SUPPORTED.

   -------------------------------------------------------------------------
   TOKENS
   -------------------------------------------------------------------------

   Der Adapter SPEICHERT kein Token. Er bekommt bei jedem Aufruf eines
   ueber `tokenProvider()` — in der Produktion aus process.env, im Test aus
   einer Funktion. Er gibt keines zurueck, schreibt keines in ein Ergebnis
   und filtert es aus jeder Anbieterantwort heraus, bevor diese den
   Adapter verlaesst (die S8-Lehre aus quant/tests/secrets.test.mjs).
   ========================================================================= */
"use strict";

const crypto = require("crypto");
const Capabilities = require("../../engines/capabilities.js");
const Provider = require("../../engines/provider.js");
const Schema = require("../../engines/schema.js");

const PROVIDER_ID = "meta";
const GRAPH_HOST = "https://graph.facebook.com";
const DEFAULT_API_VERSION = "v21.0";

/* Die Namen der Secrets. NUR Namen — Werte kommen aus der Umgebung und
   erscheinen nirgends im Repository (§36). */
const SECRET_NAMES = {
  appId: "META_APP_ID",
  appSecret: "META_APP_SECRET",
  /* Das langlebige Instagram-/Page-Token, das der Owner einmal hinterlegt. */
  accessToken: "META_LONG_LIVED_TOKEN",
  /* Die Kennung des Instagram-Professional-Kontos, damit der Lauf nicht
     bei jedem Start die Aufloesung neu erfragen muss. */
  instagramAccountId: "META_IG_ACCOUNT_ID",
  /* Geheimnis fuer die Webhook-Signaturpruefung. */
  webhookSecret: "META_WEBHOOK_SECRET"
};

/**
 * Die Faehigkeitsdeklaration.
 *
 * `verifiedAt: null` ist hier die ehrlichste Zeile der Datei: keine
 * dieser Angaben wurde bislang gegen die echte API geprueft, weil dafuer
 * Zugangsdaten noetig waeren, die es im Repository nicht gibt. Die Werte
 * stammen aus der Dokumentation der Graph API — das ist eine begruendete
 * Erwartung, kein Nachweis. Der Verifikationslauf
 * (scripts/social/verify-meta-capabilities.mjs) traegt das Datum ein,
 * sobald er einmal mit Zugang gelaufen ist.
 */
function metaCapabilities(spec) {
  spec = spec || {};
  return Capabilities.declare(PROVIDER_ID, {
    platform: "instagram",
    apiVersion: spec.apiVersion || DEFAULT_API_VERSION,
    declaredAt: "2026-09-15",
    verifiedAt: spec.verifiedAt || null,
    auth: {
      oauth: "SUPPORTED",
      /* Der Tausch selbst ist implementiert; es fehlt der Ort, an dem der
         Callback ankommen kann. Genau das heisst MANUAL_REQUIRED. */
      serverSideTokenExchange: "MANUAL_REQUIRED",
      longLivedToken: "SUPPORTED",
      tokenRefresh: "SUPPORTED",
      /* Der Widerruf einer einzelnen Berechtigung geht ueber
         DELETE /{user-id}/permissions; fuer Page-/IG-Token ist der
         zuverlaessige Weg der Widerruf durch den Nutzer in den
         Einstellungen. Deshalb: teilweise. */
      tokenRevocation: "PARTIALLY_SUPPORTED",
      permissionIntrospection: "SUPPORTED",
      multiAccount: "SUPPORTED"
    },
    publish: {
      publishImage: "SUPPORTED",
      publishCarousel: "SUPPORTED",
      publishVideo: "SUPPORTED",
      publishReel: "SUPPORTED",
      /* Stories sind ueber die Content Publishing API nur eingeschraenkt
         erreichbar und nicht fuer jeden Kontotyp. Ungeprueft heisst hier
         ungeprueft. */
      publishStory: null,
      publishText: "UNAVAILABLE",
      scheduledPublish: "UNAVAILABLE",
      altText: "SUPPORTED",
      location: "PARTIALLY_SUPPORTED",
      userTags: "PARTIALLY_SUPPORTED",
      productTags: null,
      /* Die Graph API kennt keinen Idempotenz-Header. Der Schutz gegen
         Doppel-Posts liegt deshalb VOLLSTAENDIG bei uns — siehe
         social/engines/publishing.js. Diese Zeile ist der Grund, warum
         dieser Schutz nicht optional ist. */
      idempotencyToken: "UNAVAILABLE",
      deletePost: "PARTIALLY_SUPPORTED",
      editCaption: "PARTIALLY_SUPPORTED"
    },
    analytics: {
      postInsights: "SUPPORTED",
      accountInsights: "SUPPORTED",
      audienceDemographics: "PARTIALLY_SUPPORTED",
      storyInsights: "PARTIALLY_SUPPORTED",
      videoRetention: "PARTIALLY_SUPPORTED",
      historicalInsights: "PARTIALLY_SUPPORTED",
      realtimeInsights: "UNAVAILABLE",
      followerTimeseries: "PARTIALLY_SUPPORTED"
    },
    audience: {
      readComments: "SUPPORTED",
      replyComments: "SUPPORTED",
      hideComments: "SUPPORTED",
      readMentions: "PARTIALLY_SUPPORTED",
      readDirectMessages: null
    },
    webhook: {
      webhookSubscription: "MANUAL_REQUIRED",
      signatureVerification: "SUPPORTED",
      commentEvents: "MANUAL_REQUIRED",
      mentionEvents: "MANUAL_REQUIRED"
    },
    constraints: {
      publishCarousel: "2 bis 10 Elemente",
      publishReel: "MP4/MOV, 3 bis 900 Sekunden, max. 1 GB (Angabe der Plattform, ungeprueft)",
      audienceDemographics: "erst ab einer Mindestzahl an Followern",
      historicalInsights: "Insights erst ab dem Zeitpunkt der Kontoverbindung",
      deletePost: "nur ueber die Plattform-Oberflaeche zuverlaessig",
      webhookSubscription: "Abonnement wird im App-Dashboard eingerichtet, nicht per API"
    },
    notes: {
      serverSideTokenExchange:
        "Implementiert, aber ohne Server-Laufzeit nicht ausfuehrbar. Siehe docs/VU_SOCIAL_OWNER_DECISIONS.md."
    }
  });
}

/* ---------------------------------------------------------------------- */
/* Hilfsmittel                                                             */
/* ---------------------------------------------------------------------- */

/**
 * appsecret_proof: HMAC-SHA256 des Tokens mit dem App-Secret. Meta
 * empfiehlt es fuer serverseitige Aufrufe; es macht ein gestohlenes Token
 * ohne das Secret wertlos. Der Aufwand ist eine Zeile.
 */
function appSecretProof(accessToken, appSecret) {
  return crypto.createHmac("sha256", appSecret).update(accessToken).digest("hex");
}

/**
 * Entfernt alles aus einem Text, was wie ein Token aussieht. Meta
 * spiegelt in Fehlermeldungen gelegentlich den Aufruf — und ein Adapter,
 * der das durchreicht, traegt das Token in Logs und Artefakte.
 */
function scrub(text, secrets) {
  let out = String(text === undefined || text === null ? "" : text);
  (secrets || []).forEach((s) => {
    if (s && String(s).length >= 8) out = out.split(String(s)).join("[redacted]");
  });
  out = out.replace(/\bEA[A-Za-z0-9]{20,}/g, "[redacted]");
  out = out.replace(/\bIG[A-Za-z0-9]{20,}/g, "[redacted]");
  out = out.replace(/access_token=[^&\s"']+/gi, "access_token=[redacted]");
  out = out.replace(/appsecret_proof=[^&\s"']+/gi, "appsecret_proof=[redacted]");
  return out;
}

/** Ein zufaelliger, URL-sicherer state-Wert gegen CSRF (§9, §50). */
function createState(bytes) {
  return crypto.randomBytes(bytes || 32).toString("base64url");
}

/**
 * Vergleicht zwei state-Werte in konstanter Zeit. Ein `===` waere hier
 * kein Sicherheitsproblem in der Praxis, aber die richtige Gewohnheit —
 * und sie kostet nichts.
 */
function verifyState(expected, received) {
  if (typeof expected !== "string" || typeof received !== "string") return false;
  if (expected.length === 0 || expected.length !== received.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

/**
 * Prueft die Signatur eines Meta-Webhooks (X-Hub-Signature-256).
 * Ein Webhook ohne Signaturpruefung ist ein offener Eingang, ueber den
 * jeder unserem System Ereignisse unterschieben kann (§50).
 */
function verifyWebhookSignature(rawBody, headerValue, appSecret) {
  if (!appSecret) return { valid: false, reason: "noSecret" };
  if (typeof headerValue !== "string" || headerValue.indexOf("sha256=") !== 0) {
    return { valid: false, reason: "malformedHeader" };
  }
  const provided = headerValue.slice("sha256=".length);
  const expected = crypto.createHmac("sha256", appSecret)
    .update(Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), "utf8"))
    .digest("hex");
  if (provided.length !== expected.length) return { valid: false, reason: "lengthMismatch" };
  const valid = crypto.timingSafeEqual(Buffer.from(provided, "utf8"), Buffer.from(expected, "utf8"));
  return { valid, reason: valid ? null : "signatureMismatch" };
}

/* ---------------------------------------------------------------------- */
/* Der Adapter                                                             */
/* ---------------------------------------------------------------------- */

/**
 * @param options.appId          META_APP_ID (oeffentlich, darf im Log stehen)
 * @param options.appSecret      META_APP_SECRET (niemals im Log)
 * @param options.tokenProvider  () => string | null  — liefert das Zugangstoken
 * @param options.fetchImpl      fetch-kompatible Funktion (Tests setzen sie)
 * @param options.now            Zeitquelle
 */
function createMetaProvider(options) {
  options = options || {};
  const apiVersion = options.apiVersion || DEFAULT_API_VERSION;
  const appId = options.appId || null;
  const appSecret = options.appSecret || null;
  const tokenProvider = typeof options.tokenProvider === "function"
    ? options.tokenProvider
    : () => null;
  const fetchImpl = options.fetchImpl || (typeof fetch === "function" ? fetch : null);
  const now = options.now || (() => new Date());
  const capabilities = metaCapabilities({ apiVersion, verifiedAt: options.verifiedAt || null });

  let lastSuccessAt = null;
  let lastKnownExpiry = options.tokenExpiresAt || null;

  function configured() {
    return Boolean(appId && appSecret && tokenProvider());
  }

  function missingSecrets() {
    const missing = [];
    if (!appId) missing.push(SECRET_NAMES.appId);
    if (!appSecret) missing.push(SECRET_NAMES.appSecret);
    if (!tokenProvider()) missing.push(SECRET_NAMES.accessToken);
    return missing;
  }

  function notConfigured(what) {
    return Provider.result({
      available: false, reason: "notConfigured", provider: PROVIDER_ID,
      message: (what ? what + ": " : "") +
        "Es fehlen Zugangsdaten. Erwartet werden die Secrets " + missingSecrets().join(", ") +
        ". Das ist eine Konfigurationsfrage, kein Fehler im Ablauf."
    });
  }

  function failure(reason, message, extra) {
    return Provider.result(Object.assign({
      available: false, reason, provider: PROVIDER_ID,
      message: scrub(message, [appSecret, tokenProvider()])
    }, extra || {}));
  }

  /**
   * Ein Graph-Aufruf. Hier und nirgends sonst kennt der Code Meta.
   * Fehlerklassen werden auf die kanonischen Gruende abgebildet, damit
   * die Engines nie einen Meta-Fehlercode sehen.
   */
  async function graph(path, params, init) {
    if (!fetchImpl) return failure("noFetch", "Keine fetch-Implementierung verfuegbar.");
    const token = tokenProvider();
    if (!token) return notConfigured("Graph-Aufruf");

    const url = new URL(GRAPH_HOST + "/" + apiVersion + "/" + String(path).replace(/^\//, ""));
    Object.keys(params || {}).forEach((k) => {
      if (params[k] !== undefined && params[k] !== null) url.searchParams.set(k, String(params[k]));
    });
    url.searchParams.set("access_token", token);
    if (appSecret) url.searchParams.set("appsecret_proof", appSecretProof(token, appSecret));

    let response;
    try {
      response = await fetchImpl(url.toString(), init || {});
    } catch (err) {
      return failure("networkError", "Netzwerkfehler: " + String(err && err.message), {
        retryable: true, retryAfterSeconds: 30
      });
    }

    let text = "";
    try { text = await response.text(); } catch (err) { text = ""; }

    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch (err) { body = null; }

    if (response.ok && body && !body.error) {
      lastSuccessAt = now().toISOString();
      return Provider.result({ available: true, provider: PROVIDER_ID, data: body });
    }

    const error = (body && body.error) || {};
    const code = Number(error.code);
    const subcode = Number(error.error_subcode);
    const message = scrub(error.message || text || ("HTTP " + response.status), [appSecret, token]);

    /* Die Abbildung auf kanonische Gruende. Sie ist der eigentliche Wert
       eines Adapters: oberhalb dieser Zeile gibt es keine Meta-Codes mehr. */
    if (code === 190 || subcode === 463 || subcode === 467) {
      return failure("tokenExpired", "Das Zugangstoken ist abgelaufen oder ungueltig. " + message);
    }
    if (code === 10 || code === 200 || code === 3 || subcode === 458 || subcode === 459) {
      return failure("permissionRevoked", "Die noetige Berechtigung fehlt oder wurde entzogen. " + message);
    }
    if (code === 4 || code === 17 || code === 32 || code === 613 || code === 80007) {
      return failure("rateLimited", "Ratenbegrenzung der Plattform erreicht. " + message, {
        retryable: true, retryAfterSeconds: 900
      });
    }
    if (code === 1 || code === 2 || response.status >= 500) {
      return failure("providerOutage", "Die Plattform meldet einen voruebergehenden Fehler. " + message, {
        retryable: true, retryAfterSeconds: 300
      });
    }
    if (code === 9004 || code === 2207026 || code === 36003) {
      return failure("invalidMedia", "Das Medium wurde abgelehnt. " + message);
    }
    return failure("providerError", message);
  }

  return {
    providerId: PROVIDER_ID,
    /* NUR die drei Interfaces, die dieser Adapter erfuellt. Er beansprucht
       kein viertes "fuer spaeter" (MASTER §31.17). */
    interfaces: ["SocialAuthProvider", "SocialPublishProvider", "SocialAnalyticsProvider", "SocialAudienceProvider"],
    capabilities,
    SECRET_NAMES,

    /* --------------------------------------------- SocialAuthProvider */

    /**
     * Der Autorisierungslink. Ohne `state` gibt es keinen Link — das ist
     * die CSRF-Sperre, und sie ist nicht abschaltbar.
     */
    getAuthorizationUrl(spec) {
      spec = spec || {};
      if (!appId) return notConfigured("Autorisierungslink");
      if (!spec.state) return failure("missingState", "Ohne state-Parameter kein Autorisierungslink (CSRF-Schutz).");
      if (!spec.redirectUri) return failure("missingRedirectUri", "Ohne registrierte Redirect-URI kein Autorisierungslink.");

      const scopes = Array.isArray(spec.scopes) && spec.scopes.length ? spec.scopes : [
        "instagram_basic",
        "instagram_content_publish",
        "instagram_manage_insights",
        "instagram_manage_comments",
        "pages_show_list",
        "pages_read_engagement"
      ];
      const url = new URL("https://www.facebook.com/" + apiVersion + "/dialog/oauth");
      url.searchParams.set("client_id", appId);
      url.searchParams.set("redirect_uri", spec.redirectUri);
      url.searchParams.set("state", spec.state);
      url.searchParams.set("scope", scopes.join(","));
      url.searchParams.set("response_type", "code");
      return Provider.result({
        available: true, provider: PROVIDER_ID,
        data: { url: url.toString(), scopes, state: spec.state }
      });
    },

    /**
     * Code gegen Token. Vollstaendig implementiert; ohne Server-Laufzeit
     * heute nicht ausfuehrbar (siehe Kopf der Datei).
     *
     * Das Ergebnis traegt KEIN Token. Es sagt, dass der Tausch geklappt
     * hat, wann das Token ablaeuft und wie es heissen muss, wenn der Owner
     * es als Secret ablegt.
     */
    async exchangeCode(spec) {
      spec = spec || {};
      if (!appId || !appSecret) return notConfigured("Token-Tausch");
      if (!spec.code) return failure("missingCode", "Kein Autorisierungscode.");
      if (!spec.redirectUri) return failure("missingRedirectUri", "Redirect-URI fehlt.");
      if (!spec.expectedState || !spec.receivedState) {
        return failure("missingState", "state fehlt. Ein Token-Tausch ohne state-Pruefung findet nicht statt.");
      }
      if (!verifyState(spec.expectedState, spec.receivedState)) {
        return failure("stateMismatch", "Der state-Wert stimmt nicht. Der Vorgang wird abgebrochen (CSRF-Verdacht).");
      }
      if (!fetchImpl) return failure("noFetch", "Keine fetch-Implementierung verfuegbar.");

      const shortUrl = new URL(GRAPH_HOST + "/" + apiVersion + "/oauth/access_token");
      shortUrl.searchParams.set("client_id", appId);
      shortUrl.searchParams.set("client_secret", appSecret);
      shortUrl.searchParams.set("redirect_uri", spec.redirectUri);
      shortUrl.searchParams.set("code", spec.code);

      let shortBody;
      try {
        const res = await fetchImpl(shortUrl.toString(), {});
        const text = await res.text();
        shortBody = text ? JSON.parse(text) : null;
        if (!res.ok || !shortBody || shortBody.error || !shortBody.access_token) {
          return failure("exchangeFailed", "Token-Tausch abgelehnt: " +
            scrub((shortBody && shortBody.error && shortBody.error.message) || text, [appSecret]));
        }
      } catch (err) {
        return failure("networkError", "Token-Tausch fehlgeschlagen: " + String(err && err.message), { retryable: true });
      }

      /* Sofort in ein langlebiges Token tauschen. Ein kurzlebiges Token
         ist fuer einen Workflow, der einmal am Tag laeuft, wertlos. */
      const longUrl = new URL(GRAPH_HOST + "/" + apiVersion + "/oauth/access_token");
      longUrl.searchParams.set("grant_type", "fb_exchange_token");
      longUrl.searchParams.set("client_id", appId);
      longUrl.searchParams.set("client_secret", appSecret);
      longUrl.searchParams.set("fb_exchange_token", shortBody.access_token);

      let longBody;
      try {
        const res = await fetchImpl(longUrl.toString(), {});
        const text = await res.text();
        longBody = text ? JSON.parse(text) : null;
        if (!res.ok || !longBody || longBody.error || !longBody.access_token) {
          return failure("exchangeFailed", "Langlebiges Token nicht erhalten: " +
            scrub((longBody && longBody.error && longBody.error.message) || text, [appSecret]));
        }
      } catch (err) {
        return failure("networkError", "Tausch in langlebiges Token fehlgeschlagen: " + String(err && err.message),
          { retryable: true });
      }

      const expiresIn = Number(longBody.expires_in);
      const expiresAt = Number.isFinite(expiresIn) && expiresIn > 0
        ? new Date(now().getTime() + expiresIn * 1000).toISOString()
        : null;
      lastKnownExpiry = expiresAt;
      lastSuccessAt = now().toISOString();

      /* Das Token wird NICHT zurueckgegeben. Der Aufrufer bekommt eine
         Anweisung, keinen Schluessel. Wer den Wert braucht, hat ihn
         bereits — er stand im HTTP-Antwortkoerper, den nur diese Funktion
         gesehen hat. */
      return Provider.result({
        available: true, provider: PROVIDER_ID,
        message: "Token erhalten. Es wird bewusst nicht zurueckgegeben; hinterlege es als Secret " +
                 SECRET_NAMES.accessToken + ".",
        data: {
          connected: true,
          expiresAt,
          secretName: SECRET_NAMES.accessToken,
          /* Ein Fingerabdruck zum Wiedererkennen, aus dem sich das Token
             nicht rekonstruieren laesst. Er beantwortet die einzige Frage,
             die man ohne den Wert stellen muss: "ist das noch dasselbe?" */
          tokenFingerprint: crypto.createHash("sha256")
            .update(String(longBody.access_token)).digest("hex").slice(0, 16)
        }
      });
    },

    /**
     * Verlaengerung. Fuer langlebige Page-/IG-Token heisst das: ein
     * erneuter fb_exchange_token-Tausch mit dem vorhandenen Token.
     */
    async refreshToken() {
      if (!configured()) return notConfigured("Token-Verlaengerung");
      if (!fetchImpl) return failure("noFetch", "Keine fetch-Implementierung verfuegbar.");
      const token = tokenProvider();
      const url = new URL(GRAPH_HOST + "/" + apiVersion + "/oauth/access_token");
      url.searchParams.set("grant_type", "fb_exchange_token");
      url.searchParams.set("client_id", appId);
      url.searchParams.set("client_secret", appSecret);
      url.searchParams.set("fb_exchange_token", token);

      try {
        const res = await fetchImpl(url.toString(), {});
        const text = await res.text();
        const body = text ? JSON.parse(text) : null;
        if (!res.ok || !body || body.error || !body.access_token) {
          return failure("refreshFailed", "Verlaengerung abgelehnt: " +
            scrub((body && body.error && body.error.message) || text, [appSecret, token]));
        }
        const expiresIn = Number(body.expires_in);
        const expiresAt = Number.isFinite(expiresIn) && expiresIn > 0
          ? new Date(now().getTime() + expiresIn * 1000).toISOString() : null;
        lastKnownExpiry = expiresAt;
        lastSuccessAt = now().toISOString();
        const changed = String(body.access_token) !== String(token);
        return Provider.result({
          available: true, provider: PROVIDER_ID,
          message: changed
            ? "Ein NEUES Token wurde ausgestellt. Das Secret " + SECRET_NAMES.accessToken + " muss ersetzt werden."
            : "Das bestehende Token bleibt gueltig.",
          data: { refreshed: true, rotated: changed, expiresAt, secretName: SECRET_NAMES.accessToken }
        });
      } catch (err) {
        return failure("networkError", "Verlaengerung fehlgeschlagen: " + String(err && err.message), { retryable: true });
      }
    },

    /**
     * Widerruf. Fuer das eigene Token geht DELETE /me/permissions; der
     * vollstaendige Widerruf eines Page-Tokens liegt beim Nutzer. Deshalb
     * ist die Capability PARTIALLY_SUPPORTED und die Antwort sagt es.
     */
    async revoke(spec) {
      if (!configured()) return notConfigured("Widerruf");
      const target = (spec && spec.permission) ? "me/permissions/" + spec.permission : "me/permissions";
      const res = await graph(target, {}, { method: "DELETE" });
      if (!res.available) return res;
      return Provider.result({
        available: true, provider: PROVIDER_ID,
        message: "Berechtigung widerrufen. Ein vollstaendiger Entzug des Kontozugriffs erfolgt zusaetzlich " +
                 "durch den Nutzer in den Meta-Einstellungen.",
        data: { revoked: true, partial: true }
      });
    },

    /**
     * Kontoaufloesung: Facebook-Seiten -> verbundenes Instagram-
     * Professional-Konto. Der Umweg ist keine Eigenheit unseres Codes,
     * sondern der Aufbau der Plattform.
     */
    async getAccounts() {
      if (!configured()) return notConfigured("Kontoabruf");
      const pages = await graph("me/accounts", { fields: "id,name,instagram_business_account{id,username}" });
      if (!pages.available) return pages;

      const list = (pages.data && Array.isArray(pages.data.data)) ? pages.data.data : [];
      const accounts = list
        .filter((page) => page.instagram_business_account && page.instagram_business_account.id)
        .map((page) => Schema.socialAccount({
          accountId: PROVIDER_ID + ":" + page.instagram_business_account.id,
          providerId: PROVIDER_ID,
          externalId: page.instagram_business_account.id,
          username: page.instagram_business_account.username || null,
          accountType: "INSTAGRAM_PROFESSIONAL",
          pageId: page.id,
          connectedAt: now().toISOString(),
          tokenExpiresAt: lastKnownExpiry,
          scopes: [],
          state: "connected"
        }));

      if (accounts.length === 0) {
        return Provider.result({
          available: false, reason: "noInstagramAccount", provider: PROVIDER_ID,
          message: "Keine Facebook-Seite dieses Zugangs hat ein verbundenes Instagram-Professional-Konto. " +
                   "Das ist eine Einrichtungsfrage in Meta, kein Fehler des Abrufs."
        });
      }
      return Provider.result({ available: true, provider: PROVIDER_ID, data: accounts });
    },

    async getPermissions() {
      if (!configured()) return notConfigured("Rechteabfrage");
      const res = await graph("me/permissions", {});
      if (!res.available) return res;
      const rows = (res.data && Array.isArray(res.data.data)) ? res.data.data : [];
      return Provider.result({
        available: true, provider: PROVIDER_ID,
        data: {
          granted: rows.filter((r) => r.status === "granted").map((r) => r.permission),
          declined: rows.filter((r) => r.status !== "granted").map((r) => r.permission)
        }
      });
    },

    /* ------------------------------------------ SocialPublishProvider */

    /**
     * Medienpruefung VOR dem Aufruf. Ein Medium, das die Plattform
     * ablehnt, kostet sonst einen Container, einen Fehler und einen
     * Retry — und im schlimmsten Fall einen halb erzeugten Beitrag.
     */
    validateMedia(media) {
      media = media || {};
      const problems = [];
      const type = String(media.type || "").toUpperCase();

      if (["IMAGE", "CAROUSEL", "VIDEO", "REELS"].indexOf(type) === -1) {
        problems.push("Unbekannter Medientyp '" + (media.type || "") + "'.");
      }
      if (type === "CAROUSEL") {
        const n = Array.isArray(media.items) ? media.items.length : 0;
        if (n < 2 || n > 10) problems.push("Ein Carousel braucht 2 bis 10 Elemente, hat aber " + n + ".");
      } else if (!media.url) {
        problems.push("Es fehlt eine oeffentlich erreichbare Medien-URL.");
      }
      /* Meta laedt das Medium SELBST von der angegebenen URL. Eine
         Datei-URL oder ein privater Host fuehrt zu einem Fehler, der wie
         ein Formatproblem aussieht. */
      if (media.url && !/^https:\/\//i.test(media.url)) {
        problems.push("Die Medien-URL muss ueber https oeffentlich erreichbar sein.");
      }
      if (typeof media.caption === "string" && media.caption.length > 2200) {
        problems.push("Die Bildunterschrift ist laenger als 2200 Zeichen.");
      }
      return problems.length
        ? Provider.result({ available: false, reason: "invalidMedia", provider: PROVIDER_ID, message: problems.join(" ") })
        : Provider.result({ available: true, provider: PROVIDER_ID, data: { valid: true } });
    },

    /**
     * Veroeffentlichung in zwei Schritten: Container erzeugen, Container
     * veroeffentlichen.
     *
     * ZUR IDEMPOTENZ: Die Graph API kennt keinen Idempotenz-Header
     * (siehe Capability oben). Dieser Adapter kann eine Wiederholung
     * deshalb NICHT selbst erkennen. Der Schutz liegt eine Schicht
     * hoeher, in social/engines/publishing.js, und diese Funktion
     * verlangt den Schluessel trotzdem — damit niemand sie an der
     * Sperre vorbei aufruft.
     */
    async publish(request) {
      request = request || {};
      if (!configured()) return notConfigured("Veroeffentlichung");
      if (!request.idempotencyKey) {
        return failure("missingIdempotencyKey",
          "Veroeffentlichung ohne Idempotenzschluessel ist nicht zulaessig.");
      }
      if (!request.accountId) return failure("missingAccount", "Kein Zielkonto angegeben.");

      const mediaCheck = this.validateMedia(request.media);
      if (!mediaCheck.available) return mediaCheck;

      const igId = String(request.accountId).replace(/^meta:/, "");
      const media = request.media || {};
      const type = String(media.type || "IMAGE").toUpperCase();

      const containerParams = { caption: media.caption || undefined };
      if (type === "IMAGE") containerParams.image_url = media.url;
      else if (type === "VIDEO" || type === "REELS") {
        containerParams.media_type = type === "REELS" ? "REELS" : "VIDEO";
        containerParams.video_url = media.url;
        if (media.coverUrl) containerParams.cover_url = media.coverUrl;
      } else if (type === "CAROUSEL") {
        return failure("notImplemented",
          "Carousel-Veroeffentlichung braucht je Element einen eigenen Container. " +
          "Der Ablauf ist vorgesehen, aber nicht implementiert — und wird deshalb nicht als " +
          "unterstuetzt ausgegeben.");
      }
      if (media.altText) containerParams.alt_text = media.altText;

      const container = await graph(igId + "/media", containerParams, { method: "POST" });
      if (!container.available) return container;
      const creationId = container.data && container.data.id;
      if (!creationId) return failure("providerError", "Die Plattform hat keine Container-Kennung geliefert.");

      const published = await graph(igId + "/media_publish", { creation_id: creationId }, { method: "POST" });
      if (!published.available) {
        /* Der Container existiert, der Beitrag nicht. Diese Information
           gehoert in die Antwort: ein blinder Retry wuerde einen ZWEITEN
           Container erzeugen. */
        return Provider.result({
          available: false, reason: published.reason, provider: PROVIDER_ID,
          message: published.message + " Ein Medien-Container wurde bereits erzeugt; " +
                   "ein Wiederholungsversuch muss ihn weiterverwenden.",
          retryable: published.retryable,
          retryAfterSeconds: published.retryAfterSeconds,
          data: { pendingContainer: creationId }
        });
      }

      const postId = published.data && published.data.id;
      return Provider.result({
        available: true, provider: PROVIDER_ID,
        data: {
          externalPostId: postId || null,
          permalink: null,   /* wird getrennt abgefragt; kein geratener Link */
          publishedAt: now().toISOString(),
          deduplicated: false
        }
      });
    },

    async getPublishStatus(externalPostId) {
      if (!configured()) return notConfigured("Statusabfrage");
      const res = await graph(String(externalPostId), { fields: "id,permalink,timestamp" });
      if (!res.available) return res;
      return Provider.result({
        available: true, provider: PROVIDER_ID,
        data: {
          externalPostId: res.data.id,
          status: "PUBLISHED",
          permalink: res.data.permalink || null,
          publishedAt: res.data.timestamp || null
        }
      });
    },

    /* ---------------------------------------- SocialAnalyticsProvider */

    async getPostMetrics(externalPostId) {
      if (!configured()) return notConfigured("Kennzahlenabruf");
      const res = await graph(String(externalPostId) + "/insights", {
        metric: "impressions,reach,saved,likes,comments,shares,total_interactions"
      });
      if (!res.available) return res;
      const rows = (res.data && Array.isArray(res.data.data)) ? res.data.data : [];
      const providerMetrics = {};
      rows.forEach((row) => {
        const value = row.values && row.values[0] ? row.values[0].value : null;
        providerMetrics[row.name] = value === undefined ? null : value;
      });
      return Provider.result({
        available: true, provider: PROVIDER_ID,
        data: { externalPostId: String(externalPostId), capturedAt: now().toISOString(), providerMetrics }
      });
    },

    async getAccountMetrics(spec) {
      if (!configured()) return notConfigured("Kontokennzahlen");
      const igId = String((spec && spec.accountId) || "").replace(/^meta:/, "");
      if (!igId) return failure("missingAccount", "Kein Konto angegeben.");
      const res = await graph(igId + "/insights", {
        metric: "impressions,reach,profile_views,follower_count",
        period: (spec && spec.period) || "day"
      });
      if (!res.available) return res;
      const rows = (res.data && Array.isArray(res.data.data)) ? res.data.data : [];
      const providerMetrics = {};
      rows.forEach((row) => {
        const value = row.values && row.values[0] ? row.values[0].value : null;
        providerMetrics[row.name] = value === undefined ? null : value;
      });
      return Provider.result({
        available: true, provider: PROVIDER_ID,
        data: { capturedAt: now().toISOString(), providerMetrics }
      });
    },

    /* ----------------------------------------- SocialAudienceProvider */

    async getComments(externalPostId) {
      if (!configured()) return notConfigured("Kommentarabruf");
      const res = await graph(String(externalPostId) + "/comments", { fields: "id,text,timestamp,like_count" });
      if (!res.available) return res;
      const rows = (res.data && Array.isArray(res.data.data)) ? res.data.data : [];
      return Provider.result({
        available: true, provider: PROVIDER_ID,
        /* Der Text heisst `untrustedText` und nicht `text`. Der Name ist
           die Warnung (§50) — er wandert durch das ganze System mit. */
        data: rows.map((row) => ({
          commentId: row.id,
          createdAt: row.timestamp || null,
          likeCount: Schema.numberOrNull(row.like_count),
          untrustedText: typeof row.text === "string" ? row.text : null
        }))
      });
    },

    async getMentions(spec) {
      if (!configured()) return notConfigured("Erwaehnungen");
      return Capabilities.capabilityMissing(capabilities, "audience", "readMentions",
        "Erwaehnungen erfordern ein eingerichtetes Webhook-Abonnement. Das ist im App-Dashboard " +
        "zu konfigurieren und steht noch aus.");
    },

    /* ------------------------------------------------------ Webhooks */
    verifyWebhookSignature(rawBody, headerValue) {
      return verifyWebhookSignature(rawBody, headerValue, options.webhookSecret || appSecret);
    },

    /* ---------------------------------------------------- Gesundheit */
    async healthCheck() {
      if (!configured()) {
        return Provider.makeHealth("not_configured", {
          provider: PROVIDER_ID,
          message: "Der Provider ist vorbereitet, aber nicht konfiguriert. Ohne diese Secrets laeuft er nicht.",
          missing: missingSecrets(),
          capabilities: Capabilities.coverage(capabilities),
          lastSuccessAt
        });
      }
      const res = await graph("me", { fields: "id" });
      if (!res.available) {
        const degraded = ["rateLimited", "providerOutage", "networkError"].indexOf(res.reason) !== -1;
        return Provider.makeHealth(degraded ? "degraded" : "unavailable", {
          provider: PROVIDER_ID, message: res.message,
          missing: res.reason === "tokenExpired" ? [SECRET_NAMES.accessToken] : [],
          capabilities: Capabilities.coverage(capabilities),
          lastSuccessAt
        });
      }
      return Provider.makeHealth("ok", {
        provider: PROVIDER_ID, message: "Verbindung zur Graph API steht.",
        capabilities: Capabilities.coverage(capabilities), lastSuccessAt
      });
    }
  };
}

module.exports = {
  PROVIDER_ID,
  SECRET_NAMES,
  DEFAULT_API_VERSION,
  createMetaProvider,
  metaCapabilities,
  createState,
  verifyState,
  verifyWebhookSignature,
  appSecretProof,
  scrub
};
