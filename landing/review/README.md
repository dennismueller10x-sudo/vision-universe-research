# Gegenüberstellung und Abnahme

Referenz: tatsächlicher Header/Hero aus `index.html` des Research-Commits `beaaabb66a1e8d7d822c0fd9363e7499f06a6d60`. Die live erreichbare `assets/home/home.css` hatte denselben SHA-256 wie dieser Commit. Der öffentliche Research-Passwortdialog ist nicht die Designreferenz und wird nicht übernommen.

[Desktop nebeneinander](comparison-desktop.png) · [iPhone nebeneinander](comparison-iphone.png)

Links/rechts jeweils gleicher Viewport und lokale Original-Inter-Datei; reduzierte Bewegung für einen stabilen Vergleich. Abbildungen zeigen den ersten Viewport, keine künstlich verkürzte gesamte Research-Seite. [Ganze Landingpage Desktop](desktop.png) · [Ganze Landingpage iPhone](iphone.png).

## Ausdrücklich verglichen

Die automatisierte [Computed-Style-Gegenüberstellung](design-comparison.json) prüft 17 Gruppen in beiden Viewports: Header, Logo und dessen Filter/Crop, Seitenbreite, Hero-Abstände/Farben, Grid/Spalten/Gap, Headline inklusive Schriftfamilie/-größe/-gewicht/Zeilenhöhe/Ausrichtung, grünen Akzent/Glow, Fließtext, Badge, CTA-Button inklusive Schatten, Hintergrund-Glow und Raster/Maskierung, Gerätebühne, Smartphone, Desktop-Browser und HUD-Kacheln. Alle geprüften Werte stimmen überein. Die Gerätebühne bleibt original 620 px auf Desktop bzw. 520 px mobil; Smartphone-Größe, Rotation und mobile Skalierung bleiben erhalten.

## Notwendige Abweichungen

- Kürzere Ankündigungstexte, „App bald verfügbar“, Newsletter-Sprungmarken; Produktnavigation, zweiter Hero-Button, Kennzahlen-/Feature-/Social-/FAQ-Sektionen entfallen. Dadurch steht das Smartphone mobil früher im Seitenverlauf.
- Auf Wunsch enthalten Smartphone und Desktop-Browser jetzt ausschließlich vorhandene Modul-Icons und Namen unter „Alles in einer App.“. NVIDIA, Kurse, Charts, Kennzahlen und die feste Geschäftsjahreszahl entfallen. Die Original-Gerätehüllen, HUD-Icons, Orbit-Animation und äußeren Abstände bleiben erhalten; die Modulübersicht ersetzt nur deren Inhalt. Kennzeichnung: „Modulvorschau · App bald verfügbar.“. Die unveröffentlichte Research-Referenz zeigt weiterhin ehrlich den Originalzustand. Auch bei erneutem Research-Sync bleibt diese Ersetzung erhalten.
- Newsletter verwendet die originale dunkle Karte, Verlauf, HUD-Icon, Typografie, pillenförmiges Feld und Buttons. Abstände der Newsletter-Karte und des Footers sind kompakter, der Footer enthält nur Copyright/Rechtliches/Kontakt. Das hält die gesamte Seite unter den Größenrichtwerten.
- Einwilligung, ehrlicher gesperrter Zustand, Honeypot und zugängliche Meldungen ergänzen das vorhandene Newsletter-Design. Kein Live-Brevo-Formular/keine Speicherung behauptet.
- Skip-Link, größerer transparenter Logo-Touchbereich, Formularfokus und umbrechbare CTA-Texte/Überschriften ermöglichen Tastaturbedienung und Textvergrößerung. Keine globale Scroll-Sperre oder durch Overflow verdeckte Seitenbreite.
- Nur die Font-URL im kopierten Research-CSS wird relativ; andere Ergänzungen stehen separat in `styles.css`. Keine Research-Datei verändert. PWA, Account, Passwortdialog und weitere Produkt-Skripte werden nicht kopiert.

## Ergebnisse

Siehe [metrics.json](metrics.json): 1440 × 900 **1.191 px**, 390 × 844 **1.684 px**; kein horizontaler Überlauf. Zusätzlich 320 px und tatsächliche 200-%-Textvergrößerung geprüft; dann darf die Seite länger werden. Axe: 0 Verstöße pro Viewport. Chromium mit iPhone-Viewport, kein physisches Safari/iPhone-Gerät. Formularvalidierung und POST-Zustände gegen abgefangenen Testanbieter; Brevo-Live-DOI bleibt separat in PR #544.

## Status der privaten Vorschau

Der aktualisierte Build mit Modul-Icons wurde als Version 3 der bestehenden privaten Review-Site gespeichert. Die Veröffentlichung am 09.10.2026 scheitert nach einem 504-Fehler wiederholt mit `Unable to authenticate request`. Eine erfolgreiche Aktualisierung der Online-Vorschau wird deshalb nicht behauptet; die hier verlinkten Screenshots zeigen den getesteten neuen Stand. Nach Behebung des Hosting-Fehlers dieselbe gespeicherte Version erneut veröffentlichen, ohne eine neue Site oder einen weiteren Anbieter anzulegen. IDs und Build-Provenienz sind in PR #543 dokumentiert. GitHub-Pages-Vorbereitung, Research und Brevo bleiben unverändert.
