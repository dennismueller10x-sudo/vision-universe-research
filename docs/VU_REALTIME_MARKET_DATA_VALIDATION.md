# VU REALTIME MARKET DATA VALIDATION

Was geprüft wurde, wie, und was dabei herauskam.

Stand: 2026-09-08
Branch: `claude/realtime-market-data-architecture-bf2gkk`
Basis: `origin/main` @ `39335ad`
Architektur: `VU_REALTIME_MARKET_DATA_ARCHITECTURE.md`

---

## Kurzfassung

| | |
|---|---|
| Architektur | gebaut, geprüft, 95 neue Tests grün |
| Tiingo EOD / Intraday | belegt (Phase 4A, unverändert gültig) |
| Tiingo Echtzeit | **UNKNOWN** — nicht messbar in dieser Umgebung |
| API-Schlüssel-Sicherheit | keine Änderung an der Angriffsfläche, vier zusätzliche Tests |
| Lizenz | `LEGAL_REVIEW_REQUIRED`, unverändert |
| Deployment | nichts |
| Empfehlung | **READY FOR PRIVATE REALTIME TEST** |

---

## 1. Die Capability-Matrix

`AVAILABLE` heißt: an echten Daten belegt. `UNKNOWN` heißt: niemand hat
nachgesehen — und wird nirgends wie `AVAILABLE` behandelt.

| Datenklasse | Fähigkeit | Zustand | Beleg |
|---|---|---|---|
| `EOD` | `market.historicalDaily` | **VERIFIED** | Laufzeitnachweis Phase 4A, GitHub Actions, 1.517 Bars ab 1990-01-02 |
| `INTRADAY` | `market.intraday` | **VERIFIED** | Laufzeitnachweis Phase 4A, IEX, 78 Bars |
| `REALTIME_QUOTE` | `market.realtime` | **UNKNOWN** | kein Lauf möglich — kein Schlüssel in dieser Umgebung |
| `REALTIME_STREAM` | `market.websocket` | **UNKNOWN** | dito |
| — | `market.delayed` | **UNKNOWN** | dito |
| — | `market.splitAdjustedPrices` | **VERIFIED** | Split 2021-07-20, roh springt, bereinigt nicht |
| — | `market.adjustedPrices` (Total Return) | **VERIFIED** | Dividendenstichtag, Phase 4A |
| — | `market.splits` / `market.dividends` | **VERIFIED** | Phase 4A |

Was der Kursendpunkt betrifft, ist die Unterscheidung entscheidend und
bisher **nicht** getroffen worden: dass `/iex/{ticker}` antwortet, ist
gemessen. Ob die Zahl von jetzt oder von vor fünfzehn Minuten ist, ist es
nicht. Genau diese Verwechslung ist der Grund für diesen Workstream.

### Warum UNKNOWN und nicht gemessen

In dieser Ausführungsumgebung ist **kein `TIINGO_API_KEY` hinterlegt**. Der
Nachweis wurde geschrieben und läuft — er meldet ohne Schlüssel:

```
Kein TIINGO_API_KEY gesetzt. Es wird nichts abgerufen und nichts behauptet.
Alle Echtzeitfaehigkeiten bleiben ungeprueft (UNKNOWN).
```

Er schreibt in diesem Fall **keinen Bericht**. Ein Bericht mit lauter
UNKNOWN-Einträgen wäre eine Datei, die aussieht, als hätte jemand
nachgesehen.

Zweite Bedingung, unabhängig vom Schlüssel: der Befund ist nur bei
**offener Börse** aussagekräftig. Ein Kurs von Freitag 22:00 ist am Samstag
fünfzehn Stunden alt und trotzdem der richtige — daraus folgt weder
„verzögert" noch „Echtzeit". Außerhalb des regulären Handels meldet das
Skript `UNKNOWN` mit der Begründung, dass der Lauf zur falschen Zeit
stattfand.

### Wie der Nachweis geführt wird

`scripts/market/verify-tiingo-realtime.mjs`, Job `realtime` in
`.github/workflows/tiingo-verify.yml`, nur auf Anforderung.

