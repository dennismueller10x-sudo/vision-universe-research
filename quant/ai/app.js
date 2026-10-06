/* Vision Universe Quant — Ask Vision Universe (/quant/ai).

   Der Ablauf ist die eigentliche Aussage dieser Seite (§51, §52, §54):

     1  Der Nutzer schreibt einen Satz.
     2  Die AI zeigt, WIE sie ihn verstanden hat — vor jeder Ausfuehrung.
     3  Der strukturierte Ausdruck durchlaeuft die Schema-Validierung.
     4  Ausgefuehrt wird ausschliesslich ueber registrierte Werkzeuge.
     5  Die Antwort entsteht aus den Werkzeugergebnissen. Liegt keines vor,
        lautet sie "keine Daten" — nicht eine plausibel klingende Zahl. */
(function () {
  "use strict";
  var S = window.QuantShell, C = window.QuantComponents, el = S.el;
  var Api = window.QuantApi, AiProvider = window.VUAiProvider, AiTools = window.VUAiTools,
      Query = window.VUQuery, VUQL = window.VUQL, Strategy = window.VUStrategy;

  var ai = AiProvider.createMockAiProvider();
  var registry = null;
  var turns = [];
  var lastStrategyDefinition = null;

  var SUGGESTIONS = [
    "Zeige mir profitable Tech-Aktien mit starkem Momentum, die maximal 3 % unter dem 52-Wochen-Hoch stehen",
    "Welche Unternehmen haben sich im letzten Monat quantitativ am staerksten verbessert?",
    "Baue mir eine Strategie mit viel Quality und Momentum, aber wenig Volatilitaet",
    "Was waere passiert, wenn ich seit 2011 die 20 Aktien mit positivem Free Cash Flow und starkem Momentum gehalten haette?",
    "Was hat sich in meiner Watchlist veraendert?",
    "Wie wird der VU Quant Score berechnet?"
  ];

  S.page({
    nav: S.BASE + "ai/",
    need: ["securities"],
    render: function (data, root) {
      registry = AiTools.createToolRegistry(buildAccess());

      root.appendChild(header(data));
      var askMount = el("div", { style: "margin:22px 0 8px" });
      var suggestionMount = el("div", { style: "margin-bottom:26px" });
      var conversation = el("div", {});
      root.appendChild(askMount);
      root.appendChild(suggestionMount);
      root.appendChild(conversation);
      root.appendChild(architecture());

      var input = el("input", { type: "text", "aria-label": "Frage an Vision Universe",
        placeholder: "Investmentidee, Frage oder Strategiebeschreibung …" });
      function submit() {
        var text = input.value.trim();
        if (!text) return;
        input.value = "";
        handle(text, conversation, data);
      }
      input.addEventListener("keydown", function (e) { if (e.key === "Enter") submit(); });
      S.mount(askMount, el("div", { class: "q-ask" }, [
        input, el("button", { class: "q-btn", type: "button", text: "Fragen", onclick: submit })
      ]));

      S.mount(suggestionMount, el("div", { class: "q-pillbar" }, SUGGESTIONS.map(function (s) {
        return el("button", { class: "q-pill", type: "button", text: s.length > 62 ? s.slice(0, 60) + "…" : s,
          title: s, onclick: function () { handle(s, conversation, data); } });
      })));

      var initial = S.param("q");
      if (initial) handle(initial, conversation, data);
    }
  });

  function header(data) {
    var health = ai.healthCheck();
    return el("header", {}, [
      el("p", { class: "q-kicker", text: "Ask Vision Universe" }),
      el("h1", { class: "q-h1", text: "Sprache wird zu Regeln. Regeln werden gerechnet." }),
      el("p", { class: "q-lead", text:
        "Die AI uebersetzt eine Idee in eine strukturierte Abfrage und erklaert das Ergebnis. " +
        "Sie berechnet keine Kennzahl und keine Rendite — jede Zahl stammt aus einer deterministischen Engine." }),
      S.unavailable(health.provider + " · aktiver AI-Provider", health.message)
    ]);
  }

  /* Datenzugriff der Tool-Registry: ausschliesslich die Product API. */
  function buildAccess() {
    return {
      screen: function (query) { return Api.screen(query); },
      getStockQuant: function (ticker) { return Api.getStockQuant(String(ticker).toUpperCase()); },
      getRanking: function (id) { return Api.getRanking(id); },
      getFactorHistory: function (ticker) {
        return Promise.all([Api.getScoreHistory(), Api.getSecurities()]).then(function (res) {
          var row = res[1].rows.filter(function (r) { return r.ticker === String(ticker).toUpperCase(); })[0];
          if (!row) return { found: false, reason: "Unbekannter Ticker " + ticker };
          return { found: true, ticker: row.ticker, points: window.VURadar.seriesFor(res[0], row.securityId) };
        });
      },
      createStrategy: function (fields) { return Api.createStrategy(fields); },
      runBacktest: function (args) {
        return Api.runBacktest({
          definition: args.definition, strategyName: args.strategyName || "AI-Strategie",
          startDate: args.startDate || "2011-01-03", endDate: args.endDate,
          trustContext: { userOptimized: true }
        }, function (fraction, label) {
          var node = S.$("#ai-progress");
          if (node) node.textContent = Math.round(fraction * 100) + " % · " + label;
        });
      },
      compareBacktests: function (ids) {
        return Api.listBacktests().then(function (all) {
          return { backtests: ids.map(function (id) {
            var b = all.filter(function (x) { return x.backtestId === id; })[0];
            return b ? { backtestId: b.backtestId, strategyName: b.strategyName, metrics: b.metrics,
                         trustScore: b.trustScore ? b.trustScore.score : null } : { backtestId: id, found: false };
          })};
        });
      },
      getCurrentHoldings: function (id) { return Api.getCurrentHoldings(id); },
      getWatchlistIntelligence: function () { return Api.getWatchlistIntelligence(); },
      getMethodology: function (id) { return Api.getMethodology(id); }
    };
  }

  /* ------------------------------------------------------------ Ablauf */
  function handle(text, conversation, data) {
    var turn = el("article", { class: "q-ai-turn" });
    conversation.insertBefore(turn, conversation.firstChild);

    var interpretation = lastStrategyDefinition && looksLikeRevision(text)
      ? ai.interpretStrategy(text, { baseDefinition: lastStrategyDefinition })
      : ai.interpretQuery(text, { baseDefinition: lastStrategyDefinition });

    S.mount(turn, [
      el("p", { class: "q-ai-question", text: text }),
      interpretationBlock(interpretation)
    ]);

    var blocked = validationProblems(interpretation);
    if (blocked.length) {
      turn.appendChild(el("div", { class: "q-state q-state--error", style: "margin-top:12px" }, [
        el("b", { text: "Nicht ausgefuehrt" }),
        el("ul", { style: "margin:6px 0 0;padding-left:20px" }, blocked.map(function (e) { return el("li", { text: e }); }))
      ]));
      return;
    }

    var plan = interpretation.toolPlan || [];
    if (interpretation.intent === "revise" && interpretation.strategyDefinition) {
      plan = [{ tool: "validateStrategy", args: { definition: interpretation.strategyDefinition } }];
    }
    if (!plan.length) {
      turn.appendChild(S.stateBox("Keine Ausfuehrung moeglich",
        "Aus dieser Anfrage liess sich kein Werkzeugaufruf ableiten. Formuliere sie als Suche, Strategie, " +
        "Vergleich oder Erklaerung — oder waehle einen der Vorschlaege.", "empty"));
      return;
    }

    var confirmMount = el("div", { style: "margin-top:14px" });
    turn.appendChild(confirmMount);

    /* §52: Vor der Ausfuehrung sieht der Nutzer, wie die Anfrage gelesen
       wurde, und bestaetigt sie. Backtests laufen nie ungefragt los. */
    var needsConfirmation = plan.some(function (p) { return p.tool === "runBacktest"; });
    if (needsConfirmation) {
      S.mount(confirmMount, el("div", { class: "q-btn-row" }, [
        el("button", { class: "q-btn", type: "button", text: "So ausfuehren",
          onclick: function () { S.mount(confirmMount, []); execute(plan, turn, interpretation); } }),
        el("a", { class: "q-btn q-btn--ghost", href: S.BASE + "strategies/builder/", text: "Zuerst im Strategy Lab anpassen" })
      ]));
      return;
    }
    execute(plan, turn, interpretation);
  }

  function looksLikeRevision(text) {
    var entities = AiProvider.extractEntities(text);
    return entities.flags.lowerDrawdown || entities.flags.lowRisk;
  }

  function validationProblems(interpretation) {
    var out = [];
    if (interpretation.validation && !interpretation.validation.valid) {
      out = out.concat(interpretation.validation.errors);
    }
    if (interpretation.strategyValidation && !interpretation.strategyValidation.valid) {
      out = out.concat(interpretation.strategyValidation.errors);
    }
    return out;
  }

  function execute(plan, turn, interpretation) {
    var status = el("div", { class: "q-state", "aria-live": "polite" }, [
      el("b", { text: "Werkzeuge werden ausgefuehrt" }),
      el("span", { id: "ai-progress", text: plan.map(function (p) { return p.tool; }).join(" → ") })
    ]);
    turn.appendChild(status);

    var results = [];
    plan.reduce(function (chain, step) {
      return chain.then(function () {
        return registry.call(step.tool, step.args).then(function (res) { results.push(res); });
      });
    }, Promise.resolve()).then(function () {
      status.remove();
      turn.appendChild(toolResultsBlock(results));

      var explanation = ai.explain(interpretation.intent, { toolResults: results, interpretation: interpretation });
      turn.appendChild(el("div", { class: "q-ai-answer", style: "margin-top:6px" }, [
        el("p", { style: "margin:0", text: explanation.text })
      ]));

      if (explanation.sources.length) {
        turn.appendChild(el("div", { class: "q-ai-tools", style: "margin-top:10px" },
          explanation.sources.map(function (t) { return el("span", { class: "q-ai-tool", text: t + "()" }); })));
      }
      turn.appendChild(followUps(results, interpretation));
      turns.push({ interpretation: interpretation, results: results });
      if (interpretation.strategyDefinition) lastStrategyDefinition = interpretation.strategyDefinition;
    });
  }

  /* ------------------------------------------------------- Darstellung */
  function interpretationBlock(interpretation) {
    var rows = [];
    if (interpretation.query) {
      var described = Query.describeQuery(interpretation.query);
      rows.push(["Universum", described.universe]);
      described.filters.forEach(function (f, i) { rows.push(["Regel " + (i + 1), f]); });
      rows.push(["Sortierung", described.sort.join(", ")]);
      rows.push(["Maximal", String(described.limit)]);
    }
    if (interpretation.strategyDefinition) {
      var d = Strategy.describe(interpretation.strategyDefinition);
      rows.push(["Ranking", d.ranking.join(" · ")]);
      rows.push(["Positionen", d.positions + ", " + d.weighting]);
      rows.push(["Grenzen", "max. " + d.maxPositionWeight + " je Position, " + d.maxSectorWeight + " je Sektor"]);
      rows.push(["Rebalancing", d.rebalance]);
      rows.push(["Ausfuehrung", d.execution]);
      if (interpretation.startDate) rows.push(["Start", S.formatDate(interpretation.startDate)]);
    }
    if (!rows.length && interpretation.toolPlan && interpretation.toolPlan.length) {
      rows.push(["Werkzeuge", interpretation.toolPlan.map(function (p) { return p.tool; }).join(", ")]);
    }

    var block = el("div", { class: "q-ai-interpretation" }, [
      el("h4", { text: "So habe ich deine Idee interpretiert" }),
      rows.length
        ? el("dl", { class: "q-kv" }, rows.reduce(function (acc, r) {
            acc.push(el("dt", { text: r[0] })); acc.push(el("dd", { text: r[1] })); return acc;
          }, []))
        : el("p", { class: "q-note", style: "margin:0", text: "Kein strukturierter Ausdruck ableitbar." })
    ]);

    if (interpretation.changes && interpretation.changes.length) {
      block.appendChild(el("div", { style: "margin-top:12px" }, [
        el("p", { class: "q-kicker", style: "margin-bottom:6px", text: "Vorgeschlagene Aenderungen" }),
        el("ul", { style: "margin:0;padding-left:18px;font-size:13px;line-height:1.65" },
          interpretation.changes.map(function (c) { return el("li", { text: c }); }))
      ]));
    }
    if (interpretation.notes && interpretation.notes.length) {
      block.appendChild(el("ul", { class: "q-note", style: "margin:12px 0 0;padding-left:18px;line-height:1.6" },
        interpretation.notes.map(function (n) { return el("li", { text: n }); })));
    }
    if (interpretation.query) {
      block.appendChild(C.disclosure("Als VUQL und JSON-AST", [
        el("pre", { class: "q-code", text: VUQL.serialize(interpretation.query) }),
        el("pre", { class: "q-code", style: "margin-top:10px", text: JSON.stringify(interpretation.query, null, 2) })
      ]));
    }
    if (interpretation.strategyDefinition) {
      block.appendChild(C.disclosure("Strategy Definition (JSON)", [
        el("pre", { class: "q-code", text: JSON.stringify(interpretation.strategyDefinition, null, 2) })
      ]));
    }
    return block;
  }

  function toolResultsBlock(results) {
    var wrap = el("div", { style: "margin-top:6px" });
    results.forEach(function (res) {
      if (!res.ok) {
        wrap.appendChild(S.stateBox("Werkzeug " + res.tool + " nicht ausgefuehrt", res.error, "error"));
        return;
      }
      var d = res.data;
      if (res.tool === "screenStocks" && d && d.ok) {
        wrap.appendChild(C.stockList(d.result.rows.slice(0, 12), {
          ranked: true,
          emptyTitle: "Keine Treffer",
          emptyMessage: "Kein Titel erfuellt alle Regeln gleichzeitig. Fehlende Daten erfuellen keinen Filter."
        }));
      } else if (res.tool === "rankStocks" && d && d.found) {
        wrap.appendChild(el("div", { class: "q-rows" }, d.entries.slice(0, 12).map(function (e) {
          return el("a", { class: "q-row", href: S.BASE + "stock/?ticker=" + e.ticker }, [
            el("span", { class: "q-row-rank", text: "#" + e.rank }),
            el("span", { class: "q-row-main" }, [el("b", { text: e.ticker })]),
            el("span", {}),
            el("span", { class: "q-row-score", text: S.num(e.value, 1) })
          ]);
        })));
      } else if (res.tool === "explainQuantScore" && d && d.found) {
        wrap.appendChild(el("div", { class: "q-card" }, [C.contributionTable(d)]));
      } else if (res.tool === "compareStocks" && d) {
        wrap.appendChild(compareTable(d));
      } else if (res.tool === "getWatchlistChanges" && d) {
        wrap.appendChild(C.stockList(d.members.slice(0, 10), { deltaField: "scoreVelocity30d" }));
      } else if (res.tool === "runBacktest" && d && d.ok) {
        wrap.appendChild(el("div", { class: "q-btn-row", style: "margin:10px 0" }, [
          el("a", { class: "q-btn", href: S.BASE + "backtests/?id=" + encodeURIComponent(d.record.backtestId),
                    text: "Vollstaendiges Backtest-Ergebnis oeffnen" })
        ]));
      } else if (res.tool === "validateStrategy" && d) {
        wrap.appendChild(el("div", { class: "q-card q-card--flat" }, [
          el("p", { style: "margin:0;font-size:13.5px", text: d.valid
            ? "Die Definition ist gueltig und kann getestet werden."
            : "Die Definition ist nicht gueltig: " + d.errors.join("; ") })
        ]));
      }
    });
    return wrap;
  }

  function compareTable(d) {
    var stocks = d.stocks.filter(function (s) { return s.row; });
    if (!stocks.length) return S.stateBox("Kein Vergleich moeglich", "Keiner der genannten Ticker existiert im Modelluniversum.", "empty");
    return el("div", { class: "q-table-wrap" }, [
      el("table", { class: "q-table" }, [
        el("thead", {}, [el("tr", {}, [el("th", { scope: "col", text: "Kennzahl" })].concat(
          stocks.map(function (s) { return el("th", { scope: "col", text: s.ticker }); })))]),
        el("tbody", {}, d.fields.map(function (field) {
          return el("tr", {}, [el("td", { text: S.FACTOR_LABEL[field.replace("Score", "")] || field })].concat(
            stocks.map(function (s) {
              var v = s.row[field];
              return el("td", { class: Number.isFinite(v) ? null : "na", text: Number.isFinite(v) ? S.num(v, 0) : "–" });
            })));
        }))
      ])
    ]);
  }

  function followUps(results, interpretation) {
    var wrap = el("div", { class: "q-btn-row", style: "margin-top:12px" });
    var screened = results.filter(function (r) { return r.ok && r.tool === "screenStocks"; })[0];
    if (screened && screened.data.ok && screened.data.result.rows.length) {
      wrap.appendChild(el("a", { class: "q-btn q-btn--ghost q-btn--sm", href: S.BASE + "screener/",
        text: "Im Screener weiterbearbeiten" }));
    }
    if (interpretation.strategyDefinition) {
      wrap.appendChild(el("a", { class: "q-btn q-btn--ghost q-btn--sm",
        href: S.BASE + "strategies/builder/", text: "Im Strategy Lab oeffnen" }));
    }
    var backtested = results.filter(function (r) { return r.ok && r.tool === "runBacktest" && r.data && r.data.ok; })[0];
    if (backtested) {
      wrap.appendChild(el("span", { class: "q-note",
        text: "Naechster Schritt: „Der Drawdown ist mir zu hoch“ erzeugt eine neue Strategieversion." }));
    }
    return wrap;
  }

  function architecture() {
    return el("div", { style: "margin-top:40px" }, [
      C.disclosure("Wie diese Seite arbeitet — und was sie bewusst nicht darf", [
        el("p", { text:
          "Die AI ist Interpretations- und Erklaerungsschicht, nicht Wahrheitsschicht. Sie besitzt keinen " +
          "Datenzugriff, sondern ausschliesslich das Recht, registrierte Werkzeuge aufzurufen." }),
        el("p", { class: "q-kicker", style: "margin:16px 0 8px", text: "Registrierte Werkzeuge" }),
        el("div", { class: "q-ai-tools" }, AiTools.toolDefinitions().map(function (t) {
          return el("span", { class: "q-ai-tool", text: t.name + "()", title: t.description });
        })),
        el("p", { class: "q-kicker", style: "margin:18px 0 8px", text: "Ausdruecklich nicht vorhanden" }),
        el("ul", { style: "margin:0;padding-left:18px;line-height:1.7" }, [
          el("li", { text: "kein Werkzeug, das SQL, JavaScript oder einen beliebigen Ausdruck ausfuehrt" }),
          el("li", { text: "kein Werkzeug, das eine beliebige URL abruft" }),
          el("li", { text: "kein direkter Datenbank- oder Dateizugriff" }),
          el("li", { text: "keine Moeglichkeit, eine Kennzahl ohne Werkzeugergebnis zu behaupten" })
        ]),
        el("p", { style: "margin-top:14px", text:
          "POST /v1/backtests nimmt niemals natuerliche Sprache entgegen, sondern ausschliesslich ein " +
          "validiertes Strategy Schema. Der Satz des Nutzers erreicht die Backtest Engine nie." })
      ])
    ]);
  }
})();
