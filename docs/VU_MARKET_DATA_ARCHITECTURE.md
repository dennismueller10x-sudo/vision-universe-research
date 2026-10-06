# VU MARKET DATA ARCHITECTURE

Wie echte Marktdaten in ein System kommen, das keinen Server hat.

Implementierung: `quant/engines/{capabilities,symbol-mapping,market-client,market-quality,data-mode}.js`,
`providers/twelve-data/adapter.js`, `scripts/market/fetch-market-data.mjs`

---

## 1. Die Randbedingung, aus der alles folgt

Vision Universe wird statisch von GitHub Pages ausgeliefert. Es gibt **keine
Serverlaufzeit**, kein Backend, keinen Prozess, der etwas geheim halten koennte.
Alles, was der Browser laedt, ist oeffentlich lesbar — HTML, JavaScript, JSON,
jede Netzwerkanfrage in den Entwicklerwerkzeugen.

Daraus folgt eine harte Regel und ihre Konsequenz:

> Ein API-Schluessel im Browser ist ein oeffentlicher Schluessel.
> Also ruft der Browser **nichts** direkt beim Anbieter ab.

Die Alternative — den Schluessel „nur ein bisschen" zu verstecken, etwa in einer
separaten JS-Datei oder base64-kodiert — ist keine. Sie kostet Aufwand und
aendert nichts daran, dass der Schluessel ausgeliefert wird.

## 2. Der Datenweg

```
GitHub Secret (TWELVE_DATA_API_KEY)
        │   nur im Speicher des Action-Runners
        ▼
GitHub Action  .github/workflows/market-data.yml
        │
        ▼
Adapter        providers/twelve-data/adapter.js
        │   Vendor-Antwort -> kanonische PriceBar
        ▼
Transport      quant/engines/market-client.js
        │   Kontingent, Cache, Wiederholung, Zustand
        ▼
Qualitaet      quant/engines/market-quality.js
        │   unbereinigte Splits, kaputte Bars, Luecken
        ▼
JSON           quant/data/market/daily/<securityId>.json
               quant/data/market/status.json
        │   committet, versioniert, oeffentlich
        ▼
GitHub Pages   das Frontend liest nur Dateien
```

Der Schluessel taucht in diesem Weg genau einmal auf — links oben — und
verlaesst den Runner nie. Was ausgeliefert wird, ist das **Ergebnis** des
Abrufs, nicht der Zugang dazu.

### Warum vorberechnen statt live abrufen

| | Vorberechnung | Direktabruf im Browser |
|---|---|---|
| Schluessel | bleibt im Runner | oeffentlich |
| Kontingent | 15 Anfragen pro Tag | 15 Anfragen **pro Besucher** |
| Ausfall des Anbieters | Seite laeuft mit letztem Stand | Seite ist leer |
| Ladezeit | eine JSON-Datei | mehrere Rundreisen |
| Qualitaetspruefung | vor der Auslieferung | gar nicht |

Bei einem Free Plan mit 800 Anfragen pro Tag waere der Direktabruf schon bei
55 Besuchern erschoepft. Der eigentliche Grund ist aber der Schluessel.

### Wann ein Proxy noetig waere

Fuer echte Intraday- oder Realtime-Daten reicht die Vorberechnung nicht: ein
Kurs, der stuendlich committet wird, ist kein Realtime-Kurs. Der dann noetige
Weg ist ein schmaler serverseitiger Vermittler (Cloudflare Worker, Netlify
Function, Vercel Edge Function):

```
Browser  ->  Worker (haelt den Schluessel)  ->  Anbieter
```

Der Worker fuegt den Schluessel serverseitig hinzu, begrenzt die Anfragen je
Besucher und gibt nur die kanonischen Felder zurueck. Das ist bewusst **nicht**
Teil dieser Phase: es ist der erste Baustein mit laufenden Kosten und einer
eigenen Betriebsverantwortung, und ohne belegten Bedarf an Intraday-Daten waere
er verfrueht.

