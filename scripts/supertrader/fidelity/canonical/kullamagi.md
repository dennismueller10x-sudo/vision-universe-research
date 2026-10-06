# Kanonisches Regelwerk Kristjan Kullamägi (R15) – kullamaegi-canonical-1.0.0

**Quellen (Primär, Volltext, Abruf 02.10.2026):** qullamaggie.com „3 TIMELESS setups“ (08.01.2021, inkl. seiner Kommentarantworten), FAQ, „How to master a setup: Episodic Pivots“ (02.11.2021), „Lessons from a $140K loss“.
Videos, Streams und Tweets wurden nicht abgerufen: Was nur von dort stammt, gilt als NOT_PUBLIC/UNRESOLVED.
Maschinenlesbar: `rulebook-KULLAMAGI.json` (57 Regeln, 24 Live-Komponenten, 22 Textprüfungen).

## 1. Breakout (live als MOMENTUM_BREAKOUT 3.2.0)
| Regel | Original (Quelle) | Live 3.2.0 | Einordnung |
|---|---|---|---|
| Auswahl | 1–2 % stärkste über 1/3/6 Monate (Artikel) | Perzentil ≥ 98, Maximum der drei Fenster | ORIGINAL, Schwelle formalisiert |
| Vorlauf | 30–100 %+ in 1–3 Monaten | ≥ 30 %, Fenster 63/40 | ORIGINAL |
| Basis | geordnet, höhere Tiefs, enger werdend, 2 Wo.–2 Mon. | 10–40 Sitzungen, Tiefe ≤ 25 %, Hälften-/Spannenregel | VU_FORMALIZATION (MEDIUM) |
| Trend | „surft“ steigende 10/20 (manchmal 50) | Schluss > min(SMA10,SMA20), SMA20 steigt | ORIGINAL; 50er fehlt |
| Liquidität | Faktor Nr. 1, Dollarumsatz (Kommentare) | ≥ 5 USD, ≥ 5 Mio. USD, ADR ≥ 2 % | Konzept original, Zahlen VU |
| ADR | Formel 20 Sitzungen (FAQ), keine Mindestzahl | Formel wie FAQ; Minimum 2 % VU | ORIGINAL / VU |
| Volumen | Faktor, keine Regel | kein Filter | faithful |
| Einstieg | ORH 1/5/60 Min. **oder** Tageschart beim Ausbruch | Kauf-Stop am 5-Tage-Hoch, Fill max(Open,Trigger)+10 bp | Tageschart-Variante zulässig; 5-Tage-Hoch = VU |
| Stop | „always lows of the day“, ≤ ATR/ADR | Tagestief (ganzer Tag), gekappt 1 ADR | **ORIGINAL (Fall A)**, Tagesbalken-Näherung VU |
| Teilverkauf | 1/3–1/2 nach 3–5 Tagen | 1/3 nach 3 Sitzungen (auch im Verlust) | ORIGINAL (untere Enden) |
| Einstand | danach Stop auf Einstand | nur wenn Schluss > Einstieg (BE-02) | ORIGINAL + VU-Bedingung |
| Rest | SMA10 oder SMA20 je nach Tempo, Anfänger: Schluss < SMA10 | Schluss < SMA10 → nächste Eröffnung | ORIGINAL; 20er-Variante fehlt |
| Wiedereinstieg | „Sometimes I buy the retrace“ | 5 Sitzungen Sperre nach Trade und INV-01/02 | VU |
| Invalidation | – | Schluss < Basistief, 20 Sitzungen | VU |
| Earnings | Frage öffentlich unbeantwortet | keine Regel | NOT_PUBLIC |

## 2. Episodic Pivot (keine Engine; Registereintrag KK_EPISODIC_PIVOT 0.1.0 ist nur Platzhalter)
- Gap ≥ 10 % auf unerwartete Nachricht; Volumen ist Faktor Nr. 1 (vorbörslich oder in den ersten 15–30 Min. das Tagesvolumen).
- Earnings-EP: hohes EPS-/Umsatzwachstum, deutlicher Analysten-Beat, höhere Prognose; am besten nach 3–6 Monaten seitwärts. Zweit-EPs scheitern öfter.
- Einstieg ORH 1/5/60 Min.; Aufstocken am 5-Min-Hoch oder im Tagesverlauf. Stop am Tagestief, höchstens 1x (max. 1,5x) ADR/ATR.
- Ausstieg: „Create your own sell rules“. Trailing an SMA10/20 (an anderer Stelle 20/50). Teilverkauf beim EP ist schriftlich nicht belegt (NOT_PUBLIC).
- Blocker: Konsens, Guidance und News-Zeitstempel zum damaligen Stand; Vorbörsen- und Minutendaten.

## 3. Parabolic Short/Long (keine Engine)
- Setup: +50–100 %+ in Tagen/Wochen (große Werte) oder +300–1000 %+ (kleine Werte), 3–5+ Tage in Folge gestiegen.
- Short am Opening-Range-Tief (1/5 Min.), nach der ersten roten 5-Min-Kerze oder beim Fehlschlag am VWAP. Stop am Tageshoch bzw. bei VWAP-Rückeroberung. Ziel SMA10/20, Chance/Risiko 5–10x.
- „by far the riskiest setup“: Seine größten Verluste entstehen beim Shorten; Locates sind teuer.
- Long-Variante nach −50–60 % in wenigen Tagen.
- Blocker: Borrow/Locate-Kosten, Short-Simulation, Minuten- und VWAP-Daten.

