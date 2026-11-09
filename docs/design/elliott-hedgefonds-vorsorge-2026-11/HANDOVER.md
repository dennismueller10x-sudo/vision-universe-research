# Elliott, Hedgefonds, Vorsorge: Bauplan für die Umsetzung

Freigegeben vom Owner am 09.11.2026: „Ja, okay, setzen wir auch komplett so um.“ Damit gelten auch die Empfehlungen der Folie U1 als entschieden (unten). Ziel ist die **1:1-Umsetzung** der Mockups.
Präsentation: `index.html` in diesem Ordner (lokal: `python3 -m http.server 8077` im Repo-Wurzelverzeichnis, dann `http://localhost:8077/docs/design/elliott-hedgefonds-vorsorge-2026-11/`), online privat: https://claude.ai/artifact/YbXUWWugLwCpzp8v8uzBa5

Die Mockups sind HTML auf 390 × 844 px in `deck-ehv.js` (Screens `e-home`, `e-stock`, `e-none`, `h-home`, `h-investor`, `h-stock`, `v-home`, `v-etf`), Stile im `<style>`-Block von `index.html` (Abschnitt `/* Elliott, Hedgefonds, Vorsorge */`: `.face`, `.ebar`, `.er`, `.qb`, `.sc`, `.mvr`, `.mvb`, `.pp`, `.jr`, `.qm`; dazu aus den anderen Konzepten `.story`, `.ep`, `.rail`, `.rh`, `.today`, `.kt`). Elliott-Werte und UCITS-Zahlen sind echt (`data-ehv.js`), Hedgefonds- und Vorsorge-Zahlen wie am 09.11.2026 auf den Seiten abgelesen.

## Gemeinsames Muster (Folie K1)

Oben eine Frage und ein Satz, was die Welt kann und was nicht. Auf der Aktie: Kopf, Perspektiven-Leiste, „… in drei Sätzen“ mit Urteil, darunter Kapitel (zugeklappt). Jede Zahl mit Stand, bei Meldungen Dritter auch wann gemeldet. Schienen und ruhige Listen, 25 je Schritt. Fehlen Daten, sagt die Seite es (kein leerer grauer Kasten). Wortwahl nach `docs/legal/WORTWAHL.md`: keine Ziele, keine Signale, kein Rot.

## Entscheidungen (getroffen, nicht neu fragen)

### Elliott
1. **Ehrlich nach Anwendbarkeit**: Start „Wo lassen sich Wellen zählen?“ mit „Heute anwendbar: N von M Aktien“ (Feld `elliottApplicable` HIGH/MODERATE im Wellen-Index `quant/data/technical-intelligence/v3/index.json.gz` bzw. den Daten, die `elliott/app.js` heute liest) und genau diesen Aktien als Liste (Muster in Deutsch, Phase, Struktur, Richtung, Ungültig-Marke). Mustern und Strukturen geben die deutschen Namen aus `deck-ehv.js` (`PAT`, `STR`).
2. **Leiste**: „Welle 3“ wird **„Zählbar“** (Liste der anwendbaren Aktien). Alte Adresse `#/?welle=3` leitet auf die Zählbar-Liste.
3. **Aktie, zwei Fälle**: zählbar → Muster + Urteil, Chart mit Ungültig-Zone, „Die Lesart in drei Sätzen“ (Struktur · Grenze · Sicherheit), Kapitel (Wellen im Chart, andere Lesarten, Forschung); nicht zählbar → eine Karte „keine Zählung“ mit Anteil zählbarer Aktien, Link zur Chart-Lage in Technical, Link zur Zählbar-Liste.
4. Der eigene **„Technische Ausblick“ entfällt** (Marktstruktur, Schlüsselzone, Zielbereich, Szenarien); die Chart-Aussage gibt es pro Aktie nur in Technical. Keine Ziele („Zielbereich“, „Zone 1“), keine Handlungssätze („Rücklauf abwarten“).
5. **Leerzustand**: Lädt die Übersicht nicht, steht ein Satz mit Grund und Stand statt eines grauen Kastens.

