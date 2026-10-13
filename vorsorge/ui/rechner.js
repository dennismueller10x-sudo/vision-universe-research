/* =========================================================================
   VISION UNIVERSE® VORSORGE — ui/rechner.js
   Gefuehrter Altersvorsorge-Rechner: eine Frage pro Bildschirm.
   Alter -> Einkommen -> Kinder -> Sparrate (live) -> Annahmen -> Ergebnis.
   Rechenkern: engines/rechner.js (Zulagen aus der Regeldatei, Steuersatz
   aus data/steuer-annahmen.json, Renditen aus dem Plan).
   ========================================================================= */
(function (global) {
  "use strict";
  var VS = global.VS, V = global.VUVorsorge, R = V.Rechner, Fd = V.Funding, F = VS.fmt, esc = VS.esc;

  var STEPS = ["start", "alter", "einkommen", "kinder", "sparen", "annahmen", "ergebnis"];
  var THIS_YEAR = new Date().getFullYear();
  var REF_YEAR = Math.max(2027, THIS_YEAR);

  function wiz() {
    var w = VS.state.rechner || {};
    return (VS.state.rechner = { birthYear: w.birthYear || null, band: w.band || null, kids: Array.isArray(w.kids) ? w.kids : null, monthly: w.monthly || 150, confirmed: !!w.confirmed });
  }
  var loaded = null;
  function load() {
    if (loaded) return loaded;
    loaded = Promise.all([VS.rules(), VS.getJSON("/vorsorge/data/steuer-annahmen.json")]).then(function (r) {
      var rules = Fd.selectRule(r[0], "DE-ALTERSVORSORGEDEPOT", new Date().toISOString().slice(0, 10) < "2027-01-01" ? "2027-01-01" : new Date().toISOString().slice(0, 10));
      if (!rules) throw new Error("Kein gültiges Regelwerk für den Stichtag.");
      return { rules: rules, assumptions: r[1] };
    });
    loaded.catch(function () { loaded = null; });
    return loaded;
  }
  function calc(d) {
    var w = wiz();
    return R.calculate({ birthYear: w.birthYear, band: w.band, children: (w.kids || []).map(function (y) { return { birthYear: y }; }), monthly: w.monthly },
      { rules: d.rules, assumptions: d.assumptions, plan: VS.state.plan, referenceYear: REF_YEAR, targetAge: VS.state.plan.targetAge });
  }

  /* ----------------------------------------------------------- Gerüst */
  function shell(step, title, body, opts) {
    opts = opts || {};
    var i = STEPS.indexOf(step), prev = STEPS[i - 1];
    var dots = STEPS.slice(1, -1).map(function (s, k) { return '<i class="' + (k < i ? "on" : "") + '"></i>'; }).join("");
    return VS.render('<section class="vr" data-step="' + step + '"><div class="vr-top">' +
      (prev ? '<a class="vr-back" href="#/rechner/' + (prev === "start" ? "" : prev) + '" aria-label="Zurück">←</a>' : '<span></span>') +
      (step !== "start" && step !== "ergebnis" ? '<div class="vr-dots" role="img" aria-label="Schritt ' + (i) + ' von ' + (STEPS.length - 2) + '">' + dots + '</div>' : '<span></span>') +
      '<span></span></div>' +
      '<h1 class="vr-q">' + title + '</h1>' + body + '</section>', opts);
  }
  function pills(items, selected) {
    return '<div class="vr-opts">' + items.map(function (x) {
      return '<button type="button" class="vr-opt" data-v="' + esc(x[0]) + '"' + (String(x[0]) === String(selected) ? ' aria-pressed="true"' : "") + '>' + esc(x[1]) + '</button>'; }).join("") + '</div>';
  }
  function go(step) { VS.go("#/rechner/" + (step === "start" ? "" : step)); }
  function next(step) { return STEPS[STEPS.indexOf(step) + 1]; }
  function useDisclaimer() { return '<p class="vs-fine vr-fine">Modellrechnung mit Annahmen, keine Anlage- oder Steuerberatung und keine Garantie. Vision Universe ist kein Anbieter: Wir verwahren kein Kapital.</p>'; }

  /* ------------------------------------------------------------ Schritte */
  var views = {
    start: function () {
      var w = wiz();
      shell("start", "Das Altersvorsorgedepot",
        '<ul class="vr-list"><li><b>€</b>Bis zu 540 € pro Jahr vom Staat</li><li><b>%</b>Mögliche Steuerersparnis jedes Jahr</li><li><b>↗</b>Steuerfrei wachsen bis zur Rente</li></ul>' +
        '<p class="vs-sub vr-lead">Sechs kurze Fragen. Dann siehst du, was der Staat dazulegt und was daraus bis zur Rente werden kann.</p>' +
        '<div class="vr-actions"><a class="vs-pill primary vr-go" href="#/rechner/alter">' + (w.birthYear ? "Neu starten" : "Los geht's") + '</a>' +
        (w.birthYear && w.band ? '<a class="vs-pill" href="#/rechner/ergebnis">Letztes Ergebnis ansehen</a>' : "") + '</div>' +
        '<p class="vs-fine vr-fine">Zulagen nach dem Altersvorsorgereformgesetz (BGBl. 2026 I Nr. 156), gültig ab 1. Januar 2027. <a href="#/foerderung">Regeln & Quellen</a></p>');
    },
    alter: function () {
      var w = wiz();
      var root = shell("alter", "In welchem Jahr wurdest du geboren?",
        '<form class="vr-form" novalidate><input id="vr-year" class="vr-input" type="text" inputmode="numeric" autocomplete="bday-year" maxlength="4" placeholder="1990" value="' + esc(w.birthYear || "") + '" aria-label="Geburtsjahr">' +
        '<p class="vr-err" id="vr-err" role="alert" hidden></p><button class="vs-pill primary vr-go" type="submit">Weiter →</button></form>');
      var form = root.querySelector("form"), input = root.querySelector("#vr-year"), err = root.querySelector("#vr-err");
      input.focus();
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var y = parseInt(input.value, 10), age = REF_YEAR - y;
        if (!(y >= 1900 && y <= THIS_YEAR) || age < 16) { err.textContent = age < 16 && y <= THIS_YEAR ? "Ein eigener geförderter Vertrag ist ab 16 Jahren vorgesehen." : "Bitte gib ein Geburtsjahr zwischen 1900 und " + (THIS_YEAR - 16) + " ein."; err.hidden = false; return; }
        if (age >= VS.state.plan.targetAge) { err.textContent = "Mit " + age + " Jahren liegt der Rentenbeginn (" + VS.state.plan.targetAge + ") schon hinter dir. Der Planer rechnet auch andere Fälle."; err.hidden = false; return; }
        wiz().birthYear = y; VS.save(); VS.analytics.track("rechner_step", { step: "alter" }); go("einkommen");
      });
    },
    einkommen: function () {
      var w = wiz();
      shell("einkommen", "Wie hoch ist dein Jahresbruttoeinkommen?", '<div class="vr-opts vr-opts--col" id="vr-bands"><div class="vs-loading">…</div></div><p class="vs-fine vr-fine">Wir nutzen das nur, um deinen möglichen Steuervorteil zu schätzen. Es verlässt diesen Browser nicht.</p>');
      load().then(function (d) {
        var host = VS.root().querySelector("#vr-bands");
        host.innerHTML = d.assumptions.bands.map(function (b) { return '<button type="button" class="vr-opt" data-v="' + esc(b.id) + '"' + (b.id === w.band ? ' aria-pressed="true"' : "") + '>' + esc(b.label) + '</button>'; }).join("");
        host.addEventListener("click", function (e) {
          var b = e.target.closest(".vr-opt"); if (!b) return;
          wiz().band = b.getAttribute("data-v"); VS.save(); VS.analytics.track("rechner_step", { step: "einkommen" }); go("kinder");
        });
      }).catch(function (e) { VS.root().querySelector("#vr-bands").innerHTML = VS.pending("Regelwerk nicht erreichbar", String(e.message || e)); });
    },
    kinder: function (root, r) {
      var w = wiz(), idx = parseInt(r.args[1], 10);
      if (isFinite(idx) && w.kids && idx >= 1 && idx <= w.kids.length) return kidYear(idx);
      var n = w.kids ? w.kids.length : null;
      root = shell("kinder", "Wie viele Kinder hast du?", pills([[0, "Keine"], [1, "1"], [2, "2"], [3, "3"], ["more", "…"]], n === null ? null : (n > 3 ? "more" : n)) +
        '<form class="vr-form vr-more" hidden novalidate><input id="vr-n" class="vr-input" type="text" inputmode="numeric" maxlength="2" placeholder="Anzahl" aria-label="Anzahl Kinder"><button class="vs-pill primary vr-go" type="submit">Weiter →</button></form>' +
        '<p class="vs-fine vr-fine">Für Kinder mit Kindergeldanspruch gibt es bis zu 300 € Kinderzulage pro Kind und Jahr.</p>');
      function set(count) {
        count = Math.max(0, Math.min(10, count));
        var kids = (wiz().kids || []).slice(0, count); while (kids.length < count) kids.push(null);
        wiz().kids = kids; VS.save(); VS.analytics.track("rechner_step", { step: "kinder" });
        go(count ? "kinder/1" : "sparen");
      }
      root.querySelector(".vr-opts").addEventListener("click", function (e) {
        var b = e.target.closest(".vr-opt"); if (!b) return;
        if (b.getAttribute("data-v") === "more") { var f = root.querySelector(".vr-more"); f.hidden = false; f.querySelector("input").focus(); return; }
        set(parseInt(b.getAttribute("data-v"), 10));
      });
      root.querySelector(".vr-more").addEventListener("submit", function (e) { e.preventDefault(); var v = parseInt(root.querySelector("#vr-n").value, 10); if (isFinite(v)) set(v); });
    },
    sparen: function () {
      var w = wiz();
      var root = shell("sparen", "Wie viel möchtest du jeden Monat sparen?",
        '<div class="vr-live" aria-live="polite"><div class="vr-wealth"><p class="vs-label" id="vr-wl"></p><p class="vr-big" id="vr-wv">…</p><p class="vs-sub" id="vr-wr"></p></div>' +
        '<div class="vr-bars" id="vr-bars" aria-hidden="true"></div><div class="vr-axis"><span>Heute</span><span id="vr-end"></span></div></div>' +
        '<div class="vr-card"><p class="vr-amount" id="vr-amt"></p><p class="vr-state" id="vr-gov"></p>' +
        '<input id="vr-slider" class="vr-slider" type="range" min="10" max="300" step="10" value="' + esc(w.monthly) + '" aria-label="Monatliche Sparrate in Euro">' +
        '<div class="vr-ticks"><span>10 €</span><span>300 €</span></div><p class="vs-fine" id="vr-limit" style="text-align:center;margin-top:6px"></p>' +
        '<div class="vr-actions"><a class="vs-pill primary vr-go" href="#/rechner/annahmen" id="vr-next">Weiter →</a></div></div>' + useDisclaimer());
      load().then(function (d) {
        var slider = root.querySelector("#vr-slider"), bars = root.querySelector("#vr-bars");
        function draw() {
          wiz().monthly = parseInt(slider.value, 10);
          var c = calc(d);
          root.querySelector("#vr-wl").textContent = "Vermögen mit " + c.targetAge;
          root.querySelector("#vr-wv").textContent = F.eur(c.wealth);
          root.querySelector("#vr-wr").textContent = F.eur(c.wealthRange[0]) + " – " + F.eur(c.wealthRange[1]) + " Prognose";
          root.querySelector("#vr-end").textContent = c.years + " J.";
          root.querySelector("#vr-amt").textContent = F.eur(c.monthly);
          root.querySelector("#vr-gov").innerHTML = c.eligible ? "+ " + F.eur(c.allowanceMonthly) + " vom Staat" : esc(c.reason || "");
          root.querySelector("#vr-limit").textContent = "Gefördert wird bis " + F.eur(c.subsidizedLimitMonthly) + " im Monat";
          var top = c.curve[c.curve.length - 1] || 1, step = Math.max(1, Math.ceil(c.curve.length / 28));
          bars.innerHTML = c.curve.filter(function (_, i) { return i % step === 0 || i === c.curve.length - 1; }).map(function (v) { return '<i style="height:' + Math.max(2, v / top * 100).toFixed(1) + '%"></i>'; }).join("");
          slider.style.setProperty("--p", ((slider.value - 10) / 290 * 100).toFixed(1) + "%");
        }
        slider.addEventListener("input", draw);
        slider.addEventListener("change", function () { VS.save(); });
        root.querySelector("#vr-next").addEventListener("click", function () { VS.save(); VS.analytics.track("rechner_step", { step: "sparen" }); });
        draw();
      }).catch(function (e) { root.querySelector("#vr-wv").textContent = "–"; root.querySelector("#vr-wr").innerHTML = esc(String(e.message || e)); });
    },
    annahmen: function () {
      var pl = VS.state.plan;
      var root = shell("annahmen", "Wir berechnen deine Rente",
        '<p class="vs-sub">Für die Simulation treffen wir Annahmen über die Wertentwicklung in drei Szenarien:</p>' +
        '<p class="vr-assume">Durchschnittliche jährliche Rendite <b>' + F.pct(pl.returns.basis, 1) + '</b>, optimistisches Szenario <b>' + F.pct(pl.returns.optimistisch, 1) + '</b>, konservatives Szenario <b>' + F.pct(pl.returns.konservativ, 1) + '</b>, jeweils vor Kosten. Laufende Kosten ' + F.pct(pl.cost, 2) + ' p.a., Inflation ' + F.pct(pl.inflation, 1) + ' p.a. für die reale Betrachtung.</p>' +
        '<p class="vs-sub"><b style="color:var(--ink)">Prognosen</b> und Simulationen sind kein zuverlässiger Indikator für zukünftige Wertentwicklungen. Investments bergen Risiken, auch Verluste sind möglich.</p>' +
        '<p class="vs-fine">Die Annahmen kannst du im <a href="#/plan">Planer</a> ändern.</p>' +
        '<div class="vr-actions"><button type="button" class="vs-pill primary vr-go" id="vr-ok">Bestätigen ✓</button></div>');
      root.querySelector("#vr-ok").addEventListener("click", function () { wiz().confirmed = true; VS.save(); VS.analytics.track("rechner_step", { step: "annahmen" }); go("ergebnis"); });
    },
    ergebnis: function () {
      var w = wiz();
      if (!w.birthYear || !w.band || !w.kids || w.kids.indexOf(null) >= 0) { go(!w.birthYear ? "alter" : !w.band ? "einkommen" : "kinder"); return; }
      var root = shell("ergebnis", "Super! Du bekommst bis zu:", '<div class="vs-loading">…</div>');
      load().then(function (d) {
        var c = calc(d), kidsInfo = c.children.filter(function (k) { return !k.hasChildBenefit; }).length;
        root.querySelector(".vs-loading").outerHTML =
          (c.eligible ? "" : '<div class="vs-warnbox">' + esc(c.reason) + '</div>') +
          '<p class="vr-big vr-gold">' + F.eur(c.totalPerYear) + '</p><p class="vr-cap">Gesamt pro Jahr</p>' +
          '<p class="vr-mid">' + F.eur(c.allowance) + '</p><p class="vr-cap">Förderung' + (c.careerStarterBonus ? ' <span class="vs-fine">(zzgl. ' + F.eur(c.careerStarterBonus) + ' Berufseinsteigerbonus einmalig)</span>' : "") + '</p>' +
          '<p class="vr-mid">' + (c.taxBenefit === null ? "–" : F.eur(c.taxBenefit)) + '</p><p class="vr-cap">Möglicher Steuervorteil</p>' +
          (c.taxBenefit === 0 ? '<p class="vs-fine">Bei deinem Steuersatz ist die Zulage günstiger als der Steuerabzug – dann bleibt es bei der Zulage (Günstigerprüfung).</p>' : "") +
          (kidsInfo ? '<p class="vs-fine">' + kidsInfo + (kidsInfo === 1 ? " Kind" : " Kinder") + " ohne Kindergeldanspruch am 1.1." + REF_YEAR + " (volljährig) bekommen keine Kinderzulage.</p>" : "") +
          '<div class="vr-card"><p class="vs-label">Bei ' + F.eur(c.monthly) + ' im Monat bis ' + c.targetAge + '</p><p class="vr-big">' + F.eur(c.wealth) + '</p>' +
          '<p class="vs-sub">Prognose zwischen ' + F.eur(c.wealthRange[0]) + ' und ' + F.eur(c.wealthRange[1]) + ' · in heutiger Kaufkraft ca. ' + F.eur(c.scenarios[1].real) + '</p>' +
          '<p class="vs-fine">Eingezahlt: ' + F.eur(c.monthly * 12 * c.years) + ' von dir, ' + F.eur(c.allowance * c.years) + ' Zulagen (konstant gerechnet). Der Steuervorteil ist nicht angelegt.</p></div>' +
          '<div class="vr-actions"><button type="button" class="vs-pill primary vr-go" id="vr-save">In meinen Plan übernehmen</button><a class="vs-pill" href="#/rechner/sparen">Sparrate ändern</a></div>' +
          '<div class="vr-links"><a href="#/foerderung">Förderregeln & Quellen</a><a href="#/kosten">Kosten vergleichen</a><a href="#/anbieter">Anbieter vergleichen</a><a href="#/rechner">Neu berechnen</a></div>' +
          '<p class="vs-fine vr-fine">Steuervorteil: Näherung mit ' + F.pct(c.tax ? c.tax.rate : 0, 0) + ' Grenzsteuersatz für deine Einkommensspanne (Annahme, keine Steuerberatung; Günstigerprüfung und nachgelagerte Besteuerung nicht modelliert). Regelstand: ' + esc(c.rule.ruleId) + ' ' + esc(c.rule.ruleVersion) + '.</p>' + useDisclaimer();
        root.querySelector("#vr-save").addEventListener("click", function (ev) {
          var pl = VS.state.plan; pl.age = c.age; pl.monthly = c.monthly + c.allowanceMonthly; VS.state.planDone = true; VS.save();
          ev.currentTarget.textContent = "✓ Übernommen – Planer und Monitor rechnen damit"; VS.analytics.track("rechner_complete", { monthly: c.monthly });
        });
      }).catch(function (e) { root.querySelector(".vs-loading").outerHTML = VS.pending("Regelwerk nicht erreichbar", String(e.message || e)); });
    }
  };

  function kidYear(idx) {
    var w = wiz(), kids = w.kids, cur = kids[idx - 1];
    var root = shell("kinder", kids.length > 1 ? "Wann wurde dein " + idx + ". Kind geboren?" : "Wann wurde dein Kind geboren?",
      '<form class="vr-form" novalidate><input id="vr-ky" class="vr-input" type="text" inputmode="numeric" maxlength="4" placeholder="2015" value="' + esc(cur || "") + '" aria-label="Geburtsjahr des Kindes"><p class="vr-err" id="vr-err" role="alert" hidden></p><button class="vs-pill primary vr-go" type="submit">Weiter →</button></form>');
    root.querySelector("#vr-ky").focus();
    root.querySelector("form").addEventListener("submit", function (e) {
      e.preventDefault();
      var y = parseInt(root.querySelector("#vr-ky").value, 10), err = root.querySelector("#vr-err");
      if (!(y >= 1990 && y <= THIS_YEAR)) { err.textContent = "Bitte gib ein Geburtsjahr zwischen 1990 und " + THIS_YEAR + " ein."; err.hidden = false; return; }
      kids[idx - 1] = y; VS.save();
      go(idx < kids.length ? "kinder/" + (idx + 1) : "sparen");
    });
  }

  VS.views.rechner = function (r) {
    var step = STEPS.indexOf(r.args[0]) >= 0 ? r.args[0] : "start";
    views[step](null, r);
    var h = VS.root().querySelector(".vr-q"); if (h) { h.setAttribute("tabindex", "-1"); }
  };
})(window);
