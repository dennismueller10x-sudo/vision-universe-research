# Discover „Reihe für Reihe“: Bauplan für die Umsetzung

Freigegeben vom Owner am 08.11.2026: „Ich würde das alles genauso umsetzen wollen.“ Ziel ist die **1:1-Umsetzung** der Mockups in dieser Präsentation.
Präsentation: `index.html` in diesem Ordner (lokal: `python3 -m http.server 8077` im Repo-Wurzelverzeichnis, dann `http://localhost:8077/docs/design/discover-netflix-2026-11/`), online privat: https://claude.ai/artifact/La3y9L68RsQBDoKCnuETgK

Die Mockups sind HTML auf 390 × 844 px: Startseite in `deck.js` (Screens `n-*`), Aktienseite in `deck-aktie.js` (Screens `a-*`), Stile im zweiten `<style>`-Block von `index.html` (Klassen `.pc`, `.t10`, `.rh`, `.rail`, `.bb-card`, `.ms`, `.cw`, `.sk`, `.story`, `.ep`, `.rk2`, `.nextbar`, `.rowctx`, `.endcard`). Abstände, Schriftgrößen und Reihenfolge dort ablesen. Die Bausteine `VU.*` kommen aus `docs/design/redesign-2027/lib.js`; in der App entsprechen ihnen `assets/vu-ui.js` (VUUI) und `assets/vu-chart.js` (VUChart).

## Entscheidungen (getroffen, nicht neu fragen)

1. Neue Reihe heißt **„Fallen Angels“**, Untertitel „Starke Zahlen, aber der Kurs liegt weit unter seinem Hoch.“ Regel: Mitglied in `qualitaet-wachstum`, `profitables-wachstum` oder `langfristige-compounder` **und** `distanceTo52wHigh ≤ −0,30`. Sortierung: Anzahl dieser drei Reihen absteigend, dann Abstand zum Hoch.
2. **Billboard** („Heute im Blick“) ist auch im hellen Modus schwarz.
3. Startseite: höchstens **14 Reihen**; Reihen mit neuen Treffern seit dem Vortag rücken nach oben; leere Reihen erscheinen nicht.
4. **Schaufenster-Regel** nur auf der Startseite: eine Karte erscheint nur mit Kursreihe und `return12M > −0,60`. Die Seite der Reihe zeigt weiter alle Treffer.
5. Genre-Chips „Alle · Kursbewegung · Unternehmen · Themen · Indizes · ▦“ **ersetzen** die Schnellzugriffe „Welten · Strategien · Swipen · Märkte“ (die stehen in der Produkt-Leiste; Märkte erreicht man über die Markt-Zeile).
6. Aktienseite: **Kapitel standardmäßig zugeklappt**; offene Kapitel merkt sich das Gerät.
7. Aktienkopf: **Dollar** wie an der Börse, Euro klein daneben; alle Prozentwerte in Dollar (ADR-002, eine Preiswahrheit). Keine rote Pille: Plus neongrün, Minus schwarz.
8. Leiste und Endkarte **„Weiter in …“** nur, wenn man aus einer Reihe oder vom Swipen kommt. Kein automatisches Weiterspringen.
9. Story und Kapitel nur in der Perspektive **„Überblick“** (Discover). Andere Welten behalten ihre Seiten.
10. Wortwahl nach `docs/legal/WORTWAHL.md` (Folie U3): „Stärken und Schwächen laut Kennzahlen“ statt „Was dafür spricht, was dagegen“, „Niedrigere Bewertung im Sektor“ statt „Günstiger bewertet“, „Top 10 heute · Rang nach der Regel …“, „Kennt kaum jemand“, kein „für dich“.

Weitere Lesarten, die beim Bauen auftauchen, entscheidet Claude nach der Präsentation, schreibt sie als einen Satz unten unter „Entscheidungen beim Bauen“ und macht weiter (CLAUDE.md, Freigaben).

