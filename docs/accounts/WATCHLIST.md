# Persönliche Watchlist

Stand 26.10.2026 · Branch `claude/vision-universe-watchlist` · baut auf Draft-PR #926 (Konten und Abos) auf und ist wie diese
**ausgeschaltet**, bis `konto/config.js` einen Endpunkt bekommt.

## 1. Grundsatz

| Gehört dem Nutzer (Supabase) | Gehört allen (veröffentlichte Artefakte) |
|---|---|
| welche Instrumente er beobachtet (`instrumentId`), seit wann, Notiz, Benachrichtigungswünsche | Kurse, Quant-Faktoren, Technik, 52W-Hoch, Volumen, Supertrader-Zustände, Freigaben |

Es wird **kein** Kurs, Score oder Signal pro Nutzer gespeichert oder neu berechnet. Je Datenstand gibt es **eine** gemeinsame
Watchlist-Übersicht für alle Nutzer, gebaut im Release aus denselben Artefakten, die die Produktwelten ausliefern.

```
Browser /konto/watchlist/                     Aktienseite mit einheitlichem Kopf (heute eingebunden: Fundamental, Hedgefonds)
  │ GET /v1/watchlist  (Auswahl, RLS)           │ Lesezeichen (assets/watchlist-button.js) haengt sich an .vu-shead
  │                                             │   POST /v1/watchlist/items | …/remove  (ohne Neuladen)
  ▼                                             ▼
Worker vu-account ──JWT des Nutzers──▶ Supabase Postgres: watchlists, watchlist_items (RLS, Tarifgrenze)

Browser ──CDN──▶ /core/data/watchlist-summary-v1/meta.json + rows/<shardKey>.json   (nur die Scherben der eigenen Titel)
                 /core/data/watchlist-summary-v1/names.json                         (nur für Suche/Übernahme)
                 ▲ scripts/watchlist/build-summary.mjs im Release-Bau (wie stock-availability), nie committet
```

## 2. Datenquellen und Qualitätsstatus

Zeilenschlüssel ist die `instrumentId` aus dem Company Master (ADR-001). Ein Wert wird nur dem Listing zugeordnet, dessen kanonische
`securityId` (`core/identity.js`) die Quelle trägt, das **aktiv** ist und dessen **Währung** passt. Sonst bleibt der Abschnitt leer und
trägt den Grund (`LISTING_INACTIVE`, `LISTING_AMBIGUOUS`, `CURRENCY_MISMATCH`, `NOT_COVERED`, `SOURCE_MISSING`).

| Abschnitt | Quelle | Regel in der Watchlist | Frist (domains.json) |
|---|---|---|---|
| Identität | `quant/data/universe/instruments/*.json` | Name, Börse, Währung; delistete Listings tragen keine Marktdaten | 48/168 h |
| Kurs | `quant/data/product/universe-list-v1.json.gz` (`published-close.js`, ADR-002) | letzter veröffentlichter Schluss in Listing-Währung, mit Datum | 1/2 Handelstage |
| Quant | `quant/data/product/factor-evidence-v1/*.json.gz` | sieben Faktoren mit Stufe aus der **Position** (`bandForPosition`); `validShard`, `screeningVersionState = CURRENT`, `publicationViolations`; **kein Gesamtscore** (`compositeAllowed=false`, `QUANT_V2_NOT_ACTIVE`) | 72/120 h |
| 52W-Hoch, Volumen, Trend | `technical/data/screener-v1.json` | Plattformdefinition (Tageshoch ≥ 252-Sitzungen-Hoch, split-bereinigt). **Neues Hoch** nur bei aktuellem Stand; **nahe Hoch** ≤ 5 % darunter; **Hoch auf Wochen-/Monatsschluss** ist ein historisches Signal | 72/120 h + `fresh` je Titel |
| Supertrader | `supertrader/data/signals-core.json` + `registry-core.json` | offene Zustände je Strategie; **gültig** nur, wenn die Strategie freigegeben ist (LIVE, `CRITERIA_MET`, nicht `RESEARCH`, benannte Regelversion), das Signal **genau diese Version** trägt und der Zustand handelbar ist (SETUP, ENTRY_READY, TRIGGERED, ACTIVE) | 1/2 Handelstage |

