# TIINGO COMMERCIAL — SCALE PHASE 1

Vom Canary zum Universum. Was gebaut wurde, was gemessen wurde, und was
weiterhin offen ist.

---

## Die Rollenänderung

Die Golden Five (AAPL, MSFT, NVDA, JPM, XOM) sind ab dieser Phase **nicht mehr
das Zieluniversum**. Sie sind der **Canary-/Regressionssatz**: fünf bekannte
Titel, die vor jedem Scale Gate geprüft werden, damit eine Regression eine
Minute kostet und nicht einen Lauf über 2.000 Titel.

Das Zieluniversum kommt ab jetzt aus den Stammdaten des Anbieters.

## Die Kette

```
build-market-universe    Anbieterstammdaten  → klassifiziertes Universum
select-gate-universe     Universum           → Gate-Auswahl (geschachtelt)
run-scale-gate           Gate-Auswahl        → Kurse, Qualität, Bilanz, Urteil
build-market-factors     Kurse               → Faktoren + Screener-Datenmodell
run-technical-scale      Kurse               → Technical/Elliott-Deckung
build-health-report      alles               → maschinenlesbarer Zustand
```

Jeder Schritt schreibt ein Artefakt, das der nächste liest. Ein fehlender
Schritt ist deshalb sichtbar und nicht stillschweigend eine Null.

## Was neu ist — und was ausdrücklich nicht

| Neu | Warum es neu sein musste |
|---|---|
| `instrument-classification.js` | Die Frage „ist das eine Aktie?" entscheidet, was im Screener landet. Sie gehört an eine Stelle, an der sie einzeln getestet wird. |
| `market-factors.js` | Eine Zeile je Titel statt eines vollständigen Bundles. Rechenprimitive aus `feature-store.js` — keine zweite Methodik. |
| `subscription-tiers.js` | HOT/WARM/COLD. Ein Universum lässt sich nicht dauerhaft abonnieren. |
| `assessSeries()` in `market-quality.js` | `validateBars()` beantwortet „darf diese Bar in den Bestand?". Bei tausend Titeln lautet die Frage anders: ist dieser Titel brauchbar, eingeschränkt brauchbar oder nicht da. |

**Nicht neu gebaut wurden:** Technical Intelligence, Elliott, Chart Engine,
Backtest, Quant Score, der Tiingo-Adapter, der Speicher. `run-technical-scale.mjs`
ruft dieselben Engines auf, die auch die Einzelansicht benutzt. Ein zweiter
Elliott hätte nichts belegt, was der erste nicht belegt.

## Instrumentenklassifikation (§7)

Tiingos Tickerliste trägt `ticker`, `exchange`, `assetType`, `priceCurrency`,
`startDate`, `endDate` — und **keinen Firmennamen**.

Daraus folgen zwei Dinge, die im Ergebnis stehen und nicht nur im Kommentar:

- **ADR ist ohne Namen nicht bestimmbar.** Das Feld `adrEvidence` steht dann auf
  `"unavailable"`. Ein so eingestufter `COMMON_STOCK` *kann* ein ADR sein.
- **Sektor und Branche fehlen vollständig** (`SOURCE_MISSING`). Sie liegen bei
  Tiingo im Fundamentalzusatz, der in diesem Zugang nicht enthalten ist.

`UNKNOWN` ist ein Ergebnis und ausdrücklich **nicht screenerfähig**. Der
umgekehrte Weg — im Zweifel Aktie — wäre bequemer und wäre genau der Fehler, den
§7 verbietet.

Ein einzelner Buchstabe nach dem Bindestrich ist eine **Aktienklasse** und keine
andere Gattung: `BRK-B` ist eine Stammaktie. Daran scheitert die naheliegende
Regel „Bindestrich = Sonderfall".

## Warum GATE_100 kuratiert ist

