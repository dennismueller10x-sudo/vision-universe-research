# Supertrader — Prüfung des Donchian-Pilots (Runde 5, 01.10.2026)

Gegenstand: `scripts/supertrader/pilot/donchian-weekly.mjs`, Artefakt `supertrader/data/pilot-backtest.json`.
Ergebnis: **Rechnung korrekt, zwei Buchungsfehler gefunden und behoben (v1.1.0); das negative Ergebnis bleibt.** Es ist weiterhin explorativ und nicht validierbar.

## Ergebnis vorher / nachher

| | v1.0.0 (Runde 4) | v1.1.0 (nach Prüfung) | gleich gewichtet, gleiche Aktien | SPY |
|---|---|---|---|---|
| CAGR 2000–09/2026 | −2,47 % | **−1,32 %** | +8,27 % | +6,44 % |
| Max. Rückgang | −93,3 % | **−90,2 %** | −57,0 % | −55,9 % |
| 2000–2015 (IS) | −0,3 % | +3,9 % | +10,2 % | |
| 2016–heute (OOS) | −5,1 % | −7,8 % | +6,2 % | |
| Trades | 1.619 | 1.693 | | |

Regeln und Parameter sind unverändert: 20/10 Wochen, max. 20 Positionen, 5 USD, 0,25 % je Seite, gleicher Zeitraum, gleiche Anomaliegrenzen.

## Geprüft

| Punkt | Befund |
|---|---|
| Wochenkurse, Kalender | Wochenschlüsse (`discover-series-long`, split-adjustiert, auf zwei Nachkommastellen gerundet). Der Kalender bildet die Vereinigung aller Wochen über 6.333 Reihen und ist im Zeitraum lückenlos. |
| Verfügbarkeit zum Signalzeitpunkt | Das Signal entsteht am Wochenschluss t und wird zum Schluss t+1 ausgeführt. Der Kanal verwendet nur t−20…t−1. Bei den Kursen gibt es keinen Vorgriff. Beim Universum gibt es einen Vorgriff: nur heute gelistete Titel. |
| Einstiege, Ausstiege, Positionen | 20 Plätze, je 1/20 des Depotwerts beim Einstieg. Sind mehr Kandidaten da als Plätze frei, entscheidet die 20-Wochen-Rendite. Die Exponierung liegt im Mittel bei 98,9 %. |
| Stop, Kanal, Gaps | Der Wochen-Pilot nutzt nur den Kanal-Ausstieg, keinen 2N-Stop. Gaps werden zum Wochenschluss ausgeführt, also ohne Intraday-Stop. |
| **Fehlende Kurse / Delistings** | **Fehler K1.** Eine gehaltene Position wurde bei einer Datenlücke zum letzten Kurs eingefroren und belegte ihren Platz bis zum nächsten Kurs. TRAK lief 496 Wochen (2015→2025), CCXI 208 Wochen. Abgerechnet wurde gegen den Kurs eines später unter demselben Kürzel gelisteten Unternehmens. Korrektur: Bei einer Lücke von mehr als 4 Wochen, einem Reihenende oder einer Anomalie wird zum letzten gültigen Kurs abgerechnet (`DATA_BREAK`, 26 Trades). Danach beginnt die Reihe neu und braucht wieder 52 Wochen Historie. |
| **Kapitalmaßnahmen / Anomalien** | **Fehler K2.** Wochenrenditen außerhalb von −75 %…+300 % wurden im Vergleichsportfolio ausgeschlossen, in der Regel aber in der Folgewoche voll gebucht. Beispiele: POCI −99 %/+4.900 %/−90 % sowie ARWR −86 % und −85 % innerhalb eines Trades mit +14 %. Korrektur: Beide Seiten werden gleich behandelt (Datenbruch). |
| Gebühren | 0,25 % je Seite auf Ein- und Ausstieg, nachgerechnet in der Stichprobe. |
| Portfoliowert, CAGR, Rückgang | Abstimmung: Endwert 0,701485 = 1 + gebuchte Trades −0,285205 + offene Positionen −0,013310 (Differenz < 1e−9). CAGR über Kalendertage, Rückgang über Wochenwerte. Ein Test gegen eine bekannte Kurve besteht. |
| Vergleichsuniversum | Wöchentlich neu gewichtet über alle Titel, die in der Vorwoche zulässig waren; ohne Kosten, ohne Dividenden. Nach K2 werden Anomaliewochen auf beiden Seiten gleich behandelt. |
| SPY | Kursindex ohne Dividenden, letzter Tag je ISO-Woche. Der Start fällt mit dem Pilotstart zusammen. |
| Stichprobe vom Rohkurs | 5 Trades wurden unabhängig vom Rechenkern aus den Rohpunkten nachgerechnet (`verifyTradeFromRaw`): INTU 2000, SA 2016, LESL 2026, ASTI 2020/21 und ARWR 2002 (Datenbruch). Signalwoche, Kanal-Hoch, Ausführungskurs und Rendite stimmen alle. |

