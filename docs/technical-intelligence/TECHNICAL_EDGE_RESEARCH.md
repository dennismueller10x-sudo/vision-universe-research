# Technical Edge Research — Ergebnis-Matrix und Methodenentscheidung

Stand 02.10.2026. Quellen: `quant/data/technical-intelligence/evidence/evidence-1W.json` (Szenario-Studie, Engine 2.2, Elliott-Gewicht 0, Abschnitt 0b in `TECHNICAL_EVIDENCE.md`), `quant/data/technical-intelligence/elliott-validation/*` (vorab registrierte Elliott-Studie, `ELLIOTT_VALIDATION_REPORT.md`), `quant/methodology/technical-method-evidence.json` (abgeleitet von `scripts/technical/derive-method-evidence.mjs`).

**Kernergebnis:** Keine der geprüften technischen Methoden liefert im Holdout einen wirtschaftlich nutzbaren Vorteil. Nur Trend und Konfluenz treffen die Richtung im Holdout statistisch besser als 50 % **und** als „immer long" — um 1,2–1,7 Pp., bei vorzeichenbereinigter Rendite deutlich unter „immer long". Vision Universe trennt deshalb **Technical Intelligence** (Einordnung: Struktur, Zonen, Grenzen, Szenarien, Klarheit) von **Technical Edge** (Prognosevorteil) — Letzteres wird nicht behauptet.

## 1. Fragestellung und Tests

| Frage | Test | Stichprobe |
|---|---|---|
| Erreicht das Hauptszenario Ziel 1 häufiger als Zufall gleicher Geometrie? | Lift vs. Zufallszeitpunkte mit gleichen Abständen, Cluster-Bootstrap | Wochenuniversum, TEST ≥ 2019, n = 46.544 |
| Trifft die Richtung einer Methode allein? | Richtung nach 13 Wochen, Holdout | n 38.759 – 84.398 je Methode |
| Was verliert die Konfluenz ohne Methode X? | Leave-one-out-Ablation (`WITHOUT_X`) | Holdout |
| Ändert Zustimmung/Widerspruch einer Methode das Szenarioergebnis? | bedingter Lift (supports / opposes) | alle Zeiträume |
| Hat Elliott inkrementellen Wert über einer Basis aus Trend, Momentum, Volatilität, Regime, Geometrie? | H1–H7, Walk-forward-Logit, Log-Loss/Brier/AUC, Holm | vorab registriert, 69.791 Ereignisse; Replikation 168.773 |
| Häufen sich Wendepunkte an Fibonacci-Niveaus? | Wendepunkt-Dichte am Niveau ±1 % vs. Nachbarbänder | 319.843 Rückläufe |

## 2. Ergebnis-Matrix (§85)

Richtung nach 13 Wochen, Holdout ab 2019. „immer long": 50,3 % (50,0 … 50,7), Ø vorzeichenbereinigte Rendite **+8,4 %**.

