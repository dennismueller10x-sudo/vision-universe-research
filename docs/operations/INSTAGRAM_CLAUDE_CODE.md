# Instagram per Claude Code steuern

Stand: 2026-10-15. Account: **@app.visionuniverse** (früher @visionuniverse.reports). Keine Zugangsdaten in dieser Datei oder im Repository.

## 1. Bestehende Meta-Integration (nur lesen, nicht duplizieren)

| Was | Wo |
|---|---|
| Runtime | Cloudflare Worker `vision-universe-social` (`workers/vision-universe-social/`, `social.visionuniverse.de`) |
| Secret-Namen (Worker) | `META_APP_ID`, `META_APP_SECRET`, `VU_SOCIAL_ADMIN_KEY`, `META_WEBHOOK_SECRET`, `VU_GITHUB_DISPATCH_TOKEN` |
| Login | Facebook Login for Business, Konfiguration „Vision Universe Social" (`META_LOGIN_CONFIG_ID` in `wrangler.toml`) |
| Rechte | `instagram_basic`, `instagram_content_publish`, `instagram_manage_insights`, `pages_show_list` |
| Token | Page-Token liegt **nur im Worker-KV**; kein Endpunkt gibt es heraus (bewusst, siehe Worker-README) |
| Publishing | nur Smoke-Test-Endpunkt; Freigabe-/Approval-Logik in `workers/vision-universe-social/src/approval.js` |
| Weitere Doku | `docs/VU_SOCIAL_META_CONNECT.md`, `docs/VU_SOCIAL_ARCHITECTURE.md`, `docs/VU_SOCIAL_SMOKE_PUBLISH.md` |

**Offener Punkt:** `META_IG_ALLOWED_USERNAMES` steht auf `visionuniverse.aktienreports`. Nach der Umbenennung zu `app.visionuniverse` lehnt die Allowlist das Konto beim nächsten Verbinden ab. Besser die numerische `META_IG_ACCOUNT_ID` eintragen (umbenennungsfest). Das ist eine Worker-Änderung und gehört in einen eigenen Social-PR.

## 2. Apify (Inspiration anderer öffentlicher Accounts)

- Offizielles Claude-Code-Plugin `apify` ist installiert; Server `https://mcp.apify.com`.
- Einmalig: in Claude Code `/mcp` → `plugin:apify:apify` → Authenticate (OAuth im Browser).
- Regel: nur eng begrenzte Läufe (z. B. 1 Profil, ≤ 12 Posts), Kosten vorher aus dem Actor-Detail nennen, kostenpflichtige Actors nur nach Freigabe.
- Nutzung: „Analysiere die letzten 12 öffentlichen Posts von @<handle> mit Apify, nur Hooks, Format, Posting-Rhythmus."
- Nur öffentliche Daten, keine Login-Zugänge anderer, nichts davon in `social/data` ablegen.

## 3. `instagram-mcp-ai` (IvanBBaev/instagram-mcp) – Prüfung, Entscheidung: **noch nicht aktiviert**

Geprüft am 2026-10-15 (Commit `3088d8e`, npm `instagram-mcp-ai@0.8.0`, MIT):

- Quellcode: nur Meta-Hosts (`graph.instagram.com`, `graph.facebook.com`, `api.instagram.com`), keine Install-Skripte, kein Scraping.
- Achtung Namensfalle: auf npm ist `instagram-mcp` ein **anderes** Paket. Richtig ist `instagram-mcp-ai`.
- Reife: 2 Tage alt, vor 1.0, laut README **nie gegen ein Live-Konto getestet**.
- Es braucht ein Token **lokal** (`IG_ACCESS_TOKEN`). Unser Page-Token verlässt den Worker absichtlich nie. Ein Kopieren würde ein zweites Geheimnis-Lager schaffen. Der alternative Weg (Instagram Login, Pfad A) verlangt ein zusätzliches Meta-Produkt/eine zusätzliche App-Konfiguration. Beides gegen die Vorgabe „keine doppelte Integration".
- Ein Teil der Tools braucht Rechte, die wir nicht haben (`instagram_manage_comments`); Discovery nur über Facebook-Login-Pfad.

Wenn aktiviert werden soll (nur mit Owner-Entscheidung zum Token):

```json
{ "mcpServers": { "instagram": {
  "command": "npx", "args": ["-y", "instagram-mcp-ai@0.8.0"],
  "env": { "IG_TOOL_PACKAGES": "reader", "IG_WRITE_MODE": "preview" }
} } }
```

Token und `IG_ACCOUNT_ID` über Umgebungsvariablen / OS-Keychain, nie in `.mcp.json`. Zuerst `npx instagram-mcp-ai@0.8.0 doctor`. `IG_WRITE_MODE=apply` erst nach erstem erfolgreichem Lesetest und nur pro Aktion.

## 4. Was geht offiziell, was nicht

| Aktion | Offizielle Graph API | Weg heute |
|---|---|---|
| Profil, Beiträge, Insights lesen | ja | Worker `/social/meta/verify`; `instagram-mcp-ai` (falls aktiviert) |
| Bild, Carousel, Reel, Story veröffentlichen | ja (`instagram_content_publish`, öffentliche HTTPS-Bild-/Video-URL nötig) | Worker mit Approval-Gate; MCP-Variante nur nach Owner-Entscheid |
| Kommentare moderieren | ja (zusätzliches Recht nötig) | derzeit nicht freigeschaltet |
| Öffentliche Posts anderer analysieren | nur eingeschränkt (Business Discovery) | Apify |
| **Bio ändern** | **nein** | manuell in der App, oder beaufsichtigte Browser-Sitzung |
| **Profilbild ändern** | **nein** | manuell in der App |
| **Beiträge archivieren (einzeln/alle)** | **nein** (API kann nur löschen bzw. Kommentare ausschalten) | manuell in der App; Massenarchivierung beaufsichtigt, kleine Chargen |

Browser-Automatisierung (nur für die „nein"-Zeilen): ausschließlich in der **eigenen, bereits angemeldeten** Browser-Sitzung des Owners, sichtbar und schrittweise bestätigt (z. B. Claude in Chrome). Kein Speichern von Passwörtern, keine inoffiziellen APIs, keine Umgehung von Login-/Sicherheitsprüfungen oder 2FA, keine Headless-Läufe in CI. Instagram schränkt automatisierte Bedienung per Nutzungsbedingungen ein; Risiko bis zur Kontosperre liegt beim Konto. Für Einzelaktionen ist manuell schneller und sicherer.

## 5. Freigaberegel für Claude

Ohne ausdrückliche Freigabe im aktuellen Chat: nichts veröffentlichen, nichts am Profil ändern, nichts archivieren/löschen. Vor jeder Schreibaktion Vorschau (Text, Medien-URL, Ziel-Account) zeigen.
