# VISION UNIVERSE® Discover — V4.1 Consumer Experience Master Pass

Abschlussbericht des Auftrags „V4.1 CONSUMER EXPERIENCE MASTER PASS" (§0–37).
Branch `claude/vision-universe-discover-h93fmv`, neu aufgesetzt auf `main`
(7cc267ba9, Live-Stand vom 16.09.2026 mit den Intraday-Läufen des Tages).
**Nicht nach `main` gemergt, nicht veröffentlicht — Owner-Abnahme zuerst.**

Kein Greenfield, keine zweite Architektur, keine parallele Datenpipeline:
alle Engines (Universum, Company Master, Marktdaten, Chart, SEC-Fundamentals,
Quant, Technical, Trading Session Resolver, Freshness-Vertrag) sind dieselben
wie auf `main`. Alles hier ist gemessen; was nicht verifiziert werden konnte,
steht so da.

---

## 1 · Root Cause: Dienstag-Chart um 15:40 Uhr bei geöffnetem Markt (§3–4)

**Befund (Screenshot des Owners).** Am 16.09. um ~15:40 deutscher Zeit
(09:40 New York, Markt seit 10 Minuten geöffnet) zeigte die Seite den
Tagesverlauf vom Dienstag mit der Statuszeile „GEÖFFNET · STAND DIENSTAG ·
HEUTIGE KURSE FOLGEN".

**Ursache — die ganze Kette, gemessen an den Läufen des 16.09. auf `main`:**

| Glied | Stand vor V4.1 | Messung |
|---|---|---|
| Zeitplan | `intraday-snapshots.yml`, `*/10 13-21 * * 1-5` | GitHub startete die Läufe mit 1–4 min Verzögerung |
| Lauf | 524 Titel (Discover-Umfang) bei höchstens 100 Abrufen je Minute | Checkout 21 s, Abruf ≈ 5 min, Commit/Push 41 s → **≈ 6,5 min je Lauf** |
| Ratenbegrenzung | `providers/tiingo/adapter.js`, `requestsPerMinute: 100` | eine **selbst gesetzte Sicherheitsgrenze** (`SAFETY_CEILING`), keine belegte Anbietergrenze |
| Sitzung | Lauf 13:27 UTC → Resolver `PRE_MARKET` → holt die letzte abgeschlossene Sitzung (Dienstag) | korrekt laut Vertrag, aber der nächste Lauf begann erst **13:43 UTC** (Takt 10 min + Laufzeit + Verzögerung = effektiv **~16 min**) |
| Auslieferung | Commit 13:49 UTC, GitHub Pages ≈ 1,5 min | erste Mittwoch-Kurse live **≈ 13:51 UTC = 15:51 deutscher Zeit** |
| Client | Live-Hub pollte im `refreshMinutes`-Takt (10 min) | ein Browser, der um 15:40 geöffnet wurde, sah Dienstag bis zum nächsten Poll |
| Anzeige | „Geöffnet · Stand Dienstag · heutige Kurse folgen" | vertragstreu (LAST_SESSION bei OPEN), aber nicht das, was ein Nutzer bei geöffnetem Markt erwartet |

Der Datenpfad selbst (Tiingo/IEX → Ingest → Snapshot → Commit → Pages →
Live-Hub → Freshness → UI) war intakt; das Problem war **Kadenz und
Latenz**, nicht Datenwahrheit.

**Behoben (`.github/workflows/intraday-snapshots.yml`, `scripts/market/ingest-intraday.mjs`,
`quant/engines/realtime/trading-session.js`, `quant/config/development-preview.json`,
`discover/ui/live-hub.js`, `discover/app.js`):**

1. Zeitplan **alle 5 Minuten** (`*/5 13-21 * * 1-5`); die Concurrency-Gruppe
   lässt einen Lauf zugleich zu und hält einen wartend — Lauf folgt auf Lauf
   statt 10 min + Laufzeit.
