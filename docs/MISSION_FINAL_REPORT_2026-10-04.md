# Vision Universe: Abschlussbericht der Platform-Hardening-Mission

**Stand:** 04.10.2026.
**Grundlagen:**
- [PLATFORM_HARDENING_REPORT_2026-10-03.md](PLATFORM_HARDENING_REPORT_2026-10-03.md): Architektur, Befunde, erste Umsetzung.
- [MISSION_STATUS_2026-10-03.md](MISSION_STATUS_2026-10-03.md): PR-Landkarte, projizierte Core-Adoption.
- [GAP_CHECK_2026-10-04.md](GAP_CHECK_2026-10-04.md): Abschnitt für Abschnitt gegen den Auftrag.

---

## 1. Executive Summary

Die Plattform hat eine erkennbare Core-Schicht. Sie besteht aus Identität, Datenvertrag, Health/DQ, Diagnose und Golden Paths. Pipelines, Datenqualität und Sicherheit sind gehärtet.

**Was heute auf `main` steht:**
- `main` ist fachlich und technisch grün. Die Materialisierung lief mit Run 110 vollständig durch, mit 0 PIT-Abweichungen und 33 ausgewiesenen Wiederholungen. Quant CI und SEC Fundamentals CI sind auf `main` grün.
- Die zwei langen Main-Fehler `launch-gates` und `screener-surface` sind behoben.
- LOGI zeigt einen Hinweis statt eines toten Links.

**Was der Owner noch mergen muss:** Die übrigen Ergebnisse liegen als **30 offene, mit `main` synchronisierte PRs** vor. Der wichtigste ist **#428**: Er setzt die vollständig erklärte Neuabnahme der Marktdatendeckung. Erst mit ihm ist das Fundamentals-Gate abgestimmt, und der wöchentliche Deckungslauf funktioniert wieder. Er scheiterte schon seit dem 27.09., unbemerkt.

**Owner-Entscheidungen, nicht von Claude getroffen:**
- Die Merges selbst.
- `?key=` im Social-Worker.
- Ein Neulauf des Tiingo-Skalierungsberichts.
- Der News-Zeitplan.

---

## 2. Owner-Schritte vom 04.10. und Ergebnis

| Schritt | Ergebnis |
|---|---|
| 1. #419 mergen | gemergt (`7900e9955d`) |
| 2. Materialisierung ohne `force` | [Run 110](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/37178803032) grün, committet (`388d9ca55b`). Die #405-Entscheidung hat selbst materialisiert. Parity: 1034 geprüft, 0 Abweichungen, 33 `staleRepeats`. Faktor-Evidenz 6601 (vorher 6289). Veraltete Setup-Bündel: 55 statt 386. |
| 3. #418 mergen, Supertrader-Lauf | gemergt (`a0a690eb`). Lauf grün (`fe88d73e`). `discoverAvailability`: 669 geprüft, `["LOGI"]` nicht verfügbar. |
| 4. `coverage-metrics`, Fundamentals-Gate | Neue Messung 6853 / 6850 / 5780. Je Titel erklärt (Abschnitt 3), abgestimmt. Code und Daten in **#428**. |
| danach: `main` prüfen | Ein neuer roter Test (VM6, JPM) kam durch frische Daten ans Licht. Mein Fix #427 wurde durch den gleichwertigen Fix in #425 (andere Sitzung) überholt und ist geschlossen. `main` (`aea3421a`): Quant CI, SEC CI, Ask CI und Hedgefonds CI grün. |
| danach: rote Checks neu bewerten | Kein Main-Fehler steht mehr als „externer PR-Fehler“ da. Die Quant-Fehler sind behoben, das Fundamentals-Gate ist mit #428 behoben, LOGI ist behoben. Verbleibend: Vercel-Tageslimit (Free-Tarif, kein Code). |
| danach: PRs synchronisieren | Alle 30 eigenen offenen PRs mit `main` zusammengeführt, gestapelte über ihre Basis. Zwei echte Wechselwirkungen behoben (Abschnitt 4). |

---

## 3. Deckungs-Neuabnahme (#428): jede Abweichung je Titel

Bezug war der Stand vom 20.09. (6875 / 6871 / 5884). Gemessen wurde gegen R2. Erklärt hat das neue Werkzeug `scripts/diagnose/coverage-delta.mjs`, das nur liest.

