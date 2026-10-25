# Supertrader – ATR auf Wilder

Stand: 25.10.2026 · Branch `claude/supertrader-atr-wilder` · Status: **zur Prüfung, nicht gemergt** (Fachmodelländerung, Eigentümerentscheidung)

Auftrag: „Supertrader-ATR auf Wilder auf einem separaten Branch: aktuelle Implementierung analysieren, Unterschiede quantifizieren, Auswirkungen auf Signale und historische Ergebnisse dokumentieren, Vorher-Nachher-Vergleich bereitstellen, Referenztests und Gate A ausführen. Kein automatischer Merge dieser Fachmodelländerung.“

## Kurzfassung

1. **Eine ATR-Definition:** `scripts/supertrader/engine/indicators.mjs#atr` rechnet jetzt standardmäßig nach Wilder (RMA, `method: 'wilder'`). Das ist dieselbe Formel wie in der Technical-Welt (`quant/engines/technical/feature-store.js#wilder`) und wie das Turtle-N der Quelle. `method: 'sma'` bleibt als ausdrücklich gewählte Variante erhalten. `trueRange()` und `wilder()` sind eigene, getestete Bausteine.
2. **Keine Live-Regel ändert ihre Zahlen.** Die einzige Regel, die die gemeinsame ATR liest, ist die **eingefrorene Regelversion Donchian/Turtle 1.1.0** (`ind.atr20`, Stop = 2N). Die Live-Version Donchian/Turtle 2.0.2 rechnet N schon nach Wilder (`donchian-v2.mjs#turtleN`). Ein neuer Referenztest zeigt, dass beide Implementierungen dieselben Werte liefern wie `atr(…, 20)`. Dasselbe gilt für die Source-faithful-Methode.
3. **Donchian 1.1.0 bleibt beim SMA** (`ind.atr20` ist festgeschrieben `method: 'sma'`). Diese Version ist eingefroren, und `PREREGISTRATION-R8-TURTLE.json` führt „N als EMA 19/20 der True Range statt 20-Tage-Mittel“ ausdrücklich als Unterschied zwischen 2.0.0 und 1.1.0. Würde 1.1.0 still auf Wilder umgestellt, verlören die R8-Referenz, die Replay-Demonstration und der Kontroll-Backtest des Research-Snapshots ihre Reproduzierbarkeit (Details unter „Risiken“). Die Wirkung einer Umstellung ist unten als Gegenprobe beziffert.
4. **Der Build ist byte-identisch.** `build.mjs --out` vor und nach der Änderung liefert dieselben 1.537 Dateien.
5. **Empfehlung:** Den Branch so mergen (plattformweite Definition, keine Zahlenänderung). Donchian 1.1.0 nicht umstellen. MoKa ATR40 (SOURCE_DERIVED-SMA) nur über eine eigene Owner-Entscheidung im Source-faithful-Vertrag umstellen.

## 1. Bisherige Implementierung

```js
// scripts/supertrader/engine/indicators.mjs (main, b7f787f)
export function atr(high, low, close, n = 14) {
  const tr = …;          // max(H-L, |H-PC|, |L-PC|); ohne Vortagesschluss H-L
  return sma(tr, n);     // einfaches gleitendes Mittel, bei Luecke Neustart
}
computeIndicators(): atr14 = atr(…, 14), atr20 = atr(…, 20)
```

Daneben gibt es im Supertrader drei weitere ATR-artige Rechnungen:

| Ort | Rechenweise | Periode |
|---|---|---|
| `engine/strategies/donchian-v2.mjs#turtleN` (Live 2.0.x, auch 2.0.1/2.0.2/2.1.0) | Wilder: `(19·N_prev + TR)/20`, Start = Mittel der ersten 20 TR | 20 |
| `source-faithful/methods/turtle.mjs#turtleN` (SF Turtle S1/S2) | Wilder, wie oben | 20 |
| `source-faithful/methods/morales-kacher.mjs#atrBefore` (MoKa Buyable Gap-Up) | einfaches Mittel der TR der 40 Sitzungen **vor** dem Gap-Tag | 40 |
| `source-faithful/methods/holy-grail.mjs#adx` | Wilder-Glättung (für ADX, keine ATR) | 14 |

