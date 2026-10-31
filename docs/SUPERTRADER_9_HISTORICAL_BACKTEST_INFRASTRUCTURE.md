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
- `PIT_BAR_AFTER_TERMINAL` ist eine **Schutzprüfung, keine Gegenprobe**: `securityFromSegment` setzt das Enddatum auf den letzten Balken des Segments. Auf dem Produktionspfad kann die Prüfung deshalb nicht anschlagen. Sie greift erst, wenn ein späterer Umbau Balken hinter das Ende schreibt. Unabhängig belegt sie nichts; der Test zeigt nur, dass sie bei einem manipulierten Datensatz abbricht.
- Nur gezählt, nie repariert: Balken außerhalb des Kalenders; Läufe von ≥ 5 unveränderten Balken ohne Umsatz (Signatur eines Fortschreibens, Grenze = `staleCarryMaxSessions`); letzter Balken ohne Umsatz.

### 2.2 Doppelte Listings und Identität

- Gruppierung nur über `core/identity.js#securityIdForTicker` (ADR-001).
- `DUPLICATE_LISTING_OVERLAP`: zwei Listings derselben securityId mit überlappendem Intervall.
- `TICKER_REUSE_SEQUENTIAL`: dieselbe securityId nacheinander. Erlaubt, aber als mehrdeutige Identität gekennzeichnet (Owner-Entscheidung 30.10.2026).
- **Schutzprüfung zur Dublettenregel von B (keine Gegenprobe):** Eine zugefügte Kette mit Überlappung bricht den Lauf ab (`IDENTITY_DUPLICATE_IN_ADDED`). Die Prüfung nutzt dieselbe Identität (`core/identity.js`) und engere Intervalle als `buildUniverseB` (Balkenintervalle ohne Toleranz statt Listing-Intervalle mit 10 Tagen). Sie kann deshalb nur anschlagen, wenn `buildUniverseB` selbst fehlerhaft ist. Eine fehlende Dublette, die beide Regeln gleich übersehen (etwa eine andere securityId für denselben Emittenten), findet sie nicht.
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

**Zu kurzes letztes Segment einer zugefügten Kette (Abdeckungsdiagnose, Verhalten unverändert).** Die Registrierung verwirft Segmente unter 30 Balken (`MIN_SEGMENT_BARS`, wie `loadPitData`). Liegt vor dem letzten Handelstag eine Lücke > 30 Tage und danach ein Rest unter 30 Balken, fällt dieser Rest weg. Das letzte behaltene Stück endet dann als `DATA_GAP`, das Delisting wird also zensiert (`DATA_GAP_CENSORED`) und nicht als `LISTING_INACTIVE` abgerechnet. Die Kette zählt trotzdem in `addedLastTradeInWindow` und `addedByTerminalClass`. Weil die Registrierung eingefroren ist, bleibt das Verhalten. Sichtbar wird es über eigene Zähler im Zensus von B (`universeB`) und im öffentlichen Teil unter `historicalInfrastructure.addedTerminalCoverage`:

| Zähler | Bedeutung |
|---|---|
| `terminalSegmentTooShort` | Ketten mit letztem Handelstag im Fenster, deren letztes Segment verworfen wurde |
| `terminalSegmentTooShortByClass` | dieselben je V13-Klasse |
| `windowEndSegmentTooShort` | Ketten über das Fensterende hinaus mit verworfenem letztem Segment (Ende `DATA_GAP` statt rechtszensiert offen) |
| `addedTerminalBooked` | `addedLastTradeInWindow − terminalSegmentTooShort`: Delistings, die wirklich als `LISTING_INACTIVE` abgerechnet werden |

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

`sf-st9-v13-delisted-study.test.mjs`, Test „coverage diagnostic“: Eine Kette mit verworfenem kurzem letztem Segment endet als `DATA_GAP`, zählt in `addedLastTradeInWindow` und in `terminalSegmentTooShort`; `addedTerminalBooked` entspricht der Zahl der `LISTING_INACTIVE`-Enden.
- **Preflight:** listet genau die fehlenden Eingaben; ist ein vollständiger synthetischer Satz vorhanden, meldet er `ready`.

