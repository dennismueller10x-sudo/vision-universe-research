# VU BACKTEST EVIDENCE PROVIDER SPEC

Die Mindestanforderungen an einen Anbieter, dessen Daten einen Backtest zum
Nachweis machen — und die drei Tests, die darüber entscheiden.

Maschinenlesbar: `quant/methodology/backtest-evidence-v1.json`
Ausführbar: `quant/engines/gate-tests.js`
Prüfstand: `quant/engines/provider-qualification.js`

---

## Drei Rollen, drei verschiedene Fragen

Ein Anbieter wird nicht als Ganzes bewertet, sondern je Rolle. Das ist keine
Höflichkeit gegenüber schwächeren Anbietern, sondern die Feststellung, dass die
Rollen unterschiedliche Fragen an dieselben Daten stellen.

| Rolle | Frage | Gates |
|---|---|---|
| `MARKET_DATA_PROVIDER` | Was kostet dieses Papier heute und was hat es gekostet? | keine |
| `RESEARCH_DATA_PROVIDER` | Wie steht dieses Unternehmen heute da? | keine |
| `BACKTEST_EVIDENCE_PROVIDER` | Was hätte man an einem historischen Tag gewusst? | alle drei |

Ein hervorragender Marktdatenanbieter ist **nicht** automatisch als
Evidenzquelle geeignet. Die Marktdatenrolle stellt überhaupt keine Anforderung
an historische Rekonstruierbarkeit — sie muss nur wissen, was der Kurs war,
nicht was man damals über das Unternehmen wusste.

## Die Belegstufen

Der Prüfstand führt **zwei getrennte Angaben** je Anforderung: was der Befund
besagt (`value`) und wie gut er belegt ist (`level`). Beides in einem Feld zu
führen wäre der naheliegende Weg und wäre falsch — „nicht vorhanden, gut
belegt" und „vorhanden, schlecht belegt" sind verschiedene Zustände, und ein
einzelnes Feld kann sie nicht auseinanderhalten.

| Stufe | Rang | Bedeutet |
|---|---|---|
| `RUNTIME_VERIFIED` | 4 | Es wurde eine echte Anfrage gestellt und die Antwort geprüft |
| `DOCUMENTATION_VERIFIED` | 3 | Die Anbieterdokumentation wurde gelesen, die Stelle ist zitierbar |
| `THIRD_PARTY_REPORTED` | 2 | Eine Quelle außerhalb des Anbieters berichtet es |
| `RUNTIME_VERIFICATION_REQUIRED` | 1 | Behauptet, aber nur an echten Daten prüfbar |
| `REQUIRES_PAID_VALIDATION` | 1 | Prüfbar, aber nur mit kostenpflichtigem Zugang |
| `UNKNOWN` | 0 | Niemand hat nachgesehen |
| `CONTRADICTED` | −1 | Geprüft und nicht vorhanden |

**Ein Gate und eine Rolle verlangen mindestens `DOCUMENTATION_VERIFIED`.** Ohne
diese Schwelle qualifiziert eine Erwähnung in einem Vergleichsartikel einen
Anbieter, und die Ergebnistabelle sieht aus wie ein Prüfergebnis, während sie
eine Sammlung von Marketingaussagen zusammenfasst.

`CONTRADICTED` ist stärker als `UNKNOWN`: hier wurde gesucht und nichts
gefunden. `UNKNOWN` heißt, es wurde nicht gesucht.

## Gate A — Restatement

> Kann zu einem historischen Datum exakt der damals bekannte Wert
> rekonstruiert werden?

**Prüfverfahren.** Dieselbe Frage zweimal, mit unterschiedlichem Stichtag —
einmal vor der Korrektur, einmal danach.

**Bestanden**, wenn die Antworten sich unterscheiden **und** die frühere als
Erstmeldung gekennzeichnet ist.

**Durchgefallen**, wenn:

| Befund | Was er bedeutet |
|---|---|
| Beide Stichtage liefern denselben Wert | Der Anbieter kennt nur den heutigen Stand und reicht ihn in die Vergangenheit durch |
| Werte unterscheiden sich, keine Kennzeichnung | Nicht prüfbar, ob der frühere wirklich der damalige war |
| Früher Wert nicht als `original` gekennzeichnet | Die Reihenfolge stimmt nicht |

Der erste Fall ist der häufigste und der harmloseste in seiner Erscheinung: die
Datenbank hält je Periode genau einen Wert. Nichts daran sieht kaputt aus.

## Gate B — Delisting

> Bleiben Wertpapiere abrufbar, die heute delistet oder insolvent sind?

**Prüfverfahren.** Drei Abfragen: das Universum zu einem historischen Stichtag,
das heutige Universum, und die Fundamentaldaten des ausgeschiedenen Titels.

**Bestanden**, wenn der Titel im historischen Universum ist, im heutigen nicht,
**und Fundamentaldaten hat**.

