# Fundamentaldaten – Migrationsplan

Stand: Fundamental-Data-Integrity-Audit, 7. Oktober 2026. Begleitdokumente:
- [Audit-Bericht](FUNDAMENTAL_DATA_INTEGRITY_AUDIT.md)
- [Architektur](FUNDAMENTAL_DATA_ARCHITECTURE.md)
- Maschinenlesbar: `scripts/fundamentals-audit/artifacts/FUNDAMENTAL-DATA-MIGRATION-PLAN.json`, `FUNDAMENTAL-REBUILD-PLAN.json`, `FUNDAMENTAL-IMPACT.json`

**Status: PLAN. Nichts davon ist ausgeführt. Produktionsklassifikation: READY_FOR_CONTROLLED_MIGRATION.**

## 0. Stand v4 (Final Hardening, Kern 1.19.0) – Urteil: BLOCKED

Freeze: `scripts/fundamentals-audit/artifacts/FUNDAMENTAL-DATA-FREEZE-v4.json` (Kern 1.19.0, Registry 1.9.0, Umsatzbelege 1.1.0; Eltern-Freeze v3 unverändert). Maschinenlesbarer Plan: `FUNDAMENTAL-DATA-MIGRATION-PLAN.json` (Schema 2.0.0).

**TTM-Definition.** `EPS_TTM` = Summe von vier *gemeldeten* Dreimonats-EPS. Es gibt keine Q4-Ableitung. Die Enden müssen verschieden sein und 12–17 Wochen auseinanderliegen. Keine Zelle darf zwei Perioden tragen, und das Fenster darf nicht vor dem jüngsten veröffentlichten Geschäftsjahr enden. Alle Quartale haben eine Einheit, eine Konzeptklasse (Gesamt-EPS; ein Fenster nur aus fortgeführten Bereichen ist kein EPS-TTM) und eine Aktienbasis (kein Sprung ≥ 1,5 und keiner um ein Splitverhältnis wie 5:4 oder 4:3). Das EPS muss zu Ergebnis und Aktienzahl passen. Verwässert und unverwässert bleiben getrennt.

Fehlt ein TTM, steht der Grund in `ttmAbsent`; der Wert wird nie durch das Geschäftsjahr ersetzt. Bundle-Felder:
- `eps.ttmDiluted` / `eps.ttmBasic`: Status `VERIFIED` oder `NOT_AVAILABLE` mit Grund;
- `eps.fy*` / `eps.latestQuarter*`: tragen die Konzeptklasse (`TOTAL` oder `CONTINUING`);
- `views`: `LATEST_RESTATED` für das Bundle, `CURRENT_TTM` für das TTM. `PIT_TTM(as_of)` liefert der Resolver.

**Warum der TTM-EPS von 3.394 auf 138 Emittenten fällt.** Die 3.394 auf main summierten ein Q4 aus FY minus 9M. In SEC-XBRL gibt es fast nie ein gemeldetes Q4-EPS (Stichprobe aus 143 10-K-Instanzen). Die Ableitung verfehlt das Genauigkeitsziel: In den besten Bedingungen liegen 3,2 % außerhalb der Toleranz, ohne Bedingungen 22–24 %. Das Ergebnis ist akzeptiert, statt rekonstruiert zu werden (`FUNDAMENTAL-TTM-INVESTIGATION.json`).

**Umsatz.** Ist `Revenues` kleiner als ein anderes Umsatzkonzept derselben Zelle, entscheidet die Ergebnisrechnung der Einreichung. Grundlage sind FilingSummary, Presentation- und Calculation-Linkbase sowie `quant/config/sec-revenue-statement-evidence.json` (2.123 Einreichungen, 191 mehrdeutig). Ohne Beleg bleibt die Zelle leer. Ground Truth (Holdout): falsche Umsatzwerte 1,29 % → 0,70 %, fälschlich fehlend 0,47 % → 1,12 %.

**Validierung.**
- Präregistrierter TTM-Holdout (1.000 Emittenten, gegen 1.16.0): **FAILED**.
  - Gates: A FALSE_AVAILABLE 85, A WRONG_VALUE 3,57 %, B FALSE_AVAILABLE 66, B WRONG_CONCEPT 11.
  - Ursachen aus Primärdaten: ein echter Kernfehler, F-TTM-1, in 1.18.0 behoben. Der Rest geht auf das Wahrheitskonstrukt zurück (52/53-Wochen-Enden) oder auf die Sicht (Restatements und split-bereinigte Werte gegen summierte Erstmeldungen).
  - Abweichungen sind offengelegt: Fixture-Emittenten wurden ausgeschlossen, das Auswertungsskript lief in v1 bis v3.
  - 1.18.0 und 1.19.0 (Red-Team-Korrekturen HIGH-1..4, MEDIUM-5..7) sind **nicht holdout-validiert**.
