# Backtesting P2: Zertifizierungsdefizite (Stand 02.11.2026, Master Completion 3.1 und 3.2)

Auftrag P2 des Owners: Zertifizierungsdefizite mit den vorhandenen Implementierungen verringern, ohne neue Engine. Unverändert bleiben:
- Zertifizierungsgates und Schwellen: alle sechs Arten bestehen dieselben Gates;
- `backtest-runner.cjs` mit seinen `CODE_FILES`: die 16 Demos bleiben aktuell;
- Security Master, `quant/data/**`, die eingefrorenen Stände und die gesperrte UI.

Ergebniszahlen erscheinen nicht im Produkt. Alle Zahlen in diesem Dokument und unter `docs/quant/research/` sind **Research, nicht zertifiziert** (`gateInput: false`, `productionApproved: false`).

Übersicht im Erzeuger: [BACKTEST_COVERAGE_MATRIX.md](BACKTEST_COVERAGE_MATRIX.md), Abschnitt I (Nachweise) und H (Freigabevorlagen).

## 1. Ergebnisse je Priorität

### 1.1 P3.1 Survivorship-Sensitivität für Pattern und Signal

**Skript:** `scripts/quant/research/survivorship-sensitivity.cjs`, Bericht [`research/survivorship-sensitivity-p3.1.json`](research/survivorship-sensitivity-p3.1.json).

**Aufbau.** Dieselbe registrierte Vorlage läuft zweimal über den unveränderten Runner:
1. `V10_LIFECYCLE`: Rahmen F0, nur Überlebende.
2. `V13_DELISTED_F1`: F0 plus die QUALIFIED-Reihen aus Register 1.0.0. Wahlweise `--frame F1C` (zusätzlich zensierte Enden) oder `F1W` (Register 1.1.0).

Beide Läufe teilen Stichprobe (Hash-Reihenfolge, gleicher Seed, Standard 100 wegen der Werkbudgets der Musterstudie) und Ladeoptionen. Die Überlebenden des zweiten Laufs sind deshalb genau der Anfang der ersten Stichprobe (Test). Delistete Titel gehen mit ihrem Anteil im Rahmen ein.

Was der Bericht nicht enthält:
- benannte Titel: Sie wären per Konstruktion Überlebende;
- Zusatzmethoden;
- die finanzierte Signalvariante: `fundedSchedule` verwirft beendete Listings (D4).

Ausgewiesen werden beide Ergebnisse, die Differenz „mit minus ohne“ und die Ereignisse aus `dl_`-Reihen getrennt. Ereignisse nach dem letzten Handelstag bleiben zensiert. Ereigniszeilen und Reihen stehen nie im Bericht.

**Datenlage.** Die delisteten Reihen liegen **nur im privaten R2-Archiv** (Teil `v13-derived`). Der committete Bericht hat deshalb den Zustand `PREPARED_PRIVATE_INPUT_MISSING`:

| Vorlage | Überlebende (A, Research) | mit Delisteten |
|---|---|---|
| pattern-2015-sideways | 100 Listings, 267 Ereignisse, Mittel −2,69 % je 13 Wochen | B: `PRIVATE_DATA_UNAVAILABLE:delistedSeries` |
| signal-2020-covid (je Ereignis) | 100 Listings, 483 Ereignisse, Mittel +20,38 % je 13 Wochen | B: dieselbe Lücke |

Diese Überlebenden-Zahlen sind eine Zufallsstichprobe des Rahmens, keine Katalogzahlen und kein Befund über eine Regel. Ihr einziger Zweck ist die spätere Differenz. Der Lauf mit privaten Reihen ist Ablauf R2 (Freigabe).

**Tests:** synthetische Welt mit drei delisteten Listings (`quant/tests/backtest-p2-deficits.test.mjs`): beide Läufe A, Stichprobeneigenschaft, Zustand B ohne private Reihen.

**Gate:** `survivorship` bleibt unverdrahtet. P3.3 braucht P3.2 (Tiingo-Rechte) und die Freigabe FV-5.

### 1.2 P4.1 Gesamtrendite für Pattern

**Skript:** `scripts/quant/research/pattern-total-return.mjs`, Bericht [`research/pattern-total-return-p4.1.json`](research/pattern-total-return-p4.1.json).

