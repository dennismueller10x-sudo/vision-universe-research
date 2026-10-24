# Quant Backtest V5.1 – technische Konsolidierung

## Entscheidung: READY_WITH_LIMITATIONS

Der reale, deterministische Einzelaktien-Wochenbacktest ist über den bestehenden Quant-Lesedienst integrierbar. Die neue Quant-UI kann anschließend mit einem klaren Auswahl-/Ergebnisvertrag angebunden werden, ohne die Berechnung zu verändern. **Keine neue Preview, kein Hosting, keine Frontend-Implementierung, keine Produktfreigabe, kein Merge und keine methodische Zertifizierung.**

Die Einschränkungen sind ausdrücklich Bestandteil des Vertrags: PRICE_RETURN / NOT_CERTIFIED, eingeschränkte Datenqualität, modellierte Ausführung, unvollständige historische Universen und fehlende Daten anderer Backtest-Arten. Der noch erforderliche autorisierte Auslieferungs-/UI-Pfad wird hier nicht aktiviert.

Aktuelle Main-Basis: `6d55ddab641403588f9ba220b468de0a34a23174`. Gestartet wurde auf `a97a9f034` nach Merge des verbindlichen UI-Refreshs #873; zunächst wurde auf `864cd303d` und abschließend nach #869/#900/#903 konfliktfrei auf den aktuellen Main rebasiert. Quant-Suite, Core, Datenverträge und Build-/Browser-Prüfungen wurden auf dieser Basis erneut ausgeführt; konkrete Abschlusswerte stehen in [VALIDATION.json](v51/VALIDATION.json). Der abschließende SEC-Datenlauf `6d55ddab6` wurde ebenfalls konfliktfrei übernommen: null geänderte eingefrorene Backtest-Abhängigkeiten und null geschützte UI-Dateien. Die fremden Produktänderungen werden unverändert geerbt, nicht Teil des Konsolidierungsdiffs. Branch: `codex/quant-backtest-v51-consolidation`.

## 1. Implementiert und konsolidiert

- Gemeinsame datenabhängige 1J-/3J-/5J-/10J-/MAX-Auflösung, reale Wochenkurse und stabile Security-/Listing-Zuordnung.
- Bestehende NEW_52W_HIGH-Regel, Wochenledger, Kostenmodell V2, echte SPY-/Aktien-Benchmarks und wiederaufnehmbarer historischer Batch.
- Qualitätsklassifizierung, private versionierte Ergebnisdateien, atomare Veröffentlichung, Writer-Lock, inkrementeller Cache, Offline-Refresh und geprüfter Rollback.
- Bestehendes `product-services.js#getRealBacktest()`, jetzt mit privater Node-Implementierung außerhalb des öffentlichen Browser-Bundles. Keine zweite Quant-API und keine neue Rechenengine.
- Generations-/Listing-Pins, erneute Pointer-Prüfung nach asynchronen Reads, expliziter Startkapital-/Scope-/Runtime-Vertrag und ein reiner Auswahladapter für die spätere UI.
- Korrekte Statusprovenienz aus #862: Readiness, Zertifizierung und Signal-Intelligence verwenden das passende Signal-/TR-Qualitätspaar. Alle sechs Zertifizierungsstatus und sämtliche vorhandenen Gate-Zustände bleiben unverändert.

Quellen wurden gezielt übernommen; die kumulativen alten PRs wurden nicht mehrfach cherry-gepickt. Alte Referenzberichte, alte V5-UI-Dateien und Preview-Implementierungen wurden nicht in Main zurückgebracht. Der unbenutzte feste Kalenderstart 2006 wurde aus der Legacy-Methodikkonfiguration entfernt und durch den versionierten Abhängigkeitsvertrag ersetzt. Die Legacy-Mock-Funktionen bleiben für mechanische Tests erhalten; der reale Datenpfad importiert sie nicht.

## 2. Nachgewiesene technische Fehler und Behebung

