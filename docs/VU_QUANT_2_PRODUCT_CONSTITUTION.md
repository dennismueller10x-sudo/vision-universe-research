# Vision Universe® Quant 2.0 — Product Constitution

Status: **KANONISCHE PRODUKTSPEZIFIKATION NACH MASTER-REMATCH**  
Stichtag: 2026-09-20  
Code-Basis: `main@1a192f923a8dffc267272495091fa577780a8f0d`  
Geltungsbereich: Vision Universe Quant 2.0; **nicht** Vision Universe Discovery

## 0. Verfassungsrang und Entscheidungsregeln

Diese Constitution verbindet die wiedergefundene ursprüngliche Produktvision, den aktuellen Code und die verifizierte Produktionsrealität. Bei Widersprüchen gilt:

1. Datenwahrheit, Zeitkonsistenz und reproduzierbare Evidenz haben Vorrang vor sichtbarer Vollständigkeit.
2. Eine vorhandene Engine ist erst Produktfunktion, wenn sie mit kanonischen realen Daten verbunden, sichtbar, funktional und produktionsverifiziert ist.
3. `CI GREEN` bedeutet nicht `PRODUCT COMPLETE`.
4. Bestehende Datenplattformen werden erweitert, nicht dupliziert.
5. Quant 2.0 und Discovery bleiben getrennte Produkte. Gemeinsame Infrastruktur ist kein gemeinsames Produktmodell.
6. Änderungen an Methodik erzeugen eine neue versionierte Methodik. Vergangene Ergebnisse werden nie stillschweigend umgedeutet.
7. Unverfügbare oder nicht zertifizierte Daten führen zu `UNAVAILABLE` bzw. einem geschlossenen Gate, nicht zu Ersatzwerten.

## 1. Product North Star

**Investment Intelligence for Real Investors — the decision layer before the broker.**

Der Broker beantwortet Besitz, Preis und Ausführung. Quant 2.0 beantwortet, welche Aktie interessant ist, warum sich ihr Zustand verändert, welche Evidenz dafür oder dagegen spricht, wann ein Setup entsteht, wodurch es ungültig wird und wie dieselbe Logik historisch funktioniert hätte.

Der kanonische Produktfluss lautet:

> Investment Idea → verständliche Regeln → echtes Produktuniversum → Factor DNA → PIT-sichere Evidenz → Setup und Risiko → aktuelle Kandidaten → Monitoring

KI interpretiert Nutzerabsichten. Deterministische, versionierte Engines rechnen und entscheiden.

## 2. Target User

Primär:

- Trade-Republic-/Neo-Broker-Nutzer, die vor der Order eine bessere Entscheidung treffen wollen;
- ambitionierte Privatanleger;
- Halbprofis, die Tiefe und Reproduzierbarkeit benötigen, aber kein Terminal bedienen wollen.

Quant 2.0 ist weder ein professionelles Terminal noch ein Kennzahlenfriedhof. Es bietet institutionelle Tiefe mit Consumer UX.

## 3. Product Promise

Quant 2.0 übersetzt Markt-, Unternehmens- und Methodendaten in eine erklärbare Entscheidungskette:

- **Meaning:** Was ist passiert, welcher Zustand liegt vor?
- **Explanation:** Warum ist dieser Zustand entstanden?
- **Evidence:** Welche Faktoren, Zeitreihen, Regeln und Quellen tragen die Aussage?
- **Workspace:** Wie kann der Nutzer prüfen, vergleichen, screenen, testen und überwachen?

Keine Renditeaussage ohne Methodik. Keine Strategie ohne Regeln. Kein Backtest ohne Evidenzqualität. Kein KI-Ergebnis mit Schattenlogik.

## 4. UX Principles

1. **Simple on the surface, powerful underneath.**
2. Pro Komponente zuerst eine verständliche Kernaussage, dann Erklärung und Evidenz.
3. Progressive Offenlegung statt permanenter Informationsdichte.
4. Mobile-first, aber keine fachliche Reduktion der Evidenz.
5. Jede Zahl zeigt Stand, Einheit, Quelle und – wo relevant – Verfügbarkeitszeitpunkt.
6. Unsicherheit, Datenlücken und alternative Szenarien werden sichtbar gemacht.
7. Workspaces vertiefen die integrierte Stock Journey; sie ersetzen sie nicht.

## 5. Data Foundation

