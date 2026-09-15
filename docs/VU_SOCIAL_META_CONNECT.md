# VU SOCIAL — META VERBINDEN

Stand: 2026-09-15 · Zweig `claude/vision-universe-social-os-eudjmx`

Diese Anleitung fuehrt von "Worker ist gebaut" zu **META_CONNECTED**.

> **In dieser Anleitung wird niemals ein Zugangsdatum verlangt und niemals eines
> ausgegeben.** Alle Werte setzen Sie selbst, direkt bei Cloudflare und bei Meta.
> Nichts davon gehoert in einen Chat, ein Ticket oder ein Repository.

**Es wird kein Beitrag veroeffentlicht.** Der globale Autopublish-Schalter bleibt
aus, und alle Schritte hier sind lesend.

---

## Voraussetzungen

- Ein Instagram-Konto, das ein **Professional-Konto** ist (Business oder Creator).
- Eine **Facebook-Seite**, die mit diesem Instagram-Konto verbunden ist.
- Ihre Meta-App mit hinterlegtem `META_APP_ID` und `META_APP_SECRET`.
- Ein Cloudflare-Konto mit dem Worker `vision-universe-social`.

Wenn Instagram und Facebook-Seite nicht verbunden sind, bricht Schritt 6 mit einer
klaren Meldung ab und speichert nichts. Das ist dann eine Einrichtungsfrage in der
Meta-Business-Suite, kein Fehler dieses Systems.

---

## Schritt 1 — Admin-Schluessel erzeugen und setzen

Der Schluessel schuetzt `connect`, `status`, `verify` und `disconnect`. Ohne ihn
koennte ein Fremder den Flow starten, **sein** Konto autorisieren und damit Ihre
Verbindung ueberschreiben.

Erzeugen (Beispiel, lokal auf Ihrem Rechner):

```bash
openssl rand -base64 48
```

Setzen:

```bash
cd workers/vision-universe-social
npx wrangler secret put VU_SOCIAL_ADMIN_KEY
# den erzeugten Wert einfuegen
```

**Mindestens 32 Zeichen.** Der Worker lehnt kuerzere ab — er hat keinen Zaehler
fuer Fehlversuche, und die einzige belastbare Verteidigung gegen Durchprobieren
ist ein Schluessel, der sich nicht durchprobieren laesst.

Bewahren Sie den Wert in Ihrem Passwortmanager auf. Sie brauchen ihn in Schritt 6
und spaeter als GitHub-Secret.

---

## Schritt 2 — KV-Namespace anlegen

Hier liegt spaeter genau ein Datensatz: die Verbindung.

```bash
npx wrangler kv namespace create VU_SOCIAL_KV
```

Die Ausgabe enthaelt eine `id`. Tragen Sie sie in
`workers/vision-universe-social/wrangler.toml` ein — sie ersetzt
`REPLACE_WITH_KV_NAMESPACE_ID`.

---

## Schritt 3 — Oeffentliche URL eintragen

In derselben Datei ersetzen Sie `REPLACE_WITH_WORKER_PUBLIC_URL` durch die
oeffentliche URL Ihres Workers, **ohne Schraegstrich am Ende**. Zum Beispiel:

```toml
PUBLIC_BASE_URL = "https://vision-universe-social.IHR-SUBDOMAIN.workers.dev"
```

Daraus baut der Worker die Redirect-URI:

```
https://vision-universe-social.IHR-SUBDOMAIN.workers.dev/social/meta/callback
```

Notieren Sie diese Adresse — Schritt 5 braucht sie **zeichengenau**.

---

## Schritt 4 — Preflight und Deployment

**Zuerst pruefen, was im vorhandenen Worker liegt.** `wrangler deploy` ersetzt den
dort liegenden Code vollstaendig und ohne Rueckfrage.

```bash
export CLOUDFLARE_API_TOKEN=...      # Token mit "Workers Scripts: Read"
export CLOUDFLARE_ACCOUNT_ID=...
node scripts/social/preflight-worker.mjs
```

Lesen Sie die Zeile **"Vorhandener Code"**:

| Meldung | Bedeutung |
|---|---|
| `ok` … Platzhalter-Groesse | Dort liegt nichts von Wert. Weiter. |
| `ok` … stammt erkennbar aus diesem Repository | Aktualisierung, kein Verlust. Weiter. |
| `warn` … **FREMDE Logik** | **Halt.** Erst sichern: `npx wrangler download vision-universe-social` |

Wenn alles geklaert ist:

```bash
cd workers/vision-universe-social
npx wrangler deploy
```

Danach der Lebendtest — er verlangt keinen Schluessel:

```
https://IHRE-WORKER-URL/health
```

Erwartet: `"alive": true`. Steht dort noch etwas unter
`missingConfiguration`, fehlt genau das.

---

## Schritt 5 — Redirect-URI in der Meta-App eintragen

Im Meta-App-Dashboard:

**Facebook Login for Business → Einstellungen → Gueltige OAuth-Redirect-URIs**

Dort die Adresse aus Schritt 3 eintragen:

```
https://IHRE-WORKER-URL/social/meta/callback
```

