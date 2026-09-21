# VU SOCIAL INTELLIGENCE OS — HANDOFF

Stand: 2026-09-15 · Zweig `claude/vision-universe-social-os-eudjmx`
Pflichtdokument nach §56.

> **AKTUALISIERT nach Owner-Information zum Cloudflare Worker.**
> Der OAuth-Flow laeuft jetzt produktionsreif im Worker `vision-universe-social`.
> Die Anleitung zum Verbinden: **`docs/VU_SOCIAL_META_CONNECT.md`**.

---

## 1. Architektur

Ein Social Intelligence OS als **neue Faehigkeit innerhalb** der bestehenden
Vision-Universe-Architektur — nicht als zweites System (§0, §48).

- Statische Auslieferung ueber GitHub Pages, keine neue Laufzeit.
- 24 Engines im UMD-Muster von `quant/engines/`, lauffaehig in Browser und Node.
- Vier Provider-Interfaces mit Registry, Capability-Matrix und Vendor-Leakage-Guard.
- Orchestrierung ueber Node-Skripte in GitHub Actions; Zustand in JSON-Artefakten.
- Vollstaendige Beschreibung: `docs/VU_SOCIAL_ARCHITECTURE.md`.
- Audit des Bestands, auf dem gebaut wurde: `docs/VU_SOCIAL_PHASE_A_AUDIT.md`.

**Drei Annahmen des Auftrags trafen im Repository nicht zu** und wurden korrigiert
statt uebernommen (Details im Audit, Abschnitt 2):

1. Im **Repository** gibt es keine Cloudflare-Anwendungsinfrastruktur — nur R2 als
   S3-kompatible Ablage hinter einem eigenen Treiber.
   **Korrektur nach Owner-Information:** Ausserhalb des Repositories existiert der
   Worker `vision-universe-social` mit hinterlegten Secrets. Ein Repository-Audit
   kann externe Infrastruktur nicht sehen; die Lehre daraus steht im Audit,
   Abschnitt 5.
2. Ein OAuth-Callback braucht eine Server-Laufzeit → **entschieden**: der Worker.
   Umgesetzt in `workers/vision-universe-social/`.
3. Im Repository existierte keine Meta-Konfiguration — und soll es nicht. Die
   Werte liegen in der Cloudflare-Secret-Verwaltung.

## 2. Implementierte Komponenten

| Bereich | Dateien | Zustand |
|---|---|---|
| Kanonische Contracts | `schema.js`, `events.js`, `untrusted.js`, `audit-log.js` | IMPLEMENTED |
| Provider-Layer | `provider.js`, `capabilities.js`, `kill-switch.js`, `autonomy.js` | IMPLEMENTED |
| Adapter | `providers/mock/`, `providers/meta/` | mock IMPLEMENTED · meta IMPLEMENTED, unverifiziert |
| Signal Layer | `signals.js` | IMPLEMENTED (intern) · externe Quellen UNAVAILABLE |
| Intelligence | `trend-score.js`, `opportunity.js`, `strategy.js` | IMPLEMENTED |
| Content | `content.js`, `fact-check.js`, `brand.js`, `visual.js`, `fatigue.js`, `memory.js` | IMPLEMENTED · Video NOT_IMPLEMENTED |
| Publishing | `publishing.js` | IMPLEMENTED |
| Analytics & Lernen | `analytics.js`, `performance.js`, `learning.js`, `experiments.js` | IMPLEMENTED, ohne Produktionsdaten |
| Erklaerung & Zustand | `explain.js`, `health.js` | IMPLEMENTED |
| Command Center | `social/index.html`, `social/app.js`, `social/ui/social.css` | IMPLEMENTED — BETA (mobile-first) |
| Pipelines | `scripts/social/*.mjs` (6 Skripte) | IMPLEMENTED |
| **Cloudflare Worker** | `workers/vision-universe-social/` | **IMPLEMENTED**, nicht deployt |
| CI | `.github/workflows/social-ci.yml` | IMPLEMENTED |

## 3. Provider

| Provider | Interfaces | Zustand | Bemerkung |
|---|---|---|---|
| `mock` | alle vier | `ok` | Nur CI und Entwicklung. Kann jede Fehlerlage aus §44 ausloesen |
| `meta` (Instagram) | alle vier | `not_configured` | Implementiert und getestet; nie gegen die echte Graph API gelaufen |
| Facebook, LinkedIn, TikTok, X, YouTube | — | kein Adapter | Architektur traegt sie; Kill-Switch-Eintraege vorhanden und auf `false` |