**Aufbau.** Muster, Horizont, Abstand und Kosten kommen aus der Vorlage `pattern-2015-sideways`. Die Engine (`runPatternStudy`) rechnet zweimal auf denselben Wochenbalken:
1. **Kursrendite:** wie der Runner.
2. **Gesamtrendite:** `returnLevel` aus der kanonischen Gesamtrendite (`canonical-total-return-1.0.0` über `daily-prices.mjs#dailyOf`), Wochenwert nach `weekly-total-return-1.0.0`.

Das Muster bleibt auf Kursen definiert. Titel ohne bestätigte Gesamtrendite fallen aus **beiden** Läufen heraus und stehen mit Grund im Bericht.

Fail-closed-Prüfungen:
- **Parität:** Der Kursrendite-Lauf wird Ereignis für Ereignis gegen den unveränderten Runner geprüft. Eine Abweichung bricht ab.
- **Benchmark:** keiner. SPY gibt es öffentlich nur als Kursrendite, und die Engine verbietet gemischte Basen.
- **Zerlegung:** Ein Kontrolllauf mit der Kursrendite derselben Tagesreihe trennt die Ausschüttungen von Quell- und Rundungseffekten der Wochenreihe.

**Ergebnis (Research, öffentliche Golden-Preview, Fenster 2015-01-01..2025-06-30, asOf 2025-12-31):**

| Größe | Kursrendite | Gesamtrendite |
|---|--:|--:|
| Titel (von 5 angefragten) | 4 | 4 |
| Ereignisse beobachtet | 62 | 62 |
| Mittel je Ereignis (13 Wochen, netto) | +6,87 % | +7,63 % |
| Median | +4,41 % | +5,25 % |
| Anteil positiv | 62,9 % | 66,1 % |
| Exzess gegen Kontrollen vom selben Datum (Mittel, n = 60) | −0,39 Pp | −0,21 Pp |

- **Gepaarte Differenz (62 Paare):** im Mittel +0,75 Pp je Ereignis, Spanne −0,04 bis +2,40 Pp.
- **Zerlegung:** Ausschüttungen +0,75 Pp (Minimum > 0), Wochenreihe gegen Tagesreihe +0,001 Pp (Rundung der veröffentlichten Wochenschlüsse).
- **Parität mit dem Runner:** 62 Ereignisse, 0 Abweichungen.
- **Ausgeschlossen:** AAPL mit `NOT_IN_POPULATION_FRAME`. AAPL gehört nicht zum Rahmen `V10_PRIMARY` (Identitäts- und Kapitalmaßnahmenprüfung). Das ist ein Ausschluss mit Grund und kein Fehler.

Die Kohorte ist klein (vier Großwerte), deshalb ist das Ergebnis eine Mechanikprobe der Renditebasis. Ein Befund über das Muster ist es nicht.

Was das Gate `returnBasis` (Pattern) damit sagen würde:
- **Heute** ist das Gate eine Konstante im Builder (`FAIL STUDY_RETURN_BASIS_NOT_TOTAL_RETURN`) und liest keinen Bericht.
- **Nach der bestehenden Definition** (Studie in Gesamtrendite, Ausschlüsse ausgewiesen) wäre es für diese Research-Kohorte erfüllt.
- **Was es liest:** die Produkt-Musterstudie `quant/data/product/pattern-research-v1/study.json`. Die rechnet mit Kursrendite.
- **P4.2** braucht deshalb zwei Dinge: den Erzeuger `build-pattern-research.mjs` in Gesamtrendite (Pipeline mit `--work-dir`, Fachmodell-PR mit Vorher/Nachher) und die Umverdrahtung im Builder. Beides ist Freigabe FV-5.
- **Vergleichsmaß:** Die Signalstudie hat heute 97,8 % Gesamtrendite-Abdeckung, ihr Gate verlangt 95 %.

### 1.3 Fünf private Katalogfälle: Gegenrechnung vorbereitet (nicht ausgeführt)

**Skript:** `scripts/quant/research/catalog-private-recheck.cjs`, Erwartung [`research/catalog-private-expectations-fv4.json`](research/catalog-private-expectations-fv4.json). Ablauf: R1 in Abschnitt 3.

### 1.4 FV-1 Setup-Gate `independence`: Analyse

