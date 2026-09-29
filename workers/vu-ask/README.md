# Frag Vision Universe (`vu-ask`)

Nutzer stellen eine Investmentfrage in eigenen Worten, getippt oder gesprochen, mit Füllwörtern und Tippfehlern. Claude Haiku 4.5 übersetzt die Frage in eine Screener-Abfrage. **Gerechnet wird ausschließlich im Browser, auf den Vision-Universe-Daten**: das Screener-Universum mit rund 5.400 US-Aktien, die Supertrader-Signale und die Quant-Faktoren. Das Modell nennt nie selbst eine Zahl.

```
Browser /ask/  ──Frage──▶  Worker vu-ask  ──▶  Durable Object AskGate  ──▶  Claude Haiku 4.5
      ▲                                     (Budget, Limits, Cache, Protokoll)
      └──── übersetzte Abfrage ◀────────────┘
Browser rechnet: screener/engine + /screener/data/universe-US_REAL.json + /supertrader/data/signals.json
```

## Kosten und harte Grenzen

Eine neue Frage kostet mit Haiku 4.5 ($1 / $5 je Mio. Token) nach Schätzung **etwa 0,5–0,8 Cent**. Die Rechnung dahinter: rund 5.000 Token Anweisung mit dem vollständigen Feldkatalog plus 300–500 Token Antwort. Mit 250 $ Guthaben reicht das für etwa 30.000–50.000 Fragen. Bereits gestellte Fragen, auch anders formuliert oder mit Füllwörtern, kommen **kostenlos** aus dem Cache und verbrauchen kein Kontingent.

Die Grenzen wirken von außen nach innen:

| # | Grenze | Wo | Standard |
|---|---|---|---|
| 1 | **Prepaid-Guthaben, automatisches Nachladen AUS** | console.anthropic.com → Billing | 250 $ |
| 2 | Gesamtbudget | `VU_ASK_TOTAL_USD` | 200 $ |
| 3 | Monatsbudget | `VU_ASK_MONTHLY_USD` | 20 $ |
| 4 | Fragen pro Tag, alle Nutzer | `VU_ASK_GLOBAL_DAILY` | 200 |
| 5 | Fragen pro Anschluss/Browser und Tag | `VU_ASK_PER_USER_DAILY` | 1 |
| 6 | Alle Anfragen pro Anschluss und Tag (auch Cache) | `VU_ASK_REQUESTS_PER_IP_DAILY` | 40 |

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
curl -s -H "Authorization: Bearer $VU_ASK_ADMIN_KEY" https://vu-ask.<subdomain>.workers.dev/v1/admin/report | jq
```

   Die wichtigsten Felder: `missingData` (die meistgewünschten fehlenden Daten), `notUnderstood` (Fragen, die nicht übersetzt werden konnten), `byStatus` und `spend`.
4. Wird ein Feld im Screener freigeschaltet (`screener/engine/fields.js`), kennt die Fragefunktion es automatisch. Anweisung und Antwortschema werden aus dieser Datei erzeugt.

## Einrichtung (einmalig)

1. **Anthropic:** console.anthropic.com → API-Key anlegen. Unter Billing das **Auto-Reload ausschalten** und optional unter Limits ein Monatslimit setzen.
2. **GitHub-Secrets anlegen:** `ANTHROPIC_API_KEY`, `VU_ASK_ADMIN_KEY` und `VU_ASK_SALT` (je eine lange Zufallszeichenkette, z. B. `openssl rand -hex 32`). `TURNSTILE_SECRET` ist optional.
3. **Ausrollen:** Actions → *Cloudflare — Fragefunktion (vu-ask) ausrollen* → Run workflow. Die Zusammenfassung zeigt die Adresse `https://vu-ask.<subdomain>.workers.dev`.
4. **Seite freischalten:** Die Adresse in `ask/index.html` bei `<meta name="vu-ask-endpoint" content="">` eintragen und veröffentlichen. Mit Turnstile zusätzlich den öffentlichen Site-Key bei `vu-ask-turnstile` eintragen.

Grenzen ändern: die Werte in `wrangler.toml` anpassen und den Workflow erneut ausführen.

## Tests

```bash
node --test "workers/vu-ask/tests/*.test.mjs" "ask/tests/*.test.mjs"
```

Die Anthropic-API ist in den Tests simuliert. Geprüft werden alle Grenzen, gleichzeitige Anfragen, der Cache, die Erstattung bei Fehlern, die Bot-Prüfung, die Vorgabe „keine IP gespeichert“, der Lernbericht und die Übersetzung in gültige Screener-Abfragen.
