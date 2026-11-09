# Quant V13 – Studien mit delisteten Reihen (S1, S2, S3)

Ausführung der vorab registrierten Studie
[`../delisted/study-registration-1.0.0.json`](../delisted/study-registration-1.0.0.json)
(SHA-256 `d12c1ec0…937f`) auf den qualifizierten delisteten Reihen aus
[`../delisted/register-1.0.0.json`](../delisted/register-1.0.0.json) (1.675 QUALIFIED, 151 PRICE_ONLY).

**Evidenzart:** `HISTORICAL_DEVELOPMENT_STUDY` auf bereits untersuchter Historie (V7–V10 kannten die Regeln auf dem
Überlebenden-Frame). `NOT_CERTIFIED`, `productionApproved: false`. Keine Alpha-Aussage, keine neue Regel, kein neuer
Parameter, keine Suche.

## Abweichung und Operationalisierung (vor jeder Auswertung festgelegt)

[`study-amendment-1.0.1.json`](study-amendment-1.0.1.json) (SHA-256 in `study-amendment-1.0.1.sha256`) wurde
committet, **bevor** irgendein Ergebnis berechnet war. Gesehen waren nur Frame-Zählungen.

- **D1 – zusätzliche Sensitivität F1w.** Die registrierte Frame-Regel (jedes Wochenlabel muss dem Modal-Label von F0
  entsprechen) lässt nur **390 von 1.675** QUALIFIED-Reihen zu. 1.188 scheitern ausschließlich am letzten Balken,
  1.186 davon, weil der letzte Handelstag vor dem Modal-Tag (meist Freitag) der Woche liegt. Das ist mechanisch und hängt
  mit dem Delisting selbst zusammen. F1 bleibt der registrierte Hauptvergleich; F1w (letzter Balken auf das
  Modal-Datum seiner Woche umbenannt, Kurs unverändert, nichts fortgeschrieben) wird daneben als
  `AMENDMENT_1.0.1_SENSITIVITY` gezeigt.
- **O1–O8:** Terminal-Szenarien im letzten gehaltenen Balken, für F0 und F1 gleich (F0-eigene beendete Listings bleiben
  bei 0 %), Basisrate mit denselben Terminalbeobachtungen, SPY bis zum erwarteten Ausstiegsdatum, Inferenz für S0,
  S2-Definitionen (V11), S3-Zuordnung (Regel aus coverage-1.0.0), Total Return nur für die delistete Teilmenge,
  CA_UNRESOLVED nur gezählt.

## Populationen

| Frame | Rolle | Listings | delistete Reihen | davon MERGER / DISTRESS / UNKNOWN |
|---|---|---:|---:|---|
| F0 | V10-Lifecycle-Frame (Basis) | 4.329 | – | – |
| **F1** | **registriert (Hauptvergleich)** | **4.719** | **+390** | 233 / 19 / 138 |
| F1c | registriert, Sensitivität inkl. PRICE_ONLY | 4.758 | +429 | 236 / 21 / 172 |
| F1w | Nachtrag 1.0.1, Sensitivität | 5.905 | +1.576 (1.186 umbenannt) | 1.069 / 54 / 453 |

F0 reproduziert die committete V10-Lifecycle-Studie exakt (60/60 Zellen gleiche Fallzahl, maximale Abweichung des
Schätzers 0, gleiche Holm-Entscheidungen). Die QUALIFIED-Reihen enden fast alle **ab 2010** (Endjahr-Buckets:
2005–09: 12, 2010–14: 141, 2015–19: 586, 2020–24: 750, 2025+: 186), weil das Ende nur mit einem SEC-Delisting-Beleg
(25-NSE/15-12B, elektronisch erst ab Mitte der 2000er) als QUALIFIED gilt. **Delistings 2000–2009 bleiben damit
weitgehend unbeobachtet.**

## S1 – V10-Signalstudie (unveränderter Code)

Netto (10 + 5 Bp je Seite), Pp. = Prozentpunkte der mittleren Ereignisrendite. „V10“ = Engine-Semantik (zensierte
Ausgänge fallen weg, registriertes S1-Ergebnis). „S0“ = Terminalwert = letzter Handelskurs (registrierter Punktschätzer
der Zerlegung). Band = Terminal-Szenarien (MERGER −10/+10 %, DISTRESS/UNKNOWN −30/−100 %).
Quelle: [`s1-signal-1.0.0.json`](s1-signal-1.0.0.json) (`cells[]`).

