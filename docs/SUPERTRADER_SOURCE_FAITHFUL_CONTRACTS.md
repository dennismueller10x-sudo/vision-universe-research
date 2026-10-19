# Supertrader – Source Contracts der 13 Buchkandidaten (Phase 0/1)

Stand: 19. Oktober 2026. Research-Code, keine Live-Signale, keine Handelsausführung, keine Änderung bestehender Strategien oder Portfolios.

Code: [`scripts/supertrader/source-faithful/`](../scripts/supertrader/source-faithful/). Tests: `scripts/supertrader/tests/sf-foundation.test.mjs`.

## 1. Quellenbasis (geprüft, nicht neu recherchiert)

| Eingabe | Rolle | Prüfung |
|---|---|---|
| Draft-PR #709 `research/supertrader-primary-source-reconstruction` @ `8b766fa4947cb2b564ede7cd850c6a995f57aada` | maßgebliche Quellenevidenz | alle 20 Manifest-Dateien per SHA-256 und Bytezahl geprüft: 20/20 identisch; 785 Regeln, 287 Fälle, 52 Konflikte, 13 Kandidaten; Final Review `PASS_WITH_EXPLICIT_SOURCE_GAPS`, 0 HIGH / 0 CRITICAL offen |
| Draft-PR #712 `research/supertrader-source-acceptance-v4-1` @ `26e6caf` | Acceptance-Referenz (Befund V41-F1, Golden-Case-Ideen) | gelesen; nicht gemergt, nicht überschrieben; sein Extraktor ist die Vorlage von `evidence/psr709-extract.mjs` |

#709 und #712 bleiben Drafts. Gate A erlaubt keine Kopie der #709-Dokumente nach `main`; `evidence/PSR709-EVIDENCE-EXTRACT.json` ist deshalb ein wörtlicher, hash-gebundener Auszug (421 Regeln der Kandidatenkontexte, 197 Fälle, 27 Konflikte, 20 Quellen). `PSR709_DIR=<Checkout> node --test …sf-foundation.test.mjs` baut ihn bytegleich nach.

## 2. Die 13 tatsächlichen Kandidaten

