# Vision Universe Quant – Backtest-Zertifizierungsmethodik V1

**Status:** Spezifikationsentwurf zur fachlichen Freigabe
**Version:** `quant-backtest-certification-methodology-1.0.0`
**Gültig ab:** nach ausdrücklicher Owner-Freigabe und Implementierung
**Bezug:** Main `eddcde8e8880cc2ae6f8c47b936ffacfc5015b49` (23.10.2026); PR #862 ist offen und nicht Bestandteil dieser Arbeit.
**Maschinenlesbare Fassung:** [`quant/methodology/backtest-certification-methodology-v1.0.0.json`](../quant/methodology/backtest-certification-methodology-v1.0.0.json)

Diese Spezifikation legt gemeinsame Eingangsdaten, Studienentwurf, Auswertung und Freigabekriterien für alle sechs bestehenden Backtest-Arten fest. Sie ändert keine Engine, keinen bestehenden Gate-Vertrag, kein Ergebnis und keinen Zertifizierungsstatus. Die Schwellen unten sind ein vorgeschlagener V1-Vertrag. Sie gelten erst nach fachlicher Freigabe; bestehende strengere Gates bleiben zusätzlich wirksam.

## 1. Begriffe und Ergebnisstufen

Jedes Ergebnis trägt getrennte Kennzeichen für **technische Ausführung**, **methodische Zertifizierung**, **statistische Evidenz** und **wirtschaftliche Wirkung**:

| Stufe | Bedeutung | Was sie nicht aussagt |
|---|---|---|
| Technisch ausgeführt | Fixierte Engine, Eingaben und Parameter liefen reproduzierbar; PIT-/Look-ahead- und Integritätsprüfungen bestanden. | Keine Aussage zur Güte des Studienentwurfs oder zur Wirkung. |
| Methodisch zertifiziert | Der passende Universums-, PIT-, Survivorship-, Regime-, OOS-, Kosten- und Reproduzierbarkeitsvertrag ist bestanden. Negative und Null-Ergebnisse sind zulässig. | Kein Nachweis eines Effekts. |
| Statistischer Effekt nachgewiesen | Vorab definierter primärer Schätzer besteht die vorregistrierte cluster-robuste Inferenz- und Fehlerkontrolle. Vorzeichen separat ausweisen. | Statistische Signifikanz allein ist kein wirtschaftlicher Vorteil. |
| Positiver wirtschaftlicher Vorteil | Vorab definierte Netto-Kennzahl übersteigt eine vorab festgelegte Mindestwirkung und ihre Unsicherheit ist vereinbar mit einem positiven Effekt. | Keine Garantie künftiger Rendite oder individuelle Anlageempfehlung. |

Status wird nicht aus einer Kennzahl abgeleitet. Ein Backtest kann **methodisch zertifiziert und negativ** sein. `CERTIFIED` darf nicht als Synonym für „profitabel“ verwendet werden.

## 2. Studienuniversum und Identität

### 2.1 Universumsklassen

1. **Historische Indexmitgliedschaft:** Verwenden, wenn die Aussage einen bestimmten Index oder eine Indexstrategie betrifft. Für jeden Rebalance-Zeitpunkt sind die damals veröffentlichten Constituents, Aufnahme-/Entfernungszeitpunkte, Gewichtungen (falls genutzt) und Veröffentlichungsvintages erforderlich. Aktuelle Constituents rückwirkend einzusetzen ist verboten.
2. **Alle damals handelbaren Listings:** Verwenden für marktweite oder allgemein formulierte Aktien-Signalaussagen. Pro Beobachtungszeitpunkt gehören alle zum vorregistrierten Marktsegment passenden und damals tatsächlich gelisteten/handelbaren primären Common-Equity-Listings in den Nenner. Börsen, Instrumenttypen, Handelsstatus und gegebenenfalls Liquiditäts-/Preisgrenzen müssen vorab feststehen. Keine rückwirkende Liquiditätsselektion anhand späterer Daten.
3. **Individuell definiertes Strategieuniversum:** Nur zulässig, wenn Mitgliedschaftsregel, Rebalance-Zeitpunkt, Datenverfügbarkeit und Zusammensetzung für jeden historischen Zeitpunkt rekonstruierbar sind. Die Mitgliedschaft selbst ist ein PIT-Eingabefeld und wird versioniert. Ein heutiges VU-Universum ist kein historisches Strategieuniversum.

Eine Studie muss genau eine dieser Klassen und einen präzisen Nenner wählen. Für jedes Ereignis sind sowohl eingeschlossene als auch ausgeschlossene Listings samt Grund zu protokollieren. Nicht verfügbare Mitgliedschaft bedeutet `UNKNOWN` und blockiert die betroffene Studie; sie wird nicht durch heutige Mitglieder ersetzt.

### 2.2 Listing-Identität und Unternehmensereignisse

