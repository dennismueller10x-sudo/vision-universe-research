# VU SOCIAL INTELLIGENCE OS — ARCHITEKTUR

Stand: 2026-09-15 · Zweig `claude/vision-universe-social-os-eudjmx`

## Leitprinzip

> **Das System fragt nicht "was posten wir heute?".**
> Es fragt: Was passiert gerade? Was davon ist fuer unsere Zielgruppe relevant?
> Welche eigene Perspektive kann Vision Universe liefern? Welches Format
> transportiert das? Wann und wo? Und was haben wir aus frueheren
> Veroeffentlichungen gelernt?

Daraus folgt die zweite Regel, die in diesem Bereich mehr Code kostet als jede
andere:

> **Das System darf sich weigern.**
>
> Kein Trend Score ohne Datenlage. Keine Gelegenheit ohne Anlass. Kein
> Performance Score ohne Vergleichsbasis. Keine Zahl im Text ohne Beleg. Keine
> Lernaussage ohne Stichprobe.

Eine Zahl, die aussieht wie eine Messung und keine ist, ist im Investmentkontext
gefaehrlicher als eine Luecke.

## Einordnung im Repository

Vision Universe ist eine statische Website (GitHub Pages, `research.visionuniverse.de`)
ohne Build-Pipeline und ohne Server-Runtime — **mit genau einer Ausnahme**, siehe
naechster Abschnitt. Der Social-Bereich folgt exakt dem
Muster von `quant/`: UI, reine Logik, Daten und Konfiguration getrennt, Engines
laufen in Browser **und** Node, Tests mit `node --test`.

Social ist eine **neue Faehigkeit innerhalb** des bestehenden Systems (§48) und
keine zweite Architektur. Was wiederverwendet wird, steht in
`docs/VU_SOCIAL_PHASE_A_AUDIT.md`, Abschnitt 3.

## Die eine Ausnahme: der Cloudflare Worker

Ein OAuth-Callback ist ein HTTP-Endpunkt. GitHub Pages hat keinen, und ein
GitHub-Actions-Lauf ebenso wenig. Dafuer — **und nur dafuer** — gibt es den Worker
`vision-universe-social` (`workers/vision-universe-social/`).

| | Wo es laeuft |
|---|---|
| OAuth, Token-Tausch, Token-Haltung, Verifikation | **Cloudflare Worker** |
| Signale, Trend, Opportunity, Content, Publishing-Orchestrierung, Learning | GitHub Actions |
| Command Center, Artefakte | GitHub Pages |
| Dauerhafte Marktdaten-Ablage | R2 via eigenem S3-Treiber (unveraendert) |

**Der Worker ist kein VU-Backend.** Er kennt die Engines nicht, er weiss nichts ueber
Trends, Gelegenheiten oder Content. Nichts aus dem Repository wandert dorthin.

### Warum das Token dort liegt und nicht als GitHub-Secret

Das langlebige Page-Token gibt **Schreibzugriff auf ein oeffentliches Profil**. Es liegt
in Cloudflare KV, und es gibt **keinen Endpunkt, der es zurueckgibt** — auch keinen
geschuetzten. `/status` liefert stattdessen einen SHA-256-Fingerabdruck.

Deshalb laeuft auch die Verifikation *im Worker*: ein Endpunkt, der das Token herausgibt,
damit jemand anders prueft, waere ein Exfiltrationsendpunkt mit guter Absicht.

Als GitHub-Secret laege dasselbe Token an einem zweiten Ort, mit einem zweiten Kreis von
Leseberechtigten, und in jedem Lauf in einer Prozessumgebung.

### Warum der Zustand trotzdem im Repository sichtbar ist

`/social/meta/status` verlangt einen Admin-Schluessel. Das Command Center ruft ihn deshalb
**nicht** aus dem Browser auf — ein Schluessel im Browser waere ein oeffentlicher
Schluessel. Stattdessen derselbe Weg wie ueberall: ein Actions-Lauf
(`scripts/social/fetch-meta-status.mjs`) holt den Zustand und schreibt
`social/data/meta-connection.json`; die Oberflaeche liest das Artefakt.

### Speicher

Cloudflare KV, **genau ein Datensatz**. Kein D1 — eine relationale Datenbank fuer eine
Zeile waere die Parallelarchitektur, die ausdruecklich nicht entstehen soll. Der
OAuth-`state` braucht gar keinen Speicher: er traegt seinen eigenen HMAC und ist damit
selbst-verifizierbar.

Kosten: einstellige Schreibvorgaenge pro Tag gegen eine Freigrenze von 1.000.

## Schichten

