# VU DATA PROVIDER COST MODEL

Kostenkategorien für Datenanbieter — mit Zeitstempel und ausgewiesener
Unsicherheit.

**Recherchestand: 7. September 2026.**
**Keine dieser Zahlen ist eine Vertragsgrundlage.**

---

## Warum dieses Dokument vorsichtig formuliert ist

Preise, Plannamen und Vertragsmodelle ändern sich. Eine veraltete Preisangabe
in einem Repository ist schlechter als keine: sie sieht aus wie eine
Information und wird als eine gelesen.

Deshalb gilt:

- **Keine Preise in der Programmlogik.** Kein Modul liest diese Datei, keine
  Entscheidung hängt an ihr. Der Qualifikationsprüfstand kennt Kosten als
  Beiwerk, nicht als Kriterium.
- **Jede Zahl trägt ihr Datum** und die Quelle, aus der sie stammt.
- **Bekannte und unbekannte Kosten stehen getrennt.** Die unbekannten sind bei
  Finanzdaten regelmäßig die größeren.

## Die Erhebungslage

Die Anbieterseiten waren aus dieser Umgebung **nicht direkt abrufbar** — der
Egress-Proxy blockiert `sharadar.com`, `data.nasdaq.com`, `docs.intrinio.com`
und `intrinio.com`. Alle Zahlen unten stammen aus Suchergebnissen, nicht aus
der Primärquelle.

Für Preise wiegt das schwerer als für Fähigkeiten: Suchergebnisse geben oft
ältere Tarifstände wieder, und Preisseiten ändern sich häufiger als
Dokumentation. **Jede Zahl hier ist vor einer Entscheidung neu zu erheben.**

## Die drei Kategorien

| Kategorie | Zweck | Was gebraucht wird |
|---|---|---|
| `DEVELOPMENT` | Bauen und prüfen, nicht veröffentlichen | Ein Zugang mit echten Daten, Abdeckung darf klein sein |
| `GROWTH` | Öffentlicher Betrieb, überschaubare Nutzerzahl | Anzeigerechte, abgeleitete Werte, Speicherung |
| `SCALE` | Kommerzieller Betrieb | Redistribution, Nutzerzahlen, Börsengebühren |

Der Sprung von `DEVELOPMENT` zu `GROWTH` ist selten ein Preissprung. Er ist ein
**Lizenzsprung**: derselbe Zugang, andere Nutzungsart, anderer Vertrag. Das ist
die Stelle, an der Projekte überrascht werden.

---

## DEVELOPMENT

Was in dieser Kategorie zählt: Reicht der Zugang, um die drei Gate-Tests
laufen zu lassen? Alles andere ist zweitrangig.

| Anbieter | Zugang | Kosten | Reicht für | Reicht **nicht** für |
|---|---|---|---|---|
| **Intrinio** | Developer Sandbox | **0 USD** | Gate A, Gate C | Gate B |
| **Twelve Data** | Free | **0 USD** | nichts davon | alle drei |
| Sharadar | — | kein kostenloser Zugang festgestellt | — | — |
| EODHD, FMP, Polygon | nicht ermittelt | — | — | — |

### Der Intrinio-Sandbox-Befund

Der einzige kostenlose Zugang mit echten Fundamentaldaten, der gefunden wurde.
Abdeckung: **Dow 30**.

Daraus folgt eine präzise Grenze:

- **Gate A (Restatement)** — prüfbar. Ein Dow-30-Titel mit belegter Korrektur
  genügt.
- **Gate C (Verfügbarkeitszeitpunkt)** — prüfbar. Jeder Titel genügt.
- **Gate B (Delisting)** — **nicht prüfbar.** Die Dow 30 sind per Definition
  Überlebende. Kein Sandbox-Titel ist delistet, und ein Zugang, der nur
  Überlebende kennt, kann die Frage nach den Nicht-Überlebenden nicht
  beantworten.

Das ist die genaue Grenze dessen, was ohne Geld erreichbar ist: zwei von drei
Gates, an einem Anbieter.

---

## GROWTH

| Anbieter | Plan | Beobachteter Preis | Sicherheit |
|---|---|---|---|
| Sharadar | Bundle, 5 Jahre Historie | 29 USD/Monat | `THIRD_PARTY_REPORTED` |
| Sharadar | Full History Bundle | 69 USD/Monat · 499 USD/Jahr | `THIRD_PARTY_REPORTED` |
| Intrinio | Developer | 150 USD/Monat | `THIRD_PARTY_REPORTED` |
| Intrinio | Startup | 333 USD/Monat | `THIRD_PARTY_REPORTED` |
| Intrinio | US Fundamentals (Einzelprodukt) | 9 600 USD/Jahr | `THIRD_PARTY_REPORTED` |
| Twelve Data | Free | 0 USD | `DOCUMENTATION_VERIFIED` |

