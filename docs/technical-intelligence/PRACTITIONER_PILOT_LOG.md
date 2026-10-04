# Practitioner Reference — Pilotprotokoll (Mission V, Phase 1)

Stand 04.10.2026. **PRACTITIONER REFERENCE, NOT OBJECTIVE GROUND TRUTH.** Extraktion: LLM-dual aus Primärquelle, nicht menschlich geprüft (Nachtrag 2). Kein Freeze, kein VU-Vergleich gesehen oder gerechnet.

Reihenfolge der Commits (alles vor der jeweiligen Extraktion): Stichprobenrahmen ewf/tiedje/ewt-gilburt → Nachtrag 3 → vorläufige YouTube-Rahmen hkcm/phantom-hkcm → Pilot-Erweiterung (Mittelpunkte) → Nachtrag 4 → Zeilen + dieses Protokoll.

## 1. Zugang (HTTP-Status aus der Umgebung mit Internetzugang)

| Host | Status | Befund |
|---|---|---|
| youtube.com (Kanal-/Videolisten) | 200 | Kanallisten über yt-dlp abrufbar (@hkcm 1.856, @phantombyhkcm 659, @morecryptoonline 22.797 Videos) |
| youtube.com (Einzelvideo, Metadaten, Download) | 302 → google.com/sorry bzw. „Sign in to confirm you’re not a bot“ | nach den ersten Listenabrufen dauerhaft gesperrt (> 2 h, mehrfach gedrosselt erneut versucht). **Nicht umgangen** (keine Cookies/Logins). Damit keine HKCM-/Phantom-/MCO-Extraktion und keine exakten Upload-Zeitstempel |
| i.ytimg.com | 200 | nur Vorschaubilder, für Extraktion nicht genutzt |
| rr*.googlevideo.com | nicht erreicht | Download scheitert schon an der Bot-Prüfung |
| x.com | 200 (JS-Hülle) | Zeitleisten nur mit Login → nicht genutzt; einzelne Post-URLs wurden nicht benötigt |
| hkcm.de | 200 (leere JS-Seite) | Analysen nur für Mitglieder |
| aktiencheck.de (Hopf-Kolumne) | 200 | nur Verweise auf YouTube-Videos (2023) = Cross-Posts ohne eigenen Inhalt |
| trading-treff.de (Hopf) | 200 | Archiv endet 30.06.2021 → 0 Beiträge im Fenster |
| stock3.com | 200 | Themenseite Elliott-Wellen, Artikel `isAccessibleForFree: true`, Zeitstempel mit Offset |
| elliottwave-forecast.com | 200 | öffentliche WordPress-REST-API (vollständiges Archiv mit `date_gmt`, `modified_gmt`, Kategorien); eingebettete YouTube-Videos gesperrt (s. o.), Artikeltext + Charts reichen |
| elliottwavetrader.net | 200 | Autorenseite ohne Archiv; öffentliche News-Sitemaps mit `publication_date`; JSON-LD `datePublished` = Erstveröffentlichung (Autorenseite zeigt für noch gesperrte Artikel das Erstdatum + Countdown zur öffentlichen Freigabe) |
| tradingview.com/ideas | 200 | im Pilot nicht genutzt |
| elliottwave.com, de.investing.com | 403 | wie Nachtrag 2, nicht umgangen |
| web.archive.org | keine Verbindung | wie Nachtrag 2 |
| pypi.org | 200 | yt-dlp 2026.08.19 installiert; ffmpeg vorhanden |

## 2. Stichprobenrahmen (Nachtrag 1 Punkt 2; `scripts/technical/practitioner/sampling-frame.mjs`, `frames/<sourceId>.json`)

