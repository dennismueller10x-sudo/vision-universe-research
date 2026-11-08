# Supertrader 3.0 – Minervini SEPA/VCP und Power Play: Komponenten

Stand: 21. Oktober 2026. Code: `scripts/supertrader/source-faithful/research/minervini-components.mjs` (`sf-minervini-components-1.0.0`). Tests: `scripts/supertrader/tests/sf-minervini-components.test.mjs` (10 Golden- und adversariale Fälle).

Die bestehenden Screens (`methods/minervini.mjs`, `sf-minervini-1.0.0`) sind unverändert. Alle Minervini-Regeln in #709 haben MEDIUM-Konfidenz und eine ungeprüfte englische Formulierung (Übersetzung). Deshalb ist **nichts** `SOURCE_EXACT`, und jede Ausgabe trägt `translationUnverified`.

## 1. Bestandsaufnahme vor diesem PR

| Bestandteil | vorher | jetzt |
|---|---|---|
| Trend Template 1–7 | implementiert, getestet (Gate) | unverändert |
| Trend Template 8 (IBD RS ≥ 70) | `DATA_BLOCKED`; Proxy nur als Eingabe, nirgends berechnet | IBD bleibt `DATA_BLOCKED`. Neu: **PIT-Perzentil** des Research-Universums (`createRsPercentileProxy`), nie Gate |
| Fundamentale Wachstumsmerkmale | manuell, keine Daten im Screen | **PIT-Evidenz** aus SEC-Quartalen des Snapshots (`fundamentalEvidence`): EPS- und Umsatzwachstum YoY, Beschleunigung, abgeleitetes Q4 markiert; ohne Schwelle |
| VCP-Struktur | Drittel-Spannen als Evidenz | **Kontraktionsfolge** (`vcpContractions`): Tiefen, Anzahl, links→rechts, Halbierungsverhältnis, Pivot am letzten Swing-Hoch |
| Volumenkontraktion | 10/50-Tage-Volumen | letzte Kontraktion und trockenster Tag gegen 50-Tage-Schnitt (MIN-VCP-06), Up/Down-Volumen (MIN-VCP-10) |
| Pivot/Breakout | manuell | **Ausbruchsereignis** (`pivotBreakout`) mit beiden Lesarten von „zunehmendem Volumen“; keine gewählt |
| Entry | manuell | manuell (Referenzfüllung `max(open, pivot)` nur als Information) |
| Stop | 10-%-Flag | gesetzter Stop wird **mechanisch** ausgeführt: Tief ≤ Stop → Ausstieg zu `min(open, stop)`, volumenunabhängig (MIN-MM-STOP-01) |
| Positionsrisiko | manuell | **Rechner** (`positionSize`): Risiko des Reviewers / Stopabstand, Deckel 25 % (MIN-MM-SIZE-01), 10-%-Flag; kein Default-Risiko |
| Sell Rules | manuell | Evidenz: R-Multiple, 3R-Breakeven-Frage (MIN-RISK-05), MA50-Leitlinie (MIN-MM-SELL-02); kein erzwungener Verkauf |

## 2. Automatisierbarkeit SEPA/VCP

`sepaClassify(security, i)` liefert eine dieser Klassen:

| Klasse | Bedeutung |
|---|---|
| `NOT_QUALIFIED` | Trend Template 1–7 nicht erfüllt |
| `DATA_BLOCKED` | fehlende Balken |
| `IPO_SCOPE_REVIEW` | zu wenig Historie (MIN-MM-IPO-01) |
| `MECHANICAL_SCREEN_PASS` | Trend Template 1–7 erfüllt; die übrigen Komponenten werden einzeln ausgewiesen |

Ausgewiesene Komponenten: `MECHANICAL_PASS`, `DATA_BLOCKED_IBD_RS`, `EVIDENCE_MANUAL`, `MANUAL`, `MANUAL_THEN_MECHANICAL_EXECUTION`, `MECHANICAL_GIVEN_REVIEWER_RISK`.

