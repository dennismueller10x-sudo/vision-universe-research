# VU MARKET DATA FRESHNESS P0 — ROOT CAUSE REPORT

Stand der Messung: 2026-09-24 11:55 UTC = 07:55 New York (PRE_MARKET).
Keine Kurse in diesem Bericht (Redistributionsregel) — nur Daten, Zustände, Zählungen.

Kennzeichnung: **[M]** gemessen · **[I]** abgeleitet · **[U]** unbekannt.

---

## 0. Agent-Graph (ausgeführt)

| Agent | Eingang | Quality Gate | Ergebnis |
|---|---|---|---|
| F Session Calendar | `trading-session.js` + `market-calendar.json` | LAST_COMPLETED ≠ currentDate−1 an Mo/Feiertag | PASS |
| A Production Truth | Freshness-Monitor-Läufe (GitHub-Runner gegen research.visionuniverse.de) | Live == Repository | PASS (identisch) |
| B Canonical Data | `quant/data/market/discover-series/*` (vom Consumer gelesen) | Reihen statt Summary | EOD STALE bestätigt |
| D Intraday | `quant/data/market/intraday/2026-09-23/*` | pro Datei `fetchedAfterClose`/`coversFinalSlot` | 2 Defekte |
| E Freshness Contract | `check-freshness.mjs`, `freshness.js` vs. `source-state.js` | gleiche Antwort beider Verträge | Widerspruch → Fix |
| C EOD Pipeline | Läufe `market-data-refresh.yml` 18./21./22./23.09. | Commit-Schritt erreicht? | nein → Root Cause |
| G Consumer Contract | `discover/ui/detail.js`, `cards.js`, `live-hub.js` | welcher Pfad trägt die sichtbare Zahl | dokumentiert, kein Fix nötig |
| H Recovery | bestehender Refresh-Workflow | kein Blind-Refresh, Budget | Owner-Gate: Merge |
| I Regression | neue + angepasste Tests, Gegenproben | alter Code rot, neuer grün | PASS |
| J Production Proof | nach Merge + Refresh | — | ausstehend (Owner-Gate) |

Widerspruchsprüfung: Production vs. Repository vs. Reihen vs. Summary vs. Intraday vs. Check (Matrix in §4).
Recovery-Pfad: der bestehende Refresh-Lauf (Zeitplan 22:30 UTC oder `workflow_dispatch`), keine neue Pipeline.
Owner-Eskalation: Merge nach `main` (Produktion wird aus `main` ausgeliefert).

---

## 1. Owner-Beobachtung

Im sichtbaren Discover erscheinen Kurse vom Vortag. **[M] stimmt — für einen Teil der Oberfläche**:
Aktienseite (Standardansicht „1T“), Mikrocharts der Karten und Tagesverlauf zeigen die Sitzung vom 23.09.
Kartenzahl, 1W/1M/1J-Charts, Ranglisten und Faktoren zeigen den 18.09.

## 2. Ursprünglicher Smoke-Befund

`check-freshness.mjs --strict` (Freshness-Monitor, 24.09. 01:24 UTC, gegen die Produktion) **[M]**:

- Intraday: Datenstand 2026-09-23 → STALE (`closeMissing`); Einträge 520: LAST_SESSION 512, STALE 8
- Tageskurse: Universum asOf 2026-09-18 → STALE (`olderThanLastSession`); Stichprobe 40/40 STALE
- Produktion und Repository lieferten identische Zahlen.

Der Monitor ist seit dem 22.09. durchgehend rot **[M]**; der Health-Contract hat also gemeldet.

## 3. Tatsächliche letzte abgeschlossene Session **[M]**

| Feld | Wert |
|---|---|
| NOW | 2026-09-24T11:55Z = 07:55 America/New_York |
| MARKET_STATE | PRE_MARKET |
| CURRENT_SESSION | 2026-09-24 (noch nicht offen) |
| LAST_COMPLETED_SESSION | 2026-09-23 (Mi, reguläre Sitzung, kein Feiertag, keine Verkürzung) |
| EXPECTED_EOD_ASOF | 2026-09-23 |

