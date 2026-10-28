# Quant V10 – Strang SETUP

Stand: 28.10.2026. Nur Research. Kein Vertrag, kein Gate und keine Datei unter `*/data/` wurde geändert. Status überall `NOT_CERTIFIED`, `productionApproved: false`.

## Dateien

| Datei | Art | Inhalt |
|---|---|---|
| `setup-original-inventory-1.0.0.json` | SOURCE_EVIDENCE | Pfad B: veröffentlichte Stände, Ereignisse, Reife, Überlappung, Gate-Kalender |
| `setup-reconstruction-feasibility-1.0.0.json` | TECHNICAL_PARITY | Pfad A: Welche Inputs braucht die Setup-Engine? Eingabeablation auf 5 Titeln |
| `setup-reconstruction-registration-1.0.0.json` | Registrierung | Studienplan V10-SETUP-RECONSTRUCTION 1.0.0, vor jedem Ausgang committet (`e758e48722`) |
| `setup-reconstruction-result-1.0.0.json` | RECONSTRUCTION | 16 Zellen (2 Ereignisarten × 2 Einstiege × 4 Ausstiege), Holm, N_eff |
| `setup-independence-decision-1.0.0.json` | Entscheidungsvorlage | Gate-Vorschlag, Optionen A/B/C, Empfehlung – **nicht aktiviert** |
| `setup-python-verification-1.0.0.json` | TECHNICAL_PARITY | Python-Gegenrechnung (stdlib), 11/11 Prüfungen PASS |

Skripte: `scripts/quant/v10/setup/`. Tests: `quant/tests/v10-setup.test.mjs`.

## Pfad B: Originale Setup-Stände

- 21 veröffentlichte Stände (10.09.–26.10.2026), alle contentHash-geprüft. 12 der 33 NYSE-Sitzungen in dieser Spanne fehlen.
- 4.137 Ereignisse, neu berechnet und identisch mit `setup-outcomes-v1.json`:
  - 1.791 SETUP_NEW
  - 147 SETUP_CONFIRMED
  - 2.199 SETUP_WEAKENED
- Verteilung: 20 Ereignisdaten, 6 ISO-Wochen, 2 Monate.
- Heute ist kein M3- und kein M6-Ergebnis reif:
  - erste M3-Reife am 24.12.2026;
  - erste M6-Reife am **30.03.2027**. Das in V9 genannte Datum 26.03.2027 ist Karfreitag, die Börse ist dann geschlossen.
- Alle M6-Fenster überlappen: 1 disjunktes Fenster. Bis zu 255 Einstiege liegen an einem Tag.
- N_eff des mittleren M6-Ausgangs (Modell wie V9, exakt reproduziert): 17,1 roh, 13,3 SPY-Überschuss.

**Reifekalender unter unverändertem Vertrag.** Frühestens erfüllbar unter der Annahme, dass ab 27.10.2026 an jeder NYSE-Sitzung veröffentlicht wird:

| Gate | Stand | Soll | frühestens |
|---|---|---|---|
| historySpanDays | 46 | 180 | 09.03.2027 |
| historyDates | 21 | 120 | 19.03.2027 |
| completedOutcomesM6 | 0 | 100 | 30.03.2027 (222 SETUP_NEW vom 24.09.) |
| titles | 0 | 20 | 30.03.2027 – der Auswerter zählt alle Titel der Ereignisart, sobald ein M6-Ergebnis reif ist |
| entryVariant | – | ≤ 1 Pp | messbar ab 30.03.2027, Ergebnis offen |
| independentWeeks (Monate) | 2 | 20 | **03.04.2028** – bindend |
| oos | – | 30 je Segment | **nie**: `build-backtest-certification.mjs` Z. 149 setzt das Gate konstant `false` |
| returnBasis | Kurs | Gesamtrendite | strukturell |
| Owner-Freigabe | – | – | keine Zeitbedingung |

