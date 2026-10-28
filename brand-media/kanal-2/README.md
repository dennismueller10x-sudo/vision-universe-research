# Kanal 2: Aktienzoo (@aktienzoo)

Zweiter Instagram/TikTok-Kanal für Börsen- und Finanzwissen mit zwei Comic-Figuren. Ziel ist Reichweite. Später, nach Entscheidung des Owners, kann der Kanal auf Vision Universe hinweisen. Stand 2026-10-28.

## Trennung von Vision Universe

- Eigene Marke: kein Vision-Universe-Logo, keine VU-Farben (Lime auf Schwarz), keine App-Endkarte, kein Hinweis auf `@app.visionuniverse`, bis der Owner das ausdrücklich freigibt.
- Die Regeln in `docs/studio/` gelten für Vision-Universe-Reels. Für diesen Kanal gelten nur die Regeln hier.
- Alles liegt unter `brand-media/kanal-2/`. `brand-media/` wird nie auf research.visionuniverse.de ausgeliefert (`scripts/vu2/build-release.mjs#permitted`).
- Gemeinsam genutzt wird nur Werkzeug: Higgsfield-Bildworkflow, HeyGen-Stimmen, Render-Werkzeuge.

## Regeln

1. Nichts wird ohne Freigabe des Owners veröffentlicht.
2. Fakten und Zahlen werden an Primärquellen geprüft. Quellen und Stand stehen in der Caption.
3. Jede Caption endet mit „Keine Anlageberatung.“ und „Figuren KI-generiert.“ (Meta-Kennzeichnung, bei TikTok der KI-Schalter).
4. Keine fremden Videos, Bilder, Stimmen oder Musik. Fremde Kanäle (z. B. `@finanz.lehre`) werden nur intern analysiert, nie kopiert. Eigene Figuren, eigener Name, eigener Look.
5. Jeder kostenpflichtige Aufruf (Higgsfield, HeyGen, Apify) wird vorher mit Kosten genannt und vom Owner freigegeben.
6. Sprache Deutsch.

## Format

Vorbild ist die Machart erfolgreicher Erklär-Reels (Analyse vom 28.10.2026: `@finanz.lehre`, 12 Reels in 5 Tagen, rund 540.000 Aufrufe, Spitzenreiter „KI-Geldkreis“ mit 218.000):

- 60–100 s, weißer Hintergrund, ein Diagramm wächst Schritt für Schritt (Knoten = Firmen/Akteure, Pfeile mit Beträgen).
- Untertitel ein Wort pro Bild, groß, fett, synchron zur Stimme.
- Zwei Figuren im unteren Bilddrittel, Posenwechsel alle 0,3–1 s, Mund und Blinzeln als Bildwechsel, Zoom zwischen Ganzkörper und Nahaufnahme.
- Stempelwörter („CHAOS“, „DOCH.“), Endkarte mit Kanalname und „Keine Anlageberatung“.

Unser Unterschied: kein Experte, der einem Ahnungslosen etwas erklärt, sondern zwei Sichtweisen.

- **Bulle:** Wall-Street-Optimist. Weißes Hemd mit hochgekrempelten Ärmeln, rote Hosenträger, lockere rote Krawatte, Uhr, Handy mit grünem Chart. Laut, begeistert, kauft jeden Hype.
- **Bär:** gemütlicher Skeptiker. Grüne Strickjacke, Lesebrille, Kaffeebecher, Zeitung. Ruhig, trocken, rechnet nach, fragt nach dem Haken.

## Ablauf

