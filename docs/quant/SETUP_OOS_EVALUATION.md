# Setup-Backtest: zeitliche Lern-/Testprüfung (OOS)

Stand 2026-10-29, Auswerter `setup-oos-1.0.0` (`quant/engines/setup-oos.cjs`).
Dieses Dokument enthält keine Freigabe. Es beschreibt, was technisch vorbereitet ist und welche Entscheidungen beim Owner liegen.

## 1. Was der Vertrag verlangt

`quant/methodology/backtest-certification-v1.json`, `kinds.SETUP_BACKTEST.requirements`:

| Feld | Wert | Bedeutung |
|---|---|---|
| `oosMinPerSegment` | 30 | Mindestanzahl abgeschlossener Ergebnisse **je Segment** (Lernen und Testen) |

Der Vertrag legt **nicht** fest:

- wie die Segmente gebildet werden (Schnittregel, Embargo),
- woran ein bestandener Test erkannt wird (Erfolgskriterium),
- welche Grundgesamtheit zählt (Ereignisart, Einstiegsvariante, Horizont).

Der archivierte Vorschlag `docs/quant-recovery/methodology-v1/backtest-certification-methodology-v1.0.0.json` nennt das Gate `oos_by_segment` und beschreibt die Richtung („Chronological holdout not viewed during rule selection“, Purge/Embargo mindestens über den längsten Horizont, Gate-Label `OOS_DIRECTIONAL_REPLICATION`, das ausdrücklich **kein** wirtschaftlicher Vorteil ist). Der Vorschlag ist nicht ratifiziert (`PRESERVED_PROPOSAL_NOT_APPROVED`) und gilt deshalb nicht als Norm.

Dieselbe Lücke halten die V10-Befunde fest: `scripts/quant/v10/setup/setup-original-inventory.cjs` („keine Segmentdefinition implementiert“) und `build-setup-independence-decision.cjs` („braucht eine eigene Segmentdefinition“).

## 2. Was der Code prüfen soll

Ein OOS-Nachweis für den Setup-Backtest heißt: Eine vorab festgelegte Aussage über abgeschlossene Ergebnisse, die im früheren Zeitraum (Lernen) gilt, gilt auch im späteren Zeitraum (Testen), der bei der Festlegung nicht angesehen wurde. Der Auswerter prüft dafür:

1. genug abgeschlossene Ergebnisse für zwei Segmente (≥ 2 × `oosMinPerSegment`),
2. eine **freigegebene** Segmentdefinition (keine Standardregel im Code),
3. zeitliche Trennung: kein Ereignistag in beiden Segmenten; Trainingsereignisse, deren Ergebnisfenster in den Testzeitraum reicht, fallen per Embargo weg (`purged`),
4. jedes Segment erreicht nach dem Embargo noch `oosMinPerSegment` auswertbare Zeilen,
5. das freigegebene Erfolgskriterium gilt in beiden Segmenten.

Ein PASS dieses Gates zertifiziert nichts. SETUP_BACKTEST braucht zusätzlich alle anderen Gates und die Owner-Freigabe in `quant/methodology/setup-state-v1.json` (`requirements.backtestCertification`, heute `NOT_CERTIFIED`; `setup-state-contract.js` lehnt jede andere Angabe ab).

## 3. Welche Originaldaten es heute gibt

Aus `quant/data/product/setup-outcomes-v1.json` (veröffentlichte Setup-Stände, contentHash geprüft):

| Größe | Wert |
|---|---|
| veröffentlichte Stichtage | 22 (2026-09-10 bis 2026-10-28) |
| Spanne | 48 Tage |
| Ereignisse | SETUP_NEW 1.902, SETUP_CONFIRMED 158, SETUP_WEAKENED 2.321, alle zwischen 2026-09-24 und 2026-10-28 (21 Ereignistage, 2 Kalendermonate) |
| abgeschlossene 6-Monats-Ergebnisse (M6, NEXT_CLOSE) | **0** (SETUP_NEW und SETUP_CONFIRMED) |
| abgeschlossene 1-Monats-Ergebnisse | SETUP_NEW 341, SETUP_CONFIRMED 40 (für das Gate nicht maßgeblich) |
| Renditebasis dieses Laufs | Kursrendite (`SPLIT_ADJUSTED_PRICE`) |

Frühestes erstes M6-Ergebnis: rund 183 Kalendertage nach dem ersten Ereignis (Builder-ETA `firstCompletedM6`, etwa Ende März 2027). Selbst dann reichen die Ereignisse dieser zwei Monate allein nicht für einen sauberen zeitlichen Schnitt mit Embargo über den Horizont (siehe 5).

