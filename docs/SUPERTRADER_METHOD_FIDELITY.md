# Supertrader — Methodentreue, Ursachen, neue Versionen (Runde 7, 02.10.2026)

Dieses Dokument trennt für jede Methode, **was eine Quelle tatsächlich sagt**, **welche Regel im Code steht**
und **wie diese Regel einzuordnen ist**. Einzige Datenquelle für Produktstatus und Matrix ist
`scripts/supertrader/fidelity.mjs` (registry.json → Methodenseite „Was stammt vom Trader, was von Vision Universe?“).

## Quellenzugang

Die Netzwerkrichtlinie der Arbeitsumgebung sperrte fast alle Primärseiten: minervini.com, qullamaggie.com,
originalturtles.org, investors.com, time.com, SSRN und Google Books. Belegt ist deshalb nur, was mehrere unabhängige
Suchauszüge übereinstimmend wiedergeben.

- Keine Regel stammt aus einer unrechtmäßigen Buchkopie.
- Fehlendes Originalmaterial ist je Methode benannt.
- Primärauszüge, auf die Regeln gestützt sind:
  - Minervini: eigene Beiträge auf X (Risiko je Trade, Positionsgröße, Einstand, schrittweise Exposition).
  - Kullamägi: eigener Blog und FAQ.
  - Darvas: TIME, Mai 1959 („Business: Pas de Dough“).
- Alles Weitere ist sekundär und als solches gekennzeichnet.

## Kurzantwort

Keine Methode ist heute „quellentreu nachgebildet“.

- **Vision-Universe-Varianten mit belegten Kernideen und eigenen Annahmen:** Minervini, Weinstein, Momentum/Kullamägi,
  Darvas und Donchian.
- **Teilprüfung:** CAN SLIM und Piotroski.
- **Forschung:** Greenblatt.

Die Gründe, warum keine Methode quellentreu ist:

- Ermessensbausteine: VCP-Beurteilung, Stufenurteil, Basisqualität.
- Fehlende Daten: Intraday-Kurse, Fundamentaldaten zum damaligen Stichtag, Gruppen- und Marktbreite.
- Bei Donchian: Die Regeln sind für Futures-Portfolios geschrieben.

## Methodentreue-Matrix

### Minervini (SEPA/VCP) — Vision-Universe-Variante

Trend Template ist mechanisch; ob eine Basis eine echte VCP ist, wo der Pivot liegt und wann in die Stärke verkauft wird, entscheidet Minervini nach Augenmaß.

