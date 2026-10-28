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
| C07 Power Play | keine | Einstieg genau am Pivot; Stop am Tief der Korrektur | **Pivot entfernt**, Korrekturtiefe unterhalb von MODELED ausgeblendet (= geplanter Verlust am Pivot, `1 − Stop/Pivot`) |
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
| Kennzahlen | – | nur unterhalb von MODELED: C07 `correction` (19 Ansichten); C06 `pctBelowHigh52w`, `largestCorrection` (668 Ansichten), `vcpFootprint.depths` (238 Ansichten mit VCP-Spur) |
| Trendübersicht | – | nur C06/C07/C13 unterhalb von MODELED: `high252` und `belowHigh252` ausgeblendet (668 / 19 / 171 Ansichten) |
| Vertragsdatensätze (`records/`) | – | Inhalt gleich bis auf `provenance.codeSha256` (Code-Fingerabdruck); nur die Reihenfolge in C03–C05 folgt den neuen Rängen |
| Ansichten mit Strukturmarken unterhalb von MODELED | 0 | 2.957 |
| davon mit Chartmarke | 0 | 1.237 (Box 229, Widerstand 801, Konsolidierung 22, Gap-Tief 185) |
| Order-, Stop-, Limit-, Pivot-, swingLow-, signalDayLow-Felder unterhalb von MODELED | 0 | **0** |
| Ränge | – | nur C03/C04/C05 (1.024 Ränge, Sortierung nach Abstand zur Chartmarke) |

## Oberfläche

- Die Chartmarke heißt „Chartstruktur: Box-Obergrenze / Widerstand (Woche) / Konsolidierungshoch (10 Tage) / Gap-Tief“. Die Tabelle der Beschriftungen ist wörtlich festgeschrieben.
- Gezeigt wird sie nur für diese belegten Strukturarten. Die Engine-Marke eines modellierten Ablaufs (z. B. Power-Play-Pivot = Einstieg) erscheint nicht als Chartstruktur; dort zeigen Plan und Chart Einstieg und Stop.
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
  - keine weitere: `trend.high252` und `belowHigh252` sind bei C06/C07/C13 unterhalb von MODELED ausgeblendet (Owner-Entscheidung 28.10.2026). Der Test baut für ACVA, SLAB, BIO-B (C06), MGLD (C07) und BIO-B (C13) das echte 52-Wochen-Hoch aus den Kursen nach. Jedes gleicht einer Order-Größe und wird rot.
- `SF8-HIGH252-NOT-DERIVABLE` (unabhängiges Review 28.10.2026, Befund B1/N1): Das ausgeblendete Hoch darf sich auch nicht aus einem Abstand zurückrechnen lassen.
  - Befund: `features.pctBelowHigh52w` (C06) ist derselbe Wert wie `belowHigh252`; `close / (1 − x)` ergab das Hoch in 668 von 668 SEPA-Ansichten (größter Fehler 0,06 $).
  - Befund: die Basistiefe (`largestCorrection`, `vcpFootprint.depths` = 1 − Tief / Basishoch) ergab es in 22 Ansichten über `trend.low252`, wenn das Basistief am 52-Wochen-Tief lag.
  - Korrektur: alle drei bei C06 unterhalb von MODELED ausgeblendet (`ORDER_DERIVED_BY_METHOD`, `ORDER_DERIVED_SUBFIELDS_BY_METHOD`). Eine Rundung auf ganze Prozent wurde geprüft und verworfen: eine flache Basis landete auf dem groben Raster zufällig wieder auf 0,01 % am Hoch.
  - Es bleiben `pctAboveLow52w`, `vcpProxyState`, Zahl und Verlauf der Kontraktionen, Basislänge, `rangesContracting`.
  - Der Test sucht über alle Zahlen der Ansicht (Abstand mit Schluss, `low252`, Durchschnitten, Strukturmarken; relative Toleranz 2·10⁻⁴). Gegenproben: der Detektorwert `pctBelowHigh52w` in jeder SEPA-Ansicht und eine Basistiefe am 52-Wochen-Tief werden rot.
  - Im vollen Lauf bleiben nur einzelne Zufallstreffer aus allgemeinen Kursdaten (z. B. Schluss = Hoch, wenn die Aktie am Hoch schließt; Vortagesschluss über `change1d`). Diese Werte zeigt der normale Aktienchart ohnehin; keine strategiebezogene Kennzahl der Ansicht trifft mehr (Zufallsniveau: 1–3 Treffer je Formel bei 858 Ansichten).
