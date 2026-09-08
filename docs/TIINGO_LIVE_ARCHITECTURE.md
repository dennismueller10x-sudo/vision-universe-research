# TIINGO LIVE ARCHITECTURE

Warum es auf dieser Seite keinen Live-Abruf im Browser gibt — und wie ein
Live-Chart trotzdem funktioniert.

Gates: `quant/config/feature-gates.json`
Richtlinie: `quant/engines/display-policy.js`
Zeitraum und Quelle: `quant/engines/chart-ranges.js`

---

## Die Ausgangslage

Vision Universe läuft auf GitHub Pages. Das ist eine statische Auslieferung:
kein Server, keine Laufzeit, keine Umgebungsvariablen. **Alles, was der Browser
lädt, ist öffentlich lesbar** — von jedem, ohne Anmeldung, auf Dauer.

Daraus folgt der Satz, der diese ganze Architektur bestimmt:

> Ein API-Schlüssel im Browser ist kein Risiko. Er ist eine Veröffentlichung.

Es gibt keine Verschleierung, die daran etwas ändert. Ein Schlüssel in einer
minifizierten Datei, in einem Base64-String, in einem verschachtelten
JSON-Feld — alles davon ist einen Rechtsklick entfernt. Deshalb wurde für diese
Phase kein einziger direkter Client-Aufruf implementiert.

## Wo der Schlüssel lebt

```
GitHub Secret TIINGO_API_KEY
        │
        ▼
GitHub Actions Runner  ──►  api.tiingo.com   (Authorization-Header)
        │
        ▼
geprüfte Bars  ──►  Arbeitsstand (.market-cache, nicht im Repository)
                 └► veröffentlichter Ausschnitt (nur nach Freigabe)
        │
        ▼
statische JSON-Dateien  ──►  Browser
```

Der Browser sieht Dateien, nie den Anbieter. Er hat nichts, womit er sich
ausweisen könnte, und braucht es auch nicht.

Zwei Schutzlinien halten das:

1. Der Adapter setzt den Schlüssel in den `Authorization`-Header, nicht in die
   URL. Eine geloggte oder weitergegebene URL verrät ihn nicht. Ein Test hält
   das fest.
2. `scripts/market/assert-no-secrets.mjs` durchsucht alles unter
   `quant/data/market` und bricht ab, wenn ein Umgebungswert darin auftaucht.
   Der Workflow ruft es nach jedem Import auf.

## Was „live" hier heißen kann

| Bedeutung | Möglich? | Warum |
|---|---|---|
| Browser fragt Tiingo direkt | **nein** | Der Schlüssel wäre öffentlich. |
| Browser fragt einen eigenen Proxy | technisch ja | Braucht einen Server. Den gibt es nicht. |
| Bars werden regelmäßig abgerufen und ausgeliefert | ja | Der gebaute Weg. |
| WebSocket im Browser | **nein** | Setzt eine Authentifizierung im Client voraus. |

Der gebaute Weg ist der dritte. „Live" bedeutet in dieser Ausbaustufe: so
aktuell, wie der letzte Importlauf ist — und die Seite sagt, wann das war.

Ein Proxy wäre der Weg zu echtem Live. Er ist bewusst nicht gebaut: er würde
einen Serverbetrieb einführen, den es hier nicht gibt, und die Lizenzfrage
(siehe unten) wäre damit trotzdem nicht beantwortet. Siehe
`TIINGO_SCALING_PLAN.md`.

## Zwei Fragen, die verwechselt werden

Ein funktionierender Abruf fühlt sich wie eine Erlaubnis an. Er ist keine.

| | Frage | Beantwortet durch |
|---|---|---|
| technisch | *Können* wir diese Kurse abrufen? | Fähigkeitsmatrix, Laufzeitnachweis |
| rechtlich | *Dürfen* wir sie anzeigen? | `display-policy.js` |

Der Laufzeitnachweis sagt: Intraday über IEX funktioniert, 78 Bars. Er sagt
nichts darüber, ob diese Daten auf einer öffentlichen Seite stehen dürfen. Der
Free-Tarif knüpft die IEX-Daten an eine nicht-anzeigende Nutzung; was das für
eine öffentliche Seite bedeutet, ist eine Lizenzfrage und keine technische.