- Minervini-Replay ohne Regeländerung: Recall 3/15 vorher und nachher. Die sieben GAAP-Verlustfälle sind STRATEGY_DEFINITION_MISMATCH.

**Blocker.**
- M-B1: Screener und Discover-Karte zeigen FY-Werte unter TTM-Labels; mit unverändertem Screener wären es rund 4.400 FY-EPS.
- M-B5: Pattern-Research und Pattern-Match lesen historisch aus der LATEST-Sicht.
- M-B6: Der Umsatzbeleg muss im Workflow vor dem Consumer-Build laufen.
- M-B2: Rollout nur als beobachteter manueller Lauf.

Rollback-Kriterien und Schritte stehen im JSON-Plan. Wirkung je Produkt: `FUNDAMENTAL-IMPACT-v4.json`. Lesermatrix: `FUNDAMENTAL-CONSUMER-VIEW-CONTRACTS.json`. Einstufung F1–F10, E5–E12 und F-TTM-1: `FUNDAMENTAL-TRIAGE.json`.

## 1. Was migriert wird

| | Vorher (main 829b35bdce4) | Nachher (Data-Freeze v3) |
|---|---|---|
| Normalisierungslogik | 1.10.0 | 1.15.0 |
| Registry-Mapping | 1.6.0 | 1.8.0 |
| Label | – | `vu-fundamentals-core-1.15.0+registry-1.8.0` |
| Consumer-Schema | vu-consumer-fundamentals-1.0.0 | unverändert |

Behobene Kernfehler: E1, E2 (revidiert durch E2-R), E3, E3b, E4, E9, E10 (siehe Audit-Bericht). E2-R und E10 sind nach dem Red Team in 1.15.0 korrigiert. Consumer-Logik, Faktoren, Schwellen und Strategieregeln sind unverändert.

## 2. Ein Merge ist der Rollout

Die SEC-Workflows laufen nach Zeitplan von `main`:

| Workflow | Zeitplan | Wirkung nach dem Merge |
|---|---|---|
| `sec-fundamentals-daily.yml` | täglich 06:15 UTC | normalisiert jeden berührten Emittenten mit 1.15.0 neu (Versionsstempel → `_is_current` false) |
| `sec-consumer-fundamentals.yml` | montags 07:30 UTC | baut alle Consumer-Bundles neu und committet sie |
| Discover / Screener / Supertrader / Company Intelligence | eigene Läufe | übernehmen die neuen Bundles |

Ein Merge dieses PRs startet den Rollout deshalb automatisch, spätestens nach 7 Tagen. **Der Merge ist die Migrationsfreigabe.** Er darf erst erfolgen, wenn M-B1 und M-B2 entschieden sind.

## 3. Blocker, die der Eigentümer entscheidet

### M-B1 – TTM-EPS entfällt für die meisten Emittenten (Folge von E4)

Bisher entstand Q4-EPS als FY − 9M. Dieser Wert stand im Bundle mit `derived = 0` und war damit nicht als Ableitung erkennbar.

Gegen das von der SEC gemeldete Q4-EPS gemessen, über 669 Paare bei 72 Emittenten:
- nur 48,9 % innerhalb der Rundung;
- p90-Abweichung 15,8 %;
- 80 Paare über 10 % daneben;
- 10 Vorzeichenwechsel.

Ursache sind Splits und schwankende Aktienzahlen. FY − 9M ist kein EPS. Seit 1.11.0 fehlt deshalb das Q4-EPS, wenn die SEC keines meldet, und mit ihm der TTM-EPS (Zahlen: `FUNDAMENTAL-IMPACT.json`).

Verhalten der Consumer ohne Codeänderung:

| Consumer | Verhalten |
|---|---|
| Discover KGV / Gewinn je Aktie | Rückfall auf TTM-Nettogewinn / jüngste Aktienzahl. Dieser Rückfall existiert bereits. |
| Screener `eps` | Rückfall auf das jüngste Geschäftsjahres-EPS. Das Feld ist aber als „Gewinn je Aktie (TTM, verwässert)“ beschriftet (`screener/engine/fields.js`). Für rund 3.200 Titel stünde damit ein Jahreswert unter einer TTM-Beschriftung (Red Team F7). |
| Quant | nicht betroffen (nutzt Jahres-EPS) |
| Company Intelligence | nicht betroffen (summiert EPS bereits heute nicht) |
| Supertrader | nicht betroffen (liest kein EPS aus dem Bundle) |

Optionen:
- **A:** Akzeptieren. UNKNOWN statt Näherung, keine Codeänderung. **Allein nicht ausreichend:** Der Screener beschriftet den Jahreswert als TTM. A geht nur zusammen mit einem Screener-PR, der die Beschriftung an die tatsächliche Basis koppelt.
- **B:** Consumer-seitige Definition TTM-EPS = TTM-Nettogewinn / gewichtete verwässerte Aktien, gekennzeichnet als DERIVED. Eigener PR je Produkt, mit Vorher/Nachher.
- **C:** TTM-EPS nur, wenn das Fenster mit einem Geschäftsjahresende zusammenfällt (= FY-EPS), sonst UNKNOWN.

**Empfehlung:** A plus Screener-Beschriftungs-PR vor dem Rollout. B als nachgelagerter Consumer-PR.

### M-B4 – Umsatz: verbleibende Mehrdeutigkeit

Ist `Revenues` in einer Einreichung zwischen etwa 12 % und 50 % des Vertragsumsatzes, ist durch keinen geprüften Fall belegt, ob er ein Teilbetrag oder ein Nettogesamtumsatz ist.
- Unter 50 % gilt der Wert von `main` (Vertragsumsatz).
- Darüber gilt `Revenues`.
- Die Lösung ohne Schwelle ist F9 (Abschlusszeile aus dem Filing-XBRL).

Entscheidung: so ausrollen (empfohlen) oder F9 abwarten.

### M-B2 – Rollout-Zeitpunkt

Merge nur unmittelbar vor einem manuell ausgelösten, beobachteten Consumer-Lauf (siehe Schritte).

### M-B3 – Factbook-Store

Ohne Voll-Rebuild bleiben Emittenten ohne neue Einreichung auf 1.10.0. Nach dem Merge einmal `sec-fundamentals-daily` für alle CIKs auslösen (Backfill).

## 4. Schritte

1. Freigabe M-B1, M-B2 und M-B4 durch den Eigentümer; Screener-Beschriftungs-PR (M-B1).
2. Direkt vor dem Merge den Branch auf `main` bringen und prüfen:
   ```bash
   node scripts/fundamentals-audit/freeze.mjs --check
   python3 -m unittest discover -s scripts/quant/tests -p 'test_*.py'
   ```
3. Merge.
4. `sec-consumer-fundamentals.yml` per `workflow_dispatch` auslösen. Dann den alten gegen den neuen Bundle-Stand vergleichen:
   ```bash
   node scripts/fundamentals-audit/bundle-diff.mjs <alt> <neu> diff.json
   node scripts/fundamentals-audit/consumer-impact.mjs <alt> <neu> impact.json
   ```
   Die Abweichung zu `FUNDAMENTAL-IMPACT.json` je Kennzahl darf höchstens 5 % der betroffenen Emittenten betragen. Mehr bedeutet Abbruch.
5. Voll-Rebuild der Factbooks (`sec-fundamentals-daily`, alle CIKs).
6. Discover-, Screener-, Supertrader- und Company-Intelligence-Läufe über ihre Produzenten, nie von Hand. Alle Gates bleiben grün.
7. Stichprobe auf `/status/#/<TICKER>` und den Aktienseiten: TNDM, AMT, DE, CERN, CECO, BRK-B, AAPL.

## 5. Abbruchbedingungen

- `freeze.mjs --check` rot.
- Consumer-Diff weicht über die Toleranz von `FUNDAMENTAL-IMPACT.json` ab.
- Ein Gate wird rot: Discover-Reproduzierbarkeit, Discover-Budget, Supertrader Gate A, Company Intelligence `validate`.
- Ein Emittent verliert alle Werte einer Kennzahl ohne belegte Ursache. Q4- bzw. TTM-EPS (E4) ist belegt.

## 6. Rollback

- Revert des Merge-Commits, dann erneuter Consumer-Lauf.
- Die vorherigen Bundles liegen in der Git-Historie. Die Factbooks normalisieren sich über den Versionsstempel beim nächsten Lauf zurück.
- Kein Datenverlust: Kein Artefakt wird außerhalb seines Produzenten verändert, nichts wird gelöscht.

