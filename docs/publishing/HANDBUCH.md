# Vision Universe Aktienmagazin – Produktionshandbuch

Stand 08.11.2026. Grundlage für ein wöchentliches Heft (Muster: [`aktienmagazin-01/`](aktienmagazin-01/README.md), 30 Seiten A4).
Ziel: jede Woche eine neue Ausgabe ohne Neugestaltung. Was je Ausgabe neu ist: Daten, Recherche, Texte, Bilder. Was gleich
bleibt: Aufbau, Design-System, Bausteine, Regeln.

## 1. Was wo liegt

| Pfad | Inhalt |
|---|---|
| `docs/publishing/aktienmagazin-01/` | Ausgabe Nr. 01 (Muster): Seiten, Daten, Bilder, PDF, Vorschau |
| `…/pages/NN-*.html` | eine Datei je Seite, in Dateinamen-Reihenfolge zusammengesetzt |
| `…/build-data.mjs` | zieht alle Kennzahlen aus den Repo-Artefakten nach `data.js` |
| `…/lib.js` | Bausteine: `VUM.box(t)` Datenkasten je Aktie, `VUM.spark`, Kopf/Fuß, Quellenverzeichnis, `VUM.k(key, fn)` für Inhalte |
| `…/charts.js` | Charts im VU-Stil: `line` (schwarze Linie, neongrüne Fläche), `hbars` (Werte in fester rechter Spalte), `vbars`, `meter` |
| `…/mag.css` | Druck-Design A4: Farben, Typo, Karten, Handy-Rahmen |
| `…/render.mjs` | setzt `magazin.html` zusammen, rendert PDF/PNG, meldet fehlende Bilder, JS-Fehler, Überlauf |
| `…/RECHERCHE.md` | Faktenblatt der Ausgabe mit Quellen (Grundlage für die Faktenprüfung) |
| `…/vorschau/index.html` | Blätter-Vorschau aller Seiten (auch als privates Artefakt veröffentlicht) |
| `…/pdf/aktienmagazin-01.pdf` | fertiges Heft |
| `brand-media/publishing/image-jobs/` | Higgsfield-Bildaufträge je Ausgabe |
| `docs/publishing/konzept-2026-11/` | erstes Konzeptmuster (5 Seiten Magazin, 5 Seiten Aktienreport AMD) |

## 2. Fester Heftaufbau (28–30 Seiten)

| Seite | Rubrik | Quelle der Inhalte |
|---|---|---|
| 01 | Cover: 1 Titelbild, Titelzeile, 4 Kurs-Pillen, Stempel mit Leitzahl, 4 Anrisse mit Bild | Titelthema + Daten |
| 02 | Editorial + Inhalt mit Bildern | Redaktion |
| 03 | Das war die Woche: 8 Meldungen mit Bild | Recherche |
| 04 | Zahlen der Woche: 12 Kacheln, eigene Zahlen mit ● markiert | Recherche + VU-Daten |
| 05–13 | Titelthema (9 Seiten): Opener, Was passiert ist, Was die Daten sagen, 5–6 Aktien im Stresstest, Einordnung/Stimmen/Termine | Recherche + VU-Daten |
| 14 | App-Seite „Investieren mit Weitblick“ (echte App-Screens) | fest |
| 15–16 | Zwei Einzelanalysen mit Anlass aus der Woche | Recherche + `VUM.box` |
| 17–18 | Berichtssaison: Gewinner und Verlierer (je 4 Karten, „Das wussten die wenigsten“) | Recherche |
| 19–20 | Hedgefonds-Radar: Fonds-Monat, Namen, Insider (Form 4), 13F | Recherche + VU-Eigentümerdaten |
| 21 | Chart der Woche (Technical-Engine) | VU-Daten |
| 22 | Screening der Woche (Regel + Tabelle) | VU-Daten |
| 23 | Markt-Radar: Regime, Sektoren, Indizes | VU-Daten |
| 24 | Konjunktur & Zinsen | Recherche |
| 25 | Deutschland & Europa | Recherche |
| 26 | Das wird die Woche (Termine Mo–Fr) | Recherche |
| 27 | Aus der App (echte Screens) | fest, Seitenverweise anpassen |
| 28 | Quick-Check 22 Aktien + Newsletter-Kasten | VU-Daten |
| 29 | Impressum, Hinweise, Quellenverzeichnis (automatisch aus `data-foot`) | fest + automatisch |
| 30 | Rückseite: App-Werbung | fest |

## 3. Design-System

