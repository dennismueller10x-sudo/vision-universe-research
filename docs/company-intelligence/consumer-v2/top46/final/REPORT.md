# TOP-46 Content Gap Closure — Abschlussnachweis

Die bestehende V2-Oberfläche, Zugriffskontrolle, Quant-Berechnungen und Kohorte bleiben erhalten. Es wurden gezielt Inhalte ergänzt; kein Universum-Crawl und keine Aktivierung weiterer Aktien.

## 1. Die 14 Profillücken
CHE, JPM, BAC, CAC, GS, MS, TK, MET, CRM, VCYT, MCHB, GOOG/GOOGL, JBI und ARBE: Sechs fehlende private Profile: CHE, GS, MS, MET, VCYT, MCHB. Acht nicht freigegebene englische Quellenfragmente: JPM, BAC, CAC, TK, CRM, GOOG/GOOGL, JBI, ARBE. GOOG und GOOGL teilen einen Emittenten.

## 2. Neue deutsche Profile
31 → 45 von 45 Emittenten. Jeweils zwei bis drei neutrale, unternehmensspezifische Sätze; 14 offizielle SEC-Jahresberichte und zusätzlich CAC-IR-Beleg. Keine Mitarbeiterzahlen, Branchenplatzhalter oder Live-KI. QCOMs falsche Website wurde auf qualcomm.com korrigiert. Einzelbelege einschließlich vollständigem deutschen Text und Annahmegrund: [profile-source-review.json](../profile-source-review.json).

