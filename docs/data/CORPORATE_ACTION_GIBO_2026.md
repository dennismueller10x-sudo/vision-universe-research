# GIBO: Share Consolidation 25:1 vom 29.06.2026 (Option A, Owner-Freigabe 30.10.2026)

## 1. Bestätigter Kapitalmaßnahmenfaktor und Quelle

| | |
|---|---|
| Maßnahme | Share Consolidation **25:1** (je 25 Class-A-Aktien zu einer); Anbieter-Konvention `splitFactor` = 0,04 |
| Wirksam | zur Handelseröffnung am **Mo 29.06.2026**, neue CUSIP G38617133 |
| Quelle | SEC 6-K vom 25.06.2026, Accession 0001493152-26-030060, [form6-k.htm](https://www.sec.gov/Archives/edgar/data/2034520/000149315226030060/form6-k.htm), sha256 `dab97c53…41bae`, 32.652 Bytes |

**Vorhandene Daten zuerst:**
- Die SEC-Bündel im Repository (`quant/data/sec/consumer/CIK0002034520.json`) enden mit dem 20-F vom 15.05.2026, also vor der Maßnahme.
- `split-evidence-supplements.json` hatte keinen Eintrag.

**Zusätzliche Abrufe:**
- 2 SEC-Anfragen: Einreichungsliste und das eine 6-K.
- 1 Tiingo-Anfrage: GIBO, 15.06.–10.07.2026, Lauf 41117039581, nur lesend.

## 2. Anbieter: der Faktor fehlt

- Tiingo führt `splitFactor = 1` an allen 16 Balken.
- Rohschluss und Volumen um die Maßnahme:

| Tag | Rohschluss | Volumen |
|---|---|---|
| 26.06. | 1,25 | 19.979 |
| 29.06. | 1,25 (O=H=L=C, ein Altwert) | 1.079 |
| 30.06. | 22,70 (Eröffnung 24,74) | 6.406 |

- Damit ist der Datenfehler **bestätigt**:
  - Die veröffentlichten Reihen (Discover-Tagesreihe, Technical-Tagesbars) springen am 30.06. um ×18,16.
  - Sie sind als „SPLIT_ADJUSTED“ ausgewiesen.
  - DQ-PX-3 meldet die Reihe (`ref_GIBO 2026-06-30: 1.25 -> 22.7`).

## 3. Warum keine Bereinigung an der Quelle in diesem Schritt

1. **Der Anbieter führt den Faktor nicht.** Ein erneuter Abruf ändert nichts.
2. **Der bestehende Weg der Marktdaten-Domäne passt nicht.** Gemeint ist `quant/config/split-evidence-supplements.json` mit `scripts/market/lib/split-evidence-supplements.mjs`.
   - Er ist für Vorwärts-Splits als Aktiendividende gebaut: Pflichtfelder Zahltag/Stichtag, Ex-Tag nach FINRA 11140 nach dem Zahltag. Eine Konsolidierung hat keinen Zahltag.
   - Seine Schutzprüfung würde den Eintrag zu Recht verwerfen (`NO_RAW_JUMP`):
     - am 29.06. kein Sprung, weil der Balken ein Altwert ist;
     - am 30.06. ×18,16 statt ×25, weil der Kurs am selben Tag zusätzlich rund 27 % fiel.
   - Die Ergänzungen wirken außerdem nur auf die veröffentlichten Tages- und Wochenreihen, nicht auf die Technical-Materialisierung. Diese liest `bar.splitFactor` aus der Historienablage.
   - Eine Bereinigung nur dort würde Reihe und Technical-Bars auseinanderlaufen lassen; DQ-TW-3 würde das melden.
   - Eine Erweiterung bräuchte eine **Owner-Entscheidung**: Konsolidierungen, Altwert-Balken, Weg in die Materialisierung, ohne die bestehende Schutzprüfung abzuschwächen.
3. **Festgehalten** ist der Befund in `quant/config/corporate-action-confirmations.json`, mit Prüfung und Test:
   - bestätigt, nicht bereinigt;
   - keine Kursänderung.
   - Die Kennzeichnung in Technical (Option B) liest diese Datei, um „bestätigter Fehler“ von „Verdacht“ zu unterscheiden.

## 4. Auswirkungen einer korrekten Bereinigung

Was-wäre-wenn auf den Bars vom Stichtag 29.10.: Kurse vor dem 30.06. × 25 in neue Einheiten. Nicht angewendet.

| | heute (unbereinigt) | korrekt bereinigt |
|---|---|---|
| Schluss vor 126 Tagen (30.04.) | 1,31 | 32,75 |
| rs6m (126 Tage, minus SPY +7,05 %) | 55,27 | 1,18 |
| RS-Rang | 100 | 98,6 |
| 1 Kurs über SMA 150 und SMA 200 | erfüllt | erfüllt |
| 2 SMA 150 über SMA 200 | erfüllt | **nicht erfüllt** |
| 3 SMA 200 steigt | erfüllt | **nicht erfüllt** |
| 4 SMA 50 über SMA 150 und 200 | erfüllt | erfüllt |
| 5 Kurs über SMA 50 | erfüllt | erfüllt |
| 6 mind. 30 % über 52-W-Tief | +6.262 % | +227 % |
| 7 höchstens 25 % unter 52-W-Hoch | 0 % | −4,8 % |
| 8 RS-Rang ≥ 70 | erfüllt | erfüllt |
| „Etablierter Aufwärtstrend“ | **erfüllt, Platz 1 von 685** | **nicht erfüllt** (2 Kriterien fehlen, auch nicht „fast“) |

Die Trefferliste hätte 684 statt 685 Titel; Platz 1 wäre MRNA.

## 5. Schutz vor erneuter falscher Bereinigung

- **Prüfung der Bestätigungsdatei:**
  - Identität aus `core/identity.js`;
  - SEC-Beleg mit URL zur Accession und zum CIK, sha256, wörtlichem Zitat;
  - Konsolidierungsfaktor < 1;
  - Wirksamkeitstag Werktag;
  - dokumentierte Anbieterprobe;
  - Status `UNCORRECTED`.
  - Ungültige Datei: Abbruch (`CORPORATE_ACTION_CONFIRMATIONS_INVALID`).
- **Die Datei korrigiert nichts.** Eine doppelte Bereinigung über sie ist ausgeschlossen. Bereinigt wird später nur über einen Weg, nach dem der Eintrag entfernt wird.
- **Bestehende Schutzprüfungen der Ergänzungen bleiben unverändert:** `PROVIDER_SPLIT_NEARBY` und `NO_RAW_JUMP`.

## 6. Datenqualitätsregeln

- **DQ-PX-3:** meldet `ref_GIBO 2026-06-30: 1.25 -> 22.7`, wie zuvor.
- **DQ-TW-1..8 PASS:**
  - DQ-TW-8 betrifft Lunten-Tiefs; der GIBO-Fall ist ein Schlusssprung.
- **Tests:**
  - `quant/tests/corporate-action-confirmations.test.mjs` 2/2;
  - `quant/tests/split-evidence-supplements.test.mjs` 9/9, unverändert.