## Rahmen (aus CLAUDE.md, gilt für jeden PR)

- Ein PR pro Schritt. Grüne CI genügt zum Mergen. Keine Owner-Freigabe nötig (kein Geld, kein Recht, keine Rendite-Aussage, kein endgültiges Löschen).
- **Budget:** `discover/(app|home|detail|themes).(js|css)` zusammen ≤ 180.000 Byte decoded und ≤ 12 Requests (`scripts/discover/browser-qa.mjs`). Neue Oberfläche gehört nach `discover/ui/v3.js` / `v3.css` (außerhalb des Budgets) oder in eigene Dateien unter `discover/ui/`, die erst bei Bedarf laden (`discover/ui/lazy.js`).
- **Daten unter `discover/data` nie von Hand ändern.** Erzeuger ist `scripts/discover/build-discover-data.mjs` (Reihen-Regeln in `discover/methodology/discover-v1.json` und den Prädikaten im Skript, z. B. `comeback` um Zeile 1124). Ändert ein PR den Erzeuger, verlangt das Reproduzierbarkeits-Gate in `discover-ci.yml` den Neubau im selben PR: mit dem Erzeuger neu bauen, nicht editieren.
- Identität nur über `core/identity.js`, Preise nur über die vorhandenen Wege (ADR-001/002).
- Tests: `node --test "discover/tests/*.test.mjs"`, `node --test "core/tests/*.test.mjs"`, `node scripts/quality/check-test-isolation.mjs`; Browser-QA wie in `.github/workflows/discover-frontend-ci.yml` (Chromium und WebKit).
- Abnahme je Schritt: Screenshot der echten Seite auf 390 × 844 (hell, und dunkel wo im Mockup gezeigt) neben dem Mockup; Abweichungen beheben oder unten begründen.

## Schritte

### PR 1 · Startseite mit Reihen (Folien DX01–DX03, Screens `n-home`, `n-home-1`, `n-home-dk`, `n-genre`)
- `discover/ui/v3.js#home` und `discover/home.js`/`index.html` (vorgerenderter Kopf, Markup gleich halten): Kopf → Genre-Chips → Billboard (dunkel, wischbar 1–5, „Aktie ansehen · Merken · ?“) → Markt-Zeile (`.ms`, Barometer-Stufe + QQQ/SPY/DIA) → Top 10 heute (`im-blick`, große Ziffern) → Schienen in der Reihenfolge von `n-home` → „Alle Reihen“-Knopf → Swipen-Karte → Hinweis.
- Neue Bausteine: Schienen-Kopf, Poster-Karte, Top-10-Karte, Themenbild (vorhanden), breite Strategie-Karte. Mini-Charts erst laden, wenn die Schiene sichtbar wird (IntersectionObserver, `discover/ui/series-loader.js`).
- Reihen kommen aus `discover/data/rows/US_REAL/{reihe}.json` (bzw. den Home-Chunks), Trefferzahl aus `coverage.matched`. Fehlt eine Reihe (z. B. Fallen Angels vor PR 4), wird sie ausgelassen.
- Genre-Chips filtern ohne Seitenwechsel (Zuordnung Reihe → Genre wie Folie DX06 „Alle Reihen“).
- Schaufenster-Regel (Entscheidung 4).
- „Zuletzt angesehen“ und „Mehr aus …“ erst in PR 3; „Alle Reihen“ als Ziel erst in PR 2 (bis dahin Knopf ausblenden).
- Tests: `discover/tests/v3.test.mjs` erweitern (Reihenfolge, Schaufenster-Regel, Genre-Filter, leere Reihe fehlt).

