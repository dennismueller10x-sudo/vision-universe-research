# Screener-Feld AP8 L3: Abstand zum 52-Wochen-Tief

**Fachmodell, Owner-Freigabe nötig.** Teil von S2 der Strategie-Vorlagen ([STRATEGY_TEMPLATES_PLAN.md](STRATEGY_TEMPLATES_PLAN.md)). Gebraucht für Kriterium 6 der Vorlage „Etablierter Aufwärtstrend“: „Kurs mindestens 30 % über dem 52-Wochen-Tief“ (S3).
Versionen: `technical-screen-row-1.12.0`, `technical-query-1.12.0`, `technical-query-text-1.9.0`.

## 1. Feld (nur Tag)

| Feld | Typ | Definition |
|---|---|---|
| `distLow52w` | Anteil ≥ 0 | Schlusskurs am Stichtag / 52-Wochen-Tief − 1 |

- **52-Wochen-Tief** = tiefstes **Tagestief** der letzten 252 Handelstage.
  - Es ist dieselbe Größe wie in `newLow52w` am Tag (AP4) und stammt aus dem Feature-Store der Materialisierung (`distanceTo52wLow`). Neu gerechnet wird nichts.
  - Die Beschriftung nennt die Basis: „Abstand über dem 52-Wochen-Tief (Tagestief)“.
- **Gegenstück zu `distHigh52w`** (Abstand zum 52-Wochen-Hoch, Tageshoch), gleich gerundet (4 Stellen).
- **Nur Tag:** Woche und Monat würden auf Schlusskursen beruhen (wie bei `newLow52w@1W`). Sie kommen nur, wenn eine Vorlage sie braucht.
- **Leer (`null`):** ohne Wert in der Materialisierung und bei eingefrorener Reihe.
- **Titel hinter dem Stichtag** behalten den Wert ihres letzten Kurses, wie `distHigh52w`.
- **Chart Studio:** im Kursbild (wie 52-Wochen-Hoch/-Tief).
- **Suche in Worten:**
  - „Abstand zum 52-Wochen-Tief mindestens 30 %“;
  - **neu verstanden:** „mindestens 30 % über dem 52-Wochen-Tief“ und, für das bestehende Feld `distHigh52w`, „höchstens 25 % unter dem 52-Wochen-Hoch“.
  - Diese beiden Formulierungen wurden bisher als „neues 52-Wochen-Tief/-Hoch“ gelesen, also mit falscher Bedeutung.
  - „neues 52-Wochen-Tief“ bleibt das Ereignis.

## 2. Datenqualität

- **Der Wert gibt die veröffentlichten Tagesbars treu wieder.** Ein unplausibles Tagestief macht ihn sehr groß.
  - Am 28.10. betrifft das rund 7 Titel; ihr 52-Wochen-Tief ist eine Lunte unter der Hälfte von Eröffnung bzw. Schluss.
  - Beispiele: MYND (19.10.: Tief und Eröffnung 0,0001 bei Schluss 0,2199, Wert 3.399), GETY, AREB, DRCT, JL, MBRX, STFS.
- **Dieselben Tiefs** wirken heute schon auf `newLow52w`.
- **Zuständigkeit:** Die Korrektur solcher Bars gehört zur Marktdaten-Domäne (wie A4, kein Anbieterabruf ohne Freigabe).
- **Die Vorlage „Etablierter Aufwärtstrend“** verlangt zusätzlich „höchstens 25 % unter dem 52-Wochen-Hoch“ und Kurs über den Durchschnitten. Ein einzelner falscher Tiefstwert allein macht einen Titel dort nicht zum Treffer.

## 3. Vorher/Nachher (Neubau mit dem Erzeuger, Stichtag 28.10.2026, 5.659 Titel)

- **Bestehende 150 Spalten:** byte-gleich.
- **Geändert in den Metadaten:** nur `versions` und `benchmark.asOf` (neuere SPY-Reihe des Marktlaufs vom 30.10.).

| | aktuell (5.347) | hinter dem Stichtag (80) | eingefroren (232) |
|---|---|---|---|
| `distLow52w` | leer 0 · Median 25,3 % · min 0 | Median 47,3 % | leer 232 |

- Mindestens 30 % über dem Tief liegen 2.406 aktuelle Titel.
- Davon sind 1.347 höchstens 25 % unter dem 52-Wochen-Hoch.

## 4. Prüfung

- `quant/tests/technical-ap8-l3.test.mjs`:
  - Wert und Rundung;
  - leer ohne Feature;
  - Wortsuche inklusive der Kriterien-Formulierungen, bestehende Phrasen unverändert;
  - Datensatzspalte = Schluss / tiefstes Tagestief (252) − 1 auf den Bars (über 200 Titel);
  - nie negativ;
  - eingefroren leer.
- Vertrag erweitert (Bereich ≥ 0), `DATA_CONTRACT.md` neu erzeugt. Rundlauf der Wortsuche und Chart-Darstellung für jedes Feld.