### Überrendite gegen SPY (gleiche Daten, Preisrendite)

| Regel | h | F0 | F1 (V10) | F1 (S0) | F1w (S0) | F1w-Band | p F0 → p F1 (S0) |
|---|---:|---:|---:|---:|---:|---|---|
| MOMENTUM_IMPROVED | 13 | +0,48 | +0,52 | +0,52 | +0,60 | +0,53 … +0,60 | 0,536 → 0,496 |
| MOMENTUM_DETERIORATED | 13 | +0,64 | +0,64 | +0,64 | +0,64 | +0,57 … +0,64 | 0,340 → 0,325 |
| TREND_UP | 13 | +0,20 | +0,25 | +0,25 | +0,28 | +0,21 … +0,28 | 0,788 → 0,743 |
| TREND_DOWN | 13 | +0,02 | +0,07 | +0,07 | +0,09 | +0,03 … +0,09 | 0,964 → 0,904 |
| NEW_52W_HIGH | 13 | +1,07 | +1,14 | +1,14 | +1,25 | +1,10 … +1,25 | 0,111 → 0,092 |
| MOMENTUM_IMPROVED | 52 | +3,79 | +3,87 | +3,89 | +4,12 | +3,77 … +4,12 | 0,215 → 0,205 |
| MOMENTUM_DETERIORATED | 52 | +3,39 | +3,38 | +3,40 | +3,52 | +3,22 … +3,52 | 0,209 → 0,201 |
| TREND_UP | 52 | +3,53 | +3,61 | +3,63 | +3,79 | +3,47 … +3,79 | 0,238 → 0,222 |
| TREND_DOWN | 52 | +2,22 | +2,24 | +2,28 | +2,40 | +2,13 … +2,40 | 0,396 → 0,366 |
| NEW_52W_HIGH | 52 | +3,39 | +3,55 | +3,52 | +3,65 | +2,98 … +3,65 | 0,174 → 0,159 |

### Selektion: Ereignis minus Basisrate derselben Woche und Population

| Regel | h | F0 | F1 (S0) | F1w (S0) | F1w-Band |
|---|---:|---:|---:|---:|---|
| MOMENTUM_IMPROVED | 13 | −0,32 | −0,32 | −0,31 | −0,31 … −0,23 |
| TREND_UP | 13 | −0,63 | −0,62 | −0,67 | −0,67 … −0,59 |
| TREND_DOWN | 13 | −0,41 | −0,38 | −0,38 | −0,38 … −0,31 |
| NEW_52W_HIGH | 13 | +0,51 | +0,56 | +0,62 | +0,57 … +0,62 |
| MOMENTUM_DETERIORATED | 52 | −1,26 | −1,31 | −1,36 | −1,36 … −1,19 |
| TREND_DOWN | 52 | −2,07 | −2,06 | −2,09 | −2,09 … −1,88 |
| NEW_52W_HIGH | 52 | +0,50 | +0,59 | +0,58 | +0,29 … +0,58 |

Basisrate (netto, gepoolt) h 52: F0 13,83 %, F1 13,78 %, F1w 13,74 %, F1c 13,77 %.

**Mehrfachtest (Holm über 60 Zellen je Frame):** F0 7 Ablehnungen, F1 7, F1c 7, F1w 9 – in V10-Semantik und in S0
gleich. Die Ablehnungen betreffen RAW_NET (absolute Rendite, Markt eingeschlossen) und – in F0, F1w – die negative
Basisraten-Differenz von TREND_UP; **keine einzige SPY_EXCESS-Zelle wird abgelehnt, in keinem Frame.** Zwischen F0 und F1 tauschen zwei Grenzzellen
(TREND_UP h 13 BASE_RATE_EXCESS fällt heraus, NEW_52W_HIGH h 13 RAW_NET kommt hinzu); bei 1.999 Bootstrap-Replikaten
und 60 Tests liegen beide an der Auflösungsgrenze.