1. Figurenentwurf: `image-jobs/bulle-baer-entwurf-1.json` über den Workflow „Brand Media · Higgsfield Bilder“ (siehe `brand-media/higgsfield/README.md`). Erledigt am 28.10.2026, 6 Bilder, 0,45 USD.
2. Owner wählt Stil und Figuren. Gewählte Bilder kommen nach `figuren/`. Vorläufig: `figuren/entwurf-1/` (Grok Image 2.0, Stil A), bis der Owner entscheidet.
3. Posen je Figur (Mund zu/halb/offen, Augen zu, Gesichtsausdrücke) mit den gewählten Bildern als Vorlage. Erster Satz: `image-jobs/bulle-baer-mund-posen-1.json` (11 von 12 Bildern, 0,48 USD geschätzt), aufbereitet in `figuren/entwurf-1/v2/`.
4. Reel: Skript mit Posenmarken, Stimmen, Komposition, Render. Ablage unter `reels/<datum>-<thema>/` (nur Quellen, kein MP4 im Repo). Erstes Test-Reel: `reels/2026-10-28-etf-sparplan/`, überarbeitet in `reels/2026-10-28-etf-sparplan-v2/` (Mund per Bildwechsel statt Wackeln, Vollbild-Diagramm, klarere Rechnung). Am 28.10.2026 vom Owner auf Instagram und TikTok veröffentlicht.

## Pflicht ab Reel 2 (Owner-Feedback zu Reel 1)

Reel 1 war verständlich, aber optisch zu ruhig. Die Vorlage wechselt etwa jede Sekunde das Bild. Ab jetzt gilt:

**Vorschaubild (Cover)**
- Comic-Plakat statt ruhiger Grafik: 2–4 Wörter, riesig (mindestens 170 px Schrifthöhe auf 1080 × 1920), dicke schwarze Kontur, harter Schlagschatten, Füllung in kräftigem Gelb oder Blau, leicht gedreht.
- Hintergrund voll: Collage aus Zeitungsausschnitten, Charts, Geldscheinen, Logos oder Motiven des Themas (eigene oder generierte Bilder, entsättigt), dazu ein farbiger Strahlenkranz hinter der Figur.
- Eine Figur groß in der Mitte mit starkem Ausdruck (schockiert, zeigt, jubelt). Alles Wichtige im 3:4-Ausschnitt des Rasters.
- Wiedererkennbar als Serie: gleicher Aufbau, gleiche Schrift, wechselnde Farbe pro Thema.
- Umsetzung: `vorlagen/cover/` (Beispiel `reels/2026-10-28-etf-sparplan-v2/cover-comic.jpg`).

**Im Video**
- Bilddichte: spätestens alle 1–2 Sekunden ein neues Element (Icon, Foto-Ausschnitt, Logo, Geldsack, Münzen, Pfeil, Stempel, Zahl). Keine Szene länger als etwa 3 Sekunden unverändert.
- Farbe: farbige Flächen und Akzente je Szene statt durchgehend Creme; Begriffe mit eigenem Icon oder Bild statt nur Text.
- Schnitte: Punch-in-Zooms auf das Schlüsselwort, Wischblenden und Reißschwenks zwischen Szenen, kurzer Weißblitz oder Wackler bei Schock-Momenten, Split-Screen bei Bulle gegen Bär, Zähler und Balken mit Schwung. Jeder Schnitt bekommt einen passenden Soundeffekt.
- Figuren: weiter per Mundbild sprechen, zusätzlich Reaktionsbilder als Zwischenschnitt (Bulle schockiert, Bär rollt die Augen). Ein Gesichtsausdruck steht nur kurz am Satzanfang (etwa 0,6 s), danach bewegt sich der Mund mit der Stimme. Wer spricht, hat nie ein Standbild.
- Bildmaterial: nur eigenes, generiertes oder eindeutig freies Material. Vorhanden: `icons/` (20 Icons, Aufträge `aktienzoo-icons-*`), Outfits in `figuren/entwurf-1/outfits/` (Bulle Hemd/Sakko, Bär Hemd/Pullover, je mit allen Mund- und Gesichtsbildern). Erstes Reel nach diesen Regeln: `reels/2026-10-28-buffett-zeit/`. Für wiederkehrende Motive (Geldsack, Münzstapel, Tresor, Börsengebäude, Chart, Steuerbescheid, Rakete, Kaffeetasse …) eine eigene Icon-Bibliothek im Stil der Figuren anlegen (Bildauftrag mit Recraft, etwa 0,04 USD je Icon).