| Prüfung | Was gemessen wird | Schwelle |
|---|---|---|
| `latestQuote` | antwortet der Endpunkt mit einem Kurs? | — |
| `realtimeQuote` | Abstand Anbieterzeitstempel ↔ Laufzeit, bei offener Börse | ≤ 90 s → PASSED |
| `delayedQuote` | derselbe Abstand | ≥ 600 s → PASSED |
| `historicalIntraday` | Bars über mehrere Tage, aufsteigend | ≥ 2 Bars |
| `intradayFreshness` | Alter der jüngsten Intraday-Bar | Information |
| `realtimeStream` | Verbindung offen **und** verwertbare Kursnachricht | nur mit `--with-stream` |

Zwischen 90 s und 600 s lautet der Befund `UNKNOWN` — weder das eine noch
das andere, und das ist ein eigenes Ergebnis statt eines gerundeten Ja.

Beim Strom wird ausdrücklich unterschieden: ein Socket, der sich öffnet und
nie eine Kursnachricht sendet, ist kein Echtzeitzugang. Er ist ein offener
Socket.

**Der Bericht enthält keine Kurse.** Nur Abstände in Sekunden, Anzahlen und
Aussagen. Zwei Prüfungen im Workflow halten das fest: eine auf den
Schlüssel, eine auf Preisfeldnamen im Bericht.

---

## 2. Die Fallback-Matrix

Alle fünfzehn Szenarien der Vorgabe sind automatisiert und laufen gegen den
echten Feed mit gestellter Uhr — nicht gegen Attrappen der Entscheidungslogik.

| | Szenario | Erwartet | Ergebnis |
|---|---|---|---|
| A | Realtime verfügbar | LIVE | ✓ `LIVE · 14:00:00`, Klasse `REALTIME_QUOTE` |
| B | Stream fällt aus | Reconnect → Intraday | ✓ Statusfolge `LIVE → RECONNECTING → INTRADAY` |
| C | kein Realtime, Intraday da | INTRADAY | ✓ `INTRADAY · Stand 14:00` |
| D | nur EOD | EOD | ✓ `LETZTER SCHLUSSKURS · 07.09.2026` |
| E | nichts verfügbar | UNAVAILABLE | ✓ kein Absturz, 0 Bars, kein Mock |
| F | Realtime kehrt zurück | Backfill → Dedup → LIVE | ✓ Nachladen belegt, keine doppelten Eimer |
| G | veraltete Realtime-Daten | nicht mehr LIVE | ✓ `VERZÖGERT · Stand …`, Bars bleiben stehen |
| H | Markt geschlossen | korrekter Status, kein Fehler | ✓ `MARKET_CLOSED`, `retryCount = 0` |
| I | Provider-Timeout | letzter Stand bleibt sichtbar | ✓ Bars nicht verworfen, Etikett gewechselt |
| J | Rate Limit | kontrollierter Rückfall | ✓ Klasse gewechselt, `fallbackReason` gesetzt |
| K | doppelter Timestamp | keine doppelte Kerze | ✓ 1 Bar, ≥ 3 Dubletten unterdrückt |
| L | Out-of-order | deterministisch | ✓ Reihe aufsteigend, Schlusskurse in richtiger Ordnung |
| M | Split-Tag | kein künstlicher Sprung | ✓ `requiresReload = true`, Grund `split:…` |
| N | Zeitumstellung | korrekte Session | ✓ 06.03. und 09.03.2026 beide `REGULAR`, 09:35 Ortszeit |
| O | kein API-Key | kein Absturz, definierter Fallback | ✓ `not_configured`, 0 Bars, kein erfundener Kurs |

Jedes Szenario prüft zweierlei: **was der Chart zeigt UND was darüber
steht.** Das ist keine Verdopplung — ein Chart mit den richtigen Daten und
dem falschen Etikett ist gefährlicher als einer, der nichts zeigt.

---

## 3. Testzahlen

| Suite | vorher | nachher |
|---|---|---|
| JS (`quant/tests/*.test.mjs`) | 444 | **539** |
| Python (`scripts/quant/cli.py test`) | 249 | **249** |
| **gesamt** | 693 | **788** |
| Fehler / übersprungen | 0 / 0 | **0 / 0** |

Neu, 95 Prüfungen:

| Datei | Anzahl | Gegenstand |
|---|---|---|
| `realtime-capability.test.mjs` | 25 | Datenklassen, Verhandlung, Handelszeiten, Verfall |
| `realtime-engine.test.mjs` | 34 | Fallback-Engine, Automat, Merge, Chart-Adapter |
| `realtime-matrix.test.mjs` | 15 | Szenarien A–O |
| `realtime-integration.test.mjs` | 21 | Zusagen: Etikett, Schlüssel, Provenienz, Lizenz |

**Keine bestehende Prüfung wurde geändert, entfernt oder abgeschwächt.**
Der Vergleich gegen `origin/main` zeigt unter `quant/tests/` ausschließlich
neue Dateien.

### Zwei Befunde, die aus dem Testschreiben zurückflossen

Beides waren echte Fehler, keine Testartefakte:

1. **Szenario F** deckte auf, dass eine abgerufene Bar der *noch laufenden*
   Periode als bestätigt galt und damit jeden Tick aussperrte, der sie
   verfeinern sollte. Der Chart stand still, während Daten hereinkamen.
   Behoben in R2: bestätigt ist eine Bar erst, wenn ihre Periode abgelaufen
   ist.

2. Derselbe Fall zeigte, dass der **Wiederaufstieg** nach einem Rückfall am
   Nachladen vorbeilief — er ging direkt in den Echtzeitpfad und hätte eine
   Lücke als live gezeigt. Er nimmt jetzt denselben Weg wie der
   Wiederaufbau.

---

## 4. Browsertests

Echter Chromium, echte Viewports, die Module aus dem Repository über HTTP
geladen — kein Bündler, keine Attrappe.

| | Desktop 1440×900 | Mobil 390×844 (Touch, DPR 3) |
|---|---|---|
| Module laden | ✓ | ✓ |
| JS-Fehler | 0 | 0 |
| Statusfolge | `AUFGEBAUT → VERZÖGERT → LIVE → VERZÖGERT` | identisch |
| SVG gezeichnet | ✓ 41 Bars | ✓ |
| Waagerechter Überlauf | nein | nein |
| Statusanzeige | korrekter Ton und Farbe | korrekter Ton und Farbe |

Der Adapter meldete für den Ablauf `1 reset, 1 append, 3 übersprungen` —
inkrementelles Verhalten in der echten Oberfläche bestätigt.

**Ein echter Mobilbefund, behoben:** Die Zeichenfläche des Live-Charts hatte
nicht die Eindämmung, die `.q-chart-wrap` den bestehenden Charts gibt.
`.q-chart` trägt `overflow: visible`; ein Kerzenstrich am Rand schiebt damit
auf einem schmalen Bildschirm die Seite waagerecht auf. Behoben in
`quant.css`.

---

## 5. Performance

Gemessen an 5.000 Bars Historie und 100.000 Ticks (Node 22).

| | vorher | nachher |
|---|---|---|
| unveränderter Stand, Chartentscheidung | 3.132 µs | **0,12 µs** |
| Tick + Chartentscheidung (Oberflächenweg, zusammengefasst) | — | **9,5 µs** |
| Tick + Chartentscheidung (jede Änderung sofort gezeichnet) | 501 µs | 586 µs |
| Tick in die laufende Kerze falten | 8,3 µs | 9,4 µs |
| Nachzügler in eine 5.000er-Reihe einsortieren | 165 µs | 165 µs |
| Heap: 5.000 Bars + 50.000 Ticks | — | **1,7 MB** |
| Ticks pro Sekunde (Merge) | — | ~107.000 |

Zwei Zahlen brauchen eine Erklärung, weil sie in die falsche Richtung
gingen:

- **Tick falten 8,3 → 9,4 µs.** Der Preis dafür, dass „abgeschlossen" jetzt
  am Kalender hängt und nicht am Aufnahmezeitpunkt (siehe Audit-Befund A1).
  Der zweite Kalenderaufruf je Tick kostete zunächst 18,6 µs; er ist je
  Minute gemerkt, was exakt und nicht genähert ist — Zeitzonen versetzen um
  volle Minuten, der Eimer wechselt also genau dann, wenn der Schlüssel
  wechselt.
- **Sofort-Zeichnen 370 → 586 µs.** Derselbe Grund, multipliziert mit 600
  Bars je Fenster. Diesen Weg geht die Oberfläche nicht: sie fasst zusammen
  und liegt bei 9,5 µs. Die Zahl steht hier für Aufrufer, die je Tick eine
  Zeichnung erzwingen.

