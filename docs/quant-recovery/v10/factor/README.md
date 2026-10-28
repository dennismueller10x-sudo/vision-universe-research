# V10 – Strang FACTOR: rekonstruierte Faktor- und Strategiestudie (Pfad A)

**Evidenzart: RECONSTRUCTION.** Alle Werte hier sind rückblickend aus heute verfügbaren Quellen nachgerechnet. Sie sind **nie** ein damals veröffentlichtes VU-Signal. `certificationStatus = NOT_CERTIFIED`, `productionApproved = false`. Die aktiven Verträge FACTOR_RANKING_BACKTEST und STRATEGY_BACKTEST bleiben unverändert: Faktor- und Membership-Historie 2/24 Monate, 0/12 abgeschlossene Forward-Monate, frühestens 2028-01/2028-08 (Pfad B).

## Belege

| Datei | Inhalt |
|---|---|
| [registration-1.0.0.json](registration-1.0.0.json) | Vorab-Registrierung (Commit `ae3c3c7b42`, vor jeder Outcome-Rechnung): Faktorsatz, Abweichungen, Stichtage, Population, Verfügbarkeit, Horizonte, Endpunkte, Inferenz, Holm-Familie, Strategie |
| [factor-study-1.0.0.json](factor-study-1.0.0.json) | Evidenzvertrag der Faktorstudie: Tabelle Faktor × Horizont (E1–E4, NW, Blockbootstrap, Holm, Teilperioden), Regime, Population je Stichtag, reif/unreif/zensiert, reproHash |
| [factor-study-perdate-1.0.0.json.gz](factor-study-perdate-1.0.0.json.gz) | Stichtagsreihen (IC, Q5, Q1, SPY, Schranken) je Signal × Horizont |
| [strategy-1.0.0.json](strategy-1.0.0.json) | Top-50-Strategie über `research-portfolio.cjs` (BASE/LOW/HIGH), SPY, gleichgewichtete Population |
| [python-verification-1.0.0.json](python-verification-1.0.0.json) | Unabhängige Python-Gegenrechnung (stdlib, `python3 -I`) |

Skripte: `scripts/quant/v10/factor/` (`fetch_companyfacts.py`, `jobs.cjs`, `pit_docs.py`, `common.cjs`, `factors.cjs`, `panel.cjs`, `study.cjs`, `strategy.cjs`, `verify_factor.py`). Tests: `quant/tests/v10-factor.test.mjs`.

## Was rekonstruiert wurde

- **Produktdefinition:** `vu-factor-evidence-2.0.0` (aus `quant-v2.2.0`) – die Reihe, die die Verträge als Faktorhistorie zählen.
- **Faktoren (sechs von sieben):**
  - Fundamental, PIT aus SEC companyfacts: Quality, Growth, Value, Profitability. Erzeugt mit der bestehenden SEC-Pipeline (`normalization_logic` 1.14.0 inkl. P1–P4, Policy `as_of_latest`) und `fundamental-inputs.compute` (unverändert).
  - Kursbasiert aus Wochenschlüssen: Momentum, Risk.
  - **Revisions** ist nicht rekonstruierbar: keine lizenzierte PIT-Konsensquelle.
- **Normierung und Faktoren:** Normierung, Faktorbildung und Pflichtkomponenten über die Produktfunktionen `FactorEvidence.winsorBounds`, `clamp`, `midrankPercentiles` und `assembleFactor`.
- **Gesamtrang (Forschungsgröße):** Σ w·Score / 0,85 über die sechs Faktoren, nur wenn alle sechs verfügbar sind. Er ist keine Produktgröße, denn Quant V2 hat `compositeAllowed=false`.
- **Verfügbarkeit:** Ein SEC-Wert gilt am Stichtag t, wenn `filed < t`; der nächste Wochenschluss nach `filed` ist also ≤ t. Der Resolver erhält `as_of = t − 1 Tag`.
  - Acceptance-Zeit bleibt Obergrenze.
  - Das Bulk-Filing-Index-Archiv wird nicht genutzt.
  - Restatements werden erst ab ihrem eigenen `filed` sichtbar.
