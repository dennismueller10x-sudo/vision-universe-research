# VU SOCIAL — WARUM META DIE REDIRECT-URI ABLEHNT

Stand: 2026-09-15 · Zweig `claude/vision-universe-social-os-eudjmx`

Der Owner hat bei Meta eine **Facebook-Login-for-Business-Konfiguration**
angelegt („Vision Universe Social", Login-Option General, Nutzer-Zugriffstoken,
drei Instagram-Rechte). Die Redirect-URI wird weiterhin abgelehnt und
verschwindet nach einem Reload aus dem Feld.

Dieses Dokument trennt, was **belegt** ist, von dem, was **Vermutung** bleibt.
Die Trennung ist hier nicht Pedanterie: an dieser Stelle sind schon mehrere
Stunden in ein Dashboard-Feld geflossen, und der belegte Befund sagt, dass das
Feld gar nicht die Frage war.

---

## 1. Der belegte Befund

**Der Worker hat bis heute den falschen Meta-Dialog aufgerufen.**

Meta hat zwei Anmeldungen, die dieselbe Adresse benutzen:

| | Facebook Login (klassisch) | Facebook Login for Business |
|---|---|---|
| Rechte stehen | in `scope` in der Adresse | in einer Konfiguration bei Meta |
| Adresse nennt | `scope=instagram_basic,...` | `config_id=<ID>` |
| `scope` | erforderlich | **darf nicht mitgeschickt werden** |
| `response_type` | `code` | `code` + `override_default_response_type=true` |

Der Worker baute bisher:

```
https://www.facebook.com/v21.0/dialog/oauth
  ?client_id=…&redirect_uri=…&state=…&scope=instagram_basic,…&response_type=code
```

Das ist die **klassische** Anmeldung. Die Konfiguration des Owners ist eine
**Business**-Konfiguration. `config_id` ersetzt `scope`; wer beides schickt,
beschreibt zwei verschiedene Rechtemengen in einer Anfrage.