- Die 55 Ansichten unterhalb von MODELED der Golden Cases sind per SHA-256 eingefroren.
- `SF8-STRUCTURE-MARKS`: Marken je Methode in den Golden Cases. Prüft Darvas, BGU und C07 einzeln sowie das fail-closed-Verhalten.
- Golden Case C07 unterhalb von MODELED:
  - WDAY (Chart-Kandidat, manuelle Prüfung) und MGLD (bestätigtes Setup);
  - aus dem Datenstand 7cc3f26 mit `scripts/supertrader/source-faithful/product/golden-fixture-add.mjs` angefügt;
  - der Erzeuger reproduziert alle 19 regulären vorhandenen Titel bitgleich (ACA ist der absichtlich veraltete Negativfall);
  - Nebenwirkung: Die Momentum-Perzentile sind ein Querschnitt über die Fixture. Bestehende C08-Ansichten verschieben sich leicht (BOLT 84,6 → 85,7, JAKK 76,9 → 78,6), ebenso ein C05-Rang. Stufen und erkannte Methoden bleiben gleich.

## Unabhängiges Review und Browser-QA

- **Review 1: BLOCKED**, weil die C07-Korrekturtiefe den geplanten Verlust veröffentlichte. Behoben: Die Korrekturtiefe ist unterhalb von MODELED ausgeblendet, und die Ausnahme ist entfernt.
- **Nit:** Die Beschriftungen sind jetzt wörtlich festgeschrieben, und die Wortliste umfasst auch Ausstieg, Exit, Verkauf, Verlust und Ziel.
- **Browser-QA gegen das Auslieferungsartefakt** (`build-release.mjs`), 390 px und 1280 px:
  - mit Kandidatendaten des vollen Laufs: 62 Seitenaufrufe, 0 Fehler;
  - ohne Daten (Auslieferungszustand): 0 Fehler.
- **Sichtprüfung:** Darvas (DAAQ) zeigt die Box-Obergrenze, BGU (XNCR) das Gap-Tief, beide gestrichelt in der Strukturfarbe. Der modellierte Power Play (BMBL) zeigt nur Plan-Einstieg und Plan-Stop.
- Der QA-Fund, die Engine-Marke im modellierten Ablauf als „Chartstruktur“ zu beschriften, ist behoben.

## Offene Owner-Punkte

1. **Entschieden 28.10.2026:** Das 52-Wochen-Hoch wird bei SEPA, Power Play und Holy Grail unterhalb von MODELED nicht als strategiebezogene Kennzahl ausgegeben, und ebenso nicht der Abstand dazu. Das allgemeine 52-Wochen-Hoch des Aktiencharts bleibt (`records.mjs#TREND_HIDDEN_BY_METHOD`).
2. Core DQ-SF8-4 zieht in einem eigenen, eng begrenzten Core-PR nach (Strukturmarken, Chartmarkenarten, C07-Korrekturtiefe, 52-Wochen-Hoch bei C06/C07/C13). Merge erst nach diesem PR.
3. Regeltexte wie „Einstiegsmarke knapp über dem Box-Hoch“ (DAR-SF-ENTRY) beschreiben die Regel der Quelle ohne Preis. Sie sind unverändert.
4. Box-Obergrenze und Widerstand liegen in ihrer Quelle einen Bruchteil bzw. Tick unter dem Buy-Stop; Gap-Tief ist zugleich die Risikoreferenz. Beides ist der Methode eigen und vom Owner als Struktur zugelassen.

## Rückrechnung zusammen mit den öffentlichen Tageskursen (Owner-Entscheidung 28.10.2026, umgesetzt)

**Regel des Owners:** Ein Feld ist rückrechenbar, wenn sich daraus zusammen mit den öffentlich verfügbaren Kursdaten ein geschützter Einstiegs-, Stop- oder Orderparameter zuverlässig rekonstruieren lässt. Solche Felder fehlen unterhalb von `MODELED_TRADE_PLAN` im ausgelieferten Kandidatendatensatz (`strategy/`, `ticker/`), nicht nur in der Anzeige. Die Research-Engines, Detektoren, Golden Cases und Referenzdaten bleiben unverändert.

