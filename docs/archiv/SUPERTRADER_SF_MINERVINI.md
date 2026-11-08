# Supertrader – Minervini SEPA/VCP und Power Play, quellentreu (C06 / C07)

Stand: 19. Oktober 2026. Research-Code, keine Live-Signale. Gestapelt auf SF-5 (#788).

Code: `scripts/supertrader/source-faithful/methods/minervini.mjs`. Verträge: `contracts/minervini.mjs`. Tests: `tests/sf-minervini.test.mjs` (14).

## 1. Quellenlage bestimmt die Härte

Alle Minervini-Regeln in #709 haben MEDIUM-Confidence und einen ungeprüften englischen Wortlaut. Quellen: B12 maschinennahe indonesische Übersetzung, B07 indonesisch, B03 vietnamesisch. HARD-Regeln tragen `REQUIRES_ORIGINAL_OR_EXPLICIT_WEB_CORROBORATION`. Folge:
- Keine Regel ist `SOURCE_EXACT`. Schwellen gelten wie gedruckt und sind `translationUnverified`.
- Die Maschine **screent** nur; jede Ausgabe ist `MANUAL_REVIEW_REQUIRED`.
- SEPA ist ein mehrstufiger Prozess mit **manueller relativer Priorisierung** (MIN-PROCESS-04). Das ist keine automatisierbare Kaufregel.

## 2. SEPA/VCP (C06)

| Komponente | Umsetzung | Status |
|---|---|---|
| Trend Template 1–7 (MIN-TT-01…07) | Schluss > MA150/MA200; MA150 > MA200; MA200 steigt seit 21 Sitzungen; MA50 > MA150/MA200; Schluss > MA50; ≥ 30 % über 52-Wochen-Tief; ≤ 25 % unter 52-Wochen-Hoch | SOURCE_DERIVED (übersetzungsabhängig) |
| Trend Template 8 (IBD RS ≥ 70) | proprietär, nicht berechenbar; ein VU-Perzentil wird höchstens als Proxy gezeigt, nie als Gate | DATA_BLOCKED |
| Einfacher Screen statt AND-Kette (MIN-PROCESS-15) | nur das Trend Template; Fundamentals, VCP und RS-Proxy sind Evidenz | SOURCE_DERIVED |
| Relative Priorität, Fundamentals, Earnings-Qualität | Reviewer | MANUAL_REVIEW_REQUIRED |
| VCP | Footprint als Evidenz (Basislänge, größte Korrektur, Spannen der Basis-Drittel, Volumen) | MANUAL_REVIEW_REQUIRED |
| Pivot, Stop, Größe, Verkäufe | Reviewer; ein Stop über 10 % wird markiert (MIN-MM-STOP-02) | MANUAL_REVIEW_REQUIRED |

IPOs mit zu kurzer Historie gelten als `INSUFFICIENT_HISTORY_IPO_SCOPE`, nicht als „durchgefallen“ (MIN-MM-IPO-01).

## 3. Power Play (C07)

- **Run-up (MIN-PP-02):** Ein Hoch p, das danach nicht überschritten wird, mit einem Tief ≤ ½ · Hoch(p) in weniger als 40 Sitzungen davor (+100 % in < 8 Wochen).
- **Korrektur seit p (MIN-PP-04):** über 25 % → kein Datensatz; (20 %, 25 %] → Prüffrage (gedruckte Spanne).
- **Enge (MIN-PP-05):** ≤ 10 % → `TIGHT`, sonst `VCP_CHARACTERISTICS_REVIEW`.
- **Konsolidierungsdauer (MIN-PP-03):** keine Mindestdauer (zwölf Tage sind belegt).
- **Fundamentals (MIN-PP-01):** kein Fundamental-Input.
- **Starkes Startvolumen:** als Evidenz gemeldet, das Urteil ist manuell.

## 4. Nicht wiederholte frühere VU-Fehler (#709 Minervini-Revalidierung)

| Frühere VU-Regel | Jetzt |
|---|---|
| GAAP-EPS ≥ 25 % als AND-Pflicht (Research 3.0.0) | kein Fundamental-Gate; Frage an den Reviewer (20–25 % ist ein verbreitetes Minimum, keine SEPA-Konstante) |
| starre VCP-Zahlen (Kontraktionen, Halbierung, 65-Sitzungen-Fenster) | nur Evidenz |
| 3R-Einstandspflicht | keine; „fast immer“ bleibt Präferenz (MIN-RISK-05) |
| Start-Exposure 25/50/75/100 | nicht übernommen (Beispiele) |
| genereller MA50-Vollverkauf | nicht übernommen; MA50 nur als zusätzlicher Sell-Guide in der manuellen Ebene |

## 5. Status (abgeleitet)

- SEPA/VCP: `PARTIAL_DATA_BLOCKED` (IBD RS); Power Play: `PARTIAL_MANUAL_REVIEW`.
- Beide: Ausführung `MANUAL_REVIEW_SCREEN`, Backtest `NOT_READY`.
- Für eine Härtung als `SOURCE_EXACT` fehlt der geprüfte englische Originalwortlaut (#709 Source Gap).