| Bereich | Quelle sagt | Belegstufe | Im Code | Einordnung |
|---|---|---|---|---|
| Auswahl | Trend Template: Kurs über 50/150/200-Tage-Linie, Linien geordnet, 200-Tage-Linie steigt ≥ 1 Monat | Übereinstimmende Sekundärquellen | Kurs über 50/150/200-Tage-Linie, Linien geordnet, 200-Tage-Linie höher als vor 21 Sitzungen | Vertretbare Umsetzung |
| Auswahl | Mindestens 30 % (Buch 2013) bzw. 25 % (ältere Fassung) über dem 52-Wochen-Tief | Quellen widersprechen sich | 1.1.0: 25 % · 2.0.0: 30 % | Vertretbare Umsetzung |
| Auswahl | Höchstens 25 % unter dem 52-Wochen-Hoch | Übereinstimmende Sekundärquellen | Kurs mindestens 75 % des 52-Wochen-Hochs | Originalregel |
| Auswahl | IBD-RS-Rang ≥ 70 (lieber 80–90) | Übereinstimmende Sekundärquellen | VU-Perzentil der gewichteten 3–12-Monats-Rendite ≥ 70 | Vision-Universe-Erweiterung – IBD-RS ist proprietär. |
| Basis | VCP: 2–6 Kontraktionen, jede enger, Volumen trocknet aus, Pivot am Hoch der letzten engen Zone | Übereinstimmende Sekundärquellen | Zickzack 4 %, ≥ 2 fallende Tiefen, erste ≤ 35 %, letzte ≤ 10 %, Volumen 10/50 < 0,8 | Vertretbare Umsetzung – Minervini beschreibt die VCP nur qualitativ (X, primär). |
| Einstieg | Kauf beim Ausbruch über den Pivot; Volumen deutlich über Durchschnitt | Primärquelle, nur Auszug lesbar | 1.1.0: Schluss über Pivot ohne Volumenregel · 2.0.0: zusätzlich ≥ 1,4× 50-Tage-Volumen | Vertretbare Umsetzung – Zahl 40–50 % nur sekundär. |
| Stop | Stop vor dem Einstieg festlegen; höchstens 10 % Verlust | Primärquelle, nur Auszug lesbar | Kontraktionstief, höchstens 10 % unter Einstieg | Vertretbare Umsetzung – 10 % aus Schwager-Interview, sekundär. |
| Ausstieg | Gewinne nie zu Verlusten werden lassen; Stop auf Einstand | Primärquelle, nur Auszug lesbar | 1.1.0: fehlt · 2.0.0: Stop auf Einstand ab 3 Anfangsrisiken Gewinn | Vertretbare Umsetzung – 3R nur sekundär. |
| Ausstieg | In die Stärke verkaufen; Bruch der 50-Tage-Linie mit hohem Volumen | Übereinstimmende Sekundärquellen | 1.1.0: jeder Schluss unter der 50-Tage-Linie (VU) · 2.0.0: nur mit überdurchschnittlichem Volumen | Vertretbare Umsetzung – 1.1.0 war eine VU-Regel. |
| Positionsgröße | Ø 1,25 % Risiko je Trade, höchstens 2,5 %; 25 % Position bei 5 % Stop | Primärquelle, nur Auszug lesbar | 1.1.0: 0,5 % (VU) · 2.0.0: 1,25 %, max. 25 % | Originalregel |
| Portfolio | Schrittweise Exposition nach Ergebnis der letzten 4–5 Trades | Primärquelle, nur Auszug lesbar | 2.0.0: halbes Risiko nach netto negativen letzten 5 Trades | Vertretbare Umsetzung |
| Fundamentaldaten | Beschleunigung von Gewinn, Umsatz, Marge über drei Quartale („Code 33“) | Übereinstimmende Sekundärquellen | fehlt | Fehlt im Code – Keine Gewinndaten zum damaligen Stichtag. |

**Fehlt:** Fundamentaldaten (Code 33); Cheat-/Low-Cheat-Einstiege vor dem Pivot; Verkauf in die Stärke / Klimax-Signale; Diskretionäre Basisbeurteilung; Proprietäres Marktmodell.  
**Daten:** historisch Tageskurse aller damals gelisteten US-Aktien ab 2016 (inkl. delisteter); live Tageskurse ~6.000 US-Aktien, ein Jahr Tageshistorie; Lücken: keine Gewinne/Umsätze zum Stichtag; kein IBD-RS.  
**Benötigtes Originalmaterial:** Trade Like a Stock Market Wizard (2013): Trend Template, VCP, Risiko-Kapitel; Think & Trade Like a Champion (2017): Einstiege, Größe, Einstand; Schwager, Stock Market Wizards (2001): Minervini-Kapitel (10-%-Grenze).

### Weinstein (Stage Analysis) — Vision-Universe-Variante

Stufen und Steigung der 30-Wochen-Linie beurteilt Weinstein nach Augenmaß; Gruppenstärke und Marktindikatoren werden gewichtet, ohne feste Zahl.

