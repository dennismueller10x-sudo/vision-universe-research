# V12 SPXPOP – Qualifizierte PIT-Indexpopulation aus den Fondsbeständen selbst (P4)

Stand 29.10.2026. Evidenzart RECONSTRUCTION, `NOT_CERTIFIED`, `productionApproved: false`. Keine Datei unter `*/data` geändert,
kein Produktpfad, kein Loader, keine bestehende Engine berührt. Neu: opt-in-Modul `quant/engines/research-index-population.cjs`.
Keine Strategie- oder Signalstudie (P5/P6).

## Idee und Ergebnis in Kürze

Die 335 validierten Fondsbestands-Stichtage aus INDEXPOP liefern je Mitglied Stückzahl und Wert, also einen Preis (Wert/Stück)
zum Stichtag. Daraus entsteht eine Renditepopulation, **die für die Mitglieder selbst keine unserer Kursreihen braucht** und
deshalb auch ausgeschiedene Titel enthält: Identität über aufeinanderfolgende Stichtage verketten, Splits allein aus den
Stückzahlen erkennen, Periodenrendite je Mitglied bilden, Austritte mit Folgeschicksal und Schranken führen und die gewichtete
Summe gegen die Kursrendite des Fonds prüfen.

| Population (Regeln 1.1.0) | Perioden | qualifiziert | qualifizierte Spanne (≥ 90 %, nie zwei Ausfälle in Folge) |
|---|---:|---:|---|
| **PIT_SP500** (SPY) 2004-09 … 2026-06 | 52 | 44 | **2009-09-30 … 2026-06-30** (47 Perioden, 44 qualifiziert) |
| **PIT_R1000** (IWB) 2005-12 … 2026-06 | 54 | 54 (27 extern, 27 nur intern) | **2005-12-31 … 2026-06-30**; extern geprüft erst ab 2019-09 |
| PIT_SP500_EARLY 1995-12 … 2004-09 | 9 | 0 | – |
| PIT_R2000 (IWM) | 54 | 26 | – (22 Perioden Abdeckung < 97 %) |
| PIT_R3000 (IWV) | 54 | 54 (27 nur intern) | 2005-12-31 … 2026-06-30; extern (Näherung) erst ab 2019-09 |
| PIT_NDX (QQQ) | 42 | 30 | 2016-09-30 … 2026-06-30 |
| PIT_DJIA (DIA) | 64 | – | nicht anwendbar (preisgewichtet, s. u.) |

Beleg: `summary-1.1.0.json`, `periods-1.1.0.json` (jede Periode mit allen Kennzahlen), Daten `population-1.1.0.json.gz`
(sha256 in `manifest-1.1.0.json`).

**S&P 500 ab 2009-09:** Gewicht mit beobachteter oder geschätzter Rendite im Mittel 98,9 % (2010–2019H1, halbjährlich) bzw.
99,86 % (ab 2019-09, quartalsweise); Schranken-Anteil 1,06 % bzw. 0,14 %; Fehler gegen die SPY-Kursrendite Median 0,24 / max.
1,25 PP (halbjährlich) bzw. Median 0,06 / max. 0,25 PP (quartalsweise). Die drei Ausfälle der Spanne sind erklärbar und
bleiben ausgewiesen: 2012-09→2013-03 (−0,97 PP; Abbott/AbbVie- und Kraft/Mondelez-Abspaltung), 2014-03→2014-09 (−1,25 PP;
Google-Class-C-Ausschüttung), 2015-03→2015-09 (Schranken 3,36 %). **Vor 2009 qualifiziert keine S&P-Periode** (jährliche
Stichtage, Schranken 3–13 %, Fehler bis −12,8 PP 1999): ausgeschiedene Titel ohne Folgepreis.