### PR 2 · Reihe, Vorschau, Alle Reihen (Folien DX04–DX06, Screens `n-row`, `n-row-swipe`, `n-preview`, `n-all`)
- Seite je Reihe (`#/c/US_REAL/{reihe}`): dunkler Kopf mit Etiketten, Titel, Untertitel, Logos, Trefferzahl, Stand; „Reihe swipen“ (Swipen nur mit den Aktien dieser Reihe, Fortschritt „3 von N“) und „Reihe merken“ (Glocke nur, wenn Benachrichtigungen verfügbar sind, sonst ausblenden); Box „Wie kommt eine Aktie hier rein?“ aus der Regel der Reihe (`rowConfigs[].rule` in Klartext; je Reihe ein bis zwei Sätze in der Methodik pflegen); Reiter Sortierung; Rangliste; „Ähnliche Reihen“.
- Vorschau-Sheet beim Halten (500 ms) oder über „?“ auf einem Poster: Pillen 12 Monate und heute, Chart 1 Jahr, Satz (`hook`), „Steht heute in N Reihen“ als Chips. Den Index Aktie → Reihen baut der Erzeuger (ein kleines Artefakt, z. B. `discover/data/rows/US_REAL/_membership.json`), damit keine Zusatz-Anfragen nötig sind; Neubau im selben PR.
- „Alle Reihen“ als schwarzes Vollbild, gruppiert nach Genre, mit Trefferzahl.

### PR 3 · Persönliche Reihen (Folie K1, Teile von `n-home`)
- „Zuletzt angesehen“ aus `discover/engines/memory.js#recent()` (nur auf dem Gerät).
- „Mehr aus {Thema}“: beim Ansehen einer Aktie deren Themen-IDs in `memory.js` mit ablegen; Schiene aus der Themenreihe, ohne bereits angesehene Aktien. Untertitel „Du hast zuletzt … angesehen.“ (kein „für dich“).
- NEU-Etikett: Feld `firstSeen` je Karte im Erzeuger. Regel: steht die Aktie schon in der zuletzt eingecheckten Fassung der Reihe, wird ihr `firstSeen` übernommen, sonst `firstSeen = asOf` der Daten (nie die Uhrzeit). So bleibt der Neubau reproduzierbar. NEU zeigt die Karte, wenn `firstSeen` dem letzten Handelstag entspricht. Regel 3 (Reihen mit neuen Treffern nach oben) nutzt dasselbe Feld.

### PR 4 · Neue Reihe Fallen Angels (Folie DX04)
- Regel nach Entscheidung 1 in `discover/methodology/discover-v1.json` und als Prädikat in `build-discover-data.mjs`; Genre „Kursbewegung + Unternehmen“; Methodik-Text.
- Eigener PR mit **Vorher/Nachher**: Trefferzahl und die ersten 10 Aktien in der PR-Beschreibung (Fachmodell-Regel aus CLAUDE.md). Daten mit dem Erzeuger neu bauen.
- Danach erscheint die Reihe auf der Startseite (PR 1 lässt sie bis dahin aus).

### PR 5 · Aktienseite „Überblick“ (Folien AX01–AX05, Screens `a-top`, `a-full`, `a-chapter`, `a-next`)
- `discover/ui/overview.js`, `discover/ui/stock-head.js`, `discover/ui/detail.js`, `discover/detail.js`: Aktienkopf und Perspektiven-Leiste bleiben; Kopf auf Dollar mit Euro daneben, keine rote Pille, ein Jahreswert.
- Darunter: Chart 1J + Zeitleiste → Etiketten (bester Platz aus `memberships`, Thema, Index-Gewicht, „+N Reihen“) → Story (drei Sätze mit Urteil, aus `fundamentals.story`, `jahresspanne`, `valuation`) → 7 Kapitel zugeklappt (Inhalt der heutigen Abschnitte unverändert hineinziehen) → „{Name} steht in N Reihen“ → Schienen „Mehr wie …“, „Gleiches Thema“, „Niedrigere Bewertung im Sektor“ (aus `discoverNext`) → Alle Kennzahlen PRO → Daten & Methodik → Hinweis.
- Entfällt: „Mehr zu … in anderen Welten“ (Perspektiven-Leiste), getrennte Blöcke „In einem Satz“/„Auf einen Blick“, „Platz in Ranglisten“ als Liste.
- Herkunft im Adress-Zusatz, z. B. `#/s/US_REAL/NVDA?reihe=langfristige-compounder` (auch beim Swipen setzen): dann oben Reihen-Leiste „‹ Reihe · 2 von N ›“ mit Wischen links/rechts und am Ende die Endkarte „Nächste in der Reihe“.
- Tests: `discover/tests/overview.test.mjs` erweitern (keine „dafür/dagegen“-Überschrift, ein Jahreswert, Kapitel zu, Weiter nur mit Herkunft).

