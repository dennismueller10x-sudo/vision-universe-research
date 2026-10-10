# Frag Vision Universe (`vu-ask`)

Nutzer stellen eine Investmentfrage in eigenen Worten, getippt oder gesprochen, mit Füllwörtern und Tippfehlern. Claude Haiku 4.5 übersetzt die Frage in eine Screener-Abfrage. **Gerechnet wird ausschließlich im Browser, auf den Vision-Universe-Daten**: das Screener-Universum mit rund 5.400 US-Aktien, die Supertrader-Signale und die Quant-Faktoren. Das Modell nennt nie selbst eine Zahl.

```
Browser /ask/  ──Frage──▶  Worker vu-ask  ──▶  Durable Object AskGate  ──▶  Claude Haiku 4.5
      ▲                                     (Budget, Limits, Cache, Protokoll)
      └──── übersetzte Abfrage ◀────────────┘
Browser rechnet: screener/engine + /screener/data/universe-US_REAL.json + /supertrader/data/signals.json
```

**Chartbild-Werkzeug (`getChartbildLage`, lesend):** Fragt jemand nach der Chartlage einer Aktie, setzt das Modell nur `chartbild: true`. Die Werte (Ausblick, Kursstruktur, Hauptszenario mit Zone, Ungültig-Linie, Bestätigung, Zielzone 1, Elliott-Anwendbarkeit samt Enthaltung) liest der Browser aus `/quant/data/technical-intelligence/v3/index.json.gz` über `quant/engines/technical/ti/ai-tools.js`. Jede Antwort trägt den Status „experimentell, nicht von Experten validiert“ für Elliott und einen Hinweis „keine Prognose, keine Anlageberatung“; Trefferquoten werden nicht ausgegeben. Der Worker selbst ruft keine Daten ab.

## Kosten und harte Grenzen

Eine neue Frage kostet mit Haiku 4.5 ($1 / $5 je Mio. Token) nach Schätzung **etwa 0,5–0,8 Cent**. Die Rechnung dahinter: rund 5.000 Token Anweisung mit dem vollständigen Feldkatalog plus 300–500 Token Antwort. Mit 250 $ Guthaben reicht das für etwa 30.000–50.000 Fragen. Bereits gestellte Fragen, auch anders formuliert oder mit Füllwörtern, kommen **kostenlos** aus dem Cache und verbrauchen kein Kontingent.

Die Grenzen wirken von außen nach innen:

| # | Grenze | Wo | Einstellung |
|---|---|---|---|
| 1 | **Prepaid-Guthaben, automatisches Nachladen AUS** – die harte Grenze | console.anthropic.com → Billing | 5 $ |
| 2 | Sicherheitsnetz gegen Codefehler (greift im Normalbetrieb nie) | `VU_ASK_MONTHLY_USD` | 100 $ |
| 3 | Fragen pro Tag, alle Nutzer | `VU_ASK_GLOBAL_DAILY` | 100 |
| 4 | Fragen pro Anschluss/Browser und Tag | `VU_ASK_PER_USER_DAILY` oder GitHub-Variable | 10 |
| 5 | Alle Anfragen pro Anschluss und Tag (auch Cache) | `VU_ASK_REQUESTS_PER_IP_DAILY` | 60 |
| 6 | Beta-Passwort | `VU_ASK_ACCESS_HASH` (nur der Hash) | aktiv |

Ist das Guthaben leer, meldet die Seite „Kontingent aufgebraucht“; der Worker fragt dann 15 Minuten lang gar nicht mehr und versucht es danach einmal neu. **Nachladen genügt – keine Codeänderung.** Modell ist ausschließlich Claude Haiku 4.5; der Worker kennt für kein anderes Modell einen Preis und ruft keines auf.

- **Grenze 1 ist die entscheidende.** Ist das Guthaben aufgebraucht und das Nachladen aus, lehnt Anthropic ab. Eine Rechnung kann dann nicht entstehen, auch nicht bei einem Fehler in diesem Code. Zusätzlich empfehlenswert: unter *Limits* ein Monats-Ausgabenlimit für den Workspace setzen.
- **Die Grenzen 2–5 rechnen vorher.** Vor jedem Aufruf wird der schlechteste Fall reserviert, also die volle Eingabe plus die maximale Ausgabe. Passt die Reservierung nicht mehr unter eine Grenze, geht keine Anfrage hinaus.
- **Gleichzeitige Anfragen** laufen alle durch *ein* Durable Object und können die Grenze deshalb nicht gemeinsam überschreiten.
- **Bots:** Nur die eigenen Seiten dürfen fragen (Origin-Prüfung). Pro Anschluss gibt es 1 Frage pro Tag, dazu die globale Tagesgrenze. Optional lässt sich Cloudflare Turnstile einschalten, dann ist jede kostenpflichtige Frage bot-geprüft.
- **Schlimmster Fall ohne Turnstile:** Viele Bots mit vielen IP-Adressen verbrauchen höchstens das Tageskontingent (200 Fragen, etwa 1,50 $). Danach ist für den Tag Schluss, und das Monatsbudget bleibt die Obergrenze.
- **Hauptschalter:** `VU_ASK_ENABLED = "false"` in `wrangler.toml` schaltet die Funktion ab. Danach geht keine einzige Anfrage mehr an Anthropic, Cache-Antworten laufen weiter.

