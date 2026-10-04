# Practitioner Reference — Skalierungsprotokoll (Mission V, Phase 2)

Stand 04./05.10.2026. **PRACTITIONER REFERENCE, NOT OBJECTIVE GROUND TRUTH.** Extraktion LLM-dual aus der Primärquelle, nicht menschlich geprüft (Nachtrag 2). Kein Freeze, kein Vergleichslauf, keine VU-Ausgaben und keine späteren Kurse gesehen. Grundlage: Nachtrag 5 (`PRACTITIONER_PROTOCOL.md`), Rahmen/Ziehung aus Commit `b9f3a4f1` (vor jeder Extraktion).

## 1. Ergebnis in Kürze

| Kennzahl | Wert |
|---|---|
| gezogene Elemente Phase 2 (Reihenfolge nach Nachtrag 5 f) | 323 |
| vollständig bearbeitet (A + B, ggf. C) | 307 (q001–q307) |
| `NOT_PROCESSED` (Stopp) | 16 (q308–q323: ewf 9, tiedje 3, tv-yuchaosng 2, tv-thefifthwave 2) |
| Stopp-Grund | Rechenbudget (≈ 450 USD Phase 2), **nicht** 100 INCLUDED |
| Zeilen in `references.jsonl` (Pilot 27 + Phase 2 307) | 334 |
| Status aller Zeilen | INCLUDED 99 · CANDIDATE 95 · EXCLUDED 140 |
| davon `LATER_REVISION` (Revisionsketten) | 29 (INCLUDED 21, CANDIDATE 6, EXCLUDED 2) |
| **INCLUDED-Fälle (Originale, inkl. 5 Pilot)** | **78** (Phase 2: 73) |
| HIGH-Anteil der INCLUDED-Fälle | 23 / 78 = 29,5 % |
| Validierung (`validate.mjs`) | 0 Duplikate, 0 Kettenfehler; Qualitäts-Gate nicht erreicht: `cases` 78 < 100, `highShare` 0,295 < 0,70 → Status bleibt PILOT |
| Tests `node --test quant/tests/practitioner-*.test.mjs` | 59/59 an jedem Checkpoint ab `c58d4f1d` (siehe § 7) |

Ziel 100 INCLUDED wurde **nicht** erreicht. Hauptgründe (§ 3): ein großer Teil der EWF-„Stock Market“-Beiträge zählt trotz Kategorie-Einschränkung im 1H/4H-Chart oder gemischt (84 von 163 EWF-Elementen EXCLUDED, davon die Mehrheit Zeitrahmen), US-Aktien-1D vor 05.09.2025 bleiben wegen der VU-Datenlücke CANDIDATE (59), und Tiedje-Videobeiträge sind über YouTube nicht erreichbar.

## 2. Je Quelle (Phase-2-Elemente; Pilot getrennt im Pilotprotokoll)

| Quelle | bearbeitet | INCLUDED (Original) | LATER_REVISION | CANDIDATE | EXCLUDED | HIGH (INCLUDED) |
|---|---:|---:|---:|---:|---:|---:|
| ewf (Stock Market ohne COTD) | 163 | 42 | 0 | 37 | 84 | 16 |
| tiedje | 83 | 9 | 10 | 27 | 37 | 2 |
| tv-yuchaosng | 27 | 7 | 8 | 11 | 1 | 2 |
| tv-thefifthwave | 16 | 7 | 1 | 8 | 0 | 2 |
| tv-cryptoknee | 18 | 8 | 2 | 6 | 2 | 0 |
| **Summe** | **307** | **73** | **21** | **89** | **124** | **22** |

(Die Spalten zählen nach Status der Zeile; Revisionen werden in der Spalte LATER_REVISION statt INCLUDED geführt, sofern sie INCLUDED sind.)