## 6. Ausführungsseite: `research/st9-hist-execution.mjs` (Folge-PR)

Prüft fertige Läufe unabhängig von den Engines. Keine Engine-Funktion wird aufgerufen, kein Fill und keine Buchung wird geändert. Das registrierte Ergebnis bleibt bytegleich; ein Test vergleicht den Ergebnis-Hash mit und ohne Prüfung.

### 6.1 Stop-Loss und Ausstiege (`classifyExits`)

Jede SELL-Zeile wird gegen ihren Balken nachgerechnet.

**Was unabhängig ist und was nicht:**
- **Fill-Regel: unabhängig.** Ob ein Stop-Fill zwischen Tief und Eröffnung liegt und bei einem Gap zur Eröffnung gebucht ist, wird nur aus Ledger und Balken geprüft.
- **Stop-Niveau: aus der Engine.** Das Niveau wird nicht aus der Quellregel neu abgeleitet. Es stammt aus den Trade-Daten der Engine: `finalStop`, bei Minervini zusätzlich der Stop-Pfad aus den Trade-Ereignissen (`ENTRY`-Stop, `STOP_RAISED_BREAKEVEN` ab der nächsten Sitzung) mit Abgleich gegen `finalStop` (`STOP_LEVEL_NOT_EVENT_PATH`).
- **Verpasste Stops** (Balken mit Tief ≤ aktivem Stop ohne Stop-Verkauf, `STOP_REACHED_NOT_EXECUTED`):
  - sf5-Lebenszyklen: `checkLifecycleRun` (wiederverwendet);
  - Minervini C06/C07: `checkMinerviniStops` (neu). Jeder gehaltene Balken nach dem Einstiegstag bis zum Ausstieg wird gegen den Stop-Pfad und das Ledger geprüft. Ausnahme: Die Position wurde an dieser Eröffnung durch einen geplanten Ausstieg (`MA50_CLOSE_EXIT`, `FREEROLL_PARTIAL_HALF`) geschlossen. Der Einstiegstag selbst folgt der Gleichtagsregel der Engine und ist über `SAME_BAR_*` gekennzeichnet;
  - **Turtle C01/C02: nicht geprüft.** Die Einheitsstopps (2N unter jedem Fill, je Zukauf angehoben) brauchen das N der Engine. Weder Ledger noch Trade-Zeilen enthalten es. Für Turtle wird deshalb nur „Fill zwischen Tief und Eröffnung“ geprüft, weder das Niveau noch ein verpasster Stop. Die Prüfung meldet das als `missedStopCheck: NOT_CHECKED_LEVEL_UNKNOWN`, nicht stillschweigend. Ein vollständiger Nachweis bräuchte eine Engine-Ausgabe der Stopps je Einheit, also eine Engine-Änderung mit neuer Registrierung.


| Klasse | Bedingung | Regel |
|---|---|---|
| `GAP_THROUGH_STOP_AT_OPEN` | Eröffnung unter dem Stop (Stop-Niveau = `finalStop` des Engine-Trades, nicht neu abgeleitet) | Fill = Eröffnung |
| `INTRADAY_AT_STOP` | Eröffnung über dem Stop, Tief erreicht ihn | Fill = Stop |
| `GAP_AT_OPEN_LEVEL_UNKNOWN` / `INTRADAY_LEVEL_UNKNOWN` | Turtle-Einheitsstopps (kein einzelnes Niveau) | nur ≤ Eröffnung, ≥ Tief |
| `SAME_BAR_CERTAIN` | Stop am Einstiegstag sicher (Fill zur Eröffnung, Schluss ≤ Stop) | – |
| `INTRADAY_ORDER_ASSUMED` | Gleichtags-Stop nach Intrabar-Annahme ohne Minutendaten | Unsicherheitskennzeichen |
| `TERMINAL_AT_LAST_TRADED_CLOSE` | Delisting | nur am letzten Balken = Ende, Preis = Schluss × (1 − Slippage) |
| `DATA_EVENT_CENSORED` | `SECURITY_UNAVAILABLE` (Stale-Regel A4) | zensiert |

