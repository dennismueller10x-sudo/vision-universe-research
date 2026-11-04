# Auftrag: Redesign-Präsentation Vision Universe, eine Produktwelt

Du arbeitest an einer Präsentation (HTML), die später 1:1 an Claude Code übergeben wird, damit es das komplette Frontend von research.visionuniverse.de neu baut. Je heutige Seite gibt es eine Folie: links „HEUTE“ (echte iPhone-Aufnahme der ganzen Seite), rechts „NEU“ (deine iPhone-Mockups), darunter ein Bauplan. Zielgruppe der App: vom 10-Euro-Sparplan-Anleger bis zum Hedgefonds-Manager. Jeder soll die App sofort verstehen. Anspruch: weltbeste Finanz-App, klarer als Bloomberg, TraderFox oder Fiscal AI. Arbeite wie ein Top-Produktdesigner.

## Ordner

- Präsentation: `docs/design/redesign-2027/`
- Deine Datei: `site/worlds/<NN-name>.js` (nur diese Datei(en) schreiben, nichts anderes ändern).
- Heutige Aufnahmen: `site/now/<ID>.jpg` (390 px breit, ganze Seite untereinander, Höhe bis 7000 px, 2× Pixeldichte). Schau dir jede Aufnahme deiner Seiten an, bevor du entwirfst (Read-Tool auf die JPG; bei sehr langen Bildern zuerst mit Python/PIL in Abschnitte von ~1700 px Höhe schneiden und die Abschnitte ansehen, Ausgabe in deinen eigenen Unterordner `v3/work/<NN>/`).
- Bibliothek (nicht ändern, nur lesen): `site/lib.js` (Bausteine), `site/render.js`, `site/worlds/00-system.js` (Beispiele für Screens und Folien).
- Repository mit echten Daten: `/home/user/vision-universe-research` (nur lesen).
- Prüfen: `node docs/design/redesign-2027/tools/check.js <site> --shots <eigener Ordner> --only <ID-Präfix>`; meldet JS-Fehler und fehlende Screens und macht Folien-Screenshots. Schau dir die Screenshots deiner Folien an und korrigiere sichtbare Fehler (abgeschnittener Text, Überlappungen, leere Icons).
- Echte Kursreihen holen (im Repo-Ordner ausführen): `node <v3>/tools/series.js AMD MU` → 52 Punkte je Ticker, als Konstante in deine Datei kopieren. 48 Ticker sind schon da: `VU.S` (z. B. `VU.S.AMD`), Namen `VU.NAMES`, Kurzbeschreibung `VU.WHAT`. NVIDIA: `VU.D.nvda` (252 Tageskurse 1 Jahr), `VU.D.nvda5y` (261 Wochen), `VU.D.nvdaMax`, Geschäftszahlen `VU.D.tracks.revenue|net_income|free_cash_flow|operating_cash_flow|eps_diluted|cash|debt|shares` als `[[GJ, Wert], …]`.

## Aufbau deiner Datei

```js
(function () {
const { screen, slide, chapter, ic, hud, chart, mini, tf, chg, vd, help, lg, row, STOCK, DOCK, HDR, WORLDS, perspbar, D, S, de, pc, sect, kv, tile, navcard, pill, toggle, bars, supp, resi, NV, search, intro, NAMES, WHAT, day, px } = VU;

chapter({ n: '03', title: 'Quant', icon: 'quant', anchor: 'quant', was: 'Ein Satz, was diese Welt neu macht. <b>Fett ist der Kern.</b>', pages: 'Q01–Q09 · 9 Seiten' });

screen('q01-a', { world: 'quant', dock: 0, h: 1600, body: `...HTML...` });

slide({ id: 'Q01', title: 'Quant · Übersicht', route: '/quant/', newRoute: '/quant/', now: 'Q01',
  neu: [['q01-a', 'Start, ganze Seite'], ['q01-b', 'Sheet „So funktioniert Quant“']],
  spec: { aufbau: ['…'], komponenten: ['C01 Kopfzeile', 'C02 Produkt-Leiste', 'C06 Chart'], daten: ['quant/data/…'], weg: ['…'] } });
})();
```