Ereigniszeilen (`{date, net, b}` je abgeschlossenem Ereignis) entstehen in `scripts/quant/build-setup-outcomes.mjs` nur im Speicher und werden nicht exportiert. Das Zertifizierungsgate sieht deshalb nur die Anzahl abgeschlossener M6-Ergebnisse.

## 4. Wie der Auswerter arbeitet

`evaluateSetupOos({ rows, completedCount, minPerSegment, segmentation })` → `{ schemaVersion, status: PASS|FAIL, reasonCode, minPerSegment, completed, segmentation, purged, segments: { cutDate, train, test } | null }`, je Segment `{ n, nAll, from, to, metric }`.

Reihenfolge der Entscheidung (die erste zutreffende Zeile gewinnt):

| Bedingung | Status | `reasonCode` |
|---|---|---|
| `minPerSegment` keine positive ganze Zahl | FAIL | `OOS_MIN_PER_SEGMENT_INVALID` |
| abgeschlossene Ergebnisse < 2 × `minPerSegment` | FAIL | `OOS_NOT_MEASURABLE_YET` (**heute**) |
| keine Segmentdefinition | FAIL | `OOS_SEGMENT_DEFINITION_MISSING` |
| Segmentdefinition unvollständig/unbekannt | FAIL | `OOS_SEGMENT_DEFINITION_INVALID` |
| keine Ereigniszeilen (`rows: null`) | FAIL | `OOS_ROWS_NOT_EXPORTED` |
| ein Segment nach Embargo < `minPerSegment` | FAIL | `OOS_SEGMENT_TOO_SMALL` |
| Kriterium nicht in beiden Segmenten erfüllt | FAIL | `OOS_DIRECTION_NOT_REPLICATED` |
| sonst | PASS | `null` |

Die Segmentdefinition hat die Form

```json
{ "id": "…", "method": "CHRONOLOGICAL_MEDIAN_EVENT_DATE" | "FIXED_CALENDAR_CUT",
  "cutDate": "YYYY-MM-DD (nur FIXED_CALENDAR_CUT)", "embargoDays": 0…3660,
  "criterion": { "metric": "MEDIAN_EXCESS" | "MEDIAN_NET", "rule": "POSITIVE_IN_BOTH" | "SIGN_REPLICATES" } }
```

- Testsegment: Ereignisse mit `date ≥ cutDate`; Lernsegment: `date < cutDate` und `date + embargoDays < cutDate`.
- `MEDIAN_EXCESS`: Median von `net − b.median` (Marktbasis desselben Einstiegstags); Zeilen ohne Marktbasis zählen dort nicht zu `n`.
- `POSITIVE_IN_BOTH`: Kennzahl > 0 in beiden Segmenten. `SIGN_REPLICATES`: gleiches, von null verschiedenes Vorzeichen.

**Woher die Segmentdefinition kommt.** Im Betrieb ausschließlich über `segmentationFromMethodology(M)`: das Feld `kinds.SETUP_BACKTEST.oosSegmentation` im Zertifizierungsvertrag, und nur mit `approval.approvedBy` (nicht leer) und `approval.approvedAt` (Datum). **Dieses Feld existiert heute nicht und wurde nicht angelegt**; der Name ist ein Vorschlag. Solange es fehlt, liefert die Funktion `null`, und das Gate bleibt FAIL. Tests übergeben Segmentierungen direkt.

**Einbindung.** `scripts/quant/build-backtest-certification.mjs` ruft den Auswerter mit `rows: null`, `completedCount: completedM6`, `minPerSegment: 30` und der (heute leeren) Methodik-Segmentierung auf. Für den heutigen Stand ist das Ergebnis `OOS_NOT_MEASURABLE_YET` mit dem bisherigen Klartext; das erzeugte Zertifizierungsartefakt ist bis auf den Zeitstempel `generatedAt` byteidentisch (Vorher/Nachher-Lauf am 2026-10-29, 49.997 Byte). Sobald 60 M6-Ergebnisse vorliegen, wechselt der Grund ohne Owner-Entscheidung auf `OOS_SEGMENT_DEFINITION_MISSING`, nicht auf PASS.

Unabhängige Gegenrechnung: `scripts/quant/verify-setup-oos.py` (nur Standardbibliothek, `python3 -I`), aufgerufen aus `quant/tests/setup-oos.test.mjs` für jede Fixture.

## 5. Zulässige Segmentierungen (Optionen für den Owner)

Für alle Optionen gilt: Die Schnittregel muss **vor** dem Ansehen der M6-Ergebnisse festgelegt werden. Ergebnisse, die schon angesehen wurden, können später nicht als „unberührt“ gelten. Das Embargo sollte mindestens den Horizont abdecken (M6 = 126 Handelstage, rund 183 Kalendertage). Sonst überlappen die Ergebnisfenster von Lern- und Testereignissen, und ein gemeinsamer Marktschub zählt in beiden Segmenten.

