# Redesign 2027 – Fortschritt

Arbeitsliste der Umsetzung (Frontend-Strang D, Owner-Chat). Wer neu einsteigt oder nach einer Zusammenfassung weitermacht: **hier weitermachen.**
Vorlage: `README.md`, `HANDOVER.md`, Mockups `worlds/*.js`, Bausteine `lib.js`, Tokens im `<style>` von `index.html`.

Status: `offen` · `in Arbeit` · `fertig` (gemergt nach `main`) · `teilweise` (gemergt, Rest in der Notiz) · `–` (Übersichtsfolie). Abnahme je Seite nach Folie Ü3.

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
| 2 | #1345 | Schritt 1+2: Bausteine C04–C20 (`assets/vu-ui.css/.js`), C06 (`assets/vu-chart.js` 2.1.0), Musterseite `/status/bausteine/`, Regel 1, Shell | A3, C, N1–N3 | gemergt |
| 3 | #1346 | Schritt 3: Aktienkopf C04 + Perspektiven-Leiste C05 (sieben Perspektiven) | N4, N5 | gemergt |
| 4 | #1350 | Discover D09: Aktienseite Überblick, Analyse unter „Alle Kennzahlen“ PRO | D09 | gemergt |
| 5 | #1351 | Quant Q01–Q05, Q07 (Schritte 1–6), Q08; Prüfungen nachgezogen | Q01–Q05, Q07, Q08 | gemergt |
| 6 | #1353 | Z2: eine Aktienadresse `/aktie/<T>?p=` | Z2, N4 | gemergt |
| 7 | #1355 | Fundamental | F01–F06 | gemergt |
| 8 | #1356 | Elliott | W01–W05 | gemergt |
| 9 | #1357 | Hedgefonds | H01–H07 | gemergt |
| 10 | #1360 | Screener | S01–S05 | gemergt |
| 11 | #1361 | Supertrader (Gate A) | ST01–ST08 | gemergt |
| 12 | #1362 | Vorsorge | V01–V10 | gemergt |
| 13 | #1363 | Technical | T01–T06 | gemergt |
| 14 | #1366 | Einstieg, Konto, Mein Bereich, Atlas, erster Start | E01–E12, Z7, Z1 (Seite) | gemergt |
| 15 | #1367 | Discover | D01–D08 | gemergt |
| 16 | #1364 | Gemeinsam: Leisten Fundamental/Technical/Discover, Fundamental-Ansichten keine Aktien | C02, C03 | gemergt |
| 17 | #1391 | Z5: Screener-Kriteriengruppe „Methoden“ aus den Supertrader-Spalten (#1389) | S02, Z5 | offen |
| – | #1359 | Konto Z1+Z3 (Worker, Migration, Tests), Basis main, unabhängig | Z1, Z3 | gemergt |

Übernommene Zweige der früheren Sitzung (Stand `docs/neustart/D-frontend.md` im Zweig `neustart/d-shell-dock`):
`neustart/d-startseite` (E01), `neustart/d-mein-bereich` (E02, E08), `neustart/d-aktienkopf` (C04, C05, C06), `neustart/d-discover-aktie` (D09).

## Stand je Folie