### Die entscheidende Unsicherheit bei Sharadar

Ein einziger recherchierter Satz verändert die ganze Rechnung:

> Professionelle Nutzer müssen Sharadar-Daten über Nasdaq Data Link beziehen.

Eine öffentliche Website ist mit hoher Wahrscheinlichkeit professionelle
Nutzung. Damit sind die 29 bzw. 69 USD **vermutlich nicht der für Vision
Universe zutreffende Tarif**. Der Preis über Nasdaq Data Link wurde nicht
ermittelt und liegt erfahrungsgemäß deutlich darüber.

Das ist kein Nebenaspekt, sondern der Unterschied zwischen „günstigster
qualifizierter Kandidat" und „unbekannte Größenordnung". Es ist vor jeder
Kostenrechnung zu klären.

### Die Unsicherheit bei Intrinio

Der Developer-Plan zu 150 USD/Monat könnte auf **aktuelle** Fundamentaldaten
begrenzt sein. Die für Gate A und B nötige Historie mit
Restatement-Unterscheidung und delisteten Titeln ist möglicherweise erst im
Einzelprodukt „US Fundamentals" zu 9 600 USD/Jahr enthalten.

Zwischen 1 800 USD/Jahr und 9 600 USD/Jahr liegt der Faktor fünf. Welcher gilt,
wurde nicht ermittelt.

---

## SCALE

Nicht recherchiert, und aus einem Grund: Skalierungspreise werden bei
Finanzdaten praktisch nie öffentlich genannt. Sie hängen von Nutzerzahlen,
Anzeigeart, Rechtsordnung und Verhandlung ab.

Was in dieser Kategorie hinzukommt und in den obigen Zahlen **nicht enthalten**
ist:

| Kostenart | Warum sie überrascht |
|---|---|
| **Börsengebühren** | Unabhängig vom Anbieterpreis, je Handelsplatz und Nutzerkategorie berechnet |
| **Einstufung professionell** | Sobald Daten öffentlich angezeigt werden, gilt der Betreiber bei vielen Börsen als professioneller Nutzer — mit anderer Gebührenordnung |
| **Redistribution** | Anzeige an Dritte ist oft separat lizenziert, unabhängig vom Datenbezug |
| **Abgeleitete Werte** | Ob ein aus den Daten berechneter Score veröffentlicht werden darf, ist häufig anders geregelt als die Rohdaten |
| **Enterprise-Zwang** | Manche Anbieter haben oberhalb einer Nutzungsschwelle keinen Self-Serve-Tarif mehr |

Die Einstufung als professioneller Nutzer ist die häufigste teure
Überraschung. Sie hängt nicht daran, ob mit den Daten Geld verdient wird,
sondern daran, dass sie öffentlich angezeigt werden.

---

## Was das für die Reihenfolge bedeutet

Aus der Kostenlage allein — die Qualifikation steht in
`VU_PROVIDER_DECISION_MATRIX.md`:

1. **Der Intrinio-Sandbox kostet nichts und schließt zwei von drei Gates.**
   Das ist der erste Schritt, unabhängig davon, welcher Anbieter am Ende
   gewählt wird. Er kostet Arbeitszeit und kein Geld.

2. **Die Lizenzfrage kommt vor der Preisfrage.** Bei Sharadar ist unklar,
   welcher Tarif überhaupt gilt; bei allen sechs ist unklar, ob abgeleitete
   Werte öffentlich angezeigt werden dürfen. Ein Preis für eine nicht
   zulässige Nutzung ist keine Information.

3. **Erst danach ist ein bezahlter Test sinnvoll.** Welcher, steht in
   `VU_PHASE3_IMPLEMENTATION_REPORT.md`, Frage 8.

---

## Erhebungsprotokoll

| Was | Quelle | Datum | Direkt abrufbar |
|---|---|---|---|
| Sharadar-Tarife | sharadar.com/subscribe (Suchauszug) | 2026-09-07 | nein |
| Sharadar Nasdaq-Data-Link-Pflicht | Suchauszug | 2026-09-07 | nein |
| Intrinio-Tarife | intrinio.com/pricing (Suchauszug) | 2026-09-07 | nein |
| Intrinio-Sandbox | product.intrinio.com/developer-sandbox (Suchauszug) | 2026-09-07 | nein |
| Twelve Data Free | eigene Phase-2-Anbindung | 2026-09-06 | ja |

Vor jeder Entscheidung neu zu erheben, und dann direkt bei der Quelle.
