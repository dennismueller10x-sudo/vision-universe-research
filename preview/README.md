# Interne Vorschau — befristetes Entwicklungsschloss

Nur der Eigentuemer und ausdruecklich benannte Tester kommen an die
Full-Universe-Vorschau.

**Das ist nicht das Kundenkontosystem von Vision Universe.** Nichts hier
soll dessen Architektur vorwegnehmen. Die ganze Loesung liegt in diesem
Verzeichnis und laesst sich in einem Commit entfernen — das ist Absicht
und die wichtigste Eigenschaft dieses Codes.

## Warum ein eigener Dienst

`research.visionuniverse.de` liegt auf GitHub Pages. **Pages hat keine
Serverseite** und kann nicht pruefen, wer etwas abruft. Ein Passwortfeld
in JavaScript waere kein Schloss, sondern ein Schild: wer die Seite
laedt, hat die Daten schon.

Die Vorschau ist deshalb ein eigener Dienst auf einem eigenen Namen. Die
oeffentliche Seite bleibt unveraendert und weiss nichts davon.

## Einrichten

```bash
# 1. Zugangsdaten erzeugen. Das Passwort bleibt unsichtbar und landet
#    weder auf dem Bildschirm noch in der Shell-Historie.
node preview/hash-password.mjs

# 2. Die beiden ausgegebenen Werte als Secrets hinterlegen — nie committen:
#      PREVIEW_USERS            kennung:salt$hash   (mehrere mit ';')
#      PREVIEW_SESSION_SECRET   mindestens 32 Zeichen

# 3. Starten
PREVIEW_USERS='...' PREVIEW_SESSION_SECRET='...' node preview/server.mjs --port 8080
```

Ohne gueltige Konfiguration liefert der Dienst **nichts** aus, auch keine
Anmeldeseite: er antwortet mit 503. Ein Vorschauserver, der bei fehlender
Konfiguration alles freigibt, ist die gefaehrlichste Variante von allen.

## Umgebungsvariablen

| Variable | Pflicht | Bedeutung |
|---|---|---|
| `PREVIEW_USERS` | ja | `kennung:salt$hash`, mehrere mit `;` getrennt |
| `PREVIEW_SESSION_SECRET` | ja | Signierschluessel der Sitzungscookies, ≥32 Zeichen |
| `PREVIEW_SESSION_TTL_MS` | nein | Sitzungsdauer, Standard 12 h |
| `PREVIEW_SESSION_EPOCH` | nein | Erhoehen entzieht **allen** Sitzungen den Zugang |
| `PREVIEW_SERVE_ROOT` | nein | Was ausgeliefert wird, Standard das Repository |
| `PREVIEW_INSECURE_COOKIES` | nein | `1` nur fuer Tests ohne TLS |

## Wo es laufen kann

Der Server ist ein Node-Prozess ohne Fremdpakete. Er laeuft ueberall, wo
Node laeuft:

- **Container-Hoster** (Fly.io, Railway, Render): Prozess starten,
  Secrets im Hoster hinterlegen, eigener Name davor.
- **Cloudflare Tunnel** vor einem Rechner, den Sie kontrollieren.
- **Nur lokal**: `node preview/server.mjs` und im Browser oeffnen. Fuer
  einen einzelnen Tester genuegt das.

Wer bereits Cloudflare Zero Trust nutzt, kann **Cloudflare Access** vor
einen getrennten Pages-Bereich setzen und dieses Schloss weglassen — dann
prueft die Zugangsschicht statt der Anwendung. Beides erfuellt „nicht im
Browser"; dieser Server braucht dafuer kein zusaetzliches Konto.

## Was geprueft wird

`quant/tests/preview-auth.test.mjs`, gegen einen echten Server in einem
echten Kindprozess:

| | |
|---|---|
| PA1 | unangemeldet: Seite 302 auf `/login`, Daten 401, kein Inhalt |
| PA2 | falsches Passwort und unbekannte Kennung: gleiche Ablehnung, kein Cookie |
| PA3 | richtige Anmeldung: Cookie mit `HttpOnly`, `SameSite=Strict`, Sitzung traegt |
| PA4 | Full-Universe-Artefakte unangemeldet 401, angemeldet 5.684/5.684 |
| PA5 | Abmelden ruft die Sitzung **serverseitig** zurueck; kopiertes Cookie wirkungslos |
| PA6 | kein Zugangsdatum im Repository, Browser-Quelltext, Log oder Zustandsendpunkt |
| PA7 | oeffentliche Freigaben unveraendert; keine oeffentliche Datei kennt die Vorschau |
| PA8 | ohne Konfiguration 503 auf allem |
| PA9 | ein Klartextpasswort in `PREVIEW_USERS` wird **abgelehnt** |
| PA10 | gefaelschte, abgelaufene und epochenlos zurueckgerufene Sitzungen |
| PA11 | Drosselung je Herkunft, Erfolg entlastet |
| PA12 | gesalzener scrypt-Hash, Vergleich in konstanter Zeit |
| PA13 | die Vorschau importiert nichts aus der Anwendung und umgekehrt |

## Trennung der Berechtigungen

Das Vorschauschloss entscheidet **wer** hineinkommt. Die Feature-Gates in
`quant/config/feature-gates.json` entscheiden, was **oeffentlich** gezeigt
wird. Beides bleibt getrennt: der Server liest die Gates nicht und
veraendert sie nicht (PA7 prueft das). Wer beides verbindet, schaltet mit
dem Anmeldeformular versehentlich die Oeffentlichkeit frei.

`ENABLE_PUBLIC_LIVE_MARKET_DATA` bleibt **AUS**. Die Weitergabe der
Anbieterdaten ist weiterhin `LEGAL_REVIEW_REQUIRED` — daran aendert eine
interne Vorschau nichts.

## Entfernen

```bash
rm -rf preview/ quant/tests/preview-auth.test.mjs
```

Danach den Dienst abschalten und die Secrets loeschen. Es gibt keine
weitere Verflechtung: kein Modul der Anwendung importiert die Vorschau,
und die Vorschau importiert nur `node:`-Module und ihre eigene
`auth.mjs`.

## Grenzen, die bewusst so sind

- **Sitzungsrueckruf im Arbeitsspeicher.** Nach einem Neustart des
  Dienstes gelten abgemeldete, noch nicht abgelaufene Cookies wieder.
  Wer das ausschliessen muss, erhoeht `PREVIEW_SESSION_EPOCH` — das
  entzieht allen Sitzungen den Zugang und braucht keinen Zustand.
- **Drosselung im Arbeitsspeicher.** Ein Neustart loescht die
  Fehlversuche. Fuer ein befristetes Schloss mit scrypt (~100 ms je
  Versuch) ist das vertretbar.
- **Ein Faktor.** Kein zweiter Faktor, keine Wiederherstellung, keine
  Rollen. Das kommt mit dem echten Kontosystem, nicht hier.
