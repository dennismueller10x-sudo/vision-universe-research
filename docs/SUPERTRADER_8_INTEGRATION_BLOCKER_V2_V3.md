# Supertrader 8.0 – Integrationsblocker V2/V3: Core-Registry und Datenqualität

Stand 26.10.2026, **Umsetzung 27.10.2026:** Schritt 1 in #1025, Schritt 2 und 3 in #1027, V4 in #1026; die Abweichungen stehen unten. Dieses Dokument gehört zu #973 (Tageslauf, deaktiviert). Es beschreibt, was fehlt, bevor `supertrader/data/sf-candidates` als Datenart existieren darf. Dass V2 und V3 offen sind, blockiert die **Aktivierung des Tageslaufs**. Die Integration von #969, #970 und #971 blockiert es nicht: Diese PRs bringen keine Daten mit, und die Vorschau bleibt ohne Daten im Leerzustand.

## Warum V2/V3 ein eigener Blocker sind

- **CLAUDE.md:** Dateien unter `*/data` gehören ihrem Erzeuger aus `core/registry/domains.json` (Feld `producer`). Ein Workflow, der in einen nicht registrierten Pfad schreibt, hat keinen dokumentierten Eigentümer.
- **Status und Diagnose:** `scripts/core/system-health.mjs` und `/status/` lesen die Datenarten aus der Registry. Ohne Eintrag gibt es für die Kandidaten keine Frischeanzeige und keine Warnung bei veraltetem Stand.
- **Datenqualität:** `scripts/core/data-quality.mjs` hat keine Regel für die neue Datenart. Ein fehlerhafter Stand fiele weder in `core-ci.yml` noch im strengen Live-Lauf auf.
- **Gates:** `core/` liegt außerhalb von Gate A. Die Änderung gehört deshalb nicht in einen Supertrader-PR.
- **Schutztests auf `main`:** Zwei Supertrader-Tests verbieten heute ausdrücklich, dass `core/` den Produktpfad nennt:
  - `SF-PRODUCT-NO-RUN-INTEGRATION`: `domains.json` darf `candidate-contract|supertraderCandidates|source-faithful/product` nicht enthalten.
  - `SF2-LEGACY-ISOLATION`: Kein Pfad unter `core/` darf `source-faithful/` nennen.

  Ein Registry-Eintrag mit `producer: scripts/supertrader/source-faithful/product/build-candidates.mjs` würde beide Tests rot machen.

## Konkrete Anforderungen

### Schritt 1 – Supertrader-PR (Gate A): Schutztests eng öffnen

- `SF-PRODUCT-NO-RUN-INTEGRATION` erlaubt in `core/registry/domains.json` **genau einen** Eintrag mit `id: "supertrader-sf8-candidates"`. Der Test prüft dessen Felder (Erzeuger, Workflow, Artefakt). Jeder weitere Verweis bleibt verboten.
- `SF2-LEGACY-ISOLATION` nimmt `core/registry/domains.json` nur für diesen einen Eintrag aus; jeder andere Verweis unter `core/` bleibt verboten.
- Gegenproben wie beim Tageslauf: Ein zweiter Eintrag oder ein anderer Verweis macht den Test rot.
- Dieser PR wird **vor** dem Core-PR gemergt, sonst wird die Supertrader-Suite auf `main` rot.

### Schritt 2 – Core-PR (V2): Registry-Eintrag

Neuer Eintrag in `core/registry/domains.json`. Das Format entspricht der bestehenden Datenart `supertrader`.

```json
{
  "id": "supertrader-sf8-candidates",
  "label": "Supertrader Research-Kandidaten (Vorschau)",
  "layer": "PRODUCT",
  "group": "Products",
  "critical": false,
  "artifact": "/supertrader/data/sf-candidates/summary.json",
  "asOf": ["asOf"],
  "timestamp": [],
  "records": "counts.candidates",
  "role": "Quellentreue Research-Kandidaten der 13 Supertrader-Methoden (Stufen 1–3, Stufe 4 gesperrt). Keine Signale, keine Empfehlungen.",
  "producer": "scripts/supertrader/source-faithful/product/build-candidates.mjs",
  "workflow": "supertrader-sf8-candidates.yml",
  "schedule": "Kein Zeitplan; manuell und nur mit Repository-Variable SF8_CANDIDATES_ENABLED=true (O-2).",
  "freshness": { "kind": "sessions", "warnAfter": 1, "staleAfter": 2 },
  "consumers": ["/supertrader/ (Vorschau, ?sfPreview=1)"]
}
```

