# Supertrader 7.0 – Produktvertrag für spätere Kandidatenanzeigen

Stand: 25.10.2026. Dieses Dokument bereitet eine spätere Anzeige von Kandidaten aus den 13 Source-faithful-Research-Engines auf research.visionuniverse.de vor. Es legt nur Datenvertrag und Integrationsvoraussetzungen fest.

Was es nicht tut:
- Es erzeugt keine Kandidaten und aktiviert keine Signale.
- Es startet keinen neuen Datenlauf, registriert keinen Producer und ändert kein Frontend.
- Es wertet keinen Status auf. Alle 13 Strategien bleiben `LIVE_NOT_APPROVED` und `DIAGNOSTIC_NOT_CERTIFIED`.

Code: [`scripts/supertrader/source-faithful/product/candidate-contract.mjs`](../scripts/supertrader/source-faithful/product/candidate-contract.mjs) (Vertrag `supertrader-sf-product-candidate-1.0.0`, Definitions-Hash `ea3e59ae…a9b3`).
Tests: `scripts/supertrader/tests/sf-product-contract.test.mjs`.
Beispiel (nur Test-Fixture, synthetisch): `scripts/supertrader/tests/fixtures/sf-product-candidates.json`.

## 1. Worauf der Vertrag aufbaut

| Bestand | Rolle im Produktvertrag |
|---|---|
| `source-faithful/contract.mjs`, `registry.mjs` (13 Strategieverträge) | Regelstatus je Regel (`SOURCE_EXACT` … `DATA_BLOCKED`). Aus ihm leitet der Produktvertrag ab, welche Regeln mechanisch, offen (Ermessen), mehrdeutig oder datenblockiert sind. Version und Fingerprint des Strategievertrags sind Pflicht-Herkunft. |
| `source-faithful/signals/research-signal.mjs` | Forschungsgrenze (`liveActivation: false`, `orderRouting: NONE`, `buyDeclarationAllowed: false`). Der Produktvertrag übernimmt diese drei Sperren wörtlich und ersetzt die Forschungsgrenze nicht. |
| `artifacts/STRATEGY-SF6-READINESS.json` (Kriterien `sf6-readiness-criteria-1.2.0`) | Einzige Quelle für Zustand, Phasen, Messklasse und CC-1…CC-8 je Strategie. Die Stufenobergrenze wird daraus abgeleitet und nie im Datensatz behauptet. |
| `integrity/discontinuity.mjs` (`sf6-discontinuity-quarantine-1.1.0`, Rückblick 400 Tage) | V4-D1-Eindämmung: DQ-K5-/DQ-K3-Sitzungen im Rückblick sind ein Sperrgrund auf Datensatzebene. |
| `completion/sf6-paper-protocol-2027.mjs` | SF6-PAPER-2027 1.1.0, Status `PREPARED_NOT_ACTIVE`. Ohne ausgewertetes Protokoll gibt es keine Validierung. |
| `core/identity.js` (ADR-001) | Der Validator bildet die `securityId` selbst über `securityIdForTicker` nach. Jede andere Bildung wird abgelehnt. |
| ADR-002 (`return-series.js#splitFactors`, `published-close.js`) | Pflichtangabe der Preisbasis. Eine andere Quelle wird abgelehnt. |
| `core/registry/domains.json`, Domain `supertrader` | Die heutige Live-Beobachtung (`scripts/supertrader/build.mjs`, VU-Varianten). Sie bleibt unberührt. Der Produktvertrag ist dort **nicht** registriert (§5). |

## 2. Eignungsmatrix der 13 Engines

Die Spalte „heute höchstens“ ist abgeleitet: `stageCeilings(loadSf6Readiness())`, im Test `SF-PRODUCT-CEILING-13` festgeschrieben.

Für alle 13 gilt:
- **Signal nur aus Tagesbalken bis zum Stichtag:** ja, mit einer Ausnahme. EP und PS brauchen für Einstieg und Stop Intraday-Daten.
- **Deterministisch:** ja. Die Engines und Lifecycles sind reine Funktionen ohne Zufall und ohne Uhrzeit. Nur die `run-*.mjs`-Läufer setzen Zeitstempel.
- **Laufzeit:** nicht gemessen. Der Aufwand je Titel ist linear im Rückblick. Ein täglicher Lauf berechnet nur den letzten Balken, keine Historie. Messen gehört in den späteren Lauf-PR (§5).

