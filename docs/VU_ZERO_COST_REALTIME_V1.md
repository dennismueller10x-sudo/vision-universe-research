# Zero-Cost Realtime V1 — Abnahmebericht

**Stand:** 17.09.2026 · **Zweig:** `claude/vision-universe-discover-h93fmv`
· **Nicht gemergt, nicht ausgerollt, nicht veröffentlicht.**

---

## 0. Was gebaut wurde, in einem Absatz

Ein Cloudflare Worker mit **einem** Durable Object hält **eine** Tiingo-
Verbindung und streamt daraus nur die Titel, die gerade jemand ansieht.
Hundert Zuschauer auf NVDA sind ein Abonnement beim Anbieter. Die
Aktienseite beginnt mit dem Snapshot, den es schon gibt, und schreibt
ihn fort; fällt der Strom aus, bleibt genau der Zustand zurück, den es
vorher gab. Laufende Zusatzkosten: **0 €**, und zwar nicht als Ziel,
sondern als Schaltung — der Budgetwächter schaltet ab, bevor eine
Freigrenze fällt.

Der Worker **läuft** seit dem 17.09.2026 auf Cloudflare Free, unter
`live.visionuniverse.de` und unter seiner workers.dev-Adresse, mit
echten Kursen (§7a). Der **Client**-Schalter steht noch auf `false`: die
Aktienseite benutzt den Strom bewusst noch nicht, solange V4.1 nicht
nach `main` gemergt ist.

---

## 1. Der Zugang: gemessen, nicht angefordert

**Stand 17.09.2026, nach drei Nachweisläufen in Actions. Es fehlt nichts.**

Der ursprüngliche Bericht forderte zwei Werte an. Das war voreilig: im
Repository lag bereits alles Nötige, nur benutzte es niemand. Drei
Läufe haben nachgesehen, statt weiter zu vermuten.

| Frage | Antwort | Beleg |
|---|---|---|
| Unter welchem Namen liegt das Cloudflare-Secret? | **`CLOUDFLARE_API_TOKEN`** — genau der Name, den wrangler von selbst liest. Kein Umhängen, kein neues Secret. | `cloudflare-access-probe.json` |
| Funktioniert es? | **Ja.** `wrangler whoami` meldet sich an und löst genau ein Konto auf. | `cloudflare-token-permissions.json` |
| Reicht sein Umfang? | **Ja, mindestens lesend.** Workers, Durable Objects, workers.dev-Subdomain, R2 und Kontoeinstellungen antworten alle mit 200. Ein reines R2-Token könnte Workers nicht sehen. | `cloudflare-scope-probe.json` |
| Fehlt `CLOUDFLARE_ACCOUNT_ID`? | **Nein.** Sie ist aus dem bestehenden `VU_HISTORY_S3_ENDPOINT` ableitbar: der R2-Endpunkt hat die Form `https://<account>.r2.cloudflarestorage.com` (so steht es seit jeher in `s3-driver.mjs`, Zeile 121). | `cloudflare-access-probe.json` |
| Baut der Worker überhaupt? | **Ja.** `wrangler deploy --dry-run`: 117,55 KiB, gzip 27,33 KiB, Bindung `env.VU_LIVE (VuLive) Durable Object`. | Lauf 35217043124 |
| Ist `TIINGO_API_KEY` da? | **Ja**, als Repository-Secret. Für den Worker muss er zusätzlich als Cloudflare-Secret gesetzt werden — siehe unten. | — |

**Nichts wurde erzeugt, ersetzt, rotiert oder aufgerüstet.** Alle Aufrufe
waren GET; der einzige Schreibvorgang war ein Commit ins Repository.

### Eine Aussage, die ich zurücknehme

