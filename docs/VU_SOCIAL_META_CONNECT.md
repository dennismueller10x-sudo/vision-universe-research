# VU SOCIAL — META VERBINDEN

Stand: 2026-09-15 · Zweig `claude/vision-universe-social-os-eudjmx`

Der Worker laeuft. KV ist angebunden, `META_APP_ID` und `META_APP_SECRET` sind
gesetzt geblieben, alle Admin-Endpunkte sind verschlossen. Was jetzt noch fehlt,
sind drei Handlungen, die niemand ausser Ihnen vornehmen kann.

> **Hier wird nie ein Zugangsdatum verlangt und nie eines ausgegeben.** Die Werte
> setzen Sie selbst, direkt bei Cloudflare und bei Meta. Nichts davon gehoert in
> einen Chat, ein Ticket oder ein Repository.

**Es wird kein Beitrag veroeffentlicht.** Der globale Autopublish-Schalter bleibt
aus, und der Worker hat ueberhaupt keinen Endpunkt zum Veroeffentlichen.

---

## Die Adressen

| | |
|---|---|
| Worker | `https://vision-universe-social.little-credit-15d3.workers.dev` |
| Lebendtest (offen) | `https://vision-universe-social.little-credit-15d3.workers.dev/health` |
| **Redirect-URI fuer Meta** | `https://vision-universe-social.little-credit-15d3.workers.dev/social/meta/callback` |
| Verbinden (Schluessel noetig) | `https://vision-universe-social.little-credit-15d3.workers.dev/social/meta/connect` |

Deployt von Lauf
[34975576298](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/34975576298).
KV-Namespace `582accaa66bf471a833b3813a6d2a45b`, gebunden als `VU_SOCIAL_KV`.

---

## Voraussetzungen

- Ein Instagram-Konto, das ein **Professional-Konto** ist (Business oder Creator).
- Eine **Facebook-Seite**, die mit diesem Instagram-Konto verbunden ist.

Wenn Instagram und Facebook-Seite nicht verbunden sind, bricht Schritt 4 mit einer
klaren Meldung ab und speichert nichts. Das ist dann eine Einrichtungsfrage in der
Meta-Business-Suite, kein Fehler dieses Systems.

---

## Was bereits erledigt ist

Diese Schritte standen frueher in dieser Anleitung. Sie sind ueber GitHub Actions
gelaufen und muessen nicht wiederholt werden:

- **KV-Namespace angelegt und gebunden.** Genau ein Datensatz liegt spaeter darin.
- **Oeffentliche URL bestimmt und in `wrangler.toml` eingetragen.** Nicht geraten,
  sondern aus der Antwort von `wrangler deploy` gelesen.
- **Preflight vor dem Deployment.** Im Worker lag Cloudflares eigene
  "Hello World"-Vorlage — 752 Bytes, keine ausgehenden Adressen, keine
  Bindungszugriffe, nichts in Zugangsdatenform. Eine Sicherung liegt als Artefakt
  `worker-code-before-deploy` am Lauf.
- **Deployment.** Danach geprueft: `/health` antwortet, KV ist sichtbar, beide
  Meta-Secrets sind noch da, `/connect`, `/status` und `/disconnect` sind zu.

---

## Schritt 1 — Admin-Schluessel setzen

**Das ist der Grund, warum gerade nichts weitergeht.** Ohne diesen Schluessel
antworten `connect`, `status`, `verify` und `disconnect` mit `503`. Der Worker
laeuft, ist aber nicht bedienbar — mit Absicht: ein offener `/connect` waere eine
Uebernahme mit einem Klick. Ein Fremder koennte **sein** Konto autorisieren und
damit Ihre Verbindung ueberschreiben.

### Warum diesen Schritt nicht die Automatik uebernimmt

Der Workflow koennte einen starken Schluessel erzeugen und als Cloudflare-Secret
setzen — technisch ist das kein Problem. Er koennte ihn Ihnen aber nicht geben.
Cloudflare-Secrets sind nur schreibbar, nicht lesbar; jeder andere Weg zu Ihnen
fuehrt durch die GitHub-Ausgabe, und damit waere der Schluessel dort, wo er nicht
sein soll. Ein Schluessel, den Sie in Schritt 4 brauchen und niemand kennt, ist
kein Schluessel, sondern ein Schloss ohne Zugang.

