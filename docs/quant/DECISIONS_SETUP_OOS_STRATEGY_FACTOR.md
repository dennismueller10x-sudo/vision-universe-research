# Entscheidungsvorlage: Setup-OOS, Strategy- und Factor-Artefakte (Stand 30.10.2026)

Es gibt keine Normänderung. Die OOS- und Zertifizierungsgates bleiben, wie sie sind (`quant/methodology/backtest-certification-v1.json`, `scripts/quant/build-backtest-certification.mjs`). Das Setup-OOS-Gate meldet heute FAIL/`OOS_NOT_MEASURABLE_YET`. Technische Grundlage: [SETUP_OOS_EVALUATION.md](SETUP_OOS_EVALUATION.md), `quant/engines/setup-oos.cjs`.

Jede Entscheidung unten wird erst wirksam, wenn der Owner sie ausdrücklich freigibt. Umgesetzt wird sie dann in einem eigenen PR mit Vorher/Nachher-Vergleich.

## A. Setup-OOS

Vertrag: `oosMinPerSegment = 30` je Segment. Was fehlt, ist die Definition der Segmente. Datenlage: 22 veröffentlichte Stichtage über 48 Tage, 0 abgeschlossene M6-Ergebnisse. Die ersten M6-Ergebnisse sind etwa Ende März 2027 fällig.

| Nr. | Frage | Optionen | Empfehlung |
|---|---|---|---|
| A1 | Segmentierung | (a) Schnitt am Median der Ereignisdaten, (b) **fester Kalenderschnitt**, vor der Auswertung eingefroren, (c) Walk-Forward über `research-validation.buildWalkForward` | **(b)**: Nur sie erfüllt „nicht angesehen“ wörtlich. Schnittdatum vorab festlegen, z. B. 2027-03-31; Testsegment = Ereignisse danach |
| A2 | Embargo zwischen Lern- und Testsegment | 0 / 126 / **183 Tage** | **183 Tage**, die M6-Horizontlänge; überlappende Ausgänge fallen weg |
| A3 | Erfolgskriterium | MEDIAN_EXCESS oder MEDIAN_NET; POSITIVE_IN_BOTH oder SIGN_REPLICATES | **MEDIAN_EXCESS + SIGN_REPLICATES** (Richtung hält), wie die Pattern-OOS-Sprache |
| A4 | Grundgesamtheit | je Ereignisart (SETUP_NEW, SETUP_CONFIRMED) · Einstieg NEXT_CLOSE · Horizont M6 | getrennt je Ereignisart, NEXT_CLOSE, M6 |
| A5 | Mindestgröße 30 | roh oder effektiv (N_eff bei Clusterung) | **effektiv** (N_eff), konsistent mit der V10-Unabhängigkeitsanalyse |
| A6 | Export der Ereigniszeilen | nicht exportieren / getrennte Ausgabe `--oos-rows-out` (Schema `setup-oos-rows-1.0.0`) | getrennte Ausgabe, kein Produktartefakt |

Ablage nach Freigabe: Feld `kinds.SETUP_BACKTEST.oosSegmentation` mit `approval.approvedBy` und `approval.approvedAt` in der Methodik. Nur dieses Feld liest `segmentationFromMethodology` heute; es fehlt bewusst.

## B. Strategy-Backtest (historisches Artefakt)

| Nr. | Frage | Optionen | Empfehlung |
|---|---|---|---|
| B1 | Research-Artefakt `strategy-backtest-research-v1` aus dem Runner (feste Gewichte; Profil-Strategie bleibt B) | ja (nur Research, nicht angezeigt) / nein | **ja**, unter `docs/` oder privat, nicht in `quant/data` |
| B2 | Produktartefakt `strategy-backtest-v1` | jetzt / sobald Membership- und Faktorhistorie das Gate erfüllen (≥ 24 Monate, frühestens ~2028-08) | **warten**; der Vertrag schließt Rekonstruktion als Ersatz aus (`historicalStudyCanReplace=false`) |
| B3 | Gesamtrendite | Kursrendite markieren / TR nur für TR-Register-Titel | markieren; TR nur, wo belegt |

## C. Factor-Ranking-Backtest

| Nr. | Frage | Optionen | Empfehlung |
|---|---|---|---|
| C1 | Rekonstruierter Research-Scope (PIT-Panel V10, Rang-IC und Quintile, keine Renditeaussage) | ja / nein | **ja**, als `RECONSTRUCTION` ohne Wirkung auf Verträge |
| C2 | Produktartefakt | jetzt / nach 24 Faktor-Snapshot-Monaten und 12 abgeschlossenen Forward-Monaten (frühestens 2028-01/08) | **warten** |
| C3 | Ablage des privaten PIT-Panels (124 MB) | in das Archiv aufnehmen / neu bauen bei Bedarf | **erledigt**: Teil `v10-factor-panel` von Archiv 1.2.0 (lokal wiederhergestellt; Upload wartet auf den R2-Zugang) |

## D. Was ausdrücklich unverändert bleibt

Diese Punkte gelten ohne neue Entscheidung weiter:
- `oosMinPerSegment` und die übrigen Schwellen;
- die Setup-Unabhängigkeitsnorm;
- `productionApproved=false`;
- die Owner-Freigabepflicht für SETUP (`setup-state-contract.js`);
- keine Anzeige von Research-Zahlen im Produkt.
