# ABSCHLUSSBERICHT — TIINGO COMMERCIAL PHASE 1 (§36)

Die 31 Punkte aus §36, in der dort vorgegebenen Reihenfolge. Jede Zahl stammt
aus einem Artefakt im Repository, jedes Artefakt aus einem Lauf in GitHub
Actions gegen den echten Zugang. Wo nichts gemessen wurde, steht das da —
nicht eine Null (§30).

---

## 1. Ausgangs-main

`ba36e7f3dfc55e36ee35ae95777d1c5345522dc3`

Die Basis, von der der Branch abgezweigt wurde (§35). `main` ist inzwischen
selbst weitergelaufen (aktuell `0245a0cd7475`), ohne Konflikt zu dieser
Änderung: `mergeable_state: clean`.

## 2. Branch

`claude/tiingo-commercial-phase-1-4j0581`

## 3. Commit

Kopf: `5142c3d733baa5ddb665b4b6308d4fb4aef0f140`
39 Commits, 49 Dateien, +340.031 / −22 Zeilen.

Die Läufe, aus denen die Nachweise stammen:

| Nachweis | Commit | Actions-Lauf |
|---|---|---|
| GATE_100 | `6619a7634c43` | 34337535547 |
| GATE_500 | `3628ef0a8b92` | 34339012486 |
| GATE_2000 | `41a195635392` | 34339904683 |
| FULL_UNIVERSE + Universum + Fähigkeiten | `f07f43fc5d86` | 34342865307 |
| Live-Kerze | `db5a8d67e5d9` | 34361816697 |

## 4. PR

**#60** — offen, nicht gemerged, nicht deployt (§35).
https://github.com/dennismueller10x-sudo/vision-universe-research/pull/60

Prüfungen auf dem Kopf grün: `test` und `validate` beide `success`.

## 5. Commercial Account Auth

**VERIFIED** — `RUNTIME_VERIFIED`, gemessen an allen fünf Canary-Titeln
(`quant/data/market/commercial/capability-retest.json`).

| Fähigkeit | Kontostand | Beleg |
|---|---|---|
| authentication | **VERIFIED** | 5/5 angenommen, 306 ms |
| eod | **VERIFIED** | 9.238 Bars AAPL, ab 1990-01-02 |
| historyDepth | **VERIFIED** | 36,7 Jahre; früher beginnt die Anbieterhistorie nicht |
| adjustedEod | **VERIFIED** | bereinigte Spalten auf 9.238/9.238 Bars, gemessene Stufe **TOTAL_RETURN** |
| corporateActions | **VERIFIED** | AAPL 4 Splits / 81 Dividenden |
| intraday | **VERIFIED** | 390 1-Minuten-Bars |
| extendedHours | **VERIFIED** | siehe Punkt 25 |
| referencePrice (`tngoLast`) | **VERIFIED** | vorhanden neben dem IEX-Kurs |
| latestQuote | **ABSENT** | sitzungsabhängig — siehe unten |

`latestQuote: ABSENT` ist **kein Zugangsbefund**. Der Lauf fiel in die Phase
`PRE`; vor der Eröffnung gibt es keinen ausgeführten Trade. Das Feld trägt
deshalb `sessionDependent: true` und daneben den Referenzkurs, der sehr wohl
kommt. Ein ABSENT ohne diese Zeile wäre eine Falschaussage über den Tarif.

## 6. Realtime/WebSocket

**VERIFIED, mit benannter Grenze.** `wss://api.tiingo.com/iex`, gemessen bei
offener Börse (Phase `REGULAR`, 10:10 ET), je 90 Sekunden.

| | NVDA | AAPL + MSFT |
|---|---|---|
| thresholdLevel | 6 | 6 |
| Verbindung offen nach | 440 ms | 111 ms |
| Kursereignisse | **116** (1,31/s) | 111 (1,24/s) |
| Abstand min / median / p90 / max | 435 / 591 / 1.185 / 3.117 ms | 11 / 627 / 1.462 / 4.042 ms |
| Anbieterverzögerung (median) | **0 s** | 0 s |
| über die volle Dauer stabil | ja | ja |
| Aufteilung | — | AAPL 85, MSFT 26 |

**thresholdLevel 5 und 0 werden diesem Konto verweigert**, mit Code 400:
`thresholdLevel not valid for your subscription tier`. Beide Ablehnungen sind
als `silenceEvidence` festgehalten, damit „keine Kurse" nicht mit „Zugang
liefert nicht" verwechselt wird.

