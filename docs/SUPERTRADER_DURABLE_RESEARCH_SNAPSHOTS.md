# Supertrader – Durable Research Snapshots

Stand: 19. Oktober 2026. Reproduzierbare Eingaben für Research-Backtests. Keine Änderung an Discover, Technical, Screener, produktiven Kursdaten, Live-Signalen oder Watchlists. Keine Strategie- oder Datenregel geändert.

Code: [`scripts/supertrader/snapshot/`](../scripts/supertrader/snapshot/). Workflow: [`.github/workflows/supertrader-research-snapshot.yml`](../.github/workflows/supertrader-research-snapshot.yml).

Artefakte: [`scripts/supertrader/foundation/artifacts/`](../scripts/supertrader/foundation/artifacts/)
- `SUPERTRADER-SNAPSHOT-CONTRACT.json`
- `SUPERTRADER-SNAPSHOT-INTEGRITY-RESULT.json`
- `SUPERTRADER-SNAPSHOT-RESTORE-RESULT.json`
- je Lauf `snapshot-runs/<runId>/`

## 1. Ausgangsproblem im Code

`validation/analyze-methods.mjs loadPitData` hat bei jedem Lauf und in jedem Job neu gelesen:
- die **Live-Tickerliste** von Tiingo (`supported_tickers.zip`); sie bestimmt Listing-Tabelle und Universum,
- die **R2-Reihen**: `tiingo-delisted` und die täglich fortgeschriebene Produktionsreihe `v1/tiingo/...`,
- die **Repository-Dateien** `universe-FULL_UNIVERSE.json`, `eligibility.json` und `company-names.json`, die Datenläufe täglich neu schreiben.

Der Fingerabdruck (`dataFingerprint`) machte Abweichungen sichtbar, aber nicht vermeidbar: Die Bytes wurden nirgends aufbewahrt. Das ist genau der in #763 beschriebene Drift.

## 2. Architektur

```
capture-Job (1x)                       restore_a  ┐  (eigene Runner, nach Ende des Captures)
  loadPitData mit aufzeichnender IO  →  restore_b  ┼→ compare → publish (nur Hashes)
  → write-once R2 → zuruecklesen          …       ┘
  → Manifest (ID = Inhalts-Hash) → CAPTURE-Beleg
```

1. **Capture (ein Job).**
   - `loadPitData` läuft einmal mit aufzeichnender Eingabequelle (`snapshot/io.mjs`).
   - Jede gelesene Eingabe wird **bytegleich** aufgezeichnet, auch ein 404: Tickerlisten-ZIP, Repository-Datei, R2-Objekt.
   - Die Ladeflags sind die Obermenge aller Runden (`CANONICAL_LOAD`).
   - Die Nullkostenschranke und die Generationen- und Größengrenze laufen vor dem ersten Schreiben.
   - Danach: Objekte schreiben, alles zurücklesen und hashen, Manifest schreiben, `CAPTURE`-Beleg schreiben.
2. **Restore (unabhängige Jobs).** Jeder Job öffnet den Snapshot und:
   - prüft jedes Objekt (SHA-256 und Länge),
   - baut den Datensatz mit `loadPitData` auf der abspielenden Quelle neu,
   - vergleicht Datensatz-Fingerabdruck und Zählungen,
   - rechnet einen festen **Kontroll-Backtest** (Donchian, 150 Segmente, RESEARCH_V1-Abrechnung) und vergleicht dessen Hash,
   - schreibt einen `RESTORE`-Beleg.
3. **Parität.** `compare` verlangt mindestens zwei Konsumenten mit identischer Snapshot-ID, identischem Datensatz-Hash, Kontroll-Hash, Bytezahl und Objektzahl.
4. **Konsumenten.** `analyze-methods.mjs --snapshot <sts1-…>`:
   - liest alle Eingaben aus dem Snapshot, ohne Live-Tickerliste und ohne Live-Reihen,
   - verlangt einen unabhängigen `RESTORE`-Beleg,
   - legt die Snapshot-ID im versiegelten Ergebnis ab.

## 3. Snapshot-Inhalt (Contract `supertrader-research-snapshot-1.0.0`)

