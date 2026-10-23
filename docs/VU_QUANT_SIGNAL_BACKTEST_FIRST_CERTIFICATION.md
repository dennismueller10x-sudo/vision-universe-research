# Quant-Signal-Backtest: Daten- und Freigabeentscheidung

**Prüfstand:** lokale Vollsuite auf `c5cee124056db815c00ffefda2afceed2d3778ba` (23.10.2026); späterer Main-Stand `fc3a94b9fe11aa890aacc58358e188d8963a5f05` enthält zwei automatisierte Produktabbildungs-Updates. PR-Branch `codex/quant-p0-status-consistency`, Commit `dbe3ffa2f1d1302965442975e836a15f7bfc0787`. Ausschließlich Repository- und Audit-Artefakte geprüft. Keine Datenbestellung, kein externer Backfill und keine Produktionsveröffentlichung.

## Entscheidung

- Die Total-Return-Widersprüche waren Erzeuger-/Verbraucherfehler. Der Signal-Lauf hatte bereits `TOTAL_RETURN`, 97,8 % bestätigte Titelabdeckung und einen bestätigten SPY-Total-Return-Benchmark. Readiness, Zertifizierungsprosa und Signal-Intelligence verwendeten noch ältere Behauptungen.
- Nach der Bereinigung bleiben alle sechs Arten unzertifiziert. Der Signal-Backtest bleibt `LIMITED`; kein Status wurde angehoben.
- `MOMENTUM_IMPROVED` ist der erste technische Kandidat: In der aktuellen Studie scheitern auf Regel-Ebene nur Survivorship und Regime-Diversität. Das beweist keinen kaufbaren oder positiven Anlegervorteil. Die Zertifizierung einer Regel wäre eine Freigabe der festgelegten Forschungsprüfung, kein Renditeversprechen.
- Das vorhandene Delisting-Material reicht für eine Sensitivitätsrechnung ab 2016, nicht für eine vollständige Survivorship-Kontrolle der Hauptstudie von 1990 bis 2026.
- Ein historischer Simulationsmodus kann die bestehende Sensitivität methodisch sauberer sichtbar machen. Er darf nicht als veröffentlichter PIT-Snapshot oder Ersatz dafür gelten.

## Phase A: Artefaktkette und korrigierter Stand

| Artefakt | Erzeuger | Eingaben / Datenstand | Verbraucher | Korrektur |
|---|---|---|---|---|
| `signal-backtest-v1.json` | `scripts/quant/build-signal-backtest.mjs` | Wöchentliche Preisreihen; im Pipeline-Lauf private kanonische Tageshistorie. Stand 16.10.2026, erzeugt 23.10. 02:50 UTC. | Quant-Produktdienst, Backtestseite, Radar und Zertifizierung | Unverändert als Studienquelle; Identität, Renditebasis und Zeitstempel werden beim Lesen validiert. |
| `total-return-quality-v1.json` | Derselbe Signal-Builder und Lauf wie oben | `canonical-total-return-1.0.0`; Stand und Erstellzeit stimmen mit der Signalstudie überein. | Signal-Readiness und Zertifizierung | Abdeckung, Vertragsversion, SPY-Benchmarkrolle und Cross-Check werden gegen die Signalstudie verglichen. |
| `backtest-readiness-v2.json` | `scripts/quant/build-backtest-readiness.mjs` | Aggregierte Daten- und Gate-Sicht. Der alte Builder setzte die Wochen-TR-Abdeckung auf null und SPY pauschal auf Kursbasis. | `product-services.getBacktest("readiness")`, Backtestseite, Signal-Intelligence | Wird aus Signal- und Qualitätsartefakt abgeleitet; stale oder widersprüchliche Quellen brechen fail-closed ab.
| `backtest-certification-v1.json` | `scripts/quant/build-backtest-certification.mjs` | Signalregeln, Qualitätschecks, Survivorship-/Setup-/Faktorhistorien und Methodikvertrag | Produktdienst, Backtest- und Evidenzansichten | Enthält Signal-Quellstand, Renditevertrag, Abdeckung und Benchmark. Freigabegates bleiben unverändert. |
| `backtest-signal-intelligence-v1.json` | `scripts/quant/measure-backtest-signal-intelligence.mjs` | Produktdienste einschließlich Readiness | Audit-/Intelligence-Anzeige | Übernimmt die korrigierte Signalprovenienz; die alte pauschale Meldung „Total Return nicht veröffentlicht“ ist entfernt. |