**Russell 1000:** ab 2019-09 alle 27 Quartale extern geprüft (Näherung, s. u.; Fehler Median 0,06 / max. 0,24 PP). 2005–2019
halbjährlich nur **intern** qualifiziert (keine IWB-Kursreihe im Repository): Übereinstimmung der Mitgliederrenditen mit der
unabhängig verketteten IWV-Kette derselben Titel und Stichtage 99,98 % des gemeinsamen Gewichts (|ΔR| ≤ 0,1 PP). Das prüft
Identität und Split-Erkennung (andere Stückzahlen, anderer Fondsfluss), nicht aber den Preis (gleiches Dokument, gleiche
Bewertung).

## Verfahren (verbindlich: `rules-1.1.0.json`)

1. **Identitätskette** je Fonds zwischen aufeinanderfolgenden Stichtagen: C1 CUSIP/ISIN (N-PORT), C2 normalisierter Name +
   Aktienklasse (eindeutig; doppelte Namen nach Preisnähe), C3 CIK (INDEXPOP-Zuordnung), C4 Token-Jaccard ≥ 0,6 gegenseitig
   eindeutig und preis-/stückplausibel. 1.1.0 gesamt: C1 166.118, C2 168.081 (+35 Dubletten), C3 2.039, C4 341 Verknüpfungen;
   15.806 Austritte, 15.444 Eintritte, **538 mögliche Identitätsbrüche** (Austritt und Eintritt derselben Periode mit
   gleicher CIK oder Jaccard ≥ 0,5, nicht verknüpft; gezählt, nicht verknüpft).
2. **Split-Erkennung ohne externe Daten:** q = (Stück₁/Stück₀) / Median aller Stückverhältnisse (Fondsfluss). Auslöser
   |log q| ≥ log 1,15; nächstes registriertes Verhältnis (2, 3, 3/2, 5/2, …, 1/10, …) innerhalb |log q − log s| ≤ 0,15;
   Entscheidung über den Kursrest gegen die vorläufige Indexrendite: SPLIT, wenn |e_split| + 0,10 ≤ |e_none|; SHARE_CHANGE
   (Float/Indexgewicht, Emission, Fusion) im umgekehrten Fall; sonst **AMBIGUOUS_CA** (keine Punktrendite, Schranken aus beiden
   Hypothesen). 1.1.0: NONE 310.458, SHARE_CHANGE 21.178, SPLIT 3.526, AMBIGUOUS_CA 1.452.
3. **Periodenrendite** R = s · p₁/p₀ − 1 (Kursrendite), Gewicht w₀ = Wert₀/Σ Wert₀. Status (`validation-1.1.0.json` → `totals`):
   OBS_CHAIN 335.162 · OBS_CROSSFUND 2.067 (derselbe Titel ist in einem anderen Fonds über exakt dieselben Stichtage verkettet,
   v. a. IWB↔IWM-Wechsler über IWV) · OBS_SERIES 2.648 (Austritt, unsere Wochenreihe deckt t₁) · EST_CASH 4 (Barabfindung aus
   dem V10-Lifecycle-Register) · EST_SERIES_END 30 (Reihe endet in der Periode, Übernahme belegt) · BOUNDED_EXIT 11.032
   (Punkt 0 %, Untergrenze −100 %, keine Obergrenze; Folgeschicksal aus INDEXPOP `exits-1.2.0`) ·
   BOUNDED_EXIT_SERIES_DELISTED 25 · BOUNDED_AMBIGUOUS_CA 1.452.
   Schranken-Anteil je Periode: `periods-1.1.0.json` → `boundedW`, `boundedByFate`, `rLow` (alle Schranken an der
   Untergrenze) und `impliedBoundedMean` (Diagnose: welche mittlere Rendite die Schranken-Fälle haben müssten, damit der Fonds
   getroffen wird).
