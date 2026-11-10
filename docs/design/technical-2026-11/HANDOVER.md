# Technical „Der Chart in drei Sätzen“: Bauplan für die Umsetzung

Freigegeben vom Owner am 09.11.2026: „Auch richtig gut geworden … damit er das genauso umsetzt im Frontend.“ Damit gelten auch die Empfehlungen der Folie U1 als entschieden (unten). Ziel ist die **1:1-Umsetzung** der Mockups.
Präsentation: `index.html` in diesem Ordner (lokal: `python3 -m http.server 8077` im Repo-Wurzelverzeichnis, dann `http://localhost:8077/docs/design/technical-2026-11/`), online privat: https://claude.ai/artifact/KNABRiU8SWHcMkLtB21BLV

Die Mockups sind HTML auf 390 × 844 px in `deck-tc.js` (Screens `c-home`, `c-chart`, `c-befund`, `c-muster`, `c-lernen`, `c-screener`), Stile im `<style>`-Block von `index.html` (Abschnitt `/* Technical */`: `.nc`, `.nc-ic`, `.mgrid`, `.mg-ic`, `.dirdot`, `.bf`, `.zt`, `.lpg`, `.lp-d`; dazu aus den anderen Konzepten `.story`, `.ep`, `.rail`, `.rh`, `.idc`, `.satz`, `.tl`, `.today`). Die Musterbilder stehen als SVG-Pfade in `deck-tc.js` (`SH`). Zahlen wie am 09.11.2026 auf /technical/ abgelesen; in der App kommen sie aus denselben Quellen wie heute.

## Entscheidungen (getroffen, nicht neu fragen)

1. **„Befund“** ist das eine Wort für alles, was die Regeln finden (heute Signale, Aktive Signale, Alle Befunde, Erkennungen, Setups). Heute gefundene heißen „Befunde heute“, frühere „Verlauf“. Das Wort „Signal“ verschwindet aus der Oberfläche (WORTWAHL.md, Plan §11), auch aus Fußtexten („Signale werden nach festen Regeln erkannt“ → „Befunde nach festen Regeln“).
2. **Richtung in Worten**: „deutet nach oben“ · „deutet nach unten“ · „Richtung offen“ statt Bullisch/Bärisch/Aufwärts/Abwärts; Plus neongrün, Minus schwarz, offen grau.
3. **Alltagssprache im Fließtext**: „200-Tage-Linie“, „50-Tage-Linie“ statt SMA; „Schwung“ statt RSI-Text (RSI-Wert im „?“); „fast doppelt so viel Handel wie üblich“ statt „Volumen 1,95× des 20-Tage-Medians“. Fachbegriffe bleiben im Chart Studio, in Indikatoren und im „?“. Durchgehend **du**.
4. **Musterbilder**: jedes Muster hat ein kleines Bild (SVG, Folie K1), gleich auf Start, Befunden, Musterseite und in Lektionen. Fehlt für ein Muster ein Bild, ein neutrales Bild verwenden und das Muster im PR nennen.
5. **Chart-Seite (Perspektive „Chart“)**: Aktienkopf + Perspektiven-Leiste; „Was der Chart sagt“ (ein Wort + Urteil); Chart 1J mit Zonen, Zeitleiste und Ebenen-Chips (Zonen · Trendlinie · 200-Tage-Linie); „Der Chart in drei Sätzen“ (Trend · Schwung · Letzter Tag, je mit Urteil); Widerstand/Unterstützung als zwei Kacheln; „Befunde heute“ (die ersten drei, Alle N); Kapitel: Alle Befunde mit Regel, Verlauf der letzten 12 Monate, Chart Studio (PRO). Ein Befund öffnet ein **Sheet** (Bild, Name, Richtung, ein Satz, Erkannt, Ungültig laut Regel, Forschungs-Link, Verlauf bei der Aktie). Die Reiter Chart · Signale · Studio werden zu Kapiteln; alte Adressen (`/signale`, `/studio`) bleiben erreichbar.
6. **Der Block „Diese Aktie in Quant und Supertrader“ entfällt** auf allen Chart-Ansichten; die Perspektiven-Leiste führt dorthin.
7. **Chart Studio** bleibt unverändert (PRO); darunter Befunde und Zonen wie auf der Chart-Seite statt „Aktive Signale“.
8. **Lernen**: Akademie und Analyse-Assistent werden ein Ort `#/lernen` (Weiter mit · 8 Lernpfade mit Fortschritt · „Eine Frage an den Chart“ als Chips, die den Screener öffnen). `#/akademie…` und `#/assistent…` leiten weiter. Akademie-Inhalte (`technical/academy/content.json`) bleiben inhaltlich unverändert, nur Darstellung und Du-Form.
9. **Ein Screener** (Entscheidung 1 in `docs/design/fundamental-screener-2026-11/HANDOVER.md`): Suche in Worten, die 13 Vorlagen und gespeicherte Screens ziehen als Perspektive „Chart“ nach `/screener/`. `/technical/#/screener…` und `#/vorlagen…` leiten erst weiter, wenn `/screener/` jedes Kriterium und die Wortsuche nachweislich abdeckt; bis dahin bleibt der Technical-Screener, im neuen Design. Fertige Suchen auf dem Technical-Start öffnen den (jeweils aktiven) Screener.
10. **Markt heute und Universumsgröße**: Bis eine gemeinsame Quelle existiert, tragen beide Zahlen Stand und Basis („34 % von 5.630 US-Aktien über der 200-Tage-Linie, Stand 06.11.“). Gibt es bereits ein gemeinsames Artefakt (z. B. `quant/data/market/intelligence/market-pulse.json`), lesen alle Welten daraus; eigener kleiner Querschnitts-PR, keine Modelländerung.
11. **„Hilft das Muster?“** bleibt mit Prozenten und dem Etikett „Forschung, nicht zertifiziert“; keine neuen Aussagen über frühere Kursverläufe.

