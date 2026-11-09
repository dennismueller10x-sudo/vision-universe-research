# Fundamental + Screener „Verstehen. Finden.“: Bauplan für die Umsetzung

Freigegeben vom Owner am 08.11.2026: „Ok, setzen wir auch so um.“ Damit gelten auch die Empfehlungen der Folie U1 als entschieden (unten). Ziel ist die **1:1-Umsetzung** der Mockups.
Präsentation: `index.html` in diesem Ordner (lokal: `python3 -m http.server 8077` im Repo-Wurzelverzeichnis, dann `http://localhost:8077/docs/design/fundamental-screener-2026-11/`), online privat: https://claude.ai/artifact/1Vq5qbDWt1415UeUWd7cyD

Die Mockups sind HTML auf 390 × 844 px in `deck-fs.js` (Screens `f-home`, `f-stock`, `f-check`, `f-metric`, `s-home`, `s-filter`, `s-results`, `s-peek`), Stile im `<style>`-Block von `index.html` (Abschnitt `/* Fundamental + Screener */`: `.ckc`, `.ckr`, `.kts`/`.kt`, `.hr`, `.rlc`, `.lern`, `.pbr`, `.satz`, `.idc`, `.pgrid`, `.sld`; dazu aus Discover/Quant `.story`, `.ep`, `.rail`, `.rh`, `.cnd`). Werte im Mockup sind echt (`data-fs.js`, Stand 06.11.2026). Für lokale Prüfungen das Screener-Universum mit `node scripts/screener/build-universe.mjs` erzeugen (`screener/data/` ist nicht eingecheckt, nicht committen).

## Entscheidungen (getroffen, nicht neu fragen)