## Entscheidungen beim Bauen

**PR 1 · Startseite**
- Billboard: erst die Eingangsfläche des Datenlaufs (sie trägt die Gründe für die Chips), dann die Reihe „Heute im Blick“ bis 5 Karten, weil die Eingangsfläche heute nur 2 Titel liefert; ohne Gründe zeigt die Karte den Zusatz aus `plain.zusatz` als einen Chip.
- Pillen behalten das Vorzeichen des App-Bausteins (`VUUI.chg`, „▲ +18 %“), damit Discover überall gleich zählt; das Mockup lässt es weg.
- Seitenrand bleibt 16 px wie auf allen Discover-Seiten (Mockup 18 px), Chips und Knöpfe bleiben mindestens 44 px hoch (Tippfläche der App; Mockup 34 px).
- Der Hinweis unten bleibt der geltende Text aus `meta.disclaimer`, weil ein neuer Hinweistext ein Rechtstext wäre.
- Themenschiene: die vier Themen des Mockups vorn, danach Rechenzentren, Cybersecurity, Biotechnologie, Erneuerbare Energien.
- Genre-Ansicht: Kopf mit Genre-Titel und einem Satz statt Frage und Suche (wie `n-genre`); für Kursbewegung, Themen und Indizes sind Titel und Satz im Stil von „Firmen mit starken Zahlen“ ergänzt.
- „Alle N“ führt bis PR 2 auf die bestehende Seite der Reihe (`#/strategien/{reihe}`), Themenreihen in ihre Themenwelt.
- Reihen laden ihre Datei erst 700 px vor dem sichtbaren Bereich; die Mini-Charts erst, wenn das Poster sichtbar wird.

**PR 2 · Reihe, Vorschau, Alle Reihen**
- Der Index Aktie → Reihen liegt unter `discover/data/membership/US_REAL.json` statt `rows/US_REAL/_membership.json`, weil mehrere Prüfungen jede Datei im Reihen-Ordner als Reihe lesen; er enthält alle Treffer mit Platz, nicht nur die ausgelieferten Karten (daher „Steht heute in 11 Reihen“ statt der 5 im Mockup).
- `#/strategien/{reihe}` leitet auf die Seite der Reihe `#/c/US_REAL/{reihe}`; nur „Die stärksten je Branche“ behält ihre Sektor-Ansicht.
- „Reihe merken“ merkt die Reihe auf dem Gerät (`memory.js`), gemerkte Reihen rücken auf der Startseite nach oben; die Glocke bleibt verborgen, solange das Konto keine Benachrichtigung je Reihe zustellt (`SEARCH_HITS` ist noch nicht bereit).
- Die Regel in Klartext steht je Reihe als `explain` (ein bis zwei Sätze) in `discover/methodology/discover-v1.json` und kommt über `meta.rowConfigs` auf die Seite.
- Reiter Sortierung: erste Spalte ist die Sortierung der Reihe (z. B. „3 Monate“ bei Comeback?), dann „12 Monate“ bzw. „Umsatz“ bei Geschäftszahlen-Reihen, dann „Name“.
- „Reihe swipen“ zählt die ausgelieferten Karten der Reihe („3 von 30“), nicht die Trefferzahl, weil nur diese Karten geladen sind; der Platz wird je Reihe auf dem Gerät gemerkt.
- Vorschau öffnet sich mit Halten (500 ms), Rechtsklick oder der Taste „?“ auf einem Poster; ein kurzer Tipp öffnet weiter die Aktie.
- „Ähnliche Reihen“: für Fallen Angels wie im Mockup, sonst die Reihen desselben Genres.
- „Alle Reihen“ ist eine eigene Seite `#/reihen` in Schwarz, erreichbar über ▦ und die Karte über der Swipen-Karte.