## 4. Meta-Authentifizierungsstatus

**Der vollstaendige OAuth-Flow ist implementiert und getestet — im Worker
`vision-universe-social`.**

| Schritt | Zustand |
|---|---|
| Autorisierungslink mit `state` und Rechteumfang | `SUPPORTED`, getestet (W5) |
| CSRF: HMAC-signierter `state` + `__Host-`-Cookie | `SUPPORTED`, getestet (W6, W11–W15) |
| Bei CSRF-Verdacht geht **kein** Graph-Aufruf hinaus | getestet (W11, W12) |
| Code → kurzlebiges → langlebiges Token, serverseitig | `SUPPORTED`, getestet (W16) |
| Ableitung und Speicherung des **Page**-Tokens | `SUPPORTED`, getestet (W16) |
| Instagram-Professional-Kontoaufloesung ueber die Seite | `SUPPORTED`, getestet (W16, W19) |
| Tatsaechlich erteilte Rechte lesen | `SUPPORTED`, getestet (W21–W23) |
| Capabilities aus erteilten Rechten ableiten | `SUPPORTED`, getestet (W21–W25) |
| Lebendtest vor dem Speichern | `SUPPORTED`, getestet (W20) |
| Connection Health speichern | `SUPPORTED`, getestet (W26) |
| Widerruf und Trennen | `SUPPORTED`, getestet (W28) |
| Webhook-Signaturpruefung | `SUPPORTED`, getestet (Adapter M17) |
| Webhook-Abonnement | `MANUAL_REQUIRED` (App-Dashboard) |

**Nicht erfolgt:** Deployment und die persoenliche Meta-Autorisierung. Beides sind
Owner-Handlungen; die Anleitung steht in `docs/VU_SOCIAL_META_CONNECT.md`.

**`verifiedAt: null`** — die Capability-Deklaration im Repository stammt weiterhin
aus der Dokumentation der Graph API. Der Worker leitet daneben die Faehigkeiten
aus den **tatsaechlich erteilten Rechten** ab; das ist der Nachweis, der zaehlt.

## 5. Secrets Contract — NUR NAMEN

**In diesem Repository existiert kein einziger Secret-Wert. Diese Namen sind als
GitHub-Actions-Secrets zu hinterlegen.**

**Im Cloudflare Worker** (`wrangler secret put`):

```
META_APP_ID            bereits gesetzt (Owner)
META_APP_SECRET        bereits gesetzt (Owner)
VU_SOCIAL_ADMIN_KEY    NOCH ZU SETZEN, mindestens 32 Zeichen
META_WEBHOOK_SECRET    erst fuer Webhooks noetig
```

**Als GitHub-Actions-Secrets** (damit das Command Center den Zustand zeigt):

```
VU_SOCIAL_WORKER_URL   die oeffentliche Worker-URL
VU_SOCIAL_ADMIN_KEY    derselbe Wert wie im Worker
```

**`META_LONG_LIVED_TOKEN` wird NICHT mehr gebraucht.** Das Token liegt im Worker
und verlaesst ihn nie — es gehoert nicht in GitHub-Secrets. Der Name bleibt im
Adapter als Vertrag fuer den direkten Pfad bestehen, wird im Betrieb aber nicht
gesetzt.

Bestehende, unveraendert weiterverwendete Namen:

```
TWELVE_DATA_API_KEY   TIINGO_API_KEY   FMP_API_KEY   FINNHUB_API_KEY
SEC_USER_AGENT
VU_HISTORY_S3_ACCESS_KEY_ID   VU_HISTORY_S3_SECRET_ACCESS_KEY
VU_HISTORY_S3_BUCKET   VU_HISTORY_S3_ENDPOINT   VU_HISTORY_S3_REGION
```

Kein bestehender Name wurde geaendert (§36).

## 6. Publishing Capabilities

| Faehigkeit | mock | meta |
|---|---|---|
| Bild | `SUPPORTED` | `SUPPORTED` |
| Carousel | `PARTIALLY_SUPPORTED` | `SUPPORTED` (Adapter: `notImplemented` — braucht Container je Element) |
| Video / Reel | `SUPPORTED` | `SUPPORTED` |
| Story | `UNAVAILABLE` | `null` (ungeprueft) |
| Reiner Text | `UNAVAILABLE` | `UNAVAILABLE` |
| Plattformseitige Terminierung | `UNAVAILABLE` | `UNAVAILABLE` |
| **Idempotenz-Token** | `UNAVAILABLE` | `UNAVAILABLE` |
| Alt-Text | `SUPPORTED` | `SUPPORTED` |
| Loeschen | `SUPPORTED` | `PARTIALLY_SUPPORTED` |