4. **Konsistenz:** Σ w₀·R gegen die Fonds-Kursrendite derselben Stichtage (`quant/data/market/multi-asset/series/{SPY,QQQ,IWM}.json`;
   beide Seiten ohne Dividenden). Toleranz 0,5 PP · √(Monate/3). IWB/IWV haben keine Kursreihe: im N-PORT-Zeitraum Näherung
   = N-PORT-Monats-Gesamtrendite des Fonds minus SPY-Dividendenlücke desselben Quartals (Toleranz +0,25 PP); davor nur intern.
   Zusätzlich je N-PORT-Quartal `trMinusPointPp` (N-PORT-Gesamtrendite − Kursrendite der Mitglieder; SPY Median 0,38 PP,
   0,28–0,62 PP = plausible Quartalsdividende).
5. **Qualifikation je Periode:** beobachtet+geschätzt ≥ 97 %, Schranken ≤ 3 %, |Fehler| ≤ Toleranz (extern/Näherung) oder,
   ohne Referenz, interne Übereinstimmung ≥ 99 %.

## Validierung (`validation-1.1.0.json`)

- **Gegen unsere Split-Faktoren** (`return-series.js#splitFactors`, ADR-002; 230.216 Verknüpfungen, deren beide Schlüssel
  derselben securityId zugeordnet sind): übereinstimmend 226.296 (98,30 %); Anbieter-Faktor ohne Split-Form (Abspaltungen wie GE
  1,253/1,281, AT&T 1,324, Pfizer 1,054 – von uns richtig als kein Split behandelt) 480; abweichend oder mehrdeutig 1.643 (dazu
  21 Nicht-Split-Faktoren, die wir als Split oder mehrdeutig lesen). Nach
  Periodenlänge: **Quartal 0,45 % der Paare / 0,12 % des Gewichts**, Halbjahr 0,98 % / 0,49 %, länger 2,9 % / 2,85 %.
  Die größten Fälle (`cases`, 150 von 1.664) sind Russell-2000-Emissionen um 50 % (als 3/2 gelesen), Fusionen mit
  Stückzahlsprung zum Split (BAC/Fleet 2004) und jährliche Perioden mit starkem Kurs (Microsoft 1997/98: 2:1 als
  SHARE_CHANGE). Für 1.1.0 ist diese Prüfung **in-sample** (s. Regeländerung).
- **Gegen unsere Wochenreihen** (dieselben Paare, beide Stichtage sind Wochenbars, n = 9.677): Median 0, p99 0,03 PP,
  0,32 % > 1 PP. Mit Wochenversatz (n = 227.748): Median 1,26 PP – nur Datumsversatz der Wochenreihe.
- **Fondsübergreifend** (gleicher Titel, gleiche Stichtage, unabhängige Stückzahlen): IWB↔IWV 99,98 % (Berichte) / 99,99 %
  (N-PORT) des gemeinsamen Gewichts mit |ΔR| ≤ 0,1 PP; IWM↔IWV 99,45 / 99,77 %; SPY↔iShares/QQQ (N-PORT) 99,99 %.
- **Python-Gegenprüfung** (`python-check-1.1.0.json`, `python3 -I verify_spxpop.py`): eigener Parser der Rohdokumente, eigene
  Kette (nur CUSIP/Name), eigene Umsetzung der Split-Regel, eigene Fondsreferenz; Vergleich je Mitglied mit dem JS-Detail und
  je Periode; dazu eine alternative Entscheidungsmethode (kombinierter Fehler über s ∈ {1} ∪ Verhältnisse) als Sensitivität.
  Kennzahlen: siehe Abschnitt „Python-Gegenprüfung (Ergebnis)“.

## Python-Gegenprüfung (Ergebnis, `python-check-1.1.0.json`)