| | Strategie | heute höchstens | Daten (nur EOD?) | Ermessen (wesentliche Regeln `MANUAL_REVIEW_REQUIRED`) | Sperren / Blocker | Voraussetzung für die nächste Stufe |
|---|---|---|---|---|---|---|
| C01 | Turtle S1 | `MODELED_TRADE_PLAN` | nur EOD (55/20-Tage-Kanal, N) | keine; 2 mehrdeutige Regeln (S1-Filter, Failsafe), beide Lesarten laufen | `TUR-SF-LIMIT-CORR` datenblockiert (PIT-Korrelationsgruppen, E4) → als Datenausnahme im Plan deklariert; V4-D1 je Titel | VALIDATED: CC-1, CC-4, CC-5, CC-8 + Freigabe + SF6-PAPER-2027 |
| C02 | Turtle S2 | `MODELED_TRADE_PLAN` | nur EOD | keine | wie C01 (ohne CC-1) | CC-4, CC-5, CC-8 + Freigabe + Paper |
| C03 | Darvas Box | `MODELED_TRADE_PLAN` | nur EOD; Allzeithoch nur in verfügbarer Historie (DAR-Q9) | 4 (Auswahl, Volumen, Markt, Größe); Box-Beginn mehrdeutig | V4-D1 je Titel; Messklasse nur Modellstudie | jede Ermessensregel als Modellannahme im Plan; VALIDATED: CC-1, CC-3, CC-5, CC-8 |
| C04 | Weinstein Investor | `CHART_CANDIDATE` | EOD → Wochen; SPY | 8 (Stage, Volumen, RS, Overhead …) | `WEIN-SF-GROUP`, `WEIN-SF-MARKET` datenblockiert (PIT-Branchen-Stage, NYSE-Breite; SIC-Proxy hebt die Sperre nicht auf) | PIT-Branchenhistorie und Marktbreite als Daten → dann CONFIRMED |
| C05 | Weinstein Trader | `CHART_CANDIDATE` | wie C04 | 8 | wie C04 | wie C04 |
| C06 | Minervini SEPA/VCP | `CHART_CANDIDATE` | EOD ≥ 200 Sitzungen; Fundamentaldaten nur im Ermessen | 7 (Priorität, Fundamentaldaten, VCP, Pivot, Stop, Größe, Verkauf) | `MIN-SF-TT-8` datenblockiert (IBD-RS-Historie); nur übersetzte Quellen (CC-1) | IBD-RS-Ersatz als Owner-Entscheidung oder lizenzierte Daten → dann CONFIRMED |
| C07 | Minervini Power Play | `MODELED_TRADE_PLAN` | nur EOD | 4 (Einstieg, Stop, Größe, Ausstieg) | nur übersetzte Quellen (CC-1); V4-D1 je Titel | Modellannahmen im Plan; VALIDATED: CC-1, CC-3, CC-5, CC-8 |
| C08 | Kullamägi Breakout (täglich) | `MODELED_TRADE_PLAN` | EOD + Querschnitt 1/3/6-Monats-Renditen des Universums (der Lauf braucht das ganze Universum) | 5 (Setup, Einstieg, Teilverkauf, Trailing, Größe) | ORH-Einstieg (Intraday) datenblockiert, aber nicht wesentlich; geringe Trade-Stabilität (E6) | Modellannahmen; VALIDATED: CC-3, CC-5, CC-8 |
| C09 | Kullamägi Episodic Pivot | `CHART_CANDIDATE` | Katalysator, Intraday-Volumen und ORH fehlen | 1 (Größe); Ausstieg mehrdeutig | Katalysator, Volumen und Einstieg datenblockiert; `VALIDATION_BLOCKED`; nicht messbar | Katalysatorkalender (SEC-8-K-Zeitstempel) und konsolidiertes Intraday-Volumen; E5 verbietet heute neue Intraday-Abrufe |
| C10 | Kullamägi Parabolic Short | `CHART_CANDIDATE` | Intraday/VWAP, Borrow, Locate, Gebühren fehlen | 3 | Einstieg, Stop und Borrow datenblockiert; Short-Pläne verbietet der Vertrag grundsätzlich (nur Long) | Borrow-Historie (Lizenz-/Kostenentscheidung) und ein eigener Short-Vertrag |
| C11 | Morales/Kacher Pocket Pivot | `CONFIRMED_RESEARCH_SETUP` | nur EOD (Schluss + Volumen) | 4 (Kontext, Stop, Größe, MA-Ausstieg); Verletzungs-Ausstieg mehrdeutig | `SOURCE_BLOCKED`: Initialstop nicht in der Quelle, 8/9 Phasen; der Stop am Signaltagstief ist nur eine Variante (E3) | Primärquelle für die Stopregel → 9/9 Phasen → MODELED |
| C12 | Morales/Kacher Buyable Gap-Up | `MODELED_TRADE_PLAN` | EOD; PIT-Marktkapitalisierung für die Megacap-Ausnahme fehlt (Ermessen) | 5 | Volumenfenster mehrdeutig (D-BGU-VOLWINDOW); V4-D1 je Titel | Modellannahmen; VALIDATED: CC-1, CC-3, CC-5, CC-8 |
| C13 | Raschke Holy Grail | `CONFIRMED_RESEARCH_SETUP` | nur EOD (EMA20, ADX14) | 1 (Ausstieg); Größe mehrdeutig | `SOURCE_BLOCKED`: Trailing und Größe nicht in den Quellen, 8/9 Phasen, nicht messbar; Einstieg nur aus Sekundärquelle W-RAS97 | Primärquelle für Trailing und Größe → MODELED |

