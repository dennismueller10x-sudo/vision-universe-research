# Gruppe E (Inventar) – Notizen

- Registry (supertrader/data/registry.json) hat 12 Strategien (registryVersion supertrader-registry-1.0.0); dazu 1 Hausstrategie ausserhalb der Registry. Nicht 30.
- LIVE_ENGINES = 5 (build.mjs:86); Trend52 laeuft ueber trend52-live.mjs (nicht in LIVE_ENGINES); HS4-V03 ueber house/live.mjs. Ledger-Dateien auf origin/main: 7.
- Doku-Drift: Weinstein 4.0.0 in DECISION-R11 = RESEARCH, in DECISION-R13 = LIVE. PRODUCT_MATRIX (Stand 01.10.) nennt Turtle v1.1.0 und "vier Methoden live"; Code live = 2.0.2 und 5+2 Systeme.
- Minervini 3.0.0 (EPS-Filter) liegt als Engine vor, ist nicht live. Turtle 2.1.0 RESEARCH, 2.0.1 WITHDRAWN (donchian-v201 ist trotzdem als Datei vorhanden).
- KK-Ablation (3.0.0-A) ist reine Gegenprobe, nie live (kk-breakout-ablation-r8.mjs:1).
- Greenblatt: Engine-Datei rechnet kein Ranking (greenblatt.mjs:9-13); Pflichtfelder fehlen. Als RESEARCH gefuehrt, praktisch Datenvertrag.
- MARKET_WIZARDS_NEXT ist keine Methode: Sammelkarte, Quelle nur Verlags-Vorschau. Tier D, kein Loeschauftrag.
- Episodic Pivot: Karte ohne Regeln, aber Regeltext in source-ledger.json (~887) und R15-Dokumenten vorhanden; Daten (News/Konsens) fehlen.
- Keine Methode zu Livermore, Elder, Ritchie, Morales, Kacher, Zanger, Raschke im Repo (nur Kacher/Greenblatt/B. Weinstein als Fondsmanager-Metadaten in scripts/hedgefonds/fund_meta.py).
- Repo-weit nur REFERENCE/DOCUMENTED_ONLY: Quant Strategy Library (5 Stilstrategien), Strategy-Match-Profile, strategy-packs.js PLANNED-Tokens (Interface, "keine einzige Regel", Lost-Work-Register:64), Weinstein-Stufe in dow-trend.js, Elliott.
- Frage an Koordinator: Soll HS4-V03 (Faktormodell, kein Trader) in die 30-Methoden-Triage zaehlen? Ich zaehle es separat (13 Eintraege, davon 10 mit Regeln/Engine).
- Nicht gelesen: *.sealed.json, keine Messlaeufe. Sparse-Checkout enthaelt kein supertrader/data/ledger; Ledger-Existenz nur per git ls-tree origin/main belegt.