| ID | Seite | Stand | PR / Zweig | Abweichung / Notiz |
|---|---|---|---|---|
| A1 | So liest du diese Präsentation | – |  | Übersichtsfolie, nichts zu bauen |
| A2 | Für wen wir bauen | – |  | Übersichtsfolie, nichts zu bauen |
| A3 | Sieben Regeln für jede Seite | fertig | #1345 (ersetzt #1331) |  |
| N1 | Das Navigationsmodell | fertig | #1345 (ersetzt #1331) |  |
| N2 | Produkt-Leiste je Welt | fertig | #1345 (ersetzt #1331) |  |
| N3 | Das Menü | fertig | #1345 (ersetzt #1331) |  |
| N4 | Aktienkopf: Icons oder Perspektiven-Leiste? | fertig | #1346 |  |
| N5 | Perspektive, Welt und Leiste | fertig | #1346 |  |
| N6 | Einsteiger und Profi | offen |  |  |
| C | Bausteine C01–C20 | fertig | #1345 (ersetzt #1331) |  |
| E01 | Einstieg · Startseite | fertig | #1366 | Pro-Preis als „Preis ansehen“ (Startseite ohne Abruf) |
| E02 | Mein Bereich · Willkommen | fertig | #1366 |  |
| E03 | Einstieg · Preise Free/Pro | fertig | #1366 | Preis aus `/v1/plans`; Zustand „Gerade nicht buchbar“ |
| E04 | Einstieg · Registrieren mit Pro-Wahl | fertig | #1366 | kein „erneut senden“ (Worker ohne Endpunkt), dafür „Adresse ändern“; gemeinsame Kopfzeile bleibt |
| E05 | Einstieg · Anmelden | fertig | #1366 | gemeinsame Kopfzeile bleibt |
| E06 | Konto · Pro-Bestellung | fertig | #1366 | Platzhalter „1,00 €“ entfernt; Pflichttext wortgleich |
| E07 | Mein Bereich · Konto | fertig | #1366 | eine Seite statt Reiter; Erfahrung bis Z1-Anbindung lokal |
| E08 | Mein Bereich · Mein Dashboard | fertig | #1366 | Abmelden ins Konto verschoben |
| E09 | Mein Bereich · Watchlist-Detail | fertig | #1366, #1411 | Karten nach Mockup; Benachrichtigungen als Schalter in der Karte statt Sheet (e09-b), Werkzeugleiste (Suche, Sortierung) bleibt unter den Chips |
| E10 | Einstieg · AI Atlas | fertig | #1366 | Worker vu-ask unverändert; statt Jahresreihe Balken je Kennzahl über die Aktien (Atlas-Engine liefert keine Zeitreihe) |
| E11 | Einstieg · Erster Start | fertig | #1366 | `/willkommen/start/`, `localStorage vu-start-v1`; Anbindung an `/v1/me` (Z1, #1359) offen: `signale`→`strategien`, `mode`→`experienceLevel`, `onboardedAt:true` |
| E12 | Einstieg · Checkout-Ablauf Free → Pro | – | #1366 | keine eigene Oberfläche (E03 → E04 → E06) |
| D01 | Discover · Übersicht | fertig | #1367 | Swipen-Karte ohne „400“ (Feed nicht auf der Startseite geladen); Index/Kurse in Anzeigewährung |
| D02 | Discover · Welten | fertig | #1367 | große Karte „Zum Einstieg“ statt „Meistgeöffnet“ (keine Nutzungsdaten) |
| D03 | Discover · Thema KI | fertig | #1367 | Mini-Charts laden in Sichtweite |
| D04 | Discover · Strategien | fertig | #1367 | „Täglich neu: Heute im Blick“ statt „Beliebteste“; vier Gruppen fest in v3.js bis Registry-Feld `group`; `#/strategien/<id>` |
| D05 | Discover · Swipen | fertig | #1367 | `#/swipen` (`#/einzeln/<U>` leitet um); Zähler „1 von 400“; Leiste über #1364 |
| D06 | Discover · Suchen | fertig | #1367 | „Bekannte Namen“ mit 12-Monats-Pille statt „Oft gesucht“ (keine Suchstatistik) |
| D07 | Discover · Märkte | teilweise | #1367 | nur die Übersicht; `#/maerkte/<Symbol>` und Einordnung noch alt |
| D08 | Discover · Watchlist | teilweise | #1367 | Teil: bleibt `/discover/#/watchlist`; Benachrichtigungen fehlen (Z4); „Liste bearbeiten“ |
| D09 | Discover · NVIDIA (Aktienseite) | fertig | #1350 | Kurs im Kopf in Anzeigewährung (€) statt $ + ≈ € (Querschnitt Währung offen); Jahresspanne in % statt $; d09-c Merken-Sheet wartet auf Benachrichtigungen (Backend) |
| Q00 | Quant · So ist die Welt gebaut | fertig | #1412 | Methodik/Backtest unter „Quant“, Technische Lagen unter „Aktien“ (Leiste und App) |
| Q01 | Quant · Übersicht | fertig | #1351 | Setup-Karten ohne „Schluss … $“ (Ressourcen-Budget der Startseite) |
| Q02 | Quant · Screener | fertig | #1351, #1410 | Einfach nach Mockup; „Eigene Bedingung“ als Sheet (q02-c); Profi dunkel mit Bereichsreglern, Spaltenwahl und Tabelle (q02-b); Quant V1 & Marktdaten bleiben im Regel-Editor (`?daten=v1`) |
| Q03 | Quant · Strategien | fertig | #1351, #1410 | Detail (q03-b) nach Mockup; Knopf „Im Quant Screener öffnen und anpassen“ (Produktgrenze: Verweise in den Quant-Screener nennen Quant); bekannte Namen nach redaktioneller Bekanntheit (Discover) |
| Q04 | Quant · Aktien | fertig | #1351 | Aktienzeilen ohne Kurs/Mini-Chart (keine Kursabfrage je Zeile auf dieser Seite) |
| Q05 | Quant · Methodik | fertig | #1351, #1410 | Anteil je Frage (PRO) aus factorWeights; Unterkapitel ohne eigene Vorlage (nur q05-a), bleiben im bisherigen Stil |
| Q06 | Quant · Technische Lagen | offen |  |  |
| Q07 | Quant · NVIDIA (Aktienseite, Perspektive Faktoren) | fertig | #1351 | Lange Seite mit Schritten 1–6 nach Mockup (Überblick, Fragen, Stärken/Risiken, Veränderungen mit Kacheln, Setup-Karte + Stil-Karten mit Regel-Haken, Rückblick schwarz + Evidenz). Offen: Kopf in $ + ≈ € (Querschnitt Währung), Herz statt „Beobachten“, Quant-Chart → C06, Kursstärke-Verlauf mit Schwelle 70, Ereignis-Zeitleiste, Beleg-Sheet. Rückblick zeigt „ähnliche Situationen dieser Aktie“ (replay), nicht „Setup bestätigt in 552 Wochen“ (setup-replay-v1 lädt die Seite nicht). Alte Inhalte vollständig unter „Einstieg, Stop, Ziele …“ und „Alle Belege …“. |
| Q08 | Quant · NVIDIA Zahlen (Perspektive Zahlen) | fertig | #1351 | Kopf ohne Kurs (Seite lädt keinen Kurs); Kachel „Wachstum 3 Jahre“ durch „Stand“ ersetzt |
| Q09 | Quant · NVIDIA Chartbild (Perspektive Chart) | offen |  |  |
| T01 | Technical · Übersicht | fertig | #1363 | Sheet „Was ist ein Setup?“ ohne Beispielchart; „Heute neu im Chart“ lädt nach dem ersten Bild; Markt heute ≥ 60 % Stark, ≥ 40 % Gemischt, sonst Schwach |
| T02 | Technical · Screener | fertig | #1363 | „Melden“ ohne Funktion bis Z4 (Owner-Freigabe Versand) |
| T03 | Technical · Vorlagen | fertig | #1363 | Detail bleibt `#/vorlagen/<id>` (TPL.href in der Engine) |
| T04 | Technical · Gespeicherte Suchen | fertig | #1363 | Änderung „seit dem letzten Kursstand“ (im Browser) statt „seit gestern“; Glocke bis Z4 gesperrt; Konto-Speicherung über Z3 (#1359, keine Owner-Freigabe nötig) nachziehen |
| T05 | Technical · Methodik | fertig | #1363 | `#/muster`, `#/methodik` zeigt dieselbe Seite; früherer Inhalt unter „Regeln“ |
| T06 | Technical · NVIDIA im Chart | fertig | #1363 | Kopf aus dem Navigator ohne Satz zur Firmentätigkeit; 1T gesperrt (nur Tagesschlüsse); Urteil nach SMA 50/200, RSI ab 50 Stark |
| F01 | Fundamental · Übersicht | fertig | #1355 | Fehlerzustand unter den Ranglisten-Karten, wenn das Universum nicht lädt |
| F02 | Fundamental · Entdecken | fertig | #1355 | Titel „Ranglisten“/„Auswahlen“ statt „Entdecken“ (neuer Leistenplatz); `#/entdecken` leitet weiter |
| F03 | Fundamental · Rangliste Wachstum | fertig | #1355 | echte Plätze nur im Code geprüft (Universum lokal nicht da), CI prüft |
| F04 | Fundamental · Suchen | fertig | #1355 | Kopfzeilen-Suche selbst bleibt site-navigation |
| F05 | Fundamental · Methodik | fertig | #1355 | alter Volltext hinter „Alle Formeln PRO“ |
| F06 | Fundamental · NVIDIA in Zahlen | fertig | #1355 | Kurschart im Überblick entfällt (Perspektive Chart); „Mehr“ als Chip-Zeile; SEC-Hinweis grau am Ende |
| W01 | Elliott · Übersicht | fertig | #1356 | Suche als echtes Feld (ohne Atlas-Knopf); „Weitere Reihen“ zeigt alle 8 Reihen |
| W02 | Elliott · Welle 3 | fertig | #1356 | Karten in Reihenfolge der Reihe, 10 je Seite |
| W03 | Elliott · Aufwärts | fertig | #1356 | zusätzlicher Filter `rolle=motiv` |
| W04 | Elliott · Neu und verändert | fertig | #1356 | Schalter „Melden“ sichtbar, aus: kommt mit Z4 (Owner-Freigabe) |
| W05 | Elliott · NVIDIA in Wellen | teilweise | #1356 | Teil: Reihenfolge, Ausblick schwarz mit C08, Profi-Knopf PRO. Offen: Chart mit Unterstützung/Widerstand statt Szenario-Zonen, kompakte Projektionskarte, kurze Profi-Ansicht |
| ST01 | Supertrader · Übersicht | fertig | #1361 | „Neu erkannt heute“ heißt „Heute durchgerechnet“ (Stufe-3-Treffer; kein sauberer Vortagsvergleich in den Daten) |
| ST02 | Supertrader · Methoden | teilweise | #1361 | Karten führen in die bisherige Kandidatenansicht `?sf=Cxx` (noch alter Stil) |
| ST03 | Supertrader · Methode Minervini VCP | teilweise | #1361 | Teil: fertig für 5 Musterdepot-Methoden; bei 52W, CAN SLIM, Piotroski, Greenblatt, Namenskarten nur Kopf + „Wie belastbar?“ |
| ST04 | Supertrader · Signale | fertig | #1361 | „Neu am letzten Handelstag“; vor Einstieg Leiste Grenze · Kurs · Marke |
| ST05 | Supertrader · Backtests | fertig | #1361 | „0 von 9“ aktive Regelversionen; Pilot mit S&P 500 gestrichelt, „Forschung, nicht zertifiziert“ |
| ST06 | Supertrader · Quellen | fertig | #1361 | echte Zahlen (59 Quellen, 53 mit Adresse, 10 im Volltext) |
| ST07 | Supertrader · Hausstrategie | fertig | #1361 |  |
| ST08 | Supertrader · NVIDIA (Perspektive Methoden) | fertig | #1361 | Antwort aus Daten („1 Methode erkennt NVIDIA“); Technical-Abschnitt entfällt (Perspektive Chart) |
| ST-Z | Supertrader · Zustände in Alltagssprache | offen |  |  |
| H01 | Hedgefonds · Übersicht | fertig | #1357 | Suche bleibt echte Hedgefonds-Suche (ohne Atlas-Knopf) |
| H02 | Hedgefonds · Investoren | fertig | #1357 | 12 Stil-Chips aus den Daten; Sortierung im eigenen Sheet |
| H03 | Hedgefonds · Datenbank | fertig | #1357 | neue Adresse `#/investoren/alle`; Region nur Alle/DACH (Daten); alte Chips bleiben |
| H04 | Hedgefonds · Aktien | fertig | #1357 | „Alle 4.850“ lädt stufenweise statt eigener Seite |
| H05 | Hedgefonds · Fonds Pershing Square | fertig | #1357 | Zeilen zusätzlich mit Wert und Stückzahl; Quartale im Akkordeon |
| H06 | Hedgefonds · Smart Money | fertig | #1357 | Insider-Käufe aus vorhandener Quelle `ownership-signals-v1` (Form 4) |
| H07 | Hedgefonds · NVIDIA (Perspektive Investoren) | fertig | #1357 | `#/aktie/<T>`, CUSIP leitet um; Urteil ≥ 60 % Käufe „Mehr Käufer“, ≥ 60 % Verkäufe „Mehr Verkäufer“, sonst „Ausgeglichen“ |
| S01 | Screener · Übersicht | fertig | #1360 | Satz startet leer statt mit Beispielsatz; Ideenzahlen live aus der Engine |
| S02 | Screener · Filter hinzufügen | fertig | #1360 | Profi: Gruppen UND/ODER bleiben; Kriterium-Sheet mit „Genau einstellen“ |
| S03 | Screener · Treffer | fertig | #1360, (dieser PR) | „Aktie öffnen“ nach s03-b: Kopf (C04), Perspektiven-Leiste (C05), „Aus deinem Screen · Treffer k von N“ mit Urteil je Regel, dann der Inhalt der Perspektive der meistgenutzten Filter (Zahlen → Kennzahlen mit Säulen, letzte neongrün; Chart → Chart), Vor/Zurück darunter. Abweichung: bleibt ein Sheet über der Trefferliste statt eigener Seite, weil der Screener eine eigene statische App ist; so bleiben Treffer, Filter und die Screener-Leiste beim Blättern erhalten. „Aktie vollständig öffnen“ führt zur Aktienseite. |
| S04 | Screener · Gespeichert | fertig | #1360 | Neu/raus aus den zwei letzten Läufen; „Im Konto speichern“ = bald bis Z3 (#1359) gemergt ist |
| S05 | Screener · Watchlist | fertig | #1360 | `?view=saved&tab=watchlist`; „Als Screen filtern“ bald (Engine filtert keine Symbolliste) |
| V01 | Vorsorge · Start | fertig | #1362 | Sheet „Erster Besuch“ öffnet in automatisierten Browsern nicht von selbst (`#/?lage=1` erzwingt) |
| V02 | Vorsorge · Planer | fertig | #1362 | Monte-Carlo bleibt unter „Profi“ (als Spanne); Plan im Browser bis Konto |
| V03 | Vorsorge · ETFs | fertig | #1362 | „Alle“ sortiert nach Historienlänge (Municipal-Fonds oben); Fondsvermögen wäre besser – Nacharbeit |
| V04 | Vorsorge · ETF-Detail | teilweise | #1362 | Teil: Bestände noch alte Tabelle, Planspiel noch alte dunkle Karte |
| V05 | Vorsorge · Portfolio | teilweise | #1362 | Teil: X-Ray-Abschnitte altes Layout (neu gefärbt), Mischungen mit Kreisen statt Gewichtsbalken |
| V06 | Vorsorge · Vergleichen | fertig | #1362 | Standard URTH gegen SPY; Kosten unter `#/vergleichen/kosten` |
| V07 | Vorsorge · Förderung | fertig | #1362 | Beispielfälle unter `#/foerderung/faelle` |
| V08 | Vorsorge · Veränderungen | fertig | #1362 | „Benachrichtigen“ nur lokal (Z4) |
| V09 | Vorsorge · Wissen | fertig | #1362 | Datenbeispiel nur für Schwankung und größten Rückgang (URTH) |
| V10 | Vorsorge · Der 10-Euro-Sparplan (Ablauf) | fertig | #1362 | `#/start` in sechs Schritten ohne Kopf/Leiste; Plan im Browser |
| V10 | Vorsorge · Der 10-Euro-Sparplan | fertig | #1362 | `#/start` in sechs Schritten ohne Kopf/Leiste; Plan im Browser |
| Ü1 | Reihenfolge der Umsetzung | – |  | Übersichtsfolie, nichts zu bauen |
| Ü2 | Alle Seiten mit Adresse | – |  | Übersichtsfolie, nichts zu bauen |
| Ü3 | Abnahmekriterien | – |  | Übersichtsfolie, nichts zu bauen |
| Ü4 | Auftrag an Claude Code | – |  | Übersichtsfolie, nichts zu bauen |

