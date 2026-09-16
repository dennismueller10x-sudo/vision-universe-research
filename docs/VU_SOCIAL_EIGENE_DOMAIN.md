# VU SOCIAL — WARUM DER WORKER EINE EIGENE DOMAIN BRAUCHT

Stand: 2026-09-16 · Zweig `claude/vision-universe-social-os-eudjmx`

Der reale Owner-Test des Business-Login-Flows hat Meta zum ersten Mal die
richtige Frage gestellt. Die Antwort:

> „URL kann nicht geladen werden: Die Domain dieser URL ist nicht in den Domains
> der App vorhanden. Um diese URL laden zu können, füge alle Domains und
> Subdomains deiner App im Appdomain-Feld in deinen App-Einstellungen hinzu."

Der Owner hatte die Worker-Domain zu diesem Zeitpunkt bereits unter
App-Domains eingetragen und die Site-URL gesetzt.

---

## 1. Welche URL Meta beanstandet

Nachgerechnet am tatsächlich erzeugten Request, nicht geschätzt. Der
Business-Login-Dialog trägt sechs Parameter:

| Parameter | Wert |
|---|---|
| `client_id` | die App-ID |
| `redirect_uri` | `https://vision-universe-social.little-credit-15d3.workers.dev/social/meta/callback` |
| `state` | signiert, zehn Minuten gültig |
| `response_type` | `code` |
| `config_id` | `1555849235747979` |
| `override_default_response_type` | `true` |

**Genau ein Parameter enthält eine URL:** `redirect_uri`. Es gibt keinen
zweiten Kandidaten, kein verstecktes Feld, keine zweite Domain. Meta kann
also nur diesen einen Host meinen:

```
vision-universe-social.little-credit-15d3.workers.dev
```

Damit ist die Fehlersuche an dieser Stelle abgeschlossen. Die Frage ist nicht
mehr *welche* Domain, sondern *warum diese nicht angenommen wird*.

---

## 2. Warum `workers.dev` hier scheitert

`workers.dev` steht auf der **Public Suffix List** — nachgeprüft in der
kanonischen Liste, Zeile 12704, im Abschnitt `===BEGIN PRIVATE DOMAINS===`,
eingetragen von Cloudflare selbst:

```
pages.dev
r2.dev
workers.dev
```

Die Public Suffix List beantwortet genau eine Frage: **bis wohin reicht ein
Eigentümer.** Steht ein Suffix auf dieser Liste, behandelt jede Software, die
sie liest, alles darunter als eigenständige Domains verschiedener Eigentümer —
so wie `.de` oder `.com`.

`little-credit-15d3` ist kein Name, den Vision Universe registriert hat. Es ist
eine Kennung, die Cloudflare dem Konto zugewiesen hat. Unter einem Suffix, das
Cloudflare gehört.

Metas App-Domains-Feld ist eine **Eigentumsbehauptung**: „diese Domains gehören
zu meiner App." Eine solche Prüfung kann einen Host, der unter einem fremden
Public Suffix liegt, nicht wie eine eigene Domain behandeln — sonst könnte jeder
beliebige Worker-Betreiber Domains für sich beanspruchen, die ihm nicht gehören.

**Was hier belegt ist:** Meta beanstandet genau diesen Host; der Host liegt unter
einem Public Suffix, der Cloudflare gehört; der Eintrag des Owners hat nicht
gegriffen. **Was nicht belegt ist:** ob Meta intern genau diese Liste liest oder
eine eigene Regel anwendet. Das ist auch nicht nötig — die Konsequenz ist in
beiden Fällen dieselbe.

Cloudflare selbst sagt dasselbe von der anderen Seite:
[workers.dev ist für persönliche Projekte und Hobby-Projekte gedacht; produktive
Worker gehören auf eine Route oder eine Custom
Domain](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/).

Wir haben also zwei unabhängige Gründe für dieselbe Änderung. Weiter an Metas
Formularen zu drehen, würde bestenfalls eine Domain durchsetzen, die für den
Produktivbetrieb ohnehin die falsche ist.

---

## 3. Die minimale Änderung