Die Heap-Zahl der ersten Fassung dieses Berichts (22,4 → 14,6 MB) war ohne
erzwungene Bereinigung gemessen und schwankte zwischen den Läufen um den
Faktor zwei — sie war wertlos. Der Wert oben ist mit `--expose-gc` gemessen
und über drei Läufe auf 0,1 MB stabil.

Der Ausgangswert war unhaltbar: 3,1 ms je Tick, nur um festzustellen, dass
sich nichts geändert hat. Bei hundert Ticks in der Sekunde wäre das ein
Drittel der Rechenzeit für eine Auskunft, die „nein" lautet. Die Ursache war
nicht der Vergleich, sondern die Schutzkopie von 600 Bars, die ihn
ermöglichen sollte.

Weitere gemessene Größen:

| | |
|---|---|
| Duplikatunterdrückung | 100 % (K, und 1.000/1.000 im Lasttest) |
| Anfragen/Minute, Kursabruf (Standard) | 1 — 60/h, gegen 50/h im freien Tarif bewusst knapp |
| Anfragen/Minute, Intraday (Standard) | 0,2 — 12/h |
| Reconnect-Dauer | Backoff 1/2/4/8/15/30 s, gedeckelt, nach 5 Versuchen Rückfall |
| Historie einspielen (5.000 Bars) | ~180 ms, einmalig |

Die Abrufabstände sind eine Rechnung, kein Komfortwert: ein Kursabruf alle
15 Sekunden wären 240 Anfragen pro Stunde und hätten das Stundenkontingent
des freien Zugangs nach zwölf Minuten verbraucht.

---

## 6. API-Schlüssel-Sicherheit

**Die Angriffsfläche ist unverändert.** Dieser Workstream führt keinen neuen
Weg ein, auf dem ein Schlüssel den Browser erreichen könnte.

| Prüfung | Ergebnis |
|---|---|
| `scripts/market/assert-no-secrets.mjs` | 18 Dateien, 0 Treffer |
| `quant/tests/secrets.test.mjs` (bestehend) | grün |
| Kein `process.env` in Realtime-Modulen und `live-chart.js` | ✓ (Test I17) |
| Keine Anbieteradresse, kein `apiKey`, kein `Authorization` dort | ✓ (Test I17) |
| `transport.js` baut keinen Socket selbst | ✓ (Test I18) |
| `providers/tiingo/realtime.js` verweigert den Browser | ✓ (Test I19) |
| Kein Vendor-Feld im kanonischen Tick | ✓ (Test I20) |
| Diagnose enthält kein Token | ✓ (Test I21) |
| Bericht enthält keinen Schlüssel und keine Kurse | ✓ (Skript + Workflow, zwei Linien) |

Der IEX-Strom authentifiziert sich mit dem Token in der ersten Nachricht.
Deshalb ist `providers/tiingo/realtime.js` serverseitig und prüft das beim
Laden — ein Ladefehler im Browser ist das gewünschte Verhalten.

---

## 7. Regressionen

| Bereich | Status | Nachweis |
|---|---|---|
| Technical Intelligence / Elliott | **unberührt** | kein Modul unter `quant/engines/technical/` geändert; alle Technical-Tests grün |
| SEC | **unberührt** | kein Modul unter `providers/sec/`, `scripts/quant/sec/` geändert; 249 Python-Tests grün |
| Quant Engine, Screener, Backtest | **unberührt** | 444 bestehende JS-Tests unverändert grün |
| Chart-Modul `ui/charts.js` | **unberührt** | keine Änderung; der Live-Adapter liegt daneben |
| `providers/tiingo/adapter.js` | **erweitert** | vier Belegzuordnungen, ein zweiter Berichtspfad; bestehende Tests grün |
| `quant/ui/quant.css` | **ergänzt** | nur neue Regeln unter `.vu-*` |

Der einzige geänderte Bestandscode ist der Tiingo-Adapter, und dort
ausschließlich additiv.

---

## 8. Lizenzstatus

**Unverändert: `LEGAL_REVIEW_REQUIRED`.**

