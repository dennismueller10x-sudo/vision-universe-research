/* =========================================================================
   VISION UNIVERSE® VORSORGE — ui/start.js
   V10 · Der 10-Euro-Sparplan (Redesign 2027): sechs Schritte, ein Gedanke
   pro Bildschirm, ohne Kopf und Produkt-Leiste. Jede Rechnung ist als
   Beispiel markiert und nennt ihre Annahmen; gerechnet wird mit der
   Planer-Engine (vorsorge-math.js) und den Foerderregeln (funding.js).
   Der Plan bleibt in diesem Browser (VS.state.sparplan) und erscheint im
   Planer und unter „Bin ich auf Kurs?“. Keine Konto-Freischaltung.
   ========================================================================= */
(function (global) {
  "use strict";
  var VS = global.VS, V = global.VUVorsorge, M = V.Math, F = VS.fmt, esc = VS.esc;
  var AMOUNTS = [10, 25, 50, 100];
  var YEARS = 30, RET = [0.03, 0.05, 0.07];
  var TITLES = ["Der 10-Euro-Sparplan", "Was daraus werden kann", "Was ist ein ETF?", "Ein passender ETF", "Frei oder gefördert?", "Fertig"];

  function plan() {
    var s = VS.state.sparplan || {};
    return { amount: s.amount > 0 ? s.amount : 10, form: s.form || "avd", index: s.index || "MSCI World", saved: s.saved || null };
  }
  function keep(p) { VS.state.sparplan = p; VS.save(); }

  /** Beispiel: monatliche Rate ueber `years` Jahre, Rendite r vor Kosten (Planer-Formel, monatlich verzinst). */
  function fv(amount, years, r) { return M.futureValue({ monthly: amount, years: years, annualReturn: r, annualCost: 0 }).nominal; }
  function round100(v) { return Math.round(v / 100) * 100; }

  /** UCITS-Anteilklassen auf einen Index aus dem ESMA-Register (FIRDS): Beispiele, keine Empfehlung. */
  var NOT_PLAIN = /ESG|SRI|SCREEN|CLIMATE|PAB|CTB|PARIS|SWAP|HEDG|HDG|\bH(EUR|USD|GBP|CHF)\b|EUR H|QUALITY|VALUE|MOMENTUM|MIN(IMUM)? VOL|SMALL|MID|EQUAL|DIVIDEND|EX[ -]|SELECT|ISLAMIC|INFORMATION|ENERGY|FINANC|HEALTH|INDUSTR|CONSUMER|UTILIT|MATERIAL|COMMUNICATION|REAL ESTATE|ENHANCED|FACTOR|GROWTH|LEADER|CATHOLIC|COVERED|BUYBACK|UNIVERSAL|SUSTAIN|PEA|DAILY|LEVERAGED|SHORT|IMI/i;
  VS.ucitsExamples = function (index, n) {
    if (!VS.euIndex || !index) return Promise.resolve([]);
    var re = new RegExp("\\b" + String(index).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i");
    return VS.euIndex().then(function (j) {
      return j.items.filter(function (x) { return x.active && x.ucitsInName && re.test(x.name || "") && !NOT_PLAIN.test(x.name || ""); })
        .sort(function (a, b) { return (b.de ? 1 : 0) - (a.de ? 1 : 0) || String(a.firstTrade || "9").localeCompare(String(b.firstTrade || "9")); })
        .filter(function (x, i, a) { return a.map(function (y) { return y.isin; }).indexOf(x.isin) === i; })
        .slice(0, n || 4);
    }).catch(function () { return []; });
  };

  function head(k) {
    var U = VS.U;
    var back = k === 1 ? '<a class="vu-round" href="#/" aria-label="Schließen">' + U.glyph("x", 17) + '</a>' : '<a class="vu-round" href="#/start/' + (k - 1) + '" aria-label="Zurück">' + U.glyph("back", 17) + '</a>';
    return '<div class="vs-flowhead">' + back + '<div class="vs-steps" role="progressbar" aria-label="Fortschritt" aria-valuemin="1" aria-valuemax="6" aria-valuenow="' + k + '">' +
      [1, 2, 3, 4, 5, 6].map(function (i) { return '<i class="' + (i <= k ? "on" : "") + (i === k ? " cur" : "") + '"></i>'; }).join("") + '</div><span class="vu-xs vu-mu"><b>' + k + ' / 6</b></span></div>' +
      '<p class="vu-ltag">' + esc(TITLES[k - 1]) + '</p>';
  }
  function cta(href, label, second) {
    return '<div class="vs-flowcta"><a class="vu-btn vu-btn--block" href="' + href + '">' + esc(label) + '</a>' + (second || "") + '</div>';
  }
  function page(k, body, foot) {
    var root = VS.root();
    root.innerHTML = '<section class="vs-flowp" aria-labelledby="vs-flow-t">' + head(k) + body + foot + '</section>' +
      '<p class="vs-fine" style="margin-top:14px">' + esc(VS.DISCLAIMER) + '</p>';
    return root;
  }

  VS.views.start = function (r) {
    var k = Math.max(1, Math.min(6, parseInt(r.args[0], 10) || 1));
    var p = plan(), U = VS.U;
    if (k === 1) {
      var custom = AMOUNTS.indexOf(p.amount) < 0;
      var root = page(1, '<h1 class="vu-lt" id="vs-flow-t">Wie viel möchtest du im Monat sparen?</h1>' +
        '<div class="vs-amount"><b class="num" id="vs-amt">' + F.eur(p.amount).replace(" ", "&nbsp;") + '</b><span class="vu-sm vu-mu"><b>im Monat</b></span>' +
        '<input id="vs-amt-in" type="number" inputmode="decimal" min="1" max="5000" step="1" value="' + p.amount + '" aria-label="Eigener Betrag in Euro"' + (custom ? "" : " hidden") + '></div>' +
        '<div class="vs-amounts" role="group" aria-label="Betrag wählen">' + AMOUNTS.map(function (a) { return '<button type="button" class="vu-chip" data-a="' + a + '" aria-pressed="' + (!custom && a === p.amount) + '">' + a + ' €</button>'; }).join("") +
        '<button type="button" class="vu-chip" data-a="eigen" aria-pressed="' + custom + '">Eigener</button></div>' +
        '<div class="vu-box" style="margin-top:16px">' + VS.help("Kleiner Betrag, großer Schritt: Wichtig ist, dass du anfängst. Erhöhen geht jederzeit.") + '</div>' +
        '<div class="vu-box vu-box--ink vs-row-sb" style="margin-top:10px;flex-wrap:nowrap" id="vs-zul"><span class="vu-sm">Förderregeln werden geladen …</span></div>',
        cta("#/start/2", "Weiter"));
      var set = function (a) { p.amount = a; keep(p); root.querySelector("#vs-amt").innerHTML = F.eur(a).replace(" ", "&nbsp;"); zul(); };
      root.querySelectorAll("[data-a]").forEach(function (b) {
        b.onclick = function () {
          root.querySelectorAll("[data-a]").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
          var inp = root.querySelector("#vs-amt-in");
          if (b.dataset.a === "eigen") { inp.hidden = false; inp.focus(); return; }
          inp.hidden = true; inp.value = b.dataset.a; set(Number(b.dataset.a));
        };
      });
      root.querySelector("#vs-amt-in").addEventListener("input", function () { var v = Math.round(Number(this.value)); if (v > 0 && v <= 5000) set(v); });
      var zul = function () {
        VS.rules().then(function (rules) {
          var avd = rules.filter(function (x) { return x.ruleId === "DE-ALTERSVORSORGEDEPOT"; })[0]; if (!avd) return;
          var min = avd.contributionRules.minimumAnnualOwnContribution, z = V.Funding.altersvorsorgedepot(avd, { ownContribution: p.amount * 12 });
          root.querySelector("#vs-zul").innerHTML = z.eligible
            ? '<span class="vs-big num" style="font-size:26px;margin:0;color:var(--accent);white-space:nowrap">+' + F.eur(z.basicAllowance).replace(" ", "&nbsp;") + '</span><span class="vu-sm">Ab 2027 legt der Staat im Jahr dazu (Grundzulage im Altersvorsorgedepot). ' + (p.amount * 12 === min ? F.eur(min / 12) + " im Monat sind genau der Mindestbeitrag." : "Mindestbeitrag: " + F.eur(min) + " im Jahr.") + '</span>'
            : '<span class="vu-sm">Für die Zulage im Altersvorsorgedepot braucht es mindestens ' + F.eur(min) + ' im Jahr (' + F.eur(min / 12) + ' im Monat).</span>';
        }).catch(function () { root.querySelector("#vs-zul").innerHTML = '<span class="vu-sm">Die Förderregeln sind gerade nicht erreichbar.</span>'; });
      };
      zul();
      return;
    }
    if (k === 2) {
      var vals = RET.map(function (x) { return fv(p.amount, YEARS, x); });
      var root2 = page(2, '<div class="vs-row-sb" style="margin-top:6px"><h1 class="vu-mt" id="vs-flow-t">' + F.eur(p.amount) + ' im Monat, ' + YEARS + ' Jahre</h1>' + VS.bsp("Beispiel") + '</div>' +
        '<div id="vs-ten" style="margin-top:12px"></div>' +
        '<div class="vu-grid" style="margin-top:10px">' + VS.tile("Du zahlst ein", F.eur(p.amount * 12 * YEARS), YEARS + " × " + F.eur(p.amount * 12)) + VS.tile("Bei 5 % pro Jahr", "≈ " + F.eur(round100(vals[1])), "Linie im Chart") + '</div>' +
        '<div class="vs-kv" style="border-top:1px solid var(--line);margin-top:6px"><span class="vu-sm"><b>Spanne bei 3–7 % (gestrichelt)</b></span><b class="num">' + F.eur(round100(vals[0])).replace(" €", "") + '–' + F.eur(round100(vals[2])) + '</b></div>' +
        '<div class="vu-box vu-box--ink" style="margin-top:10px"><span class="vu-sm"><b style="color:var(--accent)">Keine Prognose.</b> Gerechnet vor Kosten, Steuern und Inflation. Es kann auch weniger werden, zwischendurch auch Verlust.</span></div>' +
        '<details class="vu-more" style="margin-top:10px"><summary>So ist gerechnet</summary><div class="vu-more-body">Rechenbeispiel mit Annahme: ' + F.eur(p.amount) + ' am Ende jedes Monats, ' + YEARS + ' Jahre, gleichbleibend 3 %, 5 % oder 7 % pro Jahr vor Kosten, monatlich verzinst (Planer-Formel: V(t+1) = V(t) · (1 + r) + Rate). Keine Kosten, Steuern, Inflation oder Zulagen eingerechnet.</div></details>',
        cta("#/start/3", "Verstanden, weiter"));
      var pts = function (x) { var a = []; for (var y = 0; y <= YEARS; y++) a.push([y, fv(p.amount, y, x)]); return a; };
      VS.lineChart(root2.querySelector("#vs-ten"), [{ label: "5 % pro Jahr", points: pts(0.05) }, { label: "3 %", points: pts(0.03) }, { label: "7 %", points: pts(0.07) }],
        { height: 170, padL: 58, label: "Beispiel: Vermögen nach Jahren bei 3, 5 und 7 % pro Jahr", zero: true, fmtY: function (v) { return F.eurK(v); }, fmtX: function (v) { return v === 0 ? "heute" : "in " + Math.round(v) + " J."; }, fmtTipX: function (v) { return "nach " + Math.round(v) + " Jahren"; } });
      return;
    }
    if (k === 3) {
      var root3 = page(3, '<h1 class="vu-lt" id="vs-flow-t">Ein Korb mit vielen Firmen.</h1>' +
        '<p style="margin-top:10px;font-size:16.5px;font-weight:600;line-height:1.4">Mit jeder Rate kaufst du ein kleines Stück von allen. Geht es einer Firma schlecht, tragen die anderen.</p>' +
        '<div class="vu-box" style="margin-top:14px"><div class="vs-dots" aria-hidden="true">' + Array.apply(null, { length: 60 }).map(function (_, i) { return '<i class="' + (i === 0 ? "me" : i % 7 === 3 ? "e" : "") + '"></i>'; }).join("") + '</div>' +
        '<p class="vu-xs vu-mu" style="margin-top:8px"><b id="vs-dots-t">Jeder Punkt: eine Firma.</b></p></div><div id="vs-three"></div>',
        cta("#/start/4", "Weiter"));
      VS.masterFor(["URTH"]).then(function (m) {
        var e = m.find("URTH");
        if (e && e.positions) root3.querySelector("#vs-dots-t").textContent = "Jeder Punkt: eine Firma. Im MSCI World (URTH) sind es " + Number(e.positions).toLocaleString("de-DE") + ".";
        var cost = e && e.cost !== null ? e.cost : null;
        root3.querySelector("#vs-three").innerHTML = [["Breit gestreut", "Hunderte Firmen statt einer"],
          ["Günstig", cost !== null ? VS.costPct(cost) + " Kosten: bei " + F.eur(p.amount * 12) + " im Jahr rund " + (p.amount * 12 * cost).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " € im Jahr" : "Laufende Kosten meist unter 0,5 % im Jahr"],
          ["Flexibel", "Pausieren und verkaufen geht jederzeit"]].map(function (x) { return '<div class="vs-check3"><span>' + U.glyph("check", 15) + '</span><span><b>' + esc(x[0]) + '</b><small>' + esc(x[1]) + '</small></span></div>'; }).join("");
      }).catch(function () { root3.querySelector("#vs-three").innerHTML = ""; });
      return;
    }
    if (k === 4) {
      var root4 = page(4, '<h1 class="vu-mt" style="margin-top:6px" id="vs-flow-t">Für den Anfang: die ganze Welt in einem ETF.</h1>' +
        '<div class="vu-box" style="margin-top:12px"><div style="display:flex;align-items:center;gap:10px">' + VS.logo("MSCI") + '<div style="flex:1"><b>MSCI World</b><div class="vu-xs vu-mu" id="vs-w-sub">Index der Industrieländer</div></div>' + VS.verdict("strong", "Breit") + '</div>' +
        '<div id="vs-w-chart" style="margin-top:10px"></div><div id="vs-w-kv"></div></div>' +
        VS.help("Vergangene Kurse sind kein Versprechen. Der Chart zeigt nur, wie es bisher lief, am Kurs von URTH (US-Listing, Marktabbild).") +
        '<div class="vu-box vu-box--line" style="margin-top:10px"><span class="vu-sm">Andere Wege: <a href="#/etf/ACWI"><b>Welt inkl. Schwellenländer</b></a> oder <a href="#/portfolio"><b>mit Anleihen ruhiger</b></a>.</span></div>',
        cta("#/start/5", "Diesen Index nehmen", '<a class="vu-btn vu-btn--line vu-btn--block" href="#/etfs">Andere ansehen</a>'));
      p.index = "MSCI World"; keep(p);
      VS.masterFor(["URTH"]).then(function (m) {
        var e = m.find("URTH"); if (!e) return;
        root4.querySelector("#vs-w-sub").textContent = (e.positions ? Number(e.positions).toLocaleString("de-DE") + " Firmen · " : "") + "seit " + String(e.from || "").slice(0, 4) + " als " + e.symbol;
        root4.querySelector("#vs-w-kv").innerHTML = '<div style="margin-top:6px">' + [["Kosten pro Jahr", e.cost !== null ? VS.costPct(e.cost) : "k. A."], ["Schwankung pro Jahr", e.m ? F.pct(e.m.vol, 0) : "–"], ["Tiefster Fall seit " + String(e.from || "").slice(0, 4), e.m ? F.spct(e.m.mdd, 1) : "–"]].map(function (x) {
          return '<div class="vs-kv"><span class="vu-sm"><b>' + esc(x[0]) + '</b></span><b class="num">' + esc(x[1]) + '</b></div>'; }).join("") + '</div>';
      });
      VS.weekly("URTH").then(function (w) {
        var host = root4.querySelector("#vs-w-chart");
        if (!w || w.length < 3 || !global.VUChart) { host.innerHTML = ""; return; }
        global.VUChart.mount(host, { currency: "USD", label: "URTH seit Auflage", height: 110, bleed: false, ranges: [{ id: "Max", label: "Max", points: w }] });
      });
      return;
    }
    if (k === 5) {
      var root5 = page(5, '<h1 class="vu-mt" style="margin-top:6px" id="vs-flow-t">Ab 2027 legt der Staat im Jahr etwas dazu.</h1><p class="vu-sm vu-mu" style="margin-top:6px" id="vs-f-lead"></p>' +
        '<div class="vu-stack" style="margin-top:14px" id="vs-f-ch"></div><div id="vs-f-help"></div>',
        cta("#/start/6", "Weiter"));
      VS.rules().then(function (rules) {
        var avd = rules.filter(function (x) { return x.ruleId === "DE-ALTERSVORSORGEDEPOT"; })[0];
        var z = V.Funding.altersvorsorgedepot(avd, { ownContribution: p.amount * 12 }), min = avd.contributionRules.minimumAnnualOwnContribution, age = avd.payoutRules.earliestAge;
        root5.querySelector("#vs-flow-t").textContent = z.eligible ? "Ab 2027 legt der Staat " + F.eur(z.basicAllowance) + " im Jahr dazu." : "Gefördert wird ab " + F.eur(min) + " im Jahr.";
        root5.querySelector("#vs-f-lead").textContent = F.eur(min / 12) + " im Monat sind der Mindestbeitrag fürs geförderte Altersvorsorgedepot.";
        function draw() {
          var on = p.form === "avd";
          root5.querySelector("#vs-f-ch").innerHTML =
            '<button type="button" class="vu-box vs-choice" data-f="frei" aria-pressed="' + !on + '"><span class="vs-row-sb"><b>Freier Sparplan</b><span class="vs-radio">' + (!on ? U.glyph("check", 14) : "") + '</span></span><span class="vu-sm" style="display:block;opacity:.7;margin-top:4px">Geht bei fast jeder Bank. Jederzeit verfügbar.</span>' +
            '<span class="vs-kv"><span class="vu-sm">Zulage</span><b>keine</b></span><span class="vs-kv"><span class="vu-sm">Geld verfügbar</span><b>jederzeit</b></span></button>' +
            '<button type="button" class="vu-box vs-choice" data-f="avd" aria-pressed="' + on + '"><span class="vs-row-sb"><b>Altersvorsorgedepot</b><span class="vs-radio">' + (on ? U.glyph("check", 14) : "") + '</span></span><span class="vu-sm" style="display:block;opacity:.7;margin-top:4px">Gefördert ab ' + F.date(avd.validFrom) + ', mit eigenem Vertrag.</span>' +
            '<span class="vs-kv"><span class="vu-sm">Zulage</span><b' + (on ? ' style="color:var(--accent)"' : "") + '>' + (z.eligible ? "+" + F.eur(z.basicAllowance) + " / Jahr" : "keine (unter " + F.eur(min) + ")") + '</b></span><span class="vs-kv"><span class="vu-sm">Geld verfügbar</span><b>ab ' + age + '</b></span></button>';
          root5.querySelectorAll("[data-f]").forEach(function (b) { b.onclick = function () { p.form = b.dataset.f; keep(p); draw(); }; });
        }
        draw();
        root5.querySelector("#vs-f-help").innerHTML = VS.help(z.eligible ? "In " + YEARS + " Jahren wären das " + F.eur(z.basicAllowance * YEARS) + " vom Staat (Regeln wie heute angenommen). Dafür bleibt das Geld bis zur Rente gebunden." : "Unter dem Mindestbeitrag gibt es keine Zulage. Ein freier Sparplan geht trotzdem.");
      }).catch(function () { root5.querySelector("#vs-f-ch").innerHTML = VS.U.blank("Die Förderregeln konnten nicht geladen werden."); });
      return;
    }
    /* 6: Plan steht */
    if (!p.saved) { p.saved = new Date().toISOString().slice(0, 10); keep(p); }
    var steps = [["Depot öffnen", p.form === "avd" ? "Altersvorsorgedepot (ab 2027) oder dein bestehendes Depot" : "oder dein bestehendes nehmen"], ["ETF suchen", "UCITS-ETF auf den „" + p.index + "“"], ["Sparplan anlegen", F.eur(p.amount) + ", Tag im Monat wählen"]];
    var root6 = page(6, '<div class="vs-done">' + U.glyph("check", 34) + '</div><h1 class="vu-lt" id="vs-flow-t" style="text-align:center;margin-top:10px">Dein Plan steht.</h1>' +
      '<div class="vu-box vs-kvbox" style="margin-top:14px">' + [["Sparrate", F.eur(p.amount) + " im Monat"], ["Index", p.index], ["Form", p.form === "avd" ? "Altersvorsorgedepot" : "Freier Sparplan"], ["Gespeichert", "in diesem Browser"]].map(function (x) {
        return '<div class="vs-kv"><span class="vu-sm"><b>' + esc(x[0]) + '</b></span><span class="vu-sm">' + esc(x[1]) + '</span></div>'; }).join("") + '</div>' +
      '<p class="vu-ltag" style="margin-top:14px">Nächster Schritt bei deiner Bank</p><div class="vs-banklist">' + steps.map(function (s, i) { return '<div class="vs-bankstep"><span>' + (i + 1) + '</span><span><b>' + esc(s[0]) + '</b><small>' + esc(s[1]) + '</small></span></div>'; }).join("") + '</div>' +
      '<div id="vs-isin"></div><p class="vu-xs vu-mu" style="margin-top:6px">Wir verkaufen nichts und bekommen keine Provision.</p>',
      cta("#/monitor", "Zu meinem Plan", '<button type="button" class="vu-btn vu-btn--line vu-btn--block" id="vs-share">Checkliste teilen</button>'));
    VS.ucitsExamples(p.index, 4).then(function (list) {
      if (!list.length) return;
      root6.querySelector("#vs-isin").innerHTML = '<details class="vu-more"><summary>Beispiele aus dem ESMA-Register</summary><div class="vu-more-body"><p class="vu-sm">UCITS-Anteilklassen mit „' + esc(p.index) + '“ im amtlichen Namen. Keine Empfehlung, keine Auswahl nach Qualität.</p><p class="vs-mono" style="margin-top:6px">' +
        list.map(function (x) { return '<a href="#/europa/' + esc(x.isin) + '">' + esc(x.isin) + '</a> · ' + esc(x.issuerBrand || ""); }).join("<br>") + '</p></div></details>';
    });
    root6.querySelector("#vs-share").onclick = function () {
      var text = "Mein Sparplan: " + F.eur(p.amount) + " im Monat auf den " + p.index + ".\n" + steps.map(function (s, i) { return (i + 1) + ". " + s[0] + " – " + s[1]; }).join("\n");
      var btn = this;
      if (global.navigator && navigator.share) navigator.share({ title: "Mein 10-Euro-Sparplan", text: text }).catch(function () {});
      else if (global.navigator && navigator.clipboard) navigator.clipboard.writeText(text).then(function () { btn.textContent = "Kopiert"; }, function () {});
    };
  };
})(window);