Die bestehende Datenarchitektur ist bindend:

| Domäne | Kanonischer Pfad | Produktregel |
|---|---|---|
| Identität | Company / Security Master | einzige Identität und Product-Eligibility-Wahrheit |
| Fundamentals | bestehende SEC-Normalisierung und Consumer-Artefakte | keine zweite Fundamentals-Pipeline |
| PIT / Revisionen | bestehender interner SEC-/R2-Pfad | interne Verarbeitung; keine öffentliche PIT-API für Standardansichten |
| Historische Kurse | bestehende kanonische History-Artefakte | keine zweite Market-Data-Pipeline |
| Intraday | bestehender Snapshot-Pfad | Stand und Freshness explizit |
| Realtime | bestehender Cloudflare-Live-Pfad | `wss://live.visionuniverse.de/live`; keine zweite Realtime-Infrastruktur |
| Product Data | vorberechnete/materialisierte Consumer-Daten | Standardweg für normale Produktansichten |

`R2 / SEC / PIT → interne Verarbeitung → Materialisierung / Cache / Product Data → bestehender Frontend-Auslieferungsweg → Quant 2.0`

Vercel ist nur für echte spätere On-Demand-Jobs zulässig, etwa Atlas Deep Dive, gezielte PIT-Abfrage oder individuelle Backtests. Der Standardpfad benötigt weder öffentlichen PIT-Endpunkt noch Vercel-R2-Secret.

## 6. Company Master und Produktuniversum

Der Company Master ist die einzige Quelle für Identität, Listing-Zuordnung und Product Eligibility. Gemessener Rematch-Stand:

| Messgröße | Wert |
|---|---:|
| veröffentlichte Instrument-Zeilen | 7.809 |
| kanonische Member-IDs | 7.803 |
| kanonisches Produktuniversum | 6.875 |
| davon `ELIGIBLE` | 5.940 |
| davon `SEPARATE_CLASS` | 782 |
| davon `REVIEW` | 153 |
| mit irgendeinem aktiven Listing | 6.868 |
| symboladressierbar in der Suche | 6.875 |
| mit durchsuchbarem Firmennamen | 5.775 |
| nur über Symbol auffindbar | 1.100 |

Eine UI-Auswahl, Preview-Liste oder Provider-Grenze darf das kanonische Universum nicht neu definieren. Identitätssuche und Intelligence-Verfügbarkeit sind getrennte Fähigkeiten; ein gefundener Titel darf einen klaren `UNAVAILABLE`-Zustand zeigen, aber nie durch synthetische Produktdaten ersetzt werden.

## 7. Quant Model

Der VU Quant Score ist ein erklärbarer, relativer Multifaktor-Score. Die Verarbeitungskette ist verbindlich:

`Validierung → Winsorization → Peer-/Global-Normalisierung → Faktorwerte → Composite → Universumsperzentil`

Quant V1 verwendet teilweise industrie-neutrale Vergleichswerte: 70 % geeignete Peer-Gruppe, 30 % globales Universum; bei zu kleiner Industrie erfolgt ein dokumentierter Fallback über Sektor zum Universum. Fehlende Daten bleiben fehlend. Coverage und Confidence werden separat ausgewiesen.

### 7.1 Aktive, versionierte V1-Methodik

| Faktor | Gewicht | Kerndimensionen |
|---|---:|---|
| Quality | 30 % | ROIC, Gross Profitability, FCF-/Operating-Marge, Bilanzqualität, Leverage |
| Momentum | 30 % | 12-1/6M/3M, Relative Strength, 52W-Distanz, 50/200-Tage-Trend |
| Growth | 20 % | Umsatz-, EPS-, FCF-Wachstum, Margenexpansion |
| Value | 15 % | FCF-/Earnings-Yield, EV/EBITDA, P/FCF, EV/Sales |
| Risk | 5 % | Volatilität, Downside Volatility, Max Drawdown, Beta |

### 7.2 Methoden-Widerspruch und Owner-Gate

Die aktuelle Zielbeschreibung nennt sieben Faktoren: Quality, Growth, Momentum, Value, Profitability, Revisions und Risk. Das ist **nicht** die bestehende V1-Methodik:

- Profitability ist in V1 eine transparente Unterdimension von Quality, kein unabhängiger Faktor.
- Revisions ist im Schema vorhanden, aber wegen fehlender zertifizierter historischer Konsensschätzungen inaktiv und erhält 0 %.

