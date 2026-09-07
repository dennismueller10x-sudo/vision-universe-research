/* =========================================================================
   VISION UNIVERSE QUANT — market-client.js
   TRANSPORTSCHICHT FUER MARKTDATEN-PROVIDER (Phase 2, §18, §20, §21, §22)

   Provider-neutral. Kennt keinen Anbieter, keine URL und kein Antwortformat
   — nur die Regeln, nach denen mit einer fremden, limitierten und
   gelegentlich ausfallenden API umzugehen ist:

     Warteschlange     hoechstens N gleichzeitige Anfragen
     Deduplizierung    identische gleichzeitige Anfragen teilen eine Antwort
     Cache             TTL je Datenklasse
     Retry + Backoff   nur bei voruebergehenden Fehlern
     Quota             Zaehlung je Minute und Tag, VOR dem Absenden geprueft
     Health            available / degraded / quotaExceeded / authError / offline

   Der Free Plan ist hier der Normalfall, nicht der Ausnahmefall. Ein
   Kontingent von wenigen Anfragen pro Minute ist kein Fehlerzustand,
   sondern eine Randbedingung, mit der die Architektur umgehen koennen muss.

   `fetchImpl` ist injizierbar: in der GitHub Action das globale fetch, im
   Test ein Stub. Diese Datei stellt selbst nie eine Netzwerkverbindung her.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);

  /* TTL je Datenklasse in Millisekunden (§21). Tagesbars aendern sich nach
     Boersenschluss nicht mehr — sie stundenlang erneut abzurufen waere
     verschwendetes Kontingent. */
  var DEFAULT_TTL = {
    quote: 60 * 1000,                  // kurz
    marketStatus: 5 * 60 * 1000,       // kurz
    symbolSearch: 24 * 60 * 60 * 1000, // mittel
    dailyBars: 6 * 60 * 60 * 1000,     // lang
    historicalBars: 30 * 24 * 60 * 60 * 1000, // sehr lang
    corporateActions: 24 * 60 * 60 * 1000,
    intradayBars: 5 * 60 * 1000
  };

  var HEALTH = ["available", "degraded", "offline", "quotaExceeded", "authError", "notConfigured"];

  /* Fehlerklassen. Nur `transient` rechtfertigt einen erneuten Versuch —
     ein 401 wird durch Wiederholung nicht besser, verbraucht aber Kontingent. */
  function classifyError(status, err) {
    if (status === 401 || status === 403) return "auth";
    if (status === 429) return "quota";
    if (status === 408 || status === 425 || status === 500 || status === 502 ||
        status === 503 || status === 504) return "transient";
    if (status >= 400 && status < 500) return "permanent";
    if (!status && err) return "transient";      // Netzwerk-/DNS-Fehler
    return status >= 500 ? "transient" : "permanent";
  }

  function createMarketClient(options) {
    options = options || {};
    var providerId = options.providerId || "unknown";
    var fetchImpl = options.fetchImpl;
    var now = options.now || function () { return Date.now(); };
    var sleep = options.sleep || function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    var ttl = Object.assign({}, DEFAULT_TTL, options.ttl || {});

    var limits = Object.assign({
      requestsPerMinute: 8,      // konservativ; typischer Free-Plan-Wert
      requestsPerDay: 800,
      concurrency: 2,
      maxRetries: 3,
      baseBackoffMs: 500,
      /* Wie alt ein Wert im Ausfall hoechstens sein darf, bevor "veraltet"
         in "falsch" umschlaegt. Vier Stunden decken einen Handelstag-Ausfall
         ab; ein Kurs vom Vortag wird nicht mehr ausgeliefert. */
      maxStaleMs: 4 * 60 * 60 * 1000
    }, options.limits || {});

    var cache = Object.create(null);
    var inflight = Object.create(null);
    var minuteWindow = [];
    var dayCount = 0;
    var dayStamp = dayKey(now());
    var queue = [];
    var active = 0;

    var stats = {
      providerId: providerId, requests: 0, cacheHits: 0, deduplicated: 0,
      errors: 0, retries: 0, quotaBlocks: 0, bytes: 0,
      latencyTotalMs: 0, latencySamples: 0,
      lastSuccessAt: null, lastErrorAt: null, lastError: null
    };
    var health = { status: fetchImpl ? "available" : "notConfigured", since: now(), message: fetchImpl ? "" : "Kein fetch konfiguriert." };

    function dayKey(ts) { return new Date(ts).toISOString().slice(0, 10); }

    function setHealth(status, message) {
      if (HEALTH.indexOf(status) === -1) throw new Error("unknown health status: " + status);
      if (health.status !== status) health.since = now();
      health.status = status;
      health.message = message || "";
    }

    function rollWindows() {
      var t = now();
      var cutoff = t - 60000;
      while (minuteWindow.length && minuteWindow[0] < cutoff) minuteWindow.shift();
      var today = dayKey(t);
      if (today !== dayStamp) { dayStamp = today; dayCount = 0; }
    }

    function quotaState() {
      rollWindows();
      return {
        minuteUsed: minuteWindow.length, minuteLimit: limits.requestsPerMinute,
        dayUsed: dayCount, dayLimit: limits.requestsPerDay,
        minuteRemaining: Math.max(0, limits.requestsPerMinute - minuteWindow.length),
        dayRemaining: Math.max(0, limits.requestsPerDay - dayCount)
      };
    }

    /** Wartezeit bis zum naechsten freien Slot im Minutenfenster. */
    function msUntilSlot() {
      rollWindows();
      if (minuteWindow.length < limits.requestsPerMinute) return 0;
      return Math.max(0, minuteWindow[0] + 60000 - now()) + 25;
    }

    function cacheKey(spec) {
      return spec.kind + "|" + spec.url + "|" + JSON.stringify(spec.params || {});
    }

    /**
     * Frischer Treffer oder nichts. Der abgelaufene Eintrag bleibt bewusst
     * liegen: der eine Moment, in dem ein veralteter Wert gebraucht wird,
     * ist genau der nach dem Ablauf — ein Ausfall unmittelbar nach dem
     * Verfall der TTL. Wer hier loescht, hat bei jedem Ausfall nichts mehr
     * anzubieten. Aufgeraeumt wird stattdessen nach maxStaleMs.
     */
    function readCache(key) {
      var entry = cache[key];
      if (!entry) return null;
      if (entry.expiresAt <= now()) return null;
      return entry;
    }

    function writeCache(key, kind, value) {
      var lifetime = ttl[kind] === undefined ? 60000 : ttl[kind];
      cache[key] = { value: value, storedAt: now(), expiresAt: now() + lifetime, kind: kind };
    }

    function pump() {
      while (active < limits.concurrency && queue.length) {
        var job = queue.shift();
        active++;
        job().then(function () { active--; pump(); }, function () { active--; pump(); });
      }
    }

    function schedule(task) {
      return new Promise(function (resolve) {
        queue.push(function () { return task().then(resolve, resolve); });
        pump();
      });
    }

    /**
     * Fuehrt eine Anfrage aus.
     * @param {object} spec {kind, url, params, headers, parse, allowStale}
     * @returns {Promise<{ok, data, fromCache, stale, reason, status}>}
     */
    function request(spec) {
      var key = cacheKey(spec);

      var cached = readCache(key);
      if (cached) {
        stats.cacheHits++;
        return Promise.resolve({ ok: true, data: cached.value, fromCache: true, stale: false,
                                 cachedAt: new Date(cached.storedAt).toISOString() });
      }
      /* Identische gleichzeitige Anfragen teilen eine Antwort. Ohne das
         feuert eine Seite mit zehn Kacheln zehn Anfragen fuer dasselbe
         Symbol ab und verbrennt das Minutenkontingent. */
      if (inflight[key]) { stats.deduplicated++; return inflight[key]; }

      if (!fetchImpl) {
        return Promise.resolve({ ok: false, reason: "notConfigured",
          message: "Kein HTTP-Client konfiguriert. Ohne Zugangsdaten wird nichts abgerufen." });
      }

      var promise = schedule(function () { return attempt(spec, key, 0); })
        .then(function (result) { delete inflight[key]; return result; },
              function (err) { delete inflight[key]; throw err; });
      inflight[key] = promise;
      return promise;
    }

    function staleFallback(key, reason, message) {
      /* Abgelaufene Daten sind besser als keine — aber nur, wenn sie als
         veraltet gekennzeichnet werden. Stillschweigend alte Kurse als
         aktuell auszugeben waere schlimmer als eine Fehlermeldung.
         Und irgendwann ist auch das nicht mehr wahr: ein Kurs von letzter
         Woche ist keine Notloesung, sondern eine Falschinformation. */
      var entry = cache[key];
      if (!entry) return null;
      var age = now() - entry.storedAt;
      if (age > limits.maxStaleMs) { delete cache[key]; return null; }
      return { ok: true, data: entry.value, fromCache: true, stale: true,
               ageMs: age,
               cachedAt: new Date(entry.storedAt).toISOString(), reason: reason, message: message };
    }

    /**
     * Liest den Antwortkoerper, egal welche Art von HTTP-Client eingesetzt
     * wurde.
     *
     * Bewusst ueber text() statt json(): eine nicht-JSON-Antwort (die
     * HTML-Fehlerseite eines Proxys, eine abgeschnittene Uebertragung)
     * wuerde bei json() eine Ausnahme werfen, die von einem Netzfehler
     * nicht zu unterscheiden ist — und dann wiederholt der Client dreimal
     * etwas, das sich nie aendern wird. Hier wird der Fall stattdessen
     * benannt und als dauerhafter Fehler behandelt.
     */
    function readBody(res) {
      var text;
      if (typeof res.text === "function") text = Promise.resolve(res.text());
      else if (typeof res.json === "function") return Promise.resolve(res.json());
      else if (typeof res.body === "string") text = Promise.resolve(res.body);
      else return Promise.resolve(res.body);

      return text.then(function (raw) {
        if (typeof raw !== "string") return raw;
        try {
          return JSON.parse(raw);
        } catch (err) {
          return { __parseError: (err && err.message) || "unbekannt" };
        }
      });
    }

    function attempt(spec, key, retryCount) {
      var quota = quotaState();
      if (quota.dayRemaining <= 0) {
        stats.quotaBlocks++;
        setHealth("quotaExceeded", "Tageskontingent von " + limits.requestsPerDay + " Anfragen erschoepft.");
        return Promise.resolve(staleFallback(key, "quotaExceeded", health.message) ||
          { ok: false, reason: "quotaExceeded", message: health.message });
      }

      var wait = msUntilSlot();
      if (wait > 0) {
        if (wait > (spec.maxWaitMs || 65000)) {
          stats.quotaBlocks++;
          return Promise.resolve(staleFallback(key, "rateLimited", "Minutenkontingent erschoepft.") ||
            { ok: false, reason: "rateLimited", message: "Minutenkontingent erschoepft." });
        }
        return sleep(wait).then(function () { return attempt(spec, key, retryCount); });
      }

      minuteWindow.push(now());
      dayCount++;
      stats.requests++;
      var started = now();

      return Promise.resolve()
        .then(function () { return fetchImpl(spec.url, { headers: spec.headers || {} }); })
        .then(function (res) {
          var latency = now() - started;
          stats.latencyTotalMs += latency; stats.latencySamples++;

          if (!res || typeof res.status !== "number") throw new Error("Ungueltige Antwort vom HTTP-Client");
          if (res.status >= 200 && res.status < 300) {
            return readBody(res).then(function (body) {
              if (body && body.__parseError) {
                /* Kein JSON: fast immer eine HTML-Fehlerseite von einem
                   Proxy oder Loadbalancer. Das ist kein voruebergehender
                   Netzfehler — dreimal dagegenlaufen hilft nicht und
                   verbrennt nur Kontingent. */
                return handleFailure(spec, key, retryCount, "permanent", res.status,
                                     "Antwort ist kein JSON: " + body.__parseError, latency);
              }
              /* Manche Anbieter melden Fehler mit HTTP 200 im Body. Der
                 Adapter erkennt das ueber spec.detectError. */
              if (spec.detectError) {
                var detected = spec.detectError(body);
                if (detected) {
                  var cls = detected.status === 429 ? "quota" : classifyError(detected.status || 0, null);
                  return handleFailure(spec, key, retryCount, cls, detected.status || 0, detected.message, latency);
                }
              }
              var parsed = spec.parse ? spec.parse(body) : body;
              writeCache(key, spec.kind, parsed);
              stats.lastSuccessAt = new Date(now()).toISOString();
              if (health.status !== "available") setHealth("available", "");
              return { ok: true, data: parsed, fromCache: false, stale: false, latencyMs: latency };
            });
          }
          return handleFailure(spec, key, retryCount, classifyError(res.status, null), res.status,
                               "HTTP " + res.status, latency);
        })
        .catch(function (err) {
          if (err && err.__handled) return err.result;
          var latency = now() - started;
          return handleFailure(spec, key, retryCount, "transient", 0,
                               (err && err.message) || String(err), latency);
        });
    }

    function handleFailure(spec, key, retryCount, cls, status, message, latency) {
      stats.errors++;
      stats.lastErrorAt = new Date(now()).toISOString();
      stats.lastError = { status: status, message: message, class: cls };

      if (cls === "auth") {
        setHealth("authError", "Zugangsdaten wurden abgelehnt (HTTP " + status + ").");
        return Promise.resolve({ ok: false, reason: "authError", status: status, message: message });
      }
      if (cls === "quota") {
        setHealth("quotaExceeded", "Der Anbieter meldet ein erschoepftes Kontingent (HTTP 429).");
        /* 429 zaehlt gegen das Minutenfenster, damit der Client von selbst
           langsamer wird statt weiter dagegenzulaufen. */
        for (var i = 0; i < Math.max(1, limits.requestsPerMinute - minuteWindow.length); i++) minuteWindow.push(now());
        return Promise.resolve(staleFallback(key, "quotaExceeded", message) ||
          { ok: false, reason: "quotaExceeded", status: status, message: message });
      }
      if (cls === "transient" && retryCount < limits.maxRetries) {
        stats.retries++;
        setHealth("degraded", "Voruebergehender Fehler, erneuter Versuch: " + message);
        var backoff = limits.baseBackoffMs * Math.pow(2, retryCount);
        return sleep(backoff).then(function () { return attempt(spec, key, retryCount + 1); });
      }
      setHealth(cls === "transient" ? "offline" : "degraded", message);
      return Promise.resolve(staleFallback(key, "requestFailed", message) ||
        { ok: false, reason: "requestFailed", status: status, message: message });
    }

    return {
      request: request,
      quota: quotaState,
      health: function () {
        return { status: health.status, provider: providerId, message: health.message,
                 since: new Date(health.since).toISOString(), quota: quotaState() };
      },
      /* Observability (§22) — bewusst ohne jeden Zugangsdatenbezug. */
      stats: function () {
        return Object.assign({}, stats, {
          averageLatencyMs: stats.latencySamples ? Math.round(stats.latencyTotalMs / stats.latencySamples) : null,
          cacheEntries: Object.keys(cache).length,
          queued: queue.length, active: active, quota: quotaState()
        });
      },
      clearCache: function () { cache = Object.create(null); },
      setLimits: function (next) { limits = Object.assign(limits, next || {}); return limits; },
      limits: function () { return Object.assign({}, limits); },
      ttl: function () { return Object.assign({}, ttl); }
    };
  }

  var api = { DEFAULT_TTL: DEFAULT_TTL, HEALTH: HEALTH, classifyError: classifyError, createMarketClient: createMarketClient };

  if (isNode) module.exports = api;
  else global.VUMarketClient = api;
})(typeof window !== "undefined" ? window : globalThis);