### Hedgefonds
6. **Quartalsband** oben auf Start, Investor und Aktie: gezeigt (Quartal, Depots am …), gemeldet bis, nächste Meldungen. Jede Karte, die ein anderes Quartal zeigt, sagt es.
7. **„Smart Money“ → „Gruppen-Käufe“** (Leiste, Seite, Links), Untertitel „Viele Fonds, gleiche Aktie“.
8. **Investor**: Foto, Stil, Name, Depotwert mit Datum, Positionen, „Das Quartal in drei Sätzen“ (größte Position · gekauft · verkauft), Top 6 mit Balken und Veränderung, Kapitel (Depotwert im Verlauf, Käufe und Verkäufe, Werte je Quartal). Die vollständige Liste bleibt erreichbar („Alle N“).
9. **Aktie (Perspektive Investoren)**: „Investoren in drei Sätzen“ (Fonds · Bewegung · Insider), Star-Investoren (4) mit Foto, Kapitel (alle Hedgefonds, Insider, alle 13F-Melder). Zwei Zahlen nie mit demselben Wort: „Hedgefonds“ vs. „alle 13F-Melder (inkl. Banken, Versicherer, ETF-Anbieter)“.
10. **Fondsnamen aufbereiten** (z. B. „/adv“, „Inc“ in Anzeige weglassen; Rohname bleibt in Quellen).

### Vorsorge
11. **Ein Weg in drei Schritten** auf dem Start (Ziel rechnen → Planer; Sparplan bauen → ETFs/Portfolio; Auf Kurs bleiben → Veränderungen), darunter 10-Euro-Start, Beispielrechnung, Förderung, die großen Indizes. Vergleichen, Förderung, Veränderungen und Wissen bleiben erreichbar, gehören aber zu einem Schritt; die Blöcke „Wo stehst du?“ und „Mehr in Vorsorge“ entfallen.
12. **Seite je Index statt je US-Fonds** (`#/index/<id>`, z. B. `msci-world`; `#/etf/URTH` leitet weiter): „In einem Satz“, **„In der EU kaufbar“** mit Anzahl UCITS-ETFs auf den Index aus `vorsorge/data/eu/etf-eu-ucits.json` (ESMA-Register) und bis zu zwei Beispielen mit ISIN, beschriftet „Beispiele, keine Empfehlung“, Quelle und Stand; darunter der **US-Fonds als Marktabbild** mit Datum des letzten Kurses; vier Kennzahlen mit kleinem „?“; Kapitel (größte Firmen und Länder, Einordnung, Kosten, Änderungen). Welche UCITS-Beispiele je Index gezeigt werden, regelt eine kleine, offene Liste im Code (nach Fondsgröße/Bekanntheit, mit ISIN), keine Bewertung.
13. Die großen Indizes auf dem Start tragen den Hinweis „gemessen an US-Fonds als Marktabbild, Kurse bis …; kaufbar in der EU sind UCITS-ETFs auf denselben Index“.
14. Planer, Beispielrechnung und Förderung bleiben inhaltlich unverändert.
15. **Recht**: Die Nennung konkreter UCITS-Produkte ist Information, keine Empfehlung. Im PR, der sie einführt, einen Absatz für die Anwaltsmappe nach `docs/legal/EINORDNUNG.md` ergänzen (Wortlaut der Beschriftung, Quelle). Rechtstexte selbst (`assets/legal-notices.json`, Rechtsseiten) werden nicht geändert.

Weitere Lesarten entscheidet Claude nach der Präsentation, schreibt sie als einen Satz unten unter „Entscheidungen beim Bauen“ und macht weiter (CLAUDE.md, Freigaben).

## Rahmen (aus CLAUDE.md, gilt für jeden PR)

