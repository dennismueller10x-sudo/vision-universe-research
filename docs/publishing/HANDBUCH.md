# Publishing – Aktienmagazin, Insights und Reports

Ein Handbuch für alles Redaktionelle: das Wochenheft (Abschnitte 1–7) und die Tagesartikel unter `/insights/` mit den
Reports unter `/reports/` (Abschnitt 8).

| Was | Wo |
|---|---|
| Heft-System (Build, Prüftor, Vorlagen, Design) | `docs/publishing/system/` |
| Ausgabe Nr. 01 vom 09.11.2026 (30 Seiten), eingefroren | `docs/publishing/ausgaben/2026-11-09-nr01/` (PDF in `pdf/`, Vorschau `vorschau/index.html`, Prüfbericht Codex) |
| Erstes Konzept (5 Seiten Magazin, 5 Seiten Aktienreport AMD), eingefroren | `docs/publishing/konzept-2026-11/` |
| Insights: Artikel, Build, Tests | `products/insights/`, Seiten unter `insights/` und `reports/` |
| Bildaufträge (Higgsfield) | `brand-media/publishing/` |
| Marktbriefing (Closing Bell): Konzept, Quellen- und Frischeregeln | Abschnitt 10 |


Heft: Stand 09.11.2026, nach dem Umbau gemäß Codex-Prüfung ([Prüfbericht](ausgaben/2026-11-09-nr01/PRUEFBERICHT_CODEX.md)).
Ziel: jede Woche eine neue Ausgabe, ohne Vorlagen, CSS oder Werkzeuge anzufassen. Je Ausgabe neu sind nur Daten,
Texte, Quellen und Bilder.

## 1. Aufbau

```text
docs/publishing/
  system/                    stabil, ändert sich nur in eigenen PRs
    build.mjs                setzt die Ausgabe zusammen, nummeriert, prüft (Prüftor), rendert PDF/PNG/Vorschau
    build-data.mjs           Datenschnappschuss einer Ausgabe (eingefroren, mit Daten-Commit und Stichtagen)
    templates.mjs            Seitenvorlagen (heute: "aktie" für Titelthema-Aktien und Einzelanalysen)
    lib.js  charts.js  mag.css   Bausteine, Charts, Design-System
  ausgaben/<datum>-nr<NN>/   eine Ausgabe
    ausgabe.json             Nummer, Datum, KW, Redaktionsschluss, Datenfenster, Aktienlisten, Seitenfolge, Quellen je Seite, Inhaltsverzeichnis
    seiten/<id>.html         frei gestaltete Seiten (Platzhalter statt fester Daten)
    seiten/_kennzahlen.html  kleine Kennzahl-Bausteine für Texte (VUM.k)
    inhalt/<id>.json         Inhalte für Vorlagen (Text, Zitat, Bild, Kasten)
    fakten.json              Quellenregister (ID, Medium, Titel, Datum, URL, Status) und Zitatregister (Original + Sprecher)
    data.js                  eingefrorener Datenschnappschuss
    RECHERCHE.md             Faktenblatt (Aussage → Quelle)
    img/  pdf/  vorschau/
```

Bauen (Chromium/Playwright vorinstalliert):

```bash
node docs/publishing/system/build.mjs docs/publishing/ausgaben/2026-11-09-nr01 --scale 2 --vorschau --out /tmp/heft
```

Das **Prüftor** endet mit Exit-Code 1 bei: fehlenden Bildern, JS-Fehlern, Text über Seiten- oder Fußzeilenrand, unbekannten
Seiten-IDs in `{{seite:…}}`, unbekannten Quellen-IDs, Seiten ohne Quellen (außer `"quellen": false` in `ausgabe.json`).
Gewollter Anschnitt: Attribut `data-bleed`.

## 2. Automatisch erzeugt

- **Seitenzahlen** aus der Reihenfolge in `ausgabe.json`. In Texten `{{seite:chart}}` statt einer Zahl.
- **Inhaltsverzeichnis** (S. 3) aus den `toc`-Einträgen (`bild` = Bildzeile, ohne Bild = „Außerdem“).
- **Kopf- und Fußzeilen** mit Nummer und Datum; Fußzeile mit den **Quellennummern** der Seite.
- **Quellenverzeichnis** (Impressum): einmal nummeriert, mit anklickbaren Links im PDF.
- **Platzhalter:** `{{nr}} {{datum}} {{kw}} {{schluss}} {{datenstand}} {{datenstandKurz}} {{root}}`.
- **PDF** mit Lesezeichen (Outline) und Tags; **Vorschau** mit `--vorschau`.

## 3. Heftaufbau

Standard **24 Seiten**, bis **32** bei starker Nachrichtenlage (Nr. 01: 30). Gerade Seitenzahl; für Druck auf 4 teilbar machen.
Jede Ausgabe hat **mindestens vier App-Seiten** im vollen Seitenformat (Owner 09.11.2026). Sie sagen klar, was Vision Universe
ist: Analyse-Software für Aktien, die jeden Abend über 5.600 US-Aktien nach festen Regeln durchrechnet und in Klartext erklärt.

