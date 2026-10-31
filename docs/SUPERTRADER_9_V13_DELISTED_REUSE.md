# Supertrader 9 – Wiederverwendung der Quant-V13-Delisting-Reihen für Supertrader-Backtests

Stand 30.10.2026, Basis `main` @ `adbc2f0444` (nach Merge von #1132). Evidenzart `HISTORICAL_DEVELOPMENT_STUDY`, `DIAGNOSTIC_NOT_CERTIFIED`, `productionApproved: false`.

Dieser PR liefert eine isolierte, reproduzierbare Vergleichsstudie A gegen B, aber **keine Ergebnisse**. Die privaten V13-Kursreihen sind in dieser Umgebung nicht verfügbar, deshalb wurde keine Zahl auf echten Daten gerechnet.

Unverändert bleiben:
- Strategien, Parameter, Referenzen, Ausführungsmodell und Kosten;
- Snapshot, `quant/data`, `supertrader/data`;
- Workflows und Gates.

Es gab keinen Anbieterabruf und keinen Netzabruf außer Git und GitHub.

## 1. Bestandsaufnahme

### 1.1 Öffentlich im Repository

| Artefakt | Inhalt | Prüfung |
|---|---|---|
| `docs/quant-recovery/v13/delisted/register-1.0.0.json` | 4.322 beendete Referenzketten. Spalten: `chainId` (HMAC-verschlüsselt), `cik`, Start- und Endjahr als 5-Jahres-Bucket, `status`, `endSourced`, `terminalClass`, `weeks`, `gapCut`, `pointsSha256` | SHA-256 `ea986202…7a6f`; stimmt mit `coverage-1.0.0.json` (`inputs.register`) und `s2-population-1.0.0.json` überein |
| Protokoll 1.0.0, Nachträge 1.0.1 und 1.0.2, Studienregistrierung 1.0.0 | Regeln R1–R7, C1–C5, Kennungsnachtrag | alle vier `.sha256`-Dateien stimmen mit dem Dateiinhalt überein |
| `scripts/quant/v13/delisted/qualify.py` | Qualifikation | SHA-256 `6addb5ff…` = `codeSha256` im Register |
| `coverage-1.0.0.json`, `v13/studies/*`, `v13b/*`, `v13c/*` | Abdeckung und Studienergebnisse S1–S3 (F0/F1/F1c/F1w/F1d) | – |
| `docs/quant-recovery/v13b/hist/register-1.1.0.json` | 1.688 QUALIFIED (+13) | nicht Teil dieser Studie; dafür wäre eine neue Registrierung nötig |
| `docs/quant-recovery/v13/archive/manifest-1.2.0.json` und `archive-pub.pem` | Manifest des verschlüsselten Archivs, gültige Version 1.2.0 (8 Teile, 11.616 Dateien, 1,50 GB; 1.0.0 und 1.1.0 wurden nie hochgeladen) | – |

**Öffentlich fehlen Ticker, exakte Intervalle und Kurse.** Nachtrag 1.0.1 C5 schwärzt sie bewusst. Ticker, Börse, Ketten-Start, letzter Handelstag und Kurse stehen nur in den privaten Dateien.

### 1.2 Bestätigte Zählungen

| Behauptung | Befund | Beleg |
|---|---|---|
| 1.675 QUALIFIED | **bestätigt**: 1.130 MERGER, 56 DISTRESS, 489 UNKNOWN; `gapCut` 0; 55 bis 1.907 Wochen | Register `counts` und Zeilen nachgezählt |
| +390 Ketten in der Quant-Hauptstudie (F1) | **bestätigt**: 4.719 Listings; 1.285 Ketten scheitern an der Wochenlabel-Regel | `s2-population-1.0.0.json`, `populations.F1.delisted.added` |
| +1.576 in der erweiterten Sensitivität (F1w) | **bestätigt**: 5.905 Listings, davon 1.186 Ketten mit umbenanntem letztem Balken | dieselbe Datei, `F1w` |
| Lücke vor 2010 | **bestätigt**: QUALIFIED nach Endjahr 2005–09: 12, 2010–14: 141, 2015–19: 586, 2020–24: 750, ab 2025: 186. SEC-Delisting-Ereignisse mit Kursreihe 2005: 0 von 234 | Register, `coverage-1.0.0.json` |

F1 und F1w sind Regeln für **Wochen**-Frames der Quant-Studien. Für Supertrader, das mit Tagesbalken arbeitet, gelten sie nicht. Hier entscheidet der Tageskalender des Snapshots.

### 1.3 Privat und verschlüsselt: wo, und hier erreichbar?

| Ort | Inhalt | Hier zugänglich? |
|---|---|---|
| Actions-Artefakte der Läufe 40872752947, 40877544263, 40887984799 (`v13-delisted-*`) | Tagesreihen aller 4.278 Ticker (Spalten `date, open, high, low, close, volume, adjClose, divCash, splitFactor`), RSA-OAEP und AES-256 | Die Artefakte existieren laut GitHub-API **bis 05.11.2026** (Aufbewahrung 7 Tage). Zum Entschlüsseln braucht es den privaten Transportschlüssel des Abrufs. Er liegt nicht im Repository und nicht im Archiv. **Nein.** |
| Archiv 1.2.0, Teil `v13-raw` (Tagesdaten) und `v13-derived` (Wochenreihen, Register 1.0.0) | Wird mit dem privaten Archivschlüssel entschlüsselt | Laut Owner verschlüsselt in R2 (Präfix `research-snapshots/quant-v13/archive-1.2.0/`; die README nennt mit Stand 29.10. den Upload noch als offen). Entschlüsseln braucht den privaten Archivschlüssel (Secret `V13_ARCHIVE_PRIVATE_KEY`), der in dieser Umgebung nicht vorliegt. **Nein.** |
| Supertrader-Snapshot `sts1-134d4d62…` (Universum A) | Privater R2-Eimer, Zugriff nur über die Actions-Secrets `VU_HISTORY_S3_*` | **Nein.** |

In dieser Umgebung gibt es weder V13-Dateien noch Archiv-Chiffrate noch Schlüssel. Die Umgebungsvariablen enthalten keinen V13- oder Archivschlüssel. Vorhandene allgemeine Cloud-Zugangsdaten wurden nicht benutzt. Das Archiv hat keinen Lesepfad, der ohne den privaten Schlüssel auskommt. Deshalb gab es auch keinen Listing-Versuch.

### 1.4 Rechte

- **Tiingo:** Seit 13.09.2026 gilt `OWNER_DECLARED_LICENSED` (`quant/config/provider-profiles.json`, Pauschaltarif, Erklärung des Owners).
  - `derivedValues` ist `OWNER_DECLARED`.
  - `aiUsage` und `modelTraining` sind `UNKNOWN`.
  - Der Vertragstext liegt nicht vor.
- **V13-Abruf:** Er lief unter dieser Freigabe (Budget ≤ 7.500 Anfragen je Lauf, kein Zusatzentgelt).
- **Interne Supertrader-Nutzung:** Sie ist eine interne Research-Nutzung derselben Anbieterdaten mit demselben Zweck wie die Supertrader-Snapshots (`docs/SUPERTRADER_DURABLE_RESEARCH_SNAPSHOTS.md` §5). Eine neue Nutzungsart entsteht dadurch nicht.
  - Eine **ausdrückliche** Owner-Freigabe, delistete V13-Reihen für Supertrader zu verwenden, gibt es nicht. Sie steht als Owner-Schritt O1 in Abschnitt 6.
- **Veröffentlichung der Ergebnisse:** Ungeklärt. Supertrader hält Backtest-Kennzahlen bisher versiegelt (Eigentümer-RSA). Öffentlich erscheinen nur Zählungen und Hashes.
  - Der Runner folgt dieser Regel: Der öffentliche Teil enthält keine Kennzahl, keinen Ticker, keine `chainId` und keinen Kurs (`publication: OWNER_DECISION_REQUIRED`).

### 1.5 Herkunft und Hashes

**Register:**
- je Kette `pointsSha256` (Python `json.dumps`, Trennzeichen `(',', ':')`);
- Chiffretext-Hashes der drei Abrufläufe;
- Hashes der Referenzketten, des Delisting-Registers und der Delisting-Gründe;
- Protokoll- und Code-Hashes;
- Kontrollen: 10 Titel, 1.921 von 1.921 Wochen innerhalb von 0,5 %.

**Archiv-Manifest:** Klartext- und Chiffre-SHA-256 je Teil, dazu ein Inventar je Datei.

**Neu in dieser Studie – Bindung der Tagesbalken:**
- Das Register bindet nur **Wochen**-Schlüsse.
- Der Runner rechnet sie aus den Tagesbalken nach (`validation/lib.mjs#adjustSeries`, derselbe Divisor wie `qualify.py` C3) und verlangt Gleichheit Woche für Woche.
- Ein Test prüft das gegen `qualify.py` selbst: gleiche Punkte, gleicher `pointsSha256`, inklusive Split.

### 1.6 Identität

- **V13-Ketten:** Kennung ist `chainId` = HMAC(Ticker|Börse|Endjahr). Bei Kollision bekommt sie nach Nachtrag 1.0.2 einen Start-Suffix.
- **Supertrader-Listings:** `tiingo:<EX>:<TICKER>:<start>`. Die securityId folgt `core/identity.js#securityIdForTicker` (`ref_<TICKER>`, nicht stabil über Tickerwechsel, ADR-001).
- **Zuordnung im Runner:** Eine Kette gilt als Dublette eines A-Listings, wenn
  - die securityId gleich ist und sich die Intervalle überschneiden (Toleranz 10 Tage wie `buildListingTable`), oder
  - die Serie gleich ist (Schlüssel aus dem letzten Balken, wie die Doppelhistorien-Regel in `loadPitData`), oder
  - die CIK gleich ist und sich die Intervalle überschneiden (CIK aus `sec-pit r12`, wo vorhanden).
  Überschneidungen innerhalb von B behalten die frühere Kette. Alle Ausschlüsse werden gezählt.
- **Risiko Doppel-Listings:** **hoch**. A enthält bereits 7.299 inaktive Listings (`tiingo-delisted`, abgerufen je `ticker@startDate`) aus derselben Quelle. V13 hat nur Ketten abgerufen, für die *Quant* keine Reihe hatte; maßgeblich war nicht der Bestand von Supertrader. Wie groß die Überschneidung ist, lässt sich hier nicht messen: Das öffentliche Register hat keine Ticker, die Listing-Tabelle von A liegt privat. Die Zahl liefert erst der Lauf (`universeB.excluded`).
- **Neu vergebene Ticker:** Hier gewinnt B nichts. V13 schließt 162 Ketten als `NEWER_LISTING_ONLY` aus, Supertrader führt solche Ketten als `UNFETCHABLE_REUSED`. Eine ältere Kette mit demselben Ticker, aber ohne Intervallüberschneidung, bleibt erlaubt (Test).

### 1.7 Quarantäne (83 Fälle, CC-5)

- **Herkunft:** V4-D1 ([SUPERTRADER_6_V4D1_CONTAINMENT.md](SUPERTRADER_6_V4D1_CONTAINMENT.md), [SUPERTRADER_7_V4D1_RESOLUTION.md](SUPERTRADER_7_V4D1_RESOLUTION.md)). Die EDGAR-Prüfungen 1.4.0–1.4.3 haben keine der 83 referenzexponierten DQ-K5-Sitzungen belegt. Das Overlay ist leer, die Quarantäne bleibt aktiv, CC-5 bleibt offen ([SUPERTRADER_8_ACTIVATION_READINESS.md](SUPERTRADER_8_ACTIVATION_READINESS.md)).
- **Umsetzung im Runner:** Die Quarantäne wird angewandt, **nachdem** B gebaut ist, und zwar für jedes Wertpapier in A und B gleich:
  - **primär `DQ-K5-BOOK`** (`integrity/discontinuity.mjs`): eine Obermenge der 83 Sitzungen;
  - **optional `CA-Q-K5-DATES`**: die versiegelte Sitzungsliste aus `run-sf7-ca-resolution` für A über `quarantineUnresolved`; zugefügte Ketten werden an ihren DQ-K5-Markierungen geschnitten.
- **Kontrolle:** Der A-Teil von B muss stückgenau gleich dem quarantänisierten A sein, sonst bricht der Lauf ab (`QUARANTINE_NOT_IDENTICAL_IN_A_AND_B`).
- **Abgrenzung:** Die Studie löst keine Quarantäne auf und ändert CC-5 nicht.

## 2. Historischer Supertrader-Backtestpfad und Einspeisestelle

- **Universum A:**
  - `validation/analyze-methods.mjs#loadPitData` auf dem Snapshot (`CANONICAL_LOAD`);
  - danach `runner/snapshot-input.mjs#datasetFromPit` und `run-sf3-research.mjs#attachSecPit` (r12).
  - Ergebnis: 15.565 Listings, 9.211 Segmente, Fenster DEV 2015-01-01 (Vorlauf) / 2016-01-04 bis 2026-09-30.
  - Delistete Listings enden als `LISTING_INACTIVE` und werden nach research-v1 mit `S0_LAST_PRICE` abgerechnet.
- **Referenzen:** `research/sf6-references.mjs` (`SF6_REFERENCES`, je REF-Variante):
  - C06 `MINERVINI_SEPA` und C07 `MINERVINI_POWER_PLAY` über `minervini-execution.mjs`;
  - C08 `KK_BREAKOUT` und die übrigen sf5-Lebenszyklen über `lifecycle-engine.mjs`;
  - Turtle über `methods/turtle.mjs`.
- **Kosten:** `REFERENCE_COSTS`, 10 Bp Slippage je Seite und 1 Bp Kommission.
- **Portfolio:** `PLATFORM_RESEARCH_PORTFOLIO_POLICY` bzw. `EQUITY_RESEARCH_PORTFOLIO_POLICY`, 100.000 Startkapital.
- **Einspeisestelle:** der Datensatz `{ calendar, securities, spyTR, benchmark }` zwischen `datasetFromPit` und `SF6_REFERENCES[k].run`.
  - Der Research-Runner hängt die zusätzlichen Ketten dort als Wertpapiere an. Sie laufen durch denselben Produktionspfad: `splitSegments`, `segmentEndCause`, `securityFromSegment`.
  - Es gibt keine Änderung an Produktionscode; alle Engines werden nur lesend importiert.

## 3. Was dieser PR liefert

| Datei | Zweck |
|---|---|
| [`scripts/supertrader/source-faithful/research/st9-v13-delisted-study.mjs`](../scripts/supertrader/source-faithful/research/st9-v13-delisted-study.mjs) | Bindung (Register-Hash, Wochenhash über `research-delisted-series.cjs`, Tagesbalken gegen Wochenreihe, Terminalklasse und Szenarien), Universum B (Dedupe, PIT), Quarantäne, Läufe A und B mit identischen Parametern, Kennzahlen, Szenarioband, Hypothesen |
| [`scripts/supertrader/source-faithful/research/run-st9-v13-delisted-study.mjs`](../scripts/supertrader/source-faithful/research/run-st9-v13-delisted-study.mjs) | CLI: Snapshot wie `run-sf6-integrity`; schreibt nur nach `--out` außerhalb des Repositorys; prüft den Registrierungshash |
| [`scripts/supertrader/source-faithful/research/st9-v13-delisted-registration-1.0.0.json`](../scripts/supertrader/source-faithful/research/st9-v13-delisted-registration-1.0.0.json) | Vorab-Registrierung (SHA-256 `548b8079…36bc`, im Runner und im Test festgeschrieben): Universen, PIT, Quarantäne, Methoden, eingefrorene Parameter mit SHA-256 der Quelldateien auf `adbc2f0444`, Terminal-Szenarien, Kennzahlen, H1–H3 |
| [`scripts/supertrader/tests/sf-st9-v13-delisted-study.test.mjs`](../scripts/supertrader/tests/sf-st9-v13-delisted-study.test.mjs) | 13 Tests, nur synthetische Daten (siehe 5.) |

**Regeln, die der Runner einhält:**
- **Nur QUALIFIED aus Register 1.0.0.** CA_UNRESOLVED, CA_MISMATCH, PRICE_ONLY und Register 1.1.0 bleiben draußen.
- **Point in time:** Handel nur im Intervall [Ketten-Start, letzter Handelstag] ∩ Fenster und nur auf Sessions des Snapshot-Kalenders. Ein Ende im Fenster ist `LISTING_INACTIVE` am tatsächlichen letzten Handelstag; ein Ende danach ist `WINDOW_END` ohne Terminal.
- **Terminal-Szenarien nach V13 R6:** MERGER 0 / −10 / +10 %, DISTRESS und UNKNOWN 0 / −30 / −100 %.
  - Sie gelten nur für die Terminalabrechnung **zugefügter** Ketten. A-eigene Delistings bleiben bei 0, wie im V13-Nachtrag 1.0.1 O1.
  - Die Engines rechnen T0 ab (`S0_LAST_PRICE`). T1 und T2 verschieben den gebuchten Erlös und werden ohne Wiederanlage fortgeschrieben, also als Band erster Ordnung. Neue Szenarien gibt es nicht.
- **Holdout gesperrt:** Das Fenster 2008–2015 bleibt unberührt; `ST_WINDOW=HOLDOUT` wird abgelehnt.

## 4. Machbarkeit je Methode

| Methode | Machbar mit V13-Daten? | Einschränkung |
|---|---|---|
| C06 Minervini SEPA | ja, mit Tages-OHLCV aus `v13-raw` | Fundamentaldaten sind in REF nicht sperrend (`EVIDENCE_MANUAL`); zugefügte Ketten haben kein `fund`. Das RS-Perzentil ändert sich mit der Population (gewollter B-Effekt). |
| C07 Minervini Power Play | ja | wie C06 |
| C08 Kullamägi Breakout | ja | – |
| C01/C02 Turtle S1/S2, C03 Darvas, C11 Pocket Pivot, C12 Buyable Gap-Up, C13 Holy Grail | ja | – |
| C04/C05 Weinstein Investor/Trader | ja | REF ohne Gruppenfilter (Datenausnahme wie in A) |
| C09 Kullamägi Episodic Pivot | **nein** | braucht echte Minutenbalken; V13 hat nur Tagesbalken |

**Gemeinsame Grenzen:**
- **Wirkung nur im DEV-Fenster.** Ketten mit Ende vor 2015 fallen heraus; nach Endjahr-Buckets bleiben höchstens 1.522 Kandidaten. Die Lücke vor 2010 spielt deshalb für Supertrader keine Rolle, dafür aber die Überschneidung mit A.
- **Wochenreihen reichen nicht.** Die Wochenreihen aus `v13-derived` genügen den Methoden nicht; nötig ist der Teil `v13-raw` mit den Tagesdaten.
- **Fusionsgegenleistungen** bleiben unverifiziert und erscheinen nur als Band.

**Urteil:** Technisch machbar, **sobald** die Daten am Ort des Snapshots liegen. Wie groß der Nutzen ist, hängt von der unbekannten Überschneidung mit A ab. H3 erwartet weniger als 5 % der B-Trades in zugefügten Ketten.

## 5. Tests (synthetisch, keine privaten Daten)

`node --test scripts/supertrader/tests/sf-st9-v13-delisted-study.test.mjs`: 13 Tests. Sie prüfen:
- **Registrierung:** Hash festgeschrieben, Szenarien gleich Protokoll R6, Kosten gleich `REFERENCE_COSTS`, Methodenliste gleich `SF6_REFERENCE_KEYS`.
- **Echtes Register:** Hash gleich `V13_REGISTER_SHA256`.
- **ISO-Wochen:** gleich Python `isocalendar` an Jahresgrenzen.
- **Bindung:** Tagesbalken gegen Wochenreihe, mit erklärtem Split.
- **Fail closed:**
  - Register-Hash weicht ab;
  - Wochenhash weicht ab (`DELISTED_POINTS_HASH_MISMATCH`);
  - Tagesbalken weichen von der Wochenreihe ab;
  - Wochen- oder Tagesdatei fehlt, oder das Verzeichnis fehlt;
  - Terminal-Zuordnung weicht ab.
- **Dedupe:**
  - Ausschluss bei gleicher securityId und Intervall, gleicher Serie, gleicher CIK und Intervall, Dublette innerhalb von B, Lage außerhalb des Fensters;
  - ein neu vergebener Ticker bleibt erhalten;
  - A bleibt unverändert.
- **PIT:** Vorlauf-Schnitt, Ende am letzten Handelstag als `LISTING_INACTIVE`, Ende nach dem Fenster als `WINDOW_END`.
- **Zwangsausstieg beim Delisting** (Turtle S1 hält eine zugefügte Kette):
  - T0 = letzter Schluss;
  - DISTRESS: T1 = 0,3 × T2;
  - MERGER: −10/+10 %;
  - A-eigene Delistings bleiben bei 0;
  - Ledger abgestimmt.
- **Identische Parameter:** Hash in A und B gleich. B ohne Zugaben ergibt exakt A (Turtle S1, KK Breakout).
- **Quarantäne:** gleiche Schnitte in A und im A-Teil von B; zugefügte Ketten werden geschnitten; Modus mit Sitzungsliste; ohne Liste bricht der Lauf ab.
- **Szenario-Anpassung:** isoliert geprüft.
- **Ausgabe:** `--out` im Repository wird abgelehnt; der öffentliche Teil enthält keine Kennzahl, keinen Ticker und keine `chainId`.
- **Gegenprobe mit `qualify.py`** (Python): gleiche Wochenpunkte, gleicher `pointsSha256`.

## 6. Ausführung beim Owner oder Operator

**Voraussetzungen (Owner):**
- **O1:** ~~Freigabe, die V13-Delisting-Reihen für Supertrader-Research zu nutzen~~ – erteilt (Ergebnisse intern). Offen bleibt die Entscheidung zur Veröffentlichung der Kennzahlen.
- **O2:** Archiv 1.2.0 liegt laut Owner in R2. Vor dem Lauf `[v13-archive:verify]` (Objekte gegen `manifest-1.2.0.json`) und der private Archivschlüssel als Secret `V13_ARCHIVE_PRIVATE_KEY`.
- **O3:** Ist das Archiv verloren, sind die Actions-Artefakte die letzte Kopie der Tagesdaten. Sie verfallen am **05.11.2026** und sind nur mit dem Transportschlüssel der Bausitzung lesbar. Danach ist ein Neuabruf nötig (8.620 Anfragen, Pauschaltarif, braucht eine Owner-Freigabe). Die Register-Hashes machen ihn prüfbar.
- **O4:** Eine Umgebung, die den Snapshot (R2-Secrets `VU_HISTORY_S3_*`) und das entschlüsselte Archiv gleichzeitig sieht. Dafür gibt es noch keinen Workflow; ein solcher wäre ein eigener Gate-A-PR mit `contents: read`.

**Befehl** (`<priv>` = Ziel der Wiederherstellung. `restore-archive.sh` legt den Teil `v13-derived` unter `<priv>/v13-derived/series` ab und `v13-raw` unter `<priv>/v13-raw/raw/<run>/series.jsonl.gz`. `<out>` liegt außerhalb des Repositorys):

```bash
scripts/quant/v13/archive/restore-archive.sh docs/quant-recovery/v13/archive/manifest-1.2.0.json <archiv> archive-priv.pem <priv> v13-raw v13-derived
node --max-old-space-size=8192 scripts/supertrader/source-faithful/research/run-st9-v13-delisted-study.mjs \
  --snapshot sts1-134d4d62eb88b6ff8d98fe6e56b12a6d --accounting research-v1 \
  --v13-series <priv>/v13-derived/series --v13-raw <priv>/v13-raw/raw --out <out> \
  [--quarantine CA-Q-K5-DATES --quarantine-dates <versiegelte CA-Q-K5-Liste>.json] [--write-plain]
```

Vorher `--preflight` mit denselben Argumenten: listet jede fehlende Eingabe (Exit 3), rechnet nichts. Die historische Infrastruktur (Punkt-in-Zeit, Identität, Delisting, Abdeckung) steht in [SUPERTRADER_9_HISTORICAL_BACKTEST_INFRASTRUCTURE.md](SUPERTRADER_9_HISTORICAL_BACKTEST_INFRASTRUCTURE.md).

Bei einer Abweichung (Hash, Bindung, Quarantäne) bricht der Runner mit `STUDY_INPUT_REFUSED: <CODE>` bzw. `INPUT_INTEGRITY_FAILURE` ab. Ein Teilergebnis gibt es nicht.

## 7. Ausgabeformat

- **`st9-v13-delisted.public.json`** (zur Veröffentlichung geeignet, weil ohne Kennzahlen):
  - `receipt`: Snapshot-ID, Datensatz-Hash, Registrierungs-, Studien- und Engine-Code-Hash, Lauf, Commit;
  - `parametersSha256`;
  - `universeB`: `chainsIn`, `added`, `addedSecurities`, `excluded{DUPLICATE_A_SECURITY_ID_INTERVAL, DUPLICATE_A_SERIES, DUPLICATE_A_CIK_INTERVAL, DUPLICATE_WITHIN_B, OUTSIDE_WINDOW, SHORT_IN_WINDOW}`, `barsOffCalendar`, `addedByTerminalClass`;
  - `v13`: Register-Hash, `requested`/`loaded`/`dailyBoundChains`, Ketten-Hash;
  - je Methode die Tradezahl A/B und die Abstimmung.
- **`st9-v13-delisted.sealed.json`** (Eigentümerschlüssel) bzw. mit `--write-plain` **`.private.json`**. Je Methode `A` und `B` mit:
  - `trades`, `closedTrades`, `openAtDataEnd`, `tradesByOrigin{A_OWN,B_ADDED}`;
  - `hitRate`, `stopExits`;
  - `delisting{trades, byOrigin, pnlS0ByOrigin, losingByOrigin, addedByTerminalClass}`;
  - `scenarios{V13_T0,V13_T1,V13_T2: {cagr, maxDrawdown, endingEquity, terminalShockTotal}}`;
  - `reconciliation`.

  Dazu je Methode:
  - `deltaBminusA{cagrT0, maxDrawdownT0, hitRate, trades, stopExits}`;
  - `survivorshipSensitivity{cagrA, cagrBBand, terminalScenarioSpread}`;
  - `parametersSha256{A,B}`.

  Gesamt: `hypotheses{H1,H2,H3}` je Primärmethode (`HOLDS` / `DOES_NOT_HOLD` / `NOT_EVALUABLE`).

Ein Ergebnis ändert keine Produktregel. Eine verletzte Hypothese ist ein Befund für den Owner, kein Anlass zur Regeländerung.