Die Erwartung des Checks war korrekt (Ergebnis E ausgeschlossen).

## 4. Production-Stichprobe und Widerspruchsmatrix

Quelle: Repository-Stand `main` = ausgelieferter Stand (Monitor-Parität **[M]**; direkter Abruf der Seite ist aus der Analyse-Umgebung per Egress gesperrt **[U]** für einen eigenen Browser-Abruf).

| Titel | Karten-Kurs asOf | Reihe `to` = Chart-Ende 1W–1J | EOD | Intraday-Sitzung | nach Schluss geholt | letzter Slot | Source State (Browser) | Freshness-Vertrag (vor Fix) | 1T trägt |
|---|---|---|---|---|---|---|---|---|---|
| AAPL, NVDA, MSFT, NBIS, SAP, ASML, NVO, TM, BABA, GSK | 18.09. | 18.09. | STALE | 23.09. | ja | 15:55 | FINAL_SESSION | LAST_SESSION | Intraday 23.09. |
| AMZN, GOOGL, META, JPM, XOM | 18.09. | 18.09. | STALE | 23.09. | ja | 15:55 | FINAL_SESSION | LAST_SESSION | Intraday 23.09. |
| AAAC, CLLS, HFBL, NCO (weniger liquide) | 18.09. | 18.09. | STALE | 23.09. | ja | 13:00–15:40 | FINAL_SESSION (`…NoLateTrades`) | **STALE** (`closeMissing`) → Widerspruch | Intraday 23.09. |
| RFAI, ATHS, MSC, TRVG, XYF (Sonderbehandlung) | 18.09. | 18.09. | STALE | 23.09. | **nein** (z. B. RFAI 10:52 geholt) | 10:55–15:50 | STALE („Schluss fehlt noch“) | STALE | Intraday 23.09., als STALE markiert |
| CCM | 18.09. | 18.09. | STALE | 22.09. | nein | 13:30 | STALE | STALE | Intraday 22.09. |

Realtime: Markt zur Messung geschlossen → kein Realtime-Tick erwartet, keiner behauptet, kein PASS gemeldet **[M]**.

Matrix der Ebenen:

| Ebene | Stand | Urteil |
|---|---|---|
| Session-Truth | 23.09. | — |
| Canonical EOD (Reihen) | 18.09. (6314 Reihen) | wirklich STALE |
| EOD-Summary (`meta.json`) | 18.09. | stimmt mit den Reihen überein |
| Intraday-Store | 23.09. (5196 Snapshots) | aktuell; 7 Dateien fälschlich ohne Nach-Schluss-Stand |
| Intraday-Aggregat (`dataSession.regularComplete`) | false | falsch-positiv STALE |
| Product Contract (`stocks/*.json` price, asOf) | 18.09. | STALE |
| Browser 1T / Mikrochart | 23.09. | korrekt vom Intraday-Pfad getragen |
| Browser Kartenzahl / 1W–1J | 18.09. | STALE, sichtbar |

## 5. EOD Coverage **[M]** (Nenner: Product Universe = 6876 Titel im Umfang der kompakten Reihen)

| Kennzahl | Anzahl |
|---|---|
| TOTAL | 6876 |
| CURRENT_EOD (23.09.) | 0 |
| ONE_SESSION_BEHIND (22.09.) | 0 |
| MULTI_SESSION_BEHIND | 6447 (6314 auf 18.09. = 3 Sitzungen; 133 älter) |
| MISSING (keine Reihe) | 429 |
| REJECTED / DEFERRED (letzter veröffentlichter Lauf 21.09.) | 456 im Register (TEMPORARY_REJECT), 454 zurückgestellt |

## 6. Intraday Coverage **[M]** (Sitzung 23.09.)

| Kennzahl | Anzahl | Nenner |
|---|---|---|
| Universum-Snapshots | 5196 | 6876 |
| CURRENT_INTRADAY, Schluss-Slot vorhanden | 4627 | 5196 |
| CURRENT_INTRADAY, final ohne späten Handel | 562 | 5196 |
| STALE_INTRADAY (vor Schluss geholt, nie nachgetragen) | 7 | 5196 |
| Discover-Umfang: LAST_SESSION / STALE | 512 / 8 | 520 |