Primärschlüssel ist eine unveränderliche **Listing-ID** (börsen-/anbieterübergreifende Zuordnung mit Provenienz), niemals der Ticker allein. Mindestens zu speichern sind `listing_id`, `issuer_id`, MIC/Börse, Instrumentklasse, Ticker mit `valid_from`/`valid_to`, Listingstatus, `first_trade_date`, `last_trade_date`, Primärlisting-Kennzeichen, Identitätsquelle und Identitätskonfidenz. Ein Ticker darf zu verschiedenen Zeiträumen oder Listings gehören; mehrdeutige Zuordnung sperrt die betroffenen Beobachtungen.

- **Delisting:** Listing bis zum letzten tatsächlich handelbaren Zeitpunkt einschließen. Delisting-Grund und letzter Handelstag mit Quelle/Veröffentlichungszeitpunkt erfassen. Delisting-Return einschließlich Barausgleich, Liquidationserlös oder Wertpapierumtausch nur verwenden, wenn belegt und der Listing-ID eindeutig zugeordnet.
- **Unbekannter Delisting-Return:** Als zensiert/UNKNOWN kennzeichnen, niemals auf null, letzten Kurs oder −100 % setzen. Anzahl und betroffene Zeiträume nennen; Sensitivitätsgrenzen für beobachtbare Ausgänge ausweisen. Wenn die fehlenden Ausgänge die primäre Aussage ändern können, Survivorship-Gate FAIL.
- **Ticker-Neuvergabe:** Neue Listing-Identität bzw. getrennte valid-time-Intervalle; keine Verkettung über Symbolgleichheit. Bei unklarer Abgrenzung beide Seiten quarantänisieren.
- **Fusionen, Spin-offs, Umwandlungen:** Event-Graph mit Vorgänger-/Nachfolger-Listing, Verhältnis, Cash-/Stock-Anteil, Ex-/Wirksamkeits- und Bekanntgabezeit, Quelle und zugehörigem Return-Faktor. Kein stiller Serienwechsel. Ohne belastbaren Ereigniswert Outcome zensieren.
- **Doppellistings/mehrere Klassen:** Vorab festgelegte Primärlistingregel; andernfalls getrennte Instrumente und cluster-robuste Abhängigkeit auf Issuer-Ebene.

Survivorship-Gate besteht nur, wenn die definierte Zielpopulation am jeweiligen Stichtag rekonstruierbar ist, einschließlich später delisteter oder umbenannter Listings, und die fehlenden/unbekannten Identitäten nach vorregistrierten Grenzwerten weder Stichprobe noch Aussage verzerren. Eine heutige Security-Master-Liste genügt nicht.

## 3. PIT, Preise, Corporate Actions und fehlende Werte

### 3.1 Zwei getrennte historische Modi

- **As-published PIT:** Für Zeitpunkt `t` sind nur Datenstände zulässig, deren `available_at`/Publikationszeitpunkt spätestens am Entscheidungszeitpunkt liegt. Ein nachträglich korrigierter Wert darf nur verwendet werden, wenn genau diese damalige Version archiviert ist. Unveränderliche Snapshot-ID, Erfassungszeit, Veröffentlichungszeit, Gültigkeitszeit, Quelle und Hash gehören zum Lauf.
- **Historische Simulation (ex post):** Eine heute rückwirkend berechnete Regel kann mit heute verfügbaren, rückwirkend adjustierten Daten explorativ simuliert werden. Sie ist ausdrücklich als `HISTORICAL_SIMULATION` zu markieren, enthält Rekonstruktions-/Revisionshinweise und kann keine damalige Veröffentlichung oder PIT-Verfügbarkeit behaupten. Sie ersetzt niemals veröffentlichte PIT-Snapshots und erbt keinen Zertifizierungsstatus.

Jede Kennzahl, die auf Fundamentaldaten, Mitgliedschaften, Regimezuständen oder Faktoren beruht, verlangt neben `effective_at` ein belastbares `available_at`/`published_at` sowie den tatsächlich damals verwendbaren Vintagestand. `retrieved_at` heute beweist keine frühere Verfügbarkeit. Features sind strikt nach Signalzeitpunkt zu schneiden; Einstieg frühestens nach Signalverfügbarkeit. Zukunftsabschneide- und Zukunftsverfälschungstests sind Pflicht.

### 3.2 Preis-/Total-Return-Vertrag