Bis zu einer expliziten Owner-Methodenentscheidung bleibt V1 unverändert. Ein separates siebenfaktoriges Modell darf nur als versioniertes `quant-v2` entstehen, mit neuen Gewichten, Überschneidungsanalyse, Missing-Data-Policy, historischer Vergleichsregel und validierter Revisionsquelle. Ein stilles Umgewichten ist verboten.

## 8. Factor DNA

Factor DNA zeigt nicht nur den Composite, sondern je Faktor:

- Inputs und Formeln;
- Transformation und Winsorization;
- Peer- und Global-Rang;
- Gewicht;
- Mess- und Datenzeitpunkt;
- Datenquelle;
- Coverage und Missing-Data-Policy;
- Interpretation und Grenzen.

Profitability bleibt in V1 als Quality-Unterdimension sichtbar. Revisions wird als `UNAVAILABLE` erklärt, bis die Daten- und Historienanforderungen erfüllt sind. Kein Faktor ist eine Blackbox.

## 9. Score Momentum

Score Momentum benötigt PIT-konsistente, versionierte Score-Snapshots. Es umfasst:

- Score-Veränderung und 30/60-Tage-Velocity;
- Beschleunigung;
- Upgrades und Downgrades;
- Faktorbeiträge und Factor Rotation;
- Revisionsimpulse, sobald zertifiziert;
- Trendwechsel und Aussage-Confidence.

Die Produktform ist erklärend: „Score steigt seit sechs Wochen von 71 auf 82, getragen von X und Y.“ Der vorhandene Engine-Code über synthetische Historien ist keine reale Produktfreigabe.

## 10. Quant Radar

Quant Radar ist eine regelbasierte, materialisierte Produktfläche, keine Marketing-Kartensammlung. Kanonische Module:

- New Momentum Leaders;
- Quality Leaders / Improving Quality;
- Revision Leaders;
- 52W High + Quant Confirmation;
- Relative Strength Breakout;
- Quality + Momentum;
- Value Momentum;
- Factor Breakouts / Emerging Compounders;
- Risk Deterioration;
- New Setup / Setup Invalidated.

Jedes Ereignis besitzt kanonische Regel-ID, Beobachtungszeit, Vorher-/Nachherzustand, Evidenz und Link zur Stock Journey. Radar-Regeln nutzen den Common Rule Contract.

## 11. Market Regime

Market Regime ist eine erklärbare Kontext-Engine über ein ausreichend breites Universum. Zielzustände:

`STRONG → POSITIVE → MIXED → RISK_RISING → WEAK`

Inputs können Breadth, Leadership, New Highs/Lows, Volatilität, Drawdown, Sektorpartizipation, Relative Strength und Trend enthalten. Jeder Zustand zeigt Treiber und Gegenargumente. Eine Fünf-Titel-Auswahl darf nie als Marktregime dienen. Regime ist zunächst Kontext und keine undokumentierte Faktor-Timing-Maschine.

## 12. Setup Engine

Die gemeinsame Setup Engine verbindet Quant, Fundamentals, Technical und Strategy Rules, ohne Elliott in den Quant Score zu mischen.

Kanonische Zustände:

`NO_SETUP → WATCH → SETUP_FORMING → CONFIRMED → ACTIVE → RISK_RISING → INVALIDATED → EXIT`

Jeder Zustand enthält:

- `whyNow`;
- `entryCondition`;
- `confirmation`;
- `invalidation`;
- `risk`;
- `exitCondition`;
- `timeHorizon`;
- kanonische Regel-IDs und Evidenzzeitpunkte.

Zustände werden deterministisch aus versionierten Regeln abgeleitet. Freie Buy-/Sell-Labels sind unzulässig.

## 13. Technical

Technical ist sowohl eigener Workspace als auch Input für Quant-Kontext, Screener, Signals, Strategy Lab, Setup Engine und Backtesting. Mindestens methodisch definierte Familien:

- Trend und Market Structure;
- SMA/EMA;
- RSI, MACD und Momentum;
- ATR, Volatilität und Drawdown;
- Relative Strength;
- Volume;
- Breakout;
- Support / Resistance;
- Multi-Timeframe und Regime.

