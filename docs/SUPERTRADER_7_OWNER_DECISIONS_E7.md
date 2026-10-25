# Supertrader 7.0 – Entscheidungsvorlage E7-1 (Anbieter) und E7-4 bis E7-7

Stand 25.10.2026. Diese Vorlage bereitet Entscheidungen nur vor. Sie löst weder eine Bestellung noch einen kostenpflichtigen Abruf, einen Snapshot-Capture, einen Intraday-Abruf oder eine neue Ausstiegsregel aus. Alle 13 Strategien bleiben `LIVE_NOT_APPROVED`. SF6-PAPER-2027 bleibt inaktiv.

Für die Belege gilt: **[verifiziert]** steht nur dort, wo die Angabe auf einer Herstellerseite steht, die während der Recherche abgerufen wurde. Alles andere ist unverifiziert und **vor einem Kauf schriftlich mit dem Anbieter zu klären**. Diese Vorlage ist keine Rechtsberatung.

## E7-1: Lizenzierte Corporate-Action-Quelle für V4-D1

### Ausgangslage

V4-D1 ist nach Regelwerk 1.3.0 so eingegrenzt:
- 0 Splits sind faktorgenau belegt;
- 2 echte Kursbewegungen sind über K3 geklärt;
- alle **83 referenzexponierten DQ-K5-Sitzungen** sind ungeklärt und gesperrt.

Die Quarantäne erfüllt CC-5 nie.

Die CC-5-Teilkriterien je Referenz stehen in `SUPERTRADER_7_COMPLETION_MATRIX.md`, Abschnitt „CC-5-Teilkriterien“. Auch die beiden Strategien ohne Exposition (SEPA, Weinstein Investor) erfüllen CC-5 nicht, aus zwei Gründen:
- Die Erkennung ist unvollständig (`CC5-e`): Ein nicht deklarierter Split unter dem Faktor 3, etwa 2:1, bleibt unsichtbar.
- Der Holdout ist nicht gerechnet (`CC5-f`).

Bei Weinstein Investor ist außerdem eine K3-Sitzung offen.

### Anbieter (Kurzfassung)

| Anbieter | CA-Historie | Delistete Titel | Lizenz für eine Firma | Preis | Nutzen für die 83 Sitzungen |
|---|---|---|---|---|---|
| **Sharadar** Core US Equities (Nasdaq Data Link) | ACTIONS ab 1998, SEP mit `closeunadj` [verifiziert] | ja, ~21.000 Ticker [verifiziert] | Direktabo nur für Privatpersonen; kommerziell über Nasdaq [verifiziert] | privat $499/Jahr [verifiziert]; **kommerziell nicht ermittelt** | hoch |
| **Massive** (ex Polygon) | Splits ab 1978; neues Endpoint mit `reverse_split` [verifiziert] | Referenzdaten ab 2003 [verifiziert]; Splits delisteter Titel unklar | Individualpläne nur „individual use“, Business auf Anfrage [verifiziert] | Advanced $199/Monat (individuell) [verifiziert]; Business unbekannt | mittel–hoch |
| **CRSP** (Morningstar) | Daily ab 1925/26, `FACPR` [unverifiziert] | Kern des Produkts | WRDS nur akademisch [verifiziert]; kommerziell eigener Vertrag | nicht veröffentlicht | sehr hoch, teuer |
| Norgate | ab 1990 [verifiziert] | ja [verifiziert] | **nur Privatpersonen** [verifiziert], keine Firmenlizenz bekannt | $630/Jahr [verifiziert] | fachlich hoch, lizenzrechtlich ungeeignet |
| Databento | **ab 05/2018** [verifiziert] | ja | nicht veröffentlicht | ab $299/Monat (Blog 2024) | gering für 2008–2017 |
| EODHD | Splits delisteter Titel **nur bei Delisting nach 2018** [verifiziert] | teilweise | kommerziell auf Anfrage | $199/Jahr privat [verifiziert] | gering |
| Tiingo (bestehende Quelle) | Splits-Endpoint (Beta) | – | „Internal commercial“ $499/Jahr, ohne Anzeige [verifiziert] | siehe Lizenz | gering, weil keine unabhängige Prüfung |

### Empfehlung