Zusammenfassung heute:
- `VALIDATED_TRADE_SIGNAL`: 0 Strategien.
- `MODELED_TRADE_PLAN`: 6 (C01, C02, C03, C07, C08, C12).
- `CONFIRMED_RESEARCH_SETUP`: 2 (C11, C13).
- `CHART_CANDIDATE`: 5 (C04, C05, C06, C09, C10).

Für keine der 13 Strategien sind heute alle VALIDATED-Voraussetzungen erfüllt. Zusätzlich sperrt jede Strategie `CONTRACT_LOCK`, `NOT_CERTIFICATION_CANDIDATE`, `OWNER_APPROVAL_MISSING`, `PAPER_VALIDATION_NOT_EVALUATED` und `LIVE_NOT_APPROVED`.

Die Eignung für eine tägliche Kandidatenerkennung hängt außerdem am **Datensatz**: Liegt eine DQ-K5- oder DQ-K3-Sitzung im 400-Tage-Rückblick des Titels, bleibt dieser Titel bei `CHART_CANDIDATE`, auch für C01. Die Matrix 7.0 zählt 0 bestätigte Splits unter 83 exponierten Sitzungen. Die Sperre bleibt deshalb bis zur V4-D1-Auflösung (E1, E7-1) wirksam.

## 3. Vertragsdefinition (`supertrader-sf-product-candidate-1.0.0`)

### 3.1 Stufen

Die vier Stufen bauen aufeinander auf und sind strikt getrennt:

1. **`CHART_CANDIDATE`:** Am Stichtag ist ein mechanisches Chartmuster erkannt. `pattern.ruleIds` nennt nur Regeln mit `SOURCE_EXACT` oder `SOURCE_DERIVED`. Die Stufe macht keine Aussage über Handelbarkeit.
2. **`CONFIRMED_RESEARCH_SETUP`:** Alle mechanischen Setup-, Filter- und Einstiegsregeln des Strategievertrags sind am Stichtag erfüllt (`met: true`, vollständige Liste). Offene Ermessensregeln, mehrdeutige Regeln (mit gewählter Lesart) und datenblockierte Regeln sind vollständig ausgewiesen. Bei offener Ermessensregel ist `manualReviewStatus` = `REQUIRED_PENDING`.
3. **`MODELED_TRADE_PLAN`:** Einstieg, Stop, Größe und Ausstieg folgen dem Research-Modell und sind als `hypothetical: true` gekennzeichnet. Für jede offene Ermessensregel ist eine benannte Modellannahme hinterlegt. Datenblockierte Größen-, Portfolio- und Pyramiding-Regeln sind als Datenausnahme deklariert. Der Plan ist nur Long; der Stop liegt unter dem Einstieg. Frühestens handelt der Plan in der Sitzung **nach** dem Stichtag. Buchhaltung ist `RESEARCH_V1`.
4. **`VALIDATED_TRADE_SIGNAL`:** In Vertrag 1.0.0 nicht ausgebbar (Fehler `STAGE_NOT_ISSUABLE`). Zwei Sperren verhindern das unabhängig voneinander:
   - `VALIDATED_ISSUABLE = false` (`CONTRACT_LOCK`);
   - jeder Datensatz muss `LIVE_NOT_APPROVED` und `DIAGNOSTIC_NOT_CERTIFIED` tragen.

   Auch eine erfundene Readiness, in der alle Kriterien erfüllt sind und eine Freigabe vorliegt, ergibt höchstens `MODELED_TRADE_PLAN` (Test `SF-PRODUCT-VALIDATED-UNREACHABLE`).

