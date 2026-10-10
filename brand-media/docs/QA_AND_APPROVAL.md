# Qualitätssicherung & Freigabe

| Status | Bedeutung | Übergang |
|---|---|---|
| DRAFT | neu generiert/geplant | → REVIEW nach Selbstprüfung |
| REVIEW | wartet auf Kontrolle | → APPROVED / REJECTED durch benannte Person |
| APPROVED | Identität & Qualität bestätigt | einziger Status, der als Referenz oder im Trailer genutzt werden darf |
| REJECTED | nicht verwenden | Datei bleibt zur Dokumentation, nie referenzieren |

Regeln: Masterreferenz nur mit ausdrücklichem APPROVED. Deutliche Gesichtsabweichung → REVIEW/REJECTED, nie automatisch. Registry-Validierung: `node brand-media/tools/validate.mjs`.

## Identity-Checkliste (je Bild, ja/nein)
Gesichtsproportionen · Augenform/-abstand · Nase · Mund · Haarfarbe/-frisur · Bart · Hautstruktur (keine Glättung) · Körperbau · Kleidung · Hände (5 Finger) · Studio-Kontinuität (Licht, Tisch, Stuhl) · kein Text/Wasserzeichen. Ein „nein“ bei den ersten fünf → REJECTED.

## Video-Checkliste
Gesichtskonsistenz über Frames · natürliche Bewegung · Hände · Kleidung · Studiokontinuität · Lippensync (DE) · Schnitt-Sauberkeit · Audiopegel.

## Dokumentierte Einschränkungen
- Originale 1024×1536 < 1080×1920; Upscale nötig.
- Identitätsvergleich ist visuell/manuell; kein automatisches Face-Matching eingerichtet (optional: Embedding-Vergleich als späterer Schritt, mit Datenschutzprüfung).
- Lange Kamerafahrten erhöhen Identitätsdrift → Shots ≤ 4–5 s, Schnitt statt Fahrt.
- Deutsche Lippensynchronität bei Cinematic-Modus nicht zugesichert (Prompt-getrieben, kein Skript-Feld).
