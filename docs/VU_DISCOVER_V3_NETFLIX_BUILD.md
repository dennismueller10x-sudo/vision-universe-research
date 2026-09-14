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
| ELIGIBLE | 6 477 | 6 050 | −427 |
| SEPARATE_CLASS | 308 | 713 | +405 (TRUST 126 · REIT 21 · ADR 16 · SPAC 232 · PREFERRED 318) |
| EXCLUDED | 799 | 925 | +126 (WARRANT 465 · UNIT 288 · RIGHT 122 · TEST_SECURITY 41 · ETF 4 · ETN 4 · CEF 1) |
| REVIEW | 219 | 115 | −104 (100 LISTING_INACTIVE, 15 Formen ohne Bestätigung) |
| **Produktuniversum** (alles außer EXCLUDED) | **7 004** | **6 878** | −126 |
| Testsymbole im Produkt | 11 | 0 | über Name/Ticker erkannt, EXCLUDED |

Was sich geändert hat und warum (594 Entscheidungen, `scratch phaseA-report`):
233 SPAC-Mäntel und 120 Trusts aus ELIGIBLE nach SEPARATE_CLASS (Name
belegt die Form); 54 Warrants, 13 Units aus REVIEW nach EXCLUDED (Form durch
Namen bestätigt); 11 Testsymbole und 1 ETF (BNY, als Fonds benannt) aus
ELIGIBLE nach EXCLUDED. Ticker-markierte Formen (PREFERRED/WARRANT/UNIT/RIGHT)
werden nie durch einen Emittentennamen herabgestuft.

**Consumer-Policy** (eine Stelle: `scripts/market/universe-source.mjs`,
`CONSUMER_INSTRUMENT_TYPES`): Discover, Suche, Sammlungen, Ähnliche und
Empfehlungen zeigen nur EQUITY_COMMON, ADR, REIT, TRUST, SPAC, UNKNOWN, OTHER.
Von 6 878 Produkttiteln sind 6 071 Consumer-Titel; ausgeschlossen bleiben 318
PREFERRED, 7 RIGHT, 6 WARRANT, 2 UNIT (sie bleiben im Master, in der Matrix
und in Faktoren). Vorher standen 315 Preferreds als Aktien auf Discover.

## 2. Namensabdeckung

Die Namensschicht `security-master/company-names.json` bleibt: **6 855 / 6 878
(99,67 %)** Produkttitel mit Namen, 23 ehrlich ungelöst (Anbieter ohne Namen;
Testsymbole sind jetzt außerhalb des Produkts). Kein Name erfunden. Neu ist eine
reine Anzeigeschicht `displayName` (`deriveDisplayName`): „Lilly(Eli) &
Company" → „Eli Lilly & Company", „Walt Disney Co (The)" → „Walt Disney",
„THOMSON REUTERS CORP /CAN/" → „Thomson Reuters", „MICRON TECHNOLOGY INC" →
„Micron Technology"; Rechtsformen fallen, Tickerartige Reste (≤ 4
Großbuchstaben) behalten den vollen Namen, Großschreibung wird nur bei
mehrwortigen Schreinamen normalisiert. Kanonischer, rechtlicher und
Anbietername bleiben unverändert und werden auf der Aktienseite genannt.

## 3. Fundamentale Abdeckung (gemessen, CI-Lauf {{RUN_ID}})

Die bestehende SEC-Pipeline (`scripts/quant/sec/`) bekam einen zweiten,
schlanken Export (`consumer.py`) aus dem Bulk-Archiv `companyfacts.zip` —
**keine zweite SEC-Architektur**; der Audit der anderen SEC-Zweige ist in
`VU_FUNDAMENTAL_INTELLIGENCE.md` §1.

| Stufe | Titel |
|---|---|
| Company Master | 7 803 |
| Produktuniversum | 6 878 |
| CIK zugeordnet (Namensschicht, SEC-Tickerverzeichnis) | {{cikMapped}} |
| ohne CIK | {{withoutCik}} |
| im Bulk-Archiv vorhanden (Bundle geschrieben) | {{secAvailable}} |
| nicht im Archiv / ohne periodische Formulare | {{notInCompanyFacts}} |
| Jahresreihe (≥ 2 FY Umsatz) | {{annualHistory}} |
| Quartalsreihe | {{quarterlyHistory}} |
| TTM möglich (vier Standalone-Quartale) | {{ttmPossible}} |
| aktuelle Zahlen (letztes FY oder Quartal) | {{latestFundamentals}} |
| 3 Jahre Historie | {{history3y}} |
| 5 Jahre Historie | {{history5y}} |
| 10 Jahre Historie | {{history10y}} |
| Fehler beim Bauen | {{failures}} |

Der 10-Jahres-Horizont lag im ersten Lauf bei 286 Titeln, weil das Fenster von
elf Geschäftsjahren am angebrochenen Jahr scheiterte; das Fenster ist jetzt 13
FY (`DEFAULT_ANNUAL_YEARS`), Ergebnis {{history10y}}.

## 4. Abdeckung je Kennzahl

{{PER_METRIC}}

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

{{ROW_COUNTS}}

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

{{withoutCik}} Produkttitel ohne CIK (Preferreds, ADR ohne 10-K/20-F,
Trusts, Auslandstitel); {{notInCompanyFacts}} CIKs ohne Bulk-Eintrag; keine
Analystendaten, Segmente, Kursziele, News, historischen Bewertungsbereiche
(Kursreihe beginnt 2023); ROIC.

## 16. Nicht gebaute Features

Server-Personalisierung, Konten, Autoplay-Vorschauen, Trading-Gamification
(bewusst), Push, Watchlist-Sync, Fundamentals für Titel ohne SEC-Einreichungen.

## 17. Performance vorher / nachher

{{PERF}}

## 18. Tests

{{TESTS}}

## 19. Verifier

{{VERIFIER}}

## 20. Guards

`assert-public-data-hygiene.mjs` (Umfang), `assert-no-secrets.mjs`,
Capability-Matrix, Eligibility-Reconciliation — alle in den Workflows,
Ergebnis {{GUARDS}}.

## 21. Browser-QA

{{BROWSER}}

## 22. Screenshots

{{SHOTS}}

## 23. Kritische Selbstbewertung

{{SELF}}

## 24. Finaler Commit

{{COMMIT}}

## 25. Regression — was unverändert blieb

Company Master, Provider-Mapping, Kurse, Intraday, Session Resolver, Live-Hub,
Quant, Technical, Navigation, CI-Workflows: unverändert; die Suites 18–21
belegen es.

## 26. Offene Eigentümer-Entscheidungen

1. **Testsymbole im Master**: bleiben als EXCLUDED/TEST_SECURITY; Löschen aus
   dem Master wäre eine destruktive Migration — nicht getan.
2. **{{withoutCik}} Titel ohne CIK**: SEC hat für sie nichts; eine andere
   Fundamentalquelle wäre eine neue (kostenpflichtige) Datenquelle.
3. **Datenwachstum**: Consumer-Bundles ~{{BUNDLE_MB}} MB im Repository,
   wöchentlicher Lauf; Alternative wäre ein Objektspeicher außerhalb von Pages.
4. **ROIC** bleibt aus, bis eine Steuerannahme entschieden ist.
5. **Merge/Veröffentlichung**: nicht getan, wie beauftragt.