**Der Weg dorthin ist der eigentliche Befund.** Die erste Messung meldete
„138 Nachrichten, 0 Ereignisse" und daraus ein FALSE mit der Begründung, der
Tarif bediene den Strom nicht. Das war falsch. Die Nachrichten kamen an — der
Parser konnte sie nicht lesen: Stufe 6 liefert `[Zeitstempel, Ticker, Kurs]`,
drei Felder ohne Typfeld, während `parseIexMessage` an erster Stelle `"T"`
erwartete. Die Feldfolge wurde gemessen (`messageShape` hält Feld*arten*
fest, nie Werte) und dann geparst, nicht geraten.

## 7. Live Chart Ready

**TRUE — mit Einschränkung in derselben Zeile.**

Beleg: aus den Kursereignissen ist mit demselben `applyTick()` eine laufende
Minutenkerze entstanden, das das Chart benutzt (`quant/engines/realtime/bar-merge.js`) —
keine zweite Rechnung für den Nachweis.

| | NVDA | AAPL | MSFT |
|---|---|---|---|
| Updates in der laufenden Kerze | **58** | 56 | 18 |
| gebildete Bars | 2 | 3 | 3 |
| O/H/L/C/Zeitstempel | alle vorhanden | alle vorhanden | alle vorhanden |
| Spanne relativ | 0,127 % | 0,093 % | 0,077 % |

**Die Einschränkung:** der Anbieter nennt in dieser Nachrichtenform die
Kursart nicht. Jeder Tick trägt `priceType: "UNSPECIFIED"`, `priceTypeVerified: false`.
Der Chart bewegt sich sichtbar — ob die Zahl ein Abschluss oder ein
Referenzkurs ist, ist **nicht belegt**. Zu klären ist das beim Anbieter, nicht
im Code. Bis dahin darf keine Kennzahl auf dieser Kerze als „auf Abschlüssen
gerechnet" ausgewiesen werden.

## 8. Market Universe Size

Aus der echten Tickerliste des Anbieters (`supported_tickers.zip`, 801.602
Bytes, 108.572 Zeilen):

| Instrumententyp | Anzahl |
|---|---|
| COMMON_STOCK | 47.887 |
| FUND | 49.878 |
| ETF | 9.587 |
| WARRANT | 697 |
| OTHER | 494 |
| PREFERRED | 29 |
| ADR | 0 (**Untergrenze, keine Zählung** — siehe unten) |
| ETN / UNKNOWN | 0 |

- **Screenerfähig:** 31.319 (COMMON_STOCK + ADR)
- **Regelbasiert handelbar:** **5.684** (Primärbörse, USD, aktiv, ≥3 Jahre Historie, kein OTC)
- OTC: 17.109 · Nicht-OTC: 14.210 · aktiv: 66.110 · inaktiv: 42.462

**Zwei Lücken stehen als Feld im Ergebnis, nicht nur im Kommentar:**
`sector`/`company` = `SOURCE_MISSING` (die Tickerliste trägt keine Namen; Sektor
liegt im Fundamentalzusatz, der in diesem Zugang nicht enthalten ist),
`adr` = `UNVERIFIED` (ohne Firmennamen ist eine ADR nicht von einer Stammaktie
zu unterscheiden — die 0 ist deshalb eine Untergrenze, keine Zählung).

## 9. Gate 100

**PASS.** Kuratierter Seed über 9 Sektoren (NASDAQ 27, NYSE 73).

| | |
|---|---|
| aufgelöst | 100/100 (100 %) |
| PASS / WARNING / FAIL / UNAVAILABLE | 76 / 24 / 0 / 0 |
| Erfolgsquote | 100 % (Schwelle 90 %) |
| Historienabdeckung | 100 % (Schwelle 90 %) |
| Canary | 5/5 |
| Laufzeit | 61 s — **0,614 s je Titel** |
| Anfragen | 105 |
| Ablage | 288 MB |

## 10. Gate 500

**PASS.** Regelbasiert aus dem Anbieteruniversum, GATE_100 vollständig enthalten.

| | |
|---|---|
| aufgelöst | 500/500 (100 %) |
| PASS / WARNING / FAIL / UNAVAILABLE | 295 / 203 / **2** / 0 |
| Erfolgsquote | 99,6 % · Fehlerquote 0,4 % (Grenze 5 %) |
| Historienabdeckung | 100 %, faktorbereit 99,6 % |
| Canary | 5/5 |
| Laufzeit | 301 s — **0,602 s je Titel** |
| Anfragen | 502 |
| Ablage | 1.521 MB · Spitzenhaufen 44 MB, RSS 243 MB |

## 11. Gate 2000

**PASS — die höchste bestandene Stufe.**

