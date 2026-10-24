# Supertrader 7.0 – Full Strategy Completion & Certification Accelerator: Abschlussbericht

Stand: 24. Oktober 2026.
- **Basis:** `main` nach Supertrader 6.0 (`c6fad12`, #881); Zweige ab `304f917`, `main` jeweils per Merge-Commit nachgezogen.
- **Snapshot:** DEV `sts1-134d4d62eb88b6ff8d98fe6e56b12a6d`, Abrechnung `research-v1`.

Alle historischen Aussagen sind `DIAGNOSTIC_NOT_CERTIFIED`. Alle 13 Strategien sind `LIVE_NOT_APPROVED`. Es gibt keine Orders, keine Brokeranbindung und keine Performanceaussage. Kennzahlen liegen versiegelt beim Eigentümer; öffentlich sind nur Zählungen und Hashes.

Maschinenlesbar:
- Abschlussmatrix: [SUPERTRADER_7_COMPLETION_MATRIX.md](SUPERTRADER_7_COMPLETION_MATRIX.md), Artefakt `STRATEGY-SF7-COMPLETION.json`. Der Builder liest die maschinellen Felder aus der 6.0-Readiness (Kriterien 1.2.0, mit den 7.0-Eingaben neu gebaut). Keine Note ist von Hand gesetzt.
- Teilberichte:
  - [SUPERTRADER_7_MINERVINI_SOURCE_INVENTORY.md](SUPERTRADER_7_MINERVINI_SOURCE_INVENTORY.md) (Workstream C);
  - [SUPERTRADER_7_EXECUTION_AND_STRATEGIES.md](SUPERTRADER_7_EXECUTION_AND_STRATEGIES.md) (B/D/E/F);
  - [SUPERTRADER_7_V4D1_RESOLUTION.md](SUPERTRADER_7_V4D1_RESOLUTION.md) (A).

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
  - Erstmals sind Sitzungen mit Belegen aufgelöst: 6 nicht deklarierte Reverse-Splits (Faktor und Datum durch SEC-Aktienzahlen belegt) und 8 echte Bewegungen.
  - Hinter Minervini SEPA und Weinstein Investor liegt keine exponierte Sitzung.

**Was ist endgültig gelöst?**
- Die Frage, ob Minervini-Material fehlt. Es ist vollständig vorhanden; es fehlt nur der englische Buchwortlaut.
- Der Extraktionsfehler W-MIN18.
- Der Power-Play-VCP-Konflikt (B12 S. 341 / B03 S. 189).
- SF7-D1 (als Variante), SF7-D2, SF7-D5 (als Variante).
- Für 14 Sitzungen die Frage „Fehler oder echte Bewegung“.

**Was bleibt bestehen?**
- **V4-D1:** 75 von 83 exponierten DQ-K5-Sitzungen sind ungeklärt; der Nachlauf mit zwei Restgruppen ist in #902 in Arbeit (siehe Abschnitt 4).
- **CC-1 Minervini:** Der englische Buchwortlaut fehlt im Projekt.
- **CC-3:** Die manuellen Quellenentscheidungen bleiben (alle außer Turtle).
- **CC-4:** IBD-RS, PIT-Branchen- und Korrelationsgruppen fehlen.
- **CC-8:** SF6-PAPER-2027 ist frühestens Ende 2027 auswertbar.
- **Ausführungsdefekte:** SF7-D3 (Turtle) und SF7-D4 (Minervini) sind in gepinnten Engines charakterisiert, aber nicht korrigiert.

**Welche Strategien liegen der Zertifizierungsfähigkeit am nächsten?**
- Unverändert Turtle S2 (offen CC-4, CC-5, CC-8).
- Danach Kullamägi Breakout (CC-3, CC-5, CC-8) und Turtle S1.
- Minervini SEPA hat als einzige Referenz zusammen mit Weinstein Investor keine V4-D1-Exposition. Bei SEPA scheitert CC-1 aber an der Übersetzungslage und CC-3 am Ermessen.

**Welche nächsten Entscheidungen bringen den größten Fortschritt?** Siehe Abschnitt 17:
1. **CC-5-Lesart:** ob 0 exponierte Sitzungen genügen;
2. **CC-1 Minervini:** englische Ausgabe oder Übersetzungsbelege;
3. **Ausführungsdefekte in gepinnten Engines:** Korrektur von SF7-D3/D4 mit neuer Protokollversion;
4. **V4-D1-Folge:** Quant-Daten-PR für die bestätigten Splits und neue Snapshot-Generation;
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
| Review C | `minervini-sf7.mjs` (eigene 7.0-Arbeit) | 1 HIGH (zunächst unbelegte `SOURCE_EXACT`-Aufwertung), 6 MEDIUM, 7 LOW | alle behoben | siehe #899 |

## 4. Fortschritt bei V4-D1

Ergebnis von #902, maßgeblicher Lauf 40104626083: Datensatz `EXACT`, sec-pit-r13 `04ba0f57…`, 24 EDGAR-Anfragen, Overlay-Manifest `daf96610…`.

| | DQ-K5 | DQ-K3 |
|---|---|---|
| markierte Sitzungen | 1.210 | 2.521 |
| `CONFIRMED_UNDECLARED_SPLIT` | 6 | 6 |
| `CONFIRMED_GENUINE_MOVE` | 8 | 24 |
| `UNRESOLVED` | 1.196 | 2.491 |
| mit Referenzexposition (echt / ungeklärt) | 83 (8 / 75) | 265 (24 / 241) |

- Die 6 belegten Splits sind Reverse-Splits von 1:5 bis 1:35 bei Pennystocks. Keiner liegt hinter einem Referenztrade. Das CA-Overlay ist deshalb für alle 11 Referenzen trade- und ledger-identisch mit BASE.
- **Keine Vermutung ist als Kapitalmaßnahme ausgegeben.** Toleranzen und Klassen waren vor dem Lauf festgeschrieben.
- **Ungeklärter Rest (75 exponierte K5-Sitzungen):**
  - 19 mit erklärtem Split in der Nähe (Faktor vermutlich am falschen Tag);
  - 34 ohne verwertbare SEC-Aktienzahl;
  - 4 mit unveränderter Aktienzahl, aber CIK nur über den Namen zugeordnet;
  - 18 mit Kapitalerhöhung, Fusion, ADR oder widersprüchlichen Belegen.
- **Nachlauf in Arbeit (#902):** eine vorregistrierte Regel für falsch datierte Splits und sec-pit r14 mit Bilanz-Aktienzahlen aus derselben EDGAR-Bulk-Quelle (keine Kosten, kein neuer Anbieter).
- **Offen nach #902:**
  - der Quant-Daten-PR für die bestätigten Splits (Gate A hält ihn aus diesem Auftrag);
  - eine neue Snapshot-Generation mit Vorher/Nachher;
  - der Holdout-Snapshot.

## 5. Kapitalmaßnahmen und historische Identität

- Es wurden keine nachweisbaren Mappingfehler gefunden. Nicht belegbare Zuordnungen bleiben `UNRESOLVED`, zum Beispiel CIK nur über den Namen oder ADR/IFRS.
- Kein heutiges Mapping wird ungeprüft auf historische Zeiträume übertragen: Die Klassifikation verlangt Aktienzahlen aus Einreichungen, die die Sitzung zeitlich einrahmen.

## 6. Gemeinsame Execution Engine

- SF7-D1, D2 und D5 sind behoben bzw. als Variante umgesetzt.
- D3 (Turtle, OPTIMISTIC-Alternative) und D4 (Minervini, OPTIMISTIC-Alternative) liegen in gepinnten Engines. Charakterisierungstests halten das heutige Verhalten fest. Eine Korrektur braucht Ihre Entscheidung, weil der Code in SF6-PAPER-2027 gepinnt ist.
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
- **V4-D1:** 12 Sitzungen exponiert, davon 2 echt, 10 ungeklärt.

## 9. Die übrigen elf Strategien

Je Strategie mit den zwölf Fragen in [SUPERTRADER_7_COMPLETION_MATRIX.md](SUPERTRADER_7_COMPLETION_MATRIX.md).

| Strategie | 7.0 |
|---|---|
| Turtle S1/S2 | geprüft (Unit-Limits, Korrelationsgruppen, Failsafe): Referenz ohne Fehler; D3 offen |
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
- Das EDGAR-Einreichungsverzeichnis wurde gezielt live gelesen: 24 Anfragen, Budget 150.

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
| V4-D1-Rest | alle 11 außer SEPA, Weinstein Investor | Daten (zweite CA-Quelle / bessere SEC-Abdeckung) |
| unberührtes Fenster | alle | SF6-PAPER-2027 ab 01.01.2027 |

## 13. Reproduzierbarkeit und Robustheit

- **Reproduzierbarkeit:**
  - Alle 11 Referenzen sind in 7.0 erneut hash-identisch mit den maßgeblichen Läufen: sf5 41/41 Varianten (40099831813), Minervini REF (40103766418), BASE in sf7-ca-resolution (40104626083).
  - EP/PS sind blockgleich (40107434014).
- **Trade-Stabilität:** weiterhin gering (Knock-on). Beispiele: ALT-SEPA-FLAT-BASE mit 24 unveränderten Trades; CA-Quarantäne wie DQ-K5 in 6.0.
- **Robustheit:** nicht belegt (E6). Kennzahlen versiegelt und in 7.0 nicht gelesen oder bewertet; keine Variante wurde nach Ergebnissen gewählt.

## 14. Tests und unabhängige Reviews

| Zweig | Supertrader-Suite | Neu | Review | HIGH / MEDIUM offen |
|---|---|---|---|---|
| #899 | 679 / 0 Fehler | `sf-sf7-minervini` (13 Tests) | 1 HIGH, 6 MEDIUM, 7 LOW → behoben | 0 / 0 |
| #898 | 683 / 0 Fehler | `sf-sf7-execution` (17 Tests) | 0 HIGH, 2 MEDIUM → D4 gelistet, D5 behoben; LOW behoben | 0 / 2 als Risiko ausgewiesen (D4 Eigentümer, EP-IEX-Stop) |
| #902 | 678 / 0 Fehler | 12 Tests | Review läuft | – |
| Integration | 696 / 0 Fehler (#899 + #898) | `sf-sf7-completion` | – | – |

Gate A ist auf jedem Zweig ok, die Testisolation ist sauber. Fremde Fehler auf `main` wurden getrennt reproduziert:
- 7 Elliott-Tests scheitern auf dem alten Basis-Commit `304f917` und sind auf dem aktuellen `main` behoben.
- Der Secrets-Test scheitert nur lokal an den Agenten-Worktrees.

## 15. Neue Draft-PRs

#899, #898, #902 und dieser Abschluss-PR. Keiner ist gemergt.

## 16. Empfohlene Merge-Reihenfolge

1. **#902 (A):** Basis `main`. Konflikt nur in der Modusliste des Validierungs-Workflows und im Moduslisten-Test; beide Modi bleiben.
2. **#898 (B/D/E/F):** keine Workflow-Änderung. Artefakte nach dem Merge mit `rebuild-all.mjs` neu bauen.
3. **#899 (C):** Modusliste wie oben; danach `rebuild-all.mjs` und `build-sf6-readiness.mjs`.
4. **Abschluss-PR:** zuletzt; `sf7-completion-matrix.mjs` neu bauen, der Test prüft die Gleichheit.

Konflikte löse ich vor jedem Merge per Merge-Commit von `main`, ohne Rebase. Danach laufen Suite, Gate A und Testisolation erneut. Die Integration von #899 + #898 ist bereits geprüft (696/0, Artefakte unverändert nach Neubau).

## 17. Notwendige Eigentümerentscheidungen

| | Entscheidung | Wirkung |
|---|---|---|
| E7-1 | Genügt für CC-5 eine V4-D1-Exposition von 0 (SEPA, Weinstein Investor), oder bleibt CC-5 bis zur neuen Snapshot-Generation offen? | CC-5 für 2 Referenzen |
| E7-2 | Minervini CC-1: rechtmäßige Bereitstellung einer englischen Ausgabe, oder zählen zwei übereinstimmende Übersetzungen als Beleg? | CC-1 SEPA / Power Play |
| E7-3 | SF7-D3 / SF7-D4 in den gepinnten Engines korrigieren (neue Protokollversion SF6-PAPER-2027 1.1.0)? | OPTIMISTIC-Varianten Turtle / Minervini |
| E7-4 | Quant-Daten-PR für die bestätigten Splits und neue Snapshot-Generation | V4-D1-Auflösung in den Daten |
| E7-5 | Quelle für PIT-Korrelations- und Branchengruppen (kostenfrei prüfen, kostenpflichtig nur mit Freigabe) | CC-4 Turtle, Weinstein |
| E7-6 | EP/PS: Budget für eine größere Intraday-Stichprobe (E5) | EP/PS-Belastbarkeit |
| E7-7 | Ausstiegsvariante „größter Rückgang seit Stage-2-Beginn“ für Minervini (Änderung der 4.0-Engine) | Minervini-Verkaufsregeln |

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
> Ich gebe die Draft-PRs #902, #898, #899 und den Abschluss-PR in dieser Reihenfolge zum Merge frei. Konflikte werden per Merge-Commit aufgelöst, und die Artefakte werden mit ihren Erzeugern neu gebaut.
>
> Bestätigt:
> - V4-D1 ist teilweise mit Belegen aufgelöst, der Rest bleibt gesperrt (E1 gilt weiter).
> - Keine Minervini-Regel ist `SOURCE_EXACT`; Varianten und Diagnosen sind Forschung (E3).
> - Keine neuen Intraday-Abrufe (E5).
> - 0 von 13 Strategien sind `CERTIFICATION_CANDIDATE`. Alle bleiben `LIVE_NOT_APPROVED` und `DIAGNOSTIC_NOT_CERTIFIED`.
> - Keine Live-Aktivierung, keine Orders, keine neuen Anbieter, keine Änderung der Produktoberfläche, keine Änderung an Gates oder Branch Protection.
>
> Die Entscheidungen E7-1 bis E7-7 treffe ich gesondert.