### screen(id, o)
- `world`: Schlüssel aus `VU.WORLDS` (discover, quant, technical, fundamental, elliott, supertrader, hedgefonds, screener, vorsorge, mein, start). Bestimmt Kopfzeile (links Icon + Name der Welt) und Produkt-Leiste unten.
- `dock`: aktiver Platz der Produkt-Leiste (0 = Start der Welt, 1–3 = Bereiche laut `VU.DOCKS[world]`, `'menu'`), oder `false` ohne Leiste (z. B. Vollbild, Anmeldung).
- `hdr: false` ohne Kopfzeile (Status-Leiste bleibt). `nosb: 1` ganz ohne Status-Leiste und Kopfzeile (Vollbild, Story).
- `h`: Höhe in px, Standard 844. **Lange Seiten als eine lange Seite bauen** (z. B. `h: 2200`), sie scrollen im Rahmen wie die Aufnahme. Inhalt muss bis unten gefüllt sein, unten 120 px frei für die Leiste.
- `dk: 1` dunkler Modus. `overlay`: HTML über allem (Sheets: `<div class="ovl"></div><div class="sheet"><div class="grab"></div>…</div>`, Position absolut im 390 × 844-Rahmen).
- `body`: HTML. Breite 390, Innenabstand 18 px links/rechts ist gesetzt. Kopfzeile und Status-Leiste liegen darüber (der Abstand oben ist schon eingerechnet).

### Bausteine (Kennung in `spec.komponenten` nennen)
C01 Kopfzeile (automatisch) · C02 Produkt-Leiste (automatisch, `DOCKS` je Welt) · C03 Menü · C04 Aktienkopf `STOCK('Faktoren')` (Perspektive: Überblick, Chart, Zahlen, Faktoren, Methoden, Wellen, Investoren) · C05 Perspektiven-Leiste `perspbar()` · C06 Chart `chart(series, {w, h, axis:[links, rechts], zones:[[von,bis,'l'|'g','Label']], lines:[reihe], marks:[[index,'1']], base:false, grid:false, ink})` und Zeitleiste `tf('1J')` · C07 Kursbewegung `chg(v, big)` · C08 Urteil `vd('s'|'m'|'w'|'o', Text)` · C09 Erklärung `help(Text)` · C10 Aktienzeile `row('AMD', Untertitel?)` (nur Ticker aus `VU.S`) · C11 Kachel `tile(label, wert, sub)` · C12 Navigationskarte `navcard(icon, titel, sub)` · C13 Abschnittstitel `sect(titel, link)` · C14 Reiter `<div class="seg"><span class="on">A</span><span>B</span></div>` · C15 Schalter `toggle(on)` · C16 Sheet · C17 Balken `bars([[jahr, wert]], {w, h})` · C18 Leerer Zustand (`vd('o', 'Keine Aussage')` + Satz) · C19 PRO-Marke `<span class="pro">PRO</span>` · C20 Suche `search('Platzhalter')`.
Weitere Klassen: `card`, `card ink` (schwarz), `card lime`, `card line`, `grid2`, `grid3`, `stack`, `chips` + `chip` (`on`, `lm`), `pill(text,'on'|'lm')`, `kv([[k,v]])`, `lt` (große Überschrift 34 px), `mt` (21 px), `ltag` (kleine Großbuchstaben), `mu` (grau), `sm`, `xs`, `b`, `bb`, `num`, `btn` (neongrün), `btn ink`, `btn line`, `bar` (+ `<i style="width:60%">`, `<i class="l">` neongrün), `dots`, `cimg` (Bildkarte; Bilder in `site/img/`: Themen `01-kuenstliche-intelligenz.webp, 02-halbleiter-chips.webp, 03-rechenzentren-cloud.webp, 04-cybersecurity.webp, 16-raumfahrt.webp, 19-biotechnologie.webp`, Story-Bilder `<produkt>-v1-thumb.jpg`). Icons: Produkt-Icons `discover quant screener supertrader elliott chartbild technical fundamental vorsorge layers hedgefonds`, Linien-Icons `i-sun i-spark i-person i-search i-heart i-heartf i-back i-next i-bell i-share i-mic i-check i-play i-x i-plus i-gear i-star i-globe i-target i-swipe i-filter i-list i-line i-shapes i-bars i-grid i-book i-wave i-new i-signal i-bookmark i-pie i-menu`. Eigene kleine Hilfsfunktionen innerhalb deiner Datei sind erlaubt; eigenes CSS nur inline.

