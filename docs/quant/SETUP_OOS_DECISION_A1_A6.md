# Setup-OOS: Entscheidungsvorlage A1–A6 (Stand 30.10.2026)

Diese Vorlage ergänzt [DECISIONS_SETUP_OOS_STRATEGY_FACTOR.md](DECISIONS_SETUP_OOS_STRATEGY_FACTOR.md), Abschnitt A, und [SETUP_OOS_EVALUATION.md](SETUP_OOS_EVALUATION.md). Sie ändert nichts automatisch und zertifiziert nichts.

Die Gates und ihre Schwellen bleiben unverändert (`quant/methodology/backtest-certification-v1.json`, `kinds.SETUP_BACKTEST.requirements`):
- `historyDates` 120
- `historySpanDays` 180
- `completedOutcomesM6` 100
- `titles` 20
- `independentWeeks` 20
- `oosMinPerSegment` 30

Hinzu kommt die Owner-Freigabe in `setup-state-v1.json`.

## 0. Ausgangslage

| Größe | Stand 30.10.2026 |
|---|---|
| veröffentlichte Stichtage / Spanne | 23 / 49 Tage (Gate 120 / 180) |
| Ereignisse | seit 2026-09-24. SETUP_NEW rund 90 je Ereignistag, SETUP_CONFIRMED rund 7–8 je Ereignistag |
| abgeschlossene M6-Ergebnisse | 0 (Gate 100); das erste ist etwa am 2027-03-26 fällig |
| OOS-Auswerter | `setup-oos-1.0.0`, liefert heute `FAIL/OOS_NOT_MEASURABLE_YET`. Er kennt nur `CHRONOLOGICAL_MEDIAN_EVENT_DATE` und `FIXED_CALENDAR_CUT`, zählt **rohe** Zeilen und liest die Segmentierung nur aus `kinds.SETUP_BACKTEST.oosSegmentation` mit `approval` |
| Ereigniszeilen | werden nicht exportiert. Nach einer Freigabe stünde das Gate deshalb auf `OOS_ROWS_NOT_EXPORTED` |

## 1. Wichtige Korrektur zur bisherigen Empfehlung

Die frühere Empfehlung war ein fester Schnitt am **2027-03-31** mit **183 Tagen Embargo**. Das ist mit den vorhandenen Daten **praktisch nicht messbar**:

- Der Auswerter nimmt in das Lernsegment nur Ereignisse mit `Datum + Embargo < Schnitt`, also Ereignisse vor dem 2026-09-29.
- Ereignisse gibt es erst seit dem 2026-09-24. Das Lernsegment hätte damit **3 Ereignistage**.
- Roh wären das genug Zeilen (rund 270 SETUP_NEW). Effektiv sind es aber nur 3 unabhängige Stichtage (siehe A5).

Durchgerechnet für SETUP_NEW, unter der Annahme von einem Ereignistag je Handelstag (Wochentage ohne Feiertage, also eine leichte Überschätzung):

| Schnitt (A1) | Lernsegment nach 183 Tagen Embargo | Erste M6 im Testsegment | 30 Test-Ereignistage M6-reif |
|---|---|---|---|
| 2027-03-31 | 2026-09-24 bis 09-28: **3 Tage** | 2027-09-30 | 2027-11-10 |
| 2027-04-30 | bis 2026-10-28: 25 Tage (< 30) | 2027-10-30 | 2027-12-10 |
| **2027-05-31** | bis 2026-11-28: **47 Tage** | 2027-11-30 | **2028-01-08** |
| 2027-06-30 | bis 2026-12-28: 68 Tage | 2027-12-30 | 2028-02-09 |
| 2027-09-30 | bis 2027-03-30: 134 Tage | 2028-03-31 | 2028-05-11 |

Bei SETUP_CONFIRMED (rund 7–8 Ereignisse je Tag) gelten dieselben Daten, sofern effektiv nach Ereignistag gezählt wird. Bei roher Zählung reichen dort schon etwa 4–5 Ereignistage je Segment.

