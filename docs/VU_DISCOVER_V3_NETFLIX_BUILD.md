# VISION UNIVERSE® MASTER BUILD — „The Netflix of Stock Research"

Zweig `claude/vision-universe-discover-v3`. **Nicht nach `main` gemergt, nicht
veröffentlicht.** Auftrag vom 14.09.2026, drei Phasen: Produkt-Datenhygiene,
Fundamental Intelligence, Netflix-Experience. Dieses Dokument ist der
Abschlussbericht (§73, 26 Punkte). Jede Zahl stammt aus einem Lauf, keine ist
geschätzt; Läufe, die Netz brauchen (SEC, Tiingo), sind CI-Läufe und mit
Run-ID genannt.

> DER KURS ZEIGT, WAS DIE AKTIE GEMACHT HAT.
> DIE FUNDAMENTALS ZEIGEN, WAS DAS UNTERNEHMEN GEMACHT HAT.

Begleitende Dokumente: `VU_FUNDAMENTAL_INTELLIGENCE.md` (Audit, Consumer-Export,
Engine-Regeln), `VU_COMPANY_NAME_ENRICHMENT.md` (Namensschicht),
`VU_DISCOVER_COMPANY_MASTER_INTEGRATION.md` (Universum).

---

## 1. Produktuniversum nach der Bereinigung (Phase A)

Testsymbole der Börsen (ZVZZT, ZWZZT, ZXZZT, ZJZZT, ZCZZT, ZBZX, ZVV, CBO, CBX,
IGZ, ZXYZ-A …) **bleiben im kanonischen Security Master** und werden über den
bestehenden Mechanismus ausgeschlossen: der Klassifizierer
`quant/engines/us-security-master.js` erkennt sie an Ticker-Muster
(`Z[A-Z]ZZT`, `ZXYZ(-X)`, ZTST, ZBZX, ZVV) und am Namen (`TEST STOCK`,
`LISTED TEST`, `SYMBOLOGY TEST`, `TST SECURITY`), und der Eligibility-Builder
`scripts/market/build-us-eligibility.mjs` nimmt die kanonische Namensschicht
als zweite Evidenz (`--names`, Block `nameLayer` in der Ausgabe). Keine
Frontend-Liste, keine zweite Universe Engine.

| | vorher (2e22a2e) | nachher | Änderung |
|---|---|---|---|
| Mitglieder Security Master | 7 803 | 7 803 | unverändert |
| ELIGIBLE | 6 477 | 5 940 | −537 |
| SEPARATE_CLASS | 308 | 782 | +474 (TRUST 120 · REIT 19 · ADR 10 · SPAC 232 · PREFERRED 401) |
| EXCLUDED | 799 | 928 | +129 (WARRANT 465 · UNIT 288 · RIGHT 122 · TEST_SECURITY 44 · ETF 4 · ETN 4 · CEF 1) |
| REVIEW | 219 | 153 | −66 (98 LISTING_INACTIVE, 40 PREFERRED ohne Stammbeleg, 15 Formen ohne Bestätigung) |
| **Produktuniversum** (alles außer EXCLUDED) | **7 004** | **6 875** | −129 |
| Testsymbole im Produkt | 14 | 0 | über Name/Ticker erkannt, EXCLUDED |

Was sich geändert hat und warum: (1) 233 SPAC-Mäntel und 120 Trusts aus ELIGIBLE
nach SEPARATE_CLASS (Name belegt die Form); 54 Warrants, 13 Units aus REVIEW nach
EXCLUDED (Form durch Namen bestätigt); 11 Testsymbole und 1 ETF (BNY, als Fonds
benannt) aus ELIGIBLE nach EXCLUDED — erster Pass (594 Entscheidungen). (2) Zweiter
Pass nach der Screenshot-Prüfung der fundamentalen Sammlungen: 123 Vorzugspapiere
mit NASDAQ-Suffixcode P/O/N/M (FCNCP/FCNCO/FCNCN First Citizens, AGNCN/AGNCM/AGNCO/
AGNCP, CHSCP/CHSCO/CHSCN/CHSCM, SMCIP …) standen als Stammaktien im Produkt und in
„Qualität zum vernünftigen Preis"; der Klassifizierer (`us-security-master-1.2.0`)
kennt den Code jetzt wie W/R/U, und 3 weitere Testsymbole (ZTST, ZAZZT, ZBZZT)
fielen durch die Tickerregel. Ticker-markierte Formen (PREFERRED/WARRANT/UNIT/
RIGHT) werden nie durch einen Emittentennamen herabgestuft.

