# Supertrader – Aktivierung des Paper-Tests SF6-PAPER-2027 (FP-ST-02 / CC-8)

Stand: 03.11.2026. Freigabepaket **FP-ST-02** ([SUPERTRADER_13_METHODS_EVIDENCE.md](SUPERTRADER_13_METHODS_EVIDENCE.md) §10), Protokoll **SF6-PAPER-2027 1.1.0** ([SUPERTRADER_6_PAPER_VALIDATION_PROTOCOL_2027.md](SUPERTRADER_6_PAPER_VALIDATION_PROTOCOL_2027.md), Fingerabdruck `e623b336cd24…`).

**Status dieses PR: vorbereitet, Schalter AUS.** Es läuft nichts, es wird nichts aufgezeichnet, kein Repository-Schalter (`vars`) und kein Secret wurde gesetzt. Keine Orders, kein Broker, keine Produktfläche, `LIVE_NOT_APPROVED`.

**Einzige harte Frist:** Aktivierung gemergt vor dem 01.01.2027. Letzte Sitzung davor ist der 31.12.2026, erste Sitzung des Fensters der 04.01.2027. Ohne Aktivierung verschiebt sich CC-8 für alle 11 Referenzen um mindestens ein Jahr.

## 1. Was die Aktivierung braucht

| # | Voraussetzung | Stand | Wer |
|---|---|---|---|
| V1 | Aufzeichnungsweg: nur anhängen, hash-verkettet, versiegelt, vor der nächsten Eröffnung | **vorhanden** (dieser PR) | – |
| V2 | Workflow, der vor dem 01.01.2027 und ohne Schalter nichts tut | **vorhanden** (dieser PR) | – |
| V3 | Probelauf mit den vier Integritätsprüfungen und Manipulationsproben | **bestanden** (Abschnitt 5) | – |
| V4 | gepinnte Fingerabdrücke gleich `main` | **gleich** (Abschnitt 4) | – |
| V5 | **Forward-Datenpfad** für die Sitzungen ab 2027 | **fehlt**, Folge-PR nötig (Abschnitt 3) | Technik, dann Owner-Läufe |
| V6 | Owner-Entscheidungen E-P1 bis E-P3 | offen (Abschnitt 6) | Owner |
| V7 | Owner-Commit am Schalter mit Freigabe (Datum vor dem 01.01.2027, PR-Nummer) | offen | Owner |

V1 bis V4 sind mit diesem PR erledigt. Die Aktivierung selbst ist danach **ein** Commit am Schalter (V7). Er wirkt aber erst, wenn auch V5 gemergt ist. Bis dahin meldet der Wächter bei eingeschaltetem Schalter `BLOCKED` mit `FORWARD_DATA_PATH_NOT_IMPLEMENTED` (roter Lauf, kein stilles Überspringen).

## 2. Was jetzt vorhanden ist

| Datei | Inhalt |
|---|---|
| `scripts/supertrader/source-faithful/paper/activation-2027.mjs` | der Owner-Schalter (`SF6_PAPER_ACTIVATION`, `activated: false`), erlaubte Antworten der Entscheidungen, Wächter `activationState`, Pin-Prüfung `pinCheck` |
| `scripts/supertrader/source-faithful/paper/forward-log.mjs` | Eintrag je Sitzung, Hash-Kette, Korrektur als neuer Eintrag, Prüfung „nur anhängen“ gegen den committeten Stand, die vier Integritätsprüfungen |
| `scripts/supertrader/source-faithful/paper/run-paper-2027.mjs` | CLI `guard`, `record`, `verify`, `dry-run --out` |
| `.github/workflows/supertrader-paper-2027.yml` | bewachter Aufzeichnungslauf (Abschnitt 2.2) |
| `scripts/supertrader/tests/sf-paper-2027-activation.test.mjs` | Schalter, Wächter, Kette, „nur anhängen“, Probelauf mit Manipulationen, PIT bei Splits, Workflow-Regeln |
| `scripts/supertrader/tests/sf-sf6-readiness.test.mjs` | Ausnahme für genau diesen bewachten Workflow; jeder andere Workflow darf das Protokoll weiter nicht nennen |

Das Protokoll 1.1.0 selbst ist **nicht** bearbeitet. Die Aktivierung ist ein eigener Datensatz, der den Protokoll-Fingerabdruck nennt. CC-8-Belege zählen nur unter diesem Fingerabdruck.

