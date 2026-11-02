# Screener-Felder AP8 L2: Richtung der SMA 200

**Fachmodell, Owner-Freigabe nötig.** Teil von S2 der Strategie-Vorlagen ([STRATEGY_TEMPLATES_PLAN.md](STRATEGY_TEMPLATES_PLAN.md)). Gebraucht für Kriterium 3 der Vorlage „Etablierter Aufwärtstrend“: „SMA 200 steigt seit mindestens einem Monat“ (S3).
Versionen: `technical-screen-row-1.12.0`, `technical-query-1.12.0`, `technical-query-text-1.9.0`.

## 1. Felder (nur Tag)

| Feld | Typ | Definition |
|---|---|---|
| `sma200Rising` | ja/nein | SMA 200 am Stichtag > SMA 200 vor 21 Handelstagen |
| `sma200Slope21` | Anteil | SMA 200 am Stichtag / SMA 200 vor 21 Handelstagen − 1 |

- **„Seit mindestens einem Monat“** wird als Netto-Anstieg über 21 Handelstage gemessen, nicht als Anstieg an jedem einzelnen Tag.
  - Das ist die übliche Umsetzung dieses Kriteriums.
  - Eine strengere Fassung („an jedem der 21 Tage gestiegen“) wäre ein anderes Feld und wird hier nicht eingeführt.
- **Quelle:** SMA 200 aus den veröffentlichten Tagesbars (`technical-signals-v1`, SPLIT_ADJUSTED, 270 Bars), wie in L1.
  - Abgleich mit der Vollhistorie der Materialisierung: Median 7 · 10⁻¹⁶, 4 von 5.659 Titeln über 0,01 % (SCREENER_FIELDS_AP8_L1.md §1).
- **Leer (`null`):** mit weniger als 221 Bars und bei eingefrorener Reihe.
- **Titel hinter dem Stichtag** behalten den Zustand wie alle Trendzustände (AP1); die Vorlagen schließen sie aus.
- **Zustand und Richtung sind getrennt:** Ein Kurs kann über einer fallenden SMA 200 liegen. Der Test prüft diesen Fall ausdrücklich.
- **Chart Studio:** Die Schicht „SMA“ zeigt die SMA 200; ihre Richtung ist dort sichtbar.
- **Suche in Worten:**
  - „SMA 200 steigt“, „steigende 200-Tage-Linie“;
  - „SMA 200 fällt“, „fallende 200-Tage-Linie“;
  - „Steigung der SMA 200 größer 1 %“.

## 2. Vorher/Nachher (Neubau mit dem Erzeuger, Stichtag 28.10.2026, 5.659 Titel)

- **Bestehende 150 Spalten:** byte-gleich.
- **Geändert in den Metadaten:** nur `versions` und `benchmark.asOf` (neuere SPY-Reihe des Marktlaufs vom 30.10., nicht aus dieser Änderung).

| Feld | aktuell (5.347) | hinter dem Stichtag (80) | eingefroren (232) |
|---|---|---|---|
| `sma200Rising` | ja 2.265 · nein 3.082 · leer 0 | ja 42 · nein 38 | leer 232 |
| `sma200Slope21` | Median −0,56 %, min −90,8 %, max +65,6 % | Median +0,19 % | leer 232 |

Zum Einordnen: Bei 1.975 aktuellen Titeln liegt der Kurs über der SMA 200; bei 1.598 davon steigt die SMA 200 zugleich.

## 3. Prüfung

- `quant/tests/technical-ap8-l2.test.mjs`:
  - Rechnung gegen `Indicators.compute`;
  - Kurs über fallender SMA 200;
  - leer unter 221 Bars;
  - Wortsuche, auch bestehende Begriffe unverändert;
  - Datensatzspalte = Rechnung auf den Bars (über 200 Titel);
  - eingefroren leer.
- Vertrag erweitert, `DATA_CONTRACT.md` neu erzeugt. Rundlauf der Wortsuche und Chart-Darstellung für jedes Feld.
- **Suiten:** technical 35/35, quant technical/ti 542/542.