Die neuen Artefakte weisen getrennt den **Berechnungsstand** und den **Zeitpunkt der Aktualisierung** aus. Signal und Qualitätsartefakt: `asOf=2026-10-16`, `generatedAt=2026-10-23T02:50:40.442Z`. Readiness, Zertifizierung und Signal-Intelligence wurden im Audit-Branch am 23.10. neu synchronisiert. Die Signalart bleibt `LIMITED`, die Zertifizierung enthält weiterhin `CERTIFIED_KINDS=[]`.

Kanonischer Readiness-Befund: **6.036/6.174 Wertpapier-Kursreihen = 97,8 %**, Mindestquote 95 %, Vertrag `canonical-total-return-1.0.0`. Die Zähler stammen aus Einträgen der Langreihen-Eingabe (`discover-series-long`), nicht aus Wochenbeobachtungen und nicht aus historischen Universumsmitgliedschaften; die Studie rechnet anschließend mit den 6.036 reihenfähigen Wertpapieren. SPY: `TOTAL_RETURN_RECONSTRUCTED`, Rolle `BENCHMARK_REFERENCE`, 1.659 Wochen von 29.01.1993 bis 16.10.2026 ohne Lücke. Die Zertifizierung wird dadurch nicht angehoben.

Die bestehenden Kursreihen bleiben getrennt ausgewiesen: Wochen-TR der Signalstudie ist eine Laufzeitberechnung aus dem privaten Tagesbestand; im öffentlichen Repository liegen fünf tägliche Golden-Preview-Reihen. Ein Bestand von fünf öffentlichen Tagesreihen ist kein Beleg, dass die private Pipeline keine breitere Tageshistorie besitzt.

## Phase B: genaue Signal-Blocker

### Survivorship und historische Listings

Die Hauptstudie umfasst 6.036 Titel aus der heute verfügbaren Langreihenpopulation und benennt selbst `MAIN_STUDY_SURVIVORS_ONLY`. Delistings werden nicht in das Hauptresultat übernommen. Der bestehende Vergleichsmodus ist eine Sensitivität für 08.01.2016 bis 16.10.2026:

- 3.728 Delistings sind im privaten Manifest als relevant klassifiziert.
- 3.325 haben historische Kursdaten.
- 3.082 sind für die Sensitivitätsrechnung verwendbar.
- Davon haben 3.058 bestätigte Total-Return-Daten; 24 werden wegen fehlender bestätigter Renditebasis ausgeschlossen.
- Die Sensitivität vergleicht `CURRENT_SURVIVORS_ONLY`, `HISTORICAL_ELIGIBLE_SUBSET` und `LAST_PRICE_ASSUMPTION`. Die letzte Variante ist ausdrücklich eine Annahme, kein gemessener Delisting-Ertrag.
- Der Quellenstatus nennt 253 nicht abrufbare Neuvergaben, 146 partielle und 79 leere Delisting-Reihen; 159 Tickeränderungs-Duplikate werden gesondert geprüft.
- Der lokale Delisting-Ausgang ist `UNKNOWN`; Fälle ohne vollständiges Folgeergebnis werden zensiert. Es wird kein pauschaler Null- oder Totalverlust imputiert.

Der Security Master verwendet die Listing-Kennung `tiingo:EXCHANGE:TICKER:START`, nicht den Ticker als Unternehmensidentität. Darin sind 191 inaktive Stammaktien; 183 sind Klasse D (Ticker später neu vergeben), 7 Klasse F (Identität unsicher), eine Klasse C (keine Reihe). Diese Bestände allein sind kein vollständiges historisches Marktuniversum.

Die Sensitivität ist bereits fachlich nützlich: Sie misst, ob und wie Delistings Verteilungen ändern. Sie ist kein Hauptlauf, weil ihre Abdeckung ab 2016 beginnt, die Vollständigkeit des Anbietermanifests gegen alle zu diesem Zeitpunkt investierbaren Listings nicht belegt ist und Delisting-Auszahlungen fehlen.

### Regime-Diversität

`signal-backtest-v1.json` führt Regime explizit nicht als Eingabe. Die Regel-Gates melden `REGIME_HISTORY_NOT_CERTIFIED`; die Methodikdatei `market-regime-v1.json` hat `MARKET_REGIME_TRANSITIONS_GATE=PENDING_HISTORY`.

Die bestehende Market-Regime-Methodik verlangt 12 geordnete Beobachtungen über mindestens 90 Tage, beobachtete Übergänge zwischen allen drei Zuständen, Verweildauern, unveränderte historische Beobachtungen und geprüftes Hystereseverhalten. Danach ist zusätzlich die ausdrückliche Aktivierung im Methodikvertrag erforderlich. Die vorhandene Regime-Snapshot-Historie beginnt am 10.09.2026 und deckt am Prüfstand weniger als 90 Tage ab. Selbst wenn die vorwärts gesammelte Aktivierung später alle Kriterien erfüllt, erzeugt sie keine Marktphasen-Snapshots für 1990–2026.