Deshalb entsteht er bei Ihnen und bleibt bei Ihnen.

### So geht es

Erzeugen und setzen in einem Zug — der Wert erscheint dabei nirgends am Bildschirm:

```bash
openssl rand -hex 32
```

64 Zeichen, nur `0-9a-f`. **Legen Sie den Wert zuerst in Ihrem Passwortmanager
ab** — Sie brauchen ihn in Schritt 4, und lesen koennen Sie ihn danach nirgends
mehr.

`-hex` statt `-base64` hat einen Grund: base64 erzeugt `+`, `/` und `=`. Genau
diese drei Zeichen haben in einer URL eine eigene Bedeutung, und in Schritt 4
steht der Schluessel in einer URL. Ein Schluessel, der beim Anklicken still
verstuemmelt wird, kostet eine halbe Stunde Fehlersuche an der falschen Stelle.

Dann setzen:

```bash
cd workers/vision-universe-social
npx wrangler secret put VU_SOCIAL_ADMIN_KEY
# den erzeugten Wert einfuegen
```

Alternativ ohne Kommandozeile: Cloudflare-Dashboard → Workers & Pages →
`vision-universe-social` → Settings → Variables and Secrets → Add → Type **Secret**,
Name `VU_SOCIAL_ADMIN_KEY`.

**Mindestens 32 Zeichen.** Der Worker lehnt kuerzere ab. Er hat keinen Zaehler fuer
Fehlversuche, und die einzige belastbare Verteidigung gegen Durchprobieren ist ein
Schluessel, der sich nicht durchprobieren laesst.

Danach ist `/health` immer noch offen, aber `missingConfiguration` ist leer.

---

## Schritt 2 — Konfigurations-ID hinterlegen

Sie haben bei Meta eine **Facebook-Login-for-Business-Konfiguration** angelegt.
Das ist ein anderer Dialog als die klassische Facebook-Anmeldung, und er wird
anders aufgerufen: die Rechte stehen dann in Ihrer Konfiguration, und die Adresse
nennt nur deren `config_id`. `scope` darf dabei nicht mitgeschickt werden.

Die vollstaendige Analyse steht in
[`VU_SOCIAL_META_LOGIN_DIAGNOSE.md`](VU_SOCIAL_META_LOGIN_DIAGNOSE.md).

Eintragen in `workers/vision-universe-social/wrangler.toml`:

```toml
META_LOGIN_CONFIG_ID = "IHRE-KONFIGURATIONS-ID"
```

Das ist eine **Variable, kein Secret**: die ID steht im Dialog-Link, den jeder
Nutzer ohnehin sieht, und ist ohne App-Secret wertlos.

Pruefen, welcher Dialog gilt — ohne Schluessel:

```
https://vision-universe-social.little-credit-15d3.workers.dev/health
```

Erwartet: `"loginMode": "business"`. Steht dort `"classic"`, ist die ID nicht
angekommen.

### Rechte in der Konfiguration

Ihre Konfiguration traegt `instagram_basic`, `instagram_content_publish` und
`instagram_manage_insights`. Es fehlt **`pages_show_list`**.

Der Weg zum Instagram-Konto fuehrt ueber die Facebook-Seite: `/me/accounts`
liefert die Seite und daran haengend das Instagram-Konto. Ohne
`pages_show_list` antwortet Meta dort mit einer leeren Liste — nicht mit einem
Fehler. Ohne dieses Recht kann die Verbindung nicht zustande kommen.

`instagram_manage_comments` fehlt ebenfalls. Das ist unschaedlich: es gehoert
nicht zu den Grundrechten. Die davon abhaengigen Faehigkeiten stehen dann auf
`null` — ungeprueft, nicht "nicht verfuegbar".

---

## Schritt 3 — Redirect-URI in der Meta-App eintragen

