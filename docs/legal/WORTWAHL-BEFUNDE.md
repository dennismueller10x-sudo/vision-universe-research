# Wortwahl-Befunde im ausgelieferten Produkt

Stand 05.11.2026 (Commit-Basis `3045b434fc`), Strang F. **Keine Rechtsberatung.** Regeln: [WORTWAHL.md](WORTWAHL.md),
Einordnung: [EINORDNUNG.md](EINORDNUNG.md). Strang F ändert keine Seiten selbst. Umsetzung durch den Frontend-Strang D2,
Hinweistexte aus `assets/legal-notices.json`.

## Wie gesucht wurde

- **Durchsucht:** alle versionierten `*.html`, `*.js`, `*.mjs` und `*.cjs` der ausgelieferten Seiten und Engines. Nicht
  durchsucht wurden `data/`, Tests, `docs/`, `scripts/`, Worker, `social/`, `studio/` und `brand-media/`. Reels prüft
  der Social-Strang mit denselben Regeln.
- **Gezählt:** nur sichtbarer Text, also HTML-Text und String-Literale in JS.
- **Gesucht:** kaufen, verkaufen, Kauf, Empfehlung, Kursziel, Kurspotenzial, garantiert, sicher, risikolos, Gewinner,
  Einstieg, Stopp, Ausstieg, unterbewertet, Top-Pick u. a.
- **Ergebnis:** 741 Treffer.
  - 253 sind Verneinungen wie „keine Kaufempfehlung“. Sie sind unkritisch und erwünscht und nicht aufgeführt.
  - Weggelassen sind außerdem Codewerte (`BUY`, `Long`), interne Suchwortlisten und die alten Shopify-Quelltexte unter
    `landing/legal-source/`.
  - Es bleiben **256 Stellen** (Tabelle unten).
- **Zeilennummern** beziehen sich auf den genannten Commit.

## Owner-Linie Plan §11 (05.11.2026)

Zusätzlich zur Wortwahl müssen die Umbauten L1–L7 aus [EINORDNUNG.md](EINORDNUNG.md) §0 vor dem öffentlichen Start
umgesetzt sein, damit die Linie „keine Empfehlungen, keine Anzeige bei der BaFin“ trägt:
- keine Ziele und kein Chance/Risiko,
- Musterdepots nicht als heutige Kaufliste,
- Analysten-Labels entfernen oder die Analysten-Seite abschalten,
- Reels ohne Meinung zu Einzelaktien,
- AI Atlas lehnt Kauffragen ab,
- kein Gesamturteil als Wort.

## Vorrang: diese Stellen zuerst (D2)

| # | Stelle | Heute | Stattdessen | Grund |
|---|---|---|---|---|
| 1 | `quant/app/page-stock.js:699`, `quant/app/pages.js:120`, `:322` | „Interessant ab“ | „Zone laut Methode“ | Wertung, wirkt wie direkter Vorschlag |
| 2 | `quant/app/page-stock.js:706`, `quant/app/page-backtest.js:163` | „Chance/Risiko“ | weglassen (Plan §11) | „Chance“ wirbt, Handelsvorschlag |
| 3 | `quant/app/page-stock.js` Setup-Karte, `quant/app/pages.js:316-323` | „Ziel 1 / Ziel 2“, „Stop / Ungültig unter“ | Ziele weglassen; „Ungültig-Marke laut Methode“ + Hinweis `setup` | Plan §11: keine Signale mit Einstieg, Stopp, Ziel |
| 4 | `dashboard/app-rebuild.js:197`, `:242`; `dashboard/app.js:20-21` | „Kaufzone (Long)“, „Kauf-/Verkaufszone“, „Einstiegszone“ | „Zone der Methode (Long)“ | Kaufaufforderung |
| 5 | `supertrader/assets/supertrader.js:60`, `:438`, `:1459` | „Einstieg bestätigt“ | „erfüllt die Regel (Stand …)“ | Bestätigung an die Nutzerin |
| 6 | `supertrader/assets/supertrader.js:656`, `:664`, `:686-700`, `:1548`; `supertrader/assets/st-redesign.js:228`, `:326`, `:413-414`, `:470` | „Kauf …“, „kauft und verkauft“, „Risiko je Kauf“ (Musterdepot) | „Aufnahme / Abgabe (Musterdepot)“, „Risiko je Position (Modell)“ + Hinweis `modelPortfolio` | Protokoll wirkt wie Order |
| 7 | `analysten/index.html:176-247`, `:396`, `:511` | „Konsens-Ranking“, „Klarer Kauf“, „Kaufen/Verkaufen-Konsens“, „Kursziel-Potenzial“, „Ø Kurspotenzial“ | Label „Angabe Dritter“, Quelle + Datum an jedem Wert, „Übersicht der Analysten-Einstufungen“, „Abstand zum mittleren Analysten-Kursziel“ + Hinweis `thirdParty` | Weitergabe von Empfehlungen Dritter |
| 8 | `fundamental/app.js:1573-1588`, `fundamental/engine/catalog.js:711` | „Starker Kauf / Kaufen / Verkaufen“, „Kursziel (Mittel)“ | wie 7 | wie 7 |
| 9 | `screener/engine/fields.js:263`, `screener/app.js:144` | „Kursziel-Potenzial“ (gesperrtes Feld), „Analysten, Kursziele“ | erst bei Freischaltung, dann wie 7 | – |
| 10 | `screener/engine/fields.js:313` | „Schlägt die Aktie den Markt?“, „Mehrrendite“ | „Kursentwicklung gegenüber dem Markt, 6 Monate“ | Renditewerbung |
| 11 | `discover/ui/markets.js:427`, `discover/ui/v3.js:912` | „Stärkste Gewinner“, „Gewinner und Verlierer“ | „Größte Anstiege / Rückgänge heute“ | Wertung der Aktie |
| 12 | `discover/ui/detail.js:672`, `quant/app/page-chartbild.js:69`, `quant/app/page-stock.js:1057` | „Das spricht dafür / dagegen“ | „Stärken / Schwächen laut Kennzahlen“ | Abwägung zum Kauf |
| 13 | `hedgefonds/app.js:609` | „Was Profis kaufen“ | „Was große Fonds gemeldet haben (13F)“ | Einladung zum Nachmachen |
| 14 | `landing/instagram/index.html:135`, `landing/partner/index.html:134` | „Was kaufen Warren Buffett und andere …?“ | „Was melden Warren Buffett und andere große Investoren?“ | wie 13 |
| 15 | `supertrader/assets/st-redesign.js:546-577` (Backtest Lab, Pilot mit Renditekurve, CAGR) | Renditekurve gegen S&P 500 | Hinweis `backtest`, Pflichtangaben `backtest.required`; öffentliche Renditezahlen nur mit Owner-Freigabe | UWG |
| 16 | `ask/` (AI Atlas) | KI-Antworten zu Einzelaktien mit Zone und Zielzone (Zielzone streichen) | Hinweis `ai`. Die KI ignoriert Angaben zu Alter, Vermögen und Risiko und lehnt „soll ich kaufen?“ als persönliche Frage ab (Worker `vu-ask`, eigener PR) | Anlageberatungsrisiko |
| 17 | `etf/index.html:702` | „Empfehlung: 10–15 % Nettoeinkommen“ (Sparrate) | „Faustregel aus der Literatur: …“ oder streichen | Empfehlung an die Person |
| 18 | alle Seiten | uneinheitliche Fußhinweise | Hinweis `footer` aus `assets/legal-notices.json` mit Links zu Impressum, Datenschutz, Nutzungsbedingungen und Risikohinweisen | – |

**Unkritisch, so lassen:**
- Insider- und 13F-Begriffe: `hedgefonds/app.js`, „Insider-Kauf“, „Verkauft“ für Fondsmeldungen.
- Erklärtexte: `fundamental/app.js:578`, `:951`; `vorsorge/ui/foerderung.js:255`, `:268`.
- „Rückkauf“: `discover/engines/fundamentals.js:451`.
- Technisches „sicher“: `supertrader/assets/supertrader.js:1255`.
- „sichere Anlagen“ (Fachbegriff): `quant/engines/multi-asset/market-pulse.js:704`, `:874`.
- „Garantiertes Kapital“ (Vertragsdaten der Nutzerin): `vorsorge/ui/foerderung.js:132`, `:147`, `vorsorge/engines/monitor.js:154`.

## Alle Stellen

Einstufungen:
- **A Marke „der Methode“:** Einstieg, Stopp, Ausstieg und Zone als Marke der Methode kennzeichnen.
- **A Musterdepot:** Kauf/Verkauf → Aufnahme/Abgabe.
- **A umformulieren:** Wertung ersetzen.
- **B Dritte kennzeichnen.**
- **C:** Fachbegriff oder Kontext. Prüfen, meist unkritisch.

Die automatische Einstufung ist grob. Maßgeblich ist die Vorrangliste oben.

