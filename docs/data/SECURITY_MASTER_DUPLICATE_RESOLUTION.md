# Security Master: belegte Doppelzeilen des Anbieters auflösen

Stand 30.10.2026. Owner-Auftrag vom 30.10.2026: eine enge Korrektur am Erzeuger des US-Wertpapierstamms. Sie löst exakt doppelte Anbieterzeilen derselben Listing-Identität auf, aber nur mit SEC-Beleg und nie über den Ticker allein. Bei jedem Zweifel bleibt der Fall offen.

Nicht Teil dieses PRs: der produktive Lauf mit Klassifikator-Wechsel, Dateien unter `quant/data`, das Übernahme-Gate (`scripts/market/security-master-refresh-gate.mjs`) und seine Freigabedateien. Der einzige Freigabeweg für das Gate bleibt #1143.

## Ergebnis in einem Satz

Von 8 bekannten Doppelungen sind **2 belegt auflösbar** (OKE, TEL) und **6 bleiben offen** (BAM, CCSI, FUN, HUT, NYXH, UHAL-B). Mit Register verschwindet G6 im Gate. Das Gate blockiert trotzdem weiter, und zwar an G7: 27 nicht freigegebene canonical_id-Wechsel. Das liegt an der Anbieterdrift seit dem 29.10. und hat mit diesem PR nichts zu tun.

## 1. Problem

Die canonical_id ist `tiingo:Börse:Ticker:Beginn` und enthält kein Enddatum. Nach einer Holding-Reorganisation oder einem Sitzwechsel führt Tiingo manchmal zwei Zeilen mit identischer canonical_id: die beendete Zeile der alten Aktie und die laufende Zeile der Nachfolgeaktie, die den alten Beginn übernommen hat. `quant/engines/us-security-master.js` ordnet über „Ticker UND Handelsplatz“ zu. Gibt es mehrere Zeilen an der Bestandsbörse, hängt der Erzeuger bewusst **alle** an die securityId (`BASELINE_MATCH_AMBIGUOUS`). Die ID ist dann mehrdeutig und nicht backtestbar. Kommt so ein Fall neu hinzu, blockiert das Gate an G6 (neue doppelte canonical_id), aktuell bei `tiingo:NYSE:OKE:1985-07-01`.

## 2. Lösung (nach dem Muster von #1119)

| Teil | Datei |
|---|---|
| Register (Schema `security-master-duplicate-resolution-1.0.0`, `sources`, ein Eintrag je Fall) | `quant/config/security-master-duplicate-resolution.json` |
| Strenge Prüfung und Anwendung | `quant/engines/us-security-master.js`, Abschnitt `BELEGTE DOPPELZEILEN` (`indexDuplicateResolution`, `applyDuplicateResolution`) |
| Lader (Pflichtdatei, Identität über `core/identity.js`, SHA-256) | `scripts/market/lib/security-master-duplicate-resolution.mjs` |
| Erzeuger | `scripts/market/build-us-security-master.mjs`, Schalter `--duplicate-resolution <Pfad\|none>` (Standard: die committete Datei) |
| Tests (synthetisch, schreiben nur nach `tmpdir`) | `quant/tests/security-master-duplicate-resolution.test.mjs` |

**Aufnahme in das Register:** Alle Bedingungen müssen erfüllt sein. Der Erzeuger prüft jede einzelne. Ein Formfehler bricht den Lauf mit `DUPLICATE_RESOLUTION_INVALID` ab (Exit 2), und es wird nichts geschrieben.

1. Die canonical_id ist identisch (Börse, Ticker, Beginn), dazu gleiche Gattung (`assetType` und abgeleiteter `instrumentType`) und gleiche Währung in **beiden** Zeilen.
2. Die SEC belegt dieselbe Emittentenlinie, in einer von zwei Formen:
   * `12g-3(a)`: Nachfolge-Emittent mit 8-K12B von der Nachfolge-CIK, höchstens 4 Tage nach dem Wirksamkeitstag, mit Accession, Datum und wörtlichem Zitat.
   * `SAME_CIK`: dieselbe CIK auf beiden Seiten, mit zitierter Meldung.

   In beiden Fällen gilt ein Umtausch von genau **1:1**. Ausgeschlossen sind Zusammenschlüsse nach Rule 12g-3(c), andere Umtauschverhältnisse, Abspaltungen und Börsenwechsel.