- **Marktkapitalisierung PIT:** Aktienzahl (`filed < t`) × split-bereinigter Schluss × `splitFactors`-Faktor am Aktienzahl-Stichtag (ADR-002, split-konsistent).
  - Liegt zwischen Aktienzahl-Stichtag und Entscheidung ein Split, weicht der Wert von „Kurs(t) unbereinigt × Aktienzahl“ ab. Diese Fälle werden gezählt; Ende 2025 waren es 71.
  - Zurückhaltegründe wie im Produkt: mehrere Listings je CIK, ausgegebene statt ausstehende Aktien, Berichtswährung ≠ USD.
- **Offengelegte Abweichungen zum Produkt** (Registrierung, `deviationsFromProduct`):
  - Wochen- statt Tagesfenster;
  - nur Universums-, kein Peer-Perzentil;
  - Branchenvorlagen (Banken, Versicherer, REITs) nicht rekonstruiert: diese Titel haben dort NOT_APPLICABLE und keinen Gesamtrang;
  - keine FSDS-Ergänzung;
  - Rangpopulation = heutige Survivors statt kanonisches Produktuniversum.
  - **Zusätzlich:** Der Fiskalkalender je Emittent wird aus allen Fakten bis heute gebildet. Das betrifft nur die Fiskaljahr-Etiketten, nicht die Werte oder deren Sichtbarkeit.

## Population und Abdeckung

- **Loader:** `createResearchLoader({identityEvidence:true, corporateActionEvidence:true})`, 4.476 QUALIFIED.
- **Frame:** 4.250 Listings nach drei Ausschlüssen:
  - 182 mit nicht-modalem Wochenlabel;
  - 16 mit Börse außerhalb XNYS/XNAS/XASE;
  - 28 belegte Nicht-Aktien.
- **Emittenten:** 4.026 CIKs, 114 Listings ohne CIK.
- **PIT-Dokumente:** 3.957 Emittenten. Ohne Dokument blieben 30 (nicht in companyfacts), 38 (keine periodischen Fakten) und 1 (Fehler „CIK must not be None“).
- **Survivors:** Alle Frame-Listings sind heutige Survivors; keines endet vor dem Bewertungsende. Delistings kommen deshalb nicht vor. Das ist Selektion, kein Befund.
- **Stichtage:** 192 Monatsend-Wochenschlüsse von 2010-01-29 bis 2025-12-26.

| Stichtag | Population | Gesamtrang | Value | Quality | Profitability | ohne sichtbares Filing |
|---|---|---|---|---|---|---|
| 2010-01-29 | 1.830 | 0 | 0 | 0 | 0 | 1.503 |
| 2013-12-27 | 2.101 | 453 | 1.003 | 1.028 | 587 | 265 |
| 2017-12-29 | 2.578 | 601 | 1.219 | 1.392 | 715 | 308 |
| 2021-12-31 | 3.466 | 686 | 1.467 | 1.801 | 835 | 146 |
| 2025-12-26 | 4.250 | 827 | 1.742 | 2.309 | 1.018 | 43 |

Momentum und Risk decken über den ganzen Zeitraum rund 98 % der Population ab.

Die XBRL-Pflicht wurde 2009–2011 eingeführt. Fundamentalfaktoren erreichen das Universumsminimum von 200 Werten deshalb erst ab 2010/2011; der Gesamtrang zählt ab 2011-06 (160 Stichtage).

## Ergebnisse Faktorstudie (PRICE_RETURN, brutto)

**Primärendpunkt E1:** mittlere Rang-IC (Spearman) je Stichtag.

- **p (Block):** zirkulärer Kalender-Blockbootstrap mit Blocklänge 12/12/12/24 Monate, 1.999 Replikate.
- **t (NW):** Newey-West mit Bandbreite 4/6/12/24.
- **Holm:** über 7 Signale × 4 Horizonte = 28 Tests.
- **Q5−Q1:** E2, mittlerer Quintil-Spread je Stichtag.
- **Q5−SPY:** E3, Top-Quintil-Überschuss gegenüber SPY.

