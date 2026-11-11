# Quant „Ein Profil je Aktie“: Bauplan für die Umsetzung

Freigegeben vom Owner am 08.11.2026: „Ich würde es tatsächlich so genau wie in der Präsentation ist, für Quant auch komplett umsetzen wollen.“ Ziel ist die **1:1-Umsetzung** der Mockups.
Präsentation: `index.html` in diesem Ordner (lokal: `python3 -m http.server 8077` im Repo-Wurzelverzeichnis, dann `http://localhost:8077/docs/design/quant-2026-11/`), online privat: https://claude.ai/artifact/YbbeGBt8qboxcusnmp9NUj

Die Mockups sind HTML auf 390 × 844 px in `deck-quant.js` (Screens `q-*`), Stile im `<style>`-Block von `index.html` (Abschnitt `/* Quant */`: `.pf`, `.plg`, `.pr`, `.sp`, `.rc`, `.stc`, `.today`, `.mr`, `.tbl2`, `.thr`, `.cnd`, `.cmp`, `.bt`; dazu aus dem Discover-Konzept `.pc`, `.rh`, `.rail`, `.story`, `.ep`, `.rowhero`). Abstände, Schriftgrößen und Reihenfolge dort ablesen. Die Werte im Mockup sind echt (`data-quant.js`, Stand 06.11.2026); in der App kommen sie aus denselben Artefakten.

## Entscheidungen (getroffen, nicht neu fragen)

1. **Ein Wort je Eigenschaft, überall gleich** (Seiten, Chips, Tabellenköpfe, Methodik, Tests): Verdient gut (profitability), Wächst (growth), Zahlen solide (quality), Kurs läuft (momentum), Günstig (value), Ruhiger Kurs (risk), Analysten (revisions). Es sind **immer sieben**; „Analysten“ steht heute als „Keine Daten“. Kein „3 von 5 / 5 von 6 Faktoren“, keine „sechs Fragen plus eine siebte“.
2. **Profil-Baustein**: klein = sechs Säulen in der Reihenfolge oben (ohne Analysten), stark (≥ 75) neongrün mit schwarzem Rand, fehlend gestrichelt; groß = sieben Zeilen mit Balken, Stufen-Marken bei 25 · 45 · 75 · 90, Zahl, Stufe (Sehr schwach < 25 ≤ Schwach < 45 ≤ Mittel < 75 ≤ Stark < 90 ≤ Sehr stark). Gemeinsamer Baustein in `assets/vu-ui.js`/`vu-ui.css` (VUUI), damit andere Welten ihn nutzen können. **Keine Gesamtnote.**
3. **Neue Namen**: Radar → **Meldungen** (`#/meldungen`), Strategien → **Anlagestile** (`#/stile`, `#/stile/{id}`), Backtesting → **Forschung** (`#/forschung`, `#/forschung/{id}`). Alte Adressen (`#/radar`, `#/strategien…`, `#/backtest…`, auch mit Parametern) leiten weiter. Produkt-Leiste Quant: Quant · Screener · Anlagestile · Aktien · Menü (`assets/site-navigation.js`); „Screener“ zeigt nach der Zusammenlegung auf `/screener/` mit Perspektive „Faktoren“.
4. **Anlagestile**: der deutsche Satz ist der Name (Tabelle in `deck-quant.js`, `STILE`), der englische Fachname steht klein darüber. Regeln als Chips „{Eigenschaft} ab {Schwelle}“ mit Symbol. Ein Stil ohne Daten (Earnings Revision Leader) erscheint als Fußnote, nicht als Karte.
5. **Wortwahl (Pflicht, docs/legal/WORTWAHL.md)**: „Zone laut Methode“ statt Einstiegsmarke/Einstiegszone, „Ungültig-Marke laut Methode“ (kurz „Ungültig laut Methode“) statt Stopp-Marke/Stop-Loss, **keine Ziele** (Zielzone, Ziel 1, Zielbereich entfallen in der Quant-Oberfläche einschließlich Chart-Perspektive und Fußtexten; Daten bleiben unberührt), „Stärken und Schwächen laut Kennzahlen“ statt „Was spricht dafür – und was dagegen?“.
6. **Rückblick-Zahlen** („Ähnliche Lagen: 70 % von 60 Fällen später höher“) bleiben nur dort, wo sie heute schon stehen, und tragen immer das Etikett „Forschung, nicht zertifiziert“. Keine neuen Aussagen über frühere Kursverläufe hinzufügen (das wäre eine Owner-Freigabe nach CLAUDE.md).
7. **Aktienkopf in Dollar**, Euro klein daneben, Tagesbewegung in Dollar (ADR-002, gleicher Wert wie in Discover). Keine zweite Schritt-Leiste unter der Perspektiven-Leiste. Kapitel standardmäßig zugeklappt, offene merkt sich das Gerät (gleiches Muster wie das Discover-Konzept, `docs/design/discover-netflix-2026-11/`).
8. **Screener-Profi bleibt hell** (kein Wechsel ins dunkle Schema), Tabellenkopf mit Symbol und Wort bleibt beim Scrollen stehen, Zellen ≥ 75 neongrün.
9. **Fehlende Werte nie stumm**: jedes „–“ hat einen sichtbaren Grund (z. B. „Geschäftszahlen von AMD vom 27.12.2025“). Das Wort „null“ darf nirgends erscheinen.
10. Farben nach Redesign: Plus neongrün, Minus schwarz, kein Rot (auch nicht „448 verschlechtert“). Radar und Backtests verlieren das alte Design (grüne Rahmen, Verlauf, Hintergrund-Grafik).