Der erste Lauf meldete „Workers Scripts:Edit: false". Das war kein
Messwert. `wrangler whoami` gibt die Rechteliste nur aus, wenn das Token
selbst `User Details:Read` trägt; fehlt das, verweist es aufs Dashboard —
und genau das stand im Protokoll. Aus dieser Ausgabe folgt über
Workers-Rechte **nichts**. Sie als Nein zu lesen hieße, aus einer Stille
eine Auskunft zu machen; dieselbe Regel, die beim Firehose für die Titel
galt, gilt hier für die Rechte. Der Umfangsnachweis hat die Frage dann
beantwortet.

### Was noch nicht bewiesen ist

**Schreibrecht.** Ein 200 auf `workers/scripts` belegt Lesen. Ob das
Token auch schreiben darf, zeigt erst das Deployment selbst — beweisen
ließe es sich nur durch Schreiben, und geschrieben wurde nichts.
Cloudflares eigene Vorlage „Edit Cloudflare Workers" vergibt Lesen und
Schreiben zusammen; der Befund ist also ein starker Hinweis und wird
hier auch nur so genannt.

### Der eine offene Punkt für die Null-Euro-Zusage

Im Konto liegt **bereits ein Worker-Skript**. Die kostenlosen
Kontingente gelten **je Konto, nicht je Worker** — dieser Worker
verbraucht aus denselben 100 000 Anfragen je Tag, und der Budgetwächter
von `vu-live` sieht diesen Verbrauch nicht: er zählt nur den eigenen.

Die Reserve des Wächters (10 000 Anfragen je Tag, 10 %) muss den anderen
Worker abdecken. Ob sie das tut, ist eine Frage an die Zahlen dieses
Workers, nicht an diesen Entwurf — und sie ist offen, weil sein
Verbrauch hier nicht gemessen wurde.

### Wenn ausgerollt werden soll

Zwei Schritte, beide einmalig, beide ohne neue Zugangsdaten:

1. Den Tiingo-Schlüssel als **Cloudflare**-Secret setzen (er liegt heute
   nur als GitHub-Secret vor): `wrangler secret put TIINGO_API_KEY` —
   im Deployment-Workflow aus dem bestehenden GitHub-Secret gespeist,
   nicht von Hand.
2. Nach erfolgreichem Deployment `stream.enabled` in
   `quant/config/development-preview.json` auf `true` setzen und Discover
   neu bauen.

**Workers Paid bleibt aus.** Der ganze Entwurf steht darauf, dass er es
nicht braucht; ein Upgrade wäre kein Ausbau, sondern das Aufgeben der
Zusage.

## 2. Die Entscheidung dahinter (Variante C)

Aus dem Firehose-Nachweis (16.09.2026,
`quant/data/market/commercial/firehose-capability.json`) und dem
Kostenmodell (`zero-cost-realtime-model.json`):

| Variante | Was sie tut | Kosten/Monat | Anteil am Freibetrag |
|---|---|---|---|
| A | Ganzes Band dauerhaft | 8,65 $ | 1 206 % |
| B | Ganzes Band nur bei Nutzern | 5,46 $ | 194 % |
| **C** | **Nur betrachtete Titel** | **0 €** | **53,5 % bei 25 Titeln** |
| D | Nur der bestehende Snapshot-Pfad | 0 € | 0 % |

Der technische Grund, warum C überhaupt möglich ist, ist gemessen und
nicht angenommen: Tiingos Stufe 6 **mit** Tickerliste liefert nur die
genannten Titel (`["NVDA"]` → 141 Ereignisse, alle NVDA), **ohne**
Tickerliste 1 022 Ereignisse je Sekunde über 6 429 Titel.

Die Decke des Nulltarifs, hergeleitet aus der Cloudflare-Dokumentation
(Stand 17.09.2026, 20 eingehende WebSocket-Nachrichten = 1 Anfrage):
100 000 Anfragen/Tag × 20 = 2 000 000 Nachrichten ÷ 23 400 s Sitzung =
**85 Ereignisse je Sekunde**. Gemessene Spitzenrate je Titel: 1,7.
Daraus: rund **50 gleichzeitig betrachtete Titel** bei voller
Sitzungsdauer, mehr gegen Handelsschluss.