1. **Vorher keine Bestellung.** Zuerst die Grundwahrheit für die 83 Sitzungen kostenfrei aus SEC EDGAR erheben, im bestehenden Abrufbudget. Quellen:
   - 8-K Item 5.03 / 3.01;
   - DEF 14A / PRE 14C;
   - Fußnoten „retroactively adjusted“.

   Das Ergebnis ist je Sitzung eines der Labels `reverse_split`, `forward_split`, `kein_split` oder `unklar`. Diese Erhebung braucht eine eigene Freigabe, weil sie neue Live-Abrufe bei EDGAR auslöst (kostenfrei, gedrosselt).
2. **Danach**, falls ein Anbieter nötig ist: **Sharadar mit kommerzieller Lizenz über Nasdaq Data Link**. Vorher schriftlich anfragen:
   - den Preis;
   - ob abgeleitete Kennzahlen auf `research.visionuniverse.de` veröffentlicht werden dürfen;
   - die Semantik von `ACTIONS.value` und `date`;
   - einen kostenlosen Musterauszug für die 83 Zeilen.
3. **Fallback:** Massive Business. CRSP nur, wenn beide die Abnahme verfehlen.
4. **Abnahme vor jedem Kauf:**
   - mindestens 90 % Event-Treffer und mindestens 95 % exakte Ratio gegen die EDGAR-Labels;
   - 0 falsch-positive Treffer;
   - mindestens 85 % Abdeckung 2008–2017.

### Wirkung auf die Readiness

- Ein faktortragender Beleg kann `CC5-a` (K5) und `CC5-b` (K3) schließen.
- `CC5-e` schließt er nur, wenn die Quelle auch Splits unter dem Faktor 3 vollständig liefert. Dann wäre der Abgleich gegen alle Split-Ereignisse möglich, nicht nur gegen die erkannten Sprünge.
- `CC5-f` braucht E7-4.
- Ohne Quelle bleibt CC-5 für alle 13 Strategien offen.

**Owner-Entscheidung nötig:**
1. EDGAR-Grundwahrheit freigeben, ja oder nein?
2. Anfrage bei Sharadar/Nasdaq und Massive stellen (ohne Kauf), ja oder nein?

## E7-4: Neue Snapshot-Generation

| Option | Inhalt | Nutzen | Risiko |
|---|---|---|---|
| A | sofort eine Generation 3 mit den heutigen freien Daten | keiner für V4-D1, weil die Datenbasis gleich bleibt | verbraucht Abrufe ohne Erkenntnis |
| **B (empfohlen)** | Generation 3 erst, wenn eine faktortragende CA-Quelle abgenommen ist (E7-1); DEV und HOLDOUT neu gegen dieselben Referenz-Hashes, mit Vorher/Nachher | schließt `CC5-d` und `CC5-f` belegt | erst nach E7-1 |
| C | keine neue Generation; CC-5 dauerhaft offen | – | Zertifizierung unmöglich |

Dazu gilt: Es gibt **keinen unberührten historischen Holdout** mehr. Der HOLDOUT `sts1-8595…` (2008–2015) ist bereits genutzt. Eine Generation 3 prüft die Datenkorrektur, sie liefert aber keine neue Out-of-Sample-Evidenz. CC-8 bleibt an SF6-PAPER-2027 gebunden.

Betroffen sind alle 11 Referenzen mit Tagesdaten. EP und PS sind über ihre eigene Stichprobe betroffen.

Budget: ein Capture-Lauf im bestehenden Laufbudget beim bestehenden Anbieter. Den genauen Abrufumfang beziffert der Capture-Plan vor der Freigabe.

**Owner-Entscheidung:** erst nach E7-1.

## E7-5: Quelle für PIT-Korrelations- und Branchengruppen (CC-4)

Betroffen sind:
- Turtle S1/S2 (Korrelationslimits);
- Weinstein Investor/Trader (Gruppen-Stage);
- mittelbar Minervini, über die Branchenstärke als Beleg.

