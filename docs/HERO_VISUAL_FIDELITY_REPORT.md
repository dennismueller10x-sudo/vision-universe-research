# Vision Universe — Hero Visual Fidelity Pass

Stand: 8. Oktober 2026. Gezielte visuelle Korrektur der sechs Produktstartseiten nach der Premium-Migration. Verbindliche Zielrichtung: das vom Auftraggeber bereitgestellte Konzeptboard. Die gemeinsame Shell, Navigation, Routen und sämtliche Produktberechnungen bleiben unverändert.

## Ausgangsbasis und Schutzbereiche

Neue eigene Feature-Branches ab `707951d0d8c32d650ceed9e4db2d1c01e353961e`. Bereits integrierte Shell-/Designmigration übernommen. Parallel laufende Arbeiten und aktuelle Main-Dateien erneut geprüft; keine fremden Branches überschrieben und kein Cherry-Picking fremder Arbeiten. Am Main-Stand `e2e38f4072be` waren alle 17 geprüften Produkt-, Test-, Sprite- und Shell-Dateien noch bytegleich zur Ausgangsbasis. Spätere Datenupdates bleiben erhalten.

Der kombinierte Browserstand ist `844d4cd3a` (`final2-site`). Er vereint ausschließlich die eigenen, getrennt gelieferten Änderungen. 25 geänderte Pfade: gemeinsame CSS-Quelle/Generator, Hintergrundassets, sechs isolierte Produktscopes einschließlich zweier Quant-Darstellungstests und drei additive Workflow-Pfadtrigger. Keine Provider-, Daten-, Filter-, Ranking-, Backtest-, ETF-, Holdings- oder Routingänderung.

## Wiederverwendbares Hero-Raster

`assets/product-hero.css` definiert die opt-in-Komposition: Originalicon, Produktname, kompakte Nutzenheadline, Kurzbeschreibung, bestehende Hauptaktion und integriertes Leitmotiv rechts. Mobil: Icon 104×104 px, bei 390 px auf allen sechs Seiten x16/y88; Produktname 32 px, Nutzenheadline 24 px/1,16 und Beschreibung 14 px/1,5. Desktop: Icon 120 px, Produktname 40 px und responsive Nutzenheadline bis 40 px. Die Hintergründe sind dekorativ, kantenweich maskiert und nehmen keine Klicks entgegen. Light reduziert die Bildstärke zugunsten der Lesbarkeit.

Die CSS-Quelle wird mit `scripts/design/sync-product-hero.mjs` in bereits vorhandene Produktstyles übernommen; `--check` bestätigt ihre Gleichheit. Kein nachträglicher Stylesheet-Download und keine neue UI-Bibliothek. Dieser Ansatz behebt die im unabhängigen Review gemessenen zusätzlichen Hero-Verschiebungen beim verzögerten Laden. Mobile echte Suchfelder bleiben 16 px groß, um Safari-Fokuszoom zu vermeiden; kompakte Placeholder und mindestens 44 px hohe Bedienelemente bleiben erhalten.

## Original-Icons und Leitmotive

`assets/product-icons.svg` ist bytegleich zur Ausgangsbasis. Discover-Radar, Quant-Chip, Screener-Filter, Vorsorge-Schirm und SuperTrader-Zielmarke sind die vorhandenen Originalgeometrien. Hedgefonds nutzt die bereits in der abgeschlossenen Premium-Migration integrierte Investorengruppen-Ergänzung. Keine neuen Produkticons, Lucide-Ersatzsymbole oder Emojis.

| Produkt | Visuelle Korrektur | Erhaltene Funktion und Aussage |
|---|---|---|
| Discover | Großes Radaricon, leuchtender Globus in der Hero-Fläche; frühere zusätzliche Augenbildkarte entfällt | „Sieh den Markt mit anderen Augen.“, Suche, Themen-/Markt-/Trend-Einstiege |
| Quant | Großes Chipicon und prominente bestehende `QX.globe()`-Netzwerkkugel | Titel, vollständiger fachlicher Claim, Aktiensuche, Nutzen-Einstiege und alle Engines |
| Screener | Originalfilter und futuristischer Glasfilter; kompakter Universumsbereich | „Filter hinzufügen“ früh erreichbar, Kriterien-Suche, alle Filter und Universumsdaten |
| Vorsorge | Schirm und Pflanze in transparenter Kugel | „Plane deine Zukunft. Verstehe deine ETFs.“, ETF-/Plan-/Portfolio-Einstiege und Suche |
| SuperTrader | Zielmarke und dezentes aufsteigendes Kerzenmotiv | Methoden-/Signalaktionen, unveränderte Evidenz-, Quellen- und Risikohinweise |
| Hedgefonds | Investorengruppe und institutionelle Säulenarchitektur; kompakter Zweizeiler | Suche nach Investoren/Fonds/Aktien, 13F-Datenstand; kompletter bisheriger Researchtext und sämtliche Links im direkt folgenden Bereich |