1. **Geändert vom Owner am 09.11.2026:** Quant- und Technical-Screener bleiben in ihren Welten (keine Weiterleitung); der Hauptscreener `/screener/` bekommt zusätzlich alle ihre Kriterien. Ursprünglicher Text: **Ein Screener**: `/screener/` ist der eine Screener. Der Quant-Screener (`/quant/#/screener`, `#/screener/profi`) und der Technical-Screener (`/technical/#/screener`) werden Einstiege mit vorgewählter Perspektive („Faktoren“ bzw. „Chart“) und leiten auf `/screener/` weiter, **sobald** `/screener/` jedes ihrer Kriterien abdeckt (per Test nachweisen; fehlt ein Kriterium, zuerst ergänzen, bis dahin bleibt der alte Einstieg). Produkt-Leisten und Menü zeigen danach überall auf `/screener/`. Gilt auch für den Quant-Umbau (siehe `docs/design/quant-2026-11/HANDOVER.md`, PR 4).
2. **Ranglisten** in Fundamental bleiben als fertige Listen (Startseite, `#/ranglisten`), technisch als festgelegter Screen (eine Regel, eine Sortierung) auf demselben Universum. Ranglisten mit eigenen Gewichten kommen später als Profi-Funktion, nicht in diesem Auftrag.
3. **Analysten**: nur Einstufungen als „Angabe Dritter“ mit Quelle und Datum, **keine Kursziele**.
4. **Checklisten** Qualität (8 Punkte), Wachstum (6), Bewertung (5) mit den Schwellen aus Folie FX07 bzw. `build-data.py` (`CHECKS`). Sie sind Screener-Vorlagen auf vorhandenen Spalten, die Zählung läuft im Browser; kein neues Daten-Artefakt. Wortwahl: „erfüllt“, „N von M Punkten“, keine Gesamtnote, kein „Check“-Name fremder Anbieter. Schwellen stehen offen in der Fundamental-Methodik.
5. **Wortwahl (Pflicht, docs/legal/WORTWAHL.md)**: „Was suchst du?“ statt „Finde Aktien, die zu dir passen“; „Erfüllt deinen Filter“ statt „Warum passt …?“; Rangliste „Niedrigste Bewertung (KGV)“ statt „Interessante Bewertungen“; gleiche Wörter bedeuten überall dieselbe Regel (z. B. „gut verdienen“ = Nettomarge über 15 % in Satz **und** fertiger Idee; die Idee „Verdienen Geld (> 0 %)“ heißt dann „Profitabel“).
6. **Fundamental-Aktie** (Perspektive „Zahlen“) im Muster von Discover und Quant: Aktienkopf + Perspektiven-Leiste, **keine zweite Leiste**; „Das Geschäft in einem Satz“ (schwarz, mit Urteil); Kennzahlen-Streifen mit sechs Zahlen (Börsenwert, Umsatz 12 M, KGV mit Markt, Nettomarge 12 M, Free Cashflow 12 M, Kapitalrendite); ein Finanz-Chart mit Umschalter Umsatz · Gewinn · Cashflow · Marge, Jahre/Quartale, „+ Vergleichen“; Checklisten-Zeilen (Tipp → Sheet); Kapitel zugeklappt (Bilanz und Schulden, Cashflow, Bewertung, In der Branche, Analysten, Dividende, Alle 60 Kennzahlen, Quellen). Das „?“ steht klein am Rand, keine schwarzen Fragezeichen-Knöpfe auf Kacheln.
7. **Kennzahl-Detail**: große Zahl, ein Reiter 3 J · 5 J · 10 J · Max · Quartale, Chart mit Chips „+ Firma“ (bis 4 Firmen überlagert), Wachstum p. a. in drei Kacheln, Branchenvergleich mit Logos, Werte je GJ mit Veränderung und Link zur Meldung. Hinweis „Volle Historie …“ nur, wenn wirklich etwas fehlt, und unten.
8. **Screener**: Satz „Zeig mir Aktien, die …“ mit den fünf häufigsten Ergänzungen und Trefferzahl je Ergänzung; fertige Ideen als Schiene (Checklisten, Wachstum zum fairen Preis = PEG ≤ 1,5 + Umsatz 3 J ≥ 10 % p. a. + Gewinn > 0, Niedrige Bewertung …); Perspektiven als 3 × 2-Raster. Filter öffnen als **Sheet** mit Regler über der Verteilung des Universums, Stufen-Chips mit Zahl, Hauptknopf „N Treffer zeigen“; Trefferzahl ändert sich **beim Schieben**. Trefferliste: eine Zeile je Aktie (Logo, Name, Satz, gesuchte Zahl als Pille), 25 je Schritt, Sortieren als Sheet, Speichern, „Treffer swipen“. Tipp auf Treffer → Vorschau-Sheet („Erfüllt deinen Filter“, Chart, drei Zahlen, Aktie öffnen · Merken · Nächster Treffer).
9. Bedien-Regeln der Folie K3 gelten für beide Produkte (eine Suche, Satz vor Zahlen, Sheets statt Seitenwechsel, Antwort sofort, eine Hauptaktion, kleines „?“, nichts springt).
10. Farben nach Redesign: Plus neongrün, Minus schwarz, kein Rot.

Weitere Lesarten entscheidet Claude nach der Präsentation, schreibt sie als einen Satz unten unter „Entscheidungen beim Bauen“ und macht weiter (CLAUDE.md, Freigaben).

## Rahmen (aus CLAUDE.md, gilt für jeden PR)

