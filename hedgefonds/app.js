/* =========================================================================
   VISION UNIVERSE® HEDGEFONDS — app.js
   Liest die serverseitig erzeugten 13F-Daten (scripts/hedgefonds/
   fetch_edgar_data.py). Kein SEC-Abruf im Browser.

     #/                  Start
     #/investoren        Investoren, Reiter Star-Investoren (H02)
     #/investoren/alle   Investoren, Reiter Alle Fonds (H03; alt: #/datenbank)
     #/aktien            Aktien: meistgehalten, Käufe, Verkäufe (H04)
     #/aktie/<ticker>    Aktienseite, Perspektive Investoren (H07; alte CUSIP-Adressen leiten um)
     #/fonds/<slug>      Fonds: Meldestand, Verlauf, Positionen, Käufe, Verkäufe (H05)
     #/smart-money       Smart Money: Insider-Käufe (Form 4)
     #/smart-money/einstiege   Smart Money: Fonds-Einstiege (alle 13F-Melder, 13D)
   Insider- und Fondsströme je Aktie liest das Modul aus den Eigentümer-
   Signalen (quant/data/product/ownership-signals-v1, Erzeuger
   scripts/market/build-ownership-signals.mjs); fehlen sie, bleibt der
   Bereich mit einem Hinweis leer.
   ========================================================================= */