## Stand 05.11.2026 (Kette gemergt)

Alle Welt-PRs der Kette sind auf `main`. Beim Einbau nachgezogen (gleiche Absicht der Prüfungen, neue Stellen):
Fundamental (Kontrast Lime-Chip und Aussage-Karte im Dunkelmodus), Elliott (graue Schrift im Wellen-Bild, Check `.el-split`),
Screener (Check `.sc-counter`), Technical (Katalog-Test), Discover (keine fest verdrahtete Währung in `v3.js`, Märkte-Verlaufslinie
ab 60×20, Startseiten-Kopf alt/neu), Einstieg (Konto- und Nutzerreise-QA auf E02–E11; Dashboard-Suchfeld 16px, „Rückgängig“ 36px,
Konto-Umschalter 40px; erster Start trägt „E-Mail bestätigt“ weiter), Gemeinsam #1364 (Shell-QA: Willkommensseite mit Leiste,
Vorsorge-Zuordnung Planer/Portfolio; Atlas ohne gemeinsamen Kopf; Supertrader-Risiko als „Luft bis zum Stop“; Hero-Abgleich
ohne Hedgefonds; Swipen-Eintrag zeigt auf `#/einzeln/US_REAL`, das Discover auf `#/swipen` weiterleitet).

Nächste Schritte (Steuerung 05.11.): Q02 Profi-Modus, Q03 Detail, D07 Unterseiten, E09 aufklappbare Karte, Q00/N6;
danach die übrigen `teilweise`-Folien. Vorbestehend rot auf `main` (Daten, nicht Redesign): zusätzlich Quant/Technical
„L1–L3 Datensatz-Spalte = SMA 150 …“ seit 05.11. morgens.

