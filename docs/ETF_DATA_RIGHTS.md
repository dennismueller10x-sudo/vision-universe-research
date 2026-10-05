# ETF-Daten: Nutzungsrechte je Quelle

Stand: 05.10.2026. Grundlage: Prüfläufe in GitHub Actions
(`scripts/vorsorge/probe-etf-sources.mjs`, `scripts/vorsorge/probe-eu-etf-sources.mjs`,
Ergebnisse in `vorsorge/data/sources/etf-source-probe.json` und `etf-eu-source-probe.json`)
sowie Recherche der Nutzungsbedingungen. Lokal sind die meisten Domains gesperrt; alle
Abrufe liefen in GitHub Actions.

Vision Universe veröffentlicht Daten auf einer öffentlichen Website. Maßgeblich ist deshalb
nicht nur, ob ein Abruf technisch möglich ist, sondern ob **Anzeige (Redisplay)** und
**abgeleitete Werte** erlaubt sind.

## Status-Werte

| Status | Bedeutung | Produktiv? |
|---|---|---|
| `ALLOWED` | Nutzung und Veröffentlichung ausdrücklich erlaubt | ja |
| `ATTRIBUTION_REQUIRED` | erlaubt mit Quellenangabe (ggf. „transformiert“) | ja, mit Quellenangabe |
| `INTERNAL_ONLY` | nur interne Nutzung | nein |
| `MANUAL_IMPORT_ONLY` | nur manueller Download/Import | nur nach manueller Prüfung |
| `LICENSE_REQUIRED` | Veröffentlichung nur mit Lizenz/schriftlicher Zustimmung | nein |
| `UNKNOWN` | Bedingungen erlauben und verbieten nicht ausdrücklich | **nein** (Regel: UNKNOWN wird nicht automatisch veröffentlicht) |
| `NOT_PERMITTED` | Bedingungen verbieten Abruf oder Weitergabe | nein |

## Quellen