Eine Stufe wird nie im selben Datensatz geändert. Für eine Aufwertung entsteht ein **neuer** Datensatz der nächsthöheren Stufe: gleiche Strategie, gleiche `securityId`, gleicher Stichtag, neue `recordId`. Jede Stufe hat genau ihre Felder. Ein `setup` in einem Chart-Kandidaten oder ein `plan` in einem Setup wird als `STAGE_MIXING` abgelehnt.

### 3.2 Pflichtfelder (alle Stufen)

| Feld | Inhalt / Regel |
|---|---|
| `schema`, `contractVersion` | `supertrader-sf-product-candidate-1.0.0`, `1.0.0` |
| `stage` | eine der drei ausgebbaren Stufen |
| `recordId` | `stc_` + SHA-256 aus Schema, Strategie, `securityId`, Stichtag und Stufe (deterministisch, `recordIdFor`) |
| `strategyId`, `candidateId` | registrierter Strategievertrag (C01–C13) |
| `security` | `{ securityId, ticker, identityScheme: 'core/identity.js#securityIdForTicker' }`. Es gilt `securityId === securityIdForTicker(ticker)`; ein von Hand gebautes `ref_`-Präfix wird abgelehnt (z. B. `ref_BRK.B` statt `ref_BRK_B`). |
| `asOf` | Stichtag = letzter verwendeter Balken |
| `pit` | `lastBarDate === asOf`, `barInterval` `DAILY` oder `WEEKLY_FROM_DAILY`; `usesIntraday`, `usesFundamentals`, `usesFutureBars` sind alle `false` |
| `price` | `{ basis: 'SPLIT_ADJUSTED_DAILY', splitFactors: 'quant/engines/return-series.js#splitFactors', publishedClose: 'quant/engines/published-close.js', close, currency: 'USD' }` (ADR-002) |
| `provenance` | `engineId`, `engineVersion`, `codeSha256` (64 hex), `sourceContractVersion` und `contractFingerprint` (müssen zum Strategievertrag passen), `candidateContractVersion`, `readinessCriteriaVersion` (= Artefakt), `dataSource` (`FROZEN_SNAPSHOT` mit der Foundation-Snapshot-ID oder `DAILY_EOD` mit `asOf` und `inputsSha256`); bei MODELED zusätzlich `accounting: RESEARCH_V1` |
| `pattern` | `{ patternId, ruleIds[] }`, nur mechanische Regeln |
| `status` | genau `{ liveReadiness: 'LIVE_NOT_APPROVED', certification: 'DIAGNOSTIC_NOT_CERTIFIED', tradability: 'NO_STATEMENT' }` |
| `disclaimers` | genau die Codes der Stufe (3.3) |
| `dataIntegrity` | `{ quarantinePolicy: 'sf6-discontinuity-quarantine-1.1.0', lookbackDays: 400, quarantinedSessions: [{ date ≤ asOf, flag: 'DQ-K5' oder 'DQ-K3' }] }` |
| `blockReasons` | genau die abgeleiteten Sperrgründe (3.4); keiner darf fehlen, keiner darf erfunden sein |
| `liveActivation`, `orderRouting`, `buyDeclarationAllowed` | `false`, `'NONE'`, `false` |

Zusätzlich gilt:
- `CONFIRMED_RESEARCH_SETUP` braucht `setup` mit den Feldern `mechanicalRules`, `openDiscretionaryRules`, `ambiguousRules`, `dataBlockedRules` und `manualReviewStatus`.
- `MODELED_TRADE_PLAN` braucht zusätzlich `plan` mit den Feldern `hypothetical`, `model {lifecycleKey, variantId}`, `entry {type, trigger, earliestSession}`, `stop {initial}`, `sizing {method, riskFraction ≤ 0,05}`, `exit {ruleIds}` (nur STOP-/EXIT-Regeln), `modelAssumptions` und `declaredDataExceptions`.

