# VU SOCIAL — PHASE A: REPOSITORY- UND INFRASTRUKTUR-AUDIT

Stand: 2026-09-15 · Zweig `claude/vision-universe-social-os-eudjmx`

Dieses Dokument ist das Ergebnis von §47 (REPOSITORY FIRST) des Build-Auftrags.
Es wurde **vor** der ersten Codezeile geschrieben. Es korrigiert drei Annahmen des
Auftrags, die im Repository keine Entsprechung haben — nicht als Widerspruch,
sondern weil ein Bauplan auf falschem Bestand ein zweites System erzeugt, und
genau das verbietet §0.

---

## 1. Was tatsaechlich existiert

| Gegenstand | Befund |
|---|---|
| Auslieferung | **GitHub Pages**, `CNAME` = `research.visionuniverse.de`, `.nojekyll` |
| Build-Pipeline | keine. Kein Bundler, kein `package.json`, keine Laufzeitabhaengigkeit |
| Modulformat | UMD-artig: `(function(global){...})(typeof window!=="undefined"?window:globalThis)` mit `module.exports`-Zweig. Laeuft in Browser **und** Node |
| Tests | `node --test "quant/tests/*.test.mjs"` (444), Python `unittest` (249), Academy (8) |
| Datenpfad | Praekomputierte JSON-Artefakte unter `quant/data/**`, erzeugt von `scripts/**/build-*.mjs` in GitHub Actions |
| Secrets | ausschliesslich GitHub-Actions-Secrets. Acht Dauertests in `quant/tests/secrets.test.mjs` |
| Provider-Abstraktion | `quant/engines/provider.js` — sieben Interfaces, Registry, Health-States, `findVendorLeakage()` |
| Capability-Matrix | `quant/engines/capabilities.js` — **drei** Zustaende: `true` / `false` / `null` (= ungeprueft) |
| Herkunftskennzeichnung | `quant/engines/data-mode.js` — mock/hybrid/live, Origin je Datenklasse, kein stiller Fallback |
| Feature-Gates | `quant/config/feature-gates.json` — Freischaltung ist ein Commit, kein Klick |
| Gesundheitsbericht | `scripts/market/build-health-report.mjs` — `OK / STALE / MISSING / UNREADABLE` |
| Kostenschranke | `quant/engines/zero-cost-guard.js` — rechnet **vor** dem ersten Byte |
| Navigation | `assets/site-navigation.js` + `scripts/sync-navigation.mjs` + Workflow `sync-navigation.yml` |
| Brand-Assets | `assets/atlas.png`, `assets/vision-universe-logo.png` |

## 2. Drei Korrekturen am Auftrag

### 2.1 Es gibt keine Cloudflare-Anwendungsinfrastruktur IM REPOSITORY

> **NACHTRAG 2026-09-15, nach Owner-Information.** Die Aussage dieses Abschnitts
> war und ist fuer das REPOSITORY richtig. Sie war unvollstaendig fuer die
> INFRASTRUKTUR: ausserhalb des Repositories existiert bereits ein
> vorbereiteter Cloudflare Worker `vision-universe-social` mit hinterlegten
> Secrets `META_APP_ID` und `META_APP_SECRET`.
>
> Ein Repository-Audit kann externe Infrastruktur nicht sehen — es liest, was
> committet ist. Die Lehre daraus steht in Abschnitt 5.
>
> Was daraus folgt und was ausdruecklich NICHT: Abschnitt 2.2 (korrigiert).

Der Auftrag (§35) setzt Workers, Queues, Cron Triggers, KV, D1, R2 und Durable
Objects als Bestand voraus. Im Repository existiert davon **genau eines**: R2 —
und auch das nicht als Cloudflare-Produkt, sondern als *S3-kompatible Ablage*
hinter einem eigenen, abhaengigkeitsfreien Treiber (`scripts/market/storage/s3-driver.mjs`,
Signature V4 in reinem Node). Es gibt kein `wrangler.toml`, keinen Worker, keine
Pages-Funktion, kein D1, kein KV.

Cron laeuft ueber `on: schedule` in GitHub Actions, nicht ueber Cloudflare Cron Triggers.
Queues gibt es nicht; die Entkopplung leistet der Workflow-Lauf selbst.

**Konsequenz:** Die Social-Architektur wird auf dem *tatsaechlichen* Substrat gebaut —
GitHub Actions als Scheduler und Compute, R2 als dauerhafte Ablage, GitHub Pages als
Auslieferung. Ein Worker wird erst eingefuehrt, wenn eine Funktion ihn zwingend
verlangt (siehe 2.2). Das ist §35 Satz 2 und 3 gehorcht: *"Keine Technologie einsetzen,
nur weil sie existiert"* — und erst recht keine, die noch gar nicht existiert.

