# Mein Dashboard, Portfolios, AI-Atlas: Bauplan für die Umsetzung

Freigegeben vom Owner am 09.11.2026: „Okay, alles umsetzen, allerdings die Willkommensseite nicht, da lassen wir die alte, die gefällt mir besser.“ Damit gelten die Empfehlungen der Folie U1 für Portfolios und Atlas als entschieden (unten). Ziel ist die **1:1-Umsetzung** der Mockups für Mein Dashboard, Portfolios und Atlas.

**Nicht umsetzen: die Willkommensseite.** `/willkommen/` bleibt, wie sie ist. Die Folie MX01 und die Screens `w-home` und `w-story` sind verworfen; die Welt-Kacheln mit „Zahl von heute“ (U1, Frage 1) werden nicht gebaut.

Präsentation: `index.html` in diesem Ordner (lokal: `python3 -m http.server 8077` im Repo-Wurzelverzeichnis, dann `http://localhost:8077/docs/design/mein-bereich-2026-11/`), online privat: https://claude.ai/artifact/Tt79faCqfHwp9jP2oVKjc9

Die Mockups sind HTML auf 390 × 844 px in `deck-mb.js`. Umzusetzen sind die Screens `m-home` (MX02), `p-depot` (PX01), `p-home` (PX02), `a-home` (AX01), `a-screen` und `a-answer` (AX02) sowie `a-sheet` (AX03). Die Stile stehen im `<style>`-Block von `index.html` in zwei Abschnitten: `/* Mein Bereich, Portfolios, Atlas */` (`.feed`, `.fd`, `.fd-h`, `.fd-r`, `.wl`, `.ask`, `.ask-f`, `.bub`, `.ans`, `.src`) und `/* Version 2 … */` (`.alloc`, `.pz`, `.dpc`, `.dpc-h`, `.ah`, `.ask.dk`, `.cang`). Kurse und Kursreihen sind echt (`data-mb.js`, Stand 06.11.2026, erzeugt von `build-data.py`), ebenso das Atlas-Screening (14 von 5.354 US-Aktien aus `screener/data/universe-US_REAL.json`). Depotwerte wurden am 09.11.2026 auf `/portfolios/` abgelesen.

## Entscheidungen (getroffen, nicht neu fragen)

### Mein Dashboard (`/mein-dashboard/`, Screen `m-home`)
1. **Aufbau von oben nach unten:**
   - Begrüßung mit Datum.
   - Dunkler Block **„Heute bei deinen Aktien · Schluss <Datum>“** mit drei Zahlen: auf der Watchlist, neue Ereignisse, Aktien betroffen.
   - **Watchlist als waagerechter Streifen** (Logo, Ticker, Schlusskurs, Veränderung, Mini-Chart).
   - **„Was sich getan hat“**.
   - „Weiter lernen“ (nächstes ungesehenes Video, „N von M Videos gesehen“).
   - „Deine Welten“.
2. **„Was sich getan hat“:** eine Karte je Watchlist-Aktie, die heute Ereignisse hat. Kopf der Karte: Logo, Name, Kurs, Veränderung. Darunter je Ereignis eine Zeile mit Welt-Symbol, Welt, Satz und Urteil-Pille. Quellen:
   - **Technical:** neuer Befund.
   - **Quant:** Profiländerung.
   - **Supertrader:** Regel erfüllt laut Methode.
   - **Discover:** Platz in einer Reihe.
   - **Hedgefonds:** Käufe der Stars im Quartal.

   Alles wird im Browser aus den veröffentlichten Daten der Welten gelesen. Nichts wird neu gespeichert, es gibt keine neue Tabelle und keinen neuen Worker-Endpunkt. Hat eine Aktie kein Ereignis, bekommt sie keine Karte. Hat keine Aktie eines, steht dort ein Satz statt eines leeren Kastens.
3. **Watchlist:** sie kommt weiter aus `/v1/watchlist` wie heute. Anmeldung, Konto und Abo bleiben unverändert; Konten bleiben aus bis zur Freigabe.