### 2.1 Aufzeichnung

- **Ein Eintrag je Sitzung** in `scripts/supertrader/source-faithful/paper/log/SF6-PAPER-2027.jsonl`. Jeder Eintrag enthält `prevHash` und `hash = sha256(canonicalJson(Eintrag ohne hash))`. Der erste Eintrag zeigt auf `GENESIS` (64 Nullen).
- **Inhalt je Referenz (öffentlich):** nur Zählungen und Hashes. Das sind offene Positionen, geschlossene Trades, kumulierte Setups, vorgemerkte Orders und Einstiege, das Ledger-Replay (`reconciliation`), `ledgerSha256` und `sealedSha256`. Kein Ticker, kein Kurs, keine Kennzahl. Zwischenstände bleiben damit reine Zählungen, wie es das Protokoll verlangt.
- **Versiegelt** (für den Owner verschlüsselt mit `scripts/supertrader/validation/results-public-key.pem`): offene Positions-IDs und Schlüssel der geschlossenen Trades, je Eintrag eine Datei `log/sealed/<seq>-<Sitzung>.sealed.json`. Der öffentliche Eintrag trägt den Klartext-Hash je Referenz.
- **PIT:** Die Aufzeichnung der Sitzung t rechnet jede Referenz unverändert vom Fensterbeginn bis t, auf den Daten, wie sie zum Schluss von t bekannt sind. Der Rohdatenschnitt erfolgt vor der Adjustierung. Ein späterer Split ändert die Aufzeichnung von t also nicht (Test `PAPER-2027-PIT`).
- **Nie überschreiben:** Eine Sitzung muss nach der letzten erfassten liegen (keine Doppel- oder Rückwärts-Sitzung). Eine Korrektur ist ein neuer Eintrag `CORRECTION` mit `corrects` und Begründung. Der alte Eintrag und sein versiegelter Teil bleiben.
- **Eine verpasste Sitzung** wird beim nächsten Lauf in Reihenfolge nachgetragen, nie übersprungen. `NO_MISSING_SESSIONS` zählt sie als „nach der nächsten Eröffnung geschrieben“ und schlägt dann fehl. So bleibt die Lücke sichtbar.

### 2.2 Workflow `supertrader-paper-2027.yml`

| Job | Wann | Wirkung |
|---|---|---|
| `guard` | Di–Sa 02:37 und 09:41 UTC (nach jedem Schluss, vor der Eröffnung 13:30 UTC) und manuell | fragt `activationState`. `INACTIVE`: nichts passiert, grün. `BLOCKED`: roter Lauf. `ACTIVE`: weiter zu `record` |
| `record` | nur bei `ACTIVE` und nur auf `main` | Sitzung aufzeichnen; Tests; `verify` gegen den committeten Stand; Commit nur von neuen Dateien und dem angehängten Protokoll; Push über `scripts/ci/push-with-retry.sh` |

Es gilt ADR-005: Checkout `ref: ${{ github.ref }}`, Concurrency `supertrader-paper-2027-${{ github.ref_name }}`, Eingabe `session` nur über `env:`, oberste Rechte `contents: read` (nur `record` hat `contents: write`). Gate A ist eingehalten: Der Workflow schreibt nur unter `scripts/supertrader/`.

Es gibt **keinen** Schalter über Repository-Variablen. Die Freigabe ist ein gemergter Commit am Schalter und damit im Review sichtbar und versioniert.

### 2.3 Aufbewahrung der Aufzeichnung

- Protokoll und versiegelte Teile liegen auf `main` im Repository. Sie werden nur angehängt und nie gelöscht.
- Vor jedem Commit prüft `run-paper-2027.mjs verify`: Der committete Stand ist ein bytegleiches Präfix, die Kette ist gültig, es gibt keinen Probelauf-Eintrag, und zu jedem Eintrag existiert eine verschlüsselte Datei. Zusätzlich darf der Commit außer dem Protokoll nur Dateien **hinzufügen**.
- Jeder Commit verankert den Kettenkopf in der Git-Historie. Eine nachträgliche Änderung wäre damit doppelt sichtbar, in der Kette und in Git.
- Die Aufbewahrung gilt mindestens bis zum Abschluss der CC-8-Auswertung und so lange, wie eine Zertifizierung darauf beruht. Die Aufbewahrung der **eingefrorenen Forward-Sitzungen** (Snapshot-Generation) ist die Owner-Entscheidung E-P2.