### Zerlegung (registriert)

| Baustein | Befund (Belegdatei) |
|---|---|
| Survivorship/Population (F1 − F0, S0) | SPY-Überrendite der 20 Zellen: −0,01 … +0,14 Pp. (F1c −0,01 … +0,13; F1w 0,00 … +0,33); Selektion gegen Basisrate −0,05 … +0,09 Pp. (F1w −0,11 … +0,15); gepoolte Basisrate h 52 (V10-Semantik) −0,05 Pp. (F1w −0,09). Klein; gegen SPY eher leicht positiv, weil die zugefügten Reihen überwiegend Übernahmen sind. (`cells[].delta`) |
| Delisting-Terminalwerte | Bandbreite je Zelle F1: Median 0,05, max. 0,26 Pp.; F1w: Median 0,13, max. 0,66 Pp. (NEW_52W_HIGH h 52 SPY: +2,98 … +3,65). S0 ≈ V10, weil nur wenige Ereignisse über das Reihenende reichen (F1 h 52: 296–373 von ~66.000). (`terminalBand`, `nTerminal`) |
| Total Return (nur delistete Teilmenge) | Gleiche Ereignisse, adjClose statt Preis: +0,4 Pp. (h 13) bzw. +1,6 … +1,8 Pp. (h 52) Dividendenanteil. F0 und SPY bleiben Preisrendite (Vergleich Preis gegen Preis). (`totalReturnDelistedSubset`) |
| Kosten brutto gegen netto | 10 + 5 Bp je Seite kosten rund 0,3 Pp. je Ereignis (h 13: z. B. NEW_52W_HIGH brutto +3,43 / netto +3,12 % in F1 S0). (`v10.gross`, `terminalS0.gross`) |
| Gewichtung | S1/S2 gleichgewichtet; kapitalgewichtet nur in S3 (CW_ALL). |
| Selektion gegen Basisrate | siehe Tabelle; Vorzeichen und Größenordnung ändern sich durch die delisteten Reihen nicht. |

Gefördertes Long-only-Portfolio (Teil von signal-study.cjs, unverändert, nur beschreibend): Das V10-Universum lässt nur
Reihen zu, die bis zur letzten Strategiesitzung 2026 laufen; delistete Reihen kommen nur hinein, wenn sie erst 2026
endeten (F1: 7, F1w: 52). NEW_52W_HIGH: CAGR F0 16,4 %, F1 16,4 %, F1w 19,7 %; TREND_UP 11,1 / 11,7 / 12,1 %. Die
Sprünge stammen aus wenigen spät beendeten (meist übernommenen) Titeln und geänderten Hash-Losentscheiden bei N = 10
Plätzen. Das zeigt die Empfindlichkeit dieser Konstruktion, **nicht** einen Populationseffekt
(`fundedStrategy`).

## S2 – Gleichgewichtete Population gegen SPY

Quelle: [`s2-population-1.0.0.json`](s2-population-1.0.0.json). Brutto, Preisrendite, keine Tests registriert.

### Wöchentlich rebalancierter EW-Index, CAGR (S0 / Band bis S2)

| Zeitraum | F0 | F1 | F1w | F1c | SPY |
|---|---:|---:|---:|---:|---:|
| 2000–2025 | 13,86 % | 13,82 % (… 13,65) | 13,81 % (… 13,35) | 13,81 % (… 13,59) | 6,17 % |
| 2000–2007 | 19,81 % | 19,75 % | 19,89 % | 19,75 % | 0,13 % |
| 2008–2012 | 10,67 % | 10,46 % (… 10,36) | 10,16 % (… 10,01) | 10,46 % (… 10,35) | −0,18 % |
| 2013–2019 | 12,38 % | 12,34 % (… 12,13) | 11,97 % (… 11,49) | 12,29 % (… 12,05) | 12,01 % |
| 2020–2025 | 10,68 % | 10,78 % (… 10,36) | 11,24 % (… 9,99) | 10,77 % (… 10,23) | 13,58 % |

### Buy-and-hold je Listing (V11 P_t), h 52, Mittel der Wochenmittel

