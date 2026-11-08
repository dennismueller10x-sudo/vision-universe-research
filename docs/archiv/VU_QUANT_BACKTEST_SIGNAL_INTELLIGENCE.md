# Quant Backtest & Signal Intelligence (01.10.2026)

Ergebnis gemessen (`quant/data/product/backtest-signal-intelligence-v1.json`): **QUANT_BACKTEST_SIGNAL_INTELLIGENCE = PASS**.

PASS heißt: Jede Backtest-Art ist gemessen, und ihr Gate entscheidet nach einer festen Regel. PASS heißt nicht, dass alles freigegeben ist. Was zurückgehalten wird, steht mit gemessenem Grund da.

## 1. Bausteine

| Baustein | Datei |
|---|---|
| Signal-Backtest-Engine, Vertrauensregel, Einstiegs-/Ausstiegssemantik | `quant/engines/signal-backtest.js` (signal-backtest-1.0.0, trust-rule-1.0.0, entry-exit-1.0.0) |
| Bestandsaufnahme je Art A–F | `scripts/quant/build-backtest-readiness.mjs` → `backtest-readiness-v2.json` |
| Signal-Studie (Wochenraster, 6.333 Titel seit 1990) | `scripts/quant/build-signal-backtest.mjs` → `signal-backtest-v1.json` |
| Setup-Wiederholung (point-in-time) | `scripts/quant/replay-setup-history.mjs` → `setup-replay-v1/` (nur Zustände und Marken, keine Kurse) |
| Setup-Backtest | `scripts/quant/build-setup-backtest.mjs` → `setup-backtest-v1.json` |
| Alert-Vertrag 2.0.0, Radar-Evidenz, Verfolgung | `quant/engines/quant-radar.js`, `scripts/quant/build-quant-radar.mjs` |
| Messung | `scripts/quant/measure-backtest-signal-intelligence.mjs` |
| Oberfläche | `#/backtest`, Radar-Karten „Historische Evidenz“, Aktienseite „03 / Radar-Status“, Radar-Filter |

Alles läuft täglich in `product-intelligence-materialization.yml`.

## 2. Stand je Backtest-Art

| Art | Entscheidung | Grund / Gate |
|---|---|---|
| A Rückblick derselben Aktie | veröffentlicht | ab 10 abgeschlossenen Fällen |
| B Setup-Backtest | zurückgehalten (nicht bereit) | PIT belegt: 20 von 20 veröffentlichten Setup-Ständen exakt nachgerechnet. Im Repository liegen aber nur 5 Titel mit Tageshistorie (nötig: 20). Dazu kommt: Die Setup-Methodik verlangt eine Zertifizierung (`backtestCertification: NOT_CERTIFIED`). |
| C Signal-Backtest | veröffentlicht (eingeschränkt) | keine Überlebenden-Kontrolle; Kursrendite ohne Dividenden |
| D Strategie-Backtest | zurückgehalten | Index-Zugehörigkeit 2 Stichtage (nötig 24), keine Gesamtrendite, Faktorhistorie zu kurz, keine Indexreihe |
| E Faktor-/Ranking-Backtest | zurückgehalten | Faktorhistorie 4 Snapshots, keine historische Zugehörigkeit |
| F Marktweites Muster | als Häufigkeiten veröffentlicht, nicht als Backtest | Die Studie meldet `backtest: NOT_CERTIFIED` |

## 3. Signal-Backtest (marktweit, 6 Monate, Einstieg Schluss der Folgewoche, 30 bps je Runde)

| Signal | Fälle | im Plus | Median | Abstand zum Marktmedian derselben Woche | typ. Rückgang | Vertrauen |
|---|---|---|---|---|---|---|
| Neues 52-Wochen-Hoch | 59.110 | 55 % | +2,4 % | +0,8 % | −16,9 % | eingeschränkt |
| Momentum verbessert | 93.597 | 52 % | +1,2 % | −0,4 % | −18,9 % | eingeschränkt |
| Momentum verschlechtert | 93.984 | 54 % | +1,8 % | +0,2 % | −19,1 % | eingeschränkt |
| Über der langfristigen Linie | 90.548 | 53 % | +1,3 % | −0,4 % | −18,6 % | eingeschränkt |
| Unter die langfristige Linie | 90.650 | 54 % | +1,8 % | +0,2 % | −18,9 % | eingeschränkt |

**Gemessen:** Nur das 52-Wochen-Hoch besteht alle vier Prüfungen: außerhalb des Lernzeitraums, Walk-Forward, Marktphasen und Nachbarparameter. Bei den Momentum- und Trendwechseln bestätigt sich die Richtung außerhalb des Lernzeitraums nicht. Ihr Abstand zum Markt ist praktisch null.

## 4. Vertrauensregel (trust-rule-1.0.0)

| Stufe | Bedingung |
|---|---|
| NOT_READY | PIT oder Look-ahead nicht bestanden, oder Stichprobe unter 100 Fällen aus 20 Titeln |
| USABLE | zusätzlich bestanden: Stichprobe (≥ 1.000 aus 100 Titeln), Prüfung außerhalb des Lernzeitraums, Walk-Forward, Überlebende, Gesamtrendite, Kosten, Abschlag, Vergleich, Vollständigkeit |
| ROBUST | zusätzlich bestanden: Marktphasen und Parameter-Stabilität, Stichprobe ≥ 3.000 aus 300 Titeln |
| LIMITED | alles dazwischen |

Ergebniszahlen erscheinen ab LIMITED, eine Methodik kann zusätzlich sperren. Sonst steht da: „Historischer Backtest noch nicht freigegeben“, mit Grund.

## 5. Alert-Vertrag 2.0.0

Jedes Ereignis trägt diese Felder:

- `securityId`, `ticker`, `issuerId`
- `eventType`, `occurredAt`, `detectedAt`
- `previousState`, `currentState`
- `trigger`, `invalidation`
- `explanation`, `evidence`
- `backtestEvidence`, `trustState`
- `nextCondition`, `dedupeKey`

Ein Verstoß bricht den Build ab.

Messung: 915 Ereignisse, 0 Verstöße, alle `dedupeKey` eindeutig, 503 Ereignisse mit historischer Evidenz.

## 6. Grenzen und Hebel

- **Überlebende:** Universen sind heute gelistete Aktien. Hebel: delistete Titel aufnehmen.
- **Gesamtrendite:** Für die Wochenreihen fehlt sie. Hebel: wöchentliche Gesamtrendite veröffentlichen.
- **Setup-Stichprobe:** Sie wächst in der Pipeline. Dort läuft eine feste Stichprobe von 150 Titeln, 15 Minuten je Lauf und inkrementell. Die Freigabe der Ausgangszahlen bleibt eine Owner-Entscheidung (Zertifizierung der Setup-Methodik).
- **Strategie-Backtest:** Er bleibt geschlossen, bis mindestens 24 monatliche Stände der Index-Zugehörigkeit vorliegen. Das heutige Universum wird nie eingesetzt.
- **Rohkurse:** Die Rohkurse des Anbieters bleiben runner-privat. Replays enthalten keine Kursreihe.
- **Discover:** unverändert.
