# VU INVESTMENT INTELLIGENCE — BUILD STATUS

Letzte Aktualisierung: **Phase 3 abgeschlossen — Anbieterqualifikation und
Bereinigungssemantik.**

> **Phase 3** (September 2026) hat den offenen Auditbefund MEDIUM-7 behoben
> und ein Verfahren gebaut, das Datenanbieter auf ihre Eignung fuer
> historische Auswertungen prueft. Bericht:
> `docs/VU_PHASE3_IMPLEMENTATION_REPORT.md`, Ergebnis:
> `docs/VU_PROVIDER_DECISION_MATRIX.md`.
> **232 Tests gruen** (177 aus Phase 2, 55 neu).
>
> Ergebnis der Qualifikation: **kein Anbieter besteht alle drei Gates, kein
> Befund ist zur Laufzeit geprueft.** Das Verfahren steht, das Urteil fehlt -
> und das ist die ehrliche Bilanz, nicht ein Zwischenstand.
>
> **Phase 2** hatte zuvor die Providerschicht fuer echte Marktdaten gebaut.
> Bericht: `docs/VU_PHASE2_IMPLEMENTATION_REPORT.md`, Befunde:
> `docs/VU_PHASE2_PRODUCTION_AUDIT.md`.
> Das System laeuft weiterhin vollstaendig ohne Anbieterzugang.

## Discover (Zweig `claude/vision-universe-discover-h93fmv`, nicht in `main`)

