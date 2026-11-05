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
| 2 | #1345 | Schritt 1+2: Bausteine C04–C20 (`assets/vu-ui.css/.js`), C06 (`assets/vu-chart.js` 2.1.0), Musterseite `/status/bausteine/`, Regel 1, Shell | A3, C, N1–N3 | gemergt |
| 3 | #1346 | Schritt 3: Aktienkopf C04 + Perspektiven-Leiste C05 (sieben Perspektiven) | N4, N5 | gemergt |
| 4 | #1350 | Discover D09: Aktienseite Überblick, Analyse unter „Alle Kennzahlen“ PRO | D09 | CI läuft (Basis main) |
| 5 | #1351 | Quant Q01–Q05, Q07 (Schritte 1–6), Q08; Prüfungen nachgezogen | Q01–Q05, Q07, Q08 | offen (nach #1350) |
| 6 | #1353 | Z2: eine Aktienadresse `/aktie/<T>?p=` | Z2, N4 | offen (Basis #1351) |
| 7 | #1355 | Fundamental | F01–F06 | offen (Basis #1351) |
| 8 | #1356 | Elliott | W01–W05 | offen (Basis #1351) |
| 9 | #1357 | Hedgefonds | H01–H07 | offen (Basis #1351) |
| 10 | #1360 | Screener | S01–S05 | offen (Basis #1351) |
| 11 | #1361 | Supertrader (Gate A) | ST01–ST08 | offen (Basis #1351) |
| 12 | #1362 | Vorsorge | V01–V10 | offen (Basis #1351) |
| 13 | #1363 | Technical | T01–T06 | offen (Basis #1351) |
| 14 | #1366 | Einstieg, Konto, Mein Bereich, Atlas, erster Start | E01–E12, Z7, Z1 (Seite) | offen (Basis #1351) |
| 15 | #1367 | Discover | D01–D08 | offen (Basis #1351) |
| 16 | #1364 | Gemeinsam: Leisten Fundamental/Technical/Discover, Fundamental-Ansichten keine Aktien | C02, C03 | offen (nach #1355, #1363, #1367) |
| – | #1359 | Konto Z1+Z3 (Worker, Migration, Tests), Basis main, unabhängig | Z1, Z3 | CI läuft |

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
| E01 | Einstieg · Startseite | in Arbeit | #1366 | Pro-Preis als „Preis ansehen“ (Startseite ohne Abruf) |
| E02 | Mein Bereich · Willkommen | in Arbeit | #1366 |  |
| E03 | Einstieg · Preise Free/Pro | in Arbeit | #1366 | Preis aus `/v1/plans`; Zustand „Gerade nicht buchbar“ |
| E04 | Einstieg · Registrieren mit Pro-Wahl | in Arbeit | #1366 | kein „erneut senden“ (Worker ohne Endpunkt), dafür „Adresse ändern“; gemeinsame Kopfzeile bleibt |
| E05 | Einstieg · Anmelden | in Arbeit | #1366 | gemeinsame Kopfzeile bleibt |
| E06 | Konto · Pro-Bestellung | in Arbeit | #1366 | Platzhalter „1,00 €“ entfernt; Pflichttext wortgleich |
| E07 | Mein Bereich · Konto | in Arbeit | #1366 | eine Seite statt Reiter; Erfahrung bis Z1-Anbindung lokal |
| E08 | Mein Bereich · Mein Dashboard | in Arbeit | #1366 | Abmelden ins Konto verschoben |
| E09 | Mein Bereich · Watchlist-Detail | in Arbeit | #1366 | Teil: aufklappbare Karte mit Chart, Faktorbalken und Sheet fehlt |
| E10 | Einstieg · AI Atlas | in Arbeit | #1366 | Worker vu-ask unverändert; statt Jahresreihe Balken je Kennzahl über die Aktien (Atlas-Engine liefert keine Zeitreihe) |
| E11 | Einstieg · Erster Start | in Arbeit | #1366 | `/willkommen/start/`, `localStorage vu-start-v1`; Anbindung an `/v1/me` (Z1, #1359) offen: `signale`→`strategien`, `mode`→`experienceLevel`, `onboardedAt:true` |
| E12 | Einstieg · Checkout-Ablauf Free → Pro | – | #1366 | keine eigene Oberfläche (E03 → E04 → E06) |
| D01 | Discover · Übersicht | in Arbeit | #1367 | Swipen-Karte ohne „400“ (Feed nicht auf der Startseite geladen); Index/Kurse in Anzeigewährung |
| D02 | Discover · Welten | in Arbeit | #1367 | große Karte „Zum Einstieg“ statt „Meistgeöffnet“ (keine Nutzungsdaten) |
| D03 | Discover · Thema KI | in Arbeit | #1367 | Mini-Charts laden in Sichtweite |
| D04 | Discover · Strategien | in Arbeit | #1367 | „Täglich neu: Heute im Blick“ statt „Beliebteste“; vier Gruppen fest in v3.js bis Registry-Feld `group`; `#/strategien/<id>` |
| D05 | Discover · Swipen | in Arbeit | #1367 | `#/swipen` (`#/einzeln/<U>` leitet um); Zähler „1 von 400“; Leiste über #1364 |
| D06 | Discover · Suchen | in Arbeit | #1367 | „Bekannte Namen“ mit 12-Monats-Pille statt „Oft gesucht“ (keine Suchstatistik) |
| D07 | Discover · Märkte | in Arbeit | #1367 | nur die Übersicht; `#/maerkte/<Symbol>` und Einordnung noch alt |
| D08 | Discover · Watchlist | in Arbeit | #1367 | Teil: bleibt `/discover/#/watchlist`; Benachrichtigungen fehlen (Z4); „Liste bearbeiten“ |
| D09 | Discover · NVIDIA (Aktienseite) | in Arbeit | #1350 | Kurs im Kopf in Anzeigewährung (€) statt $ + ≈ € (Querschnitt Währung offen); Jahresspanne in % statt $; d09-c Merken-Sheet wartet auf Benachrichtigungen (Backend) |
| Q00 | Quant · So ist die Welt gebaut | offen |  |  |
| Q01 | Quant · Übersicht | in Arbeit | #1351 | Setup-Karten ohne „Schluss … $“ (Ressourcen-Budget der Startseite) |
| Q02 | Quant · Screener | in Arbeit | #1351 | Einfach-Modus nach Mockup; „Eigene Bedingung“ klappt inline auf statt Sheet; Profi-Modus (dunkel, Regler, Tabelle) noch alt |
| Q03 | Quant · Strategien | in Arbeit | #1351 | Liste nach Mockup (q03-a); Detail (q03-b) noch alt |
| Q04 | Quant · Aktien | in Arbeit | #1351 | Aktienzeilen ohne Kurs/Mini-Chart (keine Kursabfrage je Zeile auf dieser Seite) |
| Q05 | Quant · Methodik | in Arbeit | #1351 | Startseite der Methodik nach Mockup; Gewichte je Frage nicht als feste Zahl (stehen unter „Gewichtung“), Unterseiten noch alt |
| Q06 | Quant · Technische Lagen | offen |  |  |
| Q07 | Quant · NVIDIA (Aktienseite, Perspektive Faktoren) | in Arbeit | #1351 | Lange Seite mit Schritten 1–6 nach Mockup (Überblick, Fragen, Stärken/Risiken, Veränderungen mit Kacheln, Setup-Karte + Stil-Karten mit Regel-Haken, Rückblick schwarz + Evidenz). Offen: Kopf in $ + ≈ € (Querschnitt Währung), Herz statt „Beobachten“, Quant-Chart → C06, Kursstärke-Verlauf mit Schwelle 70, Ereignis-Zeitleiste, Beleg-Sheet. Rückblick zeigt „ähnliche Situationen dieser Aktie“ (replay), nicht „Setup bestätigt in 552 Wochen“ (setup-replay-v1 lädt die Seite nicht). Alte Inhalte vollständig unter „Einstieg, Stop, Ziele …“ und „Alle Belege …“. |
| Q08 | Quant · NVIDIA Zahlen (Perspektive Zahlen) | in Arbeit | #1351 | Kopf ohne Kurs (Seite lädt keinen Kurs); Kachel „Wachstum 3 Jahre“ durch „Stand“ ersetzt |
| Q09 | Quant · NVIDIA Chartbild (Perspektive Chart) | offen |  |  |
| T01 | Technical · Übersicht | in Arbeit | #1363 | Sheet „Was ist ein Setup?“ ohne Beispielchart; „Heute neu im Chart“ lädt nach dem ersten Bild; Markt heute ≥ 60 % Stark, ≥ 40 % Gemischt, sonst Schwach |
| T02 | Technical · Screener | in Arbeit | #1363 | „Melden“ ohne Funktion bis Z4 (Owner-Freigabe Versand) |
| T03 | Technical · Vorlagen | in Arbeit | #1363 | Detail bleibt `#/vorlagen/<id>` (TPL.href in der Engine) |
| T04 | Technical · Gespeicherte Suchen | in Arbeit | #1363 | Änderung „seit dem letzten Kursstand“ (im Browser) statt „seit gestern“; Glocke bis Z4 gesperrt; Konto-Speicherung über Z3 (#1359, keine Owner-Freigabe nötig) nachziehen |
| T05 | Technical · Methodik | in Arbeit | #1363 | `#/muster`, `#/methodik` zeigt dieselbe Seite; früherer Inhalt unter „Regeln“ |
| T06 | Technical · NVIDIA im Chart | in Arbeit | #1363 | Kopf aus dem Navigator ohne Satz zur Firmentätigkeit; 1T gesperrt (nur Tagesschlüsse); Urteil nach SMA 50/200, RSI ab 50 Stark |
| F01 | Fundamental · Übersicht | in Arbeit | #1355 | Fehlerzustand unter den Ranglisten-Karten, wenn das Universum nicht lädt |
| F02 | Fundamental · Entdecken | in Arbeit | #1355 | Titel „Ranglisten“/„Auswahlen“ statt „Entdecken“ (neuer Leistenplatz); `#/entdecken` leitet weiter |
| F03 | Fundamental · Rangliste Wachstum | in Arbeit | #1355 | echte Plätze nur im Code geprüft (Universum lokal nicht da), CI prüft |
| F04 | Fundamental · Suchen | in Arbeit | #1355 | Kopfzeilen-Suche selbst bleibt site-navigation |
| F05 | Fundamental · Methodik | in Arbeit | #1355 | alter Volltext hinter „Alle Formeln PRO“ |
| F06 | Fundamental · NVIDIA in Zahlen | in Arbeit | #1355 | Kurschart im Überblick entfällt (Perspektive Chart); „Mehr“ als Chip-Zeile; SEC-Hinweis grau am Ende |
| W01 | Elliott · Übersicht | in Arbeit | #1356 | Suche als echtes Feld (ohne Atlas-Knopf); „Weitere Reihen“ zeigt alle 8 Reihen |
| W02 | Elliott · Welle 3 | in Arbeit | #1356 | Karten in Reihenfolge der Reihe, 10 je Seite |
| W03 | Elliott · Aufwärts | in Arbeit | #1356 | zusätzlicher Filter `rolle=motiv` |
| W04 | Elliott · Neu und verändert | in Arbeit | #1356 | Schalter „Melden“ sichtbar, aus: kommt mit Z4 (Owner-Freigabe) |
| W05 | Elliott · NVIDIA in Wellen | in Arbeit | #1356 | Teil: Reihenfolge, Ausblick schwarz mit C08, Profi-Knopf PRO. Offen: Chart mit Unterstützung/Widerstand statt Szenario-Zonen, kompakte Projektionskarte, kurze Profi-Ansicht |
| ST01 | Supertrader · Übersicht | in Arbeit | #1361 | „Neu erkannt heute“ heißt „Heute durchgerechnet“ (Stufe-3-Treffer; kein sauberer Vortagsvergleich in den Daten) |
| ST02 | Supertrader · Methoden | in Arbeit | #1361 | Karten führen in die bisherige Kandidatenansicht `?sf=Cxx` (noch alter Stil) |
| ST03 | Supertrader · Methode Minervini VCP | in Arbeit | #1361 | Teil: fertig für 5 Musterdepot-Methoden; bei 52W, CAN SLIM, Piotroski, Greenblatt, Namenskarten nur Kopf + „Wie belastbar?“ |
| ST04 | Supertrader · Signale | in Arbeit | #1361 | „Neu am letzten Handelstag“; vor Einstieg Leiste Grenze · Kurs · Marke |
| ST05 | Supertrader · Backtests | in Arbeit | #1361 | „0 von 9“ aktive Regelversionen; Pilot mit S&P 500 gestrichelt, „Forschung, nicht zertifiziert“ |
| ST06 | Supertrader · Quellen | in Arbeit | #1361 | echte Zahlen (59 Quellen, 53 mit Adresse, 10 im Volltext) |
| ST07 | Supertrader · Hausstrategie | in Arbeit | #1361 |  |
| ST08 | Supertrader · NVIDIA (Perspektive Methoden) | in Arbeit | #1361 | Antwort aus Daten („1 Methode erkennt NVIDIA“); Technical-Abschnitt entfällt (Perspektive Chart) |
| ST-Z | Supertrader · Zustände in Alltagssprache | offen |  |  |
| H01 | Hedgefonds · Übersicht | in Arbeit | #1357 | Suche bleibt echte Hedgefonds-Suche (ohne Atlas-Knopf) |
| H02 | Hedgefonds · Investoren | in Arbeit | #1357 | 12 Stil-Chips aus den Daten; Sortierung im eigenen Sheet |
| H03 | Hedgefonds · Datenbank | in Arbeit | #1357 | neue Adresse `#/investoren/alle`; Region nur Alle/DACH (Daten); alte Chips bleiben |
| H04 | Hedgefonds · Aktien | in Arbeit | #1357 | „Alle 4.850“ lädt stufenweise statt eigener Seite |
| H05 | Hedgefonds · Fonds Pershing Square | in Arbeit | #1357 | Zeilen zusätzlich mit Wert und Stückzahl; Quartale im Akkordeon |
| H06 | Hedgefonds · Smart Money | in Arbeit | #1357 | Insider-Käufe aus vorhandener Quelle `ownership-signals-v1` (Form 4) |
| H07 | Hedgefonds · NVIDIA (Perspektive Investoren) | in Arbeit | #1357 | `#/aktie/<T>`, CUSIP leitet um; Urteil ≥ 60 % Käufe „Mehr Käufer“, ≥ 60 % Verkäufe „Mehr Verkäufer“, sonst „Ausgeglichen“ |
| S01 | Screener · Übersicht | in Arbeit | #1360 | Satz startet leer statt mit Beispielsatz; Ideenzahlen live aus der Engine |
| S02 | Screener · Filter hinzufügen | in Arbeit | #1360 | Profi: Gruppen UND/ODER bleiben; Kriterium-Sheet mit „Genau einstellen“ |
| S03 | Screener · Treffer | in Arbeit | #1360 | Teil: „Aktie öffnen“ bleibt Sheet (Kopf, Leiste, „Treffer k von N“) statt eigener Aktienseite |
| S04 | Screener · Gespeichert | in Arbeit | #1360 | Neu/raus aus den zwei letzten Läufen; „Im Konto speichern“ = bald bis Z3 (#1359) gemergt ist |
| S05 | Screener · Watchlist | in Arbeit | #1360 | `?view=saved&tab=watchlist`; „Als Screen filtern“ bald (Engine filtert keine Symbolliste) |
| V01 | Vorsorge · Start | in Arbeit | #1362 | Sheet „Erster Besuch“ öffnet in automatisierten Browsern nicht von selbst (`#/?lage=1` erzwingt) |
| V02 | Vorsorge · Planer | in Arbeit | #1362 | Monte-Carlo bleibt unter „Profi“ (als Spanne); Plan im Browser bis Konto |
| V03 | Vorsorge · ETFs | in Arbeit | #1362 | „Alle“ sortiert nach Historienlänge (Municipal-Fonds oben); Fondsvermögen wäre besser – Nacharbeit |
| V04 | Vorsorge · ETF-Detail | in Arbeit | #1362 | Teil: Bestände noch alte Tabelle, Planspiel noch alte dunkle Karte |
| V05 | Vorsorge · Portfolio | in Arbeit | #1362 | Teil: X-Ray-Abschnitte altes Layout (neu gefärbt), Mischungen mit Kreisen statt Gewichtsbalken |
| V06 | Vorsorge · Vergleichen | in Arbeit | #1362 | Standard URTH gegen SPY; Kosten unter `#/vergleichen/kosten` |
| V07 | Vorsorge · Förderung | in Arbeit | #1362 | Beispielfälle unter `#/foerderung/faelle` |
| V08 | Vorsorge · Veränderungen | in Arbeit | #1362 | „Benachrichtigen“ nur lokal (Z4) |
| V09 | Vorsorge · Wissen | in Arbeit | #1362 | Datenbeispiel nur für Schwankung und größten Rückgang (URTH) |
| V10 | Vorsorge · Der 10-Euro-Sparplan (Ablauf) | in Arbeit | #1362 | `#/start` in sechs Schritten ohne Kopf/Leiste; Plan im Browser |
| V10 | Vorsorge · Der 10-Euro-Sparplan | in Arbeit | #1362 | `#/start` in sechs Schritten ohne Kopf/Leiste; Plan im Browser |
| Ü1 | Reihenfolge der Umsetzung | – |  | Übersichtsfolie, nichts zu bauen |
| Ü2 | Alle Seiten mit Adresse | – |  | Übersichtsfolie, nichts zu bauen |
| Ü3 | Abnahmekriterien | – |  | Übersichtsfolie, nichts zu bauen |
| Ü4 | Auftrag an Claude Code | – |  | Übersichtsfolie, nichts zu bauen |

