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

### Voraussetzung — abgefragt, nicht vermutet

Eine Worker Custom Domain verlangt, dass die Zone auf **diesem**
Cloudflare-Konto liegt und aktiv ist. Liegt sie nicht dort, schlägt
`wrangler deploy` fehl und reißt die gesamte Deployment-Strecke mit.

Deshalb fragt der Workflow das ab, statt es beim Deployen herauszufinden.
Ergebnis aus Lauf
[35051837588](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/35051837588):

```
Zonenliste lesbar: true
visionuniverse.de auf dem Konto: false
Zonen auf dem Konto: (keine)
```

Die erste Zeile ist wichtig: die Liste war **lesbar**. Das Ergebnis ist also
eine Antwort und kein fehlendes Recht. Auf dem Konto liegt **keine einzige
Zone** — es gibt auch keine andere Domain, die man stattdessen nehmen könnte.

Damit ist die Sache entschieden: `visionuniverse.de` muss auf das
Cloudflare-Konto, und das geht nur über die Nameserver.

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

## 5. Die Owner-Aktion — und was dabei zu beachten ist

`visionuniverse.de` bei Cloudflare hinzufügen (Add a site). Cloudflare liest die
vorhandenen DNS-Einträge ein und nennt die zwei Nameserver, die beim Registrar
einzutragen sind.

**Das ist kein Formularfeld, sondern eine DNS-Umstellung für die ganze Domain.**
Ab dem Wechsel beantwortet Cloudflare jede Anfrage zu `visionuniverse.de` —
auch die, die mit diesem Projekt nichts zu tun haben. Zwei Dinge deshalb
**vor** dem Nameserver-Wechsel prüfen, in der von Cloudflare importierten
Liste:

| Eintrag | Warum |
|---|---|
| **MX** (und SPF/DKIM als TXT) | Fehlt ein MX-Eintrag nach dem Wechsel, kommt keine E-Mail mehr an dieser Domain an. Das ist der Schaden, der bei solchen Umstellungen am häufigsten passiert und am spätesten auffällt. |
| **`research`** → `dennismueller10x-sudo.github.io` | Das ist die bestehende Vision-Universe-Seite auf GitHub Pages. Der Eintrag muss da sein, sonst ist die Seite nach dem Wechsel weg. Für GitHub Pages zunächst **DNS only** (graue Wolke) wählen — Proxy erst einschalten, wenn die Seite nachweislich läuft. |

Der Import ist gut, aber nicht garantiert vollständig. Die Liste einmal gegen
die aktuelle DNS-Konfiguration beim jetzigen Anbieter zu halten, kostet fünf
Minuten und verhindert genau den Fall, den man hinterher nicht mehr schnell
repariert bekommt.

Sobald die Zone aktiv ist, meldet der nächste Lauf sie von selbst
(`Zone aktiv: true`) — dann sind es die zwei Zeilen aus §3, und die
Meta-Felder wechseln auf `social.visionuniverse.de`.

### Falls die Domain nicht zu Cloudflare soll

Dann braucht der Callback eine andere Server-Laufzeit unter einer eigenen
Domain. GitHub Pages scheidet aus — es ist statisch und kann keinen
OAuth-Callback beantworten; das war bereits der Befund aus Phase A. Das wäre
eine echte Architekturentscheidung und keine Konfigurationsänderung, deshalb
steht sie hier nur als Möglichkeit und nicht als Empfehlung.

---

## 6. Was unverändert bleibt

- `state`-Signatur, Nonce-Cookie, Admin-Schutz, `appsecret_proof`, Redaktion.
- Kein Beitrag veröffentlicht. Der Worker hat keinen Publishing-Endpunkt.
- Kein Meta-Login ausgeführt.
- Keine Secrets gelesen, ausgegeben oder verändert. Die Domain-Umstellung
  berührt weder `META_APP_ID` noch `META_APP_SECRET` noch den Admin-Schlüssel.
- Der Business-Dialog bleibt, wie er ist: `config_id`, kein `scope`. An der
  Domain hängt die Erreichbarkeit, nicht der Dialog.