| Emittent | Quelle | Status |
|---|---|---|
| CHE | [10-K · 2026-02-27](https://www.sec.gov/Archives/edgar/data/19584/000156276226000020/che-20251231x10k.htm) | Freigegeben |
| JPM | [10-K · 2026-02-13](https://www.sec.gov/Archives/edgar/data/19617/000162828026008131/jpm-20251231.htm) | Freigegeben |
| BAC | [10-K · 2026-02-25](https://www.sec.gov/Archives/edgar/data/70858/000007085826000157/bac-20251231.htm) | Freigegeben |
| CAC | [10-K · 2026-03-06](https://www.sec.gov/Archives/edgar/data/750686/000075068626000010/cac-20251231.htm), [FIRST_PARTY_WEB](https://camdennationalcorporation.com/overview/default.aspx) | Freigegeben |
| GS | [10-K · 2026-02-25](https://www.sec.gov/Archives/edgar/data/886982/000088698226000091/gs-20251231.htm) | Freigegeben |
| MS | [10-K · 2026-02-19](https://www.sec.gov/Archives/edgar/data/895421/000089542126000086/ms-20251231.htm) | Freigegeben |
| TK | [20-F · 2026-03-13](https://www.sec.gov/Archives/edgar/data/911971/000091197126000015/tk-20251231.htm) | Freigegeben |
| MET | [10-K · 2026-02-19](https://www.sec.gov/Archives/edgar/data/1099219/000109921926000013/met-20251231.htm) | Freigegeben |
| CRM | [10-K · 2026-03-02](https://www.sec.gov/Archives/edgar/data/1108524/000110852426000060/crm-20260131.htm) | Freigegeben |
| VCYT | [10-K · 2026-02-26](https://www.sec.gov/Archives/edgar/data/1384101/000138410126000010/vcyt-20251231.htm) | Freigegeben |
| MCHB | [10-K · 2026-03-17](https://www.sec.gov/Archives/edgar/data/1518715/000151871526000026/hmst-20251231.htm) | Freigegeben |
| GOOG/GOOGL | [10-K · 2026-02-05](https://www.sec.gov/Archives/edgar/data/1652044/000165204426000018/goog-20251231.htm) | Freigegeben |
| JBI | [10-K · 2026-03-04](https://www.sec.gov/Archives/edgar/data/1839839/000183983926000006/jbi-20260103.htm) | Freigegeben |
| ARBE | [20-F · 2026-03-27](https://www.sec.gov/Archives/edgar/data/1861841/000121390026035653/ea0283041-20f_arbe.htm) | Freigegeben |

## 3. Tesla
Vorher ein privater, nicht freigegebener Drittanbieter-Kommentar; keine offizielle Newsquelle im akzeptierten Register. Jetzt zwei Ledger-News, zwei Engine-News, eine erlaubte/ausgelieferte Meldung. Die offizielle Meldung vom 2. Oktober berichtet Q3-Produktion, Auslieferungen und Energiespeicher. Hinzu kommen zwei bestätigte Termine: Ergebnisveröffentlichung am 21. Oktober ohne erfundene Uhrzeit; Call am 21. Oktober 21:30 UTC / 23:30 Berlin. Keine behauptete Aufzeichnung oder generischer Website-Link als Webcast.

## 4. Palantir
0 → 8 erlaubte Meldungen. Die offizielle dynamische IR-Seite war mit dem vorhandenen Parser nicht nutzbar. Der öffentlich angebotene Q4-Nachrichtendienst liefert nun begrenzt abgerufene Metadaten zu Partnerschaften, Produkten und Management. Unbekannte Zeitzonen bleiben date-only. Kein Drittanbieter-Artikeltext.

## 5. XPeng
0 → 5 erlaubte Meldungen. Die historische ir.xpeng.com-Adresse ist nicht auflösbar; der offizielle ir.xiaopeng.com-RSS funktioniert. Aktuelle Auslieferungen und Q2-Ergebnisveröffentlichung sind sichtbar. Die neuere Pressemitteilung ersetzt keine normalisierten Finanzkennzahlen: deren Q4-2025-Stand bleibt ausdrücklich veraltet.

## 6. Die 20 Emittenten ohne freigegebene News
17 SOURCE FOUND + INGESTED; ACU und JPM SOURCE FOUND + TECHNICAL GAP; MS SOURCE FOUND + POLICY EXCLUDED. 60 geprüfte Metadaten: 53 neue Ledger-Einträge, sieben belegte HTTPS-Duplikatkorrekturen bei RARE. Kein unkontrollierter Backfill. Einzelbegründungen und URLs: [zero-news-source-review.json](../zero-news-source-review.json).

| Emittent | Ergebnis | Consumer-News nachher |
|---|---|---|
| ACU | SOURCE FOUND + TECHNICAL GAP | 0 |
| JPM | SOURCE FOUND + TECHNICAL GAP | 0 |
| TGT | SOURCE FOUND + INGESTED | 1 |
| BAC | SOURCE FOUND + INGESTED | 1 |
| PNC | SOURCE FOUND + INGESTED | 1 |
| MSFT | SOURCE FOUND + INGESTED | 1 |
| QCOM | SOURCE FOUND + INGESTED | 4 |
| GS | SOURCE FOUND + INGESTED | 2 |
| MS | SOURCE FOUND + POLICY EXCLUDED | 0 |
| AMZN | SOURCE FOUND + INGESTED | 2 |
| MET | SOURCE FOUND + INGESTED | 6 |
| CRM | SOURCE FOUND + INGESTED | 6 |
| TSLA | SOURCE FOUND + INGESTED | 1 |
| PLTR | SOURCE FOUND + INGESTED | 8 |
| META | SOURCE FOUND + INGESTED | 5 |
| ORCL | SOURCE FOUND + INGESTED | 3 |
| VEON | SOURCE FOUND + INGESTED | 2 |
| RARE | SOURCE FOUND + INGESTED | 8 |
| U | SOURCE FOUND + INGESTED | 4 |
| XPEV | SOURCE FOUND + INGESTED | 5 |

## 7. Wesentliche Ereignisse
Keine MATERIAL_SEC_EVENT-Einträge im Kohortenledger; daher keine versteckte Material-Event-Auslieferungslücke. Routine-SEC-Berichte bleiben Berichte. Aktuelles nutzt freigegebene Unternehmensmeldungen und belegte Ergebnis-/Periodenereignisse. Aus denselben geprüften Quellen wurden zusätzlich MET- und VEON-Ergebnisse/Calls bestätigt, mit korrekter Sommer-/Winterzeit. Alle sechs neuen bestätigten Termine sind quellenbelegt; Webcasts werden nicht als Aufzeichnungen ausgegeben.

## 8. Veraltete Finanzzahlen
TK, VEON, XPEV und ARBE bleiben vier Fälle. Die bestehenden SEC-companyfacts-Pfade liefern keinen neueren vergleichbaren normalisierten Quartalsdatensatz. Aktuellere Shares-Instantwerte sind keine Geschäftszahlen. Neuere ausländische Zwischenberichte benötigen eine gesondert validierte Normalisierung; keine handgeschriebenen Ersatz-KPIs. Die Kennzeichnung und der sekundäre Hinweis bleiben ehrlich.

## 9. Datumsqualität
20 → 0 Meldungen ohne Veröffentlichungsdatum. Apples Originalartikel weisen den Tag ausdrücklich aus: 18 zusätzlich übereinstimmende datePublished-Metadaten, zwei ausschließlich sichtbare Artikeldatumszeilen. Date-only bleibt date-only; Beobachtungs-/Atom-Änderungszeiten werden nicht umgedeutet.

## 10. Inhaltsauslieferung
45 Emittenten, 46 Aktien; neue Consumer-Generation 6c3fb74e36086a0b86dfdf3b. 339 Ledger-News → 339 Engine-News → 315 policy-erlaubte News → 273 Consumer-News. 24 bewusst ausgeschlossene Datensätze bei acht Emittenten: 21 nicht freigegebene Publisher-Meldungen (BAC, QCOM, NVDA, TSLA, VCYT, VEON, GOOG/GOOGL) und drei nicht exakt über HTTPS bestätigte RARE-Links. 42 zulässige, aber außerhalb der 180-Tage-Exportfrist liegende Datensätze bei zehn Emittenten (BOH, AOS, SBSI, CAC, ONCY, HNRG, MCHB, AMPY, GOOG/GOOGL, JBI). Drei Emittenten ohne Ledger-News. Keine ungeklärte Transportlücke. Die [45 Einzelzeilen einschließlich sämtlicher Ausschlussgründe](end-to-end-cohort-audit.json) sind mit den 368 tatsächlichen Browserfällen verbunden. **DATA_EXPORTED_BUT_NOT_RENDERED: 0 Emittenten / 0 Datensätze.** Alle 86 öffentlichen Dateien müssen bytegenau dem freigegebenen Manifest entsprechen.

## 11. Produktionsprüfung
Bestanden auf der echten geschützten Produktion: [Run 37817852398](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/37817852398). Browser-SHA `5ee2ae4acd14c4a3bac29da5a81af4dd7c53bc97`, Consumer `6c3fb74e36086a0b86dfdf3b`. Alle 46 Aktien × 390/430/768/1440 px × dark/light = **368 Fälle**; zusätzlich 216 Discover-/Quant-Responsive-Fälle, acht Dark-Regressionen und Prüfungen außerhalb der Kohorte. Keine JavaScript-Fehler oder horizontalen Überläufe; IDs, Datenstand, Navigation, Quellen-Touchtargets und eingeklappte Nachweise geprüft. Alle 273 News sind einschließlich sekundärer/älterer Einträge gerendert; drei aktuelle Items bleiben die initiale Obergrenze.

Nach dem Browserlauf nochmals alle 86 Consumer-Dateien bytegenau gegen den freigegebenen Export geprüft. Die inzwischen regulär aktualisierte Produktion meldet `03adf60a6453ddee86cbced1417b0ac940f002ba`: vollständiger Git-Tree-Vergleich weist ausschließlich 1317 Marktdatenpfade unter quant/data/market/ aus. Keine Company-Intelligence-, UI-, Navigations- oder Zugriffsänderung. [Versionsvergleich](post-review-production-diff.json). Der frühere Fast-Check startete noch auf cb6e9eb592bf84ee1e7bcc0a971188b93073da39; Consumer-Generation während aller Prüfungen unverändert. 15 vorzeitig abgebrochene Anfragen bei legitimer Hydration-Neudarstellung sind im Bericht enthalten; jede endgültige Darstellung lieferte AVAILABLE und korrekte Inhalte. Keine fehlgeschlagenen Assertions wiederholt oder abgeschwächt.

Manuell gegengelesen: TSLA, PLTR, XPEV, AAPL, NVDA, MSFT, GOOG, GOOGL, ACU, JPM, MS, TK, VEON, ARBE. BOH/SBSI/AMPY decken die anhand vorhandener Kurs-/SEC-Aktienzahlquellen berechneten Mid-/Small-/Micro-Cap-Bänder ab. ACU zeigt nur belegtes Profil; MS keine leere News-Sektion; GOOG/GOOGL denselben Emittenten. TSLA zeigt keine konkurrierende Q3-Schätzung neben dem bestätigten Termin; XPEV trennt frische Ergebnis-News von veralteten normalisierten Bilanzzahlen.

Browserprüfung mit Chromium, kein physischer iPhone-/Safari-Test. 30 echte Produktionsscreenshots sind dauerhaft hier gespeichert; Kapitelbilder blenden nur für die Aufnahme die Navigation aus, Viewportbilder erhalten die reale Navigation. Live: [Tesla öffnen](https://research.visionuniverse.de/discover/#/s/US_REAL/TSLA), bestehender Research-Zugang erforderlich.

| Aktie | 390 px dunkel | 430 px dunkel | Desktop dunkel | 390 px hell |
|---|---|---|---|---|
| TSLA | [Screenshot](screenshots/after-TSLA-390-dark-chapter.png) | [Screenshot](screenshots/after-TSLA-430-dark-chapter.png) | [Screenshot](screenshots/after-TSLA-1440-dark-chapter.png) | [Screenshot](screenshots/after-TSLA-390-light-chapter.png) |
| AAPL | [Screenshot](screenshots/after-AAPL-390-dark-chapter.png) | [Screenshot](screenshots/after-AAPL-430-dark-chapter.png) | [Screenshot](screenshots/after-AAPL-1440-dark-chapter.png) | [Screenshot](screenshots/after-AAPL-390-light-chapter.png) |
| NVDA | [Screenshot](screenshots/after-NVDA-390-dark-chapter.png) | [Screenshot](screenshots/after-NVDA-430-dark-chapter.png) | [Screenshot](screenshots/after-NVDA-1440-dark-chapter.png) | [Screenshot](screenshots/after-NVDA-390-light-chapter.png) |
| PLTR | [Screenshot](screenshots/after-PLTR-390-dark-chapter.png) | [Screenshot](screenshots/after-PLTR-430-dark-chapter.png) | [Screenshot](screenshots/after-PLTR-1440-dark-chapter.png) | [Screenshot](screenshots/after-PLTR-390-light-chapter.png) |
| XPEV | [Screenshot](screenshots/after-XPEV-390-dark-chapter.png) | [Screenshot](screenshots/after-XPEV-430-dark-chapter.png) | [Screenshot](screenshots/after-XPEV-1440-dark-chapter.png) | [Screenshot](screenshots/after-XPEV-390-light-chapter.png) |

## 12. Verbleibende Lücken
ACU: offizieller Quellzugriff HTTP 403/robots, kein Umgehen. JPM: dynamische IR-Seite ohne bisher nutzbare statische Metadaten; periodischer Bericht dennoch in Aktuelles. MS: offizielle robots-Regeln schließen Press-Ingestion aus. Vier ausländische Finanznormalisierungen fehlen. Vollständige Call-/Transkript-Abdeckung wird nicht behauptet. Keine bezahlten Provider oder schwächere Quellenregeln. Original-Newsüberschriften bleiben teilweise englisch; keine unkontrollierte Live-Übersetzung. Einzelne bestehende Unternehmensmeldungen sind weniger anlagerelevant als Ergebnis-/Betriebsupdates; eine spätere gezielte Relevanzprüfung ist sinnvoll.

## 13. Nächste Empfehlung
Die Profile und Prioritäts-News sind wesentlich nützlicher. Als nächste gesondert freizugebende Arbeit bietet sich ein kleiner geprüfter Folge-Kreis an, parallel zu gezielten Lösungen für die drei News- und vier Finanzlücken. Keine Freigabe aller 5.120 Payloads; diese Aufgabe hält die Kohorte bei 46 Aktien. Die abschließende Produktionsabnahme ist bestanden. Erweiterung bleibt eine separate Freigabe; aktuell weiterhin ausschließlich 46 Aktien.

## Daten, Speicher und Rückfall
Original accepted-20261006-21cc611a43b06f488418b58a bleibt unverändert. Die additive vollständige 5.120-Unternehmen-Ableitung 6d4f35263848d87c4d3549d8 ist im getrennten privaten Namespace content-top46-eaf1af81cd0ffd8425db4ba6 gespeichert. Remote-Archiv-Hash: 6977c191d5c6956e1fabec5512c7cd48e62ec6d2cf156ace7c87a7c601d41413. Frischer Runner-Restore reproduziert alle Tabellen-/Identitätshashes, den vollständigen Export und alle 86 Consumer-Bytes. Nachweise: R2-Run 37794973786, Versuch 2. Private operative Zeilen und Archive sind nicht Bestandteil dieser Dokumentation.

Rollback: production_release=disable im Company-Workflow, danach pages-release.yml mit company_intelligence_off=true. Die tatsächlichen Anwendungen am 8. Oktober (Runs 37805718354 und 37812145369) bestanden jeweils acht Discover-/Quant-Fälle bei 390/430/768/1440 mit null Consumer-Anfragen. Alte D700-Generation und deren Approval/Manifest bleiben für die geprüfte Wiederherstellung verfügbar; private accepted-Generation bleibt unangetastet.

Tests: 675 Company-Python-Tests, 79 Company-Node-Tests; 490 Quant-Python, 65 Zugriff/Resource/Ask/Academy/Worker und 32 Release-Python. Core-Produktlauf: 3.114 Tests, 3.104 bestanden, fünf übersprungen, fünf unabhängig identisch auf dem Produktionskontrollstand reproduzierte Altfälle; keine abgeschwächten Assertions. Nachträglicher CI-Baselinefehler auf main wurde in PR #524 behoben und auf main erfolgreich geprüft. PR #530 ergänzte die Ladeprüfung und erkannte die doppelte Tesla-Schätzung. Die zunächst verlangte Ereignis-Beobachtung war wegen document.open()/write() der bestehenden Zugriffssperre fehlerhaft; PR #538 reproduziert die reale Sperre und wartet auf Netzwerk-Hydration plus exakte Daten-Marker. Falsche IDs/Zeitstempel werden weiterhin abgelehnt. Alle Tests und die unabhängige Baselineprüfung bleiben erhalten; vollständige Git-Historie mit lazy historischen Blobs reduzierte den Runner-Checkout auf 57 Sekunden. Dieselbe kleine Korrektur blendet eine Schätzung erst bei einer bestätigten Ergebnisveröffentlichung desselben Emittenten und Fiskalzeitraums aus; Rohdaten und Methodik bleiben erhalten.


Messvergleich zum gemeinsamen Stichtag 2026-10-08T14:36:50Z: Profile 31→45; News-Emittenten 25→42; 30-Tage-News 18→33; 90-Tage-Aktuelles 27→43; veraltete Finanzdatensätze 4→4; News ohne Datum 20→0; TSLA 0→1 News (+2 bestätigte Termine), PLTR 0→8, XPEV 0→5. Keine Addition alter Ledgers.