## 2. ATR-Nutzung je Strategie und Quellendefinition

| Strategie (Version) | ATR-Nutzung | Quellendefinition | Rechenweise bisher | nach diesem Branch |
|---|---|---|---|---|
| Donchian/Turtle 2.0.2 (**live**), 2.0.0/2.0.1/2.1.0 | N für Stop 2N (`TUR-STOP-2N`), Positionsgröße (1 % je N über den 2N-Stop), Kennzahl `nPct`, Rang Stärke/N (2.1.0) | Curtis Faith, *The Original Turtle Trading Rules*, Kap. 3: „N = (19 × PDN + TR) / 20“, Start 20-Tage-Mittel (R15-CANONICAL-RULES, `canonical/turtle.json`) | Wilder (`turtleN`) | unverändert. Test: gleich `atr(…, 20)` |
| Donchian/Turtle 1.1.0 (eingefroren, `PREVIOUS_ENGINES`) | N = `ind.atr20` für Stop 2N unter der Einstiegseröffnung (`DON-STOP-01`), `levels.n`, Kennzahl `atr20Pct` | wie oben (Wilder); VU-Abweichung „20-Tage-Mittel“ in `PREREGISTRATION-R8-TURTLE.json` dokumentiert | SMA | **SMA festgeschrieben**, Wilder als Gegenprobe beziffert (Abschnitt 5) |
| SF Turtle S1/S2 | N für Stop, Unit, Nachkauf ½N | wie oben | Wilder | unverändert. Test: gleich `atr(…, 20)` |
| SF MoKa Buyable Gap-Up | Gap ≥ 0,75 × ATR40 (Kriterium `MOKA-SF-BGU-GAP-MEASURE`) | Quelle nennt ATR, aber keine Mittelung; Vertrag: `SOURCE_DERIVED` „simple mean … 40 sessions before the gap day“ | SMA (eigene Funktion) | unverändert. Umstellung nur über eine Owner-Entscheidung im SF-Vertrag (Abschnitt 5.3) |
| Kullamägi Breakout 3.x (live), SF KK Breakout/EP | Stop „nicht weiter als ADR/ATR“ | Quelle lässt ADR **oder** ATR zu | umgesetzt mit **ADR20** (`KK-031`), keine ATR | keine Wirkung |
| Minervini, Darvas, Weinstein, Greenblatt, VU-Trend 52W, Hausstrategie | keine ATR | – | – | keine Wirkung |
| `computeIndicators().atr14` | kein Leser im Code | – | SMA | Wilder (ohne Wirkung, Plattform-ATR für künftige Regeln) |

Festgestellt per Suche nach `atr(`, `atr14`, `atr20`, `trueRange`, `turtleN`, `atrBefore` über `scripts/supertrader/**` und über die Regel-JSONs (`fidelity/R15-CANONICAL-RULES.json`, `fidelity/canonical/*.json`, `validation/R14-SOURCE-CHAINS.json`, `validation/PREREGISTRATION-R8-TURTLE.json`). Keine Quelle im Supertrader schreibt ausdrücklich ein SMA vor. Das SMA der Version 1.1.0 ist eine VU-Vereinfachung und kommt nicht aus einer Quelle.

## 3. Mathematischer Unterschied SMA gegen Wilder

Wilder (RMA): `ATR_t = ATR_{t-1} + (TR_t − ATR_{t-1}) / n`, also ein exponentielles Mittel mit α = 1/n (entspricht einer EMA mit Spanne 2n − 1). Gewichte: `α(1−α)^k`. SMA: Gewicht 1/n für die letzten n Werte, danach 0.