### Portfolios (`/portfolios/`)
4. **Musterdepot-Seite** (`p-depot`, zuerst Weinstein, dann jede Supertrader- und Quant-Methode). Die Teile von oben nach unten:
   - **Dunkler Kopf:** Rückpfeil, Name, ein Satz zur Methode, **Methodenbild**, drei Zahlen (Aktien, live seit, Stand).
   - **„So ist das Depot heute verteilt“:** ein Balken je Aktie nach Modellgewicht. Kleine Anteile werden als „+N“ zusammengefasst, das Bargeld als eigenes Feld. Darunter ein Satz wie „45,2 % in 10 Aktien · 54,8 % Bargeld laut Regel“.
   - **„Seit Aufnahme“:** je Aktie Logo, Name, „aufgenommen TT.MM. · Gewicht“, ein Mini-Chart über 30 Tage und die Veränderung seit Aufnahme als Pille. Im Mini-Chart stehen der Aufnahmepunkt, die neongrüne Fläche seit Aufnahme und die gestrichelte Ungültig-Marke.
   - **„Zuletzt im Protokoll“** als Zeitleiste.
   - **Kapitel:** die Regeln der Methode und der Weg zur Methode in Supertrader bzw. Quant.

   Die große Karte mit vier Feldern je Aktie entfällt.
5. **Methodenbild je Methode** (eine kleine SVG-Funktion je Typ, mit festem Bild und ohne Fachmodell):
   - **Weinstein:** vier Phasen, Phase 2 hervorgehoben.
   - **Darvas:** Kisten.
   - **Turtle:** Kanal.
   - **Quant:** Profil.
   - **Andere Methoden:** eine schlichte Variante mit Name und Satz.
6. **Übersicht** (`p-home`). Von oben nach unten:
   - Frage „Was die Regeln gerade halten“ mit einem Satz.
   - Chips für die Gruppen (Alle, Supertrader, Quant, KI) mit Anzahl.
   - Ein dunkler Block mit den Zahlen je Gruppe und **einem** Hinweis „Wertentwicklung seit Start: erscheint, sobald belastbar.“
   - Die Depot-Karten. Jede zeigt Fachname, Name, Satz, Methodenbild, die ersten Logos, die Zahl der Aktien und „N neu“.

   Der wiederholte Hinweis auf jeder Karte entfällt.
7. **Wortwahl und Aussehen:**
   - „Einstieg/Stopp laut Methode“ wird zu **„aufgenommen“** bzw. **„Ungültig-Marke laut Methode“**.
   - „kauft/verkauft“ wird zu „nimmt auf/gibt ab“.
   - Kein Rot und Grün: Pillen schwarz bzw. neongrün wie im Redesign 2027.
   - Gemeinsame Navigation statt des eigenen Kopfes mit ☰.
8. **Keine neuen Aussagen über Rendite:** Veränderungen je Aktie seit Aufnahme und die Depotzahlen werden nur gezeigt, wo `/portfolios/` sie heute schon zeigt. Eine neue Wertentwicklung des ganzen Depots kommt nicht dazu (Owner-Freigabe nach CLAUDE.md).

### AI-Atlas (`/ask/`)
9. **Start** (`a-home`):
   - **Dunkler Kopf:** „AI ATLAS · BETA“, „Frag Vision Universe.“, ein Satz, große Eingabe mit Mikrofon und Senden, **ein** Status-Satz (zum Beispiel „Neue Fragen noch gesperrt · Antworten aus dem Archiv kostenlos“ bzw. der heutige Zustand).
   - **„Was Atlas kann“:** drei Karten, Finden (öffnet den Screener), Vergleichen (Profile und Zahlen), Erklären (mit Chart und Quelle), je mit einer Beispielfrage ohne Fachwort.
   - **„Oft gefragt“** aus dem Archiv.
   - Die Grenzen in **einem** „?“.

   Die zwei Zustände untereinander („Noch gesperrt“ und „Keine Verbindung“) und die drei Hinweisblöcke entfallen.
10. **Antworten** (`a-screen`, `a-answer`). Von oben nach unten:
    - Die Frage als Blase.
    - **„So hat Atlas übersetzt“** mit Regel-Chips.
    - Das Ergebnis:
      - Finden: „N von M US-Aktien erfüllen alle“, die ersten fünf mit der passenden Kennzahl.
      - Erklären: Zahl, Balken und Rechenweg.
    - Die Knöpfe: **„Alle N im Screener“** (über das vorhandene `screenerUrl` in `ask/engine.js`), „Regel ändern“ und „weiter fragen“.
    - Quellen-Chips mit Stand.
    - Ein Satz „keine Empfehlung“.
