# App-Konzept 2 – Übergabe (Stand 15.11.2026)

Wiederaufnahme in einer neuen Sitzung: diese Seite lesen, dann [AUFTRAG.md](AUFTRAG.md) (gemeinsamer Auftrag für jeden
Bildschirm), dann den Prototyp öffnen: `python3 -m http.server 8800 --directory docs/design/app-konzept-2-2026-11/prototyp`
→ `http://127.0.0.1:8800/#home` (Bildschirme `#home #discover #aktie #quant #supertrader #news #ich #technical #fundamental
#hedgefonds #screener`, Fenster per Tipp). Quellen des Prototyps: `prototyp/quelle/` (`node build.js` erzeugt `index.html`;
Pfade in `build.js` bei Bedarf anpassen).

## Owner-Vorgabe (wörtlich, 15.11.2026)
„Ich möchte es 1:1 wie im Prototyp umgesetzt. … das reine Frontend-Design, das muss 1:1 wie im Prototyp sein … Nur die Inhalte
natürlich … muss halt immer basierend auf unseren Originaldaten.“ Und: Dinge, die wir bisher angezeigt haben, werden weiterhin
angezeigt, aber im Design des Prototyps. Freigabe des Prototyps: 14.11.2026 („Genau so möchte ich die App jetzt umgesetzt haben“).

Lehre aus PR #1994–#2012: Diese PRs haben nur Farben, Schrift, Dock und Bausteine auf die alten Seiten gelegt („im Stil von“).
Das war falsch. Maßstab ist jetzt je Bildschirm das Vergleichsbild Prototyp | Umsetzung, das der Owner vor dem Live-Gang sieht.