## Datenschutz

Es wird **keine IP-Adresse** gespeichert. Der Zähler eines Anschlusses ist ein Hash aus IP, Datum und einem geheimen Salz. Er wechselt täglich, und alte Tageszähler werden gelöscht. Gespeichert werden der Fragetext, der Status und die fehlenden Daten, damit Lücken nachgebaut werden können. Die Seite weist darauf hin. Bitte in die Datenschutzerklärung aufnehmen: Fragen werden zur Übersetzung an Anthropic (USA) übermittelt, und die Spracheingabe nutzt die Spracherkennung des Browsers.

## „Das Modell muss lernen“: der Lernbericht

Claude lernt nicht von selbst. Das Lernen passiert über diesen Kreislauf:

1. Jede Frage wird mit einem Status protokolliert: `ok`, `partial`, `gap` (Daten fehlen), `unclear`, `off_topic`, `forecast`, `rejected` (Limit) oder `error`.
2. Das Modell meldet ausdrücklich, **was gefehlt hat**, zum Beispiel „Insiderkäufe“ (Typ `field`), „Quant-Gesamtscore“ (`withheld`) oder „Umsatzprognosen“ (`estimates`).
3. Der Lernbericht fasst das nach Häufigkeit zusammen, jeweils mit Beispielfragen:

```bash
curl -s -H "Authorization: Bearer $VU_ASK_ADMIN_KEY" https://vu-ask.little-credit-15d3.workers.dev/v1/admin/report | jq
```

   Der Admin-Key ist, wenn kein eigenes Secret gesetzt ist, `HMAC-SHA256(CLOUDFLARE_API_TOKEN, "vu-ask-admin-v1")` in Hex. Weil das Repository öffentlich ist, wird der Bericht bewusst nicht in einem Actions-Protokoll ausgegeben. Die wichtigsten Felder: `missingData` (die meistgewünschten fehlenden Daten), `notUnderstood` (Fragen, die nicht übersetzt werden konnten), `byStatus` und `spend`.
4. Wird ein Feld im Screener freigeschaltet (`screener/engine/fields.js`), kennt die Fragefunktion es automatisch. Anweisung und Antwortschema werden aus dieser Datei erzeugt.

## Einrichtung (einmalig, etwa 5 Minuten)

Von Hand ist **nur der Anthropic-Schlüssel** einzurichten. Alles andere erledigt sich selbst: Der Cloudflare-Zugang liegt schon vor, den Admin-Key leitet der Workflow ab, das Salz erzeugt der Worker, und die Adresse steht bereits in `ask/index.html`.

1. **console.anthropic.com:** unter Settings → Billing das **Auto-Reload ausschalten**. Unter Settings → API Keys → „Create Key“ einen Schlüssel anlegen und kopieren (er wird nur einmal angezeigt).
2. **GitHub:** im Repository unter Settings → Secrets and variables → Actions → „New repository secret“ den Namen `ANTHROPIC_API_KEY` eintragen und den Schlüssel als Wert.
3. **Ausrollen:** Nach dem Merge rollt der Workflow *Cloudflare — Fragefunktion (vu-ask) ausrollen* automatisch aus. Wurde der Schlüssel erst danach hinterlegt, den Workflow einmal von Hand starten (Actions → Workflow → „Run workflow“).

Grenzen ändern: die Werte in `wrangler.toml` anpassen und mergen, dann wird automatisch neu ausgerollt.

## Tests

```bash
node --test "workers/vu-ask/tests/*.test.mjs" "ask/tests/*.test.mjs"
```

Die Anthropic-API ist in den Tests simuliert. Geprüft werden alle Grenzen, gleichzeitige Anfragen, der Cache, die Erstattung bei Fehlern, die Bot-Prüfung, die Vorgabe „keine IP gespeichert“, der Lernbericht und die Übersetzung in gültige Screener-Abfragen.