Quellen:
[Facebook Login for Business](https://developers.facebook.com/documentation/facebook-login/facebook-login-for-business),
[Manually Build a Login Flow](https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow/).

### Was daraus für die Redirect-URI folgt

**Jeder bisherige Test hat den falschen Dialog geprüft.** Die Ablehnungen sind
deshalb kein Beleg dafür, dass mit der Redirect-URI etwas nicht stimmt — sie
sind Antworten auf eine Frage, die so nicht gestellt werden sollte.

Solange der Dialog falsch ist, ist jede Aussage über die Redirect-URI
unbelegt. Das gilt in beide Richtungen: sie kann falsch sein, sie kann längst
richtig sein. Wir wissen es nicht, und wir können es nicht wissen, bevor der
richtige Dialog läuft.

### Was behoben ist

`authorizationUrl()` kennt jetzt beide Dialoge. Hinterlegt ist die Entscheidung
in einer einzigen Variablen:

```toml
META_LOGIN_CONFIG_ID = ""     # leer -> klassisch, gesetzt -> Business
```

Ablesbar ohne Schlüssel, welcher Dialog gerade gilt:

```
GET /health   ->   "loginMode": "classic" | "business"
```

Die Konfigurations-ID ist **kein Geheimnis**: sie steht im Dialog-Link, den der
Nutzer ohnehin sieht. Ohne App-Secret ist mit ihr nichts anzufangen. Deshalb
Variable und nicht Secret — 14 Tests (B1–B14) halten das fest.

---

## 2. Der zweite Befund — er kommt sonst als Nächstes

Die Konfiguration des Owners trägt drei Rechte:

- `instagram_basic`
- `instagram_content_publish`
- `instagram_manage_insights`

**`pages_show_list` fehlt.** Der Weg zum Instagram-Konto führt über die
Facebook-Seite:

```
/me/accounts?fields=…,instagram_business_account{…}
```

Dieser Aufruf braucht `pages_show_list`
([Beleg](https://dev.to/superface/instagram-api-find-the-right-account-id-4k3j)).
Ohne das Recht antwortet die Plattform mit **200 und einer leeren Liste** —
kein Fehler, kein Hinweis.

Und eine leere Liste sieht genau so aus wie ein Zugang, dessen Seiten kein
Instagram-Konto haben. Der Worker hätte gemeldet: *„Keine Facebook-Seite dieses
Zugangs hat ein verbundenes Instagram-Professional-Konto"* — und der Owner hätte
in der Business-Suite eine Verbindung repariert, die in Ordnung ist.

Behoben: `resolveAccounts()` bekommt jetzt die tatsächlich erteilten Rechte und
unterscheidet die beiden Lagen. Fehlt das Recht, sagt die Meldung das — und sagt
ausdrücklich, dass über die Instagram-Einrichtung damit **nichts** ausgesagt ist,
weil sie gar nicht gesehen werden konnte.

`instagram_manage_comments` fehlt ebenfalls, das ist aber eine bewusste
Entscheidung des Owners und unschädlich: es gehört nicht zu den Grundrechten.
Die davon abhängigen Fähigkeiten stehen dann auf `null` — ungeprüft —, nicht auf
„nicht verfügbar".

---

## 3. Was Vermutung bleibt

Zum Verschwinden des Feldes nach dem Reload gibt es mehrere plausible
Erklärungen. **Keine davon ist belegt**, und keine sollte behandelt werden, als
wäre sie es:

- **Zwei verschiedene Orte.** „Gültige OAuth Redirect URIs" gehört zu den
  *Client-OAuth-Einstellungen* des Produkts *Facebook Login*. Neuere Apps führen
  dieselbe Einstellung unter **Use cases**. Eine Eingabe am einen Ort muss am
  anderen nicht erscheinen.
- **Die „Redirect URI-Validierung" ist ein Prüffeld, kein Speicherfeld.** Sie
  testet gegen die gespeicherte Liste und schreibt nichts. Eine Meldung dort ist
  ein Messergebnis, keine abgelehnte Eingabe.
- **`workers.dev` als Domain.** `workers.dev` steht auf der Public Suffix List.
  Ob Meta deshalb ablehnt, ließ sich nicht belegen — es bleibt offen.

Diese Liste ist absichtlich nicht priorisiert. Der nächste Schritt entscheidet
zwischen ihnen, statt eine davon zu raten.

---

## 4. Der nächste Schritt

Sobald `META_LOGIN_CONFIG_ID` gesetzt und deployt ist, ruft der Connect-Endpunkt
den **richtigen** Dialog auf. Dann antwortet Meta zum ersten Mal auf die Frage,
die tatsächlich gestellt werden soll — und diese Antwort ist auswertbar:

| Meta antwortet | Bedeutung |
|---|---|
| Der Dialog lädt | Die Redirect-URI war nie das Problem. Weiter zur Autorisierung. |
| „URL Blocked" / „redirect_uri is not allowed" | Die URI fehlt wirklich in der Liste, die für **diese Konfiguration** gilt. Dann wissen wir auch, welche Liste das ist. |
| „Invalid configuration id" | Die ID ist falsch übertragen, oder die Konfiguration gehört zu einer anderen App. |
| Der Dialog lädt, aber ohne die drei Rechte | Die Konfiguration greift, ihre Rechteauswahl ist die Frage. |

Jede dieser vier Antworten ist mehr wert als jeder weitere Versuch im Dashboard,
weil sie von der Stelle kommt, die tatsächlich entscheidet.

---

## 5. Was sich nicht geändert hat

- Keine Sicherheitsmechanik angefasst: `state`-Signatur, Nonce-Cookie,
  Admin-Schutz, `appsecret_proof`, Redaktion — unverändert.
- Kein Beitrag veröffentlicht. Der Worker hat keinen Publishing-Endpunkt.
- Kein Meta-Login ausgeführt.
- Keine Secrets gelesen, ausgegeben oder verändert.
- Die klassische Anmeldung bleibt vollständig funktionsfähig: ist keine
  Konfigurations-ID gesetzt, verhält sich der Worker exakt wie vorher.