3. Die eigene Tagesreihe läuft über ±30 Tage um das Ereignis durch. Ersatzweise zählt die Wochenreihe, wenn die Tagesreihe den Zeitraum nicht abdeckt. Verlangt sind mindestens 5 Punkte, eine größte Lücke von höchstens 5 Tagen (täglich) bzw. 8 Tagen (wöchentlich) und eine größte Einzelbewegung unter 25 %. Ein 3:2-Split entspräche 33 %. Messwerte, Datei und SHA-256 stehen im Eintrag. Die Reihe wird beim Erzeugerlauf nicht neu gelesen, weil sie täglich fortgeschrieben wird. Der Eintrag ist der Prüfstand vom 30.10.
4. Das Enddatum der wegfallenden Zeile liegt höchstens 7 Tage vom Wirksamkeitstag entfernt.

**Wirkung im Erzeugerlauf:** Sie tritt nur ein, wenn alles passt, also genau zwei Anbieterzeilen mit dieser canonical_id vorliegen, Gattung und Währung wie im Register sind, eine Zeile exakt am registrierten Enddatum endet, die andere später, und der Bestandstitel des Tickers die registrierte securityId ist. Dann bleibt die Zeile mit dem spätesten Enddatum. Die laufende Nachfolgezeile wird danach normal zugeordnet (`EXCHANGE_MATCH`). An ihr stehen:

* `duplicate_resolution` mit `rule`, `form`, `accession`, `event`, `effectiveDate` und `dropped_row` (canonical_id, Beginn, Ende, Status der weggefallenen Zeile);
* `listing_status` mit dem Zusatz `(Doppelzeile <Beginn>..<Ende> belegt aufgeloest: 8-K12B <Accession>)`;
* das Kennzeichen `PROVIDER_DUPLICATE_ROW_RESOLVED`.

Passt etwas nicht, bleibt die Ausgabe wie ohne Register, und der Kopf meldet den Eintrag unter `duplicateResolution.notApplied` mit Grund. Beispiele: Der Anbieter hat die Altzeile entfernt (`PROVIDER_ROWS_WITH_CANONICAL_ID:1`), eine dritte Zeile ist hinzugekommen, oder das Enddatum hat sich geändert. Zeilen ohne Eintrag berührt das Register nie.

**Artefaktkopf:** Nur mit Register tragen `us-security-master.json`, `summary.json`, `reconciliation.json` und die Arbeitsablage das Feld `duplicateResolution` (Einträge, angewandt, nicht angewandt, Datei, SHA-256). Mit `--duplicate-resolution none` ist die Ausgabe byte-gleich mit dem Stand vor diesem PR. Nachgeprüft ist das in Abschnitt 4.

**Version (Entscheidung):** `VERSION` bleibt `us-security-master-1.3.0`, `CLASSIFICATION_RULE_VERSION` bleibt `us-security-master-rules-1.3.3`. Dafür gibt es drei Gründe:

* Die Freigabedatei aus #1143 (`v130-approved-changes-1.1.0.json`) ist an `toVersion: us-security-master-1.3.0` gebunden. Das Gate prüft `fromVersion`/`toVersion` gegen `prev.version`/`next.version` (G8). Eine Erhöhung auf 1.3.1 würde die einzige Freigabe unbrauchbar machen.
* Eine Erhöhung der Regelversion würde `build-us-eligibility.mjs` dazu bringen, jede Stammzeile neu zu beurteilen (`masterRejudge`). Das wäre eine Nebenwirkung, die mit Doppelzeilen nichts zu tun hat. Die Klassifikationsregeln selbst ändern sich nicht.
* #1119 (SEC-Delisting-Register) ist genauso verfahren.

Nachvollziehbar bleibt die Änderung über `duplicateResolution` im Kopf (mit SHA-256 des Registers) und `duplicate_resolution` an der Zeile.

## 3. Die 8 Fälle einzeln

