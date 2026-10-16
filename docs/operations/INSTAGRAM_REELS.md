# Instagram Reels – Recherche, Vorbereitung, Freigabe

Kette: **Apify → Claude-Konzept → HeyGen-Video → Approval Center → Instagram-Reel.**
Kein Schritt veröffentlicht von allein. Ein Reel geht ausschließlich hinaus, wenn der Owner im Approval Center auf „Senden“ tippt.

## Befehle, die in Claude Code funktionieren

| Du sagst | Claude macht |
|---|---|
| „Analysiere fünf erfolgreiche Börsen-Reels und entwickle drei Ideen für Vision Universe.“ | Nennt die Kosten, wartet auf „Freigabe“, ruft Apify einmal auf (Limit 0,05 USD), wertet mit `reel-research.mjs` aus, liefert Muster und drei eigenständige Ideen. |
| „Bereite dieses HeyGen-Video als Instagram-Reel vor.“ | Holt `video_url` per HeyGen-MCP (`get_video`), prüft, dass die Adresse stabil ist, ruft `ig-reel.mjs prepare` auf. Veröffentlicht nichts. |
| „Stelle dieses Reel mit Caption zur Freigabe bereit.“ | `ig-reel.mjs prepare` → Karte im Approval Center, Link zur Karte. |
| „Wie steht das Reel `<id>`?“ | `ig-reel.mjs status --content-id <id>` |

`VU_SOCIAL_ADMIN_KEY` steht nur in der Umgebung des Terminals, nie im Chat oder Repo.

## Phase 1 – Recherche mit Apify

**Actor:** `apify/instagram-reel-scraper` (offiziell von Apify, ~165.000 Nutzer, Bewertung 4,39/5, kein Login, öffentliche Profile oder Reel-URLs).
**Kosten (Free-Tarif, Stand 2026-10-15):** Start 0,001 USD + 0,0026 USD je Reel. 5 Reels ≈ **0,014 USD**. Aufpreis-Optionen (Transkript 0,048 USD/Min, Video-Download 0,02 USD/MB, Shares-Zähler nur für zahlende Tarife) bleiben **aus**.
**Felder:** `url`, `shortCode`, `timestamp`, `caption`, `hashtags`, `videoPlayCount`, `likesCount`, `commentsCount`, `videoDuration`, `musicInfo`, `ownerUsername`, `isPinned`, `productType`. `likesCount = -1` bedeutet „ausgeblendet“ und wird nicht als 0 gerechnet.
**Aufruf (Claude, nach Freigabe):** `call-actor` mit `{ "username": ["<profil>" | "<reel-url>"], "resultsLimit": 5 }` und `callOptions: { "maxTotalChargeUsd": 0.05 }`; Ergebnis mit `get-dataset-items` als JSON speichern, dann:

```bash
node scripts/social/reel-research.mjs --in items.json --md
```

Berechnet: Engagement-Rate `(Likes+Kommentare)/Aufrufe`, Kommentare je 1.000 Aufrufe, Aufrufe/Tag, **Ausreißer-Faktor** (Aufrufe ÷ Median des Profils, ab 3 Reels je Profil), Einstiegsmuster (Frage, Zahl, W-Aussage, Warnung, Aussage), Dauer-Klassen, Spitzenreiter. Unter 10 Reels sagt das Tool ausdrücklich, dass Muster-Vergleiche nur Beispiele sind.

**Regeln:** keine wiederkehrenden Abfragen ohne Zustimmung; nur öffentliche Daten; es werden keine fremden Videos oder Texte übernommen (vom Text bleibt nur der Einstieg als Beleg); Ideen sind eigenständig, mit eigenem Hook, eigener Struktur und eigenen Zahlen aus Vision Universe.
**Nutzungsbedingungen:** Apify betreibt den Actor, die Verantwortung für die Nutzung liegt beim Auftraggeber. Instagram untersagt automatisiertes Abrufen in seinen Bedingungen; wir greifen nur auf öffentliche Inhalte zu, ohne Login, in kleinen Mengen, nur zur Analyse. Personenbezogene Daten (Profilnamen) nicht dauerhaft speichern.

## Phase 2 – Reels über die Meta-API veröffentlichen

Alles läuft im bestehenden Worker `vision-universe-social`; keine neue Meta-App, kein weiterer MCP-Server.

