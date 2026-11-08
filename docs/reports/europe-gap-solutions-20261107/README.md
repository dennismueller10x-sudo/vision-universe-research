# E9: Neue Wege für Europas Kurslücken – Forschungsbericht, 07.11.2026

**Stand mit Live-Stichprobe und Pilotlauf (Abschnitt „Live-Stichprobe und Pilot“).** Weiterhin **0 Sessions nachweislich zurückgewonnen**. Die Live-Stichprobe (40 von höchstens 64 Requests) fand aber eine konkrete Spur: `AC.XPAR` und `MC.XPAR` – zwei der 13 Paris-Titel, deren Originalsymbol mit HTTP 422 abgewiesen wird – liefern Zeilen für beide geprüften Lückentage mit exakt passendem Kontrollschluss; die Identität (ISIN/MIC/Währung) ist noch nicht belegt. Der lückenbewusste Pilot-Backtest Deutschland lief technisch durch (Ergebnisse nur versiegelt). Ein enger Forschungs-Backtest ist trotzdem prüfbar: Bei mindestens 98 % Jahresabdeckung ergeben sich **1.846 deutsche Titeljahre aus 149 Titeln** mit bestätigter Katalogidentität. Das ist eine Abdeckungsmessung, noch kein bestandener Strategie-Backtest.

Der wichtigste neue Kalenderbefund: **101 der 305 verdächtigen MIC-Tage mit 908 Sessions sind laut offiziellem Euronext-Kalender reguläre Handelstage.** Diese 908 Lücken bleiben bestehen. Für 204 MIC-Tage mit 2.630 Sessions fehlt noch die passende offizielle Jahresquelle. Kein Schließtag wurde neu bestätigt.

Alle Zahlen je Weg stehen in [solutions.json](solutions.json). `null` bedeutet unbekannt oder nicht gemessen. Null bestätigte Rückgewinne bedeutet bei blockierten Wegen ausdrücklich keinen negativen Live-Test.

## Auftrag, Grenzen und Arbeitsstand

Zuerst gelesen: `CLAUDE.md`, beide Berichte vom 03.11. samt `provider_comparison.json`, dann `AGENTS.md` und Neustart-Plan §9. Kein vorhandener E9-Branch oder E9-PR gefunden; weitergearbeitet vom im JSON gebundenen main-Commit. Die ursprüngliche Anweisung beschränkte das Ergebnis auf diesen Draft-PR; Strang J (07.11.2026) hat Live-Stichprobe und Pilot ergänzt und den PR zum Merge freigegeben (grüne CI genügt, CLAUDE.md).

Ausgangslage unverändert: 449 Titel, davon 319 XETR; 46.946 fehlende Sessions: 18.098 Identität, 13.119 Quarantäne, 11.983 Provider, 3.538 Kalenderverdacht, 208 möglicher Paris-Symbolwechsel.

**Blocker für die Live-Teile (beim ersten Stand; inzwischen über den bestehenden Workflow gelöst, siehe „Live-Stichprobe und Pilot“):** Im gestarteten Arbeitsbereich ist kein Marketstack-Secret eingebunden. Die Umgebung meldet keine Secret-Bindungen; auch lokal gibt es keine Marketstack-Variable. Die GitHub-Abfrage der Actions-Secret-Namen wurde mit HTTP 403 abgewiesen. Der Bericht benötigt weder den Schlüssel im Chat noch einen neuen Anbieterzugang. Die bestehende Secret-Bindung müsste in der Ausführungsumgebung verfügbar sein. Neue Workflows sind laut `AGENTS.md` verboten; es wurde keiner angelegt und kein bestehender Produktionslauf gestartet.

Verbrauch im ersten Stand: **0 Marketstack-Calls, 0 Credits**; danach Live-Stichprobe mit **40 Requests** (Budget 64). Zusätzlich ein kostenloser OpenFIGI-Aufruf mit zehn ISIN-Jobs, ein kostenloser Symbolkatalog-Download und öffentliche Dokumente. Keine Käufe, Anmeldungen, Verträge oder Kontaktaufnahme. Keine Kurswerte, Rohantworten oder PDFs in diesem PR. Keine produktiven Regeln oder Daten geändert.

Die alten Datumsrouten, drei alten `/eod`-Varianten, europäische Split-/Dividendenrouten, andere Anbieter-Demos und ausgeschlossene Datenquellen wurden nicht erneut getestet. Eine frühere Aussage im Anbieterbericht, HTTP 422 beweise das vollständige Fehlen eines Börsentags, ist zu stark: Der Supportbericht bezeichnet die Bedeutung dieses Fehlers korrekt als undokumentiert.

## Ergebnis je Weg

