/* =========================================================================
   VISION UNIVERSE® HEDGEFONDS — app.js
   Liest die serverseitig erzeugten 13F-Daten (scripts/hedgefonds/
   fetch_edgar_data.py). Kein SEC-Abruf im Browser.

     #/                  Start
     #/investoren        Star-Investoren
     #/datenbank         alle Hedgefonds
     #/aktien            Aktien: meistgehalten, Käufe, Verkäufe
     #/aktie/<cusip>     Aktie: welche Fonds halten sie, mit welchem Anteil
     #/fonds/<slug>      Fonds: Kuchendiagramm, Verlauf, Positionen, Trades
   ========================================================================= */
(function () {
  "use strict";

  var DATA_URL = window.HF_DATA_URL || "/hedgefonds/data/hedgefonds.json";
  var BASE = "/hedgefonds/data/";
  var SERIES = ["--s1", "--s2", "--s3", "--s4", "--s5", "--s6", "--s7", "--s8"];
  var STOCK_SHARDS = 32;
  var FEATURED = ["pershing-square", "berkshire", "scion", "ark", "situational-awareness", "appaloosa", "duquesne",
    "bit-capital", "icahn", "third-point", "greenlight", "baupost", "tci", "himalaya", "dalal-street", "tiger-global", "coatue"];
  var HERO_FACES = ["berkshire", "pershing-square", "ark", "appaloosa", "bridgewater", "soros", "icahn", "citadel", "tci"];
  var POPULAR = [["Bill Ackman", "fonds", "pershing-square"], ["Michael Burry", "fonds", "scion"], ["Cathie Wood", "fonds", "ark"],
    ["Jan Beckers", "fonds", "bit-capital"], ["NVIDIA", "aktie", "67066G104"], ["Palantir", "aktie", "69608A108"]];
  var STATUS = {
    "new": { label: "Neu", cls: "new" }, added: { label: "Aufgestockt", cls: "up" },
    reduced: { label: "Reduziert", cls: "down" }, sold: { label: "Verkauft", cls: "down" },
    unchanged: { label: "Unverändert", cls: "" }
  };
  var REGION = { DE: "Deutschland", AT: "Österreich", CH: "Schweiz" };
  var PAGE = 50;
  var S = { data: null, universe: [], bySlug: {}, details: {}, shards: {}, stockIndex: null,
    style: "Alle", sort: "value", tab: "holdings", aggMode: "star", dbFilter: "all", dbSort: "value", dbShown: PAGE,
    dbQ: "", invQ: "", stockMode: "all" };
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
    layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
    ext: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'
  };
  function icon(name, cls) {
    return '<svg class="hf-i' + (cls ? " " + cls : "") + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON[name] + "</svg>";
  }
  function iconTile(name, tone) { return '<span class="hf-tile-ico tone-' + tone + '">' + icon(name) + "</span>"; }

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
  function hueVar(slug) {
    var h = 0;
    for (var i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
    return SERIES[h % SERIES.length];
  }
  function cssVar(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
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
      .replace(/^Ss (?=Spdr)/i, "").replace(/-Us$/, "").trim();
  }
  // Von SEC/FIGI abgeschnittene Namen, die sich nicht regelbasiert reparieren lassen
  var NAME_FIX = { SPCX: "SpaceX", GOOGL: "Alphabet (A)", GOOG: "Alphabet (C)", "BRK/B": "Berkshire Hathaway", META: "Meta Platforms" };
  function secLink(f) {
    if (!f.accession) return "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&type=13F-HR&CIK=" + f.cik;
    return "https://www.sec.gov/Archives/edgar/data/" + (+f.cik) + "/" + f.accession.replace(/-/g, "") + "/";
  }
  function stockHref(item) { return item.cusip ? "#/aktie/" + encodeURIComponent(item.cusip) : null; }
  function stockShard(cusip) {
    var s = 0;
    for (var i = 0; i < cusip.length; i++) s += cusip.charCodeAt(i);
    return s % STOCK_SHARDS;
  }

  function avatar(f, size) {
    var cls = "hf-avatar" + (size ? " " + size : "");
    var style = ' style="--tt:var(' + hueVar(f.slug || "x") + ')"';
    var label = f.manager || f.name;
    if (f.photo && f.photo.src) {
      return '<span class="' + cls + '"' + style + '><img src="/hedgefonds/' + esc(f.photo.src) + '" alt="' + esc(label) +
        '" loading="lazy" decoding="async" onerror="this.parentNode.textContent=\'' + esc(initials(label)) + '\'"></span>';
    }
    return '<span class="' + cls + '"' + style + ' aria-hidden="true">' + esc(initials(label)) + "</span>";
  }
  function logo(item, size) {
    var t = item.ticker || "";
    var txt = esc((t || item.issuer || item.name || "?").replace(/[^A-Za-z0-9]/g, "").slice(0, 4));
    var cls = "hf-logo" + (size ? " " + size : "");
    if (item.logo && t) {
      return '<span class="' + cls + '"><img src="/discover/logos/files/' + encodeURIComponent(t) +
        '.png" alt="" loading="lazy" onerror="this.parentNode.textContent=\'' + txt + '\'"></span>';
    }
    return '<span class="' + cls + '" aria-hidden="true">' + txt + "</span>";
  }
  function stockName(item) {
    var name = esc(issuerName(item)), href = stockHref(item);
    return href ? '<a href="' + href + '">' + name + "</a>" : name;
  }
  function optTag(item) {
    return item.putCall ? ' <span class="hf-badge warn">' + (item.putCall === "PUT" ? "Put" : "Call") + "</span>" : "";
  }
  function statusBadge(t, withPct) {
    var s = STATUS[t.status];
    if (!s || t.status === "unchanged") return '<span class="hf-badge">Unverändert</span>';
    var extra = withPct !== false && (t.status === "added" || t.status === "reduced") && t.deltaPct != null ? " " + pct(t.deltaPct, true) : "";
    return '<span class="hf-badge ' + s.cls + '">' + s.label + extra + "</span>";
  }
  // Kompakte Veränderung je Position: "Neu", "▲ +45 %", "▼ −6 %", "Verkauft"
  function chg(t) {
    var st = t && (t.status || t.st), d = t && (t.deltaPct != null ? t.deltaPct : t.d);
    if (!st || st === "unchanged") return "";
    if (st === "new") return '<span class="hf-chg new">Neu</span>';
    if (st === "sold") return '<span class="hf-chg down">Verkauft</span>';
    var up = st === "added";
    return '<span class="hf-chg ' + (up ? "up" : "down") + '">' + (up ? "▲ " : "▼ ") + pct(d, true) + "</span>";
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
  function load() {
    var uni = getJSON(BASE + "universe.json").catch(function () { return { funds: [] }; });
    return Promise.all([getJSON(DATA_URL), uni]).then(function (res) {
      var d = res[0];
      if (!d.schema || d.schema.indexOf("hedgefonds-2") !== 0) throw new Error("Datenformat veraltet");
      S.data = d;
      S.universe = res[1].funds || [];
      d.funds.concat(S.universe).forEach(function (f) { S.bySlug[f.slug] = f; });
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
  function investors() { return S.data.funds.filter(function (f) { return f.category === "Investoren"; }); }
  function institutions() { return S.data.funds.filter(function (f) { return f.category === "Institutionen"; }); }
  function dbAll() { return investors().concat(S.universe); }
  function isHF(f) { return f.category === "Investoren" || f.style === "Hedgefonds"; }
  function hfCount() { return dbAll().filter(isHF).length; }

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
            '<span class="t"><b>' + hl(f.manager || f.name, q) + (f.category === "Investoren" ? ' <span class="hf-star">★</span>' : "") + "</b><small>" +
            hl(f.manager ? f.name : [f.city, regionLabel(f)].filter(Boolean).join(" · ") || f.style, q) + '</small></span><span class="v">' + usd(f.totalValueUSD) + "</span></a>";
        }).join("");
      }
      if (stocks.length) {
        sh = '<div class="hf-sg">Aktien</div>' + stocks.map(function (s) {
          return '<a class="hf-sr" data-go="#/aktie/' + esc(s.cusip) + '" href="#/aktie/' + esc(s.cusip) + '">' + logo(s, "md") +
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
    input.addEventListener("input", render);
    input.addEventListener("focus", function () {
      loadStockIndex().then(function () { if (document.activeElement === input) render(); });
      render();
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
      else if (e.key === "Enter") {
        var target = items[active >= 0 ? active : 0];
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
     (assets/site-navigation.js): Hedgefonds | Investoren | Datenbank |
     Aktien | ☰. Hedgefonds meldet ihr nur den aktiven Bereich. Die Suche
     bleibt die Hedgefonds-Suche: im Hero, mit / und als Overlay. */
  var DOCK = { start: "hedgefonds", investoren: "investoren", datenbank: "datenbank", aktien: "aktien" };
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
      return '<a class="hf-chip" data-go="' + href + '" href="' + href + '">' + esc(p[0]) + "</a>";
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

  /* ------------------------------------------------------------- Theme
     Der Schalter sitzt plattformweit in der Navigation (site-navigation.js).
     Hier wird nur das Kuchendiagramm neu gezeichnet, dessen Farben aus den
     CSS-Tokens gelesen werden. */
  document.addEventListener("vu-theme-change", function () {
    if (/^#\/fonds\//.test(location.hash) && S.data) route();
  });

  /* ----------------------------------------------------- Bausteine */
  function card(f, featured) {
    var aumChg = f.aumChangePct;
    var top = (f.top || []).filter(function (h) { return !h.putCall; }).slice(0, 3);
    var tc = f.tradeCounts, foot = [];
    var behind = S.data.latestPeriod && f.reportDate < S.data.latestPeriod;
    foot.push('<span class="hf-badge' + (behind ? " warn" : "") + '">' + (behind ? "Stand " : "") + quarter(f.reportDate) + "</span>");
    if (tc) {
      if (tc["new"]) foot.push('<span class="hf-badge new">' + tc["new"] + " neu</span>");
      if (tc.sold) foot.push('<span class="hf-badge down">' + tc.sold + " verkauft</span>");
    }
    if (f.stale) foot.push('<span class="hf-badge warn">Meldet nicht mehr</span>');
    if (f.region) foot.push('<span class="hf-badge">' + esc(regionLabel(f)) + "</span>");
    return '<a class="hf-card' + (featured ? " featured" : "") + '" href="#/fonds/' + esc(f.slug) + '" style="--tt:var(' + hueVar(f.slug) + ')">' +
      '<div class="hf-card-top">' + avatar(f) + "<div><h3>" + esc(f.manager || f.name) + '</h3><div class="fund">' + esc(f.name) +
      '</div><span class="style">' + esc(f.style || "") + "</span></div></div>" +
      '<div class="hf-card-val"><b class="num">' + usd(f.totalValueUSD) + "</b>" +
      (aumChg != null ? '<small class="num ' + (aumChg >= 0 ? "pos" : "neg") + '">' + pct(aumChg, true) + " ggü. Vorquartal</small>" : "<small>Fondsgröße (13F)</small>") + "</div>" +
      '<div class="hf-card-hold">' + top.map(function (h) {
        return '<div class="row">' + logo(h) + "<span>" + esc(issuerName(h)) + "</span>" + (chg(h) || "<i></i>") + "<em>" + pct(h.weightPct) + "</em></div>";
      }).join("") + "</div>" +
      '<div class="hf-card-foot">' + foot.join("") + "</div></a>";
  }
  function fundStack(list, max) {
    max = max || 4;
    var html = list.slice(0, max).map(function (x) {
      var f = S.bySlug[x.slug || x.s];
      return f ? '<a href="#/fonds/' + esc(f.slug) + '" title="' + esc(fundLabel(f) + " · " + usd(f.totalValueUSD)) + '">' + avatar(f, "xs") + "</a>" : "";
    }).join("");
    return '<span class="hf-stack">' + html + (list.length > max ? '<span class="more">+' + (list.length - max) + "</span>" : "") + "</span>";
  }
  // Aufklappbare Liste: welche Fonds, wie groß, wie stark verändert
  function fundDetails(a, kind) {
    var rows = a.funds.map(function (x) {
      var f = S.bySlug[x.slug];
      if (!f) return "";
      return '<tr><td><a class="hf-fund" href="#/fonds/' + esc(f.slug) + '">' + avatar(f, "xs") + "<span><b>" + esc(f.manager || f.name) + "</b>" +
        (f.manager ? "<small>" + esc(f.name) + "</small>" : "") + '</span></a></td><td class="r num c-fs">' + usd(f.totalValueUSD) +
        '</td><td class="r num">' + (x.weightPct != null ? pct(x.weightPct) : "–") + "</td><td class=\"r\">" + (chg(x) || '<span class="hf-chg">Gehalten</span>') + "</td>" +
        (kind !== "consensus" ? '<td class="r num c-v ' + (x.estValueUSD >= 0 ? "pos" : "neg") + '">' + usd(x.estValueUSD) + "</td>" : "") + "</tr>";
    }).join("");
    var more = a.fundCount > a.funds.length ? '<p class="hf-foot-note">Gezeigt: ' + a.funds.length + " von " + a.fundCount + ' Fonds – alle auf der <a href="' + stockHref(a) + '">Aktienseite</a>.</p>' : "";
    return '<details class="hf-funds"><summary>' + a.fundCount + " Fonds anzeigen</summary>" +
      '<div class="hf-table-wrap"><table class="hf-table hf-mini"><thead><tr><th>Fonds</th><th class="r c-fs">Fondsgröße</th><th class="r">Anteil</th><th class="r">ggü. VQ</th>' +
      (kind !== "consensus" ? '<th class="r c-v">Volumen</th>' : "") + "</tr></thead><tbody>" + rows + "</tbody></table></div>" + more + "</details>";
  }
  function stockList(list, kind, offset) {
    offset = offset || 0;
    if (!list || !list.length) return '<p class="hf-empty">Keine Daten für dieses Quartal.</p>';
    var max = Math.max.apply(null, list.map(function (a) { return kind === "consensus" ? a.fundCount : Math.abs(a.estValueUSD); }));
    return '<ol class="hf-list">' + list.map(function (a, i) {
      var right;
      if (kind === "consensus") {
        right = "<b>" + a.fundCount + " Fonds</b><small>Ø " + pct(a.avgWeightPct) + " Anteil</small>";
      } else {
        right = '<b class="' + (kind === "buys" ? "pos" : "neg") + '">' + usd(a.estValueUSD) + "</b><small>" + a.fundCount + " Fonds" +
          (kind === "buys" && a.newCount ? " · " + a.newCount + " neu" : "") + (kind === "sells" && a.soldCount ? " · " + a.soldCount + " komplett" : "") + "</small>";
      }
      var w = (kind === "consensus" ? a.fundCount : Math.abs(a.estValueUSD)) / max * 100;
      return '<li class="hf-li"><span class="rk">' + (i + offset + 1) + "</span>" + logo(a, "lg") +
        '<div class="nm"><b>' + stockName(a) + '</b><span class="sub">' + (a.ticker ? "<em>" + esc(a.ticker) + "</em>" : "") + fundStack(a.funds, 4) +
        '</span><div class="hf-meter" aria-hidden="true"><i style="width:' + w.toFixed(1) + "%;background:var(" +
        (kind === "sells" ? "--down" : kind === "buys" ? "--up" : "--s1") + ')"></i></div></div><div class="val">' + right + "</div>" +
        fundDetails(a, kind) + "</li>";
    }).join("") + "</ol>";
  }
  function pageHead(eyebrow, title, lead, tone, ico) {
    return '<header class="hf-phead">' + iconTile(ico, tone) + '<div><div class="hf-eyebrow">' + eyebrow + "</div><h1>" + title + "</h1>" +
      (lead ? '<p class="lead">' + lead + "</p>" : "") + "</div></header>";
  }
  function footer() {
    var d = S.data, errs = (d.errors || []).length;
    return '<footer class="hf-footer"><b>VISION UNIVERSE®</b><p>Quelle: Form 13F-HR der US-Börsenaufsicht SEC (EDGAR, data.sec.gov). ' +
      "13F-Meldungen zeigen nur US-Aktien, ETFs und börsennotierte Optionen zum Quartalsende, werden bis zu 45 Tage später veröffentlicht und enthalten keine Short-Positionen, Anleihen oder ausländischen Aktien. " +
      "Käufe und Verkäufe sind aus dem Vergleich zweier Quartale abgeleitet; der tatsächliche Handelszeitpunkt und -preis sind nicht bekannt. Put/Call-Positionen sind mit dem Wert des Basiswerts gemeldet. " +
      "Ticker-Zuordnung: OpenFIGI. Porträts: Wikimedia Commons, jeweilige Urheber und Lizenz in der Detailansicht. Keine Anlageberatung.</p>" +
      "<p>Daten zuletzt geprüft: " + dateDE(d.generatedAt) + (errs ? " · " + errs + " Fonds derzeit nicht abrufbar" : "") + "</p></footer>";
  }
  function bindRowLinks(scope) {
    [].forEach.call(scope.querySelectorAll("tr[data-href]"), function (r) {
      if (r._bound) return;
      r._bound = true;
      r.addEventListener("click", function (e) { if (!e.target.closest("a")) location.hash = r.getAttribute("data-href"); });
      r.addEventListener("keydown", function (e) { if (e.key === "Enter") location.hash = r.getAttribute("data-href"); });
    });
  }
  function stat(ico, tone, label, value, sub) {
    return '<div class="hf-stat">' + iconTile(ico, tone) + "<div><small>" + label + '</small><b class="num">' + value + "</b><span>" + sub + "</span></div></div>";
  }
  function backLink(href, label) {
    return '<a class="hf-back" href="' + href + '">' + icon("back") + label + "</a>";
  }
  function fundCell(f) {
    return '<a class="hf-fund" href="#/fonds/' + esc(f.slug) + '">' + avatar(f, "sm") + "<span><b>" + esc(f.manager || f.name) +
      (f.category === "Investoren" ? ' <span class="hf-star">★</span>' : "") + "</b><small>" + esc(f.manager ? f.name : (f.city || f.style || "")) + "</small></span></a>";
  }

  /* ---------------------------------------------------------------- Start */
  function door(href, ico, title, text, tone) {
    return '<a class="hf-door" data-tone="' + tone + '" href="' + href + '">' + '<span class="hf-tile-ico">' + icon(ico) + "</span><b>" + title + "</b><span>" + text + "</span><em>Öffnen " + icon("arrow") + "</em></a>";
  }
  function renderHome() {
    var d = S.data, inv = investors(), agg = d.aggregates || {}, all = d.aggregatesAll || agg;
    var dl = nextDeadline(), days = Math.ceil((dl - new Date()) / 864e5), n = hfCount();
    var topBuy = (all.buys || [])[0], topHeld = (agg.consensus || [])[0];
    var faces = HERO_FACES.map(function (s) { return S.bySlug[s]; }).filter(function (f) { return f && f.photo; }).slice(0, 7);
    var featured = FEATURED.map(function (s) { return S.bySlug[s]; }).filter(Boolean);
    document.title = "Hedgefonds — Vision Universe®";

    root.innerHTML =
      '<section class="hf-hero vu-product-hero vu-hero-fidelity" data-product="hedgefonds">' +
          '<div class="vu-hero-scene" aria-hidden="true"></div>' +
          '<span class="vu-product-icon vu-product-icon--hero" aria-hidden="true"><svg viewBox="0 0 24 24"><use href="/assets/product-icons.svg#hedgefonds"></use></svg></span>' +
          '<div class="vu-hero-name">Hedgefonds</div>' +
          '<h1 class="vu-product-title vu-hero-headline">Große Investoren.<br>Klare Einblicke.</h1>' +
          '<p class="lead vu-product-lead vu-hero-description">Was große Investoren kaufen und verkaufen – Quartal für Quartal, direkt aus den Pflichtmeldungen an die US-Börsenaufsicht.</p>' +
          '<span class="hf-live"><i></i>13F-Meldungen · ' + esc(d.latestPeriodLabel || "") + " · geprüft " + dateDE(d.generatedAt) + "</span>" +
          '<div class="hf-hsearch"><label class="hf-search">' + icon("search") +
            '<input id="hf-q" type="search" placeholder="Investor, Fonds oder Aktie suchen …" autocomplete="off" aria-label="Investor, Fonds oder Aktie suchen"></label>' +
            '<div class="hf-spanel" id="hf-qres" hidden></div></div>' +
          '<div class="hf-pop">' + POPULAR.map(function (p) { return '<a class="hf-chip" href="#/' + p[1] + "/" + p[2] + '">' + esc(p[0]) + "</a>"; }).join("") + "</div>" +
      "</section>" +

      '<section class="hf-research-overview" aria-label="Investoren und Quartalsüberblick">' +
        '<p class="hf-research-description">Was Warren Buffett, Bill Ackman, Michael Burry, Cathie Wood und ' + nf0.format(n - 4) +
          " weitere Hedgefonds kaufen und verkaufen – Quartal für Quartal, direkt aus den Pflichtmeldungen an die US-Börsenaufsicht.</p>" +
        '<div class="hf-hero-art">' +
          '<div class="hf-orbit">' + faces.map(function (f, i) {
            return '<a class="hf-face f' + i + '" href="#/fonds/' + esc(f.slug) + '" title="' + esc(fundLabel(f)) + '">' + avatar(f, "face") + "<span>" + esc(String(f.manager).split(" ").slice(-1)[0]) + "</span></a>";
          }).join("") + "</div>" +
          (topBuy ? '<a class="hf-float a" href="' + stockHref(topBuy) + '">' + iconTile("up", "green") + "<span><small>Größter Kauf im Quartal</small><b>" +
            esc(issuerName(topBuy)) + '</b><em class="pos">+' + usd(topBuy.estValueUSD) + "</em></span></a>" : "") +
          (topHeld ? '<a class="hf-float b" href="' + stockHref(topHeld) + '">' + iconTile("star", "amber") + "<span><small>Meistgehalten bei Star-Investoren</small><b>" +
            esc(issuerName(topHeld)) + "</b><em>" + topHeld.fundCount + " Fonds</em></span></a>" : "") +
        "</div>" +
      "</section>" +

      '<section class="hf-kpis">' +
        '<a class="hf-kpi" href="#/datenbank">' + iconTile("users", "violet") + "<span><small>Hedgefonds</small><b>" + nf0.format(n) + "</b><em>davon " + inv.length + " Star-Investoren</em></span></a>" +
        '<a class="hf-kpi" href="#/aktien">' + iconTile("up", "green") + "<span><small>Größter Kauf</small><b>" + (topBuy ? esc(topBuy.ticker || issuerName(topBuy)) : "–") + "</b><em>" + (topBuy ? usd(topBuy.estValueUSD) + " · " + topBuy.fundCount + " Fonds" : "") + "</em></span></a>" +
        '<a class="hf-kpi" href="#/datenbank?f=dach">' + iconTile("globe", "blue") + "<span><small>Deutschland &amp; DACH</small><b>" + (d.dachCount || 0) + " Melder</b><em>u. a. Jan Beckers, Flossbach</em></span></a>" +
        '<div class="hf-kpi">' + iconTile("calendar", "rose") + "<span><small>Nächste Meldefrist</small><b>" + dateDE(dl.toISOString()) + "</b><em>in " + days + " Tagen · " + deadlineQuarter(dl) + "</em></span></div>" +
      "</section>" +

      '<section class="hf-section"><div class="hf-head"><div><h2>Star-Investoren</h2><p>Die bekanntesten Namen und ihre größten Positionen.</p></div>' +
        '<a class="hf-more" href="#/investoren">Alle ' + inv.length + " " + icon("arrow") + "</a></div>" +
        '<div class="hf-track">' + featured.map(function (f) { return card(f, true); }).join("") + "</div></section>" +

      '<section class="hf-section"><div class="hf-head"><div><h2>Käufe und Verkäufe im Quartal</h2><p id="hf-agg-note"></p></div>' +
        '<div class="hf-seg" id="hf-aggmode"><button type="button" data-agg="star">Star-Investoren</button><button type="button" data-agg="all">Alle Hedgefonds</button></div></div>' +
        '<div class="hf-two"><div class="hf-panel"><h3>' + icon("up", "pos") + 'Größte Käufe</h3><div id="hf-buys"></div></div>' +
        '<div class="hf-panel"><h3>' + icon("down", "neg") + 'Größte Verkäufe</h3><div id="hf-sells"></div></div></div></section>' +

      '<section class="hf-section"><div class="hf-head"><div><h2>Meistgehaltene Aktien</h2><p id="hf-cons-note"></p></div>' +
        '<a class="hf-more" href="#/aktien">Alle Aktien ' + icon("arrow") + '</a></div><div class="hf-two" id="hf-cons"></div></section>' +

      '<section class="hf-section"><div class="hf-head"><div><h2>Entdecken</h2></div></div><div class="hf-doors">' +
        door("#/investoren", "users", "Star-Investoren", inv.length + " bekannte Manager mit Portfolio und Trades", 0) +
        door("#/datenbank", "table", "Hedgefonds-Datenbank", nf0.format(n) + " Fonds filtern, sortieren, vergleichen", 1) +
        door("#/aktien", "chart", "Aktien", "Wer hält welche Aktie – und wie viel davon?", 2) +
        door("#/datenbank?f=dach", "globe", "Deutschland &amp; DACH", (d.dachCount || 0) + " Melder aus Deutschland, Österreich, Schweiz", 3) +
      "</div></section>" + footer();

    renderAgg();
    attachSearch(document.getElementById("hf-q"), document.getElementById("hf-qres"), { inline: true });
    document.getElementById("hf-aggmode").addEventListener("click", function (e) {
      var b = e.target.closest("[data-agg]");
      if (b) { S.aggMode = b.getAttribute("data-agg"); renderAgg(); }
    });
  }
  function renderAgg() {
    var all = S.aggMode === "all" && S.data.aggregatesAll;
    var agg = (all ? S.data.aggregatesAll : S.data.aggregates) || {};
    var n = (agg.funds || []).length;
    document.getElementById("hf-agg-note").textContent = "Summe über " + n + (all ? " Hedgefonds" : " Star-Investoren") +
      " (ohne Quant-Fonds mit tausenden Positionen). Volumen = Stückzahländerung × Kurs zum Quartalsende, daher geschätzt.";
    document.getElementById("hf-buys").innerHTML = stockList((agg.buys || []).slice(0, 10), "buys");
    document.getElementById("hf-sells").innerHTML = stockList((agg.sells || []).slice(0, 10), "sells");
    document.getElementById("hf-cons-note").textContent = "Welche Aktien die meisten der " + n + (all ? " Hedgefonds" : " Star-Investoren") + " gleichzeitig im Depot haben.";
    var c = agg.consensus || [];
    document.getElementById("hf-cons").innerHTML = '<div class="hf-panel">' + stockList(c.slice(0, 5), "consensus") + "</div>" +
      (c.length > 5 ? '<div class="hf-panel">' + stockList(c.slice(5, 10), "consensus", 5) + "</div>" : "");
    [].forEach.call(document.querySelectorAll("[data-agg]"), function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-agg") === S.aggMode); });
  }

  /* ----------------------------------------------------------- Investoren */
  function renderInvestors() {
    var inv = investors();
    document.title = "Star-Investoren · Hedgefonds — Vision Universe®";
    var counts = {};
    inv.forEach(function (f) { counts[f.style] = (counts[f.style] || 0) + 1; });
    var styles = ["Alle"].concat(Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; }));
    root.innerHTML = pageHead("Star-Investoren", "Die bekanntesten Manager", inv.length + " Investoren, deren Portfolios wir einzeln von der SEC laden – mit Foto, Kuchendiagramm und allen Trades.", "violet", "users") +
      '<div class="hf-tools"><label class="hf-search hf-search-sm">' + icon("search") + '<input id="hf-invq" type="search" placeholder="Name filtern, z. B. „bu“" value="' + esc(S.invQ) + '" autocomplete="off"></label>' +
      '<select class="hf-select" id="hf-sort" aria-label="Sortierung">' +
      [["value", "Größtes Portfolio"], ["change", "Stärkstes Wachstum"], ["concentration", "Am konzentriertesten"], ["filed", "Neueste Meldung"], ["name", "Name A–Z"]].map(function (o) {
        return '<option value="' + o[0] + '"' + (S.sort === o[0] ? " selected" : "") + ">" + o[1] + "</option>";
      }).join("") + "</select></div>" +
      '<div class="hf-chips" id="hf-styles">' + styles.map(function (s) {
        return '<button class="hf-chip" type="button" data-style="' + esc(s) + '" aria-pressed="' + (S.style === s) + '">' + esc(s) + '<span class="c">' + (s === "Alle" ? inv.length : counts[s]) + "</span></button>";
      }).join("") + "</div>" +
      '<p class="hf-foot-note" id="hf-grid-count"></p><div class="hf-grid" id="hf-grid"></div>' + footer();
    function draw() {
      var tokens = words(S.invQ);
      var list = inv.filter(function (f) {
        if (S.style !== "Alle" && f.style !== S.style) return false;
        return !tokens.length || matchScore(tokens, fundFields(f)) > 0;
      });
      var sorters = {
        value: function (a, b) { return b.totalValueUSD - a.totalValueUSD; },
        change: function (a, b) { return (b.aumChangePct == null ? -1e9 : b.aumChangePct) - (a.aumChangePct == null ? -1e9 : a.aumChangePct); },
        name: function (a, b) { return String(a.manager || a.name).localeCompare(String(b.manager || b.name), "de"); },
        filed: function (a, b) { return String(b.filedDate).localeCompare(String(a.filedDate)); },
        concentration: function (a, b) {
          var c = function (f) { return (f.top || []).slice(0, 5).reduce(function (s, h) { return s + h.weightPct; }, 0); };
          return c(b) - c(a);
        }
      };
      list.sort(sorters[S.sort] || sorters.value);
      document.getElementById("hf-grid").innerHTML = list.length ? list.map(function (f) { return card(f); }).join("") : '<p class="hf-empty">Kein Investor passt dazu.</p>';
      document.getElementById("hf-grid-count").textContent = list.length + " von " + inv.length + " Investoren";
    }
    draw();
    document.getElementById("hf-invq").addEventListener("input", function () { S.invQ = this.value; draw(); });
    document.getElementById("hf-sort").addEventListener("change", function () { S.sort = this.value; draw(); });
    document.getElementById("hf-styles").addEventListener("click", function (e) {
      var b = e.target.closest("[data-style]");
      if (!b) return;
      S.style = b.getAttribute("data-style");
      [].forEach.call(this.querySelectorAll("[data-style]"), function (x) { x.setAttribute("aria-pressed", x === b); });
      draw();
    });
  }

  /* ------------------------------------------------------------ Datenbank */
  function renderDatabase(params) {
    if (params && params.f) S.dbFilter = params.f;
    var all = dbAll(), star = investors().length, dach = all.filter(function (f) { return f.region; }).length, hf = hfCount();
    var am = all.filter(function (f) { return !isHF(f) && !f.region; }).length;
    document.title = "Hedgefonds-Datenbank — Vision Universe®";
    var chip = function (k, label, cnt) {
      return '<button class="hf-chip" type="button" data-db="' + k + '" aria-pressed="' + (S.dbFilter === k) + '">' + label + '<span class="c">' + nf0.format(cnt) + "</span></button>";
    };
    root.innerHTML = pageHead("Datenbank", "Alle Hedgefonds", nf0.format(hf) + " Hedgefonds mit Fondsgröße, Veränderung zum Vorquartal und den größten Positionen. " +
        "Ob ein Melder ein Hedgefonds ist, steht nicht in der 13F-Meldung; die Einordnung beruht auf Rechtsform, Optionspositionen und Namen.", "blue", "table") +
      '<div class="hf-tools"><label class="hf-search hf-search-sm">' + icon("search") + '<input id="hf-dbq" type="search" placeholder="Fonds, Manager oder Stadt – z. B. „jan“" value="' + esc(S.dbQ) + '" autocomplete="off"></label>' +
      '<select class="hf-select" id="hf-dbsort" aria-label="Sortierung">' +
      [["value", "Größte Fonds"], ["change", "Stärkstes Wachstum"], ["drop", "Stärkster Rückgang"], ["buys", "Meiste Käufe"], ["filed", "Neueste Meldung"], ["name", "Name A–Z"]].map(function (o) {
        return '<option value="' + o[0] + '"' + (S.dbSort === o[0] ? " selected" : "") + ">" + o[1] + "</option>";
      }).join("") + "</select></div>" +
      '<div class="hf-chips" id="hf-dbfilter">' + chip("all", "Alle Hedgefonds", hf) + chip("star", "Star-Investoren", star) + chip("more", "Weitere Hedgefonds", hf - star) +
        chip("dach", "Deutschland &amp; DACH", dach) + chip("am", "Vermögensverwalter", am) + "</div>" +
      '<p class="hf-foot-note" id="hf-dbcount"></p>' +
      '<div class="hf-table-wrap"><table class="hf-table hf-db"><thead><tr><th class="c-rk">#</th><th>Fonds</th><th class="r">Fondsgröße</th><th class="r">ggü. VQ</th>' +
        '<th class="r c-pos">Positionen</th><th class="c-top">Größte Positionen &amp; Veränderung</th><th class="r c-tr">Käufe / Verk.</th><th class="c-q">Stand</th></tr></thead><tbody id="hf-dbbody"></tbody></table></div>' +
      '<div class="hf-center"><button class="hf-pill" type="button" id="hf-dbmore"></button></div>' + renderInstitutions() + footer();
    function filtered() {
      var tokens = words(S.dbQ);
      var list = all.filter(function (f) {
        if (S.dbFilter === "all" && !isHF(f)) return false;
        if (S.dbFilter === "star" && f.category !== "Investoren") return false;
        if (S.dbFilter === "more" && (f.category === "Investoren" || f.style !== "Hedgefonds")) return false;
        if (S.dbFilter === "dach" && !f.region) return false;
        if (S.dbFilter === "am" && (isHF(f) || f.region)) return false;
        return !tokens.length || matchScore(tokens, fundFields(f)) > 0;
      });
      var num = function (v) { return v == null ? -1e12 : v; };
      var buys = function (f) { var t = f.tradeCounts || {}; return (t["new"] || 0) + (t.added || 0); };
      var sorters = {
        value: function (a, b) { return b.totalValueUSD - a.totalValueUSD; },
        change: function (a, b) { return num(b.aumChangePct) - num(a.aumChangePct); },
        drop: function (a, b) { return (a.aumChangePct == null ? 1e12 : a.aumChangePct) - (b.aumChangePct == null ? 1e12 : b.aumChangePct); },
        buys: function (a, b) { return buys(b) - buys(a); },
        filed: function (a, b) { return String(b.filedDate).localeCompare(String(a.filedDate)); },
        name: function (a, b) { return String(a.manager || a.name).localeCompare(String(b.manager || b.name), "de"); }
      };
      return list.sort(sorters[S.dbSort] || sorters.value);
    }
    function draw() {
      var list = filtered(), shown = list.slice(0, S.dbShown), body = document.getElementById("hf-dbbody");
      body.innerHTML = shown.length ? shown.map(function (f, i) {
        var tc = f.tradeCounts || {};
        var behind = S.data.latestPeriod && f.reportDate < S.data.latestPeriod;
        var top = (f.top || []).filter(function (h) { return !h.putCall; }).slice(0, 3).map(function (h) {
          return '<span class="hf-pos-chip">' + logo(h) + "<b>" + esc(h.ticker || issuerName(h).slice(0, 14)) + "</b><small>" + pct(h.weightPct) + "</small>" + chg(h) + "</span>";
        }).join("");
        var sub = [f.manager ? f.name : (f.style && f.style !== "Hedgefonds" ? f.style : ""), f.city, regionLabel(f)].filter(Boolean).join(" · ");
        return '<tr data-href="#/fonds/' + esc(f.slug) + '" tabindex="0"><td class="num c-rk">' + (i + 1) + '</td><td><div class="sec">' + avatar(f, "sm") +
          "<div><b>" + esc(f.manager || f.name) + (f.category === "Investoren" ? ' <span class="hf-star" title="Star-Investor">★</span>' : "") + "</b><small>" + esc(sub) + "</small></div></div></td>" +
          '<td class="r num"><b>' + usd(f.totalValueUSD) + "</b></td>" +
          (f.jump ? '<td class="r"><span class="hf-badge warn">Sprung</span></td>' : '<td class="r num ' + (f.aumChangePct >= 0 ? "pos" : "neg") + '">' + pct(f.aumChangePct, true) + "</td>") +
          '<td class="r num c-pos">' + nf0.format(f.positionCount) + '</td><td class="c-top"><div class="hf-pos-chips">' + top + "</div></td>" +
          '<td class="r num c-tr"><span class="pos">' + ((tc["new"] || 0) + (tc.added || 0)) + '</span> / <span class="neg">' + ((tc.sold || 0) + (tc.reduced || 0)) + "</span></td>" +
          '<td class="c-q"><span class="hf-badge' + (behind ? " warn" : "") + '">' + quarter(f.reportDate) + "</span></td></tr>";
      }).join("") : '<tr><td colspan="8" class="hf-empty">Kein Fonds passt zur Suche.</td></tr>';
      bindRowLinks(body);
      document.getElementById("hf-dbcount").textContent = nf0.format(list.length) + " Fonds" + (list.length > shown.length ? " · gezeigt " + shown.length : "");
      var more = document.getElementById("hf-dbmore");
      more.hidden = list.length <= shown.length;
      more.textContent = "Weitere " + Math.min(PAGE, list.length - shown.length) + " anzeigen (" + nf0.format(list.length - shown.length) + " übrig)";
    }
    draw();
    document.getElementById("hf-dbq").addEventListener("input", function () { S.dbQ = this.value; S.dbShown = PAGE; draw(); });
    document.getElementById("hf-dbsort").addEventListener("change", function () { S.dbSort = this.value; S.dbShown = PAGE; draw(); });
    document.getElementById("hf-dbmore").addEventListener("click", function () { S.dbShown += PAGE; draw(); });
    document.getElementById("hf-dbfilter").addEventListener("click", function (e) {
      var b = e.target.closest("[data-db]");
      if (!b) return;
      S.dbFilter = b.getAttribute("data-db"); S.dbShown = PAGE;
      [].forEach.call(this.querySelectorAll("[data-db]"), function (x) { x.setAttribute("aria-pressed", x === b); });
      draw();
    });
    bindRowLinks(root);
  }
  function renderInstitutions() {
    var list = institutions();
    if (!list.length) return "";
    return '<section class="hf-section"><div class="hf-head"><div><h2>Weitere Institutionen</h2>' +
      "<p>Die größten übrigen 13F-Melder (Vermögensverwalter, Banken, Marktmacher) aus dem SEC-Sammeldatensatz " + quarter(S.data.bulkPeriod) +
      ". Diese Portfolios bilden überwiegend Indizes und Kundendepots ab.</p></div></div>" +
      '<div class="hf-table-wrap"><table class="hf-table hf-inst"><thead><tr><th>Institution</th><th class="c-pos">Art</th><th class="r">Portfolio</th><th class="r">ggü. VQ</th></tr></thead><tbody>' +
      list.map(function (f) {
        return '<tr data-href="#/fonds/' + esc(f.slug) + '" tabindex="0"><td><b>' + esc(f.name) + '</b></td><td class="c-pos">' + esc(f.style) +
          '</td><td class="r num">' + usd(f.totalValueUSD) + '</td><td class="r num ' + (f.aumChangePct >= 0 ? "pos" : "neg") + '">' + pct(f.aumChangePct, true) + "</td></tr>";
      }).join("") + "</tbody></table></div></section>";
  }

  /* --------------------------------------------------------------- Aktien */
  function renderStocks() {
    document.title = "Aktien · Hedgefonds — Vision Universe®";
    var all = S.data.aggregatesAll || S.data.aggregates || {};
    root.innerHTML = pageHead("Aktien", "Wer hält welche Aktie?", "Für jede Aktie: welche Hedgefonds sie halten, mit welchem Anteil am Portfolio, und wer im letzten Quartal gekauft oder verkauft hat.", "green", "chart") +
      '<div class="hf-hsearch wide"><label class="hf-search">' + icon("search") +
        '<input id="hf-sq" type="search" placeholder="Aktie oder Ticker – z. B. „pal“, „SoFi“, „TDOC“" autocomplete="off" aria-label="Aktie suchen"></label>' +
        '<div class="hf-spanel" id="hf-sqres" hidden></div></div>' +
      '<section class="hf-section"><div class="hf-head"><div><h2>Meistgehaltene Aktien</h2><p>Nach Anzahl der Hedgefonds, die die Aktie unter ihren größten Positionen halten.</p></div>' +
        '<div class="hf-seg" id="hf-smode"><button type="button" data-sm="all">Alle Fonds</button><button type="button" data-sm="star">Star-Investoren</button></div></div>' +
        '<div class="hf-stock-grid" id="hf-sgrid"><div class="hf-skeleton"></div></div></section>' +
      '<section class="hf-section"><div class="hf-head"><div><h2>Käufe und Verkäufe im Quartal</h2><p>Über alle Hedgefonds, geschätztes Volumen.</p></div></div>' +
        '<div class="hf-two"><div class="hf-panel"><h3>' + icon("up", "pos") + "Größte Käufe</h3>" + stockList((all.buys || []).slice(0, 15), "buys") + "</div>" +
        '<div class="hf-panel"><h3>' + icon("down", "neg") + "Größte Verkäufe</h3>" + stockList((all.sells || []).slice(0, 15), "sells") + "</div></div></section>" + footer();
    attachSearch(document.getElementById("hf-sq"), document.getElementById("hf-sqres"), { inline: true, stocksOnly: true, stockLimit: 10 });
    function draw() {
      var list = (S.stockIndex || []).slice();
      if (S.stockMode === "star") list = list.filter(function (s) { return s.starCount; }).sort(function (a, b) { return b.starCount - a.starCount || b.valueUSD - a.valueUSD; });
      document.getElementById("hf-sgrid").innerHTML = list.slice(0, 30).map(function (s, i) {
        var cnt = S.stockMode === "star" ? s.starCount : s.fundCount;
        return '<a class="hf-stile" href="#/aktie/' + esc(s.cusip) + '"><span class="rk">' + (i + 1) + "</span>" + logo(s, "lg") +
          '<span class="t"><b>' + esc(issuerName(s)) + "</b><small>" + esc(s.ticker || "") + '</small></span><span class="v"><b>' + cnt + "</b><small>" +
          (S.stockMode === "star" ? "Star-Investoren" : "Fonds") + "</small></span></a>";
      }).join("") || '<p class="hf-empty">Aktienliste wird geladen …</p>';
      [].forEach.call(document.querySelectorAll("[data-sm]"), function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-sm") === S.stockMode); });
    }
    loadStockIndex().then(function () { if (location.hash.indexOf("#/aktien") === 0) draw(); });
    document.getElementById("hf-smode").addEventListener("click", function (e) {
      var b = e.target.closest("[data-sm]");
      if (b) { S.stockMode = b.getAttribute("data-sm"); draw(); }
    });
  }

  function renderStock(cusip) {
    root.innerHTML = backLink("#/aktien", "Alle Aktien") + '<div class="hf-skeleton" style="height:320px"></div>';
    window.scrollTo(0, 0);
    loadStock(cusip).then(function (a) {
      if (location.hash.indexOf("#/aktie/" + cusip) !== 0) return;
      if (!a) { root.innerHTML = backLink("#/aktien", "Alle Aktien") + '<p class="hf-empty">Zu dieser Aktie liegen keine Fondsdaten vor.</p>'; return; }
      var name = issuerName(a);
      document.title = name + " · Hedgefonds — Vision Universe®";
      var holders = a.holders.filter(function (h) { return S.bySlug[h.s]; });
      var stars = holders.filter(function (h) { return S.bySlug[h.s].category === "Investoren"; });
      var buyers = holders.filter(function (h) { return h.st === "new" || h.st === "added"; });
      var reducers = holders.filter(function (h) { return h.st === "reduced"; });
      var sellers = a.sellers.filter(function (h) { return S.bySlug[h.s]; });
      var topW = holders[0];
      root.innerHTML = '<div class="hf-detail">' + backLink("#/aktien", "Alle Aktien") +
        '<section class="hf-dhero hf-shero">' + logo(a, "xl") + "<div>" +
          '<div class="hf-eyebrow">Aktie' + (a.ticker ? " · " + esc(a.ticker) : "") + " · CUSIP " + esc(a.cusip) + "</div><h1>" + esc(name) + "</h1>" +
          '<p class="bio">Gehalten von <b>' + holders.length + " Hedgefonds</b>" + (stars.length ? ", darunter " + stars.length + " Star-Investoren" : "") +
            ". Im letzten Quartal haben " + buyers.length + " gekauft oder aufgestockt, " + (reducers.length + sellers.length) + " reduziert oder verkauft.</p>" +
          '<div class="tags">' + (a.discover && a.ticker ? '<a class="hf-pill dark" href="/discover/#/s/US_REAL/' + encodeURIComponent(a.ticker) + '">Kurs &amp; Kennzahlen in Discover ' + icon("arrow") + "</a>" : "") + "</div>" +
        "</div></section>" +
        '<div class="hf-dstats">' +
          stat("users", "violet", "Hedgefonds", holders.length, stars.length + " Star-Investoren") +
          stat("brief", "blue", "Gehaltener Wert", usd(a.valueUSD), "Summe der Positionen") +
          stat("up", "green", "Käufer", buyers.length, holders.filter(function (h) { return h.st === "new"; }).length + " neu eingestiegen") +
          stat("down", "rose", "Verkäufer", reducers.length + sellers.length, sellers.length + " komplett ausgestiegen") +
        "</div>" +
        (topW ? '<p class="hf-callout">' + icon("star") + "<span>Größte Überzeugung: <b>" + esc(fundLabel(S.bySlug[topW.s])) + "</b> hält " + esc(name) + " mit <b>" + pct(topW.w) + "</b> seines Portfolios.</span></p>" : "") +
        '<div class="hf-head hf-gap"><div><h2>Diese Fonds halten ' + esc(name) + "</h2><p>Anteil = Gewicht der Aktie im jeweiligen 13F-Portfolio.</p></div>" +
          '<div class="hf-seg" id="hf-hmode"><button type="button" data-hm="all" aria-pressed="true">Alle (' + holders.length + ')</button><button type="button" data-hm="star" aria-pressed="false">Star-Investoren (' + stars.length + ")</button></div></div>" +
        '<div class="hf-table-wrap"><table class="hf-table hf-holders"><thead><tr><th>Fonds</th><th class="r">Anteil</th><th class="r c-v">Wert</th><th class="r c-fs">Fondsgröße</th><th class="r">ggü. VQ</th></tr></thead><tbody id="hf-hbody"></tbody></table></div>' +
        (sellers.length ? '<div class="hf-head hf-gap"><div><h2>Komplett verkauft</h2><p>Diese Fonds hielten ' + esc(name) + " im Vorquartal und sind ausgestiegen.</p></div></div>" +
          '<div class="hf-table-wrap"><table class="hf-table hf-holders"><thead><tr><th>Fonds</th><th class="r">Wert vorher</th><th class="r c-fs">Fondsgröße</th></tr></thead><tbody>' +
          sellers.map(function (h) {
            var f = S.bySlug[h.s];
            return '<tr data-href="#/fonds/' + esc(f.slug) + '" tabindex="0"><td>' + fundCell(f) + '</td><td class="r num neg">' + usd(h.v) + '</td><td class="r num c-fs">' + usd(f.totalValueUSD) + "</td></tr>";
          }).join("") + "</tbody></table></div>" : "") +
        '<p class="hf-foot-note">Berücksichtigt sind je Fonds die größten gemeldeten Positionen (Star-Investoren: 150, weitere Hedgefonds: 50). Kleinere Beteiligungen können fehlen.</p>' +
        footer() + "</div>";
      function draw(mode) {
        var list = mode === "star" ? stars : holders, body = document.getElementById("hf-hbody");
        var maxW = list.length ? list[0].w : 1;
        body.innerHTML = list.map(function (h) {
          var f = S.bySlug[h.s];
          return '<tr data-href="#/fonds/' + esc(f.slug) + '" tabindex="0"><td>' + fundCell(f) + '</td><td class="r"><span class="hf-wbar"><i style="width:' +
            Math.min(100, h.w / maxW * 100).toFixed(1) + '%"></i></span><b class="num">' + pct(h.w) + '</b></td><td class="r num c-v">' + usd(h.v) +
            '</td><td class="r num c-fs">' + usd(f.totalValueUSD) + "</td><td class=\"r\">" + (chg(h) || '<span class="hf-chg">Unverändert</span>') + "</td></tr>";
        }).join("") || '<tr><td colspan="5" class="hf-empty">Keine Star-Investoren unter den Haltern.</td></tr>';
        bindRowLinks(body);
      }
      draw("all");
      bindRowLinks(root);
      document.getElementById("hf-hmode").addEventListener("click", function (e) {
        var b = e.target.closest("[data-hm]");
        if (!b) return;
        [].forEach.call(this.querySelectorAll("[data-hm]"), function (x) { x.setAttribute("aria-pressed", x === b); });
        draw(b.getAttribute("data-hm"));
      });
    }).catch(function (err) {
      root.innerHTML = backLink("#/aktien", "Alle Aktien") + '<p class="hf-empty">Aktie konnte nicht geladen werden (' + esc(err.message) + ").</p>";
    });
  }

  /* ------------------------------------------------------------ Fonds */
  function donut(d) {
    var hs = d.holdings || [], total = d.totalValueUSD || 1, top = hs.slice(0, 8);
    var rest = total - top.reduce(function (s, h) { return s + h.valueUSD; }, 0);
    var segs = top.map(function (h, i) {
      return { item: h, label: issuerName(h), value: h.valueUSD, color: cssVar(SERIES[i]), put: h.putCall, href: h.putCall ? null : stockHref(h) };
    });
    if (rest / total > 0.0005) segs.push({ label: "Sonstige", sub: nf0.format(Math.max(0, d.positionCount + (d.optionCount || 0) - top.length)) + " weitere Positionen", value: rest, color: cssVar("--s-other") });
    var R = 80, C = 2 * Math.PI * R, gap = segs.length > 1 ? 2.2 : 0, off = 0;
    var circles = segs.map(function (s, i) {
      var len = s.value / total * C, dash = Math.max(0.6, len - gap);
      var c = '<circle class="seg" data-i="' + i + '" r="' + R + '" cx="100" cy="100" stroke="' + s.color + '" stroke-width="30" stroke-dasharray="' +
        dash.toFixed(2) + " " + (C - dash).toFixed(2) + '" stroke-dashoffset="' + (-off).toFixed(2) + '"><title>' + esc(s.label) + ": " + pct(s.value / total * 100) + "</title></circle>";
      off += len;
      return c;
    }).join("");
    var legend = segs.map(function (s, i) {
      var body = (s.item ? logo(s.item, "md") : '<span class="hf-logo md other" aria-hidden="true">+</span>') + '<span class="lb"><b>' + esc(s.label) + "</b>" +
        (s.put ? ' <span class="hf-badge warn">' + (s.put === "PUT" ? "Put" : "Call") + "</span>" : "") + (s.sub ? "<small>" + esc(s.sub) + "</small>" : "") +
        '</span><span class="pc">' + pct(s.value / total * 100) + "</span>";
      return '<li data-i="' + i + '" style="--sw:' + s.color + '">' + (s.href ? '<a class="lg-row" href="' + s.href + '">' + body + "</a>" : '<div class="lg-row">' + body + "</div>") + "</li>";
    }).join("");
    var conc = top.slice(0, 5).reduce(function (s, h) { return s + h.valueUSD; }, 0) / total * 100;
    return { segs: segs, html:
      '<div class="hf-box"><h3>' + icon("pie") + 'Portfolio-Aufteilung</h3><p class="cap">Top 5 = ' + pct(conc) + " des Portfolios · " + nf0.format(d.positionCount) + " Positionen</p>" +
      '<div class="hf-donut-wrap"><div class="hf-donut" id="hf-donut"><svg viewBox="0 0 200 200" role="img" aria-label="Kuchendiagramm der größten Positionen">' + circles + "</svg>" +
      '<div class="hf-donut-center"><b id="hf-dc-v">' + usd(d.totalValueUSD) + '</b><span id="hf-dc-l">Fondsgröße ' + quarter(d.reportDate) + "</span></div></div>" +
      '<ul class="hf-legend" id="hf-legend">' + legend + "</ul></div></div>" };
  }
  function bindDonut(d, segs) {
    var wrap = document.getElementById("hf-donut"), legend = document.getElementById("hf-legend");
    if (!wrap) return;
    var v = document.getElementById("hf-dc-v"), l = document.getElementById("hf-dc-l"), total = d.totalValueUSD || 1;
    function on(i) {
      wrap.classList.add("dim");
      [].forEach.call(wrap.querySelectorAll(".seg"), function (c) { c.classList.toggle("on", +c.getAttribute("data-i") === i); });
      [].forEach.call(legend.children, function (li) { li.classList.toggle("on", +li.getAttribute("data-i") === i); });
      v.textContent = pct(segs[i].value / total * 100);
      l.textContent = segs[i].label;
    }
    function off() {
      wrap.classList.remove("dim");
      [].forEach.call(legend.children, function (li) { li.classList.remove("on"); });
      v.textContent = usd(d.totalValueUSD);
      l.textContent = "Fondsgröße " + quarter(d.reportDate);
    }
    [wrap, legend].forEach(function (el) {
      el.addEventListener("mouseover", function (e) { var t = e.target.closest("[data-i]"); if (t) on(+t.getAttribute("data-i")); });
      el.addEventListener("mouseleave", off);
    });
    wrap.addEventListener("click", function (e) { var t = e.target.closest("[data-i]"); if (t) on(+t.getAttribute("data-i")); });
  }
  function history(d) {
    var h = (d.history || []).filter(function (x) { return x.valueUSD > 0; });
    if (h.length < 2) return '<div class="hf-box"><h3>' + icon("chart") + 'Fondsgröße im Verlauf</h3><p class="cap">Noch kein Verlauf verfügbar.</p></div>';
    var max = Math.max.apply(null, h.map(function (x) { return x.valueUSD; }));
    var peak = h.filter(function (x) { return x.valueUSD === max; })[0];
    var growth = h[0].valueUSD ? (h[h.length - 1].valueUSD - h[0].valueUSD) / h[0].valueUSD * 100 : null;
    return '<div class="hf-box"><h3>' + icon("chart") + 'Fondsgröße im Verlauf</h3><p class="cap">' + h.length + " Quartale · " +
      '<span class="' + (growth >= 0 ? "pos" : "neg") + '">' + pct(growth, true) + "</span> seit " + quarter(h[0].period) + " · Höchststand " + usd(max) + " (" + qShort(peak.period) + ")</p>" +
      '<div class="hf-hist" id="hf-hist">' + h.map(function (x, i) {
        return '<button type="button" class="col' + (i === h.length - 1 ? " last on" : "") + '" data-v="' + esc(usd(x.valueUSD)) + '" data-q="' + qShort(x.period) + '">' +
          '<span class="bar" style="height:' + Math.max(1.5, x.valueUSD / max * 100).toFixed(1) + '%"></span><span class="q">' + qShort(x.period) + "</span></button>";
      }).join("") + '</div><p class="hf-hist-now" id="hf-hist-now"><b>' + usd(h[h.length - 1].valueUSD) + "</b> · " + qShort(h[h.length - 1].period) + "</p></div>";
  }
  function bindHistory() {
    var box = document.getElementById("hf-hist"), out = document.getElementById("hf-hist-now");
    if (!box) return;
    function show(col) {
      [].forEach.call(box.children, function (c) { c.classList.toggle("on", c === col); });
      out.innerHTML = "<b>" + col.getAttribute("data-v") + "</b> · " + col.getAttribute("data-q");
    }
    box.addEventListener("mouseover", function (e) { var c = e.target.closest(".col"); if (c) show(c); });
    box.addEventListener("click", function (e) { var c = e.target.closest(".col"); if (c) show(c); });
    box.addEventListener("mouseleave", function () { show(box.lastElementChild); });
  }
  function positionsTable(d) {
    var hs = d.holdings || [];
    return '<div class="hf-table-wrap"><table class="hf-table hf-pos"><thead><tr><th class="c-rk">#</th><th>Aktie</th><th class="r">Anteil</th><th class="r c-v">Wert</th><th class="r c-sh">Stück</th><th class="r">ggü. VQ</th></tr></thead><tbody>' +
      hs.map(function (h, i) {
        return '<tr><td class="num c-rk">' + (i + 1) + '</td><td><div class="sec">' + logo(h, "md") + "<div><b>" + stockName(h) + optTag(h) + "</b><small>" + esc(h.ticker || h.cls || "") +
          '</small></div></div></td><td class="r"><span class="hf-wbar"><i style="width:' + Math.min(100, h.weightPct / (hs[0].weightPct || 1) * 100).toFixed(1) +
          '%"></i></span><b class="num">' + pct(h.weightPct) + '</b></td><td class="r num c-v">' + usd(h.valueUSD) + '</td><td class="r num c-sh">' + shares(h.shares) + "</td><td class=\"r\">" + (h.status ? chg(h) || '<span class="hf-chg">Unverändert</span>' : "–") + "</td></tr>";
      }).join("") + "</tbody></table></div>" +
      (d.holdingsTruncated ? '<p class="hf-foot-note">Gezeigt werden die ' + hs.length + " größten von " + nf0.format(d.positionCount + (d.optionCount || 0)) + " Positionen" + (d.optionCount ? " (inkl. Optionen)" : "") + ".</p>" : "");
  }
  function tradesTable(list, sells, total) {
    if (!list.length) return '<p class="hf-empty">Keine ' + (sells ? "Verkäufe" : "Käufe") + " in diesem Quartal.</p>";
    return '<div class="hf-table-wrap"><table class="hf-table hf-pos"><thead><tr><th>Aktie</th><th class="c-sh">Aktion</th><th class="r">Veränderung</th><th class="r c-sh">Stück vorher → jetzt</th><th class="r c-v">Anteil jetzt</th><th class="r">Volumen</th></tr></thead><tbody>' +
      list.map(function (t) {
        var change = t.status === "new" ? '<span class="hf-chg new">Neu</span>' : t.status === "sold" ? '<span class="hf-chg down">Verkauft</span>' :
          '<span class="hf-chg ' + (t.deltaPct >= 0 ? "up" : "down") + '">' + pct(t.deltaPct, true) + "</span>";
        return '<tr><td><div class="sec">' + logo(t, "md") + "<div><b>" + stockName(t) + optTag(t) + "</b><small>" + esc(t.ticker || t.cls || "") + '</small></div></div></td><td class="c-sh">' + statusBadge(t, false) +
          '</td><td class="r">' + change + '</td><td class="r num c-sh">' + shares(t.prevShares) + " → " + shares(t.shares) +
          '</td><td class="r num c-v">' + (total ? pct(t.valueUSD / total * 100) : "–") + '</td><td class="r num ' + (t.estValueUSD >= 0 ? "pos" : "neg") + '">' + usd(t.estValueUSD) + "</td></tr>";
      }).join("") + "</tbody></table></div>";
  }
  function renderTab(d) {
    var el = document.getElementById("hf-tabbody");
    if (!el) return;
    var tr = d.trades || {};
    if (S.tab === "holdings") el.innerHTML = positionsTable(d);
    else if (S.tab === "buys") el.innerHTML = tradesTable((tr["new"] || []).concat(tr.added || []).sort(function (a, b) { return b.estValueUSD - a.estValueUSD; }), false, d.totalValueUSD);
    else el.innerHTML = tradesTable((tr.sold || []).concat(tr.reduced || []).sort(function (a, b) { return a.estValueUSD - b.estValueUSD; }), true, d.totalValueUSD);
    [].forEach.call(document.querySelectorAll(".hf-tab"), function (b) { b.setAttribute("aria-selected", b.getAttribute("data-tab") === S.tab); });
  }
  function renderFund(slug) {
    var f = S.bySlug[slug];
    var back = f && f.category === "Investoren" ? backLink("#/investoren", "Star-Investoren") : backLink("#/datenbank", "Datenbank");
    if (!f) { root.innerHTML = back + '<p class="hf-empty">Fonds nicht gefunden.</p>'; return; }
    document.title = (f.manager ? f.manager + " – " : "") + f.name + " · Hedgefonds — Vision Universe®";
    root.innerHTML = back + '<div class="hf-skeleton" style="height:320px"></div>';
    window.scrollTo(0, 0);
    loadFund(slug).then(function (d) {
      if (location.hash.indexOf("#/fonds/" + slug) !== 0) return;
      var tc = d.tradeCounts || {}, aumChg = d.aumChangePct, photo = d.photo;
      var nBuys = (tc["new"] || 0) + (tc.added || 0), nSells = (tc.sold || 0) + (tc.reduced || 0);
      var dn = donut(d);
      root.innerHTML = '<div class="hf-detail">' + back +
        '<section class="hf-dhero">' + avatar(f, "xl") + "<div>" +
          '<div class="hf-eyebrow">' + esc(f.style || "") + (f.role ? " · " + esc(f.role) : "") + (f.region ? " · " + esc(regionLabel(f)) : "") + (f.city && !f.role ? " · " + esc(f.city) : "") + "</div>" +
          "<h1>" + esc(f.manager || f.name) + "</h1>" +
          '<p class="sub">' + esc(f.manager ? f.name : (String(d.secName).toLowerCase() === String(f.name).toLowerCase() ? "13F-Melder" : d.secName)) +
            (d.secName && f.manager ? ' · <span class="mut">SEC-Filer: ' + esc(d.secName) + "</span>" : "") + "</p>" +
          (f.bio ? '<p class="bio">' + esc(f.bio) + "</p>" : "") +
          (d.jump ? '<p class="hf-note">Die gemeldete Fondsgröße hat sich gegenüber dem Vorquartal extrem verändert (' + usd(d.prevTotalValueUSD) + " → " + usd(d.totalValueUSD) + "). Das kann eine Umstrukturierung oder ein Meldefehler sein.</p>" : "") +
          (f.note ? '<p class="hf-note">' + esc(f.note) + "</p>" : f.reportDate < S.data.latestPeriod ? '<p class="hf-note">Für ' + esc(S.data.latestPeriodLabel) +
            " liegt von diesem Fonds bei der SEC noch keine 13F-Meldung vor. Gezeigt wird der Stand " + quarter(f.reportDate) + ".</p>" : "") +
          '<div class="tags"><a class="hf-pill dark" href="' + secLink(d) + '" target="_blank" rel="noopener">13F bei der SEC ' + icon("ext") + "</a></div>" +
          (photo ? '<p class="hf-credit">Foto: ' + esc(photo.artist) + ", " + (photo.licenseUrl ? '<a href="' + esc(photo.licenseUrl) + '" target="_blank" rel="noopener">' + esc(photo.license) + "</a>" : esc(photo.license)) +
            (photo.sourceUrl ? ' · <a href="' + esc(photo.sourceUrl) + '" target="_blank" rel="noopener">Wikimedia Commons</a>' : "") + "</p>" : "") +
        "</div></section>" +
        '<div class="hf-dstats">' +
          stat("brief", "blue", "Fondsgröße (13F)", usd(d.totalValueUSD), "US-Portfolio " + quarter(d.reportDate)) +
          stat(aumChg >= 0 ? "up" : "down", aumChg >= 0 ? "green" : "rose", "ggü. Vorquartal", '<span class="' + (aumChg >= 0 ? "pos" : "neg") + '">' + pct(aumChg, true) + "</span>", d.prevTotalValueUSD ? "vorher " + usd(d.prevTotalValueUSD) : "kein Vorquartal") +
          stat("layers", "violet", "Positionen", nf0.format(d.positionCount), d.optionCount ? "Wertpapiere, dazu " + nf0.format(d.optionCount) + " Optionen" :
            (d.prevPositionCount != null ? "vorher " + nf0.format(d.prevPositionCount) : "")) +
          stat("calendar", "amber", "Gemeldet am", dateDE(d.filedDate), esc(d.form || "13F-HR") + " · Stichtag " + dateDE(d.reportDate)) +
        "</div>" +
        '<div class="hf-dgrid">' + dn.html + history(d) + "</div>" +
        '<div class="hf-tabs" role="tablist">' +
          '<button class="hf-tab" role="tab" data-tab="holdings">Positionen<span class="c">' + nf0.format(d.positionCount) + "</span></button>" +
          '<button class="hf-tab" role="tab" data-tab="buys">Käufe<span class="c">' + nf0.format(nBuys) + "</span></button>" +
          '<button class="hf-tab" role="tab" data-tab="sells">Verkäufe<span class="c">' + nf0.format(nSells) + "</span></button></div>" +
        '<div id="hf-tabbody"></div>' +
        (d.tradeCounts ? '<p class="hf-foot-note">Käufe = ' + nf0.format(tc["new"] || 0) + " neue Positionen + " + nf0.format(tc.added || 0) + " aufgestockt · Verkäufe = " +
          nf0.format(tc.reduced || 0) + " reduziert + " + nf0.format(tc.sold || 0) + " komplett verkauft (nicht mehr im Depot, daher nicht unter Positionen) · Vergleich " +
          quarter(d.prevReportDate) + " → " + quarter(d.reportDate) + "." +
          (d.optionCount ? " Optionen (Calls/Puts) sind in Positionen, Käufen und Verkäufen nicht mitgezählt; sie stehen mit dem Wert des Basiswerts in der Liste." : "") + "</p>" : "") +
        footer() + "</div>";
      bindDonut(d, dn.segs);
      bindHistory();
      renderTab(d);
      document.querySelector(".hf-tabs").addEventListener("click", function (e) {
        var b = e.target.closest("[data-tab]");
        if (b) { S.tab = b.getAttribute("data-tab"); renderTab(d); }
      });
    }).catch(function (err) {
      root.innerHTML = back + '<p class="hf-empty">Details konnten nicht geladen werden (' + esc(err.message) + ").</p>";
    });
  }

  /* ------------------------------------------------------------ Routing */
  var LEGACY = { investoren: "#/investoren", datenbank: "#/datenbank", kaeufe: "#/", konsens: "#/aktien", institutionen: "#/datenbank" };
  var lastPath = null, scrollMemo = {};
  function route() {
    var h = location.hash || "#/";
    if (!/^#\//.test(h)) { location.replace(LEGACY[h.slice(1)] || "#/"); return; }
    var path = h.slice(2).split("?")[0], params = {};
    (h.split("?")[1] || "").split("&").forEach(function (kv) { var p = kv.split("="); if (p[0]) params[p[0]] = decodeURIComponent(p[1] || ""); });
    var parts = path.split("/").filter(Boolean), page = parts[0] || "start";
    if (lastPath !== null) scrollMemo[lastPath] = window.scrollY;
    var changed = lastPath !== path;
    lastPath = path;
    if (page === "fonds" && parts[1]) { setDock(null); if (changed) S.tab = "holdings"; renderFund(parts[1]); return; }
    if (page === "aktie" && parts[1]) { setDock("aktien"); renderStock(decodeURIComponent(parts[1])); return; }
    var pages = { start: renderHome, investoren: renderInvestors, datenbank: renderDatabase, aktien: renderStocks };
    (pages[page] || renderHome)(params);
    setDock(pages[page] ? page : "start");
    window.scrollTo(0, scrollMemo[path] || 0);
  }
  window.addEventListener("hashchange", route);
  document.addEventListener("keydown", function (e) {
    if (e.key === "/" && !/input|textarea|select/i.test(document.activeElement.tagName) && overlay && overlay.hidden) { e.preventDefault(); openSearch(); }
  });

  buildOverlay();
  root.innerHTML = '<div class="hf-skeleton" style="margin-top:24px;height:420px"></div>';
  load().then(route).catch(function (err) {
    root.innerHTML = '<p class="hf-empty">Die 13F-Daten konnten nicht geladen werden (' + esc(err.message) + ").</p>";
  });
})();