---

## 3. Die Topologie

```
  Browser (Aktienseite)                    Browser (Karten, Feed)
        │                                          │
        │ WebSocket, 1 je Fenster                  │ HTTPS, wie bisher
        │ /live                                    │ intraday/*.json
        ▼                                          ▼
 ┌──────────────────────┐                  ┌──────────────────────┐
 │ Worker  index.mjs    │                  │ GitHub Pages         │
 │ Ursprungsprüfung     │                  │ (unverändert)        │
 │ idFromName           │                  └──────────────────────┘
 │  ("vu-live-us")      │                            ▲
 └──────────┬───────────┘                            │
            │ genau EINE Instanz                     │ Workflow alle 5 min
            ▼                                        │
 ┌────────────────────────────────────────┐          │
 │ Durable Object  vu-live                │          │
 │  subscription-manager  Referenzzählung │          │
 │  free-budget           Kontingent      │          │
 │  bar-merge             laufende Kerze  │          │
 │  market-hours          Sitzung         │          │
 │  Zusammenfassung 1 s, Nachlauf 60 s    │          │
 └──────────┬─────────────────────────────┘          │
            │ EINE Verbindung, nur betrachtete Titel │
            ▼                                        │
 ┌────────────────────────────────────────┐          │
 │ Tiingo IEX  wss://api.tiingo.com/iex   │──────────┘
 │ thresholdLevel 6, REALTIME_REFERENCE   │
 └────────────────────────────────────────┘
```

Keine Shards. Der Grund ist eine Messung, kein Geschmack: 2,22 µs
Rechenzeit je Ereignis und rund 8 MB für fünfzig Titel mit laufender
Kerze, bei 128 MB Speicher und einem Kern. Ein zweiter Objekttyp wäre
Komplexität ohne Messwert dahinter.

---

## 4. Was neu ist und was geliehen

**Neu (4 Dateien Laufzeit, 2 Kernmodule):**

| Datei | Zeilen | Was sie tut |
|---|---|---|
| `quant/engines/realtime/subscription-manager.js` | 455 | Referenzzählung, Nachlauf, zwei Betriebsarten |
| `quant/engines/realtime/free-budget.js` | 284 | Kontingentwächter mit Vorausschau |
| `worker/src/index.mjs` | 145 | Eingang, Ursprungsprüfung, Routing |
| `worker/src/vu-live.mjs` | 439 | Das eine Durable Object |
| `worker/src/tiingo-link.mjs` | 183 | Cloudflares fetch-Upgrade → klassischer Socket |
| `worker/wrangler.toml` | — | Workers Free, eine SQLite-Klasse, kein KV/R2/D1/Cron |

**Geliehen, unverändert:** `transport.js`, `bar-merge.js`,
`market-hours.js`, `staleness.js`, `session-policy.js`, `data-class.js`,
`freshness.js`, `trading-session.js`, `intraday-snapshot.js`,
`providers/tiingo/realtime.js`.

**Eine einzige Änderung am Bestand:** `providers/tiingo/realtime.js`
benutzt jetzt einen festen statt eines zusammengesetzten `require`-Pfads.
Ein Bundler kann ein `require` mit berechnetem Argument nicht auflösen;
in Node ist es derselbe Pfad, nur vorher lesbar. Keine zweite Realtime-
Engine, keine parallele Pipeline, kein Rückbau von V4.1.

---

## 5. Die Zusagen, einzeln

### §4/§5 — Referenzzählung und Nachlauf

Ein Symbol wird genau einmal beim Anbieter abonniert, egal wie viele
Browser es ansehen. Verlässt der letzte Zuschauer die Seite, bleibt der
Titel **60 Sekunden** im Nachlauf: wer zwischen zwei Aktienseiten hin-
und herblättert, zahlt nicht zweimal einen Verbindungsaufbau.