| Option | Regel | Vorteile | Nachteile |
|---|---|---|---|
| **A. Chronologischer Schnitt am Median-Ereignisdatum** (`CHRONOLOGICAL_MEDIAN_EVENT_DATE`, implementiert) | Schnitt am Datum des Median-Ereignisses; Lernen davor, Testen ab diesem Tag | keine frei wählbare Zahl; passt sich der Datenmenge an; beide Segmente annähernd gleich groß | der Schnitt wandert mit jedem neuen Ereignis, und frühere Testereignisse werden später zu Lernereignissen. Ein einmal angesehener Test ist damit nicht mehr unberührt. Bei stark geclusterten Ereignistagen (heute 21 Tage) kann ein Segment sehr klein werden. Mit Embargo ≥ Horizont fällt ein großer Teil der Lernzeilen weg |
| **B. Fester Kalenderschnitt** (`FIXED_CALENDAR_CUT`, implementiert) | ein vorab festgelegtes Datum, z. B. das Datum der Freigabe; Testen = alles danach | echter Holdout: Der Testzeitraum liegt nach der Festlegung und wird erst später sichtbar; einfach prüfbar | das Datum ist eine normative Wahl. Bis genug Testereignisse M6-reif sind, dauert es mindestens Horizont plus Sammelzeit. Ein ungünstiges Datum (Regimewechsel) prägt das Ergebnis |
| **C. Rollierender Ursprung / Walk-Forward** (nicht im Auswerter, `OOS_SEGMENT_DEFINITION_INVALID`) | mehrere aufeinanderfolgende Schnitte; jeder Fold lernt auf der Vergangenheit und testet den nächsten Block | nutzt alle Daten, zeigt die Stabilität über die Zeit; der archivierte Vorschlag verlangt mindestens 4 Folds | braucht weit mehr Historie (4 Folds × 30 Ergebnisse je Testblock plus Embargo je Fold). Sollte die bestehende Mechanik `quant/engines/research-validation.cjs#buildWalkForward` (Purge/Embargo) nutzen statt einer neuen. Die Aggregationsregel über Folds (alle, Mehrheit, Median) ist eine weitere Owner-Entscheidung |

Fachliche Einschätzung, keine Entscheidung: B mit einem Schnitt zum Zeitpunkt der Freigabe ist die einzige Option, die „nicht angesehen“ wörtlich erfüllt. A ist reproduzierbar, aber nur als einmal eingefrorener Schnitt sinnvoll.

## 6. Offene Owner-Entscheidungen

1. **Segmentdefinition**: Option A, B oder C. Bei B das Schnittdatum, bei C Foldanzahl, Blockgröße und Aggregation.
2. **Embargo**: `embargoDays` (Vorschlag aus dem archivierten Entwurf: mindestens längster Horizont plus Abkühlung, also ≥ 183 Kalendertage für M6).
3. **Erfolgskriterium**: Kennzahl (`MEDIAN_EXCESS` gegen die Marktbasis desselben Tages oder `MEDIAN_NET`) und Regel (`POSITIVE_IN_BOTH`: Richtung gehalten, oder `SIGN_REPLICATES`: Vorzeichen repliziert, auch negativ). Das Label `OOS_DIRECTIONAL_REPLICATION` darf nicht als wirtschaftlicher Vorteil gelesen werden.
4. **Grundgesamtheit**: Ereignisart (SETUP_NEW, SETUP_CONFIRMED oder beide getrennt), Einstiegsvariante (NEXT_CLOSE als Standard) und Horizont (M6, passend zu `completedOutcomesM6`).
5. **Mindestgröße je Segment**: bereits entschieden, `oosMinPerSegment: 30`. Ob sie für rohe oder für effektive (geclusterte) Fallzahlen gilt, ist offen; der Auswerter zählt heute rohe Zeilen.
6. **Export der Ereigniszeilen**: Ohne Export bleibt das Gate nach einer Freigabe bei `OOS_ROWS_NOT_EXPORTED`. Vorschlag: eine versionierte, separate Ausgabe von `build-setup-outcomes.mjs` (z. B. `--oos-rows-out <datei>`, Schema `setup-oos-rows-1.0.0`, Zeilen `{date, net, b}` je Ereignisart/Variante/Horizont). Das bestehende Produktartefakt `setup-outcomes-v1.json` bleibt dabei unverändert. Nicht umgesetzt, weil der Builder Kurse zur Laufzeit braucht und die Ausgabe einen eigenen Konsumentenvertrag verlangt.

Die Umsetzung einer Freigabe ist ein eigener PR mit Vorher/Nachher: Feld `oosSegmentation` mit `approval` in `quant/methodology/backtest-certification-v1.json` (Versionssprung), dazu gegebenenfalls der Zeilenexport. Der Auswerter selbst muss dafür nicht geändert werden.