| Bereich | Quelle sagt | Belegstufe | Im Code | Einordnung |
|---|---|---|---|---|
| Auswahl | Vier Stufen, 30-Wochen-Linie; Kauf nur in Stufe 2 | Übereinstimmende Sekundärquellen | Stufe aus Steigung (±0,5 %/4 Wochen) und Lage zur Linie | Vertretbare Umsetzung – Keine Steigungszahl im Original. |
| Basis | Stufe-1-Basis, Widerstand an der Oberkante | Übereinstimmende Sekundärquellen | Basis ≥ 10 Wochen flache Linie, Kurs ±15 % um die Linie, Widerstand = höchster Wochenschluss | Vertretbare Umsetzung |
| Basis | — | Keine Quelle | 1.1.0: Setup verworfen, sobald die Linie vor dem Ausbruch steigt · 2.0.0: Basis bleibt bis Ausbruch/Bruch | Unbelegte Annahme – Umsetzungsfehler in 1.1.0: verwarf in der lokalen Probe die Hälfte der Basen. |
| Einstieg | Ausbruch über den Widerstand (Kauforder knapp darüber) | Übereinstimmende Sekundärquellen | Wochenschluss über dem Widerstand, Kauf zur nächsten Eröffnung | Vertretbare Umsetzung |
| Einstieg | Ausbruchsvolumen mindestens doppelt so hoch wie der Schnitt der Vorwochen | Übereinstimmende Sekundärquellen | 1.1.0: 1,5× zehn Wochen (VU) · 2.0.0: 2× vier Wochen | Vertretbare Umsetzung |
| Relative Stärke | Nie mit negativer RS kaufen (Mansfield-RS, Nulllinie) | Übereinstimmende Sekundärquellen | 1.1.0: 13-Wochen-Anstieg (VU) · 2.0.0: Mansfield-RS > 0 | Vertretbare Umsetzung |
| Marktfilter | „Forest to the trees“: erst Markt, dann Gruppe, dann Aktie | Übereinstimmende Sekundärquellen | 1.1.0: fehlt · 2.0.0: SPY über nicht fallender 30-Wochen-Linie; Gruppe fehlt | Vertretbare Umsetzung |
| Stop | Unter dem bedeutenden Tief unter dem Ausbruch, nicht auf runden Zahlen | Übereinstimmende Sekundärquellen | 2 % unter der Basis; Rundungsregel fehlt | Vertretbare Umsetzung |
| Ausstieg | Investor: Stop nachziehen unter Korrekturtiefs/30-Wochen-Linie; raus spätestens in Stufe 4 | Übereinstimmende Sekundärquellen | 1.1.0: Stop 2 % unter der Linie im Wochenverlauf (VU) + Wochenschluss darunter · 2.0.0: nur Wochenschluss unter der Linie | Vertretbare Umsetzung |
| Positionsgröße | Halbe Position beim Ausbruch, Rest beim Rücksetzer | Übereinstimmende Sekundärquellen | fehlt (VU-Standard 0,5 % Risiko) | Vision-Universe-Erweiterung |

**Fehlt:** Gruppen-/Sektorstufe; Langfristige Marktindikatoren (A/D-Linie, Momentum-Index); Halbposition + Rücksetzer-Kauf; Rundungsregel für Stops; Leerverkauf in Stufe 4.  
**Daten:** historisch Wochenreihen aus Point-in-Time-Tagesbalken ab 2016, SPY-Wochenschluss; live Lange Wochenschlusskurse + ein Jahr Tagesbalken (Wochenvolumen nur im Tagesfenster); Lücken: keine Gruppenzuordnung zum Stichtag; keine Marktbreite.  
**Benötigtes Originalmaterial:** Secrets for Profiting in Bull and Bear Markets (1988): Kapitel Kaufzeitpunkt, Verkauf, Langfristindikatoren; Stocks & Commodities Interview V.39:11 (2021).

### Momentum Breakout (Kullamägi) — Vision-Universe-Variante

Kullamägi kauft im Tagesverlauf am Hoch der ersten Minuten (Opening Range); dafür fehlen historische Intraday-Kurse. Basisqualität beurteilt er nach Augenmaß.