Als Verstöße zählen:
- `STOP_FILL_ABOVE_OPEN`, `STOP_FILL_BELOW_LOW`, `STOP_NOT_REACHED`, `STOP_NOT_AT_LEVEL`;
- **`STOP_GAP_NOT_FILLED_AT_OPEN`**: der Stop wurde zum Niveau gebucht, obwohl die Eröffnung darunter lag. Das ist die optimistische Annahme;
- `TERMINAL_NOT_ON_LAST_TRADED_BAR`, `TERMINAL_NOT_AT_LAST_TRADED_CLOSE`, `EXIT_AFTER_LAST_BAR` (Fortschreiben), `ENTRY_ON_OR_AFTER_TERMINAL`;
- nur Minervini: `STOP_REACHED_NOT_EXECUTED`, `STOP_LEVEL_NOT_EVENT_PATH`, `STOP_PATH_MISSING` (Präfix `STOPS:` in `auditRun`).

**Vorher/Nachher an der Fixture:** Eröffnung 15 bei Stop 18.
- **Engine:** bucht 15 × (1 − Slippage), Klasse `GAP_THROUGH_STOP_AT_OPEN`, 0 Verstöße.
- **Naive Tagesbalken-Buchung zum Stop:** 18 × (1 − Slippage) ergibt `STOP_FILL_ABOVE_OPEN` und `STOP_GAP_NOT_FILLED_AT_OPEN`.

Das Ausführungsmodell der Engines war bereits richtig (`min(open, stop)`). Geändert wurde nichts. Neu ist, dass die Studie die Fill-Regel für jede Methode und beide Universen nachweist, auch für Minervini und Turtle, die `checkLifecycleRun` nicht abdeckt. Verpasste Stops weist sie für sf5 und Minervini nach, für Turtle nicht (siehe oben).

### 6.2 Prüfung je Lauf (`auditRun`)

- `classifyExits`;
- `sf7-execution-checks.mjs#checkLedgerAgainstBars` (Bücher, Fills im Balken, Bargeld), für alle Methoden;
- `#checkLifecycleRun` für die sf5-Lebenszyklen;
- `checkMinerviniStops` für C06/C07.

Das Feld `missedStopCheck` je Audit nennt die Abdeckung: `SF5_CHECK_LIFECYCLE_RUN`, `MINERVINI_EVENT_PATH` oder `NOT_CHECKED_LEVEL_UNKNOWN` (Turtle).

Beide sind wiederverwendet. Der Runner hängt die Prüfung über einen Beobachter (`runStudy({ onRun })`) an, ohne zweiten Lauf. Bei einem Verstoß gilt: öffentlicher Teil `status: EXECUTION_AUDIT_FAILED`, Beispiele nur versiegelt, Exit 4.

### 6.3 Reproduzierbare A/B-Vergleiche

- **`verifyRegisteredReferences`:** Vor dem Lauf werden alle 24 in der Registrierung festgeschriebenen Dateien neu gehasht. Eine Änderung bricht den Lauf ab (`REGISTERED_REFERENCE_CHANGED`) und braucht eine neue Registrierung. Bisher prüfte der Runner nur den Hash der Registrierungsdatei selbst. `--preflight` meldet das ebenfalls.
- **`inputFingerprint`:** ein SHA-256 über
  - Snapshot-ID, Datensatz-Hash, Registrierung und Referenzen;
  - Parameter, V13-Register und Ketten;
  - sec-pit r12 (SHA-256 der gespeicherten Bytes, `secPitSha256`, auch in der Quittung);
  - Quarantäneliste und Sperrliste;
  - Studien- und Engine-Code;
  - `seeds: NONE_USED`.

  Er steht in der Quittung.