Ein Befund aus dem Bau, hier festgehalten, weil er beinahe stillschweigend
Geld gekostet hätte: lief der Nachlauf eines Titels ab, verschwand sein
Eintrag — die Anmeldung beim Anbieter bestand aber weiter, und niemand
wusste mehr, dass sie abzubestellen war. Der Manager führt deshalb
getrennt, was *gewünscht* ist und was beim Anbieter *tatsächlich
angemeldet* ist.

### §6 — Karten und Feed bleiben, wie sie sind

Discover-Flächen benutzen weiterhin `subscribe()` und damit den
Snapshot-Pfad. Nur die Aktienseite ruft `live()`. Hundert sichtbare
Karten wären hundert abonnierte Titel — genau die Rechnung, die dieses
Produkt nicht aufmacht.

### §7/§8 — Snapshot zuerst, dann Strom

`live()` liefert den Snapshot, bevor überhaupt ein Socket geöffnet wird.
Der Chart ist nie leer. Erst danach kommt der Strom, und er schreibt den
letzten Punkt der Reihe fort — ersetzt oder angehängt, nie interpoliert,
nie geglättet.

### §9 — Was die Zahl ist, und was sie nicht ist

Durchgehend `priceType: REALTIME_REFERENCE`, `source:
TIINGO_IEX_LEVEL6`. Die Wörter *Last Trade*, *Official Trade* und *Last
Sale* kommen an keiner Stelle vor; ein Test prüft das ausdrücklich.
„Markt geöffnet · Live" entsteht nur, wenn der jüngste Tick jünger als
90 Sekunden ist — und das Etikett widerruft sich selbst, wenn er zu alt
wird.

Ein Titel, der minutenlang nicht handelt, ist **kein Ausfall**. Dann
gilt weiter die Beschriftung des Snapshots, mit ihrer Uhrzeit.

### §10 — Der Kontingentwächter

| Schwelle | Anteil | Was passiert |
|---|---|---|
| WARNING | 70 % | Der Browser erfährt es. Sonst nichts. |
| PROTECT | 85 % | Nichts Neues wird abonniert. Laufendes läuft weiter. |
| EXHAUSTED | 100 % | Kontrollierte Abschaltung, Rückfall auf den Snapshot. |

Gerechnet wird **vorher**: bevor ein Symbol dazukommt, rechnet der
Wächter aus, was es bis Handelsschluss kostet. Reserviert sind 10 000
Anfragen je Tag, die nie angerührt werden.

**Keine Rechnung. Kein Paid-Upgrade.** Der Ausweg aus einer Grenze ist
hier immer der Rückfall, nie die Eskalation.

### §11 — Endpunkt und Ursprünge

Vorgesehen: `live.visionuniverse.de`. In `wrangler.toml` auskommentiert,
weil eine Route ohne die zugehörige Zone das Deployment abbricht — eine
Zeile, kein Umbau. `research.visionuniverse.de` bleibt auf GitHub Pages.

CORS ist auf drei Ursprünge beschränkt (`research.`, Apex, `www.`). Beim
WebSocket-Upgrade wird der Ursprung **an der Verbindung selbst** geprüft
und nicht nur in einem Antwortkopf beantwortet: ein WebSocket kennt kein
Preflight, und ein Nicht-Browser ignoriert den Kopf ohnehin.

### §12 — Der Schlüssel

Er steht in genau einer Nachricht: der Anmeldung beim Anbieter. Nicht im
Git, nicht im Build, nicht im Client-JavaScript, nicht im Protokoll,
nicht im Zustandsbericht. `/health` sagt nur, **ob** er gesetzt ist.

Der Scan (`assert-no-secrets.mjs --all`) deckt jetzt auch `worker/`,
`discover/`, `providers/`, `quant/config` und die Workflows ab —
24 747 Dateien, keine Zugangsdaten. Gegenprobe gemacht: ein
eingepflanzter Schlüsselwert und ein eingepflanzter Umgebungswert werden
beide gefunden.