**Klassifizierer-Version und Arbeitsablage:** die Anbieterliste (108 596 Zeilen)
liegt nicht im Repository; der Company Master (`us-security-master.json`, 8 021
Zeilen) trägt Version 1.1.0. Statt ihn bei einer Regeländerung zu verwerfen,
beurteilt `build-us-eligibility.mjs` seine Anbieterzeilen mit dem aktuellen
Klassifizierer neu (`securityMasterRejudged`, Evidenz `SECURITY_MASTER_REJUDGED`);
ein älteres Urteil derselben Gattung mit stärkerem Beleg (Stamm in der
Anbieterliste) bleibt bestehen. Der Abgleich (`reconciliation.json`) behält
seine Laufversion — Test SM62 verlangt dann die dokumentierte Neubeurteilung.

**Consumer-Policy** (eine Stelle: `scripts/market/universe-source.mjs`,
`CONSUMER_INSTRUMENT_TYPES`): Discover, Suche, Sammlungen, Ähnliche und
Empfehlungen zeigen nur EQUITY_COMMON, ADR, REIT, TRUST, SPAC, UNKNOWN, OTHER.
Von 6 875 Produkttiteln sind **5 947 Consumer-Titel**; ausgeschlossen bleiben 436
PREFERRED, 7 RIGHT, 5 WARRANT, 2 UNIT (sie bleiben im Master, in der Matrix und in
Faktoren). Vorher standen 315 Preferreds als Aktien auf Discover.

## 2. Namensabdeckung

Die Namensschicht `security-master/company-names.json` bleibt: **6 855 / 6 875
(99,71 %)** Produkttitel mit Namen, 20 ehrlich ungelöst (Anbieter ohne Namen;
Testsymbole sind jetzt außerhalb des Produkts). Kein Name erfunden. Neu ist eine
reine Anzeigeschicht `displayName` (`deriveDisplayName`): „Lilly(Eli) &
Company" → „Eli Lilly & Company", „Walt Disney Co (The)" → „Walt Disney",
„THOMSON REUTERS CORP /CAN/" → „Thomson Reuters", „MICRON TECHNOLOGY INC" →
„Micron Technology"; Rechtsformen fallen, Tickerartige Reste (≤ 4
Großbuchstaben) behalten den vollen Namen, Großschreibung wird nur bei
mehrwortigen Schreinamen normalisiert. Kanonischer, rechtlicher und
Anbietername bleiben unverändert und werden auf der Aktienseite genannt.

## 3. Fundamentale Abdeckung (gemessen, CI-Lauf 34849261178)

Die bestehende SEC-Pipeline (`scripts/quant/sec/`) bekam einen zweiten,
schlanken Export (`consumer.py`) aus dem Bulk-Archiv `companyfacts.zip` —
**keine zweite SEC-Architektur**; der Audit der anderen SEC-Zweige ist in
`VU_FUNDAMENTAL_INTELLIGENCE.md` §1.

Gemessen auf dem Produktuniversum des Bulk-Laufs (6 878; der zweite Hygiene-Pass
nahm danach 3 Testsymbole heraus und stufte 123 Vorzüge um — sie bleiben im
Produktuniversum, aber nicht im Consumer-Umfang; der nächste Wochenlauf zählt
6 875). Im Consumer-Umfang von Discover (5 947 Titel) tragen 4 907 Fundamentals,
2 051 zehn Jahre, 4 601 TTM, 2 126 eine Bewertung (Discover-`meta.json`).

| Stufe | Titel |
|---|---|
| Company Master | 7 803 |
| Produktuniversum | 6 878 |
| CIK zugeordnet (Namensschicht, SEC-Tickerverzeichnis) | 5516 |
| ohne CIK | 1362 |
| im Bulk-Archiv vorhanden (Bundle geschrieben) | 5066 |
| nicht im Archiv / ohne periodische Formulare | 43 |
| Jahresreihe (≥ 2 FY Umsatz) | 4740 |
| Quartalsreihe | 4735 |
| TTM möglich (vier Standalone-Quartale) | 4739 |
| aktuelle Zahlen (letztes FY oder Quartal) | 4739 |
| 3 Jahre Historie | 3419 |
| 5 Jahre Historie | 3014 |
| 10 Jahre Historie | 2039 |
| Fehler beim Bauen | 82 |