Anbieterliste: `supported_tickers.zip` vom 30.10.2026, 14:20 UTC, SHA-256 `a35b030e…64b3f3`, 109.165 Zeilen. Sie ist nicht committet. SEC: `data.sec.gov/submissions` und `www.sec.gov/Archives`, abgerufen am 30.10.2026 mit dem User-Agent `VisionUniverseResearch info@visionuniverse.de`. Eigene Reihen: `quant/data/market/discover-series` (täglich, ab 2025-10-03) und `discover-series-long` (wöchentlich), Stand `main`, nur gelesen. Alle 8 Fälle sind im committeten Stamm (Liste vom 11.09.) schon doppelt, außer OKE, das dort noch einzeilig ist. In der Liste vom 30.10. sind alle 8 doppelt. Beide Zeilen sind jeweils `Stock`/`USD` an derselben Börse.

| ID | Anbieterzeilen (Beginn..Ende) | SEC | Eigene Reihe um das Ereignis | Urteil |
|---|---|---|---|---|
| `ref_OKE` | NYSE 1985-07-01..**2026-09-14** · 1985-07-01..2026-10-29 | Holding-Reorganisation, wirksam 10.09.2026. 8-K12B Acc. `0001193125-26-387972` (10.09.) von CIK 0001039684 (ONEOK, Inc., EDGAR führt die CIK fort), Rule 12g-3(a), 1:1 („automatically converted into one share“), „continues to trade on the New York Stock Exchange … on an uninterrupted basis under the ticker symbol ‚OKE‘ with a new CUSIP number (30609A 109)“. Alte Aktie: 25-NSE `0000876661-26-000770` (18.09.), 15-12G `0001193125-26-405508` (28.09.). | täglich, 43 Punkte 11.08.–10.10., größte Lücke 4 Tage, größte Bewegung 3,5 %; 09-10 95,72 · 09-11 96,62 · 09-14 96,97 | **RESOLVED** (Altzeile endet 4 Tage nach dem Ereignis) |
| `ref_TEL` | NYSE 2007-06-14..**2024-09-27** · 2007-06-14..2026-10-29 | Sitzwechsel Schweiz → Irland, wirksam 30.09.2024. 8-K12B Acc. `0001104659-24-103940` (30.09.) von CIK 0001385157 (TE Connectivity plc, EDGAR führt die CIK fort), Rule 12g-3(a), 1:1 („each common share of Swiss TEL … was exchanged for one ordinary share of Irish TEL“), „trade under the symbol ‚TEL,‘ the same symbol under which Swiss TEL’s common shares traded prior to the Effective Time“. Alte Aktie: 25-NSE `0000876661-24-000890`, 15-12G `0001104659-24-104309` (beide 30.09.). | Tagesreihe deckt 2024 nicht ab, deshalb wöchentlich: 8 Punkte 31.08.–30.10., Lücke 7 Tage, größte Bewegung 3,8 %; 09-27 151,22 · 10-04 145,45 | **RESOLVED** (Altzeile endet am letzten Handelstag vor dem Ereignis, 3 Tage) |
| `ref_FUN` | NYSE 1987-04-23..**2024-07-16** · 1987-04-23..2026-10-29 | Zusammenschluss Cedar Fair L.P. (CIK 0000811532) und Six Flags (alt) zur neuen Six Flags Entertainment Corporation (CIK 0001999001). 8-K12B `0001193125-24-173290` (01.07.2024): Nachfolge-Emittent für **zwei** Vorgänger nach **Rule 12g-3(c)**. Cedar-Fair-**Einheiten** (LP) 1:1 in Aktien, Six-Flags-Aktien 0,58. Cedar Fair: 25-NSE `0000876661-24-000552` (02.07.), 15-12G `0001193125-24-178606` (12.07.). | wöchentlich, Lücke 7 Tage, größte Bewegung 9,2 %, kein Sprung | **UNRESOLVED_FAIL_CLOSED**: Unternehmenszusammenschluss mit zwei Vorgängern, Wechsel von Partnerschaftseinheit zu Aktie, keine reine Reorganisation. Das fällt nicht unter die Regel. |
| `ref_HUT` | NASDAQ 2018-03-08..**2023-12-01** · 2018-03-08..2026-10-29 | Zusammenschluss Hut 8 Mining Corp. und US Bitcoin zur Hut 8 Corp. (neue CIK 0001964789), wirksam 30.11.2023. 8-K `0001104659-23-122902` (Items 2.01/3.01/3.03), **kein 8-K12B**. Umtausch **0,2000** neue Aktien je alte Aktie („consolidation … on a five to one (5 to 1) basis“). | wöchentlich, split-bereinigt, 24.11. 9,65 → 01.12. 11,35; größte Bewegung 41 % (15.→22.12.) | **UNRESOLVED_FAIL_CLOSED**: anderes Umtauschverhältnis als 1:1, Zusammenschluss, keine Nachfolgemeldung, Bewegung über der Grenze |
| `ref_BAM` | NYSE 2022-12-01..**2022-12-16** · 2022-12-01..2026-10-29 | Abspaltung der Brookfield Asset Management Ltd. (CIK 0001937926, 8-A12B 21.11.2022) von der früheren Brookfield Asset Management Inc. (CIK 0001001085, heute Brookfield Corp., Ticker BN seit Dez. 2022). Für die Zeile, die am 16.12. endet, gibt es weder ein Nachfolgeereignis noch eine Meldung. Beide Zeilen beginnen am 01.12.2022, vermutlich war das When-issued-Handel. | wöchentlich ab 02.12.2022, größte Bewegung 15,3 % (09.→16.12.) | **UNRESOLVED_FAIL_CLOSED**: kein SEC-Beleg, der die Altzeile einem Ereignis derselben Emittentenlinie zuordnet. Im Umfeld liegen zwei Emittenten (BN, BAM). |
| `ref_CCSI` | NASDAQ 2021-10-08..**2021-10-08** · 2021-10-08..2026-10-29 | Abspaltung von Ziff Davis, eine CIK (0001866633). Das 8-K `0001193125-21-294817` vom 08.10.2021 meldet den Vollzug, aber keinen Wertpapierwechsel. Die eintägige Altzeile ist keinem belegten Ereignis zuzuordnen, vermutlich When-issued. | wöchentlich ab 08.10.2021, keine Auffälligkeit | **UNRESOLVED_FAIL_CLOSED**: kein Ereignis, das zwei Wertpapiere verbindet. Nicht klar, welche Zeile wozu gehört. |
| `ref_NYXH` | NASDAQ 2021-04-28..**2022-12-30** · 2021-04-28..2026-10-29 | Nyxoah SA (CIK 0001857190, ausländischer Emittent). US-Listing per 8-A12B am 28.06.2021, also nach dem Anbieterbeginn 28.04.2021. Ende 2022 gibt es weder ein 8-K12B noch Form 25 oder 15. | wöchentlich, größte Bewegung 14,5 % | **UNRESOLVED_FAIL_CLOSED**: kein Ereignis am Ende der Altzeile. Der Beginn liegt vor dem US-Listing, die Zeile mischt vermutlich die Heimatbörse ein. |
| `ref_UHAL_B` | NYSE 2022-11-10..**2022-12-23** · 2022-11-10..2026-10-29 | Dieselbe CIK (0000004457, AMERCO → U-Haul Holding). 8-K Item 3.01 `0000004457-22-000110` (16.11.2022): **Börsenwechsel Nasdaq → NYSE** zum 19.12.2022 (Nasdaq-Ticker `UHALB`). Form 25 `0000004457-22-000124` (16.12.) für die Nasdaq-Notierung, 8-A12B (15.12.). | wöchentlich ab 11.11.2022, größte Bewegung 10,2 % | **UNRESOLVED_FAIL_CLOSED**: Die Altzeile beschreibt sachlich das Nasdaq-Listing. Die Anbieterbörse NYSE ist für sie also falsch, und „gleiche Börse“ ist nicht belegt. Ein Börsenwechsel fällt nicht unter die Regel. |

