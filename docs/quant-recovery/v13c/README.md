# Quant V13c – Erweiterungsstudie: 13 neue delistete Reihen und S&P-Endwerte vor 2010

Stand 29.10.2026, Owner-Freigabe vom selben Tag. Evidenzart `HISTORICAL_DEVELOPMENT_STUDY`,
**nicht konfirmatorisch** (`NON_CONFIRMATORY_EXTENSION_STUDY`), `NOT_CERTIFIED`, `productionApproved: false`.
Keine Datei unter `*/data`, kein Produktpfad, kein Workflow, kein Zertifizierungsvertrag geändert. Alle V10–V13b-Dateien
bleiben unverändert und werden hier nur zitiert:
[`../v13/studies/s1-signal-1.0.0.json`](../v13/studies/s1-signal-1.0.0.json) (`3f04bab7…`),
[`../v13/studies/s2-population-1.0.0.json`](../v13/studies/s2-population-1.0.0.json) (`38efcd10…`),
[`../v13/studies/s3-spx-exits-1.0.0.json`](../v13/studies/s3-spx-exits-1.0.0.json) (`8bf9a85a…`),
[`../v13b/f1w/results-2.0.0.json`](../v13b/f1w/results-2.0.0.json) (`b6999a87…`).

## Registrierung und Nachträge (jeweils eigener Commit, vor der Auswertung)

- [`study-registration-3.0.0.json`](study-registration-3.0.0.json) (SHA-256 `bbe15b19…`): Populationen, Ausgaben,
  sechs Holm-Familien, Zerlegung, Reproduktionsprüfungen R1–R3. Vorwissen offengelegt (alle V13/V13b-Ergebnisse waren
  bekannt, ebenso Art und Endklassen der 13 Ketten und die 29 Endwerte).
- [`study-amendment-3.0.1.json`](study-amendment-3.0.1.json): Der erste Lauf stoppte in R2 (vor jedem Ergebnis), weil
  `quant/data` auf `main` seit V13 durch die täglichen Datenläufe gedriftet ist (F0 4.327 statt 4.329 Listings: ref_NUWE,
  ref_SCAG; SPY.json geändert). Deshalb laufen alle Frame-Rechnungen auf dem Datenstand der V13/V13b-Läufe
  (Baum `963779a1…`, Commit `885f5574cc`), nur im Arbeitsverzeichnis wiederhergestellt, nie committet. Gesehen waren
  dabei nur die Zugangszahlen 395 (F1') und 1.588 (F1w').
- [`study-amendment-3.0.2.json`](study-amendment-3.0.2.json): Der F1w'-Lauf wurde beim Parallelbetrieb von der
  Speichergrenze des Containers beendet (keine Ausgabe) und allein unverändert wiederholt.

## Was neu ist

- **Loader:** `quant/engines/research-delisted-series.cjs` lädt opt-in Register 1.1.0 (`registerVersion: '1.1.0'`,
  `extraDirs`), gebunden an dessen SHA-256 `19e108e7…`, fail-closed (Hash, Basisregister, Kontrollen, Datei in genau einem
  Verzeichnis). Ohne Option ist die Ausgabe **byte-identisch** zu vorher (getestet mit festen Hashes über alle 1.675 bzw.
  1.826 Reihen und ein synthetisches Beispiel).
- **S1/S2:** unveränderter V10-Code und V13-Terminal/S2-Code auf drei Frames mit den 1.688 QUALIFIED-Reihen:

| Frame | Rolle | Listings | delistete Reihen | davon neu (von 13) | Gegenstück (zitiert) |
|---|---|---:|---:|---|---|
| **F1'** | **primär (registrierte Frame-Regel)** | 4.724 | 395 | 5 (DISTRESS 2, MERGER 2, UNKNOWN 1) | F1 (V13): 4.719 / 390 |
| F1w' | Sensitivität (letzter Balken umbenannt) | 5.917 | 1.588 | 12 (DISTRESS 7, MERGER 4, UNKNOWN 1) | F1w (V13): 5.905 / 1.576 |
| F1d' | Sensitivität (letzter Balken gestrichen) | 5.917 | 1.588 | 12 | F1d (V13b): 5.905 / 1.576 |

R2 bestanden: Mit Register 1.0.0 reproduziert derselbe Code die registrierten V13/V13b-Manifeste, und die alten Ketten
sind in jedem Frame exakt dieselben. Die Differenz zum Gegenstück ist daher allein der Effekt der neuen Reihen.

## S1 – Signalstudie: vorher (V13/V13b) gegen nachher (V13c)

Quelle: [`s1-signal-3.0.0.json`](s1-signal-3.0.0.json) (`cells[].delta`). Netto, Prozentpunkte der mittleren
Ereignisrendite, Terminal S0 (Endwert = letzter Kurs).