| Zeitraum | F0 (V10) | F1 (V10) | F1 (S0 … S2) | F1w (S0 … S2) | SPY |
|---|---:|---:|---:|---:|---:|
| 2000–2025 | 14,85 % | 14,76 % | 14,85 … 14,70 % | 14,91 … 14,54 % | 7,87 % |
| 2013–2019 | 9,17 % | 8,98 % | 9,03 … 8,84 % | 8,67 … 8,27 % | 10,22 % |
| 2020–2025 | 15,71 % | 15,67 % | 15,99 … 15,67 % | 16,37 … 15,43 % | 15,94 % |

Delistete Teilmenge über die ganze Lebensdauer (F1, 390 Reihen): Median Preis +9,1 %, mit Dividenden +12,8 %; 20,5 %
verloren mehr als die Hälfte. Der Mittelwert (+332 %) wird von wenigen Ausreißern getragen und ist nicht aussagekräftig.

## S3 – PIT-S&P-500 (V12 REQUAL P5a) mit beobachteten Ausstiegen

Quelle: [`s3-spx-exits-1.0.0.json`](s3-spx-exits-1.0.0.json). Der V12-Code reproduziert sein committetes Ergebnis
exakt (`basedOn.committedResultReproduced: true`). Im P5a-Zeitraum 2009-09 … 2026-06 gibt es 165 begrenzte Ausstiege
mit CIK; **38 werden durch eine QUALIFIED-Reihe ersetzt** (coverage-1.0.0 zählt 39 über alle SPY-Perioden ab 1995;
die 39. liegt 2008, vor dem P5a-Zeitraum). 34 davon sind MERGER, 4 UNKNOWN; mittlere beobachtete Rendite +4,9 % statt
0 % (ZERO), im Mittel −1,3 % (FATE) bzw. −100 % (LOWER). Ein Unternehmen erscheint in derselben Periode zweimal
(zwei Index-Zeilen, gleiche Reihe).

| P5a-Szenario | EW_ALL vorher → nachher (S0) | CW_ALL vorher → nachher | Survivorship-Term (EW_WITH_H − EW_ALL) | SPY |
|---|---|---|---|---:|
| ZERO | 10,57 → 10,60 % | 11,97 → 11,98 % | 0,71 → 0,69 Pp. | 12,39 % |
| FATE (Punktschätzer V12) | 10,52 → 10,55 % | 11,91 → 11,92 % | 0,76 → 0,73 Pp. (Band 0,72 … 0,79) | 12,39 % |
| LOWER (obere Schranke des Terms) | 7,26 → 7,76 % | 10,43 → 10,65 % | 3,98 → 3,48 Pp. | 12,39 % |
| UPPER | 10,90 → 10,88 % | 12,12 → 12,12 % | 0,42 → 0,43 Pp. | 12,39 % |

## Bekannte Grenze: 209 CA_UNRESOLVED-Reihen

Ausgeschlossen, weil ein splitgroßer Tagessprung ohne passenden Split-Faktor vorkommt. Gezählt (keine Renditen, keine
neue Regel; [`ca-unresolved-counts-1.0.0.json`](ca-unresolved-counts-1.0.0.json)): bei **106** fällt der Kurs um einen
splitgroßen Faktor (73× auf ~1/2), bei 103 steigt er. Von den 106 Fällen endet die Reihe bei **28 innerhalb eines
Jahres** nach dem Sprung (15 innerhalb von 30 Tagen, 6 am letzten Handelstag selbst). Diese 28 sind Kandidaten für
echte Abstürze kurz vor dem Delisting, die F1 fehlen – eine Neigung zugunsten der Überlebenden, deren Größe hier nicht
beziffert wird. Zum Vergleich: F1 enthält 19 DISTRESS-Reihen.

## Einordnung in einfachen Worten

- Die bisher fehlenden delisteten Aktien verändern die Ergebnisse der fünf V10-Regeln **kaum**. Die mittleren
  Überrenditen gegen SPY verschieben sich um wenige Hundertstel bis wenige Zehntel Prozentpunkte, eher leicht nach oben,
  weil die zugefügten Reihen überwiegend Übernahmen (mit Prämie) sind. Kein Test gegen SPY wird signifikant, vorher
  nicht und nachher nicht.