Weitere Lesarten entscheidet Claude nach der Präsentation, schreibt sie als einen Satz unten unter „Entscheidungen beim Bauen“ und macht weiter (CLAUDE.md, Freigaben).

## Rahmen (aus CLAUDE.md, gilt für jeden PR)

- Ein PR pro Schritt, grüne CI genügt zum Mergen. Produkt-CI: `.github/workflows/technical-ci.yml` (Vertragstests `technical/tests/*.test.mjs`); Querschnitts-PRs müssen jede berührte Produkt-CI grün bekommen.
- **Keine Fachmodelle ändern**: Erkennungsregeln, Zonen, Musterzählung, Formation-Evidenz und Akademie-Inhalte bleiben. Stand und Plan: `docs/technical/TECHNICAL_WORLD_PROGRESS.md`, `docs/technical/TECHNICAL_COMPLETION_PLAN.md` (dort den Umbau als Fortschritt eintragen).
- **Keine generierten Artefakte anfassen** (`technical/data/**`, `quant/data/**`).
- Identität nur über `core/identity.js`, Preise nur über die vorhandenen Wege (ADR-001/002).
- Tests: `node --test "technical/tests/*.test.mjs"`, `node --test "core/tests/*.test.mjs"`, `node scripts/quality/check-test-isolation.mjs`. Neue Tests: Wortwahl (keine `assets/legal-notices.json` → `wording[].avoid`-Begriffe, kein „Signal“, kein „bullisch/bärisch“, kein „Sie“ in `technical/**` außer Studio/Indikator-Fachtexten), Weiterleitungen (`/signale`, `/studio`, `#/akademie`, `#/assistent`, Screener erst nach Abdeckung), Quant-/Supertrader-Block fehlt.
- Abnahme je Schritt: Screenshot der echten Seite auf 390 × 844 (Chromium und WebKit) neben dem Mockup; Abweichungen beheben oder unten begründen.
- Laufen andere Umbauten parallel (Discover, Quant, Fundamental + Screener, Supertrader): vor jedem PR auf den neuesten `main`; gemeinsame Dateien (`assets/vu-ui.*`, `assets/site-navigation.js`, Aktienkopf, Screener) im Sinne aller Konzepte zusammenführen.

Wichtige Dateien: `technical/app.js` (Ansichten `viewHome`, `viewChart`, `viewScreener`, `viewMethod`, `viewAssistant`, `viewTemplates`, Router `render`), `technical/technical.css`, `technical/engine/model.js` (`parseRoute`, `chartHref`), `technical/engine/stock-summary.js`, `technical/engine/assistant.js`, `technical/engine/templates.js`, `technical/engine/world-context.js` (Quant-/Supertrader-Block), `technical/ui/chart.js`, `technical/academy/*`, `assets/site-navigation.js` (Leiste Technical · Screener · Chart · Muster).

## Schritte