- Ein PR pro Schritt, grüne CI genügt zum Mergen. Fundamental- und Screener-Tests laufen in `.github/workflows/ci.yml`; Quant und Technical in `quant-ci.yml`/`technical-ci.yml`, falls berührt (Querschnitts-PR: jede berührte Produkt-CI grün).
- **Keine Fachmodelle ändern** außer den neuen Checklisten (PR 5, eigener PR mit Vorher/Nachher: Trefferzahl je Liste und die ersten 10 Aktien in der PR-Beschreibung). Ranglisten-Regeln bleiben, nur Namen und Darstellung ändern sich.
- **Keine generierten Artefakte anfassen** (`quant/data`, `discover/data`, `fundamental/data`, `screener/data`).
- Identität nur über `core/identity.js`, Preise nur über die vorhandenen Wege (ADR-001/002).
- Tests: `node --test "fundamental/tests/*.test.mjs" "screener/tests/*.test.mjs"`, `node --test "core/tests/*.test.mjs"`, `node scripts/quality/check-test-isolation.mjs`; Browser-Prüfung mit `scripts/screener/browser-qa.mjs`. Neue Tests: Wortwahl (keine `assets/legal-notices.json` → `wording[].avoid`-Begriffe in `fundamental/**`, `screener/**`), gleiche Regel je Begriff, Checklisten-Zählung, Weiterleitungen der alten Screener-Einstiege, Abdeckung der Kriterien vor einer Weiterleitung.
- Abnahme je Schritt: Screenshot der echten Seite auf 390 × 844 (Chromium und WebKit) neben dem Mockup; Abweichungen beheben oder unten begründen.
- Laufen Discover- oder Quant-Umbau parallel: vor jedem PR auf den neuesten `main`; gemeinsame Dateien (`assets/vu-ui.*`, `assets/site-navigation.js`, Aktienkopf, Quant-Screener) im Sinne aller Konzepte zusammenführen.

Wichtige Dateien: `fundamental/app.js`, `fundamental/app.css`, `fundamental/engine/model.js` (Router `parseRoute`, Startseiten-Reihen), `fundamental/engine/catalog.js` (60 Kennzahlen, Pfade), `fundamental/engine/compare.js`; `screener/app.js`, `screener/screener.css`, `screener/engine/*` (Felder, Abfrage, Adapter), `screener/ui/*`; `assets/site-navigation.js` (Leisten: Fundamental · Ranglisten · Branchen · Methodik; Screener · Filter · Treffer · Gespeichert); `quant/app/pages.js#screener`, `technical/app.js` (Einstiege).

## Schritte

### PR 1 · Wortwahl und Klarheit (Folie K2)
Entscheidung 5 in Fundamental und Screener; gleiche Begriffe = gleiche Regel; Wortwahl-Test.

### PR 2 · Fundamental-Aktie (Folie FX02, Screens `f-stock`, `f-check`)
Entscheidung 6. Inhalte der heutigen Unteransichten (`?ansicht=kennzahlen|branche|finanzen|dividende|analysten|bewertung|quellen|mehr`) wandern in Kapitel bzw. bleiben als Ziel der Kapitel erreichbar; alte Adressen funktionieren weiter. Checklisten-Zeilen zeigen bis PR 5 einen Platzhalter oder werden erst in PR 5 eingeblendet.

### PR 3 · Kennzahl und Vergleich (Folie FX03, Screen `f-metric`) und Fundamental-Start (Folie FX01, Screen `f-home`)
Entscheidung 7; „+ Firma“ lädt die Historie der gewählten Firmen nach. Startseite: Suche mit Firmen-Chips, Ranglisten-Schiene mit den ersten drei Plätzen, „Zahlen lesen in 30 Sekunden“ als Karten mit echtem Beispielwert, Branchen, „Selbst filtern“ → Screener. Checklisten-Schiene ab PR 5.

### PR 4 · Screener (Folien FX04–FX06, Screens `s-home`, `s-filter`, `s-results`, `s-peek`) und ein Screener
Entscheidung 8. Danach Entscheidung 1: Einstiege aus Quant und Technical mit vorgewählter Perspektive, Weiterleitung erst nach nachgewiesener Abdeckung; Leisten und Menü anpassen.

### PR 5 · Checklisten (Folie FX07)
Entscheidung 4: Definitionen als Screener-Vorlagen, Anzeige auf Fundamental-Aktie (Zeilen + Sheet), Fundamental-Start (Schiene) und Screener (fertige Ideen); Methodik-Abschnitt mit den Schwellen. Vorher/Nachher in der PR-Beschreibung.

## Entscheidungen beim Bauen