2. **Warten auf die Eröffnung:** `TradingSession.openWaitMs(resolution, now, 7)`
   — ein Lauf, der bis zu 7 Minuten vor 09:30 New York startet, wartet bis
   Eröffnung + 60 s und löst die Sitzung dann neu auf (3 neue Tests TS-W1..W3).
   Der 13:27-Lauf hätte damit die ersten Mittwoch-Bars geholt statt Dienstag.
3. `intraday.refreshMinutes` 10 → **5**; der Live-Hub pollt bei `OPEN` alle
   **3 Minuten** (`min(refreshMinutes, 3)`) mit `cache: "no-cache"`.
4. Freshness-Monitor zusätzlich um **14:05 UTC** (kurz nach Eröffnung), damit
   ein Ausfall der ersten Läufe sichtbar wird.
5. **Statuszeile in drei ehrlichen Formen** (`statusWorte`):
   „**Markt geöffnet** · Live" nur im Zustand LIVE des Freshness-Vertrags;
   „**Markt geöffnet** · heutige Kurse folgen" (LAST_SESSION bei OPEN);
   „**Letzter Handelstag** · Dienstag"; „**Markt geschlossen** · Schluss 16:00";
   „**Heute · Stand 10:20** · nicht aktuell" (STALE). Kein „Live" aus dem
   Kalender, keine Uhrzeit ohne Datenstand.

