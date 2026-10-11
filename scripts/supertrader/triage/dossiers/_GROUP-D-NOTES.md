# Gruppe D Notizen (Weinstein, Minervini-Referenz)

Lesezugriff, keine Messläufe, keine *.sealed.json geöffnet.

## Auffälligkeiten
- Weinstein: Fremd-Sizing (0,5 % Risiko aus backtest.mjs:11) ist per portfolio-policy.mjs:88 (LEGACY_IMPLICIT) nur als Altfall geduldet, nicht behoben.
- Rechnung: 0,5 % / 15-27 % Stopabstand = ca. 2-3 % je Position, 10 Plätze => höchstens ca. 30 % investiert. Der Stopabstand-Mittelwert (17 %) ist nur als Text belegt, nicht gemessen.
- Stille Fallbacks: weinstein-v3.mjs:52-55,71, weinstein-v2.mjs:77-83 (fehlende Daten bestehen), weinstein-v3.mjs:40 (Triggerrückfall auf Wochenschluss), weinstein-v4.mjs:48 (5-Tage-Schätzung).
- classifyStage-Übergangszweig (weinstein.mjs:47) stuft fallende MA30 mit Kurs darüber als Stufe 2; Fortsetzungsregel prüft nur "Stufe 2" (weinstein-v4.mjs:15). Vermutlich unbeabsichtigt, Wirkung UNKNOWN.
- Zwei Flachheits-Toleranzen (0,5 % vs 1,0 %, weinstein.mjs:34-36 vs :56).
- Live-/Backtest-Unterschied: Wochenvolumen live nur ca. 1 Jahr; im Backtest über das ganze Tagesfenster. WEIN-VOL-04 greift live außerhalb nie.

## Doku vs Code
- registry.json variants (Weinstein) zeigen noch 1.1.0-Text (Volumen 1,5x). Gleiche Datei hat trailing_stop/position_sizing/volume_filters bereits ehrlich (Phase 1). process-chain.mjs:29,33-35 laut R15 weiter falsch; im Sparse-Checkout nicht selbst geprüft (process-chain.mjs liegt vor, nur nach R15-Aussage übernommen).
- R14-Text sagt, WEIN-VOL-04 beende drei Viertel der Trades; R15 stellt klar: die Regel ist im Kern original, Fall B betrifft den MA30-Ausstieg. Beide gelten, die R14-Zuschreibung ist enger.
- R13 "fast nur Cash" wurde in R14 nur PARTIALLY_CONFIRMED; R15 ordnet es als Sizing-Artefakt ein.
- R11 "4.0.0 verfehlt" ist überholt (S1C), steht aber noch in DECISION-R11.json.
- Minervini: registry variants (MINERVINI_TT_VCP_A, 25 %) widersprechen live 2.0.0 (30 %, MIN-LOW-02). Minervini-Policy nennt SRC-MM-X-RISK "Zahl nicht verifiziert", Engine-Kommentar nennt sie "primär".

## Minervini-Fallsatz
- Vorgegebener Recall 3/15 (20 %) ist im Repo nicht auffindbar. Repo kennt R10 mit 19 Gewinnern (11 nie Kandidat, 7 ohne Einstieg, 1 ohne Platz). Als gegeben übernommen, Herkunft UNKNOWN.

## Fragen an den Koordinator
1. Tier-Definition A-D nicht im Schema; ich nahm A = priorisieren, B = bedingt/umbauen, C = nicht priorisieren, D = einstellen. Bitte bestätigen.
2. Weinstein Tier B mit deep_dive_candidate=true: Soll eine Dekontaminations-Standardmessung (Signalstudie, Sizing-Sensitivität, Exit-Isolation) eingeplant werden, oder ist Weinstein nur zu rahmen ("Einstiegsidee")?
3. Soll process-chain.mjs im Triage-Worktree nachgeprüft werden (R15-Aussagen wurden nur übernommen)?
4. Ist der Prüfplan-Gate (20 Jahre) für WEINSTEIN_STAGE2_WEEKLY in der Praxis erfüllt? Daten dazu liegen nicht öffentlich vor.