**Skript:** `scripts/quant/research/setup-independence-readings.cjs`, Bericht [`research/setup-independence-readings-fv1.json`](research/setup-independence-readings-fv1.json), Stichtag 2026-10-31.

**Gate-Definition.**
- Die Methodik `quant/methodology/backtest-certification-v1.json` setzt `SETUP_BACKTEST.requirements.independentWeeks: 20`.
- Der Builder `scripts/quant/build-backtest-certification.mjs` zählt `new Set(outcomes.events.map((e) => e[2].slice(0, 7))).size`, also verschiedene **Kalendermonate** mit Ereignissen (alle Arten einschließlich `SETUP_WEAKENED`). Das Label lautet „verschiedene Monate mit Ereignissen“.
- `quant/engines/backtest-certification.js` prüft nur, ob der Status den Gates folgt. Eine eigene Zählung hat es nicht.

**Herkunft.** Schwelle und Zählung kamen im selben Commit `7cd1c3656a` („Quant Backtest Certification“, 01.10.2026), ermittelt über die GitHub-Historie, weil der Arbeitsklon flach ist.
- Der Name der Schwelle sagt Wochen, die Variable heißt `eventWeeks`, gerechnet werden Monate.
- Die Dokumentation desselben Commits nannte für Setup „Stichtage ca. 10.03.2027, erste 6-Monats-Ergebnisse ca. 26.03.2027“ und kein Datum 2028. Die Monatszählung war in der damaligen Prognose also nicht bindend, was für die Absicht „Wochen“ spricht.
- Seitdem wurde die Abweichung viermal festgestellt und nie entschieden: V6 `methodology-proposal.json`, V8 `setup-decision-current.json`, V9 `setup-decision-recommendation-1.0.0.json` (Empfehlung ISO-Wochen) und V10 `setup-independence-decision-1.0.0.json` (Empfehlung: Umbenennung und ein Gate auf N_eff). Alle vier sind `NOT_APPROVED`.

**Beide Lesarten** (Ereignisse in jeder Folgeeinheit angenommen):

| Lesart | Stand | frühestens 20 | bindet? | frühestes Datum aller Setup-Zeitgates |
|---|--:|---|---|---|
| A Monate (aktiv) | 2 | 2028-04 | ja | 2028-04 |
| B ISO-Wochen (Wortlaut) | 6 | 2027-02-01 | nein | 2027-03-26 (Untergrenze: M6-Ergebnisse, Titel, Varianten) |

Unter beiden Lesarten ist `oos` ohne A1–A6 nicht prognostizierbar, und die Owner-Freigabe nach `setup-state-v1.json` bleibt nötig. B verschiebt das früheste Datum um rund 13 Monate nach vorn.

**Fachliche Bewertung.**
- Keine der beiden Zählungen misst Unabhängigkeit. Alle M6-Fenster überlappen, bis zu 255 Einstiege fallen auf einen Tag, und V10 maß eine effektive Fallzahl von etwa 12,6 je Ereignisdatum.
- 20 Wochen mit Ereignissen wären nach 20 Wochen Veröffentlichung trivial erfüllt. Das Gate würde dann nichts mehr prüfen, was die Ergebnisgates nicht ohnehin prüfen.
- 20 Monate sind strenger, aber ebenfalls nur ein Zeitmaß.

**Empfehlung (keine Änderung in diesem PR):**
- **A jetzt:** die Monatszählung bestätigen und das Feld in einem reinen Methodik-PR ehrlich benennen (`eventCalendarMonths`, Zählung unverändert).
- **Unabhängigkeit:** als eigene Entscheidung über den V10-Vorschlag C regeln (N_eff ≥ 50 und ≥ 4 disjunkte M6-Fenster, frühestens 2029).
- **Nicht B:** B lockert das bindende Gate ohne statistischen Beleg, und CLAUDE.md verbietet das Abschwächen von Gates.
- **Bis zur Entscheidung** gilt A unverändert.

**Stand Master Completion 3.2:** A liegt als eigener Entscheidungs-PR #1254 (Draft) vor. Die Schwelle heißt dort `eventCalendarMonths`, der alte Name wird als Alias gelesen. Der Erzeuger liefert mit `--out` vorher und nachher für alle sechs Arten dasselbe Artefakt (bis auf `generatedAt`), und das Bundle bleibt unverändert. Die Research-Leser in diesem Branch (`setup-independence-readings.cjs`, `pit-snapshot-integrity.cjs`) lesen beide Namen.

