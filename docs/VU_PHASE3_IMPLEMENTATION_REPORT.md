# VU PHASE 3 — IMPLEMENTATION REPORT

Anbieterqualifikation, Point-in-Time-Anforderungen und eine gemeinsame
Bereinigungssemantik.

Stand: 7. September 2026 · Branch `claude/vision-universe-v1-build-uyp8qp`
**232 Tests grün** (177 aus Phase 2, 55 neu) · 22 Dateien, ~6 250 Zeilen

---

## Die zehn Antworten

### 1. Bester Kandidat für Market Data?

**Twelve Data — der bereits angebundene.**

Nicht mangels Alternative, sondern weil er die Rolle erfüllt, die er im System
hat: Tageshistorie für ein kleines Referenzuniversum. `MARKET_DATA_PROVIDER:
QUALIFIED`. Es gibt derzeit keinen Anlass, ihn zu ersetzen.

Polygon wäre der naheliegende Nachfolger, falls Intraday oder Tick-Daten
gebraucht werden. EODHD, falls das Universum über die USA hinauswächst — dort
sind 150 000+ Ticker einschließlich Europa dokumentiert.

### 2. Bester Kandidat für PIT Fundamentals?

**Sharadar** — mit einem großen Vorbehalt.

Die Architektur ist erkennbar für diesen Zweck gebaut: die Trennung in
AR-Dimensionen (as-reported, point-in-time) und MR-Dimensionen
(most-recent-reported) ist genau die Unterscheidung, um die es geht. Jeder
Datensatz trägt ein `datekey` — das SEC-Einreichungsdatum, nicht den Zeitpunkt
der Datenbankaktualisierung. **Gate C ist damit bestanden.** Historie ab 1990,
16 000+ Unternehmen einschließlich delisteter.

Der Vorbehalt ist nicht technisch, sondern kommerziell: professionelle Nutzer
müssen die Daten über Nasdaq Data Link beziehen, und eine öffentliche Website
ist mit hoher Wahrscheinlichkeit professionelle Nutzung. Die recherchierten 29
bzw. 69 USD/Monat sind damit vermutlich nicht der zutreffende Tarif.

**Eine Falle, die ein Adapter abfangen muss:** Die AR-Dimensionen sind
point-in-time, die MR-Dimensionen ausdrücklich nicht. Ein Backtest, der
versehentlich MR verwendet, sieht rückwirkend korrigierte Zahlen — und nichts
daran sieht falsch aus. Die Dimension muss erzwungen, nicht angeboten werden.

### 3. Bester Kandidat für echte historische Backtests?

**Derzeit keiner.**

Kein Anbieter besteht alle drei Gates. Das ist keine Verlegenheitsantwort,
sondern das Ergebnis: Gate C ist bei Sharadar bestanden, Gate A und B sind bei
allen sechs offen.

Der Grund ist bei Sharadar nicht, dass die Fähigkeit fehlt — sie ist plausibel
belegt. Der Grund ist, dass der Beleg für Gate B aus einer Sekundärquelle
stammt und für Gate A eine Laufzeitprüfung braucht. Ob die AR-Reihe bei einer
**echten** Korrektur zwei unterscheidbare Ausprägungen führt, lässt sich nicht
aus Dokumentation ableiten.

Nach heutigem Stand ist Sharadar der wahrscheinlichste Kandidat. „Wahrscheinlich"
ist kein Qualifikationsergebnis.

### 4. Analyst Estimates / Revisions?

**Nicht recherchiert — bewusst.**

Der sechste Faktor (Estimate Revisions) ist seit V1 als `available: false`
markiert und wird nicht mit erfundenen Daten befüllt. Solange Gate A und B bei
den Fundamentaldaten offen sind, wäre eine Estimates-Recherche verfrüht: sie
beantwortet keine Frage, die gerade im Weg steht.

Eine Empfehlung ohne Recherche wäre genau das, was §13 untersagt.

