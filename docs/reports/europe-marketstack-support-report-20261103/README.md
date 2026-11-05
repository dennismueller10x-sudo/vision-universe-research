# Europa: Kurslücken bei Marketstack – Ursachen, Wirkung, Support-Anfrage (03.11.2026)

Rein offline. **0 Marketstack-Anfragen.** Kein Preis, keine Session, keine Quarantäne, keine Identität, kein Kalender und kein Gate wurde geändert. Es stehen keine lizenzierten Kurse in diesem Ordner, nur Zählungen, Daten, Symbole und Statuscodes.

- Zahlen: `europe_gap_impact_report.json` (SHA-256 `6a9ad6ee…85c6c1`), erzeugt von `scripts/marketstack/europe-gap-impact-report.mjs`. Zwei Läufe ergaben identische Bytes.
- Support-Anfrage auf Englisch, fertig zum Senden: [SUPPORT_REQUEST.md](SUPPORT_REQUEST.md).
- Stand der Daten: `main` @ `f5886a7f72` (Katalog `fc1d78b2…`, 449 Langreihen, `generatedAt` 2026-11-03T16:07:47Z).

## Quellen und Regeln

| Quelle | Inhalt | Bindung |
| --- | --- | --- |
| `discover/data/europe/{catalog,manifest}.json`, `series-long/*`, `series/*` | veröffentlichte Reihen (das, was Nutzer sehen) | SHA-256 jeder Datei, gegen das Manifest geprüft |
| `docs/reports/europe-continuity-449-20261012/europe_449_gap_inventory.json` | Ursache je fehlender Session bis 2026-10-09 (#644/#658-Ledger, öffentlicher Teil) | `06b533cd…` |
| `…/europe_449_calendar_audit.json` | geprüfter Börsenkalender (exchange_calendars 4.13.2) 2010-01-04 bis 2026-10-30 | `ee77617e…` |
| `docs/reports/europe-integrity-449-20261013/README.md` | #644: 3. Oktober 2011–2013 offiziell offen, 241 UNKNOWN = gelieferte ungültige Schlusskurse | `b08845b9…` |
| `marketstack_diagnostics_public_summary.json` (#1285, Lauf 41661792038) | Status, Header, Zeilenzahlen der 77 Anfragen | `06d58b29…` |

Produktregeln, unverändert wiederverwendet:

- **Deutschland:** `listing.mic === "XETR"`. Im Katalog deckungsgleich mit `identityAdmission.issuerCountry === "DE"` (319 = 319 = Schnittmenge).
- **Zeiträume:** `core/chart-history.js` (1Y 366, 3Y 1096, 5Y 1827 Kalendertage zurück ab letzter Beobachtung, MAX = ganzes Anzeigefenster). **Angezeigt** heißt: `core/europe-discover-eligibility.js#chart(…, range).ready` und `chart-history.available()` (≥ 95 % Spanne, ≥ 5 Punkte).
- **Lückenlos gültig:** angezeigt, 0 fehlende Sessions und 0 Brüche im Fenster (`visualQualityStatus` CLEAN, `scripts/discover/europe-chart-continuity.mjs`). Zusätzlich gezählt: **CHART_READY im Fenster** (keine Lücke > 5 Sessions, kein Bruch, kein veraltetes Ende, Fehlquote ≤ 2 %).
- **Sichtbare Lücke:** eine zusammenhängende Folge fehlender Kalendersessions zwischen zwei angezeigten Punkten. Ein veraltetes Reihenende wird getrennt gezählt. Ein Ende innerhalb der Frischetoleranz (veröffentlicht, `sessionLag` ≤ 3) zählt nicht als Lücke.
- **Kalender:** geprüfter Kalender innerhalb seiner Abdeckung, danach der Regelkalender `core/europe-exchange-calendar.js`.

## 1. Betroffene Aktien

| | Europa | davon Deutschland (XETR) |
| --- | ---: | ---: |
| Aktien | 449 | 319 |
| mit mindestens einer historischen Kurslücke | **449** | **319** |
| mit veraltetem Reihenende | 14 (13 × XPAR, AMI.DE) | 1 (AMI.DE) |

Alle 10 Börsen sind betroffen: XAMS 20/20, XBRU 6/6, XCSE 17/17, XETR 319/319, XMAD 10/10, XMIL 10/10, XPAR 39/39, XSTO 2/2, XSWX 14/14, XWBO 12/12.

## 2. Wirkung je Zeitraum

| Zeitraum | angezeigt | betroffen (alle / angezeigt) | lückenlos gültig | CHART_READY im Fenster | fehlende Sessions |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1Y | 431 | 449 / 431 | **0** | 52 | 15.066 |
| 3Y | 417 | 449 / 417 | **0** | 26 | 22.330 |
| 5Y | 397 | 449 / 397 | **0** | 17 | 30.804 |
| MAX | 435 | 449 / 435 | **0** | 27 | 46.946 |

Deutschland: angezeigt 314 / 301 / 284 / 318, betroffen jeweils 319, **lückenlos gültig 0** in jedem Zeitraum, CHART_READY 5 / 25 / 16 / 26.

Keine einzige europäische Aktie hat in irgendeinem Zeitraum eine lückenlose Reihe. Selbst 1Y scheitert überall, weil die Tage 2026-01-06 (442 Aktien) und 2026-09-17 (441 Aktien) fast börsenweit fehlen. Hinweis: Das veröffentlichte 3Y/5Y-Anzeigeprädikat übernimmt die MAX-Statistik (`rematerialize-europe-continuity.mjs`). Die Fensterwerte oben sind daher je Fenster nachgerechnet. Der berechnete MAX-Status stimmt für alle 449 mit dem veröffentlichten überein.

## 3. Anzahl und Länge der Lücken

- **11.724 sichtbare Lücken** mit 46.731 Sessions, dazu 215 Sessions veraltetes Ende. Zusammen sind das 46.946.
- **Länge (Sessions):** min 1, Median 1, p90 4, max 2.270.
- **Lücken je Aktie:** min 2, Median 26, p90 32, max 86. Deutschland: min 2, Median 26, p90 29, max 86.
- **Fehlende Sessions je Aktie:** min 2, Median 69, p90 81, max 2.320.
- **Sichtbare Anzeigebrüche** (Linie wird getrennt): 797, je Aktie Median 2, max 6.

Top 20 nach fehlenden Sessions (Lücken / fehlend / längste; Hauptursache):

| Symbol | Lücken | fehlend | längste | Hauptursache |
| --- | ---: | ---: | ---: | --- |
| DGR.DE | 13 | 2.320 | 2.270 | Identity-Hold 2.250 |
| KA8.DE | 14 | 2.134 | 2.076 | Identity-Hold 2.058 |
| RCMN.DE | 14 | 1.867 | 1.815 | Identity-Hold 1.799 |
| IUR.DE | 18 | 1.845 | 1.794 | Identity-Hold 1.778 |
| MSAG.DE | 14 | 1.797 | 1.745 | Identity-Hold 1.727 |
| SLSA.DE | 28 | 1.632 | 1.563 | Identity-Hold 1.563 |
| HP3A.DE | 20 | 1.242 | 1.220 | Identity-Hold 1.220 |
| 93M1.DE | 31 | 1.064 | 997 | Identity-Hold 997 |
| ISHA.DE | 32 | 893 | 843 | Identity-Hold 843 |
| EMH.DE | 59 | 826 | 739 | Identity-Hold 722 |
| CEK.DE | 31 | 824 | 757 | Identity-Hold 757 |
| M3V.DE | 31 | 819 | 743 | Identity-Hold 743 |
| ABX.DE | 86 | 353 | 21 | keine Provider-Antwort 313 |
| LR.PA | 35 | 325 | 256 | keine Provider-Antwort 316 |
| WOLF.DE | 63 | 234 | 9 | keine Provider-Antwort 226 |
| NN6.DE | 50 | 214 | 101 | Identity-Hold 101 |
| B7E.DE | 29 | 196 | 126 | Identity-Hold 126 |
| MBQ.DE | 28 | 174 | 101 | Identity-Hold 101 |
| NBG6.DE | 29 | 173 | 101 | Identity-Hold 101 |
| SVE.DE | 30 | 172 | 101 | Identity-Hold 101 |

Häufigste gemeinsame Ausfalltage (Aktien; Börsen):

| Datum | Aktien | Börsen | Ursache |
| --- | ---: | --- | --- |
| 2026-01-06 | 442 | 9 (alle außer XSTO, dort Feiertag) | Provider |
| 2026-09-17 | 441 | alle 10 | Provider |
| 2026-09-07 | 434 | alle 10 | Provider |
| 2024-06-11 | 427 | alle 10 | Provider |
| 2023-06-29 | 421 | alle 10 | Provider |
| 2023-06-13 | 419 | alle 10 | Provider |
| 2023-08-10 | 395 | alle 10 | Provider |
| 2023-08-03 | 380 | alle 10 | Provider |
| 2023-06-27 | 375 | alle 10 | Provider |
| 2023-07-11 | 371 | alle 10 | Provider |
| 2023-07-31 | 371 | 9 (ohne XSWX) | Provider |
| 2023-06-28 | 341 | XETR, XMIL, XPAR | Provider |
| 2026-03-27 | 341 | XAMS, XBRU, XETR, XMIL, XPAR | Quarantäne |
| 2026-05-18 | 341 | 9 | Quarantäne 336, Provider 5 |
| 2026-04-09 | 335 | XAMS, XETR, XMIL, XPAR | Quarantäne 332, Provider 3 |
| 2023-06-01 | 333 | XETR, XPAR | Provider |
| 2023-08-07 | 333 | XETR, XPAR | Provider |
| 2023-05-30 | 332 | XETR, XPAR | Provider |
| 2026-04-27 | 324 | XETR, XMIL, XPAR | Quarantäne |
| 2026-05-12 | 320 | XETR, XMIL, XPAR | Quarantäne 318, Provider 2 |
| 2026-05-07 | 319 | XETR, XMIL, XPAR | Quarantäne |
| 2026-05-26 | 318 | XAMS, XETR, XPAR | Quarantäne |
| 2026-05-06 | 315 | XBRU, XETR, XMIL | Quarantäne |
| 2026-05-15 | 315 | XETR, XMIL, XPAR | Quarantäne 314, Provider 1 |
| 2026-05-21 | 314 | XETR, XMIL, XPAR | Quarantäne |

„Provider“ umfasst hier `PROVIDER_NO_DATA` und `CALENDAR_DEVIATION_SUSPECTED`. Die exakte Aufteilung je Tag steht im JSON (`q3.sharedOutageDaysTop25`). Dazu kommt der zusammenhängende Block **2025-05-09 bis 2025-08-28** auf XAMS, XBRU, XCSE, XMAD, XMIL, XPAR, XSWX und XWBO (35–39 MIC-Tage je Börse, XETR nicht betroffen). Die 420 marktweiten MIC-Tage stehen unter `q4.clusters.marketWideDatesByMic`.

## 4. Ursachen ohne Doppelzählung

Jede fehlende Session hat genau eine Hauptursache. Die Rangfolge ist: veraltetes Ende → Ledger-Klasse → Kalenderprüfung.

| Hauptursache | Europa | Deutschland | Regel |
| --- | ---: | ---: | --- |
| Kalenderabweichung (vermutet, kein Handelstag?) | 3.538 | 0 | Provider leer **und** jede berechtigte Aktie der MIC fehlt (#1285 `calendarRecheck`), ohne offiziellen Offen-Beleg |
| Historischer Identity-Hold | 18.098 | 18.098 | Quarantäne innerhalb eines `IDENTITY_QUARANTINE_INTERVAL` (reproduziert #644/#658 exakt) |
| Symbolwechsel (vermutet) | 208 | 0 | 13 Paris-Titel × 16 Sessions nach 2026-10-09, HTTP 422/406 auf `.PA` |
| Quarantäne (geliefert, gesperrt) | 13.119 | 12.162 | 12.871 ungültige/OHLC-Quarantäne + 241 gelieferte ungültige Close (#644) + 7 zurückgehaltene AMI.DE-Sessions (Kurssprung) |
| Fehlende Provider-Antwort | 11.983 | 8.101 | 11.960 `PROVIDER_MISSING_DAY` + 23 im Tageslauf seit 2026-10-09 |
| Unerklärt | **0** | **0** | |
| **Summe** | **46.946** | **38.361** | |

Abgleich: 15.498 + 30.969 + 241 (Ledger bis 2026-10-09) + 23 (Tageslauf) + 215 (veraltete Enden) = 46.946. Jedes Ledger-Datum im Anzeigefenster wird vom Kalender wiedergefunden (0 Abweichungen). Die 23 neuen Fehltage stimmen mit `refresh.missingSessions` überein.

**Überschneidungen** (Nebenmerkmale, sie ändern keine Hauptursache):

- 11.463 provider-leere Sessions liegen auf 420 **marktweiten** MIC-Tagen (≥ 90 % der Aktien einer Börse fehlen; 85 verschiedene Daten). Davon sind 3.538 als Kalender vermutet, weil alle fehlen. Auf den übrigen **7.925** hat mindestens eine Aktie derselben Börse geliefert, also kennt der Provider die Session.
- 11.872 Sessions liegen in gemischten Lücken (Quarantäne und Provider-leer in einer Lücke).
- 105 provider-leere Sessions liegen innerhalb eines Identity-Intervalls.
- 4.419 provider-leere Sessions betreffen Titel mit Katalog-`identity.status = BLOCKED` (189 Titel).
- Unser **Regelkalender** weicht in der Historie vom geprüften Kalender ab: XETR 13 (Pfingstmontag 2015–2021, 3. Oktober 2014–2019, 2017-10-31), XWBO 59, XMAD 4. Er führt dort Feiertage als Handelstage. Dieser Bericht nutzt den geprüften Kalender, sonst kämen 3.977 Scheinlücken hinzu. Die veröffentlichten Fenster sind nicht betroffen, weil die Abweichungen vor dem 1Y-Fenster liegen.

## 5. Was ausgeschlossen ist und was nicht

**Belastbar ausgeschlossen:**

| Ursache | Beleg |
| --- | --- |
| Query-, Paginierungs- und Mapping-Fehler | #644: 449 vollständige Historien, 2.009 Seiten, 1.688.229 Zeilen; offset/count/total, exaktes Symbol/MIC, Fenster und Sortierung geprüft. #658: 7.812 gezielte `/eod`-Anfragen in 3 Varianten (gefiltert exakt, breiteres Datum, ohne `exchange`). Alle 18.641 Fehltage fehlen in jeder Variante, 0 wiedergewonnen. |
| Verbindungsverlust | #644: der 3. Oktober 2011–2013 fehlt in 1.138 Original-HTTP-Seiten, also eine Lücke auf der Leitung des Providers |
| Konto oder Berechtigung | #1287: BN/OR/SAN.PA 200, 10/10 Überlappungstage identisch, 16 neue Sessions |
| Andere Preisrouten | #1287: `/eod/{date}`, `/exchanges/{mic}/eod/{date}` und `/tickers/{symbol}/eod/{date}` gewinnen 0/6 Ziel-MIC-Tage; die Kontrollen sind 18/18 exakt |
| Split- oder Dividendenroute als Lückenursache | OpenAPI: `/splits` und `/dividends` nur US/SHG; `/tickers/EUZ.DE/splits` liefert 0 Zeilen trotz offiziellem 3:1-Split im August 2025 |
| Feiertag auf 7.925 marktweiten Sessions | andere Aktien derselben Börse haben am selben Tag geliefert |
| Kalenderfehler im Produkt | 0 genehmigte Beobachtungen außerhalb des geprüften Kalenders; offizielle FWB-Kalender 2011–2014/2015/2017/2018 und Xetra 2026 stimmen |

**Ausdrücklich NICHT ausgeschlossen:**

- **Echte Schließtage** auf 305 MIC-Tagen (3.538 Sessions), an denen jede Aktie fehlt. Das braucht einen offiziellen Börsenkalender.
- **Historische Identität** (18.098 Holds). Das braucht einen Nachweis von Emittent, Börse oder Register; Marketstack liefert keine Symbol- oder ISIN-Historie.
- **Paris `.PA` → `.XPAR`:** ISIN, MIC und Überlappungskurse sind nicht geprüft, die Antworten liegen im versiegelten Archiv. XPAR-Datumsrouten sind ungetestet.
- Ob Historien unter einem **anderen Symbolformat** (z. B. `.XPAR`, `.XETRA`) Lückendaten enthalten. Nie getestet.
- Ob HTTP 422 `no_valid_exchange_provided` „keine Daten an diesem Tag“ bedeutet. Undokumentiert.
- Wirtschaftliche Ursachen (Aussetzung, Delisting): UNKNOWN.
- OHLC gegen das #658-Archiv: Schlüssel nötig, Aufbewahrung 7 Tage.

## 6. Abfragen gegen die v2-Dokumentation

Geprüft gegen die OpenAPI `https://api.swaggerhub.com/apis/apilayer-863/MarketstackAPIv2/2.0.0/swagger.json`. Am 03.11.2026 neu geladen; SHA-256 `9136449e…ab4c8`, identisch mit #1285. Geprüfter Code: `providers/marketstack/client.js`, `audit-adapter.js`, `scripts/marketstack/europe-discover-refresh.mjs` (nur gelesen) und `europe-marketstack-diagnostics-once.mjs`.

| Punkt | Dokumentation | Code | Befund |
| --- | --- | --- | --- |
| Basis-URL | Server `https://api.marketstack.com`, Pfade `/v2/…` | `https://api.marketstack.com/v2`, nur HTTPS, Host fest, `redirect:'error'` | korrekt |
| Auth | `access_key` als Query-Parameter | wird erst in `fetch` gesetzt, Logs redigiert | korrekt |
| `symbols` | kommagetrennt, Pflicht bei `/eod` | ein Symbol je Anfrage (Tageslauf), Batches ≤ 100 (`requestBatches`); das Komma wird als `%2C` kodiert | funktioniert (Kontrolle mit 3 Symbolen: 78 Zeilen); eine Höchstzahl an Symbolen ist nicht dokumentiert |
| Symbolformat | **nicht dokumentiert** für europäische Börsen; nur der Hinweis zu `.`→`-` bei Intraday und auf `supported_tickers_2.csv` | Provider-Symbole aus dem Provider-Verzeichnis (`.DE .PA .AS .SW .MI .CO .VI .MC .BR .ST`) | **Integrationsrisiko:** 13/39 Paris-Titel liefern auf `.PA` 422/406, das Verzeichnis führt `{X}.XPAR`; 26 andere `.PA`-Titel laufen weiter. Keine Ankündigung, keine Historienzusage. |
| `exchange` | „Filter … identified by its MIC“ | MIC des Listings, z. B. `XETR`, `XPAR` | korrekt; wird ein Symbol nicht mehr erkannt, folgt 422 `no_valid_symbols_provided` |
| `date_from`/`date_to` | `YYYY-MM-DD` | `YYYY-MM-DD`; Historie ab `1900-01-01` | korrekt; die Daten beginnen laut Doku „from 2000 onwards for most major tickers“ |
| `limit` | 1–1000, Standard 100 | immer gesetzt, ≤ 1000 geprüft | korrekt |
| `offset` | ≥ 0 | Paginierung prüft offset, count, total und wiederholte Seiten | korrekt |
| `sort` | `ASC`/`DESC`, Standard DESC | `ASC` | korrekt |
| Datum und Zeitzone | `date` als ISO 8601 (z. B. `…T00:00:00+0000`) | Handelstag = die ersten 10 Zeichen, keine Umrechnung | korrekt; die Kontrolltage treffen exakt. Restrisiko: Zeitstempelkonvention ist nicht dokumentiert. |
| Antwortfelder | `symbol, exchange, date, open…close, volume, adj_*, split_factor, dividend, price_currency` | Zeilen mit fremdem Symbol oder MIC werden abgewiesen, alle Felder bleiben roh erhalten | korrekt |
| Fehlercodes | dokumentiert 401/403/404/422/429/500/503 | generische Auswertung von `error.type` | **Abweichung beim Provider:** HTTP **406** `the_requested_data_is_not_available` ist nicht dokumentiert; die Fehlertypen `no_valid_symbols_provided` und `no_valid_exchange_provided` ebenfalls nicht |
| `/exchanges/{mic}/eod/{date}` | „weekend or market holiday: no data is returned“ | nur Diagnose | **Abweichung:** an Lückentagen kommt 422 `no_valid_exchange_provided` statt einer leeren Antwort |
| `/splits`, `/dividends` | Abdeckung nur US/SHG | #644/#658 haben 98 Anfragen für Europa gestellt | **unser Fehler (Kosten):** Anfragen außerhalb der dokumentierten Abdeckung; die leeren Antworten tragen keine Information |
| Verbrauchsheader | nicht dokumentiert | `client.js` liest `x-ratelimit-limit`, `x-ratelimit-remaining`, `x-request-count` | **unser Fehler (Beobachtbarkeit):** der Provider sendet diese Header nicht. Er sendet `x-increment-usage`, `x-quota-limit`, `x-quota-remaining`, `x-ratelimit-*-second`. Der Tageslauf protokolliert die Abrechnung deshalb nicht; nur der Diagnoselauf hat sie erfasst. |
| Rate-Limit | nicht dokumentiert | 250 ms Abstand (4/s) | passt zum beobachteten Limit von 5/s |

Keine der Abweichungen erklärt die 46.946 fehlenden Sessions; dafür gibt es die Belege aus #644 und #658. Bei Paris bleibt der Symbolwechsel eine **mögliche Integrationsursache** für die 208 Ende-Sessions.

## 7. Credit-Abrechnung (Lauf 41661792038, beobachtet)

| HTTP | Anfragen | gebuchte Credits (`x-increment-usage`) |
| --- | ---: | ---: |
| 200 | 50 | 52 (49 × 1, 1 × 3) |
| 406 | 16 | 16 (je 1) |
| 422 | 11 | 11 (je 1) |
| **Summe** | **77** | **79** |

- Abgerechnet wird **pro Symbol:** `symbols=BN.PA,OR.PA,SAN.PA` kostete 3.
- **Fehlerantworten kosten 1 Credit** (406 und 422).
- Eine Verzeichnisseite mit 1.000 Zeilen kostet 1, ebenso eine leere 200-Antwort.
- Kontingent laut `x-quota-limit`: 100.000; Stand von 99.089 auf 99.010. Der Header zeigt den Stand vor der Buchung der aktuellen Anfrage. Rate-Limit `x-ratelimit-limit-second` = 5.
- Ob jede **Seite** einer mehrseitigen Historie je Symbol erneut kostet, ist nicht beobachtet. Die tatsächliche Abrechnung der 9.277 Anfragen aus #658 ist UNKNOWN.

## Nicht exakt bestimmbar

- **3.143 provider-leere Sessions** vor dem genehmigten Beginn (privater Expanded-Span-Ledger, verschlüsselt). Sie sind nicht sichtbar und hier nicht enthalten.
- **Aufteilung der 12.871 Nicht-Identity-Quarantänen** in 12.345 ungültige Close und 526 OHLC-Kandidaten je Datum. Nur die Summen sind öffentlich (#644); die Datumsliste ist privat.
- **Paris-Mapping** (ISIN/MIC von `{X}.XPAR`): liegt im versiegelten Archiv `marketstack-diagnostics-sealed-41661792038`, ohne Schlüssel nicht lesbar.
- **Echte Schließtage** der 305 vermuteten Kalendertage: offizielle Kalender fehlen. Die Zahl 3.538 ist eine Obergrenze für Kalenderursachen, kein Nachweis.
- Die **Credit-Abrechnung von #644/#658**: Header wurden damals nicht erfasst.

## Reproduktion

```bash
git show origin/claude/europe-history-marketstack-gaps:docs/reports/europe-marketstack-diagnostics-20261103/marketstack_diagnostics_public_summary.json > /tmp/diag.json
node scripts/marketstack/europe-gap-impact-report.mjs --out=/absolute/dir --diagnostics=/tmp/diag.json
node --test scripts/marketstack/tests/europe-gap-impact-report.test.mjs
```

Das Skript liest nur committete öffentliche Artefakte und schreibt ausschließlich nach `--out`. Im Repository verweigert es jedes Ziel außer diesem Ordner. Jede Eingabe ist mit SHA-256 unter `sources` gebunden. Läuft es auf einem neueren Datenstand, ändern sich die Hashes und die Zahlen ab 2026-11-03.