### 1.5 FV-2 bis FV-8: technisch erledigt, Rest präzisiert

| Vorlage | in diesem PR erledigt (ohne Freigabe) | offen (Freigabe) |
|---|---|---|
| FV-2 Kennzahlen-Hash im Runner | – (jede Runner-Änderung lässt die 16 Demos veralten) | Runner-Feld `metricsHash`, Demo-Neubau `[v13-archive:demos]`, Bundle-Export in einem PR |
| FV-3 Determinismus in CI | – | neuer Prüf-Workflow (workflow_dispatch, zwei Node-Versionen, `contents: read`): `backtest-run-cli-metrics-hash.test.mjs` und die 16 öffentlichen Katalogfälle gegen `catalog.json` |
| FV-4 private Katalogfälle | Erwartung und Auswertung (`catalog-private-recheck.cjs`), Ablauf R1 | Lauf `[v13-archive:catalog]` (Secret), nur nach einer Runner-Änderung |
| FV-5 Gates aus Sensitivitäten | P3.1-Code, P4.1-Research, Gate-Lesart dokumentiert | (1) Lauf R2, (2) R3 und Produkt-Erzeuger in Gesamtrendite, (3) Umverdrahtung P3.3/P4.2 |
| FV-6 Setup-OOS A1–A6 | – | Entscheidung laut `SETUP_OOS_DECISION_A1_A6.md`, vor etwa 2027-03-26 |
| FV-7 Kennzeichnung Replay/Pattern | – (Produktentscheidung) | Anzeige als „Beschreibung, kein Test“ (Teil von H4) |
| FV-8 Alarm Snapshot-Monat | `pit-snapshot-integrity.cjs --fail-on-missing-month --alarm-detail <datei>` (Exit 1 und Text für `ALARM_DETAIL_FILE`) | ein Schritt in `freshness-monitor.yml`, Ergebnis als `RESULT_PIT` an den vorhandenen `alarm`-Job |

### 1.6 Master Completion 3.2: P4.1 über die öffentliche Population, Survivorship im öffentlichen Rahmen

Beide Berichte sind Research. Sie laufen mit `--out` unter `docs/quant/research/`, speisen kein Gate und ändern weder Runner noch `CODE_FILES` oder Schwellen.

**P4.1 erweitert:** Skript `scripts/quant/research/pattern-total-return-population.mjs`, Bericht [`research/pattern-total-return-population-p4.1.json`](research/pattern-total-return-population-p4.1.json). Laufzeit etwa 70 s, davon der größte Teil für den Rahmenaufbau.
- **Kandidaten:** der ganze Rahmen `V10_PRIMARY` (4.288 Listings) plus die fünf Golden-Preview-Titel, zusammen 4.289. Reihenfolge nach `sha256(seed:securityId)`, Seed `p41-population-1`. `--limit N` begrenzt auf den Anfang dieser Reihenfolge. Geprüft wird jeder Kandidat, denn die Prüfung liest nur Dateien.
- **Ergebnis der Vollerhebung:** Nur 4 von 4.289 Kandidaten haben öffentlich eine bestätigte Gesamtrendite: JPM, MSFT, NVDA und XOM, alle aus der Golden-Preview. Ausgeschlossen sind 4.284 Titel mit `NO_DAILY_HISTORY_WITH_DISTRIBUTIONS`, weil die öffentlichen Reihen `discover-series(-long)` nur Splits führen und keine Ausschüttungen. Dazu kommt AAPL mit `NOT_IN_POPULATION_FRAME`. **Die öffentliche Obergrenze ist damit erreicht.** Mehr Titel gibt es nur über die kanonische Historie (`--work-dir`, Ablauf R3, Freigabe FV-5).
- **Parität mit dem Runner:** 62 Ereignisse, 0 Abweichungen.
- **Gepaarte Differenz** (Gesamtrendite minus Kursrendite, 62 Paare, 13 Wochen netto):

