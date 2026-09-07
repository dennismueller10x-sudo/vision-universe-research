# VU PHASE 2 — PRODUCTION AUDIT

Systematische Pruefung des in Phase 1 gebauten Systems auf das hin, was unter
echten Bedingungen bricht. Nicht: was fehlt. Sondern: was falsch ist, was
stillschweigend falsch ist, und was falsch wird, sobald echte Daten einlaufen.

Stand: September 2026 · Grundlage: 134 Tests aus V1, alle gruen · Nach dem
Audit: 176 Tests, alle gruen.

---

## Einordnung der Schwere

| Stufe | Bedeutung |
|---|---|
| **CRITICAL** | Falsche Zahlen, Sicherheitsluecke, oder Datenverlust. Sofort zu beheben. |
| **HIGH** | Ein Ergebnis wird als belastbar dargestellt, das es nicht ist. Oder: bricht sicher, sobald echte Daten kommen. Direkt behoben. |
| **MEDIUM** | Verschlechtert Verlaesslichkeit oder Verstaendlichkeit, ohne falsche Zahlen zu erzeugen. |
| **LOW** | Verbesserungswuerdig, ohne Auswirkung auf Richtigkeit. |

Behoben wurden alle CRITICAL- und HIGH-Befunde sowie die MEDIUM-Befunde, deren
Behebung im Rahmen dieser Phase ohnehin anfiel.

---

## Zusammenfassung

| Stufe | Gefunden | Behoben | Offen |
|---|---|---|---|
| CRITICAL | 0 | — | 0 |
| HIGH | 2 | 2 | 0 |
| MEDIUM | 6 | 5 | 1 |
| LOW | 4 | 1 | 3 |

**Kein CRITICAL-Befund.** Das ist bemerkenswert genug, es zu benennen: die
Trennung zwischen Engine und Darstellung, die durchgaengige
Point-in-Time-Behandlung und die Mock-Kennzeichnung aus Phase 1 haben gehalten.
Die gefundenen Fehler liegen an den Raendern — dort, wo bisher nichts
angeschlossen war.

---

## HIGH-1 · Ein Backtest ohne eine einzige Position galt als gueltiges Ergebnis

**Fundort:** `quant/engines/backtest.js`, `quant/engines/trust-score.js`,
`quant/backtests/app.js`

**Was passierte.** Eine Strategie mit Filtern, die kein Titel erfuellt
(etwa `roic > 80 UND earningsYield > 15`), lief vollstaendig durch. Bei jedem
Rebalancing wurden null Titel ausgewaehlt, das Kapital blieb in bar. Das
Ergebnis:

```
CAGR              0,0 %
Max Drawdown      0,0 %
Sharpe            —
Trust Score       61   "Eingeschraenkt belastbar"
Aktuelle Titel    "Diese Unternehmen erfuellen aktuell die Regeln der Strategie."
                  (darunter: eine leere Tabelle)
```

**Warum das schwerwiegend ist.** Ein Trust Score von 61 ist eine Aussage. Er
sagt: dieses Ergebnis ist eingeschraenkt belastbar. Tatsaechlich gab es kein
Ergebnis — es wurde nie investiert. Eine flache Linie bei null Prozent sieht aus
wie eine Strategie, die Kapital erhalten hat, und ist tatsaechlich eine
Strategie, die nie stattgefunden hat. Der Satz „Diese Unternehmen erfuellen
aktuell die Regeln" ueber einer leeren Tabelle behauptet zusaetzlich etwas, das
nicht stimmt.

**Behoben.**

1. `backtest.js` zaehlt `investedDays` und meldet `capabilities.everInvested`,
   `timeInvestedPct`, `emptyRebalances` sowie typisierte `warnings`.
2. Zwei neue harte Kappungen in `quant/methodology/trust-score-v1.json`:

   | ID | Bedingung | Maximalwert |
   |---|---|---|
   | `neverInvested` | `everInvested === false` | **5** |
   | `mostlyCash` | `timeInvestedPct < 50` | **40** |

3. `currentHoldings` formuliert den leeren Fall aus:
   „Zum aktuellen Datenstand erfuellt kein Unternehmen des Modelluniversums die
   Regeln dieser Strategie." — und die Oberflaeche zeigt einen Zustandskasten
   statt einer leeren Tabelle.
4. Warnungen erscheinen **vor** den Kennzahlen, kritische mit `role="alert"`.
   Eine Warnung unter der Equity-Kurve liest niemand.

**Wirkung:** derselbe Backtest ergibt jetzt Trust Score **5** statt 61.

---

## HIGH-2 · Ein einzelner Netzhaenger machte eine Seite dauerhaft unbrauchbar

**Fundort:** `quant/ui/shell.js`, `loadJSON`