Weil **keine** Plattform einen Idempotenz-Token bietet, liegt der Schutz gegen
Doppel-Posts vollstaendig bei uns — drei unabhaengige Sperren, siehe Architektur.

## 7. Analytics

Kanonisches Modell mit 13 Kennzahlen. Nicht gemeldete Kennzahlen bleiben `null`;
Original-Provider-Werte bleiben vollstaendig erhalten. Ein unbekanntes
Provider-Feld ist ein **Befund** (`schemaChangeSuspected`) und kein stiller
Verlust — das faengt einen Schema-Wechsel der Plattform (§44).

`engagementRate` wird selbst gerechnet und nennt ihren Nenner; eine uebernommene
Rate waere zwischen Plattformen nicht vergleichbar.

**Ohne Produktionsdaten.** Bislang wurde keine einzige echte Kennzahl eingelesen.

## 8. Trend Intelligence

Zwoelf erklaerbare Dimensionen (Velocity, Acceleration, Engagement, Freshness,
Cross-Platform, Market Relevance, VU Relevance, Audience Fit, Novelty, Saturation,
Credibility, Risk), Score 0–100, jede Dimension mit eigener Begruendung.

**Zustand: `UNAVAILABLE`.** Keine externe Trendquelle ist angebunden. Die Engine
gibt deshalb **keine Zahl** aus — sie nennt die fehlenden Pflichtdimensionen. Das
ist §45 in Funktion und kein Defekt.

## 9. Learning Engine

- Beobachtungen mit Stichprobengroesse und 95-%-Konfidenzintervall (Welch).
- Ein Intervall, das die Null enthaelt, ist **kein Ergebnis**.
- Effekte unterhalb der Relevanzschwelle aendern nichts.
- Aenderungen sind begrenzt (max. 25 % relativ), versioniert, erklaert, reversibel.
- Die invariante Sperrliste (§51) ist Code, nicht Vorsatz — getestet, inklusive
  des Wegs ueber eine gefaelschte "belastbare" Beobachtung.
- Experimente: genau eine Variable, Stichprobe vorher festgelegt, keine
  Auswertung vor Erreichen.

**Ohne Produktionsdaten.** Es existiert keine einzige belastbare Beobachtung.

## 10. Tests

| Datei | Tests | Deckt ab |
|---|---|---|
| `contracts.test.mjs` | 10 | Entitaeten, Lebenszyklus, Ereignisse, Idempotenzschluessel |
| `provider.test.mjs` | 16 | Registry, Capabilities, Vendor-Leakage, Ausfall, Ratenbegrenzung |
| `meta-auth.test.mjs` | 20 | OAuth, CSRF, Token-Lebenszyklus, Fehlerabbildung, Webhooks |
| `publishing.test.mjs` | 15 | Lebenszyklus, drei Doppel-Post-Sperren, Retry, Kill Switch, Audit |
| `intelligence.test.mjs` | 27 | Signale, Trend, Opportunity, Gedaechtnis, Fatigue, Strategie |
| `validation.test.mjs` | 22 | Fakten, Provenance, Marke, Atlas, Pipeline, Visual, Untrusted |
| `learning.test.mjs` | 24 | Analytics, Performance, Anti-Virality, Lernen, Sicherheitsgrenze, Experimente |
| `health-autonomy.test.mjs` | 16 | Health Matrix, Autonomiestufen, echte Konfiguration, Erklaerbarkeit |
| `secrets.test.mjs` | 10 | Schluesselhygiene, Adapter-Isolation, Protokollschwaerzung |
| `loop.test.mjs` | 3 | der geschlossene Kreislauf, Gegenprobe Kill Switch |
| **Social gesamt** | **163** | alle Pflichtthemen aus §43 |
| `workers/…/oauth.test.mjs` | 31 | OAuth, CSRF, Token-Speicherung, Capabilities, Disconnect |
| `workers/…/security.test.mjs` | 13 | Schwaerzung, Fehlerabbildung, XSS, Kopfzeilen, Dichtheit |
| **Worker gesamt** | **44** | ohne Cloudflare, ohne Meta |
| **Zusammen** | **207** | |

```
node --test "social/tests/*.test.mjs"                     163/163 gruen
node --test "workers/vision-universe-social/tests/*.test.mjs"  44/44 gruen
node --test "quant/tests/*.test.mjs"                      898/898 unveraendert (§48)
```

