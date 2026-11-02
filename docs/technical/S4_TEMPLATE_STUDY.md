# S4 – historische Tests der Strategie-Vorlagen (Forschung)

Stand 30.10.2026 · `technical-s4-template-study-1.0.0` · Datenstand 2026-10-23 · Ergebnisdatei: [s4/s4-template-study-2026-10-23.json](s4/s4-template-study-2026-10-23.json)

> **Einstufung: `RESEARCH_LIMITED`, nicht zertifiziert (`productionApproved: false`).** Ein handelbarer Vorteil der Vorlagen ist **nicht nachgewiesen**. Keine dieser Zahlen ist eine Produktaussage oder Renditewerbung; eine Veröffentlichung braucht eine eigene Owner-Freigabe (STRATEGY_TEMPLATES_PLAN.md, S4).

## 1. Architektur (keine zweite Engine)

| Baustein | wiederverwendet |
|---|---|
| Population | `scripts/quant/research/research-population.cjs`, Profil `PRODUCT_DEFAULT` (Frame-Regel V10, Wochenschlüsse split-bereinigt, konditionale Überlebenden-Kohorte) |
| Ausführung | `quant/engines/research-studies.cjs#runEventStudy`: Einstieg am nächsten beobachteten Wochenschluss **nach** dem Signal, Kosten je Seite, SPY-Benchmark, Zensierung, PIT-Prüfungen |
| Inferenz | `research-studies.cjs#inference` (zweifach geclustert: Woche × Emittent) |
| Mehrfachtests | `research-validation.cjs#holm` über alle 20 Paare Vorlage × Horizont |
| Walk-Forward | `research-validation.cjs#buildWalkForward` + `aggregateOos` (feste Regel, kein Fitten; Training 260, Validierung 52, Test 104 Wochen, rollierend ab 2000) auf Wochenkohorten |
| Marktphasen | `research-studies.cjs#classifyRegimes` + `analyzeRegimes` (SPY, 26 Wochen Trend, 13 Wochen Volatilität, PIT) |
| Benchmark | `quant/engines/weekly-benchmark.cjs` (SPY, verifizierte Kursrendite) |

Neu ist nur `scripts/technical/s4/template-study.mjs`: die Wochen-Näherung der Vorlagen (eingefroren in `RULES` vor dem ersten Lauf) und die Ereignisbildung. Ein Ereignis ist der Wechsel von „nicht erfüllt“ auf „erfüllt“ zwischen zwei direkt aufeinanderfolgenden Kalenderwochen. Quant-Engines und Runner bleiben unverändert. Tests: `technical/tests/technical-s4-template-study.test.mjs` (Regeln eingefroren, Kausalität mit vergifteter Zukunft, Ereignisse nur beim Wechsel, Ausgabe nie in generierte Daten).

Neu rechnen: `node --max-old-space-size=10000 scripts/technical/s4/template-study.mjs --out <datei>` (rund 28 min, 5 GB Speicher, kein Netzwerk).

## 2. Testbare Vorlagen

| Vorlage | Wochen-Näherung | Abweichungen von der Tagesvorlage |
|---|---|---|
| Etablierter Aufwärtstrend | 8 Kriterien mit SMA 10/30/40 W, 52-W-Hoch/-Tief aus Schlüssen, RS-Rang (26-W-Rendite in der Kohorte derselben Woche) ≥ 70 | Wochen- statt Tageslinien; Schluss statt Tageshoch/-tief; RS-Rang innerhalb der Studienkohorte |
| Aufwärtstrend, vereinfacht | 5 Kriterien, RS > SPY über 26 Wochen | wie oben |
| Über SMA 200 | Schluss > SMA 40 W | 40-Wochen- statt 200-Tage-Linie |
| 52-Wochen-Hochs | neues 52-Wochen-Schlusshoch | Schluss statt Tageshoch |
| 200-Wochen-Hochs | neues 200-Wochen-Schlusshoch | Schluss statt Wochenhoch |

