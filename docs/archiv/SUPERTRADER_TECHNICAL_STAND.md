# Supertrader-Aktienseite: Technischer Zustand derselben Aktie

Stand: 03.11.2026 · Modul `supertrader/assets/st-technical.js` (`st-technical-1.0.0`)

## Was die Seite zeigt

Unter dem Protokoll und vor „Daten & Methodik“ steht auf jeder Aktienseite (`/supertrader/stock/<T>/` und
`/supertrader/stock/?s=<T>`) der Abschnitt **„Technischer Zustand“**. Er hat die Kennzeichnung
„Technical · Research, kein Supertrader-Signal“. Der Abschnitt erscheint auch, wenn kein Supertrader-Modell die Aktie führt.

1. **Stand und Datenqualität**: Stichtag von Technical. Liegt der Supertrader-Stichtag auf einem anderen Tag,
   steht das daneben. Dazu die Hinweise aus Technical: Kurs unverändert seit …, Kurs vom …, ohne Volumen,
   Datenverdacht oder bestätigter Datenfehler (Kurssprung). Der lange Text steht als Hinweis darunter.
2. **Vorlagen und Analyseziele**: Vorlagen und Analyseziele, die die Aktie erfüllt oder fast erfüllt, mit
   „n/m“ erfüllten Kriterien. Jede Zeile verlinkt auf die Prüfleiste in Chart Studio (`?v=<Vorlage>` bzw.
   `?z=<Ziel>`). Unvollständige Einordnungen stehen in einer Zeile darunter. Ohne aktuellen Kurs gibt es keine
   Einordnung.
3. **Trend**: Marktstruktur, relative Stärke (Rang von 100) und vier Linienzustände des Tagescharts
   (✓ / ✕ / … unbekannt).
4. **Formationen**: Tag und Woche (Wochenformationen tragen die Marke „Woche“) mit Zustand und Satz aus Technical.
   Die ersten vier sind sichtbar, weitere stehen hinter einer Aufklappzeile.
5. Eine Zeile mit den Grenzen der Technical-Vorlagen, dazu ein Link „In Chart Studio öffnen“
   (`core/stock-context.js#href(ctx, "technical")`).

Supertrader rechnet daraus nichts. Kein Modell, kein Zustand und keine Signalliste ändert sich.

## Quelle

- `/technical/data/meta.json` (rund 9 KB): `stock.shards` nennt die veröffentlichten Scherben.
- `/technical/data/stock/<shardKey>.json`: Technical-Stand je Aktie, Scherbe nach `core/identity.js#shardKey`.
  Im Median wiegt eine Aktie 0,7 KB und eine Scherbe 8 KB. Die größte Scherbe hat 49 KB (komprimiert rund 5 KB).
  Erzeuger ist `scripts/technical/world/build-screener.mjs`, Vertrag in `docs/technical/STOCK_SUMMARY.md`.
- Eine Scherbe wird nur angefragt, wenn `meta.json` sie nennt. Vor der ersten Veröffentlichung oder für ein
  Kürzel ohne Scherbe gibt es keine Anfrage und keinen 404.

## Leerzustände

| Lage | Anzeige |
|---|---|
| Technical hat noch keine Scherben veröffentlicht | „Der Technical-Stand je Aktie ist noch nicht veröffentlicht …“ |
| Aktie nicht im Technical-Datensatz | „Technical führt zu T keinen Eintrag. Keine Angabe – das heißt nicht, dass nichts erkannt wurde.“ |
| Schema passt nicht, Scherbe einer anderen Aktie | „Der Technical-Stand ist gerade nicht lesbar. Keine Angabe.“ |
| Laden scheitert | Abschnitt entfällt, die Seite bleibt unberührt |

## Prüfung

- `scripts/supertrader/tests/st-technical.test.mjs`: Anzeigemodell aus einem Ausschnitt eines Erzeugerlaufs
  (`scripts/supertrader/tests/fixtures/technical-stock-sample.json`). Geprüft werden Scherbenwahl, Leerzustände,
  Links, eingefrorener Kurs, Kurssprung, Wochenformationen, keine Codes und keine Signalsprache.
- `scripts/supertrader/browser-qa.mjs --technical=<Ausgabe von build-screener.mjs --out>`: Routen `tech-lens`
  (mit Modell), `tech-nomodel`, `tech-frozen` und `tech-jump`, jeweils hell und dunkel, bei 390 px und 1280 px.
  Geprüft werden der Zustand passend zum Datenstand, die Kennzeichnung, die Links nach Chart Studio, keine internen
  Codes, höchstens eine Scherbenanfrage, ohne Veröffentlichung keine Anfrage, kein Überlauf und keine Konsolenfehler.

## Offen: gemeinsame Zustandsnamen (Lücke 3)

Die Oberfläche und die Daten benennen Zustände unterschiedlich:

| Zustand | Daten (`registry-core.json` → `lifecycle.labels`, aus `scripts/supertrader/engine/lifecycle.mjs`) | Oberfläche (`supertrader.js` → `PHASE`) |
|---|---|---|
| `SETUP` | Einstieg vorbereitet | Vorbereitet |
| `ENTRY_READY` | Einstieg vorbereitet · nahe Trigger | Vorbereitet · nahe Trigger |
| `WARNING` | Warnung | Position · Warnung |
| `PARTIAL`, `RETIRED`, `REASSESSED` | – | Teiltreffer, Regelwechsel |

Chart Studio (#1275, `technical/engine/world-context.js`) liest heute die Datennamen. Eine einzige Quelle wäre ein
UMD-Modul `supertrader/assets/st-labels.js` mit `PHASE` und der Abstufung aus `badgeFor`, also Modellbeobachtung
und Beobachtungsliste. Das ist nicht klein. Die Aktienseiten unter `supertrader/stock/` erzeugt `build.mjs`, der
Skript-Tag müsste also in den Seitenbau. Zusätzlich müsste `supertrader.js` seinen Start auf ein weiteres Skript
umstellen. Deshalb nicht in diesem PR. Vorschlag: eigener Supertrader-PR. Danach lädt Chart Studio
`/supertrader/assets/st-labels.js`, statt `lifecycle.labels` zu lesen.