- Roh-OHLCV, Split-Faktoren, Dividenden (Betrag, Währung, Ex-/Pay-/Record-Date, Quelle und Veröffentlichungszeit), sonstige Kapitalmaßnahmen und Adjustierungsrevisionen getrennt speichern.
- Einheitliche Renditebasis für Strategie, Vergleichskohorte und Benchmark. Für Equity-Anlageergebnisse ist der freigegebene kanonische Total Return einschließlich Splits und Ausschüttungen primär; Price Return darf separat als Diagnose erscheinen und nie als Total Return beschriftet werden.
- Total Return ist anhand von Identität, Corporate-Action-Abdeckung und unabhängigen Paritätskontrollen zu validieren. Die bisherige Mindestabdeckung von 95 % ist eine Datenquellen-Mindestschwelle, keine automatische Zertifizierung. V1 schlägt mindestens 99,5 % beobachtbare erwartete Event-/Outcome-Abdeckung vor; alle ausgeschlossenen und zensierten Fälle bleiben im Abdeckungsnenner. Ungeklärte Identitäts- oder Corporate-Action-Brüche im primären Sample sind ein Hard Block.
- Fehlende Kurse, Volumen, Faktoren, Benchmarks oder Corporate Actions nie vorwärts-/rückwärtsfüllen, interpolieren oder als null werten. Eine geplante Session-Lücke, ein Halts-/Delisting-Fall und technischer Quellenausfall sind getrennt codiert. Ausschlussregel vorab festlegen und Ausschlüsse samt Grund veröffentlichen.

### 3.3 Benchmark und Kosten

Benchmark muss vorab zur Fragestellung passen, zur gleichen Zeitachse vorliegen und dieselbe Returnbasis verwenden. Für US-Aktien-Eventstudien: (a) markt-/universums- und wochenmatched Base Rate, (b) passiver Total-Return-Benchmark wie SPY, sofern zum Zieluniversum passend. Index-/Strategieuniversen benötigen zusätzlich den passenden Index-Total-Return-Benchmark. Unpassender Benchmark darf nicht nach Ergebnis ausgewählt werden.

Kostenvertrag dokumentiert Kommissionen, Spread, Slippage, Marktimpact-Modell, Börsen-/Regulatorikgebühren, Handelbarkeit und Zeitpunkt. Hauptresultat ist netto. Zusätzlich mindestens LOW/BASE/HIGH Szenarien; Slippage ist nicht doppelt zu zählen. Kann die Regel wegen fehlender Ausführungsdaten keine Portfoliorendite bestimmen, Ergebnisse als Eventstudie kennzeichnen und nicht als ausführbare Strategieperformance ausgeben.

## 4. Regime-Nachweis und Validierung

### 4.1 PIT-Regimehistorie

Ein Regime darf die Interpretation einer historischen Studie nur steuern, wenn es für jeden Zeitpunkt als damaliger, unveränderlicher PIT-Snapshot vorliegt und sein Universum/Quellenstand dokumentiert ist. Nachträglich aus heute bekannten Kursen klassifizierte historische Phasen sind nur Simulationsmerkmale, keine PIT-Regime.

Für eine PATH-DEPENDENT-Regimehistorie sind die bestehenden Mindestbedingungen (mindestens 12 geordnete Beobachtungen über mindestens 90 Tage) notwendig, aber nicht ausreichend. Vorgeschlagene V1-Abnahme für zertifizierende Nutzung: mindestens fünf Kalenderjahre Abdeckung, alle drei Zustände beobachtet, mindestens 20 voneinander getrennte Zustands-Episoden je Zustand und mindestens 20 unabhängige Kalenderquartals-Cluster je Zustand in der geprüften Zielpopulation; Übergangsmatrix, Verweildauer, Abdeckung, Hysterese, unveränderte veröffentlichte Snapshots und unabhängige Quellennachrechnung bestehen. Für einen regelbezogenen Regimevergleich müssen zusätzlich mindestens 20 unabhängige Quartalscluster mit abgeschlossenen Ergebnissen je ausgewiesenem Zustand vorliegen; sonst Ergebnis für diesen Zustand `INSUFFICIENT`, kein Zusammenlegen.

Eine unabhängige Prüfung reproduziert Zustandsinput und -label aus archivierten PIT-Daten, vergleicht gegen versiegelte publizierte Snapshots und überprüft Zeitstempel, Revisionen, Coverage, Übergänge und Schwellenverhalten. Regime aus einem kleineren heutigen Produktuniversum dürfen nicht stillschweigend für den Gesamtmarkt stehen. V1-Werte sind normative Mindestwerte, vor Aktivierung fachlich zu ratifizieren; sie erlauben keine rückwirkende Historienerzeugung.

### 4.2 OOS-/Walk-forward-/Holdout-Vertrag