Vier neue Hintergrundkompositionen wurden für diesen Pass erstellt und jeweils einmal als 640-px-WebP optimiert: Discover 38.150 B, Screener 22.250 B, Vorsorge 42.348 B, Hedgefonds 45.136 B. SuperTrader verwendet ein kleines dekoratives SVG ohne Zahlen, Marktreihe oder Renditebehauptung. Quant benötigt kein neues Bild. Hintergrund-URLs werden nur durch den jeweils passenden Home-Hero aktiviert; kalte Quant-Detailseiten laden keine Hero-Bilder. Herkunft und Regeneration stehen in `assets/hero-visuals/README.md`.

## Vorher-/Nachher und Konzeptvergleich

Echte Browseraufnahmen: 84 vorher (60 Chromium, 24 WebKit) und 120 final (60 je Engine). Finale Matrix: alle sechs Produkte × 390/430/768/1024/1440 px × Light/Dark × Chromium/WebKit. Keine finalen horizontalen Überläufe oder JavaScript-Fehler.

- Interaktive lokale Galerie: `/workspace/scratch/hero-fidelity/gallery.html` — sechs Bildpaare, Engine-/Theme-/Breitenwahl und Originalbilder.
- Gemeinsame echte Browseraufnahme der sechs iPhone-Bildpaare: `/workspace/scratch/hero-fidelity/gallery-webkit390dark-before-after.png`.
- Kritischer visueller Referenzvergleich: `/workspace/scratch/hero-fidelity/visual-comparison.md`.
- Archiv: `/workspace/scratch/hero-fidelity-browser-evidence.zip` — entpacken und `gallery.html` öffnen.

Die Komposition trifft jetzt das große linke HUD, das individuelle rechte Leitmotiv und die dreistufige Textstruktur. Zusätzliche fachliche Erläuterungen, Datenstände und Evidenzhinweise bleiben ausführlicher als im Board. Light-Motive wirken zurückhaltender; insbesondere die Vorsorge-Kugel ist weniger plastisch als in Dark. Keine unbelegten Angaben zu prozentualer oder pixelgenauer Konzepttreue.

WebKit nutzt bei 390/430 px das iPhone-14-Profil. Keine physische iPhone-Hardware, keine emulierte Safari-Browserleiste; Safe-Area-Inset in Playwright 0. Vorher-WebKit liegt nur für die beiden iPhone-Breiten vor; die Galerie kennzeichnet fehlende Desktop-Vorherbilder ausdrücklich.

## QA und unabhängiger Red Team Review

- Gemeinsame Discover-/Vorsorge-/Screener-Prüfung: 504 Tests, 499 bestanden, fünf übersprungen, null Fehler. SuperTrader: 223/223 bestanden.
- Quant nach Korrektur: 2.529 Tests, 2.524 bestanden, fünf Fehler — exakt dieselben fünf Fehler wie im frisch geprüften isolierten Main-Stand. Keine neue Regression. Eine separat erneut geprüfte Teilmenge von 31 Klassen-/Storage-/Textvertragsprüfungen besteht vollständig.
- Ein tatsächlicher neuer Storage-Inventar-Testfehler wurde durch vollständige DOM-Klassenattribute behoben. Die Storageprüfung blieb unverändert. Zwei Darstellungstests prüfen bestehende und neue Klassen; Claim-, Such-, Reihenfolge- und Headline-Verträge bleiben erhalten.
- Unabhängige mobile Funktionsmatrix: 48 Fälle, 24 Icon-/Button-Geometrien und 18 verzögerte-CSS-Proben bestanden. Vorzeitige Screener-Debounce-Beobachtung mit tatsächlicher Ergebnis-Wartebedingung nachgeprüft. Aktionen erreichbar, Dock frei, keine Hero-Verschiebung durch neue CSS-Anforderung.
- Red Team: 24 visuelle Stichproben, zehn Such-/Filter-Smokes und 20 Inputprüfungen; keine offenen P1/P2-Befunde. Originalsprite, Shell und Logik unverändert. Mobile Safari-Inputgröße korrigiert; Hedgefonds-Headline in beiden Engines zweizeilig.

## Ressourcen und bekannte Baselines

Der finale Quant-PR-Browserlauf `37813374971` besteht mit den bestehenden Grenzwerten: 94 Prüfungen, 82 Accessibility-Seiten ohne erkannte Verletzung und acht bestandene Ressourcenbudgets. Stock: 5.570.249 decodierte Bytes/42 Requests gegenüber 5.700.000/45; Home: 1.712.860/22 gegenüber 1.820.000/45. Keine Gates oder Grenzwerte abgeschwächt.