| Stufe | Inhalt | Bericht |
|---|---|---|
| 1 | Modul, Datenvertrag, Reihen, Detailseite, 52-Wochen-Engine, Leadership Score | `VU_DISCOVER_DELIVERY_REPORT.md` |
| 2 | Dunkle Experience: Eingangsfläche, Poster, Reihenformen, Suche, Telefon | `VU_DISCOVER_EXPERIENCE_REDESIGN.md` |
| 3 | Bildsprache: Farbwelten, datengetriebenes Artwork, dunkler Header | `VU_DISCOVER_VISUAL_IDENTITY.md` |
| 4 | Consumer Layer: Klartext statt Scores, Sammlungen, drei Ebenen | `VU_DISCOVER_CONSUMER_LAYER.md` |
| 5 | Aktienseite als Ebene 2, Swipe-Grundlage, Einzeln entdecken | `VU_DISCOVER_STOCK_EXPERIENCE.md` |
| 6 | V3: Surfaces, Relevanz, Diversity, Chart Truth Contract, Themenwelten (Branch, nicht gemergt) | `VU_DISCOVER_V3.md`, `VU_DISCOVER_V3_COLLECTION_AUDIT.md` |
| 7 | Price Data Completion: Umfang an einer Stelle, kompakte Reihen, Series-Store, Lazy Loading (Branch) | `VU_DISCOVER_PRICE_DATA_COMPLETION.md`, `VU_DISCOVER_PRICE_COVERAGE.md` |
| 8 | Full Market Universe & Live Intraday: Eigentümer-Freigabe (13.09.2026) in Richtlinie/Gates/Profil, kanonische Universumsquelle mit Company-Master-Übergabepunkt, Trading Session Resolver, Intraday-Vertrag + Ingest + Snapshots, Live-Hub, Micro-Intraday auf Karten/Hero/Aktienseite (1T), Workflows `market-data-refresh.yml` + `intraday-snapshots.yml`. Erste CI-Läufe: 5 379 Jahresreihen, 5 339 Faktorzeilen/Karten (100 % mit Chart), 4 348 Intraday-Snapshots (Branch, nicht gemergt, nicht veröffentlicht) | `VU_DISCOVER_FULL_UNIVERSE_LIVE.md`, `VU_DISCOVER_PRICE_COVERAGE.md` |
| 9 | Company-Master-Integration: `us-security-master-1.1.0` (2e22a2e, 7 004 Titel) als kanonische Universumsquelle, Fallback auf 5 684 entfernt, Capability Matrix je Instrument, Sektor-Overlay aus der Gate-Datei, Collections neu berechnet. CI-Läufe: 6 514 Faktorzeilen/Aktienseiten, 6 555 Jahresreihen, 5 188 Intraday-Snapshots; 793 Quant-/167 Discover-Tests, 29+38+63 Browser-Prüfungen grün (Branch, nicht gemergt, nicht veröffentlicht, V3 visuell unverändert) | `VU_DISCOVER_COMPANY_MASTER_INTEGRATION.md`, `VU_DISCOVER_PRICE_COVERAGE.md` |
| 10 | Company Name Enrichment: kanonische Namensschicht `security-master/company-names.json` (Tiingo-Stammdaten → SEC-Tickerverzeichnis → kuratiert, Schlüssel statt Ähnlichkeit, Widerspruchsregel, Herkunft je Zeile), universe-source-Overlay, Discover bevorzugt displayName → legalName → Ticker. 6 981 / 7 004 Namen (99,67 %), 23 offen (Anbieter ohne Namen, Testsymbole); 801 Quant-/170 Discover-Tests, Verifier, Matrix grün; Mitgliedschaft, Kurse, Faktoren, Intraday unverändert (Branch, nicht gemergt, nicht veröffentlicht) | `VU_COMPANY_NAME_ENRICHMENT.md` |
| 13 | V4 Consumer Discovery Experience (Branch `claude/vision-universe-discover-h93fmv`, auf `main`): Root Cause „Letzter Handelstag · Freitag" (Zeitpläne liefen bis 15.09. 05:04 UTC nur auf dem Entwicklungsbranch, kein Lauf am 14.09.; kein Frische-Zustand), Freshness-Vertrag LIVE/LAST_SESSION/STALE/UNAVAILABLE in Ingest, Verzeichnis, Live-Hub, Karten, Statuszeile, Aktienseite; Nachzug `--scope=auto`; Health-Check + Freshness-Monitor (rot bei STALE); Daten & Quellen ohne Anbieternamen auf Karten; Verbraucher-Chart 1T/1W/1M/6M/1J aus Tages-, 5J/Max aus 6 308 Wochenreihen (R2); Eingangsfläche als Spur mit Wischgeste; Qualifikation „stärkste Aktien" (2 613 / 5 947), rankingReason je Karte, Index-Mitgliedschaft S&P 500 498 / NASDAQ-100 100 / Dow 30 aus Fondsbeständen bzw. Indexeigentümer (Stichtag 15.09.2026), Plausibilitätsregeln (CCI 1 337 % weg, mit Grund), Reihenfolge §23, Farbwelten, Kartenhierarchie. Tests 926 Quant / 191 Discover / 471 Python, Verifier 60 937, Browser-QA 63 + 38 + 33, 19 Screenshots `docs/screenshots/discover-v4/` (nicht gemergt, nicht veröffentlicht; Owner-Abnahme) | `VU_DISCOVER_V4_CONSUMER_EXPERIENCE.md` |
| 14 | Release-Abnahme V4 (15.09.2026, Branch, nicht gemergt): Freshness-Fix gegen echte Tiingo-Daten per `workflow_dispatch` — Universum Montag 2026-09-14 nachgezogen (5 207 Snapshots), Discover-Umfang Dienstag LIVE, Refresh Tageskurse bis 2026-09-14; Pfad Provider→Ingest→Storage→Export→UI mit sessionDate/lastBarTimestamp/asOf/freshnessState dokumentiert; Freitag-Stand heißt „nicht aktuell“, nie „Letzter Handelstag“. Drei Release-Blocker behoben: erstes Startseiten-Stück wieder < 320 KB (Test unverändert), Refresh-Commit mit `--autostash` (Test-Rückstände), Technik-Bau lässt `scale/` stehen (kanonisches Coverage-Artefakt) — die letzten beiden betreffen `main` heute Abend. Tests 926 / 193 / 471, Verifier 63 383, Browser-QA 63 + 38 + 33, 23 Screenshots. **GO** unter Owner-Abnahme | `VU_DISCOVER_V4_CONSUMER_EXPERIENCE.md` Abschnitt U |
| 15 | V4.1 Consumer Experience Master Pass (Branch `claude/vision-universe-discover-h93fmv`, auf `main` 7cc267ba9): Root Cause „Dienstag-Chart um 15:40 bei geöffnetem Markt" = Kadenz (Takt 10 min + Lauf 6,5 min + GitHub-Verzögerung → 16 min, Vorbörsenlauf holte Dienstag, erste Mittwoch-Kurse 15:51) → Takt 5 min mit Concurrency, Warten auf die Eröffnung (`openWaitMs`), Poll 3 min bei OPEN, Statuszeile „Markt geöffnet · Live" nur bei LIVE; großer Chart 50–70 % mit Berührung; Farbregel grün/rot für alle Kurscharts; Fundamental Journey als Bühne mit Kennzahlwechsel; „Das Unternehmen in Zahlen" (vier Cluster); Bewertung consumer-first mit Sanity (KGV 798); Quellen nur auf Daten & Quellen; Farbschema System/Hell/Dunkel mit Tokens; Plakette weg auf Discover; schwebende Navigation Suchen · Entdecken; Suche „Welche Aktie suchst du?"; Feed 400 Titel aus 25 Sammlungen in Stücken à 12, deterministisch, keine Doppelten, Wiederaufnahme; Analyse hinter der Grenze. Tests 929 Quant / 206 Discover / 471 Python, Verifier 63 723, Browser-QA 63 + 38 + 33 + 29 (neu), 51 Screenshots `docs/screenshots/discover-v4-1/` (Commits 3f502ab0c Daten, 9ea81f9f8 Code; nicht gemergt, nicht veröffentlicht; Owner-Abnahme) | `VU_DISCOVER_V4_1_CONSUMER_MASTER.md` |
| 16 | Zero-Cost Realtime V1 (Branch `claude/vision-universe-discover-h93fmv`, **nicht gemergt, nicht ausgerollt**): Variante C — ein Cloudflare Worker mit EINEM Durable Object `vu-live` hält EINE Tiingo-Verbindung und streamt nur die Titel, die gerade jemand ansieht. Hundert Zuschauer auf NVDA = ein Abonnement. Referenzzählung mit 60 s Nachlauf, Kontingentwächter 70/85/100 % mit Vorausschau bis Handelsschluss, Zusammenfassung 1 s, harte Grenze 50 Titel; Karten und Feed bleiben auf dem Snapshot-Pfad, nur die Aktienseite streamt. Grundlage sind Messungen, nicht Annahmen: Firehose 1 022 Ereignisse/s über 6 429 Titel, Spitzenrate 1,7 je Titel, 2,22 µs Rechenzeit je Ereignis, 941 MB für alle gegen 8 MB für fünfzig, Cloudflare-Freibetrag 20 eingehende WS-Nachrichten = 1 Anfrage → Decke 85 Ereignisse/s ≈ 50 gleichzeitige Titel. Laufende Zusatzkosten **0 €**; bei einer Freigrenze wird abgeschaltet, nicht eskaliert. Geliehen und unverändert: transport/bar-merge/market-hours/freshness/staleness/session-policy; eine einzige Änderung am Bestand (fester require-Pfad in `providers/tiingo/realtime.js`, damit der Parser bündelbar ist). 82 neue Tests (21 Subscription Manager, 15 Budget, 32 Worker auf einer Cloudflare-Attrappe, 14 Client), bestehende 965 Quant / 206 Discover unverändert grün, Browser-QA V4.1 30/30 (29 bestehende + 1 neue Riegelprüfung: kein WebSocket bei ausgeschaltetem Strom), Secrets-Scan über 24 747 Dateien mit Gegenprobe. **Am 17.09.2026 bei laufender US-Sitzung gemessen und ausgerollt.** Der Zugang war bereits da und wurde nachgemessen statt angefordert: `CLOUDFLARE_API_TOKEN` liegt unter genau dem Namen vor, den wrangler liest, `CLOUDFLARE_ACCOUNT_ID` ist aus dem bestehenden `VU_HISTORY_S3_ENDPOINT` ableitbar (der R2-Endpunkt trägt sie). §1: **DYNAMIC_SUPPORTED** — auf derselben Verbindung wirkt Nachmelden (AAPL 52/NVDA 0 → AAPL 55/NVDA 74) und Abmelden (AAPL 0/NVDA 65); ein Kontrolllauf davor belegt, dass beide Titel handeln, und hat einen Leserfehler in meinem Nachweisskript aufgedeckt, statt ihn als Nein durchgehen zu lassen. Manager läuft im Modus `dynamic`. §17: Laststufen 1/5/10/25/50 mit 20 Zuschauern — bei 50 Titeln 19,57 Ereignisse/s, 0,60 % CPU, 10,5 MB, **0,1 % des Kontingents**, 50 von 50 abonniert. §18: AAPL/NVDA/MSFT/VLO/PANW alle geliefert. **Deployment auf Cloudflare Free**: 119,09 KiB, Startzeit 6 ms, `TIINGO_API_KEY` als Cloudflare-Secret über stdin; `live.visionuniverse.de` neu angelegt, `research.visionuniverse.de` unberührt auf GitHub Pages. Production-Proof an beiden Endpunkten **PASS** mit echten Kursen, erster Kurs im Median 2.788 ms (live.*) bzw. 2.481 ms (workers.dev) einschließlich Cloudflares Kante; `/health` meldet LIVE, dynamic, 13 Anfragen, Urteil OK. Zwei Korrekturen aus den Messungen: die Vorausschau rechnete mit der Einzelspitze 1,7 Ereignisse/s statt dem gemessenen Korbdurchschnitt 0,34 und lehnte deshalb den 40. von 50 Titeln ab (jetzt 0,85 = Messung × 2,5; die Schwellen 70/85 % hängen unverändert am gezählten Verbrauch, Test FB-17), und PROTECT deaktiviert Realtime jetzt kontrolliert statt erst EXHAUSTED (Owner-Regel). Ein Fehler zwischen Deployment und Betrieb: Cloudflare nimmt für ein Upgrade kein `wss://` entgegen — der Worker lief und lieferte nichts (Test VL-33 als Riegel). 220 Tests grün, Secrets-Scan über 24.762 Dateien, PAID_SERVICES_ENABLED = 0. Client-Schalter `stream.enabled` bleibt `false`, V4.1 nicht nach `main` gemergt | `VU_ZERO_COST_REALTIME_V1.md` |
| 17 | **V4.1 + Zero-Cost Realtime — Final Product Integration** (Branch `claude/vision-universe-discover-h93fmv`, **nicht gemergt, nicht veroeffentlicht**): aus zwei Staenden ist einer geworden. Die Aktienseite zeigt zuerst den Intraday-Snapshot, oeffnet dann die Verbindung nach `live.visionuniverse.de`, meldet genau den angesehenen Titel auf der bestehenden Tiingo-Level-6-Verbindung an und schreibt den laufenden Chart fort — ohne Neuladen, ohne leere Flaeche dazwischen; bleibt der Strom aus, uebernimmt derselbe Snapshot. `stream.enabled = true` an genau einer Stelle (`quant/config/development-preview.json`, `freshSeconds: 90`, `scope: stockPage`). Keine zweite Architektur: ein Worker, ein Durable Object, Referenzzaehlung mit 60 s Nachlauf, Modus `dynamic`. **ZERO_COST_MODE = HARD** maschinell geprueft (256 ausfuehrbare Dateien, 0 Funde, `PAID_SERVICES_ENABLED = 0`), Budgetwaechter 70 % WARNING / **85 % PROTECT = Realtime endet kontrolliert** mit Snapshot-Uebernahme (Tests VL-35, FB-17, Client-Seite); die kontoweite Annahme zum zweiten Worker steht als `RESERVE_RATIONALE` im Waechter und als offene Owner-Entscheidung im Bericht. **E2E im echten Browser unter dem echten Ursprung, 14:33 New York, echte Kurse:** AAPL 635 ms / NVDA 642 ms / MSFT 876 ms / VLO 1.015 ms / PANW 829 ms, Anbieter → Cloudflare 16–42 ms, 20–30 Neuzeichnungen je Titel, Kopf und Chart derselbe Kurs (Abweichung 0,0000). §20 in drei Phasen: Abriss (Chart bleibt), Wiederanlauf von selbst, **Widerruf des Live-Etiketts nach dem Frischefenster mit Snapshot-Uebernahme** — die dritte Phase kam dazu, weil die ersten zwei die Zusage aus §4 nicht vollstaendig belegten. Zwei Befunde kamen aus dem Bild, nicht aus einem Test: zwei verschiedene Kurse auf einem Bildschirm (Kopf 212,17 $ vs. Chart 219,46 $ — der Kopf folgt jetzt dem laufenden Kurs, eigene QA-Pruefung dafuer) und die kollidierenden Stundenmarken 15:00/16:00 auf dem Telefon (Mindestabstand 40 → 54 px). Tests 967 Quant / 222 Discover / 35 Worker / 471 Python, Realtime-Sammellauf 224, Verifier 63.723, Browser-QA 63 + 39 + 33 + 30 + Auslieferungspruefung ohne Fehlschlag, Realtime-Suite in Actions 12/12 mit echtem Strom, Secrets-Scan 25.290 Dateien. Eine veraltete Pruefung wurde verschaerft statt abgeschaltet (Navigation muss dem Farbschema **folgen** statt immer dunkel zu sein); die Strom-Ausnahme in den lokalen Suiten gilt nur fuer genau die ausgelieferte Adresse und nur fuer den Verbindungsaufbau, wird gezaehlt und ausgewiesen. 32 Aufnahmen in hell und dunkel. **Nicht nach `main` gemergt, `research.visionuniverse.de` unveraendert auf V4** | `VU_V41_ZERO_COST_REALTIME_FINAL_PRE_MERGE_ACCEPTANCE.md` |
| 18 | **Production Release V4.1 + Zero-Cost Realtime — veroeffentlicht am 18.09.2026** unter `https://research.visionuniverse.de/discover/`, Strom `wss://live.visionuniverse.de/live`. Merge `ca6a3639f` (EIN Commit; Rueckfallpunkt `bc64964f9`). Owner-Entscheidungen 1-5 einzeln beantwortet: Plakette site-wide weg (42 ausgelieferte Seiten, 37 Module, **nirgends**; interne Konfiguration unveraendert), kein Account Analytics:Read angefordert (`otherWorkersMeasured: false` steht offen im `/health`), ZERO_COST_MODE = HARD unveraendert (276 Dateien, 0 Funde, **PAID_SERVICES_ENABLED = 0**), 1-Sekunden-Coalescing unangetastet. **Realtime Production Smoke 35360487234, 11:08 New York, 14 von 14 Zusagen, `realtimeVerified: true`**: AAPL 23 Ticks/22 Neuzeichnungen/761 ms, NVDA 43/36/664 ms, MSFT 23/21/901 ms, PANW 6/6/797 ms, VLO 12/10/1006 ms — Kopf und Chart bei allen fuenf **0,000 %** auseinander, ein Abonnement je Seite. Rueckfall in drei Phasen an AAPL: Abriss (`OPEN` -> `RECONNECTING`, Chart bleibt), Wiederanlauf von selbst (`opens: 2, retries: 1, errors: 0`), Widerruf nach 90 s („Markt geoeffnet - Live“ -> „Heute - Stand 11:00“, Linie da, Fussnote widerspruchsfrei). Secrets-Scan 24.743 Dateien. **Sechs Befunde, alle behoben, vier davon haetten den Release still unterlaufen**: Rauchtest verlangte Strom bei geschlossener Boerse (`0d37037b0`); Rauchtest las das Etikett einer fremden Karte (`d6931ad02`); ein Datenlauf verlor 524 geholte Titel an einen Push-Wettlauf ohne Wiederholung (`c126d6d01`, `scripts/ci/push-with-retry.sh`); **44 Daten-Commits loesten keinen einzigen Pages-Lauf aus** - ein Push mit dem GITHUB_TOKEN erzeugt keinen Workflow-Lauf, die ausgelieferte Seite fror ein (`819d4df92`, jetzt `workflow_run`; belegt: drei Pages-Laeufe von Daten-Commits, vorher null); Feldname `rejectionLedger.open` = Eroeffnungskurs liess 66 Minuten Abruf an der Hygiene scheitern (`3db972ba5`, jetzt `offen`, zwei Tests mit Gegenprobe); Hygienepruefung lief vor dem Waechter, der ihr Artefakt schreibt (`3db972ba5`). Keine Zeile an der V4.1-Oberflaeche geaendert: die „zwei Kurse auf einem Bildschirm“ (PANW 4,9 % um 14:10) waren eine Auslieferungsfrage und sind mit dem ausgelieferten Tagesverlauf 0,000 % | `VU_PRODUCTION_RELEASE_V41_ZERO_COST_REALTIME.md` |
| 19 | **P0 Data Freshness Recovery — EOD Rejection Checkpoint** (Owner 18.09.2026, eigener Loop neben dem Release): Tageskurse standen auf dem 15.09., waehrend der 16. und 17. gehandelt wurden; 6.831 von 6.876 Titeln wurden uebersprungen, 45 geholt, und der Lauf meldete Erfolg. **Ursache aus dem Repository belegt**: der Abendlauf vom 16.09. bekam je Titel GENAU EINE neue Bar, die Qualitaetspruefung verlangt zwei - 6.831 Ablehnungen mit dem Code `too_few_bars`, alle aus derselben Minute (22:41:11Z), jede sperrte ihren Titel sieben Tage. Der strikte EOD-Pfad stellte laengst die letzte GESPEICHERTE Bar als Anschluss davor, der regulaere nicht. **Retry-Semantik statt einer Zahl**: `quant/engines/rejection-lifecycle.js` mit PERMANENT_REJECT (strukturell, mindestens zweimal bestaetigt, nach 30 Tagen trotzdem wieder), TEMPORARY_REJECT (20 h, Verdopplung bis hoechstens eine Woche), STALE_REJECT, RECOVERED - und dem Sonderfall Fensterartefakt: `too_few_bars` bei inkrementellem Abruf ruht NICHT, die Ablehnung beschrieb das Fenster, nicht den Titel. Kein Titel bleibt dauerhaft ausgeschlossen, weil ein Lauf ihn einmal abgelehnt hat. **Regression Guard**: `assert-daily-lifecycle-health.mjs` faellt PASS/WARNING/FAIL und laeuft mit `--strict` im Refresh; „45 fetched / 6.831 silently skipped / asOf 3 sessions stale“ ist jetzt FAIL. **Wiederherstellung** (Lauf 35382249695, Commit `18ea58f7c0`): asOf **2026-09-17** (0 Sitzungen Rueckstand, vorher 2), **6.456 von 6.876 geprueft (93,9 %)**, 6.454 erfolgreich aktualisiert, **0 Provider-Fehler**, 422 Qualitaetsfehler (420 `adjustment_status_contradicted`, 2 echte `too_few_bars`: BNRG und JAB mit je einer Bar), **0 permanente Ablehnungen**, 6.456 Anfragen (Tag 6.456/50.000), Waechter **PASS** (vorher FAIL). Folgeketten dependency-correct: Faktoren, Technical/Elliott/SEC-Quant-Panel, Nachrechnung gegen die Engines, Discover-Daten (5.951 Titel mit Kursreihe), Capability-Matrix. **Sechs Anlaeufe, einer hat veroeffentlicht** - vier Fehlschlaege waren meine (Feldname `open` = Eroeffnungskurs; dieselbe Rangliste-Behauptung an einer zweiten, uebersehenen Stelle; `git add` auf eine Datei, die nicht immer entsteht; Hygienepruefung vor dem Waechter, der ihr Artefakt schreibt), einer war ein echter Konflikt zwischen zwei Workflows, die dieselben erzeugten Dateien schreiben. Kein Kursdatum ging verloren. **Nachtrag**: `classify-rejections.mjs` suchte Checkpoints eine Ebene zu hoch und war in JEDEM Lauf wirkungslos, der Freigabeschritt ebenso - beide meldeten Erfolg; die Wiederherstellung gelang allein durch die Ursachenkorrektur im Ingest (`d4a2963a31`, Test CR-3 laesst den echten Store schreiben statt meiner Vermutung). 1.146 Quant-Tests, 226 Discover-Tests gruen | `VU_EOD_REJECTION_RECOVERY_2026-09-18.md` |
| 20 | **P0 Stock Page Session Truth** (Owner 19.09.2026, nach dem Nebius-Befund): der Eigentuemer sah am 18.09. um **16:08 New York** - acht Minuten nach Handelsschluss - einen Chart, der um 15:50 endete, beschriftet „Heute - Stand 15:50 - Schluss folgt“. **Kein Nebius-Problem**: NBIS sauber gemappt (`ref_NBIS`, ELIGIBLE), im Live-Scope, und fuer den Strom gibt es keine Titel-Allowlist. **Drei Ursachen**: (1) PRIORITAETSUMKEHR - um 16:02 entschied der Intraday-Lauf `universe`, weil erst 519 von 6.876 Dateien vorlagen (7,5 %); der Lauf braucht 70 Minuten und die Concurrency stellte jeden Fuenf-Minuten-Lauf dahinter in die Warteschlange, sodass die 519 SICHTBAREN Titel ihren Schlussstand als LETZTE bekamen (bis ~17:15). (2) `regularComplete = nowMs >= closeMs` war eine Aussage ueber die UHR - nach 16:00 galt auch eine Reihe, die um 15:50 endet, als komplett. (3) Der Zustand war nirgends explizit: er entstand aus fuenf Groessen, und „5-Minuten-Kurse“ stand unbedingt da, auch wenn der laufende Kurs den letzten Punkt gesetzt hatte. **Fix**: `quant/engines/realtime/source-state.js` mit vier Zustaenden (REALTIME/SNAPSHOT/FINAL_SESSION/STALE) als einziger Ableitung, `data-source-state` im Markup; „Schluss folgt“ abgeschafft (geschlossener Markt ohne Abschluss = STALE); `intraday-scope.js` versiegelt nach der Glocke ZUERST den Consumer-Umfang; `regularComplete` = `fetchedAfterClose` x `coversFinalSlot`. **Eine Korrektur an der eigenen Analyse**: die Bars sind auf den Bar-ANFANG gestempelt - eine volle Sitzung endet auf 15:55, nicht 16:00; eine Zwischenmeldung von „4.910 luegenden Titeln“ war falsch gelesen. **Migration ohne Provider-Anfrage** (`migrate-intraday-completeness.mjs`): 10.474 Snapshots ergaenzt, **1.157 verlieren den Anspruch „komplett“**; fuer den 18.09. 4.633 vollstaendig / 567 ohne spaeten Handel. **Tests**: 18 am Quellzustand (15:50, 15:55, Uebergang, 16:01 unvollstaendig, voller Schluss, Realtime-Ausfall, Wochenende, Feiertag, verkuerzte Sitzung), 5 an der Kadenz, IS3 geschaerft statt gelockert, dazu die Riegel SS-16 (`now >= close` verboten) und SS-17 („Schluss folgt“ verboten) samt SS-18, der Gegenprobe, dass SS-17 keine Attrappe ist - SS-17 schlug beim ersten Lauf an meinen eigenen Kommentaren an und wurde praezisiert, nicht gelockert. 1.169 Quant / 226 Discover / 63.833 Verifier gruen. **Coverage-Proof** 17 Titel, 0 Befunde - mit ATHS als Pflichtfall, weil die erste Stichprobe nur vollstaendige Titel enthielt und die schaerfste Pruefung nie ausgeloest haette. **Production Proof** (Lauf 35423365022, 01:14 New York, geschlossener Markt): NBIS/AAPL/NVDA/MSFT/PANW/VLO alle **FINAL_SESSION** mit „Heute - Schluss 16:00“, neun Zusagen gruen, Urteil **UNKNOWN (marketClosed)** statt PASS - der Weg SNAPSHOT -> REALTIME -> FINAL_SESSION bleibt als separater Nachweis fuer den naechsten Handelstag offen und wurde NICHT durch Mock-Daten ersetzt. Zero-Cost, Cloudflare, V4.1-Design, Fundamentals/Quant/SEC unveraendert | `VU_STOCK_PAGE_SESSION_TRUTH_2026-09-19.md` |
| 21 | **P0 Intraday Delivery Reliability** (Owner 21.09.2026): der Eigentuemer sah um **15:34 deutscher Zeit = 09:34 New York** bei offener Boerse den Stand vom Freitag. **Drei Ursachen, zwei davon neu.** (1) DER ZEITPLAN ERZEUGTE KEINE LAEUFE: letzter geplanter Intraday-Lauf 13:09 UTC (PRE_MARKET), danach ueber eine Stunde keiner - nicht `failed`, nicht `cancelled`, **gar nicht angelegt**. In denselben 92 Minuten entstanden 100 push-ausgeloeste Laeufe aus den Quant-2.0- und Social-Straengen; dass GitHub Zeitplan-Ereignisse unter Last verwirft, ist dokumentiertes Plattformrisiko - die Kausalitaet bleibt ausdruecklich **vermutet, nicht belegt**. (2) DER ANBIETER TRAEGT DEN SITZUNGSBEGINN NICHT: 09:38 und 09:46 je **0 regulaere Bars** bei `discarded: 0` fuer 527 bzw. 8 Titel, ab 10:13 vollstaendig mit erster Bar 09:55; am 18.09. dasselbe Bild (09:36 erst 37/524, 09:58 dann 495/524). Nirgends als 25-Minuten-Regel kodiert - zwei Sitzungen sind eine Beobachtung, kein Vertrag. (3) ERST DER FIX MACHTE SIE SICHTBAR: der neue Taktgeber schrieb alle fuenf Minuten frisch nach `main`, und **nichts lieferte aus** - Push mit `GITHUB_TOKEN` loest keinen Lauf aus, `workflow_run` feuert erst bei `completed`, und ein Fuenf-Stunden-Block ist fuenf Stunden lang nicht completed. **Fix**: `pacemaker.js` (ein Lauf haelt den Takt - **78 Zeitplan-Ereignisse je Sitzung werden zwei**), `delivery-watchdog.js` (prueft die KETTE aus zwei Staenden: Repository UND Browser; PASS/WARNING/FAIL), `worker-waker/` (Cloudflare-Cron als unabhaengiger Puls - gebaut, getestet, **nicht ausgerollt**), Pages-Bruecke alle fuenf Minuten. **Providerbudget belegt**: erneut `UNKNOWN / PROVIDER_CONFIRMATION_REQUIRED`, Untergrenze 5.000/h aus Beobachtung - §7 verbietet damit, die 100/min zu lockern, also bleibt der Abruf bei 5:01 und der Fuenf-Minuten-Zieltakt **unerreichbar**. **Sechs Fehler, fuenf davon eigene**, alle von Produktion oder Gegenprobe gefunden: TDZ-Absturz im Ingest ohne Zugang (bestand lange, fiel nie auf); Zahlen aus dem Lauf davor gemeldet; Auslieferung gebrochen; **die eigene Taktregel verdoppelte den Takt auf 10 Minuten** (PM-7/PM-8 hatten ihn vorher BESTAETIGT statt gefangen); zwei Fehler in der Gegenprobe ID-2 selbst; Zyklusregister fuehrte jeden Zyklus doppelt. **Tests**: 20 Taktgeber, 15 Waechter, 10 Wecker, 11 Vertrag - ID-10 prueft, dass jeder der 20 §21-Faelle einen Test hat. **Zwei Owner-Eskalationen**: Tiingo-Limit erfragen; GitHub-Token mit `actions:write` als Cloudflare-Secret - es schliesst beide verbliebenen Luecken auf einmal. **Produktionsnachweis am 21.09.2026, offene US-Sitzung**: Block `35618350851` lieferte **fuenf** aufeinanderfolgende Zyklen (Pflicht waren drei) um 15:21:43 / 15:26:51 / 15:31:59 / 15:37:04 / 15:42:08 UTC - **Takt 5:08 / 5:08 / 5:05 / 5:04**, Abrufdauer konstant 5:02, 488 bis 505 Snapshots aus 527 Anfragen je Zyklus, **ohne ein einziges GitHub-Zeitplan-Ereignis**; davor, mit der fehlerhaften Wartezeit-Regel, waren es zehn Minuten. Browser-Nachweis `35618520773` (11:23:45 New York) **PASS 14/14** mit echten Ticks (AAPL 35, NVDA 43, MSFT 23) und dem Uebergang SNAPSHOT -> REALTIME an MSFT nach 1.999 ms. Die Kette wurde zuletzt um 15:50:21 gemessen, gegen die frisch ausgelieferte Seite: **WARNING, zehn Minuten hinter dem Repository** - Sitzung richtig, Stand ehrlich datiert, aber weiter hinter dem Ziel aus §22. Die Pages-Bruecke alle fuenf Minuten hat in diesem Zeitraum **kein einziges Mal** ausgeloest (`event: schedule`, `total_count: 0`) - derselbe Mechanismus, der die Ursache war; die Auslieferung lief waehrend des Nachweises an eigenen Pushes. Damit bleibt genau eine Luecke offen, und sie ist eine Owner-Entscheidung, keine unfertige Arbeit. **Eskalation 2 wurde am selben Tag beantwortet - besser als gefragt**: statt eines persoenlichen Tokens eine **GitHub App** (App ID 5023229, installiert auf genau diesem Repository, Berechtigung *Actions: read and write*). Ein PAT haengt an einem Menschen und gilt bis zum Widerruf; ein Installationstoken gehoert einer Sache und gilt eine Stunde. Der Wecker holt sich bei jedem Takt aus dem privaten Schluessel ein RS256-JWT (neun Minuten), daraus ueber `GET /repos/{repo}/installation` die **ermittelte, nicht konfigurierte** Installation ID und daraus ein Installationstoken. **Drei Befunde beim Umbau**: `repository_dispatch` verlangt *Contents: write* und haette bei jedem Takt 403 geliefert - ein ausgerollter, tickender Wecker, der nichts ausloest; genutzt wird deshalb `workflow_dispatch` (*Actions: write*), was zur vergebenen Berechtigung passt (WK-19). GitHub liefert den Schluessel als PKCS#1, WebCrypto liest nur PKCS#8 - der Worker legt die Huelle selbst herum, und WK-12 belegt es bytegleich statt es zu behaupten. Und der Schritt, der frueher ein PAT aus einem GitHub-Secret nach Cloudflare weiterreichte, ist **ersatzlos entfernt**: der private Schluessel beruehrt GitHub nie, der Workflow sieht nur noch NACH, ob das Secret bei Cloudflare liegt (`wrangler secret list` nennt Namen, nie Werte). Vom PAT ist nichts uebrig, und WK-17 prueft das ueber alle vier beteiligten Dateien. Neun neue Tests (WK-11 bis WK-19), **66 gruen**. **Der Schluessel wurde am selben Tag hinterlegt, und die Kette ist in Produktion belegt**: um 17:09:11 wurde der von Hand gestartete Block abgebrochen, um **17:10:46** legte GitHub Lauf `35630336530` an - `event: workflow_dispatch`, `triggering_actor: vision-universe-automation[bot]`, **nicht** der Eigentuemer. Ohne gueltiges JWT keine Installation, ohne Installation kein Token, ohne Token kein Dispatch. **Drei aufeinanderfolgende echte Cron-Takte** an der Quelle mitgehoert (`wrangler tail`, Lauf `35632934608`): je Takt `bereitsWach` + `ausgeliefert`, **null Fehlerereignisse**, BESTANDEN. Aus diesem Cloudflare-Block kamen **dreizehn** Zyklen in Folge mit Takt **5:03 bis 5:09**. **Die Auslieferungsluecke ist zu**: der gemessene Befund um 17:22:33 lautete `FAIL - 15 min hinter dem Repository`, woraufhin derselbe Wecker ueber dieselbe `Actions: write`-Berechtigung auch `pages-release.yml` anstoesst (kein neuer Dienst, kein neues Recht, Stau-Schutz ueber `in_progress` UND `queued`); danach zweimal **PASS** (17:55:34 und 18:16:26). Browser-Nachweis `35635434172` um 14:00 New York: **PASS 14/14**, `realtimeVerified: true`, Etiketten "Heute · Stand 13:55" -> "Markt geoeffnet · Live" - fuenf Minuten statt dreizehn am Vormittag. **Drei weitere eigene Fehler, alle von Gegenproben gefunden**: ein Workflow-Name mit Doppelpunkt machte die YAML ungueltig, und GitHub registrierte sie trotzdem - stumm, ohne Ausloeser; `node ... | tee` lieferte den Exit-Code von tee, sodass das Messinstrument NICHT durchfallen konnte und ich dem Eigentuemer faelschlich "bestanden" meldete; und der Waechter zaehlte ab dem BEGINN eines Zyklus gegen den Abstand ZWISCHEN zwei Beginnen und haette etwa jede fuenfte Messung grundlos alarmiert (WD-16 bis WD-19, zwei davon Gegenproben). 74 Tests gruen, ZERO_COST_MODE = HARD ueber 366 Dateien, PAID_SERVICES_ENABLED = 0. Realtime-Architektur, Cloudflare `vu-live`, Discover 2.1 unveraendert | `VU_INTRADAY_DELIVERY_RELIABILITY.md` |
| 12 | Live-Schaltung 15.09.2026: Modelluniversum aus Discover entfernt (nur `US_REAL`), Zweig auf `main` gemergt (kanonische SEC-Schicht von `main`, Normalisierung 1.10.0, Consumer-Export als zweite Ausgabe), `instrumentId` des Company Masters auf jeder Aktienseite, `stock-index`-Vertrag, Company-Master-Artefakte aus der neuen Eligibility, Deckungskennzahlen gegen 6 875 neu abgenommen (`coverage-metrics.yml`, Lauf 34933743907: Charts 6 871, Technik 5 884); Tests 873 Quant / 191 Discover / 471 Python, Verifier 57 901, Browser-QA grün — **veröffentlicht unter `https://research.visionuniverse.de/discover/`** | `VU_DISCOVER_V3_NETFLIX_BUILD.md` §24b |
| 11 | MASTER BUILD „Netflix of Stock Research": (A) Testsymbole und Nicht-Aktien über Klassifizierer + Namensschicht ausgeschlossen (Produktuniversum 7 004 → 6 875, Consumer-Policy 5 947 Titel, NASDAQ-Suffixcode P/O/N/M für Vorzüge, `displayName`-Schicht); (B) Consumer-Fundamentals aus dem SEC-Bulk-Archiv über die bestehende Pipeline (5 066 / 6 878 Unternehmen, 10 J 2 039, TTM 4 739; Annual/Quarterly/TTM getrennt, PIT auf Filing-Datum; Normalisierung 1.6.0), Engines Damals vs. heute / Journey / Story / Health / Signale, 10 fundamentale Sammlungen; (C) Discover mit Story-Fläche, Rhythmus aus 31 Flächen, Karten-Hook, „Weil du … angesehen hast", Aktienseite in Streaming-Reihenfolge (15 Sektionen), Next Discovery, Empfehlungs-Vertrag. Tests 801 Quant / 192 Discover / 267 Python, Verifier 66 148 Nachrechnungen, Browser-QA 63 + 38 + 29 grün, 25 Screenshots unter `docs/screenshots/discover-v3-netflix/` (Branch, nicht gemergt, nicht veröffentlicht) | `VU_DISCOVER_V3_NETFLIX_BUILD.md`, `VU_FUNDAMENTAL_INTELLIGENCE.md` |

