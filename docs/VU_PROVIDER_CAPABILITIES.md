# VU PROVIDER CAPABILITIES

Was welcher Anbieter tatsaechlich liefert — und was niemand geprueft hat.

Erzeugt und pruefbar mit `node scripts/market/evaluate-provider.mjs <anbieter>`.
Maschinenlesbar in `quant/data/market/status.json` unter `capabilities`.

---

## Die drei Zustaende

| Zeichen | Wert | Bedeutung |
|---|---|---|
| `ja` | `true` | vom Anbieter zugesichert und/oder geprueft |
| `nein` | `false` | ausdruecklich nicht enthalten |
| `?` | `null` | **ungeprueft** — weder zugesichert noch ausgeschlossen |

`?` ist kein Platzhalter fuer „vermutlich nein". Es ist eine offene Frage, und
sie bleibt offen, bis jemand sie beantwortet. Die Anwendung verlaesst sich nur
auf `ja`; sie sagt aber bei `?` etwas anderes als bei `nein`, weil nur `nein`
durch einen Plan- oder Anbieterwechsel behebbar ist.

Wer eine Faehigkeit prueft, traegt hier **Datum und Beleg** ein — nicht nur das
Ergebnis. Ein `ja` ohne Beleg ist ein `?` mit mehr Selbstvertrauen.

---

## Marktdaten

| Faehigkeit | Twelve Data (Free) | Geprueft am | Beleg |
|---|---|---|---|
| Echtzeitkurse | nein | — | Free Plan schliesst Realtime aus |
| Verzoegerte Kurse | ja | — | Anbieterdokumentation |
| Tagesschluss | ja | 2026-09 | `time_series` liefert Tagesbars |
| Intraday-Bars | ja | — | `interval=5min` verfuegbar |
| Intraday-Historie | nein | — | im Free Plan stark begrenzt |
| Push-Verbindung (WebSocket) | nein | — | kostenpflichtig |
| Tageshistorie | ja | 2026-09 | 1 500 Bars in `dashboard/data/market_data.json` |
| **Total-Return-bereinigte Kurse** | **nein** | 2026-09 | kein `adjusted_close`-Feld in der Antwort |
| **Splitbereinigte Kurse** | **?** | — | Indiz, kein Beleg — siehe unten |
| Split-Ereignisse | nein | — | eigener Endpunkt, nicht im Free Plan |
| Dividendenereignisse | nein | — | wie oben |
| Symbolsuche | ja | — | `symbol_search` |
| Boersenstatus | ja | — | `market_state` |
| Sammelabfrage | nein | — | mehrere Symbole je Anfrage kostenpflichtig |

### Der offene Punkt: splitbereinigte Kurse

**Indiz.** In `dashboard/data/market_data.json` — ueber denselben Endpunkt
geholt — steht NVDA am 16. Juli 2021 bei 18,16 USD. Der unbereinigte Kurs lag
damals bei rund 726 USD; 18,16 ist der um 4:1 (Juli 2021) und 10:1 (Juni 2024)
bereinigte Wert. Ueber die gesamte Reihe findet die Qualitaetspruefung keinen
einzigen unbereinigten Splitsprung.

**Warum trotzdem `?`.** Ein beobachtetes Verhalten ist keine Zusage. Es kann
sich mit einer API-Version aendern, es kann fuer andere Boersen anders sein, und
es steht in keiner Dokumentation, auf die man sich berufen koennte.

**Was sich aendert, wenn jemand es verifiziert.** Die Reihen werden als
`splitAdjusted` statt `unadjusted` gekennzeichnet. Das erlaubt Momentum- und
Volatilitaetskennzahlen auf echten Kursen. Total-Return-Kennzahlen bleiben
ausgeschlossen — die Dividenden fehlen weiterhin.

---

## Fundamentaldaten

| Faehigkeit | Twelve Data (Free) | Warum das zaehlt |
|---|---|---|
| Jahreszahlen | ? | — |
| Quartalszahlen | ? | — |
| Wie berichtet (as reported) | ? | — |
| Standardisiert | ? | — |
| **Point-in-Time** | **nein** | Ohne `availableAt` je Kennzahl ist jeder historische Backtest ein Blick in die Zukunft: er trifft Entscheidungen mit Zahlen, die es an dem Tag noch nicht gab. |
| **Restatements** | **nein** | Erstmeldung und spaetere Korrektur sind nicht unterscheidbar. Der Backtest rechnet mit der korrigierten Zahl, die damals niemand hatte. |
| Einreichungsdaten | ? | Ohne `filedAt` laesst sich `availableAt` nicht einmal naeherungsweise herleiten. |
| **Delistete Unternehmen** | **nein** | Ein Backtest ueber die heute noch existierenden Unternehmen misst die Ueberlebenden. Das Ergebnis ist zu gut, und zwar systematisch. |
| Historisches Universum | nein | Die Indexzugehoerigkeit von 2015 laesst sich nicht rekonstruieren. |