### PR 1 · Wörter (Folie K1)
Entscheidungen 1–3 in allen Technical-Ansichten und Hilfetexten; Wortwahl-Test.

### PR 2 · Start und Chart (Folien TX01–TX03, Screens `c-home`, `c-chart`, `c-befund`)
Start: Kopf, Suche (Aktie oder Satz), Firmen-Chips, Markt als Zeile (Entscheidung 10), „Heute neu im Chart“ als Karten (Logo, Pille, Musterbild, Satz, Mini-Chart, Richtung), fertige Suchen als Schiene, Muster heute als Raster, Lernen; entfällt: Zahlenkacheln mit „?“, Bestenlisten-Kacheln. Chart-Seite, Befund-Sheet und Studio nach Entscheidungen 4–7.

### PR 3 · Muster und Lernen (Folien TX04–TX05, Screens `c-muster`, `c-lernen`)
Musterseite: Reiter Muster · Indikatoren · Regeln, Raster mit Bild, Zahl und Richtung, „Hilft das Muster?“ als Liste mit Urteil (Entscheidung 11). Lernen nach Entscheidung 8.

### PR 4 · Screener (Folie TX06, Screen `c-screener`)
Entscheidung 9, abgestimmt mit dem Plan Fundamental + Screener (wer zuerst kommt, legt die Perspektive „Chart“ im gemeinsamen Screener an; Wortsuche aus `technical/app.js` als wiederverwendbaren Baustein übernehmen). Leiste: „Screener“ zeigt nach der Zusammenlegung auf `/screener/` mit Perspektive „Chart“.

### PR 5 · Markt heute und Universum (Querschnitt, klein)
Entscheidung 10.

## Entscheidungen beim Bauen