Für die historische Signalstudie braucht es daher entweder lizenzierte, unveränderliche historische Querschnitts-/Regimebeobachtungen mit passender Methodik oder eine separat versionierte ex-post-Regime-Simulation. Die Simulation kann die jetzige Zertifizierung nicht stillschweigend erfüllen.

### Bereits gemessene Qualitätsprüfungen

OOS, Walk-forward und Sensitivitäten sind nicht mehr bloß zu implementierende Aufgaben. Die aktuellen Ergebnisse stehen in `signal-backtest-v1.json` und `backtest-certification-v1.json`.

| Regel | Aktuelle Regel-Gates, die fehlschlagen |
|---|---|
| `MOMENTUM_IMPROVED` | Survivorship, Regime-Diversität |
| `MOMENTUM_DETERIORATED` | OOS-Richtung, Survivorship, Regime-Diversität, Parameterstabilität, OOS-Vorteil |
| `TREND_UP` | Survivorship, Regime-Diversität, OOS-Vorteil |
| `TREND_DOWN` | OOS-Richtung, Walk-forward, Survivorship, Regime-Diversität, Parameterstabilität, OOS-Vorteil |
| `NEW_52W_HIGH` | OOS-Richtung, Walk-forward, Survivorship, Regime-Diversität, OOS-Vorteil |

Bereits vorhandene Prüfungen umfassen Train/Validation/Test (Train bis 2010, Validation 2010–2018, Test ab 2018), vier Walk-forward-Folds, Nachbarparameter, Einstiegsverzüge 0/1/2 Wochen, LOW/BASE/HIGH-Kosten, 1/3/6/12-Monats-Horizonte, SPY und zeitgleiche Base Rate, Quartalscluster sowie Sensitivität auf Delistings. Diese Ergebnisse müssen nach einer geänderten Population neu berechnet werden; kein Test darf nach Ergebnisrichtung ausgewählt oder angepasst werden.

`MOMENTUM_IMPROVED` ist der erste technische Kandidat, weil nur Survivorship und Regime-Diversität als Regel-Gates offen sind. Die übrigen Regeln sind nicht durch fehlende Daten allein blockiert; ihre OOS-/Fold-/Parameterresultate scheitern teilweise bereits empirisch.

**Interpretationsgrenze der aktuellen Kandidatenregel:** `edgeOutOfSample` ist im Builder signunabhängig: Es besteht, wenn das Testintervall einen von null verschiedenen Effekt in derselben Richtung wie das Training zeigt. Für `MOMENTUM_IMPROVED` ist diese Richtung negativ. Im Testzeitraum 2018–2026 liegt `deltaPositiveShare` bei −1,19 Prozentpunkten (cluster-robustes 95-%-Intervall −2,31 bis −0,07); der M6-Medianabstand zum Markt beträgt −0,70 %. Der OOS-Gate-PASS bedeutet daher stabile Evidenz für einen negativen Zusammenhang unter dieser Definition, nicht Bestätigung eines positiven Momentumvorteils. Vor einer kommerziellen oder nutzerseitigen Deutung muss die fachliche Regelabsicht ausdrücklich geklärt werden; dieses Audit ändert weder Regel noch Kriterium.

### Was der Signal-Backtest nicht benötigt

Die folgenden Anforderungen betreffen andere Quant-Arten und sind **keine direkten Gate-Voraussetzungen des vorhandenen Signal-Vertrags**:

- 24 Monate Indexmitgliedschaft für Strategy Backtest;
- 24 Monate veröffentlichte Faktor-Snapshots für Strategie-/Faktor-Rankings;
- 12 Monate Forward-Outcomes für Faktor-Ranking;
- gereifte M6-Setup-Outcomes und Owner-Freigabe des Setup-Vertrags;
- Analystenrevisionen oder ein veröffentlichter Quant-Gesamtscore.

Der Signal-Backtest braucht stattdessen ein zeitlich korrektes, vollständiges Listing-Universum für die definierte Studienpopulation, passende Kurs-/Corporate-Action-Daten, unverfälschte Outcomes, eine bestätigte Benchmarkbasis, OOS-/Regimekontrollen sowie reproduzierbare Inputs und Rechte.

## Kleinste Route zur ersten belastbaren Freigabe

