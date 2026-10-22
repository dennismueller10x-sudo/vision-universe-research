# Supertrader 4.0 – Minervini Trade Lifecycle: Abschlussbericht

Stand: 22. Oktober 2026. Basis: `main` @ `bee9fabd8` (nach #821–#825). Zweig: `claude/minervini-trade-lifecycle-ofs4eq`.
Research Snapshot: `sts1-134d4d62eb88b6ff8d98fe6e56b12a6d`. Abrechnung: `research-v1`.
Alle historischen Aussagen sind `DIAGNOSTIC_NOT_CERTIFIED`. Keine Methode ist live oder handelbar; es gibt keine Orders und keine Brokeranbindung.

Maschinenlesbar:
- `scripts/supertrader/source-faithful/artifacts/STRATEGY-MINERVINI-LIFECYCLE.json` (Matrix, Validierung, Modellannahmen, Varianten, Readiness je Strategie; generiert);
- [SUPERTRADER_4_MINERVINI_LIFECYCLE_MATRIX.md](SUPERTRADER_4_MINERVINI_LIFECYCLE_MATRIX.md) (generierte Source-to-Execution-Matrix, alle Zeilen).

## Kurzfassung

- Beide Minervini-Strategien haben jetzt einen **durchgängigen, deterministischen Research-Lifecycle** über alle neun operativen Phasen: Setup → Eligibility → Ausführung → Stop → Größe → Management → Exit → Abrechnung → Diagnose. Hinzu kommt die Readiness als zehnte Phase.
- **Keine Minervini-Regel ist `SOURCE_EXACT`.** #709 führt alle Minervini-Regeln mit MEDIUM-Konfidenz und nur übersetztem Wortlaut. Gedruckte Zahlen dienen als Grenzen (`SOURCE_BOUNDED`), und das nur, wenn eine HARD-Regel sie trägt (geprüft durch den Validator).
- **Ein vollständiger Lifecycle-Lauf ist eine Modellstudie, kein Strategie-Backtest.** Relative Priorität, VCP-Gültigkeit, Gewinnqualität (SEPA) und das Urteil über das starke Startvolumen (Power Play) sind laut Quelle manuell. Die Simulation ersetzt diese Entscheidungen durch die deklarierte Annahme `MA-MIN-MANUAL-SUBSTITUTE`. Jeder Lauf heißt deshalb `MODEL_LIFECYCLE_STUDY_NOT_A_STRATEGY_BACKTEST`.
- `NOT_A_TRADABLE_STRATEGY`, `performanceClaim: NONE` und `LIVE_NOT_APPROVED` bleiben bestehen. Kein Vertragsregelstatus wurde geändert, keine Engine angefasst (AG-3-Fingerabdruck `ae2a51ed86ae…` unverändert).

## Was gebaut wurde

| Baustein | Datei | Phase |
|---|---|---|
| Setup-Zustände je Balken, exakt gleich den unveränderten Screens (Äquivalenztests inkl. Gleitkomma-Drift und NaN) | `research/minervini-lifecycle.mjs#sepaSetupSeries`, `#powerPlaySetupSeries` | B, C |
| Eigenständige Entry-Eligibility (getrennt von der Setup-Klasse) | `#entryEligibility` | B, C |
| Ordermodell auf Tagesbalken: Buy-Stop am Pivot, Gap, Limit, Intrabar, nicht ausführbare Order | `#fillBuyOrder` | D |
| Research-Ausführung und research-v1-Abrechnung, getrennte Plattform-Portfolio-Policy | `research/minervini-execution.mjs` | D, E |
| Produkt-Datenvertrag (ohne UI-Änderung) | `research/minervini-trade-view.mjs#tradeView` | H |
| Source-to-Execution-Matrix mit Validator | `research/minervini-lifecycle-matrix.mjs` | A |
| Artefakt + Readiness in sechs Dimensionen je Strategie | `completion/build-minervini-lifecycle.mjs` → `STRATEGY-MINERVINI-LIFECYCLE.json` | I |
| Snapshot-Runner, Workflow-Modus `sf4-lifecycle(-smoke)` | `research/run-sf4-lifecycle.mjs` | F |
| Verträge C06/C07 1.2.0: nur `researchEvidence` | `contracts/minervini.mjs` | I |

## Antworten

### 1. Welche Originalregeln sind vollständig umgesetzt?

„Vollständig“ heißt hier: mechanisch umgesetzt, als gedruckte Grenze (`SOURCE_BOUNDED`, getragen von einer HARD-Regel aus #709), mit Tests.

| Regel | #709 | Umsetzung |
|---|---|---|
| Trend Template 1–7 | MIN-TT-01..07 (HARD) | unverändert `trendTemplate`; Lifecycle-Serie exakt gleich |
| Stop vor dem Einstieg | MIN-RISK-01 (HARD) | Eligibility-Blocker `NO_STOP_BELOW_PIVOT` |
| geplanter Verlust höchstens 10 % | MIN-MM-STOP-02 (HARD) | Blocker `PLANNED_LOSS_ABOVE_10PCT`; Stop-Limit verhindert Gap-Fills darüber |
| Stop wird unabhängig vom Volumen ausgeführt | MIN-MM-STOP-01 (HARD) | Ausstieg zu `min(open, stop)` |
| höchstens 25 % je Position | MIN-MM-SIZE-01 (HARD) | Deckel der Größe; Engine weist höhere Policy-Werte ab |
| Power Play: +100 % in < 8 Wochen, Korrektur ≤ 20–25 %, eng ≤ 10 % | MIN-PP-02/04/05 (HARD) | unverändert `powerPlayScreen` / `powerPlayClassify` |

Keine dieser Regeln ist `SOURCE_EXACT`: Der Wortlaut ist nur übersetzt (`REQUIRES_ORIGINAL_OR_EXPLICIT_WEB_CORROBORATION`).

### 2. Welche Lifecycle-Phasen funktionieren?

Alle neun operativen Phasen sind ausführbar, für SEPA wie für Power Play (`MECHANICAL_LIFECYCLE_UNDER_MODEL_ASSUMPTIONS`).

Matrix (generiert, [SUPERTRADER_4_MINERVINI_LIFECYCLE_MATRIX.md](SUPERTRADER_4_MINERVINI_LIFECYCLE_MATRIX.md)):

| Klasse | SEPA (44 Zeilen) | Power Play (40 Zeilen) |
|---|---|---|
| SOURCE_EXACT | 0 | 0 |
| SOURCE_BOUNDED | 5 | 8 |
| MODEL_ASSUMPTION | 23 | 22 |
| MANUAL_REVIEW | 14 | 10 |
| DATA_BLOCKED | 2 | 0 |
| SOURCE_BLOCKED | 0 als eigene Zeile (siehe unten) | 0 |

Quellenstumme Stellen sind keine eigenen `SOURCE_BLOCKED`-Zeilen. Jede wird als `MODEL_ASSUMPTION` mit Vermerk „not in #709“ geführt, weil die Simulation sie braucht:
- Gültigkeitsdauer eines Setups;
- Ordertyp;
- Intrabar-Reihenfolge;
- Kosten.

Fachlich sind diese Stellen **quellenblockiert**; ihre Operationalisierung ist eine Modellannahme.

### 3. Welche qualitativen Entscheidungen bleiben?

**SEPA:**
- relative Priorität (MIN-PROCESS-04..11);
- Gewinnqualität (MIN-QUALITY-01..03, MIN-EPS-01/02);
- VCP-Gültigkeit und Volumen-Trockenheit (MIN-VCP-01..06/10);
- Marktkontext;
- Cheat-/Pullback-Einstiege;
- Exposure-Aufbau und -Abbau;
- Nachkäufe;
- Backstop und Halten über Zahlen;
- Verkauf in Stärke;
- Verhaltensverstöße.

**Power Play:**
- „starkes Startvolumen“ (MIN-PP-02);
- die Konsolidierungsdauer über das Übliche hinaus;
- dieselben Management- und Exit-Punkte wie SEPA.

Das Produkt zeigt diese Punkte immer als offen (`ENTRY_POSSIBLE_PENDING_MANUAL_REVIEW`, `manualReviewRequired: true`).

### 4. Welche Daten fehlen?

- IBD-RS-Rating: proprietär. Das VU-Perzentil ist nur ein Stellvertreter, nie ein Gate.
- Analystenschätzungen, Überraschungen, Guidance-Historie: kostenpflichtig, nicht im Snapshot.
- PIT-Earnings-Kalender für das Halten über Zahlen.
- Intraday-Reihenfolge innerhalb des Tagesbalkens.
- Offen geerbt: V4-D1 (nicht deklarierte Reverse-Splits, etwa 1 % der Wertpapier-Monate). Deshalb bleibt alles `DIAGNOSTIC_NOT_CERTIFIED`.

### 5. Welche Modellannahmen sind erforderlich?

19 deklarierte Annahmen (`MODEL_ASSUMPTIONS`), jede mit Referenzlesart und Begründung. Die wichtigsten:

| ID | Referenz | Alternative(n) |
|---|---|---|
| MA-MIN-MANUAL-SUBSTITUTE | manuelle Entscheidungen in der Simulation ersetzt | – (Produkt: nie ersetzt) |
| MA-MIN-SEPA-SETUP-PROXY | strenger VCP-Stellvertreter (≥ 2 Kontraktionen, links→rechts enger, letztes Volumen < 50-Tage-Schnitt) | nur Trend Template + Pivot |
| MA-MIN-SEPA-PIVOT / MA-MIN-PP-PIVOT | letztes bestätigtes Swing-Hoch (±5) / Laufhoch | – |
| MA-MIN-STOP-PLACEMENT | Strukturstop (letzte Kontraktion / Konsolidierungstief) | Stop bei 10 % |
| MA-MIN-ORDER-TYPE | Buy-Stop-Limit, Limit = Stop / 0,9 | Buy-Stop-Market |
| MA-MIN-ENTRY-TIMING | intraday auf Preis (MIN-MM-VOL-EX) | nächste Eröffnung nach volumenbestätigtem Schluss |
| MA-MIN-INTRABAR-ORDER | pessimistisch | optimistisch |
| MA-MIN-EXIT-POLICY | Stop + Einstand bei 3R + MA50-Schluss nach Einstand | nur Stop/3R; Freeroll 2R; Freeroll 3R |
| MA-MIN-RISK-FRACTION | 1,25 % | 0,75 %; 2,5 % |
| MA-MIN-SIGNAL-ORDER | datumsgestreuter Hash (neutral, deterministisch) | – |
| MA-MIN-MAX-POSITIONS | 20 offene Positionen (Plattform-Policy) | – |

Vorregistrierung:
- 11 Läufe für SEPA, 10 für Power Play, jeweils die Referenz plus Ein-Faktor-Alternativen.
- Der Fingerabdruck von Referenz und Varianten ist im Test festgeschrieben (`f13ea350…`) und steht in jeder Snapshot-Quittung.
- Keine Variante ist aktiviert, keine wird nach Ergebnis gewählt.

### 6. Welche Trades können tatsächlich simuliert werden?

**SEPA:** Trend Template 1–7 und ein bestätigter Pivot ergeben das Setup. Ein Trade entsteht nur, wenn außerdem alle Eligibility-Bedingungen erfüllt sind:
- strenger VCP-Stellvertreter;
- Strukturstop höchstens 10 % unter dem Pivot;
- Schluss noch unter dem Pivot;
- Wertpapier im liquiden Research-Universum.

Dann folgt ein Buy-Stop am Pivot für die nächste Sitzung. Danach gelten Stop, Einstand bei 3R und MA50-Ausstieg.

**Power Play:** nur `CONFIRMED_MECHANICAL_SETUP`, mit derselben Eligibility. Es gibt keine automatische Hochstufung: `validateConfig` lehnt jede andere Klasse ab.

**Maßgeblicher Snapshot-Lauf 3** ([39729913772](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/39729913772), Commit `aad906649`):
- Research-Code `16dbc24215fd…` ist identisch mit dem aktuellen Code (Test `SF4-SNAPSHOT-RUN-CURRENT-CODE`); Engine `ae2a51ed86ae…`; Varianten-Fingerabdruck `f13ea35016c5…`.
- 9.211 Segmente, 2.701 Sitzungen, Datensatz `EXACT` (`3ea6443de70c…`), PIT-Fundamentals für 6.289 Wertpapiere.
- Nur öffentliche Zählungen; die Kennzahlen liegen versiegelt auf `claude/supertrader-validation-results`.

| | SEPA REF | Power Play REF |
|---|---|---|
| Setup-Tage (`SETUP_DETECTED` bzw. `CONFIRMED_MECHANICAL_SETUP`) | 1.011.547 | 25.939 |
| armierte Orders / nicht ausgelöst | 48.306 / 40.838 | 12.622 / 9.856 |
| simulierte Trades (geschlossen / offen am Datenende) | 954 (937 / 17) | 1.007 (998 / 9) |
| Ablehnungen Kapital / Positionsgrenze | 4.948 / 1.503 | 1.673 / 1 |
| nicht ausgeführt: über Limit / ohne Quellbalken | 28 / 20 | 37 / 40 |
| Ausstiege: Initialstop (inkl. Einstiegstag) / Einstand+ / MA50 / Delisting / Datenereignis | 670 / 15 / 214 / 34 / 4 | 750 / 48 / 133 / 59 / 8 |
| Stop am Einstiegstag: angenommen / sicher | 21 / 6 | 138 / 28 |
| Abstimmung, Positionsprüfung, Referenz zweimal identisch | ja, PASS, ja | ja, PASS, ja |

Von den SEPA-Referenzeinstiegen hatten 762 von 954 PIT-Fundamentalevidenz (vor dem Signaltag eingereicht).

Trades je vorregistrierter Variante (alle abgestimmt, Positionsprüfung PASS):

| Variante | SEPA | Power Play |
|---|---|---|
| REF | 954 | 1.007 |
| ALT-SETUP-TT-PIVOT | 1.160 | – |
| ALT-STOP-MAXLOSS10 | 632 | 833 |
| ALT-ORDER-STOP-MARKET | 988 | 1.005 |
| ALT-ENTRY-VOLUME-NEXT-OPEN | 738 | 577 |
| ALT-INTRABAR-OPTIMISTIC | 987 | 929 |
| ALT-EXIT-STOP-BE3R | 364 | 514 |
| ALT-EXIT-FREEROLL-2R | 391 | 759 |
| ALT-EXIT-FREEROLL-3R | 428 | 680 |
| ALT-RISK-0075 | 1.114 | 1.143 |
| ALT-RISK-025 | 861 | 787 |

Frühere Läufe, durch Codeänderungen überholt:
- **Lauf 1** ([39726911654](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/39726911654), Code vor den Reviews): SEPA REF 978, Power Play REF 973 Trades. Er zeigte das **kapitalgebundene** SEPA-Buch (5.528 Kapital-, 902 Positionsgrenzen-Ablehnungen). Deshalb wurde die Reihenfolge gleichzeitiger Fills von der Wertpapier-ID auf einen datumsgestreuten Hash umgestellt. Die versiegelten Kennzahlen wurden dafür nicht gelesen.
- **Lauf 2** (39728252900, nach den Review-Fixes, noch ID-Reihenfolge): nur Zwischenstand, nicht ausgewertet.

Die Setup-Zählungen sind in allen drei Läufen identisch. Die Reihenfolge der Fills ändert nur, welche Signale das kapitalgebundene Buch füllen.

### 7. Welche Backtests sind methodisch zulässig?

- **Zulässig:** `MODEL_LIFECYCLE_STUDY` über alle vorregistrierten Varianten, auf `sts1-134d4d62…` mit `research-v1`, `DIAGNOSTIC_NOT_CERTIFIED`.
  - Die Kennzahlen liegen nur versiegelt vor (`MODEL_LIFECYCLE_STUDY_METRICS_NOT_A_STRATEGY_RETURN`): Trades, Trefferquote, Durchschnittsgewinn und -verlust, Profit Factor, Erwartungswert (Geld und R), Drawdown, Exposure, Haltedauer, Risiko je Trade, Kapitalkurve, längste Verlustserie.
  - Gelesen werden sie nur als **Sensitivität zwischen den Varianten**, nicht als Rendite der Strategie.
- **Nicht zulässig:**
  - die Bezeichnung „Strategie-Backtest“;
  - die Auswahl einer Variante oder eines Parameters nach Ergebnis;
  - Aussagen zur Survivorship ohne die dokumentierte Universumsabdeckung (Snapshot mit inaktiven Listings, Delistings nach research-v1);
  - Zertifizierung vor V4-D1.

### 8. Wie unterscheiden sich SEPA/VCP und Power Play?

| | SEPA/VCP | Power Play |
|---|---|---|
| Qualifikation | Trend Template (Stage 2) + VCP-Basis, Fundamentals als Evidenz | Lauf ≥ +100 % in < 8 Wochen, enge Konsolidierung; keine Fundamentals (MIN-PP-01) |
| Pivot | letztes bestätigtes Swing-Hoch der Basis | Laufhoch |
| Strukturstop | Tief der letzten Kontraktion | Tief der Konsolidierung (meist < 10 %) |
| manuell | Priorität, Qualität, VCP-Gültigkeit, RS | Startvolumen, OR-Zweig „VCP-Merkmale“, 20–25 %-Bereich |
| Datensperren | IBD-RS, Schätzungen/Guidance | keine (Startvolumen ohne 50 Sitzungen Historie: `DATA_BLOCKED_SETUP`) |
| Eligibility-Hauptblocker (Lauf 3) | VCP-Stellvertreter, geplanter Verlust > 10 % | Klasse `MANUAL_REVIEW_SETUP`, geplanter Verlust > 10 % |
| gemeinsam | Ordermodell, Stop, Größe, Exit-Policies, Abrechnung, Produktvertrag | |

### 9. Welche Tests wurden bestanden?

| Prüfung | Ergebnis |
|---|---|
| `node --test "scripts/supertrader/tests/*.test.mjs"` | 555 Tests: 554 bestanden, 1 bestehender Skip, 0 fehlgeschlagen |
| neue Suiten | `sf-minervini-lifecycle` 24, `sf-sf4-lifecycle-runner` 5 |
| `rebuild-all` (Golden Record) | 115/115 Golden Cases, 238 SF-Tests, 0 fehlgeschlagen; Artefakte = frischer Build |
| `core/tests` | 212/212 |
| `scripts/ci/tests` | 18/18 |
| Test-Isolation | bestanden |
| Gate A (`guard-protected-paths.mjs`) | nur Supertrader-Pfade |
| CI auf #842 (Supertrader Quality Gates) | grün: Gate A, B/D/E, Discovery- und Quant-2.0-Regression, Gate F Browser-QA 390/1280 px, keine Secrets |
| Snapshot-Lauf 3 (39729913772) | Datensatz `EXACT`, alle 21 Varianten abgestimmt, Positionsprüfung PASS, Referenz deterministisch, Code-Fingerabdruck = aktueller Code |
| AG-3-Fingerabdruck, sf3-Research-Code | unverändert (`SF4-RUNNER-FINGERPRINT`) |

Adversariale Fälle aus Phase G, je ein Test:
- Ausbruch ohne Bestätigung;
- Pivot vor vollständiger Kontraktionsfolge;
- fehlende oder verspätete Fundamentaldaten;
- fehlender RS;
- Gap über den Einstieg und durch den Stop;
- Einstieg und Stop im selben Balken;
- nicht ausführbare Order;
- Größe null und unzureichendes Kapital;
- Exit-Vorrang;
- Handelsaussetzung, Delisting, Corporate Action;
- fehlende Balken;
- doppelte Signale;
- offene Position am Datenende;
- deterministische Wiederholung;
- kein Lookahead.

**Unabhängige Reviews** (Code/Accounting, Quellentreue) fanden 0 CRITICAL und 0 HIGH. Alle Befunde sind behoben:

| Befund | Schwere | Behebung |
|---|---|---|
| S-M1 Einstand bei 3R als SOURCE_BOUNDED (MIN-RISK-05 ist Präferenz) | MEDIUM | MODEL_ASSUMPTION |
| S-M2 Preisbestätigung/Buy-Stop als SOURCE_BOUNDED | MEDIUM | MODEL_ASSUMPTION (MA-MIN-ORDER-TYPE) |
| S-M3 20 Positionen als Originalregel | MEDIUM | Plattform-Policy, MA-MIN-MAX-POSITIONS |
| S-L1 Validator ohne Modalitätsprüfung | LOW | SOURCE_BOUNDED braucht eine HARD-Regel oder eine ausdrückliche Begründung |
| S-L2 Blocker-Klassen der SEPA-Zustände; PP-Konsolidierungsdauer | LOW | korrigiert |
| S-L3 Risikobereich als Quellengrenze benannt | LOW | als Research-Bereich benannt |
| S-L4 `ppClasses` erlaubte manuelle Setups | LOW | nur CONFIRMED |
| S-Q5 Vorregistrierung nicht eingefroren | LOW | Fingerabdruck im Test und in der Quittung |
| C-M1 SEPA-Vorfilter: Gleitkomma-Drift der laufenden Summe | MEDIUM | `smaAt` wie `trendTemplate`, Regressionstest |
| C-M2 PP-Vorfilter wich bei NaN-Tief vom Screen ab | MEDIUM | Vorfilter bildet den Screen exakt nach (Screen-Eigenheit siehe Risiken) |
| C-L3 Limit 1 ulp unter dem Pivot | LOW | `max(limit, pivot)` |
| C-L4 Next-Open-Variante ignorierte den Stop am Ausbruchsbalken | LOW | Blocker `STOP_REACHED_ON_BREAKOUT_BAR` |
| C-L5 Fingerabdruck ohne die Screens | LOW | Screens, Reihenhilfen, Fundamental-Anbindung einbezogen |
| C-L6 Delisting mit fehlendem Schlusskurs | LOW | letzter gültiger Schluss |
| C-L7 Artefakt trotz fehlgeschlagener Validierung geschrieben | LOW | Build bricht vor dem Schreiben ab |
| eigener Befund: Fill-Reihenfolge nach Wertpapier-ID in kapitalgebundenem Buch | MEDIUM | datumsgestreuter Hash |

### 10. Welche offenen Risiken bestehen?

- **Modellabhängigkeit.** Jede Kennzahl hängt an den Annahmen in Abschnitt 5. Am stärksten wirken der Ersatz der manuellen Entscheidungen, der VCP-Stellvertreter und die Exit-Policy: Im maßgeblichen Lauf hat SEPA 954 Trades in REF, aber 364 mit nur Stop/3R und 391 mit Freeroll 2R; der VCP-Stellvertreter allein bewegt sie von 954 auf 1.160.
- **Kapitalgebundenes SEPA-Buch.** Welche Signale gefüllt werden, entscheidet die neutrale Reihenfolge, nicht Minervinis Priorität. Das ist methodisch unvermeidlich, solange MIN-PROCESS-04 manuell ist.
- **Intrabar.** 21 (SEPA) bzw. 138 (Power Play) Referenz-Trades endeten mit einem angenommenen Stop am Einstiegstag. Die optimistische Variante zeigt die Spanne.
- **Screen-Eigenheit (unverändert).** `powerPlayScreen` akzeptiert eine NaN-Korrektur, wenn ein Tief nach dem Peak fehlt und älter als 80 Sitzungen ist. Solche Setups werden nie gehandelt (NaN-Stop). Die Korrektur gehört in einen eigenen Fachmodell-PR.
- **Daten.** V4-D1 ist offen; IBD-RS und Schätzungen fehlen. Bis dahin ist nichts zertifizierbar.
- **Übersetzung.** Der Originalwortlaut ist nicht geprüft; jede Grenze kann sich durch die Originalprüfung verschieben.

### 11. Welche Entscheidungen benötigst du von mir?

1. **Referenzannahmen bestätigen oder ändern:** 1,25 % Risiko, Strukturstop, Stop-Limit, Exit-Policy „Einstand bei 3R + MA50“, strenger VCP-Stellvertreter. Eine Änderung braucht einen neuen Fingerabdruck und einen neuen Lauf.
2. **Power-Play-Screen:** Soll die NaN-Korrektur (Risiko oben) in einem eigenen Fachmodell-PR mit Vorher/Nachher-Vergleich behoben werden?
3. **Kennzahlen:** Die versiegelten Kennzahlen liegen auf `claude/supertrader-validation-results`. Willst du sie selbst entschlüsseln, oder soll ein späterer Auftrag eine zusammenfassende Bewertung ohne Variantenauswahl liefern?
4. **Originalwortlaut:** Ohne Prüfung der englischen Originale bleibt jede Regel unterhalb von `SOURCE_EXACT`.
5. **PR-Struktur:** Die Sitzung durfte nur einen Zweig nutzen. Ein Draft-PR mit getrennt prüfbaren Commits statt mehrerer PRs; eine Aufteilung auf eigene Zweige ist auf Wunsch möglich.

Keine dieser Entscheidungen hebt `NOT_A_TRADABLE_STRATEGY` auf. Eine Live-Freigabe steht nicht zur Entscheidung an.

### 12. Welche PRs stehen zur Freigabe bereit?

| PR | Inhalt | Status |
|---|---|---|
| [#842](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/842) | Supertrader 4.0 Minervini Trade Lifecycle: Matrix, Lifecycle, Ausführung/Accounting, Produktvertrag, Readiness, Runner, Bericht | Draft; keine Merges ohne Owner-Freigabe |

Commits in #842, jeweils einzeln prüfbar:
1. Lifecycle;
2. Matrix, Readiness und Runner;
3. Quellentreue-Review;
4. Code-Review;
5. neutrale Fill-Reihenfolge;
6. Bericht;
7. maßgeblicher Snapshot-Lauf eingetragen.