§9 verlangt Sektor-Diversifikation. Der Anbieter liefert keinen Sektor. Eine
Verteilung über neun Sektoren lässt sich aus Daten, die keinen Sektor kennen,
nicht ziehen — sie zu behaupten wäre schlimmer, als sie zu kuratieren.

`quant/config/gate-100-seed.json` ist deshalb eine **Auswahl von 100 Titeln**,
kein hart kodiertes Universum: jeder Titel muss sich im Anbieteruniversum als
screenerfähige Aktie wiederfinden, sonst fällt er heraus und ein Ersatz aus
demselben Sektor rückt nach. Die Sektorzuordnung trägt `sectorStatus: "CURATED"`
und wird nie als Anbieterangabe ausgegeben.

Ab GATE_500 wird regelbasiert gezogen. Dort ist Diversifikation kein
Auswahlkriterium mehr, sondern ein Messwert.

**Gates sind geschachtelt.** GATE_500 enthält GATE_100 vollständig. Ohne diese
Eigenschaft wäre ein Vergleich zwischen zwei Gates keiner — eine
Verschlechterung könnte auch daran liegen, dass ganz andere Titel drin sind.

## Was die Gates gemessen haben

Alle drei Stufen sind gegen den echten Zugang gelaufen. Jede Zahl stammt aus
einem Lauf, keine ist geschätzt.

| | GATE_100 | GATE_500 | GATE_2000 |
|---|---|---|---|
| Urteil | PASS | PASS | PASS |
| aufgelöst | 100/100 | 500/500 | 2.000/2.000 |
| PASS / WARNING / FAIL | 76 / 24 / 0 | 295 / 203 / 2 | 862 / 1.133 / 5 |
| UNAVAILABLE | 0 | 0 | 0 |
| Anfragen | 105 | 502 | 2.002 |
| empfangen | 204 MB | 867 MB | 2.477 MB |
| Ablage | 288 MB | 1.521 MB | 5.091 MB |
| Laufzeit | 61 s | 301 s | 1.202 s |
| **je Titel** | **0,614 s** | **0,602 s** | **0,601 s** |
| Bars im Schnitt | 8.490 | 9.077 | 7.731 |
| Historienabdeckung | 100 % | 100 % | 99,95 % |
| Canary | 5/5 | 5/5 | 5/5 |
| Heap / RSS | – | 44 / 243 MB | 51 / 250 MB |

Die Rate je Titel ist über den Faktor 20 hinweg konstant. Das ist der
eigentliche Befund: die Pipeline skaliert linear, und die Grenze liegt
woanders.

| | GATE_100 | GATE_500 | GATE_2000 | FULL (FAIL) |
|---|---|---|---|---|
| Technical READY | 100/100 | 500/500 | 1.999/2.000 | 4.982 |
| Technical ms/Titel | 148 | 146 | 129 | 74 |
| Elliott HIGH / MEDIUM / LOW / AMBIGUOUS | 22/8/8/62 | 130/49/30/291 | 559/132/117/1.191 | 1.293/322/309/3.028 |
| Elliott UNAVAILABLE | 0 | 0 | 0 | 30 |
| Faktoren gerechnet | 100 | 498 | 1.995 | 4.957 |
| SMA20/50/100/200 | je 100 | je 498 | je 1.995 | je 4.951 |
| Momentum 1M/3M/6M/12M | je 100 | je 498 | je 1.995 | je 4.948 |
| relative Stärke 12M | 0 (Benchmark fehlte) | 498 | 1.995 | 4.948 |

## FULL_UNIVERSE: gelaufen und **FAIL** (§25, §37)

Das Vollausbaustadium sollte bewertet werden. Der Lauf hat stattdessen einen
vollständigen Backfill begonnen — die Sicherung stand in einer Shell-Bedingung
im Workflow und hat nicht gegriffen. Aus dem Fehler ist die belastbarste
Messung dieser Phase geworden; das entschuldigt ihn nicht, und die Sicherung
sitzt jetzt im Skript (`--allow-full-backfill`), wo sie sich von außen nicht
falsch verdrahten lässt.