## 3. Befund: Der Forward-Datenpfad fehlt (V5)

Der Research-Lader (`validation/analyze-methods.mjs#loadPitData`) und der Capture-Pfad lesen das Fenster aus `validation/lib.mjs#WINDOWS`. Dort gibt es nur DEV (bis 30.09.2026) und HOLDOUT. Ein Forward-Fenster ab 2027 gibt es nicht.

`validation/lib.mjs` gehört zu den Dateien des gepinnten Turtle-Fingerabdrucks (`runner/run-research.mjs#codeSha256`, `89fbcf86…`). Jedes Forward-Fenster dort ändert diesen Pin. Nach dem Protokoll ist das **vor** dem 01.01.2027 erlaubt, aber nur als neue Protokollversion mit erneut gezeigter Referenzgleichheit, so wie bei 1.1.0 (E7-3). Danach würde es das Fenster ungültig machen.

Eine Abkürzung über die Produkt-Tagesreihen (`product/eod-adapter.mjs`, technical-signals-v1) ist **nicht** gleichwertig. Sie hat 270 Sitzungen, keine Dividenden, keine Delistings und ein anderes Universum. Damit würde `FORWARD_LOG_EQUALS_BATCH_REPLAY` gegen den eingefrorenen Research-Snapshot zwangsläufig abweichen. Der Probelauf auf diesen Reihen (Abschnitt 5) prüft deshalb nur die Mechanik, nicht den späteren Datenpfad.

**Folge-PR „SF6-PAPER-2027 1.2.0“, gemergt vor dem 01.01.2027:**
1. `validation/lib.mjs`: Fenster `PAPER_2027` (Vorlauf vor dem 04.01.2027, rollendes Ende) und ein eigener Namensraum der Reihen, analog HOLDOUT.
2. Forward-Lader in `paper/`: `FORWARD_DATA_PATHS.RESEARCH_FORWARD_WINDOW` auf `IMPLEMENTED` mit `load(session)`, der eine `datasetSource` liefert (Rohdaten bis t, Adjustierung danach).
3. Neuer `turtleEngineCodeSha256`. Die Referenzgleichheit wird durch Owner-Läufe des Research-Snapshot-Workflows gezeigt (öffentlicher Block je Szenario identisch).
4. Protokoll 1.2.0 mit den neuen Pins; 1.1.0 wird als `SUPERSEDED_…_NEVER_ACTIVATED` eingetragen. `ACTIVATED_PROTOCOL_SHA256` zeigt auf 1.2.0.
5. In dieselbe Version gehören die Antworten auf E-P1 (Mindestzahl/Fenster) und E-P2 (Aufbewahrung), soweit sie das Protokoll ändern.

Zeitbedarf: ein Technik-PR und zwei Owner-Läufe (Turtle, Minervini). Spätester sinnvoller Start ist Anfang Dezember 2026.

## 4. Gepinnte Fingerabdrücke gegen `main`

Geprüft am 03.11.2026 auf dem Stand von `origin/main` (der PR ändert keine der gepinnten Dateien), mit `node scripts/supertrader/source-faithful/paper/run-paper-2027.mjs guard`:

| Pin | Protokoll 1.1.0 | `main` | Ergebnis |
|---|---|---|---|
| `turtleEngineCodeSha256` | `89fbcf864a57…` | `89fbcf864a57…` | gleich |
| `minerviniResearchCodeSha256` | `c834b227045b…` | `c834b227045b…` | gleich |
| `minerviniVariantRegistrySha256` | `f13ea35016c5…` | `f13ea35016c5…` | gleich |
| `sf5VariantRegistrySha256` | `0a1260e9d087…` | `0a1260e9d087…` | gleich |

Der Wächter prüft das bei jedem Lauf erneut. Eine Abweichung wird gemeldet (`PIN_MISMATCH:<pin>`, `BLOCKED`) und nie neu gepinnt.

## 5. Probelauf (`dry-run --out`)

