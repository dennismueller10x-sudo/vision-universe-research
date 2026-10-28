# V9 – Datenrettung

V9 nutzt vorrangig **SEC-Originalquellen** über den bestehenden Client `scripts/quant/sec/http_client.py` (deklarierter User-Agent, ≤ 2 Anfragen/s je Strang, privater Cache außerhalb des Repos). Zusätzlich zwei Bulk-Abrufe (`companyfacts.zip`, `submissions.zip`). Keine neuen Anbieter, keine Käufe, keine Secrets. Rohdaten liegen nur privat; im Repo stehen abgeleitete Fakten mit Akzession, URL, SHA-256 und Zitat ≤ 300 Zeichen.

## Historische Identität ([Belege](v9/identity/README.md))

Die vier „inaktiven Listings ohne Terminalwert“ sind **keine Terminalfälle**: Die Wochenreihe gehört dem heutigen Tickerinhaber, die Masterzeile einem früheren Inhaber desselben Tickers.

| ID | Reihe ist tatsächlich | Masterzeile zeigt | Same-day-Preisbelege | Korrektur |
|---|---|---|---|---|
| COHR | II-VI → Coherent Corp. (CIK 820318) | Coherent Inc. (2022 übernommen) | 11 | Bindung ab 2001-09-28 |
| BGC | eSpeed → BGC (CIK 1094831) | General Cable | 11 | ab 2018-12-07 (Faktor 1,555 ist Newmark-Spin-off, kein Split) |
| DCOM | Bridge Bancorp → Dime (CIK 846617) | Legacy Dime | 14 | ab 2011-03-11 |
| SGI | Tempur → Somnigroup (CIK 1206264) | Silicon Graphics Intl. | 9 | ab 2004-04-02 |
| TRAK | ReposiTrak (CIK 50471) | nicht belegter Altinhaber | 0 (nur Coverseiten) | ganze Reihe |

EFOR und SUNE bleiben gehalten (Preisbruch bzw. unbereinigter Split/CVR). Von 180 mehrdeutigen IDs: 132 als einzelnes Common-Listing aufgelöst, 29 als Nicht-Common bestätigt, 19 ungelöst. Trockenlauf: **4.449 → 4.565 (+116)**. Unabhängige Python-Prüfung 180/180, 7/7, 823 Quellhashes. **Nicht aktiviert**, weil der Adapter auch den Produktlesepfad (`server/quant-backtest-freshness.cjs`) speist; Integration als eigener PR mit Vorher/Nachher. Nachträglich verschärfte Regeln sind offengelegt.

## Corporate Actions ([Belege](v9/corporate-actions/))

Alle 600 CA-Holds exakt reproduziert: 1.391 Verdachtsereignisse, davon 1.087 ungelöst. SEC-Prüfung über Aktienzahl-Kontinuität vor/nach dem Datum, Split-/Spin-off-Filings und XBRL-Splitfakten:

- 158 echte Marktbewegungen gestützt (Negativbeleg), AAPL 2000-09-29 manuell bestätigt.
- 4 belegte Ausschüttungen: ABT/AbbVie, Tyco (ADT + Pentair, heute JCI), SPXC/SPX FLOW, VATE-Sonderdividende – nur Kursrendite zulässig.
- **1 echter Anbieterfehler: PZZA** 2:1-Aktiendividende Dezember 2013 nicht bereinigt (8-K 0001157523-13-005314, XBRL-Splitfakt, Aktienzahl ×1,94). Korrektur: Schlüsse bis 2013-12-27 × 0,5 – muss der Erzeuger neu bauen.
- Trockenlauf: **4.449 → 4.530 (+81)**; nicht aktiviert (Filter nach Sicht auf Teilergebnisse justiert, schwache Identitätsprüfung).
- 218 Wochenlücken: 641 Lücken klassifiziert, 92 = Delisting mit eingefrorenem Kurs, 43 = Anbieterlöcher bei fortbestehender Notierung (2016). Keine Interpolation.
- **Neuer Befund:** 96 *qualifizierte* Reihen enden mit ≥ 8 identischen Wochenschlüssen (z. B. CHL, 2021 delistet, weiter ACTIVE). Der Adapter prüft das nicht.

## SEC / PIT ([Belege](v9/secpit/summary.json))

- **FY 43830** = Excel-Seriennummer für 2019-12-31 im Original-10-K von PRTH (`0001653558-20-000015`); ebenso 43465. Weitere Filerfehler: WTBA „2107“, STX „2027“. Insgesamt 9 falsche Fiskaljahr-Labels bei 8 Emittenten, 1.438 Beobachtungen; sie stehen in committeten Consumer-Bundles.
- **Verfügbarkeit vor Periodenende:** 904 heute (Archiv V8: 911). 79er-Stichprobe gegen Originalinstanzen: alle zukunftsdatierten Kontexte stehen so beim Filer (Fälligkeitspläne, erklärte Dividenden, falsch datierte Vergleichswerte, Coverdaten nach Acceptance). Richtige PIT-Behandlung: aus Periodenzeitreihen ausschließen, Verfügbarkeit **nicht** verschieben.
- **Wirkung auf veröffentlichte Werte:** STX Marktkapitalisierung 137,0 statt 146,0 Mrd. (+6,6 %), netDebtToAssets 0,4167 statt 0,1904; PRTH/WTBA ohne berechenbare Marktkapitalisierung; ASLE ~+11 %.
- **Neue Originalvintages:** 60 Akzessionen (20 Emittenten, 2009–2026, vorab registriert): 1.105/1.105 Werte exakt; 10/10 Restatement-Paare bestätigen as-filed-Werte in companyfacts.
- **Zeitzonenfalle:** Bulk-`submissions.zip` liefert `acceptanceDateTime` in 35/56 Fällen 4–5 h zu spät; die API stimmt 56/56 mit dem SGML-Header. Die Pipeline nutzt den Bulk nur für SIC-Codes.

## Dividenden und Terminalereignisse ([Belege](v9/portfolio/portfolio-v9-index.json))

Dividendenvollständigkeit 2015Q1–2026Q3 aus SEC-Originalen: MSFT 47/47, WMT 47/47, NVDA 46/47, IBM 43/47, A 28/47, JPM 15/47, XOM 14/47, META 1/11. Kein SEC-Dokument nennt Ex-Tage; abgeleitete Ex-Tage (T+3/T+2/T+1) sind als solche markiert. Terminalereignisse mit Zitat: CRNX $85,00 bar, LBRDK 0,236 CHTR, DBRG $16,00, TWO $12,00, WBS 2,0548 ADS + $48,75, TALK $5,25. Befund: Tagesreihen führen nach dem belegten letzten Handelstag 1–2 Wiederholungsschlüsse.

## Verbleibende Datenlücken

Vollständige historische Common-Population inkl. Delistings; Original-Membership-Historie; Dividenden für JPM/XOM/META u. a.; Ex-Tage aus Quellen; Zahlungseingang terminaler Barbeträge; 309 CA-Fälle vor XBRL; 19 ungelöste Identitäten; Firmen-Veröffentlichungszeit (Acceptance bleibt Obergrenze).

## Zugänge

Kein fehlender Zugang festgestellt. Die privaten Actions-Caches (Discover/Tiingo/SEC) und R2 bleiben über die bestehenden manuellen Jobs in `quant-ci.yml` erreichbar; V9 benötigte sie nicht. Cache-Retention ist keine Archivzusage.
