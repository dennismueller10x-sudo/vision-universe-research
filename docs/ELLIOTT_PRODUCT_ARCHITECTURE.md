# Elliott als eigenes Produkt – Informationsarchitektur

**Stand:** 13. Oktober 2026 · Index `elliott-home-1.1.0` · native Route `/elliott/#/<TICKER>` · Elliott-Engine 3.2.2 und Projection Engine 1.3.0 **unverändert** (reine Produktschicht, kein Methodikwechsel).
Einstieg der Plattform: [VISION_UNIVERSE_ARCHITECTURE.md](VISION_UNIVERSE_ARCHITECTURE.md). Fachliche Grundlagen: [technical-intelligence/](technical-intelligence/).

## 1. Entscheidung

Elliott war ein Menüpunkt unter Quant, der fest auf NVDA zeigte. Es ist jetzt ein **Produkt** wie Discover, Quant, Screener und Supertrader: eigener Menüpunkt auf Produktebene, eigenes Symbol, eigene Startseite, eigene Suche, eigene Adressen.

* Name: **Elliott** (Vision-Universe-Marke bleibt, keine Unter-Marke).
* Frage der Startseite: *Was sieht Elliott gerade?* – nicht „Wähle zuerst eine Aktie“.
* Abgrenzung: **Quant** = quantitative Attraktivität, Faktoren, Rankings. **Elliott** = strukturelle Wellenszenarien und Projektionen.

## 2. Navigation alt → neu

| | alt | neu |
|---|---|---|
| Menü (Konto/Burger) | `Quant ▸ Elliott Wave` → `/quant/#/aktie/NVDA/chartbild?ansicht=profi` | eigene Gruppe **Elliott** neben Quant: Übersicht · Welle 3 · Aufwärts · Abwärts · Neu und verändert · Suchen |
| Produkt-Leiste (Dock) | kein Elliott | `[Elliott] [Welle 3] [Neu] [Suche] [☰]` (Regel: Produktname zuerst, vier Einträge + Menü) |
| Kopf (Direktzugriff) | Dashboard · Screener · News · Quant · Vorsorge | + **Elliott** |
| Quant-Menü | enthielt „Elliott Wave“ | enthält Elliott nicht mehr; „Technische Analyse“ und „Fundamentaldaten“ bleiben Quant |
| Symbol | – | das Originalsymbol „elliott“ der Startseiten-HUD-Familie (Wellenpfad mit Pivots, gestrichelte Basis), exakt in `assets/product-icons.svg` und im Dock eingebettet; kein Fremdsymbol |
| Aktiver Zustand | Quant | auf `/elliott/` und im Aktienbild `#/elliott/<T>` ist **genau ein** Produkt aktiv (Elliott); Quant erscheint dort nicht aktiv |

Alle Navigations-Entscheidungen leben weiter nur in `assets/site-navigation.js`. `PRODUCTS[].match(pathname, loc)` bekommt jetzt auch die Adresse, weil die Quant-SPA unter demselben Pfad `/quant/` zwei Produkte rendert; die Leiste baut sich bei einem Produktwechsel per `hashchange` neu auf (`reshape`).

## 3. Routen

| Zweck | Adresse | Wer rendert |
|---|---|---|
| Elliott-Startseite | `/elliott/` | `elliott/` (eigene kleine Seite, kein Quant-Bündel) |
| Filter (teilbar) | `/elliott/#/?welle=3&richtung=ab&status=bestaetigt&rolle=highlight&neu=1` | `elliott/app.js` |
| Suche öffnen | `/elliott/#/?suche=1` | `elliott/app.js` |
| **Aktie im Elliott-Bild (stabiler Deep Link)** | `/elliott/#/<TICKER>[?ansicht=profi]` | `elliott/app.js` (Host) lädt den Quant-Stack und mountet `page-chartbild.js` |
| ALT `/quant/#/elliott/<TICKER>[?…]` | wird zu `/elliott/#/<TICKER>[?…]` | Quant-SPA, `location.replace`, kein Verlaufseintrag |
| ALT `/quant/#/aktie/<T>/technik[?elliott=1]` | wird zu `/elliott/#/<T>` (`?elliott=1` → `?ansicht=profi`) | wie oben |
| ALT `/quant/#/aktie/<T>/chartbild[?…]` | wird zu `/elliott/#/<T>[?…]` | wie oben |
| ALT `/quant/?view=elliott&ticker=<T>` | `/elliott/#/<T>?ansicht=profi` | `legacyRoute` |
| `/quant/#/elliott` (ohne Aktie) | `/elliott/` | Quant-SPA |
| Startseite der Plattform, Ask, Seite einer Aktie, Discover, Karten, Suche | zeigen auf `/elliott/` bzw. `/elliott/#/<T>` | |