(function () {
  "use strict";

  var DATA_URL = window.HF_DATA_URL || "/hedgefonds/data/hedgefonds.json";
  var BASE = "/hedgefonds/data/";
  var STOCK_SHARDS = 32;
  var OWN_BASE = window.HF_OWN_URL || "/quant/data/product/ownership-signals-v1/";
  var FEATURED = ["pershing-square", "berkshire", "scion", "ark", "situational-awareness", "appaloosa", "duquesne",
    "bit-capital", "icahn", "third-point", "greenlight", "baupost", "tci", "himalaya", "dalal-street", "tiger-global", "coatue"];
  var HERO_FACES = ["berkshire", "pershing-square", "ark", "appaloosa", "bridgewater", "soros", "icahn", "citadel", "tci"];
  var POPULAR = [["Bill Ackman", "fonds", "pershing-square"], ["Michael Burry", "fonds", "scion"], ["Cathie Wood", "fonds", "ark"],
    ["Jan Beckers", "fonds", "bit-capital"], ["NVIDIA", "aktie", "NVDA"], ["Palantir", "aktie", "PLTR"]];
  var STATUS = {
    "new": { label: "Neu", cls: "new" }, added: { label: "Aufgestockt", cls: "up" },
    reduced: { label: "Reduziert", cls: "down" }, sold: { label: "Verkauft", cls: "down" },
    unchanged: { label: "Unverändert", cls: "" }
  };
  var REGION = { DE: "Deutschland", AT: "Österreich", CH: "Schweiz" };
  var PAGE = 50, INV_PAGE = window.matchMedia && matchMedia("(max-width: 760px)").matches ? 12 : 24;
  var S = { data: null, universe: [], bySlug: {}, details: {}, shards: {}, stockIndex: null,
    style: "Alle", sort: "value", tab: "holdings", aggMode: "star", dbFilter: "all", dbSort: "value", dbShown: PAGE,
    dbQ: "", invQ: "", stockMode: "all", own: { shards: {}, highlights: null } };
  var root = document.getElementById("hf-root");

  /* -------------------------------------------------------------- Icons */
  var ICON = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9.5 21v-6h5v6"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><circle cx="17.2" cy="9" r="2.6"/><path d="M16.6 14.6c2.5.2 4.2 1.9 4.9 4.9"/>',
    table: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M3 9.5h18M3 15h18M9 9.5V20"/>',
    chart: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 6-7"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    up: '<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    down: '<path d="m3 7 6 6 4-4 8 8"/><path d="M15 17h6v-6"/>',
    star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    pie: '<path d="M21 12a9 9 0 1 1-9-9v9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    brief: '<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M9 7V5h6v2M3 12.5h18"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    pulse: '<path d="M3 12h4l3-7 4 14 3-7h4"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="m10.8 12.2 8.7-8.7M16 6l2.5 2.5M14 8l2 2"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
    ext: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'
  };
  function icon(name, cls) {
    return '<svg class="hf-i' + (cls ? " " + cls : "") + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON[name] + "</svg>";
  }

  /* ------------------------------------------------------------- Helfer */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  var nf1 = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  var nf0 = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });
  function usd(n) {
    if (n == null || isNaN(n)) return "–";
    // Zentraler Formatter (quant/engines/fx/money-format.js), sonst Zahl ohne Währungszeichen
    var central = window.HF_FORMAT_USD && window.HF_FORMAT_USD(n);
    if (central) return central.replace(/^-/, "−");
    var a = Math.abs(n), s = n < 0 ? "−" : "";
    if (a >= 1e12) return s + nf1.format(a / 1e12) + " Bio.";
    if (a >= 1e9) return s + nf1.format(a / 1e9) + " Mrd.";
    if (a >= 1e6) return s + nf0.format(a / 1e6) + " Mio.";
    if (a >= 1e3) return s + nf0.format(a / 1e3) + " Tsd.";
    return s + nf0.format(a);
  }
  function shares(n) {
    if (n == null) return "–";
    var a = Math.abs(n);
    if (a >= 1e9) return nf1.format(n / 1e9) + " Mrd.";
    if (a >= 1e6) return nf1.format(n / 1e6) + " Mio.";
    return nf0.format(n);
  }
  function pct(n, signed) {
    if (n == null || isNaN(n)) return "–";
    var s = signed && n > 0 ? "+" : n < 0 ? "−" : "";
    return s + nf1.format(Math.abs(n)) + " %";
  }
  function dateDE(iso) {
    if (!iso) return "–";
    var p = iso.slice(0, 10).split("-");
    return p[2] + "." + p[1] + "." + p[0];
  }
  function quarter(iso) { return iso ? "Q" + (Math.floor((+iso.slice(5, 7) - 1) / 3) + 1) + " " + iso.slice(0, 4) : "–"; }
  function qShort(iso) { return "Q" + (Math.floor((+iso.slice(5, 7) - 1) / 3) + 1) + "/" + iso.slice(2, 4); }
  function initials(name) {
    var w = String(name || "?").replace(/\(.*?\)|†|&/g, " ").split(/\s+/).filter(Boolean);
    return ((w[0] || "?")[0] + (w.length > 1 ? w[w.length - 1][0] : "")).toUpperCase();
  }
  function prettyIssuer(s) {
    // SEC-/FIGI-Namen sind GROSS geschrieben – für die Anzeige behutsam normalisieren
    if (!s || s !== s.toUpperCase()) return s || "";
    return s.toLowerCase().replace(/(^|[\s\-\/(&.])([a-z])/g, function (m, a, b) { return a + b.toUpperCase(); })
      .replace(/\b(Inc|Corp|Co|Ltd|Plc|Llc|Lp|Nv|Sa|Ag|Se|Etf|Tr|Spdr|Adr|Reit)\b/g, function (m) {
        return { Inc: "Inc", Corp: "Corp", Co: "Co", Ltd: "Ltd", Plc: "plc", Llc: "LLC", Lp: "LP", Nv: "NV", Sa: "SA", Ag: "AG", Se: "SE", Etf: "ETF", Tr: "Tr", Spdr: "SPDR", Adr: "ADR", Reit: "REIT" }[m];
      })
      .replace(/ (Of|And|The|For|De) /g, function (m) { return m.toLowerCase(); });
  }
  function issuerName(item) {
    // Namenszusätze der Datenanbieter ("-Cl A", "-Sp ADR", "Inc-Class A Shares") kürzen
    if (item.ticker && NAME_FIX[item.ticker]) return NAME_FIX[item.ticker];
    return prettyIssuer(item.displayName || item.name || item.issuer)
      .replace(/\s*-\s*(Cl|Class|Sp|Spon|Reg|Ord)\b.*$/i, "").replace(/\s*-\s*[A-Z]$/, "")
      .replace(/\bTechn$/, "Technologies").replace(/\bHldgs?\b/g, "Holdings").replace(/\bIntl\b/g, "International")
      .replace(/\bGrp\b/g, "Group").replace(/\bSvcs\b/g, "Services")
      .replace(/^Ss (?=Spdr)/i, "").replace(/-Us$/, "")
      // Rechtsform-Zusätze sind in Listen Rauschen („Amazon.Com Inc" → „Amazon")
      .replace(/\.Com\b/, "").replace(/,?\s+(Inc|Corp|Corporation|Co|Ltd|plc|Holdings Inc)\.?$/i, "").trim();
  }
  // Von SEC/FIGI abgeschnittene Namen, die sich nicht regelbasiert reparieren lassen
  var NAME_FIX = { NVDA: "NVIDIA", TSM: "TSMC", SPCX: "SpaceX", GOOGL: "Alphabet (A)", GOOG: "Alphabet (C)", "BRK/B": "Berkshire Hathaway", META: "Meta Platforms" };
  function secLink(f) {
    if (!f.accession) return "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&type=13F-HR&CIK=" + f.cik;
    return "https://www.sec.gov/Archives/edgar/data/" + (+f.cik) + "/" + f.accession.replace(/-/g, "") + "/";
  }
  function stockHref(item) {
    // Aktienseite per Kürzel (H07); ohne Kürzel bleibt die CUSIP
    return item.ticker ? "#/aktie/" + encodeURIComponent(item.ticker) : item.cusip ? "#/aktie/" + encodeURIComponent(item.cusip) : null;
  }
  function stockShard(cusip) {
    var s = 0;
    for (var i = 0; i < cusip.length; i++) s += cusip.charCodeAt(i);
    return s % STOCK_SHARDS;
  }

  function fundLabel(f) { return f.manager ? f.manager + " · " + f.name : f.name; }
  function regionLabel(f) { return f.region ? REGION[f.region] || f.region : ""; }

  /* -------------------------------------------------------------- Daten */
  function getJSON(url) {
    return fetch(url, { cache: "no-cache" }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }
  /* universe.json (~900 KB, alle weiteren Hedgefonds) lädt erst, wenn eine
     Ansicht es braucht: Suche, „Alle Hedgefonds", jede Seite außer der
     Startseite. Die Startseite braucht daraus nur die Zahl der Hedgefonds,
     die hedgefonds.json als hedgefondsCount mitliefert. Fehlt das Feld
     (ältere Daten), lädt universe.json wie bisher vor dem ersten Bild. */
  function ensureUniverse() {
    if (!S.uniP) {
      S.uniP = getJSON(BASE + "universe.json").catch(function () { return { funds: [] }; }).then(function (u) {
        S.universe = u.funds || [];
        S.universe.forEach(function (f) { S.bySlug[f.slug] = f; });
        S.uniReady = true;
      });
    }
    return S.uniP;
  }
  function load() {
    // Direkter Einstieg auf eine Unterseite: universe.json gleich parallel holen
    if (!/^#\/?(\?|$)/.test(location.hash || "#/")) ensureUniverse();
    return getJSON(DATA_URL).then(function (d) {
      if (!d.schema || d.schema.indexOf("hedgefonds-2") !== 0) throw new Error("Datenformat veraltet");
      S.data = d;
      // Reihenfolge wie bisher: universe.json überschreibt gleichnamige Slugs
      d.funds.concat(S.universe).forEach(function (f) { S.bySlug[f.slug] = f; });
      if (typeof d.hedgefondsCount !== "number") return ensureUniverse();
    });
  }
  function loadFund(slug) {
    if (S.details[slug]) return Promise.resolve(S.details[slug]);
    return getJSON(BASE + "funds/" + encodeURIComponent(slug) + ".json").then(function (d) { S.details[slug] = d; return d; });
  }
  function loadStock(cusip) {
    var n = stockShard(cusip);
    var p = S.shards[n] || (S.shards[n] = getJSON(BASE + "stocks/" + n + ".json"));
    return p.then(function (shard) { return shard[cusip] || null; });
  }
  function loadStockIndex() {
    if (!S.stockIndexP) {
      S.stockIndexP = getJSON(BASE + "stocks/index.json").then(function (d) {
        S.stockIndex = (d.rows || []).map(function (r) {
          return { cusip: r[0], ticker: r[1], name: r[2], fundCount: r[3], starCount: r[4], valueUSD: r[5], logo: !!r[6] };
        });
        return S.stockIndex;
      }).catch(function () { S.stockIndex = []; return []; });
    }
    return S.stockIndexP;
  }
  /* Eigentümer-Signale (Form 4, 13D/13G, alle 13F-Melder). Gzip-Scherben
     werden nach dem Laden entpackt; liefert der Server sie bereits entpackt
     aus, wird direkt gelesen. Fehlen die Daten, liefern die Lader null. */
  function getGzJSON(url) {
    return fetch(url, { cache: "no-cache" }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.arrayBuffer();
    }).then(function (buf) {
      var b = new Uint8Array(buf);
      if (!(b[0] === 0x1f && b[1] === 0x8b)) return new TextDecoder().decode(b);
      if (typeof DecompressionStream !== "function") throw new Error("GZIP_DECOMPRESSION_UNSUPPORTED");
      return new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
    }).then(JSON.parse);
  }
  function ownShard(ticker) {
    var I = window.VUCore && window.VUCore.Identity;
    return I ? I.shardKey(ticker) : null;
  }
  function loadOwnIssuer(ticker) {
    var key = ticker && ownShard(ticker);
    if (!key) return Promise.resolve(null);
    var p = S.own.shards[key] || (S.own.shards[key] = getGzJSON(OWN_BASE + "current/" + encodeURIComponent(key) + ".json.gz")
      .catch(function () { return null; }));
    return p.then(function (shard) {
      if (!shard || !shard.issuers) return null;
      var x = shard.issuers[ticker] || shard.issuers[window.VUCore.Identity.normalizeTicker(ticker)];
      return x ? { asOf: shard.asOf, data: x } : null;
    });
  }
  function loadOwnHighlights() {
    if (!S.own.highlightsP) {
      S.own.highlightsP = getJSON(OWN_BASE + "highlights.json").then(function (h) { S.own.highlights = h; return h; })
        .catch(function () { S.own.highlightsP = null; return null; });
    }
    return S.own.highlightsP;
  }
  function stockByTicker(ticker) {
    return loadStockIndex().then(function (list) {
      for (var i = 0; i < list.length; i++) if (list[i].ticker === ticker) return list[i];
      return null;
    });
  }
  function investors() { return S.data.funds.filter(function (f) { return f.category === "Investoren"; }); }
  function institutions() { return S.data.funds.filter(function (f) { return f.category === "Institutionen"; }); }
  function dbAll() { return investors().concat(S.universe); }
  function isHF(f) { return f.category === "Investoren" || f.style === "Hedgefonds"; }
  function hfCount() { return S.uniReady ? dbAll().filter(isHF).length : S.data.hedgefondsCount; }

  /* ----------------------------------------------------- Meldefristen */
  function nextDeadline() {
    var now = new Date(), y = now.getFullYear();
    var list = [[y, 1, 14], [y, 4, 15], [y, 7, 14], [y, 10, 14], [y + 1, 1, 14]].map(function (a) {
      return new Date(a[0], a[1], a[2], 23, 59);
    });
    for (var i = 0; i < list.length; i++) if (list[i] > now) return list[i];
    return list[list.length - 1];
  }
  function deadlineQuarter(dl) {
    var m = dl.getMonth(); // Feb -> Q4 Vorjahr, Mai -> Q1, Aug -> Q2, Nov -> Q3
    return m === 1 ? "Q4 " + (dl.getFullYear() - 1) : "Q" + ((m - 1) / 3) + " " + dl.getFullYear();
  }

  /* ------------------------------------------------------------- Suche */
  // „Google-artig": jedes eingegebene Wort muss den Anfang irgendeines Wortes
  // treffen ("ca wo" -> Cathie Wood, "jan" -> Jan Beckers); ab drei Zeichen
  // zählt auch ein Treffer mitten im Wort.
  function fold(s) {
    return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  }
  function words(s) { return fold(s).split(/[^a-z0-9]+/).filter(Boolean); }
  function matchScore(qTokens, fields) {
    var total = 0;
    for (var i = 0; i < qTokens.length; i++) {
      var t = qTokens[i], best = 0;
      for (var f = 0; f < fields.length; f++) {
        var fw = fields[f].words, weight = fields[f].weight;
        for (var w = 0; w < fw.length; w++) {
          if (fw[w] === t) best = Math.max(best, 3 * weight);
          else if (fw[w].indexOf(t) === 0) best = Math.max(best, 2 * weight);
          else if (t.length >= 3 && fw[w].indexOf(t) > 0) best = Math.max(best, 0.6 * weight);
        }
      }
      if (!best) return 0;
      total += best;
    }
    return total;
  }
  function fundFields(f) {
    if (!f._sw) {
      f._sw = [{ words: words(f.manager), weight: 1.4 }, { words: words(f.name), weight: 1 },
        { words: words(f.secName || ""), weight: 0.6 }, { words: words([f.city, regionLabel(f)].join(" ")), weight: 0.4 }];
    }
    return f._sw;
  }
  function searchFunds(q, limit) {
    var tokens = words(q);
    if (!tokens.length) return [];
    var out = [];
    dbAll().forEach(function (f) {
      var sc = matchScore(tokens, fundFields(f));
      if (sc) out.push({ f: f, score: sc + (f.category === "Investoren" && sc >= 2 ? 2.5 : 0) + Math.log10((f.totalValueUSD || 1) + 1) * 0.15 });
    });
    out.sort(function (a, b) { return b.score - a.score; });
    // Schwache Teilwort-Treffer ausblenden, sobald es klare Wortanfang-Treffer gibt
    var top = out.length ? out[0].score : 0;
    return out.filter(function (x) { return x.score >= top * 0.45; }).slice(0, limit || 8)
      .map(function (x) { x.f._score = x.score; return x.f; });
  }
  function searchStocks(q, limit) {
    var tokens = words(q), idx = S.stockIndex || [];
    if (!tokens.length) return [];
    var raw = fold(q).replace(/\s+/g, ""), out = [];
    for (var i = 0; i < idx.length; i++) {
      var s = idx[i];
      if (!s._sw) s._sw = [{ words: words(s.name), weight: 1 }, { words: [fold(s.ticker)], weight: 1.3 }];
      var sc = matchScore(tokens, s._sw);
      // Exakter Ticker zählt, aber kleine Nebenwerte (PAL) schlagen nicht Palantir bei "pal"
      if (s.ticker && fold(s.ticker) === raw && (raw.length <= 2 || s.fundCount >= 5)) sc += 6;
      if (sc) out.push({ s: s, score: sc + Math.log10(s.fundCount + 1) * 1.8 });
    }
    out.sort(function (a, b) { return b.score - a.score; });
    var top = out.length ? out[0].score : 0;
    return out.filter(function (x) { return x.score >= top * 0.45; }).slice(0, limit || 6)
      .map(function (x) { x.s._score = x.score; return x.s; });
  }
  function hl(text, q) {
    // Treffer im Ergebnis hervorheben (Wortanfänge)
    var t = esc(text);
    words(q).forEach(function (tok) {
      var safe = tok.replace(/[.*+?^\x24{}()|[\]\\]/g, function (c) { return "\\" + c; });
      t = t.replace(new RegExp("(^|[\\s(&\\-·])(" + safe + ")", "ig"), function (m, pre, hit) { return pre + "<mark>" + hit + "</mark>"; });
    });
    return t;
  }
  // Ein Suchfeld mit Vorschlagsliste (Startseite, Aktien-Seite, Overlay)
  function attachSearch(input, panel, opts) {
    opts = opts || {};
    var items = [], active = -1;
    function render() {
      var q = input.value.trim();
      if (!q) {
        panel.innerHTML = opts.emptyHtml ? opts.emptyHtml() : "";
        panel.hidden = !opts.emptyHtml;
        items = [].slice.call(panel.querySelectorAll("[data-go]"));
        active = -1;
        return;
      }
      var funds = opts.stocksOnly ? [] : searchFunds(q, opts.fundLimit || 6);
      var stocks = opts.fundsOnly ? [] : searchStocks(q, opts.stockLimit || 5);
      var html = "", fh = "", sh = "";
      if (funds.length) {
        fh = '<div class="hf-sg">Investoren &amp; Fonds</div>' + funds.map(function (f) {
          return '<a class="hf-sr" data-go="#/fonds/' + esc(f.slug) + '" href="#/fonds/' + esc(f.slug) + '">' + avatar(f, "sm") +
            '<span class="t"><b>' + hl(f.manager || f.name, q) + "</b><small>" +
            hl(f.manager ? f.name : [f.city, regionLabel(f)].filter(Boolean).join(" · ") || f.style, q) + '</small></span><span class="v">' + usd(f.totalValueUSD) + "</span></a>";
        }).join("");
      }
      if (stocks.length) {
        sh = '<div class="hf-sg">Aktien</div>' + stocks.map(function (s) {
          return '<a class="hf-sr" data-go="' + esc(stockHref(s)) + '" href="' + esc(stockHref(s)) + '">' + logo(s, "sm") +
            '<span class="t"><b>' + hl(issuerName(s), q) + "</b><small>" + esc(s.ticker || s.cusip) + " · in " + s.fundCount + " Fonds" +
            (s.starCount ? ", davon " + s.starCount + " Star-Investoren" : "") + '</small></span><span class="v">' + usd(s.valueUSD) + "</span></a>";
        }).join("");
      }
      // Die Gruppe mit dem besseren Treffer zuerst ("pal" → Palantir vor Appaloosa)
      html = stocks.length && (!funds.length || stocks[0]._score > funds[0]._score) ? sh + fh : fh + sh;
      if (!html) html = '<p class="hf-sempty">Nichts gefunden für „' + esc(q) + "“. Tipp: Vor- oder Nachname, Fondsname oder Ticker.</p>";
      panel.innerHTML = html;
      panel.hidden = false;
      items = [].slice.call(panel.querySelectorAll("[data-go]"));
      active = -1;
    }
    function move(d) {
      if (!items.length) return;
      active = (active + d + items.length) % items.length;
      items.forEach(function (it, i) { it.classList.toggle("on", i === active); });
      items[active].scrollIntoView({ block: "nearest" });
    }
    function renderWithUniverse() {
      if (S.uniReady || opts.stocksOnly) { render(); return; }
      ensureUniverse().then(function () { if (document.activeElement === input || input.value.trim()) render(); });
    }
    input.addEventListener("input", renderWithUniverse);
    input.addEventListener("focus", function () {
      loadStockIndex().then(function () { if (document.activeElement === input) render(); });
      if (!opts.stocksOnly) ensureUniverse();
      render();
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
      else if (e.key === "Enter") {
        var target = items[active >= 0 ? active : 0];
        if (!target && !S.uniReady && !opts.stocksOnly && input.value.trim()) {
          // Enter, bevor universe.json da ist: wie bisher zum ersten Treffer, sobald es geladen ist
          e.preventDefault();
          ensureUniverse().then(function () { render(); var t = items[0]; if (t) { location.hash = t.getAttribute("data-go"); if (opts.onGo) opts.onGo(); } });
          return;
        }
        if (target) { e.preventDefault(); location.hash = target.getAttribute("data-go"); if (opts.onGo) opts.onGo(); }
      } else if (e.key === "Escape") { panel.hidden = true; input.blur(); if (opts.onGo) opts.onGo(); }
    });
    panel.addEventListener("click", function (e) {
      if (e.target.closest("[data-go]") && opts.onGo) opts.onGo();
    });
    if (opts.inline) {
      document.addEventListener("click", function (e) {
        if (!panel.contains(e.target) && e.target !== input) panel.hidden = true;
      });
    }
  }

  /* ------------------------------------------------- Produkt-Leiste
     Kopf und Leiste kommen aus der gemeinsamen Vision-Universe-Shell
     (assets/site-navigation.js): Hedgefonds | Investoren | Aktien |
     Smart Money | ☰ (Redesign 11/2026: Datenbank ist ein Reiter unter Investoren). Hedgefonds meldet ihr nur den aktiven Bereich. Die Suche
     bleibt die Hedgefonds-Suche: im Hero, mit / und als Overlay. */
  var DOCK = { start: "hedgefonds", investoren: "investoren", datenbank: "investoren", aktien: "aktien", "smart-money": "smart", smart: "smart" };
  function setDock(key) {
    if (window.VUNavigation) window.VUNavigation.dock({ active: key && DOCK[key] ? DOCK[key] : null });
  }

  /* ------------------------------------------------------ Such-Overlay */
  var overlay;
  function buildOverlay() {
    overlay = document.createElement("div");
    overlay.className = "hf-overlay";
    overlay.hidden = true;
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-label", "Suche");
    overlay.innerHTML = '<div class="hf-ov-box"><div class="hf-ov-head">' + icon("search") +
      '<input type="search" id="hf-ovq" placeholder="Investor, Fonds oder Aktie – z. B. „Jan“, „ca wo“, „NVDA“" autocomplete="off">' +
      '<button type="button" class="hf-ov-close" aria-label="Schließen">' + icon("close") + '</button></div><div class="hf-ov-res" id="hf-ovres"></div></div>';
    document.body.appendChild(overlay);
    attachSearch(overlay.querySelector("#hf-ovq"), overlay.querySelector("#hf-ovres"), { onGo: closeSearch, fundLimit: 8, stockLimit: 6, emptyHtml: popularHtml });
    overlay.querySelector(".hf-ov-close").addEventListener("click", closeSearch);
    overlay.addEventListener("click", function (e) { if (e.target === overlay) closeSearch(); });
  }
  function popularHtml() {
    return '<div class="hf-sg">Beliebt</div><div class="hf-pop">' + POPULAR.map(function (p) {
      var href = "#/" + p[1] + "/" + p[2];
      return '<a class="vu-chip" data-go="' + href + '" href="' + href + '">' + esc(p[0]) + "</a>";
    }).join("") + "</div>";
  }
  function openSearch() {
    overlay.hidden = false;
    document.body.classList.add("hf-noscroll");
    var input = overlay.querySelector("#hf-ovq");
    input.value = "";
    input.focus();
    input.dispatchEvent(new Event("input"));
  }
  function closeSearch() {
    overlay.hidden = true;
    document.body.classList.remove("hf-noscroll");
  }

  /* ---------------------------------------------------- Bausteine (Redesign 2027)
     Gemeinsame Bausteine aus assets/vu-ui.js (VUUI): C07 Kursbewegung, C08 Urteil,
     C09 Erklärung, C11 Kachel, C12 Navigationskarte, C13 Abschnitt, C14 Reiter,
     C16 Sheet, C17 Balken, C18 Leerer Zustand. Hedgefonds-Muster (Avatar mit Stern,
     Investor-Zeile, Fluss-Zeile, Anteils-Zeile, Käufer/Verkäufer-Balken) entstehen hier.
     Farben: nur Weiß, Schwarz, Neongrün und Grau; Kauf neongrün, Verkauf schwarz. */
  var U = window.VUUI;
  function avatar(f, size) {
    var label = f.manager || f.name, star = f.category === "Investoren";
    var photo = (size === "xl" || size === "md") && f.photo && f.photo.src ?
      '<img src="/hedgefonds/' + esc(f.photo.src) + '" alt="" width="96" height="96" loading="lazy" decoding="async" onerror="this.remove()">' : "";
    return '<span class="hf-av' + (size ? " hf-av--" + size : "") + '" data-ini="' + esc(initials(label)) + '" aria-hidden="true">' + photo +
      (star ? '<i class="hf-av-star">' + icon("star") + "</i>" : "") + "</span>";
  }
  function logo(item, size) {
    var t = item.ticker || "";
    var txt = esc((t || item.issuer || item.name || "?").replace(/[^A-Za-z0-9]/g, "").slice(0, 5));
    var img = item.logo && t ? '<img src="/discover/logos/files/' + encodeURIComponent(t) + '.png" alt="" loading="lazy" decoding="async" onerror="this.remove()">' : "";
    return '<span class="vu-logo-tile hf-logo' + (size ? " hf-logo--" + size : "") + '" aria-hidden="true"><b>' + txt + "</b>" + img + "</span>";
  }
  function stockName(item) { return esc(issuerName(item)); }
  function optTag(item) {
    return item.putCall ? ' <span class="hf-tag">' + (item.putCall === "PUT" ? "Put" : "Call") + "</span>" : "";
  }
  // Veränderung einer Position: C07 bei Prozent, C08 bei neu/verkauft, sonst „unverändert"
  function move(t) {
    var st = t && (t.status || t.st), d = t && (t.deltaPct != null ? t.deltaPct : t.d);
    if (st === "new") return U.verdict("strong", "Neu");
    if (st === "sold") return U.verdict("weak", "Verkauft");
    if (st === "added" || st === "reduced") return d != null ? U.chg(d, { digits: 1 }) : U.verdict(st === "added" ? "strong" : "weak", st === "added" ? "Aufgestockt" : "Reduziert");
    return '<span class="hf-flat">unverändert</span>';
  }
  function aumChg(f) {
    if (f.jump) return '<span class="hf-flat">Sprung</span>';
    return f.aumChangePct != null ? '<span class="hf-chg">' + U.chg(f.aumChangePct, { digits: 1 }) + "</span>" : "";
  }
  function behind(f) { return S.data.latestPeriod && f.reportDate && f.reportDate < S.data.latestPeriod; }
  function intro(title, lead) {
    return '<header class="hf-intro"><div class="vu-ltag">Hedgefonds</div><h1 class="vu-lt">' + title + "</h1>" + (lead ? '<p class="vu-lead">' + lead + "</p>" : "") + "</header>";
  }
  function kick(tag, title, id) {
    return '<div class="hf-kick"><div class="vu-ltag">' + tag + '</div><h2 class="vu-mt"' + (id ? ' id="' + id + '"' : "") + ">" + title + "</h2></div>";
  }
  function sect(title, href, link) { return U.sect(title, href ? { href: href, link: link } : {}); }
  function sectBtn(title, id, label) {
    return '<div class="vu-sect"><h2>' + title + '</h2><button type="button" class="hf-link" id="' + id + '">' + label + "</button></div>";
  }
  function seg(items, active, attr) {
    return '<div class="vu-seg hf-seg" ' + (attr || "") + ">" + items.map(function (it) {
      if (it.href) return '<a href="' + it.href + '"' + (it.id === active ? ' aria-current="page"' : "") + ">" + it.label + "</a>";
      return '<button type="button" data-v="' + it.id + '" aria-pressed="' + (it.id === active) + '">' + it.label + "</button>";
    }).join("") + "</div>";
  }
  function bindSeg(el, fn) {
    if (!el) return;
    el.addEventListener("click", function (e) {
      var b = e.target.closest("[data-v]");
      if (!b) return;
      [].forEach.call(el.querySelectorAll("[data-v]"), function (x) { x.setAttribute("aria-pressed", x === b); });
      fn(b.getAttribute("data-v"));
    });
  }
  function tileLink(href, label, value, sub) { return '<a class="hf-tilelink" href="' + href + '">' + U.tile(label, value, sub) + "</a>"; }
  function searchBox(id, resId, ph) {
    return '<div class="hf-find"><label class="hf-search">' + U.glyph("search", 18) + '<input id="' + id + '" type="search" placeholder="' + esc(ph) +
      '" autocomplete="off" aria-label="' + esc(ph) + '"></label><div class="hf-spanel" id="' + resId + '" hidden></div></div>';
  }
  function filterBox(id, ph, value) {
    return '<label class="hf-search hf-search--filter">' + U.glyph("search", 18) + '<input id="' + id + '" type="search" placeholder="' + esc(ph) + '" value="' + esc(value || "") + '" autocomplete="off" aria-label="' + esc(ph) + '"></label>';
  }
  function moreBtn(id, text) { return '<button type="button" class="vu-btn vu-btn--line vu-btn--block hf-morebtn" id="' + id + '"' + (text ? "" : " hidden") + ">" + (text || "") + "</button>"; }
  // Fluss-Zeile: Rang, Logo, Name, Wert, Balken (Kauf neongrün, Verkauf schwarz), Unterzeile
  function flow(rank, item, name, val, sub, width, buy, href) {
    var tag = href ? "a" : "div";
    return "<" + tag + ' class="hf-flow"' + (href ? ' href="' + href + '"' : "") + '><span class="hf-rk">' + rank + "</span>" + logo(item) +
      '<span class="hf-flow-b"><span class="hf-flow-t"><b>' + name + '</b><b class="vu-num">' + val + "</b></span>" +
      '<span class="hf-bar' + (buy ? " is-buy" : "") + '"><i style="width:' + Math.max(1.5, Math.min(100, width)).toFixed(1) + '%"></i></span><small>' + sub + "</small></span></" + tag + ">";
  }
  // Investor-Zeile: Avatar mit Stern, Name, Firma · Stil, Wert, Veränderung
  function invRow(f, o) {
    o = o || {};
    var sub = o.sub != null ? o.sub : [f.manager ? f.name : [f.city, regionLabel(f)].filter(Boolean).join(" · ") || f.style, f.manager && o.style !== false ? f.style : "",
      behind(f) ? "Stand " + quarter(f.reportDate) : "", f.stale ? "meldet nicht mehr" : ""].filter(Boolean).join(" · ");
    return '<a class="hf-inv" href="#/fonds/' + esc(f.slug) + '">' + avatar(f) + '<span class="hf-inv-n"><b>' + esc(f.manager || f.name) + "</b><small>" + esc(sub) + "</small></span>" +
      '<span class="hf-inv-v"><b class="vu-num">' + (o.val != null ? o.val : usd(f.totalValueUSD)) + "</b>" + (o.chg != null ? o.chg : aumChg(f)) + "</span></a>";
  }
  // Anteils-Zeile: Kürzel, Name, Anteil, Veränderung, Balken
  function holdRow(h, max, o) {
    o = o || {};
    var href = !h.putCall && stockHref(h), tag = href ? "a" : "div";
    return "<" + tag + ' class="hf-hold"' + (href ? ' href="' + href + '"' : "") + ">" + '<span class="hf-hold-t">' + logo(h, "sm") + '<span class="hf-hold-n"><b>' + stockName(h) + (o.label ? " · " + o.label : "") + optTag(h) + "</b>" +
      (o.sub ? "<small>" + o.sub + "</small>" : "") + "</span>" + (h.weightPct != null && !o.noWeight ? '<b class="vu-num">' + pct(h.weightPct) + "</b>" : "") + '<span class="hf-hold-m">' + (o.move != null ? o.move : move(h)) + "</span></span>" +
      (h.weightPct != null && !o.noWeight ? U.meter(h.weightPct / (max || 1) * 100, { label: "Anteil im Depot" }) : "") + "</" + tag + ">";
  }
  function explore(href, ico, title) {
    return '<a class="hf-explore" href="' + href + '"><span class="vu-hud hf-hud">' + icon(ico) + "</span><b>" + title + "</b></a>";
  }
  function closeLine(text) { return '<p class="hf-close">' + text + "</p>"; }
  /* Daten & Methodik: einmal je Seite, am Ende (VU3). */
  function dmBlock(stand, rows) {
    return '<p class="hf-legal">Keine Anlageberatung.' + (stand ? " " + stand + "." : "") + '</p><details class="hf-acc hf-dm"><summary>Daten &amp; Methodik</summary><dl>' +
      rows.filter(Boolean).map(function (r) { return "<dt>" + r[0] + "</dt><dd>" + r[1] + "</dd>"; }).join("") + "</dl></details>";
  }
  function footer(extra) {
    var d = S.data, errs = (d.errors || []).length;
    return dmBlock("Stand " + dateDE(d.generatedAt), [
      ["Grundlage", "Quartalsmeldungen der Investoren (Form 13F-HR)."],
      ["Datenstand", esc(d.latestPeriodLabel || "") + (d.latestPeriodLabel ? " · " : "") + "zuletzt geprüft " + dateDE(d.generatedAt) + (errs ? " · " + errs + " Fonds derzeit nicht abrufbar" : "") + "."],
      ["Was 13F zeigt", "Nur US-Aktien, ETFs und börsennotierte Optionen zum Quartalsende, veröffentlicht bis zu 45 Tage später. Keine Short-Positionen, Anleihen oder ausländischen Aktien."],
      ["Käufe & Verkäufe", "Aus dem Vergleich zweier Quartale abgeleitet; Handelszeitpunkt und -preis sind nicht bekannt. Volumen = Stückzahländerung × Kurs zum Quartalsende, daher geschätzt. Put/Call-Positionen stehen mit dem Wert des Basiswerts."],
      ["Zuordnung", "Ticker: OpenFIGI. Porträts: Wikimedia Commons, Urheber und Lizenz in der Detailansicht des Fonds."]
    ].concat(extra || []));
  }
  function backLink(href, label) {
    return '<a class="hf-back" href="' + href + '">' + U.glyph("back", 18) + label + "</a>";
  }
  function sheetHtml(id, title, body) { return U.sheet(id, title, body); }
  function openSheetHtml(id, title, body) {
    var old = document.getElementById(id);
    if (old) old.remove();
    var wrap = document.createElement("div");
    wrap.innerHTML = sheetHtml(id, title, body);
    var el = wrap.firstChild;
    el.classList.add("vu-ui");
    document.body.appendChild(el);
    el.addEventListener("click", function (e) { if (e.target.closest("[data-close]")) U.closeSheet(el); });
    U.openSheet(el);
    el.querySelector(".vu-sheet-ui").scrollTop = 0;
    return el;
  }
  function pill(v, label, on, attr) {
    return '<button type="button" class="vu-chip" data-' + (attr || "v") + '="' + esc(v) + '" aria-pressed="' + !!on + '">' + label + "</button>";
  }

  /* ---------------------------------------------------------------- H01 Start */
  function starCard(f) {
    var top = (f.top || []).filter(function (h) { return !h.putCall; }).slice(0, 2).map(function (h) { return esc(issuerName(h)) + " " + pct(h.weightPct); }).join(" · ");
    return '<a class="vu-box hf-scard" href="#/fonds/' + esc(f.slug) + '"><span class="hf-scard-top">' + avatar(f, "md") + '<span class="hf-inv-n"><b>' + esc(f.manager || f.name) +
      "</b><small>" + esc([f.manager ? f.name : "", f.style].filter(Boolean).join(" · ")) + "</small></span></span>" +
      '<span class="hf-card-val"><b class="vu-num">' + usd(f.totalValueUSD) + "</b>" + aumChg(f) + "</span>" +
      '<span class="hf-scard-hold">' + top + '</span><small class="hf-scard-q">' + (behind(f) ? "Stand " : "Meldung ") + quarter(f.reportDate) + "</small></a>";
  }
  function renderHome() {
    var d = S.data, inv = investors(), dl = nextDeadline(), n = hfCount();
    var featured = FEATURED.map(function (s) { return S.bySlug[s]; }).filter(Boolean);
    document.title = "Hedgefonds — Vision Universe®";
    root.innerHTML = intro("Was große Fonds gemeldet haben (13F)", "Große Investoren müssen ihre US-Aktien alle drei Monate der Börsenaufsicht melden. Wir zeigen, was sie kaufen und verkaufen.") +
      '<p class="hf-stand"><i aria-hidden="true"></i>Meldungen für ' + esc(d.latestPeriodLabel || "–") + " · geprüft am " + dateDE(d.generatedAt) + "</p>" +
      searchBox("hf-q", "hf-qres", "Investor, Fonds oder Aktie …") +
      '<div class="vu-chips hf-quick">' + POPULAR.map(function (p) { return '<a class="vu-chip" href="#/' + p[1] + "/" + p[2] + '">' + esc(p[0]) + "</a>"; }).join("") + "</div>" +
      '<div class="vu-grid hf-tiles" style="--vu-cols:3">' + tileLink("#/investoren/alle", "Hedgefonds", nf0.format(n), "davon " + inv.length + " Stars") +
        tileLink("#/investoren/alle?f=dach", "DACH", String(d.dachCount || 0), "Melder") +
        U.tile("Nächste Frist", dateDE(dl.toISOString()).slice(0, 6), "für " + deadlineQuarter(dl)) + "</div>" +
      '<div class="hf-gap">' + U.help("13F-Meldung: Pflichtliste der US-Aktien eines großen Investors. Sie kommt bis 45 Tage nach Quartalsende, die Daten sind also nicht von heute.") + "</div>" +
      sect("Star-Investoren", "#/investoren", "Alle " + inv.length) +
      '<div class="hf-track">' + featured.map(starCard).join("") + "</div>" +
      kick("Käufe und Verkäufe im Quartal", "", "hf-aggt") +
      seg([{ id: "star", label: "Star-Investoren" }, { id: "all", label: "Alle Hedgefonds" }], S.aggMode, 'id="hf-aggmode" role="group" aria-label="Fonds-Auswahl"') +
      '<div id="hf-agg"></div>' +
      '<div class="hf-gap">' + U.help("Geschätzter Wert: gekaufte oder verkaufte Stückzahl mal Kurs am Quartalsende.") + "</div>" +
      sect("Meistgehalten bei Stars", "#/aktien", "Alle Aktien") + '<div id="hf-cons"></div>' +
      sect("Entdecken") +
      '<div class="vu-grid hf-explores">' + explore("#/investoren", "users", "Star-Investoren") + explore("#/aktien", "chart", "Aktien") +
        explore("#/smart-money", "key", "Insider-Käufe") + explore("#/investoren/alle?f=dach", "globe", "Deutschland &amp; DACH") + "</div>" +
      footer();
    renderAgg();
    attachSearch(document.getElementById("hf-q"), document.getElementById("hf-qres"), { inline: true });
    bindSeg(document.getElementById("hf-aggmode"), function (v) { S.aggMode = v; renderAgg(); });
  }
  function aggFlows(list, kind) {
    var max = list.length ? Math.abs(list[0].estValueUSD) || 1 : 1;
    return list.map(function (a, i) {
      var sub = a.fundCount + " Fonds" + (kind === "buys" ? (a.newCount ? " · " + a.newCount + " neu" : "") : (a.soldCount ? " · " + a.soldCount + " komplett raus" : ""));
      return flow(i + 1, a, stockName(a), usd(a.estValueUSD), sub, Math.abs(a.estValueUSD) / max * 100, kind === "buys", stockHref(a));
    }).join("") || '<p class="hf-none">Keine Daten für dieses Quartal.</p>';
  }
  function renderAgg() {
    if (S.aggMode === "all" && S.data.aggregatesAll && !S.uniReady) {
      ensureUniverse().then(function () { if (document.getElementById("hf-agg")) renderAgg(); });
      return;
    }
    var all = S.aggMode === "all" && S.data.aggregatesAll;
    var agg = (all ? S.data.aggregatesAll : S.data.aggregates) || {}, stars = S.data.aggregates || {};
    document.getElementById("hf-aggt").textContent = all ? "Was alle Hedgefonds bewegt haben" : "Was die Stars bewegt haben";
    document.getElementById("hf-agg").innerHTML =
      '<h3 class="hf-flowh">' + U.glyph("plus", 15) + "Größte Käufe</h3>" + aggFlows((agg.buys || []).slice(0, 3), "buys") +
      '<h3 class="hf-flowh">' + U.glyph("x", 15) + "Größte Verkäufe</h3>" + aggFlows((agg.sells || []).slice(0, 3), "sells") +
      '<a class="hf-linkline" href="#/aktien">Alle Käufe und Verkäufe ' + U.glyph("next", 15) + "</a>";
    var c = (stars.consensus || []).slice(0, 4);
    var cons = document.getElementById("hf-cons");
    if (cons) cons.innerHTML = c.map(function (a, i) {
      return '<a class="hf-row" href="' + stockHref(a) + '"><span class="hf-rk">' + (i + 1) + "</span>" + logo(a) + '<span class="hf-inv-n"><b>' + stockName(a) +
        "</b><small>Ø " + pct(a.avgWeightPct) + ' Anteil im Depot</small></span><b class="vu-num hf-big">' + a.fundCount + '</b><small class="hf-unit">Fonds</small></a>';
    }).join("") + '<p class="hf-note-s">Summe über ' + ((stars.funds || []).length) + " Star-Investoren (ohne Quant-Fonds mit Tausenden Positionen).</p>";
  }

  /* ------------------------------------------------- H02/H03 Investoren */
  var STYLE_TEXT = {
    "Value": "Kauft Firmen, die er für zu billig hält, und wartet.",
    "Wachstum": "Kauft Firmen, deren Umsatz schnell steigt.",
    "Aktivist": "Kauft große Anteile und drängt das Management zu Änderungen.",
    "Long/Short": "Setzt auf steigende und auf fallende Kurse.",
    "Qualität": "Kauft Firmen mit hohen Margen und starker Marktstellung und hält sie lange.",
    "Macro": "Setzt auf große Trends bei Zinsen, Währungen und Konjunktur.",
    "Quant": "Computer-Modelle entscheiden, oft Tausende Positionen.",
    "Multi-Strategy": "Viele Teams mit eigenen Ansätzen unter einem Dach.",
    "Event-Driven": "Setzt auf Übernahmen, Abspaltungen und andere Firmenereignisse.",
    "Opportunistisch": "Kein fester Stil, kauft, wo er gerade Chancen sieht.",
    "Distressed": "Kauft Firmen in Schwierigkeiten, oft kurz vor oder in der Insolvenz.",
    "Stiftung": "Verwaltet das Vermögen einer Stiftung, meist sehr langfristig."
  };
  var INV_SORT = [["value", "Größtes Depot"], ["change", "Größtes Plus"], ["drop", "Größtes Minus"], ["concentration", "Am konzentriertesten"], ["filed", "Neueste Meldung"], ["name", "Name A–Z"]];
  var DB_SORT = [["value", "Größtes Depot"], ["change", "Größtes Plus"], ["drop", "Größtes Minus"], ["buys", "Meiste Käufe"], ["filed", "Neueste Meldung"], ["name", "Name A–Z"]];
  function sorter(key) {
    var num = function (v) { return v == null ? -1e12 : v; };
    var buys = function (f) { var t = f.tradeCounts || {}; return (t["new"] || 0) + (t.added || 0); };
    var conc = function (f) { return (f.top || []).slice(0, 5).reduce(function (s, h) { return s + h.weightPct; }, 0); };
    return ({
      value: function (a, b) { return b.totalValueUSD - a.totalValueUSD; },
      change: function (a, b) { return num(b.aumChangePct) - num(a.aumChangePct); },
      drop: function (a, b) { return (a.aumChangePct == null ? 1e12 : a.aumChangePct) - (b.aumChangePct == null ? 1e12 : b.aumChangePct); },
      buys: function (a, b) { return buys(b) - buys(a); },
      concentration: function (a, b) { return conc(b) - conc(a); },
      filed: function (a, b) { return String(b.filedDate).localeCompare(String(a.filedDate)); },
      name: function (a, b) { return String(a.manager || a.name).localeCompare(String(b.manager || b.name), "de"); }
    })[key] || function (a, b) { return b.totalValueUSD - a.totalValueUSD; };
  }
  function sortLabel(list, key) { for (var i = 0; i < list.length; i++) if (list[i][0] === key) return list[i][1]; return list[0][1]; }
  function renderInvestors(tab, params) {
    var inv = investors(), hf = hfCount();
    if (tab === "all" && params && params.f) S.dbFilter = params.f;
    document.title = (tab === "all" ? "Alle Fonds" : "Star-Investoren") + " · Hedgefonds — Vision Universe®";
    root.innerHTML = intro("Investoren", tab === "all" ? "Alle " + nf0.format(hf) + " Hedgefonds mit Depotwert, Veränderung und größten Positionen." : "Die bekanntesten Manager mit Depot und allen Käufen und Verkäufen.") +
      seg([{ id: "stars", label: "Star-Investoren " + inv.length, href: "#/investoren" }, { id: "all", label: "Alle Fonds " + nf0.format(hf), href: "#/investoren/alle" }], tab, 'aria-label="Investoren-Liste"') +
      '<div id="hf-invbody"></div>' + footer(tab === "all" ? [["Einordnung", "Ob ein Melder ein Hedgefonds ist, steht nicht in der 13F-Meldung; die Einordnung beruht auf Rechtsform, Optionspositionen und Namen."]] : null);
    if (tab === "all") renderAllFunds(); else renderStars();
  }
  function renderStars() {
    var inv = investors(), body = document.getElementById("hf-invbody"), counts = {};
    inv.forEach(function (f) { counts[f.style] = (counts[f.style] || 0) + 1; });
    var styles = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });
    body.innerHTML = '<div class="hf-tools">' + filterBox("hf-invq", "Name, z. B. „Buffett“", S.invQ) + "</div>" +
      '<div class="vu-chips hf-quick" id="hf-styles">' + pill("Alle", "Alle " + inv.length, S.style === "Alle", "style") + styles.map(function (s) {
        return pill(s, esc(s) + " " + counts[s], S.style === s, "style");
      }).join("") + '<button type="button" class="vu-chip hf-chip-q" id="hf-stylehelp" aria-label="Was heißt welcher Stil?">?</button></div>' +
      '<div class="hf-listhead"><span id="hf-invcount"></span><button type="button" class="hf-link" id="hf-sortbtn">' + U.glyph("filter", 14) + '<span id="hf-sortl"></span></button></div>' +
      '<div id="hf-invlist"></div><div class="hf-gap">' + U.help("Die Prozentzahl ist die Veränderung des gemeldeten Depotwerts zum Vorquartal. Sie enthält Kursgewinne und Zukäufe und ist keine Rendite.") + "</div>" +
      moreBtn("hf-invmore") + closeLine("Meldungen " + esc(S.data.latestPeriodLabel || "") + ".");
    function draw() {
      var tokens = words(S.invQ);
      var list = inv.filter(function (f) {
        if (S.style !== "Alle" && f.style !== S.style) return false;
        return !tokens.length || matchScore(tokens, fundFields(f)) > 0;
      }).sort(sorter(S.sort));
      var shown = list.slice(0, S.invShown || INV_PAGE), more = document.getElementById("hf-invmore");
      document.getElementById("hf-invlist").innerHTML = shown.length ? shown.map(function (f) { return invRow(f); }).join("") : '<p class="hf-none">Kein Investor passt dazu.</p>';
      document.getElementById("hf-invcount").textContent = list.length + (list.length === 1 ? " Investor" : " Investoren");
      document.getElementById("hf-sortl").textContent = sortLabel(INV_SORT, S.sort);
      more.hidden = list.length <= shown.length;
      more.textContent = "Weitere " + Math.min(INV_PAGE, list.length - shown.length) + " anzeigen";
    }
    draw();
    document.getElementById("hf-invmore").addEventListener("click", function () { S.invShown = (S.invShown || INV_PAGE) + INV_PAGE; draw(); });
    document.getElementById("hf-invq").addEventListener("input", function () { S.invQ = this.value; S.invShown = INV_PAGE; draw(); });
    document.getElementById("hf-styles").addEventListener("click", function (e) {
      var b = e.target.closest("[data-style]");
      if (!b) return;
      S.style = b.getAttribute("data-style"); S.invShown = INV_PAGE;
      [].forEach.call(this.querySelectorAll("[data-style]"), function (x) { x.setAttribute("aria-pressed", x === b); });
      draw();
    });
    document.getElementById("hf-stylehelp").addEventListener("click", function () {
      openSheetHtml("hf-sheet-style", "Was heißt welcher Stil?", styles.map(function (s) {
        return '<div class="hf-kvrow"><span><b>' + esc(s) + "</b><small>" + esc(STYLE_TEXT[s] || "Eigener Ansatz des Managers.") + '</small></span><b class="vu-num">' + counts[s] + "</b></div>";
      }).join("") + '<div class="hf-gap">' + U.help("Wichtig: 13F zeigt nur Kauf-Positionen in US-Aktien. Wetten auf fallende Kurse fehlen.") + "</div>" +
        '<button type="button" class="vu-btn vu-btn--ink vu-btn--block hf-gap" data-close>Verstanden</button>');
    });
    document.getElementById("hf-sortbtn").addEventListener("click", function () {
      var el = openSheetHtml("hf-sheet-sort", "Sortieren", '<div class="hf-pills">' + INV_SORT.map(function (o) { return pill(o[0], o[1], S.sort === o[0]); }).join("") + "</div>");
      el.addEventListener("click", function (e) {
        var b = e.target.closest("[data-v]");
        if (!b) return;
        S.sort = b.getAttribute("data-v"); S.invShown = INV_PAGE; U.closeSheet(el); draw();
      });
    });
  }
  function renderAllFunds() {
    var all = dbAll(), body = document.getElementById("hf-invbody"), hf = hfCount(), star = investors().length;
    var dach = all.filter(function (f) { return f.region; }).length, inst = institutions();
    var am = all.filter(function (f) { return !isHF(f) && !f.region; }).length;
    if (S.dbStale == null) S.dbStale = true;
    var chip = function (k, label, cnt) { return pill(k, label + " " + nf0.format(cnt), S.dbFilter === k, "db"); };
    body.innerHTML = '<div class="hf-tools">' + filterBox("hf-dbq", "Fonds, Manager oder Stadt", S.dbQ) + "</div>" +
      '<div class="vu-chips hf-quick" id="hf-dbfilter">' + chip("all", "Alle", hf) + pill("star", icon("star") + " Stars " + star, S.dbFilter === "star", "db") + chip("dach", "DACH", dach) +
        (inst.length ? chip("inst", "Institutionen", inst.length) : "") + chip("more", "Weitere Hedgefonds", hf - star) + chip("am", "Vermögensverwalter", am) + "</div>" +
      '<div class="hf-listhead"><span id="hf-dbcount"></span><button type="button" class="hf-link" id="hf-dbfbtn">' + U.glyph("filter", 14) + "Filter</button></div>" +
      '<div id="hf-dblist"></div><div class="hf-gap">' + U.help("Stern = Star-Investor mit Porträt und Erklärung. Alle anderen sind Fonds, die eine 13F-Meldung abgeben, oft mit Sitz in den USA.") + "</div>" +
      moreBtn("hf-dbmore");
    function filtered() {
      var tokens = words(S.dbQ), src = S.dbFilter === "inst" ? inst : all;
      return src.filter(function (f) {
        if (S.dbFilter === "all" && !isHF(f)) return false;
        if ((S.dbFilter === "star" || S.dbStarOnly) && f.category !== "Investoren") return false;
        if (S.dbFilter === "more" && (f.category === "Investoren" || f.style !== "Hedgefonds")) return false;
        if ((S.dbFilter === "dach" || S.dbRegion === "dach") && !f.region) return false;
        if (S.dbFilter === "am" && (isHF(f) || f.region)) return false;
        if (!S.dbStale && behind(f)) return false;
        return !tokens.length || matchScore(tokens, fundFields(f)) > 0;
      }).sort(sorter(S.dbSort));
    }
    function draw() {
      var list = filtered(), shown = list.slice(0, S.dbShown), showChg = S.dbSort === "change" || S.dbSort === "drop";
      document.getElementById("hf-dblist").innerHTML = shown.length ? shown.map(function (f) { return invRow(f, { chg: showChg ? aumChg(f) : "", style: false }); }).join("") : '<p class="hf-none">Kein Fonds passt zur Suche.</p>';
      document.getElementById("hf-dbcount").textContent = nf0.format(list.length) + " Fonds · " + sortLabel(DB_SORT, S.dbSort);
      var more = document.getElementById("hf-dbmore");
      more.hidden = list.length <= shown.length;
      more.textContent = "Weitere " + Math.min(PAGE, list.length - shown.length) + " anzeigen";
    }
    draw();
    document.getElementById("hf-dbq").addEventListener("input", function () { S.dbQ = this.value; S.dbShown = PAGE; draw(); });
    document.getElementById("hf-dbmore").addEventListener("click", function () { S.dbShown += PAGE; draw(); });
    document.getElementById("hf-dbfilter").addEventListener("click", function (e) {
      var b = e.target.closest("[data-db]");
      if (!b) return;
      S.dbFilter = b.getAttribute("data-db"); S.dbShown = PAGE;
      [].forEach.call(this.querySelectorAll("[data-db]"), function (x) { x.setAttribute("aria-pressed", x === b); });
      draw();
    });
    document.getElementById("hf-dbfbtn").addEventListener("click", function () {
      var el = openSheetHtml("hf-sheet-filter", "Fonds filtern",
        '<div class="vu-sect"><h3>Sortieren</h3></div><div class="hf-pills" data-group="sort">' + DB_SORT.map(function (o) { return pill(o[0], o[1], S.dbSort === o[0]); }).join("") + "</div>" +
        '<div class="vu-sect"><h3>Region</h3></div><div class="hf-pills" data-group="region">' + pill("all", "Alle", S.dbRegion !== "dach") + pill("dach", "Deutschland &amp; DACH", S.dbRegion === "dach") + "</div>" +
        '<div class="vu-sect"><h3>Anzeigen</h3></div><div class="hf-kvrow"><span><b>Nur Star-Investoren</b></span>' + U.toggle(S.dbStarOnly, "", "star") + "</div>" +
        '<div class="hf-kvrow"><span><b>Fonds ohne neue Meldung</b><small>Letzte Meldung älter als ' + esc(S.data.latestPeriodLabel || "") + "</small></span>" + U.toggle(S.dbStale, "", "stale") + "</div>" +
        '<button type="button" class="vu-btn vu-btn--block hf-gap" data-close id="hf-dbapply"></button>');
      function count() { document.getElementById("hf-dbapply").textContent = nf0.format(filtered().length) + " Fonds zeigen"; }
      count();
      el.addEventListener("click", function (e) {
        var b = e.target.closest("[data-v]");
        if (b) {
          var g = b.parentNode.getAttribute("data-group");
          if (g === "sort") S.dbSort = b.getAttribute("data-v"); else S.dbRegion = b.getAttribute("data-v");
          [].forEach.call(b.parentNode.querySelectorAll("[data-v]"), function (x) { x.setAttribute("aria-pressed", x === b); });
          count();
        }
        if (e.target.closest("[data-close]")) { S.dbShown = PAGE; draw(); }
      });
      el.addEventListener("change", function (e) {
        if (e.target.name === "star") S.dbStarOnly = e.target.checked;
        if (e.target.name === "stale") S.dbStale = e.target.checked;
        count();
      });
    });
  }

  /* --------------------------------------------------------------- H04 Aktien */
  function renderStocks() {
    document.title = "Aktien · Hedgefonds — Vision Universe®";
    var all = S.data.aggregatesAll || S.data.aggregates || {};
    var sShown = 10, fShown = 5, fKind = "buys";
    root.innerHTML = intro("Wer hält welche Aktie?", "Tippe eine Aktie an und sieh, welche Fonds sie halten, kaufen oder verkaufen.") +
      searchBox("hf-sq", "hf-sqres", "Aktie oder Kürzel, z. B. „pal“") +
      sectBtn("Meistgehalten", "hf-sall", "Alle") +
      seg([{ id: "all", label: "Alle Fonds" }, { id: "star", label: "Star-Investoren" }], S.stockMode, 'id="hf-smode" role="group" aria-label="Fonds-Auswahl"') +
      '<div id="hf-sgrid" class="hf-list"><div class="hf-skeleton"></div></div>' + moreBtn("hf-smore") +
      '<div class="hf-gap">' + U.help("Gezählt wird, bei wie vielen Hedgefonds die Aktie zu den gemeldeten Positionen gehört.") + "</div>" +
      kick("Käufe und Verkäufe im Quartal", "Über alle Hedgefonds") +
      seg([{ id: "buys", label: "Käufe" }, { id: "sells", label: "Verkäufe" }], fKind, 'id="hf-fkind" role="group" aria-label="Käufe oder Verkäufe"') +
      '<div id="hf-flows" class="hf-list"></div>' + moreBtn("hf-fmore") +
      '<div class="hf-gap">' + U.help("Dieselbe Aktie kann in beiden Listen stehen: Manche Fonds kaufen, andere verkaufen.") + "</div>" +
      sect("Mehr") + '<div class="vu-stack">' +
        U.navcard({ href: "#/smart-money", glyph: "line", title: "Insider-Käufe", sub: "Chefs kaufen eigene Aktien" }) +
        U.navcard({ href: "#/smart-money/einstiege", glyph: "plus", title: "Fonds-Einstiege", sub: "Neue Positionen im Quartal" }) + "</div>" +
      footer();
    attachSearch(document.getElementById("hf-sq"), document.getElementById("hf-sqres"), { inline: true, stocksOnly: true, stockLimit: 10 });
    function draw() {
      var list = (S.stockIndex || []).slice(), star = S.stockMode === "star";
      if (star) list = list.filter(function (s) { return s.starCount; }).sort(function (a, b) { return b.starCount - a.starCount || b.valueUSD - a.valueUSD; });
      var shown = list.slice(0, sShown), max = shown.length ? (star ? shown[0].starCount : shown[0].fundCount) : 1;
      document.getElementById("hf-sall").textContent = "Alle " + nf0.format(list.length);
      document.getElementById("hf-sgrid").innerHTML = shown.map(function (s, i) {
        var cnt = star ? s.starCount : s.fundCount;
        return '<a class="hf-row hf-row--bar" href="' + stockHref(s) + '"><span class="hf-rk">' + (i + 1) + "</span>" + logo(s) +
          '<span class="hf-inv-n"><b>' + esc(issuerName(s)) + "</b>" + U.meter(cnt / max * 100, { label: star ? "Star-Investoren" : "Fonds" }) + "</span>" +
          '<span class="hf-inv-v"><b class="vu-num">' + nf0.format(cnt) + "</b><small>" + (star ? "Stars · " + nf0.format(s.fundCount) + " Fonds" : nf0.format(s.starCount) + " Stars") + "</small></span></a>";
      }).join("") || '<p class="hf-none">Aktienliste wird geladen …</p>';
      var more = document.getElementById("hf-smore");
      more.hidden = list.length <= shown.length;
      more.textContent = "Weitere " + Math.min(20, list.length - shown.length) + " anzeigen";
    }
    function drawFlows() {
      var list = all[fKind] || [], shown = list.slice(0, fShown), max = shown.length ? Math.abs(shown[0].estValueUSD) || 1 : 1;
      document.getElementById("hf-flows").innerHTML = shown.map(function (a, i) {
        var sub = a.fundCount + " Fonds" + (fKind === "buys" ? (a.newCount ? " · " + a.newCount + " neu" : "") : (a.soldCount ? " · " + a.soldCount + " komplett raus" : ""));
        return flow(i + 1, a, stockName(a), usd(a.estValueUSD), sub, Math.abs(a.estValueUSD) / max * 100, fKind === "buys", stockHref(a));
      }).join("") || '<p class="hf-none">Keine Daten für dieses Quartal.</p>';
      var more = document.getElementById("hf-fmore");
      more.hidden = list.length <= shown.length;
      more.textContent = "Alle " + list.length + " anzeigen";
    }
    drawFlows();
    loadStockIndex().then(function () { if (location.hash.indexOf("#/aktien") === 0) draw(); });
    bindSeg(document.getElementById("hf-smode"), function (v) { S.stockMode = v; sShown = 10; draw(); });
    bindSeg(document.getElementById("hf-fkind"), function (v) { fKind = v; fShown = 5; drawFlows(); });
    document.getElementById("hf-smore").addEventListener("click", function () { sShown += 20; draw(); });
    document.getElementById("hf-sall").addEventListener("click", function () { sShown = Math.max(sShown, 50); draw(); });
    document.getElementById("hf-fmore").addEventListener("click", function () { fShown = 1e9; drawFlows(); });
  }

  /* ------------------------------------------- H07 Aktie, Perspektive Investoren
     Einheitlicher Kopf (C04 + C05) über VUStockNavigator.head; Kurs = veröffentlichter
     Schluss aus Discover (wie Fundamental), fehlt er, zeigt der Kopf keinen. */
  function quoteFrom(raw) {
    var p = raw && raw.price, at = raw && raw.asOf;
    if (!p || typeof p.value !== "number" || !isFinite(p.value) || p.value <= 0 || p.reason || typeof at !== "string") return null;
    var c = raw.changePercent, ch = c && typeof c.value === "number" && !c.reason ? c.value : null;
    return { value: p.value, currency: "USD", changePct: ch, changeLabel: ch == null ? null : "zum Vortag", kind: "close", at: dateDE(at.slice(0, 10)) };
  }
  function stockHeadFallback(item, name, back, backLabel) {
    return backLink(back, backLabel) + '<header class="hf-shead-plain">' + logo(item, "xl") + "<div><h1>" + esc(name) + "</h1>" +
      (item.ticker ? "<p>" + esc(item.ticker) + "</p>" : "") + "</div></header>";
  }
  function mountStockHead(ticker, name, back, backLabel) {
    var host = document.getElementById("hf-shead"), SN = window.VUStockNavigator, SCX = window.VUCore && window.VUCore.StockContext, ctx = null, api;
    if (!host || !ticker || !SN || !SCX) return;
    try { ctx = SCX.fromUs(ticker, { name: name }); } catch (e) { ctx = null; }
    if (!ctx) return;
    api = SN.head(host, { ctx: ctx, current: "hedgefonds", name: name, back: { href: back, label: backLabel } });
    getJSON("/discover/data/stocks/US_REAL/" + encodeURIComponent(ticker) + ".json").then(function (raw) {
      var q = quoteFrom(raw);
      if (q && api && api.el && api.el.isConnected) api.setPrice(q);
    }).catch(function () {});
  }
  // C08 aus dem Verhältnis Käufer : Verkäufer (Fonds, die aufgestockt haben, gegen Fonds, die verkleinert oder verkauft haben)
  function balanceVerdict(b, s) {
    var n = b + s;
    if (!n) return { kind: "none", text: "Keine Bewegung", help: "Kein erfasster Fonds hat die Position im Quartal verändert." };
    var r = b / n;
    if (r >= 0.6) return { kind: "strong", text: "Mehr Käufer", help: "Mehr Käufer: Deutlich mehr Fonds haben aufgestockt als verkleinert (mindestens 60 % der Bewegungen sind Käufe)." };
    if (r <= 0.4) return { kind: "weak", text: "Mehr Verkäufer", help: "Mehr Verkäufer: Deutlich mehr Fonds haben verkleinert oder verkauft als aufgestockt (mindestens 60 % der Bewegungen sind Verkäufe)." };
    return { kind: "mid", text: "Ausgeglichen", help: "Ausgeglichen: Etwa gleich viele Fonds haben aufgestockt wie verkleinert (zwischen 40 und 60 % Käufe)." };
  }
  function renderStock(cusip, ticker) {
    var token = location.hash;
    root.innerHTML = backLink("#/aktien", "Alle Aktien") + '<div class="hf-skeleton" style="height:320px"></div>';
    window.scrollTo(0, 0);
    loadStock(cusip).then(function (a) {
      if (location.hash !== token) return;
      if (!a) { root.innerHTML = backLink("#/aktien", "Alle Aktien") + U.blank("Zu dieser Aktie liegen keine Fondsdaten vor."); return; }
      var name = issuerName(a), d = S.data;
      document.title = name + " · Investoren · Hedgefonds — Vision Universe®";
      var holders = a.holders.filter(function (h) { return S.bySlug[h.s]; });
      var stars = holders.filter(function (h) { return S.bySlug[h.s].category === "Investoren"; });
      var buyers = holders.filter(function (h) { return h.st === "new" || h.st === "added"; });
      var reducers = holders.filter(function (h) { return h.st === "reduced"; });
      var sellers = a.sellers.filter(function (h) { return S.bySlug[h.s]; });
      var nSell = reducers.length + sellers.length, nNew = holders.filter(function (h) { return h.st === "new"; }).length;
      var topW = holders[0], vd = balanceVerdict(buyers.length, nSell);
      var starsByValue = stars.slice().sort(function (x, y) { return y.v - x.v; });
      var starSellers = sellers.filter(function (h) { return S.bySlug[h.s].category === "Investoren"; });
      var holderRow = function (h) {
        var f = S.bySlug[h.s];
        return invRow(f, { sub: (f.manager ? f.name : (f.city || f.style || "")) + " · " + pct(h.w) + " Anteil", val: usd(h.v), chg: move(h) });
      };
      root.innerHTML = '<div class="hf-detail"><div id="hf-shead">' + stockHeadFallback(a, name, "#/aktien", "Alle Aktien") + "</div>" +
        '<section class="vu-box vu-box--ink hf-answer" aria-label="Antwort"><div class="hf-answer-top"><span class="vu-ltag">Hedgefonds · ' + esc(d.latestPeriodLabel || "") + "</span>" + U.verdict(vd.kind, vd.text) + "</div>" +
          '<p class="hf-answer-big"><b class="vu-num">' + nf0.format(holders.length) + "</b><span>Fonds halten " + esc(name) + "</span></p>" +
          "<p class=\"hf-answer-sub\">darunter " + stars.length + " Star-Investoren · zusammen " + usd(a.valueUSD) + "</p>" +
          (buyers.length + nSell ? '<div class="hf-balance" role="img" aria-label="' + buyers.length + " Fonds kaufen mehr, " + nSell + ' Fonds verkaufen"><div class="hf-balance-l"><span>' + buyers.length + " kaufen mehr</span><span>" + nSell + " verkaufen</span></div>" +
            '<div class="hf-balance-bar"><i class="b" style="flex-grow:' + buyers.length + '"></i><i class="s" style="flex-grow:' + nSell + '"></i></div></div>' : "") +
          '<p class="hf-answer-foot">' + nNew + " neu eingestiegen · " + sellers.length + " komplett ausgestiegen</p></section>" +
        '<div class="hf-gap">' + U.help(vd.help) + "</div>" +
        (topW ? '<div class="vu-box vu-box--lime hf-lime">' + icon("star") + "<span><b>Größte Überzeugung:</b> " + esc(fundLabel(S.bySlug[topW.s])) + " hat " + pct(topW.w) + " des Depots in " + esc(name) + ".</span></div>" : "") +
        sectBtn("Star-Investoren mit " + esc(name), "hf-hall", "Alle " + stars.length) +
        '<div id="hf-starrows">' + (starsByValue.slice(0, 6).map(holderRow).join("") || U.blank("Kein Star-Investor hält " + name + ".")) + "</div>" +
        '<div class="hf-gap">' + U.help("Rechts die Veränderung der Stückzahl zum Vorquartal. Anteil: Gewicht von " + name + " im Depot des Fonds.") + "</div>" +
        (sellers.length ? '<div class="vu-box vu-box--line hf-gap"><b class="vu-sm">Komplett ausgestiegen' + (starSellers.length ? " (Stars), u. a." : ", u. a.") + '</b><p class="vu-sm hf-gap-s">' +
          (starSellers.length ? starSellers : sellers).slice(0, 3).map(function (h) { var f = S.bySlug[h.s]; return esc(f.manager || f.name) + " (" + (f.manager ? esc(f.name) + ", " : "") + "zuvor " + usd(h.v) + ")"; }).join(" · ") + "</p></div>" : "") +
        '<details class="hf-acc" id="hf-allacc"><summary>Alle ' + holders.length + " Fonds mit " + esc(name) + "</summary>" +
          seg([{ id: "all", label: "Alle " + holders.length }, { id: "star", label: "Stars " + stars.length }], "all", 'id="hf-hmode" role="group" aria-label="Fonds-Auswahl"') +
          '<div id="hf-hlist"></div>' + moreBtn("hf-hmore") +
          (sellers.length ? '<h3 class="hf-flowh">' + sellers.length + " komplett ausgestiegen</h3>" + sellers.map(function (h) { var f = S.bySlug[h.s]; return invRow(f, { sub: "zuvor " + usd(h.v), val: usd(f.totalValueUSD), chg: U.verdict("weak", "Verkauft") }); }).join("") : "") +
        "</details>" +
        (a.ticker ? '<div id="hf-sm"></div>' : "") +
        footer([["Aktie", esc(name) + (a.ticker ? " · " + esc(a.ticker) : "") + " · CUSIP " + esc(a.cusip)],
          ["Abdeckung", "Berücksichtigt sind je Fonds die größten gemeldeten Positionen (Star-Investoren: 150, weitere Hedgefonds: 50). Kleinere Beteiligungen können fehlen. Anteil = Gewicht der Aktie im jeweiligen 13F-Portfolio."],
          ["Urteil", "Mehr Käufer ab 60 % Käufen unter allen Bewegungen, Mehr Verkäufer ab 60 % Verkäufen, dazwischen ausgeglichen."]]) + "</div>";
      mountStockHead(a.ticker || ticker, name, "#/aktien", "Alle Aktien");
      var hShown = 15, hMode = "all";
      function draw() {
        var list = hMode === "star" ? stars : holders, shown = list.slice(0, hShown), more = document.getElementById("hf-hmore");
        document.getElementById("hf-hlist").innerHTML = shown.map(holderRow).join("") || '<p class="hf-none">Keine Star-Investoren unter den Haltern.</p>';
        more.hidden = list.length <= shown.length;
        more.textContent = "Alle " + list.length + " Fonds zeigen";
      }
      draw();
      bindSeg(document.getElementById("hf-hmode"), function (v) { hMode = v; hShown = 15; draw(); });
      document.getElementById("hf-hmore").addEventListener("click", function () { hShown = 1e9; draw(); });
      document.getElementById("hf-hall").addEventListener("click", function () {
        var acc = document.getElementById("hf-allacc");
        acc.open = true;
        hMode = "star"; hShown = 1e9;
        [].forEach.call(acc.querySelectorAll("[data-v]"), function (x) { x.setAttribute("aria-pressed", x.getAttribute("data-v") === "star"); });
        draw();
        acc.scrollIntoView({ block: "start" });
      });
      smartMoneyBlock(a.ticker || ticker, name);
    }).catch(function (err) {
      root.innerHTML = backLink("#/aktien", "Alle Aktien") + U.blank("Aktie konnte nicht geladen werden (" + err.message + ").");
    });
  }

  /* --------------------------------------------------------- H06 Smart Money
     Eigener Bereich neben den 13F-Fondsportfolios: Insider-Käufe (Form 4)
     und Fonds-Einstiege über alle 13F-Melder sowie 13D-Großbeteiligungen.
     Quelle sind die Eigentümer-Signale, nicht die Fondsliste oben. */
  var ROLE = { officer: "Führungskraft", director: "Board-Mitglied", tenPercentOwner: "Großaktionär (>10 %)", other: "Sonstige" };
  function roleLabel(r) {
    return String(r || "").split(",").filter(Boolean).map(function (x) { return ROLE[x] || x; }).join(" · ") || "–";
  }
  function personName(n) {
    // Form-4-Namen stehen als "NACHNAME VORNAME" in Großbuchstaben
    if (!n) return "Unbekannt";
    if (n !== n.toUpperCase()) return n;
    var w = n.toLowerCase().split(/\s+/).map(function (x) { return x.charAt(0).toUpperCase() + x.slice(1); });
    return w.length > 1 ? w.slice(1).join(" ") + " " + w[0] : w[0];
  }
  function tickerItem(t, name) {
    var hit = null, list = S.stockIndex || [];
    for (var i = 0; i < list.length; i++) if (list[i].ticker === t) { hit = list[i]; break; }
    return hit || { ticker: t, name: name || t };
  }
  function tickerName(it) { return it.name === it.ticker ? it.ticker : issuerName(it); }
  function tickerHref(t) { return "#/aktie/" + encodeURIComponent(t); }
  function smFlows(rows, val, sub, metric, n) {
    if (!rows || !rows.length) return U.blank("Aktuell keine Fälle.");
    var max = Math.max.apply(null, rows.map(function (r) { return Math.abs(metric(r)) || 0; })) || 1;
    return rows.slice(0, n).map(function (r, i) {
      var it = tickerItem(r.ticker, r.name);
      return flow(i + 1, it, esc(tickerName(it)), val(r), sub(r), Math.abs(metric(r)) / max * 100, true, tickerHref(r.ticker));
    }).join("");
  }
  function smFooter(asOf, extra) {
    return dmBlock(asOf ? "Stand " + dateDE(asOf) : "", [
      ["Quelle", "Pflichtmeldungen an die US-Börsenaufsicht SEC (EDGAR): Form 4 (Insider-Geschäfte von Führungskräften, Board-Mitgliedern und Aktionären mit mehr als 10 %), Schedule 13D/13G (Beteiligungen über 5 %) und Form 13F aller meldepflichtigen Verwalter."],
      ["Gezählt", "Nur Käufe und Verkäufe über die Börse (Codes P und S), keine Optionsausübungen, Schenkungen oder Vergütungsaktien. Werte nach Einreichungsdatum, nicht nach Handelstag. 13F-Meldungen erscheinen bis zu 45 Tage nach Quartalsende."],
      asOf ? ["Datenstand", "Eigentümer-Daten vom " + dateDE(asOf) + "."] : null
    ].concat(extra || []));
  }
  function smMissing() {
    return U.blank("Die Insider- und Fondsdaten aus SEC EDGAR sind noch nicht veröffentlicht. Sie erscheinen nach dem nächsten wöchentlichen Datenlauf.");
  }
  function insiderSheet() {
    openSheetHtml("hf-sheet-insider", "Wer ist ein Insider?", [["users", "Vorstand und Geschäftsführung", "Zum Beispiel CEO oder Finanzchef"], ["table", "Board-Mitglieder", "Der Aufsichtsrat der Firma"], ["pie", "Großaktionäre", "Wer mehr als 10 % der Aktien hält"]].map(function (r) {
      return '<div class="hf-kvrow hf-kvrow--ico"><span class="vu-hud hf-hud">' + icon(r[0]) + "</span><span><b>" + r[1] + "</b><small>" + r[2] + "</small></span></div>";
    }).join("") + '<div class="vu-sect"><h3>Was wir zeigen</h3></div>' + U.help("Nur Käufe und Verkäufe über die Börse. Geschenkte Aktien und Optionen aus dem Gehalt zählen nicht als Kauf.") +
      '<div class="hf-gap">' + U.help("Mehrere Aktiengattungen einer Firma zählen als eine Firma.") + "</div>" +
      '<button type="button" class="vu-btn vu-btn--ink vu-btn--block hf-gap" data-close>Verstanden</button>');
  }
  function renderSmartMoney(tab) {
    document.title = "Smart Money · Hedgefonds — Vision Universe®";
    var insider = tab !== "funds";
    root.innerHTML = intro("Smart Money", insider ? "Wenn Chefs und Großaktionäre mit eigenem Geld Aktien der eigenen Firma kaufen." : "Welche Aktien die meisten Fonds neu ins Depot genommen haben, über alle 13F-Melder, und wo Investoren über 5 % eingestiegen sind.") +
      seg([{ id: "insider", label: "Insider-Käufe", href: "#/smart-money" }, { id: "funds", label: "Fonds-Einstiege", href: "#/smart-money/einstiege" }], insider ? "insider" : "funds", 'aria-label="Smart Money"') +
      '<div id="hf-smbody"><div class="hf-skeleton" style="height:360px"></div></div>';
    Promise.all([loadOwnHighlights(), loadStockIndex()]).then(function (res) {
      var h = res[0], body = document.getElementById("hf-smbody");
      if (!body || location.hash.indexOf("#/smart-money") !== 0) return;
      if (!h) { body.innerHTML = '<div class="hf-gap">' + smMissing() + "</div>" + smFooter(null); return; }
      var nA = 6, nB = 5;
      if (insider) {
        var cb = h.clusterBuys || [], nb = h.largestNetInsiderBuys90 || [], top = nb[0];
        var draw = function () {
          document.getElementById("hf-cb").innerHTML = smFlows(cb, function (r) { return r.buyers90 + " Insider"; }, function (r) { return "netto " + usd(r.netBuyUsd90) + (r.netBuyUsd90 >= 0 ? " gekauft" : ""); }, function (r) { return r.buyers90; }, nA);
          document.getElementById("hf-nb").innerHTML = smFlows(nb, function (r) { return usd(r.netBuyUsd90); }, function (r) { return r.buyers90 + " Käufer"; }, function (r) { return r.netBuyUsd90; }, nB);
          document.getElementById("hf-cbmore").hidden = cb.length <= nA;
          document.getElementById("hf-nbmore").hidden = nb.length <= nB;
        };
        body.innerHTML = '<div class="vu-box vu-box--lime hf-why"><b>Warum das zählt</b><p>Verkäufe haben viele Gründe, etwa Steuern. Ein Kauf mit eigenem Geld meist nur einen: Vertrauen in die eigene Firma.</p></div>' +
          '<div class="vu-grid hf-tiles" style="--vu-cols:3">' + U.tile("Gruppen-Käufe", String(cb.length), "mind. 3 Insider") +
            (top ? tileLink(tickerHref(top.ticker), "Größter Kauf", top.ticker, usd(top.netBuyUsd90)) : U.tile("Größter Kauf", "–", "")) +
            U.tile("Stand", dateDE(h.asOf).slice(0, 6), "Form 4") + "</div>" +
          '<div class="hf-gap">' + U.help("Insider müssen jeden Kauf binnen zwei Geschäftstagen melden (Form 4). Diese Daten sind also fast aktuell, anders als die 13F-Meldungen der Fonds.") + "</div>" +
          '<button type="button" class="hf-link hf-gap" id="hf-insq">' + U.glyph("book", 15) + "Wer ist ein Insider?</button>" +
          sect("Gruppen-Käufe · 30 Tage") + '<div id="hf-cb"></div>' + moreBtn("hf-cbmore", "Alle " + cb.length + " anzeigen") +
          '<div class="hf-gap">' + U.help("Gruppen-Kauf: Mindestens drei Insider kaufen innerhalb von 30 Tagen. Das ist seltener als ein Einzelkauf.") + "</div>" +
          sect("Größte Netto-Käufe · 90 Tage") + '<div id="hf-nb"></div>' + moreBtn("hf-nbmore", "Alle " + nb.length + " anzeigen") +
          '<div class="hf-gap">' + U.help("Netto: Käufe minus Verkäufe aller Insider in 90 Tagen. Insider über mehrere Aktiengattungen werden je Firma gezählt.") + "</div>" +
          smFooter(h.asOf);
        draw();
        document.getElementById("hf-cbmore").addEventListener("click", function () { nA = 1e9; draw(); });
        document.getElementById("hf-nbmore").addEventListener("click", function () { nB = 1e9; draw(); });
        document.getElementById("hf-insq").addEventListener("click", insiderSheet);
      } else {
        var ni = h.mostNewInstitutions || [], nd = h.new13D90 || [], per = ni[0] && ni[0].period;
        var drawF = function () {
          document.getElementById("hf-ni").innerHTML = smFlows(ni, function (r) { return "+" + nf0.format(r.newPositions) + " Fonds"; },
            function (r) { return nf0.format(r.exits) + " ausgestiegen · " + nf0.format(r.holders) + " halten"; }, function (r) { return r.newPositions; }, nA);
          document.getElementById("hf-nd").innerHTML = schedList(nd.slice(0, nB));
          document.getElementById("hf-nimore").hidden = ni.length <= nA;
          document.getElementById("hf-ndmore").hidden = nd.length <= nB;
        };
        body.innerHTML = '<div class="vu-grid hf-tiles hf-gap-l" style="--vu-cols:3">' +
            (ni[0] ? tileLink(tickerHref(ni[0].ticker), "Meiste Einstiege", ni[0].ticker, "+" + nf0.format(ni[0].newPositions) + " Fonds") : U.tile("Meiste Einstiege", "–", "")) +
            U.tile("Neue 13D", String(nd.length), "über 5 %, 90 Tage") + U.tile("13F-Quartal", per ? quarter(per) : "–", "Stand " + dateDE(h.asOf).slice(0, 6)) + "</div>" +
          sect("Meiste neue Fonds-Positionen" + (per ? " · " + quarter(per) : "")) + '<div id="hf-ni"></div>' + moreBtn("hf-nimore", "Alle " + ni.length + " anzeigen") +
          '<div class="hf-gap">' + U.help("Neue Fonds-Positionen: Verwalter, die die Aktie im Vorquartal nicht hielten und sie jetzt in ihrer 13F-Meldung führen, über alle Melder.") + "</div>" +
          sect("Neue Großbeteiligungen (13D)") + '<div id="hf-nd"></div>' + moreBtn("hf-ndmore", "Alle " + nd.length + " anzeigen") +
          '<div class="hf-gap">' + U.help("Schedule 13D melden Investoren, die mehr als 5 % halten und Einfluss nehmen wollen; reine Finanzinvestoren melden 13G.") + "</div>" +
          smFooter(h.asOf);
        drawF();
        document.getElementById("hf-nimore").addEventListener("click", function () { nA = 1e9; drawF(); });
        document.getElementById("hf-ndmore").addEventListener("click", function () { nB = 1e9; drawF(); });
      }
    });
  }
  function secFilingUrl(acc) {
    var a = String(acc || "");
    return /^\d{10}-\d{2}-\d{6}$/.test(a) ? "https://www.sec.gov/Archives/edgar/data/" + (+a.slice(0, 10)) + "/" + a.replace(/-/g, "") + "/" : null;
  }
  function schedList(rows) {
    if (!rows || !rows.length) return U.blank("Aktuell keine Fälle.");
    return rows.map(function (r, i) {
      var it = tickerItem(r.ticker, r.name), l = r.latest || {}, url = secFilingUrl(l.accession);
      return '<div class="hf-row"><span class="hf-rk">' + (i + 1) + "</span>" + logo(it) +
        '<span class="hf-inv-n"><b><a href="' + tickerHref(r.ticker) + '">' + esc(tickerName(it)) + "</a></b><small>" + esc(r.ticker) + " · " +
        esc((l.filers || []).slice(0, 2).map(prettyIssuer).join(", ")) + '</small></span><span class="hf-inv-v"><b class="vu-num">' + dateDE(l.filed) + "</b><small>" +
        (url ? '<a href="' + url + '" target="_blank" rel="noopener">Meldung ' + icon("ext") + "</a>" : esc(l.form || "13D")) + "</small></span></div>";
    }).join("");
  }
  function kv(rows) {
    return '<div class="vu-box hf-kv">' + rows.map(function (r) { return '<div class="hf-kvrow"><span><b>' + r[0] + '</b></span><b class="vu-num">' + r[1] + "</b></div>"; }).join("") + "</div>";
  }
  function netPill(v) {
    if (v == null) return "–";
    return '<span class="vu-chg' + (v < 0 ? " vu-chg--down" : v === 0 ? " vu-chg--flat" : "") + '">' + (v > 0 ? "+" : "") + usd(v) + "</span>";
  }
  // Block auf der Aktienseite: Insider und alle 13F-Melder für einen Ticker
  function smartMoneyBlock(ticker, name) {
    var el = document.getElementById("hf-sm");
    if (!el || !ticker) return;
    loadOwnIssuer(ticker).then(function (r) {
      if (!document.getElementById("hf-sm")) return;
      if (!r) { el.innerHTML = sect("Insider bei " + esc(name) + " · 90 Tage") + U.blank("Zu " + ticker + " liegen noch keine Insider- oder Fondsdaten vor."); return; }
      var x = r.data, ins = x.insider, inst = x.institutions, sch = x.schedules, html = "";
      if (ins) {
        var buyers = ins.topBuyers || [];
        html += sect("Insider bei " + esc(name) + " · 90 Tage") +
          '<div class="vu-grid hf-tiles" style="--vu-cols:3">' + U.tile("Käufer", String(ins.ib90), "") + U.tile("Verkäufer", String(ins.is90), "") +
          '<div class="vu-tile"><div class="vu-tile__label">Netto</div><div class="hf-gap-s">' + netPill(ins.nbv90) + "</div></div></div>" +
          (ins.cb ? '<div class="vu-blank hf-gap">' + U.verdict("strong", "Gruppen-Kauf") + "<span>Mindestens drei Insider haben innerhalb von 30 Tagen gekauft.</span></div>" : "") +
          (buyers.length ? '<div class="hf-gap">' + buyers.map(function (b) {
            return '<div class="hf-row"><span class="hf-inv-n"><b>' + esc(personName(b.name)) + "</b><small>" + esc(roleLabel(b.relationship)) + (b.plan10b5One ? " · Plan 10b5-1" : "") + " · gemeldet " + dateDE(b.lastFiled) +
              '</small></span><span class="hf-inv-v"><b class="vu-num">' + usd(b.valueUsd) + "</b><small>" + shares(b.shares) + " Aktien</small></span></div>";
          }).join("") + "</div>" : '<div class="vu-blank hf-gap">' + U.verdict("none", "Keine Käufe") + "<span>Kein Insider hat in 90 Tagen gekauft.</span></div>") +
          (ins.complete === false ? '<p class="hf-note-s">Die jüngsten Wochen sind noch nicht vollständig erfasst.</p>' : "") +
          (ins.issuerLevel ? '<p class="hf-note-s">Insider-Werte gelten für das Unternehmen insgesamt (alle Aktiengattungen).</p>' : "") +
          '<a class="hf-linkline" href="#/smart-money">Alle Insider-Käufe ' + U.glyph("next", 15) + "</a>";
      }
      if (inst) {
        html += sect("Alle 13F-Melder · " + quarter(inst.period)) +
          kv([["Halter", nf0.format(inst.fh)], ["Halter im Vorquartal", nf0.format(inst.fhp)], ["Neu eingestiegen", "+" + nf0.format(inst.fnew)], ["Ausgestiegen", nf0.format(inst.fexit)], ["Aufgestockt / reduziert", nf0.format(inst.finc) + " / " + nf0.format(inst.fdec)]]) +
          ((inst.topNew || []).length ? '<details class="hf-acc"><summary>Größte Neueinsteiger</summary>' + inst.topNew.map(function (n) {
            return '<div class="hf-kvrow"><span>' + esc(prettyIssuer(n.manager)) + '</span><b class="vu-num">' + usd(n.valueUsd) + "</b></div>";
          }).join("") + "</details>" : "") +
          (inst.previousHoldersLow ? '<p class="hf-note-s">Im Vorquartal waren wenige Melder erfasst; Neueinstiege sind deshalb nur eingeschränkt vergleichbar.</p>' : "") +
          '<div class="hf-gap">' + U.help("Alle 13F-Melder: auch Banken, Versicherer und ETF-Anbieter, nicht nur Hedgefonds.") + "</div>";
      }
      var rec = (sch && sch.recent) || [];
      if (rec.length) {
        html += sect("Beteiligungen über 5 %") + rec.slice(0, 6).map(function (m) {
          var url = secFilingUrl(m.accession);
          return '<div class="hf-row"><span class="hf-inv-n"><b>' + esc((m.filers || []).map(prettyIssuer).join(", ") || "–") + "</b><small>" + esc(m.form) + (/13D/.test(m.form) ? " (aktiv)" : " (passiv)") +
            '</small></span><span class="hf-inv-v"><b class="vu-num">' + (url ? '<a href="' + url + '" target="_blank" rel="noopener">' + dateDE(m.filed) + "</a>" : dateDE(m.filed)) + "</b></span></div>";
        }).join("");
      }
      el.innerHTML = html + '<p class="hf-note-s">Insider- und Meldedaten Stand ' + dateDE(r.asOf) + ".</p>";
    });
  }
  // Aktie ohne Fondsdaten (z. B. aus der Insider-Liste): nur Smart Money
  function renderTickerStock(ticker) {
    var it = tickerItem(ticker), name = it.name === it.ticker ? ticker : issuerName(it);
    document.title = name + " · Smart Money — Vision Universe®";
    root.innerHTML = '<div class="hf-detail"><div id="hf-shead">' + stockHeadFallback(it, name, "#/smart-money", "Smart Money") + "</div>" +
      '<div class="hf-gap-l">' + U.blank("Keiner der erfassten Hedgefonds führt " + name + " unter seinen größten Positionen. Insider-Geschäfte und Meldungen aller 13F-Melder stehen unten.") + "</div>" +
      '<div id="hf-sm"><div class="hf-skeleton" style="height:260px"></div></div>' + smFooter(null) + "</div>";
    mountStockHead(ticker, name, "#/smart-money", "Smart Money");
    window.scrollTo(0, 0);
    smartMoneyBlock(ticker, name);
  }
  /* Aktienseite per Kürzel (#/aktie/NVDA). CUSIP-Adressen (alt) wechseln auf das Kürzel, wenn es eines gibt. */
  function routeStockId(id) {
    var token = location.hash;
    root.innerHTML = '<div class="hf-skeleton" style="margin-top:24px;height:320px"></div>';
    loadStockIndex().then(function (list) {
      if (location.hash !== token) return;
      var isCusip = /^[0-9A-Z]{8}[0-9]$/.test(id), t = id.toUpperCase(), hit = null;
      for (var i = 0; i < list.length; i++) if (isCusip ? list[i].cusip === id : list[i].ticker === t) { hit = list[i]; break; }
      if (isCusip) {
        if (hit && hit.ticker) { location.replace("#/aktie/" + encodeURIComponent(hit.ticker)); return; }
        renderStock(id, null); return;
      }
      if (hit) renderStock(hit.cusip, hit.ticker); else renderTickerStock(t);
    });
  }

  /* --------------------------------------------------------------- H05 Fonds */
  function historyBars(d) {
    var h = (d.history || []).filter(function (x) { return x.valueUSD > 0; });
    if (h.length < 2) return U.blank("Noch kein Verlauf verfügbar.");
    var max = Math.max.apply(null, h.map(function (x) { return x.valueUSD; }));
    var growth = h[0].valueUSD ? (h[h.length - 1].valueUSD - h[0].valueUSD) / h[0].valueUSD * 100 : null;
    return '<div class="vu-box">' + U.bars(h.map(function (x) { return [qShort(x.period).replace(/\/\d+$/, ""), x.valueUSD]; }), { width: 330, height: 110, label: "Depotwert je Quartal" }) +
      '<p class="hf-bars-cap">' + h.length + " Quartale · " + pct(growth, true) + " seit " + quarter(h[0].period) + " · Hoch " + usd(max) + "</p>" +
      '</div><details class="hf-acc"><summary>Werte je Quartal</summary>' + h.slice().reverse().map(function (x) {
        return '<div class="hf-kvrow"><span><b>' + quarter(x.period) + '</b></span><b class="vu-num">' + usd(x.valueUSD) + "</b></div>";
      }).join("") + "</details>";
  }
  function fundTab(d, tab) {
    var tr = d.trades || {}, hs = d.holdings || [], max = hs.length ? hs[0].weightPct : 1, total = d.totalValueUSD || 0, tc = d.tradeCounts || {};
    var tradeSub = function (t) { return shares(t.prevShares) + " → " + shares(t.shares) + " Stück · " + (t.estValueUSD >= 0 ? "≈ +" : "≈ ") + usd(t.estValueUSD); };
    var withW = function (t) { var x = {}; for (var k in t) x[k] = t[k]; x.weightPct = total ? t.valueUSD / total * 100 : null; return x; };
    if (tab === "holdings") {
      return hs.map(function (h) { return holdRow(h, max, { sub: usd(h.valueUSD) + " · " + shares(h.shares) + " Stück" }); }).join("") +
        (d.holdingsTruncated ? '<p class="hf-note-s">Gezeigt werden die ' + hs.length + " größten von " + nf0.format(d.positionCount + (d.optionCount || 0)) + " Positionen" + (d.optionCount ? " (inkl. Optionen)" : "") + ".</p>" : "") +
        '<div class="hf-gap">' + U.help("Anteil: Welcher Teil des gemeldeten Depots in dieser Aktie steckt. Rechts die Veränderung der Stückzahl zum Vorquartal.") + "</div>";
    }
    if (tab === "buys") {
      var buys = (tr["new"] || []).concat(tr.added || []).sort(function (a, b) { return b.estValueUSD - a.estValueUSD; });
      return '<h3 class="hf-flowh">Gekauft</h3>' + (buys.map(function (t) { return holdRow(withW(t), max, { label: t.status === "new" ? "neu" : "aufgestockt", sub: tradeSub(t) }); }).join("") || '<p class="hf-none">Keine Käufe in diesem Quartal.</p>') +
        '<div class="hf-gap">' + U.help("Käufe = " + nf0.format(tc["new"] || 0) + " neue + " + nf0.format(tc.added || 0) + " aufgestockte Positionen. Wert geschätzt: Stückzahländerung mal Kurs am Quartalsende.") + "</div>";
    }
    var sold = (tr.sold || []).sort(function (a, b) { return a.estValueUSD - b.estValueUSD; }), red = (tr.reduced || []).sort(function (a, b) { return a.estValueUSD - b.estValueUSD; });
    return '<h3 class="hf-flowh">Verkauft</h3>' + (sold.map(function (t) { return holdRow(t, max, { label: "komplett raus", noWeight: true, sub: tradeSub(t) }); }).join("") +
      red.map(function (t) { return holdRow(withW(t), max, { sub: tradeSub(t) }); }).join("") || '<p class="hf-none">Keine Verkäufe in diesem Quartal.</p>') +
      '<div class="hf-gap">' + U.help("Verkäufe = " + nf0.format(tc.reduced || 0) + " verkleinert + " + nf0.format(tc.sold || 0) + " komplett verkauft (nicht mehr im Depot, daher nicht unter Positionen).") + "</div>";
  }
  function renderFund(slug) {
    var f = S.bySlug[slug];
    var back = f && f.category === "Investoren" ? backLink("#/investoren", "Investoren") : backLink("#/investoren/alle", "Alle Fonds");
    if (!f) { root.innerHTML = back + U.blank("Fonds nicht gefunden."); return; }
    document.title = (f.manager ? f.manager + " – " : "") + f.name + " · Hedgefonds — Vision Universe®";
    root.innerHTML = back + '<div class="hf-skeleton" style="height:320px"></div>';
    window.scrollTo(0, 0);
    loadFund(slug).then(function (d) {
      if (location.hash.indexOf("#/fonds/" + slug) !== 0) return;
      var tc = d.tradeCounts || {}, photo = d.photo, hs = d.holdings || [];
      var nBuys = (tc["new"] || 0) + (tc.added || 0), nSells = (tc.sold || 0) + (tc.reduced || 0);
      var top5 = d.totalValueUSD ? hs.filter(function (h) { return !h.putCall; }).slice(0, 5).reduce(function (s, h) { return s + h.valueUSD; }, 0) / d.totalValueUSD * 100 : null;
      var late = f.reportDate < S.data.latestPeriod;
      var tag = [f.style, f.role, f.region ? regionLabel(f) : "", f.city && !f.role ? f.city : ""].filter(Boolean).join(" · ");
      root.innerHTML = '<div class="hf-detail">' + back +
        '<section class="hf-fhead">' + avatar(f, "xl") + '<div><div class="vu-ltag">' + esc(tag) + '</div><h1 class="vu-lt">' + esc(f.manager || f.name) + "</h1>" +
          '<p class="vu-mu">' + esc(f.manager ? f.name : (String(d.secName).toLowerCase() === String(f.name).toLowerCase() ? "13F-Melder" : d.secName)) + "</p></div></section>" +
        (f.bio ? '<p class="hf-bio">' + esc(f.bio) + "</p>" : "") +
        (late ? '<div class="vu-box vu-box--line hf-stale">' + U.verdict("none", "Stand " + quarter(f.reportDate)) + "<span>Für " + esc(S.data.latestPeriodLabel) +
          " liegt noch keine Meldung vor. Du siehst den letzten Stand vom " + dateDE(f.reportDate) + ".</span></div>" : "") +
        (f.note ? '<div class="vu-box vu-box--line hf-stale">' + U.verdict("none", "Hinweis") + "<span>" + esc(f.note) + "</span></div>" : "") +
        (d.jump ? '<div class="vu-box vu-box--line hf-stale">' + U.verdict("none", "Sprung") + "<span>Die gemeldete Fondsgröße hat sich extrem verändert (" + usd(d.prevTotalValueUSD) + " → " + usd(d.totalValueUSD) + "). Das kann eine Umstrukturierung oder ein Meldefehler sein.</span></div>" : "") +
        '<div class="vu-grid hf-gap-l">' +
          '<div class="vu-tile"><div class="vu-tile__label">Depotwert (13F)' + U.q("Summe der gemeldeten US-Positionen zum Stichtag " + dateDE(d.reportDate) + ". Rechts die Veränderung zum Vorquartal (" + (d.prevTotalValueUSD ? usd(d.prevTotalValueUSD) : "kein Vorquartal") + "); sie ist keine Rendite.", "Depotwert") +
            '</div><div class="vu-tile__value">' + usd(d.totalValueUSD) + '</div><div class="hf-gap-s">' + (d.aumChangePct != null && !d.jump ? U.chg(d.aumChangePct, { digits: 1 }) : "") + "</div></div>" +
          U.tile("Positionen", nf0.format(d.positionCount), (top5 != null ? "Top 5 = " + pct(top5) : "") + (d.optionCount ? " · " + nf0.format(d.optionCount) + " Optionen" : "")) + "</div>" +
        sect("Depotwert im Verlauf") + historyBars(d) +
        sect("Was im Depot steckt") +
        seg([{ id: "holdings", label: "Positionen " + nf0.format(d.positionCount) }, { id: "buys", label: "Käufe " + nBuys }, { id: "sells", label: "Verkäufe " + nSells }], S.tab, 'id="hf-ftabs" role="group" aria-label="Depot"') +
        '<div id="hf-tabbody"></div>' +
        (d.optionCount ? '<p class="hf-note-s">Optionen (Calls/Puts) sind in Positionen, Käufen und Verkäufen nicht mitgezählt; sie stehen mit dem Wert des Basiswerts in der Liste.</p>' : "") +
        '<details class="hf-acc"><summary>13F-Meldung bei der SEC</summary><div class="hf-kvrow"><span><b>Gemeldet am</b></span><b>' + dateDE(d.filedDate) + '</b></div><div class="hf-kvrow"><span><b>Stichtag</b></span><b>' + dateDE(d.reportDate) +
          '</b></div><div class="hf-kvrow"><span><b>Formular</b></span><b>' + esc(d.form || "13F-HR") + "</b></div>" + (d.secName ? '<div class="hf-kvrow"><span><b>SEC-Melder</b></span><b>' + esc(d.secName) + "</b></div>" : "") +
          '<p class="hf-gap"><a class="vu-btn vu-btn--ink vu-btn--sm" href="' + secLink(d) + '" target="_blank" rel="noopener">13F bei der SEC öffnen ' + icon("ext") + "</a></p></details>" +
        (photo ? '<details class="hf-acc"><summary>Foto und Lizenz</summary><p class="vu-sm hf-gap-s">Foto: ' + esc(photo.artist) + ", " + (photo.licenseUrl ? '<a href="' + esc(photo.licenseUrl) + '" target="_blank" rel="noopener">' + esc(photo.license) + "</a>" : esc(photo.license)) +
          (photo.sourceUrl ? ' · <a href="' + esc(photo.sourceUrl) + '" target="_blank" rel="noopener">Wikimedia Commons</a>' : "") + "</p></details>" : "") +
        closeLine("Vergleich " + quarter(d.prevReportDate) + " → " + quarter(d.reportDate) + ".") +
        footer() + "</div>";
      var draw = function () { document.getElementById("hf-tabbody").innerHTML = fundTab(d, S.tab); };
      draw();
      bindSeg(document.getElementById("hf-ftabs"), function (v) { S.tab = v; draw(); });
    }).catch(function (err) {
      root.innerHTML = back + U.blank("Details konnten nicht geladen werden (" + err.message + ").");
    });
  }

  /* ------------------------------------------------------------ Routing */
  var LEGACY = { investoren: "#/investoren", datenbank: "#/investoren/alle", kaeufe: "#/", konsens: "#/aktien", institutionen: "#/investoren/alle" };
  var lastPath = null, scrollMemo = {};
  function route() {
    var h = location.hash || "#/";
    if (!/^#\//.test(h)) { location.replace(LEGACY[h.slice(1)] || "#/"); return; }
    var path = h.slice(2).split("?")[0], params = {};
    (h.split("?")[1] || "").split("&").forEach(function (kv) { var p = kv.split("="); if (p[0]) params[p[0]] = decodeURIComponent(p[1] || ""); });
    var parts = path.split("/").filter(Boolean), page = parts[0] || "start";
    // Jede Ansicht außer der Startseite arbeitet mit allen Fonds (universe.json)
    if (!S.uniReady && page !== "start") { ensureUniverse().then(route); return; }
    if (lastPath !== null) scrollMemo[lastPath] = window.scrollY;
    var changed = lastPath !== path;
    lastPath = path;
    [].forEach.call(document.querySelectorAll(".vu-sheet-backdrop"), function (el) { el.remove(); });
    if (page === "fonds" && parts[1]) { setDock(null); if (changed) S.tab = "holdings"; renderFund(parts[1]); return; }
    if (page === "aktie" && parts[1]) { setDock("aktien"); routeStockId(decodeURIComponent(parts[1])); return; }
    if (page === "smart-money") { setDock("smart"); renderSmartMoney(parts[1] === "einstiege" ? "funds" : "insider"); window.scrollTo(0, scrollMemo[path] || 0); return; }
    // #/datenbank (alt) = Reiter „Alle Fonds" unter Investoren
    if (page === "investoren" || page === "datenbank") { setDock(page); renderInvestors(page === "datenbank" || parts[1] === "alle" ? "all" : "stars", params); window.scrollTo(0, scrollMemo[path] || 0); return; }
    var pages = { start: renderHome, aktien: renderStocks };
    (pages[page] || renderHome)(params);
    setDock(pages[page] ? page : "start");
    window.scrollTo(0, scrollMemo[path] || 0);
  }
  window.addEventListener("hashchange", route);
  document.addEventListener("keydown", function (e) {
    if (e.key === "/" && !/input|textarea|select/i.test(document.activeElement.tagName) && overlay && overlay.hidden) { e.preventDefault(); openSearch(); }
  });

  buildOverlay();
  U.bindHelp(document.body);
  root.innerHTML = '<div class="hf-skeleton" style="margin-top:24px;height:420px"></div>';
  load().then(route).catch(function (err) {
    root.innerHTML = U.blank("Die 13F-Daten konnten nicht geladen werden (" + err.message + ").");
  });
})();