**Ein Trend-Template-Treffer ist keine SEPA-Handelsstrategie.** Bewusst manuell bleiben:
- relative Priorität (MIN-PROCESS-04);
- Gewinnqualität (MIN-QUALITY-01/02);
- Gültigkeit des VCP (MIN-VCP-01..05);
- Einstieg und Risikowahl.

## 3. Automatisierbarkeit Power Play

`powerPlayClassify(security, i)`:

| Klasse | Bedingung |
|---|---|
| `CONFIRMED_MECHANICAL_SETUP` | ≥ +100 % in < 40 Sitzungen, Korrektur ≤ 20 %, eng (≤ 10 %), Konsolidierung ≤ 6 Wochen, Startvolumen messbar |
| `MANUAL_REVIEW_SETUP` | qualifiziert, aber Korrektur im gedruckten Bereich 20–25 %, nicht eng (ODER-Zweig „VCP-Merkmale“) oder Konsolidierung länger als typisch |
| `DATA_BLOCKED_SETUP` | Fenster mit fehlenden Balken, oder weniger als 50 Sitzungen vor dem Startpunkt (Startvolumen MIN-PP-02 nicht messbar) |
| `NOT_QUALIFIED` | kein Lauf, Rekordhoch nicht mehr das Hoch, oder Korrektur > 25 % |

Für jede Klasse gilt:
- Die Ausgabe bleibt `MANUAL_REVIEW_REQUIRED` mit `buyDeclarationAllowed: false`.
- „Bestätigt“ bezieht sich nur auf den mechanischen Teil. Das Urteil über das starke Startvolumen sowie Einstieg, Stop und Größe bleiben manuell.
- Zusätzlich ausgewiesen werden die Stop-Referenz (tiefstes Tief der Konsolidierung, 10-%-Flag) und der Pivot am Laufhoch (`PIVOT_SET_AWAITING_BREAKOUT`; den Ausbruch bewertet `pivotBreakout` an einem späteren Balken).

## 4. Keine erfundenen Regeln

- Keine Wachstumsgrenze: MIN-EPS-02 wird als Kontext zitiert.
- Keine Mindestzahl von Kontraktionen, keine Halbierungspflicht (MIN-VCP-02/03).
- Kein Volumenmultiplikator: +50 % ist laut MIN-MM-VOL-NUM nicht Minervinis eigene Regel.
- Konventionen sind benannt und gelten nur für Evidenz:
  - Swing-Hoch = höchstes Hoch über ±5 Sitzungen;
  - RS-Proxy = 252-Sitzungen-Kursveränderung;
  - YoY = dasselbe Quartal 350–380 Tage früher.

## 5. Daten

- **Fundamentals:** Der Snapshot enthält `sec-pit-r12` (EPS, Umsatz, Erst-Einreichungsdatum; Q4 abgeleitet). Sichtbar ist nur, was **vor** dem Sitzungstag eingereicht wurde. Die Durchreichung an die Wertpapiere (`seg.fund`) erfolgt im Research-Runner (PR 5/5); `runner/snapshot-input.mjs` bleibt unverändert, damit der AG-3-Fingerabdruck nicht bricht.
- **Daten blockiert:** IBD-Rating, Schätzungen, Überraschungen, Guidance-Historie.

## 6. Owner-Entscheidung (21.10.2026)

- Die SEPA-/VCP- und Power-Play-Komponenten bleiben vollständig erhalten.
- Jede Klassifikation trägt `tradability: NOT_A_TRADABLE_STRATEGY` und `performanceClaim: NONE` (`NOT_A_STRATEGY`); getestet in `GC-MIN-NOT-A-STRATEGY` für alle Klassen einschließlich `CONFIRMED_MECHANICAL_SETUP` und `MECHANICAL_SCREEN_PASS`.
- Ein mechanisch bestätigtes Setup ist ein Review-Kandidat: keine vollständig handelbare Strategie, keine Aussage über Profitabilität. Screen-Statistiken des Snapshot-Laufs sind als `SCREEN_STATISTICS_NOT_A_STRATEGY` gekennzeichnet; Vorwärts-Kursänderungen nur versiegelt als `SCREEN_STATISTIC_FORWARD_PRICE_CHANGE_NOT_A_STRATEGY_RETURN`.
