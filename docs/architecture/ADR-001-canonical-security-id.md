# ADR-001: Eine Identitätsregel für Wertpapiere

**Status:** angenommen, 03.10.2026 · **Kontext:** Plattform-Audit

## Kontext

Vor dem Audit bildeten Skripte und Engines den Schlüssel `ref_<…>` auf sieben verschiedene Arten:

| Variante | Beispiel BRK-B |
|---|---|
| Nicht-Alphanumerisches → `_` | `ref_BRK_B` |
| nur `-` → `_` | `ref_BRK_B` (bei `BRK.B` aber `ref_BRK.B`) |
| `.` und `-` → `_` | `ref_BRK_B` |
| alle Trenner entfernt | `ref_BRKB` |
| `-` und `.` behalten | `ref_BRK-B` |
| gar nicht normalisiert (`"ref_" + ticker`) | `ref_BRK-B` |
| fest eingetragen | `ref_BRKB` |

Belegte Folgen:

- BRK-B (1,4 % S&P-Gewicht) fehlte in Faktoren und Discover. Der Abruf lief über `quant/config/tiingo-universe.json` als `ref_BRKB`, der Wertpapierstamm kennt `ref_BRK_B`.
- Supertrader-Wochencharts für BRK-A, MOG-A, PBR-A und BF-B zeigten auf Dateien, die es nicht gibt.
- Das Intraday-Siegel nach Börsenschluss blieb dauerhaft offen. Damit lief der Nachzug des Universums nach einem ausgefallenen Lauf nie.

## Entscheidung

1. `core/identity.js` ist die **einzige** Bildung der `securityId`:
   `"ref_" + ticker.toUpperCase().replace(/[^A-Z0-9]/g, "_")`.
   Sie ist byte-gleich zu `company-master.js#legacySecurityId`. `core/tests/identity.test.mjs` prüft beides gegen alle Ticker des Produktuniversums.
2. Kein Skript bildet `"ref_" + ticker` selbst. Ein Test prüft das für die produktwirksamen Erzeuger.
3. `matchKey()` (ohne Trenner) dient nur dem Abgleich **fremder** Listen, zum Beispiel ETF-Bestände. Als Identität taugt er nicht, weil er nicht eindeutig ist.
4. Die drei Kennungen haben feste Rollen:
   - `securityId`: Artefaktschlüssel.
   - `instrumentId` (`vu_…`): Instrument im Company Master.
   - `issuerId` (`iss_cik_…`): Unternehmen.
   Produkte verknüpfen Daten **über `securityId`/`instrumentId`, nicht über Tickerstrings**.
5. `DQ-ID-1` und `DQ-ID-2` (`core/data-quality.js`) prüfen jede ausgelieferte `securityId` gegen die Regel.

## Bewusst offen (Folgearbeit)

- **Die `securityId` ist tickerbasiert und damit nicht stabil bei Umbenennungen** (FB→META) oder Symbolwiederverwendung.
  Die stabile Identität ist langfristig `instrumentId` mit Generationen, ergänzt um ISIN, FIGI oder `permaTicker` des Anbieters.
  Heute ist keiner dieser Identifikatoren befüllt (0 von 7.809). Eine Migration der Artefaktschlüssel ist ein eigenes Projekt mit Doppelschreibphase.
- Der Umbenennungspfad (`tiingo2-identity.mjs`) bekommt keine Eingaben (`symbolActions=[]`).
- Mehrere Produkt-Builder verknüpfen weiter per Ticker mit „first match wins“: `build-discover-data.mjs:449`, `screener/build-universe.mjs:155`.
  `DQ-ID-3` meldet dafür aktive Symbolkollisionen.

## Konsequenzen

- Der nächste Marktdaten-Refresh holt BRK-B unter `ref_BRK_B`. Die alte Datei `ref_BRKB.json` wird nicht mehr fortgeschrieben.
- Neue Skripte importieren `core/identity.js`. Test-Fixtures, die Skripte in einen Temp-Baum kopieren, müssen `core/` mitkopieren.

## Ergänzung A1 (11.11.2026): Listing-Intervall und stabile Entität (PIT-F3)

**Problem.** Die `securityId` ist tickerbasiert. Bei einer Umbenennung (FB → META) bricht die Kette; bei Ticker-Wiederverwendung teilen zwei Emittenten dieselbe `securityId`. Das Backtest-Panel kennt kein Listing-Intervall.