**Native Route und Gastbetrieb.** Die Adresse einer Aktie beginnt mit `/elliott/`. Das Chartbild selbst bleibt **eine** Implementierung (`quant/app/page-chartbild.js`, keine Kopie): `elliott/app.js` setzt `window.QX_HOST = "elliott"`, lädt beim Öffnen einer Aktie den vorhandenen Quant-Stack (die Skriptliste liest der Lader aus `/quant/index.html`; im Release ist das dasselbe gecachte Bündel `quant/release-bundle.js?v=<Hash>`) und ruft `QXApp.mountElliott(root, ticker, params)`. Im Gastbetrieb startet die Quant-SPA keinen eigenen Router und keine eigene Adressleiste; interne Quant-Links (`#/aktie/…`) werden auf `/quant/#/…` umgeschrieben. Die Startseite lädt das Bündel **nicht** (nur Absicht: Aufwärmen bei Zeiger-, Fokus- oder Touch-Annäherung an eine Karte; bei einem Deep Link auf eine Aktie entfällt der Start-Index). Die Quant-Stylesheets sind auf `.qd`/`body.dx` begrenzt; der Host setzt diese Klassen am `body`, deshalb sieht das Chartbild gleich aus.

**Verbleibende Quant-Abhängigkeit (bewusst):** Das Chartbild braucht die komplette Quant-Datenschicht und UI-Bibliothek (`QX`, `ctx`, Namen, Sprache, Projektionsleiter). Sie wird nur beim Öffnen einer Aktie geladen. Aus Kundensicht ist Quant nicht mehr sichtbar (Adresse, Leiste, Kopfzeile). Eine spätere Ablösung des Chartbilds als eigenes Bündel ändert weder Adressen noch Produktmodell. Die Dateien liegen weiter unter `quant/` (Eigentümer-Regel, Gates).

**URL-Zustand:** Aktie und Ansicht (`?ansicht=profi`) stehen in der Adresse und überstehen Neuladen und „Zurück“. Der Profi-Modus wird beim Umschalten in die Adresse geschrieben (`replaceState`) und zusätzlich als Vorliebe gemerkt; Filter der Startseite stehen im Hash der Startseite und kommen mit „Zurück“ wieder.

Zurück-Taste: Startseite → Karte → Aktienbild bleibt innerhalb **einer** Seite (`/elliott/`), der Hash wechselt; „Zurück“ führt zur Startseite mit demselben Filter. Altlinks werden per `location.replace` umgeleitet und erzeugen keinen Zwischenschritt. Die Leiste markiert im Aktienbild nur das Produkt Elliott (nie Quant).

Lokal: `node scripts/technical/elliott-home/build.mjs --out /tmp/elliott-home.json`.

### Vertrag `elliott-home-1.1.0` (`vu-elliott-home-1.1.0`)

`{schemaVersion, version, source{api,bundle,elliott,projection,freshness,indexGeneratedAt}, dataAsOf, summary{theses,securities,bullish,bearish,confirmed,developing,wave3,wave5,waveC,delayed,recent}, filters, rows[{id,kind,title,rule,cap,total,ids[alle, in Reihenfolge]}], cards[…]}`