Die CI braucht **keine produktiven Zugangsdaten** (§43). Ein Lauf gegen Meta ist
ausdruecklich nicht Teil der CI.

## 11. Security

Umgesetzt und getestet: `state`/CSRF, Token-Isolation (der Adapter speichert und
gibt keine Tokens zurueck), Schwaerzung gespiegelter Tokens aus Anbieterantworten,
`appsecret_proof`, Webhook-Signaturpruefung, Prompt-Injection-Erkennung und
-Rahmung, Audit-Schwaerzung (inkl. `code` und `state`), Repository-Waechter in der CI.

**Ein Security Review vor Freischaltung von Autopublish steht aus** (§50). Er muss
zusaetzlich pruefen: tatsaechlicher Rechteumfang des Tokens, Verhalten bei
Token-Rotation, Webhook-Einrichtung, Zugriff auf GitHub-Secrets.

## 12. Cloudflare Deployment

**Ein Worker, minimal abgegrenzt — und noch nicht deployt.**

`workers/vision-universe-social/` ist reproduzierbar deploybar: `wrangler.toml`
ohne einen einzigen Secret-Wert, sechs Quelldateien, 44 Tests.

**Vor dem ersten Deployment ist `node scripts/social/preflight-worker.mjs`
Pflicht.** Der Worker existiert ausserhalb des Repositories; `wrangler deploy`
ersetzt den dort liegenden Code vollstaendig und ohne Rueckfrage. Das Skript liest
Groesse, Fingerabdruck, Bindungen und Secret-Namen und meldet ausdruecklich, wenn
dort fremde Logik liegt — samt Sicherungsbefehl.

In dieser Session war das nicht pruefbar: es gibt keine Cloudflare-Zugangsdaten,
und die Cloudflare-API ist aus der Sandbox nicht erreichbar. **Der Preflight muss
deshalb einmal mit Zugang gelaufen sein, bevor deployt wird.**

Alles Uebrige bleibt, wo es war: GitHub Actions als Scheduler und Compute, GitHub
Pages als Auslieferung, R2 als S3-kompatible Ablage. Es wurde nichts migriert.

## 13. Offene externe Voraussetzungen

1. **Worker deployen und autorisieren** — blockiert den gesamten produktiven Pfad.
   Anleitung: `docs/VU_SOCIAL_META_CONNECT.md`. Offen sind: KV-Namespace,
   `VU_SOCIAL_ADMIN_KEY`, `PUBLIC_BASE_URL`, Redirect-URI in der Meta-App,
   Preflight mit Zugang, Deployment, persoenliche Autorisierung.
2. **Externe Trendquelle** (Owner-Entscheidung 3) — blockiert §5 in voller Tiefe.
   Das System funktioniert ohne sie, mit ausdruecklich benannter Luecke.
3. **News-Provider** — Lizenzfrage; `NewsDataProvider` ist definiert.
4. **Bildvorlagen und Renderer** (Owner-Entscheidung 4) — blockiert Visuals.
5. **Security Review** — blockiert Autonomiestufe 4.

## 14. Autonomy Level

| | Wert |
|---|---|
| Gewuenscht (`social/config/autonomy.json`) | **0 — Nur Beobachtung** |
| Wirksam (gemessen) | **0** |
| `GLOBAL_AUTOPUBLISH` | **false** |
| Alle Provider-Schalter | **false** (ausser `mock`) |
| `ACTION_COMMENT`, `ACTION_DELETE` | **false** |

Stufe 0 ist eingetragen, weil kein Provider konfiguriert ist und kein Lauf je
Produktionsdaten gesehen hat. Eine hoehere Eintragung waere folgenlos — die
wirksame Stufe ergibt sich aus dem gemessenen Zustand — aber irrefuehrend, und §45
verbietet das.

**In diesem Build wurde nichts veroeffentlicht.** Der Zyklus laeuft vollstaendig
durch und haelt jedes Paket in `READY`, mit Begruendung.

## 15. Naechste dependency-correcte Schritte

1. **`docs/VU_SOCIAL_META_CONNECT.md` abarbeiten** (Schritte 1–9).
   → alles Weitere haengt daran. Endet bei META_CONNECTED.
2. Bei `verdict: VERIFIED` das Datum in `metaCapabilities({ verifiedAt: ... })`
   eintragen — von Hand, in einem eigenen Commit. Eine Verifikation, die sich
   selbst bestaetigt, ist keine.
