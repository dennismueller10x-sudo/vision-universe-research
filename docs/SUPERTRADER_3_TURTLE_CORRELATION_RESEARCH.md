# Supertrader 3.0 – Turtle-Korrelationslimits: Research-Komponente

Stand: 21. Oktober 2026. Code: `scripts/supertrader/source-faithful/research/turtle-correlation.mjs` (`sf3-turtle-corr-1.0.0`). Tests: `scripts/supertrader/tests/sf-turtle-correlation-research.test.mjs`.

**Status der Regel bleibt unverändert:** `TUR-SF-LIMIT-CORR` ist nicht `SOURCE_EXACT` und wird nicht freigegeben. Die Komponente ist eine **optionale Equity-Research-Adaption**. Die Turtle-Engine (`methods/turtle.mjs`, `sf-turtle-1.2.0`) und der Runner sind unverändert; der Code-Fingerabdruck des Acceptance Gates (AG-3) bleibt gültig.

## 1. Fachliche Absicht der Originalregel

W-TUR, gedruckte S. 16 (`TUR-LIMIT6`, `TUR-LIMIT10`):

| belegt | nicht belegt |
|---|---|
| Die Limits begrenzen **Risiko in Units** (1 Unit = 1 % des Kontos je 1 N). Mehrere Units in gleichlaufenden Märkten wirken wie eine größere Wette. | Korrelationsmaß |
| Je Richtung: 6 Units eng, 10 Units lose korreliert. Long-only bindet nur die Long-Grenze. | Fenster und Frequenz |
| Zwei verschachtelte Ebenen: die losen Beispiele (Gold/Kupfer, Silber/Kupfer, Getreide) umschließen die engen Paare. | Schwellen für eng/lose |
| Die Beispiele sind wirtschaftliche Substitute bzw. dieselbe Grundexposition (Rohöl/Heizöl, Gold/Silber, CHF/DEM, T-Bill/Eurodollar), keine Branchensystematik. | Gruppenbildung aus Paaren, Neuberechnung, Übertragung auf Einzelaktien |

Folge: Jede Aktien-Operationalisierung ist eine **deklarierte VU-Modellannahme** (`sourceStatus: EQUITY_MODEL_ASSUMPTION`). Eine SIC-Ebene wird nicht als Korrelationsdefinition verwendet (Owner-Vorgabe 20.10.2026).

## 2. Operationalisierung (zeitlich kausal)