| Größe | Wert (Research) |
|---|--:|
| Mittel | +0,75 Pp |
| Median | +0,84 Pp |
| Anteil positiv | 95,2 % |
| 95 % t-Intervall (unabhängige Paare angenommen, trifft nicht zu) | [+0,61; +0,90] Pp |
| 95 % Cluster-Bootstrap Titel × Kalenderjahr (27 Cluster, 10.000 Ziehungen) | [+0,51; +1,01] Pp |
| 95 % Cluster-Bootstrap Titel (4 Cluster, `FEW_CLUSTERS`) | [+0,25; +1,17] Pp |
| je Titel (Mittel) | XOM +1,27, JPM +0,86, MSFT +0,42, NVDA +0,17 Pp |
| Anteil Ausschüttungen an der Differenz | +0,75 Pp (Wochenreihe gegen Tagesreihe +0,001 Pp) |

- **Lesart:** Die Differenz entspricht der Ausschüttungsrendite der vier Großwerte über 13 Wochen. Sie ist positiv und liegt in der Größenordnung von 1 Pp, ist aber nicht auf den Rahmen übertragbar. Das breiteste Intervall, Cluster Titel mit nur 4 Clustern, unterschätzt die Unsicherheit noch. Die Zufallszahlen kommen aus `sha256(seed:zähler)`, der Bericht ist bytegleich reproduzierbar (Test).

**Survivorship im öffentlichen Rahmen:** Skript `scripts/quant/research/survivorship-public-frame.mjs`, Bericht [`research/survivorship-public-frame-p3.1.json`](research/survivorship-public-frame-p3.1.json). Laufzeit etwa 90 s. Rahmen `V10_LIFECYCLE` (öffentlich, mit Lebenszyklus-Evidenz), Muster wie P4.1, Kursrendite, Fenster 2015-01-01..2025-06-30.
- **Rahmen:** 4.327 Listings, davon 124 mit Lebenszyklus-Nachweis. Nur **19 Listings sind beendet (0,44 %)**: 17 durch Übernahme, 2 per Form 25. Davon enden 3 im Fenster.
- **Bestand ohne Reihen:** Gezählt aus öffentlichen Metadaten, die Reihen selbst sind privat.
  - Register V13 (`docs/quant-recovery/v13/delisted/register-1.0.0.json`): 4.322 beendete Ketten, davon 1.675 `QUALIFIED`. Bei 1.522 überlappt der Endjahr-Bucket das Fenster.
  - Rahmen F1 laut Referenz: 4.719 statt 4.329 Listings, also 390 delistete Reihen bestehen die Rahmenregel (8,3 % von F1).
  - Privater Abruf (`survivorship-control-v1.json`): 3.082 delistete Listings sind für Studien nutzbar.
  - Der öffentliche Rahmen enthält damit **1,1 % der qualifizierten** bzw. **0,6 % der nutzbaren** delisteten Listings.
- **Ereignisse:** alle 19 beendeten Listings voll, dazu 1.000 der übrigen nach `sha256(seed:securityId)`, Seed `p31-public-frame-1`. Die Engine läuft in Blöcken zu 100 Listings wegen ihres Werkbudgets, deshalb fehlen Kontrollen vom selben Datum.
  - Beendete Listings: 17 mit Ereignissen, 442 Ereignisse, davon 4 im Horizont beendet und alle 4 zensiert (`OUTCOME_NOT_OBSERVED`). Zensurquote 0,90 %.
  - Stichprobe: 866 Titel mit Ereignissen, 20.719 Ereignisse, 6 zensiert (0,029 %), keines mit Listing-Ende.
  - Hochgerechnet auf den Rahmen: 89.699 Ereignisse, davon 0,49 % aus beendeten Listings, 0,004 % mit Listing-Ende im Horizont, Zensurquote 0,033 %.
  - Gegenprobe mit der Vollerhebung (`--limit all`, etwa 4 Minuten, nicht committet): 92.602 Ereignisse, 0,48 %, 0,004 %, Zensurquote 0,024 %. Die Hochrechnung trifft also die Größenordnung.
- **Lesart:** Der öffentliche Rahmen ist fast ein reiner Überlebenden-Rahmen. Die Zensurquote ist deshalb klein, sie misst aber nur, was im Rahmen endet, und nicht den Überlebenden-Effekt. Der Effekt selbst braucht P3.1 mit den privaten Reihen (`V13_DELISTED_F1`: `PRIVATE_DATA_UNAVAILABLE`, Ablauf R2, Freigabe FV-5). Die mittlere Nettorendite der beendeten Listings (+0,10 % je 13 Wochen, n = 438, 17 Titel) liegt unter der der Stichprobe (+3,03 %). Bei 17 Titeln, fast alle Übernahmen, ist das kein Befund.

