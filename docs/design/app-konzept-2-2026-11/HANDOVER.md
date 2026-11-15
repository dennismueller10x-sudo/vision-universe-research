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
| Discover-Start `/discover/` | Zwischenstand, ungeprüft: `zwischenstand/discover.patch` |
| Quant-Start `/quant/` | Zwischenstand, ungeprüft: `zwischenstand/quant.patch` |
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

## Wiederaufnahme: genau diese Schritte (Stand 15.11.2026, 09:15 UTC)
1. **PR #2015** (Rahmen, Home, Aktie, diese Übergabe) prüfen: ist `ci-gate` grün, squash-mergen (`scripts/ci/wait-gate.sh 2015`).
   Ist er rot: Ursache aus den Job-Logs beheben, pushen, warten, mergen. Danach auf research live im Browser ansehen.
   **Stand 09:17 UTC (Head b5e0ff8604):** rot waren `core` (behoben in 05d07c85c3: Rechtsfuß-Test zählte docs/ mit), `package`,
   `technical`, „Browser (Chromium und WebKit/iPhone)“, `vu2-browser-qa`, `discover-frontend`, `shell-shell` (webkit-390/430/1024,
   chromium-768). Die Browser-QAs liefen lokal nie vollständig; sehr wahrscheinlich erwarten sie noch den alten Kopf (Atlas-Knopf,
   Logo-Link, Reiterzeile) bzw. ein helles Schema (Dunkel ist jetzt Standard; der Rahmen nimmt `navigator.webdriver` aus, aber
   Skripte ohne gesetztes Schema sehen dunkel). Je Job die Logs lesen (`get_job_logs`, `failed_only`), Ursache beheben – QA an den
   neuen, vom Owner gewollten Kopf anpassen, nie Prüfungen löschen oder überspringen.
2. **Discover- und Quant-Start** aus den Zwischenständen holen. Beide Patches sind auf `main` von `c02583e6d8` erstellt
   (`git format-patch`), also: neuen Zweig von `main`, dann `git am docs/design/app-konzept-2-2026-11/zwischenstand/discover.patch`
   (bei Konflikten `git am -3`). Die Arbeit war **nicht fertig geprüft** (die Agenten liefen noch Tests): Tests laufen lassen
   (`node --test "discover/tests/*.test.mjs"`, `node --test "quant/tests/*.test.mjs"`, Core), Vergleichsbilder Prototyp | Umsetzung
   aufnehmen (390 × 844, dunkel), nachbessern, Owner die Bilder zeigen, dann ein PR. Danach den Ordner `zwischenstand/` löschen.
   Discover setzt `data-vu-bleed` und `data-vu-tabs="inhalt"` am `<html>`; Discover-Budget ≤ 180.000 Byte beachten.
3. **Weitere Bildschirme** je nach [AUFTRAG.md](AUFTRAG.md): Supertrader, News, Ich, Technical, Fundamental, Hedgefonds, Screener,
   dann Module ohne Prototyp-Bildschirm (Elliott, Vorsorge/Portfolios, Konto, Atlas) im Design des Prototyps.
   Je Bildschirm: bauen, Vergleichsbild, Owner zeigen, PR, bei Grün mergen.
4. **Vorschau-Links**: Aktien-Elemente auf allen Seiten bekommen `data-vu-stock` + `href` (öffnet `assets/vu-stock-sheet.js`);
   „Ansehen“/„Ganz öffnen“ führt auf `/aktie/#/<T>`.
5. **Website www** bleibt unverändert, bis der Owner Hero-Variante und Umzug freigibt (siehe Abschnitt Website).

Arbeitsweise, die sich bewährt hat: je Bildschirm ein Agent im eigenen Worktree (Auftrag = AUFTRAG.md + Bildschirm-Teil),
nie `git fetch` ohne `origin main`, Release-Bauten unter `/dev/shm`, eigene Ports, kein breites `pkill`; nur auf den
vorgegebenen Arbeitszweig pushen; kein Force-Push (nach einem Merge den Zweig lokal auf `origin/main` setzen und normal pushen).