| Seite | Rubrik |
|---|---|
| 1 | Cover |
| 2 | **App 1** „Investieren mit Weitblick“: fünf iPhones mit Live-Screens (Discover, Quant, Fundamental, Supertrader, Hedgefonds), Kennzahlen, QR |
| 3 | Editorial und Inhalt |
| 4–5 | Das war die Woche, Zahlen der Woche |
| 6–13 | Titelthema: Auftakt mit Story, Daten, 4–6 Aktienseiten (Vorlage `aktie`), Lesarten und Termine |
| 14 | **App 2** „Was ist Vision Universe?“: Daten, Regeln, Klartext; für wen |
| 15–16 | Zwei Einzelanalysen (Vorlage `aktie`) |
| 17–18 | Berichtssaison: größte Anstiege und Rückgänge |
| 19–20 | Hedgefonds-Radar |
| 21–23 | Chart der Woche, Screening, Markt-Radar |
| 24 | **App 3** „Die Werkzeuge hinter diesem Heft“ (Technical, Hedgefonds, Fundamental) |
| 25–27 | Konjunktur, Deutschland und Europa, Termine |
| 28 | Quick-Check mit Newsletter-Kasten |
| 29 | Impressum, Hinweise, Quellen |
| 30 | **App 4** Rückseite |

Für 24 Seiten: Titelthema auf 4 Aktien kürzen, Szenarien-Seite und eine Einzelanalyse weglassen; die vier App-Seiten bleiben.

## 4. Wöchentlicher Ablauf

1. **Ausgabe anlegen:** Vorwochen-Ordner kopieren nach `ausgaben/<datum>-nr<NN>/`, `img/hf-*`, `pdf/`, `vorschau/`, `data.js` löschen. In `ausgabe.json` Nummer, Datum, KW, Redaktionsschluss, Datenstand, `daten.fenster` (letzter Freitag der Vorwoche bis letzter Handelstag; Feiertage beachten) und Aktienlisten setzen.
2. **Daten einfrieren:** `node docs/publishing/system/build-data.mjs docs/publishing/ausgaben/<ordner>`. Schreibt `data.js` mit `snapshot` (Daten-Commit, Stichtage je Produkt). Ein vorhandener Schnappschuss wird nicht überschrieben (`--neu` nur bewusst).
3. **Themen wählen** aus `data.js` (größte Bewegungen, Berichtssaison, Politik). Jede Geschichte braucht einen Anlass aus der Woche.
4. **Recherche:** je Strang ein Rechercheauftrag. Jede verwendete Quelle als ID in `fakten.json` (Medium, Titel, Datum, URL; ohne URL `status: "offen"`), wörtliche Zitate zusätzlich im Zitatregister. Widersprüche als Spanne oder weglassen.
5. **Bilder:** zuerst Vorrat und echte App-Screens nutzen; neue Motive nur für Cover, Titel und wenige Leitbilder. Bildregeln in Abschnitt 5.
6. **Schreiben:** Aktienseiten als `inhalt/<id>.json` (3–5 Absätze, ca. 1.300–1.900 Zeichen), übrige Seiten in `seiten/`. Kennzahlen nur über `data-k`/`VUM.C(t)`. Quellen-IDs je Seite in `ausgabe.json`.
7. **Bauen und prüfen:** Prüftor muss bestehen, dann jede Seite ansehen. Wortwahl prüfen (Abschnitt 6).
8. **Ausgeben:** PDF nach `pdf/`, `--vorschau` für die Blätter-Vorschau, PR mit grüner CI.
9. **Freigabe:** Veröffentlichung und Rechtstexte brauchen die Owner-Freigabe.

## 5. Design und Bildsprache

- Farben: Weiß, Schwarz, Neongrün `#c8f531`, Graustufen. Plus = neongrüne Pille, Minus = schwarze Pille (auf Schwarz weiß).
- Schrift: Inter. Fließtext 9,6 pt, Unterzeile 11 pt, Kleintext mindestens 7 pt. Lieber kürzen als verkleinern.
- **Bildsprache künftig heller (Owner 08.11.2026):** dunkle Seiten sind in Ordnung, Bilder aber nicht düster. Tageslicht
  oder helles Studio, viel Weiß und Hellgrau, Neongrün als Akzent, freundlich und klar statt Gewitter und Low-Key. Stil-Satz
  für Higgsfield-Aufträge (Qwen Image 3, 2k):

  > Bright editorial photograph for a premium finance magazine, clean daylight or bright studio lighting, white and light
  > grey surroundings, vivid lime-green accents, optimistic and clear, high detail, photorealistic, no text.

  Negativ: `text, letters, numbers, logo, watermark, cartoon, dark, gloomy, low-key, night, storm, face, recognizable person`.
- KI-Bilder tragen „KI-Bild“; keine echten Personen, keine fremden Logos im Bild. Charts nur aus Daten (`charts.js`).
- **Gestaltung hell (Owner 09.11.2026):** Grundton Weiß und Hellgrau `#f4f5f0`, Neongrün als Fläche erlaubt; schwarze Seiten
  sparsam (Rückseite, einzelne Kästen).
- App-Seiten nur mit echten Screens der neuen App (`docs/design/redesign-2027`). Aufnahme `img/live-*.jpg`: lokalen Server im
  Repo starten (`python3 -m http.server`), Seite in Playwright mit iPhone-Größe (390 × 844, Faktor 3) öffnen, Bildschirmfoto.
  Nur Screens mit echten Daten (keine „Daten nicht verfügbar“), ohne persönliche Daten und ohne Empfehlungswörter.
- **PDF-sicher gestalten:** keine halbtransparenten `radial-gradient`- oder großen, weichgezeichneten `box-shadow`-Flächen. Manche
  PDF-Betrachter (iOS, Vorschau) zeigen sie als grüne oder graue Rechtecke. Leuchten nur als Bild (`.glowimg`, Datei
  `system/glow-lime.png`), iPhones mit Rand statt Schatten.
- Bildaufträge laufen über den Workflow „Brand Media · Higgsfield Bilder“ und müssen auf `main` liegen; je Gruppe ist nur ein wartender Lauf möglich.

## 6. Regeln

