# VISION UNIVERSE® DISCOVER — Visual Identity & Final Experience

Stand: 2026-09-11 · Branch `claude/vision-universe-discover-h93fmv` ·
dritte Ausbaustufe, baut auf `VU_DISCOVER_DELIVERY_REPORT.md` (Bau) und
`VU_DISCOVER_EXPERIENCE_REDESIGN.md` (dunkle Experience) auf.

Nicht nach `main` gemergt, nicht veröffentlicht.

---

## 1. Was ist die visuelle Sprache von Vision Universe Discover?

Drei Schichten, die aufeinander liegen und sich nicht vermischen:

**1 · Kinematische Basis.** Ein fast schwarzer Grund (`#08080a`), Flächen
statt Kästen, ein Typo-Kontrast von 10 px Versalien bis 72 px Headline.
Die Basis trägt keine Farbe; sie ist der Raum, in dem Farbe etwas bedeutet.

**2 · Kategoriefarbe als Atmosphäre.** Jede Kategorie hat eine Welt. Die
Welt erscheint als Leuchten hinter der Reihe, als Farbe des Datenbildes,
als Punkt vor der Überschrift, als Rand der Karte im Zeigerzustand — nie
als gefärbte Kachel und nie als Rechteck mit Kante.

**3 · Datengetriebenes Stock-Artwork.** Jeder Titel hat ein eigenes Bild,
das aus seinen Kennzahlen entsteht. Zwei Titel sehen nur dann gleich aus,
wenn ihre Zahlen gleich sind.

Was die Sprache **nicht** ist: kein invertiertes Research-Layout, kein
lila Verlauf über allem, kein Glow-Rahmen, kein Glassmorphismus, keine
zwanzig gleichen Rundkacheln, keine Neon-Fintech-Ästhetik.

---

## 2. Wie funktioniert das Kategorie-Farbsystem?

Definiert in `discover/methodology/discover-v1.json`
(`visualLanguage.worlds` und `visualLanguage.signalWorlds`), ausgeliefert
über `data-world` im Markup, aufgelöst in `discover/discover.css`:

| Welt | Kategorie | Ton |
|---|---|---|
| `leadership` | Market Leaders, TOP 10 | `#5b7cff` elektrisches Indigo |
| `highs` | Neue 52-Wochen-Hochs | `#4fd2e6` Eisblau |
| `momentum` | Momentum Leaders | `#b07bff` Violett |
| `breakout` | Breaking Out | `#f0a93c` Bernstein |
| `strength` | Relative Strength | `#3fd9a4` Smaragd |
| `quality` | Trend intakt / Qualität | `#d9bc6a` Gold |
| `risk` | Risiko-Zustände | `#f0675c` Koralle |
| `sectors` + 11 Sektorwelten | Sektorführer | Technologie Violett-Blau, Healthcare Türkis, Industrials warmes Orange … |

Ein Element setzt `--w`, `--w-2`, `--w-glow`, `--w-soft`; alles darunter
liest diese Variablen. Das Attribut steht auf der Reihe, auf der Karte und
auf dem Kopf der Detailseite — dadurch erbt jede Ebene die Welt, in der
sie steht, und eine einzelne Karte kann eine abweichende Signalfarbe
tragen, ohne die Reihe umzufärben (`.dx-sig{--sig:var(--w)}`).

**Farbe ist nie die einzige Information.** Jedes farbige Element trägt
denselben Sachverhalt auch als Text: die Signalplakette nennt das Signal,
die Zweitnennung nennt die Reihe, der Rang steht als Ziffer, die
Bildbeschreibung nennt Richtung und Abstand in Worten.

---

## 3. Wie entsteht das Artwork eines Titels?

`discover/ui/artwork.js`, eine Funktion, eine Tabelle:

| Bildelement | Datenquelle |
|---|---|
| Verlaufslinie | ausgelieferte Kursreihe, sonst der rebasierte Renditepfad |
| Sichtbare Knoten | die fünf Stützstellen (12M, 6M, 3M, 1M, heute) |
| Band um die Linie | `volatility252d`, an den Stützstellen schmaler |
| Grundlinie (gestrichelt) | der Startwert vor zwölf Monaten |
| Leuchtpunkt, waagerechte Lage | Position in der 52-Wochen-Spanne |
| Leuchtpunkt, Stärke | Leadership-Perzentil |
| Hochmarke | `signals.new52WeekHigh` |
| Skalenbalken unten | Abstand zu Hoch und Tief |
| Ticker-Wasserzeichen | das Kürzel, Größe nach Zeichenzahl |
| Farbe | die Welt der Reihe bzw. des Signals |
| Richtung (Koralle statt Weltfarbe) | Zwölfmonatsrendite negativ |