## Laufende Teilaufträge (parallel, je Welt ein PR auf Basis `claude/redesign-quant`)

Technical (T01–T06), Fundamental (F01–F06), Elliott (W01–W05), Hedgefonds (H01–H07), Screener (S01–S05), Vorsorge (V01–V10), Supertrader (ST01–ST08, Gate A), Discover (D01–D08), Einstieg und Mein Bereich (E01–E12, übernimmt `neustart/d-startseite` und `neustart/d-mein-bereich`). Zweige `claude/redesign-<welt>`, Nachweisbilder auf `claude/redesign-evidence-<welt>`.

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
| Z1 | Erster Start: Ziel, Erfahrung, erste Aktien; Konto-Einstellung | D (E11) + `workers/vu-account` | in Arbeit (#1359) | `settings.experienceLevel` beginner/advanced/pro, `settings.goal` vorsorge/aktie/ideen/strategien, `settings.onboardedAt` (PATCH `true`, Server setzt Zeit); Produktion bleibt aus |
| Z2 | Eine Aktienadresse `/aktie/<T>` mit Weiterleitungen | D | offen | Herkunftswelt bestimmt Perspektive und Leiste |
| Z3 | Gespeicherte Suchen im Konto | D (Q02, Screener, T04) + Konto | in Arbeit (#1359) | `GET/POST/PATCH /v1/searches`, `POST /v1/searches/remove`; Welt quant/screener/technical/fundamental/discover; 50 je Konto; Anbindung der Seiten (S04, Q02, T04) nach dem Merge |
| Z4 | Benachrichtigungen | Konto + Erzeuger | „bald“ | Versandweg braucht Owner-Freigabe |
| Z5 | Screener-Kriterien aus 13F und Supertrader | A + B | „bald“ | |
| Z6 | Insider-Käufe als Datenquelle | A | „bald“ | |
| Z7 | AI Atlas visuell (E10-b) | D (E10) | in Arbeit (#1366) | vorhandener Worker `workers/vu-ask` unverändert (Modell, Budget, Grenzen, Beta-Passwort); neu nur die Darstellung mit VU-Bausteinen |