Weitere Lesarten, die beim Bauen auftauchen, entscheidet Claude nach der Präsentation, schreibt sie als einen Satz unten unter „Entscheidungen beim Bauen“ und macht weiter (CLAUDE.md, Freigaben).

## Rahmen (aus CLAUDE.md, gilt für jeden PR)

- Ein PR pro Schritt, grüne CI genügt zum Mergen. Produkt-CI: `.github/workflows/quant-ci.yml` (Vertragstests `quant/tests/*.test.mjs`); Querschnitts-PRs (z. B. `assets/`, `core/`) müssen die CI jedes berührten Produkts grün bekommen.
- **Keine Fachmodelle ändern**: Faktor-Scores, Rangfolgen, Stil-Regeln, Setups und Backtest-Rechnungen bleiben wie sie sind. Dieser Umbau ist Oberfläche und Text.
- **Keine generierten Artefakte anfassen** (`quant/data/**`). Fehlt einer Ansicht ein Wert, zeigt sie den Grund; neue Daten sind nicht Teil dieses Auftrags.
- Identität nur über `core/identity.js`, Preise nur über die vorhandenen Wege (ADR-001/002).
- Tests: `node --test "quant/tests/*.test.mjs"`, `node --test "core/tests/*.test.mjs"`, `node scripts/quality/check-test-isolation.mjs`. Neue Tests für: Wortwahl (keine Begriffe aus `assets/legal-notices.json` → `wording[].avoid` in `quant/app/**`, gern als Erweiterung von `core/tests/legal-notices-frontend.test.mjs`), Weiterleitungen der alten Adressen, „null“ erscheint nicht, Profil-Baustein (Stufen-Grenzen, fehlende Werte).
- Abnahme je Schritt: Screenshot der echten Seite auf 390 × 844 neben dem Mockup (Playwright, Chromium und WebKit); Abweichungen beheben oder unten begründen.
- Läuft parallel der Discover-Umbau (`docs/design/discover-netflix-2026-11/HANDOVER.md`): gemeinsame Dateien (`assets/vu-ui.*`, `assets/site-navigation.js`, Aktienkopf) vor jedem PR auf den neuesten `main` bringen und Konflikte im Sinne beider Konzepte lösen.

Wichtige Dateien: `quant/app/app.js` (Router), `quant/app/ui.js` (Adressen `routes`, Bausteine), `quant/app/pages.js` (Start, Radar, Screener, Strategien, Aktien), `quant/app/page-stock.js` (Aktie, Perspektive Faktoren), `quant/app/page-tools.js` (Zahlen, Vergleich), `quant/app/page-backtest.js`, `quant/app/page-method.js`, `quant/app/page-chartbild.js` (Chart-Perspektive, Technische Lagen), `quant/app/app.css`, `quant/app/stock.css`, `assets/site-navigation.js`, `assets/vu-ui.js`/`.css`.