Aus `SUPERTRADER-TOP-IMPLEMENTATION-CANDIDATES.json` (#709). CAN SLIM ist **kein** Kandidat (B04 nur teilweise vorhanden, GAP-B04) und wird nicht mitgezählt.

| # | Strategie-ID | Trader / Methode | Ziel-PR |
|---|---|---|---|
| C01 | `SF_TURTLE_S1` | Original Turtles System 1 | PR 2 |
| C02 | `SF_TURTLE_S2` | Original Turtles System 2 | PR 2 |
| C03 | `SF_DARVAS_BOX` | Darvas spätere Q&A-Box und Stops | PR 3 |
| C04 | `SF_WEINSTEIN_INVESTOR` | Weinstein Stage 2 Investor | PR 4 |
| C05 | `SF_WEINSTEIN_TRADER` | Weinstein Stage 2 Trader-Fortsetzung | PR 4 |
| C06 | `SF_MINERVINI_SEPA_VCP` | Minervini SEPA/VCP mit manueller Rangfolge | PR 6 |
| C07 | `SF_MINERVINI_POWER_PLAY` | Minervini Power Play | PR 6 |
| C08 | `SF_KK_BREAKOUT` | Kullamägi Common Breakout (Tagesvariante) | PR 7 |
| C09 | `SF_KK_EPISODIC_PIVOT` | Kullamägi Episodic Pivot | PR 7 |
| C10 | `SF_KK_PARABOLIC_SHORT` | Kullamägi Parabolic Short | PR 7 |
| C11 | `SF_MOKA_POCKET_PIVOT` | Morales/Kacher Pocket Pivot | PR 5 |
| C12 | `SF_MOKA_BUYABLE_GAP_UP` | Morales/Kacher Buyable Gap-Up | PR 5 |
| C13 | `SF_RASCHKE_HOLY_GRAIL` | Raschke Holy Grail (offengelegte Komponente) | PR 8 |

## 3. Gemeinsamer Vertrag (`contract.mjs`)

Jeder Kandidat hat genau einen Vertrag (`contracts/*.mjs`) mit: Strategy ID, Source-Contract-Version, Security Identity (`core/identity.js`, ADR-001), Signal- und frühestem Ausführungszeitpunkt, Entry-/Exit-/Stop-/Sizing-Regeln, Corporate-Action-Policy (ADR-002, Snapshot-Konvention), Pflichtdaten, Verhalten bei fehlenden Daten, Manual-Review-Flags, Accounting (`research-v1`), Snapshot und Reproduzierbarkeitsbeleg.

Je Regel: eigene ID, #709-Regel-IDs, Status, Code, Tests. Status:

- `SOURCE_EXACT` nur für #709-Regeln mit HARD, HIGH, geprüftem Originalwortlaut und `SCOPE_AND_EXCEPTIONS_REQUIRED` (der Validator erzwingt das).
- `SOURCE_DERIVED` nur mit schriftlicher `derivation` (Equity-Übersetzung, Tagesbalken-Lesart, übersetzungsabhängiger Wortlaut).
- `MANUAL_REVIEW_REQUIRED`, `DATA_BLOCKED`, `SOURCE_AMBIGUOUS`, `NOT_IMPLEMENTED` – die letzten drei nur mit `reason`.
- Eine #709-Präferenz (`DO_NOT_HARDEN_PREFERENCE`) darf nie als Maschinen-Gate gelten. Einzige deklarierte Ausnahme: die Setup-Definition des Holy Grail selbst (`gateExemption`).

Der Methodenstatus (`IMPLEMENTED_SOURCE_EXACT` … `NOT_IMPLEMENTED`) wird **abgeleitet**, nie gesetzt. Eine fehlende, manuelle oder datenblockierte wesentliche Regel verhindert einen „vollständig“-Status. Turtle wird zusätzlich je Ebene (Original / Equity-Adaption) ausgewiesen.

Solange ein Methoden-PR nicht gemergt ist, meldet sein Vertrag jede Regel als `NOT_IMPLEMENTED` mit `targetStatus` (Test `SF-PLANNED`).

## 4. Abdeckung

`artifacts/STRATEGY-COVERAGE-MATRIX.json` führt jede #709-Regel jedes Kandidatenkontexts mit dem Status der ausführbaren Regel oder einer schriftlichen Ausnahme. Ungeklärte Zeilen: 0 (Prüfung `RV-NO-UNMAPPED-RULE`).

## 5. Foundation-Anbindung (Phase 1)

- `supertrader-validation.yml` reicht `--snapshot` und `--accounting` an jeden `analyze-methods.mjs`-Lauf durch: Eingabe `snapshot` / `accounting` (workflow_dispatch) oder Marken `[supertrader-validation-snapshot:sts1-…]` und `[supertrader-validation-accounting:research-v1]`.
- Fail closed: ungültige Snapshot-ID → Abbruch; Snapshot mit einem Modus, dessen Runner keinen Snapshot liest (z. B. `analyze`, `subset`, `r9b`) → `SNAPSHOT_NOT_SUPPORTED_FOR_MODE`. So kann ein eingefrorener Lauf nie still Live-Tickerlisten oder Live-Reihen laden.
- Eingaben nur über `env:` (ADR-005). `analyze-methods.mjs` selbst ist unverändert und verlangt beim Öffnen einen unabhängigen RESTORE-Beleg.
- Bindung je Vertrag: Snapshot `sts1-134d4d62eb88b6ff8d98fe6e56b12a6d`, Accounting `RESEARCH_V1`. Ein Reproduzierbarkeitsbeleg ohne `RESEARCH_V1` oder ohne gültige Snapshot-ID wird abgelehnt.

## 6. Artefakte

`scripts/supertrader/source-faithful/artifacts/`: `STRATEGY-SOURCE-CONTRACTS.json` (Kette Source → Edition → Rule → Kandidat → ausführbare Regel → Test → Status), `STRATEGY-IMPLEMENTATION-STATUS.json`, `STRATEGY-REGISTRY.json`, `STRATEGY-REGISTRY-VALIDATION.json`, `STRATEGY-SNAPSHOT-PROVENANCE.json`, `STRATEGY-COVERAGE-MATRIX.json`, `STRATEGY-GOLDEN-CASE-RESULTS.json`. Neu bauen: `node scripts/supertrader/source-faithful/build-artifacts.mjs`.

## 7. Bekannte Datengrenze

V4-D1 (#705, BLOCKER für Zertifizierung, offen): nicht deklarierte Reverse-Splits in etwa 1 % der Wertpapiermonate des kanonischen Kerns. Jede spätere diagnostische Messung erbt das und bleibt `DIAGNOSTIC_NOT_CERTIFIED`. Die Behebung gehört in einen Quant-PR, nicht in diese Arbeit.