- **Wortwahl** nach `docs/legal/WORTWAHL.md`: beschreiben statt auffordern, kein Kursziel, „größte Anstiege/Rückgänge“, „Stärken/Schwächen laut Kennzahlen“, keine unbelegten Superlative (Vergleichsgruppe nennen), keine Kausalschlüsse aus Trefferlisten.
- **Zahlen:** VU-Daten mit Stichtag (Datenkasten zeigt das Quartal der SEC-Daten); recherchierte Zahlen mit Quellen-ID; eigene Rechnungen benennen; Zeitfenster einheitlich (Woche = `daten.fenster`).
- **Zitate:** nur wörtlich mit Anführungszeichen, sonst Paraphrase ohne Anführungszeichen; Sprecher und Medium am Zitat.
- **Recht** (keine Rechtsberatung): Impressum (§ 8 LPresseG BW, § 18 Abs. 2 MStV), Zitatquelle (§ 63 UrhG), KI-Bild-Hinweis, „Keine Anlageberatung“ in jeder Fußzeile.
- **Kanäle:** www.visionuniverse.de (Newsletter), Instagram und TikTok `@app.visionuniverse`, App „bald verfügbar“.

## 7. Fahrplan (Rest aus der Codex-Prüfung)

| Prio | Aufgabe | Stand |
|---|---|---|
| P0 | Ausgabe einfrieren (Snapshot mit Commit und Stichtagen) | erledigt (`build-data.mjs`, `data.js.snapshot`) |
| P0 | Quellen- und Zitatregister | erledigt (`fakten.json`); offene Fundstellen im Register mit `status: "offen"` nachtragen |
| P0 | Prüftor mit Exit-Code | erledigt (Überlauf, Fußzeile, Bilder, Seiten- und Quellen-IDs) |
| P1 | `ausgabe.json`, automatische Seitenzahlen, Inhalt, Querverweise | erledigt |
| P1 | Vorlagen statt HTML je Seite | begonnen: Vorlage `aktie` (7 Seiten); weitere Vorlagen für Kartenseiten (Das war, Anstiege/Rückgänge, Zahlen) |
| P1 | Lesbarkeit | erledigt fürs PDF (größere Schrift, eine Spalte auf Aktienseiten); offen: einspaltige HTML-Leseansicht fürs Handy |
| P1 | Markt-Radar mit Veränderung zur Vorwoche, Rubrik „Was wurde aus unserem Thema?“ | offen, ab Nr. 02 |
| P2 | Bildaufträge vom Arbeitszweig statt nur von `main` | offen (Workflow-Änderung, eigener PR) |
| P2 | Rechtstexte aus `assets/legal-notices.json` einbinden; Zitatrecht, KI-Kennzeichnung, Eigenwerbung anwaltlich bestätigen | offen, Owner-Freigabe |

Bekannt: Der Kerntest `core/tests/stock-availability.test.mjs` scheitert derzeit auch auf `main` (datenabhängig, nicht Publishing).

## 8. Insights: Artikel, Aktienmagazin, Reports

Owner-Entscheidungen 09.11.2026: kein Newsticker, sondern **ein bis zwei Themenartikel am Tag** (ein großer Wert, ein
Nebenwert oder ein Zukunftsthema), jeweils mit dem Teil, den nur Vision Universe hat: „So zeigt Vision Universe …“ mit
echten App-Screens. Unter `/insights/` stehen die Artikel, das **Aktienmagazin** (`/insights/magazin/`, online lesen und PDF)
und die **Reports** (`/insights/reports/`, erst mit dem ersten fertigen Report gefüllt; das alte XPeng-Muster ist nicht mehr
verlinkt, das alte `/magazin/` leitet auf das Aktienmagazin um).
Alles frei lesbar und für Google und KI-Suchen gebaut (statisches HTML, `NewsArticle`-JSON-LD, Sitemap
`/insights/sitemap.xml`, RSS `/insights/feed.xml`), Rohstoff für Reels, X, TikTok und das Wochenheft.

**Ablauf je Artikel**

1. Thema wählen (Anlass aus dem Tag), recherchieren, jede Zahl mit Quelle. Quellen kommen mit Adresse in `quellen`.
2. `products/insights/artikel/<datum>-<slug>.json` anlegen (Vorlage: ein bestehender Artikel). Abschnitte als HTML-Absätze;
   der Abschnitt mit `"daten": "<TICKER>"` bekommt danach den App-Teil (Kennzahlen-Kacheln, drei iPhones, Gesundheitscheck, 13F).
3. Daten einfrieren: `node products/insights/snapshot.mjs <artikel.json>`, App-Screens aufnehmen:
   `node products/insights/screens.mjs <artikel.json>` (neue Aktienseite `/aktie/#/<T>` im dunklen Design an drei Stellen: Kurs,
   Analyse aus den Modulen, Das Geschäft; fehlt ein Abschnitt, entfällt die Ansicht, mindestens zwei je Ticker; nach `insights/img/app/`).
   Diagramme im Text (Owner 18.11.2026): `abschnitte[].diagramm` mit `art` `saeulen` oder `balken`, gebaut als statisches
   HTML in `products/insights/build.mjs` (`diagramm()`), geprüft in IN-2; der Tageslauf setzt sie, wo Zahlen im Text stehen.
   Die Datenbox im Artikel zeigt nur Kacheln mit Wert; bei jungen Notierungen ohne vier Quartale SEC-Zahlen den Abstand zum
   Hoch seit dem ersten Handelstag und einen Satz, dass Umsatz, Marge und Bewertung noch fehlen (Owner 16.11.2026).