Stand Stufe 5: 118 Discover-Tests, 684 Quant-Tests, 9 502 Nachrechnungen
der ausgelieferten Daten, 63 Browser-Prüfungen — alles grün.

**Veröffentlicht am 12.09.2026** unter
`https://research.visionuniverse.de/discover/`, nach `main` gemergt. Der
Menüeintrag **Discover** steht in `assets/site-navigation.js` an zweiter
Stelle und erscheint damit auf jeder Seite. Der Einzelmodus liegt unter
`/discover/#/einzeln/US_REAL` und ist aus der Discover-Leiste erreichbar.

### Stufe 6 — Discover V3 (Branch `claude/vision-universe-discover-v3`)

Nicht gemergt, nicht veröffentlicht. 150 Discover-Tests, 13 654
Nachrechnungen, 63/63 + 31/31 Browser-Prüfungen, 684 Quant-Tests. Die
Startseite ist ein Manifest aus 21 Surfaces in sieben Formen; bekannte Namen
rücken innerhalb qualifizierter Titel nach vorn; kein Renditepfad wird mehr
als Kurve gezeichnet — fünf echte Charts, 493 Renditeleitern. Details und
Empfehlung zur Veröffentlichung in `VU_DISCOVER_V3.md`.

### Stufe 7 — Price Data Completion (Branch `claude/vision-universe-discover-v3`)

