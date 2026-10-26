# V7 – Realstudien

11 benannte Referenzlistings; 27 Studien-/Analysefälle plus 16 Monte-Carlo-Konfigurationen. Dazu gehören elf separate regelbasierte Replays, zwei Regimeansichten, zwei Setup-Wochenhorizonte und jeweils rollierende/expandierende Partitionierung und Aggregation. Diese Zählung ist keine Zahl unabhängiger Studien. [Maschinenlesbare Ergebnisse](v7/real-studies.json) enthalten IDs, Hashes, Population, Zeitraum, Returnbasis, Kosten, Benchmark und Kennzahlen. Individuelle Listinghistorien beginnen am jeweils verfügbaren Anfang, ohne allgemeines Startjahr.

Alle Preisstudien sind PRICE_RETURN in USD auf ex-post splitbereinigten Tiingo-Reihen. Gebühren 10 bps und Slippage 5 bps je Seite sind Modellannahmen; SPY ist passiv ohne Kosten auf exakten gemeinsamen Daten, fehlende Benchmarks bleiben unbekannt. Kein SPY vor Existenz, kein TR-Label. Entry frühestens am Wochenschluss auf einem späteren Datum; kein erfundener Intraday-Fill. Retrospektive Registrierung am 26.10.2026 ist keine damalige Vorregistrierung.

| Studie | Beobachtet / erwartet | Ergebnisgrenze |
|---|---|---|
| V7-SIGNAL-5 | 1532 / 1555 | RETROSPECTIVE_CONDITIONAL_NOT_INDEPENDENT |
| V7-PATTERN | 935 / 945 | RETROSPECTIVE_CONDITIONAL_NOT_INDEPENDENT |
| V7-REPLAY-ref_A | 76 / 77 | RETROSPECTIVE_CONDITIONAL_NOT_INDEPENDENT |
| V7-REPLAY-ref_ARM | 7 / 8 | RETROSPECTIVE_CONDITIONAL_NOT_INDEPENDENT |
| V7-REPLAY-ref_GE | 106 / 107 | RETROSPECTIVE_CONDITIONAL_NOT_INDEPENDENT |
| V7-REPLAY-ref_IBM | 109 / 110 | RETROSPECTIVE_CONDITIONAL_NOT_INDEPENDENT |
| V7-REPLAY-ref_JPM | 116 / 117 | RETROSPECTIVE_CONDITIONAL_NOT_INDEPENDENT |
| V7-REPLAY-ref_META | 46 / 47 | RETROSPECTIVE_CONDITIONAL_NOT_INDEPENDENT |
| V7-REPLAY-ref_MSFT | 115 / 116 | RETROSPECTIVE_CONDITIONAL_NOT_INDEPENDENT |
| V7-REPLAY-ref_NVDA | 85 / 86 | RETROSPECTIVE_CONDITIONAL_NOT_INDEPENDENT |
| V7-REPLAY-ref_TSLA | 47 / 47 | RETROSPECTIVE_CONDITIONAL_NOT_INDEPENDENT |
| V7-REPLAY-ref_WMT | 115 / 116 | RETROSPECTIVE_CONDITIONAL_NOT_INDEPENDENT |
| V7-REPLAY-ref_XOM | 113 / 114 | RETROSPECTIVE_CONDITIONAL_NOT_INDEPENDENT |
| V7-SETUP-RECONSTRUCTED-13 | 257 / 262 | RETROSPECTIVE_CONDITIONAL_NOT_INDEPENDENT |
| V7-SETUP-RECONSTRUCTED-26 | 252 / 262 | RETROSPECTIVE_CONDITIONAL_NOT_INDEPENDENT |
| V7-REGIME-state | siehe JSON | RETROSPECTIVE_CONDITIONAL_NOT_INDEPENDENT |
| V7-REGIME-volatilityState | siehe JSON | RETROSPECTIVE_CONDITIONAL_NOT_INDEPENDENT |
| V7-SEC-EVENT | 97 / 97 | RETROSPECTIVE_CONDITIONAL_NOT_INDEPENDENT |
| V7-FACTOR-SEC-MARGIN | 172 / 180 | RETROSPECTIVE_CONDITIONAL_NOT_INDEPENDENT |
| V7-PORTFOLIO-1 | siehe JSON | RETROSPECTIVE_CONDITIONAL_NOT_INDEPENDENT |
| V7-PORTFOLIO-4 | siehe JSON | RETROSPECTIVE_CONDITIONAL_NOT_INDEPENDENT |
| V7-PORTFOLIO-13 | siehe JSON | RETROSPECTIVE_CONDITIONAL_NOT_INDEPENDENT |
| V7-WF-ROLLING | siehe JSON | RETROSPECTIVE_CONDITIONAL_NOT_INDEPENDENT |
| V7-OOS-AGG-ROLLING | 10 | RETROSPECTIVE_CONDITIONAL_NOT_INDEPENDENT |
| V7-WF-EXPANDING | siehe JSON | RETROSPECTIVE_CONDITIONAL_NOT_INDEPENDENT |
| V7-OOS-AGG-EXPANDING | 10 | RETROSPECTIVE_CONDITIONAL_NOT_INDEPENDENT |
| V7-SENSITIVITY | 36 | EXPLORATORY_FULL_GRID_NO_OPTIMUM_SELECTED |