| Signal | H | n Stichtage | IC | t (NW) | p (Block) | Holm | Q5−Q1 | Q5−SPY |
|---|---|---|---|---|---|---|---|---|
| quality | 1M | 172 | 0,0198 | 3,65 | 0,0015 | **0,035** | −0,19 % | +0,10 % |
| quality | 3M | 172 | 0,0283 | 3,16 | 0,0015 | **0,035** | −0,66 % | +0,19 % |
| quality | 6M | 172 | 0,0348 | 2,80 | 0,0030 | 0,057 | −1,19 % | +0,37 % |
| quality | 12M | 169 | 0,0395 | 2,26 | 0,0235 | 0,235 | −3,47 % | +1,17 % |
| growth | 1M | 174 | 0,0133 | 1,99 | 0,0435 | 0,305 | +0,07 % | +0,16 % |
| growth | 3M | 174 | 0,0118 | 1,05 | 0,2915 | 0,875 | +0,09 % | +0,49 % |
| growth | 6M | 174 | 0,0142 | 0,96 | 0,3325 | 0,875 | −0,06 % | +0,74 % |
| growth | 12M | 171 | 0,0200 | 0,98 | 0,3345 | 0,875 | +0,11 % | +2,26 % |
| value | 1M | 177 | 0,0230 | 2,41 | 0,0295 | 0,266 | −0,60 % | −0,01 % |
| value | 3M | 177 | 0,0343 | 2,24 | 0,0325 | 0,266 | −1,94 % | −0,09 % |
| value | 6M | 177 | 0,0395 | 1,81 | 0,0625 | 0,375 | −3,95 % | −0,46 % |
| value | 12M | 174 | 0,0453 | 1,42 | 0,1575 | 0,630 | −10,24 % | −0,82 % |
| profitability | 1M | 173 | 0,0401 | 4,55 | 0,0010 | **0,026** | −0,09 % | +0,22 % |
| profitability | 3M | 173 | 0,0443 | 3,09 | 0,0025 | **0,050** | −0,87 % | +0,27 % |
| profitability | 6M | 173 | 0,0508 | 2,50 | 0,0115 | 0,161 | −1,84 % | +0,31 % |
| profitability | 12M | 170 | 0,0500 | 1,89 | 0,0630 | 0,375 | −8,32 % | +0,56 % |
| momentum | 1M | 192 | 0,0407 | 4,73 | 0,0005 | **0,014** | +0,33 % | +0,35 % |
| momentum | 3M | 192 | 0,0453 | 3,68 | 0,0010 | **0,026** | +0,74 % | +0,73 % |
| momentum | 6M | 192 | 0,0632 | 3,71 | 0,0010 | **0,026** | +1,77 % | +1,45 % |
| momentum | 12M | 189 | 0,0651 | 3,42 | 0,0005 | **0,014** | −0,70 % | +1,68 % |
| risk | 1M | 192 | 0,0469 | 3,67 | 0,0030 | 0,057 | −0,54 % | −0,23 % |
| risk | 3M | 192 | 0,0594 | 2,68 | 0,0185 | 0,221 | −1,97 % | −0,94 % |
| risk | 6M | 192 | 0,0745 | 2,48 | 0,0180 | 0,221 | −4,10 % | −2,22 % |
| risk | 12M | 189 | 0,0799 | 2,51 | 0,0170 | 0,221 | −11,27 % | −4,98 % |
| **Gesamtrang** | 1M | 160 | 0,0397 | 3,73 | 0,0015 | **0,035** | −0,21 % | +0,26 % |
| **Gesamtrang** | 3M | 160 | 0,0484 | 2,88 | 0,0060 | 0,096 | −0,94 % | +0,67 % |
| **Gesamtrang** | 6M | 160 | 0,0657 | 2,82 | 0,0030 | 0,057 | −2,07 % | +1,31 % |
| **Gesamtrang** | 12M | 157 | 0,0643 | 2,67 | 0,0060 | 0,096 | −11,18 % | +1,57 % |