- **Präregistrierung:** Hypothese, Regelversion, Parameter, Universum, Returnbasis, Benchmark, Kosten, Primärendpunkt, Ausschlüsse, Mindestwirkung, Inferenz, Holdout und multiple-testing-Plan vor Entsiegelung protokollieren und hashen.
- **Chronologische Purge/Embargo:** Keine überlappenden Outcome-Horizonte zwischen Trainings- und Testfold. Purge mindestens um den längsten Outcome-Horizont plus Cooldown; Feature-Lookback darf nicht nach vorn reichen.
- **OOS:** Ein fest zurückgehaltener chronologischer Abschnitt, der bei Auswahl und Entwicklung nicht eingesehen wurde. Ein Ergebnisbereich, den das Team bereits geprüft hat, wird nicht nachträglich als unangetasteter Holdout bezeichnet.
- **Walk-forward:** Mindestens vier chronologische Testfolds; jeder Testfold nach seinem Trainingsfenster und mit Purge/Embargo. Richtung, Effektgröße, Intervall und Nenner je Fold berichten; Konsensschwelle wird vorab fixiert. Bestehende Gate-Grenzen bleiben bis formaler Vertragsmigration wirksam.
- **Unabhängiger Holdout:** Nach einer explorativen Auswahl nur neue, versiegelte Daten bzw. prospektiv gesammelte Daten für die primäre Inferenz. Wechsel des Anbieters allein erzeugt keine unabhängige Zeitperiode, wenn dieselben bereits betrachteten Ergebnisdaten erneut getestet werden.
- **Parameter/Entry:** Keine Optimierung auf Nachbarwerten. Die festgelegten Nachbarparameter und Entry-Delays sind reine Stabilitätsprüfungen; Abweichungen vollständig berichten. Jede Regel-/Parameteränderung startet eine neue Version und neue Präregistrierung.
- **Kosten-/Sensitivität:** Ergebnis unter vorregistrierten Kosten- und Slippage-Szenarien, Benchmarkvarianten und begründeten Daten-/Zensierungsgrenzen. Keine nachträgliche Auswahl des günstigsten Szenarios.
- **Mehrfachtests:** Alle fünf betrachteten Regeln und weitere ausprobierte Varianten zählen zum Suchraum. Für explorative simultane Aussagen Fehlerkontrolle (z. B. Holm) ausweisen. Eine neu ausgewählte Regel benötigt trotzdem einen unangetasteten Einzelregel-Holdout.

## 5. Statistische und wirtschaftliche Kriterien

Für jede Studie ist ein **einziger Primärendpunkt** vorab festzulegen. Für eine Signal-Eventstudie ist V1-Vorschlag der mediane, nach Kosten berechnete Total-Return-Excess zur zeitgleichen passenden Vergleichskohorte; sekundär sind cluster-robuste Differenz der positiven Trefferquote und SPY-Excess. Strategie-/Portfolio-Backtests verwenden zusätzlich annualisierte Netto-Rendite, Volatilität, Maximum Drawdown, Turnover und risikoadjustierte Kennzahl mit vollständiger Portfolioausführungsdefinition.

- Inferenz berücksichtigt Abhängigkeit nach Listing/Issuer und nicht überlappenden Zeitclustern; berichtet werden Effekt, 95%-Intervall, effektive Stichprobe und Clusterzahl. Rohe Ereigniszahl ist kein unabhängiges `N`.
- **Statistisch nachgewiesen:** Primärer zweiseitiger 95%-cluster-robuster Intervalltest besteht nach registrierter Mehrfachtest-Korrektur, sofern relevant. Vorzeichen wird immer mitberichtet. Ein Gate, das bloß train/test-Vorzeichenangleichung oder einen von null verschiedenen Effekt bestätigt, heißt `OOS_DIRECTIONAL_REPLICATION`, nicht „Vorteil“.
- **Ökonomisch positiv:** V1-Vorschlag für Eventstudien: netto medianer Excess mindestens +0,50 Prozentpunkte je M6-Ereignis und untere 95%-Intervallgrenze über 0; zusätzlich positive Trefferquotendifferenz samt Intervall und Kosten-/Benchmarkrobustheit ausweisen. Dieser Mindestwert ist eine explizite fachliche Policy-Entscheidung und muss vor Datenentsiegelung ratifiziert werden; er ist keine aus dem vorhandenen Ergebnis abgeleitete Zahl.
- Negative und Nullresultate bleiben vollständig im Artefakt. Fehlgeschlagene Signifikanz oder zu geringe Power wird nicht als „kein Effekt“ interpretiert; beides wird unterschieden.

## 6. Abnahmematrix der sechs Backtest-Arten