Es gibt **keine** dekorative Textur, kein Rauschen, kein Muster aus einem
Hash. Wer zwei Poster nebeneinander legt, sieht den Unterschied der
Zahlen.

---

## 4. Wie bleibt die Lizenzgrenze gewahrt?

Unverändert und in diesem Auftrag **nicht ausgeweitet**:

* Für 493 der 498 realen Titel bleibt der absolute Kurs zurück
  (`WITHHELD_REDISTRIBUTION`). Das Artwork zeigt deshalb den rebasierten
  Renditepfad — abgeleitet **ausschließlich** aus den bereits
  veröffentlichten Renditen über 12, 6, 3 und 1 Monat, normiert auf 100.
* Die fünf Stützstellen sind sichtbar. Zwischen ihnen wird **kein** Wert
  erfunden; die Linie verbindet, sie interpoliert keine Kurse.
* Jede Darstellung ist beschriftet: „Rebasierter Renditepfad — keine
  Kurskurve". Auch die Bildbeschreibung für Screenreader sagt es.
* Das Volatilitätsband ist eine Hüllkurve aus einer Kennzahl, keine
  Kursspanne.
* Es wurde **keine** zusätzliche absolute Kursangabe sichtbar gemacht,
  **keine** Redistributionsbeschränkung umgangen und **keine** historische
  Preisserie rekonstruiert.
* Diese Darstellung ist **keine** lizenzrechtliche Freigabe und wird auch
  nicht als solche behauptet. Die Bewertung bleibt beim Betreiber.