**Balance (Nachtrag 5 e).** INCLUDED-Fälle inkl. Pilot nach Quellenfamilie: ewf 45 (57,7 %), tiedje 11, tv-cryptoknee 8, tv-yuchaosng 7, tv-thefifthwave 7; HKCM 0. Keine Familie > 60 % — die Grenze wird eingehalten, liegt aber nahe. Wird TradingView als eine Familie betrachtet: 22 (28 %).

Weitere Verteilung der 78 INCLUDED-Fälle: Zeitrahmen 1W 47 · 1D 23 · 1M 8; Jahre 2022 14 · 2023 20 · 2024 12 · 2025 20 · 2026 12; Instrumenttyp Aktie 52 · Krypto 17 · ETF 3 · CFD 2 · Kassaindex 2 · Future 1 · Rohstoff 1; 44 Instrumente. Musterfamilie MOTIVE 62 · CORRECTIVE 15 · 1 Fall mit Familie UNKNOWN (`pr_tv-cryptoknee_20260514_msft`, Muster nicht benannt, nur Richtung/Invalidation) — die Schieflage zu MOTIVE ist eine Eigenschaft der Quellen (überwiegend Impuls-Fortsetzungen/„blue box“-Käufe), keine Auswahl.

## 3. Ausschluss- und Kandidatengründe (Phase 2)

| EXCLUDED (124 Zeilen) | Anzahl |
|---|---:|
| Zeitrahmen MIXED (Primärzählung auf mehreren Zeitebenen, kein 1D/1W/1M-Schluss) | 49 |
| Zeitrahmen INTRADAY (1H/4H/Minuten) | 34 |
| § 3 keine verwertbare Prognose (A und B unabhängig bzw. Schiedsdurchgang; Rückblick, Werbung, Signaltabelle, Lehrbeispiel) | 25 |
| Quelle unerreichbar (A und B; YouTube-Bot-Prüfung) | 14 |
| Zeitrahmen UNKNOWN | 2 |

| CANDIDATE (89 Zeilen) | Anzahl |
|---|---:|
| § 2.4 VU-Reihe deckt den Stichtag im Zeitrahmen 1D nicht ab (US-Aktien-Tagesreihe ab 05.09.2025) | 59 |
| Plausibilitätsband (Nachtrag 4: ±60 % bei 1D, −90 %/+400 % bei 1W/1M) | 25 |
| sonstige (u. a. Instrument ohne VU-Reihe, Kernfeld UNKNOWN) | 5 |

**Unerreichbarkeit.** 17 Tiedje-Elemente (Video-Analysen „EW Video-Analyse …“/„Bitcoin to da Moon“) waren in mindestens einem Durchgang nicht erreichbar: der Artikeltext enthält nur einen Satz, die Zählung steckt im eingebetteten YouTube-Video, das hinter der Bot-Prüfung liegt. **Nicht umgangen** (keine Cookies, kein Login, kein Proxy). Wo ein Durchgang über öffentlich ausgelieferte Untertitel eine Teilaussage fand und der andere nicht, wurde nach den normalen Regeln weiterentschieden (z. B. q216: beide Zeitrahmen UNKNOWN → EXCLUDED). Keine Medien, Frames oder Transkripte im Repo; alles nur unter `/tmp`.

**C-Skip-Regel.** Stimmen A und B im Zeitrahmen überein und ist dieser INTRADAY, MIXED oder UNKNOWN, wird kein Schiedsdurchgang C gestartet, auch wenn andere Kernfelder abweichen — die Zeile wird nach § 2.2 ohnehin EXCLUDED („kein VU-Schluss“), C könnte den Status nicht ändern. Angewendet in 23 Fällen (Budget). Die Abweichungen bleiben im A/B-Übereinstimmungsfeld der Zeile sichtbar.

## 4. A↔B-Übereinstimmung je Kernfeld (Phase 2)

Basis: 290 Elemente, in denen A und B die Quelle erreicht haben. „gleich“ nach `compareCoreFields` (Invalidation ±1 %, Welle nach Normalisierung, Instrument nach Schlüssel); „nicht genannt“ = in beiden nicht angegeben.