Der dritte Punkt ist der, der am häufigsten übersehen wird. Viele Anbieter
führen Kursreihen delisteter Titel und keine Bilanzen. Für eine Strategie, die
nach Fundamentaldaten auswählt, ist so ein Titel unsichtbar — der Survivorship
Bias besteht fort, eine Ebene tiefer und schlechter zu bemerken.

## Gate C — Verfügbarkeitszeitpunkt

> Lässt sich zuverlässig bestimmen, wann eine Information verfügbar wurde?

**Prüfverfahren.** Eine Stichtagsabfrage, dann drei Prüfungen an der Antwort.

| Prüfung | Durchgefallen, wenn |
|---|---|
| Zeitstempel vorhanden | eine Kennzahl weder `availableAt` noch `filedAt` noch `publishedAt` hat |
| Stichtag wirksam | eine Kennzahl geliefert wird, deren Veröffentlichung nach dem Stichtag liegt |
| Zeitstempel echt | **kein einziger** Zeitstempel nach dem zugehörigen `periodEnd` liegt |

Die dritte Prüfung fängt den Fall, vor dem der Auftrag ausdrücklich warnt: ein
Feld, das aussieht wie `availableAt` und `periodEnd` enthält. Ein
Veröffentlichungsdatum muss nach dem Periodenende liegen — sonst wurde der
Bericht vor Ende des Zeitraums veröffentlicht, den er beschreibt.

## Die Fixtures als Anbietertests

Vision Universe hat seit V1 drei Fixtures, die genau diese drei Fehler
nachstellen. Bisher prüfte das System damit sich selbst; seit Phase 3 sind sie
die Vorlage für Anbietertests.

| Fixture | Gate | Was ein realer Testfall braucht |
|---|---|---|
| `MOCK_RESTATEMENT` (`sec_VUF009`) | A | Ein reales Unternehmen mit **belegter** Korrektur, dazu Periode, Kennzahl und zwei Stichtage — einer vor, einer nach der Korrektur |
| `MOCK_DELISTED` (`sec_VUF008`) | B | Ein reales, im Testzeitraum ausgeschiedenes Unternehmen, dazu ein Stichtag während der Notierung |
| `MOCK_FUTURE_DATA_LEAK` (`sec_VUF010`) | C | Ein beliebiges Unternehmen und ein Stichtag, der zwischen Periodenende und Veröffentlichung liegt |

Der Adapter, den ein Gate-Test erwartet, ist bewusst schmal — zwei Methoden:

```js
adapter.getFactsAsOf(securityId, { asOf, periodEnd, metricId })
adapter.getUniverseAsOf({ asOf })
```

Ein realer Anbieteradapter, der diese beiden bereitstellt, lässt sich ohne
Änderung an den Gates prüfen.

## Wie ein Ergebnis zustande kommt

```
QUALIFIED              alle drei Gates bestanden UND alle blockierenden
                       Anforderungen erfüllt UND Belege mindestens
                       DOCUMENTATION_VERIFIED

PARTIALLY_QUALIFIED    für mindestens eine Rolle geeignet, für eine andere
                       nicht — kein Mittelwert, keine Note zwischen gut
                       und schlecht

NOT_QUALIFIED          mindestens ein blockierendes Kriterium widerlegt

UNKNOWN                zu mindestens einer blockierenden Anforderung fehlt
                       jeder Beleg
```

Der Unterschied zwischen `NOT_QUALIFIED` und `UNKNOWN` ist der Kern der
Spezifikation: **nichts zu wissen ist etwas anderes, als etwas zu widerlegen.**
Ein Prüfstand, der bei fehlender Information ein Urteil erzwingt, produziert
Tabellen, die vollständig aussehen und es nicht sind.

## Was nicht in die Bewertung eingeht

**Preise.** Ein günstiger Anbieter, der Gate A nicht besteht, ist nicht
teilweise geeignet. Kosten gehören in die Entscheidung, welchen qualifizierten
Anbieter man nimmt — nicht in die Frage, ob einer qualifiziert ist.

**Anzahl der Endpunkte.** Die Frage lautet nicht, wie viel ein Anbieter
liefert, sondern ob das Gelieferte rekonstruierbar ist.

**Reputation.** Sie ersetzt keine Prüfung, und sie altert.

## Erweiterung um einen neuen Anbieter

1. Profil in `quant/config/provider-profiles.json` anlegen. Jeder Befund
   braucht `value`, `level`, `source` und `checkedAt` — ohne Quellenangabe
   wirft der Prüfstand.
2. `node scripts/market/qualify-providers.mjs <name>` laufen lassen.
3. Wo ein Testzugang existiert: Adapter mit den zwei Methoden bauen und
   `Gates.runGateTests(adapter, fixtures)` gegen echte Daten laufen lassen.
   Erst das erzeugt `RUNTIME_VERIFIED`.
4. Lizenzfragen aus `VU_PROVIDER_LICENSE_CHECKLIST.md` beantworten.

Schritt 3 ist der einzige, der ein Gate wirklich schließt. Die Schritte 1 und 2
ordnen, was man zu wissen glaubt.