Stand heute (Daten vom 23.10.2026): 7.809 Instrumente, 6.671 mit Kurs, 6.427 mit Quant-Faktoren, 5.642 mit Technik, 1.047 mit offenen
Supertrader-Zuständen. **Keine** Supertrader-Strategie ist freigegeben (alle `IN_REVIEW`, Darstellung „Forschung“). Die Watchlist zeigt
deshalb bei allen Titeln „Supertrader: Forschung“ bzw. „kein Setup“ und zählt **0** gültige Signale. Das ist der zutreffende Status.

### Sperren, die kein Datenupdate aufhebt

Ein späterer Datenlauf kann nichts von selbst freischalten. Jede Freigabe bleibt an die bestehende fachliche Freigabe gebunden:

| Fall im Datenupdate | Verhalten der Watchlist | Test |
|---|---|---|
| Quant veröffentlicht einen Gesamtscore (`compositeAllowed` ≠ false) | Der Quant-Abschnitt fällt aus (`QUANT_PUBLICATION_CHANGED`) und zeigt **keinen** Score. Anzeigen erst nach eigenem, freigegebenem PR | `Quant: veroeffentlicht die Quelle einen Gesamtscore …` |
| Strategie in Prüfung (`IN_REVIEW`) oder als Forschung dargestellt | „Forschung · nicht freigegeben“, zählt nicht | `Freigaben: nichts wird durch ein Datenupdate allein gueltig` |
| `CRITERIA_MET` ohne benannte Regelversion | nicht freigegeben | dto. |
| Freigegebene Version 2.0.0, Signal aus 1.0.0 | Forschung | dto. |
| Modus nicht LIVE (z. B. MODEL) | nicht freigegeben | dto. |
| Unbekannte Strategie im Signal | wird nicht gezeigt | dto. |
| Veralteter Stand | „veraltet“, zählt nicht, kein Ereignis | `Veraltete Daten …` |

Die Freigabe selbst geschieht wie bisher in der Supertrader-Welt (Evidenz in `registry-core.json`, eigener PR mit Gate A). Die Watchlist
übernimmt sie nur.

**Veraltet:** Ist ein Abschnitt älter als seine Frist, steht „veraltet“ daneben. Er zählt dann in keiner Kennzahl der Liste, und es
entsteht kein Ereignis. Die Prüfung nach Handelstagen nutzt den Kalender aus `quant/config/market-calendar.json`, der in der Übersicht
mitgeliefert wird. Ein Handelstag gilt als fällig ab 06:00 UTC des Folgetags.

## 3. Datenbank und RLS

Migration `supabase/migrations/20261028000100_watchlist_personal.sql`. Sie baut auf den Tabellen aus #926 auf
(`watchlists`, `watchlist_items`, RLS, Tarifgrenzen).

| Baustein | Inhalt |
|---|---|
| Spalten | `user_id`, `instrument_id` (`^vu_[a-f0-9]+$`, kein Ticker), `ticker_at_add` (nur Anzeige), `added_at`, `note` (≤ 500), `alerts` (Opt-in je Ereignisart, geprüft) |
| Eindeutigkeit | Primärschlüssel (`watchlist_id`, `instrument_id`): ein Titel höchstens einmal je Liste |
| Indizes | `(user_id, added_at desc)` für das Lesen der eigenen Liste; `(instrument_id)` für den späteren Fan-out. Der reine `user_id`-Index entfällt, weil sein Präfix im neuen Index steckt |
| Funktionen (security invoker, RLS gilt) | `watchlist_default`, `watchlist_add` (idempotent), `watchlist_remove`, `watchlist_update`, `watchlist_import` (bis 500 Titel in einem Aufruf, stoppt an der Tarifgrenze) |
| Tarifgrenze | in der Datenbank (Free 20, Plus 100, Pro 500 Titel); Transaktionssperre gegen gleichzeitiges Überschreiten |
| Löschung | Konto löschen löscht Listen und Einträge per Cascade; der Export enthält sie |

**Verträglichkeit mit dem Kontomodell aus #926:**