### 5. Welche Fähigkeiten wurden zur Laufzeit getestet?

**Bei Anbietern: keine einzige.** Es wurde in dieser Phase keine Anfrage an
Sharadar, Intrinio, EODHD, FMP oder Polygon gestellt. Nirgends in den Profilen
steht `RUNTIME_VERIFIED`, und ein Test (`Q10`) hält das fest.

**Am eigenen System: alles.** Der MockProvider wurde gegen alle drei Gates
laufen gelassen und besteht sie — das belegt, dass die Anforderungen erfüllbar
sind. Sechs absichtlich fehlerhafte Adapter fallen mit benanntem Grund durch.

Die Unterscheidung ist wichtig: geprüft ist das *Verfahren*, nicht die
*Anbieter*.

### 6. Welche Fähigkeiten sind nur dokumentationsbasiert?

Alle Anbieterbefunde — und selbst das mit einer Einschränkung.

Die Primärdokumentation war aus dieser Umgebung **nicht direkt abrufbar**: der
Egress-Proxy blockiert `sharadar.com`, `data.nasdaq.com`, `docs.intrinio.com`
und `intrinio.com`. Alle Befunde stammen aus Suchergebnissen.

Wo ein Suchergebnis Inhalt der anbietereigenen Dokumentationsseite wiedergibt,
ist er als `DOCUMENTATION_VERIFIED` eingestuft; wo er aus Vergleichsartikeln
stammt, als `THIRD_PARTY_REPORTED`. Die Abrufart ist in
`provider-profiles.json` vermerkt.

| Anbieter | aus Primärdoku | aus Sekundärquellen | ungeprüft |
|---|---|---|---|
| Sharadar | 6 | 2 | 7 |
| Intrinio | 3 | 1 | 11 |
| Twelve Data | 11 | 0 | 4 |
| EODHD | 1 | 5 | 9 |
| FMP | 0 | 2 | 13 |
| Polygon | 0 | 1 | 14 |

**Der wichtigste Einzelbefund der Recherche** ist eine Begriffsverwechslung: Die
auffindbare „point-in-time"-Stelle bei Intrinio lautet *„Balance sheet data is
available on a FY or QTR basis only due to its point-in-time nature."* Das meint
die Bilanz als **Stichtagsrechnung**, nicht die bitemporale Verfügbarkeit einer
Kennzahl. Derselbe Begriff für eine völlig andere Sache. Wer das als PIT-Beleg
nimmt, qualifiziert einen Anbieter auf einem Missverständnis.

### 7. Wofür wäre ein kostenpflichtiger Zugang nötig?

| Prüfung | Kostenpflichtig? | Warum |
|---|---|---|
| Gate A (Restatement) | **nein** | Intrinio-Sandbox reicht |
| Gate C (Verfügbarkeitszeitpunkt) | **nein** | Intrinio-Sandbox reicht |
| **Gate B (Delisting)** | **ja** | Der Sandbox deckt die Dow 30 ab — per Definition Überlebende |
| Sharadar, alle drei Gates | **ja** | Kein kostenloser Zugang festgestellt |
| Total-Return-Bereinigung prüfen | **ja** | Setzt Kursdaten mit Dividendenbereinigung voraus |
| Historientiefe verifizieren | **ja** | Sandbox-Zeiträume sind begrenzt |

`REQUIRES_PAID_VALIDATION` gilt damit vor allem für **Gate B**. Das ist die
Prüfung, die sich grundsätzlich nicht mit einem Testzugang machen lässt: ein
Zugang, der nur Überlebende kennt, kann die Frage nach den Nicht-Überlebenden
nicht beantworten.

### 8. Welcher Anbieter sollte als ERSTER bezahlt getestet werden?

**Sharadar** — aber erst nach zwei kostenlosen Schritten.