| Eigenschaft | SMA(n) | Wilder(n) | n = 14 | n = 20 |
|---|---|---|---|---|
| Erster Wert | Index n − 1 | Index n − 1 (Startwert = SMA der ersten n TR) | 13 | 19 |
| Mittleres Alter der Gewichte (Trägheit) | (n − 1)/2 | n − 1 | 6,5 gegen 13 Tage | 9,5 gegen 19 Tage |
| Sprung nach einem TR-Schock X | +X/n, bleibt n Tage, fällt dann **abrupt** um X/n | +X/n, klingt geometrisch ab | Halbwertszeit 9,4 Tage | Halbwertszeit 13,5 Tage |
| Summe der Wirkung eines Schocks | X | X | – | – |
| Einfluss des Startwerts | keiner nach n Tagen | (1 − 1/n)^k | nach 60 Tagen 1,2 % | nach 60 Tagen 4,6 % |

Folgen:
- **Trägheit:** Wilder reagiert langsamer auf einen Regimewechsel der Volatilität. Ein einzelner Ausreißer (Gap, Meldung) wirkt länger nach, aber ohne den „Abbruch-Echo“-Effekt des SMA, bei dem die ATR genau n Tage nach dem Schock springt, ohne dass am Markt etwas passiert ist.
- **Festgenagelte Kurse** (Übernahmeangebot): Das SMA fällt nach n Tagen auf nahezu 0. Wilder trägt den Sprung weiter (vgl. ACVA-Fall in `donchian.mjs`, Kanalfilter 1.1.0).
- **Lücken:** Supertrader-Konvention „kein Ersatzwert“. Ein fehlender TR liefert an seiner Stelle `null`, die Wilder-Rekursion läuft mit dem nächsten gültigen Wert weiter. Technical zeigt an der Lücke selbst den Vorwert, sonst sind die Werte gleich. Das SMA startet nach einer Lücke neu (unverändert).

## 4. Quantifizierte Unterschiede auf den Supertrader-Eingaben

Eingabe: dieselben Tagesbalken, die `build.mjs#loadBars` liest: `quant/data/product/technical-signals-v1/*.json.gz` (generatedAt 2026-10-24T02:33Z), gefiltert auf das Supertrader-Universum (`loadUniverse`). Das sind **5.100 Titel mit je 270 Tagesbalken**, fast alle vom 02.09.2025 bis zum 23.10.2026. Kennzahl: **d = ATR_Wilder / ATR_SMA − 1**, nur eingeschwungene Balken (Index ≥ 3n), damit der Startwert nicht mitzählt.

| Menge | n | Balken | Median d | p10 d | p90 d | Median \|d\| | p90 \|d\| | p99 \|d\| | Anteil \|d\| > 10 % | Anteil \|d\| > 20 % |
|---|---|---|---|---|---|---|---|---|---|---|
| Liquide (Schluss ≥ 10 USD, Ø-Umsatz 20 T ≥ 20 Mio. USD = Donchian-Grenze) | 14 | 423.019 | +0,8 % | −9,5 % | +12,1 % | 5,4 % | 14,5 % | 30,2 % | 23,1 % | 3,6 % |
| Liquide | 20 | 390.771 | +0,3 % | −9,6 % | +11,3 % | 5,3 % | 13,8 % | 30,0 % | 21,6 % | 3,2 % |
| Ganzes Universum | 14 | 1.138.027 | +2,1 % | −10,2 % | +19,7 % | 6,8 % | 21,6 % | 130 % | 34,1 % | 11,5 % |
| Ganzes Universum | 20 | 1.048.312 | +2,1 % | −9,9 % | +21,0 % | 6,8 % | 22,7 % | 196 % | 34,1 % | 12,2 % |
| Letzter Tag 23.10.2026, liquide | 14 | 1.818 | – | – | – | 3,9 % | 10,2 % | 26,4 % | – | – |
| Letzter Tag 23.10.2026, liquide | 20 | 1.819 | – | – | – | 4,3 % | 12,2 % | 30,3 % | – | – |

