/* =========================================================================
   VISION UNIVERSE — assets/watchlist-button.js        Lesezeichen (Watchlist)

   Ein Lesezeichen im einheitlichen Aktienkopf (.vu-shead, gezeichnet von
   assets/stock-navigator.js#head): gespeichert / nicht gespeichert,
   Umschalten ohne Neuladen. Gespeichert wird in der persoenlichen Watchlist
   des Kontos (Konto-API /v1/watchlist, instrumentId aus dem Company Master -
   nie der Ticker als Kennung). Nicht angemeldet: eine dezente Aufforderung.

   Eigenstaendig: eine Seite bindet nur diese Datei ein. Sie laedt
   /konto/config.js und tut ohne Endpunkt (Konten aus) nichts weiter. Mit
   Endpunkt haengt sie sich an jeden Aktienkopf
   (Kuerzel aus der Adresse, core/stock-context.js#parse) und bringt ihr
   Aussehen selbst mit. /konto/account-api.js und die Konto-API fragt sie nur
   mit dem Merker "angemeldet" (SESSION, gesetzt von konto/account-api.js) an:
   ohne Anmeldung kostet eine Produktseite mit Konten keine Anfrage mehr als
   ohne (Ressourcenbudgets, scripts/vu2/resource-budget.mjs).
   assets/stock-navigator.js bleibt unveraendert
   (byte-gesperrt, docs/quant-recovery/v51/ui-protection.json).

   Eine Abfrage der Liste je Tab und 5 Minuten (sessionStorage), geteilt von
   allen Lesezeichen; Aenderungen gehen ueber das Ereignis "vu-watchlist-change".

   couple(store) koppelt eine lokale "Beobachten"-Liste eines Produkts
   ({has(t), toggle(t) -> an?}) an die Konto-Watchlist: Ohne Konten oder ohne
   Anmeldung bleibt alles lokal und unveraendert. Angemeldet zaehlt ein Titel
   als beobachtet, wenn er lokal ODER im Konto steht; ein Klick schreibt beide
   Seiten gleich. Vorhandene lokale Eintraege werden nie von selbst hochgeladen
   oder geloescht - die Uebernahme bietet /konto/watchlist/ ausdruecklich an.
   Browser: globalThis.VUWatchButton; Node (Tests): module.exports.
   ========================================================================= */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.VUWatchButton = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  var VERSION = "watchlist-button-1.2.0";
  var PATH = "M6 3h12v18l-6-4-6 4z";
  var cache = null;          /* Promise<{signedIn, ids:{instrumentId: Ticker beim Speichern}}> je Seite */
  var resolved = {};         /* ticker -> Promise<instrumentId|null> */
  var known = {};            /* ticker -> instrumentId, sobald aufgeloest (fuer synchrone Abfragen) */
  var on = null;             /* Promise<boolean>: Konten freigeschaltet (auto/ready) */

  /* Gleicher Schluessel wie konto/account-api.js#SESSION_HINT. Kein Geheimnis, die Sitzung bleibt im HttpOnly-Cookie. */
  var SESSION = "vu-account-session-v1";
  function session() { try { return root.localStorage.getItem(SESSION) === "1"; } catch (e) { return false; } }
  function configured() { var c = root.VU_ACCOUNT_CONFIG; return !!(c && c.endpoint); }
  function account() { return root.VUAccount || null; }
  function enabled() { var a = account(); return configured() && (!session() || !!(a && a.available())); }

  /* Genau ein aktives Listing zum Ticker im Company Master (dieselbe Regel wie core/client.js#getSecurity). */
  function resolveInstrument(ticker, fetchImpl) {
    var Id = root.VUCore && root.VUCore.Identity, t = Id && Id.normalizeTicker(ticker);
    if (!t) return Promise.resolve(null);
    if (!resolved[t]) {
      resolved[t] = (fetchImpl || root.fetch)("/quant/data/universe/instruments/" + Id.shardKey(t) + ".json", { credentials: "omit" })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (shard) {
          var hit = ((shard && shard.instruments) || []).filter(function (i) { return i.symbol === t && i.active; });
          var id = hit.length === 1 && Id.isInstrumentId(hit[0].instrumentId) ? hit[0].instrumentId : null;
          if (id) known[t] = id;
          return id;
        }, function () { return null; });
    }
    return resolved[t];
  }

  /* Status der Lesezeichen fuer 5 Minuten je Browser-Tab (sessionStorage): eine Aktienseite nach der anderen
     fragt die Konto-API nicht jedes Mal (Cloudflare Workers Free: 100.000 Anfragen/Tag). Eigene Aenderungen
     schreiben den Speicher sofort mit; die Watchlist-Seite leert ihn. */
  var STORE = "vu-watchlist-ids-v1", TTL = 5 * 60 * 1000;
  function stored() {
    try { var v = JSON.parse(root.sessionStorage.getItem(STORE) || "null"); return v && Date.now() - v.at < TTL && v.signedIn ? v : null; } catch (e) { return null; }
  }
  function store(st) { try { root.sessionStorage.setItem(STORE, JSON.stringify({ at: Date.now(), signedIn: st.signedIn, ids: st.ids })); } catch (e) { /* nur Komfort */ } }
  function load() {
    if (!session()) return Promise.resolve({ signedIn: false, ids: {} });
    if (!cache) {
      var hit = stored();
      cache = hit ? Promise.resolve({ signedIn: true, ids: hit.ids }) : account().get("/v1/watchlist").then(function (r) {
        var ids = {};
        if (r.ok) (r.data.items || []).forEach(function (i) { ids[i.instrumentId] = i.ticker || true; });
        var st = { signedIn: r.ok, ids: ids };
        if (r.ok) store(st);
        return st;
      });
    }
    return cache;
  }

  function svg(doc) {
    var ns = "http://www.w3.org/2000/svg", s = doc.createElementNS(ns, "svg"), p = doc.createElementNS(ns, "path");
    s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("aria-hidden", "true"); p.setAttribute("d", PATH); s.appendChild(p);
    return s;
  }

  function hint(btn, text, link) {
    var doc = btn.ownerDocument, old = btn.parentNode && btn.parentNode.querySelector(".vu-watch-hint");
    if (old) old.remove();
    var box = doc.createElement("span");
    box.className = "vu-watch-hint"; box.setAttribute("role", "status");
    box.appendChild(doc.createTextNode(text + " "));
    if (link) { var a = doc.createElement("a"); a.href = link.href; a.textContent = link.label; box.appendChild(a); }
    btn.parentNode.appendChild(box);
    setTimeout(function () { if (box.parentNode) box.remove(); }, 6000);
  }

  function paint(btn, saved, ticker) {
    btn.setAttribute("aria-pressed", saved ? "true" : "false");
    btn.setAttribute("aria-label", ticker + (saved ? " ist in deiner Watchlist – entfernen" : " zur Watchlist hinzufügen"));
    btn.title = saved ? "In deiner Watchlist" : "Zur Watchlist hinzufügen";
  }

  /**
   * Zeichnet das Lesezeichen in slot. o: {ticker, fetch?}. Ohne Freigabe oder ohne eindeutiges Listing: nichts.
   * @returns Promise<HTMLElement|null>
   */
  function mount(slot, o) {
    if (!slot || !o || !o.ticker || !enabled()) return Promise.resolve(null);
    var doc = slot.ownerDocument;
    /* Ohne Anmeldung zeigt der Knopf nur die Aufforderung; das Listing wird erst angemeldet aufgeloest. */
    return (session() ? resolveInstrument(o.ticker, o.fetch) : Promise.resolve("")).then(function (id) {
      if (id === null) return null;
      return load().then(function (st) {
        var btn = doc.createElement("button");
        btn.type = "button"; btn.className = "vu-watch";
        if (id) btn.setAttribute("data-instrument", id);
        btn.appendChild(svg(doc));
        paint(btn, !!(id && st.ids[id]), o.ticker);
        btn.addEventListener("click", function () { toggle(btn, id, o.ticker); });
        root.addEventListener && root.addEventListener("vu-watchlist-change", function (e) {
          if (e.detail && e.detail.instrumentId === id) paint(btn, e.detail.saved, o.ticker);
        });
        slot.appendChild(btn);
        return btn;
      });
    });
  }

  function toggle(btn, id, ticker) {
    load().then(function (st) {
      if (!st.signedIn) {
        var next = root.location ? root.location.pathname : "/";
        return hint(btn, "Melde dich an, um Aktien in deiner Watchlist zu speichern.", { href: "/konto/anmelden/?next=" + encodeURIComponent(next), label: "Anmelden" });
      }
      var saved = !!st.ids[id];
      paint(btn, !saved, ticker);                      /* sofort zeigen, bei Fehler zuruecknehmen */
      btn.disabled = true;
      var req = saved ? account().post("/v1/watchlist/items/remove", { instrumentId: id })
        : account().post("/v1/watchlist/items", { instrumentId: id, ticker: ticker });
      return req.then(function (r) {
        btn.disabled = false;
        if (!r.ok) {
          paint(btn, saved, ticker);
          if (r.state === "WATCHLIST_ITEMS_LIMIT_REACHED") return hint(btn, account().message(r.state), { href: "/konto/tarife/", label: "Tarife" });
          if (r.status === 401) { cache = null; try { root.sessionStorage.removeItem(STORE); } catch (e) { /* leer */ } return hint(btn, "Bitte melde dich erneut an.", { href: "/konto/anmelden/", label: "Anmelden" }); }
          return hint(btn, account().message(r.state));
        }
        if (saved) delete st.ids[id]; else st.ids[id] = ticker;
        store(st);
        changed(id, ticker, !saved);
        hint(btn, saved ? ticker + " aus der Watchlist entfernt." : ticker + " gespeichert.", saved ? null : { href: "/konto/watchlist/", label: "Watchlist" });
      });
    });
  }

  function changed(id, ticker, saved) {
    if (root.dispatchEvent && root.CustomEvent) root.dispatchEvent(new root.CustomEvent("vu-watchlist-change", { detail: { instrumentId: id, ticker: ticker, saved: saved } }));
  }

  /* ------------------------------------------------ lokale Listen koppeln */
  var snap = null;           /* geladener Kontostand, sobald da: {signedIn, ids} */
  function central() {
    var p = on || (root.document && root.document.head ? ready(root.document) : null);
    if (!p) return Promise.resolve(null);
    return p.then(function (ok) { return ok && session() ? load() : null; }).then(function (st) {
      if (st && !snap) {
        snap = st;   /* einmal melden: gekoppelte Listen koennen ihren Zustand neu zeichnen */
        if (root.dispatchEvent && root.CustomEvent) root.dispatchEvent(new root.CustomEvent("vu-watchlist-ready", { detail: { signedIn: st.signedIn } }));
      }
      return st;
    }, function () { return null; });
  }
  function centralHas(t) {
    if (!snap || !snap.signedIn) return false;
    if (known[t] && snap.ids[known[t]]) return true;
    for (var id in snap.ids) if (snap.ids[id] === t) return true;
    return false;
  }
  /* Schreibt den Konto-Stand fuer t auf "an"/"aus". Fehler (z. B. Tarifgrenze) lassen die lokale Liste wie geklickt
     und melden sich ueber "vu-watchlist-sync"; die Watchlist-Seite zeigt den Titel dann als "nur auf diesem Geraet". */
  function follow(t, want) {
    return central().then(function (st) {
      if (!st || !st.signedIn) return { ok: true, state: "LOCAL_ONLY" };
      return resolveInstrument(t).then(function (id) {
        if (!id) return { ok: false, state: "INSTRUMENT_NOT_RESOLVED" };
        if (!!st.ids[id] === want) return { ok: true, state: "UNCHANGED" };
        var req = want ? account().post("/v1/watchlist/items", { instrumentId: id, ticker: t })
          : account().post("/v1/watchlist/items/remove", { instrumentId: id });
        return req.then(function (r) {
          if (r.ok) { if (want) st.ids[id] = t; else delete st.ids[id]; store(st); changed(id, t, want); }
          else if (root.dispatchEvent && root.CustomEvent) root.dispatchEvent(new root.CustomEvent("vu-watchlist-sync", { detail: { ticker: t, saved: want, state: r.state || "ERROR" } }));
          return { ok: !!r.ok, state: r.ok ? (want ? "ADDED" : "REMOVED") : (r.state || "ERROR") };
        });
      });
    });
  }
  /**
   * Koppelt eine lokale Liste {has(t), toggle(t) -> boolean an} an die Konto-Watchlist, an Ort und Stelle
   * (Verweise anderer Module auf dasselbe Objekt bleiben gueltig). Idempotent. Gibt das Objekt zurueck.
   */
  function couple(store) {
    if (!store || store.vuCoupled) return store;
    var has = store.has, flip = store.toggle;
    store.has = function (t) { return has.call(store, t) || centralHas(t); };
    store.toggle = function (t) {
      var local = has.call(store, t), want = !(local || centralHas(t));
      if (local !== want) flip.call(store, t);           /* lokal genau so, wie geklickt */
      store.lastSync = follow(t, want);
      return want;
    };
    store.vuCoupled = true;
    central();
    return store;
  }

  var CSS = ".vu-shead-watch{position:relative;display:inline-flex}" +
    ".vu-watch{width:44px;height:44px;display:grid;place-items:center;border-radius:999px;border:1px solid var(--vu-line-strong,#d4d4d4);background:transparent;color:var(--vu-text,#0d0f12);cursor:pointer}" +
    ".vu-watch svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linejoin:round}" +
    ".vu-watch[aria-pressed=true]{border-color:transparent;background:var(--vu-accent-soft,#eef9cc);color:var(--vu-accent-text,#4f6b00)}" +
    ".vu-watch[aria-pressed=true] svg{fill:currentColor}.vu-watch:focus-visible{outline:2px solid var(--vu-focus,#4f6b00);outline-offset:2px}" +
    ".vu-watch[disabled]{opacity:.6;cursor:wait}" +
    ".vu-watch-hint{position:absolute;z-index:20;top:calc(100% + 6px);right:0;width:max-content;max-width:min(280px,80vw);padding:8px 12px;border-radius:12px;font-size:13px;line-height:1.4;" +
    "background:var(--vu-elevated,#fff);color:var(--vu-text,#0d0f12);border:1px solid var(--vu-line-strong,#d4d4d4);box-shadow:0 8px 24px rgba(0,0,0,.14)}" +
    ".vu-watch-hint a{color:var(--vu-accent-text,#4f6b00);font-weight:600}";

  function script(doc, src) {
    return new Promise(function (done) {
      var s = doc.createElement("script");
      s.src = src; s.async = true;
      s.onload = function () { done(true); }; s.onerror = function () { done(false); };
      doc.head.appendChild(s);
    });
  }
  /* Konten freigeschaltet? Ohne Endpunkt oder ohne Anmeldung bleibt es bei dieser einen kleinen Anfrage (/konto/config.js). */
  function ready(doc) {
    if (on) return on;
    return on = (root.VU_ACCOUNT_CONFIG ? Promise.resolve(true) : script(doc, "/konto/config.js")).then(function () {
      if (!configured()) return false;
      if (!session()) return true;
      return (root.VUAccount ? Promise.resolve(true) : script(doc, "/konto/account-api.js")).then(function () { return enabled(); });
    }, function () { return false; });
  }
  function tickerOfPage() {
    var SC = root.VUCore && root.VUCore.StockContext, loc = root.location;
    var hit = SC && loc ? SC.parse(loc.pathname + loc.hash) : null;
    return hit && hit.ctx && hit.ctx.region === "US" ? hit.ctx.ticker : null;
  }
  /** Haengt das Lesezeichen an jeden Aktienkopf der Seite, auch nach Routenwechseln. */
  function auto(doc) {
    doc = doc || root.document;
    if (!doc || !doc.head) return Promise.resolve(false);
    return ready(doc).then(function (on) {
      if (!on) return false;
      var style = doc.createElement("style");
      style.textContent = CSS; doc.head.appendChild(style);
      function scan() {
        var t = tickerOfPage();
        Array.prototype.forEach.call(doc.querySelectorAll(".vu-shead .vu-shead-actions"), function (actions) {
          var slot = actions.querySelector(".vu-shead-watch");
          if (slot && slot.getAttribute("data-ticker") === t) return;
          if (slot) slot.remove();
          if (!t) return;
          slot = doc.createElement("span");
          slot.className = "vu-shead-watch"; slot.setAttribute("data-ticker", t);
          actions.appendChild(slot);
          mount(slot, { ticker: t });
        });
      }
      scan();
      if (root.MutationObserver) new root.MutationObserver(scan).observe(doc.body, { childList: true, subtree: true });
      root.addEventListener("hashchange", scan);
      return true;
    });
  }

  if (typeof module !== "object" && root.document) {
    if (root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", function () { auto(); });
    else auto();
    /* Quant: die Merkliste QX.watch (quant/app/ui.js, byte-gesperrt) wird zur Laufzeit gekoppelt, ihre Dateien bleiben
       unveraendert. QX steht vorher in quant/index.html bzw. im Release-Buendel (docs/accounts/WATCHLIST.md §5). */
    if (root.QX && root.QX.watch) couple(root.QX.watch);
  }

  return Object.freeze({ VERSION: VERSION, mount: mount, auto: auto, resolveInstrument: resolveInstrument, enabled: enabled,
    couple: couple, follow: follow, STORE: STORE,
    _reset: function () { cache = null; resolved = {}; known = {}; on = null; snap = null; },
    _ready: function (p) { on = p; } });
});