**Schritt 0 (kostenlos):** Intrinio-Sandbox anfragen, Adapter mit den zwei
Gate-Methoden bauen, Gate A und C gegen echte Dow-30-Daten laufen lassen. Das
liefert die ersten `RUNTIME_VERIFIED`-Befunde des Projekts und prüft nebenbei,
ob der Prüfstand an echten Daten funktioniert.

**Schritt 0.5 (kostenlos, aber nicht technisch):** Die Sharadar-Lizenzfrage
klären. Welcher Tarif gilt für eine öffentliche Website? Ohne diese Antwort ist
jede Kostenrechnung gegenstandslos — es hilft nichts, einen Anbieter zu
qualifizieren, dessen Nutzung nicht zulässig ist.

**Dann Sharadar**, weil er als einziger für Gate C bereits einen belastbaren
Beleg hat und die Historientiefe (ab 1990) mitbringt, die Intrinio (ab 2007)
fehlt. Ein Backtest über einen vollständigen Zyklus einschließlich 2000 und 2008
ist mit 18 Jahren Historie nicht möglich.

### 9. Welcher minimale Plan reicht dafür?

Für die Prüfung — nicht für den Betrieb:

| Zweck | Plan | Kosten (Stand 2026-09-07) |
|---|---|---|
| Gate A + C, ohne Kosten | Intrinio Developer Sandbox | **0 USD** |
| Sharadar, alle drei Gates | Full History Bundle | 69 USD/Monat bzw. 499 USD/Jahr |

**Die 5-Jahres-Variante (29 USD/Monat) reicht nicht.** Gate A braucht einen
Restatement-Fall mit ausreichendem Abstand zwischen Erstmeldung und Korrektur,
Gate B ein Delisting im Testzeitraum. Fünf Jahre Historie machen beides zur
Glückssache.

Ein Monat genügt für die Prüfung. Falls die Gates bestanden werden, ist die
Frage danach nicht mehr, welcher Plan für den Test reicht, sondern welcher
Tarif für eine öffentliche Website gilt — und das ist die Frage aus Schritt 0.5.

### 10. Welche Datenklasse zuerst produktiv integrieren?

**Kapitalmaßnahmen (Splits und Dividenden) als Ereignisse.**

Nicht Fundamentaldaten, obwohl die der eigentliche Engpass sind. Der Grund ist
eine Reihenfolge, die sich aus der Bereinigungssemantik ergibt:

1. Die Kursreihen sind heute `SPLIT_ADJUSTED`. Damit sind Momentum und
   Volatilität zulässig, Renditeaussagen nicht.
2. Um auf `TOTAL_RETURN` zu kommen, braucht es **Dividendenereignisse** — eine
   Zusicherung reicht nicht, eine Stufe höher kommt man nur mit Daten.
3. `TOTAL_RETURN` ist Voraussetzung für jede Renditeaussage und damit für
   jeden Backtest, der mehr sein soll als eine Vorführung.

Kapitalmaßnahmen sind außerdem die einfachste der offenen Datenklassen: klar
abgegrenzt, gut prüfbar, geringes Volumen, und der Nutzen ist unmittelbar
sichtbar — eine Datenklasse, deren korrekte Integration sich an der
Qualitätsprüfung selbst zeigt.

Fundamentaldaten kommen danach, und erst wenn ein Anbieter Gate A und B
bestanden hat.

---

## Was gebaut wurde

### MEDIUM-7: die gemeinsame Bereinigungssemantik

Der offene Auditbefund aus Phase 2 war kein Rechenfehler. Beide Systemteile
rechneten richtig und nannten zwei verschiedene Dinge gleich:

| | rechnet auf | nannte das Ergebnis |
|---|---|---|
| Quant-Bereich | total-return-bereinigt | „Rendite" |
| Dashboard | splitbereinigt | „Rendite" |

Gelöst über eine gemeinsame **Definition**, nicht eine gemeinsame Bibliothek —
zwischen JavaScript und Python wäre die Kopplung zu teuer:

```
quant/methodology/price-adjustment-v1.json    ← die Wahrheit
   ├── quant/engines/price-semantics.js        liest sie
   └── scripts/dashboard/price_semantics.py    liest dieselbe Datei
```