Aktuelle Technical-/Elliott-Snapshots dürfen gescreent werden. Sie werden erst historisch getestet, wenn eine zeitlich zertifizierte Snapshot-/Feature-Folge existiert. Der verbliebene Legacy-OPS-Evaluator des Technical Scanners ist in den Canonical Rule Contract zu überführen; keine dritte Regel-Engine.

## 14. Elliott

Elliott bleibt eine ergänzende Szenarioebene:

- Primary und Alternative Count;
- Invalidations;
- Fibonacci Relationships;
- Timeframe Awareness;
- Evidenz und Method-Fit-Confidence.

Elliott ist keine sichere Prognose, keine Wahrscheinlichkeit ohne Kalibrierung und kein Bestandteil des VU Quant Score. Beta-Limits und mehrdeutige Counts werden sichtbar benannt.

## 15. Fundamentals

Fundamentals nutzen ausschließlich den bestehenden SEC-/Consumer-/PIT-Unterbau. Produktrelevant sind Revenue, Earnings, EPS, FCF, Margins, ROE/ROIC, Balance Sheet, Debt, Cash Flow, Growth, Quartalstrends, Branchenmetriken und Verfügbarkeits-/Revisionskontext.

Normale Ansichten konsumieren materialisierte Product Data. Historische Ansicht und historischer Informationsstand sind klar getrennt. Backtests verwenden nur Werte, die zum damaligen Cutoff anhand `filedAt`, `acceptedAt`, Revisionen und Restatements verfügbar waren.

## 16. Valuation

Valuation ist eine eigene erklärbare Dimension und Input für Quant/Setup:

- P/E, EV/EBITDA, FCF Yield, P/S und weitere definierte Multiples;
- historische Bewertungsbänder;
- Peer-Vergleich;
- wachstumsadjustierte Bewertung;
- Erwartungen und – erst nach eigenem Modellvertrag – Reverse DCF.

Aktuelle Rohmultiples allein erfüllen diese Produktfläche nicht.

## 17. Screener

Der Screener übersetzt visuelle Regeln, VUQL und Atlas-Intention in denselben typisierten Query AST. Er operiert auf dem kanonischen Produktuniversum und zeigt je Feld Verfügbarkeit, Einheit, Zeitbezug und Backtest-Eignung. UI-Subsets dürfen Fähigkeiten begrenzen, aber nie eigene Semantik implementieren.

## 18. Strategy Lab

Jede Strategie ist eine unveränderliche, versionierte Regeldefinition mit Lineage. Pflichtfelder:

- Universe, Filters und Factors;
- Entry Rules und Confirmation;
- Exit Rules und Invalidation;
- Rebalancing;
- Position Sizing und Risk Rules;
- Cost/Slippage Assumptions;
- Benchmark;
- Daten-/Methodikversion.

Historisch vollständig wiedergefunden sind Quality Compounders, Momentum Leaders, Quality Momentum, GARP und Future Leaders. Dividend Growth, Small Cap Quality, Earnings Revision Leaders, Defensive Quality und Value Momentum sind Zielstrategien, aber derzeit keine belastbaren ausführbaren Spezifikationen. Labels werden nicht als Regeln ausgegeben.

## 19. Common Rule Engine

Verbindliches Prinzip:

`SCREENING RULE = SIGNAL RULE = ALERT RULE = STRATEGY RULE = BACKTEST RULE`

Der Canonical Rule Contract ist der versionierte Stock-Selection-Predicate aus `universe + filters`. Sortierung, Limit, Delivery und Portfoliokonstruktion sind Consumer-Konfiguration und ändern die Regelidentität nicht. Derselbe Predicate-Hash und dieselbe Evaluationssemantik gelten überall.

Der Contract ist heute für Screener → Strategy → Backtest und zwei EOD-Signalrezepte umgesetzt. Produktvollständigkeit erfordert zusätzlich Alerts, Radar, Watchlist-Transitions, den restlichen Technical Scanner und dieselbe reale Universumsauflösung.

## 20. Signals und Alerts

Ein Signal ist ein beobachteter Zustandsübergang einer kanonischen Regel, kein Meinungslabel. Es enthält Regel-ID, `ENTERED`/`EXITED`, Beobachtungszeit, Datenmodus, Evidenz und Setup-Auswirkung. Alerts verwenden dieselbe Regel und ergänzen nur Subscription und Delivery. Ohne Scheduler/Delivery bleibt ein Alert `NOT_CONFIGURED`.

## 21. Backtesting