4. **Bilder mit Bezug statt Symbolbild** (Owner 09.11.2026): offizielles Pressematerial des Unternehmens oder Produkts
   (Pressefotos, Artwork, Screenshots aus Presseseiten) mit Bildnachweis `quelle` („Bild: Rockstar Games“), sonst eigene
   App-Screens; KI-Bilder nur, wenn es nichts Echtes gibt (`ki: true`, Hinweis „KI-Bild“). Keine Fotos von Privatpersonen.
   Aufmacher 16:9 (1600 × 900), im Text `"bild"` je Abschnitt, Porträts mit `"stil": "portrait"`.
5. Bauen: `node products/insights/build.mjs`; Prüfung: `node --test "products/insights/tests/*.test.mjs"` (aktuell gebaut,
   Pflichtfelder, Bildnachweise, Quellen, Wortwahl, JSON-LD, Magazin-Dateien, Übersicht/Feed/Sitemap vollständig).
6. Owner sieht es sich live an; Korrekturen kommen als eigener kleiner PR. Kein KI-Hinweis am Text (Owner 10.11.2026):
   der Owner liest jeden Artikel und trägt die redaktionelle Verantwortung; KI-Bilder behalten „KI-Bild“.

**Tageslauf ohne Owner (ab 11.11.2026):** Zwei geplante Aufgaben wecken an jedem Werktag die dauerhafte Sitzung
„Insights-Tageslauf (dauerhaft)“: um 4:47 Uhr (Frühlauf, Artikel gegen 6 Uhr: Tagesthema aus der US-Sitzung des Vortags)
und um 10:47 Uhr (Mittagslauf, Artikel gegen 12 Uhr, vor der US-Eröffnung: Nebenwert oder Zukunftsthema). Die Sitzung
schreibt nach `.claude/skills/insights-tageslauf/SKILL.md` je Lauf einen Artikel, prüft und veröffentlicht bei grüner CI
selbst. Die Artikel erzählen die Geschichte hinter dem Kursausschlag, damit sie auch nach einer Gegenbewegung stimmen.
**Öffentlich:** `/insights/` liegt als einziger Bereich ohne Passwortmaske (`scripts/access-gate/build.mjs`,
`PUBLIC_PREFIXES`) und ist für Google freigegeben (`robots`-Meta, `NewsArticle`- und `BreadcrumbList`-JSON-LD,
`/robots.txt` mit Sitemap). **Google Search Console** (11.11.2026): Dienstkonto `search-console` im Google-Cloud-Projekt
„Vision Universe“, Nutzer der Domain-Property `visionuniverse.de`, Schlüssel im Secret `GSC_SERVICE_ACCOUNT_JSON`.
`content.yml` (Teil `search-console`, täglich 02:23 UTC, 03:23 Uhr Berlin) reicht die Sitemap ein, prüft die Indexierung der neuesten
Artikel und legt Klicks, Impressionen und Suchbegriffe intern in den Datenzweig (`seo/search-console/latest.json`);
der Tageslauf liest den Bericht vor der Themenwahl. **IndexNow** (11.11.2026, für Bing, Copilot, ChatGPT-Suche, Yandex u. a.): der Schlüssel liegt als `<schlüssel>.txt` im Wurzelverzeichnis; `pages-release.yml` vergleicht vor jedem Ausrollen die ausgelieferte mit der neuen Insights-Sitemap und meldet neue oder geänderte Adressen danach an api.indexnow.org (`products/insights/indexnow.mjs`, Job `indexnow`; Fehler sind nur Warnungen, kein eigener Zeitplan). Solche
Artikel tragen `"pruefung": "automatisch"` (intern: strengere Prüfregeln, z. B. drei Quellen) und erscheinen wie alle
Artikel unter „Redaktion Vision Universe“, ohne KI-Hinweis (Owner-Entscheidung 10.11.2026: der Owner liest jeden
Artikel nach, meldet Korrekturen und trägt die redaktionelle Verantwortung). Bilder nach dem Skill (Pressematerial,
Firmenwebsite, KI-Bild mit „KI-Bild“); App-Screens als Aufmacher nur als Notlösung. Lieber kein Artikel
als ein schlechter: ohne drei Quellen, bei roten Tests oder heiklen Themen bricht der Lauf ab und meldet nur.
Pausieren oder ändern: in der App unter den geplanten Aufgaben („Insights-Tageslauf“).

**Heft online stellen:** `python3 products/insights/heft_veroeffentlichen.py docs/publishing/ausgaben/<ordner> <NN>`
(PDF, verkleinerte Seitenbilder, Cover nach `insights/magazin/nr-<NN>/`), dann Eintrag mit Titel, Unterzeile und Inhalt in
`products/insights/magazin.json` (neueste zuerst) und bauen.