| | |
|---|---|
| aufgelöst | 2.000/2.000 (100 %) |
| PASS / WARNING / FAIL / UNAVAILABLE | 862 / 1.133 / **5** / 0 |
| Erfolgsquote | 99,75 % · Fehlerquote 0,25 % |
| Historienabdeckung | 99,95 % (1.999/2.000), faktorbereit 99,75 % |
| Canary | 5/5 |
| Laufzeit | 1.202 s — **0,601 s je Titel** |
| Anfragen | 2.002 (davon 4 aus dem Zwischenspeicher, 0 Wiederholungen) |
| Ablage | 5.091 MB · Spitzenhaufen 51 MB, RSS 250 MB |
| Kontingent danach | Stunde 2.002/5.000, Tag 2.002/50.000 |

Alle fünf Prüfungen bestanden: resolvedRate 1,00 · successRate 0,9975 ·
failRate 0,0025 · historyCoverageRate 0,9995 · canaryPassRate 1,00.

## 12. Full Universe

**FAIL.** Der Lauf ist vollständig durchgeführt und vollständig bilanziert —
er wurde nicht abgebrochen, sondern hat sein Urteil verdient.

| | |
|---|---|
| angefordert | 5.684 |
| aufgelöst | **4.998 (87,9 %)** — Schwelle 95 % |
| PASS / WARNING / FAIL | 1.966 / 2.991 / 41 |
| **UNAVAILABLE** | **686 — alle `rateLimited`** |
| Erfolgsquote | 87,2 % — Schwelle 90 % |
| Historienabdeckung | 87,7 % — Schwelle 90 % |
| Canary | **5/5** (der Canary ist nicht gefallen) |
| Laufzeit | 2.948 s — 0,519 s je Titel |
| Anfragen | **exakt 5.000** |

Drei Prüfungen gerissen, alle drei aus **einer** Ursache: nach genau 5.000
Anfragen war Schluss, und 686 Titel wurden nie abgerufen.

**Die Ursache ist unsere eigene Zahl.** `COMMERCIAL_LIMITS.requestsPerHour`
steht in `providers/tiingo/adapter.js` auf genau 5.000 und trägt bis heute
`verified: false`. Der Lauf ist nicht an Tiingo gescheitert, sondern an einem
Wert, den wir selbst gesetzt und **nie gemessen** haben.

Nach §37 wird damit nicht weiter skaliert.

**Nebenbefund, der eine frühere eigene Aussage korrigiert:** die Hochrechnung
von 24 GB war zu hoch — sie stützte sich auf die Ablagerate der größten 500
Titel. Gemessen sind **1.294 MB je 1.000 Titel**; ein vollständiger Durchlauf
braucht rund 8,4 GB und passt auf einen Runner. **Speicher ist nicht die
Grenze. Das Kontingent ist es.**

## 13. Historical Coverage

| Gate | ≥250 Bars | Quote | faktorbereit | Bars im Schnitt | Bars gesamt |
|---|---|---|---|---|---|
| GATE_100 | 100/100 | 100 % | 100 % | 8.490 | 849.032 |
| GATE_500 | 500/500 | 100 % | 99,6 % | 9.077 | 4.538.298 |
| GATE_2000 | 1.999/2.000 | 99,95 % | 99,75 % | 7.731 | 15.461.679 |
| FULL_UNIVERSE | 4.984/5.684 | 87,68 % | 87,05 % | 4.511 | 22.547.253 |

Ältestes Datum durchgehend `1990-01-02` (das angefragte `1990-01-01` fiel auf
einen Feiertag), jüngstes `2026-09-08`. Die Historienpolitik ist
`MAX_AVAILABLE` — nicht gekürzt.

## 14. Market Data PASS/WARN/FAIL

| Gate | PASS | WARNING | FAIL | UNAVAILABLE |
|---|---|---|---|---|
| GATE_100 | 76 | 24 | 0 | 0 |
| GATE_500 | 295 | 203 | 2 | 0 |
| GATE_2000 | 862 | 1.133 | 5 | 0 |
| FULL_UNIVERSE | 1.966 | 2.991 | 41 | 686 |

Gründe auf GATE_2000 (ein Titel kann mehrere tragen):

| Grund | Anzahl | Stufe |
|---|---|---|
| clean | 862 | PASS |
| large_move | 807 | WARNING |
| large_move_matching_split_ratio | 283 | WARNING |
| dividend_not_in_adjusted | 34 | WARNING |
| split_not_adjusted | 9 | FAIL |
| stale_last_bar | 4 | WARNING |
| insufficient_history | 1 | WARNING |

`WARNING` ist ausdrücklich kein Ausschluss: die Reihe ist brauchbar und der
Vorbehalt steht am Titel. Auf FULL_UNIVERSE kommen `implausible_split` (7) und
`insufficient_history_for_factors` (1) hinzu.