| Bereich | Quelle sagt | Belegstufe | Im Code | Einordnung |
|---|---|---|---|---|
| Auswahl | Die 1–2 % stärksten Aktien über 1, 3, 6 Monate | Primärquelle, nur Auszug lesbar | Perzentil ≥ 98 über 1/3/6 Monate | Originalregel |
| Basis | Vorlauf 30–100 % in 1–3 Monaten, 2 Wochen bis 2 Monate geordnete Konsolidierung an steigenden 10/20-Tage-Linien | Primärquelle, nur Auszug lesbar | Vorlauf ≥ 30 %, Basis 10–40 Sitzungen, Tiefe ≤ 25 %, höhere Tiefs, enger werdende Spanne | Vertretbare Umsetzung |
| Einstieg | Kauf am Opening-Range-Hoch (1/5/60 Minuten) | Primärquelle, nur Auszug lesbar | Schluss über dem 5-Tage-Hoch, Kauf zur nächsten Eröffnung; Gap > 0,5 ADR ausgelassen | Vertretbare Umsetzung – Größte Abweichung: Tagesdaten statt Intraday. |
| Stop | Tagestief des Einstiegstags, nicht weiter als ADR | Primärquelle, nur Auszug lesbar | Tief des Bestätigungstags (Vortag des Einstiegs), höchstens 1 ADR | Vertretbare Umsetzung – Mit Tagesdaten ist das Tief des Einstiegstags beim Einstieg unbekannt; dieser Ersatz-Stop greift oft schon am Einstiegstag – Hauptursache der sehr kurzen Haltedauer. |
| Ausstieg | 1/3–1/2 nach 3–5 Tagen verkaufen, Stop auf Einstand | Primärquelle, nur Auszug lesbar | 1/3 nach 3 Sitzungen, Rest auf Einstand | Originalregel |
| Ausstieg | Rest an der 10/20-Tage-Linie nachziehen | Primärquelle, nur Auszug lesbar | 1.1.0: 10-Tage-Ausstieg ab Tag 1 für die ganze Position · 2.0.0: nur für den Rest | Vertretbare Umsetzung – Umsetzungsfehler in 1.1.0, in 2.0.0 korrigiert – im Test fast ohne Wirkung. |
| Positionsgröße | Meist 0,3–0,5 % Risiko, Positionen 10–20 % | Primärquelle, nur Auszug lesbar | 0,5 % Risiko, max. 20 % | Originalregel |
| Marktfilter | Index über 10/20-Tage-Linie (nur aus Streams/Tweets berichtet) | Keine Quelle | fehlt | Fehlt im Code |
| Liquidität | keine Vorgabe der Methode | Keine Quelle | Kurs ≥ 5 USD, 5 Mio. USD Tagesumsatz, ADR ≥ 2 % | Vision-Universe-Erweiterung |

**Fehlt:** Intraday-Einstieg am Opening-Range-Hoch; Episodic Pivots (eigenes Setup, Nachrichten); Parabolic Shorts; Marktfilter.  
**Daten:** historisch Tageskurse ab 2016 (inkl. delisteter); live Tageskurse; Lücken: keine Intraday-Historie; keine Nachrichten-/Gap-Ursache.  
**Benötigtes Originalmaterial:** qullamaggie.com Beiträge im Volltext (3 timeless setups, FAQ, Episodic Pivots) – frei verfügbar, in dieser Umgebung gesperrt; Historische 1-/5-Minuten-Kurse (kostenpflichtig).

### Darvas Box — Vision-Universe-Variante

Was eine Box ist, beschreibt Darvas nicht als Formel; die verbreitete 3-Tage-Regel ist eine spätere Rekonstruktion.

| Bereich | Quelle sagt | Belegstufe | Im Code | Einordnung |
|---|---|---|---|---|
| Auswahl | Starke Aktien nahe neuer Hochs, Zukunftsbranchen, steigende Ertragskraft | Übereinstimmende Sekundärquellen | Nahe 52-Wochen-Hoch + 6-Monats-Perzentil ≥ 80; Ertragskraft fehlt | Vertretbare Umsetzung |
| Basis | Box: Kurs pendelt zwischen Ober- und Unterkante | Übereinstimmende Sekundärquellen | Oberkante/Unterkante je 3 Sitzungen bestätigt, Höhe 3–25 % | Vision-Universe-Erweiterung – 3-Tage-Regel nur sekundär. |
| Einstieg | Kauforder knapp über der Boxoberkante | Primärquelle, nur Auszug lesbar | Schluss über der Oberkante, Kauf zur nächsten Eröffnung | Vertretbare Umsetzung |
| Stop | Stop-Loss knapp unter dem Kaufkurs (TIME, 1959) | Primärquelle, nur Auszug lesbar | 1.2.0: Boxunterkante · 2.0.0: 1 % unter der Oberkante | Vertretbare Umsetzung – 1.2.0 wich vom Primärbeleg ab; die quellennähere 2.0.0 erzeugt mit Schlusskurs-Einstieg sehr viele Fehlausbrüche. |
| Ausstieg | Stop mit jeder höheren Box nachziehen | Übereinstimmende Sekundärquellen | Neue bestätigte Boxunterkante | Vertretbare Umsetzung |
| Positionsgröße | Aufstocken in steigende Boxen | Übereinstimmende Sekundärquellen | fehlt (VU-Standard 0,5 %) | Vision-Universe-Erweiterung |

