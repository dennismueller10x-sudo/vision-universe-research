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
| Wiederholungsquote (Titel schon am Vortag in der Auswahl) | 63,7 % | 34,8 % |
| Mittlere Ueberlappung Tag zu Tag (Jaccard) | 48,4 % | 23,7 % |
| Verschiedene Titel insgesamt | 29 | 44 |
| Wechsel auf Platz 1 | 6 von 16 | 13 von 16 |
| Laengste Serie in Folge | 17 (VLO) | 7 (AMD) |
| Anteil mit frischem Ereignis am Tag | 55,3 % | 87,7 % |
| Anteil Schlusskurs am 52W-Hoch | 50,6 % | 76,7 % |
| Mittlerer Ereigniswert (0-100) | 36,8 | 57,0 |
| Mittlere Tagesrendite der Auswahl | 4,11 % | 8,80 % |
| Anteil mit Kursverlust am Tag | 34,1 % | 12,3 % |
| Mittleres Volumen (x Ø 20 Tage) | 1,60 | 2,70 |
| Folgetag ggue. Median (nur Auswertung) | 0,85 % | 0,36 % |
| 5 Sitzungen ggue. Median (nur Auswertung) | 0,59 % | 1,18 % |


Haeufigste Titel alt: VLO 17x, MRK 13x, AMD 12x, PSX 6x, RVTY 6x

Haeufigste Titel neu: AMD 10x, VLO 9x, TMO 4x, COP 2x, SDGR 2x

Profile neu: breakout 17, highs 43, leadership 11, momentum 2


Einordnung:

- **Aktualität:** Platz 1 wechselt an 13 statt 6 von 16 Tagen. 88 % statt 55 % der Titel hatten am Tag selbst ein frisches Ereignis, nur 12 % statt 34 % einen Kursverlust.
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
| 2026-09-23 | AMD, DE, VLO, MRK, FRO | RSKD, FRO, AMD°, DE |
| 2026-09-24 | AMD, VLO, RVTY, MRK, CDNA | RSKD, QMCO, AMD, TMO |
| 2026-09-25 | AMD, VLO, MRK, HQI, QMCO | QMCO, AMD, PRLB, AAPL |
| 2026-09-28 | VLO, AMD, MRK, SGHT, KOD | KOD, AGEN, TMO, AMD°, ABBV |
| 2026-09-29 | VLO, RVTY, MRK, AMD, SGHT | IOVA, IDT, TMO |
| 2026-09-30 | VLO, RVTY, AMD, PGEN, MRK | PGEN, IDT, TMO° |
| 2026-10-01 | VLO, AMD, PAYS, XRPN, MRK | PAYS, SCSC, ACN, VLO |
| 2026-10-02 | AMD, VLO, JRSH, NVDA, NTAP | IMOS, NTAP, AMD, TXN |
| 2026-10-05 | VLO, AMD, NVDA, MTRN, UGP | XP, AZTA, VLO, NVDA, AMD° |
| 2026-10-06 | VLO, AMD, RVTY, NVDA, XP | XP, FRSH, AMD, VLO°, NVDA |
| 2026-10-09 | VLO, PSX, SSL, AMD, SHEL | NVAX, HUM, ABBV, AMT, PM |

° = ohne frisches Ereignis an diesem Tag.