Die Signaldefinitionen und ihr Cooldown bleiben unverändert. Ereignisoutcomes sind keine finanzierten Portfolios, negative Long-Signale keine Shorts. Die separate finanzierte NVDA-NEW_52W_HIGH-Referenz liefert 21 abgeschlossene Trades und 1.395 reguläre Nettointervalle für Bootstrap. IID ignoriert Wartezeiten/offene Position; periodische Simulation enthält bezahlte Kosten und Markierungen.

Faktorrekonstruktion: JPM, MSFT, NVDA und XOM. Nur gespeicherte originale, qualitätsgeprüfte Accessionzeilen, verfügbarkeitsbegrenzt; jährliche operative Marge aus gleicher Periode/Accession/Einheit. 104 Querschnitte, 180 zugewiesene Outcomes, 172 gereift, 8 offen; 236 ausgeschlossene Faktorzeilen separat. Coverage 172/172 gilt nur für zugewiesene reife Fälle, nicht den vollständigen Vier-Titel-Nenner. Die Auswahl später gespeicherter Fakten ersetzt keine vollständige damalige Vintagehistorie. Keine VU-Produktfaktoren rückdatiert.

Setuprekonstruktionen verwenden archivierte Replayzustände, keine ursprünglichen Veröffentlichungen. Originalarchiv: 20 Stichtage, 43 Tage; M6 bleibt unreif. 13/26 Wochen sind Forschungsproxies, keine Freigabe des M3/M6-Produktvertrags. Schwellen-/Targetexits mit ungeklärter Preisskalierung werden nicht behauptet.

Die 72 Sensitivitätspunkte umfassen Haltedauer 4/13/26, Delay 1/2, Gebühren 0/10, Slippage 0/5/20. Alle Punkte berichtet, kein Gewinner ausgewählt. Engineintervalle sind nominale Zwei-Wege-Clusterintervalle; Tagescluster lösen zeitliche Überlappung nicht. Diese Intervalle tragen deshalb keine bestätigende Signifikanzbehauptung. Ohne valide p-Werte wird keine Holm-Abnahme erfunden.

Vier Walk-Forward-Fenster je Modus, Purging und 7 Tage Embargo, nur gereifte Labels; je 10 Testereignisse einmal aggregiert. Letztes Fenster ohne Validierungsereignisse: keine vollständige Fit-/Select-/Teststudie. OOS hier ist nur chronologische Aggregation bekannter Daten.

Reproduktion (Node 22; Ausgabe außerhalb des Repositorys):

```sh
node scripts/quant/run-v7-real-studies.cjs /private/v7
node scripts/quant/verify-v7-scope.cjs /private/v7
python3 scripts/quant/verify-v7-real-studies.py /private/v7
python3 scripts/quant/analyze-v7-monte-carlo.py /private/v7
```

Private vollständige Inputs/Outputs und immutable Generationen bleiben außerhalb Git; die vorhandenen Quelldateien und ihre Hashes erlauben erneute Generation. Aktuelle spätere Quelldaten erzeugen eine neue Generation. Keine Rohdatenauslieferung.

## Deskriptive Nettoergebnisse

Keine Signifikanz-, Unabhängigkeits- oder Edgebehauptung. Mittelwerte sind über überlappende Ereignisse, keine annualisierten Portfoliorenditen.

| Regel | Beobachtet | Mittlere Nettoereignisrendite (13 Wochen) |
|---|---|---|
| MOMENTUM_IMPROVED | 326 | 5.2131% |
| MOMENTUM_DETERIORATED | 320 | 5.7722% |
| TREND_UP | 311 | 5.4976% |
| TREND_DOWN | 312 | 3.5637% |
| NEW_52W_HIGH | 263 | 5.1915% |

| Portfoliofrequenz (Wochenintervalle) | Zeitraum | CAGR | Max. Drawdown |
|---|---|---|---|
| 1 | 1999-01-22–2026-10-23 | 19.8072% | -61.7754% |
| 4 | 1999-01-22–2026-10-23 | 19.6668% | -61.2565% |
| 13 | 1999-01-22–2026-10-23 | 19.6297% | -60.4098% |

Portfolio: aktuelle ausgewählte Überlebende JPM/MSFT/NVDA, fixe 90 % Aktien/10 % Cash, virtuelle splitbereinigte Einheiten, keine Dividenden. Hohe historische Renditen ausgewählter Gewinner sind kein Auswahl- oder Marktedgenachweis. Umfangreicher Drawdown bleibt sichtbar.