1. **Methodik vor dem nächsten Ergebnislauf festschreiben.** Vorab festlegen: Universumdefinition, Studienzeitraum, Identitätsregeln, Umgang mit Zensierung, Delisting-Auszahlungen, Market-Regime-Auswertung, Regeln, Parameter, Kosten, Benchmark und OOS-/Walk-forward-Splits. Keine Änderung nach Kenntnis neuer Resultate ohne neue Version und neuen Holdout.
2. **Einen Anbieterstichproben-Proof durchführen.** Die folgende Spezifikation muss Identität, Listings, Mitgliedschaften, Kapitalmaßnahmen, Delisting-Ausgänge, Availability und Rechte nachweisen. Bestehende 3.058 TR-bestätigte Titel sind als Ausgangsdaten erneut zu prüfen, nicht blind zu übernehmen.
3. **Für den Zertifizierungspfad die aktuelle Studienpopulation vollständig abdecken.** Für das unveränderte 1990–2026-Fenster sind historische Nicht-Überlebende vor 2015 sowie neu vergebene Listings/Lücken nötig. Eine 2016–2026-Studie wäre eine neue, ex ante festgelegte Methodikversion und keine Reparatur der bestehenden 1990–2026-Studie.
4. **Historische Marktphasen separat qualifizieren.** Keine aktuellen heutigen Zustände rückdatieren. Für die bestehende Zertifizierung müssen die Regime-Gates mit belegbaren historischen Zuständen erfüllt sein. Falls dies nicht beschaffbar ist, bleibt die bestehende Signalart gesperrt; eine Simulation bleibt getrennt.
5. **Alle fünf Regeln erneut unverändert ausführen.** Bestehende OOS-, Walk-forward-, Parameter-, Kosten-, Benchmark- und Survivorship-Gates ausführen. Ein Regelstatus wird nur durch die Zertifizierungsengine abgeleitet.
6. **Reproduzierbarkeit und Nutzungsrechte nachweisen.** Eingabe-Manifeste, Versions-/As-of-Information, Hashes, Laufparameter und kommerzielle Verwendungsrechte müssen Teil des signierten Freigabepakets sein.

Der aktuelle Datensatz zeigt, dass eine erste Regel nach Behebung der beiden Regel-Gates technisch erreichbar sein könnte. Die Vollständigkeit eines externen historischen Universums und historischer Regimewerte ist nicht nachgewiesen; daher gibt es noch keine belastbare Kalenderzusage.

## Separater Modus für historische Simulation

Ein separater Modus ist sinnvoll, um die bereits vorhandene Delisting-Sensitivität systematischer auszuwerten. Er muss eine eigene Methodikversion und einen eigenen Ergebnisnamen tragen, etwa `HISTORICAL_SIMULATION`, mit folgenden Festlegungen:

- Datum des heutigen Datenabzugs und Datenanbieter-Vintage vollständig speichern;
- effektive Listing-Zeiträume und historische Mitgliedschaftsdaten verwenden, ohne heutige Mitgliedschaft als Ersatz;
- jedes Listing anhand stabiler Security-/Listing-IDs verbinden;
- Preis-/Corporate-Action-Korrekturen und spätere Anbieterrevisionen nachvollziehbar halten;
- unvollständige Horizonte zensieren und zählen; Delisting-Renditen nur mit belegter Gegenleistung einrechnen;
- vollständige Universe-Coverage je Stichtag und Ausschlussgründe veröffentlichen;
- alle Ergebnisse ausdrücklich als ex-post rekonstruierte Simulation kennzeichnen, nicht als damaligen veröffentlichten PIT-Snapshot.

Dieser Modus kann Robustheit und Datenlücken sichtbar machen. Er ersetzt keine historische PIT-Veröffentlichung und darf keinen bestehenden Zertifizierungsstatus verändern.

## Phase C: Datenanbieter-Proof-of-Concept

### Stichprobe und Umfang

Eine einzelne, manuell freigegebene Exportstichprobe von **30–40 Listing-/Event-Fällen** genügt für den Proof; sie soll keine statistische Marktstudie sein. Überschneidungen zwischen Gruppen sind erwünscht, damit komplexe Fälle wie Tickerwechsel plus Übernahme geprüft werden.

