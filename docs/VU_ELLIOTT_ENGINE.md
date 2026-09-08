# VU Elliott Engine (V0 + V1 Beta)

**Module:** `elliott/wave-graph.js` (`wave-graph-1.0.0`), `elliott/rules.js` (`elliott-rules-1.0.0`), `elliott/elliott-engine.js` (`elliott-1.0.0-beta`) · Methodik: `quant/methodology/elliott-v1.json` (`elliott-v1.0.0-beta`) · Status **BETA**

## 1. Positionierung

Elliott ist eine **regelbasierte strukturale Hypothesenmaschine**, kein bewiesenes
Prognosemodell (Research: Evidenz D/E). Deshalb: prominent sichtbar, methodisch geringes
Gewicht (Familie PROJECTION_AUXILIARY, gekappt), Confidence = Method Fit, **nie**
Wahrscheinlichkeit (`isProbability: false`, `confidenceType: "method_fit"`).

Die Aufgabe ist nicht „erkenne die Welle“, sondern: finde strukturell zulässige Muster über
einer kausal beobachtbaren Pivot-Skala, verwirf harte Regelverletzungen, ranke transparent.

## 2. V0 — Foundation

* **Segment-Graph** (`buildSegmentGraph`): Legs zwischen aufeinanderfolgenden bestätigten
  Pivots einer Skala mit `priceChange, percentChange, duration, ATRMultiple,
  volumeProfileSummary, momentumSummary, status, confirmedAt`; plus das developing Leg.
* **Statusmodell**: CONFIRMED · DEVELOPING · PROJECTED · INVALIDATED.
* **Degree-Mapping**: `scale-1→D0, scale-2→D1, scale-3→D2, scale-4→D3` — strukturell, keine
  Kalenderzeiträume. Die UI darf D1..D3 relativ als Minor/Intermediate/Major bezeichnen.
* Knoten tragen `significance` (Skalen-Persistenz aus der Pivot-Hierarchie).

## 3. Constraint Library (rules.js)

**Hard Rules — Gates** (Verletzung verwirft den Kandidaten, Score 0):

| Impulse | Zigzag |
|---|---|
| MOTIVE_ALTERNATION (5 alternierende Legs) | ZIGZAG_ALTERNATION |
| W2_NOT_BEYOND_W1_ORIGIN | B_NOT_BEYOND_A_ORIGIN |
| W3_BEYOND_W1_END | C_BEYOND_B_END |
| W4_NO_W1_OVERLAP (Standardimpuls) | |
| W4_NOT_BEYOND_W3_ORIGIN | |
| W3_NOT_SHORTEST (prüfbar erst mit W5, sonst `passed: null`) | |

**Guidelines** (ranken, legitimieren nie): W2/W4-Retracement-Bänder, W3-Extension, W5/W1,
Alternation (Tiefe/Dauer), Channel-Fit, B-Retracement, C/A. **Heuristiken**: W3-Momentum,
W3-Volumen. Alle Bänder in `elliott-v1.json → guidelines`.

„Überschreitet“-Regeln (`W3_BEYOND_W1_END`, `C_BEYOND_B_END`) sind für ein **laufendes** Leg
noch nicht entscheidbar (`passed: null`); „nicht-über“-Regeln sind sofort prüfbar (einmal
verletzt, immer verletzt) — Audit-Fix AU9.

„Überschreitet“-Regeln (`W3_BEYOND_W1_END`, `C_BEYOND_B_END`) sind für ein **laufendes** Leg
noch nicht entscheidbar (`passed: null`); „nicht-über“-Regeln sind sofort prüfbar (einmal
verletzt, immer verletzt) — Audit-Fix AU9.

**Invalidation** aus Hard Rules je laufender Welle: W2 → unter W1-Ursprung; W3 → unter W2-Ende;
W4 → Eintritt ins W1-Gebiet; W5 → unter W4-Ende; B → über A-Ursprung; C → Bruch des B-Endes
gegen die C-Richtung. Die Regel „W3 nie die kürzeste“ liefert bewusst keinen Stop-Level.

## 4. V1 Beta — Historical Wave Map (Pflicht)