| Backtest-Art | Erforderliches historisches Universum | Zusätzliche Pflichtbelege | Main-Stand / konkrete offene Abnahme |
|---|---|---|---|
| `SAME_STOCK_REPLAY` | Nur zulässig als konditionale Einzelaktien- oder Fallreplay-Aussage; wenn Strategie-/Erfolgsrate beansprucht wird, alle damals geeigneten Listings im Zieluniversum samt Delistings. | Feste Fallauswahl vor Outcome; PIT-Snapshot; Identität/Corporate Actions; Regel gegen Vergleichskohorte außerhalb des Lernzeitraums. Ein ausgesuchter Überlebender darf nicht Marktperformance repräsentieren. | Aktuell `SURVIVOR_BY_CONSTRUCTION` und `DESCRIPTIVE_NOT_A_TEST`; Stichprobenauswahl/Regeltest plus Population fehlen. |
| `PATTERN_EVIDENCE` | Marktweite Muster: alle damals handelbaren, für das Pattern geeigneten Listings; oder klar benanntes PIT-Indexuniversum. | Fixierte Pattern-Definition, Fälle/Negativfälle, Total Return, Nenner und Ausschlussbilanz, OOS/clusterrobuste Inferenz. | Aktuell Survivorship teilweise unquantifiziert, veröffentlichte Total-Return-Serie fehlt; Frequenzauswertung ist kein zertifizierter Backtest. |
| `SIGNAL_BACKTEST` | Alle damals handelbaren Listings im vorab festgelegten Marktsegment oder PIT-Index-/Strategieuniversum; Delistings eingeschlossen. | Regel unverändert versioniert; nächster ausführbarer Eintritt; Metriken, OOS, Walk-forward, Kosten, Benchmark, PIT-Regime, Unabhängigkeit und unabhängiger Holdout. | Aktuelle Hauptstudie verwendet heute gelistete Titel; Delistings nur Sensitivität ab 2016. Regimehistorie nicht zertifiziert. Für fünf Regeln 0 zertifiziert. |
| `SETUP_BACKTEST` | PIT-Mitgliedschaft des definierten Setup-Universums zu jedem Setup-Zeitpunkt; gleiche Listing-/Delisting-Regeln. | Verfügbare Setup-Zustände und Zustandübergänge unverändert versioniert; nur abgeschlossene Outcomes; bestehender Vertrag verlangt u. a. 120 Stände, 180 Tage, 100 M6-Outcomes, 20 Titel, 20 unabhängige Wochen, OOS je Segment und Ownerfreigabe. | `SETUP_HISTORY_TOO_SHORT`, zu wenige abgeschlossene Outcomes/Titel/Perioden; Total Return und Varianten nicht messbar. Bestehende Schwellwerte sind Mindestwerte, nicht durch V1 abgesenkt. |
| `STRATEGY_BACKTEST` | Für jede Strategie PIT definierte Mitgliedschaft/Rebalance-Snapshot; bei Indexstrategie PIT-Indexbestand. | PIT-Faktoren und Ranking zum Rebalancezeitpunkt; Kontinuität/Turnover, Corporate Actions, Benchmark, Kosten, exekutierbares Portfolio, OOS. Bestehender Vertrag: 24 Monats-Membership- und 24 Monats-Faktor-Snapshots, max. 45 Tage Lücke. | Historische Membership fehlt und Faktorhistorie ist zu kurz; Monats-Snapshots und Forward-Outcomes fehlen. |
| `FACTOR_RANKING_BACKTEST` | Je Rebalancezeitpunkt alle zu diesem Zeitpunkt zulässigen Listings des fixierten Markt-/Indexuniversums; keine späteren Survivors. | PIT-Faktorvintage/Verfügbarkeit, Ranking/Neutralisierung/Portfolio-Bildung vorab, abgeschlossene Forward-Monate, Total Return/Kosten/Benchmark, Out-of-sample. Bestehender Vertrag: 24 Faktor-Snapshots, 12 abgeschlossene Forward-Monate, max. 45 Tage Lücke. | Faktorhistorie, Forward-Outcomes und historische Membership fehlen bzw. sind zu kurz. |

Alle sechs Arten benötigen zusätzlich unveränderliche Laufprovenienz: Methoden-/Engine-Versionen, Datenanbieter und -vintage, As-of/available-at, Parameterhash, Eingabehash, Return-/Corporate-Action-/Benchmarkverträge, Coverage, Ausschlüsse, Logs und maschinenlesbares Gateergebnis. Kein Status kann durch einen Dokumenttext überschrieben werden.

## 7. NEW_52W_HIGH – eingefrorene unabhängige Replikation

### 7.1 Regel und Studienvertrag

Regelversion `NEW_52W_HIGH` 1.0.0 bleibt unverändert: Wochenschluss liegt über sämtlichen Schlusskursen der vorherigen 52 Wochen und die Bedingung galt in der Vorwoche nicht. Kein Parameter, Signalzeitpunkt, Cooldown oder Exit wird angepasst. Vor Studienbeginn Codecommit und Regelhash einfrieren. Einstieg am Schlusskurs der Folgewoche; zeitbasierter Exit M6; 13-Wochen-Cooldown; bestehende Outcome-Definition und kein nachträglicher Tickerwechsel. Falls die historische Implementierung noch Details anders festlegt, vor Präregistrierung aus Code/Fixture exakt übernehmen und als Hash fixieren; nicht nach Ergebnisinterpretation ändern.

### 7.2 Universum und Identität