Befund: alle 498 Titel haben Historie bei Tiingo und wurden ingestiert
(Gate 500: 500/500, ∅ 9 077 Bars ab 1990); ausgeliefert werden fünf, weil
`development-preview.json` den Umfang gegen eine ungeklärte Lizenz
(`LEGAL_REVIEW_REQUIRED`) so setzt. Das ist Richtlinie, nicht Technik — und
wurde nicht umgangen. Gebaut: Umfang als Tickerliste ODER Universum
(`scopeUniverse`), aufgelöst von `scripts/market/preview-scope.mjs`; kompakte
Ein-Jahres-Reihen (`quant/data/market/discover-series/`, ~7 KB je Titel) für
jeden Titel im Umfang; Ingest mit `--scope-from-preview`; Hygiene-Guard und
Workflow folgen dem Umfang; Discover-Series-Store
(`discover/data/series/<U>/<SYMBOL>.json`), Karten tragen Verweise, Reihen
laden bei Sichtbarkeit (Dedup je Titel, Prefetch der nächsten Karten,
Platzhalter ohne Chart). 153 Discover-Tests, 44 Hygiene-/Gate-Tests, 15 996
Nachrechnungen, Browser-QA V3 39/39. Heute 5 Charts von 498 — die Erweiterung
ist eine Zeile in der Konfiguration und eine Lizenzentscheidung des
Eigentümers.

