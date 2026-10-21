# Vision Universe Studio: Reels

Einstieg für jede neue Sitzung, in der ein Reel entstehen soll. Stand 2026-10-21.

**Satz für einen neuen Chat:** „Lies `docs/studio/README.md` und baue ein neues Reel zu <Thema>." Claude findet danach alles Weitere hier.

## Dokumente

| Datei | Inhalt |
|---|---|
| [NEUES_REEL_ABLAUF.md](NEUES_REEL_ABLAUF.md) | Schritt für Schritt vom Thema bis zur Karte im Approval Center, mit Freigaben und Kosten |
| [REEL_PLAYBOOK.md](REEL_PLAYBOOK.md) | Formel (Hook 70 → Spike 90 → Peak/Release → Re-Hook → Beweis → Teilen), Formate, Hook-Score, Checklisten, Messplan |
| [REEL_RESEARCH.md](REEL_RESEARCH.md) | Belege: eigene Zahlen, 332 Finanz-Reels, Nischen, Kallaway, HeyGen-Video |
| [HEYGEN_API.md](HEYGEN_API.md) | HeyGen-Schnittstellen, Stimmen, Preise, Fallstricke |
| [STIMME_UND_SOUND.md](STIMME_UND_SOUND.md) | Helmut, Aussprache, Musik, Effekte, Lautheit |
| [PRODUKTION_HISTORIE.md](PRODUKTION_HISTORIE.md) | Alle bisherigen Reels, Entscheidungen, Fehler und Lösungen |
| [FAKTEN_ALTERSVORSORGE_RIESTER.md](FAKTEN_ALTERSVORSORGE_RIESTER.md) | Geprüfte Gesetzesfakten für Altersvorsorge-Reels |
| [AUTOMATISIERUNG.md](AUTOMATISIERUNG.md) | Weg zum automatischen Ablauf, mit den Freigabe-Schranken |
| [../../studio/reels/README.md](../../studio/reels/README.md) | Werkzeuge und Vorlage (Skripte) |

## Regeln des Owners (gelten immer)

1. Nichts wird ohne Freigabe des Owners im Approval Center veröffentlicht. Es gibt keinen Weg daran vorbei.
2. Jedes Reel führt zur Vision-Universe-App („bald verfügbar", Endkarte „App", nicht „Studio").
3. Kein Kleingedrucktes im Video. Quellen, Stand und Hinweise stehen in der Caption.
4. Keine fremden oder ungeklärten Videos, Bilder, Stimmen oder Musik. Fremde Reels nur intern analysieren, nie wiederverwenden.
5. Kein neues Abo, keine Änderung an der Produktivinfrastruktur, keine Anzeigen ohne Auftrag.
6. Jeder kostenpflichtige Aufruf (HeyGen, Apify) wird vorher mit Kosten genannt und vom Owner freigegeben. Keine wiederkehrenden Abfragen ohne Zustimmung.
7. Fakten werden an Primärquellen geprüft. Zahlen und Zielkurse sind „Modell, keine Prognose", keine Anlageberatung.
8. Meta verlangt die Kennzeichnung fotorealistischer KI-Bilder: Hinweis in der Caption („Teile der Bilder sind KI-generiert"), bei TikTok der KI-Schalter.
9. Sprache: Deutsch.

## Marke

Hintergrund `#08080a`, Text `#f4f5f1`, Akzent Lime `#c8f531`, Schrift Inter, minimaler Fintech-Look. Logo `assets/vision-universe-logo.png`, Schrift `assets/fonts/inter-latin.woff2`.

## Konto und Zugänge

- Instagram `@app.visionuniverse`, ID `17841480148117405`. Worker `social.visionuniverse.de` hält das Token. Der Admin-Schlüssel liegt nur als GitHub-Secret `VU_SOCIAL_ADMIN_KEY`. Er wird nie im Chat oder in Dateien genannt.
- HeyGen: REST-Aufrufe an `api.heygen.com` laufen über den Proxy der Sitzung (Schlüssel wird dort eingesetzt). HeyGen-Guthaben wird vom Owner aufgeladen, Auto-Reload ist aus.
- Musik: Dropbox des Owners (MCP-Verbindung), eigener Track, siehe STIMME_UND_SOUND.md.
- Recherche: Apify (MCP). Pro Lauf Kosten im Voraus nennen.
- Veröffentlichung: Workflow `Social Reel vorbereiten` (`social-reel.yml`) legt nur die Karte an. Freigeben und Senden macht der Owner im Approval Center.
- Meta-Insights (nur lesend): Workflow `Social Instagram Check`, siehe `docs/operations/INSTAGRAM_CLAUDE_CODE.md` und `INSTAGRAM_REELS.md`.