Primärtest: alle zeitgenössisch gelisteten primären US Common-Equity-Listings an NYSE, Nasdaq und NYSE American, inklusive später delisteter Listings; PIT Instrumenttyp, Börse, Handelbarkeit und Listingzustand. ADRs, ETFs/Fonds, Preferreds, Warrants, Rights, OTC und nicht-common Einheiten ausschließen, aber Ausschlussgrund je Listing/Zeitpunkt protokollieren. Keine Mindestkurs-/Liquiditätsselektion, sofern sie nicht im unveränderten Signalvertrag steht. Mindestens Listing-ID, Issuer-ID, MIC, Instrumentklasse, Ticker-Gültigkeitsintervalle, Erst-/Letzthandel, Listingstatus, Delistinggrund/Return und Corporate-Action-Verknüpfung. Neuausgabe von Tickern als neue Identität. M&A/Spin-off-Vorgänger/Nachfolger explizit verknüpfen; unklare Outcomes zensieren und Sensitivitätsgrenzen berichten.

### 7.3 Return, Benchmark und Kosten

Primärreturn: kanonischer, distributions- und splitbereinigter Total Return gemäß freigegebenem Vertrag; Signal- und Vergleichsgruppe identische Basis. Kosten: bestehender BASE 30 bps Round Trip einschließlich der dokumentierten 10 bps Slippage, zusätzlich LOW 10 und HIGH 60 bps; keine doppelte Slippage. Sekundäre Kostenprüfung mit unabhängigen Spread-/Slippage-Daten, falls lizenzierte Historie verfügbar ist. Vergleich: wochengematchte positive Basisrate aller eligible Listings plus SPY Total Return; passiver Indexbenchmark nicht als Ersatz für cross-sectional base rate ausgeben.

### 7.4 Unabhängigkeit, Entsiegelung und Power

Die Resultate 1991–2026 sind betrachtet worden und dürfen für diese Regelauswahl nicht als unberührter Holdout wiederverwendet werden. Ein anderer Datenanbieter allein macht identische historische Zeiträume nicht zu einem unabhängigen Test. Haupttest ist eine prospektiv versiegelte Kohorte mit unveränderlichen PIT-Mitgliedschafts-/Preis-/CA-Snapshots ab Präregistrierung; bis zum letzten M6-Outcome bleiben Labels und aggregierte Ergebnisse für Regelentwickler gesperrt. Mindestens vier chronologische Walk-forward-Folds, Purge/Embargo von mindestens M6 plus Cooldown, mindestens fünf Jahre Abdeckung sowie die Regime- und effektiven Cluster-Mindestwerte aus Abschnitt 4 sind einzuhalten. Eine externe, zuvor unzugängliche historische Stichprobe ist nur dann unabhängiger Holdout, wenn Unabhängigkeit und keine Kenntnis/Auswertung der Ergebnislabels nachweisbar sind; das ist angesichts der bereits geprüften Historie unwahrscheinlich.

Vor Entsiegelung wird Power mit dem registrierten Primärendpunkt, unabhängigen Clusterzahlen und vorab fixiertem wirtschaftlichem MDE (Vorschlag Abschnitt 5) berechnet. Ziel mindestens 80 % Power bei zweiseitigem alpha 0,05 nach Suchraumkorrektur. Ist die erforderliche Stichprobe aus den tatsächlich verfügbaren, noch unberührten Daten nicht erreichbar, wird die Studie als explorativ/unterpowert beendet, nicht durch Schwellenänderung gerettet.

### 7.5 Abnahmekriterien

1. Regel-/Code-/Methodik-/Datensatz-Hashes und vorregistrierte Analyse veröffentlicht, bevor Ergebnislabels verfügbar sind.
2. Kein Survivor-by-construction; mindestens 99,5 % erwartete Event-/Outcome-Abdeckung; alle ungeklärten Identitäten, Corporate Actions, Delisting-Fälle und Ausschlüsse quantifiziert. Sensitivitätsgrenzen ändern die Schlussfolgerung nicht.
3. PIT-Verfügbarkeits- und Zukunftsverfälschungstests bestehen; keine rückwirkend erzeugten PIT-Snapshots.
4. Total Return für Signal, Basisrate und Benchmark vertraglich valide; fehlende Werte bleiben fehlend.
5. Mindestzahl unabhängiger Cluster/Regime und 80%-Power erreicht; mindestens vier purge-/embargo-saubere Walk-forward-Folds sowie neuer Holdout.
6. Primärer Effekt und 95%-Intervall berichten; für statistischen Nachweis liegt Intervall nach Fehlerkontrolle oberhalb null. Für wirtschaftlichen Vorteil liegt die Netto-Median-Excess-Schätzung mindestens bei der vorab ratifizierten MDE und das Intervall über null; LOW/BASE/HIGH und Benchmark-Sensitivität bleiben im Ergebnis transparent.
7. Vollständige unabhängige Reproduktion durch zweite Person/Implementierung aus versiegelten Inputs; identische Kernstatistiken innerhalb festgelegter Rundungstoleranz. Keine automatische Statusänderung: Owner-Freigabe und Certification-Engine-Gates bleiben erforderlich.

## 8. Datenlücken und Lizenzprüfung

