# Discover „Im Blick“: Ereignisse vor Dauerstärke

Stand 12.10.2026 · Engine `discover/engines/im-blick.js` (discover-im-blick-1.0.0) · Methodik discover-v4.1.0 (`discover/methodology/discover-v1.json`, Abschnitt `imBlick`, Reihe `im-blick`).

## Befund

Die Eingangsfläche „Im Blick“ wählte bis discover-v4.0.0 nach dem Leadership-Perzentil über 12 Monate. Dazu kamen feste Zuschläge für Kurschart (+12), bekannten Namen (+10 bzw. +5) und Firmennamen (+6); ein neues Jahreshoch zählte nur +4.

Das Perzentil einer Aktie, die sich in zwölf Monaten verdoppelt hat, steht wochenlang auf 100. Valero (VLO) stand deshalb an allen 17 nachgespielten Sitzungen vom 11.09. bis 09.10.2026 in der Auswahl, meist auf Platz 1. Das galt auch an Tagen mit Kursverlust.

Zusätzlich fielen 13 von 19 geplanten Nachtläufen aus (siehe PR „Datenpipeline“). An diesen Tagen änderte sich gar nichts.

## Neue Logik

Gesamtwert (0–100) = 0,70 × Ereigniswert + 0,30 × Leadership-Perzentil − Abzug + Gleichstandsbrecher.

| Ereignis (Summe gekappt auf 100) | Punkte | Bedingung |
|---|---|---|
| Neues 52-Wochen-**Schlusshoch** | 30 | Schluss über jedem Schluss der vorherigen 251 Sitzungen (≥ 200 vorhanden), aus der veröffentlichten Tagesreihe |
| 52-Wochen-Hoch nur im Tagesverlauf | 12 | Tageshoch erreicht das Jahreshoch, Schluss darunter |
| Bestätigter Ausbruch | 20 | Volumen ≥ 2× Ø 20 Tage, über SMA20 und SMA50, ≤ 10 % unter dem Hoch |
| Ungewöhnliches Volumen | 0–15 | 1,5×–4× Ø 20 Tage; nur an einem Tag ohne Kursverlust im intakten Trend |
| Tagesbewegung | 0–10 | 1–3 σ der eigenen 20-Tage-Schwankung; nur aufwärts, nur über SMA50/SMA200; über 3 σ keine weiteren Punkte |
| Kurzfristige relative Stärke | 0–10 | Perzentil RS 1 Monat 75–95 |
| Beschleunigung | 0–10 | Rendite 1M − 3M/3 von 0 bis 15 Prozentpunkten |
| Neu unter den Starken | 0–5 | RS-1M-Perzentil ≥ 90 bei Leadership < 80 |

Die Bestandteile im Einzelnen:

- **Führerschaft:** Das Leadership-Perzentil (12 Monate) bleibt als ergänzender Faktor mit 30 % erhalten.
- **Abzug ohne neue Ereignisse:** Gilt nur, wenn es heute kein frisches Ereignis gibt. Frisch ist ein Schlusshoch, ein Ausbruch, Volumen ≥ 2× bei einem Aufwärtstag oder eine Bewegung ≥ 2 σ im Trend.
  - Der Abzug beträgt 4 Punkte je Sitzung seit dem letzten Ereignis, höchstens 20.
  - Das Ereignisalter wird aus der Tagesreihe bis zum Stichtag berechnet. Was früher angezeigt wurde, spielt keine Rolle.
  - Es gibt keine Rotation und keine Höchstverweildauer: Wer jeden Tag ein neues Hoch macht, bleibt.
- **Statische Zuschläge:**
  - Kurschart und Firmenname sind keine Zuschläge mehr, sondern Voraussetzung für die Darstellung.
  - Bekanntheit dient nur noch als Gleichstandsbrecher (höchstens 2 Punkte).
- **Zulassung:**
  - Nur Titel, die als „stärkste“ qualifiziert sind: ≥ 250 Handelstage, Kurs > 5 $, Ø-Dollarumsatz ≥ 5 Mio. $, Score-Abdeckung ≥ 0,8.
  - Nur Unternehmen. SPACs, Trusts und Fonds sind ausgeschlossen. Der Wertpapierstamm führt 167 Fonds/ETFs als EQUITY_COMMON; sie werden über den Namen erkannt. Das ist an der Quelle zu beheben.