- PR 1: Satz-Bausteine und fertige Ideen stehen an einer Stelle (`screener/engine/vocab.js`, mit Wörterbuch Begriff → Regel); `core/tests/fundamental-screener-wording.test.mjs` prüft Wortwahl, Kursziel-Verbot und „ein Begriff, eine Regel“ (auch für die Fundamental-Rangliste „Profitable Unternehmen“).
- PR 1: Das gesperrte Screener-Kriterium „Abstand zum mittleren Analysten-Kursziel“ (ohne Datenquelle) entfällt mit Entscheidung 3 nicht, weil es gesperrt ist (keine Datenquelle, nie ein Wert) und die Abfrage-Gleichheit der Query-Engine es festhält; die Fundamental-Analysten zeigen nur noch Einstufungen.
- PR 1: Das Urteil je Regel heißt „erfüllt“ / „nicht erfüllt“ statt „passt“ / „passt nicht“, damit überall dasselbe Wort steht wie in „Erfüllt deinen Filter“.
- PR 2: „Kapitel zugeklappt“ heißt: acht Zeilen auf der Aktie, jede öffnet ihren Bereich unter der bisherigen Adresse (`?ansicht=finanzen&t=bilanz|cashflow`, `bewertung`, `vergleich`, `analysten`, `dividende`, `kennzahlen`, `quellen`); „Alle“ führt zu „Weitere Bereiche“ (dort auch Finanzen, Branchenvergleich, Aktie & Kapital, Unternehmensdaten).
- PR 2: Unteransichten tragen statt der zweiten Leiste einen kompakten Kopf mit „‹ Firma · Zahlen“; die Perspektiven-Leiste steht nur auf der Aktie selbst.
- PR 2: Der Aktienkopf (gemeinsamer Baustein `assets/stock-navigator.*`) behält die rote Minus-Pille (Owner-Ausnahme 06.11.2026, Discover-Test); in Fundamental selbst gibt es kein Rot.
- PR 2: Die Kopfzeile des Finanz-Charts nennt den Zeitraum ohne Anbieter („GJ 2015–2026“ statt „… · SEC“), weil Produktseiten keine Datenquellen nennen (`core/tests/legal-notices-frontend.test.mjs`); „Quellen“ heißt „Meldung je Wert, Daten als CSV“.
- PR 2: Die Checklisten-Zeilen kommen mit PR 5 (keine Platzhalter vorher); die frühere Kachelwand, „12 Jahre Umsatz“, „Entwicklung pro Jahr“ und die Knopfwolke „Mehr“ entfallen auf der Aktie (Inhalte in Finanz-Chart, Kennzahl-Detail und Kapiteln).
- PR 2: Branche im Kapitel = SIC-Hauptgruppe (wie die Branchen-Seiten), z. B. „Elektronik und Halbleiter“, mit KGV-Median dieser Gruppe.
- PR 2: Der Link „Zahlen in Quant“ bleibt als leise Zeile unter den Kapiteln (Weg zur Quant-Perspektive, von `vu3-regression-qa` geprüft).
- PR 3: „+ Firma“ schlägt die zwei größten Wettbewerber der Vergleichsgruppe vor (wie im Mockup „+ AMD“, „+ AVGO“), „+ Firma“ öffnet die Firmensuche; gewählte Firmen stehen in der Adresse (`&mit=AMD~AVGO`) und gelten für Jahreswerte, Quartale schalten sie ab.
- PR 3: Die bisherige Feinsteuerung des Kennzahl-Details (Balken/Linie, Branchenmedian/Wettbewerber, „+ Kennzahl“ mit Achsen/Index/Getrennt) bleibt vollständig, zugeklappt unter dem Chart („Darstellung, Branchenmedian, weitere Kennzahlen“); mit `&plus=` in der Adresse ist sie offen.
- PR 3: „Höchster/Tiefster Wert, Median“ stehen unter der Wertetabelle statt zwischen Chart und Wachstum; die Quelle je Wert ist ein kleines Symbol mit Datum als Beschriftung.
- PR 3: Startseite ohne Checklisten-Schiene bis PR 5; Ranglisten-Schiene ab 10 Mrd. $ Börsenwert (wie im Mockup), Reihenfolge Wachstumsführer, Profitable Unternehmen, Cashflow-Stärke, Höchste Margen, Solide Bilanzen, Niedrigste Bewertung (KGV). Die Discover-Auswahlen bleiben unter Ranglisten → Auswahlen erreichbar.
- PR 3: Der Kopf nennt „aus den Pflichtmeldungen an die US-Börsenaufsicht“ statt „an die SEC“ (keine Quellennamen auf Produktseiten).
- PR 4: Tipp auf eine Ergänzung im Satz öffnet das Filter-Sheet mit dieser Regel; der Hauptknopf „N Treffer zeigen“ führt direkt zu den Treffern. Aus der Kriterien-Bibliothek bleibt der Weg über den Satz-Bauer (Ansicht „Filter“).
- PR 4: Fertige Ideen in diesem Schritt: Wachstum zum fairen Preis (PEG ≤ 1,5 + Umsatz 3 J ≥ 10 % p. a. + Nettomarge > 0), Niedrige Bewertung (KGV < 15 + Nettomarge > 0), Wachsen stark, Profitabel, Im Aufwärtstrend; die drei Checklisten kommen mit PR 5 dazu („Alle 8“).
- PR 4: Bedingung, Eingabefeld, Zählung „ohne Angabe“, Formel und Datenherkunft eines Kriteriums stehen zugeklappt unter „Genau einstellen“; die Stufen-Chips zeigen die vorhandenen Stufen des Kriteriums (Umsatzwachstum: über 10/20/50 %), keine neuen.
- PR 4: Trefferliste = Ansicht „Liste“ (eine Zeile je Aktie, gesuchte Zahl = erste Regel); der Umschalter daneben zeigt „Karten“ (bisherige Karten mit vier Kennzahlen und „Erfüllt deinen Filter“). Kompakt und Tabelle bleiben im Sheet „Sortieren“. Nachladen nur auf Knopfdruck, 25 je Schritt.
- PR 4: „Aktie öffnen“ führt auf die eine Aktienadresse `/aktie/?t=<T>`; „Alle Zahlen und Kennzahlen im Überblick“ öffnet die bisherige Schnellansicht. „Treffer swipen“ öffnet die Vorschau des ersten Treffers, Wischen nach links/rechts blättert.
- PR 4: Ein Screener: `/screener/?p=chart|faktoren|…` wählt die Perspektive vor. Weitergeleitet wird noch nicht, weil /screener/ nicht jedes Kriterium abdeckt (Technical 24 von 83, Quant-Profi 15 von 20; Liste in `screener/tests/one-screener.test.mjs`). Technical bekommt einen sichtbaren Einstieg „Im Screener mit Perspektive Chart“; `quant/app/pages.js` ist per UI-Sperre eingefroren, den Einstieg „Faktoren“ baut der Quant-Umbau (PR 4 dort). Menü und Leisten bleiben deshalb unverändert.
- PR 4: Profi-Modus und Europa stehen als leise Zeilen unter „Deine Screens“ (statt Umschalter Einfach/Profi und Universum-Kachel oben); die Quant-Links der Startseite entfallen (Menü).
- PR 5: Die Checklisten stehen an einer Stelle (`screener/engine/checklists.js`, je Punkt Screener-Kriterium und Universum-Spalte); Fundamental lädt dieselbe Datei. „KGV ≤ 20“, „Börsenwert / Free Cashflow ≤ 20“, „PEG ≤ 1,5“ und „EV/EBITDA ≤ 12“ gelten nur bei positivem Wert (0 < x ≤ Grenze), im Screener als zwei Regeln (> 0 und ≤ Grenze); ohne Wert gilt ein Punkt als nicht erfüllt.
- PR 5: Vorher/Nachher (Universum vom 06.11.2026, 5.354 Aktien): vorher keine Checklisten; nachher Qualität 7 Treffer (NVDA, LRCX, RMD, AGI, STRL, IDCC, CWCO), Wachstum 20 (NVDA, ANET, ISRG, APH, FTNT, PWR, MELI, UI, MEDP, HEI …), Bewertung 49 (TMUS, LNG, PYPL, EXPE, LDOS, UHS, MLI, BAH, AYI, MHK …); NVIDIA 8/8 · 6/6 · 1/5. Screener-Engine und Checklisten-Zählung ergeben dieselben Treffer (`screener/tests/checklists.test.mjs`).
- Nachtrag 09.11.2026 (Owner): Quant- und Technical-Screener bleiben. `/screener/` führt jetzt jedes Technical-Kriterium im Tageschart (50 neue Kriterien in der Gruppe „Aus dem Technical-Screener“, Perspektive „Chart“; Werte aus `technical/data/screener-v1.json`, nur übernommen) und die Faktor-Abdeckung aus Quant; die vier V1-Kursbildwerte des Quant-Profi-Screeners (nur fünf Demo-Titel) sind durch das Chartbild ersetzt. Wochen- und Monatsvarianten der Technical-Kriterien bleiben im Technical-Screener (sie würden die Ladegröße fast verdoppeln). `screener/tests/one-screener.test.mjs` hält beides fest.