## Stand 05.11.2026 nachmittags

Gemergt nach der Kette: #1391 (Z5 Methoden im Screener), #1413 (Erster Start, Atlas, Preise ohne eingefügte Navigation; sync-navigation-Ausstieg per Meta), #1411 (E09), #1410 (Q02 Profi und Eigene Bedingung, Q03 Detail, Q05 Anteile; PRO-Marke und Zeitraum-Leiste barrierefrei), #1426 (Momentaufnahme der Abfrage-Engine um die Z5-Felder). Q00 in #1412.
Rest: N6 (Einsteiger/Profi über alle Seiten, braucht settings.experienceLevel in jeder Welt), D07 Unterseiten (keine Vorlage), D08, W05, ST02, ST03, S03, V04, V05, Q06, Q09, ST-Z; Wortwahl-Befunde aus #1405 (Strang F) als eigener PR; Schritt 6 (Dunkel, Feinschliff, Browser-QA aller Seiten gegen Ü3).
Datenstand auf `main` (nicht Redesign): Quant Browser-QA „aktie-aaac: ETF ohne Kursverlauf“ (AAAC nicht mehr im Analyseuniversum), Security-Master-Neubau.

## Gemeinsame Nacharbeit aus den Welt-PRs (ein PR nach allen Berichten)

