# Elliott als eigenes Produkt – Informationsarchitektur

**Stand:** 12. Oktober 2026 · Index `elliott-home-1.0.0` · Elliott-Engine 3.2.2 und Projection Engine 1.3.0 **unverändert** (reine Produktschicht, kein Methodikwechsel).
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
| **Aktie im Elliott-Bild (stabiler Deep Link)** | `/quant/#/elliott/<TICKER>[?ansicht=profi]` | Quant-SPA, wiederverwendet `page-chartbild.js` |
| Alias | `/elliott/#/<TICKER>` | `location.replace` auf den Deep Link |
| ALT `/quant/#/aktie/<T>/technik[?elliott=1]` | wird zu `#/elliott/<T>` (`?elliott=1` → `?ansicht=profi`) | `location.replace`, kein Verlaufseintrag |
| ALT `/quant/#/aktie/<T>/chartbild[?…]` | wird zu `#/elliott/<T>[?…]` | wie oben |
| ALT `/quant/?view=elliott&ticker=<T>` | `#/elliott/<T>?ansicht=profi` | `legacyRoute` |
| `/quant/#/elliott` (ohne Aktie) | `/elliott/` | Quant-SPA |
| Startseite der Plattform, Ask, Seite einer Aktie | zeigen auf `/elliott/` bzw. `#/elliott/<T>` | |

**Warum liegt das Aktienbild unter `/quant/`?** Das Chartbild braucht die komplette Quant-Datenschicht (rund 100 Skripte, im Release ein Bündel). Die Elliott-Startseite soll sofort erscheinen und darf dieses Bündel nicht laden. Deshalb: Startseite = eigene leichte Seite; Aktienbild = die vorhandene Implementierung, aber **für die gemeinsame Shell ein Elliott-Bild** (Leiste, Menü, Kopfzeile „← Elliott · Name · Aktie in Quant · Frag VU“). Das Chartbild wird nicht dupliziert. Spätere Option: das Chartbild als eigenes Bündel aus der Quant-SPA lösen und unter `/elliott/` hosten – dann ändert sich nur der Adresspräfix, nicht das Produktmodell.

Zurück-Taste: Startseite → Karte → Aktienbild ist ein Seitenwechsel; „Zurück“ führt zur Elliott-Startseite (Filter und Auswahl stehen im Hash, die Scrollposition merkt `elliott/app.js` selbst (anderes Dokument als das Aktienbild)). Altlinks werden per `location.replace` umgeleitet und erzeugen keinen Zwischenschritt.

## 4. Kundenreise

```
MENÜ → Elliott
  Elliott-Startseite  ── Suche „NVDA“ ──────────────┐
    │  Reihe „Welle-3-Lesarten“ → Karte ───────────┤
    │  Chip „Abwärts“ → Raster → Karte ────────────┤
    ▼                                               ▼
  [Zurück]  ◄──────────────  Aktie im Elliott-Bild (#/elliott/<T>)
                              Primär · Alternative · Explore Highlight · Projektionsleiter
                              Invalidierung · Fahrplan · Chart · Pro: Candidate Explorer · Evidenz
Aktienseite (Quant) → „Chartbild öffnen“/Kachel → Aktie im Elliott-Bild
Universal-Suche / Ask → Aktie → Elliott
Keine Lesart? → „Keine belastbare Elliott-Lesart“ (die Aktie bleibt sichtbar, mit Grund in der Fachansicht)
Zurückgehalten (STALE/NON_TRADING)? → bestehende Hinweisseite der Datenstand-Richtlinie
```

## 5. Datenfluss

```
scripts/technical/build-technical-intelligence.mjs   (Erzeuger, unverändert; Workflow technical-intelligence-build.yml)
   └─ quant/data/technical-intelligence/v3/{index.json.gz, shards/*.json.gz, meta.json}   (committet, eigener Erzeuger)
          │
          ▼  scripts/vu2/build-release.mjs  →  scripts/technical/elliott-home/home.mjs
   Auslieferung: quant/data/technical-intelligence/v3/elliott-home.json      (nur im Release, nie committet)
          │   ≈ 80 KB roh · ≈ 14 KB gzip · 186 Lesarten (Stand 09.10.2026)
          ▼
   /elliott/  (elliott/app.js + engine/home-model.js)  — eine Datenanfrage; Namen für die Suche erst beim Fokussieren
```

Warum Auslieferungsansicht und kein neues committetes Artefakt: Dateien unter `quant/data` gehören ihrem Erzeuger; ein PR, der sie mitbringt, lässt Datenläufe kollidieren (CLAUDE.md). Die Startseitenansicht ist eine reine Funktion der veröffentlichten Shards (wie `technical-signals-v1/by-ticker`), wird bei jedem Release deterministisch neu gebildet und kann nicht von den Shards abweichen. Der Erzeuger-Fingerabdruck des TI-Builds (`scripts/technical/lib`, Build-Skript) bleibt unberührt; der Code liegt deshalb in `scripts/technical/elliott-home/` und löst keinen 55-Minuten-Neulauf aus. Fehlt die Datei (lokal, Ausfall), zeigt die Seite „nicht verfügbar“; die Suche und jede Aktie funktionieren weiter.