| | Bezug | DEBT (#366) | Listing-Kürzung (#367) | junge Reihen ≥ 300 | neues Listing nachgeladen | gemessen |
|---|---|---|---|---|---|---|
| Technik | 5884 | −8 | −139 | +43 | – | **5780** ✓ |
| Charts | 6871 | −22 | – | – | +1 (BRTM) | **6850** ✓ |

**Ursache der unerwarteten −96 bei der Technik.** Der Abgleich nahm `TECHNICAL_READY` aus einem technischen Skalierungsbericht vom 11.09. Dieser kennt die Listing-Kürzungen vom 03.10. nicht. Jetzt ist die aktuelle R2-Messung die Quelle (gleiche Schwelle, namentliche Liste). Der alte Bericht bleibt Rückfall.

**Zwei Workflow-Fehler, die die Läufe aufgedeckt haben, beide behoben und getestet:**
1. Der Commit-Schritt von `coverage-metrics.yml` scheiterte immer, sobald es etwas zu committen gab. Ursache: Testnebenwirkung vor `pull --rebase`. Der Plan-Lauf vom 27.09. war deshalb rot. Die Referenz stand seitdem still.
2. Meine eigene Diagnose zog nach der ersten Neuabnahme die DEBT-Titel ein zweites Mal ab. Lauf 14 hat das gezeigt. Jetzt gilt: Bezug ist die committete Messung mit dem Produktuniversum desselben Commits.

Unerklärte Abweichungen brechen den Lauf künftig **vor** dem Commit ab. Damit ist „kein neuer Nenner ohne geklärte Ursache“ erzwungen, nicht nur dokumentiert.

---

## 4. Beim Synchronisieren gefundene echte Wechselwirkungen

| PRs | Problem | Behoben |
|---|---|---|
| #387 + #418 | #387 schreibt Aktienseiten auch für Teilprüfungs-Titel, mit Discover-Link. #418 prüfte nur Signale und Trend52. Dort hätte ein toter Link entstehen können. | Die Verfügbarkeit prüft genau die Seitenliste. Ein Test sichert die Gleichheit beider Listen. |
| #397 + #418 | Die Aktienseite liest seit #397 nur `stock/<SYM>.json`. Ohne das Feld hätte LOGI wieder einen toten Link gezeigt. | Der Ausschnitt trägt die Verfügbarkeit seines Symbols. Test mit Gegenprobe. |
| #406 + #424 | Konflikt in `discover/index.html` (neuer Theme-Schalter) | Schalter aus `main` plus Scroll-Skript. Discover-Tests 324/324. |
| #394 + #417 | Der Identitäts-Wächter (#394) fand `"ref_" + symbol` in der neuen Vorsorge-Säule (`scripts/vorsorge/build-etf-data.mjs`). | Begründete Ausnahme: `core/identity.js` liegt erst mit #386 auf `main`, für reine Buchstaben-Ticker ist das Ergebnis identisch. Der Wächter meldet sie, sobald sie veraltet ist. Umstellung nach #386. |
| #395 (CI) | `push-with-retry`-Test scheiterte beim Aufräumen (`ENOTEMPTY`, abgekoppeltes `git gc --auto`). | In #386: keine automatische Git-Wartung in Testrepos, Aufräumen mit Wiederholung. Testlogik unverändert. |

---

## 5. Definition of Done

| # | Kriterium | Stand | Beleg |
|---|---|---|---|
| 1 | Reale Architektur verstanden und dokumentiert | ✅ | Bericht 03.10., `docs/architecture/*`, `VISION_UNIVERSE_ARCHITECTURE.md` |
| 2 | Kritische Architekturprobleme gefunden | ✅ | Bericht §Bugs. Seit 03.10. dazu: Materialisierungs-Noop am gleichen Tag, eingefrorene Setup-Bündel, veralteter Technikbericht im Abgleich, kaputter Commit im Deckungslauf, Lieferkette (`wrangler@4`), Testlücke VM6. |
| 3 | Sichere relevante Refactorings | ✅ (Merge) | #388, #394, #396, #403, #428, jeweils mit Vorher/Nachher |
| 4 | Zentrale Core-Struktur erkennbar | ✅ (Merge #386) | `core/` mit Identity, Client, Health, DQ, Diagnose und Golden Paths |
| 5 | Source of Truth | ✅ mit benanntem Rest | Kurse ADR-002, Identität ADR-001, technische Deckung R2 (#428). Rest: Universum bis Tiingo 2.0 (Owner). |
| 6 | Kritische Pipelines robuster | ✅ | #405, #419 (gemergt), #386, #390, #393, #413, #421, #422, #428 |
| 7 | Datenqualität systematisch prüfbar | ✅ | DQ-Regeln, `adjustment-steps`, `coverage-delta`, Gate vor dem Commit |
| 8 | Systemzustand und Frische sichtbar | ✅ | `/status/`, Frische-Kennzeichen, Herkunft je Lauf |
| 9 | UI geprüft, relevante Fehler behoben | ✅ | Browser-Smoke, #398, #401, #402, #406, #408, #418 |
| 10 | Wiederverwendbare UI-Logik vereinheitlicht, wo sinnvoll | ✅ (bewusst eng) | Scroll-Memory (#406). Weitere Abstraktion ohne doppelten Fehler widerspräche dem Auftrag. |
| 11 | App Readiness vorbereitet | ✅ | APP_READINESS, ADR-004, PWA Stufe 1 (#407) |
| 12 | Kritische Regressionstests | ✅ | je Fehler mit Gegenprobe, Golden Paths Stock, Discover und Supertrader (#386, #423) |
| 13 | Architektur und Betrieb dokumentiert | ✅ | ADR-001…005, RUNBOOK, `CLAUDE.md` (#391), dieser Bericht |
| 14 | Main bzw. vorgesehene PRs stabil | ✅ | `main` grün: Quant CI und SEC CI auf `8c806f9c`, Ask CI und Hedgefonds CI auf `aea3421a`, Materialisierung Run 110. Die PRs sind synchronisiert. Lokal geprüft: Core 52/52, Quant 2326/2326 (#386), Supertrader 178/178, Discover 324/324 (#406), Python 487/487 (#428). CI-Ergebnis je PR auf GitHub. Das Fundamentals-Gate bleibt auf PRs, die es auslösen, rot, bis #428 gemergt ist. #428 ist der Fix. |
| 15 | Klare Liste verbleibender Risiken | ✅ | Abschnitt 8 |

---

## 6. Core-Adoption und Parallelwelten (nach Merge aller PRs)

Gemessen ist die Matrix in [CORE_ADOPTION.md](architecture/CORE_ADOPTION.md). Projiziert: [MISSION_STATUS](MISSION_STATUS_2026-10-03.md#core-adoption-nach-merge-aller-prs-projiziert).

**Neu seit dem 03.10.:**
- Die technische Deckung im Abgleich kommt aus der kanonischen R2-Messung (#428).
- Die Supertrader-Verfügbarkeit nutzt den Discover-Index als Quelle (#418).

**Verbleibende Parallelwelten:**

| Parallelwelt | Begründung |
|---|---|
| Supertrader-Validierung (Split-Schleife) | Versiegelte Forschung, Gate A, semantisch identisch. Bewusst belassen. |
| Quant V1 (Mock, Legacy) | Unveränderlich bis zur Abschaltung von V1 |
| Discover-Detail rechnet Intraday plus Vortag selbst | Fachlich richtig (#401). Eine Umstellung auf den EOD-Client würde die Semantik ändern. Danach als eigenes Refactoring möglich. |
| Technischer Skalierungsbericht (09-11) | Nur noch Rückfall. Ein Neulauf braucht Anbieterabrufe (Owner). |

---

## 7. PRs und Merge-Reihenfolge

**Gemergt in dieser Mission:** #405, #419, #418 (Owner-Freigabe). Außerdem fremd: #417, #424, #425.

**Offen, Reihenfolge:**
1. **#428**: Deckungs-Neuabnahme, Fundamentals-Gate und Workflow-Fix
2. **#386**: Platform Hardening (enthält die Testisolation `total-return-verification`). Danach **#423** (Golden Path Stock), **#391** (`CLAUDE.md`), **#394** und dann **#395**, **#396** und **#414** (Doku inklusive dieses Berichts).
3. **#390**, **#393**. Danach **#413** und dann **#421**. Außerdem **#389** und **#422** (Lieferkette).
4. **#387** → **#397** → **#411** (Supertrader, Gate A je PR)
5. Fachlich, unabhängig voneinander: **#388**, **#398**, **#399**, **#400**, **#401**, **#402**, **#403**, **#406**, **#407**, **#408**, **#409**, **#410**, **#420**

Geschlossen: **#427** (überholt durch #425).

---

## 8. Verbleibende Risiken und technische Schulden

| Thema | Schwere | Nächster Schritt |
|---|---|---|
| Identität tickerbasiert (keine ISIN/FIGI) | High | ADR-001 Stufe 2 |
| Universum veraltet bis Tiingo-2.0-Freigabe | High | Owner |
| Fundamentals-Gate rot auf PRs, die es auslösen, bis #428 gemergt ist | Medium | #428 mergen |
| `discover/data/`: sechs Schreiber | Medium | Erzeugerhoheit je Unterpfad (ADR-005) |
| Social-Worker `?key=` | Medium | Connect über die Sitzung bestätigen, dann entfernen (Owner) |
| LOGI-Total-Return 2024/2025 zählt die Dividende doppelt (Anbieter) | Medium | Gesperrt durch das Gate. Korrektur beim Anbieter anfragen (#420). |
| Technischer Skalierungsbericht veraltet | Low | Nur Rückfall. Neulauf bei Bedarf. |
| News ohne Zeitplan (Stand 21.09.) | Low | Owner, Seite weist Veraltung aus |
| Cache ohne Content-Hash | Low | Build-Umbau, P3 |
| `core/client.js` noch nicht in Discover-Detail | Low | nach #401 als reines Refactoring |
| Vorsorge bildet `ref_`-Pfade selbst | Low | nach #386 auf `securityIdForTicker` umstellen (Ausnahme im Wächter) |

---

## 9. Final Red Team (04.10.)

| Prüfung | Ergebnis |
|---|---|
| Eigene Tests auf Tautologie | Golden Path Stock verglich zuerst Reihe gegen Reihe. Die Gegenprobe hat es gezeigt, korrigiert vor dem PR (#423). |
| Eigene Diagnose auf Bezugsfehler | Lauf 14 zeigte den doppelten DEBT-Abzug. Korrigiert, 3 neue Tests, Lauf 15 grün. |
| Neue Klasse NEW_LISTING_BACKFILLED zu weit? | Eng: Listing ≤ 30 Tage vor dem Bezug **und** die Reihe beginnt am Listingtag. 3 Gegenproben bleiben UNEXPLAINED. |
| Gate abgeschwächt? | Nein. Alle Schwellen unverändert. Die PIT-Parity bleibt `mismatches == 0`. Neu ist nur der namentliche Ausweis (`staleRepeats`, Klassen). |
| Baseline ohne Erklärung übernommen? | Nein. Bilanz je Titel, Abbruch vor dem Commit bei Unerklärtem. |
| Fachliche Modelle verändert? | Nein. Quant-, Supertrader-, Ranking- und Technical-Logik sind unverändert. Supertrader: nur Links und Ausweis. |
| Daten von Hand erzeugt? | Nein. Alle Daten stammen von den offiziellen Buildern (`coverage-metrics.yml`, Materialisierung, `supertrader-signals.yml`). |
| Wechselwirkungen beim Synchronisieren | Vier echte gefunden und behoben (Abschnitt 4), dazu eine Testinstabilität mit Ursache statt Neustart |
| Secrets | Keine ausgegeben. Diagnose-Workflows lesen R2 nur über `env`. |
| Merges ohne Freigabe | Keine. Gemergt nur #405, #418 und #419 mit Owner-Freigabe. |

---

## 10. Empfohlene nächste Produktentwicklung

1. **Watchlist auf `instrumentId`** (Schema in APP_READINESS §4). Erste gemeinsame Funktion für PWA, App und Notifications.
2. **Discover-Detail auf `core/client.js`** nach dem Merge von #401: eine einzige Definition von Tagesänderung und Vortag.
3. **Notifications Stufe 1**, zunächst in der App-Oberfläche: kanonisches 52W-Hoch und Signalwechsel im Supertrader.
