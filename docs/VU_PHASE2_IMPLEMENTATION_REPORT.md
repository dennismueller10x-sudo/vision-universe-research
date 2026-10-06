# VU PHASE 2 — IMPLEMENTATION REPORT

Produktionsaudit, Providerarchitektur und die erste echte Marktdatenanbindung.

Stand: September 2026 · Branch `claude/vision-universe-v1-build-uyp8qp` ·
177 Tests, alle gruen (134 aus V1 unveraendert, 43 neu)

---

## Der Bericht in elf Antworten

Die Fragen stammen aus dem Auftrag (§32) und werden hier zuerst und knapp
beantwortet. Die Begruendungen stehen darunter und in den verlinkten Dokumenten.

### 1. Was wurde auditiert?

Das vollstaendige in Phase 1 gebaute System: Engines, Providerabstraktion,
Oberflaeche, Datenpipeline, Workflows, Tests. Zusaetzlich die bestehende
Alt-Pipeline (`scripts/dashboard/`), weil sie denselben Anbieter nutzt.

Nicht nach Dateien, sondern nach vier Fragen: Wo entstehen falsche Zahlen? Wo
wird etwas als belastbar dargestellt, das es nicht ist? Wo bricht das System,
sobald echte Daten einlaufen? Wo koennte ein Zugangsdatum entkommen?

→ `docs/VU_PHASE2_PRODUCTION_AUDIT.md`

### 2. Welche Fehler wurden gefunden und behoben?

**0 CRITICAL · 2 HIGH · 6 MEDIUM · 4 LOW.** Behoben: beide HIGH, fuenf von
sechs MEDIUM, ein LOW.

Die beiden schwerwiegenden:

- **HIGH-1**: Ein Backtest, der nie investiert hat, wurde mit Trust Score 61
  („eingeschraenkt belastbar") und dem Satz „Diese Unternehmen erfuellen aktuell
  die Regeln" ueber einer leeren Tabelle ausgegeben. Jetzt: Trust Score **5**,
  typisierte Warnung vor den Kennzahlen, ausformulierter Leerzustand.
- **HIGH-2**: Ein einzelner Netzhaenger machte eine Seite dauerhaft unbrauchbar,
  weil der Ladecache die abgelehnte Promise speicherte. Mit echten Daten waere
  das der Normalfall geworden. Jetzt: Wiederholung mit wachsendem Abstand,
  Fehlschlaege werden nicht konserviert. Dieselbe Schwaeche fand sich in eigener
  Form im Backtest-Worker — ebenfalls behoben.

Vier der sechs MEDIUM-Befunde lagen in Code, der **in dieser Phase entstanden
ist**: der Transport konnte echte Antworten nicht lesen, der veraltete Rueckfall
hatte im Ernstfall nichts anzubieten, „ungeprueft" kollabierte zu „nicht
vorhanden", und die Mapping-Pruefung liess den haeufigsten Fall durch. Sie sind
hier aufgefuehrt, weil sie ohne die Tests unentdeckt in Produktion gegangen
waeren.

### 3. Wie funktioniert der Hybrid-Modus?

Drei Modi (`mock`, `hybrid`, `live`), gesetzt ueber `VU_DATA_MODE`. Im
Hybridmodus bekommt ein kleines Referenzuniversum aus 15 realen Titeln echte
Tageskurse; alles andere bleibt synthetisch.

Die Herkunft wird **je Datenklasse** bestimmt, nicht fuer die Seite als Ganzes:
Kurse koennen echt sein, waehrend Fundamentaldaten synthetisch bleiben. Faellt
ein Abruf aus, steht die Datenklasse in `degraded[]` und traegt eine Meldung —
Mock-Daten ersetzen echte nie stillschweigend.

→ `docs/VU_HYBRID_DATA_MODE.md`

### 4. Welche Teile sind echt, welche Mock?

| | echt | synthetisch |
|---|---|---|
| Kurse Referenzuniversum (`ref_*`, 15 Titel) | ja, sobald ein Zugang besteht | — |
| Kurse Modelluniversum (`sec_VU*`, 500 Titel) | — | ja |
| Fundamentaldaten | **nichts** | alles |
| Kapitalmassnahmen | — | alles |
| Schaetzungen, Makro, Nachrichten | — | nicht vorhanden |
| Quant Score, Ranking, Screener, Radar, Backtests | — | vollstaendig synthetisch |

**Zum jetzigen Zeitpunkt ist nichts davon echt**, weil kein Schluessel
konfiguriert ist. `quant/data/market/status.json` steht auf
`dataMode: "mock", configured: false`. Das ist ein gueltiger, vollstaendig
funktionsfaehiger Zustand.

Die wichtigste Grenze: **reale Unternehmen bekommen keine Fundamentaldaten und
damit keinen Quant Score.** Ein erfundener ROIC mit dem Namen Apple daran ist
die eine Sorte Fehler, die sich nicht durch einen Hinweis heilen laesst.

### 5. Welcher Provider wurde vorbereitet?

**Twelve Data**, Free Plan. Nicht als Festlegung, sondern weil der Zugang im
Repository bereits existierte (`scripts/dashboard/fetch_market_data.py`, Secret
`TWELVE_DATA_API_KEY`) und der Free Plan fuer den Zweck dieser Phase reicht.

Die Providerschicht ist anbieterneutral: der Adapter ist eine Implementierung
davon, keine Annahme darin. Ein zweiter Anbieter braucht eine neue Datei unter
`providers/`, sonst nichts.

→ `docs/VU_TWELVE_DATA_ADAPTER.md`

### 6. Welche Zugangsdaten fehlen?

Genau eine: **`TWELVE_DATA_API_KEY`** als Repository-Secret
(Settings → Secrets and variables → Actions).

Das Secret existiert im Repository moeglicherweise bereits — die Alt-Pipeline
nutzt denselben Namen. In diesem Fall ist nichts zu tun ausser den Workflow
`Marktdaten aktualisieren` zu starten.

Optional: `VU_DATA_MODE` als Repository-Variable (`hybrid`, Standard).

Alles Weitere steht in `.env.example`. Der Schluessel gehoert **nicht** in eine
Datei im Repository; `.gitignore` und `quant/tests/secrets.test.mjs` sorgen
dafuer.

### 7. Was ist im Free Plan nicht moeglich?

| Fehlt | Praktische Folge |
|---|---|
| Total-Return-Bereinigung | keine belastbaren Renditekennzahlen aus diesen Reihen; `adjustedClose` bleibt `null` |
| Split- und Dividendenereignisse | keine eigene Bereinigung moeglich |
| Echtzeitkurse, WebSocket | nur verzoegerte Kurse und Tagesschluss |
| Sammelabfragen | ein Symbol je Anfrage |
| Point-in-Time-Fundamentaldaten | **kein historischer Fundamental-Backtest** |
| Delistete Unternehmen | **Survivorship Bias** |
| Historische Indexzugehoerigkeit | kein rekonstruierbares Anlageuniversum |

Die letzten drei sind keine Frage des Plans, sondern der Ausrichtung des
Anbieters. Kontingent: 8 Anfragen pro Minute, 800 pro Tag — fuer 15 Titel
taeglich unproblematisch.

Ein offener Punkt mit Indiz: die Tageshistorie kommt sehr wahrscheinlich
**splitbereinigt** (NVDA steht im Juli 2021 bei 18 statt 726 USD). Zugesichert
ist das nirgends, deshalb steht `splitAdjustedPrices` auf `null` — ungeprueft,
nicht „nein". Wer es verifiziert, traegt es mit Datum und Beleg nach.

→ `docs/VU_PROVIDER_CAPABILITIES.md`

### 8. Welcher Provider waere als naechstes fuer PIT-Fundamentals sinnvoll?

Nicht ein besserer Kursanbieter, sondern ein anderer Anbietertyp. Die Frage
lautet:

> Liefert er zu jeder Kennzahl den Zeitpunkt, ab dem sie oeffentlich war — und
> die Unternehmen, die es heute nicht mehr gibt?

**Sharadar (Nasdaq Data Link)** steht an erster Stelle: ausdruecklich
Point-in-Time aufgebaut, delistete Unternehmen enthalten, in der akademischen
Nutzung verbreitet, US-Fokus. Danach **Intrinio** (as-reported und
standardisiert getrennt, Filing-Daten). **EODHD** und **FMP** sind guenstiger
und breiter, aber es ist offen, ob ihre Fundamentalhistorie wirklich
Point-in-Time ist oder rueckwirkend gefuellt.

Alle Angaben sind Recherchestand, **nicht geprueft**. Der Pruefstand
(`scripts/market/evaluate-provider.mjs`) stellt jedem dieselben Fragen und
markiert `pointInTime` und `delistedSecurities` als blockierend: wer dort
durchfaellt, ist ungeeignet — unabhaengig vom Preis.

### 9. Welche Premium-Upgrades sind wirklich notwendig?

Getrennt nach dem, was sie freischalten:

| Upgrade | Schaltet frei | Wirklich noetig? |
|---|---|---|
| Total-Return-bereinigte Kurse | Renditekennzahlen auf echten Kursen | **ja**, sobald echte Kurse in eine Auswertung eingehen sollen |
| Kapitalmassnahmen als Ereignisse | eigene Bereinigung | Alternative zum obigen, nicht zusaetzlich |
| Point-in-Time-Fundamentaldaten | historische Fundamental-Backtests | **ja**, das ist der eigentliche Engpass |
| Delistete Unternehmen | bias-freie Backtests | **ja**, gehoert zum vorigen |
| Echtzeit / WebSocket | Live-Kurse | **nein** — und erst nach einem Proxy sinnvoll |
| Sammelabfragen | schnellere Abrufe | **nein** bei 15 Titeln |
| Schaetzungen / Konsens | der sechste Faktor | spaeter |

Kurz: fuer eine **Anzeige** echter Kurse reicht der Free Plan. Fuer eine
**Auswertung** braucht es Bereinigung. Fuer einen **Backtest als Evidenz**
braucht es Point-in-Time-Fundamentaldaten und delistete Unternehmen — und dafuer
einen anderen Anbieter, nicht einen anderen Plan.

### 10. Ab welcher Entwicklungsstufe wird was gebraucht?

| Stufe | Zweck | Was noetig ist |
|---|---|---|
| **jetzt** | System laeuft, Demo vollstaendig | nichts. Mock-Modus ist vollstaendig. |
| **A** | echte Kurse sichtbar machen | Free Plan. Ein Secret. Fertig gebaut. |
| **B** | echte Kurse auswerten (Momentum, Risiko) | bereinigte Kurse — Bereinigung verifizieren oder Plan wechseln |
| **C** | Backtests als Evidenz | **Anbieterwechsel**: Point-in-Time-Fundamentaldaten, delistete Unternehmen, Restatements |
| **D** | Live-/Intraday-Ansichten | Proxy (Worker/Function) **plus** Realtime-Plan **plus** geklaerte Lizenz |
| **E** | mehrere Maerkte, grosses Universum | stabile Kennungen (ISIN/FIGI), Boersengebuehren geklaert |

Stufe A ist gebaut und wartet nur auf ein Secret. Stufe B ist eine
Verifikationsfrage. Stufe C ist der eigentliche Sprung — dort liegen die Kosten,
und dort liegt der Nutzen.

**Nicht vor Stufe C sollte irgendwo behauptet werden, ein Backtest belege die
historische Tragfaehigkeit einer Strategie.** Das System tut es auch nicht:
`backtestEligibility()` gibt `realEvidence: false` zurueck, solange die
Fundamentaldaten synthetisch sind — auch bei echten Kursen.

### 11. Wie wurde die Schluesselsicherheit umgesetzt?

Aus der Randbedingung, dass Vision Universe statisch ausgeliefert wird, folgt:
**ein Schluessel im Browser ist ein oeffentlicher Schluessel.** Also ruft der
Browser nichts direkt beim Anbieter ab. Der Schluessel existiert ausschliesslich
im Speicher des GitHub-Action-Runners; ausgeliefert wird das Ergebnis des
Abrufs, nicht der Zugang dazu.

Abgesichert durch acht Tests (`quant/tests/secrets.test.mjs`), die das gesamte
Repository pruefen, und eine letzte Pruefung vor dem Commit
(`scripts/market/assert-no-secrets.mjs`). Der interessanteste Test baut den
Fall nach, in dem der Anbieter den Schluessel in einer Fehlermeldung
zurueckspiegelt.

Ein Befund im Audit: **keiner.** Es lag kein Zugangsdatum im Repository.

---

## Was gebaut wurde

**24 Dateien, ~3 700 Zeilen.**

### Providerschicht (neu)

| Datei | Aufgabe |
|---|---|
| `quant/engines/capabilities.js` | Faehigkeitsmatrix mit drei Zustaenden |
| `quant/engines/symbol-mapping.js` | VU-Security ↔ Providersymbol, Mehrdeutigkeit wird gemeldet statt geraten |
| `quant/engines/market-client.js` | anbieterneutraler Transport: Kontingent, Cache, Wiederholung, Zustand |
| `quant/engines/market-quality.js` | Eingangspruefung vor der Engine |
| `quant/engines/data-mode.js` | `mock` / `hybrid` / `live`, ohne stillen Rueckfall |
| `providers/twelve-data/adapter.js` | Adapter, Node-only, serverseitig |

### Pipeline und Betrieb

| Datei | Aufgabe |
|---|---|
| `scripts/market/fetch-market-data.mjs` | Abruf → Pruefung → normalisiertes JSON |
| `scripts/market/assert-no-secrets.mjs` | letzte Schluesselpruefung vor dem Commit |
| `scripts/market/evaluate-provider.mjs` | Pruefstand: stellt jedem Anbieter dieselben Fragen |
| `.github/workflows/market-data.yml` | taeglicher Abruf, Secret nur im Runner |
| `quant/config/market-universe.json` | 15 reale Referenztitel, ohne Fundamentaldaten |

### Oberflaeche

| Datei | Aufgabe |
|---|---|
| `quant/markt/` | neue Seite: Datenherkunft, Referenzuniversum, Faehigkeiten, Betriebszahlen, Kursverlauf |
| `quant/ui/shell.js` | `dataOriginBar()` je Datenklasse, `datasetOriginNote()` fuer die Modellseiten |

### Tests

| Datei | Umfang |
|---|---|
| `quant/tests/market-data.test.mjs` | 35 Tests: Faehigkeiten, Mapping, Transport, Qualitaet, Modus, Adapter, Universum |
| `quant/tests/secrets.test.mjs` | 8 Tests ueber das gesamte Repository |

---

## Entscheidungen, die eine Begruendung verdienen

**Vorberechnung statt Direktabruf.** Nicht wegen der Ladezeit, sondern wegen des
Schluessels. Der Kontingentvorteil kommt dazu: bei 800 Anfragen pro Tag waere
ein Direktabruf schon bei 55 Besuchern erschoepft.

**Kein Proxy in dieser Phase.** Ein Cloudflare Worker waere der richtige Weg fuer
echte Live-Daten. Er ist der erste Baustein mit laufenden Kosten und eigener
Betriebsverantwortung, und ohne belegten Bedarf an Intraday-Daten waere er
verfrueht. Dokumentiert als der Weg fuer Stufe D.

**`adjustedClose: null` statt eines unbereinigten Kurses.** Der naheliegende
Weg — den Schlusskurs auch als bereinigten Kurs eintragen — waere kein ungenauer
Wert, sondern ein falscher. Die Engine wuerde an jedem Split einen Verlust von
75 % oder 90 % sehen.

**Drei Bereinigungszustaende statt zwei.** `splitAdjusted` ist unauffaelliger
als `unadjusted` und deshalb gefaehrlicher: die Reihe sieht sauber aus, aber die
Dividenden fehlen. `market-quality.js` gibt dafuer einen eigenen Befund aus.

**Reale Unternehmen ohne Quant Score.** Ausfuehrlich unter Frage 4. Die
Deckungslogik aus Phase 1 haette es ohnehin auf `INCOMPLETE` gesetzt — die
Entscheidung war, ihr nichts vorbeizuschleusen.

**Getrennte Herkunftsanzeige fuer die Modellseiten.** Ranking, Screener, Radar
und Backtests rechnen ausnahmslos auf dem Modelluniversum. Ihnen im Hybridmodus
„Kurse: Tagesschluss" anzuheften waere eine Aussage ueber Daten, die auf diesen
Seiten gar nicht vorkommen. Sie bekommen deshalb einen anderen Hinweis: dass es
echte Kurse gibt, wo sie liegen, und dass sie hier nicht einfliessen.

---

## Zustand bei Uebergabe

```
$ node --test "quant/tests/*.test.mjs"
# tests 177   # pass 177   # fail 0

$ node scripts/quant/verify-quant-data.mjs
482 Titel neu berechnet, 0 Abweichungen

$ node scripts/market/fetch-market-data.mjs
Modus: mock · Kein TWELVE_DATA_API_KEY gesetzt.
Es wird nichts abgerufen und ausdruecklich NICHT auf Demo-Daten zurueckgefallen.
Fertig (Mock-Modus). Kein Fehler — der Zugang ist optional.

$ node scripts/market/assert-no-secrets.mjs
Keine Zugangsdaten gefunden.

$ node scripts/market/evaluate-provider.mjs twelve-data
Kursdaten             29 %  eingeschraenkt
Fundamental-Backtest   0 %  UNGEEIGNET  (fehlt: pointInTime, delistedSecurities)
```

Das System laeuft vollstaendig ohne Anbieterzugang. Es behauptet nirgends, echte
Daten zu zeigen, wo keine sind. Der Weg zu echten Kursen ist eine
Konfigurationsfrage, kein Bauauftrag.

## Naechster sinnvoller Schritt

1. `TWELVE_DATA_API_KEY` als Secret pruefen oder hinterlegen.
2. Workflow `Marktdaten aktualisieren` mit `dry_run: true` starten — er ruft ab
   und prueft, schreibt aber nichts. Das Ergebnis in der Zusammenfassung sagt,
   ob die Reihen die Qualitaetspruefung bestehen und wie sie bereinigt sind.
3. **Vor dem ersten echten Commit von Kursdaten:** die drei
   Veroeffentlichungsfragen aus `docs/VU_PROVIDER_LICENSE_CHECKLIST.md`
   beantworten. Das ist keine Formalie — es ist der Unterschied zwischen
   erlaubter Nutzung und einem Datendienst ohne Lizenz.

## Dokumente dieser Phase

| Dokument | Inhalt |
|---|---|
| `VU_PHASE2_PRODUCTION_AUDIT.md` | alle Befunde mit Schwere, Begruendung und Behebung |
| `VU_MARKET_DATA_ARCHITECTURE.md` | der Datenweg und die fuenf Bausteine |
| `VU_TWELVE_DATA_ADAPTER.md` | der Adapter, seine Grenzen, die Bereinigungsfrage |
| `VU_PROVIDER_CAPABILITIES.md` | was welcher Anbieter liefert — und was ungeprueft ist |
| `VU_PROVIDER_LICENSE_CHECKLIST.md` | die Fragen vor der ersten Zeile Adapter-Code |
| `VU_HYBRID_DATA_MODE.md` | echt und synthetisch nebeneinander, ohne Verwechslung |
| `VU_PHASE2_IMPLEMENTATION_REPORT.md` | dieses Dokument |