Regeln vorab, ergebnisblind (nur Titel/Kategorie): Rückblick-/Erfolgstitel und EWF-Kategorien „Blue Box Wins“/„Aidans Corner“ → `EXCLUDED_RETROSPECTIVE`; Lehr-/Interview-/Werbetitel → `EXCLUDED_NON_ANALYSIS`; Tiedje: nur vom Autor als Elliott-Analyse gekennzeichnete Titel („EW Analyse“, „Elliott Wellen …“), die Serien „DOW -/DAX -/ICE -“ sind Signaltabellen des ICE-Systems (an drei Beispielen vor der Ziehung geprüft) → `EXCLUDED_SYSTEM_SIGNALS`; kein Zielinstrument im Titel → `EXCLUDED_NO_TARGET_INSTRUMENT` (ewt-gilburt: Instrument erst am gezogenen Beitrag, da Titel es selten nennen). k = ⌊|E| / Ziel⌋, Start = SHA-256("20261004|"+sourceId) mod k; Pilot m = ⌊|S| / Quote⌋, p0 = SHA-256("20261004|pilot|"+sourceId) mod m; Pilot-Erweiterung S[p0 + j·m + ⌊m/2⌋] (vorab committet).

| Quelle | Fensterquelle | Rahmen | ausgeschlossen (Rahmen) | E | Ziel | k / Start | Stichprobe | Pilot (+Erw.) |
|---|---|---:|---|---:|---:|---|---:|---|
| ewf | WP-REST-API, alle Beiträge 2022-01-01…2026-06-30 | 3.275 | ohne Zielinstrument 1.190, Rückblick 509, keine Analyse 28 | 1.548 | 60 | 25 / 19 | 62 | 7 (+7) |
| tiedje | stock3 Themenseite (400 S.), Autor André Tiedje | 2.000 | Systemsignale 1.841, ohne Zielinstrument 42, keine Analyse 17, Rückblick 5 | 95 | 40 | 2 / 0 | 48 | 5 (+4) |
| ewt-gilburt | EWT-News-Sitemaps, Autor Avi Gilburt | 60 | keine Analyse 18, Rückblick 1 | 41 | 15 | 2 / 1 | 20 | 4 |
| hkcm | YouTube-Kanalliste (Plattformreihenfolge) | 1.398 | ohne Zielinstrument 819, keine Analyse 90, Rückblick 8 | 481 | 70 | 6 / 2 | 80 | 7 — **BLOCKED** |
| phantom-hkcm | YouTube-Kanalliste | 590 | ohne Zielinstrument 499, keine Analyse 7, Rückblick 1 | 83 | 10 | 8 / 7 | 10 | 2 — **BLOCKED** |
| more-crypto-online | — | — | Datumsliste nicht abgeschlossen (YouTube-Sperre) | — | — | — | — | — |

YouTube-Rahmen sind **vorläufig**: Einzeldaten nur aus der relativen Plattformangabe („vor 3 Jahren“, Fehler bis ±6 Monate), die exakten Fenstergrenzen müssen vor der ersten HKCM-Extraktion mit exakten Upload-Daten nachgezogen und neu committet werden (ohne Inhaltskenntnis). Die aktiencheck-Kolumne ist reiner Cross-Post-Verweis und bildet keinen eigenen Rahmen.

## 3. Pilotfälle (27 gezogen, 26 doppelt extrahiert)

Je Fall zwei unabhängige Agenten (A, B; nur Quelle + README/Schema), Medien nur in /tmp. Schiedsdurchgang C bei Abweichung in einem Kernfeld oder Muster/Label-Inkonsistenz (Nachtrag 3). Stichtag immer über `cutoff.mjs`. Übereinstimmung: ✓ gleich, ✗ abweichend, – in beiden nicht genannt (Reihenfolge: Familie · Welle · Richtung · Invalidation · Zeitrahmen · Instrument).