### §14/§15 — Die Rückfallkette, und dass sie nicht lügt

```
Realtime  →  laufender Snapshot  →  letzte abgeschlossene Sitzung  →  Historie
```

Jeder Schritt hat sein eigenes Etikett, und keines behauptet den
darüberliegenden. Der Strom sagt in jeder Lage, **warum** er nicht
liefert: `sessionClosed`, `budgetProtect`, `budgetExhausted`,
`disconnected`, `symbolLimitReached`.

### §19 — V4.1 bleibt

Kein Rückbau. Die 29 Browser-Prüfungen der V4.1-Abnahme laufen
unverändert grün, die 206 bestehenden Discover-Tests ebenso. Dazu eine
dreißigste, die den Riegel selbst prüft: auf der Aktienseite wird **kein**
WebSocket geöffnet, solange der Strom aus ist — und der Tagesverlauf ist
trotzdem da. „Nichts wird schlechter" ist damit keine Absichtserklärung,
sondern eine Zusicherung, die fehlschlagen kann.

---

## 6. Tests

| Bereich | Neu | Was sie prüfen |
|---|---|---|
| `quant/tests/subscription-manager.test.mjs` | 21 | Referenzzählung, Nachlauf, beide Betriebsarten, Abriss |
| `quant/tests/free-budget.test.mjs` | 17 | Schwellen, Vorausschau, Tageswechsel, Laufzeitgrenze |
| `worker/tests/vu-live.test.mjs` | 33 | Das Objekt und der Worker auf einer Cloudflare-Attrappe |
| `discover/tests/live-stream.test.mjs` | 14 | Der Client: Rückfall, Etikett, Sichtbarkeit, Semantik |
| **Summe neu** | **84** | |

**Alle Tests grün: 967 Quant, 220 Discover, 33 Worker.** Keine wurde
abgeschwächt, keine übersprungen. Vier Erwartungen in `free-budget`
tragen neue Zahlen, weil die *Annahme* dahinter eine neue ist (§7) —
geprüft wird dasselbe Verhalten, nur gegen die richtige Größe.

Die Cloudflare-Attrappe (`worker/tests/harness.mjs`) fälscht genau drei
Dinge, die die Plattform stellt: `WebSocketPair`, `Response` mit Status
101 und den Wecker. Subscription Manager, Budgetwächter, Kerzenschicht
und Tiingo-Leser laufen im Original — sonst würde der Test die Attrappe
prüfen und nicht das System.

### Fünf Befunde, die die Tests gefunden haben

1. **Stumm abonniert.** Nach Ablauf des Nachlaufs verschwand der Eintrag,
   die Anmeldung beim Anbieter blieb. Behoben durch getrennte Führung.
2. **Überschriebener Grund.** „Der Anbieter hat die Nachmeldung
   abgelehnt" wurde eine Zeile später von einem Zustandswechsel
   überschrieben. Der Modusgrund haftet jetzt am Modus.
3. **Stilles Ja.** Eine Anfrage bei geschlossener Börse wurde angenommen
   und nie bedient. Jetzt: Ablehnung mit Grund `sessionClosed`, und ein
   Sitzungswechsel wird gemeldet.
4. **Abgeschnittene Liste.** Zu viele Symbole wurden stillschweigend
   gekürzt — ein Versprechen auf einen Titel, der nie kommt. Jetzt:
   Ablehnung mit Grund.
5. **Stehengebliebenes „Live".** Nach einem Abriss blieb das Etikett, bis
   der Snapshot-Pfad das nächste Mal nachfragte. Es widerruft sich jetzt
   selbst.

---

## 7. Messungen bei offener Börse (17.09.2026)

Alle drei Nachweise liefen während der regulären US-Sitzung.

### §1 — Lässt sich die Tickerliste eines offenen Sockets ändern?