- Farben: Weiß, Schwarz, Neongrün `#c8f531`, Graustufen. Plus = neongrüne Pille, Minus = schwarze Pille (auf Schwarz: weiße Pille). Keine Rot/Grün-Kurse.
- Schrift: Inter (`assets/fonts`). Logo: `docs/design/redesign-2027/img/vu-logo.png` (auf Dunkel invertiert).
- Seiten: `.page` (hell) / `.page dark`; Bild oben: `.page imgtop` + `.img` (Kopfzeile wird weiß); Vollbild: `.bleed`.
- Bausteine: `ressort`, `hx`/`mega`/`hm` (Überschriften), `sub`, `body cols2`, `card` (`ink`, `lime`, `line`), `fact`, `pill`, `stamp`, `ph` (Bild mit `cap`), `ki` (Vermerk „KI-Bild“), `phone` (Handy-Rahmen), `pi` (Produkt-Icon `<svg class="pi"><use href="#discover"/></svg>`).
- Seitenvorlage Aktie: `14-applovin.html` (Bild oben, Headline, 2 Spalten Text, `VUM.box`, unten Zitat + Faktenkasten).
- Charts nur über `charts.js`. Werte im Diagramm nie an den Balken, immer in der festen Spalte.

## 4. Wöchentlicher Ablauf (Redaktionsschluss Sonntag)

1. **Neue Ausgabe anlegen:** `aktienmagazin-01/` nach `aktienmagazin-NN/` kopieren, `img/hf-*`, `pdf/`, `vorschau/` leeren. Ausgabe-Nummer und Datum in `lib.js` (Kopf/Fuß), `render.mjs` (Titel), `01-cover.html`, `02-editorial.html`, `28-impressum.html` setzen.
2. **Daten ziehen:** in `build-data.mjs` `W0`/`W1` auf Freitag der Vor- und der aktuellen Woche setzen, Aktienliste `STOCKS` an die Themen anpassen, dann `node docs/publishing/aktienmagazin-NN/build-data.mjs`.
3. **Themen wählen:** größte Bewegungen (`data.js`: `sp500.top/flop`, `cards`), Berichtssaison, Politik. Jede Geschichte braucht einen Anlass aus der Woche.
4. **Recherche:** je Strang ein Rechercheauftrag (Titelthema, Einzelaktien, Hedgefonds/Insider, Konjunktur/Deutschland/Termine). Nur Quellen mit Datum der Woche; Widersprüche als Spanne oder weglassen. Ergebnis in `RECHERCHE.md`.
5. **Bilder:** Auftrag `brand-media/publishing/image-jobs/aktienmagazin-NN-*.json` (Qwen Image 3, 2k, ohne Text/Logos/Personen, Stil-Satz wie in Nr. 01). Muss auf `main` liegen; Workflow „Brand Media · Higgsfield Bilder“ mit `generate`, Budget und `APPROVE-HIGGSFIELD-IMAGE-JOB`. Je Gruppe ist nur ein wartender Lauf möglich, Aufträge nacheinander starten. Artefakt laden, als JPG (max. 1800 px, +20 % Helligkeit) nach `img/hf-<id>.jpg`. Fehlgeschlagene Bilder: Ersatz aus `bv-*` oder nachbestellen.
6. **Seiten schreiben:** Texte je Seite ersetzen, Kennzahlen nur über `data-k`/`VUM.k` und `VUM.C(t)`. Quellen in `data-foot` (landen automatisch im Quellenverzeichnis). Zitate mit Sprecher und Medium direkt am Zitat.
7. **Prüfen:** `node …/render.mjs --out /tmp/heft --scale 2` (0 Fehler, keine fehlenden Bilder), Seiten ansehen, Wortwahl-Suche (`grep -i -E 'kaufen|kursziel|chance|günstig|unterbewertet|signal|empfehl'`), Seitenverweise im Inhalt (S. 02) und in „Aus der App“ prüfen.
8. **Ausgeben:** PDF nach `pdf/`, Vorschau-Bilder nach `vorschau/p/`, PR mit grüner CI.
9. **Freigabe:** Veröffentlichung, Impressum und Rechtstexte brauchen die Owner-Freigabe (CLAUDE.md).

## 5. Regeln

- **Wortwahl** nach `docs/legal/WORTWAHL.md`: beschreiben statt auffordern, kein Kursziel, „Stärken/Schwächen laut Kennzahlen“, „größte Anstiege/Rückgänge“. Analystenziele nur als Angabe Dritter, besser weglassen.
- **Zahlen:** VU-Daten mit Stand; recherchierte Zahlen mit Quelle; eigene Rechnungen als solche benennen.
- **Recht** (keine Rechtsberatung): Impressum (§ 8 LPresseG BW, § 18 Abs. 2 MStV); Quelle bei wörtlichen Zitaten (§ 63 UrhG); KI-Bilder als „KI-Bild“ (Art. 50 KI-VO); Hinweis „Keine Anlageberatung“ in jeder Fußzeile; Eigenwerbung für die App ohne Anzeigen-Kennzeichnung, aber klar getrennt.
- **Bilder:** keine echten Personen, keine fremden Logos im Bild; Firmenlogos nur aus `discover/logos/files/` zur Kennzeichnung; App-Seiten nur mit echten Screens aus `docs/design/redesign-2027` (keine Screens mit persönlichen Daten).
- **Kanäle:** www.visionuniverse.de (Newsletter), Instagram und TikTok `@app.visionuniverse`. App: „bald verfügbar“.