Nebenbefund: In der Liste vom 30.10. gibt es 98 Gruppen mit identischer canonical_id. Neun davon betreffen Bestandsticker. Der neunte ist CNL: vier Zeilen NASDAQ 2026-08-11, Collective Mining Ltd., CIK 0001953575. Sie hängen nicht an `ref_CNL` (Bestand AMEX), sondern laufen als `ALTERNATE_LISTING`, stehen nicht im öffentlichen Stamm und betreffen das Gate nicht. Kein Eintrag.

## 4. Vorher/Nachher

Ein Lauf mit derselben Anbieterliste, `--require-provider --from-zip <Liste> --today 2026-10-30 --stamp 2026-10-30T00:00:00Z`, Ausgabe nach `--out`/`--work-dir` in `/tmp`, wie im Wochenlauf (`.github/workflows/security-master-weekly.yml`).

* **Ohne Register (`--duplicate-resolution none`) gegen den Erzeuger aus `main`:** Arbeitsablage, `summary.json` und `backfill-estimate.json` sind byte-gleich (SHA-256 identisch). In `us-security-master.json` und `reconciliation.json` unterscheidet sich je eine Zeile, und dort nur im Ausgabepfad (`workingStore.file`, Hinweistext mit `--out`).
* **Mit Register gegen ohne:**