SPY, IWB, QQQ, IWM aus den Rohdokumenten neu geparst (Laufzeit 7 min 22 s). Mitgliederebene (gleicher Fonds, Stichtag, Name
bzw. eindeutiges Gewicht): 173.564 Verknüpfungen verglichen, **Split-Klasse gleich 99,98 %** (173.523), Rendite gleich
(≤ 1e-6) 173.533, ≤ 0,1 PP 173.537; 27 Abweichungen (Python verknüpft wenige Namen, die JS als Austritt führt – z. B.
McCormick „NVS“, HCA mit Fußnotenbuchstaben; und umgekehrt einzelne SPLIT/AMBIGUOUS-Grenzfälle wegen anderer Kettenbasis),
867 Python-Verknüpfungen ohne JS-Gegenstück. Periodenebene: Python-Fehler gegen SPY (nur eigene Kette, Austritte 0 %) ab
2019-09 Median 0,05 / max. 0,24 PP – wie JS. Alternative Entscheidungsmethode (Sensitivität): anderer Split-Faktor bei
0,65 % des Gewichts, mehrdeutig 2.512 statt 725 Paare – die Regelentscheidung ist für den Großteil robust, an den
Grenzfällen nicht.

## Regeländerungen (offen gelegt)

- **1.0.0** vor jedem Ergebnis eingefroren (Commit e23e4d0ad0), **1.0.1** Umsetzungsklärungen vor jedem Ergebnis (32a69ff81c).
- **1.1.0 nach Sicht auf die 1.0.1-Ergebnisse** (`rules-1.1.0.json` → `amendments`): Verhältnistoleranz 0,05 → 0,15;
  Verhältnisse 5/4, 4/3, 3/4, 4/5, 2/3 gestrichen; 25, 30, 40, 50 ergänzt; DIA für nicht anwendbar erklärt. Befunde: echte
  Splits liegen wegen gleichzeitiger Index-Stückzahl-Anpassungen > 5 % neben dem Verhältnis (Tesla 3:1 2022 q = 3,18,
  Broadcom 10:1 2024 q = 10,70, Nike/Omnicom/Yum 2006 q = 1,81–1,90); Verhältnisse zwischen 2/3 und 3/2 entstehen durch
  Nasdaq-100-Kappung und Emissionen; Booking 25:1 (2026) fehlte im Satz (Fund in einem ersten, nicht veröffentlichten
  1.1.0-Lauf); DIA hält jedes Mitglied mit gleicher Stückzahl, ein Split ist dort unsichtbar (3M, Visa, Apple: q = 1).
  Beide Ergebnisstände liegen vor (`periods/validation/summary-1.0.1.json`, `-1.1.0.json`). Wirkung: S&P-500-Spanne ab
  2013-03 (1.0.1) → ab 2009-09 (1.1.0); Split-Abweichungen/Mehrdeutigkeiten gegen den Anbieter 3.697 → 1.664 (gleiche Zählweise).
- **Fehlerkorrektur vor Veröffentlichung (keine Regeländerung):** fondsübergreifende Suche nahm bei Zweiklassen-Emittenten
  (gleiche CIK, z. B. GOOGL/GOOG) den ersten Treffer; jetzt Name+Klasse vor CIK und CIK nur bei eindeutigem Treffer je Fonds.
  Betrifft vor allem die interne Übereinstimmung (Russell 1000 2016–2019 von 98,4–98,9 % auf ≥ 99 %). Ebenso: 203 Namen
  aus INDEXPOP-Berichten tragen Seitenkopf-Reste („(Percentages shown are based on Net Assets) Biotechnology (continued)
  Amgen Inc.“); sie werden für die Identitätskette bereinigt (vorher u. a. Amgen, Fiserv, S&P Global in IWB 2018 als
  Austritt mit Schranke). Die 1.0.1-Dateien enthalten beide Fehler noch.
- Zeilen mit Wert 0 (Treuhandreste, z. B. „TeleCorp PCS Escrow“, 20 Zeilen) haben kein Gewicht und werden nicht geführt.

## Research-Modul