**Maximum:** Die Extremwerte sind keine Marktbewegungen. Es sind Datenfälle:
- **Festgenagelte Kurse:** FL am 26.02.2026, ATR14-SMA ≈ 1·10⁻¹⁶ (Kurs unverändert am Angebotspreis), Wilder 0,20. AL im Mai 2026: SMA 0,002, Wilder 0,04.
- **Unbereinigte Kurs- oder Splitbrüche, bei denen die ATR größer ist als der Kurs:** HUBC am 29.05.2026, n = 20: SMA 50,9, Wilder 1.180 bei einem Kurs von 130,6, d = +2.219 %. Größter negativer Wert: OCG am 07.01.2026, d = −54 %, ATR 1.200 bei einem Kurs von 15,5. Diese Fälle gehören in die Datenqualität, nicht in die ATR-Frage.

Lesart: Im liquiden Universum liegt die typische Abweichung bei ±5 %, in jedem zehnten Fall über 14 %. Im Mittel ist keine der beiden Methoden systematisch höher (Wilder > SMA in 51–54 % der Fälle). Der Unterschied ist zeitlich verschoben: Wilder liegt nach einem Volatilitätsschub länger höher und in ruhigen Phasen kurz nach einem Schub niedriger.

## 5. Auswirkungen auf Signale und historische Ergebnisse

### 5.1 Was dieser Branch tatsächlich ändert

| Prüfung | Ergebnis |
|---|---|
| `node scripts/supertrader/build.mjs --out=<scratch>` vor (main b7f787f) und nach der Änderung | **byte-identisch**, 1.537 Dateien. Signale, Ledger, Replay, Backtests, Registry und Seiten bleiben gleich |
| Live-Engines (KK 3.2, Weinstein 4, Darvas 3.0.2, Minervini 2, Donchian 2.0.2) | lesen die gemeinsame ATR nicht, keine Änderung |
| Research-Snapshot (`snapshot/contract.mjs#CODE_FILES`, `snapshot/replay.mjs`) | Code-Fingerabdruck unverändert (`indicators.mjs` gehört nicht zu den Code-Dateien). Kontroll-Backtest (Donchian 1.1.0) unverändert, weil `atr20` SMA bleibt. Vorhandene Snapshots prüfen weiter `EXACT` |
| Source-faithful-Code-Hash (`runner/run-research.mjs#codeSha256`) | unverändert (`indicators.mjs` nicht enthalten) |

### 5.2 Gegenprobe: Donchian/Turtle 1.1.0 mit Wilder-N

Gleiche Daten wie Abschnitt 4. Engine `donchian.mjs` 1.1.0 unverändert, Simulator `engine/simulator.mjs` wie die Replay-Demonstration (`from` = Balken 60, Ausführung `DEFAULT_EXECUTION`). Einziger Unterschied ist `ind.atr20`: SMA (heute) gegen Wilder. Signale werden über (Titel, Entstehungstag) zugeordnet.

**Signale**

| Größe | SMA (heute) | Wilder | Veränderung |
|---|---|---|---|
| Setups (alle Signalzyklen) | 13.689 | 13.634 | 109 neu, 164 entfallen |
| Einstiege | 5.664 | 5.641 | 50 neu, 73 entfallen, 5.591 am selben Tag |
| davon Stop-Niveau verschoben | – | 5.591 (100 %) | \|Δ Stop\| / Einstieg: Median 0,29 %, p90 0,95 %, p99 2,57 %, Max 7,95 %; vorzeichenbehaftet Median −0,14 % (Wilder-Stop minimal weiter) |
| Ausstieg geändert (Tag oder Regel) | – | 495 (8,9 % der gleichen Einstiege) | 199 mit anderer Ausstiegsregel |
| Stop-Ausstiege (`DON-STOP-01`) | 2.362 | 2.279 | 61 neu, 138 entfallen |
| Kanal-Ausstiege (`DON-EXIT-01`) | 2.706 | 2.758 | |
| Momentaufnahme 23.10.2026: Setups (vorbereitet + Beobachtung) | 1.048 | 1.048 | Stufe bei keinem geändert; Stop-Plan 2N: \|Δ\| Median 3,9 %, p90 11,0 %, Max 32,1 % |

Die Stufe („vorbereitet“, „Beobachtung“) hängt nicht an N, nur der Stop-Plan. Neue oder entfallene Einstiege entstehen nur über die Pfadabhängigkeit: Ein anderer Ausstiegstag gibt den Titel früher oder später für ein neues Setup frei.