**Erwartete Latenz nach V4.1:** Eröffnung + Wartelauf (≈ 5 min Abruf + 40 s
Commit) + Pages (≈ 1,5 min) → erste Mittwoch-Kurse ≈ **15:38 deutscher Zeit**
statt 15:51; danach ist jeder Stand höchstens ≈ 8 Minuten alt (Daten &
Quellen: „in der Regel fünf bis acht Minuten"). Schneller ginge nur mit einer
höheren Abrufrate — die Sicherheitsgrenze ist selbst gesetzt; ob Tiingo mehr
erlaubt, ist **nicht belegt** und bleibt eine Owner-Entscheidung (§21).

**„Ab 10 Uhr" (§4):** Die Behauptung ist für US-Aktien **falsch**. 10:00
deutscher Zeit ist 04:00 New York — vor jedem Handel. IEX-Vorbörsenbars gibt
es ab **08:00 New York = 14:00 deutscher Zeit**; sie liegen in den Snapshots
(`extended.pre`), werden aber im 1T-Chart **nicht** gezeichnet (Chart ab
09:30). Daten & Quellen sagt das jetzt so. Ob die Vorbörse im Chart erscheinen
soll, ist Owner-Entscheidung (§21) — technisch vorhanden, nicht eingeschaltet.

**Verifikation in dieser Sitzung:** lokal mit den Snapshots vom 16.09.: Status
„Markt geöffnet · Live" bei LIVE-Daten (vor Ablauf der Karenz), danach ehrlich
„Heute · Stand 10:20 · nicht aktuell" (die Sandbox erhält keine 5-Minuten-Läufe).
**Nicht verifizierbar aus der Sandbox:** der Produktionslauf des neuen Takts —
die Sandbox erreicht `research.visionuniverse.de` nicht (curl 000). Der
Zeitplan gilt erst nach dem Merge auf `main` (Live-QA: Abschnitt 17).

## 2 · Datenpfad Live (Provider → UI)

Tiingo IEX 5-min-Bars → `scripts/market/ingest-intraday.mjs` (`--scope=auto`:
Discover-Umfang 524 Titel während der Sitzung, Universum nach Schluss) →
`quant/data/market/intraday/<Sitzung>/ref_<SYM>.json` + `index.json` +
`status.json` (Trading Session Resolver, Freshness-Vertrag) → Commit durch den
Workflow → GitHub Pages → `discover/ui/live-hub.js` (Verzeichnis + Snapshot
je Titel, `no-cache`-Revalidierung, Rollover bei Sitzungswechsel) →
`quant/engines/realtime/freshness.js` (LIVE / LAST_SESSION / STALE /
UNAVAILABLE, dasselbe Modul in Node und Browser) → Statuszeile, Karten-Micro-
Chart, 1T auf der Aktienseite. Unverändert gegenüber `main`; geändert sind
Takt, Wartelogik, Poll-Intervall und Worte.

## 3 · Aktienseite: Struktur vorher → nachher (§23)

| Vorher (V4) | Nachher (V4.1) |
|---|---|
| Kopf, Chart 320 px, Warum, 30 Sekunden, Unternehmen (Kacheln + Kennzahlliste), Damals vs. heute, Journey (klein), Heute (Liste), Bewertung (Liste), Chancen & Risiken (alle Punkte), Grenze, Belege, Kennzahlen/Herleitung, Technical Intelligence, Weiter, Nächste, Herkunftsblock | Kopf, **großer Chart 50–70 % des Bildschirms** mit Berührung, Warum, 30 Sekunden, Unternehmen (**ein Absatz**, Zahlen wandern in die Cluster), **Fundamental Journey als Bühne** (groß, Kennzahlwechsel), **„Das Unternehmen in Zahlen"** (vier Cluster, „Weitere Kennzahlen" dahinter), Damals vs. heute, **Bewertung consumer-first** (Satz, Balken, Reiter), **Chancen & Risiken kompakt** (3 je Seite, Rest hinter „Weitere Punkte"), **Analyse hinter der Grenze** (Belege, Kennzahlen/Herleitung, Technical Intelligence — am Telefon zugeklappt, am Schreibtisch offen, nichts gelöscht), Weiter entdecken, Nächste Aktie, Herkunft in **einer Zeile** mit Link zu Daten & Quellen |

Scroll-Wüsten-Audit (390 × 844, AAPL/NVDA/VLO/PANW): keine Sektion über
500 px mit weniger als 12 Zeichen je 100 px; Seitenlänge 10,5–11,8
Bildschirme, davon 1,4–2,7 „Weiter entdecken" (dicht, Karten).

## 4 · Chart-System (§8–10)

- `discover/ui/microchart.js` 1.2.0: `renderRange` und `renderIntraday`
  zeichnen **pixelgenau** (viewBox = Kastenmaß), merken sich die Punkte
  (`__punkte`) und die Basislinie (`__basis`); Zwischenachsen (hoch, zwei
  Mitten, tief) ab 220 px Höhe; Stundenmarken weichen den Rand-Labels aus.
- `discover/ui/detail.js`: Höhe am Telefon `max(300, min(52 vh, 480))`, am
  Schreibtisch 440 px; gemessen **53 % des Bildschirms** (449 px von 844);
  Neuzeichnen bei Drehung (entprellt).
- **Berührung:** Finger/Zeiger auf dem Chart → Linie + Punkt, Kopf zeigt Kurs,
  Veränderung und Datum des Punkts; Loslassen stellt den Endstand wieder her.
  1T mit eigenem Kopf (letzter Kurs, % zum Vortagesschluss, Stand).
- **Verbindliche Farbregel** (`discover.css`): jeder Kurschart trägt
  `data-direction="up|down"` (Zeitraum positiv/negativ) und färbt Linie,
  Punkt und Fläche `--discover-up` / `--discover-down` — Hero-Chart,
  Karten-Micro-Charts, Index-Karten, Aktienseite, Feed. Die Farbwelt der
  Sammlung bleibt Atmosphäre (Licht, Fläche, Ticker-Wasserzeichen). Belegt:
  `docs/screenshots/discover-v4-1/30-chart-rot-negativ-NKE-1J.png`
  (−50,4 %, rot) und `30-chart-gruen-positiv-AAPL-1J.png` (+42 %, grün).
- Profi-Werkzeuge (Indikatoren, Technik) unverändert hinter „Chart-Werkzeuge".

## 5 · Farbschema Hell / Dunkel / System (§12)

- `discover/engines/theme.js` (`discover-theme-1.0.0`, 9 Tests): Modus
  `system | light | dark`, Standard **System**; Wahl im Gerät
  (`vu-discover-theme-v1`), „System" löscht sie; folgt `prefers-color-scheme`
  nur im Modus System; setzt `<html data-theme data-theme-mode>`,
  `meta[name=theme-color]` und das `theme`-Attribut der Site-Navigation.
- **Vor dem ersten Bild:** ein Inline-Skript im `<head>` wendet dieselbe Regel
  an, damit nichts aufblitzt; die Navigation liest das Attribut vor ihrer
  Definition.
- **Tokens statt Farbwerte:** alle 44 fest verdrahteten Weißschleier
  (`rgba(255,255,255,…)`) sind jetzt `color-mix(in srgb, var(--discover-ink) N%, transparent)`;
  Schrift auf Textflächen `--discover-on-text`, Kopf- und Leistengrund
  `--discover-bar-bg` / `--discover-fnav-bg`. Der helle Satz:
  `html[data-theme="light"] body.dx { … }` mit dunkler gestimmten Signalfarben
  (Grün `#178f50`, Rot `#d1453a`) und abgedunkelten Weltfarben für Schrift.
- Bedienung: Knopf im Kopf (System → Hell → Dunkel), drei Wörter am Fuß.
- `assets/site-navigation.js`: `observedAttributes = ['theme']`, Farben werden
  zur Laufzeit umgeschaltet; Menü, Ziele, Logik unverändert (6 alte + 3 neue
  Tests).
- Gemessen (Playwright, `colorScheme` hell/dunkel, Telefon + Schreibtisch):
  Standard System folgt dem Gerät; Wahl überlebt Neuladen; Charts grün/rot
  auch auf Weiß; Screenshots `01-discover-mobil-hell/-dunkel`, `06-…-hell`.

## 6 · Fundamental Journey als Hero-Erlebnis (§13)

`discover/ui/detail-fundamentals.js` — Bühne `#journey`: Geschichte in
Sätzen, **Reiter je Kennzahl** (Umsatz, Nettogewinn, Free Cashflow,
Bruttomarge, operative Marge, Nettomarge, Gewinn je Aktie, Kasse, Schulden,
Aktienanzahl — nur, wo die kanonische SEC-Schicht die Spur liefert),
pixelgenaue Balken mit Wert am ersten und letzten Jahr, Kopf „von → bis ·
Delta", Satz („auf mehr als das 19-Fache gestiegen", Tausendertrennung
„+1.819 %"), Neuzeichnen bei Drehung. Vorbehalte (Aktiensprung ohne
rückwirkende Bereinigung) stehen am Reiter — ohne Anbietername.