## Entscheidungen des Owners
- Tagesbewegung als Pille rot bei Minus, neongrün bei Plus (nicht neutral wie im Prototyp).
- Discover-Kapitel öffnen als Fenster (PR #2014). Discover-Chart der alten Aktienseite 228 px. „Signal“ in Konto-Texten ersetzt (#2014).
- Zurückgestellt, nicht bauen: Tagesrunde, Serie, Quiz, Stufen/Abzeichen, Community, Analysten, ETF, Makro, Status, älteres Dashboard.
- Offen beim Owner: Elliott-Balken „Kurs gegen Ungültig-Marke“ (Empfehlung Wochenschluss); Rechtstext „Supertrader-Signale“ in
  `workers/vu-account/src/legal/texts.mjs` (Rechtstext, braucht Freigabe); ob es die Benachrichtigung „Supertrader“ geben soll.

## Stand je Bildschirm
| Bildschirm | Stand |
|---|---|
| Rahmen (Kopf, Menü „Dein Universe“, Dock, Dunkel als Standard, Lader `data-vu-stock`) | live (#2015) |
| Home `/willkommen/` | live (#2015) |
| Aktie `/aktie/#/<T>` + Vorschau `assets/vu-stock-sheet.js` | live (#2015) |
| Discover-Start `/discover/` | gebaut und geprüft, Vergleichsbilder dem Owner gezeigt (15.11.); Merge nach Owner-Freigabe der Bilder |
| Quant-Start `/quant/` | gebaut und geprüft, Vergleichsbilder dem Owner gezeigt (15.11.); Merge nach Owner-Freigabe der Bilder. Linie der Marktlage erscheint nach dem nächsten Marktlage-Lauf (neues Feld `history`) |
| Fundamental-Start `/fundamental/` | gebaut (Zweig `ak2-fundamental`): Reiter im Inhalt, Meldewoche aus der SEC-Historie (`status.json` Feld `week`, `build-history.mjs#filingWeek`) statt kommender Termine (kein Terminkalender in den Daten), Höchste Margen, Checklisten-Ring = Anteil der Firmen mit allen Punkten; „Schätz mal“ (Quiz) und Reiter „Termine“ entfallen |
| Supertrader, News, Ich, Technical, Hedgefonds, Screener | offen, je nach AUFTRAG.md |
| Module ohne Prototyp-Bildschirm (Elliott, Vorsorge/Portfolios, Konto, Atlas) | offen: im Design des Prototyps |

Schalter des Rahmens für Seiten: `<html data-vu-bleed>` (Kopf durchsichtig über dem ersten Block), `<html data-vu-tabs="inhalt">`
(Seite zeigt ihre Reiter selbst); API `VUNavigation.rahmen/datenstand/hinweis`. Aktien-Elemente tragen `data-vu-stock="<T>"`,
`data-vu-stock-name` und ein `href`.

## Modul-Aktienseiten: gemeinsamer Teil (Klickentwurf, Owner-Freigabe 17.11.2026)
Owner 17.11.2026: Klickentwurf Modul-Aktienseiten freigegeben, „so umsetzen und live nehmen“. Umgesetzt ist der gemeinsame Teil;
die Inhalte der einzelnen Modulseiten bauen die Modul-Agenten darauf auf.

**Aktienseite `/aktie/#/<T>`.** Jede Kachel „Analyse aus N Modulen“ und die Discover-Zeile öffnen ihr Fenster von unten (X, daneben
tippen, Griff nach unten ziehen, Esc), unten „Im Modul … öffnen“. Ein Fenster gibt es nur für Module mit Daten zur Aktie.
**Modul-Kontext:** `/aktie/#/<T>/<modul>` (`quant`, `technical`, `fundamental`, `hedgefonds`, `elliott`, `supertrader`, auch
`discover`) öffnet nach dem Laden das Fenster dieses Moduls über der Aktienseite; Schließen ersetzt die Adresse durch `#/<T>`
(kein neuer Verlaufseintrag). `#/<T>` bleibt gültig; ein unbekanntes Modul öffnet nur die Seite. Die Vorschau
(`assets/vu-stock-sheet.js`) hängt den Kontext an „Ganz öffnen“ an, wenn sie in einem dieser sechs Module geöffnet wurde
(Zuordnung des Rahmens `VUNavigation.product()`); Home, Discover, Suche, News, Ich und KI geben keinen Kontext – Discover ist
der Einstieg der Aktienseite.

**Gleiche Aussagen (Entscheidung je Widerspruch, TTWO 13.11.2026).** Kein Modell und kein Score geändert, nur welche veröffentlichte
Aussage /aktie zeigt; die Regeln stehen als Abschrift in `VUStockSheet.model`, `products/aktie/tests/stock-sheet.test.mjs` (AK-12)
liest sie aus den Moduldateien und hält sie gleich.
- Technical („Abwärtstrend“ gegen „Aufwärtstrend intakt“): /aktie las die Marktstruktur der Watchlist-Übersicht (BEARISH), das Modul
  urteilt nach Kurs über SMA 50/200 (`technical/app.js#chartSummary`); /aktie liest jetzt den Technical-Stand je Aktie
  (`technical/data/stock/<Schlüssel>.json`, `trend[0..1]`) mit derselben Regel – Kachel, Fenster und „Kurs“ in drei Sätzen sagen das Wort des Moduls.
- Fundamental („Stark“ gegen „▼ Negativ / Wächst und macht Verlust“): /aktie zeigte nur die Wachstumsstufe, das Modul die schwächere
  Stufe aus Wachstum und Nettomarge (`fundamental/app.js#business`); /aktie übernimmt diese Regel samt Satz für Kachel, Fenster und „Geschäft“ in drei Sätzen.
- Elliott („Welle nach C“ gegen „Keine Zählung“): /aktie zeigte die Lesart der Übersicht auch ohne Anwendbarkeit, das Modul zählt nur
  bei Einstufung „Heute anwendbar“; /aktie liest den Wellen-Index (`elliott-home.json`, `applicable.rows`) und sagt sonst „Keine Zählung“.
- Supertrader (fehlte, Modul 1/13): /aktie las die alte Signalliste der Übersicht, das Modul die 13 Methoden aus
  `supertrader/data/sf-candidates/ticker/`; /aktie liest jetzt dieselbe Datei (Stufenwörter der Seite + „laut Methode“), und der
  Verfügbarkeits-Ausschnitt (`scripts/core/stock-availability.mjs`) belegt Supertrader auch für Kürzel mit Eintrag dort und Seite.
- Discover („Geschäft: Stark“ gegen „Negativ“): die Story-Kachel „Geschäft“ der Discover-Aktienseite folgt seit Stufe 2 dem
  Fundamental-Urteil (`discover/ui/overview.js#businessVerdict`, Abschrift von `fundamental/app.js#business`, Test OV15), Satz
  „Wächst und macht Verlust.“ vor Discovers Umsatzsatz. Offen: das Discover-Fenster auf /aktie (`VUStockSheet` `mod.discover.story.business`)
  liest noch die Wachstumsstufe. „In drei Sätzen“ folgt den Themen-Modulen.

**Discover-Aktienseite (Stufe 2, Klickentwurf #modul-discover).** Ohne Reiterzeile des Rahmens (`data-vu-tabs="inhalt"` nur auf `#/s/…`);
Kurs 52 px mit Tagespille, darunter Stand und „▼ −5,2 % seit …“ (Zeitraum), unter den Zeitraum-Knöpfen Pillen Euro/Hoch/Tief 12 Monate
(aus der gezeichneten Tagesreihe), Platzierung als Karte mit Ring, Story-Kacheln, Kapitel als eine Karte mit Nummern, „Steht in N Reihen“,
„Mehr wie <Kurzname>“, „Gleiches Thema“, „Alle Kennzahlen“ und „Daten & Methodik“ in einer Karte, dann „Diese Aktie in anderen Modulen“
(`others.place` in den Artikel) und der Kurshinweis.

**Gemeinsamer Modul-Aktienkopf** (`assets/stock-navigator.js#head`, Stil `assets/stock-navigator.css`, Klasse `vu-shead--k2`):
Zurück-Pfeil → `/aktie/#/<T>`, Modul-Etikett, Logo 76 px, Kurzname (`shortName`), darunter Rest des Namens · Kürzel · Börse,
Herz (oder `o.actions` der Seite), Kurs 52 px mit Pille zum Vortag, Schlusskurs-Zeile. Keine Reiterleiste mehr; stattdessen
„Diese Aktie in anderen Modulen“ (`others`, Klasse `vu-sothers`) am Ende des `<main>` – nur Module mit Nachweis, dazu „Aktienseite“.
Alle sieben Modul-Aktienseiten bekommen beides über ihren bestehenden `VUStockNavigator.head`-Aufruf; Discover zeigt den alten Block
„Dieselbe Aktie in …“ dann nicht mehr. Für Modul-Agenten: `head(host, {ctx, current, name, exchange, price, actions, others})` liefert
`{el, setPrice, dispose, others: {el, place(parent, before)}}`; `others: false` schaltet die Pillen ab, `others.place(...)` setzt sie an
eine eigene Stelle (dann hält der Kopf sie nicht mehr am Seitenende). Klassen: `.vu-shead-top`, `.vu-shead-back`, `.vu-shead-mod`,
`.vu-shead-id`, `.vu-shead-logo`, `.vu-shead-name`, `.vu-shead-meta`, `.vu-shead-actions`, `.vu-shead-heart`, `.vu-shead-pricebox`,
`.vu-shead-row`, `.vu-shead-value`, `.vu-shead-change`, `.vu-shead-when`; `.vu-sothers-h`, `.vu-sothers-list`, `.vu-sothers-pill`
(`--aktie`). Die Dashboard-Aktienansicht nutzt weiter `mount` (alte Leiste).

**Quant (`/quant/#/aktie/<T>`, Stufe 2).** Wie `#modul-quant`: Das Profil (Netz, Balken absteigend, Stufen-Pillen ▲ ● ▼), Gesamtwert als Ring, „Quant in drei Sätzen“ als Schiene, Karte „Stärken und Schwächen“, Kursverlauf, sechs Kapitel als Zeilen einer Karte, „Weiter: Vergleich“ vor den Modul-Pillen (`quant/app/ui.js#nextCard`); Beobachten ist der runde Herz-Knopf, die Reiterzeile des Rahmens fehlt nur auf `#/aktie/<T>`. Desktop: Profil links, drei Sätze und Stärken/Schwächen rechts. Quant führt keine Börse; der Kopf zeigt sie erst, wenn eine Quelle sie liefert.
**Technical und Elliott (Stufe 2, Klickentwurf #modul-technical / #modul-elliott).** `/technical/#/chart/<T>` (auch `/signale`, `/studio`)
und `/elliott/#/<T>` (nicht `?ansicht=profi`) zeigen keine Reiterzeile des Rahmens (`data-vu-tabs="inhalt"`, schon im Kopf der index.html).
Technical: Chart-Seite als `main.tk.tk-ak` – Urteilskachel, „Chart erklären“, „Kursverlauf“, Ebenen-Chips (Zonen und 200-Tage-Linie zu Beginn an),
drei Sätze als Karussell (Ring zum RSI), Zonen-Karte, alle Befunde als Karten, „Verlauf der letzten 12 Monate“ (dieselbe `Formations.history`
wie das Kapitel, nach dem ersten Bild gerechnet), Kapitel-Liste mit Datenqualität, Pillen vor der Fußzeile; am Schreibtisch eine Spalte (760 px).
Elliott (`elliott/aktie.js` ordnet um, `elliott/wellen.css`): ohne Zählung Kachel mit Kurvenbild der Wochenschlüsse (gestrichelt die Zickzack-Linie
durch Hoch/Tief von sechs Abschnitten), Ring „N von M“ aus dem Satz der Seite, „Folgeschritte“, „Melden, wenn zählbar“ (VUPush, Art
ELLIOTT_CHANGE), Daten & Methodik mit „Zur Elliott-Übersicht“; mit Zählung drei Sätze als Karussell, der Balken „Kurs gegen Ungültig-Marke“
bleibt direkt danach. Hell ist auf beiden Seiten hell.

## Bekannte Lücken (aus den Abschlussberichten)
- Home: Fundamental, Hedgefonds, Screener ohne Zahl (keine kleine Zusammenfassungsdatei); DAX fehlt in den Daten (Euro Stoxx).
- Aktie: keine Investorenzeilen im Fenster Hedgefonds, kein Branchen-Rang in Fundamental, kein „Melden, wenn …“; Europa ohne Seite.
- Rahmen: Zähler in den Menü-Kacheln fehlen (keine echte Quelle); 1981 `supertrader/stock/*` bis zum nächsten Lauf mit altem Inline-Skript.

## Website (www.visionuniverse.de)
Vorschau `/website2/` ist auf research live. Der www-Umzug ist vorbereitet, aber nicht gemergt: Commit `f514338586`
(lokaler Zweig `website2-work`, im Verlauf des Arbeitszweigs enthalten; Merge-Commit `e89951f53f`, Revert `3b755a93fb`).
Wartet auf: Owner-Wahl der Hero-Variante (A–E, Empfehlung A) und Owner-Freigabe für www. Vor dem Umzug klären:
Newsletter-Formular öffnet sofort, Datenschutztext nennt „Coming-soon-Seite“, Store-Badges prüfen.

## Wiederaufnahme: genau diese Schritte (Stand 15.11.2026, 09:15 UTC)
1. **Erledigt 15.11.:** PR #2015 gemergt (Rahmen, Home, Aktie). Gelernt für weitere Bildschirme: die Browser-QAs prüfen genau eine
   `h1` je Seite (Menütitel ist `h2`), Tippflächen ≥ 44 px (Prototyp-Maße bleiben sichtbar, die Fläche wächst über transparenten Rand
   bzw. `margin-block:-4px`), dunklen Standard (`theme-color` `#08080a`) und das Anfrage-Budget je Ansicht (`scripts/vu2/resource-budget.mjs`).
2. **Discover- und Quant-Start** liegen fertig auf einem Zweig (Zwischenstände übernommen, geprüft, Ordner `zwischenstand/` gelöscht);
   Vergleichsbilder hat der Owner gesehen. Nach seiner Freigabe: PR bei Grün mergen.
3. **Weitere Bildschirme** je nach [AUFTRAG.md](AUFTRAG.md): Supertrader, News, Ich, Technical, Fundamental, Hedgefonds, Screener,
   dann Module ohne Prototyp-Bildschirm (Elliott, Vorsorge/Portfolios, Konto, Atlas) im Design des Prototyps.
   Je Bildschirm: bauen, Vergleichsbild, Owner zeigen, PR, bei Grün mergen.
4. **Vorschau-Links**: Aktien-Elemente auf allen Seiten bekommen `data-vu-stock` + `href` (öffnet `assets/vu-stock-sheet.js`);
   „Ansehen“/„Ganz öffnen“ führt auf `/aktie/#/<T>`.
5. **Website www** bleibt unverändert, bis der Owner Hero-Variante und Umzug freigibt (siehe Abschnitt Website).

Arbeitsweise, die sich bewährt hat: je Bildschirm ein Agent im eigenen Worktree (Auftrag = AUFTRAG.md + Bildschirm-Teil),
nie `git fetch` ohne `origin main`, Release-Bauten unter `/dev/shm`, eigene Ports, kein breites `pkill`; nur auf den
vorgegebenen Arbeitszweig pushen; kein Force-Push (nach einem Merge den Zweig lokal auf `origin/main` setzen und normal pushen).
