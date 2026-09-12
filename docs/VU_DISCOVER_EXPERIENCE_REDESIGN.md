# VISION UNIVERSE® DISCOVER — Experience Redesign

Stand: 2026-09-11 · Branch `claude/vision-universe-discover-h93fmv` ·
baut auf der ersten Fassung auf (siehe `VU_DISCOVER_DELIVERY_REPORT.md`)

## 1. Welche visuellen Änderungen wurden umgesetzt?

Die Oberfläche wurde vom hellen Research-Layout auf eine eigene, dunkle
Experience-Schicht umgestellt:

* **Fast schwarzer Grund** (`#08080a`) mit Flächen statt Kästen. Container
  gibt es nur noch dort, wo etwas zusammengehört (Poster, Panel) — Reihen,
  Überschriften und Hinweise liegen frei auf der Fläche.
* **Eigene App-Leiste** unter dem weißen Vision-Universe-Header:
  Marktstatus, Universum, Suche. Der Übergang von heller Site-Chrome zu
  dunkler Modulfläche ist damit gewollt und nicht ein Rest.
* **Eingangsfläche** über die volle Breite mit Signal, Name, Kennzahlen,
  Datenbild und zwei Handlungen.
* **Poster statt Karten:** der Verlauf trägt das untere Drittel, das Signal
  steht als farbiger Streifen darüber, der Leadership Score als feiner
  Balken darunter.
* **Rhythmus:** vier Posterformen (Rang, Landschaft, Standard, kompakt)
  plus Sektorkacheln. Keine zwei aufeinanderfolgenden Reihen sehen gleich
  aus.
* **Hover-Vorhang** auf dem Desktop mit Leadership, RS und Momentum.
* **Suche als Vollbild-Overlay** mit Tastaturbedienung.
* **Detailseite in Kapiteln**: Kopf, „Warum steht dieser Titel hier?",
  großer Chart, Kennzahlen, Technical Intelligence, Weiterentdecken.
* **Typografie:** durchgehend echte Umlaute in allen Oberflächentexten
  (vorher teils `ae/oe/ue` nach Repository-Konvention der Kommentare).

## 2. Wie wurde die Hero Experience aufgebaut?

`discover/ui/hero.js` mit `discover/data/featured/<UNIVERSE>.json`.

Die Auswahl trifft **der Build**, nicht das Frontend
(`buildFeatured` in `scripts/discover/build-discover-data.mjs`):
Kandidat ist nur, wer ein belegtes Signal trägt (neues 52-Wochen-Hoch,
Marktführerschaft oder bestätigter Ausbruch); sortiert wird nach
Leadership-Perzentil, mit Zuschlägen für ausgelieferte Kursreihe und
bekannten Firmennamen, höchstens zwei Titel je Sektor. Fünf Titel, im
Wechsel alle zehn Sekunden, anhaltend bei Zeiger oder Fokus, bei
`prefers-reduced-motion` gar nicht erst startend.

Die Fläche zeigt: Kicker (das Signal), Ticker und Sektor, Name, einen Satz
zum Signal, drei Kennzahlen mit Quelle, zwei Handlungen — und rechts das
Datenbild: die Kursreihe, wo sie freigegeben ist, sonst den rebasierten
Renditepfad. Die Bildunterschrift sagt in beiden Fällen, was gezeigt wird.

**Keine erfundenen Signale:** Kicker und Sätze entstehen aus
`heroHeadline`/`heroReasons` über feste Regeln aus den gerechneten
Kennzahlen.

## 3. Welche Card-/Poster-Typen existieren?

| Typ | Klasse | Einsatz | Merkmal |
|---|---|---|---|
| Rang | `.dx-rank` | TOP 10 MARKET LEADERS | 112-px-Outline-Ziffer neben dem Poster |
| Landschaft | `.dx-poster--wide` | NEUE 52-WOCHEN-HOCHS | 392 px breit, 148 px Verlauf |
| Standard | `.dx-poster` | Momentum, Relative Strength | 300 px, 104 px Verlauf |
| Kompakt | `.dx-poster--compact` | BREAKING OUT, TREND INTAKT, Nachbarn | 224 px, dichter, ohne Achsenbeschriftung |
| Sektorkachel | `.dx-sector` | SECTOR LEADERS | vier Titel als Rangliste statt vier Karten |
| Suchtreffer | `.dx-result` | Overlay | Zeile mit Position in der Jahresspanne |

