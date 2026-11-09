# Supertrader „Das Rezept eines Profis“: Bauplan für die Umsetzung

Freigegeben vom Owner am 09.11.2026: „Ja, okay, wir setzen Supertrader auch so um wie aus der Präsentation.“ Damit gelten auch die Empfehlungen der Folie U1 als entschieden (unten). Ziel ist die **1:1-Umsetzung** der Mockups.
Präsentation: `index.html` in diesem Ordner (lokal: `python3 -m http.server 8077` im Repo-Wurzelverzeichnis, dann `http://localhost:8077/docs/design/supertrader-2026-11/`), online privat: https://claude.ai/artifact/S8Tn3EDGAfAj2TeH3Ha9Mi

Die Mockups sind HTML auf 390 × 844 px in `deck-st.js` (Screens `t-home`, `t-methods`, `t-method`, `t-treffer`, `t-stock`, `t-haus`, `t-research`), Stile im `<style>`-Block von `index.html` (Abschnitt `/* Supertrader */`: `.stp`, `.stm`, `.mc`, `.mr2`, `.zb`, `.zb-l`, `.mt3`, `.trr`, `.tl`, `.hsg`; dazu aus den anderen Konzepten `.today`, `.story`, `.ep`, `.rowhero`, `.cnd`, `.rail`, `.rh`). Zahlen im Mockup wie am 08.11.2026 auf /supertrader/ abgelesen; in der App kommen sie aus denselben Quellen wie heute.

## Entscheidungen (getroffen, nicht neu fragen)

1. **Eine Ablauf-Leiste, zwei Fragen** (Folie K1). Erkennen: **Muster erkannt · Regel erfüllt · Plan fertig** (heute Bild passt/Stufe 1 · Regel bestätigt/Stufe 2 · Durchgerechnet/Stufe 3/Kurz vor der Marke). Musterdepot: **Wartet · Aufgenommen · Im Musterdepot · Abgegeben** (heute Muster entsteht · Marke erreicht/Modell steigt ein · Modell ist dabei · Abgeschlossen/Ausstieg); „Geplatzt“ heißt **Muster zerfallen**. Die Wörter gelten auf allen Seiten, im Protokoll, in Filtern und in Hilfetexten. Die Zustände dahinter bleiben unverändert, nur Namen und Darstellung ändern sich.
2. **Ein Name je Methode** nach „Trader · Muster“, Tabelle Folie K3 (z. B. „Minervini · VCP“, „Turtle · 20 Tage“, „Kullamägi · Breakout“, „Morales & Kacher · Buyable Gap-Up“). Technische Namen (`strategy_name`, „VU Adaptation – …“) stehen nur noch in Methodik und Quellen. Die fünf Musterdepots tragen den Namen ihrer Methode mit Etikett „Musterdepot“. Die Modelle der heutigen Reihe „Weitere 7“ erscheinen als „Weitere Modelle in der Forschung“.
3. **Neue Namen**: „Signale“ → **Treffer** (`/supertrader/treffer/`), „Backtests“ → **Forschung** (`/supertrader/forschung/`). Alte Adressen leiten weiter (auch mit Parametern wie `?method=`). Produkt-Leiste: Supertrader · Methoden · Treffer · Forschung · Menü (`assets/site-navigation.js`, Eintrag `supertrader`; Zuordnung `signals`/`stock` → `treffer`, `backtests` → `forschung`).
4. **Wortwahl (Pflicht, docs/legal/WORTWAHL.md, Plan §11)** nach Folie SX08: Stop/Luft bis zum Stop → Ungültig-Marke laut Methode/Abstand zur Ungültig-Marke; Einstieg/Eingestiegen wird → Zone laut Methode/Musterdepot nimmt auf; Ausstieg → Musterdepot gibt ab; Risiko je Kauf → Anteil je Aufnahme im Musterdepot; „Einstiegschancen“ entfällt; „ob die Strategie den Markt schlägt“ → „wie die Regel im Vergleich zum S&P 500 läuft“. Kein Wort „Signal“ in der Oberfläche.
5. **Farben**: Plus neongrün, Minus schwarz, **kein Rot** (auch Protokoll-Ergebnisse).
6. **Pilot-Backtest** (Turtle/Donchian auf Wochenschlüssen, −37,8 % gegenüber S&P 500) wandert von der Forschungs-Hauptseite in einen eigenen Eintrag „Älterer Pilot“, **Inhalt und Zahlen unverändert**. Keine neuen Aussagen über Rendite oder frühere Kursverläufe hinzufügen (Owner-Freigabe nach CLAUDE.md).
7. **Aktie (Perspektive „Methoden“)** im Muster der anderen Welten: Aktienkopf + Perspektiven-Leiste, „Supertrader in drei Sätzen“ (Heute · Musterdepot · Zuletzt), alle 13 Methoden mit Mini-Leiste, Protokoll als Zeitleiste. Die Kacheln „Ausbruch 0 von 4 · Trend 0 von 4 · Lücke 1 von 5“ entfallen.
8. **Treffer-Seite**: Chips nach Schritt (Im Musterdepot · Plan fertig · Abgegeben) und Methode, Leiste einmal oben mit aktivem Schritt, je Aktie Ungültig-Marke · Aufnahme · Schluss mit Legende, 25 je Schritt.
9. **Gate A**: Supertrader-PRs enthalten nur Supertrader-Pfade. Die Ablauf-Leiste und andere neue Bausteine liegen deshalb unter `supertrader/assets/`. Einzige Ausnahme ist die Produkt-Leiste in `assets/site-navigation.js` (Entscheidung 3): dafür ein eigener, kleiner Querschnitts-PR (Core-CI und Supertrader-CI grün).
10. **Keine Fachänderung**: keine Regel, kein Musterdepot, kein Kandidaten-Tageslauf, kein Veröffentlichungsvertrag (C1–C7) ändert sich.