| Punkt | Befund |
|---|---|
| Tabellen | keine neue Tabelle. `watchlists`/`watchlist_items` aus #926 werden ergänzt (Spalte `alerts`, zwei Indizes, ein Index ersetzt) |
| Tariflogik | dieselbe Funktion `enforce_watchlist_limits` (nur um eine Transaktionssperre erweitert); Grenzen aus `plan_features` |
| Herabstufung (Plus → Free) | nichts wird gelöscht; alles bleibt lesbar und entfernbar; neu hinzu kommt erst unter der Grenze (SQL-Test) |
| Kontolöschung, Export | unverändert über #926: Cascade bzw. `exportData` enthält Listen und Einträge (mit `alerts`) |
| Benachrichtigungen | `alerts` je Titel ergänzt `user_settings.notification_settings`; versendet wird später nur, wenn **beide** zustimmen |
| Datenvertrag | `core/contracts/user-data.schema.json` um `alerts` ergänzt |
| Migrationsreihenfolge | `20261028000100` nach allen Migrationen aus #926; `apply-migrations.mjs` spielt sie mit ein |

**Nachweise** (`supabase/tests/08_watchlist_personal.sql`, `workers/vu-account/tests/flows.test.mjs`):

- Ein zweiter Nutzer sieht fremde Einträge nicht, kann sie nicht ändern oder entfernen und keine fremde Liste befüllen. Mit
  untergeschobener `user_id` scheitert das Einfügen.
- Anonym gibt es weder Tabellen noch Funktionen.
- Doppeltes Merken ist idempotent.
- Ein Ticker als Kennung wird abgewiesen.
- Ungültige `alerts` werden abgewiesen, auch bei direktem `update`.
- Die Tarifgrenze greift serverseitig (HTTP 409).
- Schreiben braucht den CSRF-Kopf und eine erlaubte Herkunft.
- Nach einer Kontolöschung bleibt kein Eintrag zurück.

## 4. API (Worker `vu-account`)

| Route | Zweck |
|---|---|
| `GET /v1/watchlist` | Listen, Einträge (≤ 1.000), Grenzen des Tarifs; `Cache-Control: private, no-store` |
| `POST /v1/watchlist/items` | `{instrumentId, ticker?, listId?}` → `ADDED` (201) bzw. `ALREADY_PRESENT` (200) |
| `POST /v1/watchlist/items/remove` | `{instrumentId, listId?}` → `REMOVED` / `NOT_PRESENT` |
| `PATCH /v1/watchlist/items` | `{instrumentId, listId, note?, alerts?}` |
| `POST /v1/watchlist/import` | `{items:[{instrumentId, ticker}]}`: Übernahme der alten Browser-Watchlists in **einem** Datenbankaufruf (Workers Free: 50 Unteranfragen je Anfrage) |

Grenzen: 120 Schreibaufrufe pro Minute und Konto, Übernahme wie „sensitive“ (10 pro Stunde). Postgres-Meldungen werden auf stabile
Zustände abgebildet; nichts sonst aus der Datenbank erreicht den Browser.

## 5. Oberfläche

- **`/konto/watchlist/`**
  - Kennzahlen: beobachtet / Grenze, gültige Supertrader-Signale, neue 52W-Hochs, nahe Hoch, Volumen ≥ 2×, Prüfung offen.
  - Datenstand je Quelle.
  - Suche zum Hinzufügen (Tastatur).
  - Übernahme der alten Browser-Watchlists von Discover und Quant (nur auf Wunsch).
  - Suche, Filter, Sortierung (Relevanz, Signal, Unternehmen, Kürzel, hinzugefügt, Aktualität, je Faktor; **kein** Gesamtscore), Gruppierung nach Signal.
  - Je Zeile: Kurs mit Datum, Statuschips, sieben Faktorbalken, Entfernen.
  - Aufklappbare Details: Faktoren mit Stufe, Supertrader je Strategie mit Freigabestufe, Technik, Notiz, Benachrichtigungen (gespeichert, noch nicht versendet), Links in die Produktwelten.
  - Faktorverteilung und Begriffe stehen in einem aufklappbaren Erklärteil.