| | ohne | mit |
|---|---|---|
| Öffentlicher Stamm, Zeilen | 8.057 | 8.055 (8.053 byte-gleich) |
| Arbeitsablage, Zeilen | 109.187 | 109.185 (109.183 byte-gleich) |
| Weggefallene Zeilen | – | OKE 1985-07-01..2026-09-14 INACTIVE; TEL 2007-06-14..2024-09-27 INACTIVE |
| Geänderte Zeilen | – | OKE und TEL (laufende Zeile): `REVIEW/BASELINE_MATCH_AMBIGUOUS` → `EXISTING/BASELINE_MEMBER_CONFIRMED`, `baseline_match` AMBIGUOUS → EXCHANGE_MATCH, Kennzeichen `BASELINE_MATCH_AMBIGUOUS` und `DUPLICATE_TICKER_MULTIPLE_LISTINGS` → `PROVIDER_DUPLICATE_ROW_RESOLVED`, `listing_status` mit Zusatz, neues Feld `duplicate_resolution`, `classification_reasons` entfallen wie bei jeder bestätigten Zeile |
| Backtestbare IDs (genau eine Zeile, ACTIVE, geeignet, EQUITY_COMMON) | 6.161 | 6.163 (+`ref_OKE`, +`ref_TEL`, keine verloren) |
| `BASELINE_MATCH_AMBIGUOUS` (Ticker) | 241 | 239 |
| `DUPLICATE_TICKERS` | 2.295 | 2.293 |
| Zählungen | | `rowsTotal` −2, `baselineMemberRows` −2, EXISTING +2, REVIEW −4, NYSE −2, INACTIVE −2, EQUITY_COMMON −2 |
| Kopf | | zusätzlich `duplicateResolution` (2 Einträge, 2 angewandt, 0 nicht angewandt) |

Sonst ändert sich nichts. Alle anderen Zeilen sind byte-gleich.

## 5. Gate (unverändert, #1143)

Gate-Skript und Freigabedatei `v130-approved-changes-1.1.0.json` stammen per `git show` vom Branch `claude/sm130-approval-list-4ho3rd` und liegen in `/tmp`. Vergleichsbasis ist der committete Stamm (`26c82617…498332`, 1.1.0). Aufruf mit `--allow-version-change --approved-changes …`.

| Folgestand | Ergebnis | G6 | G7 |
|---|---|---|---|
| ohne Register | BLOCKED | **1 neue doppelte canonical_id (`tiingo:NYSE:OKE:1985-07-01`)** | 27 nicht freigegebene canonical_id-Wechsel (Grenze 25) |
| mit Register | BLOCKED | **0** (bekannte Doppelungen 8 → 6) | 27 nicht freigegebene canonical_id-Wechsel (Grenze 25), unverändert |