| Kernfeld | gleich | abweichend | nicht genannt | Übereinstimmung (gleich / (gleich+abw.)) |
|---|---:|---:|---:|---:|
| Familie | 254 | 20 | 16 | 92,7 % |
| aktuelle Welle | 205 | 66 | 19 | 75,6 % |
| Richtung | 261 | 15 | 14 | 94,6 % |
| Invalidation (±1 %) | 171 | 14 | 105 | 92,4 % |
| Zeitrahmen | 268 | 10 | 12 | 96,4 % |
| Instrument | 287 | 3 | 0 | 99,0 % |

Die aktuelle Welle ist das schwächste Feld (Grad-/Notationsfragen: „(iv)“ vs. „4“, Doppellabels, welche Teilstruktur „aktuell“ ist). Schiedsdurchgänge C: 60 (Phase 2). HIGH wird nur bei Übereinstimmung **und** Belegstellen vergeben (Nachtrag 2); daher der niedrige HIGH-Anteil.

## 5. Kosten

| Posten | Läufe |
|---|---:|
| Durchgang A | 307 |
| Durchgang B | 307 |
| Schiedsdurchgang C | 60 |
| abgebrochene Läufe (Sitzungslimit/HTTP 429, danach sauber neu gestartet; Teilverzeichnisse vorher gelöscht) | ≈ 17 |
| **Summe** | **≈ 691** |

Schätzung aus der Laufzahl mit ≈ 0,60 USD je Agentenlauf (ca. 55–90 k Tokens je Lauf) ⇒ **≈ 415 USD** zuzüglich Koordinationsaufwand; damit am Budgetrand von ≈ 450 USD. Exakte Abrechnungswerte liegen in der Umgebung nicht vor; die Zahl ist eine Schätzung, keine Messung. Ausbeute ≈ 0,24 INCLUDED je bearbeitetem Element (73/307), deutlich unter der Annahme 0,35 aus Nachtrag 5 b.

## 6. Revisionsketten (Nachtrag 5 g)

`merge.mjs` verknüpft eine Phase-2-Zeile mit der jüngsten früheren Zeile derselben `sourceId` und desselben `vuSymbol` ≤ 56 Tage zuvor, **wenn diese INCLUDED ist**; die spätere Zeile erhält `revisionOf`, `viewKind: LATER_REVISION`, `version + 1` und dieselbe `caseId` und zählt nicht zur Fallzahl. Ergebnis: 29 Revisionen (überwiegend Tiedje-BTC/SOL und tv-yuchaosng-BTC/SPX), 0 Kettenfehler.

**Abweichung von Nachtrag 5 g (offen gelegt):** Revisionen wurden nur unter den ohnehin gezogenen Elementen erkannt. Die dort vorgesehene gezielte Nachextraktion der *ersten* späteren Analyse je INCLUDED-Fassung aus den Rahmen-Metadaten (auch wenn sie nicht gezogen wurde) ist **nicht** erfolgt — aus Budgetgründen. Eine verknüpfte Revision ist daher nicht zwingend die erste spätere Analyse des Autors.

## 7. Korrekturen während Phase 2 (echte Fehler, Pipeline nicht umgebaut)

Alle Korrekturen ändern nur Normalisierung/Zuordnung, keine Tests wurden abgeschwächt.