| Fallgruppe | Mindestfälle | Beispiel-/Auswahlregel |
|---|---:|---|
| Aktive Listings | 6 | AAPL/MSFT/JPM plus drei kleinere Listings aus der tatsächlich genutzten Population |
| Delistete Unternehmen | 8 | Insolvenz, freiwilliger Rückzug, Übernahme; Fälle mit und ohne letzte Kursreihe |
| Neu vergebene Ticker | 6 | mindestens drei belegte Alt-/Neulisting-Paare; `MON` und `ARIS` sind Kandidaten aus lokalen Auditspuren, vor Bestellung erst gegen aktuelle IDs prüfen |
| Indexaufnahmen/-entfernungen | 6 Ereignisse | mindestens zwei S&P-500-, zwei Nasdaq-100- und zwei DJIA-Ereignisse, jeweils Ankündigungs- und Wirksamkeitsdatum |
| Fusionen/Übernahmen | 6 | Barzahlung, Aktientausch und Bar-/Aktien-Kombination; bekannte Kontrollfälle `TWX` und `CELG` aus den lokalen Tiingo-Auditnotizen erneut identifizieren |
| Corporate Actions / Delisting-Returns | 8 Ereignisse | Splits, reguläre und Sonderdividenden, Ausschüttung, letzter Handelstag, Cash-/Share-Gegenleistung, Liquidation/Bankruptcy; Fälle dürfen die Gruppen oben überlappen |

Die Stichprobe wird vor Datenabruf als Fallmanifest mit erwarteten IDs und Ereignissen eingefroren. Zusätzlich werden je Gruppe drei Fälle anhand eines dokumentierten Zufalls-Seeds aus dem Anbieterbestand gezogen, damit ausschließlich bekannte Erfolgsgeschichten nicht den Proof bilden.

### Abzufragende Felder

**Je Instrument/Listing:** stabiler Instrument-ID, stabiler Listing-ID, CIK/Issuer-ID soweit vorhanden, Börse/MIC, Symbol, Klasse/Wertpapierart, Währung, `valid_from`, `valid_to`, Status, Delisting-Grund/-Code, Quelle, Quell-ID, Abrufzeit, Daten-Vintage und Korrekturversion. `CIK` allein ist keine Listing-ID.

**Je Bar:** Listing-ID, Handelstag, OHLC, Volumen, Währung, Roh-/Split-adjusted Kennzeichnung, Splitfaktor, Cashdividende/Bardividende je Aktie, Ex-/Record-/Payable-Datum sofern vorhanden, Trading-Kalender, Provider-Revision und `retrieved_at`.

**Je Corporate Action / M&A:** eindeutige Ereignis-ID, Quell-ID, betroffene alte/neue Listing-IDs, angekündigt/am Markt bekannt seit (`announced_at`), Stichtag (`effective_at`), Ex-/Record-/Payable-/Settlement-Datum, Splitverhältnis, Cash- und Aktientauschkomponenten, Spin-off-Ausschüttung, Abfindungswert, Delisting letzter Handelstag, Gegenleistung, Delisting-Return-Basis, Quellenbeleg und spätere Korrekturen.

**Je Indexereignis:** Index-ID, alte/neue Listing-ID, Add/Remove, `announced_at`, `effective_at`, alte/neue Gewichtung sofern lizenziert, Quelle und unveränderliche Versions-/Abrufangabe. Nur eine heute abrufbare Mitgliederliste erfüllt dieses Feld nicht.

**PIT-/Revisionsmetadaten:** `published_at`/`available_at`, `effective_at`, `retrieved_at`, `supersedes`/Revision, Originalwert und Korrekturwert, Zeitzone und Präzision. Für jede historische Aussage muss klar sein, ob der Eintrag tatsächlich damals verfügbar war oder heute rückwirkend rekonstruiert wurde.

### Harte Abnahmekriterien