## 15. Momentum Coverage

GATE_2000, Horizonte in Handelstagen (1M=21, 3M=63, 6M=126, 12M=252):

| Horizont | berechnet | von 1.995 auswertbaren |
|---|---|---|
| 1M | 1.995 | 100 % |
| 3M | 1.995 | 100 % |
| 6M | 1.995 | 100 % |
| 12M | 1.995 | 100 % |

Relative Stärke gegen SPY: 1.995 berechnet, 0 `SOURCE_MISSING`, 0
`INSUFFICIENT_HISTORY`. Der Vergleich ist auf das **Stichdatum des jeweiligen
Titels** ausgerichtet, nicht auf den letzten Bar des Vergleichsmaßstabs — sonst
misst ein Titel mit älterem Stand die Bewegung des Marktes danach mit.

Auf FULL_UNIVERSE: 4.948 von 4.957 berechnet, 9 mit zu kurzer Historie —
ausgewiesen als `insufficientHistory`, nicht als Null.

## 16. SMA Coverage

GATE_2000, je 1.995 auswertbare Titel:

| | berechnet | INSUFFICIENT_HISTORY | SOURCE_MISSING |
|---|---|---|---|
| SMA20 | 1.995 | 0 | 0 |
| SMA50 | 1.995 | 0 | 0 |
| SMA100 | 1.995 | 0 | 0 |
| SMA200 | 1.995 | 0 | 0 |

Ebenso vollständig: die abgeleiteten Zustände (`priceAboveSMA20/50/100/200`,
`distanceToSMA*`, `aboveAllSMA`, `aboveSMA20And50And200`) und das
52-Wochen-Fenster.

`aboveAllSMA` ist **null**, solange auch nur einer der vier Vergleiche
unbekannt ist — ein „nein" aus einer Lücke wäre eine erfundene Aussage.

Auf FULL_UNIVERSE fällt die Deckung mit der Länge der Historie:
SMA20 4.957 · SMA50 4.956 · SMA100 4.954 · SMA200 4.951.

## 17. Technical Coverage

Über die bestehende `technical-analysis.js` (`technical-v1.0.0`), keine zweite
Engine:

| Gate | READY | PARTIAL | FAILED | INSUFFICIENT_HISTORY | SOURCE_MISSING | ms/Titel |
|---|---|---|---|---|---|---|
| GATE_100 | 100 | 0 | 0 | 0 | 0 | 148 |
| GATE_500 | 500 | 0 | 0 | 0 | 0 | 146 |
| GATE_2000 | **1.999** | 0 | 0 | 1 | 0 | 129 |
| FULL_UNIVERSE | 4.982 | 0 | 0 | 16 | 686 | 74 |

GATE_2000-Deckungsquote **99,95 %**. Langsamster Titel AAPL mit 307 ms bei
9.238 Bars. Hochrechnung (linear, weil die Analyse je Titel unabhängig ist):
500 → 1,1 min · 2.000 → 4,3 min · 10.000 → 21,5 min.

## 18. Elliott Coverage

Über die bestehende `elliott-engine.js` (`elliott-v1.0.0-beta`). Die Schwellen
(hoch ab 70, mittel ab 50) ordnen den vorhandenen `confidence`-Wert ein — sie
verändern die Engine nicht und rechnen nichts nach.

| Gate | HIGH | MEDIUM | LOW | AMBIGUOUS | UNAVAILABLE | NOT_RUN |
|---|---|---|---|---|---|---|
| GATE_100 | 22 | 8 | 8 | 62 | 0 | 0 |
| GATE_500 | 130 | 49 | 30 | 291 | 0 | 0 |
| GATE_2000 | **559** | 132 | 117 | 1.191 | 0 | 1 |
| FULL_UNIVERSE | 1.293 | 322 | 309 | 3.028 | 30 | 702 |

Auf GATE_2000 sind **28 % der Titel hochsicher** gezählt, 59,6 % bleiben
mehrdeutig — davon 115 mit `FIRST_LEG_ONLY`. Dass die Mehrheit mehrdeutig
bleibt, ist kein Defekt: es ist die ehrliche Ausbeute einer Wellenzählung über
ein breites Universum.

## 19. Quant Market Factor Coverage

40 Felder je Titel, jedes mit eigenem Statuscode. Auf GATE_2000 sind **37 von
40 Feldern für alle 1.995 auswertbaren Titel berechnet**. Die drei mit Lücken:

| Feld | CALCULATED | INSUFFICIENT_HISTORY | SOURCE_MISSING |
|---|---|---|---|
| volumeRatio20over60 | 1.956 | 39 | 0 |
| volumeSpikeRatio | 1.953 | 39 | 3 |
| volumeBreakout | 1.953 | 42 | 0 |

