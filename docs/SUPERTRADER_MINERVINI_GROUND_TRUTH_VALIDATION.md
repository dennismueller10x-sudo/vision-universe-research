# Supertrader – Minervini Ground-Truth-Validierung

Status: Forschungsdiagnose. Keine Regeländerung, keine Optimierung, kein Live-Einfluss.
Phase 2B bleibt **CLOSED – MAXIMUM CURRENT FIDELITY**. Minervini 2.0.0 (live), der Freeze 1.1.0, Registry und Ledger bleiben unverändert.
Neue öffentliche Performance-Aussagen gibt es nicht.

Leitfrage: Erkennt die eingefrorene Engine `minervini-adaptation-1.1.0` die Setups, die Mark Minervini selbst dokumentiert hat, und zwar zum damaligen Zeitpunkt? Die Signalregeln sind identisch mit 1.0.0.

<!-- ERGEBNISSE -->

## 1. Quellen und Fallbasis

**Erlaubte Quellen**
- Ground Truth sind nur Minervinis eigene Angaben: Bücher (Tier 1), eigene Beiträge, Videos und Interviews (Tier 2/3).
- Sekundärquellen helfen nur beim Finden.
- Modellwissen ist ausgeschlossen.

**Was praktisch erreichbar war**
- **Bücher:** nicht lesbar. Die bekannten Buchbeispiele liegen zudem überwiegend vor 2008, also vor dem Datenfenster. Kein Buchfall.
- **Eigene X-Beiträge (@markminervini):** x.com ist aus dieser Umgebung nicht abrufbar.
  - Verwendet wurde nur der Ausschnitt- und Titeltext aus einer domain-gefilterten Websuche.
  - Das Datum stammt aus der Status-ID (Snowflake). Die Beitragszeit in ET ist geprüft: Alle MAIN-Beiträge liegen in der Handelszeit, außer RVNC (09:02 ET, vorbörslich; der Anker ist dort der Vortag).
  - Quellenstärke daher höchstens **MEDIUM**.
  - Ticker, die nur in der Zusammenfassung der Suchmaschine standen, gelten als **LOW** und werden nicht ausgewertet. Betroffen: CRWD, BNTX, VAPO, TIPT, BYND, ANF, SPOT, ETSY.
- **Preise:** In keinem Ausschnitt stehen Pivot, Einstiegskurs oder Stop. Der Pivot-Vergleich ist daher **NOT_MEASURABLE**. Gemessen wird nur das Timing.
- **Suchrunden:** sechs, mit rund 130 Abfragen (protokolliert in `sourcing.searchRounds`). Gesichtete Beiträge ohne Fall stehen in `sourcing.hitsWithoutCase`.

**Fallliste** (`scripts/supertrader/fidelity/MINERVINI-GROUND-TRUTH-CASES.json`, 104 Einträge, eingefroren)

| Gruppe | Fälle | Rolle |
|---|---:|---|
| MAIN | 16 | Recall. MAIN_A: 14 Fälle mit eigenem Einstieg. MAIN_B: 2 Fälle, Setup bejaht, kein eigener Kauf (AMD 22.07.2020, REPL) |
| SENSITIVITY | 15 | Anker erschlossen oder aus rückblickenden, ergebnisabhängigen Beiträgen (GDDY, MU), Focus-List ohne Tag je Titel (AXON, APP, LMB, NMM, DVA), Fenster aus Dauerangaben (GTHX, NLOK, sechs Titel vom 11.12.2025) |
| WATCHLIST | 6 | Kaufkandidaten vom 22.10.2019 sowie PENN (Position vor dem Ausbruch). Maß: Setup am Vortagsschluss, **kein Recall** |
| ENTRY_TYPE_NOT_MODELLED | 1 | DXCM, Pullback-Kauf. Die Engine modelliert das bewusst nicht |
| NEGATIVE | 1 | UPST am 15.10.2021, „extended, nicht kaufen“. Einzelbeobachtung |
| NICHT AUSGEWERTET | 65 | Einstieg unbekannt (u. a. Verlusttrades QCOM, SWIR), nur illustrativ, LOW, ETF/Short/kein Wertpapier, vor 2008 (Buchfälle), DKL-Aufstockung (Doppelzählung), RBLX (Historie zu kurz, vorab bekannt) |