Der 10-Jahres-Horizont lag im ersten Lauf bei 286 Titeln, weil das Fenster von
elf Geschäftsjahren am angebrochenen Jahr scheiterte; das Fenster ist jetzt 13
FY (`DEFAULT_ANNUAL_YEARS`), Ergebnis 2039.

**Zwei Datenfehler, die die Stichprobe der 15 Titel aufdeckte** (behoben, Normalisierung 1.6.0, Regressionen `test_consumer_calendar.py`): Amazon meldet in jedem 10-Q Zwölfmonatswerte, der Kalender machte daraus Halbjahre (Q2 hieß Q1, FY2025 trug den Juni-Wert); JPMorgans Umsatz-TTM stand „durch FY2014Q4" neben aktuellen Zahlen. Nachmessung über alle 5 066 Bundles nach dem Fix: 0 Bundles mit gemischten TTM-Fenstern, 3 mit veraltetem TTM-Fenster (> 400 Tage gegen das jüngste Quartal, Emittenten ohne aktuelle 10-Q), 20 mit doppeltem Quartalsende (vorher 52), 53 mit zwei „Geschäftsjahren" unter 300 Tagen Abstand — das sind Wechsel des Geschäftsjahresendes (VF Corp, L3Harris, Timken …), über die die Engine keinen Jahresvergleich rechnet.

**Aktiensplits:** die SEC-Reihe ist nicht rückwirkend bereinigt (NVIDIA: 569 Mio. Aktien FY2016, 24,5 Mrd. FY2026). Springt die Aktienanzahl zwischen zwei Geschäftsjahren um ≥ 1,5× oder ≤ 1/1,5, fehlen Gewinn je Aktie und Aktienanzahl im Vergleich, mit Begründung auf der Seite (AAPL, NVDA, AMZN, TSLA, PLTR, AVGO, WMT der Stichprobe).

## 4. Abdeckung je Kennzahl

| Kennzahl | Jahre (FY) | Quartale | TTM |
|---|---|---|---|
| Umsatz | 3799 | 3257 | 3025 |
| Bruttogewinn | 2794 | 2168 | 1456 |
| Operatives Ergebnis | 3652 | 3126 | 2965 |
| Nettogewinn | 4333 | 3850 | 3746 |
| Gewinn je Aktie (verwässert) | 4077 | 3635 | 3387 |
| Operativer Cashflow | 4325 | 3841 | 3709 |
| Investitionen (CapEx) | 3886 | 3284 | 2803 |
| Kasse | 4308 | 4252 | 4316 |
| Schulden gesamt | 2303 | 1867 | 499 |
| Langfristige Schulden | 2951 | 0 | 0 |
| Bilanzsumme | 4339 | 0 | 0 |
| Eigenkapital | 4304 | 0 | 0 |
| Aktien (ausstehend) | 4330 | 4250 | 4435 |
| Aktien (verwässert, gewichtet) | 4103 | 0 | 0 |
| F&E | 2126 | 0 | 0 |
| Dividenden | 1987 | 0 | 0 |
| Aktienvergütung | 3956 | 0 | 0 |
| Free Cashflow (abgeleitet) | 3885 | 3282 | 2800 |
| Nettoschulden (abgeleitet) | 2284 | 0 | 499 |
| Margen (Brutto/operativ/netto), ROE, Wachstum | aus den Zeilen oben, nur bei Zähler und Nenner desselben FY | – | – |

ROIC wird nicht gerechnet (Steuer- und Kapitalannahme nötig); ROE ja
(Nettogewinn / Eigenkapital des letzten FY). Wachstum nur, wenn beide Perioden
vorliegen.

## 5. Damals vs. heute