Risiko: `volatility60d` 1.995, `maxDrawdown252d` 1.995.

Backtest-Bereitschaft GATE_2000: `DATA_SUPPORTS_BACKTEST` für 1.138 Titel mit
Ereignissen — TOTAL_RETURN 783, SPLIT_ADJUSTED 218, UNKNOWN 137,
**widersprochene Bereinigungsstufe: 0**, **Zukunftsbars im Bestand: 0**. Roh-
und bereinigte Spalte liegen nebeneinander; die Stufe wird gemessen, nicht aus
der Anbieterdokumentation übernommen. Ein Leistungsversprechen ist damit
nicht verbunden.

## 20. Screener Readiness

**READY** auf GATE_2000: 1.995 auswertbar, 5 nicht (die FAIL-Reihen).
18 Fragen — 9 boolesche, 9 Ranglisten:

| Frage | Treffer | nicht entscheidbar |
|---|---|---|
| über SMA20 | 665 | 0 |
| über SMA50 | 879 | 0 |
| über SMA100 | 1.085 | 0 |
| über SMA200 | 1.244 | 0 |
| über SMA20+50+200 | 435 | 0 |
| über allen SMA | 412 | 0 |
| neues 52-Wochen-Hoch | 51 | 0 |
| ≤5 % unter dem 52-Wochen-Hoch | 294 | 0 |
| Volumenausbruch | 90 | **42** |

Ranglisten (je 1.995 gereiht): stärkstes Momentum 12M / 6M / 12M-1M, stärkste
relative Stärke 12M, Trendbeschleunigung, höchste und niedrigste Volatilität,
nächstes 52-Wochen-Hoch, tiefster Rückgang.

**Jede Frage trägt drei Zahlen: Treffer, Nichttreffer und nicht entscheidbar.**
Ohne die dritte liest sich eine Lücke wie ein Befund — genau der stille
Nullwert, den §30 verbietet.

## 21. Runtime

| Gate | Abruf | Faktoren | Technical + Elliott | **s/Titel (Abruf)** |
|---|---|---|---|---|
| GATE_100 | 61 s | 2 s | 20 s | **0,614** |
| GATE_500 | 301 s | 13 s | 101 s | **0,602** |
| GATE_2000 | 1.202 s | 42 s | 358 s | **0,601** |
| FULL_UNIVERSE | 2.948 s | 58 s | 510 s | 0,519 |

**Die Rate je Titel ist über den Faktor 20 konstant** (0,614 → 0,602 → 0,601).
Die Pipeline skaliert linear; die Grenze liegt woanders — beim Kontingent.

## 22. Requests

| Gate | Anfragen | Zwischenspeicher | Wiederholungen | Empfangen | Stundenkontingent danach |
|---|---|---|---|---|---|
| GATE_100 | 105 | 0 | 0 | 204 MB | 105/5.000 |
| GATE_500 | 502 | 4 | 0 | 867 MB | 502/5.000 |
| GATE_2000 | 2.002 | 4 | 0 | 2.477 MB | 2.002/5.000 |
| FULL_UNIVERSE | **5.000** | — | 0 | 4.031 MB | **5.000/5.000 — erschöpft** |
| Fähigkeitsnachweis | 20 | — | — | — | — |

Eine Anfrage je Titel plus Vergleichsmaßstab. Keine einzige Wiederholung war
nötig — der Anbieter hat in keinem Lauf einen Abruf abgewiesen, außer am
Kontingent.

## 23. Storage

| Gate | Ablage gesamt | **je 1.000 Titel** |
|---|---|---|
| GATE_100 | 288 MB | 2.883 MB |
| GATE_500 | 1.521 MB | 3.041 MB |
| GATE_2000 | 5.091 MB | 2.545 MB |
| FULL_UNIVERSE | 7.356 MB | **1.294 MB** |

Die Rate **sinkt** mit dem Universum, weil die frühen Gates die ältesten und
längsten Reihen enthalten. **Hochrechnung für das volle Universum: rund 8,4 GB
— das passt auf einen Runner.**

Arbeitsspeicher blieb durchgehend klein: Spitzenhaufen 44–51 MB, RSS 243–250 MB
über alle Größen. Der Zwischenspeicher des Anbieters wird periodisch geleert;
die Reihen werden gestreamt, nicht gesammelt.

**Was im Repository liegt: 8,8 MB** — ausschließlich abgeleitete Artefakte
ohne Kursniveaus. Vollständige Kursreihen bleiben in `.market-cache/`
(gitignored, §26). Bei mehr als 500 Titeln wandert der Detailteil in die
Arbeitsablage; **die Befunde und jede Nicht-PASS-Zeile bleiben im Bericht.**

