/* =========================================================================
   VISION UNIVERSE DISCOVER — ui/daten.js

   DATEN & QUELLEN (V4 §11)

   Auf den Karten steht kein Anbietername mehr - dort steht, WAS man
   sieht (Tagesschluss, 5-Minuten-Kurse, Geschaeftsjahr) und WIE ALT es
   ist. Woher es kommt, steht hier: Marktdaten, Tagesverlauf,
   Geschaeftszahlen, Index-Mitgliedschaft, Aktualisierung, Verzoegerung,
   Methoden, Lizenzgrundlage. Alles auf dieser Seite kommt aus den
   Metadaten des Builds (discover/data/meta.json) und aus der Konfiguration
   - nichts hier ist eine zweite Wahrheit.
   ========================================================================= */
(function (global) {
  "use strict";

  var S = global.QuantShell;
  var D = global.VUDiscover;
  var el = S.el;

  function abschnitt(id, titel, kinder) {
    return el("section", { class: "dx-daten-abschnitt", id: "daten-" + id }, [el("h2", { text: titel })].concat(kinder));
  }
  function absatz(text) { return el("p", { text: text }); }
  function zeile(label, wert) {
    return el("div", { class: "dx-daten-zeile" }, [el("b", { text: label }), el("span", { text: wert })]);
  }

  function render(input) {
    var meta = input.meta || {}, u = input.universe || {};
    var rt = meta.realtime || {}, intr = rt.intraday || {};
    var idx = meta.indexes || [];
    var qual = meta.qualification && meta.qualification.rule ? meta.qualification.rule : null;
    var C = D.Cards;
    var stand = u.asOf ? C.dateShort(u.asOf) : "unbekannt";

    var seite = el("main", { class: "dx-page dx-daten" }, [
      el("a", { class: "dx-back", href: "#/", text: "← Discover" }),
      el("h1", { text: "Daten & Quellen" }),
      el("p", { class: "dx-daten-lead", text: "Woher die Kurse, Verläufe und Geschäftszahlen auf Discover kommen, wie oft sie erneuert werden, " +
        "wie alt sie sein dürfen und nach welchen Regeln daraus Sammlungen entstehen. Nichts auf den Seiten wird geschätzt oder erfunden; " +
        "was fehlt, fehlt sichtbar." }),

      abschnitt("markt", "Marktdaten (Tagesschlusskurse)", [
        absatz("Kursreihen, Renditen, Jahreshochs und Scores beruhen auf Tagesschlusskursen des Produktuniversums (" +
               (u.securities || "–") + " US-Aktien). Die Kurse sind split-bereinigt; Dividenden werden nicht eingerechnet. " +
               "Anbieter: Tiingo (lizenziertes Marktdatenpaket, Erklärung des Eigentümers vom 13.09.2026)."),
        zeile("Stand der Tagesreihen", stand),
        zeile("Aktualisierung", "täglich nach dem US-Handelsschluss (Abendlauf 22:30 UTC), danach Neuberechnung aller Reihen und Sammlungen"),
        zeile("Zeitraum auf der Aktienseite", "1 Woche bis 1 Jahr aus der Tagesreihe; 5 Jahre und Max aus einer Wochenreihe (Schlusskurs des letzten Handelstags jeder Woche) — nichts wird interpoliert")
      ]),

      abschnitt("intraday", "Tagesverlauf (5-Minuten-Kurse)", [
        absatz(rt.available
          ? "Der Tagesverlauf auf Karten und Aktienseiten besteht aus 5-Minuten-Kursen der laufenden oder der letzten abgeschlossenen regulären Sitzung " +
            "(09:30–16:00 New York). Die Kurse stammen aus dem IEX-Bestand von Tiingo (nur an der IEX gehandeltes Volumen; die Kursart nennt der Anbieter nicht). " +
            "Ein Workflow holt sie während der Sitzung alle " + (intr.refreshMinutes || 10) + " Minuten; die Seite nennt deshalb „Stand HH:MM“ und nie „live“."
          : "Für dieses Universum wird kein Tagesverlauf ausgeliefert."),
        zeile("Verzögerung", "bis zu " + (intr.refreshMinutes || 10) + " Minuten (Workflow-Takt) plus Auslieferung der Seite"),
        zeile("Zeitzone", "Uhrzeiten auf der Seite sind New Yorker Zeit"),
        zeile("Aktualität", "Jeder Verlauf trägt einen Frische-Zustand: aktuell (laufende Sitzung), letzter Handelstag, nicht aktuell (älter als der letzte Handelstag) oder nicht verfügbar. " +
              "Ein Stand, der nicht der letzte Handelstag ist, wird nie als solcher beschriftet; er heißt „nicht aktuell“. Karenz nach Sitzungsbeginn und -schluss: " +
              ((intr.freshness && intr.freshness.graceMinutes) || 30) + " Minuten; für Tagesschlusskurse " + ((intr.freshness && intr.freshness.graceHours) || 6) + " Stunden.")
      ]),

      abschnitt("fundamentals", "Geschäftszahlen", [
        absatz("Umsatz, Gewinn, Cashflow, Margen und Bilanz kommen aus den bei der SEC eingereichten Jahres- und Quartalsberichten (EDGAR, XBRL-Companyfacts). " +
               "Jede Zahl trägt Geschäftsjahr, Einreichung und Accession-Nummer; Jahres-, Quartals- und Zwölfmonatswerte (TTM) werden nicht gemischt."),
        zeile("Aktualisierung", "täglich (neue Einreichungen), wöchentlich vollständig"),
        zeile("Plausibilität", "Margen erst ab 50 Mio. $ Umsatz; Margen über 150 % oder Gewinne über dem 1,5-fachen Umsatz gelten als Zähler-/Nennerfehler und werden nicht gezeigt; " +
              "für Banken, Versicherer und andere Bilanzgeschäfte gibt es keine Free-Cashflow-Marge; ein Geschäftsjahr älter als zwei Jahre gilt als veraltet. " +
              "Fehlt eine Zahl aus einem dieser Gründe, nennt die Aktienseite den Grund.")
      ]),

      abschnitt("index", "Index-Mitgliedschaft", idx.length ? [
        absatz("Ob eine Aktie im S&P 500, im NASDAQ-100 oder im Dow Jones steht, liest Discover aus dem veröffentlichten Tagesbestand des jeweils abbildenden Fonds. " +
               "Das ist eine Mitgliedschaft mit Stichtag und Quelle, keine Schätzung aus Größe oder Börse. Indexnamen sind Marken ihrer Eigentümer.")
      ].concat(idx.map(function (i) {
        return zeile(i.indexName, i.memberCount + " Titel laut " + (i.proxy && i.proxy.etf ? i.proxy.etf + " (" + i.proxy.issuer + ")" : "Fondsbestand") +
                     ", Stichtag " + C.dateShort(i.asOf) + (i.stale ? " — Abruf zuletzt fehlgeschlagen, älterer Stand" : ""));
      })) : [
        absatz("Die Index-Reihen (S&P 500, NASDAQ-100, Dow Jones) erscheinen erst, wenn die Mitgliedschaftsdaten aus den veröffentlichten Fondsbeständen vorliegen. Bis dahin wird nichts geraten.")
      ]),

      abschnitt("methoden", "Methoden", [
        absatz("Die Sammlungen sind Regeln über gerechnete Kennzahlen, keine Meinungen. „Die stärksten Aktien“ heißt: Qualifikation zuerst (" +
               (qual ? "Score-Abdeckung ≥ " + Math.round(qual.minCoverage * 100) + " %, mindestens " + qual.minBars + " Handelstage Historie, Kurs über " + qual.minPrice +
                       " $, mindestens " + Math.round(qual.minAvgDollarVolume20d / 1e6) + " Mio. $ Tagesumsatz" : "Liquidität, Historie, Kurs") +
               "), dann Rang nach Kursstärke über drei bis zwölf Monate, relativer Stärke zum Markt, Trendqualität und Abstand zum Jahreshoch. " +
               "Alle Fenster enden am letzten Handelstag — kein Blick in die Zukunft. Jede Karte trägt ihre Begründung maschinenlesbar (rankingReason)."),
        zeile("Bekannte Namen", "Die Bekanntheit ist redaktionell (" + ((meta.editorial && meta.editorial.recognition && meta.editorial.recognition.entries) || 0) +
              " Einträge). Sie entscheidet nie, ob ein Titel in einer Sammlung steht — nur, wie weit vorn ein qualifizierter Titel gezeigt wird."),
        zeile("Version", "Discover " + (meta.moduleVersion || "") + " · Methodik " + (meta.methodologyVersion || "") + " · Contract " + (meta.contractVersion || ""))
      ]),

      abschnitt("lizenz", "Lizenzen und Quellenangaben", [
        absatz("Marktdaten und Tagesverlauf: Tiingo, Inc. (Tageskurse; Intraday aus dem IEX-Bestand von Tiingo). Nutzung auf Grundlage der Freigabe des Eigentümers " +
               "für die öffentliche Anzeige (13.09.2026); der Vertragstext liegt nicht im Repository. Geschäftszahlen: U.S. Securities and Exchange Commission (EDGAR), gemeinfrei. " +
               "Index-Mitgliedschaft: öffentliche Bestandsveröffentlichungen der Fondsgesellschaften (BlackRock/iShares, Invesco, State Street/SPDR). " +
               "S&P 500 ist eine Marke von S&P Dow Jones Indices, NASDAQ-100 von Nasdaq, Inc., Dow Jones Industrial Average von S&P Dow Jones Indices."),
        absatz(meta.disclaimer || "Discover zeigt Kursverhalten, keine Anlageempfehlung.")
      ])
    ]);
    return seite;
  }

  global.VUDiscover = global.VUDiscover || {};
  global.VUDiscover.Daten = { render: render };
})(window);