**Aktienreport** (ab 12.11.2026, Nr. 01 Take-Two): gebaut mit dem Heft-System wie das Magazin, ein Ordner je Report unter
`docs/publishing/reports/<ordner>/` (`ausgabe.json` mit `"reihe": "Aktienreport"` und `"pdf"`, `seiten/`, `fakten.json`,
`img/`, Datenschnappschuss `data.js` aus dem eigenen `daten.mjs`). Bilder: offizielles Pressematerial (bei GTA VI die
Downloads unter rockstargames.com/VI, „Media & Artwork“) mit Bildnachweis, App-Ansichten über `products/insights/screens.mjs`.
Bauen mit `node docs/publishing/system/build.mjs <ordner> --scale 2 --vorschau --out <tmp>`, PDF nach `<ordner>/pdf/`, dann
`python3 products/insights/report_veroeffentlichen.py <ordner> <id>` (PDF, Seitenbilder und Cover nach
`insights/reports/<id>/`, öffentlich wie alles unter `/insights/`), Eintrag mit Kurzfassung in `products/insights/reports.json`,
`node products/insights/build.mjs`. `pdf/` und `vorschau/` im Report-Ordner werden nicht eingecheckt (die Online-Fassung
enthält das PDF). Ein Report nennt kein Kursziel; Bullen- und Bärenfall stehen immer nebeneinander, mit Beobachtungspunkten.
Serienregeln nach der Prüfung von Nr. 01 (12.11.2026): jede Kennzahl mit Zeitraum, Stichtag, Einheit, Definition und Quelle
(GAAP, bereinigt, TTM, Prognose sichtbar); Bewertung neben dem Marktmedian auch gegen die eigene Geschichte und andere Werte
der Branche; Kursvergleiche um Ereignisse als „beschreibend, keine Ereignisstudie“ kennzeichnen; Kursverläufe als Index statt
in Dollar (Tiingo-Kursniveaus nicht weitergeben); wörtliche Zitate nur mit geprüftem Wortlaut, sonst Paraphrase; eigene
Quellenseite mit Titeln und Links (Fußzeilen verweisen darauf), Inhaltsverzeichnis im PDF verlinkt (`#seite-<id>`); die
App-Seite heißt „Eigenwerbung“; Geschäftsmodell und finanzielle Kernaussage früh. Gestaltung (Owner 12.11.2026): Titel ohne Börsenkürzel, mit großem Aufhänger (z. B. „GTA VI“-Button) und
Themen-Buttons; Seite 2 ein Inhaltsverzeichnis mit Bildern in verschiedenen Größen; Seite 3 nur Zahlen („auf einen Blick“),
Zahlen und Fließtext sonst nicht mischen; Platz ausnutzen; nie helle Schrift auf Neongrün; letzte Seite ein großes
Vision-Universe-Werbebild mit nur www.visionuniverse.de. Das Prüftor meldet helle Schrift auf Grün als Fehler und
Weißraum über 20 mm vor der Fußzeile als Hinweis (`"weissraum": false` je Seite schaltet ab). Interessenkonflikte stehen allgemein im Impressum (Owner 14.11.2026: Herausgeber und Beteiligte können Aktien der besprochenen Unternehmen halten), nicht je Report einzeln. Bilder: offizielles Pressematerial auch ohne ausdrückliche Lizenz (Owner-Entscheidung 14.11.2026). Offen für die Anwaltsprüfung der Vorlage:
Einordnung nach MAR/DelVO 2016/958, konkrete Angaben zu Interessenkonflikten, Bildrechte (Pressematerial), Weitergabe von Kursdaten.

Regeln wie im Heft (Abschnitt 6). Zusätzlich: Privatpersonen, gegen die nur Vorwürfe bestehen, werden nicht namentlich
genannt; Vorwürfe stehen im Konjunktiv mit Quelle, die Gegenseite kommt zu Wort.

**Darstellung (App-Konzept 2, Prototyp `#news`, Owner 15.11.2026: „1:1 wie im Prototyp“):** `/insights/` ist der Bildschirm „News“
im Dock. Oben der neueste Artikel randlos als Titelbild (470 px, Rubrik, Titel, Aktien mit Tagesbewegung, Lesezeit), darunter die
Reiter im Inhalt (Heute · Magazin · Kurz erklärt · Reports), drei Artikelzeilen, die Kachel des Aktienmagazins mit Lesefortschritt,
„Kurz erklärt in 30 Sekunden“ (Erklärvideos aus `willkommen/config/stories.json`), „Zu deinen Aktien“ (nur mit Watchlist),
Aktienreports, danach alle weiteren Artikel. Artikel, Heft und Report tragen dieselben Reiter; der Artikel beginnt mit demselben
Titelbild. Alles schreibt `products/insights/build.mjs` als fertiges HTML (ohne JavaScript lesbar); `insights/news.js` ergänzt nur
Tagesbewegung (`quant/engines/published-close.js#dayChange`), „heute“, Watchlist-Artikel, Lesefortschritt und das Video-Fenster.
Adressen, Kopfangaben, Feed, Sitemap und `artikel.json` bleiben unverändert, der Tageslauf baut mit demselben Befehl
(neue Erklärvideos in `stories.json` brauchen einen Neubau). `/news/` (Nachrichten-Feed unter „Weitere Produkte“) ist eine andere Seite.

## 9. Suche: Plan für die Freischaltung der ganzen Website

Stand 11.11.2026: nur `/insights/` ist öffentlich und indexierbar (Sitemap, Search Console, IndexNow). Die Freischaltung
weiterer Bereiche entscheidet der Owner; dieser Plan sagt, was dafür technisch vorbereitet wird.

**Befund.** Die Bereichsseiten (`/quant/`, `/discover/`, `/hedgefonds/` …) sind leere Hüllen von 1–4 KB, der Inhalt entsteht
erst im Browser. Google rendert das verzögert, KI-Suchen (ChatGPT, Perplexity, Claude) lesen meist nur das rohe HTML und
sähen fast nichts. Aktienadressen wie `/aktie/NVDA` laufen über `404.html` und melden Suchmaschinen einen Fehler 404. Keine
Bereichsseite hat strukturierte Daten; `llms.txt` gibt es nicht.

**Schritte (je ein PR, in dieser Reihenfolge):**

1. **Statische Aktienseiten** `/aktie/<ticker>/` aus den vorhandenen Daten (größter Hebel: Suchen wie „Nvidia Aktie
   Kennzahlen“). Je Seite ein Fakten-Absatz oben (was das Unternehmen macht, drei bis fünf Kennzahlen mit Stand-Datum
   und Quelle, Wortwahl nach `docs/legal/WORTWAHL.md`), darunter der Sprung in die App. Start mit dem Discover-Umfang,
   später das Produktuniversum. Die bisherigen Links (`/aktie/NVDA?p=zahlen`) bleiben gültig.