## 24. Realtime Limits

**UNMEASURED — und ausdrücklich als solches ausgewiesen.**

| Größe | Wert | Herkunft |
|---|---|---|
| `maxStreamSubscriptions` | **null** | `source: "UNMEASURED"` |
| `maxConnections` | **null** | `source: "UNMEASURED"` |
| `conservativeStreamBudget` | 25 | eigene Vorsichtsannahme, kein Anbieterwert |
| `tickersPerConnection` | 100 | Rechengröße für die Zuteilung, ungemessen |
| `COMMERCIAL_LIMITS.requestsPerHour` | 5.000 | **`verified: false`** — der teuerste offene Punkt |

Gemessen ist nur, was messbar war: **thresholdLevel 6 wird angenommen, 5 und 0
werden verweigert.** Wie viele Titel eine Anmeldung fasst und wie viele
Verbindungen das Konto trägt, wurde nicht ausgereizt — eine geratene Zahl wäre
ein Ausfall mit Ansage.

Die Verteilung (§20, §28): **HOT** (offene Charts) am WebSocket, **WARM**
(Watchlists) über geteilten Strom oder Kurs-Polling, **COLD** (der Rest) über
EOD. Der Schlüssel liegt serverseitig; **`browserConnectsDirectly: false`** —
der Browser verbindet sich nie direkt mit Tiingo.

## 25. Extended Hours

**VERIFIED** an allen fünf Canary-Titeln. AAPL, 2026-09-08:

| Phase | Bars |
|---|---|
| PRE | **90** |
| REGULAR | 390 |
| AFTER | **56** |
| **gesamt** | **536** |

Ohne `extendedHours` liefert derselbe Abruf 390 Bars —
`additionalBarsWithExtendedFlag: 146`. Der Nachweis ist damit
**kalenderunabhängig**: er hängt an der Differenz zweier Abrufe, nicht an einer
Feiertagsliste.

Die Phasennamen kommen aus `MarketHours.PHASES` der bestehenden Engine
(`PRE`/`REGULAR`/`AFTER`). Ein erster Versuch mit selbst geschriebenen Namen
(`PRE_MARKET`/`AFTER_HOURS`) ließ die Fähigkeit fälschlich als ABSENT
erscheinen — siehe Punkt 30.

## 26. Golden Five Canary

**5/5 in allen vier Gates — auch im gescheiterten.**

| Titel | Status | Bars | von | bis | Splits | Dividenden | Bereinigung |
|---|---|---|---|---|---|---|---|
| AAPL | WARNING | 9.238 | 1990-01-02 | 2026-09-08 | 4 | 81 | TOTAL_RETURN |
| MSFT | PASS | 9.238 | 1990-01-02 | 2026-09-08 | 8 | 91 | TOTAL_RETURN |
| NVDA | WARNING | 6.949 | 1999-01-22 | 2026-09-08 | 6 | 55 | TOTAL_RETURN |
| JPM | PASS | 9.238 | 1990-01-02 | 2026-09-08 | 2 | 153 | TOTAL_RETURN |
| XOM | PASS | 9.238 | 1990-01-02 | 2026-09-08 | 2 | 148 | TOTAL_RETURN |

Regressionsregeln erfüllt: ≥400 Bars, höchstens 5 Handelstage alt, Splits bei
AAPL und NVDA belegt. Keine Regression.

Die Golden Five sind Teil des GATE_100-Universums, **zählen dort aber
ausdrücklich nicht als Qualitätsbeweis** (`canaryNote` in
`quant/config/gate-100-seed.json`). Ein Canary, der sich selbst bestätigt,
wäre kein Canary.

Dass AAPL und NVDA `WARNING` tragen, ist der interessanteste Einzelbefund
dieser Phase — siehe Punkt 29.

## 27. Secrets

**Sauber. Der Schlüssel erscheint nirgends.**

- Der Schlüssel liegt ausschließlich als GitHub-Actions-Secret `TIINGO_API_KEY` vor.
- Jeder Job führt `assert-no-secrets.mjs` **nach** dem Erzeugen der Berichte aus.
- Kein Schlüssel in Log, Bericht, Artefakt, Browser-JS, HTML oder ausgeliefertem JSON (§2).
- Im gesamten Diff kommt `TIINGO_API_KEY` nur als **Referenz** vor (`${{ secrets.… }}`, `process.env.…`, `TIINGO_API_KEY=...` in Dokumentation) — nie als Wert.
- `assert-public-data-hygiene.mjs` prüft die **erzeugten Artefakte**, nicht die Absicht der Skripte, und hat in dieser Phase zweimal zu Recht angehalten.
- Der Secret-Scanner des parallelen SEC-Workstreams hat einen Testschlüssel in `live-candle.test.mjs` bemängelt, der wie ein echter aussah. **Der Scanner hatte recht** — der Wert wird jetzt zur Laufzeit zusammengesetzt. Die Prüfung wurde nicht abgeschwächt.