Weitere Lesarten entscheidet Claude nach der Präsentation, schreibt sie als einen Satz unten unter „Entscheidungen beim Bauen“ und macht weiter (CLAUDE.md, Freigaben).

## Rahmen (aus CLAUDE.md und docs/SUPERTRADER_9_HANDOVER.md, gilt für jeden PR)

- Ein PR pro Schritt, grüne CI genügt zum Mergen. Produkt-CI: `.github/workflows/supertrader-ci.yml` (Vertragstests `scripts/supertrader/tests/*.test.mjs`); Gate-A-Bericht `node scripts/supertrader/guard-protected-paths.mjs --base origin/main`.
- **Erzeugte Seiten nie von Hand ändern**: Methoden- und Aktienseiten (`supertrader/strategies/<slug>/index.html`, `supertrader/stock/<T>/index.html`) schreibt `scripts/supertrader/build.mjs`. Vorlagen dort ändern und im selben PR mit dem Erzeuger neu bauen. `supertrader/data/**` gehört dem Erzeuger (`core/registry/domains.json`) und wird nicht angefasst.
- Lies vor dem ersten PR `docs/SUPERTRADER_9_HANDOVER.md` §0 und `docs/SUPERTRADER_9_DAILY_OPERATIONS.md` (Veröffentlichungsvertrag), damit kein Umbau den Kandidaten-Tageslauf bricht.
- Tests: `node --test "scripts/supertrader/tests/*.test.mjs"`, `node --test "core/tests/*.test.mjs"`, `node scripts/quality/check-test-isolation.mjs`, Browser-Prüfung `node scripts/supertrader/browser-qa.mjs` (und `sf8-visual-qa.mjs`, wo betroffen). Neue Tests: Wortwahl (keine `assets/legal-notices.json` → `wording[].avoid`-Begriffe und kein „Signal“ in `supertrader/**` außer Methodik-Zitaten), ein Name je Methode (Tabelle K3), Ablauf-Wörter, Weiterleitungen, kein Rot.
- Abnahme je Schritt: Screenshot der echten Seite auf 390 × 844 (Chromium und WebKit) neben dem Mockup; Abweichungen beheben oder unten begründen.
- Laufen andere Umbauten parallel (Discover, Quant, Fundamental + Screener): vor jedem PR auf den neuesten `main`; den Aktienkopf und die Perspektiven-Leiste nicht in Supertrader nachbauen, sondern den gemeinsamen Stand nutzen.

