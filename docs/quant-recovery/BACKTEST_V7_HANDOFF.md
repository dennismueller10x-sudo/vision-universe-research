# Vision Universe Quant – Übergabe V6 an V7

**Abschlussstatus: V6_SECURED_AND_MERGED.**

Vertrag: `backtest-v7-handoff-1.0.0`. Technische Sicherung von PR [#922](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/922); keine Produktfreigabe. **0/6 bestehende Arten fachlich zertifiziert.** Alle neuen Research-Ergebnisse bleiben `NOT_CERTIFIED`, `productionApproved=false`.

## 1. Verifizierte Repositorybasis

- Ursprünglicher V6-Abschluss: `2e82cbd7a0dee57ca7729ee1d4e69884f36142a2`.
- Zum Sicherungsbeginn geprüfter aktueller Main: `134afa0638b501f41b639c8eb4be3742b52d62d3`.
- Konfliktfreie Integration dieses Main in den V6-Branch: `14dba647a46237ea435ceff1caa3f5275b9869be`.
- Letzte Main-Konsolidierung: `a205063579547c7cf0b4aed405e6fa2e58d10329`, integriert als geprüfter PR-Head `370d19dd95b760a1be8aa5ad5196a8efdaf9162d`.
- **V6-Merge-/verifizierter Runtime-Main: `88f5329ee322316903824bbfe6ef8468b8ab9870`. PR #922 ist MERGED.** Alle ausgeführten Abschlusschecks waren erfolgreich; keine Reviewanforderung war offen. Normaler Merge mit gebundenem Head, kein Admin-/Auto-Merge.
- Nach Merge auf genau diesem Main erneut 113/113 Research-Tests und deaktivierter Standardlesezugriff geprüft; Runtime-Baum entspricht dem geprüften PR-Head. Die reine Dokumentationsfinalisierung ändert keine Runtime. Ihre genaue Main-Revision ergibt `git log -1 --first-parent --format=%H -- docs/quant-recovery/BACKTEST_V7_HANDOFF.md`.

Die fünf [V6-Abschlussberichte](BACKTEST_V6_FINAL.md), [Abnahmematrix](BACKTEST_V6_CERTIFICATION_MATRIX.md), [Datenlücken](BACKTEST_V6_DATA_GAPS.md), [Monte-Carlo-Spezifikation](BACKTEST_V6_MONTE_CARLO.md) und [Validierung](BACKTEST_V6_VALIDATION.md) einschließlich `v6/` bleiben unverändert erhalten. Neue Sicherungsnachweise stehen separat unter `v6-securement-final/`.

## 2. Sechs bestehende Backtest-Arten

| Art | Tatsächlich gesicherter Funktionsumfang | Fachliche Grenze für V7 |
|---|---|---|
| Same Stock Replay | Bestehende deskriptive Fallansicht; zusätzliche fixierte Pattern-Regel mit Episodenauswahl, Cooldown, verzögertem Entry, Kosten und Benchmark | Bedingte Einzelaktien-/Ereignisstudie; keine marktweite Erfolgsbehauptung aus ausgesuchten Überlebenden, kein neuer unabhängiger Holdout |
| Pattern Evidence | Bestehende Feature-/Pattern-Erkennung, historische Fälle und zeitgleiche Kontrollen, Überlappung, Coverage und Unsicherheit | Vollständige historische Vergleichspopulation/TR und unabhängige bestätigende Studie fehlen; Musterhäufigkeit ist keine finanzierte Strategie |
| Signal Backtest | Alle fünf unveränderten Definitionen: MOMENTUM_IMPROVED, MOMENTUM_DETERIORATED, TREND_UP, TREND_DOWN, NEW_52W_HIGH; Base Rates, Kosten und Benchmarks | Neue allgemeine Auswertung sind Long-Ereignisoutcomes, keine automatische Shortstrategie; finanzierte NEW_52W_HIGH-Wochenrechnung bleibt enger technischer Referenzfall |
| Setup Backtest | Historisches Mapping aus vorgelegten damaligen Inputs, deduplizierte Ereignisse; registrierte Entryverzögerungen, Zeit-/Invalidierungs-/Zielschluss-Exitvarianten | Originalveröffentlichung und Rekonstruktion getrennt; fehlende reife Outcomes bleiben zensiert, offene M6-Horizonte bleiben offen |
| Strategy Backtest | Bestehende Profilauswahl plus strenge versionierte Portfoliobuchführung mit PIT-Membership/Faktoren und Nachkosten-Zielgewichten | Reale historische universumsweite Datenfähigkeit nicht belegt; Legacy-Fallbacks für fehlende Endwerte werden nicht als valide V6-Ausführung benutzt |
| Factor Ranking | Rangbildung vor Outcomeauswahl, historische Buckets, Forward-Outcomes, Rangkorrelation und paarweise Faktorabhängigkeiten | Fehlende Forwardwerte bleiben im Rang/Nenner; aktuelle Rankings und revidierte Fundamentals sind keine historische PIT-Historie |

## 3. Sieben zusätzliche Methoden

| Methode | Implementierung / gesicherter Scope |
|---|---|
| Monte Carlo | `research-monte-carlo.cjs`: getrenntes Trade-IID und Circular-Block-Bootstrap, Seeds, alternative Kapitalpfade, Endkapital/Drawdown/Verlustserien, Perzentile, bedingte DKW-Bänder, Budgets und Hash-/Runtimebindung. Synthetische Szenarien, keine beobachtete Zukunft oder unabhängige Marktevidenz |
| Walk-Forward | `research-validation.cjs`: rollierende/expandierende Fenster, Informations-/Outcomeintervalle, Purging, Embargo, gereifte Labels und registrierte Fit-/Auswahl-/Testausführung; keine Doppelzählung von Testereignissen |
| Out-of-Sample | Versionierte Registrierung, Expositionsledger, einmaliger Holdoutverbrauch, Universums-/Methoden-/Datendefinitionsbindung, privater atomarer Registry-Store; VU-Einstieg `research-exposure.cjs` registriert bekannte Signalhistorie als betrachtet |
| Marktregime | `research-studies.cjs`: ergänzende Trend-/Volatilitäts-/Stressklassifikation sowie Auswertung von PIT-verfügbaren oder ex-post beschreibenden Regimen; kein Ersatz der aktiven Produkt-Breadth-Regimehistorie |
| Parameter-Sensitivität | Vorregistrierte Raster einschließlich Gebühren, Slippage, Entryverzug und Haltedauer; Holm-p-Werte und Nachbarschaftsstabilität; nominale Intervalle werden nicht als simultane Holm-Intervalle bezeichnet |
| Event-Driven | Ereignis-/Listingidentität, ursprüngliche Publikations-/Verfügbarkeitszeit und Revision, nachfolgende explizite Session und gereifte Outcomes; keine erfundenen Earnings-Release-Zeitpunkte |
| Portfolio-Rebalancing | `research-portfolio.cjs`: vorhandene Auswahl-/Kalender-/Gewichtsprimitive, Drift, Cash, Turnover, exakte Notionalkosten, Splitstückzahlen, Dividendenforderungen mit Zahlungstag, belegte terminale Cashwerte oder Aktienumtausch, gleicher Benchmarkkalender |

Gemeinsamer Offline-Einstieg: `scripts/quant/run-research.cjs`. Private immutable Generationen, Writer-Lock, Hashprüfung und Rollback liegen in `research-artifacts.cjs`; unabhängige Evidenzachsen in `research-contract.cjs`. Keiner dieser Einstiege aktiviert einen öffentlichen Transport oder eine Produktregistry.

## 4. Technische und unabhängige Rechenprüfung

Die Sicherung prüft alle Quant-Testdateien vollständig und ohne Duplikate über `secure-v6-isolation.mjs`. Jede Teilmenge benutzt die unveränderte ursprüngliche Isolationsprüfung mit unveränderter 900-Sekunden-Grenze. Sowohl Produktionsdaten-Isolation als auch tatsächlicher Kind-Test-Exitcode müssen bestehen. Prüfpunkte, vollständiges Dateimanifest und Hashes verhindern ein stilles Auslassen von Tests. Damit werden die im V6-Bericht dokumentierten unvollständigen monolithischen Wiederholungen getrennt nachgeholt, ohne alte Berichte umzuschreiben.

Abschlusswerte: **Quant-CI 3.051/3.051**, **Core 238/238**, **Research 113/113** und nach Merge auf Main erneut **113/113**, **SEC-Python 551**, **SEC/PIT 32**, **Consumer 66** bestanden. Die vollständige Isolation deckt **274/274 Quant-Testdateien in 23 Teilmengen** ab; nach der letzten Main-Konsolidierung wurden die betroffenen Technical-Tests samt Isolation, Core, SEC/PIT, Consumer und reale Referenzen erneut erfolgreich geprüft. Sämtliche Quellen-/Test-/Laufzeitnachweise stehen in [validation.json](v6-securement-final/validation.json), [vollständiger Isolation](v6-securement-final/isolation.json), [Berichtserhalt](v6-securement-final/preserved-reports.json) und [Merge-Abnahme](v6-securement-final/merge-acceptance.json). Python rechnet Portfolio-Cash/Stückzahlen, Studienauswahl/Outcomes, Fenster-/Holm-/Ausführungsarithmetik und Monte-Carlo-Pfade/Verteilungen unabhängig nach. Zwei identische Monte-Carlo-Wiederholungen mit je zehn Millionen Schritten prüfen Reproduktion und die bestehenden Laufzeit-/Speicherbudgets. Portfolio: vier unabhängige Decimal-Referenzfälle bestanden; Studien: 526 unabhängige Vergleiche und 25 Signalereignisse bestanden. Monte Carlo: zwei identische Zehn-Millionen-Schritt-Läufe zusammen 2.205,23 ms und 175.726.592 Bytes Peak-RSS; diese gemeinsame Dauer begrenzt jeden einzelnen Lauf und erfüllt die ursprünglichen zehn Sekunden je Lauf und 256 MiB. Der vollständige Zehn-Millionen-Schritt-Ausgang wurde unabhängig mit Python nachgerechnet. Laufende oder abgebrochene Tests wurden nicht als bestanden gezählt; die früheren V6-Berichte bleiben unverändert als Historie erhalten.

Die vorhandene reale Preisreplay-Referenz umfasst fünf Perioden 1Y/3Y/5Y/10Y/MAX, junge Listings und blockierte Fälle. Ihr Preisrendite-/Wochenmodell ist weder Total Return noch garantierter Live-Fill. Vollständige private Generationen und Rohdaten gehören weiterhin nicht in Git oder öffentliche Builds.

## 5. Datenlücken D01–D12 und Quellen

| ID | Fehlender Nachweis / V7-Arbeitsgrundlage |
|---|---|
| D01 | Vollständiger historischer US-Listing-Lifecycle, MIC/Instrument/Primärlisting, Tickerintervalle und quellengestützte Crosswalks; vorhandener Tiingo-/interner Master ist kein vollständiges damaliges Universum |
| D02 | Reale terminale Werte, Liquidation, Cash-/Stock-Deals und Nachfolgergraphen; unbekannt ist weder letzter Kurs noch null noch pauschal −100 % |
| D03 | Ausreichende Raw-OHLCV-Historie und belegte damalige Provider-/Korrekturvintages; vorhandene splitbereinigte Wochenreihen sind nicht automatisch as-published PIT |
| D04 | Vollständige Splits, Dividenden und Spezial-CA einschließlich Betrag, Währung, Wirksamkeit/Publikation/Zahlung und Paritätskontrollen; bestehende TR-Ausschlüsse erhalten |
| D05 | Damalige Grundpopulation und Indexmembership/Weights mit Bekanntgabe und Wirksamkeit; junge DJIA/NDX/SP500-Archive ersetzen keine Langzeithistorie |
| D06 | Accessiongebundene ursprüngliche Fundamentalvintages; SEC-Consumerexport `as_of_latest` nicht rückdatieren. Pre-XBRL, Estimates und Consensus bleiben gesonderte Quellenfragen |
| D07 | Historische Faktorquerschnitte mit Formelversion, Inputprovenienz und damaliger verfügbarer Population; Rekonstruktionen sind keine damaligen VU-Veröffentlichungen |
| D08 | Revisionssichere Unternehmensereignisse mit echter Publikationszeit; SEC-Acceptance und Earnings-Release sind unterschiedliche Zeitpunkte |
| D09 | Qualifizierte ursprüngliche Regimehistorie derselben Population und genügend unabhängige Episoden; ergänzende ex-post Labels entsperren kein aktives PIT-Gate |
| D10 | Passende Benchmark-/FX-Historie mit gleicher Periode, Währung und Returnbasis; SPY nicht vor seine reale Historie verlängern |
| D11 | Historisch belegbare Liquidität, Spread, Slippage/Impact und Ausführbarkeit; Modell-bps sind keine beobachteten historischen Brokerkosten |
| D12 | Tatsächlich unangetastete, versiegelte oder prospektive Bestätigungskohorte; bekannte Historie bleibt Exploration, auch bei anderem Provider |

**D13 aus V6 bleibt zusätzlich erhalten:** Lizenz, Aufbewahrung, Zugriff und Derived-/Display-/Auditrechte aller Quellen und Ergebnisse. Die Nummer wird durch den V7-Auftrag mit D01–D12 nicht gelöscht oder umgedeutet.

Main enthält zusätzlich die SEC-Consumer-Korrektur aus #935: volle Jahreshistorie und Jahresbericht-Datum aus dem eigenen Geschäftsjahr. Dies verbessert den vorhandenen historischen Consumerbestand, erzeugt aber kein vollständiges ursprüngliches Vintagearchiv und ersetzt keine studienspezifische PIT-Qualifikation.

Bekannter gesicherter V6-Messstand: 6.190 Preisreplay-Kandidaten, 4.451 Klasse B/1.739 C, 22.255 Periodenergebnisse; separate TR-Studie 6.036/6.174 Serien; 3.082 delistete Sensitivitätslistings. Diese Populationen sind verschieden und dürfen nicht addiert werden. Zahlen neuer Produktläufe sind jeweils am eigenen As-of zu prüfen und machen alte Messstände nicht nachträglich PIT.

## 6. Daten- und Lizenzbeschaffung

Vorhandene Tiingo-, Marketstack-, SEC-, Membership-, Faktor- und Regimeartefakte zuerst feldgenau prüfen. Bestehende Owner-Grants bleiben in ihrem Scope wirksam; sie erlauben keine pauschale Erweiterung aller historischen US-/Vintage-/terminalen Nutzungen. Der Marketstack-Displaygrant ist europäisch begrenzt.

CRSP ist ein zu prüfender institutioneller Lifecycle-/Return-Kandidat; Preis, Zugriff, Crosswalk, terminal consideration, Team-/Derived-/Auditretention-Rechte benötigen ein konkretes Angebot und einen Feld-PoC. SEC-Originalfilings und vorhandener Ingest sind für accessiongebundene Fundamentaldaten wiederzuverwenden, ersetzen aber keinen Listing-/Delisting-/Indexfeed. Indexanbieter und spezialisierte CA-/Fundamental-/Eventanbieter bleiben Angebots-/PoC-Optionen ohne Eignungszusage.

Die am 25.10.2026 dokumentierten persönlichen Norgate-Pakete (USD 630/787,50 pro Jahr) sind nach der dort geprüften FAQ/EULA keine zulässige kommerzielle VU-Lösung. Aktuelle Tiingo-/Marketstack-Zusatzpreise wurden nicht verifiziert. Keine Bestellung, Vertragsänderung oder neue Massendatenabfrage ist autorisiert oder erfolgt. Vor Beschaffung: aktive/delistete/wiedervergebene Listings, Indexwechsel, Splits, Dividenden und Cash-/Stock-Terminalfälle in einer festen Probe bestehen lassen, dann Rechte und Angebot ausdrücklich freigeben.

## 7. Methodik und unabhängige Bestätigung

Der archivierte Entwurf bleibt `PRESERVED_PROPOSAL_NOT_APPROVED`. 99,5 % Outcome-Coverage, fünf Jahre, 20 Regimeepisoden/Quartale, 80 % Power und +0,50 Prozentpunkte Mindestwirkung werden nicht automatisch aktiviert. Coverage muss fehlende/zensierte/ausgeschlossene reife Outcomes im Nenner behalten; unreife Horizonte separat. Cluster benötigen eine zum überlappenden Outcome passende Abhängigkeitsbegründung.

Bestehende strengere Gates bleiben aktiv: Setup unter anderem 120 Stichtage/180 Tage/100 abgeschlossene M6-Outcomes/20 Titel, OOS mindestens 30 je Segment und Ownerfreigabe; Strategie 24 Monatsstände Membership/Faktoren; Ranking 24 Monatsstände Faktoren und 12 abgeschlossene M3-Forward-Monate; maximal 45 Tage Lücke. Der Setup-Vertrag nennt 20 unabhängige Wochen, der Erzeuger zählt tatsächlich Monate. Diese Diskrepanz braucht eine ausdrückliche versionierte Entscheidung und darf nicht still durch die leichtere Variante ersetzt werden. Aktive Regime benötigen ihre bestehenden zusätzlichen Prüfungen/Freigaben.

Vor Entsiegelung einer bestätigenden Studie: Regel/Parameter, Universum, Quelle/Vintage, Primärendpunkt, Kosten, Benchmark, Ausschlüsse, Reife, Purging/Embargo, Cluster-/Unsicherheitsmodell, Suchraum/Mehrfachtests und wirtschaftliche Mindestwirkung registrieren. Eine zweite Implementierung derselben Inputs beweist Rechenparität, nicht unabhängige Vorhersagekraft. Negative Ergebnisse sind zulässig; bestehende Produktgates werden deshalb nicht gelöscht. Keine pauschale Fünfjahreswartezeit für geeignete historische Rekonstruktion; prospektive Beobachtung nur bei tatsächlich fehlenden Eingaben oder unabhängiger Bestätigung.

## 8. Konkreter V7-Auftrag

1. Datenfähigkeitsmatrix je gewählter Studie gegen D01–D13 und vorhandene Rechte aktualisieren; Quellen-PoC und Angebote vorbereiten, ohne Einkauf.
2. Historische US-Population/Lifecycle und terminale Werte priorisieren; CA/TR/Benchmark-Parität und revisionssichere PIT-Fundamental-/Faktorinputs qualifizieren.
3. Originalarchive, belegte Rekonstruktion und prospektive Kohorte getrennt versionieren; MAX aus tatsächlichen Datenabhängigkeiten ableiten.
4. Offene normative Entscheidungen ausdrücklich ratifizieren; keine geschützten Gates allein für ein grünes Ergebnis ändern.
5. Präregistrierte bestätigende Studien mit kontrollierter Entsiegelung und unabhängiger Quellen-/Rechen-/Studienprüfung durchführen.
6. Erst danach Art-/Regelzertifizierung entscheiden. Produktfreigabe, autorisierter Transport und Frontend-Anbindung bleiben eigenständige spätere Aufträge.

Keine Frontend-/Quant-UI-Refresh-Arbeit, keine neue Preview, kein Scheduler, kein Kauf und keine öffentliche Backtest-Aktivierung gehören zu dieser Übergabe.
