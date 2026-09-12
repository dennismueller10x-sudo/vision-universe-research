# Vision Universe 2.0 — Integrierte Eigentuemer-Vorschau

**Stand:** 2026-09-11 · Zweig `claude/vu2-data-stack-integration`
(aus `claude/vu2-owner-preview-integration`, dazu der abgenommene
Datenstand aus `claude/tiingo-us-equity-discovery-k5j4bc`)
**Zweck:** das tatsaechliche Produkt einmal ansehen. Kein neuer
Produktabschnitt, keine Neugestaltung, keine Architektur.

Dies ist eine **Aggregation fuer die Abnahme**, keine neue Quelle der
Wahrheit. Sie fuegt zusammen und aendert nicht.

---

## 1. Isolation

### Gesperrt — nicht angefasst

| Zweig | Stand |
|---|---|
| `workstream/vu2-signals-workspace` (PR #72) | **Spitze**; enthaelt Portfolio, Strategy und alles davor |
| `workstream/vu2-portfolio-workspace` (PR #71) | in der Spitze enthalten |
| `workstream/vu2-strategy-workspace` (PR #70) | in der Spitze enthalten; Phase 0 bis 07 |
| `workstream/vu2-eod-gates` (PR #65) | ein Commit daneben (EOD-Gates) |
| `workstream/vu2-quant-workspace`, `-technical-workspace`, `-screener-workspace`, `-research-workspaces`, `-experience`, `-intelligence-contracts`, `-lifecycle-foundation`, `-phase0-audit` | alle in der Spitze enthalten |
| `codex/sec-master-universe-large`, `codex/development-preview-activation` | nicht beruehrt |

Kein Merge, kein Rebase, kein Push in einen dieser Zweige. Sie sind
**Leseeingaben**.

### Genau eine fremde Datei wurde angefasst

`vu2/index.html` — drei Zeilen: das Stylesheet und die beiden Skripte der
Bruecke. Der Test **OP1** vergleicht Blob fuer Blob gegen den VU2-Zweig
und schlaegt fehl, sobald irgendeine andere fremde Datei abweicht; er
prueft ausserdem, dass die Aenderung rein additiv ist und die
Ladereihenfolge stimmt.

### Warum eine Bruecke und kein Eingriff

`quant/api/product-services.js` ist auf die fuenf freigegebenen Titel
begrenzt — nicht aus Nachlaessigkeit, sondern weil zum Zeitpunkt ihres
Baus nichts anderes ausgeliefert war. Astra arbeitet daran weiter. Eine
Aenderung dort waere ein Konflikt bei jedem naechsten Commit.

`vu2-bridge/bridge.js` legt sich deshalb dazwischen:

```
quant/api/product-services.js   erzeugt die Dienste
vu2-bridge/bridge.js            umhuellt sie
vu2/experience.js               benutzt sie, unveraendert
```

Faellt die Bruecke weg, ist der urspruengliche Zustand da. **OP2** prueft,
dass umhuellt und nicht ersetzt wird und dass keine fremde Datei die
Bruecke kennt.

---

## 2. Was integriert ist

| Bereich | Woher | Zustand in der Vorschau |
|---|---|---|
| Shell, Navigation, Suche | `vu2/experience.js` (Astra) | vollstaendig; Suche ersetzt durch die Volluniversum-Suche |
| Home, Markets, Discover | Astra | vollstaendig, auf dem vollen Universum |
| Screener | Astra + Bruecke | Regeln von Astra, Grundgesamtheit 5.357 Faktorzeilen des Produktuniversums |
| Stock Intelligence | Astra + Bruecke | jeder der 7.803 Titel oeffnet sich — auch die ausgeschlossenen |
| Produkteignung | Datenstrang + Bruecke | 7.004 Produkttitel von 7.803 Mitgliedern; als Feld im bestehenden Screener filterbar |
| Quant Workspace | Astra + Bruecke | Golden Five: SEC-Faktoren; alle uebrigen: gemessene Kursfaktoren |
| Fundamentals & Historie | Astra | fuenf SEC-Titel — dafuer gibt es keine weiteren Daten |
| Technical, Elliott | Astra | wo ein Technical-Bundle vorliegt |
| Strategy Lab | Astra | vollstaendig; Backtest-Gate bleibt ausdruecklich ungeloest |
| Portfolio | Astra (#71) | manuelle Positionen mit begrenzter Bewertung |
| Signals | Astra (#72) | historische Regeluebergaenge aus geteilten Screener-Regeln |

### Was die Bruecke bewusst nicht tut

Sie erfindet keinen Wert. Wo das Universum nichts traegt — Kursniveaus,
Fundamentaldaten ausserhalb der SEC-Titel, Kursreihen ausserhalb der
Freigabe — steht ein Produktzustand mit Begruendung, keine Null. **OP5**
prueft das an der laufenden Bruecke, nicht am Quelltext.

### Listen und Suche

Die Listenansichten zeigen die meistgehandelten Titel (Messung, keine
Bewertung). **Die Suche sieht weiterhin alles; Listen und Screener
rechnen ueber das Produktuniversum.** Das Kopfband nennt auf jeder
Seite beide Zahlen — ohne diese Zeile laesen sich 48 Zeilen wie "mehr
gibt es nicht".

### Der aufgeraeumte Datenstand

Der Backfill hat 7.803 Titel geholt, darunter 799 **belegte** Warrants,
Units, Rights und Testpapiere in der punktlosen NASDAQ-Schreibweise
(`AACBW` ist der Warrant auf `AACB`). Sie bleiben Mitglieder — geloescht
wird nichts — und sind ueber die Suche weiter erreichbar, aber sie
zaehlen nicht mehr in Listen, Screener und Ranglisten.

| Ausgang | Titel | Im Produkt |
|---|---:|---|
| `ELIGIBLE` | 6.477 | ja |
| `SEPARATE_CLASS` (belegte Vorzuege) | 308 | ja |
| `REVIEW` (Verdacht **ohne** Stammbeleg) | 219 | ja, markiert |
| `EXCLUDED` (belegte Nicht-Aktie) | 799 | nein |

Die Regel der Bruecke lautet **"nicht EXCLUDED"** und nicht "gleich
ELIGIBLE". Der Unterschied sind 527 Titel: belegte Vorzuege, die
handelbar sind, und 219 Verdachtsfaelle, die nie widerlegt wurden. Ein
Verdacht ist kein Befund — `IN4` macht den Fehler absichtlich und
verlangt, dass er auffaellt.

Statt der einen Zahl `CHART_READY 84,81 %` tragen Kopfband und
`meta.json` jetzt drei, mit drei Schwellen aus den Stellen, die sie
anwenden: Ablage 99,99 %, zeichenbar 99,9 % (ab 2 Bars,
`chart-ranges.js`), Technik 85,14 % (ab 300 Bars,
`run-technical-scale.mjs`).

---

## 2b. Der Kurshistorienspeicher am Hauptchart

Die 7.802 Reihen aus Cloudflare R2 speisen jetzt den **bestehenden**
Hauptchart der Einzeltitelseite. Kein zweiter Chart, kein eigener
Abschnitt: `1T` und `5T` sind Zeitraeume desselben Charts.

```
Browser --HTTPS--> /api/history  --SigV4--> Cloudflare R2   (Tagesschluss)
Browser --HTTPS--> /api/intraday --HTTPS--> api.tiingo.com  (1T, 5T)
Browser --SSE----> /api/realtime --WSS----> Tiingo          (Kursaktualisierung)
```

Der Browser bekommt **kein** Zugangsmittel und spricht mit **keinem**
der beiden Anbieter direkt. `CH1` und `CH2` pruefen das am Quelltext
aller Dateien, die der Browser laedt.

| Frage | Antwort |
|---|---|
| Nutzlast im Normalfall | `date` + `close`, sonst nichts (`CH3`) |
| OHLCV | nur auf `columns=ohlcv` |
| Anbieteranfragen je Chartaufruf | **0** — gelesen wird der Speicher |
| Kosten je Aufruf | ein GET (Class B), kein Schreibvorgang |

### Junge Listings

`MTNE` hat 57 Handelstage, `IPVV` 33. Beide bekommen ihren
**vollstaendigen** Verlauf. Zu wenig Historie fuer die Technik (300
Bars) ist **nicht** dasselbe wie "keine Historie" — `CH8` und `CH9`
halten die beiden Fragen auseinander. Ein Zeitraum, den die Reihe nicht
hergibt, verschwindet nicht aus der Leiste: er wird abgeblendet und
traegt seinen Grund.

### Was der Strom tut

Der Echtzeitweiterleiter zeichnet keinen eigenen Chart mehr. Er haengt
seine Punkte an den **laufenden** Chart, und nur dann, wenn gerade ein
Intraday-Zeitraum zu sehen ist: einzelne Ticks in einen Zehnjahreschart
zu schreiben ergaebe eine Linie, die etwas anderes behauptet als sie
zeigt. Die Beschriftung bleibt **"Kursaktualisierung"** — die Kursart
ist vom Anbieter nicht bestaetigt.

### Der Umfang von Intraday — eine Eigentuemerentscheidung

`/api/intraday` bediente die fuenf Titel aus
`quant/config/development-preview.json`. Diese Freigabe wurde fuer eine
**oeffentliche** Seite getroffen; ihre eigene Begruendung sagt das
woertlich. Die Serverfunktion existiert auf der oeffentlichen
Auslieferung nicht — sie laeuft nur hinter Vercel Authentication. Sie
bedient dort jetzt das **Produktuniversum** (7.004 Titel).

Die oeffentlichen Gates sind unveraendert:
`ENABLE_PUBLIC_LIVE_MARKET_DATA` steht weiter auf `false`,
`quant/config/development-preview.json` ist nicht angefasst. Ist die
Produktliste nicht lesbar, gilt wieder die engere Fuenf-Titel-Freigabe —
die Rueckfallrichtung ist absichtlich eng.

## 2c. Ranglistenhygiene

Auf Platz eins der Zwoelfmonatsrendite stand `MINE` mit **314.999.900 %**.
Das ist keine Kursbewegung, sondern eine Bereinigungsluecke.

`dataQuality` allein loest das nicht: `MINE` und `AAPL` tragen dieselbe
Stufe und denselben Grund (`WARNING · large_move_matching_split_ratio`),
und `WARNING` traegt 4.927 der 7.803 Titel. Wer `WARNING` unterdrueckt,
loescht das Produkt; wer nur `FAIL` unterdrueckt, laesst `MINE` oben
stehen.

Was trennt, ist die Groesse des Wertes. Gemessen ueber 5.620 Titel:
Median 1,2 %, p99 341 %, p99,5 683 %, Maximum 314.999.900 %. Die
Plausibilitaetsgrenzen stehen in `quant/engines/ranking-hygiene.js`,
mit ihrer Herleitung.

| Grund | Eintraege |
|---|---:|
| `NOT_IN_PRODUCT_UNIVERSE` (Warrants, Testpapiere wie `ZWZZT`) | 79 |
| `IMPLAUSIBLE_VALUE` | 78 |
| `BROKEN_SERIES_ELSEWHERE` | 41 |

Der letzte Grund ist der wichtigste: `SPCL` traegt 1.806.567 % Rendite
und zugleich eine relative Staerke von 9,6, die unter der Grenze liegt.
Frageweise geprueft flog es aus der einen Liste und fuehrte die andere
an. Wer an **einer** Kennzahl unplausibel ist, fuehrt **keine** Liste an.

**Zurueckgehalten heisst nicht veraendert.** Die Werte stehen
unveraendert in den Zeilen, im Artefakt und im Speicher; sie stehen
zusaetzlich in `quarantined` mit ihrem Grund. Die Titel bleiben ueber
Suche, Einzeltitel und Chart erreichbar.

## 3. Der Chart — drei getrennte Antworten

### 3.1 Historisch — LAEUFT

Echte Tiingo-EOD-Kurse fuer die fuenf freigegebenen Titel, im Browser
gemessen. Fuer alle uebrigen Titel steht ein ausgesprochener Zustand:
*"Fuer <Ticker> ist keine Kursreihe ausgeliefert"* — mit dem richtigen
Grund, und statt der leeren grossen Zahl die gemessene Aussage, die der
Titel hat (Abstand zum 200-Tage-Durchschnitt).

### 3.2 Intraday — LAEUFT, SERVERSEITIG

`api/intraday.js` holt die Bars mit dem Schluessel auf der Serverseite.
Gemessen im Lauf 34564221102: **234 Fuenf-Minuten-Bars**
(2026-09-08 13:30Z bis 2026-09-10 19:55Z), in der Produktseite
gezeichnet.

Damit ist die Frage aus 5B beantwortet: die geschuetzte Umgebung **kann**
Intraday serverseitig holen.

### 3.3 Echtzeit — DER WEG STEHT, GEMESSEN

`api/realtime.js` haelt den Tiingo-IEX-WebSocket und gibt ihn als
Server-Sent-Events an den Browser weiter. Der Schluessel bleibt auf dem
Server; **OP3** prueft jede einzelne Fundstelle der Variablen.

Messung im Lauf 34564221102, echter Browser auf der echten Produktseite:

| Messpunkt | Wert |
|---|---|
| Titel | AAPL |
| Sitzung | CLOSED (ET 01:00) |
| Schluessel | vorhanden (GitHub-Secret) |
| **Verbindung zum Anbieter** | **hergestellt** |
| Aktualisierungen im Fenster (75 s) | **0** |
| Urteil | `CONNECTED_NO_EVENTS` |

Der Weg Browser → Serverfunktion → Anbieter steht und ist gemessen. Es
kam kein Kursereignis, **weil die Boerse geschlossen war**. Es wurde
nichts erfunden, um den Chart bewegt aussehen zu lassen.

**Kursart.** Der Anbieter nennt sie nicht (`priceType: UNSPECIFIED`). Die
Oberflaeche schreibt deshalb "Kursaktualisierung" und nicht "letzter
Handelskurs". **OP4** prueft die Beschriftung.

### Die beiden verbleibenden Sperren

> **Nachtrag 2026-09-11:** Der Schluessel ist im Vercel-Projekt gesetzt
> (Scope Preview). Eine bereits gebaute Auslieferung sieht ihn dadurch
> **nicht**: Vercel friert die Umgebungsvariablen beim Bauen ein. Die
> Messung gegen die Auslieferung vom 05:13 UTC meldete deshalb weiterhin
> `NOT_CONFIGURED` — richtig gemessen, nur an einem Stand von vorher. Es
> braucht einen neuen Bau; der liest die Variable beim Start.

1. **`TIINGO_API_KEY` fehlt in der Vercel-Umgebung.** Beide
   Serverfunktionen laufen dort, antworten und melden
   `NOT_CONFIGURED` mit der Abhilfe. Eine Einstellung, kein
   Programmfehler:
   *Vercel → Projekt → Settings → Environment Variables →
   `TIINGO_API_KEY`, Scope **Preview***. Danach zeigt dieselbe Seite
   Intraday-Bars und den laufenden Strom.
2. **Handelszeiten.** Kursereignisse gibt es, wenn gehandelt wird:
   regulaer 13:30–20:00 UTC, erweitert ab 08:00 UTC. Die Messung laesst
   sich jederzeit wiederholen — *Actions → „Vercel — Nachweis der
   geschuetzten Vorschau" → Run workflow*.

---

## 4. Nachweise

| Lauf / Test | Ergebnis |
|---|---|
| `verify-owner-preview.mjs` (O1–O10, am ausgelieferten System) | alle Produktpruefungen belegt; O7/O8 uebersprungen wegen des fehlenden Schluessels |
| `measure-live-chart.mjs` (Browser + echter Anbieter) | `CONNECTED_NO_EVENTS` — Weg steht, Boerse zu |
| `owner-preview.test.mjs` (OP1–OP5) | 5/5 |
| `vu2-data-stack-integration.test.mjs` (IN1–IN10) | 10/10 |
| `r2-chart-integration.test.mjs` (CH1–CH13) | 13/13 |
| `verify-history-endpoint.mjs` (H1–H8, gegen echtes R2) | im Workflow `r2-history-verify` |
| Gesamtsuite | 927 Tests, 925 bestanden |
| Datenhygiene, Schluesselpruefung | gruen |

**PD8 und PP5 sind rot, und zwar schon vorher.** Beide pruefen, dass die
Vorschau keine oeffentliche Datei veraendert, und rechnen den Diff gegen
`main`. Sie nehmen Dateien aus, deren Blob mit einem der beiden
genannten VU2-Workstream-Zweige uebereinstimmt — 15 Dateien unter
`quant/api/`, `quant/ui/`, `quant/technical/` und `quant/engines/`
stammen aber aus *anderen* Merges und stehen in keiner der beiden
Listen. Das war auf `claude/vu2-owner-preview-integration` schon so und
ist unabhaengig von dieser Arbeit; nachgerechnet an einem Worktree des
unveraenderten Zweiges. Die fuenf Engines des Datenstrangs sind in die
Ausnahmeliste aufgenommen — dieselbe Regel, gleicher Blob heisst nicht
angefasst —, damit diese Arbeit den Befund nicht vergroessert.

Ein uebersprungener Nachweis ist ausdruecklich **kein** bestandener.

---

## 5. Grenzen dieser Vorschau

| | |
|---|---|
| **Sie ist keine Quelle der Wahrheit** | Die VU2-Arbeit lebt in Astras Zweigen. Was hier zusammenlaeuft, dient der Ansicht. |
| **Kein VU Quant Score ausserhalb der SEC-Titel** | Er braucht Fundamentaldaten; das Universum traegt keine. |
| **Firmennamen fehlen** | Der Anbieterzugang liefert fuer dieses Universum keinen Namen. Die Suche vergleicht Ticker. |
| **Backtests** | Das Vertrauens-Gate von Astra bleibt ungeloest; daran wurde nichts geaendert. |
| **Kursniveaus** | zurueckgehalten. Ausgeliefert werden Zustaende, Abstaende und Renditen. |