### Historischer As-of-Nachlauf

Der gemeinsame MAX-Resolver reservierte bei ungekürzten Reihen den erforderlichen Nachlauf vor der As-of-Begrenzung. Ein gezielter Test belegte, dass so später vorhandene Beobachtungen ein historisches Ende zu spät zuließen. Jetzt wird zuerst der letzte damals bekannte Zeitpunkt bestimmt und danach der Nachlauf abgezogen. Der neue Test war vor der Reparatur rot und ist danach grün. Der reale Wochenledger hatte seine Eingaben bereits vorgefiltert; seine bisherigen finanziellen NVDA-Referenzwerte bleiben erhalten.

### Reproduktionsruntime fehlte im Eingabevertrag

Die unabhängige Zehnjahresprüfung zeigte eine reale Differenz zwischen Node 22 und Node 24: SPY-CAGR `0.13610348030850616` gegenüber `0.13610348030850594`, einschließlich der entsprechenden Excess-CAGR. Vor der Reparatur waren die Input-Hashes gleich, die Ergebnis-Hashes unterschiedlich. Es handelte sich um eine letzte Gleitkommastelle, nicht um andere Kurse oder einen Strategievorteil.

Jetzt sind Node-/V8-Version, Plattform, Architektur, glibc-Version und SHA256 der tatsächlich verwendeten Node-Binärdatei Teil von Input, Snapshot, Generation, Cache und Leseprovenienz. Der kanonische Referenzbestand wurde mit Node **22.23.4** neu berechnet. Derselbe Input unter derselben aufgezeichneten Runtime muss weiterhin **exakt** denselben Hash ergeben. Unterschiedliche Runtimes sind unterschiedliche Eingaben. Die Reproduktionsprüfung verweigert abweichende Runtime ausdrücklich; keine Toleranzschwelle ersetzt den Hashvergleich und keine Kennzahl wird passend gerundet. Nachweis: [runtime-proof.json](v51/runtime-proof.json).

### Lese-/Berechtigungs-/Identitätskontext

Ein langlebiger Reader darf weder eine alte Produktidentität noch eine inzwischen entzogene Anzeigeberechtigung aus einem warmen Cache weiterverwenden. Die private Komposition erneuert den bestehenden Service bei Generations-, Konfigurations- und Identitätswechsel. Sie prüft den Kontext nach asynchronen Reads erneut. Änderungen an Master-/Produktidentität halten Finanzdaten bis zur passenden Neuberechnung zurück. Die unveränderte kanonische Anzeigerichtlinie läuft mit einem privaten Registry-Zustand; andere Produkte werden nicht zurückgesetzt oder verändert. Tests belegen Revocation sowohl vor als auch während eines Detailabrufs.

### Rollback-Bindung

Ein neuer Negativtest war vor der Reparatur rot: ein widersprüchliches Runtime-/Modell-/Zeitmanifest konnte den bisherigen Release-Pointer ersetzen. Der Rollback prüft nun zuerst den Snapshot-Hash und bindet Root und sämtliche Summaries an dasselbe Modell, dieselbe Runtime und denselben Berechnungszeitpunkt. Alle 16 Refresh-/Rollback-Tests bestehen; bei Fehlern bleibt der gültige Pointer unverändert. Keine finanzielle Formel wurde dabei geändert.

### Öffentliche Auslieferung

Die private Implementierung ist aus dem Browser-Bundle ausgelagert. Ein Zwischenlauf lag auf der Startseite 93 Bytes über dem bestehenden Ressourcenbudget. Der verbleibende öffentliche Einstieg wurde ohne Änderung seiner Gates dedupliziert: 241 Bytes weniger. Finale Auslieferung: **1.819.852 von 1.820.000 Bytes**, beide Breiten grün. Kein Budget wurde angehoben. Die Reserve ist klein; den späteren Auswahladapter ausschließlich im betreffenden Backtest-/Rückblickpfad nachladen.

