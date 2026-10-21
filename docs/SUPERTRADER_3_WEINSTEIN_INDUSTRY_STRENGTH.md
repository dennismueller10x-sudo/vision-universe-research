# Supertrader 3.0 – Weinstein: historische Branchenstärke (PIT-SIC)

Stand: 21. Oktober 2026. Code:
- `scripts/supertrader/source-faithful/research/industry-strength.mjs` (`sf3-industry-strength-1.0.0`)
- `scripts/supertrader/source-faithful/research/market-breadth.mjs` (`sf3-market-breadth-1.0.0`)

Tests: `scripts/supertrader/tests/sf-industry-strength-research.test.mjs`. Die Weinstein-Screens (`methods/weinstein.mjs`, `sf-weinstein-1.0.0`) bleiben unverändert. Die Branchenwerte werden einem Kandidaten nur als **Evidenz** angehängt (`withIndustryEvidence`) und nie als Gate verwendet.

## 1. Was die Quelle verlangt

| Regel | Fundstelle | Modalität | Inhalt | Umsetzung |
|---|---|---|---|---|
| WEIN-GROUP | B09 S. 80 | HARD | kein Long-Kauf in negativer Gruppe; zuerst die Stage des Gruppencharts prüfen | Gruppenchart als **VU-Stellvertreter**; die Stage-Entscheidung trifft der Reviewer (Review-Gate `WEIN-RG-GROUP`) |
| WEIN-GROUP2 | S. 80 | CONTEXTUAL | eine gesunde Gruppe genügt; Aktie und Gruppe müssen nicht am selben Punkt stehen | Evidenz bezieht sich auf die Gruppe, nicht auf die Gleichzeitigkeit |
| WEIN-DIVERS3 | S. 138 | STRONG_PREFERENCE | über mehrere technisch gute Gruppen streuen | Rotation/Rangliste als Evidenz |
| WEIN-SH-GRP | S. 233 | STRONG_PREFERENCE | Short: schwache Gruppe unter MA, RS fallend | `BELOW_FALLING_MA30W` und RS als Evidenz (Short bleibt außerhalb des Umfangs) |
| WEIN-MARKET | | | Markt über Stage-Analyse und NYSE-Breite | NYSE bleibt `DATA_BLOCKED`; Universums-Breite als ausgewiesener Stellvertreter |

Weinstein las veröffentlichte Gruppencharts (S&P- bzw. Value-Line-Gruppen). Eine SIC-Gruppe ist eine **moderne VU-Interpretation** (`sourceStatus: VU_PROXY_OF_WEINSTEIN_GROUP_CHART`) und keine Originalregel.

## 2. PIT-Konstruktion

1. **Mitgliedschaft:** je ISO-Woche einmal, mit dem Datum der Sitzung **vor** dem ersten Handelstag der Woche. Grundlage ist der Adapter `makeWeinsteinGroupMembership` mit SIC zum Einreichungszeitpunkt und 16:00-ET-Schnitt. Ein SIC-Wechsel innerhalb einer Woche gilt ab der Folgewoche: höchstens eine Woche Verzögerung, nie verfrüht. Test: `SF3-WEIN-GROUP-PIT`.
2. **Tagesrendite eines Mitglieds:** Sie braucht Balken an *t* und *t−1* (split-adjustiert). Es wird nichts aufgefüllt.
3. **Gruppenrendite:**
   - `EQUAL`: Mittel der Mitgliedsrenditen.
   - `CAP`: gewichtet mit Aktienzahl × Vortagesschluss.
   - Ist die Mindestzahl gültiger Mitglieder unterschritten, gilt die Sitzung als `TOO_FEW_MEMBERS`. Der Index hat dann eine Lücke.
4. **Index:** verkettet ab 100. Eine Woche mit Lücke hat keinen Schlusskurs. MA30w braucht 30 vollständige Wochen.
5. **Kausalität der Evidenz:** `groupEvidence` nutzt die letzte **vollständige** Woche vor der Ausbruchswoche. Abschneidetest: Zukunftsdaten ändern frühere Indexwerte nicht.

**Kapitalgewichtung:** Der eingefrorene Snapshot enthält keine PIT-Aktienzahl. Sec-pit r12 trägt nur EPS und Umsatz; die Aktienzahl liegt im r13-Store, der nicht eingefroren ist. Ohne `sharesAt` liefert `CAP` daher `DATA_BLOCKED / NO_PIT_SHARES_OUTSTANDING_IN_SNAPSHOT`, und es wird keine Gewichtung vorgetäuscht. Mit einer PIT-Quelle ist der Rechenweg umgesetzt und getestet; fehlende Gewichte werden gezählt, nicht ersetzt.

