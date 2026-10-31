# Ticker-Wiederverwendungen: belegte Zurückhaltung im Produktuniversum (31.10.2026)

Auftrag des Owners vom 31.10.: Die 14 im Security-Master-Lauf gefundenen Ticker-Wiederverwendungen werden so korrigiert, dass Discover-Seite, Kursreihe, Unternehmensidentität und securityId wieder eindeutig zusammenpassen. Grundlage sind die bestehenden Identitätsregeln und Belege, nie der Ticker allein. Unklare Fälle werden bis zur Korrektur sicher ausgeschlossen, Warnungen werden nicht bloß unterdrückt.

## 1. Befund

Mit der Anbieterliste vom 31.10. (`supported_tickers.zip`, sha256 `fc51593e…`, 109.176 Zeilen) lassen sich die Fälle eindeutig zuordnen.

**13 Fälle: Der Ticker gehört heute einem ETF.** Die alte Aktienzeile ist beendet. Eine neue ETF-Zeile beginnt genau dort, wo unsere Tagesreihe beginnt (bei INVN schneidet die Kontinuitätsprüfung später ab). Der Stamm (1.1.0 auf `main`) führt unter der securityId nur die Zeile der alten Aktie (gleicher Beginn), die neue ETF-Zeile fehlt. Im Stamm 1.3.0 (Lauf 41186967651, zurückgenommen mit #1204) war diese Zeile beendet und inaktiv. Produktseite, Name und Eignung stammen dagegen noch aus der alten Zeit.

| securityId | alte Identität (Anbieter-Ende) | heutiges Wertpapier (Anbieter) | eigene Reihe ab | Eignung bisher |
|---|---|---|---|---|
| ref_ACTS | Actions Semiconductor ADR (2016-12-20) | ETF, NYSE ARCA, ab 2026-03-19 | 2026-03-19 | SEPARATE_CLASS |
| ref_BREW | Aktie, NASDAQ (2020-09-30) | ETF, BATS, ab 2026-05-06 (Corgi Coffee & Energy Drinks ETF) | 2026-05-06 | ELIGIBLE |
| ref_ENTL | Entellus Medical (2018-02-28) | ETF, BATS, ab 2026-06-23 | 2026-06-23 | ELIGIBLE |
| ref_FTPA | FTAC Parnassus Acquisition (2023-03-15) | ETF, NYSE ARCA, ab 2025-11-10 | 2025-11-10 | SEPARATE_CLASS |
| ref_GNMX | Medgenics (2020-02-03) | ETF, BATS, ab 2026-05-06 | 2026-05-06 | ELIGIBLE |
| ref_INVN | InvenSense (2017-07-17) | ETF, NYSE ARCA, ab 2025-01-07 (Alger Russell Innovation ETF) | 2025-10-06 | ELIGIBLE |
| ref_NMBL | Nimble Storage (2017-08-17) | ETF, NYSE ARCA, ab 2025-10-31 | 2025-10-31 | ELIGIBLE |
| ref_NYNY | Aktie, NASDAQ (2019-11-22) | ETF, BATS, ab 2026-05-06 (Corgi NYC Based ETF) | 2026-05-06 | ELIGIBLE |
| ref_PCLN | Priceline.com (2018-02-26) | ETF, NYSE ARCA, ab 2025-10-16 | 2025-10-16 | ELIGIBLE |
| ref_TRIL | Trillium Therapeutics (2021-11-18) | ETF, BATS, ab 2025-09-30 | 2025-09-30 | ELIGIBLE |
| ref_USX | U.S. Xpress (2023-06-30) | ETF, BATS, ab 2026-06-03 | 2026-06-03 | ELIGIBLE |
| ref_WR | Aktie, NYSE (2018-06-05) | ETF, BATS, ab 2026-05-06 (Corgi U.S. War Machine ETF) | 2026-05-06 | ELIGIBLE |
| ref_WX | WuXi PharmaTech ADR (2015-12-10) | ETF, BATS, ab 2026-06-03 | 2026-06-03 | SEPARATE_CLASS |

Die SEC-Tickerliste (`company_tickers_exchange.json`, 31.10.) führt keinen der 13 Ticker. Das passt zu einem ETF und widerspricht jeder Zuordnung zu einem operativen Unternehmen. Alle 13 stehen außerdem im Identitäts-Sperrprotokoll für Backtests (`identity-blocklist-probe-20261030.json`, `SERIES_CONTINUES_AFTER_PROVIDER_END`).

**1 Fall ist keine Wiederverwendung: ref_EDVA.**
- SEC CIK 0001553788 hieß bis 2026-08-21 „Splash Beverage Group, Inc.“, seither „Endovia Health Sciences, Inc.“ (EDGAR, frühere Namen). Die SEC-Tickerliste ordnet EDVA dieser CIK an der NYSE zu.
- Der Anbieter beginnt am Umfirmierungstag eine neue Zeile (NYSE MKT → AMEX, dieselbe Börsenfamilie).
- Es ist dieselbe Emittentin, also keine falsche Firmenzuordnung. Der Titel wird **nicht** zurückgehalten.
- Offen sind der Name (Splash → Endovia) und die Verknüpfung der neuen Anbieterzeile im Stamm. Dafür ist ein eigener Erzeuger-PR nötig. Bis dahin zeigt die Seite den alten Namen derselben Firma.

## 2. Korrektur in diesem PR (Quant/Market) und im Folge-PR (Discover)

- **Register** `quant/config/ticker-reuse-quarantine.json` (Schema `ticker-reuse-quarantine-1.0.0`) mit 13 Einträgen, Aktion `IDENTITY_QUARANTINED`. Jeder Eintrag belegt:
  - die alte Anbieterzeile und ihren Wertpapiertyp;
  - die neue Anbieterzeile;
  - die eigene Reihe;
  - die Stammzeile;
  - den bisherigen Produktstand.
- **`scripts/market/universe-source.mjs#resolveProductUniverse`** ist die einzige Quelle des Produktuniversums. Sie markiert die 13 Titel mit `identityStatus: IDENTITY_QUARANTINED` und `identityReason`; Anzahl in `counts.identityQuarantined`, Liste in `identityQuarantine.flagged`.
  - Die Mitgliedschaft bleibt bestehen, deshalb bleiben Kursreihen, Datenhygiene (DH1) und Pipeline unverändert.
  - **Warum nicht einfach herausnehmen:** Die Hygieneprüfung verlangt dann sofort, dass Kursreihen und abgeleitete Artefakte verschwinden. Neu bauen kann das nur die Pipeline mit Anbieterzugang. `main` und der Nachtlauf wären bis dahin rot.
- **Fail closed:** Ein Eintrag wirkt nur, wenn
  - die securityId `core/identity.js` folgt,
  - sich der Wertpapiertyp unterscheidet,
  - die neue Anbieterzeile nach dem Ende der alten beginnt
  - und die eigene Reihe nach dem Ende der alten Zeile anfängt.

  Formfehler brechen die Auflösung ab.
- **Anzeige (Folge-PR, Discover-Gate):**
  - Discover liest `identityStatus`. Markierte Titel kommen nicht in Rankings, Sammlungen, Feeds oder Empfehlungen.
  - Die Seite zeigt deutlich „Identität in Prüfung: unter diesem Ticker handelt heute ein anderes Wertpapier“ statt einer stillen Zuordnung zum alten Unternehmen.
  - Screener und Supertrader lesen die Discover-Ausgabe und folgen damit.
- **Unberührt:** `eligibility.json` und alle generierten Daten. Die Wirkung tritt beim nächsten regulären Discover-Neubau ein.

## 3. Wann ein Eintrag entfällt

Ein Eintrag wird entfernt, sobald eine der beiden Bedingungen erfüllt ist:
- Der Stamm führt das neue Listing unter der securityId. Dann ordnet die Eignung den ETF regulär ein; ETFs gehören nicht zum Konsumuniversum.
- Für das neue Wertpapier besteht eine eigene Identität nach ADR-001. Ticker-Wiederverwendung ist dort als „bewusst offen“ geführt, das wäre ein eigenes Projekt.

## 4. Bekannte Grenze

`scripts/technical/build-technical-intelligence.mjs` liest die langen Wochenreihen direkt und nicht über `resolveProductUniverse`. Ob Technical die 13 Titel ebenfalls ausschließt, gehört in die Technical-Welt (eigener PR) und wird hier nur festgehalten.