- **sec-pit r12 fail closed:** Die Registrierung zählt sec-pit r12 zu Universum A (`attachSecPit`, CIK-Dublettenprüfung). Fehlt die Datei im Snapshot-Speicher oder ist sie nicht lesbar oder leer, bricht der Lauf mit Exit 3 ab (`SEC_PIT_MISSING`, `SEC_PIT_INVALID`, `runner#readSecPit`). Früher wurde daraus still `{}`: keine Fundamentaldaten, keine CIK-Dublettenprüfung. `--preflight` kann das nicht prüfen, weil er den Snapshot nicht öffnet.
- **Determinismus:** `resultSha256` des Ergebnisses steht in der Quittung. Der Studienpfad nutzt keine Zufallszahlen.
- **`--repeat-check`, genauer Umfang:** ruft `runStudy` im selben Prozess ein zweites Mal auf, mit denselben Datensätzen `dsA` und `dsB` im Speicher, und verlangt denselben Ergebnis-Hash (`DETERMINISM_FAILED`, Exit 4). Geprüft wird damit nur der Determinismus von Methodenläufen, Quarantäne und Auswertung. Nicht wiederholt werden das Laden des Snapshots, die Bindung der V13-Ketten und der Aufbau von B. Die Quittung nennt das als `repeatCheckScope: SAME_PROCESS_SAME_DATASETS_RUNSTUDY_ONLY`. Ein vollständiger Zweitlauf ist ein zweiter Aufruf; er muss denselben `inputFingerprint` und denselben `resultSha256` ergeben.
- **Diff-Bericht `abDiff`** je Methode, aus `compareTradeSets` übernommen:
  - A-eigene Trades in B: unverändert, nur Stückzahl, geändert, entfallen, neu;
  - dazu die Trades in zugefügten Ketten.

  So wird sichtbar, wie viel vom Unterschied B − A aus Kapital- und Platzkonkurrenz kommt und wie viel aus den neuen Ketten selbst.

### 6.4 Unsicherheit je Jahr und Methode (`tradeCoverageByYear`)

Je Einstiegsjahr: Trades nach Herkunft, geschlossene Trades, Trades mit Kennzeichen. Kennzeichen:
- `OPEN_AT_DATA_END_RIGHT_CENSORED`, `INTRADAY_ORDER_ASSUMED`, `DATA_EVENT_CENSORED`;
- `DELISTING_OUTCOME_UNKNOWN_CENSORED`, `DELISTING_MERGER_BAND` / `DELISTING_DISTRESS_BAND`;
- Identitätskennzeichen aus §2.2;
- das Datenkennzeichen der Methode (§2.4);
- `ADDED_CHAIN_WITHOUT_FUNDAMENTALS` für C06/C07.

`flaggedShare` ist der Anteil gekennzeichneter Trades. Öffentlich erscheinen nur Zählungen.

### 6.5 Tests

`node --test scripts/supertrader/tests/sf-st9-hist-execution.test.mjs`, 9 Tests:
- Gap durch den Stop (vorher/nachher);
- Berührung intraday und angenommene Intrabar-Reihenfolge;
- Delisting-Abrechnung und Manipulationen (Preis, Fortschreiben, späte Zeile, später Einstieg);
- Prüfung von Turtle S1 und KK Breakout in A und B ohne Ergebnisänderung, Wiederholungs-Hash;
- A/B-Diff und Unsicherheit je Jahr;
- Referenz-Hashes und Fingerabdruck;
- Minervini verpasster Stop: echter Lauf ohne Verstoß; Gegenproben: Ledger ohne Stop-Ausstieg → `STOP_REACHED_NOT_EXECUTED`, angehobener Stop gilt erst ab der nächsten Sitzung, falscher `finalStop` → `STOP_LEVEL_NOT_EVENT_PATH`;
- Turtle: verpasste Stops ausdrücklich als nicht geprüft gemeldet;
- sec-pit r12: fehlend, kein gzip, leer oder kein Objekt → abgelehnt; ein anderer Inhalt ergibt einen anderen Fingerabdruck.