## 2. Entscheidungen

### A1 Segmentierung

| Option | Fachliche Wirkung | Daten | Gate |
|---|---|---|---|
| (a) Median-Ereignisdatum | Der Schnitt wandert mit jedem neuen Ereignis. Frühere Testereignisse werden Lernereignisse; ein unberührter Holdout ist das nicht | sofort rechenbar, sobald 60 M6 vorliegen | sinnvoll nur, wenn der Schnitt einmal eingefroren wird |
| (b) **Fester Kalenderschnitt** | echter Holdout: Der Testzeitraum liegt nach der Festlegung | siehe Tabelle 1 | `FIXED_CALENDAR_CUT`, `cutDate` |
| (c) Walk-Forward | zeigt Stabilität über mehrere Folds | mindestens 4 Folds × 30 effektive Fälle plus Embargo, frühestens etwa 2029 | nicht im Auswerter; braucht eine Engine-Erweiterung (eigener PR mit Vorher/Nachher) |

**Empfehlung: (b) mit `cutDate` 2027-05-31.** Das ist der früheste Schnitt, bei dem beide Segmente nach dem Embargo mindestens 30 effektive Ereignistage haben. Gemessen werden kann frühestens um den 2028-01-08.

Der Schnitt muss **vor** jeder Einsicht in M6-Ergebnisse freigegeben werden. Das ist spätestens bis zum ersten M6-Ergebnis (etwa 2027-03-26) möglich, besser sofort.

### A2 Embargo

| Option | Wirkung |
|---|---|
| 0 Tage | Die Ergebnisfenster von Lern- und Testereignissen überlappen bis zu 6 Monate. Ein gemeinsamer Marktschub zählt dann doppelt; der Test ist nicht unabhängig |
| 126 Tage | deckt nur die Handelstage ab; ein Rest an Überlappung bleibt |
| **183 Tage** | deckt den M6-Horizont in Kalendertagen ab |

**Empfehlung: 183 Tage.** Damit verschiebt sich der früheste sinnvolle Schnitt auf den 2027-05-31 (siehe A1).

### A3 Erfolgskriterium

| Kennzahl | Regel | Bedeutung |
|---|---|---|
| **MEDIAN_EXCESS** | **SIGN_REPLICATES** | Das Vorzeichen des medianen Überschusses gegen die Marktbasis desselben Einstiegstags wiederholt sich; auch ein negatives Vorzeichen gilt als repliziert |
| MEDIAN_EXCESS | POSITIVE_IN_BOTH | strenger: in beiden Segmenten positiv. Das kommt einer Vorteilsbehauptung nahe |
| MEDIAN_NET | … | ohne Marktbereinigung; Marktphasen dominieren |

**Empfehlung: MEDIAN_EXCESS + SIGN_REPLICATES.** Das Gate-Label lautet dann `OOS_DIRECTIONAL_REPLICATION` und bedeutet **keinen** wirtschaftlichen Vorteil. Die Produkttexte dürfen daraus kein Alpha ableiten. Die Regel aus dem Ergebnisvertrag (Holm) bleibt bestehen.

### A4 Grundgesamtheit

**Empfehlung:** SETUP_NEW und SETUP_CONFIRMED **getrennt** auswerten, jeweils mit Einstieg NEXT_CLOSE und Horizont M6. SETUP_WEAKENED bleibt außen vor, weil es kein Einstiegssignal ist.

Das Gate besteht nur, wenn jede freigegebene Ereignisart für sich besteht. Gibt es zu wenige Fälle, bleibt die Art `OOS_SEGMENT_TOO_SMALL`.

Datenwirkung: SETUP_CONFIRMED erreicht 30 rohe Fälle je Segment schnell, 30 effektive Ereignistage aber erst wie in Tabelle 1.

### A5 Mindestgröße 30: roh oder effektiv

