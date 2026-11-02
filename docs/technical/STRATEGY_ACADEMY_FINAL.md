# Strategie-Akademie · finale Integrationsabnahme

Stand 02.11.2026. **Owner-Freigabe für T-1, #1245, #1253 und die reguläre Veröffentlichung ist erteilt. #1245 wurde als `3fd744602303f1082c8155fe03e1a408ddaf0601` in main gemergt. #1253 ist auf main umgestellt und mit `24ac646362e92ca5b3fd4c69dcf5f227c4690840` konfliktfrei abgeglichen.** Umsetzung und fachliches Audit sind abgeschlossen. Dies ist der konkrete Abnahmebeleg, kein weiterer Entwicklungsplan.

## Fertiger Stand

Eine Experience `technical-strategies` in der bestehenden Welt `strategies-factors-evidence`. Zentrale Frage und Weltkarte öffnen beide **dieselbe** Akademie `/technical/#/akademie`. Ein Rücklink führt zur zentralen Academy. Es gibt keine zweite Inhaltsdatei, keinen zweiten Fortschrittsspeicher, kein zweites Glossar und keine neue Berechnungsengine. Alle 32 Lektionen sind bytegleich mit dem abgeschlossenen Audit (SHA-256 `9943986cccc9cd8f74d9dc8ff91312678241bc33f71462205b643f058782852c`).

#1252 war ausschließlich Planung und ist durch #1253 abgelöst, **ohne Merge geschlossen**. Sein Branch und Dokument bleiben erhalten. Die dort vorgeschlagene alternative Acht-Einheiten-Entwicklung wird nicht zusätzlich gebaut. Der vorhandene Pilot „Follow the Money“ bleibt registriert und seine Engine unverändert.

## Integrationsnachweis

- #1245: offen, Kopf `97b15816089c91e28c577c5c24c5f3a2e4c6f66b`; unverändert übernommen, kein Commit auf den Claude-Branch.
- #1253: eigener Implementierungsbranch, weiterhin gegen den Assistenten-Branch gestapelt.
- Tatsächlich geprüfter Gesamtstand: main `f53e50451566f72002a5e47eb00721741dff0bf9` → lokaler Test-Merge #1245 → lokaler Test-Merge #1253. Konfliktfrei. Das sind isolierte Integrationsproben, keine Merges auf den Remote-main.
- main rückte während der Prüfung auf `7d940e4ad0f74f76ae59887c48f5d981c187f562` vor. Academy-, Technical-, Core-, Engine- und globale UI-Quelldateien blieben gegenüber der geprüften Basis identisch; fremde Datenläufe werden nicht in den PR übernommen.
- Keine Überschneidung mit beobachteter paralleler Entwicklung: #1251 betrifft Vorlagen, #1258 die globale Navigation/Konten, #1248 den Masterbericht. Diese Pfade werden nicht konkurrierend geändert. Nicht veröffentlichte Arbeitsstände auf fremden Runnern sind nicht einsehbar; die betroffenen Claude-Branches bleiben unangetastet.
- Keine Änderungen an Quant, Supertrader, Security Master, Kursdaten, Formeln, Strategieregeln oder Fachdefinitionen. Produktionspfade im PR und in der Integrationsprobe sind unverändert gegenüber ihrer jeweiligen Basis.

Exakte Commit-/Tree-Kennungen und Prüfzahlen: [integration-proof.json](academy-final-qa/integration-proof.json).

## Bestandene Prüfungen

| Prüfung | Ergebnis |
|---|---|
| Technical, einschließlich Academy-/Audit-/Integrationstests | 83/83 |
| Vorhandene zentrale Academy-Engine | 8/8 (gemeinsamer Lauf 91/91) |
| Core | 308/308 |
| Technical-/TI-Engines | 574/574 |
| Erweiterte Browserprüfung des integrierten Standes | 70/70 |
| Bisherige Technical-Browserprüfung | 66/66 |
| Testisolation / Schutzpfade / Whitespace | ohne Befund |

Browser: Chromium/Playwright, 360/390/1280 px, hell/dunkel. 192 Lektionsansichten und 192 Praxis-/Rückkehrwege. Dazu **18 vollständige Nutzerreisen** über Trendfolge, Momentum und Multi-Timeframe: zentrale Academy → Welt → Lernpfad/Lektion → Quiz → Analyseziel → Screener mit echter Trefferliste → Chart eines echten Treffers → Rücklink zur Lektion → Quiz wiederherstellen → Abschluss speichern → Reload → Abschluss im Katalog nachweisen. Verwendete Treffer stehen im [Browserbericht](academy-final-qa/report.json), ohne Empfehlung oder Performancebehauptung.