Dieser Workstream trifft keine Aussage über Redistribution und hat keine
getroffen. Technische Funktionsfähigkeit ist keine Lizenzfreigabe;
Realtime verfügbar ist nicht Realtime-Redistribution erlaubt.

| Gate | Zustand | Grund |
|---|---|---|
| `ENABLE_LIVE_MARKET_DATA` | **aus** | IEX-Nutzungsbedingungen ungeprüft |
| `ENABLE_PUBLIC_LIVE_MARKET_DATA` | **aus** | keine geprüfte Anzeigeerlaubnis |

Beide unverändert gegenüber `origin/main`. Ein Test (I14) hält fest, dass
sie aus sind und eine Begründung mit Datum tragen.

Test I15 hält den entscheidenden Fall fest: **alle** Fähigkeiten belegt,
**beide** Gates offen — und öffentlich trotzdem `BLOCKED_BY_LICENSE` für
jede Datenklasse, solange keine Erlaubnis mit Grundlage und Prüfdatum
eingetragen ist. Ein Gate schaltet keine Erlaubnis frei; es setzt eine
bereits erteilte um.

---

## 9. Release Gates

| Gate | Status | Begründung |
|---|---|---|
| `ARCHITECTURE_READY` | **JA** | 11 Module, 92 Tests, A–O vollständig, Browser Desktop und Mobil |
| `FREE_TIER_VALIDATED` | **TEILWEISE** | EOD, Intraday, Splits, Dividenden, Bereinigung belegt (Phase 4A). Echtzeitpfade nicht messbar |
| `INTRADAY_READY` | **JA, technisch** | Fähigkeit belegt, Pfad gebaut und geprüft. Gate aus, Lizenz offen |
| `REALTIME_READY` | **NEIN** | Der echte Echtzeitpfad wurde mit dem vorliegenden Konto nicht verifiziert |
| `REALTIME_UNKNOWN` | **JA** | genau der Zustand, in dem der Workstream endet — und der so benannt wird |
| `LICENSE_REVIEW_REQUIRED` | **JA** | unverändert |
| `PUBLIC_RELEASE_BLOCKED` | **JA** | beide Gates aus, keine Anzeigeerlaubnis, kein Deployment |

`REALTIME_READY` ist ausdrücklich **nicht** gesetzt. Die Bedingung dafür ist
ein technisch verifizierter Echtzeitpfad mit dem tatsächlich verwendeten
Konto. Diese Verifikation hat nicht stattgefunden, weil sie in dieser
Umgebung nicht stattfinden konnte.

---

## 10. Offene Punkte

### CRITICAL

Keine.

### Im Audit gefunden und behoben

| # | Befund | Schwere | Status |
|---|---|---|---|
| A1 | Abgeschlossene Kerze war durch Nachzügler-Ticks beweglich | HIGH | **behoben**, 3 Prüfungen |
| A2 | Grundloser Chart-Neuaufbau beim Kerzenwechsel | MEDIUM | **behoben**, 1 Prüfung |

### HIGH

| # | Punkt |
|---|---|
| H1 | **Echtzeit ist ungeprüft.** Keine Aussage darüber, ob der vorliegende Tiingo-Zugang Kurse von jetzt liefert. Nächster Schritt: `tiingo-verify.yml` → `run_realtime` bei offener US-Börse. |
| H2 | **Die WebSocket-Nachrichtenform ist an keinem echten Strom geprüft.** Der Parser ist der dokumentierten Form nachgebaut und defensiv: was nicht passt, ergibt `null` statt eines geratenen Kurses. Erst `--with-stream` klärt das. |
| H3 | **Der Live-Chart ist an keine Seite angebunden.** Der Adapter existiert und ist im Browser geprüft, aber keine ausgelieferte Seite benutzt ihn. Das ist Absicht — die Anbindung wäre eine Produktentscheidung mit Lizenzfolge. |

### MEDIUM

