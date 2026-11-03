# Supertrader – PIT-Branchengruppen je Wertpapier (FP-ST-03)

Stand: 03.11.2026. Paket: FP-ST-03 aus `docs/MASTER_COMPLETION_3_0.md` §3 und `docs/SUPERTRADER_13_METHODS_EVIDENCE.md` §10.
Status: **Datenquelle, Lader und Tests gebaut. Keine Strategie liest sie.** `TUR-SF-LIMIT-CORR` und `WEIN-SF-GROUP` bleiben `DATA_BLOCKED`, bis der Owner über E7-5 (Revision von E4) entschieden hat.

## Was jetzt geht, was vorher fehlte

| vorher | jetzt |
|---|---|
| PIT-SIC je **Emittent** (CIK) in `quant/data/sec/sic-history`, Abfrage `core/industry-classification.js` (#811) | PIT-SIC je **Wertpapier**: `sicAt(securityId, date)`; `securityId` nur aus `core/identity.js#securityIdForTicker` |
| Identität im Adapter nur über die Snapshot-Segmente (`sec-pit`) | Kandidaten aus dem Wertpapierstamm mit Fenster `firstTradeDate`–`delistedAt` und Evidenzklasse; zusätzliche Kandidaten (z. B. Snapshot `sec-pit`) per `--identity` |
| Gruppen nur als SIC2/SIC3/SIC4 | zusätzlich **Fama-French-49**, gepinnt auf `Siccodes49.txt` (SHA-256 `5d0c29b0…c24827f`) |
| Gültigkeit nur als „letzte Beobachtung“ | Intervalle je Emittent mit `validFrom`/`validTo`, Beginn als `FIRST_OBSERVATION` oder `OBSERVED_CHANGE`, Wechselfenster (`priorLastObservedAt`) |
| keine Gegenprobe an der Quelle | `edgar_sample.py`: Stichprobe direkt aus Filing-Headern (≤ 50 Emittenten), Abgleich mit der Basis |

## Dateien

| Datei | Rolle |
|---|---|
| `scripts/supertrader/source-faithful/groups/pit-sic-groups.mjs` | reine Funktionen: `deriveIntervals`, `identityFromInstruments`, `buildDataset`, `createPitSicSource` (`sicAt`, `groupKeyAt`, `history`, `coverage`) |
| `scripts/supertrader/source-faithful/groups/build-pit-sic-groups.mjs` | Erzeuger, offline, schreibt nur nach `--out` |
| `scripts/supertrader/source-faithful/groups/ff49.mjs`, `ff49-siccodes.json` | FF49-Parser und gepinnte Tabelle (49 Branchen, 598 Bereiche, überlappungsfrei geprüft) |
| `scripts/supertrader/source-faithful/groups/edgar_sample.py` | EDGAR-Stichprobe; Header-Auswertung unverändert aus `scripts/quant/sec/sic_history.py` (`parse_header`, `_issuer_record`) |
| `scripts/supertrader/tests/sf-pit-sic-groups.test.mjs`, `test_sf_pit_sic_edgar_sample.py`, `fixtures/pit-sic/` | Tests ohne Netz |

## Regeln (point in time)

1. Ein Intervall gilt ab dem ersten `knownAt` seines Zustands bis ausschließlich zum ersten `knownAt` eines anderen Zustands. `validTo` ist Rückblick. `sicAt` gibt es nie heraus.
2. **Vor der ersten Beobachtung ist die SIC unbekannt** (`UNKNOWN_BEFORE_FIRST_OBSERVATION`). Die heutige SIC aus `data.sec.gov/submissions` wird nie zurückdatiert. Die Stichprobe weist sie nur als `currentSicNotPit` aus.
3. Der wahre Wechselzeitpunkt ist nicht öffentlich belegt (`trueStartKnown: false`). Er liegt im Fenster (`priorLastObservedAt`, `validFrom`].
4. Ein Datum als `asOf` endet um 16:00 America/New_York. Ein Filing nach Handelsschluss zählt ab dem nächsten Datum.
5. Die Fortschreibung seit der letzten Beobachtung ist eine Annahme. `sicAt` meldet ihr Alter. `groupKeyAt` verlangt `maxAgeDays` und `assumptionRef` und wirft sonst `MODEL_ASSUMPTION_REQUIRED`.
6. Ein SIC-Code außerhalb der 49 Bereiche ist `UNMAPPED`. Er wird nicht still der Branche 49 „Other“ zugeschlagen.
7. Eine fehlende Gruppe heißt unbekannt, nicht unabhängig.

Getestet: `sicAt` antwortet auf der Fixtur und auf echten SEC-Scherben (Apple, Amazon, Meta) über alle Monatsenden 2008–2026 wie `core/industry-classification.js`, und zwar in Status, SIC, `knownAt` und Alter. Das Ergebnis zu *t* ist gleich dem Ergebnis auf dem bei *t* abgeschnittenen Datensatz.

## Aufruf

```bash
# Vollbestand (Produktuniversum, ~5 s, kein Netz)
node scripts/supertrader/source-faithful/groups/build-pit-sic-groups.mjs --out /tmp/pit-sic-groups.json.gz --report /tmp/report.json

# Stichprobe an der Quelle (Netz, ≤ 50 Emittenten, ≤ 4 Abrufe/s, harte Obergrenze --budget)
python3 scripts/supertrader/source-faithful/groups/edgar_sample.py --instruments-sample 44 --out /tmp/edgar-sample.json
node scripts/supertrader/source-faithful/groups/build-pit-sic-groups.mjs --sic-issuers /tmp/edgar-sample.json --out /tmp/groups-edgar.json
```

User-Agent der Stichprobe: `VisionUniverseResearch research-bot` (Umgebungsvariable `SEC_RESEARCH_USER_AGENT`). Die Projektvorgabe lautet: keine E-Mail-Adresse.

Ein neuer Workflow ist nicht nötig. Die SIC-Basis hat ihren eigenen, manuellen Workflow (`.github/workflows/sec-sic-history.yml`). Dieser Erzeuger rechnet offline daraus und schreibt kein committetes Artefakt.

## Coverage (Messung vom 03.11.2026)

**Vollbestand:** Produktuniversum, Monatsenden 2016-01 bis 2026-10, nur Tage im Identitätsfenster, keine Altersgrenze.

| Kennzahl | Wert |
|---|---|
| Wertpapiere mit CIK / ohne CIK (`NO_CIK`) | 6.455 / 1.348 |
| CIKs / davon mit SIC-Beobachtungen | 5.481 / 5.478 |
| Intervalle / beobachtete Zustandswechsel | 6.539 / 1.061 |
| Punkte | 553.650 |
| `OBSERVED` | 529.675 (95,67 %) |
| `UNKNOWN_BEFORE_FIRST_OBSERVATION` | 12.803 (2,31 %) |
| `NO_SIC_ASSIGNED` | 10.845 (1,96 %) |
| `UNKNOWN_NO_OBSERVATIONS` | 327 (0,06 %) |
| beobachtet und FF49-zugeordnet / `UNMAPPED` | 527.092 / 2.583 |

Gruppengröße (Altersgrenze 400 Tage, nur als Messannahme):

| Stichtag | Schema | Gruppen | Mitglieder | Median | größte | Gruppen < 5 |
|---|---|---|---|---|---|---|
| 2018-06-29 | FF49 | 49 | 3.091 | 40 | 306 (Drugs) | 1 |
| 2018-06-29 | SIC3 | 249 | 3.108 | 5 | 306 (283) | 119 |
| 2024-06-28 | FF49 | 49 | 4.857 | 58 | 648 (Drugs) | 0 |
| 2024-06-28 | SIC3 | 253 | 4.879 | 6 | 648 (283) | 88 |

**EDGAR-Stichprobe:** 49 Emittenten, 55 Wertpapiere, 331 Abrufe (49 Submissions, 282 Header), 2 Header nicht lesbar, Budget nicht überschritten.
- 280 Header-Beobachtungen; davon 83 Accessions auch in der Basis:
  - 82 mit gleicher SIC;
  - der `knownAt` der Basis liegt 0 bis 89 s **später** als der Header (FSDS auf die Minute, konservativ gerundet), nie früher;
  - 1 Abweichung: Ein Header ohne `ASSIGNED-SIC` (2021, CIK 1855509) steht gegen FSDS 3730.
- Monatsenden mit Beobachtung in beiden Quellen: 4.245. Davon stimmen 4.237 in SIC und FF49 überein (99,8 %).
  - Die 8 Abweichungen betreffen einen Emittenten (CIK 1790169). Die Stichprobe hat nur 6 Header je Emittent gelesen und den Zwischenzustand 5122 (2026-02 bis 2026-07) übersprungen.
  - Die heutige SIC dieses Emittenten ist 6199 (Header vom 02.11.2026). Hätte man sie rückdatiert, wären beide früheren Zustände (2834, 5122) falsch gewesen.
- Bei 7 von 49 Emittenten weicht die heutige SIC von der ersten gelesenen Header-SIC ab.
- Die Stichprobe allein deckt 82,0 % der Punkte, die Basis 95,7 %. Die Lücke ist `UNKNOWN_BEFORE_FIRST_OBSERVATION`, weil die erste `recent`-Seite nicht weit genug zurückreicht. Für den Bestand bleibt die Basis die Quelle; die Stichprobe dient der Gegenprobe.

## Grenzen

- **Identität:** Die Brücke Ticker → CIK ist die heutige SEC-Zuordnung, angenommen ab `firstTradeDate` (`CURRENT_TICKER_MAPPING_ASSUMED_SINCE_FIRST_TRADE`). Die SEC führt keine historische Tickerliste. Delistete Titel fehlen im Produktuniversum. Für den Snapshot kommen sie über `--identity` (sec-pit) dazu.
- SIC beschreibt das Geschäft des Registranten, keine Kurskorrelation. FF49 fasst SIC-Bereiche zusammen; auch das ist keine gemessene Korrelation.
- Konglomerate und Sammelcodes (6770 Blank Checks → FF49 48 „Fin“) bleiben grob.
- Vor 2009 gibt es nur gezielt abgerufene Header.

## Wirkung auf die Blocker

| Punkt | vorher | jetzt | bleibt offen |
|---|---|---|---|
| C02 (und C01) historische Datenabdeckung, CC-4, `TUR-SF-LIMIT-CORR` | keine PIT-Gruppenquelle je Wertpapier | Quelle vorhanden: FF49/SIC je `securityId`, PIT-getestet | Owner E7-5 (Option A mit Revision von E4 oder B GICS), Wahl von FF49 oder SIC-Ebene, `maxAgeDays`, zulässige Identitätsbelege; danach Neulauf BASE_S0 mit `groupsOf` und Vorher/Nachher (PS-C02-CC4-GROUPS) |
| C04/C05 Gruppen-Stage (FP-ST-04, `WEIN-SF-GROUP`) | Zugehörigkeit nur je CIK | Zugehörigkeit je Wertpapier zum Zeitpunkt | Gruppenchart-Konstruktion (Gewichtung, Mindestmitglieder), Owner-Freigabe; NYSE-A/D-Historie (lizenziert) bleibt für CC-4 nötig |
| C06 IBD-RS | – | – | unverändert (Lizenz) |

Nicht geändert: Engines, Strategien, Pins, Zertifizierungs-Gates, `docs/SUPERTRADER_9_CERTIFICATION_READINESS.md`, `supertrader/data`, `quant/data`.