## 4. Gemeinsam (Sizing, Portfolio, Markt)
- Risiko je Trade 0,25–1 % (Artikel), meist 0,3–0,5 % (FAQ), selten > 1 %. Live: 0,5 % fest (ORIGINAL-Wert). backtest.mjs:11 nennt 0,5 % fälschlich die „Mitte“.
- Gewicht meist 10–20 % bzw. 5–25 %, je nach Liquidität, Überzeugung und Riskanz; über Nacht nie > 30 %. Live: max. 25 %.
- Positionszahl: nicht öffentlich (live 10 = VU). Margin wird genutzt, der Umfang ist nicht öffentlich (live ohne Hebel, maxExposure 1,0 = VU, MEDIUM).
- Markt: In Flauten und Bärenmärkten handelt er „weniger oder gar nicht“. Die Aktie bzw. Gruppe zählt mehr als der Markt; die 200-Tage-Linie ist ihm „egal“. Keine mechanische Regel → live nur angezeigt (MEDIUM).
- Stops: mentale und harte Market-Stops, sehr selten übergangen. Drawdown-Ziel 15–20 %. Trefferquote ~25 %, Gewinner 5–20x+ R.
- Universum US-Aktien **und ETFs** (live ohne ETFs = VU). RS-Rang gleichzeitiger Einstiege und Kosten 10 bp/1 bp = VU.
- Keine Fremdregel im KK-Live-Pfad (kein SPY-200-Filter, kein progressive).

## 5. Exit-Frage: Tagestief-Stop = Fall A (ORIGINAL)
Wörtlich in Breakout- und EP-Artikel, mit Kappung auf ADR/ATR. VU sind nur:
- das Tagestief des ganzen Tages statt bis zum Kauf (zu günstig ohne IEX-Orakel),
- der Gleichtagsausstieg bei Schluss ≤ Stop,
- die ruhende Stop-Order,
- die Einstand-Bedingung.

Dass viele spätere Verdoppler früh ausgestoppt werden, folgt aus seinen eigenen Regeln (bei ~25 % Trefferquote erwartbar).

## 6. Treue (fidelity)
| Bereich | Urteil |
|---|---|
| Entry | TEILWEISE (ORH fehlt; Basis und Trigger VU) |
| Exit | HOCH (Original-Kette, untere Enden; 20er-Variante fehlt) |
| Sizing | HOCH bei den Werten, MITTEL insgesamt (keine Überzeugungs- oder Liquiditätsanpassung) |
| Portfolio | NIEDRIG–MITTEL (10 Plätze, kein Hebel, Sperren, RS-Rang = VU) |
| Fundamental | HOCH für Breakout (korrekt kein Filter); EP fehlt |
| Marktregime | NIEDRIG (Ermessen nicht abgebildet) |

**Replikationsanspruch:** „Kullamägi Breakout“ = **nein**, „Kullamägi“ gesamt = **nein**.
Zulässig ist: „Momentum Breakout – research-basiert auf Kullamägis Breakout-Setup (VU-Variante, Tageschart)“. EP und Parabolic Short nur als „in Forschung“.

## 7. Text-/Code-Befunde (zu korrigieren)
1. registry-r8.mjs:58 – „Danach keine Sperre“ ist falsch für INV-01/02: simulator.mjs:238 setzt weiter 5 Sitzungen.
2. registry-r8.mjs:47 – ENTRY-ORH-D als PRIMARY_EXPLICIT; das 5-Tage-Hoch ist aber VU.
3. registry-r8.mjs:51 – COOLDOWN-00 als PRIMARY_EXPLICIT ohne Quellaussage.
4. registry.mjs:542 – source_basis.note veraltet („Einstieg per Tagesschluss, Gap-Regel“), live in supertrader/data/registry.json.
5. registry.mjs:215 – REGIME-01 zitiert die FAQ, die keine Marktaussage enthält.
6. registry.mjs:227 – PORT-01 (30 %) ist nicht als legacy markiert; live gelten 25 %.
7. fidelity.mjs:158/159 – Marktfilter „keine schriftliche Regel auf seiner Website“ und Liquidität „keine Vorgabe“ übersehen seine Kommentarantworten.
8. process-chain.mjs:23 – „Halten“ als ORIGINAL, obwohl die Einstand-Bedingung VU ist.
9. source-ledger.json:19 – der FAQ wird die Stopregel zugeschrieben; sie definiert nur die ADR.
10. docs/SUPERTRADER_METHOD_FIDELITY.md:66 – „3.1.0 läuft live“; live ist 3.2.0.

## 8. R14-Prüfung
- Bestätigt: Auswahl, Liquidität (Dollarumsatz), Risiko- und Gewichtsspannen, Margin-Abweichung, fehlendes Aufstocken, Tagesbalken-Stop zu günstig, Teilverkauf, fehlende zwei Setups.
- Teilweise: Der Beleg „in bullish markets“ ist missverstanden. Der stärkere Beleg ist „Fewer or no trades“.
- Unvollständig: Sperren (auch nach INV-01/02).
- Nicht nachgerechnet: Ergebnisanteile (verschlüsselt).

## 9. Replikationsdesign (Kurz)
1. Konsolidierte Minutenkurse für ORH und für das Tief bis zum Kauf.
2. Vorab festgelegtes Variantengitter: 1/3 oder 1/2 Teilverkauf, nach 3 oder 5 Tagen, SMA10 oder SMA20, mit oder ohne 50-Tage-Surfen.
3. Beispiele TSLA/MNKD/AAXN nur als Identitätsprüfung.
4. Hebel und Markt-Drossel nur als ausgewiesene VU-Sensitivität.
5. EP erst mit Daten zum damaligen Stand, Parabolic Short erst mit Short- und Borrow-Simulation.