| Weg | Messung | Neue, sicher nutzbare Sessions | Empfehlung |
|---|---|---:|---|
| 1 Symbolformate | Katalog: 0 Treffer. Live (40 Requests): Xetra `.XETRA`/`.XETR` 12/12 HTTP 422; Paris `.XPAR` 4/10 mit Zeile am Lückentag und exaktem Kontrollschluss (AC, MC) | 0 bestätigt; 4 Spur-Sessions, Identität offen | `.XPAR` für die 13 Paris-422-Titel mit Identitätsbeleg prüfen |
| 2 Anderes Listing | Live: Basissymbol mit `exchange=XETR/XPAR` 10/16 HTTP 200, aber 0 Zeilen am Lückentag oder Kontrolltag | 0 | über diese Route nicht weiter verfolgen |
| 3 Intraday | vorhandener Abdeckungsvertrag: USA/IEX | 0 | keine weiteren Credits einsetzen |
| 4 Identität | 28 Titel, 18.098 Holds; zehn aktuelle FIGI-Zuordnungen; zwei offizielle Dokumente genauer gelesen | 0 regelkonform belegbar | zwölf größte Holds zuerst: 16.457 Sessions Potenzial |
| 5 Kalender | 101 MIC-Tage / 908 Sessions offiziell offen; 204 / 2.630 offen in der Recherche | 0 entfernt, 0 neue Kurse | restliche Jahresquellen beschaffen |
| 6 Lückenbewusster Backtest | Pilot gelaufen: 149 Titel, Turtle 6.414 abgeschlossene Trades / 153 zensierte Episoden; Momentum 3.041 Episoden / 82 zensiert | 0 neue Kurse | Ergebnis versiegelt beim Owner; Forschung, nicht zertifiziert |
| 7 Weitere Wege | offizielle Kapitalmaßnahmen und Börsenmeldungen | noch unbekannt | nur nach Datum und Sicherheitsprüfung zählen |

Potenziale der Wege sind **nicht addierbar**. 12.191 bei Weg 1 ist nur die Summe aus 11.983 Provider- und 208 Symbolverdachts-Sessions. Das ist keine Prognose. Weg 2 überschneidet sich damit; Quarantänen werden nicht automatisch freigegeben. Kalenderkorrekturen würden nur den Nenner ändern, keine Kurse liefern.

## 1. Symbolformate: der kostenlose Katalog hilft hier nicht