**Was passierte.** Der Ladecache speicherte die Promise — auch die abgelehnte.
Ein einziger fehlgeschlagener Abruf blieb damit im Cache, und **jeder** weitere
Aufruf derselben Datei bekam dieselbe Ablehnung zurueck. Die Seite liess sich
nur durch vollstaendiges Neuladen reparieren.

**Warum das mit echten Daten schwerer wiegt.** Im Mock-Betrieb kommen alle
Dateien aus demselben statischen Verzeichnis; ein Fehlschlag ist selten. Sobald
Anbieterdaten dazukommen, sind voruebergehende Fehler der Normalfall, nicht die
Ausnahme. Ein Muster, das genau dann versagt, wenn es gebraucht wird, ist
schlechter als keines.

**Behoben.** Drei Versuche mit wachsendem Abstand (400 ms, verdoppelnd),
Unterscheidung dauerhafter von voruebergehenden Fehlern (4xx ausser 408/429 wird
nicht wiederholt), und `delete cache[path]` im Fehlerfall — ein Fehlschlag wird
nicht mehr konserviert.

**Nachtrag im selben Audit.** Der Backtest-Worker
(`quant/ui/backtest-worker.js`) hatte dieselbe Schwaeche in eigener Form: er
laedt die Methodikdateien per synchronem XHR **ohne Wiederholung**. Ein
verlorener Abruf brach den gesamten Backtest mit „Methodik nicht ladbar" ab —
einer Meldung, die nach einem Rechenfehler klingt statt nach einem Netzhaenger.
Ebenfalls behoben, mit derselben Unterscheidung: ein 404 wird nicht wiederholt,
eine Antwort, die kein JSON ist, auch nicht.

---

## MEDIUM-1 · Ein fehlgeschlagenes Speichern galt als Erfolg

**Fundort:** `quant/api/client.js`

`saveStore()` faengt Ausnahmen von `localStorage.setItem` ab und gibt `false`
zurueck — richtig so, im privaten Modus oder bei vollem Speicher wirft der
Aufruf. Der Rueckgabewert wurde aber nicht ausgewertet:
`createStrategy()` meldete `ok: true`, die Oberflaeche leitete weiter, und die
Arbeit war weg.

**Behoben.** Neue Fehlerkonstante `STORAGE_ERROR`; `createStrategy` und
`createStrategyVersion` geben `ok: false` mit verstaendlicher Meldung zurueck,
wenn das Speichern scheitert.

---

## MEDIUM-2 · Eine ungenutzte innerHTML-Hintertuer

**Fundort:** `quant/ui/shell.js`, `el()`

Die Elementfabrik hatte einen `html:`-Zweig, der `innerHTML` setzte. Er wurde
nirgends benutzt.

**Warum trotzdem entfernt.** Eine solche Hintertuer wird frueher oder spaeter
mit Anbieter- oder Nutzertext benutzt — ein Unternehmensname, ein Nachrichten-
titel, eine Fehlermeldung des Anbieters. Sie hat keinen Nutzen, den `el()` nicht
sicher abdeckt, und ihre Existenz ist die einzige Voraussetzung fuer den Fehler.

**Behoben.** Zweig entfernt. Der Acceptance-Test prueft, dass er nicht
zurueckkehrt.

---

## MEDIUM-3 · Der Adapter-Transport konnte echte Antworten nicht lesen

**Fundort:** `quant/engines/market-client.js` (in dieser Phase entstanden)

`Promise.resolve(res.json ? res.json() : res.body)` — bei einem `Response`-
Objekt ist `res.body` ein `ReadableStream`, kein geparstes JSON. Der Zweig war
zudem unnoetig: die eigentliche Schwaeche lag darin, dass eine Antwort, die
**kein JSON** ist (die HTML-Fehlerseite eines Proxys, eine abgeschnittene
Uebertragung), eine Ausnahme warf, die von einem Netzfehler nicht zu
unterscheiden war. Der Client wiederholte sie dreimal.

**Behoben.** `readBody()` liest ueber `text()` und parst selbst. Eine
Nicht-JSON-Antwort wird als **dauerhafter** Fehler klassifiziert — dreimal
dagegenzulaufen aendert nichts und verbrennt Kontingent.

---

## MEDIUM-4 · Der veraltete Rueckfall hatte im Ernstfall nichts anzubieten

**Fundort:** `quant/engines/market-client.js` (in dieser Phase entstanden)

`readCache()` loeschte den abgelaufenen Eintrag beim Lesen. Der eine Moment, in
dem ein veralteter Wert gebraucht wird, ist aber genau der nach dem Ablauf —
ein Ausfall unmittelbar nach dem Verfall der Lebensdauer. Der Rueckfall fand
dann nichts mehr vor.

