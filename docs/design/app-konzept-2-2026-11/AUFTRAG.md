# Auftrag „App-Konzept 2 – genau nach Prototyp“ (gemeinsamer Teil für alle Agenten)

## Lage
Der Owner hat am 14.11.2026 einen anklickbaren Prototyp freigegeben („Genau so möchte ich die App jetzt umgesetzt haben“).
Die bisherige Umsetzung (PRs #1994–#2012) hat nur Farben, Schrift, Dock und Bausteine auf die bestehenden Seiten übertragen.
Der Owner hat am 15.11.2026 klargestellt: Die Seiten sollen **so aussehen und so aufgebaut sein wie im Prototyp**, nicht „im Stil von“.
Das ist jetzt der Auftrag: Aufbau, Reihenfolge, Kopf, Größen, dunkle Darstellung wie im Prototyp – mit echten Daten.

## Owner 15.11.2026, wörtlich und verbindlich
„Ich möchte es 1:1 wie im Prototyp umgesetzt. … das reine Frontend-Design, das muss 1:1 wie im Prototyp sein … Nur die Inhalte
natürlich … muss halt immer basierend auf unseren Originaldaten.“
Heißt: Layout, Reihenfolge, Abstände, Schriftgrößen, Radien, Kopf, Kacheln, Schienen, Grafiken, Knöpfe **pixelnah wie der Prototyp**.
Übernimm CSS-Werte direkt aus `shell.js`/`prototyp/quelle/kit.js`/`prototyp/index.html`, statt sie nachzuempfinden. Abweichen darf nur der
Inhalt (echte Zahlen/Texte statt Beispielwerte) und – wo der Prototyp ein Modul oder einen Block gar nicht zeigt, wir aber Daten
haben – ein zusätzlicher Block **im Design des Prototyps**. Jede andere Abweichung ist ein Fehler und gehört in den Bericht.

## Die Vorgabe (lesen, bevor du etwas änderst)
Ordner: `docs/design/app-konzept-2-2026-11/prototyp/ (Quellen in prototyp/quelle/)`
- `prototyp/index.html` – der fertige Prototyp (eine Datei, alle Bildschirme `#v-<name>`, alle Fenster `<template id="sh-<name>">`), `out/img/`.
- `shell.js` – Rahmen: CSS (Kopf `.hdr`, Dock, Fenster `.sheet`), Verhalten (`go`, `openSheet`, `hdr()`).
- `p1.js` – Bildschirme home, discover, aktie. `p2.js` – quant, supertrader, news, ich, technical, fundamental, hedgefonds, screener.
- `build.js` – die Fenster (stock, vergleich, universe, suche, hinweise, daten, faktor, methode, m-quant, m-fund, …).
- `prototyp/quelle/kit.js` – das CSS-Grundgerüst des Prototyps (`K.css`) und die Grafik-Helfer.
- Aufnahmen des Prototyps: `prototyp/index.html` lokal öffnen und mit Playwright aufnehmen (390 × 844, dunkel, `#home`, `#discover`, `#aktie` …).
Den Prototyp kannst du lokal öffnen: `python3 -m http.server <freier Port> --directory <proto>/out` und mit Playwright aufnehmen
(`require('playwright')` geht ohne Installation; `chromium.launch()` ohne Optionen; `waitUntil:'load'` + kurzes Warten, nicht `networkidle`).

## Abnahme (das ist der Maßstab)
Für deinen Bildschirm: Aufnahme Prototyp neben Aufnahme deiner Umsetzung, 390 × 844, dunkel, von oben bis unten (mehrere Ausschnitte).
Jeder Block des Prototyps steht in derselben Reihenfolge, mit derselben Art Element (Kachel, Schiene, Bogen, Balken, Pille), in
vergleichbarer Größe. Lege die Vergleichsbilder (Prototyp | Umsetzung nebeneinander, PNG) unter
`<scratchpad der Sitzung>/abnahme/<dein-name>/` ab und nenne die Pfade im Abschlussbericht.
Sieh dir deine Vergleichsbilder selbst an (Read auf die PNG) und bessere nach, bis es passt. „Im Stil von“ reicht nicht.

## Echte Daten, nichts erfunden
Der Prototyp zeigt Beispielwerte. In der Umsetzung kommt jede Zahl und jeder Satz aus vorhandenen Daten/Engines der Seite.
- Gibt es für einen Block des Prototyps echte Daten: bauen.
- Gibt es keine Daten oder die Funktion existiert nicht: Block weglassen (keine Attrappe, keine Beispielwerte) und im Bericht nennen.
- **Vom Owner zurückgestellt, nicht bauen:** Tagesrunde, Serie (Streak), Quiz, Stufen/Abzeichen, Community, Analysten, ETF, Makro.
  Karten/Reiter dafür entfallen; der Rest rückt nach.
- Kein vorhandener Inhalt darf verloren gehen: Was die heutige Seite zeigt und der Prototyp-Bildschirm nicht, bleibt erreichbar
  (weiter unten auf der Seite, hinter einem Reiter oder in einem Fenster) – nicht löschen.

## Regeln des Repos (CLAUDE.md lesen!)
- Wortwahl `docs/legal/WORTWAHL.md`: kein „Signal“, keine „Empfehlung“, kein „Kursziel“, kein Gesamtscore, kein „für dich“, keine Kauf-/Verkaufsaufforderung.
- Fachmodelle (Scores, Rankings, Strategien, Regime) nicht ändern. Nur Darstellung.
- Nichts unter `quant/data`, `discover/data`, `supertrader/data`, `social/data` ändern oder mitbringen.
- Identität nur über `core/identity.js`; Preise nur über die vorhandenen Wege (ADR-002).
- Geschützte Dateien: `node scripts/quality/ui-protection.mjs` muss grün sein. Änderst du eine geschützte Datei, lege je Datei eine
  Revision an: `docs/quality/ui-protection-revisions/<slug>.json` (Felder wie die vorhandenen, z. B. `aktienkopf-app-konzept-2-*.json`;
  `from`/`to` = sha256 vorher/nachher, `pr`: 2015 als Platzhalter, `date`: "2026-11-15",
  `ownerApproval`: „Owner 15.11.2026 (wörtlich, zu Aufnahmen des Prototyps „App-Konzept 2“): „so sollte es ja nicht aussehen, sondern wie in diesem Mockup“ … „Das war ja geil, aber das sehe ich jetzt online noch nicht.“ Dazu 14.11.2026: „Genau so möchte ich die App jetzt umgesetzt haben.““).
- Budget Discover: `discover/(app|home|detail|themes).(js|css)` zusammen ≤ 180.000 Byte, ≤ 12 Requests (`scripts/discover/browser-qa.mjs`).
- Bausteine: `assets/vu-ui.js/.css` (VUUI: sheet/openSheet/closeSheet, rail, tap, gauge, ring, bars, meter, heat, radar, next, `.vu-night`).
  Fehlt ein Baustein des Prototyps, ergänze ihn dort (und `core/tests/vu-ui.test.mjs`), statt ihn je Seite neu zu bauen.
- Tests, die dein Bereich berührt, müssen grün sein (siehe CLAUDE.md „Tests“). Tests, die den alten Aufbau festschreiben, passt du an
  den neuen Aufbau an – nie löschen oder überspringen, um grün zu werden.
- Hell bleibt wählbar und muss lesbar sein; Standard wird dunkel (macht der Rahmen-Agent zentral).

## Arbeitsweise
- Du arbeitest in deinem eigenen Git-Worktree auf einem lokalen Zweig. **Nicht pushen, keinen PR öffnen.** Committe dort (kleine,
  saubere Commits, deutsche Betreffzeile). Der Hauptagent holt deine Commits ab.
- **Nie `git fetch` ohne Ziel** (nur `git fetch origin main`), der Plattenplatz ist knapp. Keine Release-Bauten im Repo (wenn nötig `/dev/shm`).
- Kein breites `pkill -f` (andere Agenten laufen parallel): beende nur Prozesse, die du selbst gestartet hast, über ihre PID. Eigene, zufällige Ports.
- Lokaler Server für die Seite: `python3 -m http.server <Port> --bind 127.0.0.1` im Worktree-Wurzelordner.
- Dunkel erzwingen in Aufnahmen: Playwright `colorScheme:'dark'` und die Theme-Schlüssel im localStorage setzen (je Seite nachsehen).

## Abschlussbericht (kurz, als deine letzte Nachricht)
1. Zweigname und Commit-Hashes. 2. Liste der Blöcke des Prototyp-Bildschirms: gebaut (Datenquelle) / weggelassen (warum).
3. Was von der alten Seite wohin gewandert ist. 4. Geänderte geschützte Dateien + Revisionsdateien. 5. Welche Tests liefen, mit Ergebnis.
6. Pfade der Vergleichsbilder. 7. Offene Punkte, ehrlich.