### Auslieferungskette, geprüft

Ein grüner Pages-Build beweist, dass GitHub gebaut hat — nicht, dass die
Seite funktioniert. Deshalb ist die Kette einzeln nachgewiesen:

| Glied | Nachweis |
|---|---|
| `main` trägt Discover | 690 Dateien unter `discover/`, davon 658 Daten-JSONs |
| Pages baut daraus | Artefakt `github-pages` des Builds, 36 592 955 Bytes |
| Das Artefakt enthält Discover | +3,24 MB gegenüber dem Build davor; der Baum ohne `discover/` ist 3,17 MB kleiner |
| Pages hat ausgeliefert | Deployment-Status `success`, `environment_url` = `research.visionuniverse.de` |
| DNS zeigt auf Pages | `research.visionuniverse.de` → `dennismueller10x-sudo.github.io` → `2606:50c0:800x::153` |
| Der Baum liefert alles aus | 126 Anfragen, 0 mit Fehlerstatus (`scripts/discover/delivery-check.mjs`) |
| Die sieben Abnahmepunkte | Startseite, Aktie, Chart, Swipe, Einzeln, Navigation, Mobil — alle grün |

Nachrechnen: `node scripts/discover/delivery-check.mjs --root <baum>`. Das
Skript bedient einen Baum so streng wie Pages (Verzeichnis → `index.html`,
sonst 404, Gross-/Kleinschreibung zählt) und protokolliert jede Anfrage.