3. **`PROVIDER_META` einschalten**, `GLOBAL_AUTOPUBLISH` zunaechst **aus lassen**.
   Der Zyklus plant dann echte Beitraege in `READY`, ohne zu senden.
4. **Ersten Beitrag von Hand freigeben** und veroeffentlichen. Analytics-Ingestion
   gegen echte Daten pruefen — besonders auf unbekannte Felder.
5. **Bildweg schliessen**: Chart-Rendering im Social-Format aus `quant/ui/charts.js`
   ableiten. Ohne Bild ist ein Instagram-Beitrag unvollstaendig.
6. **Publikumssignale anbinden** (`getComments`) — die naechstliegende
   Datenquelle, ohne Zusatzkosten und ohne Lizenzfrage.
7. Nach ~20 freigegebenen Beitraegen: Vergleichsbasis pruefen, erste
   Lernbeobachtungen bewerten, Mindestabdeckung der Opportunity Engine anheben.
8. **Security Review**, dann Autonomiestufe 3.
9. Erst danach Stufe 4 und weitere Plattform-Adapter.

---

## SOCIAL SYSTEM HEALTH MATRIX

Erzeugt am 2026-09-15 aus `social/data/health.json`
(Lauf: `node scripts/social/run-social-cycle.mjs --provider mock`).

**Gesamtzustand: WARNING** — 11 PASS, 0 WARNING, 0 FAIL, 6 UNAVAILABLE.

> Das `PASS` bei den Providern gilt fuer den **Mock**. Mit `--provider meta`
> stuende dort `UNAVAILABLE` mit den fehlenden Secret-Namen.

| COMPONENT | STATUS | DATA SOURCE | LAST SUCCESS | FAILURE MODE | NEXT ACTION |
|---|---|---|---|---|---|
| Provider-Authentifizierung | PASS (mock) | `providers/mock` | 2026-09-15 | Token abgelaufen / Recht entzogen | Meta-Secrets hinterlegen |
| Veroeffentlichung | PASS (mock) | `providers/mock` | 2026-09-15 | Ratenbegrenzung, ungueltiges Medium, Plattformausfall | `PROVIDER_META` nach Verifikation einschalten |
| Kennzahlenabruf | PASS (mock) | `providers/mock` | 2026-09-15 | Insights nicht abrufbar, Schemawechsel | Gegen echte Meta-Insights pruefen |
| Publikumssignale | PASS (mock) | `providers/mock` | 2026-09-15 | Kommentare nicht lesbar | Nach erster Veroeffentlichung anbinden |
| Interne VU-Signale | PASS | `quant/data/technical/index.json` | 2026-09-15 | Index fehlt oder veraltet | Sammlung taeglich einplanen |
| Marktsignale | UNAVAILABLE | — | nie | Kein eigener Zustandsbericht | Aus `quant/data/market/health` speisen |
| Nachrichtensignale | UNAVAILABLE | — | nie | Kein lizenzierter News-Provider | Lizenzfrage klaeren (`NewsDataProvider` definiert) |
| Externe Social-Signale | UNAVAILABLE | — | nie | Keine Plattform-API mit Trenddaten | Owner-Entscheidung 3 |
| Trend Intelligence | UNAVAILABLE | — | nie | Keine externe Quelle → Engine enthaelt sich | Trendquelle anbinden |
| Opportunity Engine | PASS | `social/data/cycle-report.json` | 2026-09-15 | Keine Signale → keine Gelegenheiten | — |
| Content-Pipeline | PASS | `social/data/cycle-report.json` | 2026-09-15 | Stufe scheitert (Recherche, Fakten, Marke) | — |
| Fakten- und Markenpruefung | PASS | `social/data/cycle-report.json` | 2026-09-15 | Unbelegte Aussage, nicht eingeloeste Hook | — |
| Terminierung | PASS | `social/data/publications.json` | 2026-09-15 | Nichts zu terminieren | — |
| Warteschlange | PASS | `social/data/publications.json` | 2026-09-15 | Verwaiste In-Flight-Marke | — |
| Learning Engine | UNAVAILABLE | — | nie | Keine Beitraege mit Ergebnis | Nach ersten Veroeffentlichungen |
| Experimente | UNAVAILABLE | — | nie | Kein Experiment erklaert | Nach Stufe 3 |
| Kill Switch | PASS | `social/config/kill-switch.json` | 2026-09-15 | — | Bleibt aus, bis der Owner ihn setzt |