Die drei fett markierten Punkte sind **blockierend**: solange einer von ihnen
fehlt, ist ein Fundamental-Backtest auf echten Daten nicht durchfuehrbar. Nicht
ungenau — nicht durchfuehrbar. Deshalb bleiben Fundamentaldaten in dieser Phase
vollstaendig synthetisch, und deshalb behauptet das System nirgends, ein
Backtest sei ein Beleg fuer die historische Tragfaehigkeit einer Strategie.

---

## Referenzdaten

| Faehigkeit | Twelve Data (Free) |
|---|---|
| Wertpapierstamm | ja |
| Boersenverzeichnis | ja |
| ISIN | ? |
| FIGI | ? |
| Delistete Titel | nein |
| Historische Indexzugehoerigkeit | ? |

Ohne stabile Kennungen (ISIN, FIGI) bleibt das Symbol-Mapping tickerbasiert und
damit auf Disambiguierung ueber MIC und Waehrung angewiesen. Das funktioniert
fuer 15 US-Titel und traegt nicht ueber 500 internationale.

---

## Schaetzungen

Konsens, historischer Konsens, Zeitpunktgenauigkeit, Revisionshistorie: alle `?`.
Nicht geprueft, weil in dieser Phase nicht gebraucht. Der sechste Faktor
(Estimate Revisions) bleibt bis dahin unbesetzt.

---

## Naechster Anbieter: Point-in-Time-Fundamentaldaten

Fuer die naechste Ausbaustufe ist nicht ein besserer Kursanbieter noetig,
sondern ein anderer Anbietertyp. Die Frage lautet nicht „welcher ist
guenstiger", sondern:

> Liefert er zu jeder Kennzahl den Zeitpunkt, ab dem sie oeffentlich war —
> und die Unternehmen, die es heute nicht mehr gibt?

Kandidaten, nach dieser Frage sortiert (Stand der Recherche, **nicht** geprueft
— jeder Eintrag ist ein `?`, bis der Pruefstand gelaufen ist):

| Anbieter | Warum interessant | Was vorher zu klaeren ist |
|---|---|---|
| **Sharadar (Nasdaq Data Link)** | Ausdruecklich Point-in-Time aufgebaut, delistete Unternehmen enthalten, in der akademischen Nutzung verbreitet | Lizenz fuer die Weiterveroeffentlichung abgeleiteter Kennzahlen; US-Fokus |
| **Intrinio** | Standardisiert und as-reported getrennt, Filing-Daten vorhanden | Preisstruktur je Datenpaket; ob `availableAt` je Kennzahl oder nur je Filing |
| **EODHD** | Breite Abdeckung inkl. Europa, guenstig | Ob die Fundamentalhistorie wirklich Point-in-Time ist oder nur rueckwirkend gefuellt |
| **FMP** | Gute Abdeckung, einfache API | Restatements; Qualitaet der Altdaten |
| **Refinitiv / FactSet / S&P** | Der Standard, vollstaendig | Preisklasse und Vertragsbindung ausserhalb dieser Ausbaustufe |

Der Pruefstand stellt jedem dieser Anbieter dieselben Fragen:

```
node scripts/market/evaluate-provider.mjs <anbieter>
```

Ein Anbieter, der bei `pointInTime` oder `delistedSecurities` durchfaellt, ist
fuer den Fundamental-Backtest ungeeignet — unabhaengig davon, wie gut alles
andere aussieht und wie guenstig er ist.

---

## Ein Wort zu Preisen

In dieser Datei stehen bewusst **keine** Preise, Planbezeichnungen oder
Vertragsmodelle. Sie aendern sich, und eine veraltete Preisangabe in einem
Repository ist schlechter als keine: sie sieht aus wie eine Information.

Was hier steht, sind Faehigkeiten und ihre Belege. Was etwas kostet, steht beim
Anbieter.