| Option | Inhalt | Kosten | Wirkung auf die Readiness |
|---|---|---|---|
| **A (empfohlen, kostenfrei)** | SIC-Historie aus den Kopfdaten der EDGAR-Einreichungen: SIC gilt ab Filing-Datum je CIK, abgebildet auf Fama-French-49. Zuordnung über `core/identity.js`. | 0 USD; EDGAR-Abrufe im bestehenden Budget (bisher 150 Indizes je Lauf) | macht PIT-Gruppen technisch messbar. **Erfordert eine Revision von E4**: E4 schließt SIC-Proxys für CC-4 aus. |
| B | S&P GICS History (Compustat/Capital IQ, ab 1985) | nicht veröffentlicht, typischerweise fünf- bis sechsstellig [unverifiziert] | würde CC-4 mit einer anerkannten Klassifikation schließen |
| C | ohne Gruppen weiter; Turtle-Referenzen ohne Korrelationslimit, Weinstein ohne Gruppen-Stage | 0 | CC-4 bleibt für Turtle und Weinstein offen |

Empfehlung: zuerst A als Research-Belegstudie, kostenfrei und begrenzt. Dazu getrennt die Frage an den Owner, ob eine PIT-SIC-Historie (anders als der statische SIC-Proxy aus E4) für CC-4 zählen darf. B nur mit gesonderter Kostenfreigabe.

## E7-6: EP/PS – größere Intraday-Stichprobe (E5)

Ausgangslage (Lauf 40001460163): Der gemeinsame Anteil liegt bei EP bei 11,3 % und bei PS bei 2,1 %. Es gibt nur IEX-Minuten ab 2017. Der priorisierte Plan steht in `SUPERTRADER_KK_EP_PS_CHART_FIRST.md`, Abschnitt 8.

| Option | Abrufe | Ergebnis |
|---|---|---|
| A | 0 (Stand heute) | EP/PS bleiben schmale Modellstudien |
| **B (empfohlen)** | Schritte 1 und 2, ≈ 550 Anfragen, ein Lauf, bestehendes Budget (≤ 6.000 je Lauf) | PS 3,5 %, EP 15 % je Schicht |
| C | Schritte 1–4, ≈ 2.760 Anfragen | PS 5 %, EP 20 % |

Empfehlung B, erst nach dem Merge von #898. #898 bringt den korrigierten Fill-Minute-Zeitpunkt (SF7-D5) als Variante. Die Auswahl je Schicht folgt der bestehenden Hash-Reihenfolge und ist damit unabhängig von Ergebnissen.

Wirkung auf die Readiness: keine Zertifizierungsänderung. EP und PS bleiben `VALIDATION_BLOCKED`, solange der Katalysatorkalender und IEX-only offen sind. Die Option verbessert nur die Belastbarkeit.

**Owner-Entscheidung nötig:** Freigabe von Option B als zusätzliche Intraday-Abrufe.

## E7-7: Minervini-Ausstiegsvarianten

Die Kandidaten stammen aus Quellen und sind heute nur als Diagnose umgesetzt:
- **Größter Rückgang seit Stage-2-Beginn:** `largestDeclineSignal`, täglich und wöchentlich.
- **Klimax-Verkauf:** F7-B03-212-085 und F7-B03-216-086. Die Fundstelle -216-086 trägt einen Übersetzungszweifel.
- **MA20-Halbverkauf nach dem Ausbruch:** F7-B03-047-016, Diagnose `closeBelowMa20InWindow`.

| Option | Inhalt | Wirkung |
|---|---|---|
| A | nur Diagnosen (Stand heute) | keine Trade-Änderung |
| **B (empfohlen)** | als **nicht verbindliche Forschungsvarianten** registrieren: Parameter aus der Quelle vor jedem Lauf festgelegt, eigener Varianten-Registry-Hash, Referenz unverändert, Vorher/Nachher | erkennt, ob die Regel trägt, ohne die Referenz zu ändern |
| C | eine Variante als neue Referenz-Ausstiegsregel | ändert die gepinnte 4.0-Engine und SF6-PAPER-2027; nicht empfohlen vor B |

Bei B werden keine Parameter nach Ergebnissen gewählt. Wo die Quelle keine Zahl nennt (Klimax „15 Sitzungen“, „25 %“ laut Übersetzung), gilt die Zahl als Modellannahme mit Übersetzungsvorbehalt.

**Owner-Entscheidung nötig:** Freigabe von B. Nach der Vorgabe vom 25.10.2026 entsteht ohne diese Zustimmung keine verbindliche Ausstiegsregel.
