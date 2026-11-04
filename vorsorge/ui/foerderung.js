/* =========================================================================
   VISION UNIVERSE® VORSORGE — ui/foerderung.js
   Foerderrechner (Regelwerk), Fruehstart/Kinder, Riester-Analyse,
   Anbieter-Vergleich, Vergleichen-Hub, Wissen, Datenqualitaet.
   ========================================================================= */
(function (global) {
  "use strict";
  var VS = global.VS, V = global.VUVorsorge, Fd = V.Funding, M = V.Math, F = VS.fmt, esc = VS.esc;

  function ruleBox(rule) {
    var st = { GESETZ_VERKUENDET: "Gesetz verkündet", BUNDESTAG_BESCHLUSS: "Bundestagsbeschluss", GELTENDES_RECHT: "Geltendes Recht", GESETZENTWURF: "Gesetzentwurf – noch nicht beschlossen", ANGEKUENDIGT: "Angekündigt" }[rule.legalStatus] || rule.legalStatus;
    var v = rule.verification || {};
    return '<div class="vs-card soft"><p class="vs-label">Regelstand & Quelle</p><div class="vs-row"><span>Regel</span><span>' + esc(rule.ruleId) + ' · Version ' + esc(rule.ruleVersion) + '</span></div>' +
      '<div class="vs-row"><span>Gültig</span><span>ab ' + F.date(rule.validFrom) + (rule.validUntil ? " bis " + F.date(rule.validUntil) : "") + '</span></div>' +
      '<div class="vs-row"><span>Rechtsstand</span><span>' + esc(st) + '</span></div>' +
      '<div class="vs-row"><span>Primärquelle geprüft</span><span>' + (v.primaryVerified ? '<span class="vs-badge ok">ja, am ' + F.date(v.verifiedAt) + '</span>' : '<span class="vs-badge complex">nein</span>') + '</span></div>' +
      (rule.primarySource ? '<div class="vs-row"><span>Primärquelle</span><span style="text-align:right"><a href="' + esc(rule.primarySource.url) + '" target="_blank" rel="noopener">' + esc(rule.primarySource.title) + '</a></span></div>' : "") +
      '<div class="vs-row"><span>Prüfsumme</span><span class="vs-fine">' + esc(rule.ruleHash || "–") + '</span></div>' +
      (v.fields ? '<details style="margin-top:8px"><summary class="vs-fine" style="cursor:pointer">Fundstellen je Wert anzeigen</summary>' + Object.keys(v.fields).map(function (k) { return '<p class="vs-fine" style="margin-top:6px"><b>' + esc(k) + ':</b> ' + esc(v.fields[k]) + '</p>'; }).join("") + '</details>' : "") +
      '<p class="vs-fine" style="margin-top:8px">Weitere Quellen: ' + (rule.sources || rule.ruleSource || []).map(function (x) { return '<a href="' + esc(x.url) + '" target="_blank" rel="noopener">' + esc(x.title) + '</a>'; }).join(" · ") + '</p></div>';
  }

  /* ============================================================ FOERDERUNG */
  /* V07 (Redesign 2027): zwei Regler oben, die Zulage gross, die Rechnung in vier Zeilen, Zulage je Beitrag,
     Modellrechnung mit Marke, „Gut zu wissen“, eine Quellenzeile; Beispielfälle als zweiter Screen (#/foerderung/faelle). */
  VS.views.foerderung = function (r) {
    var U = VS.U;
    var root = VS.render(VS.intro("Was legt der Staat dazu?", "Ab 1. Januar 2027 gibt es das geförderte Altersvorsorgedepot.") + '<section id="vs-fd"><div class="vs-loading">Regelwerk wird geladen …</div></section>');
    VS.rules().then(function (rules) {
      var today = new Date().toISOString().slice(0, 10);
      var avd = Fd.selectRule(rules, "DE-ALTERSVORSORGEDEPOT", today < "2027-01-01" ? "2027-01-01" : today);
      var host = root.querySelector("#vs-fd");
      if (!avd) { host.innerHTML = U.blank("Für den Stichtag liegt keine geprüfte Regeldatei vor."); return; }
      var cr = avd.contributionRules, tiers = avd.incomeRules.basicAllowance.tiers, kid = (avd.childRules || {}).perChild || {}, bonus = (avd.bonusRules || {}).careerStarter || {};
      var calc = function (own, kids, young, spouse) { var ch = []; for (var i = 0; i < kids; i++) ch.push({ hasChildBenefit: true }); return Fd.altersvorsorgedepot(avd, { ownContribution: own, age: young ? bonus.maxAgeExclusive - 1 : 30, firstContract: young, children: ch, indirectSpouse: spouse }); };
      if (r.args[0] === "faelle") { faelle(host, avd, calc, cr); return; }
      var nf = function (v) { return Number(v).toLocaleString("de-DE"); };
      host.innerHTML = '<form class="vu-box vs-sliders" id="vs-fd-form" style="margin-top:14px">' + VS.slider("own", "Du zahlst ein", 1200, { unit: "€ / Jahr", min: 0, max: 3600, step: 60, fmt: nf }) + VS.slider("kids", "Kinder mit Kindergeld", 0, { unit: "", min: 0, max: 6, step: 1, fmt: nf }) + '</form>' +
        '<div class="vs-kv"><span class="vu-sm"><b>Jünger als ' + bonus.maxAgeExclusive + ', erster Vertrag</b></span>' + U.toggle(false, "", "young") + '</div>' +
        '<details class="vu-more" style="margin-top:0"><summary>Mehr Angaben</summary><div class="vu-more-body"><div class="vs-kv"><span class="vu-sm">Nur mittelbar zulageberechtigt (Ehegatte, § 79 Satz 2 EStG)</span>' + U.toggle(false, "", "spouse") + '</div>' +
        VS.field("years", "Einzahljahre", Math.max(1, VS.state.plan.targetAge - VS.state.plan.age), { min: 1, max: 60, unit: "Jahre" }) + VS.field("ret", "Rendite vor Kosten", (VS.state.plan.returns.basis * 100).toFixed(1), { step: 0.5, unit: "% pro Jahr" }) + VS.field("cost", "Produktkosten", "0.50", { step: 0.05, unit: "% pro Jahr" }) + '</div></details>' +
        '<div id="vs-fd-out"></div>' +
        VS.sect("Gut zu wissen") + '<div class="vu-box vs-kvbox">' + [["Auszahlung", "frühestens mit " + avd.payoutRules.earliestAge], ["Erlaubt", "UCITS-Fonds u. a., bis Risikoklasse " + avd.productRules.maxRiskClass], ["Kostendeckel Standarddepot", F.pct(avd.productRules.standardDepotCostCap, 0) + " pro Jahr"], ["Alte Riester-Verträge", "behalten altes Recht"]].map(function (x) {
          return '<div class="vs-kv"><span class="vu-sm"><b>' + esc(x[0]) + '</b></span><span class="vu-sm" style="text-align:right">' + esc(x[1]) + '</span></div>'; }).join("") + '</div>' +
        '<button type="button" class="vu-box vu-box--lime vs-srcline" id="vs-fd-src"><span class="vu-sm"><b>Quelle:</b> ' + esc(avd.primarySource ? avd.primarySource.title : avd.ruleId) + (avd.verification && avd.verification.primaryVerified ? ". Werte wörtlich geprüft am " + F.date(avd.verification.verifiedAt) + "." : ". Noch nicht primär geprüft.") + '</span>' + U.glyph("next", 16) + '</button>' +
        VS.sect("Für wen lohnt es sich?") + VS.navcard({ href: "#/foerderung/faelle", glyph: "star", title: "Vier Beispielfälle", sub: "Zulage und Förderquote auf einen Blick" }) +
        VS.sect("Mehr zur Förderung") + '<div class="vu-stack">' + VS.navcard({ href: "#/fruehstart", glyph: "spark", title: "Frühstart für Kinder", sub: "Staatlicher Beitrag je Kind" }) + VS.navcard({ href: "#/riester", glyph: "book", title: "Riester-Vertrag prüfen", sub: "Behalten oder neu ausrichten" }) +
        VS.navcard({ href: "#/anbieter", glyph: "grid", title: "Anbieter vergleichen", sub: "Depotgebühr, Auswahl, Effektivkosten" }) + VS.navcard({ href: "#/rechner", glyph: "target", title: "Geführter Rechner", sub: "Rente und Zulagen in fünf Fragen" }) + '</div>';
      root.querySelector("#vs-fd-src").onclick = function () {
        VS.sheet("vs-fd-rule", "Regeln und Quelle", '<p class="vu-sm">' + esc(avd.legalStatusNote || "") + '</p><p class="vu-ltag" style="margin-top:12px">Was darf ins Depot?</p><p class="vu-sm" style="margin-top:4px">' + esc(cr.eligibleAssets) + '</p>' +
          '<p class="vu-ltag" style="margin-top:12px">Standarddepot</p><p class="vu-sm" style="margin-top:4px">' + esc(avd.productRules.standardDepot) + '</p><div style="margin-top:12px">' + ruleBox(avd) + '</div>');
      };
      var form = host.querySelector("#vs-fd-form");
      form.querySelectorAll("input[type=range]").forEach(fillRange);
      function draw() {
        var own = Number(form.querySelector("#own").value), kids = Number(form.querySelector("#kids").value);
        form.querySelector("#own-out").textContent = nf(own); form.querySelector("#kids-out").textContent = nf(kids); form.querySelectorAll("input[type=range]").forEach(fillRange);
        var young = host.querySelector('input[name="young"]').checked, spouse = host.querySelector('input[name="spouse"]').checked;
        var z = calc(own, kids, young, spouse), yearly = z.basicAllowance + z.childAllowance;
        var n = function (id, f, s) { return VS.readNum(host, id, f, s); }, years = n("years", 32), ret = n("ret", 5, 0.01), cost = n("cost", 0.5, 0.01);
        var withF = M.futureValue({ start: z.careerStarterBonus || 0, monthly: (own + yearly) / 12, years: years, annualReturn: ret, annualCost: cost }).nominal;
        var without = M.futureValue({ monthly: own / 12, years: years, annualReturn: ret, annualCost: cost }).nominal;
        var t1 = Math.min(own, tiers[0].to) * tiers[0].rate, t2 = Math.max(0, Math.min(own, tiers[1].to) - tiers[0].to) * tiers[1].rate;
        var per = [cr.minimumAnnualOwnContribution, 360, 600, 1200, cr.maximumSubsidizedOwnContribution].map(function (b) { return [b, calc(b, 0, false, false).basicAllowance]; });
        var mx = per[per.length - 1][1] || 1;
        host.querySelector("#vs-fd-out").innerHTML =
          '<div class="vu-box vu-box--ink vs-result"><span class="vu-ltag" style="color:#8a8a8a">Zulage pro Jahr</span><p class="vs-big num" style="font-size:44px">' + F.eur(yearly) + '</p>' +
          '<p class="vu-sm">' + (z.eligible ? "Das sind " + F.pct(z.fundingRate, 0) + " auf deinen Beitrag." : esc(z.reason)) + (z.careerStarterBonus ? " Dazu einmalig " + F.eur(z.careerStarterBonus) + " Bonus." : "") + '</p></div>' +
          VS.sect("So wird gerechnet") + '<div class="vu-box vs-kvbox">' +
          [["Auf die ersten " + F.eur(tiers[0].to), F.pct(tiers[0].rate, 0), z.eligible ? F.eur(spouse ? Math.min(t1, yearly) : t1) : "0 €"], ["Auf weitere bis " + F.eur(tiers[1].to), F.pct(tiers[1].rate, 0), z.eligible && !spouse ? F.eur(t2) : "–"],
            ["Je Kind (auf bis " + F.eur(kid.contributionBase) + ")", F.pct(kid.rate, 0), kids ? F.eur(z.childAllowance) : "bis " + F.eur(kid.maximum)], ["Unter " + bonus.maxAgeExclusive + ", einmalig", "", F.eur(bonus.amount)]].map(function (x) {
            return '<div class="vs-kv"><span class="vu-sm"><b>' + esc(x[0]) + '</b>' + (x[1] ? ' <span class="vu-mu">· ' + esc(x[1]) + '</span>' : "") + '</span><b class="num">' + esc(x[2]) + '</b></div>'; }).join("") + '</div>' +
          VS.sect("Zulage je Beitrag") + '<div class="vs-wbars">' + per.map(function (x) { return VS.wbar(F.eur(x[0]) + " im Jahr", F.eur(x[1]), x[1] / mx * 100, x[0] === cr.minimumAnnualOwnContribution); }).join("") + '</div>' +
          VS.help("Schon " + F.eur(cr.minimumAnnualOwnContribution / 12) + " im Monat (" + F.eur(cr.minimumAnnualOwnContribution) + " im Jahr) reichen für die Zulage: Der Staat legt " + F.eur(per[0][1]) + " dazu. Darunter gibt es nichts.") +
          VS.sect("Nach " + years + " Jahren") + '<div class="vs-chipline">' + VS.bsp("Modellrechnung") + '</div>' + VS.wbar("Mit Zulagen", F.eurK(withF), 100, true) + VS.wbar("Ohne Zulagen", F.eurK(without), without / Math.max(1, withF) * 100) +
          '<p class="vu-xs vu-mu" style="margin-top:6px">' + F.eur(own) + ' im Jahr, ' + F.pct(ret, 1) + ' vor Kosten, ' + F.pct(cost, 2) + ' Produktkosten, Regeln über die Laufzeit konstant. Steuern nicht modelliert, keine Steuerberatung.</p>';
      }
      host.addEventListener("input", draw); host.addEventListener("change", draw); draw();
    }).catch(function (e) { root.querySelector("#vs-fd").innerHTML = VS.U.blank("Das Regelwerk ist nicht erreichbar: " + String(e.message || e)); });
  };
  function fillRange(inp) { inp.style.setProperty("--p", ((inp.value - inp.min) / (inp.max - inp.min) * 100).toFixed(1) + "%"); }
  /* V07, zweiter Screen: vier Beispielfälle aus dem Regelwerk. */
  function faelle(host, avd, calc, cr) {
    var max = cr.maximumSubsidizedOwnContribution, mo = max / 12;
    var cases = [[cr.minimumAnnualOwnContribution / 12, 0], [50, 0], [mo, 0], [mo, 2]].map(function (c, i) {
      var z = calc(c[0] * 12, c[1], false, false), y = z.basicAllowance + z.childAllowance;
      return '<div class="vu-box' + (i === 0 ? " vu-box--ink" : "") + ' vs-row-sb" style="flex-wrap:nowrap"><span><b>' + F.eur(c[0]) + ' im Monat' + (c[1] ? " + " + c[1] + " Kinder" : "") + '</b><span class="vu-xs" style="display:block;opacity:.65">' + F.eur(c[0] * 12) + ' Beitrag</span></span>' +
        '<span style="text-align:right"><b class="num" style="font-size:20px' + (i === 0 ? ";color:var(--accent)" : "") + '">+' + F.eur(y) + '</b><span class="vu-xs" style="display:block;opacity:.65">' + F.pct(z.fundingRate, 0) + ' Förderquote</span></span></div>';
    });
    host.innerHTML = '<p class="vu-ltag" style="margin-top:14px">Förderung</p><h2 class="vu-mt" style="margin-top:4px">Für wen lohnt es sich?</h2><div class="vu-stack" style="margin-top:14px">' + cases.join("") + '</div>' +
      VS.help("Förderquote: Zulage geteilt durch deinen Beitrag. Kleine Beiträge werden prozentual am stärksten gefördert.") +
      '<a class="vu-btn vu-btn--block" href="#/start" style="margin-top:14px">Mit 10 € starten</a><a class="vu-btn vu-btn--line vu-btn--block" href="#/foerderung" style="margin-top:8px">Zum Förderrechner</a>';
  }

  /* ============================================================ FRUEHSTART */
  VS.views.fruehstart = function () {
    var root = VS.render('<section class="vs-hero"><p class="vs-eyebrow">Frühstart / Kinder</p><h1>Früh anfangen.<br>Zeit arbeiten lassen.</h1><p class="vs-lead">Was aus einem kleinen monatlichen Betrag bis 18, 30, 50 und 67 werden kann – mit dem geplanten staatlichen Beitrag aus dem Gesetzentwurf als gekennzeichneter Annahme.</p>' +
      '<div class="vs-tabs"><a class="vs-pill" href="#/foerderung">Förderrechner</a><a class="vs-pill primary" href="#/fruehstart">Frühstart / Kinder</a></div></section><section class="vs-section" id="vs-fs"><div class="vs-loading">…</div></section>');
    VS.rules().then(function (rules) {
      var fr = rules.filter(function (r) { return r.ruleId === "DE-FRUEHSTART"; })[0];
      var host = root.querySelector("#vs-fs");
      host.innerHTML = '<div class="vs-grid side"><form class="vs-card app" id="vs-fs-form"><p class="vs-label">Angaben</p><div class="vs-form" style="margin-top:12px">' +
        VS.field("age", "Alter des Kindes", 2, { min: 0, max: 17, unit: "Jahre" }) + VS.field("parent", "Elternbeitrag", 25, { min: 0, unit: "€ / Monat bis 18" }) +
        VS.field("ret", "Rendite vor Kosten", "5.0", { step: 0.5, unit: "% p.a." }) + VS.field("cost", "Kosten", "0.30", { step: 0.05, unit: "% p.a." }) +
        '<label class="vs-check vs-field full"><input type="checkbox" id="state" checked> Staatlichen Beitrag einrechnen (' + F.eur(fr.childRules.stateContributionMonthly) + ' / Monat, ' + fr.childRules.fromAge + '–' + (fr.childRules.untilAgeExclusive - 1) + ' Jahre)</label></div></form><div id="vs-fs-out"></div></div>' +
        '<div style="margin-top:14px">' + ruleBox(fr) + '</div><div class="vs-warnbox" style="margin-top:14px">' + esc(fr.legalStatusNote) + '</div>';
      var form = host.querySelector("#vs-fs-form");
      function draw() {
        var n = function (id, f, s) { return VS.readNum(form, id, f, s); };
        var useState = form.querySelector("#state").checked;
        var refYear = Math.max(2027, new Date().getFullYear());
        var res = Fd.childWealthPath(useState ? fr : null, { childAge: n("age", 0), referenceYear: refYear, parentMonthly: n("parent", 0), annualReturn: n("ret", 5, 0.01), annualCost: n("cost", 0.3, 0.01) });
        var fs = Fd.fruehstart(fr, { childAge: n("age", 0), referenceYear: refYear });
        host.querySelector("#vs-fs-out").innerHTML = '<div class="vs-card"><div class="vs-grid g4">' + res.targets.map(function (t) {
          var p = res.path[t];
          return '<div class="vs-card soft"><p class="vs-label">Mit ' + t + '</p><p class="vs-kpi small">' + F.eurK(p.value) + '</p><p class="vs-fine">eingezahlt: Staat ' + F.eur(p.state) + ' · Eltern ' + F.eur(p.parent) + '</p></div>';
        }).join("") + '</div>' + (useState ? (fs.eligible === false ? '<div class="vs-warnbox" style="margin-top:14px">' + esc(fs.reason) + ' (Geburtsjahr rechnerisch ' + fs.birthYear + ')</div>' : '<div class="vs-note" style="margin-top:14px">Staatlicher Beitrag laut Gesetzentwurf: ' + fs.years + ' Jahre × 12 × ' + F.eur(fs.monthly) + ' = <b>' + F.eur(fs.total) + '</b>. Kein Anspruch, solange das Gesetz nicht beschlossen ist.</div>') : "") +
          '<p class="vs-fine" style="margin-top:10px">Nach 18 keine weiteren Einzahlungen; das Vermögen wächst mit der Annahme weiter. Nominale Werte ohne Inflation, Steuern und Entnahmeregeln.</p></div>';
      }
      form.addEventListener("input", draw); form.addEventListener("submit", function (e) { e.preventDefault(); }); draw();
    });
  };

  /* =============================================================== RIESTER */
  VS.views.riester = function () {
    var root = VS.render('<section class="vs-hero"><p class="vs-eyebrow">Riester-Analyse</p><h1>Behalten oder<br>neu ausrichten?</h1><p class="vs-lead">Zwei Szenarien mit deinen Vertragsdaten. Wir geben keine Wechsel-Empfehlung – wir zeigen, wovon die Antwort abhängt.</p></section><section class="vs-section" id="vs-ri"><div class="vs-loading">…</div></section>');
    VS.rules().then(function (rules) {
      var ri = rules.filter(function (r) { return r.ruleId === "DE-RIESTER"; })[0];
      var host = root.querySelector("#vs-ri");
      host.innerHTML = '<div class="vs-grid side"><form class="vs-card app" id="vs-ri-form"><p class="vs-label">Dein Vertrag (aus der jährlichen Standmitteilung)</p><div class="vs-form" style="margin-top:12px">' +
        VS.field("value", "Vertragswert heute", 15000, { min: 0, unit: "€" }) + VS.field("own", "Eigenbeitrag", 100, { min: 0, unit: "€ / Monat" }) +
        VS.field("years", "Restlaufzeit", Math.max(1, VS.state.plan.targetAge - VS.state.plan.age), { min: 1, unit: "Jahre" }) + VS.field("guar", "Garantiertes Kapital", 0, { min: 0, unit: "€ zum Rentenbeginn" }) +
        VS.field("kr", "Rendite Fonds/Vertrag", "2.0", { step: 0.5, unit: "% p.a. vor Kosten" }) + VS.field("kc", "Kosten Vertrag", "1.50", { step: 0.05, unit: "% p.a. Effektivkosten" }) +
        VS.field("nr", "Rendite Neuausrichtung", (VS.state.plan.returns.basis * 100).toFixed(1), { step: 0.5, unit: "% p.a. vor Kosten" }) + VS.field("nc", "Kosten Neuausrichtung", "0.50", { step: 0.05, unit: "% p.a." }) +
        VS.field("sw", "Wechselkosten", 300, { min: 0, unit: "€ einmalig" }) + VS.field("income", "Einkommen Vorjahr (brutto)", 40000, { min: 0, unit: "€ – für Mindestbeitrag" }) +
        VS.field("kids", "Kinder ab Jg. 2008", 0, { min: 0, max: 10, unit: "Anzahl" }) + '</div></form><div id="vs-ri-out"></div></div>' +
        '<div class="vs-note" style="margin-top:14px"><b>Übergang ab 2027:</b> ' + esc(ri.validUntilNote) + '</div><div style="margin-top:14px">' + ruleBox(ri) + '</div>';
      var form = host.querySelector("#vs-ri-form");
      function draw() {
        var n = function (id, f, s) { return VS.readNum(form, id, f, s); };
        var kids = []; for (var i = 0; i < Math.round(n("kids", 0)); i++) kids.push({ bornYear: 2012 });
        var z = Fd.riester(ri, { ownContribution: n("own", 0) * 12, previousYearIncome: n("income", 0), children: kids });
        var c = V.Monitor.riesterComparison({ contractValue: n("value", 0), ownMonthly: n("own", 0), allowanceYearly: z.basicAllowance + z.childAllowance, years: n("years", 20),
          keepReturn: n("kr", 2, 0.01), keepCost: n("kc", 1.5, 0.01), newReturn: n("nr", 5, 0.01), newCost: n("nc", 0.5, 0.01), newAllowanceYearly: z.basicAllowance + z.childAllowance,
          switchCost: n("sw", 0), guaranteedValue: n("guar", 0) }, M);
        host.querySelector("#vs-ri-out").innerHTML = '<div class="vs-card"><div class="vs-grid g2">' + [c.keep, c.realign].map(function (s, i) {
          return '<div class="vs-card ' + (i ? "soft" : "app") + '"><p class="vs-label">' + esc(s.label) + '</p><p class="vs-kpi">' + F.eurK(s.endValue) + '</p><p class="vs-fine">eingezahlt inkl. Zulagen ' + F.eurK(s.invested) + (s.guaranteeFloor ? " · Garantie " + F.eurK(s.guaranteeFloor) : "") + '</p></div>';
        }).join("") + '</div><div class="vs-row" style="margin-top:12px"><span>Unterschied (Neuausrichtung − Behalten)</span><span class="num ' + F.cls(c.difference) + '">' + F.spct(c.difference / Math.max(1, c.keep.endValue)) + ' · ' + F.eur(c.difference) + '</span></div>' +
          '<div class="vs-row"><span>Zulagen pro Jahr (aktuelle Regel)</span><span class="num">' + F.eur(z.basicAllowance + z.childAllowance) + '</span></div>' +
          (z.reducedBecause ? '<div class="vs-warnbox" style="margin-top:10px">' + esc(z.reducedBecause) + '</div>' : "") +
          (c.breakEvenNote ? '<div class="vs-note" style="margin-top:10px">' + esc(c.breakEvenNote) + '</div>' : "") +
          '<h3 style="margin-top:16px">Worauf es ankommt</h3>' + c.caveats.map(function (t) { return '<div class="vs-row"><span>• ' + esc(t) + '</span></div>'; }).join("") + '</div>';
      }
      form.addEventListener("input", draw); form.addEventListener("submit", function (e) { e.preventDefault(); }); draw();
    });
  };

  /* =============================================================== ANBIETER */
  VS.views.anbieter = function () {
    var root = VS.render('<section class="vs-hero"><p class="vs-eyebrow">Anbieter-Vergleich</p><h1>Altersvorsorge-Angebote<br>im Vergleich.</h1><p class="vs-lead">Geförderte Vorsorge und Depots unterscheiden sich vor allem bei Kosten, Auswahl und Auszahlung. Vision Universe vergleicht – die Umsetzung erfolgt bei einem Anbieter deiner Wahl.</p></section><section class="vs-section" id="vs-an"><div class="vs-loading">…</div></section>');
    VS.analytics.track("provider_compare", {});
    VS.getJSON("/vorsorge/data/providers.json").then(function (p) {
      var host = root.querySelector("#vs-an");
      host.innerHTML = (p.providers.length ? "" : '<div class="vs-card app"><p class="vs-label">Status</p><p class="vs-kpi small" style="margin-top:6px">Noch keine verifizierten Anbieterdaten</p><p class="vs-sub" style="margin-top:8px">' + esc(p.statusNote) + '</p></div>') +
        '<div class="vs-table-wrap" style="margin-top:14px"><table class="vs-table"><thead><tr>' + p.fields.map(function (f) { return '<th scope="col">' + esc(f.label) + '</th>'; }).join("") + '</tr></thead><tbody>' +
        (p.providers.length ? p.providers.map(function (row) { return '<tr>' + p.fields.map(function (f) { return '<td>' + (row[f.id] === null || row[f.id] === undefined ? '<span class="vs-fine">–</span>' : esc(row[f.id])) + '</td>'; }).join("") + '</tr>'; }).join("")
          : '<tr><td colspan="' + p.fields.length + '" class="vs-empty">Daten folgen – keine geschätzten Konditionen.</td></tr>') + '</tbody></table></div>' +
        '<div class="vs-card soft" style="margin-top:14px"><p class="vs-label">So wird verglichen</p>' + p.fields.map(function (f) { return '<div class="vs-row"><span>' + esc(f.label) + '</span><span class="vs-fine">' + esc(f.unit || "") + '</span></div>'; }).join("") + '<p class="vs-fine" style="margin-top:8px">' + esc(p.rowContract) + '</p></div>' +
        '<a class="vs-card link" style="margin-top:14px" href="#/kosten"><p class="vs-label">Bis dahin</p><p class="vs-kpi small" style="margin-top:6px">Effektivkosten selbst vergleichen →</p><p class="vs-sub">Trage die Effektivkosten aus zwei Basisinformationsblättern in die Kostenanalyse ein.</p></a>';
    });
  };

  /* ============================================================ VERGLEICHEN */
  /* V06 (Redesign 2027): Der Vergleich ist sofort da (Standard URTH und SPY), ohne Gewinner-Logik.
     Ein Chart auf Start = 100, eine ehrliche Tabelle; fehlende Werte heißen „Keine Aussage“. Kosten als eigener Screen. */
  VS.views.vergleichen = function (r) {
    if (r.args[0] === "kosten") return kostenScreen();
    var U = VS.U, syms = (r.query.s || "URTH,SPY").split(",").map(function (s) { return s.trim().toUpperCase(); }).filter(Boolean).slice(0, 4);
    var root = VS.render(VS.intro("Vergleichen", "Zwei ETFs nebeneinander. Ohne Gewinner-Logik.") + '<div class="vu-grid vs-pick" id="vs-pick" style="margin-top:14px"></div>' +
      '<section id="vs-cmp2"><div class="vs-loading">Vergleich wird geladen …</div></section>' +
      VS.sect("Weitere Vergleiche") + '<div class="vu-stack">' + VS.navcard({ href: "#/vergleichen/kosten", glyph: "bars", title: "Kosten über die Laufzeit", sub: "0,2 % oder 1,5 %: was das ausmacht" }) +
      VS.navcard({ href: "#/anbieter", glyph: "grid", title: "Anbieter vergleichen", sub: "Depotgebühr, Auswahl, Effektivkosten" }) + VS.navcard({ href: "#/riester", glyph: "book", title: "Riester-Vertrag prüfen", sub: "Behalten oder neu ausrichten" }) +
      VS.navcard({ href: "#/vergleich?s=" + encodeURIComponent(syms.join(",")), glyph: "list", title: "Ausführlicher ETF-Vergleich", sub: "Bis zu vier ETFs, alle Kennzahlen" }) + '</div>');
    VS.master().then(function (m) {
      var es = syms.map(function (s) { return m.find(s); }).filter(Boolean);
      var href = function (list) { return "#/vergleichen?s=" + encodeURIComponent(list.map(function (e) { return e.slug; }).join(",")); };
      root.querySelector("#vs-pick").innerHTML = es.map(function (e, i) { return '<button type="button" class="vu-box' + (i === 0 ? " vu-box--ink" : "") + ' vs-pickcard" data-i="' + i + '">' + VS.logo(e.symbol) + '<span><b>' + esc(e.symbol) + '</b><small>' + esc(e.index || VS.CORE_TITLE[e.symbol] || e.category || "") + '</small></span></button>'; }).join("") +
        (es.length < 4 ? '<button type="button" class="vu-box vu-box--line vs-pickcard" data-i="' + es.length + '">' + U.glyph("plus", 18) + '<span><b>ETF hinzufügen</b><small>bis zu vier</small></span></button>' : "");
      root.querySelectorAll("[data-i]").forEach(function (b) {
        b.onclick = function () {
          var i = Number(b.dataset.i);
          var el = VS.sheet("vs-pick-s", i < es.length ? es[i].symbol + " tauschen" : "ETF hinzufügen", '<div class="vs-termsearch">' + U.glyph("search", 18) + '<input id="vs-pick-q" placeholder="Ticker, Name oder Index" autocomplete="off" aria-label="ETF suchen"></div><div id="vs-pick-r" class="vs-erows" style="margin-top:8px"></div>' +
            (i < es.length && es.length > 2 ? '<a class="vu-btn vu-btn--line vu-btn--block" style="margin-top:12px" href="' + href(es.filter(function (_, k) { return k !== i; })) + '">' + esc(es[i].symbol) + ' entfernen</a>' : ""));
          var q = el.querySelector("#vs-pick-q"), out = el.querySelector("#vs-pick-r");
          var show = function () {
            var res = q.value.trim() ? V.Master.search(m.etfs.filter(function (e) { return e.layer === "PUBLIC_ANALYSIS"; }), q.value, 8) : ["URTH", "SPY", "EEM", "QQQ", "FEZ", "IWM", "VT", "ACWI"].map(function (s) { return m.find(s); }).filter(Boolean);
            out.innerHTML = res.map(function (e) { var l = es.slice(); l[i] = e; return '<a class="vs-erow vs-erow--nospark" href="' + href(l) + '">' + VS.logo(e.symbol) + '<span class="vs-erow-n"><b>' + esc(e.symbol) + '</b><span>' + esc(VS.displayName(e.name)) + '</span></span>' + U.glyph("next", 15) + '</a>'; }).join("");
          };
          q.addEventListener("input", show); show(); q.focus();
          out.addEventListener("click", function () { U.closeSheet(el); });
        };
      });
      if (es.length < 2) { root.querySelector("#vs-cmp2").innerHTML = U.blank("Für einen Vergleich braucht es zwei ETFs. Tippe auf „ETF hinzufügen“."); return; }
      VS.analytics.track("etf_compare", { symbols: es.map(function (e) { return e.symbol; }).join(",") });
      return Promise.all(es.map(function (e) { return VS.etf(e.slug).catch(function () { return null; }); })).then(function (ds) {
        return Promise.all(ds.map(function (d) { return d && d.holdings && d.holdings.series ? VS.holdings(d.holdings.series) : null; })).then(function (hs) { draw(es, ds, hs); });
      });
    }).catch(function () { root.querySelector("#vs-cmp2").innerHTML = U.blank("Das ETF-Verzeichnis ist nicht erreichbar."); });
    function draw(es, ds, hs) {
      var host = root.querySelector("#vs-cmp2");
      var series = ds.map(function (d) { return d && d.series && d.series.daily ? d.series.daily : []; });
      var end = series.reduce(function (a, s) { var l = s.length ? s[s.length - 1][0] : null; return l && (!a || l < a) ? l : a; }, null);
      var from = end ? new Date(Date.parse(end) - 365 * 864e5).toISOString().slice(0, 10) : null;
      var start = series.reduce(function (a, s) { var f = s.filter(function (p) { return p[0] >= from; })[0]; return f && f[0] > a ? f[0] : a; }, from || "");
      var lines = series.map(function (s, i) {
        var w = s.filter(function (p) { return p[0] >= start && p[0] <= end; }); if (!w.length) return null;
        var b = w[0][1]; return { label: es[i].symbol, points: w.map(function (p) { return [p[0], p[1] / b * 100]; }) };
      }).filter(Boolean);
      var since = es.map(function (e) { return String(e.from || "").slice(0, 4); });
      var noCost = es.filter(function (e) { return e.cost === null; });
      var cell = function (i, f) { var v = f(i); return v === null || v === undefined || v === "" ? VS.verdict("none", "k. A.") : v; };
      var rowsT = [["1 Jahr", function (i) { return es[i].m ? VS.chg(es[i].m.p["1Y"]) : null; }], ["Schwankung", function (i) { return es[i].m ? F.pct(es[i].m.vol, 0) : null; }],
        ["Größter Rückgang", function (i) { return es[i].m ? F.spct(es[i].m.mdd, 1) : null; }], ["Kosten", function (i) { return es[i].cost !== null ? VS.costPct(es[i].cost) : null; }],
        ["Firmen", function (i) { return hs[i] ? Number(hs[i].positions).toLocaleString("de-DE") : es[i].positions ? Number(es[i].positions).toLocaleString("de-DE") : null; }],
        ["Länder", function (i) { return hs[i] && hs[i].exposures && hs[i].exposures.countries ? String(hs[i].exposures.countries.filter(function (c) { return c.key !== "UNKNOWN" && c.weight > 0.0005; }).length) : null; }],
        ["Historie seit", function (i) { return since[i] || null; }]];
      host.innerHTML = VS.sect("12 Monate · Start = 100") + '<div id="vs-cmp-ch"></div>' +
        '<p class="vu-xs vu-mu" style="margin-top:4px">Linie: ' + esc(es[0].symbol) + ' · gestrichelt: ' + esc(es.slice(1).map(function (e) { return e.symbol; }).join(", ")) + ' · Kurs ohne Ausschüttungen</p>' +
        '<div class="vu-box" style="margin-top:14px;padding:6px 14px"><div class="vs-tbl" style="--n:' + es.length + '"><span></span>' + es.map(function (e) { return '<span>' + esc(e.symbol) + '</span>'; }).join("") + '</div>' +
        rowsT.map(function (rw) { return '<div class="vs-tbl" style="--n:' + es.length + '"><b>' + esc(rw[0]) + '</b>' + es.map(function (_, i) { return '<span class="num">' + cell(i, rw[1]) + '</span>'; }).join("") + '</div>'; }).join("") + '</div>' +
        (since.some(function (s) { return s !== since[0]; }) ? VS.help("Der größte Rückgang zählt ab Beginn der Kurshistorie (" + es.map(function (e, i) { return e.symbol + " ab " + since[i]; }).join(", ") + "). Unterschiedlich lange Zeiträume sind nicht direkt vergleichbar.") : "") +
        (noCost.length ? VS.help("k. A.: Für " + noCost.map(function (e) { return e.symbol; }).join(", ") + " liegt keine Kostenquote aus einer amtlichen Quelle vor. Wir zeigen dann keine Zahl.") : "");
      if (lines.length > 1) VS.lineChart(host.querySelector("#vs-cmp-ch"), lines, { height: 170, area: false, label: "Kursverlauf auf Start = 100", fmtY: function (v) { return v.toLocaleString("de-DE", { maximumFractionDigits: 0 }); }, fmtTip: function (v) { return v.toLocaleString("de-DE", { maximumFractionDigits: 1 }); } });
      else host.querySelector("#vs-cmp-ch").innerHTML = VS.U.blank("Für diesen Zeitraum liegen nicht für beide ETFs Kurse vor.");
    }
  };
  /* V06, zweiter Screen: was Kosten ausmachen (Beispielrechnung mit den Planer-Annahmen). */
  function kostenScreen() {
    var pl = VS.state.plan, years = Math.max(1, pl.targetAge - pl.age);
    var fee = M.feeImpact({ start: pl.start, monthly: pl.monthly, years: years, annualReturn: pl.returns.basis, costA: 0.002, costB: 0.015 });
    VS.analytics.track("cost_simulation", { years: years });
    VS.render('<header class="vs-intro"><p class="vu-ltag">Vergleichen</p><h1 class="vu-mt" style="font-size:24px">Was Kosten ausmachen</h1></header><div class="vs-chipline" style="margin-top:8px">' + VS.bsp() + '</div>' +
      '<p class="vu-sm vu-mu" style="margin-top:4px">' + F.eur(pl.monthly) + ' im Monat, ' + (pl.start ? F.eur(pl.start) + ' Start, ' : "") + years + ' Jahre, ' + F.pct(pl.returns.basis, 0) + ' pro Jahr vor Kosten.</p>' +
      '<div class="vu-box" style="margin-top:10px;padding:6px 14px 12px">' + VS.wbar("0,2 % laufende Kosten", F.eurK(fee.a.endValue), 100, true) + VS.wbar("1,5 % laufende Kosten", F.eurK(fee.b.endValue), fee.b.endValue / Math.max(1, fee.a.endValue) * 100) + '</div>' +
      '<div class="vu-grid" style="margin-top:10px">' + VS.tile("0,2 % Kosten", F.eurK(fee.a.endValue), "mit " + pl.targetAge) + VS.tile("1,5 % Kosten", F.eurK(fee.b.endValue), "mit " + pl.targetAge) + '</div>' +
      '<div class="vu-box vu-box--lime" style="margin-top:12px"><p class="vs-big num" style="font-size:30px;margin-top:0">' + F.eurK(fee.difference) + '</p><p class="vu-sm"><b>weniger, nur wegen höherer Kosten.</b></p></div>' +
      VS.help("Laufende Kosten werden jedes Jahr vom Vermögen abgezogen. Über Jahrzehnte summiert sich das.") +
      '<a class="vu-btn vu-btn--line vu-btn--block" style="margin-top:14px" href="#/kosten">Mit eigenen Zahlen rechnen</a>', { dm: [["Annahmen", "Planer-Angaben (" + (VS.state.planDone ? "dein gespeicherter Plan" : "Standardannahmen") + "), Kosten als laufender Abzug, monatliche Verzinsung. Keine Prognose."]] });
  }

  /* ================================================================ WISSEN */
  /* V09 (Redesign 2027): Alltagswort zuerst, ein Satz sofort sichtbar; offen mit der Langfassung, bei Schwankung und
     Rückgang mit echtem Beispiel (URTH). Fachwort unten. [Titel, ein Satz, Langfassung, Fachwort, Beispiel] */
  var GLOSSARY = [
    ["ETF", "Ein Korb mit vielen Aktien, den du mit einem Kauf bekommst.", "Ein börsengehandelter Fonds. Er bündelt viele Wertpapiere – oft nach einem Index wie dem MSCI World – und lässt sich wie eine Aktie kaufen.", "Exchange Traded Fund"],
    ["Index", "Eine Liste, welche Firmen im Korb sind, z. B. MSCI World.", "Eine Liste von Unternehmen nach festen Regeln, z. B. die 500 größten US-Firmen (S&P 500). Ein Index-ETF bildet sie nach.", "Index"],
    ["Laufende Kosten", "Was der ETF pro Jahr kostet, in Prozent vom Geld.", "Die jährlichen Kosten eines Fonds in Prozent des Vermögens. Sie werden still aus dem Fonds entnommen – du siehst sie nur in der Rendite.", "TER (Total Expense Ratio)"],
    ["Alle Kosten zusammen", "Alle Kosten zusammen, auch die von Depot und Vertrag.", "Alle Kosten eines Vorsorgeprodukts zusammen (Fonds, Depot, Vertrieb, Versicherung), angegeben als Renditeminderung pro Jahr im Basisinformationsblatt.", "Effektivkosten"],
    ["Behalten oder auszahlen", "Gewinne bleiben im ETF oder werden dir ausgezahlt.", "Thesaurierende ETFs legen Erträge automatisch wieder an, ausschüttende zahlen sie aus.", "Thesaurierend / Ausschüttend"],
    ["Kurs oder Gesamtrendite", "Mit oder ohne die ausgezahlten Gewinne gerechnet.", "Die Kursentwicklung zeigt nur den Preis. Die Gesamtrendite enthält zusätzlich die Ausschüttungen. Wir nennen eine Gesamtrendite nur, wenn Dividenden korrekt in den Daten enthalten sind.", "Price Return / Total Return"],
    ["Schwankung", "Wie stark der Kurs typisch hoch und runter geht.", "Wie stark sich der Kurs typischerweise innerhalb eines Jahres bewegt. 15 % heißt grob: In vielen Jahren liegt das Ergebnis ±15 % um den Durchschnitt. Mehr Schwankung heißt mehr Auf und Ab.", "Volatilität", "vol"],
    ["Größter Rückgang", "Der tiefste Fall vom letzten Höchststand.", "Der stärkste Verlust vom Höchststand bis zum Tiefpunkt in der Vergangenheit – und wie lange es dauerte, bis das alte Hoch wieder erreicht war.", "Maximum Drawdown", "mdd"],
    ["Zinseszins", "Erträge bringen selbst wieder Erträge.", "Erträge erwirtschaften selbst wieder Erträge. Deshalb wirken Zeit und Kosten über Jahrzehnte so stark.", "Zinseszinseffekt"],
    ["Kaufkraft", "Was dein Geld später in heutigen Preisen wert ist.", "Bei 2 % Inflation ist 1 € in 30 Jahren nur noch rund 55 Cent wert. Deshalb zeigen wir Endwerte auch in heutiger Kaufkraft.", "Inflation, reale Werte"],
    ["Vorsorgelücke", "Was zwischen Rente und Wunsch im Alter fehlt.", "Die Differenz zwischen dem Einkommen, das du im Alter möchtest, und dem, was du aus Rente und anderen Quellen erwartest.", "Rentenlücke"],
    ["Überschneidung", "Wie viele Firmen in zwei ETFs doppelt stecken.", "Wie stark sich zwei ETFs überschneiden. Wer MSCI World und S&P 500 kombiniert, besitzt viele US-Unternehmen doppelt.", "Overlap"],
    ["Hebel und Short", "Verstärken oder drehen Bewegungen. Nicht für die Vorsorge.", "Sie bilden die doppelte oder umgekehrte tägliche Bewegung ab. Über längere Zeit weicht das Ergebnis stark ab – für die Vorsorge nicht gedacht.", "Leveraged / Inverse ETF"],
    ["EU-Fonds", "EU-Regeln für Fonds. So erkennst du ETFs für deine Bank.", "EU-Regelwerk für Fonds. Privatanleger in der EU kaufen in der Regel UCITS-ETFs; US-ETFs sind meist nicht handelbar, weil ein Basisinformationsblatt fehlt.", "UCITS (OGAW)"],
    ["Altersvorsorgedepot", "Neues gefördertes Depot ab 2027, mit Zulagen.", "Ein ab 2027 staatlich gefördertes Depot für die private Altersvorsorge – ein Produkt von Banken und Brokern, das Vision Universe analysiert, nicht anbietet.", "Altersvorsorgedepot (AltZertG)"]
  ];
  VS.GLOSSARY = GLOSSARY;
  VS.views.wissen = function () {
    var U = VS.U;
    var root = VS.render(VS.intro("Vorsorge, einfach erklärt.", GLOSSARY.length + " Begriffe, je ein Satz.") +
      '<label class="vs-termsearch">' + U.glyph("search", 18) + '<input id="vs-tq" type="search" placeholder="Begriff suchen …" aria-label="Begriff suchen" autocomplete="off"></label>' +
      '<a class="vu-box vu-box--lime vs-learn" href="#/start"><span class="vu-hud" style="--vu-hud:40px;border-radius:11px">' + VS.glyph("play", 20) + '</span><span><b>In 3 Minuten zum ersten Sparplan</b><span class="vu-sm" style="display:block">Der geführte Weg mit 10 €</span></span>' + U.glyph("next", 18) + '</a>' +
      VS.sect("Die wichtigsten Begriffe") + '<div class="vs-terms" id="vs-terms">' + GLOSSARY.map(function (g, i) {
        return '<button type="button" class="vs-term" data-t="' + i + '"><span><b>' + esc(g[0]) + '</b>' + U.glyph("plus", 16) + '</span><small>' + esc(g[1]) + '</small></button>'; }).join("") + '</div>' +
      '<p class="vu-sm vu-mu" id="vs-tnone" hidden>Kein Begriff gefunden.</p>' +
      VS.sect("Mehr lernen") + '<div class="vu-stack">' + VS.navcard({ href: "/academy/", glyph: "book", title: "Vision Universe Academy", sub: "Kurse und Videos" }) + VS.navcard({ href: "#/daten", glyph: "check", title: "Datenquellen und Qualität", sub: "Woher jede Zahl kommt" }) + '</div>');
    root.querySelector("#vs-tq").addEventListener("input", function () {
      var q = this.value.trim().toLowerCase(), n = 0;
      root.querySelectorAll("[data-t]").forEach(function (b) { var g = GLOSSARY[b.dataset.t], hit = !q || (g[0] + " " + g[1] + " " + g[3]).toLowerCase().indexOf(q) >= 0; b.hidden = !hit; if (hit) n++; });
      root.querySelector("#vs-tnone").hidden = n > 0;
    });
    root.querySelector("#vs-terms").addEventListener("click", function (ev) {
      var b = ev.target.closest("[data-t]"); if (!b) return;
      var g = GLOSSARY[b.dataset.t];
      var el = VS.sheet("vs-term-s", g[0], '<p class="vu-ltag">Begriff</p><p style="margin-top:8px;font-size:16px;font-weight:600;line-height:1.4">' + esc(g[1]) + '</p><p class="vu-sm vu-mu" style="margin-top:8px">' + esc(g[2]) + '</p>' +
        (g[4] ? '<div id="vs-term-ex"><div class="vs-loading">Beispiel wird geladen …</div></div>' : "") + '<p class="vu-xs vu-mu" style="margin-top:12px">Fachbegriff: ' + esc(g[3]) + '</p>');
      if (!g[4] || !el) return;
      Promise.all([VS.masterFor(["URTH"]), VS.weekly("URTH")]).then(function (res) {
        var e = res[0].find("URTH"), w = res[1], ex = el.querySelector("#vs-term-ex");
        ex.innerHTML = '<p class="vu-ltag" style="margin-top:14px">Am Beispiel MSCI World (URTH)</p><div id="vs-term-ch" style="margin-top:6px"></div><div class="vu-grid" style="margin-top:10px">' +
          VS.tile("Schwankung", e && e.m ? F.pct(e.m.vol, 0) : "–", "pro Jahr") + VS.tile("Größter Rückgang", e && e.m ? F.spct(e.m.mdd, 1) : "–", "seit " + String(e && e.from || "").slice(0, 4)) + '</div>';
        if (w && global.VUChart) global.VUChart.mount(ex.querySelector("#vs-term-ch"), { currency: "USD", label: "URTH seit Auflage", height: 110, bleed: false, ranges: [{ id: "Max", label: "Max", points: w }] });
      }).catch(function () { el.querySelector("#vs-term-ex").innerHTML = ""; });
    });
  };

  /* ================================================================= DATEN */

  function intelBlock(it, n) {
    if (!it) return "";
    var c = it.coverage, h = it.holdings || {}, eu = it.europe;
    var tiles = [["Kostenquote (Prospekt)", c.costs], ["Fondsvermögen", c.aum], ["Holdings (Bestände)", c.holdings], ["Domizil", c.domicile], ["UCITS-Status", c.ucitsStatus], ["ISIN (US)", c.isin]];
    var ST = { HEALTHY: ["ok", "aktiv"], DEGRADED: ["complex", "eingeschränkt"], FAILED: ["bad", "Fehler"], NOT_CONFIGURED: ["", "nicht eingerichtet"], NOT_PERMITTED: ["bad", "nicht erlaubt"] };
    return '<div class="vs-card" style="margin-top:14px"><p class="vs-label">ETF-Fundamentals & Holdings · öffentliches Universum (' + n(it.publicUniverse) + ' ETFs)</p><div class="vs-grid g3" style="margin-top:10px">' +
      tiles.map(function (t) { return '<div class="vs-card soft"><p class="vs-label">' + esc(t[0]) + '</p><p class="vs-kpi small">' + F.pct(t[1].ratio, 0) + '</p><p class="vs-fine">' + n(t[1].count) + ' ETFs</p></div>'; }).join("") + '</div>' +
      '<div class="vs-row" style="margin-top:10px"><span>Holdings-Snapshots (SEC N-PORT, ' + esc((it.holdingsQuarters || []).join(", ")) + ')</span><span class="num">' + n(h.snapshots) + '</span></div>' +
      '<div class="vs-row"><span>Fondsserien mit Beständen · aktuelle Positionszeilen</span><span class="num">' + n(h.series) + ' · ' + n(h.currentHoldingRows) + '</span></div>' +
      '<div class="vs-row"><span>Erkannte Bestandsänderungen (alle Quartalspaare)</span><span class="num">' + n(h.events) + '</span></div>' +
      '<div class="vs-row"><span>Aktiengewicht dem VU-Aktienstamm zugeordnet (Median)</span><span class="num">' + F.pct(h.medianMappedShareOfEquity, 0) + '</span></div>' +
      '<div class="vs-row"><span>Qualitätsbefunde (Fehler · Hinweise)</span><span class="num">' + n(h.qualityErrors) + ' · ' + n(h.qualityWarnings) + '</span></div></div>' +
      (eu ? '<div class="vs-card" style="margin-top:14px"><p class="vs-label">Europa · ESMA FIRDS + GLEIF (Stand ' + F.date(eu.asOf) + ')</p>' +
        '<div class="vs-row"><span>ETF-Anteilklassen mit ISIN</span><span class="num">' + n(eu.shareClasses) + '</span></div><div class="vs-row"><span>davon „UCITS“ im amtlichen Namen</span><span class="num">' + n(eu.ucitsInName) + '</span></div>' +
        '<div class="vs-row"><span>an deutschen Börsen gelistet</span><span class="num">' + n(eu.listedInGermany) + '</span></div><div class="vs-row"><span>Listings (Anteilklasse × Handelsplatz)</span><span class="num">' + n(eu.venues) + '</span></div>' +
        (eu.ucitsRegister ? '<div class="vs-row"><span>UCITS-Zuordnung über ESMA-Register (Konfidenz mittel)</span><span class="num">' + n(eu.ucitsRegister) + '</span></div><div class="vs-row"><span>davon Vertrieb in Deutschland im Register gemeldet (ältere Meldungen fehlen teils)</span><span class="num">' + n(eu.notifiedInGermany) + '</span></div>' : "") +
        (eu.domicileFromIsin ? '<div class="vs-row"><span>Domizil aus dem ISIN-Präfix abgeleitet (keine Fonds-LEI)</span><span class="num">' + n(eu.domicileFromIsin) + '</span></div>' : "") +
        '<div class="vs-row"><span>mit Kursanalyse · Holdings · Kosten</span><span class="num">nicht verfügbar</span></div>' +
        '<a class="vs-pill small" style="margin-top:8px" href="#/europa">Europäische ETFs ansehen</a></div>' : "") +
      '<div class="vs-card soft" style="margin-top:14px"><p class="vs-label">Quellen-Status</p><div class="vs-table-wrap"><table class="vs-table" style="min-width:560px"><thead><tr><th>Quelle</th><th>Art</th><th>Status</th><th>Stand</th><th>Einträge</th><th>Felder</th></tr></thead><tbody>' +
      it.providers.map(function (p) { var st = ST[p.status] || ["", p.status]; return '<tr><td>' + esc(p.id) + '</td><td>' + esc({ PRIMARY_ISSUER: "Emittent", REGULATORY: "Regulierung", MARKET_DATA_PROVIDER: "Kursanbieter" }[p.type] || p.type) + '</td><td><span class="vs-badge ' + st[0] + '">' + esc(st[1]) + '</span></td><td>' + F.date(p.lastSuccessfulFetch) + '</td><td class="num">' + n(p.items) + '</td><td style="text-align:left;white-space:normal" class="vs-fine">' + esc(p.fields) + '</td></tr>'; }).join("") +
      '</tbody></table></div><p class="vs-fine" style="margin-top:8px">Emittenten: Nutzungsbedingungen von ' + n(it.termsChecked) + ' Seiten geprüft – persönliche, nicht-kommerzielle Nutzung bzw. keine Weitergabe ohne Zustimmung. Ohne Lizenz werden keine Emittentendaten automatisiert übernommen.</p></div>';
  }

  VS.views.daten = function () {
    var root = VS.render('<section class="vs-hero"><p class="vs-eyebrow">Datenquellen & Datenqualität</p><h1>Was wir wissen&nbsp;– und was nicht.</h1><p class="vs-lead">Jede Zahl in Vision Universe Altersvorsorge hat eine Quelle. Was fehlt, steht hier – statt geschätzt zu werden.</p></section><section class="vs-section" id="vs-dq"><div class="vs-loading">…</div></section>');
    Promise.all([VS.getJSON("/vorsorge/data/quality.json"), VS.master(), VS.getJSON("/vorsorge/data/ucits-coverage.json").catch(function () { return null; }), VS.getJSON("/vorsorge/data/data-gaps.json").catch(function () { return null; }), VS.getJSON("/vorsorge/data/changes.json").catch(function () { return null; })]).then(function (res) {
      var q = res[0], m = res[1], u = res[2], g = res[3], chg = res[4], host = root.querySelector("#vs-dq");
      var n = function (x) { return x === null || x === undefined ? "–" : Number(x).toLocaleString("de-DE"); };
      function tbl(obj, limit) { return Object.keys(obj || {}).sort(function (a, b) { return obj[b] - obj[a]; }).slice(0, limit || 12).map(function (k) { return '<div class="vs-row"><span>' + esc(k) + '</span><span class="num">' + n(obj[k]) + '</span></div>'; }).join(""); }
      var ing = q.ingest || {}, rep = ing.report || {}, cat = ing.catalog || {};
      var L = q.layers || {}, P = q.priceCoverage || {};
      var tile = function (label, val, sub) { return '<div class="vs-card app"><p class="vs-label">' + label + '</p><p class="vs-kpi">' + val + '</p><p class="vs-fine">' + sub + '</p></div>'; };
      var STATUS = { ACTIVE: "aktiv", ACTIVE_WHERE_RECONSTRUCTED: "aktiv, wo rekonstruierbar", PARTIAL: "teilweise", NOT_AVAILABLE: "nicht verfügbar", NOT_CONNECTED: "nicht angebunden" };
      var SM = V.Provider.STATUS_MATRIX;
      // Datenabdeckung auf einen Blick: USA (Tiingo, SEC) und Europa (ESMA) getrennt; Fehlendes bleibt sichtbar.
      var it = q.intelligence || {}, cv = it.coverage || {}, eu = it.europe || {}, hs = it.holdings || {};
      var row = function (k, v) { return '<div class="vs-row"><span>' + k + '</span><span class="num">' + v + '</span></div>'; };
      var na = '<span class="vs-badge">nicht verfügbar</span>';
      var glance = '<div class="vs-grid g2"><div class="vs-card"><p class="vs-label">USA · Listings an US-Börsen</p>' +
        row("Listings", n(L.listings)) + row("Analysierbar (Standard + komplex)", n(it.publicUniverse)) +
        row("Mit Kursanalyse", n(P.withAnyHistory) + " · " + F.pct(P.ratio, 0)) +
        row("Mit Holdings & X-Ray (SEC N-PORT)", cv.holdings ? n(cv.holdings.count) + " · " + F.pct(cv.holdings.ratio, 0) : "–") +
        row("Mit Kostenquote (SEC-Prospekt)", cv.costs ? n(cv.costs.count) + " · " + F.pct(cv.costs.ratio, 0) : "–") +
        row("Holdings-Historie", n(hs.snapshots) + " Quartalsstände") +
        row("Kostenänderungen laut Prospekt", chg && Number.isFinite(chg.costEvents) ? n(chg.costEvents) + " Listings" : "–") +
        '<p class="vs-fine" style="margin-top:6px">Anteile bezogen auf das analysierbare Universum (Kursanalyse: alle Listings).</p></div>' +
        '<div class="vs-card"><p class="vs-label">Europa · UCITS-Anteilklassen (ESMA)</p>' +
        row("Anteilklassen", n(eu.shareClasses)) + row("UCITS-Zuordnung über ESMA-Register", n(eu.ucitsRegister) + (eu.shareClasses ? " · " + F.pct(eu.ucitsRegister / eu.shareClasses, 0) : "")) +
        row("Vertrieb in Deutschland gemeldet", n(eu.notifiedInGermany)) + row("Kursanalyse", na) + row("Holdings", na) + row("Kosten (TER / laufende Kosten)", na) +
        '<p class="vs-fine" style="margin-top:6px">Für europäische Anteilklassen ist keine frei nutzbare Kurs-, Holdings- oder Kostenquelle angebunden. <a href="#/europa">Europäische ETFs</a></p></div></div>';
      host.innerHTML =
        '<h2 style="margin-bottom:10px">Datenabdeckung auf einen Blick</h2>' + glance +
        '<div class="vs-grid g4" style="margin-top:14px">' +
        tile("Datenstand", F.date(q.asOf), "letzter Kurstag im Bestand") +
        tile("Tiingo-Ingest", ing.status === "COMPLETE" ? "vollständig" : ing.status === "PARTIAL" ? "teilweise" : "nicht gelaufen", rep.activeTickers ? n(rep.processedOk) + " von " + n(rep.activeTickers) + " aktiven Tickern" : "nur Repository-Auszug") +
        tile("Rohzeilen (ETF)", n(L.raw), cat.catalogRows ? "aus " + n(cat.catalogRows) + " Zeilen der Tiingo-Tickerliste" : "Tiingo-Tickerliste") +
        tile("Public Analysis", n(L.publicAnalysis), "Standard-Bauart, aktiv, mit Kursen") + '</div>' +
        '<div class="vs-grid g4" style="margin-top:14px">' +
        tile("Listings", n(L.listings), n(L.canonical) + " kanonische Fonds") +
        tile("Komplexe Produkte", n(L.complex), "Hebel, Short, Optionen, Krypto, Rohstoff, ETN") +
        tile("Archiv (inaktiv)", n(L.archive), "nicht gelöscht, nur ausgeblendet") +
        tile("In Prüfung", n(L.review), "Kollision, OTC, ohne Kurse/Name, unklar") + '</div>' +
        '<div class="vs-note" style="margin-top:14px">' + esc(m.scopeNote) + '</div>' +
        '<div class="vs-grid g3" style="margin-top:14px">' +
        '<div class="vs-card"><p class="vs-label">Kurshistorie</p>' + [["mit Kursreihe", P.withAnyHistory], ["≥ 1 Jahr", P.y1], ["≥ 3 Jahre", P.y3], ["≥ 5 Jahre", P.y5], ["≥ 10 Jahre", P.y10], ["mit Gesamtrendite (Ausschüttungen)", P.totalReturn]].map(function (x) { return '<div class="vs-row"><span>' + x[0] + '</span><span class="num">' + n(x[1]) + '</span></div>'; }).join("") +
        '<p class="vs-fine" style="margin-top:8px">Abdeckung: ' + F.pct(P.ratio, 1) + ' aller Listings.</p></div>' +
        '<div class="vs-card"><p class="vs-label">Produkttypen</p>' + tbl(q.productTypes) + '<p class="vs-label" style="margin-top:14px">Vorsorge-Einordnung</p>' + tbl(Object.fromEntries(Object.entries(q.retirementClasses || {}).map(function (kv) { return [VS.RETIRE[kv[0]] || kv[0], kv[1]]; }))) + '</div>' +
        '<div class="vs-card"><p class="vs-label">Bauart (prägende Strategie)</p>' + tbl(Object.fromEntries(Object.entries(q.strategies || {}).map(function (kv) { return [VS.STRATEGY[kv[0]] || kv[0], kv[1]]; })), 16) + '</div></div>' +
        '<div class="vs-grid g3" style="margin-top:14px">' +
        '<div class="vs-card"><p class="vs-label">Börsen</p>' + tbl(q.exchanges) + '</div>' +
        '<div class="vs-card"><p class="vs-label">Währungen</p>' + tbl(q.currencies) + '<p class="vs-label" style="margin-top:14px">Duplikate & Konflikte</p>' +
        '<div class="vs-row"><span>Ticker an mehreren Börsen</span><span class="num">' + n(q.duplicates.duplicateTickers.length) + '</span></div><div class="vs-row"><span>Fonds mit mehreren Listings</span><span class="num">' + n(q.duplicates.multiListingFunds.length) + '</span></div>' +
        '<div class="vs-row"><span>Identitätskonflikte</span><span class="num">' + n(q.conflicts.length) + '</span></div><div class="vs-row"><span>Recycelte Ticker (Verdacht)</span><span class="num">' + n((q.tickerReuseSuspected || []).length) + '</span></div>' +
        '<div class="vs-row"><span>Auffällige Kursreihen</span><span class="num">' + n((q.priceAnomalies || []).length) + '</span></div><div class="vs-row"><span>Ohne Name / ohne Kurse</span><span class="num">' + n(q.missingName) + ' / ' + n(q.missingPrice) + '</span></div><div class="vs-row"><span>Klassifikation unbekannt</span><span class="num">' + n(q.unknownClassification) + '</span></div></div>' +
        '<div class="vs-card"><p class="vs-label">UCITS im US-Kursdatenbestand (Tiingo)</p>' + (u ? '<div class="vs-row"><span>Tiingo-Zeilen an europäischen Börsen</span><span class="num">' + n(u.catalogEtfRowsOnEuropeanExchanges) + '</span></div><div class="vs-row"><span>davon im US-Datenbestand</span><span class="num">' + n(u.listingsOnEuropeanExchanges) + '</span></div><div class="vs-row"><span>„UCITS“ im Namen (nur US-Freiverkehr)</span><span class="num">' + n(u.listingsNamedUcits) + '</span></div><div class="vs-row"><span>Handel in EUR/GBP/CHF</span><span class="num">' + n(u.listingsInEurGbpChf) + '</span></div><div class="vs-row"><span>mit ISIN</span><span class="num">' + n(u.isinAvailable) + '</span></div><p class="vs-fine" style="margin-top:8px">' + esc(u.conclusion) + '</p>' : VS.pending("Kein UCITS-Bericht", "Noch nicht erzeugt.")) + '</div></div>' +
        intelBlock(q.intelligence, n) +
        '<div class="vs-card" style="margin-top:14px"><p class="vs-label">Quellenstrategie je Feld</p>' + (g ? '<div class="vs-table-wrap" style="margin-top:10px"><table class="vs-table" style="min-width:640px"><thead><tr><th>Feld</th><th>Primärquelle</th><th>Abdeckung</th><th>Lücke / Bedarf</th></tr></thead><tbody>' +
          g.fields.map(function (f) { return '<tr><td>' + esc(f.field) + '</td><td style="text-align:left;white-space:normal">' + esc(f.primarySource || f.tiingo) + '</td><td class="num">' + (f.coverage === null ? "–" : F.pct(f.coverage, 0)) + '</td><td style="text-align:left;white-space:normal">' + esc(f.gap || f.secondProviderNeeded) + '</td></tr>'; }).join("") + '</tbody></table></div><p class="vs-fine" style="margin-top:8px">Abdeckung bezogen auf das öffentliche Universum (Standard + Komplex) bzw. das EU-Register.</p>' : "") + '</div>';
    }).catch(function (e) { root.querySelector("#vs-dq").innerHTML = VS.pending("Datenbericht nicht erreichbar", String(e.message || e)); });
  };
})(window);
