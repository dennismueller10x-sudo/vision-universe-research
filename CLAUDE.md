# Vision Universe Research – Arbeitsregeln

Einstieg: [docs/VISION_UNIVERSE_ARCHITECTURE.md](docs/VISION_UNIVERSE_ARCHITECTURE.md). Betrieb: [docs/operations/RUNBOOK.md](docs/operations/RUNBOOK.md). Reels (Studio, Hook-Formel, HeyGen-Stimme, Ablauf): [docs/studio/README.md](docs/studio/README.md). Quant (Abschlussübergabe, Backtests, Security-Master-Generationen, offene Entscheidungen): [docs/quant/QUANT_FINAL_HANDOVER.md](docs/quant/QUANT_FINAL_HANDOVER.md). Supertrader (Abschlussübergabe, 13 Methoden, Kandidaten-Tageslauf, V1 S1–S7, Zertifizierungsvorbereitung, offene PRs): [docs/SUPERTRADER_9_HANDOVER.md](docs/SUPERTRADER_9_HANDOVER.md). Technical (Stand, offene Aufgaben): [docs/technical/TECHNICAL_WORLD_PROGRESS.md](docs/technical/TECHNICAL_WORLD_PROGRESS.md); Projektplan bis zur Produktreife mit Completion-Matrix, Abnahmekriterien und Wiederaufnahmepunkt: [docs/technical/TECHNICAL_COMPLETION_PLAN.md](docs/technical/TECHNICAL_COMPLETION_PLAN.md). Konten und Abos (Supabase, Stripe, ausgeschaltet bis zur Freigabe): [docs/accounts/ACCOUNTS_AND_SUBSCRIPTIONS.md](docs/accounts/ACCOUNTS_AND_SUBSCRIPTIONS.md), persönliche Watchlist: [docs/accounts/WATCHLIST.md](docs/accounts/WATCHLIST.md). Nutzerführung (Willkommensseite, `/mein-dashboard/`, Konto, Free/Pro-Ablauf): [docs/accounts/NUTZERFUEHRUNG.md](docs/accounts/NUTZERFUEHRUNG.md); Produktionsplan bis zum öffentlichen Start: [docs/accounts/PRODUKTIONSPLAN.md](docs/accounts/PRODUKTIONSPLAN.md); was automatisch ausrollt und was eine Owner-Freigabe braucht: [docs/accounts/FREIGABEN.md](docs/accounts/FREIGABEN.md); Preise ändern ohne Deployment (`/konto/admin/tarife/`): [docs/accounts/TARIFVERWALTUNG.md](docs/accounts/TARIFVERWALTUNG.md); Rechtstexte und Umschalten auf öffentliches Pro: [docs/accounts/RECHTLICHE_ABNAHME.md](docs/accounts/RECHTLICHE_ABNAHME.md), Brevo/Newsletter: [docs/accounts/BREVO.md](docs/accounts/BREVO.md), Umsatzsteuer: [docs/accounts/STEUER.md](docs/accounts/STEUER.md). Aktienmagazin und Insights/Reports (Wochenheft mit Prüftor; Tagesartikel unter `/insights/`, Build `products/insights/build.mjs`): [docs/publishing/HANDBUCH.md](docs/publishing/HANDBUCH.md). Kapitalmarktrecht (Analyse-Software ohne Empfehlungen, Plan §11; Wortwahl, App-Pflichtlinks, Anwaltsmappe): [docs/legal/EINORDNUNG.md](docs/legal/EINORDNUNG.md), Wortwahl [docs/legal/WORTWAHL.md](docs/legal/WORTWAHL.md), Pflicht-Hinweise `assets/legal-notices.json`.

Statische Seite (GitHub Pages, `research.visionuniverse.de`), Node 22 ohne Abhängigkeiten, UMD-Engines (`globalThis` + `module.exports`), Python für SEC.
Daten entstehen in GitHub-Actions-Läufen und werden nach `main` committet.

## Vor jeder Änderung