- **Auswahl:**
  - Bis zu 5 Titel, höchstens 2 je Sektor.
  - Je bereits gewähltem Titel desselben Signalprofils gibt es 6 Punkte Abschlag. Die Profile sind Jahreshoch, Ausbruch, Bewegung, Stärke und Führerschaft.
  - Unter dem Mindestwert 40 wird nicht aufgefüllt.
- **Reihe „Heute im Blick“:** Die Reihe `im-blick` (30 Titel, ab Wert 20) ist nach demselben Wert sortiert. Sie öffnet sich über „Alle Ereignisse →“ und ist die erste Quelle des Feeds „Einzeln entdecken“.
- **Transparenz:** Jede Karte trägt `imBlick` mit Wert, Bestandteilen und bis zu drei belegten Gründen. Die Ranglisten „Die stärksten Aktien“ und die Index-Top-10 bleiben bewusst Leadership-Ranglisten.

## Replay (alt gegen neu)

Nachgespielt sind die Faktorstände, die tatsächlich veröffentlicht waren (`factors-FULL_UNIVERSE.json`, je Sitzung der letzte Marktdaten-Commit). Je Sitzung gehen nur Daten bis zum Schluss dieser Sitzung ein. Vorwärtsrenditen dienen ausschließlich der Auswertung.

Die Nachbildung der alten Regel trifft die damals veröffentlichte Auswahl zu 85 von 85 Titeln. Werkzeug: `node scripts/discover/replay-im-blick.mjs --snapshots <dir> --out <json> --md <md>`.

| Kennzahl | alt | neu |
|---|---|---|
| Sitzungen | 17 | 17 |
| Wiederholungsquote (Titel schon am Vortag in der Auswahl) | 63,7 % | 33,3 % |
| Mittlere Ueberlappung Tag zu Tag (Jaccard) | 48,4 % | 21,8 % |
| Verschiedene Titel insgesamt | 29 | 45 |
| Wechsel auf Platz 1 | 6 von 16 | 13 von 16 |
| Laengste Serie in Folge | 17 (VLO) | 7 (AMD) |
| Anteil mit frischem Ereignis am Tag | 55,3 % | 89,0 % |
| Anteil Schlusskurs am 52W-Hoch | 50,6 % | 76,7 % |
| Mittlerer Ereigniswert (0-100) | 36,8 | 57,0 |
| Mittlere Tagesrendite der Auswahl | 4,11 % | 8,86 % |
| Anteil mit Kursverlust am Tag | 34,1 % | 11,0 % |
| Mittleres Volumen (x Ø 20 Tage) | 1,60 | 2,71 |
| Folgetag ggue. Median (nur Auswertung) | 0,85 % | 0,38 % |
| 5 Sitzungen ggue. Median (nur Auswertung) | 0,59 % | 1,18 % |

Haeufigste Titel alt: VLO 17x, MRK 13x, AMD 12x, PSX 6x, RVTY 6x

Haeufigste Titel neu: AMD 10x, VLO 8x, TMO 4x, ABBV 3x, COP 2x

Profile neu: breakout 17, highs 48, momentum 7, leadership 1

Einordnung:

- **Aktualität:** Platz 1 wechselt an 13 statt 6 von 16 Tagen. 89 % statt 55 % der Titel hatten am Tag selbst ein frisches Ereignis, nur 11 % statt 34 % einen Kursverlust.
- **Bleibende Titel:** AMD und VLO erscheinen weiterhin oft. Sie machten in dieser Phase tatsächlich laufend neue Schlusshochs. Das ist gewollt.
- **Vorwärtsrenditen:**
  - Es sind nur 17 Sitzungen mit etwa 75 Auswahlen. Ein Unterschied von unter etwa 1 Prozentpunkt liegt im Rauschen. Discover gibt keine Empfehlung.
  - In der Breite aller 43.889 zulässigen Titeltage liefen reine Tagesspitzen (≥ 3 σ) und extreme Kurzfrist-RS danach im Mittel unter den Median. Deshalb ist die Tagesbewegung gedeckelt und an den Trend gebunden; Schlusshoch und Ausbruch tragen.