Vier Stufen (`RAW`, `SPLIT_ADJUSTED`, `TOTAL_RETURN`, `UNKNOWN`), zwölf
Kennzahlen mit Mindestanforderung, und eine Sprachregel: **„Rendite" ohne Zusatz
ist ausschließlich für `TOTAL_RETURN` zulässig.**

`UNKNOWN` liegt im Rang **unter** `RAW`. Bei `RAW` weiß man, was fehlt.

**Die Migration änderte keine einzige Zahl** und prüfte die Einstufung vorher an
den Daten nach:

| Titel | Splittag | Verhältnis | Beobachtet |
|---|---|---|---|
| NVDA | 2021-07-20 | 4:1 | 1,009 → bereinigt |
| NVDA | 2024-06-10 | 10:1 | 0,993 → bereinigt |
| AMZN | 2022-06-06 | 20:1 | 0,980 → bereinigt |

Stünde an einem dieser Tage ein Sprung nahe dem Splitfaktor, bräche die
Migration ab, statt eine falsche Zusicherung zu schreiben.

Die nachgelagerten Skripte **verweigern seither die Berechnung**, wenn die
Stufe fehlt — statt eine richtige Zahl mit unbekannter Bedeutung zu erzeugen.

### Die Gates als ausführbarer Code

`quant/engines/gate-tests.js`. Die drei V1-Fixtures wurden von Selbsttests zu
Anbietertests. Der MockProvider besteht alle drei — eine Spezifikation, die
niemand erfüllen kann, ist keine.

Sechs absichtlich fehlerhafte Adapter prüfen die Trennschärfe. Die beiden
realistischsten, weil sie in der Schnittstelle völlig unauffällig aussehen:

- ein Anbieter, der Kurse delisteter Titel führt, aber keine Fundamentaldaten
  (der Survivorship Bias besteht fort, eine Ebene tiefer)
- ein Anbieter, der `periodEnd` als Verfügbarkeitszeitpunkt ausgibt

### Der Prüfstand

`quant/engines/provider-qualification.js` +
`quant/config/provider-profiles.json` +
`scripts/market/qualify-providers.mjs`

Trennt Befund (`value`) von Belegstufe (`level`). Verlangt bei jedem Befund
oberhalb von `UNKNOWN` eine Quellenangabe — sonst wirft er.

Die **Belegschwelle** ist die wichtigste Einzelentscheidung: ein Gate und eine
Rolle verlangen mindestens `DOCUMENTATION_VERIFIED`. Ohne sie wären EODHD, FMP
und Polygon als `RESEARCH_DATA_PROVIDER` qualifiziert gewesen — auf Basis je
eines Blogartikels.

### Mehrere Anbieter nebeneinander

`quant/engines/data-precedence.js`

Vorrangregeln, deren erstes Kriterium **nicht** die Anbietergüte ist, sondern
die Eignung für den Zweck: für eine historische Abfrage schlägt eine
zeitpunktgenaue Quelle jede aktuellere, auch eine deutlich bessere.

Zwei Fälle, die dabei leicht danebengehen:

- **Ein einzelner Kandidat wird nicht vorab durchgewinkt.** Sonst umgeht genau
  der Fall die Prüfung, in dem es keine Alternative gibt — und die Versuchung
  am größten ist, den vorhandenen Wert zu nehmen. *(Das war zwischenzeitlich
  ein Fehler im eigenen Code und wurde behoben.)*
- **Die Abweichung wird über alle Kandidaten gerechnet**, auch die
  ausgeschlossenen. Sonst verschwindet die interessanteste Information genau
  dann, wenn der Ausschluss das Ergebnis verändert hat.

