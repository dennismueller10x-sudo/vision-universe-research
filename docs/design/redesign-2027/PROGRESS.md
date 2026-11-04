# Redesign 2027 – Fortschritt

Arbeitsliste der Umsetzung (Frontend-Strang D, Owner-Chat). Wer neu einsteigt oder nach einer Zusammenfassung weitermacht: **hier weitermachen.**
Vorlage: `README.md`, `HANDOVER.md`, Mockups `worlds/*.js`, Bausteine `lib.js`, Tokens im `<style>` von `index.html`.

Status: `offen` · `in Arbeit` · `fertig` (gemergt nach `main`) · `–` (Übersichtsfolie). Abnahme je Seite nach Folie Ü3.

## Vorgaben für offene Entscheidungen (Owner, 04.11.2026)

- Pro-Preis immer live aus `/v1/plans`, nie fest eingetragen.
- Neue Adressen wie im Bauplan (`/aktie/<T>`, `/discover/#/swipen`, `/fundamental/#/ranglisten`, `/technical/#/muster`); alte Adressen leiten weiter.
- Urteile und Wortwahl wie in den Mockups.
- Backtests als „0 von 9 Regelversionen“.
- Konten, Stripe, Brevo bleiben geschaltet wie sie sind (`docs/accounts/FREIGABEN.md`).

## PR-Kette

| # | PR | Inhalt | Folien | Stand |
|---|---|---|---|---|
| 1 | #1340 | Vorlage `docs/design/redesign-2027/` nach `main`, diese Liste | – | gemergt |
| 2 | #1345 | Schritt 1+2: Bausteine C04–C20 als eigene Komponente (`assets/vu-ui.css/.js`), C06 (`assets/vu-chart.js` 2.1.0), Musterseite `/status/bausteine/`, Regel 1, Shell aus #1331 ohne Datenläufe | A3, C, N1–N3 | offen |
| 3 | #1346 | Schritt 3: Aktienkopf C04 + Perspektiven-Leiste C05 (sieben Perspektiven) für alle Welten | N4, N5 | offen |
| 4 | #1350 | Discover D09: Aktienseite Überblick (discover/ui/overview.js), Analyse unter „Alle Kennzahlen“ PRO | D09 | offen |

Übernommene Zweige der früheren Sitzung (Stand `docs/neustart/D-frontend.md` im Zweig `neustart/d-shell-dock`):
`neustart/d-startseite` (E01), `neustart/d-mein-bereich` (E02, E08), `neustart/d-aktienkopf` (C04, C05, C06), `neustart/d-discover-aktie` (D09).

## Stand je Folie