- **Feld `closeAtHigh52w` der Faktorzeile:** Es vergleicht den Schluss mit dem höchsten *Tageshoch* und traf an 9 von 43.889 Titeltagen zu. Als Ereignis war es unbrauchbar und wurde durch das Schlusshoch aus der Tagesreihe ersetzt.

## Je Sitzung

| Sitzung | alt | neu |
|---|---|---|
| 2026-09-11 | VLO, PSX, HPQ, MATX, MRK | ACVA, TEN, VLO, CVX |
| 2026-09-14 | VLO, MATX, APA, MRK, PSX | ECO, BWIN, VLO°, COP° |
| 2026-09-15 | RVTY, VLO, PSX, APA, MRK | SDGR, NVGS, VLO, COP |
| 2026-09-17 | VLO, PSX, RVTY, FRO, MRK | SDGR, NTRA, PSX, VLO, AMD |
| 2026-09-18 | VLO, PSX, JNJ, MRK, MPC | MG, TH, VLO, PSX, AMD° |
| 2026-09-21 | AMD, VLO, MRK, FRO, HSHP | PRTH, AMD, WBD, INTC, VLO° |
| 2026-09-23 | AMD, DE, VLO, MRK, FRO | RSKD, FRO, DE, AMD° |
| 2026-09-24 | AMD, VLO, RVTY, MRK, CDNA | RSKD, QMCO, AMD, TMO |
| 2026-09-25 | AMD, VLO, MRK, HQI, QMCO | QMCO, AMD, PRLB, AAPL |
| 2026-09-28 | VLO, AMD, MRK, SGHT, KOD | KOD, AGEN, TMO, AMD°, ABBV |
| 2026-09-29 | VLO, RVTY, MRK, AMD, SGHT | IOVA, IDT, TMO |
| 2026-09-30 | VLO, RVTY, AMD, PGEN, MRK | PGEN, IDT, TMO° |
| 2026-10-01 | VLO, AMD, PAYS, XRPN, MRK | PAYS, SCSC, ACN, VLO |
| 2026-10-02 | AMD, VLO, JRSH, NVDA, NTAP | IMOS, NTAP, AMD, TXN |
| 2026-10-05 | VLO, AMD, NVDA, MTRN, UGP | XP, AZTA, VLO, NVDA, AMD° |
| 2026-10-06 | VLO, AMD, RVTY, NVDA, XP | XP, FRSH, AMD, CSCO, ABBV |
| 2026-10-09 | VLO, PSX, SSL, AMD, SHEL | NVAX, HUM, ABBV, AMT, PM |

° = ohne frisches Ereignis an diesem Tag.

## Intraday (ca. alle zwei Stunden während der Sitzung)

Erzeuger ist `scripts/discover/build-im-blick-live.mjs`, die Terminlogik steht in `discover/engines/refresh-plan.js`. Der Workflow `discover-im-blick-live.yml` schreibt `discover/live/im-blick-US_REAL.json` (die Auswahl) und `discover/live/monitor-US_REAL.json` (Plan, Lauf, Erfolg, Alter, Fehler).

### Warum nicht mehr „stündlich per Zeitplan“ (Stand 12.10.2026, belegt)

Der erste Stundenplan (`17 13-21 * * 1-5`) erzeugte am 12.10. keinen einzigen Lauf. Gemessen an der Actions-API (`event=schedule`, 11.10. 00:00 UTC bis 12.10. 15:30 UTC, alle Workflows mit Zeitplan):

| Befund | Wert |
|---|---|
| fällige Zeitplan-Läufe laut Cron | 110 |
| von GitHub angelegt | 30 (27 %) |
| Verspätung der angelegten Läufe | 29 von 30 über 30 Minuten; tägliche Jobs 6,5–9 Stunden zu spät |
| Fenster-Crons 13–21 UTC (Pages-Brücke, Zustellungs-Wächter, Taktgeber, Im Blick, Freshness) | 0 von 47 |
| `workflow_dispatch` / Push im selben Zeitraum | normal (109 Taktgeber-Läufe des Weckers, alle erfolgreich) |

