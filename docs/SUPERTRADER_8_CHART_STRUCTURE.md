# Supertrader 8.0 – Chartstruktur unterhalb des modellierten Ablaufs

Stand 28.10.2026. Owner-Auftrag vom selben Tag: fehlende Chartmarken unterhalb von MODELED beheben; erlaubt sind nur fachlich belegte Strukturmarken (Box, Widerstand, Gap-Tief), nie versteckte Einstiegs-, Stop- oder Orderparameter.

## Fehler

`records.mjs#chartMarks` las `STRUCTURE_LEVELS` und `STRUCTURE_MARK` mit der `strategyId` (`SF_DARVAS_BOX` …). Die Tabellen sind aber nach der Kandidaten-ID (`C03` …) geschlüsselt. Deshalb fand die Funktion nie einen Eintrag: Unterhalb von MODELED hatte keine Ansicht Marken oder eine Chartmarke. Die Korrektur bestimmt die Kandidaten-ID aus dem Vertrag (`registry.mjs`). Eine unbekannte Strategie bekommt weiter keine Marke (fail closed).

## Prüfung je Methode (Quelle gegen Order)

| Methode | Marke unterhalb von MODELED | Order der Quelle | Ergebnis |
|---|---|---|---|
| C01/C02 Turtle | Kanallängen (Tage) | Kanal = Einstiegsorder | keine Preismarke |
| C03 Darvas | Box (oben, unten), Chartmarke Box-Obergrenze | Buy-Stop = Obergrenze + Bruchteil | Struktur |
| C04/C05 Weinstein | Widerstand, 30-Wochen-Linie, Ausbruchswoche | Buy-Stop = Widerstand + Tick | Struktur |
| C06 SEPA | 50/150/200-Tage-Linie | Einstieg genau am Pivot (`minervini-lifecycle.mjs`, `order.level = pivot`) | **Pivot entfernt** |
| C07 Power Play | keine | Einstieg genau am Pivot | **Pivot entfernt** |
| C08 KK-Breakout | Konsolidierungshoch (10 Tage) | Einstieg zum Schluss/zur Eröffnung, Stop = Tagestief | Struktur |
| C09 EP, C12 BGU | Gap-Tief, Vortagesschluss | Stop = Tief des Gap-Tags (KK-034, MOKA12-007) | Struktur; Gap-Tief als „Gap-Tief (Chartstruktur)“ beschriftet, nie als Stop |
| C10 Parabolic Short | 10/20-Tage-Linie | – | Struktur |
| C11 Pocket Pivot | 10/50-Tage-Linie | kein Preisstop in der Quelle | **Tief des Signaltags entfernt** (keine Strukturmarke der Quelle) |
| C13 Holy Grail | 20-Tage-EMA | Stop = `swingLow`, `impulseHigh` Teil der Order | **swingLow und impulseHigh entfernt** |

## Vorher/Nachher (voller Lauf, Stand 26.10.2026, 5.099 Titel, außerhalb des Repositorys)

| | vorher | nachher |
|---|---|---|
| Kandidaten, Stufen | 3.001 (2.023 / 953 / 25) | 3.001 (2.023 / 953 / 25), dieselben Datensätze |
| MODELED-Ansichten | – | **0 geändert** |
| Ansichten mit Strukturmarken unterhalb von MODELED | 0 | 2.957 |
| davon mit Chartmarke | 0 | 1.237 (Box 229, Widerstand 801, Konsolidierung 22, Gap-Tief 185) |
| Order-, Stop-, Limit-, Pivot-, swingLow-, signalDayLow-Felder unterhalb von MODELED | 0 | **0** |
| Ränge | – | nur C03/C04/C05 (1.024 Ränge, Sortierung nach Abstand zur Chartmarke) |

## Oberfläche

- Die Chartmarke heißt „Chartstruktur: Box-Obergrenze / Widerstand (Woche) / Konsolidierungshoch (10 Tage) / Gap-Tief“.
- Sie wird gestrichelt in der Strukturfarbe gezeichnet, nicht in der Farbe des Triggers.
- Einstieg und Stop bleiben dem modellierten Ablauf vorbehalten (`v.plan`).
- Katalog C12: „das Gap-Tief ist Chartstruktur, kein bestätigter Stop“. Regeltext MOKA-SF-BGU-SELLGUIDE: „Risikoreferenz der Quelle (nur im modellierten Ablauf)“.

## Schutztests (unverändert scharf, erweitert)

- `SF8-VIEW-SHAPE-BELOW-MODEL`: Marken nur aus einer unabhängig festgeschriebenen Strukturtabelle. `box` nur mit `from`, `to`, `top`, `bottom`. Die Chartmarke ist genau die Strukturmarke ihrer Art.
- `SF8-NO-ORDER-VALUE-BELOW-MODEL`: Keine veröffentlichte Zahl gleicht einer Order-Größe der Detektoren.
  - Behoben: Die Planwerte wurden bisher unter dem falschen Feld (`plan.trigger` statt `plan.entry.trigger`) gesucht.
  - Neu verglichen werden auch die Detektor-Marke, der Minervini-Pivot und Holy-Grail `swingLow` und `impulseHigh`.
- Benannte Ausnahmen, nur für genau diese Pfade:
  - das Gap-Tief von C09/C12 (Owner-Entscheidung);
  - `trend.high252` bei C06/C07/C13: das 52-Wochen-Hoch ist oft der Pivot;
  - `features.correction` bei C07: Korrekturtiefe = geplanter Verlust am Pivot.
- Die 55 Ansichten unterhalb von MODELED der Golden Cases sind per SHA-256 eingefroren.
- `SF8-STRUCTURE-MARKS`: Marken je Methode in den Golden Cases. Prüft Darvas, BGU und C07 einzeln sowie das fail-closed-Verhalten.
- Golden Case C07 unterhalb von MODELED:
  - WDAY (Chart-Kandidat, manuelle Prüfung) und MGLD (bestätigtes Setup);
  - aus dem Datenstand 7cc3f26 mit `scripts/supertrader/source-faithful/product/golden-fixture-add.mjs` angefügt;
  - der Erzeuger reproduziert alle 19 regulären vorhandenen Titel bitgleich.

## Offene Owner-Punkte

1. `trend.high252` (C06/C07/C13) und C07 `features.correction` sind beschreibend, lassen aber den Pivot bzw. den geplanten Verlust zurückrechnen. Das ist dieselbe Klasse wie `closeVsGapLow` und `closeVsTop`. Möglich ist: zulassen, oder ausblenden in einem eigenen PR.
2. Core DQ-SF8-4 (`SF8_STRUCTURE_LEVELS`, `SF8_PIVOT_KINDS`) erlaubt weiter den C06/C07-Pivot und die C11/C13-Marken. Der Erzeuger ist jetzt strenger. Empfehlung: den Core in einem eigenen Core-PR nachziehen.
3. Box-Obergrenze und Widerstand liegen in ihrer Quelle einen Bruchteil bzw. Tick unter dem Buy-Stop; Gap-Tief ist zugleich die Risikoreferenz. Beides ist der Methode eigen und vom Owner als Struktur zugelassen.