### Mehrfachtests (Holm, 28er-Familie je Endpunkt)

| Endpunkt | Rolle | Ablehnungen bei 5 % |
|---|---|---|
| E1 IC | primär | **9/28** |
| E2 Q5−Q1 | sekundär | 0/28 |
| E3 Q5−SPY | sekundär | 0/28 |
| E4 Q5−gleichgewichtete Population | sekundär | 0/28 |

### Lesart

- Die Rang-ICs sind klein (0,01–0,08) und überwiegend positiv.
- Für die meisten Fundamental- und Risikosignale ist der **mittlere** Quintil-Spread negativ. Die Rangbeziehung trägt also nicht in die Mittelwerte der Extremquintile: Wenige sehr hohe Renditen im unteren Quintil dominieren die Mittel, und Survivors verstärken diesen Effekt.
- Kein Top-Quintil-Überschuss ist nach Holm signifikant, weder gegenüber SPY noch gegenüber der gleichgewichteten Population.

### Teilperioden (Gesamtrang, IC 1M)

| Zeitraum | IC | t | n |
|---|---|---|---|
| 2010–2014 | −0,007 | −0,32 | 28 |
| 2015–2019 | 0,040 | 3,10 | 60 |
| 2020–2025 | 0,057 | 3,23 | 72 |

### Regime (SPY, 26 W Trend / 13 W Volatilität, Gesamtrang IC 1M)

| Regime | IC | t | n |
|---|---|---|---|
| positiver Trend, niedrige Volatilität | 0,036 | 2,77 | 116 |
| negativer Trend, niedrige Volatilität | 0,063 | 3,24 | 19 |
| negativer Trend, hohe Volatilität | 0,052 | 1,65 | 16 |
| positiver Trend, hohe Volatilität | 0,019 | 0,77 | 9 |

Die Regimewerte sind deskriptiv.

### Fehlende Ausgänge

- **Zensiert:** 0, außer 9 bei 12M für Momentum und Risk.
- **Unreif:** bei 12M 2,5–11,7 Tsd. Ausgänge (Stichtage 2025).
- **Schranken für E3:** −100 % und 0 % für zensierte Ausgänge sind identisch, weil in Q5 nichts zensiert ist.

## Strategie Top-50 (Gesamtrang, gleichgewichtet, monatlich, PRICE_RETURN)

- **Engine:** `research-portfolio.cjs` 1.2.0 im Modus HISTORICAL_PRICE_SIMULATION.
- **Zeitraum:** 2011-06-24 bis 2026-01-30 (14,6 Jahre), 175 Rebalancings, 589 verschiedene Titel.

| | Top-50 BASE (15 bp/Seite) | LOW (5 bp) | HIGH (30 bp) | SPY |
|---|---|---|---|---|
| CAGR | 13,01 % | 13,71 % | 11,98 % | 12,32 % |
| Volatilität | 20,2 % | 20,2 % | 20,3 % | 16,3 % |
| Sharpe (rf 0) | 0,70 | 0,73 | 0,66 | 0,79 |
| MaxDD | −35,4 % (02–03/2020) | −35,3 % | −35,4 % | −32,2 % |
| Turnover (einseitig, p. a.) | 3,06 | 3,06 | 3,06 | – |
| Monatlicher Überschuss ggü. SPY | +0,14 % (Block-p 0,378, 95 %-KI [−0,20 %, +0,44 %]) | +0,19 % (p 0,224) | +0,06 % (p 0,695) | – |

Die gleichgewichtete Rangpopulation (ohne Kosten, deskriptiv) erreicht 13,98 % CAGR. **Die Top-50-Strategie bleibt hinter der gleichgewichteten Survivor-Population zurück und schlägt SPY nicht statistisch belastbar.**

## Unabhängige Python-Gegenrechnung (Rechenparität, kein Holdout)

