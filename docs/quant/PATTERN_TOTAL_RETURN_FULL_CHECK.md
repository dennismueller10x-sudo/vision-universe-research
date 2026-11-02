# Musterstudie: Kursrendite gegen Gesamtrendite über den vollständigen Bestand

Entscheidung FV-5, Schritt 1 (Owner, 02.11.2026): „Die Gesamtrendite ist als Forschungsgrundlage sinnvoll. Bereite eine nachvollziehbare Vorher-Nachher-Prüfung für den vollständigen Datenbestand und die Zertifizierungsanbindung vor. Aktivierung erst nach fachlicher Prüfung.“

Dieser Bericht hält das Ergebnis des Prüflaufs fest. **Er aktiviert nichts.** Das Produktartefakt `quant/data/product/pattern-research-v1/study.json` bleibt Kursrendite, und das Zertifikat bleibt unverändert.

## Lauf

| | |
|---|---|
| Workflow | `.github/workflows/quant-pattern-total-return-check.yml` (`permissions: contents: read`, kein Commit) |
| Lauf | [41496424128](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/41496424128), Commit `1de37ef8b6`, 02.11.2026 18:00–18:22 UTC, Ergebnis `success` |
| Tageshistorie | private Ablage, nur gelesen (`sync-history-store.mjs --pull --gate FULL_UNIVERSE`): 7.803 von 7.804 Reihen, 23,8 Mio. Tageskerzen, 0 Schreibzugriffe (Class A 0) |
| Vorher | `build-pattern-research.mjs --work-dir … --return-basis price --out $RUNNER_TEMP/pattern-price` |
| Nachher | `build-pattern-research.mjs --work-dir … --return-basis total --out $RUNNER_TEMP/pattern-tr` |
| Vergleich | `scripts/quant/research/compare-pattern-return-basis.mjs` |
| Kurzfassung | [`docs/quant/research/pattern-total-return-full-check.json`](research/pattern-total-return-full-check.json): bytegleich zum Laufartefakt, SHA-256 `9bc3d77d6d92f6fc2f2015f84a7ae612bf72e3c50316075f846ddc2a2913d84c` |
| Laufartefakt | `pattern-total-return-check`, 30 Tage: beide Studien, der volle Vergleich, die Zertifizierungsprobe, Preflight- und Sync-Bericht |

Der Vorher-Lauf reproduziert die committete Produktstudie exakt (`contentHash` `4f2d76fa107df79b`). Kurs- und Gesamtrenditelauf lesen also denselben Stand.

Die Kurzfassung enthält nur Aggregate: Abdeckung, Ausschlüsse nach Grund, Basisquoten, Urteile und Lifts je Hypothese. Sie enthält keinen Titel und keinen Kurs. Welche Titel ausgeschlossen sind, steht nur im Laufartefakt (`pattern-tr/study.json`, `population.totalReturnCoverage.excluded`).

## Abdeckung

| | |
|---|---|
| Zustand | **PASS** (kein `BELOW_MINIMUM_SHARE`) |
| bestätigte Gesamtrendite | 4.929 von 5.059 Reihen = **97,43 %** (Mindestanteil 95 %) |
| ausgeschlossen | 130 Reihen: `CORPORATE_ACTION_CONTRADICTED` 96, `DIVIDEND_MISSING` 32, `SPLIT_MISSING` 2 |
| Rekonstruktion | `TOTAL_RETURN_RECONSTRUCTED` 4.929 · `REJECTED_OTHER` 96 · `REJECTED_DIVIDEND_GAP` 32 · `REJECTED_SPLIT_GAP` 2 · `REJECTED_IDENTITY` 0 |
| Listing-Schnitte | 26 |
| Ergebnis ohne Gesamtrendite-Wochenwert | 0 in jedem Horizont (H12, H24, H36, H60) |
| Beobachtungen | 950.510 → 917.541 (−32.969, nur durch die ausgeschlossenen Titel) |

## Vorher/Nachher