Offene Punkte im Core-PR:

- **Zeitstempel:** `summary.json` trägt bewusst keinen (bitgleiche Ausgabe). Entweder akzeptiert `system-health` einen leeren `timestamp` mit reiner `asOf`-Frische, oder der Producer schreibt ein getrenntes `meta.json` mit Laufzeitpunkt. Das Zweite verändert die bitgleiche Hauptausgabe nicht.
- **`records`:** Der Pfad `counts.candidates` muss vom Leser unterstützt werden; sonst bleibt das Feld `null`.
- **Warnliste in `core-ci.yml`** („Erzeugte Artefakte im PR“): `^supertrader/data/sf-candidates/` ergänzen, damit Feature-PRs, die Kandidaten mitbringen, sichtbar gewarnt werden.

### Schritt 3 – Core-PR (V3): Datenqualitätsregeln

Neue Regeln in `core/data-quality.js` (UMD, mit Tests in `core/tests/`), aufgerufen aus `scripts/core/data-quality.mjs`. Sie greifen nur, wenn `supertrader/data/sf-candidates/summary.json` existiert; fehlt die Datei, ist das kein Fehler, solange der Tageslauf deaktiviert ist.

| Regel | Prüfung | Schwere |
|---|---|---|
| `sf8Freshness` | `summary.asOf` ≥ erwartete Sitzung − Lag (wie `technicalFreshness`, Lag 2) | Fehler |
| `sf8Schema` | `schema === "supertrader-sf8-candidates-1.0.0"`, alle 13 Strategien vorhanden, `tickerShards` und `strategy/Cxx.json` existieren (wie `referencedPathsExist`) | Fehler |
| `sf8StageLock` | `counts.byStage.VALIDATED_TRADE_SIGNAL` fehlt oder ist 0; keine Ansicht über der Obergrenze ihrer Strategie (MODELED nur C01/C02/C03/C07/C08/C12, CONFIRMED höchstens C11/C13, sonst CHART) | Fehler |
| `sf8NoOrderBelowModel` | Keine Ansicht unterhalb von `MODELED_TRADE_PLAN` mit `plan`, `levels.trigger`, `levels.stopReference` oder `levels.limit` (wie `SF8-NO-ORDER-LEVELS-BELOW-MODEL`) | Fehler |
| `sf8NoRecords` | Kein `records/` unter `supertrader/data/sf-candidates/` (Vertragsdatensätze nur als CI-Artefakt) | Fehler |
| `sf8Budget` | Öffentliche Teile höchstens 16 MB, je Datei höchstens 2 MB | Warnung |
| `sf8PriceParity` | `close` je Ansicht gegen `quant/engines/published-close.js` (V4, ADR-002) | erst mit V4, vorher Warnung |

### Reihenfolge

1. Schritt 1: Supertrader-PR, Schutztests eng öffnen.
2. Schritt 2 und 3: Core-PR mit Registry, Warnliste und DQ-Regeln samt Tests.
3. V4: Abgleich mit `published-close.js`.
4. V1: Belege für die Stabilität der SEC-/Quant-Consumer-Pipeline.
5. V5: Freigabe der Vorschau durch den Owner.
6. V6: Variable setzen, erster Lauf manuell mit `commit=false`, danach ein eigener PR für einen Zeitplan.

## Umsetzung (27.10.2026)

| Schritt | PR | Abweichung vom Entwurf oben |
|---|---|---|
| 1 Schutztests | #1025 | Zusätzlich muss `activation.state` auf `PREPARED_DISABLED` stehen; eine Aktivierung braucht damit einen eigenen PR. |
| 2 Registry | #1027 | Neues Feld `activation` (`PREPARED_DISABLED`, `pendingWorkflow: PR #973`). Health meldet DISABLED/NOT_ACTIVATED statt FAILED, solange kein Artefakt existiert; ein Artefakt ohne Freigabe ist FAILED. `timestamp: []` mit reiner `asOf`-Frische, ohne `meta.json`. |
| 3 DQ | #1027 | Acht Regeln DQ-SF8-1..8: Identität (2) und Quarantäne (5) sind eigene Regeln, `records/` ist Teil der Ergebnisverträge (6). Das Budget ist ERROR statt WARN. Der Preisabgleich ist sofort ERROR, weil V4 umgesetzt ist (#1026). |
| V4 | #1026 | – |

#973 wendet DQ-SF8 vor dem Commit an und committet nur bei freigegebenem Eintrag.