### slide(s)
- `id`: Kennung der Seite (wie in der Routenliste unten). `title`: „Welt · Seite“. `route`: heutige Adresse. `newRoute`: neue Adresse (gleich lassen, wenn sie bleibt). `now`: Aufnahme-ID (meist = id). `neu`: 1–4 Screens mit kurzer Beschriftung.
- `spec`: Bauplan für Claude Code, knapp und konkret. `aufbau`: Abschnitte der neuen Seite von oben nach unten. `komponenten`: Bausteine (C01–C20) plus neue Muster, die du einführst (benenne sie „<Welt>-Muster: …“). `daten`: echte Datenquelle(n) im Repo (Dateipfad, ggf. Feld). `weg`: was entfällt oder sich ändert gegenüber heute.
- Optional `sub`: ein Satz, warum die Seite so neu gebaut wird.
- Zusätzlich darfst du `slide({ t: 'html', id, title, sub, html: () => '…' })` für Übersichtsfolien nutzen (z. B. Struktur der Welt, Ablauf), sparsam.

## Gestaltungsregeln (verbindlich)
1. Farben nur Weiß, Schwarz, Neongrün `#c8f531` (Variable `var(--lime)`), Graustufen nur über die vorhandenen Variablen (`--a-card`, `--a-line`, `--a-mute`). Kein Beige, kein Rot/Grün für Kurse: Plus = neongrüne Pille, Minus = schwarze Pille (`chg`).
2. Ein Chart überall: nur `chart()` (schwarze Linie, neongrüne Fläche). Keine eigenen Chart-Stile, keine Kerzen in Einsteiger-Ansichten. Balken nur über `bars()`.
3. Ein Urteil überall: `vd()` mit Stark/Mittel/Schwach/Keine Aussage (Wortlaut je Sache passend, Form bleibt).
4. Jede Kennzahl, die ein Laie nicht kennt, bekommt `help()` mit einem Satz Alltagssprache.
5. Navigation: Kopfzeile und Produkt-Leiste kommen automatisch. Die Produkt-Leiste deiner Welt steht in `VU.DOCKS`; ordne jede heutige Unterseite einem Platz zu (oder dem Startbereich). Zwischen Welten wechselt man nur über das Menü.
6. Aktien öffnen immer die eine Aktienseite: `STOCK('<Perspektive>')` oben, darunter der Inhalt der Perspektive deiner Welt. Kommt man aus Quant, ist „Faktoren“ aktiv und die Quant-Leiste bleibt unten.
7. Keine erfundenen Zahlen. Werte aus den Aufnahmen oder aus Repo-Dateien (Pfad im Bauplan nennen). Ist etwas Beispiel, schreibe sichtbar „Beispiel“. Keine Kauf-/Verkaufsempfehlungen.
8. Sprache: Deutsch, du-Form, kurze Sätze, Alltagswörter zuerst, Fachbegriff danach. Texte im Mockup knapp.
9. Einsteiger zuerst, Tiefe auf Abruf: Profi-Inhalte mit `PRO` markieren oder hinter „Mehr“/Sheet legen, statt sie zu streichen. Keine Funktion von heute fällt ersatzlos weg; wird etwas verschoben, steht im Bauplan wohin.
10. Qualität: Jede Folie muss einen klaren Vorher/Nachher-Fortschritt zeigen. Lange heutige Seiten bekommen eine lange neue Seite (`h`) plus bei Bedarf weitere Screens für Zustände (Sheet offen, Filter offen, Leerzustand, Profi-Ansicht).

## Fertig, wenn
- Jede Route deiner Liste hat eine Folie mit `now`, 1–4 `neu`-Screens und vollständigem `spec`.
- `check.js` meldet keine Fehler und keine fehlenden Screens; du hast die Screenshots deiner Folien angesehen und Fehler behoben.
- Antworte am Ende knapp: Liste deiner Folien-IDs mit je einem Satz, was neu ist, und offene Punkte (z. B. Seite lokal nicht ladbar).
