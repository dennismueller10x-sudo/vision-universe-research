# Wortwahl- und Anbieternamen-Scan · 09.11.2026

Basis: `main`, Commit `8ae76660b298c36b39a768d09918d8461105603d`. Regeln zuerst gelesen: CLAUDE.md, docs/legal/WORTWAHL.md, docs/legal/EINORDNUNG.md; zusätzlich AGENTS.md und der aktuelle Neustartplan.

## Umfang und Verfahren

Statischer Volltext-Kandidatenscan über **5.460 HTML-/JS-Dateien** in allen vorhandenen Produkt- und Seitenordnern einschließlich assets/, willkommen/, infos/, Legacy-Seiten und statischer Einzelaktien-/ETF-Seiten; zusätzlich oberste HTML-Seiten. Ausgeschlossen: docs/, jeder data/-Unterordner, tests/ und .github/. Keine Datendateien wurden durchsucht. Gesucht wurden sämtliche Begriffe der Wortwahltabelle, Wortstämme/Flexionen (einschließlich Signal, Handelsmarken, Versprechen, Wertungen und persönlicher Ansprache) sowie TraderFox, Tiingo, SEC, Marketstack, Finnhub, Anthropic und Claude (Groß-/Kleinschreibung ignoriert).

HTML-Kommentare, JS-Kommentare, CSS-Klassen, URLs, technische Schlüssel und Variablen sind keine sichtbaren Befunde. Auch Titel, Tooltips, Metabeschreibungen und Anzeige-Literale in JS wurden geprüft. 1.771 Kandidatenzeilen im Rohscan, 936 nach Entfernung von Blockkommentaren und offensichtlichen technischen Signal-Treffern; dies sind keine Verstoßzahlen. Sichtbarkeit und Zulässigkeit wurden anschließend nach Kontext bewertet. Dies ist eine Quelltextprüfung, kein browsergestützter Scan aller datenabhängigen Zustände.

Die Tabellen nennen **Zeilen der Ausgangsfassung** (durch die Textkorrekturen bleiben sie erhalten). „Korrigiert“ bedeutet reine Textänderung. Formulierungen mit Zonen, Einstiegen, Stopps und Zielen **laut benannter Methode** sind wegen der späteren Owner-Entscheidung vom 06.11. in EINORDNUNG.md §0 nicht pauschal verboten; daran werden keine Modelle oder Funktionen geändert. Die verbleibende rechtliche Bewertung ist dort dokumentiert.

## Eindeutige Fälle – im PR korrigiert