`display-policy.js` kennt deshalb je Anbieter und Datenklasse vier getrennte
Erlaubnisse. Der Standard ist überall der strengste: intern ja, öffentlich
nichts. Eine Erlaubnis entsteht nicht dadurch, dass niemand widerspricht — sie
muss eingetragen werden, **mit Grundlage und Datum**. Der Eintrag wird sonst
abgelehnt.

## Die Feature-Gates

| Gate | Zustand | Grund |
|---|---|---|
| `ENABLE_LIVE_MARKET_DATA` | aus | IEX-Nutzungsbedingungen ungeprüft |
| `ENABLE_PUBLIC_LIVE_MARKET_DATA` | aus | keine geprüfte Anzeigeerlaubnis |

Beide stehen in `quant/config/feature-gates.json` mit Begründung und Datum.
Der Browser hat keine Umgebungsvariablen; statt für ihn eine zweite, lockerere
Regel zu erfinden, liest er dieselben Gates aus einer Datei im Repository. Eine
Freischaltung ist damit ein **Commit** — nachvollziehbar, begründet, datiert —
und kein Schalter, den jemand vergisst.

Der Import liest dieselbe Datei. Zwei Quellen für dieselbe Frage wären zwei
Antworten: der Import könnte Intraday holen, das die Seite nie zeigen darf.
Die Umgebung darf zusätzlich abschalten, nie zusätzlich freischalten.

**Ein eingeschaltetes Gate hebt keine fehlende Erlaubnis auf.** Für die
öffentliche Anzeige müssen Gate *und* Lizenz zutreffen. Ein Test hält fest, dass
beide Gates auf `true` nicht genügen, solange die Richtlinie leer ist.

## Der Chart

`chart-ranges.js` entscheidet je Zeitraum, aus welcher Quelle gezeichnet wird:

| Zeitraum | Quelle |
|---|---|
| 1T, 5T | Intraday |
| 1M, 6M, YTD, 1J, 5J, Max | Tagesschlusskurse |

Drei Regeln:

1. **Das Gate steht vor den Daten.** Wäre es umgekehrt, entschiede die
   Anwesenheit einer Datei über eine Freigabe — ein versehentlich abgelegter
   Datenstand wäre dann eine Erlaubnis.
2. **Kein stiller Rückfall.** Ist Intraday nicht verfügbar, wird der Tageschart
   nicht aus Tagesschlusskursen gebaut. Ein Tageschart, der in Wahrheit
   Wochendaten zeigt, ist schlimmer als ein fehlender: er sieht richtig aus.
3. **Ein gesperrter Zeitraum verschwindet nicht.** Er wird abgeblendet, bleibt
   anklickbar und nennt den Grund samt nächstem Zeitraum, der geht. Ein
   verschwundener Knopf ist eine unbeantwortete Frage.

Am Chart steht immer, aus welcher Quelle er stammt und wie bereinigt sie ist.
Ohne diese Zeile bleibt offen, ob die gezeigte Bewegung eine Rendite ist oder
nur ein Kursverlauf — und das ist der Unterschied, um den es in diesem Projekt
geht.

## Was heute öffentlich sichtbar ist

Nichts von Tiingo.

Der Importlauf schreibt in den Arbeitsstand (`.market-cache`, nicht im
Repository). Ein veröffentlichter Ausschnitt entsteht nur mit `--publish`, und
das ist nicht geschehen: solange `licensing.status` auf `LEGAL_REVIEW_REQUIRED`
steht, gehören echte Kursreihen nicht in ein öffentliches Repository. Der
CI-Job prüft das nach und bricht ab, wäre eine Reihe im veröffentlichten Pfad
gelandet.

Die Marktdatenseite zeigt deshalb weiterhin das Modelluniversum und sagt das
auch — mit einem Herkunftsabzeichen je Datenklasse, nicht mit einem einzigen
für die ganze Seite. Ein Gesamtabzeichen würde unweigerlich „Live", sobald
irgendetwas live ist, und genau diese Verkürzung ist die Halbwahrheit, die eine
Seite mit echten Kursen und synthetischen Fundamentaldaten unehrlich macht.