---

## Nachweis zu §53

> Der Build ist erfolgreich, wenn eine belastbare Architektur existiert, die den
> vollstaendigen Loop tragen kann — und der erste reale Provider ihn tatsaechlich
> durchlaufen kann.

`social/tests/loop.test.mjs` E2 fuehrt aus: Signal → Gelegenheit → Strategie →
Content → Validierung → Veroeffentlichung → Messung → Bewertung → Gedaechtnis →
Lernen. Und prueft anschliessend, dass die **Rueckkopplung sich schliesst**: nach
der Messung des ersten Beitrags lehnt die Wiederholungssperre denselben Beitrag
ab, und die Gelegenheit wird schlechter bewertet.

E3 prueft die Betriebsrealitaet: drei aufeinanderfolgende Laeufe erzeugen **einen**
Beitrag.

E1 ist die Gegenprobe: mit der **ausgelieferten** Konfiguration darf kein Provider
veroeffentlichen.

Der Zyklus laeuft ausserdem gegen echte Vision-Universe-Daten:

```
$ node scripts/social/collect-vu-signals.mjs --out social/data
  Ereignisse: 4 (davon veroeffentlichungsfaehig: 4)
  Uebersprungen: 511 synthetische Titel — ein Beitrag darueber waere eine
                 erfundene Marktaussage

$ node scripts/social/run-social-cycle.mjs --provider mock
  4 Signale, 4 Gelegenheiten, 4 Pakete, 0 veroeffentlicht
  Systemzustand WARNING, Autonomie 0
```

Null veroeffentlicht ist hier das **richtige** Ergebnis: der Kill Switch ist aus,
und das Skript prueft ihn selbst.

---

## Befund am Rande (nicht vom Social-Build verursacht)

Beim Abschlusslauf ist ein bestehender Fehler im Quant-Bereich aufgefallen. Er
gehoert nicht zu diesem Build und wurde deshalb nicht behoben — aber er
verschwiegen zu lassen waere falsch.

**`node --test "quant/tests/*.test.mjs"` veraendert zwei committete
Produktionsartefakte:**

```
quant/data/universe/cik-resolution.json
quant/data/universe/issuer-manifest.json
```

Geaendert wird nur das Feld `generatedAt` — aber es wird geaendert, bei jedem Lauf,
reproduzierbar.

Das widerspricht **MASTER §31.10**:

> *Tests duerfen Produktionsdaten nicht veraendern. Verifikationslaeufe laufen auf
> Kopien, nie auf committeten Produktionsdateien (Lehre aus `technical_scenarios.json`).*

**Warum das mehr ist als Kosmetik:** Genau dieses Muster hat im
Technical-Intelligence-Bereich schon einmal zu einem realen Fehler gefuehrt, und
§31.10 ist die Konsequenz daraus. Solange es besteht, kann niemand einem
`git status` nach einem Testlauf ansehen, ob eine Aenderung beabsichtigt war.

**Umgang im Social-Build:** `social-ci.yml` fuehrt die Quant-Tests aus (§48) und
meldet den Befund anschliessend als Warnung, ohne den Lauf rot zu machen — die
Ursache liegt im Quant-Bereich und gehoert dort behoben. Die Aenderung wird
verworfen, damit sie nicht versehentlich in einen Social-Commit geraet.

**Empfohlene Behebung (Quant-Bereich, eigener Commit):** Den betreffenden
Verifikationslauf auf ein temporaeres Verzeichnis richten — dasselbe Muster, das
`scripts/dashboard/verify_adjustment_gate.py` bereits verwendet.

---

## Nachtrag 2026-09-15 — Worker-Integration, Stand META_CONNECTED

### Was seit dem ersten Handoff dazugekommen ist

| Gegenstand | Zustand |
|---|---|
| Cloudflare Worker mit vollstaendigem OAuth-Flow | implementiert, 44 Tests gruen |
| Token-Speicherung in KV, Token verlaesst den Worker nie | implementiert, getestet |
| Capabilities aus **tatsaechlich erteilten** Rechten | implementiert, getestet |
| Preflight gegen Ueberschreiben des vorhandenen Workers | implementiert |
| Verbindungszustand als Repository-Artefakt | implementiert |
| Command Center zeigt die Meta-Verbindung | implementiert |
| Owner-Anleitung | `docs/VU_SOCIAL_META_CONNECT.md` |
| **Deployment** | **offen — Owner** |
| **Persoenliche Meta-Autorisierung** | **offen — Owner Gate** |