Karte: `id, t, n, cur, role, type, wave, dir, st, pattern, close, tiers{base|ext|xtr:[pctLow,pctHigh]}, inv{p,dir}, fr, last, pool{pos,size}, gate[], ctx{trend,rs,ms}, agree, chg{k,d}`. Neu in 1.1.0: `rows[].kind` (`flagship`/`primary`/`secondary`), `rows[].cap`, vollständige `ids` je Reihe (die Seite zeigt `cap`), `ctx.rs` (Relative Stärke 26 W), Reihen `trend`, `strength`, `confirmed`, `span`, `bullHighlights`, `bearHighlights`, `waveC`. Prozentwerte sind Bruchteile des aktuellen Kurses. Eine fremde `version` wird von der Seite nicht angezeigt.

### Auswahlregeln (alle aus dem Produkt übernommen)

1. **Welche Thesen der Kunde sieht:** `displayedTheses()` aus `ti-projection.mjs` – Primär, Alternative, Hochpotenzial nur bei `consumerVisible`; Motiv-Alternative und Explore Highlights eigenständig; **Candidate Explorer nie**.
2. **Datenstand (`data-freshness-1.0.0`):** nur `FRESH` und `DELAYED`. Zurückgehaltene Titel tragen im Shard keine Projektion. `DELAYED` zeigt die bestehende Warnung „Kursdaten verzögert · letzter Stand …“.
3. **Wertpapierart:** nur Titel des Produktuniversums des Builds (Index-Zeile) mit Namenseintrag der Art `COMMON_STOCK` und ohne Identitätskonflikt (`ic`) in der Universumsliste – keine Vorzugsaktien, ETFs oder Anleihen. Unbekannte Thesenstatus (außer CONFIRMED/DEVELOPING) werden nicht gezeigt. Keine eigene Eignungslogik.
4. **Kein Treffer ohne offene Zone:** Thesen, deren Zonen alle durchlaufen (`PASSED`) sind oder gegen die Thesenrichtung liegen, sind keine Entdeckung. Enthält eine Zone den Kurs, zeigt die Karte nur den Teil in Thesenrichtung; der Chart zeigt die volle Zone.
5. **Premium-Reihen (Präsentation, kein neuer Score):** Flaggschiff „Top Welle 3“ ordnet bestätigt vor im Aufbau, dann Kontext in Thesenrichtung (Trend und Marktstruktur), Rang im Kandidatenpool, Relative Stärke, Kürzel – **nie nach Projektionsgröße**. Die Reihe „Große Projektionsspanne“ ist zweitrangig und letzte Reihe: nur `FRESH`, nur Aufwärtslesarten, nur offene erweiterte Zone mit Obergrenze ≥ +200 %, ausdrücklich als rechnerische Spanne beschriftet, nicht als erwartete Rendite; sie sortiert nicht das Produkt.
6. **Reihenfolge der Index-Karten:** Rolle (Primär → Alternative → Motiv-Alternative → Highlight), bestätigt vor im Aufbau, Rang im Kandidatenpool, Kontext (Trend und Marktstruktur in Thesenrichtung; Relative Stärke bewusst nicht), Kürzel. **Nie nach Projektionsgröße, nie Zukunftsdaten.**

## 6. Startseite

Hero (Name, Leitsatz „Strukturelle Marktszenarien. Klare Projektionen. Transparente Invalidierung.“, Suche, vier Kennzahlen als Filter, Datenstand, aufklappbar „Wie ist das gemeint?“) → Filterchips (Alle · Welle 3/5/C · Aufwärts/Abwärts · Bestätigt/Im Aufbau · Primär/Alternative/Highlight; nur Chips mit Treffern) → Reihen (horizontal, Scroll-Snap; ab der dritten Reihe erst beim Annähern gebaut) → Links zu Screener und Quant. Bei aktivem Filter ersetzt ein Raster (24, „Mehr anzeigen“) die Reihen.

Reihen sind **datenabhängig** (Reihenfolge in `ROW_DEFS`): `wave3` (Flaggschiff), `confirmed`, `recent`, `trend`, `strength`, `bullHighlights`, `bearHighlights`, `wave5`, `waveC`, `engine`, `span` (zweitrangig); Reihen mit weniger als 3 Karten entfallen (Welle 5 hat im Stand 09.10.2026 genau 1 Lesart und ist als Chip erreichbar, mit ehrlichem Hinweis statt einer erfundenen Reihe). „Neu und verändert“ nutzt den Lebenszyklus der Thesen im Shard (Fenster 2 Tage ab Datenstand), nicht das Register.