**Das Universum ist kleiner als die Hochrechnung annahm: 5.684 Titel**, nicht
8.158. Der Unterschied ist die Mindesthistorie von drei Jahren, die die
regelbasierte Auswahl verlangt.

| | Wert |
|---|---|
| Universum | 5.684 (NASDAQ 3.209, NYSE 2.236, AMEX 195, übrige 44) |
| aufgelöst | 4.998 |
| **UNAVAILABLE** | **686 — alle `rateLimited`** |
| PASS / WARNING / FAIL | 1.966 / 2.991 / 41 |
| Anfragen | **5.000** |
| empfangen | 4.030 MB |
| Ablage | 7.356 MB |
| Laufzeit | 2.948 s (0,52 s je Titel) |
| Canary | 5/5 |
| **Urteil** | **FAIL** (resolvedRate 87,9 %, successRate 87,2 %, historyCoverage 87,7 %) |

### Die Ursache ist unsere eigene Zahl

`requests: 5000` ist kein Zufall: `COMMERCIAL_LIMITS.requestsPerHour` steht auf
genau 5.000. Der Lauf ist nicht an Tiingo gescheitert, sondern an einem Wert,
den wir selbst gesetzt und nie gemessen haben — er trägt bis heute
`verified: false`.

Damit ist der nächste Schritt klar benannt und klein:

1. Die tatsächliche Stundengrenze des Kontos messen. Bis dahin bleibt 5.000
   die bindende Grenze, und 5.684 Titel passen nicht in einen Lauf.
2. Oder den Backfill über zwei Läufe fahren. Der Checkpoint trägt das
   bereits — der zweite Lauf setzt bei Titel 5.001 an.

Was **nicht** die Antwort ist: die Historie kürzen. Sie ist der Grund, warum
dieser Zugang bezahlt wird.

### Speicher ist nicht die Grenze

Die frühere Hochrechnung von 24 GB stützte sich auf die Ablagerate von
GATE_500 (3.041 MB je 1.000) und auf 8.158 Titel. Beide Zahlen waren zu hoch:
das Universum ist kleiner, und die zusätzlichen Titel tragen kürzere
Historien (Schnitt 4.511 Bars statt 9.077). Gemessen sind **1.294 MB je 1.000
Titel**; ein vollständiger Durchlauf über 5.684 Titel braucht rund **8,4 GB**
und passt damit auf einen Standard-Runner.

Die Lehre daraus gehört in den Bericht, nicht unter den Tisch: eine
Hochrechnung aus einer Stichprobe der größten Titel überschätzt den Bedarf des
ganzen Universums. Deshalb steht in `--assess-only` jetzt, worauf sie sich
stützt — und deshalb ersetzt sie keine Messung.

## Speicher (§26)

Gemessen, nicht geschätzt:

| Was | Größe |
|---|---|
| Volle Historie je Titel (36 Jahre EOD, JSON) | 2,5–2,9 MB |
| Technical-Bundle je Titel | ~0,5 MB |
| Ablage je 1.000 Titel | 2.545–3.041 MB |

Bei 2.000 Titeln sind das 5 GB. Das gehört weder technisch noch
lizenzrechtlich in ein öffentliches Git-Repository.

Die Trennung ist deshalb:

| Ablage | Inhalt | Im Repository |
|---|---|---|
| `.market-cache/` | vollständige Kursreihen, Checkpoints, Universumsliste | nein (gitignored) |
| `quant/data/market/{universe,scale,factors,health}` | Bilanzen, Zustände, Abstände | ja |
| `quant/data/technical/scale/` | Deckungs- und Laufzeitbericht | ja |

Was ausgeliefert wird, trägt **keine Kursniveaus**. „5 % unter dem
52-Wochen-Hoch" ist eine abgeleitete Aussage; „das Hoch liegt bei 184,20" ist der
Kurs des Anbieters. `market-factors.stripPriceLevels()` entfernt das eine und
behält das andere, und `assert-public-data-hygiene.mjs` prüft das erzeugte
Artefakt — nicht die Absicht des Skripts.