- Owner-Änderung vom 09.11.2026 (in `docs/design/fundamental-screener-2026-11/HANDOVER.md`, Entscheidung 1, auf `main`): Quant- und Technical-Screener bleiben in ihren Welten, der Hauptscreener `/screener/` führt zusätzlich alle ihre Kriterien. Damit gilt für Entscheidung 9: keine Weiterleitung von `#/screener` und `#/vorlagen`; PR 4 bringt den Technical-Screener ins neue Design und den Einstieg „Perspektive Chart“.
- PR 1: Die Engine-Namen mit „bullisch/bärisch“ (z. B. „Bullische Flagge“, Kerzenmuster-Felder) bleiben in `quant/engines/technical/*` unverändert, weil `/screener/`, die Suche in Worten und die Abfrage-Gleichheit sie festhalten; Technical übersetzt sie nur in der Anzeige (`model.js#plain`: „Flagge steigend“, „Kerzenmuster nach oben“).
- PR 1: Indikator-Befunde heißen „Kurs unter der 200-Tage-Linie“ (186,64 $ zu 204,67 $), „50-Tage-Linie über der 200-Tage-Linie“, „Schwung: zuletzt eher gefallen“ (RSI in Klammern) und „Fast doppelt so viel Handel wie üblich“; Schwellen der Worte stehen in `model.js#momentumWords`/`#volumeWords` (Darstellung, keine Regel).
- PR 1: Die Methodik verneint „Gesamtnote“ statt „Setup-Score“; der Vorlagen-Hinweis „kein Kauf- oder Verkaufssignal“ bleibt als Verneinung, weil die veröffentlichten Kurzfassungen (`stock-summary`, Daten) denselben Satz tragen.
- PR 2: Musterbilder stehen in `technical/ui/shapes.js`; die acht Pfade der Vorlage unverändert, für die übrigen 16 Formationen (Keile, Kanäle, Linien, Tasse, Kontraktion, fallende Flagge, inverse Kopf-Schulter, Ausbruch über Widerstand) und die vier Indikator-Befunde (200-Tage-Linie, Kreuzung, Schwung, Handel) eigene Formen in derselben Strichsprache; „neutral“ nur als Rückfall, derzeit ohne Verwendung.
- PR 2: „Fertige Suchen“ auf dem Start öffnen den Technical-Screener mit der Vorlage (`#/screener?vorlage=…`), weil er nach der Owner-Änderung der aktive Screener für Chart-Kriterien bleibt; die Trefferzahlen sind die der Vorlagen (542 · 832 · 59 · 108 · 151 am 06.11.).
- PR 2: „Heute neu im Chart“ nutzt die bisherige Auswahl (jüngstes Muster-Ereignis der letzten 5 Tage, ab 10 $, mit Volumen); der Satz unter der Überschrift ist allgemein („Muster, die sich zuletzt gebildet oder aufgelöst haben“), weil die Anzahl täglich wechselt; die Richtung nimmt bei Ausbrüchen deren Richtung, sonst die Lesart des Mustertyps aus der Evidenz-Datei.
- PR 2: Der Ebenen-Chip „200-Tage-Linie“ zeigt nur diese Linie (bisher „Durchschnitt“ mit 50 und 200); die Zonen-Kacheln nennen „N-mal gestoppt“ bzw. „N-mal gehalten“ (Kontakte der Zone).
- PR 2: Das Befund-Sheet zeigt im Forschungsfeld, wo vorhanden, die Evidenz des Mustertyps mit Urteil (Belegt · Kein Vorteil · Gegen die Lesart) statt nur „24 Muster mit Belegen“; Indikator-Befunde haben kein Forschungsfeld, „Ungültig laut Regel“ nur bei Formationen mit Ungültig-Marke und beim Befund zur 200-Tage-Linie (Schluss auf der anderen Seite der Linie).
- PR 2: Kapitel 1 und 2 führen auf die bisherige Adresse `#/chart/<T>/signale` (Kapitel 2 mit `?teil=verlauf`), Kapitel 3 auf `#/chart/<T>/studio`; der Verlauf ist dort eine Zeitleiste. „Datenqualität und Herkunft“ bleibt zugeklappt unter den Kapiteln (Pflichtangabe zu Kurssprüngen und eingefrorenen Kursen), im Mockup nicht gezeigt.
- PR 2: Die Lese-Engine `technical/engine/world-context.js` bleibt im Repository (Test), wird aber nicht mehr geladen (Entscheidung 6).
- PR 3: `#/lernen` ist der eine Ort; `#/akademie` und `#/assistent` (Übersichten) leiten dorthin. Lektionen (`#/akademie/<id>`) und Fragen (`#/assistent/<ziel>`) behalten ihre Adresse, weil Akademie-Inhalte, die Erfahrungs-Registry und der Audit-Vertrag sie nennen; ihre Rückwege führen nach `#/lernen`.
- PR 3: Die acht Lernpfade tragen die Anzeigenamen der Vorlage (Chart lesen, Trendfolge, Ausbrüche, Schwung, Schwankung und Risiko, Trendwechsel, Mehrere Zeitrahmen, Eigene Routine); `content.json` bleibt unverändert. Glossar und „Lokalen Fortschritt zurücksetzen“ stehen als leise Zeile unter den Lernpfaden.
- PR 3: „Eine Frage an den Chart“ zeigt alle sieben Ziele des Assistenten als Fragen (Vorlage: vier Beispiele); „Kriterien kombinieren“ bleibt über den Screener-Baukasten erreichbar. Jede Frage öffnet den Technical-Screener mit den Kriterien des Ziels (`#/screener?z=…`).
- PR 3: Die Musterseite zeigt die acht Muster der Vorlage im Raster; „Tasse mit Henkel“ und die übrigen Typen stehen unter „Regeln“ („Alle 24 Muster mit Belegen und Regeln“). „Hilft das Muster?“ zeigt vier Zeilen, belegte zuerst, dann nach Fallzahl; die große schwarze Einzelkarte und die Navigationskarten zu Indikatoren/Regeln entfallen (Reiter oben).
- PR 4: Der Technical-Screener bleibt (Owner-Änderung) und trägt das Design der Vorlage `c-screener`: Kopf „Was suchst du?“, Perspektiven-Chips Basis · Zahlen · Faktoren führen in den Hauptscreener (`/screener/?p=…`), „Chart“ ist diese Seite; Reiter Suchen · Vorlagen · Gespeichert bleiben darunter. Die Leiste „Screener“ zeigt weiter auf den Technical-Screener.
- PR 4: Die Satz-Karte nutzt die bisherige Suche in Worten (`query-text.js` unverändert); erkannte Regeln stehen in Alltagssprache („Kurs über der 200-Tage-Linie“), die Zählung „N Regeln erkannt“. „Aufwärtstrend“ allein erkennt der Parser nicht (Vorlage: „Dreieck im Aufwärtstrend“); das bleibt ein Nicht-Erkannt-Hinweis, weil ein neues Wort eine eigene Regelfestlegung wäre.
- PR 4: Filter-Chips, Baukasten, Trefferliste, Tabelle, Speichern und „Probier auch“ bleiben unter dem Hauptknopf „N Treffer zeigen“; der Satz unter dem Knopf verweist auf den Hauptscreener statt „Technical hat keinen eigenen Screener mehr“.
- PR 5: Die gemeinsame Quelle gibt es (`quant/data/market/intelligence/market-pulse.json`, Dimension BREADTH, Beleg `above200`, auch von Discover gelesen). Technical liest „Markt heute“ daraus und nennt Stand und Basis („37 % von 5.051 US-Aktien über der 200-Tage-Linie, Stand 06.11.“); fehlt der Beleg oder ist er nicht aktuell, zeigt Technical die eigene Zählung, ebenfalls mit Stand und Basis. Schnittstelle `marketPulse` in `core/registry/product-contracts.json`.
- PR 5: Quant zeigt seine Marktlage aus dem eigenen Regime-Artefakt in `quant/app/pages.js`; die Datei steht unter UI-Schutz und gehört dem laufenden Quant-Umbau (`docs/design/quant-2026-11`), der die Umstellung auf dieselbe Quelle übernimmt. Technical nennt keine nackte Universumsgröße mehr (Start ohne Zahlenkacheln, Zählungen nur mit Stichtag).
- Nachtrag 10.11.2026 (Owner-Hinweis): Die Mini-Charts der Karten „Heute neu im Chart“ nutzen den gemeinsamen Baustein `assets/vu-chart.js#sparkline` (Linie mit neongrüner Fläche und Endpunkt) wie im Konzept statt der schwarzen Einzellinie aus `technical/ui/chart.js`.