**PR 3 · Persönliche Reihen**
- `firstSeen` steht auf jeder Karte jeder Reihe; der Erzeuger liest dafür die eingecheckte Fassung (Karten und Index Aktie → Reihen) vor dem Leeren des Datenordners. Ohne frühere Fassung oder beim ersten Lauf ist `firstSeen` `null` (nicht neu), damit am Umstellungstag nicht alles NEU heißt.
- Regel 3 nutzt `meta.rows[].neu` (Karten mit `firstSeen` = Datenstand); gemerkte Reihen rücken zuerst nach oben, danach Reihen mit neuen Treffern, beide nur zwischen den Reihen-Plätzen.
- „Mehr aus {Thema}“ wählt das Thema, das unter den zuletzt angesehenen Aktien am häufigsten vorkommt (bei Gleichstand das jüngste), und lässt schon angesehene Aktien aus.
- „Zuletzt angesehen“ zeigt die Tagesbewegung aus der Aktiendatei (erst, wenn die Schiene in die Nähe kommt) und „Heute/Gestern/Di. angesehen“; einen Link „Alle“ gibt es nicht, weil es keine Seite dafür gibt.

**PR 4 · Fallen Angels**
- Regel wie Entscheidung 1 über alle Treffer der drei Reihen (nicht nur deren 30 ausgelieferte Karten wie im Regel-Entwurf der Präsentation, dort zusätzlich ohne Werte unter −75 %): heute 225 statt 33 Treffer; die Schwelle bleibt −30 %, weil die Startseite über die Schaufenster-Regel ohnehin nur Karten über −60 % in 12 Monaten zeigt und die Reihe nach Zahl der Quell-Reihen sortiert.
- Erzeuger: allgemeines Feld `memberOf` (Mitgliedschaft in anderen Reihen, je Universum einmal gerechnet) und `maxDistanceToHigh`; Sortierung erst nach Zahl der Quell-Reihen, dann `distanceTo52wHigh` aufsteigend; `verify-discover-data.mjs` prüft diese Reihenfolge mit dem Index Aktie → Reihen.
- Reiter der Reihe: „Abstand · Umsatz · Name“ wie im Mockup (Reihen mit SEC-Regel sortieren zweitens nach Umsatz).

