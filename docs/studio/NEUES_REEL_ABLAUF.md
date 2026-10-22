# Neues Reel: Ablauf von der Idee bis zur Karte

Stand 2026-10-21. Für Claude in einer neuen Sitzung. **Freigabe des Owners** steht jeweils dabei. Ohne sie weiter nichts tun.

## Start

Zuerst lesen: [README.md](README.md) (Regeln), [REEL_PLAYBOOK.md](REEL_PLAYBOOK.md) (Formel), [HEYGEN_API.md](HEYGEN_API.md), [STIMME_UND_SOUND.md](STIMME_UND_SOUND.md), [PRODUKTION_HISTORIE.md](PRODUKTION_HISTORIE.md). Dann prüfen:

1. HeyGen-Guthaben (`GET /v3/users/me`). Unter 0,5 USD: Owner bitten, aufzuladen.
2. Sind Dropbox (Musik) und Apify (Recherche) verbunden? Fehlt eine Verbindung, sagen, was fehlt.
3. Repo aktuell (`git fetch origin main`), keine Änderungen an Produktpfaden.
4. Speicher: `df -h /tmp`. Unter 3 GB frei: alte `frames/`-Ordner löschen, bevor gerendert wird. Gerendert werden 1.300 bis 1.800 Bilder je Reel (bis 1 GB).

## Schritte

| # | Schritt | Ergebnis | Freigabe |
|---|---|---|---|
| 1 | **Thema finden**: Termine (Zahlen, Gesetze, Ereignisse), Raster 6×5 im Playbook, eigene Daten (Discover, Quant, Förderrechner). Optional Apify-Recherche (Kosten nennen) | 3 Vorschläge mit Hook, Beweis, Format | Owner wählt Thema. Apify-Lauf nach Kostencheck |
| 2 | **Fakten**: Primärquellen lesen, Tabelle Aussage/Beleg/Rechenweg. Zahlen selbst nachrechnen. Quellenstand notieren. Bei Earnings: Mitschrift des Calls (am 22.10.2026 ließ sich fool.com abrufen, benzinga lieferte 403), Quellen weichen bei Konsens und Kurs ab, immer die Quelle nennen | Faktentabelle | – |
| 3 | **Skript**: Hook-Score ab 7, 90 bis 110 Wörter (Stimme etwa 40 bis 48 s), Zahlen ausgeschrieben, Re-Hook in der Mitte, Teilen-Anlass, App-Hinweis. Caption mit Quellen, Rechenweg, Hinweisen | Skript und Caption | Owner prüft Text |
| 4 | **Stimme** (kostet etwa 0,1 bis 0,15 USD, ein Aufruf, `Idempotency-Key`) | `tts_response.json`, `vo_raw.wav` | Owner gibt Kosten frei |
| 5 | **Aufbereiten**: `tighten.py` (Tempo 1,14), Whisper-Prüfung, Aussprache korrigieren | `vo.wav`, `words.json` | – |
| 6 | **Szenen**: Vorlage wählen (`studio/reels/templates/meta-muse/` für Call-Aussagen mit Zeichnungen und Mock-up, `quartalszahlen/` für Beat-oder-Miss-Zahlen, `tesla-ark/` als frühes Beispiel), kopieren, `build_timing.py` an Wortanzahl und Szenengrenzen anpassen, Komposition für neue Inhalte ändern (Zahlen, Icons, Charts). Optional Hintergrundbilder oder Clips | `timing.json`, `composition.html` | Clips: Kosten nennen |
| 7 | **Rendern, Ton, Zusammensetzen** (siehe `studio/reels/README.md`). Kontaktbogen und Pegel prüfen | MP4, −14,2 LUFS | – |
| 8 | **Review**: MP4 an den Owner schicken (`SendUserFile`). Änderungen einarbeiten | freigegebene Datei | Owner gibt die Datei frei |
| 9 | **Hosting und Karte**: Upload per HeyGen-Asset, Workflow `Social Reel vorbereiten` (`prepare`) mit Content-ID `reel_JJJJ_MM_TT_<kurz>`, Video-Adresse, Caption. Kurs oder Stand direkt vor dem Posten prüfen lassen | Karte im Approval Center (`published: false`) | Owner sagt „Go" für die Karte |
| 10 | **Veröffentlichen** macht nur der Owner im Approval Center. Danach TikTok und X: dieselbe Datei, kürzere Texte, KI-Schalter | veröffentlicht | Owner |
| 11 | **Messen**: 24 h, 72 h, 7 Tage. Zahlen in REEL_RESEARCH.md eintragen, Hypothesen aktualisieren | Lerneintrag | Owner liefert Zahlen oder erlaubt den lesenden Workflow `Social Instagram Check` |

## Bausteine zum Einsetzen im neuen Chat

- „Lies `docs/studio/README.md` und baue ein neues Reel zu <Thema>. Starte mit Schritt 1 und frage vor jedem kostenpflichtigen Schritt."
- „Prüfe das Reel `<content-id>` im Approval Center und trage die 72-h-Zahlen ein: <Zahlen>."
- „Analysiere <Konto oder Link> mit Apify (Kosten vorher nennen) und ergänze REEL_RESEARCH.md."

## Wenn etwas nicht geht

- `402 insufficient_credit`: Guthaben leer, Owner lädt auf.
- Quelle gesperrt (403): Owner um PDF oder Auszug bitten, nicht aus Sekundärquellen mischen.
- Apify getrennt oder OAuth nötig: Owner muss in Claude Code `/mcp` autorisieren, aus einer Cloud-Sitzung nicht auslösbar.
- Bilder oder Rechte unklar: nicht verwenden, Owner fragen.