1. **Identität:** 100 % der Samplefälle werden auf genau eine stabile Listing-ID aufgelöst. Kein Bar wird ausschließlich per Ticker zusammengeführt. Kein Überschneiden zweier Listing-IDs derselben Börse/Symbol-Zeitspanne bleibt ungeklärt. Alt- und Neulisting-Historien sind in den Replays vollständig getrennt.
2. **PIT-Verfügbarkeit:** 100 % der Mitgliedschafts- und Ereignisfälle enthalten Bekanntgabe- und Wirksamkeitszeitpunkt oder einen maschinenlesbaren Grund für fehlende Bekanntgabezeit. Eine `asOf`-Abfrage darf keinen erst später verfügbaren Eintrag liefern. Ankündigung und Wirksamkeit dürfen nicht vertauscht werden.
3. **Vollständigkeit:** 100 % der vorab eingefrorenen Sample-Listings und Indexereignisse werden als vorhanden, partiell oder fehlend zurückgemeldet; kein stilles Weglassen. Für verfügbare Zeiträume werden alle erwarteten Börsentage gegen den Exchange-Kalender bilanziert. Fehlende Bars und Aktionsereignisse sind einzeln ausgewiesen. Jeder Delisting-Fall hat einen belegten Ausgang oder bleibt ausdrücklich `UNKNOWN` und ist für Horizonte, die das Ende überqueren, `INCOMPLETE`.
4. **Corporate Actions:** 100 % der bekannten Sampleaktionen sind dem richtigen Listing und Ex-/Wirksamkeitsdatum zugeordnet. Aus Rohkurs, Split und Cash-/Share-Gegenleistung rekonstruierte Ergebnisse müssen innerhalb einer vorab festgelegten Rundungstoleranz mit unabhängigen Quellen übereinstimmen; jede Abweichung wird ungelöst ausgewiesen und sperrt den betreffenden Fall.
5. **Reproduzierbarkeit:** Rohantworten, Queryparameter, Endpoint-/Produktversion, Zeitstempel und SHA-256-Hashes werden archiviert. Wiederholung derselben Anfrage muss identische fachliche Felder liefern oder jede Revision als neue Version mit altem Wert und `supersedes` festhalten. Derselbe eingefrorene Input muss denselben Backtest-Manifesthash und dieselben Kennzahlen erzeugen.
6. **Kommerzielle Rechte:** Vor Produktionsintegration liegt eine schriftliche Lizenz vor, die Speicherung und Verwendung für interne Analysen sowie Anzeige abgeleiteter Backteststatistiken für Endkunden ausdrücklich abdeckt. Rechte für Rohdatenweitergabe, Derivate, Archivaufbewahrung, Nutzerzahl/Territorium, KI-Verarbeitung und Beendigung sind getrennt geklärt. Eine unklare Klausel ist `FAIL`, kein Default-Pass.

Jedes Gate muss `PASS` erreichen, um diesen Datensatz in eine zertifizierbare Hauptstudie übernehmen zu können. `UNKNOWN`, fehlende Zeilen oder ungeklärte Lizenzrechte zählen nicht als Erfolg.

### Vorhandene Daten und tatsächlich zusätzliche Lizenzdaten

| Bestand | Vorhanden laut Main/Audit | Verwendung im PoC |
|---|---|---|
| Tiingo/Tageshistorie | Kanonische Rohkurse, Splits und Dividenden im privaten Pipeline-/R2-Lauf; Signalstudie validiert 6.036 Wochen-TR-Reihen. | Quellen-Vintage und tatsächliche Rechte erneut belegen; Anbieterexport nicht voraussetzen. |
| Interner Delisting-Bestand | 3.728 Listings, 3.325 mit Historie, 3.058 TR-bestätigt; Datenbasis ab 2015/2016 lückenhaft. | 3.058 Fälle als bestehende PoC-Kontrollgruppe erneut identifizieren; 24 TR-Ablehnungen und restliche nicht verfügbare/mehrdeutige Listings separat prüfen. |
| SEC | CIK/Issuer-Zuordnung und PIT-Filing-/Restatement-Fakten für strukturierte Unternehmensangaben. SEC stellt keinen Security Master und keinen Delisting-Feed bereit. | Issuer-Identität und Filing-PIT gegen Listings abgleichen; nicht als Listing-/Indexmembership-Quelle behandeln. |
| Marketstack | Europa-Readinessvertrag, im Quant-Ranking und Backtesting nicht integriert; keine nachgewiesene historische US-Mitgliedschafts-/Delisting-Reihe. | Nur dann anfragen, wenn Anbieter US-Historie, Ereignisse und Rechte für genau diese Felder schriftlich zusagt; keine Nutzung des vorhandenen Europa-Moduls als Beleg. |
| Zusätzliche Lizenzdaten | Nicht nachgewiesen: vollständige historische Security-/Listing-Master-Abdeckung, alte neu vergebene Listings, historische Indexevents oder belastbare Delisting-Gegenleistungen. | Anbieterangebot für vollständige IDs, Membership-/Corporate-Action-Historie und Delisting-Returns erforderlich, falls Tiingo den PoC nicht besteht. Analystenrevisionsdaten sind für diesen Signal-Backtest nicht notwendig. |

### Feldinventur für MOMENTUM_IMPROVED

