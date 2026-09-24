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

**Ausstehend — Owner-Gate.** Produktion wird aus `main` ausgeliefert; die Fixes liegen auf `claude/vu-market-data-freshness-p0-0z2v3a`. Nach dem Merge veröffentlicht der planmäßige Refresh (22:30 UTC) bzw. ein `workflow_dispatch` die Tageskurse; die Intraday-Läufe schreiben das neue Aggregat. Beweis danach: Freshness-Monitor grün (`--strict` Exit 0) und dieselbe Stichprobe (§4) mit Reihen-`to` = letzte abgeschlossene Sitzung.

Kein Blind-Refresh wurde ausgelöst. Budget: ein Lauf ≈ 6.400 Anfragen (Stunde 7.500, Tag 50.000); während der Sitzung teilt er sich das Stundenkontingent mit dem Intraday-Takt — daher nach Schluss laufen lassen.

## 14. Verbleibende Risiken

- **[I]** Weitere Tests könnten am fortgeschriebenen Bestand zählen; die Läufe 22./23.09. zeigen aber genau einen Fehler, der jetzt behoben ist.
- **[I]** Ein roter Test verwirft weiterhin einen ganzen Datenlauf. Bewusst so belassen (Gate), aber teuer; Owner-Entscheidung, ob datenunabhängige Code-Tests vor den Abruf gezogen werden.
- **[M]** Die Kartenzahl trägt keine eigene Stand-Kennzeichnung; bei EOD-Rückstand ist das Alter auf der Karte nicht sichtbar (Discover eingefroren, nicht geändert).
- **[U]** Die 7 betroffenen Titel des 23.09. bleiben bis zur nächsten Sitzung STALE (ihre Dateien werden erst mit einem neuen Nach-Schluss-Abruf korrigiert).
- **[M]** Fremd, nicht angefasst: `social/tests/hard-invariants.test.mjs` HI15 laut Commit #191 auf `main` rot.