48 Axe-Prüfungen der gemeinsamen Lektionsansichten und der betroffenen zentralen Einstiege/Pilotkarte: keine A/AA-Verstöße. Tastatur, Touchflächen, Glossar, leere Quizantwort, Versionswechsel, Antwortwechsel, Speicherblockade, Ladefehler, beschädigte Daten und Wiederholen sind geprüft. Die neu integrierte dunkle Einstiegseite erhielt gezielte Kontrastkorrekturen; keine globale Neugestaltung. Ein Screenshot-Rennen mit der asynchronen Wiederherstellung der Leseposition wurde durch Warten auf den tatsächlichen Renderzyklus behoben, ohne eine Funktionsprüfung zu entfernen.

Lokales Mobilprofil: CPU ×4, 150 ms Latenz, 1,6 Mbit/s, leerer Cache. Exakte Ladezeiten im Prüfbeleg; der Kursinhalt wird pro Dokument nur einmal geladen. Dies sind lokale Messungen, keine Produktions-LCP-Zusage. Der 15-Sekunden-Abbruchwert ist eine Fehlerschranke, kein Qualitätsziel.

## Live-Ausgangsstand vor der Owner-Freigabe

Im echten Browser wurde die Produktion unter `https://research.visionuniverse.de` geprüft. Ohne Anmeldung erscheint das Zugangstor; ein angemeldeter produktiver Nutzerweg wird nicht behauptet. Die öffentlich ausgelieferte Academy-Registry führt „Follow the Money“ als verfügbar und die beiden bisherigen weiteren Piloten als geplant. **Die Strategie-Akademie und der Analyse-Assistent sind noch nicht ausgeliefert:** `/technical/academy/content.json` und `/technical/engine/assistant.js` liefern HTTP 404. Die vollständigen Nutzerwege wurden daher auf der tatsächlichen integrierten Testversion ausgeführt, nicht auf einem Mockup.

Nachweise: [Browser-Liveprobe](academy-final-qa/academy-live-probe.json), [ausgelieferte Dateien](academy-final-qa/academy-live-assets.json), [Zugangstor-Screenshot](academy-final-qa/production-access-gate.png). Es wurde weder das Zugangstor umgangen noch ein Produktiv-Deployment ausgeführt. Das Vercel-Build-Ratenlimit wird separat von Codefehlern bewertet; keine Tarifänderung oder Umgehung.

## Freigegebene Veröffentlichung und Live-Abnahme

Die gebündelte Owner-Freigabe liegt vor; eine erneute Freigabe ist nicht erforderlich. #1245 ist gemergt. Vor #1253 werden die relevanten Tests und Schutzprüfungen auf dem aktualisierten main erneut ausgeführt; danach erfolgen nur der freigegebene Merge und die reguläre Pages-Veröffentlichung. Der aktuelle Veröffentlichungs- und Live-Prüfstatus wird am PR #1253 mit den konkreten Workflow-Links dokumentiert.

Die vorhandene `Technical Live-QA` führt zusätzlich die bestehenden Academy-Nutzerwege mit `--site https://research.visionuniverse.de` aus. Der bereits eingerichtete `RESEARCH_ACCESS_PASSWORD` wird ausschließlich innerhalb der autorisierten GitHub-Testausführung über den bestehenden Access-Gate-Helper verwendet; Werte werden weder protokolliert noch als Artefakt exportiert. Es gibt keine Änderung am Zugangstor, an Secrets oder an Zertifizierungsgates.

Die Live-Ausführung prüft zuerst, dass der veröffentlichte Lektionsinhalt semantisch dem geprüften Quellstand entspricht. Sie führt 67 produktive Browserprüfgruppen aus, darunter alle 18 vollständigen Nutzerreisen sowie alle 32 Lektionen in sechs Bildschirm-/Designkombinationen. Drei absichtlich fehlerinjizierende beziehungsweise künstlich gedrosselte Prüfgruppen bleiben dem vollständigen lokalen 70er-Lauf vorbehalten und sind im Live-Bericht ausdrücklich als lokal aufgeführt. Sämtliche Browseränderungen betreffen ausschließlich isolierte Test-Browserspeicher, nicht Konten oder Produktionsdaten. Live-Berichte und Screenshots werden im vorhandenen Workflow-Artefakt `technical-live-qa/academy` aufbewahrt.

Physisches iPhone/Safari wurde nicht getestet. Die ergänzende Hardware-Prüfliste bleibt in der Abnahmevorlage.