Ziel: `social.visionuniverse.de`

### Voraussetzung, die zuerst geklärt wird

Eine Worker Custom Domain verlangt, dass die Zone `visionuniverse.de` auf
**diesem** Cloudflare-Konto liegt und aktiv ist. Liegt sie nicht dort, schlägt
`wrangler deploy` fehl und reißt die gesamte Deployment-Strecke mit.

Deshalb fragt der Workflow das jetzt vorher ab
(`provision-cloudflare.mjs --list-zones`), statt es beim Deployen
herauszufinden. Nur lesend — Zonennamen stehen im öffentlichen DNS.

Bekannt ist bisher nur: `research.visionuniverse.de` zeigt per CNAME auf
`dennismueller10x-sudo.github.io`, also auf GitHub Pages. Über die Nameserver
der Zone sagt das nichts.

### Was sich im Repository ändert

Zwei Zeilen in `workers/vision-universe-social/wrangler.toml`:

```toml
PUBLIC_BASE_URL = "https://social.visionuniverse.de"

[[routes]]
pattern = "social.visionuniverse.de"
custom_domain = true
```

`wrangler deploy` legt DNS-Eintrag und Zertifikat dann selbst an. Mehr ist es
nicht — die Redirect-URI wird aus `PUBLIC_BASE_URL` abgeleitet und folgt
automatisch.

`workers_dev` bleibt zunächst aktiv. Der Worker ist dann unter beiden Adressen
erreichbar, was den Übergang prüfbar macht; der OAuth-Flow benutzt
ausschließlich `PUBLIC_BASE_URL`. Abschalten ist später eine Zeile.

### Was sich bei Meta ändert

| Feld | Wert |
|---|---|
| App-Domains | `visionuniverse.de` |
| Website / Site-URL | `https://social.visionuniverse.de/` |
| Gültige OAuth-Redirect-URIs | `https://social.visionuniverse.de/social/meta/callback` |

`visionuniverse.de` als App-Domain deckt die Subdomain mit ab. Die Domain
gehört nachweisbar dem Owner — genau das, was das Feld behauptet.

---

## 4. Eine Falle, die sich selbst zurückgesetzt hätte

Der Workflow trägt nach jedem Deployment die öffentliche Adresse nach. Er liest
sie aus der wrangler-Ausgabe, mit einem Muster, das **nur** `*.workers.dev`
trifft:

```
grep -oE 'https://[a-z0-9.-]+\.workers\.dev'
```

Solange es nur diese eine Adresse gab, war das richtig. Mit einer Custom Domain
wäre es falsch geworden: `workers_dev` bleibt aktiv, wrangler nennt die
workers.dev-Adresse weiterhin — und der Nachtrag hätte die eigene Domain damit
überschrieben.

Beim nächsten Deployment stünde wieder die Adresse in der Konfiguration, die
Meta gerade abgelehnt hat. Der Lauf bliebe **grün**. Der Fehler tauchte erst im
Meta-Dialog wieder auf, wo er wie ein Meta-Problem aussieht.

Behoben, bevor er eintreten konnte: der Nachtrag **füllt eine Lücke und ersetzt
nie**. Eine bewusst eingetragene Adresse bleibt stehen; wer sie wirklich ändern
will, sagt es mit `--force-url`. Sieben Tests (U1–U7) halten das fest, darunter
einer, der genau das Muster des Workflows gegen beide Adressen prüft.

---

## 5. Was unverändert bleibt

- `state`-Signatur, Nonce-Cookie, Admin-Schutz, `appsecret_proof`, Redaktion.
- Kein Beitrag veröffentlicht. Der Worker hat keinen Publishing-Endpunkt.
- Kein Meta-Login ausgeführt.
- Keine Secrets gelesen, ausgegeben oder verändert. Die Domain-Umstellung
  berührt weder `META_APP_ID` noch `META_APP_SECRET` noch den Admin-Schlüssel.
- Der Business-Dialog bleibt, wie er ist: `config_id`, kein `scope`. An der
  Domain hängt die Erreichbarkeit, nicht der Dialog.
