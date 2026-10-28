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

## Offen für den Owner: Rückrechnung zusammen mit den öffentlichen Tageskursen (unabhängiges Review 28.10.2026)

Die Prüfung oben gilt für die Zahlen **in der Ansicht**. Zusammen mit den öffentlichen Tageskursen (OHLC) lassen sich aus Zeitfenstern der Ansicht Marken nachbauen. Alle vier Felder standen schon vor diesem PR in den Ansichten; dieser PR ändert sie nicht.

| Methode | Feld | nachgebaut aus den Tageskursen | Treffer |
|---|---|---|---|
| C06 | `baseLengthSessions` (= `vcpFootprint.baseSessions`) | Pivot = höchstes Hoch im Fenster; Stopreferenz = tiefstes Tief | 171 bzw. 173 von 238 |
| C07 | `consolidationSessions` | Pivot und Stop = Hoch/Tief im Fenster | 19 von 19 |
| C13 | `impulseHighDate` | `impulseHigh` = Hoch an dem Tag; `swingLow` = tiefstes Tief seitdem | 170 von 171 |

Ob „rückrechenbar“ auch die Kombination mit dem öffentlichen Chart umfasst, ist eine Owner-Entscheidung. Falls ja: eigener PR nach demselben Muster (Felder unterhalb von MODELED ausblenden oder nur als Status, Core-Gegenstück in DQ-SF8-4).