**Behoben.** Der abgelaufene Eintrag bleibt liegen und wird von
`staleFallback()` genutzt, markiert als `stale: true` und mit Altersangabe.
Neu: `maxStaleMs` (vier Stunden) — irgendwann ist ein alter Kurs keine
Notloesung mehr, sondern eine Falschinformation.

---

## MEDIUM-5 · „Ungeprueft" wurde stillschweigend zu „nicht vorhanden"

**Fundort:** `quant/engines/capabilities.js` (in dieser Phase entstanden)

Die Faehigkeitsmatrix kennt drei Zustaende — `true`, `false`, `null`. Die
Deklaration schrieb sie auf zwei zusammen:

```js
set[cap] = declared[cap] === undefined ? null : declared[cap] === true;
```

Ein **ausdrueckliches** `null` wurde damit zu `false`. Genau der Unterschied,
um den es dem Modul geht, ging in seiner eigenen Kernfunktion verloren: „wir
haben es nicht geprueft" als „der Anbieter kann das nicht" auszugeben, ist
dieselbe Sorte stiller Behauptung, die die Matrix verhindern soll.

**Behoben.** Alle drei Zustaende ueberleben. Fehleingaben (Zahlen, Zeichen-
ketten) landen bei `null`, nicht bei `false`.

---

## MEDIUM-6 · Die Mapping-Pruefung liess den haeufigsten Fall durch

**Fundort:** `quant/engines/symbol-mapping.js` (in dieser Phase entstanden)

`validateAgainstSecurities()` warnte nur bei `confidence === "unverified"`. Das
Vokabular kennt aber drei Werte, und die Mappings des Referenzuniversums
entstehen aus einer Konfigurationsdatei — also als `"inferred"`. Genau sie
blieben stumm. Eine Pruefung, die den haeufigsten Fall auslaesst, ist keine.

Zusaetzlich wurde die MIC-Abweichung gar nicht geprueft, obwohl Waehrung und
Land es wurden. Dasselbe Kuerzel an der falschen Boerse ist ein anderes Papier.

**Behoben.** Alles ausser `"verified"` warnt. MIC-Vergleich ergaenzt.

---

## MEDIUM-7 (offen) · Die Alt-Pipeline kennzeichnet ihre Bereinigungsstufe nicht

**Fundort:** `scripts/dashboard/fetch_market_data.py`,
`scripts/dashboard/backtest_technicals.py`, `dashboard/data/market_data.json`

Das bestehende Dashboard holt ueber denselben Anbieter Tageskurse und rechnet
darauf einen technischen Backtest. Die Reihen tragen **keine** Angabe zur
Bereinigung.

**Was geprueft wurde.** Die committete Reihe ist splitbereinigt: NVDA steht am
16. Juli 2021 bei 18,16 USD — der um 4:1 (2021) und 10:1 (2024) bereinigte
Kurs. Ein Test ueber alle Titel findet keinen unbereinigten Splitsprung. Der
naheliegende schwere Fehler liegt also **nicht** vor.

**Was bleibt.** Dividenden sind nicht bereinigt. Ein technischer Backtest ueber
sechs Jahre unterschaetzt damit die Gesamtrendite eines Dividendenzahlers
systematisch. Ausserdem fehlt die Kennzeichnung: dass die Reihe splitbereinigt
ist, weiss man erst nach dieser Untersuchung, nicht aus der Datei.

**Nicht behoben, mit Begruendung.** Die Alt-Pipeline liegt ausserhalb des
Auftrags dieser Phase, laeuft in Python statt im Quant-Stack und speist eine
andere Oberflaeche. Sie zu aendern hiesse, ein zweites System umzubauen, ohne
dass jemand danach gefragt hat. Die neue Providerschicht macht es richtig
(`adjustmentStatus` an jeder Bar); die Angleichung der Alt-Pipeline gehoert in
eine eigene Aufgabe.

---

## LOW-Befunde

**LOW-1 · Datenumfang der Ranglistenseiten.** `quant/data/securities.json` ist
945 KB gross und wird von Ranking, Screener und Radar geladen. Nachgemessen:
gzip-komprimiert sind es **175 KB** — GitHub Pages liefert komprimiert aus. Fuer
511 Titel mit 60 Feldern ist das angemessen. Kein Handlungsbedarf; die Zahl ist
hier festgehalten, damit sie bei einem groesseren Universum nicht uebersehen
wird. Ab etwa 2 000 Titeln waere eine Aufteilung wie bei der Factor DNA faellig.

**LOW-2 · Barrierefreiheit der Tabellen.** 11 Tabellen, 28 `scope`-Angaben —
die Kopfzellen sind ausgezeichnet. Es fehlen `<caption>`-Elemente; die Tabellen
haben stattdessen eine sichtbare Ueberschrift davor. Fuer Screenreader waere
eine explizite Zuordnung besser. Nicht behoben, weil es die bestehende
Seitenstruktur betrifft und keine Falschaussage erzeugt.