Wichtige Dateien: `supertrader/index.html`, `supertrader/assets/st-redesign.js` und `st-redesign.css`, `supertrader/assets/supertrader.css`, `supertrader/signals/index.html`, `supertrader/backtests/index.html`, `supertrader/hausstrategie/index.html`, `supertrader/strategies/index.html`, `supertrader/sources/index.html`, `supertrader/beispiel/index.html`, Vorlagen in `scripts/supertrader/build.mjs`.

## Schritte

### PR 1 · Wortwahl und Farben (Folien K2, SX08)
Entscheidungen 4 und 5 auf allen Supertrader-Seiten und in den Vorlagen von `build.mjs` (Neubau der erzeugten Seiten im selben PR); Wortwahl-Test.

### PR 2 · Namen und Ablauf (Folien K1, K3)
Entscheidungen 1 und 2: Namens-Zuordnung als eine Datei unter `supertrader/assets/` (z. B. `method-names.js`), Ablauf-Leiste (groß und mini) als Baustein unter `supertrader/assets/`; alle Seiten und Vorlagen nutzen beides.

### PR 3 · Start, Methoden, Methode (Folien SX01–SX03, Screens `t-home`, `t-methods`, `t-method`)
Start: Kopf mit Satz und Etikett Forschung, schwarze „Heute“-Karte mit beiden Leisten, Schiene der 13 Methoden, „Plan fertig“ als Liste mit Abstand zur Zone, „So läuft ein Durchgang“, Hausstrategie, Forschung, Hinweis. Methoden: Suche, Chips (Alle · Mit Musterdepot · Stil), eine Zeile je Methode, Forschungsmodelle als Fußnote. Methode (Vorlage in `build.mjs`): dunkler Kopf, „So denkt die Methode“ in drei Schritten, Musterdepot gerade mit Leiste und Zonenleiste, Protokoll in drei Zahlen, „Wie nah an der Originalregel?“, Belastbarkeit, Kapitel.

### PR 4 · Treffer, Aktie, Hausstrategie, Forschung (Folien SX04–SX07, Screens `t-treffer`, `t-stock`, `t-haus`, `t-research`)
Entscheidungen 3, 6, 7, 8; Hausstrategie mit Terminen, Logo-Raster (neue markiert), Protokoll, fünf Regeln, Prüfgeschichte als Kapitel; Forschung mit Etikett, „0 von 9“, Prüfliste „Was für einen fairen Test fehlt“, Stand je Methode, älterer Pilot als eigener Eintrag. Neue Adressen mit Weiterleitungen.

### PR 5 · Produkt-Leiste (Querschnitt, klein)
Entscheidung 3 in `assets/site-navigation.js`; Core- und Supertrader-CI grün.

## Entscheidungen beim Bauen

(Je Schritt ein Satz; Abnahme-Bilder je PR unter `abnahme/`.)

