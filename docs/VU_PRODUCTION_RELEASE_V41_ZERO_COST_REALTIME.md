# Production Release: V4.1 Consumer Experience + Zero-Cost Realtime

**Auftrag:** Owner Final Acceptance vom 18.09.2026 („V4.1 + ZERO-COST REALTIME
GO-LIVE"), Abnahmestand `c5dd01fdb` akzeptiert, GO für kontrollierten Merge
nach `main` und Veröffentlichung.
**Produktion:** `https://research.visionuniverse.de/discover/`
**Strom:** `wss://live.visionuniverse.de/live`
**Merge:** `ca6a3639f` (ein Merge-Commit)
**Stand vor dem Merge (Rückfallpunkt):** `bc64964f9`

---

## 1. Die Owner-Entscheidungen, jede einzeln beantwortet

| # | Entscheidung | Umsetzung | Beleg |
|---|---|---|---|
| 1 | Development Preview aus der **gesamten sichtbaren** Consumer Experience entfernen; interne Metadaten dürfen bleiben | Plakette aus `assets/site-navigation.js` entfernt (Markup, `.preview`-CSS in beiden Media Queries, drei Farbtokens), Wortlaut aus `quant/ui/components.js`; `no-preview` bleibt gültig, aber wirkungslos. Interne Konfiguration `quant/config/development-preview.json` besteht unverändert | Scan §18 site-wide: **42 ausgelieferte Seiten, 37 Oberflächenmodule, nirgends** |
| 2 | Kein zusätzliches Account Analytics:Read anfordern; der zweite Worker bleibt durch die Sicherheitsreserve abgedeckt | Nicht angefordert. Die Annahme steht offen im Wächter und im `/health` des Workers: `otherWorkersMeasured: false`, Reserve deckt „den Verbrauch des anderen Workers im selben Konto" | `/health` des Laufs 35360487234 |
| 3 | ZERO_COST_MODE = HARD bleibt verbindlich | Unverändert: 70 % WARNING, 85 % PROTECT, PROTECT → Realtime OFF mit Snapshot-Übernahme, kein automatisches Paid Upgrade, keine Billing-Automation | `assert-zero-cost-mode.mjs`: **276 Dateien, 0 Funde, PASS, PAID_SERVICES_ENABLED = 0** |
| 4 | 1-Sekunden-Coalescing bleibt | Unverändert. Nicht angefasst | — |
| 5 | GO für Merge und Veröffentlichung | Ausgeführt | `ca6a3639f` |

## 2. Stop-Kriterien

| Kriterium | Stand | Beleg |
|---|---|---|
| V4_1_LIVE | **PASS** | `ca6a3639f` auf `main`, Pages ausgeliefert |
| ZERO_COST_REALTIME_LIVE | **PASS** | `stream.enabled = true`, Worker `vu-live-worker-1.0.0` antwortet |
| REALTIME_STOCK_PAGE | **PASS** | Rauchtest 35360487234, 11:08 New York, 5/5 Titel |
| REALTIME_FALLBACK | **PASS** | Abriss, Wiederanlauf, Widerruf — alle drei gemessen (§5) |
| ZERO_COST_MODE | **PASS** | HARD, 276 Dateien, 0 Funde |
| PAID_SERVICES_ENABLED | **0** | ebenda |
| PRODUCTION_SMOKE | **PASS** | 14 von 14 Zusagen, `realtimeVerified: true` |
| DEVELOPMENT_PREVIEW_VISIBLE | **0** | 42 Seiten, 37 Module, nirgends |
| CRITICAL_BLOCKERS | **0** | §7 nennt die gefundenen und ihre Behebung |
| ROLLBACK_READY | **PASS** | §8 |

## 3. Realtime in Produktion — die Messung, nicht die Absicht

Lauf **35360487234**, `2026-09-18T15:08:43Z` = **11:08:43 New York**, Sitzung
REGULAR. Jeder Titel eine Minute lang beobachtet, im echten Browser, gegen die
veröffentlichte Seite.

| | Ticks/60 s | Chart-Neuzeichnungen | Kopf | Chart | Abweichung | Ende-zu-Ende |
|---|---|---|---|---|---|---|
| AAPL | 23 | 22 | 334,94 $ | 334,94 $ | 0,000 % | 761 ms |
| NVDA | 43 | 36 | 219,32 $ | 219,32 $ | 0,000 % | 664 ms |
| MSFT | 23 | 21 | 493,38 $ | 493,38 $ | 0,000 % | 901 ms |
| PANW | 6 | 6 | 360,02 $ | 360,02 $ | 0,000 % | 797 ms |
| VLO | 12 | 10 | 414,46 $ | 414,46 $ | 0,000 % | 1006 ms |

Die Zusagen aus dem Auftrag, einzeln:

- **Snapshot zuerst** — MSFT und PANW zeigen im Protokoll zuerst
  „Heute · Stand 11:00", dann „Markt geöffnet · Live". Die Seite ist nie leer.
- **verbindet danach automatisch** — 5 von 5 verbunden, ohne Zutun.
- **aktueller Titel wird dynamisch abonniert** — `subscribed: ["AAPL"]` auf der
  AAPL-Seite, `["NVDA"]` auf der NVDA-Seite. Ein Abonnement je Seite.
- **Chart verändert sich ohne Reload** — 6 bis 36 Neuzeichnungen je Titel.
- **„Markt geöffnet · Live" nur bei frischem Strom** — beide Richtungen geprüft:
  kein Titel ohne Kurse trägt das Etikett, und die mit Kursen tragen es.
- **Headline-Kurs = Chart-Kurs** — Abweichung 0,000 % bei allen fünf.

## 4. Discover und Aktienseite

Abgenommen im Production Smoke ohne Realtime (`db6e8e1be`, `054e606ab`):
Light/Dark/System, schwebende Navigation Suchen · Entdecken, Hero-Swipe,
Index-Ranglisten, Feed über zehn Titel, großer Consumer-Chart mit 1T als
Standard, grün bei positiver und rot bei negativer Entwicklung, Fundamental
Journey, Metric Cluster, Bewertung, Chancen und Risiken, Quant und Technical
hinter der Grenze. Keine Anbieternamen in Consumer-Modulen (§14), keine
Konsolenfehler.

## 5. Rückfall und Widerruf — die drei Phasen

Alle drei am selben Lauf gemessen, an AAPL:

**Abriss.** `OPEN, connected: true, "Markt geöffnet · Live"` →
`RECONNECTING, connected: false`, **Chart bleibt gezeichnet**.

**Wiederanlauf.** Von selbst zurück auf `OPEN, connected: true`.
`opens: 2, closes: 1, retries: 1, errors: 0, denied: 0`.

**Widerruf.** Wiederanlauf blockiert, 90 Sekunden (`freshSeconds`) gewartet:

```
"Markt geöffnet · Live"  →  "Heute · Stand 11:00"
Chart gezeichnet: ja      Linie vorhanden: ja      Kopf: 333,95 $
Fußnote: "5-Minuten-Kurse · Uhrzeiten New York · Startlinie:
          Vortagesschluss · die Sitzung läuft, der Verlauf wächst
          mit dem nächsten Stand"
```

Das Etikett widerruft sich selbst, der Snapshot übernimmt, und die Fußnote
widerspricht dem Etikett nicht.

## 6. Zero-Cost, Schlüssel, Hygiene

```
ZERO_COST_MODE = HARD
  276 ausfuehrbare Dateien durchsucht
  Durable Object SQLite-gestuetzt: ja
  kein usage_model gesetzt:        ja
  Funde:                           0
URTEIL: PASS   PAID_SERVICES_ENABLED = 0

Consumer-Oberflaeche: 42 ausgelieferte Seiten, 37 Oberflaechenmodule
  §18 'Development Preview' site-wide: nirgends
  §14 Anbieternamen im Consumer-Text: keiner
URTEIL: PASS

Schluesselpruefung: 24.743 Datei(en) — keine Zugangsdaten gefunden
```

Der Budget-Wächter läuft und meldet seine eigene Annahme mit:
`assumedEventsPerSecondPerSymbol: 0.85`, `accountWideLimits: true`,
`otherWorkersMeasured: false`. Das Risiko steht im Klartext im `/health`: fällt
die Kontogrenze, bevor der Wächter PROTECT meldet, ist der Ausgang ein Ausfall
mit Rückfall auf den Snapshot-Pfad — **keine Rechnung**, der kostenlose Tarif
schaltet ab, statt abzurechnen.

## 7. Was die Abnahme gefunden hat

Sechs Befunde, alle am 18.09.2026, alle behoben. Vier davon hätten den Release
still unterlaufen: die Seite hätte funktioniert und veraltete Kurse gezeigt.

### 7.1 Zwei Befunde am Prüfwerkzeug

**Ein geschlossener Markt war ein Fehlschlag** (`0d37037b0`). Der erste Lauf
fiel um 09:21 New York — neun Minuten vor der Eröffnungsglocke — an genau einer
Zusage: „jede Aktienseite verbindet sich mit dem Strom", 0 von 5. Das Produkt
hatte recht. Die Zusage wird jetzt nach Sitzung getrennt gefragt; bei
geschlossener Börse gelten drei andere Zusagen (kein Strom, Snapshot trägt,
kein „Live"), und das Urteil lautet `UNKNOWN (marketClosed:PHASE)` statt PASS.

**Das falsche Etikett gelesen** (`d6931ad02`). `querySelector(".dx-live-label")`
nimmt das erste Etikett im Dokument — auf der Aktienseite tragen auch die Karten
der Reihen „Weiter entdecken" diese Klasse. Alle sechs Stellen lesen jetzt
`.dx-chart .dx-live-label`. Zusätzlich: „der Chart bewegt sich nicht" und „es
gibt gar keinen Tagesverlauf" ergaben beide null — jede Seite berichtet jetzt
ihre Fläche, und daraus wurde eine **zusätzliche** Zusage vor der
Bewegungsprüfung.

### 7.2 Vier Befunde am Produkt

**Ein Datenlauf verlor seine Daten** (`c126d6d01`). Lauf 35351616026 holte 524
Titel, rebaste sauber und wurde beim Push abgewiesen, weil in der Sekunde
dazwischen ein anderer Commit auf `main` landete. Keine Wiederholung, fünf
Minuten Abruf weg. Dieselbe ungesicherte Folge stand im Marktdaten-Refresh, wo
es siebzig Minuten wären. `scripts/ci/push-with-retry.sh`: fünf Versuche mit
wachsendem Abstand; ein echter Konflikt bricht ab; nach dem letzten Fehlversuch
sagt das Skript ausdrücklich, dass nichts veröffentlicht ist.

**Die Daten erreichten die Leser nicht** (`819d4df92`) — der schwerste Befund.
`pages-release.yml` hatte 22 Läufe, alle von Commits mit persönlichem Zugang.
44 Commits von Datenläufen seit dem 17.09. hatten **keinen einzigen** ausgelöst:
ein Push mit dem `GITHUB_TOKEN` erzeugt keinen neuen Workflow-Lauf. Die
ausgelieferte Seite zeigte um 14:10 UTC die Snapshots von 09:35, während in
`main` die von 10:05 lagen. An einem gewöhnlichen Handelstag ohne menschlichen
Push friert der ausgelieferte Stand ein. Der Pages-Release hört jetzt per
`workflow_run` auf das Fertigwerden der beiden Datenläufe. Belegt: drei Läufe,
jeder von einem Intraday-Commit ausgelöst, erfolgreich — vorher null.

**Ein Feldname war eine Behauptung** (`3db972ba5`). Der Recovery-Lauf holte 66
Minuten lang Kurse und scheiterte an der Regressionssuite: das
Gesundheitsurteil trug ein Feld `rejectionLedger.open`, und in einem
ausgelieferten Artefakt ist `open` der Eröffnungskurs. Die Hygieneprüfung kann
einer Zahl nicht ansehen, ob sie ein Kurs oder eine Anzahl ist. Der Feldname war
der Fehler, nicht die Prüfung; er heißt jetzt `offen`. Zwei Tests halten die
Regel (kein Feld darf wie ein Kursniveau heißen) samt Gegenprobe.

**Die Hygieneprüfung saß an der falschen Stelle** (`3db972ba5`). Sie lief vor
dem Wächter — und der Wächter schreibt selbst ein ausgeliefertes Artefakt.
Gefunden hat den Verstoß erst die Regressionssuite, zwei Schritte später. Sie
steht jetzt hinter dem Wächter.

### 7.3 Eine Beobachtung, die sich als Auslieferungsfrage entpuppt hat

Um 14:10 standen an PANW zwei Kurse auf einem Bildschirm: Kopf 359,19 $ (dem
Strom folgend), Chart 375,00 $ (der Snapshot von gestern) — 4,9 % auseinander.
Beide Zahlen für sich ehrlich beschriftet, zusammen eine offene Frage an den
Leser. Ich habe an der V4.1-Oberfläche **keine Zeile geändert**. Mit dem
ausgelieferten Tagesverlauf von heute ist die Abweichung bei allen fünf Titeln
0,000 %. Die Ursache lag in der Auslieferung (7.2), nicht in der Oberfläche.

## 8. Rückfall

Der Merge ist **ein** Commit (`ca6a3639f`); der Stand davor ist `bc64964f9`. Ein
Revert dieses einen Commits nimmt V4.1 vollständig zurück.

Die Cloudflare-Laufzeit ist davon unabhängig: der Strom hängt an
`stream.enabled` in `quant/config/development-preview.json`. Ihn auf `false` zu
setzen schaltet Realtime ab, ohne die Oberfläche anzufassen — die Aktienseite
fällt auf den Snapshot-Pfad zurück, der ohnehin zuerst lädt. Zwei Hebel, die
sich nicht gegenseitig brauchen.

## 9. Daten-Freshness (Recovery-Loop)

Der EOD-Freshness-Defekt vom 16.09. wird als eigener Loop geführt; Ursache,
Klassifikation, Retry-Semantik, Wächter und Zahlen stehen in
`VU_EOD_REJECTION_RECOVERY_2026-09-18.md`. Der V4.1-Release ist davon nicht
verändert worden.

## 10. Was nicht getan wurde

Keine neuen Features. Kein Redesign. Keine neue Architektur. Keine Änderung an
der V4.1-Oberfläche, an Intraday, Realtime oder Fundamentals. Kein Account
Analytics:Read angefordert. Das 1-Sekunden-Coalescing steht unverändert.

Fünfzehn weitere Aufrufer der ungesicherten Push-Folge (7.2) stehen unverändert;
sie schreiben keine Kursdaten und gehören nicht in diesen Release-Loop.