## 7. Source-State-Kette (AAPL, NVDA, NBIS — gleich) **[M]**

| Grenze | Eingang | Ausgang | asOf | Session | Quelle | Freshness |
|---|---|---|---|---|---|---|
| Provider EOD | Tiingo EOD | `.market-cache` (Actions-Cache) | 23.09. geholt **[I]** | 23.09. | tiingo | — |
| Canonical History | Cache | `golden-preview/daily`, `discover-series` | **18.09.** | — | tiingo | STALE |
| EOD-Artefakt | Reihen | `discover/data/stocks/*.json` (price, asOf) | 18.09. | — | tiingo | STALE |
| Provider Intraday | Tiingo IEX 5min | `intraday/2026-09-23/ref_*.json` | 16:15–16:55 | 23.09. | tiingo/IEX | fetchedAfterClose, coversFinalSlot |
| Source State | Snapshot | FINAL_SESSION/sessionComplete | 23.09. | 23.09. | 5-Minuten-Kurse | LAST_SESSION |
| Discover | detail.js: Standard `1D`, wenn Intraday vorhanden | Kopfzahl = letzter Intraday-Punkt | 23.09. | 23.09. | Intraday | „Heute · Schluss 16:00“ |
| Browser | Karten: `card.price` | Kartenzahl | 18.09. | — | EOD | nicht gekennzeichnet |

Welcher Pfad gewinnt: Aktienseite 1T und Mikrochart → Intraday; Kartenzahl, 1W–1J, Ranglisten → EOD.

## 8. Freshness-Check-Audit

| Frage | Antwort |
|---|---|
| Welche Dateien? | `discover/data/meta.json` (Summary), `live-scope/US_REAL.json`, `quant/data/market/discover-series/ref_*.json`, `intraday/index.json` |
| Kanonisch? | Reihen ja (derselbe Pfad, den `detail.js` lädt); `meta.json` ist Summary |
| Noch produziert und deployed? | ja, alle **[M]** |
| Legacy / alter Discover-Pfad? | nein — der Check prüft den ONE-DISCOVER-Pfad |
| EOD oder Intraday? | beide, getrennt |
| Summary mit Reihen verwechselt? | das Urteil kam allein aus dem Summary; die Reihen-Stichprobe wurde nur gedruckt. Diesmal zufällig gleich. Gefixt |
| Session-Tag korrekt? | ja |
| Cache-/Release-Lag? | nein (Live == Repository) |
| Intraday-Urteil | **falsch-positiv**: `dataSession.regularComplete` verlangt einen 15:55-Kurs von *jedem* der 5196 Titel; 562 illiquide haben keinen und hätten die Sitzung für immer STALE gehalten |

## 9. Root Cause

Ergebnis: **A** (Tageskurse wirklich stale; Health-Monitor meldete korrekt, der Veröffentlichungsweg scheiterte) **+ F** (zwei Intraday-Defekte, einer davon ein falsch-positiver Check).

1. **EOD (Hauptursache) [M]:** Alle vier planmäßigen Refresh-Läufe 18., 21., 22., 23.09. holten die Daten, bestanden Freshness-Check und Lebenszyklus-Wächter — und scheiterten dann in der Regressionssuite, die *vor* „Commit und Push“ läuft. Der Commit wurde übersprungen, die frischen Kurse verworfen (nur der Actions-Cache behielt sie). Letzte zwei Läufe: genau ein Test, `market-signal-contract.test.mjs` „approved scope is preserved…“, `5 !== 4`: der Test zählte Signalereignisse auf dem **jeweils neuesten** `golden-preview`-Bestand, den derselbe Lauf gerade fortgeschrieben hatte. Neue Kurse ⇒ neuer Regelwechsel ⇒ Test rot ⇒ keine Kurse. Frühere Läufe scheiterten an anderen datenabhängigen Asserts (21.09.: 6, 18.09.: 1 in `klartext.test.mjs`). Der letzte veröffentlichte Stand kam aus einem manuellen Lauf am 21.09. 12:17 UTC (Daten bis 18.09.).
2. **Intraday-Ingest [M]:** Beim Nach-Schluss-Abruf verwarf `ingest-intraday.mjs` einen Snapshot als „unchanged“, wenn Punkte, erweiterte Zeiten und `regularComplete` gleich waren — `fetchedAfterClose` stand nicht im Vergleich. Ein illiquider Titel ohne Handel seit Mittag behielt so den Mittags-Snapshot (`fetchedAfterClose: false`) und trug dauerhaft „Schluss fehlt noch“ (7 Titel).
3. **Freshness-Vertrag vs. Source State [M]:** `freshness.js` wertete einen nach Schluss geholten Snapshot ohne 15:55-Kurs als STALE/`closeMissing`, `source-state.js` (Owner-Entscheidung 19.09.) als FINAL_SESSION. Plus das Aggregat aus §8.