## Master-Prompt (in einen neuen Claude-Code-Chat einfügen)

```
Setze das freigegebene Technical-Konzept „Der Chart in drei Sätzen“ vollständig und 1:1 um, alle fünf Schritte in einem Durchlauf, ohne Rückfragen.
Vorlage: docs/design/technical-2026-11/ (HANDOVER.md, index.html, deck-tc.js).
Fehlt der Ordner auf main, hole ihn vom Branch claude/keen-clarke-92odzj:
  git fetch origin claude/keen-clarke-92odzj && git checkout origin/claude/keen-clarke-92odzj -- docs/design/technical-2026-11 docs/design/fundamental-screener-2026-11/HANDOVER.md
und nimm ihn in PR 1 mit.
Lies zuerst CLAUDE.md, dann HANDOVER.md vollständig, dann docs/technical/TECHNICAL_WORLD_PROGRESS.md, und sieh dir die Präsentation im Browser an (Playwright, 390 × 844).

Arbeitsweise:
- Arbeite PR 1 bis PR 5 aus HANDOVER.md der Reihe nach ab. Je Schritt ein eigener Pull Request; du darfst PRs anlegen und, sobald die CI grün ist, selbst mergen (CLAUDE.md: grüne CI genügt). Danach setzt du deinen Branch auf den neuen main und beginnst den nächsten Schritt.
- Die Entscheidungen in HANDOVER.md sind getroffen. Neue Lesarten entscheidest du nach der Präsentation, schreibst einen Satz unter „Entscheidungen beim Bauen“ und machst weiter. Stelle keine Rückfragen und warte nicht auf Freigaben.
- Keine Erkennungsregel, keine Musterzählung, keine Akademie-Inhalte und keine Daten unter technical/data oder quant/data ändern; dieser Umbau ist Oberfläche und Text. Den Technical-Screener erst weiterleiten, wenn /screener/ jedes Kriterium und die Wortsuche nachweislich abdeckt.
- Wird die CI rot, behebe die Ursache im selben PR (Tests nie abschalten oder überspringen). Laufen andere Umbauten parallel, bring deinen Branch vor jedem PR auf den neuesten main und führe gemeinsame Dateien im Sinne aller Konzepte zusammen.
- Vor jedem Merge: Tests aus CLAUDE.md und HANDOVER.md, Browser-Prüfung in Chromium und WebKit, Screenshot der echten Seite auf 390 × 844 neben dem Mockup. Die Screenshots kommen in die PR-Beschreibung.
- Halte nur an, wenn etwas eine Owner-Freigabe nach CLAUDE.md braucht (Geld, Recht, neue Aussagen über Rendite oder frühere Kursverläufe, endgültiges Löschen von Daten). Das ist hier nicht zu erwarten.
- Am Ende: eine kurze Zusammenfassung je PR (Link, was fertig ist, Abweichungen vom Mockup mit Grund, offene Punkte).
```