- **Lesezeichen im Aktienkopf** (`assets/watchlist-button.js`):
  - Eine eigenständige Datei. Sie hängt sich an den einheitlichen Kopf (`.vu-shead`); das Kürzel kommt aus der Adresse (`core/stock-context.js#parse`).
  - Umschalten ohne Neuladen, mit kurzer Rückmeldung. Abgemeldet: dezente Aufforderung zur Anmeldung.
  - Ohne Freigabe: kein Lesezeichen, keine Anfrage an die Konto-API. Geladen werden nur die Komponente und `/konto/config.js` (wenige KB, im Cache).
  - **Eingebunden in Fundamental und Hedgefonds:** dort steht eine Zeile in `index.html`. Hedgefonds zeigt es nur auf Seiten mit Kürzel, nicht auf CUSIP-Seiten.
  - **Vorbereitet als eigene Draft-PRs** (je eine Zeile, auf diesem Branch aufbauend, einzeln freizugeben):
    - Discover: `discover/index.html` (Discover-Gate: nur Discover-Pfade).
    - Supertrader: `stockKit()` in `supertrader/assets/supertrader.js` lädt die Komponente nach (Gate A: nur Supertrader-Pfade; keine Seite wird neu erzeugt).
    - Quant/Chartbild: `quant/index.html` ist byte-gesperrt (`docs/quant-recovery/v51/ui-protection.json`); der PR ändert die Sperrdatei und braucht deshalb deine ausdrückliche Freigabe.
    - Technical zeichnet den einheitlichen Kopf nicht und bekommt deshalb kein Lesezeichen.
- Hauptmenü, Dock und Chart-Designs sind unverändert. In der Konto-Unternavigation kam der Eintrag „Watchlist“ hinzu.

### Zusammenführung der lokalen „Beobachten“-Listen

Bisher merken sich Discover und Quant Aktien nur im Browser:

| Schlüssel | Format | Welt |
|---|---|---|
| `vu-discover-watchlist-v1` | Ticker-Liste | Discover und Screener |
| `vu.quant.watchlist.v1` | Ticker-Liste | Quant |
| `vu2.watchlist.selection.v1` | `{version: "1.0.0", tickers}` | Quant-Watchlist |

Die europäische Discover-Liste (`vu.core.europe.watchlist.v1`, `securityId`) wird nicht übernommen. Für europäische Listings gibt es
im Company Master noch keine `instrumentId`.

Ablauf nach der Anmeldung (`core/watchlist-view.js#legacyTickers`/`planMerge`, Seite `/konto/watchlist/`):

1. Die drei Schlüssel werden **nur gelesen**: Ticker im gültigen Format, ohne Dubletten, höchstens 500.
2. Jeder Ticker wird über `names.json` auf genau ein **aktives** Listing (`instrumentId`) aufgelöst. Mehrdeutige, delistete oder
   unbekannte Ticker werden genannt, aber nicht übernommen.
3. Bereits gespeicherte Titel werden übersprungen; die Zusammenführung ist eine Vereinigung über die `instrumentId`.
4. Erst auf Klick („Übernehmen“) gehen die Titel in **einem** Aufruf an `POST /v1/watchlist/import`. Die Tarifgrenze stoppt dort
   sauber, und die Meldung nennt die Zahl.
5. **Lokal wird nichts gelöscht oder geändert.** Die Produktwelten zeigen ihre lokalen Knöpfe weiter, bis ein eigener PR je Welt sie
   mit dem Konto koppelt (z. B. angemeldet: Konto-Lesezeichen statt lokalem Knopf; abgemeldet: lokaler Knopf wie heute).
6. Die Abfrage wiederholt sich, solange noch nicht übernommene Titel lokal stehen. Ausgeblendet bleibt sie erst, wenn nichts mehr
   offen ist.

### Währung

Maßgeblich ist der Kurs in der **Währung des Listings**; er wird ohne Umrechnung gezeigt. Eine Euro-Anzeige ist nur vorbereitet:
`core/watchlist-view.js#inEuro` rechnet mit dem EZB-Referenzkurs aus dem vorhandenen Datenlauf (`quant/data/market/fx/ecb/`, in
`meta.json#sources.fx`). Verwendet wird nur ein Kurs vom Kursdatum oder höchstens 5 Kalendertage davor; sonst gibt es keinen Euro-Wert.
In der Oberfläche ist sie **nicht eingeschaltet**. Später könnte sie über `user_settings.display_currency` als zweite Zeile („≈ … €“)
erscheinen.

## 6. Speicher, Last und Kosten

Gemessen mit `scripts/account/watchlist-load.mjs`, PostgreSQL 16 lokal, 10.000 Nutzer. Es sind reine Ausführungszeiten in der Datenbank
mit RLS als Rolle `authenticated`; Netz und Supabase-Overhead kommen dazu.