| # | Punkt |
|---|---|
| M1 | Der Handelskalender deckt 2025–2027 ab und ist nicht vom Anbieter bestätigt. Außerhalb trägt jeder Befund `calendarCoverage: false`. |
| M2 | Die Verfallsschwellen sind begründete Betriebsannahmen, nicht vom Anbieter zugesicherte Frequenzen. Versioniert, damit eine Änderung ein Commit ist. |
| M3 | Der Standardabstand des Kursabrufs (60 s = 60 Anfragen/h) liegt über dem Stundenkontingent des freien Zugangs (50/h). Für den freien Tarif ist ein größerer Abstand oder der Intraday-Pfad zu wählen; der Kontingentfehler wird aufgefangen, aber besser nicht ausgelöst. |
| M4 | Der Live-Chart zeichnet über das bestehende SVG-Modul und damit die Fläche neu, wenn gezeichnet wird. Der Adapter entscheidet nur *ob*. Eine inkrementelle Zeichenfunktion lässt sich über `render` hineinreichen, ohne dass sich sonst etwas ändert. |
| M5 | Die Pre-/After-Market-Zeiten stehen im Kalender, werden aber standardmäßig nicht als „Aktualisierung erwartet" gewertet (`includeExtended`). |

---

## 10a. Der Release-Audit

Nach Abschluss der Implementierung wurde die Architektur ein zweites Mal
geprüft — gezielt gegen die acht Zusagen, die sie macht, statt gegen die
Module, aus denen sie besteht. Der Audit hat **einen echten Fehler
gefunden**.

### A1 — Eine abgeschlossene Kerze war nachträglich beweglich

**Schwere: HIGH. Behoben.**

`confirmed` wurde beim Aufnehmen einer Bar berechnet und danach nie wieder.
Eine Kerze, die als „laufend" entstand, blieb es für immer — auch Minuten
nachdem ihre Periode abgelaufen war. Ein verspäteter Tick konnte damit den
Schlusskurs einer längst geschlossenen Kerze verschieben.

Beobachtet:

```
14:02:30   Kerze 14:00 entsteht, confirmed = false     (richtig, sie läuft)
14:06:00   Periode ist vorbei
14:06:00   Tick mit Zeitstempel 14:04 → angenommen     ← FALSCH
           Schlusskurs der Kerze 14:00 springt auf 250
```

Das verletzt die bestehende `VU_REPAINTING_POLICY`, Regel 2: *CONFIRMED wird
innerhalb derselben `dataVersion` nie still umgeschrieben.* Die Folge wäre
nicht nur ein falscher Chart gewesen: alles, was auf bestätigten Bars
rechnet — die gesamte Technical Intelligence —, hätte sich auf einen Wert
verlassen, der sich noch ändert.

**Behoben** in `bar-merge.js`: „abgeschlossen" ist keine gespeicherte
Eigenschaft mehr, sondern ergibt sich aus dem Kalender. Eine Kerze schließt,
weil Zeit vergeht, nicht weil jemand sie anfasst. Ein Tick in eine
abgelaufene Periode ist ein Nachzügler, wird verworfen und gezählt
(`rejectedConfirmed`). Eine *Bar des Anbieters* darf eine geschlossene Kerze
weiterhin korrigieren — das ist Regel 5 derselben Richtlinie, und der Rang
der Herkunft entscheidet, in welche Richtung.

Der Preis ist bekannt und bewusst: an der Intervallgrenze geht gelegentlich
ein Nachzügler-Tick verloren. Das ist der günstigere der beiden Preise.

Drei neue Prüfungen halten den Fall fest (`E22b`, `E22c`, `E30b`). Zwei
bestehende Fixtures wurden dabei korrigiert — nicht abgeschwächt: die
Testuhr stand exakt auf einer Intervallgrenze, sodass „vor einer Sekunde"
in der bereits geschlossenen Kerze lag. Jede Zusicherung dieser Tests ist
unverändert geblieben; `E18` prüft jetzt zusätzlich den vollen Lebenslauf
einer Kerze.

### A2 — Ein Neuaufbau des Charts beim Kerzenwechsel

**Schwere: MEDIUM (Leistung, keine Falschanzeige). Behoben.**

Aus A1 folgte: wenn eine neue Kerze aufmacht, wechselt die vorherige auf
„abgeschlossen". Das Gedächtnis des Chart-Adapters führte diesen Wechsel
nicht mit, sodass der nächste vollständige Abgleich einen Unterschied *in
der Vergangenheit* fand und die Fläche grundlos neu aufbaute. Behoben,
geprüft durch `E30b`.

### Die acht Prüfpunkte