Backtesting ist Kernfunktion, aber realer Lauf bleibt geschlossen, bis folgende Evidenz gemeinsam vorliegt:

- historische Universumsmitgliedschaft und Delistings;
- PIT-Fundamentals inklusive Availability und Revisionen;
- Corporate Actions;
- historische Kurs- und Ausführungspreise;
- Kosten, Slippage, Rebalancing und Position Sizing;
- Benchmark, Exposure und Reproduktionsmanifest;
- keine Look-Ahead-Verletzung.

Pflichtoutputs: CAGR, Total Return, Volatility, Sharpe, Sortino, Max Drawdown, Recovery, Win Rate, Exposure, Turnover, Trades und Benchmark Relative Return.

Der vorhandene Backtest-Engine-Code erfüllt einen großen Teil der Rechenmethodik; produktiv ausführbar sind derzeit nur offen deklarierte synthetische Modellläufe. `REAL_BACKTEST_GATE_NOT_VALIDATED` ist der korrekte Zustand.

## 22. Backtest Trust Score

Der Trust Score bewertet Evidenzqualität, nicht Rendite. V1-Gewichtung:

| Block | Gewicht |
|---|---:|
| Data Integrity | 35 % |
| Execution Realism | 20 % |
| Statistical Robustness | 30 % |
| Sample Adequacy | 15 % |

Hard Caps gelten unter anderem ohne PIT, ohne Delistings sowie bei Optimierung ohne Out-of-Sample-Test. Multiple-Testing-Kontrolle, ausgeführte OOS-/Sensitivity-Validierung und Cross-Market-Robustheit bleiben als echte Evidenz auszuführen; Boolean-Selbstauskünfte reichen nicht.

## 23. Portfolio Intelligence

Portfolio Intelligence geht über Positionsspeicherung und USD-Bewertung hinaus. Ziel sind Exposures, Konzentration, Sektor-/Faktor-DNA, Korrelation, Drawdown, Risikoquellen, Setup-Änderungen und Portfolio-Auswirkungen. Alle Resultate verwenden dieselben kanonischen Stock-, Quant- und Signal-Services.

## 24. Atlas / AI

Atlas ist Interface, nicht Wahrheit. Natural Language wird ausschließlich in validierte Tool-Aufrufe, Query AST, Strategy Definitions und Backtest Jobs übersetzt. Kein AI→SQL, keine Schattenmetriken und keine eigenen Regeln.

Beispiele wie „profitable Aktien nahe 52-Wochen-Hoch“ werden erst in sichtbare Regeln übersetzt und dann vom kanonischen Screener ausgeführt. Änderungen an Strategien erzeugen neue Lineage-Versionen. Antworten zitieren Datenstand, Methodik und Einschränkungen.

## 25. VUQL / Tool Layer

VUQL ist die lesbare, portable Darstellung des kanonischen JSON AST; es ist nicht die interne Wahrheit. Es muss verlustfrei parse-/serialisierbar sein.

Kanonische Tool-Familie:

- `screenStocks`
- `getStockIntelligence`
- `getQuantScore` / `getFactorDNA`
- `getFundamentals`
- `getTechnicalState`
- `getMarketRegime`
- `getSignals`
- `getStrategyMatch`
- `runBacktest`
- `compareStocks`
- Portfolio-/Watchlist-Änderungen

Heute existieren ein breiter synthetischer Legacy-Tool-Layer und fünf reale, read-only VU2-Tools. Die Konvergenz muss dieselben Product Services nutzen; keine zweite AI-Datenebene.

## 26. Stock Journey

Die verbindliche Journey lautet:

`Header → What is happening → Intelligence summary → Setup state → Why now → Fundamentals → Valuation → Quant Factor DNA → Technical → Elliott scenarios → Strategy match → Historical backtest evidence → Risks → Invalidation / Exit → Deep workspaces`

Die Journey orchestriert bestehende Workspaces. Ein Bündel von Links auf isolierte Module erfüllt sie nicht.

## 27. Product Acceptance Gates

Ein Release gilt erst als Produktfortschritt, wenn die betroffene Funktion folgende Gates erfüllt:

| Gate | Anforderung |
|---|---|
| Specification | versionierter Contract und Methodik vorhanden |
| Data | kanonische Quelle, Zeitsemantik und Missing Policy belegt |
| Universe | gemessene Coverage und keine versteckte Demo-Grenze |
| Integration | gleiche Services/Regeln in allen Consumern |
| Visibility | in der vorgesehenen Journey auffindbar |
| Functional | reale Eingaben, Fehlzustände und Interaktionen getestet |
| Backtest | historische Eignung separat zertifiziert |
| QA | Unit, Integration, Browser, mobile und Production Smoke |
| Discovery | Regressionstest grün; `DISCOVERY_CHANGED = false` |
| Provenance | Commit, Methodikversion, Datenstand und Evidenz protokolliert |

## 28. Known Data Limits

- VU2-Full-Intelligence ist derzeit auf AAPL, MSFT, NVDA, JPM und XOM begrenzt, obwohl Identität und viele Datenartefakte wesentlich breiter sind.
- Reale Peer-Perzentilierung und ein produktiver VU Quant Score sind nicht verbunden.
- Revisionsfaktor besitzt keine zertifizierte historische Konsensschätzungsquelle.
- Historische Technical-/Elliott-Featurefolgen sind nicht backtest-zertifiziert.
- Reales Backtesting besitzt noch keinen gemeinsam validierten historischen Universe-/PIT-/Corporate-Action-/Execution-Provider.
- Market Regime fehlt als Product Engine.
- Advanced Valuation, Portfolio Intelligence und freie Atlas-NL-Workflows sind nicht vollständig.
- Unterschiede zwischen auf verschiedenen Tagen materialisierten Coverage-Artefakten sind als Snapshot-Differenz zu behandeln, nicht zusammenzurechnen.

## 29. Discovery Boundary

Vision Universe Discovery bleibt ein separates Produkt mit eigener UX, Navigation, Collections, Produktlogik, Layout und Interaction Model. Es wird weder in Quant integriert noch durch Quant ersetzt. Geteilt werden dürfen nur kanonische Infrastruktur und unveränderte Consumer-Verträge.

Vor jeder Änderung an gemeinsamem Unterbau gelten Impact-Analyse, Discovery-Regressionstests und visueller/funktionaler Ausschluss von Regressionen.

Verbindliche Gates:

`DISCOVERY_ARCHITECTURE_PRESERVED = PASS`  
`DISCOVERY_CHANGED = false`  
`DISCOVERY_REGRESSION = false`

## 30. Ausführbarer Recovery-Orchestrator

Der Rematch und jede folgende Integrationsphase verwenden diesen Zustandsgraphen:

1. `SYNC` — aktuellen Main-/PR-/CI-/Produktionsstand fixieren.
2. `OBSERVE` — Code, Artefakte und Produktion messen.
3. `RECONSTRUCT` — historische Vision und Research-Provenienz zuordnen.
4. `CONTRADICTION_CHECK` — Methodik-, Daten- und Produktwidersprüche erfassen.
5. `SCOPE_LOCK` — Discovery- und Architekturgrenzen fixieren.
6. `SPECIFY` — Contract, Acceptance Gates und Owner-Entscheidungen festlegen.
7. `IMPLEMENT` — kleinste dependency-correct Integration; erst nach Rematch-Freigabe.
8. `TEST → REVIEW → REPAIR` — bis alle betroffenen Gates grün sind.
9. `VALIDATE` — reale Coverage, Browser und Production Smoke.
10. `RECORD` — Ledger, Methodik, Datenstand und bekannte Grenzen aktualisieren.
11. `DEPLOY → PRODUCTION_VERIFY` — erst danach nächste Abhängigkeit.

Recovery Paths:

- Datenquelle fehlt → fail closed, Capability dokumentieren, keine Fixture in realer UI.
- CI-/Deploy-Fehler → letzten grünen Zustand isolieren, reparieren, vollständiges Gate wiederholen.
- Methodikwiderspruch → Owner-Gate; keine implizite Produktentscheidung.
- gemeinsame Infrastruktur betroffen → Discovery-Regressionsgate vor Merge und nach Deploy.
- externe Credentials/Provider fehlen → exakt benötigte bestehende sichere Variablen nennen; keine Werte im Chat und keine neuen Secrets ohne Auftrag.

Owner-Escalations sind auf echte Produktentscheidungen begrenzt: Quant-V2-Faktortaxonomie/Gewichte, vollständige Regeln der fünf fehlenden Strategien, neue lizenzierte Revisionsdaten oder Kosten-/Providerentscheidungen. Alle anderen Arbeiten laufen nach dieser Constitution autonom weiter.