| Titel je Nutzer | Zeilen | Tabelle | Indizes | gesamt | je Titel | Liste lesen p50 / p95 | Merken p50 | Fan-out |
|---|---|---|---|---|---|---|---|---|
| 25 | 250.000 | 25,6 MB | 41,9 MB | **67,6 MB** | 283 B | 0,22 / 0,29 ms | 4,8 ms | 0,06 ms |
| 50 | 500.000 | 51,2 MB | 85,3 MB | **136,5 MB** | 286 B | 0,37 / 0,54 ms | 5,0 ms | 0,07 ms |
| 100 | 1.000.000 | 102,4 MB | 166,4 MB | **268,9 MB** | 282 B | 0,73 / 0,86 ms | 5,1 ms | 0,08 ms |
| 200 | 2.000.000 | 204,7 MB | 335,2 MB | **540,0 MB** | 283 B | 1,36 / 1,74 ms | 4,7 ms | 0,11 ms |

**Einordnung:**

- **Supabase Free** hat 500 MB Datenbank. Mit der Free-Grenze von 20 Titeln belegen 10.000 Nutzer höchstens rund 55 MB.
  - Eine realistische Mischung: 85 % Free mit Ø 12 Titeln, 12 % Plus mit Ø 40, 3 % Pro mit Ø 120.
  - Das sind rund 190.000 Zeilen, also etwa 54 MB.
  - Erst Ø 100 Titel für alle 10.000 Nutzer verlangt **Supabase Pro** (8 GB enthalten, ca. 25 $/Monat, für Produktion ohnehin vorgesehen).
- **Antwort `GET /v1/watchlist`:** 200 Titel ≈ 34 KB JSON. Das sind 3 Unteranfragen an Supabase (Listen, Einträge, Tarif).
  - In der Simulation dauert das im Median 32 ms, mit psql-Prozessstart je Abfrage.
  - Die CPU im Worker liegt deutlich unter dem 10-ms-Limit von Workers Free, weil der Worker fast nur wartet.
- **Cloudflare Workers Free** erlaubt 100.000 Anfragen pro Tag. Das Lesezeichen merkt sich den Status 5 Minuten je Tab (`sessionStorage`).
  - Rechnung: 10.000 aktive Nutzer × (2 Watchlist-Aufrufe + ≈ 3 frische Aktienseiten) ≈ 50.000 Anfragen pro Tag.
  - Darüber reicht **Workers Paid** (5 $/Monat für 10 Mio. Anfragen).
- **Gemeinsame Übersicht über CDN**, für alle Nutzer gleich:
  - `meta.json` 2 KB gzip.
  - Je Scherbe Median 0,9 KB gzip, höchstens 4,5 KB.
  - `names.json` 149 KB gzip, nur bei Suche oder Übernahme.
  - Eine Liste mit 25 Titeln lädt rund 22 KB statt 347 KB für die ungeteilte Datei.
  - Bei 10.000 Nutzern und 30 Aufrufen im Monat sind das etwa 6,6 GB gegenüber 104 GB ungeteilt, also innerhalb des GitHub-Pages-Rahmens.
- **Keine Neuberechnung je Nutzer:** Die Übersicht entsteht einmal je Release in 0,7 s. Der Browser wertet nur aus, was angezeigt wird.

### Gesamter Kontobestand (10.000 Konten nach einem Jahr)

Gemessen mit `node scripts/account/watchlist-load.mjs --scenario=accounts`, PostgreSQL mit allen Migrationen.

Annahmen:

- 15 % zahlend, je zur Hälfte monatlich und jährlich, mit je 6 Zahlungsereignissen pro Rechnung.
- Watchlist-Mischung: 85 % Free mit Ø 12 Titeln, 12 % Plus mit Ø 40, 3 % Pro mit Ø 120.
- 1 % Kündigungen.

| Tabelle (inkl. Indizes) | Zeilen | Größe |
|---|---|---|
| `watchlist_items` | 184.640 | 47,8 MB |
| `billing.payment_events` | 60.018 | 16,2 MB |
| `invoices` | 10.003 | 4,8 MB |
| `watchlists` | 10.000 | 2,0 MB |
| `user_settings`, `profiles`, `user_roles` | je 10.000 | 3,7 MB |
| `subscriptions`, `billing.customers` | je 1.500 | 1,0 MB |
| **Kontodaten gesamt** (public, billing) | | **76,0 MB** |
| Datenbank inkl. Katalog | | 86,8 MB |
| Supabase Auth (Schätzung, nicht gemessen) | | **ca. 30–90 MB** |