**Tests:** `quant/tests/backtest-p2-deficits.test.mjs` mit synthetischer Welt:
- Ausschlüsse je Grund, Parität, Begrenzung auf den Anfang der Hash-Reihenfolge, Intervalle reproduzierbar, `FEW_CLUSTERS`;
- t-Quantil gegen Tabellenwerte;
- Survivorship: Schichten, Zensur bei Ende im Horizont, Hochrechnung, keine Titelnamen und keine Kurse im Bericht.

## 2. Zertifizierungsstand nach P2

Zustände aus `quant/data/product/backtest-certification-v1.json` (asOf 2026-10-31), unverändert: **0/6 zertifiziert**.

| Art | Status | Blocker | Lösungsweg nach P2 |
|---|---|---|---|
| SAME_STOCK_REPLAY | LIMITED | survivorship, ruleTest | strukturell, nur FV-7 (Kennzeichnung) |
| PATTERN_EVIDENCE | LIMITED | survivorship, returnBasis, certifiedAsBacktest | alle drei Owner: FV-5 (Lauf R2 und R3, Umverdrahtung), Norm |
| SIGNAL_BACKTEST | LIMITED | survivorship, ruleCertified | Daten vor 2016 fehlen; Befund 0/5 Regeln |
| SETUP_BACKTEST | COLLECTING_HISTORY | 6 Zeitgates, returnBasis, oos, ownerApproval | Zeit (frühestens 2028-04 unter A), FV-1, FV-6 |
| STRATEGY_BACKTEST | COLLECTING_HISTORY | membershipHistory, factorHistory | Zeit, frühestens 2028-08 |
| FACTOR_RANKING_BACKTEST | COLLECTING_HISTORY | factorHistory, completedForward, membershipHistory | Zeit, frühestens 2028-08 |

## 3. Freigabe-Runbooks (nicht ausgeführt)

### R1 · Gegenrechnung der fünf privaten Katalogfälle (FV-4)

**Wann:** nur nach einer Änderung an einer Datei in `CODE_FILES` des Runners oder am Archiv. Solange beides unverändert ist, bleibt `verify-report.json` gültig.

**Lauf:**
1. Leerer Commit auf einem `claude/**`-Branch mit der Marke `[v13-archive:catalog]` in der Nachricht. Der Workflow `quant-v13-archive.yml` stellt `v13-derived` und `v10-factor-panel` aus Archiv 1.2.0 wieder her (Secret `V13_ARCHIVE_PRIVATE_KEY`, `VU_HISTORY_S3_*`).
2. Der Workflow rechnet alle 21 Fälle (`build-backtest-catalog.cjs`) und prüft sie mit Python (`verify-backtest-runner.py`) und `catalogViolations`. Ergebnis ist das Artefakt `v13-archive-catalog-<run_id>` mit `catalog/` und `verify-report.json`.
3. Auswertung lokal:

```bash
node scripts/quant/research/catalog-private-recheck.cjs --compare <artefakt>/catalog \
  --verify-report <artefakt>/verify-report.json \
  --expectation docs/quant/research/catalog-private-expectations-fv4.json --out <befund.json>
```

**Erwartung** (Kennzahlen-Hash mit angeglichenem Zertifizierungsdatum, erste 16 Zeichen):

| # | Fall | Art | specHash | Kennzahlen-Hash | private Eingabe | Python-Prüfungen/Abweichungen |
|--:|---|---|---|---|---|---|
| 17 | Faktor Momentum | FACTOR_RANKING_BACKTEST | 64dcfbc062fceed1 | a627a1678b29d483 | Panel 84bfe974a76335b6 | 260.715/0 |
| 18 | Faktor Value | FACTOR_RANKING_BACKTEST | 9022867b2dab3e9d | b18a32295f5dce74 | Panel 84bfe974a76335b6 | 127.391/0 |
| 19 | Faktor Quality | FACTOR_RANKING_BACKTEST | 74ae787ba3683fe4 | 28d86fc3a405789e | Panel 84bfe974a76335b6 | 155.335/0 |
| 20 | Delistet: XCO Insolvenz | SAME_STOCK_REPLAY | b3b69bf49789e893 | e5bda34bd09168de | Register ea986202ab4dee0b, Reihe 7f0e4641627c94ee | 103/0 |
| 21 | Delistet: AGN Übernahme | SIGNAL_BACKTEST | 7fea969ccf49e138 | b27fe603fe4f0dc0 | Register ea986202ab4dee0b, Reihe 6405a7d1a5612d10 | 145/0 |