2. **Sitemap-Index** `/sitemap.xml` aus `core/registry/modules.json` (nur `access: free`, Status LIVE/BETA, Route
   öffentlich) plus Insights- und Aktien-Sitemap; `robots.txt` zeigt auf den Index. IndexNow liest dann den Index statt
   nur die Insights-Sitemap, die Search Console reicht ihn ein.
3. **Titel, Beschreibung, strukturierte Daten je Bereich** (aus `products/<id>/module.json`, damit es nicht auseinanderläuft):
   | Bereich | Titelmuster | Strukturierte Daten |
   |---|---|---|
   | Startseite | „Vision Universe – Aktien verstehen mit Daten“ | `Organization`, `WebSite` |
   | Bereiche (Quant, Discover, Technical, Hedgefonds, Screener, Vorsorge, Academy) | „<Bereich>: <Nutzen in 5 Wörtern> · Vision Universe“ | `WebApplication` (Kategorie Finance), `BreadcrumbList` |
   | Aktienseiten | „<Name> Aktie (<Ticker>): Kennzahlen, Bewertung, Investoren“ | `WebPage` mit `about` = `Corporation` (`tickerSymbol`), `BreadcrumbList` |
   | Hedgefonds je Fonds | „<Fonds>: Depot und Käufe laut 13F“ | `WebPage`, `BreadcrumbList` |
   | Academy-Lektionen | Frage als Titel | `Article`, bei echten Fragen `FAQPage` |
   | Insights | wie heute | `NewsArticle`, `BreadcrumbList` |
   Jede Seite: genau ein `canonical`, `og:`-Bild, Beschreibung 120–155 Zeichen; ein Test prüft das je Bereich.
4. **Interne Verlinkung.** Artikel → statische Aktienseite; Aktienseite → neueste Artikel zum Ticker und verwandte Werte
   (gleiche Branche); Bereichsseiten mit Brotkrumen und einer Fußzeile zu allen öffentlichen Bereichen. Keine Seite ohne
   eingehenden Link (Test über die Sitemap).
5. **Auswertung je Suchbegriff.** `search-console.mjs` von Insights auf die ganze Property erweitern: je Bereich und
   Begriff Klicks, Impressionen, Position; daraus zwei Listen für die Tagesarbeit: viele Impressionen bei schwacher
   Klickrate (Titel verbessern) und Position 8–20 (Seite ausbauen). Optional Bing Webmaster Tools (Owner meldet sich
   einmal an und übernimmt die Domain aus der Search Console).
6. **KI-Suche.**
   - Bing/IndexNow: läuft für Insights; mit Schritt 2 für alle Seiten. ChatGPT-Suche und Copilot stützen sich auf Bing.
   - Fakten-Absätze: der erste Absatz jeder Seite beantwortet die Frage allein (Wer, Was, Zahl, Datum, Quelle), ohne
     Klick und ohne JavaScript lesbar.
   - `robots.txt`: Such-Crawler zulassen (`OAI-SearchBot`, `PerplexityBot`, `Claude-SearchBot`, `Bingbot`, `Googlebot`).
     Ob Trainings-Crawler (`GPTBot`, `ClaudeBot`, `CCBot`, `Google-Extended`) ausgeschlossen werden, entscheidet der
     Owner mit der Freischaltung; Empfehlung: zulassen, weil Bekanntheit in KI-Antworten das Ziel ist.
   - `llms.txt`: geringer Nutzen (keine große Suche nutzt sie verbindlich), aber billig. Mit Schritt 2 aus derselben
     Liste erzeugen (Bereiche mit einem Satz, neueste Artikel), nicht von Hand pflegen.
7. **Nicht öffentlich** bleiben: `/konto/`, `/mein-dashboard/`, `/status/`, `/social/`, `/company-intelligence/`, alles mit
   `access: intern`; `/preise/` erst nach der rechtlichen Abnahme (`docs/accounts/RECHTLICHE_ABNAHME.md`).

**Freischaltung selbst** (Owner-Entscheidung, danach ein PR): weitere Präfixe in `PUBLIC_PREFIXES`
(`scripts/access-gate/build.mjs`), `robots`-Meta der freigegebenen Seiten auf `index`; IndexNow und Search Console melden
die neuen Adressen beim nächsten Ausrollen von selbst.

## 10. Marktbriefing (Closing Bell): Konzept

Stand 21.11.2026, Konzept nach einem Muster vom 20.11.2026 (12 Karten 1080×1350, noch nicht im Repo).
Ziel: nach jedem US-Handelstag ein Briefing aus Grafikkarten, das ohne Handarbeit entsteht und an drei Stellen
verwertet wird: Seite im News-Bereich, Instagram-Karussell und Reel oder Video (Reel-Pipeline, `docs/studio/README.md`).

**Grundsatz:** Format wie eine Börsensendung, Inhalte aus eigenen Daten und Primärquellen. Kein Thema, keine Zahl und
keine Grafik wird aus anderen Sendungen, YouTube-Kanälen oder X-Konten übernommen.

**Drei Kartenarten**