Unbekannte Felder werden abgelehnt, zum Beispiel `signal`, `order` oder `target`, und zwar auch in jedem Unterobjekt (`pattern`, `setup`-Einträge, `plan.*`, `blockReasons`-Einträge, Quarantäne-Einträge). `provenance.accounting` ist nur in `MODELED_TRADE_PLAN` erlaubt.

**Bindung an die Readiness:** Der Validator rechnet die Obergrenze immer gegen das committete `STRATEGY-SF6-READINESS.json`. Wer eine Readiness übergibt, muss inhaltsgleich zum Artefakt sein, sonst gilt `READINESS_NOT_COMMITTED_ARTIFACT`. Eine geänderte Readiness kann also keine Obergrenze anheben. `deriveStageCeiling` nimmt dagegen jede Readiness an, damit sich Hypothesen durchrechnen lassen. Auch dort bleibt VALIDATED durch `CONTRACT_LOCK` gesperrt.

**Grenzen des Vertrags (bewusst):**
- Die Quarantäne-Liste ist eine Angabe des Producers. Der Vertrag erzwingt Ausweis und Sperre einer *deklarierten* Sitzung. Ob der Producer jede Sitzung gemeldet hat, prüft erst die spätere DQ-Regel (§5.2, §5.4).
- Bei `FROZEN_SNAPSHOT` lässt sich nicht nachweisen, dass der Stichtag im Snapshot liegt. Für die spätere Produktion ist `DAILY_EOD` mit `inputsSha256` vorgesehen.
- `price.close` wird deklariert, aber nicht gegen `published-close.js` nachgerechnet. Der Vertrag liest keine Daten; die Nachrechnung gehört in die DQ-Regel.

### 3.3 Pflicht-Disclaimer (Codes; der Wortlaut ist eine spätere Produktentscheidung)

| Stufe | Codes |
|---|---|
| CHART | `RESEARCH_ONLY_NOT_ADVICE`, `NOT_VALIDATED`, `NO_TRADABILITY_STATEMENT` |
| CONFIRMED | dazu `OPEN_DISCRETIONARY_RULES_SHOWN` |
| MODELED | dazu `HYPOTHETICAL_MODEL_PLAN` |

### 3.4 Sperrgründe und Aufwertungsregeln

Jeder Sperrgrund nennt die niedrigste Stufe, die er verbietet. Die Stufe eines Datensatzes muss unter jedem zutreffenden Sperrgrund liegen.

| Sperrgrund | Ebene | verbietet ab | Quelle |
|---|---|---|---|
| `QUARANTINE_SESSION_IN_LOOKBACK` | Datensatz | CONFIRMED | DQ-K5/DQ-K3-Sitzung im Rückblick (V4-D1, E1) |
| `DATA_BLOCKED_SETUP_RULE` | Strategie | CONFIRMED | wesentliche SETUP/FILTER/ENTRY-Regel `DATA_BLOCKED` (Proxys heben nicht auf, CC-4/E4) |
| `NOT_IMPLEMENTED`, `NOT_TECHNICALLY_COMPLETE`, `NOT_IN_READINESS` | Strategie | CHART | Vertrag / Readiness |
| `DATA_BLOCKED_EXECUTION_RULE` | Strategie | MODELED | wesentliche STOP/EXIT-Regel `DATA_BLOCKED` |
| `PRIMARY_STATE_BLOCKED` | Strategie | MODELED | Zustand ≠ `RESEARCH_COMPLETE_WITH_EXCEPTIONS` (z. B. `SOURCE_BLOCKED`, `VALIDATION_BLOCKED`) |
| `LIFECYCLE_INCOMPLETE`, `NOT_MEASURABLE` | Strategie | MODELED | < 9 Phasen bzw. Messklasse `NOT_MEASURABLE` |
| `EXECUTION_NOT_PIT`, `NOT_REPRODUCIBLE` | Strategie | MODELED | CC-7 bzw. CC-6 nicht erfüllt |
| `OPEN_DISCRETIONARY_RULE` | Strategie | VALIDATED | wesentliche Regel `MANUAL_REVIEW_REQUIRED` |
| `CERTIFICATION_CRITERION_FAILED` | Strategie | VALIDATED | jedes nicht erfüllte CC-1…CC-8 |
| `NOT_CERTIFICATION_CANDIDATE` | Strategie | VALIDATED | Zustand ≠ `CERTIFICATION_CANDIDATE` |
| `OWNER_APPROVAL_MISSING` | Strategie | VALIDATED | keine Owner-Freigabe je Strategie |
| `PAPER_VALIDATION_NOT_EVALUATED` | Strategie | VALIDATED | SF6-PAPER-2027 nicht `EVALUATED` (heute `PREPARED_NOT_ACTIVE`) |
| `LIVE_NOT_APPROVED` | Strategie | VALIDATED | Readiness `liveReadiness` |
| `CONTRACT_LOCK` | Vertrag | VALIDATED | Vertrag 1.0.0 gibt VALIDATED nie aus |