## 3. Kennzahlen (alle Evidenz)

| Kennzahl | Funktion | Inhalt |
|---|---|---|
| Gruppen-Stage-Evidenz | `maRelation` | `ABOVE/BELOW` × `RISING/FLAT/FALLING` MA30w, Abstand zur MA, Steigung über 1 und 4 Wochen |
| Gruppenrelative Stärke | `groupEvidence.relativeStrength` | RS-Linie Gruppe/SPY, normiert auf das 52-Wochen-Mittel, Änderung über 4 und 13 Wochen (gleiche Logik wie bei Einzelaktien) |
| Gruppenbreite | `groupBreadth` | Anteil der Mitglieder über ihrer steigenden eigenen MA30w (Vorlage, Alternative C) |
| Volumenverhalten | `groupVolume` | Mittel und Median der Wochenvolumen-Ratio je Mitglied gegenüber den eigenen 4 Vorwochen |
| Branchenrotation | `groupRanking` | Rangliste der Gruppen nach 13-Wochen-RS-Änderung; Gruppen mit Lücken bleiben ohne Rang |
| Marktkontext | `buildMarketBreadth` | Advance/Decline des Research-Universums, A/D-Linie, Momentum-Proxy (200-Sitzungen-Mittel der Netto-Advances), neue 52-Wochen-Hochs und -Tiefs, Anteil über steigender MA150 |

Für keine Kennzahl ist eine Schwelle für „gesund“ oder „negativ“ gesetzt: Die Quelle nennt keine Zahl.

## 4. Vorregistrierte Varianten

| Variante | SIC-Ebene | Gewichtung | Mindestmitglieder | maxAgeDays | Identitätsbelege | Rolle |
|---|---|---|---|---|---|---|
| `SIC3-EW-MIN5-400D-WIDE` | SIC3 | gleich | 5 | 400 | Name+XBRL, heutiger Ticker | Vergleichsbasis (Reihenfolge der Entscheidungsvorlage) |
| `SIC3-EW-MIN5-400D-STRICT` | SIC3 | gleich | 5 | 400 | nur Name+XBRL | Identität |
| `SIC2-EW-MIN5-400D-WIDE` | SIC2 | gleich | 5 | 400 | beide | Granularität |
| `SIC4-EW-MIN5-400D-WIDE` | SIC4 | gleich | 5 | 400 | beide | Granularität |
| `SIC3-EW-MIN3-400D-WIDE` / `MIN10` | SIC3 | gleich | 3 / 10 | 400 | beide | Gruppengröße |
| `SIC3-EW-MIN5-120D-WIDE` | SIC3 | gleich | 5 | 120 | beide | Fortschreibung |
| `SIC3-CAP-MIN5-400D-WIDE` | SIC3 | Kapital | 5 | 400 | beide | im Snapshot `DATA_BLOCKED` |

400 Tage entsprechen einem 10-K-Zyklus mit Puffer, 120 Tage einem Quartalszyklus. Beide Werte sind Annahmen. Die Varianten sind Forschungsreferenzen (`SF3-RESEARCH-VARIANT:*`), keine Owner-Freigaben.

## 5. Integration und Review-Gates

`withIndustryEvidence(record, { built, bench, breadth, variant })`:
- hängt `WEIN-SF-GROUP` an (Gruppe, Woche, Mitglieder, Stage-Evidenz, RS, Breite, Volumen);
- hängt `WEIN-SF-MARKET` an (Universums-Breite);
- setzt das Review-Gate `WEIN-RG-GROUP` (`blocksAutomation: true`);
- lässt `status: MANUAL_REVIEW_REQUIRED` und `buyDeclarationAllowed: false` unverändert;
- meldet eine unbekannte Mitgliedschaft als `UNKNOWN_MEMBERSHIP`, das heißt weder negativ noch gesund.

## 6. Grenzen

- SIC ist ein Stellvertreter: Sie wird von der SEC vergeben, ist grob und enthält Sammelcodes (6770, 6798, 2834).
- Das Universum ist das des Snapshots. Delistete Titel sind eingeschlossen, ETFs und Titel ohne CIK nicht.
- Keine Trading-Readiness: WEIN-SF-STAGE, WEIN-SF-GROUP (Gruppen-Stage) und weitere qualitative Kriterien bleiben manuell.
