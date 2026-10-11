# Kostenkalkulation – 1, 5 und 10 Videos pro Tag

Alle Werte USD, 30 Tage. **Annahmen sind fett markiert, Preise haben Quellenstatus.** Kein Preis wurde erfunden; LLM- und Speicherkosten sind Variablen.

## Preisbasis
| Posten | Wert | Status |
|---|---|---|
| Avatar IV, Sprechsekunde | **0,039** (gemessen) · 0,05 (HeyGen-Blog/Hilfe) | GETESTET / UNBESTÄTIGT |
| Avatar V, Sprechsekunde | **0,116 gemessen** (0,60 USD für 5,17 s, 2026-10-11) · 0,0667 laut HeyGen-Blog (UNVERIFIZIERT, lag um Faktor ≈ 1,7 zu niedrig) | GETESTET (ein Clip) |
| Photo-Avatar-Anlage | 1,32 je Identität, einmalig | GETESTET |
| TTS ElevenLabs v3 / multilingual v2 | 0,08 je 1.000 Zeichen (v4-Aktion 0,022 endet 12.10.2026, **nicht** angesetzt) | DOKUMENTIERT (Rohbericht) |
| ElevenLabs-Abos | Starter 6, Creator 22, Pro 99 USD/Monat | DOKUMENTIERT (Rohbericht) |
| CI (öffentliches Repo) | 0 (Standard-Runner) | DOKUMENTIERT |
| HyperFrames / FFmpeg | 0 | DOKUMENTIERT |
| LLM-Skript, Speicher (S3/R2) | Variable `p_llm`, `p_stor` | nicht ermittelt |
| Musiklizenz | offen | – |

## Mengengerüst (Annahme)
Reel: **10 s Avatar, 600 Zeichen** · Aktienanalyse (2 min): **30 s Avatar, 1.800 Zeichen** · YouTube-Bericht (12 min): **90 s Avatar, 10.000 Zeichen**.

## Einmalige Einrichtung
| Posten | USD |
|---|---|
| Photo Avatare DAVID, MARC, SOFIA (3 × 1,32) | 3,96 |
| Stimmen-Blindtest (ElevenLabs/Azure/Google, geschätzt) | < 5 (Annahme) |
| Zweitengine-Test (fal.ai, 2 Engines × ~6 s × 0,06–0,16) | ≈ 1–2 |
| Avatar-V-Test | 0,60 (durchgeführt) |
| Tiingo-Klärung, Rechtsberatung KI-Kennzeichnung/Finanzwerbung | nicht beziffert |
| Entwicklungsaufwand Templates/Gates | Arbeitszeit, nicht beziffert |

## Laufende Fixkosten
HeyGen: keine Grundgebühr bekannt (Prepaid-Wallet, Einstieg 5 USD – Drittquelle). ElevenLabs: nur nötig bei Abo statt API-Abrechnung (22–99 USD/Monat). Speicher/LLM: Variablen.

## Variable Kosten (Avatar + TTS)
Mix: 1/Tag = 1 Reel · 5/Tag = 4 Reels + 1 Analyse · 10/Tag = 8 Reels + 2 Analysen, zusätzlich 1 Bericht pro Woche (4/Monat).
| Szenario | Avatar IV gemessen (0,039) | Avatar IV Blog (0,05) | Avatar V Blog (0,0667) | TTS (0,08/1k) |
|---|---|---|---|---|
| 1 Video/Tag | 11,7 | 15,0 | 20,0 | 1,4 |
| 5 Videos/Tag | 81,9 | 105,0 | 140,1 | 10,1 |
| 10 Videos/Tag (+ wöchentl. Bericht) | 177,8 | 228,0 | 304,2 | 23,4 |

**Summe Avatar + TTS (USD/Monat):**
| Szenario | IV gemessen | IV Blog | V Blog |
|---|---|---|---|
| 1/Tag | 13 | 16 | 21 |
| 5/Tag | 92 | 115 | 150 |
| 10/Tag | 201 | 251 | 328 |
Zuzüglich `30 · N · (p_llm + Speicher)` und eventueller Fixkosten. Je Video sind das grob 0,44 USD (Reel), 1,31 USD (Analyse), 4,31 USD (Bericht) bei Avatar IV gemessen.

## Hebel
- Avatar-Sekunden begrenzen: Hook/CTA wiederverwenden (Cache je Look und Skript-Hash), Rest Voice-over.
- Fakten-Gate vor Avatar/TTS, damit verworfene Skripte nichts kosten.
- Kostenwache in `tools/heygen.mjs` (Abbruch bei Überschreitung, Wallet-Differenz als Ist-Kosten).
- Avatar V nur, wenn der Qualitätsgewinn den Faktor ≈ 1,7 beim Preis rechtfertigt.

## Offene Unschärfen
HeyGen-Preise weichen zwischen Blog und Messung ab; Rate Limits 10 parallele Workflows (bei 10 Videos/Tag unkritisch); ElevenLabs-Abo vs. API nicht gegengerechnet; Speicherpreise nicht recherchiert.

## Update 2026-10-11: Avatar V gemessen
Avatar V kostet 0,116 USD/s (≈ 6,96 USD/min), ca. 3× Avatar IV. Monatlich (Avatar + TTS, gleiche Mixe wie oben):
| Szenario | nur IV (0,039) | nur V (0,116) | Hybrid: 4 s V + Rest IV |
|---|---|---|---|
| 1/Tag | 13 | 36 | 22 |
| 5/Tag | 92 | 254 | 138 |
| 10/Tag (+ wöchentl. Bericht) | 201 | 552 | 295 |
Je Reel (10 s Avatar, 600 Zeichen): IV 0,44 · V 1,21 · Hybrid 0,75 USD. Die Spalten „Avatar V Blog“ oben sind damit überholt.