## 7 · „Das Unternehmen in Zahlen" statt Kennzahlliste (§14)

Vier Cluster als antippbare Karten: **Wachstum** (Umsatz, Δ Vorjahr, CAGR),
**Profitabilität** (Gewinn, Nettomarge, Satz), **Cashflow** (FCF, Anteil vom
Umsatz), **Bilanz** (Kasse/Schulden). Jede Karte trägt Note, große Zahl,
Unterzeile, einen Satz und „Entwicklung ansehen →" (öffnet die Journey auf
dieser Kennzahl). Alles Weitere unter `details` „Weitere Kennzahlen (n)".
Die alten Listen im Kapitel „Unternehmen" und „Heute" sind weg; die
Zahlen sind dieselben (Verifier 63 723 Nachrechnungen grün).

## 8 · Bewertung consumer-first (§15)

Satz zuerst, dann **Balken Unternehmen vs. breiter Markt (Median)**, Reiter
Gewinn / Umsatz / Cashflow, Lesart in einer Zeile, „Wie gerechnet wird"
dahinter. **Sanity** (`BEWERTUNG_SANITY = { maxPe: 75, minNetMargin: 0.03 }`):
PANW mit KGV 798 → „nur eingeschränkt aussagekräftig … Aussagekräftiger ist
hier das Kurs-Umsatz-Verhältnis: 26,7 gegenüber 2,1 im breiten Markt" (Screenshot
`25-PANW-bewertung.png`). Keine erfundenen Vergleichsgruppen: der Median ist
der des ausgelieferten Universums (`valuation.context`).