**Ergebnisse je Trade** (alle Einstiege, offene Positionen zum letzten Schluss bewertet, vor Kosten)

| Kennzahl | SMA (heute) | Wilder |
|---|---|---|
| Trades | 5.664 | 5.641 |
| Trefferquote | 35,12 % | 35,47 % |
| Ø Rendite je Trade | +0,374 % | +0,405 % |
| Median Rendite | −3,38 % | −3,37 % |
| Ø R (Rendite / Anfangsrisiko) | +0,064 | +0,062 |
| Median R | −0,60 | −0,58 |
| Profit-Faktor (Renditesummen) | 1,097 | 1,104 |
| Ø Stop-Abstand | 6,69 % | 6,85 % |

**Portfolio** (`validation/portfolio.mjs#runPortfolioTR`, Konfiguration wie der Snapshot-Kontroll-Backtest: 1 % Risiko je Trade über den Stop, höchstens 20 % je Position, 12 Positionen, Exposition ≤ 100 %, Szenario S0, Fenster 02.09.2025 bis 23.10.2026)

| Kennzahl | SMA (heute) | Wilder |
|---|---|---|
| Gesamtrendite, Rangfolge alphabetisch | −10,02 % | −12,27 % |
| Max. Drawdown, Rangfolge alphabetisch | −13,33 % | −16,90 % |
| genommene Trades | 247 | 233 |
| Gesamtrendite, Median aus 20 Zufallsreihenfolgen (p10 / p90) | −10,67 % (−18,4 % / +6,2 %) | −10,93 % (−21,3 % / −1,1 %) |
| Max. Drawdown, Median aus 20 Reihenfolgen | −17,03 % | −20,34 % |
| Differenz Wilder − SMA je Reihenfolge | Median −2,1 Pp., Spanne −22,6 bis +14,0 Pp., Wilder besser in 7 von 20 | |

Eine CAGR wird nicht ausgewiesen, weil das Fenster nur rund 10 Handelsmonate umfasst. Lesart: Je Trade verschiebt Wilder die Kennzahlen kaum (Trefferquote +0,35 Pp., Profit-Faktor +0,007, Ø R −0,002). Auf Portfolioebene ist die Streuung über die Reihenfolge der gleichzeitigen Einstiege (±20 Pp.) zehnmal größer als der Methodeneffekt (Median −2,1 Pp.). **Ein Vorteil einer der beiden Methoden ist auf diesen Daten nicht nachweisbar.**

**Veröffentlichte Replay-Demonstration** (`supertrader/data/replay.json`, Gegenprobe per Build mit Wilder-N): Die Zahl der gefundenen Zyklen ginge von 5.068 auf 5.037 zurück, und beide Beispiele würden wechseln. Der heutige STOP-Fall NVDA (Einstieg 29.12.2025 zu 187,90, Stop 177,83, Ausstieg 20.01.2026 −5,45 %) hätte mit Wilder einen Stop bei 175,71 und wäre am 21.01.2026 per Kanal-Ausstieg mit −4,8 % geschlossen worden. Ein neuer STOP-Fall wäre NVDA ab 26.02.2026 (−6,89 % nach einer Sitzung).

### 5.3 MoKa Buyable Gap-Up: ATR40 SMA gegen Wilder

Gleiche Daten, alle Tage mit 40 gültigen Vor-Sitzungen (1.138.203 Tage). \|ATR40_Wilder / ATR40_SMA − 1\|: Median 6,4 %, p90 24,6 %, p99 211 % (Datenbrüche wie in Abschnitt 4).

| Gap-Kriterium `gap ≥ 0,75 × ATR40` | Tage |
|---|---|
| mit beiden erfüllt | 26.175 |
| nur mit SMA (heute) | 3.428 |
| nur mit Wilder | 1.967 |
| Summe SMA gegen Wilder | 29.603 gegen 28.142 (−4,9 %) |