1. **Vorbereiten** – `POST /social/reel/prepare` (Admin, `ig-reel.mjs prepare`). Der Worker misst das Video über Range-Anfragen (nie die ganze Datei): https ohne Zugangsdaten, MP4/MOV (`ftyp`), ≤ 300 MB (`VU_REEL_MAX_BYTES`), Teilabdruck aus den ersten und letzten 64 KiB plus Größe. Ergebnis: Karte im Approval Center mit Video-Vorschau. **Es wird nichts bei Meta angelegt.**
2. **Freigabe** – der Owner sieht Video und Caption, tippt „Freigeben“, dann „Ja, veröffentlichen“ (wie bei Bildern).
3. **Senden** – `publishReelCore`: Abdruck (Inhalt + Videoadresse) wird nachgerechnet, Allowlist und Admin-/Sitzungsschutz gelten, Anspruch (Idempotenz) wird angemeldet, das Video wird **erneut gemessen** und gegen Größe und Teilabdruck der Freigabe gehalten (anderes Video → Abbruch). Dann Container (`media_type=REELS`), Status-Abfrage, `media_publish` erst bei `FINISHED`.
4. **Danach läuft es im Hintergrund weiter.** Die Anfrage vom Telefon tut nur den kurzen Teil (Video prüfen, **einen** Container anlegen, Anspruch festhalten, höchstens eine kurze Statusabfrage) und antwortet `202 PROCESSING`. Der Cron-Trigger des Workers (`wrangler.toml`, alle fünf Minuten) liest dann den Container-Status bei Meta und gibt nach `FINISHED` genau einmal frei, trägt die Entscheidung nach (Karte zeigt „Veröffentlicht“) und nimmt das Reel von der Warteliste. Die Seite kann geschlossen werden. „Verarbeitung prüfen“ zeigt den Stand und ist ein zusätzlicher, sicherer Weg (dieselbe Sperre, derselbe Container).

Fehlerverhalten: Netzfehler/Ausfall beim Anlegen werden höchstens 3-mal wiederholt; Ablehnung durch Meta (`ERROR`/`EXPIRED`) → Anspruch `FAILED`, nichts veröffentlicht, Wiederholung ist eine neue Entscheidung; scheitert `media_publish`, bleibt der Zustand **offen** (`uncertain`). Der Hintergrundlauf **gleicht dann zuerst mit Meta ab** (mindestens 90 s Abstand): meldet der Container `PUBLISHED`, wird das Medium im Konto gesucht und übernommen, statt erneut zu senden; ist er `FINISHED`, folgt ein weiterer `media_publish` auf **denselben** Container (höchstens 3 Versuche insgesamt); nie ein zweiter Container. Zeitfenster 45 Minuten (`VU_REEL_WINDOW_MIN`); danach bleibt der Anspruch offen und nur der Owner kann über „Verarbeitung prüfen“ fortsetzen. Status: `GET /social/reel/status?contentId=…`. Keine Token in Antworten oder Anspruch.

**Kosten und Grenzen des Hintergrundlaufs:** Cron-Trigger sind im Cloudflare-Free-Plan enthalten (bis 5 je Konto). Im Leerlauf kostet ein Lauf eine KV-Leseoperation (rund 288 pro Tag, Free: 100.000) und einen Worker-Aufruf (rund 288 pro Tag, Free: 100.000 für das ganze Konto). Es entsteht keine neue Infrastruktur. Der Lauf berührt nur Reels mit Freigabe; Bild und Carousel sind nicht betroffen. Die Warteliste ist ein Hinweis, die Wahrheit steht im Anspruch. **Takt:** Nach Metas Fertigmeldung vergehen bis zu fünf Minuten bis zur Veröffentlichung. Im 45-Minuten-Fenster liegen bis zu 9 Läufe, die 3 Freigabe-Versuche brauchen höchstens 5 (Test B16/B17).

**Grenzen:** Dauer, Seitenverhältnis und Codec prüft erst Meta (Container-Status `ERROR`, vor der Veröffentlichung). Der Videoabdruck ist ein Teilabdruck. Der Host des Videos muss Range-Anfragen unterstützen und dauerhaft erreichbar sein.

## Phase 3 – Übergabe aus HeyGen

Heute vorbereitet (ohne Kosten):

1. Video in HeyGen erstellen **(kostet Credits – nur nach ausdrücklicher Zustimmung)**.
2. `get_video` (HeyGen-MCP) liefert `video_url`, sobald das Video fertig ist.
3. `ig-reel.mjs prepare --content-id <id> --video-url <video_url> --caption-file caption.txt`.
4. Antwort `warnings: ["VIDEO_URL_MAY_EXPIRE"]` heißt: die Adresse ist signiert und läuft evtl. ab. Meta holt das Video erst **nach** der Freigabe, der Worker misst es dann erneut; eine abgelaufene Adresse scheitert sicher (`videoUnreachable`), aber das Reel wäre nicht sendbar.
   **Offen:** HeyGen-Adressen dauerhaft stabil hosten (z. B. Kopie auf einen eigenen öffentlichen https-Speicher mit Range-Unterstützung). Das ist bewusst noch nicht gebaut; der Host ist eine Infrastrukturentscheidung. Bis dahin: Freigabe zeitnah, oder Adresse nach Ablauf neu mit `prepare` anlegen.

## Betrieb

Deployment über den bestehenden Workflow `Social Cloudflare` (`workflow_dispatch`, `action=deploy`, `confirm_deploy=DEPLOY`). Neue optionale Variablen: `VU_REEL_MAX_BYTES` (Standard 300 MB), `VU_REEL_POLL_TRIES` (Standard 8), `VU_SOCIAL_POLL_WAIT_MS` (Standard 3000). Tests: `node --test workers/vision-universe-social/tests/reel.test.mjs social/tests/reel-tooling.test.mjs`; sie nutzen Test-Doubles, es wird nie ein echtes Reel veröffentlicht. Ein echter Live-Lauf gegen Meta ist erst mit einem Owner-freigegebenen Reel möglich.