**PR 5 · Aktienseite „Überblick“**
- Aktienkopf wie C04 (Nachbesserung 09.11.2026, nach Stichprobe des Owners): eine Zeile mit Kurs in Dollar, Tagesbewegung als Pille (neongrün oder schwarz) und rechts „Schluss …“ und Euro-Wert; der Chart des Überblicks hat keine Kursachse und nennt nur Anfangs- und Enddatum, die Zeitleiste ist die graue Pille. Die frühere Lesart (Zeitraum-Veränderung im großen Chartkopf) wich sichtbar vom Mockup ab und ist zurückgenommen; der gewählte Zeitraum steht an der Datumsachse und für Bildschirmleser im Kopf.
- „Schluss Freitag“ statt „Schluss Fr. 06.11.“: der Text kommt aus dem Frische-Vertrag der Tagesreihe (zeigt auch „nicht aktuell“), deshalb bleibt seine Wortwahl.
- Im Kopf steht ein Merken-Knopf (Herz) wie im Mockup; das zweite Lesezeichen derselben Watchlist ist im Überblick ausgeblendet.
- „Alle ›“ an „Kapitel“ (klappt alle auf), an „… steht in N Reihen“ (Alle Reihen) und „Alle N“ an „Gleiches Thema“ (Themenreihe); „Mehr wie …“ und „Niedrigere Bewertung im Sektor“ bekommen keinen „Alle“-Link, weil es dafür keine eigene Seite gibt.
- Story „Kurs“: Urteil aus dem Abstand zum Jahreshoch (ab −20 % „Schwächer“, bis −5 % „Nah am Hoch“, sonst „Dazwischen“); „Bewertung“ aus der gelieferten Stufe gegen den Marktmedian.
- Kapitel sind native `<details>` (Tastatur, Bildschirmleser); der Inhalt ist der bisherige Abschnitt ohne seine eigene Überschrift, offene Kapitel merkt sich das Gerät (`vu-discover-chapters-v1`).
- Mini-Charts der Schienen „Mehr wie …“ kommen über `core/identity.js#securityIdForTicker` aus der kanonischen Kursreihe; die Karten von `discoverNext` tragen selbst keinen Verweis.
- Aus einer Reihe: Reihen-Leiste über dem Aktienkopf (klebt oben) und die Endkarte „Nächste in der Reihe“; die zusätzliche schwebende Leiste „Weiter in …“ aus `a-full` entfällt, weil sie über dem Inhalt läge und dieselbe Aktie wie die Endkarte nennt. Posters aus Schienen der Startseite und das allgemeine Swipen setzen `?reihe=`.
- Europäische Aktien behalten den bisherigen Überblick, weil ihnen Reihen, Story-Sätze und `discoverNext` fehlen.

## Master-Prompt (in einen neuen Claude-Code-Chat einfügen)

```
Setze das freigegebene Discover-Konzept „Reihe für Reihe“ vollständig und 1:1 um, alle fünf Schritte in einem Durchlauf, ohne Rückfragen.
Vorlage: docs/design/discover-netflix-2026-11/ (HANDOVER.md, index.html, deck.js, deck-aktie.js).
Fehlt der Ordner auf main, hole ihn vom Branch claude/keen-clarke-92odzj:
  git fetch origin claude/keen-clarke-92odzj && git checkout origin/claude/keen-clarke-92odzj -- docs/design/discover-netflix-2026-11
und nimm ihn in PR 1 mit.
Lies zuerst CLAUDE.md, dann HANDOVER.md vollständig, und sieh dir die Präsentation im Browser an (Playwright, 390 × 844).

Arbeitsweise:
- Arbeite PR 1 bis PR 5 aus HANDOVER.md der Reihe nach ab. Je Schritt ein eigener Pull Request; du darfst PRs anlegen und, sobald die CI grün ist, selbst mergen (CLAUDE.md: grüne CI genügt). Danach setzt du deinen Branch auf den neuen main und beginnst den nächsten Schritt.
- Die Entscheidungen in HANDOVER.md sind getroffen. Neue Lesarten entscheidest du nach der Präsentation, schreibst einen Satz unter „Entscheidungen beim Bauen“ und machst weiter. Stelle keine Rückfragen und warte nicht auf Freigaben.
- Wird die CI rot, behebe die Ursache im selben PR (Tests nie abschalten oder überspringen). Kommt ein Datenlauf dazwischen und erzeugt Konflikte unter discover/data, baue mit dem Erzeuger neu, nie von Hand.
- Vor jedem Merge: Tests aus CLAUDE.md, Browser-QA in Chromium und WebKit, Screenshot der echten Seite auf 390 × 844 neben dem Mockup. Die Screenshots kommen in die PR-Beschreibung.
- Halte nur an, wenn etwas eine Owner-Freigabe nach CLAUDE.md braucht (Geld, Recht, Rendite-Aussagen, endgültiges Löschen von Daten). Das ist hier nicht zu erwarten.
- Am Ende: eine kurze Zusammenfassung je PR (Link, was fertig ist, Abweichungen vom Mockup mit Grund, offene Punkte).
```