Der Probelauf schreibt nur nach `--out`. Er berührt weder das echte Protokoll noch den Bucket noch das Netz, und jeder Eintrag trägt `dryRun: true`. Er rechnet die vier Prüfungen in zwei Modi:
- `PIT_PER_SESSION` ist maßgeblich: jede Sitzung wird neu auf den Daten zu t gerechnet.
- `SINGLE_RUN_PREFIX` ist die schnelle Vorprüfung: ein Lauf bis zur letzten Sitzung, Ledger-Präfix je Sitzung.

Dazu kommen fünf Manipulationsproben, die jeweils eine bestimmte Prüfung kippen müssen.

| Lauf | Sitzungen | `PIT_PER_SESSION` | `SINGLE_RUN_PREFIX` | Manipulationen erkannt |
|---|---|---|---|---|
| synthetischer Research-Snapshot (Rohdaten, 40 Titel) | 20 (04.01.–29.01.2027) | 4/4 bestanden | 4/4 bestanden | 5/5 |
| committete EOD-Tagesreihen, volles Universum, nur lesend | 5 (26.10.–30.10.2026) | 4/4 bestanden | 4/4 bestanden | 5/5 |
| Test `PAPER-2027-DRY-RUN` (24 Titel) | 8 | 4/4 | 4/4 | 5/5 |

EOD-Lauf, 5 Sitzungen, 371 s: alle 11 Referenzen buchen. Am Ende stehen zwischen 0 und 34 geschlossene Trades und zwischen 2 und 20 offene Positionen je Referenz. Abgeglichen wurden 5 Sitzungen × 11 Referenzen: 0 Abweichungen, 0 revidierte Eingaben, Kettenkopf `a47e20838d0a…`. Der V4-D1-Zensus zählt 2 Markierungen (`NO_DECLARED_EVENT`), keine davon auf einer gehaltenen Position. Die EOD-Reihen sind nicht PIT-adjustiert (`pitCorporateActions: false`). Der Lauf belegt also die Mechanik auf echten Größenordnungen, nicht den Forward-Datenpfad (Abschnitt 3).

Die Manipulationsproben:

| Probe | Manipulation | erkannt durch |
|---|---|---|
| T1 | Eintrag an Ort und Stelle geändert | Kette (`FORWARD_LOG_EQUALS_BATCH_REPLAY`, `NO_MISSING_SESSIONS`) |
| T2 | Eintrag gefälscht und Kette neu gerechnet (Kette gültig) | Batch-Replay |
| T3 | Sitzung fehlt | `NO_MISSING_SESSIONS` |
| T4 | stille Datenrevision eines vergangenen Balkens | Batch-Replay (`inputsRevisedSessions`) |
| T5 | Eintrag behauptet unabgeglichenes Ledger | `RESEARCH_V1_RECONCILED` |

Nachstellen:

```bash
node scripts/supertrader/source-faithful/paper/run-paper-2027.mjs dry-run --source synthetic --sessions 20 --out /tmp/paper-dryrun/syn20
NODE_OPTIONS=--max-old-space-size=12000 node scripts/supertrader/source-faithful/paper/run-paper-2027.mjs dry-run --source eod --sessions 5 --out /tmp/paper-dryrun/eod5
```

## 6. Owner-Entscheidungen (Vorlage)

Alle Antworten müssen vor dem 01.01.2027 feststehen. Antworten, die das Protokoll ändern, gehören in Protokoll 1.2.0 (Abschnitt 3).

### E-P1 – PS-C02-SAMPLE-COUNT: Mindestzahl oder längeres Fenster?

Hintergrund: Turtle hat etwa 52 Trades pro Jahr. 250 Sitzungen ergeben eine kleine Stichprobe (CERT-PREP-TOP5, `C02-SAMPLE`, Stand `PREPARED_COUNT_ONLY`).

| Option | Wirkung |
|---|---|
| **`COUNT_ONLY`** | Das Protokoll bleibt bei 250 Sitzungen. Die Zahl der Positionen im Fenster wird gezählt und berichtet, sie ist aber keine Schwelle. CC-8 bleibt reine Integrität. |
| `MIN_CLOSED_TRADES` | CC-8 wartet zusätzlich auf eine Mindestzahl geschlossener Trades je Referenz (Zahl festlegen). Das ändert `evaluation.cc8`, also eine neue Protokollversion. Die Auswertung kann sich ohne Obergrenze verschieben. |
| `LONGER_WINDOW` | `window.minimumSessions` wird höher (z. B. 500). Das ist eine neue Protokollversion, und CC-8 kommt frühestens Ende 2028. |

