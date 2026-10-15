# Instagram per Claude Code steuern

Stand: 2026-10-15. Account **@app.visionuniverse** (früher @visionuniverse.reports / @visionuniverse.aktienreports), IG-ID `17841480148117405`. Keine Zugangsdaten in dieser Datei oder im Repository.

## Entscheidung: eigener Worker-Adapter, kein externer Instagram-MCP

Die bestehende Meta-Integration (Cloudflare Worker `vision-universe-social`, `social.visionuniverse.de`) hält das Page-Token und gibt es nie heraus. Jeder externe MCP-Server braucht ein lokales Token (zweite Kopie) und/oder eine zweite Meta-App-Konfiguration. Das verschlechtert die Sicherheit ohne Funktionsgewinn, denn Publishing hat hier bereits Freigabe, Bild-Fingerabdruck, Idempotenz und Allowlist.

Vergleich (Stand 2026-10-15, GitHub-Seiten; Commit-Daten teils nicht abrufbar):

| Projekt | Stars | Sprache / API | Umfang | Einschätzung |
|---|---|---|---|---|
| jlbadano/ig-mcp | 197 (52 Forks), 46 Commits | Python, Graph API v19 | Profil, Medien, Insights, Bild-/Video-Publish, DMs; **kein** Carousel/Reel | veraltete API-Version, README legt App-Secret in URL-Query nahe |
| mcpware/instagram-mcp | 56 (12 Forks), 61 Commits | TypeScript-Rewrite (Fork von ig-mcp), Graph API | 23 Tools inkl. Carousel, Reel, Kommentare, DMs, Hashtags | enthält `.env.enc` im Repo (ungeprüft), inkonsistente Variablennamen |
| IvanBBaev/instagram-mcp (`instagram-mcp-ai@0.8.0`) | 3, 37 Commits | TypeScript, Graph API v25, nur Meta-Hosts | 29 Tools, Write-Gate (Preview/Apply), Tool-Annotations | sauberster Code, aber 2 Tage alt, nie live getestet |
| weitere (npm `instagram-mcp-server`, `@mikusnuz/meta-mcp`) | nicht geprüft | Graph API | Carousel/Reel | nicht auditiert |

Stars sind kein Sicherheitsmerkmal. Keiner löst das Token-Problem. Falls später doch ein externer MCP gewünscht ist: `instagram-mcp-ai@0.8.0` mit `IG_TOOL_PACKAGES=reader`, `IG_WRITE_MODE=preview`, Token nur über Umgebung/Keychain, vorher `doctor`. Achtung: auf npm ist `instagram-mcp` ein *anderes* Paket.

## Was jetzt geht

Client: `scripts/social/ig.mjs` (nur lesend, GET) gegen den Worker. Benötigt `VU_SOCIAL_ADMIN_KEY` in der Umgebung (nie in Datei/Argument). `VU_SOCIAL_WORKER_URL` optional (Standard `https://social.visionuniverse.de`).

```bash
node scripts/social/ig.mjs status                    # Verbindungs-/Rechtezustand
node scripts/social/ig.mjs profile                   # Bio, Follower, Profilbild-URL, Anzahl Beiträge
node scripts/social/ig.mjs media --limit 12          # eigene Beiträge und Reels (media_product_type)
node scripts/social/ig.mjs media --reels --after <cursor>
```

Natürlich sagen: „Zeig mir mein Instagram-Profil", „Liste meine letzten 10 Reels". Claude führt die Befehle oben aus. Der Endpunkt `/social/meta/profile` (Admin-Schlüssel, 2 Graph-Aufrufe, prüft die Allowlist, gibt nie ein Token aus) muss dafür im Worker **deployt** sein: Workflow `Social Cloudflare` (`workflow_dispatch`), Preflight läuft automatisch zuerst.

Insights: `GET /social/meta/insights` (bestehend).

## Verbindung prüfen und Beitragsdaten sichern (ohne Schlüssel im Chat)

Workflow `Social Instagram Check` (`workflow_dispatch`), nutzt nur das Repository-Secret `VU_SOCIAL_ADMIN_KEY`:

- `backup=false`: liest `/social/meta/profile` live und bricht ab, wenn das Konto nicht `@app.visionuniverse` / `17841480148117405` ist. Ausgabe nur Konto, ID, Zähler.
- `backup=true`: sichert zusätzlich alle Beiträge (ID, Datum, Caption, Typ, Permalink, Likes/Kommentare, Reichweite u. a.) als Artefakt `instagram-backup` (90 Tage) und auf einem neuen Branch `backup/instagram-<Zeitstempel>`. Lokal derselbe Ablauf: `node scripts/social/ig-check.mjs --expect-id … --expect-username … --out datei.json`.

Archivierte Beiträge liefert die Meta-API nicht mehr aus. Deshalb vor dem Archivieren sichern.

## Veröffentlichen (bestehende Freigabe bleibt)

Bilder und Carousels laufen unverändert über die Pipeline: Kandidat (`scripts/social/make-publish-candidate.mjs`, `make-carousel-candidates.mjs`) → Freigabe im Approval Center → Worker `POST /social/meta/publish` (Idempotenz, JPEG-/Fingerabdruck-Prüfung, Allowlist). Es gibt bewusst keinen freien „poste das jetzt"-Befehl am Freigabeweg vorbei.

**Reels sind im Worker noch nicht implementiert** (Video-Container, Verarbeitungs-Polling, Freigabe mit Video-Fingerabdruck). Das ist ein eigener Social-PR. Bis dahin: Reels manuell in der Instagram-App oder Meta Business Suite.

## Zielkonto-Allowlist

`wrangler.toml`: `META_IG_ACCOUNT_ID = 17841480148117405` (unveränderlich) plus Handles `app.visionuniverse` und übergangsweise `visionuniverse.aktienreports`. Der Worker prüft beim Veröffentlichen den *gespeicherten* Handle; nach dem nächsten Verbinden/Verifizieren kann der alte Handle entfernt werden. Wirksam erst nach Worker-Deploy.

## Apify (öffentliche Konten als Inspiration)

Offizielles Plugin `apify` ist installiert (`https://mcp.apify.com`). **OAuth einmalig durch den Owner:** in Claude Code `/mcp` → `plugin:apify:apify` → Authenticate (Browser). Aus einer Cloud-Sitzung ohne lokalen Browser-Callback kann Claude das nicht auslösen. Danach: erst nur Verbindungstest, dann eine einzelne Profilabfrage (ein Profil, wenige Posts) mit dem kostenlosen Guthaben; Kosten vorher nennen, keine kostenpflichtigen Actors ohne Freigabe.

## Bio, Profilbild, Archivieren: nicht über die offizielle API

| Aktion | Graph API | Weg |
|---|---|---|
| Bio ändern | nein | App/Web manuell, oder beaufsichtigte Browser-Sitzung |
| Profilbild ändern | nein | App/Web manuell |
| Beitrag archivieren / alle archivieren | nein (nur Löschen, Kommentare aus) | App/Web manuell; Massenarchivierung beaufsichtigt in kleinen Chargen |

Sicherer Browser-Weg: nur in der **eigenen, bereits angemeldeten** Browser-Sitzung des Owners auf dessen Rechner (Claude in Chrome bzw. lokales Claude Code mit sichtbarem Browser), jeder Schritt sichtbar und bestätigt. Keine Passwörter/2FA-Codes an Claude, keine Headless-Läufe oder Cookies in CI, keine inoffiziellen APIs, keine Umgehung von Prüfungen. Eine Cloud-Sitzung hat keinen Zugriff auf diese Sitzung und eignet sich dafür nicht. Technisch geprüft: machbar, aber nicht ausgeführt. Instagram schränkt Automatisierung per Nutzungsbedingungen ein; für Einzelaktionen ist manuell schneller.

## Freigaberegel

Ohne ausdrückliche Freigabe im aktuellen Chat: nichts veröffentlichen, nichts am Profil ändern, nichts archivieren oder löschen. Vor jeder Schreibaktion Vorschau (Text, Medien, Zielkonto) zeigen.