## 3. Die fuenf Bausteine

### capabilities.js — was ein Zugang kann

Eine Faehigkeit hat drei Zustaende, nicht zwei:

| Wert | Bedeutung | Folge |
|---|---|---|
| `true` | zugesichert vorhanden | darf benutzt werden |
| `false` | ausdruecklich nicht vorhanden | `providerCapabilityMissing` |
| `null` | **ungeprueft** | wird wie nicht vorhanden behandelt, aber anders benannt |

Der dritte Zustand ist der wichtige. „Wir haben nicht nachgesehen" als „der
Anbieter kann das nicht" auszugeben, waere dieselbe Sorte stiller Behauptung,
die dieses Modul verhindern soll — nur in die andere Richtung. `supports()`
erlaubt nur bei `true`; `explicitlyMissing()` ist nur bei `false` wahr. Beide
sind bei `null` falsch, und genau das ist beabsichtigt.

### symbol-mapping.js — welches Papier gemeint ist

Ein Ticker ist keine eindeutige Kennung. `BMW` ist an der XETRA der Automobil-
hersteller und an der Johannesburger Boerse ein anderes Unternehmen. `SAN` ist
je nach Handelsplatz Banco Santander oder Sanofi.

Die Registry ordnet VU-`securityId` und Providersymbol einander zu und **loest
Mehrdeutigkeit nicht auf**, sondern meldet sie:

```js
registry.toSecurity("twelve-data", "BMW")
// -> { resolved: false, candidates: ["sec_BMW_DE", "sec_BMW_ZA"], reason: "..." }

registry.toSecurity("twelve-data", "BMW", { mic: "XETR" })
// -> { resolved: true, securityId: "sec_BMW_DE" }
```

Ein geratenes Mapping liefert die Kurse eines anderen Unternehmens — ein Fehler,
der in keiner Kennzahl auffaellt und jede darauf gebaute Auswertung entwertet.
Deshalb: lieber gar nicht abrufen.

`confidence` kennt `verified`, `inferred`, `unverified`; nur `verified` gilt als
geprueft, und geprueft heisst, dass jemand Name, Boerse und Waehrung beim
Anbieter gegen den Wertpapierstamm gehalten hat.

### market-client.js — der Transport

Anbieterneutral. Kennt keinen Anbieter, nur HTTP, Kontingente und Fehlerklassen.

- **Kontingentfenster** je Minute und Tag; die Anfrage wartet oder scheitert
  sauber, statt in ein 429 zu laufen.
- **Cache** mit Lebensdauer je Datenart (Quote 60 s, Tageshistorie 6 h,
  Symbolsuche 24 h).
- **Zusammenfassung** identischer gleichzeitiger Anfragen: zehn Kacheln fuer
  dasselbe Symbol erzeugen eine Anfrage, nicht zehn.
- **Wiederholung** nur bei voruebergehenden Fehlern, mit wachsendem Abstand.
  Ein abgelehnter Schluessel wird nicht wiederholt — er wird durch Wiederholen
  nicht richtig.
- **Veralteter Rueckfall**: faellt ein Abruf aus, wird der letzte erfolgreiche
  Wert geliefert — **markiert** als `stale: true` und nur bis `maxStaleMs`
  (vier Stunden). Danach lieber ein Fehler als ein Kurs von gestern.

Fehlerklassen, weil sie unterschiedliche Antworten verlangen:

| Klasse | Beispiel | Reaktion |
|---|---|---|
| `auth` | 401, 403 | nicht wiederholen, Zustand `authError` |
| `quota` | 429 | nicht wiederholen, Minutenfenster fuellen, veralteten Wert liefern |
| `transient` | 500, 503, Netzfehler | wiederholen mit wachsendem Abstand |
| `permanent` | 400, 404, Antwort ist kein JSON | nicht wiederholen |

