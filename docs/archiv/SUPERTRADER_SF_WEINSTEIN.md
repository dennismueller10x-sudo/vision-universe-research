# Supertrader – Weinstein Stage 2 Investor und Trader, quellentreu (C04 / C05)

Stand: 19. Oktober 2026. Research-Code, keine Live-Signale. Gestapelt auf SF-3 (#786).

Code: `scripts/supertrader/source-faithful/methods/weinstein.mjs`. Verträge: `contracts/weinstein.mjs`. Tests: `tests/sf-weinstein.test.mjs` (13).

## 1. Zwei getrennte Methoden (#709 B09)

| | Investor (C04) | Trader (C05) |
|---|---|---|
| Einstieg | früher Stage-2-Ausbruch über den Widerstand der Basis (WEIN-BUY1) | Fortsetzungsausbruch über neuen Widerstand nahe klar steigender MA30w (WEIN-TR-CONT) |
| Basis / Widerstand (abgeleitet) | Basis ab der Woche, in der die MA30w aufhörte zu fallen; Widerstand = höchstes Wochenhoch seitdem | letztes Wochen-Swing-Hoch, nach dem mindestens eine Woche ohne neues Hoch folgte |
| Größe (manuell) | halb am Ausbruch, halb beim konstruktiven Rücklauf (WEIN-BUY2) | ganze geplante Position (WEIN-TR-CONT-SIZE) |
| Stop-Vorschlag (manuell bestätigt) | tiefstes Wochentief der Basis (WEIN-STOP2) | tiefstes Wochentief der Konsolidierung (WEIN-TR-STOP) |
| Nachzug (manuell) | WEIN-TRAIL1–4, WEIN-SELL3 | WEIN-TR-TRAIL, WEIN-TR-EARLY, WEIN-TR-SELL3 |

Beide Screens geben nur `MANUAL_REVIEW_REQUIRED`-Datensätze aus, nie BUY. Ein Trader-Signal löst kein Investor-Signal aus und umgekehrt (Test GC-WEIN-TRADER-CANDIDATE).

## 2. Maschinen-Gates und Evidenz

- **Gate (abgeleitet aus der HARD-Regel WEIN-MA).** Kein Long-Kauf, wenn der Wochenschluss auf oder unter der MA30w liegt oder die MA30w fällt (Vergleich mit der Vorwoche, kein Schwellenwert). Entschieden wird auf der abgeschlossenen Vorwoche, aus der die Kauf-Stop-Order vorbereitet wird.
- **Volumen (WEIN-VOL), Evidenz.** Die drei gedruckten Alternativen werden geprüft:
  - A: Ausbruchswoche ≥ 2× das Mittel der 4 Vorwochen;
  - B: 3–4 Wochen Aufbau ≥ 2× davor, plus Zunahme;
  - C: Ausbruchstag > 2× das Mittel der 5 Vortage.

  Kein „magischer“ Einzelwert (WEIN-VOL4); das Urteil ist manuell.
- **Relative Stärke (WEIN-RS), Evidenz.** RS-Linie gegen SPY, normiert gegen ihr 52-Wochen-Mittel; Veränderung über 4 und 13 Wochen. Es gibt **kein RS > 0-Gate**: Unter null, aber verbessernd ist kaufbar (WEIN-RSZERO, Test GC-WEIN-RS-BELOW-ZERO-IMPROVING).
- **Overhead-Widerstand (WEIN-OH), Evidenz.** Nächsthöheres Wochenhoch der verfügbaren Historie mit Alter und Abstand.
- **Markt (WEIN-MARKET).** Die SPY-Lage zur MA30w ist nur Evidenz. Breadth (Momentum Index, neue Hochs/Tiefs) ist `DATA_BLOCKED`.
- **Gruppe (WEIN-GROUP, HARD).** `DATA_BLOCKED`, weil keine PIT-Branchengruppen vorliegen. Es wird kein Ersatz erfunden.
- **Exit-Politik.** Nur technisch (WEIN-SELL4).

## 3. Behobene VU-Abweichungen (#709 VU-WEIN)

| VU Weinstein 4.0.0 | Jetzt |
|---|---|
| RS > 0 als Kaufbedingung | Evidenz; unter null und verbessernd erlaubt |
| Vollverkauf bei jedem MA30-Schlussbruch | kein automatischer Exit; Support-/Reaktionstief-Stop manuell (WEIN-TRAIL4) |
| feste ±0,5 %-Steigung, 10-Wochen-Basis | keine Schwellen; Basis ab MA-Wende, Länge als Evidenz |
| fester 2× / 4-Wochen-Volumentest als Gate | drei Alternativen als Evidenz |
| keine Investor/Trader-Trennung, keine Support-Stops | getrennte Methoden, Stop-Vorschläge mit Reviewer-Entscheidung |

## 4. Status (abgeleitet)

Beide Methoden: `PARTIAL_DATA_BLOCKED` (Gruppe und Breadth fehlen); Ausführung `MANUAL_REVIEW_SCREEN`, Backtest `NOT_READY`. Stage-Urteil, Volumen-Urteil und Stop-Auswahl sind manuell, deshalb gibt es keine historische Methodenrendite.

## 5. Konventionen

- **Wochenbalken = ISO-Wochen der Tagesbalken.** Eine Woche ist erst nach ihrer letzten Sitzung vollständig.
- **Kauf-Stop.** Widerstand + ein Roh-Cent.
- **Datenbasis.** Die Snapshot-Reihen beginnen 2015 (Warm-up); die Overhead-Historie ist damit begrenzt.
