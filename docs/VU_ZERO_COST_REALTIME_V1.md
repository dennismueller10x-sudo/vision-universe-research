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

Eingeschaltet ist nichts. Der Schalter steht auf `false`, weil der
Worker nicht ausgerollt ist (siehe §13).

---

## 1. STOP: was der Owner einmalig tun muss

Für ein Deployment fehlen genau **zwei** Werte. Sie sind im Repository
nicht vorhanden und werden hier auch nicht angefordert — der Bericht
nennt nur, was fehlt.

| Secret | Wozu | Woher |
|---|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | Das Konto, in dem der Worker liegt. | Cloudflare Dashboard → rechte Spalte „Account ID" |
| `CLOUDFLARE_API_TOKEN` | Ein Token mit **genau** den Rechten `Workers Scripts:Edit` und `Workers Durable Objects:Edit` (nicht mehr). | Cloudflare Dashboard → My Profile → API Tokens → Create Token |

**Die minimale einmalige Owner-Aktion:**

1. Beide Werte als GitHub-Secrets im Repository hinterlegen
   (`Settings → Secrets and variables → Actions`).
2. Den Tiingo-Schlüssel als Cloudflare-Secret setzen — **einmal**, und
   ausdrücklich nicht in eine Datei:
   `npx wrangler secret put TIINGO_API_KEY` (aus `worker/`).
3. Danach in `quant/config/development-preview.json` den Schalter
   `stream.enabled` auf `true` setzen und Discover neu bauen.

**Workers Paid wird NICHT aktiviert.** Der ganze Entwurf steht darauf,
dass er das nicht braucht; ein Upgrade wäre kein Ausbau, sondern das
Aufgeben der Zusage.

Ohne diese beiden Werte ist alles andere in diesem Bericht gebaut,
getestet und nachgewiesen — nur nicht in Betrieb.

---

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
| `quant/tests/free-budget.test.mjs` | 15 | Schwellen, Vorausschau, Tageswechsel, Laufzeitgrenze |
| `worker/tests/vu-live.test.mjs` | 32 | Das Objekt und der Worker auf einer Cloudflare-Attrappe |
| `discover/tests/live-stream.test.mjs` | 14 | Der Client: Rückfall, Etikett, Sichtbarkeit, Semantik |
| **Summe neu** | **82** | |

**Bestehende Tests: unverändert grün.** 965 Quant, 206 Discover — keine
einzige wurde abgeschwächt, keine übersprungen.

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

## 7. Messungen bei offener Börse

*Dieser Abschnitt wird nach dem Lauf während der regulären US-Sitzung
gefüllt. Die Werkzeuge stehen bereit; ausgelöst werden sie mit der Marke
`[tiingo-realtime]`.*

### §1 — Lässt sich die Tickerliste eines offenen Sockets ändern?

**Status: steht aus.**
Bericht: `quant/data/market/commercial/dynamic-subscribe-verification.json`

Bis zur Messung läuft der Subscription Manager im Modus **`reconnect`**
(`TIINGO_DYNAMIC_SUBSCRIBE = "false"`). Der ist immer richtig, nur
teurer: jeder Titelwechsel kostet einen Verbindungsaufbau. Auf Verdacht
nachzumelden wäre der Weg in einen Zustand, in dem ein Titel zu sehen
ist, den niemand abonniert hat.

### §17 — Last: 1, 5, 10, 25, 50 gleichzeitig aktive Titel

**Status: steht aus.**
Bericht: `quant/data/market/commercial/vu-live-e2e.json`

Trockenlauf mit Attrappe bestanden: 25 von 25 Titeln abonniert,
400 Anbieterereignisse zu 160 Browser-Nachrichten, Zusammenfassung
p95 413 ms.

### §18 — E2E: AAPL, NVDA, MSFT, VLO, PANW

**Status: steht aus.**

**Was dieser Test ausdrücklich NICHT misst:** den Sprung über
Cloudflares Kante. Der Worker ist nicht ausgerollt; gemessen wird alles,
was Vision Universe selbst verantwortet — Tiingo → tiingo-link →
transport → Parser → subscription-manager → bar-merge → free-budget →
VuLive → Browser. Eine Zahl für eine Strecke, die niemand gemessen hat,
wäre schlimmer als keine.

---

## 8. Was offen bleibt

| Punkt | Warum offen | Folge |
|---|---|---|
| Deployment | Zwei Secrets fehlen (§1) | Der Schalter bleibt auf `false` |
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
| §1 Nachmeldung gemessen | ⏳ Messfenster |
| §17 Lasttest | ⏳ Messfenster |
| §18 E2E | ⏳ Messfenster |
| Deployment | ⛔ zwei Secrets fehlen (§1) |
| Merge nach `main` | ⛔ nicht erfolgt, Owner-Abnahme |