Damit ist SETUP_BACKTEST unter dem heutigen Auswerter zu keinem Datum zertifizierbar. Ohne OOS bindet zeitlich der Monatszähler.

## Pfad A: Rekonstruktion

### Machbarkeit

- **Engine: ja.** Die vier Punkt-in-der-Zeit-Zustände hängen nur an Technical-Feldern aus Tages-OHLCV (≥ 300 Balken) und am Schlusskurs. `quantV2.factorEvidence` geht in keine Kaskadenregel ein.
- **Parität:** Das Produkt-Replay `setup-replay-v1` (160 Titel) hat 3.177 von 3.177 Stände mit 0 Abweichungen. Die Neuberechnung von AAPL ist zeilengleich mit dem Replay-Artefakt (551 von 551 Zeilen).
- **Research-Frame: nein.** Der Frame aus `createResearchLoader` liefert nur Wochenschlüsse, ohne Hoch/Tief und ohne Volumen. Die Ablation zeigt, was jeweils fehlt:
  - Gemessen an 2.780 Wochenstichtagen der 5 Titel mit Tages-OHLCV (2016–2026), Vergleich mit voller Tages-OHLCV:

    | Input | gleicher Zustand | gleicher Zustand + Marken |
    |---|---|---|
    | + SPY-Benchmark (wie Produktion) | 100 % | 97,1 % |
    | ohne Volumen | 97,5 % | 97,5 % |
    | nur Tagesschluss | 73,3 % | 6,3 % |
    | Wochenschluss des Frames (2.220 Stichtage, AAPL vom Loader ausgeschlossen) | 46,7 % | 1,4 % |

  - Ohne Volumen kann CONFIRMED nicht entstehen (alle 70 CONFIRMED fallen auf WATCH/SETUP_FORMING), denn `technicalVolumeState` ist Pflichtbedingung.
  - Ohne Hoch/Tief verschieben sich Struktur, Volatilität und vor allem die Marken.
  - Der fehlende Input ist also konkret: Tageshoch, Tagestief und Tagesvolumen, je mindestens 300 Tagesbalken bis zum Stichtag.
  - Der Benchmark ändert keinen Zustand, aber 2,9 % der Marken (Szenario-Bias über die relative Stärke).
- Die Tages-OHLCV des Universums liegt nur im runner-privaten Speicher der Pipeline. Im Repository haben nur 5 Titel Tages-OHLCV, und zwar ab 2015.
- **Gewählter Weg:**
  - Zustände aus dem vom Produkt-Erzeuger berechneten Replay;
  - Ausgänge auf dem Research-Frame mit `{identityEvidence:true, corporateActionEvidence:true}`;
  - CLI `--loader-options`, `listingLifecycle` wird defensiv gelesen.

### Studie V10-SETUP-RECONSTRUCTION 1.0.0

Rahmen:

- 2005–2025, wöchentlich.
- 120 Listings; 40 der 160 Replay-Titel sind ausgeschlossen und nach Grund gezählt.
- Nur heutige Überlebende.
- Kursrendite, Kosten BASE 30 Bp je Runde.
- Vergleich mit SPY.

Ergebnisse, Einstieg NEXT_WEEK_CLOSE und Ausstieg M6_TIME:

| | n | Titel | Ø SPY-Überschuss | 95 % KI (Block) | p Holm | N_eff Modell (Überschuss/roh) | N_eff Bootstrap | disj. M6-Fenster |
|---|---|---|---|---|---|---|---|---|
| SETUP_NEW | 4.861 | 107 | +1,1 % | [−1,7; +3,6] % | 1,0 | 532 / 123 | 642 | 42 |
| SETUP_CONFIRMED | 488 | 88 | −0,3 % | [−4,0; +3,3] % | 1,0 | 216 / 88 | 249 | 37 |