Diese Adresse muss **zeichengenau** in Ihrer Meta-App stehen. Meta vergleicht sie
Zeichen fuer Zeichen; ein zusaetzlicher Schraegstrich am Ende genuegt fuer eine
Absage.

> **Bevor Sie hier weiter suchen:** bis jetzt hat der Worker den *klassischen*
> Dialog aufgerufen. Jede bisherige Ablehnung beantwortet damit die falsche
> Frage. Setzen Sie erst Schritt 2, dann pruefen Sie erneut — moeglicherweise
> war die URI die ganze Zeit in Ordnung.

Im Meta-App-Dashboard:

**Facebook Login for Business → Einstellungen → Gueltige OAuth-Redirect-URIs**

Dort genau diese Zeile eintragen:

```
https://vision-universe-social.little-credit-15d3.workers.dev/social/meta/callback
```

**Meta vergleicht zeichengenau.** Ein fehlendes `https`, ein zusaetzlicher
Schraegstrich oder eine andere Subdomain fuehren zu
*"URL Blocked: This redirect failed"* — das ist dann kein Fehler dieses Systems,
sondern eine Abweichung in dieser Zeile.

Speichern nicht vergessen.

---

## Schritt 4 — DAS OWNER GATE: Autorisieren

> **Dies ist der Schritt, der Ihre persoenliche Meta-Autorisierung verlangt.**
> Er kann nicht automatisiert werden — und er soll es nicht.

### Was Sie oeffnen

Im Browser, in dem Sie bei Facebook angemeldet sind:

```
https://vision-universe-social.little-credit-15d3.workers.dev/social/meta/connect?key=IHR-ADMIN-SCHLUESSEL
```

Der Worker leitet Sie von dort zu Meta weiter.

> **Dieser Link enthaelt Ihren Schluessel.** Er landet damit im Browserverlauf.
> Das ist vertretbar, weil Sie ihn genau einmal brauchen — aber es ist nicht
> nichts: loeschen Sie den Eintrag danach, oder setzen Sie den Schluessel neu
> (Schritt 1 nochmal, die Verbindung bleibt davon unberuehrt).

Wenn Sie das vermeiden wollen, geht es auch ueber die Kopfzeile. Dann holen Sie
sich erst das Ziel und oeffnen nur dieses im Browser:

```bash
export VU_SOCIAL_ADMIN_KEY=...      # einmal setzen, nicht in jeden Befehl tippen
curl -sI -H "Authorization: Bearer $VU_SOCIAL_ADMIN_KEY" \
  https://vision-universe-social.little-credit-15d3.workers.dev/social/meta/connect
```

Die `location`-Kopfzeile der Antwort ist die Meta-Adresse. Sie enthaelt Ihren
Schluessel nicht mehr.

> Den Schluessel als Umgebungsvariable setzen, statt ihn in jeden Befehl zu
> tippen: ein Wert, den Sie direkt in `curl` schreiben, steht danach in Ihrer
> Shell-Historie — in einer Datei, an die beim Erzeugen niemand gedacht hat.

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

## Schritt 5 — Verifizieren