- **PR 1 · Wortwahl:** „Trigger“ und „Marke“ heißen „Zone laut Methode“, „Stop“ und „Grenze“ „Ungültig-Marke laut Methode“, „Einstieg/Ausstieg“ „Aufnahme/Abgabe“ (Musterdepot nimmt auf, gibt ab), „Signale“ „Treffer“ oder „Regel-Ergebnis“; Erläuterungstexte aus dem Datenstand (Hinweis, Beispiel, Prüfstand, Einstufung, Kurzbeschreibungen und Grenzen der 13 Methoden) werden beim Anzeigen umformuliert, die Daten unter `supertrader/data` bleiben unverändert und Regeltexte (Regel-IDs, Regelkarten, Quellen) bleiben wörtliche Zitate der Methode.
- **PR 1 · Seitenhüllen:** `scripts/supertrader/build.mjs --pages-only` schreibt Titel und Beschreibung aller erzeugten Seiten (auch der noch ausgelieferten älteren Aktienseiten) aus dem veröffentlichten Stand neu, ohne eine Datei unter `supertrader/data` zu berühren.
- **PR 1 · Farben:** Minus ist schwarz (dunkles Thema: grau), Kerzen und die Ungültig-Linie im Chart sind grau bzw. schwarz; der Test `st-recipe-wording.test.mjs` erkennt Rot über den Farbton, nicht über eine Liste.
- **PR 1 · Browser:** Die Supertrader-CI prüft wie bisher in Chromium (`browser-qa.mjs`, neu mit Wortwahl-Prüfung); WebKit wird je PR lokal geprüft (Screenshots unter `abnahme/`), damit `ci.yml` als Nicht-Supertrader-Pfad unberührt bleibt.

## Master-Prompt (in einen neuen Claude-Code-Chat einfügen)

```
Setze das freigegebene Supertrader-Konzept „Das Rezept eines Profis“ vollständig und 1:1 um, alle fünf Schritte in einem Durchlauf, ohne Rückfragen.
Vorlage: docs/design/supertrader-2026-11/ (HANDOVER.md, index.html, deck-st.js).
Fehlt der Ordner auf main, hole ihn vom Branch claude/keen-clarke-92odzj:
  git fetch origin claude/keen-clarke-92odzj && git checkout origin/claude/keen-clarke-92odzj -- docs/design/supertrader-2026-11
und nimm ihn in PR 1 mit (Dokumentation unter docs/ ist für Gate A kein Supertrader-Fremdpfad-Problem; sonst als eigenen Doku-PR vorweg).
Lies zuerst CLAUDE.md, dann docs/SUPERTRADER_9_HANDOVER.md §0, dann HANDOVER.md vollständig, und sieh dir die Präsentation im Browser an (Playwright, 390 × 844).

Arbeitsweise:
- Arbeite PR 1 bis PR 5 aus HANDOVER.md der Reihe nach ab. Je Schritt ein eigener Pull Request; du darfst PRs anlegen und, sobald die CI grün ist, selbst mergen (CLAUDE.md: grüne CI genügt). Danach setzt du deinen Branch auf den neuen main und beginnst den nächsten Schritt.
- Die Entscheidungen in HANDOVER.md sind getroffen. Neue Lesarten entscheidest du nach der Präsentation, schreibst einen Satz unter „Entscheidungen beim Bauen“ und machst weiter. Stelle keine Rückfragen und warte nicht auf Freigaben.
- Keine Regel, kein Musterdepot, kein Kandidaten-Tageslauf und keine Daten unter supertrader/data ändern. Erzeugte Seiten (strategies/<slug>, stock/<T>) nur über scripts/supertrader/build.mjs neu bauen, nie von Hand.
- Supertrader-PRs enthalten nur Supertrader-Pfade (Gate A); die Produkt-Leiste in assets/site-navigation.js ist ein eigener kleiner PR (PR 5).
- Wird die CI rot, behebe die Ursache im selben PR (Tests nie abschalten oder überspringen). Laufen andere Umbauten parallel, bring deinen Branch vor jedem PR auf den neuesten main.
- Vor jedem Merge: Tests aus CLAUDE.md und HANDOVER.md, Browser-Prüfung in Chromium und WebKit, Screenshot der echten Seite auf 390 × 844 neben dem Mockup. Die Screenshots kommen in die PR-Beschreibung.
- Halte nur an, wenn etwas eine Owner-Freigabe nach CLAUDE.md braucht (Geld, Recht, neue Aussagen über Rendite oder frühere Kursverläufe, endgültiges Löschen von Daten). Das ist hier nicht zu erwarten.
- Am Ende: eine kurze Zusammenfassung je PR (Link, was fertig ist, Abweichungen vom Mockup mit Grund, offene Punkte).
```