Historischer Regressionscheck (§11): **nicht derselbe Fehler** [M]. Wächter PASS (93,4 % geprüft, 454 zurückgestellt), der Stillstand trifft alle Titel gleichmäßig — Kennzeichen eines übersprungenen Commits, nicht einer Ablehnungswelle.

Warum der Health-Contract es nicht verhinderte (§12): Der Monitor meldete seit 22.09. rot, der Refresh-Lauf war rot — beide korrekt. Es gab aber keinen Mechanismus, der aus einem Lauf, dessen Daten alle Datengates bestanden, die Daten trotzdem veröffentlicht, wenn ein *Code*-Test an Live-Daten scheitert. Die Regel „Tests dürfen nicht am fortgeschriebenen Bestand zählen“ war nicht durchgesetzt.

## 10. Tatsächlicher Produktimpact **[M]**

- 6314 Titel: Kartenzahl, 1W–1J-Charts, Tagesveränderung, Ranglisten, Faktoren, Technical Intelligence drei Sitzungen alt (18.09.), sichtbar ohne eigenen Hinweis auf der Karte.
- Aktienseite 1T und Mikrochart korrekt auf 23.09. — daher die Owner-Beobachtung.
- 7 Titel dauerhaft „Schluss fehlt noch“, obwohl die Sitzung abgeschlossen war.
- Keine falsche Live-Behauptung gefunden.

## 11. Fix

| Defekt | Datei | Änderung |
|---|---|---|
| datenabhängiger Test verwirft EOD | `quant/tests/market-signal-contract.test.mjs` | Erwartungen an Stichtag `2026-09-18` gebunden (Reihen beim Laden abgeschnitten), Gegenprobe-Test |
| Nach-Schluss-Stand nicht geschrieben | `quant/engines/realtime/intraday-snapshot.js` (`unchanged`), `scripts/market/ingest-intraday.mjs` | `fetchedAfterClose` im Vergleich |
| Vertrag widerspricht Source State | `quant/engines/realtime/freshness.js` | `fetchedAfterClose` ohne Schluss-Slot → LAST_SESSION/`sessionCompleteNoLateTrades`, Label ohne erfundenes 16:00 |
| Aggregat falsch-positiv | `ingest-intraday.mjs` (`dataSession.fetchedAfterClose`, Zählungen), `check-freshness.mjs` | nach Schluss geholt ≥ Universumsschwelle statt „alle mit 15:55-Kurs“ |
| Urteil aus Summary | `scripts/market/check-freshness.mjs` | Urteil aus den Reihen; abweichendes Summary als eigener Befund |

Keine neue Pipeline, kein neuer Provider/Worker/Waker/Bridge, kein Discover-Code, keine bezahlten Dienste.

## 12. Regressionstests

`quant/tests/market-data-freshness-p0.test.mjs` (16 Tests) + 1 neuer Test in `market-signal-contract.test.mjs`:
aktueller EOD + altes Summary (FC5), altes EOD + aktuelles Intraday (FC3), beide aktuell (FC2), beide stale (FC7), Markt offen inkl. Stillstand (FC8), Markt zu/vorbörslich (FC1), Wochenende (FC9), Feiertag Labor Day/Thanksgiving (FC1/FC10), verkürzte Sitzung (FC11), Deployment-Lag / Summary kaschiert alte Reihen (FC6), falscher Session-Tag (FC1/FC12), illiquide Titel (FP1–FP4, FC4).