Quelle: [Marketstack supported_tickers_2.csv](https://marketstack.com/download/supported_tickers_2.csv), geladen am 07.11.2026. Download-Hash und Ergebnisse je MIC stehen im JSON. Der Katalog hat die Spalten `ticker, exchange, assetType, priceCurrency, startDate, endDate`; keine ISIN. Auf keinem der zehn MICs gibt es eine exakt so bezeichnete Börsenzeile. Auch die Originalsymbole fehlen vollständig. Das widerlegt die EU-API-Abdeckung nicht: Die alten authentifizierten Kontrollabfragen hatten EU-Daten. Der öffentliche CSV-Katalog ist für unsere Symbole schlicht kein zuverlässiges Verzeichnis.

Gemessen wurden exakte Zeichenketten: Originalticker; Teil vor dem letzten Punkt plus MIC, etwa `.XPAR` oder `.XETR`; für XETR zusätzlich `.XETRA`. Keine eigene Security-ID gebildet. Bestehende Kennungen übernommen und alle 449 über `core/identity.js#securityIdForTicker(canonicalTicker)` abgeglichen.

Noch auszuführen: neue Varianten von SAP, SIE und DGR sowie Paris-Titeln auf deren im Ledger fehlenden Tagen, beispielsweise 17.09.2026 und 13.06.2023. Pro neuer Variante einen bestätigten Überlappungstag verwenden. Kein Wiederholen des alten unveränderten Symbols als schon bekannter Kontrolltest. Treffer zählen nur bei richtigem Datum, nachgewiesener ISIN, richtigem MIC, Währung und unveränderten Qualitätsregeln. Erfolgreiche Stichproben anschließend gegen die konkrete fehlende Datumsmenge schneiden; keine Hochrechnung auf 449 Titel.

Für einen ersten kombinierten Test der Wege 1/2 höchstens **64 einzelne Calls und 64 reservierte Credits**, ohne automatische Wiederholungen oder blinde Pagination. Jeder Request nur ein Symbol. Vor jedem Request Budget reservieren, tatsächlichen Usage-Header erfassen, bei Budget- oder Schemaabweichung stoppen. Das 2.000-Call-Limit bleibt zusätzlich hart. Das ist ein Plan, kein durchgeführter Test.

## 2. Gleiche ISIN an einer anderen Börse

XFRA, Tradegate und andere Listings sind nur Kandidaten. Das öffentliche CSV enthält keine ISIN; gleiche Namen oder Ticker reichen nicht. Marketstack-Listing und historisches Gültigkeitsintervall sind noch nicht gemessen. Es gibt **0 geprüfte Überlappungstage**, deshalb auch keine erfundene Trefferquote.

Prüfregel für eine spätere, getrennte Forschungsreihe: gleiche ISIN/Aktiengattung, passende historische Zuordnung, EUR und gleiche Kurseinheit; beide Tage tatsächlich gehandelt. Relative Abweichung `abs(alternativ / xetra - 1)` berichten. Vorab 0,5 % als Forschungs-Toleranz, daneben 0,1 % und 1 % als Sensitivität. Mindestens 20 gemeinsame Tage, darunter Tage vor und nach der Lücke; Median, 95-%-Quantil und Maximalwert nur als abgeleitete Statistik berichten. Ein einzelner passender Tag beweist keine Gleichwertigkeit.

Ein Frankfurter oder Tradegate-Tagesende kann nach dem Xetra-Schluss liegen. Preisnähe beweist daher keinen Xetra-Schluss. OHLCV verschiedener Börsen nicht vermischen. Bei Nutzung das Instrument samt Ausführungsplatz im gesamten Forschungsabschnitt konsistent halten; keine nachträgliche Auswahl des günstigsten Kurses. Unter strikter Xetra-Preisdefinition zählen alternative Börsenschlüsse weiterhin als **0 wiedergewonnene Xetra-Kurse**.

## 3. Intraday

Dieser Weg ist entgegen der Aufgabenvermutung bereits dokumentarisch geprüft: `providers/marketstack/endpoint-coverage.json` und Bericht vom 03.11. nennen IEX/USA. Darum kein neuer Live-Aufruf. US-Handel einer deutschen ISIN würde außerdem weder Xetra-MIC noch Währung, Schlussauktion oder Tagesvolumen nachweisen. Verdichtung wäre erst bei vollständiger Sitzung samt Auktion, belegter Zeitzone und passender Lizenz sinnvoll. Hier kein nutzbarer EU-Rückgewinn.

## 4. Offizielle Identität: belegte Hinweise, noch keine Freigabe

Die 18.098 Holds gehören zu **28 Titeln**. Im JSON stehen deren exakte Sessionzahlen, nach Größe sortiert. Die zwölf größten umfassen **16.457 Sessions**, rund 91 %. Erste Kandidaten: DGR 2.250, KA8 2.058, RCMN 1.799, IUR 1.778, MSAG 1.727.

Neue offizielle Belege:

- [DGR-Unternehmensseite](https://www.dga-ag.de/unternehmen/wir-ueber-uns.html): dieselbe ISIN DE0005533400, Börsennotierung seit 1999, Segmentwechsel 2012/2017/2023 und fortbestehendes Xetra-Sponsoring. Das spricht gegen eine pauschale Deutung eines jüngeren Stammdatenbeginns als Unternehmens-IPO. Es beweist aber nicht für jeden gehaltenen Tag das vollständige historische Xetra-Listing mit allen Pflichtfeldern. **2.250 Sessions Prüfpotenzial; 0 freigabefähig nachgewiesen.**
- [KAP-Geschäftsbericht 2016](https://www.kap.de/fileadmin/user_upload/kap.de/Dateien/Pdf/Finanzberichte/2016/KAP_GB2016_DE.pdf), Abschnitt „Stammdaten der KAP-Aktie“: ISIN DE0006208408 und Kürzel IUR schon 2016; die Kursangaben beziehen sich auf Frankfurt. Kein vollständiger Xetra-Intervallbeleg. **1.778 Sessions Prüfpotenzial; 0 freigabefähig nachgewiesen.**
- [OpenFIGI-Dokumentation](https://www.openfigi.com/api/documentation): öffentlicher Zugang ohne Konto möglich. Ein neuer Mapping-Aufruf für die ersten zehn Hold-Titel in Ledger-Reihenfolge mit `ID_ISIN` und `micCode=XETR` lieferte zehn Treffer. Die Antwort enthält keine historischen Gültigkeitsintervalle. **0 belegbar freigegebene Sessions.** Kein zusätzlicher FIGI-Account angelegt.

Die bestehende Prüfung in `scripts/marketstack/europe-live-quarantine-review.mjs#historicalIdentityReady` verlangt einen unabhängigen, hashgeprüften offiziellen Beleg mit Emittenten-LEI, ISIN, Aktiengattung, Listing, Providersymbol, MIC, Währung und passendem Zeitraum. Auch ein bestandener Identitätsbeleg ersetzt die OHLCV-Prüfung nicht. Die versiegelten Rohdaten waren hier nicht verfügbar.

Weitere kostenlose Belegquellen: Deutsche-Börse-Listingmeldungen und historische Emittentenberichte; Bundesanzeiger/Unternehmensregister für Umfirmierungen, Kapitalmaßnahmen und Rechtsnachfolge. Registerunterlagen belegen die Gesellschaft, nicht automatisch den Xetra-Handel. Keine gebührenpflichtigen Registerauszüge abrufen. [ESMA/FIRDS](https://www.esma.europa.eu/data-reporting/mifir-reporting) ist für ISIN, LEI und MIC interessant, aber noch **kein ISIN-Datensatz live abgeglichen**. Ein dortiges Ersthandelsdatum kann fehlen oder einen Standardwert enthalten; [ESMA Q&A 1678](https://www.esma.europa.eu/publications-data/questions-answers/1678) beschreibt diesen Fall. Vor-2018-Zeiträume nicht allein damit bestätigen. Es bleibt eine Aufgabe, je Hold die vollständige Belegkette zu bauen; keine 18.098 pauschal freigeben.

## 5. Offizielle Kalender: weniger Verdacht, keine neuen Kurse

[Offizieller Euronext-Kalender](https://www.euronext.com/en/trading/trading-hours-holidays), Jahresabschnitte 2023–2026: Wochentage sind offen außer den dort genannten Börsenschließtagen. Halbe Handelstage bleiben Sessions; „No TAH“ in Mailand betrifft den Abendhandel, nicht den regulären Handel. Abgleich nur für XAMS, XBRU, XPAR, XMIL in diesen vier Jahren.

Ergebnis: **101 MIC-Tage / 908 Sessions offen**, **0 geschlossen**, **204 / 2.630 noch nicht offiziell abgeglichen**. Alle 305 Einträge samt Sessiongewicht und Prüfstatus stehen im JSON. Die 908 werden nur im Forschungsbericht aus dem Kalenderverdacht herausgenommen. Produktionskalender und ursprüngliche Ledger-Dateien bleiben unverändert. Auch ein offizieller planmäßiger Handelstag schließt eine einzelne außerplanmäßige Unterbrechung nicht aus.

Die anderen angeforderten Börsen wurden ebenfalls auf kostenlose Quellen geprüft:

- Deutsche Börse: kein XETR-Tag gehört zu diesen 305 Verdachtsfällen. Die alte Kalender-URL leitet inzwischen auf eine Startseite um; das ist kein neuer Kalenderbeleg. Bereits bestätigte Xetra-Tage von 2011–2013 nicht erneut untersucht.
- SIX: [Kalender 2026](https://www.six-group.com/dam/download/the-swiss-stock-exchange/trading/trading-provisions/regulation/trading-guides/trading-calendar-2026.pdf) erreichbar. Die hier offenen XSWX-Fälle betreffen überwiegend 2025. Der analoge PDF-Pfad 2025 liefert 404; ein weiterer älterer Fundpfad ebenfalls 404. Kein Jahr übertragen.
- Wien: [PDF-Pfad 2025](https://www.wienerborse.at/uploads/u/cms/files/trading/stock-exchange-holidays-2025-en.pdf) leitet auf den [aktuellen Kalender](https://www.wienerborse.at/en/trading/trading-information/trading-calendar/) um. Damit fehlt der historische 2025-Beleg. Tages- und Settlement-Kalender unterscheiden.

Nasdaq Nordic und BME gehören zu den übrigen offenen Fällen. Eine vollständige Entscheidung zu allen 305 Tagen liegt daher noch nicht vor. Die maximale noch offene Kalenderentlastung sinkt von 3.538 auf **2.630 Sessions**; sie kann am Ende auch null sein.

## 6. Ein ehrlicher Forschungs-Backtest trotz Lücken

**Lücke bedeutet: Ausführung nicht belegt.** Daraus folgt keine reale Börsenschließung. Auf solchen Tagen keine neue Orderausführung und keine Interpolation buchen. Bestehende Positionen brauchen besondere Behandlung: Ein ausgelöster Stopp, ein Kapitalereignis oder der wahre Tagesverlust kann unbekannt sein. Weder zum letzten Kurs glattstellen noch null Tagesrendite behaupten. Position und Ergebnisabschnitt als zensiert markieren; Kosten und Ergebnis bis zur letzten gesicherten Beobachtung getrennt führen. Eine Liquidation direkt vor einer erst später sichtbaren Lücke wäre Look-ahead.

Nach einer Lücke Indikatoren mit zusammenhängenden Sessions neu aufbauen. Für einen konservativen Pilot sind 200 unmittelbar vorhergehende belegte Sessions vorgesehen; Signal und Ausführung brauchen ebenfalls echte Kurse. Keine Auswahl anhand künftiger Jahresabdeckung im handelbaren Universum: Die folgende Jahresauswertung dient nur der Forschungsplanung. Im tatsächlichen Lauf Zulassung aus bis dahin bekannten Daten bestimmen; Ausfälle nach Eintritt offen als zensiert zählen. Die spätere Jahresqualität darf keine schlechten Trades rückwirkend entfernen.

**Messung:** Öffentlicher Continuity-Ledger vom 12.10.2026, bis 09.10.2026, mit geprüftem Kalender. Für volle Kalenderjahre **2011–2025**: ganze Jahresspanne im Anzeigefenster, mindestens 200 vorhandene Sessions, keine überlappenden Identity-Intervalle; Abdeckung = vorhandene / erwartete Sessions. Vorhandene Daten werden aus Kalender minus allen Ledger-Lückentagen rekonstruiert. Gegenprobe: für **449/449** Titel exakt dieselbe Beobachtungszahl wie `displayedBarCount`. Kein Lesen oder Exportieren von Kurswerten nötig. 2010 und das unvollständige Jahr 2026 bleiben außerhalb dieser Jahreszählung.

Die engere Tabelle lässt zusätzlich `catalogIdentity != VERIFIED` aus dem **03.11.-Bericht** weg. Das ist nur ein heutiger Sicherheitsfilter, keine historische Point-in-Time-Identität. Der ursprüngliche 46.946er-Bericht hat einen späteren Stichtag als diese Jahresmessung; die Stände werden nicht vermischt.

| Mindestabdeckung | EU-Titeljahre, alle / bestätigte Identität | DE-Titeljahre, alle / bestätigte Identität | DE-Titel, bestätigte Identität |
|---|---:|---:|---:|
| 90 % | 5.435 / 3.374 | 3.740 / 1.994 | 151 |
| 95 % | 5.174 / 3.236 | 3.480 / 1.857 | 151 |
| **98 %** | **5.024 / 3.140** | **3.450 / 1.846** | **149** |
| 99 % | 4.978 / 3.122 | 3.429 / 1.841 | 149 |
| 100 % | 3.616 / 2.327 | 2.377 / 1.301 | 146 |

98 % ist ein vorab gesetzter Forschungsvorschlag, keine Änderung eines Produkt-Gates. Es gibt vollständige **einzelne Jahre**, obwohl jede MAX-Reihe mindestens eine Lücke hat.

| Jahr | EU-Titel bei 98 %, bestätigte Identität | davon DE |
|---|---:|---:|
| 2011 | 205 | 114 |
| 2012 | 209 | 117 |
| 2013 | 211 | 119 |
| 2014 | 215 | 123 |
| 2015 | 222 | 125 |
| 2016 | 225 | 127 |
| 2017 | 229 | 129 |
| 2018 | 233 | 133 |
| 2019 | 238 | 137 |
| 2020 | 240 | 139 |
| 2021 | 242 | 141 |
| 2022 | 247 | 144 |
| 2023 | 18 | 0 |
| 2024 | 255 | 149 |
| 2025 | 151 | 149 |

Das JSON enthält auch die Zahl von Signaltagen mit 200 unmittelbar vorhergehenden vollständigen Sessions. Diese Datenverfügbarkeit beweist weder einen Signaleintritt noch einen ausführbaren Trade. Quarantäneregeln bleiben wirksam; ungeklärte Adjustierung, Kapitalmaßnahmen, fehlende historische Universen und Delistings sind zusätzliche Prüfschritte. Der heutige 449er-Bestand enthält Survivorship-Auswahl. Deshalb **0 neu zertifizierte oder strategisch freigegebene Titeljahre**, keine Renditezahl und keine Aussage über einen Vorteil gegenüber einer Benchmark. Empfehlung: zuerst ein enges Pilotfenster mit vollständigen Positionsepisoden; anschließend fehlende-/zensierte Trades und Auswahlverzerrung separat messen.

## 7. Weitere Wege und Priorität

1. **Offizielle Kapitalmaßnahmen statt neuer Kursanbieter:** Für die 47 ungeklärten Brüche Emittentenmeldungen mit Datum, Verhältnis und ISIN-Kette suchen. Das ist ein möglicher Weg zu den 13.119 Quarantäne-Sessions, aber kein gemessener Rückgewinn. Ungeprüfte Adjustierungsfelder oder bloße Close-Werte nicht übernehmen. Die schon getesteten Marketstack-Actionrouten bleiben ausgeschlossen.
2. **Historische Börsenmeldungen gezielt archivieren:** zunächst DGR und IUR; danach die zwölf größten Holds. Ein heutiges Ersthandelsdatum kann ein Listing-/Segmentdatum sein; erst ein offizieller Intervallbeleg entscheidet. Kein künstlicher Provider-/Identitätswechsel im Code.
3. **Getrennte Forschungsfenster:** Eine einjährige volle Reihe kann bereits untersucht werden, auch wenn MAX lückenhaft ist. Das liefert den unmittelbar nutzbaren Forschungsfortschritt, ohne eine Session zu erfinden. Keine erfolgsabhängige Auswahl der Jahre.

**Owner-Entscheidung, nicht ausgeführt:** kostenpflichtige historische Daten oder Lizenzverträge; Anfragen an andere Anbieter; SIX-Bestätigungsschreiben/Feed-Vertrag. Die alte Anbieterempfehlung, Twelve Data oder EODHD anzuschreiben, ist durch Plan §9 überholt. Öffentliche Börsen-Webkurse werden ohne passende Nutzungsrechte nicht automatisiert als Ersatzdatenbank gesammelt.

## Live-Stichprobe und Pilot (Strang J, 07.11.2026)

### Wege 1/2: Marketstack-Live-Stichprobe

Ausgeführt über den **bestehenden** Workflow `europe-discover-refresh.yml` (neuer Eingabemodus `e9-symbol-probe`, eigener Job, läuft nie auf `main`, ändert keine Daten) mit dem vorhandenen Secret: [Lauf 42388695522](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/42388695522). Code: `scripts/marketstack/europe-marketstack-diagnostics-once.mjs#runE9SymbolProbe` (fester Plan, harte Grenze 64 Requests im Code, ein Symbol je Request, keine Wiederholung, keine Pagination). Rohantworten nur im Runner-Temp, danach gelöscht. Zählungen: [marketstack_symbol_probe.json](marketstack_symbol_probe.json).

Plan: SAP, SIE, DGR (Xetra) und OR, BNP, TTE, AC, MC (Paris) auf den Lückentagen 13.06.2023 und 17.09.2026; je Request das Fenster vom letzten gespeicherten Kontrolltag (höchstens 7 Tage vorher) bis zum Lückentag. Varianten: Xetra `{X}.XETRA`, `{X}.XETR`, `{X}` mit `exchange=XETR`; Paris `{X}.XPAR`, `{X}` mit `exchange=XPAR`. Das alte unveränderte Symbol wurde nicht wiederholt.

| Variante | Requests | HTTP 200 | Zeile am Lückentag | Kontrollschluss exakt | bestätigt zurückgewonnen |
|---|---:|---:|---:|---:|---:|
| XETR `{X}.XETRA` | 6 | 0 | 0 | 0 | 0 |
| XETR `{X}.XETR` | 6 | 0 | 0 | 0 | 0 |
| XETR `{X}` + `exchange=XETR` | 6 | 2 | 0 | 0 | 0 |
| XPAR `{X}.XPAR` | 10 | 4 | 4 | 4 | 0 |
| XPAR `{X}` + `exchange=XPAR` | 10 | 8 | 0 | 0 | 0 |
| Metadaten `/tickers/{X}.XPAR` | 2 | 2 | – | – | – |
| **Summe** | **40** | **16** | **4** | **4** | **0** |

Verbrauch: **40 Requests**; der Kontingent-Header `x-quota-remaining` fiel von 97.240 (erste Antwort) auf 97.201 (letzte Antwort), also **39 Credits zwischen erster und letzter Antwort** – vereinbar mit einem Credit je Request (40 insgesamt). Budget 64 nicht ausgeschöpft, keine Wiederholung.

Ergebnis: **16 Lücken-Sessions geprüft, 0 bestätigt zurückgewonnen.** Die vier Zeilen betreffen `AC.XPAR` und `MC.XPAR` an beiden Tagen: richtiges Datum, exakt gleicher Kontrollschluss am Vortag, plausibles OHLC, keine Split-/Dividendenfelder. Sie zählen trotzdem nicht, weil die Metadatenantwort (HTTP 200) keine lesbare Tickerzeile enthielt und damit ISIN, MIC und Währung unbelegt sind. Im Laufartefakt steht dafür noch `ROW_BUT_ISIN_MISMATCH`; das war eine zu starke Einstufung (kein nachgewiesener Widerspruch). Der Code stuft diesen Fall seither als `ROW_BUT_METADATA_EMPTY_ISIN_UNPROVEN` ein; nicht erneut abgefragt. Für OR, BNP, TTE ist `.XPAR` 422. Xetra: alle Suffixformate 422, das Basissymbol mit Börsenparameter liefert keine Zeilen.

Nächster Schritt (Empfehlung, keine Produktionsänderung): `.XPAR` für die 13 Paris-Titel mit 422 als möglichen Symbolwechsel behandeln und die Identität über einen unabhängigen Beleg (ISIN-Kette, Euronext) nachweisen; erst dann Überlappung über ≥ 20 Tage und Freigabe nach den bestehenden Regeln.

### Weg 6: Lückenbewusster Pilot-Backtest Deutschland

Vorab-Protokoll [docs/research/europe-gap-aware/PROTOKOLL.md](../../research/europe-gap-aware/PROTOKOLL.md), SHA-256 `f4651e39…dc2e04`, eingefroren in Commit `687cd949f` vor dem Lauf; das Skript `scripts/research/europe-gap-aware/pilot.mjs` verweigert den Lauf bei anderem Hash. Regeln wie in §6: keine Interpolation, Lücke = keine Ausführung, offene Positionen an einer Lücke zensiert, Zulassung je Tag nur aus bis dahin bekannten Daten (200 zusammenhängende Vorsessions, ≥ 98 % der letzten 252), Indikatoren je zusammenhängendem Abschnitt neu. Strategien unverändert: Supertrader Donchian/Turtle 1.1.0 über den bestehenden Simulator und Quant-12-1-Momentum (oberes Quintil, monatlich) nach der Definition in `quant/engines/factors.js`. Nur Schlusskurse liegen vor; Eröffnung/Hoch/Tief werden gleich dem Schluss gesetzt, Volumen-/Spannen-Liquiditätsfilter sind nicht auswertbar – beides im Protokoll festgelegt. Benchmark: kein DAX-Index oder -ETF in den vorhandenen Daten, daher gleichgewichtetes Universum mit derselben Episodenlogik.

| Zählung (öffentlich) | Wert |
|---|---:|
| Kandidatentitel (XETR, Identität bestätigt, ≥ 98 %) | 149 |
| davon Beobachtungszahl = Inventar | 149 |
| Turtle: Abschnitte gerechnet | 647 |
| Turtle: abgeschlossene Trades | 6.414 |
| Turtle: davon im Standard-Portfolio genommen | 1.312 |
| Turtle: zensierte Episoden (Lücke / Studienende) | 153 (117 / 36) |
| Turtle: an Lücke nicht ausgeführte Einstiege | 10 |
| Momentum: Monatstermine / mit abgeschlossenen Episoden | 179 / 114 |
| Momentum: Episoden abgeschlossen / zensiert | 3.041 / 82 |
| Benchmark gleichgewichtet: Episoden abgeschlossen / zensiert / nicht ausgeführt | 14.951 / 413 / 1 |

Der Pilot lief technisch durch. Rendite, Kennzahlen und Benchmarkvergleich stehen nur versiegelt in [runs/pilot.sealed.json](../../research/europe-gap-aware/runs/pilot.sealed.json) (öffentlicher Schlüssel `scripts/supertrader/validation/results-public-key.pem`); [runs/pilot-public.json](../../research/europe-gap-aware/runs/pilot-public.json) enthält nur Zählungen und Hashes. **Forschung, nicht zertifiziert.** Bekannte Verzerrungen: Kandidatenkreis aus heutigem Bestand (Survivorship) und heutiger Identität, unbereinigte Rohkurse, zensierte Episoden fehlen in der Portfolio- und Periodenrechnung. 65 Monatstermine haben keine abgeschlossene Momentum-Episode: an 62 davon erfüllte kein Titel die Regel von 253 zusammenhängend beobachteten Sessions (2011: 3, 2012: 11, 2013: 12, 2014: 10, 2023: 8, 2024: 12, 2025: 6), weil marktweite Xetra-Lückentage die Kette regelmäßig unterbrechen; an 3 Terminen endeten alle Episoden zensiert. Das ist der wichtigste methodische Befund des Piloten: Strenge Zusammenhangsregeln und marktweite Providerlücken schließen ganze Jahre aus, ohne dass ein Kurs falsch ist.

## Nachvollziehbarkeit und Prüfung

`solutions.json` bindet Repo-Commit, Eingaben und öffentliche Abrufe per SHA-256. Quellenantworten, PDFs, Messskripte und Testlogs liegen nur im ignorierten `.market-cache/e9/`. Die Skripte verlangen `--out` und verweigern Ziele außerhalb dieses ignorierten Ordners. Im PR stehen ausschließlich dieser Bericht und Zählungs-JSON. Keine Produktions-Neuerzeugung.

Prüfungen: JSON-Summen und Rohpreis-Feldverbot bestanden; Core-Identitätsabgleich 449/449; bestehende Identitäts- und Impact-Berichtstests **10/10 bestanden** unter Node 24.22.1. Der anfängliche vollständige Core-Aufruf im Sparse-Checkout hatte 108 bestandene und 58 fehlgeschlagene Tests; referenzierte Produktpfade fehlten. Nach Nachladen der für die gezielten Tests nötigen Pfade waren diese grün. Eine vollständig grüne Gesamtsuite unter dem Repo-Ziel Node 22 wird damit nicht behauptet. Keine Produktcodeänderung, keine neuen Tests für den reinen Bericht. `git diff --check` sauber.

Rechenweg: pro Titel Kalenderdaten im Anzeigefenster minus Vereinigung `allGaps[].missingDates`; Gleichheit mit `displayedBarCount` prüfen. Pro vollem Jahr die oben beschriebenen Filter anwenden, IDs für die eindeutigen Titel zählen. Die Jahreszulassung zählt auch dann nur einmal, wenn derselbe Titel mehrere Jahre besteht. Kalenderverdachtsliste aus den mit `*` markierten MIC-Daten des bestehenden Impact-Berichts; die drei bereits offiziell offenen XETR-Tage ausnehmen. Gegenprobe: genau 305 MIC-Tage und 3.538 Sessions, anschließend offizieller Jahresabgleich. Die folgenden ausgeblendeten Befehle reproduzieren die Offline-Messung; sie rufen keine Kurs-API auf.

<details><summary>Reproduktion der Messung (Python-Standardbibliothek)</summary>

Im unveränderten angegebenen Repo-Commit den heruntergeladenen Symbolkatalog und die Euronext-Seite nach `.market-cache/e9/` legen. Das folgende Skript als `.market-cache/e9/measure.py` speichern und mit `python3 .market-cache/e9/measure.py --out .market-cache/e9/results` starten. Die Quellen sind dynamisch; bei anderem Download-Hash einen neuen Messstand benennen.

```python
import argparse,json,csv,hashlib,datetime,collections
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--out',required=True);a=p.parse_args();out=Path(a.out).resolve();root=Path.cwd();assert out.is_relative_to(root/'.market-cache');out.mkdir(parents=True,exist_ok=True)
def read(f):return json.loads(Path(f).read_text())
def dates(a,b):
 a=datetime.date.fromisoformat(a);b=datetime.date.fromisoformat(b);return [(a+datetime.timedelta(days=i)).isoformat() for i in range((b-a).days+1)]
base='docs/reports/europe-continuity-449-20261012/'
inv=read(base+'europe_449_gap_inventory.json');cal=read(base+'europe_449_calendar_audit.json')['calendars'];impact=read('docs/reports/europe-marketstack-support-report-20261103/europe_gap_impact_report.json');catalog=read('discover/data/europe/catalog.json');status={x['securityId']:x['catalogIdentity'] for x in impact['rows']}
closed={m:{x['date'] for x in c['closures']} for m,c in cal.items()};reconstructed={};hold=[]
for r in inv['rows']:
 expected=set(dates(r['displayedStart'],r['displayedEnd']))-closed[r['mic']];missing={d for g in r['allGaps'] for d in g['missingDates']};observed=expected-missing;assert len(observed)==r['displayedBarCount'];reconstructed[r['securityId']]=observed
 n=0
 for b in r['priceOrIdentityBreaks']:
  if b['classification']=='IDENTITY_QUARANTINE_INTERVAL':
   g=next(g for g in r['allGaps'] if g['from']==b['from'] and g['to']==b['to']);n+=sum(x['classification'].startswith('QUARANTINED') for x in g['causes'])
 if n:hold.append({'symbol':r['ticker'],'sessions':n,'company':r['company']})
assert sum(x['sessions'] for x in hold)==18098
annual=[];unique=collections.defaultdict(set)
for year in range(2011,2026):
 for threshold in [0.9,0.95,0.98,0.99,1.0]:
  counts=collections.Counter(); warm=collections.Counter()
  for r in inv['rows']:
   days=[d for d in dates(f'{year}-01-01',f'{year}-12-31') if d not in closed[r['mic']]]
   if not (r['displayedStart']<=days[0] and r['displayedEnd']>=days[-1]):continue
   obs=reconstructed[r['securityId']];available=sum(d in obs for d in days);ratio=available/len(days)
   breaks=any(b['from']<=days[-1] and b['to']>=days[0] for b in r['priceOrIdentityBreaks'])
   if available<200 or ratio<threshold or breaks:continue
   groups=['europe']+(['germany'] if r['mic']=='XETR' else [])
   if status[r['securityId']]=='VERIFIED':groups+=['europe_identity_verified']+(['germany_identity_verified'] if r['mic']=='XETR' else [])
   streak=0;signal=0
   # no lookahead: preceding 200 sessions must exist; signal day must also exist
   all_days=[d for d in dates(r['displayedStart'],days[-1]) if d not in closed[r['mic']]]
   for d in all_days:
    if d in obs:
     if streak>=200 and d>=days[0]:signal+=1
     streak+=1
    else:streak=0
   for group in groups:counts[group]+=1;warm[group]+=signal;unique[(threshold,group)].add(r['securityId'])
  annual.append({'year':year,'minimum_coverage':threshold,'security_years':dict(counts),'signal_dates_with_200_preceding_consecutive_sessions':dict(warm)})
rows=list(csv.DictReader(open('.market-cache/e9/supported_tickers_2.csv')));tickers={x['ticker'] for x in rows};by=collections.Counter(x['exchange'] for x in rows);symbols=[]
for mic in sorted(cal):
 rr=[r for r in inv['rows'] if r['mic']==mic]; stem=lambda s:s.rsplit('.',1)[0]
 forms={ 'original':lambda s:s,'mic_suffix':lambda s:stem(s)+'.'+mic}
 if mic=='XETR':forms['xetra_suffix']=lambda s:stem(s)+'.XETRA'
 symbols.append({'mic':mic,'securities':len(rr),'catalogue_exchange_rows_exact_mic':by[mic], 'symbol_form_matches':{k:sum(fn(r['ticker']) in tickers for r in rr) for k,fn in forms.items()}})
# Only starred MIC dates are the 305 calendar candidates, excluding the three known official XETR open dates.
cs=[]
for mic,dd in impact['q4']['clusters']['marketWideDatesByMic'].items():
 for tagged in dd:
  if not tagged.endswith('*'):continue
  d=tagged[:-1]
  if mic=='XETR' and d in ['2011-10-03','2012-10-03','2013-10-03']:continue
  n=sum(any(c['date']==d and c['classification']=='PROVIDER_MISSING_DAY' for g in r['allGaps'] for c in g['causes']) for r in inv['rows'] if r['mic']==mic)
  cs.append({'mic':mic,'date':d,'sessions':n})
print('calendar',len(cs),sum(x['sessions'] for x in cs))
# Official Euronext 2024/25 calendar is open weekdays except listed closures; half days count as sessions.
for c in cs:
 c['official_check']='UNRESOLVED'
 if c['mic'] in ['XAMS','XBRU','XPAR','XMIL'] and c['date'][:4] in ['2023','2024','2025','2026']:
  y=c['date'][:4];hol={'2023':['04-07','04-10','05-01','12-25','12-26'],'2026':['01-01','04-03','04-06','05-01','12-25'],'2024':['01-01','03-29','04-01','05-01','12-25','12-26'],'2025':['01-01','04-18','04-21','05-01','12-25','12-26']}[y]
  if c['mic']=='XMIL':hol=hol+['08-15','12-24','12-31']
  c['official_check']='CLOSED' if c['date'][5:] in hol else 'OPEN'
result={'input_scope':{'snapshot':'2026-10-12 inventory, through 2026-10-09; not the 2026-11-03 impact snapshot','reconstructed_count_matches':449},'symbol_catalogue':{'rows':len(rows),'sha256':hashlib.sha256(Path('.market-cache/e9/supported_tickers_2.csv').read_bytes()).hexdigest(),'by_mic':symbols},'identity_hold_priorities':sorted(hold,key=lambda x:-x['sessions']),'calendar':{'candidates':cs,'totals':{k:{'mic_dates':sum(x['official_check']==k for x in cs),'sessions':sum(x['sessions'] for x in cs if x['official_check']==k)} for k in ['OPEN','CLOSED','UNRESOLVED']}},'backtest_coverage':{'annual':annual,'totals':[{'minimum_coverage':t,'security_years':{g:sum(x['security_years'].get(g,0) for x in annual if x['minimum_coverage']==t) for g in ['europe','germany','europe_identity_verified','germany_identity_verified']},'unique_securities':{g:len(unique[t,g]) for g in ['europe','germany','europe_identity_verified','germany_identity_verified']}} for t in [.9,.95,.98,.99,1.0]]}}
sources=[base+'europe_449_gap_inventory.json',base+'europe_449_calendar_audit.json','docs/reports/europe-marketstack-support-report-20261103/europe_gap_impact_report.json','docs/reports/europe-historical-provider-review-20261103/provider_comparison.json','discover/data/europe/catalog.json','.market-cache/e9/measure.py','.market-cache/e9/euronext.html']
result['sources']=[{'path':f,'sha256':hashlib.sha256(Path(f).read_bytes()).hexdigest()} for f in sources];(out/'measurements.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps(result['backtest_coverage']['totals']));print(result['calendar']['totals']);print(symbols)
```

</details>
