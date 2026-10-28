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
4. Reel: Skript mit Posenmarken, Stimmen, Komposition, Render. Ablage unter `reels/<datum>-<thema>/` (nur Quellen, kein MP4 im Repo). Erstes Test-Reel: `reels/2026-10-28-etf-sparplan/`, überarbeitet in `reels/2026-10-28-etf-sparplan-v2/` (Mund per Bildwechsel statt Wackeln, Vollbild-Diagramm, klarere Rechnung).
