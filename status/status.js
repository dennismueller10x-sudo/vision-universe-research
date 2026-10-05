/* Vision Universe — /status/: Systemzustand und Diagnose je Aktie.
   Dieselben Regeln wie im Terminal (core/health.js, core/diagnose.js),
   gemessen gegen die ausgelieferten Daten. DOM nur ueber textContent. */
(function () {
  "use strict";
  var Core = globalThis.VUCore || {};
  var TS = globalThis.VURealtime && globalThis.VURealtime.TradingSession;
  var LABEL = { OK: "OK", DEGRADED: "EINGESCHRÄNKT", STALE: "VERALTET", FAILED: "AUSFALL", DISABLED: "AUS",
    UNKNOWN: "UNBEKANNT", NOT_DELIVERED: "NICHT AUSGELIEFERT", WARN: "HINWEIS", SKIPPED: "–" };

  function el(tag, props, kids) {
    var n = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) { if (k === "text") n.textContent = props[k]; else n.setAttribute(k, props[k]); });
    (kids || []).forEach(function (c) { if (c) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return n;
  }
  function badge(status) { return el("span", { class: "st-badge st-" + status, text: LABEL[status] || status }); }
  async function load(path) {
    var r = await fetch(path, { cache: "no-store", credentials: "same-origin" });
    if (!r.ok) throw new Error("HTTP " + r.status + " " + path);
    return r.json();
  }
  function stand(d) {
    if (d.asOf) return d.asOf;
    if (!d.lastUpdate) return "–";
    return new Date(d.lastUpdate).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  var calendar = null;
  function lagSessions(date, expected) {
    if (!date || !expected || !TS || !calendar) return null;
    if (date >= expected) return 0;
    var d = date, n = 0;
    while (d < expected && n < 60) { d = TS.nextTradingDay(d, { calendar: calendar }); if (!d) return null; n++; }
    return n;
  }

  async function health() {
    var overall = document.getElementById("overall");
    var body = document.querySelector("#systems tbody");
    body.textContent = "";
    try {
      var reg = await load("/core/registry/domains.json");
      calendar = await load("/quant/config/market-calendar.json").catch(function () { return null; });
      var artifacts = {};
      await Promise.all(reg.domains.map(function (d) {
        if (d.repositoryOnly) return null;
        return load(d.artifact).then(function (data) { artifacts[d.artifact] = { ok: true, data: data }; },
                                      function (e) { artifacts[d.artifact] = { ok: false, error: e.message }; });
      }));
      var report = Core.Health.evaluate(reg, artifacts, { now: new Date(), calendar: calendar, tradingSession: TS, target: "site" });
      overall.textContent = "";
      overall.append("Gesamt: ", badge(report.overall),
        report.market ? " · Markt " + (report.market.state === "OPEN" ? "offen" : "geschlossen") + " · letzte Sitzung " + report.market.lastCompletedSession : "");
      report.domains.forEach(function (d) {
        var befund = [d.reason].concat(d.warnings).filter(Boolean).join(" · ");
        var rec = d.records === null || d.records === undefined ? "–" : String(d.records) + (d.expectedRecords ? " / " + d.expectedRecords : "");
        var cell = function (label, text) { var c = el("td", { "data-label": label, text: text }); if (text === "–") c.setAttribute("data-empty", ""); return c; };
        body.appendChild(el("tr", {}, [
          el("td", {}, [el("strong", { text: d.label }), el("small", { text: (d.workflow || d.producer || "") })]),
          el("td", {}, [badge(d.status)]),
          cell("Stand", stand(d) + (d.lagSessions ? " (" + d.lagSessions + " Sitz. zurück)" : "")),
          cell("Erwartet", d.expected || "–"),
          cell("Datensätze", rec),
          cell("Befund", befund || "–")
        ]));
      });
    } catch (e) {
      overall.textContent = "Systemzustand derzeit nicht messbar (" + e.message + "). ";
      var retry = el("button", { type: "button", text: "Erneut prüfen" });
      retry.addEventListener("click", health);
      overall.appendChild(retry);
    }
  }

  async function diagnose(ticker) {
    var out = document.getElementById("diag-out");
    out.textContent = "Prüfe " + ticker + " …";
    try {
      if (!calendar) calendar = await load("/quant/config/market-calendar.json").catch(function () { return null; });
      var lage = TS && calendar ? TS.resolve(new Date(), { calendar: calendar }) : null;
      var d = await Core.Diagnose.diagnose(ticker, { load: load, lagSessions: lagSessions,
        expectedSession: lage && lage.lastCompletedSession ? lage.lastCompletedSession.sessionDate : null,
        marketState: lage ? lage.marketState : null });
      out.textContent = "";
      out.appendChild(el("p", {}, [el("strong", { text: d.ticker + " " }), badge(d.status)]));
      out.appendChild(el("ol", { class: "st-steps" }, d.steps.map(function (s) {
        return el("li", {}, [badge(s.status), " ", el("strong", { text: s.label }), s.detail ? el("small", { text: s.detail }) : null]);
      })));
      if (d.likelyCause) out.appendChild(el("div", { class: "st-cause" }, [
        el("p", {}, [el("strong", { text: "Wahrscheinliche Ursache: " }), d.likelyCause]),
        d.suggestedRepair ? el("p", {}, [el("strong", { text: "Vorgeschlagene Reparatur: " }), d.suggestedRepair]) : null]));
    } catch (e) {
      out.textContent = "Diagnose nicht möglich: " + e.message;
    }
  }

  function fromHash() {
    var m = location.hash.match(/^#\/([A-Za-z0-9.\-\/]{1,24})$/);
    if (m) { document.getElementById("ticker").value = m[1].toUpperCase(); diagnose(m[1].toUpperCase()); }
  }
  document.getElementById("diag-form").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var t = document.getElementById("ticker").value.trim().toUpperCase();
    if (!t) return;
    if (location.hash !== "#/" + t) location.hash = "#/" + t; else diagnose(t);
  });
  window.addEventListener("hashchange", fromHash);
  if (!Core.Health || !Core.Diagnose) {
    document.getElementById("overall").textContent = "Prüfmodule nicht geladen.";
    return;
  }
  health();
  fromHash();
})();
