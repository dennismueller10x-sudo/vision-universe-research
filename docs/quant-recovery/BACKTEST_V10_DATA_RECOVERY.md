# V10 – Datenrettung

Stand 28.10.2026, Branch `claude/vision-quant-v10-backtest-4ho3rd` auf main `a1a0dd972a`. Keine Datei unter `*/data` wurde von Hand geändert oder mitgebracht; der Produktadapter `weekly-real-adapter.cjs`, `corporate-action-evidence.js`, Workflows und Frontend sind unverändert. Alle Erweiterungen sind opt-in-Research-Register hinter `research-weekly-loader.cjs`; ohne Option ist der Loader für alle 6.190 Reihen byte-identisch zum Adapter.

## A – V9-Korrekturen: Code, Erzeuger, Datenbestand

Beleg: [materialization-status-1.0.0.json](v10/data-recovery/materialization-status-1.0.0.json), Skript `scripts/quant/v10/data-recovery/materialization_status.py` (ohne Schattenlauf erneut ausführbar).

| Korrektur | Code | Erzeuger wirksam | materialisiert im Bestand |
|---|---|---|---|
| SEC P1–P4 (#1043, normalization_logic 1.14.0) | ja | **ja**: Faktbuch-Tageslauf 28.10. 13:02 UTC schrieb 68 Emittenten mit 1.14.0, neue Codes `FUTURE_PERIOD_END`/`IMPLAUSIBLE_FILING_FY` sichtbar (JAKK, VMI); Schattenlauf des Consumer-Erzeugers (siehe unten) | **nein**: 5.063/5.063 Consumer-Bundles 1.13.0; 29/29 Emittenten mit veröffentlichten Zeilenänderungen `PENDING_PRODUCER_RUN`; Discover-STX zeigt weiter Marktkap. 137,0 Mrd. aus `sharesFy 2027`, ebenso `factor-evidence-v1` |
| PZZA 2:1 2013 (#1042) | ja (Ergänzungsregister, Hash unverändert) | Schatten: Adapter vorher `CORPORATE_ACTION_UNRESOLVED`, nachher `CLEAN` (+1 Reihe, 1.742 Wochen ab 1993) | **nein**: sha256 = V9-Vorher-Stand, Ex-Woche 0,512 |

**Schattenlauf SEC (aktuelle SEC-Daten, 28.10.2026):** `cli.py consumer --ciks` für 33 Emittenten, einmal mit dem Code vor #1043 (1.13.0), einmal mit diesem Stand (1.14.0), identische gecachte companyfacts-Antworten (33 Abrufe):
- Fiskaljahrlabels repariert: **PRTH, STX, WTBA**; 12 zukunftsdatierte Zeilen bei **AAL, ASLE, AXR, HVII, LEGH, PFIS, PMT** entfernt, 0 verbleibend.
- Aktienzahlen 9/9 wie im V9-Schatten (STX 212.677.178 → 226.644.518).
- Originalbelege der Filer-Fehler (companyfacts-API, Hash im Beleg): STX 10-K `0001137789-25-000157` mit fy 2027 bei Periodenende 2025; WTBA 10-K `0001166928-18-000014` fy 2107; PRTH 10-K/10-Q mit fy 43465 (Excel-Seriennummer); PMT 22 Meldungen mit Kontexten bis 2029.

**Warum nicht materialisiert:** #1042/#1043 wurden heute gemergt. Die regulären Läufe übernehmen es ohne Eingriff: `long-series.yml` Sa 31.10.2026 07:40 UTC (Cron `40 7 1-7 * 6` = jeder Samstag), `sec-consumer-fundamentals.yml` Mo 02.11.2026 07:30 UTC, danach `product-intelligence-materialization.yml`. V10 hat **keinen** Produktionslauf auf main ausgelöst (jeder Lauf veröffentlicht Produktdaten; das ist eine Produktfreigabe, keine Research-Entscheidung). Eine Nachprüfung am 02.11.2026 13:30 UTC ist eingeplant.

**Erzeuger-Befund:** `scripts/quant/cli.py consumer` schreibt `quant/data/sec/consumer_coverage.json` immer ins Repository, auch mit `--out` (Verstoß gegen die `--out`-Regel). V10 hat die Datei sofort zurückgesetzt und Schattenläufe aus getrennten Worktrees gefahren. Reparatur gehört in einen SEC-PR.

### A3 – Wirkungsmatrix

| Bereich | geänderte Werte (Schatten) | bereinigt | weiter fehlerhaft im Bestand | neue zulässige Beobachtungen |
|---|---|---|---|---|
| SEC-Bundles | 416 Bundles inhaltlich (V9-Schatten), 29 mit veröffentlichten Zeilen; Schatten 28.10.: 13/33 | 3 FY-Labels, 12 Zukunftszeilen | alle bis zum Lauf am 02.11. | – |
| Quant (factor-evidence) | STX u. a.: marketCap 137,0 → 146,0 Mrd., netDebtToAssets 0,4167 → 0,1904, 17 zuvor fehlende Rohfaktoren (V9-Folgebeleg) | – | STX bis Produkt-Intelligence-Lauf | – |
| Fundamental/Discover | STX Bewertung, PRTH/WTBA Marktkapitalisierung | – | bis Consumer-Lauf | – |
| Wochenreihen | PZZA 1.073 Wochen × 0,5 | – | bis 31.10. | +1 Reihe |
| Faktor-Rekonstruktion (V10) | nutzt 1.14.0-Logik direkt aus companyfacts | – | – | – |

## B – Historische Identität und Delisting

Beleg: [v10/population/](v10/population/README.md). Protokoll 1.0.0 vor jeder Quellenprüfung committet; Nachträge 1.0.1–1.0.3 offengelegt (B3-Referenz aus EDGAR-Vollindizes; SEC fügt jeder Antwort einen zufälligen Bot-Tag ein → Vergleich über Inhalt + `sha256Normalized`; 7 Baseline-IDs mit doppelter `canonical_id` nur ausgeschlossen).

**B1 – 132 vorgeschlagene Bindungen einzeln geprüft:**

| Ergebnis | Fälle |
|---|---|
| qualifiziert (Same-Day-Preis aus SEC-Filing + aktuelles Cover) | **62** (davon 57 QUALIFIED; 3 CA-, 2 Historiengründe) |
| nur Cover, kein Same-Day-Preis | 49 |
| Preiskonflikt (4 echte Split-/Preisniveau-Konflikte BCTX, TIL, GAME, HOLO; 6 Extraktionsfehler) | 10 |
| Masterzeile nicht eindeutig | 7 |
| Klassenwechsel / Startdokument nicht auffindbar | 2 |
| nicht Common | 1 |
| Delisting-Formular nach letztem Cover | 1 |

Die 62 Bindungen liegen hinter der eigenen Option `identityEvidenceProtocolV10` (Register-Schema `research-identity-evidence-1.1.0`, `SELECT_EXISTING_ROW`), weil die Owner-Entscheidung vom 28.10. `identityEvidence` an die fünf Dossierfälle bindet. **Freigabe offen.** TRAK bleibt COVER_PAGE_ONLY; BGC, COHR, DCOM, SGI unverändert (Regressionstest). Unabhängige Python-Prüfung: 132/132 Entscheidungen, 761/761 Quellhashes, jeder der 62 mit unabhängig wiedergefundenem Preisanker; 35 Treffer des bewusst lockereren Rescans manuell beurteilt, keiner ein echter Widerspruch.

**B2 – eingefrorene Kursenden (475 Reihen):** Fusion 81, Form 25 86, Form 15 1, weiter gelistet/Anbieter-Stillstand 78, Vorzug/Recht/Unit/Warrant 44, ungeklärt 185 (109 ohne CIK). 30 Reihen mit SEC-belegtem letztem Handelstag (8 Barfusion, 1 bar + Aktie, 7 Aktienfusion, 12 Gegenleistung nicht quantifizierbar, 2 „ohne Gegenleistung“ – abgeleitet aus fehlenden Fusionsbelegen, nicht aus einer Quelle, EQC war eine Liquidation; Zahlungstag nie belegt → `null`). EBTC (und das nicht registrierte BLFS) waren zunächst fälschlich als reine Barfusion erfasst (Parser verfehlte „and (ii) 0.60 shares“; Prüfungsbefund 2), korrigiert; die Gegenprüfung kontrolliert jetzt die Abfindungsart. Neue Loader-Option `listingLifecycleEvidence`: schneidet belegte Reihen am letzten Handelstag (der Wochenbalken dieses Tages bleibt mit seinem echten Schluss erhalten) und schneidet unbelegte eingefrorene Enden nach dem letzten beobachteten Schluss, Terminalwert UNKNOWN, Outcomes danach zensiert. Ursprünglich schloss die Option unbelegte Fälle ganz aus; die unabhängige Prüfung hat das als Selektion auf das spätere Ergebnis beanstandet (Befund 4), korrigiert. Wiederholte Schlusskurse werden nie als Handel gezählt.
- **Erzeuger-Befund:** 168 Reihen sind im Security Master `ACTIVE` trotz SEC-Delisting-/Fusionsbeleg; der Master führt außerdem Vorzugs-/Anleihesymbole als `EQUITY_COMMON` (73 wären sonst im Frame). Patch-Vorschlag [producer-patch-proposal.diff](v10/population/producer-patch-proposal.diff), **nicht angewendet** (eigener Produkt-PR mit Vorher/Nachher nötig).

**B3 – Grundpopulation:** Frame 4.366 Listings, davon 28 später belegt delistet. Abdeckung gegenüber SEC-10-K-Meldern (EDGAR-Vollindizes, distinct CIKs, nur Größenordnung): 2000 14 %, 2010 22 %, 2020 48 %, 2026 69 %. Survivors je Jahr 99,3–99,8 %. **Der Bestand ist das heutige Anbieteruniversum, keine historische Marktpopulation.** Eine historische primäre US-Common-Population inklusive Delistings ist mit den vorhandenen Quellen nicht qualifizierbar.

## C – Corporate Actions und Total Return

Beleg: [v10/corporate-actions/](v10/corporate-actions/README.md). Alle 600 gehaltenen Reihen / 1.087 Ereignisse nach dem V9-Folgeprotokoll in neuer Version geprüft. **Offenlegung:** Protokoll 1.1.1 (Ankerkorrektur nach 5-Reihen-Rauchtest, vor dem Volllauf) und 1.1.2 (nur Verschärfung: ein 8-K mit Spin-off-Erwähnung ist keine affirmative Quelle – eingeführt nach Sicht auf 193/600 Teilurteile wegen ref_BCO 2008). Jede Version mit eigenem Hash vor ihrem Lauf committet; Annahme durch den Owner offen.

| Urteil (1.087 Ereignisse) | Anzahl |
|---|---|
| vor Fensterbeginn 2004-08-23 | 250 |
| Identität ungeprüfbar (Ticker nicht genannt 224, keine CIK 41, Börse unbestätigt 44) | 309 |
| Filings unzureichend (20-F/6-K 150, kein Klammerfiling davor 115/danach 10, noch nicht fällig 10) | 285 |
| Split-/Aktienzahl-Evidenz (Halt) | 131 |
| Anbieter-Split schon erfasst | 42 |
| unbereinigter Split (nur Vorschlag) | 8 |
| nur Negativbeleg | 24 |
| Spike-Umkehr | 1 |
| **echte Marktbewegung, zugelassen** | **37** |

- Register **24 → 30 Ereignisse, 23 → 28 Reihen**; QUALIFIED `{identityEvidence, corporateActionEvidence}` **4.476 → 4.481**, CA-Halte 577 → 572. Neu: ACAD, ARLO, MGNX, MOH, NSIT, RDN (~6.500 Wochenbalken); VSTS fällt durch 1.1.2 heraus. Alle Registersätze `PRICE_RETURN`.
- 81 V9-Trockenlauffälle einzeln: 20 zugelassen, 61 weiter gehalten.
- Anbieterfehler: nur PZZA belastbar (unabhängige Wiederentdeckung von #1042). 7 weitere Vorschläge (GCTK, GOVX, INBS, INO, MNPR, MTVA, ZONE) als „nicht anwenden“ markiert (Warrant-Boilerplate, Emission statt Split).
- Unabhängige Python-Prüfung: 600/600 Rahmen, 1.087/1.087 Entscheidungen, 30/30 Register, 272/272 Quellhashes.

**Total Return – belegte Dividendenquartale (Stichtag, Zahltag, Betrag aus SEC):**

| Titel | V10 | V9 |
|---|---|---|
| IBM | **47/47** | 43 |
| MSFT, WMT | 47/47 | 47 |
| NVDA | 42/47 | 46 (V9-Datenfehler gefunden: Stichtag 04.06.2026 = 0,25 $, nicht 0,01 $; 3 weitere jetzt als mehrdeutig ausgeschlossen) |
| A | 26/47 | 26 |
| JPM | 16/47 (durchgehend 2015–2018) | 15 |
| XOM | 14/47 | 14 |
| META | 1/11 | 1 |

Dividendenprotokoll 1.0.0–1.0.4 (zwei Parserkorrekturen, zwei Verschärfungen nach Sicht; offengelegt). Ex-Tage nur abgeleitet und markiert; Bargeld nur am belegten Zahltag. IBM-Faktor 1,046 ist der Kyndryl-Spin-off, kein Split → TR-Fenster geschnitten. TR-Ledger-Parität 8/8 (Engine vs. unabhängige Python-Buchführung, Abweichung 0).

## Weitere neue Datenbefunde (nur gemeldet, keine Änderung)

- Citigroup 10-Q Q3/2009: `CommonStockSharesOutstanding` 22.863.947 statt ≈ 22,9 Mrd. (Filer-Skalenfehler, Pipeline übernimmt ihn).
- Tiingo führt Spin-off-Faktoren in `corporateActions.splits` (GE 1,281/1,253; IBM 1,046) – verzerrt split-konsistente PIT-Marktkapitalisierung.
- SETUP-Originalreihe: 12 von 33 NYSE-Sitzungen zwischen 10.09. und 26.10.2026 ohne Veröffentlichung; die V9-Angabe „erste M6-Reife 26.03.2027“ fällt auf Karfreitag, korrekt 30.03.2027.

## Zusammenfassung der QUALIFIED-Zählungen (main `a1a0dd972a` + V10-Register)

| Konfiguration | QUALIFIED |
|---|---|
| Default (= Adapter) | 4.449 |
| `identityEvidence` + `corporateActionEvidence` | 4.481 |
| + `listingLifecycleEvidence` | **4.526** (150 geschnittene Reihen: 28 belegt delistet, 122 unbelegt zensiert; Fehlwochen 218 → 129, weil Lücken in eingefrorenen Enden wegfallen) |
| + `identityEvidenceProtocolV10` (Freigabe offen) | 4.583 |

Die Lifecycle-Option entfernt fortgeschriebene Schlusskurse, die in V7–V9-Studien als Nullrenditen zählten, und bringt zugleich 150 beendete Listings als zensierte Fälle in die Studienpopulation – die erste echte, wenn auch kleine, Delisting-Komponente.

## Ressourcen

SEC: ≈ 4.685 (Population), ≈ 7.000 (CA + Dividenden), 33 (Schatten A), 1 Bulk `companyfacts.zip` 1,41 GB (Faktor), jeweils ≤ 2 Anfragen/s je Strang; zwei Verbindungs-Testabrufe außerhalb des Fair-Access-Clients (CA-Strang). Keine kostenpflichtigen Anbieter, keine Secrets, kein R2-/Actions-Cache-Zugriff (lokal nicht konfiguriert; nicht benötigt). Private Caches nur im Scratchpad.