Geprüft von `scripts/discover/verify-discover-data.mjs` (Redistributions-
Wächter) und der Browser-QA („der rebasierte Renditepfad ist als solcher
benannt").

---

## 5. Wie sieht die Startseite als Komposition aus?

Rhythmus statt Stapel: Eingangsfläche (voll) → TOP 10 (Signaturreihe mit
Editorial-Ziffern) → Landschaftsposter → kompakte Reihe → Standardreihe →
Sektorkacheln. Jede Reihe trägt ihre eigene Atmosphäre; die Atmosphären
gehen ineinander über, weil die Fläche oben und unten maskiert ausläuft
(`.dx-rail-section::before` mit `mask-image`). Es gibt keine sichtbaren
Farbrechtecke — die Browser-QA prüft Verlauf, Maske und Rahmenbreite.

Links und rechts liegt die Atmosphäre bündig zur Seite. Vorher stand sie
6 % über — am Telefon war das echter Seitwärts-Scroll.

---

## 6. Was ist die Regel für Mehrfachnennungen (§16)?

Die erste Fassung zeigte jeden Titel genau einmal. Das war zu streng: dass
ein Marktführer zugleich ein neues Jahreshoch macht, ist die Aussage, um
die es geht. Die Regeln stehen jetzt zusammen in `discover/app.js`
(`DEDUP`):

| Regel | Wert | Grund |
|---|---|---|
| Auftritte je Titel | höchstens 2 | die Mehrfachnennung ist ein Befund, die dritte ist Monotonie |
| Zweitnennungen je Reihe | höchstens 3 von 12 | darüber liest sich die Reihe als Wiederholung |
| Zwei Reihen in Folge | nicht derselbe Titel | direkt untereinander sieht es wie ein Fehler aus |
| TOP 10 | nie gefiltert | die Signaturreihe zeigt die echte Rangliste |
| Sektorkacheln | zählen nicht mit | sonst stünde in einem Sektor nicht sein stärkster Titel |

Sortiert wird **nie** um; es wird nur entfernt. Jede Zweitnennung sagt als
Text, woher man den Titel kennt („auch in TOP 10"). Damit die Reihen dabei
nicht kurz werden, liefert der Build jetzt 30 statt 24 Karten je Reihe und
die Startseite zeigt 12 — die Differenz ist der Vorrat.

---

## 7. Woher kommen die Firmennamen?

In dieser Reihenfolge, erste Fundstelle gewinnt (`buildNameMap` in
`scripts/discover/build-discover-data.mjs`):

1. `quant/config/market-universe.json`
2. `quant/config/tiingo-universe.json`
3. `dashboard/config/universe.json`
4. `quant/data/sec/inspector_index.json` (SEC-Titel, entversalisiert)
5. `discover/config/company-names.json` — 188 kuratierte Schreibweisen,
   `provenance: CURATED_EDITORIAL`

Keine neue kostenpflichtige API, keine Änderung an der
Provider-Architektur, **kein aus dem Kürzel abgeleiteter Name**. Fehlt ein
Titel in allen fünf Quellen, zeigt die Oberfläche das Kürzel und der
Status sagt, dass kein Name ausgeliefert wurde.

---

## 8. Was wurde am Header geändert — und was nicht?

`assets/site-navigation.js` ist die einzige Kerndatei, die dieser Auftrag
ausdrücklich freigibt, und sie wurde ausschließlich um einen isolierten
Theme-Zustand erweitert:

* Ein `THEMES`-Objekt mit `light` (unveränderte Werte) und `dark`.
* `connectedCallback()` liest `theme="dark"` vom Element. Alles andere —
  auch `theme="light"`, `theme=""` oder ein Tippfehler — bleibt hell.
* Im Stylesheet wurden **nur Farbwerte** durch Variablen ersetzt. Menü,
  Links, Markup, Reihenfolge, `aria-current`, Tastaturbedienung und
  Mobilpanel sind unverändert.
* Gesetzt wird das Attribut an genau einer Stelle: `discover/index.html`.
* Dazu `:host([theme="dark"]) img{filter:invert(1)}` für das Logo.

Diff: 30 Zeilen dazu, 7 geändert.

**Regressionsnachweis**, zweifach:

1. `discover/tests/navigation-theme.test.mjs` baut den Kopf zweimal, setzt
   in beiden Paletten dieselben Platzhalter und vergleicht die
   Zeichenketten. Sie sind identisch — es hat sich außer Farbwerten nichts
   geändert. Zusätzlich: Standard ist hell, unbekannte Werte fallen auf
   hell zurück, Menüpunkte und Seitenmarkierung sind in beiden Fassungen
   gleich, und im Stylesheet steht kein fest verdrahteter Farbwert mehr.
2. Browser-QA „der dunkle Header betrifft ausschließlich Discover" liest
   `/quant/`, `/dashboard/`, `/news/`, `/macro/`, `/academy/` im Browser
   und prüft Hintergrund, Schriftfarbe und Navigationsziele gegen
   `/discover/`.

Zusätzlich wurde vor und nach der Änderung derselbe Messpunkt auf sieben
Seiten abgenommen: alle Seiten außer `/discover/` waren in allen
gemessenen Werten identisch.

---

## 9. „Nicht nur schwarz" — gemessen

Anteil farbiger Pixel (HSL-Sättigung > 0,10) am gerenderten Bild:

| Ansicht | 1440 × 900 | Bemerkung |
|---|---|---|
| Startseite | **35,1 %** | Hero-Atmosphäre, Reihenwelten, Artwork |
| Detailseite, obere Hälfte | **24 – 30 %** | Signalwelt am Kopf |
| Detailseite, ganze Höhe | 14 % | nach Absicht: unten wird es ruhig |

Die Messung lief über die tatsächlichen Bildpunkte, nicht über das
Stylesheet.

---

## 10. Wie ist die Detailseite aufgebaut (§20)?

Zwei Temperaturen. Oben trägt sie die Welt ihres stärksten Signals: die
Atmosphäre im Kopf, das große Datenbild hinter der Schrift, der Punkt vor
„Warum steht dieser Titel hier". Ab dem Kapitel *Kursverlauf* wird `--w`
auf den neutralen Modulakzent gesetzt — Analyse braucht einen neutralen
Grund. Eine Kategoriefarbe, die über einem RSI leuchtet, wäre eine
Behauptung über ein Ergebnis, das man gerade erst liest.

Ausgenommen bleibt „Weiter entdecken" am Seitenende: die Poster dort sind
wieder Entdeckung und tragen ihre eigene Welt.

Der Chart ist **weiterhin** der bestehende Technical Chart des
Quant-Moduls. Es wurde keine zweite Chart-Engine gebaut; die Anbindung
läuft über die bestehenden CSS-Variablen.

---

## 11. Was ist mit der Suche passiert (§22)?

Sie bleibt ein Vollbild-Overlay mit Tastaturbedienung und bekommt die
Bildsprache: jeder Treffer trägt seine Farbwelt (`w` im Suchindex, ein
Feld), das Kürzel liegt als großes Wasserzeichen in der Zeile, der
Skalenbalken zeigt die Position in der Jahresspanne in der Weltfarbe, und
die gewählte Zeile bekommt eine Kante in ihrer Welt.

Dabei fiel ein älterer Fehler auf: das Trefferraster verteilte seine Höhe
auf die Zeilen und staucht sie — die zweite Textzeile lief in den
nächsten Treffer. Sichtbar wurde das erst, als die Zeile einen eigenen
Hintergrund bekam. Behoben mit `align-content:start`.

---

## 12. Wie ist der Telefonfall gelöst (§23)?

Gemessen bei 390 × 844:

* **Kein Seitwärts-Scroll** (vorher 23 px durch die Atmosphäre-Fläche).
* **Reihenfolge auf der Karte:** Signal → Name → Kennzahl → Bild →
  Leadership. Umgesetzt über `order`, nicht über anderes Markup — die
  Vorlesereihenfolge bleibt gleich.
* **Die Eingangsfläche ist nicht bildschirmfüllend:** der Kopf der ersten
  Reihe steht bei 821 px, also im Bild. Dafür wurde der Hero-Chart auf
  122 px gekürzt und der Innenabstand verkleinert.
* **Der Datenhinweis ist verstaut, nicht abgeschnitten:** aus dem Absatz
  wurde ein `<details>` — auf breiten Schirmen offen und wie vorher, am
  Telefon zugeklappt mit `+`. Der volle Wortlaut bleibt im Dokument.
* **Reihen sind wischbar** mit Scroll-Snap, `scroll-padding` und
  `scroll-margin-top`, damit die Überschrift beim Anspringen nicht hinter
  der klebenden Leiste landet.
* In der Suche entfällt am Telefon die Leadership-Spalte; Kürzel, Name,
  Sektor und die Position in der Jahresspanne bleiben.
* Kein Hover-Vorhang, größere Tippflächen an den Zeitraumknöpfen.

---

## 13. Barrierefreiheit

* Farbe ist nie die einzige Information (siehe 2.).
* Jedes Artwork trägt ein `aria-label` aus seinen eigenen Zahlen
  („VLO, rebasierter Renditepfad über zwölf Monate, zwölf Monate plus
  149.5 Prozent, Abstand zum Jahreshoch -0.4 Prozent, neues
  52-Wochen-Hoch").
* Fokusring auf jedem bedienbaren Element (`:focus-visible`, 2 px).
* Suche vollständig über Tastatur; `Escape` schließt, Pfeile wählen.
* `prefers-reduced-motion`: keine Einblendanimation, kein automatischer
  Hero-Wechsel — beides in der QA nachgemessen.
* Dekorative Schichten (Atmosphäre, Wasserzeichen, Hero-Artwork) sind
  `aria-hidden` bzw. Pseudo-Elemente.

---

## 14. Kernschutz

Unverändert geblieben: `quant/`, `providers/`, `scripts/quant/`,
`scripts/technical/`, `scripts/market/`, `dashboard/`, `macro/`,
`academy/`. Einzige Ausnahme ist die im Auftrag ausdrücklich erlaubte:
`assets/site-navigation.js` für den isolierten Dark-Theme-Zustand (siehe
8.).

Kein neues Feature: keine neue Discovery-Kategorie, keine Event-Engine,
kein Live-Discovery, kein Volume-Surge, keine Momentum-Beschleunigung,
kein neuer Quant-Score, kein neuer technischer Indikator, keine neue API.
Die einzige Datenerweiterung sind drei Felder, die vorhandene Werte
weiterreichen: `world` auf Detailseite und Suchindex, `performancePath`
auf der Karte.

---

## 15. Prüfstand

| Prüfung | Umfang | Ergebnis |
|---|---|---|
| `node --test discover/tests/*.test.mjs` | 88 | grün |
| `node --test quant/tests/*.test.mjs` | 684 | grün |
| `scripts/discover/verify-discover-data.mjs` | 7 699 Nachrechnungen | keine Abweichung |
| `scripts/discover/browser-qa.mjs` | 47 Prüfungen, 18 Aufnahmen | grün |

Die Browser-QA ist gegenüber der zweiten Ausbaustufe um 14 Prüfungen
gewachsen: Farbwelten je Reihe, Atmosphäre ohne Kante, Artwork aus Zahlen,
Benennung des Renditepfads, die vier Mehrfachnennungsregeln, zwei
Temperaturen auf der Detailseite, der Header-Regressionstest über fünf
fremde Seiten, vier Telefonprüfungen — und eine Prüfung, die auf drei
Ansichten nachsieht, dass nirgends ein rohes Objekt, `undefined` oder
`NaN` in der Oberfläche steht. Genau die hat den Marktstruktur-Fehler
festgehalten, nachdem er beim Ansehen der Aufnahmen aufgefallen war.

Eine bestehende Prüfung wurde ersetzt: „jeder Titel genau einmal" war die
Regel der zweiten Ausbaustufe und ist mit §16 hinfällig geworden. An ihrer
Stelle stehen jetzt vier Prüfungen, die die neuen Grenzen einzeln
nachmessen.

---

## 16. Aufnahmen der visuellen Abnahme

12 Desktop, 6 Telefon, erzeugt von `browser-qa.mjs --shots`:

`01-hero`, `02-top10`, `03-reihen-welten`, `04-poster-artwork`,
`05-hover`, `06-suche`, `07-kategorie`, `08-detail-kopf`,
`09-detail-chart`, `10-detail-analyse`, `11-ohne-kursreihe`,
`12-modelluniversum`, `13-mobil-start`, `14-mobil-reihen`,
`15-mobil-poster`, `16-mobil-suche`, `17-mobil-detail-kopf`,
`18-mobil-detail-chart`.

---

## 17. Was beim Hinsehen auffiel und geändert wurde

| Befund | Änderung |
|---|---|
| Das Hero-Artwork lief durch den Leadership Score | Maske nach oben, Deckkraft 0,42 |
| Die Kategorie-Atmosphäre stand 6 % über die Seite | bündig; am Telefon war es Seitwärts-Scroll |
| Die Reihen wurden durch die Dedup-Regeln auf 8 Karten kurz | Vorrat 30, Anzeige 12 |
| Die Nachbarschaftsregel unterdrückte gerade die interessante Überschneidung (TOP 10 → 52-Wochen-Hochs) | gilt nur zwischen gleichartigen Reihen |
| Alle Treffer-Wasserzeichen leuchteten gleichzeitig | nur der gewählte Treffer |
| Die Trefferzeilen waren gestaucht | `align-content:start` |
| Die Bildunterschrift war am Telefon nach zwei Zeilen abgeschnitten | drei Zeilen; die Benennung des Pfads steht vollständig |
| In der Technical Intelligence stand „Marktstruktur: [object Object]" | Der Zustand wird als Satz gelesen (Regime + HH/HL); die Pivotkurse bleiben außen vor |
| Die benannten Aufnahmen zeigten alle die Eingangsfläche | Der Selektor `:nth-of-type` traf nie etwas, weil jede Reihe in ihrem eigenen Platzhalter steckt — jetzt über den Index, mit Prüfung, dass wirklich gescrollt wurde |

---

## 18. Was bewusst nicht gemacht wurde

* Keine zweite Chart-Engine.
* Keine gefärbten Karten, keine Regenbogen-Startseite.
* Keine künstliche Veränderung echter Ranglisten, um Wiederholung zu
  vermeiden.
* Kein Firmenname aus einem Kürzel.
* Kein globales Redesign der Site-Navigation.
* Keine zusätzliche absolute Kursangabe.

---

## 19. Offene Punkte

* 161 von 498 realen Titeln tragen einen kuratierten oder aus dem
  Repository gelesenen Namen; der Rest zeigt das Kürzel. Eine weitere
  Quelle wäre eine Datenfrage, keine Designfrage.
* Der Realtime-Pfad ist verdrahtet und getestet, bleibt aber hinter den
  Gates aus — die Oberfläche zeigt Schlusskurs und Sitzungszustand, nie
  einen falschen LIVE-Punkt.
* Elliott-Wellen bleiben als Schnittstelle vorbereitet; ohne belegtes
  Ergebnis erscheint ein Zustand, nie eine Welle.

---

## 20. Stand der Auslieferung

Alles auf `claude/vision-universe-discover-h93fmv`. **Nicht** nach `main`
gemergt. **Nicht** veröffentlicht. Die Freigabe für beides liegt beim
Betreiber.
