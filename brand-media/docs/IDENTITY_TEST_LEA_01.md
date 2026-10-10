# Identitätstest LEA 01 (2026-10-10)

**Ergebnis: REVIEW – vielversprechend, nicht freigegeben.** Weitere Figuren werden nicht automatisch produziert.

## Setup
- Master: `originals/lea_master_original.png` → HeyGen-Asset `5e9787a3…`, Photo Avatar „VU LEA“ (Gruppe/Look `5962a9dd56595ecc894cd10ceac004eb`).
- Video: `POST /v3/videos`, Avatar IV, Photo Avatar, 9:16, 1080p, `fit=cover`, `expressiveness=medium`, Motion-Prompt (Kopf zur Seite → zur Kamera), deutsche Stimme „Lea“ (`becf484d…`), Skript „Andere raten. Du verstehst.“
- Ergebnis: `video/tests/lea_idtest_01.mp4`, 1080×1920, 25 fps, 2,48 s, H.264 + AAC. HeyGen-Video-ID `bcd7a38e…`. Ein einziger Versuch.
- Belege: `video/tests/lea_idtest_01_strip.png` (5 Frames), `…_frame1500ms.png`.

## Befund (visuell, Frames gegen Master)
| Kriterium | Bewertung |
|---|---|
| Studio-Kontinuität | sehr gut: Raum, Tisch, Stuhl, Tasse, Licht, Boden wie im Master |
| Kleidung | sehr gut: Lederjacke, schwarzes Top, Hose, Stiefeletten, Kette, Uhr unverändert |
| Gesicht/Identität | gut, Haar/Teint/Kopfform erkennbar identisch; in einzelnen Frames wirkt das Gesicht etwas älter bzw. schmaler als im Master (Wangen, Augenpartie) – Abweichung leicht, aber vorhanden |
| Kopfdrehung | wie gefordert: Start Blick seitlich/nach unten, dann Zuwendung zur Kamera |
| Augen | im Start-Frame geschlossen/gesenkt, im Mittelframe leicht zusammengekniffen – wirkt nicht ganz natürlich |
| Hände | fünf Finger, ruhig, kein Artefakt sichtbar |
| Haut | Poren sichtbar, nur mäßige Glättung |
| Lippenbewegung | Mundbewegung in den Frames plausibel; **Lippensync und Stimme nicht beurteilt** (Audio wurde nicht abgehört) |
| Bildausschnitt | Gesicht nur ~10 % der Bildhöhe → bei 1080p wenig Gesichtsdetail; Nahaufnahmen brauchen eigene Looks/Crops |
| Dauer | 2,48 s (Sprechdauer); die geforderten ≤ 5 s sind eingehalten, kein Rest-Footage vor/nach dem Satz |

## Offene Prüfungen für dich
1. Video ansehen und **Audio/Lippensync** und Stimmwahl beurteilen.
2. Entscheiden: Identität ausreichend (→ APPROVED für diese Methode) oder nicht.

## Kosten
Avatar-Anlage (Photo Avatar): **1,32 USD** (3,67 → 2,35). Testvideo: **0,08 USD** (2,35 → 2,27). Rest-Wallet: **2,27 USD**. Hochladen der Bilder: 0 USD. Der Preis der Avatar-Anlage war vorab nicht dokumentiert (die API-Doku nennt keinen); er wurde erst nach dem Abbuchen bekannt.