Die beiden Studien sind **nicht gepaart**. Die Gesamtrenditestudie enthält die 130 ausgeschlossenen Titel nicht. Unterschiede vermischen deshalb zwei Effekte: den Wechsel der Renditebasis und die kleinere Population. Erkennung, Merkmale, Schwellen, Horizonte und Folds sind in beiden Läufen identisch (pattern-research-1.1.0).

**Primär H24 / W100 (Verdopplung in 24 Monaten)**

| | Kursrendite | Gesamtrendite |
|---|---|---|
| auswertbare Beobachtungen | 830.076 | 800.227 |
| Gewinner | 89.925 | 94.045 |
| Basisquote | 10,83 % | 11,75 % (+0,92 Pp) |
| Hypothesen | 163 | 163 |
| ROBUST | 96 | **97** (96 gehalten, 1 neu, 0 verloren) |
| IN_SAMPLE_ONLY / NOT_SIGNIFICANT / INSUFFICIENT_SUPPORT / PARAMETER_SENSITIVE | 46 / 11 / 9 / 1 | 48 / 10 / 8 / 0 |
| Median-Lift der 96 gehaltenen ROBUST-Befunde | 1,512 | 1,462 (Δ −0,055; OOS Δ −0,048) |

Vier Urteile wechseln. Dazu gehört `quiet-range+high-volatility`, das von PARAMETER_SENSITIVE auf ROBUST steigt (Lift 2,21 → 2,04, OOS 1,70 → 1,47).

**ROBUST je Horizont**

| Horizont | Basisquote W100 Kurs → TR | ROBUST Kurs → TR | gehalten / neu / verloren | Median-Δ Lift (gehaltene) |
|---|---|---|---|---|
| H12 | 5,63 % → 5,79 % | 98 → 99 | 98 / 1 / 0 | −0,008 |
| **H24 (primär)** | 10,83 % → 11,75 % | 96 → 97 | 96 / 1 / 0 | −0,055 |
| H36 | 15,61 % → 17,81 % | 97 → 91 | 91 / 0 / 6 | −0,079 |
| H60 | 25,29 % → 30,62 % | 68 → **43** | 43 / 0 / 25 | −0,118 |

**Basisquoten W200 / W400** (Kurs → TR): H12 1,89 → 1,90 % / 0,60 → 0,58 %; H24 3,92 → 4,09 % / 1,30 → 1,32 %; H36 5,97 → 6,49 % / 2,00 → 2,12 %; H60 11,71 → 13,84 % / 4,14 → 4,66 %.

### Fachliche Lesart (zur Prüfung, keine Entscheidung)

- **Primärbefund stabil.** Im registrierten Primärhorizont H24 bleiben alle 96 ROBUST-Befunde ROBUST, und einer kommt hinzu. Die Lifts sinken leicht, weil die Basisquote mit Dividenden steigt.
- **Lange Horizonte reagieren deutlich.** In H60 verlieren 25 von 68 ROBUST-Befunden die Robustheit, in H36 sind es 6 von 97. Betroffen sind fast nur Momentum- und Schubmuster (`six-month-thrust`, `three-month-thrust`, `near-52w-high`, `wide-range`, `high-volatility` und ihre Paare). Ihr Lift lag in Kursrendite knapp über 1 (1,02–1,14) und fällt in Gesamtrendite auf etwa 0,91–1,09.
- **Wahrscheinliche Erklärung.** Über fünf Jahre hebt die wiederangelegte Ausschüttung vor allem die Nicht-Gewinner-Population mit hoher Dividende über die Verdopplungsschwelle (Basisquote +5,3 Pp). Schubtitel schütten wenig aus und gewinnen dadurch kaum. Ihr Vorsprung in Kursrendite war also zum Teil ein Dividendeneffekt der Vergleichsgruppe.
- Das spricht **fachlich für** die Gesamtrendite als Grundlage. Für die Aktivierung gilt aber: Sekundärhorizonte verlieren Befunde. Was auf der Seite oder in Pattern Match von H36/H60-Befunden abhängt, muss im Fachmodell-PR benannt werden.

## Zertifizierungsanbindung (vorbereitet, nicht aktiv)

`scripts/quant/build-backtest-certification.mjs` liest das Gate `returnBasis` von PATTERN_EVIDENCE jetzt aus der Studie selbst (`patternTotalReturnStatus` in `quant/engines/backtest-artifact-consistency.js`). Das Gate besteht nur, wenn alle drei Bedingungen gelten:

- `returnType === "TOTAL_RETURN"`
- `returnBasis.mixed === false`
- `population.totalReturnCoverage.state === "PASS"` (Mindestanteil 95 %)

Fehlt eine davon, bleibt es beim bisherigen Grund `STUDY_RETURN_BASIS_NOT_TOTAL_RETURN`.

- **Committete Studie (Kursrendite):** Das Zertifikat wird mit `--out` und eingefrorener Uhr bytegleich zum committeten `quant/data/product/backtest-certification-v1.json` erzeugt. Das Gate bleibt exakt `FAIL`, mit Wert „Diese Musterstudie verwendet Kursrendite“ und Grund `STUDY_RETURN_BASIS_NOT_TOTAL_RETURN`.
- **Probe im Lauf mit der Gesamtrenditestudie** (`--pattern-study`, nur RUNNER_TEMP):
  - `returnBasis` steht auf `PASS` mit „Gesamtrendite (canonical-total-return-1.0.0, weekly-total-return-1.0.0)“.
  - PATTERN_EVIDENCE bleibt `LIMITED` mit Grund `PRESENT_AND_UNQUANTIFIED_IN_PART`, weil `survivorship` und `certifiedAsBacktest` weiter `FAIL` sind.
  - Das entspricht der Erwartung aus FV-5.
- **Keine geänderte Gate-Definition.** Das Gate heißt seit jeher „Gesamtrendite“ (Kategorie STRUCTURAL, `quant/methodology/backtest-certification-v1.json`: „strukturelle Lücke (z. B. Überlebende, Gesamtrendite)“). Für SIGNAL wird es bereits aus der Studie gelesen, mit denselben Bedingungen: mindestens 95 % Abdeckung und keine Mischung (`docs/VU_QUANT_BACKTEST_CERTIFICATION.md`, Abschnitt Signal-Studie). Bisher war der Wert für die Musterstudie fest auf `false` verdrahtet, weil sie keine Gesamtrendite tragen konnte. Das Lesen aus der Studie ist die vorgesehene Prüfung, keine Lockerung. Kategorie, Gate-Liste, Schwellen und Grundcode sind unverändert.
- **Methodik-Fingerabdruck:** Die Gruppe `evidence` ändert sich (`46d1b8e78b8a9a26` → `7bb81b962d6ba1cf`), weil `build-backtest-certification.mjs` und `backtest-artifact-consistency.js` zu ihr gehören. Die übrigen Gruppen bleiben gleich.
  - **Folge nach dem Merge:** Die nächste Materialisierung auf main erkennt `changed=evidence` und rechnet einmal neu, auch bei gleichem Stichtag und ohne `force`. Sie schreibt den Fingerabdruck danach selbst. Das Zertifikat bleibt inhaltlich gleich, weil die Studie Kursrendite bleibt.

## Verbleibende Schritte bis zur Aktivierung

1. **Fachliche Prüfung dieses Berichts** (Owner), besonders der Verluste in H36 und H60.
2. **Fachmodell-PR „pattern-research-1.2.0“** (eigener PR mit Vorher/Nachher aus diesem Bericht):
   - den regulären Schritt in `product-intelligence-materialization.yml` auf `--return-basis total` umstellen;
   - `quant/methodology/pattern-research-v1.json` anpassen: `population.totalReturn: true`, `totalReturnNote` und `returnBasis` (Verträge, Mindestabdeckung 0,95), Changelog `pattern-research-1.2.0` mit `registeredBeforeMeasurement`;
   - `METHODOLOGY_VERSION` in `quant/engines/pattern-research.js` anheben;
   - die Folgewirkung auf `build-pattern-match.mjs` und die Fundamental-Überlagerung prüfen.
3. **Danach** besteht `returnBasis` bei der nächsten Materialisierung ohne weitere Codeänderung: Die Anbindung aus diesem PR liest die neue Studie. PATTERN_EVIDENCE bleibt trotzdem LIMITED (Überlebende, Backtest-Freigabe).
