# VU BACKTEST TRUST SCORE

Konfiguration: `quant/methodology/trust-score-v1.json` · Implementierung: `quant/engines/trust-score.js`

## Zweck

Der Trust Score bewertet die **methodische Guete eines Backtests, nicht seine Rendite**.

Bei einem Screener ist ein falscher Wert aergerlich. Bei einem historischen Backtest kann
ein einziges systematisches Datenproblem eine komplette Strategie wissenschaftlich
wertlos machen. Der Trust Score macht diesen Unterschied sichtbar, bevor jemand eine
Equity Curve fuer Evidenz haelt.

## Bloecke (100 Punkte)

| Block | Punkte | Pruefungen |
|---|---:|---|
| **Data Integrity** | 35 | Point-in-Time 12 · delistete Titel 7 · Original statt korrigiert 6 · Corporate Actions 5 · historisches Universum 5 |
| **Execution Realism** | 20 | Transaktionskosten 7 · Slippage 5 · Liquiditaetsgrenzen 5 · Ausfuehrungszeitpunkt 3 |
| **Statistical Validation** | 30 | Out-of-Sample 10 · Parameter-Robustheit 7 · Multiple Testing 7 · Teilperioden 6 |
| **Sample Quality** | 15 | Historienlaenge 6 · Beobachtungen 4 · Breite und Turnover 5 |

## Evidenzbasiert, nicht behauptet

Bewertet werden ausschliesslich die `capabilities`, die der Backtest-Lauf **selbst
gemeldet** hat. Was nicht nachgewiesen ist, gibt keine Punkte. Es gibt keinen Schalter,
mit dem man einem Lauf Data Integrity zusprechen kann, die er nicht hatte.

## Harte Obergrenzen

| Bedingung | Maximum |
|---|---:|
| keine Point-in-Time-Fundamentaldaten | **60** |
| keine delisteten Titel im Universum | **70** |
| optimierte Strategie ohne Out-of-Sample-Pruefung | **75** |

Damit kann ein optisch sensationeller Backtest mit methodischen Maengeln keinen hohen
Trust Score bekommen. Genau darum geht es.

## Schwellen der Sample Quality

Volle Punkte ab 15 Jahren Historie (Teilpunkte ab 8), ab 40 Rebalancing-Terminen
(Teilpunkte ab 16), ab 20 Positionen im Schnitt. Ueber 400 % Jahresumschlag wird die
Breitenwertung halbiert: ein Ergebnis, das so stark umschichtet, haengt vor allem an den
Kostenannahmen.

## Baender

≥ 85 hohe methodische Guete · ≥ 70 solide mit benannten Einschraenkungen ·
≥ 50 eingeschraenkt belastbar · darunter nicht als Evidenz geeignet.

## Die Darstellung gehoert zum Score

Die Ergebnisseite zeigt nie nur die Zahl. Jede nicht bestandene Pruefung erscheint mit
Begruendung, und der Abschnitt „Was dieser Test nicht zeigt“ ist standardmaessig
aufgeklappt. Eine aktive Obergrenze wird ausdruecklich benannt.

Bei synthetischer Datengrundlage steht immer dabei: der Test belegt die Funktionsweise
der Engine, nicht die historische Tragfaehigkeit der Strategie an realen Maerkten.

## Typische Werte in V1

| Konstellation | Score |
|---|---:|
| Bibliotheksstrategie, volle Datenintegritaet, keine statistische Zusatzvalidierung | ~71–74 |
| dieselbe Strategie mit Out-of-Sample und Sensitivitaetsanalyse | ~91 |
| ohne Kosten, Slippage und Liquiditaetsgrenze | ~57 |
| ohne Point-in-Time-Daten | ≤ 60 |

Kein Lauf in V1 erreicht 100: Multiple Testing (Deflated Sharpe, PBO) ist nicht
implementiert, und Cross-Market-Validierung ist mit einem einzigen Mock-Universum nicht
moeglich. Beides ist als fehlend ausgewiesen statt uebersprungen.
