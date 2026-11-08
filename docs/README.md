# Dokumentation – Landkarte

Hier beginnt die Orientierung. Je Produkt gibt es einen Einstieg; ergänzende Fachbelege werden dort verlinkt. Arbeitsregeln: [CLAUDE.md](../CLAUDE.md), aktuelle Steuerung: [Neustart-Plan](PLAN_NEUSTART_2026-11.md). Bei Widersprüchen gelten die Arbeitsregeln und die datierten Owner-Entscheidungen im Plan. Historische Berichte sind keine aktuelle Arbeitsanweisung.

Lebend sind nur die Seiten unten (Register: [`core/registry/docs.json`](../core/registry/docs.json), Vertragstest `core/tests/docs-registry.test.mjs`). Alles andere liegt im [Archiv](archiv/) unter dem ursprünglichen Pfad (`docs/archiv/<pfad>`) oder ist ein Beleg am Ort: Code, Test oder Register nennen ihn, er ist eingefroren (`docs/quant-recovery/` u. a.) oder per SHA-256 gepinnt. Das [Inventar vom 06.11.2026](archiv/DOKU_INVENTAR.md) nennt die Ausgangslage. Fachseiten, Quellenverträge und Forschung bleiben referenzierbar; ihre historischen Zahlen werden nicht neu bewertet.

Prüfung: `node scripts/quality/check-doc-links.mjs` oder `node --test core/tests/doc-links.test.mjs`, jeweils vom Repo-Root. Geprüft werden relative Datei-/Verzeichnisziele in versionierten Markdown-Dateien, einschließlich Referenzlinks, Bildern und eingebetteten HTML-Links. Externe URLs und Fragmentinhalte sind nicht Teil dieser Dateiprüfung.

Unveränderliche Quell-Snapshots behalten ihre Originalpfade im Text. Der Prüfer löst sie über das vorhandene Provenienzmanifest auf die erhaltenen Archivdateien auf, sofern alle SHA-256-Prüfsummen stimmen. Das übernimmt keine fachliche Freigabe.

**Quant:** [QUANT_FINAL_HANDOVER.md](quant/QUANT_FINAL_HANDOVER.md). Produktstand, Backtests, Portfolio-Standard und offene Entscheidungen.

**Supertrader:** [SUPERTRADER_9_HANDOVER.md](SUPERTRADER_9_HANDOVER.md). Methoden, Tagesbetrieb und Nachweise; ältere Sitzungsstände sind im Archiv.

**Technical:** [TECHNICAL_WORLD_PROGRESS.md](technical/TECHNICAL_WORLD_PROGRESS.md). Fortschritt und offene Aufgaben; der gesetzte Completion-Plan bleibt ein verlinkter Fachplan.

**Discover:** [VU_DISCOVER_ARCHITECTURE.md](VU_DISCOVER_ARCHITECTURE.md). Produktarchitektur, Datenquellen und weiterführende Fachbelege zur Entdeckungsschicht.

**Fundamental:** [FUNDAMENTAL.md](FUNDAMENTAL.md). Ansichten, Kennzahlen, SEC-Daten und Datenabdeckung.

**Konten:** [ACCOUNTS_AND_SUBSCRIPTIONS.md](accounts/ACCOUNTS_AND_SUBSCRIPTIONS.md). Architektur und weiterführende Einrichtung, Freigaben, Preise, Nutzerführung und Betrieb.

**Recht:** [EINORDNUNG.md](legal/EINORDNUNG.md). Verbindliche Einordnung mit bestehenden Links auf Wortwahl, Befunde und Anwaltsmappe. Die geschützten Rechtstexte bleiben unverändert.

**Studio:** [README.md](studio/README.md). Reel-Produktion, Playbook, Stimme und Produktionsablauf.

**Infrastruktur:** [VISION_UNIVERSE_ARCHITECTURE.md](VISION_UNIVERSE_ARCHITECTURE.md). Architektur und Querschnittsthemen; das gesetzte Runbook ist dort als Betriebsreferenz verlinkt.

## Lebende Seiten

| Bereich | Seite |
|---|---|
| Steuerung | [Neustart-Plan](PLAN_NEUSTART_2026-11.md) · [Codex-Strang E](neustart/E-codex.md) |
| Architektur und Betrieb | [VISION_UNIVERSE_ARCHITECTURE.md](VISION_UNIVERSE_ARCHITECTURE.md) · [Runbook](operations/RUNBOOK.md) · Entscheidungen: `architecture/ADR-*.md` |
| Discover | [VU_DISCOVER_ARCHITECTURE.md](VU_DISCOVER_ARCHITECTURE.md) |
| Quant | [QUANT_FINAL_HANDOVER.md](quant/QUANT_FINAL_HANDOVER.md) |
| Supertrader | [SUPERTRADER_9_HANDOVER.md](SUPERTRADER_9_HANDOVER.md) |
| Technical | [Stand](technical/TECHNICAL_WORLD_PROGRESS.md) · [Completion-Plan](technical/TECHNICAL_COMPLETION_PLAN.md) |
| Fundamental | [FUNDAMENTAL.md](FUNDAMENTAL.md) |
| Konten und Abos | [Übersicht](accounts/ACCOUNTS_AND_SUBSCRIPTIONS.md) · [Watchlist](accounts/WATCHLIST.md) · [Nutzerführung](accounts/NUTZERFUEHRUNG.md) · [Produktionsplan](accounts/PRODUKTIONSPLAN.md) · [Freigaben](accounts/FREIGABEN.md) · [Tarifverwaltung](accounts/TARIFVERWALTUNG.md) · [Rechtliche Abnahme](accounts/RECHTLICHE_ABNAHME.md) · [Brevo](accounts/BREVO.md) · [Steuer](accounts/STEUER.md) |
| Recht | [Einordnung](legal/EINORDNUNG.md) · [Wortwahl](legal/WORTWAHL.md) |
| Studio | [README.md](studio/README.md) (Arbeitsunterlagen der Skill `reel-studio` daneben) |

Produkte, Routen, Zugang und Datenfrische stehen nicht in der Doku, sondern in den Steckbriefen `products/<id>/module.json` (Index `core/registry/modules.json`, Statusseite `/status/`).