| Feld / Nachweis | Bekannter Bestand | V1 für Zertifizierung | Lizenz-/Beschaffungsstatus |
|---|---|---|---|
| Stabile Listing-ID / Issuer-ID / MIC | Tiingo-Listing-Schlüssel und interne Identitätslogik teilweise; bekannte Wiedervergaben/mehrdeutige Fälle | Vollständige zeitlich gültige, quellengestützte Crosswalks; keine Tickerjoins | Interne Quellen/Tiingo prüfen; Cross-vendor-ID-Rechte und historische Abdeckung vertraglich nachweisen |
| Listing-/Delisting-Lifecycle | Aktueller Security Master und private partielle Delisting-Artefakte | vollständige Aufnahme, Aussetzung, letzter Handel, Delistingtyp und Gültigkeitszeit pro Listing | SEC ersetzt diese Felder nicht; Quelle/Lizenz offen |
| Historische Indexmembership | Jüngere/archivierte Snapshots nur teilweise | alle Adds/Removes, effektive und veröffentlichte Zeit, Gewicht/Version je Rebalance | Indexanbieter-Lizenz wahrscheinlich erforderlich; historische Rechte ungeklärt |
| Raw OHLCV / historische Vintages | Umfangreiche Preisserien und Tiingo-Daten; revisionsfeste PIT-Vintages nicht belegt | Raw bars, available/published/retrieved time, Korrekturhistorie, delistete Serien | Tiingo Capability-/Rechteprüfung; Marketstack US-Abdeckung nicht integriert/verifiziert |
| Splits/Dividenden/sonstige Corporate Actions | Kanonischer TR für Teilmenge, bestehende Paritätsprüfung; 138 TR-Ausschlüsse | alle Ereignisse samt IDs, Beträgen, Währungen, Ex-/Pay-/Record-/Announcement-Zeit, Revision und Return-Faktor | Tiingo vorhandene Felder, Vollständigkeit/Lizenz je Nutzung prüfen; fehlende Spezialereignisse ggf. Anbieter |
| Delisting-Return / Cash-/Stock-Deal / Liquidation | Teilweise unbekannt/zensiert; viele unvollständige Delisting-Serien | realisierter terminaler Wert, Quelle und Verfügbarkeitszeit oder begründet UNKNOWN | Wahrscheinlich spezialisierte lizenzierte Delisting-/Corporate-Action-Historie; Anbieter und Preis offen |
| PIT Faktoren / Fundamentals | SEC Filing-/Acceptance-Zeiten für filings; intern historische Faktor-Snapshots zu kurz | filed/accepted/public time, accession, restatement vintage, factor-input provenance, calculation time | SEC EDGAR für Filedaten; abgeleitete Datenrechte/-methodik intern; historische Estimates/Consensus benötigen Anbieter |
| Historisches Regime | Aktuelle und jüngere Regime-Snapshots; PIT-Momentaufnahmen | immutable 5+ Jahre, PIT-Inputs, transition/persistence/hysteresis evidence | Beobachtung oder lizenzierte Archivquelle; heute nicht vorhanden |
| Nutzungsrechte | keine vollständige Rechtefreigabe für Backtest-Kundenoutput belegt | Speicherung, Derived Data, Reproduktion, Anzeige, Weitergabe und Audit-Retention explizit erlaubt | Legal/Procurement-Prüfung je Anbieter zwingend; keine Bestellung Teil dieses Auftrags |

Vor Einkauf: kleine, fest definierte Stichprobe mit aktiven, delisteten, wiedervergebenen Tickern, Indexadds/-removes, M&A und Dividenden/Splits/Delisting-Returns; Datenfelder/Identität gegen interne Belege abgleichen; sample-level hashes und wiederholbare Abrufe; Rechte schriftlich prüfen. Keine Massendatenabfrage oder produktiver Backfill vor Pass der Stichprobenkriterien.

## 9. Wiederverwendung und Umsetzungsplan

### Bestehende Komponenten

- `quant/engines/signal-backtest.js`, `backtest.js`, `profile-backtest.js`: bestehende Studien-/Outcome-Berechnung nur nach Gap-Analyse wiederverwenden; keine neue Engine.
- `quant/engines/canonical-total-return.js`, `corporate-action-evidence.js`, `survivorship-control.js`, `us-security-master.js`: bestehende Total-Return-, CA- und Identity-Prüfungen/Contracts wiederverwenden. Bestehende Ausschlüsse unverändert erhalten.
- `quant/engines/market-regime.js` und `quant/methodology/market-regime-v1.json`: PIT-Momentaufnahme und path-dependent-Regime-Vertrag; längere immutable Historie fehlt.
- `quant/engines/backtest-certification.js`, `quant/methodology/backtest-certification-v1.json` und `quant/data/product/backtest-certification-v1.json`: bestehende sechs Arten und Gate-Status. V1-Methodikspezifikation wird separat versioniert; Statusartefakt wird nicht manuell editiert.
- vorhandene Tests: `signal-backtest.test.mjs`, `canonical-total-return.test.mjs`, `survivorship-control.test.mjs`, `backtest-certification.test.mjs`, `market-regime.test.mjs`, `regime-observation-immutability.test.mjs`, `total-return-contract.test.mjs`, `total-return-verification.test.mjs`, `backtest.test.mjs`.
- vorhandene Datenstände: `signal-backtest-v1.json`, `total-return-quality-v1.json`, `survivorship-control-v1.json`, `market-regime-history/*`, readiness- und certification-Artefakte. Die Artefakte sind Messstände; dieser Vertrag macht sie nicht rückwirkend PIT oder zertifiziert.

