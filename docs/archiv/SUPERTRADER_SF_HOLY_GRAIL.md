# Supertrader – Raschke Holy Grail, offengelegte Komponente (C13)

Stand: 19. Oktober 2026. Research-Code, keine Live-Signale. Gestapelt auf SF-7 (#790).

Code: `scripts/supertrader/source-faithful/methods/holy-grail.mjs`. Vertrag: `contracts/holy-grail.mjs`. Tests: `tests/sf-holy-grail.test.mjs` (6).

## 1. Umsetzung (#709 W-RAS04, eigene Zitate, HIGH, geprüft)

| Regel | Umsetzung | Status |
|---|---|---|
| RAS04-002 (HARD) | Wilder-ADX(14) > 30 auf derselben Zeitebene vor dem Rücklauf | SOURCE_EXACT |
| RAS04-001 | erster Rücklauf zur 20-EMA: der erste Tag seit dem Anstieg des ADX über 30, dessen Tief die 20-EMA berührt; ADX dazwischen durchgehend > 30, +DI > −DI | SOURCE_DERIVED (Setup-Definition, deklarierte `gateExemption`) |
| RAS04-004 (HARD) | 3/10-Oszillator = SMA3 − SMA10, Signallinie SMA16 | SOURCE_EXACT (Evidenz) |
| RAS04-005 | neue Oszillator-Momentum-Hochs als Evidenz | MANUAL |
| RAS04-006 | Zeitebenen getrennt; im Snapshot nur Tagesbalken, Intraday-Zeitebenen `DATA_BLOCKED` | SOURCE_DERIVED |
| Einstiegsorder, Stop, Größe | nicht offengelegt (#709 C13) | SOURCE_AMBIGUOUS |
| RAS04-003 | neues Hoch als Ausstiegsgelegenheit | MANUAL |

Long-Seite (Aufwärtstrend). Die Short-Seite bräuchte Borrow-Daten.

## 2. Status (abgeleitet)

`PARTIAL_MANUAL_REVIEW`; Ausführung `MANUAL_REVIEW_SCREEN`; Backtest `NOT_READY`, weil Stop und Ordersequenz nicht offengelegt sind. Das ist eine Komponentenstudie, keine persönliche Replik.

Abweichung zu #712: #712 stufte Holy Grail mit Blick auf Intraday als `DATA_BLOCKED` ein. RAS04-006 lässt aber jede Zeitebene zu; die Tageskomponente ist berechenbar.
