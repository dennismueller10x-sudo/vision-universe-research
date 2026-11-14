# Gemeinsame Navigation

`assets/site-navigation.js` enthält die Menüeinträge und den gekapselten Header.
Neue Hauptmenüs nur in der Liste `items` ergänzen; alle Seiten laden dieselbe Datei.
`assets/site-navigation.css` reserviert den Platz für den Header und berücksichtigt
die Vollbildansichten von ETF und Magazin.

Neue HTML-Seiten mit `node scripts/sync-navigation.mjs` integrieren. Der Workflow
`deploy.yml (Teil navigation, vormals sync-navigation.yml)` erledigt dies auch bei neuen HTML-Dateien auf main automatisch.
Keine zusätzliche Kopie des Hauptheaders in neuen Seiten anlegen.
Der Morning-Generator bindet die Komponente direkt bei jeder neuen Ausgabe ein.
Bereichsinterne Navigation und Datenaktualisierung bleiben unabhängig davon erhalten.

## Rahmen: Dock, Reiter, „Dein Universe“ (Owner-Freigabe 14.11.2026, App-Konzept 2)

Der Rahmen ist auf jeder Seite derselbe und steht vollständig in `assets/site-navigation.js` und `assets/site-navigation.css`.

- **Dock** (`#vu-dock`, unten): Home `/willkommen/` · Discover `/discover/#/` · runder Universe-Knopf · News `/insights/` · Ich `/mein-dashboard/` (Liste `DOCK`).
  Aktiv ist der Platz, in dessen Bereich die Seite liegt (`dockActive`); in den übrigen Produkten ist kein Platz aktiv.
  Das Dock bleibt Opt-in: Es erscheint, wenn die Seite `window.VUNavigation.dock({...})` ruft, und nie mit dem Attribut `no-dock`.
  Es steht auf Produktseiten und auf Insights (`dockPage`: Ziel des Platzes „News“, ohne Reiterzeile der Shell; die Zeile im Seitenkopf schreibt `products/insights/build.mjs`).
- **Reiter** (`nav.tabs` im Kopf, unter der Kopfzeile): die Bereiche des Produkts.
  Zuerst die früheren Leistenplätze (`PRODUCTS[].items`), danach die übrigen Einträge der Menügruppe des Produkts (`navigation.entries` im Steckbrief, dieselbe Liste wie „In <Welt>“ im Menü); gleiches Ziel nur einmal (`tabEntries`).
  Ein neuer Reiter entsteht also im Steckbrief `products/<id>/module.json` (danach `node scripts/core/build-modules.mjs`), nicht in `site-navigation.js`.
- **Aktiver Reiter** (`tabActive`): die Logik der früheren Leiste (`dock({active})` für genau diese Adresse, sonst `PRODUCTS[].active`). Markiert sie nur den Produktplatz oder nichts, ist der Reiter aktiv, den das Menü als aktuelle Seite markiert.
  `dock({hrefs, badges})` und das abbrechbare Ereignis `vu-dock-navigate {product,id,href}` gelten für die Reiter wie vorher für die Leistenplätze.
- **Platz im Dokument**: Mit Reitern ist `--vu-navigation-height` um 48 px höher (`html[data-vu-tabs]`). Klebendes und Sprungziele der Produkte rechnen mit `--vu-navigation-height`, nie mit festen 56/64 px.
  `--vu-dock-gap` enthält den Teil des Universe-Knopfs, der über die Leiste ragt.
- **`late`** in `PRODUCTS`: Seiten, die das Dock nicht oder erst nach dem Laden anfordern (ETF-Seiten, Europa-Screener, Konto). Überall sonst steht die Reiterzeile vom ersten Zeichnen an, damit der Inhalt nicht springt. `core/tests/shell-navigation.test.mjs` hält das am Bestand der Seiten fest.
- **Menü „Dein Universe“**: bis 760 px ein Sheet von unten (Griff, höchstens 90 % hoch, Inhalt rollt darin), darüber die Seitenleiste rechts. Inhalt unverändert: Suche, Produkte, „In <Welt>“, Mein Bereich, Weitere Produkte, Darstellung und Währung, Rechtliches & Infos.

Prüfungen: `core/tests/shell-navigation.test.mjs` (Vertrag), `scripts/quality/shell-browser-qa.mjs` (Browser, alle Produkte).
