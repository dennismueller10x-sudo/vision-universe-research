# Supertrader 3.0 – Darvas, Kullamägi, Pocket Pivot/BGU, Holy Grail: Kontext-Evidenz und Daten-/Quellengrenze

Stand: 21. Oktober 2026. Code: `scripts/supertrader/source-faithful/research/context-evidence.mjs` (`sf3-context-evidence-1.0.0`). Tests: `scripts/supertrader/tests/sf-context-evidence-research.test.mjs`.

Die Method-Engines (`darvas.mjs`, `kullamagi.mjs`, `morales-kacher.mjs`, `holy-grail.mjs`) sind unverändert. Seit #804 gibt es in ihren Verträgen keine offene Implementierungslücke: Jede verbleibende Lücke ist manuell, datenblockiert oder quellenoffen.

## 1. Neue Evidenz für belegte Review-Fragen

| Methode | Review-Frage (Vertrag) | neue Evidenz |
|---|---|---|
| Darvas | `DAR-SF-SELECTION`: stärkste Aktie der Branche | `industryLeadership`: Rang der 252-Sitzungen-Veränderung in der PIT-SIC-Gruppe (Vorsitzung, kausal) |
| Darvas | `DAR-SF-MARKET`: Markttrend und Branchenvertreter | Universums-Breite und Gruppenchart-Evidenz |
| Kullamägi Breakout / EP | `KK-SF-PRIORITY` | Branchenrang und Breite |
| Pocket Pivot | `MOKA-SF-PP-CONTEXT` (Leadership/Thema), `MOKA-SF-EXIT-CONTEXT` (schwacher Markt) | Branchenrang, Breite |
| Buyable Gap-Up | `MOKA-SF-BGU-CONTEXT`, `MOKA-SF-EXIT-CONTEXT` | Branchenrang, Breite |

Regeln für diese Evidenz:
- `withContextEvidence(record, { built, breadth, bench })` hängt die Evidenz nur an. Status, `buyDeclarationAllowed: false` und der Screen bleiben unverändert.
- SIC ist ein VU-Stellvertreter für „Branche“; keine der Quellen verwendet SIC.
- Ein Titel ohne Mitgliedschaft ist `UNKNOWN_MEMBERSHIP`, also weder Führer noch Nachzügler.

## 2. Was je Methode mechanisch bleibt bzw. offen ist

| Methode | mechanisch vollständig (seit #784–#805) | weiterhin offen |
|---|---|---|
| Darvas Box | Box-Zustandsmaschine, beide Bottom-Start-Varianten, Ausbruch, nachgezogener Stop, Komponentenstudie | Auswahl, Volumenurteil, Markt, Größe/Pyramide (manuell); `DAR-SF-BOTTOM-START` quellenoffen |
| Kullamägi Breakout | Momentum-Rang, ADR, Setup-Evidenz, Tagesausbruch | ORH-Einstieg (Intraday, `DATA_BLOCKED`); Teilverkauf/Trail sind Präferenzen (manuell) |
| Pocket Pivot | Volumensignatur, MA-Verletzungs-Evidenz in beiden Lesarten | Kontext, Stop, Größe (manuell); `MOKA-SF-EXIT-VIOLATION` quellenoffen |
| Buyable Gap-Up | Gap ≥ 0,75 ATR, Volumen-Evidenz, Gap-Tief-Referenz | Volumenfenster quellenoffen; Megacap-Ausnahme braucht PIT-Marktkapitalisierung |
| Episodic Pivot | Gap-/Volumen-Evidenz auf Tagesbasis | Katalysator, Eröffnungsvolumen, ORH-Einstieg (`DATA_BLOCKED`), Exit quellenoffen; **keine Tagesbalken-Ersatzlogik** |
| Parabolic Short | Beschleunigungs-Evidenz | Einstieg/Stop (Intraday/VWAP), Leihe (`DATA_BLOCKED`); **kein Short-Backtest ohne historische Ausführbarkeit** |
| Holy Grail | ADX/20-EMA-Setup, Oszillator-Evidenz | Einstieg, Stop, Größe **quellenblockiert** (#709 C13); keine Regel ergänzt |

## 3. Datengrenze (`DATA_FRONTIER`)

Für jede verbleibende Datensperre ist festgehalten: was fehlt, ob es im Snapshot oder im Repository liegt, der kostenfreie und regelkonforme Weg dorthin und was er freischalten würde. Die wichtigsten Punkte:

1. **PIT-Aktienzahl (sec-pit r13) im Snapshot:**
   - Liegt bereits im privaten Store. Ein neuer Capture mit `_validation/sec-pit-r13.json.gz` in `EXTRA_SERIES_KEYS` würde folgende Teile freischalten:
     - kapitalgewichtete Gruppencharts;
     - Megacap-Evidenz für den Buyable Gap-Up.
   - Kostenfrei.
2. **SEC 8-K Item 2.02 (Annahmezeitpunkte):**
   - Liefert einen PIT-Kalender der Ergebnisveröffentlichungen. Damit wären Datum und Vor-/Nachbörslichkeit des EP-Katalysators messbar.
   - „Unerwartet“ braucht Schätzungen; diese sind kostenpflichtig und erfordern eine Owner-Freigabe.
3. **Eingefrorene IEX-Minuten:**
   - Quelle: privater r9-Cache ab 2017.
   - Würden für ORH, Eröffnungsvolumen und VWAP genügen, allerdings nur für den IEX-Anteil, also venue-begrenzt.
4. **Leihe/Locate-Gebühren historisch:** kein freier Weg. Short-Seite (Parabolic Short, Turtle-Short) bleibt blockiert.

`SOURCE_FRONTIER` listet die quellenoffenen Punkte: Holy Grail Einstieg/Stop/Größe, Turtle-Korrelationsmaß, Failsafe-Exit, Darvas-Bottom-Start, MoKa-Verletzung und BGU-Fenster, EP-Exit.
