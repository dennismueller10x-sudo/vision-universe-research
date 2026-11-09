# VU PHASE 3 — PROVIDER QUALIFICATION

Das Verfahren, mit dem Vision Universe Datenanbieter prüft — und warum es so
und nicht einfacher gebaut ist.

Ergebnisse: `VU_PROVIDER_DECISION_MATRIX.md`
Spezifikation: `VU_BACKTEST_EVIDENCE_PROVIDER_SPEC.md`
Kosten: `VU_DATA_PROVIDER_COST_MODEL.md`

---

## Die Frage, die den Unterschied macht

Ein Anbietervergleich beginnt üblicherweise mit: *Welcher Anbieter hat die
meisten Endpunkte, die beste Abdeckung, den besten Preis?*

Diese Phase stellt eine andere Frage:

> **Liefert der Anbieter Daten, die Vision Universe zu einem bestimmten
> Zeitpunkt tatsächlich hätte kennen können?**

Der Unterschied ist nicht akademisch. Ein Anbieter kann bei allen üblichen
Kriterien vorn liegen und diese eine Frage nicht beantworten — und dann ist
jeder Backtest auf seinen Daten eine Vorführung der Rechenlogik, keine Aussage
über die Vergangenheit.

## Warum das Verfahren nicht einfacher ist

Die naheliegende Umsetzung wäre eine Tabelle mit Häkchen. Sie scheitert an drei
Stellen, und jede davon hat im Prüfstand eine Entsprechung.

### 1. Ein Häkchen sagt nicht, woher es kommt

„PIT: ja" kann heißen: *wir haben es gemessen*, *es steht in der Dokumentation*,
*ein Blogartikel sagt es*, oder *wir nehmen es an*. Diese vier Zustände in ein
Feld zu schreiben verliert genau die Information, die man später braucht.

Der Prüfstand führt deshalb **zwei getrennte Angaben**: was der Befund besagt
(`value`) und wie gut er belegt ist (`level`). „Nicht vorhanden, gut belegt"
und „vorhanden, schlecht belegt" sind verschiedene Zustände.

Und: **ein Befund oberhalb von `UNKNOWN` ohne Quellenangabe wird abgelehnt** —
der Prüfstand wirft. Eine Behauptung ohne Quelle ist keine Einstufung.

### 2. Ein Häkchen erzwingt eine Entscheidung, wo keine möglich ist

Bei fehlender Information muss man sich für ja oder nein entscheiden, und beides
ist falsch. `UNKNOWN` ist deshalb ein **zulässiges Endergebnis**, kein
Zwischenzustand.

Der Unterschied zu `NOT_QUALIFIED` ist der Kern:

> Nichts zu wissen ist etwas anderes, als etwas zu widerlegen.

Twelve Data ist `NOT_QUALIFIED` für die Evidenzrolle — geprüft und nicht
geeignet. EODHD ist `UNKNOWN` — nicht geprüft. Die beiden Zustände führen zu
völlig verschiedenen nächsten Schritten: bei dem einen ist die Frage erledigt,
bei dem anderen fängt sie an.

### 3. Ein Häkchen bewertet den Anbieter als Ganzes

Ein Anbieter kann bei Kursen hervorragend und bei Fundamentalhistorie
unbrauchbar sein. Eine Gesamtnote wirft das weg.

Deshalb drei Rollen mit eigenen Anforderungen, und `PARTIALLY_QUALIFIED` heißt
nicht *mittelmäßig*, sondern *für eine Rolle geeignet, für eine andere nicht*.

## Die Belegschwelle

**Ein Gate und eine Rolle verlangen mindestens `DOCUMENTATION_VERIFIED`.**

Diese Schwelle ist die wichtigste Einzelentscheidung im Prüfstand. Ohne sie
qualifiziert eine Erwähnung in einem Vergleichsartikel einen Anbieter, und das
Ergebnis sieht aus wie eine Messung, während es eine Zusammenfassung von
Marketingaussagen ist.

Der Effekt ist messbar: Ohne die Schwelle wären EODHD, FMP und Polygon als
`RESEARCH_DATA_PROVIDER` qualifiziert gewesen — auf Basis je eines
Blogartikels. Mit der Schwelle stehen sie auf `UNKNOWN`, was der Sachlage
entspricht.

## Die drei Gates

Ausführlich in `VU_BACKTEST_EVIDENCE_PROVIDER_SPEC.md`. In Kürze:

| Gate | Frage | Fixture |
|---|---|---|
| **A** | Lässt sich der damals bekannte Wert rekonstruieren? | `MOCK_RESTATEMENT` |
| **B** | Bleiben delistete Unternehmen abrufbar — mit Fundamentaldaten? | `MOCK_DELISTED` |
| **C** | Ist bekannt, wann eine Information verfügbar wurde? | `MOCK_FUTURE_DATA_LEAK` |

Sie sind als **ausführbarer Code** umgesetzt (`quant/engines/gate-tests.js`),
nicht als Prosa-Checkliste. Ein Adapter mit zwei Methoden lässt sich ohne
Änderung daran prüfen:

```js
adapter.getFactsAsOf(securityId, { asOf, periodEnd, metricId })
adapter.getUniverseAsOf({ asOf })
```

### Der MockProvider als Referenz

Er besteht alle drei. Das ist ein methodischer Zweck, kein Selbstlob: **eine
Spezifikation, die niemand erfüllen kann, ist keine Spezifikation, sondern eine
Ausrede.** An seinem Verhalten lässt sich ablesen, wie eine bestandene Antwort
aussieht.

### Die Gegenprobe

Sechs absichtlich fehlerhafte Adapter prüfen, dass die Gates auch wirklich
prüfen — ein Test, der nur den guten Fall abdeckt, fällt nicht auf, wenn er
aufhört zu prüfen:

| Fehlerbild | Fällt durch |
|---|---|
| Kennt nur den heutigen Stand, reicht ihn in die Vergangenheit durch | A |
| Werte unterscheiden sich, aber keine Kennzeichnung der Erstmeldung | A |
| Führt keine delisteten Titel | B |
| Führt Kurse delisteter Titel, aber keine Fundamentaldaten | B |
| Gibt `periodEnd` als Verfügbarkeitszeitpunkt aus | C |
| Liefert Daten, deren Veröffentlichung nach dem Stichtag liegt | C |

Der vierte und der fünfte sind die realistischsten. Beide sehen in der
Schnittstelle völlig unauffällig aus.

## Der Ablauf

```
provider-profiles.json          Befunde mit Quelle, Datum, Belegstufe
        │
        ▼
runProviderQualification()      wertet aus, erfindet nichts
        │
        ├── evaluateGate()      je Gate: PASSED | FAILED | UNKNOWN
        ├── evaluateRole()      je Rolle: QUALIFIED | NOT_QUALIFIED | UNKNOWN
        └── summarizeEvidence() wie viel ist gemessen, wie viel behauptet
        │
        ▼
decisionTable()                 die Vergleichstabelle
```

Laufzeitergebnisse überschreiben Dokumentationsangaben — eine echte Antwort
schlägt jede Behauptung. Widersprechen sie sich, wird das ausdrücklich gemeldet
statt stillschweigend aufgelöst.

## Was diese Phase erreicht hat und was nicht

**Erreicht:** Ein Verfahren, das jeden Anbieter denselben Fragen aussetzt. Drei
ausführbare Tests. Ein Referenzfall, der zeigt, dass die Anforderungen erfüllbar
sind. Sechs Anbieterprofile mit ausgewiesener Belegtiefe. Eine klare Einordnung
von Twelve Data.

**Nicht erreicht:** Ein Urteil. Kein Anbieter besteht alle drei Gates, und kein
einziger Befund ist zur Laufzeit geprüft.

Das ist kein Scheitern der Phase, sondern ihre ehrliche Bilanz. Zwei Gründe:

1. **Kein bezahlter Zugang** — vom Auftrag ausdrücklich ausgeschlossen (§21).
2. **Die Primärdokumentation war nicht abrufbar** — der Egress-Proxy dieser
   Umgebung blockiert die Anbieterdomains. Alle Befunde stammen aus
   Suchergebnissen.

Der zweite Punkt war nicht vorhersehbar und begrenzt das Ergebnis spürbar.
Er ist in `provider-profiles.json`, in jeder Tabelle und in jedem Bericht
vermerkt, statt ihn zu überspielen.

## Der nächste Schritt kostet nichts

Intrinio bietet einen kostenlosen Developer-Sandbox mit echten
Fundamentaldaten der **Dow 30**.

Damit sind **Gate A und Gate C ohne Kosten prüfbar**. Gate B nicht — die Dow 30
sind per Definition Überlebende, und ein Zugang, der nur Überlebende kennt, kann
die Frage nach den Nicht-Überlebenden nicht beantworten.

Zwei von drei Gates, an einem Anbieter, für null Euro. Das ist die genaue Grenze
dessen, was ohne Geld erreichbar ist — und der erste Schritt, unabhängig davon,
welcher Anbieter am Ende gewählt wird.