## Echtzeit: gemessen bei offener Börse (§5, §6, §21)

**LIVE_CHART_READY = TRUE** — mit einer Einschränkung, die in dieselbe Zeile
gehört.

Gemessen am 2026-09-09 während der regulären US-Sitzung, je 90 Sekunden:

| | NVDA | AAPL + MSFT |
|---|---|---|
| thresholdLevel | 6 | 6 |
| Verbindung | offen, über die volle Dauer stabil | ebenso |
| Kursereignisse | **116** (1,31/s) | 111 (1,24/s) |
| Abstand Median / p90 | 591 ms / 1.185 ms | 627 ms / 1.462 ms |
| Anbieterverzögerung (Median) | **0 s** | 0 s |
| Laufende Minutenkerze | bis **58 Updates** in einer Kerze | AAPL 56, MSFT 18 |
| O/H/L/C | alle vorhanden | alle vorhanden |
| Kerze bestätigt? | nein — sie läuft | nein |

Die Kerze entsteht mit demselben `applyTick()`, das auch das Chart benutzt
(`quant/engines/realtime/bar-merge.js`), nicht mit einer zweiten Rechnung.

### Was der Weg dorthin gezeigt hat

Die erste Messung meldete „138 Nachrichten, 0 Ereignisse" und daraus
LIVE_CHART_READY = FALSE mit der Begründung, der Zugang bediene den Strom
nicht. **Das war falsch.** Die Nachrichten kamen an; der Parser konnte sie nur
nicht lesen:

| Stufe | Ergebnis |
|---|---|
| 6 | angenommen, liefert |
| 5 | abgelehnt: `thresholdLevel not valid for your subscription tier` (400) |
| 0 | dieselbe Ablehnung |

Die Nachrichten der Stufe 6 haben die Form `[Zeitstempel, Ticker, Kurs]` —
drei Felder, **kein Typfeld**. `parseIexMessage` erwartete an erster Stelle
`"T"` und verwarf jede einzelne. Tiingo hat die IEX-Regeln geändert; die
Ablehnungsmeldung sagt es ausdrücklich.

Die Feldfolge wurde **gemessen, nicht geraten** — und ohne einen einzigen Wert
aufzuzeichnen: der Nachweis notiert je Position nur, *was* dort steht
(Zeitstempel, angefragtes Symbol, Zahl). Kurse gehören nicht in einen Bericht.

### Die Einschränkung

Der Anbieter nennt in dieser Form **die Kursart nicht**. Der Tick trägt
deshalb `priceType: "UNSPECIFIED"`, und das schlägt bis in das Urteil durch:
der Chart bewegt sich sichtbar — ob die Zahl ein Abschluss oder ein
Referenzkurs ist, ist damit **nicht belegt**.

Das ist keine Kleinigkeit. Alles, was auf der Kerze rechnet, braucht diese
Auskunft. Zu klären ist sie beim Anbieter, nicht im Code. Bis dahin darf keine
Kennzahl auf dieser Kerze als „auf Abschlüssen gerechnet" ausgewiesen werden.

## Echtzeit-Verteilung (§20, §28)

Der Browser verbindet sich **nie** mit dem Anbieter. Der Schlüssel liegt
serverseitig; das Backend hält die Ströme und verteilt sie.

| Stufe | Wer | Transport |
|---|---|---|
| HOT | aktuell geöffnete Titel | WebSocket |
| WARM | Watchlists, häufig aufgerufene Titel | Kursabfrage |
| COLD | der Rest | EOD |

`maxStreamSubscriptions` steht auf **null** — ungemessen. Mit null läuft die
Zuteilung gegen ein bewusst kleines Budget, und der Plan sagt das. Eine geratene
Zahl wäre schlimmer als keine, weil sie sich wie eine gemessene liest.