Die Engine erklärt zuerst die Vergangenheit. `parseHistory` läuft links nach rechts über **alle**
Legs ab Leg 0 (Release-Audit: das frühere gleitende 40-Leg-Fenster verschob den Startpunkt und
re-segmentierte die Historie — entfernt) und entscheidet **lokal**: Impuls (5 Legs) oder Zigzag
(3 Legs), wenn valide; sonst unlabeled Leg. Eine Entscheidung an Position `pos` ist erst
endgültig, wenn auch die längste Alternative bewertbar ist (`pos + 5 ≤ legs.length`); die letzten
< 5 bestätigten Legs gehören zur Trailing-Region (DEVELOPING). Der Konfigurationswert
`minPatternScoreForMap` (0.35) ist mit der Score-Formel `0.4 + 0.6·fit` faktisch nie wirksam
(Audit-Befund INFO).

Rank = 0.5 × Score + 0.08 × Legs (Coverage/MDL-Präferenz) + 0.2 Grammatik-Prior (nach Motive
Corrective erwartet und umgekehrt). Weil jede Entscheidung nur die Legs des eigenen Musters
sieht und nur dann entscheidet, wenn keine längere Alternative mehr offen ist, ändert ein neuer
Pivot keine früheren Labels → CONFIRMED-Wellen sind **non-repainting by construction** (Tests E3,
E6, AU2; NVDA Bar-für-Bar 300 Schritte: 0 Umschreibungen). Jedes Label hängt an einem realen
`pivotId` (Test E1).

`coverage` = Σ significance erklärter Pivots / Σ significance aller Pivots im Fenster.

## 5. Trailing Pattern, Primary/Alternative

`trailingCandidates` bewertet die Legs nach dem letzten gelabelten Muster plus developing Leg
als Musteranfang (Impuls dw = 1..5, Zigzag dw = 1..3), verwirft Regelverletzungen und rankt
wie oben. Der Beste ist das **Primary**; die erste materiell andere valide Interpretation
(anderer Typ, andere Welle oder anderer Start) wird zur **Alternative**, sofern der Abstand
≤ 0.35. Ein einzelnes laufendes Leg wird ehrlich als „1/A“ mit `LOW_CONFIDENCE`
(`FIRST_LEG_ONLY`) und ohne Projektion ausgegeben.

**Degree-Wahl**: Primary-Degree `scale-3`; liefert sie keine projizierbare Struktur (developing
Welle ≥ 2 oder abgeschlossenes Muster), fällt die Engine auf `scale-2` zurück. `degrees` im
Output dokumentiert beide.

## 6. Projektion — Target Density

Aus der laufenden Welle: W2-Zone 50–61.8 % W1; W3 = W2-Ende + 1.618/2.618 × W1; W4 = 23.6–38.2 %
W3; W5 = W4-Ende + 0.618/1.0 × W1; B = 38.2–61.8 % A; C = B-Ende + 1.0/1.618 × A. Kandidaten
`(price, weight, source)` werden ATR-toleranzbasiert geclustert (`clusterTargets`), überlappende
S/R-Zonen erhöhen das Gewicht und erscheinen als Quelle. Output: Zonen mit `zoneLow/zoneHigh/
sources/status: PROJECTED/methodologyVersion` und ein Pfad (max. 3 Phasen, Preis = höchstgewichtete
Relation `ratios[0]`, Dauern aus `durationRatios`, Kalender-Offsets). **Keine Projektion ohne Invalidation.** Nach abgeschlossenem
Muster: Korrekturzone 38.2–61.8 % des Musters.

## 7. Confidence

```
Fit = 0.25 InternalStructure + 0.20 HigherDegreeConsistency + 0.15 PivotQuality
    + 0.10 Proportionality + 0.10 MarketStructure + 0.10 MomentumVolume
    + 0.05 AlternationChannel + 0.05 FibonacciFit
ECS = 0.8 × Fit + 0.2 × Stability            → confidence = round(ECS × 100)
```

Stability: Pivot-Schwelle der Degree-Skala mit ×0.9/×1.1 gestört, Anteil der Läufe mit gleicher
Trailing-Interpretation. Status: `OK`, `AMBIGUOUS` (Primary/Alternative < 0.05 auseinander),
`LOW_CONFIDENCE` (< 40 oder erstes Leg), `UNAVAILABLE` (`TOO_FEW_PIVOTS` < 6 bestätigte Pivots,
`NO_VALID_STRUCTURE`). Keine Fake-Welle: ohne valide Struktur keine Labels, ohne Invalidation
keine Projektion.

## 8. Nicht in V1

Flats, Triangles, Diagonals, Double/Triple Zigzags, W-X-Y(-X-Z), echtes Multi-Degree-Nesting
(Parent/Child-Reconciliation), ML-Ranking, Probability Claims. Die Architektur (Pattern-Registry
in `evaluate`, `hardRules` je Klasse) ist dafür vorgesehen.
