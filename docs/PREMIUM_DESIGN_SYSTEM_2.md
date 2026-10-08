# Vision Universe Premium Design System 2.0

Gestalterische Referenz: die aktuelle Landingpage, insbesondere
`assets/home/home.css`, `scripts/home/index.template.html` und
`scripts/home/hud-symbols.html`. Das Konzeptboard beschreibt die Richtung;
die Produktfunktionen und ihre bestehenden Routen bleiben maßgeblich.

## Gemeinsame Foundation

`assets/site-navigation.css` stellt ausschließlich zusätzliche `--vu-*`
Tokens und opt-in Komponenten bereit. Die bestehende Shared Shell behält
Header, Floating Dock, Safe-Area-Abstände und Menü-Lebenszyklus.
Light verwendet Weiß, Off-White und dunkle Typografie; Dark verwendet
`#08080a`, `#0e1013` und `#f4f5f1`. Vision-Universe-Lime ist in beiden
Themes `#c8f531`. Dunkles Grün dient im Light-Theme als lesbare Akzenttext-
und Fokusfarbe. Fachliche Chart-, Risiko- und Kategorie-Farben bleiben bei
den jeweiligen Produkten.

Gemeinsame Hero-Klassen: `vu-product-hero`, `vu-product-hero__copy`,
`vu-product-hero__eyebrow`, `vu-product-hero__title`,
`vu-product-hero__lead`, `vu-product-hero__actions` und
`vu-product-hero__visual`. Die Kurzformen `vu-product-eyebrow`,
`vu-product-title` und `vu-product-lead` sind gleichwertige Aliases.
Die Token-Aliases `--vu-premium-background` / `--vu-premium-bg`,
`--vu-premium-ink`, `--vu-premium-muted`, `--vu-premium-accent` und
`--vu-premium-accent-text` erlauben einfache Produktintegration.
Die Klassen definieren Typografie und Rhythmus;
Produkte behalten ihr eigenes Layout und ihre Bilder. Der Titel wächst von
34–48 px auf Mobile auf bis zu 64 px am Desktop. Produktlayouts dürfen
an Tablet-Breiten eine kompaktere Überschrift beibehalten. Benefit-Texte erhalten
1,6-fachen Zeilenabstand und eine begrenzte Lesebreite. Aktionen und Chips
stehen als `vu-product-action`, `vu-product-action--secondary` und
`vu-product-chip` bereit; Touch-Ziele sind mindestens 44 px hoch.

## Original-Icon-System

`assets/product-icons.svg` ist ein gemeinsamer, cachebarer SVG-Sprite.
Die Geometrie stammt unverändert aus `scripts/home/hud-symbols.html`:

| Sprite-ID | Original | Motiv |
| --- | --- | --- |
| `discover` | `h-discover` | Radar und Entdeckung |
| `quant` | `h-quant` | Chip mit Sigma |
| `screener` | `h-screener` | Technischer Kriterienfilter |
| `supertrader` | `h-super` | Zielmarke und Kerze |
| `elliott` | `h-elliott` | Wellenverlauf |
| `technical` | `h-technical` | Kerzen und Trend |
| `fundamental` | `h-fundamental` | Zahlenanalyse |
| `vorsorge` | `h-vorsorge` | Schirm und Schutz |
| `layers` | `h-layers` | Weitere Produktwelten |
| `hedgefonds` | Ergänzung | Drei Investoren mit technischer Basislinie |

Für Vorsorge existiert bereits ein passendes Original. Für Hedgefonds
existiert kein Original im Landingpage-Sprite. Die Ergänzung verwendet
dasselbe 24er-Raster, runde Linienenden, 1,7 px Kontur, eine gedämpfte
zweite Ebene und geometrische Symbolik. Kein neues Icon-Paket, keine
generierten Bilddateien. Attribute für `.dim` und `.fill` liegen im Sprite,
damit externe SVG-`use`-Elemente auch in Shadow DOM dieselbe Darstellung
erhalten. `currentColor` ermöglicht lesbare kleine Dock-Varianten.

```html
<span class="vu-product-icon vu-product-icon--hero" aria-hidden="true">
  <svg viewBox="0 0 24 24" focusable="false">
    <use href="/assets/product-icons.svg#quant"></use>
  </svg>
</span>
```

| Verwendung | Klasse | Mobile | Desktop |
| --- | --- | --- | --- |
| Hero | `vu-product-icon--hero` | 72 px | 96 px |
| Produktkarte | `vu-product-icon--card` | 52 px | 58 px |
| Globales Menü | `vu-product-icon--menu` | 36 px | 36 px |
| Dock | `vu-product-icon--dock` | 24 px | 24 px |

Hero-, Karten- und Menü-Icons erhalten dunkles HUD-Material mit Lime-Raster,
Eckmarken und einem dezenten statischen Lichtschein. Dock-Icons verwenden
dieselbe Geometrie ohne Kachel und Lichtschein. Beschriftete Icons sind
dekorativ (`aria-hidden="true"`); Produktnamen bleiben echte Texte.

## Ressourcen und Änderungsgrenzen

Ein gemeinsamer Sprite versorgt Hero und Menü; das Menü lädt ihn erst beim
Öffnen. Der kleine Dock zeichnet dieselben Originalgeometrien inline, damit
datenreiche Quant-Unterseiten keine zusätzliche Anfrage benötigen. Ein
Provenienztest vergleicht diese Geometrien exakt mit dem Sprite. Kein
Preload auf unbeteiligten Seiten, keine separaten Größen-Assets, keine
zusätzliche Bibliothek und keine neue Schrift. Die HUDs besitzen eine feste
Breite und Höhe und verursachen keinen Layout Shift beim Laden des Sprites.
Hero-Bilder gehören nur auf die zugehörige Produktstartseite.

Gates bleiben unverändert: Discover-View-Budget ≤180.000 decoded Bytes und
≤12 Requests; Quant-Budgets stehen in `scripts/vu2/resource-budget.mjs`.
Das Supertrader-Isolationsgate verlangt einen eigenen PR. Gemeinsame
Foundation und Produktmigrationen werden deshalb getrennt geliefert.
Business-Engines, erzeugte Daten, Rankings, Berechnungen und Datenpipelines
gehören nicht zum visuellen Änderungsumfang.

Die Shell-QA erreicht nach begrenztem Scroll-Warmup das aktuell geladene
Dokumentende mit einem synchronen Instant-Scroll und misst im selben Task,
bevor paginierte Listen weitere Treffer nachladen. Der tatsächliche Endpunkt
muss über dem Dock liegen; verbleibender Scrollweg sowie gesperrtes Scrollen
führen weiterhin zum Fehler. Die letzte Bedienfläche der Desktop-Filterleiste
wird zusätzlich auf freien Dock-Abstand und tatsächliche Trefferfläche geprüft.
Der Screener begrenzt deren Höhe um Dock, Safe Area und 16px Abstand.
Negative Browserkontrollen erkennen fehlendes Bottom-Padding, Scroll-Lock
und unterdrücktes Scrollen. Kein Clearance-Grenzwert wird abgeschwächt.
Vollbildansichten mit eigenem Scrollbereich (Discover-Feed) dürfen den Body
sperren, wenn kein Dokument-Scrollweg besteht. Ein gesperrtes HTML oder ein
gesperrter Body bei erforderlichem Dokument-Scrollen bleiben Fehler.

Browser-, Navigations-, Theme- und Performance-Evidenz wird im Delivery-
Bericht geführt; dieses Dokument behauptet keine abgeschlossene QA und
keinen Live- oder Deployment-Status.