**Fehlt:** Fundamentalfilter („techno-fundamentalist“); Volumenbestätigung (keine Zahl belegt); Pyramiding.  
**Daten:** historisch Tageskurse ab 2016; live Tageskurse; Lücken: keine Gewinndaten zum Stichtag.  
**Benötigtes Originalmaterial:** How I Made $2,000,000 in the Stock Market (1960), z. B. über die Ausleihe im Internet Archive.

### Donchian/Turtle — Vision-Universe-Variante

Die Turtle-Regeln sind vollständig mechanisch – aber für ein gestreutes Futures-Portfolio geschrieben, nicht für Einzelaktien.

| Bereich | Quelle sagt | Belegstufe | Im Code | Einordnung |
|---|---|---|---|---|
| Einstieg | System 1: Ausbruch über das 20-Tage-Hoch (Stop-Order im Tagesverlauf) | Übereinstimmende Sekundärquellen | Schluss über dem 20-Tage-Hoch, Kauf zur nächsten Eröffnung | Vertretbare Umsetzung |
| Einstieg | Signal auslassen, wenn der letzte Ausbruch ein Gewinner war | Übereinstimmende Sekundärquellen | fehlt | Fehlt im Code – Fehlender Originalbaustein. |
| Stop | 2N (N = 20-Tage-ATR) | Übereinstimmende Sekundärquellen | 2N unter der Eröffnung | Originalregel |
| Ausstieg | Bruch des 10-Tage-Tiefs | Übereinstimmende Sekundärquellen | Schluss unter dem 10-Tage-Tief, Verkauf zur nächsten Eröffnung | Vertretbare Umsetzung |
| Positionsgröße | 1 Unit = 1 % Konto je N; bis 4 Units im Abstand ½ N | Übereinstimmende Sekundärquellen | 0,5 % Risiko je Trade, kein Aufstocken | Vision-Universe-Erweiterung |
| Portfolio | Limits je Markt / korrelierte Märkte | Übereinstimmende Sekundärquellen | max. 10 Positionen | Vision-Universe-Erweiterung |
| Universum | Gestreute Futures | Übereinstimmende Sekundärquellen | Liquide US-Aktien ≥ 10 USD, 20 Mio. USD Umsatz | Vision-Universe-Erweiterung |

**Fehlt:** System-1-Filter; Unit-Größe 1 % je N; Pyramiding bis 4 Units; Korrelationslimits; System 2 (55/20 Tage).  
**Daten:** historisch Tageskurse ab 2016; live Tageskurse; Lücken: keine.  
**Benötigtes Originalmaterial:** Curtis Faith, The Original Turtle Trading Rules (frei auf originalturtles.org; hier gesperrt).

### CAN SLIM (O'Neil) — Teilprüfung

C, A und L haben Zahlen; N, S und I sind Ermessen; M (Follow-Through-Tage, Distributionstage) ist mechanisch, aber nicht umgesetzt.

| Bereich | Quelle sagt | Belegstufe | Im Code | Einordnung |
|---|---|---|---|---|
| C | Quartals-EPS ≥ 25 % ggü. Vorjahr, Umsatz ≥ 25 % oder beschleunigt | Übereinstimmende Sekundärquellen | Teilprüfung mit zuletzt berichteten Werten | Vertretbare Umsetzung |
| A | Jahres-EPS ≥ 25 % in drei Jahren, Eigenkapitalrendite ≥ 17 % | Übereinstimmende Sekundärquellen | Teilprüfung | Vertretbare Umsetzung |
| L | RS-Rang ≥ 80 | Übereinstimmende Sekundärquellen | VU-Perzentil | Vision-Universe-Erweiterung |
| M | Follow-Through-Tag, Distributionstage | Übereinstimmende Sekundärquellen | fehlt | Fehlt im Code |
| Kauf/Verkauf | Pivot + ≥ 40–50 % Volumen, nicht > 5 % darüber; Verlust bei 7–8 % begrenzen | Übereinstimmende Sekundärquellen | fehlt | Fehlt im Code |