| Feld / Nachweis | Vorhanden und validiert | Vorhanden, nicht integriert | Vorhanden, qualitativ unzureichend | Nicht vorhanden / zusätzlich zu beschaffen |
|---|---|---|---|---|
| Security-/Listing-ID | Für geladene Reihen `tiingo:EXCHANGE:TICKER:START`; kein Ticker-only-Join. | — | Kein providerübergreifender, zeitlich versionierter Identitätsgraph. | Verlässliche Crosswalks etwa zu CUSIP/FIGI und alte/neue Listing-Beziehungen mit Gültigkeitsintervallen. |
| Ticker-Neuvergabe | 183 Klasse-D und 7 Klasse-F Fälle im aktuellen Security-Master; die Engine trennt Identitätsunsicherheit. | Verwertbare Manifestfälle aus dem internen Delisting-Bestand. | 253 wiedervergebene Listings im Delisting-Manifest sind nicht abrufbar; Klasse F bleibt ungeklärt. | Vollständige alte/neue Symbologie, stabile IDs und Zuordnung der Bars je Listing. |
| Listingbeginn/-ende und Delisting-Event | Aktuelle Security-Master-Zeilen und delistete Fetch-Zeilen mit `start/end` für erfasste Fälle. | Das private Manifest klassifiziert weitere Fälle und Fetch-Status. | Keine Vollständigkeit gegenüber allen damals gehandelten US-Stammaktien belegt; 146 Reihen partiell, 79 leer. | Vollständige, datierte Listing-Lifecycle-Historie einschließlich Delisting-Grund und letztem Handelstag. |
| Aktive Kursreihe OHLCV | Tiingo-Roh-/splitbereinigte Tagesfelder; Wochen-Signalinputs und Kurssemantik sind geprüft. | — | Historische Rohdaten sind kein damaliger Anbieter-Vintage-Nachweis; spätere Korrekturhistorie fehlt. | Falls echte damalige Verfügbarkeit gefordert wird: historisierte Datenvintages oder Vendor-Revisionslogs. |
| Delistete Kurshistorie | 3.325 Fälle haben Historie; 3.082 sind für die vorhandene Sensitivität nutzbar. | Sensitivität ab 2016 läuft getrennt vom Hauptresultat. | Frühere und wiedervergebene Listings sind lückenhaft; 24 nutzbare Fälle scheitern am Total-Return-Vertrag. | Vollständige Listing-IDs und vollständige Kurse bis zum letzten Handelstag für das vorab festgelegte Universum. |
| Splits und Bardividenden | Kanonische Rekonstruktion ist für 6.036 von 6.174 Preisreihen bestätigt; problematische Fälle werden ausgeschlossen. | — | 35 Dividendenlücken, 2 Splitlücken und 101 widersprüchliche Kapitalmaßnahmen. | Für ausgeschlossene Fälle unabhängige Aktionsbelege und Korrekturhistorien; nicht durch Schätzung ersetzen. |
| M&A, Spin-offs, Liquidation und Delisting Return | Ereignisbehandlung kann fehlende/mehrdeutige Fälle zensieren. | Teilweise Ereignis-/Identitätshinweise aus internem Manifest und SEC-Issuer-Zuordnung. | Ergebnis `UNKNOWN`; 0/−100%-Annahme wird vermieden. | Bar-/Aktiengegenleistung, Spin-off-Werte, Liquidationserlös, Delisting Return und Zeitpunkte je Listing. |
| Historische Indexaufnahme/-entfernung | Nur jüngere Index-Snapshots; für die Signalregel nicht erforderlich, wenn das Universum stattdessen als alle damals gelisteten Stammaktien vorab definiert wird. | — | Keine lange, vollständige Aufnahme-/Entfernungshistorie. | Bei indexdefinierter Studienpopulation: Index-ID, Listing-ID, Ankündigungs- und Wirksamkeitszeitpunkt sowie Korrekturen. |
| PIT-Verfügbarkeit | SEC `filed/accepted`-Zeitpunkte für Emittentenmeldungen; für MOMENTUM_IMPROVED nicht als Signaleingabe benutzt. | — | SEC-Zeitpunkte belegen keine historische Listing-Mitgliedschaft. `retrieved_at` der Kursdaten ist heutiger Abruf, kein damaliges `available_at`. | Bei striktem Vendor-PIT: historische Veröffentlichungs-/Verfügbarkeitszeit und Revisionen für Listing-, CA- und Kursdaten. |
| Datenvertrag / kommerzielle Rechte | Versionen und lokale Reproduktionsartefakte sind vorhanden. | Tiingo-Audit belegt Kurssemantik und vorhandene Felder. | Die aktuelle Datenablage beweist keine kommerzielle Anzeige-/Speicherlizenz. | Schriftliche Rechte für interne Berechnung, abgeleitete Statistik, Kundenanzeige, Aufbewahrung und Nutzerumfang. |