11. **Sheet auf jeder Aktie** (`a-sheet`): Der Atlas-Knopf im Aktienkopf öffnet ein Sheet „Atlas zu <Name>“ mit Eingabe und drei Fragen zur Aktie. Die Aktie geht als Kontext in die Frage. Der Aktienkopf ist geteilt; bei Konflikten mit anderen Umbauten im Sinne aller Konzepte zusammenführen.
12. Atlas rechnet nicht selbst. Die Übersetzung in Regeln und die Rechnung über Screener bzw. SEC-Daten bleiben, wie sie sind (`workers/vu-ask/**` nur ändern, wenn eine Antwort die Regel-Chips sonst nicht liefern kann, und dann mit Tests).

Weitere Lesarten entscheidet Claude nach der Präsentation, schreibt sie als einen Satz unter „Entscheidungen beim Bauen“ und macht weiter (CLAUDE.md, Freigaben).

## Rahmen (aus CLAUDE.md, gilt für jeden PR)

- **Ein PR pro Schritt, grüne CI genügt zum Mergen.**
  - `mein-dashboard/**` läuft in `account-ci.yml`.
  - `ask/**` und `workers/vu-ask/**` laufen in `ci.yml`.
  - Für `portfolios/**` prüfst du in `core/registry/product-contracts.json` bzw. den Workflows, welche CI auslöst. Fehlt eine, nimmst du Pfad und Tests in die passende CI auf; der Vertragstest PC muss grün bleiben.
  - Jede berührte Produkt-CI muss grün sein.
- **Keine Fachmodelle ändern:** Supertrader-Methoden, Quant-Depots, KI-Depots, Ereignis-Logik der Welten und die Atlas-Übersetzung bleiben. Dieser Umbau ist Oberfläche und Text.
- **Keine generierten Artefakte anfassen** (`quant/data/**`, `supertrader/data/**`, `discover/data/**`, `screener/data/**`). Die Seiten lesen sie nur.
- **Konten:** keine neue Speicherung, keine Migration, keine Änderung an Anmeldung, Checkout oder Abo. Mein Dashboard bleibt hinter der Anmeldung wie heute.
- Identität nur über `core/identity.js`, Preise nur über die vorhandenen Wege (ADR-001/002).
- **Tests:**
  - Bestehende Tests:
    - `node --test "core/tests/*.test.mjs"`
    - `node --test "mein-dashboard/tests/*.test.mjs" "ask/tests/*.test.mjs" "workers/vu-ask/tests/*.test.mjs"`
    - die Konto-Tests aus CLAUDE.md
    - `node scripts/quality/check-test-isolation.mjs`
  - Neue Tests:
    - Ereignis-Zusammenstellung für das Dashboard (pure Funktion, mit Fixtures: Aktie mit und ohne Ereignis, Leerzustand).
    - Methodenbild je Typ und Verteilung (Summe gleich Aktien plus Bargeld, „+N“-Zusammenfassung).
    - Wortwahl (keine `wording[].avoid`-Begriffe, kein „Einstieg“/„Stopp“ in `portfolios/**`).
    - Atlas-Antwort mit Regel-Chips und Screener-Link.
- **Abnahme je Schritt:** Screenshot der echten Seite auf 390 × 844 (Chromium und WebKit) neben dem Mockup.
  - Ganzseiten-Aufnahmen mit ausgeblendeter schwebender Produkt-Leiste machen (sie verdeckt sonst Zeilen).
  - Mein Dashboard mit simulierter Anmeldung zeigen: Konto-API im Browser per Playwright `route` abfangen, nichts senden.
- **Parallele Umbauten:** vor jedem PR auf den neuesten `main` bringen; gemeinsame Dateien (`assets/vu-ui.*`, `assets/site-navigation.js`, Aktienkopf) im Sinne aller Konzepte zusammenführen.

**Wichtige Dateien:**
- `mein-dashboard/dashboard.js`, `today.js`, `dashboard.css`
- `portfolios/portfolios.js`, `portfolios.css`. Gelesen werden `supertrader/data/portfolio.json`, `supertrader/data/registry-core.json`, `supertrader/data/ledger/*`, `quant/data/product/model-depots-v1.json` und `ki-depots-v1.json`.
- `ask/app.js`, `ask/engine.js`, `ask/ask.css`
- `assets/site-navigation.js`