- **Fachmodelle nicht nebenbei ändern.** Quant-Scores, Rankings, Supertrader-Strategien, Regime und Technical-Modelle ändern sich nur in einem eigenen PR mit Vorher/Nachher-Vergleich.
- **Kein generiertes Artefakt von Hand ändern oder „mitbringen“.** Dateien unter `quant/data`, `discover/data`, `supertrader/data` und `social/data` gehören ihrem Erzeuger (`core/registry/domains.json`, Feld `producer`). Ein PR, der sie mitbringt, lässt Datenläufe in Konflikte laufen (`core-ci.yml` warnt). Ausnahme: ein Gate verlangt den Neubau (Discover-Reproduzierbarkeit, Währungsschulden-Register). Dann mit dem Erzeuger neu bauen, nie editieren.
- **Identität nur über `core/identity.js`** (`securityIdForTicker`, `shardKey`, `matchKey`). Keine eigenen `"ref_" + ticker`-Bildungen (ADR-001).
- **Eine Preiswahrheit (ADR-002):** Split-Faktoren aus `quant/engines/return-series.js#splitFactors`, veröffentlichte Schlüsse über `quant/engines/published-close.js`. Keine neue Ableitung daneben.
- **UI-Schutz-Revisionen sind je eine Datei (11.11.2026):** Neue Revisionen stehen als `docs/quality/ui-protection-revisions/<slug>.json` (Felder wie bisher, `id` = Dateiname, **keine Nummer**, kein Abgleich mit `main`; die Kette je Datei läuft über `from`→`to`). `docs/quality/ui-protection-revisions.json` (UIP-R1 bis R179) ist eingefroren, `ui-protection-revisions.test.mjs` prüft das. Die Owner-Freigabe gilt weiter je Revision in der Sitzung, die sie schreibt (`ownerApproval`). Konflikt nur, wenn zwei PRs dieselbe gesperrte Datei ändern: dann `from`/`to` des späteren neu rechnen.

## Vertragstests statt Pfad-Gates

Pfad-Isolation ist durch **Vertragstests** ersetzt (05.11.2026, [docs/PLAN_NEUSTART_2026-11.md](docs/PLAN_NEUSTART_2026-11.md) §3):
`core/registry/product-contracts.json` nennt je Produkt Pfade, CI und Vertragstests sowie die Schnittstellen (Artefakt + Schema), die es liest;
`core/tests/product-contracts.test.mjs` prüft, dass jede Produktänderung die Produkt-CI auslöst und jedes Schnittstellen-Schema stimmt.
Ein Querschnitts-PR ist erlaubt; er muss die CI jedes berührten Produkts grün bekommen. Ändert ein PR ein Schnittstellen-Schema, zieht er Verbraucher und Registry im selben PR nach.

Geltende Vertragstests (alle in Core-CI, laufen auf jedem PR):

| Test | Vertrag |
|---|---|
| `core/tests/product-contracts.test.mjs` (PC) | Produktpfade lösen die Produkt-CI aus; jede Datei, deren Hash ein Produkttest pinnt (`pinnedFiles`), ebenfalls (PC-5); Schnittstellen-Schemata stimmen mit Registry und Verbrauchern |
| `core/tests/workflow-bundles.test.mjs` (WB) | jede Workflow-Datei hat ein Bündel in `core/registry/workflow-bundles.json`; ein Bündel ersetzt seine Quellen nachweisbar |
| `core/tests/universe-follow-chain.test.mjs` (UF) | nur `security-master-eligibility.yml` ändert das Produktuniversum, und jede am Produktumfang geprüfte Datenart zieht im selben Lauf nach |
| `core/tests/data-branch-pilot.test.mjs` (DB) | Datenarten auf dem Datenzweig (`core/registry/data-branch.json`) |
| `core/tests/docs-registry.test.mjs` (DOC) | höchstens 25 lebende Seiten (`core/registry/docs.json`, alle in `docs/README.md` verlinkt); jede andere Seite unter `docs/` liegt in `docs/archiv/` oder ist ein Beleg am Ort (von Code genannt, eingefroren, gepinnt) |
| `core/tests/module-manifest.test.mjs` (MM) | Modul-Steckbrief `products/<id>/module.json` für jedes Produkt (Web bleibt unter `/<id>/`) (jede oberste Seite ist Produkt oder begründete Seite): Route, Menü, Zugang free/pro/intern, Status, Datenarten (Erzeuger, Zeitplan, Frische nur in `domains.json`); Menü (`assets/site-navigation.js`, `groups`), `core/registry/modules.json`, `/status/` und `system-health` entstehen daraus (`node scripts/core/build-modules.mjs`) |
| `core/tests/schedule-registry.test.mjs` (SZ) | ein Zeitgeber: jeder Zeitplan steht in `core/registry/schedule.json`; `timer: waker`-Einträge haben keinen Cron im Workflow, aber Eingang `zeitplan`, Marke im `run-name` und die Zeitplan-Weiche |

Was von den Pfad-Gates bleibt:

| Gate | Stand |
|---|---|
| Supertrader Gate A (`scripts/supertrader/guard-protected-paths.mjs`) | nur noch Bericht, blockiert nicht |
| Company Intelligence `validate` (Pfadverbot) | entfernt; Currency-Befunde-Prüfung bleibt |
| Discover „verändert keine bestehende Engine“ | entfernt |
| Discover Frontend Budget (`scripts/discover/browser-qa.mjs`) | bleibt: `discover/(app|home|detail|themes).(js|css)` ≤ 180.000 Byte decoded, ≤ 12 Requests |

