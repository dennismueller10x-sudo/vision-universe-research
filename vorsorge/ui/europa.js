/* =========================================================================
   VISION UNIVERSE VORSORGE — ui/europa.js
   Europäische ETF-Anteilklassen (ESMA FIRDS + GLEIF): ISIN, Handelsplätze,
   Domizil, Ertragsverwendung laut CFI. Kein Kursfeed für europäische
   Listings – das wird gesagt, nicht verschleiert.
   ========================================================================= */
(function (global) {
  "use strict";
  var VS = global.VS, F = VS.fmt, esc = VS.esc;
  VS.SECTION_OF.europa = "etfs";

  var MIC = { XETR: "Xetra", XETA: "Xetra", XETU: "Xetra", XFRA: "Börse Frankfurt", FRAA: "Börse Frankfurt", FRAU: "Börse Frankfurt", XLON: "London Stock Exchange", LNEQ: "London Stock Exchange",
    XAMS: "Euronext Amsterdam", XPAR: "Euronext Paris", XBRU: "Euronext Brüssel", XMIL: "Borsa Italiana", ETFP: "Borsa Italiana (ETFplus)", XSWX: "SIX Swiss Exchange", XWBO: "Wiener Börse",
    XSTU: "Börse Stuttgart", STUB: "Börse Stuttgart", STUD: "Börse Stuttgart", STUF: "Börse Stuttgart", XMUN: "Börse München", MUNB: "Börse München", MUND: "Börse München",
    XHAM: "Börse Hamburg", HAMB: "Börse Hamburg", HAMN: "Börse Hamburg", XHAN: "Börse Hannover", HANB: "Börse Hannover", HAND: "Börse Hannover", XDUS: "Börse Düsseldorf", XBER: "Börse Berlin",
    XGAT: "Tradegate", TGAT: "Tradegate", XMAD: "BME Madrid", XDUB: "Euronext Dublin", XLIS: "Euronext Lissabon", XOSL: "Oslo Børs", XSTO: "Nasdaq Stockholm", XCSE: "Nasdaq Kopenhagen", XHEL: "Nasdaq Helsinki" };
  var DE_VENUES = { XETR: 1, XETA: 1, XETU: 1, XFRA: 1, FRAA: 1, FRAU: 1, XSTU: 1, STUB: 1, STUD: 1, STUF: 1, XMUN: 1, MUNB: 1, MUND: 1, XHAM: 1, HAMB: 1, HAMN: 1, XHAN: 1, HANB: 1, HAND: 1, XDUS: 1, XBER: 1, XGAT: 1, TGAT: 1 };
  var DIST = { ACCUMULATING: "thesaurierend", DISTRIBUTING: "ausschüttend", MIXED: "gemischt" };
  var BRAND = { BLACKROCK: "iShares", VANGUARD: "Vanguard", AMUNDI: "Amundi", DWS: "Xtrackers", STATE_STREET: "SPDR", INVESCO: "Invesco", WISDOMTREE: "WisdomTree", UBS: "UBS", JPMORGAN: "J.P. Morgan",
    FIDELITY: "Fidelity", HSBC: "HSBC", VANECK: "VanEck", FRANKLIN_TEMPLETON: "Franklin Templeton", BNP_PARIBAS: "BNP Paribas", LEGAL_GENERAL: "L&G", GLOBAL_X: "Global X" };
  VS.micName = function (m) { return MIC[m] || m; };

  var eu = null;
  VS.euIndex = function () {
    if (eu) return eu;
    // Stamm (ESMA FIRDS) + amtlicher UCITS-Status (ESMA-Fondsregister); fehlt die Registerdatei, bleibt der Stamm nutzbar.
    eu = Promise.all([VS.getJSON("/vorsorge/data/eu/etf-eu-index.json"), VS.getJSON("/vorsorge/data/eu/etf-eu-ucits.json").catch(function () { return null; })]).then(function (res) {
      var j = res[0], u = res[1];
      j.items = j.rows.map(function (r) { var o = {}; j.fields.forEach(function (f, i) { o[f] = r[i]; }); o.venueList = (o.venues || "").split(" ").filter(Boolean); o.de = o.venueList.some(function (v) { return DE_VENUES[v]; }); return o; });
      j.byIsin = {}; j.items.forEach(function (x) { j.byIsin[x.isin] = x; });
      j.register = u ? { attribution: u.attribution, method: u.method, count: u.rows.length } : null;
      if (u) u.rows.forEach(function (r) { var o = {}; u.fields.forEach(function (f, i) { o[f] = r[i]; }); var x = j.byIsin[o.isin]; if (!x) return; o.hosts = (o.hostCountries || "").split(" ").filter(Boolean); x.reg = o; });
      return j;
    });
    return eu;
  };
  function venueNames(list) { var seen = {}, out = []; list.forEach(function (m) { var n = MIC[m]; if (n && !seen[n]) { seen[n] = 1; out.push(n); } }); return out; }

  VS.views.europa = function (r) {
    if (r.args[0] === "vergleich") return compare((r.query.i || "").split(",").map(function (x) { return x.trim().toUpperCase(); }).filter(Boolean).slice(0, 4));
    if (r.args[0]) return detail(r.args[0].toUpperCase());
    var q = r.query || {};
    var st = { q: q.q || "", brand: q.brand || "", dom: q.dom || "", dist: q.dist || "", ccy: q.ccy || "", venue: q.venue || "", de: q.de === "1", reg: q.reg === "1", notifDe: q.notif === "1",
      // Eine ISIN oder ein Registerfilter sucht im ganzen Stamm, nicht nur unter "UCITS im Namen"
      ucits: q.ucits ? q.ucits !== "0" : !(q.q || q.reg === "1" || q.notif === "1"), limit: 50 };
    var root = VS.render('<section class="vs-hero"><p class="vs-eyebrow">ETF Intelligence · Europa</p><h1>Europäische ETFs.<br>Mit ISIN.</h1><p class="vs-lead">Alle ETF-Anteilklassen, die an EU-Handelsplätzen gehandelt werden – aus dem amtlichen Register der EU-Wertpapieraufsicht (ESMA FIRDS) mit Domizil aus dem LEI-Register (GLEIF).</p>' +
      '<div class="vs-note" style="margin-top:14px">Kurse, Kosten und Holdings europäischer Listings sind noch nicht angebunden: Die Emittenten erlauben den automatisierten Abruf nicht, ein europäischer Kursanbieter ist noch nicht verbunden. Wir zeigen deshalb Stammdaten und Handelsplätze – keine Preise.</div>' +
      VS.marketSwitch("eu") + '<form class="vs-search" id="vs-eu-f" role="search" style="margin-top:14px"><span aria-hidden="true">⌕</span><input id="vs-eu-q" value="' + esc(st.q) + '" placeholder="ISIN, Name, Anbieter, Börse oder Land …" aria-label="Europäische ETFs durchsuchen" autocomplete="off"><button type="submit">Suchen</button></form></section>' +
      '<section class="vs-section" id="vs-eu"><div class="vs-loading">Register wird geladen …</div></section>');
    VS.euIndex().then(function (j) {
      var host = root.querySelector("#vs-eu"), input = root.querySelector("#vs-eu-q"), t = null;
      root.querySelector("#vs-eu-f").addEventListener("submit", function (ev) { ev.preventDefault(); st.q = input.value; st.limit = 50; draw(); });
      input.addEventListener("input", function () { clearTimeout(t); t = setTimeout(function () { st.q = input.value; st.limit = 50; draw(); }, 150); });
      var venueOptions = (function () { var c = {}; j.items.forEach(function (x) { venueNames(x.venueList).forEach(function (n) { c[n] = (c[n] || 0) + 1; }); }); return Object.keys(c).sort(function (a, b) { return c[b] - c[a]; }); })();
      function uniq(f) { var s = {}; j.items.forEach(function (x) { if (x[f]) s[x[f]] = (s[x[f]] || 0) + 1; }); return Object.keys(s).sort(function (a, b) { return s[b] - s[a]; }); }
      function sel(k, label, vals, lab) { return '<select data-k="' + k + '" aria-label="' + esc(label) + '"><option value="">' + esc(label) + ': alle</option>' + vals.map(function (v) { return '<option value="' + esc(v) + '"' + (st[k] === v ? " selected" : "") + '>' + esc(lab ? lab(v) : v) + '</option>'; }).join("") + '</select>'; }
      function filtered() {
        var words = st.q.toLowerCase().split(/\s+/).filter(Boolean);
        return j.items.filter(function (x) {
          if (st.ucits && !x.ucitsInName) return false;
          if (st.reg && !(x.reg && x.reg.ucits)) return false;
          if (st.notifDe && !(x.reg && x.reg.hosts.indexOf("DE") >= 0)) return false;
          if (st.brand && x.issuerBrand !== st.brand) return false;
          if (st.dom && x.domicile !== st.dom) return false;
          if (st.dist && x.distribution !== st.dist) return false;
          if (st.ccy && x.currency !== st.ccy) return false;
          if (st.venue && venueNames(x.venueList).indexOf(st.venue) < 0) return false;
          if (st.de && !x.de) return false;
          if (words.length) { var hay = x.hay || (x.hay = (x.isin + " " + x.name + " " + (x.issuerLegalName || "") + " " + (BRAND[x.issuerBrand] || "") + " " + venueNames(x.venueList).join(" ") + " " + x.venueList.join(" ") + " " +
              (x.domicile ? VS.countryName(x.domicile) + " " + x.domicile : "") + " " + (x.reg ? x.reg.fundName + " " + (x.reg.manager || "") : "")).toLowerCase()); if (!words.every(function (w) { return hay.indexOf(w) >= 0; })) return false; }
          return true;
        }).sort(function (a, b) { return (b.isin.toLowerCase() === st.q.toLowerCase()) - (a.isin.toLowerCase() === st.q.toLowerCase()) || b.venueList.length - a.venueList.length || (a.name < b.name ? -1 : 1); });
      }
      function draw() {
        var list = filtered();
        host.innerHTML = '<div class="vs-section-head"><div><h2>' + list.length.toLocaleString("de-DE") + ' Anteilklassen</h2><p class="vs-sub">' + j.rows.length.toLocaleString("de-DE") + ' im Register · Stand ' + F.date(j.asOf) + ' · ' + esc(j.attribution) + '</p></div></div>' +
          '<div class="vs-filters" role="group" aria-label="Filter">' + sel("brand", "Anbieter", uniq("issuerBrand"), function (k) { return BRAND[k] || k; }) + sel("dom", "Domizil", uniq("domicile"), VS.countryName) +
          sel("dist", "Ertragsverwendung", uniq("distribution"), function (k) { return DIST[k] || k; }) + sel("ccy", "Währung", uniq("currency")) + sel("venue", "Handelsplatz", venueOptions) +
          (j.register ? '<label class="vs-check"><input type="checkbox" data-k="reg"' + (st.reg ? " checked" : "") + '> UCITS-Zuordnung über ESMA-Register</label><label class="vs-check"><input type="checkbox" data-k="notifDe"' + (st.notifDe ? " checked" : "") + '> Vertrieb in Deutschland im ESMA-Register gemeldet</label>' : "") +
          '<label class="vs-check"><input type="checkbox" data-k="ucits"' + (st.ucits ? " checked" : "") + '> nur „UCITS“ im amtlichen Namen</label><label class="vs-check"><input type="checkbox" data-k="de"' + (st.de ? " checked" : "") + '> an deutschen Börsen gelistet</label></div>' +
          '<div class="vs-table-wrap"><table class="vs-table"><caption class="vs-sr">Europäische ETF-Anteilklassen</caption><thead><tr><th>Name · ISIN</th><th>Anbieter</th><th>Domizil</th><th>Ertragsverwendung</th><th>Währung</th><th>Handelsplätze</th></tr></thead><tbody>' +
          list.slice(0, st.limit).map(function (x) {
            var v = venueNames(x.venueList);
            return '<tr><td><a href="#/europa/' + esc(x.isin) + '">' + esc(x.name) + '</a><span class="t-name">' + esc(x.isin) + (x.reg ? ' · UCITS-Zuordnung über ESMA-Register' + (x.reg.hosts.indexOf("DE") >= 0 ? " · Vertrieb in Deutschland gemeldet" : "") : "") + '</span></td><td>' + esc(BRAND[x.issuerBrand] || x.issuerLegalName || "–") + '</td><td>' + esc(x.domicile ? VS.countryName(x.domicile) : "–") + '</td><td>' + esc(DIST[x.distribution] || "–") + '</td><td>' + esc(x.currency || "–") + '</td><td>' + x.venueList.length + (v.length ? '<span class="t-name">' + esc(v.slice(0, 3).join(", ")) + (v.length > 3 ? " …" : "") + '</span>' : "") + '</td></tr>';
          }).join("") + '</tbody></table></div>' +
          (list.length > st.limit ? '<div style="text-align:center;margin-top:14px"><button class="vs-pill" id="vs-eu-more">Weitere anzeigen</button></div>' : "") + (list.length ? "" : '<div class="vs-empty">Keine Anteilklasse passt zu diesen Filtern.</div>') +
          '<p class="vs-fine" style="margin-top:12px">Ertragsverwendung laut CFI-Code (vom Emittenten gemeldet). Im Wertpapierregister (FIRDS) ist „UCITS“ kein eigenes Feld – dieser Filter prüft nur den amtlichen Namen. Die „UCITS-Zuordnung über ESMA-Register“ stammt aus dem amtlichen Fondsregister; die Zuordnung zur Anteilklasse erfolgt über den Fondsnamen (GLEIF-Name der Fonds-LEI oder Name der Anteilklasse) und das Domizil (Konfidenz mittel), nicht über die ISIN. Domizil = Rechtsordnung der Fonds-LEI, sonst aus dem ISIN-Präfix abgeleitet.</p>';
        host.querySelectorAll("select[data-k]").forEach(function (s) { s.onchange = function () { st[s.dataset.k] = s.value; st.limit = 50; draw(); }; });
        host.querySelectorAll("input[data-k]").forEach(function (c) { c.onchange = function () { st[c.dataset.k] = c.checked; st.limit = 50; draw(); }; });
        var more = host.querySelector("#vs-eu-more"); if (more) more.onclick = function () { st.limit += 50; draw(); };
      }
      draw();
    }).catch(function () { root.querySelector("#vs-eu").innerHTML = VS.pending("Register nicht erreichbar", "Die europäischen Stammdaten konnten nicht geladen werden."); });
  };

  /* Vergleich europaeischer Anteilklassen: nur Felder, die alle besitzen (Stamm- und Registerdaten) - keine Kennzahlen. */
  function compare(isins) {
    var root = VS.render('<section class="vs-hero"><p class="vs-eyebrow"><a href="#/europa" style="text-decoration:none">ETF Intelligence · Europa</a> · Vergleich</p><h1>Anteilklassen<br>nebeneinander.</h1>' +
      '<p class="vs-lead">Bis zu vier europäische Anteilklassen – nur Stamm- und Registerdaten. Ohne Kurse, Holdings und Kosten gibt es keinen Kennzahlenvergleich.</p>' +
      '<form class="vs-search" id="vs-euc-f"><span aria-hidden="true">+</span><input id="vs-euc-q" placeholder="ISIN hinzufügen" autocomplete="off" aria-label="ISIN hinzufügen"><button type="submit">Hinzufügen</button></form><div class="vs-suggest" id="vs-euc-s"></div><div class="vs-tabs" id="vs-euc-chips"></div></section>' +
      '<section class="vs-section" id="vs-euc"><div class="vs-loading">Register wird geladen …</div></section>');
    VS.euIndex().then(function (j) {
      var xs = isins.map(function (i) { return j.byIsin[i]; }).filter(Boolean), ids = xs.map(function (x) { return x.isin; });
      var href = function (list) { return "#/europa/vergleich?i=" + encodeURIComponent(list.join(",")); };
      root.querySelector("#vs-euc-chips").innerHTML = ids.map(function (i) { return '<a class="vs-pill small primary" href="' + href(ids.filter(function (y) { return y !== i; })) + '" aria-label="' + i + ' entfernen">' + i + ' ×</a>'; }).join("");
      var q = root.querySelector("#vs-euc-q"), box = root.querySelector("#vs-euc-s");
      q.addEventListener("input", function () {
        var w = q.value.toLowerCase().trim(); if (w.length < 3) { box.innerHTML = ""; return; }
        var hits = j.items.filter(function (x) { return (x.isin + " " + x.name).toLowerCase().indexOf(w) >= 0; }).slice(0, 6);
        box.innerHTML = hits.length ? '<ul>' + hits.map(function (x) { return '<li><a href="' + href(ids.concat(x.isin).slice(-4)) + '"><span><b>' + esc(x.isin) + '</b> · ' + esc(x.name) + '</span></a></li>'; }).join("") + '</ul>' : "";
      });
      root.querySelector("#vs-euc-f").addEventListener("submit", function (ev) { ev.preventDefault(); var v = q.value.trim().toUpperCase(); if (j.byIsin[v]) VS.go(href(ids.concat(v).slice(-4))); });
      var host = root.querySelector("#vs-euc");
      if (xs.length < 2) { host.innerHTML = VS.pending("Mindestens zwei Anteilklassen", "Füge oben eine weitere ISIN hinzu."); return; }
      var ROWS = [["Anbieter", function (x) { return BRAND[x.issuerBrand] || x.issuerLegalName || "–"; }], ["Domizil", function (x) { return x.domicile ? VS.countryName(x.domicile) : "–"; }],
        ["Ertragsverwendung (CFI)", function (x) { return DIST[x.distribution] || "–"; }], ["Fondswährung", function (x) { return x.currency || "–"; }],
        ["Handelsplätze", function (x) { return String(x.venueList.length); }], ["An deutschen Börsen", function (x) { return x.de ? "ja" : "nein"; }],
        ["Erster Handelstag", function (x) { return F.date(x.firstTrade); }],
        ["UCITS", function (x) { return x.reg ? "ESMA-Register (Konfidenz mittel)" : x.ucitsInName ? "laut Name" : "nicht belegt"; }],
        ["Vertrieb in Deutschland", function (x) { return !x.reg ? "kein Registertreffer" : x.reg.hosts.indexOf("DE") >= 0 ? "gemeldet" : x.reg.homeState === "DE" ? "Herkunftsstaat Deutschland" : "keine Angabe im Register"; }],
        ["Verwaltungsgesellschaft", function (x) { return x.reg ? x.reg.manager || "–" : "–"; }]];
      host.innerHTML = '<div class="vs-table-wrap"><table class="vs-table"><caption class="vs-sr">Vergleich europäischer Anteilklassen</caption><thead><tr><th>Merkmal</th>' + xs.map(function (x) { return '<th><a href="#/europa/' + esc(x.isin) + '">' + esc(x.isin) + '</a><span class="t-name">' + esc(x.name) + '</span></th>'; }).join("") + '</tr></thead><tbody>' +
        ROWS.map(function (rw) { var v = xs.map(rw[1]), same = v.every(function (y) { return y === v[0]; }); return '<tr><td>' + esc(rw[0]) + '</td>' + v.map(function (y) { return '<td style="text-align:left' + (same ? "" : ";font-weight:750") + '">' + esc(y) + '</td>'; }).join("") + '</tr>'; }).join("") +
        '</tbody></table></div><p class="vs-fine" style="margin-top:10px">Fett: Merkmale, in denen sich die Anteilklassen unterscheiden. Kurse, Rendite, Risiko, Holdings und Kosten sind für europäische Anteilklassen nicht angebunden und werden deshalb nicht verglichen. „Keine Angabe im Register“ heißt nicht, dass der Fonds in Deutschland nicht vertrieben wird – ältere Vertriebsnotifizierungen fehlen im ESMA-Register teils. ' + esc(j.attribution) + '</p>';
    }).catch(function () { root.querySelector("#vs-euc").innerHTML = VS.pending("Register nicht erreichbar", "Die europäischen Stammdaten konnten nicht geladen werden."); });
  }

  function detail(isin) {
    var root = VS.render('<section class="vs-section"><div class="vs-loading">' + esc(isin) + ' wird geladen …</div></section>');
    VS.euIndex().then(function (j) {
      var x = j.byIsin[isin];
      if (!x) { VS.render('<section class="vs-hero"><p class="vs-eyebrow">ETF Intelligence · Europa</p><h1>' + esc(isin) + ' nicht im Register.</h1><p class="vs-lead">Diese ISIN steht nicht in der aktuellen ESMA-FIRDS-Vollversion für ETFs (Stand ' + F.date(j.asOf) + ').</p><div class="vs-tabs"><a class="vs-pill primary" href="#/europa">Europäische ETFs</a></div></section>'); return; }
      var venues = x.venueList.map(function (m) { return [m, MIC[m] || null]; });
      var named = venues.filter(function (v) { return v[1]; }), other = venues.filter(function (v) { return !v[1]; });
      root.innerHTML = '<section class="vs-hero"><p class="vs-eyebrow"><a href="#/europa" style="text-decoration:none">ETF Intelligence · Europa</a></p><h1 style="font-size:clamp(26px,4.6vw,48px)">' + esc(x.name) + '</h1>' +
        '<p class="vs-sub" style="margin-top:8px"><b style="color:var(--ink)">' + esc(x.isin) + '</b> · ' + esc(BRAND[x.issuerBrand] || x.issuerLegalName || "Anbieter unbekannt") + ' · ' + esc(x.currency || "") + '</p>' +
        '<div style="margin-top:10px">' + (x.reg ? '<span class="vs-badge" title="Registerangabe amtlich; Zuordnung zur Anteilklasse über Fondsname (GLEIF/Anteilklasse) und Domizil">UCITS-Zuordnung über ESMA-Register · Konfidenz mittel</span> ' : x.ucitsInName ? '<span class="vs-badge">UCITS im amtlichen Namen</span> ' : "") + (x.reg && x.reg.hosts.indexOf("DE") >= 0 ? '<span class="vs-badge ok">Vertrieb in Deutschland gemeldet (ESMA)</span> ' : "") + (x.de ? '<span class="vs-badge ok">an deutschen Börsen gelistet</span>' : "") + '</div><div class="vs-tabs"><a class="vs-pill" href="#/europa/vergleich?i=' + esc(x.isin) + '">Vergleichen</a><a class="vs-pill" href="#/europa">Alle europäischen ETFs</a></div></section>' +
        '<section class="vs-section"><p class="vs-label">Verfügbare Informationen</p><div class="vs-quick" style="margin-top:8px">' + [["ISIN", esc(x.isin)], ["Domizil", esc(x.domicile ? VS.countryName(x.domicile) : "unbekannt")], ["Ertragsverwendung", esc(DIST[x.distribution] || "unbekannt")], ["Fondswährung", esc(x.currency || "–")],
          ["Handelsplätze", String(x.venueList.length)], ["Erster Handelstag", F.date(x.firstTrade)], ["UCITS", x.reg ? "Register (Konfidenz mittel)" : x.ucitsInName ? "laut Name" : "nicht belegt"], ["Vertrieb Deutschland", !x.reg ? "kein Registertreffer" : x.reg.hosts.indexOf("DE") >= 0 ? "gemeldet" : x.reg.homeState === "DE" ? "Herkunftsstaat Deutschland" : "keine Angabe im Register"]]
          .map(function (c) { return '<div><span>' + c[0] + '</span><b>' + c[1] + '</b></div>'; }).join("") + '</div></section>' +
        '<section class="vs-section"><div class="vs-grid g2"><div class="vs-card"><p class="vs-label">Börsen</p>' + (named.length ? named.map(function (v) { return '<div class="vs-row"><span>' + esc(v[1]) + '</span><span class="vs-fine">' + esc(v[0]) + '</span></div>'; }).join("") : '<p class="vs-fine">Keine Börse aus der bekannten Liste.</p>') +
        (other.length ? '<p class="vs-fine" style="margin-top:8px">Weitere Handelsplätze (MTF, Systematische Internalisierer): ' + esc(other.map(function (v) { return v[0]; }).join(", ")) + '</p>' : "") + '</div>' +
        '<div class="vs-card"><p class="vs-label">Stammdaten & Herkunft</p>' +
        '<div class="vs-row"><span>Rechtlicher Emittent</span><span style="text-align:right">' + esc(x.issuerLegalName || "–") + '</span></div><div class="vs-row"><span>LEI</span><span>' + esc(x.issuerLei || "–") + '</span></div>' +
        '<div class="vs-row"><span>CFI-Code</span><span>' + esc(x.cfi) + '</span></div><div class="vs-row"><span>Domizil</span><span>' + esc(x.domicile || "–") + ' <span class="vs-fine">' + (x.domicileBasis === "ISIN_PREFIX" ? "aus dem ISIN-Präfix abgeleitet" : "GLEIF") + '</span></span></div>' +
        '<p class="vs-fine" style="margin-top:8px">' + esc(j.attribution) + ' Stand ' + F.date(j.asOf) + '. Ertragsverwendung laut CFI (Emittentenangabe).</p></div></div></section>' +
        (x.reg ? '<section class="vs-section"><div class="vs-card"><p class="vs-label">Fonds im ESMA-Register (grenzüberschreitender Vertrieb)</p>' +
          [["Rechtsrahmen", "UCITS"], ["Fonds", x.reg.fundName], ["Verwaltungsgesellschaft", x.reg.manager], ["Herkunftsstaat", x.reg.homeState ? VS.countryName(x.reg.homeState) : "–"], ["Aufsicht (Land)", x.reg.authority && /^[A-Z]{2}$/.test(x.reg.authority) ? VS.countryName(x.reg.authority) : x.reg.authority], ["Status", x.reg.status === "Active" ? "aktiv" : x.reg.status],
            // Nur positive Aussagen: das Register enthaelt aeltere Notifizierungen nicht vollstaendig
            ["Vertriebsnotifizierungen im Register", x.reg.hosts.length ? x.reg.hosts.length + " Länder" + (x.reg.hosts.indexOf("DE") >= 0 ? ", darunter Deutschland" : x.reg.homeState === "DE" ? " (Deutschland ist Herkunftsstaat)" : " – zu Deutschland keine Angabe im Register") : "keine gemeldet"], ["Registerstand", F.date(x.reg.registerUpdated)]]
            .map(function (c) { return '<div class="vs-row"><span>' + esc(c[0]) + '</span><span style="text-align:right">' + esc(c[1] || "–") + '</span></div>'; }).join("") +
          '<p class="vs-fine" style="margin-top:8px">' + esc(j.register.attribution) + ' Zuordnung über den Fondsnamen – den rechtlichen Namen der Fonds-LEI (GLEIF) oder den Namen der Anteilklasse – und das Domizil (Konfidenz mittel); das Register führt keine ISIN. Ältere Vertriebsnotifizierungen sind im Register nicht vollständig enthalten; dass ein Land fehlt, heißt nicht, dass der Fonds dort nicht vertrieben wird.</p></div></section>'
          : '<section class="vs-section"><div class="vs-card"><p class="vs-label">ESMA-Fondsregister</p><p class="vs-sub">Kein eindeutiger Treffer im Register der Fonds im grenzüberschreitenden Vertrieb. UCITS-Status deshalb nur als Hinweis aus dem amtlichen Namen.</p></div></section>') +
        '<section class="vs-section"><div class="vs-card soft"><p class="vs-label">Noch nicht verfügbar</p><div class="vs-chips" style="margin-top:8px">' +
          ["Kursanalyse & Performance", "Risiko", "Holdings & ETF X-Ray", "Kosten (TER / laufende Kosten)", "Fondsvolumen", "Replikation", "NAV", "Portfolio-Durchleuchtung"].map(function (t) { return '<span class="vs-badge">' + t + '</span>'; }).join("") +
          '</div><p class="vs-sub" style="margin-top:10px">Für europäische Anteilklassen ist dafür noch keine frei nutzbare Quelle angebunden. Wir zeigen nur, was amtlich belegt ist – nichts davon wird geschätzt.</p>' +
          '<div class="vs-tabs" style="margin-top:12px"><button class="vs-pill" id="vs-eu-watch"></button><a class="vs-pill" href="#/portfolio?add=' + encodeURIComponent(x.isin) + '">Zum Portfolio</a><a class="vs-pill" href="#/europa/vergleich?i=' + encodeURIComponent(x.isin) + '">Vergleichen</a></div></div></section>' +
        '<p class="vs-disclaimer">' + esc(VS.DISCLAIMER) + '</p>';
      // Beobachten: ISIN in der Watchlist (Anzeige dort mit Stammdaten, ohne Kurse)
      var wb = root.querySelector("#vs-eu-watch");
      function wl() { var on = VS.state.watchlist.indexOf(x.isin) >= 0; wb.textContent = on ? "♥ Beobachtet" : "♡ Beobachten"; wb.classList.toggle("primary", on); }
      wb.onclick = function () { var i = VS.state.watchlist.indexOf(x.isin); if (i >= 0) VS.state.watchlist.splice(i, 1); else VS.state.watchlist.push(x.isin); VS.save(); wl(); };
      wl();
    });
  }
})(window);