Gegenproben **[M]**: mit dem alten Code 11 der 16 rot; mit synthetisch fortgeschriebenem `golden-preview` (21.–23.09.) ist der alte Signaltest rot (`14 !== 4`), der neue grün.
Suiten **[M]**: `quant/tests` 1428/1428, `discover/tests` 233/233, Worker/Live 66/66, Secrets, Public-Data-Hygiene, Test-Isolation grün.

## 13. Production Proof

Siehe Teil II (§15–§22). Kein Blind-Refresh wurde ausgelöst, kein manueller Provider-Lauf.

## 14. Verbleibende Risiken

Siehe §22 (aktualisiert am 26.09.).

---

# Teil II — Abschluss des Workstreams (24.–26.09.2026)

## 15. Reliability Gap: EOD-Publish-Gates (#199)

Die ungeteilte Regressionssuite nach dem Abruf ist ersetzt durch drei Klassen, definiert in `quant/config/eod-publish-gates.json` und ausgeführt von `scripts/market/run-eod-publish-gates.mjs`:

| Klasse | Wann | blockiert | Umfang |
|---|---|---|---|
| A PRE_FETCH_CODE_REGRESSION | vor der ersten Provider-Anfrage | ja: kein Abruf | beide Suiten vollständig |
| B POST_FETCH_DATA_INTEGRITY | nach Abruf und Bau, vor dem Commit | ja: kein Commit | Verify-/Secrets-/Lebenszyklus-/Hygiene-Skripte + 12 Testdateien mit Datenverträgen |
| C NON_BLOCKING_OBSERVABILITY | nach dem Commit | nein: `::error` + Summary | alle übrigen Testdateien (in A auf demselben Code grün) |

Warum C den Lauf nicht rot macht: `pages-release.yml` liefert nur bei `workflow_run.conclusion == 'success'` aus. Keine Testaussage wurde abgeschwächt. Die Vorfall-Tests (`market-signal-contract`, `product-services`) liegen in C, die Datenverträge (Hygiene, Secrets, `discover/data`, Klartext-Widerspruch u. a.) in B.

Regression **[M]**: `eod-publish-gates.test.mjs`. Der Vorfall ist an einem Fixture-Root nachgespielt: vor dem Abruf grün, danach ein wertgebundener Test rot → Veröffentlichung und `::error`. Gegenproben: ein verletzter Datenvertrag blockiert in B, ein Code-Fehler verhindert in A den Abruf. Am Repository nachgestellt (alter Signaltest, synthetisch fortgeschriebenes `golden-preview`): B grün, C meldet `market-signal-contract.test.mjs:5/:12`, Exit 0.

## 16. Zweiter, verdeckter Publish-Defekt (#205)

Der erste Nachtlauf mit Gates (Lauf `36078691085`, 25.09.) zeigte **[M]**: A grün (79 s), 68 min Abruf, B grün — dann wurde der Push abgewiesen. Der Rebase kollidierte mit dem Intraday-Universumslauf in `quant/data/product/capabilities-v1.json` und `-summary-v1.json`. Beide Dateien werden aus der Capability-Matrix abgeleitet und von Refresh, Intraday und Taktgeber gemeinsam geschrieben. Die Matrix löste `push-with-retry.sh` nach Erzeugerhoheit auf, die Projektion nicht → Abbruch, Kurse verworfen. Am 22./23.09. war dieser Konflikt hinter dem roten Test verborgen.

Fix: Beide Dateien stehen namentlich unter Erzeugerhoheit, damit Matrix und Projektion aus demselben Lauf stammen; genau das prüft Gate B. `push-with-retry.test.mjs` prüft das an einem echten Git-Wettlauf gegen ein lokales Remote. Gegenprobe: ein Kursdaten-Konflikt bricht ab. PR3: Jeder von Refresh und Intraday/Taktgeber gemeinsam geschriebene Pfad steht unter Erzeugerhoheit. Mit dem alten Skript sind PR1 und PR3 rot.