**Ziel nicht erreicht:** Verlangt waren mindestens 30 Fälle, ideal 50. Belegbare Fälle mit Tag gibt es nur **16**. Die Lücke wird nicht mit schwächeren Fällen gefüllt.

**Sicherheitsidentität je Fall**
- Zuordnung über das damalige Listing: Ticker plus Datum, mit einer Aliasliste (NLOK→GEN, VEC→VVX).
- Erwartete CIK aus SEC-Daten, abgeglichen mit dem SEC-Datenlayer. Bei Abweichung `SECURITY_MAPPING_CIK_MISMATCH`.
- Gibt es mehrere passende Listings, gilt der Fall als mehrdeutig.
- Splits vor und nach dem Anker werden mitgeführt.
- Bekannte Fallen:
  - `RNA` gehört heute einem anderen Emittenten (CIK 2093101). 2024 war es Avidity Biosciences (CIK 1599901).
  - MTLS, AEM, NMM, INMD, TSM, ONON und SWIR sind Auslandsemittenten (20-F/40-F) ohne 10-Q. Laut SEC-Submissions-API geprüft.
  - DKL und NMM sind Personengesellschaften.

## 2. Methode (vorregistriert)

**Reihenfolge und Dokumente**
- Reihenfolge: Präregistrierung → Fallsammlung → Opus-Red-Team → Nachtrag A1 → Freeze → genau ein Replay je Fenster.
- `MINERVINI-GROUND-TRUTH-PREREG.json` wurde vor der Fallliste committed.
- `MINERVINI-GROUND-TRUTH-PREREG-A1.json` entstand nach der Fallsammlung und vor jedem Replay. Es setzt die Red-Team-Befunde um.
- `MINERVINI-GROUND-TRUTH-FREEZE.json` enthält die Hashes der Fallliste, der Präregistrierung und des Replay- und Auswertungscodes sowie den Engine-Freeze 1.1.0.

**Anker und Erkennung**
- **Anker D:** der im Beitrag genannte Tag („heute“, „gestern“, Datum, Wochentag).
- **Bewerteter Schluss t\*:** der Handelstag vor D.
- **Fenster-Fälle:** Fenster W; t\* ist dort der Schluss mit den meisten bestandenen Schichten. Diese Wahl ist günstig für den Fall; sie betrifft nur die Attribution, nicht die Erkennung.
- **Erkannt (DETECTED):** Die Engine erzeugt ein Signal, also ein Setup an t und Hoch[t+1] > Pivot, mit Signaltag in D ± 5 Handelstagen (bzw. in W). Die Engine-Logik ist dabei unverändert (`scanSegment`).

**Timing-Klassen** (vorab fest)
- Klassen: EXACT / ±1 / ±3 / ±5 / MISS.
- Zusätzlich berichtet: das Vorzeichen (VU früher oder später) und EXACT+±1 als „starker Beleg“.

**Regel-Attribution**
- Alle Schichten werden an t\* unabhängig ausgewertet: Messrahmen MR-UNI-01, MR-TT-01..08 einzeln, VCP mit Ablehnungsgrund, SEPA mit erster Sperre und Kennzahlen.
- SEPA-Datenlücken (MR-SEPA-00, MR-PIT-01, Beschleunigung nicht nachweisbar) zählen getrennt von Regelverstößen.
- Auslandsemittent oder Personengesellschaft mit fehlenden Quartalsdaten: `DATA_DEFINITION_MISMATCH`.
- Verlust im Vorjahresquartal (GAAP): zusätzlich `EPS_DEFINITION_GAAP_VS_ADJUSTED_POSSIBLE`.

**Kontrollen**
- Je MAIN-Fall 10 Zufallstitel, die am selben t\* den Messrahmen bestehen. Seed: SHA-256 aus Ticker, Status-ID und Anker.
- Diagnostisch eine zweite Gruppe von 10 Titeln, die zusätzlich das Trend Template bestehen.
- Verglichen werden die Kontroll-Signalrate mit dem Recall und die Kontroll-Setup-Rate an t\* mit der Setup-Rate der Fälle.

**Selektivität**
- Trichter je Jahr und Marktphase (SPY-Gesamtrendite über bzw. unter ihrem 200-Tage-Mittel).
- Stufen: Messrahmen, Trend, VCP, Setup, Signal; gezählt je Ausführungstag.