| # | Punkt | Ergebnis |
|---|---|---|
| 1 | Keine Secrets im Browser oder Repository | ✓ 8 Einzelprüfungen, alle sauber |
| 2 | Keine Regression in SEC / Tiingo 4A / Technical / Quant | ✓ keine dieser Dateien im Diff; 788 Prüfungen grün |
| 3 | Fallback REALTIME → DELAYED → INTRADAY → EOD | ✓ volle Leiter durchlaufen, jede Stufe sichtbar |
| 4 | Laufende Kerze durch Ticks aktualisierbar | ✓ — **und Befund A1** |
| 5 | Reconnect/Backfill verhindert Lücken | ✓ 24 nachgeladene Bars, 0 Dubletten, 0 Lücken |
| 6 | Ohne Realtime bleibt der Chart nutzbar | ✓ 41 Bars, `LETZTER SCHLUSSKURS`, kein falsches LIVE |
| 7 | `REALTIME_READY` nicht ohne Nachweis | ✓ Fähigkeiten `null`, kein Beleg, kein Bericht, Doku sagt NEIN |
| 8 | Lizenz und Gates unverändert | ✓ `feature-gates.json`, `display-policy.js`, Provider-Profile: 0 Zeilen Diff |

**Prüfpunkt 3 im Detail** — die beobachtete Statusspur einer vollständig
zerfallenden Datenlage:

```
CONNECTING (REALTIME_STREAM)
LIVE       (REALTIME_STREAM)     Strom liefert
DELAYED    (REALTIME_STREAM)     Strom antwortet, liefert nichts Neues
RECONNECTING                     Strom fällt ganz aus
DELAYED    (REALTIME_QUOTE)      Kursabruf übernimmt
RECONNECTING                     auch der fällt aus
INTRADAY   (INTRADAY)
EOD        (EOD)                 letzter belastbarer Stand
```

Bars sichtbar: durchgehend. Chart leer: nie.

**Prüfpunkt 8 im Detail** — die Gegenprobe, dass Technik keine Erlaubnis
erzeugt: alle Fähigkeiten belegt, beide Gates offen, Zielgruppe öffentlich →
jede Datenklasse `BLOCKED_BY_LICENSE`, beste zulässige Klasse `UNAVAILABLE`.

---

## 11. Was nicht getan wurde

Auftragsgemäß:

- kein Deployment, kein GitHub-Pages-Eingriff
- `research.visionuniverse.de` unverändert
- keine öffentlichen Kursdaten veröffentlicht
- kein Cloudflare-Umbau
- kein Tiingo-Abo
- keine Elliott-V1.5-Phase
- kein Merge nach `main`, kein Pull Request
- keine Lizenzannahme, keine Freigabe

---

## 12. Empfehlung

**READY FOR PRIVATE REALTIME TEST**

Die Architektur trägt. Sie wählt die beste tatsächlich verfügbare
Datenklasse, benennt jeden Abstieg, sagt „LIVE" nur unter fünf gleichzeitig
erfüllten Bedingungen und fällt nie still auf erfundene Daten zurück. Alle
fünfzehn Szenarien der Fallback-Matrix sind automatisiert, Desktop und
Mobil sind im echten Browser geprüft, und der Bestand ist unberührt.

Was fehlt, ist genau eine Messung: **läuft `verify-tiingo-realtime.mjs` bei
offener US-Börse mit dem hinterlegten Schlüssel, und was sagt er?**

Danach gibt es drei mögliche Wege, und die Architektur trägt alle drei ohne
Codeänderung:

| Befund | Folge |
|---|---|
| `realtimeQuote: PASSED` | Fähigkeit wird `true`, die Fallback-Engine nimmt den besseren Pfad, `REALTIME_READY` kann gesetzt werden — **die Lizenzfrage bleibt davon unberührt** |
| `realtimeQuote: FAILED` | verzögerte Kurse belegt, `INTRADAY` bleibt die beste Klasse, die Anzeige sagt korrekt „VERZÖGERT" |
| `realtimeQuote: UNKNOWN` | Lauf wiederholen; bis dahin ändert sich nichts |

Eine öffentliche Freigabe folgt aus keinem dieser Wege. Sie verlangt
zusätzlich eine eingetragene Anzeigeerlaubnis mit Grundlage und Prüfdatum —
und die ist eine Lizenzfrage, keine technische.