| Art | Herkunft | Beispiele aus dem Muster |
|---|---|---|
| Markt | eigene Daten (`marketPulse`, Intraday, Movers, Renditen, Rohstoffe, Krypto) | Indizes über ETF-Proxies, Tagesverlauf, Anleihen, größte Anstiege und Rückgänge |
| Eigene Auswertung | feste Rechenregeln über eigene Zeitreihen und SEC-Daten | Häufung von Tagen mit −5 % seit 2008, Marktbreite, KGV am Hoch gegen heute, Investitionen der Hyperscaler gegen operativen Cashflow (95 % gegen 26 % im Jahr 2015) |
| Angabe Dritter | Primärquellen oder seriöse Medien, auf das Original zurückverfolgt | Reuters (Nvidia/SEC), BofA-Fondsmanager-Umfrage, CME FedWatch, Konjunkturdaten |

Ziel: mindestens die Hälfte der Karten sind Markt oder eigene Auswertung. Jede Karte trägt oben „Eigene Auswertung“ oder
„Angabe Dritter“ und unten Quelle mit Datum.

**Quellenregeln**
- Feste Quellenliste: Notenbanken, Statistikämter, SEC-Filings, Nachrichtenagenturen, öffentliches Research von Herausgebern
  (FactSet Insight, Check Point und ähnliche); Bank-Research nur über seriöse Medien. Keine YouTuber, keine X-Konten als Quelle.
- Jede Grafik wird mit unseren Vorlagen neu gezeichnet, nie ein Screenshot.
- Höchstens zwei Karten je Quelle und Briefing.
- Eine Zahl, die nur eine einzige Sekundärquelle ohne genannten Datenanbieter nennt, wird nicht verwendet.
- Darstellung (Owner 22.11.2026): keine Quellenzeile unter Grafiken oder auf Karten; alle Quellen gesammelt am Seitenende
  unter „Quellen und Hinweise“ (zugeklappt), auf Social in der Caption. Angaben Dritter tragen den Herausgeber im Etikett.
  Der Anbieter der Kursdaten wird öffentlich nirgends genannt (Test MB-4).
- Wortwahl nach `docs/legal/WORTWAHL.md`: „Größte Anstiege/Rückgänge“, keine eigene Prognose; Kursziele von Banken nur als
  Angabe Dritter mit dem Zusatz „keine Prognose von Vision Universe“.

**Frischeregeln (Owner 21.11.2026: tagesaktuell; 2–3 Tage nur für das erste Muster)**
- Markt und eigene Auswertung: nur aus der jüngsten Handelssitzung. Hängt eine Datenart hinter ihrer Frische in
  `core/registry/domains.json`, entsteht kein Briefing, sondern ein Alarm.
- Angabe Dritter: veröffentlicht am Handelstag selbst (bis zum Erzeugen des Briefings); der Zeitraum der Daten steht in
  der Quellenzeile. Monatliche Berichte (Umfragen, Cyberlage) und Konjunkturdaten laufen genau an ihrem Erscheinungstag.
- SEC-Fundamentaldaten: jüngste Meldung; ist ein Quartal gemeldet, aber noch nicht bei der SEC, sagt die Karte das.
- Im Muster fielen schon nach der vorläufigen 3-Tage-Regel drei Karten heraus: FactSet-Bewertung (Stand 05.11.), Goldman-Hedgefondsdaten
  (bis 06.11.), Check-Point-Ransomware (veröffentlicht 11.11.).

**Tägliche Quellen:** Kurse, Intraday und Movers aus Tiingo (Abendlauf 22:30 UTC), Marktbreite aus dem Faktorlauf
(gegen 23:40 UTC), Renditen aus US Treasury und Bundesbank, SEC-Fundamentaldaten aus dem täglichen EDGAR-Lauf. Themen
Dritter liefert ein täglicher Recherchelauf nach US-Handelsschluss, aufgebaut wie der Insights-Tageslauf (Skill
`insights-tageslauf`): Nachrichtenagenturen, Fed und Statistikämter am Erscheinungstag, Unternehmensmeldungen, Research-Herausgeber.

**Zeitpunkt:** Tagesschlüsse liegen ab 22:30 UTC vor; das Briefing entsteht danach oder morgens als Rückblick. Eine
Opening Bell zum US-Handelsbeginn braucht schnellere Kursdaten als die heutigen (Intraday stündlich, IEX verzögert).

**Bekannte Lücken:** echte Indexstände (heute ETF-Proxies), Sektor-ETFs für eine Heatmap, VIX, Zahlen- und
Wirtschaftskalender (FMP-Endpunkte geprüft in `scripts/market/probe-free-sources.mjs`).

**Generator (Stand 21.11.2026)**
- Engine `products/news/briefing/engine.js` (Kartenregeln, Frische, Prüfung der Themen Dritter), Darstellung
  `products/news/briefing/render.js` (jede Karte ein SVG 1080×1350), Build `products/news/briefing/build.mjs`, Tests
  `products/news/tests/marktbriefing.test.mjs`.
- Lauf: `content.yml` Teil `marktbriefing`, Mo–Fr 23:50 UTC über den Wecker (`core/registry/schedule.json`), intern im
  Datenzweig (`news/marktbriefing/`, Datenart `marktbriefing`; Research-Seite `/news/marktbriefing/` bleibt `noindex`).
- Themen Dritter liest der Build aus `news/marktbriefing/radar/<sitzung>.json` (`items[]` mit title, publisher, source,
  published, url, optional sub, quote, columns, bars, stats; optional `editorial` mit eigenem Titel der Titelkarte).
  Die Engine verwirft, was nicht vom Handelstag ist, nicht aus der Quellenliste kommt oder keine URL hat.