- **Belegt:** GitHub legt Zeitplan-Ereignisse für dieses Repository verspätet oder gar nicht an, am stärksten im Fenster 13–21 UTC. Kein Konfigurationsfehler gefunden: Default-Branch `main`, Workflow aktiv, Cron gültig, Berechtigungen im Workflow gesetzt, Repository öffentlich und aktiv.
- **Nicht belegt:** *warum*. GitHub nennt für ein nicht angelegtes Ereignis keinen Grund; dokumentiert ist, dass Ereignisse unter hoher Actions-Last verzögert oder verworfen werden. Dass die hohe Last dieses Repositories (an diesem Nachmittag rund 300 Läufe in vier Stunden) die Ursache ist, ist eine gut gestützte Vermutung, kein Nachweis.
- **Folge:** Die Aktualisierung darf an keinem pünktlichen Zeitplan hängen. Der Cloudflare-Wecker (`worker-waker/`, GitHub App) steht außerhalb von GitHub und weckt den Taktgeber nachweislich zuverlässig.

### Architektur: der Lauf ist eine Frage, kein Takt

Ein Slot ist eine **Fälligkeit**, kein Auslöser. Jeder Lauf ermittelt aus dem Börsenkalender den zuletzt fälligen Slot und rechnet nur, wenn dessen Ergebnis noch nicht veröffentlicht ist.

| Slot | Regel | Normaltag (New York) | UTC im Sommer (EDT) | UTC im Winter (EST) |
|---|---|---|---|---|
| I1 | Sitzungsbeginn + 90 Min. | 11:00 | 15:00 | 16:00 |
| I2 | + 210 Min. | 13:00 | 17:00 | 18:00 |
| I3 | + 330 Min. | 15:00 | 19:00 | 20:00 |
| C | Schluss + 20 Min. | 16:20 | 20:20 | 21:20 |

- Intraday-Slots nur, wenn sie mindestens 30 Minuten vor dem Schluss liegen: verkürzte Tage (13:00) ergeben 11:00 und 13:20; Feiertage und Wochenenden keinen Slot.
- Sommer-/Winterzeit steckt im Kalender (`quant/config/market-calendar.json`). USA und Europa stellen an verschiedenen Wochenenden um (Europa 29.3. / 25.10., USA 8.3. / 1.11.2026); entscheidend ist allein die New Yorker Zeit. Die Zeitfenster der Auslöser (15–21 UTC) decken beide Lagen ab.
- **Erwartet: vier Aktualisierungen je regulärem Handelstag** (zwei bis drei Stunden Abstand, dazu die Auswahl nach Schluss), zwei an verkürzten Tagen.

**Auslöser (gleichwertig, unabhängig, jeder harmlos, wenn er zu früh, doppelt oder zu spät kommt):**

1. Cloudflare-Wecker, alle 30 Minuten (Minute 5/35, 15–21 UTC, Mo–Fr), dedupliziert gegen laufende und wartende Läufe. Ein verpasster Slot wird spätestens 30 Minuten später nachgeholt.
2. GitHub-Zeitplan `27 15-21 * * 1-5` (Rückfall; kann ausfallen oder Stunden später kommen).
3. Manuell (`workflow_dispatch`, `force` erzwingt eine Neuberechnung).

**Garantien:**

- **Idempotent:** zweiter Lauf zum selben Slot = `UP_TO_DATE`, keine Datei berührt, kein Commit.
- **Nie rückwärts:** ein älterer Slot oder älterer Kursstand ersetzt nie eine neuere Veröffentlichung (`PUBLISHED_NEWER`, `OLDER_DATA`).
- **Fehler lassen die letzte gültige Auswahl stehen** (`KEEP_LAST_VALID`); der Fehler steht im Monitor.
- **Atomar:** Datei in eine Nachbardatei, dann Umbenennen.
- **Ehrliche Zustände:** `LIVE` nur bei offener Börse; nach dem Schluss `SESSION_CLOSED` („unbestätigt bis zum Abendlauf“); zu alte Kurse `INTRADAY_STALE` (keine Auswahl statt einer alten).
- **Keine Endlosschleife, kein Dauerläufer:** ein Lauf dauert 30–90 Sekunden (`timeout-minutes: 10`).

### Kosten (0 € zusätzlich)