Aufwertung, jeweils als neuer Datensatz (`checkStageTransition`):

- **CHART → CONFIRMED:**
  - keine Quarantäne-Sitzung im Rückblick;
  - keine datenblockierte Setup-Regel der Strategie;
  - alle mechanischen Setup-, Filter- und Einstiegsregeln erfüllt;
  - vollständiger Ausweis der offenen Ermessens-, Mehrdeutigkeits- und Datenregeln.
- **CONFIRMED → MODELED:**
  - Strategie `RESEARCH_COMPLETE_WITH_EXCEPTIONS` mit 9/9 Phasen, messbar, CC-6 und CC-7 erfüllt;
  - keine datenblockierte STOP- oder EXIT-Regel;
  - je Ermessensregel eine benannte Modellannahme;
  - Datenausnahmen deklariert;
  - PIT-gerechter, hypothetischer Long-Plan.
- **MODELED → VALIDATED:**
  - Readiness `CERTIFICATION_CANDIDATE` (alle CC-1…CC-8);
  - Owner-Freigabe;
  - SF6-PAPER-2027 aktiviert und ausgewertet;
  - **und** eine neue Vertragsversion in einem eigenen PR, die `CONTRACT_LOCK` aufhebt.

  Heute ist das unmöglich.

## 4. Was der Test absichert

`sf-product-contract.test.mjs` prüft:
- Vertragsdefinition per Hash festgeschrieben;
- Obergrenze je Strategie festgeschrieben;
- VALIDATED für alle 13 abgelehnt, auch bei erfundener Voll-Readiness mit Freigabe;
- jedes fehlende Pflichtfeld, jeder fehlende Disclaimer und jede Statusänderung wird abgelehnt;
- ein Datensatz mit Quarantäne-Sitzung kommt nicht über CHART hinaus, und der Sperrgrund lässt sich nicht verschweigen;
- ADR-001: `ref_BRK.B`, `ref_brk_b` und Ähnliches werden abgelehnt;
- ADR-002;
- keine Stufenvermischung, auch nicht verschachtelt in Unterobjekten; nur Übergänge zur nächsten Stufe als neuer Datensatz;
- gesperrte Strategien bleiben unter ihrer Obergrenze;
- Ermessensausweis und Modellannahmen;
- PIT (Folgesitzung, kein Intraday, keine Fundamentaldaten, keine Zukunftsbalken);
- Sperrgründe exakt abgeleitet;
- eine geänderte Readiness hebt keine Obergrenze an;
- keine Laufintegration: kein Workflow, keine Datei unter `supertrader/` und kein Eintrag in `domains.json` verweist auf das Modul; das Modul enthält keine Schreib- oder Netzzugriffe.

## 5. Technische Integrationsvoraussetzungen (spätere, eigene PRs)

1. **Datenlauf.**
   - Ein eigener Producer, etwa `scripts/supertrader/source-faithful/product/build-candidates.mjs`, ruft die bestehenden Engines auf dem letzten EOD-Stand auf. Er erzeugt Datensätze ausschließlich über diesen Vertrag und verwirft jeden ungültigen Datensatz, statt ihn zu reparieren.
   - Der Producer läuft in einem eigenen Workflow `supertrader-*.yml` nach ADR-005: Checkout mit `ref`, `push-with-retry.sh`, Concurrency mit `-${{ github.ref_name }}`, Eingaben nur über `env:`.
   - Er startet nur nach validierten Daten, wie die bestehende Kette `scripts/ci/supertrader-chain.mjs`.
   - Er schreibt in ein eigenes Artefakt unter `supertrader/data/`, nie in Research-Artefakte. Tests rufen ihn mit `--out` auf.
   - Die Laufzeit wird dort gemessen.
   - Kein Lauf liest versiegelte Kennzahlen.