## 3. Aktuelle Daten und reale Ergebnisse

Die Zählbasis sind 6.190 gespeicherte `ref_*.json`-Serien-/Listingkandidaten. Ihre Identität und Ausführbarkeit werden einzeln geprüft; die Population ist kein vollständiges historisches Marktuniversum und keine statistisch unabhängige Stichprobe. Der vollständige Node-22-Lauf hat folgende tatsächlichen Ergebnisse:

| Merkmal | Wert |
|---|---:|
| Geprüfte gespeicherte Listings | 6.190 |
| Technisch ausführbar, alle Klasse B | 4.451 |
| Blockiert, Klasse C | 1.739 |
| Uneingeschränkte Klasse A | 0 |
| Vorbereitete Periodenergebnisse | 22.255 |
| Abgeschlossene MAX-Trades | 42.815 |
| MAX mit vollständigem SPY | 3.615 |
| MAX ohne vollständigen SPY | 836 |
| Bewertungsreichweite insgesamt | 11.01.1991–23.10.2026 |

Blocker: Warm-up 439, Wochenlücken 218, Corporate Actions 600, Instrumentklasse 295, Identität 183, terminaler Listingwert 4. Der vollständige Scan über alle 6.190 Serviceantworten ergibt 4.451 `AVAILABLE_LIMITED`, 1.739 `BLOCKED` und **null finanzielle Payloads auf blockierte Fälle**.

Die separate kanonische TR-Signalstudie weist weiterhin **6.036 von 6.174 Wertpapier-Kursreihen** aus, Einheit `SECURITY_PRICE_SERIES`. Das sind weder Wochen noch Trades noch der Nenner des später aktualisierten Preis-Batchs. Dieses passende Studien-/Qualitätspaar wurde nicht durch die heutige Seriepopulation ersetzt. Die TR-Studie und die neue Preis-Simulation sind unterschiedliche, ausdrücklich gekennzeichnete Datenstände/Methoden.

### NVDA

- Gespeicherte reale splitbereinigte Tiingo-Wochenkurse: **22.01.1999–23.10.2026**.
- 53 Wochen Warm-up; erster zulässiger Signalzeitpunkt **28.01.2000**, erster theoretischer Folgewochenhandel **04.02.2000**.
- Erstes tatsächliches Signal **11.02.2000**, erste tatsächliche Order **18.02.2000**.
- MAX-Bewertung **28.01.2000–23.10.2026**, 21 abgeschlossene Trades und eine offene Position; kein erfundener Abschluss der offenen M6-Position.
- Start 100.000 USD, Ende **4.853.701,42 USD**, CAGR **15,6284 %**, maximaler wöchentlicher Drawdown **−80,2182 %**.
- Modellierte Gebühren **36.559,17 USD**, Slippage **18.279,58 USD**; 10 bp Gebühr und 5 bp Slippage je Transaktionsseite. Keine historischen Brokerquotes.
- SPY auf exakt denselben **1.396 Bewertungsdaten**: Ende **559.315,55 USD**, CAGR **6,6510 %**, Drawdown **−55,9138 %**. Preisrendite in USD, ohne Transaktionskosten; der verifizierte gespeicherte SPY-Vertrag beginnt 1995.
- NVDA Buy-and-Hold CAGR **34,3992 %**; die Regel bleibt darunter. Keine Aussage über einen unabhängig bestätigten Signalvorteil.
- Der eingefrorene V4-Stichtag 16.10.2026 reproduziert weiterhin **4.926.635,79 USD**. Die neue letzte Woche erklärt die andere aktuelle Bewertung.

Folgewochenschluss ist ein erst nachträglich beobachteter Modellpreis und kein garantierter Live-Fill. Dividenden, Cash-Zinsen und intraday Drawdowns fehlen. Alle aktuellen Ergebnisse bleiben PRICE_RETURN / NOT_CERTIFIED.

