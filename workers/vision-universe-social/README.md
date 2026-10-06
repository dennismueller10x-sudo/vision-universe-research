# vision-universe-social — Cloudflare Worker

Die serverseitige Runtime fuer das, was GitHub Pages technisch nicht ausfuehren kann.

---

## Abgrenzung

**Dieser Worker ist kein VU-Backend.**

Engines, Content-Pipeline, Learning Engine, Command Center und Datenartefakte bleiben, wo
sie sind: im Repository, ausgefuehrt von GitHub Actions, ausgeliefert von GitHub Pages.
Nichts davon wandert hierher.

Der Grund fuer diesen Worker ist genau einer: **ein OAuth-Callback ist ein HTTP-Endpunkt,
und ein statischer Hoster hat keinen.** Alles, was ohne Server-Laufzeit auskommt, bleibt
draussen.

| | Wo es laeuft |
|---|---|
| OAuth, Token-Tausch, Token-Haltung, Verifikation | **dieser Worker** |
| Signale, Trend, Opportunity, Content, Learning | GitHub Actions |
| Command Center, Artefakte | GitHub Pages |
| Dauerhafte Marktdaten-Ablage | R2 via S3-Treiber (unveraendert) |

---

## Routen

| Route | Methode | Schutz | Zweck |
|---|---|---|---|
| `/social/meta/connect` | GET | Admin-Schluessel | Leitet zum Meta-Dialog |
| `/social/meta/callback` | GET | `state` + Cookie | Rueckweg von Meta, Token-Tausch |
| `/social/meta/status` | GET | Admin-Schluessel | Zustand als JSON, **ohne Token** |
| `/social/meta/verify` | GET/POST | Admin-Schluessel | Faehigkeiten gegen die echte API pruefen |
| `/social/meta/disconnect` | **POST** | Admin-Schluessel | Trennen, loeschen, bei Meta widerrufen |
| `/health` | GET | oeffentlich | Lebendtest, ohne Kontodaten |

`disconnect` ist bewusst POST-only: ein Trennen per GET waere ueber einen untergeschobenen
Link ausloesbar.

---

## Die drei Entscheidungen, die diesen Worker praegen

### 1. Der `state` braucht keinen Speicher

Der uebliche Weg legt den `state` serverseitig ab und schlaegt ihn im Callback nach. Das
verlangt einen Speicher fuer etwas, das zehn Minuten lebt.

Hier ist der `state` **selbst-verifizierbar**: er traegt seinen eigenen HMAC, dessen
Schluessel aus `META_APP_SECRET` abgeleitet wird. Dazu ein `__Host-`-Cookie mit derselben
Nonce.

Beides zusammen deckt zwei verschiedene Angriffe ab:

- **HMAC** faengt einen `state`, den wir nie ausgestellt haben.
- **Cookie** faengt einen `state`, den wir ausgestellt haben, der aber in einem *fremden*
  Browser ankommt — der klassische CSRF-Fall, in dem jemand dem Owner seinen eigenen
  Autorisierungslink unterschiebt.

Ein HMAC allein wuerde den zweiten Fall nicht fangen. Ein Cookie allein nicht den ersten.

### 2. Gespeichert wird das PAGE-Token, nicht das User-Token

Ein langlebiges **User**-Token laeuft nach rund 60 Tagen ab. Ein **Page**-Token, das aus
einem langlebigen User-Token abgeleitet wurde, laeuft nicht ab, solange die Berechtigung
besteht. Instagram-Veroeffentlichung und -Insights laufen ohnehin ueber das Page-Token.

Also: User-Token besorgen → Page-Token ableiten → Page-Token speichern → User-Token
verwerfen. Das ist der Unterschied zwischen *alle 60 Tage neu autorisieren* und *einmal
autorisieren*.

### 3. Das Token verlaesst den Worker nie

Es gibt **keinen Endpunkt, der es zurueckgibt.** `/status` liefert stattdessen einen
SHA-256-Fingerabdruck, der die einzige Frage beantwortet, die man ohne den Wert stellen
muss: *ist das noch dasselbe Token?*

`verify` laeuft deshalb **im Worker** und nicht beim Aufrufer. Ein Endpunkt, der das Token
herausgibt, damit jemand anders prueft, waere ein Exfiltrationsendpunkt mit guter Absicht.

Das ist der Sicherheitsgewinn gegenueber der urspruenglich empfohlenen manuellen Variante:
dort haette das Token als GitHub-Secret vorgelegen — an einem zweiten Ort, mit einem
zweiten Kreis von Leseberechtigten.

---

## Speicher

**Cloudflare KV, genau ein Datensatz.**

Kein D1: eine relationale Datenbank fuer eine Zeile waere die Parallelarchitektur, die
ausdruecklich nicht entstehen soll.

