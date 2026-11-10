---
name: insights-tageslauf
description: Schreibt und veröffentlicht die Insights-Tagesartikel von Vision Universe automatisch (zwei Läufe je Werktag: 6 Uhr großer Wert, 12 Uhr Nebenwert oder Zukunftsthema). Nutzen im geplanten Tageslauf oder wenn der Owner "Insights-Artikel für heute" möchte.
---

# Insights-Tageslauf

Ziel: an jedem Werktag zwei Artikel unter `/insights/` live, ohne dass der Owner eingreifen muss, in **zwei Läufen**
(Owner 10.11.2026): der **Frühlauf** (Start 4:47 Uhr, live gegen 6 Uhr) schreibt das „Tagesthema“ über einen großen Wert
aus der US-Sitzung des Vortags; der **Mittagslauf** (Start 10:47 Uhr, live gegen 12 Uhr, vor der US-Eröffnung) schreibt
„Nebenwert im Fokus“ oder ein Zukunftsthema. Jeder Lauf schreibt **einen** Artikel; der Auftrag nennt, welcher Lauf es ist.

**Story statt Tagesmeldung:** Die Artikel werden Stunden später gelesen, und der Kurs kann bis dahin drehen. Deshalb nie
nur „Aktie X stieg um Y Prozent“: Der Kursausschlag ist der Anlass, das Thema ist die Geschichte dahinter (Geschäft,
Branche, Zahlen, was als Nächstes ansteht). Titel und Teaser so, dass sie auch nach einer Gegenbewegung stimmen. Im Text
den Stand nennen („Schlusskurs vom …“) und die nächsten Termine. Grundlage und Regeln:
`docs/publishing/HANDBUCH.md` Abschnitt 6 und 8, `docs/legal/WORTWAHL.md`. Vorlage für Aufbau und Ton: die Artikel in
`products/insights/artikel/` (Nvidia, Take-Two).

## Ablauf

1. **Repo und Zweig.** Auf dem neuesten `main` arbeiten: `git fetch origin main` und den Arbeitszweig der Sitzung neu von
   `origin/main` anlegen (`git checkout -B <zweig> origin/main`). Lehnt der Push danach ab, weil auf dem Remote-Zweig noch
   der gestrige, schon gemergte Stand liegt: `git merge -s ours origin/<zweig>` und normal pushen, nie Force-Push. Läuft schon ein Insights-PR oder steht der Artikel dieses Laufs (Früh oder Mittag) für heute schon in `insights/artikel.json`: nichts tun.
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
   `"pruefung": "automatisch"` und `"zeit": "<HH:MM>"` (06:00 im Frühlauf, 12:00 im Mittagslauf). 4–6 Abschnitte,
   ca. 3.500–5.000 Zeichen, ein Abschnitt `"h": "Was unsere Daten zeigen"`
   mit `"daten": "<TICKER>"`. Ton: sachlich, konkret, kein Hype, keine Empfehlung, kein Kursziel (auch keine Kursziele
   Dritter), keine Aufforderung. Wörtliche Zitate nur mit Sprecher und Medium, englische als „(übersetzt)“.
   Privatpersonen, gegen die nur Vorwürfe bestehen, nicht namentlich nennen.
5. **Daten und App-Screens.** `node products/insights/snapshot.mjs <datei>`, dann `node products/insights/screens.mjs <datei>`.
6. **Bilder (Pflicht, jeder Artikel).** Jeder Artikel bekommt einen Aufmacher mit Bezug zur Firma und mindestens ein
   Bild im Text (`abschnitte[].bild` mit `text` als Bildunterschrift). Reihenfolge der Quellen:
   1. Offizielles Pressematerial: Newsroom, Media-/Press-Kit, Investor-Relations (z. B. Produktbilder auf `newsroom.amd.com`).
   2. Offizielle Bilder der Firmenwebsite: `og:image` der Startseite, Produkt- und Kampagnenbilder unter der eigenen
      Domain (z. B. `ui.com/microsite/static/…`).
   3. Erst wenn beides fehlt: ein KI-Bild mit `"ki": true` (Bildzeile „KI-Bild“), symbolisch zum Thema (Rechenzentrum,
      Fabrik, Produktkategorie), ohne Logos, ohne erfundene Produkte der Firma, ohne erkennbare Personen. Higgsfield ist
      vom Owner dauerhaft freigegeben (10.11.2026). Zuerst den Vorrat `insights/img/vorrat/` nehmen (Liste in
      `vorrat.json`, helle Branchenmotive). Fehlt ein passendes Motiv: Bildauftrag nach `brand-media/publishing/image-jobs/`
      (Stil-Satz aus HANDBUCH Abschnitt 5, `qwen-image-3`, 2k, höchstens 3 Bilder, Limit 0,40 USD), als eigener kleiner PR
      mergen, Workflow „Brand Media · Higgsfield Bilder“ mit `generate`, Budget 0,40 und `APPROVE-HIGGSFIELD-IMAGE-JOB`
      auf `main` starten, Artefakt laden. Dauert das länger als der Lauf erlaubt, heute Stufe 1/2 oder den Vorrat nehmen
      und das neue Motiv für den nächsten Tag in den Vorrat legen.
   Keine Agenturfotos, keine Bilder von Medien, keine Personenfotos außer offiziellen Vorstandsporträts. Bildmarken
   (Logos) nur auf offiziellem Material. Keine Partner-Logos-Kacheln („AMD × Oracle“) als Aufmacher: lieber Produkt,
   Standort oder Rechenzentrum. Zuschnitt 16:9 auf 1600 × 900 nach `insights/img/<slug>-<motiv>.jpg`, freigestellte
   Produktbilder auf Weiß, mit `"quelle"` (Firmenname). Jedes Bild vor dem Einbau ansehen. `"bild": {"typ": "app", …}`
   (Aufmacher aus App-Screens) nur noch als Notlösung, wenn auch kein KI-Bild möglich ist; dann im Bericht sagen.
7. **Bauen und prüfen.** `node products/insights/build.mjs`, dann
   `node --test "products/insights/tests/*.test.mjs" "core/tests/*.test.mjs"`. Jede Quellenadresse einmal abrufen; tote
   Adressen ersetzen. Die Artikelseite im Browser ansehen (Desktop und 390 px): keine leeren Bilder, kein Überlauf.
8. **Veröffentlichen.** Commit, Push, PR „Insights <Datum> <Früh|Mittag>: <Titel>“. Bei grüner CI (das Vercel-Limit
   „rate limited“ zählt nicht) mit Squash mergen. Konflikte mit `main` durch Einspielen von `main` lösen, nie Force-Push.
   Danach prüfen, dass der Artikel unter research.visionuniverse.de antwortet (die Auslieferung kann wegen der
   Datenläufe bis zu einer Stunde dauern; `/insights/` ist öffentlich, ohne Passwortmaske).
9. **Melden.** Zum Schluss zwei Zeilen: welcher Artikel live ist (Adresse) oder warum nichts erschien.

## Wann nichts veröffentlicht wird

Lieber kein Artikel als ein schlechter. Abbrechen ohne Veröffentlichung, wenn: nach sechs geprüften Kandidaten keiner mit drei Quellen trägt, ein
Test rot bleibt, die Daten von gestern fehlen (`kursStand` älter als drei Handelstage) oder das Thema heikel ist
(Strafverfahren gegen Personen, Gesundheitsangaben, Kriegsereignisse). Dann nur melden.