**Fehlt:** Gewinne zum Veröffentlichungszeitpunkt; Institutionelle Halter (13F); Basismuster; Marktrichtung M; Ein- und Ausstieg.  
**Daten:** historisch nicht vorhanden (keine Fundamentaldaten zum Stichtag); live zuletzt berichtete Quartalszahlen (SEC); Lücken: Point-in-Time-Fundamentaldaten, 13F.  
**Benötigtes Originalmaterial:** How to Make Money in Stocks (4. Aufl. 2009); Point-in-Time-Fundamentaldaten mit Meldedatum.

### Piotroski F-Score — Teilprüfung

Neun eindeutige Kennzahlen aus zwei Jahresabschlüssen – vollständig mechanisch, aber nur mit Abschlüssen zum damaligen Stand testbar.

| Bereich | Quelle sagt | Belegstufe | Im Code | Einordnung |
|---|---|---|---|---|
| Auswahl | Nur das Fünftel mit dem höchsten Buchwert-Kurs-Verhältnis | Übereinstimmende Sekundärquellen | fehlt | Fehlt im Code |
| Score | Neun binäre Signale (ROA, CFO, ΔROA, Accrual, ΔVerschuldung, ΔLiquidität, keine Emission, ΔMarge, ΔUmschlag) | Übereinstimmende Sekundärquellen | Teilprüfung mit zuletzt berichteten Werten | Vertretbare Umsetzung |
| Zeitpunkt | Start im 5. Monat nach Geschäftsjahresende, Haltedauer 1 Jahr | Übereinstimmende Sekundärquellen | fehlt | Fehlt im Code |

**Fehlt:** Buchwert-Kurs-Filter; Zeitlogik (Meldedatum); Haltedauer.  
**Daten:** historisch nicht vorhanden; live Jahresabschlüsse (SEC), zuletzt berichtet; Lücken: Abschlüsse zum damaligen Stand.  
**Benötigtes Originalmaterial:** Piotroski (2000), Journal of Accounting Research 38 – Originalaufsatz; Point-in-Time-Abschlüsse.

### Greenblatt Magic Formula — Forschung

Die Rangformel ist mechanisch; es fehlen EBIT, Unternehmenswert und Bilanzposten je Stichtag.

| Bereich | Quelle sagt | Belegstufe | Im Code | Einordnung |
|---|---|---|---|---|
| Rang | Ertragsrendite EBIT/EV und Kapitalrendite EBIT/(Nettoumlaufvermögen + Sachanlagen), Rangsumme | Übereinstimmende Sekundärquellen | nicht umgesetzt | Fehlt im Code |
| Universum | ≥ 50 Mio. USD, ohne Finanzwerte, Versorger, ausländische Titel | Übereinstimmende Sekundärquellen | nicht umgesetzt | Fehlt im Code |
| Portfolio | 20–30 Aktien, gestaffelt gekauft, rund 1 Jahr gehalten | Übereinstimmende Sekundärquellen | nicht umgesetzt | Fehlt im Code |

**Fehlt:** Alle Rechengrößen je Stichtag; Portfolio-Staffelung.  
**Daten:** historisch nicht vorhanden; live Pflichtfelder fehlen; Lücken: EBIT, Schulden, Barmittel, Sachanlagen je Stichtag.  
**Benötigtes Originalmaterial:** The Little Book That Beats the Market (2005/2010), Anhang.


## Ursachen der negativen Ergebnisse (Diagnose, Lauf 36985593528)

Die Diagnose ist kein Test einer Hypothese und keine neue Regelversion. Sie nutzt dieselben Daten, Engines und
Ausführungsannahmen wie die Prüfung. Zahlen stehen nur verschlüsselt in `scripts/supertrader/validation/evidence-internal.sealed.json`.

### Nachweislich

1. **Die Signale selbst sind im Mittel schlechter als SPY im selben Haltezeitraum.**
   - Das gilt für alle fünf getesteten Versionen.
   - Der Median liegt deutlich im Minus, und nur etwa ein Viertel bis ein Drittel der Trades schlägt SPY über denselben Zeitraum.
   - Das ist der Hauptgrund. Er liegt in den Regeln und ihrer Umsetzung, nicht in der Portfoliohülle.