| Prüfung | Vergleiche | Abweichungen |
|---|---|---|
| B Kursfaktoren | 14.400 | 0 |
| C Perzentile, Faktorscores, Gesamtrang (12 volle Querschnitte) | 182.343 | 0 |
| D IC, Q5−Q1, Q5−SPY, n (8 Stichtage × 7 Signale × 4 Horizonte) | 496 | 0 |
| E Ledger Top-50 BASE | 763 Bewertungstage | max. rel. 1,6e-14 |

**A, SEC-Rohfakten direkt aus companyfacts** (bewusst einfachere, eigene Auswahl):

- `equityToAssets`: 229/249 identisch.
- Marktkapitalisierung: 291/302 identisch.

Die Abweichungen sind gezählt, nicht angeglichen. Sie stammen aus anderer Konzept- und Periodenwahl. Zwei Fälle sind echte Datenbefunde:

- **Filer-Skalenfehler im Original-XBRL:** Citigroup, 10-Q Q3/2009, `us-gaap:CommonStockSharesOutstanding` = 22.863.947 statt rund 22,9 Mrd. Die Pipeline übernimmt den Wert; die Marktkapitalisierung C am 2010-01-29 ist dadurch um Faktor 1.000 zu klein. Der Fall fiel in einem Debug-Lauf der Gegenrechnung auf; das PIT-Dokument wurde direkt geprüft.
- **Spin-off-Faktoren als Splits:** Die Tiingo-Reihen führen Spin-off-Anpassungen in `corporateActions.splits`, z. B. GE 2023-01-04 1,281 (GE HealthCare) und 2024-04-02 1,253. Die split-konsistente Marktkapitalisierung überschätzt deshalb GE am 2023-03-31 (133 statt 104 Mrd.). Das ist ein Datenproblem von ADR-002/CA, keines dieser Studie.

## Bewertung

**Als Rekonstruktion belastbar:**

- Die Mechanik ist vollständig reproduzierbar:
  - PIT-Auflösung der SEC-Werte mit der Produkt-Pipeline;
  - Faktorbildung mit den Produkt-Engines;
  - Ranking vor Ausgang;
  - Ledger;
  - Inferenz mit registrierten Blöcken.
- Die unabhängige Gegenrechnung bestätigt Kursfaktoren, Scores, IC und Ledger exakt.
- Kursbasierte Faktoren (Momentum, Risk) sind über 2010–2025 durchgehend abgedeckt. Die positive Rang-IC von Momentum besteht Holm auf allen Horizonten.

**Nicht belastbar oder nicht übertragbar:**

1. Die Population besteht aus heutigen Survivors, ist also bedingt. Kein Schluss auf den damaligen Markt ist möglich; ein Survivorship-Effekt ist für Low-Risk und Value besonders plausibel.
2. Kursrendite ohne Dividenden, ex post bereinigt.
3. Wochen- statt Tagesfenster, keine Peer-Normierung, keine Branchenvorlagen. Der Gesamtrang deckt nur rund 19–23 % der Population ab (Profitability ist der Engpass).
4. Fundamentalfaktoren erst ab 2011 belastbar abgedeckt; die erste Teilperiode zeigt keinen Effekt.
5. Erkundete Historie ohne Holdout. Die Faktorwahl folgt der Literatur.
6. Wirtschaftlich zeigt sich kein belegter Vorteil:
   - Q5-Überschüsse sind nach Holm nicht signifikant.
   - Die Top-50-Strategie liegt unter der gleichgewichteten Population, und ihre Sharpe Ratio liegt unter der von SPY.
7. Datenfehler in Original-XBRL und Spin-off-Faktoren in Split-Reihen wirken ungeschützt.

**Betroffene Bedingungen der aktiven Verträge:** keine.

- FACTOR_RANKING_BACKTEST bleibt bei `factorHistory` 2/24, `completedForward` 0/12 und `membershipHistory` 2/24.
- STRATEGY_BACKTEST bleibt bei `membershipHistory` 2/24 und `factorHistory` 2/24.
- `historicalStudyCanReplace = false` bleibt richtig.

## Entscheidungsvorlage (nur Vorlage, keine Aktivierung)