- Ein PR pro Schritt, grüne CI genügt zum Mergen. Hedgefonds und Vorsorge laufen in `.github/workflows/ci.yml` (Jobs „hedgefonds-dashboard“ und „vorsorge“); Elliott-Seiten berühren `elliott/**` (Prüfung über `ci.yml`/`shell-ci.yml` und `quant-ci.yml`, falls `quant/**` berührt wird). Jede berührte Produkt-CI muss grün sein.
- **Keine Fachmodelle ändern**: Wellen-Engine, Lesarten, 13F-Auswertung, Insider-Zählung, Vorsorge-Rechnungen und Förderregeln bleiben. Dieser Umbau ist Oberfläche und Text.
- **Keine generierten Artefakte anfassen** (`quant/data/**`, `hedgefonds/data/**`, `vorsorge/data/**`).
- Identität nur über `core/identity.js`, Preise nur über die vorhandenen Wege (ADR-001/002).
- Tests: `node --test "core/tests/*.test.mjs"`, die Tests der Produkte (`vorsorge/tests/*.test.mjs`, Hedgefonds- und Elliott-Tests, wie sie `ci.yml` aufruft), `node scripts/quality/check-test-isolation.mjs`. Neue Tests: Wortwahl (keine `wording[].avoid`-Begriffe, kein „Smart Money“, kein „Zielbereich“/„Ziel 1“ in `elliott/**`, `hedgefonds/**`, `vorsorge/**`), Weiterleitungen, Leerzustand Elliott, Quartalsband vorhanden.
- Abnahme je Schritt: Screenshot der echten Seite auf 390 × 844 (Chromium und WebKit) neben dem Mockup. **Ganzseiten-Aufnahmen mit ausgeblendeter schwebender Produkt-Leiste machen** (sie verdeckt sonst Zeilen) oder abschnittsweise prüfen.
- Laufen andere Umbauten parallel: vor jedem PR auf den neuesten `main`; gemeinsame Dateien (`assets/vu-ui.*`, `assets/site-navigation.js`, Aktienkopf) im Sinne aller Konzepte zusammenführen.

Wichtige Dateien: `elliott/app.js`, `elliott/elliott.css`, `elliott/wellen.css`, `elliott/engine/*`; `hedgefonds/app.js`, `hedgefonds/app.css`; `vorsorge/app.js`, `vorsorge/app.css`, `vorsorge/ui/*`, `vorsorge/engines/*`; `assets/site-navigation.js` (Leisten: Elliott · Welle 3 · Neu · Suche; Hedgefonds · Investoren · Aktien · Smart Money; Vorsorge · Planer · ETFs · Portfolio).

## Schritte

### PR 1 · Elliott: Wörter, Leiste, Start (Folien EX01–EX02, Screen `e-home`)
Entscheidungen 1, 2, 4 (Wörter), 5.
### PR 2 · Elliott: Aktie (Folie EX03, Screens `e-stock`, `e-none`)
Entscheidungen 3, 4.
### PR 3 · Hedgefonds: Start und Begriffe (Folien HX01–HX02, Screen `h-home`)
Entscheidungen 6, 7, 10.
### PR 4 · Hedgefonds: Investor und Aktie (Folie HX03, Screens `h-investor`, `h-stock`)
Entscheidungen 6, 8, 9.
### PR 5 · Vorsorge: Start und Weg (Folien VX01–VX02, Screen `v-home`)
Entscheidungen 11, 13, 14.
### PR 6 · Vorsorge: Seite je Index (Folie VX03, Screen `v-etf`)
Entscheidungen 12, 15.

## Entscheidungen beim Bauen