- Repository öffentlich: Standard-Runner sind kostenlos und unbegrenzt.
- Mehr Läufe: höchstens 14 Wecker-Dispatches + 7 Zeitplan-Ereignisse je Handelstag; die meisten enden im Leerlauf (~30–90 Sekunden). Rund 20 Minuten Runner-Zeit am Tag.
- **Anbieteranfragen: null.** Im Blick liest nur committete Snapshots und die EOD-Basis. Tiingo wird weiterhin nur vom Taktgeber abgefragt (rund 1.430 Anfragen je Intraday-Zyklus, unverändert); Marketstack betrifft nur Europa-Ingestion und kommt im Intraday-Pfad nicht vor.
- Cloudflare: 14 zusätzliche Aufrufe je Handelstag auf dem Free-Plan (100.000/Tag).

### Überwachung

`discover/live/monitor-US_REAL.json` führt: letzte geplante Ausführung (`plan.lastDueSlot`, `nextSlot`), letzte gestartete Ausführung (`lastRun`: Zeit, Auslöser, Herkunft, Lauf-ID, Ergebnis), letzte erfolgreiche Berechnung (`lastSuccess`), veröffentlichter Datenstand (`published`), Datenalter, Marktstatus, Anzahl der Titel und `error` (Code und Ursache).

`scripts/discover/check-im-blick-live.mjs` prüft das **Ergebnis**, nicht den Workflow. Ein nicht gestarteter Workflow kann keinen Fehler melden; deshalb vergleicht die Prüfung den fälligen Slot (aus dem Kalender) mit dem veröffentlichten:

| Befund | Stufe | Bedeutung |
|---|---|---|
| `RECOMPUTE_LATE` | WARN | Slot seit > 45 Min. fällig |
| `RECOMPUTE_OVERDUE` | FAIL | seit > 90 Min. fällig: Lauf nicht gestartet oder gescheitert |
| `DATA_STALE` | WARN | die Rechnung lief, die Kurse waren alt (Taktgeber/Anbieter) |
| `COMPUTE_ERROR` | WARN | letzte Rechnung meldet einen Fehler |

Still bleibt es am Wochenende, an Feiertagen, vor dem ersten Slot, nach dem Abendlauf (der die Sitzung abdeckt) und für Slots, die älter als sechs Stunden sind (nicht mehr aufholbar). Die Prüfung läuft im Freshness-Monitor (Mo–Fr 19:40 UTC zusätzlich zu den bestehenden Terminen); bei FAIL wird der Lauf rot und GitHub benachrichtigt.

**Ehrlich offen:** Sind Cloudflare-Wecker *und* GitHub-Zeitplan *und* der Freshness-Monitor-Zeitplan zugleich still, bleibt der Ausfall unbemerkt, bis jemand die Seite oder den Monitor liest. Der Monitor ist öffentlich unter `/discover/live/monitor-US_REAL.json`.

### Datenalter und Anzeige

- **Basis:** Abendlauf vom Schluss der Vorsitzung; **Kurs:** Snapshots der Sitzung. Snapshots, die mehr als 45 Minuten hinter dem jüngsten liegen, fallen heraus.
- **Veraltet** ist der Kursstand bei offener Börse ab 60 Minuten, nach dem Schluss, wenn er nicht aus den letzten 30 Minuten vor Schluss stammt.
- **Startseite:** zeigt `LIVE` und `SESSION_CLOSED` nur bei gleicher Basis, mindestens drei Titeln und innerhalb von `validUntil` (nächster Slot + 90 Minuten); `SESSION_CLOSED` nie als „live“ gekennzeichnet. Eigener Abruf (`no-cache`, Fünf-Minuten-Parameter): der Zwischenspeicher von `QuantShell.loadJSON` hält eine Antwort bis zum Neuladen; GitHub Pages liefert bis zu zehn Minuten aus dem CDN; der Service Worker cached keine Daten.
- **Vorrang:** nach dem Abendlauf gilt wieder die bestätigte Schlusskurs-Auswahl (`EOD_CURRENT`).
- **Getrennt von den Schlusskurs-Signalen:** Intraday gibt es kein Schlusshoch und kein Ausbruchsignal, und das IEX-Volumen ist nicht mit dem Tagesvolumen vergleichbar. Die Karte sagt „IM TAGESVERLAUF · STAND HH:MM“ und „Unbestätigt bis zum Handelsschluss“.
- **Europa** ist nicht enthalten (nur manuell veröffentlichte Schlusskurse, keine Intraday-Quelle, keine Rangfreigabe, `core/registry/domains.json`).

Wiederholen: Actions → Workflow → „Run workflow“ auf `main` (idempotent; `force` nur bei Bedarf).