Die Freigabe greift in beiden Läufen gleich: 147 Typwechsel, 203 Eignungswechsel, 84 Deaktivierungen und 60 canonical_id-Wechsel sind angewandt, ungenutzt ist nichts außer den Namen, die ohne `--prev-names` nicht geprüft werden. Die 27 offenen canonical_id-Wechsel kommen nicht aus diesem PR. Teils sind es Anbieteränderungen nach dem 29.10., der Grundlage der Freigabeliste (z. B. ADIL, NAVI mit neuer Zeile vom 29.10.). Teils sind es Fälle, die #1143 als nicht freigabefähig führt (z. B. CAM, TRT, GCTK, LNAI). Hinzu kommen außerhalb von G7 22 Eignungswechsel, 20 Deaktivierungen und 1 Typwechsel ohne Freigabe, die aber unter ihren Grenzen bleiben. Dieser Lauf hat das Delisting-Register aus #1119 nicht, weil es nicht in `main` ist. Die Freigabeliste wurde mit ihm gebaut.

## 6. Zusammenspiel

* **#1159 (Sperrliste für Identitäten, Grund `PROVIDER_DUPLICATE_ROW`):** Die Sperrliste setzt diesen Grund für canonical_ids, die im Folgestand neu doppelt sind. Mit Register ist `ref_OKE` einzeilig und `identityFindings` meldet keine neue Doppelung. `ref_OKE` wird also nicht mehr aus diesem Grund gesperrt. `ref_TEL` war schon vorher als bekannte Doppelung nicht gesperrt und ist jetzt ebenfalls einzeilig. Die sechs offenen Fälle bleiben bekannte Doppelungen. Ihr Status ändert sich nicht.
* **#1119 (SEC-Delisting-Register):** Die beiden Register sind fachlich unabhängig. Beide fügen an denselben Stellen des Erzeugers einen Lader ein. Wer zuerst gemergt wird, verursacht beim anderen einen kleinen Textkonflikt in `build-us-security-master.mjs` und `us-security-master.js`, der nebeneinander aufzulösen ist.
* **`build-us-eligibility.mjs`:** Das Skript liest die Zeilen aus der Arbeitsablage des Erzeugers und übernimmt die Auflösung damit ohne eigene Änderung. Für OKE und TEL findet `judge()` jetzt genau eine Zeile.
* **Wochenlauf:** Der Erzeuger lädt das Register standardmäßig, eine Workflow-Änderung ist nicht nötig. Fehlt die Datei oder ist sie fehlerhaft, endet der Lauf vor dem Gate mit Exit 2.

## 7. Owner-Entscheidungen

1. **Register mit OKE und TEL freigeben** (Merge dieses PRs). Danach ist G6 für OKE erledigt, ohne dass das Gate oder die Freigabeliste aus #1143 angefasst wird.
2. **G7 (27 > 25)** gehört zu #1143 und nicht hierher. Dort steht der Schritt „Liste neu erzeugen (bei Drift)“ aus §10 an: mit dem Folgestand, der dieses Register (und gegebenenfalls #1119) schon enthält.
3. **FUN:** Soll ein Zusammenschluss nach Rule 12g-3(c) mit 1:1 für den Vorgänger dieses Listings (Cedar Fair) als dieselbe Listing-Identität gelten? Das erfordert eine Regelerweiterung in einem eigenen PR. Empfehlung: nein. Die Einheit einer Partnerschaft ist keine Aktie, und der Emittent ist ein anderer.
4. **UHAL-B:** Soll ein Börsenwechsel desselben Wertpapiers (Nasdaq → NYSE, gleiche CIK) aufgelöst werden, obwohl die Altzeile beim Anbieter mit der falschen Börse steht? Empfehlung: offen lassen, bis der Anbieter die Zeile korrigiert, oder eine eigene Regel `VENUE_TRANSFER` mit Form 25 und 8-K 3.01 als Beleg einführen.
5. **BAM, CCSI, NYXH:** Ein SEC-Ereignis fehlt, die Zeilen bleiben mehrdeutig. Möglich ist eine Rückfrage beim Anbieter (Altzeile entfernen). Ein Eintrag ist nach dieser Regel nicht möglich.
6. **HUT:** Dauerhaft nicht unter dieser Regel (0,2:1). Bei Bedarf ist es ein Fall für die Split- und Umtausch-Logik (ADR-002), nicht für die Zeilenauswahl.

## 8. Prüfen