- Das liegt **auch daran, was die Daten abdecken**: qualifizierte Delistings beginnen praktisch erst 2010; die registrierte
  Frame-Regel lässt nur ein Viertel der Reihen zu; 209 Reihen mit unklaren Sprüngen fehlen; Übernahmeprämien und
  Insolvenzverluste nach dem letzten Kurs sind nur als Szenarien angesetzt. „Kaum Wirkung“ heißt deshalb nicht
  „Survivorship spielt keine Rolle“, sondern: in dem Teil, den wir jetzt messen können, ist sie klein.
- Die hohe gleichgewichtete Populationsrendite gegenüber SPY (2000–2007 fast 20 % p. a. gegen 0 %) bleibt auch mit
  delisteten Reihen bestehen; sie ist zum großen Teil ein Gleichgewichtungs-, Größen- und Rebalancing-Effekt (V11), kein
  Verdienst einer Regel. Im S&P 500 verkleinern die beobachteten Ausstiege die Survivorship-Lücke leicht, weil die
  ersetzten Ausstiege fast alle Übernahmen waren.
- Daraus folgt **keine** Aussage, dass eine Regel Mehrwert liefert, und ebenso **keine** Verallgemeinerung, dass
  regelbasierte Strategien keinen Mehrwert liefern können. Es ist eine Entwicklungsstudie auf bereits gesehener Historie.

## Reproduktion

```bash
# Frames (Privatordner außerhalb des Repos; Ereignisdateien enthalten aus Anbieterdaten abgeleitete Renditen)
for f in F0 F1 F1w F1c; do node --max-old-space-size=8192 scripts/quant/v13/studies/run-frame.cjs --frame $f --private <priv>; done
node scripts/quant/v13/studies/export-f0-manifest.cjs --private <priv>
node scripts/quant/v13/studies/assemble.cjs --private <priv>            # -> s1-signal-1.0.0.json, s2-population-1.0.0.json
node scripts/quant/v13/studies/run-s3.cjs --private <priv>              # -> s3-spx-exits-1.0.0.json
python3 -I scripts/quant/v13/studies/ca_unresolved_count.py --root . --private <v13-private> --listref <v12-private/listref> --out docs/quant-recovery/v13/studies/ca-unresolved-counts-1.0.0.json
python3 -I scripts/quant/v13/studies/verify_v13_studies.py <priv> . <v13-private/series> <out> --frames F0,F1,F1w,F1c --pvalues F1,F1w --s3 docs/quant-recovery/v13/studies/s3-spx-exits-1.0.0.json
node --test quant/tests/v13-studies.test.mjs
```

Laufzeiten (4 Kerne, geteilt): Signalstudie je Frame 391–542 s, Terminal-/S2-Nachlauf ~90 s, S3 50 s, Python-Prüfung
461 s. Der erste F1-Lauf brach nach der Signalstufe mit zu kleinem Heap ab; der Nachlauf lief mit `--skipSignal` auf den
gespeicherten Ereignissen.

**Unabhängige Python-Prüfung** ([`python-check-1.0.0.json`](python-check-1.0.0.json)): 20.717 Prüfungen, 0 Fehler
(Reihen-Hashes gegen das Register, Frame-Regel inkl. Umbenennung, alle S1-Zellen beider Varianten in allen Frames,
240 p-Werte und Holm für F1/F1w, S2 vollständig, S3-Ersetzungen). Die V13-Teile sind neu geschrieben; Signalregeln,
Ausgangsstatus und Bootstrap stammen aus der unabhängigen V10-Python-Referenz.

## Offene Punkte

1. Delistings vor 2010 (Dotcom-Crash, 2008) sind kaum abgedeckt; dafür bräuchte es Reihen mit anderem Endbeleg.
2. Die 28 CA_UNRESOLVED-Fälle mit Kurssturz kurz vor dem Ende müssten einzeln belegt werden (Split oder Absturz).
3. Übernahme-Gegenleistungen der MERGER-Reihen sind nicht verifiziert (nur ±10 %-Band).
4. Ob die registrierte Frame-Regel für delistete Reihen künftig durch die F1w-Variante ersetzt wird, ist eine
   Methodenentscheidung für eine neue Registrierung – hier nur als Sensitivität gezeigt.