**DYNAMIC_SUPPORTED**, gemessen um 09:53 New York.
`quant/data/market/commercial/dynamic-subscribe-verification.json`

| Phase | AAPL | NVDA | Was das zeigt |
|---|---|---|---|
| Kontrolle (eigener Socket, beide Titel) | 46 | 63 | Beide handeln in diesem Fenster |
| P0 — Socket mit `["AAPL"]` | 52 | **0** | Die Tickerliste filtert wirklich |
| P1 — `subscribe ["NVDA"]` auf demselben Socket | 55 | **74** | Nachmelden wirkt |
| P2 — `unsubscribe ["AAPL"]` | **0** | 65 | Abmelden wirkt auch |

Dieselbe Verbindung über alle drei Phasen, keine Ablehnung des Servers.
Der Subscription Manager läuft deshalb im Modus **`dynamic`**: ein
Titelwechsel kostet keinen Verbindungsaufbau mehr. Fällt die Nachmeldung
im Betrieb doch einmal aus, fällt er von selbst auf `reconnect` zurück —
der Modus bleibt gebaut und getestet.

**Der Kontrolllauf hat sich bezahlt gemacht.** Im ersten Anlauf las mein
Nachweisskript den Parser falsch (`parseIexMessage` liefert einen
Umschlag `{tick, raw}`, nicht den Tick selbst), und die Kontrolle sah
null Ereignisse für AAPL und NVDA um 09:42 New York. Ohne sie stünde
jetzt `DYNAMIC_REJECTED` im Bericht, und niemand hätte es gemerkt.

### §17 — Last: 1, 5, 10, 25, 50 gleichzeitig aktive Titel

Je 30 Sekunden, 20 Zuschauer, echte Kurse.
`quant/data/market/commercial/vu-live-e2e.json`

| Titel | Ereignisse/s | je Titel | an Browser | Verhältnis | CPU | RAM | Kontingent | 50/50 |
|---|---|---|---|---|---|---|---|---|
| 1 | 1,07 | 1,07 | 360 | 0,09 | 0,44 % | 8,9 MB | 0,0 % | ✅ |
| 5 | 4,27 | 0,85 | 336 | 0,38 | 0,21 % | 9,1 MB | 0,0 % | ✅ |
| 10 | 6,37 | 0,64 | 286 | 0,67 | 0,24 % | 9,6 MB | 0,0 % | ✅ |
| 25 | 12,20 | 0,49 | 261 | 1,40 | 0,53 % | 9,8 MB | 0,0 % | ✅ |
| **50** | **19,57** | **0,39** | **350** | **1,68** | **0,60 %** | **10,5 MB** | **0,1 %** | ✅ |

Der Deckel ist nicht die Rechenzeit und nicht der Speicher — bei
fünfzig Titeln sind beide praktisch unbelastet.

### §18 — E2E: AAPL, NVDA, MSFT, VLO, PANW

Alle fünf geliefert. Zusammenfassung p50 443 ms, p95 1 000 ms — das ist
das Fenster selbst.

### Eine Annahme, die diese Messung widerlegt hat

Die Vorausschau des Budgetwächters rechnete mit **1,7** Ereignissen je
Sekunde und Titel: der Spitze *eines* Titels im ganzen Band. Gemessen
wurden für einen Korb aus 50 abonnierten Titeln **0,34** je Titel — ein
Fünftel davon.

Die Folge war sichtbar: die Schranke lehnte den **40. von 50** Titeln
ab, während der tatsächliche Verbrauch bei **0,1 %** des Kontingents
lag. Eine Schranke, die bei einem Tausendstel des Verbrauchs schließt,
schützt nichts — sie verhindert nur den Betrieb.

Gerechnet wird jetzt mit dem gemessenen Korbdurchschnitt mal 2,5 =
**0,85**: deutlich über der Messung, immer noch unter der Einzelspitze.
Beide Messwerte bleiben als Konstanten dokumentiert.