Ein getrennter, früher nutzbarer **„rekonstruierter Research-Scope“** wäre begründbar, wenn er alle folgenden Bedingungen erfüllt:

1. **Eigene Kennzeichnung:** eine eigene Evidenzklasse `RECONSTRUCTION`, nie als „Backtest“ oder „historisches VU-Signal“. Pflichttext: „rückblickend nachgerechnet, heutige Survivors, Kursrendite“.
2. **Keine Vertragswirkung:** Er zählt nicht in `factorHistory`, `completedForward` oder `membershipHistory` und ändert kein Gate, keine Frische und keine Stufe.
3. **Mindestbedingungen:**
   - Population mit Delistings: nach Option `listingLifecycleEvidence` des Strangs POPULATION plus quantifizierte Survivorship-Sensitivität;
   - Gesamtrendite, wo belegt;
   - Tagesfenster, sobald historische Tagesreihen vorliegen;
   - Peer-Normierung mit PIT-SIC aus `sic-history`;
   - Branchenvorlagen;
   - Korrekturregister für XBRL-Skalenfehler und Spin-off-Faktoren.
4. **Zulässige Aussagen:** nur Rang-IC und Quintile mit Holm über die registrierte Familie. Keine Strategie-Renditeaussage, solange E3/E4 und die Strategie keinen belastbaren Überschuss zeigen; derzeit zeigen sie keinen.
5. **Bestätigung:** Jede neue Faktorversion braucht eine neue Registrierung. Bestätigung kommt nur aus den vorwärts gesammelten Ständen (Pfad B), nicht aus einer zweiten Rekonstruktion.

## Ablauf, Ressourcen, Offenlegung

- **SEC:**
  - genau **1** Abruf: `companyfacts.zip`, 1.412.158.210 Byte, SHA-256 `7e4f93a3…acda8`, privat im Scratchpad;
  - keine Einzelabrufe.
- **Laufzeiten:**

  | Schritt | Dauer |
  |---|---|
  | PIT-Dokumente | ca. 75 min (3 Prozesse, geteilt mit anderen Strängen, in drei fortsetzbaren Abschnitten) |
  | Panel | 3 min |
  | Studie | 26 min |
  | Strategie | 1 min |
  | Python-Gegenrechnung | 1 min |

- **Nach der Registrierung geändert, nur Laufzeit und Speicher, ohne Designänderung:**
  - Memo für `to_instant`: identische Dokumente nachgewiesen;
  - Panel als JSONL;
  - Studienkalender je Jahresblock auf das Fenster beschränkt.
- **Debug-Lauf:** Ein Lauf auf unvollständigen PIT-Dokumenten (1.491 von 4.026 Emittenten) diente nur dem Pipeline-Test. Seine Zahlen wurden nicht verwendet; Parameter wurden danach nicht verändert.
- **Reproduktion:**
  ```
  python3 -I scripts/quant/v10/factor/fetch_companyfacts.py <priv>
  python3 -I scripts/quant/v10/factor/pit_docs.py <priv>/bulk/companyfacts.zip <priv>/jobs.json <priv>/docs
  node scripts/quant/v10/factor/panel.cjs <priv> [--loader-options '<json>']
  node scripts/quant/v10/factor/study.cjs <priv> [--out <dir>]
  node scripts/quant/v10/factor/strategy.cjs <priv> [--out <dir>]
  python3 -I scripts/quant/v10/factor/verify_factor.py <priv> <priv>/bulk/companyfacts.zip --out <file>
  ```
  `jobs.json` erzeugt `node scripts/quant/v10/factor/jobs.cjs <priv>` (erstes Monatsende je CIK ab der ersten Wochenschlussnotierung; byte-identisch nachgeprüft).
- **Optionen:** `--loader-options '{"identityEvidence":true,"corporateActionEvidence":true,"listingLifecycleEvidence":true}'` wird durchgereicht, sobald die Option existiert. Das Feld `listingLifecycle` wird defensiv gelesen. Die Terminal-Barabfindung ist in diesem Stand noch nicht ausgewertet, denn ohne die Option gibt es keine Terminalfälle.