**Meta vergleicht zeichengenau.** Ein fehlendes `https`, ein zusaetzlicher
Schraegstrich oder eine andere Subdomain fuehren zu
*"URL Blocked: This redirect failed"* — das ist dann kein Fehler dieses Systems,
sondern eine Abweichung in dieser Zeile.

Speichern nicht vergessen.

---

## Schritt 6 — DAS OWNER GATE: Autorisieren

> **Dies ist der Schritt, der Ihre persoenliche Meta-Autorisierung verlangt.**
> Er kann nicht automatisiert werden — und er soll es nicht.

### Was Sie oeffnen

Im Browser, in dem Sie bei Facebook angemeldet sind:

```
https://IHRE-WORKER-URL/social/meta/connect?key=<IHR-ADMIN-SCHLUESSEL>
```

Der Schluessel muss URL-kodiert sein. Enthaelt er `+`, `/` oder `=`, verwenden Sie
stattdessen den Kopfzeilen-Weg.

> **Setzen Sie den Schluessel als Umgebungsvariable, statt ihn in jeden Befehl zu
> tippen.** Ein Wert, den Sie direkt in `curl` schreiben, steht danach in Ihrer
> Shell-Historie — also in einer Datei, an die beim Erzeugen des Schluessels
> niemand gedacht hat.

```bash
export VU_SOCIAL_ADMIN_KEY=...      # einmal setzen, nicht in jeden Befehl tippen
curl -sI -H "Authorization: Bearer $VU_SOCIAL_ADMIN_KEY" \
  https://IHRE-WORKER-URL/social/meta/connect
```

und oeffnen die Adresse aus der `location`-Kopfzeile.

### Was Meta Ihnen zeigen sollte

1. **Den Meta-Anmeldedialog** mit dem Namen Ihrer App.
2. Eine **Auswahl der Facebook-Seite**, fuer die Sie Rechte erteilen — waehlen Sie
   die Seite, die mit dem Vision-Universe-Instagram-Konto verbunden ist.
3. Eine **Liste der angefragten Berechtigungen**:

   - Zugriff auf Profil und Beitraege Ihres Instagram-Kontos (`instagram_basic`)
   - Inhalte auf Instagram veroeffentlichen (`instagram_content_publish`)
   - Insights Ihres Instagram-Kontos lesen (`instagram_manage_insights`)
   - Kommentare verwalten (`instagram_manage_comments`)
   - Liste Ihrer Seiten sehen (`pages_show_list`)
   - Seiteninhalte lesen (`pages_read_engagement`)

### Was Sie bestaetigen muessen

**Lassen Sie alle sechs Berechtigungen aktiviert.**

Meta erlaubt es, einzelne abzuwaehlen. Das System kommt damit zurecht — es leitet
die Faehigkeiten aus den *tatsaechlich erteilten* Rechten ab und meldet die
fehlenden. Aber:

- ohne `instagram_content_publish` kann spaeter **nicht veroeffentlicht** werden
- ohne `instagram_manage_insights` sind **keine Kennzahlen** lesbar, und ohne
  Kennzahlen lernt das System nichts
- ohne `instagram_basic` oder `pages_show_list` bricht die Verbindung ab, weil sich
  das Konto nicht aufloesen laesst

### Woran Sie erkennen, dass es funktioniert hat

Sie landen auf einer Seite mit der Ueberschrift **"Die Verbindung steht."** und
sehen:

| Feld | Was dort steht |
|---|---|
| Instagram-Konto | `@ihr_kontoname` |
| Instagram-Account-ID | eine lange Zahl |
| Facebook-Seite | der Seitenname |
| Token | `im Worker gespeichert · Fingerabdruck <16 Hex-Zeichen>` |
| Erteilte Rechte | die sechs Rechte |

Darunter **"Nachweise"** mit vier Zeilen, die `erfuellt` sein sollten.

**Auf dieser Seite steht kein Token** — und das ist Absicht. Sie sehen einen
Fingerabdruck, der die einzige Frage beantwortet, die man ohne den Wert stellen
muss: *ist das noch dasselbe Token?*

### Wenn etwas schiefgeht

Jede Fehlerseite nennt einen Grund in `<code>`-Schrift. Es wurde dann **nichts
gespeichert**, und eine bestehende Verbindung ist unveraendert.

| Grund | Bedeutung | Was tun |
|---|---|---|
| `accessDenied` | Sie haben im Dialog abgebrochen | Link erneut oeffnen |
| `expired` | Der Vorgang ist aelter als 10 Minuten | Link erneut oeffnen |
| `missingCookie` | Anderer Browser als beim Start | Beides im selben Browser |
| `noInstagramAccount` | Keine Ihrer Seiten hat ein verbundenes Instagram-Professional-Konto | In der Meta-Business-Suite verbinden |
| `missingEssentialPermissions` | Grundrechte wurden abgewaehlt | Erneut, alle Rechte bestaetigen |
| `accountMismatch` | `META_IG_ACCOUNT_ID` zeigt auf ein anderes Konto | Variable pruefen |
| `signatureMismatch` | Der `state` stammt nicht von diesem Worker | Immer ueber `/connect` starten, nie einen gespeicherten Link |