## Schritte

### PR 1 · Wortwahl und Fehler (Folien K2, QX08)
- Entscheidung 5 in allen Quant-Dateien (u. a. `pages.js`, `page-stock.js`, `page-tools.js`, `page-backtest.js`, `page-chartbild.js`, `chartbild.css`, `quant/ui/ti-chart.js`, Fußtext in `app.js`).
- „null“ unter Screener-Treffern und Vergleich, leere schwarze Kreise statt Symbolen (Start „Warum kann ich dem vertrauen?“, Aktie „Spricht dagegen“), „Bekannte Namen in der Liste“ auf der Stil-Seite (zeigt unbekannte Namen → „Die {N} Aktien“), Vergleich ohne Grund für „–“ (Entscheidung 9), rötliche Pille im Radar.
- Aktienkopf in Dollar (Entscheidung 7).
- Wortwahl-Test (siehe Rahmen).

### PR 2 · Profil-Baustein und Begriffe (Folie K1)
- Profil klein und groß als VUUI-Baustein (Entscheidung 2), mit Legende; Tests.
- Ein Wort je Eigenschaft überall (Entscheidung 1), auch in der Methodik (`page-method.js`: „Die sieben Eigenschaften“, die Stufenleiste in Schwarz bis Neongrün wie im Mockup).

### PR 3 · Start und Meldungen (Folien QX01–QX02, Screens `q-home`, `q-radar`)
- Start: Kopf mit dem Satz „Jede Aktie hat ein Profil aus sieben Eigenschaften …“, schwarze Karte „Heute bei Quant“ (neu in einem Anlagestil · Setups bestätigt · Risiko steigt, „Alle N Meldungen“), Markt als eine Zeile, Schiene „Neu in einem Anlagestil“ mit Profil-Postern, „Setup bestätigt“ (2 Karten, Zone/Ungültig laut Methode, Rückblick mit Etikett), Schiene Anlagestile, „So arbeitet Quant“, Vertrauen, Hinweis. Entfällt: sechs Zahlenkacheln, Pro-Kachel, fünf Navigationskarten.
- Meldungen (`#/meldungen`, Weiterleitung von `#/radar`): Chips nach Art mit Zahl, Reiter Alle · Besser · Schlechter, Liste je Tag mit einer Zeile je Aktie (Logo, Name, Meldung, Urteil), Details im Sheet beim Antippen, „Weitere N laden“ (Seitenhöhe am Anfang unter 1.200 px statt 20.813 px).

### PR 4 · Screener und Anlagestile (Folien QX03–QX04, Screens `q-screener`, `q-screener-pro`, `q-stile`, `q-stil`)
- **Nachtrag 08.11.2026 (Owner, Konzept Fundamental + Screener):** Es gibt nur noch einen Screener, `/screener/`. Der Quant-Screener wird dort die Perspektive „Faktoren“ (Profil-Säulen in den Treffern, Profi-Tabelle hell wie im Mockup). `#/screener` und `#/screener/profi` leiten erst auf `/screener/?…` mit vorgewählter Perspektive weiter, wenn `/screener/` alle Quant-Kriterien nachweislich abdeckt; bis dahin wird die Quant-Ansicht wie unten umgebaut. Abstimmung: `docs/design/fundamental-screener-2026-11/HANDOVER.md`, Entscheidung 1.
- Screener einfach: Fragen als Chips, „Deine Frage“ als neongrüne Karte mit Regel-Chips, Trefferzeile mit Profil klein und der gesuchten Zahl. Profi: hell, Bedingungen als Chips, Tabelle nach Entscheidung 8.
- Anlagestile (`#/stile`): Stil-Karten nach Entscheidung 4 mit Trefferzahl, „seit gestern +N · −N“, Logos; Forschungs-Hinweis. Stil-Seite: dunkler Kopf wie eine Discover-Reihe, „{N} von {Gesamt}“, „N neu · N raus“, Regel mit Schwellen-Balken, Liste mit Profil, NEU-Etikett für neue Treffer, „im Screener anpassen“.