Grundlinie der Gegenrechnung: 21 Ergebnisse, 560.140 Prüfungen, 0 Abweichungen (Python 3.12.3, Toleranz 1e-9).

**Abbruchkriterien** (Befund `ABORT`, Exit 1, nichts übernehmen):

| Kriterium | Bedeutung |
|---|---|
| `CATALOG_INTEGRITY` | Index oder Ergebnisdatei passt nicht |
| `CASE_MISSING`, `STATE_CHANGED` | ein Fall fehlt oder hat einen anderen Zustand |
| `SPEC_CHANGED` | anderes Raster |
| `PRIVATE_INPUT_DRIFT` | Panel- oder Reihen-Hash weicht ab: Das Archiv entspricht nicht dem Katalogstand |
| `METRICS_CHANGED` | eine Kennzahl hat sich geändert: Das ist ein Fachmodell-PR mit Vorher/Nachher, keine Bestätigung |
| `VERIFY_FAILED` | Python-Abweichung oder weniger Prüfungen |

Zulässig, nur gemeldet: Code-Hashes sowie `resultHash`, `envelopeHash` und `inputHash` (sie binden Code und das täglich neue Zertifizierungsartefakt) und das Zertifizierungsdatum.

**Hinweis:** Mit Archivgeneration 2.0.0 (#1241) ändern sich Manifest und Präfix des Lesewegs, die Erwartung bleibt gleich.

### R2 · P3.1 mit privaten Reihen (FV-5, Schritt 1)

1. Wiederherstellung wie in `[v13-archive:demos]`: `r2-restore.mjs --mode extract --parts v13-derived`, Verzeichnis der Reihen wie im Workflow aus der ersten QUALIFIED-`chainId` des Registers bestimmen.
2. Lauf:

```bash
node --max-old-space-size=12288 scripts/quant/research/survivorship-sensitivity.cjs \
  --private-delisted "$DL" --require-private --out "$O/survivorship-sensitivity-p3.1.json"
```

Optional zusätzlich `--frame F1C` bzw. `--frame F1W` für die registrierten Sensitivitäten.

3. Der Bericht kommt nur als Laufartefakt heraus, ohne Reihen und ohne Ereigniszeilen.

**Abbruch:**
- Exit 1 (`--require-private`), wenn eine Registerzeile ohne Datei ist: Der Runner meldet dann `PRIVATE_DATA_INCOMPLETE`.
- Drift gegen die Referenz des Rahmens (`reference.state` im Populationsbericht).

**Voraussetzung für die Veröffentlichung abgeleiteter Zahlen:** P3.2 (Tiingo-Rechte für delistete Historie).

**Workflow:** Für diesen Modus fehlt eine Marke in `quant-v13-archive.yml`. Das wäre eine Workflow-Änderung mit Secret und damit selbst Teil der Freigabe.

### R3 · P4.1 auf der kanonischen Historie (FV-5, Schritt 2)

In der Pipeline mit der kanonischen Historie der Arbeitsablage:

```bash
node scripts/quant/research/pattern-total-return.mjs --work-dir <arbeitsablage> --out <bericht.json>
```

- **Titel:** ohne `--tickers` alle 30 Titel der Vorlage.
- **Population:** `node scripts/quant/research/pattern-total-return-population.mjs --work-dir <arbeitsablage> --out <bericht.json>` prüft denselben Rahmen wie oben und rechnet die gepaarte Differenz mit Intervallen. Ab 10 Titeln entfällt der Hinweis `FEW_CLUSTERS`.
- **Abbruch:** Paritätsabweichung zum Runner (`PARITY_WITH_RUNNER_FAILED`) oder eine Abdeckung unter 95 % (Maß der Signalstudie). Im zweiten Fall sind die Ausschlüsse zu prüfen, bevor P4.2 vorgeschlagen wird.
