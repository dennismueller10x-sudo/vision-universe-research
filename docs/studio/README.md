# Vision Universe Studio: Reels

> **Einstieg Studio.** Aktuelle Arbeitsregeln: [CLAUDE.md](../../CLAUDE.md); datierte Entscheidungen: [Neustart-Plan](../PLAN_NEUSTART_2026-11.md). Bei Widersprüchen zu historischen Abschnitten gelten diese Quellen. Weitere Seiten sind Fachbelege, keine parallelen Einstiege. [Landkarte](../README.md).


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
| [ERKLAERSERIE.md](ERKLAERSERIE.md) | Willkommensseite `/willkommen/`: Highlights mit Erklärvideos, Produkte, Neuigkeiten; Sprechertexte und Einsetzen neuer Videos |
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
10. **Schlussaufruf:** Vorerst immer die App (Entscheidung des Owners am 21.10.2026). Kein Schick-das-weiter-Satz im Sprechertext und keine Änderung an fertigen Reels (das Riester-Reel bleibt in der letzten Fassung). Teilen und Speichern wirken über den Inhalt, nicht über einen gesprochenen Aufruf.

## Marke

Hintergrund `#08080a`, Text `#f4f5f1`, Akzent Lime `#c8f531`, Schrift Inter, minimaler Fintech-Look. Logo `assets/vision-universe-logo.png`, Schrift `assets/fonts/inter-latin.woff2`.

## Konto und Zugänge

- Instagram `@app.visionuniverse`, ID `17841480148117405`. Worker `social.visionuniverse.de` hält das Token. Der Admin-Schlüssel liegt nur als GitHub-Secret `VU_SOCIAL_ADMIN_KEY`. Er wird nie im Chat oder in Dateien genannt.
- HeyGen: REST-Aufrufe an `api.heygen.com` laufen über den Proxy der Sitzung (Schlüssel wird dort eingesetzt). HeyGen-Guthaben wird vom Owner aufgeladen, Auto-Reload ist aus.
- Musik: Dropbox des Owners (MCP-Verbindung), eigener Track, siehe STIMME_UND_SOUND.md.
- Recherche: Apify (MCP). Pro Lauf Kosten im Voraus nennen.
- Veröffentlichung: Workflow `Social Reel vorbereiten` (`social-reel.yml`) legt nur die Karte an. Freigeben und Senden macht der Owner im Approval Center.
- Meta-Insights (nur lesend): Workflow `Social Instagram Check`, siehe `docs/operations/INSTAGRAM_CLAUDE_CODE.md` und `INSTAGRAM_REELS.md`.

## Fachbelege und weiterführende Dokumentation

Die folgenden Quellen werden verlinkt, nicht zusammenkopiert. Bei datierten Berichten bezeichnet „gültig“ ihren Referenzwert; daraus folgt keine neue Freigabe.

- [VU_SOCIAL_AGENT_GRAPH.md](../VU_SOCIAL_AGENT_GRAPH.md)
- [VU_SOCIAL_ARCHITECTURE.md](../VU_SOCIAL_ARCHITECTURE.md)
- [VU_SOCIAL_E2E_NACHWEIS.md](../VU_SOCIAL_E2E_NACHWEIS.md)
- [VU_SOCIAL_EIGENE_DOMAIN.md](../VU_SOCIAL_EIGENE_DOMAIN.md)
- [VU_SOCIAL_EVIDENCE_REGIME.md](../VU_SOCIAL_EVIDENCE_REGIME.md)
- [VU_SOCIAL_LINKAGE_DIAGNOSE.md](../VU_SOCIAL_LINKAGE_DIAGNOSE.md)
- [VU_SOCIAL_META_CONNECT.md](../VU_SOCIAL_META_CONNECT.md)
- [VU_SOCIAL_META_LOGIN_DIAGNOSE.md](../VU_SOCIAL_META_LOGIN_DIAGNOSE.md)
- [VU_SOCIAL_NORTH_STAR_GAP.md](../VU_SOCIAL_NORTH_STAR_GAP.md)
- [VU_SOCIAL_OWNER_DECISIONS.md](../VU_SOCIAL_OWNER_DECISIONS.md)
- [VU_SOCIAL_SHADOW_LOOP.md](../VU_SOCIAL_SHADOW_LOOP.md)
- [VU_SOCIAL_SMOKE_PUBLISH.md](../VU_SOCIAL_SMOKE_PUBLISH.md)
- [VU_SOCIAL_VISUAL_ARCHITECTURE.md](../VU_SOCIAL_VISUAL_ARCHITECTURE.md)
- [social/WORK_OUTPUT_CONTRACT.md](../social/WORK_OUTPUT_CONTRACT.md)
- [studio/AUTOMATISIERUNG.md](AUTOMATISIERUNG.md)
- [studio/ERKLAERSERIE.md](ERKLAERSERIE.md)
- [studio/FAKTEN_ALTERSVORSORGE_RIESTER.md](FAKTEN_ALTERSVORSORGE_RIESTER.md)
- [studio/HEYGEN_API.md](HEYGEN_API.md)
- [studio/NEUES_REEL_ABLAUF.md](NEUES_REEL_ABLAUF.md)
- [studio/PRODUKTION_HISTORIE.md](PRODUKTION_HISTORIE.md)
- [studio/REEL_PLAYBOOK.md](REEL_PLAYBOOK.md)
- [studio/REEL_RESEARCH.md](REEL_RESEARCH.md)
- [studio/STIMME_UND_SOUND.md](STIMME_UND_SOUND.md)
- [werbetrailer/WERBETRAILER_ARRIVAL_2.md](../werbetrailer/WERBETRAILER_ARRIVAL_2.md)

### Historische Arbeitsstände

Abgelöste Übergaben und Statusberichte; zur Nachvollziehbarkeit erhalten. Maßgeblich sind der Einstieg und der aktuelle Plan.

- [VU_SOCIAL_HANDOFF.md](../archiv/2026/VU_SOCIAL_HANDOFF.md)
- [VU_SOCIAL_PHASE_A_AUDIT.md](../archiv/2026/VU_SOCIAL_PHASE_A_AUDIT.md)
