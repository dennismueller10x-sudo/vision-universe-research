# VU SOCIAL INTELLIGENCE OS — HANDOFF

Stand: 2026-09-15 · Zweig `claude/vision-universe-social-os-eudjmx`
Pflichtdokument nach §56.

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

1. Es gibt keine Cloudflare-Anwendungsinfrastruktur — nur R2 als S3-kompatible
   Ablage hinter einem eigenen Treiber. Kein Worker, kein D1, kein KV, kein
   `wrangler.toml`.
2. Ein OAuth-Callback braucht eine Server-Laufzeit, die es nicht gibt →
   Owner-Entscheidung 1.
3. Es existierte keine vorbereitete Meta-Konfiguration und keine Meta-Secrets.

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
| Pipelines | `scripts/social/*.mjs` (4 Skripte) | IMPLEMENTED |
| CI | `.github/workflows/social-ci.yml` | IMPLEMENTED |

## 3. Provider

| Provider | Interfaces | Zustand | Bemerkung |
|---|---|---|---|
| `mock` | alle vier | `ok` | Nur CI und Entwicklung. Kann jede Fehlerlage aus §44 ausloesen |
| `meta` (Instagram) | alle vier | `not_configured` | Implementiert und getestet; nie gegen die echte Graph API gelaufen |
| Facebook, LinkedIn, TikTok, X, YouTube | — | kein Adapter | Architektur traegt sie; Kill-Switch-Eintraege vorhanden und auf `false` |

## 4. Meta-Authentifizierungsstatus

| Schritt | Zustand |
|---|---|
| Autorisierungslink mit `state` und Rechteumfang | `SUPPORTED`, getestet |
| CSRF-Pruefung (`timingSafeEqual`) | `SUPPORTED`, getestet |
| Code → Token → langlebiges Token | implementiert und getestet, **`MANUAL_REQUIRED`** mangels Server-Laufzeit |
| Token-Verlaengerung inkl. Rotationsmeldung | `SUPPORTED`, getestet |
| Widerruf | `PARTIALLY_SUPPORTED` |
| Rechte-Introspektion | `SUPPORTED`, getestet |
| Instagram-Professional-Kontoaufloesung ueber Facebook-Seite | `SUPPORTED`, getestet |
| Webhook-Signaturpruefung | `SUPPORTED`, getestet |
| Webhook-Abonnement | `MANUAL_REQUIRED` (App-Dashboard) |

**`verifiedAt: null`** — keine dieser Angaben wurde gegen die echte API geprueft.
Sie stammen aus der Dokumentation der Graph API: eine begruendete Erwartung, kein
Nachweis. `scripts/social/verify-meta-capabilities.mjs` traegt das Datum ein,
sobald es einmal mit Zugang gelaufen ist.

## 5. Secrets Contract — NUR NAMEN

**In diesem Repository existiert kein einziger Secret-Wert. Diese Namen sind als
GitHub-Actions-Secrets zu hinterlegen.**

Neu fuer Social:

```
META_APP_ID                 oeffentlich, aber der Vollstaendigkeit halber als Secret
META_APP_SECRET             niemals ausgeben, niemals loggen
META_LONG_LIVED_TOKEN       Schreibzugriff auf das Profil — der kritischste Wert
META_IG_ACCOUNT_ID          Instagram-Professional-Konto-ID
META_WEBHOOK_SECRET         erst fuer Webhooks noetig
```

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
| **Gesamt** | **163** | alle Pflichtthemen aus §43 |

```
node --test "social/tests/*.test.mjs"      163/163 gruen
node --test "quant/tests/*.test.mjs"       unveraendert gruen (§48)
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

**Keines — und das ist die richtige Antwort.**

Es existiert keine Cloudflare-Anwendungsinfrastruktur im Projekt (siehe Audit).
Das Social-System laeuft auf demselben Substrat wie alles andere: GitHub Actions
als Scheduler und Compute, GitHub Pages als Auslieferung, R2 als S3-kompatible
Ablage, wenn Persistenz ueber den Repository-Umfang hinaus noetig wird.

Ein Cloudflare Worker wird erst eingefuehrt, wenn eine Funktion ihn zwingend
verlangt — heute waere das nur der OAuth-Callback, und dafuer gibt es eine
kostenlose Alternative (Owner-Entscheidung 1).

## 13. Offene externe Voraussetzungen

1. **Meta-App und Zugangsdaten** (Owner-Entscheidung 1) — blockiert den gesamten
   produktiven Pfad.
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

1. **Meta-Zugangsdaten hinterlegen** (Owner-Entscheidung 1, Option A).
   → alles Weitere haengt daran.
2. `node scripts/social/verify-meta-capabilities.mjs` ausfuehren; bei `VERIFIED`
   das Datum in `metaCapabilities({ verifiedAt: ... })` eintragen.
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
