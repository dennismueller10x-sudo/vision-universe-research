# Freigabeliste 1.1.0 → 1.3.0: Prüfung der tatsächlichen Änderungen

Stand 30.10.2026. Owner-Entscheidung vom selben Tag: eine quellengebundene, exakt abgegrenzte Freigabeliste der tatsächlichen Änderungen, keine pauschale Erhöhung der Gates G6, G7 und G9. Erst nach erfolgreicher Prüfung, gesonderter Freigabe und regulärer 1.3.0-Umstellung wird #1119 wieder aufgenommen.

**Das ist ein Entwurf zur Owner-Prüfung.** Die Datei `v130-approved-changes-1.1.0.json` wirkt erst, wenn sie in `main` steht und der Workflow mit `approved_changes=true` läuft.

## Ergebnis in einem Satz

Von 1.144 gezählten Änderungen des Probelaufs sind 1.085 mit Beleg freigabefähig. 59 sind es nicht und zählen weiter gegen die unveränderten Grenzen. Mit dieser Liste bleibt **genau ein Gate-Befund**: G6, die doppelte canonical_id von ONEOK (`tiingo:NYSE:OKE:1985-07-01`). Ursache ist laut SEC eine Holding-Reorganisation vom 10.09.2026 (Nachfolge-Emittent, neue CUSIP, Ticker und NYSE-Listing ohne Unterbrechung). Die Doppelung wird nach Owner-Entscheidung vom 30.10. **nicht** freigegeben, auch nicht als Ausnahme. Der Fall lässt sich ohne Änderung am Erzeuger nicht auflösen, und G6 blockiert den Lauf zwingend, weil das Gate nur prüft und der Workflow den Folgestand unverändert übernimmt (Abschnitt 4). Die Liste selbst bleibt unverändert.

## 1. Grundlage

| Eingabe | Herkunft |
|---|---|
| Ausgangsstand | committeter Stamm `us-security-master-1.1.0` (2026-09-11), SHA-256 `26c82617913ab0dcbd08d24c80eb818134ccced74cc01e9eac819b4635498332`, dazu `summary.json`, `reconciliation.json` und `company-names.json` aus `HEAD`, genau wie der Workflow-Schritt „Committeten Stand sichern“ |
| Folgestand | CI-Artefakt des Probelaufs 40942100928 vom 29.10.2026 (`commit=false`, `allow_version_change=true`, `approved_changes=true`): `sm-next/us-security-master.json` (1.3.0) und `company-names.json` |
| Anbieter | Tiingo `supported_tickers.csv` aus diesem Lauf (109.156 Zeilen); die Zeilen der Bestandstitel stehen im Folgestamm |
| SEC | `company_tickers_exchange.json`, abgerufen am 30.10.2026 über `scripts/quant/sec/http_client.py`, SHA-256 `76b92fbacfc1a5a8715a32bb5f923df4c79a8062b615735542081ddff6977b46` (10.430 Einträge) |
| SEC-Delisting-Belege | Register aus PR #1119 (`quant/config/security-master-delisting-evidence.json` @ `4f16be7`, 133 Belege mit 8-K 2.01+3.01 oder Form 25). Es ist nur Zusatzbeleg und nicht Teil dieses PR. |
| Eigene Tagesreihen | `quant/data/market/discover-series/<securityId>.json` (Feld `to`, Stand `main`), nur gelesen: Gegenprobe für Deaktivierungen. Die Prüfung entspricht #1136 (`SERIES_CONTINUES_AFTER_PROVIDER_END`). |
| Freigabe 1.0.0 | `v130-approved-changes.json`: 138 Typ- und 138 Eignungswechsel des Klassifiziererwechsels. Sie sind unverändert übernommen. |

Die Zählung ist die des Gates (`compareMasters`, `identityFindings`, `compareNames`). Die lokale Gate-Simulation mit der Freigabe 1.0.0 ergibt **denselben Bericht wie der CI-Lauf** (ohne Grenzwerte verglichen: identisch). Die Eingaben sind also exakt nachgebildet.

## 2. Zahlen je Kategorie

| Kategorie | Probelauf | freigabefähig | nicht freigabefähig | Grenze (unverändert) | zählt danach |
|---|---:|---:|---:|---:|---:|
| G6 neue doppelte canonical_id | 1 | 0 | 1 | 0 | **1 → BLOCKED** |
| G7 canonical_id-Wechsel | 83 | 60 | 23 | 25 | 23 |
| G7 Instrumenttyp-Wechsel | 148 | 147 (138 aus 1.0.0) | 1 | 25 | 1 |
| G7 aktiv → inaktiv | 100 | 84 | 16 | 50 | 16 |
| G7 Eignungswechsel | 220 | 203 (138 aus 1.0.0) | 17 | 50 | 17 |
| G7 Tickerwechsel je securityId | 0 | 0 | 0 | 25 | 0 |
| G9 Namenswechsel | 592 | 591 | 1 | 200 | 1 |

**Simulierte Gate-Entscheidung** mit `v130-approved-changes-1.1.0.json` gegen den Probelauf, mit denselben Eingaben wie der Workflow (`--allow-version-change`, `--today 2026-10-29`):

```
[security-master-gate] BLOCKED · Entscheidung BLOCKED
::error::G6 1 neue doppelte canonical_id (z. B. tiingo:NYSE:OKE:1985-07-01)
angewandt {instrumentTypeChanges 147, eligibilityFlips 203, deactivations 84, canonicalIdChanges 60, tickerChanges 0, newDuplicateCanonicalIds 0, nameChanges 591}, ungenutzt 0
```

Erneut ausgeführt am 30.10.2026 mit der unveränderten Datei (SHA-256 `98fa596d90a38f00e0cf55fde4393cd14dd6377e37301e4e6626f12ac8a61961`): dasselbe Ergebnis. **BLOCKED, nur G6.** Restzählungen gegen die unveränderten Grenzen: canonical_id-Wechsel 23/25, Typwechsel 1/25, aktiv → inaktiv 16/50, Eignungswechsel 17/50, Tickerwechsel 0/25, Namenswechsel 1/200, neue doppelte canonical_id 1/0. Ungenutzt: überall 0. Mit der Freigabe 1.0.0 allein bleibt der Lauf wie im CI an G6, G7 (83, 100, 82) und G9 (592) stehen.

Zur Gegenprobe: Mit ausdrücklich übernommener OKE-Doppelung (`--accept-duplicate`) wäre die Simulation `PASS · COMMIT`. Diese Variante hat der Owner am 30.10. **abgelehnt**. Sie ist nicht Teil der Datei und wird nicht weiterverfolgt.

## 3. canonical_id-Wechsel (83): keine Identitätsänderung der securityId

**Was das Gate hier zählt:** Es vergleicht je Bestands-securityId die *Menge* der Anbieterzeilen (canonical_id = `tiingo:Börse:Ticker:Beginn`), die der Erzeuger an sie hängt. Die securityId selbst ändert sich in keinem der 83 Fälle. Sie ist nach `core/identity.js` und ADR-001 `ref_<Ticker>`, „abgeleitet aus dem Ticker, also NICHT stabil über eine Tickeränderung“. Sie folgt damit immer dem Ticker, also dem **laufenden** Listing. Eine Entscheidung „folgt die securityId dem alten oder dem neuen Listing“ gibt es in diesem Modell nicht. Neu ist nur, dass der Erzeuger mehrere Zeilen desselben Tickers an der Bestandsbörse findet. Dann hängt er alle an die securityId, markiert sie `BASELINE_MATCH_AMBIGUOUS` (REVIEW), und sie ist nicht mehr backtestfähig. Der Wochen-Adapter verlangt genau eine Zeile.

**Ursache der Häufung:** Im Stand vom 11.09. führte Tiingo viele Ticker als **eine zusammengefasste Zeile** vom ersten Listing bis heute (z. B. `AAAP NASDAQ 2015-11-11..2026-09-10`, aktiv). Inzwischen trennt Tiingo diese Zeilen: das alte Listing mit seinem echten Ende (AAAP: 2018-02-20, Übernahme durch Novartis) und ein neues Listing (AAAP: ETF seit 2026-06-23). Die „83 wiederverwendeten Ticker“ sind also nur zum Teil Wiederverwendungen. Die Klassen:

| Klasse | Anzahl | Urteil | Regel |
|---|---:|---|---|
| TICKER_REUSE_NEW_LISTING | 27 | freigabefähig | alte Zeile bleibt (jetzt inaktiv), neue Zeile beginnt nach ihrem Ende (> 1 Jahr Abstand oder andere Gattung), höchstens eine aktive Zeile. Ist die aktive Zeile eine Stammaktie an einer Börse, muss die SEC den Ticker an derselben Börsenfamilie führen. |
| LISTING_RESTART | 2 | freigabefähig | wie oben, kurzer Abstand (INCR, JCSE) |
| MOVED_TO_OTC | 19 | freigabefähig | dasselbe Listing (gleicher Beginn), Börse → OTCMKTS/PINK. Die SEC führt den Ticker nicht an einer Börse (OTC, ohne Börse oder nicht gelistet), bei SNBR zusätzlich Form 25-NSE. |
| EXCHANGE_LABEL_RENAMED | 6 von 7 | freigabefähig | gleicher Beginn, AMEX → NYSE MKT (dieselbe Börse, neue Bezeichnung beim Anbieter), SEC: NYSE |
| EXCHANGE_TRANSFER | 1 von 2 | freigabefähig | NXDR NYSE → NASDAQ, SEC: Nasdaq |
| START_DATE_RESTATED | 4 von 5 | freigabefähig | gleiche Börse, Anbieter korrigiert den Beginn (MDCX, RCAT, OGC, ELE), SEC bestätigt Ticker und Börse |
| HISTORICAL_ROW_DROPPED | 1 | freigabefähig | DBRG-P-H: die schon inaktive Altzeile 2017–2021 entfällt, die laufende Zeile bleibt |
| PROVIDER_HISTORY_RESTARTED | 15 | **nicht** | Altzeile beim Anbieter ganz entfallen, neue Zeile erst seit wenigen Wochen (FGNX, LESL, LRHC, NVNI, QNCX, SPKL, TETE, VTAK, SBXD, RITR …). Ob dasselbe Wertpapier fortgeführt wird (Reverse Split, Umfirmierung, CUSIP-Wechsel) oder ein anderer Emittent übernommen hat, belegt die Liste nicht, und die Historie des alten Listings fehlt beim Anbieter. |
| TWO_ACTIVE_LISTINGS | 4 | **nicht** | zwei aktive Zeilen zugleich (EFTY, XRPN, XRPNW, CHOW). Die ältere altert erst nach 30 Tagen aus. Das löst sich im nächsten Lauf von selbst. |
| UNCLEAR_REPLACEMENT | 1 | **nicht** | CAM: NYSE 1995 → ETF an NYSE ARCA 2025, die Altzeile fehlt ganz |
| SEC widerspricht / bestätigt nicht | 3 | **nicht** | TRT (Anbieter NYSE MKT, SEC Nasdaq), TRUE (aktiv an NASDAQ laut Anbieter, nicht in der SEC-Liste), APAD (Wechsel NYSE → NASDAQ laut Anbieter; SEC-Liste ohne APAD und 8-K 2.01+3.01, wirksam 2026-05-08, im Register #1119) |

Mit 23 verbleibenden Wechseln liegt G7 knapp unter der Grenze 25. Das ist der kleinste Abstand aller Kategorien (Abschnitt 8, Drift).

## 4. Die doppelte canonical_id (G6): ONEOK

### 4.1 Befund beim Anbieter

Die Anbieterliste vom 29.10. enthält **zwei** Zeilen `OKE · NYSE · Beginn 1985-07-01`, Gattung Stock, USD. Sie unterscheiden sich nur im Enddatum: Die eine endet am 2026-09-14 und ist damit „INACTIVE“ (45 Tage alt), die andere endet am 2026-10-28 und ist aktiv. Im committeten Stand (Anbieterliste vom 11.09.) gab es nur eine Zeile, `1985-07-01..2026-09-10`, ACTIVE, `EXCHANGE_MATCH`/`EXISTING`. Die canonical_id `tiingo:Börse:Ticker:Beginn` enthält das Enddatum nicht und kann die beiden Zeilen deshalb nicht unterscheiden. Welche Zeile zu welcher CUSIP gehört, steht nicht in der Liste, denn `supported_tickers` führt keine CUSIP.

### 4.2 Befund bei der SEC (Quellen)

Abgerufen am 30.10.2026 von `data.sec.gov` und `www.sec.gov/Archives`, mit dem User-Agent der SEC-Skripte im Repo (`VisionUniverseResearch info@visionuniverse.de`, wie `scripts/quant/sec/http_client.py`). Rohdaten sind nicht committet.

| Frage | Befund | Quelle |
|---|---|---|
| Heutige Identität | ONEOK, Inc., Oklahoma, CIK **0001039684** (EDGAR-Name `ONEOK INC /NEW/`, vorher `WAI INC` bis Nov. 1997), Commission File 001-13643, IRS 73-1520922, SIC 4923. `company_tickers_exchange` (30.10.): `OKE`, `NYSE`. | `data.sec.gov/submissions/CIK0001039684.json`; Liste aus Abschnitt 1 |
| Ereignis im September 2026 | **Holding-Reorganisation am 10.09.2026** nach OGCA § 1081.G: Legacy ONEOK wird mit der Falcon Merger Sub, L.L.C. verschmolzen (die überlebende Gesellschaft heißt jetzt ONEOK, L.L.C., CIK 0002154636). Die Falcon TopCo, Inc. wird in „ONEOK, Inc.“ umbenannt und ist **Nachfolge-Emittent nach Rule 12g-3(a)**. Jede Aktie wird 1:1 umgetauscht. Wörtlich: „continues to trade on the New York Stock Exchange … on an uninterrupted basis under the ticker symbol ‚OKE‘ with a new CUSIP number (30609A 109)“. Am selben Tag folgt die Apollo-Transaktion auf Ebene der ONEOK Holdings, L.L.C. | 8-K12B vom 10.09.2026, Acc. 0001193125-26-387972 (Items 1.01, 3.01, 3.03, 5.01, 5.03) |
| Ende der Legacy-Aktie | Die NYSE stellt am 18.09.2026 Form 25 für die „Common Stock“ der Legacy-Gesellschaft (17 CFR 240.12d2-2(a)(3)). Am 28.09.2026 folgt Form 15 zur Common Stock der Legacy ONEOK. Die Anleihen laufen weiter unter ONEOK, L.L.C. | 25-NSE Acc. 0000876661-26-000770; 15-12G Acc. 0001193125-26-405508 |
| Fortführung | Die Nachfolgerin meldet regulär weiter unter CIK 1039684: 8-K vom 27.10. (Item 2.02) und 10-Q vom 28.10.2026 (`oke-20260930.htm`). | Submissions CIK 1039684 |
| Wiederverwendung vor 1997 | Die **frühere ONEOK Inc.** (Delaware, vormals Oklahoma Natural Gas, CIK **0000074154**, Filings 1994–2017, letzter 10-K 1997-11-28) wurde im November 1997 auf die WAI Inc. (CIK 1039684) verschmolzen. Das war die Transaktion mit Western Resources. Im 8-K vom 26.11.1997 heißt es: „It is expected that the symbol under which ONEOK Common Stock now trades will continue to be used for the shares of New ONEOK Common Stock“. Die alte Aktie wurde an der NYSE delistet. Der 10-K 1996 der alten Gesellschaft nennt die NYSE als Börse. | 8-K Acc. 0000950130-97-005339 (CIK 1039684), 8-A12B vom 21./28.11.1997; 10-K Acc. 0000950134-96-005494 (CIK 74154) |

**Ergebnis:** Der Ticker OKE an der NYSE ging zweimal auf einen Nachfolge-Emittenten mit gleichem Geschäft über, 1997 (CIK 74154 → 1039684) und am 10.09.2026 (neue CUSIP 30609A 109, CIK bleibt 1039684). Beide Male ist es keine Wiederverwendung durch einen fremden Emittenten. Die durchgehende Tiingo-Zeile ab 1985-07-01 deckte schon die Zeit vor 1997 mit ab. Die Zeile, die am 2026-09-14 endet, passt zur Legacy-Aktie (wirksam 10.09., Form 25 am 18.09.). Die aktive Zeile passt zur Aktie der Nachfolgerin, der Anbieter hat aber den Beginn 1985-07-01 übernommen. Diese Zuordnung ist ein Schluss aus Datum und SEC-Text, denn die Anbieterliste selbst nennt keine CUSIP.

### 4.3 Eigene Tagesreihe

`quant/data/market/discover-series/ref_OKE.json` (Stand `main`, nur gelesen): 270 Tageswerte vom 2025-10-03 bis 2026-10-29, keine Lücke über 4 Kalendertage. Um den Stichtag herum: 09-09 95,82 · 09-10 95,72 · 09-11 96,62 · 09-14 96,97 · 09-15 94,72. Die größte Tagesbewegung im Jahr betrug 5,1 % (2026-02-24), nicht am Stichtag. Die Wochenreihe `discover-series-long/ref_OKE.json` (1990-01-05 bis 2026-10-23, 1.921 Wochen) hat nur eine Lücke (2001-09-10 → 09-21, NYSE-Schließung) und keinen Sprung um Nov. 1997 oder Sept. 2026. **`ref_OKE` läuft also durchgehend.** Das deckt sich mit „uninterrupted basis“ im 8-K12B.

### 4.4 Dieselbe Klasse bei den 7 bekannten Doppelungen

Die 7 Doppelungen, die schon im committeten Stand stehen und vom Gate nur ausgewiesen werden (BAM, CCSI, FUN, HUT, NYXH, TEL, UHAL-B), haben **dasselbe Muster**: eine inaktive Altzeile und eine aktive Zeile mit identischem Beginn. Alle 7 Bestandstitel sind schon heute `BASELINE_MATCH_AMBIGUOUS`/REVIEW. Bei zwei davon belegt die SEC ein Nachfolgeereignis zum Ende der Altzeile: TEL mit 8-K12B vom 30.09.2024 (Altzeile endet am 2024-09-27) und FUN mit 8-K12B vom 01.07.2024 (Altzeile endet am 2024-07-16). Die übrigen fünf sind hier nicht einzeln belegt. OKE wäre der achte Fall derselben Klasse.

### 4.5 Ist der Fall eindeutig auflösbar? Nein, nicht im bestehenden Verfahren.

* **Identität und Listing: ja, belegt.** Beide Zeilen beschreiben dasselbe NYSE-Listing unter OKE ohne Unterbrechung, mit 1:1-Umtausch und gleichem Geschäft. `ref_OKE` folgt nach ADR-001 dem laufenden Listing und bleibt richtig. Rechtlich sind es zwei Wertpapiere (alte und neue CUSIP). Das Modell unterscheidet sie aber nicht, und die eigene Reihe ist durchgehend.
* **Regelkonformer Weg, genau eine Zeile zu verwenden: nein, es gibt keinen.** Der Erzeuger (`quant/engines/us-security-master.js`, Zuordnung „Ticker UND Handelsplatz“) hängt bei mehreren Zeilen an der Bestandsbörse bewusst **alle** an die securityId und wählt keine aus („Eine davon willkürlich zu wählen wäre eine Entscheidung, und die trifft dieser Lauf nicht“). Ein Zusammenführen, eine Zeilenauswahl oder eine Override-Liste gibt es nicht. Ein Builder-Schalter dafür fehlt ebenso.
* **Zurückhalten im Gate (z. B. `heldBack`): nicht wirksam.** Das Gate ist rein lesend („Erzeugt nichts selbst“). Der Workflow-Schritt „Neuen Stand einsetzen“ kopiert `sm-next/us-security-master.json`, `summary.json`, `reconciliation.json` und `backfill-estimate.json` **unverändert** nach `quant/data`. Eine Liste, die `ref_OKE` aus der G6-Zählung nimmt, würde den Lauf auf PASS stellen, und committet würde trotzdem die Doppelung. Das wäre im Ergebnis die abgelehnte Ausnahme-Freigabe unter anderem Namen. Damit `ref_OKE` auf dem prev-Stand bleibt, müsste jemand den Folgestand schreiben: die OKE-Zeilen aus prev einsetzen und `summary`/`reconciliation` nachzählen. Das ist eine Änderung am Erzeuger oder eine Handänderung an einem generierten Artefakt. Beides ist nach CLAUDE.md nicht Teil von #1143.
* **Folge:** G6 blockiert den Lauf zwingend. Eine Freigabe der übrigen 1.085 Änderungen ist mit #1143 allein **nicht** möglich, solange der Anbieter die Doppelzeile führt. In #1143 wird deshalb nichts am Gate oder Builder geändert. Die Freigabeliste bleibt byte-gleich.

### 4.6 Weg zur Auflösung (eigener PR, nicht in #1143, nicht umgesetzt)

**Empfehlung, Erzeuger-PR „identische canonical_id zusammenführen“** in `quant/engines/us-security-master.js` (Fachmodell, eigener PR mit Vorher/Nachher-Vergleich):

1. Regel: Zeilen mit gleichem Ticker, gleicher Börse, gleichem Beginn, gleicher Gattung und Währung werden **vor** der Bestandszuordnung zu einer Zeile zusammengeführt. Es gewinnt das jüngste Enddatum, und daraus folgt der Aktivstatus. Die Zeile trägt `provider_rows_merged: n` und den Hinweis `PROVIDER_DUPLICATE_ROW_MERGED`. Es wird nichts erfunden, nur die schon vorhandene Information verdichtet.
2. Vorher/Nachher-Vergleich gegen den Probelauf: Betroffen sind genau 8 securityIds (OKE und die 7 bekannten). Sie verlieren `BASELINE_MATCH_AMBIGUOUS`, die bekannten Doppelungen fallen von 7 auf 0. `masterHash` ändert sich, deshalb wird die Version erhöht.
3. Gegenprobe als Näherung (kein Erzeugerlauf): Im Folgestand die inaktive OKE-Zeile entfernt und `ref_OKE` als `EXCHANGE_MATCH` geführt. Die Gate-Simulation mit der **unveränderten** Datei 1.1.0 ergibt `PASS · COMMIT`, ungenutzt 0, Restzählungen wie oben, G6 0. Die Freigabeliste müsste dafür nicht geändert werden, weil `ref_OKE` in keiner anderen Liste steht.
4. Danach neuer Probelauf und neue Liste mit dem Builder, falls der Anbieter inzwischen weiter gedriftet ist.

Alternative, ebenfalls im Erzeuger: eine belegte Liste `heldBack` (securityId, canonicalId, Beleg) als Eingabe von `build-us-security-master.mjs`, die für diese securityIds die Zeilen aus dem Ausgangsstand übernimmt und die Zählungen nachführt. Das Gate würde dann nur prüfen, dass die zurückgehaltenen Zeilen genau prev entsprechen, und sie ausweisen. Das ist weniger allgemein und veraltet mit jedem Lauf (Enddatum 2026-09-10 bleibt stehen). Deshalb ist es nur die zweite Wahl.

Ohne Erzeugeränderung bleibt nur Abwarten (Option c in Abschnitt 9.2), bis Tiingo die Altzeile entfernt. Bei FUN und TEL steht sie seit 2024 noch in der Liste, das ist also wenig wahrscheinlich.

## 5. Deaktivierungen (100)

| Klasse | Anzahl | Urteil |
|---|---:|---|
| PROVIDER_ENDDATE_AGED: Anbieter-Enddatum unverändert seit dem 11.09., inzwischen älter als 30 Tage (Schwelle des Erzeugers) | 67 | 66 freigabefähig; **EDVA nicht**: SEC führt EDVA an der NYSE (Endovia Health Sciences), und die eigene Tagesreihe läuft bis 2026-10-29 |
| PROVIDER_ENDDATE_RESTATED: Anbieter meldet ein neues letztes Handelsdatum, älter als 30 Tage | 28 | 15 freigabefähig: Ende im September (de-SPAC, Delisting), die eigene Reihe endet mit dem Anbieter oder fehlt. **13 nicht** (ACTS, BREW, ENTL, FTPA, GNMX, INVN, NMBL, NYNY, PCLN, TRIL, USX, WR, WX): Der Anbieter datiert das Ende Jahre zurück (z. B. ACTS 2016, BREW 2020, INVN 2017), aber unsere eigene Tagesreihe läuft bis 2026-10-29. Die Kurse unter dieser securityId stammen also von einem laufenden Listing (Ticker-Wiederverwendung an anderer Börse oder Anbieterkorrektur). Das ist ein **Identitätsbefund** und kein Delisting. Eine Freigabe würde einen Titel mit lebender Kursreihe als inaktiv führen. |
| mit freigabefähigem canonical_id-Wechsel (BCAR, SNYR, SVMH) | 3 | freigabefähig |
| mit nicht freigabefähigem canonical_id-Wechsel (FGNXP, RITR) | 2 | **nicht** |

SEC-Gegenprobe: 98 der 100 Ticker stehen nicht mehr in `company_tickers_exchange`. NTZ (Natuzzi) steht dort ohne Börse, das passt. EDVA steht dort an der NYSE, das widerspricht. Eigene Tagesreihe: Bei 14 der 100 läuft sie über das Anbieter-Ende hinaus (die 13 oben und EDVA). Alle 14 sind nicht freigabefähig. Form 25 bzw. 8-K 2.01+3.01 aus dem Register #1119 liegt nur für MDV vor und steht als Zusatzbeleg im Eintrag. Mehr Form-25-Abrufe wären teuer und würden am Urteil nichts ändern. Das Register #1119 deckt andere Fälle ab (132 Bestandszeilen ohne Anbieter-Enddatum). Es ist unabhängig von diesen 100 und wird nach der 1.3.0-Umstellung gestaffelt nachgezogen (Option A in #1119).

## 6. Eignungswechsel (220) und Typwechsel (148)

* 138 + 138 sind die schon freigegebenen Wechsel des Klassifizierers (1.0.0). Sie sind unverändert enthalten.
* Die **82 übrigen Eignungswechsel** haben keine eigene Ursache, sie folgen aus den anderen Kategorien: 57 aus einer Deaktivierung, 24 aus einem canonical_id-Wechsel (meist: das neue Listing ist ein ETF oder steht im Freiverkehr) und 1 aus einer gealterten Zeile einer schon mehrzeiligen securityId (COOL: die Stammaktienzeile endete am 2026-08-12, aktiv bleibt nur die ETF-Zeile). Kein Wechsel stammt aus einer Klassifiziereränderung außerhalb der Liste 1.0.0. Freigabefähig ist ein Wechsel genau dann, wenn seine Ursache freigabefähig ist: 65 ja, 17 nein (die 13 Identitätsbefunde aus Abschnitt 5 sowie CAM, EDVA, RITR, SBXD).
* Die **10 übrigen Typwechsel** folgen alle aus canonical_id-Wechseln (eine neue ETF- oder Vorzugszeile kommt zur Typmenge hinzu): 9 freigabefähig, CAM nicht.

## 7. Namenswechsel (592)

| Klasse | Anzahl | Urteil |
|---|---:|---|
| NAME_ADDED_SEC: vorher kein Name, jetzt der SEC-Name (nur Titel außerhalb des Produktuniversums; der committete Namensstand vom 11.10. wurde ohne SEC-Abgleich gebaut, `stats.sec = null`). Ticker und CIK sind gegen die SEC-Liste vom 30.10. geprüft. | 573 | freigabefähig |
| RENAMED_SAME_CIK_SEC: Umfirmierung, gleiche CIK, neuer Name aus der SEC (z. B. WPRT Westport → AETHERION, HELP Cybin → Helus Pharma, BNC CEA Industries → BNB Standard) | 14 | freigabefähig |
| RENAMED_SAME_CIK_PROVIDER: gleiche CIK, Quelle wechselt SEC → Tiingo-Metadaten (ATTT, BTLN, NXAT, VAI) | 4 | freigabefähig |
| ISSUER_CIK_CHANGED: XRPN, CIK 0002044009 → 0002092592 (Armada II → Evernorth, SPAC-Abschluss) | 1 | **nicht**: anderer Emittent, also eine Identitätsfrage (zudem zwei aktive Zeilen) |

Die Produktnamen im Universum ändern sich nur bei den 18 Umfirmierungen. Die Namensabdeckung bleibt 6.666 → 6.666.

## 8. Folgen der Übernahme (zur Kenntnis)

* Backtestfähige securityIds (genau eine Zeile, aktiv, geeignet, Stammaktie): 6.397 → 6.167 (−230, +0). Davon gehen 127 auf den schon freigegebenen Klassifiziererwechsel zurück, 43 auf freigabefähige Deaktivierungen, 39 auf freigabefähige canonical_id-Wechsel (Wiederverwendung, Freiverkehr), 20 auf nicht freigabefähige Fälle (darunter die 13 Identitätsbefunde) und 1 auf OKE. Die 21 nicht freigegebenen gehen nur verloren, wenn der Lauf trotzdem übernommen wird, weil sie unter den Grenzen bleiben. Siehe Abschnitt 9.5.
* masterHash ändert sich, die Quant-Backtest-Schlüssel werden ungültig (bekannt aus #1119).
* Nicht Teil dieses Laufs (Workflow-Kommentar): Produkteignung `eligibility.json`, Universum, Discover-Neubau.

## 9. Offene Owner-Entscheidungen

1. **Freigabe der Liste** `v130-approved-changes-1.1.0.json`, ganz oder mit Streichungen. Gestrichene Einträge zählen dann gegen die Grenzen. Neu erzeugen statt von Hand ändern.
2. **ONEOK (G6)**, Stand 30.10. (Abschnitt 4.5/4.6):
   * a) *Empfehlung:* eigener PR im Erzeuger `quant/engines/us-security-master.js`: Zeilen mit identischer canonical_id zu einer zusammenführen (jüngstes Enddatum gewinnt), mit Vorher/Nachher-Vergleich nach der Regel „Fachmodelle nicht nebenbei ändern“. Betroffen sind 8 securityIds (OKE und die 7 bekannten Doppelungen). Danach neuer Probelauf. Die Liste 1.1.0 bleibt voraussichtlich unverändert (Näherung: PASS). **Zu entscheiden: Auftrag für diesen Erzeuger-PR.**
   * b) ~~die Doppelung ausdrücklich übernehmen (`--accept-duplicate`)~~: vom Owner am 30.10. **abgelehnt**.
   * c) abwarten, bis Tiingo die Doppelzeile entfernt, und dann neuer Probelauf. Wenig wahrscheinlich (FUN/TEL stehen seit 2024 doppelt).
   * Ein Zurückhalten nur im Gate (`heldBack`) wirkt nicht, weil der Workflow den Folgestand unverändert committet. Es wurde daher nicht umgesetzt.