- `assets/site-navigation.js` Leisten: Fundamental „Ranglisten · Branchen · Methodik“ (`#/ranglisten`, `#/branchen`) samt `core/tests/shell-navigation.test.mjs` und `scripts/quality/shell-browser-qa.mjs`; Technical „Muster“, Elliott „Methodik“, Discover „Swipen“ → `#/swipen`.
- `core/stock-context.js#parse`: einteilige Fundamental-Routen `#/ranglisten`, `#/branchen`, `#/suche`, `#/entdecken` nicht als Aktie lesen.
- `scripts/quality/currency-debt-patterns.mjs`: `fundamental` in `SCAN_DIRS`.
- Elliott-Leiste: „Methodik“ statt „Suche“. Elliott-Größentest EH-15 bei 62,3 von 64 KB.
- Datenfrage an Strang A: negative Invalidierungspreise im Elliott-Index (z. B. CHGA −4,38 $), Karte zeigt „–“.
- UIP-Revisionsnummern der Welt-PRs (z. B. #1356 UIP-R30) beim Einbau neu vergeben (`uip.mjs`).
- Gemeinsamer Sparkline-Lader und `VUUI`-Lesart-Karte in `assets/`.
- Erledigt in #1351: Sheets (C16) liegen über Kopfzeile und Dock (`z-index`), Hedgefonds-Ausnahme kann entfallen.
- Bausteine zusätzlich als DOM-Knoten (Screener hat C07/C08/C09/navcard/HUD lokal nachgebaut).
- Einbettbare Aktienseite für S03-b; Symbol-Filter in der Screener-Engine für S05.
- `VUChart`: Marken (①②), Zonen-Töne, Vergleichslinie (Supertrader zeichnet sie selbst); `VUUI.sheet` mit Schließen-Knopf; `VUUI` Suchfeld zum Tippen.
- `VUUI.glyph`: Stern, Kreis-Anteil, Abspielen, Säulen; `VUChart` mehrere Linien mit gestrichelten Szenarien; Bausteine Gewichtsbalken, Regler, ETF-Zeile, Ablauf-Kopf.
- `site-navigation.css`: `.vu-bar>i` olivgrün und `.up` grün (Regel 1) – prüfen.
- Dunkelmodus: `.vu-box--ink` kehrt sich wie in der Vorlage (`--a-ink:#fff`) um; Vorsorge hält ihre Karten dunkel (Abweichung, lime Zahlen sonst unlesbar).
- Technical-Menü: Screener, Vorlagen (`#/screener?reiter=vorlagen`), Gespeichert (`?reiter=gespeichert`), Chart, Muster (aktiv bei muster und methodik); Menü-Check in `technical/…/browser-qa.mjs` mitziehen.
- `VUStockNavigator.head`: Option für den Satz zur Firmentätigkeit; `VUChart`: Zonen.
- `VUUI.bars` kürzt Beschriftungen auf 2 Zeichen (Ticker passen nicht); Tagesbewegungs-/Mini-Chart-Helfer (lokal `mein-dashboard/today.js`); Kopfzeilen-Modus „Zurück · Titel · Aktion“.
- Aufräumen später: `discover/home.css` alte Startseiten-Stile, `discover/ui/feed.js` ungenutzt.
- `VUUI.navcard` mit eigenem Symbol (Fundamental hat lokal nachgebaut).
- Fundamental-Produktdokument: Urteilsregel F06 in einem Satz (schwächere der beiden Discover-Stufen aus `fundamentals.health`).

## Nicht möglich / übersprungen

- WebKit ist in dieser Sitzung nicht installiert (Vorgabe: Playwright nicht neu installieren). Lokal prüft Chromium; WebKit prüft `shell-ci` in jedem PR.
- Quant CI ist auf `main` vorbestehend rot (Strang A); die Kette wertet sie nur, wenn die Fehlschläge neu sind.
- Seit 04.11. abends auf `main` rot durch Datenläufe (Strang A, nicht Redesign): Quant „published inventory … 191 inactive security-master rows“ (nach #1370 Security Master 1.3.0); Core `discover-universe.test.mjs` (golden company searches, ISIN/Aliase, kanonischer Lader) und Discover „Pflichttitel in der Suchdatei“ nach dem automatischen Europe-Schlusskurs-Lauf (mit dem Europa-Datenstand vor dem Lauf grün, lokal nachgeprüft).
- Ebenfalls vorbestehend auf `main` (Datenstand, nicht Code): Discover `names.test.mjs` NM3 und `producer-ownership` (Neubau), Vorsorge „Build reproduzierbar“. Nach CLAUDE.md (Neustart) blockiert veralteter Datenstand keinen Code-PR; die Kette mergt, wenn alle übrigen Prüfungen grün sind.

## Backend-Zusätze (Projekt Z1–Z7, `docs/PLAN_NEUSTART_2026-11.md` §7)

Steuerung (Owner, 04.11.2026): Mockups sind verbindlich (Reihenfolge, Abstände, Schriftgrößen, Bausteine, Wortwahl; Abnahme nach Ü3). Strang D baut Z1, Z2, Z3 und Z7 jeweils mit ihren Seiten; Z4 (Owner-Freigabe Versandweg), Z5, Z6 (Stränge A/B) zeigen die Seiten als „bald“ oder blenden sie aus.

| # | Zusatz | Baut | Stand | Notiz |
|---|---|---|---|---|
| Z1 | Erster Start: Ziel, Erfahrung, erste Aktien; Konto-Einstellung | D (E11) + `workers/vu-account` | fertig (#1359) | `settings.experienceLevel` beginner/advanced/pro, `settings.goal` vorsorge/aktie/ideen/strategien, `settings.onboardedAt` (PATCH `true`, Server setzt Zeit); Produktion bleibt aus |
| Z2 | Eine Aktienadresse `/aktie/<T>` mit Weiterleitungen | D | fertig (#1353) | Herkunftswelt bestimmt Perspektive und Leiste |
| Z3 | Gespeicherte Suchen im Konto | D (Q02, Screener, T04) + Konto | fertig (#1359) | `GET/POST/PATCH /v1/searches`, `POST /v1/searches/remove`; Welt quant/screener/technical/fundamental/discover; 50 je Konto; Anbindung der Seiten (S04, Q02, T04) nach dem Merge |
| Z4 | Benachrichtigungen | Konto + Erzeuger | „bald“ | Versandweg braucht Owner-Freigabe |
| Z5 | Screener-Kriterien aus 13F und Supertrader | A + B, Oberfläche D | Supertrader-Teil in #1391; 13F „bald“ | |
| Z6 | Insider-Käufe als Datenquelle | A | „bald“ | |
| Z7 | AI Atlas visuell (E10-b) | D (E10) | fertig (#1366) | vorhandener Worker `workers/vu-ask` unverändert (Modell, Budget, Grenzen, Beta-Passwort); neu nur die Darstellung mit VU-Bausteinen |