Dazu `DataQualityScore` (ausdrücklich `internalOnly` — eine Zahl wie
„Datenqualität 72" wirkt präzise und ist es nicht) und `dataSnapshotId`
(`VU-US-EQUITY-2026-09-07-v1`, mit kalendarischer Datumsprüfung).

---

## Ergebnis der Qualifikation

| Anbieter | Beste Rolle | PIT | Delisted | Restatements | Lizenz | Qualifikation | Laufzeit |
|---|---|---|---|---|---|---|---|
| Sharadar | Research | **+** | ? | ? | offen | `PARTIALLY_QUALIFIED` | 0/15 |
| Intrinio | Research | ? | ? | ? | offen | `PARTIALLY_QUALIFIED` | 0/15 |
| Twelve Data | Marktdaten | **–** | **–** | **–** | offen | `PARTIALLY_QUALIFIED` | 0/15 |
| EODHD | – | ? | ? | ? | offen | `UNKNOWN` | 0/15 |
| FMP | – | ? | ? | ? | offen | `UNKNOWN` | 0/15 |
| Polygon | – | ? | ? | ? | offen | `UNKNOWN` | 0/15 |

Twelve Data ist der einzige mit **widerlegten** statt unbekannten Befunden —
das ist ein Fortschritt gegenüber Unwissen, kein Mangel. Die Rolle, die er im
System hat, erfüllt er.

**Alle Lizenzfragen sind bei allen sechs Anbietern offen** (`LEGAL_REVIEW_REQUIRED`).
Das ist unverändert seit Phase 2 und die praktisch dringlichste offene Frage:
Ein Preis für eine nicht zulässige Nutzung ist keine Information.

---

## Die Grenzen dieser Phase

**Kein Urteil.** Kein Anbieter besteht alle drei Gates. Das Verfahren steht, das
Ergebnis fehlt.

**Kein Laufzeitbefund.** Der Egress-Proxy blockierte die Anbieterdomains; ein
bezahlter Zugang war ausgeschlossen. Beides ist vermerkt statt überspielt.

**Keine echte Fundamentals-Integration** — nach §24 ausdrücklich nicht erlaubt,
solange kein qualifizierter Zugang vorliegt. Es wurde kein Fundamentalwert
vorgetäuscht und kein Mockwert als echt gekennzeichnet.

**Estimates, Makro und News nicht recherchiert.** Sie stehen keiner offenen
Frage im Weg.

---

## Nächste Schritte, nach Nutzen sortiert

1. **Intrinio-Sandbox anfragen** und Gate A + C gegen echte Dow-30-Daten laufen
   lassen. Kostet nichts, liefert die ersten `RUNTIME_VERIFIED`-Befunde.
2. **Sharadar-Lizenzfrage klären.** Welcher Tarif gilt für eine öffentliche
   Website? Vor jeder Kostenrechnung.
3. **Primärdokumentation direkt lesen**, sobald eine Umgebung ohne
   Egress-Beschränkung verfügbar ist. Könnte Gate B bei Sharadar schließen.
4. **Erst dann** ein bezahlter Sharadar-Monat für alle drei Gates.
5. **Danach** Kapitalmaßnahmen als erste produktive Datenklasse.

---

## Dokumente dieser Phase

| Dokument | Inhalt |
|---|---|
| `VU_PHASE3_PROVIDER_QUALIFICATION.md` | das Verfahren und warum es so gebaut ist |
| `VU_PIT_DATA_REQUIREMENTS.md` | was Point-in-Time bedeutet und was nicht |
| `VU_BACKTEST_EVIDENCE_PROVIDER_SPEC.md` | Mindestanforderungen und die drei Gates |
| `VU_DATA_PROVIDER_COST_MODEL.md` | Kostenkategorien mit Zeitstempel |
| `VU_PROVIDER_DECISION_MATRIX.md` | der Stand je Anbieter |
| `VU_PRICE_ADJUSTMENT_SEMANTICS.md` | RAW / SPLIT_ADJUSTED / TOTAL_RETURN |
| `VU_PHASE3_IMPLEMENTATION_REPORT.md` | dieses Dokument |
