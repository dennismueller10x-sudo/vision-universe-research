# Supertrader 7.0 – Full Strategy Completion & Certification Accelerator: Abschlussbericht

Stand: 24. Oktober 2026, ergänzt am 25. Oktober 2026 um die Umsetzung der Eigentümerentscheidungen E7-1 bis E7-7 (Abschnitt 0).
- **Basis:** `main` nach Supertrader 6.0 (`c6fad12`, #881); Zweige ab `304f917`, `main` jeweils per Merge-Commit nachgezogen.
- **Snapshot:** DEV `sts1-134d4d62eb88b6ff8d98fe6e56b12a6d`, Abrechnung `research-v1`.

Alle historischen Aussagen sind `DIAGNOSTIC_NOT_CERTIFIED`. Alle 13 Strategien sind `LIVE_NOT_APPROVED`. Es gibt keine Orders, keine Brokeranbindung und keine Performanceaussage. Kennzahlen liegen versiegelt beim Eigentümer; öffentlich sind nur Zählungen und Hashes.

Maschinenlesbar:
- Abschlussmatrix: [SUPERTRADER_7_COMPLETION_MATRIX.md](SUPERTRADER_7_COMPLETION_MATRIX.md), Artefakt `STRATEGY-SF7-COMPLETION.json`. Der Builder liest die maschinellen Felder aus der 6.0-Readiness (Kriterien 1.2.0, mit den 7.0-Eingaben neu gebaut). Keine Note ist von Hand gesetzt.
- Teilberichte:
  - [SUPERTRADER_7_MINERVINI_SOURCE_INVENTORY.md](SUPERTRADER_7_MINERVINI_SOURCE_INVENTORY.md) (Workstream C);
  - [SUPERTRADER_7_EXECUTION_AND_STRATEGIES.md](SUPERTRADER_7_EXECUTION_AND_STRATEGIES.md) (B/D/E/F);
  - [SUPERTRADER_7_V4D1_RESOLUTION.md](SUPERTRADER_7_V4D1_RESOLUTION.md) (A);
  - [SUPERTRADER_7_MINERVINI_FINDINGS_CLASSIFICATION.md](SUPERTRADER_7_MINERVINI_FINDINGS_CLASSIFICATION.md) (E7-2);
  - [SUPERTRADER_7_OPTIMISTIC_FIXES.md](SUPERTRADER_7_OPTIMISTIC_FIXES.md) (E7-3, #911);
  - [SUPERTRADER_7_OWNER_DECISIONS_E7.md](SUPERTRADER_7_OWNER_DECISIONS_E7.md) (Vorlagen E7-1 und E7-4 bis E7-7).

---

## 0. Umsetzung der Eigentümerentscheidungen vom 25.10.2026

| | Entscheidung | Umgesetzt | Wirkung |
|---|---|---|---|
| E7-1 | Keine pauschale Quarantäne-Lesart. Prüfen, welche CC-5-Teilkriterien bei Exposition 0 erfüllt sind. Memo zu einer lizenzierten CA-Quelle, ohne Bestellung. | Die CC-5-Teilkriterien a bis f stehen je Referenz in der Matrix. SEPA erfüllt a und b, Weinstein Investor a. Kein Referenzwert erfüllt e (Splits unter dem Faktor 3 sind unsichtbar) oder f (Holdout nicht gerechnet). Das Anbieter-Memo liegt in `SUPERTRADER_7_OWNER_DECISIONS_E7.md`. | CC-5 bleibt für alle 13 offen. Es gibt keine Aufwertung. |
| E7-2 | Zwei Übersetzungen gelten als Beleg, aber nicht als `SOURCE_EXACT`. Die 154 Befunde werden klassifiziert, belegbare Verbesserungen umgesetzt. | 36 bestätigen, 14 präzisieren, 17 sind neu umsetzbar, 54 qualitativ, 33 nicht relevant. Umgesetzt sind 9 Punkte, nur Diagnosen und Belege (`sf7-minervini-1.3.0`). Die Übersetzungsübereinstimmung steht als `CROSS_TRANSLATION` im SEPA-Vertrag 1.4.0. Maßgeblicher Lauf ist 40172178386 (#899). | REF ist ledger-identisch. CC-1 bleibt offen. |
| E7-3 | D3/D4 in den optimistischen Varianten korrigieren, Referenzen schützen, SF6-PAPER-2027 neu versionieren, aber nicht aktivieren. | Neue Lesarten `OPTIMISTIC_CERTAIN_RULE` (Turtle, `sf-turtle-1.3.0`) und `SF7-ALT-INTRABAR-OPTIMISTIC-CLOSE-RULE` (Minervini). Die alten Lesarten laufen weiter als „ersetzt“. SF6-PAPER-2027 1.1.0 ist `PREPARED_NOT_ACTIVE`. Läufe 40170829944 und 40170832007 (#911). | Alle Referenzen und alle bisherigen Varianten sind hashgleich. |
| E7-4 bis E7-7 | Optionen vorbereiten. Ohne ausdrückliche Zustimmung gibt es keinen Snapshot-Capture, keine kostenpflichtige Quelle, keine Intraday-Massenabrufe und keine verbindliche Minervini-Ausstiegsregel. | Optionen, Empfehlung, Betroffene, Budget und Readiness-Wirkung stehen in `SUPERTRADER_7_OWNER_DECISIONS_E7.md`. | Nichts ausgelöst |

Vorher/Nachher der korrigierten optimistischen Varianten. Das sind Zählungen; die Kennzahlen bleiben versiegelt.

| Variante | vorher (ersetzt) | nachher |
|---|---|---|
| Turtle S1 optimistisch | 786 Trades | 862 Trades (99 sichere Stops) |
| Turtle S2 optimistisch | 528 Trades | 489 Trades (61 sichere Stops) |
| SEPA optimistisch | 987 Trades | 977 Trades |
| Power Play optimistisch | 929 Trades | 931 Trades |

Die Ergänzung hatte zwei unabhängige Reviews:
- **E7-2-Code:** 1 HIGH, 3 MEDIUM, 6 LOW. Das HIGH: Diagnosen lasen die Ausstiegssitzung mit.
- **#911:** 0 HIGH, 1 MEDIUM, 5 LOW.

Alle Befunde sind behoben oder begründet dokumentiert.

---

## Management-Zusammenfassung

**Welche Strategien sind gegenüber 6.0 tatsächlich weitergekommen?**
- **Minervini SEPA und Power Play:**
  - Erstmals gibt es eine Quelleninventur je Regel. Alle drei bereitgestellten Bücher sind byte-identisch vorhanden und vollständig neu gelesen (346 Befunde).
  - Die englischen Minervini-Antworten (W-MIN18) stehen jetzt in den Verträgen.
  - Drei Quellendifferenzen sind präzise belegt, eine davon ist zugunsten der Referenz aufgelöst.
  - Drei quellengestützte Forschungsvarianten und zwei Diagnosen laufen auf dem Snapshot. REF ist ledger-identisch.
- **Darvas, Holy Grail, Weinstein:**
  - Ein Fehler der gemeinsamen Ausführungsengine ist gefunden (SF7-D1): Stops am Einstiegstag galten als „mehrdeutig“, obwohl der Schlusskurs sie belegt.
  - Bei Darvas sind 8.596 von 17.002 angenommenen Stops tatsächlich sicher. Korrigiert ist das als Variante; die Referenzen bleiben unverändert.
- **Episodic Pivot:**
  - Die versiegelten EP-Trade-Kennzahlen waren leer (SF7-D2). Behoben.
  - Die optimistische Minutenregel übersah sichere Stops (SF7-D5). Behoben als Variante, Cache-Lauf mit 0 Abrufen.
- **V4-D1 (alle elf messbaren Referenzen):**
  - Erstmals gibt es eine prüfbare, versionierte Klassifikation mit Korrektur-Overlay und Quarantäne sowie sec-pit r14 mit Bilanz-Aktienzahlen.
  - Ergebnis nach drei unabhängigen Prüfrunden (Regelsatz 1.3.0): Mit freien Daten ist **kein** nicht deklarierter Split faktorgenau belegbar. Aktienverhältnis und Eröffnung trennen N nicht sicher von N±1, und Tiingos adjClose trägt den Faktor in diesen Fällen nicht. Das Overlay ist deshalb leer.
  - Belegt sind 2 echte Bewegungen (DQ-K3).
  - Alle 83 referenzexponierten DQ-K5-Sitzungen bleiben ungeklärt und in Quarantäne. Der einzige verbleibende Hebel ist eine lizenzierte Corporate-Action-Quelle; dafür braucht es Ihre Kostenfreigabe.
  - Hinter Minervini SEPA und Weinstein Investor liegt keine exponierte Sitzung.

**Was ist endgültig gelöst?**
- Die Frage, ob Minervini-Material fehlt. Es ist vollständig vorhanden; es fehlt nur der englische Buchwortlaut.
- Der Extraktionsfehler W-MIN18.
- Der Power-Play-VCP-Konflikt (B12 S. 341 / B03 S. 189).
- SF7-D1 (als Variante), SF7-D2, SF7-D5 (als Variante).
- Die Frage, ob freie Daten V4-D1 faktorgenau lösen können: nein, mit Nachweis (Regelsatz 1.3.0, Regressionstests für jeden gefundenen Fehlerfall). Für 2 Sitzungen ist die echte Bewegung belegt. Die Infrastruktur nimmt eine lizenzierte Quelle ohne Umbau auf.

**Was bleibt bestehen?**
- **V4-D1:** alle 83 exponierten DQ-K5-Sitzungen sind ungeklärt. Die beiden kostenfrei lösbaren Restgruppen sind bearbeitet und belegen nichts weiter: Datumsverschiebung und Bilanz-Aktienzahlen (Abschnitt 4). Weiter kommt nur eine lizenzierte zweite CA-Quelle oder Ihre Entscheidung über die Quarantäne.
- **CC-1 Minervini:** Der englische Buchwortlaut fehlt im Projekt.
- **CC-3:** Die manuellen Quellenentscheidungen bleiben (alle außer Turtle).
- **CC-4:** IBD-RS, PIT-Branchen- und Korrelationsgruppen fehlen.
- **CC-8:** SF6-PAPER-2027 ist frühestens Ende 2027 auswertbar.
- **Ausführungsdefekte:** SF7-D3 (Turtle) und SF7-D4 (Minervini) sind seit E7-3 als versionierte Varianten behoben (#911). Die Referenzen sind unverändert.

**Welche Strategien liegen der Zertifizierungsfähigkeit am nächsten?**
- Unverändert Turtle S2 (offen CC-4, CC-5, CC-8).
- Danach Kullamägi Breakout (CC-3, CC-5, CC-8) und Turtle S1.
- Minervini SEPA hat als einzige Referenz zusammen mit Weinstein Investor keine V4-D1-Exposition. Bei SEPA scheitert CC-1 aber an der Übersetzungslage und CC-3 am Ermessen.

**Welche nächsten Entscheidungen bringen den größten Fortschritt?** Siehe Abschnitt 17:
1. **CC-5-Lesart:** ob 0 exponierte Sitzungen genügen;
2. **CC-1 Minervini:** englische Ausgabe oder Übersetzungsbelege;
3. **Ausführungsdefekte in gepinnten Engines:** erledigt (E7-3, #911);
4. **V4-D1-Folge:** lizenzierte Corporate-Action-Quelle (Kosten) und danach eine neue Snapshot-Generation;
5. **Datenquellen:** PIT-Korrelations- bzw. Branchengruppen.

---

## 1. Executive Summary

Supertrader 7.0 hat drei geprüfte Draft-PRs und einen Abschluss-PR:

| PR | Workstream | Kern |
|---|---|---|
| #899 | C Minervini | Quelleninventur je Regel; W-MIN18 in den Verträgen; Varianten Flat Base, TT6-25 %, RS-Linie; Diagnosen; REF ledger-identisch |
| #898 | B/D/E/F Ausführung, übrige Strategien | SF7-D1 (gemeinsame Engine, als Variante), SF7-D2 (EP-Kennzahlen), SF7-D5 (EP-Minutenregel, als Variante), D3/D4 charakterisiert; alle Referenz-Hashes reproduziert |
| #902 | A Datenintegrität | V4-D1-Klassifikation mit SEC-Aktienzahlen und Tiingo-Split-Feldern, versioniertes CA-Overlay, Quarantäne des Ungeklärten; BASE hash-identisch für alle 11 Referenzen |
| (dieser) | G Abschluss | Abschlussmatrix 13 × 12 Fragen, dieser Bericht, Freigabevorlage |

Kein Gate wurde abgeschwächt, und kein Test wurde geändert, um eine Implementierung grün zu machen. Die Testanpassungen sind im jeweiligen PR einzeln begründet und von unabhängigen Reviews als legitim bestätigt. Es gibt keine offenen CRITICAL- oder HIGH-Befunde.

## 2. Ausgangszustand aus Supertrader 6.0

- 11 messbare Referenzen sind reproduzierbar (Ledger-Hash 11/11).
- V4-D1 war eingegrenzt, nicht gelöst (E1).
- 0 von 13 Strategien sind `CERTIFICATION_CANDIDATE`.
- Minervini galt als „nur über Übersetzungen, mittlere Konfidenz, alle Regeln abgeleitet“.
- `IMPLEMENTATION_GAP` 0.

## 3. Tatsächlich behobene technische Fehler

| ID | Ort | Fehler | Behebung | Wirkung |
|---|---|---|---|---|
| SF7-C1 | `evidence/psr709-extract.mjs` | Methodenkontext `SEPA2018` nicht zugeordnet: die 9 einzigen englischen Minervini-Zeilen fehlten in den Verträgen | Kontext ergänzt, Extrakt neu gebaut | +9 Regeln, alle 132 Minervini-Zeilen zugeordnet |
| SF7-D1 | `research/lifecycle-engine.mjs#fillOrder` | Buy-Stop-Füllung durch Berührung und Schluss am oder unter dem Stop wurde als mehrdeutig behandelt; OPTIMISTIC hielt sicher ausgestoppte Positionen | Revision hinter Adapter-Flag, neue Varianten (`sf7-execution-variants.mjs`) | Referenzen unverändert; Darvas 8.596 sichere statt angenommene Stops, Holy Grail 127, Weinstein 1 / 4 |
| SF7-D2 | `run-kk-intraday.mjs#epTradeSummary` | versiegelte EP-Trade-Kennzahlen lasen `realizedPnl` statt `pnl` (leer) | behoben | nur versiegelte Werte |
| SF7-D5 | `kk-ep-lifecycle.mjs` | optimistische Minutenregel übersah einen sicheren Stop in der Füll-Minute | Variante `SF7-ALT-FILL-MINUTE-OPTIMISTIC-CERTAIN-RULE` | 21 sichere Stops; EP-Referenz identisch |
| SF7-A1 | `run-sf7-ca-resolution` (eigene 7.0-Arbeit) | Abgleich las 6.0-Hashes am falschen Ort | behoben, Test | – |
| Review A | `integrity/ca-resolution.mjs` (eigene 7.0-Arbeit) | 4 HIGH in drei Runden (falscher Faktor bestätigbar, auch über Aktiendrift und Kursrückgang; echte Bewegung ohne Volumen- und Einreichungsprüfung), 6 MEDIUM, 15 LOW | Regelsätze 1.1.0 / 1.2.0 / 1.3.0, alle mit Tests | strengere Klassen (Abschnitt 4) |
| Review C | `minervini-sf7.mjs` (eigene 7.0-Arbeit) | 1 HIGH (zunächst unbelegte `SOURCE_EXACT`-Aufwertung), 6 MEDIUM, 7 LOW | alle behoben | siehe #899 |

## 4. Fortschritt bei V4-D1

Ergebnis von #902:
- Maßgeblicher Lauf **40122736287**, Regelsatz 1.3.0. Alle Regeln sind vor dem Lauf committet (`38a2a8c2d`), der Hash des vollen Regelsatzes `08d8a6ec…` ist im Test gepinnt.
- Vorläufer: 40104626083 (1.0.0), 40111713883 (1.1.0), 40118088867 (1.2.0).
- sec-pit r14 aus Lauf 40110748496: derselbe EDGAR-Bulk-Mechanismus wie bisher, 0 Kosten, SHA `a02c1847…`.
- 19 EDGAR-Indizes gelesen; die Einträge liegen versiegelt vor.
- BASE ist hash-identisch für alle 11 Referenzen, alle 44 Läufe sind abgestimmt.

| | DQ-K5 1.0.0 → 1.1.0 → 1.2.0 → 1.3.0 | DQ-K3 1.0.0 → 1.1.0 → 1.2.0 → 1.3.0 |
|---|---|---|
| markierte Sitzungen | 1.210 | 2.521 |
| `CONFIRMED_UNDECLARED_SPLIT` | 6 → 7 → 1 → **0** | 6 → 7 → 1 → **0** |
| `CONFIRMED_MISDATED_DECLARED_SPLIT` (neu) | – → 0 → 0 → **0** | – → 0 → 0 → **0** |
| `CONFIRMED_GENUINE_MOVE` | 8 → 0 → 0 → **0** | 24 → 2 → 2 → **2** |
| `UNRESOLVED` | 1.196 → 1.203 → 1.209 → **1.210** | 2.491 → 2.512 → 2.518 → **2.519** |
| mit Referenzexposition, ungeklärt | 75 → 83 → 83 → **83** (von 83) | 241 → 263 → 263 → **263** (von 265) |

**Zweite Nachprüfung (Regelsatz 1.2.0).** Normale Aktienausgabe zwischen den SEC-Stichtagen konnte den Nachbarfaktor bestätigen (1:10 als 1:9, HIGH). Jetzt gilt für die Bestätigung eines Splits:
- Aktienverhältnis und Eröffnungsrelativ müssen unabhängig denselben Faktor wählen.
- Das Residuum muss eng sein: ≤ min(0,2 × Abstand zum Nachbarfaktor, 2 %).
- Ab 1:10 braucht es eine zweite Quelle (adjClose oder 8-K 5.03/3.03).
- Falsch datierte erklärte Splits brauchen ln 1,10 und eine SEC- oder adjClose-Bestätigung (MEDIUM).

**Dritte Prüfung (Regelsatz 1.3.0).** Aktienausgabe und ein Kursrückgang am Split-Tag verschieben Aktienverhältnis und Eröffnung gleichgerichtet zum Nachbarfaktor; der Fehler ist auch mit 1.2.0 noch reproduzierbar (1:10 → 1:9, 1:20 → 1:19). Ein bloßes 8-K-Item trägt keinen Faktor. Ich habe deshalb die prinzipielle, konservative Regel gewählt:
- Ein Split gilt nur, wenn eine faktortragende unabhängige Quelle denselben Rasterwert liefert, und zwar innerhalb des halben Abstands zu beiden Nachbarn.
- Diese Quelle ist der adjClose-implizierte Faktor.
- Aktienzahlen und Eröffnung sind notwendig, aber nicht hinreichend.

Ergebnis: 0 bestätigte Splits. Alle 6 der ersten Fassung sind ungeklärt; jeder Fehlerfall ist als Regressionstest festgehalten.

**Was das unabhängige Review geändert hat.** 2 HIGH, 4 MEDIUM, 6 LOW, alle behoben und mit Tests abgesichert:
- Ein Split-Faktor konnte auf einen falschen Standardfaktor einrasten (1:24 → 1:25). Jetzt gilt ein Ganzzahlraster 2–1000 mit disjunkten Fenstern.
- Echte Bewegungen sind nur noch mit diesen Belegen bestätigt:
  - vor der Sitzung eingereichte Aktienzahl;
  - Volumen-Gegenprobe;
  - erweiterte Meldungssuche;
  - bekannte CIK;
  - nur inländische Emittenten.
- Split-Kandidaten werden ebenfalls auf Fusionen geprüft.

Folge (1.1.0): Die 8 echten Bewegungen der ersten Fassung halten der strengeren Prüfung nicht stand. Das ist gewollt, denn keine Vermutung soll als Bestätigung gelten. Von den 6 früheren Splits:
- 5 behalten ihren Faktor.
- 1 ist jetzt ungeklärt (CIK nur über den Namen zugeordnet).
- 2 sind neu belegt, darunter ein 1:11, das die alte Faktorliste nicht kannte.

**Die beiden Restgruppen des Auftrags:**
- **Erklärter Split in der Nähe (19 exponiert):** Die vorab festgeschriebene Regel für falsch datierte Splits bestätigt kein Paar.
  - 13 Sitzungen haben keinen passenden Sprung in ±5 Sitzungen.
  - 6 haben mehrere erklärte Splits.
  - Das spricht für falsche Verhältnisse; die Regel wurde danach nicht aufgeweitet. Einen Faktor zu erfinden wäre unzulässig.
- **Fehlende SEC-Daten (34 → 32 exponiert):** Die Bilanz-Aktienzahlen helfen bei 109 DQ-K5-Sitzungen als Nachher-Wert, bestätigen aber keine exponierte Sitzung.

**Offen:**
- kein Quant-Daten-PR nötig, da nichts faktorgenau bestätigt ist;
- eine neue Snapshot-Generation mit Vorher/Nachher;
- der Holdout;
- für den exponierten Rest eine lizenzierte zweite Corporate-Action-Quelle (Kosten, Ihre Freigabe) oder Ihre Entscheidung über die Quarantäne-Lesart.

## 5. Kapitalmaßnahmen und historische Identität

- Es wurden keine nachweisbaren Mappingfehler gefunden. Nicht belegbare Zuordnungen bleiben `UNRESOLVED`, zum Beispiel CIK nur über den Namen oder ADR/IFRS.
- Kein heutiges Mapping wird ungeprüft auf historische Zeiträume übertragen: Die Klassifikation verlangt Aktienzahlen aus Einreichungen, die die Sitzung zeitlich einrahmen.

## 6. Gemeinsame Execution Engine

- SF7-D1, D2 und D5 sind behoben bzw. als Variante umgesetzt.
- D3 (Turtle) und D4 (Minervini) betrafen die OPTIMISTIC-Alternativen. Nach E7-3 sind sie als neue, versionierte Lesarten behoben (#911). Die alten Lesarten laufen weiter als ersetzt. SF6-PAPER-2027 1.1.0 pinnt die neuen Fingerabdrücke und ist nicht aktiviert.
- Neu geprüft ohne Fehler (13 Regressionstests in #898): Kostensymmetrie, Positionslimit bei gleichzeitigen Signalen und Unabhängigkeit von der Eingabereihenfolge, Aktienbilanz je Trade, Dividende am Einstiegstag, Gaps, Drawdown.
- Offen bleiben:
  - EP-Stops werden nur gegen IEX-Tiefs geprüft (MEDIUM, dokumentiert);
  - die 6.0-Code-Fingerabdrücke enthalten `lifecycle-engine.mjs` nicht (LOW, eigener PR vorgeschlagen).

## 7. Minervini SEPA/VCP

Antworten auf die sechs Fragen der Ergänzung, Einzelheiten in der Inventur:
1. **Bereitgestellt wurden:** B12 (*Trade Like a Stock Market Wizard*, indonesisch), B07 (*Momentum Masters*, indonesisch), B03 (*Think & Trade Like a Champion*, lizenziert vietnamesisch). Dazu kommt die englische Interviewseite W-MIN18 aus #709. Englische Buchausgaben und *Stock Market Wizards* wurden nicht bereitgestellt.
2. **Heute vorhanden:** alle drei Bücher, byte-identisch (SHA-256 = #709). W-MIN18 ist erfasst, aber von hier nicht erneut abrufbar (HTTP 403).
3. **Nicht vollständig übernommen:** 9 englische Zeilen fehlten, B03 lieferte nur 8 Zeilen. 346 Befunde, 154 davon ohne #709-Abdeckung.
4. **Präziser belegbar:**
   - Stop ≤ 10 % (englisch gestützt), Risiko je Trade 1,25–2,5 %, Pilotpositionen;
   - Trend Template in zwei Übersetzungen gleich;
   - 52-Wochen-Tief 25 % / 30 % als Ausgabendifferenz;
   - RS-Linie, Flat Base;
   - Power-Play-Ausnahme bei ≤ 10 %, Power-Play-Korrektur nach Preisniveau;
   - Verkaufssignale, Staffel-Stops.
5. **Klassen:** 21× vorhanden (Übersetzung), 6× englisch, 1× Übersetzungskonflikt, 20× nur die Operationalisierung offen, 12× Ermessen der Methode, 6× nicht im Material, 1× Verfügbarkeit.
6. **Nur Daten** (nicht die Bücher): IBD-RS-Historie, Schätzungen/Guidance, abgeleitete Q4-EPS, Intraday-Volumen, V4-D1, Holdout/OOS.

Lauf 40103766418 (Commit `5f46d479e`):

| | Trades | gegenüber REF unverändert / geändert / entfallen / neu |
|---|---|---|
| REF | 954 | **ledger-identisch mit 4.0** |
| ALT-SEPA-FLAT-BASE | 824 | 24 / 249 / 681 / 551 |
| ALT-SEPA-TT6-25 | 982 | 123 / 558 / 273 / 301 |
| ALT-SEPA-RS-LINE | 890 | 50 / 400 / 504 / 440 |

Diagnosen:
- Der geplante Verlust liegt bei 875 von 902 bewertbaren Trades unter dem halben Durchschnittsgewinn (B12 S. 398–399).
- Das Signal „größter Tagesrückgang seit Stage-2-Beginn“ läge bei 613 von 937 geschlossenen Trades vor dem modellierten Ausstieg.

Kein Regelstatus wird aufgewertet, keine Minervini-Regel ist `SOURCE_EXACT`.

## 8. Minervini Power Play

- REF: 1.007 Trades, ledger-identisch.
- **VCP-Konflikt aufgelöst:** B12 S. 341 verlangt VCP-Merkmale, B03 S. 189 nimmt Basen mit höchstens 10 % Tiefe davon aus. Das ist die Referenzlesart.
- **Korrektur präzisiert:** höchstens 20 %, bei niedrigpreisigen Titeln etwa 25 %. „Niedrigpreisig“ ist nicht beziffert.
- **Diagnose:** 957 von 957 bewertbaren Trades liegen innerhalb des halben Durchschnittsgewinns.
- **V4-D1:** 12 Sitzungen exponiert, alle ungeklärt (Regelsatz 1.3.0).

## 9. Die übrigen elf Strategien

Je Strategie mit den zwölf Fragen in [SUPERTRADER_7_COMPLETION_MATRIX.md](SUPERTRADER_7_COMPLETION_MATRIX.md).

| Strategie | 7.0 |
|---|---|
| Turtle S1/S2 | geprüft (Unit-Limits, Korrelationsgruppen, Failsafe): Referenz ohne Fehler; D3 als versionierte Lesart behoben (#911) |
| Darvas | D1 als Variante (8.596 sichere Stops) |
| Weinstein Investor/Trader | D1 gezählt; ohne Exposition (Investor) bzw. 3 ungeklärt (Trader) |
| Kullamägi Breakout, Pocket Pivot, BGU | geprüft, keine technisch lösbare Lücke (Einstieg zur Eröffnung bzw. zum Schluss) |
| Holy Grail | D1 gezählt (127) |
| Episodic Pivot | D2 behoben, D5 als Variante; Katalysator bleibt gesperrt |
| Parabolic Short | geprüft, kein Fehler; Borrow-Historie fehlt |

Unverändert gelassen ohne künstliche Arbeit: Kullamägi Breakout, Pocket Pivot, BGU, Parabolic Short (Begründung in #898).

## 10. Zusätzliche Research- und Backtest-Fähigkeiten

- Modus `sf7-minervini`: REF muss die 4.0-Ledger reproduzieren, sonst bricht er ab.
- Modus `sf7-ca-resolution`: Klassifikation, Overlay, Quarantäne, Abgleich aller 11 Referenzen.
- SF7-Ausführungsvarianten für Darvas, Holy Grail, Weinstein und EP.
- Quelleninventur: Builder und Test gegen Buch-Hashes.
- Abschlussmatrix.

## 11. Datenabdeckung und Validierungsqualität

- **Unverändert:** DEV `EXACT`; Holdout survivorship-belastet und bereits genutzt.
- **Intraday:** nur IEX, 0 neue Abrufe.
- **Neu:** sec-pit-r13 dient als Aktienzahlquelle für V4-D1 (privat, nur per Hash identifiziert).
- Das EDGAR-Einreichungsverzeichnis wurde gezielt live gelesen (19 Indizes im maßgeblichen Lauf, Budget 150). Die Einträge sind versiegelt, aber nicht im Snapshot eingefroren.
- Neu: sec-pit r14 (Bilanz-Aktienzahlen, gleicher Bulk-Mechanismus). Ein Aktienzahl-Paar muss auf beiden Seiten aus derselben Quelle stammen.

## 12. Bestehende Quellen- und Datenblocker

| Blocker | Strategien | Art |
|---|---|---|
| englischer Buchwortlaut | Minervini | Quellenverfügbarkeit im Projekt |
| Stopregel / Trailing / Größe nicht in den Quellen | Pocket Pivot, Holy Grail | Quelle |
| manuelle Entscheidungen | alle außer Turtle | Ermessen der Methode |
| IBD-RS | Minervini SEPA | Daten (proprietär) |
| PIT-Korrelationsgruppen, PIT-Branchen-Stage, NYSE-Breite | Turtle, Weinstein | Daten |
| Katalysator- und News-Historie | EP | Daten |
| Borrow/Locate | PS | Daten |
| konsolidiertes Intraday-Volumen | EP, PS, PP, BGU | Daten |
| V4-D1-Rest | alle 11 außer SEPA, Weinstein Investor | Daten: lizenzierte zweite CA-Quelle; freie Daten ausgeschöpft |
| unberührtes Fenster | alle | SF6-PAPER-2027 ab 01.01.2027 |

## 13. Reproduzierbarkeit und Robustheit

- **Reproduzierbarkeit:**
  - Alle 11 Referenzen sind in 7.0 erneut hash-identisch mit den maßgeblichen Läufen: sf5 41/41 Varianten (40099831813), Minervini REF (40103766418), BASE in sf7-ca-resolution (40122736287).
  - EP/PS sind blockgleich (40107434014).
- **Trade-Stabilität:** weiterhin gering (Knock-on). Beispiele: ALT-SEPA-FLAT-BASE mit 24 unveränderten Trades; CA-Quarantäne wie DQ-K5 in 6.0.
- **Robustheit:** nicht belegt (E6). Kennzahlen versiegelt und in 7.0 nicht gelesen oder bewertet; keine Variante wurde nach Ergebnissen gewählt.

## 14. Tests und unabhängige Reviews

| Zweig | Supertrader-Suite | Neu | Review | HIGH / MEDIUM offen |
|---|---|---|---|---|
| #899 | 682 / 0 Fehler | `sf-sf7-minervini` (16 Tests) | 1 HIGH, 6 MEDIUM, 7 LOW → behoben; E7-2-Code: 1 HIGH, 3 MEDIUM, 6 LOW → behoben (1.3.0) | 0 / 0 |
| #898 | 683 / 0 Fehler | `sf-sf7-execution` (17 Tests) | 0 HIGH, 2 MEDIUM → D4 gelistet (in #911 behoben), D5 behoben; LOW behoben | 0 / 1 als Risiko ausgewiesen (EP-IEX-Stop) |
| #911 | 693 / 0 Fehler | `sf-sf7-optimistic-fixes` (10 Tests, davon 2 Fingerabdrücke gegen den Code vor der Behebung) | 0 HIGH, 1 MEDIUM (Testlücken) → behoben, 5 LOW dokumentiert | 0 / 0 |
| #902 | 695 / 0 Fehler | Mutantentests je Wächter, gepinnter Regelsatz | Review: 2 HIGH, 4 MEDIUM, 6 LOW → 1.1.0; Nachprüfung: 1 HIGH, 1 MEDIUM, 7 LOW → 1.2.0; dritte Prüfung: 1 HIGH, 1 MEDIUM, 2 LOW → 1.3.0 (faktortragende Quelle Pflicht) | 0 / 0 |
| Integration | 739 / 0 Fehler (#902 + #898 + #911 + #899 + main); Core 236 / 0, Quant 2.798 / 0, Discover + Screener 621 / 0, Python OK | `sf-sf7-completion` | – | – |

Gate A ist auf jedem Zweig ok, die Testisolation ist sauber. Fremde Fehler auf `main` wurden getrennt reproduziert:
- 7 Elliott-Tests scheitern auf dem alten Basis-Commit `304f917` und sind auf dem aktuellen `main` behoben.
- Der Secrets-Test scheitert nur lokal an den Agenten-Worktrees.

## 15. Neue Draft-PRs

#902, #898, #911, #899 und dieser Abschluss-PR (#905).

**Integriert am 25.10.2026** nach Freigabe des Eigentümers, regulär per Merge-Commit und in der Reihenfolge von Abschnitt 16:

| PR | Merge-Commit | geprüfter Head |
|---|---|---|
| #902 | `65c8d9e` | `9a2c8bb` |
| #898 | `665a51e` | `0dd29bd` |
| #911 | `0f4ac0e` | `eeece81` |
| #899 | `675eeb9` | `2dca934` |
| #905 | dieser Merge | – |

Vor jedem Merge wurde `main` per Merge-Commit nachgezogen, die Artefakte wurden mit ihren Erzeugern neu gebaut, und die Supertrader-Suite, Core, Gate A und die Modusliste wurden geprüft. Den Konflikt in der Modusliste (#899) habe ich gelöst, ohne einen Modus zu verlieren und ohne Duplikate: 63 Modi, 46 Commit-Marker.

Alle GitHub-Actions-Checks waren auf jedem geprüften Head grün. Vercel ist kein Pflicht-Check, weil `main` keine Branch Protection hat. Seine Meldung „failure“ kam vom Tageskontingent des Free-Plans (`api-deployments-free-per-day`) und ist kein Qualitätstest. Zwischen den Schritten kamen auf `main` nur Datenläufe und fremde PRs dazu (#912, #914, #915). Sie berühren Supertrader-Pfade nicht und mergen konfliktfrei.

## 16. Empfohlene Merge-Reihenfolge

| Schritt | PR | Abhängigkeit | Nach dem Merge |
|---|---|---|---|
| 1 | **#902** (A, V4-D1) | Basis `main` | – |
| 2 | **#898** (B/D/E/F, Ausführung) | unabhängig von #902 | `rebuild-all.mjs` |
| 3 | **#911** (E7-3, D3/D4) | **baut auf #898 auf**; deshalb nach #898 | `rebuild-all.mjs`, `build-sf6-readiness.mjs` |
| 4 | **#899** (C, Minervini, E7-2) | unabhängig; der Runner-Test ist mit #911 verträglich (`sf7Variants: []`) | Konflikt nur in der Modusliste von Workflow und `sf-runner.test.mjs`; beide Modi bleiben. Danach `rebuild-all.mjs` und `build-minervini-source-inventory.mjs` |
| 5 | **#905** (Abschluss) | zuletzt | `sf7-completion-matrix.mjs`; der Test prüft die Gleichheit |

Die Folge habe ich auf einem Wegwerf-Zweig von `main` simuliert:
- Die Schritte 1 bis 3 laufen konfliktfrei.
- Schritt 4 hat nur den bekannten Moduslisten-Konflikt.
- Der Baum nach Schritt 5 ist **identisch** mit dem Integrationsstand, auf dem alle Regressionen grün sind.

Konflikte werden vor jedem Merge per Merge-Commit von `main` aufgelöst, ohne Rebase. Nach jedem Merge laufen Suite, Gate A und Testisolation des nächsten PR erneut auf dem neuen `main`.

## 17. Notwendige Eigentümerentscheidungen

| | Entscheidung | Wirkung |
|---|---|---|
| E7-1 | **entschieden 25.10.:** keine pauschale Quarantäne; Teilkriterien geprüft; Anbieter-Memo vorgelegt. Ursprüngliche Frage: Genügt für CC-5 eine V4-D1-Exposition von 0 (SEPA, Weinstein Investor), oder bleibt CC-5 bis zur neuen Snapshot-Generation offen? Und für die übrigen 9: Quarantäne-Lesart als Ausnahme, oder Beschaffung einer lizenzierten zweiten CA-Quelle (Kosten)? | CC-5 für 2 bzw. 9 Referenzen |
| E7-2 | **entschieden 25.10.:** Übersetzungen als Beleg ohne `SOURCE_EXACT`; 154 Befunde klassifiziert. Ursprüngliche Frage: Minervini CC-1: rechtmäßige Bereitstellung einer englischen Ausgabe, oder zählen zwei übereinstimmende Übersetzungen als Beleg? | CC-1 SEPA / Power Play |
| E7-3 | **entschieden und umgesetzt 25.10. (#911).** Ursprüngliche Frage: SF7-D3 / SF7-D4 in den gepinnten Engines korrigieren (neue Protokollversion SF6-PAPER-2027 1.1.0)? | OPTIMISTIC-Varianten Turtle / Minervini |
| E7-4 | offen, Vorlage in `SUPERTRADER_7_OWNER_DECISIONS_E7.md`: Neue Snapshot-Generation (mit Holdout), sobald eine faktortragende CA-Quelle vorliegt | V4-D1-Auflösung in den Daten |
| E7-5 | Quelle für PIT-Korrelations- und Branchengruppen (kostenfrei prüfen, kostenpflichtig nur mit Freigabe) | CC-4 Turtle, Weinstein |
| E7-6 | EP/PS: Budget für eine größere Intraday-Stichprobe (E5) | EP/PS-Belastbarkeit |
| E7-7 | Ausstiegsvarianten für Minervini (größter Rückgang seit Stage-2-Beginn, Klimax-Verkauf, MA20-Halbverkauf) als vorregistrierte Forschungsvarianten oder nur Diagnose | Minervini-Verkaufsregeln |

## 18. Voraussetzungen für eine spätere Produktintegration

- mindestens ein `CERTIFICATION_CANDIDATE`; heute 0;
- V4-D1 belegt aufgelöst und in einer neuen Snapshot-Generation nachgerechnet;
- SF6-PAPER-2027 aktiviert (eigene Freigabe) und ausgewertet;
- Bewertung der versiegelten Kennzahlen auf Ebene von Verteilungen (E6);
- Live-Daten- und Ausführungsprüfung.

Nichts davon ist Teil von 7.0. Es gibt keine UI- oder Menüänderung.

## Freigabevorlage

> **Freigabe Supertrader 7.0 (technischer Entwicklungsauftrag)**
>
> Ich gebe die Draft-PRs #902, #898, #911, #899 und den Abschluss-PR #905 in dieser Reihenfolge zum Merge frei. Konflikte werden per Merge-Commit aufgelöst, und die Artefakte werden mit ihren Erzeugern neu gebaut.
>
> Bestätigt:
> - V4-D1: Mit freien Daten ist kein Split faktorgenau belegbar; alle referenzexponierten Sitzungen bleiben ungeklärt und gesperrt (E1 gilt weiter). Eine lizenzierte CA-Quelle entscheide ich gesondert (E7-1).
> - Keine Minervini-Regel ist `SOURCE_EXACT`; Varianten und Diagnosen sind Forschung (E3).
> - Keine neuen Intraday-Abrufe (E5).
> - SF7-D3/D4 sind als versionierte Varianten behoben. SF6-PAPER-2027 1.1.0 bleibt vorbereitet und nicht aktiv (E7-3).
> - 0 von 13 Strategien sind `CERTIFICATION_CANDIDATE`. Alle bleiben `LIVE_NOT_APPROVED` und `DIAGNOSTIC_NOT_CERTIFIED`.
> - Keine Live-Aktivierung, keine Orders, keine neuen Anbieter, keine Änderung der Produktoberfläche, keine Änderung an Gates oder Branch Protection.
>
> Die offenen Entscheidungen treffe ich gesondert: EDGAR-Grundwahrheit und Anbieteranfrage (E7-1), E7-4 bis E7-7.