### 2.2 OAuth-Callback braucht eine Server-Laufzeit — ENTSCHIEDEN

> **ENTSCHIEDEN 2026-09-15.** Der Owner hat den vorhandenen Worker
> `vision-universe-social` als Runtime bestimmt. Die urspruenglich empfohlene
> Option A (manuelle Token-Beschaffung) ist damit **nicht** die Zielarchitektur.
>
> Umgesetzt in `workers/vision-universe-social/`. Die Capability
> `serverSideTokenExchange` steht jetzt auf `SUPPORTED` und nennt in ihrer Notiz
> den Ort, an dem sie erfuellt wird.
>
> Der Text unten beschreibt die Lage VOR dieser Entscheidung und bleibt stehen,
> weil er begruendet, warum der Worker noetig ist.

#### Die Lage vor der Entscheidung


§9 verlangt Facebook Login for Business mit Callback-Handling, `state`-Pruefung und
Token-Tausch. Ein OAuth-Redirect-Callback ist per Definition ein **HTTP-Endpunkt, der
einen Request empfaengt**. GitHub Pages liefert statische Dateien aus und kann das
nicht. Der Code-Austausch (`code` → `access_token`) benoetigt zusaetzlich das
`META_APP_SECRET`, das niemals in den Browser gelangen darf.

Das ist die eine fundamentale Architekturentscheidung mit mehreren gleichwertigen
Alternativen, die §55 ausdruecklich dem Owner vorbehaelt. Die Optionen stehen in
`docs/VU_SOCIAL_OWNER_DECISIONS.md`. Bis zur Entscheidung ist der Meta-Adapter so
gebaut, dass er **beide** Wege bedient: die Token-Beschaffung ist eine austauschbare
Funktion, alles danach (Refresh, Ablauf, Publishing, Insights) laeuft unveraendert
serverseitig im Workflow.

Der Zustand wird nicht kaschiert. Er heisst `MANUAL_REQUIRED`, nicht `SUPPORTED`.

### 2.3 Es existiert keine vorbereitete Meta-Konfiguration IM REPOSITORY

> **NACHTRAG 2026-09-15.** Auch hier gilt die Unterscheidung aus 2.1:
> `META_APP_ID` und `META_APP_SECRET` sind im **Worker** hinterlegt. Im
> Repository existieren sie weiterhin nicht und sollen es nicht — die
> Secret-Namen sind dokumentiert, die Werte liegen ausschliesslich in der
> Cloudflare-Secret-Verwaltung.


§9 spricht von *"bereits vorhandene Meta-Konfiguration und Cloudflare-Secrets"*.
Eine vollstaendige Suche ueber Code, Workflows, Doku und Konfiguration findet:
**nichts**. Die im Repository verwendeten Secret-Namen sind ausschliesslich:

```
TWELVE_DATA_API_KEY   TIINGO_API_KEY   FMP_API_KEY   FINNHUB_API_KEY
SEC_USER_AGENT
VU_HISTORY_S3_ACCESS_KEY_ID   VU_HISTORY_S3_SECRET_ACCESS_KEY
VU_HISTORY_S3_BUCKET   VU_HISTORY_S3_ENDPOINT   VU_HISTORY_S3_REGION
```

`META_APP_ID` und `META_APP_SECRET` existieren im Repository nicht. Sie werden von
diesem Build als **Vertrag** eingefuehrt (Name, Zweck, Pruefung) — der Wert bleibt
eine Owner-Handlung. Bis dahin meldet der Provider `not_configured`, was ein
gueltiger, sichtbarer Zustand ist und kein Fehler.

## 3. Was wiederverwendet wird statt neu gebaut

| Bestehendes Muster | Social-Entsprechung |
|---|---|
| `provider.js` Interfaces + Registry + Health | `social/engines/provider.js` — dieselbe Form, eigene Interfaces |
| `capabilities.js` Drei-Zustands-Matrix | `social/engines/capabilities.js` — `UNKNOWN` bleibt `UNKNOWN` |
| `data-mode.js` Herkunft je Datenklasse | `social/engines/provenance.js` — `VERIFIED/STALE/UNAVAILABLE/CONFLICTING` |
| `feature-gates.json` Freischaltung als Commit | `social/config/kill-switch.json` |
| `build-health-report.mjs` MISSING ist Inhalt | `social/engines/health.js` |
| `hash.js` deterministischer Hash | direkt wiederverwendet fuer Idempotency-Keys |
| `zero-cost-guard.js` vorher rechnen | Kostenmodell des Social-Loops |
| `secrets.test.mjs` acht Dauertests | um Meta-Muster erweitert |
| `sync-navigation.mjs` | Command Center bindet dieselbe Navigation ein |
| `s3-driver.mjs` R2-Ablage | Content Memory und Metrik-Historie |