```bash
node --test quant/tests/security-master-duplicate-resolution.test.mjs
node scripts/market/build-us-security-master.mjs --require-provider --from-zip /tmp/supported_tickers.zip \
  --today 2026-10-30 --stamp 2026-10-30T00:00:00Z --out /tmp/sm-with --work-dir /tmp/sm-with-work
node scripts/market/build-us-security-master.mjs --require-provider --from-zip /tmp/supported_tickers.zip \
  --today 2026-10-30 --stamp 2026-10-30T00:00:00Z --duplicate-resolution none --out /tmp/sm-none --work-dir /tmp/sm-none-work
```

## 9. Nachtrag 31.10.2026: Fortführung nach Umfirmierung (EDVA)

**Anlass.** Im Folgestand 1.3.0 vom 31.10. (Lauf mit der Anbieterliste vom 31.10., SHA-256 `fc51593e…`, zurückgenommen als `46d8e936b3`) wurde `ref_EDVA` inaktiv und nicht mehr geeignet. Der Grund war keine Börsenstreichung. Der Anbieter führt die Aktie seit der Umfirmierung in zwei Zeilen: `tiingo:NYSE MKT:EDVA:2019-02-05` bis 2026-08-21 und `tiingo:AMEX:EDVA:2026-08-21` bis heute. Der Erzeuger ordnet über Ticker und Handelsplatz zu. Damit hing `ref_EDVA` an der beendeten Zeile (Bestand `NYSE MKT`), und die laufende Zeile blieb `ALTERNATE_LISTING` außerhalb des öffentlichen Stamms.

**Belege (EDGAR, abgerufen 31.10.2026, User-Agent `VisionUniverseResearch info@visionuniverse.de`).** CIK 0001553788, heute Endovia Health Sciences, Inc., Ticker EDVA, Börse NYSE American (SEC-Liste: „NYSE“). Frühere Namen: SPLASH BEVERAGE GROUP, INC. (2020-08-13 bis 2026-08-21) und Canfield Medical Supply, Inc. (bis 2020-08-05).

* 8-K `0001731122-26-001040` (11.08.2026, Item 5.03): Satzungsänderung in Nevada am 05./06.08. auf den Namen „Endovia Health Sciences, Inc.“. Sie wird an der NYSE American 10 Tage nach der Pressemitteilung wirksam.
* 8-K `0001731122-26-001120` (21.08.2026, Item 7.01): Handel unter neuem Namen und dem Symbol „EDVA“ ab Börsenbeginn 24.08.2026. Vorher hieß das Symbol SBEV, das in keinem committeten Stand steht.
* Kontext: 8-K `0001731122-26-000950` (16.07.2026, Item 5.03). Reverse Split 1:4 am 24.07.2026, neue CUSIP 84862C401. Er liegt innerhalb der Altzeile und betrifft dieselbe Gattung.

**Regel (Erweiterung, nur mit Eintrag).** Das optionale Feld `keptCanonicalId` beschreibt eine Fortführung derselben Aktie. Der Eintrag wird nur angenommen, wenn alle folgenden Bedingungen gelten, sonst bricht der Lauf ab (`DUPLICATE_RESOLUTION_INVALID`):

* `sec.rule` ist `SAME_CIK`, mit zitierter Meldung derselben CIK.
* Beide canonical_ids tragen denselben Ticker. Ein Tickerwechsel ist damit ausgeschlossen.
* Beide Zeilen liegen an derselben Börse. Erlaubt sind nur Bezeichnungen derselben Börse beim Anbieter (`NYSE MKT` = `AMEX` = `NYSE AMERICAN`). NYSE gegenüber NYSE American ist ein Börsenwechsel und bleibt ausgeschlossen.
* Die Folgezeile beginnt nach der Altzeile und höchstens 7 Tage vom Wirksamkeitstag entfernt. Für das Enddatum der Altzeile gilt dieselbe Grenze wie bisher.