| Datei:Zeile | Fund | Vorschlag |
|---|---|---|
| `analysten/index.html:10` | über Finnhub und FMP | Korrigiert: aus externen Quellen |
| `analysten/index.html:201` | kein Live-Finnhub-Abruf im Browser | Korrigiert: kein Live-Abruf im Browser |
| `analysten/index.html:211` |  · Finnhub &amp; FMP | Korrigiert:  · Angabe Dritter |
| `analysten/index.html:242` | rel="noopener"&gt;Finnhub&lt;/a&gt; | Korrigiert: rel="noopener"&gt;Analystendaten&lt;/a&gt; |
| `analysten/index.html:447` | Kursziel vs. aktueller Kurs | Korrigiert: Analysten-Kursziel vs. aktueller Kurs (Angabe Dritter) |
| `analysten/index.html:447` | Ø Kurspotenzial | Korrigiert: Ø Abstand zum Analysten-Kursziel (Angabe Dritter) |
| `analysten/index.html:448` | wöchentlicher Finnhub-Abruf | Korrigiert: wöchentlicher Datenabruf |
| `analysten/index.html:547` | Analystenabdeckung von Finnhub | Korrigiert: Analystenabdeckung |
| `analysten/index.html:563` | &gt;Kurspotenzial&lt; | Korrigiert: &gt;Abstand zum Analysten-Kursziel (Angabe Dritter)&lt; |
| `analysten/index.html:604` | Konsens-Rating: Finnhub Recommendation Trends | Korrigiert: Konsens-Rating (Angabe Dritter; Datenquellen unter /infos/#quellen) |
| `analysten/index.html:684` | e.source\|\|"Finnhub" | Korrigiert: e.source\|\|"externe Analystendaten" |
| `ask/app.js:412` | Strategiesignalen | Korrigiert: Strategie-Ergebnissen |
| `ask/app.js:430` | Supertrader-Signale nicht geladen | Korrigiert: Supertrader-Ergebnisse nicht geladen |
| `assets/site-navigation.js:135` | ['signale','Signale' | Korrigiert: ['signale','Regel-Ergebnisse' |
| `dashboard/app-rebuild.js:39` | SEC-Daten | Korrigiert: Meldedaten |
| `dashboard/app-rebuild.js:197` | 'Kaufzone' | Korrigiert: 'Zone laut Methode' |
| `dashboard/app.js:20` | "Einstiegszone" | Korrigiert: "Zone laut Methode" |
| `dashboard/index_legacy_v63.html:22` | Chance/Risiko | Korrigiert: Kennzahlenvergleich |
| `dashboard/index_legacy_v63.html:24` | von Claude recherchierten | Korrigiert: recherchierten |
| `dashboard/index_legacy_v63.html:28` | Claude Data Audit | Korrigiert: Datenprüfung |
| `dashboard/v2.js:1` | 'Chance/Risiko' | Korrigiert: 'Modellverhältnis' |
| `dashboard/v2.js:1` | 'Einstiegszone' | Korrigiert: 'Zone laut Methode' |
| `discover/engines/reihen.js:50` |  (SEC) | Korrigiert:  (Pflichtmeldungen) |
| `discover/ui/daten.js:47` | Anbieter: Tiingo (lizenziertes Marktdatenpaket | Korrigiert: Kursdaten aus lizenziertem Marktdatenpaket (Quellen: /infos/#quellen |
| `discover/ui/daten.js:56` | IEX-Bestand von Tiingo | Korrigiert: IEX-Datenbestand |
| `discover/ui/daten.js:69` | bei der SEC eingereichten | Korrigiert: bei der US-Börsenaufsicht eingereichten |
| `discover/ui/daten.js:101` | IEX-Bestand von Tiingo | Korrigiert: IEX-Datenbestand |
| `discover/ui/daten.js:101` | Marktdaten und Tagesverlauf: Tiingo, Inc. | Korrigiert: Marktdaten und Tagesverlauf: externer Kursdatenanbieter (Quellen: /infos/#quellen) |
| `discover/ui/daten.js:106` | Einreichungen bei der SEC | Korrigiert: Pflichtmeldungen |
| `discover/ui/detail-fundamentals.js:172` | Geschäftszahlen der SEC | Korrigiert: Geschäftszahlen aus Pflichtmeldungen |
| `discover/ui/detail.js:476` | Kurse, Kennzahlen und Signale sind erzeugt | Korrigiert: Kurse, Kennzahlen und Regel-Ergebnisse sind erzeugt |
| `discover/ui/detail.js:1992` | CIK (SEC) | Korrigiert: CIK (US-Meldekennung) |
| `discover/ui/detail.js:2015` | SEC-Einreicher | Korrigiert: Einreicher bei der US-Börsenaufsicht |
| `discover/ui/featured.js:71` |  · SEC | Korrigiert:  · Pflichtmeldungen |
| `discover/ui/logos.js:121` | SEC-Einreichung des Unternehmens | Korrigiert: Pflichtmeldung des Unternehmens |
| `discover/ui/market-intelligence.js:1094` | Signal am Schlusskurs | Korrigiert: Regelereignis am Schlusskurs |
| `discover/ui/market-intelligence.js:1161` | Wie sicher sind die Zahlen? | Korrigiert: Wie groß ist die statistische Unsicherheit? |
| `discover/ui/market-intelligence.js:1162` | Mit 95 % Sicherheit liegt der wahre Anteil | Korrigiert: Das 95-%-Konfidenzintervall für den Anteil liegt |
| `discover/ui/market-intelligence.js:1164` | der Unterschied ist nicht sicher | Korrigiert: der Unterschied ist statistisch nicht belegt |
| `discover/ui/reihen.js:233` |  (SEC) | Korrigiert:  (Pflichtmeldungen) |
| `discover/ui/v3.js:219` |  (SEC) | Korrigiert:  (Pflichtmeldungen) |
| `discover/ui/v3.js:446` | sec ? 'SEC' : 'Kurse' | Korrigiert: sec ? 'Pflichtmeldungen' : 'Kurse' |
| `fundamental/app.js:1767` | a.provider \|\| 'Finnhub + FMP' | Korrigiert: a.provider \|\| 'externe Analystendaten' |
| `fundamental/app.js:1856` | Companyfacts von SEC EDGAR | Korrigiert: Companyfacts aus Unternehmensmeldungen |
| `fundamental/app.js:1856` | Pflichtmeldungen an die SEC | Korrigiert: Pflichtmeldungen der Unternehmen |
| `fundamental/app.js:1879` | Companyfacts von SEC EDGAR | Korrigiert: Companyfacts aus Unternehmensmeldungen |
| `fundamental/app.js:1879` | Pflichtmeldungen an die SEC | Korrigiert: Pflichtmeldungen der Unternehmen |
| `fundamental/app.js:1888` | SEC-Meldeverlauf | Korrigiert: Meldeverlauf |
| `fundamental/app.js:1889` | neuesten SEC-Meldung | Korrigiert: neuesten Pflichtmeldung |
| `fundamental/app.js:1892` | SEC-Branchen | Korrigiert: SIC-Branchen |
| `fundamental/engine/catalog.js:644` | SEC-Branchen | Korrigiert: SIC-Branchen |
| `fundamental/engine/catalog.js:649` | SEC-Branchen | Korrigiert: SIC-Branchen |
| `fundamental/index.html:10` | SEC-Meldungen | Korrigiert: Pflichtmeldungen |
| `hedgefonds/app.js:1007` | US-Börsenaufsicht SEC (EDGAR) | Korrigiert: US-Börsenaufsicht (Unternehmensmeldungen) |
| `hedgefonds/app.js:1013` | Fondsdaten aus SEC EDGAR | Korrigiert: Fondsdaten aus Pflichtmeldungen |
| `hedgefonds/app.js:1231` | 13F-Meldung bei der SEC | Korrigiert: 13F-Pflichtmeldung |
| `hedgefonds/app.js:1232` | SEC-Melder | Korrigiert: Meldender Fonds |
| `hedgefonds/app.js:1233` | 13F bei der SEC öffnen | Korrigiert: 13F-Originalmeldung öffnen |
| `hedgefonds/index.html:8` | Was die besten Investoren kaufen: | Korrigiert: Was große Fonds gemeldet haben: |
| `hedgefonds/index.html:8` | direkt von der SEC | Korrigiert: aus Pflichtmeldungen |
| `index.html:72` | SEC-Berichten | Korrigiert: Unternehmensberichten |
| `index.html:118` | SEC-Berichten | Korrigiert: Unternehmensberichten |
| `index.html:135` | SEC-Berichten | Korrigiert: Unternehmensberichten |
| `konto/push-settings.js:32` | Neuer Bericht bei der SEC | Korrigiert: Neuer Unternehmensbericht |
| `landing/reference/index.html:135` | SEC-Berichten | Korrigiert: Unternehmensberichten |
| `magazin/01/index.html:525` | CHANCE / RISIKO | Korrigiert: STÄRKEN / RISIKEN |
| `magazin/01/index.html:540` | Börsenfilings, SEC und IEA | Korrigiert: Börsenfilings, Aufsichtsbehörden und IEA |
| `mein-dashboard/dashboard.js:32` | SEC-Berichten | Korrigiert: Unternehmensberichten |
| `morning/2026-09-05/index.html:11` | &gt;SEC – | Korrigiert: &gt;Unternehmensmeldung – |
| `morning/2026-09-09/index.html:10` | &gt;SEC – | Korrigiert: &gt;Unternehmensmeldung – |
| `preise/index.html:62` | Supertrader-Signale | Korrigiert: Supertrader-Regel-Ergebnisse |
| `quant/app/page-backtest.js:41` | nach dem Signal | Korrigiert: nach dem Regelereignis |
| `quant/app/page-backtest.js:128` | das Signal | Korrigiert: das Regelereignis |
| `quant/app/page-backtest.js:134` | nach dem Signal | Korrigiert: nach dem Regelereignis |
| `quant/app/page-backtest.js:141` | mit Signal | Korrigiert: mit Regelereignis |
| `quant/app/page-backtest.js:147` | Signale je Jahr | Korrigiert: Regelereignisse je Jahr |
| `quant/app/page-backtest.js:148` | Signale je Jahr | Korrigiert: Regelereignisse je Jahr |
| `quant/app/page-backtest.js:148` | X.section("Signale" | Korrigiert: X.section("Regelereignisse" |
| `quant/app/page-backtest.js:148` | dasselbe Signal | Korrigiert: dasselbe Regelereignis |
| `quant/app/page-backtest.js:156` | nach dem Signal | Korrigiert: nach dem Regelereignis |
| `quant/app/page-backtest.js:163` | Chance / Risiko | Korrigiert: Anstieg / Rückgang (historisch) |
| `quant/app/page-backtest.js:167` | nach dem Signal | Korrigiert: nach dem Regelereignis |
| `quant/app/page-backtest.js:168` | nach dem Signal | Korrigiert: nach dem Regelereignis |
| `quant/app/page-backtest.js:181` | nach dem Signal | Korrigiert: nach dem Regelereignis |
| `quant/app/page-backtest.js:184` | das Signal | Korrigiert: das Regelereignis |
| `quant/app/page-backtest.js:186` | "Signal (Median)" | Korrigiert: "Regelereignis (Median)" |
| `quant/app/page-backtest.js:202` | Ein Signal liest | Korrigiert: Ein Regelereignis liest |
| `quant/app/page-backtest.js:221` | nach dem Signal | Korrigiert: nach dem Regelereignis |
| `quant/app/page-backtest.js:314` | Hatte ein Signal | Korrigiert: Hatte ein Regelereignis |
| `quant/app/page-chartbild.js:69` | spricht dafür | Korrigiert: stützt die Struktur |
| `quant/app/page-chartbild.js:69` | spricht dagegen | Korrigiert: widerspricht der Struktur |
| `quant/app/page-chartbild.js:88` | "Einstiegszone" | Korrigiert: "Zone laut Methode" |
| `quant/app/page-evidence.js:138` | Mehrfach auftretende Signale | Korrigiert: Mehrfach auftretende Regelereignisse |
| `quant/app/page-evidence.js:208` | Mehrere Signale können | Korrigiert: Mehrere Regelereignisse können |
| `quant/app/page-evidence.js:223` | "aria-label": "Signal " | Korrigiert: "aria-label": "Regelereignis " |
| `quant/app/page-evidence.js:224` | bar("Signal", | Korrigiert: bar("Regelereignis", |
| `quant/app/page-evidence.js:244` | dieses Signal | Korrigiert: dieses Regelereignis |
| `quant/app/page-evidence.js:261` | ein getestetes Signal | Korrigiert: ein getestetes Regelereignis |
| `quant/app/page-evidence.js:294` | neue Signale. | Korrigiert: neue Regelereignisse. |
| `quant/app/page-method.js:101` | SEC-Daten | Korrigiert: Meldedaten |
| `quant/app/page-method.js:143` | Kurse von Tiingo | Korrigiert: Kurse vom Marktdatenanbieter |
| `quant/app/page-method.js:143` | SEC-Meldungen | Korrigiert: Pflichtmeldungen |
| `quant/app/page-method.js:160` | (SEC EDGAR, Tiingo) | Korrigiert: (Unternehmensmeldungen, Kursdatenanbieter; Quellen: /infos/#quellen) |
| `quant/app/page-method.js:171` | Geschäftszahlen: SEC EDGAR | Korrigiert: Geschäftszahlen: Pflichtmeldungen |
| `quant/app/page-method.js:172` | Kurse: Tiingo | Korrigiert: Kurse: Marktdatenanbieter |
| `quant/app/page-stock.js:288` | Spricht dafür | Korrigiert: Stärken laut Kennzahlen |
| `quant/app/page-stock.js:289` | Spricht dagegen | Korrigiert: Schwächen laut Kennzahlen |
| `quant/app/page-stock.js:484` | getesteten Signal lagen | Korrigiert: getesteten Regelereignis lagen |
| `quant/app/page-stock.js:488` | getestetes Signal | Korrigiert: getestetes Regelereignis |
| `quant/app/page-stock.js:521` | getestetes Signal | Korrigiert: getestetes Regelereignis |
| `quant/app/page-stock.js:540` | getesteten Signale | Korrigiert: getesteten Regelereignisse |
| `quant/app/page-stock.js:593` | Welche Signale getestet | Korrigiert: Welche Regelereignisse getestet |
| `quant/app/page-stock.js:593` | getestetes Signal | Korrigiert: getestetes Regelereignis |
| `quant/app/page-stock.js:1084` | Was spricht dafür – und was dagegen? | Korrigiert: Stärken und Schwächen laut Kennzahlen |
| `quant/app/page-stock.js:1177` | Getestete Signale | Korrigiert: Getestete Regelereignisse |
| `quant/app/pages.js:45` | Evidenz zu einem Signal | Korrigiert: Evidenz zu einem Regelereignis |
| `quant/app/pages.js:45` | neue Signale wie | Korrigiert: neue Regelereignisse wie |
| `quant/app/pages.js:64` | das Signal früher | Korrigiert: das Regelereignis früher |
| `quant/app/pages.js:201` | Signal lag historisch | Korrigiert: Regelereignis lag historisch |
| `quant/app/pages.js:202` | Signal lag historisch | Korrigiert: Regelereignis lag historisch |
| `quant/app/pages.js:231` | getestetes Signal | Korrigiert: getestetes Regelereignis |
| `quant/data-inspector/app.js:39` | Echte SEC-Daten | Korrigiert: Echte Meldedaten |
| `quant/data-inspector/app.js:43` | "SEC", "neutral" | Korrigiert: "Pflichtmeldung", "neutral" |
| `quant/data-inspector/app.js:48` | nie als SEC-Meldung | Korrigiert: nie als Pflichtmeldung |
| `quant/data-inspector/app.js:56` | Noch keine SEC-Daten | Korrigiert: Noch keine Meldedaten |
| `quant/data-inspector/app.js:67` | SEC Concept | Korrigiert: Meldekonzept |
| `quant/data-inspector/app.js:111` | "VU DERIVED" : "SEC" | Korrigiert: "VU DERIVED" : "Pflichtmeldung" |
| `quant/data-inspector/app.js:256` | SEC Data Inspector | Korrigiert: Fundamentaldaten-Inspektor |
| `quant/data-inspector/app.js:258` | SEC-Concept | Korrigiert: Meldekonzept |
| `quant/data-inspector/index.html:10` | SEC Data Inspector | Korrigiert: Fundamentaldaten-Inspektor |
| `quant/data-inspector/index.html:11` | SEC-Fundamentalzahl | Korrigiert: Fundamentalzahl aus Pflichtmeldungen |
| `quant/musterdepots/depots.js:103` | (Tiingo, split-bereinigt) | Korrigiert: (split-bereinigt) |
| `quant/ui/shell.js:176` | SEC-Meldungen | Korrigiert: Pflichtmeldungen |
| `quant/ui/shell.js:176` | bei der SEC | Korrigiert: bei der US-Börsenaufsicht |
| `screener/app.js:411` | SEC EDGAR bis | Korrigiert: Unternehmensmeldungen bis |
| `screener/app.js:412` | SEC-SIC-Code | Korrigiert: SIC-Code |
| `screener/app.js:528` | SEC EDGAR bis | Korrigiert: Unternehmensmeldungen bis |
| `screener/app.js:528` | SEC-SIC-Code | Korrigiert: SIC-Code |
| `screener/app.js:1171` | SEC SIC | Korrigiert: SIC |
| `screener/app.js:1171` | SEC-Fundamentaldaten | Korrigiert: Fundamentaldaten |
| `screener/app.js:1493` | SEC-Zahlen | Korrigiert: Geschäftszahlen |
| `screener/app.js:1523` | SEC-Jahreszahlen | Korrigiert: Jahreszahlen |
| `screener/app.js:1548` | SEC EDGAR (companyfacts) | Korrigiert: Unternehmensmeldungen (Companyfacts) |
| `screener/engine/fields.js:52` | SEC-SIC-Code | Korrigiert: SIC-Code |
| `screener/engine/fields.js:54` | laut SEC, | Korrigiert: laut Meldung, |
| `screener/engine/fields.js:79` | SEC-Berichten | Korrigiert: Unternehmensberichten |
| `screener/engine/fields.js:115` | SEC-Daten | Korrigiert: Meldedaten |
| `screener/engine/fields.js:128` | SEC-Berichten | Korrigiert: Unternehmensberichten |
| `screener/engine/fields.js:300` | SIC-Hauptgruppe der SEC | Korrigiert: SIC-Hauptgruppe der Meldestelle |
| `supertrader/assets/sf-research.js:36` | SEC-Branchen | Korrigiert: SIC-Branchen |
| `supertrader/assets/sf-research.js:66` |  (SEC) | Korrigiert:  (Pflichtmeldungen) |
| `supertrader/assets/sf-research.js:138` | Tiingo, Inc. · split-adjustierte | Korrigiert: Kursdatenanbieter · split-adjustierte |
| `supertrader/assets/st-redesign.js:272` | Alle Signale | Korrigiert: Alle Regel-Ergebnisse |
| `supertrader/assets/st-redesign.js:321` | Kurse: Tiingo, split-adjustiert | Korrigiert: Kurse: split-adjustiert |
| `supertrader/assets/st-redesign.js:334` | Sie kaufen und verkaufen streng nach Regel | Korrigiert: Sie nehmen Aktien streng nach Regel auf und geben sie ab |
| `supertrader/assets/st-redesign.js:437` | Risiko je Kauf | Korrigiert: Risiko je Aufnahme (Musterdepot) |
| `supertrader/assets/st-redesign.js:499` | intro('Signale' | Korrigiert: intro('Regel-Ergebnisse' |
| `supertrader/assets/st-redesign.js:555` | Signale zeigen | Korrigiert: Regel-Ergebnisse zeigen |
| `supertrader/assets/st-redesign.js:556` | Signale zeigen | Korrigiert: Regel-Ergebnisse zeigen |
| `supertrader/assets/st-redesign.js:622` | Live-Signale | Korrigiert: laufende Regel-Ergebnisse |
| `supertrader/assets/st-redesign.js:684` | label: 'Signale' | Korrigiert: label: 'Regel-Ergebnisse' |
| `supertrader/assets/st-redesign.js:774` | Signale auf Schlusskursen | Korrigiert: Regel-Ergebnisse auf Schlusskursen |
| `supertrader/assets/supertrader.js:144` | Signale auf Schlusskursen | Korrigiert: Regel-Ergebnisse auf Schlusskursen |
| `supertrader/assets/supertrader.js:308` | Signale auf Tagesschlusskursen | Korrigiert: Regel-Ergebnisse auf Tagesschlusskursen |
| `supertrader/assets/supertrader.js:372` | Signale ansehen | Korrigiert: Regel-Ergebnisse ansehen |
| `supertrader/assets/supertrader.js:402` | unter Signale einsehbar | Korrigiert: unter Regel-Ergebnisse einsehbar |
| `supertrader/assets/supertrader.js:447` | Alle Signale | Korrigiert: Alle Regel-Ergebnisse |
| `supertrader/assets/supertrader.js:666` | text: 'Kauf ' | Korrigiert: text: 'Aufnahme (Musterdepot) ' |
| `supertrader/assets/supertrader.js:674` | text: 'Kauf ' | Korrigiert: text: 'Aufnahme (Musterdepot) ' |
| `supertrader/assets/supertrader.js:696` | ? 'Kauf ' : 'Verkauf ' | Korrigiert: ? 'Aufnahme (Musterdepot) ' : 'Abgabe (Musterdepot) ' |
| `supertrader/assets/supertrader.js:704` |  · Kauf  | Korrigiert:  · Aufnahme (Musterdepot)  |
| `supertrader/assets/supertrader.js:857` | Die neun Signale | Korrigiert: Die neun Kriterien |
| `supertrader/assets/supertrader.js:857` | Signale und Trefferquote | Korrigiert: Kriterien und Trefferquote |
| `supertrader/assets/supertrader.js:882` | text: 'Signale' | Korrigiert: text: 'Regel-Ergebnisse' |
| `supertrader/assets/supertrader.js:1222` | (über Tiingo, verzögert) | Korrigiert: (verzögert) |
| `supertrader/assets/supertrader.js:1413` | Live-Signale | Korrigiert: laufende Regel-Ergebnisse |
| `supertrader/assets/supertrader.js:1532` | SEC-Meldungen | Korrigiert: Pflichtmeldungen |
| `supertrader/assets/supertrader.js:1568` |  · Kauf:  | Korrigiert:  · Aufnahme (Musterdepot):  |
| `supertrader/assets/supertrader.js:1568` |  · Verkauf:  | Korrigiert:  · Abgabe (Musterdepot):  |
| `supertrader/signals/index.html:8` | &lt;title&gt;Signale — | Korrigiert: &lt;title&gt;Regel-Ergebnisse — |
| `technical/app.js:242` | Signale werden nach festen Regeln erkannt | Korrigiert: Regelereignisse werden nach festen Regeln erkannt |
| `technical/app.js:346` | Zonen, Trend und Signale | Korrigiert: Zonen, Trend und Regel-Ergebnisse |
| `technical/app.js:354` | Zonen, Trend und Signale | Korrigiert: Zonen, Trend und Regel-Ergebnisse |
| `technical/app.js:1104` | Zonen, Trend und Signale | Korrigiert: Zonen, Trend und Regel-Ergebnisse |
| `technical/app.js:1228` | "Signal" + (x | Korrigiert: "Regelereignis" + (x |
| `technical/app.js:1231` | dieses Signal allein | Korrigiert: dieses Regelereignis allein |
| `technical/app.js:1277` | sect("Signale", | Korrigiert: sect("Regel-Ergebnisse", |
| `technical/app.js:1280` | kein Signal erkannt | Korrigiert: kein Regelereignis erkannt |
| `technical/app.js:1280` | keine Signale. | Korrigiert: keine Regelereignisse. |
| `technical/app.js:1525` | Aktive Signale | Korrigiert: Aktive Regel-Ergebnisse |
| `technical/app.js:1530` | Aktive Signale | Korrigiert: Aktive Regel-Ergebnisse |
| `technical/app.js:1639` | ungültige Signale | Korrigiert: ungültige Regelereignisse |
| `technical/app.js:1639` | ungültiges Signal | Korrigiert: ungültiges Regelereignis |
| `technical/app.js:1682` | Tiingo EOD | Korrigiert: Tagesschlusskurse |
| `technical/app.js:1831` | Tiingo EOD | Korrigiert: Tagesschlusskurse |
| `vorsorge/engines/etf-master.js:342` | Kostenquote laut Prospekt (SEC) | Korrigiert: Kostenquote laut US-Prospekt |
| `vorsorge/engines/etf-provider.js:27` | label: "Tiingo" | Korrigiert: label: "Kursdatenanbieter" |
| `vorsorge/engines/etf-provider.js:59` | mit Tiingo-Listings | Korrigiert: mit Kursdaten-Listings |
| `vorsorge/engines/monitor.js:57` | Aufnahme des Tiingo-ETF-Universums | Korrigiert: Aufnahme des Kursdaten-ETF-Universums |
| `vorsorge/ui/foerderung.js:310` | SEC N-PORT | Korrigiert: Form N-PORT |
| `vorsorge/ui/foerderung.js:345` | SEC N-PORT | Korrigiert: Form N-PORT |
| `vorsorge/ui/foerderung.js:346` | SEC-Prospekt | Korrigiert: US-Prospekt |
| `vorsorge/ui/foerderung.js:358` | Tiingo-Ingest | Korrigiert: Kursdaten-Import |
| `vorsorge/ui/foerderung.js:359` | Tiingo-Tickerliste | Korrigiert: Kursdaten-Tickerliste |
| `vorsorge/ui/foerderung.js:378` | (Tiingo) | Korrigiert: (externer Anbieter) |
| `vorsorge/ui/foerderung.js:378` | Tiingo-Zeilen | Korrigiert: Kursdaten-Zeilen |
| `vorsorge/ui/intel.js:313` | SEC Form N-PORT | Korrigiert: Form N-PORT |
| `vorsorge/ui/intel.js:313` | SEC Prospekt-Daten | Korrigiert: US-Prospekt-Daten |
| `vorsorge/ui/intel.js:313` | Tiingo (Kursdaten-Anbieter) | Korrigiert: Kursdaten-Anbieter |
| `vorsorge/ui/intel.js:322` | Tiingo · Stand | Korrigiert: Kurse · Stand |
| `vorsorge/ui/intel.js:323` | SEC Form N-PORT | Korrigiert: Form N-PORT |
| `vorsorge/ui/intel.js:324` | SEC Prospekt-Daten | Korrigiert: US-Prospekt-Daten |
| `vorsorge/ui/intel.js:325` | SEC (US-Investmentgesellschaft | Korrigiert: US-Investmentgesellschaft |
| `vorsorge/ui/intel.js:325` | kein UCITS)" | Korrigiert: kein UCITS" |
| `vorsorge/ui/plan.js:245` | Wie sicher ist das Ziel? | Korrigiert: Welche Annahmen bestimmen das Ziel? |
| `vorsorge/ui/portfolio.js:171` |  (SEC) | Korrigiert:  (Pflichtmeldungen) |
| `willkommen/app.js:17` | SEC-Berichten | Korrigiert: Unternehmensberichten |
| `willkommen/start/prefs.js:31` | Strategien und Signale | Korrigiert: Strategien und Regel-Ergebnisse |

### Weitere Textquellen und Templates

Die Startseite ist generiert: dieselben Textkorrekturen stehen auch in ihrem Template und Generator, damit der nächste Build sie erhält. Im Navigationstest wurde nur die erwartete Beschriftung aktualisiert. Keine Prüfbedingung wurde entfernt.

| Datei:Zeile | Fund | Vorschlag |
|---|---|---|
| `scripts/home/build-home.mjs:122` | SEC-B | Korrigiert: Unternehmensb |
| `scripts/home/index.template.html:72` | SEC-B | Korrigiert: Unternehmensb |
| `scripts/home/index.template.html:135` | SEC-B | Korrigiert: Unternehmensb |
| `studio/stories/hedgefonds/scenes.js:25` | — | Korrigiert: US- |
| `studio/stories/hedgefonds/scenes.js:25` | SEC  | Korrigiert: entfernt |
| `studio/stories/quant/scenes.js:55` | Signal g | Korrigiert: R |
| `studio/stories/quant/scenes.js:55` | — | Korrigiert: l-Ergeb |
| `studio/stories/quant/scenes.js:55` | — | Korrigiert: is |
| `studio/stories/quant/scenes.js:55` | den | Korrigiert: im |
| `studio/stories/quant/scenes.js:55` | — | Korrigiert: vergleich |
| `studio/stories/quant/scenes.js:56` | S | Korrigiert: Regel-Ergebn |
| `studio/stories/quant/scenes.js:56` | gnal | Korrigiert: s |
| `studio/stories/supertrader/scenes.js:39` | Signal | Korrigiert: Ergebniss |
| `studio/stories/technical/scenes.js:30` | S | Korrigiert: Regel-Ergebn |
| `studio/stories/technical/scenes.js:30` | gnal | Korrigiert: ss |
| `studio/stories/technical/scenes.js:32` | Signal | Korrigiert: Regelereignis |

## Offene Befunde – durch den Auftrag begrenzte Änderungen

Diese Stellen sind bewusst nicht als bereinigt ausgewiesen. Dynamische Quellenwerte lassen sich mit bloßem Austausch eines festen Textes nicht zuverlässig entfernen. Daten, Logik und die ausdrücklich geschützten Dateien bleiben unverändert. Quellenangaben sollen weiter zentral auf `/infos/#quellen` nachvollziehbar sein.

| Datei:Zeile | Fund | Vorschlag |
|---|---|---|
| `company-intelligence/preview.js:28` | Recent material SEC disclosures | „Recent material disclosures“; nicht geändert: Company-Intelligence-Datei ausdrücklich ausgenommen. |
| `company-intelligence/preview.js:36` | SEC facts | „Reported company facts“; gleicher Ausschluss. |
| `company-intelligence/ui/stock-section.js:41` | SEC / Regulatorisch | „Regulatorisch“; gleicher Ausschluss. |
| `company-intelligence/ui/stock-section.js:61` | dynamisches Quellenlabel SEC | Herkunft zentral auf /infos/; gleicher Ausschluss, zusätzlich dynamischer Wert. |
| `quant/engines/fx/currency-registry.js:139` | SEC bedeutet nicht automatisch USD | „Eine Pflichtmeldung bedeutet nicht automatisch USD“; Quant-Engine ausdrücklich ausgenommen. |
| `quant/engines/multi-asset/market-pulse.js:205` | Tiingo in der Reihenbeschreibung | „splitbereinigter Schlusskurs ohne Ausschüttungen“; Quant-Engine ausdrücklich ausgenommen. |
| `assets/site-navigation.js:286` | Pflichtmeldungen an die SEC im eingebetteten thirdParty-Hinweis | Zentrale Quelle assets/legal-notices.json enthält denselben Text. Nicht nur den generierten Hinweis-Cache ändern; kanonischen Rechtshinweis separat abstimmen. |
| `assets/vu-ui.js:327` | derselbe thirdParty-Hinweis | Wie oben; Rechtshinweis und Datenquelle unverändert. |
| `analysten/index.html:605` | r.price_target_provider wird direkt angezeigt | Anzeige über neutrale Quellenbezeichnung mit Verweis auf /infos/; benötigt eine Änderung der Darstellungsausdrücke. |
| `analysten/index.html:684` | e.source wird direkt angezeigt | Gleiches; nur den festen Fallback im PR neutralisiert. |
| `analysten/index.html:689` | e.target.source im Kurszielhinweis | Quelle weiterhin nachvollziehbar zentral ausweisen; dynamische Darstellung separat behandeln. |
| `fundamental/app.js:1767` | a.provider wird direkt angezeigt | Gleiches; fester Fallback neutralisiert, dynamischer Inhalt unverändert. |
| `fundamental/engine/catalog.js:732` | provider: Finnhub | Herkunftsmetadatum, das in der Ansicht landet; unverändert, weil keine Daten-/Identitätsänderung. Anzeige statt Herkunft ändern. |
| `vorsorge/ui/foerderung.js:378` | u.conclusion aus erzeugtem UCITS-Bericht | Kann Anbieternamen enthalten; Daten und Darstellungsausdruck unverändert. Anzeige künftig neutral formulieren. |
| `vorsorge/ui/foerderung.js:381` | f.primarySource, f.tiingo, f.gap, f.secondProviderNeeded | Dynamische Quellen-/Lückentexte: künftige reine Darstellungslösung mit /infos/-Verweis, nicht Daten umbenennen. |
| `vorsorge/ui/intel.js:317` | Rückfall auf x.source bei unbekanntem SRC-Schlüssel | Bekannte feste Anzeigenamen korrigiert; Rückfall ist datenabhängig und bleibt unverändert. |
| `quant/data-inspector/app.js:58` | Workflow-Name „Update SEC fundamentals“ und data.sec.gov | Tatsächlicher technischer Name/Endpunkt, keine pauschale Ersetzung; erklärenden UI-Text bei separater Überarbeitung vereinfachen. |
| `quant/data-inspector/app.js:169` | gleicher technischer Workflow-Verweis | Wie oben. |

## Geprüfte Ausnahmen und Abgrenzung

| Datei:Zeile | Fund | Vorschlag |
|---|---|---|
| `infos/index.html` | Quellenliste mit Anbieternamen | Unverändert: ausdrücklich erlaubte Seite „Rechtliches & Infos“. |
| `assets/vu-ui.js:381` | TraderFox in SOURCE_NAMES-Regulärausdrücken | Unverändert: vorhandene Neutralisierungslogik, kein sichtbarer Name. |
| `ask/app.js:197` | sagt nicht, ob du kaufen oder verkaufen sollst | Unverändert: ausdrückliche Ablehnung von Handelsrat. |
| `ask/app.js:414` | nicht sicher in Filter übersetzen | Unverändert: technische Unsicherheit, kein Sicherheitsversprechen. |
| `technical/app.js:1500` | Signal als MACD-Linienname | Unverändert: technischer Indikator-Fachbegriff, keine Handlungsaufforderung. |
| `technical/engine/templates.js:33` | kein Kauf- oder Verkaufssignal | Unverändert: verneinter Hinweis. |
| `technical/engine/assistant.js:132` | nie sicher | Unverändert: ausdrückliche Begrenzung einer Aussage. |
| `vorsorge/engines/monitor.js:154` | Bestandsvertrag garantiert … | Unverändert: beschreibt eingegebene Vertragsgarantie, verspricht keine Modellrendite. |
| `vorsorge/ui/foerderung.js:132` | Garantiertes Kapital | Unverändert: Eingabe zum bestehenden Vertrag. |
| `vorsorge/ui/plan.js:248` | keine garantierte Rente | Unverändert: verneinter Hinweis. |
| `vorsorge/ui/foerderung.js:255` | ETF lässt sich wie eine Aktie kaufen | Unverändert: allgemeine Begriffserklärung gemäß WORTWAHL.md. |
| `assets/stock-navigator.js:42` | welche Fonds halten, kaufen und verkaufen | Unverändert: Vorgänge Dritter. |
| `studio/stories/hedgefonds/scenes.js:22` | Jeder Kauf / Jeder Verkauf | Unverändert: Fondsbewegungen, kein Musterdepot-Protokoll oder Handelsrat. |
| `studio/reels/templates/meta-muse/composition.html:73` | Kaufen als dargestellter Analysten-Konsens | Reels laut EINORDNUNG.md §0 Owner-Ausnahme; unverändert. |
| `studio/reels/templates/tesla-ark/composition.html:45` | ARK-Kursziel | Reels laut Owner-Ausnahme unverändert; Angabe Dritter, kein eigenes Zielversprechen. |
| `social/engines/brand.js:63` | garantiert/risikolos in Prüfmuster | Unverändert: Verbotsprüfung, kein sichtbares Renditeversprechen. |
| `social/engines/web-research.js:42` | anthropic als Suchbegriff | Unverändert: technischer Suchbegriff, kein Anbieternachweis in einer Produktansicht. |
| `morning/2026-09-09/index.html:6` | keine garantierten Umsätze | Unverändert: redaktionelle Verneinung, kein Versprechen. |
| `morning/2026-10-06/index.html:8` | garantiert weder … noch … | Unverändert: redaktionelle Verneinung. |
| `magazin/02/index.html:26` | weder Kursziel noch Kaufzone | Unverändert: ausdrückliche Verneinung. |
| `analysten/index.html:666` | Kaufen / Halten / Verkaufen | Analystenangaben Dritter, neben Quelle und Stand; keine eigene Handelsempfehlung. Dynamische Quellenanzeige siehe offene Befunde. |
| `quant/app/page-stock.js:701` | Einstiegsmarke / Stopp-Marke der Methode | Unverändert gemäß späterer Owner-Ausnahme in EINORDNUNG.md §0; keine Zusage einer Kursentwicklung. |
| `quant/engines/ai-provider.js:91` | unterbewertet im Suchwortverzeichnis | Unverändert: technisches Suchsynonym und ausdrücklich geschützte Engine. |

## Validierung

Die UI-Schutzprüfung `quant/tests/backtest-consolidation-boundary.test.mjs` schlug erwartungsgemäß für geänderte, gepinnte Textdateien an. Die zugehörigen Einzelrevisionen stehen mit altem/neuem SHA-256 und diesem Beleg in `docs/quality/ui-protection-revisions.json`; die eingefrorene Basis bleibt unverändert.

Testergebnisse werden nach Abschluss der Läufe ergänzt.
