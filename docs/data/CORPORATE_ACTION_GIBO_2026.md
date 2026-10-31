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

## 3. Warum der bestehende Ergänzungsweg nicht reichte (Stand #1177)

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

## 3a. Bereinigung in der Marktdaten-Pipeline (Completion 2.0, B2)

Auftrag 2.0: „Falls bestätigt, die Korrektur ausschließlich in der zuständigen Marktdaten-Pipeline vornehmen.“ Bestätigt ist der Fall durch §1 und §2.

- **Register:** Eintrag `GIBO-2026-06-29-CONSOLIDATION-25` mit `correction.status = PIPELINE` (Schema unverändert 1.0.0, Version 2). `UNCORRECTED` bleibt für Fälle, die nur belegt und nicht bereinigt werden.
- **Bibliothek:** `scripts/market/lib/corporate-action-confirmations.mjs#applyConfirmations(bars, securityId)` liefert eine Kopie der Rohbalken mit `splitFactor` am Sprungtag.
  - Kurse und Volumen bleiben die des Anbieters.
  - Die Ablage (R2) wird nicht verändert.
  - Bereinigt wird unverändert über `return-series.js#splitFactors` bzw. `canonical-bars.js` (ADR-002).
- **Sprungtag:** der Balken mit dem kleinsten Rest |ln(Rohsprung × Faktor)| in [Wirksamkeitstag − 1, + 5 Sitzungen]. Bei GIBO ist das der **30.06.**, nicht der Altwert vom 29.06.
- **Angeschlossen** sind alle drei Leser derselben Ablage, damit nichts auseinanderläuft (eine Preiswahrheit):
  - Technical-Materialisierung (`scripts/technical/materialize-product-intelligence.mjs`, `validatedInput`);
  - Discover-Tagesreihe (`publish-discover-series.mjs`);
  - Wochenreihe (`publish-long-series.mjs`, Herkunft in `corporateActions.confirmed`).
- **Wirksam** wird die Bereinigung mit den nächsten regulären Läufen. Es gibt keinen manuellen Produktionslauf, und generierte Dateien werden nicht von Hand geändert.
- **Nachweis am echten Datenstand:** Rohbalken aus dem veröffentlichten Bündel, Pfad wie in der Materialisierung (Skript im PR beschrieben):
  - `APPLIED` am 2026-06-30, Rohsprung ×18,16, Restbewegung ×0,7264 (−27 %, die echte Tagesbewegung).
  - Die kanonische Reihe ist gültig. Schluss 26.06. = 31,25 (1,25 × 25), 30.06. = 22,70.
  - Der größte Tagesfaktor der bereinigten Reihe ist 1,38; vorher war es ×18,16.

## 4. Auswirkungen der Bereinigung

Berechnet auf den Bars vom Stichtag 29.10.: Kurse vor dem 30.06. × 25 in neue Einheiten. Das ist dieselbe Geometrie, die `applyConfirmations` erzeugt (§3a). Wirksam wird es nach dem nächsten Materialisierungs- und Technical-Lauf.

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
  - Status `UNCORRECTED` oder `PIPELINE` mit Begründung.
  - Ungültige Datei: Abbruch (`CORPORATE_ACTION_CONFIRMATIONS_INVALID`).
- **Schutz in `applyConfirmations`:** Greift eine Bedingung, bleibt der Eintrag `SKIPPED` mit Grund. Die Wochenreihe meldet ihn als `::warning::`.
  - `PROVIDER_SPLIT_NEARBY`: Der Anbieter führt innerhalb von 5 Sitzungen selbst einen Split (er hat nachgezogen). Es wird nicht doppelt bereinigt.
  - `NO_RAW_JUMP`: Kein auffälliger Rohsprung in Richtung des Faktors (Faktor außerhalb 0,2–5 oder Split-Signatur), d. h. die Reihe ist schon bereinigt, etwa wenn der Anbieter die Historie rückwirkend umgerechnet hat.
  - `RESIDUAL_JUMP`: Nach dem Faktor bliebe ein auffälliger Sprung oder mehr als die Hälfte des Rohsprungs; der Faktor passt nicht zur Reihe.
  - `NO_BAR_AFTER_EFFECTIVE_DATE`: Kein Balken am oder nach dem Wirksamkeitstag.
  - Alle vier sind getestet (`quant/tests/corporate-action-confirmations.test.mjs`).
- **Folge für die Kennzeichnung (Option B, #1180):** Nach der Bereinigung springt die GIBO-Reihe nicht mehr, die Kennzeichnung „Datenfehler bestätigt“ entfällt von selbst. „Bestätigt“ bleibt für Einträge, die nur belegt sind oder deren Bereinigung ein Schutz verweigert.
- **Bestehende Schutzprüfungen der Ergänzungen bleiben unverändert:** `PROVIDER_SPLIT_NEARBY` und `NO_RAW_JUMP`.

## 6. Datenqualitätsregeln

- **DQ-PX-3:** meldet `ref_GIBO 2026-06-30: 1.25 -> 22.7`, wie zuvor.
- **DQ-TW-1..8 PASS:**
  - DQ-TW-8 betrifft Lunten-Tiefs; der GIBO-Fall ist ein Schlusssprung.
- **Tests:**
  - `quant/tests/corporate-action-confirmations.test.mjs` 5/5 (Bereinigung und Schutzregeln);
- **Nach dem nächsten Lauf erwartet:** DQ-PX-3 meldet GIBO nicht mehr, da die Discover-Reihe bereinigt ist;
  - `quant/tests/split-evidence-supplements.test.mjs` 9/9, unverändert.

## 7. Nachweis im regulären Lauf (31.10.2026)

| Artefakt | Ergebnis |
|---|---|
| Materialisierung `d2a7fc4` (Nachtlauf 30./31.10., Bündel `technical-signals-v1/GI`) | Schluss 26.06. = 31,25, 29.06. = 31,25, 30.06. = 22,70; größter Tagesfaktor der Reihe **1,377** (vorher 18,16). `splitEvents` 2 in der Herkunft. |
| Discover-Tagesreihe `ref_GIBO` (Marktdaten-Refresh `1d4ff5e`) | bereinigt: 31,25 → 31,25 → 22,70 |
| DQ-PX-3 | meldet den Sprung vom 30.06. nicht mehr |
| Technical-Screener (Erzeuger auf Stand 30.10., #1188) | rs6m **1,58**, RS-Rang **99,4**, keine Kurssprung-Kennzeichnung, `suspectJumpConfirmed` = 0; „Etablierter Aufwärtstrend“ nur noch **fast**, kein Volltreffer (619 Volltreffer) |
| Wochenreihe `discover-series-long/ref_GIBO` | **noch nicht** neu gebaut (wöchentlicher Lauf, letzter 24.10.); bis dahin meldet DQ-PX-4 die Abweichung Tag/Woche um Faktor 25. Der nächste reguläre Lauf schreibt `corporateActions.confirmed`. |

Vorhersage aus §4 bestätigt: Der etablierte Aufwärtstrend fällt wie vorhergesagt weg. Der RS-Rang liegt mit 99,4 statt 98,6 etwas höher, weil der Stichtag einen Tag später ist und sich der Querschnitt verschoben hat.