**Paralleler SEC-Workstream unberührt (§1):**
`git diff origin/main...HEAD -- scripts/quant/sec quant/config/sec-metric-registry.json quant/data/sec/canonical quant/data/sec` ist **leer**.
Kein `PARALLEL_WORKSTREAM_DEPENDENCY` aufgetreten.

**Lizenz (§34):** Interne Nutzung ist nicht öffentliche Weitergabe. Die
vollständige Tickerliste bleibt `LEGAL_REVIEW_REQUIRED` und in der
Arbeitsablage. Kursniveaus (SMA-Werte, 52-Wochen-Hoch/Tief, letzter Kurs) sind
mit `WITHHELD_REDISTRIBUTION` aus allen ausgelieferten Artefakten entfernt:
„5 % unter dem 52-Wochen-Hoch" darf ausgeliefert werden, „das Hoch liegt bei
184,20" nicht. Bestehende Gates wurden nicht entfernt.

**Tests:** 616 → **663**, alle grün. Neu: `market-scale.test.mjs` (24),
`scale-gate.test.mjs` (13, gegen einen lokalen Server in Tiingos Antwortform —
Adapter, Qualitätsprüfung, Speicher und Bilanz laufen dabei echt),
`live-candle.test.mjs` (10, davon sechs gegen einen echten WebSocket-Server).

---

## 28. CRITICAL

**Ein Befund.**

**C-1 — Das Stundenkontingent ist die harte Grenze des Vollausbaus, und es ist
ungemessen.**
`COMMERCIAL_LIMITS.requestsPerHour = 5000` mit `verified: false` hat
FULL_UNIVERSE zum Scheitern gebracht: 686 von 5.684 Titeln blieben
`UNAVAILABLE`, drei von fünf Prüfungen rissen. Der Wert ist eine eigene
Annahme, kein Anbieterwert. Solange er ungemessen bleibt, ist **jede** Aussage
über die Machbarkeit des vollen Universums unbelegt.

*Nächster Schritt, klein und benannt:* die tatsächliche Stundengrenze des
Kontos messen — oder den Backfill über zwei Läufe fahren; der Checkpoint setzt
bei Titel 5.001 an. **Nicht** die Antwort: die Historie kürzen.

## 29. HIGH

**Zwei Befunde.**

**H-1 — Die Kursart des Echtzeitstroms ist nicht belegt.**
`priceType: "UNSPECIFIED"`, `priceTypeVerified: false`. Der Chart bewegt sich,
aber ob die Zahl ein Abschluss oder ein Referenzkurs ist, sagt der Anbieter in
dieser Nachrichtenform nicht. **Konsequenz heute:** keine Kennzahl auf dieser
Kerze darf als „auf Abschlüssen gerechnet" ausgewiesen werden. Zu klären beim
Anbieter, nicht im Code.

**H-2 — Eine Qualitätsprüfung hat eine echte Kurshistorie fälschlich verworfen.**
Mit voller Historie fällt Apples **29.09.2000** in die Reihe: −51,9 % an einem
Tag. Das Verhältnis 2,08 liegt in der Toleranz für einen 2:1-Split, und
`market-quality.js` verwarf die ganze Reihe für ein Ereignis, das tatsächlich
stattgefunden hat. Damit fiel der Canary — und damit stand das Gate.

*Behoben* über eine bisher ungenutzte Angabe: meldet der Anbieter für diesen
Tag ausdrücklich `splitFactor = 1` **und** wird auf der bereinigten Spalte
geprüft, ist ein nicht bereinigter Split keine mögliche Erklärung mehr; der
Befund wird zur Warnung (`large_move_matching_split_ratio`, 283-mal auf
GATE_2000). Fehlt die Angabe oder wird auf der rohen Spalte geprüft, **bleibt
der Verdacht ein Fehler** — zwei Gegenproben halten das fest.

## 30. MEDIUM

**Fünf Befunde — alle behoben, alle aus echten Läufen, keiner aus einem Test.**