`.nojekyll` nimmt Jekyll aus der Kette: der Zweig wird wortwörtlich
veröffentlicht. Geprüft, dass nichts davon abhängt — keine Datei trägt
YAML-Front-Matter, keine HTML-Seite benutzt Liquid.

*Enforce HTTPS* war aus: alle Pages-Deployments bis zum 12.09.2026 meldeten
`http://research.visionuniverse.de/` statt `https://`, die Umleitung von HTTP
auf HTTPS fehlte also. Auf einem iPhone, das jede Adresse zuerst über HTTPS
versucht, war das die wahrscheinlichste Ursache für eine Seite, die nicht
aufgeht. **Am 13.09.2026 in den Repository-Einstellungen gesetzt**
(Settings → Pages → Enforce HTTPS); seitdem meldet das Deployment
`https://`. Die kanonische Adresse des Moduls ist damit
`https://research.visionuniverse.de/discover/`.

Datenlage für Ebene 2: Geschäftszahlen liegen für fünf reale Titel vor
(SEC-Einreichungen der Golden Five) und für das Modelluniversum;
Analystendaten und Segmentdaten gibt es nicht, entsprechende Abschnitte
wurden deshalb nicht gebaut.

## Universe Expansion — 498 → 5.690 (Zweig `claude/vision-universe-expansion-j633h8`)

**Der Grund für die 498 stand in zwei Zeilen Code, nicht beim Anbieter.**
`build-market-factors.mjs` schreibt Faktor-Einzelzeilen nur bis 500 Titel
ins Repository (Dateigröße, nicht Lizenz), und `build-discover-data.mjs`
las genau die dadurch größte Datei: `factors-GATE_500.json`. 500
ausgewählt, 2 ohne ausreichende Historie, 498 im Frontend — während der
FULL-UNIVERSE-Lauf längst 5.684 Titel geholt hatte.
Vollständige Herleitung: `docs/VU_UNIVERSE_EXPANSION.md`.

| Stufe | Inhalt | Bericht |
|---|---|---|
| 1 | Company Master: stabile `instrumentId`, idempotenter Sync, Fähigkeitsmatrix, Qualitäts- und Deckungsbericht | `VU_UNIVERSE_EXPANSION.md` |
| 2 | Suche und Aktienseite gegen den Master — lazy, scherbenweise | `VU_UNIVERSE_EXPANSION.md` |
| 3 | CIK-Zuordnung und SEC-Universum aus dem Master, Sammelweg für companyfacts | `VU_SEC_UNIVERSE_SCALE.md` |

| | vorher | nachher |
|---|---|---|
| Instrumente im ausgelieferten Universum | 498 | **5.690** |
| Primärschlüssel | Ticker | `instrumentId` (`vu_<14 hex>`) |
| delistete Titel | nicht geführt | 15, mit Datum |
| Suche kennt | 498 | das ganze Universum |
| Aktienseite öffnet | 498 | jedes Instrument im Master |
| Firmennamen | 498 | 517 (SEC-Lauf schließt den Rest) |

**Keine Obergrenze im Code.** `quant/config/company-master.json` führt
`size.maxInstruments: null`, und die CI prüft sowohl diese Zeile als auch,
dass kein `MAX_STOCKS`-artiges Konstrukt auftaucht.