| Fall | MAX / Befund | Benchmark und Auslieferung |
|---|---|---|
| NVDA | 28.01.2000–23.10.2026 | SPY vollständig; reale Summary, Equity, Trades, Kosten |
| MSFT | 11.01.1991–23.10.2026 | MAX-SPY unvollständig; Strategie bleibt ausführbar |
| XOM | 11.01.1991–23.10.2026 | Preisrendite ohne Dividenden; MAX-SPY unvollständig |
| ARM | 20.09.2024–23.10.2026 | SPY verfügbar; längere angefragte Perioden ausdrücklich unvollständig |
| AAPL | Corporate-Action-Sperre | Keine Performance |
| BGC | Terminalwert ungeklärt, historische Zuordnung getrennt | Keine Vermischung mit heutigem Listing, keine Performance |
| AAAC | Warm-up unzureichend | Keine Performance |
| AACT | Wochenlücke | Keine Performance |

Vollständige tatsächliche Nachweise: [data-validation.json](v51/data-validation.json), [materialization.json](v51/materialization.json), [resume.json](v51/resume.json).

## 4. Sechs Backtest-Arten – keine künstliche Zusammenlegung

| Art | Implementierung / reale Daten | Technischer und fachlicher Stand | Verbleibend |
|---|---|---|---|
| Same Stock Replay | `historical-cases.js` nutzt `pattern-research.js`, reale eigene Wochenhistorie, Episoden und Mindeststichproben. | Deskriptive ähnliche Kursbedingungen funktionieren mit LIMITS; nicht mit dem zusätzlichen NEW_52W_HIGH-Tradeledger gleichsetzen. LIMITED / nicht zertifiziert. | Survivor-by-construction und deskriptive statt bestätigender Regeltest bleiben Einschränkungen. |
| Pattern Evidence | Versionierte Musterstudien, `pattern-research.js`, Vergleichsgruppen und Unsicherheit. | Bestehende Auswertung erhalten, LIMITED. Keine neue Handelsausführung sämtlicher Muster. | Historische Population, Survivorship, geeignete Renditebasis und formale Backtest-Freigabe. Readiness-Alias `MARKET_PATTERN_BACKTEST` entspricht dieser Art. |
| Signal Backtest | Fünf unveränderte Regeln im bestehenden `signal-backtest.js`; zusätzliche reale NEW_52W_HIGH-Einzelaktienausführung. | Wochenrechnung mechanisch reproduzierbar; separate kanonische TR-Aggregatstudie unverändert. LIMITED / NOT_CERTIFIED. | Gemeinsame historische Population, Survivorship-/Regime-Nachweise und eingefrorene unabhängige Replikation; keine Optimierung nach bekannten Ergebnissen. |
| Setup Backtest | Veröffentlichte Snapshot-/Outcome-Reihen und getrennte historische PIT-Rekonstruktion; vorhandener Setup-Erzeuger. | COLLECTING_HISTORY; keine offenen M6-Horizonte als fertig gezählt. Keine Ersetzung durch heutige Setups. | Vollständige beobachtete Ausgänge, unabhängige Cluster, geeignete Renditebasis und OOS-/Entry-Varianten. Historische veröffentlichte PIT-Archive wären echte Datenabhängigkeiten, keine künstlichen Snapshots. |
| Strategy Backtest | Vorhandenes `profile-backtest.js`, strikt vor Rebalance bekannte Faktoren und Membership, TR-Vertrag. Legacy-Tagesengine separat mit dynamischer Historie. | Mechanik vorhanden; reale historische Portfolio-Freigabe bleibt COLLECTING_HISTORY. Mock-Testfunktionen sind kein realer Portfolio-Nachweis. | Historische Membership, richtige Population, PIT-Faktorstände, Total Return, Identitäts-/Delistingbelege. |
| Factor Ranking Backtest | Vorhandene Faktor-/Quintilengine und versionierte prospektive Faktorhistorie. | COLLECTING_HISTORY; keine heutigen Faktoren rückdatiert und kein heutiges Universum als historischer Ersatz. | PIT-Querschnitte, historische Vergleichspopulation und vollständige Forward-Outcomes; danach Rebalance-/Kostenvalidierung. |