## 7. Was nicht migriert wird

| Artefakt | Grund |
|---|---|
| Minervini-Research (PR #471/#475, Parser P9) | eingefroren. Eine künftige Version liest den P1-Export (`export_sepa_fund.py`) als neue Datenversion. |
| Supertrader-Validierungsstore (P7, `sec-pit.mjs`) | eigener Supertrader-PR (Gate A): E7 beheben oder durch P1-Export ersetzen |
| Historische Backtest-Ergebnisse | werden nicht überschrieben. Neuberechnung nur als neue, versionierte Läufe. |

## 8. Folge-PRs (nicht Teil dieser Migration)

| ID | Produkt | Inhalt |
|---|---|---|
| F1 | Supertrader | P7 ersetzen oder E7 beheben (Q4-Lookahead, ein Tag je Unternehmen, Basic-Ersatz) |
| F2 | Minervini-Research | P1-Export als neue Datenversion; keine Änderung an eingefrorenen Ständen |
| F3 | Quant-SEC-Kern | E5: Provenienz-Kennzeichen für Ersatzkonzepte bei net_income |
| F4 | Quant-SEC-Kern | E6: Export-Sicht AS_REPORTED_AT_TIME für PIT-Consumer (Vertrag C-PIT-1) |
| F5 | Quant-SEC-Kern | Bundle-Zeilen tragen Transformation (AS_REPORTED / YTD_DIFF / FY_MINUS_YTD) und Konzept |
| F6 | Quant-SEC-Kern | 6-K/40-F-Quartale und dimensionale Fakten nur über Filing-XBRL mit eindeutiger Zuordnung |
| F7 | Discover / Screener / CI / Quant | Consumer-Befunde C1–C4 |
| F9 | Quant-SEC-Kern | Umsatz-Abschlusszeile je Einreichung aus dem Presentation-Linkbase statt Schwelle (M-B4) |
| F10 | Quant-SEC-Kern | Konzeptmenge in der Provenienz abgeleiteter Werte; TTM- und Jahressummen über gemischte Konzepte kennzeichnen oder verweigern (Red Team F5) |
| F8 | Quant-Werkzeug | `cli.py consumer --out` schreibt `consumer_coverage.json` trotzdem nach `quant/data/sec/` (Test-Isolation) |

## Migrationsplan nach M-B1/M-B5/M-B6 (Stand 2026-10-08)

**Status:**
- **#481:** BLOCKED.
  - Holdout v2 FAIL (Kern 1.19.0) und Holdout v3 FAIL (Kern 1.20.0) bleiben unverändert; v3-Post-mortem: `artifacts/FUNDAMENTAL-TTM-HOLDOUT3-POSTMORTEM.json`.
  - Kern 1.21.0 behebt F-TTM-4 (Geschäftsjahreswechsel, altes Jahresende nur als Vergleichsjahr oder per 10-KT) und F-TTM-5 (Jahreskennung nach geteiltem Predecessor/Successor-Jahr).
    - Regressionen auf echten SEC-Daten: `scripts/quant/tests/test_ttm_core_121.py`.
    - Zwei Red-Team-Runden: Runde 1 fand D1–D5, P1, P2; Runde 2 ergab keinen Blocker, D-R1/D-R2/C2 sind behoben.
    - Vollarchiv-Nachbarsuche: 17.138 Emittenten, 0 Wertänderungen gleicher Periode (`artifacts/FUNDAMENTAL-TTM-121-NEIGHBOR-SEARCH.json`).
  - Holdout v4 (ein offizieller Lauf, `artifacts/FUNDAMENTAL-TTM-HOLDOUT4-RESULT.json`) ist **FAIL**.
    - Alle Korrektheits-Gates sind 0 bei 5.246 Auswertungen.
    - Die präregistrierten Schicht-Gates FISCAL_CHANGE, SAME_DAY, STUB_PERIOD und SPLIT_YEAR sind nicht prüfbar (3/4/7/2 Fälle unter den Mindestzahlen).
- **Freeze v6:** `artifacts/FUNDAMENTAL-DATA-FREEZE-v6.json` (Development Freeze, Parent v5) bleibt als gescheiterte Validierung bestehen. Freeze v5 ebenso.
- **Neuer Defekt F-TTM-6:** Korrekturen, die nur in einem 10-KT/A stehen, fließen nicht in die Werte (16 Emittenten). Dokumentiert, nicht behoben.
- **Voraussetzung für Schritt 4 ff.:** ein Holdout, dessen Schichten Geschäftsjahreswechsel, Same-Day, Rumpfperioden und geteilte Jahre tatsächlich besetzen. Zum Beispiel ein frischer companyfacts-Stand mit neuen Perioden. Danach alle Gates PASS.
- **M4** (Screener-Rangfolge `pe` → `peFy`) ist eine eigene Produktentscheidung, nicht Teil dieser Migration.
- **#504/#505/#510** bleiben getrennt.

| # | Schritt | Abhängigkeit | Prüfung |
|---|---|---|---|
| 1 | #504 (M-B1) nach main | keine; alte Bundles gelten als unverifiziert | Discover-CI (verify + Reproduzierbarkeit), Screener, Frontend-Budget, Startseite (KGV (GJ)) |
| 2 | Ein Datenlauf auf main mit #504 | 1 | 0 FY-Werte unter TTM-Namen; EPS GJ ≈ 3.900; Startseite gefüllt |
| 3 | F-TTM-2/F-TTM-3 (1.20.0, v3 FAIL), F-TTM-4/F-TTM-5 (1.21.0, v4 FAIL: Schichten nicht prüfbar); neuer Holdout mit besetzbaren Schichten | – | präregistriert, alle Gates PASS |
| 4 | Finaler Freeze (v6) schreiben | 3 | `freeze.mjs --check` grün |
| 5 | #510 (M-B6) in #505 mergen | 4 | Evidence-Tests, Python-Suite |
| 6 | #505 (M-B5) in #481 mergen | 5 | PIT-Tests, Budget-Test PIT-Speicher |
| 7 | main in #481 mergen (bringt #504) | 1, 6 | alle Suiten; Rest = die 4 bekannten Basisfehler |
| 8 | Freigabe #481 durch den Owner (READY_FOR_CONTROLLED_MIGRATION) | 7 | – |
| 9 | #481 nach main | 8 | – |
| 10 | Sofort `sec-consumer-fundamentals` auf main per Dispatch | 9 | Belegstufe complete=true; `revenueEvidence.check=COMPATIBLE`, 0 fehlend; `consumer-pit` 5.072 Dokumente |
| 11 | `product-intelligence-materialization` auf main | 10 | Pattern-Studie 1.0.1 (~61 Urteilswechsel erwartet); Faktor-Evidenz-Rangkorrelation gegen `quantRankImpact` |
| 12 | Beobachtung über zwei Wochenläufe, dann Blocker schließen | 11 | system-health, data-quality, `/status/` |

Die Materialisierung bricht zwischen Schritt 9 und 10 gewollt ab, solange `consumer-pit` fehlt. Deshalb folgt Schritt 10 unmittelbar.

### Rollback-Kriterien (eines genügt)

1. **Vertragsfehler** in einem planmäßigen Lauf:
   - `PIT_CONTRACT`, `VIEW_CONTRACT` oder `REVENUE_EVIDENCE_*`;
   - ausgenommen ist ein einmaliger vorübergehender SEC-Fehler mit `pending`.
2. **Abdeckungsanomalie:** mehr als 5 % unter der Impact-Vorhersage, also
   - `secAvailable` < 4.800,
   - Umsatz (Screener) < 2.830,
   - EPS GJ < 3.700.
3. **Falsches Label:** irgendein FY-Wert unter einem TTM-Namen (Hard-Gate-Test oder Stichprobe).
4. **PIT/LATEST-Verletzung:** ein historischer Leser liest `quant/data/sec/consumer` oder einen LATEST-Wert.
5. **Gescheiterter Datenbau** in zwei Läufen in Folge, oder zweimal `complete=false`.
6. **Unerklärte Rangverschiebung:** Spearman einer Faktor-Rangfolge mehr als 0,02 unter `quantRankImpact`, oder mehr als doppelt so viele Rangsprünge > 10 Punkte.
7. **Beschädigtes Artefakt:** JSON-, Schema- oder Budgetfehler, `data-quality` rot.

**Vorgehen:**
- Revert-PR des Merge-Commits auf main.
- Revert des Datencommits.
- Der Belegstore 2.0.0 ist für alten Code lesbar, weil der alte Code nur `decisions` liest.
- `consumer-pit` wird von altem Code nicht gelesen und darf liegen bleiben.