### PR 5 · Aktie, Vergleich, Forschung (Folien QX05–QX07, Screens `q-stock`, `q-stock-ch`, `q-compare`, `q-backtest`)
- Aktie, Perspektive Faktoren: Kopf (Entscheidung 7), Profil groß mit Hinweis „keine Gesamtnote“, „Quant in drei Sätzen“ (Stärke, Schwäche, Zuletzt; aus den vorhandenen Faktor- und Veränderungsdaten), sechs Kapitel zugeklappt (Eigenschaften im Detail · Stärken und Schwächen laut Kennzahlen · Was hat sich bewegt · Anlagestile und Setup · Früher bei {Name} (Forschung) · Geschäftszahlen); Inhalte der heutigen Abschnitte wandern unverändert in die Kapitel. Anlagestile offen: je Stil die Bedingungen mit Haken und „Es fehlen N Punkte bei …“. Schiene „Ähnliches Profil“ (kleinster Abstand über die sechs Eigenschaften, nur Aktien mit vollständigem Profil).
- Vergleich: Chips je Aktie (bis 4), je Eigenschaft zwei Balken und zwei Zahlen, zwei Sätze, Tabelle aufklappbar, „–“ mit Grund.
- Forschung (`#/forschung`, Weiterleitung von `#/backtest`): Etikett „Forschung, nicht zertifiziert“, Stand in drei Zahlen, „Marktweit geprüft“ mit Balken um die Null und Prozentpunkten, „Sammelt noch Historie“, „Was zur Zertifizierung fehlt“.

## Entscheidungen beim Bauen

**PR 1 · Wortwahl und Fehler**
- Sätze aus den Daten, die Ziele nennen (z. B. Evidenz „erreichten Zielzone 1“), übersetzt die Oberfläche beim Anzeigen mit `QX.say` in „Marke 1 der Methode“; die Daten bleiben unberührt.
- Vorhandene Rückblick-Quoten der Chart-Perspektive („Ziel erreicht“) bleiben an ihrer Stelle und heißen „Marke 1 erreicht“; Zielbänder, Zielkacheln und das Abstandsverhältnis Ziel : Stopp entfallen ganz.
- Im Abwärtsszenario heißt die Marke über dem Kurs „Ungültig laut Methode“ (Kurzform aus Entscheidung 5), die Kartenrichtung steht weiter im Satz darunter.
- Der Aktienkopf zeigt Dollar und Tagesbewegung in Dollar; der Euro-Wert steht als „≈ 167,17 €“ unter „Schlusskurs · Datum“ (wie im Mockup rechts), umgerechnet über die vorhandene Anzeigewährung.
- Fehlende Vergleichswerte tragen „–¹“; unter der Tabelle steht je Aktie der Grund mit dem Datum ihrer Geschäftszahlen.
- Rote Töne in Quant (Pillen, Marken, Chart-Linie „ungültig“) werden schwarz bzw. grau mit schwarzem Rand.

**PR 2 · Profil-Baustein und Begriffe**
- Das eine Wort je Eigenschaft steht an der Quelle: im Wörterbuch (`quant/methodology/product-language-v1.json`, `userLabel`) und in den Anzeige-Labels der Faktor-Engine (`FACTOR_MEANING.label`, nur Text, keine Rechnung); der Fachname bleibt als `longName` (z. B. „Bilanz- & Ergebnisqualität“) in Methodik und Belegen.
- Die Anzeige-Reihenfolge folgt dem Profil (Verdient gut … Analysten, `VM.PROFILE_ORDER`); die Reihenfolge der Methodik (`FACTOR_ORDER`) bleibt für Rechnung und Daten unverändert.
- Der Hinweis unter dem großen Profil sagt „0 bis 100, 50 ist die Mitte“ statt „99 heißt besser als 99 %“, weil der Wert ein gewichtetes Mittel von Rängen ist und nicht genau der Anteil; die Position steht weiter in jeder Eigenschaft („besser als 97 % der Aktien“).
- „N von M Faktoren stark“ entfällt; Trefferzeilen im Screener tragen das kleine Profil, die Zählung heißt „N Eigenschaften stark“.