1. **Anker:** letzte Sitzung jedes Monats. Am Tag *d* gelten die Gruppen des letzten Ankers ≤ *d*; die Engine fragt mit der Vorsitzung. Kein Balken des Entscheidungstags fließt ein.
2. **Renditen:** Schluss-zu-Schluss, split-adjustiert (ADR-002 über den Snapshot). Eine Rendite braucht Balken an beiden Sitzungen. Nichts wird aufgefüllt.
3. **Population:** Titel im Research-Universum (#705-Protokoll) am Anker mit **vollständigem** Renditefenster.
4. **Basis:** `RAW` (Rohrenditen) oder `MARKET_RESIDUAL` (Residuen nach SPY-Beta im selben Fenster; trennt Branchen-/Substitutgleichlauf vom gemeinsamen Marktfaktor).
5. **Gruppen:** hierarchisches Clustering auf `1 − ρ` (Nearest-Neighbour-Chain, exakt für SINGLE/COMPLETE/AVERAGE, deterministische Ties). Schnitt bei `1 − τ_eng` und `1 − τ_lose`; die Schnitte sind verschachtelt.
   - `COMPLETE`: jedes Paar der Gruppe erfüllt die Schwelle (nächste Lesart zu den paarweisen Beispielen).
   - `AVERAGE`: das mittlere Paar erfüllt sie.
   - `SINGLE`: eine Kette genügt; nur Diagnose (Verkettung zu marktweiten Gruppen).
6. **Schwellen:** absolut oder als **Paar-Quantil** des Ankers (oberste 0,5 % / 2,5 % der Paare). Das Quantil verhindert, dass ein marktweiter Korrelationsanstieg (z. B. März 2020) das Universum zu einer Gruppe verschmilzt.

## 3. Unknown- und Data-Blocked-Zustände

| Zustand | Grund |
|---|---|
| `NO_ANCHOR_BEFORE_DATE` | vor dem ersten Anker mit vollem Fenster |
| `NOT_IN_POPULATION_AT_ANCHOR` | am Anker nicht im Research-Universum (z. B. später zugelassen, Kurs < 5) |
| `INCOMPLETE_RETURN_WINDOW` | Neuemission oder fehlender Balken im Fenster |
| `BENCHMARK_INCOMPLETE_FOR_RESIDUALS` | SPY-Rendite fehlt (nur Residuenbasis) |

Unbekannt ist **nie unabhängig**. Die Engine-Behandlung ist eine Pflichtangabe ohne Voreinstellung:
- `REPORT_ONLY`: `groupsOf → null`; die Engine begrenzt nur über LIMIT4/LIMIT12 und zählt `correlationGroupMissing`; `conformance()` meldet `UNKNOWN_GROUPS_LIMITED_ONLY_BY_LIMIT4_LIMIT12`.
- `POOLED_UNKNOWN`: alle unbekannten Titel teilen sich eine enge und eine lose Gruppe (konservativ).

`conformance()` meldet immer `ruleConformance: NOT_ESTABLISHED`.

## 4. Vorregistrierte Varianten (vor jeder Snapshot-Messung)

| Variante | Basis | Fenster | Linkage | Schwelle eng / lose | Rolle |
|---|---|---|---|---|---|
| `RAW-126-COMPLETE-70-50` | RAW | 126 | COMPLETE | 0,70 / 0,50 | Vergleichsbasis |
| `RAW-63-COMPLETE-70-50` | RAW | 63 | COMPLETE | 0,70 / 0,50 | Fenster |
| `RAW-252-COMPLETE-70-50` | RAW | 252 | COMPLETE | 0,70 / 0,50 | Fenster |
| `RAW-126-COMPLETE-80-60` | RAW | 126 | COMPLETE | 0,80 / 0,60 | Schwelle |
| `RES-126-COMPLETE-50-30` | Residuen | 126 | COMPLETE | 0,50 / 0,30 | Basis |
| `RES-126-AVERAGE-50-30` | Residuen | 126 | AVERAGE | 0,50 / 0,30 | Linkage |
| `RAW-126-COMPLETE-Q005-Q025` | RAW | 126 | COMPLETE | Top 0,5 % / 2,5 % der Paare | regime-robust |
| `RAW-126-SINGLE-70-50` | RAW | 126 | SINGLE | 0,70 / 0,50 | Diagnose |

Keine Zahl ist Quellenzahl, keine Variante ist Empfehlung. Ausgewählt wird **nicht** nach Rendite.

## 5. Wirkung auf Risikokonzentration

`concentrationReport(run, provider)` misst an jedem Sitzungsende eines tatsächlichen Laufs (ohne ihn zu verändern):
- Units in der größten engen bzw. losen Gruppe;
- Units mit unbekannter Gruppe;
- größte **paarweise Nachbarschaft** (Units aller gehaltenen Titel mit ρ ≥ τ_eng zu einem Titel) – die zweite Lesart von „closely correlated markets“ (je Titel statt je Partition); sie wird gemessen, nicht durchgesetzt, weil die Engine nur Partitionen kennt;
- unit-gewichtete mittlere Paarkorrelation des Buchs;
- Sitzungen über 6 bzw. 10 Units.

Synthetischer Beleg (Test `SF3-TUR-CORR-ENGINE`): Ohne Limit konzentriert sich ein Buch gleichlaufender Ausbrüche auf mehr als 6 Units einer Gruppe; mit Gruppen setzt die unveränderte Engine LIMIT6 durch, keine Sitzung liegt über 6.

## 6. Tests

`sf-turtle-correlation-research.test.mjs` (10 Tests): Quellenstatus, Anker, Linkage-Golden-Case (Verkettung), Verschachtelung, Faktorgruppen, Unknown-Zustände und -Politiken, PIT (Datenänderung nach dem Anker ändert nichts), Residuenbasis, Paar-Quantil, Engine-Bindung ohne Engine-Änderung (Ledger ohne Gruppen bitgleich), Determinismus.

## 7. Was offen bleibt

- Owner-Entscheidung, ob überhaupt eine Variante als Equity-Adaption geführt werden soll; bis dahin bleibt `TUR-SF-LIMIT-CORR` `DATA_BLOCKED`/quellenoffen.
- Snapshot-Messung (Vorher/Nachher, Coverage der Unknown-Zustände) über den Research-Runner (siehe Abschlussbericht `SUPERTRADER_3_STRATEGY_ADVANCEMENT_REPORT.md`).
- `TUR-RANK` nach Gruppen ist nicht Teil dieser Komponente.

## 8. Owner-Entscheidung (21.10.2026)

- **Keine** der acht Korrelationsvarianten wird als verbindliche Handelsregel aktiviert. Sie bleiben dokumentierte Equity-Research-Modelle.
- Keine Runner-Änderung und keine Änderung der bestehenden Turtle-Acceptance (AG-1 bis AG-7). `TUR-SF-LIMIT-CORR` bleibt eine deklarierte Datenausnahme; die Operationalisierung bleibt quellenoffen.
- Grundlage der Entscheidung ist die Snapshot-Messung (`SUPERTRADER_3_STRATEGY_ADVANCEMENT_REPORT.md`): Im tatsächlichen Referenzbuch binden die Limits unter keiner COMPLETE- oder AVERAGE-Variante.
