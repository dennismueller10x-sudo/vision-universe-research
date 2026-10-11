# LEA – Avatar V vs. Avatar IV

## Status: Avatar-V-Test **nicht ausgeführt**
Freigabe war: ein Test bis 0,50 USD, **sofern der tatsächliche Preis vorher zuverlässig ermittelt werden kann**. Das ist nicht der Fall:
- Die offizielle Preistabelle liegt nur im Login-Dashboard (`app.heygen.com/developers/api?modal=pricing`), nicht abrufbar.
- HeyGens Blog nennt 0,0667 USD/s für **Avatar V Digital Twin**, nicht für Photo Avatars. Zwei eigene Messungen weichen von den Blogzahlen ab (Avatar-Anlage 1,32 statt 1,00 USD; Avatar IV 0,039 statt 0,05 USD/s).
- Doku und API widersprechen sich, ob Avatar V mit einem Photo Avatar läuft (Doku: nur Digital Twin; API: `avatar_v` für `5962a9dd…` gelistet).
- Wallet vor Test: **1,80 USD** (geprüft 2026-10-11).

Abschätzung ohne Gewähr: Skript ≈ 5 s Sprechzeit ⇒ bei 0,0667 USD/s ≈ 0,33 USD, bei einem Aufschlag wie bei der Avatar-Anlage (+32 %) ≈ 0,44 USD, Obergrenze knapp unter 0,50 USD. Das ist keine verlässliche Preisermittlung. Daher gestoppt.

**Vorbereitet:** `brand-media/pipeline/requests/lea_avatar_v_compare_01.json` (gleicher Avatar, gleiche Stimme `becf484d…`, 9:16, 1080p, kein Motion-Prompt, weil V diesen ohne Referenz-Look ablehnen kann). Ausführung mit Kostenwache:
`node brand-media/tools/heygen.mjs generate --request brand-media/pipeline/requests/lea_avatar_v_compare_01.json --usd-per-sec 0.0667 --est-sec 5.5 --max-usd 0.50 --out result.json` (Proxy-Umgebung: `NODE_USE_ENV_PROXY=1`). Das Skript bricht ab, wenn Schätzung oder Wallet nicht passen, und schreibt die tatsächlich abgebuchten Kosten.

**Zur Freigabe nötig:** Bestätigung, dass der Test mit dem Blogpreis als Schätzung laufen darf (Obergrenze 0,50 USD, tatsächliche Kosten werden gemessen und dokumentiert).

## Baseline Avatar IV (vorhanden, objektiv gemessen)
`tools/motion-metrics.py`: mittlere Pixelbewegung je Region (12 fps, 270×480). Nur Bewegungsmenge, **keine** Aussage zu Natürlichkeit oder Identität. Regionen sind auf die Masterkomposition kalibriert.
| Clip | Kopf/Gesicht | Schultern/Oberkörper | Hände/Arme | Hintergrund (Kontrolle) |
|---|---|---|---|---|
| Test 01 (2,48 s, Motion-Prompt Kopfdrehung) | 11,37 | 3,15 | 1,64 | 0,27 |
| Clip 15 (12,15 s, 28 Wörter) | 7,29 | 1,41 | 0,67 | 0,26 |
Der Oberkörper bewegt sich im längeren Clip nur ≈ 5× stärker als das Bildrauschen, das Gesicht ≈ 28×. Das stützt die Sichtung „Körper starr“.

## QA-Matrix Avatar IV gegen Avatar V
`Prüfart`: **S** = Sichtprüfung durch mich anhand von Standbildern, **A** = Hörprüfung (nicht durchgeführt), **M** = Messung, **–** = offen.
| Kriterium | Avatar IV (Clip 15) | Prüfart | Avatar V |
|---|---|---|---|
| Gesichtskonsistenz | Haar, Teint, Kopfform erkennbar identisch zum Master; einzelne Frames wirken schmaler/älter | S | nicht getestet |
| Natürlichkeit der Haut | Poren sichtbar, mäßige Glättung | S | – |
| Augenbewegungen | Start-Frames teils geschlossen/zusammengekniffen | S | – |
| Lippenbewegungen | Mundbewegung plausibel; Sync **nicht beurteilt** | S (nur Standbild) | – |
| Mimik | zurückhaltend, wirkt „KI-typisch“ laut Auftraggeber | Auftraggeber | – |
| Kopfbewegungen | vorhanden (Motion-Prompt wirkt) | S/M | – |
| Schulterbewegungen | kaum | M (Faktor ≈ 5) | – |
| Oberkörperbewegungen | kaum | M | – |
| Stimmqualität | **nicht beurteilt** | A (offen); Auftraggeber: „künstlich“ | – |
| Synchronisation | **nicht beurteilt** | A (offen) | – |
| Gesamteindruck als echter Mensch | Auftraggeber: „sofort KI“ | Auftraggeber | – |

Keine automatische APPROVED-Einstufung. Freigabe liegt beim Auftraggeber. Status der Clips: **REVIEW**.