## Was ein Lauf gefunden hat, den kein Test fand

Der erste Lauf gegen den Commercial-Zugang hat vier Fehler gezeigt. Der
interessanteste:

> Mit voller Historie fällt Apples **29.09.2000** in die Reihe: minus 51,9 % an
> einem Tag. Das Verhältnis 2,08 liegt innerhalb der Toleranz für einen
> 2:1-Split — `market-quality.js` verwarf die ganze Reihe für ein Ereignis, das
> tatsächlich stattgefunden hat. Damit fiel der Canary, und damit stand das Gate.

Die Korrektur nutzt eine Angabe, die vorher ungenutzt blieb: meldet der Anbieter
für diesen Tag ausdrücklich `splitFactor = 1` **und** wird auf der bereinigten
Spalte geprüft, ist ein nicht bereinigter Split keine mögliche Erklärung mehr.
Wo die Angabe fehlt oder auf der rohen Spalte geprüft wird, bleibt der Verdacht
ein Fehler — das ist keine Aufweichung, und zwei Gegenproben halten es fest.

Die anderen drei: eine Namensverwechslung bei den Sitzungsphasen
(`PRE_MARKET` statt `PRE`) ließ erweiterte Zeiten als `ABSENT` erscheinen,
obwohl der Anbieter 536 statt 390 Bars geliefert hatte; der Gesundheitsbericht
stürzte an einem abgebrochenen Gate ab; und die Hygieneprüfung hielt zwei eigene
Artefakte an, weil eine Anzahl unter dem Feldnamen `sma200` und eine Schwelle
unter `high` stand. Behoben wurden die Feldnamen, nicht die Prüfung.

## Was offen bleibt

| Frage | Status | Warum |
|---|---|---|
| Abo-Grenzen des Stroms | `UNMEASURED` | Ein Vertrag ist keine Messung. Gemessen ist nur, dass Stufe 6 trägt und 5/0 abgelehnt werden. |
| Kursart im Strom | `UNSPECIFIED` | Die Nachrichtenform der neuen IEX-Stufe trägt keinen Typ. |
| Kontingente (`COMMERCIAL_LIMITS`) | `verified: false` | Ebenso — und der FULL_UNIVERSE-Lauf hat gezeigt, was das kostet: er ist an unserer eigenen, nie gemessenen Stundengrenze von 5.000 gescheitert. Das ist der teuerste offene Punkt dieser Phase. |
| Sektor/Branche | `SOURCE_MISSING` | Nicht im Zugang enthalten. Nicht geschätzt. |
| ADR-Trennung | `UNVERIFIED` | Ohne Firmennamen nicht entscheidbar. |
| Weitergabe der vollständigen Tickerliste | `LEGAL_REVIEW_REQUIRED` | Anbieterinhalt in Rohform. |

## Ausführen

```bash
# Universum aus den Anbieterstammdaten
TIINGO_API_KEY=... node scripts/market/build-market-universe.mjs

# Gate wählen und laufen lassen
node scripts/market/select-gate-universe.mjs --gate GATE_100
TIINGO_API_KEY=... node scripts/market/run-scale-gate.mjs --gate GATE_100

# Auswertung
node scripts/market/build-market-factors.mjs --gate GATE_100
node scripts/technical/run-technical-scale.mjs --gate GATE_100
node scripts/market/build-health-report.mjs

# Nachweise (brauchen echte Antworten des Anbieters)
TIINGO_API_KEY=... node scripts/market/verify-tiingo-commercial.mjs
TIINGO_API_KEY=... node scripts/market/verify-live-candle.mjs --seconds 90
```

Der Stromnachweis ist nur während der regulären US-Handelszeit aussagekräftig.
Außerhalb kann er nur `UNKNOWN` ergeben — ein ausbleibender Kurs misst dann die
Handelspause und nicht den Tarif.