### Reihenfolge, Aufwand und Abnahme

1. **Owner-Entscheidungen (2–4 Personentage):** V1-Grenzwerte, Universumsdefault je Produktaussage, MDE, Regimeclustergrenzen, Kostenmodell, Statussemantik und erforderliche Legalrechte ratifizieren. *Abnahme:* signierter, versionierter Methodikvertrag.
2. **Contract/Gate-Mapping (3–6 Tage):** sechs Art-spezifische Gate-Konfigurationen und Provenienzfelder den bestehenden Messungen zuordnen; bestehende strengere Gates bleiben. *Abnahme:* maschinenlesbare Traceability-Matrix; jeder Gatewert hat Produzent, Test und Artefaktquelle; kein unverifizierter Pass.
3. **Dateninventur und Anbieter-PoC (5–10 Tage Engineering, nach Datenzugang; Anbieterprüfung meist 1–3 Wochen):** Feldabdeckung, PIT-vintage, Identität, CA, Delisting, Indexmitgliedschaft und Lizenz auf definierter Probe. *Abnahme:* alle kritischen Felder vollständig und wiederholbar oder klare No-Go-Liste; Rechte schriftlich passend.
4. **Begrenzte Datenadapter/Manifest-Integration (8–15 Tage Engineering je freigegebener Quelle):** nur wenn PoC besteht; keine Backfill-/Pipeline-Mutation in diesem Spezifikationsauftrag. *Abnahme:* reproduzierbare PIT-Manifestdatei, Hashes, lineage, zero unresolved identity in included cohort, TR/benchmark parity.
5. **Abdeckung und unabhängige Validierung (5–10 Tage Engineering plus Datenlieferant/Reviewer):** Population-/Biasbounds, Regime-Abdeckung, Power, OOS/Holdout, unabhängige Reproduktion. *Abnahme:* vollständiger Auditbericht und bestehende Gates bestehen; Zertifizierungsentscheidung separat.
6. **Prospektive Beobachtung:** für `NEW_52W_HIGH` bis mindestens fünf Jahre Regime-/Holdout-Abdeckung plus M6 outcome lag; typische Mindestdauer daher **ca. 5 Jahre plus 6 Monate**, vorbehaltlich erreichter unabhängiger Cluster-/Powerziele. Eine kürzere lizenzierte Historie darf nur dann als unabhängiger Holdout gelten, wenn sie vor Betrachtung nachweislich ungeöffnet und zeitlich/PIT-vollständig ist.

**Kosten externer Daten:** unbekannt bis Anbieter, Märkte, interne Speicherung, Nutzeranzeige, abgeleitete Daten und Retention vertraglich geprüft sind. Keine Datenbestellung oder Abfrage ist hier erfolgt.

## 10. Go-/No-Go

**GO** für den nächsten kleinen Auftrag: fachliche Ratifikation des V1-Vertrags und lesender Feld-/Lizenz-PoC-Plan.
**NO-GO** für jetzt: neue Backtest-Engine, produktive Datenintegration/Backfill, externe Bestellung, Zeitfenster-/Regeländerung oder Zertifizierung.
**NEW_52W_HIGH:** nach Ratifikation und bestandenem Daten-PoC als unveränderte, präregistrierte unabhängige Replikation planen; keine weitere historische Optimierung. Die bisherige positive Gesamtstudienkennzahl allein rechtfertigt noch keine aufwendige Datenbeschaffung oder kommerzielle Aussage.

## 11. Quellenstand

- `quant/data/product/backtest-certification-v1.json` (Main asOf 2026-10-23): sechs Arten, aktueller Gatezustand.
- `quant/methodology/backtest-certification-v1.json`: bestehende Klassifikation und Setup-/Strategie-/Faktormindestwerte.
- `quant/data/product/signal-backtest-v1.json` und `quant/data/product/total-return-quality-v1.json`: versionierte Signal- und Returnbasis-Messstände.
- `quant/data/product/survivorship-control-v1.json`, `quant/data/product/market-regime-v1.json`, `quant/data/product/market-regime-history/`: bekannte Survivorship-/Regime-Abdeckung.
- `quant/methodology/market-regime-v1.json`: veröffentlichte Regime-Momentaufnahme- und Pfadbedingungen.
- PR #862 bleibt separat offen; diese Methodikdatei ändert ihn nicht.