**M-1 — Der Größenschutz saß an der falschen Stelle.** Der FULL_UNIVERSE-Lauf
sollte bewerten und hat geladen: die Sicherung stand in einer Shell-Bedingung
im Workflow und hat nicht gegriffen — 5.684 echte Abrufe und das erschöpfte
Stundenkontingent waren die Folge. Sie sitzt jetzt im Skript
(`--allow-full-backfill`), wo sie sich von außen nicht falsch verdrahten lässt;
ein Test weist nach, dass ohne sie **keine einzige** Anfrage gestellt wird.
Der laufende Lauf ließ sich nicht abbrechen — dem Token fehlt das Recht.

**M-2 — Namensverwechslung bei den Sitzungsphasen.** Selbst geschriebene Namen
(`PRE_MARKET`/`AFTER_HOURS`) gegen die Engine-Namen (`PRE`/`AFTER`) ließen
erweiterte Zeiten als ABSENT erscheinen, obwohl 536 statt 390 Bars kamen.
Behoben über `MarketHours.PHASES` plus einen kalenderunabhängigen Bar-Zähl-Beweis.

**M-3 — Der Gesundheitsbericht stürzte an einem abgebrochenen Gate ab.** Ein
Bericht ohne Bilanz war nicht vorgesehen. Jetzt trägt er `ABORTED` und wird
gezählt, statt den Lauf zu beenden.

**M-4 — Die Hygieneprüfung hielt zwei eigene Artefakte an**, weil eine *Anzahl*
unter dem Feldnamen `sma200` und eine *Schwelle* unter `high` stand. Behoben
wurden die **Feldnamen** (`sma200Calculated`, `highConfidenceFrom`), nicht die
Prüfung. Eine Gegenprobe schleust ein echtes Kursniveau ein und belegt, dass
der Wächter weiter greift.

**M-5 — Die relative Stärke verglich mit dem falschen Datum.** Sie nahm den
letzten Bar des Vergleichsmaßstabs statt den Stand am Stichdatum des Titels;
ein Titel mit älterem Stand bekam so die Marktbewegung danach angerechnet.
Behoben und mit einem Vergleichsmaßstab geprüft, der nach dem Stichdatum
springt — ein gleichmäßig steigender hätte den Fehler verdeckt.

*Bewusst offen gelassen (kein Defekt, sondern eine benannte Lücke):* Sektor und
Branche (`SOURCE_MISSING`, nicht im Zugang enthalten), ADR-Trennung
(`UNVERIFIED`, ohne Firmennamen nicht bestimmbar), Weitergabe der Tickerliste
(`LEGAL_REVIEW_REQUIRED`), Abo-Grenzen des Stroms (`UNMEASURED`).

---

## 31. Recommendation

# READY FOR NEXT SCALE GATE

**Nicht** `READY FOR FULL MARKET DATA INGEST`.

**Begründung.** GATE_100, GATE_500 und GATE_2000 sind bestanden, keine Stufe
übersprungen (§37). Die höchste bestandene Stufe ist **GATE_2000**.
FULL_UNIVERSE wurde durchgeführt und ist **FAIL** — damit ist der volle
Datenbezug nach §37 nicht freigegeben, und die Empfehlung darf ihn nicht
aussprechen.

Freigegeben ist genau eine Stufe: **die Wiederholung von FULL_UNIVERSE, nachdem
die Ursache beseitigt ist.**

Und die Ursache ist benannt und klein: **eine ungemessene eigene Zahl.** Nicht
die Datenqualität (99,75 % Erfolg auf 2.000 Titeln), nicht die Laufzeit (über
den Faktor 20 konstant bei 0,60 s je Titel), nicht der Speicher (gemessene
8,4 GB statt der befürchteten 24 GB), nicht der Canary (5/5 in jedem einzelnen
Gate, auch im gescheiterten). Sondern `requestsPerHour: 5000` mit
`verified: false`.

Der maschinenlesbare Gesundheitsbericht sagt dasselbe:

```
overall:          READY_FOR_NEXT_SCALE_GATE
overallReason:    GATE_2000 bestanden. Freigegeben ist FULL_UNIVERSE - und nur das.
latestPassedGate: GATE_2000
```

**Zwei Wege stehen offen, beide ohne die Historie zu kürzen:**

1. **Messen.** Die tatsächliche Stundengrenze des Kontos ermitteln und
   `COMMERCIAL_LIMITS` von `verified: false` auf einen belegten Wert heben.
   Damit fällt der teuerste offene Punkt der ganzen Phase.
2. **Teilen.** Den Backfill über zwei Läufe fahren; der Checkpoint setzt bei
   Titel 5.001 an. Das umgeht die Grenze, misst sie aber nicht — die
   Unsicherheit bleibt.

Empfohlen ist Weg 1, dann Weg 2 als Absicherung.

---

*Nicht gemerged, nicht deployt (§35). PR #60 steht offen.*