| Fall | Quelle | Datum | Instrument | ZR | Übereinstimmung | C | Sicherheit | Status / Grund |
|---|---|---|---|---|---|---|---|---|
| ewf1 | ewf | 06.04.2022 | Gold (XAUUSD) | INTRADAY | ✓✓✓✓✓✓ | Muster WXY | MEDIUM | EXCLUDED §2.2 Intraday |
| ewf2 | ewf | 29.12.2022 | DAX (UNMAPPED) | INTRADAY | ✗✓✓✓✓✓ | Familie → MOTIVE | MEDIUM | EXCLUDED §2.2 |
| ewf3 | ewf | 27.06.2023 | BTCUSD | MIXED (1D+2h) | ✓✓✓✓✓✓ | – | MEDIUM | EXCLUDED §2.2 (Zählung im 2h-Chart) |
| ewf4 | ewf | 11.01.2024 | NVDA | INTRADAY | ✓✓✓✓✓✓ | – | HIGH | EXCLUDED §2.2 |
| ewf5 | ewf | 12.08.2024 | AXP | 1W | ✓✓✓✓✓✓ | – | MEDIUM (Bearbeitungsmetadaten) | **INCLUDED** |
| ewf6 | ewf | 04.03.2025 | Gold | INTRADAY | ✓✓✓✓✓✓ | – | HIGH | EXCLUDED §2.2 |
| ewf7 | ewf | 16.09.2025 | Gartner (IT) | 1M | ✓✓✓✓✓✓ | Muster → IMPULSE (Welle IV) | MEDIUM | **INCLUDED** |
| ewf8 | ewf | 21.08.2022 | CHWY | 1D | ✓✓✓✗✓✓ | Invalidation → 22,22 | MEDIUM | CANDIDATE (Plausibilität: Blue-Box-Untergrenze 6,39 bei 1D) |
| ewf9 | ewf | 30.03.2023 | SPX→SPY | INTRADAY | ✓✓✓✗✓✓ | – | MEDIUM | EXCLUDED §2.2 |
| ewf10 | ewf | 04.10.2023 | NVDA | INTRADAY (4H) | ✓✓✓✓✓✓ | – | HIGH | EXCLUDED §2.2 |
| ewf11 | ewf | 17.04.2024 | Nikkei-Future→N225 | INTRADAY | ✓✓✓✓✓✓ | – | HIGH | EXCLUDED §2.2 |
| ewf12 | ewf | 05.12.2024 | GDXJ (UNMAPPED) | 1D | ✓✓✓✓✗✓ | ZR → 1D | MEDIUM | CANDIDATE (keine VU-Reihe) |
| ewf13 | ewf | 03.06.2025 | PLTR | 1D | ✓✓✓✓✓✓ | – | HIGH | CANDIDATE §2.4 (keine Tagesdaten bis Stichtag) |
| ewf14 | ewf | 28.12.2025 | HOOD | 1W | ✓✓✓✓✓✓ | – | MEDIUM | **INCLUDED** |
| tj1 | tiedje | 26.03.2022 | XOM | 1M | ✓✓✓–✓✓ | – | MEDIUM | EXCLUDED §3 Rückblick (A und B) |
| tj2 | tiedje | 14.10.2022 | Gold | 1D | –✓✗–✓✓ | – | LOW (A und B LOW) | CANDIDATE |
| tj3 | tiedje | 25.08.2023 | NVDA | 1D | ✓✓✓–✓✓ | – | MEDIUM | CANDIDATE §2.4 |
| tj4 | tiedje | 22.11.2023 | DAX | – | ––––– ✓ | – | LOW | EXCLUDED §3 Marketing (A und B) |
| tj5 | tiedje | 05.08.2024 | Solana | – | nicht extrahiert | – | LOW | EXCLUDED: nur YouTube-Video, Bot-Prüfung |
| tj6 | tiedje | 20.05.2022 | BTCUSD | 1W | ✓✓✓–✓✓ | – | MEDIUM | **INCLUDED** |
| tj7 | tiedje | 27.05.2023 | NVDA | 1W | ✓✓✓–✓✓ | – | HIGH | **INCLUDED** (levelScale 0,1026 aus Chart-/VU-Schluss) |
| tj8 | tiedje | 27.10.2023 | AAPL | 1M | ✗–––✓✓ | – | MEDIUM | EXCLUDED §3 nur historisches Lehrbeispiel (A und B) |
| tj9 | tiedje | 26.01.2024 | SOLUSD | 1W | ✓✓✓–✓✓ | – | MEDIUM | CANDIDATE (Ziel 1.212 außerhalb −90/+400 %) |
| ewt1 | ewt-gilburt | 27.07.2022 | SPX→SPY | INTRADAY | ✓✓✓–✓✓ | – | MEDIUM | EXCLUDED §2.2 |
| ewt2 | ewt-gilburt | 01.01.2024 | SPX | – | ––✗––✓ | – | LOW | EXCLUDED §3 Meinungsbeitrag (A und B) |
| ewt3 | ewt-gilburt | 14.06.2025 | SPX→SPY | MIXED | ✓✗✓–✓✓ | Welle → UNKNOWN | MEDIUM | EXCLUDED §2.2 |
| ewt4 | ewt-gilburt | 29.12.2025 | „Metalle“ | – | ––––– ✓ | – | LOW | EXCLUDED §3 Meinungsbeitrag (A und B) |