| Einstufung | Datei:Zeile | Wort | Ausschnitt |
|---|---|---|---|
| A Marke „der Methode“ | `ask/engine.js:29` | Einstieg | VERED: 'Entdeckt', WATCH: 'Beobachten', SETUP: 'Setup', ENTRY_READY: 'Einstieg bereit', |
| A Marke „der Methode“ | `ask/engine.js:30` | Ausstieg | TRIGGERED: 'Ausgelöst', ACTIVE: 'Aktiv', WARNING: 'Warnung', EXIT: 'Ausstieg' |
| A Marke „der Methode“ | `dashboard/app-rebuild.js:197` | Kaufzone | d, 'zone-buy', 'zone-target', 'zone-label-buy', 'zone-label-target', 'Kaufzone', 'Zielzone'), buy: longBuy, target: long |
| A Marke „der Methode“ | `dashboard/app-rebuild.js:197` | Kaufzone | ), buy: longBuy, target: longTarget, invalid: longInvalid, buyLabel: 'Kaufzone (Long)', targetLabel: 'Zielzone (Long)' } |
| A Marke „der Methode“ | `dashboard/app.js:20` | Einstiegszone | enario&&scenario.status==="beta"?[[scenario.entry_zone.low,"#16835b","Einstiegszone"],[scenario.entry_zone.high,"#16835b |
| A Marke „der Methode“ | `dashboard/app.js:20` | Einstiegszone | e.low,"#16835b","Einstiegszone"],[scenario.entry_zone.high,"#16835b","Einstiegszone"],[scenario.invalidation,"#d94e43"," |
| A Marke „der Methode“ | `dashboard/app.js:21` | Einstieg | TML=html;q("#vu-note").textContent=analysis?"Technisches Szenario β · Einstieg, Ziele und Invalidierung sichtbar":"Reine |
| A Marke „der Methode“ | `index.html:77` | Einstieg | &lt;p class="vu-ltag">Für jeden ein Einstieg&lt;/p> |
| A Marke „der Methode“ | `quant/api/technical-intelligence-workspace.js:66` | Einstiegszone | ENTRY_ZONE_REACHED: "Kurs hat die Einstiegszone des Hauptszenarios erreicht", |
| A Marke „der Methode“ | `quant/app/app.js:269` | Einstieg | an", { text: " Keine Anlageempfehlung, keine Prognose, kein Kursziel. Einstieg, Stop-Loss und Ziele sind Szenarien der t |
| A Marke „der Methode“ | `quant/app/app.js:269` | Stop-Loss | t: " Keine Anlageempfehlung, keine Prognose, kein Kursziel. Einstieg, Stop-Loss und Ziele sind Szenarien der technischen |
| A Marke „der Methode“ | `quant/app/page-backtest.js:134` | Einstieg | ["Einstieg", "Schluss " + (r.grain === "WEEKLY" ? "der Woche" : "des Tages") + " nach dem Si |
| A Marke „der Methode“ | `quant/app/page-backtest.js:135` | Ausstieg | ["Ausstieg", "nach festem Zeitraum (1, 3, 6, 12 Monate)" + (r.contractTrade && r.contractTra |
| A Marke „der Methode“ | `quant/app/page-backtest.js:135` | Ausstieg | , 6, 12 Monate)" + (r.contractTrade && r.contractTrade.n ? "; daneben Ausstieg nach Setup-Vertrag" : r.oppositeExit && r |
| A Marke „der Methode“ | `quant/app/page-backtest.js:182` | Einstieg | : "qx-small", text: "Median des Abstands zum bisherigen Hoch seit dem Einstieg. Schlimmste 10 % der Fälle nach 6 Monaten |
| A Marke „der Methode“ | `quant/app/page-backtest.js:202` | Einstieg | el("li", { text: "Ein Signal liest nur Kurse bis zur Signalwoche; der Einstieg liegt danach. Geprüft an echten Fällen mi |
| A Marke „der Methode“ | `quant/app/page-backtest.js:221` | Einstieg | ability.entryDelay \|\| []).map(function (d) { return el("li", { text: "Einstieg " + d.delayWeeks + " Woche(n) nach dem Si |
| A Marke „der Methode“ | `quant/app/page-backtest.js:223` | Ausstieg | xit && r.oppositeExit.n) kids.push(el("h3", { class: "qx-sub", text: "Ausstieg beim Gegensignal" }), el("p", { class: "q |
| A Marke „der Methode“ | `quant/app/page-backtest.js:249` | Einstieg | el("p", { class: "qx-small", text: "Einstieg zum Schluss des Folgetags (Vergleich: Schluss des Stichtags); Ausstieg bei  |
| A Marke „der Methode“ | `quant/app/page-backtest.js:249` | Ausstieg | instieg zum Schluss des Folgetags (Vergleich: Schluss des Stichtags); Ausstieg bei Schluss unter der Invalidierung, Schl |
| A Marke „der Methode“ | `quant/app/page-chartbild.js:88` | Einstiegszone | if (s.entryZone) row(s.kind === "TAIL" ? "Zone" : "Einstiegszone", zoneText(s.entryZone)); |
| A Marke „der Methode“ | `quant/app/page-chartbild.js:744` | Einstieg | frühere Fälle belegen. Prüfung nur mit Daten bis zum jeweiligen Tag, Einstieg erst danach, Kosten berücksichtigt. Nur he |
| A Marke „der Methode“ | `quant/app/page-chartbild.js:1241` | Einstieg | g sichtbar war (keine Zukunftsdaten, Test mit ‚vergifteter‘ Zukunft). Einstieg frühestens am Folgetag, Ungültigkeit per  |
| A Marke „der Methode“ | `quant/app/page-chartbild.js:1270` | Einstieg | IOTT: "Elliott-Wellen", FIBONACCI: "Fibonacci", TIMING_EARLY: "Früher Einstieg im Rücklauf", WYCKOFF: "Wyckoff", VOLUME: |
| A Marke „der Methode“ | `quant/app/page-chartbild.js:1286` | Einstieg | H6: "Einstieg in der laufenden Gegenbewegung schlägt den Einstieg nach Bestätigung durch die En |
| A Marke „der Methode“ | `quant/app/page-chartbild.js:1286` | Einstieg | H6: "Einstieg in der laufenden Gegenbewegung schlägt den Einstieg nach Bestätigung durch die Engine", |
| A Marke „der Methode“ | `quant/app/page-chartbild.js:1287` | Einstieg | H7: "Fibonacci-Konfluenz (mindestens zwei Niveaus) am Einstieg verbessert das Ergebnis" |
| A Marke „der Methode“ | `quant/app/page-evidence.js:19` | Ausstieg | PATH_STATES_CLOSED: "Die späteren Setup-Stufen (läuft, ungültig, Ausstieg) sind noch nicht freigeschaltet.", |
| A Marke „der Methode“ | `quant/app/page-evidence.js:65` | Einstiegsvarianten | VARIANTS_NOT_MEASURABLE_YET: "Die Einstiegsvarianten lassen sich erst mit abgeschlossenen Ergebnissen vergleichen.", |
| A Marke „der Methode“ | `quant/app/page-stock.js:727` | Einstieg | : "Einstieg, Stop-Loss und Ziele rechnet Quant nur für Titel mit vollständiger technischer Au |
| A Marke „der Methode“ | `quant/app/page-stock.js:727` | Stop-Loss | : "Einstieg, Stop-Loss und Ziele rechnet Quant nur für Titel mit vollständiger technischer Auswertung – |
| A Marke „der Methode“ | `quant/app/page-stock.js:1134` | Einstieg | ie Aktie gerade zu einem Stil?", null, styleV3(vm).concat([keepBelow("Einstieg, Stop, Ziele und alle Bedingungen", setup |
| A Marke „der Methode“ | `quant/app/pages.js:27` | Einstiegszone | Strukturtief und erzeugt ein neues Higher High.": "der Kurs über der Einstiegszone bzw. dem letzten Tief bleibt und ein  |
| A Marke „der Methode“ | `quant/app/pages.js:28` | Einstiegszone | zten Strukturhoch und erzeugt ein neues Lower Low.": "der Kurs an der Einstiegszone bzw. dem letzten Hoch scheitert und  |
| A Marke „der Methode“ | `quant/app/pages.js:101` | Einstieg | Nach den Tafeln "Quant Home & Einstieg" und "Neuer Aufbau": Hero mit |
| A Marke „der Methode“ | `quant/app/pages.js:240` | Einstieg | text: "So liest du eine Karte: oben das Ereignis mit Datum, darunter Einstieg, Ungültig-Marke und die nächste Bedingung, |
| A Marke „der Methode“ | `quant/app/pages.js:357` | Einstieg | u-mu">Quant ordnet ein und vergleicht. Keine Prognose, kein Kursziel. Einstieg, Ungültig-Marke und Ziele sind Szenarien  |
| A Marke „der Methode“ | `quant/app/pages.js:488` | Einstieg | text: "Quant gibt keine Anlageempfehlungen und macht keine Prognosen. Einstieg, Stop-Loss und Ziele sind Szenarien der t |
| A Marke „der Methode“ | `quant/app/pages.js:488` | Stop-Loss | nt gibt keine Anlageempfehlungen und macht keine Prognosen. Einstieg, Stop-Loss und Ziele sind Szenarien der technischen |
| A Marke „der Methode“ | `quant/app/pages.js:1129` | Einstieg | main.append(X.world("Bekannte Aktien", "Ein schneller Einstieg.", [X.rail(KNOWN.map(function (t) { return X.poster({ tic |
| A Marke „der Methode“ | `quant/engines/quant-radar.js:110` | Ausstieg | { id: "EXIT", label: "Ausstieg erreicht", tier: "PATH_DEPENDENT" } |
| A Marke „der Methode“ | `quant/engines/signal-backtest.js:67` | Einstieg | { id: "NEXT_CLOSE", state: "SUPPORTED", isDefault: true, plain: "Einstieg zum Schluss der Woche nach dem Signal" }, |
| A Marke „der Methode“ | `quant/engines/signal-backtest.js:68` | Einstieg | { id: "CLOSE", state: "SUPPORTED", plain: "Einstieg zum Schluss der Signalwoche (leicht optimistisch, nur zum Vergleich) |
| A Marke „der Methode“ | `quant/engines/signal-backtest.js:73` | Ausstieg | { id: "TIME_EXIT", state: "SUPPORTED", isDefault: true, plain: "Ausstieg nach festem Zeitraum (1, 3, 6, 12 Monate)" }, |
| A Marke „der Methode“ | `quant/engines/signal-backtest.js:74` | Ausstieg | { id: "OPPOSITE_SIGNAL", state: "SUPPORTED", plain: "Ausstieg beim Gegensignal, spätestens nach 12 Monaten" }, |
| A Marke „der Methode“ | `quant/engines/signal-backtest.js:83` | Einstieg | { id: "NEXT_CLOSE", state: "SUPPORTED", isDefault: true, plain: "Einstieg zum Schluss des Tages nach dem bestätigten Set |
| A Marke „der Methode“ | `quant/engines/signal-backtest.js:84` | Einstieg | { id: "CLOSE", state: "SUPPORTED", plain: "Einstieg zum Schluss des Bestätigungstags" }, |
| A Marke „der Methode“ | `quant/engines/signal-backtest.js:89` | Ausstieg | { id: "TIME_EXIT", state: "SUPPORTED", isDefault: true, plain: "Ausstieg nach festem Zeitraum" }, |
| A Marke „der Methode“ | `quant/engines/technical/ti/alerts.js:16` | Einstiegszone | ENTRY_ZONE_REACHED: "Kurs hat die Einstiegszone erreicht", |
| A Marke „der Methode“ | `quant/engines/technical/ti/explain.js:99` | Einstiege | rreichten Zielzone 1 in " + pct(e.t1HitRate) + " der Fälle; zufällige Einstiege mit gleichem Abstand zu Ziel und Grenze  |
| A Marke „der Methode“ | `quant/engines/technical/ti/scenario.js:181` | Einstiegszone | , relation: activePattern.name + ": Ausbruchsniveau" }] }, atr, cfg, "Einstiegszone"); |
| A Marke „der Methode“ | `quant/engines/technical/ti/scenario.js:184` | Einstiegszone | entry = toZone(cl[0], atr, cfg, "Einstiegszone"); |
| A Marke „der Methode“ | `quant/engines/technical/ti/scenario.js:187` | Einstiegszone | TILITY", relation: "Bandbreite ±0,5 ATR um den Kurs" }] }, atr, cfg, "Einstiegszone"); |
| A Marke „der Methode“ | `quant/engines/technical/ti/scenario.js:206` | Einstiegszone | areOfClose * close), basis: "VOLATILITY", rule: "1,5 ATR jenseits der Einstiegszone (keine strukturelle Grenze in Reichw |
| A Marke „der Methode“ | `quant/engines/technical/ti/scenario.js:221` | Einstiegszone | URED_MOVE", relation: r + " × prozentuale Länge des letzten Swings ab Einstiegszone" }); }); |
| A Marke „der Methode“ | `supertrader/assets/sf-research.js:14` | Einstiegs | auf', 'model', 'Ein Forschungsmodell liefert zusätzlich hypothetische Einstiegs- und Stop-Marken. Keine Order, keine Emp |
| A Marke „der Methode“ | `supertrader/assets/sf-research.js:49` | Einstieg | TURTLE_ENTRY_IS_INTRADAY_ON_ASOF_NOT_MODELLED_FOR_NEXT_SESSION: 'Der Einstieg der Quelle liegt intraday am Stichtag; für |
| A Marke „der Methode“ | `supertrader/assets/sf-research.js:330` | Einstieg | s: 'sf-nums' }, [onOpen ? pair('Referenz (Schluss)', usd(p.trigger), 'Einstieg zur Eröffnung ' + dateDe(p.earliestSessio |
| A Marke „der Methode“ | `supertrader/assets/sf-research.js:330` | Einstiegsmarke | gger), 'Einstieg zur Eröffnung ' + dateDe(p.earliestSession)) : pair('Einstiegsmarke', usd(p.trigger), 'ab ' + dateDe(p. |
| A Marke „der Methode“ | `supertrader/assets/sf-research.js:334` | Einstieg | Stop und höchstens ' + usd(p.fillWindow.upTo) + ', sonst entfällt der Einstieg.']) : null, |
| A Marke „der Methode“ | `supertrader/assets/sf-research.js:380` | Einstiegsmarke | label: /OPEN/.test(v.plan.entryType) ? 'Referenz (Schluss)' : 'Modell-Einstiegsmarke', value: v.plan.trigger, color: 'va |
| A Marke „der Methode“ | `supertrader/assets/st-redesign.js:24` | Einstiegsmarke | TRY_READY: ['Kurz vor der Marke', 'Fehlt nur noch der Sprung über die Einstiegsmarke.', 'mid'], |
| A Marke „der Methode“ | `supertrader/assets/st-redesign.js:28` | Ausstieg | EXIT: ['Ausstieg ausgelöst', 'Die Verkaufsregel hat gegriffen.', 'none'], |
| A Marke „der Methode“ | `supertrader/assets/st-redesign.js:29` | Ausstieg | CLOSED: ['Abgeschlossen', 'Ein- und Ausstieg sind verbucht.', 'none'], |
| A Marke „der Methode“ | `supertrader/assets/st-redesign.js:41` | Ausstieg | stätigt: Alle prüfbaren Regeln sind erfüllt. Durchgerechnet: Ein- und Ausstieg sind nach Regel geplant.'; |
| A Marke „der Methode“ | `supertrader/assets/st-redesign.js:158` | Einstieg | r-trkl vu-num">&lt;span>Stop ' + usd(stop) + '&lt;/span>&lt;span class="vu-mu">Einstieg ' + usd(s.entry.price) + '&lt;/span>&lt;span>Sc |
| A Marke „der Methode“ | `supertrader/assets/st-redesign.js:266` | Ausstieg | net“.')) + '&lt;div class="st-r-gap">' + U.help('Stufe 3 heißt: Ein- und Ausstieg sind nach Regel geplant. Das ist ein Rech |
| A Marke „der Methode“ | `supertrader/assets/st-redesign.js:275` | Ausstieg | ' + usd(cyc.inn.price) + '&lt;/span>&lt;span>② ' + dShort(cyc.out.date) + ' Ausstieg nach Regel · ' + usd(cyc.out.price) + '&lt;/ |
| A Marke „der Methode“ | `supertrader/assets/st-redesign.js:461` | Ausstieg | var PH = [['', 'Alle'], ['held', 'Modell ist dabei'], ['exit', 'Ausstieg'], ['prep', 'Vorbereitet']]; |
| A Marke „der Methode“ | `supertrader/assets/st-redesign.js:467` | Einstieg | &lt;span>&lt;b>So liest du die Leiste:&lt;/b> schwarzer Punkt = Stop, Strich = Einstieg des Modells, grüner Punkt = Schluss heute |
| A Marke „der Methode“ | `supertrader/assets/st-redesign.js:467` | Einstieg | Strich = Einstieg des Modells, grüner Punkt = Schluss heute. Vor dem Einstieg: Grenze, Kurs und Marke.&lt;/span>&lt;/div>' + |
| A Marke „der Methode“ | `supertrader/assets/st-redesign.js:667` | Einstieg | rt>&lt;/div>&lt;div class="st-r-marks">&lt;span>① ' + dShort(cyc.inn.date) + ' Einstieg ' + esc(cycIds.join(' und ')) + ' · ' + u |
| A Marke „der Methode“ | `supertrader/assets/st-redesign.js:667` | Ausstieg | price) + '&lt;/span>' + (cyc.out ? '&lt;span>② ' + dShort(cyc.out.date) + ' Ausstieg · ' + usd(cyc.out.price) + '&lt;/span>' : '' |
| A Marke „der Methode“ | `supertrader/assets/supertrader.js:60` | Einstieg | TRIGGERED: ['conf', 'Einstieg bestätigt'], ACTIVE: ['pos', 'Modellposition aktiv'], WARNING: ['warn', 'Position |
| A Marke „der Methode“ | `supertrader/assets/supertrader.js:61` | Ausstieg | EXIT: ['exit', 'Ausstieg ausgelöst'], CLOSED: ['closed', 'Geschlossen'], INVALIDATED: ['inv', 'Ungültig'], |
| A Marke „der Methode“ | `supertrader/assets/supertrader.js:64` | Ausstieg | 'Beobachtung'], ['conf', 'Bestätigt'], ['pos', 'Position'], ['exit', 'Ausstieg'], ['obs', 'Forschung'], ['cand', 'Kandid |
| A Marke „der Methode“ | `supertrader/assets/supertrader.js:94` | Ausstieg | EXIT_NOT_SOURCE_BACKED: ['Ausstieg nicht belegt', 'bad'], OFFICIAL_SITE_AND_REPLICATIONS: ['Offizielle Quelle', 'goo |
| A Marke „der Methode“ | `supertrader/assets/supertrader.js:148` | Einstieg | : 'st-bar2 pos', role: 'img', 'aria-label': 'Stop ' + px(s.stop) + ', Einstieg ' + px(s.entry.price) + ', Schlusskurs '  |
| A Marke „der Methode“ | `supertrader/assets/supertrader.js:150` | Einstieg | n', { class: 'bad', text: 'Stop ' + px(s.stop) }), h('span', { text: 'Einstieg ' + px(s.entry.price) }), h('span', { cla |
| A Marke „der Methode“ | `supertrader/assets/supertrader.js:162` | Einstieg | x(inv) }), h('span', { class: 'now', text: s.state === 'TRIGGERED' ? 'Einstieg zur nächsten Eröffnung' : toTrig &lt; 0.0005 |
| A Marke „der Methode“ | `supertrader/assets/supertrader.js:199` | Einstieg | QLABEL = { A_CANDIDATE: 'A-Kandidat', B_SETUP: 'B-Setup', A_ENTRY: 'A-Einstieg', B_ENTRY: 'B-Einstieg' }; |
| A Marke „der Methode“ | `supertrader/assets/supertrader.js:199` | Einstieg | 'A-Kandidat', B_SETUP: 'B-Setup', A_ENTRY: 'A-Einstieg', B_ENTRY: 'B-Einstieg' }; |
| A Marke „der Methode“ | `supertrader/assets/supertrader.js:373` | Einstiege | [String(prepList.length), 'Vorbereitete Einstiege', 'prep', stale ? 'Kurse veraltet – nicht hervorgehoben' : (prepSub \|\| |
| A Marke „der Methode“ | `supertrader/assets/supertrader.js:374` | Einstiege | ' / ' + String(positions.length), 'Bestätigt / Positionen', 'conf', 'Einstiege per Schlusskurs'], |
| A Marke „der Methode“ | `supertrader/assets/supertrader.js:391` | Einstieg | main.appendChild(sec('Am nächsten am Einstieg', [ |
| A Marke „der Methode“ | `supertrader/assets/supertrader.js:438` | Einstieg | ist([[String(sum('prep')), 'In Vorbereitung'], [String(sum('conf')), 'Einstieg bestätigt'], [String(sum('pos')), 'Modell |
| A Marke „der Methode“ | `supertrader/assets/supertrader.js:441` | Einstiege | lle Methoden laufen deshalb als Modellbeobachtung: Setups, bestätigte Einstiege, Positionen und Ausstiege werden nach fe |
| A Marke „der Methode“ | `supertrader/assets/supertrader.js:613` | Einstiege | ogressive.lookback + ' Trades halbes Risiko' : '') + '. Gleichzeitige Einstiege ' + (c.simultaneousEntries \|\| '') + '. ' |
| A Marke „der Methode“ | `supertrader/assets/supertrader.js:619` | Einstieg | h('div', { class: 'r2', text: 'Einstieg ' + dateShort(p.entryDate) + ' zu ' + num(p.entryPrice) + ' · Stop ' + num(p.sto |
| A Marke „der Methode“ | `supertrader/assets/supertrader.js:668` | Einstiege | main.appendChild(sec('Vorbereitete Einstiege', [ |
| A Marke „der Methode“ | `supertrader/assets/supertrader.js:718` | Ausstieg | der Regelversion geführt, unter der sie eröffnet wurden, und bis zum Ausstieg protokolliert. Die Einstufung ist eine Pro |
| A Marke „der Methode“ | `supertrader/assets/supertrader.js:725` | Ausstieg | ['prepared', 'Vorbereitet'], ['confirmation', 'Bestätigt'], ['exit', 'Ausstieg']] : (c.sections \|\| []).slice(0, 4).map(f |
| A Marke „der Methode“ | `supertrader/assets/supertrader.js:782` | Einstieg | var AREAS = [['Einstieg', 'entry_fidelity', 'entry'], ['Ausstieg', 'exit_fidelity', 'exit'], ['Positionsg |
| A Marke „der Methode“ | `supertrader/assets/supertrader.js:782` | Ausstieg | var AREAS = [['Einstieg', 'entry_fidelity', 'entry'], ['Ausstieg', 'exit_fidelity', 'exit'], ['Positionsgröße', 'positio |
| A Marke „der Methode“ | `supertrader/assets/supertrader.js:786` | Einstieg | st für diese Version nicht zulässig, weil mindestens ein Kernbereich (Einstieg, Ausstieg, Positionsgröße, Portfolio, Ris |
| A Marke „der Methode“ | `supertrader/assets/supertrader.js:786` | Ausstieg | se Version nicht zulässig, weil mindestens ein Kernbereich (Einstieg, Ausstieg, Positionsgröße, Portfolio, Risiko) nicht |
| A Marke „der Methode“ | `supertrader/assets/supertrader.js:800` | Einstiege | qTile(st.quality.byLabel ? st.quality.byLabel.A_ENTRY : 0, 'A-Einstiege'), qTile(st.quality.byLabel ? st.quality.byLabel |
| A Marke „der Methode“ | `supertrader/assets/supertrader.js:809` | Ausstieg | lpositionen (' + pos.length + ')', [h('p', { class: 'st-hint', text: 'Ausstieg und Stop gelten nach der Regelversion, un |
| A Marke „der Methode“ | `supertrader/assets/supertrader.js:1014` | Einstieg | if (s.entry && isFinite(s.entry.price)) out.push(['entry', 'Einstieg', s.entry.price]); |
| A Marke „der Methode“ | `supertrader/assets/supertrader.js:1226` | Ausstieg | g · Modellbeobachtung (' + ev(strat).levelLabel + '). ' + (s.entry ? 'Ausstieg nach Regelversion ' + (s.version \|\| '') + |
| A Marke „der Methode“ | `supertrader/assets/supertrader.js:1255` | Ausstieg | == 'SAME_DAY_CERTAIN' && p.entry.evidence !== 'INTRADAY_1MIN') txt = 'Ausstieg am Kauftag sicher: Der Tag schloss unter  |
| A Marke „der Methode“ | `supertrader/assets/supertrader.js:1258` | Einstieg | txt = 'Reihenfolge am Kauftag offen: Das Tagestief lag unter dem Einstieg. Ob es vor oder nach dem Kauf entstand, zeigen |
| A Marke „der Methode“ | `supertrader/assets/supertrader.js:1261` | Ausstieg | else if (p.entry.evidence === 'INTRADAY_1MIN') txt = (sameDay ? 'Ausstieg am Kauftag: ' : 'Kauftag geprüft: ') + 'Die Re |
| A Marke „der Methode“ | `supertrader/assets/supertrader.js:1416` | Einstieg | SD'] ? h('li', { text: 'Verluste kamen vor allem aus teureren Aktien (Einstieg ab 10 USD), nicht aus Kleinstwerten.' })  |
| A Marke „der Methode“ | `supertrader/assets/supertrader.js:1439` | Einstieg | e.version \|\| '') + ' ab: Vorbereitung → Bestätigung per Schlusskurs → Einstieg zur nächsten Eröffnung → Stop → Ausstieg. |
| A Marke „der Methode“ | `supertrader/assets/supertrader.js:1439` | Ausstieg | estätigung per Schlusskurs → Einstieg zur nächsten Eröffnung → Stop → Ausstieg. Die laufende Version kauft per Kauf-Stop |
| A Marke „der Methode“ | `supertrader/assets/supertrader.js:1442` | Ausstieg | var KIND_LABEL = { CHANNEL_EXIT: 'Ausstieg über die Kanalregel', STOP: 'Ausstieg über den Stop' }; |
| A Marke „der Methode“ | `supertrader/assets/supertrader.js:1442` | Ausstieg | r KIND_LABEL = { CHANNEL_EXIT: 'Ausstieg über die Kanalregel', STOP: 'Ausstieg über den Stop' }; |
| A Marke „der Methode“ | `supertrader/assets/supertrader.js:1445` | Einstieg | Version kauft per Kauf-Stop im Tagesverlauf und unterscheidet sich in Einstieg und Ausstieg.' })])); |
| A Marke „der Methode“ | `supertrader/assets/supertrader.js:1445` | Ausstieg | per Kauf-Stop im Tagesverlauf und unterscheidet sich in Einstieg und Ausstieg.' })])); |
| A Marke „der Methode“ | `supertrader/assets/supertrader.js:1459` | Einstieg | conf ? [conf.date, 'Einstieg bestätigt', 'Tagesschluss ' + num(ex.checks.confirmationClose) + ' über dem Trigg |
| A Marke „der Methode“ | `supertrader/assets/supertrader.js:1461` | Ausstieg | [ex1.date, KIND_LABEL[ex.kind] \|\| 'Ausstieg', (ex.kind === 'STOP' ? (ex.checks.exitBasis === 'OPEN_BELOW_STOP' ? 'Eröffn |
| A Marke „der Methode“ | `supertrader/assets/supertrader.js:1461` | Ausstieg | .checks.exitBasis === 'OPEN_BELOW_STOP' ? 'Eröffnung unter dem Stop – Ausstieg zum Eröffnungskurs ' + num(ex1.price) + ' |
| A Marke „der Methode“ | `supertrader/assets/supertrader.js:1461` | Ausstieg | röffnungskurs ' + num(ex1.price) + ' (Gap-Regel).' : 'Stop gerissen – Ausstieg zu ' + num(ex1.price) + '.') : 'Schluss u |
| A Marke „der Methode“ | `supertrader/assets/supertrader.js:1461` | Ausstieg | tieg zu ' + num(ex1.price) + '.') : 'Schluss unter dem 10-Tage-Tief → Ausstieg zur nächsten Eröffnung ' + num(ex1.price) |
| A Marke „der Methode“ | `supertrader/assets/supertrader.js:1466` | Einstieg | h('div', { class: 'c' }, [h('span', { class: 'k', text: 'Einstieg' }), h('strong', { text: num(r.entry.price) }), h('spa |
| A Marke „der Methode“ | `supertrader/assets/supertrader.js:1467` | Einstieg | text: num(sg.initialStop) }), h('span', { class: 'd', text: '2N unter Einstieg' })]), |
| A Marke „der Methode“ | `supertrader/assets/supertrader.js:1468` | Ausstieg | h('div', { class: 'c' }, [h('span', { class: 'k', text: 'Ausstieg' }), h('strong', { text: num(ex1.price) }), h('span',  |
| A Marke „der Methode“ | `supertrader/assets/supertrader.js:1487` | Ausstieg | (ex); } }, [ex.symbol + ' · ' + (ex.kind === 'STOP' ? 'Stop' : 'Kanal-Ausstieg')]); b._e = ex; tabs.appendChild(b); }); |
| A Marke „der Methode“ | `willkommen/index.html:42` | Einstieg | >Noch kein Ziel gewählt&lt;/small>&lt;strong id="wk-goal-step">Wähle deinen Einstieg in drei Schritten&lt;/strong>&lt;/span> |
| A Musterdepot: Aufnahme/Abgabe | `supertrader/assets/st-redesign.js:228` | kauft | class="st-r-gap">' + U.help('Ein Musterdepot ist ein Rechenmodell. Es kauft und verkauft streng nach Regel, damit man si |
| A Musterdepot: Aufnahme/Abgabe | `supertrader/assets/st-redesign.js:228` | verkauft | r-gap">' + U.help('Ein Musterdepot ist ein Rechenmodell. Es kauft und verkauft streng nach Regel, damit man sieht, was d |
| A Musterdepot: Aufnahme/Abgabe | `supertrader/assets/st-redesign.js:326` | kaufen | -gap">' + live.length + ' Methoden laufen als &lt;b>Musterdepot&lt;/b>: Sie kaufen und verkaufen streng nach Regel, live seit  |
| A Musterdepot: Aufnahme/Abgabe | `supertrader/assets/st-redesign.js:326` | verkaufen | ive.length + ' Methoden laufen als &lt;b>Musterdepot&lt;/b>: Sie kaufen und verkaufen streng nach Regel, live seit ' + dDe(sin |
| A Musterdepot: Aufnahme/Abgabe | `supertrader/assets/st-redesign.js:413` | Kauf | p.openCount \|\| 0) + ' von ' + (cfg.maxPositions \|\| '–')], ['Risiko je Kauf', isNum(cfg.riskPerTrade) ? U.num(cfg.riskPer |
| A Musterdepot: Aufnahme/Abgabe | `supertrader/assets/st-redesign.js:414` | Kauf | '&lt;div class="st-r-gap">' + U.help('Risiko je Kauf: Wird der Stop erreicht, verliert das Musterdepot höchstens ' + (isNum |
| A Musterdepot: Aufnahme/Abgabe | `supertrader/assets/st-redesign.js:470` | verkauft | m Stop: So weit darf der Kurs fallen, bevor die Regel das Musterdepot verkauft.') + '&lt;/div>' + |
| A Musterdepot: Aufnahme/Abgabe | `supertrader/assets/st-redesign.js:535` | Kauf | ORPORATE_ACTIONS: 'Splits und Dividenden', EXECUTION_MODEL: 'Ehrliche Kauf- und Verkaufskurse', OUT_OF_SAMPLE: 'Test auf |
| A Musterdepot: Aufnahme/Abgabe | `supertrader/assets/supertrader.js:401` | Kauf | el der jeweiligen Version: Momentum, Weinstein, Darvas und Turtle per Kauf-Stop am Ausbruchspunkt im Tagesverlauf, Miner |
| A Musterdepot: Aufnahme/Abgabe | `supertrader/assets/supertrader.js:656` | Kauf | h('div', { class: 'r2', text: 'Kauf ' + dateShort(p.entryDate) + ' zu ' + num(p.entryPrice) + ' (Rang ' + (p.rankAtEntry |
| A Musterdepot: Aufnahme/Abgabe | `supertrader/assets/supertrader.js:664` | Kauf | ); }).concat(t.orders.buys.map(function (x) { return h('li', { text: 'Kauf ' + x.symbol + ' · Rang ' + x.rank + ' · 10 % |
| A Musterdepot: Aufnahme/Abgabe | `supertrader/assets/supertrader.js:686` | Kauf | turn h('li', { text: dateShort(x.date) + ' · ' + (x.side === 'BUY' ? 'Kauf ' : 'Verkauf ') + x.symbol + ' zu ' + num(x.p |
| A Musterdepot: Aufnahme/Abgabe | `supertrader/assets/supertrader.js:687` | Kauf | + (d.green ? 'grün' : 'rot') + ' · ' + d.candidates + ' Kandidaten · Kauf: ' + (d.buys.join(', ') \|\| '–') + ' · Verkauf: |
| A Musterdepot: Aufnahme/Abgabe | `supertrader/assets/supertrader.js:694` | Kauf | return ['Im Modelldepot', 'good', 'Gewicht ' + pct(p.weight, 1) + ' · Kauf ' + dateShort(p.entryDate) + ' zu ' + num(p.e |
| A Musterdepot: Aufnahme/Abgabe | `supertrader/assets/supertrader.js:700` | Verkauft | if (x) return ['Verkauft', 'mute', dateShort(x.exitDate) + ' · ' + t52Rule(x.exitRuleId, { text: x.exitTex |
| A Musterdepot: Aufnahme/Abgabe | `supertrader/assets/supertrader.js:805` | kauft | er Einstieg. Steigt der Kurs im Tagesverlauf über den Ausbruchspunkt, kauft das Modell (Kauf-Stop); nach einem Gewinner- |
| A Musterdepot: Aufnahme/Abgabe | `supertrader/assets/supertrader.js:805` | Kauf | t der Kurs im Tagesverlauf über den Ausbruchspunkt, kauft das Modell (Kauf-Stop); nach einem Gewinner-Ausbruch gilt das  |
| A Musterdepot: Aufnahme/Abgabe | `supertrader/assets/supertrader.js:893` | kauft | ein Einstieg. Bestätigt heißt: der Trigger wurde erreicht, das Modell kauft nach seiner Regel. Position heißt: simuliert |
| A Musterdepot: Aufnahme/Abgabe | `supertrader/assets/supertrader.js:1231` | Kauf | .trigger.value), p.trigger.basis === 'INTRADAY_BUY_STOP' ? 'geplant · Kauf-Stop darüber' : 'geplant · ' + ({ DAILY_CLOSE |
| A Musterdepot: Aufnahme/Abgabe | `supertrader/assets/supertrader.js:1233` | Kauf | OP' ? (p.entry.gappedAboveTrigger ? ' · Eröffnung über Trigger' : ' · Kauf-Stop') + (p.entry.evidence === 'INTRADAY_1MIN |
| A Musterdepot: Aufnahme/Abgabe | `supertrader/assets/supertrader.js:1255` | Kauf | Ausstieg am Kauftag sicher: Der Tag schloss unter dem Stop – nach dem Kauf muss der Kurs den Stop durchschritten haben.' |
| A Musterdepot: Aufnahme/Abgabe | `supertrader/assets/supertrader.js:1258` | Kauf | offen: Das Tagestief lag unter dem Einstieg. Ob es vor oder nach dem Kauf entstand, zeigen Tageskurse nicht. Das Modell  |
| A Musterdepot: Aufnahme/Abgabe | `supertrader/assets/supertrader.js:1258` | verkauft | sition läuft weiter. Liegt es danach, wäre sie am selben Tag zum Stop verkauft worden.' |
| A Musterdepot: Aufnahme/Abgabe | `supertrader/assets/supertrader.js:1261` | Kauf | 'Ausstieg am Kauftag: ' : 'Kauftag geprüft: ') + 'Die Reihenfolge von Kauf und Tagestief wurde mit Minutenkursen der Bör |
| A Musterdepot: Aufnahme/Abgabe | `supertrader/assets/supertrader.js:1261` | Kauf | rsen der Börse IEX bestimmt' + (sameDay ? ' – der Stop wurde nach dem Kauf erreicht.' : ' – der Stop hielt bis zum Schlu |
| A Musterdepot: Aufnahme/Abgabe | `supertrader/assets/supertrader.js:1262` | kauft | usführung angenommen: Der Kurs eröffnete über dem Trigger, das Modell kauft zur Eröffnung.' : 'Ausführung angenommen: Da |
| A Musterdepot: Aufnahme/Abgabe | `supertrader/assets/supertrader.js:1422` | Kauf | fact('Regeln', 'Kauf bei Wochenschluss über dem 20-Wochen-Hoch, Verkauf unter dem 10-Wochen-Tief; Ausführu |
| A Musterdepot: Aufnahme/Abgabe | `supertrader/assets/supertrader.js:1439` | kauft | nstieg zur nächsten Eröffnung → Stop → Ausstieg. Die laufende Version kauft per Kauf-Stop im Tagesverlauf. Echte Kurse,  |
| A Musterdepot: Aufnahme/Abgabe | `supertrader/assets/supertrader.js:1439` | Kauf | nächsten Eröffnung → Stop → Ausstieg. Die laufende Version kauft per Kauf-Stop im Tagesverlauf. Echte Kurse, kein aktuel |
| A Musterdepot: Aufnahme/Abgabe | `supertrader/assets/supertrader.js:1445` | kauft | rsion) \|\| '') + ' (Bestätigung per Schlusskurs); die laufende Version kauft per Kauf-Stop im Tagesverlauf und unterschei |
| A Musterdepot: Aufnahme/Abgabe | `supertrader/assets/supertrader.js:1445` | Kauf | '') + ' (Bestätigung per Schlusskurs); die laufende Version kauft per Kauf-Stop im Tagesverlauf und unterscheidet sich i |
| A Musterdepot: Aufnahme/Abgabe | `supertrader/assets/supertrader.js:1548` | Kauf | e(d.date) + (d.kind === 'START' ? ' · Start' : ' · Monatsende') + ' · Kauf: ' + ((d.buys \|\| []).join(', ') \|\| '–') + ' · |
| A umformulieren | `dashboard/app-rebuild.js:242` | Kauf | Wellenzählung β:&lt;/b> Über den Button „Elliott-Zonen“ oben lassen sich Kauf-/Verkaufszone und Zielzone rechts vom aktuell |
| A umformulieren | `discover/ui/markets.js:427` | Gewinner | el("div", { class: "dx-movers-raster" }, [spalte("Stärkste Gewinner", m.gainers, "hoch", "kurs-up"), spalte("Stärkste Ve |
| A umformulieren | `discover/ui/v3.js:912` | Gewinner | sec.innerHTML = sect('Gewinner und Verlierer' + (m.session ? ' · ' + day(m.session) : '')) + '&lt;div class="vu-gri |
| A umformulieren | `discover/ui/v3.js:912` | Gewinner | ' + day(m.session) : '')) + '&lt;div class="vu-grid dv3-movers">' + col('Gewinner', m.gainers, false) + col('Verlierer', m. |
| A umformulieren | `magazin/02/index.html:32` | Gewinner | coms Zahlen bestätigen: Der KI-Markt verteilt sich auf mehr als einen Gewinner.&lt;/p>&lt;b>Beobachten:&lt;/b> Kundenkonzentratio |
| A umformulieren | `magazin/02/index.html:34` | Gewinner | e>&lt;article class="card">&lt;span class="label">Jede Sitzung&lt;/span>&lt;h3>KI-Gewinner prüfen&lt;/h3>&lt;p>Nicht nur Umsatzwachstum zä |
| A umformulieren | `screener/engine/fields.js:313` | Mehrrendite | 'Zwölf Monate'], relativeStrength: ['Schlägt die Aktie den Markt?', 'Mehrrendite ggü. Markt, 6 Monate'], |
| A umformulieren | `supertrader/assets/supertrader.js:805` | Gewinner | auf über den Ausbruchspunkt, kauft das Modell (Kauf-Stop); nach einem Gewinner-Ausbruch gilt das 55-Tage-Hoch.' })])); |
| B Dritte kennzeichnen | `analysten/index.html:172` | Kursziele | &lt;div class="page-sub">Konsens-Rating &amp; Kursziele der Wall-Street-Analysten · wöchentlich aktualisiert über Finnhub & |
| B Dritte kennzeichnen | `analysten/index.html:178` | Kaufen | item">&lt;span class="legend-dot" style="background:var(--green)">&lt;/span>Kaufen-Konsens&lt;/span> |
| B Dritte kennzeichnen | `analysten/index.html:180` | Verkaufen | d-item">&lt;span class="legend-dot" style="background:var(--red)">&lt;/span>Verkaufen-Konsens&lt;/span> |
| B Dritte kennzeichnen | `analysten/index.html:184` | Kursziel | &lt;div class="section-label">Kursziel-Potenzial&lt;span class="section-label-note">Ø Kursziel vs. aktueller Kurs&lt;/span>&lt;/d |
| B Dritte kennzeichnen | `analysten/index.html:184` | Kursziel | ="section-label">Kursziel-Potenzial&lt;span class="section-label-note">Ø Kursziel vs. aktueller Kurs&lt;/span>&lt;/div> |
| B Dritte kennzeichnen | `analysten/index.html:191` | Kursziel | ://financialmodelingprep.com" target="_blank" rel="noopener">FMP&lt;/a> (Kursziel-Konsens), aggregiert aus veröffentlichten |
| B Dritte kennzeichnen | `analysten/index.html:208` | Kurszielspanne | &lt;div class="section-label" style="margin-left:20px;margin-right:20px">Kurszielspanne&lt;span class="section-label-note" id= |
| B Dritte kennzeichnen | `analysten/index.html:244` | Kauf | strong_buy: { label: "Klarer Kauf", badge: "buy" }, |
| B Dritte kennzeichnen | `analysten/index.html:245` | Kaufen | buy: { label: "Kaufen", badge: "buy" }, |
| B Dritte kennzeichnen | `analysten/index.html:247` | Verkaufen | sell: { label: "Verkaufen", badge: "sell" }, |
| B Dritte kennzeichnen | `analysten/index.html:396` | Kurspotenzial | '&lt;div class="sum-card">&lt;div class="sum-card-label">Ø Kurspotenzial&lt;/div>&lt;div class="sum-card-value ' + (avgUpside == nul |
| B Dritte kennzeichnen | `analysten/index.html:460` | Kaufen | seg("seg-buy", rec.strongBuy + rec.buy, "Kaufen") + |
| B Dritte kennzeichnen | `analysten/index.html:462` | Verkaufen | seg("seg-sell", rec.sell + rec.strongSell, "Verkaufen") + |
| B Dritte kennzeichnen | `analysten/index.html:511` | Kurspotenzial | '&lt;div class="sum-card">&lt;div class="sum-card-label">Kurspotenzial&lt;/div>&lt;div class="sum-card-value ' + (up!=null?(up>=0?"p |
| B Dritte kennzeichnen | `analysten/index.html:525` | Kursziel | s="pt-marker mean" style="left:' + xPct(pt.targetMean) + '%" title="Ø Kursziel: ' + fmtUSD(pt.targetMean) + '">&lt;/div>' + |
| B Dritte kennzeichnen | `analysten/index.html:553` | Kursziel | if(r.price_target_provider) noteParts.push('Kursziel-Konsens: ' + esc(r.price_target_provider) + '.'); |
| B Dritte kennzeichnen | `analysten/index.html:554` | Kursziel | s.push('Keine Einzelnennung, welche Bank oder welcher Analyst welches Kursziel gesetzt hat — diese Detailtiefe ist bei k |
| B Dritte kennzeichnen | `fundamental/app.js:1496` | Kursziele | ['analysten', 'analysts', 'Analysten', 'Einstufungen und Kursziele'], |
| B Dritte kennzeichnen | `fundamental/app.js:1572` | Kursziele | Für ' + co.t + ' liegen keine Analystendaten vor.', 'Einstufungen und Kursziele führt Vision Universe derzeit für eine k |
| B Dritte kennzeichnen | `fundamental/app.js:1573` | Kauf | var L = a.last, keys = [['strongBuy', 'Starker Kauf'], ['buy', 'Kaufen'], ['hold', 'Halten'], ['sell', 'Verkaufen'], ['s |
| B Dritte kennzeichnen | `fundamental/app.js:1573` | Kaufen | var L = a.last, keys = [['strongBuy', 'Starker Kauf'], ['buy', 'Kaufen'], ['hold', 'Halten'], ['sell', 'Verkaufen'], ['s |
| B Dritte kennzeichnen | `fundamental/app.js:1579` | Kursziel | ? el('div', { class: 'fu-k' }, [el('span', { class: 'fu-k-l', text: 'Kursziel (Mittel)' }), el('b', { class: 'fu-k-v fu- |
| B Dritte kennzeichnen | `fundamental/app.js:1585` | Kursziele | lass: 'fu-card' }, [el('p', { class: 'fu-card-k' }, [el('b', { text: 'Kursziele' }), ' · ' + (tg.provider \|\| '')]), |
| B Dritte kennzeichnen | `fundamental/app.js:1588` | Kursziel | el('p', { class: 'fu-note', text: 'Strich = mittleres Kursziel, Punkt = aktueller Kurs' + (isNum(price) ? ' (' + C.fmt({ |
| B Dritte kennzeichnen | `fundamental/engine/catalog.js:711` | Kauf | var CONSENSUS = { strong_buy: 'Starker Kauf', buy: 'Kaufen', hold: 'Halten', sell: 'Verkaufen', strong_sell: 'Starker Ve |
| B Dritte kennzeichnen | `fundamental/engine/catalog.js:711` | Kaufen | var CONSENSUS = { strong_buy: 'Starker Kauf', buy: 'Kaufen', hold: 'Halten', sell: 'Verkaufen', strong_sell: 'Starker Ve |
| B Dritte kennzeichnen | `fundamental/engine/catalog.js:711` | Verkaufen | = { strong_buy: 'Starker Kauf', buy: 'Kaufen', hold: 'Halten', sell: 'Verkaufen', strong_sell: 'Starker Verkauf' }; |
| B Dritte kennzeichnen | `screener/app.js:144` | Kursziele | { id: 'investoren', label: 'Investoren', pro: true, sub: 'Analysten, Kursziele, Profi-Käufe', world: 'hedgefonds', group |
| B Dritte kennzeichnen | `screener/engine/fields.js:263` | Kursziel | n('priceTargetUpside', { group: 'analysts', unit: 'pct', label: 'Kursziel-Potenzial', en: 'Price Target Upside', source: |
| C Fachbegriff/Kontext, prüfen | `academy/index.html:56` | empfohlene | Academy noch nicht live mit jeder Vision-Universe-Seite — das ist der empfohlene nächste Schritt, sobald die Concept Reg |
| C Fachbegriff/Kontext, prüfen | `app/www/index.html:34` | verkauft | gistrierung und Abonnement laufen weiterhin im Web. Diese Testversion verkauft nichts.&lt;/p> |
| C Fachbegriff/Kontext, prüfen | `assets/stock-navigator.js:42` | kaufen | Hedgefonds", icon: "hedgefonds", why: "Welche Fonds die Aktie halten, kaufen und verkaufen" } |
| C Fachbegriff/Kontext, prüfen | `assets/stock-navigator.js:42` | verkaufen | , icon: "hedgefonds", why: "Welche Fonds die Aktie halten, kaufen und verkaufen" } |
| C Fachbegriff/Kontext, prüfen | `discover/engines/fundamentals.js:451` | kauft | dd("shares_down", "Die Zahl der Aktien ist gesunken - das Unternehmen kauft Aktien zurück (" + fmtPct(ds) + " in " + h.y |
| C Fachbegriff/Kontext, prüfen | `discover/engines/klartext.js:25` | kaufen | etwas anderes als "alle kaufen gerade". Relative Stärke ist nicht |
| C Fachbegriff/Kontext, prüfen | `etf/index.html:702` | Empfehlung | {k:"s",l:"Sparrate / Monat",min:25,max:1500,step:25,u:" €",h:"Empfehlung: 10–15% Nettoeinkommen"}, |
| C Fachbegriff/Kontext, prüfen | `fundamental/app.js:578` | verkauft | var LESSON = [['Umsatz', 'Was die Firma verkauft.'], ['Nettogewinn', 'Was nach allen Kosten und Steuern bleibt.'], ['Fre |
| C Fachbegriff/Kontext, prüfen | `fundamental/app.js:578` | Kauf | Investitionen übrig ist.'], ['KGV', 'Wie viele Jahresgewinne du beim Kauf bezahlst.']]; |
| C Fachbegriff/Kontext, prüfen | `fundamental/app.js:951` | verkauft | case 'revenue': return 'Alles, was ' + name + ' in einem Jahr verkauft hat.'; |
| C Fachbegriff/Kontext, prüfen | `fundamental/app.js:1573` | Verkaufen | y', 'Starker Kauf'], ['buy', 'Kaufen'], ['hold', 'Halten'], ['sell', 'Verkaufen'], ['strongSell', 'Starker Verkauf']]; |
| C Fachbegriff/Kontext, prüfen | `hedgefonds/app.js:33` | Verkauft | reduced: { label: "Reduziert", cls: "down" }, sold: { label: "Verkauft", cls: "down" }, |
| C Fachbegriff/Kontext, prüfen | `hedgefonds/app.js:491` | Verkauft | if (st === "sold") return U.verdict("weak", "Verkauft"); |
| C Fachbegriff/Kontext, prüfen | `hedgefonds/app.js:609` | kaufen | root.innerHTML = intro("Was Profis kaufen", "Große Investoren müssen ihre US-Aktien alle drei Monate der Börsenaufsicht  |
| C Fachbegriff/Kontext, prüfen | `hedgefonds/app.js:609` | kaufen | ktien alle drei Monate der Börsenaufsicht melden. Wir zeigen, was sie kaufen und verkaufen.") + |
| C Fachbegriff/Kontext, prüfen | `hedgefonds/app.js:609` | verkaufen | drei Monate der Börsenaufsicht melden. Wir zeigen, was sie kaufen und verkaufen.") + |
| C Fachbegriff/Kontext, prüfen | `hedgefonds/app.js:661` | Kauft | "Value": "Kauft Firmen, die er für zu billig hält, und wartet.", |
| C Fachbegriff/Kontext, prüfen | `hedgefonds/app.js:662` | Kauft | "Wachstum": "Kauft Firmen, deren Umsatz schnell steigt.", |
| C Fachbegriff/Kontext, prüfen | `hedgefonds/app.js:663` | Kauft | "Aktivist": "Kauft große Anteile und drängt das Management zu Änderungen.", |
| C Fachbegriff/Kontext, prüfen | `hedgefonds/app.js:665` | Kauft | "Qualität": "Kauft Firmen mit hohen Margen und starker Marktstellung und hält sie lange.", |
| C Fachbegriff/Kontext, prüfen | `hedgefonds/app.js:671` | Kauft | "Distressed": "Kauft Firmen in Schwierigkeiten, oft kurz vor oder in der Insolvenz.", |
| C Fachbegriff/Kontext, prüfen | `hedgefonds/app.js:737` | Kauf | }).join("") + '&lt;div class="hf-gap">' + U.help("Wichtig: 13F zeigt nur Kauf-Positionen in US-Aktien. Wetten auf fallende  |
| C Fachbegriff/Kontext, prüfen | `hedgefonds/app.js:823` | kaufen | lche Aktie?", "Tippe eine Aktie an und sieh, welche Fonds sie halten, kaufen oder verkaufen.") + |
| C Fachbegriff/Kontext, prüfen | `hedgefonds/app.js:823` | verkaufen | , "Tippe eine Aktie an und sieh, welche Fonds sie halten, kaufen oder verkaufen.") + |
| C Fachbegriff/Kontext, prüfen | `hedgefonds/app.js:832` | kaufen | ' + U.help("Dieselbe Aktie kann in beiden Listen stehen: Manche Fonds kaufen, andere verkaufen.") + "&lt;/div>" + |
| C Fachbegriff/Kontext, prüfen | `hedgefonds/app.js:832` | verkaufen | selbe Aktie kann in beiden Listen stehen: Manche Fonds kaufen, andere verkaufen.") + "&lt;/div>" + |
| C Fachbegriff/Kontext, prüfen | `hedgefonds/app.js:834` | kaufen | : "#/smart-money", glyph: "line", title: "Insider-Käufe", sub: "Chefs kaufen eigene Aktien" }) + |
| C Fachbegriff/Kontext, prüfen | `hedgefonds/app.js:835` | Einstiege | vcard({ href: "#/smart-money/einstiege", glyph: "plus", title: "Fonds-Einstiege", sub: "Neue Positionen im Quartal" }) + |
| C Fachbegriff/Kontext, prüfen | `hedgefonds/app.js:902` | verkauft | r", help: "Mehr Verkäufer: Deutlich mehr Fonds haben verkleinert oder verkauft als aufgestockt (mindestens 60 % der Bewe |
| C Fachbegriff/Kontext, prüfen | `hedgefonds/app.js:931` | kaufen | class="hf-balance" role="img" aria-label="' + buyers.length + " Fonds kaufen mehr, " + nSell + ' Fonds verkaufen">&lt;div c |
| C Fachbegriff/Kontext, prüfen | `hedgefonds/app.js:931` | verkaufen | a-label="' + buyers.length + " Fonds kaufen mehr, " + nSell + ' Fonds verkaufen">&lt;div class="hf-balance-l">&lt;span>' + buy |
| C Fachbegriff/Kontext, prüfen | `hedgefonds/app.js:931` | kaufen | onds verkaufen">&lt;div class="hf-balance-l">&lt;span>' + buyers.length + " kaufen mehr&lt;/span>&lt;span>" + nSell + " verkaufen&lt;/s |
| C Fachbegriff/Kontext, prüfen | `hedgefonds/app.js:931` | verkaufen | -l">&lt;span>' + buyers.length + " kaufen mehr&lt;/span>&lt;span>" + nSell + " verkaufen&lt;/span>&lt;/div>" + |
| C Fachbegriff/Kontext, prüfen | `hedgefonds/app.js:944` | Verkauft | uvor " + usd(h.v), val: usd(f.totalValueUSD), chg: U.verdict("weak", "Verkauft") }); }).join("") : "") + |
| C Fachbegriff/Kontext, prüfen | `hedgefonds/app.js:1025` | kaufen | enn Chefs und Großaktionäre mit eigenem Geld Aktien der eigenen Firma kaufen." : "Welche Aktien die meisten Fonds neu in |
| C Fachbegriff/Kontext, prüfen | `hedgefonds/app.js:1026` | Einstiege | Insider-Käufe", href: "#/smart-money" }, { id: "funds", label: "Fonds-Einstiege", href: "#/smart-money/einstiege" }], in |
| C Fachbegriff/Kontext, prüfen | `hedgefonds/app.js:1041` | Kauf | >Warum das zählt&lt;/b>&lt;p>Verkäufe haben viele Gründe, etwa Steuern. Ein Kauf mit eigenem Geld meist nur einen: Vertrauen i |
| C Fachbegriff/Kontext, prüfen | `hedgefonds/app.js:1043` | Kauf | (top ? tileLink(tickerHref(top.ticker), "Größter Kauf", top.ticker, usd(top.netBuyUsd90)) : U.tile("Größter Kauf", "–",  |
| C Fachbegriff/Kontext, prüfen | `hedgefonds/app.js:1043` | Kauf | , "Größter Kauf", top.ticker, usd(top.netBuyUsd90)) : U.tile("Größter Kauf", "–", "")) + |
| C Fachbegriff/Kontext, prüfen | `hedgefonds/app.js:1045` | Kauf | '&lt;div class="hf-gap">' + U.help("Insider müssen jeden Kauf binnen zwei Geschäftstagen melden (Form 4). Diese Daten sind  |
| C Fachbegriff/Kontext, prüfen | `hedgefonds/app.js:1048` | Kauf | '&lt;div class="hf-gap">' + U.help("Gruppen-Kauf: Mindestens drei Insider kaufen innerhalb von 30 Tagen. Das ist seltener a |
| C Fachbegriff/Kontext, prüfen | `hedgefonds/app.js:1048` | kaufen | &lt;div class="hf-gap">' + U.help("Gruppen-Kauf: Mindestens drei Insider kaufen innerhalb von 30 Tagen. Das ist seltener al |
| C Fachbegriff/Kontext, prüfen | `hedgefonds/app.js:1066` | Einstiege | (ni[0] ? tileLink(tickerHref(ni[0].ticker), "Meiste Einstiege", ni[0].ticker, "+" + nf0.format(ni[0].newPositions) + " F |
| C Fachbegriff/Kontext, prüfen | `hedgefonds/app.js:1066` | Einstiege | er, "+" + nf0.format(ni[0].newPositions) + " Fonds") : U.tile("Meiste Einstiege", "–", "")) + |
| C Fachbegriff/Kontext, prüfen | `hedgefonds/app.js:1113` | Kauf | s.cb ? '&lt;div class="vu-blank hf-gap">' + U.verdict("strong", "Gruppen-Kauf") + "&lt;span>Mindestens drei Insider haben inne |
| C Fachbegriff/Kontext, prüfen | `hedgefonds/app.js:1196` | Verkauft | return '&lt;h3 class="hf-flowh">Verkauft&lt;/h3>' + (sold.map(function (t) { return holdRow(t, max, { label: "komplett raus", |
| C Fachbegriff/Kontext, prüfen | `hedgefonds/app.js:1198` | verkauft | ced \|\| 0) + " verkleinert + " + nf0.format(tc.sold \|\| 0) + " komplett verkauft (nicht mehr im Depot, daher nicht unter P |
| C Fachbegriff/Kontext, prüfen | `landing/instagram/index.html:89` | Einstieg | &lt;div class="module">&lt;h3>Discover&lt;/h3>&lt;p>Der Einstieg in den Markt: Unternehmen und Themen auf einen Blick entdecken.&lt;/p> |
| C Fachbegriff/Kontext, prüfen | `landing/instagram/index.html:135` | kaufen | &lt;div class="module">&lt;h3>Hedgefonds&lt;/h3>&lt;p>Was kaufen Warren Buffett und andere große Investoren? Ihre gemeldeten Depots  |
| C Fachbegriff/Kontext, prüfen | `landing/partner/index.html:88` | Einstieg | &lt;div class="module">&lt;h3>Discover&lt;/h3>&lt;p>Der Einstieg in den Markt: Unternehmen und Themen auf einen Blick entdecken.&lt;/p> |
| C Fachbegriff/Kontext, prüfen | `landing/partner/index.html:134` | kaufen | &lt;div class="module">&lt;h3>Hedgefonds&lt;/h3>&lt;p>Was kaufen Warren Buffett und andere große Investoren? Ihre gemeldeten Depots  |
| C Fachbegriff/Kontext, prüfen | `morning/2026-10-06/index.html:8` | garantiert | &lt;p>Risiken bleiben. Die Zusammenarbeit garantiert weder konkrete Design Wins noch kurzfristige Umsätze. Neue Prozesse mü |
| C Fachbegriff/Kontext, prüfen | `vorsorge/engines/monitor.js:154` | garantiert | breakEvenNote: guarantee > 0 ? "Der Bestandsvertrag garantiert " + Math.round(guarantee) + " € zum Rentenbeginn. Die Neu |
| C Fachbegriff/Kontext, prüfen | `vorsorge/ui/etf.js:332` | verkauft | \|\| has("OPTION_INCOME")) parts.push("Ein ETF mit Optionsstrategie: Er verkauft Optionen, um Prämien einzunehmen. Steigen |
| C Fachbegriff/Kontext, prüfen | `vorsorge/ui/etf.js:333` | Einstiegszeitpunkt | er Optionen in einem festen Zeitraum begrenzt. Das Ergebnis hängt vom Einstiegszeitpunkt ab."); |
| C Fachbegriff/Kontext, prüfen | `vorsorge/ui/foerderung.js:132` | Garantiertes | - VS.state.plan.age), { min: 1, unit: "Jahre" }) + VS.field("guar", "Garantiertes Kapital", 0, { min: 0, unit: "€ zum Re |
| C Fachbegriff/Kontext, prüfen | `vorsorge/ui/foerderung.js:147` | Garantie | ezahlt inkl. Zulagen ' + F.eurK(s.invested) + (s.guaranteeFloor ? " · Garantie " + F.eurK(s.guaranteeFloor) : "") + '&lt;/p |
| C Fachbegriff/Kontext, prüfen | `vorsorge/ui/foerderung.js:255` | Kauf | ["ETF", "Ein Korb mit vielen Aktien, den du mit einem Kauf bekommst.", "Ein börsengehandelter Fonds. Er bündelt viele We |
| C Fachbegriff/Kontext, prüfen | `vorsorge/ui/foerderung.js:255` | kaufen | t nach einem Index wie dem MSCI World – und lässt sich wie eine Aktie kaufen.", "Exchange Traded Fund"], |
| C Fachbegriff/Kontext, prüfen | `vorsorge/ui/foerderung.js:268` | kaufen | Fs für deine Bank.", "EU-Regelwerk für Fonds. Privatanleger in der EU kaufen in der Regel UCITS-ETFs; US-ETFs sind meist |
| C Fachbegriff/Kontext, prüfen | `vorsorge/ui/plan.js:245` | sicher | '&lt;h3 class="vu-mt" style="font-size:16px;margin-top:16px">Wie sicher ist das Ziel?&lt;/h3>&lt;div class="vs-row-sb" style="mar |
| C Fachbegriff/Kontext, prüfen | `vorsorge/ui/start.js:118` | verkaufen | ["Flexibel", "Pausieren und verkaufen geht jederzeit"]].map(function (x) { return '&lt;div class="vs-check3">&lt;span>' + U. |
| C Fachbegriff/Kontext, prüfen | `vorsorge/ui/start.js:173` | verkaufen | id="vs-isin">&lt;/div>&lt;p class="vu-xs vu-mu" style="margin-top:6px">Wir verkaufen nichts und bekommen keine Provision.&lt;/p>' |
| C Kontext prüfen | `discover/ui/market-intelligence.js:1161` | sicher | el("h3", { text: "Wie sicher sind die Zahlen?" }), |
| C Kontext prüfen | `quant/engines/multi-asset/market-pulse.js:704` | sichere | US10Y: "Renditen bestimmen, was sichere Anlagen abwerfen. Das verändert die relative Attraktivität von Aktien und Anleih |
| C Kontext prüfen | `quant/engines/multi-asset/market-pulse.js:874` | sichere | warum: "Renditen bestimmen, was sichere Anlagen abwerfen. Das verändert die relative Attraktivität von Aktien und Anleih |
| C Kontext prüfen | `supertrader/assets/supertrader.js:1255` | sicher | ' && p.entry.evidence !== 'INTRADAY_1MIN') txt = 'Ausstieg am Kauftag sicher: Der Tag schloss unter dem Stop – nach dem  |