Exakte offene Gates einschließlich der fünf Signalregeln: [six-kind-matrix.json](v51/six-kind-matrix.json). **0/6 zertifiziert.** Der Vergleich aller Status- und verschachtelten Gate-Zustände gegen den aktuellen Main ist unverändert: [certification-preservation.json](v51/certification-preservation.json). Keine pauschale fünfjährige Zukunftswartezeit für historische Preisrechnungen. Tatsächlich prospektive Setup-/unabhängige Nachbeobachtungen und fehlende historische Daten sind getrennte Aufgaben.

## 5. UI-Schutz und Übergabe

PR #873 ist die verbindliche Designbasis. Bytegenau geschützt sind 237 Dateien aus `quant/app/**`, `quant/ui/**`, `quant/index.html`, Assets/Navigation/Charts sowie die zugehörigen UI-Tests und `scripts/vu2/browser-qa.mjs`. Alle geschützten Quant-UI-Dateien blieben nach den Rebases bytegleich. Nur der Dokumentationshash von `assets/hero-visuals/README.md` wurde auf die inzwischen auf Main gemergte Fundamental-Dokumentation aktualisiert; deren Inhalt wurde nicht bearbeitet. Kein altes `page-stock.js`, kein `page-backtest.js`-Hook und kein V5-Renderer wurden übernommen. Keine andere Produktwelt wurde verändert.

Der ausführbare Übergabevertrag steht in [BACKTEST_V51_HANDOFF.md](BACKTEST_V51_HANDOFF.md). Er beschreibt Servicefunktionen, Pinned Selection, Ergebnisfelder, fünf Perioden, Geldwährung, Scope, Qualität, Benchmarks, Trade-/Equity-Details, Lade-/Fehlerzustände, Generationswechsel und Berechtigungsanforderungen. Der Auswahladapter enthält keine UI, keinen Transport und keine Rechenengine.

Der reale In-Process-Handoff wurde zusätzlich mit allen acht benannten Fällen, drei NVDA-Detailbereichen und 20 parallelen Equity-Abrufen geprüft; alle Antworten blieben generationsgleich. Kein HTTP-Endpunkt wurde dafür gestartet. Nachweis: [composed-reader.json](v51/composed-reader.json).

Keine Preview-Dateien wurden in den Konsolidierungsbranch aufgenommen. Funktionale Refresh-/Generationsprüfungen aus V4 wurden auf den vorhandenen Lesedienst übertragen. Die früheren PR-Branches und ihre optionalen Harnesses wurden nicht verändert oder gelöscht. Nur nicht mehr benötigte generierte V5-/V5.1-Static-Build-Verzeichnisse wurden lokal aufgeräumt; Quellcode, Berichte und private Ergebnisse bleiben erhalten.

## 6. Prüfungen und bekannte Befunde