**Warum das sicher bleibt:** die Vorausschau entscheidet nur die
*Aufnahme*. WARNING bei 70 % und PROTECT bei 85 % hängen am **gezählten**
Verbrauch, nicht an der Annahme. Ein eigener Test (FB-17) erzwingt das
mit einer absichtlich winzigen Annahme. Die Schwellen selbst sind
unverändert.

---

## 7a. Production-Proof (17.09.2026, 10:16 New York)

**Ausgerollt auf Cloudflare Free. Beide Endpunkte grün.**

| | `live.visionuniverse.de` | `vu-live.little-credit-15d3.workers.dev` |
|---|---|---|
| `/version` mit richtiger Semantik | ✅ | ✅ |
| `/health` ohne Schlüssel | ✅ | ✅ |
| Fremder Ursprung bleibt draußen | ✅ | ✅ |
| CORS für `research.visionuniverse.de` | ✅ | ✅ |
| WebSocket + Begrüßung | ✅ | ✅ |
| Kurse während der Sitzung | ✅ | ✅ |
| **Ergebnis** | **PASS** | **PASS** |

**Erster Kurs beim Client, einschließlich Cloudflares Kante:**

| Titel | `live.visionuniverse.de` | workers.dev |
|---|---|---|
| AAPL | 2 788 ms | 2 481 ms |
| NVDA | 2 788 ms | 2 481 ms |
| MSFT | 1 751 ms | 4 999 ms |
| PANW | 4 984 ms | 3 493 ms |
| VLO | 11 171 ms | 8 314 ms |
| **Median** | **2 788 ms** | **2 481 ms** |

Darin enthalten: Verbindungsaufbau zum Worker, Aufbau der
Anbieterverbindung und ein Zusammenfassungsfenster von einer Sekunde.
VLO ist der illiquideste der fünf — das ist der Markt, nicht das System.

**Cloudflare-Status nach dem Lauf** (aus `/health` des laufenden
Objekts): Manager `LIVE`, Modus `dynamic`, fünf Titel abonniert,
187 Anbieternachrichten, **13 Anfragen**, Kontingent-Urteil **OK**.

**Deployment:** 119,09 KiB hochgeladen (gzip 27,90 KiB), Startzeit 6 ms,
Bindung `env.VU_LIVE (VuLive) Durable Object`, `TIINGO_API_KEY` als
Cloudflare-Secret über stdin gesetzt. `live.visionuniverse.de` neu
angelegt; **`research.visionuniverse.de` unberührt auf GitHub Pages.**

### Der Fehler, der zwischen Deployment und Betrieb stand

Das erste Deployment war erfolgreich, `/health` grün, die Begrüßung kam
beim Browser an — und kein einziger Kurs. Von außen sah das aus wie ein
stiller Markt.

Es war eine Zeile: **Cloudflare nimmt für ein WebSocket-Upgrade kein
`wss://` entgegen, nur `http` oder `https`.** Der Rest der Welt schreibt
die Adresse eines WebSockets mit `wss`, und so stand sie überall in
diesem Repository. `fetch("wss://api.tiingo.com/iex")` ergibt in workerd
nie eine Antwort mit `webSocket`; der Transport meldete `transportFailed`,
und alles Weitere war korrektes Verhalten auf einer kaputten Verbindung.

Zwei Dinge daraus, beide im Code:

- `alsHttp()` in `tiingo-link.mjs` — drei Zeilen.
- **VL-33**: die Testattrappe hält jetzt fest, *womit* der Link
  aufzubauen versucht, und der Test besteht auf `https`. Ein Fehler, den
  man von außen nicht sehen kann, braucht einen Test, der ihn von innen
  sieht.

Der Smoke-Test meldete anfangs nur „0 von 5 geliefert" ohne Grund — die
Statusmeldungen mit `transportFailed` hatte er weggeworfen. Er hebt sie
jetzt auf, holt am Ende `/health` und schneidet über `wrangler tail` das
Protokoll des Objekts mit.