Recovery ohne neue Architektur **[M]**: Ein Resume über den Tages-Checkpoint hätte fast keine Anfragen gekostet. Der Lebenszyklus-Wächter zählt aber nur den eigenen Lauf und hätte korrekt FAIL gemeldet; er wurde nicht aufgeweicht. Veröffentlicht hat deshalb der reguläre Lauf der folgenden Nacht.

## 17. Erster vollständiger EOD-Lauf mit Gates **[M]**

Lauf `36206072592` (Zeitplan, `main`, 26.09. 00:46–02:16 UTC):

| Schritt | Ergebnis |
|---|---|
| Gate A | grün, 81 s, vor jeder Anfrage |
| Abruf | 6.533 Anfragen, 6.530 ok, 0 fehlgeschlagen, 346 abgelehnt (TEMPORARY_REJECT), 343 zurückgestellt |
| Lebenszyklus-Wächter | PASS, 6.533 / 6.876 geprüft, 0 Sitzungen Rückstand |
| Gate B | grün |
| Commit und Push | grün, Versuch 2: Rebase gegen `11afd562` (Intraday-Universum 25.09.), fünf Konflikte nach Erzeugerhoheit aufgelöst, **darunter beide Produkt-Projektionsdateien (#205 griff)** → `b572ac83` |
| Gate C | 163 Dateien, 2.003 / 2.003 grün, keine `::error` |

`WASTED_PROVIDER_RUN_ON_UNRELATED_TEST = PREVENTED`: Die Suite läuft vor dem Abruf, nach dem Abruf blockieren nur noch Datenverträge.

## 18. EOD-Wahrheit (kanonisch, Stand `b572ac83`) **[M]**

EXPECTED_LAST_COMPLETED_SESSION = **2026-09-25** (Fr, reguläre Sitzung; Messung Sa 26.09., Markt geschlossen).

Nenner: Product Universe = 6.876 Titel im Umfang der kompakten Reihen.

| Kennzahl | Anzahl |
|---|---|
| TOTAL | 6.876 |
| CURRENT_EOD (25.09.) | 6.433 |
| ONE_SESSION_BEHIND (24.09.) | 5 |
| MULTI_SESSION_BEHIND | 48 |
| MISSING (keine Reihe) | 390 |
| REJECTED (Register offen, TEMPORARY_REJECT) | 346 |
| DEFERRED (in diesem Lauf nicht gefragt) | 343 |

`discover/data/meta.json`: Universum asOf 2026-09-25, 5.991 Titel, alle mit Kursreihe. Summary und Reihen stimmen überein.

## 19. Intraday-Schlusswahrheit **[M]**

| Sitzung | Snapshots | nach Schluss geholt | davon ohne 15:55-Kurs (illiquide) | „Schluss fehlt noch“ |
|---|---|---|---|---|
| 23.09. (vor Fix) | 5.196 | 5.189 | 562 | 7 |
| 24.09. | 5.190 | 5.190 | 626 | 0 |
| 25.09. | 5.153 | 5.153 | 584 | 0 |

Direkter Beleg (24.09.): Bei UFG, RDIB und CCM wurde der Mittags-Snapshot nach Schluss neu geschrieben, obwohl `points`, `extended` und `regularComplete` identisch waren. Geändert hat sich nur `fetchedAfterClose` (false → true); genau diesen Fall hat der alte Ingest verworfen. Quellzustand FINAL_SESSION/`sessionCompleteNoLateTrades` und Freshness LAST_SESSION sagen übereinstimmend „Heute · Schluss · letzter Kurs 13:05“ (UFG); kein erfundener 16:00-Kurs. `dataSession.fetchedAfterClose = true` (5.153/5.153). Titel ohne reguläre Bars an einem Tag (z. B. JFIN, RFAI am 24.09., laut Provider `noRegularBars`) behalten korrekt den Vortagesstand.

## 20. Consumer-Konsistenz **[M]** (Stand `b572ac83`)

| Titel | Kartenpreis | 1T | 1W / 1M / 1J | Ranking | Aktienseite |
|---|---|---|---|---|---|
| AAPL, NVDA, MSFT, NBIS, SAP, ASML, NVO, TM, BABA, GSK, AMZN, GOOGL, META, JPM, XOM | 25.09. | Intraday 25.09. FINAL_SESSION | Reihen-Ende 25.09. (1W ab 21.09.) | Faktorzeile asOf 25.09. | `asOf` und `priceSeries.asOf` 25.09. |
| RDIB, CCM, AAAC (illiquide) | 25.09. | Intraday 25.09. FINAL_SESSION | 25.09. | 25.09. | 25.09. |
| UFG, CHEC (am 25.09. keine Intraday-Bars) | 25.09. | kein Tagesverlauf 25.09. | 25.09. | 25.09. | 25.09. |

Kanonische Quellen:

| Fläche | Quelle |
|---|---|
| Kartenpreis und Aktienseite | `discover/data/stocks/US_REAL/<T>.json` (`price`, `asOf`), gebaut aus `discover-series` |
| 1W / 1M / 1J | `quant/data/market/discover-series/ref_<T>.json` |
| Ranking | `quant/data/market/factors/factors-FULL_UNIVERSE.json` → `discover/data/rows` |
| 1T | `quant/data/market/intraday/<Sitzung>/ref_<T>.json` über `source-state.js` |

`asOf`-Felder in `rows`/`home`/`feed` mit anderem Datum als 25.09. gibt es nur in zwei Klassen, beide ohne Kurs: SEC-Jahresabschluss-Hooks und -Storys (`sec_edgar:companyfacts`, 23.09.) und der Stichtag der Indexmitgliedschaft (15.09.). **PASS**

## 21. Deployed-Stand und Freshness **[M]**

DEPLOYED_PLACEHOLDER

## 22. Verbleibende Risiken (26.09.)

- **[M/U] Auslieferungs-Trigger:** Für Refresh-Läufe auf `main` erzeugte GitHub keinen `workflow_run`-Pages-Lauf (beobachtet: Dispatch 25.09. 16:06 UTC, Zeitplan 26.09. 02:16 UTC); für Intraday- und Multi-Asset-Läufe schon. Ursache **UNKNOWN**. Wirkung begrenzt: Jeder Pages-Lauf liefert den Kopf von `main` aus, der Multi-Asset-Lauf (alle 3 h) löst Pages aus, werktags zusätzlich die 5-Minuten-Brücke. Am 26.09. per `workflow_dispatch` des bestehenden Release-Workflows ausgeliefert (keine Provider-Anfrage). Keine neue Bridge gebaut.
- **[M] Fremde Provider-Nutzung:** Am 25.09. hat ein anderer Workstream (Quant 2.0) den Refresh mehrfach manuell gestartet, einmal auf `main` während der US-Sitzung (14:02–16:06 UTC). Das liegt nicht an diesem Workstream, wird aber hier dokumentiert, weil es dasselbe Stundenkontingent berührt.
- **[I]** Ein echter Datenvertragsbruch (Gate B) verwirft weiterhin den Lauf. Das ist gewollt.
- **[M]** Die Kartenzahl trägt keine eigene Stand-Kennzeichnung (Discover eingefroren, nicht geändert).
- **[M]** Fremd, nicht angefasst: `social/tests/hard-invariants.test.mjs` HI15.

## 23. Target State

| Ziel | Stand |
|---|---|
| EOD_PIPELINE | PASS (Lauf `36206072592`) |
| EOD_PUBLICATION | PASS (`b572ac83`) |
| PRE_FETCH_REGRESSION_GATE | PASS |
| POST_FETCH_DATA_INTEGRITY_GATE | PASS |
| WASTED_PROVIDER_RUN_ON_UNRELATED_TEST | PREVENTED |
| INTRADAY_CLOSE_TRUTH | PASS |
| FRESHNESS_CHECK | FRESHNESS_PLACEHOLDER |
| CANONICAL_EOD_ASOF | 2026-09-25 = LAST_COMPLETED_SESSION |
| PRODUCTION_EOD_ASOF | PRODUCTION_PLACEHOLDER |
| NEW_DATA_ARCHITECTURE / NEW_BRIDGES / PAID_SERVICES_ENABLED | 0 / 0 / 0 |
| CRITICAL_BLOCKERS | 0 |
