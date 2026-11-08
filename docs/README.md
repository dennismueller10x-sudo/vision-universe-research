# Dokumentation – Landkarte

Hier beginnt die Orientierung. Je Produkt gibt es einen Einstieg; ergänzende Fachbelege werden dort verlinkt. Arbeitsregeln: [CLAUDE.md](../CLAUDE.md), aktuelle Steuerung: [Neustart-Plan](PLAN_NEUSTART_2026-11.md). Bei Widersprüchen gelten die Arbeitsregeln und die datierten Owner-Entscheidungen im Plan. Historische Berichte sind keine aktuelle Arbeitsanweisung.

[Inventar aller Bestandsdokumente](archiv/DOKU_INVENTAR.md) mit Änderungsdatum, eingehenden Links und begründeter Einordnung. Historische Stände bleiben unter `archiv/<jahr>/` erhalten. Fachseiten, Quellenverträge und Forschung bleiben referenzierbar; ihre historischen Zahlen werden nicht neu bewertet.

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