Lokal: `node scripts/technical/elliott-home/build.mjs --out /tmp/elliott-home.json`.

### Vertrag `elliott-home-1.0.0` (`vu-elliott-home-1.0.0`)

`{schemaVersion, version, source{api,bundle,elliott,projection,freshness,indexGeneratedAt}, dataAsOf, summary{theses,securities,bullish,bearish,confirmed,developing,wave3,wave5,waveC,delayed,recent}, filters, rows[{id,title,rule,total,ids[≤24]}], cards[…]}`

Karte: `id, t, n, cur, role, type, wave, dir, st, pattern, close, tiers{base|ext|xtr:[pctLow,pctHigh]}, inv{p,dir}, fr, last, pool{pos,size}, gate[], ctx{trend,rs,ms}, agree, chg{k,d}`. Prozentwerte sind Bruchteile des aktuellen Kurses. Eine fremde `version` wird von der Seite nicht angezeigt.

### Auswahlregeln (alle aus dem Produkt übernommen)

1. **Welche Thesen der Kunde sieht:** `displayedTheses()` aus `ti-projection.mjs` – Primär, Alternative, Hochpotenzial nur bei `consumerVisible`; Motiv-Alternative und Explore Highlights eigenständig; **Candidate Explorer nie**.
2. **Datenstand (`data-freshness-1.0.0`):** nur `FRESH` und `DELAYED`. Zurückgehaltene Titel tragen im Shard keine Projektion. `DELAYED` zeigt die bestehende Warnung „Kursdaten verzögert · letzter Stand …“.
3. **Wertpapierart:** nur Titel des Produktuniversums des Builds (Index-Zeile) mit Namenseintrag der Art `COMMON_STOCK` und ohne Identitätskonflikt (`ic`) in der Universumsliste – keine Vorzugsaktien, ETFs oder Anleihen. Unbekannte Thesenstatus (außer CONFIRMED/DEVELOPING) werden nicht gezeigt. Keine eigene Eignungslogik.
4. **Kein Treffer ohne offene Zone:** Thesen, deren Zonen alle durchlaufen (`PASSED`) sind oder gegen die Thesenrichtung liegen, sind keine Entdeckung. Enthält eine Zone den Kurs, zeigt die Karte nur den Teil in Thesenrichtung; der Chart zeigt die volle Zone.
5. **Reihenfolge:** Rolle (Primär → Alternative → Motiv-Alternative → Highlight), bestätigt vor im Aufbau, Rang im Kandidatenpool, Kontext (Trend und Marktstruktur in Thesenrichtung; Relative Stärke bewusst nicht), Kürzel. **Nie nach Projektionsgröße, nie Zukunftsdaten.**

## 6. Startseite

Hero (Name, Satz, Suche, vier Kennzahlen als Filter, Datenstand, aufklappbar „Wie ist das gemeint?“) → Filterchips (Alle · Welle 3/5/C · Aufwärts/Abwärts · Bestätigt/Im Aufbau · Primär/Alternative/Highlight; nur Chips mit Treffern) → Reihen (horizontal, Scroll-Snap; ab der dritten Reihe erst beim Annähern gebaut) → Links zu Screener und Quant. Bei aktivem Filter ersetzt ein Raster (24, „Mehr anzeigen“) die Reihen.

Reihen sind **datenabhängig**: `wave3`, `wave5`, `waveC`, `recent`, `bullish`, `bearish`, `engine`; Reihen mit weniger als 3 Karten entfallen (Welle 5 hat im Stand 09.10.2026 genau 1 Lesart und ist als Chip erreichbar, mit ehrlichem Hinweis statt einer erfundenen Reihe). „Neu und verändert“ nutzt den Lebenszyklus der Thesen im Shard (Fenster 2 Tage ab Datenstand), nicht das Register.

Karte: Rolle (nie ein Highlight als Primärlesart), Name, Kürzel · Kurs, Welle · Richtung, **eine** große Projektionszone (Erweitert, sonst Basis, sonst Extrem) mit den übrigen Stufen klein, Status · Trend, Verzögerungshinweis, „Analyse öffnen →“. Details gehören ins Aktienbild.

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

* Aktienbild-Adresse beginnt mit `/quant/` (siehe Abschnitt 3).
* Keine Beobachtungsliste auf den Karten (Watchlist-Umbau war ausdrücklich nicht Teil der Aufgabe).
* Kein Screener-Deep-Link auf „Welle 3“: der Screener hat kein Welle-3-Feld; es gibt nur einen allgemeinen Link.
* Die Quant-Menüeinträge „Technische Analyse“ und „Fundamentaldaten“ öffnen weiter NVDA – Quant-Eigentum, nicht Teil dieser Änderung.
