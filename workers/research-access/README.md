# Research Development Access Gate

Der Cloudflare-Worker liegt als globale **Zone Route** vor dem bestehenden
GitHub-Pages-Origin. Bestehende Seiten, Daten und Navigation bleiben unverändert.
Alle Pfade sind geschützt, auch statische Research-Daten und `/api/*`. Die
Passwortseite hat inline CSS und benötigt keine öffentlichen Asset-Ausnahmen.
Es gibt keinen offenen Healthcheck.

## Aktivierung

GitHub Pages kann selbst keine serverseitigen Secrets oder Middleware ausführen.
Die Implementierung wird deshalb erst wirksam, wenn die Domain über Cloudflare
proxied wird und die Route `research.visionuniverse.de/*` auf diesen Worker zeigt.
Den bestehenden DNS-Origin beibehalten; **keine Worker Custom Domain** anlegen.
Cloudflare verwendet bei `fetch(request)` auf dieser Zone Route den bestehenden
Origin, ohne den Worker erneut aufzurufen.

Aus `workers/research-access/` mit einem für Workers und diese Zone berechtigten
Cloudflare-Konto ausführen:

```sh
npx wrangler@4 deploy
npx wrangler@4 secret put RESEARCH_ACCESS_PASSWORD
```

Der Secret-Wert wird interaktiv eingegeben. Ein langes, zufälliges Passwort
verwenden. Niemals einen echten Wert committen oder als CLI-Argument übergeben.
Ohne Secret antwortet der Worker mit 503 und gibt keinen Research-Inhalt frei.
`.env.example` dokumentiert lediglich `RESEARCH_ACCESS_PASSWORD=<secret>`;
eine lokale `.env` setzt kein Cloudflare-Secret.

Nach Aktivierung `/`, einen Deep-Link und eine Daten-/API-URL ohne Cookie auf der
Live-Domain prüfen; anschließend Login, Reload und Logout prüfen. Erst eine
aktive Route mit proxied DNS schützt die Live-Domain. Eine vorgeschaltete Route
schützt ausschließlich diese Domain: das öffentliche GitHub-Repository, direkte
GitHub-Pages-Adressen und separate API-/Realtime-Domains bleiben eigenständige
Ursprünge und werden durch diesen Development Gate nicht privat.

## Cookie und Logout

`__Host-research_access` ist HMAC-SHA-256-signiert und gilt 30 Tage, mit serverseitig
geprüftem Ablaufdatum. `Path=/`, `HttpOnly`, `Secure`, `SameSite=Lax`, `Max-Age`
und `Expires` ermöglichen dauerhaften First-Party-Zugang auch in iPhone/Safari.
Das Cookie ist hostgebunden an `research.visionuniverse.de`; andere Subdomains
können es nicht setzen. Ein Passwortwechsel macht bestehende Cookies ungültig.
Authentifizierte Antworten werden als `private, no-store` ausgeliefert.

`/__research/logout` öffnen und **Zugang zurücksetzen** drücken. Der POST löscht
nur das Access-Cookie und leitet zur Passwortseite weiter. Login und Logout
akzeptieren ausschließlich POSTs von derselben Origin. Deep-Links werden nach
erfolgreicher Eingabe als lokales Ziel wieder geöffnet.

## Tests

```sh
node --test workers/research-access/tests/*.test.mjs
PLAYWRIGHT_PATH=/path/to/playwright node workers/research-access/tests/browser-qa.mjs
```

Die Tests prüfen globale Sperre, Deep-Links, Research-Daten/APIs, falsches und
richtiges Passwort, Cookie-Attribute, Navigation/Reload, neuen Browser ohne
Cookie, Logout, Manipulation, Ablauf, Passwortwechsel, fehlendes Secret,
Redirect-Sicherheit und Redirect-Loops. Kein echtes Passwort wird verwendet.
Die Browser-QA prüft denselben Ablauf in Chromium und iPhone-Safari/WebKit,
einschließlich nativer Formulare, Asset-Laden und Wiederherstellen des persistenten
Cookies nach dem Schließen eines Browser-Kontexts. Der Origin ist dafür eine
isolierte Testseite; ein reales iPhone und die Live-Route werden nicht simuliert.