2. **Cash erklärt nur einen Teil.**
   - Momentum und Weinstein sind die meiste Zeit kaum investiert.
   - Eine SPY-Anlage mit genau derselben täglichen Investitionsquote schneidet trotzdem bei jeder Version besser ab.
   - Ein Vergleich mit geringerem Kapitaleinsatz verdeckt das schwache Ergebnis also nicht – er bestätigt es.
3. **Positionsgröße und Reihenfolge sind nicht die Ursache.**
   - Gleichgewichtung oder 1 % Risiko je Trade (reine Diagnoseszenarien) verbessern nur Minervini spürbar, und auch dort bleibt das Ergebnis unter SPY.
   - Zufällige Reihenfolgen gleichzeitiger Einstiege streuen nur um wenige Prozentpunkte.
   - Übersprungene Kandidaten waren im Schnitt nicht besser als übernommene (Ausnahme Minervini 1.1.0: dort waren sie schlechter).
4. **Momentum 1.1.0:**
   - Die mittlere Haltedauer beträgt zwei Sitzungen; rund 30 % der Trades enden am Einstiegstag.
   - Ursache ist der Ersatz-Stop am Tief des Bestätigungstags, der bei Einstieg zur nächsten Eröffnung oft sofort greift. Das Original nutzt das Tief des Einstiegstags bei Intraday-Einstieg; dafür fehlen historische Intraday-Daten.
   - Die zunächst vermutete Ursache, der 10-Tage-Ausstieg ab dem ersten Tag, war zwar eine Abweichung von der Quelle, ihre Korrektur in 2.0.0 änderte das Ergebnis aber kaum. Diese Hypothese ist widerlegt.
5. **Weinstein 1.1.0 – drei Umsetzungsfolgen:**
   - Vorbereitete Basen wurden verworfen, sobald die 30-Wochen-Linie vor dem Ausbruch drehte oder die 13-Wochen-RS fiel. Das betraf über tausend Basen.
   - Viele Ausbrüche scheiterten an der 1,5×-Volumenregel.
   - Der Einstieg erfolgt per Wochenschluss und erst zur Eröffnung der Folgewoche, im Median deutlich über dem Trigger. Der weite Stop führt zu kleinen Positionen.
6. **Darvas 1.2.0 und Donchian 1.1.0:**
   - Sehr viele Signale; die Portfolios sind voll investiert (Donchian) bzw. zur Hälfte (Darvas).
   - Je Signal kein Vorteil gegenüber SPY.
   - Bei Donchian fehlen wesentliche Turtle-Bausteine (Filter, Unit-Größe, Pyramiding); das System ist für Futures-Portfolios geschrieben.
7. **Kosten:** Rund 0,2 % je Hin- und Rückweg (Gebühr und Slippage). Bei kleinen Durchschnittsergebnissen ist das spürbar, erklärt aber nicht das negative Ergebnis gegenüber SPY.
8. **Live gegen Backtest:** Beide nutzen denselben Simulator (`engine/simulator.mjs`), dieselbe Ausführung und dieselben Engines. Bekannte Unterschiede:
   - Das Live-Universum sind die heute gelisteten US-Aktien (Discovery-Daten), die Prüfung nutzt das damalige Universum.
   - Live gibt es ein Jahr Tagesbalken, die lange Wochenreihe hat live kein Volumen außerhalb des Tagesfensters.
   - Die Querschnittsränge werden live über das heutige Universum berechnet.

### Noch Hypothese

- Ob Einstiege im Tagesverlauf (Opening Range, Kauforder knapp über dem Widerstand) die Signalqualität von Momentum, Darvas und Weinstein deutlich verbessern, ist mit den vorhandenen Daten nicht prüfbar.
- Ob Fundamentaldaten zum damaligen Stand (Minervini „Code 33“, Darvas, CAN SLIM) die Auswahl verbessern, ist ohne solche Daten nicht prüfbar.
- Ob Gruppen- und Marktbreite (Weinstein) helfen, ist ohne historische Gruppenzuordnung nicht prüfbar.

## Neue Regelversionen 2.0.0 (vorab registriert, Lauf 36990677933)

Die Versionen sind in `PREREGISTRATION-R7.json` festgelegt; der Commit liegt vor jedem historischen Lauf der neuen Versionen.