Übereinstimmung der Treffer: 83 %. Das Volumenkriterium und die manuelle Prüfung folgen danach und sind hier nicht gezählt. Weil der Vertrag die Mittelung ausdrücklich als `SOURCE_DERIVED` festlegt (Quelle schweigt) und eigene Golden-Tests hat (`GC-BGU-ATR40-NO-SAME-DAY`), stellt dieser Branch MoKa **nicht** um.

### 5.4 Historische Validierung (DEV/HOLDOUT)

Die eingefrorenen historischen Läufe (`validation/analyze-methods.mjs`, Fenster DEV und HOLDOUT, Research-Snapshot im privaten Objektspeicher) brauchen Zugangsdaten, die lokal nicht verfügbar sind. Sie sind von diesem Branch nicht betroffen:
- Donchian 2.0.x rechnet bereits Wilder.
- Donchian 1.1.0 bleibt SMA.
- Die Source-faithful-Methoden sind unverändert.

Eine historische Gegenprobe „1.1.0 mit Wilder“ wäre eine neue, vorab zu registrierende Variante (eigene Versionsnummer) und gehört nicht in diesen Branch.

## 6. Risiken

| Risiko | Bewertung |
|---|---|
| Stille Umdeutung einer eingefrorenen Regelversion | **Vermieden.** 1.1.0 bleibt SMA, ein Test sichert das ab (Stop = Eröffnung − 2 × SMA-N). |
| Research-Snapshot: `indicators.mjs` fehlt in `CODE_FILES` | **Vorbestehende Lücke.** Hätte dieser Branch `atr20` auf Wilder gestellt, wäre der Kontroll-Backtest-Hash ohne Code-Versionswechsel gekippt, und `REPLAY_FINGERPRINT_MISMATCH` hätte jede Wiederherstellung vorhandener Snapshots scheitern lassen. Eine Aufnahme in `CODE_FILES` ändert den Code-Fingerabdruck. Source-faithful-Läufe brechen dann mit `CODE_VERSION_CHANGED` ab, bis ein neuer Snapshot erfasst ist. Empfehlung: zusammen mit dem nächsten Snapshot-Capture nachziehen, nicht hier. |
| Zweierlei Bedeutung von `ind.atr20` (SMA) und `ind.atr14` (Wilder) | Im Code und im Test dokumentiert. `atr20` hat genau einen Leser (Donchian 1.1.0). Neue Regeln rufen `atr()` auf (Standard Wilder). |
| Drei Wilder-Implementierungen (`indicators.mjs`, `donchian-v2.mjs#turtleN`, `source-faithful/methods/turtle.mjs#turtleN`) | Durch den Gleichheitstest abgesichert (Abweichung ≤ 1e-12). Eine Zusammenführung würde die Live-Engine-Datei und den SF-Code-Hash ändern und ist deshalb nicht Teil dieses Branches. |
| Lückenverhalten weicht an der Lücke selbst von Technical ab (`null` statt Vorwert) | Gewollt (Supertrader: kein Ersatzwert). Der Simulator entscheidet an Lückenbalken ohnehin nicht. |
| Warm-up | Wilder trägt den Startwert länger mit (n = 20: 4,6 % Restgewicht nach 60 Balken). Bei den 270-Balken-Reihen der Live-Daten beginnt der Simulator bei Balken 60. Die Gegenprobe enthält diesen Effekt. |

## 7. Empfehlung je Strategie