```
social/index.html + social/ui/*         COMMAND CENTER — nur Darstellung
            |
social/data/**                          ARTEFAKTE (von Laeufen erzeugt)
            |
scripts/social/*.mjs                    ORCHESTRIERUNG (GitHub Actions)
            |
social/engines/*.js                     DOMAIN ENGINES
            |
social/engines/provider.js              PROVIDER-ABSTRAKTION
social/engines/capabilities.js          CAPABILITY-MATRIX (Sicherheitsgrenze)
            |
social/providers/*/adapter.js           ADAPTER (einziger Ort mit Plattformkenntnis)
```

Die Oberflaeche liest **ausschliesslich** Artefakte. Sie ruft keine Engine auf und
rechnet nichts. Genau an der Grenze `social/data/**` liesse sich spaeter ein
HTTP-Service einsetzen, ohne eine Zeile in der Oberflaeche zu aendern.

## Der Kreislauf

```
INTERNE VU-SIGNALE          externe Quellen: definiert, nicht angebunden
   (quant/data/**)
        |
   signals.js              Normalisierung, Provenance-Pflicht, Clustering
        |
   trend-score.js          12 Dimensionen; enthaelt sich bei zu duenner Lage
        |
   opportunity.js          8 Dimensionen; braucht Trend ODER VU-Signal
        |
   strategy.js             Exploration/Exploitation, Archetyp, Zeitpunkt
        |
   content.js              9 Stufen: RESEARCH..PACKAGE
        |
   fact-check.js  brand.js  fatigue.js      drei unabhaengige Sperren
        |
   publishing.js           Lebenszyklus, Idempotenz, Retry, Kill Switch
        |
   [ PLATTFORM ]           via Adapter
        |
   analytics.js            kanonische Normalisierung, Rohwerte erhalten
        |
   performance.js          9 Dimensionen mit Deckeln (Anti-Virality)
        |
   memory.js               Content Memory
        |
   learning.js             Beobachtungen mit Konfidenzintervall
   experiments.js          eine Variable, vorher festgelegte Stichprobe
        |
   -> zurueck in strategy.js (Parameter) und opportunity.js (Historie)
```

`social/tests/loop.test.mjs` fuehrt diesen Kreislauf vollstaendig aus und prueft,
dass er sich schliesst: die Messung des ersten Beitrags veraendert nachweisbar die
Entscheidung ueber den zweiten.

## Die Engines

| Datei | Aufgabe | Der Punkt, an dem sie sich weigert |
|---|---|---|
| `schema.js` | kanonische Entitaeten (§37) | fehlender Wert = `null`, nie 0; Tokenfelder werden abgelehnt |
| `events.js` | Ereignisse + Idempotenz (§38) | Schluessel aus dem Inhalt, nicht aus dem Zufall |
| `untrusted.js` | externer Text (§50) | erkennt Uebernahmeversuche, rahmt, kuerzt, senkt Glaubwuerdigkeit |
| `audit-log.js` | Auditprotokoll (§42) | schwaerzt Tokens in jeder Form, auch in fremden Fehlermeldungen |
| `capabilities.js` | Plattformfaehigkeiten (§8) | `null` = ungeprueft, wird nie zu "nein" |
| `provider.js` | vier Interfaces, Registry (§8) | Adapter ohne vollstaendige Implementierung wird abgelehnt |
| `kill-switch.js` | Abschaltung (§33) | fehlender Eintrag bedeutet AUS |
| `autonomy.js` | Stufen 0–5 (§16) | Stufe ist Ergebnis des Zustands, nicht Eintrag |
| `signals.js` | Signal Layer (§4, §3) | kein Signal ohne Herkunft, kein Zahlensignal ohne Zahl |
| `trend-score.js` | VU Trend Score (§5) | keine Zahl unter der Mindestabdeckung |
| `opportunity.js` | Opportunity Score (§6) | keine Gelegenheit ohne Trend **oder** VU-Signal |
| `strategy.js` | Content Strategy (§7, §22) | Exploration wird VOR der Auswahl entschieden |
| `content.js` | 9-stufige Pipeline (§10, §39) | eine spaetere Stufe darf keine neue Zahl einfuehren |
| `fact-check.js` | Finanzsicherheit (§27, §28) | jede konkrete Aussage braucht einen aktuellen Beleg |
| `brand.js` | Brand Brain, Atlas (§11, §12) | nicht eingeloeste Hook ist blockierend |
| `visual.js` | Bildstrategie, Video (§13, §14) | kein Chart ohne Datenreihe, kein eingebrannter Text |
| `memory.js` | Content Memory (§18) | nie behandelt = `null`, nicht "vor 0 Tagen" |
| `fatigue.js` | Wiederholungsschutz (§29) | Hook-Aehnlichkeit, Themen- und Entitaetsfrequenz |
| `publishing.js` | Orchestrator (§15) | drei unabhaengige Doppel-Post-Sperren |
| `analytics.js` | Normalisierung (§17) | nicht gemeldet = `null`; unbekanntes Feld = Befund |
| `performance.js` | Performance Score (§26) | Deckel bei negativem Sentiment und Markenbruch |
| `learning.js` | Learning Engine (§19, §21, §51) | Intervall mit Null = kein Ergebnis; invariante Sperrliste |
| `experiments.js` | Experimente (§20) | genau eine Variable; keine Auswertung vor der Stichprobe |
| `explain.js` | Erklaerbarkeit (§32) | "Was dagegen spricht" ist ein Pflichtabschnitt |
| `health.js` | Health Matrix (§41) | "nie gelaufen" ist UNAVAILABLE, nicht FAIL |