Karte: Rolle (nie ein Highlight als Primärlesart), Name, Kürzel · Kurs, Welle · Richtung, **eine** große Projektionszone (Erweitert, sonst Basis, sonst Extrem) mit den übrigen Stufen klein, Status · Trend, Verzögerungshinweis, „Analyse öffnen →“. Details gehören ins Aktienbild.

### Messung (Release-Build, Chromium, Handy 430 px, 1,6 Mbit/s, CPU ×4, Median aus 5 Läufen, kalter Cache)

| | alt `/quant/#/elliott/NVDA` | neu `/elliott/#/NVDA` |
|---|---|---|
| Analyse fertig | 5,78 s | 6,06 s (+5 %) |
| erster Inhalt (FCP) | 752 ms | 436 ms |
| Anfragen / übertragen / davon JS | 20 / 936 KB / 470 KB | 30 / 974 KB / 503 KB |
| Neuladen (warmer Cache) | 1,11 s | 1,17 s |
| Startseite fertig / Anfragen / KB | 1,04 s / 9 / 51 KB | 1,07 s / 9 / 56 KB |
| Karte → Analyse / Zurück | 5,03 s / 0,36 s | 5,19 s / 0,18 s |

Mehrkosten kommen vom Elliott-Host (rund 33 KB JS) und der Lade-Kette `app.js → /quant/index.html → Bündel`; bei einem Deep Link startet `elliott/index.html` die Kette parallel zu `app.js`. Das Bündel bleibt dasselbe gecachte Release-Bündel. Die Startseite lädt es nicht.

## 7. Wiederverwendet / neu

Wiederverwendet: Chartbild (`page-chartbild.js`), Projektionsleiter, Explore Highlights, Candidate Explorer, Datenstand-Richtlinie, `displayedTheses`, Shell (Menü, Leiste, Theme), Designtokens `--vu-*`, Quant-Namensansicht für die Suche.
Neu: `elliott/` (Seite, Engine `home-model.js`, App, CSS), `scripts/technical/elliott-home/` (Index, CLI, Browser-QA), Route `#/elliott/<T>` + Umleitung, Kopfzeile und Leerzustand im Aktienbild, Navigationsgruppe, Tests `quant/tests/elliott-home.test.mjs`.

## 8. Zukunftspfad: Technical

Heute: **Elliott**. Später denkbar: ein Produkt **Technical** mit Linsen (Elliott, Volumen, Momentum/RSI, Marktstruktur, Wyckoff …). Vorbereitet, aber nicht gebaut:

* Der Index-Vertrag kennt „Karte + Rolle + Zonen + Datenstand + Detail-Adresse“; `wave`/`type` sind die einzigen Elliott-spezifischen Felder. Eine weitere Methode liefert Karten im selben Vertrag.
* `home-model.js` trennt Worte/Filter/Suche von der Methode; Reihen definiert der Erzeuger (`ROW_DEFS`), nicht die Seite.
* Navigation: `PRODUCTS`-Eintrag und Gruppe heißen `elliott`; die Umbenennung zu `technical` (Elliott als Linse) ist eine Konfigurationsänderung in `site-navigation.js` plus Adressalias `/elliott/` → `/technical/#/elliott`.
* Intern bleibt es Technical Intelligence (`v3`-Daten, `technical-intelligence-*`-Workflows); Kunden sehen „Elliott“.

## 9. Grenzen

* Das Chartbild lädt beim Öffnen einer Aktie den Quant-Stack (siehe Abschnitt 3, „Verbleibende Quant-Abhängigkeit“).
* Keine Beobachtungsliste auf den Karten (Watchlist-Umbau war ausdrücklich nicht Teil der Aufgabe).
* Kein Screener-Deep-Link auf „Welle 3“: der Screener hat kein Welle-3-Feld; es gibt nur einen allgemeinen Link.
* Die Quant-Menüeinträge „Technische Analyse“ und „Fundamentaldaten“ öffnen weiter NVDA – Quant-Eigentum, nicht Teil dieser Änderung.