| Strategie | Empfehlung |
|---|---|
| Plattform-ATR (`indicators.mjs#atr`, `atr14`) | **Wilder als Standard übernehmen** (dieser Branch). |
| Donchian/Turtle 2.0.x (live) | Keine Änderung, bereits quellentreu Wilder. |
| Donchian/Turtle 1.1.0 (eingefroren) | **SMA behalten** (festgeschrieben). Eine Umstellung brächte laut Gegenprobe keinen nachweisbaren Vorteil (Abschnitt 5.2), würde aber R8-Referenz, Replay-Demonstration und Snapshot-Kontroll-Backtest umdeuten. Wenn doch gewünscht: neue Versionsnummer, eigener PR, neuer Snapshot. |
| SF Turtle S1/S2 | Keine Änderung, bereits Wilder. |
| SF MoKa Buyable Gap-Up (ATR40) | Offen für eine Owner-Entscheidung. Die Quelle schweigt, Wilder wäre die Plattformdefinition. Wirkung: −4,9 % Gap-Treffer, 83 % Übereinstimmung. Umsetzung nur im SF-Vertrag (`contracts/morales-kacher.mjs`, Golden-Test) mit Vorher/Nachher. |
| Kullamägi, Minervini, Darvas, Weinstein, Greenblatt, Trend 52W, Hausstrategie | Keine Änderung (keine ATR; KK nutzt ADR20). |
| Folgearbeit | `engine/indicators.mjs` mit dem nächsten Snapshot-Capture in `snapshot/contract.mjs#CODE_FILES` aufnehmen. |

## 8. Code und Tests

- `scripts/supertrader/engine/indicators.mjs`: `atr(high, low, close, n = 14, { method = 'wilder' })`, `trueRange()`, `wilder()`, `ATR_METHODS`, `ATR_DEFAULT_METHOD`. `computeIndicators`: `atr14` Wilder, `atr20` festgeschrieben SMA. `adrPct` (Zeilen 23–26, Ziel der `codeLocation`-Verweise in R14/R15) ist unverändert.
- `scripts/supertrader/tests/atr-wilder.test.mjs` (9 Tests):
  - handgerechnete Wilder- und SMA-Werte, auch an einer Kurs-Lücke;
  - naive Referenz in geschlossener Form (`(1−α)^(t−s)·Start + Σ α(1−α)^(t−k)·TR_k`) über 3 × 400 Zufallsbalken für n = 14 und 20;
  - SMA-Pfad unverändert;
  - Lückenverhalten;
  - Gleichheit mit `donchian-v2.mjs#turtleN`;
  - Festschreibung von `atr20` und dem Donchian-1.1.0-Stop.
- `scripts/supertrader/tests/sf-turtle-n-wilder.test.mjs` (1 Test): Gleichheit mit `source-faithful/methods/turtle.mjs#turtleN`. Die Datei ist eigenständig, weil nur `sf-*`-Tests den Source-faithful-Baum lesen dürfen (`SF2-LEGACY-ISOLATION`).
- Vorher/Nachher-Rechnung: einmaliges Skript außerhalb des Repos. Es liest nur die committeten Eingaben und schreibt nichts ins Repo. Die Zahlen oben stammen daraus, generierte Artefakte sind nicht committet.

## 9. Prüfläufe auf diesem Branch

| Prüfung | Ergebnis |
|---|---|
| `node --test "scripts/supertrader/tests/*.test.mjs"` | 776 Tests: 775 bestanden, 0 fehlgeschlagen, 1 übersprungen (vorbestehend). Auf main: 766 Tests, 765 bestanden, 1 übersprungen |
| Gate A `node scripts/supertrader/guard-protected-paths.mjs --base=origin/main` | OK, nur Supertrader-Pfade |
| `node scripts/quality/check-test-isolation.mjs` (Standard-Suite Quant) und `--suite "scripts/supertrader/tests/*.test.mjs"` | jeweils keine Produktionsdatei verändert |
| `node scripts/supertrader/build.mjs --out=<scratch>` (wie `supertrader-ci.yml`) | läuft durch (mit `--max-old-space-size=8192`, lokal sonst Speicherabbruch bei 2 GB Heap), Ausgabe byte-identisch zu main |
| `node --test "discover/tests/*.test.mjs"` / `"quant/tests/*.test.mjs"` (wie `supertrader-ci.yml`) | 583 Tests: 576 bestanden, 7 übersprungen / 2.911 bestanden, 0 fehlgeschlagen |
| Historische Validierung, Research-Snapshot, Browser-QA | lokal nicht ausführbar (Zugangsdaten zum Objektspeicher bzw. Playwright/Release-Build), von diesem Branch nicht berührt (Abschnitt 5.1, 5.4) |