**Nicht testbar** mit den vorhandenen Daten: Trendfolge (ADX braucht Hoch/Tief), alle Formations-Vorlagen (Dreiecke, Flaggen, Kontraktion), Breakout. Sie brauchen eine Tages-OHLC-Historie; öffentlich liegen nur 270 Tagesbars je Titel, die lange Tageshistorie nur in der privaten R2-Ablage.

## 3. Ergebnis (Überschuss gegenüber SPY nach Kosten 5 + 5 bp, Kursrendite)

4.199 Titel, 1990–2026. *n* = beobachtete Ereignisse. KI = 95-%-Intervall (geclustert). Holm = p-Wert nach Holm über 20 Tests. „Entwicklung“ = Signale vor 2016, „Prüfung“ = ab 2016.

| Vorlage | Horizont | n | Ø netto | Treffer | Ø Überschuss SPY | KI | Holm-p | Entwicklung | Prüfung |
|---|---|---|---|---|---|---|---|---|---|
| Etablierter Aufwärtstrend | 4 W | 98.931 | +0,89 % | 51,3 % | +0,21 % | [+0,02; +0,41] | 0,21 | +0,57 % | −0,17 % |
| | 13 W | 97.924 | +3,73 % | 54,3 % | +1,34 % | [+0,89; +1,79] | <0,001 | +2,47 % | +0,10 % |
| | 26 W | 96.361 | +7,52 % | 56,3 % | +2,57 % | [+1,98; +3,17] | <0,001 | +4,84 % | 0,00 % |
| | 52 W | 92.858 | +14,40 % | 58,3 % | +4,28 % | [+3,32; +5,24] | <0,001 | +8,40 % | −0,83 % |
| Aufwärtstrend, vereinfacht | 13 W | 163.338 | +3,23 % | 54,8 % | +0,79 % | [+0,42; +1,15] | <0,001 | +1,79 % | −0,38 % |
| | 52 W | 156.033 | +12,67 % | 58,5 % | +2,85 % | [+2,05; +3,66] | <0,001 | +6,97 % | −2,44 % |
| Über SMA 200 | 13 W | 139.764 | +2,77 % | 52,9 % | +0,17 % | [−0,24; +0,58] | 1 | +1,14 % | −0,80 % |
| | 52 W | 133.459 | +13,55 % | 56,9 % | +2,58 % | [+1,50; +3,65] | <0,001 | +7,36 % | −2,65 % |
| 52-Wochen-Hochs | 13 W | 158.260 | +2,94 % | 54,9 % | +0,69 % | [+0,34; +1,05] | 0,001 | +2,03 % | −0,91 % |
| | 52 W | 150.704 | +12,42 % | 59,3 % | +2,49 % | [+1,68; +3,31] | <0,001 | +5,99 % | −2,18 % |
| 200-Wochen-Hochs | 13 W | 86.604 | +2,42 % | 55,2 % | +0,29 % | [−0,02; +0,60] | 0,35 | +1,18 % | −0,87 % |
| | 52 W | 82.495 | +10,66 % | 60,1 % | +1,29 % | [+0,50; +2,08] | 0,013 | +3,52 % | −1,97 % |

Alle 20 Zeilen (inkl. 4 und 26 Wochen) stehen in der Ergebnisdatei.

**Weitere Methoden (Horizont 13 Wochen):**

| Vorlage | Kosten 15 + 15 bp: Ø Überschuss | Walk-Forward (10 Faltungen, ab 2005): Ø Überschuss je Signalwoche | Faltungen positiv |
|---|---|---|---|
| Etablierter Aufwärtstrend | +0,93 % | +0,39 % | 5/10 |
| Aufwärtstrend, vereinfacht | +0,37 % | −0,08 % | 5/10 |
| Über SMA 200 | −0,24 % | −0,14 % | 6/10 |
| 52-Wochen-Hochs | +0,28 % | −0,06 % | 5/10 |
| 200-Wochen-Hochs | −0,12 % | −0,23 % | 4/10 |