**Alte Ergebnisse bleiben unverändert:**
- Die Versionen 1.x wurden im selben Lauf als Referenz erneut gerechnet und **exakt reproduziert** (gleiche Trades, gleiche Überrendite).
- Ihre Einstufung „ohne überzeugenden Vorteil“ bleibt bestehen.

| Version | Änderung (Quelle) | Ergebnis (intern) |
|---|---|---|
| Momentum 2.0.0 | 10-Tage-Ausstieg nur für den Rest nach dem Teilverkauf (Kullamägi) | robust negativ, praktisch wie 1.1.0 |
| Weinstein 2.0.0 | Marktfilter, Mansfield-RS, 2× Volumen, Basis bleibt bestehen, Ausstieg nur per Wochenschluss (Sekundärquellen) | robust negativ; je Trade besser als 1.1.0, Investitionsquote weiter niedrig |
| Darvas 2.0.0 | Stop knapp unter der Ausbruchsmarke (TIME 1959) | robust negativ, deutlich schlechter als 1.2.0 (sehr viele Fehlausbrüche) |
| Minervini 2.0.0 | 30-%-Abstand, Ausbruchsvolumen, Einstand ab 3R, Ausstieg nur mit Volumen, 1,25 % Risiko, schrittweise Exposition | robust negativ; Signalqualität je Trade erstmals leicht positiv, Portfolio wegen niedriger Investitionsquote unter SPY |

**Alle Kontrollen bestanden:** C1 (Abstimmung), C2 (Portfolio-Engines identisch), C3m (Stichproben gegen Rohbalken), AT5 (Rohkursgrenze).

**Zeitliche Trennung:**
- 2016–2020 und 2021–2026 sind getrennt ausgewertet; beide Teilzeiträume sind negativ.
- Eine echte Prüfung außerhalb der Stichprobe gibt es nur vorwärts. Die Versionen 2.0.0 laufen deshalb ab dem 02.10.2026 live und werden protokolliert.

**Produktentscheidung:**
- Live läuft je Methode die neueste vorab registrierte Version.
- Öffentlich steht überall „In Prüfung“, bis die Rechte geklärt sind.
- Alle Versionen werden als Forschung gezeigt, nicht als Einstiegschance.
- Positionen der Version 1.x werden nach ihren eigenen Regeln zu Ende geführt (`engine.legacy`).

## Modellportfolio

`portfolio.json` wendet je Methode dieselbe Portfoliologik wie die Prüfung auf das Live-Protokoll an:
- 100.000 USD Startkapital;
- Positionsgröße aus Risiko je Trade und Stopabstand, mit Höchstgrenzen;
- gleichzeitige Einstiege alphabetisch.

Gezeigt werden Cash, Gewichte, Stops, nicht übernommene Einstiege (mit Grund) und abgeschlossene Trades. Eine Gesamtrendite oder Kurve wird bis zur Rechteklärung nicht veröffentlicht.

## Zugangsschutz

`docs/RESEARCH_ACCESS_GATE.md` verspricht eine clientseitige Entwicklungs-/Marketing-Maske, keinen Zugriffsschutz, und die Maske selbst verspricht keinen Schutz. `/__research/content/` ist dokumentiert direkt abrufbar; schließen lässt sich das nur serverseitig (PR #328). Der Supertrader-Produktions-Smoke weist den tatsächlichen Direktzugriff aus und prüft `noindex` an der Maske.

## Offene externe Entscheidungen

1. Rechte zur Veröffentlichung aus Tiingo-Daten abgeleiteter Kennzahlen (Backtests und Gesamtrendite des Modellportfolios).
2. Legaler Zugang zu den Originalwerken und Primärseiten, siehe „Benötigtes Originalmaterial“ je Methode; die Netzwerkfreigabe der Arbeitsumgebung für die Trader-Websites wäre kostenlos.
3. Kostenpflichtige Daten, falls gewünscht: historische Intraday-Kurse (Momentum, Darvas, Weinstein) und Fundamentaldaten zum damaligen Stand (CAN SLIM, Piotroski, Greenblatt, Minervini „Code 33“).
4. Serverseitige Sperre für `/__research/content/` (PR #328), falls echter Zugriffsschutz gewünscht ist.