**LOW-3 · `role`-Attribute sparsam.** Vier Rollen im gesamten Quant-Bereich
(`note`, `img`, `tablist`, `tab`). Die neuen Warnungen aus HIGH-1 haben
`role="alert"` bekommen. Weitere Ergaenzungen waeren moeglich, sind aber ohne
Test mit echten Hilfsmitteln Spekulation.

**LOW-4 · CI deckte die neuen Verzeichnisse nicht ab.** Der Pfadfilter von
`quant-ci.yml` kannte `providers/**` und `scripts/market/**` nicht; die
JSON-Pruefung listete Verzeichnisse einzeln auf und uebersah damit
`quant/config/`. **Behoben:** Filter erweitert, JSON-Pruefung auf `find`
umgestellt, drei neue Schritte (Schluesselpruefung, Abruf ohne Zugang,
Anbieterbewertung).

---

## Was ausdruecklich geprueft wurde und in Ordnung war

Ein Audit, das nur Befunde nennt, verschweigt die Haelfte des Ergebnisses.

- **Point-in-Time.** Kein Weg an `availableAt <= decisionTime` vorbei; kein
  Umgehungsparameter; die Regel gilt auch fuer den Radar und die KI-Werkzeuge.
- **Vendor-Isolation.** Kein vendor-spezifischer Feldzugriff im Frontend; der
  Acceptance-Test prueft es ueber alle ausgelieferten Dateien.
- **Determinismus.** `verify-quant-data.mjs` rechnet 482 Titel neu und findet
  null Abweichungen zum committeten Stand.
- **Speicherzugriffe.** Alle `localStorage`-Aufrufe sind in `try/catch` —
  der private Modus bricht nichts.
- **Kein `eval`, kein `document.write`, kein `new Function`.**
- **Mock-Kennzeichnung.** Auf jeder Seite, in jedem Datensatz (`isMock`), in
  jedem Export.
- **Deckungslogik.** Ein Titel ohne ausreichende Faktorabdeckung bekommt
  `INCOMPLETE` statt einer Zahl — auch im Hybridmodus, ohne Sonderregel.

---

## Sicherheitsbefunde

Getrennt gefuehrt, weil der Auftrag es getrennt verlangt hat.

**Kein Befund.** Es wurde kein Schluessel, kein Token und kein Zugangsdatum im
Repository gefunden. Der bestehende Zugang (`TWELVE_DATA_API_KEY`) wird korrekt
ueber `secrets.` in den Workflow gereicht.

Das Audit hat daraus keine Entwarnung abgeleitet, sondern acht Pruefungen
gebaut (`quant/tests/secrets.test.mjs`), die den Zustand halten:

| Test | Prueft |
|---|---|
| S1 | Kein schluesselartiges Literal in irgendeiner committeten Datei (~400 Dateien) |
| S2 | Kein Browser-Code liest `process.env` oder `import.meta.env` |
| S3 | Der Adapter ist Node-only und wird von keiner HTML-Seite eingebunden |
| S4 | Keine ausgelieferte JSON-Datei traegt eine Anfrage-URL oder ein Auth-Feld |
| S5 | Workflows reichen Zugangsdaten nur ueber `secrets.` bzw. `github.token` |
| S6 | `.gitignore` deckt `.env`, `*.key`, `secrets.json` ab; `.env.example` ist leer |
| S7 | Keine echte Zugangsdatei im Arbeitsverzeichnis |
| S8 | Der Adapter reicht einen Schluessel auch dann nicht durch, wenn der Anbieter ihn in einer Fehlermeldung spiegelt |

S8 ist der interessanteste: er baut den realen Fall nach, in dem ein Anbieter
mit `"Invalid API key: <schluessel>"` antwortet, und prueft, dass weder die
Antwort noch `stats()`, `health()` oder `quota()` den Schluessel enthalten.

Zusaetzlich `scripts/market/assert-no-secrets.mjs` als letzte Pruefung vor dem
Commit — gegen den Wert der Umgebungsvariablen und gegen Muster. Der Fund selbst
wird nie ausgegeben; sonst stuende der Schluessel im Build-Log.

---

## Nicht behoben, mit Begruendung

| Befund | Warum offen |
|---|---|
| MEDIUM-7 (Alt-Pipeline) | Zweites System, anderer Stack, andere Oberflaeche. Ausserhalb des Auftrags. |
| LOW-2 (Tabellen-Captions) | Betrifft die bestehende Seitenstruktur, erzeugt keine Falschaussage. |
| LOW-3 (weitere ARIA-Rollen) | Ohne Test mit echten Hilfsmitteln Spekulation. |
| LOW-1 (Datenumfang) | Nachgemessen unproblematisch. Als Schwelle notiert. |
