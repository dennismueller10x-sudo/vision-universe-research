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
| Rahmen (Kopf, Menü „Dein Universe“, Dock, Dunkel als Standard, Lader `data-vu-stock`) | PR #2015 |
| Home `/willkommen/` | PR #2015 |
| Aktie `/aktie/#/<T>` + Vorschau `assets/vu-stock-sheet.js` | PR #2015 |
| Discover-Start `/discover/` | in Arbeit (15.11.) |
| Quant-Start `/quant/` | in Arbeit (15.11.) |
| Supertrader, News, Ich, Technical, Fundamental, Hedgefonds, Screener | offen, je nach AUFTRAG.md |
| Module ohne Prototyp-Bildschirm (Elliott, Vorsorge/Portfolios, Konto, Atlas) | offen: im Design des Prototyps |

Schalter des Rahmens für Seiten: `<html data-vu-bleed>` (Kopf durchsichtig über dem ersten Block), `<html data-vu-tabs="inhalt">`
(Seite zeigt ihre Reiter selbst); API `VUNavigation.rahmen/datenstand/hinweis`. Aktien-Elemente tragen `data-vu-stock="<T>"`,
`data-vu-stock-name` und ein `href`.

## Bekannte Lücken (aus den Abschlussberichten)
- Home: Fundamental, Hedgefonds, Screener ohne Zahl (keine kleine Zusammenfassungsdatei); DAX fehlt in den Daten (Euro Stoxx).
- Aktie: keine Investorenzeilen im Fenster Hedgefonds, kein Branchen-Rang in Fundamental, kein „Melden, wenn …“; Europa ohne Seite.
- Rahmen: Zähler in den Menü-Kacheln fehlen (keine echte Quelle); 1981 `supertrader/stock/*` bis zum nächsten Lauf mit altem Inline-Skript.

## Website (www.visionuniverse.de)
Vorschau `/website2/` ist auf research live. Der www-Umzug ist vorbereitet, aber nicht gemergt: Commit `f514338586`
(lokaler Zweig `website2-work`, im Verlauf des Arbeitszweigs enthalten; Merge-Commit `e89951f53f`, Revert `3b755a93fb`).
Wartet auf: Owner-Wahl der Hero-Variante (A–E, Empfehlung A) und Owner-Freigabe für www. Vor dem Umzug klären:
Newsletter-Formular öffnet sofort, Datenschutztext nennt „Coming-soon-Seite“, Store-Badges prüfen.
