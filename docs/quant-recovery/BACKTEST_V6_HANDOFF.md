# Quant Backtest – Übergabe von Auftrag 1 an Auftrag 2

**Dokumentvertrag:** `backtest-v6-handoff-1.0.0`  
**Status:** SECUREMENT_IN_PROGRESS – kein Nachweis eines bereits erfolgten Merges.  
**PR:** [#906](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/906)  
**Integrationsbasis:** `05cd43b34bce9cee25564a48db29ff19ba3b1c7b` (25.10.2026).  
**Verifizierter Main nach Übernahme / Merge-Commit #906:** noch offen; wird nach tatsächlichem Merge ergänzt.

## A. Repository und Sicherung

Auftrag 1 sichert den bestehenden technischen Unterbau. Er enthält keine neue Backtest-Art, keine Monte-Carlo-Implementierung, keine Frontend-Arbeit und keine Produktfreigabe. Alle realen Einzelaktienrechnungen bleiben **PRICE_RETURN / NOT_CERTIFIED**, `productionApproved=false`.

Die Vorgänger #862, #872, #882, #894, #895, #896 und #897 waren bei Beginn dieses Auftrags offen. Ihre vollständigen Köpfe werden nicht nacheinander gemergt: Sie enthalten kumulative/doppelte technische Patches sowie alte UI- und Preview-Anteile. #906 übernimmt die benötigten Backendteile selektiv. Eine Schließung erfolgt erst nach verifizierter Übernahme und mit nachvollziehbarem Verweis. Originalbranches werden dabei nicht gelöscht. Der endgültige Status steht nach Abnahme unter `v6-securement/` und im Abschlussabschnitt dieses Dokuments.

### Methodikgrundlage für Auftrag 2

Der [Methodikentwurf V1](methodology-v1/README.md) aus #872 wurde ausdrücklich gesichert: Markdown und Maschinenvertrag sind bytegenaue Kopien des Commits `0a57295f5a1ddffb8bf125646428ce29e9ba281e`. [Manifest und SHA256](methodology-v1/manifest.json) belegen Herkunft und Inhalt. Der Entwurf liegt bewusst im Dokumentationsarchiv, nicht im aktiven `quant/methodology/`-Ladepfad. **PRESERVED_PROPOSAL_NOT_APPROVED**: keine automatische Übernahme seiner Schwellen oder Zertifizierungskriterien.

Auftrag 2 muss insbesondere 99,5 % Outcome-Abdeckung, Regimegrenzen, 0,50 Prozentpunkte Mindestwirkung, die Bedeutung prospektiver Beobachtungszeit und des M6-Nachlaufs fachlich entscheiden. Technische Ausführung, methodische Zertifizierung, statistischer Effekt und wirtschaftlicher Vorteil bleiben getrennte Achsen. Bestehende strengere Gates bleiben bis zur ausdrücklichen Entscheidung unverändert.

## B. Technischer Backtest-Unterbau

| Bestandteil | Implementierung / Vertrag |
|---|---|
| Historische Eingaben | Bereits gespeicherte Tiingo-Serien in `quant/data/market/discover-series-long/ref_*.json`, splitbereinigte Wochenschlusskurse; Security Master und Produktidentitäten. Keine neuen Provider-Abfragen. |
| MAX / As-of | `quant/engines/backtest-history.js`: früheste verfügbare und zulässige Daten, Warm-up, Nachlauf und limitierende Abhängigkeiten. Erst As-of begrenzen, danach erforderlichen Nachlauf reservieren. Kein festes Jahr 2006/2020 und keine pauschale Fünfjahresgrenze. |
| Real-Data-Adapter | `weekly-real-adapter.cjs`: stabile Listing-Zuordnung, Quelle/Bytes-/Identitätshashes, Wochenlücken, Corporate Actions, Instrumentklasse und terminale Holds; kein Mock-Fallback. |
| Ausführung | Bestehende Regel NEW_52W_HIGH unverändert: aktuelle abgeschlossene Woche gegen die vorigen 52, vorhandener 53-Bar-Warm-up und 13-Wochen-Event-Cooldown. Signal erst nach Schluss bekannt; Entry zum beobachteten Folgewochenschluss, Exit nach 26 weiteren Wochen. Ein finanzierter Bestand, überschneidende Signale überspringen, verfügbare Mittel wiederanlegen. |
| Modellgrenze | `VALIDATED_EXECUTION_MODEL` gilt ausschließlich für Mechanik. Folgewochenschluss ist ein nachträglich beobachteter Modellpreis, kein garantierter Live-Fill. Offene Positionen werden bewertet, ohne erfundenen Exit oder abgeschlossenen M6-Ausgang. |
| Kostenmodell V2 | `weekly-execution-model-v2.json`, `PER_SIDE_NOTIONAL`: 10 bp Gebühren und 5 bp Slippage je Seite; Kaufnotional = Cash / 1,0015, Verkaufskosten auf tatsächlichem Verkaufsnotional. Keine Zwischenrundung, keine Cash-Verzinsung. Historische Brokerkosten werden nicht behauptet. |
| Rendite | PRICE_RETURN, Dividenden ausgeschlossen. `metrics.totalReturn` ist ein historischer Feldname für kumulative Preisrendite. Wöchentlicher Drawdown, keine intraday Verlustmessung. |
| Benchmarks | Eigene Aktie und SPY Buy-and-Hold, gleicher tatsächlicher Bewertungszeitraum, USD/gleiche Renditebasis; passive Benchmarks ohne Transaktionskosten ausdrücklich gekennzeichnet. Fehlende vollständige SPY-Historie ergibt BENCHMARK_UNAVAILABLE, keine Interpolation und keine stille MAX-Verkürzung. |
| Qualität | A technisch uneingeschränkt, B eingeschränkt nutzbar, C blockiert. Reale vorhandene Simulationen sind derzeit B oder C. Identitäts-, CA-, Lücken-, Warm-up-, Instrumentklassen- und Terminalwert-Holds bleiben erhalten. |
| Speicherung | `materialize-real-backtest-read.cjs`, privates Verzeichnis außerhalb des Repositorys; versionierte Snapshot-/Summary-/Equity-/Trade-/Qualitätsdateien, Hashes und geshardeter Index. Vollständiger Batch ist wiederaufnehmbar; keine Detail-Vollbeladung beim einzelnen Abruf. |
| Generationen | Vollständige atomare Veröffentlichung, Writer-Lock und Akquisitionssperre. Neue/fehlerhafte Teilgeneration ersetzt nicht den letzten gültigen Pointer. Archive bleiben nachvollziehbar. |
| Refresh / Rollback | Explizite lokale Skripte `refresh-real-backtest.cjs` und `rollback-real-backtest.cjs`. Geänderte Inputs invalidieren passende Rechnungen; neue Runtime/Modell-/Benchmark-/Codeabhängigkeit konservativ. Rollback prüft Snapshot, Root-/Summary-Modell, Runtime, Zeitbindung und Details vor Pointerwechsel. Kein neuer Produktions-Cron. |
| Reproduktion | Node-/V8-Version, Plattform/Architektur, glibc und SHA256 der tatsächlichen Node-Binärdatei sind Eingaben. Identische Inputs unter aufgezeichneter Runtime müssen exakt dieselben Input-/Result-Hashes ergeben. Abweichende Runtime wird für exakte Neuberechnung zurückgewiesen; keine passende Rundung von Finanzkennzahlen. |

### Bestehender Quant-Lesedienst

Zentral bleibt `quant/api/product-services.js#create().getRealBacktest(ticker, selection)`. Die private Node-Komposition ist `server/quant-backtest-reader.cjs`; der reine Auswahladapter liegt unter `quant/api/real-backtest-selection.js`. [Ausführbarer Übergabevertrag](BACKTEST_V51_HANDOFF.md) dokumentiert Felder und Beispielaufrufe.

- Perioden: `1Y`, `3Y`, `5Y`, `10Y`, `MAX`. Junge Listings liefern tatsächliche Grenzen und `complete=false`; die angeforderte Periode wird nicht still umbenannt.
- Bereiche: `summary`, `quality`, `equity`, `trades`. Listing, Generation und Ergebnishash werden zwischen den Abrufen gebunden. Bei Generationswechsel Auswahl neu laden.
- Zustandsachsen: AVAILABLE_LIMITED / BLOCKED / UNAVAILABLE; Benchmark separat; immer NOT_CERTIFIED und keine Produktionsfreigabe.
- Blockierte Antworten enthalten kein `result` und keine Performance-Ersatzwerte.
- Expliziter privater Store, INTERNAL_REVIEW und vertrauenswürdiger serverseitiger Tickerumfang erforderlich; Standardzustand deaktiviert. Die Komposition ist keine Benutzer-Authentifizierung und kein HTTP-Endpunkt. Ein späterer Transport benötigt eine gesondert geprüfte Autorisierung.
- Berechtigungs-/Identitätskontext wird auch nach asynchronem Lesen erneut geprüft. Entzogene Grants und geänderte Identität dürfen nicht aus warmen Caches weitergeliefert werden. Andere Produktregistries werden nicht verändert.
- Alte Ergebnisse ohne neue Scope-Bindung müssen neu materialisiert werden; keine synthetische Nachbeschriftung. Vollständige private Generationen gehören nicht in öffentliche Builds oder Git.

### Daten und Referenzen

Referenz vor erneuter Abnahme: 6.190 gespeicherte Serien-/Listingkandidaten, 4.451 Klasse B, 1.739 Klasse C, 22.255 Periodenergebnisse. Diese Population ist kein vollständiges historisches Marktuniversum und keine unabhängige Stichprobe. Der tatsächliche neue Lauf und dessen Hashes werden unter `v6-securement/` protokolliert.

NVDA-Referenz: reale Wochenhistorie 22.01.1999–23.10.2026, zulässiger Signalbeginn 28.01.2000, erster tatsächlicher Handel 18.02.2000; 21 abgeschlossene Trades und eine offene Position. Zuletzt unabhängig geprüft: Start 100.000 USD, Ende 4.853.701,42 USD, CAGR 15,6284 %, wöchentlicher Drawdown −80,2182 %. Eigene Buy-and-Hold-CAGR rund 34,3992 %, SPY rund 6,6510 % auf gemeinsamer NVDA-Periode. Dies ist keine Behauptung eines unabhängig bestätigten Signalvorteils.

Die ältere kanonische TR-Signalstudie 6.036/6.174 bezeichnet Wertpapier-Kursreihen und einen anderen versionierten Studienstand. Sie wird nicht mit dem Preis-Simulationsbatch oder Wochen-/Tradezahlen gleichgesetzt. Herkunft, Renditebasis und As-of bleiben getrennt ausgewiesen.

## C. Sechs bestehende Backtest-Arten

Alle bestehenden Funktionen bleiben erhalten. Die NEW_52W_HIGH-Einzelaktienrechnung ersetzt keine der anderen fachlichen Studien. [Ausführliche unveränderte Gates](v51/six-kind-matrix.json) und der aktive `backtest-certification-v1.json` bleiben maßgeblich; derzeit **0/6 CERTIFIED**.

| Art | Vorhandene Funktionalität / Engine | Fehlende Funktionalität und historische Daten | Tests / tatsächlicher Status |
|---|---|---|---|
| Same Stock Replay | `historical-cases.js` / `pattern-research.js`: ähnliche historische Episoden derselben Aktie; zusätzliche reale Wochen-Tradebuchführung ist ausdrücklich ein enger Einzeltitel-Scope. | Deskriptive Episoden sind keine unabhängige Regelvalidierung. Survivor-by-construction, genügend geeignete Episoden und korrekte eigene Listing-/Kursidentität beachten. | Historische Fälle/Pattern-Tests; `real-weekly-backtest.test.mjs`, `backtest-history.test.mjs`; LIMITED / NOT_CERTIFIED. |
| Pattern Evidence | `pattern-research.js`: versionierte Musterbeobachtungen, Vergleichsgruppen, Unsicherheit und gepurgte Folds. | Unvollständig quantifizierte Survivorship-Effekte, geeignete historische Population und TR-Basis der konkreten Studie; keine künstliche Handelsausführung aller Muster. | `pattern-research.test.mjs`, `pattern-research-volume.test.mjs`; LIMITED / NOT_CERTIFIED, `DESCRIPTIVE_NOT_A_TEST` bzw. eigene Studiengrenzen erhalten. |
| Signal Backtest | `signal-backtest.js`: fünf bestehende Regeln und vorhandene Studien-/Robustheitsergebnisse; `run-real-weekly-backtest.cjs` führt NEW_52W_HIGH als echte Einzeltitel-Preisrechnung aus. | Historische Population, Listing-/Delisting-Fälle, Survivorship-/Regime-Nachweise und vorab eingefrorene unabhängige Validierung. Bereits explorativ betrachtete Historie wird nicht erneut als unabhängig bezeichnet. | `signal-backtest.test.mjs`, Real-Weekly-, Benchmark-, Read-, Kosten-/Prefix-Tests und unabhängige Python-Rechnung; LIMITED / NOT_CERTIFIED, keine Regel CERTIFIED. |
| Setup Backtest | Veröffentlichte Setup-Snapshots und Outcomes, davon getrennte historische PIT-Rekonstruktion in `build-setup-backtest.mjs` / `replay-setup-history.mjs`. | Zu wenig Historientage/-spanne, abgeschlossene M6-Ausgänge/Titel, zeitliche Cluster, geeignete TR-Basis; Entry-Varianten und OOS noch nicht belastbar. Keine heutigen Snapshots als damalige Werte. | Setup-/Outcome-/State-Vertragstests und Zertifizierungstests; COLLECTING_HISTORY / NOT_CERTIFIED. Unvollständige Horizonte bleiben unvollständig. |
| Strategy Backtest | Bestehende `profile-backtest.js`-PIT-Ausführung, streng vergangenheitsbezogene Mitgliedschaft/Faktoren. Legacy `backtest.js` besitzt Portfolio-/Rebalancingmechanik; Mock-Provider bleibt Testwerkzeug. | Historische Universumsmitgliedschaften und ausreichend lange PIT-Faktorreihen; kein Survivor-by-construction-Portfolio aus heutigen Mitgliedern. Die Legacy-Mechanik ist kein Nachweis realer universumsweiter Portfolioausführung. | Profil-/PIT-/Backtest-/Provider-Tests; COLLECTING_HISTORY / NOT_CERTIFIED. |
| Factor Ranking Backtest | `profile-backtest.js`, `build-factor-evidence.mjs`: vorhandene Faktorbeobachtungen und Forward-Outcomes. | Längere PIT-Faktorhistorie, zeitlich richtige Vergleichspopulation/Membership, vollständig beobachtete Forward-Ausgänge und belastbare Rebalance-/Kostenstudie. Keine heutigen Rankings rückdatieren. | Faktor-/Profil-/Forward-/Zertifizierungstests; COLLECTING_HISTORY / NOT_CERTIFIED. |

Technisch korrigierte Datenlücken werden nicht mit methodischer Zertifizierung gleichgesetzt. Unbekannte Delisting-Auszahlungen sind weder null noch automatisch Totalverlust. Fehlende historische Daten und notwendige künftige prospektive Beobachtungen sind getrennte Aufgaben. Für vorhandene geeignete Preisgeschichte gibt es keine pauschale Wartepflicht von fünf Jahren.

## D. Verbindlicher Planungsumfang für Auftrag 3 – keine Implementierung in Auftrag 1

| Erweiterung | Wiederverwendung | Abhängigkeiten / vor Implementierung festzulegen |
|---|---|---|
| Monte-Carlo-Simulation | Reale Trades/Equity, deterministische Hashes und Generationsmechanik. | Vorregistriertes Resampling-/Risikomodell, Seeds, Block-/Clusterabhängigkeiten, Kosten und Unsicherheit; Szenarien ausdrücklich als synthetische Simulation kennzeichnen. Keine Ersetzung beobachteter Historie oder historischer Universen. |
| Walk-Forward-Analyse | Vorhandene Signalstudien/Folds, Ausführungsmodell und Zeitfensterresolver. | Chronologische Train-/Validierungs-/Testfenster, Purging/Embargo für überlappende 26-Wochen-Outcomes, vollständig gereifte Ergebnisse, feste Auswahlregel und unabhängige Nachprüfung. |
| Out-of-Sample-Prüfung | Bestehende OOS-Studien und Reproduktionstests. | Alle bereits betrachteten Perioden als bekannt markieren; neuer unabhängiger Holdout bzw. prospektive Prüfung, Vorregistrierung und Fehlerkontrolle. Mechanische OOS-Gates sind kein Profitabilitätsnachweis. |
| Marktregime-Backtests | Vorhandene Regime-/Signalverträge, Zeit-/As-of-Resolver und Benchmarks. | Unabhängige nachvollziehbare Regimehistorie, damalige Verfügbarkeit und genügend unabhängige Episoden. Ex-post-Labels von damals bekannten Signalen trennen; vorgeschlagene Clustergrenzen erst in Auftrag 2 entscheiden. |
| Parameter-Sensitivität | Vorhandene Parameter-, Slippage-, Kosten- und Entry-Delay-Studien. | Vorab fixiertes Raster, Unsicherheit, multiple Vergleiche, stabile Nachbarschaften und unabhängiger Bestätigungstest. Bestehende fünf Regeln nicht nach bekannten Ergebnissen optimieren. |
| Event-Driven Backtests | Signal-/Outcome-Ledger, Listing-Identität, Kosten und Corporate-Action-Prüfungen. | Echte Ereigniszeit, Veröffentlichung/Verfügbarkeit, Revisionen, Ausführbarkeit und Listingbezug. SEC-Veröffentlichung oder Corporate Action nicht mit heutigem Kenntnisstand als damaliges Event erfinden. |
| Portfolio-Rebalancing | Vorhandene `profile-backtest.js`-/Legacy-Portfolio-/Rankingmechanik, Cash-/Kostenbuchführung und Verträge. | Historische PIT-Mitgliedschaft und Faktoren, Kalender, Rebalance-Zeit, Gewichtung, Liquidität, Corporate Actions, Delisting-Returns und Kosten. Wochen-Einzeltitelmodell nicht fachlich gleichsetzen; keine neue parallele Engine ohne belegten Bedarf. |

Auftrag 2 klärt gemeinsame fachliche Regeln, Abnahmen und die Lizenz-/Datenlücken. Erst danach sind diese Erweiterungen als Auftrag 3 technisch auszuführen. Negative methodisch valide Ergebnisse und ein positiver unabhängiger Vorteil bleiben unterschiedliche Sachverhalte.

## E. Verbindliche Schutzregeln

- Keine Frontend-, Navigations-, Menü-, Chart-, Theme-, Icon-, Typografie- oder Layoutänderungen. Die aktuelle Main-UI und ihr Refresh bleiben verbindlich; alte Backtest-UI-Dateien werden nicht übernommen.
- Keine Änderungen an anderen Produktwelten oder produktiven Datenpipelines/Schedulern. Keine zusätzliche Preview oder Hosting-Infrastruktur.
- Keine erfundenen historischen Kurse, Dividenden, Fundamentalstände, Rankings oder Memberships; keine ungeprüfte Interpolation.
- Keine Abschwächung von Datenqualität, PIT, Identität, Survivorship oder Zertifizierung. Historische Simulation ist keine as-published-PIT-Historie.
- MAX verwendet die maximal fachlich zulässige gespeicherte Historie nach tatsächlichen Abhängigkeiten, Warm-up und Nachlauf; keine pauschale Fünfjahreswartezeit.
- PRICE_RETURN und TOTAL_RETURN trennen; Benchmarks, Kosten, Währung und gemeinsame Periode korrekt ausweisen.
- Keine Produktfreigabe oder automatische Zertifizierung. Ein grüner Test beweist keine positive Strategieperformance.
- Keine Umgehung von Branch Protection, Reviews oder Pflichtchecks. Vorgänger erst nach verifizierter technischer Sicherung schließen.

## F. Prüf- und Merge-Nachweis

Die erneuten Prüfergebnisse, aktuelle Generation, Herkunftshashes, UI-Schutz und der abschließende PR-/Main-Zustand werden unter `v6-securement/` gesichert. Die Zahlen aus dem V5.1-Bericht sind Referenzen; Auftrag 1 führt neue Läufe aus. Bisherige Nachweise: [V5.1-Bericht](BACKTEST_V51.md), [Servicevertrag](BACKTEST_V51_HANDOFF.md), [Gate-Matrix](v51/six-kind-matrix.json).

**Abschlussstatus:** noch ausstehend. Keine vorweggenommene Merge- oder Freigabebehauptung.