- Ausblick (Owner 22.11.2026): `agenda[]` in derselben Radar-Datei, je Termin `date`, `kind` (`zahlen`, `daten`, `notenbank`,
  `dividende`, `markt`), `label`, optional `time` (deutsche Zeit) und `sub`, Pflicht `source` und `url` (https; Primärquelle
  bevorzugt: Unternehmen, BEA/BLS/Conference Board, Notenbank). Die Engine nimmt nur Werktage 1 bis 7 Kalendertage nach dem
  Handelstag, höchstens 4 Tage und 12 Termine; Verworfenes steht mit Grund in `dropped`. Daraus entstehen die letzte Karte
  „Die nächsten Tage“, die Szene `#ausblick` und der Satz „Als Nächstes: …“ in der Kurzfassung. Ohne `agenda` keine Karte.
  Termine sind Angaben der Unternehmen und Behörden, keine Erwartung von Vision Universe.
- Karussell und Video: `node products/news/briefing/export-png.mjs <briefing.json> <ordner>` schreibt die Karten als PNG.
- Die Investitionskarte erscheint nur, wenn ein Hyperscaler in den letzten 3 Tagen neue Zahlen bei der SEC gemeldet hat.

**Website www.visionuniverse.de/marktbriefing/ (Owner 22.11.2026)**
- `/marktbriefing/` ist die Produktseite, visuell und allgemein (Owner 22.11.2026: App zuerst, PDF bleibt, wenig Text):
  Kopf mit einem Fächer echter Handy-Bildschirme der neuesten Ausgabe (`bildschirm-NN.jpg` aus `screens.mjs`; Owner 22.11.2026:
  kein dunkles Handy-Mockup, es soll wie das Marktbriefing selbst aussehen), darunter ein Story-Block (ein Bildschirm mit
  durchlaufenden Szenen, Text mit Icons) und ein eigener PDF-Block mit aufklappendem Heft wie bei
  Magazin und Aktienreport (`.m3` aus `landing/web/site.css`; Titelblatt und Innenseiten `seite-02.png` bis `seite-04.png`
  aus `pdf.mjs`), schwarzes Zahlenband „Aus Millionen
  Datenpunkten. Weltweit.“ (6 Mio. Kursdaten, 5.200+ US-Aktien je Börsentag, 5.277 Firmenbilanzen der SEC, 119 Hedgefonds aus
  13F-Meldungen; gezählt am 22.11.2026, abgerundet) mit Quellenarten, Kartenleiste aller Karten der neuesten Ausgabe, Kapitel als Kacheln, alle Ausgaben. Bilder, PDF und „Neueste Ausgabe“ wechseln mit jeder
  Veröffentlichung; der Text bleibt allgemein. Banken werden nicht beim Namen genannt (keine Partnerschaft andeuten).
- Jede Ausgabe steht unter `/marktbriefing/<sitzung>/` im Szenen-Format (eine Aussage je Bildschirm, Kapitelliste am
  Desktop, Karten als Story) mit eigenem PDF (`marktbriefing-<sitzung>.pdf`), Titelbild, Vorschaubild und Karten-Bildern.
  Erzeugt von `products/news/briefing/www.js` (`page`, `productPage`); Verhalten `landing/marktbriefing/mb.js`, Stil `mb.css`
  (CSP der Website: kein Inline-Skript). Kopf, Menü und Fuß kommen aus `landing/news/index.html`.
- Für Suche und KI-Suche steht alles im HTML: Kurzfassung „Das Wichtigste in Kürze“ (`engine.js#summary`), JSON-LD
  (`NewsArticle` und `BreadcrumbList` je Ausgabe, `CollectionPage` auf der Produktseite), Sitemap über
  `landing/scripts/build.mjs` (`marktbriefingPages`).
- PDF im Stil des Aktienreports (`products/news/briefing/pdf.mjs`): Titelblatt „MARKTBRIEFING“, Zahlen auf einen Blick,
  Kurzfassung mit Inhalt, je Karte eine Seite, Quellen, Rückseite. Aufwand: ein Chromium-Lauf (rund 2 Minuten mit Installation),
  rund 1,5 MB je Ausgabe im Repo.
- Veröffentlichung nur auf Auslösung (Owner 22.11.2026: ob täglich, ist noch offen): `content.yml` Teil `marktbriefing` mit
  `website=ja` baut Seite, PDF und Bilder und committet `landing/marktbriefing` und den Startseiten-Teaser nach `main`;
  Cloudflare Pages baut www daraus. Der Zeitplan (Mo–Fr 23:50 UTC) rechnet das Briefing nur intern in den Datenzweig.
  Seiten und PDF versprechen kein tägliches Erscheinen.
- Startseiten-Teaser in der Region `<!--MB:teaser-->` (eigene Zeile über den Insights-Kacheln), verlinkt die Produktseite;
  Menüpunkt „Marktbriefing“ auf allen Seiten.
- Karten folgen der Hausregel: Plus neongrün, Minus in Schriftfarbe, kein Rot. Icons (Linien, `render.js#ICONS`, eine Quelle
  für Karten und Seite) stehen an Kurzfassung, Überschriften, Etiketten und Terminen, damit die Szenen weniger nach Text aussehen.

**Ausbau in Ergebnissen (je ein PR)**
1. Generator für Markt- und eigene Auswertungskarten aus den Repo-Artefakten, mit Frischeprüfung, als Seite im News-Bereich (erledigt, siehe oben).
2. Themen-Radar für Angaben Dritter: täglicher Rechercheauftrag über die Quellenliste, Prüfung von Datum und Original,
   Ergebnis als Daten-Datei, die der Generator liest.
3. Karussell und Reel jeden Abend ins Approval Center (Veröffentlichung nur nach Freigabe, wie bei Reels).
4. Lücken schließen: Sektor-ETFs, VIX; Ausblick-Termine automatisch aus den Quellen (bisher von Hand recherchiert).