- Erste vollständige Quant-Suite auf der UI-Refresh-Basis: **2.864/2.864 PASS**.
- Abschließende Suite auf der aktualisierten Main-Basis: **2.871/2.871 PASS**, 0 fehlgeschlagen, 0 übersprungen.
- Core-CI-Testbefehl wiederholt: **260/260 PASS**.
- Gezielte technische Prüfung: **108/108 PASS**; zusätzlicher letzter Reader-/Access-/Handoff-Lauf **46/46 PASS**.
- Shell-/Navigation-/Ressourcenbudget-Unit-Tests: **23/23 PASS**.
- Browser-Regression der tatsächlichen bestehenden Quant-Anwendung: **96 Checks, 0 Findings**, **8/8 Budgets**, **84 Accessibility-Seiten, 0 automatisierte Verletzungen**. Kein manuelles Accessibility-Zertifikat.
- Zusätzliche Direktlink-QA: **Chromium 12/12**, echtes **WebKit 7/7**; Journey-Surfaces **12/12** (sechs Aktien, 1440/390 px).
- Die sieben früheren Elliott-Registry-Fehler sind auf aktuellem Main bereits durch passende veröffentlichte Chartbild-Daten behoben: unveränderter Registry-Testbereich **12/12 PASS**. Kein konkurrierender Registry-/UI-Fix.
- Die zwei früheren Namensbefunde sind nach den gemergten #892/#873 nicht mehr vorhanden. Keine Assertion oder UI-Datei wurde hierfür geändert.
- Alle 6.190 Reader-Antworten und Ergebnis-/Detailhashes validiert; alle fünf NVDA-Perioden zweifach exakt unter derselben Runtime und unabhängig mit Python-Cash-/Anteilbuchführung nachgerechnet.
- Source-/JSON-/Syntax-/Produktionsdaten-Isolation und `git diff --check` geprüft. Keine privaten Ergebnisdateien, Schlüssel oder neuen Preview-Routen im öffentlichen Build.

Die zusätzlichen Core-Zustandsberichte im normalen PR-Modus melden weiterhin **System Health STALE** (u. a. Security Master/News) und **Data Quality WARN** (DQ-PX-2 Kursfrische, DQ-PX-3 Kurssprünge). Ihre relevanten Eingangsverzeichnisse und Core-Bewerter sind gegenüber Main unverändert; das sind keine durch diesen Diff reparierten oder neu erzeugten Produktdaten. Der strenge produktive Zeitplan wurde nicht ausgelöst. [main-operational-findings.json](v51/main-operational-findings.json) dokumentiert die Befunde.

Der vollständige Bestand wurde mehrfach aus tatsächlichen gespeicherten Daten materialisiert (vor/nach Runtime-Ergänzung und nach dem letzten Main-Rebase). Der letzte kalte Node-22-Lauf benötigte unter paralleler Regression **277,00 s**, Peak-RSS **388.014.080 Bytes**. Der vorherige Lauf benötigte 222,54 s bei anderer Last. Ein unveränderter Wiederholungslauf verwendet **6.190 bestehende Ergebnisse, 0 Neuberechnungen**. Kein unfairer Performancevergleich mit anderer Last/Runtime wird als Optimierung ausgegeben.

Inkrementelle Tests: eine geänderte Kursdatei → eine Berechnung und sieben Cache-Treffer; Corporate-Action-Fehler → genau dieses Listing blockiert; Modell-/Runtime-/Codeänderungen invalidieren konservativ. Teilgeneration, Writer-Konkurrenz, beschädigter Cache, geänderter Input während des Builds, Pointer-Wechsel, verlorener Pointer, Rollback und entfernte Berechtigung werden abgeprüft. Keine Provider-Abfrage und kein neuer produktiver Cron.

## 7. Reproduktion

Den aufgezeichneten Node-22-Binary/Native-Runtime-Kontext verwenden; der Referenzlauf wurde mit `/workspace/scratch/backtest-v3/node22/node_modules/node/bin/node` ausgeführt. Preise, Versionen und Regeln sind eingefrorene Eingaben. Keine kostenpflichtigen Datenzugriffe:

```bash
node scripts/quant/materialize-real-backtest-read.cjs --output /private/quant-backtests
node scripts/quant/validate-real-backtest-read.cjs /private/quant-backtests
node scripts/quant/run-real-weekly-backtest.cjs --security ref_NVDA --period MAX --output /private/nvda.json
python3 scripts/quant/verify-real-weekly-backtest.py /private/nvda.json
node scripts/quant/refresh-real-backtest.cjs --output /private/quant-backtests
node scripts/quant/rollback-real-backtest.cjs --output /private/quant-backtests --generation PREVIOUS_64_HEX
node --test 'quant/tests/*.test.mjs'
```

