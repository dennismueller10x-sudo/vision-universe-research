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
  VS.views.foerderung = function () {
    var root = VS.render('<section class="vs-hero"><p class="vs-eyebrow">Förderung</p><h1>Was legt der Staat dazu?</h1><p class="vs-lead">Zulagen für das geförderte Altersvorsorgedepot ab 2027 – gerechnet aus einem versionierten Regelwerk mit Quelle. Altersvorsorge-Angebote der Anbieter vergleichst du im Anbieter-Vergleich.</p>' +
      '<div class="vs-tabs"><a class="vs-pill primary" href="#/foerderung">Förderrechner</a><a class="vs-pill" href="#/fruehstart">Frühstart / Kinder</a><a class="vs-pill" href="#/riester">Riester-Analyse</a><a class="vs-pill" href="#/anbieter">Anbieter-Vergleich</a></div></section>' +
      '<section class="vs-section" id="vs-fd"><div class="vs-loading">Regelwerk wird geladen …</div></section>');
    VS.rules().then(function (rules) {
      var today = new Date().toISOString().slice(0, 10);
      var avd = Fd.selectRule(rules, "DE-ALTERSVORSORGEDEPOT", today < "2027-01-01" ? "2027-01-01" : today);
      var host = root.querySelector("#vs-fd");
      if (!avd) { host.innerHTML = VS.pending("Kein gültiges Regelwerk", "Für den Stichtag liegt keine geprüfte Regeldatei vor."); return; }
      host.innerHTML = '<div class="vs-grid side"><form class="vs-card app" id="vs-fd-form"><p class="vs-label">Deine Angaben</p><div class="vs-form" style="margin-top:12px">' +
        VS.field("own", "Eigenbeitrag pro Jahr", 1200, { min: 0, unit: "€ / Jahr" }) + VS.field("age", "Alter bei Vertragsbeginn", VS.state.plan.age, { min: 16, max: 80, unit: "Jahre" }) +
        VS.field("kids", "Kinder mit Kindergeld", 0, { min: 0, max: 10, unit: "Anzahl" }) + VS.field("years", "Einzahljahre", Math.max(1, VS.state.plan.targetAge - VS.state.plan.age), { min: 1, max: 60, unit: "Jahre" }) +
        VS.field("ret", "Rendite vor Kosten", (VS.state.plan.returns.basis * 100).toFixed(1), { step: 0.5, unit: "% p.a." }) + VS.field("cost", "Produktkosten", "0.50", { step: 0.05, unit: "% p.a." }) +
        '<label class="vs-check vs-field full"><input type="checkbox" id="first" checked> Erster geförderter Vertrag (Berufseinsteigerbonus prüfen)</label>' +
        '<label class="vs-check vs-field full"><input type="checkbox" id="spouse"> Nur mittelbar zulageberechtigt (Ehegatte, § 79 Satz 2)</label></div></form><div id="vs-fd-out"></div></div>' +
        '<div class="vs-grid g3" style="margin-top:14px"><div class="vs-card"><p class="vs-label">Was darf ins Altersvorsorgedepot?</p><p style="margin-top:6px">' + esc(avd.contributionRules.eligibleAssets) + '</p><p class="vs-fine" style="margin-top:8px">Die ETFs in „ETF Intelligence“ sind derzeit US-Listings und damit dort nicht zulässig. Sie zeigen Marktverhalten, keine förderfähigen Produkte.</p></div>' +
        '<div class="vs-card"><p class="vs-label">Kostendeckel Standarddepot</p><p class="vs-kpi small" style="margin-top:6px">höchstens ' + F.pct(avd.productRules.standardDepotCostCap, 1) + ' Effektivkosten</p><p class="vs-fine" style="margin-top:8px">' + esc(avd.productRules.standardDepot) + '</p></div>' +
        '<div class="vs-card"><p class="vs-label">Auszahlung</p><p style="margin-top:6px">Beginn frühestens mit ' + avd.payoutRules.earliestAge + ', spätestens mit ' + avd.payoutRules.latestStartAge + '. Ein Auszahlungsplan läuft mindestens bis ' + avd.payoutRules.withdrawalPlanUntilAtLeastAge + '.</p><p class="vs-fine" style="margin-top:8px">Bestehende Riester-Verträge behalten ihr altes Recht; ein neuer geförderter Vertrag ab 2027 bringt alle Verträge ins neue Recht (§ 52 Abs. 50a EStG).</p></div></div>' +
        '<div style="margin-top:14px">' + ruleBox(avd) + '</div>' +
        '<div class="' + (avd.verification && avd.verification.primaryVerified ? "vs-note" : "vs-warnbox") + '" style="margin-top:14px">' + esc(avd.legalStatusNote) + '</div>';
      var form = host.querySelector("#vs-fd-form");
      function draw() {
        var n = function (id, f, s) { return VS.readNum(form, id, f, s); };
        var kids = Math.max(0, Math.round(n("kids", 0))), children = []; for (var i = 0; i < kids; i++) children.push({ hasChildBenefit: true });
        var r = Fd.altersvorsorgedepot(avd, { ownContribution: n("own", 0), age: n("age", 30), children: children, firstContract: form.querySelector("#first").checked, indirectSpouse: form.querySelector("#spouse").checked });
        var years = n("years", 30), ret = n("ret", 5, 0.01), cost = n("cost", 0.5, 0.01);
        var yearly = r.basicAllowance + r.childAllowance;
        var withF = M.futureValue({ start: r.careerStarterBonus, monthly: (r.ownContribution + yearly) / 12, years: years, annualReturn: ret, annualCost: cost }).nominal;
        var without = M.futureValue({ monthly: r.ownContribution / 12, years: years, annualReturn: ret, annualCost: cost }).nominal;
        host.querySelector("#vs-fd-out").innerHTML = '<div class="vs-card">' + (r.eligible ? "" : '<div class="vs-warnbox">' + esc(r.reason) + '</div>') +
          '<div class="vs-grid g3" style="margin-top:6px"><div><p class="vs-sub">Grundzulage</p><p class="vs-kpi">' + F.eur(r.basicAllowance) + '</p><p class="vs-fine">pro Jahr</p></div>' +
          '<div><p class="vs-sub">Kinderzulage</p><p class="vs-kpi">' + F.eur(r.childAllowance) + '</p><p class="vs-fine">pro Jahr</p></div>' +
          '<div><p class="vs-sub">Berufseinsteigerbonus</p><p class="vs-kpi">' + F.eur(r.careerStarterBonus) + '</p><p class="vs-fine">einmalig</p></div></div>' +
          '<div class="vs-row" style="margin-top:14px"><span>Förderquote auf deinen Eigenbeitrag</span><span class="num">' + F.pct(r.fundingRate || 0, 0) + '</span></div>' +
          '<div class="vs-row"><span>Gefördert bis Eigenbeitrag</span><span class="num">' + F.eur(avd.contributionRules.maximumSubsidizedOwnContribution) + ' / Jahr</span></div>' +
          '<div class="vs-row"><span>Mindesteigenbeitrag</span><span class="num">' + F.eur(avd.contributionRules.minimumAnnualOwnContribution) + ' / Jahr</span></div>' +
          '<h3 style="margin-top:18px">Nach ' + years + ' Jahren (Modellrechnung)</h3><div class="vs-grid g2" style="margin-top:8px"><div class="vs-card soft"><p class="vs-label">Mit Zulagen</p><p class="vs-kpi small">' + F.eurK(withF) + '</p></div><div class="vs-card soft"><p class="vs-label">Gleicher Eigenbeitrag ohne Zulagen</p><p class="vs-kpi small">' + F.eurK(without) + '</p></div></div>' +
          '<p class="vs-fine" style="margin-top:10px">Zulagen als gleichmäßige Monatsbeiträge modelliert, Regeln über die Laufzeit konstant. Steuerliche Wirkung (Sonderausgabenabzug, nachgelagerte Besteuerung) ist nicht modelliert – keine Steuerberatung.</p></div>';
      }
      form.addEventListener("input", draw); form.addEventListener("submit", function (e) { e.preventDefault(); }); draw();
    }).catch(function (e) { root.querySelector("#vs-fd").innerHTML = VS.pending("Regelwerk nicht erreichbar", String(e.message || e)); });
  };

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
  VS.views.vergleichen = function () {
    VS.render('<section class="vs-hero"><p class="vs-eyebrow">Vergleichen</p><h1>Was unterscheidet sich –<br>und was kostet es?</h1><p class="vs-lead">Vergleiche ETFs, Kosten, Anbieter und bestehende Verträge. Ohne Gewinner-Logik.</p></section>' +
      '<section class="vs-section"><div class="vs-grid g2">' + [["#/vergleich", "1", "ETF-Vergleich", "2–4 ETFs: Performance, Schwankung, Rückgang, Index, Region – und die größten Unterschiede."],
        ["#/kosten", "2", "Kostenanalyse", "Was 0,2 % gegenüber 1,5 % laufender Kosten über Jahrzehnte ausmacht."],
        ["#/anbieter", "3", "Anbieter-Vergleich", "Altersvorsorge-Angebote: Depotgebühr, Auswahl, Effektivkosten, Auszahlung."],
        ["#/riester", "4", "Riester-Analyse", "Bestehenden Vertrag behalten oder neu ausrichten – zwei Szenarien."]].map(function (c) {
        return '<a class="vs-card link" href="' + c[0] + '"><span class="vs-num-badge">' + c[1] + '</span><h3>' + esc(c[2]) + '</h3><p class="vs-sub" style="margin-top:6px">' + esc(c[3]) + '</p></a>';
      }).join("") + '</div></section>');
  };

  /* ================================================================ WISSEN */
  var GLOSSARY = [
    ["ETF", "Ein börsengehandelter Fonds. Er bündelt viele Wertpapiere – oft nach einem Index wie dem MSCI World – und lässt sich wie eine Aktie kaufen."],
    ["Index", "Eine Liste von Unternehmen nach festen Regeln, z. B. die 500 größten US-Firmen (S&P 500). Ein Index-ETF bildet sie nach."],
    ["TER (laufende Kosten)", "Die jährlichen Kosten eines Fonds in Prozent des Vermögens. Sie werden still aus dem Fonds entnommen – du siehst sie nur in der Rendite."],
    ["Effektivkosten", "Alle Kosten eines Vorsorgeprodukts zusammen (Fonds, Depot, Vertrieb, Versicherung), angegeben als Renditeminderung pro Jahr im Basisinformationsblatt."],
    ["Thesaurierend / Ausschüttend", "Thesaurierende ETFs legen Erträge automatisch wieder an, ausschüttende zahlen sie aus."],
    ["Kursentwicklung vs. Gesamtrendite", "Die Kursentwicklung zeigt nur den Preis. Die Gesamtrendite enthält zusätzlich die Ausschüttungen. Wir nennen eine Gesamtrendite nur, wenn Dividenden korrekt in den Daten enthalten sind."],
    ["Schwankung (Volatilität)", "Wie stark sich der Kurs typischerweise innerhalb eines Jahres bewegt. 15 % heißt grob: In vielen Jahren liegt das Ergebnis ±15 % um den Durchschnitt."],
    ["Größter Rückgang (Max. Drawdown)", "Der stärkste Verlust vom Höchststand bis zum Tiefpunkt in der Vergangenheit – und wie lange es dauerte, bis das alte Hoch wieder erreicht war."],
    ["Zinseszins", "Erträge erwirtschaften selbst wieder Erträge. Deshalb wirken Zeit und Kosten über Jahrzehnte so stark."],
    ["Inflation & Kaufkraft", "Bei 2 % Inflation ist 1 € in 30 Jahren nur noch rund 55 Cent wert. Deshalb zeigen wir Endwerte auch in heutiger Kaufkraft."],
    ["Vorsorgelücke", "Die Differenz zwischen dem Einkommen, das du im Alter möchtest, und dem, was du aus Rente und anderen Quellen erwartest."],
    ["Overlap", "Wie stark sich zwei ETFs überschneiden. Wer MSCI World und S&P 500 kombiniert, besitzt viele US-Unternehmen doppelt."],
    ["Hebel- und Short-ETFs", "Sie bilden die doppelte oder umgekehrte tägliche Bewegung ab. Über längere Zeit weicht das Ergebnis stark ab – für die Vorsorge nicht gedacht."],
    ["UCITS", "EU-Regelwerk für Fonds. Privatanleger in der EU kaufen in der Regel UCITS-ETFs; US-ETFs sind meist nicht handelbar, weil ein Basisinformationsblatt fehlt."],
    ["Altersvorsorgedepot", "Ein ab 2027 geplantes, staatlich gefördertes Depot für die private Altersvorsorge – ein Produkt von Banken und Brokern, das Vision Universe analysiert, nicht anbietet."]
  ];
  VS.views.wissen = function () {
    VS.render('<section class="vs-hero"><p class="vs-eyebrow">Wissen</p><h1>Vorsorge,<br>einfach erklärt.</h1><p class="vs-lead">Die wichtigsten Begriffe in einem Satz. Ohne Fachchinesisch.</p><div class="vs-tabs"><a class="vs-pill" href="/academy/">Zur Vision Universe Academy</a><a class="vs-pill" href="#/daten">Datenquellen & Qualität</a></div></section>' +
      '<section class="vs-section"><div class="vs-grid g3">' + GLOSSARY.map(function (g, i) { return '<article class="vs-card"><span class="vs-num-badge">' + (i + 1) + '</span><h3>' + esc(g[0]) + '</h3><p class="vs-sub" style="margin-top:6px;color:var(--ink-2)">' + esc(g[1]) + '</p></article>'; }).join("") + '</div></section>');
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
    var root = VS.render('<section class="vs-hero"><p class="vs-eyebrow">Datenquellen & Datenqualität</p><h1>Was wir wissen –<br>und was nicht.</h1><p class="vs-lead">Jede Zahl in Vision Universe Altersvorsorge hat eine Quelle. Was fehlt, steht hier – statt geschätzt zu werden.</p></section><section class="vs-section" id="vs-dq"><div class="vs-loading">…</div></section>');
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
        '<div class="vs-card"><p class="vs-label">UCITS (gemessen)</p>' + (u ? '<div class="vs-row"><span>ETF-Zeilen an europäischen Börsen (Tiingo-Liste)</span><span class="num">' + n(u.catalogEtfRowsOnEuropeanExchanges) + '</span></div><div class="vs-row"><span>Listings an europäischen Börsen</span><span class="num">' + n(u.listingsOnEuropeanExchanges) + '</span></div><div class="vs-row"><span>„UCITS“ im Namen (nur US-Freiverkehr)</span><span class="num">' + n(u.listingsNamedUcits) + '</span></div><div class="vs-row"><span>Handel in EUR/GBP/CHF</span><span class="num">' + n(u.listingsInEurGbpChf) + '</span></div><div class="vs-row"><span>mit ISIN</span><span class="num">' + n(u.isinAvailable) + '</span></div><p class="vs-fine" style="margin-top:8px">' + esc(u.conclusion) + '</p>' : VS.pending("Kein UCITS-Bericht", "Noch nicht erzeugt.")) + '</div></div>' +
        intelBlock(q.intelligence, n) +
        '<div class="vs-card" style="margin-top:14px"><p class="vs-label">Quellenstrategie je Feld</p>' + (g ? '<div class="vs-table-wrap" style="margin-top:10px"><table class="vs-table" style="min-width:640px"><thead><tr><th>Feld</th><th>Primärquelle</th><th>Abdeckung</th><th>Lücke / Bedarf</th></tr></thead><tbody>' +
          g.fields.map(function (f) { return '<tr><td>' + esc(f.field) + '</td><td style="text-align:left;white-space:normal">' + esc(f.primarySource || f.tiingo) + '</td><td class="num">' + (f.coverage === null ? "–" : F.pct(f.coverage, 0)) + '</td><td style="text-align:left;white-space:normal">' + esc(f.gap || f.secondProviderNeeded) + '</td></tr>'; }).join("") + '</tbody></table></div><p class="vs-fine" style="margin-top:8px">Abdeckung bezogen auf das öffentliche Universum (Standard + Komplex) bzw. das EU-Register.</p>' : "") + '</div>';
    }).catch(function (e) { root.querySelector("#vs-dq").innerHTML = VS.pending("Datenbericht nicht erreichbar", String(e.message || e)); });
  };
})(window);