### Der Zielzustand META_CONNECTED

| Kriterium | Stand |
|---|---|
| OAuth produktiv funktionsfaehig | Code fertig und getestet · **nicht deployt** |
| Instagram-Konto verbunden | offen — Owner Gate |
| Token sicher gespeichert | Mechanismus fertig (KV, kein Ausgabe-Endpunkt) |
| Instagram Account automatisch aufgeloest | implementiert, getestet (W16, W19) |
| Reale Permissions verifiziert | `/verify` fertig · braucht eine Verbindung |
| Insights lesbar | `/verify` fertig · braucht eine Verbindung |
| Publishing Capability nachgewiesen | ueber das erteilte Recht, nicht ueber einen Testbeitrag |
| **Kein echter Post veroeffentlicht** | **erfuellt** — es gibt keinen Publishing-Endpunkt |
| Tests gruen | 207 (163 Social + 44 Worker), Quant unveraendert 898 |
| Keine Secrets offengelegt | erfuellt — `assert-no-secrets.mjs` und `preflight-worker.mjs` |
| Bestehende VU-Systeme unveraendert | erfuellt |

**META_CONNECTED ist damit nicht erreicht, sondern erreichbar.** Was fehlt, ist
ausschliesslich das, was nur der Owner tun kann.

### Warum diese Session nicht weiter gekommen ist

Nicht aus Vorsicht, sondern aus Mangel an Zugang:

- **Keine Cloudflare-Zugangsdaten.** Kein Deployment, kein Preflight gegen den
  echten Worker, kein Blick darauf, was dort liegt.
- **Die Cloudflare-API ist aus dieser Umgebung nicht erreichbar** (der Proxy
  beantwortet sie nicht).
- **Die Meta-Autorisierung ist persoenlich.** Sie verlangt eine Anmeldung im
  Browser des Owners und eine Zustimmung im Meta-Dialog. Das ist das Owner Gate
  aus §6 der Auftragsergaenzung.

Alles, was ohne diese drei Dinge machbar war, ist gebaut, getestet und
dokumentiert.

### Der Befund am Rande gilt unveraendert

Die Mutation der beiden `quant/data/universe`-Artefakte durch den Quant-Testlauf
wurde **nicht** in diesem Commit repariert — sie gehoert in einen eigenen
Quant-Fix. Generierte Aenderungen an diesen Dateien sind nicht committet; die
Social-CI meldet den Befund als Warnung.

---

## Nachtrag 2026-09-21 — Order D: manuelle Orchestrator-Kontrolle und adaptive Kadenz

### Der strukturelle Befund, mit dem dieser Auftrag anfing

Die Opportunity-Platte hielt **32 Themen aus fuenf Content Families** und
**22 evidenzfaehige RANKING-Gelegenheiten mit 345 Belegen**. Der echte Zyklus
baute daraus `STOCK_STORY` aus vier Quant-Signalen. Die reichste Familie hatte
noch nie einen Beitrag erzeugt.

`content-ladder.js` war gebaut und wurde von keinem Lauf aufgerufen. Beim
Anschliessen kam heraus, warum es nicht genuegte, sie nur zu rufen: eine
unausgesprochene Annahme — *ein Thema handelt von genau einem Titel* — sass an
**sechs** Stellen im Content-Pfad (Schema, Visual Intelligence, Strategie,
Audience Fit, Fact Check, Authoring). `RANKING_LIST` und die Gruppen-Hooks sind
die Antwort darauf.

### Was dazugekommen ist

| Datei | Wofuer |
|---|---|
| `social/engines/content-ladder.js` → Zyklus | Die Leiter entscheidet, woran der Lauf arbeitet (§10–§12) |
| `social/engines/no-post.js` | `NO_POST_JUSTIFIED` mit Suchnachweis (§13–§16) |
| `social/engines/run-lease.js` | Zeitplan und Owner-Knopf, eine Uhr (§27–§31) |
| `social/engines/frequency-learning.js` | Neun Lerndimensionen, die es gab und die nie jemand fuellte (§22–§25) |
| `social/engines/learning-dimensions.js` | Die Dimensionsliste an EINER Stelle |
| `social/engines/hard-invariants.js` | Fuenf Saetze, gemessen statt hingeschrieben (§45) |
| `scripts/social/check-hard-invariants.mjs` | Misst sie am echten Publish-Pfad |
| `scripts/social/verify-suites.mjs` | Suiten und Isolation, mit Stand (§46) |
| `scripts/social/order-d-done.mjs` | Die zwoelf Bedingungen (§49/§50) |
| `workers/…/src/approval.js` | `/approval/run` — „JETZT PRUEFEN" (§2–§7) |

