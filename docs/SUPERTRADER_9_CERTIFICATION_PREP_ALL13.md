# Supertrader 9 – Zertifizierungsvorbereitung aller 13 Methoden (ALL13)

Stand: 01.11.2026 (Plan ALL13 1.0.0). Folgearbeit zu `docs/SUPERTRADER_9_CERTIFICATION_PREP_TOP5.md` (PR #1196). Grundlage bleibt die Matrix `docs/SUPERTRADER_9_CERTIFICATION_READINESS.md` (PR #1148, Stand 30.10.2026).

Neu vorbereitet sind die übrigen acht Methoden, in der Reihenfolge der Matrix: **C07 Power Play, C06 Minervini SEPA, C13 Holy Grail, C11 Pocket Pivot, C05 Weinstein Trader, C04 Weinstein Investor, C09 Kullamägi Episodic Pivot, C10 Kullamägi Parabolic Short**. Die fünf Methoden aus TOP5 (C02, C01, C08, C12, C03) sind unverändert übernommen.

> **Merge-Reihenfolge: #1148, dann #1196, dann dieser PR.** Die Abhängigkeit von der Matrix gilt unverändert. `dependsOn` ist derselbe Eintrag wie im TOP5-Plan, und der Prüfer meldet `PENDING_PR_1148`, solange die Matrix fehlt. Die Matrixdatei ist nicht kopiert und nicht geändert.

**Was diese Arbeit ist**
- Dieselbe Methode wie bei TOP5:
  - Blocker mit Fundstelle und Klasse;
  - Abbau der Klasse a durch Regeltreue-Tests an den Grenzen;
  - Abgleich von Code und #709-Wortlaut;
  - explizite Ausführungsannahmen;
  - maschinenlesbare Datenanforderungen;
  - vorregistrierte Abnahmekriterien ohne Renditeziel.
- Neu ist eine **Gegenprobe zu jedem neuen Regeltreue-Test**: Eine bewusste Mutation im Engine-Code muss den Test rot machen. Danach wird der Code byte-gleich zurückgesetzt.
- Keine Zertifizierung. Keine Methode ist aufgewertet.

**Was sie nicht ist**
- Keine Regel und kein Parameter der 13 Methoden ist geändert.
- Kein Code unter `methods/`, `research/`, `product/` oder `contracts/` ist geändert. Die Fingerabdrücke von SF6-PAPER-2027 bleiben gültig:
  - Turtle `89fbcf86…`, Minervini `c834b227…` (beide im Protokoll als `HEAD_EQUALS_PINNED_REFERENCE_FINGERPRINT`);
  - sf5-Variantenregister `0a1260e9…`.
- Keine Optimierung, kein Workflow, keine generierten Daten, kein Security Master, kein Quant-Pfad.
- `VALIDATED_TRADE_SIGNAL` bleibt für alle 13 gesperrt, `LIVE_NOT_APPROVED` bleibt.
- Die 83 Quarantänefälle sind nicht berührt.

## Dateien

| Datei | Inhalt |
|---|---|
| `scripts/supertrader/source-faithful/certification/CERT-PREP-ALL13-PLAN.json` | Erweiterungsplan: 8 Methoden, 4 neue Querschnittsblocker, 4 Befunde, 41 Gegenproben. Er verweist mit `extends` auf den TOP5-Plan und dessen Inhalts-sha256 |
| `scripts/supertrader/source-faithful/certification/cert-prep-all13.mjs` | Prüfer: Pins, Zusammenführung, Plan-Prüfung über alle 13, statische Prüfung der Gegenproben; optional `--run-tests` und `--mutation-probes` |
| `scripts/supertrader/tests/sf-cert-prep-all13.test.mjs` | 26 Regeltreue-Tests (`CP-WEIN-*`, `CP-MIN-*`, `CP-EP-*`, `CP-PS-*`, `CP-PP-*`, `CP-HG-*`) und 5 Plan-Tests (`CP-PLAN-ALL13-*`) |
| `scripts/supertrader/source-faithful/certification/cert-prep-top5.mjs` | Erweitert, für TOP5 aber unverändert im Verhalten (Details unten) |

Änderungen an `cert-prep-top5.mjs` (Prüferversion 1.2.0). Für den TOP5-Plan ist das Ergebnis gleich: 0 Abweichungen, alle 33 TOP5-Tests grün. Neu sind zusätzliche Prüfregeln, ein Zähler `checks.psr709WordingUnchecked` und die Version im Protokoll:
- `validatePlan(plan, { pinnedContentSha256, cpTestFiles })`:
  - Nur der ALL13-Prüfer übergibt `pinnedContentSha256: null`, weil er die Pins selbst prüft.
  - `cpTestFiles` erlaubt eine zweite Regeltreue-Testdatei mit eigenen Familien.
- Neue Parameterart `SOURCE_NUMBER_TRANSLATION_ONLY`. Dazu zwei Prüfungen:
  - Eine `SOURCE_NUMBER` mit ungeprüftem #709-Wortlaut ist ein Fehler (`PARAM_SOURCE_WORDING_UNCHECKED`).
  - Eine nur übersetzte Zahl braucht einen CC-1-Blocker der Klasse d, und CC-1 muss offen sein.
- Ungeprüfter #709-Wortlaut ist nur mit einer exakten Liste je Methode zulässig (`psr709WordingUnchecked`, `PSR709_UNCHECKED_LIST_STALE`). Er braucht einen CC-1-Blocker der Klasse d (`wordingUncheckedBlocker`), und CC-1 muss in `ccOpen` stehen.
- Parameterwerte werden strukturell verglichen; Felder wie `[3, 4]` oder `[50, 150, 200]` sind damit prüfbar.

## Prüfprotokoll

```bash
node scripts/supertrader/source-faithful/certification/cert-prep-all13.mjs --out /tmp/cert-prep13               # /tmp/cert-prep13/CERT-PREP-ALL13-CHECK.json
node scripts/supertrader/source-faithful/certification/cert-prep-all13.mjs --run-tests --out /tmp/cert-prep13   # zusätzlich alle gelisteten Tests (TAP)
node scripts/supertrader/source-faithful/certification/cert-prep-all13.mjs --mutation-probes --out /tmp/x.json  # Gegenproben, nur lokal
```

**Verhalten des Prüfers**
- Exit 0 nur bei `valid: true`.
- Das Protokoll ist deterministisch, hat keinen Zeitstempel und geht ohne `--out` nur auf stdout.
- `--mutation-probes` verändert für jeden Lauf genau eine Engine-Datei (wörtliche Ersetzung) und setzt sie danach zurück, geprüft per sha256. Es verweigert den Lauf, wenn eine Probe statisch fehlerhaft ist oder eine Zieldatei (Arbeitsstand oder Index) vom HEAD abweicht. Kein Test und kein Workflow ruft es auf. Der Lauf ist synchron; nach einem harten Abbruch (SIGKILL) verweigert der nächste Lauf, bis die Datei aus dem HEAD wiederhergestellt ist.

**Pins und Prüfungen**
- ALL13-Planinhalt: `PINNED_ALL13_CONTENT_SHA256` im Prüfer. Die Plandatei ist zusätzlich im Test gepinnt (`CP-PLAN-ALL13-PREREGISTERED`).
- Basis: Der TOP5-Plan muss den TOP5-Pin tragen und für sich gültig sein. Abweichungen melden `BASE_NOT_PINNED` bzw. `BASE:<Issue>`.
- Zusammenführung (`mergePlans`):
  - Die Basis bleibt unverändert, Methoden, Querschnittsblocker, Befunde und Gründe werden angehängt.
  - `guards` und `dependsOn` müssen gleich sein.
  - Ein Ausschlussgrund darf nicht umdefiniert werden; Befund-IDs, Parameter-Ausschlüsse und gemeinsame Tests dürfen nicht doppelt vorkommen.
  - Ein TOP5-Eintrag `OTHER_METHOD:<Kandidat>` fällt nur weg, wenn er in `paramsOutOfScopeSuperseded` steht und der Kandidat zur Erweiterung gehört. Betroffen sind `KK_PARAMS.epMaxAdr`, `KK_PARAMS.epGapReference` und `MOKA_PARAMS.ppWindow`.
- Die 13 Methoden C01..C13 kommen genau einmal vor, mit den Prioritäten 1..13 (`ALL13_COVERAGE`, `ALL13_PRIORITY_ORDER`).
- Gegenproben, statisch geprüft:
  - Jeder CP-Test der ALL13-Datei hat mindestens eine (`MUTATION_PROBE_MISSING`).
  - Die Fundstelle liegt in `methods/` oder `research/` und kommt genau einmal vor (`MUTATION_PROBE_FIND`).

**Lokaler Lauf am 01.11.2026 auf dem PR-Head**
- Plan gültig, 0 Abweichungen, Abhängigkeit `PENDING_PR_1148`.
- Geprüft:
  - 138 Vertragsregeln mit Status und 54 begründet ausgeschlossene;
  - 73 Parameter gegen Code und #709-Wortlaut, 7 begründet ausgeschlossen;
  - 251 #709-Belege, davon 53 ausdrücklich als nur übersetzt geführt (C06/C07);
  - 206 Testverweise;
  - 121 Blocker, 55 Studien.
- `--run-tests`: alle 13 `MET` (C02 17, C01 14, C08 15, C12 14, C03 16, C07 21, C06 20, C13 13, C11 18, C05 21, C04 23, C09 19, C10 12).
- `--mutation-probes`: 41 von 41 ROT, alle Dateien danach byte-gleich (git: keine Änderung).
- Wie bei TOP5 gilt für `PS-*-CONFORMANCE` `evidenceState: PR_HEAD_ONLY_REFERENCE_COMMIT_OPEN`. Der Nachweis auf dem Commit, der die Referenz rechnet, steht aus.

## Klassen

Die Klassen sind dieselben wie bei TOP5:
- **a**: lösbar ohne Security Master und ohne private Daten;
- **b**: Security Master;
- **c**: V13- oder Delisting-Daten;
- **d**: Owner- oder Quellenentscheidung, auch Lizenzdaten, Aktivierung und Zeitablauf.

Die Konsistenzregeln des TOP5-Prüfers gelten unverändert für alle 13 Methoden.

## Neue Querschnittsblocker

| ID | Kriterium | Klasse | Inhalt (Fundstelle) |
|---|---|---|---|
| X-MANUAL | CC-3 | d | Ermessensregeln, Grenze der Mechanisierbarkeit (Matrix Querschnitt 7) |
| X-LICENSE-DATA | Daten | d | IBD-RS, NYSE-Breite, SIP-Minuten, Borrow, PIT-Marktkapitalisierung (Querschnitt 8) |
| X-PIT-GROUPS | CC-4 | d | PIT-Gruppen nur mit E7-5 / E4-Revision, Gruppenchart fehlt (Querschnitt 5) |
| X-PAPER-SCOPE | CC-8 | d | SF6-PAPER-2027 deckt C09 und C10 nicht ab (§0.6) |

Aus TOP5 gelten weiter: X-CC5 (d), X-CC8 (d), X-SURV (c), X-PIT-MASTER (b) und X-LEDGER (a, eigener PR).

## Methoden: Blocker vorher → nachher

Status wie bei TOP5:
- **DONE**: in dieser Arbeit abgebaut;
- **PREPARED_***: Verfahren und Abnahme vorregistriert;
- **OPEN**, **OPEN_STRUCTURAL**, **OPEN_DOCUMENTED**, **OPEN_NON_ESSENTIAL**: offen;
- **OPEN_SEPARATE_PR**: Klasse a, gehört aber in einen eigenen PR.

### C07 Power Play (Priorität 6)

CC erfüllt: 2, 4, 6, 7. Offen: 1, 3, 5, 8.

| Blocker | Klasse | vorher | nachher |
|---|---|---|---|
| C07-CC1: alle Schwellen nur übersetzt; jeder MIN-PP-/MIN-MM-Beleg im #709-Extrakt `original_wording_checked = false` | d | offen | offen; jetzt maschinenlesbar (exakte Liste, Art `SOURCE_NUMBER_TRANSLATION_ONLY`), PS-C07-SOURCE vorregistriert |
| C07-CC3: 6 Ermessensfragen | d | offen | OPEN_STRUCTURAL (X-MANUAL) |
| C07-CC5: 12 K5 / 39 K3, Stabilität 11 % | d | offen | offen (X-CC5) |
| C07-CC8 | d | offen | offen |
| C07-CA-PROXIMITY: +100-%-Bewegungen nahe an Kurssprüngen | a | offen | PREPARED_COUNT_ONLY (PS-C07-CA-PROXIMITY, braucht einen Snapshot-Lauf, nicht ausgelöst) |
| C07-STABILITY | a | offen | PREPARED_REPORT_ONLY |
| C07-STAGE2-EXIT: E7-7, rund 600 Trades nicht bewertbar | d | offen | OPEN_DOCUMENTED |
| C07-TAKEOVER: Übernahmekandidaten als enge Basis (BMBL) | d | offen | offen; Owner-Frage nach einer Datenquelle |
| C07-SURV | c | offen | offen |
| C07-LEDGER (B07, W-MIN18) | a | offen | OPEN_SEPARATE_PR (X-LEDGER) |
| C07-RULE-CONFORMANCE | a | offen | **DONE**: CP-MIN-PP-RUNUP-40, -PP-CORRECTION-BOUNDS, -PP-CONFIRMED-ONLY, -STOP-FLAG-10, -ENTRY-PLANNED-LOSS-LIMIT |

**Abgleich Code ↔ #709 (nur übersetzt)**
- Die Schwellen +100 % (Faktor 2,0), 25 % / 20 % Korrektur, 10 % eng und 10 % maximaler Verlust stehen im #709-Paraphrasetext.
- Als Konvention gekennzeichnet:
  - „weniger als acht Wochen“ = höchstens 39 Sitzungen zwischen Tief und Hoch;
  - „3–6 Wochen“ = 30 Sitzungen, darüber nur eine Prüffrage.
- Keine Abweichung.
- Grenzfall in double: `1 − 16/20 = 0,19999999999999996`. Eine Korrektur von gedruckt genau 20 % liegt damit nicht im Prüfbereich (20 %, 25 %]. Das entspricht der offenen Untergrenze des Bereichs; der Test hält es fest.

### C06 Minervini SEPA (Priorität 7)

CC erfüllt: 2, 6, 7. Offen: 1, 3, 4, 5, 8.

| Blocker | Klasse | vorher | nachher |
|---|---|---|---|
| C06-CC1: 0 exakte Regeln, Wortlaut nur übersetzt (Trend Template `original_wording_checked = false`) | d | offen | offen; maschinenlesbar, PS-C06-SOURCE |
| C06-CC3: 11 Ermessensfragen, SEPA laut Quelle manuell | d | offen | OPEN_STRUCTURAL |
| C06-CC4: IBD-RS lizenzpflichtig, kein Ersatz | d | offen | offen (X-LICENSE-DATA) |
| C06-CC5: nur CC5-e/f offen | d | offen | offen |
| C06-CC8 | d | offen | offen |
| C06-FUNDAMENTALS: 405 ungeklärte Quartale, Schätzungen fehlen | d | offen | offen; die Q4-Ableitung gehört dem Quant-Erzeuger, PS-C06-FUNDAMENTALS-COVERAGE berichtet nur |
| C06-SURV | c | offen | offen |
| C06-LEDGER | a | offen | OPEN_SEPARATE_PR |
| C06-RULE-CONFORMANCE | a | offen | **DONE**: CP-MIN-TT-BOUNDS, -STOP-FLAG-10, -ENTRY-PLANNED-LOSS-LIMIT |

**Abgleich**
- MA50/150/200, 30 % und 25 % sind als `SOURCE_NUMBER_TRANSLATION_ONLY` geführt.
- „ein Monat“ = 21 Sitzungen und „52 Wochen“ = 252 Sitzungen sind Konventionen.
- An den Grenzen sind die Werte double-exakt: `100 × 1,3 = 130` und `200 × 0,75 = 150`. Keine Abweichung.

### C13 Holy Grail (Priorität 8)

CC erfüllt: 4, 6, 7. Offen: 1, 2, 3, 5, 8.

| Blocker | Klasse | vorher | nachher |
|---|---|---|---|
| C13-CC1: Einstieg und Stop nur aus der Sekundärquelle W-RAS97, Größe nicht offengelegt | d | offen | offen; PS-C13-SOURCE |
| C13-CC2: Trailing und Größe in keiner Quelle | d | offen | offen |
| C13-CC3: 3 Ermessensfragen | d | offen | OPEN_STRUCTURAL |
| C13-CC5: 29 K5 / 99 K3 | d | offen | offen |
| C13-CC8 | d | offen | offen |
| C13-INTRADAY: Intraday-Zeitebenen DATA_BLOCKED | d | offen | OPEN_NON_ESSENTIAL |
| C13-STABILITY: 9 % | a | offen | PREPARED_REPORT_ONLY |
| C13-SURV | c | offen | offen |
| C13-LEDGER (W-RAS04, W-RAS97) | a | offen | OPEN_SEPARATE_PR |
| C13-RULE-CONFORMANCE | a | offen | **DONE**: CP-HG-ADX-STRICT-30, -TOUCH-ORDER-STOP, -EXIT-NEW-HIGH-STRICT |

**Abgleich:** ADX14, > 30, 20 EMA, 3/10-SMA-Oszillator und SMA16 sind gegen `HG_PARAMS` geprüft, alle mit geprüftem Wortlaut. Die strikte ADX-Grenze ist mit dem echten ADX der Vorsitzung als Grenzwert getestet. Keine Abweichung.

### C11 Pocket Pivot (Priorität 9)

CC erfüllt: 4, 6, 7. Offen: 1, 2, 3, 5, 8.

| Blocker | Klasse | vorher | nachher |
|---|---|---|---|
| C11-STOP: die Quelle nennt keinen Initialstop (8 von 9 Phasen) | d | offen | offen; PS-C11-STOP-SOURCE |
| C11-CC1: Verletzungslesart (MOKA-C2) | d | offen | offen (wie C12) |
| C11-CC3: 7 Ermessensfragen | d | offen | OPEN_STRUCTURAL |
| C11-CC5: 9 K5 / 25 K3 | d | offen | offen |
| C11-CC8 | d | offen | offen |
| C11-STOP-FILTER: Stopvariante lehnt 32.413 Einstiege ab | a | offen | PREPARED_REPORT_ONLY |
| C11-SURV | c | offen | offen |
| C11-LEDGER | a | offen | OPEN_SEPARATE_PR |
| C11-RULE-CONFORMANCE | a | offen | **DONE**: CP-PP-UP-DAY-STRICT, -CONTEXT-MA50-STRICT, -SELL-GUIDE-35, -VIOLATION-STRICT-NO-STOP |

**Abgleich:** Die 10 Tage (MOKAPP-003) und die 7 Wochen (MOKA12-008, mit 5 Sitzungen je Woche = 35) sind Quellenzahlen. Keine Abweichung. Befund F-PP-STOP-STATUS-SPLIT siehe §Befunde.

### C05 Weinstein Trader (Priorität 10) und C04 Weinstein Investor (Priorität 11)

CC erfüllt: 1, 2, 6, 7. Offen: 3, 4, 5, 8.

| Blocker | Klasse | vorher | nachher |
|---|---|---|---|
| CC3: 12 (C05) bzw. 14 (C04) Ermessensfragen, die Quelle verlangt das Stage-Urteil | d | offen | OPEN_STRUCTURAL |
| CC4: Branchen-Stage und NYSE-Breite DATA_BLOCKED | d | offen | offen (X-PIT-GROUPS, X-LICENSE-DATA); der SIC3-Proxy wird nur gezählt (PS-…-GROUP-PROXY) |
| CC5: C05 4 K5 / 9 K3; C04 0 K5 / 4 K3 | d | offen | offen; bei C04 dazu die Owner-Frage, ob Exposition 0 für CC5-a genügt |
| CC8 | d | offen | offen |
| TRAIL-READING: SF7-V1, „at or above“ vs. `>` | d | offen | OPEN_DOCUMENTED; PS-…-TRAIL-READING vorregistriert |
| SURV | c | offen | offen |
| RULE-CONFORMANCE | a | offen | **DONE**: CP-WEIN-MA-GATE-EQUALITY, -VOL-THRESHOLDS, -TRAIL-THRESHOLDS, -STOP-BELOW-TRIGGER, dazu C04 -INV-BASE-RESISTANCE und C05 -TR-SWING-HIGH |

**Abgleich**
- Geprüft gegen `WEIN_PARAMS` und #709:
  - MA30, „doppeltes“ (A/B: mindestens, C: mehr als, beides so umgesetzt), „3–4 Wochen“, 15 % (nur Beleg);
  - im Forschungsmodul 8 % und 7 % als Modellgrenzen.
- Konventionen: Vormonat = 4 Wochen, Vorwoche = 5 Sitzungen.
- `rsNormWeeks` (52) ist reiner Belegwert, Grund `EVIDENCE_ONLY_CONVENTION`.
- Befund F-WEIN-MA-GATE-EQUALITY siehe §Befunde.

### C09 Kullamägi Episodic Pivot (Priorität 12)

CC erfüllt: keines. Offen: 1–8.

| Blocker | Klasse | vorher | nachher |
|---|---|---|---|
| C09-CC1: Ausstieg SOURCE_AMBIGUOUS (KK-017) | d | offen | offen |
| C09-CC2: VALIDATION_BLOCKED, nur Chart-Modell | d | offen | offen |
| C09-CC3 | d | offen | OPEN_STRUCTURAL |
| C09-CC4: Katalysator, Volumen, Einstieg DATA_BLOCKED | d | offen | offen |
| C09-CC5: NOT_EVIDENCED | d | offen | offen; PS-C09-CA vorregistriert (Snapshot-Lauf nicht ausgelöst) |
| C09-CC6: Minuten nicht eingefroren | d | offen | offen |
| C09-CC7: SF7-V2, 180 von 222 | d | offen | offen; PS-C09-SF7-V2 berichtet nur |
| C09-CC8: nicht im Paper-Protokoll | d | offen | offen (X-PAPER-SCOPE), PS-C09-FORWARD |
| C09-SAMPLE: IEX-Stichprobe, vor 2017 keine Minuten | d | offen | offen |
| C09-SURV | c | offen | offen |
| C09-RULE-CONFORMANCE | a | offen | **DONE**: CP-EP-STOP-1-5-ADR, -GAP-SCREEN-10, -ORH-FILL-AND-LOD, -EXIT-MA20 |

**Abgleich**
- 1,5 ADR (KK-034) und 10 % (KK-015) sind Quellenzahlen; im Forschungsmodul sind 10 %, das 1-Minuten-ORH und MA20 Modellgrenzen.
- 10 % ist als Quotient nicht double-exakt (`22/20 − 1 = 0,10000000000000009`). Der Test prüft den Vergleichsoperator deshalb mit einer bitgleichen Grenze. Keine Abweichung.

### C10 Kullamägi Parabolic Short (Priorität 13)

CC erfüllt: 1. Offen: 2–8.

| Blocker | Klasse | vorher | nachher |
|---|---|---|---|
| C10-BORROW: keine Borrow-/Locate-/Gebührenhistorie, Short hypothetisch | d | offen | offen; PS-C10-BORROW |
| C10-CC2: nur Trade-Ebene | d | offen | offen |
| C10-CC3 | d | offen | OPEN_STRUCTURAL |
| C10-CC4: Einstieg und Stop intraday DATA_BLOCKED | d | offen | offen |
| C10-CC5: NOT_EVIDENCED | d | offen | offen |
| C10-CC6: Minuten nicht eingefroren | d | offen | offen |
| C10-CC8: nicht im Paper-Protokoll | d | offen | offen |
| C10-UPTICK: kein Modell der Uptick-Regel | d | offen | offen |
| C10-SURV | c | offen | offen |
| C10-RULE-CONFORMANCE | a | offen | **DONE**: CP-PS-STREAK-ACCEL, -ORL5-FILL-HOD-STOP, -COSTS-NO-BORROW |

**Abgleich:** Ziel 10/20DMA als Modellgrenze `MA10`. KK-018 („mehrere“) nennt keine Zahl; die Streak-Länge 3 ist deshalb kein Quellenparameter, sondern MA-PS-ACCELERATION. Keine Abweichung.

### Zusammenfassung vorher → nachher (die acht neuen)

| Methode | Blocker | a | b | c | d | DONE | PREPARED_* |
|---|---|---|---|---|---|---|---|
| C07 | 11 | 4 | 0 | 1 | 6 | 1 | 2 |
| C06 | 9 | 2 | 0 | 1 | 6 | 1 | 0 |
| C13 | 10 | 3 | 0 | 1 | 6 | 1 | 1 |
| C11 | 9 | 3 | 0 | 1 | 5 | 1 | 1 |
| C05 | 7 | 1 | 0 | 1 | 5 | 1 | 0 |
| C04 | 7 | 1 | 0 | 1 | 5 | 1 | 0 |
| C09 | 11 | 1 | 0 | 1 | 9 | 1 | 0 |
| C10 | 10 | 1 | 0 | 1 | 8 | 1 | 0 |

**Einordnung**
- Alle offenen CC-Blocker der acht Methoden sind c oder d. Keiner ist Klasse b; der Security Master betrifft nur C12 und C03 aus TOP5.
- Klasse a bleibt nur für eigene PRs (Ledger) und für Zählungen, die einen Snapshot-Lauf brauchen.
- Kein CC-Kriterium ist durch diese Arbeit erfüllt.

## Befunde (keine Fachmodelländerung)

Ein Implementierungsfehler gegenüber den zitierten Quellen wurde **nicht** gefunden:
- Alle 26 neuen Grenzfalltests liefen gegen den unveränderten Code grün.
- Alle 41 Gegenproben machten ihren Test rot.

Es gibt deshalb keinen Draft-PR für eine Fachmodelländerung. Festgehalten sind vier Befunde (`findings`, alle `modelChange: false`):

| ID | Methode | Art | Befund | Vorschlag |
|---|---|---|---|---|
| F-MIN-WORDING-UNCHECKED | C06, C07 | Quellenstatus | Jeder zitierte Minervini-Beleg trägt `original_wording_checked = false`; der TOP5-Prüfer hätte ihn abgewiesen | keine Änderung; jetzt als exakte Liste mit CC-1-Blocker geführt |
| F-WEIN-TRAIL-AT-OR-ABOVE | C04, C05 | bekannte Abweichung (SF7-V1) | Deklaration „at or above“, Code `>` | Owner entscheidet die Lesart, danach eigener Fachmodell-PR |
| F-WEIN-MA-GATE-EQUALITY | C04, C05 | Lesart | `maGate` lehnt einen Kaufpreis genau gleich MA30w ab, auch bei steigender MA. #709 „unter oder bei fallender MA30“ ist doppeldeutig; der Vertrag liest „at“ als Gleichheit | Mehrdeutigkeit in der derivation nennen (eigener PR) |
| F-PP-STOP-STATUS-SPLIT | C11 | Dokulücke | Vertrag `MANUAL_REVIEW_REQUIRED`, Lebenszyklus und Matrix `SOURCE_BLOCKED` | Hinweis in der Regel ergänzen (eigener PR) |

## Datenanforderungen (Kurzfassung)

Maschinenlesbar im Plan, Feld `dataRequirements`.

| Methode | aus dem Snapshot | fehlt (Klasse) |
|---|---|---|
| C07 | Tages-OHLCV ≥ 41 | CA-Faktoren (d), Übernahmeankündigungen (d), Listing-Enden (c) |
| C06 | Tages-OHLCV ≥ 252 | IBD-RS (d), PIT-Fundamentaldaten ohne abgeleitetes Q4 und Schätzungen (d), CA (d), Listing-Enden (c) |
| C13 | Tages-OHLC ≥ 60 | Intraday-Minuten (d, nicht essenziell), CA (d), Listing-Enden (c) |
| C11 | Tages-OHLCV ≥ 51 | CA (d), Intraday-Volumen (d, nicht modelliert), Listing-Enden (c) |
| C05/C04 | Tages-OHLCV zu Wochen ≥ 160, SPY | PIT-Gruppen mit Gruppenchart (d), NYSE-Breite (d), CA (d), Listing-Enden (c) |
| C09 | Tages-OHLC ≥ 64 | eingefrorene IEX-Minuten (d), SIP-Minuten (d), Katalysatorkalender (d), CA (d) |
| C10 | Tages-OHLC ≥ 31 | eingefrorene IEX-Minuten (d), SIP-Minuten (d), Borrow (d), SSR-Status (d) |

## Ausführungsannahmen (explizit)

Gemeinsam wie bei TOP5: 10 bps je Seite und 1 bp Kommission, Stufen 0/10/20/50, Plattformgrenzen 25 % und 20 Positionen. Der Buy-Stop füllt bei einem Gap zur Eröffnung, sonst am Niveau.

| Methode | Einstieg | Stop / Ausstieg | Intrabar |
|---|---|---|---|
| C07/C06 | Buy-Stop am Pivot, Limit = Stop / 0,9, nur nächste Sitzung | Strukturstop, `min(Eröffnung, Stop)`; Break-even bei 3R, dann MA50 | pessimistisch; Schlussregel als SF7-Variante |
| C13 | Buy-Stop ein Roh-Cent über dem Berührungsbalken, nächste Sitzung | Swing-Low ab Impulshoch; Ausstieg nach dem ersten Schluss strikt über dem Impulshoch | pessimistisch |
| C11 | nächste Eröffnung, **kein Preisstop** | 10/50DMA-Leitfaden, Verletzung strikt unter dem Tief des Verletzungstags | entfällt |
| C05/C04 | Buy-Stop aus der abgeschlossenen Woche, Folgewoche, `max(Eröffnung, Trigger)` | ein Roh-Cent unter dem Vorschlag; Trailing 7 % / 8 %; WEIN-VOL5 | pessimistisch |
| C09 | 1-Minuten-ORH + Roh-Cent, `max(Level, Minuteneröffnung)` | Tagestief vor der Kaufminute, ≤ 1,5 ADR; MA20 | Kaufminute pessimistisch |
| C10 | 5-Minuten-ORL − Roh-Cent ab Minute 5, `min(Level, Minuteneröffnung)` | Tageshoch vor der Kaufminute + Roh-Cent; Ziel MA10; keine Leihgebühr | Stop vor Ziel |

## Prüfplan (vorregistriert, ohne Renditeziele)

**Studien je Methode**
- Jede Methode hat `PS-<Cxx>-CONFORMANCE` (a, READY). Die Abnahme: alle Tests PASS und jede Gegenprobe ROT (INTEGRITY).
- Klasse a, READY oder PLANNED_NEEDS_SNAPSHOT_RUN:
  - PS-C07-CA-PROXIMITY, PS-C09-CA (COUNT, Snapshot-Lauf nicht ausgelöst);
  - PS-C07/C13/C11/C05/C04-STABILITY (DISTRIBUTION_REPORT_ONLY);
  - PS-C07-COSTS, PS-C06-COSTS, PS-C13-ENTRY-BAR, PS-C11-STOP-FILTER, PS-C05/C04-GROUP-PROXY, PS-C10-OVERLAP (COUNT);
  - PS-C06-FUNDAMENTALS-COVERAGE (DATA_COVERAGE).
- Klasse d, BLOCKED_OWNER: PS-C07/C06/C13-SOURCE, PS-C13-READINGS, PS-C11-STOP-SOURCE, PS-C11-READINGS, PS-C05/C04-TRAIL-READING, PS-C09-SF7-V2, PS-C09-FORWARD, PS-C10-BORROW, PS-C10-FORWARD.

**Regeln für die Abnahmekriterien**
- Kein Kriterium nennt eine Rendite-, Risiko- oder Trefferschwelle. Die Prüfung `isPerformanceTarget` des TOP5-Prüfers läuft über alle 55 Studien.
- Entscheidungen der Klasse d werden datiert, **bevor** eine versiegelte Kennzahl geöffnet wird.

## Owner-Fragen (zusätzlich zu TOP5 §7)

1. **C06/C07:** Englische Ausgabe beschaffen oder über Übersetzungsbelege entscheiden (E7-2).
2. **C07:** Eine Datenquelle für Übernahmeankündigungen. Außerdem: Wird eine E7-7-Ausstiegsvariante Referenz?
3. **C13:** Primärquelle für Einstieg, Stop, Trailing und Größe. Außerdem die Referenzlesarten (Vorbalken, ADX-Fenster, Berührungen).
4. **C11:** Gibt es eine Autoren-Stopregel? Welche Verletzungslesart gilt (gemeinsam mit C12)?
5. **C04/C05:** Trailing „at or above“ oder `>`? Für C04 außerdem: Genügt Exposition 0 bei K5 für CC5-a?
6. **C09/C10:** Ein eigenes Forward-Protokoll (SF6-PAPER-2027 bleibt unverändert). Dazu Lizenzentscheidungen zu SIP-Minuten, Borrow und SSR sowie das Einfrieren der IEX-Minuten.

## Tests

```bash
node --test scripts/supertrader/tests/sf-cert-prep-all13.test.mjs   # 31 Tests (26 CP-Regeltreue, 5 CP-PLAN-ALL13)
node --test scripts/supertrader/tests/sf-cert-prep-top5.test.mjs    # 33 Tests, unverändert grün
node --test "scripts/supertrader/tests/*.test.mjs"
node scripts/supertrader/guard-protected-paths.mjs --base=origin/main
node scripts/quality/check-test-isolation.mjs --suite scripts/supertrader/tests/sf-cert-prep-all13.test.mjs
```