Gemessen bei 25.000 / 50.000 Instrumenten: Sync 196 / 449 ms, Indexbau
21 / 56 ms, Suche 0,015 / 0,025 ms je Anfrage, **größte Suchscherbe 5 / 9
KB** — der Browser lädt Kilobyte, nicht das Universum.

**731 Quant-Tests, 118 Discover-Tests, 257 Python-Tests, 650 Prüfungen des
Masters, 19 + 63 Browser-Prüfungen** — alles grün.

Noch offen und ausschließlich ein Workflow-Lauf: `sec.gov` und
`api.tiingo.com` sind aus der Bauumgebung nicht erreichbar. Der Job
`sync` in `.github/workflows/universe-master.yml` holt das vollständige
Anbieterverzeichnis (108.573 Zeilen) und die CIK-Zuordnung; erst danach
stehen Firmennamen und CIK für das ganze US-Universum.

## Fundamental Data Expansion (Zweig `claude/vision-universe-expansion-j633h8`)

**Quelle der Wahrheit ist der akzeptierte US-Wertpapierstamm**, nicht mehr
der 5.690er Stand: 7.803 Mitglieder, **7.004 Produkttitel**, 799
bestätigte Nicht-Aktien. Der Company Master *konsumiert* diese
Entscheidung — die Eignungsdatei nennt ihre Mitgliederliste mit sha256,
und der Bau bricht ab, wenn sie abweicht.

| | |
|---|---:|
| Instrumente (Listings) | 7.809 |
| Mitglieder | 7.803 |
| **Produkttitel** | **7.004** |
| Emittenten mit CIK | 5 |
| Emittenten mit Geschäftszahlen | 5 (18,25–18,75 Jahre, 73–76 Quartale) |
| Metrikregistry | 27 → **40** Kennzahlen, EBITDA ableitbar |

Drei Identitätsebenen: `instrumentId` (Listing), `masterMemberId`
(Mitglied), `issuerId` (Gesellschaft = CIK). Produkttitel werden als
**Mitglieder** gezählt — sechs Mitglieder liegen an zwei Börsen.

**Drei echte Befunde aus dem Abgleich:** 308 Vorzugspapiere galten als
Stammaktien (getrennte Tickerschreibweise `CTA-P-B`); 2.119 aus dem
Wertpapierstamm angehängte Titel hätten einen Kursverlauf zugeschrieben
bekommen, den es nie gab; die Screenerfähigkeit folgte der eigenen
Klassifikation statt der Produktentscheidung und hätte 457 Optionsscheine
in den Aktienscreener gelassen.

Berichte: `docs/VU_FUNDAMENTAL_DATA_EXPANSION.md`,
`docs/VU_FUNDAMENTAL_ACCEPTANCE_REPORT.md`. Maschinenlesbar unter
`quant/data/fundamentals/` und `quant/data/universe/`.

**279 Python-Tests, 683 Master-Prüfungen, 118 Discover-Tests** — grün.
Offen und ausschließlich ein Workflow-Lauf: `sec.gov` ist aus der
Bauumgebung mit HTTP 403 gesperrt. `sec-fundamentals-universe.yml` mit
`backfill: true` füllt 7.291 fehlende Firmennamen, die CIKs und die
Fundamentalhistorie.

## Completed

Alle zehn Phasen sind umgesetzt. Der vollstaendige Bericht steht in
`docs/VU_IMPLEMENTATION_REPORT.md`.

| Phase | Inhalt | Status |
|---|---|---|
| 0 | Audit und Implementation Plan | ✓ |
| 1 | Foundation: Schema, Provider-Interfaces, Methodik, Query-AST, VUQL, Strategy Schema | ✓ |
| 2 | Mock Core: 500 Securities + 11 Edge-Case-Fixtures, MockProvider | ✓ |
| 3 | Quant Core: Normalisierung, Faktoren, VU Quant Score, Radar, Praekomputation | ✓ |
| 4 | Discovery: Quant Home, Ranking, Screener, Radar, Stock Detail, UI-Fundament | ✓ |
| 5 | Strategy Engine: Bibliothek, Strategy Lab, Versionierung, Lineage, Product API | ✓ |
| 6 | Backtest Engine: PIT, Ausfuehrung, Kosten, Metriken, Trust Score, Current Holdings | ✓ |
| 7 | AI Foundation: AIProvider, MockAI, Tool Registry, NL → AST, AI-Seite | ✓ |
| 8 | Watchlist Intelligence: Deltas, Faktorbewegungen, Events | ✓ |
| 9 | Quality Pass: Tests, Responsive, Zustaende, Dokumentation, CI | ✓ |

### Umfang

- **11 Produktseiten** (10 aus V1, `/quant/markt/` aus Phase 2), 23 Engine-Module
  (~6.700 Zeilen V1 + ~1.170 Zeilen Providerschicht), 4 versionierte Methodik-Dateien
- **232 Tests gruen** (`node --test "quant/tests/*.test.mjs"`, ~40 s), darunter die
  22 Acceptance-Kriterien aus Abschnitt 76, die 8 Schluesselpruefungen aus Phase 2
  und die 3 Gate-Tests aus Phase 3
- **27 Fachdokumente** unter `docs/` (13 aus V1, 7 aus Phase 2, 7 aus Phase 3),
  4 Provider-Vorbereitungen unter `providers/`
- CI: `.github/workflows/quant-ci.yml` — Tests, JSON-Validitaet, Seitenstruktur,
  Konsistenz zwischen praekomputierten Daten und Engines
- Am bestehenden Repository geaendert: **zwei Zeilen** (Menuepunkt + Positionierungsregel)

### Im Browser verifiziert

- Alle 10 Seiten: keine Konsolenfehler, kein horizontaler Ueberlauf, Leer- und
  Fehlerzustaende funktionieren
- Vollstaendige User Journey aus Abschnitt 96 end-to-end
- AI-Flow aus Abschnitt 97 (Strategie → Feedback → neue Version)
- Mobile (390 px): kein Ueberlauf auf einer der Seiten. Primaere Bedienelemente
  (Karten, Schaltflaechen, Tabs, Listeneintraege) ≥ 40 px. Ticker-Links in
  Datentabellen liegen bei Textzeilenhoehe (~15 px) - konventionell fuer
  Tabellen, aber auf dem Telefon klein. Als bekannte Einschraenkung gefuehrt.

## Phase 2 — Produktionsaudit und Marktdaten

| Teil | Inhalt | Status |
|---|---|---|
| Audit | 0 CRITICAL, 2 HIGH, 6 MEDIUM, 4 LOW — beide HIGH und 5 MEDIUM behoben | ✓ |
| Providerschicht | Faehigkeiten, Symbolzuordnung, Transport, Qualitaet, Betriebsmodus | ✓ |
| Adapter | Twelve Data, serverseitig, Free Plan | ✓ |
| Pipeline | Abruf → Pruefung → JSON → GitHub Pages, als Workflow | ✓ |
| Schluesselsicherheit | 8 Tests ueber das Repository + Pruefung vor dem Commit | ✓ |
| Oberflaeche | Datenherkunft je Datenklasse, neue Seite `/quant/markt/` | ✓ |
| Pruefstand | `evaluate-provider.mjs` — dieselben Fragen an jeden Anbieter | ✓ |

**Noch nicht scharf geschaltet.** `quant/data/market/status.json` steht auf
`configured: false`; es sind keine echten Kursdaten committet. Dafuer fehlen
zwei Dinge: das Secret `TWELVE_DATA_API_KEY` und die Klaerung der drei
Veroeffentlichungsfragen aus `docs/VU_PROVIDER_LICENSE_CHECKLIST.md`.

## Phase 3 — Anbieterqualifikation und Bereinigungssemantik