Dass eine Nicht-JSON-Antwort (die HTML-Fehlerseite eines Proxys) als dauerhaft
gilt, ist kein Detail: als voruebergehender Fehler behandelt, laeuft der Client
dreimal dagegen und verbrennt Kontingent an etwas, das sich nicht aendert.

### market-quality.js — die Eingangspruefung

Kein Datensatz erreicht die Engine ungeprueft. Fehler verwerfen die Bar,
Warnungen begrenzen ihre Verwendbarkeit.

Der wichtigste Befund ist `suspected_unadjusted_split`: ein Kurssprung ueber
35 %, dessen Verhaeltnis nahe an einem glatten Splitverhaeltnis liegt (2:1,
3:1, 4:1, 10:1 …). Unbereinigt gerechnet liest die Engine daraus einen echten
Kursverlust von 75 % — und eine Strategie, die darauf einen Backtest rechnet,
kommt zu einem Ergebnis, das mit der Wirklichkeit nichts zu tun hat.

Weiter geprueft: Datumsformat, Zukunftsbars, Dubletten, Reihenfolge, `high` unter
`low`, Kurs ausserhalb der Tagesspanne, negatives Volumen, Luecken ueber mehrere
Handelstage.

### data-mode.js — was gerade gilt

Drei Modi:

| Modus | Bedeutung |
|---|---|
| `mock` | ausschliesslich synthetische Daten. Der Standard, immer lauffaehig. |
| `hybrid` | echte Kurse fuer das Referenzuniversum, alles andere synthetisch. |
| `live` | nur echte Daten; scheitert bewusst, wenn etwas fehlt. |

Die Herkunft wird **je Datenklasse** bestimmt, nicht fuer die Seite als Ganzes.
Kurse koennen echt sein, waehrend Fundamentaldaten synthetisch bleiben — und
genau dieser Zustand ist in Phase 2 der Normalfall. Ein einziges
„Live"-Abzeichen wuerde ihn zur Halbwahrheit machen.

Die zentrale Garantie: **ein Ausfall echter Daten wird nie stillschweigend durch
Mock-Daten ersetzt.** Faellt der Abruf aus, steht die Datenklasse in
`degraded[]`, und der Text sagt es.

## 4. Grenzen dieser Phase

Was diese Architektur **nicht** tut, und warum:

- **Keine Fundamentaldaten fuer reale Unternehmen.** Das Referenzuniversum
  bekommt echte Kurse und sonst nichts. Ein reales Unternehmen mit erfundenen
  Bilanzzahlen zu zeigen ist die eine Sorte Fehler, die sich nicht durch einen
  Hinweis heilen laesst — deshalb bekommen diese Titel auch keinen Quant Score.
- **Keine Vermischung der Universen.** `ref_*` (real, nur Kurse) und `sec_VU*`
  (synthetisch, vollstaendig) sind disjunkt; ein Test prueft das.
- **Kein Total Return aus unbereinigten Kursen.** `adjustedClose` bleibt `null`,
  solange die Total-Return-Bereinigung nicht zugesichert ist.
- **Kein Realtime.** Ohne Proxy nicht sicher machbar, und ohne belegten Bedarf
  nicht noetig.

## 5. Einen weiteren Anbieter anbinden

1. `providers/<name>/adapter.js` anlegen. Node-only (`require`), kein
   `global.VU*` — der Adapter darf nicht browserfaehig sein.
2. `freePlanCapabilities()` deklarieren. Im Zweifel `null`, nicht `true`.
3. Symbol-Mapping bereitstellen; `confidence: "verified"` erst nach Pruefung.
4. In `scripts/market/evaluate-provider.mjs` unter `ADAPTERS` eintragen und
   `node scripts/market/evaluate-provider.mjs <name>` laufen lassen.
5. Ergebnis in `docs/VU_PROVIDER_CAPABILITIES.md` eintragen.
6. Lizenzfragen aus `docs/VU_PROVIDER_LICENSE_CHECKLIST.md` beantworten,
   **bevor** Daten veroeffentlicht werden.