Kosten: der kostenlose Tarif deckt 100.000 Lesevorgaenge und 1.000 Schreibvorgaenge am Tag
ab. Dieser Worker schreibt bei einer Autorisierung und danach hoechstens einmal je
Verifikationslauf — einstellig pro Tag. Der Abstand zur Freigrenze betraegt drei
Groessenordnungen.

---

## Konfiguration

### Secrets — nur Namen, niemals Werte

```
META_APP_ID            bereits gesetzt
META_APP_SECRET        bereits gesetzt
VU_SOCIAL_ADMIN_KEY    NOCH ZU SETZEN, mindestens 32 Zeichen
META_WEBHOOK_SECRET    erst fuer Webhooks noetig
```

```bash
npx wrangler secret put VU_SOCIAL_ADMIN_KEY
npx wrangler secret list        # zeigt Namen, keine Werte
```

Der Worker **lehnt einen Admin-Schluessel unter 32 Zeichen ab.** Er hat keinen Zaehler fuer
Fehlversuche; die einzige belastbare Verteidigung gegen Durchprobieren ist ein Schluessel,
der sich nicht durchprobieren laesst.

### Variablen

```
PUBLIC_BASE_URL     die oeffentliche URL dieses Workers
META_API_VERSION    v21.0
META_IG_ACCOUNT_ID  optional: sperrt den Callback auf genau dieses Konto
```

`PUBLIC_BASE_URL` bildet die `redirect_uri`
(`<PUBLIC_BASE_URL>/social/meta/callback`). **Genau dieser Wert** muss in der Meta-App
unter *Facebook Login for Business → Einstellungen → Gueltige OAuth-Redirect-URIs*
eingetragen sein. Meta vergleicht zeichengenau.

### KV

```bash
npx wrangler kv namespace create VU_SOCIAL_KV
# die zurueckgegebene id in wrangler.toml eintragen
```

---

## Vor dem ersten Deployment

Der Worker existiert bereits ausserhalb dieses Repositories. `wrangler deploy` ersetzt den
dort liegenden Code **vollstaendig und ohne Rueckfrage**.

```bash
export CLOUDFLARE_API_TOKEN=...      # Werte nie ins Repository
export CLOUDFLARE_ACCOUNT_ID=...
node scripts/social/preflight-worker.mjs
```

Das Skript liest den aktuellen Stand und meldet Groesse, Fingerabdruck, Bindungen und
Secret-Namen. Steht dort fremde Logik, sagt es das — **und nennt den Sicherungsbefehl**
(`npx wrangler download vision-universe-social`), bevor irgendetwas ersetzt wird.

Ohne Zugangsdaten endet es mit 0 und einem Statusbericht: ein fehlender Zugang ist eine
Konfigurationsfrage, kein Baufehler.

---

## Tests

```bash
node --test "workers/vision-universe-social/tests/*.test.mjs"
```

**44 Tests, ohne Cloudflare und ohne Meta.** Moeglich ist das, weil der Worker
ausschliesslich Web-Standards benutzt — `fetch`, `crypto.subtle`, `URL`, `Request`,
`Response`. Node 22 hat alle davon; KV und Graph-API werden eingesetzt
(`tests/harness.mjs`).

Der Graph-Doppelgaenger ist **kein Nachbau von Meta**. Er haelt sich an das, was die Graph
API dokumentiert zurueckgibt, und laesst sich auf jeden Fehlerfall stellen. Wer damit gruen
ist, hat bewiesen, dass unser Ablauf stimmt — nicht, dass Meta mitspielt.

Die scharfen Tests:

| Test | Prueft |
|---|---|
| `W11` | Bei CSRF-Verdacht geht **kein einziger** Graph-Aufruf hinaus |
| `W12` | Ein gueltiger `state` im falschen Browser wird abgewiesen |
| `W16` | Gespeichert wird das Page-Token; das User-Token hinterlaesst keinen Rest |
| `W17` | Die Erfolgsseite zeigt niemals ein Token |
| `W20` | Ein Token, das den Testabruf nicht besteht, wird nicht gespeichert |
| `W26` | `verify` fuehrt **keinen** POST gegen die Graph API aus |
| `S4` | Ein von Meta zurueckgespiegeltes Token erreicht keine Antwort |
| `S11` | Kontonamen werden als Text eingesetzt, nicht als Markup |

---

## Was dieser Worker nicht tut

- **Er veroeffentlicht nichts.** Es gibt keinen Publishing-Endpunkt. Wenn Autopublish
  freigegeben wird, kommt er hierher (das Token liegt hier) — als eigener, getesteter
  Schritt, nicht als Nebeneffekt.
- **Er empfaengt keine Webhooks.** Die Signaturpruefung ist implementiert und getestet; das
  Abonnement wird im App-Dashboard eingerichtet und ist noch nicht erfolgt.
- **Er kennt die VU-Engines nicht.** Er weiss nichts ueber Trends, Gelegenheiten oder
  Content.
