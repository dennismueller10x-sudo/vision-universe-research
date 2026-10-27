# V7 – Datenerschließung

6.191 Dateien = 6.190 Listingkandidaten + eine Metadatei. Bestehender Wochenadapter: 4.451 qualifiziert, 1.739 ausgeschlossen. „Qualifiziert“ bezeichnet nur dessen Preis-/Identitätsvertrag, keine vollständige Common-Stock- oder PIT-Qualifikation. [Komprimiertes Inventar](v7/source-inventory.json.gz) bindet jede Datei an Messwerte/Gründe und Hashes.

Ausschlüsse: {"INSUFFICIENT_HISTORY": 439, "MISSING_WEEKS": 218, "CORPORATE_ACTION_UNRESOLVED": 600, "INELIGIBLE_EQUITY_LISTING": 295, "AMBIGUOUS_LISTING_IDENTITY": 180, "INACTIVE_LISTING_TERMINAL_VALUE_UNVERIFIED": 4, "LISTING_IDENTITY_MISMATCH": 3}.

| Lücke | Tatsächlicher Fortschritt | Verbleibende Grenze |
|---|---|---|
| D01 | Vollständiger vorhandener Wochenbestand gegen unveränderten Listingadapter; 180 mehrdeutige IDs getrennt | Keine historische MIC-/Ticker-/Klassenrekonstruktion. Systematische 40er-Probe enthielt FRMEP/MBINM als Common trotz zweifelhafter Gattung; nicht als Common-Marktstudie übernommen. Keine quellengesicherte Masterkorrektur möglich. |
| D02 | Vier inaktive Listings unverändert ohne Performanceausgabe | Keine neuen belegten terminalen Werte; kein Null-/Last-Price-Fallback |
| D03 | Maximale vorhandene Wochenhistorien genutzt | 218 Dateien mit Wochenlücken; keine Interpolation oder damalige Provider-Vintagebehauptung |
| D04 | Bestehende CA-Prüfung angewandt | 600 ungelöste CA-Dateien unverändert ausgeschlossen; kein neuer TR-/Spezial-CA-Nachweis |
| D05 | Bedingte feste Referenzkohorte explizit modelliert | Heutige Auswahl keine damalige Markt-/Indexpopulation |
| D06 | Gespeicherte qualitätsgeprüfte SEC-Zeilen nach Accession und available_from erschlossen | Consumer as_of_latest bleibt ungeeignet als vollständige Vintagequelle; acht Original-XBRL-Dateien separat wiedergewonnen; vollständiges Vintagearchiv fehlt |
| D07 | 104 eingeschränkte Margenquerschnitte aus vier SEC-Beispielen | Formel ausdrücklich neue Rekonstruktion, keine historische VU-Veröffentlichung; Faktorarchive zu jung |
| D08 | 97 gespeicherte SEC-Verfügbarkeitsereignisse mit realen Preisoutcomes | Keine Earningszeiten; eine Original-Acceptance-Gegenprobe, keine vollständige Ereigniszeitprüfung |
| D09 | Ex-post SPY-Trend/Volatilität und Episoden ausgewertet | Kein Ersatz des aktiven PIT-Regimearchivs |
| D10 | Bestehenden SPY-Preisvertrag genutzt | Nur exakte Schnittmenge; kein TR-/FX-Zusatznachweis |
| D11 | Kosten-/Delayraster und drei finanziell abgestimmte Preisportfolios | Keine beobachteten historischen Spreads, Brokerkonditionen oder Kapazitätsnachweise |
| D12 | Betrachtete Intervalle im Expositionsledger; erneute Holdoutregistrierung abgewiesen | Keine nachweislich unberührte Bestätigung |
| D13 | Nur vorhandene private Repositorybestände, keine Tiingo-/Marketstack-Abrufe, begrenzter SEC-Original-PoC, keine Raw-Publikation | Bestehende Rechte nicht erweitert; Marketstack-Europa-Displaygrant nicht für neue US-Historie umgedeutet |

Zusätzliche Datengewinnung bedeutet hier Erschließung bereits gespeicherter Accession-/Verfügbarkeitsinformationen und Preisoutcomes. Acht Original-XBRL-Dateien (71.997.151 Bytes) wurden gezielt von SEC EDGAR wiedergewonnen; alle 23 geprüften Werte stimmen überein. Kein Lifecyclefeed, Terminal-Cashflow oder vollständiges Provider-Vintagearchiv wurde beschafft. Keine der globalen D01–D13-Lücken gilt vollständig geschlossen. Studienbezogene Coverage und Rechenbarkeit wurden verbessert.

GitHub nennt SEC-/Discover-Caches und verschlüsselte Tiingo-Caches; die aktuelle Sitzung hat keine Provider-/R2-/Entschlüsselungscredentials. Release-Candidate ist Siteauslieferung. Kein Workflow gestartet, kein Cache umbenannt oder zerstört. Tiingo-Budgetdatei nennt konservative interne Grenzen 100/min, 5.000/h, 50.000/Tag ausdrücklich nicht als verifiziertes Providerkontingent. Null Tiingo-/Marketstack-Requests, 22 SEC-HTTP-Zugriffe insgesamt (inklusive drei falscher Agent-CIK-Pfade und drei initialer Primärquellenproben), null Käufe, null Vertragsänderungen. Der abschließende Offline-Replay verwendete null Requests. Vorhandene Rechte sind keine neue globale Sperrregel.

## Wiedergewonnene SEC-Originale

[Primärquellenbeleg](v7/sec-original-recovery.json): acht anhand der tatsächlichen Verfügbarkeitszeit gewählte früheste/späteste gespeicherte Jahres-Accessions von JPM/MSFT/NVDA/XOM. Alle 23 verfügbaren jährlichen Umsatz-/Operating-Income-Zeilen stimmen mit dimensionsfreien Original-XBRL-Kontexten, gleicher Periode und Einheit überein. Die vier Rohdateien über der anfänglichen konservativen 6-MiB-Dateischwelle wurden nach Größenprüfung innerhalb eines expliziten privaten 80-MiB-Gesamtbudgets ebenfalls geladen; insgesamt 71.997.151 Bytes. Maximal acht Accessions, bestehender SEC-Client mit Cache und 2 Requests/Sekunde, keine Retries. Kein neuer globaler Block. Die Rohdateien bleiben privat.

Der NVDA-Originalheader bestätigt `2026-02-25 16:42:19 America/New_York` = `2026-02-25T21:42:19.000Z`. Das ist eine SEC-Acceptancezeit, keine Earnings-Release-Zeit. Archivpfade verwenden die Emittenten-CIK aus dem vorhandenen Profil; der Accessionpräfix kann eine Filing-Agent-CIK sein. Die Recovery korrigiert diese zunächst fehlgeschlagene Pfadableitung und die anfänglich lexikographische statt zeitliche Accessionauswahl. Beide waren Fehler der neuen Recovery, keine behaupteten V6-Fehler.

Damit ist ein konkreter Teil von D06/D08 quellengestützt nachgeprüft. Es bleibt eine gezielte Originalstichprobe, keine vollständige erste Veröffentlichungs-/Restatementhistorie. Die bestehenden 104 Querschnitte und 97 Ereignisse werden dadurch nicht pauschal unabhängig oder voll PIT-zertifiziert.