---

## Schritt 7 — Verifizieren

```bash
curl -s -H "Authorization: Bearer $VU_SOCIAL_ADMIN_KEY" \
  https://IHRE-WORKER-URL/social/meta/verify
```

Der Lauf **veroeffentlicht nichts.** Er liest: Konto, Rechte, Insights, Medien.

Erwartet: `"verdict": "VERIFIED"` und `"published": false`.

Die fuenf Pruefungen:

| Pruefung | Bedeutet |
|---|---|
| Konto erreichbar | Das gespeicherte Token funktioniert |
| Instagram-Professional-Konto erkannt | Die Aufloesung ueber die Seite hat geklappt |
| Tatsaechliche Rechte | Was Meta wirklich erteilt hat |
| Publishing Capability | `instagram_content_publish` liegt vor |
| Insights Capability | Kennzahlen sind lesbar |
| Analytics Read | Medien sind lesbar |

> **Publishing wird ueber das erteilte RECHT nachgewiesen, nicht ueber einen
> Testbeitrag.** Ein Testbeitrag waere ein echter Beitrag — und der ist eine
> eigene Owner-Entscheidung, kein Nebeneffekt einer Verifikation.

`"verdict": "INCOMPLETE"` bedeutet, dass mindestens eine Pruefung `FAIL` ist. Das
Feld `note` sagt bei jeder, was los war.

---

## Schritt 8 — Den Zustand ins Repository holen

Damit das Command Center die Verbindung anzeigt, hinterlegen Sie zwei
**GitHub-Actions-Secrets** (Settings → Secrets and variables → Actions):

```
VU_SOCIAL_WORKER_URL     die oeffentliche Worker-URL
VU_SOCIAL_ADMIN_KEY      derselbe Wert wie im Worker
```

Dann:

```bash
node scripts/social/fetch-meta-status.mjs --out social/data --verify
```

Das schreibt `social/data/meta-connection.json` — **ohne Token**. Das Skript
prueft die Antwort vor dem Schreiben noch einmal auf Tokenformen und bricht ab,
falls etwas durchkommt: ein Artefakt in der Git-Historie laesst sich nicht
zurueckholen.

Im Command Center erscheint die Verbindung anschliessend unter **Health →
Meta-Verbindung**.

---

## Schritt 9 — Zielkonto festnageln (empfohlen)

Sobald die Instagram-Account-ID bekannt ist, tragen Sie sie in `wrangler.toml`
ein:

```toml
META_IG_ACCOUNT_ID = "17841400000000000"
```

und deployen erneut. Danach akzeptiert der Callback **nur noch dieses Konto** —
eine versehentliche Autorisierung mit einem falschen Konto kann die Verbindung
dann nicht mehr ueberschreiben.

---

## Damit ist META_CONNECTED erreicht

| Kriterium | Nachweis |
|---|---|
| OAuth produktiv funktionsfaehig | Schritt 6 endet auf "Die Verbindung steht." |
| Instagram-Konto verbunden | Kontoname und ID auf der Erfolgsseite |
| Token sicher gespeichert | Cloudflare KV; kein Endpunkt gibt es heraus |
| Instagram Account automatisch aufgeloest | ueber die Facebook-Seite, ohne Handeingabe |
| Reale Permissions verifiziert | Schritt 7, Zeile "Tatsaechliche Rechte" |
| Insights lesbar | Schritt 7, "Insights Capability" |
| Publishing Capability nachgewiesen | Schritt 7, ueber das erteilte Recht |
| **Kein echter Post veroeffentlicht** | `"published": false` |
| Tests gruen | `node --test "social/tests/*.test.mjs"` und `workers/**/tests/*` |
| Keine Secrets offengelegt | `node scripts/social/assert-no-secrets.mjs` |
| Bestehende VU-Systeme unveraendert | `node --test "quant/tests/*.test.mjs"` |

**Ein erfolgreiches Deployment allein ist nicht das Ziel.** Das Ziel ist die Liste
oben, vollstaendig.

---

## Was danach NICHT automatisch passiert

`GLOBAL_AUTOPUBLISH` und `PROVIDER_META` bleiben **aus**. Eine bestehende
Verbindung ist keine Freigabe zu veroeffentlichen.

Der naechste Schritt waere Autonomiestufe 3 — das System plant, Sie geben frei.
Der Weg dorthin steht in `docs/VU_SOCIAL_OWNER_DECISIONS.md`, Entscheidung 2.

---

## Verbindung trennen

```bash
curl -s -X POST -H "Authorization: Bearer $VU_SOCIAL_ADMIN_KEY" \
  https://IHRE-WORKER-URL/social/meta/disconnect
```

Loescht den Datensatz einschliesslich Token und widerruft die Rechte bei Meta.
Nur `POST` — ein Trennen per `GET` waere ueber einen untergeschobenen Link
ausloesbar.

Bestaetigt der Widerruf nicht (`"revokedAtMeta": false`), entfernen Sie die
Berechtigung zusaetzlich in den Facebook-Einstellungen unter
**Business-Integrationen**.