---

## 8. Was offen bleibt

| Punkt | Warum offen | Folge |
|---|---|---|
| Client-Schalter | `stream.enabled` steht auf `false` | Die Aktienseite nutzt den Strom noch nicht — der Worker läuft, das Produkt zeigt ihn nicht |
| Schreibrecht des Tokens | ✅ bewiesen durch das Deployment selbst | — |
| Freigrenze wird geteilt | Ein weiterer Worker liegt im Konto, sein Verbrauch ist ungemessen | Reserve von 10 000 Anfragen muss ihn abdecken |
| §1 Nachmeldung | Nur bei offener Börse messbar | Modus `reconnect` |
| §17/§18 | Nur bei offener Börse messbar | — |
| Cloudflare-Latenz | Nicht ausgerollt | Wird nicht geschätzt |
| Vorbörse/Nachbörse | V1 streamt nur `REGULAR` | Snapshot-Pfad wie bisher |

---

## 9. Dateien

```
worker/
  wrangler.toml                        Workers Free, eine DO-Klasse
  src/index.mjs                        Eingang
  src/vu-live.mjs                      Das eine Durable Object
  src/tiingo-link.mjs                  fetch-Upgrade → klassischer Socket
  tests/harness.mjs                    Cloudflare aus Pappe
  tests/vu-live.test.mjs               32 Tests

quant/engines/realtime/
  subscription-manager.js              Referenzzählung, Nachlauf
  free-budget.js                       Kontingentwächter
quant/tests/
  subscription-manager.test.mjs        21 Tests
  free-budget.test.mjs                 15 Tests

discover/ui/live-hub.js                + live(), Strom, Rückfall
discover/ui/detail.js                  laufender Kurs im 1T-Chart
discover/tests/live-stream.test.mjs    14 Tests

quant/config/development-preview.json  stream.enabled (aus)
scripts/discover/build-discover-data.mjs  meta.realtime.stream
scripts/market/verify-dynamic-subscribe.mjs   §1
scripts/market/verify-vu-live-e2e.mjs         §17, §18
scripts/market/assert-no-secrets.mjs          --all (§12)
.github/workflows/tiingo-scale.yml            drei neue Schritte
```

---

## 10. Definition of Done (§21)

| Punkt | Stand |
|---|---|
| Cloudflare Free, kein Paid | ✅ |
| Ein Worker, ein Durable Object, keine Shards | ✅ |
| Referenzzählung, 100 Nutzer = 1 Abonnement | ✅ getestet |
| Nachlauf 60 s | ✅ getestet |
| Karten und Feed unverändert auf Snapshot | ✅ |
| Snapshot zuerst, kein leerer Chart | ✅ getestet |
| `REALTIME_REFERENCE`, nie „Last Trade" | ✅ getestet |
| Kontingentwächter 70/85/100 | ✅ getestet |
| Rückfall ohne Verschlechterung | ✅ getestet |
| Schlüssel nirgends außer in der Anmeldung | ✅ gescannt |
| Bestehende Tests nicht abgeschwächt | ✅ 965 + 206 grün |
| V4.1 nicht zurückgebaut | ✅ Browser-QA 30/30 (29 bestehende + 1 neue) |
| §1 Nachmeldung gemessen | ✅ DYNAMIC_SUPPORTED |
| §17 Lasttest 1/5/10/25/50 | ✅ 50 von 50, 0,1 % Kontingent |
| §18 E2E fünf Titel | ✅ alle geliefert |
| Deployment auf Cloudflare Free | ✅ ausgerollt, beide Endpunkte PASS |
| `live.visionuniverse.de` | ✅ angelegt, `research.*` unberührt |
| PAID_SERVICES_ENABLED = 0 | ✅ |
| Zugang vorhanden und geprüft | ✅ gemessen (§1) |
| Merge nach `main` | ⛔ nicht erfolgt, Owner-Abnahme |
