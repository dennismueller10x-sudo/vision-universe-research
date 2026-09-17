# V4.1 + ZERO-COST REALTIME — FINAL PRE-MERGE ACCEPTANCE

**Auftrag:** Owner-Entscheidung vom 17.09.2026, „V4.1 + ZERO-COST REALTIME /
FINAL PRODUCT INTEGRATION & PRE-MERGE ACCEPTANCE" (§1–§26).
**Erstellt:** 17.09.2026, US-Sitzung geöffnet.
**Status:** fertig zur Abnahme. **Nicht gemergt. Nicht veröffentlicht.**

Dieser Bericht folgt der Gliederung aus §25: 26 Punkte, in der Reihenfolge
der Vorgabe. Jede Zahl darin ist gemessen; wo etwas nicht gemessen werden
konnte, steht das dort, wo es hingehört, und nicht im Kleingedruckten.

---

## Was aus zwei Dingen eines geworden ist

Vorher waren es zwei getrennte Stände: das **V4.1 Consumer Master Pass**
(Discover, Aktienseite, Farbschema, Navigation, Fundamental Journey) auf dem
Snapshot-Pfad — und **Zero-Cost Realtime V1** (ein Cloudflare Worker mit
einem Durable Object, ausgerollt und smoke-getestet), an dem der
Consumer-Schalter noch auf `false` stand.

Jetzt ist es ein Produkt: die Aktienseite zeigt zuerst den Snapshot, öffnet
dann die Verbindung nach `live.visionuniverse.de`, meldet genau den einen
Titel an, den jemand ansieht, und schreibt den laufenden Chart fort — ohne
Neuladen, ohne leere Fläche dazwischen. Bleibt der Strom aus, übernimmt
derselbe Snapshot, der vorher schon da war.

---

## 1. Finaler Branch

`claude/vision-universe-discover-h93fmv`

Ein Branch, wie in allen Phasen davor. `main` ist unberührt:
`research.visionuniverse.de` liefert weiter den Stand von V4 (Live-Schaltung
15.09.2026). Auf Cloudflare läuft der Realtime-Worker — als schon
abgenommener Infrastruktur-Proof (§24), nicht als Consumer-Freischaltung.

## 2. Finaler Commit

