# Elliott Product Evidence Contract (Version 1.0.0)

Stand: 07.10.2026 (Mission X). Datensätze: `quant/data/technical-intelligence/elliott-setups/setup-evidence-records.json`, erzeugt von `build-evidence-records.mjs` ausschließlich aus den Auswertungsdateien. Keine Zahl wird von Hand eingetragen.

**Status: nicht veröffentlichbar.** Alle Datensätze tragen `publishable: false`. Kein Setup hat eine prospektive Bestätigung (LEVEL 3). Historische Zahlen dürfen erst nach Legal Review und nur zusammen mit der Kontrollquote angezeigt werden.

## Felder je Setup × Variante

| Feld | Inhalt | Regel |
|---|---|---|
| `setupName`, `setupId`, `variant` | z. B. „Abgeschlossene Korrektur → Trendfortsetzung“, `S3_CORRECTION_COMPLETE`, `PURE` | Variante PURE = Kundensicht |
| `setupVersion`, `specSha256` | 1.0.0, Hash der Spec | jede Definitionsänderung = neue Version, alte Evidenz verfällt |
| `evidenceVersion` | `mission10-v1` | |
| `productVisible` | false für ENGINE_PRIMARY | |
| `historicalCases`, `historicalCasesDevelopment` | n VAL, n DEV | |
| `coverage` | Anteil der Erkennungspunkte | immer mit anzeigen |
| `scenarioSuccess` (+ KI) | Ziel 1 vor Invalidation, 26 Wochen | **nie ohne** `matchedBaseline` |
| `matchedBaseline` (+ Definition) | gleiche Abstände, gleiches Datum, andere Titel | Pflichtfeld |
| `lift` (+ KI), `liftVsTrendRs` (+ KI) | gegen D bzw. gegen Trend × RS | |
| `geometry` | Median Ziel-/Invalidationsabstand (ATR), Chance/Risiko, naive geometrische Referenz | erklärt hohe Quoten |
| `medianPayoff`, `expectancyR` (+ KI) | Payoff-Verhältnis, strukturelle Erwartung in R | „strukturell, vor Kosten“ |
| `invalidatedFirst`, `relabelRate`, `confirmationBeforeExit` | Szenario-Verhalten | |
| `longHorizon` | 6/12/24/36 Monate: Median, gedeckeltes Mittel, Überschuss gegen Datum und Trend × RS, 2×/3×/5× | nur Aufwärts-Setups |
| `evidenceGrade`, `evidenceGradeReason` | ROBUST_EDGE / INCREMENTAL_UTILITY / POSITIVE_UTILITY / STRUCTURAL_ONLY / INSUFFICIENT_EVIDENCE / REJECT | mechanisch aus `decide-setups.mjs` |
| `dataStatus` | `VALIDATION_ON_CONSUMED_DATA` bzw. später `PROSPECTIVE` | |
| `prospective` | Szenario-Status aus dem Register | erst nach abgelaufenem Horizont |
| `limitations` | Pflichttexte | immer anzeigen |
| `publishable`, `publishableReason` | heute false | |

## Darstellungsregeln (für eine spätere UI)

1. Szenario zuerst: Das Chartbild bleibt die Hauptansicht. Elliott ist eine strukturelle Lesart.
2. Eine Trefferquote erscheint nur zusammen mit:
   * Kontrollquote gleicher Geometrie;
   * Chance/Risiko und Payoff;
   * Abdeckung, n und Zeitraum;
   * dem Satz „historische Häufigkeit, keine Wahrscheinlichkeit“.
3. Grade und Sprache:
   * STRUCTURAL_ONLY und INSUFFICIENT_EVIDENCE: nur Struktur, Invalidation und Projektionszone, **keine** Erfolgszahl.
   * POSITIVE_UTILITY oder INCREMENTAL_UTILITY: Zahlen mit allen Pflichtfeldern, aber ohne Vorteilssprache.
   * Nur ROBUST_EDGE (prospektiv bestätigt) erlaubt Formulierungen wie „schnitt besser ab als vergleichbare Fälle“.
4. Beispiele nie nur mit Erfolgen.
5. Engine- oder Spec-Wechsel: Evidenz wird zurückgezogen, bis sie neu gemessen ist.

## UI-Konzept (Felder, keine Zahlen)

```
MÖGLICHE WELLE 3 · WOCHE                        [Setup S1, Spec 1.0.0]
Aktuelle Struktur      : Impuls, Welle 2 abgeschlossen (Primärzählung)
Alternative            : <alternatives[0]>
Schlüsselzone          : Bestätigung über Ende Welle 1 (<Niveau>)
Invalidation           : <Niveau> (Schlusskurs)
Primäre Projektion     : <Zone> (Welle 3 = 1,618 × Welle 1)
Erweiterte Projektion  : <Zone> (2,618 × Welle 1)
Warum das Setup gilt   : ✓ Elliott-Struktur   ✓/✗ Trend   ✓/✗ Relative Stärke   ✓/✗ Marktstruktur   ○ Volumen (nicht verfügbar)
Historische Evidenz    : <evidenceGrade> — heute: „Nicht ausreichend belegt“ (keine Erfolgszahl)
Grenzen                : <limitations>
```

Heute zeigt die eingefrorene Engine S1 nie als angezeigte Primärzählung. Die Karte wäre also leer. Der Entwurf legt nur die Datenfelder fest.

## Beispiel eines Datensatzes (Felder, Werte aus der Datei)

`setup-evidence-records.json` → `records[]` mit `setupId = "S3_CORRECTION_COMPLETE", variant = "PURE"`: `evidenceGrade = "STRUCTURAL_ONLY"`, `publishable = false`.
