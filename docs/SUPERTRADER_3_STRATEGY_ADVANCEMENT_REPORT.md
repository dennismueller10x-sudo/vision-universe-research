# Supertrader 3.0 – Strategy Advancement: Abschlussbericht

Stand: 21. Oktober 2026. Basis: `main` @ `7ad6669f6` (nach #811, #812, #816, #818).
Research Snapshot: `sts1-134d4d62eb88b6ff8d98fe6e56b12a6d`. Abrechnung: `research-v1`.
Alle historischen Aussagen sind `DIAGNOSTIC_NOT_CERTIFIED`. Keine Methode ist live oder handelbar; es gibt keine Orders.

Maschinenlesbar:
- `scripts/supertrader/source-faithful/artifacts/STRATEGY-READINESS-SF3.json` (sechs Dimensionen, generiert);
- Snapshot-Lauf: öffentlicher Teil im Log von Lauf `sf3-research`, versiegelter Teil auf `claude/supertrader-validation-results`.

Einzeldokumente:
- [SUPERTRADER_3_TURTLE_CORRELATION_RESEARCH.md](SUPERTRADER_3_TURTLE_CORRELATION_RESEARCH.md)
- [SUPERTRADER_3_WEINSTEIN_INDUSTRY_STRENGTH.md](SUPERTRADER_3_WEINSTEIN_INDUSTRY_STRENGTH.md)
- [SUPERTRADER_3_MINERVINI_COMPLETION.md](SUPERTRADER_3_MINERVINI_COMPLETION.md)
- [SUPERTRADER_3_MOMENTUM_AND_DATA_FRONTIER.md](SUPERTRADER_3_MOMENTUM_AND_DATA_FRONTIER.md)
- [SUPERTRADER_3_STRATEGY_READINESS.md](SUPERTRADER_3_STRATEGY_READINESS.md) (generiert)

## Ausgangslage und Architekturentscheidung

- Seit #804/#805 haben die 13 Verträge **keine offene Implementierungslücke**. Jede verbleibende Lücke ist manuell, datenblockiert oder quellenoffen.
- Fortschritt war daher nur auf drei Wegen möglich:
  1. neue PIT-Daten nutzen (#811 SIC, Snapshot-Fundamentals, Kurskorrelation);
  2. bisher nur als Frage geführte, aber mechanisch eindeutige Teile umsetzen (Sizing, Stop-Ausführung, Klassifikation);
  3. jede verbleibende Sperre konkret benennen.
- **Keine Engine wurde verändert.** Das gilt für `methods/*.mjs`, `runner/run-research.mjs` und `runner/snapshot-input.mjs`. Der Code-Fingerabdruck `ae2a51ed86ae…` des Turtle-Acceptance-Gates (AG-3) bleibt gültig; ein Test prüft das (`SF3-RUNNER-FINGERPRINT`).
- Alle neuen Bausteine liegen in `source-faithful/research/` und werden über das Feld `researchEvidence` an die Vertragsregeln gebunden. Ein Regelstatus wurde **nicht** hochgestuft.

## 1. Welche 13 Methoden wurden weiterentwickelt?

| Kandidat | Methode | Fortschritt in diesem Auftrag |
|---|---|---|
| C01/C02 | Turtle S1/S2 | Korrelationslimits als vorregistrierte Equity-Modellvarianten, Konzentrationsmessung, Vorher/Nachher-Lauf auf dem Snapshot |
| C03 | Darvas Box | Branchenrang in der PIT-SIC-Gruppe („stärkste Aktie der Branche“), Marktbreite |
| C04/C05 | Weinstein Investor/Trader | PIT-Gruppenchart (SIC-Stellvertreter), Gruppen-Stage-Evidenz, Gruppen-RS, Breite, Volumen, Rotation, Universums-Breite; an Kandidaten angehängt mit Review-Gate |
| C06 | Minervini SEPA/VCP | PIT-RS-Perzentil, PIT-Fundamentals, VCP-Kontraktionsfolge, Pivot-Ausbruch, Sizing-Rechner, mechanische Stop-Ausführung, Sell-Evidenz, Klassifikation |
| C07 | Minervini Power Play | Vier-Klassen-Klassifikation, Ausbruch über das Laufhoch, Stop-Referenz |
| C08 | Kullamägi Breakout | Branchenrang, Breite (`KK-SF-PRIORITY`); ORH bleibt `DATA_BLOCKED` |
| C09 | Kullamägi Episodic Pivot | Datengrenze konkret: 8-K-Item-2.02-Zeitstempel für das Katalysatordatum, IEX-Minuten venue-begrenzt; keine Tagesbalken-Ersatzlogik |
| C10 | Kullamägi Parabolic Short | Datengrenze: kein freier Weg zu historischer Leihe; kein Short-Backtest |
| C11/C12 | Pocket Pivot / Buyable Gap-Up | Leadership- und Markt-Evidenz (`MOKA-SF-*-CONTEXT`); Megacap braucht PIT-Aktienzahl (r13) |
| C13 | Raschke Holy Grail | quellenblockiert bestätigt (Einstieg, Stop, Größe); keine Regel ergänzt |

## 2. Welche neuen mechanischen Komponenten sind vollständig?

| Komponente | Datei#Funktion | Status |
|---|---|---|
| Kausale Korrelationsgruppen (8 Varianten, 2 Unknown-Politiken) | `turtle-correlation.mjs#createCorrelationGroupProvider` | vollständig, getestet; Modellannahme |
| NN-Chain-Clustering (SINGLE/COMPLETE/AVERAGE) mit verschachtelten Schnitten | `turtle-correlation.mjs#nnChainLinkage`, `#cutDendrogram` | vollständig, Golden Case |
| Konzentrationsmessung tatsächlicher Läufe | `turtle-correlation.mjs#concentrationReport` | vollständig |
| PIT-Gruppenindex (gleichgewichtet), CAP-Pfad | `industry-strength.mjs#buildGroupIndices` | vollständig; CAP im Snapshot `DATA_BLOCKED` |
| Gruppen-Stage-Evidenz, RS, Breite, Volumen, Rotation | `industry-strength.mjs` | vollständig (Evidenz) |
| Universums-Breite (A/D, Momentum-Proxy, Hochs/Tiefs) | `market-breadth.mjs#buildMarketBreadth` | vollständig (Proxy) |
| PIT-RS-Perzentil | `minervini-components.mjs#createRsPercentileProxy` | vollständig (Proxy, nie Gate) |
| PIT-Fundamentals (EPS/Umsatz YoY) | `#fundamentalEvidence` | vollständig (Evidenz, ohne Schwelle) |
| Positionsgröße aus Reviewer-Risiko, 25-%-Deckel | `#positionSize` | vollständig, mechanisch bei gegebenem Risiko |
| Stop-Ausführung unabhängig vom Volumen | `#sellEvidence` | vollständig, mechanisch bei gegebenem Stop |
| Power-Play-Klassifikation | `#powerPlayClassify` | vollständig |
| Branchenrang in der PIT-Gruppe | `context-evidence.mjs#industryLeadership` | vollständig (Evidenz) |
| Sechs-Dimensionen-Readiness | `completion/build-readiness-sf3.mjs` | generiert, Teil von `rebuild-all` |
| Snapshot-Runner `sf3-research` | `research/run-sf3-research.mjs` | fail-closed wie `sf-research` |

## 3. Welche Turtle-Korrelationsvarianten sind fachlich vertretbar?

Die Originalregel bleibt **quellenoffen**: W-TUR nennt kein Maß, kein Fenster und keine Schwelle. Vertretbar als **Equity-Modellannahme** sind Varianten, die drei Eigenschaften erhalten:
- die Absicht der Quelle, also Risiko in gleichlaufenden Units zu begrenzen;
- die Verschachtelung eng ⊂ lose;
- die paarweise Lesart der Beispiele.

Daraus folgt:
- **COMPLETE-Linkage** (jedes Paar erfüllt die Schwelle) ist der Lesart der Beispiele am nächsten. SINGLE verkettet zu marktweiten Gruppen und dient nur der Diagnose.
- **Marktresiduen** trennen gemeinsamen Marktfaktor von Substitut- oder Branchengleichlauf. Die Beispiele der Quelle (Gold/Silber, Rohöl/Heizöl) sind Gleichlauf aus gleicher Grundexposition, nicht aus dem Gesamtmarkt.
- **Paar-Quantil-Schwellen** sind regime-robust. Absolute Rohschwellen verschmelzen in Korrelationsspitzen das Universum (synthetischer Test `SF3-TUR-CORR-QUANTILE`).
- Fenster 63, 126 und 252 sowie die Schwellen sind Sensitivitäten, keine Empfehlung. **Ausgewählt wird nicht nach Rendite.**

Snapshot-Messung: Abschnitt „Snapshot-Messung“ unten.

## 4. Wie wird historische Weinstein-Branchenstärke gemessen?

Als **VU-Stellvertreter** des Gruppencharts (`VU_PROXY_OF_WEINSTEIN_GROUP_CHART`):
1. **Mitgliedschaft:** PIT-SEC-SIC je ISO-Woche, abgefragt an der Vorsitzung.
2. **Index:** gleichgewichteter Kettenindex mit Mindestmitgliedern; strikte Lücken (`TOO_FEW_MEMBERS`, Woche ohne Schluss).
3. **Evidenz:** MA30w-Relation der Gruppe, Gruppen-RS gegen SPY, Anteil der Mitglieder über ihrer steigenden MA30w, Volumen-Ratio, Rangliste nach 13-Wochen-RS.
4. **Varianten:** SIC2/3/4, Mindestgröße 3/5/10, Fortschreibung 120/400 Tage, Identitätsbelege streng oder weit.

Grenzen:
- Kapitalgewichtung ist im eingefrorenen Snapshot `DATA_BLOCKED` (keine PIT-Aktienzahl).
- `WEIN-SF-GROUP` bleibt `DATA_BLOCKED`, weil SIC nicht Weinsteins Gruppenliste ist. Die Stage der Gruppe entscheidet der Reviewer (Gate `WEIN-RG-GROUP`).

## 5. Wie weit ist Minervini SEPA/VCP tatsächlich automatisierbar?

**Automatisierbar ist der Screen, nicht die Strategie.**

| Teil | Stand |
|---|---|
| Trend Template 1–7 | mechanisch, als Übersetzung ungeprüft |
| Kriterium 8 (IBD-RS) | `DATA_BLOCKED`; PIT-Perzentil als Proxy, nie Gate |
| Fundamentals | PIT-Evidenz ohne Schwelle; Qualität (Einmaleffekte) braucht den Filing-Text |
| VCP | Kontraktionsfolge als Evidenz; die Gültigkeit des Musters ist manuell, weil die Quelle keine Zähl- oder Halbierungsregel setzt |
| Pivot | Ereignis mechanisch, Volumenurteil in zwei Lesarten |
| Größe | mechanisch bei vom Reviewer gesetztem Risiko |
| Stop | mechanisch, sobald gesetzt |
| Relative Priorität, Einstieg, Sell in Strength | manuell |

## 6. Wie weit ist Minervini Power Play tatsächlich automatisierbar?

- **Mechanisch entscheidbar:** Lauf ≥ +100 % in < 8 Wochen, Korrektur ≤ 25 %, Enge ≤ 10 %, Dauer.
- **Daraus folgen vier Klassen:** `CONFIRMED_MECHANICAL_SETUP`, `MANUAL_REVIEW_SETUP` (Bereich 20–25 %, ODER-Zweig „VCP-Merkmale“, lange Basis), `DATA_BLOCKED_SETUP` und `NOT_QUALIFIED`.
- **Manuell bleiben:** das Urteil „starkes Startvolumen“, Einstieg, Stop und Größe.

## 7. Welche Strategien können vollständig diagnostisch getestet werden?

- Nur **Turtle S1 und S2** (`FULL_DIAGNOSTIC_STRATEGY_BACKTEST`). Auch hier gibt es eine Datenausnahme: Die Korrelationslimits sind in den Referenzläufen nicht durchgesetzt. Die Varianten laufen als Vorher/Nachher-Vergleich daneben.
- Darvas ist eine **mechanische Komponentenstudie**.
- Weinstein, Minervini (beide), KK Breakout, Pocket Pivot und BGU erlauben nur **Screen-Statistiken**.

## 8. Welche brauchen manuelle Prüfung?

- **Darvas:** 8 wesentliche Entscheidungen.
- **Weinstein:** 14 (Investor) bzw. 12 (Trader).
- **Minervini:** 11 (SEPA) bzw. 6 (Power Play).
- **KK Breakout:** 7.
- **Pocket Pivot / BGU:** 7 bzw. 8.
- **EP / Parabolic Short:** 2 bzw. 4.
- **Holy Grail:** 3.
- **Turtle:** keine.

## 9. Welche sind durch Daten blockiert?

| Strategie | blockierende Daten |
|---|---|
| Episodic Pivot | Katalysator, Eröffnungsvolumen, ORH |
| Parabolic Short | Leihe, Intraday-Einstieg, VWAP-Stop |
| Turtle-Short | Leihe (nur Original) |
| KK Breakout ORH-Variante | Intraday |
| Weinstein | NYSE-Breite, Gruppenliste (Proxy vorhanden) |
| Minervini | IBD-RS, Schätzungen/Guidance |
| CAP-Gruppen und BGU-Megacap | PIT-Aktienzahl, die im Snapshot fehlt |

Details: `context-evidence.mjs#DATA_FRONTIER`.

## 10. Welche sind durch Primärquellen blockiert?

- Holy Grail: Einstieg, Stop, Größe.
- Turtle: Korrelationsmaß, Failsafe-Exit, offener Ausbruch (beide Lesarten laufen).
- Darvas: Bottom-Start.
- Morales/Kacher: MA-Verletzung (MOKA-C2), BGU-Volumenfenster.
- Episodic Pivot: Exit.

## 11. Welche Daten würden die größten zusätzlichen Fortschritte ermöglichen?

1. **PIT-Aktienzahl im Snapshot.** Sec-pit r13 liegt im privaten Store; nötig ist nur ein neuer Capture mit dem zusätzlichen Schlüssel. Das ist kostenfrei und schaltet kapitalgewichtete Gruppen und die Megacap-Evidenz frei.
2. **Eingefrorene IEX-Minuten der Triggertage** (privater r9-Cache ab 2017). Damit werden folgende Teile evaluierbar, venue-begrenzt:
   - ORH-Einstiege (KK);
   - EP-Eröffnungsvolumen;
   - Turtle-Intrabar-Reihenfolge (`MA-TUR-INTRABAR-ORDER`).
3. **SEC 8-K Item 2.02 Annahmezeitpunkte** (kostenfrei, je CIK): PIT-Kalender der Ergebnisveröffentlichungen für das EP-Katalysatordatum.
4. **Kostenpflichtig, nur mit Owner-Freigabe:** Schätzungen/Guidance (Minervini, EP) und historische Leihe (Short-Seite).

## 12. Welche Tests und Reviews wurden bestanden?

| Prüfung | Ergebnis |
|---|---|
| `node --test "scripts/supertrader/tests/*.test.mjs"` | 523 Tests: 522 bestanden, 1 bestehender Skip, 0 fehlgeschlagen |
| neue Suiten | `sf-turtle-correlation-research` 10, `sf-industry-strength-research` 7, `sf-minervini-components` 10, `sf-context-evidence-research` 3, `sf-sf3-runner-research` 3 |
| Golden Record (`rebuild-all`) | 115/115 Golden Cases PASS, 206 Tests, 0 fehlgeschlagen |
| Artefakte = frischer Build | bestanden (SF2-COMPLETION-ARTIFACTS, SF3-READINESS) |
| Gate A (`guard-protected-paths.mjs`) | nur Supertrader-Pfade, bestanden |
| Test-Isolation (`check-test-isolation.mjs`) | bestanden |
| AG-3-Code-Fingerabdruck | unverändert (`SF3-RUNNER-FINGERPRINT`) |
| Unabhängiges Review | siehe Abschnitt „Review“ |

## 13. Welche Draft-PRs wurden erstellt?

| PR | Inhalt | Basis |
|---|---|---|
| [#821](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/821) | Turtle-Korrelationsforschung | `main` |
| [#822](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/822) | Weinstein-Branchenstärke und Universums-Breite | #821 |
| [#823](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/823) | Minervini SEPA/VCP und Power Play | #822 |
| [#824](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/824) | Kontext-Evidenz Darvas/KK/MoKa, Daten- und Quellengrenze | #823 |
| Abschluss-PR (Zweig `claude/supertrader-3-strategy-advancement-thxo8e`) | Snapshot-Runner und Workflow-Modus, Verträge (`researchEvidence`), Readiness, Artefakte, dieser Bericht | #824 |

Die PRs sind gestapelt, weil die generierten Artefakte nur einmal am Ende neu gebaut werden. Ein paralleler Neubau in mehreren PRs würde Konflikte erzeugen. Keine Merges ohne Owner-Freigabe.

## 14. Nächste Schritte zu wirklich nutzbaren Supertrader-Strategien

1. **Owner-Entscheidung Turtle:**
   - Soll eine Korrelationsvariante (Vorschlag zur Prüfung: COMPLETE, Residuen oder Paar-Quantil) als deklarierte Equity-Adaption geführt werden?
   - Falls ja, braucht sie eine eigene Szenariozeile im Runner. Die Änderung am Runner erfordert einen neuen AG-3-Lauf.
2. **Snapshot-Erweiterung:** Capture mit `sec-pit-r13` (PIT-Aktienzahl). Damit werden CAP-Gruppen und die Megacap-Evidenz möglich.
3. **Weinstein:** Owner wählt die SIC-Ebene und die Mindestgröße anhand der Coverage-Zahlen des Laufs. Danach folgt ein Reviewer-Pilot mit Gruppenchart-Evidenz an echten Kandidaten, weiterhin ohne Gate.
4. **Minervini:** Review-Paket (`sepaClassify` / `powerPlayClassify`) in die bestehende Supertrader-Review-Oberfläche einbinden. Das ist ein eigener Produkt-PR ohne UI-Neugestaltung und ohne Kaufsignal.
5. **Intraday-Erweiterung:** IEX-Minuten der Triggertage einfrieren. Damit werden die Turtle-Intrabar-Annahme und die KK-ORH-Varianten messbar.
6. **Zertifizierung:** V4-D1 (nicht deklarierte Reverse-Splits) und V4-D2 (Gattungen) im Quant-PR schließen. Erst danach sind historische Zahlen zertifizierbar.
