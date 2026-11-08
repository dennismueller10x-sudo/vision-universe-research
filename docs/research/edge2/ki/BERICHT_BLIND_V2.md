# Blind v2 (Großwerte, quartalsweise): Bericht

**Forschung, nicht zertifiziert.** Protokoll [BLIND_V2_PROTOKOLL.json](BLIND_V2_PROTOKOLL.json) (SHA `ded4a1fd…`), 43 anonyme Quartalspakete aus den 500 größten Werten point-in-time (`blind-v2/packets.json`, Lauf 42238575614).

## Ergebnis: Erkennungstest nicht bestanden, Backtest abgebrochen

Für den Erkennungstest haben zwei eigene Subagenten je 10 Pakete bekommen, also die ersten 20 nach Paket-ID, und sollten Jahr und Firma raten. Die Schwellen stammen unverändert aus v1.

| Kriterium | Grenze | Ergebnis | bestanden |
|---|---|---|---|
| Jahr exakt erraten | höchstens 25 % | 30 % (6 von 20) | **nein** |
| mittlerer Jahresfehler | mindestens 2,0 Jahre | 2,7 Jahre | ja |
| Firma korrekt benannt | höchstens 2 % | 0,1 % (1 von 1.000, NVDA) | ja |

Nach Protokoll gilt der Test damit als **wertlos**. Es werden keine Entscheidungen getroffen, und das Vorwärts-Depot A2 startet nicht. Depot A (v1) läuft unverändert weiter.

## Einordnung

- Bei Großwerten tragen die Pakete mehr Zeitinformation als bei v1. Markt- und Faktorphasen (Corona 2020, Zinswende 2022, die Rally der großen Tech-Werte 2023/24) sind am gemeinsamen Muster der 50 Großwerte eher zu erkennen. Einzelne Firmen erkennt das Modell dagegen kaum.
- Ein Sprachmodell kennt diese Jahre. Ohne verlässliche Anonymisierung lässt sich nicht ausschließen, dass es aus Wissen über die tatsächliche Entwicklung wählt. Deshalb wird nicht weitergerechnet.
- Eine Folgestudie bräuchte eine stärkere Anonymisierung, zum Beispiel kürzere Pfade, nur Querschnittsränge ohne Zeitverlauf oder gemischte Zeitfenster je Kandidat. Dazu gehört eine neue Vorregistrierung mit neuem Erkennungstest. Ob die Daten dann noch genug Information für die Auswahl tragen, ist offen.
