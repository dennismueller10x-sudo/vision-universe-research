# Quant – verifizierte Übergabe V7 an V8

Vertrag `backtest-v8-handoff-1.0.0`. Technischer Abschlussstatus **V7_SECURED_AND_MERGED**. Fachlicher V7-Status weiterhin **V7_PARTIALLY_VALIDATED**. Keine Produktfreigabe.

## A. Gesicherter Repositoryzustand

- PR [#961](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/961): **MERGED**, tatsächlicher Head-Branch `research/quant-v7-evidence`.
- Ursprünglicher V7-Head: `be42b4d4767e87ee2a9106dbc7fd987e5f8c565a`.
- Initialer Main: `0ea8a11429ec2932ad2948f7ecb9bc02aaa0e14a`; abschließend integrierter aktueller SEC-Datenstand: `e877dd7ae255bce69353ff2fa20f1ae4f99ccb12`.
- Vollständig quellcodegeprüfter Integrationshead: `517f7408f1888ffecf9bab00ed4efda7c6eda8d8`; letzter Integrationshead mit erneut geprüften aktuellen SEC-Daten: `a00ce06c1627e60313e783dd65e3706eb5d555ba`. Quellcode und Testdateien zwischen beiden Heads identisch.
- Zusätzlicher Main-Logo-Refresh `a0bd3d704408aea62f94c5ed39d75c3750b907cb` vor Merge konfliktfrei erhalten; keine Backend-/Teständerung.
- **V7-Merge-/nachgeprüfter Main: `da1a82dcd17a1d4454e9fca75237c85cca9e16ee`.** Diese Übergabe wird als reine Dokumentationssicherung auf diesem geprüften Runtime-Stand ergänzt. Der abschließende Main-Commit steht im Abschlussbericht der Sitzung; der Dokumentationsmerge ändert keine Runtime.
- Main-Ergänzungen vor Integration: Technical B6/B7/B13/B18, SEC-Consumer-Fehlerbehandlung #958, Isolationspuffer #963, Technical-Dokumentation #965. Die aktuellen Main-Dateien wurden erhalten, einschließlich `technical/app.js` und `technical/engine/model.js`.
- [Sicherungsnachweise](v7-securement/acceptance.json), [Gesamtsuiten](v7-securement/validation.json), [vollständige Isolation](v7-securement/isolation.json), [Post-Merge-Prüfung](v7-securement/post-merge.json), [zusätzlich erfolgreiche Main-Quant-/SEC-CI](v7-securement/main-remote.json).

GitHub meldete keine erforderlichen Checks und keine Reviewanforderungen/offenen Reviewthreads. Der fehlgeschlagene Vercel-Kontext war laut GitHub `isRequired=false`, Ursache Deployment-Ratenlimit. Kein Retry, Upgrade, Admin-Merge oder Branch-Protection-Bypass. Alle ausführbaren GitHub-Fachchecks wurden vor Merge erfolgreich abgeschlossen. Lokale Quant-Gesamtsuite: 3.098 bestanden, 0 reguläre Fehler, 1 bereits auf Main vorhandenes Technical-B7-TODO (Parabolic SAR), nicht als bestanden gezählt. Vollständige Isolation 278/278 Dateien; Core 239, SEC-Python 555, SEC/PIT 32, Consumer 66. Research/Fundamental-Teilmenge 122/122, aktuelle Daten-/Fundamentaltests 186/186. 47 Reproduktions-/Scopeprüfungen und 40 unabhängige Python-Prüfgruppen bestanden; acht SEC-Originale offline identisch geprüft. Keine Testdeaktivierung oder Abschwächung.

Einzelne durch Workflowbedingungen übersprungene Live-/Messjobs sind nicht als bestanden gezählt. Der externe optionale Vercel-Fehler bleibt separat sichtbar.

Alle sechs V7-Abschlussdokumente und ihre ursprünglichen Evidence-Artefakte bleiben unverändert erhalten: [Final](BACKTEST_V7_FINAL.md), [Matrix](BACKTEST_V7_EVIDENCE_MATRIX.md), [Realstudien](BACKTEST_V7_REAL_STUDIES.md), [Datenerschließung](BACKTEST_V7_DATA_RECOVERY.md), [Methodikentscheidungen](BACKTEST_V7_METHODOLOGY_DECISIONS.md), [Validierung](BACKTEST_V7_VALIDATION.md). V5.1/V6-Berichte wurden nicht überschrieben. Neue Sicherungsbelege stehen separat unter `v7-securement/`.

## B. Fachlicher Stand und Implementierung

**13/13 implementiert; 2/13 im definierten Methodenscope abgenommen; 0/6 Backtest-Arten CERTIFIED.** Alle Research-Ergebnisse bleiben `NOT_CERTIFIED`, `productionApproved=false`. Der technische Merge erweitert keine Produktzulassung.

| Bereich | V7-Stand für V8 |
|---|---|
| Same Stock Replay | Deskriptive Fallansicht erhalten; regelbasierte Einzelaktienstudien, begrenzte Survivor-Kohorte |
| Pattern Evidence | Reale zeitgleiche Kontrollen im Referenzscope; zeitliche Abhängigkeit/Marktpopulation weiter offen |
| Signal Backtest | Alle fünf unveränderten Regeln auf realen Wochenreihen; Long-Ereignisse, keine automatische Shortstrategie |
| Setup Backtest | Originalarchive und Rekonstruktionen getrennt; offene M6 unverändert offen; Wochen-/Monatsdiskrepanz nicht still geändert |
| Strategy Backtest | Strenge PIT/TR-Buchführung erhalten; V7-Preisportfolio mit festen Gewichten ist keine zertifizierte PIT-Profilstrategie |
| Factor Ranking | Vor Outcomeauswahl gerankt; eingeschränkte gespeicherte Accessionquerschnitte, unvollständige ursprüngliche Vintages |
| Monte Carlo | **Methodisch abgenommen:** bedingtes empirisches Resampling, IID als Szenario bzw. Circular Blocks; keine Aussage über echte Austauschbarkeit/Stationarität oder zukünftige Gewinne |
| Walk-Forward | Chronologische Partitionierung/Purging/Embargo und gereifte Labels geprüft; letztes reales Validierungsfenster leer, vollständige Fit/Select/Test-Abnahme offen |
| Out-of-Sample | **Methodisch abgenommen:** Registrierung/Expositionsverwaltung und Schutz vor Wiederverwendung; keine unabhängige Bestätigung einer Tradingregel |
| Marktregime | Reale ex-post Trend-/Volatilitätsanalyse; keine frühere PIT-Signalverfügbarkeit daraus ableiten |
| Parameter-Sensitivität | Vollständiges deskriptives Raster; gültige Abhängigkeitsinferenz/p-Werte für eine vollständige Holm-Abnahme fehlen |
| Event-Driven | Reale gespeicherte SEC-Verfügbarkeitsereignisse; Original-Acceptanceaudit nur partiell, keine erfundenen Earningszeiten |
| Portfolio-Rebalancing | Drei reale virtuelle Preisportfolios mit Cash/Drift/Kosten unabhängig nachgerechnet; reale vollständige CA-/TR-/Terminalabnahme offen |

Offline-Einstieg: `scripts/quant/run-research.cjs`; Engines: `quant/engines/research-{contract,artifacts,studies,portfolio,validation,monte-carlo,exposure,weekly-source}.cjs`. Keine redundante Ersatzengine aufbauen.

V7 umfasst **27 Analysefälle + 16 MC-Konfigurationen**, keine 43 unabhängigen Studien: elf benannte Referenzlistings, fünf Signalregeln, Patternkontrollen, rekonstruierte Setuphorizonte, 104 Margenquerschnitte aus vier SEC-Beispielen, 97 SEC-Verfügbarkeitsereignisse, drei Preisportfolios, zwei WF-/OOS-Varianten und 72 Sensitivitätspunkte. Die größere 40er-Klassifikationsprobe wurde nicht als Common-Stock-Marktevidenz übernommen. [Gebundene Ergebnisübersicht](v7/real-studies.json.gz).

## C. Daten und verbleibende D01–D13-Grenzen

| Lücke | Vorhanden / noch nötig |
|---|---|
| D01 Identität | Vorhandener Tiingo-Master und Listingadapter; 180 mehrdeutige IDs ausgeschlossen. Historische MIC-/Ticker-/Primär-/Klassenintervalle unvollständig. FRMEP/MBINM zeigen, dass heutige Common-Klassifikation nicht ungeprüft genügt. |
| D02 Terminal | Einzelne inaktive Listings erkannt; keine neue belegte vollständige Cash-/Stock-/Liquidationsgraphhistorie. Unbekannt weder null noch letzter Kurs. |
| D03 Preise | 6.190 lange Listingkandidaten + eine Metadatei; 4.451 bestehen den vorhandenen Wochenadapter. Das ist keine Common-/PIT-Marktvollständigkeit. 218 Wochenlücken nicht interpoliert. |
| D04 CA/TR | Bestehende CA-/TR-Mechanik und aggregierte Studien; 600 Wochenreihen mit ungelösten CA ausgeschlossen. Private Raw-CA-/Dividendenvorlagen nötig, keine Ausschlüsse ohne Beleg auflösen. |
| D05 Universen | Junge Membershiparchive, aktueller Master; kein vollständiges damaliges Markt-/Indexuniversum. Aktuelle Mitglieder nie rückdatieren. |
| D06 SEC/PIT | Consumerhistorie inklusive #935/#956 und Fehlerbehandlung #958; `as_of_latest` kein Originalvintagearchiv. Acht originale XBRL-Dateien (71.997.151 Bytes) mit 23/23 Werteparitäten; eine Original-Acceptancezeit geprüft. Vollständige Erst-/Restatementhistorie fehlt. |
| D07 Faktoren | Junge Originalfaktorarchive; 104 rekonstruierte operative Margenquerschnitte getrennt. Nicht als frühere VU-Veröffentlichung ausgeben. |
| D08 Events | Accession/`available_from` und eine Originalheader-Gegenprobe. Vollständige originale Acceptance-/Publikationsereignisse und echte Earningszeiten fehlen. |
| D09 Regime | Ex-post SPY-Trend/Volatilität und junge Produktregimehistorie. Beschreibung ersetzt keine frühere Signalverfügbarkeit. |
| D10 Benchmark | Vorhandener SPY-Preisvertrag auf exakten gemeinsamen Daten; kein SPY vor Existenz, kein TR-Label für Preise. FX nur bei tatsächlich nötigen Währungen. |
| D11 Ausführung | Explizite Gebühren-/Slippage-/Delaymodelle und Kostenparität. Historische Spreads/Impact/Brokerkonditionen/Kapazität nicht belegt. |
| D12 Unabhängigkeit | Betrachtete Historie im Expositionsledger; Wiederholung und anderer Provider machen sie nicht unberührt. Neue unabhängige/prospektive Kohorte nur mit tatsächlichem Nicht-Expositionsnachweis. |
| D13 Rechte | Bestehende Tiingo-/Marketstack-/SEC-Rechte im belegten Scope; Marketstack-Europa-Displaygrant nicht als allgemeine US-Historienlizenz behandeln. Keine neue Lizenz-/Produktglobalblockade. |

Private lokale V7-Inputs/Resultate/92 geprüfte immutable Generationen und SEC-Dateien lagen während der Sicherung außerhalb Git unter `/workspace/v7-private/`. Sie sind keine zugesagte dauerhafte Ablage. Verfügbarkeit einer späteren Sitzung ausdrücklich prüfen. Private Tiingo-/Discover-/SEC-Caches und R2 sind dokumentiert, aber aktuelle Runtime hat keine Provider-/R2-/Entschlüsselungscredentials. Bestehenden Zugang über den vorgesehenen Umgebungsmechanismus bereitstellen, keine Geheimnisse in Logs/Git. Keine neuen Anbieter beauftragen. SEC-Original-PoC nutzt den bestehenden Client, Cache, Emittenten-CIK und Verfügbarkeitszeit statt Filing-Agent-Präfix/lexikographischer Auswahl. Original-Filings sind kein Listing-/Delistingfeed.

## D. Konkrete V8-Prioritäten

1. **Bestehende private Archive erschließen:** vorhandene Raw-Preise, CA, originale SEC-Antworten und Membership-/Faktor-/Regimeversionen feldgenau inventarisieren, nachdem der vorhandene Zugriff eingerichtet ist. Kein flächiger Provider-Neuabruf.
2. **Identität/CA gezielt reparieren:** konkrete mehrdeutige Listings, Klassen-/Tickerwechsel und dokumentierte TR-Widersprüche anhand Originalquellen; unbekannte terminale Werte weiter zensieren. Originalarchive und Rekonstruktion getrennt halten.
3. **Fünf Erweiterungsmethoden abschließen:** WF mit ausreichend besetzten gereiften Train/Validation/Testfenstern; Regimeepisoden und Abhängigkeit; registrierte Sensitivitätsinferenz; zeitlich belegte Originalevents; reale CA-/TR-/Terminalbuchführung für Rebalancing. Vorhandene Engines weiterverwenden.
4. **Sechs Backtest-Arten weiter qualifizieren:** geeignete begrenzte Populationen mit explizitem Nenner/Coverage/Survivorship und tatsächlicher Historie. Keine marktrepräsentative Zertifizierung aus ausgesuchten Überlebenden.
5. **Unabhängige Studien:** vor Entsiegelung Regel, Parameter, Universum/Vintage, Kosten, Benchmark, Endpunkt, Reife, Cluster, Suchraum und Mehrfachtests registrieren. Bekannte Daten bleiben Exploration. Negative methodisch korrekte Ergebnisse sind zulässig.
6. **Externe Abhängigkeiten trennen:** fehlender Zugriff auf vorhandene Daten, tatsächlich fehlende Daten, ungeklärte Rechte, methodische offene Punkte und echte normative Ownerentscheidungen separat ausweisen.

## E. Sofort ausführbar und tatsächlich blockiert

**Sofort ohne neue Datenkäufe:** vorhandene Forschungsinputs und Ergebnisgenerationen bei geändertem Code gezielt nachrechnen; vorhandene Wochen-/SEC-Teilpopulationen qualifizieren; Abhängigkeits-/Fenster-/Sensitivitätsmethodik mit registrierter unveränderter Auswahl verbessern; SEC-Originale anhand bestehender Accessions kontrolliert und budgetiert ergänzen; bestehende Klassifikations-/CA-Konflikte anhand erreichbarer Quellen untersuchen. Keine erneute komplette V6-/V7-Prüfung ohne geänderte Eingaben/Code oder konkreten Integrationsgrund.

**Zugriff statt Datenkauf erforderlich:** verschlüsselte Tiingo-Caches, private Raw-Archive und dauerhafte R2-Bestände. Erst vorhandene Rechte/Erreichbarkeit prüfen; daraus keine globale Sperre für bereits geprüfte Backendfunktionen ableiten.

**Mit dem nachgewiesenen Bestand derzeit nicht erfüllbar:** vollständige historische US-Marktpopulation inklusive korrekter Delistings, vollständige ursprüngliche Fundamentaldaten-/Faktorvintages, garantierte historische Ausführbarkeit und echte unabhängige Bestätigung bereits exponierter Historie. Keine erfundenen Ersatzwerte oder pauschale Fünfjahreswartezeit.

**Normative Entscheidung offen:** Setup-Vertrag nennt 20 unabhängige Wochen, Erzeuger zählt Monate. Versionierte Entscheidungsvorlage erhalten; keine still leichtere Zählung. Aktive Setup-Reife-/OOS- und Strategie-/Ranking-Monats-/Forwardgates bleiben bestehen. Der archivierte Entwurf #872 ist nicht genehmigt und erzeugt keine neuen Pflichtschwellen.

Frontend, Quant-UI-Refresh, Navigation, Charts, Themes, Icons, Dock und andere Produktwelten bleiben außerhalb V8. Keine neue Preview, kein produktiver Scheduler, kein Kauf, keine Vertragsänderung und keine Produktaktivierung ohne eigenen Auftrag.
