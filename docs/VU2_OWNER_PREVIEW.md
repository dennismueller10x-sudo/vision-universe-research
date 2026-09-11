# Vision Universe 2.0 — Integrierte Eigentuemer-Vorschau

**Stand:** 2026-09-11 · Zweig `claude/vu2-owner-preview-integration`
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
| Screener | Astra + Bruecke | Regeln von Astra, Grundgesamtheit 5.636 Faktorzeilen |
| Stock Intelligence | Astra + Bruecke | jeder der 5.683 Titel oeffnet sich |
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
Bewertung). **Suche und Screener sehen immer alle.** Das Kopfband nennt
auf jeder Seite den wahren Umfang — ohne diese Zeile laesen sich
48 Zeilen wie "mehr gibt es nicht".

---

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
| Gesamtsuite | 766 Tests |
| Datenhygiene, Schluesselpruefung | gruen |

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