SEC-Fundamentaldaten sind für diese Preis-/Signalregel kein Ersatz für Listing-Historie: `SEC_PIT_METHODOLOGY.md` stellt ausdrücklich fest, dass SEC weder Security Master noch Delisting-Feed anbietet. Marketstack ist in diesem US-Signalpfad nicht integriert; aus dem Europa-Readinessmodul folgt keine belegte US-Historienabdeckung.

## Aufwand, Kosten und Dauer

Kosten in Geld sind aus dem Repository nicht bestimmbar: Es gibt kein verbindliches Anbieterangebot und nicht alle Vertragstexte. **Es wird hier kein Budget oder Lizenzpreis erfunden.** Vor Bestellung sind Quote und schriftliche Rechteprüfung nötig.

| Arbeit | Aufwand | Abhängigkeit / Kalenderzeit |
|---|---:|---|
| Statuskonsistenz und Quellmetadaten (Branch-Änderung) | umgesetzt, ca. 1–2 Tage | Gezielte Quant-Tests bestanden; keine Freigabe- oder Produktstatusänderung |
| Anbieter-Stichprobenmanifest und Lizenzcheck vorbereiten | 2–4 Personentage | Keine Anbieterbestellung; Data Owner/Legal müssen Lizenzrahmen bestätigen |
| Anbieter-Review nach Erhalt des Samples | 3–6 Personentage | Abhängig von Datenlieferung; Kalenderzeit typischerweise 1–3 Wochen, nicht zugesichert |
| Listing-/Event-Mapping und Backtest-Ingestion für neuen, freigegebenen Datensatz | 8–15 Personentage | Erst nach bestandenen PoC-Gates und separater Backfill-Freigabe |
| Regime-Historie für bestehende Methodik qualifizieren | 5–10 Personentage plus Methodikreview | Aktuelle prospektive Daten brauchen mindestens 90 Tage und 12 Beobachtungen für die Aktivierungsprüfung; das allein deckt 1990–2026 nicht ab |
| Vollständige Datenprüfung, Reproduktion, neue Zertifizierungsläufe | 5–10 Personentage | Vollständigkeit und Rechte müssen bereits belegt sein; zusätzliche Liefer-/Korrekturzyklen offen |
| Nur vorhandene 3.058 Delisted-TR-Fälle als getrennte Simulation ausweisen | 3–6 Personentage | Keine Aussage zur Vollständigkeit; bleibt `EX_POST_SIMULATION`, nicht zertifiziert |

**Was sofort möglich ist:** P0-Statusfehler reparieren (in diesem Branch), vorhandene OOS-/Walk-forward-/Kosten-/Parameterresultate interpretieren und einen getrennten historischen Simulationsbericht auf vorhandenen Sensitivitätsdaten vorbereiten. **Was Daten braucht:** vollständige Listing-/Mitgliedschafts- und Delisting-Daten samt Ausgängen, insbesondere Neuvergaben und vor 2015/16. **Was Zeit braucht:** vorwärts gesammelte Regimebeobachtungen und jede historische Outcome-Reifung, für die es keine qualifizierte rückwirkende Quelle gibt.

## Änderungen und Prüfungen dieses Branches

- Neue fail-closed Konsistenzprüfung für Signal-/Qualitätsartefakt, Zeitstempel, Coverage, Schema-/Datenvertrag und Benchmarkrolle.
- Readiness und Zertifizierung beziehen Renditebasis/Benchmark aus denselben Quellen und weisen Daten-As-of getrennt von Aktualisierung aus.
- Signal-Intelligence übernimmt die Readiness-Provenienz. Gründe wie „Gesamtrendite nicht veröffentlicht“ werden als studienspezifische Basis-/Abdeckungsfehler beschrieben, nicht als globale Behauptung, es gebe keine TR-Reihen.
- Pattern-Evidence bleibt unverändert `LIMITED`; der Grund benennt, dass diese Studie Kursrendite verwendet. Keine Gate-Änderung.
- `node --check` der geänderten JavaScript-Dateien, JSON-Parse der aktualisierten Artefakte und `git diff --check` bestanden.
- Konsistenztests: 3 bestanden. Gezielte Zertifizierungs-/PIT-/Survivorship-Tests: 10 bestanden. Kein Backtest ist `CERTIFIED`.

**Vollvalidierung zum PR-Stand:** `node --test quant/tests/*.test.mjs` auf vollständiger lokaler Arbeitskopie: 2.795 bestanden, 0 fehlgeschlagen; SEC/PIT 32, Worker/Discover 66, fokussierte Backtest-/Total-Return-Tests 39 bestanden; 32.293 JSON-Dateien geprüft. GitHub-PR-Workflows für den Merge-Stand `fc3a94b` laufen getrennt und sind nicht Teil dieser lokalen Vollsuite.