**Messung** (voller Lauf 26.10., alle 13 Methoden unterhalb von MODELED, Sonde `SF8-NO-BAR-RECONSTRUCTION`):
- Jede Ganzzahl, deren Name ein Zeitfenster ausweist (`…Sessions`, `…Days`, `…Weeks` × 5, `…Length`, `…Window`, `…Bars`), wird als Fenster gedeutet (± 1 Sitzung, endend am Stichtag oder Vortag) und liefert das höchste Hoch und das tiefste Tief.
- Jedes Datum wird als Anker gedeutet: Hoch und Tief an dem Tag, höchstes Hoch und tiefstes Tief seitdem.
- Ein Treffer zählt nur, wenn ein Fenster **ohne** das Feld (2–6 Sitzungen, das allgemeine 52-Wochen-Fenster) denselben Wert nicht schon liefert. Das trennt die Information des Feldes von allgemeiner Chartinformation.

| Methode | Feld | rekonstruiert | Treffer | Entscheidung |
|---|---|---|---|---|
| C06 SEPA | `baseLengthSessions` und `vcpFootprint.baseSessions` (gleicher Wert) | Pivot bzw. Stopreferenz = Hoch/Tief der Basis | 77 von 238 | **ausgeblendet** |
| C07 Power Play | `consolidationSessions` | Pivot und Stop | 7 von 15 | **ausgeblendet** |
| C13 Holy Grail | `impulseHighDate` | Impulshoch = Hoch an dem Tag, Stop = tiefstes Tief seitdem | 90 von 171 | **ausgeblendet** |
| C13 Holy Grail | `adxAbove30Since` | Impulshoch = höchstes Hoch ab dem Tag (Quelle: `holy-grail-lifecycle.mjs`) | 81 von 171 | **ausgeblendet** (über die Liste des Owners hinaus, nach derselben Regel) |
| C04/C05 Weinstein | `baseWeeks` | Stopreferenz = tiefstes Tief der Basis | 141 von 329 / 282 von 379 | **ausgeblendet** (über die Liste des Owners hinaus, nach derselben Regel) |
| C04/C05 | `breakoutDay` | Trigger (Widerstand + 1 Tick; der Widerstand ist ohnehin als Chartstruktur veröffentlicht) | 7 von 422 / 3 von 379 | bleibt (nicht zuverlässig, Struktur bereits zulässig) |
| C03 Darvas | `boxTopDate`, `boxBottomDate`, `boxCompleteDate` | Stopreferenz | höchstens 2 von 229 | bleibt (nicht zuverlässig) |
| C06 | `vcpFootprint.contractions` | – (kein Zeitfenster; ein kleines Fenster trifft den Stop auch ohne das Feld in 167 von 238, mit dem Feld zusätzlich nur 2) | – | bleibt |
| alle | `trend.windowSessions` (= 252) | allgemeines 52-Wochen-Fenster | – | bleibt (allgemeine Chartinformation) |

**Vorher/Nachher:**
- Unverändert: 3.001 Kandidaten, Stufen 2.023 / 953 / 25, alle Datensätze (`records/`) inhaltsgleich bis auf `provenance.codeSha256`, dieselbe Reihenfolge, 0 Rangänderungen, MODELED 0 Änderungen.
- Geändert: nur `features` in 1.659 Ansichten (C04 422, C05 379, C06 668, C07 19, C13 171).

**Tests:**
- `SF8-NO-BAR-RECONSTRUCTION` (neu): die Golden Cases (C04, C05, C06, C07, C13) haben keinen Treffer.
- Gegenproben: jedes der ausgeblendeten Felder, wieder eingesetzt, wird in mindestens einer Ansicht rot. Die Rücknahme jeder Ausblendung im Erzeuger macht den Test rot.
- Golden-Hash der 55 Ansichten neu eingefroren.
- Abgleich mit dem Core: Die Sperrlisten des Core sind eine Teilmenge der Erzeugerlisten (der Core ist nie strenger als der Erzeuger). Jede Seite schreibt ihre Listen explizit fest. Merge-Reihenfolge: Erzeuger zuerst, dann Core; jeder Zwischenstand bleibt grün.
