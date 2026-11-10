---
name: insights-tageslauf
description: Schreibt und veröffentlicht die Insights-Tagesartikel von Vision Universe automatisch (zwei Artikel je Werktag: ein großer Wert, ein Nebenwert). Nutzen im geplanten Tageslauf oder wenn der Owner "Insights-Artikel für heute" möchte.
---

# Insights-Tageslauf

Ziel: an jedem Werktag zwei Artikel unter `/insights/` live, ohne dass der Owner eingreifen muss. Ein Artikel über einen
großen Wert (Rubrik „Tagesthema“), einer über einen Nebenwert (Rubrik „Nebenwert im Fokus“). Grundlage und Regeln:
`docs/publishing/HANDBUCH.md` Abschnitt 6 und 8, `docs/legal/WORTWAHL.md`. Vorlage für Aufbau und Ton: die Artikel in
`products/insights/artikel/` (Nvidia, Take-Two).

## Ablauf

1. **Repo und Zweig.** Auf dem neuesten `main` arbeiten: `git fetch origin main` und den Arbeitszweig der Sitzung neu von
   `origin/main` anlegen (`git checkout -B <zweig> origin/main`). Lehnt der Push danach ab, weil auf dem Remote-Zweig noch
   der gestrige, schon gemergte Stand liegt: `git merge -s ours origin/<zweig>` und normal pushen, nie Force-Push. Läuft heute schon ein Insights-PR oder stehen für heute schon zwei Artikel in `insights/artikel.json`: nichts tun.
2. **Themen wählen.** Zwei Quellen für Kandidaten, in dieser Reihenfolge:
   - **Nachrichten des Tages:** Quartalszahlen von gestern Abend und heute früh, Übernahmen, Zulassungen, Gerichts- und
     Politikentscheidungen, Ausblicke (Websuche „earnings today“, „stock movers today“, Wirtschaftskalender).
   - **Unsere Daten:** `node products/insights/themen.mjs` (größte Tagesbewegungen, groß und Nebenwerte).
   Ein Thema trägt, wenn es einen benennbaren Anlass gibt. **Branchenbewegungen zählen ausdrücklich** (z. B. „Chipwerte
   steigen zweistellig“): dann eine Aktie als Hauptwert mit Datenkasten nehmen und die Branche im Text einordnen. Eine
   Bewegung ohne bekannten Grund darf Thema sein, wenn der Artikel das offen sagt und mit Zahlen, Branche und Daten trägt.
   Nicht nehmen: Aktien „(schon in Insights)“, Pennystocks unter 2 Mrd. $, reine Gesundheits- oder Strafverfahrensthemen
   über Personen. Es gibt fast jeden Werktag genug Stoff: erst aufgeben, wenn mindestens sechs Kandidaten geprüft sind.
3. **Recherchieren.** Mindestens drei Quellen mit Adresse für den Artikel insgesamt (nicht drei Bestätigungen derselben Ursache) (Unternehmensmitteilung, SEC-Meldung oder
   Investor-Relations-Seite zuerst, dann große Medien). Jede Zahl im Text hat eine Quelle oder stammt aus unseren Daten.
   Widersprüche: Spanne nennen oder weglassen. Was nur eine Quelle meldet, so kennzeichnen („laut …“).
4. **Schreiben.** `products/insights/artikel/<datum>-<slug>.json`, Felder wie in den Vorlagen, dazu
   `"pruefung": "automatisch"`. 4–6 Abschnitte, ca. 3.500–5.000 Zeichen, ein Abschnitt `"h": "Was unsere Daten zeigen"`
   mit `"daten": "<TICKER>"`. Ton: sachlich, konkret, kein Hype, keine Empfehlung, kein Kursziel (auch keine Kursziele
   Dritter), keine Aufforderung. Wörtliche Zitate nur mit Sprecher und Medium, englische als „(übersetzt)“.
   Privatpersonen, gegen die nur Vorwürfe bestehen, nicht namentlich nennen.
5. **Daten und App-Screens.** `node products/insights/snapshot.mjs <datei>`, dann `node products/insights/screens.mjs <datei>`.
6. **Bild.** Nur offizielles Pressematerial des Unternehmens (Newsroom, Media-/Press-Kit, Investor-Relations), 16:9 auf
   1600 × 900 zugeschnitten nach `insights/img/<slug>.jpg`, mit `"quelle"` (Firmenname). Keine Agenturfotos, keine Bilder
   von Medien, keine Personenfotos außer offiziellen Vorstandsporträts. Gibt es kein passendes Pressebild:
   `"bild": {"typ": "app", "alt": "…"}` (Aufmacher aus den App-Screens).
7. **Bauen und prüfen.** `node products/insights/build.mjs`, dann
   `node --test "products/insights/tests/*.test.mjs" "core/tests/*.test.mjs"`. Jede Quellenadresse einmal abrufen; tote
   Adressen ersetzen. Die Artikelseite im Browser ansehen (Desktop und 390 px): keine leeren Bilder, kein Überlauf.
8. **Veröffentlichen.** Commit, Push, PR „Insights <Datum>: <Titel 1> und <Titel 2>“. Bei grüner CI (das Vercel-Limit
   „rate limited“ zählt nicht) mit Squash mergen. Konflikte mit `main` durch Einspielen von `main` lösen, nie Force-Push.
   Danach prüfen, dass beide Artikel unter research.visionuniverse.de antworten.
9. **Melden.** Zum Schluss zwei Zeilen: welche Artikel live sind (Adressen) oder warum heute nichts erschien.

## Wann nichts veröffentlicht wird

Lieber kein Artikel als ein schlechter. Abbrechen ohne Veröffentlichung, wenn: nach sechs geprüften Kandidaten keiner mit drei Quellen trägt, ein
Test rot bleibt, die Daten von gestern fehlen (`kursStand` älter als drei Handelstage) oder das Thema heikel ist
(Strafverfahren gegen Personen, Gesundheitsangaben, Kriegsereignisse). Dann nur melden.
