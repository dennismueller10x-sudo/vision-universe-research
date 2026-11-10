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
   `node products/insights/screens.mjs <artikel.json>` (Discover, Fundamental, Hedgefonds je Ticker, nach `insights/img/app/`).
4. **Bilder mit Bezug statt Symbolbild** (Owner 09.11.2026): offizielles Pressematerial des Unternehmens oder Produkts
   (Pressefotos, Artwork, Screenshots aus Presseseiten) mit Bildnachweis `quelle` („Bild: Rockstar Games“), sonst eigene
   App-Screens; KI-Bilder nur, wenn es nichts Echtes gibt (`ki: true`, Hinweis „KI-Bild“). Keine Fotos von Privatpersonen.
   Aufmacher 16:9 (1600 × 900), im Text `"bild"` je Abschnitt, Porträts mit `"stil": "portrait"`.
5. Bauen: `node products/insights/build.mjs`; Prüfung: `node --test "products/insights/tests/*.test.mjs"` (aktuell gebaut,
   Pflichtfelder, Bildnachweise, Quellen, Wortwahl, JSON-LD, Magazin-Dateien, Übersicht/Feed/Sitemap vollständig).
6. Owner sieht es sich live an; Korrekturen kommen als eigener kleiner PR. Kein KI-Hinweis am Text (Owner 10.11.2026):
   der Owner liest jeden Artikel und trägt die redaktionelle Verantwortung; KI-Bilder behalten „KI-Bild“.

**Tageslauf ohne Owner (ab 10.11.2026):** Eine geplante Aufgabe startet an jedem Werktag um 12:41 Uhr (Berlin) eine
neue Claude-Sitzung, die nach `.claude/skills/insights-tageslauf/SKILL.md` zwei Artikel schreibt (großer Wert und
Nebenwert, Kandidaten aus `node products/insights/themen.mjs`), prüft und bei grüner CI selbst veröffentlicht. Solche
Artikel tragen `"pruefung": "automatisch"` (intern: strengere Prüfregeln, z. B. drei Quellen) und erscheinen wie alle
Artikel unter „Redaktion Vision Universe“, ohne KI-Hinweis (Owner-Entscheidung 10.11.2026: der Owner liest jeden
Artikel nach, meldet Korrekturen und trägt die redaktionelle Verantwortung). Bilder nach dem Skill (Pressematerial,
Firmenwebsite, KI-Bild mit „KI-Bild“); App-Screens als Aufmacher nur als Notlösung. Lieber kein Artikel
als ein schlechter: ohne drei Quellen, bei roten Tests oder heiklen Themen bricht der Lauf ab und meldet nur.
Pausieren oder ändern: in der App unter den geplanten Aufgaben („Insights-Tageslauf“).

**Heft online stellen:** `python3 products/insights/heft_veroeffentlichen.py docs/publishing/ausgaben/<ordner> <NN>`
(PDF, verkleinerte Seitenbilder, Cover nach `insights/magazin/nr-<NN>/`), dann Eintrag mit Titel, Unterzeile und Inhalt in
`products/insights/magazin.json` (neueste zuerst) und bauen.

**Report veröffentlichen:** Report unter `reports/<id>/`, Eintrag in `products/insights/reports.json`, bauen.

Regeln wie im Heft (Abschnitt 6). Zusätzlich: Privatpersonen, gegen die nur Vorwürfe bestehen, werden nicht namentlich
genannt; Vorwürfe stehen im Konjunktiv mit Quelle, die Gegenseite kommt zu Wort.
