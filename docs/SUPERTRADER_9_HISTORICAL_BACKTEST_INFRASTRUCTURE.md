# Supertrader 9 – historische Backtest-Infrastruktur der isolierten Studie

Stand 31.10.2026, Basis `main` @ `d961971f4f`. Evidenzart `HISTORICAL_DEVELOPMENT_STUDY`, `DIAGNOSTIC_NOT_CERTIFIED`, `productionApproved: false`.

Dieses Dokument ergänzt die V13-Vergleichsstudie A gegen B ([SUPERTRADER_9_V13_DELISTED_REUSE.md](SUPERTRADER_9_V13_DELISTED_REUSE.md), #1142). Es beschreibt Diagnosen und Prüfungen **um** die Studie herum. Unverändert bleiben:
- die Registrierung `st9-v13-delisted-registration-1.0.0.json` (SHA-256 `548b8079…36bc`), ihre Universen, Parameter, Szenarien und Hypothesen;
- alle Strategien, Engines, Kosten, das Ausführungsmodell, Snapshot, `quant/data`, `supertrader/data`, Produktions-Signale, SF8;
- der Security Master und die Identitätssperre aus #1159.

Es wurde **kein** Studienlauf ausgeführt und keine Zahl auf echten Daten berechnet. Alle Tests nutzen synthetische Daten.

## 1. Bestand vor dieser Arbeit (wiederverwendet, nicht neu gebaut)

| Thema | Vorhanden in | Was es schon leistet |
|---|---|---|
| Listing-Fenster statt heutiger Ticker | `validation/analyze-methods.mjs#loadPitData`, `validation/lib.mjs#buildListingTable`, `#splitSegments` | Listings je `ticker@startDate` mit Ende, Balken nur im Intervall [Start, Listing-Ende] ∩ Fenster und auf dem SPY-Kalender; Segmente bei Lücken > 30 Tagen |
| Delisting | `analyze-methods.mjs#segmentEndCause`, `runner/snapshot-input.mjs#securityFromSegment`, `validation/portfolio.mjs#SCENARIOS` | Ende im Fenster = `LISTING_INACTIVE` am letzten Balken; Abrechnung `S0_LAST_PRICE` (letzter Schluss minus Slippage); Datenlücke = `DATA_GAP` |
| kein Fortschreiben | `validation/accounting-contract.mjs` (A4/A5) | eine Position ohne frischen Kurs höchstens 5 Sitzungen zum letzten Schluss, danach `SECURITY_UNAVAILABLE`; Datenereignisse sind keine Delistings |
| Stop-Ausführung | `lifecycle-engine.mjs`, `minervini-execution.mjs`, `methods/turtle.mjs` | Stop füllt zu `min(open, stop)`: Gap durch den Stop → Eröffnung, nie der Stop; Gleichtags-Stops nach Intrabar-Regel (`PESSIMISTIC`/`OPTIMISTIC`) gekennzeichnet |
| unabhängige Ausführungsprüfung | `research/sf7-execution-checks.mjs` | Ledger gegen Balken (`checkLedgerAgainstBars`), Lebenszyklus-Prüfung inkl. `STOP_EXIT_NOT_MIN_OPEN_STOP` (`checkLifecycleRun`), PIT-Korruptionstest, Trade-Vergleich (`compareTradeSets`) |
| Dubletten V13 ↔ A | `st9-v13-delisted-study.mjs#buildUniverseB` | securityId + Intervall, Serie, CIK + Intervall, innerhalb B |
| Identitätssperre | `scripts/market/build-security-master-identity-blocklist.mjs` (#1159) | Liste gesperrter securityIds beim Stammwechsel 1.1.0 → 1.3.0; Nachrechnung durch `backtest-generation-freeze.cjs` |
| Reproduzierbarkeit | Snapshot-Vertrag (`snapshot/*.mjs`), Registrierungs-Hash, `parametersSha256`, Quittung | eingefrorener Datensatz-Hash, Code-Hashes, identische Parameter in A und B |

## 2. Datenseite: `research/st9-hist-universe.mjs` (dieser PR)

### 2.1 Point-in-Time-Universum

- `listingWindows` fasst die Segmente eines Listings zu einem Fenster zusammen: erster Balken, letzter Balken, Ende, Herkunft (`A_OWN` / `B_ADDED`).
- `membersAt(windows, d)`: Mitglieder an einem Tag sind genau die Listings, deren eigenes Intervall den Tag enthält. Es gibt keine heutige Tickerliste.
- `pitUniverseByYear`: je Jahr Listings (A, B), Neuzugänge, Enden (wirtschaftlich / Datenlücke) und Anteil der Überlebenden. Damit ist Survivorship je Jahr sichtbar.
- `assertPointInTime` (**fail closed**): nicht steigende Daten (`PIT_DATES_NOT_INCREASING`), Balken nach dem wirtschaftlichen Ende (`PIT_BAR_AFTER_TERMINAL`, also Fortschreiben), Balken nach dem Fensterende (`PIT_BAR_AFTER_WINDOW`).
- Nur gezählt, nie repariert: Balken außerhalb des Kalenders; Läufe von ≥ 5 unveränderten Balken ohne Umsatz (Signatur eines Fortschreibens, Grenze = `staleCarryMaxSessions`); letzter Balken ohne Umsatz.

### 2.2 Doppelte Listings und Identität

- Gruppierung nur über `core/identity.js#securityIdForTicker` (ADR-001).
- `DUPLICATE_LISTING_OVERLAP`: zwei Listings derselben securityId mit überlappendem Intervall.
- `TICKER_REUSE_SEQUENTIAL`: dieselbe securityId nacheinander. Erlaubt, aber als mehrdeutige Identität gekennzeichnet (Owner-Entscheidung 30.10.2026).
- **Gegenprobe zur Dublettenregel von B:** Eine zugefügte Kette mit Überlappung bricht den Lauf ab (`IDENTITY_DUPLICATE_IN_ADDED`). Die Prüfung nutzt engere Intervalle als `buildUniverseB` und kann deshalb nur einen Fehler dort finden.
- **Sperrliste aus #1159 als Eingang**, nicht nachgebaut:
  - `readIdentityBlocklist` verlangt einen festgeschriebenen SHA-256 sowie Schema und Erzeuger, die aus dem Builder importiert werden (`BLOCKLIST_SCHEMA`, `BLOCKLIST_GENERATOR`). Eine handgeschriebene Liste wird abgelehnt.
  - Die Nachrechnung gegen alten und neuen Stamm bleibt Aufgabe von `backtest-generation-freeze.cjs`; die Studie nimmt die Hashes beider Stämme in die Quittung auf.
  - Die registrierte Studie nutzt nur `FLAG`: Universen unverändert, Treffer je Grund gezählt. `EXCLUDE` existiert für eine künftige Registrierung und wird hier nicht benutzt.

### 2.3 Delisting

`terminalOutcomes` klassifiziert jedes Listing-Ende:

| Ausgang | Quelle | Behandlung |
|---|---|---|
| `DELISTED_MERGER` | V13-Klasse `MERGER` oder SEC-`delistClass` `ACQUISITION` | Ausstieg am letzten handelbaren Schluss (S0); V13-Band für zugefügte Ketten |
| `DELISTED_DISTRESS` | V13-Klasse `DISTRESS` | S0, Band 0 / −30 / −100 % |
| `DELISTED_UNKNOWN_CENSORED` | kein klassifizierender Beleg (auch A-eigene Enden ohne Klasse; eine Distress-Kurssignatur ist kein Ausgang und wird getrennt gezählt) | S0 als Punktwert, Ausgang **zensiert** |
| `DATA_GAP_CENSORED` | Segmentende durch Datenlücke | Datenereignis, kein Delisting |
| `WINDOW_END_RIGHT_CENSORED` | Listing läuft über das Fenster hinaus | offen, rechtszensiert |
| `ACTIVE_AT_WINDOW_END` | Überlebender | – |

Es wird nichts fortgeschrieben. Der letzte Balken ist der letzte Handelstag; dahinter gibt es keinen Balken, wie §2.1 erzwingt.

### 2.4 Abdeckung und Unsicherheit

- `dataCoverageByYear`: je Jahr Wertpapiere (A, B), Balken, Anteil mit SEC-Fundamentaldaten, Anteil zugefügter Balken.
- Kennzeichen: `WARMUP_ONLY`, `PARTIAL_YEAR`, `V13_SPARSE_BEFORE_2010`, `ADDED_CHAINS_WITHOUT_FUNDAMENTALS`, `NO_DATA`.
- `METHOD_DATA_REQUIREMENTS` je Methode:
  - C06/C07: Fundamentaldaten nicht sperrend (`FUNDAMENTALS_NOT_BLOCKING_EVIDENCE_MANUAL`);
  - C04/C05: `GROUP_FILTER_NOT_APPLIED`;
  - C09: ausgeschlossen (`NOT_MEASURABLE_NO_MINUTE_BARS`);
  - übrige Methoden: nur Tages-OHLCV.

### 2.5 Einbindung in den Runner

- `run-st9-v13-delisted-study.mjs` rechnet die Diagnosen für A und B, **nachdem** B gebaut ist und bevor die Methoden laufen. Das registrierte Ergebnis (`result`) bleibt unverändert.
- Der öffentliche Teil bekommt `historicalInfrastructure` mit Zählungen ohne Ticker, Listing-ID oder Kurs. Die Kennzeichen je Listing stehen nur im versiegelten Teil.
- `--preflight` prüft alle Eingaben, ohne den Snapshot zu öffnen, und listet fehlende auf (Exit 3). Secrets werden nur über ihren Namen geprüft.
- Neue Optionen: `--identity-blocklist <datei> --identity-blocklist-sha256 <hex>`.
- `STUDY_FILES` (Code-Hash der Quittung) enthält das neue Modul.

## 3. Was für einen echten Lauf fehlt

`--preflight` meldet in dieser Umgebung genau:

| Code | Fehlt | Wer |
|---|---|---|
| `SNAPSHOT_STORE_SECRET_MISSING` × 4 | `VU_HISTORY_S3_ENDPOINT`, `_BUCKET`, `_ACCESS_KEY_ID`, `_SECRET_ACCESS_KEY` (Snapshot `sts1-134d4d62…`) | Actions-Secrets, nur in einem Workflow |
| `V13_SERIES_DIR_MISSING` | Archiv 1.2.0, Teil `v13-derived` (1.675 QUALIFIED-Wochenreihen) | Entschlüsseln mit `V13_ARCHIVE_PRIVATE_KEY`, `restore-archive.sh` |
| `V13_DAILY_DIR_MISSING` | Archiv 1.2.0, Teil `v13-raw` (`raw/<run>/series.jsonl.gz`) | wie oben |
| optional `QUARANTINE_DATES_MISSING` | versiegelte CA-Q-K5-Sitzungsliste (nur Modus `CA-Q-K5-DATES`) | Owner-Schlüssel |
| optional | Identitätssperrliste aus dem committeten Stamm 1.3.0 mit SHA-256 | erst nach dem Stammwechsel (#1143/#1163) |

Außerdem fehlt ein Workflow, der Snapshot und entschlüsseltes Archiv gleichzeitig sieht (O4 in der Studie). Er wäre ein eigener Gate-A-PR mit `contents: read`, ausgelöst nur durch den Owner.

## 4. Abhängigkeit vom Security Master 1.1.0 → 1.3.0

- **Keine harte Abhängigkeit.** Universum A stammt aus dem eingefrorenen Snapshot. Die securityId kommt aus `core/identity.js`, nicht aus dem Stamm.
- **Weiche Abhängigkeit:** Die Identitätssperre gibt es erst, wenn Stamm 1.3.0 committet und die Liste daraus erzeugt ist (Schritt 1 in [SECURITY_MASTER_IDENTITY_BLOCKLIST.md](data/SECURITY_MASTER_IDENTITY_BLOCKLIST.md)). Bis dahin läuft die Studie ohne sie (`identityBlocklistMode: NOT_SUPPLIED`). Danach wird sie nur gelesen und gezählt.
- Ändert der Erzeuger Schema oder Version, folgt die Prüfung automatisch, weil die Konstanten importiert werden. Eine Liste der alten Version wird dann abgelehnt.
- Ändert sich `core/identity.js`, stimmt der in der Registrierung festgeschriebene Hash nicht mehr. Das erfordert eine neue Registrierung.
- An Stamm, Gate, Freigabeliste und Sperrlogik ändert diese Arbeit nichts.

## 5. Tests

`node --test scripts/supertrader/tests/sf-st9-hist-universe.test.mjs`, 7 Tests, nur synthetische Daten:
- **PIT-Mitgliedschaft:** Ein delistetes Listing verlässt das Universum, ein neues tritt ein; Survivorship je Jahr.
- **PIT fail closed:**
  - Balken nach dem Ende, unsortierte Daten, Balken nach dem Fenster;
  - gezählt werden die Fortschreib-Signatur und Balken außerhalb des Kalenders.
- **Identität:** Überlappung (A und zugefügt), aufeinanderfolgende Wiederverwendung, securityId über `core/identity.js`.
- **Sperrliste:**
  - abgelehnt werden: falscher Hash, kein Hash, fehlende Datei, falscher Erzeuger, falsches Schema, Dublette, Stamm-Hashes;
  - `FLAG` lässt den Datensatz unverändert, `EXCLUDE` entfernt die gesperrten IDs.
- **Delisting-Ausgänge:** alle sechs Klassen, Zählung der zensierten Ausgänge.
- **Abdeckung je Jahr und Methode:** Der öffentliche Teil enthält weder Ticker noch ID.
- **Preflight:** listet genau die fehlenden Eingaben; ist ein vollständiger synthetischer Satz vorhanden, meldet er `ready`.