**PR 3 · Start und Meldungen**
- Die Startseite liest wie bisher nur die Projektion `radar-home-v1` (nicht den ganzen Radar); „Setup bestätigt“ zeigt deshalb die bestätigten Setups unter den sechs Karten der Projektion, „Alle N“ führt in den Screener.
- Das Urteil rechts in Meldungen: „Neu“ für Setup bestätigt, neu in einem Anlagestil, Jahreshoch und neues Muster; „Besser“/„Schlechter“ für die übrigen Richtungen; „Beobachten“ für ein entstehendes Setup und Meldungen ohne Richtung (wie im Mockup).
- Die Zahlen der Reiter „Besser · Schlechter“ zählen Aktien (Zeilen) nach ihrer ersten Meldung in der gewählten Art, nicht einzelne Ereignisse, damit Reiter und Liste dieselbe Menge zeigen.
- Ohne „Weitere laden“ stehen 8 Zeilen; die Seite misst am Anfang 1.142 px Inhalt (vorher 20.813 px). Sortierregel und Quellen stehen zugeklappt unter „Wie Meldungen entstehen und sortiert sind“.
- Der Filter „Anlagestile“ heißt in der Adresse `filter=stile`; alte Adressen mit `filter=strategien` leiten dorthin weiter.
- Chips bleiben 44 px hoch (bestehende Tippflächen-Regel der Quant-Oberfläche), im Mockup 36 px.

**PR 4 · Screener und Anlagestile**
- „Eigene Bedingung“ steht im einfachen Screener als letzter Chip hinter den sieben Fragen (das Mockup zeigt sie nicht, die Funktion bleibt); „Deine Frage“ nennt dann die gewählten Eigenschaften mit Schwelle.
- Die Methodik der Frage (Wert ab 70 gegen Position unter allen Aktien) und die Trefferzahl im Universum stehen als Hinweis unter „Im Profi-Modus verfeinern“, nicht über der Liste.
- Im Profi-Modus sind die Bedingungen Chips; Antippen öffnet den Bereichsregler im Sheet. Datenbasis, Sortierung, „Regeln teilen“ und „Regeln speichern“ stehen unter der Tabelle. Die Spalten folgen der Profil-Reihenfolge (Verdient, Wächst, Zahlen, Kurs, Ruhiger), Günstig ist über „Spalten“ zuschaltbar.
- Anlagestile heißen in der Adresse `#/stile` und `#/stile/{id}`; `#/strategien…` leitet mit Pfad weiter. Die Produkt-Leiste heißt Quant · Screener · Anlagestile · Aktien · Menü; das Menü führt zusätzlich „Meldungen“.
- Auf der Stil-Seite steht der Satz unter der Regel als „ein Wert von mindestens 70 von 100“ statt „besser als etwa 70 % der Aktien“, weil die Schwelle auf den Wert und nicht auf die Position wirkt. Die bisherige Auswertung (alle Treffer, Veränderung, „Was verhindert einen Match?“) steht vollständig unter „Mehr zu diesem Anlagestil“.
- Die Glocke im dunklen Kopf ist sichtbar, aber noch ohne Funktion („bald über Mein Bereich“), wie bisher die Melden-Karte.