## 9 · Quellen- und Methodentexte (§16)

Aus dem Inhalt entfernt: Quellenfuß je Fundamental-Kapitel (jetzt eine Zeile
mit Link `#/daten`), „SEC" in Kartentiteln und Story-Bildunterschriften
(`cards.js`, `surfaces.js`), Anbieterwort in der Engine-Caveat
(`fundamentals.js`: „in der berichteten Zeitreihe"), Herkunftsblock der
Aktienseite (eine Zeile). **Behalten, weil vorgeschrieben:** die
Tiingo-Attribution und die IEX-Kursart auf **Daten & Quellen** (Tiingo-
Nutzungsbedingungen verlangen die Nennung; die Lizenzprüfung von Stufe 8
bleibt gültig), die SEC/EDGAR-Nennung als gemeinfreie Quelle ebenda.
Geprüft: Startseite, vier Aktienseiten, Sammlung, Feed, Suche ohne
Anbieternamen (Browser-QA V4.1); die Quellenseite nennt sie.

## 10 · Schwebende Navigation (§14)

`nav.dx-fnav` einmal je Sitzung: **Suchen** (Lupe) und **Entdecken** (Funke),
44 × 110 / 44 × 130 px, `bottom: 14px + env(safe-area-inset-bottom)`,
Blur-Grund, zieht sich beim Herunterblättern zurück (`dx-fnav--weg`) und
kommt beim Hochblättern oder nach 900 ms Ruhe zurück; weg im Feed und über
der Suche; Seiten halten unten 120 px + Safe Area frei. Am Schreibtisch die
leichte Spielart rechts unten, der Kopf behält Suchen · Entdecken · Schema.
Kopfzeile am Telefon: Marke · Schema-Knopf · Lage (Hauptwort bleibt sichtbar).
Telefon-Symbol und „Aktien entdecken" sind entfernt (§16).

## 11 · Suche (§15)

Overlay wie V4, Wortlaut „Suchen" / „**Welche Aktie suchst du?**", Körperklasse
`dx-suche-offen` (blendet die Leiste aus), Escape schließt; Treffer mit
Farbwelt und Kurs unverändert.

## 12 · Immersiver Feed (§17–19)

- **Reihenfolge zur Bauzeit** (`build-discover-data.mjs` → `discover/data/feed/US_REAL.json`,
  93 KB, 12 KB gzip): **400 Titel** reihum aus **25 Sammlungen** (Stärkste,
  Bekannte Namen, Jahreshochs, Umsatz wächst, Momentum, Cashflow-Maschinen,
  Überraschungen, S&P/NDX/Dow-Ranglisten, Comeback, Compounder, Ausbruch,
  Qualität, Themen KI/Robotik/Mobilität, …), jeder Titel einmal, höchstens
  zwei Titel eines Sektors in Folge, bekannte (Tier 1: 41) und weniger
  bekannte Namen im Wechsel. Deterministisch, ohne Zufall, ohne Modell; die
  Regel steht in der Datei (`rule`). Jede Karte trägt ihre Herkunft.
- **Client** (`discover/ui/feed.js`): erstes Stück (12 Karten) liegt bei,
  weitere Stücke à 12 werden aus den Aktienseiten geladen, sobald der Nutzer
  fünf Bildschirme vor dem Ende ist; Vorladen der nächsten Seite; Zähler
  „n von 400"; Ende mit Ausgängen; **keine Doppelten** (Symbol-Set);
  **Wiederaufnahme** an der letzten Stelle (Gerätespeicher, Schlüssel
  `feed:US_REAL` — getrennt von der Position der Startseite, die zuvor
  denselben Schlüssel benutzte und den Feed bei „3 von" starten ließ).
- Keine Kaufknöpfe, keine Dringlichkeit (geprüft), kein Casino.
- Gewicht: ein Stück = 12 Aktienseiten ≈ **754 KB roh / 134 KB gzip**
  (Ø 63 KB je Seite). Das ist der Preis dafür, keine zweite Datenquelle zu
  bauen; eine kompakte Feed-Karte je Titel wäre der nächste Schritt (§20).

## 13 · Personalisierung: Vertrag, nicht Backend (§20)

Gebaut, lokal und ohne Server: das Gerät merkt sich zuletzt angesehene Aktien
**mit Sektor** (`memory.js`), geöffnete Karten, bevorzugte Sammlungen, die
Feed-Position. Eine **Neigung** (≥ 2 der letzten 8 Aktienseiten aus einem
Sektor) hebt innerhalb EINES Stücks bis zu vier Titel dieses Sektors nach
vorn — nie über Stückgrenzen, nie neue Titel. Ereignisse (`immersive_start`,
`feed:karte`, `immersive_complete`, `theme_change`) laufen über die
bestehende Analytics-Schicht. **Nicht gebaut:** Konten, Server-Tracking,
Modelle. Vertrag für später: Eingabe `{recentSectors, openedSymbols,
preferredCollections, position}` → Ausgabe eine Umordnung der gebauten
Reihenfolge; die Reihenfolge selbst bleibt deterministisch und erklärbar.
Grenze: nur 43 der 400 Feed-Titel tragen einen kuratierten Sektor
(Company Master `sectorStatus`); die Sektorregel greift nur dort.

## 14 · Entwicklungs-Plakette (§13)

`<vu-navigation theme="dark" no-preview>` auf Discover: das Element rendert
die Plakette „Development Preview" nur ohne `no-preview`; Vorlesetext ohne
den Zusatz. Alle anderen Seiten der Site zeigen sie weiterhin (site-weite
Entfernung: Owner-Entscheidung, Abschnitt 21).

## 15 · Mobile-first-QA (§28)

390 × 844 (iPhone-Klasse) und 1440 × 900, hell und dunkel: kein horizontaler
Überlauf, Ziele ≥ 44 px, Safe Area, keine Konsolenfehler (ein bisher
bestehender 404 auf `/favicon.ico` ist mit `<link rel="icon" href="data:,">`
abgestellt). Kopfzeile bricht nicht mehr um (Schema-Knopf in der Zeile).

## 16 · Screenshots (§30)

`docs/screenshots/discover-v4-1/` — 51 Bilder: Discover mobil hell/dunkel
(mit Hero und Leiste), Sammlungen, Index-Rangliste, Desktop hell/dunkel,
Leiste beim Blättern (weg), Suche hell/dunkel, Feed Titel 1 / nach 4
Wischern / „15 von 400" (Stück > 10) hell/dunkel, je AAPL · NVDA · VLO · PANW:
Kopf, 1T, 1J, Journey, Zahlen-Cluster, Bewertung, Chancen & Risiken,
Analyse-Grenze; NKE 1J rot, AAPL 1J grün.

## 17 · Tests und Prüfungen (§32) — alle grün, keine abgeschwächt

| Prüfung | Ergebnis |
|---|---|
| `node --test quant/tests` | **929 / 929** (3 neue: Warten auf die Eröffnung) |
| `node --test discover/tests` | **206 / 206** (9 neue Theme-Tests, 1 Memory-Sektor, 3 Navigation no-preview/Wechsel; 2 Erwartungen erweitert: Sektor im Eintrag, weitere Attribute am Element) |
| Python `scripts/quant/tests` | **471 / 471** |
| `verify-discover-data.mjs` | **63 723** Nachrechnungen, keine Abweichung (nach Neubau inkl. `feed/`) |
| `assert-public-data-hygiene.mjs` | bestanden |
| Browser-QA V4 (`browser-qa.mjs`) | **63 / 63** (3 Prüfungen an V4.1 angepasst: Header folgt dem Schema + dunkler Fall + Plakette weg; Suche am Telefon über die Leiste; Feed-Wisch-Hinweis) |
| Browser-QA V3 | **38 / 38** (Feed-Prüfung ersetzt: Stücke statt 20 Titel, > 12 nach Wischen, keine Doppelten) |
| Browser-QA Live | **33 / 33** |
| **Browser-QA V4.1 neu** (`scripts/discover/browser-qa-v41.mjs`) | **29 / 29**: Farbregel Hero/Karten/Aktienseite, Schema System/Hell/Dunkel + Speicher + Gerätewechsel, Leiste (Größe, Safe Area, Blättern), Suche, Feed (> 10, keine Doppelten, Zähler, Wiederaufnahme, keine Dringlichkeit), Chart 50–70 %, Journey-Wechsel, Cluster, Bewertungs-Sanity, Chancen & Risiken ≤ 3 offen, Analyse zu/offen, keine Anbieternamen/Testsymbole/Plakette, Daten & Quellen vorhanden, Statuszeile ehrlich, kein Überlauf, keine Konsolenfehler, keine 4xx |
| Performance | Assets +61 KB roh gegenüber `main` (CSS +19, detail-fundamentals +14, app +8, detail +8, feed +5, theme +4); Startseite 1,6 MB / 75 Anfragen Schreibtisch, 1,56 MB / 64 Telefon (Lazy Loading, Chunk-Grenze 320 KB, Live-Hub-Guards unverändert) |

Alle drei bestehenden Suiten plus die neue laufen im
`discover-live-smoke.yml` (Zusammenfassung und Ergebnisschritt erweitert).

## 18 · Live-QA (§31)

Aus der Sandbox nicht möglich (kein Zugang zur Produktion). Nach dem Merge:
`freshness-monitor.yml` (14:05 / 15:15 / 23:15 UTC) und
`discover-live-smoke.yml` gegen `https://research.visionuniverse.de` — der
Rauchtest enthält jetzt die V4.1-Suite. Zu verifizieren in der nächsten
Sitzung: erste Mittwoch-/Donnerstag-Kurse ≤ 8 Minuten nach Eröffnung,
„Markt geöffnet · Live" ab ≈ 15:38, Läufe im 5-Minuten-Takt (Concurrency).

## 19 · Bekannte Grenzen

- Der 5-Minuten-Takt ist erst nach dem Merge wirksam; die Latenzrechnung
  (Abschnitt 1) ist aus den gemessenen Laufzeiten abgeleitet, nicht aus einem
  Produktionslauf des neuen Takts.
- Vorbörse: Daten ab 14:00 deutscher Zeit vorhanden, im Chart nicht gezeichnet.
- Sektor für die Feed-Regel nur bei kuratierten Titeln (43 von 400).
- Feed-Stück ≈ 134 KB gzip; kompakte Feed-Karten wären der nächste Schritt.
- Farbschema gilt für Discover; die übrigen Seiten der Site bleiben hell.
- Ratenbegrenzung 100/min ist selbst gesetzt; ein höherer Wert ist nicht belegt.

## 20 · Owner-Entscheidungen (§34)

1. **Merge und Veröffentlichung** von V4.1 (dieser Branch, nicht gemergt).
2. **Vorbörse im 1T-Chart** zeigen (ab 14:00 deutscher Zeit, gekennzeichnet)?
3. **„Development Preview" site-weit** entfernen (jetzt nur auf Discover)?
4. **Abrufrate** über 100/min beim Anbieter klären (Latenz ≈ 5 min je Lauf)?
5. Tiingo-Attribution auf Daten & Quellen bleibt (vorgeschrieben) — Bestätigung.

## 21 · Branch und Commits

Branch `claude/vision-universe-discover-h93fmv` auf `main` 7cc267ba9; zwei
Commits: (1) Neubau der Discover-Daten (Feed-Reihenfolge, Caveat-Wortlaut in
1 312 Aktienseiten), (2) V4.1 Code, Tests, Workflows, Screenshots, Bericht.
Commits: `3f502ab0c` (Daten), `9ea81f9f8` (Code, Tests, Workflows, Screenshots,
Bericht); Ledger `VU_BUILD_STATUS.md`, Stufe 15.