## Drei Sperren gegen den doppelten Beitrag

Der teuerste Fehler dieses Systems ist ein zweimal veroeffentlichter Beitrag. Er
entsteht nicht durch Nachlaessigkeit, sondern durch normale Betriebsvorgaenge:
ein Lauf bricht nach dem erfolgreichen API-Aufruf ab, bevor er den Zustand
schreiben konnte.

1. **Idempotency-Ledger** — der Schluessel wird aus Provider, Konto, Paket und
   geplantem Zeitpunkt abgeleitet. Zweimal derselbe Schluessel = einmal
   veroeffentlichen. Ein Retry aendert ihn nicht.
2. **Zustandsautomat** — nur die Uebergaenge aus `Schema.PUBLICATION_TRANSITIONS`.
   Aus `PUBLISHED` fuehrt kein Weg zurueck in die Veroeffentlichung.
3. **In-Flight-Marke** — der Zustand wird **vor** dem API-Aufruf auf `PUBLISHING`
   gesetzt. Ein Lauf, der eine fremde Marke findet, fasst sie nicht an; nach
   15 Minuten gilt sie als verwaist.

Die Graph API kennt keinen Idempotenz-Header — der Meta-Adapter deklariert das
ausdruecklich als `idempotencyToken: UNAVAILABLE`. Der Schutz liegt deshalb
vollstaendig bei uns.

Geprueft in `social/tests/publishing.test.mjs`, PB4–PB8.

## Anti-Virality

Ein System, das Engagement maximiert, findet Empoerung. Der Mechanismus ist nicht
boshaft, sondern arithmetisch: Empoerung erzeugt Kommentare, Kommentare erzeugen
Reichweite, Reichweite sieht nach Erfolg aus.

`performance.js` begegnet dem auf drei Wegen:

- **Neun Dimensionen**, Engagement ist nur eine davon
- **Saves und Shares wiegen mehr als Likes** — ein Like kostet nichts, ein Save
  ist die Aussage "das will ich wiederfinden"
- **Deckel statt Abzug**: bei negativem Sentiment (< 0.3) oder Markenbruch
  (< 0.4) wird der Score auf 30 bzw. 35 **gesetzt**. Ein markenschaedlicher
  Beitrag mit grosser Reichweite ist nicht "gut mit Abzug", er ist kein Erfolg.

Geprueft in `social/tests/learning.test.mjs`, L8/L9: derselbe Beitrag ergibt 86
bei positiver und 30 bei negativer Reaktion.

## Die invariante Sicherheitsgrenze (§51)

`learning.js` fuehrt eine **Erlaubnisliste** veraenderbarer Parameter und eine
ausdrueckliche Sperrliste. Was nicht auf der Erlaubnisliste steht, ist gesperrt —
eine Verbotsliste waere unvollstaendig, sobald jemand einen Parameter hinzufuegt.

Gesperrt: Kill Switch, Autopublish, Autonomiestufe, Faktenpruefung,
Provenance-Anforderungen, Brand-Sperrbegriffe, Secret Handling, Rechte, Tests,
Compliance.

Geprueft in `social/tests/learning.test.mjs`, L14 — inklusive des Wegs ueber eine
gefaelschte, statistisch "belastbare" Beobachtung.

## Sicherheit