- PR 1 · Die Zählbar-Liste kommt als Block `applicable` in die Lieferansicht `elliott-home.json` (Vertrag 1.2.0, reine Auswahl aus `elliottApplicable` des Wellen-Index); Reihenfolge gut anwendbar → klare Zählung → geringe Neuzählungsgefahr → Kürzel; die Liste zeigt alle zählbaren Titel (auch Vorzugsaktien), damit „Alle N“ und der Anteil übereinstimmen.
- PR 1 · Namen in der Liste als Kurzname (Rechtsform weg, `M.shortName`), Rohname im `title`.
- PR 1 · Die Lesart-Karten unter „Neu“ und den Filtern zeigen statt der Projektionsspanne das Muster (keine Ziele, Entscheidung 4); das Filter-Sheet entfällt (Chips Welle/Richtung bleiben, Status/Rolle per Adresse), damit das Elliott-Bündel unter 64 KB bleibt.
- PR 1 · Leiste und Menü: „Zählbar“ (`#/?zaehlbar=1`); `#/?welle=3` ohne weitere Filter leitet per `replaceState` dorthin, kombinierte Welle-3-Filter bleiben.
- PR 1 · Der Kasten „Heute anwendbar“ ist fest schwarz (im Dunkelmodus Dunkelgrau mit Rand), weil `vu-box--ink` im Dunkelmodus hell wird und Neongrün darauf den Kontrast verfehlt.
- PR 2 · „Zählbar“ auf der Aktie ist dieselbe Einstufung wie auf dem Start (`applicability.level` HIGH/MODERATE ohne Enthaltung); der Chart zeigt im Elliott-Produkt nur die Ungültig-Marke der Hauptlesart (1 Jahr Wochenchart), Ziele und Schlüsselzone entfallen.
- PR 2 · Kapitel klappen an Ort und Stelle auf (`<details>`): Wellen mit Datum und Kurs, andere Zählungen und Szenarien nur mit Ungültig-Marke, Forschung = bisheriger Block „Was die Historie nahelegt“ samt Zeitreise; „Elliott-Profi“ bleibt als Knopf darunter. Die Zeile „← Elliott · Frag VU“ über dem Aktienkopf bleibt (Rückweg).
- PR 2 · Ohne geladene Startseite (Direktaufruf) holt die Aktie die kleine Lieferansicht nach, um „nur N von M Aktien“ zu nennen; fehlt sie, steht „nur wenige Aktien“.
- PR 3 · „Gruppen-Käufe“ ist die bisherige Smart-Money-Seite mit den Reitern Fonds-Einstiege (Start, `#/gruppen-kaeufe`, „Viele Fonds, gleiche Aktie“) und Insider-Käufe (`#/gruppen-kaeufe/insider`); `#/smart-money` leitet auf Insider, `#/smart-money/einstiege` auf Fonds-Einstiege. Der Untertitel auf dem Start sagt „im Quartal neu gekauft … und Käufe mehrerer Insider“ statt „in 30 Tagen“, weil Fonds-Einstiege je Quartal gezählt werden.
- PR 3 · Quartalsband: „Gemeldet bis“ ist die 45-Tage-Frist des gezeigten Quartals, „Nächste Meldungen“ die nächste Frist; Star-Karten mit anderem Meldequartal tragen „Stand Qx“. Start ohne Schnellwahl-Chips, Kacheln und „Entdecken“-Raster (Mockup); „Gekauft · Verkauft · Meistgehalten“ zeigt nur Star-Investoren (der Umschalter „Alle Hedgefonds“ bleibt unter Aktien).
- PR 3 · Fondsnamen: Rechtsform und SEC-Kürzel („/adv“, „/de/“) weg, „Capital Management“ weg, wenn danach noch zwei Wörter bleiben; der SEC-Name bleibt in der Meldung sichtbar. Stil „Value“ ohne „zu billig“ (WORTWAHL).
- PR 4 · Investor: das Quartalsband steht auch hier (Entscheidung 6, im Mockup nicht gezeichnet) und zeigt das Meldequartal des Fonds; „Gekauft“/„Verkauft“ nennen die zwei größten Bewegungen nach geschätztem Wert (nicht nach Prozent); „Alle N“ führt auf `#/fonds/<slug>/positionen`. Biografie, SEC-Meldung und Foto-Lizenz bleiben unter den Kapiteln.
- PR 4 · Aktie: „Viele/Einige/Wenige“ ab 100/20 Hedgefonds; Bewegung mit dem bisherigen Urteil (60/40-Regel); Insider-Satz aus Form 4 (90 Tage) wird nachgeladen; die Kapitel „Insider“ und „Alle 13F-Melder“ füllen sich beim Öffnen. Der Kasten „Größte Überzeugung“ und die Zeile „Komplett ausgestiegen“ entfallen (stehen im Kapitel „Alle Hedgefonds“).
- PR 5 · Der Weg (`VS.WAY` in `vorsorge/app.js`) ordnet die Bereiche: 1 Ziel rechnen (Planer, Förderung), 2 Sparplan bauen (ETFs, Portfolio, Vergleichen), 3 Auf Kurs bleiben (Veränderungen, Wissen). Auf dem Start ist Schritt 1 markiert, nach gespeichertem Plan Schritt 2; jede andere Ansicht endet mit diesem Weg statt „Mehr in Vorsorge“. Die Lage-Abfrage beim ersten Besuch und „Was hat sich geändert?“ auf dem Start entfallen (Veränderungen = Schritt 3). Das Kursdatum der großen Indizes ist das jüngste `priceDate` der drei US-Fonds.
- PR 6 · Index-Seiten für die sechs Kern-Indizes (`VS.INDEXES`: MSCI World, S&P 500, MSCI Emerging Markets, Nasdaq-100, Euro Stoxx 50, Russell 2000); gezählt werden Register-Einträge, deren Fondsname den Index und „UCITS ETF“ enthält (also auch Varianten wie ESG, daher „…-Indizes“), Beispiele je Index zwei große bekannte Fonds, gezeigt nur, wenn das Register sie führt. „In einem Satz“ beschreibt den Index (Firmen, Anteil der zehn größten); den Länderanteil nennt das Kapitel „Größte Firmen und Länder“. `#/etf/<US-Fonds>` ohne `tab` leitet auf die Index-Seite; Links mit `?tab=` (z. B. aus „Veränderungen“) und `?fonds=1` (Link „US-Fonds …“ unter Marktabbild) öffnen weiter die Fondsseite. Die vier Kennzahlen tragen ein kleines „?“ (Trefferfläche über `::after`).