Der letzte Code-Stand, auf dem alle Nachweise dieses Berichts laufen, ist
**`7e3e0ddb1`** („Zwei Gründe für ‚nicht aktuell' brauchen zwei Sätze").
Darauf folgen nur noch der Bericht des Actions-Laufs
(`Realtime-Browser-QA aus Lauf 35262627743`, Messwerte und Aufnahmen) und
dieser Bericht selbst. Die Reihenfolge der Integration steht am Ende
(Abschnitt „Commits dieser Integration").

## 3. `stream.enabled` Status

**`true`** — und zwar an genau einer Stelle:
`quant/config/development-preview.json`, Block `stream`:

| Feld | Wert |
|---|---|
| `enabled` | `true` |
| `url` | `wss://live.visionuniverse.de/live` |
| `freshSeconds` | `90` |
| `maxSymbolsPerClient` | `5` |
| `decidedBy` / `decidedAt` | Owner / 2026-09-17 |

Der Build trägt das als `meta.realtime.stream` in die Auslieferung, mit
`scope: "stockPage"`, `priceType: "REALTIME_REFERENCE"` und
`source: "TIINGO_IEX_LEVEL6"`. Der Client liest nur diesen Block; es gibt
keine zweite Adresse und keinen zweiten Schalter im Code.

## 4. Realtime Architektur

Unverändert die abgenommene Variante C — **keine zweite Architektur** (§2):

```
Tiingo IEX (Stufe 6)
        │  EINE Anbieterverbindung
        ▼
Cloudflare Worker  ──►  EIN Durable Object  vu-live-us
        │                 Referenzzählung, Nachlauf 60 s,
        │                 Zusammenfassung 1 s, Alarm 30 s,
        │                 harte Grenze 50 Titel
        ▼
  Browser (nur Aktienseite)
```

Hundert Zuschauer auf NVDA sind **ein** Anbieterabonnement (§7 der Vorgabe).
Der Titelwechsel läuft im Modus `dynamic` über dieselbe Verbindung —
nachgewiesen am 17.09.2026 um 09:53 New York (AAPL 52/NVDA 0 → nachmelden →
AAPL 55/NVDA 74 → abmelden → AAPL 0/NVDA 65). Kein zweites Durable Object,
kein Sharding, kein Server, kein VPS, kein zweiter Dienst.

Karten und Feed bleiben auf dem Snapshot-Pfad (§8): hundert sichtbare Karten
wären hundert Abonnements. Das ist eine Entscheidung, keine Auslassung.

## 5. Zero-Cost Status

**ZERO_COST_MODE = HARD, geprüft maschinell.**

`node scripts/market/assert-zero-cost-mode.mjs`

```
ZERO_COST_MODE = HARD
  256 ausfuehrbare Dateien durchsucht
  Durable Object SQLite-gestuetzt: ja
  kein usage_model gesetzt:        ja
  Funde:                           0
URTEIL: PASS   PAID_SERVICES_ENABLED = 0
```

Gesucht wird nach dem, was Geld kosten würde: Aufrufe der
Billing-/Subscription-API, `usage_model`-Angaben, das Anlegen
kostenpflichtiger Ressourcen, Plan-Wechsel in Workflows. Die Marke liegt in
`quant/data/market/commercial/zero-cost-mode.json`.

Laufende Zusatzkosten der Realtime-Schicht: **0 €**. Cloudflare Free, ein
Worker, ein Durable Object (SQLite-gestützt, weil der Free-Plan nur diese
Klasse erlaubt), kein KV, kein R2, kein D1, kein Cron.

## 6. Paid Services Status

**PAID_SERVICES_ENABLED = 0.**

Drei Riegel, nicht einer:

1. `assert-zero-cost-mode.mjs` (oben) — 0 Funde im ganzen Repository.
2. `scripts/market/assert-deploy-preconditions.mjs` — läuft als **Gate vor
   jedem** Cloudflare-Deployment; ohne dieses Urteil deployt der Workflow
   nicht.
3. `worker/wrangler.toml` — kein `usage_model`, keine kostenpflichtige
   Bindung; die Migration legt die Klasse als `new_sqlite_classes` an.

Ein automatischer Wechsel Free → Paid ist nicht vorgesehen und nirgends
implementiert (§3). Wäre eine kostenpflichtige Ressource nötig, ist das ein
**STOP mit Owner-Vorlage**, kein Vorgang.

## 7. Budget Guard

`quant/engines/realtime/free-budget.js`, Schwellen unverändert:

| Schwelle | Verhalten |
|---|---|
| **70 %** | WARNING — Aufnahme neuer Titel wird vorsichtiger, Betrieb läuft |
| **85 %** | **PROTECT — Realtime endet kontrolliert**, Client bekommt `fallback: "snapshot"` |
| 100 % | EXHAUSTED — dasselbe, nur später |

PROTECT ist das Ende, nicht die Vorstufe zum Ende: das Objekt fährt den
Anbieter-Link herunter, notiert `realtimeDeaktiviert` und sagt jedem
verbundenen Browser, dass der Kurs nicht mehr mitläuft und die Seite weiter
den Stand mit Uhrzeit zeigt. Bewiesen in beiden Hälften:

* `worker/tests/vu-live.test.mjs` VL-35 — der ganze Weg 0 → 70 → 85 % mit
  Abschaltung und Nachricht an den Browser.
* `discover/tests/live-stream.test.mjs` — `{op:"budget", verdict:"PROTECT"}`
  schließt den Strom auch clientseitig, Grund `budgetProtect`.
* `quant/tests/free-budget.test.mjs` FB-17 — die Schwellen hängen am
  **gezählten** Verbrauch, nicht an der Vorausschau. Der Test erzwingt das
  mit einer absichtlich winzigen Annahme.

**Die Annahme, die diese Woche korrigiert wurde** (und der Grund, warum sie
hier steht): die Vorausschau rechnete mit 1,7 Ereignissen je Sekunde und
Titel — der Spitze *eines* Titels. Gemessen wurde für einen Korb aus 50
Titeln 0,34. Die Folge war sichtbar: die Schranke lehnte den 40. von 50
Titeln ab, während der tatsächliche Verbrauch bei 0,1 % des Kontingents lag.
Gerechnet wird jetzt mit 0,85 (Messung × 2,5). Beide Messwerte stehen als
Konstanten im Code.

**Die Annahme, die offen bleibt** (Owner-Auflage, ausdrücklich dokumentiert):
die Cloudflare-Freibeträge gelten **je Konto**, nicht je Worker. Der zweite,
bereits bestehende Worker des Kontos wird in V1 über die verbleibende
Sicherheitsreserve berücksichtigt und **nicht** gemessen — dafür fehlt
`Account Analytics:Read`, und der Owner hat entschieden, diese Berechtigung
nicht anzufordern. Das Risiko ist damit benannt: verbraucht der andere Worker
unerwartet viel, greift der Wächter von `vu-live` später als 85 % des
Kontingents. Die Reserve ist dafür bemessen; die Annahme steht als
`RESERVE_RATIONALE` in jedem `snapshot()` des Wächters.

## 8. E2E-Latenzen

Gemessen im echten Browser, unter dem echten Ursprung
`https://research.visionuniverse.de`, gegen den ausgerollten Worker — letzter
Lauf vom 17.09.2026, **15:05 New York**, reguläre Sitzung, je Titel 60
Sekunden beobachtet. `quant/data/market/commercial/vu-realtime-browser-qa.json`

| Titel | Ticks | erster Tick | Anbieter → Cloudflare | Cloudflare → Client | **E2E** | max | Chart neu gezeichnet |
|---|---|---|---|---|---|---|---|
| AAPL | 34 | 499 ms | 26 ms | 554 ms | **580 ms** | 1 159 ms | 32× |
| NVDA | 37 | 249 ms | 26 ms | 629 ms | **655 ms** | 1 083 ms | 26× |
| MSFT | 17 | 249 ms | 31 ms | 912 ms | **943 ms** | 1 138 ms | 15× |
| VLO | 3 | 38 999 ms | 24 ms | 191 ms | **215 ms** | 282 ms | 3× |
| PANW | 5 | 2 499 ms | 22 ms | 730 ms | **751 ms** | 1 071 ms | 5× |

Zwei Läufe davor (14:33 und 14:50 New York) liegen in derselben Größenordnung:
AAPL 635 / 664 ms, NVDA 642 / 592 ms, MSFT 876 / 869 ms. Die Zahlen schwanken
mit dem Zusammenfassungsfenster, nicht mit der Last.

Die Kette im Einzelnen: **Anbieterzeitstempel** (Tiingo, im Tick enthalten)
→ **Cloudflare-Empfang** (im Objekt gesetzt und als achtes Feld an den
Browser weitergegeben) → **VU-Zustand** → **Client-Empfang** → **Chart
gezeichnet** (gemessen an der neu geschriebenen Pfadgeometrie, 20–30
Neuzeichnungen je Titel im Fenster).

Der Weg vom Anbieter zu Cloudflare liegt bei **22–31 ms** (über alle drei
Läufe 15–42 ms). Der Rest ist
größtenteils das **Zusammenfassungsfenster von einer Sekunde** im Objekt:
es macht aus vielen Einzelereignissen eine Nachricht und ist der Grund, dass
fünfzig Titel 0,1 % des Kontingents verbrauchen. Diese Wahl ist der Preis für
das Null-Euro-Versprechen, und sie ist sichtbar: der Kurs läuft mit, er
zuckt nicht.

**Illiquide Titel sind keine Systemlatenz** (§19 ausdrücklich): VLO brauchte in
diesem Lauf 39 Sekunden bis zum ersten Kurs und lieferte in der Minute drei
Stück — nicht weil das System langsam ist, sondern weil an diesem Teilmarkt in
diesen Sekunden nichts gehandelt wurde. Dass VLO dabei die *niedrigste* E2E-Zeit
hat (215 ms), zeigt es von der anderen Seite: wer selten handelt, findet das
Zusammenfassungsfenster meistens leer vor. Die Latenzen oben zählen nur echte
Ereignisse; Warten auf den Markt zählt nicht mit.

## 9. Reconnect/Fallback

Die Kette (§3): **Realtime → Snapshot → letzte abgeschlossene Sitzung →
Historie.** Kein Glied ist synthetisch, keines erfindet einen Kurs.

Im Browser nachgewiesen, drei Phasen:

| Phase | Beobachtung |
|---|---|
| Abriss (Verbindung unter den Füßen weggezogen) | `OPEN` → `RECONNECTING`, `connected: false`, **Chart bleibt stehen** |
| Wiederanlauf (von selbst, ohne Zutun) | `RECONNECTING` → `OPEN`, `opens: 2`, `retries: 1`, `errors: 0` |
| Widerruf (Wiederanlauf verhindert, Frischefenster 90 s abgelaufen) | „Markt geöffnet · Live" → **„Heute · Stand 13:20 · nicht aktuell"**; Chart bleibt gezeichnet, Kopf zeigt den letzten bekannten Kurs (335,46 $) |

Die dritte Phase ist in diesem Durchgang dazugekommen, weil die ersten zwei
die Zusage nicht vollständig belegten. Direkt nach dem Abriss steht dort mit
Recht noch „Markt geöffnet · Live" — der letzte Kurs ist eine
Drittelsekunde alt. Die Zusage aus §4 ist eine andere: älter als 90 Sekunden
darf nicht mehr „Live" heißen. Also wird der Wiederanlauf jetzt verhindert
(die WebSocket-Fabrik liefert einen Socket, der nie aufgeht — ein Funkloch,
das bleibt), das Fenster abgewartet und beides geprüft: Widerruf des
Etiketts **und** Übernahme durch den Snapshot.

Zusätzlich: PROTECT (§7) endet im selben Bild — der Strom hört auf, der
Snapshot zeigt weiter den Stand mit Uhrzeit.

## 10. Stock Chart

Der große Chart ist unverändert der aus V4.1 — jetzt mit laufendem Kurs.

| Eigenschaft | Wert |
|---|---|
| Höhe mobil | `max(300, min(52 % der Fensterhöhe, 480))` px |
| Höhe Schreibtisch | 440 px |
| Zeiträume | 1T · 1W · 1M · 6M · 1J · 5J · Max |
| Berührung | Finger/Zeiger zeigt Kurs, Änderung und Uhrzeit im Kopf; senkrechtes Wischen bleibt Blättern |
| Referenzlinie | Vortagesschluss, gestrichelt, mit Zahl |
| Zeitachse | ganze Sitzung 09:30–16:00 New York; eine laufende Sitzung füllt sie nur so weit, wie echte Punkte reichen |

Start der Seite (§5): der Snapshot ist sofort da, dann kommt der Strom dazu
und schreibt den laufenden Punkt fort. **Kein leerer Chart** — dafür gibt es
einen eigenen Riegel im Hub: eine Statusmeldung, die vor dem Snapshot
eintrifft, wird nicht gemeldet, weil sie die Fläche leer zeichnen würde.

**Ein Befund aus diesem Durchgang, gefunden am Bild und nicht am Test:** auf
der Aktienseite standen zwei Kurse — oben im Kopf 212,17 $ „+0,57 % zum
Vortag", darunter im Chart 219,46 $ „+3,44 % heute". Beide Zahlen waren
richtig; die eine war der letzte ausgelieferte Tagesschluss, die andere der
laufende Tag. Fünf Prozent Unterschied sind keine Rundung. Jetzt gilt ein
frischer Realtime-Kurs auch im Kopf, gegen dieselbe Bezugsgröße gerechnet.
Die Browser-QA prüft das seither eigens („Kopf und Chart zeigen denselben
Kurs", 1 % Toleranz) — im aktuellen Lauf ist die Abweichung bei allen fünf
Titeln **0,0000**.

Zweiter Befund, kosmetisch, ebenfalls am Bild: auf dem Telefon stieß die
Stundenmarke „15:00" an die Randmarke „16:00". Der Mindestabstand war 40 px,
die Marken sind bei 11,5 px Schrift rund 32 px breit. Jetzt 54 px = halbe
Marke + ganze Randmarke + Luft. Auf dem Schreibtisch stehen weiter alle
Stundenmarken.

## 11. Chart Farben

Die Regel aus §10 der Vorgabe, an einer Stelle im Code und für alle
Kurscharts gleich:

* Zeitraum **positiv → grün**, **negativ → rot**, **neutral → Systemton**.
* Gilt für Aktienseite, Discover-Karten, Eingangsfläche und Feed.
* Die **Farbwelten der Sammlungen** wirken nur auf Hintergrund, Atmosphäre,
  Schimmer, Beschriftungen, Plaketten und fundamentale Bilder — nie auf die
  Kurslinie.

Nachgewiesen an echten Zahlen, nicht an Beispieldaten: VLO stand an diesem
Tag im Plus (grün), MSFT im Minus (rot) — beide als Aufnahme in hell und
dunkel (§23).

## 12. Fundamental Journey

Unverändert die Bühne aus V4.1, weit oben und visuell dominant: „Damals vs.
heute" mit umschaltbaren Kennzahlen (Umsatz, Gewinn, Marge, Cashflow), großem
Fundamentalchart und Erzähltext. Nichts davon wurde für Realtime angetastet;
die Realtime-Änderungen beschränken sich auf den Kursteil der Seite.
Nachweise: Browser-QA V4.1 (Journey vorhanden, Kennzahlwechsel funktioniert),
Aufnahmen `mobil-hell-04-fundamental-journey.png` und
`mobil-dunkel-04-fundamental-journey.png`.

## 13. Metric Clusters

„Das Unternehmen in Zahlen" bleibt in vier Clustern — Wachstum,
Profitabilität, Cashflow, Bilanz — mit progressiver Offenlegung. **Keine
Rückkehr zu langen Kennzahlenlisten** (§13 der Vorgabe). Aufnahmen
`mobil-hell-05-metric-cluster.png` / `mobil-dunkel-05-metric-cluster.png`.

## 14. Bewertung

Consumer-first, mit Plausibilitätsprüfung: die Bewertung wird in Sätzen
erklärt, nicht in Multiples aufgelistet; ein KGV von 798 wird als solches
kenntlich gemacht und nicht als Aussage verkauft. Aufnahmen
`mobil-hell-06-bewertung.png` / `mobil-dunkel-06-bewertung.png`.

## 15. Light/Dark/System

Vollständig erhalten (§15): Standard **System**, Wahl **Hell** und **Dunkel**
möglich, Entscheidung überlebt das Neuladen (`localStorage`,
`vu-discover-theme-v1`). Die gemeinsame Vision-Universe-Navigation folgt dem
Schema der Seite — im hellen Schema ist eine dunkle Leiste der Fehler, nicht
das Ziel.

Geprüft in der Browser-QA V4.1 (Wahl wird gemerkt, überlebt das Neuladen,
zurück zu System; Charts, Leiste und Kopf funktionieren auch auf Weiß; SYSTEM
folgt einem hellen Gerät) und in der Auslieferungsprüfung („Navigation folgt
dem Farbschema der Seite"). Finale Aufnahmen liegen in **beiden** Schemata
vor (§23).

## 16. Floating Navigation

Schwebende Navigation mit genau zwei Zielen — **Suchen** und **Entdecken** —
ohne Smartphone-Symbol, mit Beachtung der sicheren Bereiche (`safe-area`).
Auf dem Schreibtisch dieselben zwei Einträge in der Kopfzeile, leicht, nicht
als Balken. Aufnahmen `mobil-hell-07-schwebende-navigation.png` /
`mobil-dunkel-07-…`.

## 17. Search

Overlay mit der Frage „Welche Aktie suchst du?", Treffer über Name und
Symbol, Tastatur und Finger. Die Suchdaten liegen als eigene Ausgabe
(825 KB) neben der Startseite und werden erst beim Öffnen geladen.
Nachgewiesen in der Browser-QA V4.1.

## 18. Discovery Feed

Der Bestand aus V4.1, unverändert übernommen (§17 der Vorgabe):

| Eigenschaft | Wert |
|---|---|
| Titel im Feed | **400** |
| Sammlungen, aus denen er schöpft | **25**, reihum |
| Stückgröße | **12** Karten je Nachladung |
| Regel | ein Titel einmal; höchstens zwei Titel eines Sektors in Folge; bekannte und weniger bekannte Namen im Wechsel |
| Verfahren | deterministisch, ohne Zufall, **ohne Modell** |

Keine sichtbare Grenze nach zehn Titeln, Nachladen in Stücken erhalten, keine
neue KI-Personalisierung (§17).

## 19. Development Preview Scan

`node scripts/discover/assert-consumer-clean.mjs`

```
7 ausgelieferte Seiten, 31 Oberflaechenmodule
§18 'Development Preview' in Discover: nirgends
§18 dieselbe Plakette ausserhalb:      2 (assets/site-navigation.js:53,55)
§14 Anbieternamen im Consumer-Text: keiner
URTEIL: PASS
```

In der Consumer-Erfahrung von Discover kommt „Development Preview"
**nirgends** vor. Außerhalb von Discover trägt die gemeinsame Navigation die
Plakette weiter — sie erscheint damit auf den rund vierzig Quant- und
Research-Seiten, die diese Navigation einbinden. Das ist als **Punkt 26
(offene Owner-Entscheidung)** ausgewiesen, nicht stillschweigend geändert:
Discover ist die einzige Fläche, für die der Owner die Entfernung entschieden
hat.

## 20. Quellen Scan

Dieselbe Prüfung, zweiter Teil: **kein Anbietername** im Consumer-Text — nicht
auf der Startseite, nicht auf der Aktienseite, nicht im Feed. Herkunft,
Aktualisierung, Lizenz und Methodik stehen ausschließlich auf **Daten &
Quellen** (`discover/quellen.html`, `discover/ui/daten.js`). Die Frische darf
sichtbar bleiben (§14) — „Stand 13:25", „nicht aktuell", „Markt geöffnet ·
Live" sind Zustandsangaben, keine Anbieterwerbung.

Auf der Aktienseite steht zum laufenden Kurs der Satz: „der Kurs läuft mit;
die letzte Zahl ist eine Kursreferenz aus einem Teilmarkt, kein Abschluss."
Kein „Last Trade", kein „Official Last", kein „Last Sale" (§4).

**Ein Befund aus der Widerrufs-Aufnahme dieses Durchgangs.** Über dem Chart
stand richtig „Heute · Stand 13:20 · nicht aktuell" — und die Fußnote
darunter behauptete, dieser Stand sei *nicht der letzte Handelstag*, und
nannte im selben Satz den heutigen Tag als den erwarteten. Das Etikett war
richtig, die Fußnote nicht. Der Grund: „nicht aktuell" hat zwei Gesichter —
eine Reihe aus einer älteren Sitzung, oder eine Reihe vom laufenden Tag, bei
der der Datenlauf stehen geblieben ist. Beide teilten sich einen Satz. Jetzt
entscheidet der Grund: „der Verlauf ist vom laufenden Handelstag, aber stehen
geblieben (Stand 13:20)". Zwei Nachweise dafür: ein Quelltest in
`discover/tests/klartext.test.mjs` und eine Prüfung am laufenden Produkt
(„die Fußnote widerspricht dem Etikett nicht") genau an der Stelle, an der
der Fehler auffiel.

## 21. Performance

Gemessen im Browser gegen die ausgelieferten Dateien (390 × 844 und
1440 × 900):

| Fläche | DOMContentLoaded | First Contentful Paint | Netz ruhig | Anfragen |
|---|---|---|---|---|
| Discover mobil | 436 ms | 460 ms | 1 186 ms | 64 |
| Aktienseite mobil | 424 ms | 448 ms | 1 242 ms | 70 |
| Discover Schreibtisch | 446 ms | 476 ms | 1 243 ms | 75 |
| Aktienseite Schreibtisch | 375 ms | 408 ms | 1 217 ms | 82 |

Erstes Startseiten-Stück: **302 KB** (Grenze 320 KB, Test in
`discover/tests/v3.test.mjs`). Auslieferungsprüfung: 224 eigene Anfragen,
**0 mit Fehlerstatus**, kein horizontaler Überlauf auf 390 px, 404 verhält
sich richtig.

Ehrlich dazu: diese Zahlen sind ohne Komprimierung gemessen — der lokale
Prüfserver liefert nichts gezippt aus, GitHub Pages tut das. Die übertragene
Menge in Produktion ist also kleiner, die Zeiten eher besser als hier.

Die Realtime-Schicht kostet auf dem Client fast nichts: eine WebSocket-
Verbindung je Fenster, ein Titel angemeldet, eine Nachricht je Sekunde.

## 22. Tests

Alle bestehenden Suiten laufen, keine wurde abgeschwächt (§22).

| Suite | Ergebnis |
|---|---|
| `quant/tests/*.test.mjs` | **967 / 967** |
| `discover/tests/*.test.mjs` | **223 / 223** |
| `worker/tests/*.test.mjs` | **35 / 35** |
| Python (`scripts/quant/tests`) | **471 / 471** |
| Realtime-Sammellauf (`run-realtime-tests.mjs`) | **224 / 224** |
| Verifier Discover (Daten ↔ Engines) | **63 723** Nachrechnungen, keine Abweichung |
| Verifier Quant | alle Prüfungen bestanden |
| Verifier Technical | Daten ↔ Engines stimmen überein |

Der Realtime-Sammellauf im Einzelnen: Subscription Manager 21, Budget 17,
Worker 35, Client-Strom 16, Live-Hub 9, Realtime-Engine 34, -Integration 21,
-Sitzungen 29, -Capability 25, -Matrix 15, Tiingo-Verdrahtung 2.

Neu in diesem Durchgang, als Riegel gegen die Fehler, die wirklich passiert
sind: **VL-33** (Cloudflare nimmt für ein Upgrade kein `wss://` entgegen —
der Worker lief und lieferte nichts), **VL-34** (Anbieterzeitstempel wird
durchgereicht), **VL-35** (der ganze Weg 70 → 85 % mit Abschaltung),
**FB-16/FB-17** (Reserve-Begründung; Schwellen hängen am gezählten
Verbrauch), **LS-15/LS-16** (Latenzkette im Client).

## 23. Browser QA

| Suite | Ergebnis | Umgebung |
|---|---|---|
| Browser-QA V4 (Startseite, Wischgeste, Ranglisten, Aktienseite) | **63 / 63** | lokal |
| Browser-QA V3 (Netflix-Rhythmus, Themen, Einzeln entdecken) | **39 / 39** | lokal |
| Browser-QA Live (Tagesverlauf, Frische, Zeiträume) | **33 / 33** | lokal |
| Browser-QA V4.1 (Farbregel, Farbschema, Navigation, Suche, Feed, Quellen) | **30 / 30** | lokal |
| Auslieferungsprüfung (`delivery-check`) | **0 Fehlschläge** | lokal |
| **Browser-QA Realtime (§19/§20)** | **13 / 13** | GitHub Actions, echter Strom |

Zwei Anmerkungen, die dazugehören:

**Die Ausnahme in den lokalen Suiten.** Seit der Strom in der Auslieferung
steht, versucht jede Seite in dieser Entwicklungsumgebung eine Verbindung
nach Cloudflare — und scheitert, weil der Egress-Filter den Tunnel ablehnt.
Ein fehlgeschlagener WebSocket-Aufbau schreibt eine Konsolenzeile, die kein
Skript verhindern kann; der Hub selbst behandelt den Fehler korrekt und fällt
auf den Snapshot zurück. „Keine Konsolenfehler" schlug damit an einer
Eigenschaft der Umgebung fehl, nicht an einer des Produkts. Die Ausnahme ist
eng gefasst: **genau die Adresse aus der Auslieferung** und **nur** Meldungen
über den Verbindungsaufbau; eine falsche Adresse, ein Fehler im Hub oder eine
Ausnahme im Chart fällt weiterhin auf. Gezählt wird trotzdem, und die Zahl
steht am Ende jedes Protokolls (5–20 Zeilen je Lauf). Der Nachweis, dass der
Strom läuft, gehört ohnehin in die Realtime-Suite in Actions — **dort gilt
„keine Konsolenfehler" ohne jede Ausnahme, und sie ist grün.**

**Eine veraltete Prüfung, korrigiert statt abgeschaltet.** Die
Auslieferungsprüfung verlangte `theme="dark"` an der gemeinsamen Navigation —
richtig, solange Discover immer dunkel war. Seit V4.1 entscheidet der Nutzer.
Geprüft wird jetzt die **Gleichheit** von Seitenschema und Navigationsschema;
das ist strenger als vorher, nicht schwächer.

Die Realtime-Suite prüft, unter dem echten Ursprung und gegen den
ausgerollten Worker: verbindet · Kurse ohne Neuladen · Chart zeichnet neu ·
Kopf und Chart derselbe Kurs · keine Konsolenfehler · Live-Etikett bei
frischen Kursen · kein „Live" ohne Kurse · nach Abriss nicht verbunden ·
Chart bleibt · Strom baut wieder auf · **Etikett wird widerrufen** ·
**Snapshot übernimmt** · **Fußnote widerspricht dem Etikett nicht**.
Alle dreizehn grün, Lauf 35262627743 vom 17.09.2026, 15:05 New York.

## 24. Screenshots

32 Aufnahmen in `docs/screenshots/discover-v41-realtime/`, alle aus diesem
Stand, mobil 390 × 844 und Schreibtisch 1440 × 900:

| Gruppe | Aufnahmen |
|---|---|
| Mobil **hell** | Discover erster Bildschirm · großer Chart · **Live AAPL** · **Live NVDA** · Fundamental Journey · Metric Cluster · Bewertung · schwebende Navigation · Entdecken-Feed · negativ rot (MSFT) · positiv grün (VLO) · Chancen & Risiken · Analyse hinter der Grenze |
| Mobil **dunkel** | dieselben dreizehn Flächen |
| Schreibtisch | Discover · Aktienseite, hell und dunkel |
| Rückfall | `realtime-fallback.png` (Abriss), `realtime-widerruf.png` (Widerruf nach dem Frischefenster) |

Die Live-Aufnahmen entstehen in GitHub Actions, weil nur dort der Weg zu
Cloudflare offen ist, und sie scrollen zum Chart: eine Aufnahme, die den
laufenden Kurs zeigen soll, sollte ihn auch zeigen.

## 25. Secrets Scan

`node scripts/market/assert-no-secrets.mjs --all --record`

```
Schluesselpruefung: 25 290 Datei(en) unter quant/data/market, worker,
  discover/data, discover/ui, discover/engines, quant/config, providers,
  .github/workflows, scripts/market
Umgebungswerte im Abgleich: 0
Keine Zugangsdaten gefunden.
```

Zwei Musterlisten (Datendateien vs. Code), Gegenprobe mit den tatsächlichen
Umgebungswerten, Marke in
`quant/data/market/commercial/secret-scan-passed.json`. Zusätzlich prüft der
Realtime-Workflow nach jedem Lauf, dass kein Schlüssel im Bericht steht.

`TIINGO_API_KEY` liegt als GitHub-Secret vor und wurde über stdin als
Cloudflare-Worker-Secret gesetzt — **kein Wert wurde ausgegeben, geloggt oder
rotiert**. `CLOUDFLARE_API_TOKEN` war schon vorhanden, unter genau dem Namen,
den wrangler liest; die Account-ID stammt aus dem bestehenden
`VU_HISTORY_S3_ENDPOINT` der R2-Anbindung. **Es wurde kein neues Credential
erzeugt.**

## 26. Verbleibende echte Owner Decisions

Vier, und keine davon habe ich stillschweigend entschieden:

**26.1 — „Development Preview" außerhalb von Discover.**
Die Plakette ist auf Discover weg (Owner-Entscheidung). Die gemeinsame
Navigation trägt sie weiter, also erscheint sie auf den rund vierzig anderen
Quant- und Research-Seiten. Zwei Möglichkeiten: überall entfernen (dann sind
auch Seiten ohne Consumer-Abnahme ohne Plakette) oder so lassen (dann ist
Discover die Ausnahme). **Ich habe nichts geändert.**

**26.2 — Der zweite Worker im Konto.**
Die Freibeträge gelten je Konto. Der Wächter von `vu-live` rechnet mit einer
Sicherheitsreserve statt mit einer Messung, weil `Account Analytics:Read`
nicht angefordert werden soll (Owner-Entscheidung). Wenn diese Reserve
irgendwann zu knapp wird, ist die Berechtigung der nächste Schritt — oder ein
kleineres Budget für `vu-live`.

**26.3 — Merge und Veröffentlichung.**
V4.1 + Realtime liegen auf dem Branch. `main` und
`research.visionuniverse.de` sind unberührt (§24). Der Merge ist eine
Owner-Entscheidung, und mit ihm die Frage, ob `stream.enabled = true` in
derselben Bewegung öffentlich wird oder erst in einem zweiten Schritt.

**26.4 — Das Zusammenfassungsfenster von einer Sekunde.**
Es kostet rund eine halbe Sekunde der gemessenen E2E-Zeit und ist der Grund,
warum fünfzig Titel 0,1 % des Kontingents verbrauchen. Ein kürzeres Fenster
wäre schneller und teurer. Solange „0 €" gilt, bleibt es bei einer Sekunde.

---

## Stop Condition (§26)

| Kriterium | Ergebnis |
|---|---|
| `REALTIME_STOCK_PAGE` | **PASS** (13/13 im echten Browser, echte Kurse, fünf Titel) |
| `ZERO_COST_MODE` | **PASS** (HARD, 256 Dateien, 0 Funde) |
| `PAID_SERVICES_ENABLED` | **0** |
| `REALTIME_FALLBACK` | **PASS** (Abriss, Wiederanlauf, Widerruf des Etiketts, Snapshot-Übernahme, PROTECT) |
| `V4_1_CONSUMER_UX` | **PASS** (63 + 39 + 33 + 30 Prüfpunkte, 0 Fehlschläge) |
| `FUNDAMENTAL_JOURNEY` | **PASS** |
| `LIGHT_MODE` | **PASS** |
| `DARK_MODE` | **PASS** |
| `MOBILE_QA` | **PASS** (390 × 844, kein Überlauf, keine eigenen 4xx) |
| `SECRETS_SCAN` | **PASS** (25 290 Dateien) |
| `CRITICAL_BLOCKERS` | **0** |

**Nicht gemergt. `research.visionuniverse.de` nicht aktualisiert. Owner-Abnahme
abgewartet.**

---

## Commits dieser Integration

| Commit | Was |
|---|---|
| `3f502ab0c`, `9ea81f9f8` | V4.1 Consumer Master Pass (Daten, Code) |
| Zero-Cost-Realtime-Reihe | Manager, Budgetwächter, Worker + Durable Object, Client-Strom, Tests |
| `[cf-deploy]`-Lauf | Deployment auf Cloudflare Free, `live.visionuniverse.de` angelegt |
| `d9ed8720f` | ein Kurs auf einem Bildschirm (Kopf folgt dem laufenden Kurs) |
| `9b06aebe1` | Stundenmarken der Zeitachse kollidieren nicht mehr |
| `84a263777` | Widerruf des Live-Etiketts im Browser bewiesen; enge Strom-Ausnahme in den lokalen Suiten |
| `7e3e0ddb1` | zwei Gründe für „nicht aktuell" bekommen zwei Sätze; Navigationsprüfung folgt dem Farbschema |

Dazu die Berichtscommits der Actions-Läufe (`Realtime-Browser-QA aus Lauf …`),
die Aufnahmen und Messwerte in das Repository zurückschreiben.

**Weiterführend:** `docs/VU_ZERO_COST_REALTIME_V1.md` (Architektur, Messungen,
Production-Proof), `docs/VU_DISCOVER_V4_1_CONSUMER_MASTER.md` (Consumer-Pass),
`docs/VU_BUILD_STATUS.md` (Hauptbuch, Zeile 17).