Der Wert für Supabase Auth ist eine Schätzung: `auth.users` und Identitäten mit Indizes etwa 2–4 KB je Konto, also 20–40 MB. Dazu
kommen Sitzungen, Erneuerungstoken und Audit-Log mit etwa 10–50 MB pro Jahr; das Audit-Log lässt sich kürzen. Die echte Zahl liefert
der erste Integrationstest (§10).

**Summe:** etwa 120–180 MB nach einem Jahr. Supabase Free (500 MB) reicht. Für Produktion ist Supabase Pro trotzdem vorgesehen
(Backups, kein Pausieren nach einer Woche ohne Zugriff).

### Datentransfer und Limits

| Grenze | Rechnung (10.000 Konten, davon 30 % täglich aktiv) | Ergebnis |
|---|---|---|
| Cloudflare Workers Free: 100.000 Anfragen/Tag, 10 ms CPU, 50 Unteranfragen | 3.000 × ≈ 5 Konto-Aufrufe = 15.000/Tag; `GET /v1/watchlist` braucht 3 Unteranfragen; CPU wenige ms | Free reicht. Erst wenn **alle** 10.000 täglich aktiv sind: ≈ 50.000/Tag, weiter unter der Grenze |
| Supabase Free Egress: 5 GB/Monat | ≈ 5 KB je Konto-Aufruf (Einträge, Listen, Tarif) × 15.000/Tag × 30 | ≈ 2,3 GB/Monat. Bei 10.000 täglich Aktiven ≈ 7,5 GB → Pro (250 GB) |
| Supabase Free Auth: 50.000 aktive Nutzer/Monat | 10.000 | reicht |
| GitHub Pages: 100 GB/Monat (weiche Grenze) | gemeinsame Übersicht ≈ 22 KB je Watchlist-Aufruf × 3.000 × 2 × 30 | ≈ 4 GB/Monat |
| Antwortgröße | `GET /v1/watchlist` mit 200 Titeln ≈ 34 KB, typisch (18 Titel) ≈ 3–4 KB | |

## 7. Spätere intelligente Watchlist (vorbereitet, nichts aktiviert)

`core/watchlist-view.js#events(vorher, nachher)` vergleicht zwei veröffentlichte Übersichten, also die Ergebnisse der bestehenden
Datenläufe. Es arbeitet deterministisch, je Instrument einmal und nicht je Nutzer, mit idempotenter `eventId` im Format
`core/contracts/events.schema.json`.

| Ereignis | Regel |
|---|---|
| `PRICE_EVENT/NEW_52W_HIGH` | neues Hoch bei aktuellem Stand, vorher keins |
| `PRICE_EVENT/VOLUME_SPIKE` | relatives Volumen ≥ 2, vorher nicht |
| `SUPERTRADER_SIGNAL/VALID_SIGNAL` | erstmals gültige Eignung (freigegebene Strategie, handelbarer Zustand) |
| `QUANT_CHANGE/FACTOR_BAND_UP·DOWN` | ein Faktor springt um mindestens zwei Stufen |
| `QUANT_CHANGE/DATA_QUALITY_CHANGED` | `dataQuality` wechselt (PASS ↔ WARNING) |

Zustellung später: Ereignisse × `watchlist_items.alerts` × Tarif, über den Index `watchlist_items_instrument`. Es werden keine E-Mails
oder Pushes versendet, und kein kostenpflichtiger Dienst ist aktiviert. In der Oberfläche steht: „Gespeichert, aber noch nicht aktiv“.

## 8. Tests