```js
const IP = require('quant/engines/research-index-population.cjs');
const pop = IP.createIndexPopulation({ optIn: true });            // ohne optIn: Fehler; Daten-sha256 gegen Manifest
pop.periods('PIT_SP500');                                          // Perioden mit Qualifikation und Kennzahlen
pop.members('PIT_SP500', '2019-09-30');                            // nur QUALIFIED/QUALIFIED_INTERNAL, sonst Fehler
// { members: [{ chainId, name, cik, securityId, weight, status, group, tier, splitClass, splitFactor, fate,
//               return, observedOrEstimatedReturn, lower, upper }] }
IP.createIndexPopulation({ optIn: true, allowUnqualified: true, boundedAs: 'LOWER' });  // Szenario für Schranken-Fälle
```

Schranken-Fälle haben ohne `boundedAs` keine Rendite (`return: null`). Mitgliederspalten sind für SPY, IWB, IWM und QQQ
veröffentlicht; IWV (≈ IWB ∪ IWM) nur als Periodenübersicht (Größenbudget), DIA gar nicht. `chainId` verbindet dieselbe
Position über die Perioden eines Fonds. Fundamentaldaten nur über `cik` (Gewicht mit CIK: S&P 500 96,6 %, Russell 1000
96,2 %) zum korrigierten PIT-Panel (`research-pit-market-cap.cjs`); `securityId` (91,3 % / 89,2 %) nur aus INDEXPOP T1/T2.

## Grenzen

- **Frequenz grob:** jährlich (S&P 2004–2009), halbjährlich, quartalsweise ab 2019-09. Keine Wochen- oder Monatsstudie mit
  dieser Population allein; eine Studie muss das SEC-Einreichungsdatum (≈ 60 Tage nach Stichtag) als Verfügbarkeit beachten.
- **Kursrendite:** Dividenden fehlen auf beiden Seiten. Abspaltungen werden nicht modelliert (Verlust beim Mutterunternehmen,
  Abspaltung tritt bei t₁ ein) – sichtbar als Konsistenzfehler.
- Russell 1000 vor 2019 ohne externe Referenz; Russell 2000 erreicht die Abdeckung (Schranken ≤ 3 %) erst ab 2019 regelmäßig.
- Die Split-Erkennung bleibt bei jährlichen Perioden unsicher (2,9 % der Paare); Fusionen, bei denen der Käufer den Namen des
  Ziels übernimmt (Norwest/Wells Fargo 1998), können als Split erscheinen. Benachbarte Verhältnisse überlappen bei 0,15
  Toleranz: **Apple 7:1 (Juni 2014) wird in IWB und IWV als 6:1 gelesen** (q = 6,43; Rendite der Position um ein Siebtel zu
  niedrig, ≈ −0,4 PP Indexfehler in der intern qualifizierten Periode 2013-12→2014-06). Die interne Prüfung kann einen
  solchen Fehler nicht sehen, weil beide Fonds denselben Kurs und fast dasselbe q haben; SPY (2014-03→2014-09) liest 7:1.
- Austritte vor 2009 ohne Folgepreis: der Großteil der Schranken (S&P 2004–2009: 5,6 % Gewicht je Periode) hätte nur mit
  Kursdaten delisteter Titel geschlossen werden können (Freigabevorlage aus INDEXPOP unverändert offen).

## Reproduktion

```bash
P=<scratchpad>/v12-private
node --max-old-space-size=6000 scripts/quant/v12/spxpop/build-population.cjs --private $P/indexpop --work $P/spxpop --out-dir docs/quant-recovery/v12/spxpop   # ~40 s
python3 -I scripts/quant/v12/spxpop/verify_spxpop.py <repo> $P/indexpop $P/spxpop 1.1.0 docs/quant-recovery/v12/spxpop/python-check-1.1.0.json SPY,IWB,QQQ,IWM
node --test quant/tests/v12-spxpop.test.mjs
```

Eingaben: INDEXPOP-Privatdaten (`snapshots.json`, `mapping-1.2.0.json`, `fates-1.2.0.json`, HTTP-Cache der Rohdokumente);
Hashes in `manifest-1.1.0.json`. **SEC-Abrufe dieses Strangs: 0** (alles aus dem INDEXPOP-Cache).