Adaptiver Horizont über die Umsatzreihe der Geschäftsjahre: 10 Jahre, wenn
FY(t−10) existiert, sonst 5, sonst 3, sonst erste vs. letzte valide Periode
(`FIRST_VS_LATEST`, mit Jahreszahl). Zeilen: Umsatz, Nettogewinn, operative
Marge, Free Cashflow, Gewinn je Aktie, Aktienanzahl, Nettoschulden — nur mit
beiden Werten, exakte Perioden (FY, Periodenende, Filing, Accession), Änderung
absolut, in % und als CAGR bzw. Prozentpunkte. Keine Zeile mit erfundener Null.

## 6. Fundamental Journey

Jahresreihen (nur FY, aufsteigend) für Umsatz, Nettogewinn, Free Cashflow,
operativen Cashflow, EPS, Margen (Zähler und Nenner aus demselben FY), Kasse,
Schulden, Aktien. UI: Balken je Geschäftsjahr mit Reiterwechsel
(`detail-fundamentals.js`), Höhe proportional, negative Werte nach unten.

## 7. Fundamental Story Engine

Deterministisch, ohne Sprachmodell, im Build gerechnet und vom Verifier
nachgerechnet. Jede Aussage trägt `metric, periodStart, periodEnd, valueStart,
valueEnd, calculation, source, asOf, version`. Regeln und Schwellen:
`VU_FUNDAMENTAL_INTELLIGENCE.md` §3. Dieselbe Engine speist die Karten der
fundamentalen Reihen (`klartext.js` 1.1.0, 13 fundamentale Geschichten, je Reihe
eine Reihenfolge, höchstens zwei gleiche Sätze je Reihe).

## 8. Sammlungen