**Entscheidung.**
1. **Stabile Entität = Emittent (`issuerId`, CIK).** Die `securityId` bleibt Artefaktschlüssel und ändert sich nicht. Bestehende Schlüssel und Shards (`shardKey`) bleiben gültig; es gibt keine Migration und keine Doppelschreibphase.
2. **Listing = (Emittent, Ticker, von, bis)**, Grenzen inklusive, `null` = offen. Kennung `lst_<CIK10>_<Ticker ohne ref_>_<von|00000000>` (`core/listing-register.js#listingId`, eigener Namensraum, nie als Artefaktschlüssel).
3. **Ort:** Die Funktionen stehen in `core/listing-register.js` neben `core/identity.js`, nicht darin (Supertrader pinnt den Hash von `core/identity.js`; wie `core/issuer-alias.js`). Die `securityId` entsteht weiter nur über `core/identity.js#securityIdForTicker`.
4. **Übersetzungsregister** `core/listing-register.js#createListingRegister(rows).resolve(securityId|Ticker, asOf)` ordnet eine vorhandene `securityId` zu einem Tag einem Emittenten zu: `OK`, `UNKNOWN` (außerhalb jedes Intervalls) oder `AMBIGUOUS` (zwei Emittenten am selben Tag). Es wird nie geraten. `listingsOf(issuer)` liefert die Kette über Tickerwechsel.
5. **Panel (optional, rückwärtskompatibel):** `securities[i].listing = {cik, from, to}`. `portfolio-backtest.cjs#decide` nimmt einen Titel außerhalb seines Intervalls nicht als Kandidat; `validatePanel` weist ungültige Intervalle (`PANEL_LISTING_INVALID`) und gleiche `id` zweier Emittenten mit überlappenden Intervallen (`PANEL_LISTING_COLLISION`) ab. Ohne `listing` ändert sich nichts.
6. Quelle der Intervalle: Company Master (`firstTradeDate`, `lastTradeDate`/`delistedAt`, `cik`). Fehlt ein Datum, ist das Intervall offen; Unbekanntes bleibt unbekannt.

**Schattenprüfung** (`scripts/quant/pit-listing-shadow.mjs`, nur lesend, 11.11.2026): 6461 Instrumente mit CIK, 6461 Listings; jede aktive `securityId` löst am Stichtag auf ihren eigenen Emittenten auf (6461 OK, 0 AMBIGUOUS, 0 UNKNOWN, 0 falscher Emittent). 613 Emittenten tragen mehr als eine `securityId` (überwiegend weitere Anteilsklassen, nicht nur Umbenennungen); 0 Ticker mit mehreren Emittenten im heutigen Stamm (die Wiederverwendung betrifft beendete Titel, die der heutige Stamm nicht führt). 1348 Instrumente ohne CIK bleiben ohne Zuordnung.

**Bewusst offen.**
- Migration der Artefaktschlüssel auf `instrumentId`/Listing-Kennung (weiter eigenes Projekt, ISIN/FIGI/`permaTicker` sind 0 von 7.809 befüllt).
- Das Panel-Universum bleibt „heutige Dateien plus V13-Ketten“; Intervalle aus dem Company Master ergänzen es, ersetzen aber keine vollständige Historie beendeter Titel. Eine Panel-Kette über einen Tickerwechsel hinweg (zwei Panel-Zeilen eines Emittenten zu einer Rendite verbinden) braucht Kurs- und Kapitalmaßnahmen-Belege und ist ein eigener Fachmodell-PR.
- **Panel-Kette über Tickerwechsel** wird nicht umgesetzt: Der Schattenbericht (`chainCandidates`) findet im heutigen Panel 0 Kandidaten (gleiche CIK, Intervalle höchstens 14 Tage getrennt). Ein Verbinden braucht Kurs- und Kapitalmaßnahmen-Belege und tritt erst mit beendeten Titeln auf; eigener Fachmodell-PR.

**Builder (umgesetzt, opt-in `--listing` / `buildPanel({listing:true})`).** `model-portfolios.cjs` setzt `listing` aus dem Company Master, nur wenn Master-CIK und Bündel-CIK übereinstimmen (3 Widersprüche bleiben ohne `listing`). Vorher/Nachher auf dem Panel 2012–2026: 5165 von 5168 Titeln mit Intervall; 4789 von 4.239.872 Kurs-Titelwochen (0,11 %, 5 Titel) liegen außerhalb ihres Intervalls; Ø Universum 3117,0 → 3115,8; quality-compounder CAGR unverändert 2,92 %, momentum-leader 0,67 % → 0,95 % (Forschung, nicht zertifiziert). Einschalten ist eine Forschungsentscheidung für den nächsten Research-Lauf.