## 4. Wie wurde Top 10 Market Leaders umgesetzt?

Dieselbe Rangliste wie MARKTFÜHRER (ein zweiter Datensatz wäre eine zweite
Wahrheit), aber als eigene Form: `.dx-rank` legt eine große, konturierte
Ziffer (01–10) links neben das Poster; das Poster überlappt sie, die Ziffer
liegt ihrerseits über der vorherigen Karte. Beim Hover wird die Kontur
heller. Die Reihe ist die einzige, die von der Entdopplung ausgenommen ist —
sie zeigt immer die echten Plätze 1 bis 10.

## 5. Welche Interaktionen wurden ergänzt?

* Hover: Poster hebt sich (−6 px, 1.025×), Vorhang mit Leadership/RS/
  Momentum und „Öffnen →". Nachbarkarten bewegen sich nicht.
* Reihen-Navigation: Pfeile am Rand, nur mit Zeiger, nur wo es weitergeht.
* Suche: `/` öffnet, ↑↓ wählt, Enter öffnet, Esc schließt, Klick auf den
  Hintergrund schließt; exakter Ticker steht vor Präfix- vor Namenstreffer.
* Eingangsfläche: Striche zum Wechseln, Autowechsel hält bei Benutzung an.
* Chart: Zeiträume, Schnellzugriff (6 Schalter) und „Erweitert" für Technik
  und Panels.
* Detailseite: Zugehörigkeits-Chips und Nachbar-Reihe als Ausgänge.

## 6. Wie wurde Mobile überarbeitet?

Eigener Designfall ab 860 px, nicht verkleinerter Desktop:

* App-Leiste auf zwei Zeilen (Marke + Universum / Suche + Marktstatus).
* Eingangsfläche: kürzere Typo, Kennzahlen **nebeneinander** in drei
  Spalten, Handlungen in einer Zeile, Verlauf 150 px, Bildunterschrift auf
  zwei Zeilen begrenzt (voller Wortlaut im `title`). Höhe < 1100 px, damit
  die erste Reihe nach einem Wisch sichtbar ist.
* Poster 252 px (kompakt 196 px) — groß genug für Signal und Verlauf.
* Kein Hover-Vorhang, keine Reihen-Pfeile; gewischt wird.
* Chart ohne die 640-px-Mindestbreite der Quant-Seiten, also in Bildbreite.
* Zeitraumknöpfe ≥ 30 px hoch.

## 7. Welche Dateien wurden verändert?

**Neu:** `discover/ui/hero.js`, `discover/ui/search.js`,
`discover/engines/narrative.js`, `discover/data/featured/*.json`,
`docs/VU_DISCOVER_EXPERIENCE_REDESIGN.md`

**Überarbeitet:** `discover/discover.css` (vollständig neu),
`discover/ui/cards.js` (vollständig neu), `discover/app.js`,
`discover/ui/detail.js`, `discover/index.html`,
`discover/engines/contract.js` (Feld `performancePath`),
`discover/methodology/discover-v1.json` (deutsche Reihentitel, Top-10),
`scripts/discover/build-discover-data.mjs` (Renditepfad, Featured,
Zugehörigkeiten, Nachbarn), `scripts/discover/verify-discover-data.mjs`
(kennt die schlanke Verweiskachel), `scripts/discover/browser-qa.mjs`
(33 statt 21 Prüfungen), `docs/VU_DISCOVER_ARCHITECTURE.md`

## 8. Welche Tests wurden ausgeführt?

```
node --test "discover/tests/*.test.mjs"           82 Tests, 82 bestanden
node scripts/discover/verify-discover-data.mjs    7.313 Nachrechnungen, 0 Abweichungen
node --test "quant/tests/*.test.mjs"              684 Tests, 684 bestanden
node scripts/quant/verify-quant-data.mjs          bestanden
node scripts/market/assert-no-secrets.mjs         keine Zugangsdaten
```

Die Nachrechnung prüft weiterhin, dass im realen Universum kein absolutes
Kursniveau ausgeliefert wird — auch nicht über die neuen Felder
(`performancePath`, `featured`, `similar`).

## 9. Welche Browser-QA wurde durchgeführt?