### Der Bericht ist nicht diese Datei

Jede Zahl unten stammt aus einem Skript und wird bei jedem Lauf neu gemessen.
Was hier steht, ist der Stand vom 2026-09-21 und **kein Beleg fuer spaeter**:

```
node scripts/social/verify-suites.mjs           Suiten + Isolation, mit Commit
node scripts/social/production-readiness.mjs    die 20 benannten Zustaende
node scripts/social/check-hard-invariants.mjs   die fuenf harten Saetze
node scripts/social/order-d-done.mjs            die zwoelf Bedingungen
```

Gemessen am Stand dieses Nachtrags:

```
SOCIAL_ORCHESTRATOR_PRODUCTION_READY  true
CRITICAL_BLOCKERS                     0
  10 Reifebedingungen          ERFUELLT
  10 Autonomie-Invarianten     ERFUELLT
   3 harte Invarianten (§7)    ERFUELLT

MAX_OPEN_CREATIVE_JOBS          ist 1       soll 1
GLOBAL_AUTOPUBLISH              ist false   soll false
VU_SOCIAL_AUTOPUBLISH           ist false   soll false
OWNER_PUBLISHING_GATE           ist true    soll true
EXTERNAL_SOCIAL_SOURCES_ACTIVE  ist 0       soll 0

social: 1383/1383    worker: 327/327    Isolation: beide unveraendert
```

**Es wurde nichts veroeffentlicht.** Kein Kandidat erzwungen, keine
Work-Invocation verbraucht, keine externe Quelle aktiviert.

### Die wiederkehrende Fehlerform, jetzt benannt

Vier Waechter in diesem Auftrag hielten — aus einem Grund, der mit der Frage
nichts zu tun hatte. Alle vier sind durch eine **Gegenprobe** gefunden worden,
nicht durch Nachdenken:

1. **Das Owner-Tor.** Die Pruefung fragte, OB der Publish-Pfad ablehnt. Baut man
   die Abdruckpruefung aus, stirbt die Anfrage eine Stufe spaeter am Bild:
   `imageUnreachable`, Bericht `OK`. Gefragt wird jetzt, **womit** abgelehnt wurde.
2. **Die Jobzahl.** `Number(null) === 0` machte aus „unbekannt" „keine offenen
   Jobs" — und keine offenen Jobs heisst: bau einen neuen.
3. **Die Lease.** Ein Zeitpunkt in der Zukunft ergibt ein negatives Alter, und ein
   negatives Alter ist immer kleiner als die Ablaufzeit. *„Ein anderer Lauf
   arbeitet seit -38015280 Minuten."*
4. **Der Proxy.** `order-d-done.mjs` bekam 403 und meldete „das Owner-Tor haelt".
   Im Koerper stand *„Host not in allowlist"* — der Worker hatte die Anfrage nie
   gesehen. Eine Antwort zaehlt jetzt nur mit `cf-ray`.

Dazu zwei Zustaende, die **seit fuenf Auftraegen falsch gemeldet** waren:
`SCHEDULER_NEVER_PUBLISHES` las `decide-candidate.mjs` aus einem YAML-Kommentar,
und `SUITE_GREEN`/`TEST_PRODUCTION_ISOLATION` hingen an Fahnen, die der Aufrufer
selbst setzte.

### Wie hier gearbeitet wird

Jeder der **101 neuen Tests** ist gegengeprobt: der Fehler, den er fangen soll,
wurde wieder eingebaut, und der Test ist gefallen. Zwei Tests hielten dabei
selbst aus dem falschen Grund (AO10, OD4) — beide stehen jetzt mit dem Grund im
Kommentar. Ein Test, der auf eine **Formulierung** prueft (`"vom Worker"`) statt
auf eine **Kennung** (`cf-ray`), merkt den Ausbau des Nachweises nicht.

### Was offen bleibt

`DEPLOYT` und `BETRIEBS_SMOKE_OHNE_VEROEFFENTLICHUNG` sind aus einer Umgebung
ohne Zugang zu `social.visionuniverse.de` **UNGEPRUEFT** — und ungeprueft zaehlt
wie nicht erfuellt. Beide werden im Schritt `ORDER_D_DONE` des Workflows
`social-cloudflare` (`action: deploy` oder `verify`) gemessen, wo der Worker
erreichbar ist.