## 6. Prüfung durch Codex und Fahrplan

Unabhängiger Prüfbericht: [`aktienmagazin-01/PRUEFBERICHT_CODEX.md`](aktienmagazin-01/PRUEFBERICHT_CODEX.md) (08.11.2026).

**Umgesetzt (Nr. 01):** Median-Fehler in `build-data.mjs` behoben (gerade Anzahl: Mittel der beiden mittleren Werte) und
`data.js` auf dem eingefrorenen Datenstand der Ausgabe neu gebaut (Commit `2d1d183`, nicht auf dem aktuellen `main`, damit
Wochenwerte und Bewertungen nicht gemischt werden); falsche Superlative, Zeiträume und Kennzahlbegriffe korrigiert (Nvidia-KGV,
Micron, Lumentum-Woche, CoreWeave −49,4 %, DraftKings bereinigtes EBITDA, Beta, Palantir „US“ und Vorjahresbasis, AppLovin
Rückkauf-Summe); Titelthema zählt sieben Aktien; Wortwahl („Größte Anstiege/Rückgänge“, „Das Detail“, kein Kapitalstrom-Schluss
im Screening, keine Paraphrase in Anführungszeichen); Sektorbild als Stichprobe mit Abdeckung; Quartals-Stichtag in jedem
Datenkasten; Haushaltsfrist entfernt; App-Screens ohne Empfehlungsnähe („Was Profis kaufen“, „zu dir passen“ entfernt);
Beispielhinweis auf der Rückseite; KI-Bild-Vermerk größer und auf dem Cover; Renderer bricht bei Fehlern mit Exit-Code 1 ab
(gewollter Anschnitt nur mit `data-bleed`).

**Fahrplan für die Wochenproduktion (aus dem Bericht, priorisiert):**

| Prio | Aufgabe | Abnahme |
|---|---|---|
| P0 | Ausgabe einfrieren: Snapshot mit Daten-Commit, Stichtagen je Produkt (Kurse, `ttmThrough`, Eigentümer, Technik), Handelsfenster aus dem Börsenkalender | Neubau einer alten Ausgabe ergibt identische Zahlen |
| P0 | Faktenregister `fakten.json` statt freiem Faktenblatt: ID, Wert, Periode, Quelle mit Titel/URL/Datum, Auszug, Status; Zitatregister mit Original und Übersetzung | Jede Kernzahl und jedes Zitat im Heft hat eine ID mit Beleg |
| P0 | Renderer-Prüftor erweitern: Kollision mit Fußzeilen, fehlende Quellen, unaufgelöste Verweise | Exit-Code ≠ 0 bei jedem Befund |
| P1 | `ausgabe.json` (Nummer, Datum, KW, Redaktionsschluss, Handelsfenster, Seitenfolge) | Kein Datum und keine Nummer mehr von Hand in Seiten |
| P1 | Vorlagen und Inhalt trennen: `system/templates/*.html` plus `ausgaben/<datum>/inhalt/*.md`; Textverweise `{{metric:NVDA.pe}}`, `{{fact:…}}`, `{{page:…}}` | Eine neue Ausgabe ändert keine Vorlage und kein Inline-CSS |
| P1 | Automatische Seitenzahlen, Inhaltsverzeichnis und Querverweise | Unbekannte Seiten-ID ist ein Build-Fehler |
| P1 | Standardumfang 24 Seiten, 30 nur bei starker Nachrichtenlage; weniger Wiederholung im Titelthema; eine statt drei App-Seiten plus Rückseite | Kein Füllinhalt |
| P1 | Lesbarkeit: größere Grundschrift, weniger Spalten; zusätzlich einspaltige HTML-Leseansicht fürs Handy; PDF mit Links und Lesezeichen | Grundschrift ≥ 9,5 pt, Lesbarkeit am Handy geprüft |
| P1 | Markt-Radar mit Veränderung zur Vorwoche; Rubrik „Was wurde aus unserem Thema?“ | |
| P2 | Bildaufträge auch vom Arbeitszweig; kuratierter Bildvorrat statt neuer Bilder für jede Kurzmeldung | Eine Ausgabe ohne Zwischen-PRs auf `main` |
| P2 | Rechtstexte aus `assets/legal-notices.json` einbinden statt Handtext; Zitatrecht, KI-Kennzeichnung und Eigenwerbung anwaltlich bestätigen | Owner-Freigabe |

Zeitziel nach P0/P1 laut Bericht: 4–6 Stunden für 24 Seiten; heute 8–14 Stunden.

## 7. Weitere offene Punkte

- Der Kerntest `core/tests/stock-availability.test.mjs` scheitert derzeit auch auf `main` (datenabhängig, nicht Publishing).
- Fremdquellen ohne URL im Faktenblatt (Liste in Abschnitt 2 des Prüfberichts) vor einer Veröffentlichung belegen oder streichen.