## Master-Prompt (in einen neuen Claude-Code-Chat einfügen)

```
Setze das freigegebene Konzept „Fundamental + Screener: Verstehen. Finden.“ vollständig und 1:1 um, alle fünf Schritte in einem Durchlauf, ohne Rückfragen.
Vorlage: docs/design/fundamental-screener-2026-11/ (HANDOVER.md, index.html, deck-fs.js, data-fs.js).
Fehlt der Ordner auf main, hole ihn vom Branch claude/keen-clarke-92odzj:
  git fetch origin claude/keen-clarke-92odzj && git checkout origin/claude/keen-clarke-92odzj -- docs/design/fundamental-screener-2026-11 docs/design/quant-2026-11/HANDOVER.md
und nimm ihn in PR 1 mit.
Lies zuerst CLAUDE.md, dann HANDOVER.md vollständig, und sieh dir die Präsentation im Browser an (Playwright, 390 × 844). Für lokale Prüfungen: node scripts/screener/build-universe.mjs (Ergebnis nicht committen).

Arbeitsweise:
- Arbeite PR 1 bis PR 5 aus HANDOVER.md der Reihe nach ab. Je Schritt ein eigener Pull Request; du darfst PRs anlegen und, sobald die CI grün ist, selbst mergen (CLAUDE.md: grüne CI genügt). Danach setzt du deinen Branch auf den neuen main und beginnst den nächsten Schritt.
- Die Entscheidungen in HANDOVER.md sind getroffen. Neue Lesarten entscheidest du nach der Präsentation, schreibst einen Satz unter „Entscheidungen beim Bauen“ und machst weiter. Stelle keine Rückfragen und warte nicht auf Freigaben.
- Keine Fachmodelle und keine Daten-Artefakte ändern; einzige neue Regel sind die Checklisten in PR 5 (mit Vorher/Nachher). Alte Screener-Einstiege erst weiterleiten, wenn /screener/ jedes ihrer Kriterien nachweislich abdeckt.
- Wird die CI rot, behebe die Ursache im selben PR (Tests nie abschalten oder überspringen). Laufen Discover- oder Quant-Umbau parallel, bring deinen Branch vor jedem PR auf den neuesten main und führe gemeinsame Dateien im Sinne aller Konzepte zusammen.
- Vor jedem Merge: Tests aus CLAUDE.md und HANDOVER.md, Browser-Prüfung in Chromium und WebKit, Screenshot der echten Seite auf 390 × 844 neben dem Mockup. Die Screenshots kommen in die PR-Beschreibung.
- Halte nur an, wenn etwas eine Owner-Freigabe nach CLAUDE.md braucht (Geld, Recht, Aussagen über Rendite oder frühere Kursverläufe, endgültiges Löschen von Daten). Das ist hier nicht zu erwarten.
- Am Ende: eine kurze Zusammenfassung je PR (Link, was fertig ist, Abweichungen vom Mockup mit Grund, offene Punkte).
```