3. Die 23 nicht freigabefähigen canonical_id-Wechsel bleiben unter der Grenze 25. Weitere Drift kann sie darüber heben. Dann gilt: neu erzeugen und neu prüfen, keine Grenze ändern.
4. Workflow: Die Eingabe `approved_changes` zeigt in diesem PR in einem eigenen Commit auf die Datei 1.1.0. Sie enthält 1.0.0 vollständig.
5. **Identitätsbefunde (13 + EDVA):** Diese Titel bleiben unter den Grenzen und würden bei Übernahme trotzdem inaktiv geführt. Exakt heißt nicht, dass sie blockieren, sondern dass sie gegen die Grenze zählen. Will der Owner sie vor der Übernahme klären (Zuordnung ticker → laufendes Listing im Erzeuger), ist das ein eigener Erzeuger-PR.

## 10. Owner-Schritte

1. Diese Prüfung und die Datei lesen und den PR gesondert freigeben (Merge nach `main`). Vorher muss ONEOK aufgelöst sein (Abschnitt 9.2 a oder c), sonst bleibt der Lauf an G6 stehen. Ein Merge von #1143 allein reicht nicht, um den Lauf zu übernehmen.
2. `Security Master + Firmennamen` manuell starten: `commit=false`, `allow_version_change=true`, `approved_changes=true`. In der Zusammenfassung prüfen: `Gate: PASS · Entscheidung COMMIT`, „ungenutzt“ überall 0.
3. Ist der Lauf BLOCKED oder sind Einträge ungenutzt (Anbieterbewegung seit dem 29.10.), das Artefakt des neuen Laufs herunterladen und die Liste neu erzeugen (Befehl unten). Danach als neuen PR prüfen und freigeben und mit Schritt 2 wiederholen. Die Datei passt nur zu dem Lauf, aus dem sie erzeugt wurde: Exakt heißt, dass jede Abweichung wieder zählt.
4. Direkt danach, am selben Tag, mit denselben Eingaben und `commit=true` starten. Das Gate prüft erneut. Nur bei PASS · COMMIT werden die sechs Dateien committet. Ändert sich die Anbieterliste zwischen beiden Läufen, blockiert das Gate (fail closed, nichts wird übernommen). Dann zurück zu Schritt 3.
5. Danach ist der Stamm 1.3.0. Die Freigabe gilt dann nicht mehr (G8-Bindung an 1.1.0 → 1.3.0 und den SHA-256). #1119 kann mit der Staffelung (Option A) wieder aufgenommen werden.

### Liste neu erzeugen (bei Drift)

```bash
# Ausgangsstand wie im Workflow
mkdir -p /tmp/sm-prev && for f in us-security-master.json summary.json reconciliation.json company-names.json; do
  git show "HEAD:quant/data/market/security-master/$f" > "/tmp/sm-prev/$f"; done
# Artefakt security-master-weekly-<run_id> nach /tmp/art entpacken; SEC-Liste einmal abrufen (http_client.py, User-Agent mit Kontakt)
node scripts/market/build-security-master-approval-list.mjs \
  --gate-report /tmp/art/_temp/sm-gate.json --prev /tmp/sm-prev --next /tmp/art/_temp/sm-next \
  --prev-names /tmp/sm-prev/company-names.json --next-names /tmp/art/<…>/quant/data/market/security-master/company-names.json \
  --base-approval docs/data/security-master/v130-approved-changes.json \
  --sec /tmp/company_tickers_exchange.json --sec-as-of <Datum> \
  --delisting-register <Register aus #1119> --delisting-register-ref "<PR/Commit/Pfad>" [--series-dir quant/data/market/discover-series] \
  --out docs/data/security-master/v130-approved-changes-1.1.0.json --markdown-out /tmp/lists.md
# Gegenprobe wie im Workflow
node scripts/market/security-master-refresh-gate.mjs --prev /tmp/sm-prev --next /tmp/art/_temp/sm-next \
  --prev-names /tmp/sm-prev/company-names.json --next-names <…>/company-names.json --today <Lauftag> \
  --allow-version-change --approved-changes docs/data/security-master/v130-approved-changes-1.1.0.json
```

Der Builder bricht ab, wenn der Gate-Bericht nicht zu prev/next passt. Er schreibt nur nach `--out`, `--classification-out` und `--markdown-out`.

## 11. Überschneidung mit #1136 (Stand 30.10.2026)

Owner-Entscheidung 30.10.: #1143 ist die bevorzugte Lösung. #1136 (Branch `claude/supertrader-9-data-certification-jnejw3-secmaster-drift`, Kopf `6dbe42c998`) wird nicht gleichzeitig integriert und hier nur gelesen. #1136 ist gestapelt: Commit `2342b12657` führt #1100 (Freeze) und #1101 (Nachweis 1.3.0) zusammen. Keiner der beiden steht in `main`, denn `v130-quant-freeze.json`, `backtest-generation-freeze.cjs` und `v130-count-reconciliation.json` fehlen dort.

| Datei | #1143 | #1136 | Herkunft in #1136 | Konflikt | unabhängig von der Freigabe? |
|---|---|---|---|---|---|
| `scripts/market/security-master-refresh-gate.mjs` | Schema 1.1.0 = **eine** Datei, sieben exakte Listen inkl. `tickerChanges`, Beleg je Eintrag | Schema **gleichen Namens** 1.1.0 = Nachholdrift-Datei **neben** 1.0.0 (mehrere `--approved-changes`), sechs Arten, Eignung nur true → false | #1136 (`a425dc7f2a`, `16308c6bb6`) | **ja, inhaltlich**: gleicher Schema-Name, anderes Format. Wer später gemergt wird, muss umbenennen. | nein |
| `.github/workflows/security-master-weekly.yml` | `approved_changes` zeigt auf die Datei 1.1.0 | zusätzliche Eingabe `approved_drift` (zweite Datei) und Alarm-Job `pipeline-alarm` (SMW-15) | #1136 (`a425dc7f2a`, `6dbe42c998`) | ja (Textkonflikt und Semantik der Eingaben) | der Alarm-Job allein: ja |
| `docs/data/SECURITY_MASTER_WEEKLY.md` | – | erweitert | #1101 und #1136 | nein | teilweise (#1101-Teil) |
| `quant/tests/security-master-weekly.test.mjs` | – (eigene Tests in `security-master-approval-v110.test.mjs`) | SMW-Tests für Drift, Sperrliste, Alarm | #1101 und #1136 | nein (andere Datei), aber die Tests prüfen das #1136-Format | nein |
| `docs/data/security-master/drift-approved-changes.json`, `drift-evidence.json`, `drift-lists.md`, `scripts/market/security-master-drift-evidence.mjs` | entspricht `v130-approved-changes-1.1.0.json`, Builder und Prüfdokument | Nachholfreigabe; **übernimmt ONEOK** (`--include-duplicates`) und Ticker-Wiederverwendungen | #1136 | doppelte Lösung derselben Aufgabe; ONEOK im Widerspruch zur Owner-Entscheidung | nein |
| `docs/data/security-master/identity-blocklist.json` | – | 71 gesperrte IDs (u. a. ONEOK) für die neue Backtest-Generation | #1136 (`8e5205a95b`, `1e8af2f320`) | nein | nein (setzt die Übernahme der Doppelung voraus) |
| `docs/data/security-master/v130-quant-freeze.json`, `scripts/quant/backtest-generation-freeze.cjs`, `quant/tests/security-master-v130-freeze.test.mjs` | – | Freeze der Quant-Ergebnisse vor 1.3.0 | #1100 (`7af5c98bb9`, `321d2d959f`), danach in #1136 erweitert (V10–V13c, `--blocklist` als Pflicht `BLOCKLIST_REQUIRED`) | nein | **ja, im Stand von #1100**. Die Erweiterung `--blocklist` hängt an `identity-blocklist.json` (#1136) und müsste für eine unabhängige Übernahme optional bleiben. |
| `docs/data/security-master/v130-count-reconciliation.json`, `scripts/market/security-master-v130-evidence.mjs` | – (Datei 1.0.0 aus `main` unverändert übernommen) | Zählabgleich 138/127/133, Erweiterung des Nachweisskripts | #1101 (`2525ba428c`) | nein | ja |

**Schluss:** Hart überschneiden sich nur Gate und Workflow, dort aber unvereinbar (gleicher Schema-Name, anderes Format, andere ONEOK-Entscheidung). Unabhängig von #1143 übernehmbar wären die Freeze-Manifeste aus #1100 (ohne die Pflicht `--blocklist`), der Zählabgleich aus #1101 und der Alarm-Job SMW-15. Jeder Teil gehört in einen eigenen PR, die Freeze-Teile wegen der Quant-Pfade getrennt von den Market-Pfaden.

## Anhang: Listen (erzeugt vom Builder)

Alle nicht freigabefähigen Einträge stehen vollständig darin. Von den freigabefähigen steht je Klasse eine Stichprobe, vollständig mit Beleg stehen sie in der Freigabedatei.

### canonical_id-Wechsel: 83 gesamt, 60 freigabefähig, 23 nicht freigabefähig

| Klasse | Anzahl |
|---|---:|
| TICKER_REUSE_NEW_LISTING | 27 |
| MOVED_TO_OTC | 19 |
| PROVIDER_HISTORY_RESTARTED | 15 |
| EXCHANGE_LABEL_RENAMED | 7 |
| START_DATE_RESTATED | 5 |
| TWO_ACTIVE_LISTINGS | 4 |
| EXCHANGE_TRANSFER | 2 |
| LISTING_RESTART | 2 |
| UNCLEAR_REPLACEMENT | 1 |
| HISTORICAL_ROW_DROPPED | 1 |

**Nicht freigabefähig (vollständig, 23):**