```bash
curl -s -H "Authorization: Bearer $VU_SOCIAL_ADMIN_KEY" \
  https://vision-universe-social.little-credit-15d3.workers.dev/social/meta/verify
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

## Schritt 6 — Den Zustand ins Repository holen

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

## Schritt 7 — Zielkonto festnageln (empfohlen)

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

Stand 2026-09-15, nach Deployment-Lauf
[34975576298](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/34975576298).

### Was bereits nachgewiesen ist

Stand nach Lauf
[35001007103](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/35001007103)
— Ergebnis **READY**, ohne Anmerkung.

| Kriterium | Nachweis |
|---|---|
| Worker laeuft | `/health` antwortet 200, `"alive": true` |
| Konfiguration vollstaendig | nichts unter `missingConfiguration` oder `weakConfiguration` |
| **Business-Dialog aktiv** | `"loginMode": "business"` — `config_id` statt `scope` |
| Admin-Schluessel gesetzt | Admin-Endpunkte antworten **401** statt 503 |
| KV gebunden | `VU_SOCIAL_KV` fehlt nicht in `missingConfiguration` |
| `META_APP_ID` erhalten | vor und nach jedem Deployment verglichen |
| `META_APP_SECRET` erhalten | dito |
| Keine fremde Logik ueberschrieben | Preflight vor jedem Deployment, Sicherung als Artefakt |
| OAuth-Start erreichbar und verschlossen | `/social/meta/connect` ohne Schluessel: 401, kein 302 |
| Callback-Route erreichbar | `/social/meta/callback` ohne Parameter: 400, kein Meta-Kontakt |
| Statusendpunkt verschlossen | 401 ohne Schluessel |
| Trennen nicht per GET | 401 |
| Kein Publishing-Endpunkt | 401 — es gibt keinen Weg, hierueber zu veroeffentlichen |
| Antworten nicht zwischengespeichert | `cache-control: no-store` |
| **Kein Meta-Login ausgefuehrt** | `"metaLoginAttempted": false` |
| **Kein Beitrag veroeffentlicht** | `"published": false` |
| Flow mit IHRER Rechtemenge geprueft | O1–O8: vier Rechte, Business-Dialog, Verbindung entsteht |
| Tests gruen | 190 Social, 67 Worker, 898 Quant |
| Keine Secrets offengelegt | `node scripts/social/assert-no-secrets.mjs` |
| Bestehende VU-Systeme unveraendert | `node --test "quant/tests/*.test.mjs"` — 898/898 |

Die Zeile **Flow mit IHRER Rechtemenge geprueft** ist neu und die wichtigste:
der Ablauf wurde gegen einen Graph-Doppelgaenger mit genau den vier Rechten
Ihrer Konfiguration durchgespielt — Verbindung entsteht, Page-Token wird
gespeichert, User-Token nicht, Veroeffentlichen und Insights gelten als
nachgewiesen, `instagram_manage_comments` steht auf `null` statt auf
"nicht verfuegbar".

Das beweist, dass **unser** Ablauf stimmt. Ob Meta mitspielt, beweist nur der
Lauf gegen Meta — und der ist Ihre Autorisierung.

### Was noch aussteht — und woran es haengt

| Kriterium | Nachweis | Haengt an |
|---|---|---|
| OAuth produktiv funktionsfaehig | Schritt 4 endet auf "Die Verbindung steht." | Schritt 1-4 |
| Instagram-Konto verbunden | Kontoname und ID auf der Erfolgsseite | Schritt 4 |
| Token sicher gespeichert | Cloudflare KV; kein Endpunkt gibt ihn heraus | Schritt 4 |
| Instagram-Konto automatisch aufgeloest | ueber die Facebook-Seite, ohne Handeingabe | Schritt 4 |
| Reale Permissions verifiziert | Schritt 5, Zeile "Tatsaechliche Rechte" | Schritt 4 |
| Insights lesbar | Schritt 5, "Insights Capability" | Schritt 4 |
| Publishing Capability nachgewiesen | Schritt 5, ueber das erteilte Recht | Schritt 4 |

Alle sieben haengen an derselben Handlung: Ihrer Autorisierung bei Meta. Bis
dahin steht in der Faehigkeitsmatrix ueberall `null` — **ungeprueft**, nicht
"nicht vorhanden". Diese Unterscheidung ist der Grund, warum das System nicht
anfaengt, sich Faehigkeiten auszurechnen, die es nicht nachgewiesen hat.

**Ein erfolgreiches Deployment allein ist nicht das Ziel.** Das Ziel sind beide
Tabellen, vollstaendig.

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
  https://vision-universe-social.little-credit-15d3.workers.dev/social/meta/disconnect
```

Loescht den Datensatz einschliesslich Token und widerruft die Rechte bei Meta.
Nur `POST` — ein Trennen per `GET` waere ueber einen untergeschobenen Link
ausloesbar.

Bestaetigt der Widerruf nicht (`"revokedAtMeta": false`), entfernen Sie die
Berechtigung zusaetzlich in den Facebook-Einstellungen unter
**Business-Integrationen**.