| ID | Seite | Stand | PR / Zweig | Abweichung / Notiz |
|---|---|---|---|---|
| A1 | So liest du diese Präsentation | – |  | Übersichtsfolie, nichts zu bauen |
| A2 | Für wen wir bauen | – |  | Übersichtsfolie, nichts zu bauen |
| A3 | Sieben Regeln für jede Seite | in Arbeit | #1345 (ersetzt #1331) |  |
| N1 | Das Navigationsmodell | in Arbeit | #1345 (ersetzt #1331) |  |
| N2 | Produkt-Leiste je Welt | in Arbeit | #1345 (ersetzt #1331) |  |
| N3 | Das Menü | in Arbeit | #1345 (ersetzt #1331) |  |
| N4 | Aktienkopf: Icons oder Perspektiven-Leiste? | in Arbeit | #1346 |  |
| N5 | Perspektive, Welt und Leiste | in Arbeit | #1346 |  |
| N6 | Einsteiger und Profi | offen |  |  |
| C | Bausteine C01–C20 | in Arbeit | #1345 (ersetzt #1331) |  |
| E01 | Einstieg · Startseite | in Arbeit | Zweig neustart/d-startseite |  |
| E02 | Mein Bereich · Willkommen | in Arbeit | Zweig neustart/d-mein-bereich |  |
| E03 | Einstieg · Preise Free/Pro | offen |  |  |
| E04 | Einstieg · Registrieren mit Pro-Wahl | offen |  |  |
| E05 | Einstieg · Anmelden | offen |  |  |
| E06 | Konto · Pro-Bestellung | offen |  |  |
| E07 | Mein Bereich · Konto | offen |  |  |
| E08 | Mein Bereich · Mein Dashboard | in Arbeit | Zweig neustart/d-mein-bereich |  |
| E09 | Mein Bereich · Watchlist-Detail | offen |  |  |
| E10 | Einstieg · AI Atlas | offen |  |  |
| E11 | Einstieg · Erster Start | offen |  |  |
| E12 | Einstieg · Checkout-Ablauf Free → Pro | offen |  |  |
| D01 | Discover · Übersicht | offen |  |  |
| D02 | Discover · Welten | offen |  |  |
| D03 | Discover · Thema KI | offen |  |  |
| D04 | Discover · Strategien | offen |  |  |
| D05 | Discover · Swipen | offen |  |  |
| D06 | Discover · Suchen | offen |  |  |
| D07 | Discover · Märkte | offen |  |  |
| D08 | Discover · Watchlist | offen |  |  |
| D09 | Discover · NVIDIA (Aktienseite) | in Arbeit | #1350 | Kurs im Kopf in Anzeigewährung (€) statt $ + ≈ € (Querschnitt Währung offen); Jahresspanne in % statt $; d09-c Merken-Sheet wartet auf Benachrichtigungen (Backend) |
| Q00 | Quant · So ist die Welt gebaut | offen |  |  |
| Q01 | Quant · Übersicht | offen |  |  |
| Q02 | Quant · Screener | offen |  |  |
| Q03 | Quant · Strategien | offen |  |  |
| Q04 | Quant · Aktien | offen |  |  |
| Q05 | Quant · Methodik | offen |  |  |
| Q06 | Quant · Technische Lagen | offen |  |  |
| Q07 | Quant · NVIDIA (Aktienseite, Perspektive Faktoren) | offen |  |  |
| Q08 | Quant · NVIDIA Zahlen (Perspektive Zahlen) | offen |  |  |
| Q09 | Quant · NVIDIA Chartbild (Perspektive Chart) | offen |  |  |
| T01 | Technical · Übersicht | offen |  |  |
| T02 | Technical · Screener | offen |  |  |
| T03 | Technical · Vorlagen | offen |  |  |
| T04 | Technical · Gespeicherte Suchen | offen |  |  |
| T05 | Technical · Methodik | offen |  |  |
| T06 | Technical · NVIDIA im Chart | offen |  |  |
| F01 | Fundamental · Übersicht | offen |  |  |
| F02 | Fundamental · Entdecken | offen |  |  |
| F03 | Fundamental · Rangliste Wachstum | offen |  |  |
| F04 | Fundamental · Suchen | offen |  |  |
| F05 | Fundamental · Methodik | offen |  |  |
| F06 | Fundamental · NVIDIA in Zahlen | offen |  |  |
| W01 | Elliott · Übersicht | offen |  |  |
| W02 | Elliott · Welle 3 | offen |  |  |
| W03 | Elliott · Aufwärts | offen |  |  |
| W04 | Elliott · Neu und verändert | offen |  |  |
| W05 | Elliott · NVIDIA in Wellen | offen |  |  |
| ST01 | Supertrader · Übersicht | offen |  |  |
| ST02 | Supertrader · Methoden | offen |  |  |
| ST03 | Supertrader · Methode Minervini VCP | offen |  |  |
| ST04 | Supertrader · Signale | offen |  |  |
| ST05 | Supertrader · Backtests | offen |  |  |
| ST06 | Supertrader · Quellen | offen |  |  |
| ST07 | Supertrader · Hausstrategie | offen |  |  |
| ST08 | Supertrader · NVIDIA (Perspektive Methoden) | offen |  |  |
| ST-Z | Supertrader · Zustände in Alltagssprache | offen |  |  |
| H01 | Hedgefonds · Übersicht | offen |  |  |
| H02 | Hedgefonds · Investoren | offen |  |  |
| H03 | Hedgefonds · Datenbank | offen |  |  |
| H04 | Hedgefonds · Aktien | offen |  |  |
| H05 | Hedgefonds · Fonds Pershing Square | offen |  |  |
| H06 | Hedgefonds · Smart Money | offen |  |  |
| H07 | Hedgefonds · NVIDIA (Perspektive Investoren) | offen |  |  |
| S01 | Screener · Übersicht | offen |  |  |
| S02 | Screener · Filter hinzufügen | offen |  |  |
| S03 | Screener · Treffer | offen |  |  |
| S04 | Screener · Gespeichert | offen |  |  |
| S05 | Screener · Watchlist | offen |  |  |
| V01 | Vorsorge · Start | offen |  |  |
| V02 | Vorsorge · Planer | offen |  |  |
| V03 | Vorsorge · ETFs | offen |  |  |
| V04 | Vorsorge · ETF-Detail | offen |  |  |
| V05 | Vorsorge · Portfolio | offen |  |  |
| V06 | Vorsorge · Vergleichen | offen |  |  |
| V07 | Vorsorge · Förderung | offen |  |  |
| V08 | Vorsorge · Veränderungen | offen |  |  |
| V09 | Vorsorge · Wissen | offen |  |  |
| V10 | Vorsorge · Der 10-Euro-Sparplan (Ablauf) | offen |  |  |
| V10 | Vorsorge · Der 10-Euro-Sparplan | offen |  |  |
| Ü1 | Reihenfolge der Umsetzung | – |  | Übersichtsfolie, nichts zu bauen |
| Ü2 | Alle Seiten mit Adresse | – |  | Übersichtsfolie, nichts zu bauen |
| Ü3 | Abnahmekriterien | – |  | Übersichtsfolie, nichts zu bauen |
| Ü4 | Auftrag an Claude Code | – |  | Übersichtsfolie, nichts zu bauen |

## Nicht möglich / übersprungen

- WebKit ist in dieser Sitzung nicht installiert (Vorgabe: Playwright nicht neu installieren). Lokal prüft Chromium; WebKit prüft `shell-ci` in jedem PR.
- Quant CI ist auf `main` vorbestehend rot (Strang A); die Kette wertet sie nur, wenn die Fehlschläge neu sind.

## Backend-Zusätze (nach den Schritten 1–6)

| Zusatz | Stand | Notiz |
|---|---|---|
| Modus Einsteiger/Fortgeschritten/Profi + Ziel aus dem ersten Start (`settings.mode`) | offen | Konto-Einstellung, Produktion bleibt aus |
| Gespeicherte Suchen im Konto | offen | |
| Benachrichtigungen (Kursgrenze, Quartalszahlen, Setups) | offen | |
| Gemeinsame Aktienadresse `/aktie/<T>` mit Weiterleitungen | offen | |
| Screener-Kriterien aus 13F und Supertrader | offen | |
| Datenquelle Insider-Käufe | offen | bis dahin „bald“ |