| Quelle | Daten | Status | Beleg (Auszug) | Im Produkt |
|---|---|---|---|---|
| SEC N-PORT, SEC Risk/Return, SEC EDGAR | US-Holdings, Kosten, SIC | `ALLOWED` (gemeinfrei, US government work) | SEC Data Sets | ja |
| ESMA FIRDS / FITRS | ISIN, Handelsplätze, CFI | `ATTRIBUTION_REQUIRED` | „Reproduction of all information on this site (REGISTERS information) is authorised except as otherwise stated, provided the source is acknowledged“ (registers.esma.europa.eu, Legal Notice); transformierte Daten als transformiert kennzeichnen | ja |
| ESMA-Register „Cross-border distribution of funds“ | UCITS-Status, Verwalter, Vertriebsländer | `ATTRIBUTION_REQUIRED` | dieselbe Legal Notice | ja (neu) |
| GLEIF | LEI, Rechtsordnung | `ALLOWED` (CC0) | LEI Data Terms of Use | ja |
| EZB-Referenzkurse | Devisenkurse | `ATTRIBUTION_REQUIRED` | „may be reused free of charge on the condition that the source is quoted … and that the statistics … are not modified“ | vorbereitet, nicht benötigt |
| BaFin (Website/Datenbanken) | Fondsdatenbank | `ATTRIBUTION_REQUIRED` | „Die über die Webseite der Bafin abrufbaren Inhalte und Dokumente dürfen grundsätzlich gespeichert, weitergegeben und vervielfältigt werden.“ | nein – Datenbank aus GitHub Actions nicht erreichbar (Abruf scheitert) |
| Central Bank of Ireland | Register der UCITS (PDF, ohne ISIN) | `ATTRIBUTION_REQUIRED` | „you are free to re-use the information on this website without seeking prior permission“ | nein – redundant zum ESMA-Register |
| CSSF Luxemburg | Kennungslisten | `LICENSE_REQUIRED` | „Reproduction or distribution … is only permitted upon prior written consent from the CSSF“ | nein |
| Deutsche Börse: Xetra-Instrumentenliste (CSV), ETF/ETP-Stammdatenblatt (XLSX) | WKN, laufende Kosten, Replikation, Ertragsverwendung, Index | **`UNKNOWN`** | Disclaimer (cashmarket.deutsche-boerse.com/cash-de/disclaimer) regelt Haftung, Links, Marken – keine Erlaubnis, kein Verbot. Datenbankherstellerrecht (§ 87b UrhG) bei Übernahme wesentlicher Teile | **nein** – Pipeline fertig, nur Abdeckungszahlen; Freigabe per `VU_PUBLISH_XETRA_REFDATA=1` nach schriftlicher Bestätigung |
| Deutsche Börse: verzögerte Handelsdaten | Trades (15 Min. verzögert) | `LICENSE_REQUIRED` bei Kommerzialisierung | kostenlos nur, „if the Delayed Data User does not commercialize the Delayed Data“; ca. 24 h abrufbar | nein |
| Xetra Public Data Set (AWS) | 1-Minuten-OHLCV | `NOT_PERMITTED` | eingestellt („Deprecated“, Bucket 403), Lizenz nicht-kommerziell | nein |
| Euronext, SIX, LSE, Borsa Italiana, Tradegate, gettex, Börse Stuttgart | Kurse, Listen | `NOT_PERMITTED` / `LICENSE_REQUIRED` | jeweils persönliche/nicht-kommerzielle Nutzung, Weitergabe nur mit Zustimmung | nein |
| Indexanbieter (MSCI, STOXX, FTSE, S&P DJI, Solactive) | Indexstände | `LICENSE_REQUIRED` | keine Ableitung/Weitergabe ohne Lizenz | nein – Tracking Difference daher nicht berechnet |
| 17 ETF-Emittenten (iShares, Vanguard, Amundi, Xtrackers, SPDR, Invesco, WisdomTree, UBS, HSBC, JPMorgan, Fidelity, VanEck, BNP Paribas, L&G, Franklin Templeton, Global X, First Trust) | Holdings, Factsheets, KID, EMT/EPT | `NOT_PERMITTED` / `LICENSE_REQUIRED`; EMT/EPT `INTERNAL_ONLY` (nur für Vertriebe) | Website-Bedingungen: persönliche, nicht-kommerzielle Nutzung; Weitergabe nur mit schriftlicher Zustimmung; Vanguard verbietet automatisierten Zugriff ausdrücklich | nein – nur manueller Import-Parser |
| Tiingo | US-Kurse | **Risiko** | laut Bedingungen (Suchauszug): Power/Commercial ohne Weitergaberecht; Anzeige auf einer Website erfordert eine Redistribution-/Display-Lizenz | ja (bestehend) – **Lizenzstatus prüfen** |

## Offene Rechtsfragen (Entscheidung nötig)

1. **Deutsche Börse Referenzdaten**: schriftlich anfragen (Market Data + Services,
   mds.agreements@deutsche-boerse.com), ob WKN, laufende Kosten, Replikation,
   Ertragsverwendung und Index aus den öffentlichen Xetra-Downloads auf einer
   werbefinanzierten bzw. kostenpflichtigen Website angezeigt werden dürfen.
   Die Pipeline ist fertig; Abdeckung siehe `vorsorge/data/sources/xetra-refdata-stats.json`.
2. **Tiingo**: Prüfen, ob der bestehende Plan die öffentliche Anzeige der US-Kurscharts
   abdeckt. Die öffentlich auffindbaren Bedingungen sehen dafür eine separate Lizenz vor.
3. **Bestehender Index-Abruf** `scripts/market/build-index-membership.mjs` lädt
   Emittenten-Holdings automatisiert – nach den geprüften Bedingungen nicht erlaubt.
4. **KID-Verlinkung**: auf offizielle KID-URLs zu verlinken ist nach EU-Rechtsprechung
   (Svensson) in der Regel zulässig; einige Emittenten-Bedingungen schränken selbst das
   Verlinken ein. Bis zur Klärung keine Kopien, nur Verweise.
