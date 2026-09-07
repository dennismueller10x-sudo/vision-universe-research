/* =========================================================================
   VISION UNIVERSE QUANT — ui/components.js

   Wiederverwendbare Produktbausteine. Jede Komponente folgt dem Prinzip
   ONE INSIGHT PER COMPONENT (§63) und der Progressive Disclosure (§65):

     LEVEL 1  einfache Aussage        Rating-Band, "Top 10 %"
     LEVEL 2  Score                   VU Quant Score, Faktorscores
     LEVEL 3  Factor DNA              Komponenten je Faktor
     LEVEL 4  Rohkennzahlen           tatsaechliche Werte
     LEVEL 5  Methodik + Provenance   wie gerechnet wurde, woher die Daten kamen

   Regulatorische Sprache (§81): keine Kauf-/Verkaufsvokabeln. Ausgegeben
   werden Score, Faktorprofil, Rang und Veraenderung.
   ========================================================================= */
(function (global) {
  "use strict";

  var S = global.QuantShell;
  var Charts = global.QuantCharts;
  var el = S.el;

  var FACTOR_ORDER = ["quality", "momentum", "growth", "value", "risk"];

  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }

  /* ------------------------------------------------------------ Score-Orbit */
  function scoreOrb(score, options) {
    options = options || {};
    var tone = S.toneFor(score);
    var body = isNum(score)
      ? [el("b", { text: S.num(score, 0) }), el("span", { text: options.label || "VU Quant" })]
      : [el("b", { text: "INCOMPLETE" }), el("span", { text: options.label || "VU Quant" })];
    return el("div", {
      class: "q-score-orb tone-" + tone + (options.small ? " q-score-orb--sm" : ""),
      role: "img",
      "aria-label": isNum(score)
        ? "VU Quant Score " + S.num(score, 0) + " von 100, " + S.bandLabel(score)
        : "Kein vollstaendiger VU Quant Score verfuegbar"
    }, body);
  }

  function scorePill(score, label) {
    return el("span", { class: "q-score-pill tone-" + S.toneFor(score) }, [
      el("b", { text: isNum(score) ? S.num(score, 0) : "–" }),
      label ? el("span", { text: label, style: "font-weight:600;font-size:11px" }) : null
    ]);
  }

  /* -------------------------------------------------------- Coverage (§21) */
  function coverageBlock(dna) {
    var pctText = isNum(dna.coverage) ? Math.round(dna.coverage * 100) + " %" : "–";
    var items = [
      el("div", { class: "q-metric" }, [
        el("span", { text: "Datenabdeckung" }), el("b", { text: pctText })
      ]),
      el("div", { class: "q-metric" }, [
        el("span", { text: "Konfidenz" }),
        el("b", { text: S.CONFIDENCE_LABEL[dna.confidence] || dna.confidence })
      ])
    ];
    if (dna.status === "incomplete") {
      items.push(el("div", { class: "q-metric", style: "grid-column:1/-1;background:var(--yellow-bg)" }, [
        el("span", { text: "Warum kein vollstaendiger Score?" }),
        el("em", { text: (dna.incompleteReasons || []).join(" ") , style: "font-size:12.5px;color:#6e5a18;margin-top:5px" })
      ]));
    }
    return el("div", { class: "q-metrics" }, items);
  }

  /* --------------------------------------------------------- Factor DNA §22 */
  /**
   * Aufklappbare Factor DNA. Ebene 2 -> 3 -> 4 in einer Komponente:
   * Faktorbalken, darunter je Komponente Perzentil und Rohwert.
   */
  function factorDna(dna, options) {
    options = options || {};
    var wrap = el("div", { class: "q-dna" });

    FACTOR_ORDER.forEach(function (factorId) {
      var score = dna.factorScores ? dna.factorScores[factorId] : null;
      var detailId = "dna-" + factorId + "-" + (options.idSuffix || "x");
      var detail = el("div", { class: "q-dna-detail", id: detailId, hidden: true });

      var comps = (dna.components && dna.components[factorId]) || {};
      var compIds = Object.keys(comps).sort(function (a, b) { return comps[b].weight - comps[a].weight; });

      if (!compIds.length) {
        detail.appendChild(el("p", { class: "q-note", text: "Keine Komponenten verfuegbar." }));
      }
      compIds.forEach(function (cid) {
        var c = comps[cid];
        var field = global.VUCatalog.field(cid);
        var hasValue = isNum(c.percentile);
        detail.appendChild(el("div", { class: "q-dna-component" }, [
          el("b", { text: field ? field.label : cid }),
          el("span", { class: "raw", text: hasValue || isNum(c.raw) ? S.fmt(cid, c.raw) : "keine Daten" }),
          el("span", {
            class: "pctl" + (hasValue ? "" : " na"),
            text: hasValue ? Math.round(c.percentile) + ". Pctl" : "–",
            title: hasValue ? "Peer " + S.num(c.peerPercentile, 0) + " · Universum " + S.num(c.universePercentile, 0) : null
          })
        ]));
      });

      if (dna.peerGroups && dna.peerGroups[factorId]) {
        detail.appendChild(el("p", {
          class: "q-note", style: "margin:2px 0 0",
          text: "Vergleichsgruppe: " + peerGroupLabel(dna.peerGroups[factorId]) +
                " · 70 % Peer-Perzentil, 30 % Universums-Perzentil"
        }));
      }

      var row = el("button", {
        class: "q-dna-row", type: "button",
        "aria-expanded": "false", "aria-controls": detailId,
        onclick: function () {
          var open = row.getAttribute("aria-expanded") === "true";
          row.setAttribute("aria-expanded", String(!open));
          detail.hidden = open;
        }
      }, [
        el("span", { class: "q-dna-label", text: S.FACTOR_LABEL[factorId] }),
        el("span", { class: "q-dna-bar" }, [
          el("i", { class: "tone-" + S.toneFor(score), style: "width:" + (isNum(score) ? Math.max(1, score) : 0) + "%" })
        ]),
        el("span", { class: "q-dna-value" + (isNum(score) ? "" : " muted"), text: isNum(score) ? S.num(score, 0) : "n/a" })
      ]);

      wrap.appendChild(row);
      wrap.appendChild(detail);
    });

    /* Revisions existiert im Schema, hat aber keine Daten — das gehoert
       sichtbar gemacht, nicht als 50 versteckt (§16, §93). */
    var revisions = global.VUMethodology.quant().factors.revisions;
    if (revisions && revisions.available === false) {
      wrap.appendChild(el("div", { class: "q-dna-row", style: "cursor:default;opacity:.65" }, [
        el("span", { class: "q-dna-label", text: "Revisions" }),
        el("span", { class: "q-note", text: "Analystenrevisionen derzeit nicht verfuegbar" }),
        el("span", { class: "q-dna-value muted", text: "n/a" })
      ]));
    }
    return wrap;
  }

  function peerGroupLabel(key) {
    if (!key) return "Universum";
    var parts = String(key).split(":");
    if (parts[0] === "industry") return "Industrie " + parts[1];
    if (parts[0] === "sector") return "Sektor " + parts[1];
    return "Gesamtuniversum";
  }

  /* ------------------------------------------------- Explainability (§55) */
  function contributionTable(dna) {
    var rows = FACTOR_ORDER
      .filter(function (f) { return isNum(dna.factorContributions && dna.factorContributions[f]); })
      .map(function (f) {
        return el("div", { class: "q-dna-component" }, [
          el("b", { text: S.FACTOR_LABEL[f] }),
          el("span", { class: "raw", text: "Gewicht " + Math.round((dna.effectiveWeights[f] || 0) * 100) + " %" }),
          el("span", { class: "pctl", text: S.signed(dna.factorContributions[f], 1) })
        ]);
      });
    rows.push(el("div", { class: "q-dna-component", style: "background:var(--surface);border-color:var(--line-strong)" }, [
      el("b", { text: "Composite" }),
      el("span", { class: "raw", text: "Summe der Beitraege" }),
      el("span", { class: "pctl", text: S.num(dna.compositeScore, 1) })
    ]));
    rows.push(el("div", { class: "q-dna-component", style: "background:var(--surface);border-color:var(--line-strong)" }, [
      el("b", { text: "VU Quant Score" }),
      el("span", { class: "raw", text: "Perzentilrang des Composite im Universum" }),
      el("span", { class: "pctl", text: S.num(dna.score, 0) })
    ]));
    return el("div", { style: "display:grid;gap:7px" }, rows);
  }

  /* ------------------------------------------------------- Listenkomponente */
  function stockRow(row, options) {
    options = options || {};
    var chips = [];
    if (options.showFactors !== false) {
      [["qualityScore", "Q"], ["momentumScore", "M"], ["growthScore", "G"], ["valueScore", "V"]].forEach(function (pair) {
        var v = row[pair[0]];
        if (!isNum(v)) return;
        chips.push(el("span", {
          class: "q-chip tone-" + (v >= 75 ? "strong" : v <= 25 ? "poor" : "neutral"),
          text: pair[1] + " " + S.num(v, 0),
          title: S.FACTOR_LABEL[pair[0].replace("Score", "")] + " " + S.num(v, 0)
        }));
      });
    }

    var right = [];
    if (options.deltaField && isNum(row[options.deltaField])) {
      var d = row[options.deltaField];
      right.push(el("span", { class: "q-delta " + (d > 0 ? "up" : d < 0 ? "down" : "flat"), text: S.signed(d, 1) }));
    }
    right.push(el("span", { class: "q-row-score", text: isNum(row[options.scoreField || "quantScore"]) ? S.num(row[options.scoreField || "quantScore"], 0) : "–" }));

    return el("a", { class: "q-row", href: S.BASE + "stock/?ticker=" + encodeURIComponent(row.ticker) }, [
      el("span", { class: "q-row-rank", text: options.rank ? "#" + options.rank : "" }),
      el("span", { class: "q-row-main" }, [
        el("b", { text: row.ticker }),
        el("span", { text: row.name + " · " + row.industry })
      ]),
      el("span", { class: "q-row-factors" }, chips),
      el("span", { style: "display:flex;align-items:center;gap:10px;justify-content:flex-end" }, right)
    ]);
  }

  function stockList(rows, options) {
    options = options || {};
    if (!rows.length) {
      return S.stateBox(options.emptyTitle || "Keine Treffer",
        options.emptyMessage || "Zu diesen Kriterien gibt es im aktuellen Modelluniversum keine Wertpapiere.", "empty");
    }
    return el("div", { class: "q-rows" }, rows.map(function (r, i) {
      return stockRow(r, Object.assign({}, options, { rank: options.ranked ? i + 1 : null }));
    }));
  }

  /* -------------------------------------------------------------- Metriken */
  function metricTile(label, value, hint) {
    return el("div", { class: "q-metric" }, [
      el("span", { text: label }),
      el("b", { class: value === "–" || value === null ? "na" : null, text: value === null ? "keine Daten" : value }),
      hint ? el("em", { text: hint }) : null
    ]);
  }

  function metricGrid(items) {
    return el("div", { class: "q-metrics" }, items.map(function (it) {
      return metricTile(it.label, it.value, it.hint);
    }));
  }

  /* ------------------------------------------- Methodik + Provenance (L5) */
  function disclosure(summary, body, open) {
    return el("details", { class: "q-disclosure", open: open ? true : null }, [
      el("summary", { text: summary }),
      el("div", { class: "q-disclosure-body" }, Array.isArray(body) ? body : [body])
    ]);
  }

  function definitionList(pairs) {
    var dl = el("dl", {});
    pairs.forEach(function (p) {
      if (p[1] === null || p[1] === undefined) return;
      dl.appendChild(el("dt", { text: p[0] }));
      dl.appendChild(el("dd", { text: String(p[1]) }));
    });
    return dl;
  }

  function methodologyPanel(dna, meta) {
    var cfg = global.VUMethodology.quant();
    return disclosure("Methodik und Berechnung", [
      el("p", {
        text: "Der VU Quant Score entsteht in fuenf Schritten: Rohkennzahl → Validierung → Winsorization (" +
              cfg.normalization.winsorization.lowerPercentile + "./" + cfg.normalization.winsorization.upperPercentile +
              " Perzentil) → Peer-Normalisierung (" + Math.round(cfg.normalization.peerWeights.peer * 100) + " % Vergleichsgruppe, " +
              Math.round(cfg.normalization.peerWeights.universe * 100) + " % Universum) → Perzentil je Faktor → gewichteter Composite → " +
              "Perzentilrang des Composite im Universum."
      }),
      definitionList([
        ["Methodikversion", dna.methodologyVersion || (meta && meta.methodologyVersions.quant)],
        ["Faktorgewichte", FACTOR_ORDER.map(function (f) { return S.FACTOR_LABEL[f] + " " + Math.round(cfg.factorWeights[f] * 100) + " %"; }).join(" · ")],
        ["Mindest-Peer-Group", cfg.normalization.minPeerGroupSize + " Titel, sonst Fallback " + cfg.normalization.peerFallbackChain.join(" → ")],
        ["Mindestabdeckung", Math.round(cfg.coverage.minTotalCoverage * 100) + " % (darunter: Status INCOMPLETE)"],
        ["Revisions", cfg.factors.revisions.unavailableReason]
      ]),
      el("p", {
        class: "q-note",
        text: "Ein Perzentil von 94 bedeutet: besser als 94 % der Vergleichsgruppe. Es ist keine Aussage ueber die " +
              "Wahrscheinlichkeit kuenftiger Kursentwicklungen."
      })
    ]);
  }

  function provenancePanel(dna, meta) {
    var tags = [
      ["Provider", meta.providerHealth ? meta.providerHealth.provider : "VisionUniverseMock"],
      ["Datensatz", "synthetic-us-equities"],
      ["Snapshot", meta.dataSnapshotId],
      ["asOf", S.formatDate(dna.asOf || meta.asOf)]
    ];
    if (dna.dataAsOfPeriodEnd) tags.push(["Berichtsperiode", S.formatDate(dna.dataAsOfPeriodEnd)]);
    if (dna.dataAvailableAt) tags.push(["verfuegbar seit", S.formatDate(dna.dataAvailableAt)]);
    if (dna.restatementStatus) tags.push(["Datenstand", dna.restatementStatus === "original" ? "Originalmeldung" : dna.restatementStatus === "restated" ? "korrigiert" : dna.restatementStatus]);
    tags.push(["Mock", "ja"]);

    return disclosure("Datenherkunft", [
      el("p", { class: "q-note", text: "Jeder Wert dieser Seite laesst sich auf Provider, Datensatz, Snapshot und Zeitpunkt zurueckfuehren." }),
      el("div", { class: "q-provenance" }, tags.map(function (t) {
        return el("span", { class: "q-prov-tag" }, [el("b", { text: t[0] + ": " }), document.createTextNode(String(t[1]))]);
      }))
    ]);
  }

  /* ------------------------------------------------------------- Abschnitt */
  function section(title, description, content, link) {
    return el("section", { class: "q-section" }, [
      el("div", { class: "q-section-head" }, [
        el("div", {}, [
          el("h2", { class: "q-h2", text: title }),
          description ? el("p", { text: description }) : null
        ]),
        link ? el("a", { class: "q-section-link", href: link.href, text: link.label + " →" }) : null
      ]),
      content
    ]);
  }

  /* -------------------------------------------------------- Event-Labels */
  var EVENT_LABELS = {
    quant_upgrade: "Quant Upgrade", quant_downgrade: "Quant Downgrade",
    momentum_leader: "Momentum-Fuehrer", quality_leader: "Quality-Fuehrer",
    near_52w_high_confirmed: "52W-Hoch mit Quant-Bestaetigung",
    emerging_compounder: "Emerging Compounder", factor_breakout: "Factor Breakout",
    quality_deterioration: "Quality-Verschlechterung"
  };
  function eventLabel(type) { return EVENT_LABELS[type] || type; }
  function severityTone(severity) { return severity === "high" ? "poor" : severity === "notable" ? "neutral" : ""; }

  /* ------------------------------------------------- Kontextuelle AI (§95) */
  function askBar(placeholder, context) {
    var input = el("input", {
      type: "text", placeholder: placeholder || "Frage Vision Universe …",
      "aria-label": placeholder || "Frage an Vision Universe"
    });
    function go() {
      var q = input.value.trim();
      location.href = S.BASE + "ai/?q=" + encodeURIComponent(q) + (context ? "&context=" + encodeURIComponent(context) : "");
    }
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") go(); });
    return el("div", { class: "q-ask" }, [
      input,
      el("button", { class: "q-btn", type: "button", text: "Fragen", onclick: go })
    ]);
  }

  var api = {
    FACTOR_ORDER: FACTOR_ORDER,
    scoreOrb: scoreOrb, scorePill: scorePill,
    coverageBlock: coverageBlock, factorDna: factorDna, contributionTable: contributionTable,
    stockRow: stockRow, stockList: stockList,
    metricTile: metricTile, metricGrid: metricGrid,
    disclosure: disclosure, definitionList: definitionList,
    methodologyPanel: methodologyPanel, provenancePanel: provenancePanel,
    peerGroupLabel: peerGroupLabel, section: section, askBar: askBar,
    EVENT_LABELS: EVENT_LABELS, eventLabel: eventLabel, severityTone: severityTone
  };

  global.QuantComponents = api;
})(window);