`node scripts/discover/browser-qa.mjs` — **33 von 33 bestanden**
(Chromium, Desktop 1440×900, Telefon 390×844, zusätzlich ein Lauf mit
`prefers-reduced-motion`):

Eingangsfläche mit echtem Titel/Signal/Kennzahlen · Datenbild benannt ·
Featured-Wechsel · TOP 10 mit Ziffern 01–10 · vier Posterformen vorhanden ·
jedes Poster mit Symbol, Signal und Verlauf · **keine Wiederholung
derselben Titel** · Hover-Vorhang · Kartennavigation · Suche über Tastatur,
Pfeiltasten, Enter, leeres Ergebnis, Esc · Kategorie mit Filter und
Abdeckung · Detail mit Kopf, Begründung, Chart · Zeitraumwechsel ·
gesperrte Zeiträume begründet · Schnellzugriff und erweiterte Technik ·
Zugehörigkeiten und Nachbarn · Titel ohne Kursreihe · Elliott nie ohne
Befund · Modelluniversum mit Kurs und Verlauf · kein horizontaler Überlauf ·
keine Konsolenfehler · Mobil: Höhe der Eingangsfläche, Kennzahlen
nebeneinander, kein Hover, Wischen, Vollbildsuche, Chart in Bildbreite ·
reduzierte Bewegung: alles sofort sichtbar, kein Autowechsel.

Visuell geprüft und iteriert: Eingangsfläche, Startseite, TOP 10,
52-Wochen-Reihe, Breakout-Reihe, Sektorkacheln, Hover, Kategorie, Detail
(mit und ohne Kursreihe), Chart mit Überlagerungen, Suche, Modelluniversum —
je Desktop und Telefon. Dabei behoben: eine Klassennamen-Kollision, die die
App-Leiste zerlegte, verschluckte Rangziffern, ein Scroll-Snap, der die
Eingangsfläche verschob, eine Tastaturabkürzung ohne Ziel, doppelte Titel
über mehrere Reihen, ein dreizeiliger Kopf auf dem Telefon.

## 10. Wurde eine geschützte Core-Datei verändert?

**Nein.** `quant/`, `providers/`, `scripts/quant/`, `scripts/technical/`,
`scripts/market/`, `dashboard/`, `macro/`, `academy/` sind in diesem
Schritt unverändert (`git status` leer). Auch `assets/site-navigation.js`
blieb unangetastet — der Menüeintrag stammt aus der ersten Fassung.

Der bestehende Technical-Chart wird weiterhin verwendet, nicht ersetzt: die
dunklen Farben entstehen, indem `.dx-chart` seine CSS-Variablen überschreibt.

## 11. Welche visuellen Schwächen bestehen noch?

* **Weißer Site-Header über dunkler Fläche.** Die globale Navigation liegt
  im Shadow DOM und ist von außen nicht umfärbbar, ohne die gemeinsame
  Datei zu ändern. Gelöst wurde das durch eine eigene dunkle App-Leiste
  direkt darunter; ein durchgehend dunkler Kopf bräuchte eine Änderung an
  `assets/site-navigation.js`.
* **Firmennamen fehlen** für 483 der 498 realen Titel (die Anbieter-
  Tickerliste führt keine). Die Poster zeigen dann Sektor oder Börse über
  dem Ticker — richtig, aber weniger erzählerisch als ein Name.
* **Der Renditepfad hat fünf Stützstellen.** Für Titel ohne freigegebene
  Kursreihe ist das der ehrliche Höchststand an Auflösung; eine echte
  Tageslinie gibt es nur für die fünf freigegebenen Titel und das
  Modelluniversum.
* **SMA 200 kann aus dem Bild laufen**, wenn der Durchschnitt weit unter
  der Kursspanne des Fensters liegt — der bestehende Chart skaliert auf den
  Kurs, und daran wurde nichts geändert.
* **Sektorkacheln zeigen vier Titel**; mehr würde die Kachel zu einer
  Tabelle machen.

## 12. Preview

* Lokal: `python3 -m http.server 8765` → http://localhost:8765/discover/
* Nach einem Merge nach `main`: https://research.visionuniverse.de/discover/
  (**nicht** gemergt, **nicht** veröffentlicht — wie angefordert)
* Branch: `claude/vision-universe-discover-h93fmv`