Veraltete Daten lösen einen Alarm aus und blockieren keinen Code-PR.

## Freigaben und Merge (Owner-Entscheidung 04.11.2026)

- **Ein PR pro Ergebnis**, nicht pro Zwischenschritt. Keine neuen „Sitzungsübergabe x.0.0“-, „Nachtrag“- oder Versions-Dokumente; der Stand steht im Plan und im jeweiligen Produktdokument.
- **Grüne CI genügt.** Code, Doku, interne Daten, Design und Umbauten werden ohne Owner-Freigabe gemergt.
- **Merge bei Grün (11.11.2026):** Jede Sitzung merged ihren PR selbst (Squash), sobald der Sammel-Check `ci-gate` grün ist (`scripts/ci/wait-gate.sh <PR>` wartet darauf; `.github/workflows/ci-gate.yml` läuft auf jedem PR und fasst alle ausgelösten Prüfungen zusammen). **Kein Auto-Merge und keine Pflichtprüfung im Ruleset:** die Datenläufe pushen mit `GITHUB_TOKEN` direkt nach `main` und `data/*`; dieser Akteur lässt sich nicht als Bypass eintragen, eine Pflichtprüfung würde sie blockieren (RUNBOOK §14). Rote Jobs mit Infrastruktur-Signatur (apt-DNS, Netz) startet `ci-retry.yml` einmal neu.
- **Owner-Freigabe nur für vier Dinge:** Geld (Zahlungen, Checkout öffentlich, Käufe), Recht (Rechtstexte), öffentliche Aussagen über Rendite oder Performance, endgültiges Löschen von Daten.
- **Entscheidungen, die bisher „Owner-Lesart“ hießen** (Regel-Lesarten, Varianten, Schwellen), trifft Claude nach der dokumentierten Empfehlung, schreibt sie in einen Satz ins Produktdokument und macht weiter.
- **Backtests sind Forschung:** historische Läufe dürfen jetzt laufen und intern gezeigt werden, beschriftet „Forschung, nicht zertifiziert“. Zertifizierung ist ein späteres Etikett, keine Voraussetzung.

## Tests

```bash
node --test "core/tests/*.test.mjs" "products/*/tests/*.test.mjs"   # Core und Produkt-Tests unter products/
node --test "quant/tests/*.test.mjs"
node --test "discover/tests/*.test.mjs" "scripts/supertrader/tests/*.test.mjs" "screener/tests/*.test.mjs"
node --test "technical/tests/*.test.mjs"
python3 -m unittest discover -s scripts/quant/tests -p 'test_*.py'
node scripts/quality/check-test-isolation.mjs  # ein Test darf keine Produktionsdaten schreiben
node --test workers/vu-account/tests/unit.test.mjs "konto/tests/*.test.mjs" "mein-dashboard/tests/*.test.mjs" "scripts/account/tests/*.test.mjs"   # Konten/Abos; mit PG_TEST_URL zusätzlich:
node scripts/account/sql-tests.mjs && node --test workers/vu-account/tests/flows.test.mjs
```

Skripte, die von Tests aufgerufen werden, bekommen `--out`, statt in ein committetes Artefakt zu schreiben.

## Workflows

Regeln für Workflows, die committen (ADR-005):
- Checkout mit `ref: ${{ github.ref }}`.
- Push nur über `scripts/ci/push-with-retry.sh`.
- Concurrency-Gruppe mit `-${{ github.ref_name }}`.
- Workflow-Eingaben nur über `env:` in `run`-Blöcke, nie `${{ inputs.* }}` im Shell-Text.
- Prüf-Workflows bekommen `permissions: contents: read`.
- Zeitpläne nur über `core/registry/schedule.json` (ein Zeitgeber: Cloudflare-Wecker, RUNBOOK §10). Kein neuer `schedule:`-Cron im Workflow; Vertragstest SZ.
- Diff-Gates in flachen Checkouts dürfen bei einem Git-Fehler nicht still „0 Dateien“ melden: `set -euo pipefail` und eine erreichbare Basis.

## Diagnose

```bash
node scripts/core/system-health.mjs           # Zustand je Datenart
node scripts/core/diagnose.mjs NVDA           # Warum ist diese Aktie falsch oder veraltet?
node scripts/core/data-quality.mjs            # DQ-Regeln über die Artefakte
```

Im Browser: `/status/` und `/status/#/NVDA`.