Revisionsketten: Im Pilot wurde keine spätere Fassung derselben Quelle zum selben Markt gezogen (`LATER_REVISION` 0). Cross-Posts: EWF-Artikel betten YouTube-Videos ein; ob das Video dieselbe Analyse ist, ließ sich wegen der Sperre nicht prüfen → nicht als `crossPosts` eingetragen.

**Ergebnis:** 27 Zeilen in `references.jsonl` — **5 INCLUDED** (ewf 3, tiedje 2), 6 CANDIDATE, 16 EXCLUDED. HKCM-Familie 0 % (blockiert). Quellenfamilien mit INCLUDED: 2 (Gate verlangt ≥ 2, besser ≥ 3). Qualitätsgate: PILOT (Fälle 5 < 100, HIGH-Anteil 20 % < 70 %).

## 4. Extraktionssubjektivität (A↔B, 26 Fälle; Anteil gleich unter den genannten)

| Kernfeld | gleich | abweichend | beide nicht genannt | Übereinstimmung |
|---|---:|---:|---:|---:|
| Musterfamilie | 20 | 2 | 4 | 91 % |
| laufende Welle | 21 | 1 | 4 | 95 % |
| Richtung ab jetzt (A1) | 21 | 2 | 3 | 91 % |
| Invalidation (±1 %) | 12 | 2 | 12 | 86 % |
| Zeitrahmen | 22 | 1 | 3 | 96 % |
| Instrument | 25 | 1 | 0 | 96 % (die eine Abweichung war ein Abgleichfehler „(W)“ → Ticker W, behoben) |

Schiedsdurchgänge: 6 (ewf1, ewf2, ewf7 Muster-Definition; ewf8 Invalidation; ewf12 Zeitrahmen; ewt3 Welle). Typische Abweichungsursachen: (1) welche Struktur „Muster“ ist (→ Nachtrag 3), (2) Text- vs. Chart-Invalidation (EWF zeichnet die Invalidation oft am übergeordneten Wendepunkt, der Text nennt ein näheres Niveau), (3) Richtung, wenn der Text nur die übergeordnete Erwartung nennt und die laufende Teilwelle nur gezeichnet ist (ewf8/10/14, tj3: Agenten folgten dem Chart; beide gleich, aber Restunsicherheit in `ambiguities`).
Sicherheit (alle 27): HIGH 5 · MEDIUM 17 · LOW 5; unter INCLUDED: HIGH 1, MEDIUM 4. MEDIUM statt HIGH wegen Schiedsdurchgang, Plattform-Bearbeitungsmetadaten (`modified_gmt`/`dateModified` > 60 min nach Veröffentlichung; bei EWT bei allen gezogenen Artikeln, vermutlich die 72-h-Freigabe) oder weil keiner der Durchgänge HIGH meldete.

Aufwand: je Durchgang im Mittel ≈ 8 min Agentenzeit (1–15 min), Schiedsdurchgang ≈ 5 min; je Fall ≈ 17–22 min Agentenzeit, parallel ≈ 2 min Wandzeit. Koordination (Rahmen, Zeilen, Prüfung) zusätzlich.

## 5. Probleme und Konsequenzen