| Option | Wirkung | Umsetzung |
|---|---|---|
| roh (heute) | Rund 90 SETUP_NEW-Ereignisse an einem Tag würden das Minimum allein erfüllen. Sie sind stark querschnittlich korreliert (gleicher Markttag); die 30 täuschen Unabhängigkeit vor | keine Änderung |
| **effektiv** | Ein Cluster ist ein Ereignistag (konservativ, passend zur V10-Unabhängigkeitsanalyse und zum Gate `independentWeeks`) | **Engine-Änderung** im Auswerter (`setup-oos.cjs`): Zählung je Cluster. Eigener PR mit Vorher/Nachher und Python-Gegenrechnung (`verify-setup-oos.py`); die Schwelle 30 bleibt |

**Empfehlung: effektiv, Cluster = Ereignistag.** Tabelle 1 setzt das voraus.

### A6 Export der Ereigniszeilen

**Empfehlung:** eine getrennte Ausgabe `build-setup-outcomes.mjs --oos-rows-out <datei>` (Schema `setup-oos-rows-1.0.0`, Zeilen `{date, net, b}` je Ereignisart, Variante und Horizont).
- Ablage nicht unter `quant/data/product` und ohne Anzeige.
- Das Produktartefakt `setup-outcomes-v1.json` bleibt byte-gleich.
- Ohne Export bleibt das Gate nach der Freigabe bei `OOS_ROWS_NOT_EXPORTED`.

## 3. Wirkung auf die Gates (ohne Schwellenänderung)

| Gate | heute | mit Freigabe A1–A6, Schnitt 2027-05-31 |
|---|---|---|
| `oos` | FAIL `OOS_NOT_MEASURABLE_YET` | bis etwa 2027-11: `OOS_NOT_MEASURABLE_YET` bzw. `OOS_SEGMENT_TOO_SMALL`; ab etwa 2028-01-08 messbar (PASS oder `OOS_DIRECTION_NOT_REPLICATED`) |
| `completedOutcomesM6` ≥ 100 | 0 | etwa Anfang April 2027 (rund 90 SETUP_NEW je Tag ab 2027-03-26) |
| `historyDates` ≥ 120, `historySpanDays` ≥ 180 | 23 / 49 | etwa 2027-03 (bei täglicher Veröffentlichung) |
| `independentWeeks` ≥ 20 | 2 | wächst wöchentlich |
| Owner-Freigabe `setup-state-v1.json` | NOT_CERTIFIED | unverändert. Eine Zertifizierung bleibt eine eigene Owner-Entscheidung, auch wenn alle Gates PASS zeigen |

Frühestens um den 2028-01-08 kann SETUP_BACKTEST technisch alle Gates erfüllen. Ein PASS heißt dann nur „Richtung repliziert“.

## 4. Umsetzung nach Freigabe (je eigener PR)

1. Methodik: Feld `kinds.SETUP_BACKTEST.oosSegmentation`, z. B. `{ "id": "setup-oos-2027-05-31", "method": "FIXED_CALENDAR_CUT", "cutDate": "2027-05-31", "embargoDays": 183, "criterion": { "metric": "MEDIAN_EXCESS", "rule": "SIGN_REPLICATES" }, "approval": { "approvedBy": "<Owner>", "approvedAt": "<Datum>" } }`. Dazu ein Versionssprung und der Vorher/Nachher-Vergleich des Zertifizierungsartefakts.
2. A5: Zählung effektiver Fälle im Auswerter, mit Tests und Python-Gegenrechnung.
3. A6: Zeilenexport mit Test, dass `setup-outcomes-v1.json` byte-gleich bleibt.
4. A4: Auswertung je Ereignisart im Zertifizierungs-Builder.

## 5. Zur Entscheidung vorgelegt

A1 (b) Schnitt **2027-05-31** · A2 **183 Tage** · A3 **MEDIAN_EXCESS + SIGN_REPLICATES** · A4 **SETUP_NEW und SETUP_CONFIRMED getrennt, NEXT_CLOSE, M6** · A5 **effektiv, Cluster = Ereignistag** · A6 **getrennter Zeilenexport**.