- 0 von 16 Hypothesen werden nach Holm verworfen. Es gibt keinen belegten Überschuss gegenüber SPY; die Kostenstufen LOW und HIGH ändern daran nichts.
- Das vorregistrierte N_eff-Modell und das bootstrap-implizite N_eff liegen nahe beieinander; das Modell ist dabei vorsichtiger.
- Vorwissen ist offengelegt: das Produktartefakt `setup-backtest-v1.json` und die V7–V9-Studien.

## Entscheidungsvorlage (nicht aktiviert)

**Messbefund:**

- Für den SPY-Überschuss sättigt N_eff je Ereignisdatum bei etwa 1/ρ ≈ 12,6. Mehr Titel am selben Tag helfen kaum.
- N_eff wächst nur mit der Zeit. Die Streuung des M6-Überschusses liegt bei 0,35. Damit gilt:
  - N_eff 50 ergibt ein 95-%-Intervall von etwa ±9,7 Pp;
  - N_eff 30 ergibt nur ±12,5 Pp.

**Vorschlag (Option B, empfohlen):**

- `independentWeeks` wird in `eventCalendarMonths` umbenannt. Die Zählung bleibt gleich, das Feld dient nur noch dem Audit.
- Neues Unabhängigkeitsgate je Ereignisart:
  - `m6SpyExcessEffectiveSampleSize ≥ 50` unter dem Modell `setup-neff-overlap-1.0.0`: ρ = max(126-Sitzungen-ρ des Tages-SPY-Überschusses, 0,05);
  - `disjointM6Windows ≥ 4`.
- Frühestes Erfüllungsdatum mit Originalbeobachtungen:
  - SETUP_NEW: 18.01.–30.01.2029;
  - SETUP_CONFIRMED: 29.01.–20.04.2029;
  - mit Stress-ρ 0,11: Ende 2029.

**Die Optionen im Vergleich:**

| Option | Unabhängigkeit frühestens | Folge |
|---|---|---|
| A: Vertrag unverändert | 03.04.2028 (Monatszähler) | misst keine Unabhängigkeit; N_eff dann ≈ 30, 3 disjunkte Fenster |
| B: empfohlen | Jan.–Apr. 2029 | zählt, was es behauptet; etwa 9–12 Monate später als A |
| C: Rekonstruktion als Ersatz | sofort | widerspricht dem Setup-Vertrag (Replay ist keine Ergebnisquelle); Überlebende, Wochenraster, Kursrendite – nicht empfohlen |

Eigene Entscheidung nötig: Der OOS-Auswerter braucht eine Segmentdefinition. Er ist heute konstant `false`.

## Reproduktion

```bash
node scripts/quant/v10/setup/setup-original-inventory.cjs --out <datei>
node scripts/quant/v10/setup/setup-reconstruction-feasibility.mjs --out <datei> [--every N]   # ~20 min bei N=1
node scripts/quant/v10/setup/run-setup-reconstruction.cjs register --out <datei>
node scripts/quant/v10/setup/run-setup-reconstruction.cjs run --registration docs/quant-recovery/v10/setup/setup-reconstruction-registration-1.0.0.json --out <datei> [--private <ausserhalb>] [--loader-options '<json>']
node scripts/quant/v10/setup/build-setup-independence-decision.cjs --out <datei>
python3 -I scripts/quant/v10/setup/verify_setup.py --out <datei>
node --test quant/tests/v10-setup.test.mjs
```

## Grenzen

- Die Rekonstruktion ersetzt keine vorwärts gesammelte veröffentlichte Historie. Sie ist kein Holdout; die Python-Rechnung ist eine zweite Implementierung, keine zweite Datenquelle.
- Wochenraster statt Tagesraster:
  - Einstieg bis zu 4 Sitzungen später als NEXT_CLOSE;
  - SIGNAL_CLOSE, Gegensignal und kombinierte Ausstiegspriorität sind nicht gemessen, weil die Engine sie nicht anbietet.
- Die Projektion setzt tägliche Veröffentlichung, gleichbleibende Ereignisdichte und gleichbleibendes ρ voraus. Sie liefert Schranken, keine Zusage.
