# Insider-Käufe aus SEC Form 4 (E2)

Python 3.10+ mit Standardbibliothek und Zeitzonendaten. Liest frei verfügbare EDGAR-Quartalsindizes (`master.idx`) und die vollständigen Einreichungen. Keine API-Schlüssel, keine neuen Workflows. Strang A übernimmt den Anschluss an die Tagespipeline; der Registry-Eintrag `insiderPurchases` steht bis zum ersten Lauf auf `ACTIVATING`.

```bash
SEC_USER_AGENT='Organisation kontakt@eigene-domain.de' python3 scripts/insider/form4.py \
  --from 2026-10-01 --as-of 2026-11-03 --out /tmp/insider-purchases.json
python3 -m unittest discover -s scripts/insider/tests -p 'test_*.py'
```

Der Kontakt muss der tatsächliche Betreiber sein. Alternativ `--user-agent`. Abrufe seriell, höchstens vier pro Sekunde, begrenzte Wiederholung bei 429/5xx, Abbruch bei 403 oder fehlerhaften Quellen. Ein fehlgeschlagener Lauf ersetzt keine vorherige Ausgabe. Ausgabe ausschließlich atomar nach `--out`; keine Caches oder Produktionsschreibzugriffe nebenher. Netzwerkzugriff nur auf SEC-Archivpfade.

`--from` ist das inklusive **Einreichungsdatum**, nicht das Transaktionsdatum. `--as-of` akzeptiert ein UTC-Datum (bis Tagesende UTC) oder einen ISO-Zeitstempel mit Zeitzone. Nicht zukünftige Stichtage verwenden. Alle betroffenen Quartalsindizes werden durchsucht, ohne Auswahl nach heutigen Unternehmen oder Tickern. Für tägliche Läufe ein hinreichend überlappendes Fenster wählen und historische Ausgaben getrennt aufbewahren. Ein aktueller Index ist keine archivierte PIT-Populationsaufnahme; verspätete Indexkorrekturen bleiben eine Grenze. Der Erzeuger liefert ausdrücklich einen Fensterauszug, keinen vollständigen Bestands-Snapshot.

**Point-in-Time:** `transactionDate` beschreibt den Handel, `filingDate` die SEC-Einreichung. `availableAt` stammt aus `ACCEPTANCE-DATETIME` der SGML-Einreichung (New York → UTC einschließlich Sommerzeit). Fehlt die Uhrzeit, wird konservativ erst Mitternacht New York am folgenden Kalendertag verwendet; `acceptedAt` bleibt dann null. Nur `availableAt <= asOf` wird ausgegeben. Keine Rückdatierung auf den Handelstag, keine nachträgliche Ersetzung älterer Einreichungen.

**Kaufdefinition:** nur `nonDerivativeTransaction` mit `transactionCode=P`, Erwerbscode `A` und positiven endlichen numerischen Stück-/Preisangaben. P umfasst Börsen- und Privatkäufe; es ist kein Beweis eines Börsenkaufs. Geschenke, Zuteilungen, Optionsausübungen, Verkäufe, Derivate und nur über Fußnoten bepreiste Transaktionen zählen nicht als Käufe. Ausschlüsse stehen in `excluded`. `shares`, `pricePerShare`, `reportedValue` sind exakte Dezimalstrings. `reportedValue` ist ihr Produkt; keine Umrechnung, `priceCurrency=null`, da Form 4 die Währung nicht zuverlässig deklariert.

Eine Zeile je Transaktionsposition; gemeinsame Einreicher stehen in `reportingOwners` und vervielfachen den Betrag nicht. `accession:nonDerivative:index` ist innerhalb der unveränderten Quelle stabil, `sourceSha256` und `sourceUrl` sichern die Herkunft. `4/A` bleibt mit eigener Accession und `isAmendment=true` separat sichtbar: **Original und Amendment nicht addieren**. Es gibt ohne fachliche Zuordnung der Korrektur keine bereinigte Nettokaufsumme.

`issuerCik`/Owner-CIK sind SEC-Identitäten, `tickerAsFiled` nur die gemeldete Bezeichnung. Es wird keine tickerbasierte `securityId` erfunden. Ein späterer Consumer muss eine belegte historische Zuordnung mit `core/identity.js` vornehmen. Keine Scores, Rankings oder Modelle werden verändert.

Offline-Reproduktion mit echten archivierten oder synthetischen Testquellen:

```bash
python3 scripts/insider/form4.py --from 2026-06-01 --as-of 2026-06-05 \
  --index-file /tmp/master.idx --filings-dir /tmp/sec-fixture --out /tmp/purchases.json
```

`--index-file` ist wiederholbar; `--filings-dir` enthält die unveränderten relativen Pfade `edgar/data/<CIK>/<accession>.txt`. Beide Optionen sind zusammen erforderlich. Die Tests prüfen PIT-Grenzen, DST, Amendments, Mehrfacheinreicher, Dezimalwerte, Ausschlüsse, Namespace-/SGML-Parsing, ungültige Quellen, HTTP-Verhalten und echte CLI-Ausgabe in temporäre Verzeichnisse.