| Gegenstand | Umsetzung | Test |
|---|---|---|
| OAuth `state` | zufaellig, `timingSafeEqual`, ohne `state` kein Link und kein Tausch | M1, M4, M5, M6 |
| Token-Speicherung | der Adapter speichert kein Token; er bekommt es je Aufruf ueber `tokenProvider()` | M7, SS8 |
| Token-Rueckgabe | `exchangeCode()` gibt Ablauf und Fingerabdruck zurueck, nie das Token | M7 |
| Gespiegelte Tokens | `scrub()` entfernt Token-Formen aus jeder Anbieterantwort | M9, SS8 |
| `appsecret_proof` | HMAC-SHA256 bei jedem Graph-Aufruf | M18 |
| Webhook-Signatur | `X-Hub-Signature-256`, konstante Zeit | M17 |
| Prompt Injection | `untrusted.js`: Erkennung, Rahmung, Laengenbegrenzung, unsichtbare Zeichen | V19–V22 |
| Protokolle | `audit-log.js` schwaerzt auch `code` und `state` | SS7 |
| Repository | `assert-no-secrets.mjs` in der CI | SS1–SS4 |
| Worker: `state` ohne Speicher | HMAC aus `META_APP_SECRET` + `__Host-`-Cookie (Double Submit) | W5–W15 |
| Worker: CSRF | Bei Verdacht geht **kein** Graph-Aufruf hinaus | W11, W12 |
| Worker: Admin-Endpunkte | Schluessel ≥ 32 Zeichen, konstante Zeit, keine Auskunft im Fehlerfall | W2–W4 |
| Worker: Token-Dichtheit | Kein Endpunkt gibt es heraus; Fingerabdruck statt Wert | W17, W18, S4 |
| Worker: XSS | Kontonamen werden escaped, CSP `default-src 'none'` | S10, S11 |
| Worker: `disconnect` | Nur POST — ein GET waere ueber einen Link ausloesbar | W28 |

**Vor Freischaltung von Autopublish ist ein Security Review Pflicht.** Er muss
zusaetzlich pruefen: den tatsaechlichen Rechteumfang des Tokens, das Verhalten bei
Token-Rotation, die Webhook-Einrichtung im App-Dashboard und die Frage, wer im
GitHub-Repository Secrets lesen kann.

## Kosten (§34)

Der Betrieb kostet heute **nichts ausser GitHub-Actions-Minuten**:

- kein dauerhaft laufender Server
- kein LLM-Aufruf (die Content-Stufen sind deterministisch)
- keine Bildgenerierung
- Provider-Aufrufe nur im Zyklus, mit Ratenbegrenzung im Adapter
- Artefakte sind kleine JSON-Dateien im Repository

Der Zyklus laeuft als geplanter Workflow, nicht als Dauerprozess — dieselbe
Haltung wie `zero-cost-guard.js`: **gerechnet wird vorher**.

## Was ausdruecklich NICHT gebaut ist

§45 verlangt, dass das System sagt, was es nicht kann. Vollstaendig:

| Gegenstand | Zustand | Grund |
|---|---|---|
| Externe Trendquellen | `UNAVAILABLE` | keine API angebunden; Lizenz- und Kostenfrage (Owner-Entscheidung 3) |
| News-Signale | `UNAVAILABLE` | `NewsDataProvider` definiert, kein Provider angebunden |
| Publikumssignale | `UNAVAILABLE` | setzt veroeffentlichte Beitraege voraus |
| Video-Generierung | `NOT_IMPLEMENTED` | Ablauf definiert, Pipeline nicht gebaut |
| Bildgenerierung | nicht gebaut | Visual Brief ja, Rendering nein (Owner-Entscheidung 4) |
| Carousel bei Meta | `notImplemented` | braucht je Element einen eigenen Container |
| Facebook, LinkedIn, TikTok, X, YouTube | kein Adapter | Architektur traegt sie, Implementierung steht aus |
| LLM in der Content-Pipeline | Interface vorhanden | bewusste spaetere Entscheidung |
| Publishing ueber den Worker | kein Endpunkt | Das Token liegt dort; wenn Autopublish freigegeben wird, kommt der Egress dorthin — als eigener, getesteter Schritt |
| Webhook-Empfang | Signaturpruefung gebaut und getestet | Abonnement wird im App-Dashboard eingerichtet und ist nicht erfolgt |
| Kommentar-Antworten | `ACTION_COMMENT: false` | automatische Antwort auf UNTRUSTED INPUT ist nicht freigegeben |

## Verzeichnisse

```
social/
  engines/        24 Engines, Browser + Node, ohne DOM
  providers/      mock/ (CI) und meta/ (erster produktiver Provider), Node-only
  config/         kill-switch.json, autonomy.json, brand-brain.json
  methodology/    versionierte Gewichte
  data/           Artefakte (von Laeufen erzeugt)
  tests/          node:test — 163 Tests ueber 8 Dateien
  ui/             social.css
  index.html      Command Center
  app.js
scripts/social/   Sammlung, Zyklus, Verifikation, Preflight, CI-Waechter
workers/
  vision-universe-social/
    src/          6 Module, nur Web-Standards (fetch, crypto.subtle, URL)
    tests/        node:test — 44 Tests, ohne Cloudflare und ohne Meta
    wrangler.toml Konfiguration ohne einen einzigen Secret-Wert
docs/             diese Dokumentation
```