| Teil | Inhalt | Status |
|---|---|---|
| MEDIUM-7 | Zentrale Bereinigungssemantik, Alt-Pipeline migriert ohne Zahlenaenderung | ✓ |
| Semantik | RAW / SPLIT_ADJUSTED / TOTAL_RETURN / UNKNOWN, von beiden Stacks gelesen | ✓ |
| Evidenzspezifikation | 3 Gates, 15 Anforderungen, 7 Belegstufen, 3 Rollen | ✓ |
| Gate-Tests | ausfuehrbar; MockProvider als Referenz, 6 Fehlerfaelle als Gegenprobe | ✓ |
| Pruefstand | `runProviderQualification()`, Belegstufe getrennt vom Befund | ✓ |
| Anbieterprofile | Sharadar, Intrinio, Twelve Data, EODHD, FMP, Polygon | ✓ |
| Mehrere Anbieter | Vorrangregeln, Qualitaetswert, Datenstandskennung | ✓ |

**Kein Urteil, und das ist das Ergebnis.** Kein Anbieter besteht alle drei
Gates. Kein einziger Befund ist zur Laufzeit geprueft: ein bezahlter Zugang war
ausgeschlossen, und die Primaerdokumentation der Anbieter war aus der
Bauumgebung nicht abrufbar (Egress-Proxy). Beides ist ueberall vermerkt, wo
eine Einstufung steht.

Naechster Schritt kostet nichts: Intrinios Developer Sandbox (Dow 30) schliesst
Gate A und C. Gate B nicht - die Dow 30 sind per Definition Ueberlebende.

## Phase 4B — Realtime Market Data und Extended Hours

Gemerged als PR #51, finaler main-Commit **`39bfaea`**.

Provider-neutrale Live-Chart-Architektur: Datenklassen-Leiter
(`REALTIME_STREAM → REALTIME_QUOTE → INTRADAY → EOD → UNAVAILABLE`),
Capability Negotiation mit sechs Zustaenden, Best-Available-Fallback,
deterministische Merge-Regeln gegen Repainting, Verbindungsautomat,
Verfallserkennung und ein Datenstatus, der „LIVE" nur unter sechs
gleichzeitig erfuellten Bedingungen vergibt.

Dazu vier Handelssitzungen (`PRE_MARKET`, `REGULAR`, `AFTER_HOURS`,
`CLOSED`) als zweite Achse - nicht als zweite Leiter.

**817 Pruefungen gruen** (568 JS + 249 Python). Vier Auditbefunde gefunden
und behoben, darunter zwei HIGH.

Der Merge aendert nichts am Verhalten der ausgelieferten Seiten: beide
Feature-Gates bleiben aus, der Lizenzstatus bleibt
`LEGAL_REVIEW_REQUIRED`, `REALTIME_READY` ist nicht gesetzt, und der
Live-Chart ist an keine Seite angebunden.

Echtzeit und erweiterte Handelszeiten stehen auf **UNKNOWN**, bis ein
Laufzeitnachweis mit dem tatsaechlichen Zugang vorliegt.

Berichte: `docs/VU_REALTIME_MARKET_DATA_ARCHITECTURE.md`,
`docs/VU_REALTIME_MARKET_DATA_VALIDATION.md`.
Integrationsstand fuers Preview: `docs/VU_REALTIME_PREVIEW_INTEGRATION.md`.

## In Progress

Universe- und Fundamental-Expansion: gebaut, gemessen, geprüft. Was fehlt,
sind **zwei Workflow-Läufe mit Zugang** — `universe-master.yml`
(`sync: true`) und `sec-fundamentals-universe.yml` (`backfill: true`). Sie
füllen Firmennamen, CIK und Fundamentalhistorie für das Produktuniversum.
Ohne sie bleibt die gemessene Coverage bei 5 von 7.004, und genau so steht
sie im Bericht.

## Known Limitations

- **Alle Daten sind synthetisch**, solange kein Anbieterzugang konfiguriert ist. Auch
  mit echten Kursen bleiben die Fundamentaldaten synthetisch: die Ergebnisse belegen die
  Funktionsweise der Engine, nicht die historische Tragfaehigkeit einer Strategie an
  realen Maerkten. `backtestEligibility()` gibt dafuer `realEvidence: false` zurueck.
- **Reale Unternehmen bekommen keinen Quant Score.** Das Referenzuniversum
  (`ref_*`, 15 Titel) erhaelt ausschliesslich Kursdaten. Ein Score aus Kursdaten allein
  waere ein Momentum-Signal mit falschem Namen.
- **Kein Anbieter ist als Evidenzquelle qualifiziert.** Solange kein Anbieter die
  drei Gates besteht, bleibt jeder Backtest eine Vorfuehrung der Rechenlogik.
  `describeSnapshot()` gibt dafuer `evidenceEligible: false` zurueck und nennt die
  fehlende Voraussetzung.
- **Die Kursreihen sind splitbereinigt, nicht total-return-bereinigt.** Damit sind
  Momentum und Volatilitaet zulaessig, Renditeaussagen nicht. Eine Stufe hoeher
  kommt man nur mit Dividendenereignissen, nicht mit einer Annahme.
- Analyst Revisions sind im Schema vorgesehen, aber als `available: false` markiert —
  ohne lizenzierte PIT-Konsensdaten wird der Faktor nicht mit erfundenen Daten befuellt.
- Deflated Sharpe Ratio und Probability of Backtest Overfitting sind nicht implementiert;
  der Trust Score vergibt fuer diesen Block null Punkte statt ihn zu ueberspringen.
- Ein Universum (`US_EQUITIES`), eine Waehrung, keine Makro-, News- oder Ownership-Daten.
- Kein Nutzerkonto: Strategien, Backtests und Watchlist liegen im `localStorage`.
- Ein 20-Jahres-Backtest mit monatlichem Rebalancing dauert rund 19 Sekunden. Der Web
  Worker haelt die Oberflaeche bedienbar, beschleunigt die Rechnung aber nicht.
- Regulatorische Pruefung (MiFID II, WpIG, WpHG, MAR, EU AI Act, Datenlizenzen) steht aus
  und liegt ausserhalb dieses Builds.

## Next Phase

Nach Nutzen sortiert, nicht nach Aufwand:

1. **Intrinio Developer Sandbox anfragen** (kostenlos) und Gate A + C gegen
   echte Dow-30-Daten laufen lassen. Liefert die ersten
   `RUNTIME_VERIFIED`-Befunde des Projekts und prueft nebenbei, ob der
   Pruefstand an echten Daten funktioniert.
2. **Sharadar-Lizenzfrage klaeren.** Professionelle Nutzer muessen ueber
   Nasdaq Data Link beziehen; eine oeffentliche Website ist mit hoher
   Wahrscheinlichkeit professionelle Nutzung. Ohne diese Antwort ist jede
   Kostenrechnung gegenstandslos.
3. **Primaerdokumentation direkt lesen**, sobald eine Umgebung ohne
   Egress-Beschraenkung verfuegbar ist. Hebt mehrere Befunde von
   `THIRD_PARTY_REPORTED` auf `DOCUMENTATION_VERIFIED` und koennte Gate B bei
   Sharadar schliessen.
4. **Erst dann** ein bezahlter Sharadar-Monat (Full History Bundle) fuer alle
   drei Gates. Die 5-Jahres-Variante reicht nicht: Gate A und B brauchen
   Restatement- und Delisting-Faelle im Zeitraum.
5. **Danach Kapitalmassnahmen als erste produktive Datenklasse** - nicht
   Fundamentaldaten. Ohne Dividendenereignisse bleiben die Kursreihen
   splitbereinigt, und ohne Total Return gibt es keine Renditeaussage.

**Weiterhin offen aus Phase 2:** die drei Veroeffentlichungsfragen der
Lizenzcheckliste, LOW-2 und LOW-3 (Barrierefreiheit der Tabellen).

Details in `docs/VU_PHASE3_IMPLEMENTATION_REPORT.md`.
