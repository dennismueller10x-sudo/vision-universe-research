> **ÜBERHOLT (2026-10-11):** Die Wahl von `cinematic_avatar` war falsch; die früheren Trailer liefen mit `heygen-video-1` (ca. 0,03 USD/s). Siehe `COST_DISCREPANCY_ANALYSIS.md`. Dieses Dokument bleibt als Preisbeleg für Cinematic Avatar stehen.

# Cinematic-Test LEA (4 s) – Vorbereitung und Konditionen

Stand 2026-10-11. **Nicht ausgeführt.** Freigabebedingung war: kostenpflichtige Generierung nur, wenn sich die Kosten vorab zuverlässig auf ≤ 2 USD begrenzen lassen. Das ist nicht der Fall.

## Warum nicht begrenzbar
- Die API (`POST /v3/videos`, `type: cinematic_avatar`) hat **kein** Kostenlimit, keinen Dry-Run, kein Schätzfeld; die Antwort nennt keinen Preis (DOKUMENTIERT, `reference/create-video`).
- HeyGens Doku nennt **keinen** USD-Preis für Cinematic.
- Quellen zum Preis (alle UNVERIFIZIERT, Dashboard-Preisliste nicht abrufbar):
  - Drittseite zitiert HeyGens API-Preis-Hilfe: „**7,32 USD je 720p-Video, 17,70 USD je 1080p-Video**“ (Pauschale je Video, nicht je Sekunde).
  - Weitere Drittquelle: pauschal ≈ 7,00 USD je Video (4–15 s).
  - HeyGen-Web (nicht API): 60 Credits (720p) bzw. 150 Credits (1080p) je Video, „unabhängig von der Länge“, Dauer 5/10/15 s.
- Konsequenz: Ein 4-s-Test dürfte **dasselbe kosten wie ein 15-s-Clip (≈ 7,3 USD bei 720p)**, also deutlich über 2 USD. Der Kostenschutz in `tools/heygen.mjs` bricht den Aufruf mit diesen Werten ab (geprüft, Exit 2, nichts gesendet).

## Weitere Unsicherheiten
- **Eignung des Photo-Looks:** HeyGen-Web nennt für „Avatar Shots“ aktuell nur „video-basierte Real-Human-Looks“. Ob unser Photo-Look per API `cinematic_avatar` akzeptiert, ist unbekannt. `supported_api_engines` listet nur avatar_iii/iv/v. Ein Probeaufruf wäre bei Akzeptanz sofort kostenpflichtig.
- Das Modell erzeugt **eigenes Audio** (ungesteuert); wir würden es stummschalten.
- Identität: Looks dienen nur als visuelle Referenz; die Doku macht keine Aussage zur Gesichtstreue.
- 720p (720×1280) statt 1080×1920 ⇒ 1,5-fache Hochskalierung nötig; 1080p kostet laut Drittquelle 17,70 USD (nicht finanzierbar).

## Vorbereitet
- Anfrage: `pipeline/requests/lea_cinematic_test_01.json` (LEA-Look, 9:16, 720p, 4 s, Prompt: gleiche Studiokulisse, Kopf erst seitlich, dann zur Kamera, dezente Schulterbewegung, kein Text).
- Kostenwache: `node tools/heygen.mjs generate --request … --usd-per-clip <Preis> --max-usd <Limit>`.
- Prüfplan nach Generierung (`tools/identity-contact-sheet.py`, `tools/motion-metrics.py`): Kontaktbogen Master vs. Frames alle 0,5 s; Kriterien Gesicht (Proportionen, Augen, Mund, Alter), Haare (Farbe/Länge/Wellen), Kleidung (Blazer, Top, Kette), Studio (Tisch, Stuhl, Tasse, Licht), Hände, Bewegung (natürlich, keine Gummi-Effekte), Schulterbewegung (Messung), Ton stumm. Ergebnis REVIEW, keine Auto-Freigabe.

## Konsequenz für Variante B
Mit ≈ 7,3 USD je Cinematic-Clip (720p, pauschal, unverifiziert) sind **drei getrennte Clips ≈ 22 USD** und übersteigen das Guthaben (14,72 USD). Die frühere Schätzung 10,7 USD beruhte auf einem Per-Sekunde-Preis eines anderen Anbieters und ist **überholt**.

## Optionen (zur Entscheidung)
1. **B′ – ein Mehr-Shot-Clip:** HeyGen unterstützt laut Doku „multi-shot prompts“. Ein 15-s-Clip mit den drei Einstellungen (LEA betritt, DAVID betritt, beide sitzen/Winkelwechsel; beide Looks als Referenz) kostet bei Pauschalpreis ≈ 7,3 USD und wird im Schnitt in S02–S05 zerlegt. Zusammen mit Avatar-V-Dialogen (≈ 1,7 USD) ≈ **9,0 USD**, innerhalb von 14,72 USD, aber **ohne zweiten Versuch** (Rest ≈ 5,7 USD < 7,3 USD). Risiko: Looks nicht akzeptiert, Identitätsdrift, ungesteuertes Audio, einmalige Chance. Dieser Clip wäre zugleich Test und Produktionsmaterial (kein 4-s-Test nötig, da Pauschalpreis).
2. **A – ohne Cinematic:** S01–S05 aus bewegten Master-Stills (Animatic v2 zeigt das Prinzip), Dialoge mit Avatar V. ≈ 1,7 USD, gemessen, sofort umsetzbar, weniger „Film“.
3. **Aufladen** (≈ +10 USD) und B′ mit Reservever­such.
**Empfehlung:** Option 1 nur mit Freigabe von bis zu 7,5 USD für genau einen Clip und dem Wissen, dass die Preise unverifiziert sind; sonst Option 2.