1. **YouTube gesperrt (Bot-Prüfung):** HKCM, Phantom by HKCM, More Crypto Online und alle eingebetteten Videos nicht extrahierbar; exakte Upload-Zeitstempel fehlen. Ohne YouTube kein HKCM-Anteil — die Priorität A des Protokolls ist in dieser Umgebung nicht erfüllbar. Benötigt: Umgebung mit nicht gesperrtem YouTube-Zugang (kein Umgehen).
2. **EWF-Öffentlich ist überwiegend Intraday:** 9 von 14 EWF-Fällen tragen die Primärzählung im 1H/4H-Chart (Kategorien „news“/„Chart of the Day“) → §2.2 nicht rekonstruierbar. Tages-/Wochen-/Monatszählungen fast nur in der Kategorie „Stock Market“. Vorschlag für die Skalierung (vorab, ergebnisblind): EWF-Rahmen auf die Kategorie „Stock Market“ ohne „Chart Of The Day“ beschränken oder k verkleinern.
3. **VU-Tagesreihe für US-Aktien nur ab 2025-09-05:** 1D-Aktienfälle davor (PLTR, NVDA) haben keine Tagesdaten bis zum Stichtag → §2.4, nur CANDIDATE. Datenlücke, keine Pipeline-Änderung vorgenommen; eine längere Tagesreihe würde sie benchmarkfähig machen.
4. **Plausibilitätsregel ±60 %** verwarf legitime Welle-II-Invalidierungen in 1W/1M → **Nachtrag 4** (zeitrahmenabhängiges Band; Ankerpunkte Faktor 10/100). Für 1D bleibt ±60 % (CHWY-Blue-Box-Untergrenze → CANDIDATE).
5. **Muster/Familie nicht definiert** → **Nachtrag 3** (enthaltende Struktur der laufenden Welle), plus Präzisierungen zu Sicherheit, Instrumentabgleich, Ausschluss, eingebetteten Videos.
6. **Tiedje:** 92 % der Elliott-Themenbeiträge im Fenster sind ICE-Signaltabellen; unter den gekennzeichneten EW-Analysen viele Rückblicke/Seminarwerbung (3 von 9 gezogenen ausgeschlossen). Mehrfach-Updates in einem Artikel (Solana) → nur die letzte Fassung zählt.
7. **ElliottWaveTrader (Gilburt):** öffentliche Artikel sind überwiegend Meinungs-/Sentimentbeiträge oder Intraday-Updates; 0 von 4 benchmarkfähig. Die Sitemap enthält nicht alle täglichen Updates (Autorenseite ohne Archiv).
8. **Splits:** NVIDIA-Charts von 2023 vs. heute splitbereinigte VU-Reihe → `levelScale` aus Chart-Schluss/VU-Schluss am Stichtag (≈ 0,1), in `ambiguities` begründet (README-Regel).
9. **Testanpassung:** `practitioner-page.test.mjs` prüfte den Leerzustand gegen die echte `references.jsonl`; der Test liefert die Datei jetzt per Route-Abfang leer aus (Verhalten unverändert geprüft).
10. **Kontaminationsrisiko:** Alle Agenten gaben an, den späteren Verlauf grob zu kennen und nicht verwendet zu haben (in jeder Zeile vermerkt). Nicht überprüfbar; Restrisiko bleibt (Nachtrag 2 Punkt 4).

## 6. Schätzung der erreichbaren Fallzahl (bei gleicher Ausbeute wie im Pilot)

| Quelle | E im Rahmen | Pilot-Ausbeute INCLUDED (+CANDIDATE) | erwartbar INCLUDED bei voller Ausschöpfung | Beitrag zu 100+ / 200+ |
|---|---:|---|---:|---|
| ewf | 1.548 | 3/14 ≈ 21 % (+3) | ≈ 300 (mit Kategorie-Einschränkung höhere Quote) | 100+: ja (k ≈ 5); 200+: ja (k ≈ 2–3), dann aber EWF-dominiert |
| tiedje | 95 | 2/9 ≈ 22 % (+3) | ≈ 20 (≈ 35 mit längerer Aktien-Tagesreihe) | Ergänzung |
| ewt-gilburt | 41 | 0/4 | ≈ 0–5 | kaum; ggf. andere EWT-Analysten (Golembesky, Wilday) als eigener Rahmen |
| hkcm | 481 | – (blockiert) | unbekannt; bei 30–40 % ≈ 150–190, Deckel 40 % | 200+ realistisch nur mit HKCM |
| phantom-hkcm | 83 | – (blockiert) | ≈ 10–25 | Familie hkcm |

100+ eingeschlossene Fälle sind mit EWF + Tiedje allein möglich, aber mit nur zwei Familien und starker EWF-Dominanz; 200+ mit Quellenbalance erfordert YouTube-Zugang (HKCM ≤ 40 %) und eine dritte Familie. Der HIGH-Anteil (Gate 70 %) ist unter den jetzigen Regeln unwahrscheinlich (Pilot 20 %), v. a. wegen Plattform-Bearbeitungsmetadaten und nicht ausdrücklich benannter Primärzählungen.
