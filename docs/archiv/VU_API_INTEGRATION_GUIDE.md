# VU API INTEGRATION GUIDE

Wie aus dem Mock-System ein System mit echten Daten wird — und was **vor** der ersten
Zeile Adapter-Code geklaert sein muss.

## Reihenfolge

1. **Market Data / Charts** — Kurse, Corporate Actions, Referenzdaten
2. **Historische Point-in-Time-Fundamentals** — nach technischem Audit
3. **Corporate Actions + Delistings** — vollstaendiger historischer Security Master
4. **Analyst Estimates / Revisions** — schaltet den sechsten Faktor frei
5. **Macro** — Regime-Kontext
6. **News / Institutional Data**

Realtime ist fuer den Quant-Kern deutlich weniger wichtig als saubere historische
Fundamentaldaten. Ein 20-Jahres-Backtest braucht keine Sekundenkurse.

## Schritte je Anbieter

1. `providers/<vendor>/README.md` ausfuellen — inklusive der offenen Lizenz- und
   PIT-Pruefpunkte.
2. Adapter schreiben, der die Interfaces aus `VU_PROVIDER_ARCHITECTURE.md` implementiert.
   Vendor-Felder existieren **nur** in dieser Datei.
3. `Provider.registry.registerAll(adapter)` — die Vertragspruefung greift.
4. Die bestehenden Tests laufen unveraendert: sie pruefen Verhalten gegen das kanonische
   Modell, nicht gegen den Mock.
5. `quant/api/client.js` auf `fetch("/v1/...")` umstellen, sobald ein Service existiert.
   Die Seiten bleiben unveraendert.

## Vendor-Due-Diligence vor Vertragsabschluss

Anbieterangaben zu Point-in-Time-Faehigkeit sind Marketing, bis sie mit Testfaellen
verifiziert wurden. Zu pruefen:

- Liefert der Anbieter `filedAt` bzw. `availableAt` je Kennzahl — oder nur `periodEnd`?
- Sind **Originalmeldung und Korrektur getrennt** abrufbar, oder wird rueckwirkend
  ueberschrieben?
- Enthaelt das Universum delistete und uebernommene Titel mit ihren Delisting-Renditen?
- Gibt es historische Index-/Universumszugehoerigkeit?
- Sind Corporate Actions als eigenes Ledger verfuegbar, nicht nur als bereinigte Kurse?
- Wie weit reicht die Historie tatsaechlich — und ab wann ist sie vollstaendig?
- Gibt es Bulk-Zugriff, oder muessten 500 Titel einzeln abgerufen werden?

Nachbau der drei entscheidenden Faelle mit echten Daten:
`MOCK_RESTATEMENT` (Korrektur wirkt nicht rueckwaerts), `MOCK_DELISTED` (bleibt im
historischen Universum), `MOCK_FUTURE_DATA_LEAK` (kein Datensatz vor seinem
Verfuegbarkeitszeitpunkt).

## Lizenzen — der teuerste Irrtum

> „Wir haben einen API-Key, also duerfen wir die Daten unseren Kunden anzeigen.“

Das stimmt nicht automatisch. Anbieter unterscheiden Individual- und Business-Nutzung;
Redistribution und External Display haengen von Tier, Datensatz, Boersenregeln und
Zusatzvereinbarungen ab.

Vor jedem Vertrag ist eine **Data Rights Matrix** auszufuellen:

```
Ingest?                      Dauerhaft speichern?
Cachen?                      Rohwert anzeigen?
Abgeleiteten Wert anzeigen?  Charts anzeigen?
Redistribuieren?             Ueber eigene API bereitstellen?
Im AI-Kontext verwenden?     Fuer Modelltraining verwenden?
Eigene Scores berechnen?     Daten nach Vertragsende behalten?
Historische Werte anzeigen?  Realtime anzeigen?
```

Besonders wichtig ist **Derived Data**: der VU Quant Score kann ein eigener Daten-Moat
werden — aber nur, wenn Berechnung, Speicherung und kommerzielle Darstellung solcher
abgeleiteter Kennzahlen vertraglich ausdruecklich erlaubt sind.

Diese Punkte bleiben in jedem `providers/*/README.md` als **offene Pruefpunkte** stehen,
bis eine Vertragspruefung sie beantwortet hat.

## Preise

Im Code, in der UI und in dieser Dokumentation stehen **keine Anbieterpreise**. Preise
und Konditionen aendern sich; eine fest verdrahtete Zahl ist ab dem Tag ihrer Aufnahme
potenziell falsch. Kostenvergleiche gehoeren in ein separates, datiertes Vertragsdokument.

## Sicherheit

- Kein Schluessel im Repository, kein Schluessel im Frontend.
- Provider-Schluessel ausschliesslich serverseitig.
- Alle Query- und Strategy-Eingaben werden validiert — die Validatoren existieren bereits
  und aendern sich beim Umstieg auf echte Daten nicht.
- Ein Acceptance-Test scannt den Quant-Bereich auf Schluesselmuster und externe Aufrufe.

## Was sich beim Umstieg NICHT aendert

Kanonisches Schema · Quant-Methodik und -Versionierung · Query-AST und VUQL ·
Strategy Schema und Versionierung · Backtest-Semantik · Trust Score · AI-Tool-Schicht ·
sämtliche Seiten.

Genau dafuer existiert die Provider-Abstraktion.

## Bevor echte historische Performance veroeffentlicht wird

Zusaetzlich zur technischen Integration ist zu klaeren:

- Sind die Datenquellen auf PIT-Eignung, Delistings, Corporate Actions und historische
  Universen **auditiert**?
- Sind die Darstellungsrechte fuer abgeleitete Kennzahlen vertraglich abgedeckt?
- Ist die regulatorische Einordnung (MiFID II, WpIG, WpHG, MAR, EU AI Act) durch
  spezialisierte Beratung geprueft?

Bis dahin bleibt die Kennzeichnung als synthetischer Datensatz auf jeder Seite.