Wirkung im Lauf: Nur wenn unter dem Ticker **genau** diese zwei Zeilen stehen und Gattung, Währung und Enddatum passen, entfällt die Altzeile. Sie steht dann als `dropped_row` an der Folgezeile, und die Folgezeile wird normal zugeordnet. Nur bei dieser Fortführung kommen `duplicate_resolution.continuation = "SAME_ISSUER_RENAMED"` und `duplicate_resolution.cik` hinzu. Die Zeilen von OKE und TEL bleiben Feld für Feld gleich. Das Schema bleibt `security-master-duplicate-resolution-1.0.0`, weil das Feld optional ist. Eine Erhöhung würde die Zeilen von OKE und TEL im Artefakt ändern.

**Eigene Reihe.** `discover-series/ref_EDVA.json` enthält die letzten 50 Handelstage und beginnt am 2026-08-21, dem Beginn der Folgezeile. Vor dem Ereignis gibt es keine eigenen Punkte, eine Wochenreihe fehlt. Im Fenster 25.07. bis 23.09. liegen 23 Punkte, die größte Lücke beträgt 4 Tage, die größte Bewegung 12,7 %. Damit belegt die Reihe den lückenlosen Handel der Folgezeile ohne Sprung in Split-Größe. Dass über das Ereignis hinweg dieselbe Aktie gehandelt wird, belegen die SEC-Meldungen (dieselbe CIK, Umfirmierung ohne Umtausch), nicht die Reihe.

**Firmennamen.** `scripts/market/build-company-names.mjs` übernimmt die belegte CIK aus diesem Register, und zwar nur als Rückfall, wenn der Schlüssel aus Ticker und Börsenfamilie nicht greift. Dann muss unter dem Ticker genau ein SEC-Eintrag mit genau dieser CIK stehen (Identität `TICKER+CIK_REGISTER`). Hintergrund: Die SEC-Liste führt NYSE-American-Titel als „NYSE“, die Namensschicht als „AMEX“. Ohne Registerbeleg bleibt das `SEC_EXCHANGE_MISMATCH`.

**Freigabeliste.** `scripts/market/build-security-master-approval-list.mjs` erkennt die Marke (`applyRenameContinuation`) und stuft den canonical_id-Wechsel als `RENAMED_SAME_ISSUER_REGISTER` freigabefähig ein. Voraussetzung: je genau eine Zeile vorher und nachher, gleicher Ticker und gleiche Gattung, dieselbe Börsenfamilie außerhalb des Freiverkehrs, die Zielzeile ist aktiv, und die SEC-Liste bestätigt Ticker und Börse unter der Register-CIK. Ohne die Marke wäre derselbe Wechsel `UNCLEAR_REPLACEMENT` und nicht freigabefähig.

**Vorher/Nachher** (Anbieterliste vom 31.10., `--today 2026-10-31 --stamp 2026-10-31T00:00:00Z`, Ausgabe in `/tmp`):

| | vorher (Register aus `main`) | nachher |
|---|---|---|
| Öffentlicher Stamm | 8.055 Zeilen, Zeile für Zeile gleich dem zurückgenommenen Folgestand `46d8e936b3` | 8.055 Zeilen; nur die EDVA-Zeile ist ersetzt, alle anderen sind byte-gleich |
| `ref_EDVA` | `tiingo:NYSE MKT:EDVA:2019-02-05`, INACTIVE, nicht geeignet, REVIEW | `tiingo:AMEX:EDVA:2026-08-21`, ACTIVE, geeignet, EXISTING, `duplicate_resolution` mit `dropped_row` |
| Arbeitsablage | 109.196 Zeilen | 109.195 Zeilen (Altzeile entfällt) |
| Firmenname `ref_EDVA` (SEC-Liste vom 30.10.) | Splash Beverage Group Inc NV, `cik` null | Endovia Health Sciences, Inc., CIK 0001553788, `nameConflict` vermerkt; alle anderen 7.802 Zeilen gleich |
| Freigabeliste gegen 1.1.0 | EDVA: Deaktivierung und Eignungswechsel nicht freigabefähig | EDVA: canonical_id-Wechsel freigabefähig (`RENAMED_SAME_ISSUER_REGISTER`), Name freigabefähig (`RENAMED_SAME_CIK_SEC`); nicht freigabefähige Deaktivierungen 17 → 16, Eignungswechsel 154 → 153, canonical_id 24 → 24 |

Prüfen: `node --test quant/tests/security-master-rename-continuation.test.mjs`.