| Regel | h | SPY-Überrendite F1 → F1' | p (F1') | F1w → F1w' | F1d → F1d' |
|---|---:|---|---:|---|---|
| MOMENTUM_IMPROVED | 13 | +0,52 → +0,52 | 0,501 | +0,60 → +0,60 | +0,60 → +0,60 |
| NEW_52W_HIGH | 13 | +1,14 → +1,14 | 0,095 | +1,25 → +1,25 | +1,26 → +1,26 |
| MOMENTUM_IMPROVED | 52 | +3,89 → +3,87 | 0,206 | +4,12 → +4,10 | +4,13 → +4,11 |
| TREND_UP | 52 | +3,63 → +3,62 | 0,224 | +3,79 → +3,78 | +3,80 → +3,78 |
| NEW_52W_HIGH | 52 | +3,52 → +3,51 | 0,161 | +3,65 → +3,63 | +3,67 → +3,66 |

- Über alle 60 Zellen: größte Verschiebung −0,023 Pp (F1', Terminal S0) bzw. −0,028 Pp (F1w', F1d'), Median des Betrags
  0,003–0,007 Pp. Die Richtung ist fast überall leicht negativ: die neuen Reihen sind überwiegend echte Kursstürze.
- Die neuen Reihen tragen bei h 52 208 (F1') bzw. 565 (F1w', F1d') Ereignisse bei, 12 bzw. 37 davon über das
  Reihenende aufgelöst (`newChainEvents`).
- **Holm:** F1' 7/60, F1w' 9/60, F1d' 9/60 Ablehnungen in beiden Varianten – **keine einzige Entscheidung ändert sich**
  gegenüber F1/F1w/F1d; weiterhin keine SPY_EXCESS-Ablehnung.
- Basisrate h 52 (netto): F1 13,78 → F1' 13,76 %; F1w 13,74 → 13,72 %.
- Gefördertes Portfolio unverändert (die neuen Reihen enden vor 2026 und kommen nicht ins Universum).

## S2 – gleichgewichtete Population

Quelle: [`s2-population-3.0.0.json`](s2-population-3.0.0.json) (`deltaVsCounterpart`). Wöchentlich rebalancierter
EW-Index, CAGR 2000–2025: F1 13,82 → F1' 13,80 % (S0; Band bis S2 13,62 %), F1w 13,81 → 13,76 %, F1d 13,82 → 13,78 %;
größte Teilperioden-Verschiebung 2013–2019 −0,07 Pp (F1') bzw. −0,13 Pp (F1w'). Buy-and-hold h 52 2000–2025 (Terminal S0):
−0,02 bis −0,03 Pp.

## S3' – PIT-S&P 500 mit beobachteten und belegten Ausstiegen

Quelle: [`s3-spx-3.0.0.json`](s3-spx-3.0.0.json). R3 bestanden: Die Stufe „V13“ reproduziert das committete V13-S3
exakt (38 ersetzte Ausstiege, alle Aggregate gleich).

**Verwendete Endwerte:** 29 angenommene Werte in Register 1.0.0, davon First Data 2006 ausgeschlossen → **28**. Alle
anderen Zeilen (unbelegt oder mehrdeutig) bleiben begrenzt wie vorher; Regeln/Register 1.0.1 werden nicht benutzt.

**P5A (primär, registrierte Spanne 2009-09 … 2026-06):** Schritt A (Register 1.1.0) ersetzt keinen weiteren Ausstieg – keine
der 13 neuen Ketten war S&P-500-Mitglied. Schritt B: 4 der 28 Werte liegen in der Spanne (t0 2009-09-30: Black & Decker
+58,1 %, IMS Health +43,3 %, Sun Microsystems +4,5 %, Wyeth +2,7 %); begrenztes Gewicht dieser Periode 2,17 → 1,34 %.

| Szenario | EW_ALL V13 → V13c | CW_ALL V13 → V13c | Survivorship-Term (Pp) V13 → V13c |
|---|---|---|---|
| ZERO | 10,60 → 10,61 % | 11,98 → 11,99 % | 0,69 → 0,67 |
| FATE (Punktschätzer) | 10,55 → 10,58 % | 11,92 → 11,96 % | 0,73 → 0,71 |
| LOWER (obere Schranke des Terms) | 7,76 → 7,82 % | 10,65 → 10,70 % | 3,48 → 3,43 |
| UPPER | 10,88 → 10,89 % | 12,12 → 12,11 % | 0,43 → 0,43 |

SPY 12,39 % unverändert. Werte bei Delisted-Terminal-Szenario S0; S1/S2 in `P5A.aggregates`.

**EARLY (sekundär, beschreibend, 1995-12 … 2009-09, 14 Jahresperioden):** Alle 14 Perioden sind in SPXPOP
`NOT_QUALIFIED` (Abweichung gegen SPY bis −12,8 Pp 1998/99). Die Niveaus sind deshalb nicht belastbar; gelesen werden nur
die Änderungen durch die 24 Endwerte (und eine delistete Reihe, 2008). Ketten-CAGR 1995-12 … 2009-09:

| Szenario | EW_ALL vorher → nachher | CW_ALL vorher → nachher | Survivorship-Term (Pp) |
|---|---|---|---|
| ZERO | 5,41 → 5,49 % | 1,84 → 1,86 % | 1,55 → 1,47 |
| FATE | 3,94 → 4,14 % | 0,80 → 0,86 % | 3,03 → 2,82 |
| LOWER | −2,27 → −1,81 % | −2,90 → −2,78 % | 8,84 → 8,38 |
| UPPER | 6,46 → 6,50 % | 2,73 → 2,74 % | 0,90 → 0,86 |

Begrenztes Gewicht je Periode (`EARLY.periodTable`), z. B. 1996/97 5,76 → 5,58 %, 1999/2000 12,59 → 12,46 %,
2006/07 3,42 → 3,10 %.

## Einordnung in einfachen Worten

- Die 13 zusätzlich belegten delisteten Reihen – überwiegend echte Abstürze – verändern die Signalstudie und die
  Populationsrendite nur in der dritten Nachkommastelle der Prozentpunkte. Kein Testergebnis kippt. Die Aussagen von V13
  bleiben unverändert.
- Die belegten S&P-Endwerte sind fast alle Barübernahmen mit Prämie. Sie verkleinern die Survivorship-Lücke im Index
  leicht, am stärksten dort, wo vorher −100 % (LOWER) angesetzt war. In der qualifizierten Spanne ab 2009 wirken nur 4 Werte.
- Vor 2009 bleibt der Index unscharf: 14 nicht qualifizierte Perioden, 474 begrenzte Austrittszeilen ohne Kurs oder verwendbaren Beleg (473 aus V13b plus First Data).
- Daraus folgt **keine** Aussage über einen Mehrwert einer Regel und keine Zertifizierung.

## Prüfung und Laufzeiten

- **Unabhängige Python-Prüfung** ([`python-check-3.0.0.json`](python-check-3.0.0.json), `python3 -I`): **48.095 Prüfungen,
  0 Fehler**, 360 p-Werte nachgerechnet, 517 s. Umfang: Bindung aller 1.688 Reihen an Register 1.1.0, Frame-Regeln und Zugänge, alle
  S1-Zellen in beiden Varianten und allen Szenarien, p-Werte und Holm aller sechs Familien, S2, S3'-Ersetzungen A
  (P5A und EARLY), Zuordnung und Renditen der 28 Endwerte, Periodendeltas von EW_ALL/CW_ALL (ZERO, LOWER) aus der
  SPXPOP-Datei neu berechnet.
- Laufzeiten (4 Kerne, geteilt): F1' 1.084 s (Signalstufe 947 s, parallel), F1d' 871 s (parallel), F1w' 652 s (allein),
  S3' 62 s, Python-Prüfung 517 s.

```bash
S=<scratchpad>; git restore --source=885f5574cc --worktree -- quant/data   # Nachtrag 3.0.1, nur für die Läufe
git archive 885f5574cc quant/data/market/intraday/2026-10-27 | tar -x        # im Snapshot vorhandene, auf main gelöschte Dateien
for f in F1p F1wp F1dp; do node --max-old-space-size=7000 scripts/quant/v13c/run-frame.cjs --frame $f; done   # einzeln (Speicher)
node scripts/quant/v13c/run-s3.cjs --private $S/v13c-private
node scripts/quant/v13c/assemble.cjs
python3 -I scripts/quant/v13c/verify_v13c.py --root . --private $S/v13c-private --series $S/v13-private/series \
  --series110 $S/v13b-private/series-1.1.0 --f0manifest $S/v13-studies/private/F0-source-manifest.json.gz --out docs/quant-recovery/v13c/python-check-3.0.0.json
git checkout HEAD -- quant/data && git clean -fdq quant/data                 # danach zurück auf HEAD
node --test quant/tests/v13c-study.test.mjs
```

## Offene Punkte

1. 8 der 13 neuen Reihen fallen unter der registrierten Frame-Regel weg (letzter Handelstag nicht am Modaltag) – dieselbe
   Mechanik wie in V13; F1w'/F1d' zeigen sie.
2. Drift von `quant/data` auf `main` seit V13 (2 F0-Listings, SPY-Datei) ist nicht untersucht.
3. Vor 2009 bleibt der S&P 500 nicht qualifiziert; weitere Endwerte bräuchten neue Quellen.