| securityId | von | nach | Klasse | Grund |
|---|---|---|---|---|
| ref_APAD | tiingo:NYSE:APAD:2025-08-27 | tiingo:NASDAQ:APAD:2025-08-27 | EXCHANGE_TRANSFER | gleiches Listing (Beginn 2025-08-27), Börsenwechsel NYSE → NASDAQ; SEC bestätigt nicht (APAD nicht gelistet); zudem SEC-Delisting-Beleg 8-K_2.01+3.01 (wirksam 2026-05-08) gegen die aktive Zeile an NASDAQ |
| ref_CAM | tiingo:NYSE:CAM:1995-07-05 | tiingo:NYSE ARCA:CAM:2025-10-06 | UNCLEAR_REPLACEMENT | Altzeile entfallen, ersetzt durch ein Listing an anderer Börse mit anderem Beginn (NYSE 1995-07-05 → NYSE ARCA 2025-10-06); die Anbieterliste belegt das Ende des alten Listings nicht |
| ref_CHOW | tiingo:AMEX:CHOW:2025-09-16 | tiingo:NYSE MKT:CHOW:2025-09-16\|tiingo:NYSE MKT:CHOW:2026-10-23 | TWO_ACTIVE_LISTINGS | zwei aktive Anbieterzeilen (tiingo:NYSE MKT:CHOW:2025-09-16, tiingo:NYSE MKT:CHOW:2026-10-23); welches Listing gilt, ist offen, die ältere Zeile altert erst nach 30 Tagen aus |
| ref_EFTY | tiingo:NASDAQ:EFTY:2025-08-08 | tiingo:NASDAQ:EFTY:2025-08-08\|tiingo:NASDAQ:EFTY:2026-10-19 | TWO_ACTIVE_LISTINGS | zwei aktive Anbieterzeilen (tiingo:NASDAQ:EFTY:2026-10-19, tiingo:NASDAQ:EFTY:2025-08-08); welches Listing gilt, ist offen, die ältere Zeile altert erst nach 30 Tagen aus |
| ref_FGNX | tiingo:NASDAQ:FGNX:2014-04-01 | tiingo:NASDAQ:FGNX:2026-09-28 | PROVIDER_HISTORY_RESTARTED | Altzeile (Beginn 2014-04-01) beim Anbieter entfallen, neue Zeile erst seit 2026-09-28: ob dasselbe Wertpapier fortgeführt wird (Reverse Split, Umfirmierung, CUSIP-Wechsel) oder ein anderer Emittent den Ticker übernommen hat, belegt die Anbieterliste nicht |
| ref_FGNXP | tiingo:NASDAQ:FGNXP:2018-02-28 | tiingo:NASDAQ:FGNXP:2026-09-28 | PROVIDER_HISTORY_RESTARTED | Altzeile (Beginn 2018-02-28) beim Anbieter entfallen, neue Zeile erst seit 2026-09-28: ob dasselbe Wertpapier fortgeführt wird (Reverse Split, Umfirmierung, CUSIP-Wechsel) oder ein anderer Emittent den Ticker übernommen hat, belegt die Anbieterliste nicht |
| ref_LESL | tiingo:NASDAQ:LESL:2020-10-29 | tiingo:NASDAQ:LESL:2026-10-05 | PROVIDER_HISTORY_RESTARTED | Altzeile (Beginn 2020-10-29) beim Anbieter entfallen, neue Zeile erst seit 2026-10-05: ob dasselbe Wertpapier fortgeführt wird (Reverse Split, Umfirmierung, CUSIP-Wechsel) oder ein anderer Emittent den Ticker übernommen hat, belegt die Anbieterliste nicht |
| ref_LRHC | tiingo:NASDAQ:LRHC:2023-10-09 | tiingo:NASDAQ:LRHC:2026-10-19 | PROVIDER_HISTORY_RESTARTED | Altzeile (Beginn 2023-10-09) beim Anbieter entfallen, neue Zeile erst seit 2026-10-19: ob dasselbe Wertpapier fortgeführt wird (Reverse Split, Umfirmierung, CUSIP-Wechsel) oder ein anderer Emittent den Ticker übernommen hat, belegt die Anbieterliste nicht |
| ref_NVNI | tiingo:NASDAQ:NVNI:2023-09-29 | tiingo:NASDAQ:NVNI:2026-10-09 | PROVIDER_HISTORY_RESTARTED | Altzeile (Beginn 2023-09-29) beim Anbieter entfallen, neue Zeile erst seit 2026-10-09: ob dasselbe Wertpapier fortgeführt wird (Reverse Split, Umfirmierung, CUSIP-Wechsel) oder ein anderer Emittent den Ticker übernommen hat, belegt die Anbieterliste nicht |
| ref_NVNIW | tiingo:NASDAQ:NVNIW:2023-10-02 | tiingo:PINK:NVNIW:2026-10-09 | PROVIDER_HISTORY_RESTARTED | Altzeile (Beginn 2023-10-02) beim Anbieter entfallen, neue Zeile erst seit 2026-10-09: ob dasselbe Wertpapier fortgeführt wird (Reverse Split, Umfirmierung, CUSIP-Wechsel) oder ein anderer Emittent den Ticker übernommen hat, belegt die Anbieterliste nicht |
| ref_QNCX | tiingo:NASDAQ:QNCX:2019-05-09 | tiingo:NASDAQ:QNCX:2026-10-12 | PROVIDER_HISTORY_RESTARTED | Altzeile (Beginn 2019-05-09) beim Anbieter entfallen, neue Zeile erst seit 2026-10-12: ob dasselbe Wertpapier fortgeführt wird (Reverse Split, Umfirmierung, CUSIP-Wechsel) oder ein anderer Emittent den Ticker übernommen hat, belegt die Anbieterliste nicht |
| ref_RITR | tiingo:NASDAQ:RITR:2024-08-23 | tiingo:NASDAQ:RITR:2026-09-17 | PROVIDER_HISTORY_RESTARTED | Altzeile (Beginn 2024-08-23) beim Anbieter entfallen, neue Zeile erst seit 2026-09-17: ob dasselbe Wertpapier fortgeführt wird (Reverse Split, Umfirmierung, CUSIP-Wechsel) oder ein anderer Emittent den Ticker übernommen hat, belegt die Anbieterliste nicht |
| ref_SBXD | tiingo:NYSE:SBXD:2024-10-07 | tiingo:PINK:SBXD:2026-09-28 | PROVIDER_HISTORY_RESTARTED | Altzeile (Beginn 2024-10-07) beim Anbieter entfallen, neue Zeile erst seit 2026-09-28: ob dasselbe Wertpapier fortgeführt wird (Reverse Split, Umfirmierung, CUSIP-Wechsel) oder ein anderer Emittent den Ticker übernommen hat, belegt die Anbieterliste nicht |
| ref_SPKL | tiingo:NASDAQ:SPKL:2023-11-27 | tiingo:NASDAQ:SPKL:2026-10-07 | PROVIDER_HISTORY_RESTARTED | Altzeile (Beginn 2023-11-27) beim Anbieter entfallen, neue Zeile erst seit 2026-10-07: ob dasselbe Wertpapier fortgeführt wird (Reverse Split, Umfirmierung, CUSIP-Wechsel) oder ein anderer Emittent den Ticker übernommen hat, belegt die Anbieterliste nicht |
| ref_SPKLU | tiingo:NASDAQ:SPKLU:2023-10-06 | tiingo:PINK:SPKLU:2026-10-07 | PROVIDER_HISTORY_RESTARTED | Altzeile (Beginn 2023-10-06) beim Anbieter entfallen, neue Zeile erst seit 2026-10-07: ob dasselbe Wertpapier fortgeführt wird (Reverse Split, Umfirmierung, CUSIP-Wechsel) oder ein anderer Emittent den Ticker übernommen hat, belegt die Anbieterliste nicht |
| ref_SPKLW | tiingo:NASDAQ:SPKLW:2023-11-27 | tiingo:PINK:SPKLW:2026-10-07 | PROVIDER_HISTORY_RESTARTED | Altzeile (Beginn 2023-11-27) beim Anbieter entfallen, neue Zeile erst seit 2026-10-07: ob dasselbe Wertpapier fortgeführt wird (Reverse Split, Umfirmierung, CUSIP-Wechsel) oder ein anderer Emittent den Ticker übernommen hat, belegt die Anbieterliste nicht |
| ref_TETE | tiingo:NASDAQ:TETE:2022-03-09 | tiingo:NASDAQ:TETE:2026-10-07 | PROVIDER_HISTORY_RESTARTED | Altzeile (Beginn 2022-03-09) beim Anbieter entfallen, neue Zeile erst seit 2026-10-07: ob dasselbe Wertpapier fortgeführt wird (Reverse Split, Umfirmierung, CUSIP-Wechsel) oder ein anderer Emittent den Ticker übernommen hat, belegt die Anbieterliste nicht |
| ref_TETEW | tiingo:NASDAQ:TETEW:2022-03-14 | tiingo:NASDAQ:TETEW:2026-10-07 | PROVIDER_HISTORY_RESTARTED | Altzeile (Beginn 2022-03-14) beim Anbieter entfallen, neue Zeile erst seit 2026-10-07: ob dasselbe Wertpapier fortgeführt wird (Reverse Split, Umfirmierung, CUSIP-Wechsel) oder ein anderer Emittent den Ticker übernommen hat, belegt die Anbieterliste nicht |
| ref_TRT | tiingo:AMEX:TRT:1995-04-24 | tiingo:NYSE MKT:TRT:1995-04-24 | EXCHANGE_LABEL_RENAMED | gleiches Listing (Beginn 1995-04-24), Börsenbezeichnung AMEX → NYSE MKT (dieselbe Börsenfamilie NYSE); SEC widerspricht (TRT → CIK 0000732026 TRIO-TECH INTERNATIONAL (Nasdaq)) |
| ref_TRUE | tiingo:NASDAQ:TRUE:2000-05-02 | tiingo:NASDAQ:TRUE:2014-05-16 | START_DATE_RESTATED | gleiches Listing an NASDAQ, Anbieter korrigiert den Beginn 2000-05-02 → 2014-05-16; SEC bestätigt nicht (TRUE nicht gelistet) |
| ref_VTAK | tiingo:AMEX:VTAK:2018-09-27 | tiingo:AMEX:VTAK:2026-10-05 | PROVIDER_HISTORY_RESTARTED | Altzeile (Beginn 2018-09-27) beim Anbieter entfallen, neue Zeile erst seit 2026-10-05: ob dasselbe Wertpapier fortgeführt wird (Reverse Split, Umfirmierung, CUSIP-Wechsel) oder ein anderer Emittent den Ticker übernommen hat, belegt die Anbieterliste nicht |
| ref_XRPN | tiingo:NASDAQ:XRPN:2025-06-24 | tiingo:NASDAQ:XRPN:2025-06-24\|tiingo:NASDAQ:XRPN:2026-10-09 | TWO_ACTIVE_LISTINGS | zwei aktive Anbieterzeilen (tiingo:NASDAQ:XRPN:2025-06-24, tiingo:NASDAQ:XRPN:2026-10-09); welches Listing gilt, ist offen, die ältere Zeile altert erst nach 30 Tagen aus |
| ref_XRPNW | tiingo:NASDAQ:XRPNW:2025-06-24 | tiingo:NASDAQ:XRPNW:2025-06-24\|tiingo:NASDAQ:XRPNW:2026-10-12 | TWO_ACTIVE_LISTINGS | zwei aktive Anbieterzeilen (tiingo:NASDAQ:XRPNW:2026-10-12, tiingo:NASDAQ:XRPNW:2025-06-24); welches Listing gilt, ist offen, die ältere Zeile altert erst nach 30 Tagen aus |

**Freigabefähig (Stichprobe je Klasse, höchstens 8; vollständig in der Freigabedatei):**

