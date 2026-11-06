# Dokumentation – Landkarte

Hier beginnt die Orientierung. Je Produkt gibt es einen Einstieg; ergänzende Fachbelege werden dort verlinkt. Arbeitsregeln: [CLAUDE.md](../CLAUDE.md), aktuelle Steuerung: [Neustart-Plan](PLAN_NEUSTART_2026-11.md). Bei Widersprüchen gelten die Arbeitsregeln und die datierten Owner-Entscheidungen im Plan. Historische Berichte sind keine aktuelle Arbeitsanweisung.

[Inventar aller Bestandsdokumente](DOKU_INVENTAR.md) mit Änderungsdatum, eingehenden Links und begründeter Einordnung. Historische Stände bleiben unter `archiv/<jahr>/` erhalten. Fachseiten, Quellenverträge und Forschung bleiben referenzierbar; ihre historischen Zahlen werden nicht neu bewertet.

Prüfung: `node scripts/quality/check-doc-links.mjs` oder `node --test core/tests/doc-links.test.mjs`, jeweils vom Repo-Root. Geprüft werden relative Datei-/Verzeichnisziele in versionierten Markdown-Dateien, einschließlich Referenzlinks, Bildern und eingebetteten HTML-Links. Externe URLs und Fragmentinhalte sind nicht Teil dieser Dateiprüfung.