10 fundamentale Reihen (Welt „fundamentals", Gold), Regeln in
`VU_FUNDAMENTAL_INTELLIGENCE.md` §4; jede erscheint erst ab fünf Titeln
(`minMembers`). Mitglieder im aktuellen Build:

| Reihe | Mitglieder | Sichtbar |
|---|---|---|
| CASHFLOW-MASCHINEN | 596 | 30 |
| FUNDAMENTALE TURNAROUNDS | 288 | 30 |
| GEWINNE BESCHLEUNIGEN | 580 | 30 |
| LANGFRISTIGE COMPOUNDER | 163 | 30 |
| MARGEN WERDEN STÄRKER | 849 | 30 |
| PROFITABLES WACHSTUM | 338 | 30 |
| QUALITÄT + WACHSTUM | 322 | 30 |
| QUALITÄT ZUM VERNÜNFTIGEN PREIS | 469 | 30 |
| STARKE BILANZ + WACHSTUM | 84 | 30 |
| UMSATZ WÄCHST STARK | 510 | 30 |

## 9. Netflix-Mechaniken

Umgesetzt (Referenz ist die visuelle Grammatik, keine Assets, keine 1:1-Screens):

* **Cineastische Eingangsfläche** mit Anzeigename, belegtem Hook aus den
  Abschlüssen, echtem Intraday-/Tageschart, einer großen Zahl, Kontext; auf dem
  Desktop schiebt sich die erste Reihe in den Verlauf.
* **Rhythmus** (`home.surfaces`, 31 Flächen): Hero → breite Reihe → Top 10 →
  Poster → **Story-Fläche „Die Entwicklung"** → Umsatz-Poster → Gewinne breit
  → Themenwelt KI → kompakte Reihe → Top 10 Cashflow → Featured → Margen →
  Momentum → Themenwelt Robotik → Compounder → Relative Stärke → Branchen →
  Sektorreihen → Qualität zum Preis → Comeback → Turnarounds → Themenwelt
  Mobilität → … → Immersive „Einzeln entdecken". Drei Nachlade-Teile.
* **Kartenformen**: Poster, breit, kompakt, Ranking (Top 10 mit Rangzahl),
  Featured, Story, Themenwelt, Immersive; Karte 2.0 mit Wer / Warum / Hook /
  Heute (Intraday) / Warum öffnen.
* **„Weil du X angesehen hast"** aus dem Gerätegedächtnis, deterministisch
  (`recommendation.js`), mit Grund und Quelle.
* **Mobile Swipe** in Reihen, „Einzeln entdecken" als Vollbild-Sequenz.
* **Discovery Pressure, kein Buy Pressure**: kein Kursziel, keine Empfehlung,
  Fortschritt nur als Entdeckungsweg.

Nicht umgesetzt: Autoplay-Vorschauen, Profile, Server-Personalisierung (§13).

## 10. Discover-Seite — Änderungen

Story-Fläche, fundamentale Reihen, Hook auf Karten/Hero/Feed, „Weil du …",
kompaktere Desktop-Eingangsfläche mit angeschnittener erster Reihe, Suche mit
Namensanfang/Ticker/Sektor/Branche/Thema (max. 14 Treffer, kein DOM mit 6 000
Knoten), Ranking-Titel je Reihe.

## 11. Aktienseite — Reihenfolge (§36)

1 Hero · 2 Warum · 3 Kurs/Intraday · 4 In 30 Sekunden (mit Health-Zeilen) · 5
Business („Was macht X?") · 6 Damals vs. heute · 7 Journey · 8 Heute (FY/TTM
getrennt, Health-Raster) · 9 Bewertung (Klartext zuerst: „deutlich höher /
günstiger / im Bereich des breiten Markts" gegen den Median des Universums, dann
KGV/KUV/FCF-Rendite) · 10/11 Chancen und Risiken (datenbasiert, fundamentale
Punkte) · 12 Quant · 13 Technical · 14 Ähnliche / Auch enthalten in · 15 Next
Discovery. Jede fundamentale Sektion fehlt, wenn kein Bundle vorliegt — sie
zeigt nie Platzhalter.

## 12. Intraday und Marktzustände

Unverändert und Pflicht: offen → Eröffnung bis jetzt; geschlossen → letzte
Sitzung; Wochenende → Freitag; Feiertag → letzter Handelstag; keine Fake-Linie,
keine Animation, kein leerer Chart. Beschriftung „Stand HH:MM", nie „live".
Browser-QA (Live-Suite) prüft Sitzungszustände und Abonnentenzahlen.

## 13. Next Discovery und Similarity

`buildNextDiscovery` im Build: kleinster Abstand über Leadership-Perzentil,
Volatilität, Umsatz-CAGR 3J, Nettomarge, log KGV (nur vorhandene Achsen);
dazu gleiche Branche, gleiches Thema, ähnliches Wachstum (± 5 Pp.), ähnliche
Qualität (± 3 Pp.), günstigere Alternativen (gleiche Branche, niedrigeres KGV).
Deterministisch, mit Regel-Text je Gruppe.

## 14. Personalisierungs-Hooks (ehrlich)

* Ereignis-Vertrag (`analytics.js`, zehn Ereignisse) und Gerätegedächtnis
  (`memory.js`) bestehen.
* Neu: Empfehlungs-Vertrag `discover-recommendation-1.0.0` mit drei Arten
  (`because_you_viewed`, `more_from_your_collections`, `continue_discovering`),
  Basis immer `device`, `validate()`; ein späterer Server ändert nur die
  Eingaben.
* Es wird **keine** Personalisierung behauptet, die nicht gemessen wurde; die
  Flächen nennen ihre Quelle („auf diesem Gerät").

## 15. Fehlende Daten (bewusst nicht erfunden)

1362 Produkttitel ohne CIK (Preferreds, ADR ohne 10-K/20-F,
Trusts, Auslandstitel); 43 CIKs ohne Bulk-Eintrag; keine
Analystendaten, Segmente, Kursziele, News, historischen Bewertungsbereiche
(Kursreihe beginnt 2023); ROIC.

## 16. Nicht gebaute Features

Server-Personalisierung, Konten, Autoplay-Vorschauen, Trading-Gamification
(bewusst), Push, Watchlist-Sync, Fundamentals für Titel ohne SEC-Einreichungen.

## 17. Performance vorher / nachher

Gemessen mit `perf.mjs` (Playwright, lokaler statischer Server, `networkidle`, Startseite US_REAL):

| | vorher (Stufe 10) | nachher (dieser Build) |
|---|---|---|
| Desktop 1440×900: Anfragen / Volumen | 67 / 1 112 KB | 68 / 1 299 KB |
| iPhone 390×844: Anfragen / Volumen | 55 / 1 051 KB | 55 / 1 246 KB |
| JS-Dateien | 32 / 437 KB | 35 / 527 KB (+fundamentals.js, recommendation.js, detail-fundamentals.js) |
| erstes Startseiten-Stück | 214 KB | 252 KB (Story-Fläche, Hook je Karte; Grenze 300 KB, Test) |
| DOM-Knoten / Poster im ersten Bild | 1 627 / 52 | 1 863 / 50 |

Kein Titel lädt seine Fundamentals auf der Startseite: die Bundles (94 MB) liegen nur hinter der Aktienseite (`detail.fundamentals`, im Build gerechnet, ~+20 KB je Aktienseite). Keine 6 000 Karten, keine 6 000 Charts, keine 6 000 Payloads beim Start; Live-Hub geteilt, Abonnenten begrenzt (Live-Suite).

## 18. Tests

| Suite | Ergebnis |
|---|---|
| Quant (JS, `quant/tests/*.test.mjs`) | 801 / 801 |
| Discover (JS, `discover/tests/*.test.mjs`, inkl. FU1–FU13 Fundamentals, RC1–RC4 Empfehlungs-Vertrag, Klartext fundamental) | 192 / 192 |
| SEC-Pipeline (Python, `scripts/quant/tests`, inkl. `test_consumer.py`, `test_consumer_calendar.py`) | 267 / 267 |

Die Test-Prämissen, die dieser Build gebrochen hat, wurden nicht abgeschaltet, sondern auf die neue Datenlage präzisiert: „nur die Golden Five tragen Geschäftszahlen" → „jeder Titel mit CIK im Consumer-Index, keiner darüber hinaus"; Datenbudget `quant/data/sec` 8 MB bleibt, die Consumer-Bundles bekommen ein eigenes Budget (160 MB).

## 19. Verifier

`scripts/discover/verify-discover-data.mjs` rechnet jede ausgelieferte Zahl, jeden Klartext-Satz (inkl. der fundamentalen Sätze über `klartext.js` 1.1.0), jede Reihe und jede Startseiten-Fläche nach: **66 148 Prüfungen, keine Abweichung** (US_REAL 6 071 Aktienseiten, 23 Reihen, 31 Flächen; VU_MODEL 169 Aktienseiten). Der erste Lauf mit Fundamentals fand fünf Karten ohne Aussage (junge Titel ohne Zwölfmonatskurs in fundamentalen Reihen) — behoben durch fundamentale Geschichten im Klartext, nicht durch Lockerung der Prüfung.

## 20. Guards

`assert-public-data-hygiene.mjs` (Umfang), `assert-no-secrets.mjs`,
Capability-Matrix, Eligibility-Reconciliation — alle in den Workflows,
Ergebnis grün (`assert-no-secrets.mjs`: keine Zugangsdaten; `assert-public-data-hygiene.mjs`: keine Anbieter-Rohdaten in ausgelieferten Pfaden; Kursreihen und Intraday-Verzeichnis auf den Umfang zurückgeschnitten; Capability-Matrix neu gerechnet: 7 803 Master / 6 875 Produkt / 5 941 aktive Stammaktien / 5 376 Ticker mit Fundamentals (5 066 CIKs; Mehrfach-Ticker je Emittent) / 3 170 mit 5 J / 2 154 mit 10 J / 5 041 mit TTM / 5 947 Aktienseiten / 5 856 Discover-fähig / 20 ohne Namen).

## 21. Browser-QA

| Suite | Ergebnis |
|---|---|
| `browser-qa.mjs` (Startseite, Reihen, Farbwelten, Suche, Kategorie, Aktienseite, Waage, Geschäftszahlen, Modelluniversum, mobil) | 63 / 63 |
| `browser-qa-v3.mjs` (Surfaces, Lazy Loading, Einzeln entdecken, Gedächtnis, Themenwelten, keine Fake-Charts, Sackgassen) | 38 / 38 |
| `browser-qa-live.mjs` (Sitzungszustände, Intraday-Chart, Abonnenten, verstecktes Fenster ohne Polling, kein Überlauf) | 29 / 29 |

Desktop 1440×900 und iPhone 390×844 (Touch, 2×). Vier Prüfungen mussten mit dem Produkt mitwachsen und wurden präzisiert, nicht gelockert: der Waage-Fuß wird im Waage-Kapitel gesucht (Damals vs. heute steht jetzt davor); der Titel ohne Geschäftszahlen kommt aus den Daten statt aus einer festen Liste (VLO hat jetzt welche); die NVDA-Karte wird vor der Lazy-Prüfung ins Bild geholt; die erste Reihe muss auf dem Telefon im ersten Bild beginnen (< 844 px) — dafür wurde die Eingangsfläche verdichtet (Reihenkopf bei 806 px).

## 22. Screenshots

Aufgenommen mit `shots-v3.mjs` (Playwright/Chromium, iPhone 390×844 @2x und Desktop 1440×900) auf dem finalen Datenstand; abgelegt unter `docs/screenshots/discover-v3-netflix/` (Auswahl) — Namen: `iphone-01-hero` … `iphone-08-immersive` (Startseite oben/mitte/tief: Eingangsfläche, Reihe, Top 10, fundamentale Reihe, Story-Fläche, Themenwelt, Featured, Immersive), `iphone-s01-hero` … `iphone-s13-next` (Aktienseite: Kopf, Warum, Intraday, 30 Sekunden, Unternehmen, Damals vs. heute mit Split-Hinweis, Journey, Heute, Bewertung, Chancen/Risiken, Quant-Grenze, Ähnliche, Nächste Aktie), `desktop-01-hero`, `desktop-05-story`, `desktop-s01-hero`, `desktop-s06-damals`. „Weil du … angesehen hast" braucht ein Gerätegedächtnis und ist deshalb nicht im automatischen Satz (in der Browser-QA geprüft).

## 23. Kritische Selbstbewertung

Der Netflix-Test (sieht es aus wie eine Streaming-Startseite, nicht wie Finviz in schön?): auf dem Desktop ja — cineastische Eingangsfläche mit echtem Chart, angeschnittene erste Reihe, Story-Fläche, Themenwelt mit Lead-Text, wechselnde Kartenformen. Auf dem Telefon ja, mit zwei Einschränkungen, die diese Schleife behoben hat (Tabelle der Story-Fläche lief aus der Karte; Quellenzeile des Hooks brach in eine zweite Spalte).

Der 5-Sekunden-Test (versteht man in fünf Sekunden, worum es geht?): Eingangsfläche: Name, „+152 % in 12 Monaten", „Hat sich in zwölf Monaten mehr als verdoppelt", ein fundamentaler Satz mit Geschäftsjahren — ja. Aktienseite: Name, Kurs, ein Satz, dann der Chart — ja.

Discovery-Tiefe: von der Startseite über Reihe, Aktie, Damals vs. heute, Journey, Bewertung bis „Die nächste Aktie" (Ähnliche, gleiches Thema, ähnliches Wachstum, ähnliche Profitabilität, günstigere Alternativen) und „Einzeln entdecken" — kein Sackgassen-Ende; jede Seite hat einen nächsten Schritt.

Was die Screenshot-Prüfung an den Daten aufgedeckt hat und was daraus wurde: (1) Aktiensplits verfälschten „Gewinn je Aktie" und „Aktienanzahl" über zehn Jahre (NVIDIA +4 208 % Aktien) → Split-Erkennung, Zeilen weggelassen, Grund auf der Seite; (2) Mikro-Titel mit +1 583 % p. a. Umsatzwachstum auf einer Basis von wenigen Millionen führten „Umsatz wächst stark" an, eine Nettomarge von −43 832 % stand in „Margen werden stärker" → Umsatzbasis ≥ 100 Mio. $, Wachstum ≤ 300 %, Nettomarge ≥ −25 % in der Margen-Reihe; (3) „mehr als verdoppelt" für +4 210 % → das Vielfache wird ausgesprochen; (4) Story-Fläche fehlte auf der Startseite (fiel als Ein-Karten-Fläche der Diversity zum Opfer) → Titel wird nach der Diversity gewählt.

Was noch nicht Netflix ist: keine bewegten Vorschauen (bewusst: keine künstliche Animation), keine Profile, „Weil du … angesehen hast" nur aus dem Gerätegedächtnis; die Themenwelten sind drei (KI, Robotik, Mobilität); Sektorwelten ohne eigene Bildsprache je Sektor.

## 24. Finaler Commit

Zweig `claude/vision-universe-discover-v3`, Kette dieses Auftrags: 5aa3747f (Phase A) → f5562d3e (Consumer-Export + Workflow) → 77a2cb4b (Engine + Build) → 462882ed (Phase C Teil 1) → ff6d448a (Empfehlungs-Vertrag, Suche, Doku) → 8d9f0e64 (Klartext 1.1.0, Desktop-Hero) → cb37f71b (Test-Präzisierung) → 5169f706 / 43935f07 (CI: Consumer-Bundles) → a94b5942 (Normalisierung 1.6.0, TTM-Fenster, Story-Fläche) → **dieser Commit** (Split-Erkennung, Umsatzbasis der Reihen, Vorzüge P/O/N/M, Neubeurteilung des Masters, Hook auf der Aktienseite, mobile Verdichtung, Bericht). Working Tree clean, nicht gemergt, nicht veröffentlicht.

## 24b. Zusammenführung mit `main` und Live-Schaltung (15.09.2026)

Der Eigentümer hat am 15.09.2026 entschieden: Modelluniversum raus, alles live.

* **Modelluniversum entfernt:** Discover liefert nur noch `US_REAL` (Build, Methodik,
  Meta, Suche, Startseite); der Universumsschalter erscheint nur bei mehr als einem
  Universum, `#/u/VU_MODEL` fällt auf das reale Universum zurück. Der synthetische
  Generator bleibt im Quant-Modul für Tests.
* **`main` als Basis:** `main` trägt seit dem Abzweig die kanonische SEC-Schicht
  (Normalisierung bis 1.9.0, IFRS/Fremdwährungen, 5 448 Emittenten in R2, täglicher
  Lifecycle, Company Master unter `quant/data/universe/`). Dieser Zweig wurde auf
  diesen Stand gemergt: Pipeline-Code von `main`, darauf mein Consumer-Export als
  zweite Ausgabe derselben Module (`consumer.py`, `cli.py consumer`), meine
  Kalenderkorrektur als Normalisierung **1.10.0** (Jahresgrenzen nur aus
  Jahresberichten inkl. /A; Zwölfmonatsperiode abseits des Jahresendes ist kein FY),
  Discover/Klassifizierer/Eligibility aus dem Zweig; `instrumentId` des Company
  Masters auf jeder Aktienseite; Company-Master-Artefakte aus der neuen Eligibility
  neu gebaut (`build-company-master.mjs`, Totals = Eligibility-Counts).
* **Was noch zusammenzuführen ist (Eigentümer-Entscheidung 6):** die Consumer-Bundles
  entstehen heute aus dem SEC-Bulk-Archiv (eine Anfrage, wöchentlich); `main` hält
  dieselben Emittenten als kanonische Factbooks in R2 (täglich). Nächster Schritt:
  den Consumer-Export aus den R2-Factbooks speisen, dann gibt es genau eine
  Ingestion. Bis dahin rechnen beide Wege mit demselben Normalisierungscode.

## 25. Regression — was unverändert blieb

Company Master, Provider-Mapping, Kurse, Intraday, Session Resolver, Live-Hub,
Quant, Technical, Navigation, CI-Workflows: unverändert; die Suites 18–21
belegen es.

## 26. Offene Eigentümer-Entscheidungen

1. **Testsymbole im Master**: bleiben als EXCLUDED/TEST_SECURITY; Löschen aus
   dem Master wäre eine destruktive Migration — nicht getan.
1b. **Company Master mit Klassifizierer 1.2.0 neu erheben**: die Arbeitsablage
   trägt 1.1.0 und wird beim Eignungslauf neu beurteilt; eine Neuerhebung braucht
   die Anbieterliste (Tiingo-Zugang, CI) und ist ein eigener Lauf.
2. **1362 Titel ohne CIK**: SEC hat für sie nichts; eine andere
   Fundamentalquelle wäre eine neue (kostenpflichtige) Datenquelle.
3. **Datenwachstum**: Consumer-Bundles ~94 MB im Repository,
   wöchentlicher Lauf; Alternative wäre ein Objektspeicher außerhalb von Pages.
4. **ROIC** bleibt aus, bis eine Steuerannahme entschieden ist.
5. **Merge/Veröffentlichung**: am 15.09.2026 auf Anweisung des Eigentümers nach `main`
   gemergt und über GitHub Pages veröffentlicht (§24b).
6. **Eine Ingestion für die Fundamentals**: Consumer-Export aus den R2-Factbooks
   statt aus dem Bulk-Archiv (§24b).