**PR 5 · Aktie, Vergleich, Forschung**
- Der Kurschart bleibt auf der Aktienseite (eine Preiswahrheit, Direktlink-Prüfung), steht aber unter den sechs Kapiteln, weil das Mockup der Perspektive Faktoren oben Profil, drei Sätze und Kapitel zeigt.
- Die Kapitel nehmen die bisherigen Abschnitte unverändert auf (Eigenschaften, Stärken und Schwächen, Veränderungen, Setup und Anlagestile, Historie, Geschäftszahlen); ihr eigener Titel steht nur noch in der Kapitelzeile. „Alle“ öffnet bzw. schließt alle Kapitel; offene merkt sich das Gerät unter `vu.quant.kapitel.v1`.
- „Quant in drei Sätzen“ nimmt die stärkste und die schwächste gemessene Eigenschaft (mit Position bzw. dem ersten schwachen Treiber) und die erste Verschlechterung aus den Veränderungen; das Urteil rechts ist die Stufe bzw. „N von M schlechter“.
- „Knapp verfehlt“ heißt: genau eine Bedingung des Stils ist nicht erfüllt; „Es fehlen N Punkte bei …“ nennt die verfehlte Bedingung mit dem kleinsten Abstand.
- „Ähnliches Profil“ lädt erst, wenn der Bereich in Sichtweite kommt (Ressourcenbudget der Aktienseite); verglichen werden nur Aktien mit allen sechs Werten, Abstand ist die Summe der quadrierten Unterschiede.
- Der Vergleich nimmt die Profile aus derselben Screening-Datei wie Screener und Start; Namen über 16 Zeichen weichen dem Kürzel („AMD“). Die zwei Sätze nennen je Aktie die zwei Eigenschaften mit dem größten Vorsprung, „deutlich“ ab 20 Punkten. Die Kennzahlen-Tabelle mit den Gründen für „–“ steht aufklappbar darunter.
- Forschung (`#/forschung`, `#/backtest…` leitet weiter): Der Satz unter „Marktweit geprüft“ erklärt die Zahl als Unterschied im Anteil der Fälle, die nach 6 Monaten höher lagen (so ist sie gerechnet), nicht als durchschnittlichen Vorsprung. Die bisherige Übersicht steht vollständig unter „Was zur Zertifizierung fehlt“; einzelne Regeln behalten ihre Seite unter `#/forschung/{id}` mit dem Etikett.

## Master-Prompt (in einen neuen Claude-Code-Chat einfügen)

```
Setze das freigegebene Quant-Konzept „Ein Profil je Aktie“ vollständig und 1:1 um, alle fünf Schritte in einem Durchlauf, ohne Rückfragen.
Vorlage: docs/design/quant-2026-11/ (HANDOVER.md, index.html, deck-quant.js, data-quant.js).
Fehlt der Ordner auf main, hole ihn vom Branch claude/keen-clarke-92odzj:
  git fetch origin claude/keen-clarke-92odzj && git checkout origin/claude/keen-clarke-92odzj -- docs/design/quant-2026-11
und nimm ihn in PR 1 mit.
Lies zuerst CLAUDE.md, dann HANDOVER.md vollständig, und sieh dir die Präsentation im Browser an (Playwright, 390 × 844).

Arbeitsweise:
- Arbeite PR 1 bis PR 5 aus HANDOVER.md der Reihe nach ab. Je Schritt ein eigener Pull Request; du darfst PRs anlegen und, sobald die CI grün ist, selbst mergen (CLAUDE.md: grüne CI genügt). Danach setzt du deinen Branch auf den neuen main und beginnst den nächsten Schritt.
- Die Entscheidungen in HANDOVER.md sind getroffen. Neue Lesarten entscheidest du nach der Präsentation, schreibst einen Satz unter „Entscheidungen beim Bauen“ und machst weiter. Stelle keine Rückfragen und warte nicht auf Freigaben.
- Keine Fachmodelle und keine Daten unter quant/data ändern; dieser Umbau ist Oberfläche und Text.
- Wird die CI rot, behebe die Ursache im selben PR (Tests nie abschalten oder überspringen). Läuft parallel der Discover-Umbau, bring deinen Branch vor jedem PR auf den neuesten main und löse Konflikte in gemeinsamen Dateien im Sinne beider Konzepte.
- Vor jedem Merge: Tests aus CLAUDE.md, Browser-Prüfung in Chromium und WebKit, Screenshot der echten Seite auf 390 × 844 neben dem Mockup. Die Screenshots kommen in die PR-Beschreibung.
- Halte nur an, wenn etwas eine Owner-Freigabe nach CLAUDE.md braucht (Geld, Recht, neue Aussagen über Rendite oder frühere Kursverläufe, endgültiges Löschen von Daten). Das ist hier nicht zu erwarten.
- Am Ende: eine kurze Zusammenfassung je PR (Link, was fertig ist, Abweichungen vom Mockup mit Grund, offene Punkte).
```