| Suite | Inhalt |
|---|---|
| `supabase/tests/08_watchlist_personal.sql` | RLS zwischen zwei Nutzern, Idempotenz, Kennungsformat, Alerts, Tarifgrenze, anonym, Löschung, Fan-out-Index |
| `workers/vu-account/tests/flows.test.mjs` | API Ende-zu-Ende mit zwei isolierten Konten, CSRF/Herkunft, Grenze 409, Export, Löschung; Pro mit 200 Titeln (Übernahme, Antwortzeit) |
| `core/tests/watchlist-view.test.mjs` | echte Artefakte: kein Gesamtscore, Supertrader nur Forschung ohne Freigabe; veraltete Stände; zwei Listings (BGC); Delisting; Währungskonflikt; fehlende Quellen; Ereignisse; Teilauslieferung = Gesamtansicht |
| `core/tests/watchlist-button.test.mjs` | Lesezeichen: ohne Freigabe nichts laden; nur eindeutig aktives Listing; keine HTML-Strings; gesperrte Dateien unberührt |
| `konto/tests/konto.test.mjs` | Seitenstruktur, kein `innerHTML`, kein Gesamtscore im Browser, Unternavigation |
| `scripts/account/watchlist-qa.mjs` | Browser (Chromium und WebKit/iPhone, hell/dunkel): Übernahme, Suche, Kennzahlen, Details, Notiz, Alerts, Filter/Sortierung/Gruppen, Entfernen, Lesezeichen angemeldet/abgemeldet/ohne Freigabe |
| `scripts/account/watchlist-load.mjs` | Speicher und Abfragezeiten (CI: 1.000 Nutzer; Bericht: 10.000) |

## 9. Offen

| Punkt | Wer |
|---|---|
| Live-Freigabe wie bei #926 (Konten, Supabase-Projekt, Endpunkt in `konto/config.js`); #926 muss zuerst gemergt werden | Owner |
| Lesezeichen in Discover, Supertrader und Quant/Chartbild: vorbereitete Draft-PRs freigeben (Quant nur mit Freigabe der UI-Sperrdatei) | Owner |
| Lokale „Beobachten“-Knöpfe in Discover und Quant (`vu-discover-watchlist-v1`, `vu.quant.watchlist.v1`) ersetzen bzw. mit dem Konto koppeln, sobald Konten live sind (Discover-Gate, eigener PR je Produkt) | eigene PRs |
| Benachrichtigungen versenden (Event-Generator als Schritt der Datenläufe, Zustellung, Abmeldelinks) | späterer Meilenstein |
| Euro-Anzeige einschalten (vorbereitet, `inEuro`), Listing-Währung bleibt maßgeblich | Owner-Entscheidung |

## 10. Erster echter Supabase-Integrationstest (nach den Zugängen aus DEV_ENVIRONMENT.md)

1. **Vorbereitung:** #926 und #945 bleiben Draft. Den Workflow „Konten — Entwicklungsumgebung einrichten“ vom Watchlist-Branch
   starten, Schritt `supabase`, zuerst als Probelauf. Die Liste der offenen Migrationen muss `20261028000100_watchlist_personal.sql`
   enthalten.
2. **Einspielen:** Denselben Schritt ohne Probelauf ausführen; danach Schritt `pruefen`.
3. **Worker ausrollen:** Workflow „vu-account ausrollen (Entwicklung)“ vom Watchlist-Branch.
4. **Kontrolle in Supabase:**
   - **Table Editor:** `watchlist_items` hat die Spalte `alerts`.
   - **Database → Indexes:** `watchlist_items_user_added` und `watchlist_items_instrument` sind vorhanden.
   - **Advisors:** keine RLS-Warnung zu `watchlist_*`.
5. **Zwei Testkonten** aus der Positivliste anlegen (A, B), auf einem Entwicklungs-Branch mit Endpunkt in `konto/config.js`
   (DEV_ENVIRONMENT W3):
   - A merkt drei Titel (Suche, Lesezeichen auf Fundamental, Übernahme lokaler Listen).
   - B ruft `GET /v1/watchlist` auf und sieht nichts von A.
   - B scheitert mit `PATCH`/`remove` auf A-Kennungen.
6. **Grenze:** A übernimmt 25 Titel. Die Antwort meldet `limitReached`, die Datenbank hat 20 Einträge.
7. **Löschung:** A löscht das Konto; danach steht kein `watchlist_items`-Eintrag mehr mit A-`user_id`.
8. **Messen:** In Supabase (**Reports → Database**) Größe und Abfragezeit aufzeichnen, `auth`-Schema-Größe notieren und §6
   (Schätzung Supabase Auth) durch die echte Zahl ersetzen.
9. **Aufräumen:** Testkonten löschen. Den Endpunkt in `konto/config.js` nur auf dem Entwicklungs-Branch setzen, nie auf `main`.