| Methode | Treffer Richtung (95 %-KI) | Ø vorzeichenber. Rendite | Ablation: Konfluenz ohne Methode | Bedingter Lift (stützt / widerspricht) | Evidenzstufe |
|---|---|---|---|---|---|
| Trend | 52,0 % (51,6 … 52,3) | −4,8 % | 50,9 % (−1,0 pp) — einziger spürbarer Beitrag | +0,2 / −11,1 pp (n = 54) | SUPPORTED, schwach |
| Momentum | 50,5 % (50,2 … 50,9) | −3,7 % | 51,9 % (±0) | +0,7 (+0,3 … +1,1) / −0,9 (−1,6 … −0,1) | NOT_ESTABLISHED (KI überlappt „immer long") |
| Struktur (Swings) | 50,9 % (50,5 … 51,2) | +1,6 % | 51,8 % (−0,1) | −0,1 / +0,9 (+0,2 … +1,6) — umgekehrt | NOT_ESTABLISHED (KI überlappt „immer long") |
| Muster (Pattern) | 50,1 % (49,6 … 50,6) | +0,8 % | 51,9 % (±0) | +0,4 / −0,7 | NOT_ESTABLISHED |
| Konfluenz | 51,9 % (51,5 … 52,2) | −4,9 % | — | — | SUPPORTED, schwach |
| Konfluenz stark | 51,9 % (51,5 … 52,3) | −1,5 % | — | — | wie Konfluenz |
| Elliott | Gewicht 0 | — | identisch (kein Beitrag) | — | NOT_ESTABLISHED (H1–H5, H7 nicht bestätigt; H5 widerlegt) |
| Elliott Timing (H6) | — | — | — | — (H6: entwickelnder vs. bestätigter Einstieg +3,9 pp, 2,6 … 5,2; ohne Fortsetzungs-Lesart gleiche Richtung, +2,2 pp, nicht separat getestet) | VALIDATED, nur als Zeitpunkt-Aussage |
| Fibonacci | Häufung 0,97 / 1,05 / 0,99 / 0,97 bei 38,2 / 50 / 61,8 / 78,6 % | — | — | — | NOT_ESTABLISHED (keine Häufung) |
| Higher Timeframe, Volumen | im Wochenmodus nicht verfügbar (n = 0) | — | — | — | DESCRIPTIVE_ONLY |
| Wyckoff | Gewicht 0 | — | — | — | DESCRIPTIVE_ONLY |

Szenario-Ebene (TEST): Ziel 1 35,6 % vs. Zufall 35,9 % (Lift −0,4 pp, −0,9 … +0,2); Ø Rendite je Signal −2,3 %. Kalibrierung nicht bestanden (Brier-Skill −0,003).

**Stufenkriterium.** SUPPORTED verlangt seit dem unabhängigen Review, dass die KI-Untergrenze über 50 % **und** über der KI-Obergrenze von „immer long" liegt (vorher nur > 50 %). Die Verschärfung ist konservativ: Momentum und Struktur fallen dadurch auf NOT_ESTABLISHED; keine Methode wurde hochgestuft.

**Hinweis zur Lesart.** Die Richtungs-KIs sind einfache Binomial-Intervalle über überlappende Fenster; sie sind zu eng. Der Trend-Vorsprung von 1,7 pp vor „immer long" entsteht über Short-Richtungen in fallenden Phasen und kostet in Summe Rendite — er ist eine Beschreibung, kein Vorteil.

## 3. Interaktionen und Redundanz

- **Konfluenz = Trend.** Ohne Trend fällt die Konfluenz von 51,9 % auf 50,9 %; ohne jede andere Methode bleibt sie unverändert (±0,1 pp). Momentum, Struktur und Muster sind gegenüber Trend redundant.
- **Zustimmung ändert wenig.** Hohe Methoden-Einigkeit: Lift +0,3 pp (−0,1 … +0,7); geringe Einigkeit: −1,7 pp (−2,9 … −0,5). Der einzige stabile Befund ist negativ: *Widerspruch* zwischen Methoden kündigt leicht schlechtere Szenarien an.
- **Struktur widerspricht → besser.** Wenn die Swing-Struktur gegen das Szenario spricht, liegt der Lift bei +0,9 pp — ein Hinweis auf Mean-Reversion in Rücksetzer-Szenarien, nicht auf ein Strukturmerkmal mit Prognosewert. Nicht vorab registriert; nicht verwenden.
- **Strukturklarheit (vormals „Konfidenz").** HIGH 36,6 % / MODERATE 36,3 % / LOW 34,9 % gegen Zufall 36,2 / 36,1 / 35,7 — Klarheit beschreibt, wie eindeutig das Bild ist, nicht wie wahrscheinlich das Ziel erreicht wird.
- **Elliott-Klarheit** im Szenario: HIGH +0,5 pp (−0,3 … +1,3), MODERATE −0,1, LOW +0,1 — kein Gefälle.
- **Segmente** (Risk-off, extreme Volatilität, bearishe Fortsetzung) zeigen positive Lifts von +1,3 … +2,8 pp; sie sind beschreibend, nicht für Mehrfachtests korrigiert und nicht vorab registriert. Sie sind Kandidaten für eine künftige Präregistrierung, keine Produktaussage.

## 4. Entscheidung je Methode (§86)

| Methode | Entscheidung | Rolle im Produkt | Begründung |
|---|---|---|---|
| Trend | **KEEP** | CORE, Gewicht 0,30 | trägt die Konfluenz allein; beste Lagebeschreibung |
| Momentum | **KEEP (DOWNWEIGHT-Kandidat)** | CORE, 0,20 | redundant zu Trend; Richtung nicht besser als „immer long"; bedingter Lift klein positiv |
| Struktur | **KEEP** | CORE, 0,15 | liefert Zonen, Invalidation und Ziele — Produktgerüst, unabhängig vom Prognosewert |
| Higher Timeframe | **KEEP** | CORE, 0,15 | Wochenmodus ohne Messung; Tagesmodus offen |
| Volumen | **KEEP, DESCRIPTIVE** | 0,10 | im Wochenmodus nicht gemessen |
| Muster | **DOWNWEIGHT** (bereits 0,08) | CONTEXT | kein Effekt |
| Elliott | **KEEP – CONTEXT ONLY** (aus der Konfluenz entfernt: Gewicht 0, umgesetzt) | CONTEXT: Strukturbeschreibung, Wave Inspector, Regel-Audit | vorab registriert, nicht bestätigt |
| Fibonacci | **REMOVE als Prognose**, KEEP als Zonenhilfe | CONTEXT | keine Häufung an Niveaus |
| Wyckoff | **REMOVE aus Konfluenz** (0) | DESCRIPTIVE_ONLY | nicht geprüft |

**Gewichte:** Außer Elliott → 0 (vorab registriert) wurden **keine Gewichte verändert**. Eine Umgewichtung auf Basis dieser Holdout-Zahlen wäre Tuning auf Testdaten. Ein Downweighting von Momentum würde nur in einer neuen, vorab registrierten Studie mit frischem Holdout (z. B. Daten ab 2026-10) entschieden.

## 5. Produkttrennung

| | Technical Intelligence (ausgeliefert) | Technical Edge (nicht behauptet) |
|---|---|---|
| Aussage | „So sieht die Lage aus, hier liegen Zonen und Grenzen, so klar ist das Bild" | „Dieses Szenario tritt mit Wahrscheinlichkeit p ein" |
| Kennzahl | Strukturklarheit, Count Quality, Anwendbarkeit, Relabeling-Risiko | kalibrierte Trefferquote — **nicht bestanden** |
| UI | Evidenzbadge je Methode, Evidenzkarte, Methodikseite | keine Wahrscheinlichkeiten, keine Signale |

## 6. Was eine künftige Edge-Studie bräuchte

1. Neuen, unberührten Holdout (TEST ist dreimal angesehen).
2. Präregistrierung der Segmenthypothesen aus §3 (Risk-off, extreme Volatilität) mit Holm-Korrektur.
3. Tagesdaten mit Volumen und Higher Timeframe für das ganze Universum (Workflow `technical-intelligence-evidence.yml`).
4. Delisted-Titel gegen Survivorship (Datenquelle fehlt).
5. Kosten und Kapazität realistisch (Spread, Slippage je Liquiditätsklasse).