## 7. Nebenbefund: Paritätstext

`build-backtest-certification.mjs` gab die Replay-Parität als `checked/checked` aus und zeigte damit auch bei Abweichungen immer volle Übereinstimmung. Korrigiert auf `(checked − mismatches)/checked`. Heute gilt `mismatches = 0`, der Text bleibt `3327/3327` und das Artefakt unverändert. Bei einer künftigen Abweichung zeigt der nächste Erzeugerlauf die echte Zahl (Anzeige in `quant/app/page-backtest.js`: „Nachgeprüft: X/Y …“). `scripts/quant/measure-backtest-signal-intelligence.mjs` hat dasselbe Muster (Messbericht, kein Produktartefakt) und ist hier nicht geändert.

## 8. Konsistenzprüfung und technische Vorarbeit (31.10.2026)

Arbeitsgrundlage des Owners vom 31.10. (keine Norm): Schnitt 2027-05-31, Embargo 183 Tage, SETUP_NEW und SETUP_CONFIRMED getrennt, Clusterung nach Ereignistagen, MEDIAN_EXCESS mit SIGN_REPLICATES. Ausführliche Vorlage: `docs/quant/SETUP_OOS_DECISION_A1_A6.md`.

**Konsistenz mit dem Vertrag**

| Punkt | Vertrag bzw. archivierter Vorschlag | Arbeitsgrundlage | Ergebnis |
|---|---|---|---|
| Mindestgröße je Segment | `oosMinPerSegment` 30, Zählbasis nicht festgelegt | 30 effektive Ereignistage | konsistent. Die Zählbasis wird Teil der freigegebenen Segmentierung (`countBy`), die Schwelle bleibt |
| Holdout | „not viewed during rule selection“ | fester Kalenderschnitt, vorab freigegeben | konsistent, wenn die Freigabe vor dem ersten M6-Ergebnis (etwa 2027-03-26) erfolgt |
| Embargo | mindestens längster Horizont | 183 Kalendertage (M6) | konsistent |
| Kriterium | `OOS_DIRECTIONAL_REPLICATION`, kein wirtschaftlicher Vorteil | SIGN_REPLICATES auf MEDIAN_EXCESS | konsistent |
| Ereignisarten | nicht festgelegt | getrennt | braucht eine Anpassung des Zertifizierungs-Builders: je Art auswerten, Gate besteht nur bei allen freigegebenen Arten. Das ist eine normative Entscheidung, deshalb nicht umgesetzt |
| andere Gates | `completedOutcomesM6` 100, `historyDates` 120, `historySpanDays` 180, `titles` 20, `independentWeeks` 20, Owner-Freigabe | unverändert | keine Wirkung |

**Umgesetzt, ohne normative Wirkung**
- **A5:** Die Segmentierung kennt das optionale Feld `countBy` (`ROWS` als Standard wie bisher, oder `EVENT_DAY`). Bei `EVENT_DAY` zählt `n` verschiedene Ereignistage, `nRows` steht daneben; die Kennzahl bleibt der Median über alle Zeilen. Die Python-Gegenrechnung (`verify-setup-oos.py`) rechnet beides mit.
- **A6:** `build-setup-outcomes.mjs --oos-rows-out <datei>` schreibt die abgeschlossenen Ereigniszeilen `{date, net, b}` je Ereignisart, Variante und Horizont (Schema `setup-oos-rows-1.0.0`). Ziele unter `quant/data` werden verweigert. Neu ist außerdem `--out` für Tests.
- **Vorher/Nachher:** `setup-outcomes-v1.json` und `backtest-certification-v1.json` sind mit altem und neuem Code identisch (ohne `generatedAt`). Die Segmentierung in der Methodik fehlt weiter, das Gate meldet unverändert `OOS_NOT_MEASURABLE_YET`.

**Zur Fachentscheidung (kompakt):** Nach der Freigabe wird in `quant/methodology/backtest-certification-v1.json` (Versionssprung) eingetragen:

```json
"oosSegmentation": { "id": "setup-oos-2027-05-31", "method": "FIXED_CALENDAR_CUT", "cutDate": "2027-05-31", "embargoDays": 183,
  "countBy": "EVENT_DAY", "criterion": { "metric": "MEDIAN_EXCESS", "rule": "SIGN_REPLICATES" },
  "approval": { "approvedBy": "<Owner>", "approvedAt": "<Datum>" } }
```

Dazu kommen die Auswertung je Ereignisart im Zertifizierungs-Builder und der Zeilenexport im Materialisierungslauf, jeweils als eigener PR mit Vorher/Nachher.