## Schritte

### PR 1 · Mein Dashboard: „Heute bei deinen Aktien“ (Folie MX02, Screen `m-home`)
Entscheidungen 1–3.
### PR 2 · Portfolios: Musterdepot-Seite mit Methodenbild (Folie PX01, Screen `p-depot`)
Entscheidungen 4, 5, 7, 8.
### PR 3 · Portfolios: Übersicht (Folie PX02, Screen `p-home`)
Entscheidungen 5, 6, 7, 8.
### PR 4 · Atlas: Start und Antworten (Folien AX01–AX02, Screens `a-home`, `a-screen`, `a-answer`)
Entscheidungen 9, 10, 12.
### PR 5 · Atlas: Sheet auf jeder Aktie (Folie AX03, Screen `a-sheet`)
Entscheidung 11.

## Entscheidungen beim Bauen

(Hier je Schritt einen Satz eintragen.)

## Master-Prompt (in einen neuen Claude-Code-Chat einfügen)

```
Setze das freigegebene Konzept für Mein Dashboard, Portfolios und AI-Atlas vollständig und 1:1 um, alle fünf Schritte in einem Durchlauf, ohne Rückfragen. Die Willkommensseite (/willkommen/) bleibt unverändert; die Screens w-home und w-story werden nicht gebaut.
Vorlage: docs/design/mein-bereich-2026-11/ (HANDOVER.md, index.html, deck-mb.js, data-mb.js).
Fehlt der Ordner auf main, hole ihn vom Branch claude/keen-clarke-92odzj:
  git fetch origin claude/keen-clarke-92odzj && git checkout origin/claude/keen-clarke-92odzj -- docs/design/mein-bereich-2026-11
und nimm ihn in PR 1 mit.
Lies zuerst CLAUDE.md, dann HANDOVER.md vollständig, dann docs/legal/WORTWAHL.md und docs/accounts/NUTZERFUEHRUNG.md, und sieh dir die Präsentation im Browser an (Playwright, 390 × 844).

Arbeitsweise:
- Arbeite PR 1 bis PR 5 aus HANDOVER.md der Reihe nach ab. Je Schritt ein eigener Pull Request; du darfst PRs anlegen und, sobald die CI grün ist, selbst mergen (CLAUDE.md: grüne CI genügt). Danach setzt du deinen Branch auf den neuen main und beginnst den nächsten Schritt.
- Die Entscheidungen in HANDOVER.md sind getroffen. Neue Lesarten entscheidest du nach der Präsentation, schreibst einen Satz unter „Entscheidungen beim Bauen“ und machst weiter. Stelle keine Rückfragen und warte nicht auf Freigaben.
- Keine Fachmodelle und keine Daten unter quant/data, supertrader/data, discover/data oder screener/data ändern; dieser Umbau ist Oberfläche und Text. An Konten, Anmeldung, Checkout und Abo nichts ändern und nichts Neues speichern. Keine neue Wertentwicklung eines ganzen Depots zeigen.
- Wird die CI rot, behebe die Ursache im selben PR (Tests nie abschalten oder überspringen). Laufen andere Umbauten parallel, bring deinen Branch vor jedem PR auf den neuesten main und führe gemeinsame Dateien im Sinne aller Konzepte zusammen.
- Vor jedem Merge: Tests aus CLAUDE.md und HANDOVER.md, Browser-Prüfung in Chromium und WebKit, Screenshot der echten Seite auf 390 × 844 neben dem Mockup (schwebende Produkt-Leiste für Ganzseiten-Aufnahmen ausblenden; Mein Dashboard mit im Browser simulierter Anmeldung, nichts senden). Die Screenshots kommen in die PR-Beschreibung.
- Halte nur an, wenn etwas eine Owner-Freigabe nach CLAUDE.md braucht (Geld, Recht, neue Aussagen über Rendite oder Performance, endgültiges Löschen von Daten). Das ist hier nicht zu erwarten.
- Am Ende: eine kurze Zusammenfassung je PR (Link, was fertig ist, Abweichungen vom Mockup mit Grund, offene Punkte).
```