## Master-Prompt (in einen neuen Claude-Code-Chat einfügen)

```
Setze das freigegebene Konzept für Elliott, Hedgefonds und Vorsorge vollständig und 1:1 um, alle sechs Schritte in einem Durchlauf, ohne Rückfragen.
Vorlage: docs/design/elliott-hedgefonds-vorsorge-2026-11/ (HANDOVER.md, index.html, deck-ehv.js, data-ehv.js).
Fehlt der Ordner auf main, hole ihn vom Branch claude/keen-clarke-92odzj:
  git fetch origin claude/keen-clarke-92odzj && git checkout origin/claude/keen-clarke-92odzj -- docs/design/elliott-hedgefonds-vorsorge-2026-11
und nimm ihn in PR 1 mit.
Lies zuerst CLAUDE.md, dann HANDOVER.md vollständig, dann docs/legal/WORTWAHL.md, und sieh dir die Präsentation im Browser an (Playwright, 390 × 844).

Arbeitsweise:
- Arbeite PR 1 bis PR 6 aus HANDOVER.md der Reihe nach ab. Je Schritt ein eigener Pull Request; du darfst PRs anlegen und, sobald die CI grün ist, selbst mergen (CLAUDE.md: grüne CI genügt). Danach setzt du deinen Branch auf den neuen main und beginnst den nächsten Schritt.
- Die Entscheidungen in HANDOVER.md sind getroffen. Neue Lesarten entscheidest du nach der Präsentation, schreibst einen Satz unter „Entscheidungen beim Bauen“ und machst weiter. Stelle keine Rückfragen und warte nicht auf Freigaben.
- Keine Fachmodelle und keine Daten unter quant/data, hedgefonds/data oder vorsorge/data ändern; dieser Umbau ist Oberfläche und Text. Rechtstexte (assets/legal-notices.json, Rechtsseiten) nicht ändern; für die UCITS-Beispiele in PR 6 nur den Absatz in docs/legal/EINORDNUNG.md ergänzen.
- Wird die CI rot, behebe die Ursache im selben PR (Tests nie abschalten oder überspringen). Laufen andere Umbauten parallel, bring deinen Branch vor jedem PR auf den neuesten main und führe gemeinsame Dateien im Sinne aller Konzepte zusammen.
- Vor jedem Merge: Tests aus CLAUDE.md und HANDOVER.md, Browser-Prüfung in Chromium und WebKit, Screenshot der echten Seite auf 390 × 844 neben dem Mockup (schwebende Produkt-Leiste für Ganzseiten-Aufnahmen ausblenden). Die Screenshots kommen in die PR-Beschreibung.
- Halte nur an, wenn etwas eine Owner-Freigabe nach CLAUDE.md braucht (Geld, Recht, neue Aussagen über Rendite oder frühere Kursverläufe, endgültiges Löschen von Daten). Das ist hier nicht zu erwarten.
- Am Ende: eine kurze Zusammenfassung je PR (Link, was fertig ist, Abweichungen vom Mockup mit Grund, offene Punkte).
```