## 4. Was dieser Build ausdruecklich nicht tut

- Keine Aenderung an `quant/`, `discover/`, `morning/`, `macro/`, `hedgefonds/` (§48).
- Kein zweites Modulformat, kein Bundler, keine Laufzeitabhaengigkeit.
- Keine produktive Veroeffentlichung. `ENABLE_AUTOPUBLISH` ist `false` und bleibt es,
  bis der Owner sie in einem eigenen Commit setzt (§16, §33).
- Keine erfundenen Trenddaten. Ohne angebundene Quelle meldet die Trend-Engine
  `UNAVAILABLE` und liefert keine Zahl (§45).

---

## 5. Was dieses Audit nicht sehen konnte — und was daraus folgt

Dieses Audit hat das Repository gelesen. Es hat daraus geschlossen, dass es keine
Cloudflare-Anwendungsinfrastruktur gibt.

**Der Schluss war falsch, obwohl die Beobachtung richtig war.** Ein
Repository-Audit sieht, was committet ist. Es sieht keine Cloudflare-Konten,
keine hinterlegten Secrets, keine laufenden Dienste.

Die Formulierung haette das trennen muessen:

- *"Im Repository existiert keine Cloudflare-Integration"* — belegt
- *"Es gibt keine Cloudflare-Anwendungsinfrastruktur"* — nicht belegbar aus dem
  Repository

Dieselbe Unterscheidung, die dieses Projekt an jeder anderen Stelle trifft
(`null` heisst ungeprueft, nicht "nicht vorhanden" — MASTER §31.6), war hier
nicht getroffen. Fuer kuenftige Audits: **externe Infrastruktur ist ein
ungeprueftes Feld, kein leeres.** Sie gehoert in die Liste der Owner-Fragen und
nicht in die Liste der Befunde.

Der Bauplan hat trotzdem getragen: weil der Meta-Adapter den Token-Tausch
vollstaendig implementiert hat und nur den Ort offenliess, kostete die Korrektur
keine Umarbeitung — der Worker fuehrt denselben Ablauf in seiner Laufzeit aus.

---

## 6. Was das ungepruefte Feld dann tatsaechlich enthielt

Nachgetragen am 2026-09-15, nachdem der Cloudflare-Zugang ueber GitHub Actions
verfuegbar war und der Preflight zum ersten Mal gegen die reale Infrastruktur
gelaufen ist.

| | |
|---|---|
| Worker `vision-universe-social` | existierte, mit Cloudflares "Hello World"-Vorlage |
| `META_APP_ID`, `META_APP_SECRET` | gesetzt, wie vom Owner angegeben |
| `VU_SOCIAL_ADMIN_KEY` | fehlte |
| KV-Bindung | fehlte |

Es lag also weder fremde Produktivlogik dort noch die fertige Anwendung, die der
Auftrag vermuten liess: der Worker war angelegt und mit den Meta-Secrets
bestueckt, aber leer. Beide Extremannahmen — "da ist nichts" und "da ist schon
alles" — waren falsch. Der Preflight hat das entschieden, nicht eine Vermutung.

### Zwei Befunde am Messwerkzeug selbst

**Die Groesse taugt nicht als Urteil.** Der erste Lauf hat die Vorlage als fremde
Produktivlogik gemeldet und das Deployment gesperrt — allein, weil 752 Bytes
ueber der gesetzten 400-Byte-Schwelle lagen. Die Sperre war richtig, der Grund
war falsch. Behoben nicht durch eine hoehere Schwelle (derselbe Fehler in die
andere Richtung: ein kompaktes produktives Skript waere durchgegangen), sondern
durch eine Klassifikation dessen, was der Code *tut*.

**Der Fingerabdruck war keiner.** Zwei Laeufe meldeten fuer denselben
unveraenderten Worker dieselbe Groesse, aber verschiedene sha256-Praefixe.
Cloudflare liefert einen Modul-Worker als `multipart/form-data` aus, mit einer
bei jedem Abruf neu gewuerfelten Trennmarke — feste Laenge, zufaelliger Inhalt.
Gehasht und gezaehlt wurde die Huelle mit; eine Sicherung haette kein
lauffaehiges JavaScript enthalten, sondern ein Formular.

Aufgefallen ist das nur, weil zwei Laeufe nebeneinander lagen und die Zahlen
nicht zusammenpassten. Ein einzelner Lauf haette einen plausiblen Fingerabdruck
geliefert, und der Fehler haette erst beim ersten echten Vergleich gewirkt — dann
haette er eine tatsaechliche Aenderung am Worker nicht von Rauschen unterschieden.

Beides gehoert zu derselben Lehre wie §5: ein Messwert ist eine Behauptung ueber
die Welt, und er verdient dieselbe Skepsis wie jede andere.