**Marktphasen (SPY, PIT; Überschuss 13 Wochen):** Der Überschuss entsteht fast nur in Phasen hoher Volatilität und nach Abwärtstrends (z. B. etablierter Aufwärtstrend: +6,3 % bei positivem Trend/hoher Volatilität, n = 6.452). In der häufigsten Phase – positiver Trend, niedrige Volatilität, rund 75 % der Ereignisse – liegt er nahe null (etablierter Aufwärtstrend +0,6 % [+0,2; +1,0]; über SMA 200 −0,7 % [−1,2; −0,3]).

## 4. Einstufung der statistischen Belastbarkeit

| Vorlage | Einstufung | Begründung |
|---|---|---|
| Etablierter Aufwärtstrend | **schwach, nicht belastbar** | Gesamtwert nach Holm signifikant, aber ab 2016 ≈ 0 (13 W +0,10 %, 52 W −0,83 %); Walk-Forward +0,39 % bei 5/10 positiven Faltungen; robusteste der fünf Vorlagen, Vorteil bleibt bei hohen Kosten positiv |
| Aufwärtstrend, vereinfacht | **nicht belastbar** | Vorzeichenwechsel zwischen Entwicklung und Prüfung in allen Horizonten; Walk-Forward ≈ 0 |
| Über SMA 200 | **kein Vorteil** | Prüfteil negativ, 13 W nicht signifikant, nach höheren Kosten negativ |
| 52-Wochen-Hochs | **nicht belastbar** | Vorzeichenwechsel; Walk-Forward ≈ 0 |
| 200-Wochen-Hochs | **kein Vorteil** | 13 W nicht signifikant, Prüfteil negativ |

**Gesamturteil:** Die hohe statistische Signifikanz der Gesamtwerte trägt nicht. Sie stammt aus den Jahren vor 2016 und aus einer Überlebenden-Kohorte, die vergangene Renditen nach oben verzerrt. Im Prüfzeitraum ab 2016 und im Walk-Forward verschwindet der Überschuss gegenüber dem SPY. Absolute Renditen (z. B. +14 % in 52 Wochen) spiegeln vor allem die Marktentwicklung und den Survivorship Bias, nicht die Vorlage.

## 5. Grenzen (auch im Ergebnis unter `limitations`)

- **Survivorship:** nur heute gelistete Titel; Delistings fehlen (die V13-Delisted-Reihen sind privat). Das hebt vergangene Renditen, besonders vor 2016.
- **Keine historische Indexmitgliedschaft:** das Universum ist die heutige Kohorte, nicht das damalige.
- **Nur Wochenschlüsse:** keine Hoch/Tief/Volumen; die Wochen-Näherungen entsprechen den Tagesvorlagen nicht exakt.
- **Kursrendite ohne Dividenden** (Benchmark ebenfalls Kursrendite).
- **Abhängige Ereignisse:** überlappende Horizonte, viele Signale je Woche; die geclusterten Intervalle mildern das, beseitigen es nicht.
- **Explorativ:** die Vorlagen waren vor der Registrierung bekannt (`EXPLORATORY_RULES_KNOWN_BEFORE_REGISTRATION`).
- **Ein verifizierter Benchmark (SPY).** QQQ/IWM liegen vor, haben aber keinen geprüften Benchmark-Vertrag (`weekly-benchmark.cjs` ist SPY-spezifisch).

## 6. Was eine belastbare S4-Aussage bräuchte

1. Population mit Delistings (`V13_DELISTED_F1`, private Reihen) und historischer Mitgliedschaft (PIT S&P 500 ab 2009 bzw. R1000 ab 2005, `research-index-population.cjs`).
2. Tages-OHLC-Historie aus der R2-Ablage für die exakten Tagesvorlagen und die Formations-Vorlagen (Lauf mit privatem Zugriff, kein zusätzlicher Anbieterabruf).
3. Gesamtrendite (`canonical-total-return.js`) für Titel und Benchmark.
4. Bestätigende Registrierung (`CONFIRMATORY_CANDIDATE`) mit vorab eingefrorener Regel und unberührtem Holdout (`registerHoldout`).
5. Danach eigene Owner-Freigabe für jede Produktaussage.
