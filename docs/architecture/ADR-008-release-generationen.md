# ADR-008 · Release-Generationen: Code und Daten jeder Auslieferung benennen

Stand 10.11.2026 (Strang T). Betrieb: [RUNBOOK §13](../operations/RUNBOOK.md). Ausgangspunkt: Audit vom 10.11. (Commit 6ba4661); geprüft gegen `main` 7b50e6f, nicht gegen PR-Beschreibungen.

## Entscheidung

**Alternative B: ein Generationenmanifest je Auslieferung** (`/core/release-manifest.json`), additiv. Kein Speicherumbau, kein neuer Dienst. Es nennt Code-SHA, Datenzweig-SHA, je Datenart Pfad + Inhaltshash, Erzeuger-Version, Security-Master- und Company-Intelligence-Generation und einen Gesamthash der Nutzdaten. CI und Pages prüfen denselben Hash-Vertrag (Test RM). Die Fehlerlogik von Pages und Company Intelligence (refresh-dispatch-wait, Marker, Gate) bleibt unverändert.

## Ist-Graph

```
Quelle (Tiingo, SEC, ECB, Feeds)
  → Erzeuger (Workflow je Datenart, core/registry/domains.json: producer)
  → Artefakt (main: Markt-Kette; Datenzweig data/live: übrige Datenarten, data-branch.json)
  → Releasebau
       CI:    seed-data-branch.sh (Datenzweig in den Arbeitsbaum) → build-release.mjs → Prüfungen
       Pages: seed-data-branch.sh → build-release.mjs → overlay-data-branch.mjs → Company-Intelligence-Staging
              → Minify → release-id.mjs → [Manifest SEALED] → Passwortsperre → Smoke → upload-pages-artifact
  → Pages (deploy-pages; neue Build-Version nur bei neuem Commit, siehe pages-release-marker.yml)
  → Live-Bestätigung (company-intelligence-live: Browser-QA gegen die Seite; system-health --site; /status/)
```

Bruchstellen vor diesem ADR: (1) CI und Pages bauten mit verschiedenen Eingaben (behoben: #1773 / DB-16, CI baut mit Datenzweig); (2) kein Artefakt sagte, *welche* Generation live ist; `release-id.json` kennt nur den Code von Quant/Discover; (3) Pages-Übernahme desselben Commits wurde nicht bemerkt (behoben: #1767, #1772).

## Zustandsmaschine

| Zustand | Beleg | Wo |
|---|---|---|
| gebaut (`BUILT`) | `release-manifest.json` im Bauordner, Hash aus den Eingaben | `build-release.mjs`, jeder Releasebau (CI, Pages, Company Intelligence) |
| versiegelt (`SEALED`) | Manifest nach Overlay, Staging, Minify neu geschrieben: Hash der auszuliefernden Dateien | `pages-release.yml`, Schritt „Seal release generation manifest“ |
| hochgeladen | `upload-pages-artifact` grün | `package` |
| ausgeliefert | `deploy-pages` grün, Build-Version = Commit | `deploy` |
| bestätigt | live `/core/release-manifest.json` liest sich, `code.sha` = Soll-Commit | `system-health --site`, `/status/` (Zeile „Ausgeliefert“) |
| gesund | Bestätigt **und** Datenarten OK (Freshness, DQ) | `system-health`, bestehende Alarme |

Ein Zustand ist nur so stark wie sein Beleg: „gesund“ bleibt der bestehende Gesundheitsbericht; das Manifest liefert ihm die Identität der Generation.

## Fehlerszenario-Matrix

| Szenario | Heute erkannt durch | Wirkung des Manifests |
|---|---|---|
| CI baut ohne Datenzweig (Vorfall 10.11.) | DB-16 | RM-3b: Hash weicht ab, abweichende Datenart wird genannt |
| Datenart fehlt in der Auslieferung | Overlay: `MISSING` → Exit 1 (nur Datenzweig-Arten) | `ABSENT` im Manifest, ändert den Hash (RM-6); gilt für alle Datenarten aus `domains.json` |
| Datenreferenz vertauscht (Pfad zeigt auf Inhalt einer anderen Art) | nichts | RM-5: Pfad + Inhalt gehen in den Hash ein |
| Inhalt verändert, Zeitstempel gleich | nichts | RM-4 |
| Datenzweig wechselt zwischen Seed und Overlay | nichts | `dataBranch.sha` des Siegels nennt den ausgelieferten Stand; Abweichung zum BUILT-Manifest ist sichtbar |
| GitHub Pages übernimmt denselben Commit nicht | #1767 (Exit 4, Gate offen), #1772 (Marker) | live `code.sha` ≠ Soll → Stufe „bestätigt“ fehlt |
| Fehlerhafte neue Generation verdrängt gesunde | Smoke, Delivery-Contract, Gate vor `deploy` | unverändert; das Manifest macht den Vergleich Live ↔ Kandidat möglich (`comparePayload`), blockiert aber nichts |
| Company-Intelligence-Gate AUS, Seite hat andere Generation | `expectLive`, Gate | `companyIntelligenceGeneration.deliveredState/approvedGeneration` im Manifest |

## Alternativen

| | A · gezielte Korrekturen | **B · Generationenmanifest** | C · unveränderliche Generationen in R2 |
|---|---|---|---|
| Idee | je Vorfall eine Korrektur (#1767, #1772, #1773 …) | ein Manifest je Auslieferung, CI und Pages prüfen denselben Hash | jede Generation als unveränderliches Objekt in R2, Pages zeigt auf eine Generation, Rückschalten per Zeiger |
| Beantwortet „welche Generation ist live?“ | nein | ja | ja |
| Verdrängungsschutz (schlechte Generation ersetzt gesunde) | nur je Fall | Vergleich möglich, Gate bleibt wie es ist | strukturell (Zeiger wechselt erst nach Bestätigung) |
| Aufwand / Risiko | klein, aber jeder Vorfall neu | klein, additiv, kein Speicherumbau | groß: neuer Speicherpfad, Auslieferung neu, Kosten, Wanderung |
| Beleg im Ist | drei Korrekturen am selben Tag, Ursache jeweils eine andere | die drei Vorfälle hätten sich im Hash/Commit-Vergleich gezeigt | Plan-Neustart: Datenzweig „später R2“ |

Entscheidung für B, belegt durch Test RM (Fixtures: Gleichheit, Gegenproben) und einen Realbau auf dem Stand 7b50e6f (38 Datenarten, 7 `ABSENT` im Repo-Stand, Hash stabil). C bleibt der Folgeweg, wenn der Datenzweig nach R2 zieht; das Manifest ist dann der Zeigerinhalt.

## Grenzen

- Das Manifest **blockiert nichts**. Es benennt; Alarme und Gates bleiben bei ihren Besitzern.
- Der Nutzdatenhash schließt variable Metadaten aus (`volatile.keys`, Zeitstempelfelder aus `domains.json`); je Datei steht der rohe `bytesSha256` daneben. Datenarten ohne JSON gehen mit dem rohen Hash ein.
- Erfasst sind die Vertragsartefakte der Datenarten (`domains.json`, `data-branch.json`), nicht jeder Shard.
- Company Intelligence: `build-release.mjs` läuft vor dem Staging; erst das Siegel sieht die Generation der ausgelieferten Seite.