| securityId | von | nach | Klasse | Beleg |
|---|---|---|---|---|
| ref_AAAP | tiingo:NASDAQ:AAAP:2015-11-11 | tiingo:NASDAQ:AAAP:2015-11-11\|tiingo:NASDAQ:AAAP:2026-06-23 | TICKER_REUSE_NEW_LISTING | prev [NASDAQ:2015-11-11..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2015-11-11..2018-02-20 INACTIVE EQUITY_COMMON; NASDAQ:2026-06-23..2026-10-28 ACTIVE ETF] · SEC: AAAP nicht gelistet |
| ref_ABI | tiingo:NASDAQ:ABI:2009-05-11 | tiingo:NASDAQ:ABI:2009-05-11\|tiingo:NASDAQ:ABI:2025-06-26 | TICKER_REUSE_NEW_LISTING | prev [NASDAQ:2009-05-11..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2025-06-26..2026-10-28 ACTIVE ETF; NASDAQ:2009-05-11..2014-05-15 INACTIVE EQUITY_COMMON] · SEC: ABI nicht gelistet |
| ref_AEC | tiingo:NASDAQ:AEC:1993-11-11 | tiingo:NASDAQ:AEC:1993-11-11\|tiingo:NASDAQ:AEC:2025-09-18 | TICKER_REUSE_NEW_LISTING | prev [NASDAQ:1993-11-11..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2025-09-18..2026-10-28 ACTIVE EQUITY_COMMON geeignet; NASDAQ:1993-11-11..2015-08-14 INACTIVE EQUITY_COMMON] · SEC: AEC → CIK 0001519469 ANFIELD ENERGY INC. (Nasdaq) |
| ref_ALPS | tiingo:NASDAQ:ALPS:2022-09-28 | tiingo:EXPM:ALPS:2021-10-18\|tiingo:NASDAQ:ALPS:2022-09-28\|tiingo:NASDAQ:ALPS:2025-10-31 | TICKER_REUSE_NEW_LISTING | prev [NASDAQ:2022-09-28..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2025-10-31..2026-10-28 ACTIVE EQUITY_COMMON geeignet; NASDAQ:2022-09-28..2023-07-20 INACTIVE EQUITY_COMMON; EXPM:2021-10-18..2022-09-27 INACTIVE EQUITY_COMMON] · SEC: ALPS → CIK 0002025774 Alps Group Inc (Nasdaq) |
| ref_AMBR | tiingo:NASDAQ:AMBR:2014-03-21 | tiingo:NASDAQ:AMBR:2014-03-21\|tiingo:NASDAQ:AMBR:2025-03-13 | TICKER_REUSE_NEW_LISTING | prev [NASDAQ:2014-03-21..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2025-03-13..2026-10-28 ACTIVE EQUITY_COMMON geeignet; NASDAQ:2014-03-21..2019-07-29 INACTIVE EQUITY_COMMON] · SEC: AMBR → CIK 0001697818 Amber International Holding Ltd (Nasdaq) |
| ref_ANV | tiingo:NASDAQ:ANV:2007-05-10 | tiingo:NASDAQ:ANV:2007-05-10\|tiingo:NASDAQ:ANV:2026-02-03 | TICKER_REUSE_NEW_LISTING | prev [NASDAQ:2007-05-10..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2026-02-03..2026-10-28 ACTIVE ETF; NASDAQ:2007-05-10..2015-03-09 INACTIVE EQUITY_COMMON] · SEC: ANV nicht gelistet |
| ref_ARTC | tiingo:NASDAQ:ARTC:1996-02-05 | tiingo:NASDAQ:ARTC:1996-02-05\|tiingo:NASDAQ:ARTC:2026-02-27 | TICKER_REUSE_NEW_LISTING | prev [NASDAQ:1996-02-05..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:1996-02-05..2014-05-29 INACTIVE EQUITY_COMMON; NASDAQ:2026-02-27..2026-10-28 ACTIVE EQUITY_COMMON geeignet] · SEC: ARTC → CIK 0002086545 Art Technology Acquisition Corp. (Nasdaq) |
| ref_ATCX | tiingo:NASDAQ:ATCX:2019-01-23 | tiingo:NASDAQ:ATCX:2019-01-23\|tiingo:NASDAQ:ATCX:2026-01-09 | TICKER_REUSE_NEW_LISTING | prev [NASDAQ:2019-01-23..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2019-01-23..2023-04-19 INACTIVE EQUITY_COMMON; NASDAQ:2026-01-09..2026-10-28 ACTIVE EQUITY_COMMON geeignet] · SEC: ATCX → CIK 0001684688 ATLAS CRITICAL MINERALS Corp (Nasdaq) |
| ref_AMZE | tiingo:NYSE MKT:AMZE:2021-12-14 | tiingo:OTCMKTS:AMZE:2021-12-14 | MOVED_TO_OTC | prev [NYSE MKT:2021-12-14..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [OTCMKTS:2021-12-14..2026-10-28 ACTIVE EQUITY_COMMON] · SEC: AMZE → CIK 0001880343 AMAZE HOLDINGS, INC. (OTC) |
| ref_CLRCU | tiingo:NASDAQ:CLRCU:2022-04-28 | tiingo:OTCMKTS:CLRCU:2022-04-28 | MOVED_TO_OTC | prev [NASDAQ:2022-04-28..2026-09-10 ACTIVE UNIT] → next [OTCMKTS:2022-04-28..2026-10-28 ACTIVE UNIT] · SEC: CLRCU nicht gelistet |
| ref_FEED | tiingo:NASDAQ:FEED:2017-06-13 | tiingo:OTCMKTS:FEED:2017-06-13 | MOVED_TO_OTC | prev [NASDAQ:2017-06-13..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [OTCMKTS:2017-06-13..2026-10-28 ACTIVE EQUITY_COMMON] · SEC: FEED → CIK 0001326706 ENvue Medical, Inc. (OTC) |
| ref_ILLRW | tiingo:NASDAQ:ILLRW:2019-07-30 | tiingo:OTCMKTS:ILLRW:2019-07-30 | MOVED_TO_OTC | prev [NASDAQ:2019-07-30..2026-09-10 ACTIVE WARRANT] → next [OTCMKTS:2019-07-30..2026-10-28 ACTIVE WARRANT] · SEC: ILLRW → CIK 0001769624 Triller Group Inc. (OTC) |
| ref_IVCB | tiingo:NASDAQ:IVCB:2022-02-04 | tiingo:OTCMKTS:IVCB:2022-02-04 | MOVED_TO_OTC | prev [NASDAQ:2022-02-04..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [OTCMKTS:2022-02-04..2026-10-28 ACTIVE EQUITY_COMMON] · SEC: IVCB nicht gelistet |
| ref_IVCBU | tiingo:NASDAQ:IVCBU:2021-12-15 | tiingo:OTCMKTS:IVCBU:2021-12-15 | MOVED_TO_OTC | prev [NASDAQ:2021-12-15..2026-09-10 ACTIVE UNIT] → next [OTCMKTS:2021-12-15..2026-10-28 ACTIVE UNIT] · SEC: IVCBU nicht gelistet |
| ref_LILMW | tiingo:NASDAQ:LILMW:2021-09-15 | tiingo:OTCMKTS:LILMW:2021-09-15 | MOVED_TO_OTC | prev [NASDAQ:2021-09-15..2026-09-10 ACTIVE WARRANT] → next [OTCMKTS:2021-09-15..2026-10-28 ACTIVE WARRANT] · SEC: LILMW nicht gelistet |
| ref_MSSAU | tiingo:NASDAQ:MSSAU:2022-04-01 | tiingo:OTCMKTS:MSSAU:2022-04-01 | MOVED_TO_OTC | prev [NASDAQ:2022-04-01..2026-09-10 ACTIVE UNIT] → next [OTCMKTS:2022-04-01..2026-10-28 ACTIVE UNIT] · SEC: MSSAU nicht gelistet |
| ref_AZTR | tiingo:AMEX:AZTR:2023-06-16 | tiingo:NYSE MKT:AZTR:2023-06-16 | EXCHANGE_LABEL_RENAMED | prev [AMEX:2023-06-16..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NYSE MKT:2023-06-16..2026-10-28 ACTIVE EQUITY_COMMON geeignet] · SEC: AZTR → CIK 0001701478 Azitra, Inc. (NYSE) |
| ref_MMA | tiingo:AMEX:MMA:2024-03-28 | tiingo:NYSE MKT:MMA:2024-03-28 | EXCHANGE_LABEL_RENAMED | prev [AMEX:2024-03-28..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NYSE MKT:2024-03-28..2026-10-28 ACTIVE EQUITY_COMMON geeignet] · SEC: MMA → CIK 0001981519 MIXED MARTIAL ARTS GROUP LTD (NYSE) |
| ref_MTNB | tiingo:AMEX:MTNB:2014-08-18 | tiingo:NYSE MKT:MTNB:2014-08-18 | EXCHANGE_LABEL_RENAMED | prev [AMEX:2014-08-18..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NYSE MKT:2014-08-18..2026-10-28 ACTIVE EQUITY_COMMON geeignet] · SEC: MTNB → CIK 0001582554 Matinas BioPharma Holdings, Inc. (NYSE) |
| ref_OPTT | tiingo:AMEX:OPTT:2007-04-25 | tiingo:NYSE MKT:OPTT:2007-04-25 | EXCHANGE_LABEL_RENAMED | prev [AMEX:2007-04-25..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NYSE MKT:2007-04-25..2026-10-28 ACTIVE EQUITY_COMMON geeignet] · SEC: OPTT → CIK 0001378140 Ocean Power Technologies, Inc. (NYSE) |
| ref_POAS | tiingo:AMEX:POAS:2025-11-13 | tiingo:NYSE MKT:POAS:2025-11-13 | EXCHANGE_LABEL_RENAMED | prev [AMEX:2025-11-13..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NYSE MKT:2025-11-13..2026-10-28 ACTIVE EQUITY_COMMON geeignet] · SEC: POAS → CIK 0002024258 PHAOS TECHNOLOGY HOLDINGS (CAYMAN) Ltd (NYSE) |
| ref_SOAR | tiingo:AMEX:SOAR:2022-01-21 | tiingo:NYSE MKT:SOAR:2022-01-21 | EXCHANGE_LABEL_RENAMED | prev [AMEX:2022-01-21..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NYSE MKT:2022-01-21..2026-10-28 ACTIVE EQUITY_COMMON geeignet] · SEC: SOAR → CIK 0001853070 SOAR AI, Inc. (NYSE) |
| ref_DBRG_P_H | tiingo:NYSE:DBRG-P-H:2017-01-11\|tiingo:NYSE:DBRG-P-H:2021-06-22 | tiingo:NYSE:DBRG-P-H:2021-06-22 | HISTORICAL_ROW_DROPPED | prev [NYSE:2017-01-11..2021-06-22 INACTIVE PREFERRED; NYSE:2021-06-22..2026-09-10 ACTIVE PREFERRED] → next [NYSE:2021-06-22..2026-10-02 ACTIVE PREFERRED] · SEC: DBRG-P-H nicht gelistet |
| ref_ELE | tiingo:NASDAQ:ELE:2026-05-26 | tiingo:NASDAQ:ELE:2025-11-25 | START_DATE_RESTATED | prev [NASDAQ:2026-05-26..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2025-11-25..2026-10-28 ACTIVE EQUITY_COMMON geeignet] · SEC: ELE → CIK 0002086771 Elemental Royalty Corp (Nasdaq) |
| ref_MDCX | tiingo:NASDAQ:MDCX:2016-02-03 | tiingo:NASDAQ:MDCX:2011-02-23 | START_DATE_RESTATED | prev [NASDAQ:2016-02-03..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2011-02-23..2026-10-28 ACTIVE EQUITY_COMMON geeignet] · SEC: MDCX → CIK 0001997296 Medicus Pharma Ltd. (Nasdaq) |
| ref_OGC | tiingo:NYSE:OGC:2026-05-26 | tiingo:NYSE:OGC:2026-04-07 | START_DATE_RESTATED | prev [NYSE:2026-05-26..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NYSE:2026-04-07..2026-10-28 ACTIVE EQUITY_COMMON geeignet] · SEC: OGC → CIK 0001487326 OceanaGold Corp (NYSE) |
| ref_RCAT | tiingo:NASDAQ:RCAT:2017-09-22 | tiingo:NASDAQ:RCAT:2008-01-31 | START_DATE_RESTATED | prev [NASDAQ:2017-09-22..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2008-01-31..2026-10-28 ACTIVE EQUITY_COMMON geeignet] · SEC: RCAT → CIK 0000748268 Red Cat Holdings, Inc. (Nasdaq) |
| ref_INCR | tiingo:NASDAQ:INCR:2014-11-07\|tiingo:NASDAQ:INCR:2019-01-28 | tiingo:NASDAQ:INCR:2014-11-07\|tiingo:NASDAQ:INCR:2019-01-28\|tiingo:NASDAQ:INCR:2021-09-01 | LISTING_RESTART | prev [NASDAQ:2019-01-28..2021-08-31 INACTIVE EQUITY_COMMON; NASDAQ:2014-11-07..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2014-11-07..2018-01-05 INACTIVE EQUITY_COMMON; NASDAQ:2019-01-28..2021-08-31 INACTIVE EQUITY_COMMON; NASDAQ:2021-09-01..2026-10-28 ACTIVE EQUITY_COMMON geeignet] · SEC: INCR → CIK 0001857030 Intercure Ltd. (Nasdaq) |
| ref_JCSE | tiingo:NASDAQ:JCSE:2022-04-22 | tiingo:NASDAQ:JCSE:2022-04-22\|tiingo:NASDAQ:JCSE:2026-09-21 | LISTING_RESTART | prev [NASDAQ:2022-04-22..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2022-04-22..2026-09-18 INACTIVE EQUITY_COMMON; NASDAQ:2026-09-21..2026-10-28 ACTIVE EQUITY_COMMON geeignet] · SEC: JCSE → CIK 0001905511 JE Cleantech Holdings Ltd (Nasdaq) |
| ref_NXDR | tiingo:NYSE:NXDR:2021-03-24 | tiingo:NASDAQ:NXDR:2021-03-24 | EXCHANGE_TRANSFER | prev [NYSE:2021-03-24..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2021-03-24..2026-10-28 ACTIVE EQUITY_COMMON geeignet] · SEC: NXDR → CIK 0001846069 Nextdoor Holdings, Inc. (Nasdaq) |

### Deaktivierungen (aktiv → inaktiv): 100 gesamt, 84 freigabefähig, 16 nicht freigabefähig

| Klasse | Anzahl |
|---|---:|
| PROVIDER_ENDDATE_AGED | 67 |
| PROVIDER_ENDDATE_RESTATED | 28 |
| WITH_CANONICAL_CHANGE:PROVIDER_HISTORY_RESTARTED | 2 |
| WITH_CANONICAL_CHANGE:MOVED_TO_OTC | 2 |
| WITH_CANONICAL_CHANGE:TICKER_REUSE_NEW_LISTING | 1 |

**Nicht freigabefähig (vollständig, 16):**

| securityId | von | nach | Klasse | Grund |
|---|---|---|---|---|
| ref_ACTS | ACTIVE | INACTIVE | PROVIDER_ENDDATE_RESTATED | eigene Tagesreihe (discover-series) läuft bis 2026-10-29, Anbieter-Ende 2016-12-20: Kurse stammen von einem laufenden Listing (Ticker-Wiederverwendung oder Anbieterkorrektur), Identitätsbefund statt Delisting |
| ref_BREW | ACTIVE | INACTIVE | PROVIDER_ENDDATE_RESTATED | eigene Tagesreihe (discover-series) läuft bis 2026-10-29, Anbieter-Ende 2020-09-30: Kurse stammen von einem laufenden Listing (Ticker-Wiederverwendung oder Anbieterkorrektur), Identitätsbefund statt Delisting |
| ref_EDVA | ACTIVE | INACTIVE | PROVIDER_ENDDATE_AGED | eigene Tagesreihe (discover-series) läuft bis 2026-10-29, Anbieter-Ende 2026-08-21: Kurse stammen von einem laufenden Listing (Ticker-Wiederverwendung oder Anbieterkorrektur), Identitätsbefund statt Delisting |
| ref_ENTL | ACTIVE | INACTIVE | PROVIDER_ENDDATE_RESTATED | eigene Tagesreihe (discover-series) läuft bis 2026-10-29, Anbieter-Ende 2018-02-28: Kurse stammen von einem laufenden Listing (Ticker-Wiederverwendung oder Anbieterkorrektur), Identitätsbefund statt Delisting |
| ref_FGNXP | ACTIVE | INACTIVE | WITH_CANONICAL_CHANGE:PROVIDER_HISTORY_RESTARTED | folgt aus dem nicht freigabefähigen canonical_id-Wechsel (PROVIDER_HISTORY_RESTARTED) |
| ref_FTPA | ACTIVE | INACTIVE | PROVIDER_ENDDATE_RESTATED | eigene Tagesreihe (discover-series) läuft bis 2026-10-29, Anbieter-Ende 2023-03-15: Kurse stammen von einem laufenden Listing (Ticker-Wiederverwendung oder Anbieterkorrektur), Identitätsbefund statt Delisting |
| ref_GNMX | ACTIVE | INACTIVE | PROVIDER_ENDDATE_RESTATED | eigene Tagesreihe (discover-series) läuft bis 2026-10-29, Anbieter-Ende 2020-02-03: Kurse stammen von einem laufenden Listing (Ticker-Wiederverwendung oder Anbieterkorrektur), Identitätsbefund statt Delisting |
| ref_INVN | ACTIVE | INACTIVE | PROVIDER_ENDDATE_RESTATED | eigene Tagesreihe (discover-series) läuft bis 2026-10-29, Anbieter-Ende 2017-07-17: Kurse stammen von einem laufenden Listing (Ticker-Wiederverwendung oder Anbieterkorrektur), Identitätsbefund statt Delisting |
| ref_NMBL | ACTIVE | INACTIVE | PROVIDER_ENDDATE_RESTATED | eigene Tagesreihe (discover-series) läuft bis 2026-10-29, Anbieter-Ende 2017-08-17: Kurse stammen von einem laufenden Listing (Ticker-Wiederverwendung oder Anbieterkorrektur), Identitätsbefund statt Delisting |
| ref_NYNY | ACTIVE | INACTIVE | PROVIDER_ENDDATE_RESTATED | eigene Tagesreihe (discover-series) läuft bis 2026-10-29, Anbieter-Ende 2019-11-22: Kurse stammen von einem laufenden Listing (Ticker-Wiederverwendung oder Anbieterkorrektur), Identitätsbefund statt Delisting |
| ref_PCLN | ACTIVE | INACTIVE | PROVIDER_ENDDATE_RESTATED | eigene Tagesreihe (discover-series) läuft bis 2026-10-29, Anbieter-Ende 2018-02-26: Kurse stammen von einem laufenden Listing (Ticker-Wiederverwendung oder Anbieterkorrektur), Identitätsbefund statt Delisting |
| ref_RITR | ACTIVE | INACTIVE | WITH_CANONICAL_CHANGE:PROVIDER_HISTORY_RESTARTED | folgt aus dem nicht freigabefähigen canonical_id-Wechsel (PROVIDER_HISTORY_RESTARTED) |
| ref_TRIL | ACTIVE | INACTIVE | PROVIDER_ENDDATE_RESTATED | eigene Tagesreihe (discover-series) läuft bis 2026-10-29, Anbieter-Ende 2021-11-18: Kurse stammen von einem laufenden Listing (Ticker-Wiederverwendung oder Anbieterkorrektur), Identitätsbefund statt Delisting |
| ref_USX | ACTIVE | INACTIVE | PROVIDER_ENDDATE_RESTATED | eigene Tagesreihe (discover-series) läuft bis 2026-10-29, Anbieter-Ende 2023-06-30: Kurse stammen von einem laufenden Listing (Ticker-Wiederverwendung oder Anbieterkorrektur), Identitätsbefund statt Delisting |
| ref_WR | ACTIVE | INACTIVE | PROVIDER_ENDDATE_RESTATED | eigene Tagesreihe (discover-series) läuft bis 2026-10-29, Anbieter-Ende 2018-06-05: Kurse stammen von einem laufenden Listing (Ticker-Wiederverwendung oder Anbieterkorrektur), Identitätsbefund statt Delisting |
| ref_WX | ACTIVE | INACTIVE | PROVIDER_ENDDATE_RESTATED | eigene Tagesreihe (discover-series) läuft bis 2026-10-29, Anbieter-Ende 2015-12-10: Kurse stammen von einem laufenden Listing (Ticker-Wiederverwendung oder Anbieterkorrektur), Identitätsbefund statt Delisting |

**Freigabefähig (Stichprobe je Klasse, höchstens 8; vollständig in der Freigabedatei):**

| securityId | von | nach | Klasse | Beleg |
|---|---|---|---|---|
| ref_AACBR | ACTIVE | INACTIVE | PROVIDER_ENDDATE_AGED | prev [NASDAQ:2025-04-07..2026-08-19 ACTIVE RIGHT] → next [NASDAQ:2025-04-07..2026-08-19 INACTIVE RIGHT] · SEC: AACBR nicht gelistet |
| ref_AIHS | ACTIVE | INACTIVE | PROVIDER_ENDDATE_AGED | prev [NASDAQ:2026-08-26..2026-08-27 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2026-08-26..2026-08-27 INACTIVE EQUITY_COMMON] · SEC: AIHS nicht gelistet |
| ref_ANSCW | ACTIVE | INACTIVE | PROVIDER_ENDDATE_AGED | prev [NASDAQ:2024-01-03..2026-08-12 ACTIVE WARRANT] → next [NASDAQ:2024-01-03..2026-08-12 INACTIVE WARRANT] · SEC: ANSCW nicht gelistet |
| ref_APGE | ACTIVE | INACTIVE | PROVIDER_ENDDATE_AGED | prev [NASDAQ:2023-07-14..2026-09-04 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2023-07-14..2026-09-04 INACTIVE EQUITY_COMMON] · SEC: APGE nicht gelistet |
| ref_AREN | ACTIVE | INACTIVE | PROVIDER_ENDDATE_AGED | prev [NYSE MKT:2007-07-13..2026-08-28 ACTIVE EQUITY_COMMON geeignet] → next [NYSE MKT:2007-07-13..2026-08-28 INACTIVE EQUITY_COMMON] · SEC: AREN nicht gelistet |
| ref_ARQQW | ACTIVE | INACTIVE | PROVIDER_ENDDATE_AGED | prev [NASDAQ:2021-04-06..2026-09-02 ACTIVE WARRANT] → next [NASDAQ:2021-04-06..2026-09-02 INACTIVE WARRANT] · SEC: ARQQW nicht gelistet |
| ref_AVB | ACTIVE | INACTIVE | PROVIDER_ENDDATE_AGED | prev [NYSE:1994-03-11..2026-08-17 ACTIVE EQUITY_COMMON geeignet] → next [NYSE:1994-03-11..2026-08-17 INACTIVE EQUITY_COMMON] · SEC: AVB nicht gelistet |
| ref_BBCQU | ACTIVE | INACTIVE | PROVIDER_ENDDATE_AGED | prev [NASDAQ:2026-01-08..2026-08-27 ACTIVE UNIT] → next [NASDAQ:2026-01-08..2026-08-27 INACTIVE UNIT] · SEC: BBCQU nicht gelistet |
| ref_ATAI | ACTIVE | INACTIVE | PROVIDER_ENDDATE_RESTATED | prev [NASDAQ:2021-06-18..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2021-06-18..2026-09-11 INACTIVE EQUITY_COMMON] · SEC: ATAI nicht gelistet |
| ref_BRRWW | ACTIVE | INACTIVE | PROVIDER_ENDDATE_RESTATED | prev [NASDAQ:2025-07-31..2026-09-10 ACTIVE WARRANT] → next [NASDAQ:2025-07-31..2026-09-25 INACTIVE WARRANT] · SEC: BRRWW nicht gelistet |
| ref_HCWC | ACTIVE | INACTIVE | PROVIDER_ENDDATE_RESTATED | prev [AMEX:2024-09-16..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [AMEX:2024-09-16..2026-09-17 INACTIVE EQUITY_COMMON] · SEC: HCWC nicht gelistet |
| ref_HVII | ACTIVE | INACTIVE | PROVIDER_ENDDATE_RESTATED | prev [NASDAQ:2025-02-10..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2025-02-10..2026-09-23 INACTIVE EQUITY_COMMON] · SEC: HVII nicht gelistet |
| ref_HVIIU | ACTIVE | INACTIVE | PROVIDER_ENDDATE_RESTATED | prev [NASDAQ:2025-01-17..2026-09-10 ACTIVE UNIT] → next [NASDAQ:2025-01-17..2026-09-24 INACTIVE UNIT] · SEC: HVIIU nicht gelistet |
| ref_IPEXR | ACTIVE | INACTIVE | PROVIDER_ENDDATE_RESTATED | prev [NASDAQ:2025-03-07..2026-09-10 ACTIVE RIGHT] → next [NASDAQ:2025-03-07..2026-09-28 INACTIVE RIGHT] · SEC: IPEXR nicht gelistet |
| ref_IPEXU | ACTIVE | INACTIVE | PROVIDER_ENDDATE_RESTATED | prev [NASDAQ:2025-02-13..2026-09-10 ACTIVE UNIT] → next [NASDAQ:2025-02-13..2026-09-28 INACTIVE UNIT] · SEC: IPEXU nicht gelistet |
| ref_JSPRW | ACTIVE | INACTIVE | PROVIDER_ENDDATE_RESTATED | prev [NASDAQ:2020-01-10..2026-09-10 ACTIVE WARRANT] → next [NASDAQ:2020-01-10..2026-09-25 INACTIVE WARRANT] · SEC: JSPRW nicht gelistet |
| ref_BCAR | ACTIVE | INACTIVE | WITH_CANONICAL_CHANGE:TICKER_REUSE_NEW_LISTING | prev [NASDAQ:2012-03-07..2026-08-27 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2025-08-20..2026-08-27 INACTIVE EQUITY_COMMON; NASDAQ:2012-03-07..2015-08-03 INACTIVE EQUITY_COMMON] · SEC: BCAR nicht gelistet |
| ref_SNYR | ACTIVE | INACTIVE | WITH_CANONICAL_CHANGE:MOVED_TO_OTC | prev [NASDAQ:2016-01-04..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [OTCMKTS:2016-01-04..2026-09-18 INACTIVE EQUITY_COMMON] · SEC: SNYR nicht gelistet |
| ref_SVMH | ACTIVE | INACTIVE | WITH_CANONICAL_CHANGE:MOVED_TO_OTC | prev [NASDAQ:2023-12-08..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [OTCMKTS:2023-12-08..2026-09-23 INACTIVE EQUITY_COMMON] · SEC: SVMH nicht gelistet |

### Eignungswechsel: 220 gesamt, 203 freigabefähig, 17 nicht freigabefähig

| Klasse | Anzahl |
|---|---:|
| APPROVED_1_0_0 | 138 |
| CAUSED_BY:Deaktivierung=freigabefähig | 43 |
| CAUSED_BY:canonical_id=freigabefähig | 21 |
| CAUSED_BY:Deaktivierung=nicht | 14 |
| CAUSED_BY:canonical_id=nicht | 3 |
| ELIGIBLE_ROW_AGED_OUT | 1 |

**Nicht freigabefähig (vollständig, 17):**

| securityId | von | nach | Klasse | Grund |
|---|---|---|---|---|
| ref_ACTS | true | false | CAUSED_BY:Deaktivierung=PROVIDER_ENDDATE_RESTATED | Folge von Deaktivierung (PROVIDER_ENDDATE_RESTATED, nicht freigabefähig) |
| ref_BREW | true | false | CAUSED_BY:Deaktivierung=PROVIDER_ENDDATE_RESTATED | Folge von Deaktivierung (PROVIDER_ENDDATE_RESTATED, nicht freigabefähig) |
| ref_CAM | true | false | CAUSED_BY:canonical_id=UNCLEAR_REPLACEMENT | Folge von canonical_id (UNCLEAR_REPLACEMENT, nicht freigabefähig) |
| ref_EDVA | true | false | CAUSED_BY:Deaktivierung=PROVIDER_ENDDATE_AGED | Folge von Deaktivierung (PROVIDER_ENDDATE_AGED, nicht freigabefähig) |
| ref_ENTL | true | false | CAUSED_BY:Deaktivierung=PROVIDER_ENDDATE_RESTATED | Folge von Deaktivierung (PROVIDER_ENDDATE_RESTATED, nicht freigabefähig) |
| ref_FTPA | true | false | CAUSED_BY:Deaktivierung=PROVIDER_ENDDATE_RESTATED | Folge von Deaktivierung (PROVIDER_ENDDATE_RESTATED, nicht freigabefähig) |
| ref_GNMX | true | false | CAUSED_BY:Deaktivierung=PROVIDER_ENDDATE_RESTATED | Folge von Deaktivierung (PROVIDER_ENDDATE_RESTATED, nicht freigabefähig) |
| ref_INVN | true | false | CAUSED_BY:Deaktivierung=PROVIDER_ENDDATE_RESTATED | Folge von Deaktivierung (PROVIDER_ENDDATE_RESTATED, nicht freigabefähig) |
| ref_NMBL | true | false | CAUSED_BY:Deaktivierung=PROVIDER_ENDDATE_RESTATED | Folge von Deaktivierung (PROVIDER_ENDDATE_RESTATED, nicht freigabefähig) |
| ref_NYNY | true | false | CAUSED_BY:Deaktivierung=PROVIDER_ENDDATE_RESTATED | Folge von Deaktivierung (PROVIDER_ENDDATE_RESTATED, nicht freigabefähig) |
| ref_PCLN | true | false | CAUSED_BY:Deaktivierung=PROVIDER_ENDDATE_RESTATED | Folge von Deaktivierung (PROVIDER_ENDDATE_RESTATED, nicht freigabefähig) |
| ref_RITR | true | false | CAUSED_BY:canonical_id=PROVIDER_HISTORY_RESTARTED+Deaktivierung=WITH_CANONICAL_CHANGE:PROVIDER_HISTORY_RESTARTED | Folge von canonical_id (PROVIDER_HISTORY_RESTARTED, nicht freigabefähig) und Deaktivierung (WITH_CANONICAL_CHANGE:PROVIDER_HISTORY_RESTARTED, nicht freigabefähig) |
| ref_SBXD | true | false | CAUSED_BY:canonical_id=PROVIDER_HISTORY_RESTARTED | Folge von canonical_id (PROVIDER_HISTORY_RESTARTED, nicht freigabefähig) |
| ref_TRIL | true | false | CAUSED_BY:Deaktivierung=PROVIDER_ENDDATE_RESTATED | Folge von Deaktivierung (PROVIDER_ENDDATE_RESTATED, nicht freigabefähig) |
| ref_USX | true | false | CAUSED_BY:Deaktivierung=PROVIDER_ENDDATE_RESTATED | Folge von Deaktivierung (PROVIDER_ENDDATE_RESTATED, nicht freigabefähig) |
| ref_WR | true | false | CAUSED_BY:Deaktivierung=PROVIDER_ENDDATE_RESTATED | Folge von Deaktivierung (PROVIDER_ENDDATE_RESTATED, nicht freigabefähig) |
| ref_WX | true | false | CAUSED_BY:Deaktivierung=PROVIDER_ENDDATE_RESTATED | Folge von Deaktivierung (PROVIDER_ENDDATE_RESTATED, nicht freigabefähig) |

**Freigabefähig (Stichprobe je Klasse, höchstens 8; vollständig in der Freigabedatei):**

| securityId | von | nach | Klasse | Beleg |
|---|---|---|---|---|
| ref_AAAP | true | false | CAUSED_BY:canonical_id=TICKER_REUSE_NEW_LISTING | prev [NASDAQ:2015-11-11..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2015-11-11..2018-02-20 INACTIVE EQUITY_COMMON; NASDAQ:2026-06-23..2026-10-28 ACTIVE ETF] · SEC: AAAP nicht gelistet |
| ref_ABI | true | false | CAUSED_BY:canonical_id=TICKER_REUSE_NEW_LISTING | prev [NASDAQ:2009-05-11..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2025-06-26..2026-10-28 ACTIVE ETF; NASDAQ:2009-05-11..2014-05-15 INACTIVE EQUITY_COMMON] · SEC: ABI nicht gelistet |
| ref_ANV | true | false | CAUSED_BY:canonical_id=TICKER_REUSE_NEW_LISTING | prev [NASDAQ:2007-05-10..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2026-02-03..2026-10-28 ACTIVE ETF; NASDAQ:2007-05-10..2015-03-09 INACTIVE EQUITY_COMMON] · SEC: ANV nicht gelistet |
| ref_DINE | true | false | CAUSED_BY:canonical_id=TICKER_REUSE_NEW_LISTING | prev [NASDAQ:2001-01-02..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2001-01-02..2011-01-03 INACTIVE EQUITY_COMMON; NASDAQ:2026-05-05..2026-10-28 ACTIVE ETF] · SEC: DINE nicht gelistet |
| ref_LMNX | true | false | CAUSED_BY:canonical_id=TICKER_REUSE_NEW_LISTING | prev [NASDAQ:2000-04-06..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2000-04-06..2021-07-14 INACTIVE EQUITY_COMMON; NASDAQ:2025-10-16..2026-10-28 ACTIVE ETF] · SEC: LMNX nicht gelistet |
| ref_LQ | true | false | CAUSED_BY:canonical_id=TICKER_REUSE_NEW_LISTING | prev [NASDAQ:2014-04-09..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2014-04-09..2018-05-31 INACTIVE EQUITY_COMMON; NASDAQ:2026-05-05..2026-10-28 ACTIVE ETF] · SEC: LQ nicht gelistet |
| ref_PCS | true | false | CAUSED_BY:canonical_id=TICKER_REUSE_NEW_LISTING | prev [BATS:2007-04-19..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [BATS:2007-04-19..2013-10-17 INACTIVE EQUITY_COMMON; BATS:2025-08-01..2026-10-28 ACTIVE ETF] · SEC: PCS nicht gelistet |
| ref_PTNT | true | false | CAUSED_BY:canonical_id=TICKER_REUSE_NEW_LISTING | prev [BATS:1999-07-23..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [BATS:1999-07-23..2015-09-22 INACTIVE EQUITY_COMMON; BATS:2026-05-06..2026-10-28 ACTIVE ETF] · SEC: PTNT nicht gelistet |
| ref_AIHS | true | false | CAUSED_BY:Deaktivierung=PROVIDER_ENDDATE_AGED | prev [NASDAQ:2026-08-26..2026-08-27 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2026-08-26..2026-08-27 INACTIVE EQUITY_COMMON] · SEC: AIHS nicht gelistet |
| ref_APGE | true | false | CAUSED_BY:Deaktivierung=PROVIDER_ENDDATE_AGED | prev [NASDAQ:2023-07-14..2026-09-04 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2023-07-14..2026-09-04 INACTIVE EQUITY_COMMON] · SEC: APGE nicht gelistet |
| ref_AREN | true | false | CAUSED_BY:Deaktivierung=PROVIDER_ENDDATE_AGED | prev [NYSE MKT:2007-07-13..2026-08-28 ACTIVE EQUITY_COMMON geeignet] → next [NYSE MKT:2007-07-13..2026-08-28 INACTIVE EQUITY_COMMON] · SEC: AREN nicht gelistet |
| ref_AVB | true | false | CAUSED_BY:Deaktivierung=PROVIDER_ENDDATE_AGED | prev [NYSE:1994-03-11..2026-08-17 ACTIVE EQUITY_COMMON geeignet] → next [NYSE:1994-03-11..2026-08-17 INACTIVE EQUITY_COMMON] · SEC: AVB nicht gelistet |
| ref_BNRG | true | false | CAUSED_BY:Deaktivierung=PROVIDER_ENDDATE_AGED | prev [NASDAQ:2026-08-14..2026-08-14 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2026-08-14..2026-08-14 INACTIVE EQUITY_COMMON] · SEC: BNRG nicht gelistet |
| ref_BTOG | true | false | CAUSED_BY:Deaktivierung=PROVIDER_ENDDATE_AGED | prev [NASDAQ:2019-08-14..2026-09-03 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2019-08-14..2026-09-03 INACTIVE EQUITY_COMMON] · SEC: BTOG nicht gelistet |
| ref_CMII | true | false | CAUSED_BY:Deaktivierung=PROVIDER_ENDDATE_AGED | prev [NASDAQ:2026-05-28..2026-08-26 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2026-05-28..2026-08-26 INACTIVE EQUITY_COMMON] · SEC: CMII nicht gelistet |
| ref_CRNX | true | false | CAUSED_BY:Deaktivierung=PROVIDER_ENDDATE_AGED | prev [NASDAQ:2018-07-18..2026-09-01 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2018-07-18..2026-09-01 INACTIVE EQUITY_COMMON] · SEC: CRNX nicht gelistet |
| ref_AMZE | true | false | CAUSED_BY:canonical_id=MOVED_TO_OTC | prev [NYSE MKT:2021-12-14..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [OTCMKTS:2021-12-14..2026-10-28 ACTIVE EQUITY_COMMON] · SEC: AMZE → CIK 0001880343 AMAZE HOLDINGS, INC. (OTC) |
| ref_FEED | true | false | CAUSED_BY:canonical_id=MOVED_TO_OTC | prev [NASDAQ:2017-06-13..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [OTCMKTS:2017-06-13..2026-10-28 ACTIVE EQUITY_COMMON] · SEC: FEED → CIK 0001326706 ENvue Medical, Inc. (OTC) |
| ref_IVCB | true | false | CAUSED_BY:canonical_id=MOVED_TO_OTC | prev [NASDAQ:2022-02-04..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [OTCMKTS:2022-02-04..2026-10-28 ACTIVE EQUITY_COMMON] · SEC: IVCB nicht gelistet |
| ref_ORIS | true | false | CAUSED_BY:canonical_id=MOVED_TO_OTC | prev [NASDAQ:2024-10-17..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [OTCMKTS:2024-10-17..2026-10-28 ACTIVE EQUITY_COMMON] · SEC: ORIS nicht gelistet |
| ref_QETA | true | false | CAUSED_BY:canonical_id=MOVED_TO_OTC | prev [NASDAQ:2023-11-30..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [OTCMKTS:2023-11-30..2026-10-28 ACTIVE EQUITY_COMMON] · SEC: QETA → CIK 0001978528 Quetta Acquisition Corp (OTC) |
| ref_SNBR | true | false | CAUSED_BY:canonical_id=MOVED_TO_OTC | prev [NASDAQ:1998-12-04..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [OTCMKTS:1998-12-04..2026-10-28 ACTIVE EQUITY_COMMON] · SEC: SNBR nicht gelistet |
| ref_SOBR | true | false | CAUSED_BY:canonical_id=MOVED_TO_OTC | prev [NASDAQ:2013-05-14..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [OTCMKTS:2013-05-14..2026-10-28 ACTIVE EQUITY_COMMON] · SEC: SOBR → CIK 0001425627 SOBR Safe, Inc. (OTC) |
| ref_VLNWF | true | false | CAUSED_BY:canonical_id=MOVED_TO_OTC | prev [NYSE:2020-09-23..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [OTCMKTS:2020-09-23..2026-10-01 ACTIVE EQUITY_COMMON] · SEC: VLNWF nicht gelistet |
| ref_ATAI | true | false | CAUSED_BY:Deaktivierung=PROVIDER_ENDDATE_RESTATED | prev [NASDAQ:2021-06-18..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2021-06-18..2026-09-11 INACTIVE EQUITY_COMMON] · SEC: ATAI nicht gelistet |
| ref_HCWC | true | false | CAUSED_BY:Deaktivierung=PROVIDER_ENDDATE_RESTATED | prev [AMEX:2024-09-16..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [AMEX:2024-09-16..2026-09-17 INACTIVE EQUITY_COMMON] · SEC: HCWC nicht gelistet |
| ref_HVII | true | false | CAUSED_BY:Deaktivierung=PROVIDER_ENDDATE_RESTATED | prev [NASDAQ:2025-02-10..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2025-02-10..2026-09-23 INACTIVE EQUITY_COMMON] · SEC: HVII nicht gelistet |
| ref_RIVR | true | false | CAUSED_BY:Deaktivierung=PROVIDER_ENDDATE_RESTATED | prev [NASDAQ:2016-01-04..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2016-01-04..2026-09-22 INACTIVE EQUITY_COMMON] · SEC: RIVR nicht gelistet |
| ref_BCAR | true | false | CAUSED_BY:canonical_id=TICKER_REUSE_NEW_LISTING+Deaktivierung=WITH_CANONICAL_CHANGE:TICKER_REUSE_NEW_LISTING | prev [NASDAQ:2012-03-07..2026-08-27 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2025-08-20..2026-08-27 INACTIVE EQUITY_COMMON; NASDAQ:2012-03-07..2015-08-03 INACTIVE EQUITY_COMMON] · SEC: BCAR nicht gelistet |
| ref_COOL | true | false | ELIGIBLE_ROW_AGED_OUT | prev [NASDAQ:1999-08-17..2026-05-28 INACTIVE EQUITY_COMMON; NASDAQ:2026-08-13..2026-09-10 ACTIVE ETF; NASDAQ:2021-02-19..2026-08-12 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2026-08-13..2026-10-28 ACTIVE ETF; NASDAQ:2021-02-19..2026-08-12 INACTIVE EQUITY_COMMON; NASDAQ:1999-08-17..2026-05-28 INACTIVE EQUITY_COMMON] · SEC: COOL nicht gelistet |
| ref_SNYR | true | false | CAUSED_BY:canonical_id=MOVED_TO_OTC+Deaktivierung=WITH_CANONICAL_CHANGE:MOVED_TO_OTC | prev [NASDAQ:2016-01-04..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [OTCMKTS:2016-01-04..2026-09-18 INACTIVE EQUITY_COMMON] · SEC: SNYR nicht gelistet |
| ref_SVMH | true | false | CAUSED_BY:canonical_id=MOVED_TO_OTC+Deaktivierung=WITH_CANONICAL_CHANGE:MOVED_TO_OTC | prev [NASDAQ:2023-12-08..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [OTCMKTS:2023-12-08..2026-09-23 INACTIVE EQUITY_COMMON] · SEC: SVMH nicht gelistet |

### Instrumenttyp-Wechsel: 148 gesamt, 147 freigabefähig, 1 nicht freigabefähig

| Klasse | Anzahl |
|---|---:|
| APPROVED_1_0_0 | 138 |
| CAUSED_BY:canonical_id=freigabefähig | 9 |
| CAUSED_BY:canonical_id=nicht | 1 |

**Nicht freigabefähig (vollständig, 1):**

| securityId | von | nach | Klasse | Grund |
|---|---|---|---|---|
| ref_CAM | EQUITY_COMMON | ETF | CAUSED_BY:canonical_id=UNCLEAR_REPLACEMENT | Folge von canonical_id (UNCLEAR_REPLACEMENT, nicht freigabefähig) |

**Freigabefähig (Stichprobe je Klasse, höchstens 8; vollständig in der Freigabedatei):**

| securityId | von | nach | Klasse | Beleg |
|---|---|---|---|---|
| ref_AAAP | EQUITY_COMMON | EQUITY_COMMON\|ETF | CAUSED_BY:canonical_id=TICKER_REUSE_NEW_LISTING | prev [NASDAQ:2015-11-11..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2015-11-11..2018-02-20 INACTIVE EQUITY_COMMON; NASDAQ:2026-06-23..2026-10-28 ACTIVE ETF] · SEC: AAAP nicht gelistet |
| ref_ABI | EQUITY_COMMON | EQUITY_COMMON\|ETF | CAUSED_BY:canonical_id=TICKER_REUSE_NEW_LISTING | prev [NASDAQ:2009-05-11..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2025-06-26..2026-10-28 ACTIVE ETF; NASDAQ:2009-05-11..2014-05-15 INACTIVE EQUITY_COMMON] · SEC: ABI nicht gelistet |
| ref_ANV | EQUITY_COMMON | EQUITY_COMMON\|ETF | CAUSED_BY:canonical_id=TICKER_REUSE_NEW_LISTING | prev [NASDAQ:2007-05-10..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2026-02-03..2026-10-28 ACTIVE ETF; NASDAQ:2007-05-10..2015-03-09 INACTIVE EQUITY_COMMON] · SEC: ANV nicht gelistet |
| ref_DINE | EQUITY_COMMON | EQUITY_COMMON\|ETF | CAUSED_BY:canonical_id=TICKER_REUSE_NEW_LISTING | prev [NASDAQ:2001-01-02..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2001-01-02..2011-01-03 INACTIVE EQUITY_COMMON; NASDAQ:2026-05-05..2026-10-28 ACTIVE ETF] · SEC: DINE nicht gelistet |
| ref_LMNX | EQUITY_COMMON | EQUITY_COMMON\|ETF | CAUSED_BY:canonical_id=TICKER_REUSE_NEW_LISTING | prev [NASDAQ:2000-04-06..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2000-04-06..2021-07-14 INACTIVE EQUITY_COMMON; NASDAQ:2025-10-16..2026-10-28 ACTIVE ETF] · SEC: LMNX nicht gelistet |
| ref_LQ | EQUITY_COMMON | EQUITY_COMMON\|ETF | CAUSED_BY:canonical_id=TICKER_REUSE_NEW_LISTING | prev [NASDAQ:2014-04-09..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2014-04-09..2018-05-31 INACTIVE EQUITY_COMMON; NASDAQ:2026-05-05..2026-10-28 ACTIVE ETF] · SEC: LQ nicht gelistet |
| ref_PCS | EQUITY_COMMON | EQUITY_COMMON\|ETF | CAUSED_BY:canonical_id=TICKER_REUSE_NEW_LISTING | prev [BATS:2007-04-19..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [BATS:2007-04-19..2013-10-17 INACTIVE EQUITY_COMMON; BATS:2025-08-01..2026-10-28 ACTIVE ETF] · SEC: PCS nicht gelistet |
| ref_PTNT | EQUITY_COMMON | EQUITY_COMMON\|ETF | CAUSED_BY:canonical_id=TICKER_REUSE_NEW_LISTING | prev [BATS:1999-07-23..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [BATS:1999-07-23..2015-09-22 INACTIVE EQUITY_COMMON; BATS:2026-05-06..2026-10-28 ACTIVE ETF] · SEC: PTNT nicht gelistet |

### Neue doppelte canonical_id (G6): 1 gesamt, 0 freigabefähig, 1 nicht freigabefähig

| Klasse | Anzahl |
|---|---:|
| PROVIDER_DUPLICATE_ROW | 1 |

**Nicht freigabefähig (vollständig, 1):**

| securityId | von | nach | Klasse | Grund |
|---|---|---|---|---|
| ref_OKE | 1 | 2 | PROVIDER_DUPLICATE_ROW | Anbieterliste führt 2 Zeilen mit identischem Ticker, Börse und Beginn (OKE NYSE 1985-07-01), nur das Enddatum unterscheidet sich (2026-09-14 INACTIVE / 2026-10-28 ACTIVE). Der Erzeuger hängt beide an ref_OKE; damit hätte die securityId zwei Zeilen (BASELINE_MATCH_AMBIGUOUS, nicht mehr backtestfähig: weekly-real-adapter verlangt genau eine Zeile). Eine Freigabe würde diesen Fehler übernehmen; Behebung im Erzeuger (gleiche canonical_id zusammenführen) oder beim Anbieter |

### Namenswechsel (G9): 592 gesamt, 591 freigabefähig, 1 nicht freigabefähig

| Klasse | Anzahl |
|---|---:|
| NAME_ADDED_SEC | 573 |
| RENAMED_SAME_CIK_SEC | 14 |
| RENAMED_SAME_CIK_PROVIDER | 4 |
| ISSUER_CIK_CHANGED | 1 |

**Nicht freigabefähig (vollständig, 1):**

| securityId | von | nach | Klasse | Grund |
|---|---|---|---|---|
| ref_XRPN | Armada Acquisition Corp II - Class A | Evernorth Holdings Inc. | ISSUER_CIK_CHANGED | CIK 0002044009 → 0002092592: anderer Emittent unter dem Ticker (z. B. Fusion oder SPAC-Abschluss), Namenswechsel ist eine Identitätsfrage |

**Freigabefähig (Stichprobe je Klasse, höchstens 8; vollständig in der Freigabedatei):**

| securityId | von | nach | Klasse | Beleg |
|---|---|---|---|---|
| ref_AACIW | – | Armada Acquisition Corp. III | NAME_ADDED_SEC | Name neu aus SEC company_tickers_exchange (CIK 0002092897); der committete Namensstand wurde ohne SEC-Abgleich gebaut (stats.sec = null) · SEC: AACIW → CIK 0002092897 Armada Acquisition Corp. III (Nasdaq) |
| ref_AACOU | – | Abony Acquisition Corp. I | NAME_ADDED_SEC | Name neu aus SEC company_tickers_exchange (CIK 0002099906); der committete Namensstand wurde ohne SEC-Abgleich gebaut (stats.sec = null) · SEC: AACOU → CIK 0002099906 Abony Acquisition Corp. I (Nasdaq) |
| ref_AACOW | – | Abony Acquisition Corp. I | NAME_ADDED_SEC | Name neu aus SEC company_tickers_exchange (CIK 0002099906); der committete Namensstand wurde ohne SEC-Abgleich gebaut (stats.sec = null) · SEC: AACOW → CIK 0002099906 Abony Acquisition Corp. I (Nasdaq) |
| ref_AACPR | – | Apogee Acquisition Corp | NAME_ADDED_SEC | Name neu aus SEC company_tickers_exchange (CIK 0002102123); der committete Namensstand wurde ohne SEC-Abgleich gebaut (stats.sec = null) · SEC: AACPR → CIK 0002102123 Apogee Acquisition Corp (Nasdaq) |
| ref_AACPU | – | Apogee Acquisition Corp | NAME_ADDED_SEC | Name neu aus SEC company_tickers_exchange (CIK 0002102123); der committete Namensstand wurde ohne SEC-Abgleich gebaut (stats.sec = null) · SEC: AACPU → CIK 0002102123 Apogee Acquisition Corp (Nasdaq) |
| ref_AACPW | – | Apogee Acquisition Corp | NAME_ADDED_SEC | Name neu aus SEC company_tickers_exchange (CIK 0002102123); der committete Namensstand wurde ohne SEC-Abgleich gebaut (stats.sec = null) · SEC: AACPW → CIK 0002102123 Apogee Acquisition Corp (Nasdaq) |
| ref_ABLVW | – | Able View Global Inc. | NAME_ADDED_SEC | Name neu aus SEC company_tickers_exchange (CIK 0001957489); der committete Namensstand wurde ohne SEC-Abgleich gebaut (stats.sec = null) · SEC: ABLVW → CIK 0001957489 Able View Global Inc. (Nasdaq) |
| ref_ACAAU | – | Averin Capital Acquisition Corp. | NAME_ADDED_SEC | Name neu aus SEC company_tickers_exchange (CIK 0002096900); der committete Namensstand wurde ohne SEC-Abgleich gebaut (stats.sec = null) · SEC: ACAAU → CIK 0002096900 Averin Capital Acquisition Corp. (Nasdaq) |
| ref_ATTT | Raytech Holding Ltd | Atlas Trinity Tech Ltd | RENAMED_SAME_CIK_PROVIDER | Umfirmierung desselben Emittenten (CIK 0001948443); Quelle TIINGO_METADATA · SEC: ATTT → CIK 0001948443 Atlas Trinity Tech Co., Ltd. (Nasdaq) |
| ref_BTLN | Glimpse Group, Inc. | Brightline Interactive Inc | RENAMED_SAME_CIK_PROVIDER | Umfirmierung desselben Emittenten (CIK 0001854445); Quelle TIINGO_METADATA · SEC: BTLN → CIK 0001854445 Brightline Interactive, Inc./NV (Nasdaq) |
| ref_NXAT | K Wave Media Ltd. | Nexus Advanced Technologies Inc Ord New | RENAMED_SAME_CIK_PROVIDER | Umfirmierung desselben Emittenten (CIK 0002000756); Quelle TIINGO_METADATA · SEC: NXAT → CIK 0002000756 Nexus Advanced Technologies Inc. (Nasdaq) |
| ref_VAI | Senmiao Technology Ltd | Valor Energy Inc | RENAMED_SAME_CIK_PROVIDER | Umfirmierung desselben Emittenten (CIK 0001711012); Quelle TIINGO_METADATA · SEC: VAI → CIK 0001711012 Valor Energy Inc (Nasdaq) |
| ref_BNC | CEA Industries Inc | BNB Standard Corp | RENAMED_SAME_CIK_SEC | Umfirmierung desselben Emittenten (CIK 0001482541); Quelle SEC_COMPANY_TICKERS · SEC: BNC → CIK 0001482541 BNB Standard Corp (Nasdaq) |
| ref_BNCWW | CEA Industries Inc - Warrants (11/02/2027) | BNB Standard Corp | RENAMED_SAME_CIK_SEC | Umfirmierung desselben Emittenten (CIK 0001482541); Quelle SEC_COMPANY_TICKERS · SEC: BNCWW → CIK 0001482541 BNB Standard Corp (Nasdaq) |
| ref_BNCWZ | CEA Industries Inc Warrants | BNB Standard Corp | RENAMED_SAME_CIK_SEC | Umfirmierung desselben Emittenten (CIK 0001482541); Quelle SEC_COMPANY_TICKERS · SEC: BNCWZ → CIK 0001482541 BNB Standard Corp (Nasdaq) |
| ref_DPU | Top KingWin Ltd - Class A | Nexpu Ltd. | RENAMED_SAME_CIK_SEC | Umfirmierung desselben Emittenten (CIK 0001938865); Quelle SEC_COMPANY_TICKERS · SEC: DPU → CIK 0001938865 Nexpu Ltd. (Nasdaq) |
| ref_GHI | Greystone Housing Impact | Greystone Housing Impact Investors LP | RENAMED_SAME_CIK_SEC | Umfirmierung desselben Emittenten (CIK 0001059142); Quelle SEC_COMPANY_TICKERS · SEC: GHI → CIK 0001059142 Greystone Housing Impact Investors LP (NYSE) |
| ref_HELP | Cybin Inc | Helus Pharma Inc. | RENAMED_SAME_CIK_SEC | Umfirmierung desselben Emittenten (CIK 0001833141); Quelle SEC_COMPANY_TICKERS · SEC: HELP → CIK 0001833141 Helus Pharma Inc. (Nasdaq) |
| ref_INVE | Identiv Inc | INVE Technologies, Inc. | RENAMED_SAME_CIK_SEC | Umfirmierung desselben Emittenten (CIK 0001036044); Quelle SEC_COMPANY_TICKERS · SEC: INVE → CIK 0001036044 INVE Technologies, Inc. (Nasdaq) |
| ref_MBAI | CheckCap Ltd | MBody AI Ltd. | RENAMED_SAME_CIK_SEC | Umfirmierung desselben Emittenten (CIK 0001610590); Quelle SEC_COMPANY_TICKERS · SEC: MBAI → CIK 0001610590 MBody AI Ltd. (Nasdaq) |

### Tickerwechsel je securityId: 0 gesamt, 0 freigabefähig, 0 nicht freigabefähig

Keine.