<!-- ERGEBNISSE-DETAIL -->

## 9. Minervinis überprüfbare historische Performance (getrennter Recherche-Block)

Die Recherche lief über eine Websuche; die Einzelquellen wurden nicht im Volltext geprüft. Die Einstufung folgt der Belegart.

| Angabe | Belegart | Einstufung |
|---|---|---|
| US Investing Championship 2021: +334,8 % (Kategorie über 1 Mio. USD) | Wettbewerb. Der Veranstalter prüft nach eigenen Angaben anhand von Brokerauszügen | **Wettbewerb, vom Veranstalter geprüft**, nicht unabhängig auditiert |
| US Investing Championship 1997 | Wettbewerb; in Sekundärquellen widersprüchliche Zahlen (155 % vs. 255 %) | **Wettbewerb, Zahl unklar** |
| 1994–1999/2000: rund 220 % Jahresrendite im Durchschnitt | Eigene Angabe (Bücher, Interviews, Marketing) | **Selbstberichtet**; kein Prüfbericht gefunden |
| Buchbeispiele (Gewinner-Charts) | Eigene Darstellung, nachträglich ausgewählt | **Buchbeispiel, nicht repräsentativ** |
| Marketing (Seminare, Kurse) | Eigene Werbung | **Marketing** |
| Von Dritten unabhängig geprüfte Gesamthistorie | nicht gefunden | **nicht vorhanden** |

Kritiker weisen auf die ungeprüfte Lücke zwischen den Wettbewerbsjahren hin.
Für diese Validierung ist Performance **keine Ground Truth**. Fälle wurden nicht nach späterem Kursverlauf ausgewählt.

## 10. Diskretionärer Vorsprung (benannt, nicht algorithmisiert)

Was die Beiträge selbst erkennen lassen:

- **Visuelle Mustererkennung:**
  - Er spricht von „Cheat“, „Low Cheat“ und „3-C“-Einstiegen. Das sind Einstiege unterhalb des klassischen Pivots in einer noch laufenden Basis.
  - Pullback-Käufe (DXCM) und Positionen vor dem Ausbruch (PENN) kommen vor.
  - Die Engine kauft nur über dem Pivot der letzten Kontraktion.
- **Qualitative Auswahl:**
  - Aus großen Kandidatenlisten (Buy-Alert-Liste mit 45 Namen, Focus List) kauft er nur einzelne Titel.
  - REPL verpasste er, weil er gleichzeitig andere Titel kaufte; das ist eine Kapazitätsentscheidung.
- **Gewinnauslegung:**
  - Er hält in die Zahlen, wenn ein Gewinnpolster besteht (ZUMZ, BROS, KGC, GDDY).
  - Ein Titel kann für ihn „extended“ sein, obwohl die Zahlen gut sind (UPST).
- **Marktkontext:**
  - Progressive Exposure, Index-Shorts als Absicherung, kurze Stops.
  - „Wenig kaufbare Titel“ in einer Rally.
- **Ermessen beim Ausstieg:**
  - Verkauf in Stärke (BROS, IBKR); zu frühes Verkaufen räumt er selbst ein (NVDA).
  - Teilverkäufe mit „Backstop“ und „Freeroll“ (GTHX).

Diese Punkte werden nicht in Regeln übersetzt.

## 11. Grenzen

- Die Ground Truth stammt nur aus Suchindex-Ausschnitten. Autor, Antwortkontext und Bilder sind nicht prüfbar. Der Index ist zudem zugunsten populärer Beiträge verzerrt.
- Verlusttrades haben selten einen Einstiegstag und fallen daher aus. Das ist eine Gewinner-Asymmetrie.
- Es gibt 16 MAIN-Fälle; Cluster aus einem Beitrag werden zusätzlich auf Beitragsebene berichtet.
- Bei einem einzigen Negativfall sind Precision und Falsch-Positiv-Rate nicht messbar.
- Kein dokumentierter Pivot: kein Preisvergleich der Pivots.
- Alle auswertbaren Fälle liegen in DEV. HOLDOUT liefert nur den Trichter.
- DEV und HOLDOUT gelten seit R14 als gesehene Daten.