| Bestandteil | Feld |
|---|---|
| fixe Universe-/Tickerliste | `universe.tickerListSha256`, Objekt `TICKER_LIST_ZIP`, `listingTableHash` |
| fixer Stichtag | `asOfDate`, `window` |
| Source-Object-Manifest | `objects.index` (Schlüssel, Shard, Offset, Länge, SHA-256; fehlend markiert) |
| stabile Listing-/Security-IDs | `identity` (Listing-ID `tiingo:<EX>:<TICKER>:<start>`, securityId über `core/identity.js`) |
| kanonischer Datensatz | `dataset` (Segment-Hash, Kalender-, SPY-, Tabellen-Hash, Zählungen) |
| Corporate-Action-Metadaten | `dataset.counts.splitEvents`, `dividendEvents`, `delistedSegments` |
| Adjustment-Konvention | `convention` (Hash von `adjustSeries`, `splitSegments`, `MAX_GAP_DAYS`, Listing-Regeln), `codec` |
| Input-Hashes | SHA-256 je Objekt, je Shard, je Repository-Datei |
| Dataset-Contract-Version | `contract` |
| Code-/Engine-Version | `code` (SHA-256 der bestimmenden Dateien), `engines` |
| Capture-Provenienz | `provenance` (Run, Job, Commit, Runner, Node), `capture` |
| Integrity-Receipt | `receipts/<id>/CAPTURE-…`, `RESTORE-…` |

**ID:** `sts1-` + SHA-256 des kanonischen Manifests (32 Hex-Zeichen). Sie ist unveränderlich und eindeutig. Neue Quellen ergeben eine **neue Generation**, nie die Änderung eines bestehenden Snapshots.

## 4. Fail-closed-Regeln

Jede Verletzung wirft `INPUT_INTEGRITY_FAILURE:<CODE>`. Dann gibt es keine Rechnung und keine Veröffentlichung.

| Fall | Code |
|---|---|
| Snapshot unvollständig | `SNAPSHOT_INCOMPLETE` |
| Source-Object fehlt | `SOURCE_OBJECT_MISSING` |
| Bytes verändert | `OBJECT_HASH_MISMATCH` |
| Manifest manipuliert | `MANIFEST_ID_MISMATCH` |
| Dataset-Fingerprint weicht ab | `DATASET_FINGERPRINT_MISMATCH` |
| Kontroll-Backtest weicht ab | `REPLAY_FINGERPRINT_MISMATCH` |
| Tickerliste gehört nicht zum Snapshot | `TICKER_LIST_NOT_IN_SNAPSHOT` |
| Stichtag / Fenster unterschiedlich | `AS_OF_DATE_MISMATCH` / `WINDOW_MISMATCH` |
| Corporate-Action-Konvention oder Codec weicht ab | `CORPORATE_ACTION_CONVENTION_MISMATCH` |
| private Daten nicht verfügbar | `PRIVATE_DATA_UNAVAILABLE` |
| nicht unabhängig wiederhergestellt | `SNAPSHOT_NOT_RESTORABLE` |
| parallele Jobs sahen verschiedene Eingaben | `PARALLEL_INPUT_DIVERGENCE` |
| Schreibversuch auf einen Snapshot / Inhaltskonflikt | `SNAPSHOT_READ_ONLY` / `SNAPSHOT_OBJECT_CONFLICT` |
| Kosten- oder Generationsgrenze | `ZERO_COST_GUARD_BLOCKED`, `SNAPSHOT_RETENTION_CAP_REACHED`, `SNAPSHOT_SIZE_CAP_EXCEEDED` |

Jeder Code hat einen Test in `scripts/supertrader/tests/snapshot.test.mjs` (16 Tests).

## 5. Speicher, Unveränderlichkeit, Verschlüsselung, Lizenz, Kosten

- **Ablage.** Bestehender privater R2-Eimer und bestehender Treiber; Zugangsdaten nur als Actions-Secrets in diesem Workflow.
  - Eigener Präfix `research-snapshots/supertrader/sts1/` bzw. `…/sts1-smoke/`; Produktionspfade `v1/…` werden nicht beschrieben (Test).
  - Der Treiber kennt nur GET, PUT, HEAD und LIST.
- **Unveränderlich ohne Versionierung.** Schlüssel = SHA-256 des Inhalts. Vor jedem PUT steht ein HEAD; ein existierendes Objekt wird verglichen, nie überschrieben. Zwei parallele Schreiber können nur identische Bytes hinterlassen. Löschen ist im Treiber gesperrt.
- **Verschlüsselung.** Die Rohdaten liegen nur im zugriffsgeschützten Eimer, so wie der bestehende Rohdatenspeicher.
  - Eine zusätzliche Umschlagverschlüsselung wäre möglich, braucht aber ein neues Schlüssel-Secret für die Konsumenten-Jobs. Das ist eine Owner-Entscheidung.
  - Die Owner-RSA-Versiegelung (`results-public-key.pem`) eignet sich nicht, weil Jobs lesen müssen.