**Empfehlung: `COUNT_ONLY`.** CC-8 ist im Protokoll und in der Readiness-Matrix ausdrücklich Integrität, nie Leistung. Eine Mindestzahl würde Stichprobengröße in ein Integritätskriterium mischen. Die Aufzeichnung läuft nach der 250. Sitzung ohnehin weiter. Eine spätere, größere Auswertung (E6, Verteilungen) bleibt damit möglich, ohne das Fenster zu berühren. Wer trotzdem eine Schwelle will, legt sie jetzt in 1.2.0 fest, denn danach ist es verboten.

### E-P2 – Aufbewahrung der eingefrorenen Forward-Sitzungen

Hintergrund: Die Kappung liegt bei 3 vollen Snapshot-Generationen (`snapshot/contract.mjs`, `RETENTION.maxGenerations`). Zwei sind durch DEV und HOLDOUT belegt, die dritte will auch FP-ST-01 (Generation 3 mit CA-Quelle). Löschen ist im Treiber gesperrt und eine Owner-Entscheidung. Smoke-Generationen haben eine eigene Kappung und machen hier nichts frei.

| Option | Wirkung |
|---|---|
| **`RAISE_CAP_TO_4_FORWARD_GENERATION`** | eigener PR an `snapshot/contract.mjs` (Kappung 4). Je Generation bis 3 GB im bestehenden Snapshot-Speicher, keine neuen Daten. FP-ST-01 und FP-ST-02 kommen sich nicht in die Quere. |
| `SHARE_THIRD_GENERATION_WITH_FP_ST_01` | keine Codeänderung. Wer zuerst einfriert, belegt sie; der andere wartet oder braucht später doch die Erhöhung. |
| `OWNER_DELETES_ONE_FULL_GENERATION` | Platz durch Löschen einer alten Generation. DEV/HOLDOUT sind die Belege der Referenzgleichheit, daher nicht empfohlen. |

Die Aufzeichnung selbst (Protokoll und versiegelte Teile im Repository) ist von E-P2 unabhängig. Sie wird nie gelöscht (Abschnitt 2.3).

**Empfehlung: `RAISE_CAP_TO_4_FORWARD_GENERATION`.** Das ist die einzige Option ohne Konflikt mit FP-ST-01 und ohne Verlust von Belegen. Die Kosten bleiben im bestehenden Speicher; der Zero-Cost-Guard bleibt aktiv.

### E-P3 – Aktivierung (FP-ST-02)

| Option | Wirkung |
|---|---|
| **A: aktivieren vor dem 01.01.2027** | Folge-PR 1.2.0 (V5) mergen, dann Owner-Commit am Schalter. Aufzeichnung ab der Sitzung 04.01.2027. |
| B: später | neue Protokollversion mit neuem Fensterbeginn; CC-8 verschiebt sich um mindestens ein Jahr |
| C: nicht | CC-8 bleibt für alle 13 offen |

**Empfehlung: A** (wie in FP-ST-02).

### Der Schalter-Commit (nach V5, durch den Owner)

In `scripts/supertrader/source-faithful/paper/activation-2027.mjs`:

```js
activated: true,
approval: { by: '<Owner>', on: '2026-12-..', pr: <PR-Nummer> },
decisions: { sampleCount: 'COUNT_ONLY', retention: 'RAISE_CAP_TO_4_FORWARD_GENERATION', dataSource: 'RESEARCH_FORWARD_WINDOW' },
```

Der Wächter verlangt dafür:
- eine Freigabe mit Datum **vor** dem 01.01.2027;
- jede Entscheidung aus den erlaubten Antworten;
- den implementierten Datenpfad;
- den Protokoll-Fingerabdruck der aktivierten Version;
- gleiche Pins.

Fehlt etwas, ist der Lauf rot. Der Test `PAPER-2027-SWITCH` prüft dieselben Bedingungen schon im PR.

## 7. Prüfen

```bash
node --test scripts/supertrader/tests/sf-paper-2027-activation.test.mjs scripts/supertrader/tests/sf-sf6-readiness.test.mjs
node scripts/supertrader/source-faithful/paper/run-paper-2027.mjs guard --today 2026-11-03   # INACTIVE, NOT_ACTIVATED
```