## Was das Ergebnis treibt

- **Reverse-Split-Artefakt.** Bei split-adjustierten Kursen liegen alte Kurse von Titeln mit vielen Reverse-Splits rückwirkend hoch. Die 5-USD-Regel lässt so damalige Penny-/OTC-Aktien durch.
  - 161 Trades starten bei bereinigten Kursen über 1.000 USD, zusammen +1,105 Depoteinheiten.
  - Der größte Einzeltrade (ASTI 11/2020–04/2021, bereinigt 100.000 → 3.170.000) bringt allein +2,44 Depoteinheiten, bei einem Endwert von 0,70.
  - Ohne unbereinigte Kurse lässt sich das nicht korrigieren. Es ist eine Spezifikationsgrenze und wurde nicht nachträglich weggefiltert.
- **Verluste kommen aus teureren Aktien.** Nach bereinigtem Einstiegskurs:

  | Einstiegskurs | Beitrag |
  |---|---|
  | unter 10 USD | +1,28 |
  | 10–20 USD | −0,66 |
  | 20–50 USD | −0,01 |
  | ab 50 USD | −0,89 |

  Die Hypothese „Kleinstwerte ziehen das Ergebnis nach unten“ ist widerlegt.
- **Zeitlich:** 2000–2007 +1,11, danach negativ (2008–2015 −0,28, 2016–2020 −0,40, 2021–heute −0,72).

## Verzerrungen (Richtung)

| Verzerrung | Richtung |
|---|---|
| Survivorship | Nach oben, für Regel und Vergleich; der Abstand ist unbestimmt. |
| Datenbruch zum letzten Kurs | Nach oben, denn echte Totalverluste werden nicht gebucht. |
| Reverse-Split-Artefakte | Hier nach oben für die Regel (+1,1). |
| Wochenschluss-Ausführung und pauschale Kosten | Unbestimmt. |

## „Genau ein Lauf“

- Regeln und Parameter standen im Code, bevor das erste Ergebnis berechnet wurde. Der Pilot wurde einmal ausgeführt und danach nicht verändert; das zeigt der Sitzungsverlauf.
- Grenzen dieser Aussage:
  - Die Festlegung ist nur im selben Commit wie das Ergebnis belegt, nicht extern registriert.
  - Die Datenabdeckung war vorher bekannt.
  - v1.1.0 ist der zweite Lauf.
- Die Aussage taugt daher als Hinweis gegen Parameteroptimierung, nicht als methodischer Nachweis. So steht es jetzt auch im Produkt.

## Die 219/220 Donchian-Live-Setups (Tagesvariante)

- **Anteil:** 220 von ca. 2.600 handelbaren Titeln (8,5 %) stehen bis 3 % unter dem 20-Tage-Hoch.
  - Das ist eine breite Beobachtungsliste, keine selektive Vorbereitung.
  - Produkt: wird jetzt als „Beobachtungsliste“ gezeigt und getrennt von „vorbereitet“ gezählt.
- **Verteilung der Tagesspanne (ATR20):**

  | Perzentil | Wert |
  |---|---|
  | 10. | 1,9 % |
  | 50. | 2,8 % |
  | 90. | 4,8 % |

  Abstand zum Trigger, Median: 1,6 %. Nach Branche dominiert Industrie mit 130 Titeln.
- **Festhängende Kurse:**
  - Der Filter „Tagesspanne ≥ 1 %“ übersah ACVA: Kanal 0,9 % bei 3,3 % ATR. Ein früherer Sprung hielt die ATR hoch.
  - Korrektur Donchian v1.1.0: zusätzlich eine Kanalbreite von mindestens 2 %.
  - Die wartenden v1.0.0-Setups wurden per Versionsregel als Regelwechsel abgeschlossen und auf demselben Datenstand neu bewertet. Danach sind es 219, ACVA ist entfallen. Das ist kein Marktereignis.
  - Ob bei ACVA ein Übernahmeangebot läuft, wurde nicht geprüft. Es ist nur das Kursmuster.