2. **Quarantäne im Tageslauf.** Der Producer muss `flagDiscontinuities` (DQ-K5 und DQ-K3) über den 400-Tage-Rückblick jedes Titels rechnen und `dataIntegrity.quarantinedSessions` befüllen. Ohne diese Prüfung ist kein Datensatz vertragsgemäß.
3. **Producer-Registrierung.**
   - Neuer Domain-Eintrag in `core/registry/domains.json` mit `producer`, `workflow`, `schedule`, `freshness` (Sitzungen), `asOf` und `records`.
   - Weil `domains.json` außerhalb von Gate A liegt, ist das ein eigener Core-PR.
   - Das Artefakt gehört danach seinem Erzeuger und wird nie von Hand geändert.
4. **DQ-Regeln** (`scripts/core/data-quality.mjs`, Core-PR):
   - jeder veröffentlichte Datensatz besteht `validateCandidateRecord` gegen das zum Laufzeitpunkt committete Readiness-Artefakt;
   - kein Datensatz über der Obergrenze seiner Strategie;
   - kein `VALIDATED_TRADE_SIGNAL`;
   - `asOf` = letzter EOD-Stand;
   - `securityId` existiert im Security Master;
   - `codeSha256` entspricht dem Code des Laufs;
   - die Quarantäne-Liste jedes Datensatzes stimmt mit `flagDiscontinuities` über den Rückblick überein;
   - `price.close` stimmt mit `published-close.js` überein.
5. **Status-Seite** (`/status/`, `system-health.mjs`, `diagnose.mjs`): Frische, Zahl je Stufe und Strategie, Zahl der Quarantäne-Sperren und Vertragsversion; je Titel (`/status/#/TICKER`) die Sperrgründe.
6. **Frontend-Sprache und Disclaimer.**
   - Die Disclaimer-Codes brauchen einen deutschen Wortlaut als Produktentscheidung. Die Stufen tragen eigene Namen: Chart-Kandidat, bestätigtes Research-Setup, modellierter Handelsablauf. Wörter wie „Signal“, „Kauf“ oder „validiert“ kommen nicht vor.
   - Je Kandidat werden offene Ermessensregeln, Modellannahmen und Sperrgründe sichtbar gemacht.
   - Es wird nur gezeigt, was im Datensatz steht; insbesondere keine Rendite, keine Trefferquote und kein Trust Score (wie `SUPERTRADER_PRODUCT_READINESS.md`).
   - Abgrenzung zu den heutigen Live-Varianten (Darvas VU, Weinstein VU, Momentum Breakout Daily): Sie heißen ähnlich, sind aber andere Regeln. Die Benennung muss sie unterscheiden.
   - Für Discover-Ansichten gilt das Frontend-Budget.
7. **Freigaben (Owner).**
   - Anzeige je Stufe und Strategie;
   - Wortlaut der Disclaimer;
   - Umgang mit Strategien mit nur übersetzten Quellen (CC-1, Minervini);
   - Owner-Entscheidungen zu den Ermessensregeln, bevor diese als Modellannahmen öffentlich erscheinen;
   - für VALIDATED später zusätzlich die Freigabe aus §3.4.

## 6. Ausdrücklich nicht Teil dieser Arbeit

- keine Kandidaten, Signale, Orders, Broker oder Live-Aktivierung;
- keine Statusaufwertung irgendeiner Strategie;
- kein neuer Workflow, Modus oder Datenlauf;
- keine Schreibvorgänge in `supertrader/data` oder andere committete Artefakte;
- kein Import in Frontend-Dateien; keine Änderung an `supertrader/**`;
- keine Registrierung in `core/registry/domains.json`;
- keine Änderung an Engines, Strategieverträgen, Readiness-Kriterien, SF6-PAPER-2027 oder Gates;
- kein Lesen versiegelter Kennzahlen;
- keine externen Abrufe.
