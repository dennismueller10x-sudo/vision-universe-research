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