1. **Instrument-Schlüssel, Namensabgleich** (`dual-extraction.mjs`, `instrumentKeyOf`): Rückfall auf Wortmengen-Vergleich des Namens, wenn A/B unterschiedliche Kurzformen nennen (z. B. „Alphabet“/„Alphabet Inc. Class A“).
2. **Ford-Ticker „F“** (`instrumentKeyOf`): „F“ steht auf der Stoppliste (Chartkennung), ist aber bei Typ STOCK der Ford-Ticker → für Aktien von der Stoppliste ausgenommen (q139).
3. **Aktienklassen** (`lib.mjs`, `resolveInstrument`): VU führt Klassenaktien ohne Trennzeichen („BRK.B“ → `ref_BRKB`); Auflösung über die bereinigte Form, nur wenn die Originalform keine Reihe hat.
4. **SPXUSD** als Alias des S&P-500-CFD in `instrument-map.json`.
5. **Wellenlabels** (Montage-Skript): führendes Token („3 (of 3)“ → „3“), eingekreiste Ziffern („⑤“ → „((5))“), „circled 5 (of V)“ → „((5))“, Doppellabels („2,B“) → UNKNOWN statt Raten (`a15bf490`).
6. **Zielzonen** mit nur einer Grenze → low = high; Zonen ohne Zahl werden verworfen statt mit `null` gespeichert (Schemafehler q085).
7. **Revisionsketten** nur an INCLUDED-Eltern (vorher 2 Kettenfehler: INCLUDED-Revision an CANDIDATE-Eltern).
8. **Rote Tests am Checkpoint `4470a711`** (siehe unten).

**Vorfall rote Tests.** Am Checkpoint `4470a711` wurde mit 2 roten Practitioner-Tests gepusht: ein zusätzlicher Eintrag `brk-b` in `instrument-map.json` verletzte zwei bestehende Invarianten (Karteneinträge nur für Multi-Asset-Reihen; `SYMBOL_MARKET`-Konsistenz). Behebung in `c58d4f1d`: Eintrag entfernt, stattdessen Korrektur 3 in `lib.mjs`; Tests unverändert. Seitdem läuft jeder Checkpoint über ein Skript, das nur bei `# fail 0` committet (an einem Checkpoint, `e270bade`, war die Kette noch nicht hart verknüpft; die Tests waren dort grün, danach ersetzt durch `ckpt.sh` mit `if`).

## 8. Bekannte Grenzen

- **levelScale-Heuristik:** Abweichung > 5 % zwischen Chartniveau und VU-Schluss am Stichtag wird als Split/Skalierung gedeutet (`levelScale ≠ 1`). Bei sehr volatilen Aktien kann das eine echte Kursbewegung sein (z. B. MSTR, Skala 1,33); betroffene Zeilen tragen die Warnung „EXACT mit levelScale ≠ 1“.
- **EUR-Charts bei Tiedje:** Einige Tiedje-Charts zeigen Euro-Notierungen (Xetra/L&S) für US-Aktien; die Zuordnung auf die USD-Reihe erfolgt über den Ticker, Niveaus können daher systematisch um den Wechselkurs abweichen (meist durch Plausibilitätsband/levelScale sichtbar).
- **YouTube** nicht erreichbar (Bot-Prüfung), nicht umgangen: Tiedje-Videos und eingebettete EWF-Videos nur über Text/Standbilder; HKCM weiterhin ausgesetzt.
- **US-Aktien-1D vor 05.09.2025** bleiben CANDIDATE (keine VU-Tagesdaten bis Stichtag).
- **LLM-Extraktion:** beide Extraktoren haben allgemeines Hintergrundwissen zum späteren Verlauf; laut eigener Angabe nicht verwendet (Nachtrag 2 Punkt 4). Kein Feld wurde aus eigenem Marktwissen gefüllt; fehlende Angaben → UNKNOWN.
- **Kostenangabe** ist eine Schätzung aus der Laufzahl.

## 9. Offene Punkte für den Auftraggeber

- Freeze und blinder Benchmark bleiben beim Auftraggeber (nicht ausgeführt).
- Für ≥ 100 INCLUDED wären bei der beobachteten Ausbeute ≈ 90–110 weitere Elemente (≈ 130 USD) nötig; ertragreicher wären TradingView-Autoren (Ausbeute ≈ 0,26–0,44 ohne Revisionen) als EWF-„Stock Market“ (≈ 0,26) oder Tiedje (≈ 0,11 ohne Revisionen).
- Revisionen nach Nachtrag 5 g vollständig nur mit gezielter Nachextraktion (§ 6).