`node` bezeichnet in diesen Befehlen die dokumentierte Runtime, nicht beliebig das System-Default. Ein anderer Server darf Daten lesen, aber für einen exakten Reproduktionsnachweis nicht unbemerkt mit einem anderen Zahlenruntime neu rechnen.

Private Referenzartefakte: `/workspace/scratch/backtest-v51/all-listings`. Die öffentliche Build-QA liegt getrennt unter `/workspace/scratch/backtest-v51/latest-public-site`; dort liegen keine privaten Ergebnisgenerationen. Große Dumps und vollständige Trades/Equity bleiben außerhalb von Git.

## 8. PR-Konsolidierung und Release

Die vorhandenen Aufrufe sind kompatibel; alte gespeicherte Generationen ohne die neue Scope-Bindung müssen vor Verwendung durch diesen Reader neu materialisiert werden. Keine synthetische Nachbeschriftung. Die geprüfte vollständige Generation ist `d897b1adb58cd60edcb0bf8b946f79d28170f1c9b8b27e64257a0f504e0dba5e`.

Die sieben bisherigen PRs sind zum Prüfstichtag weiterhin offen, mit null eingetragenen menschlichen Reviews. Sieben identische stabile Git-Patch-IDs kommen in mehreren PR-Strängen vor; die Matrix führt die betroffenen Commit-SHAs auf. Keine Quelle ist als vollständiger Kopf bereits Vorfahr des geprüften Main. Ihre unveränderten Kopf-SHAs, Checks, aufgenommenen/ausgelassenen Teile und lokale Merge-Analysen stehen in [dependency-matrix.json](v51/dependency-matrix.json).

- #862 hat auf aktuellem Main Konflikte in den drei generierten Statusartefakten. V5.1 übernimmt Erzeuger und Konsistenzprüfungen und erzeugt diese Artefakte aus dem aktuellen Stand neu; alte JSONs werden nicht blind übernommen.
- #872 liefert die technische MAX-Schicht. Seine vorgeschlagene Zertifizierungsmethodik bleibt **separater fachlicher Entwurf** und wird nicht als Freigabevertrag aktiviert.
- #882/#894/#895 liefern wiederverwendete reale Engine, Kosten/Benchmark/Batch und privaten Lesedienst.
- #896 liefert die wiederverwendete Backend-Generations-/Refresh-Schicht. Preview-Transport und Renderer sind nicht erforderlich.
- #897 kollidiert mit dem gemergten `quant/app/page-stock.js`. Seine alten Frontend-Dateien dürfen nicht mehr nach Main gemergt werden; die spätere Anbindung beginnt am neuen UI.

**Empfohlene Reihenfolge:** bereits gemergte UI-/QA-Basis → vollständiger Review und Pflichtchecks des Konsolidierungs-PRs → bewusste Owner-Übernahme dieses einen technischen Strangs → ersetzte technische PRs schließen. Keine nacheinander ausgeführten doppelten Merges der kumulativen alten PRs. Vor einer vollständigen Schließung von #872 den dort ausgeschlossenen Methodikentwurf als eigene Review-Aufgabe erhalten oder ausdrücklich archivieren. Methodikentwurf und spätere UI-Anbindung separat entscheiden. V5.1 führt keine dieser Merge-/Schließaktionen automatisch aus.

## Nächster kleinster Auftrag

Den freigegebenen technischen Vertrag gezielt in den bestehenden Rückblick-/Backtestbereich des neuen Quant-UI einbinden: vorhandene Komponenten verwenden, Adapter nur dort nachladen, tatsächliche Perioden/Qualität/NOT_CERTIFIED darstellen und Details an die sichtbare Auswahl binden. Zuvor den vorhandenen autorisierten Auslieferungspfad und die interne/öffentliche Anzeigeentscheidung konkret festlegen. Keine erneute Engine- oder Kostenmodellimplementierung.

Technische Integrationsbereitschaft ist **READY_WITH_LIMITATIONS**. Methodische Zertifizierung und kommerzielle Produktfreigabe sind weiterhin nicht erteilt.
