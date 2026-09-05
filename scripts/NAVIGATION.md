# Gemeinsame Navigation

`assets/site-navigation.js` enthält die Menüeinträge und den gekapselten Header.
Neue Hauptmenüs nur in der Liste `items` ergänzen; alle Seiten laden dieselbe Datei.
`assets/site-navigation.css` reserviert den Platz für den Header und berücksichtigt
die Vollbildansichten von ETF und Magazin.

Neue HTML-Seiten mit `node scripts/sync-navigation.mjs` integrieren. Der Workflow
`sync-navigation.yml` erledigt dies auch bei neuen HTML-Dateien auf main automatisch.
Keine zusätzliche Kopie des Hauptheaders in neuen Seiten anlegen.
Der Morning-Generator bindet die Komponente direkt bei jeder neuen Ausgabe ein.
Bereichsinterne Navigation und Datenaktualisierung bleiben unabhängig davon erhalten.