- **Öffentlich** (das Repository ist öffentlich) erscheinen nur Hashes, Zählungen und Reason Codes. Fehlerdetails, die Objektschlüssel mit Tickern enthalten, stehen nur als Hash da (Test).
- **Lizenz.** Tiingo-Rohdaten bleiben intern und privat wie im bestehenden Speicher. Die Tickerliste ist eine öffentlich abrufbare Datei. Es gibt keine Weitergabe und keine Veröffentlichung von Kursen.
- **Kosten** (R2-Freigrenze: 10 GB, 1 Mio. Class A, 10 Mio. Class B).
  - Je Capture: einmal die Reads eines Analyse-Laufs, wenige Dutzend PUTs (16-MB-Shards) und Speicher in Höhe der komprimierten Rohreihen.
  - Die Nullkostenschranke rechnet vorher mit dem Speicherzuwachs (`bytesDelta`).
  - Höchstens 3 Generationen je Ablage und 3 GB je Snapshot.
  - Kein Tiingo-Kursabruf; einmal die Tickerliste.

## 6. Ergebnis der Läufe

| Lauf | Art | Snapshot | Ergebnis |
|---|---|---|---|
| 39211850181 | Smoke (400 Mitglieder) | `sts1-4af8b4a9…` | 405 Quellobjekte, 36 MB. Capture und 2 unabhängige Restores identisch |
| 39213033571 | voll | `sts1-134d4d62eb88b6ff8d98fe6e56b12a6d` | 9.361 Quellobjekte, 586 MB, 35 Shards. 2 unabhängige Restores: Datensatz und Kontroll-Backtest EXACT, identisch |
| 39217202814 | nur Restore, getrennter Lauf | derselbe (aus `SNAPSHOT-POINTER.json`) | 2 weitere unabhängige Restores: alle 586.282.893 Bytes geprüft, Hashes identisch zu Lauf 39213033571 |

Der Datensatz des vollen Snapshots:
- 15.565 Listings (8.266 aktiv, 7.299 inaktiv zum Stichtag 2026-10-19), 9.356 Mitglieder, 9.211 Segmente
- 14.499.984 Bars, 3.339 Split- und 96.443 Dividendenereignisse, 3.226 Segmente mit Ende vor dem Fenster

**Damit beantwortet:**
- **Persistenz:** Der Snapshot überlebt das Ende des Capture-Jobs und den ganzen Workflow-Lauf.
- **Bytegleichheit:** Vier unabhängige Jobs in zwei Läufen stellen ihn bytegleich her.
- **Kein Tickerlisten-Drift:** Die Tickerliste ist als Bytes eingefroren (SHA-256 `de247a68…`/Lauf), ein Konsument kann keine andere Liste bekommen. Eine neue Liste ergibt eine neue Generation.

## 7. Unabhängiger Review

Ein adversarialer Review fand im Snapshot-Teil 2 HIGH- und 4 MEDIUM-Befunde. Alle sind geschlossen (`SUPERTRADER-BACKTEST-FOUNDATION-REVIEW.json`):
- **F1:** Live-Minutendaten im Snapshot-Modus sind jetzt gesperrt.
- **F2:** Ein Re-run kollidierte mit Belegen; Belege haben jetzt inhaltsadressierte Schlüssel.
- **F5:** Konsumenten prüfen jetzt den Datensatz-Fingerabdruck.
- **F6:** Code-Drift wird getrennt als `CODE_VERSION_CHANGED` gemeldet.
- **F7:** Captures laufen global nacheinander; die Bytegrenze zählt auch verwaiste Objekte.
- **F8:** Kein stiller Rückfall auf einen alten Zeiger.

## 8. Grenzen und Owner-Schritte

- **Aufräumen:** Löschen alter Generationen ist im Treiber gesperrt. Die Grenze liegt bei 3 vollen und 5 Smoke-Generationen; danach blockiert der Capture mit `SNAPSHOT_RETENTION_CAP_REACHED`. Aufräumen ist eine Owner-Entscheidung.
- **Verschlüsselung (optional):** Eine Umschlagverschlüsselung braucht ein neues Secret.
- **Workflow-Anbindung:** `supertrader-validation.yml` reicht `--snapshot` noch nicht durch; das ist der erste Schritt der Strategie-PRs.
- **Minutendaten:** r9b/r10b (Minutendaten) sind nicht eingefroren und im Snapshot-Modus gesperrt.

Einzelheiten stehen in `SUPERTRADER-SNAPSHOT-INTEGRITY-RESULT.json` und `SUPERTRADER-SNAPSHOT-RESTORE-RESULT.json`.
