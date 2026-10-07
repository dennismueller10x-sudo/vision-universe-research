# Mission IX: Öffnungsprotokoll A9_CONFIRM

| Feld | Wert |
|---|---|
| Phase | A9_CONFIRM (Track A, Tagesengine, einmalig) |
| Freeze-Commit | `82fcbca1a05f0305a7679e0ee7d5e1228b5fa9a1` |
| Präregistrierung | `MISSION9_PREREGISTRATION.md`, SHA-256 `4ad35189848d140ffa126ffdcb7cfddd0eb9d79f548e116ed2046a1076ac85ed` |
| Dev-Stage-1 (Siegel, ohne Outcomes) | 1.200 Titel (Hash-Ränge 1200–2399), Symbol-Hash `a9922395…`, 940 auswertbare Reihen, 165.941 Records, Disjunktheit zu Mission VIII geprüft |
| Stand vor dem Öffnen | Track A W_DEV/W_VAL: NO_HIGH_ACCURACY_EDGE. Track B und Wave-3 explorativ ausgewertet (verbrauchte Daten). Keine Track-A-Kennzahl der Tagesstichprobe angesehen. |
| Öffnung | Commit mit Betreff `[hsab9-confirm] freeze=82fcbca…`. Der Workflow prüft Freeze-Diff, Einmaligkeit (alle Branches), HEAD = auslösender Commit und Stichproben-Hash. Die Öffnungsmarke wird vor Stage 2 gepusht. |

Ergebnis: `quant/data/technical-intelligence/historical-accuracy/mission9/ci/a9-confirm-tracka.json` (Entscheidung `decision`) und `a9-confirm-eval.json`. Bewertung im Abschlussbericht.