Der lokale vollständige Quant-Lauf ist ausdrücklich **kein Gesamt-PASS**: 94 funktionale Checks grün, 82 axe-Seiten ohne erkannte Verletzung, jedoch zwei Console-Befunde durch bestehende Google-Fonts-HTTP503/CORS und ein rotes Desktop-Stock-Budget. Eine unabhängige identische Kaltprobe reproduziert das Budget bereits vor der Änderung: 5.725.476 B vorher, 5.732.239 B nachher, jeweils 44 Requests. Delta 6.763 B = bestehender CSS-Download +6.634 B und Bundle +129 B. Die im 1.000-px-hohen Viewport zusätzlich ladenden bestehenden Chartbild-Ressourcen erklären den Unterschied zur früheren 900-px-Kaltprobe; der Fontfehler ist davon getrennt. Rohbefunde bleiben erhalten. Axe meldet außerdem 72 unvollständig automatisierbar geprüfte Einträge; null erkannte Verletzungen ist keine manuelle Accessibility-Zertifizierung.

Die fünf Quant-Baselinefehler betreffen JPM-Rekonstruktion/Golden-Five, eine AL-2-Merkliste-Assertion und zwei Total-Return-Reproduzierbarkeitsprüfungen. Quant-, SEC- und eingebettete SuperTrader-CI bestätigen dieselben fünf Namen. Nachweise: `candidate-quant-final-comparison.json`, `quant-baseline-comparison.md`, `ci-classification.json`.

Bestehender Quant-Footer-CLS 0,223934 bleibt identisch zur Baseline; kein neuer Hero-Shift. Ein temporärer ENOSPC-Lauf und ein Rendererabbruch sind als ungültige Ausführungen gesichert, anschließend mit ausreichend Workspace-TMPDIR neu geprüft. CLI-GitHub und externe Fonts lieferten zeitweise HTTP503; GitHub-Connector blieb nutzbar. Vercel meldet weiterhin Anbieter-Quota, kein Vercel-Deployment behauptet.

## Integration und Deployment

Alle sieben UI-PRs regulär gemergt. Die Foundation wurde mit erhaltener Abstammung integriert; die sechs Consumer danach auf main umgestellt und mit exakt zwei beziehungsweise vier Produktdateien gemergt. Keine Protection umgangen, keine Gate-Abschwächung. Alle 25 eigenen Dateien sowie die drei geschützten Sprite-/Shell-Dateien sind auf dem integrierten Main-SHA `5ee2ae4acd14c4a3bac29da5a81af4dd7c53bc97` exakt gleich zum geprüften Stand. Parallel integrierte #530/#538 und Datenupdates bleiben erhalten.

| Bereich | PR | Status | Merge-SHA |
|---|---|---|---|
| Hero-Raster, Assets, additive Trigger | [#531](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/531) | Gemergt | `d06ff1c8de79` |
| Discover | [#532](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/532) | Gemergt | `59982cc6f1f0` |
| Quant | [#533](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/533) | Gemergt | `5ee2ae4acd14` |
| Screener | [#534](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/534) | Gemergt | `3ae941c9f79a` |
| Vorsorge | [#535](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/535) | Gemergt | `951ef1a5fc41` |
| SuperTrader | [#536](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/536) | Gemergt | `8fe1173fc566` |
| Hedgefonds | [#537](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/537) | Gemergt | `5536f662794a` |

Finale PR-CI: 34 tatsächlich ausgelöste Läufe abgeschlossen, 31 grün und drei ausschließlich mit den fünf bewiesenen Quant-Baselinefehlern. Alle sieben Shell-Läufe bestehen 15/15 Tests sowie jeweils 270 Chromium- und 162 WebKit-Prüfungen ohne Befund: insgesamt 3.024 Browserprüfungen. Nachweise: `ci-classification.md/.json`, `final-shell-jobs-summary.json`, `integrated-main-ui-verification.json` und `merge-manifest.json` im Browser-Archiv.

GitHub-Pages-Auslieferung und zusätzlicher Main-Shell-Nachlauf sind derzeit noch aktiv; deren endgültiger Status wird vor Abschluss dieses Berichts verifiziert. Vercel-Preview weiterhin Anbieter-Quota. Eine lokale Aufnahme beweist keinen Live-Status.

## Verbleibende tatsächliche Punkte

- Fünf unveränderte Quant-Baselinefehler; keine Daten-/Enginekorrektur in diesem visuellen Auftrag.
- Lokales vollständiges Browser-Gate mit bestehenden Font-HTTP503/CORS und bereits vorher überschrittenem Desktop-Stock-Budget bleibt ausdrücklich rot; CI-Browserbudget besteht separat.
- Bestehender Quant-Footer-CLS 0,223934 bleibt unverändert.
- Vercel-Preview durch Anbieter-Quota blockiert.
- Physisches iPhone/Safari wurde nicht geprüft; WebKit-iPhone-Profil und echte Browseraufnahmen vorhanden.
- Keine bekannte neue kritische Hero-/Funktionsregression; alle unabhängigen P1/P2-Befunde behoben.
