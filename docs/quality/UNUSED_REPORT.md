# Ungenutzte Dateien – E7

Analysierter Commit: `a5dd55cf86db673d132a16d3e85acfe2175d20e2`.

## Methode und Grenzen

Aufruf: `node scripts/quality/find-unused.mjs [--out DATEI] [--live-evidence DATEI]`.

Alle versionierten Dateien sind Graphknoten. HTML (script/link/fetch und Navigation), Code (require/import/export/fetch), CSS, Tests, package.json, YAML-Workflows einschließlich mehrzeiliger run-Blöcke und die Registries liefern Kanten. Literale, Kommentare, Verzeichnisse und Globs zählen vorsorglich als Verweis; Selbstverweise zählen nicht. Relative Pfade, Root-Pfade, Query/Hash, Indexseiten und mehrdeutige Dateinamen werden aufgelöst. Fremde URLs zählen nicht als lokale Verweise.

Die Einzelliste umfasst alle Dateien außerhalb der geschützten Bereiche, auch Konfiguration, Dokumentation und Evidence. Daten, Assets, App, Account-Worker, Forschung und Recht bleiben geschützt. Konfiguration und Dokumentation liefern zusätzliche Verweise. Dateninhalte und Binärdateien werden nicht als Quelltext gelesen. Dies ist eine Eingangsgrad-Analyse, keine Erreichbarkeitsanalyse: unbenutzte Zyklen werden nicht erkannt. Dynamische Pfade, Shell-Variablen, HTML-base, externe Aufrufe, Bookmarks und andere Deployments sind nicht vollständig beweisbar.

Knoten: 86704; gelesene Textquellen: 10346; Dateien außerhalb Tabu: 17513 (davon 8106 Code/Seiten/Skripte); davon ohne eingehende Verweise: 1; nur breite Verzeichnis-/Glob-Verweise: 1295; geschützte Knoten ohne Verweise: 0 (keine Löschkandidaten).

**Keine automatische Löschfreigabe.** Fehlender Verweis, ein 404 oder Ausschluss vom Pages-Build allein beweist keine Nichtnutzung. Bei Zweifel bleibt die Datei.

## Auslieferung und benannte Bereiche

`pages-release.yml` baut mit `scripts/vu2/build-release.mjs`: `permitted()` kopiert grundsätzlich alle zugelassenen getrackten Dateien, einschließlich alter Seiten und evidence. scripts/docs/providers, Tests und bestimmte Daten werden ausgeschlossen. Der Build erzeugt `/vu2/` und `/Quant/` zusätzlich als Redirect nach `/quant/`. Ein ausgelieferter Pfad kann direkt aufgerufen werden, auch ohne internen Link.

Größenvergleich gegen `e3e43e723a59ad53507989f7c61e7b03177b24c3`; getrackte Dateibytes, ohne Git-Historie. Neue Analysewerkzeuge zählen zur Nachher-Größe von scripts/.

| Bereich | Dateien nachher | Bytes vorher | Bytes nachher | Entscheidung |
|---|---:|---:|---:|---|
| vu2/ | 1 | 401 | 401 | Redirect wird im Release erzeugt; behalten. |
| discover-v2/ | 1 | 837 | 837 | Legacy-Redirect nach /discover/; behalten. |
| dashboard/ | 664 | 3878941 | 3878941 | Aktive Datenquellen laut domains.json, Seiten laden app-rebuild.js; behalten. |
| worker-waker/ | 4 | 60308 | 60308 | Eigenes Cloudflare-Deployment und Workflow-Tests; behalten. |
| landing/review/ | 37 | 8361739 | 8361739 | CI erwähnt den Review-Pfad; Live-404 genügt nicht; behalten. |
| evidence/ | 54 | 1026077 | 1026077 | Audit-/Auslieferungsbelege und grundsätzlich im Pages-Build; behalten. |
| scripts/ | 1844 | 28285874 | 28307410 | Workflow-/Test-/Registry-Aufrufe schützen; übrige Einträge unten unsicher. |

Live-Stichprobe: 2026-11-06T13:19:17.451215+00:00, https://research.visionuniverse.de. Keine vollständige Browser-Netzwerkaufzeichnung.

| Pfad | HTTP / Fehler | Ziel / Befund |
|---|---|---|
| /vu2/ | 200 | Research-Zugangssperre, Inhalt: /__research/content/vu2/index.html?v=f70550deb4b534f8;  |
| /discover-v2/ | 200 | Research-Zugangssperre, Inhalt: /__research/content/discover-v2/index.html?v=431ccc1816adf229;  |
| /dashboard/ | 200 | Research-Zugangssperre, Inhalt: /__research/content/dashboard/index.html?v=39466308730012ba;  |
| /worker-waker/src/index.mjs | 200 | https://research.visionuniverse.de/worker-waker/src/index.mjs;  |
| /landing/review/ | HTTP Error 404: Not Found | ;  |
| /evidence/company-intelligence-profiles-production-20261012.json | 200 | https://research.visionuniverse.de/evidence/company-intelligence-profiles-production-20261012.json;  |
| /release-delivery.json | 200 | Release-Commit a7441245df2e5530afb2fccfc8c9579e8cf7b916;  |

HTTP 200 bei HTML kann die Zugangssperre statt des ursprünglichen Inhalts sein. Live-Release und Analyse-Commit können abweichen. Deshalb keine Nichtnutzung daraus ableiten.

Pages-Artefakt: [Lauf 42221591086](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/42221591086), ID 13503294112, 742516384 Bytes. Not inspected: connector limit 536870912 bytes; CLI signed download returned HTTP 403.

## Sicher ungenutzt / entfernt

Keine Datei erfüllt derzeit einen belastbaren Nichtnutzungsnachweis. Entfernte Dateien: keine. Eingesparte Bytes: 0. Keine Registry-/Workflow-/Test-Verweise wurden entfernt oder abgeschwächt.

## Unsicher – Dateien ohne eingehende Verweise

| Datei | Bytes | Begründung / Entscheidung |
|---|---:|---|
| .claude/skills/reel-studio/SKILL.md | 1227 | Keine statische eingehende Kante; direkte URL, dynamisches Laden oder eigenes Deployment nicht ausgeschlossen; behalten. |

## Unsicher – nur breite Verzeichnis-/Glob-Verweise

Ein Verzeichnisverweis oder CI-Pfadfilter beweist keinen ausgeführten Einzelaufruf. Diese Dateien haben Graphkanten, aber keinen konkreten Dateiverweis. Auch hier keine Löschfreigabe.

| Datei | Bytes | Begründung / Beispiel |
|---|---:|---|
| ask/tests/ask-engine.test.mjs | 7978 | Nur breite Kanten, z. B. .github/workflows/ci.yml; Nutzung unklar; behalten. |
| authoring/requests/vu-xom-20260911/REVISION-PROPOSAL.md | 3424 | Nur breite Kanten, z. B. .github/workflows/ci.yml; Nutzung unklar; behalten. |
| brand-media/higgsfield/test_higgsfield.py | 21942 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/higgsfield/test_images.py | 7869 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/kanal-2/fonts/README.md | 308 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/kanal-2/image-jobs/aktienzoo-icons-1.json | 10590 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/kanal-2/image-jobs/aktienzoo-icons-2-outfits.json | 9727 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/kanal-2/image-jobs/aktienzoo-icons-3.json | 2819 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/kanal-2/image-jobs/aktienzoo-posen-baer-1.json | 10900 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/kanal-2/image-jobs/aktienzoo-posen-bulle-1.json | 10965 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/kanal-2/profil/KANAL.md | 1659 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/kanal-2/reels/2026-10-28-broker-pleite/README.md | 737 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/kanal-2/reels/2026-10-28-broker-pleite/caption-tiktok.txt | 587 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/kanal-2/reels/2026-10-28-broker-pleite/cover.jpg | 372567 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/kanal-2/reels/2026-10-28-buffett-zeit/README.md | 1795 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/kanal-2/reels/2026-10-28-buffett-zeit/caption-tiktok.txt | 570 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/kanal-2/reels/2026-10-28-buffett-zeit/cover.jpg | 396009 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/kanal-2/reels/2026-10-28-etf-sparplan-v2/README.md | 1685 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/kanal-2/reels/2026-10-28-etf-sparplan-v2/caption-instagram.txt | 781 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/kanal-2/reels/2026-10-28-etf-sparplan-v2/caption-tiktok.txt | 594 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/kanal-2/reels/2026-10-28-etf-sparplan-v2/cover.jpg | 282150 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/kanal-2/reels/2026-10-28-etf-sparplan/README.md | 1653 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/kanal-2/reels/2026-10-29-bitcoin-pizza/README.md | 801 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/kanal-2/reels/2026-10-29-bitcoin-pizza/caption-instagram.txt | 735 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/kanal-2/reels/2026-10-29-bitcoin-pizza/caption-tiktok.txt | 560 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/kanal-2/reels/2026-10-29-bitcoin-pizza/cover.jpg | 403806 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/kanal-2/reels/2026-10-29-millionaer-etf/README.md | 749 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/kanal-2/reels/2026-10-29-millionaer-etf/caption-instagram.txt | 803 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/kanal-2/reels/2026-10-29-millionaer-etf/caption-tiktok.txt | 626 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/kanal-2/reels/2026-10-29-millionaer-etf/cover.jpg | 397848 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/kanal-2/reels/2026-10-29-zoo-ticker-1/README.md | 1380 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/kanal-2/reels/2026-10-29-zoo-ticker-1/caption-instagram.txt | 965 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/kanal-2/reels/2026-10-29-zoo-ticker-1/caption-tiktok.txt | 348 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/kanal-2/reels/2026-10-29-zoo-ticker-1/cover.jpg | 409439 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/kanal-2/reels/2026-10-30-amazon-capex/README.md | 1170 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/kanal-2/reels/2026-10-30-amazon-capex/caption-instagram.txt | 872 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/kanal-2/reels/2026-10-30-amazon-capex/caption-tiktok.txt | 309 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/kanal-2/reels/2026-10-30-amazon-capex/cover.jpg | 415637 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/kanal-2/reels/2026-10-30-zoo-ticker-2/README.md | 1279 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/kanal-2/reels/2026-10-30-zoo-ticker-2/caption-instagram.txt | 990 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/kanal-2/reels/2026-10-30-zoo-ticker-2/caption-tiktok.txt | 322 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/kanal-2/reels/2026-10-30-zoo-ticker-2/cover.jpg | 413318 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/kanal-2/reels/2026-10-31-kurz-intel-staat/README.md | 1186 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/kanal-2/reels/2026-10-31-kurz-intel-staat/caption-instagram.txt | 632 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/kanal-2/reels/2026-10-31-kurz-intel-staat/caption-tiktok.txt | 291 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/kanal-2/reels/2026-10-31-kurz-intel-staat/cover.jpg | 444754 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/kanal-2/reels/2026-11-01-kurz-midterms/README.md | 860 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/kanal-2/reels/2026-11-01-kurz-midterms/caption-instagram.txt | 637 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/kanal-2/reels/2026-11-01-kurz-midterms/caption-tiktok.txt | 314 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/kanal-2/reels/2026-11-01-kurz-midterms/cover.jpg | 384910 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/kanal-2/reels/2026-11-02-dialog-google-apple-v2/README.md | 1020 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/kanal-2/reels/2026-11-02-dialog-google-apple-v2/audio.py | 5432 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/kanal-2/reels/2026-11-02-dialog-google-apple-v2/caption-instagram.txt | 708 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/kanal-2/reels/2026-11-02-dialog-google-apple-v2/caption-tiktok.txt | 312 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/kanal-2/reels/2026-11-02-dialog-google-apple-v2/cover.jpg | 413353 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/kanal-2/reels/2026-11-02-dialog-google-apple/README.md | 1039 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/kanal-2/reels/2026-11-02-dialog-google-apple/audio.py | 5432 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/kanal-2/reels/2026-11-02-kurz-google-apple/README.md | 953 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/kanal-2/reels/2026-11-02-kurz-google-apple/caption-instagram.txt | 746 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/kanal-2/reels/2026-11-02-kurz-google-apple/caption-tiktok.txt | 313 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/kanal-2/reels/2026-11-02-kurz-google-apple/cover.jpg | 424282 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/kanal-2/reels/2026-11-03-dialog-marvell-lumentum/README.md | 958 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/kanal-2/reels/2026-11-03-dialog-marvell-lumentum/audio.py | 5433 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/kanal-2/reels/2026-11-03-dialog-marvell-lumentum/caption-instagram.txt | 949 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/kanal-2/reels/2026-11-03-dialog-marvell-lumentum/caption-tiktok.txt | 311 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/kanal-2/reels/2026-11-03-dialog-marvell-lumentum/cover.jpg | 402965 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/kanal-2/reels/2026-11-04-dialog-palantir/README.md | 821 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/kanal-2/reels/2026-11-04-dialog-palantir/audio.py | 5433 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/kanal-2/reels/2026-11-04-dialog-palantir/caption-instagram.txt | 784 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/kanal-2/reels/2026-11-04-dialog-palantir/caption-tiktok.txt | 302 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/kanal-2/reels/2026-11-04-dialog-palantir/cover.jpg | 391487 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/kanal-2/reels/2026-11-05-dialog-wahl-rally/README.md | 846 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/kanal-2/reels/2026-11-05-dialog-wahl-rally/audio.py | 5433 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/kanal-2/reels/2026-11-05-dialog-wahl-rally/caption-instagram.txt | 983 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/kanal-2/reels/2026-11-05-dialog-wahl-rally/caption-tiktok.txt | 302 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/kanal-2/reels/2026-11-05-dialog-wahl-rally/cover.jpg | 380642 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/kanal-2/reels/2026-11-06-dialog-ki-crash/README.md | 994 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/kanal-2/reels/2026-11-06-dialog-ki-crash/audio.py | 5433 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/kanal-2/reels/2026-11-06-dialog-ki-crash/caption-instagram.txt | 1059 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/kanal-2/reels/2026-11-06-dialog-ki-crash/caption-tiktok.txt | 314 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/kanal-2/reels/2026-11-06-dialog-ki-crash/cover.jpg | 388592 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/kanal-2/vorlagen/cover/README.md | 1236 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/vu-reels/README.md | 472 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/vu-reels/image-jobs/bildvorrat-1.json | 7052 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/vu-reels/image-jobs/bildvorrat-2.json | 6912 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| brand-media/werbetrailer/keyframes/README.md | 1093 | Nur breite Kanten, z. B. brand-media/higgsfield/README.md; Nutzung unklar; behalten. |
| content/morning/2026-09-04.md | 2817 | Nur breite Kanten, z. B. .github/workflows/content.yml; Nutzung unklar; behalten. |
| content/morning/2026-09-05.md | 3766 | Nur breite Kanten, z. B. .github/workflows/content.yml; Nutzung unklar; behalten. |
| content/morning/2026-09-08.md | 3811 | Nur breite Kanten, z. B. .github/workflows/content.yml; Nutzung unklar; behalten. |
| content/morning/2026-09-09.md | 4342 | Nur breite Kanten, z. B. .github/workflows/content.yml; Nutzung unklar; behalten. |
| content/morning/2026-10-06.md | 4555 | Nur breite Kanten, z. B. .github/workflows/content.yml; Nutzung unklar; behalten. |
| content/morning/README.md | 1564 | Nur breite Kanten, z. B. .github/workflows/content.yml; Nutzung unklar; behalten. |
| core/tests/chart-parity.test.mjs | 2257 | Nur breite Kanten, z. B. .github/workflows/core-ci.yml; Nutzung unklar; behalten. |
| core/tests/chart-standard.test.mjs | 7042 | Nur breite Kanten, z. B. .github/workflows/core-ci.yml; Nutzung unklar; behalten. |
| core/tests/client.test.mjs | 5414 | Nur breite Kanten, z. B. .github/workflows/core-ci.yml; Nutzung unklar; behalten. |
| core/tests/diagnose.test.mjs | 4446 | Nur breite Kanten, z. B. .github/workflows/core-ci.yml; Nutzung unklar; behalten. |
| core/tests/eligibility-gate.test.mjs | 6551 | Nur breite Kanten, z. B. .github/workflows/core-ci.yml; Nutzung unklar; behalten. |
| core/tests/europe-discover-eligibility.test.mjs | 5052 | Nur breite Kanten, z. B. .github/workflows/core-ci.yml; Nutzung unklar; behalten. |
| core/tests/europe-market-data.test.mjs | 21042 | Nur breite Kanten, z. B. .github/workflows/core-ci.yml; Nutzung unklar; behalten. |
| core/tests/europe-refresh-follow.test.mjs | 1982 | Nur breite Kanten, z. B. .github/workflows/core-ci.yml; Nutzung unklar; behalten. |
| core/tests/freshness-monitor-fv8.test.mjs | 2439 | Nur breite Kanten, z. B. .github/workflows/core-ci.yml; Nutzung unklar; behalten. |
| core/tests/git-fixture-isolation.test.mjs | 6249 | Nur breite Kanten, z. B. .github/workflows/core-ci.yml; Nutzung unklar; behalten. |
| core/tests/home-cancel-link.test.mjs | 1874 | Nur breite Kanten, z. B. .github/workflows/core-ci.yml; Nutzung unklar; behalten. |
| core/tests/home-render-budget.test.mjs | 3990 | Nur breite Kanten, z. B. .github/workflows/core-ci.yml; Nutzung unklar; behalten. |
| core/tests/listing-staleness.test.mjs | 8550 | Nur breite Kanten, z. B. .github/workflows/core-ci.yml; Nutzung unklar; behalten. |
| core/tests/long-series-repair.test.mjs | 4780 | Nur breite Kanten, z. B. .github/workflows/core-ci.yml; Nutzung unklar; behalten. |
| core/tests/query-engine.test.mjs | 6996 | Nur breite Kanten, z. B. .github/workflows/core-ci.yml; Nutzung unklar; behalten. |
| core/tests/r2-audit.test.mjs | 1915 | Nur breite Kanten, z. B. .github/workflows/core-ci.yml; Nutzung unklar; behalten. |
| core/tests/sf8-data-quality.test.mjs | 34524 | Nur breite Kanten, z. B. .github/workflows/core-ci.yml; Nutzung unklar; behalten. |
| core/tests/state-gate.test.mjs | 10965 | Nur breite Kanten, z. B. .github/workflows/core-ci.yml; Nutzung unklar; behalten. |
| core/tests/stock-address.test.mjs | 3724 | Nur breite Kanten, z. B. .github/workflows/core-ci.yml; Nutzung unklar; behalten. |
| core/tests/stock-availability.test.mjs | 4518 | Nur breite Kanten, z. B. .github/workflows/core-ci.yml; Nutzung unklar; behalten. |
| core/tests/stock-context.test.mjs | 12766 | Nur breite Kanten, z. B. .github/workflows/core-ci.yml; Nutzung unklar; behalten. |
| core/tests/stock-navigator.test.mjs | 6210 | Nur breite Kanten, z. B. .github/workflows/core-ci.yml; Nutzung unklar; behalten. |
| core/tests/technical-chain.test.mjs | 3725 | Nur breite Kanten, z. B. .github/workflows/core-ci.yml; Nutzung unklar; behalten. |
| core/tests/vu-chart.test.mjs | 3494 | Nur breite Kanten, z. B. .github/workflows/core-ci.yml; Nutzung unklar; behalten. |
| core/tests/watchlist-fetch-published.test.mjs | 2722 | Nur breite Kanten, z. B. .github/workflows/core-ci.yml; Nutzung unklar; behalten. |
| docs/DOKU_INVENTAR.md | 139655 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/audits/vu3-ui-refresh-abschluss-2026-10-21/pltr-drei-welten-desktop__nachher-hell.jpg | 79852 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/audits/vu3-visuelle-bestandsaufnahme-2026-10-21/dashboard-start-desktop.jpg | 46069 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/audits/vu3-visuelle-bestandsaufnahme-2026-10-21/dashboard-start-iphone.jpg | 31319 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/audits/vu3-visuelle-bestandsaufnahme-2026-10-21/elliott-pltr-desktop-ganz.jpg | 96972 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/audits/vu3-visuelle-bestandsaufnahme-2026-10-21/elliott-pltr-desktop.jpg | 75460 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/audits/vu3-visuelle-bestandsaufnahme-2026-10-21/elliott-pltr-iphone.jpg | 39008 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/audits/vu3-visuelle-bestandsaufnahme-2026-10-21/elliott-start-desktop.jpg | 80525 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/audits/vu3-visuelle-bestandsaufnahme-2026-10-21/elliott-start-iphone.jpg | 28051 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/audits/vu3-visuelle-bestandsaufnahme-2026-10-21/fundamental-pltr-desktop-ganz.jpg | 69850 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/audits/vu3-visuelle-bestandsaufnahme-2026-10-21/fundamental-pltr-desktop.jpg | 60655 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/audits/vu3-visuelle-bestandsaufnahme-2026-10-21/fundamental-pltr-iphone.jpg | 31563 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/audits/vu3-visuelle-bestandsaufnahme-2026-10-21/fundamental-start-desktop.jpg | 71504 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/audits/vu3-visuelle-bestandsaufnahme-2026-10-21/fundamental-start-iphone.jpg | 32988 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/audits/vu3-visuelle-bestandsaufnahme-2026-10-21/hedgefonds-pltr-desktop-ganz.jpg | 99644 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/audits/vu3-visuelle-bestandsaufnahme-2026-10-21/hedgefonds-pltr-desktop.jpg | 71451 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/audits/vu3-visuelle-bestandsaufnahme-2026-10-21/hedgefonds-pltr-iphone.jpg | 28907 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/audits/vu3-visuelle-bestandsaufnahme-2026-10-21/hedgefonds-start-desktop.jpg | 56066 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/audits/vu3-visuelle-bestandsaufnahme-2026-10-21/hedgefonds-start-iphone.jpg | 32757 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/audits/vu3-visuelle-bestandsaufnahme-2026-10-21/quant-screener-desktop.jpg | 60486 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/audits/vu3-visuelle-bestandsaufnahme-2026-10-21/screener-start-desktop.jpg | 51125 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/audits/vu3-visuelle-bestandsaufnahme-2026-10-21/screener-start-iphone.jpg | 32943 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/audits/vu3-visuelle-bestandsaufnahme-2026-10-21/screener-treffer-desktop.jpg | 84995 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/audits/vu3-visuelle-bestandsaufnahme-2026-10-21/start-start-desktop.jpg | 83092 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/audits/vu3-visuelle-bestandsaufnahme-2026-10-21/start-start-iphone.jpg | 36039 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/audits/vu3-visuelle-bestandsaufnahme-2026-10-21/supertrader-pltr-desktop-ganz.jpg | 17375 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/audits/vu3-visuelle-bestandsaufnahme-2026-10-21/technik-pltr-desktop-ganz.jpg | 53023 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/audits/vu3-visuelle-bestandsaufnahme-2026-10-21/technik-pltr-desktop.jpg | 74099 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/audits/vu3-visuelle-bestandsaufnahme-2026-10-21/technik-pltr-iphone.jpg | 37785 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/audits/vu3-visuelle-bestandsaufnahme-2026-10-21/technik-start-desktop.jpg | 92860 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/audits/vu3-visuelle-bestandsaufnahme-2026-10-21/technik-start-iphone.jpg | 35751 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/audits/vu3-visuelle-bestandsaufnahme-2026-10-21/vorsorge-start-desktop.jpg | 59078 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/audits/vu3-visuelle-bestandsaufnahme-2026-10-21/vorsorge-start-iphone.jpg | 31821 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/accepted-final-status.json | 1284 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/candidate-adversarial-round2.json | 3723 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/candidate-discover-quant-final.json | 34899 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/candidate-responsive-final.json | 195547 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/candidate-responsive-round2.json | 166635 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/delivery-audit-before.json | 40267 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/production-AAPL-visible.txt | 1320 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/production-ACU-visible.txt | 296 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/production-AFRM-visible.txt | 1746 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/production-ARBE-visible.txt | 982 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/production-BOH-visible.txt | 1331 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/production-CAC-visible.txt | 1617 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/production-CHE-visible.txt | 1539 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/production-NVDA-visible.txt | 1614 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/production-PLTR-visible.txt | 1190 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/production-TK-visible.txt | 843 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/production-TSLA-visible.txt | 1179 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/production-VEON-visible.txt | 799 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/production-XPEV-visible.txt | 707 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/production-consumer-api.json | 7721 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/production-dark.json | 1401 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/production-discover-quant.json | 31118 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/production-full-hashes-and-smoke.json | 7361 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/production-responsive.json | 456228 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/production-routine-report.json | 1559 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/proof-adversarial-final.json | 4359 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/proof-regression-classification.json | 1273 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/proof-responsive-final.json | 455633 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/regression-classification.json | 1273 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/resilience-adversarial-candidate.json | 4358 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/resilience-regression-classification.json | 1273 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/resilience-responsive-candidate.json | 195499 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/screenshots/after-AAPL-1440-dark-chapter.png | 238232 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/screenshots/after-AAPL-1440-dark-viewport.png | 194498 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/screenshots/after-AAPL-390-dark-chapter.png | 184641 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/screenshots/after-AAPL-390-dark-viewport.png | 122403 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/screenshots/after-AAPL-430-dark-chapter.png | 188833 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/screenshots/after-AAPL-430-dark-viewport.png | 126545 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/screenshots/after-NVDA-1440-dark-chapter.png | 265022 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/screenshots/after-NVDA-1440-dark-viewport.png | 187699 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/screenshots/after-NVDA-390-dark-chapter.png | 209482 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/screenshots/after-NVDA-390-dark-viewport.png | 126659 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/screenshots/after-NVDA-430-dark-chapter.png | 212078 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/screenshots/after-NVDA-430-dark-viewport.png | 130363 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/screenshots/after-PLTR-1440-dark-chapter.png | 218903 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/screenshots/after-PLTR-1440-dark-viewport.png | 193457 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/screenshots/after-PLTR-390-dark-chapter.png | 166754 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/screenshots/after-PLTR-390-dark-viewport.png | 126810 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/screenshots/after-PLTR-430-dark-chapter.png | 171001 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/screenshots/after-PLTR-430-dark-viewport.png | 133575 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/screenshots/after-TSLA-1440-dark-chapter.png | 222300 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/screenshots/after-TSLA-1440-dark-viewport.png | 197419 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/screenshots/after-TSLA-390-dark-chapter.png | 175792 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/screenshots/after-TSLA-390-dark-viewport.png | 131642 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/screenshots/after-TSLA-430-dark-chapter.png | 173119 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/screenshots/after-TSLA-430-dark-viewport.png | 136839 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/screenshots/after-XPEV-1440-dark-chapter.png | 157896 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/screenshots/after-XPEV-1440-dark-viewport.png | 177923 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/screenshots/after-XPEV-390-dark-chapter.png | 106217 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/screenshots/after-XPEV-390-dark-viewport.png | 110629 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/screenshots/after-XPEV-430-dark-chapter.png | 109839 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/screenshots/after-XPEV-430-dark-viewport.png | 118522 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/screenshots/before-AAPL-1440-dark-chapter.png | 234143 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/screenshots/before-AAPL-1440-dark-viewport.png | 135601 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/screenshots/before-AAPL-390-dark-chapter.png | 231125 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/screenshots/before-AAPL-390-dark-viewport.png | 97111 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/screenshots/before-AAPL-430-dark-chapter.png | 230356 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/screenshots/before-AAPL-430-dark-viewport.png | 97292 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/screenshots/before-NVDA-1440-dark-chapter.png | 275265 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/screenshots/before-NVDA-1440-dark-viewport.png | 127021 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/screenshots/before-NVDA-390-dark-chapter.png | 275123 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/screenshots/before-NVDA-390-dark-viewport.png | 90169 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/screenshots/before-NVDA-430-dark-chapter.png | 273028 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/screenshots/before-NVDA-430-dark-viewport.png | 91861 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/screenshots/before-PLTR-1440-dark-chapter.png | 180341 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/screenshots/before-PLTR-1440-dark-viewport.png | 134087 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/screenshots/before-PLTR-390-dark-chapter.png | 181792 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/screenshots/before-PLTR-390-dark-viewport.png | 92950 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/screenshots/before-PLTR-430-dark-chapter.png | 181349 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/screenshots/before-PLTR-430-dark-viewport.png | 97255 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/screenshots/before-TSLA-1440-dark-chapter.png | 178675 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/screenshots/before-TSLA-1440-dark-viewport.png | 133753 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/screenshots/before-TSLA-390-dark-chapter.png | 179440 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/screenshots/before-TSLA-390-dark-viewport.png | 91087 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/screenshots/before-TSLA-430-dark-chapter.png | 181749 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/screenshots/before-TSLA-430-dark-viewport.png | 96598 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/screenshots/before-XPEV-1440-dark-chapter.png | 132654 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/screenshots/before-XPEV-1440-dark-viewport.png | 126302 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/screenshots/before-XPEV-390-dark-chapter.png | 128232 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/screenshots/before-XPEV-390-dark-viewport.png | 81881 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/screenshots/before-XPEV-430-dark-chapter.png | 126170 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/screenshots/before-XPEV-430-dark-viewport.png | 90513 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/source-links.json | 17436 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/top46/baseline-fresh-r2-restore.json | 5477 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/top46/baseline-production-approval.json | 586 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/top46/baseline-release-candidate.json | 16812 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/top46/before-after-content.json | 47722 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/top46/candidate-news-delivery-audit.json | 40457 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/top46/failed-restore-diagnosis.json | 1324 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/top46/full-derivative-proof.json | 3538 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/top46/local-fresh-restore-rehearsal.json | 527 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/top46/material-event-review.json | 16964 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/top46/pre-existing-regression-review.json | 730 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/consumer-v2/top46/reviewed-link-check.json | 27771 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/evidence/full-universe-20261010/acceptance.json | 7260 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/evidence/full-universe-20261010/core-baseline.json | 452 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/evidence/full-universe-20261010/scaling.json | 1492 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/production-evidence/live-fast-report.json | 7336 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/company-intelligence/profiles-sources/reviewed-source-fragments.json | 9105 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/design/redesign-2027/img/02-halbleiter-chips.webp | 88220 | Nur breite Kanten, z. B. AGENTS.md; Nutzung unklar; behalten. |
| docs/design/redesign-2027/img/03-rechenzentren-cloud.webp | 104318 | Nur breite Kanten, z. B. AGENTS.md; Nutzung unklar; behalten. |
| docs/design/redesign-2027/img/04-cybersecurity.webp | 99014 | Nur breite Kanten, z. B. AGENTS.md; Nutzung unklar; behalten. |
| docs/design/redesign-2027/img/05-quantencomputing.webp | 92990 | Nur breite Kanten, z. B. AGENTS.md; Nutzung unklar; behalten. |
| docs/design/redesign-2027/img/07-robotik-automation.webp | 63316 | Nur breite Kanten, z. B. AGENTS.md; Nutzung unklar; behalten. |
| docs/design/redesign-2027/img/09-elektromobilitaet.webp | 74922 | Nur breite Kanten, z. B. AGENTS.md; Nutzung unklar; behalten. |
| docs/design/redesign-2027/img/10-autonomes-fahren.webp | 67600 | Nur breite Kanten, z. B. AGENTS.md; Nutzung unklar; behalten. |
| docs/design/redesign-2027/img/12-erneuerbare-energien.webp | 103448 | Nur breite Kanten, z. B. AGENTS.md; Nutzung unklar; behalten. |
| docs/design/redesign-2027/img/14-kernenergie-uran.webp | 247182 | Nur breite Kanten, z. B. AGENTS.md; Nutzung unklar; behalten. |
| docs/design/redesign-2027/img/16-raumfahrt.webp | 45800 | Nur breite Kanten, z. B. AGENTS.md; Nutzung unklar; behalten. |
| docs/design/redesign-2027/img/18-defense-aerospace.webp | 100186 | Nur breite Kanten, z. B. AGENTS.md; Nutzung unklar; behalten. |
| docs/design/redesign-2027/img/19-biotechnologie.webp | 81524 | Nur breite Kanten, z. B. AGENTS.md; Nutzung unklar; behalten. |
| docs/design/redesign-2027/img/29-banken-fintech.webp | 61242 | Nur breite Kanten, z. B. AGENTS.md; Nutzung unklar; behalten. |
| docs/design/redesign-2027/img/32-konsum-marken.webp | 76720 | Nur breite Kanten, z. B. AGENTS.md; Nutzung unklar; behalten. |
| docs/design/redesign-2027/img/39-streaming-gaming.webp | 119256 | Nur breite Kanten, z. B. AGENTS.md; Nutzung unklar; behalten. |
| docs/design/redesign-2027/img/41-oel-gas.webp | 146888 | Nur breite Kanten, z. B. AGENTS.md; Nutzung unklar; behalten. |
| docs/design/redesign-2027/img/52-software-it.webp | 64274 | Nur breite Kanten, z. B. AGENTS.md; Nutzung unklar; behalten. |
| docs/design/redesign-2027/img/atlas-v1-thumb.jpg | 16529 | Nur breite Kanten, z. B. AGENTS.md; Nutzung unklar; behalten. |
| docs/design/redesign-2027/img/discover-v1-thumb.jpg | 35554 | Nur breite Kanten, z. B. AGENTS.md; Nutzung unklar; behalten. |
| docs/design/redesign-2027/img/discover-v1.jpg | 63550 | Nur breite Kanten, z. B. AGENTS.md; Nutzung unklar; behalten. |
| docs/design/redesign-2027/img/elliott-v1-thumb.jpg | 8626 | Nur breite Kanten, z. B. AGENTS.md; Nutzung unklar; behalten. |
| docs/design/redesign-2027/img/fundamental-v1-thumb.jpg | 19656 | Nur breite Kanten, z. B. AGENTS.md; Nutzung unklar; behalten. |
| docs/design/redesign-2027/img/hedgefonds-v1-thumb.jpg | 21095 | Nur breite Kanten, z. B. AGENTS.md; Nutzung unklar; behalten. |
| docs/design/redesign-2027/img/quant-v1-thumb.jpg | 17684 | Nur breite Kanten, z. B. AGENTS.md; Nutzung unklar; behalten. |
| docs/design/redesign-2027/img/supertrader-v1-thumb.jpg | 13205 | Nur breite Kanten, z. B. AGENTS.md; Nutzung unklar; behalten. |
| docs/design/redesign-2027/img/technical-v1-thumb.jpg | 14127 | Nur breite Kanten, z. B. AGENTS.md; Nutzung unklar; behalten. |
| docs/design/redesign-2027/img/vorsorge-v1-thumb.jpg | 8844 | Nur breite Kanten, z. B. AGENTS.md; Nutzung unklar; behalten. |
| docs/design/redesign-2027/now/crop-dock-disc-home-0.jpg | 4854 | Nur breite Kanten, z. B. AGENTS.md; Nutzung unklar; behalten. |
| docs/design/redesign-2027/now/crop-dock-elliott-home-0.jpg | 3506 | Nur breite Kanten, z. B. AGENTS.md; Nutzung unklar; behalten. |
| docs/design/redesign-2027/now/crop-dock-fund-home-0.jpg | 4212 | Nur breite Kanten, z. B. AGENTS.md; Nutzung unklar; behalten. |
| docs/design/redesign-2027/now/crop-dock-hf-home-0.jpg | 4181 | Nur breite Kanten, z. B. AGENTS.md; Nutzung unklar; behalten. |
| docs/design/redesign-2027/now/crop-dock-quant-home-0.jpg | 3695 | Nur breite Kanten, z. B. AGENTS.md; Nutzung unklar; behalten. |
| docs/design/redesign-2027/now/crop-dock-st-home-0.jpg | 3891 | Nur breite Kanten, z. B. AGENTS.md; Nutzung unklar; behalten. |
| docs/design/redesign-2027/now/crop-dock-tech-home-0.jpg | 4089 | Nur breite Kanten, z. B. AGENTS.md; Nutzung unklar; behalten. |
| docs/design/redesign-2027/now/crop-dock-vs-home-0.jpg | 3446 | Nur breite Kanten, z. B. AGENTS.md; Nutzung unklar; behalten. |
| docs/design/redesign-2027/tools/series.js | 910 | Nur breite Kanten, z. B. AGENTS.md; Nutzung unklar; behalten. |
| docs/market-validation/.gitignore | 9 | Nur breite Kanten, z. B. .github/workflows/pipeline-daily.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| docs/mobile/e5/final/accessibility-code-overlay.json | 10374 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/mobile/e5/final/accessibility-head-delivery.json | 113958 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/mobile/e5/final/app-feel-code-overlay.json | 10374 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/mobile/e5/final/app-feel-head-delivery.json | 113958 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/mobile/e5/final/baseline-code-overlay.json | 8879 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/mobile/e5/final/discover-browser.json | 130483 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/mobile/e5/final/fundamental-compare.json | 14741 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/mobile/e5/final/loading-code-overlay.json | 9955 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/mobile/e5/final/supertrader-browser.json | 8085 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/quant-recovery/v11/discovery/oracle-validation-1.0.0.json | 74367 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/quant-recovery/v12/indexpop/price-plausibility-1.1.0.json | 2002 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/quant-recovery/v12/indexpop/quarter-prices-1.1.0.json.gz | 540932 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/quant-recovery/v12/largecap/identity-cases-1.0.0.json | 33794 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/quant-recovery/v12/listref/verification-adjudication-1.0.2.json | 1736 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/quant-recovery/v12/spxpop/periods-1.0.1.json | 481152 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/quant-recovery/v12/spxpop/periods-1.1.1.json | 484891 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/quant-recovery/v12/spxpop/summary-1.0.1.json | 5081 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/quant-recovery/v12/spxpop/validation-1.0.1.json | 50890 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/quant-recovery/v13/delisted/protocol-amendment-1.0.2.sha256 | 65 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/quant-recovery/v13/delisted/study-registration-1.0.0.sha256 | 65 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/quant-recovery/v13b/f1w/study-registration-2.0.0.sha256 | 96 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/quant-recovery/v13b/hist/spx-terminal-rules-1.0.0.sha256 | 96 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/quant-recovery/v13b/hist/spx-terminal-rules-1.0.1.sha256 | 96 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/quant-recovery/v13c/study-amendment-3.0.2.sha256 | 93 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/quant-recovery/v13c/study-registration-3.0.0.sha256 | 96 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/quant-recovery/v51/browser.json | 12217 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/quant-recovery/v51/coverage-inventory.json | 434 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/quant-recovery/v51/public-build.json | 831 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/quant-recovery/v6-securement/browser.json | 12524 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/quant-recovery/v6-securement/data-validation.json | 34005 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/quant-recovery/v6-securement/invariance.json | 10461 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/quant-recovery/v6-securement/materialization.json | 1108 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/quant-recovery/v6-securement/predecessors.json | 2415 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/quant-recovery/v6-securement/reader.json | 3100 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/quant-recovery/v6-securement/resume.json | 1089 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/quant-recovery/v6-securement/technical-manifest.json | 5984 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/quant-recovery/v9-followups/ledger/before-after.json | 33224 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/quant-recovery/v9-followups/pzza-split/independent_check.py | 4405 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/quant-recovery/v9-followups/sec-pipeline/quarantine-detection.json | 9001 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/quant/backtest-catalog/results/10b1a254f1be090d2ae11cbb043f3e37678ee4075ac20a7bc30ebddad49d6154.json | 55822 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/quant/backtest-catalog/results/120c403d8a68f87656135519105ca1d3f9a59c4dcfd5709a06ad83974b660bfe.json | 46862 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/quant/backtest-catalog/results/33d18202da7d00b7ec678635721bcfabb5305ea8b3e55b2e3059eea78acd6e11.json | 48622 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/quant/backtest-catalog/results/3a68b7fc925869298dcaa5324e387c60bd40af232d3c5e4255183f239679664f.json | 54110 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/quant/backtest-catalog/results/5b6b4e79e92b65749d519664348794afde3c5a7e294e441db6880c5704eac2bd.json | 48497 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/quant/backtest-catalog/results/64dcfbc062fceed17ba2038b415a0dbc899d520b8288ec5d94e7b9b828e6de2c.json | 21211 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/quant/backtest-catalog/results/69f104fbd5882ddef84bbc636411c8515e64358c56ab6f11bc8c678eedb933e7.json | 54109 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/quant/backtest-catalog/results/6e69eb529e1dfbd2bf171b9ef6f7a08d1144c307f7409f9105f3ce4326243022.json | 21132 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/quant/backtest-catalog/results/6e954e9fcb0aca417b8a52dd7e507ee63d5623c2594f22f8d782275007031dd5.json | 19679 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/quant/backtest-catalog/results/7322650add1c6671d113b508725398ae6f262e04d20d361bc546cf4e054f29b6.json | 33908 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/quant/backtest-catalog/results/74ae787ba3683fe46c4f6a2c24b94b62cef680916b71c7a790cd676e58c27509.json | 19646 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/quant/backtest-catalog/results/7fea969ccf49e1384ec41aad4752defd7014a8032a167d0b687da489809152d8.json | 21215 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/quant/backtest-catalog/results/80c9cfa0872d280caba1631c713d482725ed4e635261bdaca5a41eeb46bc5bba.json | 46486 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/quant/backtest-catalog/results/820b083d945f25df607ee5b50cf6273502e08593d439d24caa0baff63dc68970.json | 52042 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/quant/backtest-catalog/results/8762576f71041107c6b9e71b4cca17c638f2223a543978acc2bfbbf7bd732dea.json | 45941 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/quant/backtest-catalog/results/9022867b2dab3e9db45b55d845a761c9e548c45a4a66dc51681a7666bcf2a29a.json | 19637 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/quant/backtest-catalog/results/b3b69bf49789e893c2c117411a5e4b16583a88501d213180b7b18e717d4fe7ef.json | 22217 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/quant/backtest-catalog/results/b9973b6aa6cfc4b893e76c5d550d93316c7603a47b50ab3ac882202b9e338c56.json | 45252 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/quant/backtest-catalog/results/c55f9486f38754e8312447c555ea946c8a831c5c8c9cb9b95ae6623cad82aea1.json | 26086 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/quant/backtest-catalog/results/d247094dae1902e7adf90a5fc2281e5bddd7a8dcf6ac11a049c7bdc380a32f9e.json | 49847 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/quant/backtest-catalog/results/e3802e4557f095b1603fd5dee0b58613b21c5b79f899d5ef3e8d5a754003ae14.json | 45533 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/quant/backtest-demos/results/acquisition-agn.json | 21203 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/quant/backtest-demos/results/delisted-xco-bankruptcy.json | 22178 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/quant/backtest-demos/results/factor-momentum-v10-panel.json | 21164 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/quant/backtest-demos/results/ledger-smci-winner-split.json | 48485 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/quant/backtest-demos/results/pattern-2015-sideways.json | 48574 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/quant/backtest-demos/results/replay-intc-loser.json | 21119 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/quant/backtest-demos/results/replay-nvda-winner-splits.json | 25537 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/quant/backtest-demos/results/setup-reconstruction-2016-2024.json | 49844 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/quant/backtest-demos/results/signal-2008-crash.json | 54131 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/quant/backtest-demos/results/signal-2009-recovery.json | 49888 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/quant/backtest-demos/results/signal-2020-covid.json | 52018 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/quant/backtest-demos/results/signal-2022-bear.json | 47276 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/quant/backtest-demos/results/strategy-2013-2014-bull.json | 55747 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/quant/backtest-demos/results/strategy-2019-bull.json | 39541 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/quant/backtest-demos/results/strategy-dividends-tr.json | 45265 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/quant/backtest-demos/results/strategy-profile-prepared.json | 25990 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/reports/discover-global-20261010/browser_local_qa.json | 129588 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/reports/discover-global-20261010/canonical_eod_caption_qa.json | 3805 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/reports/discover-global-20261010/europe_history_coverage.json | 286187 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/reports/discover-global-20261010/global_search_contract.json | 3375 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/reports/discover-global-20261010/resource_model.json | 946 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/reports/discover-quality-20261012/discover_card_layout_diff.json | 1978 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/reports/discover-quality-20261012/discover_home_selection_diff.json | 620 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/reports/discover-quality-20261012/discover_quality_regression.json | 1770 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v3-netflix/desktop-01-hero.png | 500162 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v3-netflix/desktop-05-story.png | 332545 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v3-netflix/desktop-s01-hero.png | 260873 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v3-netflix/desktop-s06-damals.png | 134913 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v3-netflix/iphone-01-hero.png | 500601 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v3-netflix/iphone-02-rail.png | 408094 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v3-netflix/iphone-03-top10.png | 422104 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v3-netflix/iphone-04-fundamental-rail.png | 423282 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v3-netflix/iphone-05-story.png | 376947 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v3-netflix/iphone-06-theme.png | 370476 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v3-netflix/iphone-07-featured.png | 344879 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v3-netflix/iphone-08-immersive.png | 244467 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v3-netflix/iphone-s01-hero.png | 361846 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v3-netflix/iphone-s02-warum.png | 169944 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v3-netflix/iphone-s03-intraday.png | 160189 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v3-netflix/iphone-s04-30s.png | 168074 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v3-netflix/iphone-s05-business.png | 168730 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v3-netflix/iphone-s06-damals.png | 207657 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v3-netflix/iphone-s07-journey.png | 193865 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v3-netflix/iphone-s08-heute.png | 148858 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v3-netflix/iphone-s09-bewertung.png | 161816 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v3-netflix/iphone-s10-chancen-risiken.png | 213546 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v3-netflix/iphone-s11-quant.png | 165830 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v3-netflix/iphone-s12-aehnlich.png | 264108 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v3-netflix/iphone-s13-next.png | 287941 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v4-1/01-discover-mobil-dunkel.png | 494070 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v4-1/01-discover-mobil-hell.png | 511043 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v4-1/03-collections-mobil-dunkel.png | 442049 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v4-1/03-collections-mobil-hell.png | 430715 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v4-1/04-index-rangliste-mobil-dunkel.png | 245896 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v4-1/04-index-rangliste-mobil-hell.png | 233730 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v4-1/05-discover-desktop-dunkel.png | 463702 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v4-1/06-discover-desktop-hell.png | 400497 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v4-1/11-fnav-scrolling-weg.png | 425352 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v4-1/12-suche-overlay-dunkel.png | 160100 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v4-1/12-suche-overlay-hell.png | 147442 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v4-1/13-feed-titel-1-dunkel.png | 303996 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v4-1/13-feed-titel-1-hell.png | 321930 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v4-1/14-feed-nach-wischen-dunkel.png | 298151 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v4-1/14-feed-nach-wischen-hell.png | 316895 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v4-1/15-feed-batch-ueber-10-dunkel.png | 327811 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v4-1/15-feed-batch-ueber-10-hell.png | 366822 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v4-1/20-AAPL-hero.png | 428211 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v4-1/20-NVDA-hero.png | 393790 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v4-1/20-PANW-hero.png | 439183 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v4-1/20-VLO-hero.png | 434643 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v4-1/21-AAPL-1T.png | 102830 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v4-1/21-NVDA-1T.png | 96960 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v4-1/21-PANW-1T.png | 104341 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v4-1/21-VLO-1T.png | 101042 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v4-1/22-AAPL-1J.png | 159388 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v4-1/22-NVDA-1J.png | 165089 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v4-1/22-PANW-1J.png | 152372 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v4-1/22-VLO-1J.png | 145650 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v4-1/23-AAPL-journey.png | 120162 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v4-1/23-NVDA-journey.png | 135110 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v4-1/23-PANW-journey.png | 139320 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v4-1/23-VLO-journey.png | 144293 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v4-1/24-AAPL-zahlen-cluster.png | 154343 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v4-1/24-NVDA-zahlen-cluster.png | 156378 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v4-1/24-PANW-zahlen-cluster.png | 154626 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v4-1/24-VLO-zahlen-cluster.png | 149006 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v4-1/25-AAPL-bewertung.png | 175166 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v4-1/25-NVDA-bewertung.png | 173685 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v4-1/25-VLO-bewertung.png | 183428 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v4-1/26-AAPL-chancen-risiken.png | 166813 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v4-1/26-NVDA-chancen-risiken.png | 166738 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v4-1/26-PANW-chancen-risiken.png | 169197 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v4-1/26-VLO-chancen-risiken.png | 165224 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v4-1/27-AAPL-analyse-grenze.png | 216728 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v4-1/27-NVDA-analyse-grenze.png | 169438 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v4-1/27-PANW-analyse-grenze.png | 224692 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v4-1/27-VLO-analyse-grenze.png | 198458 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v4/01-iphone-hero.png | 505920 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v4/02-iphone-hero-swipe-2.png | 494207 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v4/03-iphone-bekannte-namen.png | 397554 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v4/04-iphone-staerkste.png | 432683 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v4/05-iphone-sp500.png | 451454 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v4/06-iphone-nasdaq100.png | 444401 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v4/07-iphone-dow.png | 408643 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v4/08-iphone-fundamental-story.png | 391382 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v4/09-iphone-stock-header.png | 422129 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v4/10-iphone-stock-1T.png | 165638 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v4/11-iphone-stock-1M.png | 163138 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v4/12-iphone-stock-6M.png | 167154 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v4/13-iphone-stock-1J.png | 168988 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v4/14-iphone-stock-fundamentals.png | 155042 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v4/15-iphone-stock-damals-heute.png | 197297 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v4/16-iphone-stock-next-discovery.png | 246073 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v4/17-desktop-discover.png | 477109 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v4/18-desktop-stock.png | 304094 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v4/19-desktop-daten-quellen.png | 139417 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v4/20-iphone-nvda-1T.png | 160040 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v4/21-iphone-nvda-1J.png | 169833 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v4/22-iphone-hero-vlo-1T.png | 166925 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v4/23-iphone-hero-vlo-1J.png | 168777 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v4/LOG.txt | 641 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v41-realtime/desktop-dunkel-01-discover.png | 466269 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v41-realtime/desktop-dunkel-02-aktienseite.png | 318504 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v41-realtime/desktop-hell-01-discover.png | 403398 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v41-realtime/desktop-hell-02-aktienseite.png | 335696 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v41-realtime/mobil-dunkel-01-discover-erster-bildschirm.png | 497360 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v41-realtime/mobil-dunkel-02-grosser-chart.png | 428233 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v41-realtime/mobil-dunkel-03-live-aapl.png | 113015 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v41-realtime/mobil-dunkel-03-live-nvda.png | 111665 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v41-realtime/mobil-dunkel-07-schwebende-navigation.png | 449610 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v41-realtime/mobil-dunkel-08-entdecken-feed.png | 311770 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v41-realtime/mobil-dunkel-09-negativ-rot-msft.png | 413608 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v41-realtime/mobil-dunkel-09-positiv-gruen-vlo.png | 434664 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v41-realtime/mobil-dunkel-10-chancen-und-risiken.png | 179568 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v41-realtime/mobil-dunkel-11-analyse-hinter-der-grenze.png | 176588 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v41-realtime/mobil-hell-01-discover-erster-bildschirm.png | 514586 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v41-realtime/mobil-hell-02-grosser-chart.png | 388011 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v41-realtime/mobil-hell-03-live-aapl.png | 110716 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v41-realtime/mobil-hell-03-live-nvda.png | 108560 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v41-realtime/mobil-hell-08-entdecken-feed.png | 330356 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v41-realtime/mobil-hell-09-negativ-rot-msft.png | 380867 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v41-realtime/mobil-hell-09-positiv-gruen-vlo.png | 395198 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v41-realtime/mobil-hell-10-chancen-und-risiken.png | 180887 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/screenshots/discover-v41-realtime/mobil-hell-11-analyse-hinter-der-grenze.png | 179838 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-audit-qa/1280-dark-katalog.png | 204707 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-audit-qa/1280-dark-lektion.png | 260185 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-audit-qa/1280-light-katalog.png | 202379 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-audit-qa/1280-light-lektion.png | 259803 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-audit-qa/360-dark-katalog.png | 228850 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-audit-qa/360-dark-lektion.png | 237067 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-audit-qa/360-light-katalog.png | 225283 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-audit-qa/360-light-lektion.png | 235906 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-audit-qa/390-dark-katalog.png | 229082 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-audit-qa/390-dark-lektion.png | 235885 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-audit-qa/390-dark-momentum-3.png | 234257 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-audit-qa/390-dark-risiko-2.png | 246065 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-audit-qa/390-dark-risiko-4.png | 268542 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-audit-qa/390-light-katalog.png | 225769 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-audit-qa/390-light-lektion.png | 235095 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-audit-qa/390-light-momentum-3.png | 234418 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-audit-qa/390-light-risiko-2.png | 246178 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-audit-qa/390-light-risiko-4.png | 268399 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-final-qa/1280-dark-central-academy.png | 365083 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-final-qa/1280-dark-lektion.png | 260185 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-final-qa/1280-light-central-academy.png | 435611 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-final-qa/1280-light-lektion.png | 259803 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-final-qa/360-dark-central-academy.png | 352592 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-final-qa/360-dark-lektion.png | 237067 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-final-qa/360-light-central-academy.png | 398190 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-final-qa/360-light-lektion.png | 235906 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-final-qa/390-dark-katalog.png | 232603 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-final-qa/390-dark-lektion.png | 235885 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-final-qa/390-dark-momentum-1-practice.png | 192968 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-final-qa/390-dark-momentum-3.png | 234257 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-final-qa/390-dark-risiko-2.png | 246065 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-final-qa/390-dark-risiko-4.png | 268542 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-final-qa/390-dark-zeitrahmen-1-practice.png | 176513 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-final-qa/390-light-katalog.png | 229158 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-final-qa/390-light-lektion.png | 235095 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-final-qa/390-light-momentum-1-practice.png | 192106 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-final-qa/390-light-momentum-3.png | 234418 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-final-qa/390-light-risiko-2.png | 246178 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-final-qa/390-light-risiko-4.png | 268399 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-final-qa/390-light-zeitrahmen-1-practice.png | 175802 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-final-qa/existing-browser-report.json | 4988 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-qa/1280-dark-katalog.png | 194127 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-qa/1280-dark-lektion.png | 276356 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-qa/1280-light-katalog.png | 192109 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-qa/1280-light-lektion.png | 276452 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-qa/360-dark-katalog.png | 202753 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-qa/360-dark-lektion.png | 253766 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-qa/360-light-katalog.png | 199577 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-qa/360-light-lektion.png | 253356 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-qa/390-dark-katalog.png | 202772 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-qa/390-dark-lektion.png | 252060 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-qa/390-light-katalog.png | 199883 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-qa/390-light-lektion.png | 252087 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-qa/test-results.json | 858 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/1280-dark-breakout-1-hero.png | 107880 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/1280-dark-momentum-1-hero.png | 89845 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/1280-dark-risiko-1-hero.png | 94839 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/1280-dark-routine-1-hero.png | 94284 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/1280-dark-struktur-1-hero.png | 88033 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/1280-dark-trend-1-hero.png | 100044 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/1280-dark-wechsel-1-hero.png | 98035 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/1280-dark-zeitrahmen-1-hero.png | 100066 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/1280-light-breakout-1-hero.png | 107540 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/1280-light-momentum-1-hero.png | 90132 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/1280-light-risiko-1-hero.png | 94858 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/1280-light-routine-1-hero.png | 94292 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/1280-light-struktur-1-hero.png | 88251 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/1280-light-trend-1-hero.png | 99836 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/1280-light-wechsel-1-hero.png | 97652 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/1280-light-zeitrahmen-1-hero.png | 99775 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/360-dark-breakout-1-hero.png | 66222 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/360-dark-momentum-1-hero.png | 53947 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/360-dark-risiko-1-hero.png | 60239 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/360-dark-routine-1-hero.png | 59122 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/360-dark-struktur-1-hero.png | 55667 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/360-dark-trend-1-hero.png | 58816 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/360-dark-wechsel-1-hero.png | 58509 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/360-dark-zeitrahmen-1-hero.png | 61587 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/360-light-breakout-1-hero.png | 65821 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/360-light-momentum-1-hero.png | 53759 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/360-light-risiko-1-hero.png | 60068 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/360-light-routine-1-hero.png | 59273 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/360-light-struktur-1-hero.png | 55436 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/360-light-trend-1-hero.png | 58621 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/360-light-wechsel-1-hero.png | 58196 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/360-light-zeitrahmen-1-hero.png | 61511 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/390-dark-breakout-1-hero.png | 64496 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/390-dark-breakout-2-hero.png | 60303 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/390-dark-breakout-3-hero.png | 52515 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/390-dark-breakout-4-hero.png | 61127 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/390-dark-momentum-1-hero.png | 55492 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/390-dark-momentum-2-hero.png | 57553 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/390-dark-momentum-3-hero.png | 56362 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/390-dark-momentum-4-hero.png | 59292 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/390-dark-risiko-1-hero.png | 61037 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/390-dark-risiko-2-hero.png | 54518 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/390-dark-risiko-3-hero.png | 62686 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/390-dark-risiko-4-hero.png | 63346 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/390-dark-routine-1-hero.png | 57836 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/390-dark-routine-2-hero.png | 55520 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/390-dark-routine-3-hero.png | 56724 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/390-dark-routine-4-hero.png | 64081 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/390-dark-struktur-1-hero.png | 56103 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/390-dark-struktur-2-hero.png | 61102 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/390-dark-struktur-3-hero.png | 59925 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/390-dark-struktur-4-hero.png | 60368 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/390-dark-trend-1-hero.png | 56786 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/390-dark-trend-2-hero.png | 56630 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/390-dark-trend-3-hero.png | 56191 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/390-dark-trend-4-hero.png | 65944 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/390-dark-wechsel-1-hero.png | 59950 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/390-dark-wechsel-2-hero.png | 60696 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/390-dark-wechsel-3-hero.png | 50448 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/390-dark-wechsel-4-hero.png | 59853 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/390-dark-zeitrahmen-1-hero.png | 61296 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/390-dark-zeitrahmen-2-hero.png | 56311 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/390-dark-zeitrahmen-3-hero.png | 59765 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/390-dark-zeitrahmen-4-hero.png | 58944 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/390-light-breakout-1-hero.png | 64804 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/390-light-breakout-2-hero.png | 60284 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/390-light-breakout-2-scene-3.png | 246256 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/390-light-breakout-3-hero.png | 52851 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/390-light-breakout-4-hero.png | 60921 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/390-light-momentum-1-hero.png | 55519 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/390-light-momentum-2-hero.png | 57707 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/390-light-momentum-2-scene-3.png | 240896 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/390-light-momentum-3-hero.png | 56359 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/390-light-momentum-3-scene-3.png | 238591 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/390-light-momentum-4-hero.png | 59614 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/390-light-risiko-1-hero.png | 61120 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/390-light-risiko-2-hero.png | 54440 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/390-light-risiko-2-scene-3.png | 239649 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/390-light-risiko-3-hero.png | 62766 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/390-light-risiko-4-hero.png | 63964 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/390-light-risiko-4-scene-3.png | 255937 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/390-light-routine-1-hero.png | 58046 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/390-light-routine-2-hero.png | 55632 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/390-light-routine-2-scene-3.png | 226208 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/390-light-routine-3-hero.png | 56962 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/390-light-routine-4-hero.png | 64396 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/390-light-struktur-1-hero.png | 56288 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/390-light-struktur-1-scene-3.png | 241540 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/390-light-struktur-2-hero.png | 61242 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/390-light-struktur-3-hero.png | 59889 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/390-light-struktur-3-scene-3.png | 234850 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/390-light-struktur-4-hero.png | 60338 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/390-light-trend-1-hero.png | 57002 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/390-light-trend-2-hero.png | 56585 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/390-light-trend-3-hero.png | 56529 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/390-light-trend-4-hero.png | 66489 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/390-light-wechsel-1-hero.png | 60112 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/390-light-wechsel-2-hero.png | 60543 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/390-light-wechsel-2-scene-3.png | 245228 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/390-light-wechsel-3-hero.png | 50745 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/390-light-wechsel-4-hero.png | 60438 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/390-light-zeitrahmen-1-hero.png | 61271 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/390-light-zeitrahmen-2-hero.png | 56424 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/390-light-zeitrahmen-2-scene-3.png | 243327 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/390-light-zeitrahmen-3-hero.png | 60026 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/390-light-zeitrahmen-4-hero.png | 59061 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-rollout-qa/existing-browser-report.json | 5006 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-visual-qa/1280-dark-breakout-2-after.png | 111580 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-visual-qa/1280-dark-momentum-2-after.png | 110030 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-visual-qa/1280-dark-trend-1-after.png | 109414 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-visual-qa/360-dark-breakout-2-after.png | 59006 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-visual-qa/360-dark-breakout-2-double-text.png | 614158 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-visual-qa/360-dark-momentum-2-after.png | 56991 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-visual-qa/360-dark-momentum-2-double-text.png | 584200 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-visual-qa/360-dark-trend-1-after.png | 57400 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-visual-qa/360-dark-trend-1-double-text.png | 587410 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-visual-qa/360-light-breakout-2-after.png | 59137 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-visual-qa/360-light-breakout-2-double-text.png | 608147 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-visual-qa/360-light-momentum-2-after.png | 57024 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-visual-qa/360-light-momentum-2-double-text.png | 578520 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-visual-qa/360-light-trend-1-after.png | 57207 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-visual-qa/360-light-trend-1-double-text.png | 581527 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-visual-qa/390-dark-breakout-2-pilot-1.png | 247480 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-visual-qa/390-dark-breakout-2-pilot-3.png | 246777 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-visual-qa/390-dark-momentum-2-pilot-1.png | 247261 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-visual-qa/390-dark-momentum-2-pilot-3.png | 241730 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-visual-qa/390-dark-trend-1-pilot-1.png | 243493 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-visual-qa/390-dark-trend-1-pilot-3.png | 245149 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-visual-qa/390-light-breakout-2-pilot-3.png | 245493 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-visual-qa/390-light-momentum-2-pilot-3.png | 239827 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-visual-qa/390-light-trend-1-pilot-3.png | 242760 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/technical/academy-visual-qa/existing-browser-report.json | 5003 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/tiingo2-finalization/tiingo2_current_staging_20261003.json | 7627 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/tiingo2-finalization/tiingo2_foundation_independent_review.json | 8821 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/tiingo2-finalization/tiingo2_premerge_qa.json | 4141 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/tiingo2-finalization/tiingo2_production_baseline.json | 7569 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/tiingo2-finalization/tiingo2_staged_baseline_cas.json | 363320 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| docs/tiingo2/tiingo2_execution_manifest.json | 3109 | Nur breite Kanten, z. B. VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md; Nutzung unklar; behalten. |
| evidence/company-intelligence-continuous-refresh-20261009/full-cohort-report.json | 31119 | Nur breite Kanten, z. B. docs/company-intelligence/CONTINUOUS_REFRESH.md; Nutzung unklar; behalten. |
| evidence/company-intelligence-continuous-refresh-20261009/full-dark-report.json | 1402 | Nur breite Kanten, z. B. docs/company-intelligence/CONTINUOUS_REFRESH.md; Nutzung unklar; behalten. |
| evidence/company-intelligence-continuous-refresh-20261009/full-fast-report.json | 7361 | Nur breite Kanten, z. B. docs/company-intelligence/CONTINUOUS_REFRESH.md; Nutzung unklar; behalten. |
| evidence/company-intelligence-continuous-refresh-20261009/full-v2-report.json | 447131 | Nur breite Kanten, z. B. docs/company-intelligence/CONTINUOUS_REFRESH.md; Nutzung unklar; behalten. |
| evidence/company-intelligence-continuous-refresh-20261009/initial-slo-refresh-slo.json | 399 | Nur breite Kanten, z. B. docs/company-intelligence/CONTINUOUS_REFRESH.md; Nutzung unklar; behalten. |
| evidence/company-intelligence-continuous-refresh-20261009/production-run-1-candidate-qa.json | 3172 | Nur breite Kanten, z. B. docs/company-intelligence/CONTINUOUS_REFRESH.md; Nutzung unklar; behalten. |
| evidence/company-intelligence-continuous-refresh-20261009/production-run-1-health.json | 6001 | Nur breite Kanten, z. B. docs/company-intelligence/CONTINUOUS_REFRESH.md; Nutzung unklar; behalten. |
| evidence/company-intelligence-continuous-refresh-20261009/production-run-1-live-qa.json | 3165 | Nur breite Kanten, z. B. docs/company-intelligence/CONTINUOUS_REFRESH.md; Nutzung unklar; behalten. |
| evidence/company-intelligence-continuous-refresh-20261009/production-run-2-candidate-qa.json | 3172 | Nur breite Kanten, z. B. docs/company-intelligence/CONTINUOUS_REFRESH.md; Nutzung unklar; behalten. |
| evidence/company-intelligence-continuous-refresh-20261009/production-run-2-health.json | 6001 | Nur breite Kanten, z. B. docs/company-intelligence/CONTINUOUS_REFRESH.md; Nutzung unklar; behalten. |
| evidence/company-intelligence-continuous-refresh-20261009/production-run-2-live-qa.json | 3165 | Nur breite Kanten, z. B. docs/company-intelligence/CONTINUOUS_REFRESH.md; Nutzung unklar; behalten. |
| evidence/company-intelligence-continuous-refresh-20261009/recovery-candidate-candidate-qa.json | 3172 | Nur breite Kanten, z. B. docs/company-intelligence/CONTINUOUS_REFRESH.md; Nutzung unklar; behalten. |
| evidence/company-intelligence-continuous-refresh-20261009/recovery-candidate-health.json | 6209 | Nur breite Kanten, z. B. docs/company-intelligence/CONTINUOUS_REFRESH.md; Nutzung unklar; behalten. |
| evidence/company-intelligence-continuous-refresh-20261009/recovery-final-slo.json | 482 | Nur breite Kanten, z. B. docs/company-intelligence/CONTINUOUS_REFRESH.md; Nutzung unklar; behalten. |
| evidence/company-intelligence-continuous-refresh-20261009/recovery-full-candidate-qa.json | 3172 | Nur breite Kanten, z. B. docs/company-intelligence/CONTINUOUS_REFRESH.md; Nutzung unklar; behalten. |
| evidence/company-intelligence-continuous-refresh-20261009/recovery-full-health.json | 6103 | Nur breite Kanten, z. B. docs/company-intelligence/CONTINUOUS_REFRESH.md; Nutzung unklar; behalten. |
| evidence/company-intelligence-continuous-refresh-20261009/recovery-full-live-qa.json | 3165 | Nur breite Kanten, z. B. docs/company-intelligence/CONTINUOUS_REFRESH.md; Nutzung unklar; behalten. |
| evidence/company-intelligence-continuous-refresh-20261009/recovery-mismatch-slo.json | 462 | Nur breite Kanten, z. B. docs/company-intelligence/CONTINUOUS_REFRESH.md; Nutzung unklar; behalten. |
| evidence/company-intelligence-full-universe-20261010/accepted-health-reconciliation.json | 319 | Nur breite Kanten, z. B. docs/company-intelligence/FULL_UNIVERSE_ROLLOUT.md; Nutzung unklar; behalten. |
| evidence/company-intelligence-full-universe-20261010/accepted-health-state.json | 482 | Nur breite Kanten, z. B. docs/company-intelligence/FULL_UNIVERSE_ROLLOUT.md; Nutzung unklar; behalten. |
| evidence/company-intelligence-full-universe-20261010/actual-46-rollback-browser.json | 3165 | Nur breite Kanten, z. B. docs/company-intelligence/FULL_UNIVERSE_ROLLOUT.md; Nutzung unklar; behalten. |
| evidence/company-intelligence-full-universe-20261010/actual-46-rollback.json | 148 | Nur breite Kanten, z. B. docs/company-intelligence/FULL_UNIVERSE_ROLLOUT.md; Nutzung unklar; behalten. |
| evidence/company-intelligence-full-universe-20261010/actual-cold-warm-pages-runtime.json | 923 | Nur breite Kanten, z. B. docs/company-intelligence/FULL_UNIVERSE_ROLLOUT.md; Nutzung unklar; behalten. |
| evidence/company-intelligence-full-universe-20261010/actual-frozen-rollback-latest.json | 3165 | Nur breite Kanten, z. B. docs/company-intelligence/FULL_UNIVERSE_ROLLOUT.md; Nutzung unklar; behalten. |
| evidence/company-intelligence-full-universe-20261010/actual-reconciled-browser-smoke.json | 1559 | Nur breite Kanten, z. B. docs/company-intelligence/FULL_UNIVERSE_ROLLOUT.md; Nutzung unklar; behalten. |
| evidence/company-intelligence-full-universe-20261010/actual-reconciled-consumer-delivery.json | 438 | Nur breite Kanten, z. B. docs/company-intelligence/FULL_UNIVERSE_ROLLOUT.md; Nutzung unklar; behalten. |
| evidence/company-intelligence-full-universe-20261010/actual-reconciled-health-delivery.json | 318 | Nur breite Kanten, z. B. docs/company-intelligence/FULL_UNIVERSE_ROLLOUT.md; Nutzung unklar; behalten. |
| evidence/company-intelligence-full-universe-20261010/actual-scheduled-source-38059718852.json | 9682 | Nur breite Kanten, z. B. docs/company-intelligence/FULL_UNIVERSE_ROLLOUT.md; Nutzung unklar; behalten. |
| evidence/company-intelligence-full-universe-20261010/actual-wide-pages-package.json | 209 | Nur breite Kanten, z. B. docs/company-intelligence/FULL_UNIVERSE_ROLLOUT.md; Nutzung unklar; behalten. |
| evidence/company-intelligence-full-universe-20261010/actual-widened-package.json | 210 | Nur breite Kanten, z. B. docs/company-intelligence/FULL_UNIVERSE_ROLLOUT.md; Nutzung unklar; behalten. |
| evidence/company-intelligence-full-universe-20261010/cancelled-release-accepted-r2.json | 1426 | Nur breite Kanten, z. B. docs/company-intelligence/FULL_UNIVERSE_ROLLOUT.md; Nutzung unklar; behalten. |
| evidence/company-intelligence-full-universe-20261010/candidate-audit.json | 4186 | Nur breite Kanten, z. B. docs/company-intelligence/FULL_UNIVERSE_ROLLOUT.md; Nutzung unklar; behalten. |
| evidence/company-intelligence-full-universe-20261010/candidate-browser.json | 32322 | Nur breite Kanten, z. B. docs/company-intelligence/FULL_UNIVERSE_ROLLOUT.md; Nutzung unklar; behalten. |
| evidence/company-intelligence-full-universe-20261010/candidate-sample.json | 22901 | Nur breite Kanten, z. B. docs/company-intelligence/FULL_UNIVERSE_ROLLOUT.md; Nutzung unklar; behalten. |
| evidence/company-intelligence-full-universe-20261010/final-accepted-release.json | 1656 | Nur breite Kanten, z. B. docs/company-intelligence/FULL_UNIVERSE_ROLLOUT.md; Nutzung unklar; behalten. |
| evidence/company-intelligence-full-universe-20261010/final-actual-production-browser.json | 80148 | Nur breite Kanten, z. B. docs/company-intelligence/FULL_UNIVERSE_ROLLOUT.md; Nutzung unklar; behalten. |
| evidence/company-intelligence-full-universe-20261010/final-authoritative-audit.json | 4956 | Nur breite Kanten, z. B. docs/company-intelligence/FULL_UNIVERSE_ROLLOUT.md; Nutzung unklar; behalten. |
| evidence/company-intelligence-full-universe-20261010/final-fixed-rollback-browser.json | 3165 | Nur breite Kanten, z. B. docs/company-intelligence/FULL_UNIVERSE_ROLLOUT.md; Nutzung unklar; behalten. |
| evidence/company-intelligence-full-universe-20261010/final-fixed-rollback.json | 148 | Nur breite Kanten, z. B. docs/company-intelligence/FULL_UNIVERSE_ROLLOUT.md; Nutzung unklar; behalten. |
| evidence/company-intelligence-full-universe-20261010/final-sample.json | 22901 | Nur breite Kanten, z. B. docs/company-intelligence/FULL_UNIVERSE_ROLLOUT.md; Nutzung unklar; behalten. |
| evidence/company-intelligence-full-universe-20261010/fresh-current-universe-audit.json | 4127 | Nur breite Kanten, z. B. docs/company-intelligence/FULL_UNIVERSE_ROLLOUT.md; Nutzung unklar; behalten. |
| evidence/company-intelligence-full-universe-20261010/health-warning-before-reconciliation.json | 482 | Nur breite Kanten, z. B. docs/company-intelligence/FULL_UNIVERSE_ROLLOUT.md; Nutzung unklar; behalten. |
| evidence/company-intelligence-full-universe-20261010/isolated-full-source-scale.json | 2266 | Nur breite Kanten, z. B. docs/company-intelligence/FULL_UNIVERSE_ROLLOUT.md; Nutzung unklar; behalten. |
| evidence/company-intelligence-full-universe-20261010/navigation-blocked-auto-rollback.json | 1654 | Nur breite Kanten, z. B. docs/company-intelligence/FULL_UNIVERSE_ROLLOUT.md; Nutzung unklar; behalten. |
| evidence/company-intelligence-full-universe-20261010/post-cancel-actual-rollback-browser.json | 3165 | Nur breite Kanten, z. B. docs/company-intelligence/FULL_UNIVERSE_ROLLOUT.md; Nutzung unklar; behalten. |
| evidence/company-intelligence-full-universe-20261010/post-cancel-actual-rollback.json | 148 | Nur breite Kanten, z. B. docs/company-intelligence/FULL_UNIVERSE_ROLLOUT.md; Nutzung unklar; behalten. |
| evidence/company-intelligence-full-universe-20261010/public-consumer-cache-measured.json | 276 | Nur breite Kanten, z. B. docs/company-intelligence/FULL_UNIVERSE_ROLLOUT.md; Nutzung unklar; behalten. |
| evidence/company-intelligence-full-universe-20261010/wide-release-hosting-recovery-failure.json | 1815 | Nur breite Kanten, z. B. docs/company-intelligence/FULL_UNIVERSE_ROLLOUT.md; Nutzung unklar; behalten. |
| konto/passwort-neu/index.html | 3213 | Nur breite Kanten, z. B. .github/workflows/account-ci.yml; Nutzung unklar; behalten. |
| konto/tests/push-settings.test.mjs | 4641 | Nur breite Kanten, z. B. .github/workflows/account-ci.yml; Nutzung unklar; behalten. |
| konto/tests/saved-searches.test.mjs | 5609 | Nur breite Kanten, z. B. .github/workflows/account-ci.yml; Nutzung unklar; behalten. |
| landing/.gitignore | 72 | Nur breite Kanten, z. B. .github/workflows/ci.yml; Nutzung unklar; behalten. |
| landing/NEWSLETTER.md | 53119 | Nur breite Kanten, z. B. .github/workflows/ci.yml; Nutzung unklar; behalten. |
| landing/README.md | 12432 | Nur breite Kanten, z. B. .github/workflows/ci.yml; Nutzung unklar; behalten. |
| landing/assets/inter-LICENSE.txt | 4380 | Nur breite Kanten, z. B. .github/workflows/ci.yml; Nutzung unklar; behalten. |
| landing/deployment/apex-redirect.json | 384 | Nur breite Kanten, z. B. .github/workflows/ci.yml; Nutzung unklar; behalten. |
| landing/deployment/newsletter-api-status.json | 1693 | Nur breite Kanten, z. B. .github/workflows/ci.yml; Nutzung unklar; behalten. |
| landing/newsletter.config.example.json | 105 | Nur breite Kanten, z. B. .github/workflows/ci.yml; Nutzung unklar; behalten. |
| landing/package.json | 673 | Nur breite Kanten, z. B. .github/workflows/ci.yml; Nutzung unklar; behalten. |
| landing/reference/discover-swipe-source.json | 723 | Nur breite Kanten, z. B. .github/workflows/ci.yml; Nutzung unklar; behalten. |
| landing/review/README.md | 4321 | Nur breite Kanten, z. B. .github/workflows/ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| landing/review/compact-signup/after-desktop.png | 77628 | Nur breite Kanten, z. B. .github/workflows/ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| landing/review/compact-signup/after-iphone.png | 52595 | Nur breite Kanten, z. B. .github/workflows/ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| landing/review/compact-signup/before-desktop.png | 91178 | Nur breite Kanten, z. B. .github/workflows/ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| landing/review/compact-signup/before-iphone.png | 76564 | Nur breite Kanten, z. B. .github/workflows/ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| landing/review/compact-signup/expanded-iphone.png | 78757 | Nur breite Kanten, z. B. .github/workflows/ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| landing/review/comparison-desktop.png | 700327 | Nur breite Kanten, z. B. .github/workflows/ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| landing/review/comparison-iphone.png | 346983 | Nur breite Kanten, z. B. .github/workflows/ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| landing/review/desktop.png | 478983 | Nur breite Kanten, z. B. .github/workflows/ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| landing/review/iphone.png | 905925 | Nur breite Kanten, z. B. .github/workflows/ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| landing/review/landing-desktop-viewport.png | 376981 | Nur breite Kanten, z. B. .github/workflows/ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| landing/review/landing-iphone-viewport.png | 169401 | Nur breite Kanten, z. B. .github/workflows/ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| landing/review/redesign/after-datenschutz-desktop.png | 393637 | Nur breite Kanten, z. B. .github/workflows/ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| landing/review/redesign/after-newsletter-desktop.png | 145600 | Nur breite Kanten, z. B. .github/workflows/ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| landing/review/redesign/before-imprint-desktop.png | 263051 | Nur breite Kanten, z. B. .github/workflows/ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| landing/review/redesign/before-imprint-iphone.png | 231947 | Nur breite Kanten, z. B. .github/workflows/ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| landing/review/redesign/state-error-desktop.png | 256836 | Nur breite Kanten, z. B. .github/workflows/ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| landing/review/redesign/state-error-iphone.png | 137929 | Nur breite Kanten, z. B. .github/workflows/ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| landing/review/redesign/state-pending-desktop.png | 253521 | Nur breite Kanten, z. B. .github/workflows/ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| landing/review/redesign/state-pending-iphone.png | 137508 | Nur breite Kanten, z. B. .github/workflows/ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| landing/review/research-desktop.png | 348355 | Nur breite Kanten, z. B. .github/workflows/ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| landing/review/research-iphone.png | 157969 | Nur breite Kanten, z. B. .github/workflows/ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| landing/scripts/check-live.mjs | 4452 | Nur breite Kanten, z. B. .github/workflows/ci.yml; Nutzung unklar; behalten. |
| landing/scripts/discover-preview.mjs | 2192 | Nur breite Kanten, z. B. .github/workflows/ci.yml; Nutzung unklar; behalten. |
| landing/scripts/newsletter_diagnostics.py | 3041 | Nur breite Kanten, z. B. .github/workflows/ci.yml; Nutzung unklar; behalten. |
| landing/tests/build.test.mjs | 6022 | Nur breite Kanten, z. B. .github/workflows/ci.yml; Nutzung unklar; behalten. |
| landing/tests/cloudflare.test.mjs | 5744 | Nur breite Kanten, z. B. .github/workflows/ci.yml; Nutzung unklar; behalten. |
| landing/tests/discover-swipe-checks.mjs | 5720 | Nur breite Kanten, z. B. .github/workflows/ci.yml; Nutzung unklar; behalten. |
| landing/tests/doi-diagnostic.test.mjs | 330 | Nur breite Kanten, z. B. .github/workflows/ci.yml; Nutzung unklar; behalten. |
| landing/tests/edge-runtime/mock.mjs | 1879 | Nur breite Kanten, z. B. .github/workflows/ci.yml; Nutzung unklar; behalten. |
| landing/tests/module-preview.test.mjs | 1792 | Nur breite Kanten, z. B. .github/workflows/ci.yml; Nutzung unklar; behalten. |
| landing/tests/native-form.test.mjs | 3349 | Nur breite Kanten, z. B. .github/workflows/ci.yml; Nutzung unklar; behalten. |
| landing/tests/newsletter-server.test.mjs | 17543 | Nur breite Kanten, z. B. .github/workflows/ci.yml; Nutzung unklar; behalten. |
| landing/tests/operator-contract.test.mjs | 282 | Nur breite Kanten, z. B. .github/workflows/ci.yml; Nutzung unklar; behalten. |
| landing/tests/pages.test.mjs | 3179 | Nur breite Kanten, z. B. .github/workflows/ci.yml; Nutzung unklar; behalten. |
| landing/tests/release-contract.test.mjs | 302 | Nur breite Kanten, z. B. .github/workflows/ci.yml; Nutzung unklar; behalten. |
| providers/marketstack/tests/audit.test.mjs | 22555 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Nutzung unklar; behalten. |
| providers/marketstack/tests/europe-actions.test.mjs | 10660 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Nutzung unklar; behalten. |
| providers/marketstack/tests/europe-build-evidence.test.mjs | 42126 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Nutzung unklar; behalten. |
| providers/marketstack/tests/europe-company-logos.test.mjs | 11866 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Nutzung unklar; behalten. |
| providers/marketstack/tests/europe-credit-report.test.mjs | 1921 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Nutzung unklar; behalten. |
| providers/marketstack/tests/europe-credits.test.mjs | 7999 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Nutzung unklar; behalten. |
| providers/marketstack/tests/europe-discover-catalog.test.mjs | 14647 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Nutzung unklar; behalten. |
| providers/marketstack/tests/europe-discover-chart-quality.test.mjs | 8918 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Nutzung unklar; behalten. |
| providers/marketstack/tests/europe-discover-identity-reports.test.mjs | 3194 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Nutzung unklar; behalten. |
| providers/marketstack/tests/europe-discover-screener-replay.test.mjs | 6207 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Nutzung unklar; behalten. |
| providers/marketstack/tests/europe-fundamentals-mapping.test.mjs | 16211 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Nutzung unklar; behalten. |
| providers/marketstack/tests/europe-gap-date-clusters.test.mjs | 6739 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Nutzung unklar; behalten. |
| providers/marketstack/tests/europe-ingestion.test.mjs | 16962 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Nutzung unklar; behalten. |
| providers/marketstack/tests/europe-integrity-analytics.test.mjs | 9974 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Nutzung unklar; behalten. |
| providers/marketstack/tests/europe-integrity-rebuild.test.mjs | 6323 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Nutzung unklar; behalten. |
| providers/marketstack/tests/europe-integrity-source-replay.test.mjs | 10500 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Nutzung unklar; behalten. |
| providers/marketstack/tests/europe-live-analytics-rebuild.test.mjs | 15302 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Nutzung unklar; behalten. |
| providers/marketstack/tests/europe-live-missing-review.test.mjs | 13104 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Nutzung unklar; behalten. |
| providers/marketstack/tests/europe-live-private-archive.test.mjs | 2920 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Nutzung unklar; behalten. |
| providers/marketstack/tests/europe-live-quarantine-review.test.mjs | 13714 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Nutzung unklar; behalten. |
| providers/marketstack/tests/europe-live-revalidation-plan.test.mjs | 4320 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Nutzung unklar; behalten. |
| providers/marketstack/tests/europe-live-revalidation.test.mjs | 14003 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Nutzung unklar; behalten. |
| providers/marketstack/tests/europe-live-semantics-review.test.mjs | 17484 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Nutzung unklar; behalten. |
| providers/marketstack/tests/europe-mic-policy.test.mjs | 5455 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Nutzung unklar; behalten. |
| providers/marketstack/tests/europe-product-contract-replay.test.mjs | 14369 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Nutzung unklar; behalten. |
| providers/marketstack/tests/europe-product-readiness.test.mjs | 10668 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Nutzung unklar; behalten. |
| providers/marketstack/tests/europe-product-reports.test.mjs | 6629 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Nutzung unklar; behalten. |
| providers/marketstack/tests/europe-quality.test.mjs | 29460 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Nutzung unklar; behalten. |
| providers/marketstack/tests/europe-review-resolution.test.mjs | 25726 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Nutzung unklar; behalten. |
| providers/marketstack/tests/europe-universe.test.mjs | 13531 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Nutzung unklar; behalten. |
| providers/marketstack/tests/europe21-credit-report.test.mjs | 2686 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Nutzung unklar; behalten. |
| providers/marketstack/tests/europe21-quality.test.mjs | 8843 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Nutzung unklar; behalten. |
| screener/tests/europe-readiness.test.mjs | 23992 | Nur breite Kanten, z. B. .github/workflows/ci.yml; Nutzung unklar; behalten. |
| screener/tests/first-paint.test.mjs | 13391 | Nur breite Kanten, z. B. .github/workflows/ci.yml; Nutzung unklar; behalten. |
| screener/tests/universe.test.mjs | 10157 | Nur breite Kanten, z. B. .github/workflows/ci.yml; Nutzung unklar; behalten. |
| scripts/account/tests/brevo-setup.test.mjs | 3424 | Nur breite Kanten, z. B. .github/workflows/account-ci.yml; Nutzung unklar; behalten. |
| scripts/account/tests/build-watchlist-events.test.mjs | 9709 | Nur breite Kanten, z. B. .github/workflows/account-ci.yml; Nutzung unklar; behalten. |
| scripts/account/tests/dev-tools.test.mjs | 15515 | Nur breite Kanten, z. B. .github/workflows/account-ci.yml; Nutzung unklar; behalten. |
| scripts/account/tests/go-live-config.test.mjs | 3783 | Nur breite Kanten, z. B. .github/workflows/account-ci.yml; Nutzung unklar; behalten. |
| scripts/account/tests/stripe-live-check.test.mjs | 6714 | Nur breite Kanten, z. B. .github/workflows/account-ci.yml; Nutzung unklar; behalten. |
| scripts/account/tests/stripe-live-setup.test.mjs | 12669 | Nur breite Kanten, z. B. .github/workflows/account-ci.yml; Nutzung unklar; behalten. |
| scripts/account/tests/supabase-push-plan.test.mjs | 2985 | Nur breite Kanten, z. B. .github/workflows/account-ci.yml; Nutzung unklar; behalten. |
| scripts/analysts/tests/fetch-consensus.test.mjs | 4016 | Nur breite Kanten, z. B. app/README.md; Nutzung unklar; behalten. |
| scripts/analysts/tests/probe-consensus.test.mjs | 1701 | Nur breite Kanten, z. B. app/README.md; Nutzung unklar; behalten. |
| scripts/brevo/.gitignore | 53 | Nur breite Kanten, z. B. .github/workflows/ci.yml; Nutzung unklar; behalten. |
| scripts/brevo/campaigns.py | 15772 | Nur breite Kanten, z. B. .github/workflows/ci.yml; Nutzung unklar; behalten. |
| scripts/brevo/client.py | 9043 | Nur breite Kanten, z. B. .github/workflows/ci.yml; Nutzung unklar; behalten. |
| scripts/brevo/contact_report.py | 3634 | Nur breite Kanten, z. B. .github/workflows/ci.yml; Nutzung unklar; behalten. |
| scripts/brevo/import_contacts.py | 10209 | Nur breite Kanten, z. B. .github/workflows/ci.yml; Nutzung unklar; behalten. |
| scripts/brevo/newsletter_approval.py | 5112 | Nur breite Kanten, z. B. .github/workflows/ci.yml; Nutzung unklar; behalten. |
| scripts/brevo/newsletter_content.py | 2440 | Nur breite Kanten, z. B. .github/workflows/ci.yml; Nutzung unklar; behalten. |
| scripts/brevo/newsletter_preview.py | 12021 | Nur breite Kanten, z. B. .github/workflows/ci.yml; Nutzung unklar; behalten. |
| scripts/brevo/tests/test_app_newsletter.py | 5791 | Nur breite Kanten, z. B. .github/workflows/ci.yml; Nutzung unklar; behalten. |
| scripts/brevo/tests/test_contact_report.py | 3417 | Nur breite Kanten, z. B. .github/workflows/ci.yml; Nutzung unklar; behalten. |
| scripts/brevo/tests/test_internal_membership.py | 5192 | Nur breite Kanten, z. B. .github/workflows/ci.yml; Nutzung unklar; behalten. |
| scripts/brevo/tests/test_newsletter_actions.py | 5270 | Nur breite Kanten, z. B. .github/workflows/ci.yml; Nutzung unklar; behalten. |
| scripts/brevo/tests/test_owner_approval.py | 10352 | Nur breite Kanten, z. B. .github/workflows/ci.yml; Nutzung unklar; behalten. |
| scripts/brevo/tests/test_preview.py | 16882 | Nur breite Kanten, z. B. .github/workflows/ci.yml; Nutzung unklar; behalten. |
| scripts/brevo/tests/test_safety.py | 17895 | Nur breite Kanten, z. B. .github/workflows/ci.yml; Nutzung unklar; behalten. |
| scripts/brevo/tests/test_transfer.py | 11467 | Nur breite Kanten, z. B. .github/workflows/ci.yml; Nutzung unklar; behalten. |
| scripts/ci/isolated_git_env.py | 770 | Nur breite Kanten, z. B. .github/workflows/ci.yml; Nutzung unklar; behalten. |
| scripts/ci/tests/pages-release-checkout.test.mjs | 2459 | Nur breite Kanten, z. B. .github/workflows/ci.yml; Nutzung unklar; behalten. |
| scripts/ci/tests/pipeline-alarm.test.mjs | 7745 | Nur breite Kanten, z. B. .github/workflows/ci.yml; Nutzung unklar; behalten. |
| scripts/ci/tests/sec-daily-branch-dry-run.test.mjs | 1803 | Nur breite Kanten, z. B. .github/workflows/ci.yml; Nutzung unklar; behalten. |
| scripts/ci/tests/select-checks.test.mjs | 3234 | Nur breite Kanten, z. B. .github/workflows/ci.yml; Nutzung unklar; behalten. |
| scripts/ci/tests/workflow-concurrency.test.mjs | 3196 | Nur breite Kanten, z. B. .github/workflows/ci.yml; Nutzung unklar; behalten. |
| scripts/ci/tests/workflow-inputs-env.test.mjs | 3584 | Nur breite Kanten, z. B. .github/workflows/ci.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/__init__.py | 67 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/cached_discovery.py | 9547 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/cadence.py | 973 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/calendar_backtest.py | 5035 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/consumer_event_review.py | 3086 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/consumer_usage.py | 5167 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/discovery.py | 34485 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/discovery_circuit.py | 3989 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/earnings.py | 26942 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/editorial.py | 2915 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/enrichment.py | 4077 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/event_backfill.py | 5172 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/feeds.py | 32244 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/inventory_runner.py | 7104 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/inventory_sweep.py | 12014 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/ir_events.py | 18054 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/materials.py | 16235 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/news_backfill.py | 5173 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/news_quality.py | 5800 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/owner_identity.py | 1847 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/platforms.py | 2141 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/profile_backfill.py | 15386 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/profile_catalogue.py | 14593 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/profiles.py | 34822 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/q4_events.py | 8033 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/q4_news.py | 1750 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/q4_presentations.py | 7914 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/reviewed_source_urls.py | 5005 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/root_aliases.py | 3017 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/sec_documents.py | 9958 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/source_backfill_runner.py | 9710 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/stockpr_events.py | 2564 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/structured_sources.py | 8373 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/browser-delivery-proof.test.mjs | 1143 | Nur breite Kanten, z. B. .github/workflows/company-intelligence-universe-release.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/browser-diagnostics.test.mjs | 4345 | Nur breite Kanten, z. B. .github/workflows/company-intelligence-universe-release.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/browser-install.test.mjs | 1396 | Nur breite Kanten, z. B. .github/workflows/company-intelligence-universe-release.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/candidate-qa-assumptions.test.mjs | 8446 | Nur breite Kanten, z. B. .github/workflows/company-intelligence-universe-release.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/classify-live-failure.test.mjs | 28799 | Nur breite Kanten, z. B. .github/workflows/company-intelligence-universe-release.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/consumer-batch-read.test.mjs | 7566 | Nur breite Kanten, z. B. .github/workflows/company-intelligence-universe-release.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/consumer-release-cache.test.mjs | 5091 | Nur breite Kanten, z. B. .github/workflows/company-intelligence-universe-release.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/consumer-view.test.mjs | 7941 | Nur breite Kanten, z. B. .github/workflows/company-intelligence-universe-release.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/contract.test.mjs | 10947 | Nur breite Kanten, z. B. .github/workflows/company-intelligence-universe-release.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/current-sync-errors.test.mjs | 766 | Nur breite Kanten, z. B. .github/workflows/company-intelligence-universe-release.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/delivery.test.mjs | 13742 | Nur breite Kanten, z. B. .github/workflows/company-intelligence-universe-release.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/deployment-mode.test.mjs | 1423 | Nur breite Kanten, z. B. .github/workflows/company-intelligence-universe-release.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/fixtures/AAPL-consumer.json | 12119 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/fixtures/MSFT-consumer.json | 12447 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/fixtures/NVDA-consumer.json | 12087 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/fixtures/README.md | 2174 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/fixtures/domain-expansion-evidence.json | 27747 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/fixtures/phase3-validation.json | 31898 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/fixtures/r2-acceptance-first.json | 6192 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/fixtures/r2-acceptance-producer.json | 6806 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/fixtures/r2-acceptance-second.json | 6870 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/fixtures/r2-acceptance-universe-financial.json | 7247 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/fixtures/r2-acceptance-universe-hardened.json | 7247 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/handoff-transfer.test.mjs | 4017 | Nur breite Kanten, z. B. .github/workflows/company-intelligence-universe-release.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/health-semantics.test.mjs | 12993 | Nur breite Kanten, z. B. .github/workflows/company-intelligence-universe-release.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/integration-scope.test.mjs | 5949 | Nur breite Kanten, z. B. .github/workflows/company-intelligence-universe-release.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/live-asset-read.test.mjs | 1424 | Nur breite Kanten, z. B. .github/workflows/company-intelligence-universe-release.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/live-production-qa-phase.test.mjs | 3376 | Nur breite Kanten, z. B. .github/workflows/company-intelligence-universe-release.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/numeric-band.test.mjs | 1933 | Nur breite Kanten, z. B. .github/workflows/company-intelligence-universe-release.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/pages-failure-handler-workflow.test.mjs | 17634 | Nur breite Kanten, z. B. .github/workflows/company-intelligence-universe-release.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/pages-publication-queue.test.mjs | 2143 | Nur breite Kanten, z. B. .github/workflows/company-intelligence-universe-release.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/pages-rollback-decision.test.mjs | 12569 | Nur breite Kanten, z. B. .github/workflows/company-intelligence-universe-release.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/production-regression-base.test.mjs | 3271 | Nur breite Kanten, z. B. .github/workflows/company-intelligence-universe-release.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/production.test.mjs | 4352 | Nur breite Kanten, z. B. .github/workflows/company-intelligence-universe-release.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/profile-release-recovery.test.mjs | 12112 | Nur breite Kanten, z. B. .github/workflows/company-intelligence-universe-release.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/propagation-proof-ci.test.mjs | 31101 | Nur breite Kanten, z. B. .github/workflows/company-intelligence-universe-release.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/propagation-proof-hardening.test.mjs | 6408 | Nur breite Kanten, z. B. .github/workflows/company-intelligence-universe-release.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/propagation-proof.test.mjs | 14230 | Nur breite Kanten, z. B. .github/workflows/company-intelligence-universe-release.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/refresh-dispatch-wait.test.mjs | 25059 | Nur breite Kanten, z. B. .github/workflows/company-intelligence-universe-release.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/refresh-live-verify.test.mjs | 16389 | Nur breite Kanten, z. B. .github/workflows/company-intelligence-universe-release.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/refresh-watchdog.test.mjs | 15813 | Nur breite Kanten, z. B. .github/workflows/company-intelligence-universe-release.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/release-health.test.mjs | 5752 | Nur breite Kanten, z. B. .github/workflows/company-intelligence-universe-release.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/retry-live-qa.test.mjs | 12455 | Nur breite Kanten, z. B. .github/workflows/company-intelligence-universe-release.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/rollback-cas.test.mjs | 11891 | Nur breite Kanten, z. B. .github/workflows/company-intelligence-universe-release.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/scheduler-gate.test.mjs | 19009 | Nur breite Kanten, z. B. .github/workflows/company-intelligence-universe-release.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/state.test.mjs | 6027 | Nur breite Kanten, z. B. .github/workflows/company-intelligence-universe-release.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/test_acceptance.py | 36093 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/test_accepted_state_verify.py | 3535 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/test_announcement_datelines.py | 1433 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/test_archive_cooldown.py | 6424 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/test_archive_relative_paths.py | 3006 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/test_archive_unicode_transport.py | 6405 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/test_cached_discovery.py | 5007 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/test_composite_announcements.py | 6286 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/test_consumer_event_review.py | 3101 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/test_consumer_usage.py | 5160 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/test_corporate_header_evidence.py | 3502 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/test_coverage_cost.py | 7046 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/test_covered_news_backfill.py | 8003 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/test_current_state_acceptance.py | 3709 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/test_discovery_batch.py | 17415 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/test_distributor_archive.py | 10761 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/test_dns_circuit.py | 3784 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/test_editorial.py | 4086 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/test_engine.py | 46324 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/test_event_backfill.py | 13020 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/test_external_news_quality.py | 7192 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/test_failure_evidence_checkpoint.py | 3098 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/test_filing_feed_scope.py | 2675 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/test_gcs_layouts.py | 6773 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/test_hardening.py | 29360 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/test_ingestion_calendar.py | 6318 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/test_inventory_runner.py | 7538 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/test_inventory_sweep.py | 19686 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/test_ir_migrations.py | 4859 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/test_ir_navigation_labels.py | 3422 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/test_ir_navigation_scope.py | 2177 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/test_ir_time_retry.py | 5183 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/test_malformed_navigation.py | 2359 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/test_material_hubs.py | 18626 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/test_named_trademark_notice.py | 2880 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/test_news_backfill.py | 10447 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/test_news_quality.py | 6248 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/test_news_sitemap.py | 25872 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/test_oversized_ir_recovery.py | 3338 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/test_ownership_routes.py | 22753 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/test_ownership_time_retry.py | 5514 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/test_poll_circuit.py | 11098 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/test_poll_scope.py | 4709 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/test_private_inventory.py | 1419 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/test_product.py | 15477 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/test_profile_qa_metadata.py | 4370 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/test_profile_samples.py | 3113 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/test_profile_source_audit.py | 5528 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/test_profiles.py | 54107 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/test_publisher_call_context.py | 8348 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/test_q4_events.py | 9446 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/test_q4_presentations.py | 13235 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/test_q4_reports.py | 7401 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/test_reporting_calendar.py | 7073 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/test_retry_queue.py | 3771 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/test_reviewed_source_urls.py | 5096 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/test_root_aliases.py | 8358 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/test_sec_site_candidates.py | 6414 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/test_sec_site_runner.py | 4271 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/test_site_inventory.py | 4158 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/test_source_backfill_runner.py | 9836 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/test_source_registry_audit.py | 3035 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/test_stockpr_events.py | 5723 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/test_structured_ownership.py | 3724 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/test_top46_content.py | 6549 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/test_universe_eligibility.py | 9628 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/test_universe_scheduler.py | 8415 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/test_us_timezones.py | 4511 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/test_wordpress_backfill.py | 11284 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/test_wordpress_instructional_scope.py | 1350 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/test_wordpress_issuer_scope.py | 3064 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/test_wordpress_news.py | 10931 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/test_wordpress_observed_collections.py | 3288 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/universe-eligibility.test.mjs | 4491 | Nur breite Kanten, z. B. .github/workflows/company-intelligence-universe-release.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/universe-refreeze.test.mjs | 21405 | Nur breite Kanten, z. B. .github/workflows/company-intelligence-universe-release.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/version-consumer-assets.test.mjs | 2727 | Nur breite Kanten, z. B. .github/workflows/company-intelligence-universe-release.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/tests/workflow-yaml.test.mjs | 4748 | Nur breite Kanten, z. B. .github/workflows/company-intelligence-universe-release.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/top46_content.py | 13282 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/transport.py | 12080 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/universe_samples.py | 5464 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/wordpress_backfill.py | 11715 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/company_intelligence/wordpress_news.py | 8644 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Nutzung unklar; behalten. |
| scripts/core/eligibility-catchup.mjs | 5940 | Nur breite Kanten, z. B. .github/workflows/core-ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/discover/build-europe-display-quality.mjs | 12043 | Nur breite Kanten, z. B. .github/workflows/discover-ci.yml; Nutzung unklar; behalten. |
| scripts/discover/tests/europe-public-live-qa.test.mjs | 2280 | Nur breite Kanten, z. B. .github/workflows/discover-ci.yml; Nutzung unklar; behalten. |
| scripts/insider/.gitignore | 13 | Nur breite Kanten, z. B. .github/workflows/sec-fundamentals-daily.yml; Nutzung unklar; behalten. |
| scripts/insider/tests/test_form4.py | 12083 | Nur breite Kanten, z. B. .github/workflows/sec-fundamentals-daily.yml; Nutzung unklar; behalten. |
| scripts/insider/tests/test_merge.py | 2521 | Nur breite Kanten, z. B. .github/workflows/sec-fundamentals-daily.yml; Nutzung unklar; behalten. |
| scripts/market/probe-cloudflare-access.mjs | 9580 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Nutzung unklar; behalten. |
| scripts/market/probe-cloudflare-scope.mjs | 8734 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Nutzung unklar; behalten. |
| scripts/market/probe-provider-split.mjs | 2331 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Nutzung unklar; behalten. |
| scripts/market/verify-golden-five-capabilities.mjs | 5723 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Nutzung unklar; behalten. |
| scripts/market/verify-runtime-load.mjs | 31801 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Nutzung unklar; behalten. |
| scripts/market/zero-cost-realtime-model.mjs | 13454 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Nutzung unklar; behalten. |
| scripts/marketstack/europe-discover-history.mjs | 11765 | Nur breite Kanten, z. B. app/README.md; Nutzung unklar; behalten. |
| scripts/marketstack/europe-discover-outputs.mjs | 15592 | Nur breite Kanten, z. B. app/README.md; Nutzung unklar; behalten. |
| scripts/marketstack/tests/europe-live-actions-review.test.mjs | 16918 | Nur breite Kanten, z. B. app/README.md; Nutzung unklar; behalten. |
| scripts/marketstack/tests/europe-xpar-identity-offline.test.mjs | 5105 | Nur breite Kanten, z. B. app/README.md; Nutzung unklar; behalten. |
| scripts/quality/tests/find-unused.test.mjs | 4817 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Nutzung unklar; behalten. |
| scripts/quant/__init__.py | 0 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/quant/audit-security-type-provenance.mjs | 8649 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/quant/build-sec-mapping-dossier.mjs | 7042 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/quant/compare-factor-coverage.mjs | 4012 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/quant/measure-local-coverage-levers.mjs | 16810 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/quant/measure-name-type-evidence.mjs | 10377 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/quant/measure-naming-contract.mjs | 15076 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/quant/measure-security-type-safety.mjs | 10155 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/quant/measure-valuation-coverage.mjs | 12575 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/quant/sec/__init__.py | 0 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/quant/sec/final_report.py | 12163 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/quant/tests/test_ci_scripts.py | 9308 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/quant/tests/test_cli_universe_filter.py | 7636 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/quant/tests/test_concept_census.py | 5348 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/quant/tests/test_consumer_history.py | 8064 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/quant/tests/test_consumer_outputs.py | 4171 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/quant/tests/test_consumer_year_end_hint.py | 3996 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/quant/tests/test_final_report.py | 1332 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/quant/tests/test_fiscal_future_periods.py | 2231 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/quant/tests/test_fsds_supplement.py | 9141 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/quant/tests/test_industry_layer.py | 10845 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/quant/tests/test_ingest_verdict.py | 2199 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/quant/tests/test_persistence.py | 4866 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/quant/tests/test_reconciliation.py | 24778 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/quant/tests/test_registry_expansion.py | 8317 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/quant/tests/test_retry_and_404.py | 4107 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/quant/tests/test_revenue_total_concept.py | 5894 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/quant/tests/test_universe_coverage.py | 18709 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/quant/v11/discovery/cap-correction.cjs | 2516 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/quant/v11/discovery/stages/b0-v10-baselines.json | 2442 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/quant/v11/discovery/stages/s0-smoke.json | 641 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/quant/v11/discovery/stages/s1-fund.json | 14837 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/quant/v11/discovery/stages/s1-price.json | 8344 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/quant/v11/discovery/stages/s1b-price-px5.json | 11013 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/quant/v11/discovery/stages/s2-fund.json | 10668 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/quant/v11/discovery/stages/s2-price.json | 11584 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/quant/v11/discovery/stages/s3-robust.json | 7198 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/quant/v12/indexpop/build-snapshots.cjs | 6381 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/quant/v12/indexpop/summarize_inventory.py | 1737 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/quant/v12/listref/lrlib.py | 3510 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/quant/v12/mcap/adjudicate_validation.py | 5570 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/quant/v13/largecap/seclib13.py | 4457 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/quant/v9-followups/ledger/build_before_after.cjs | 8374 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/quant/v9-followups/ledger/source_ca_events.py | 11767 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/quant/v9-followups/ledger/verify_ca_ledger.py | 18620 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/quant/v9_followups/sec_pipeline/verify_quarantine_detection.py | 9274 | Nur breite Kanten, z. B. .github/workflows/quant-ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/research/edge/edge-st.test.cjs | 2874 | Nur breite Kanten, z. B. app/README.md; Nutzung unklar; behalten. |
| scripts/research/labor/report-labor.cjs | 8992 | Nur breite Kanten, z. B. app/README.md; Nutzung unklar; behalten. |
| scripts/research/labor/tests/test_build_sue.py | 2848 | Nur breite Kanten, z. B. app/README.md; Nutzung unklar; behalten. |
| scripts/social/assess-creative-quality.mjs | 9289 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| scripts/social/check-asset-reachability.mjs | 7420 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| scripts/social/creative-job-report.mjs | 4378 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| scripts/social/diagnose-creative-provider.mjs | 12898 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| scripts/supertrader/fidelity/audit/live-text-and-fundamentals.md | 12406 | Nur breite Kanten, z. B. .github/workflows/supertrader-ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/supertrader/fidelity/canonical/darvas.md | 9013 | Nur breite Kanten, z. B. .github/workflows/supertrader-ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/supertrader/fidelity/canonical/kullamagi.md | 7927 | Nur breite Kanten, z. B. .github/workflows/supertrader-ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/supertrader/fidelity/canonical/minervini.md | 9158 | Nur breite Kanten, z. B. .github/workflows/supertrader-ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/supertrader/fidelity/canonical/turtle.md | 7607 | Nur breite Kanten, z. B. .github/workflows/supertrader-ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/supertrader/fidelity/canonical/weinstein.md | 8052 | Nur breite Kanten, z. B. .github/workflows/supertrader-ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/supertrader/house/DECISION-HS1.json | 1344 | Nur breite Kanten, z. B. .github/workflows/supertrader-ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/supertrader/house/DECISION-HS2.json | 1283 | Nur breite Kanten, z. B. .github/workflows/supertrader-ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/supertrader/house/DECISION-HS3-D1.json | 501 | Nur breite Kanten, z. B. .github/workflows/supertrader-ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/supertrader/house/DECISION-HS3-D2.json | 519 | Nur breite Kanten, z. B. .github/workflows/supertrader-ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/supertrader/house/DECISION-HS3-D3-DEV.json | 693 | Nur breite Kanten, z. B. .github/workflows/supertrader-ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/supertrader/house/DECISION-HS3-D3-HOLDOUT.json | 1030 | Nur breite Kanten, z. B. .github/workflows/supertrader-ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/supertrader/house/DECISION-HS3.json | 675 | Nur breite Kanten, z. B. .github/workflows/supertrader-ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/supertrader/house/DECISION-HS4-OOS2008.json | 1860 | Nur breite Kanten, z. B. .github/workflows/supertrader-ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/supertrader/house/DECISION-HS4.json | 1182 | Nur breite Kanten, z. B. .github/workflows/supertrader-ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/supertrader/snapshot/build-contract-artifact.mjs | 3474 | Nur breite Kanten, z. B. .github/workflows/supertrader-ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/supertrader/tests/chart-by-ticker.test.mjs | 2405 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/supertrader/tests/discover-availability.test.mjs | 3369 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/supertrader/tests/e5-home-view.test.mjs | 134 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/supertrader/tests/europe-gap-aware-pilot.test.mjs | 2916 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/supertrader/tests/europe-readiness.test.mjs | 13965 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/supertrader/tests/identity-links.test.mjs | 1170 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/supertrader/tests/kk-intraday-probe.test.mjs | 2817 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/supertrader/tests/lens-mobile-layout.test.mjs | 3329 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/supertrader/tests/lifecycle.test.mjs | 17180 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/supertrader/tests/payload-slices.test.mjs | 7993 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/supertrader/tests/pilot.test.mjs | 6264 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/supertrader/tests/prune-dead-refs.test.mjs | 17119 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/supertrader/tests/r10-cases.test.mjs | 7094 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/supertrader/tests/r11.test.mjs | 6206 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/supertrader/tests/r12.test.mjs | 7462 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/supertrader/tests/r13.test.mjs | 4278 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/supertrader/tests/r14.test.mjs | 6518 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/supertrader/tests/r4.test.mjs | 9585 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/supertrader/tests/r5.test.mjs | 3573 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/supertrader/tests/r7-diagnose.test.mjs | 2347 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/supertrader/tests/r7-engines.test.mjs | 5379 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/supertrader/tests/r7-live.test.mjs | 6282 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/supertrader/tests/r8-darvas-weinstein.test.mjs | 2435 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/supertrader/tests/r8-kk.test.mjs | 5362 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/supertrader/tests/r8-turtle.test.mjs | 4550 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/supertrader/tests/r9-intraday.test.mjs | 13114 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/supertrader/tests/research-preview.test.mjs | 3435 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/supertrader/tests/restore-full-ledgers.test.mjs | 2360 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/supertrader/tests/sf-kk-sf6-sample.test.mjs | 20226 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/supertrader/tests/sf-screener-export.test.mjs | 2767 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/supertrader/tests/sf-sf5-weinstein-group-proxy.test.mjs | 9879 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/supertrader/tests/sf-sf6-integrity.test.mjs | 14128 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/supertrader/tests/sf-sf6-validation.test.mjs | 13149 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/supertrader/tests/sf-sf7-completion.test.mjs | 2699 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/supertrader/tests/sf-st-hist-top5.test.mjs | 26200 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/supertrader/tests/sf-st-holdout.test.mjs | 2177 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/supertrader/tests/validation-methods.test.mjs | 6893 | Nur breite Kanten, z. B. .github/workflows/company-intelligence.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/supertrader/validation/DECISION-R11.json | 2015 | Nur breite Kanten, z. B. .github/workflows/supertrader-ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/supertrader/validation/DECISION-R12.json | 2100 | Nur breite Kanten, z. B. .github/workflows/supertrader-ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/supertrader/validation/PREREGISTRATION-R10-CASES.json | 5302 | Nur breite Kanten, z. B. .github/workflows/supertrader-ci.yml; Workflow-Schutz; Nutzung unklar; behalten. |
| scripts/vu2/check-qa-strings.mjs | 2427 | Nur breite Kanten, z. B. .github/workflows/pages-release.yml; Nutzung unklar; behalten. |
| scripts/vu2/measure-artifact-coverage.mjs | 2355 | Nur breite Kanten, z. B. .github/workflows/pages-release.yml; Nutzung unklar; behalten. |
| scripts/vu2/measure-intelligence-coherence.mjs | 30958 | Nur breite Kanten, z. B. .github/workflows/pages-release.yml; Nutzung unklar; behalten. |
| scripts/vu2/test_fundamentals_serving.py | 18088 | Nur breite Kanten, z. B. .github/workflows/pages-release.yml; Nutzung unklar; behalten. |
| scripts/vu2/test_product_data_api.py | 5521 | Nur breite Kanten, z. B. .github/workflows/pages-release.yml; Nutzung unklar; behalten. |
| social/methodology/trend-score-v1.json | 1377 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/actions-pr-permission.test.mjs | 4481 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/approval-decision.test.mjs | 11058 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/approval-projection.test.mjs | 19235 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/asset-delivery.test.mjs | 9124 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/asset-hashtag-done.test.mjs | 14072 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/asset-integrity.test.mjs | 8248 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/asset-store.test.mjs | 7655 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/audience-fit.test.mjs | 6986 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/authoring.test.mjs | 23539 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/autonomous-creative-dispatch.test.mjs | 21836 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/chatgpt-work-author.test.mjs | 27650 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/claim-binding.test.mjs | 9866 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/content-cadence.test.mjs | 16123 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/content-claims.test.mjs | 9442 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/content-hash.test.mjs | 5901 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/content-intelligence.test.mjs | 15642 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/content-ladder.test.mjs | 17020 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/content-supply-constitution.test.mjs | 12727 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/content-universe.test.mjs | 7104 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/creative-contract.test.mjs | 8648 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/creative-dispatch-guard.test.mjs | 3951 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/creative-gate.test.mjs | 6495 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/creative-job-reconcile.test.mjs | 29727 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/creative-job.test.mjs | 20710 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/creative-quality.test.mjs | 13446 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/creative-reuse.test.mjs | 13455 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/creator-universe.test.mjs | 10407 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/deploy-request.test.mjs | 6160 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/discover-evidence.test.mjs | 8908 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/dispatch.test.mjs | 10196 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/dryrun-evidence-classes.test.mjs | 11723 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/editorial-ideation.test.mjs | 7365 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/evidence-regime.test.mjs | 9698 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/evidence-shape.test.mjs | 4601 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/external-interest.test.mjs | 7537 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/final-public-text.test.mjs | 11742 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/frequency-learning.test.mjs | 9542 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/german-text.test.mjs | 9110 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/hashtag-access.test.mjs | 13452 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/hashtag-portfolio.test.mjs | 12278 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/hashtags.test.mjs | 10115 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/hook-intelligence.test.mjs | 26713 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/ig-check.test.mjs | 3035 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/ig-client.test.mjs | 1020 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/ingest-creative.test.mjs | 9080 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/ingest-open-creative-jobs.test.mjs | 3348 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/invocation-ledger.test.mjs | 5405 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/ladder-in-cycle.test.mjs | 23565 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/learning-unit.test.mjs | 12227 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/logo-contract.test.mjs | 6774 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/loop-closure.test.mjs | 19150 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/manual-dispatch-proof.test.mjs | 10376 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/manual-mode.test.mjs | 11706 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/manual-now-web-candidate.test.mjs | 4655 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/manual-topic-in-cycle.test.mjs | 16898 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/measurement-window.test.mjs | 8333 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/no-post.test.mjs | 15172 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/north-star-layers.test.mjs | 12237 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/opportunity-slate.test.mjs | 3953 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/orchestrator-adversarial.test.mjs | 14634 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/orchestrator.test.mjs | 27433 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/order-d-done.test.mjs | 10459 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/own-performance.test.mjs | 10037 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/owner-decision-ingest.test.mjs | 11030 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/owner-decision.test.mjs | 14545 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/p0-regression.test.mjs | 4360 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/performance-ingest.test.mjs | 15153 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/preflight-classifier.test.mjs | 7512 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/preflight-transport.test.mjs | 6731 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/product-readiness.test.mjs | 11519 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/production-readiness.test.mjs | 16716 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/provenance.test.mjs | 9152 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/provider-lifecycle.test.mjs | 19055 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/public-base-url.test.mjs | 7401 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/publish-candidate.test.mjs | 24311 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/readiness-evidence.test.mjs | 15830 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/recover-creative.test.mjs | 6020 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/render-asset.test.mjs | 28696 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/request-creative-web-force-attempt.test.mjs | 6811 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/revision-instruction.test.mjs | 8756 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/revision-lookup.test.mjs | 3235 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/rss-parse.test.mjs | 2422 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/run-lease.test.mjs | 8804 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/score-decomposition.test.mjs | 6901 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/scroll-stop.test.mjs | 25577 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/smoke-post-content.test.mjs | 6509 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/smoke-workflow.test.mjs | 6043 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/source-registry.test.mjs | 7778 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/store-asset.test.mjs | 3505 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/story-selection.test.mjs | 4319 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/strategy-memory.test.mjs | 5430 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/verify-revision-result.test.mjs | 15043 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/visual-composition.test.mjs | 8916 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/visual-direction-derivation.test.mjs | 12317 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/visual-direction-in-graph.test.mjs | 6912 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/visual-grammar.test.mjs | 21816 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/visual-motif.test.mjs | 3427 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/visual-provider.test.mjs | 5418 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/visual-quality.test.mjs | 8982 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/web-research.test.mjs | 14082 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/work-owns-the-post.test.mjs | 32538 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/youtube-query-portfolio.test.mjs | 11456 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| social/tests/youtube-source.test.mjs | 7972 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| studio/reels/templates/meta-muse/README.md | 2081 | Nur breite Kanten, z. B. .claude/skills/reel-studio/SKILL.md; Nutzung unklar; behalten. |
| studio/reels/templates/quartalszahlen/README.md | 1038 | Nur breite Kanten, z. B. .claude/skills/reel-studio/SKILL.md; Nutzung unklar; behalten. |
| studio/reels/templates/tesla-ark/tts_request.json | 873 | Nur breite Kanten, z. B. .claude/skills/reel-studio/SKILL.md; Nutzung unklar; behalten. |
| supabase/migrations/20261025000100_accounts_core.sql | 7348 | Nur breite Kanten, z. B. .github/workflows/account-ci.yml; Nutzung unklar; behalten. |
| supabase/migrations/20261025000200_plans_entitlements.sql | 5564 | Nur breite Kanten, z. B. .github/workflows/account-ci.yml; Nutzung unklar; behalten. |
| supabase/migrations/20261025000400_watchlists.sql | 4852 | Nur breite Kanten, z. B. .github/workflows/account-ci.yml; Nutzung unklar; behalten. |
| supabase/migrations/20261026000100_cancellation_confirmation.sql | 4290 | Nur breite Kanten, z. B. .github/workflows/account-ci.yml; Nutzung unklar; behalten. |
| supabase/migrations/20261027000100_cancellation_processing.sql | 17834 | Nur breite Kanten, z. B. .github/workflows/account-ci.yml; Nutzung unklar; behalten. |
| supabase/migrations/20261027000200_registration_gate.sql | 3482 | Nur breite Kanten, z. B. .github/workflows/account-ci.yml; Nutzung unklar; behalten. |
| supabase/migrations/20261030000100_pricing_admin.sql | 8372 | Nur breite Kanten, z. B. .github/workflows/account-ci.yml; Nutzung unklar; behalten. |
| supabase/migrations/20261107000200_push_types_extended.sql | 1405 | Nur breite Kanten, z. B. .github/workflows/account-ci.yml; Nutzung unklar; behalten. |
| supabase/tests/02_plans_catalog.sql | 1929 | Nur breite Kanten, z. B. .github/workflows/account-ci.yml; Nutzung unklar; behalten. |
| supabase/tests/05_cancellation.sql | 2306 | Nur breite Kanten, z. B. .github/workflows/account-ci.yml; Nutzung unklar; behalten. |
| supabase/tests/06_cancellation_processing.sql | 7496 | Nur breite Kanten, z. B. .github/workflows/account-ci.yml; Nutzung unklar; behalten. |
| supabase/tests/07_registration_gate.sql | 1884 | Nur breite Kanten, z. B. .github/workflows/account-ci.yml; Nutzung unklar; behalten. |
| supabase/tests/09_free_pro.sql | 1820 | Nur breite Kanten, z. B. .github/workflows/account-ci.yml; Nutzung unklar; behalten. |
| supabase/tests/10_produktivstart.sql | 6994 | Nur breite Kanten, z. B. .github/workflows/account-ci.yml; Nutzung unklar; behalten. |
| supabase/tests/13_redesign_settings_searches.sql | 8559 | Nur breite Kanten, z. B. .github/workflows/account-ci.yml; Nutzung unklar; behalten. |
| willkommen/tests/start.test.mjs | 6170 | Nur breite Kanten, z. B. .github/workflows/ci.yml; Nutzung unklar; behalten. |
| workers/vision-universe-social/README.md | 7691 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| workers/vision-universe-social/tests/approval-adversarial.test.mjs | 21965 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| workers/vision-universe-social/tests/approval-asset-gate.test.mjs | 24051 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| workers/vision-universe-social/tests/approval-card.test.mjs | 20078 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| workers/vision-universe-social/tests/approval-content-status.test.mjs | 11203 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| workers/vision-universe-social/tests/approval-decision.test.mjs | 31750 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| workers/vision-universe-social/tests/approval-manual-run.test.mjs | 10954 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| workers/vision-universe-social/tests/approval-queue.test.mjs | 14232 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| workers/vision-universe-social/tests/approval-session.test.mjs | 19665 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| workers/vision-universe-social/tests/approval.test.mjs | 13018 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| workers/vision-universe-social/tests/asset-fingerprint.test.mjs | 8197 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| workers/vision-universe-social/tests/business-assets.test.mjs | 13640 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| workers/vision-universe-social/tests/business-login.test.mjs | 11995 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| workers/vision-universe-social/tests/carousel.test.mjs | 8219 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| workers/vision-universe-social/tests/hashtag-capability.test.mjs | 9635 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| workers/vision-universe-social/tests/insights.test.mjs | 13353 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| workers/vision-universe-social/tests/instagram-linkage.test.mjs | 12728 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| workers/vision-universe-social/tests/manual-run-adversarial.test.mjs | 12377 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| workers/vision-universe-social/tests/oauth.test.mjs | 19811 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| workers/vision-universe-social/tests/owner-configuration.test.mjs | 6895 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| workers/vision-universe-social/tests/profile.test.mjs | 3755 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| workers/vision-universe-social/tests/publish-idempotent.test.mjs | 20657 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| workers/vision-universe-social/tests/reel-background.test.mjs | 22046 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| workers/vision-universe-social/tests/smoke-publish.test.mjs | 19766 | Nur breite Kanten, z. B. .github/workflows/social-ci.yml; Nutzung unklar; behalten. |
| workers/vu-ask/README.md | 7350 | Nur breite Kanten, z. B. .github/workflows/ci.yml; Nutzung unklar; behalten. |

## Workflow-Schutz in den benannten Bereichen

| Datei | Beleg (Workflow) |
|---|---|
| landing/review/README.md | .github/workflows/ci.yml |
| landing/review/compact-signup/README.md | .github/workflows/ci.yml |
| landing/review/compact-signup/after-desktop.png | .github/workflows/ci.yml |
| landing/review/compact-signup/after-iphone.png | .github/workflows/ci.yml |
| landing/review/compact-signup/before-desktop.png | .github/workflows/ci.yml |
| landing/review/compact-signup/before-iphone.png | .github/workflows/ci.yml |
| landing/review/compact-signup/expanded-iphone.png | .github/workflows/ci.yml |
| landing/review/comparison-desktop.png | .github/workflows/ci.yml |
| landing/review/comparison-iphone.png | .github/workflows/ci.yml |
| landing/review/design-comparison.json | .github/workflows/ci.yml |
| landing/review/desktop.png | .github/workflows/ci.yml |
| landing/review/iphone.png | .github/workflows/ci.yml |
| landing/review/landing-desktop-viewport.png | .github/workflows/ci.yml |
| landing/review/landing-iphone-viewport.png | .github/workflows/ci.yml |
| landing/review/metrics.json | .github/workflows/ci.yml |
| landing/review/redesign/README.md | .github/workflows/ci.yml |
| landing/review/redesign/after-datenschutz-desktop.png | .github/workflows/ci.yml |
| landing/review/redesign/after-datenschutz-iphone.png | .github/workflows/ci.yml |
| landing/review/redesign/after-desktop.png | .github/workflows/ci.yml |
| landing/review/redesign/after-impressum-desktop.png | .github/workflows/ci.yml |
| landing/review/redesign/after-impressum-iphone.png | .github/workflows/ci.yml |
| landing/review/redesign/after-iphone-se.png | .github/workflows/ci.yml |
| landing/review/redesign/after-iphone.png | .github/workflows/ci.yml |
| landing/review/redesign/after-newsletter-desktop.png | .github/workflows/ci.yml |
| landing/review/redesign/after-newsletter-iphone.png | .github/workflows/ci.yml |
| landing/review/redesign/before-desktop.png | .github/workflows/ci.yml |
| landing/review/redesign/before-imprint-desktop.png | .github/workflows/ci.yml |
| landing/review/redesign/before-imprint-iphone.png | .github/workflows/ci.yml |
| landing/review/redesign/before-iphone.png | .github/workflows/ci.yml |
| landing/review/redesign/checks.json | .github/workflows/ci.yml |
| landing/review/redesign/state-error-desktop.png | .github/workflows/ci.yml |
| landing/review/redesign/state-error-iphone.png | .github/workflows/ci.yml |
| landing/review/redesign/state-pending-desktop.png | .github/workflows/ci.yml |
| landing/review/redesign/state-pending-iphone.png | .github/workflows/ci.yml |
| landing/review/research-desktop.png | .github/workflows/ci.yml |
| landing/review/research-iphone.png | .github/workflows/ci.yml |
| scripts/access-gate/browser-qa.mjs | .github/workflows/ci.yml, .github/workflows/pages-release.yml |
| scripts/access-gate/build.mjs | .github/workflows/ci.yml, .github/workflows/pages-release.yml |
| scripts/access-gate/build.test.mjs | .github/workflows/ci.yml, .github/workflows/company-intelligence.yml, .github/workflows/pages-release.yml |
| scripts/account/assert-no-billing-secrets.mjs | .github/workflows/account-ci.yml |
| scripts/account/brevo-setup.mjs | .github/workflows/account-ci.yml, .github/workflows/account-production-checks.yml |
| scripts/account/browser-qa.mjs | .github/workflows/account-ci.yml |
| scripts/account/cancellations.mjs | .github/workflows/account-cancellations.yml, .github/workflows/account-ci.yml |
| scripts/account/check-auto-env.mjs | .github/workflows/account-backup.yml, .github/workflows/account-ci.yml, .github/workflows/account-production-auto.yml, .github/workflows/account-production-checks.yml |
| scripts/account/check-public-checkout.mjs | .github/workflows/account-ci.yml, .github/workflows/account-production-auto.yml, .github/workflows/account-production-deploy.yml |
| scripts/account/dev-server.mjs | .github/workflows/account-ci.yml |
| scripts/account/journey-qa.mjs | .github/workflows/account-ci.yml |
| scripts/account/migrate-production.mjs | .github/workflows/account-ci.yml, .github/workflows/account-db-approved.yml, .github/workflows/account-production-auto.yml |
| scripts/account/quant-watch-coupling-qa.mjs | .github/workflows/account-ci.yml |
| scripts/account/release-guard.mjs | .github/workflows/account-ci.yml, .github/workflows/account-production-auto.yml, .github/workflows/account-production-checks.yml |
| scripts/account/sql-tests.mjs | .github/workflows/account-ci.yml |
| scripts/account/stripe-live-check.mjs | .github/workflows/account-ci.yml, .github/workflows/account-production-checks.yml |
| scripts/account/stripe-live-setup.mjs | .github/workflows/account-ci.yml, .github/workflows/account-production-stripe.yml |
| scripts/account/supabase-auth-config.mjs | .github/workflows/account-ci.yml, .github/workflows/account-production-auth.yml |
| scripts/account/tests/check-auto-env.test.mjs | .github/workflows/account-ci.yml, .github/workflows/account-production-auto.yml |
| scripts/account/tests/check-public-checkout.test.mjs | .github/workflows/account-ci.yml, .github/workflows/account-production-auto.yml |
| scripts/account/tests/migrate-production.test.mjs | .github/workflows/account-ci.yml, .github/workflows/account-production-auto.yml |
| scripts/account/tests/release-guard.test.mjs | .github/workflows/account-ci.yml, .github/workflows/account-production-auto.yml |
| scripts/account/tests/workflow-environments.test.mjs | .github/workflows/account-ci.yml, .github/workflows/account-production-auto.yml |
| scripts/account/watchlist-load.mjs | .github/workflows/account-ci.yml |
| scripts/account/watchlist-qa.mjs | .github/workflows/account-ci.yml |
| scripts/analysts/fetch-consensus.mjs | .github/workflows/content.yml |
| scripts/analysts/probe-consensus.mjs | .github/workflows/content.yml |
| scripts/brevo/cli.py | .github/workflows/brevo-admin.yml, .github/workflows/ci.yml, .github/workflows/sec-fundamentals-universe.yml |
| scripts/brevo/internal_membership.py | .github/workflows/brevo-internal-membership.yml, .github/workflows/ci.yml |
| scripts/brevo/newsletter_actions.py | .github/workflows/brevo-newsletter.yml, .github/workflows/ci.yml |
| scripts/ci/ci-checks.json | .github/workflows/ci.yml |
| scripts/ci/commit-and-push.sh | .github/workflows/ci.yml, .github/workflows/currency-fx-verify.yml, .github/workflows/currency-realtime-proof.yml, .github/workflows/multi-asset-data.yml, .github/workflows/pipeline-daily.yml, .github/workflows/sec-fundamentals-daily.yml, .github/workflows/sec-fundamentals-universe.yml, .github/workflows/supertrader-signals.yml |
| scripts/ci/overlay-data-branch.mjs | .github/workflows/ci.yml, .github/workflows/pages-release.yml |
| scripts/ci/pipeline-alarm.mjs | .github/workflows/ci.yml, .github/workflows/freshness-monitor.yml, .github/workflows/market-data-refresh.yml, .github/workflows/sec-consumer-fundamentals.yml, .github/workflows/security-master-weekly.yml, .github/workflows/supertrader-sf8-candidates.yml, .github/workflows/technical-world.yml |
| scripts/ci/pruefe-datengroesse.sh | .github/workflows/ci.yml, .github/workflows/sec-fundamentals-daily.yml, .github/workflows/sec-fundamentals-universe.yml |
| scripts/ci/pruefe-json.sh | .github/workflows/ci.yml, .github/workflows/ownership-signals.yml, .github/workflows/sec-fundamentals-daily.yml, .github/workflows/sec-fundamentals-universe.yml |
| scripts/ci/push-data-branch.sh | .github/workflows/ci.yml, .github/workflows/content.yml, .github/workflows/sec-fundamentals-daily.yml |
| scripts/ci/push-with-retry.sh | .github/workflows/ci.yml, .github/workflows/cloudflare-deploy.yml, .github/workflows/company-logos.yml, .github/workflows/company-names.yml, .github/workflows/content.yml, .github/workflows/coverage-metrics.yml, .github/workflows/discover-im-blick-live.yml, .github/workflows/elliott-prospective-registry.yml, .github/workflows/emerging-leaders-study.yml, .github/workflows/europe-discover-refresh.yml, .github/workflows/home-refresh.yml, .github/workflows/index-membership.yml, .github/workflows/intraday-snapshots.yml, .github/workflows/ki-depots-daily.yml, .github/workflows/landing-pages-publish.yml, .github/workflows/long-series.yml, .github/workflows/market-data-refresh.yml, .github/workflows/monitor.yml, .github/workflows/ownership-signals.yml, .github/workflows/pages-release.yml, .github/workflows/pattern-research-volume.yml, .github/workflows/pipeline-daily.yml, .github/workflows/product-intelligence-materialization.yml, .github/workflows/quant-model-depots.yml, .github/workflows/quant-portfolio-research.yml, .github/workflows/research-edge2-paper.yml, .github/workflows/research-labor.yml, .github/workflows/research-signals-s2.yml, .github/workflows/sec-consumer-fundamentals.yml, .github/workflows/sec-sic-history.yml, .github/workflows/security-master-eligibility.yml, .github/workflows/security-master-weekly.yml, .github/workflows/supertrader-paper-2027.yml, .github/workflows/supertrader-research-snapshot.yml, .github/workflows/supertrader-sf8-candidates.yml, .github/workflows/sync-navigation.yml, .github/workflows/technical-intelligence-build.yml, .github/workflows/technical-world.yml, .github/workflows/tiingo-scale.yml, .github/workflows/universe-master.yml, .github/workflows/update-sec-fundamentals.yml, .github/workflows/vorsorge-etf-sources.yml, .github/workflows/vorsorge-etf-universe.yml, .github/workflows/vorsorge-legal-sources.yml |
| scripts/ci/select-checks.mjs | .github/workflows/ci.yml |
| scripts/ci/state-gate.mjs | .github/workflows/ci.yml, .github/workflows/core-ci.yml |
| scripts/ci/static-server.mjs | .github/workflows/ci.yml, .github/workflows/shell-ci.yml |
| scripts/ci/supertrader-chain.mjs | .github/workflows/ci.yml, .github/workflows/freshness-monitor.yml, .github/workflows/market-data-refresh.yml, .github/workflows/supertrader-signals.yml |
| scripts/company_intelligence/acceptance.py | .github/workflows/company-intelligence.yml, .github/workflows/pages-release.yml |
| scripts/company_intelligence/accepted_state_verify.py | .github/workflows/company-intelligence.yml, .github/workflows/pages-release.yml |
| scripts/company_intelligence/checkpoint.py | .github/workflows/company-intelligence.yml, .github/workflows/pages-release.yml |
| scripts/company_intelligence/classify-live-failure.mjs | .github/workflows/company-intelligence.yml, .github/workflows/pages-release.yml |
| scripts/company_intelligence/classify-production-regressions.mjs | .github/workflows/company-intelligence.yml, .github/workflows/pages-release.yml |
| scripts/company_intelligence/cli.py | .github/workflows/company-intelligence.yml, .github/workflows/pages-release.yml, .github/workflows/sec-fundamentals-universe.yml |
| scripts/company_intelligence/consumer-cache-key.mjs | .github/workflows/company-intelligence.yml, .github/workflows/pages-release.yml |
| scripts/company_intelligence/consumer-experience-qa.mjs | .github/workflows/company-intelligence.yml, .github/workflows/pages-release.yml |
| scripts/company_intelligence/consumer_delivery_audit.py | .github/workflows/company-intelligence.yml, .github/workflows/pages-release.yml |
| scripts/company_intelligence/continuous_refresh.py | .github/workflows/company-intelligence-universe-release.yml, .github/workflows/company-intelligence.yml, .github/workflows/pages-release.yml |
| scripts/company_intelligence/deployment-mode.mjs | .github/workflows/company-intelligence.yml, .github/workflows/pages-release.yml |
| scripts/company_intelligence/discover-beta-qa.mjs | .github/workflows/company-intelligence.yml, .github/workflows/pages-release.yml |
| scripts/company_intelligence/download-public.mjs | .github/workflows/company-intelligence.yml, .github/workflows/pages-release.yml |
| scripts/company_intelligence/failure-gate-decision.mjs | .github/workflows/company-intelligence-profile-source.yml, .github/workflows/company-intelligence.yml, .github/workflows/pages-release.yml |
| scripts/company_intelligence/handoff-transfer.mjs | .github/workflows/company-intelligence.yml, .github/workflows/pages-release.yml |
| scripts/company_intelligence/install-browser-deps.mjs | .github/workflows/company-intelligence-profile-source.yml, .github/workflows/company-intelligence-refresh.yml, .github/workflows/company-intelligence-universe-release.yml, .github/workflows/company-intelligence.yml, .github/workflows/pages-release.yml |
| scripts/company_intelligence/live-browser-setup.sh | .github/workflows/company-intelligence.yml, .github/workflows/pages-release.yml |
| scripts/company_intelligence/live-production-qa.mjs | .github/workflows/company-intelligence.yml, .github/workflows/pages-release.yml |
| scripts/company_intelligence/live-qa-suite.sh | .github/workflows/company-intelligence.yml, .github/workflows/pages-release.yml |
| scripts/company_intelligence/navigation-lifecycle-qa.mjs | .github/workflows/company-intelligence-universe-release.yml, .github/workflows/company-intelligence.yml, .github/workflows/pages-release.yml |
| scripts/company_intelligence/numeric-band-review.mjs | .github/workflows/company-intelligence.yml, .github/workflows/pages-release.yml |
| scripts/company_intelligence/observe-production.mjs | .github/workflows/company-intelligence-refresh.yml, .github/workflows/company-intelligence.yml, .github/workflows/pages-release.yml |
| scripts/company_intelligence/pages-rollback-decision.mjs | .github/workflows/company-intelligence-refresh.yml, .github/workflows/company-intelligence.yml, .github/workflows/pages-release.yml |
| scripts/company_intelligence/pilot.sh | .github/workflows/company-intelligence.yml, .github/workflows/pages-release.yml |
| scripts/company_intelligence/production-approval.mjs | .github/workflows/company-intelligence.yml, .github/workflows/pages-release.yml |
| scripts/company_intelligence/production-off-qa.mjs | .github/workflows/company-intelligence.yml, .github/workflows/pages-release.yml |
| scripts/company_intelligence/production-release.mjs | .github/workflows/company-intelligence-profile-source.yml, .github/workflows/company-intelligence-refresh.yml, .github/workflows/company-intelligence.yml, .github/workflows/pages-release.yml |
| scripts/company_intelligence/profile-source-run.mjs | .github/workflows/company-intelligence-profile-source.yml, .github/workflows/company-intelligence.yml, .github/workflows/pages-release.yml |
| scripts/company_intelligence/profile_source_audit.py | .github/workflows/company-intelligence.yml, .github/workflows/pages-release.yml |
| scripts/company_intelligence/protected-hydration-qa.mjs | .github/workflows/company-intelligence.yml, .github/workflows/pages-release.yml |
| scripts/company_intelligence/public-delivery.mjs | .github/workflows/company-intelligence-universe-release.yml, .github/workflows/company-intelligence.yml, .github/workflows/pages-release.yml |
| scripts/company_intelligence/refreeze-auto-guard.mjs | .github/workflows/company-intelligence-refreeze-auto.yml, .github/workflows/company-intelligence.yml, .github/workflows/pages-release.yml |
| scripts/company_intelligence/refresh-dispatch-wait.mjs | .github/workflows/company-intelligence-refresh.yml, .github/workflows/company-intelligence.yml, .github/workflows/pages-release.yml |
| scripts/company_intelligence/refresh-live-verify.mjs | .github/workflows/company-intelligence-refresh.yml, .github/workflows/company-intelligence.yml, .github/workflows/pages-release.yml |
| scripts/company_intelligence/refresh-publication.mjs | .github/workflows/company-intelligence-refresh.yml, .github/workflows/company-intelligence.yml, .github/workflows/pages-release.yml |
| scripts/company_intelligence/refresh-qa.mjs | .github/workflows/company-intelligence-profile-source.yml, .github/workflows/company-intelligence-universe-release.yml, .github/workflows/company-intelligence.yml, .github/workflows/pages-release.yml |
| scripts/company_intelligence/refresh-run.mjs | .github/workflows/company-intelligence-health.yml, .github/workflows/company-intelligence-profile-source.yml, .github/workflows/company-intelligence-refresh.yml, .github/workflows/company-intelligence-universe-release.yml, .github/workflows/company-intelligence.yml, .github/workflows/pages-release.yml |
| scripts/company_intelligence/refresh-storage.mjs | .github/workflows/company-intelligence-universe-release.yml, .github/workflows/company-intelligence.yml, .github/workflows/pages-release.yml |
| scripts/company_intelligence/refresh-watchdog.mjs | .github/workflows/company-intelligence-refresh-watchdog.yml, .github/workflows/company-intelligence.yml, .github/workflows/pages-release.yml |
| scripts/company_intelligence/release-health.mjs | .github/workflows/company-intelligence-universe-release.yml, .github/workflows/company-intelligence.yml, .github/workflows/pages-release.yml |
| scripts/company_intelligence/retry-live-qa.mjs | .github/workflows/company-intelligence.yml, .github/workflows/pages-release.yml |
| scripts/company_intelligence/scheduler-gate.mjs | .github/workflows/company-intelligence-refresh.yml, .github/workflows/company-intelligence.yml, .github/workflows/pages-release.yml |
| scripts/company_intelligence/stage-discover-preview.mjs | .github/workflows/company-intelligence.yml, .github/workflows/pages-release.yml |
| scripts/company_intelligence/sync-state.mjs | .github/workflows/company-intelligence.yml, .github/workflows/pages-release.yml |
| scripts/company_intelligence/tests/continuous-refresh.test.mjs | .github/workflows/company-intelligence-profile-source.yml, .github/workflows/company-intelligence-refresh.yml, .github/workflows/company-intelligence-universe-release.yml, .github/workflows/company-intelligence.yml, .github/workflows/pages-release.yml |
| scripts/company_intelligence/tests/refresh-publication.test.mjs | .github/workflows/company-intelligence-refresh.yml, .github/workflows/company-intelligence-universe-release.yml, .github/workflows/company-intelligence.yml, .github/workflows/pages-release.yml |
| scripts/company_intelligence/tests/test_continuous_refresh.py | .github/workflows/company-intelligence-refresh.yml, .github/workflows/company-intelligence.yml, .github/workflows/pages-release.yml |
| scripts/company_intelligence/tests/test_reviewed_profiles.py | .github/workflows/company-intelligence-profile-source.yml, .github/workflows/company-intelligence.yml, .github/workflows/pages-release.yml |
| scripts/company_intelligence/tests/test_source_onboarding.py | .github/workflows/company-intelligence-profile-source.yml, .github/workflows/company-intelligence.yml, .github/workflows/pages-release.yml |
| scripts/company_intelligence/tests/universe-identity-prune.test.mjs | .github/workflows/company-intelligence-profile-source.yml, .github/workflows/company-intelligence-universe-release.yml, .github/workflows/company-intelligence.yml, .github/workflows/pages-release.yml |
| scripts/company_intelligence/universe-audit.mjs | .github/workflows/company-intelligence-universe-release.yml, .github/workflows/company-intelligence.yml, .github/workflows/pages-release.yml |
| scripts/company_intelligence/universe-browser-qa.mjs | .github/workflows/company-intelligence-profile-source.yml, .github/workflows/company-intelligence-universe-release.yml, .github/workflows/company-intelligence.yml, .github/workflows/pages-release.yml |
| scripts/company_intelligence/universe-release.mjs | .github/workflows/company-intelligence-refreeze-auto.yml, .github/workflows/company-intelligence-universe-release.yml, .github/workflows/company-intelligence.yml, .github/workflows/pages-release.yml |
| scripts/company_intelligence/universe_eligibility.py | .github/workflows/company-intelligence-universe-release.yml, .github/workflows/company-intelligence.yml, .github/workflows/pages-release.yml |
| scripts/company_intelligence/universe_scheduler.py | .github/workflows/company-intelligence-universe-release.yml, .github/workflows/company-intelligence.yml, .github/workflows/pages-release.yml |
| scripts/company_intelligence/verify_consumer_handoff.py | .github/workflows/company-intelligence.yml, .github/workflows/pages-release.yml |
| scripts/core/adoption-matrix.mjs | .github/workflows/core-ci.yml |
| scripts/core/data-quality.mjs | .github/workflows/core-ci.yml, .github/workflows/supertrader-sf8-candidates.yml |
| scripts/core/diagnose.mjs | .github/workflows/core-ci.yml |
| scripts/core/eligibility-catchup.mjs | .github/workflows/core-ci.yml |
| scripts/core/eligibility-gate.mjs | .github/workflows/core-ci.yml, .github/workflows/security-master-eligibility.yml |
| scripts/core/lib.mjs | .github/workflows/core-ci.yml |
| scripts/core/load-sic-history.mjs | .github/workflows/core-ci.yml |
| scripts/core/query-universe-snapshot.mjs | .github/workflows/core-ci.yml |
| scripts/core/r2-audit.mjs | .github/workflows/core-ci.yml, .github/workflows/r2-audit.yml |
| scripts/core/stale-tails/build_evidence.py | .github/workflows/core-ci.yml |
| scripts/core/stale-tails/check_stale_tails.py | .github/workflows/core-ci.yml |
| scripts/core/stale-tails/sec_sample.py | .github/workflows/core-ci.yml |
| scripts/core/stock-availability.mjs | .github/workflows/core-ci.yml |
| scripts/core/system-health.mjs | .github/workflows/core-ci.yml |
| scripts/dashboard/backtest_technicals.py | .github/workflows/sec-fundamentals-ci.yml |
| scripts/dashboard/calculate_scenarios.py | .github/workflows/sec-fundamentals-ci.yml |
| scripts/dashboard/calculate_technicals.py | .github/workflows/sec-fundamentals-ci.yml |
| scripts/dashboard/fetch_analyst_ratings.py | .github/workflows/content.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/dashboard/fetch_fundamentals.py | .github/workflows/sec-fundamentals-ci.yml |
| scripts/dashboard/fetch_market_data.py | .github/workflows/sec-fundamentals-ci.yml |
| scripts/dashboard/migrate_adjustment_semantics.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/dashboard/price_semantics.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/dashboard/update_news.mjs | .github/workflows/content.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/dashboard/verify_adjustment_gate.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/design/sync-product-hero.mjs | .github/workflows/technical-ci.yml |
| scripts/diagnose/coverage-delta.mjs | .github/workflows/coverage-metrics.yml |
| scripts/discover/assert-consumer-clean.mjs | .github/workflows/discover-ci.yml, .github/workflows/discover-frontend-ci.yml, .github/workflows/monitor.yml |
| scripts/discover/assert-source-state-coverage.mjs | .github/workflows/discover-ci.yml, .github/workflows/discover-frontend-ci.yml, .github/workflows/monitor.yml |
| scripts/discover/browser-qa-direct.mjs | .github/workflows/discover-ci.yml, .github/workflows/discover-frontend-ci.yml |
| scripts/discover/browser-qa-live.mjs | .github/workflows/discover-ci.yml, .github/workflows/discover-frontend-ci.yml, .github/workflows/monitor.yml |
| scripts/discover/browser-qa-maerkte.mjs | .github/workflows/discover-ci.yml, .github/workflows/discover-frontend-ci.yml, .github/workflows/monitor.yml |
| scripts/discover/browser-qa-realtime.mjs | .github/workflows/discover-ci.yml, .github/workflows/discover-frontend-ci.yml, .github/workflows/monitor.yml |
| scripts/discover/browser-qa.mjs | .github/workflows/discover-ci.yml, .github/workflows/discover-frontend-ci.yml, .github/workflows/monitor.yml |
| scripts/discover/build-company-logos.mjs | .github/workflows/company-logos.yml, .github/workflows/discover-ci.yml, .github/workflows/discover-frontend-ci.yml |
| scripts/discover/build-discover-data.mjs | .github/workflows/company-names.yml, .github/workflows/discover-ci.yml, .github/workflows/discover-frontend-ci.yml, .github/workflows/europe-discover-refresh.yml, .github/workflows/index-membership.yml, .github/workflows/long-series.yml, .github/workflows/market-data-refresh.yml, .github/workflows/sec-consumer-fundamentals.yml, .github/workflows/security-master-eligibility.yml, .github/workflows/universe-master.yml |
| scripts/discover/build-im-blick-live.mjs | .github/workflows/discover-ci.yml, .github/workflows/discover-frontend-ci.yml, .github/workflows/discover-im-blick-live.yml, .github/workflows/market-data-refresh.yml |
| scripts/discover/check-im-blick-live.mjs | .github/workflows/discover-ci.yml, .github/workflows/discover-frontend-ci.yml, .github/workflows/discover-im-blick-live.yml, .github/workflows/freshness-monitor.yml |
| scripts/discover/company-logos-web.mjs | .github/workflows/company-logos.yml, .github/workflows/discover-ci.yml, .github/workflows/discover-frontend-ci.yml |
| scripts/discover/consolidation-gate.mjs | .github/workflows/discover-ci.yml, .github/workflows/discover-frontend-ci.yml |
| scripts/discover/deploy-switch-qa.mjs | .github/workflows/discover-ci.yml, .github/workflows/discover-frontend-ci.yml |
| scripts/discover/europe-continuity-live-qa.mjs | .github/workflows/discover-ci.yml, .github/workflows/discover-frontend-ci.yml, .github/workflows/monitor.yml |
| scripts/discover/europe-public-live-qa.mjs | .github/workflows/discover-ci.yml, .github/workflows/discover-frontend-ci.yml, .github/workflows/monitor.yml |
| scripts/discover/global-live-qa.mjs | .github/workflows/discover-ci.yml, .github/workflows/discover-frontend-ci.yml, .github/workflows/monitor.yml |
| scripts/discover/global-search-index.mjs | .github/workflows/discover-ci.yml, .github/workflows/discover-frontend-ci.yml, .github/workflows/europe-discover-refresh.yml |
| scripts/discover/known-defects.json | .github/workflows/discover-ci.yml, .github/workflows/discover-frontend-ci.yml |
| scripts/discover/logo-candidates.mjs | .github/workflows/company-logos.yml, .github/workflows/discover-ci.yml, .github/workflows/discover-frontend-ci.yml |
| scripts/discover/resolve-europe-live-release.mjs | .github/workflows/discover-ci.yml, .github/workflows/discover-frontend-ci.yml, .github/workflows/monitor.yml |
| scripts/discover/review-logos.mjs | .github/workflows/company-logos.yml, .github/workflows/discover-ci.yml, .github/workflows/discover-frontend-ci.yml |
| scripts/discover/serve-https.mjs | .github/workflows/discover-ci.yml, .github/workflows/discover-frontend-ci.yml, .github/workflows/monitor.yml |
| scripts/discover/verify-discover-data.mjs | .github/workflows/company-names.yml, .github/workflows/discover-ci.yml, .github/workflows/discover-frontend-ci.yml, .github/workflows/index-membership.yml, .github/workflows/long-series.yml, .github/workflows/market-data-refresh.yml, .github/workflows/sec-consumer-fundamentals.yml, .github/workflows/security-master-eligibility.yml |
| scripts/discover/watchlist-coupling-qa.mjs | .github/workflows/account-ci.yml, .github/workflows/discover-ci.yml, .github/workflows/discover-frontend-ci.yml |
| scripts/fundamental/build-history.mjs | .github/workflows/ci.yml, .github/workflows/shell-ci.yml |
| scripts/fundamental/sec-freshness.mjs | .github/workflows/ci.yml, .github/workflows/fundamental-sec-freshness.yml, .github/workflows/shell-ci.yml |
| scripts/fundamental/verify-publication.mjs | .github/workflows/ci.yml, .github/workflows/fundamental-sec-freshness.yml, .github/workflows/shell-ci.yml |
| scripts/hedgefonds/fetch_edgar_data.py | .github/workflows/ci.yml, .github/workflows/content.yml |
| scripts/hedgefonds/fund_meta.py | .github/workflows/ci.yml |
| scripts/hedgefonds/test_fetch_edgar_data.py | .github/workflows/ci.yml |
| scripts/home/build-home.mjs | .github/workflows/home-refresh.yml |
| scripts/home/cancel-link.mjs | .github/workflows/account-ci.yml, .github/workflows/home-refresh.yml |
| scripts/insider/form4-compact.mjs | .github/workflows/ownership-signals.yml, .github/workflows/sec-fundamentals-daily.yml |
| scripts/insider/form4.py | .github/workflows/sec-fundamentals-daily.yml |
| scripts/insider/merge.py | .github/workflows/sec-fundamentals-daily.yml |
| scripts/insider/tests/form4-compact.test.mjs | .github/workflows/ownership-signals.yml, .github/workflows/sec-fundamentals-daily.yml |
| scripts/market/apply-exchange-directory.mjs | .github/workflows/quant-ci.yml, .github/workflows/security-master-eligibility.yml |
| scripts/market/apply-name-layer-class.mjs | .github/workflows/quant-ci.yml, .github/workflows/security-master-eligibility.yml |
| scripts/market/assert-daily-lifecycle-health.mjs | .github/workflows/market-data-refresh.yml, .github/workflows/quant-ci.yml |
| scripts/market/assert-deploy-preconditions.mjs | .github/workflows/cloudflare-deploy.yml, .github/workflows/quant-ci.yml |
| scripts/market/assert-intraday-delivery.mjs | .github/workflows/intraday-delivery-watchdog.yml, .github/workflows/quant-ci.yml |
| scripts/market/assert-no-secrets.mjs | .github/workflows/cloudflare-deploy.yml, .github/workflows/cloudflare-waker-deploy.yml, .github/workflows/company-names.yml, .github/workflows/currency-fx-verify.yml, .github/workflows/intraday-delivery-watchdog.yml, .github/workflows/intraday-pacemaker.yml, .github/workflows/intraday-snapshots.yml, .github/workflows/market-data-refresh.yml, .github/workflows/monitor.yml, .github/workflows/quant-ci.yml, .github/workflows/sec-consumer-fundamentals.yml, .github/workflows/tiingo-scale.yml, .github/workflows/tiingo2-universe-refresh.yml, .github/workflows/universe-master.yml |
| scripts/market/assert-public-data-hygiene.mjs | .github/workflows/ci.yml, .github/workflows/company-names.yml, .github/workflows/emerging-leaders-study.yml, .github/workflows/index-membership.yml, .github/workflows/intraday-pacemaker.yml, .github/workflows/intraday-snapshots.yml, .github/workflows/ki-depots-daily.yml, .github/workflows/long-series.yml, .github/workflows/market-data-refresh.yml, .github/workflows/ownership-signals.yml, .github/workflows/pattern-research-volume.yml, .github/workflows/pipeline-daily.yml, .github/workflows/product-intelligence-materialization.yml, .github/workflows/quant-ci.yml, .github/workflows/quant-portfolio-research.yml, .github/workflows/sec-consumer-fundamentals.yml, .github/workflows/security-master-eligibility.yml, .github/workflows/security-master-weekly.yml, .github/workflows/technical-intelligence-build.yml, .github/workflows/technical-world.yml, .github/workflows/tiingo-scale.yml, .github/workflows/vorsorge-etf-sources.yml, .github/workflows/vorsorge-etf-universe.yml |
| scripts/market/assert-universe-quality.mjs | .github/workflows/quant-ci.yml, .github/workflows/tiingo-scale.yml |
| scripts/market/assert-zero-cost-mode.mjs | .github/workflows/cloudflare-deploy.yml, .github/workflows/monitor.yml, .github/workflows/quant-ci.yml |
| scripts/market/attach-live-domain.mjs | .github/workflows/cloudflare-deploy.yml, .github/workflows/quant-ci.yml |
| scripts/market/audit-return-basis.mjs | .github/workflows/product-intelligence-materialization.yml, .github/workflows/quant-ci.yml |
| scripts/market/build-capability-matrix.mjs | .github/workflows/company-names.yml, .github/workflows/intraday-snapshots.yml, .github/workflows/market-data-refresh.yml, .github/workflows/quant-ci.yml, .github/workflows/sec-consumer-fundamentals.yml, .github/workflows/security-master-eligibility.yml |
| scripts/market/build-company-names.mjs | .github/workflows/company-names.yml, .github/workflows/quant-ci.yml, .github/workflows/security-master-eligibility.yml, .github/workflows/security-master-weekly.yml |
| scripts/market/build-coverage-metrics.mjs | .github/workflows/coverage-metrics.yml, .github/workflows/quant-ci.yml |
| scripts/market/build-currency-coverage.mjs | .github/workflows/currency-fx-verify.yml, .github/workflows/quant-ci.yml |
| scripts/market/build-fx-history-ecb.mjs | .github/workflows/currency-fx-verify.yml, .github/workflows/pipeline-daily.yml, .github/workflows/quant-ci.yml |
| scripts/market/build-fx-history.mjs | .github/workflows/currency-fx-verify.yml, .github/workflows/quant-ci.yml |
| scripts/market/build-fx-pair-requirements.mjs | .github/workflows/currency-fx-verify.yml, .github/workflows/quant-ci.yml |
| scripts/market/build-health-report.mjs | .github/workflows/quant-ci.yml, .github/workflows/tiingo-scale.yml |
| scripts/market/build-index-membership.mjs | .github/workflows/index-membership.yml, .github/workflows/quant-ci.yml |
| scripts/market/build-market-factors.mjs | .github/workflows/market-data-refresh.yml, .github/workflows/quant-ci.yml, .github/workflows/tiingo-scale.yml |
| scripts/market/build-market-pulse.mjs | .github/workflows/multi-asset-data.yml, .github/workflows/quant-ci.yml |
| scripts/market/build-market-universe.mjs | .github/workflows/quant-ci.yml, .github/workflows/tiingo-scale.yml, .github/workflows/universe-master.yml |
| scripts/market/build-ownership-signals.mjs | .github/workflows/ownership-signals.yml, .github/workflows/quant-ci.yml |
| scripts/market/build-us-eligibility.mjs | .github/workflows/quant-ci.yml, .github/workflows/security-master-eligibility.yml |
| scripts/market/build-us-security-master.mjs | .github/workflows/quant-ci.yml, .github/workflows/security-master-weekly.yml |
| scripts/market/build-validation-sources.mjs | .github/workflows/pipeline-daily.yml, .github/workflows/quant-ci.yml |
| scripts/market/check-freshness.mjs | .github/workflows/freshness-monitor.yml, .github/workflows/intraday-snapshots.yml, .github/workflows/market-data-refresh.yml, .github/workflows/monitor.yml, .github/workflows/quant-ci.yml |
| scripts/market/classify-rejections.mjs | .github/workflows/market-data-refresh.yml, .github/workflows/quant-ci.yml |
| scripts/market/eia-xls-to-csv.py | .github/workflows/multi-asset-data.yml, .github/workflows/quant-ci.yml |
| scripts/market/evaluate-provider.mjs | .github/workflows/quant-ci.yml |
| scripts/market/fetch-market-data.mjs | .github/workflows/quant-ci.yml |
| scripts/market/guard-listing-continuity.mjs | .github/workflows/market-data-refresh.yml, .github/workflows/quant-ci.yml |
| scripts/market/ingest-fx-intraday.mjs | .github/workflows/currency-fx-verify.yml, .github/workflows/currency-realtime-proof.yml, .github/workflows/quant-ci.yml |
| scripts/market/ingest-intraday.mjs | .github/workflows/intraday-pacemaker.yml, .github/workflows/intraday-snapshots.yml, .github/workflows/quant-ci.yml, .github/workflows/security-master-eligibility.yml |
| scripts/market/ingest-multi-asset.mjs | .github/workflows/multi-asset-data.yml, .github/workflows/quant-ci.yml |
| scripts/market/ingest-tiingo.mjs | .github/workflows/market-data-refresh.yml, .github/workflows/quant-ci.yml |
| scripts/market/lib/market-validation.mjs | .github/workflows/pipeline-daily.yml, .github/workflows/quant-ci.yml |
| scripts/market/long-series-repair-plan.mjs | .github/workflows/long-series.yml, .github/workflows/quant-ci.yml |
| scripts/market/preflight-zero-cost.mjs | .github/workflows/emerging-leaders-study.yml, .github/workflows/history-store-sync.yml, .github/workflows/market-data-refresh.yml, .github/workflows/pattern-research-volume.yml, .github/workflows/product-intelligence-materialization.yml, .github/workflows/quant-ci.yml, .github/workflows/quant-portfolio-research.yml, .github/workflows/research-edge2-paper.yml, .github/workflows/research-labor.yml, .github/workflows/research-signals-s2.yml, .github/workflows/vu2-lifecycle-handoff.yml |
| scripts/market/probe-free-sources.mjs | .github/workflows/multi-asset-data.yml, .github/workflows/quant-ci.yml |
| scripts/market/probe-index-sources.mjs | .github/workflows/multi-asset-data.yml, .github/workflows/quant-ci.yml |
| scripts/market/probe-multi-asset.mjs | .github/workflows/multi-asset-data.yml, .github/workflows/quant-ci.yml |
| scripts/market/probe-tiingo-fx.mjs | .github/workflows/currency-fx-verify.yml, .github/workflows/quant-ci.yml |
| scripts/market/publish-discover-series.mjs | .github/workflows/quant-ci.yml, .github/workflows/security-master-eligibility.yml |
| scripts/market/publish-long-series.mjs | .github/workflows/elliott-prospective-registry.yml, .github/workflows/long-series.yml, .github/workflows/quant-ci.yml, .github/workflows/security-master-eligibility.yml |
| scripts/market/qualify-providers.mjs | .github/workflows/quant-ci.yml |
| scripts/market/refresh-benchmark-history.mjs | .github/workflows/market-data-refresh.yml, .github/workflows/quant-ci.yml |
| scripts/market/repair-total-return-history.mjs | .github/workflows/market-data-refresh.yml, .github/workflows/quant-ci.yml |
| scripts/market/report-name-display-drift.mjs | .github/workflows/quant-ci.yml, .github/workflows/security-master-weekly.yml |
| scripts/market/run-eod-publish-gates.mjs | .github/workflows/market-data-refresh.yml, .github/workflows/quant-ci.yml |
| scripts/market/run-pacemaker.mjs | .github/workflows/intraday-delivery-watchdog.yml, .github/workflows/intraday-pacemaker.yml, .github/workflows/quant-ci.yml |
| scripts/market/run-realtime-tests.mjs | .github/workflows/cloudflare-deploy.yml, .github/workflows/quant-ci.yml |
| scripts/market/run-scale-gate.mjs | .github/workflows/quant-ci.yml, .github/workflows/tiingo-scale.yml |
| scripts/market/security-master-refresh-gate.mjs | .github/workflows/quant-ci.yml, .github/workflows/security-master-weekly.yml |
| scripts/market/select-gate-universe.mjs | .github/workflows/quant-ci.yml, .github/workflows/tiingo-scale.yml |
| scripts/market/smoke-vu-live.mjs | .github/workflows/cloudflare-deploy.yml, .github/workflows/monitor.yml, .github/workflows/quant-ci.yml |
| scripts/market/storage/s3-driver.mjs | .github/workflows/cloudflare-deploy.yml, .github/workflows/company-intelligence.yml, .github/workflows/pages-release.yml, .github/workflows/quant-ci.yml |
| scripts/market/study-return-basis-universe.mjs | .github/workflows/product-intelligence-materialization.yml, .github/workflows/quant-ci.yml |
| scripts/market/sync-history-store.mjs | .github/workflows/emerging-leaders-study.yml, .github/workflows/history-store-sync.yml, .github/workflows/market-data-refresh.yml, .github/workflows/pattern-research-volume.yml, .github/workflows/product-intelligence-materialization.yml, .github/workflows/quant-ci.yml, .github/workflows/quant-portfolio-research.yml, .github/workflows/research-edge2-paper.yml, .github/workflows/research-labor.yml, .github/workflows/research-signals-s2.yml, .github/workflows/vu2-lifecycle-handoff.yml |
| scripts/market/tiingo2-cache.mjs | .github/workflows/quant-ci.yml, .github/workflows/tiingo2-universe-refresh.yml |
| scripts/market/tiingo2-export.mjs | .github/workflows/quant-ci.yml, .github/workflows/tiingo2-universe-refresh.yml |
| scripts/market/tiingo2-refresh.mjs | .github/workflows/quant-ci.yml, .github/workflows/tiingo2-universe-refresh.yml |
| scripts/market/universe-source.mjs | .github/workflows/company-names.yml, .github/workflows/history-store-sync.yml, .github/workflows/market-data-refresh.yml, .github/workflows/quant-ci.yml, .github/workflows/sec-consumer-fundamentals.yml, .github/workflows/security-master-weekly.yml |
| scripts/market/validate-market-pulse.mjs | .github/workflows/pipeline-daily.yml, .github/workflows/quant-ci.yml |
| scripts/market/verify-dynamic-subscribe.mjs | .github/workflows/quant-ci.yml, .github/workflows/tiingo-scale.yml |
| scripts/market/verify-live-candle.mjs | .github/workflows/quant-ci.yml, .github/workflows/tiingo-scale.yml |
| scripts/market/verify-request-limits.mjs | .github/workflows/pages-release.yml, .github/workflows/quant-ci.yml, .github/workflows/tiingo-scale.yml, .github/workflows/vorsorge-etf-universe.yml |
| scripts/market/verify-semantics-parity.mjs | .github/workflows/quant-ci.yml |
| scripts/market/verify-tiingo-commercial.mjs | .github/workflows/quant-ci.yml, .github/workflows/tiingo-scale.yml |
| scripts/market/verify-vu-live-e2e.mjs | .github/workflows/quant-ci.yml, .github/workflows/tiingo-scale.yml |
| scripts/marketstack/europe-discover-check.mjs | .github/workflows/europe-discover-refresh.yml |
| scripts/marketstack/europe-discover-publication.mjs | .github/workflows/europe-discover-refresh.yml |
| scripts/marketstack/europe-marketstack-diagnostics-once.mjs | .github/workflows/europe-discover-refresh.yml |
| scripts/marketstack/tests/europe-marketstack-diagnostics-once.test.mjs | .github/workflows/europe-discover-refresh.yml |
| scripts/morning/build-morning.mjs | .github/workflows/content.yml |
| scripts/quality/assert-no-local-fx.mjs | .github/workflows/currency-fx-verify.yml, .github/workflows/multi-asset-data.yml, .github/workflows/pipeline-daily.yml, .github/workflows/quant-ci.yml |
| scripts/quality/audit-fx-provider-seam.mjs | .github/workflows/currency-fx-verify.yml, .github/workflows/quant-ci.yml |
| scripts/quality/build-currency-debt-register.mjs | .github/workflows/currency-fx-verify.yml, .github/workflows/quant-ci.yml |
| scripts/quality/chart-parity.mjs | .github/workflows/core-ci.yml, .github/workflows/quant-ci.yml |
| scripts/quality/currency-debt-patterns.mjs | .github/workflows/currency-fx-verify.yml, .github/workflows/quant-ci.yml |
| scripts/quality/fundamental-compare-qa.mjs | .github/workflows/quant-ci.yml, .github/workflows/shell-ci.yml |
| scripts/quality/shell-browser-qa.mjs | .github/workflows/quant-ci.yml, .github/workflows/shell-ci.yml |
| scripts/quality/verify-currency-layer.mjs | .github/workflows/currency-fx-verify.yml, .github/workflows/quant-ci.yml |
| scripts/quality/verify-currency-ui.mjs | .github/workflows/currency-fx-verify.yml, .github/workflows/monitor.yml, .github/workflows/quant-ci.yml |
| scripts/quality/verify-historical-fx-coverage.mjs | .github/workflows/currency-fx-verify.yml, .github/workflows/quant-ci.yml |
| scripts/quality/verify-multi-asset.mjs | .github/workflows/multi-asset-data.yml, .github/workflows/quant-ci.yml |
| scripts/quality/verify-realtime-eur.mjs | .github/workflows/currency-realtime-proof.yml, .github/workflows/quant-ci.yml |
| scripts/quality/vu3-regression-qa.mjs | .github/workflows/quant-ci.yml, .github/workflows/shell-ci.yml |
| scripts/quant/__init__.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/analyze-v7-monte-carlo.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/assert-product-completeness.mjs | .github/workflows/product-intelligence-materialization.yml, .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/audit-security-type-provenance.mjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/audit-share-count-provenance.mjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/audit-v8-archives.mjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/audit_primary_source.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml, .github/workflows/update-sec-fundamentals.yml |
| scripts/quant/backtest-generation-freeze.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/batch-real-weekly-backtests.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/build-backtest-certification.mjs | .github/workflows/product-intelligence-materialization.yml, .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/build-backtest-readiness.mjs | .github/workflows/product-intelligence-materialization.yml, .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/build-emerging-leaders-study.mjs | .github/workflows/emerging-leaders-study.yml, .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/build-evidence-status.mjs | .github/workflows/product-intelligence-materialization.yml, .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/build-factor-evidence.mjs | .github/workflows/product-intelligence-materialization.yml, .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/build-golden-five-pit-coverage.mjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/build-market-regime.mjs | .github/workflows/product-intelligence-materialization.yml, .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/build-methodology-index.mjs | .github/workflows/product-intelligence-materialization.yml, .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/build-pattern-match.mjs | .github/workflows/pattern-research-volume.yml, .github/workflows/product-intelligence-materialization.yml, .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/build-pattern-research-fundamentals.mjs | .github/workflows/pattern-research-volume.yml, .github/workflows/product-intelligence-materialization.yml, .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/build-pattern-research.mjs | .github/workflows/pattern-research-volume.yml, .github/workflows/product-intelligence-materialization.yml, .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/build-product-language-doc.mjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/build-quant-radar.mjs | .github/workflows/product-intelligence-materialization.yml, .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/build-sec-mapping-dossier.mjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/build-sec-quant-panel.mjs | .github/workflows/market-data-refresh.yml, .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/build-setup-backtest.mjs | .github/workflows/product-intelligence-materialization.yml, .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/build-setup-observations.mjs | .github/workflows/product-intelligence-materialization.yml, .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/build-setup-outcomes.mjs | .github/workflows/product-intelligence-materialization.yml, .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/build-sic-peer-taxonomy.mjs | .github/workflows/market-data-refresh.yml, .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/build-signal-backtest.mjs | .github/workflows/product-intelligence-materialization.yml, .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/build-strategy-index.mjs | .github/workflows/product-intelligence-materialization.yml, .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/build-survivorship-control.mjs | .github/workflows/product-intelligence-materialization.yml, .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/build-universe-list.mjs | .github/workflows/product-intelligence-materialization.yml, .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/check_company_agnostic.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/classify-zero-factor-rows.mjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/cli.py | .github/workflows/company-intelligence.yml, .github/workflows/coverage-metrics.yml, .github/workflows/quant-ci.yml, .github/workflows/sec-consumer-fundamentals.yml, .github/workflows/sec-fundamentals-ci.yml, .github/workflows/sec-fundamentals-daily.yml, .github/workflows/sec-fundamentals-universe.yml, .github/workflows/sec-sic-history.yml, .github/workflows/update-sec-fundamentals.yml |
| scripts/quant/compare-factor-coverage.mjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/contracts/weekly-execution-model-v2.json | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/diagnose-real-weekly-backtests.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/lib/daily-prices.mjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/lib/emerging-leaders-inputs.mjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/lib/pattern-study.mjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/lib/weekly-total-return.mjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/materialization-decision.mjs | .github/workflows/product-intelligence-materialization.yml, .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/materialize-real-backtest-read.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/measure-backtest-certification.mjs | .github/workflows/product-intelligence-materialization.yml, .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/measure-backtest-signal-intelligence.mjs | .github/workflows/product-intelligence-materialization.yml, .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/measure-decision-intelligence.mjs | .github/workflows/product-intelligence-materialization.yml, .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/measure-local-coverage-levers.mjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/measure-methodology-change.mjs | .github/workflows/product-intelligence-materialization.yml, .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/measure-name-type-evidence.mjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/measure-naming-contract.mjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/measure-pipeline-freshness.mjs | .github/workflows/freshness-monitor.yml, .github/workflows/market-data-refresh.yml, .github/workflows/product-intelligence-materialization.yml, .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/measure-security-type-safety.mjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/measure-valuation-coverage.mjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/measure-weekly-loader.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/methodology-fingerprint.mjs | .github/workflows/product-intelligence-materialization.yml, .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/pin-security-master-generation.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/portfolio/build_pit_fundamentals.py | .github/workflows/quant-ci.yml, .github/workflows/quant-portfolio-research.yml, .github/workflows/research-edge2-paper.yml, .github/workflows/research-labor.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/portfolio/export-model-portfolios-bundle.cjs | .github/workflows/quant-ci.yml, .github/workflows/quant-portfolio-research.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/portfolio/export-public-model-portfolios.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/portfolio/model-depots.cjs | .github/workflows/quant-ci.yml, .github/workflows/quant-model-depots.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/portfolio/model-portfolios.cjs | .github/workflows/quant-ci.yml, .github/workflows/quant-portfolio-research.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/portfolio/render-model-portfolios.cjs | .github/workflows/quant-ci.yml, .github/workflows/quant-portfolio-research.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/probe-v8-r2-archives.mjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/recover-v7-sec-originals.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/recover-v8-r2-ca-cases.mjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/recover-v8-sec-headers.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/refresh-real-backtest.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/render-return-basis-study.mjs | .github/workflows/product-intelligence-materialization.yml, .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/replay-setup-history.mjs | .github/workflows/product-intelligence-materialization.yml, .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/research/backtest-coverage-matrix.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/research/backtest-metrics-hash.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/research/backtest-runner.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/research/backtest-spec-builder.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/research/build-backtest-catalog.cjs | .github/workflows/quant-ci.yml, .github/workflows/quant-v13-archive.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/research/build-backtest-demos.cjs | .github/workflows/quant-ci.yml, .github/workflows/quant-v13-archive.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/research/build-backtest-preview.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/research/catalog-private-recheck.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/research/check-backtest-demo-freshness.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/research/compare-backtest-demos.cjs | .github/workflows/quant-ci.yml, .github/workflows/quant-v13-archive.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/research/export-backtest-review-bundle.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/research/pattern-total-return-population.mjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/research/pattern-total-return.mjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/research/pit-snapshot-integrity.cjs | .github/workflows/freshness-monitor.yml, .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/research/render-backtest-preview.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/research/research-population.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/research/run-backtest.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/research/setup-independence-readings.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/research/survivorship-public-frame.mjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/research/survivorship-sensitivity.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/rollback-real-backtest.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/run-real-weekly-backtest.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/run-research.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/run-sec-gates.mjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml, .github/workflows/update-sec-fundamentals.yml |
| scripts/quant/run-v7-real-studies.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/run-v8-real-studies.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/run-v8-sensitivity.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/sec/__init__.py | .github/workflows/quant-ci.yml, .github/workflows/sec-consumer-fundamentals.yml, .github/workflows/sec-fundamentals-ci.yml, .github/workflows/sec-fundamentals-universe.yml |
| scripts/quant/sec/canonical.py | .github/workflows/quant-ci.yml, .github/workflows/sec-consumer-fundamentals.yml, .github/workflows/sec-fundamentals-ci.yml, .github/workflows/sec-fundamentals-universe.yml |
| scripts/quant/sec/consumer.py | .github/workflows/quant-ci.yml, .github/workflows/sec-consumer-fundamentals.yml, .github/workflows/sec-fundamentals-ci.yml, .github/workflows/sec-fundamentals-universe.yml |
| scripts/quant/sec/coverage.py | .github/workflows/quant-ci.yml, .github/workflows/sec-consumer-fundamentals.yml, .github/workflows/sec-fundamentals-ci.yml, .github/workflows/sec-fundamentals-universe.yml |
| scripts/quant/sec/daily.py | .github/workflows/quant-ci.yml, .github/workflows/sec-consumer-fundamentals.yml, .github/workflows/sec-fundamentals-ci.yml, .github/workflows/sec-fundamentals-daily.yml, .github/workflows/sec-fundamentals-universe.yml |
| scripts/quant/sec/derived.py | .github/workflows/quant-ci.yml, .github/workflows/sec-consumer-fundamentals.yml, .github/workflows/sec-fundamentals-ci.yml, .github/workflows/sec-fundamentals-universe.yml |
| scripts/quant/sec/final_report.py | .github/workflows/quant-ci.yml, .github/workflows/sec-consumer-fundamentals.yml, .github/workflows/sec-fundamentals-ci.yml, .github/workflows/sec-fundamentals-universe.yml |
| scripts/quant/sec/fiscal.py | .github/workflows/quant-ci.yml, .github/workflows/sec-consumer-fundamentals.yml, .github/workflows/sec-fundamentals-ci.yml, .github/workflows/sec-fundamentals-universe.yml |
| scripts/quant/sec/fsds.py | .github/workflows/quant-ci.yml, .github/workflows/sec-consumer-fundamentals.yml, .github/workflows/sec-fundamentals-ci.yml, .github/workflows/sec-fundamentals-universe.yml |
| scripts/quant/sec/gates.py | .github/workflows/quant-ci.yml, .github/workflows/sec-consumer-fundamentals.yml, .github/workflows/sec-fundamentals-ci.yml, .github/workflows/sec-fundamentals-universe.yml |
| scripts/quant/sec/http_client.py | .github/workflows/quant-ci.yml, .github/workflows/sec-consumer-fundamentals.yml, .github/workflows/sec-fundamentals-ci.yml, .github/workflows/sec-fundamentals-universe.yml |
| scripts/quant/sec/issuer_extensions.py | .github/workflows/quant-ci.yml, .github/workflows/sec-consumer-fundamentals.yml, .github/workflows/sec-fundamentals-ci.yml, .github/workflows/sec-fundamentals-universe.yml |
| scripts/quant/sec/model.py | .github/workflows/quant-ci.yml, .github/workflows/sec-consumer-fundamentals.yml, .github/workflows/sec-fundamentals-ci.yml, .github/workflows/sec-fundamentals-universe.yml |
| scripts/quant/sec/normalize.py | .github/workflows/quant-ci.yml, .github/workflows/sec-consumer-fundamentals.yml, .github/workflows/sec-fundamentals-ci.yml, .github/workflows/sec-fundamentals-universe.yml |
| scripts/quant/sec/periods.py | .github/workflows/quant-ci.yml, .github/workflows/sec-consumer-fundamentals.yml, .github/workflows/sec-fundamentals-ci.yml, .github/workflows/sec-fundamentals-universe.yml |
| scripts/quant/sec/persist-fundamentals.mjs | .github/workflows/quant-ci.yml, .github/workflows/sec-consumer-fundamentals.yml, .github/workflows/sec-fundamentals-ci.yml, .github/workflows/sec-fundamentals-daily.yml, .github/workflows/sec-fundamentals-universe.yml |
| scripts/quant/sec/pipeline.py | .github/workflows/quant-ci.yml, .github/workflows/sec-consumer-fundamentals.yml, .github/workflows/sec-fundamentals-ci.yml, .github/workflows/sec-fundamentals-universe.yml |
| scripts/quant/sec/provider.py | .github/workflows/quant-ci.yml, .github/workflows/sec-consumer-fundamentals.yml, .github/workflows/sec-fundamentals-ci.yml, .github/workflows/sec-fundamentals-universe.yml |
| scripts/quant/sec/quality.py | .github/workflows/quant-ci.yml, .github/workflows/sec-consumer-fundamentals.yml, .github/workflows/sec-fundamentals-ci.yml, .github/workflows/sec-fundamentals-universe.yml |
| scripts/quant/sec/reconciliation.py | .github/workflows/quant-ci.yml, .github/workflows/sec-consumer-fundamentals.yml, .github/workflows/sec-fundamentals-ci.yml, .github/workflows/sec-fundamentals-universe.yml |
| scripts/quant/sec/registry.py | .github/workflows/quant-ci.yml, .github/workflows/sec-consumer-fundamentals.yml, .github/workflows/sec-fundamentals-ci.yml, .github/workflows/sec-fundamentals-universe.yml |
| scripts/quant/sec/restatements.py | .github/workflows/quant-ci.yml, .github/workflows/sec-consumer-fundamentals.yml, .github/workflows/sec-fundamentals-ci.yml, .github/workflows/sec-fundamentals-universe.yml |
| scripts/quant/sec/sic_history.py | .github/workflows/quant-ci.yml, .github/workflows/sec-consumer-fundamentals.yml, .github/workflows/sec-fundamentals-ci.yml, .github/workflows/sec-fundamentals-universe.yml |
| scripts/quant/sec/store.py | .github/workflows/quant-ci.yml, .github/workflows/sec-consumer-fundamentals.yml, .github/workflows/sec-fundamentals-ci.yml, .github/workflows/sec-fundamentals-universe.yml |
| scripts/quant/sec/universe_coverage.py | .github/workflows/quant-ci.yml, .github/workflows/sec-consumer-fundamentals.yml, .github/workflows/sec-fundamentals-ci.yml, .github/workflows/sec-fundamentals-universe.yml |
| scripts/quant/sec/version.py | .github/workflows/quant-ci.yml, .github/workflows/sec-consumer-fundamentals.yml, .github/workflows/sec-fundamentals-ci.yml, .github/workflows/sec-fundamentals-universe.yml |
| scripts/quant/secure-v6-isolation.mjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/sic-history-coverage.mjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/tests/__init__.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml, .github/workflows/sec-fundamentals-universe.yml |
| scripts/quant/tests/fixtures.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml, .github/workflows/sec-fundamentals-universe.yml |
| scripts/quant/tests/test_bulk_ingest.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml, .github/workflows/sec-fundamentals-universe.yml |
| scripts/quant/tests/test_canonical_market.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml, .github/workflows/sec-fundamentals-universe.yml |
| scripts/quant/tests/test_ci_scripts.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml, .github/workflows/sec-fundamentals-universe.yml |
| scripts/quant/tests/test_cli_universe_filter.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml, .github/workflows/sec-fundamentals-universe.yml |
| scripts/quant/tests/test_concept_census.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml, .github/workflows/sec-fundamentals-universe.yml |
| scripts/quant/tests/test_consumer.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml, .github/workflows/sec-fundamentals-universe.yml |
| scripts/quant/tests/test_consumer_calendar.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml, .github/workflows/sec-fundamentals-universe.yml |
| scripts/quant/tests/test_consumer_history.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml, .github/workflows/sec-fundamentals-universe.yml |
| scripts/quant/tests/test_consumer_outputs.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml, .github/workflows/sec-fundamentals-universe.yml |
| scripts/quant/tests/test_consumer_successor.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml, .github/workflows/sec-fundamentals-universe.yml |
| scripts/quant/tests/test_consumer_year_end_hint.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml, .github/workflows/sec-fundamentals-universe.yml |
| scripts/quant/tests/test_daily.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml, .github/workflows/sec-fundamentals-universe.yml |
| scripts/quant/tests/test_data_contract.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml, .github/workflows/sec-fundamentals-universe.yml |
| scripts/quant/tests/test_derived.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml, .github/workflows/sec-fundamentals-universe.yml |
| scripts/quant/tests/test_final_report.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml, .github/workflows/sec-fundamentals-universe.yml |
| scripts/quant/tests/test_fiscal.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml, .github/workflows/sec-fundamentals-universe.yml |
| scripts/quant/tests/test_fiscal_future_periods.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml, .github/workflows/sec-fundamentals-universe.yml |
| scripts/quant/tests/test_fsds_supplement.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml, .github/workflows/sec-fundamentals-universe.yml |
| scripts/quant/tests/test_http_and_provider.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml, .github/workflows/sec-fundamentals-universe.yml |
| scripts/quant/tests/test_industry_layer.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml, .github/workflows/sec-fundamentals-universe.yml |
| scripts/quant/tests/test_ingest_verdict.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml, .github/workflows/sec-fundamentals-universe.yml |
| scripts/quant/tests/test_issuer_extensions.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml, .github/workflows/sec-fundamentals-universe.yml |
| scripts/quant/tests/test_normalize_periods.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml, .github/workflows/sec-fundamentals-universe.yml |
| scripts/quant/tests/test_persistence.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml, .github/workflows/sec-fundamentals-universe.yml |
| scripts/quant/tests/test_pipeline_and_store.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml, .github/workflows/sec-fundamentals-universe.yml |
| scripts/quant/tests/test_quality_and_gates.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml, .github/workflows/sec-fundamentals-universe.yml |
| scripts/quant/tests/test_reconciliation.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml, .github/workflows/sec-fundamentals-universe.yml |
| scripts/quant/tests/test_registry_expansion.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml, .github/workflows/sec-fundamentals-universe.yml |
| scripts/quant/tests/test_restatements.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml, .github/workflows/sec-fundamentals-universe.yml |
| scripts/quant/tests/test_retry_and_404.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml, .github/workflows/sec-fundamentals-universe.yml |
| scripts/quant/tests/test_revenue_total_concept.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml, .github/workflows/sec-fundamentals-universe.yml |
| scripts/quant/tests/test_secpit_v9_corrections.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml, .github/workflows/sec-fundamentals-universe.yml |
| scripts/quant/tests/test_sic_history.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml, .github/workflows/sec-fundamentals-universe.yml, .github/workflows/sec-sic-history.yml |
| scripts/quant/tests/test_universe_coverage.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml, .github/workflows/sec-fundamentals-universe.yml |
| scripts/quant/tests/test_universe_resolution.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml, .github/workflows/sec-fundamentals-universe.yml |
| scripts/quant/tests/test_version_discipline.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml, .github/workflows/sec-fundamentals-universe.yml |
| scripts/quant/tests/test_workflows.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml, .github/workflows/sec-fundamentals-universe.yml |
| scripts/quant/v10/build-handoff.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v10/build-manifest.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v10/corporate-actions/before-after.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v10/corporate-actions/build-ca-registry.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v10/corporate-actions/build_tr_register.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v10/corporate-actions/check_ca_registry_v11.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v10/corporate-actions/check_tr_ledger.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v10/corporate-actions/compare_verdicts.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v10/corporate-actions/harvest_dividends_v10.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v10/corporate-actions/run-tr-ledger.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v10/corporate-actions/verify_ca_events_v11.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v10/data-recovery/materialization_status.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v10/factor/common.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v10/factor/factors.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v10/factor/fetch_companyfacts.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v10/factor/jobs.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v10/factor/panel.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v10/factor/pit_docs.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v10/factor/strategy.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v10/factor/study.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v10/factor/verify_factor.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v10/population/adjudicate_check.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v10/population/b1_identity.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v10/population/b2_lifecycle.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v10/population/b3_population.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v10/population/before-after.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v10/population/build-registers.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v10/population/check_population.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v10/population/reasons.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v10/population/v10lib.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v10/setup/build-setup-independence-decision.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v10/setup/run-setup-reconstruction.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v10/setup/setup-lib.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v10/setup/setup-original-inventory.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v10/setup/setup-reconstruction-feasibility.mjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v10/setup/verify_setup.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v10/studies/certification-readiness.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v10/studies/common.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v10/studies/engine-worker.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v10/studies/pattern-study.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v10/studies/plan.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v10/studies/run-v10-studies.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v10/studies/signal-study.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v10/studies/verify_v10_studies.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v11/decomposition/assemble.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v11/decomposition/dividends_signal.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v11/decomposition/events.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v11/decomposition/plan.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v11/decomposition/population-index.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v11/decomposition/portfolio.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v11/decomposition/register.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v11/decomposition/spy_distributions.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v11/decomposition/verify_decomposition.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v11/discovery/attribution.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v11/discovery/cap-correction.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v11/discovery/compile-train.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v11/discovery/evaluate.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v11/discovery/explore-train.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v11/discovery/export-check-input.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v11/discovery/freeze-candidates.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v11/discovery/lib.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v11/discovery/mcap-sensitivity.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v11/discovery/oracle.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v11/discovery/rules.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v11/discovery/select-final.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v11/discovery/stages/b0-v10-baselines.json | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v11/discovery/stages/s0-smoke.json | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v11/discovery/stages/s1-fund.json | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v11/discovery/stages/s1-price.json | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v11/discovery/stages/s1b-price-px5.json | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v11/discovery/stages/s2-fund.json | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v11/discovery/stages/s2-price.json | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v11/discovery/stages/s3-robust.json | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v11/discovery/validate.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v11/discovery/verify_discovery.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v11/discovery/wf-train.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v11/winners/analyze.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v11/winners/build.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v11/winners/lib.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v11/winners/registration.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v11/winners/verify_winners.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v12/indexpop/build-outputs.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v12/indexpop/build-snapshots.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v12/indexpop/fates.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v12/indexpop/fetch_docs.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v12/indexpop/inventory.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v12/indexpop/lib.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v12/indexpop/map-members.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v12/indexpop/qualify.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v12/indexpop/run-pipeline.sh | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v12/indexpop/secfetch.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v12/indexpop/summarize_inventory.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v12/indexpop/verify_indexpop.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v12/largecap/b1run.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v12/largecap/build-ca-verdicts.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v12/largecap/build-identity-v12.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v12/largecap/coverage.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v12/largecap/export-ca-frame.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v12/largecap/peek_filings.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v12/largecap/qualify-sets.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v12/largecap/seclib.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v12/largecap/verify_ca.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v12/largecap/verify_largecap.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v12/listref/build_reference.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v12/listref/check_listref.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v12/listref/export_holdings.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v12/listref/extract_float.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v12/listref/fetch_indices.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v12/listref/fetch_reasons.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v12/listref/fts_links.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v12/listref/lrlib.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v12/listref/purge_error_bodies.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v12/listref/reasons.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v12/listref/redact.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v12/listref/redact_public.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v12/listref/reflib.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v12/listref/resolve_agents.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v12/listref/verify_sample.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v12/mcap/adjudicate_validation.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v12/mcap/classify.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v12/mcap/impact.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v12/mcap/observations.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v12/mcap/panel.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v12/mcap/producer-effect.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v12/mcap/review-correction.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v12/mcap/sec_evidence.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v12/mcap/sharefacts.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v12/mcap/verify_mcap.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v12/mcap/winners-preload.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v12/requal/dividend_yield.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v12/requal/lib.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v12/requal/p5a-population.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v12/requal/p5b-signals.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v12/requal/p5c-factor.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v12/requal/p5d-attribution.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v12/requal/p6-strategies.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v12/requal/panel-access.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v12/requal/plan.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v12/requal/verify_requal.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v12/spxpop/build-population.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v12/spxpop/verify_spxpop.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v13/archive/build-archive.sh | .github/workflows/quant-ci.yml, .github/workflows/quant-v13-archive.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v13/archive/presign.mjs | .github/workflows/quant-ci.yml, .github/workflows/quant-v13-archive.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v13/archive/r2-restore.mjs | .github/workflows/quant-ci.yml, .github/workflows/quant-portfolio-research.yml, .github/workflows/quant-v13-archive.yml, .github/workflows/research-labor.yml, .github/workflows/research-signals-s2.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v13/archive/restore-archive.sh | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml, .github/workflows/supertrader-st-hist-top5.yml, .github/workflows/supertrader-st9-v13-study.yml |
| scripts/quant/v13/archive/transfer.sh | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v13/delisted/coverage.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v13/delisted/qualify.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v13/largecap/build-registry.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v13/largecap/build_facts.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v13/largecap/evaluate.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v13/largecap/extract.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v13/largecap/fetch_8k.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v13/largecap/fetch_docs.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v13/largecap/seclib13.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v13/largecap/verify_largecap13.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v13/studies/assemble.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v13/studies/ca_unresolved_count.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v13/studies/export-f0-manifest.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v13/studies/lib.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v13/studies/run-frame.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v13/studies/run-s3.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v13/studies/verify_v13_studies.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v13b/f1w/assemble.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v13b/f1w/lib.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v13b/f1w/run.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v13b/f1w/verify_v13b_f1w.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v13b/hist/common.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v13b/hist/crash_adjudicate.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v13b/hist/crash_collect.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v13b/hist/qualify_110.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v13b/hist/spx_coverage.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v13b/hist/spx_terminal.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v13b/hist/verify_hist.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v13b/largecap-strict/build-registry.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v13b/largecap-strict/evaluate-1.1.0.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v13b/largecap-strict/verify_strict.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v13c/assemble.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v13c/lib.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v13c/run-frame.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v13c/run-s3.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v13c/verify_v13c.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v9-followups/ca-registry/before-after.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v9-followups/ca-registry/build-ca-registry.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v9-followups/ca-registry/check_ca_registry.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v9-followups/ca-registry/compare_v9.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v9-followups/ca-registry/export-frame.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v9-followups/ca-registry/verify_ca_events.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v9-followups/identity/before-after.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v9-followups/identity/build-identity-registry.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v9-followups/identity/check_identity_registry.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v9-followups/ledger/build_before_after.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v9-followups/ledger/run_ca_ledger.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v9-followups/ledger/source_ca_events.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v9-followups/ledger/v8_node_shim.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v9-followups/ledger/verify_ca_ledger.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v9/build-v9-manifest.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v9/certification-readiness.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v9/corporate-actions/build_manual_review.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v9/corporate-actions/classify.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v9/corporate-actions/evidence_quotes.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v9/corporate-actions/fetch_sec_evidence.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v9/corporate-actions/independent_check.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v9/corporate-actions/missing_weeks.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v9/corporate-actions/mw_delisted_lookup.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v9/corporate-actions/mw_sec_sample.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v9/corporate-actions/proposal_dryrun.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v9/corporate-actions/stale_tails.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v9/corporate-actions/triage.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v9/events/harvest_8k_items.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v9/events/population.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v9/events/reference_check.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v9/events/run-v9-events.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v9/events/verify_acceptance_headers.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v9/identity/build_dossiers.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v9/identity/build_proposal.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v9/identity/check_identity.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v9/identity/dry-run-qualification.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v9/identity/reproduce-weekly-reasons.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v9/identity/resolve_ambiguous.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v9/identity/sec_lib.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v9/identity/series_lib.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v9/portfolio/build_dividend_table.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v9/portfolio/harvest_dividends.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v9/portfolio/run_ledger.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v9/portfolio/run_terminal_ledger.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v9/portfolio/secfetch.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v9/portfolio/split_evidence.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v9/portfolio/terminal_evidence.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v9/portfolio/terminal_ledger_events.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v9/portfolio/verify_ledger.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v9/portfolio/verify_terminal_ledger.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v9/secpit/avail_classify.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v9/secpit/common.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v9/secpit/fetch_bulk.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v9/secpit/fy_dossier.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v9/secpit/impact.mjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v9/secpit/impact.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v9/secpit/independent_check.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v9/secpit/parity.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v9/secpit/proposal_effect.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v9/secpit/reproduce.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v9/secpit/tz_check.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v9/secpit/xbrl.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v9/sensitivity/dependence.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v9/sensitivity/publish-v9-sensitivity.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v9/sensitivity/run-v9-sensitivity.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v9/sensitivity/verify_v9_sensitivity.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v9/setup-independence.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v9_followups/sec_pipeline/before-after.mjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v9_followups/sec_pipeline/compose_evidence.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v9_followups/sec_pipeline/independent_check.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/v9_followups/sec_pipeline/verify_quarantine_detection.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/validate-real-backtest-read.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/validate-research-v6.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/verify-backtest-metrics.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/verify-backtest-preview.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/verify-backtest-result-v2.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/verify-backtest-runner.py | .github/workflows/quant-ci.yml, .github/workflows/quant-v13-archive.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/verify-golden-five-backtest-readiness.mjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/verify-portfolio-construction.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/verify-real-weekly-backtest.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/verify-research-monte-carlo.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/verify-research-portfolio.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/verify-research-studies.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/verify-research-validation.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/verify-setup-oos.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/verify-v7-real-studies.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/verify-v7-scope.cjs | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/verify-v8-r2-ca-cases.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/verify-v8-real-studies.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/quant/verify-v8-sensitivity.py | .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml |
| scripts/research/edge/edge-quant.test.cjs | .github/workflows/quant-portfolio-research.yml |
| scripts/research/edge/run-e3.cjs | .github/workflows/quant-portfolio-research.yml |
| scripts/research/edge/study.test.cjs | .github/workflows/quant-portfolio-research.yml |
| scripts/research/edge2/blind.test.cjs | .github/workflows/ki-depots-daily.yml, .github/workflows/quant-portfolio-research.yml |
| scripts/research/edge2/edge2.test.cjs | .github/workflows/quant-portfolio-research.yml, .github/workflows/research-edge2-paper.yml |
| scripts/research/edge2/ki-export.cjs | .github/workflows/ki-depots-daily.yml |
| scripts/research/edge2/paper.cjs | .github/workflows/research-edge2-paper.yml |
| scripts/research/edge2/run-blind.cjs | .github/workflows/quant-portfolio-research.yml |
| scripts/research/edge2/run-dna.cjs | .github/workflows/quant-portfolio-research.yml |
| scripts/research/edge2/run-edge2.cjs | .github/workflows/quant-portfolio-research.yml |
| scripts/research/holdout/holdout.test.cjs | .github/workflows/quant-portfolio-research.yml |
| scripts/research/holdout/quant-holdout.cjs | .github/workflows/quant-portfolio-research.yml |
| scripts/research/labor/build-insider.mjs | .github/workflows/research-labor.yml |
| scripts/research/labor/build-insider.test.mjs | .github/workflows/research-labor.yml |
| scripts/research/labor/build_sue.py | .github/workflows/research-labor.yml |
| scripts/research/labor/labor-stock.test.cjs | .github/workflows/research-labor.yml |
| scripts/research/labor/labor.test.cjs | .github/workflows/research-labor.yml |
| scripts/research/labor/run-labor.cjs | .github/workflows/research-labor.yml |
| scripts/research/signals/s2.mjs | .github/workflows/research-signals-s2.yml |
| scripts/research/signals/s2.test.mjs | .github/workflows/research-signals-s2.yml |
| scripts/research/signals/study.test.mjs | .github/workflows/research-signals-s2.yml |
| scripts/screener/browser-qa.mjs | .github/workflows/ci.yml |
| scripts/screener/build-universe.mjs | .github/workflows/ci.yml, .github/workflows/shell-ci.yml |
| scripts/screener/sic.mjs | .github/workflows/ci.yml |
| scripts/social/approval-center-readiness.mjs | .github/workflows/social-ci.yml |
| scripts/social/assert-no-secrets.mjs | .github/workflows/currency-fx-verify.yml, .github/workflows/social-ci.yml |
| scripts/social/asset-hashtag-done.mjs | .github/workflows/social-ci.yml, .github/workflows/social-cloudflare.yml |
| scripts/social/build-opportunity-slate.mjs | .github/workflows/social-ci.yml, .github/workflows/social-orchestrator.yml |
| scripts/social/build-research-package.mjs | .github/workflows/social-ci.yml, .github/workflows/social-orchestrator.yml |
| scripts/social/check-hard-invariants.mjs | .github/workflows/social-ci.yml, .github/workflows/social-orchestrator.yml |
| scripts/social/collect-vu-signals.mjs | .github/workflows/social-ci.yml |
| scripts/social/decide-candidate.mjs | .github/workflows/social-ci.yml, .github/workflows/social-orchestrator.yml, .github/workflows/social-publish-candidate.yml |
| scripts/social/discover-creators.mjs | .github/workflows/social-ci.yml, .github/workflows/social-external-intelligence.yml |
| scripts/social/dispatch-creative-job.mjs | .github/workflows/social-ci.yml, .github/workflows/social-orchestrator.yml, .github/workflows/social-resume-verified-web.yml |
| scripts/social/enrich-youtube-metrics.mjs | .github/workflows/social-ci.yml, .github/workflows/social-external-intelligence.yml |
| scripts/social/fetch-meta-status.mjs | .github/workflows/social-ci.yml |
| scripts/social/ig-reel.mjs | .github/workflows/social-ci.yml, .github/workflows/social-reel.yml |
| scripts/social/ingest-creative.mjs | .github/workflows/social-ci.yml, .github/workflows/social-orchestrator.yml |
| scripts/social/ingest-external-observation.mjs | .github/workflows/social-ci.yml, .github/workflows/social-external-observe.yml |
| scripts/social/ingest-open-creative-jobs.mjs | .github/workflows/social-ci.yml, .github/workflows/social-orchestrator.yml, .github/workflows/social-resume-verified-web.yml |
| scripts/social/ingest-owner-decisions.mjs | .github/workflows/social-ci.yml, .github/workflows/social-orchestrator.yml, .github/workflows/social-resume-verified-web.yml |
| scripts/social/ingest-performance.mjs | .github/workflows/social-ci.yml, .github/workflows/social-cloudflare.yml, .github/workflows/social-orchestrator.yml |
| scripts/social/make-carousel-candidates.mjs | .github/workflows/social-ci.yml, .github/workflows/social-orchestrator.yml |
| scripts/social/manual-now-web-candidate.mjs | .github/workflows/social-ci.yml, .github/workflows/social-resume-verified-web.yml |
| scripts/social/open-creative-request.mjs | .github/workflows/social-ci.yml, .github/workflows/social-orchestrator.yml, .github/workflows/social-resume-verified-web.yml |
| scripts/social/order-d-done.mjs | .github/workflows/social-ci.yml, .github/workflows/social-cloudflare.yml |
| scripts/social/plan-hashtag-observation.mjs | .github/workflows/social-ci.yml, .github/workflows/social-external-observe.yml |
| scripts/social/preflight-worker.mjs | .github/workflows/social-ci.yml, .github/workflows/social-cloudflare.yml |
| scripts/social/production-readiness.mjs | .github/workflows/social-ci.yml, .github/workflows/social-orchestrator.yml |
| scripts/social/provision-cloudflare.mjs | .github/workflows/social-ci.yml, .github/workflows/social-cloudflare.yml |
| scripts/social/publish-approval-queue.mjs | .github/workflows/social-ci.yml, .github/workflows/social-orchestrator.yml, .github/workflows/social-resume-verified-web.yml |
| scripts/social/rank-social-opportunities.mjs | .github/workflows/social-ci.yml, .github/workflows/social-external-intelligence.yml, .github/workflows/social-orchestrator.yml |
| scripts/social/reconcile-creative-jobs.mjs | .github/workflows/social-ci.yml, .github/workflows/social-orchestrator.yml, .github/workflows/social-resume-verified-web.yml |
| scripts/social/record-publication.mjs | .github/workflows/social-ci.yml, .github/workflows/social-publish-candidate.yml |
| scripts/social/render-asset.mjs | .github/workflows/social-ci.yml, .github/workflows/social-orchestrator.yml |
| scripts/social/request-creative-web.mjs | .github/workflows/social-ci.yml, .github/workflows/social-orchestrator.yml, .github/workflows/social-resume-verified-web.yml |
| scripts/social/request-creative.mjs | .github/workflows/social-ci.yml, .github/workflows/social-orchestrator.yml |
| scripts/social/research-web-story.mjs | .github/workflows/social-ci.yml, .github/workflows/social-resume-verified-web.yml |
| scripts/social/run-orchestrator.mjs | .github/workflows/social-ci.yml, .github/workflows/social-orchestrator.yml |
| scripts/social/run-post-job.mjs | .github/workflows/social-ci.yml, .github/workflows/social-orchestrator.yml |
| scripts/social/run-social-cycle.mjs | .github/workflows/social-ci.yml, .github/workflows/social-orchestrator.yml, .github/workflows/social-publish-candidate.yml |
| scripts/social/verify-approval-center.mjs | .github/workflows/social-ci.yml, .github/workflows/social-cloudflare.yml |
| scripts/social/verify-creative-dispatch.mjs | .github/workflows/ci.yml, .github/workflows/social-ci.yml, .github/workflows/social-orchestrator.yml |
| scripts/social/verify-hashtag-access.mjs | .github/workflows/social-ci.yml, .github/workflows/social-hashtag-capability.yml |
| scripts/social/verify-meta-capabilities.mjs | .github/workflows/social-ci.yml |
| scripts/social/verify-suites.mjs | .github/workflows/social-ci.yml, .github/workflows/social-cloudflare.yml, .github/workflows/social-orchestrator.yml, .github/workflows/social-resume-verified-web.yml |
| scripts/social/verify-worker.mjs | .github/workflows/social-ci.yml, .github/workflows/social-cloudflare.yml |
| scripts/supertrader/browser-qa.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-live-smoke.yml |
| scripts/supertrader/build.mjs | .github/workflows/ci.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/discover-availability.mjs | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/engine/backtest.mjs | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/engine/earnings.mjs | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/engine/execution.mjs | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/engine/gates.mjs | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/engine/indicators.mjs | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/engine/lifecycle.mjs | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/engine/partial/canslim.mjs | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/engine/partial/piotroski.mjs | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/engine/rotation-52w.mjs | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/engine/simulator.mjs | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/engine/strategies/darvas-v2.mjs | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/engine/strategies/darvas-v3.mjs | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/engine/strategies/darvas-v301.mjs | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/engine/strategies/darvas-v302.mjs | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/engine/strategies/darvas.mjs | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/engine/strategies/donchian-v2.mjs | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/engine/strategies/donchian-v201.mjs | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/engine/strategies/donchian-v202.mjs | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/engine/strategies/donchian-v21.mjs | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/engine/strategies/donchian.mjs | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/engine/strategies/greenblatt.mjs | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/engine/strategies/kk-breakout-ablation-r8.mjs | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/engine/strategies/kk-breakout-v2.mjs | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/engine/strategies/kk-breakout-v3.mjs | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/engine/strategies/kk-breakout-v31.mjs | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/engine/strategies/kk-breakout-v32.mjs | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/engine/strategies/kk-breakout.mjs | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/engine/strategies/minervini-v2.mjs | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/engine/strategies/minervini-v3.mjs | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/engine/strategies/minervini.mjs | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/engine/strategies/weinstein-v2.mjs | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/engine/strategies/weinstein-v3.mjs | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/engine/strategies/weinstein-v4.mjs | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/engine/strategies/weinstein.mjs | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/engine/weekly.mjs | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/europe-readiness.mjs | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/evidence.mjs | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/fidelity.mjs | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/fidelity/R15-CANONICAL-RULES.json | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/fidelity/R15-FIDELITY-MATRIX.json | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/fidelity/R15-MIGRATION-PLAN.json | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/fidelity/R15-RULE-PROVENANCE.json | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/fidelity/R15-STRATEGY-GAPS.json | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/fidelity/audit/fundamentals-matrix.json | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/fidelity/audit/live-text-and-fundamentals.md | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/fidelity/audit/live-text-audit.json | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/fidelity/audit/phase1-statements.json | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/fidelity/build-r15-artifacts.mjs | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/fidelity/canonical/darvas.json | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/fidelity/canonical/darvas.md | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/fidelity/canonical/kullamagi.json | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/fidelity/canonical/kullamagi.md | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/fidelity/canonical/minervini.json | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/fidelity/canonical/minervini.md | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/fidelity/canonical/turtle.json | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/fidelity/canonical/turtle.md | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/fidelity/canonical/weinstein.json | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/fidelity/canonical/weinstein.md | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/fidelity/portfolio-policy.mjs | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/fidelity/product-classes.mjs | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/fidelity/provenance-labels.mjs | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/fidelity/shared-rules.mjs | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/fidelity/taxonomy.mjs | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/foundation/artifacts/SUPERTRADER-A4-A5-A8-ROOT-CAUSES.json | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/foundation/artifacts/SUPERTRADER-ACCOUNTING-REGRESSION.json | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/foundation/artifacts/SUPERTRADER-BACKTEST-FOUNDATION-REVIEW.json | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/foundation/artifacts/SUPERTRADER-EXECUTION-REGRESSION.json | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/foundation/artifacts/SUPERTRADER-FOUNDATION-READINESS.json | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/foundation/artifacts/SUPERTRADER-SNAPSHOT-CONTRACT.json | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/foundation/artifacts/SUPERTRADER-SNAPSHOT-INTEGRITY-RESULT.json | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/foundation/artifacts/SUPERTRADER-SNAPSHOT-RESTORE-RESULT.json | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/foundation/artifacts/snapshot-runs/39211850181/capture.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-research-snapshot.yml |
| scripts/supertrader/foundation/artifacts/snapshot-runs/39211850181/parallel-consistency.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-research-snapshot.yml |
| scripts/supertrader/foundation/artifacts/snapshot-runs/39211850181/restore-a.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-research-snapshot.yml |
| scripts/supertrader/foundation/artifacts/snapshot-runs/39211850181/restore-b.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-research-snapshot.yml |
| scripts/supertrader/foundation/artifacts/snapshot-runs/39213033571/capture.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-research-snapshot.yml |
| scripts/supertrader/foundation/artifacts/snapshot-runs/39213033571/parallel-consistency.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-research-snapshot.yml |
| scripts/supertrader/foundation/artifacts/snapshot-runs/39213033571/restore-a.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-research-snapshot.yml |
| scripts/supertrader/foundation/artifacts/snapshot-runs/39213033571/restore-b.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-research-snapshot.yml |
| scripts/supertrader/foundation/artifacts/snapshot-runs/39217202814/parallel-consistency.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-research-snapshot.yml |
| scripts/supertrader/foundation/artifacts/snapshot-runs/39217202814/restore-a.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-research-snapshot.yml |
| scripts/supertrader/foundation/artifacts/snapshot-runs/39217202814/restore-b.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-research-snapshot.yml |
| scripts/supertrader/foundation/artifacts/snapshot-runs/39998409317/capture.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-research-snapshot.yml |
| scripts/supertrader/foundation/artifacts/snapshot-runs/39998409317/parallel-consistency.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-research-snapshot.yml |
| scripts/supertrader/foundation/artifacts/snapshot-runs/39998409317/restore-a.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-research-snapshot.yml |
| scripts/supertrader/foundation/artifacts/snapshot-runs/39998409317/restore-b.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-research-snapshot.yml |
| scripts/supertrader/foundation/artifacts/snapshot-runs/41627645169/parallel-consistency.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-research-snapshot.yml |
| scripts/supertrader/foundation/artifacts/snapshot-runs/41627645169/restore-a.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-research-snapshot.yml |
| scripts/supertrader/foundation/artifacts/snapshot-runs/41627645169/restore-b.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-research-snapshot.yml |
| scripts/supertrader/foundation/artifacts/snapshot-runs/41628817276/parallel-consistency.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-research-snapshot.yml |
| scripts/supertrader/foundation/artifacts/snapshot-runs/41628817276/restore-a.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-research-snapshot.yml |
| scripts/supertrader/foundation/artifacts/snapshot-runs/41628817276/restore-b.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-research-snapshot.yml |
| scripts/supertrader/foundation/build-accounting-evidence.mjs | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/foundation/cases.mjs | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/foundation/summarize-run.mjs | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/guard-protected-paths.mjs | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/house/DECISION-HS1.json | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/house/DECISION-HS2.json | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/house/DECISION-HS3-D1.json | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/house/DECISION-HS3-D2.json | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/house/DECISION-HS3-D3-DEV.json | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/house/DECISION-HS3-D3-HOLDOUT.json | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/house/DECISION-HS3.json | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/house/DECISION-HS4-OOS2008.json | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/house/DECISION-HS4.json | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/house/FROZEN-HS3-D3.json | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/house/LIVE-HS4-V03.json | .github/workflows/pipeline-daily.yml, .github/workflows/supertrader-ci.yml |
| scripts/supertrader/house/PREREGISTRATION-HS1.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-house.yml |
| scripts/supertrader/house/PREREGISTRATION-HS2.json | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/house/PREREGISTRATION-HS3-D1.json | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/house/PREREGISTRATION-HS3-D2.json | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/house/PREREGISTRATION-HS3-D3.json | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/house/PREREGISTRATION-HS3.json | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/house/PREREGISTRATION-HS4-OOS2008.json | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/house/PREREGISTRATION-HS4.json | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/house/analyze.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-house.yml |
| scripts/supertrader/house/engine.mjs | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/house/live.mjs | .github/workflows/pipeline-daily.yml, .github/workflows/supertrader-ci.yml |
| scripts/supertrader/house/seal.mjs | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/house/session-public-key.pem | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/house/stats.mjs | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/intraday-prefetch.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/model-portfolio.mjs | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/pilot/donchian-weekly.mjs | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/probe/delisting-probe.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-delisting-probe.yml |
| scripts/supertrader/probe/results-2026-10-01.json | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/process-chain.mjs | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/prune-dead-refs.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/registry-p1.mjs | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/registry-r10.mjs | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/registry-r11.mjs | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/registry-r12.mjs | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/registry-r13.mjs | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/registry-r4.mjs | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/registry-r7.mjs | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/registry-r8.mjs | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/registry.mjs | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/replay.mjs | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/restore-full-ledgers.mjs | .github/workflows/pipeline-daily.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/sf8-visual-qa.mjs | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/snapshot/SNAPSHOT-POINTER-HOLDOUT.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-research-snapshot.yml |
| scripts/supertrader/snapshot/SNAPSHOT-POINTER-SMOKE.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-research-snapshot.yml |
| scripts/supertrader/snapshot/SNAPSHOT-POINTER.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-research-snapshot.yml |
| scripts/supertrader/snapshot/build-contract-artifact.mjs | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/snapshot/contract.mjs | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/snapshot/fetch-v13-archive-parts.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-st-hist-top5.yml, .github/workflows/supertrader-st9-v13-study.yml |
| scripts/supertrader/snapshot/io.mjs | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/snapshot/pointer.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-research-snapshot.yml |
| scripts/supertrader/snapshot/replay.mjs | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/snapshot/restore-job.sh | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-research-snapshot.yml |
| scripts/supertrader/snapshot/snapshot.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-research-snapshot.yml |
| scripts/supertrader/snapshot/st9-study-summary.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-st9-v13-study.yml |
| scripts/supertrader/snapshot/store.mjs | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/source-faithful/adapters/industry-groups.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/artifacts/STRATEGY-BACKTEST-READINESS.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/artifacts/STRATEGY-COMPLETION-GAPS.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/artifacts/STRATEGY-COMPLETION-STATUS.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/artifacts/STRATEGY-COVERAGE-MATRIX.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/artifacts/STRATEGY-DATA-DEPENDENCIES.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/artifacts/STRATEGY-EXECUTION-RESULTS.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/artifacts/STRATEGY-EXECUTION-REVIEW.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/artifacts/STRATEGY-GOLDEN-CASE-CATALOGUE.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/artifacts/STRATEGY-GOLDEN-CASE-RESULTS.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/artifacts/STRATEGY-IMPLEMENTATION-READINESS.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/artifacts/STRATEGY-IMPLEMENTATION-STATUS.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/artifacts/STRATEGY-KK-EP-PS-CHART.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/artifacts/STRATEGY-LIVE-READINESS.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/artifacts/STRATEGY-MINERVINI-LIFECYCLE.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/artifacts/STRATEGY-MINERVINI-SOURCE-INVENTORY.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/artifacts/STRATEGY-READINESS-SF3.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/artifacts/STRATEGY-REGISTRY-VALIDATION.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/artifacts/STRATEGY-REGISTRY.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/artifacts/STRATEGY-RISK-VALIDATION.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/artifacts/STRATEGY-SF5-LIFECYCLE.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/artifacts/STRATEGY-SF6-READINESS.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/artifacts/STRATEGY-SF7-COMPLETION.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/artifacts/STRATEGY-SNAPSHOT-PROVENANCE.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/artifacts/STRATEGY-SOURCE-CONTRACTS.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/artifacts/STRATEGY-SOURCE-FIDELITY-RESULTS.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/build-artifacts.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/build-docs.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/certification/C06-C07-FID1-PREREGISTRATION.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/certification/C08-FID4-PREREGISTRATION.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/certification/CERT-PREP-ALL13-PLAN.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/certification/CERT-PREP-TOP5-PLAN.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/certification/READING-DECISIONS-2026-11-04.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/certification/cert-prep-all13.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/certification/cert-prep-top5.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/common/series.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/completion/build-completion-docs.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/completion/build-completion.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/completion/build-kk-ep-ps.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/completion/build-minervini-lifecycle.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/completion/build-minervini-source-inventory.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/completion/build-readiness-sf3.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/completion/build-sf5-lifecycle.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/completion/build-sf6-readiness.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/completion/facts.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/completion/gaps.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/completion/rebuild-all.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/completion/sf6-paper-protocol-2027-v1_2_0.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/completion/sf6-paper-protocol-2027.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/completion/sf6-readiness-criteria.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/completion/sf6-run-facts.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/completion/sf7-completion-matrix.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/completion/status.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/contract.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/contracts/darvas.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/contracts/define.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/contracts/holy-grail.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/contracts/kullamagi.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/contracts/minervini.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/contracts/morales-kacher.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/contracts/turtle.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/contracts/weinstein.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/evidence/MINERVINI-SF7-FINDINGS-CLASSIFICATION.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/evidence/MINERVINI-SF7-FINDINGS.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/evidence/PSR709-EVIDENCE-EXTRACT.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/evidence/build-evidence-matrix.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/evidence/minervini-sf7-findings.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/evidence/psr709-extract.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/integrity/ca-edgar-1.4.0.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/integrity/ca-edgar-1.4.1.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/integrity/ca-edgar-1.4.2.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/integrity/ca-edgar.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/integrity/ca-overlay.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/integrity/ca-resolution-1.0.0.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/integrity/ca-resolution.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/integrity/discontinuity.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/methods/darvas.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/methods/holy-grail.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/methods/kullamagi.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/methods/minervini.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/methods/morales-kacher.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/methods/turtle.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/methods/weinstein.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/paper/activation-2027.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/paper/forward-log.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/paper/forward-source.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/paper/run-paper-2027.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml, .github/workflows/supertrader-validation.yml |
| scripts/supertrader/source-faithful/product/build-candidates.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml, .github/workflows/supertrader-sf8-candidates.yml |
| scripts/supertrader/source-faithful/product/candidate-contract.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/product/catalog.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/product/data-quality.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/product/detectors.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/product/eod-adapter.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/product/golden-fixture-add.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/product/input-gate.mjs | .github/workflows/security-master-weekly.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/product/price-parity.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/product/publication-contract.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml, .github/workflows/supertrader-sf8-candidates.yml |
| scripts/supertrader/source-faithful/product/ranking.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/product/records.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/product/registry-guard.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/product/screener-export.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/record-golden-results.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/registry.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/research/context-evidence.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/research/darvas-lifecycle.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/research/holy-grail-lifecycle.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/research/industry-strength.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/research/kk-breakout-fidelity.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/research/kk-breakout-lifecycle.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/research/kk-ep-lifecycle.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/research/kk-intraday.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/research/kk-ps-study.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/research/kk-sample-ext-e7-6.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/research/kk-sample.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/research/lifecycle-engine.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/research/market-breadth.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/research/minervini-components.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/research/minervini-execution.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/research/minervini-fidelity.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/research/minervini-fundamentals-sf6.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/research/minervini-lifecycle-matrix.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/research/minervini-lifecycle.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/research/minervini-sf7-exit-execution.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/research/minervini-sf7-exits.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/research/minervini-sf7-mechanical.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/research/minervini-sf7.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/research/minervini-trade-view.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/research/moka-lifecycle.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/research/pp-missing-low-comparison.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/research/run-kk-intraday.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml, .github/workflows/supertrader-validation.yml |
| scripts/supertrader/source-faithful/research/run-sf3-research.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml, .github/workflows/supertrader-validation.yml |
| scripts/supertrader/source-faithful/research/run-sf4-lifecycle.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml, .github/workflows/supertrader-validation.yml |
| scripts/supertrader/source-faithful/research/run-sf5-lifecycle.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml, .github/workflows/supertrader-validation.yml |
| scripts/supertrader/source-faithful/research/run-sf6-integrity.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml, .github/workflows/supertrader-validation.yml |
| scripts/supertrader/source-faithful/research/run-sf6-validation.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml, .github/workflows/supertrader-validation.yml |
| scripts/supertrader/source-faithful/research/run-sf7-ca-edgar.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml, .github/workflows/supertrader-validation.yml |
| scripts/supertrader/source-faithful/research/run-sf7-ca-resolution.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml, .github/workflows/supertrader-validation.yml |
| scripts/supertrader/source-faithful/research/run-sf7-minervini.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml, .github/workflows/supertrader-validation.yml |
| scripts/supertrader/source-faithful/research/run-sf7-tiingo-splits-probe.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml, .github/workflows/supertrader-validation.yml |
| scripts/supertrader/source-faithful/research/run-st-hist-top5.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml, .github/workflows/supertrader-st-hist-top5.yml |
| scripts/supertrader/source-faithful/research/run-st-holdout.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml, .github/workflows/supertrader-st-hist-top5.yml |
| scripts/supertrader/source-faithful/research/run-st9-v13-delisted-study.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml, .github/workflows/supertrader-st9-v13-study.yml |
| scripts/supertrader/source-faithful/research/sf5-lifecycle-matrix.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/research/sf5-lifecycles.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/research/sf6-model-variants.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/research/sf6-references.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/research/sf7-code-coverage.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/research/sf7-edgar-client.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/research/sf7-ep-execution-variants.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/research/sf7-execution-checks.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/research/sf7-execution-validation.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/research/sf7-execution-variants.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/research/sf7-minervini-variants.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/research/st-hist-kk.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/research/st9-hist-execution.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/research/st9-hist-universe.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/research/st9-v13-delisted-registration-1.0.0.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml, .github/workflows/supertrader-st9-v13-study.yml |
| scripts/supertrader/source-faithful/research/st9-v13-delisted-registration-1.0.1.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/research/st9-v13-delisted-study.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/research/turtle-correlation.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/research/weinstein-lifecycle.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/reviews.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/runner/metrics.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/runner/run-research.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml, .github/workflows/supertrader-validation.yml |
| scripts/supertrader/source-faithful/runner/snapshot-input.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-faithful/signals/research-signal.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml |
| scripts/supertrader/source-ledger.json | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/tests/artifacts.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/atr-wilder.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/chart-by-ticker.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/discover-availability.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/e5-home-view.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/engine.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/europe-gap-aware-pilot.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/europe-readiness.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/fixtures/delist-cases-r15.json | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/tests/fixtures/foundation-legacy-golden.json | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/tests/fixtures/sf-product-candidates.json | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/tests/fixtures/sf7-golden-scenarios.mjs | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/tests/fixtures/sf8-golden-bars.json | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/tests/fixtures/sf8-price-parity-golden.json | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/tests/fixtures/technical-stock-sample.json | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/tests/foundation-accounting.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/house-hs1.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/pipeline-daily.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-house.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/identity-links.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/kk-intraday-probe.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/lens-mobile-layout.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/lifecycle.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/paper-forward-fixture.mjs | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/tests/payload-slices.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/phase1.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/pilot.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/prune-dead-refs.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/r10-cases.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/r11.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/r12.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/r13.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/r14.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/r15.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/r4.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/r5.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/r6.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/r7-diagnose.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/r7-engines.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/r7-live.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/r8-darvas-weinstein.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/r8-kk.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/r8-turtle.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/r9-intraday.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/registry.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/research-preview.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/restore-full-ledgers.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/sf-cert-prep-all13.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-sf8-candidates.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/sf-cert-prep-top5.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-sf8-candidates.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/sf-completion.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/core-ci.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-sf8-candidates.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/sf-context-evidence-research.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-sf8-candidates.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/sf-darvas-completion.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-sf8-candidates.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/sf-darvas.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-sf8-candidates.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/sf-foundation.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-sf8-candidates.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/sf-holy-grail.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-sf8-candidates.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/sf-industry-groups.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-sf8-candidates.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/sf-industry-strength-research.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-sf8-candidates.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/sf-kk-e7-6-sample.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-sf8-candidates.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/sf-kk-ep-ps-chart.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-sf8-candidates.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/sf-kk-sf6-sample.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-sf8-candidates.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/sf-kullamagi.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-sf8-candidates.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/sf-mc3-causality-minutes.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-sf8-candidates.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/sf-mc3-causality.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-sf8-candidates.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/sf-mc3-evidence-matrix.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-sf8-candidates.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/sf-mc3-product-wording.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-sf8-candidates.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/sf-minervini-components.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-sf8-candidates.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/sf-minervini-lifecycle.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-sf8-candidates.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/sf-minervini.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-sf8-candidates.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/sf-moka-completion.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-sf8-candidates.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/sf-morales-kacher.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-sf8-candidates.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/sf-paper-2027-activation.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml, .github/workflows/supertrader-sf8-candidates.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/sf-paper-2027-forward.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml, .github/workflows/supertrader-sf8-candidates.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/sf-pp-missing-low-fix.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-sf8-candidates.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/sf-product-contract.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/core-ci.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-sf8-candidates.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/sf-reading-decisions.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-sf8-candidates.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/sf-runner.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-sf8-candidates.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/sf-screener-export.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-sf8-candidates.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/sf-sf3-runner-research.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-sf8-candidates.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/sf-sf4-lifecycle-runner.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-sf8-candidates.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/sf-sf5-darvas-lifecycle.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-sf8-candidates.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/sf-sf5-kk-moka-lifecycle.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-sf8-candidates.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/sf-sf5-lifecycle-runner.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-sf8-candidates.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/sf-sf5-owner-decisions.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-sf8-candidates.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/sf-sf5-weinstein-group-proxy.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-sf8-candidates.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/sf-sf5-weinstein-lifecycle.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-sf8-candidates.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/sf-sf6-integrity.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-sf8-candidates.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/sf-sf6-readiness.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml, .github/workflows/supertrader-sf8-candidates.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/sf-sf6-validation.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-sf8-candidates.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/sf-sf7-ca-edgar.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-sf8-candidates.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/sf-sf7-ca-resolution.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-sf8-candidates.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/sf-sf7-completion.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-sf8-candidates.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/sf-sf7-execution-validation.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-sf8-candidates.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/sf-sf7-execution.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-sf8-candidates.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/sf-sf7-minervini-exits.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-sf8-candidates.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/sf-sf7-minervini-mechanical.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-sf8-candidates.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/sf-sf7-minervini.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-sf8-candidates.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/sf-sf7-optimistic-fixes.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-sf8-candidates.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/sf-sf7-tiingo-splits-probe.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-sf8-candidates.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/sf-sf8-candidates.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-sf8-candidates.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/sf-sf8-daily.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-sf8-candidates.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/sf-sf8-data-adapter.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-sf8-candidates.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/sf-sf8-price-parity.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-sf8-candidates.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/sf-sf9-e2e.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-sf8-candidates.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/sf-sf9-publication.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-sf8-candidates.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/sf-st-hist-top5.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-sf8-candidates.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/sf-st-holdout.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-sf8-candidates.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/sf-st9-hist-execution.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-sf8-candidates.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/sf-st9-hist-turtle-stops.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-sf8-candidates.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/sf-st9-hist-universe.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-sf8-candidates.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/sf-st9-v13-delisted-study.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-sf8-candidates.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/sf-st9-v13-study-workflow.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-sf8-candidates.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/sf-turtle-completion.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-sf8-candidates.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/sf-turtle-correlation-research.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-sf8-candidates.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/sf-turtle-n-wilder.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-sf8-candidates.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/sf-turtle.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-sf8-candidates.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/sf-weinstein.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-sf8-candidates.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/sf-x-ledger.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-sf8-candidates.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/sf8-reference-fixture.mjs | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/tests/snapshot-fixture.mjs | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/tests/snapshot.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/st-technical.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/validation-methods.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/tests/validation.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-signals.yml |
| scripts/supertrader/trend52-live.mjs | .github/workflows/supertrader-ci.yml |
| scripts/supertrader/validation/AUDIT-R14-RESULT.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-validation.yml |
| scripts/supertrader/validation/DECISION-R11.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-validation.yml |
| scripts/supertrader/validation/DECISION-R12.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-validation.yml |
| scripts/supertrader/validation/DECISION-R13.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-validation.yml |
| scripts/supertrader/validation/PREREGISTRATION-METHODS.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-validation.yml |
| scripts/supertrader/validation/PREREGISTRATION-R10-CASES.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-validation.yml |
| scripts/supertrader/validation/PREREGISTRATION-R10-FIXES.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-validation.yml |
| scripts/supertrader/validation/PREREGISTRATION-R10-VENUES.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-validation.yml |
| scripts/supertrader/validation/PREREGISTRATION-R11.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-validation.yml |
| scripts/supertrader/validation/PREREGISTRATION-R12.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-validation.yml |
| scripts/supertrader/validation/PREREGISTRATION-R13-AUDIT.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-validation.yml |
| scripts/supertrader/validation/PREREGISTRATION-R14.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-validation.yml |
| scripts/supertrader/validation/PREREGISTRATION-R7.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-validation.yml |
| scripts/supertrader/validation/PREREGISTRATION-R8-TURTLE.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-validation.yml |
| scripts/supertrader/validation/PREREGISTRATION-R8.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-validation.yml |
| scripts/supertrader/validation/PREREGISTRATION-R8B.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-validation.yml |
| scripts/supertrader/validation/PREREGISTRATION-R8C.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-validation.yml |
| scripts/supertrader/validation/PREREGISTRATION-R9-INTRADAY-AMENDMENT.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-validation.yml |
| scripts/supertrader/validation/PREREGISTRATION-R9-INTRADAY.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-validation.yml |
| scripts/supertrader/validation/PREREGISTRATION-R9B-RESOLVED.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-validation.yml |
| scripts/supertrader/validation/PREREGISTRATION.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-validation.yml |
| scripts/supertrader/validation/R14-SOURCE-CHAINS.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-validation.yml |
| scripts/supertrader/validation/accounting-contract.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-validation.yml |
| scripts/supertrader/validation/analyze-methods.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-validation.yml |
| scripts/supertrader/validation/analyze-trend52.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-validation.yml |
| scripts/supertrader/validation/analyze.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-validation.yml |
| scripts/supertrader/validation/audit-r13.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-validation.yml |
| scripts/supertrader/validation/audit-r14.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-validation.yml |
| scripts/supertrader/validation/case-report.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-validation.yml |
| scripts/supertrader/validation/case-study.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-validation.yml |
| scripts/supertrader/validation/delist-cases-r15.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-validation.yml |
| scripts/supertrader/validation/diagnose-methods.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-validation.yml |
| scripts/supertrader/validation/evidence-internal.sealed.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-validation.yml |
| scripts/supertrader/validation/fetch-sources.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-validation.yml |
| scripts/supertrader/validation/fetch.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml, .github/workflows/supertrader-validation.yml |
| scripts/supertrader/validation/intraday-oracle.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-validation.yml |
| scripts/supertrader/validation/intraday-probe.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-validation.yml |
| scripts/supertrader/validation/intraday-study.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-validation.yml |
| scripts/supertrader/validation/kk-intraday-probe.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-validation.yml |
| scripts/supertrader/validation/lib.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-paper-2027.yml, .github/workflows/supertrader-validation.yml |
| scripts/supertrader/validation/portfolio.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-validation.yml |
| scripts/supertrader/validation/results-public-key.pem | .github/workflows/research-signals-s2.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-validation.yml |
| scripts/supertrader/validation/sec-pit.mjs | .github/workflows/pipeline-daily.yml, .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-house.yml, .github/workflows/supertrader-paper-2027.yml, .github/workflows/supertrader-validation.yml |
| scripts/supertrader/validation/sources-r10-minervini.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-validation.yml |
| scripts/supertrader/validation/sources-r12-traderfox.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-validation.yml |
| scripts/supertrader/validation/sources-r8.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-validation.yml |
| scripts/supertrader/validation/sources-r8b.json | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-validation.yml |
| scripts/supertrader/validation/universe-audit.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-validation.yml |
| scripts/supertrader/validation/venue-probe.mjs | .github/workflows/supertrader-ci.yml, .github/workflows/supertrader-validation.yml |
| scripts/sync-navigation.mjs | .github/workflows/sync-navigation.yml |
| scripts/technical/build-technical-data.mjs | .github/workflows/market-data-refresh.yml, .github/workflows/quant-ci.yml |
| scripts/technical/build-technical-intelligence.mjs | .github/workflows/quant-ci.yml, .github/workflows/technical-intelligence-build.yml |
| scripts/technical/elliott-registry/evaluate-registry.mjs | .github/workflows/elliott-prospective-registry.yml, .github/workflows/quant-ci.yml |
| scripts/technical/elliott-registry/register.mjs | .github/workflows/elliott-prospective-registry.yml, .github/workflows/quant-ci.yml |
| scripts/technical/elliott-registry/verify.mjs | .github/workflows/elliott-prospective-registry.yml, .github/workflows/quant-ci.yml |
| scripts/technical/materialize-product-intelligence.mjs | .github/workflows/product-intelligence-materialization.yml, .github/workflows/quant-ci.yml |
| scripts/technical/run-technical-scale.mjs | .github/workflows/quant-ci.yml, .github/workflows/tiingo-scale.yml |
| scripts/technical/verify-technical-data.mjs | .github/workflows/market-data-refresh.yml, .github/workflows/quant-ci.yml |
| scripts/technical/verify-technical-intelligence.mjs | .github/workflows/quant-ci.yml, .github/workflows/technical-intelligence-build.yml |
| scripts/technical/world/academy-audit-contract.cjs | .github/workflows/monitor.yml, .github/workflows/quant-ci.yml, .github/workflows/technical-ci.yml |
| scripts/technical/world/academy-browser-qa.mjs | .github/workflows/monitor.yml, .github/workflows/quant-ci.yml, .github/workflows/technical-ci.yml |
| scripts/technical/world/browser-qa.mjs | .github/workflows/quant-ci.yml, .github/workflows/technical-ci.yml |
| scripts/technical/world/build-screener.mjs | .github/workflows/quant-ci.yml, .github/workflows/technical-ci.yml, .github/workflows/technical-world.yml |
| scripts/technical/world/live-qa.mjs | .github/workflows/monitor.yml, .github/workflows/quant-ci.yml, .github/workflows/technical-ci.yml |
| scripts/universe/browser-qa.mjs | .github/workflows/universe-master.yml |
| scripts/universe/build-cik-map.mjs | .github/workflows/sec-fundamentals-universe.yml, .github/workflows/universe-master.yml |
| scripts/universe/build-company-master.mjs | .github/workflows/coverage-metrics.yml, .github/workflows/sec-fundamentals-daily.yml, .github/workflows/sec-fundamentals-universe.yml, .github/workflows/security-master-eligibility.yml, .github/workflows/universe-master.yml |
| scripts/universe/build-issuer-master.mjs | .github/workflows/sec-fundamentals-daily.yml, .github/workflows/sec-fundamentals-universe.yml, .github/workflows/security-master-eligibility.yml, .github/workflows/universe-master.yml |
| scripts/universe/build-sec-universe.mjs | .github/workflows/sec-fundamentals-daily.yml, .github/workflows/sec-fundamentals-universe.yml, .github/workflows/universe-master.yml |
| scripts/universe/build-universe-indexes.mjs | .github/workflows/coverage-metrics.yml, .github/workflows/sec-fundamentals-daily.yml, .github/workflows/sec-fundamentals-universe.yml, .github/workflows/security-master-eligibility.yml, .github/workflows/universe-master.yml |
| scripts/universe/scale-test.mjs | .github/workflows/universe-master.yml |
| scripts/universe/verify-company-master.mjs | .github/workflows/coverage-metrics.yml, .github/workflows/security-master-eligibility.yml, .github/workflows/universe-master.yml |
| scripts/vorsorge/assert-vorsorge-data.mjs | .github/workflows/ci.yml, .github/workflows/pipeline-daily.yml, .github/workflows/vorsorge-etf-sources.yml, .github/workflows/vorsorge-etf-universe.yml |
| scripts/vorsorge/build-etf-data.mjs | .github/workflows/ci.yml, .github/workflows/pipeline-daily.yml, .github/workflows/vorsorge-etf-sources.yml, .github/workflows/vorsorge-etf-universe.yml |
| scripts/vorsorge/build-etf-intelligence.mjs | .github/workflows/ci.yml, .github/workflows/vorsorge-etf-sources.yml, .github/workflows/vorsorge-etf-universe.yml |
| scripts/vorsorge/fetch-legal-sources.sh | .github/workflows/ci.yml, .github/workflows/vorsorge-etf-sources.yml, .github/workflows/vorsorge-etf-universe.yml, .github/workflows/vorsorge-legal-sources.yml |
| scripts/vorsorge/fetch-sec-sic.mjs | .github/workflows/ci.yml, .github/workflows/vorsorge-etf-sources.yml, .github/workflows/vorsorge-etf-universe.yml |
| scripts/vorsorge/ingest-esma-firds.mjs | .github/workflows/ci.yml, .github/workflows/vorsorge-etf-sources.yml, .github/workflows/vorsorge-etf-universe.yml |
| scripts/vorsorge/ingest-esma-funds.mjs | .github/workflows/ci.yml, .github/workflows/vorsorge-etf-sources.yml, .github/workflows/vorsorge-etf-universe.yml |
| scripts/vorsorge/ingest-sec-nport.mjs | .github/workflows/ci.yml, .github/workflows/vorsorge-etf-sources.yml, .github/workflows/vorsorge-etf-universe.yml |
| scripts/vorsorge/ingest-sec-rr.mjs | .github/workflows/ci.yml, .github/workflows/vorsorge-etf-sources.yml, .github/workflows/vorsorge-etf-universe.yml |
| scripts/vorsorge/ingest-tiingo-etfs.mjs | .github/workflows/ci.yml, .github/workflows/vorsorge-etf-sources.yml, .github/workflows/vorsorge-etf-universe.yml |
| scripts/vorsorge/ingest-xetra-refdata.mjs | .github/workflows/ci.yml, .github/workflows/vorsorge-etf-sources.yml, .github/workflows/vorsorge-etf-universe.yml |
| scripts/vorsorge/live-smoke.mjs | .github/workflows/ci.yml, .github/workflows/monitor.yml, .github/workflows/vorsorge-etf-sources.yml, .github/workflows/vorsorge-etf-universe.yml |
| scripts/vorsorge/probe-etf-sources.mjs | .github/workflows/ci.yml, .github/workflows/vorsorge-etf-sources.yml, .github/workflows/vorsorge-etf-universe.yml |
| scripts/vorsorge/probe-eu-etf-sources.mjs | .github/workflows/ci.yml, .github/workflows/vorsorge-etf-sources.yml, .github/workflows/vorsorge-etf-universe.yml |
| scripts/vu2/browser-qa-direct.mjs | .github/workflows/pages-release.yml, .github/workflows/quant-ci.yml, .github/workflows/vu2-browser-qa.yml |
| scripts/vu2/build-product-capabilities.mjs | .github/workflows/intraday-snapshots.yml, .github/workflows/market-data-refresh.yml, .github/workflows/pages-release.yml, .github/workflows/quant-ci.yml, .github/workflows/sec-consumer-fundamentals.yml, .github/workflows/security-master-eligibility.yml, .github/workflows/vu2-browser-qa.yml |
| scripts/vu2/build-release.mjs | .github/workflows/ci.yml, .github/workflows/company-intelligence.yml, .github/workflows/discover-frontend-ci.yml, .github/workflows/pages-release.yml, .github/workflows/pipeline-daily.yml, .github/workflows/quant-ci.yml, .github/workflows/sec-fundamentals-ci.yml, .github/workflows/shell-ci.yml, .github/workflows/supertrader-ci.yml, .github/workflows/vu2-browser-qa.yml |
| scripts/vu2/deploy-switch-lib.mjs | .github/workflows/discover-frontend-ci.yml, .github/workflows/pages-release.yml, .github/workflows/quant-ci.yml, .github/workflows/vu2-browser-qa.yml |
| scripts/vu2/deploy-switch-qa.mjs | .github/workflows/pages-release.yml, .github/workflows/quant-ci.yml, .github/workflows/vu2-browser-qa.yml |
| scripts/vu2/measure-consumer-breadth.mjs | .github/workflows/pages-release.yml, .github/workflows/product-intelligence-materialization.yml, .github/workflows/quant-ci.yml, .github/workflows/vu2-browser-qa.yml |
| scripts/vu2/measure-journey.mjs | .github/workflows/pages-release.yml, .github/workflows/product-intelligence-materialization.yml, .github/workflows/quant-ci.yml, .github/workflows/vu2-browser-qa.yml |
| scripts/vu2/minify-release.mjs | .github/workflows/pages-release.yml, .github/workflows/quant-ci.yml, .github/workflows/vu2-browser-qa.yml |
| scripts/vu2/production-smoke.mjs | .github/workflows/ci.yml, .github/workflows/pages-release.yml, .github/workflows/quant-ci.yml, .github/workflows/vu2-browser-qa.yml |
| scripts/vu2/release-id.mjs | .github/workflows/discover-frontend-ci.yml, .github/workflows/pages-release.yml, .github/workflows/quant-ci.yml, .github/workflows/technical-ci.yml, .github/workflows/vu2-browser-qa.yml |
| scripts/vu2/resource-budget.test.mjs | .github/workflows/company-intelligence.yml, .github/workflows/pages-release.yml, .github/workflows/quant-ci.yml, .github/workflows/vu2-browser-qa.yml |
| scripts/vu2/verify-history-handoff.mjs | .github/workflows/pages-release.yml, .github/workflows/quant-ci.yml, .github/workflows/vu2-browser-qa.yml, .github/workflows/vu2-lifecycle-handoff.yml |
| scripts/vu2/verify-journey-surfaces.mjs | .github/workflows/pages-release.yml, .github/workflows/quant-ci.yml, .github/workflows/vu2-browser-qa.yml |
| scripts/watchlist/fetch-published.mjs | .github/workflows/account-ci.yml, .github/workflows/pages-release.yml |
| worker-waker/src/index.mjs | .github/workflows/cloudflare-waker-deploy.yml |
| worker-waker/tests/waker.test.mjs | .github/workflows/cloudflare-waker-deploy.yml |

## Dynamik und ungelesene Quellen

2080 dynamische/zusammengesetzte import/require/fetch-Ausdrücke gefunden; diese verhindern einen vollständigen statischen Nichtnutzungsbeweis.

| Quelle | Ausdruck |
|---|---|
| .github/workflows/company-intelligence-profile-source.yml | ` fetch('https://research.visionuniverse.de/company-intelligence-delivery.json?profile='+Date.now(),{signal:AbortSignal.timeout(15000)}) ` |
| .github/workflows/company-intelligence-universe-release.yml | ` fetch(root+'company-intelligence-delivery.json'+query),d=await r.json() ` |
| .github/workflows/company-intelligence-universe-release.yml | ` fetch(root+'company-intelligence-refresh.json'+query)).json() ` |
| .github/workflows/elliott-prospective-registry.yml | ` require("./'"$REG"'/HEAD.json") ` |
| .github/workflows/elliott-prospective-registry.yml | ` require("./'"$REG"'/HEAD.json") ` |
| .github/workflows/europe-discover-refresh.yml | ` require(process.argv[1]).run&#124;&#124;{} ` |
| .github/workflows/freshness-monitor.yml | ` require(process.env.RUNNER_TEMP + "/pipeline-freshness.json") ` |
| .github/workflows/fundamental-sec-freshness.yml | ` require(process.argv[1]) ` |
| .github/workflows/fundamental-sec-freshness.yml | ` require(process.argv[1]).oldestPending &#124;&#124; "")' "$RUNNER_TEMP/freshness.json") ` |
| .github/workflows/fundamental-sec-freshness.yml | ` require(process.argv[1]) ` |
| .github/workflows/fundamental-sec-freshness.yml | ` require(process.argv[1]) ` |
| .github/workflows/long-series.yml | ` require(process.argv[1]).affected.length)' "$RUNNER_TEMP/verify.json") ` |
| .github/workflows/long-series.yml | ` require(process.argv[1]).affected.map(a => a.ticker).join(","))' "$RUNNER_TEMP/verify.json") ` |
| .github/workflows/long-series.yml | ` require(process.argv[1]).affected.map(a => a.securityId).join(" "))' "$RUNNER_TEMP/verify.json") ` |
| .github/workflows/market-data-refresh.yml | ` require(process.env.RUNNER_TEMP + "/total-return-repair.json") ` |
| .github/workflows/monitor.yml | ` require("./quant/data/market/commercial/" + name + ".json") ` |
| .github/workflows/product-intelligence-materialization.yml | ` require(process.env.RUNNER_TEMP+"/freshness-vorher.json") ` |
| .github/workflows/product-intelligence-materialization.yml | ` require(process.env.RUNNER_TEMP+"/freshness-vorher.json") ` |
| .github/workflows/quant-portfolio-research.yml | ` require(process.argv[1]) ` |
| .github/workflows/security-master-weekly.yml | ` require(process.env.REPORT) ` |
| .github/workflows/social-cloudflare.yml | ` require(process.cwd() + "/tmp/social/status.json") ` |
| .github/workflows/social-cloudflare.yml | ` require(process.cwd() + "/tmp/social/status.json") ` |
| .github/workflows/social-smoke-publish.yml | ` require(process.cwd() + "/tmp/smoke/status.json") ` |
| .github/workflows/social-smoke-publish.yml | ` require(process.cwd() + "/tmp/smoke/status.json") ` |
| .github/workflows/social-smoke-publish.yml | ` require(process.cwd() + "/tmp/smoke/status.json") ` |
| .github/workflows/supertrader-sf8-candidates.yml | ` require(process.env.REPORT) ` |
| .github/workflows/supertrader-sf8-candidates.yml | ` require(process.env.PUB + "/summary.json").asOf)') ` |
| .github/workflows/supertrader-sf8-candidates.yml | ` require(process.env.RECORD) ` |
| .github/workflows/supertrader-sf8-candidates.yml | ` require(process.env.RECORD) ` |
| .github/workflows/technical-intelligence-build.yml | ` require("./'"$V3"'/build-inputs.json").fingerprint&#124;&#124;"")}catch(e){console.log("")}') ` |
| .github/workflows/technical-intelligence-build.yml | ` require("./'"$V3"'/meta.json") ` |
| .github/workflows/technical-intelligence-build.yml | ` require("./'"$V3"'/meta.json") ` |
| .github/workflows/tiingo-scale.yml | ` require("./quant/data/market/scale/gate-" + process.env.GATE + ".json") ` |
| .github/workflows/tiingo-scale.yml | ` require("./quant/data/market/scale/gate-"+process.env.GATE+".json").verdict)}catch(e){console.log("MISSING")}') ` |
| .github/workflows/tiingo-scale.yml | ` require("./quant/data/market/scale/gate-"+process.env.GATE+".json") ` |
| academy/shell/experience-shell.js | ` fetch(url) ` |
| analysten/index.html | ` fetch(UNIVERSE_URL + suffix, opts).then(function(r){ return r.ok ? r.json() : { stocks: [] } ` |
| analysten/index.html | ` fetch(RATINGS_URL + suffix, opts).then(function(r){ if(!r.ok) throw new Error("HTTP " + r.status) ` |
| analysten/index.html | ` fetch(MARKET_URL + suffix, opts).then(function(r){ return r.ok ? r.json() : { symbols: {} } ` |
| analysten/index.html | ` fetch(url,{cache:"default"}).then(function(r){ if(!r.ok) throw new Error("HTTP "+r.status) ` |
| api/intraday.js | ` fetch(origin + "/" + path.replace(/^\/+/, ""), { ` |
| app/scripts/gesture-bridge-browser.mjs | ` require(modules ? modules+'/playwright' : 'playwright') ` |
| app/scripts/gesture-browser.mjs | ` require(deps ? deps+'/playwright' : 'playwright') ` |
| app/www/js/api.js | ` fetch(...a)}) { ` |
| app/www/js/auth.js | ` fetch(...a), now = Date.now}) { ` |
| ask/app.js | ` fetch(ENDPOINT + '/v1/quota?client=' + encodeURIComponent(clientId()), { headers: authHeaders() }) ` |
| ask/app.js | ` fetch(ENDPOINT + '/v1/ask', { method: 'POST', headers: authHeaders({ 'content-type': 'application/json' }), ` |
| ask/app.js | ` fetch(path, { cache: 'default' }).then(function (r) { if (!r.ok) throw Error('HTTP ' + r.status) ` |
| assets/vu-ui.js | ` fetch(LOGO_BASE + "index.json", { cache: "default", priority: "low" }).then(function (r) { return r.ok ? r.json() : {} ` |
| core/tests/client.test.mjs | ` require(join(ROOT, "core", "client.js")) ` |
| core/tests/europe-discover-known-invalid.test.mjs | ` import(join(root,'scripts/marketstack/europe-discover-refresh.mjs')) ` |
| core/tests/europe-discover-refresh.test.mjs | ` import(join(root,'scripts/marketstack/europe-discover-refresh.mjs')) ` |
| core/tests/europe-discover-schedule.test.mjs | ` import(join(root,'scripts/marketstack/europe-discover-refresh.mjs')) ` |
| core/tests/golden-paths.test.mjs | ` require(join(ROOT, "core", "client.js")) ` |
| core/tests/golden-paths.test.mjs | ` require(join(ROOT, "core", "identity.js")) ` |
| core/tests/health.test.mjs | ` require(join(ROOT, "core", "health.js")) ` |
| core/tests/health.test.mjs | ` require(join(ROOT, "quant", "engines", "realtime", "trading-session.js")) ` |
| core/tests/identity-adoption.test.mjs | ` require(join(ROOT, "core", "identity.js")) ` |
| core/tests/identity-adoption.test.mjs | ` require(join(ROOT, "quant", "engines", "company-master.js")) ` |
| core/tests/identity.test.mjs | ` require(join(ROOT, "core", "identity.js")) ` |
| core/tests/identity.test.mjs | ` require(join(ROOT, "quant", "engines", "company-master.js")) ` |
| core/tests/portfolios.test.mjs | ` require(join(root, "assets/vu-ui.js")) ` |
| core/tests/portfolios.test.mjs | ` require(join(root, "portfolios/portfolios.js")) ` |
| core/tests/sf8-data-quality.test.mjs | ` require(join(ROOT, "core", "data-quality.js")) ` |
| core/tests/sf8-data-quality.test.mjs | ` require(join(ROOT, "core", "identity.js")) ` |
| core/tests/sf8-data-quality.test.mjs | ` require(join(ROOT, "quant", "engines", "published-close.js")) ` |
| core/tests/shell-navigation.test.mjs | ` require(join(root, 'fundamental/engine/model.js')) ` |
| core/tests/shell-navigation.test.mjs | ` require(join(root, 'technical/engine/model.js')) ` |
| core/tests/state-gate.test.mjs | ` import(GATE) ` |
| core/tests/state/supertrader-discover.test.mjs | ` require(join(ROOT, "core", "client.js")) ` |
| core/tests/stock-address.test.mjs | ` require(join(ROOT, "core", "stock-address.js")) ` |
| core/tests/stock-address.test.mjs | ` require(join(ROOT, "core", "stock-context.js")) ` |
| core/tests/stock-availability.test.mjs | ` require(join(ROOT, "core", "stock-context.js")) ` |
| core/tests/stock-context.test.mjs | ` require(join(ROOT, "core", "stock-context.js")) ` |
| core/tests/stock-context.test.mjs | ` require(join(ROOT, "core", "identity.js")) ` |
| core/tests/stock-navigator.test.mjs | ` require(join(ROOT, "core", "stock-context.js")) ` |
| core/tests/stock-navigator.test.mjs | ` require(join(ROOT, "assets", "stock-navigator.js")) ` |
| core/tests/supertrader-chain.test.mjs | ` import(CHAIN) ` |
| core/tests/supertrader-chain.test.mjs | ` import(join(ROOT, "scripts", "ci", "pipeline-alarm.mjs")) ` |
| core/tests/vu-chart.test.mjs | ` require(join(ROOT, "assets", "vu-chart.js")) ` |
| core/tests/watchlist-button.test.mjs | ` require(join(ROOT, "core", "identity.js")) ` |
| core/tests/watchlist-button.test.mjs | ` require(join(ROOT, "assets", "watchlist-button.js")) ` |
| dashboard/app-rebuild.js | ` fetch('/dashboard/' + path, { cache: 'no-store' }).then((r) => { if (!r.ok) throw new Error(path) ` |
| dashboard/app.js | ` fetch(url).then(function(r){if(!r.ok)throw Error("Daten nicht verfügbar") ` |
| dashboard/index_legacy_v63.html | ` fetch(url)})) ` |
| dashboard/v2.js | ` fetch("/dashboard/"+(n==="universe"?"config/":"data/")+n+".json").then(r=>r.json()))).catch(()=>[]) ` |
| discover/engines/europe-bootstrap.js | ` fetch(localURL(binding.url),{cache:'no-cache',credentials:'same-origin'}) ` |
| discover/engines/europe-bootstrap.js | ` fetch(asset.path) ` |
| discover/engines/europe-bootstrap.js | ` fetch(BASE+'manifest.json',{cache:'no-cache',credentials:'same-origin'}) ` |
| discover/index.html | ` fetch() der Seite und wird genau diesem ` |
| discover/tests/contract.test.mjs | ` require(join(root, "discover", "engines", "contract.js")) ` |
| discover/tests/einordnung.test.mjs | ` require(join(root, "discover", "engines", "einordnung.js")) ` |
| discover/tests/einordnung.test.mjs | ` require(join(root, "discover", "engines", "unternehmen.js")) ` |
| discover/tests/europe-product.test.mjs | ` require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright') ` |
| discover/tests/high52w.test.mjs | ` require(join(root, "discover", "engines", "high52w.js")) ` |
| discover/tests/im-blick-live.test.mjs | ` require(join(ROOT, "core", "identity.js")) ` |
| discover/tests/im-blick-nachtlauf.test.mjs | ` require(join(ROOT, "core", "identity.js")) ` |
| discover/tests/im-blick-nachtlauf.test.mjs | ` require(join(ROOT, "discover", "engines", "refresh-plan.js")) ` |
| discover/tests/im-blick-nachtlauf.test.mjs | ` import(join(ROOT, "scripts", "ci", "pipeline-alarm.mjs")) ` |
| discover/tests/im-blick-refresh.test.mjs | ` require(join(ROOT, "core", "identity.js")) ` |
| discover/tests/im-blick-refresh.test.mjs | ` require(join(ROOT, "discover", "engines", "refresh-plan.js")) ` |
| discover/tests/im-blick-refresh.test.mjs | ` fetch({ request: { method: "GET", mode: "cors", url: "https://example.test" + abrufe[0].url, cache: "no-cache" }, respondWith: () => { intercepted = true ` |
| discover/tests/im-blick-refresh.test.mjs | ` fetch() {} }) ` |
| discover/tests/im-blick-refresh.test.mjs | ` fetch() {} }) ` |
| discover/tests/indicators.test.mjs | ` require(join(root, "discover", "engines", "indicators.js")) ` |
| discover/tests/klartext.test.mjs | ` require(join(root, "discover", "engines", "klartext.js")) ` |
| discover/tests/klartext.test.mjs | ` require(join(root, "discover", "engines", "contract.js")) ` |
| discover/tests/lazy-loading.test.mjs | ` fetch() derselben Adresse bekommt die vorgeholte Antwort - genau einmal', async () => { ` |
| discover/tests/price-rounding.test.mjs | ` require(join(root, "quant", "engines", "published-close.js")) ` |
| discover/tests/pwa-shell.test.mjs | ` fetch({request: req, respondWith: x => { r = x ` |
| discover/tests/realtime.test.mjs | ` require(join(root, "discover", "engines", "realtime-source.js")) ` |
| discover/tests/realtime.test.mjs | ` require(join(root, "discover", "engines", "contract.js")) ` |
| discover/tests/scoring.test.mjs | ` require(join(root, "discover", "engines", "scoring.js")) ` |
| discover/tests/scoring.test.mjs | ` require(join(root, "discover", "methodology", "discover-v1.json")) ` |
| discover/tests/technical-intelligence.test.mjs | ` require(join(root, "discover", "engines", "technical-intelligence.js")) ` |
| discover/tests/technical-intelligence.test.mjs | ` require(join(root, "discover", "engines", "contract.js")) ` |
| discover/tests/watchlist-coupling.test.mjs | ` require(join(ROOT, "core", "identity.js")) ` |
| discover/tests/watchlist-coupling.test.mjs | ` require(join(ROOT, "assets", "watchlist-button.js")) ` |
| discover/ui/featured.js | ` fetch(url,{cache:'no-cache'}).then(function(r){if(!r.ok)throw new Error('HTTP '+r.status) ` |
| discover/ui/lazy.js | ` fetch(src, { method: 'HEAD', cache: 'no-store', credentials: 'same-origin', signal: ctl ? ctl.signal : undefined }) ` |
| discover/ui/logos.js | ` fetch(BASE + "index.json", { cache: "default", priority: "low" }) ` |
| discover/ui/logos.js | ` fetch(BASE + "credits.json", { cache: "default" }) ` |
| discover/ui/series-loader.js | ` fetch(path, { cache: "default" }).then(function (r) { ` |
| docs/VU_MARKETS_3_CONSUMER_INTELLIGENCE.md | `` fetch(` und Providernamen in `market-intelligence.js`. `` |
| docs/VU_QUANT_2_FRONTEND_TRANSFORMATION.md | `` fetch()` `` |
| docs/VU_TWELVE_DATA_ADAPTER.md | ` fetch(url, init) ` |
| docs/accounts/ACCOUNTS_AND_SUBSCRIPTIONS.md | ` fetch(credentials:"include", X-VU-Client: web) – hält KEIN Token ` |
| docs/charts/CHART_STANDARD.md | ` fetch(path, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw 0 ` |
| docs/design/VU3_UI_SYSTEM.md | ` fetch(…).then(…), base: previousClose } ` |
| docs/design/redesign-2027/tools/series.js | ` require(path.resolve(__dirname, '../../../../core/identity.js')) ` |
| docs/quant-recovery/v8/validation-f10-checkpoint.json | ` require(\"node:fs\"),path=require(\"node:path\") ` |
| elliott/app.js | ` fetch(path, { credentials: "same-origin" }).then(function (res) { ` |
| elliott/index.html | ` fetch(g.getAttribute("data-content"),{credentials:"same-origin"}).then(function(r){return r.text() ` |
| elliott/spark.js | ` fetch("/quant/data/market/discover-series/" + id + ".json", { credentials: "same-origin" }) ` |
| fundamental/app.js | ` fetch(path, { credentials: 'same-origin' }).then(function (r) { if (!r.ok) { var e = new Error('HTTP ' + r.status) ` |
| fundamental/app.js | ` fetch(path, { credentials: 'same-origin' }).then(function (r) { ` |
| guide/app.js | ` fetch('/dashboard/' + path, { cache: 'no-store' }).then((r) => { if (!r.ok) throw new Error(path) ` |
| hedgefonds/app.js | ` fetch(url, { cache: "no-cache" }).then(function (r) { ` |
| hedgefonds/app.js | ` fetch(url, { cache: "no-cache" }).then(function (r) { ` |
| konto/watchlist.js | ` fetch(path, {cache: 'default', credentials: 'omit'}).then(function (r) { if (!r.ok) throw new Error('HTTP_' + r.status) ` |
| landing/scripts/check-live.mjs | ` fetch(new URL('assets/home/home.css',url)) ` |
| landing/scripts/cloudflare-audit.mjs | ` fetch('https://api.cloudflare.com/client/v4'+path,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(20000)}) ` |
| landing/scripts/cloudflare-prepare.mjs | ` fetch('https://api.cloudflare.com/client/v4'+path,{method,headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)}) ` |
| landing/scripts/compare-research.mjs | ` import(pathToFileURL(resolve(temporary,'landing/scripts/build.mjs'))) ` |
| landing/server/newsletter.mjs | ` fetch(request,env){ ` |
| landing/server/newsletter.mjs | ` fetch(request) ` |
| landing/tests/cloudflare.test.mjs | ` import(${JSON.stringify(pathToFileURL(resolve(root,'scripts/cloudflare-audit.mjs')).href)}) ` |
| landing/tests/cloudflare.test.mjs | ` import(${JSON.stringify(pathToFileURL(resolve(root,'scripts/cloudflare-prepare.mjs')).href)}) ` |
| landing/tests/edge-runtime.mjs | ` fetch(origin+'/ready')).status===200 ` |
| landing/tests/edge-runtime.mjs | ` fetch(origin+'/legacy').then(r=>r.json()),{rejected:true}) ` |
| landing/tests/edge-runtime.mjs | ` fetch(origin+'/api/newsletter/subscribe',{method:'POST',headers:{Origin:'https://www.visionuniverse.de','Content-Type':'application/json','CF-Connecting-IP':ip},body: ` |
| landing/tests/edge-runtime.mjs | ` fetch(origin+'/stats').then(r=>r.json()),{attempted:2,accepted:1,unexpected:0,validBody:true}) ` |
| landing/tests/edge-runtime/fixture.mjs | ` fetch(request){ ` |
| landing/tests/edge-runtime/mock.mjs | ` fetch(request){ ` |
| macro/app.js | ` fetch(path).then(function (r) { if (!r.ok) throw new Error(path + " " + r.status) ` |
| mein-dashboard/dashboard.js | ` fetch(path, {cache: 'default', credentials: 'omit'}).then(function (r) { if (!r.ok) throw new Error('HTTP_' + r.status) ` |
| news/news.js | ` fetch(path, { cache: 'no-store' }) ` |
| portfolios/portfolios.js | ` fetch(path, { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error(String(r.status)) ` |
| portfolios/portfolios.js | ` fetch(path, { cache: "no-cache" }).then(function (r) { if (!r.ok &#124;&#124; typeof root.DecompressionStream !== "function") throw new Error("GZ") ` |
| providers/sec/adapter.js | ` require(path.join(ENGINES, "capabilities.js")) ` |
| providers/sec/adapter.js | ` require(path.join(ENGINES, "provider.js")) ` |
| providers/sec/adapter.js | ` require(path.join(ENGINES, "schema.js")) ` |
| providers/tiingo/adapter.js | ` require(path.join(engines, "provider.js")) ` |
| providers/tiingo/adapter.js | ` require(path.join(engines, "schema.js")) ` |
| providers/tiingo/adapter.js | ` require(path.join(engines, "capabilities.js")) ` |
| providers/tiingo/adapter.js | ` require(path.join(engines, "market-client.js")) ` |
| providers/twelve-data/adapter.js | ` require(path.join(ENGINES, "capabilities.js")) ` |
| providers/twelve-data/adapter.js | ` require(path.join(ENGINES, "market-client.js")) ` |
| providers/twelve-data/adapter.js | ` require(path.join(ENGINES, "provider.js")) ` |
| providers/twelve-data/adapter.js | ` require(path.join(ENGINES, "schema.js")) ` |
| quant/api/product-services.js | ` fetch(path,{credentials:'omit'}) ` |
| quant/api/technical-intelligence-workspace.js | ` fetch(path, { credentials: "omit" }).then(function (res) { ` |
| quant/app/stock-boot.js | ` fetch('/quant/data/product/stock-head-v1/'+key+'.json',{cache:'no-cache',credentials:'omit',priority:'high'}).then(function(r){if(!r.ok)throw Error('HEAD_UNAVAILABLE' ` |
| quant/app/view-model.js | ` require() - die Tests pruefen jede Aussage gegen echte ` |
| quant/engines/fx/bootstrap.js | ` fetch(url, { credentials: "same-origin" }).then(function (res) { ` |
| quant/engines/instrument-directory.js | ` fetch(path).then(function (res) { ` |
| quant/engines/multi-asset/instrument-catalog.js | ` require(path.join(__dirname, "..", "..", "config", "multi-asset-instruments.json")) ` |
| quant/engines/multi-asset/instrument-catalog.js | ` require(path.join(__dirname, "..", "..", "config", "multi-asset.json")) ` |
| quant/engines/technical/technical-analysis.js | ` require(name) : global.VUTechnical[key] ` |
| quant/engines/technical/technical-analysis.js | ` require(path) ` |
| quant/engines/technical/ti/engine.js | ` require(path) : global.VUTechnical[key] ` |
| quant/index.html | ` fetch(p,{cache:"no-cache",priority:priority&#124;&#124;"low"}) ` |
| quant/musterdepots/depots.js | ` fetch(DATA, { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error(r.status) ` |
| quant/tests/analysis-lag.test.mjs | ` require() AUSGEFUEHRT statt als Quelltextausschnitt gelesen ` |
| quant/tests/analysis-lag.test.mjs | ` require(join(root, "quant/api/product-services.js")) ` |
| quant/tests/analysis-lag.test.mjs | ` require(join(root, "quant/engines/display-policy.js")) ` |
| quant/tests/analysis-lag.test.mjs | ` require(join(root, "quant/engines/query.js")) ` |
| quant/tests/analysis-lag.test.mjs | ` require(join(root, "quant/engines/realtime/freshness.js")) ` |
| quant/tests/analysis-lag.test.mjs | ` require(join(root, "quant/config/market-calendar.json")) ` |
| quant/tests/analysis-lag.test.mjs | ` require(join(root, "quant/app/view-model.js")) ` |
| quant/tests/assignment-change.test.mjs | ` require() ausgefuehrt) und die Flaechen in quant/app/*.js. Sie schlagen ` |
| quant/tests/assignment-change.test.mjs | ` require(join(root, "quant/engines/strategy-match.js")) ` |
| quant/tests/assignment-change.test.mjs | ` require(join(root, "quant/engines/rule-contract.js")) ` |
| quant/tests/assignment-change.test.mjs | ` require(join(root, "quant/api/alert-rule-contract.js")) ` |
| quant/tests/assignment-change.test.mjs | ` require(join(root, "quant/engines/query.js")) ` |
| quant/tests/assignment-change.test.mjs | ` require(join(root, "quant/api/product-services.js")) ` |
| quant/tests/assignment-change.test.mjs | ` require(join(root, "quant/engines/display-policy.js")) ` |
| quant/tests/assignment-change.test.mjs | ` require(join(root, "quant/engines/query.js")) ` |
| quant/tests/assignment-change.test.mjs | ` require(join(root, "quant/app/view-model.js")) ` |
| quant/tests/backtest-demo-freshness.test.mjs | ` require(SCRIPT) ` |
| quant/tests/classify-rejections-cli.test.mjs | ` require(join(root, "quant", "engines", "market-store.js")) ` |
| quant/tests/company-name-coverage.test.mjs | ` require(join(ROOT, "quant/engines/instrument-classification.js")) ` |
| quant/tests/company-name-coverage.test.mjs | ` require(join(ROOT, "quant/api/product-services.js")) ` |
| quant/tests/company-name-coverage.test.mjs | ` require(join(ROOT, "quant/engines/display-policy.js")) ` |
| quant/tests/company-name-coverage.test.mjs | ` require(join(ROOT, "quant/engines/query.js")) ` |
| quant/tests/coverage-metrics.test.mjs | ` require(join(root, "quant", "engines", "coverage-metrics.js")) ` |
| quant/tests/currency-fx-matrix.test.mjs | ` require(join(FX, "fx-rates.js")) ` |
| quant/tests/currency-fx-matrix.test.mjs | ` require(join(FX, "fx-freshness.js")) ` |
| quant/tests/currency-fx-matrix.test.mjs | ` require(join(FX, "currency-registry.js")) ` |
| quant/tests/currency-fx-matrix.test.mjs | ` require(join(FX, "currency-class.js")) ` |
| quant/tests/currency-fx-matrix.test.mjs | ` require(join(FX, "currency-engine.js")) ` |
| quant/tests/currency-fx-matrix.test.mjs | ` require(join(FX, "money-format.js")) ` |
| quant/tests/currency-fx-matrix.test.mjs | ` require(join(FX, "currency-preference.js")) ` |
| quant/tests/currency-fx-matrix.test.mjs | ` require(join(FX, "currency-contract.js")) ` |
| quant/tests/currency-fx-matrix.test.mjs | ` require(join(FX, "fx-capability.js")) ` |
| quant/tests/currency-fx-matrix.test.mjs | ` require(join(FX, "fx-realtime-state.js")) ` |
| quant/tests/currency-fx-matrix.test.mjs | ` require(join(FX, "fx-provider-registry.js")) ` |
| quant/tests/daily-lifecycle-health.test.mjs | ` require(join(root, "quant", "engines", "daily-lifecycle-health.js")) ` |
| quant/tests/debt-instrument-classification.test.mjs | ` require(join(root, "quant", "engines", "us-security-master.js")) ` |
| quant/tests/debt-instrument-classification.test.mjs | ` require(join(root, "quant", "engines", "company-master.js")) ` |
| quant/tests/delivery-watchdog.test.mjs | ` require(join(root, "quant", "engines", "realtime", "delivery-watchdog.js")) ` |
| quant/tests/elliott-home.test.mjs | ` require(join(ROOT, "elliott/engine/home-model.js")) ` |
| quant/tests/elliott-home.test.mjs | ` import(new URL("../../scripts/technical/elliott-home/home.mjs", import.meta.url)) ` |
| quant/tests/elliott-home.test.mjs | ` fetch("/quant/index.html"') < html.indexOf('l.href="/quant/data/technical-intelligence/v3/elliott-home.json"'), "Stack-Vorladen nur im Deep-Link-Zweig") ` |
| quant/tests/elliott-home.test.mjs | ` import(new URL("../../scripts/vu2/build-release.mjs", import.meta.url)) ` |
| quant/tests/elliott-registry-product-view.test.mjs | ` import(join(ROOT, "scripts/technical/elliott-registry/register.mjs")) ` |
| quant/tests/elliott-registry-product-view.test.mjs | ` import(join(ROOT, "scripts/technical/elliott-registry/product-view.mjs")) ` |
| quant/tests/elliott-registry-product-view.test.mjs | ` import(join(ROOT, "scripts/technical/elliott-registry/verify.mjs")) ` |
| quant/tests/elliott-registry-product-view.test.mjs | ` import(join(ROOT, "scripts/technical/elliott-registry/ledger.mjs")) ` |
| quant/tests/elliott-registry-product-view.test.mjs | ` import(join(ROOT, "scripts/technical/lib/ti-data.mjs")) ` |
| quant/tests/elliott-registry-product-view.test.mjs | ` import(join(ROOT, "scripts/technical/lib/ti-product.mjs")) ` |
| quant/tests/elliott-registry-product-view.test.mjs | ` import(join(ROOT, "scripts/technical/build-technical-intelligence.mjs")) ` |
| quant/tests/elliott-registry-product-view.test.mjs | ` import(join(ROOT, "scripts/technical/lib/ti-projection.mjs"))).PROJECTION_VERSION ` |
| quant/tests/elliott-registry.test.mjs | ` import(join(ROOT, "scripts/technical/elliott-setups/setup-library.mjs")) ` |
| quant/tests/elliott-registry.test.mjs | ` import(join(ROOT, "scripts/technical/elliott-registry/ledger.mjs")) ` |
| quant/tests/elliott-registry.test.mjs | ` import(join(ROOT, "scripts/technical/elliott-registry/register.mjs")) ` |
| quant/tests/elliott-registry.test.mjs | ` import(join(ROOT, "scripts/technical/elliott-registry/verify.mjs")) ` |
| quant/tests/elliott-registry.test.mjs | ` import(join(ROOT, "scripts/technical/elliott-registry/evaluate-registry.mjs")) ` |
| quant/tests/elliott-registry.test.mjs | ` import(join(ROOT, "scripts/technical/elliott-registry/product-view.mjs")) ` |
| quant/tests/elliott-registry.test.mjs | ` import(join(ROOT, "scripts/technical/lib/ti-data.mjs")) ` |
| quant/tests/elliott-registry.test.mjs | ` import(join(ROOT, "scripts/technical/hsab/lib/replay-core.mjs")) ` |
| quant/tests/elliott-registry.test.mjs | ` require(join(ROOT, "quant/engines/technical/elliott/elliott-v3.js")) ` |
| quant/tests/factor-product-projection.test.mjs | ` require(join(ROOT, "quant/api/product-services.js")) ` |
| quant/tests/factor-product-projection.test.mjs | ` require(join(ROOT, "quant/engines/display-policy.js")) ` |
| quant/tests/factor-product-projection.test.mjs | ` require(join(ROOT, "quant/engines/query.js")) ` |
| quant/tests/factor-product-projection.test.mjs | ` require(join(ROOT, "quant/engines/factor-product-projection.js")) ` |
| quant/tests/factor-product-projection.test.mjs | ` require(join(ROOT, "quant/engines/company-master.js")) ` |
| quant/tests/frontend-transformation.test.mjs | ` require(). Die Engine-Tests (2) ` |
| quant/tests/frontend-transformation.test.mjs | ` require(join(ROOT, "quant/engines/historical-cases.js")) ` |
| quant/tests/frontend-transformation.test.mjs | ` require(join(ROOT, "quant/engines/pattern-research.js")) ` |
| quant/tests/frontend-transformation.test.mjs | ` require(join(ROOT, "quant/app/view-model.js")) ` |
| quant/tests/frontend-transformation.test.mjs | ` require(join(ROOT, "quant/api/product-services.js")) ` |
| quant/tests/frontend-transformation.test.mjs | ` require(join(ROOT, "quant/engines/display-policy.js")), queryEngine: require(join(ROOT, "quant/engines/query.js")) ` |
| quant/tests/frontend-transformation.test.mjs | ` require(join(ROOT, "quant/api/screener-workspace.js")) ` |
| quant/tests/fx-bootstrap-preload.test.mjs | ` fetch(url) { calls.push(url) ` |
| quant/tests/helpers/weekly-portfolio-fixtures.mjs | ` require(root + '/quant/engines/research-weekly-loader.cjs'), B = require(root + '/quant/engines/weekly-benchmark.cjs'), C = require(root + '/quant/engines/research-cont ` |
| quant/tests/history-store.test.mjs | ` require(join(root, "quant", "engines", "bar-codec.js")) ` |
| quant/tests/history-store.test.mjs | ` require(join(root, "quant", "engines", "history-store.js")) ` |
| quant/tests/history-store.test.mjs | ` require(join(root, "quant", "engines", "zero-cost-guard.js")) ` |
| quant/tests/history-store.test.mjs | ` import(join(root, "scripts", "market", "storage", "fs-driver.mjs")) ` |
| quant/tests/history-store.test.mjs | ` import(join(root, "scripts", "market", "storage", "s3-driver.mjs")) ` |
| quant/tests/intelligence-brief.test.mjs | ` require(join(ROOT, "quant/engines/intelligence-brief.js")) ` |
| quant/tests/intelligence-brief.test.mjs | ` require(join(ROOT, "quant/engines/factor-evidence.js")) ` |
| quant/tests/intelligence-brief.test.mjs | ` require(join(ROOT, "quant/engines/change-engine.js")) ` |
| quant/tests/intelligence-brief.test.mjs | ` require(join(ROOT, "quant/api/product-services.js")) ` |
| quant/tests/intelligence-brief.test.mjs | ` require(join(ROOT, "quant/engines/display-policy.js")) ` |
| quant/tests/intelligence-brief.test.mjs | ` require(join(ROOT, "quant/engines/query.js")) ` |
| quant/tests/internal-links.test.mjs | ` import(new URL("../../scripts/vu2/build-release.mjs", import.meta.url)) ` |
| quant/tests/intraday-delivery-contract.test.mjs | ` require(join(root, "quant", "engines", "realtime", "intraday-snapshot.js")) ` |
| quant/tests/intraday-delivery-contract.test.mjs | ` require(join(root, "providers", "tiingo", "adapter.js")) ` |
| quant/tests/intraday-scope.test.mjs | ` require(join(root, "quant", "engines", "realtime", "intraday-scope.js")) ` |
| quant/tests/journey-shape.test.mjs | ` require(join(ROOT, "quant/engines/journey-shape.js")) ` |
| quant/tests/journey-shape.test.mjs | ` require(join(ROOT, "quant/api/product-services.js")) ` |
| quant/tests/journey-shape.test.mjs | ` require(join(ROOT, "quant/engines/display-policy.js")) ` |
| quant/tests/journey-shape.test.mjs | ` require(join(ROOT, "quant/engines/query.js")) ` |
| quant/tests/last-price-from-series.test.mjs | ` require(join(ROOT, "quant/api/product-services.js")) ` |
| quant/tests/last-price-from-series.test.mjs | ` require(join(ROOT, "quant/engines/display-policy.js")) ` |
| quant/tests/last-price-from-series.test.mjs | ` require(join(ROOT, "quant/engines/query.js")) ` |
| quant/tests/launch-gates.test.mjs | ` require(join(ROOT, "quant/api/product-services.js")) ` |
| quant/tests/launch-gates.test.mjs | ` require(join(ROOT, "quant/engines/display-policy.js")) ` |
| quant/tests/launch-gates.test.mjs | ` require(join(ROOT, "quant/engines/query.js")) ` |
| quant/tests/launch-gates.test.mjs | ` require(join(ROOT, "quant/engines/instrument-classification.js")) ` |
| quant/tests/launch-gates.test.mjs | ` require(join(ROOT, "quant/engines/company-master.js")) ` |
| quant/tests/listing-continuity.test.mjs | ` require(join(ROOT, "quant/engines/survivorship-control.js")) ` |
| quant/tests/live-candle.test.mjs | ` require(join(engines, "realtime", "transport.js")) ` |
| quant/tests/live-candle.test.mjs | ` require(join(engines, "realtime", "bar-merge.js")) ` |
| quant/tests/live-candle.test.mjs | ` require(join(root, "providers", "tiingo", "realtime.js")) ` |
| quant/tests/market-scale.test.mjs | ` require(join(engines, "instrument-classification.js")) ` |
| quant/tests/market-scale.test.mjs | ` require(join(engines, "market-factors.js")) ` |
| quant/tests/market-scale.test.mjs | ` require(join(engines, "market-quality.js")) ` |
| quant/tests/market-scale.test.mjs | ` require(join(engines, "realtime", "subscription-tiers.js")) ` |
| quant/tests/market-scale.test.mjs | ` require(join(engines, "technical", "feature-store.js")) ` |
| quant/tests/market-scale.test.mjs | ` require(join(engines, "technical", "momentum-engine.js")) ` |
| quant/tests/market-scale.test.mjs | ` require(join(engines, "chart-ranges.js")) ` |
| quant/tests/market-scale.test.mjs | ` require(join(root, "providers", "tiingo", "adapter.js")) ` |
| quant/tests/market-scale.test.mjs | ` require(join(engines, "market-client.js")) ` |
| quant/tests/market-scale.test.mjs | ` require(join(engines, "market-client.js")) ` |
| quant/tests/market-scale.test.mjs | ` require(join(engines, "market-client.js")) ` |
| quant/tests/naming-contract.test.mjs | ` require(), die Seite in einem DOM-Doppel mit den echten Dateien. ` |
| quant/tests/naming-contract.test.mjs | ` require(join(ROOT, "quant/engines/company-naming-contract.js")) ` |
| quant/tests/naming-contract.test.mjs | ` require(join(ROOT, "quant/api/product-services.js")) ` |
| quant/tests/naming-contract.test.mjs | ` require(join(ROOT, "quant/engines/display-policy.js")) ` |
| quant/tests/naming-contract.test.mjs | ` require(join(ROOT, "quant/engines/query.js")) ` |
| quant/tests/naming-contract.test.mjs | ` require(join(ROOT, "quant/app/view-model.js")) ` |
| quant/tests/no-mock-in-product.test.mjs | ` import(new URL("../../scripts/vu2/build-release.mjs", import.meta.url)) ` |
| quant/tests/ownership-signals.test.mjs | ` require(join(root, "quant/engines/ownership-signals.js")) ` |
| quant/tests/pacemaker.test.mjs | ` require(join(root, "quant", "engines", "realtime", "pacemaker.js")) ` |
| quant/tests/pattern-unavailability.test.mjs | ` require() geprueft. Die ` |
| quant/tests/pattern-unavailability.test.mjs | ` require(join(root, "quant/api/product-services.js")) ` |
| quant/tests/pattern-unavailability.test.mjs | ` require(join(root, "quant/engines/display-policy.js")) ` |
| quant/tests/pattern-unavailability.test.mjs | ` require(join(root, "quant/engines/query.js")) ` |
| quant/tests/pattern-unavailability.test.mjs | ` require(join(root, "quant/app/view-model.js")) ` |
| quant/tests/persist-fundamentals.test.mjs | ` import(join(root, "scripts", "quant", "sec", "persist-fundamentals.mjs")) ` |
| quant/tests/persist-fundamentals.test.mjs | ` import(join(root, "scripts", "market", "storage", "fs-driver.mjs")) ` |
| quant/tests/pipeline-freshness-contract.test.mjs | ` import(join(ROOT, "scripts/quant/measure-pipeline-freshness.mjs")) ` |
| quant/tests/plain-verdict.test.mjs | ` require(join(ROOT, "quant/engines/factor-evidence.js")) ` |
| quant/tests/plain-verdict.test.mjs | ` require(join(ROOT, "quant/engines/plain-verdict.js")) ` |
| quant/tests/portfolio-standard.test.mjs | ` require(ROOT + '/quant/engines/portfolio-risk.cjs') ` |
| quant/tests/portfolio-standard.test.mjs | ` require(ROOT + '/quant/engines/portfolio-construction.cjs') ` |
| quant/tests/portfolio-standard.test.mjs | ` require(ROOT + '/quant/engines/portfolio-pit-factors.cjs') ` |
| quant/tests/portfolio-standard.test.mjs | ` require(ROOT + '/quant/engines/portfolio-backtest.cjs') ` |
| quant/tests/portfolio-standard.test.mjs | ` require(ROOT + '/scripts/quant/portfolio/model-portfolios.cjs') ` |
| quant/tests/portfolio-standard.test.mjs | ` require(ROOT + '/scripts/quant/portfolio/export-public-model-portfolios.cjs') ` |
| quant/tests/published-close.test.mjs | ` require(join(ROOT, "quant/engines/published-close.js")) ` |
| quant/tests/rejection-lifecycle.test.mjs | ` require(join(root, "quant", "engines", "rejection-lifecycle.js")) ` |
| quant/tests/research-v8-classification.test.mjs | ` require(${JSON.stringify(join(f.source,'scripts/quant/materialize-real-backtest-read.cjs'))}) ` |
| quant/tests/screener-hit-row.test.mjs | ` require(join(ROOT, "quant/engines/factor-evidence.js")) ` |
| quant/tests/screener-hit-row.test.mjs | ` require(join(ROOT, "quant/engines/plain-verdict.js")) ` |
| quant/tests/screener-hit-row.test.mjs | ` require(join(ROOT, "quant/app/view-model.js")) ` |
| quant/tests/screener-surface.test.mjs | ` require(join(ROOT, "quant/api/product-services.js")) ` |
| quant/tests/screener-surface.test.mjs | ` require(join(ROOT, "quant/engines/display-policy.js")) ` |
| quant/tests/screener-surface.test.mjs | ` require(join(ROOT, "quant/engines/query.js")) ` |
| quant/tests/screener-surface.test.mjs | ` require(join(ROOT, "quant/api/screener-workspace.js")) ` |
| quant/tests/screener-surface.test.mjs | ` require(join(ROOT, "quant/app/view-model.js")) ` |
| quant/tests/screener-surface.test.mjs | ` require(join(ROOT, "quant/engines/quant-methodology-contract.js")) ` |
| quant/tests/sec-panel-published-close.test.mjs | ` require(join(ROOT, "quant/engines/published-close.js")) ` |
| quant/tests/security-master-duplicate-resolution.test.mjs | ` require(join(root, "quant", "engines", "us-security-master.js")) ` |
| quant/tests/security-master-duplicate-resolution.test.mjs | ` require(join(root, "core", "identity.js")) ` |
| quant/tests/security-master-duplicate-resolution.test.mjs | ` import(join(root, "scripts", "market", "lib", "security-master-duplicate-resolution.mjs")) ` |
| quant/tests/security-master-rename-continuation.test.mjs | ` require(join(root, "quant", "engines", "us-security-master.js")) ` |
| quant/tests/security-master-rename-continuation.test.mjs | ` require(join(root, "core", "identity.js")) ` |
| quant/tests/security-master-rename-continuation.test.mjs | ` import(join(root, "scripts", "market", "lib", "security-master-duplicate-resolution.mjs")) ` |
| quant/tests/security-master-rename-continuation.test.mjs | ` import(join(root, "scripts", "market", "build-company-names.mjs")) ` |
| quant/tests/security-master-rename-continuation.test.mjs | ` import(join(root, "scripts", "market", "build-security-master-approval-list.mjs")) ` |
| quant/tests/security-type-safety.test.mjs | ` require(join(ROOT, "quant/engines/instrument-classification.js")) ` |
| quant/tests/security-type-safety.test.mjs | ` require(join(ROOT, "quant/engines/company-master.js")) ` |
| quant/tests/security-type-safety.test.mjs | ` require(join(ROOT, "quant/engines/factor-evidence.js")) ` |
| quant/tests/security-type-safety.test.mjs | ` require(join(ROOT, "quant/engines/journey-shape.js")) ` |
| quant/tests/security-type-safety.test.mjs | ` require(join(ROOT, "quant/engines/intelligence-brief.js")) ` |
| quant/tests/security-type-safety.test.mjs | ` require(join(ROOT, "quant/api/product-services.js")) ` |
| quant/tests/security-type-safety.test.mjs | ` require(join(ROOT, "quant/engines/display-policy.js")) ` |
| quant/tests/security-type-safety.test.mjs | ` require(join(ROOT, "quant/engines/query.js")) ` |
| quant/tests/source-state.test.mjs | ` require(join(root, "quant", "engines", "realtime", "source-state.js")) ` |
| quant/tests/stock-page-payload.test.mjs | ` require(join(ROOT, "quant/api/product-services.js")) ` |
| quant/tests/stock-page-payload.test.mjs | ` require(join(ROOT, "quant/engines/display-policy.js")) ` |
| quant/tests/stock-page-payload.test.mjs | ` require(join(ROOT, "quant/engines/query.js")) ` |
| quant/tests/stock-page-payload.test.mjs | ` require(join(ROOT, "quant/engines/company-master.js")) ` |
| quant/tests/stock-page-payload.test.mjs | ` require(join(ROOT, "core/identity.js")) ` |
| quant/tests/stock-page-shards.test.mjs | ` require(join(ROOT, "quant/api/product-services.js")) ` |
| quant/tests/stock-page-shards.test.mjs | ` require(join(ROOT, "quant/engines/display-policy.js")) ` |
| quant/tests/stock-page-shards.test.mjs | ` require(join(ROOT, "quant/engines/query.js")) ` |
| quant/tests/stock-page-shards.test.mjs | ` require(join(ROOT, "quant/engines/company-master.js")) ` |
| quant/tests/stock-page-shards.test.mjs | ` require(join(ROOT, "core/identity.js")) ` |
| quant/tests/technical-ap8-l1.test.mjs | ` require(join(root, "quant/engines/technical/screen-row.js")) ` |
| quant/tests/technical-ap8-l1.test.mjs | ` require(join(root, "quant/engines/technical/technical-query.js")) ` |
| quant/tests/technical-ap8-l1.test.mjs | ` require(join(root, "quant/engines/technical/query-text.js")) ` |
| quant/tests/technical-ap8-l1.test.mjs | ` require(join(root, "quant/engines/technical/indicators.js")) ` |
| quant/tests/technical-ap8-l2.test.mjs | ` require(join(root, "quant/engines/technical/screen-row.js")) ` |
| quant/tests/technical-ap8-l2.test.mjs | ` require(join(root, "quant/engines/technical/technical-query.js")) ` |
| quant/tests/technical-ap8-l2.test.mjs | ` require(join(root, "quant/engines/technical/query-text.js")) ` |
| quant/tests/technical-ap8-l2.test.mjs | ` require(join(root, "quant/engines/technical/indicators.js")) ` |
| quant/tests/technical-ap8-l3.test.mjs | ` require(join(root, "quant/engines/technical/screen-row.js")) ` |
| quant/tests/technical-ap8-l3.test.mjs | ` require(join(root, "quant/engines/technical/technical-query.js")) ` |
| quant/tests/technical-ap8-l3.test.mjs | ` require(join(root, "quant/engines/technical/query-text.js")) ` |
| quant/tests/technical-ap8-l4.test.mjs | ` require(join(root, "quant/engines/technical/screen-row.js")) ` |
| quant/tests/technical-ap8-l4.test.mjs | ` require(join(root, "quant/engines/technical/technical-query.js")) ` |
| quant/tests/technical-ap8-l4.test.mjs | ` require(join(root, "quant/engines/technical/query-text.js")) ` |
| quant/tests/technical-ap8-l5.test.mjs | ` require(join(root, "quant/engines/technical/technical-query.js")) ` |
| quant/tests/technical-ap8-l5.test.mjs | ` require(join(root, "quant/engines/technical/query-text.js")) ` |
| quant/tests/technical-unavailability.test.mjs | ` require() geprueft. ` |
| quant/tests/ti-data-freshness.test.mjs | ` require(join(ROOT, "ask/engine.js")) ` |
| quant/tests/ti-mission4.test.mjs | ` require(join(ROOT, "quant/engines/technical/ti/context.js")) ` |
| quant/tests/ti-mission4.test.mjs | ` require(join(ROOT, "quant/engines/technical/elliott/elliott-v3.js")) ` |
| quant/tests/ti-mission4.test.mjs | ` require(join(ROOT, "quant/engines/technical/ti/alerts.js")) ` |
| quant/tests/ti-mission4.test.mjs | ` import(join(ROOT, "scripts/technical/lib/ti-data.mjs")) ` |
| quant/tests/ti-mission4.test.mjs | ` import(join(ROOT, "quant/tests/elliott-corpus.mjs")) ` |
| quant/tests/ti-mission4.test.mjs | ` require(join(ROOT, "quant/engines/technical/canonical-bars.js")) ` |
| quant/tests/ti-mission4.test.mjs | ` require(join(ROOT, "quant/engines/technical/canonical-bars.js")) ` |
| quant/tests/ti-mission4.test.mjs | ` import(join(ROOT, "scripts/technical/lib/ti-product.mjs")) ` |
| quant/tests/ti-mission4.test.mjs | ` import(join(ROOT, "scripts/technical/lib/ti-product.mjs")) ` |
| quant/tests/universe-list.test.mjs | ` require(join(ROOT, "quant/api/product-services.js")) ` |
| quant/tests/universe-list.test.mjs | ` require(join(ROOT, "quant/engines/display-policy.js")) ` |
| quant/tests/universe-list.test.mjs | ` require(join(ROOT, "quant/engines/query.js")) ` |
| quant/tests/universe-list.test.mjs | ` require(join(ROOT, "quant/engines/factor-evidence.js")) ` |
| quant/tests/universe-list.test.mjs | ` fetch(", "https://", "axios", "tiingoRequest", "apiKey", "process.env.TIINGO"]) { ` |
| quant/tests/us-security-master-artefacts.test.mjs | ` require(join(root, "quant", "engines", "us-security-master.js")) ` |
| quant/tests/us-security-master.test.mjs | ` require(join(root, "quant", "engines", "us-security-master.js")) ` |
| quant/tests/us-security-master.test.mjs | ` require(join(root, "quant", "engines", "instrument-classification.js")) ` |
| quant/tests/v10-corporate-actions.test.mjs | ` require(path.join(root, 'quant/engines/research-weekly-loader.cjs')) ` |
| quant/tests/v10-corporate-actions.test.mjs | ` require(path.join(root, 'quant/engines/research-ca-evidence.cjs')) ` |
| quant/tests/v10-corporate-actions.test.mjs | ` require(path.join(root, 'quant/engines/corporate-action-evidence.js')) ` |
| quant/tests/v10-corporate-actions.test.mjs | ` require(outs[0]) ` |
| quant/tests/v10-factor.test.mjs | ` require(join(ROOT, 'scripts/quant/v10/factor/factors.cjs')) ` |
| quant/tests/v10-factor.test.mjs | ` require(join(ROOT, 'scripts/quant/v10/factor/study.cjs')) ` |
| quant/tests/v10-factor.test.mjs | ` require(join(ROOT, 'scripts/quant/v10/factor/panel.cjs')) ` |
| quant/tests/v10-factor.test.mjs | ` require(join(ROOT, 'scripts/quant/v10/factor/common.cjs')) ` |
| quant/tests/v10-factor.test.mjs | ` require(join(ROOT, 'quant/engines/research-contract.cjs')) ` |
| quant/tests/v10-factor.test.mjs | ` require(join(ROOT, 'quant/engines/fundamental-inputs.js')) ` |
| quant/tests/v10-setup.test.mjs | ` require(join(ROOT, "scripts/quant/v10/setup/setup-lib.cjs")) ` |
| quant/tests/v10-setup.test.mjs | ` require(join(ROOT, "scripts/quant/v10/setup/setup-original-inventory.cjs")) ` |
| quant/tests/v10-setup.test.mjs | ` require(join(ROOT, "scripts/quant/v10/setup/build-setup-independence-decision.cjs")) ` |
| quant/tests/v10-setup.test.mjs | ` require(join(ROOT, "quant/engines/research-validation.cjs")) ` |
| quant/tests/v10-setup.test.mjs | ` import(join(ROOT, "scripts/quant/build-setup-outcomes.mjs")) ` |
| quant/tests/v12-indexpop.test.mjs | ` require(path.join(ROOT, 'scripts/quant/v12/indexpop/lib.cjs')) ` |
| quant/tests/v12-largecap.test.mjs | ` require(ie) ` |
| quant/tests/v12-listref.test.mjs | ` require(path.join(ROOT, 'scripts/quant/v12/listref/reflib.cjs')) ` |
| quant/tests/v12-listref.test.mjs | ` require(path.join(ROOT, 'scripts/quant/v12/listref/build_reference.cjs')) ` |
| quant/tests/v12-listref.test.mjs | ` require(path.join(ROOT, 'quant/engines/research-listing-reference.cjs')) ` |
| quant/tests/v12-requal.test.mjs | ` require(path.join(ROOT, 'scripts/quant/v12/requal/lib.cjs')) ` |
| quant/tests/v12-requal.test.mjs | ` require(path.join(ROOT, 'scripts/quant/v12/requal/p6-strategies.cjs')) ` |
| quant/tests/v12-requal.test.mjs | ` require(path.join(ROOT, 'scripts/quant/v12/requal/p5c-factor.cjs')) ` |
| quant/tests/v12-requal.test.mjs | ` require(path.join(ROOT, 'scripts/quant/v12/requal/plan.cjs')) ` |
| quant/tests/v12-spxpop.test.mjs | ` require(path.join(ROOT, 'quant/engines/research-index-population.cjs')) ` |
| quant/tests/v13-studies.test.mjs | ` require(ROOT + '/scripts/quant/v13/studies/lib.cjs') ` |
| quant/tests/v13-studies.test.mjs | ` require(ROOT + '/scripts/quant/v13/studies/run-s3.cjs') ` |
| quant/tests/v13-studies.test.mjs | ` require(ROOT + '/quant/engines/research-delisted-series.cjs') ` |
| quant/tests/v13b-f1w.test.mjs | ` require(ROOT + '/scripts/quant/v13b/f1w/lib.cjs') ` |
| quant/tests/v13b-f1w.test.mjs | ` require(ROOT + '/quant/engines/research-delisted-series.cjs') ` |
| quant/tests/v13c-study.test.mjs | ` require(ROOT + '/scripts/quant/v13c/lib.cjs') ` |
| quant/tests/v13c-study.test.mjs | ` require(ROOT + '/scripts/quant/v13c/run-s3.cjs') ` |
| quant/tests/valuation-consistency.test.mjs | ` require() geprueft), der Kennzahlenkasten ist der Abschnitt ` |
| quant/tests/valuation-consistency.test.mjs | ` require(join(ROOT, "quant/api/product-services.js")) ` |
| quant/tests/valuation-consistency.test.mjs | ` require(join(ROOT, "quant/engines/display-policy.js")) ` |
| quant/tests/valuation-consistency.test.mjs | ` require(join(ROOT, "quant/engines/query.js")) ` |
| quant/tests/valuation-consistency.test.mjs | ` require(join(ROOT, "quant/engines/fundamental-inputs.js")) ` |
| quant/tests/valuation-consistency.test.mjs | ` require(join(ROOT, "quant/app/view-model.js")) ` |
| quant/tests/zero-cost-guard.test.mjs | ` require(join(root, "quant", "engines", "zero-cost-guard.js")) ` |
| quant/tests/zero-cost-guard.test.mjs | ` import(join(root, "scripts", "market", "storage", "s3-driver.mjs")) ` |
| quant/ui/release-guard.js | ` fetch(ID_URL + '?t=' + now(), { cache: 'no-store', credentials: 'omit' }) ` |
| quant/ui/shell.js | ` fetch(path, { cache: "no-cache" }) ` |
| quant/ui/shell.js | ` fetch(path, { cache: "no-cache" }).then(function (res) { ` |
| screener/engine/adapters.js | ` fetch(url, Object.assign({ cache: 'default' }, opts &#124;&#124; {})).then(function (r) { ` |
| scripts/access-gate/browser-qa.mjs | ` require(process.env.PLAYWRIGHT_PATH &#124;&#124; 'playwright') ` |
| scripts/access-gate/runtime.js | ` fetch(loader.getAttribute('data-content')) ` |
| scripts/account/browser-qa.mjs | ` require(process.env.PLAYWRIGHT_PATH &#124;&#124; 'playwright') ` |
| scripts/account/check-auto-env.mjs | `` fetch(`https://api.github.com/repos/${REPO}/environments/account-auto${p}`, `` |
| scripts/account/journey-qa.mjs | ` require(process.env.PLAYWRIGHT_PATH &#124;&#124; 'playwright') ` |
| scripts/account/journey-qa.mjs | ` fetch(base + '/v1/plans')).json()).newsletter) ` |
| scripts/account/journey-qa.mjs | ` fetch(b + '/v1/me', {credentials: 'include', headers: {'X-VU-Client': 'web'}})).json(), base) ` |
| scripts/account/journey-qa.mjs | ` fetch(b + '/v1/session', {credentials: 'include', headers: {'X-VU-Client': 'web'}})).json(), base) ` |
| scripts/account/journey-qa.mjs | `` fetch(`${base}/__dev/tester?email=${encodeURIComponent(email)}`, {method: 'POST'}) `` |
| scripts/account/journey-qa.mjs | `` fetch(`${base}/__dev/tester?email=${encodeURIComponent(email)}`, {method: 'POST'}) `` |
| scripts/account/journey-qa.mjs | `` fetch(`${base}/__dev/sepa/latest/paid`, {method: 'POST'}) `` |
| scripts/account/journey-qa.mjs | `` fetch(`${base}/__dev/cron`, {method: 'POST'}) `` |
| scripts/account/journey-qa.mjs | `` fetch(`${base}/__dev/brevo/confirm?email=${encodeURIComponent(email)}`, {method: 'POST'}) `` |
| scripts/account/journey-qa.mjs | `` fetch(`${base}/__dev/cron`, {method: 'POST'}) `` |
| scripts/account/quant-watch-coupling-qa.mjs | ` fetch('/quant/data/universe/instruments/' + globalThis.VUCore.Identity.shardKey('MSFT') + '.json')).json()).instruments.find(i => i.symbol === 'MSFT' && i.active).ins ` |
| scripts/account/release-guard.mjs | ` fetch(api + p, {signal: AbortSignal.timeout(20000)}) ` |
| scripts/account/watchlist-qa.mjs | ` require(process.env.PLAYWRIGHT_PATH &#124;&#124; 'playwright') ` |
| scripts/analysts/fetch-consensus.mjs | ` require(join(ROOT, "core", "identity.js")) ` |
| scripts/analysts/fetch-consensus.mjs | ` fetch(url, { headers, signal: AbortSignal.timeout(30000) }) ` |
| scripts/analysts/probe-consensus.mjs | ` fetch(url, { headers, signal: AbortSignal.timeout(30000) }) ` |
| scripts/ci/pipeline-alarm.mjs | ` fetch(base + pfad, { ` |
| scripts/ci/push-with-retry.sh | ` fetch                  (Standard 3) ` |
| scripts/ci/supertrader-chain.mjs | ` fetch(base + "/repos/" + repo + path, Object.assign({}, init, { headers, signal: AbortSignal.timeout(20000) })) ` |
| scripts/company_intelligence/browser-qa.mjs | ` fetch() ` |
| scripts/company_intelligence/browser-qa.mjs | ` fetch(), body=await response.json() ` |
| scripts/company_intelligence/browser-qa.mjs | ` fetch(),body=await response.json() ` |
| scripts/company_intelligence/browser-qa.mjs | ` fetch(),body=await response.json() ` |
| scripts/company_intelligence/browser-qa.mjs | ` fetch(),body=await response.json(),past=new Date(Date.now()-3600000).toISOString() ` |
| scripts/company_intelligence/browser-qa.mjs | ` fetch(),body=await response.json() ` |
| scripts/company_intelligence/browser-qa.mjs | ` fetch(),body=await response.json() ` |
| scripts/company_intelligence/browser-qa.mjs | ` fetch(),body=await response.json() ` |
| scripts/company_intelligence/discover-beta-qa.mjs | ` fetch(),body=await response.json() ` |
| scripts/company_intelligence/discover-beta-qa.mjs | ` fetch(),body=await response.json() ` |
| scripts/company_intelligence/numeric-band-review.mjs | ` fetch(url,init),limits:{requestsPerMinute:3,requestsPerHour:3,requestsPerDay:3,maxRetries:0,concurrency:1}}) ` |
| scripts/company_intelligence/numeric-band-review.mjs | ` fetch(sourceUrl,{headers:{'User-Agent':'VisionUniverseResearch info@visionuniverse.de'},signal:AbortSignal.timeout(30000)}) ` |
| scripts/company_intelligence/propagation-proof.mjs | ` fetch(url, {cache: 'no-store', headers: {'cache-control': 'no-cache', pragma: 'no-cache'}, signal: AbortSignal.timeout(timeout)}) ` |
| scripts/company_intelligence/refresh-qa.mjs | ` fetch(origin+'/release-delivery.json?refresh='+Date.now())).json() ` |
| scripts/company_intelligence/refresh-qa.mjs | ` fetch(origin+'/company-intelligence/data/'+path+'?refresh='+Date.now())).arrayBuffer()):readFileSync(join(directory,path)) ` |
| scripts/company_intelligence/refresh-qa.mjs | ` fetch() ` |
| scripts/company_intelligence/runtime-candidate.mjs | ` fetch(origin+p+'?refresh-proof='+Date.now(),{signal:AbortSignal.timeout(30000)}) ` |
| scripts/company_intelligence/scheduler-gate.mjs | ` fetch(base+path,{signal:AbortSignal.timeout(15000),headers:{accept:'application/vnd.github+json','x-github-api-version':'2022-11-28',...(token?{authorization:'Bearer  ` |
| scripts/company_intelligence/tests/legacy-restore.test.mjs | ` import(pathToFileURL(file).href+'?m='+Math.random()) ` |
| scripts/company_intelligence/tests/refreeze-auto.test.mjs | ` import(pathToFileURL(file).href) ` |
| scripts/company_intelligence/tests/refresh-dispatch-wait.test.mjs | ` import('data:text/javascript ` |
| scripts/company_intelligence/tests/refresh-watchdog.test.mjs | ` import(pathToFileURL(modulePath).href) ` |
| scripts/company_intelligence/tests/refresh-watchdog.test.mjs | ` import(pathToFileURL(join(repoRoot,'scripts/company_intelligence/scheduler-gate.mjs')).href) ` |
| scripts/company_intelligence/tests/rollback-cas.test.mjs | ` import('data:text/javascript ` |
| scripts/company_intelligence/tests/rollback-cas.test.mjs | ` import('data:text/javascript ` |
| scripts/company_intelligence/tests/scheduler-gate.test.mjs | ` import(gateUrl) ` |
| scripts/company_intelligence/tests/test_wordpress_news.py | ` fetch(h,s) ` |
| scripts/company_intelligence/universe-browser-qa.mjs | ` fetch(origin+'/company-intelligence-refresh.json?qa='+Date.now())).json():null ` |
| scripts/company_intelligence/universe-browser-qa.mjs | ` fetch(origin+'/release-delivery.json?qa='+Date.now())).json() ` |
| scripts/company_intelligence/universe-release.mjs | ` fetch('https://research.visionuniverse.de/company-intelligence-delivery.json?freeze='+Date.now())).json() ` |
| scripts/company_intelligence/universe-release.mjs | ` fetch('https://research.visionuniverse.de/release-delivery.json?freeze='+Date.now())).json() ` |
| scripts/company_intelligence/verify-pilot-delivery.mjs | ` fetch(base+encodeURIComponent(path)) ` |
| scripts/company_intelligence/wordpress_news.py | ` fetch(http, source): ` |
| scripts/company_intelligence/wordpress_news.py | ` fetch(http, source) ` |
| scripts/company_intelligence/wordpress_news.py | ` fetch(http, source) ` |
| scripts/core/data-quality.mjs | ` require(join(REPO_ROOT, "core", "data-quality.js")) ` |
| scripts/core/data-quality.mjs | ` require(join(REPO_ROOT, "core", "identity.js")) ` |
| scripts/core/data-quality.mjs | ` require(join(REPO_ROOT, "quant", "engines", "realtime", "trading-session.js")) ` |
| scripts/core/data-quality.mjs | ` require(join(REPO_ROOT, "core", "listing-staleness.js")) ` |
| scripts/core/data-quality.mjs | ` require(join(REPO_ROOT, "quant", "engines", "technical", "technical-query.js")) ` |
| scripts/core/data-quality.mjs | ` require(join(REPO_ROOT, "quant", "engines", "technical", "multi-timeframe.js")) ` |
| scripts/core/data-quality.mjs | ` require(join(REPO_ROOT, "quant", "engines", "technical", "screen-row.js")) ` |
| scripts/core/data-quality.mjs | ` require(join(REPO_ROOT, "quant", "engines", "technical", "screener-contract.js")) ` |
| scripts/core/data-quality.mjs | ` require(tplPath), ds = TQ.createDataset(twArt) ` |
| scripts/core/data-quality.mjs | ` require(join(REPO_ROOT, "quant", "engines", "published-close.js")) ` |
| scripts/core/diagnose.mjs | ` require(join(REPO_ROOT, "core", "diagnose.js")) ` |
| scripts/core/diagnose.mjs | ` require(join(REPO_ROOT, "core", "listing-staleness.js")) ` |
| scripts/core/diagnose.mjs | ` require(join(REPO_ROOT, "core", "client.js")) ` |
| scripts/core/lib.mjs | ` fetch(url, { headers: { "cache-control": "no-cache" } }) ` |
| scripts/core/lib.mjs | ` require(join(root, "core", "health.js")), ` |
| scripts/core/lib.mjs | ` require(join(root, "core", "identity.js")), ` |
| scripts/core/lib.mjs | ` require(join(root, "quant", "engines", "realtime", "trading-session.js")), ` |
| scripts/core/r2-audit.mjs | ` fetch("https://api.cloudflare.com/client/v4" + path, { ` |
| scripts/dashboard/update_news.mjs | ` fetch(url, options) ` |
| scripts/diagnose/adjustment-steps.mjs | ` require(join(root, "quant", "engines", "history-store.js")) ` |
| scripts/diagnose/adjustment-steps.mjs | ` require(join(root, "quant", "engines", "zero-cost-guard.js")) ` |
| scripts/diagnose/adjustment-steps.mjs | ` require(join(root, "quant", "engines", "market-quality.js")) ` |
| scripts/diagnose/adjustment-steps.mjs | ` import(join(root, "scripts", "market", "storage", "fs-driver.mjs")) ` |
| scripts/diagnose/adjustment-steps.mjs | ` import(join(root, "scripts", "market", "storage", "s3-driver.mjs")) ` |
| scripts/diagnose/coverage-delta.mjs | ` require(join(root, "quant", "engines", "history-store.js")) ` |
| scripts/diagnose/coverage-delta.mjs | ` require(join(root, "quant", "engines", "zero-cost-guard.js")) ` |
| scripts/diagnose/coverage-delta.mjs | ` import(join(root, "scripts", "market", "storage", "fs-driver.mjs"))).createFsDriver(localRoot) ` |
| scripts/diagnose/coverage-delta.mjs | ` import(join(root, "scripts", "market", "storage", "s3-driver.mjs"))).createS3DriverFromEnv() ` |
| scripts/discover/assert-source-state-coverage.mjs | ` require(join(engines, "realtime", "source-state.js")) ` |
| scripts/discover/assert-source-state-coverage.mjs | ` require(join(engines, "realtime", "market-hours.js")) ` |
| scripts/discover/assert-source-state-coverage.mjs | ` require(join(engines, "realtime", "trading-session.js")) ` |
| scripts/discover/assert-source-state-coverage.mjs | ` require(join(root, "quant", "config", "market-calendar.json")) ` |
| scripts/discover/assert-source-state-coverage.mjs | ` require(join(root, "core", "identity.js")) ` |
| scripts/discover/browser-qa-direct.mjs | ` require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES + '/playwright') ` |
| scripts/discover/browser-qa-direct.mjs | ` fetch(base + '/release-id.json') ` |
| scripts/discover/browser-qa-maerkte.mjs | ` require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright') ` |
| scripts/discover/browser-qa-realtime.mjs | ` require(join(root, "quant", "engines", "realtime", "market-hours.js")) ` |
| scripts/discover/browser-qa.mjs | ` require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright') ` |
| scripts/discover/build-company-logos.mjs | ` fetch(url, { ...opts, headers: { "User-Agent": USER_AGENT, "Api-User-Agent": USER_AGENT, ...(opts.headers &#124;&#124; {}) } }) ` |
| scripts/discover/build-company-logos.mjs | ` fetch(url, { redirect: "follow", signal: AbortSignal.timeout(15000), ` |
| scripts/discover/build-discover-data.mjs | ` import(join(root, "scripts", "market", "universe-source.mjs")) ` |
| scripts/discover/build-discover-data.mjs | ` require(join(root, "quant", "engines", "market-factors.js")) ` |
| scripts/discover/build-discover-data.mjs | ` require(join(root, "quant", "engines", "published-close.js")) ` |
| scripts/discover/build-discover-data.mjs | ` require(join(root, "quant", "engines", "return-series.js")) ` |
| scripts/discover/build-discover-data.mjs | ` require(join(root, "quant", "engines", "display-policy.js")) ` |
| scripts/discover/build-discover-data.mjs | ` require(join(root, "discover", "engines", "contract.js")) ` |
| scripts/discover/build-discover-data.mjs | ` require(join(root, "discover", "engines", "high52w.js")) ` |
| scripts/discover/build-discover-data.mjs | ` require(join(root, "discover", "engines", "scoring.js")) ` |
| scripts/discover/build-discover-data.mjs | ` require(join(root, "discover", "engines", "indicators.js")) ` |
| scripts/discover/build-discover-data.mjs | ` require(join(root, "discover", "engines", "technical-intelligence.js")) ` |
| scripts/discover/build-discover-data.mjs | ` require(join(root, "discover", "engines", "klartext.js")) ` |
| scripts/discover/build-discover-data.mjs | ` require(join(root, "discover", "engines", "unternehmen.js")) ` |
| scripts/discover/build-discover-data.mjs | ` require(join(root, "discover", "engines", "fundamentals.js")) ` |
| scripts/discover/build-discover-data.mjs | ` require(join(root, "discover", "engines", "relevance.js")) ` |
| scripts/discover/build-discover-data.mjs | ` require(join(root, "discover", "engines", "discovery-eligibility.js")) ` |
| scripts/discover/build-discover-data.mjs | ` require(join(root, "discover", "engines", "im-blick.js")) ` |
| scripts/discover/build-im-blick-live.mjs | ` require(join(root, "discover", "engines", "im-blick.js")) ` |
| scripts/discover/build-im-blick-live.mjs | ` require(join(root, "discover", "engines", "contract.js")) ` |
| scripts/discover/build-im-blick-live.mjs | ` require(join(root, "core", "identity.js")) ` |
| scripts/discover/build-im-blick-live.mjs | ` require(join(root, "discover", "engines", "refresh-plan.js")) ` |
| scripts/discover/build-im-blick-live.mjs | ` require(join(root, "quant", "engines", "realtime", "trading-session.js")) ` |
| scripts/discover/check-im-blick-live.mjs | ` require(join(ROOT, "discover", "engines", "refresh-plan.js")) ` |
| scripts/discover/check-im-blick-live.mjs | ` fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20000) }) ` |
| scripts/discover/europe-continuity-live-qa.mjs | ` require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright') ` |
| scripts/discover/europe-public-live-qa.mjs | ` import(sourceRoot+'/scripts/access-gate/build.mjs') ` |
| scripts/discover/global-live-qa.mjs | ` require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright') ` |
| scripts/discover/lazy-fault-qa.mjs | ` require((process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES &#124;&#124; '') + '/playwright') ` |
| scripts/discover/logo-candidates.mjs | ` fetch(url, { headers: { "User-Agent": ua, Accept: "application/json,text/html,image/*,*/*" }, signal: AbortSignal.timeout(20000) }) ` |
| scripts/discover/replay-im-blick.mjs | ` import(join(root, "scripts", "market", "universe-source.mjs")) ` |
| scripts/discover/replay-im-blick.mjs | ` require(join(root, "discover", "engines", "scoring.js")) ` |
| scripts/discover/replay-im-blick.mjs | ` require(join(root, "discover", "engines", "high52w.js")) ` |
| scripts/discover/replay-im-blick.mjs | ` require(join(root, "discover", "engines", "discovery-eligibility.js")) ` |
| scripts/discover/replay-im-blick.mjs | ` require(join(root, "discover", "engines", "im-blick.js")) ` |
| scripts/discover/verify-discover-data.mjs | ` require(join(root, "discover", "engines", "contract.js")) ` |
| scripts/discover/verify-discover-data.mjs | ` require(join(root, "discover", "engines", "klartext.js")) ` |
| scripts/discover/verify-discover-data.mjs | ` require(join(root, "discover", "engines", "scoring.js")) ` |
| scripts/discover/verify-discover-data.mjs | ` require(join(root, "discover", "engines", "high52w.js")) ` |
| scripts/discover/verify-discover-data.mjs | ` require(join(root, "quant", "engines", "display-policy.js")) ` |
| scripts/discover/verify-discover-data.mjs | ` require(join(root, "discover", "methodology", "discover-v1.json")) ` |
| scripts/discover/verify-discover-data.mjs | ` require(join(root, "discover", "engines", "relevance.js")) ` |
| scripts/discover/verify-discover-data.mjs | ` import(join(root, "scripts", "market", "preview-scope.mjs")) ` |
| scripts/discover/watchlist-coupling-qa.mjs | ` fetch('/quant/data/universe/instruments/' + globalThis.VUCore.Identity.shardKey('MSFT') + '.json')).json()).instruments.find(i => i.symbol === 'MSFT' && i.active).ins ` |
| scripts/market/apply-exchange-directory.mjs | ` require(join(root, "quant", "engines", "us-security-master.js")) ` |
| scripts/market/apply-exchange-directory.mjs | ` require(join(root, "quant", "engines", "company-master.js")) ` |
| scripts/market/apply-exchange-directory.mjs | ` require(join(root, "core", "identity.js")) ` |
| scripts/market/apply-exchange-directory.mjs | ` fetch("https://www.nasdaqtrader.com/dynamic/SymDir/" + name + ".txt", { signal: AbortSignal.timeout(45000) }) ` |
| scripts/market/apply-name-layer-class.mjs | ` require(join(root, "quant", "engines", "us-security-master.js")) ` |
| scripts/market/apply-name-layer-class.mjs | ` require(join(root, "quant", "engines", "company-master.js")) ` |
| scripts/market/assert-daily-lifecycle-health.mjs | ` require(join(root, "quant", "engines", "realtime", "trading-session.js")) ` |
| scripts/market/assert-daily-lifecycle-health.mjs | ` require(join(root, "quant", "engines", "daily-lifecycle-health.js")) ` |
| scripts/market/assert-intraday-delivery.mjs | ` require(join(engines, "realtime", "delivery-watchdog.js")) ` |
| scripts/market/assert-intraday-delivery.mjs | ` require(join(engines, "realtime", "trading-session.js")) ` |
| scripts/market/assert-intraday-delivery.mjs | ` require(join(root, "quant", "config", "market-calendar.json")) ` |
| scripts/market/assert-intraday-delivery.mjs | ` fetch(url, { headers: { "cache-control": "no-cache" } }) ` |
| scripts/market/attach-live-domain.mjs | ` fetch(API + pfad, Object.assign({ ` |
| scripts/market/build-company-names.mjs | ` require(join(ROOT, "core", "identity.js")) ` |
| scripts/market/build-company-names.mjs | ` import(join(ROOT, "scripts", "market", "lib", "security-master-duplicate-resolution.mjs")) ` |
| scripts/market/build-company-names.mjs | ` import(join(root, "scripts", "market", "universe-source.mjs")) ` |
| scripts/market/build-company-names.mjs | ` fetch(SEC_URL, { headers: { "User-Agent": ua, "Accept": "application/json" } }) ` |
| scripts/market/build-company-names.mjs | ` require(join(ROOT, "providers", "tiingo", "adapter.js")) ` |
| scripts/market/build-company-names.mjs | ` require(join(ROOT, "quant", "engines", "symbol-mapping.js")) ` |
| scripts/market/build-company-names.mjs | ` fetch(url, init) ` |
| scripts/market/build-coverage-metrics.mjs | ` require(join(root, "quant", "engines", "coverage-metrics.js")) ` |
| scripts/market/build-coverage-metrics.mjs | ` require(join(root, "quant", "engines", "zero-cost-guard.js")) ` |
| scripts/market/build-coverage-metrics.mjs | ` require(join(root, "quant", "engines", "history-store.js")) ` |
| scripts/market/build-coverage-metrics.mjs | ` import(join(root, "scripts", "market", "storage", "fs-driver.mjs")) ` |
| scripts/market/build-coverage-metrics.mjs | ` import(join(root, "scripts", "market", "storage", "s3-driver.mjs")) ` |
| scripts/market/build-currency-coverage.mjs | ` require(join(ROOT, "quant", "engines", "fx", "currency-registry.js")) ` |
| scripts/market/build-fx-history-ecb.mjs | ` require(join(ROOT, "providers", "ecb", "adapter.js")) ` |
| scripts/market/build-fx-history-ecb.mjs | ` require(join(ROOT, "quant", "engines", "fx", "fx-rates.js")) ` |
| scripts/market/build-fx-history-ecb.mjs | ` require(join(ROOT, "quant", "engines", "fx", "currency-registry.js")) ` |
| scripts/market/build-fx-history-ecb.mjs | ` require(join(ROOT, "quant", "engines", "fx", "fx-provider-registry.js")) ` |
| scripts/market/build-fx-history-ecb.mjs | ` fetch(FEED.url, { headers: { Accept: "application/xml" } }) ` |
| scripts/market/build-fx-history.mjs | ` require(join(ROOT, "quant", "engines", "fx", "fx-rates.js")) ` |
| scripts/market/build-fx-history.mjs | ` require(join(ROOT, "quant", "engines", "fx", "fx-provider-registry.js")) ` |
| scripts/market/build-fx-history.mjs | ` require(join(ROOT, "quant", "engines", "capabilities.js")) ` |
| scripts/market/build-fx-history.mjs | `` fetch(`${BASE}/tiingo/fx/${ticker}/prices?resampleFreq=1day&startDate=${startDate}`, `` |
| scripts/market/build-fx-pair-requirements.mjs | ` require(join(ROOT, "quant", "engines", "fx", "currency-registry.js")) ` |
| scripts/market/build-index-membership.mjs | ` require(join(root, "quant", "engines", "index-membership.js")) ` |
| scripts/market/build-index-membership.mjs | ` fetch(url, { headers, redirect: "follow" }) ` |
| scripts/market/build-market-factors.mjs | ` require(join(root, "core", "identity.js")) ` |
| scripts/market/build-market-factors.mjs | ` require(join(engines, "market-factors.js")) ` |
| scripts/market/build-market-factors.mjs | ` require(join(engines, "return-semantics.js")) ` |
| scripts/market/build-market-factors.mjs | ` require(join(engines, "market-quality.js")) ` |
| scripts/market/build-market-factors.mjs | ` require(join(engines, "market-store.js")) ` |
| scripts/market/build-market-factors.mjs | ` require(join(engines, "ranking-hygiene.js")) ` |
| scripts/market/build-market-pulse.mjs | ` require(join(root, "quant/engines/multi-asset/market-pulse.js")) ` |
| scripts/market/build-market-pulse.mjs | ` require(join(root, "core/identity.js")) ` |
| scripts/market/build-market-universe.mjs | ` require(join(root, "quant", "engines", "instrument-classification.js")) ` |
| scripts/market/build-market-universe.mjs | ` fetch(TICKERS_URL, { headers }) ` |
| scripts/market/build-ownership-signals.mjs | ` require(join(ROOT, "quant", "engines", "ownership-signals.js")) ` |
| scripts/market/build-ownership-signals.mjs | ` require(join(ROOT, "core", "identity.js")) ` |
| scripts/market/build-ownership-signals.mjs | ` import(join(root, "scripts/market/universe-source.mjs")).then(({ resolveProductUniverse }) => ` |
| scripts/market/build-us-eligibility.mjs | ` require(join(root, "quant", "engines", "us-security-master.js")) ` |
| scripts/market/build-us-eligibility.mjs | ` require(join(root, "quant", "engines", "company-master.js")) ` |
| scripts/market/build-us-eligibility.mjs | ` require(join(root, "quant", "engines", "coverage-metrics.js")).VERSION, ` |
| scripts/market/build-us-security-master.mjs | ` require(join(root, "quant", "engines", "us-security-master.js")) ` |
| scripts/market/build-us-security-master.mjs | ` import(join(root, "scripts", "market", "build-market-universe.mjs")) ` |
| scripts/market/build-us-security-master.mjs | ` import(join(root, "scripts", "market", "lib", "security-master-duplicate-resolution.mjs")) ` |
| scripts/market/build-us-security-master.mjs | ` fetch(TICKERS_URL, { headers }) ` |
| scripts/market/build-us-security-master.mjs | ` require(       join(root, "quant", "engines", "instrument-classification.js")).VERSION, ` |
| scripts/market/check-freshness.mjs | ` require(join(root, "quant", "engines", "realtime", "trading-session.js")) ` |
| scripts/market/check-freshness.mjs | ` require(join(root, "quant", "engines", "realtime", "freshness.js")) ` |
| scripts/market/check-freshness.mjs | ` require(join(DEFAULT_ROOT, "core", "identity.js")) ` |
| scripts/market/check-freshness.mjs | ` fetch(url, { headers: { "cache-control": "no-cache" } }) ` |
| scripts/market/classify-rejections.mjs | ` require(join(root, "quant", "engines", "rejection-lifecycle.js")) ` |
| scripts/market/evaluate-provider.mjs | ` require(join(root, "quant", "engines", "symbol-mapping.js")) ` |
| scripts/market/evaluate-provider.mjs | ` require(join(root, "quant", "engines", "market-quality.js")) ` |
| scripts/market/evaluate-provider.mjs | ` require(spec.module) ` |
| scripts/market/evaluate-provider.mjs | ` fetch(url, init) ` |
| scripts/market/expand-us-universe.mjs | ` require(join(root, "quant", "engines", "us-security-master.js")) ` |
| scripts/market/fetch-market-data.mjs | ` require(join(engines, "symbol-mapping.js")) ` |
| scripts/market/fetch-market-data.mjs | ` require(join(engines, "market-quality.js")) ` |
| scripts/market/fetch-market-data.mjs | ` require(join(engines, "data-mode.js")) ` |
| scripts/market/fetch-market-data.mjs | ` require(join(root, "providers", "twelve-data", "adapter.js")) ` |
| scripts/market/fetch-market-data.mjs | ` fetch(url, init) ` |
| scripts/market/guard-listing-continuity.mjs | ` require(join(root, "quant", "engines", "survivorship-control.js")) ` |
| scripts/market/ingest-fx-intraday.mjs | ` require(join(ROOT, "quant", "engines", "fx", "fx-rates.js")) ` |
| scripts/market/ingest-fx-intraday.mjs | ` require(join(ROOT, "quant", "engines", "fx", "fx-provider-registry.js")) ` |
| scripts/market/ingest-fx-intraday.mjs | ` require(join(ROOT, "quant", "engines", "capabilities.js")) ` |
| scripts/market/ingest-fx-intraday.mjs | `` fetch(`${BASE}/tiingo/fx/top?tickers=${ticker}`, `` |
| scripts/market/ingest-intraday.mjs | ` require(join(engines, "symbol-mapping.js")) ` |
| scripts/market/ingest-intraday.mjs | ` require(join(engines, "market-store.js")) ` |
| scripts/market/ingest-intraday.mjs | ` require(join(engines, "display-policy.js")) ` |
| scripts/market/ingest-intraday.mjs | ` require(join(engines, "realtime", "trading-session.js")) ` |
| scripts/market/ingest-intraday.mjs | ` require(join(engines, "realtime", "intraday-snapshot.js")) ` |
| scripts/market/ingest-intraday.mjs | ` require(join(engines, "realtime", "freshness.js")) ` |
| scripts/market/ingest-intraday.mjs | ` require(join(engines, "realtime", "intraday-scope.js")) ` |
| scripts/market/ingest-intraday.mjs | ` require(join(DEFAULT_ROOT, "core", "identity.js")) ` |
| scripts/market/ingest-intraday.mjs | ` require(join(root, "providers", "tiingo", "adapter.js")) ` |
| scripts/market/ingest-intraday.mjs | ` fetch(url, init) ` |
| scripts/market/ingest-multi-asset.mjs | ` require(join(root, "quant/engines/multi-asset/instrument-catalog.js")) ` |
| scripts/market/ingest-multi-asset.mjs | ` require(join(root, "quant/api/multi-asset-contract.js")) ` |
| scripts/market/ingest-multi-asset.mjs | ` require(join(root, "providers/tiingo/adapter.js")) ` |
| scripts/market/ingest-multi-asset.mjs | ` require(join(root, "providers/ecb/adapter.js")) ` |
| scripts/market/ingest-multi-asset.mjs | ` require(join(root, "providers/us-treasury/adapter.js")) ` |
| scripts/market/ingest-multi-asset.mjs | ` require(join(root, "providers/nyfed/adapter.js")) ` |
| scripts/market/ingest-multi-asset.mjs | ` require(join(root, "providers/bundesbank/adapter.js")) ` |
| scripts/market/ingest-multi-asset.mjs | ` require(join(root, "providers/eia/adapter.js")) ` |
| scripts/market/ingest-multi-asset.mjs | ` require(join(root, "providers/fred/adapter.js")) ` |
| scripts/market/ingest-multi-asset.mjs | ` require(join(root, "providers/nikkei/adapter.js")) ` |
| scripts/market/ingest-multi-asset.mjs | ` require(join(root, "providers/fmp/adapter.js")) ` |
| scripts/market/ingest-multi-asset.mjs | ` require(join(root, "quant/config/multi-asset.json")) ` |
| scripts/market/ingest-multi-asset.mjs | ` require(join(root, "quant/config/market-calendar.json")) ` |
| scripts/market/ingest-multi-asset.mjs | ` require(join(root, "quant/config/multi-asset-instruments.json")) ` |
| scripts/market/ingest-multi-asset.mjs | ` fetch(url, { headers: { "User-Agent": UA }, signal: ctrl.signal }) ` |
| scripts/market/ingest-multi-asset.mjs | ` fetch(u, i) ` |
| scripts/market/ingest-multi-asset.mjs | ` fetch(url, { headers: { "User-Agent": UA } }) ` |
| scripts/market/ingest-tiingo.mjs | ` require(join(engines, "symbol-mapping.js")) ` |
| scripts/market/ingest-tiingo.mjs | ` require(join(engines, "market-quality.js")) ` |
| scripts/market/ingest-tiingo.mjs | ` require(join(engines, "return-series.js")) ` |
| scripts/market/ingest-tiingo.mjs | ` require(join(engines, "price-semantics.js")) ` |
| scripts/market/ingest-tiingo.mjs | ` require(join(engines, "market-eod-gate.js")) ` |
| scripts/market/ingest-tiingo.mjs | ` require(join(engines, "rejection-lifecycle.js")) ` |
| scripts/market/ingest-tiingo.mjs | ` require(join(engines, "market-store.js")) ` |
| scripts/market/ingest-tiingo.mjs | ` require(join(engines, "display-policy.js")) ` |
| scripts/market/ingest-tiingo.mjs | ` require(join(root, "providers", "tiingo", "adapter.js")) ` |
| scripts/market/ingest-tiingo.mjs | ` fetch(url, init) ` |
| scripts/market/lib/corporate-action-confirmations.mjs | ` require(join(ROOT, "core", "identity.js")) ` |
| scripts/market/lib/security-master-duplicate-resolution.mjs | ` require(join(root, "quant", "engines", "us-security-master.js")) ` |
| scripts/market/lib/security-master-duplicate-resolution.mjs | ` require(join(root, "core", "identity.js")) ` |
| scripts/market/lib/split-evidence-supplements.mjs | ` require(join(ROOT, "core", "identity.js")) ` |
| scripts/market/long-series-repair-plan.mjs | ` require(join(REPO_ROOT, "core", "data-quality.js")) ` |
| scripts/market/preflight-zero-cost.mjs | ` require(join(root, "quant", "engines", "zero-cost-guard.js")) ` |
| scripts/market/preflight-zero-cost.mjs | ` require(join(root, "quant", "engines", "history-store.js")) ` |
| scripts/market/preflight-zero-cost.mjs | ` import(join(root, "scripts", "market", "storage", "fs-driver.mjs")) ` |
| scripts/market/preflight-zero-cost.mjs | ` import(join(root, "scripts", "market", "storage", "s3-driver.mjs")) ` |
| scripts/market/probe-cloudflare-scope.mjs | ` fetch(API + p.pfad, { ` |
| scripts/market/probe-free-sources.mjs | ` fetch(url, { method: post ? "POST" : method, headers: h, signal: ctrl.signal, redirect: "follow", ` |
| scripts/market/probe-index-sources.mjs | ` fetch(url, { headers, signal: ctrl.signal, redirect: "follow" }) ` |
| scripts/market/probe-multi-asset.mjs | ` require(join(root, "quant", "engines", "multi-asset", "instrument-catalog.js")) ` |
| scripts/market/probe-multi-asset.mjs | ` fetch(url, { headers, signal: ctrl.signal }) ` |
| scripts/market/probe-provider-split.mjs | ` fetch(url, { headers: { Authorization: "Token " + key, "Content-Type": "application/json" } }) ` |
| scripts/market/probe-tiingo-fx.mjs | ` require(join(root, "quant", "engines", "fx", "fx-capability.js")) ` |
| scripts/market/probe-tiingo-fx.mjs | ` require(join(root, "quant", "engines", "capabilities.js")) ` |
| scripts/market/probe-tiingo-fx.mjs | ` fetch(url, { ` |
| scripts/market/publish-discover-series.mjs | ` require(join(HERE, "..", "..", "quant", "engines", "survivorship-control.js")) ` |
| scripts/market/publish-discover-series.mjs | ` require(join(HERE, "..", "..", "quant", "engines", "published-close.js")) ` |
| scripts/market/publish-discover-series.mjs | ` require(join(HERE, "..", "..", "quant", "engines", "return-series.js")) ` |
| scripts/market/publish-discover-series.mjs | ` require(join(engines, "display-policy.js")) ` |
| scripts/market/publish-discover-series.mjs | ` require(join(engines, "market-store.js")) ` |
| scripts/market/publish-long-series.mjs | ` require(join(root, "quant", "engines", "series-sampling.js")) ` |
| scripts/market/publish-long-series.mjs | ` require(join(root, "quant", "engines", "published-close.js")) ` |
| scripts/market/publish-long-series.mjs | ` require(join(root, "quant", "engines", "history-store.js")) ` |
| scripts/market/publish-long-series.mjs | ` require(join(root, "quant", "engines", "zero-cost-guard.js")) ` |
| scripts/market/publish-long-series.mjs | ` require(join(root, "quant", "engines", "display-policy.js")) ` |
| scripts/market/publish-long-series.mjs | ` require(join(root, "quant", "engines", "survivorship-control.js")) ` |
| scripts/market/publish-long-series.mjs | ` require(join(root, "quant", "engines", "corporate-action-evidence.js")) ` |
| scripts/market/publish-long-series.mjs | ` import(join(root, "scripts", "market", "storage", "fs-driver.mjs")) ` |
| scripts/market/publish-long-series.mjs | ` import(join(root, "scripts", "market", "storage", "s3-driver.mjs")) ` |
| scripts/market/qualify-providers.mjs | ` require(join(root, "quant", "engines", "provider-qualification.js")) ` |
| scripts/market/refresh-benchmark-history.mjs | ` require(join(engines, "symbol-mapping.js")) ` |
| scripts/market/refresh-benchmark-history.mjs | ` require(join(engines, "market-quality.js")) ` |
| scripts/market/refresh-benchmark-history.mjs | ` require(join(engines, "canonical-total-return.js")) ` |
| scripts/market/refresh-benchmark-history.mjs | ` require(join(engines, "market-store.js")) ` |
| scripts/market/refresh-benchmark-history.mjs | ` require(join(engines, "display-policy.js")) ` |
| scripts/market/refresh-benchmark-history.mjs | ` require(join(root, "providers", "tiingo", "adapter.js")) ` |
| scripts/market/refresh-benchmark-history.mjs | ` fetch(url, init) }) ` |
| scripts/market/repair-total-return-history.mjs | ` require(join(engines, "symbol-mapping.js")) ` |
| scripts/market/repair-total-return-history.mjs | ` require(join(engines, "market-quality.js")) ` |
| scripts/market/repair-total-return-history.mjs | ` require(join(engines, "market-store.js")) ` |
| scripts/market/repair-total-return-history.mjs | ` require(join(engines, "display-policy.js")) ` |
| scripts/market/repair-total-return-history.mjs | ` require(join(root, "providers", "tiingo", "adapter.js")) ` |
| scripts/market/repair-total-return-history.mjs | ` require(join(engines, "history-store.js")) ` |
| scripts/market/repair-total-return-history.mjs | ` require(join(engines, "zero-cost-guard.js")) ` |
| scripts/market/repair-total-return-history.mjs | ` import(join(root, "scripts", "market", "storage", "s3-driver.mjs")) ` |
| scripts/market/repair-total-return-history.mjs | ` fetch(url, init) }) ` |
| scripts/market/run-pacemaker.mjs | ` require(join(engines, "realtime", "pacemaker.js")) ` |
| scripts/market/run-pacemaker.mjs | ` require(join(engines, "realtime", "trading-session.js")) ` |
| scripts/market/run-pacemaker.mjs | ` require(join(root, "quant", "config", "market-calendar.json")) ` |
| scripts/market/run-scale-gate.mjs | ` require(join(root, "core", "identity.js")) ` |
| scripts/market/run-scale-gate.mjs | ` require(join(engines, "symbol-mapping.js")) ` |
| scripts/market/run-scale-gate.mjs | ` require(join(engines, "market-quality.js")) ` |
| scripts/market/run-scale-gate.mjs | ` require(join(engines, "market-store.js")) ` |
| scripts/market/run-scale-gate.mjs | ` require(join(engines, "display-policy.js")) ` |
| scripts/market/run-scale-gate.mjs | ` require(join(root, "providers", "tiingo", "adapter.js")) ` |
| scripts/market/run-scale-gate.mjs | ` fetch(url, init) ` |
| scripts/market/security-master-v130-evidence.mjs | ` require(join(ROOT, "quant/engines/us-security-master.js")) ` |
| scripts/market/security-master-v130-evidence.mjs | ` require(join(ROOT, "core/identity.js")) ` |
| scripts/market/smoke-vu-live.mjs | ` require(join(root, "quant", "engines", "realtime", "market-hours.js")) ` |
| scripts/market/smoke-vu-live.mjs | ` fetch(httpUrl("/version"), { headers: { Origin: ERLAUBTER_URSPRUNG } }) ` |
| scripts/market/smoke-vu-live.mjs | ` fetch(httpUrl("/health"), { headers: { Origin: ERLAUBTER_URSPRUNG } }) ` |
| scripts/market/smoke-vu-live.mjs | ` fetch() setzt ihn nicht, es ` |
| scripts/market/smoke-vu-live.mjs | ` fetch(httpUrl("/version"), { ` |
| scripts/market/smoke-vu-live.mjs | ` fetch(httpUrl("/version"), { headers: { Origin: FREMDER_URSPRUNG } }) ` |
| scripts/market/smoke-vu-live.mjs | ` fetch(httpUrl("/version"), { ` |
| scripts/market/smoke-vu-live.mjs | ` fetch(httpUrl("/health"), { headers: { Origin: ERLAUBTER_URSPRUNG } }) ` |
| scripts/market/split-supplement-effect.mjs | ` require(join(ROOT, "quant", "engines", "published-close.js")) ` |
| scripts/market/split-supplement-effect.mjs | ` require(join(ROOT, "quant", "engines", "corporate-action-evidence.js")) ` |
| scripts/market/split-supplement-effect.mjs | ` require(join(ROOT, "quant", "engines", "weekly-real-adapter.cjs")) ` |
| scripts/market/split-supplement-effect.mjs | ` require(join(ROOT, "fundamental", "engine", "catalog.js")) ` |
| scripts/market/split-supplement-effect.mjs | ` import(join(ROOT, "scripts", "fundamental", "build-history.mjs")) ` |
| scripts/market/study-return-basis-universe.mjs | ` require(join(ROOT, "core", "identity.js")) ` |
| scripts/market/study-return-basis-universe.mjs | ` require(join(ROOT, "quant/engines/return-series.js")) ` |
| scripts/market/study-return-basis-universe.mjs | ` require(join(ROOT, "quant/engines/return-basis-comparison.js")) ` |
| scripts/market/study-return-basis-universe.mjs | ` require(join(ROOT, "quant/engines/sic-peer-taxonomy.js")) ` |
| scripts/market/sync-history-store.mjs | ` require(join(root, "quant", "engines", "history-store.js")) ` |
| scripts/market/sync-history-store.mjs | ` require(join(root, "quant", "engines", "zero-cost-guard.js")) ` |
| scripts/market/sync-history-store.mjs | ` require(join(root, "quant", "engines", "bar-codec.js")) ` |
| scripts/market/sync-history-store.mjs | ` require(join(root, "quant", "engines", "survivorship-control.js")) ` |
| scripts/market/sync-history-store.mjs | ` import(join(root, "scripts", "market", "storage", "fs-driver.mjs")) ` |
| scripts/market/sync-history-store.mjs | ` import(join(root, "scripts", "market", "storage", "s3-driver.mjs")) ` |
| scripts/market/verify-dynamic-subscribe.mjs | ` require(join(root, "providers", "tiingo", "realtime.js")) ` |
| scripts/market/verify-dynamic-subscribe.mjs | ` require(join(root, "quant", "engines", "realtime", "market-hours.js")) ` |
| scripts/market/verify-live-candle.mjs | ` require(join(engines, "realtime", "transport.js")) ` |
| scripts/market/verify-live-candle.mjs | ` require(join(engines, "realtime", "bar-merge.js")) ` |
| scripts/market/verify-live-candle.mjs | ` require(join(engines, "realtime", "market-hours.js")) ` |
| scripts/market/verify-live-candle.mjs | ` require(join(root, "providers", "tiingo", "realtime.js")) ` |
| scripts/market/verify-live-candle.mjs | `` fetch(`${REST_BASE}/iex/${encodeURIComponent(sym.toLowerCase())}`, `` |
| scripts/market/verify-request-limits.mjs | ` require(join(root, "providers", "tiingo", "adapter.js")) ` |
| scripts/market/verify-request-limits.mjs | ` fetch(url, opts &#124;&#124; {}) ` |
| scripts/market/verify-runtime-load.mjs | ` require(join(engines, "realtime", "bar-merge.js")) ` |
| scripts/market/verify-runtime-load.mjs | ` require(join(root, "providers", "tiingo", "realtime.js")) ` |
| scripts/market/verify-semantics-parity.mjs | ` require(join(root, "quant", "engines", "price-semantics.js")) ` |
| scripts/market/verify-tiingo-commercial.mjs | ` require(join(root, "providers", "tiingo", "adapter.js")) ` |
| scripts/market/verify-tiingo-commercial.mjs | ` require(join(engines, "realtime", "market-hours.js")) ` |
| scripts/market/verify-tiingo-commercial.mjs | ` require(join(engines, "market-quality.js")) ` |
| scripts/market/verify-tiingo-commercial.mjs | ` fetch(url, init) ` |
| scripts/market/verify-tiingo-realtime.mjs | ` require(join(root, "providers", "tiingo", "adapter.js")) ` |
| scripts/market/verify-tiingo-realtime.mjs | ` require(join(root, "providers", "tiingo", "realtime.js")) ` |
| scripts/market/verify-tiingo-realtime.mjs | ` require(join(engines, "realtime", "market-hours.js")) ` |
| scripts/market/verify-tiingo-realtime.mjs | ` require(join(engines, "realtime", "session-policy.js")) ` |
| scripts/market/verify-tiingo-realtime.mjs | ` fetch(url, init), ` |
| scripts/market/verify-tiingo-runtime.mjs | ` require(join(engines, "symbol-mapping.js")) ` |
| scripts/market/verify-tiingo-runtime.mjs | ` require(join(root, "providers", "tiingo", "adapter.js")) ` |
| scripts/market/verify-tiingo-runtime.mjs | ` fetch(url, init) ` |
| scripts/market/verify-vu-live-e2e.mjs | ` import(join(root, "worker", "tests", "harness.mjs")) ` |
| scripts/market/verify-vu-live-e2e.mjs | ` import(join(root, "worker", "src", "vu-live.mjs")) ` |
| scripts/market/verify-vu-live-e2e.mjs | ` fetch(anfrage("https://vu-live/live", { Upgrade: "websocket" })) ` |
| scripts/marketstack/europe-marketstack-diagnostics-once.mjs | ` fetch (sharedBudget.reserve). ` |
| scripts/mobile/tests/server.test.mjs | ` fetch(base+'/') ` |
| scripts/mobile/tests/server.test.mjs | ` fetch(base+'/NV.json.gz') ` |
| scripts/mobile/tests/server.test.mjs | ` fetch(base+'/absent.json')).status,404) ` |
| scripts/mobile/tests/server.test.mjs | ` fetch(base+'/%2e%2e%2foutside')).status,404) ` |
| scripts/quality/audit-fx-provider-seam.mjs | ` require(join(FXDIR, "fx-rates.js")) ` |
| scripts/quality/audit-fx-provider-seam.mjs | ` require(join(FXDIR, "fx-provider-registry.js")) ` |
| scripts/quality/chart-parity.mjs | ` require(join(REPO_ROOT, "core", "identity.js")) ` |
| scripts/quality/chart-parity.mjs | ` require(join(REPO_ROOT, "core", "data-quality.js")) ` |
| scripts/quality/chart-parity.mjs | ` require(join(REPO_ROOT, "core", "chart-history.js")) ` |
| scripts/quality/chart-parity.mjs | ` require(join(REPO_ROOT, "quant", "engines", "return-series.js")) ` |
| scripts/quality/chart-parity.mjs | ` require(join(REPO_ROOT, "quant", "engines", "realtime", "trading-session.js")) ` |
| scripts/quality/chart-parity.mjs | ` require(join(REPO_ROOT, "core", "chart-standard.js")) ` |
| scripts/quality/chart-parity.mjs | ` require(join(REPO_ROOT, "quant", "engines", "fx", "fx-rates.js")) ` |
| scripts/quality/chart-parity.mjs | ` require(join(REPO_ROOT, "quant", "engines", "fx", "currency-contract.js")) ` |
| scripts/quality/find-unused.mjs | ` require(), fetch(), HTML src/href, CSS url(), ` |
| scripts/quality/fundamental-compare-qa.mjs | ` require(arg('playwright', process.env.PLAYWRIGHT_PATH &#124;&#124; 'playwright')) ` |
| scripts/quality/shell-browser-qa.mjs | ` require(arg('playwright', process.env.PLAYWRIGHT_PATH &#124;&#124; 'playwright')) ` |
| scripts/quality/tests/find-unused.test.mjs | ` fetch(base + name) ` |
| scripts/quality/tests/find-unused.test.mjs | `` import(`./${name}.mjs`) `` |
| scripts/quality/tests/find-unused.test.mjs | `` fetch(path + '<a href="/not-a-real-artifact.json">')`]]),sizes=new Map([['dynamic.js',100]]) `` |
| scripts/quality/verify-currency-layer.mjs | ` require(join(ROOT, "core", "identity.js")) ` |
| scripts/quality/verify-currency-layer.mjs | ` require(join(FXDIR, "fx-rates.js")) ` |
| scripts/quality/verify-currency-layer.mjs | ` require(join(FXDIR, "fx-provider-registry.js")) ` |
| scripts/quality/verify-currency-layer.mjs | ` require(join(FXDIR, "currency-engine.js")) ` |
| scripts/quality/verify-currency-layer.mjs | ` require(join(FXDIR, "currency-registry.js")) ` |
| scripts/quality/verify-currency-layer.mjs | ` require(join(FXDIR, "money-format.js")) ` |
| scripts/quality/verify-currency-layer.mjs | ` require(join(FXDIR, "currency-contract.js")) ` |
| scripts/quality/verify-currency-layer.mjs | ` require(join(FXDIR, "fx-realtime-state.js")) ` |
| scripts/quality/verify-currency-layer.mjs | ` require(join(FXDIR, "fx-freshness.js")) ` |
| scripts/quality/verify-currency-layer.mjs | ` require(join(FXDIR, "fx-freshness.js")) ` |
| scripts/quality/verify-historical-fx-coverage.mjs | ` require(join(FXDIR, "fx-rates.js")) ` |
| scripts/quality/verify-historical-fx-coverage.mjs | ` require(join(FXDIR, "fx-provider-registry.js")) ` |
| scripts/quality/verify-multi-asset.mjs | ` require(join(root, "quant/engines/multi-asset/asset-taxonomy.js")) ` |
| scripts/quality/verify-multi-asset.mjs | ` require(join(root, "quant/engines/multi-asset/instrument-catalog.js")) ` |
| scripts/quality/verify-multi-asset.mjs | ` require(join(root, "quant/api/multi-asset-contract.js")) ` |
| scripts/quality/verify-multi-asset.mjs | ` require(join(root, "quant/config/multi-asset.json")) ` |
| scripts/quality/verify-multi-asset.mjs | ` require(join(root, "quant/config/market-calendar.json")) ` |
| scripts/quality/verify-multi-asset.mjs | ` require(join(root, "providers/fred/adapter.js")) ` |
| scripts/quality/verify-multi-asset.mjs | ` fetch(SITE + path + (path.includes("?") ? "&" : "?") + "v=" + Date.now(), { headers: { "Cache-Control": "no-cache" } }) ` |
| scripts/quality/verify-realtime-eur.mjs | ` require(join(FXDIR, "fx-rates.js")) ` |
| scripts/quality/verify-realtime-eur.mjs | ` require(join(FXDIR, "fx-provider-registry.js")) ` |
| scripts/quality/verify-realtime-eur.mjs | ` require(join(FXDIR, "fx-freshness.js")) ` |
| scripts/quality/verify-realtime-eur.mjs | ` require(join(FXDIR, "fx-realtime-state.js")) ` |
| scripts/quality/verify-realtime-eur.mjs | ` require(join(FXDIR, "currency-contract.js")) ` |
| scripts/quality/verify-realtime-eur.mjs | ` require(join(FXDIR, "money-format.js")) ` |
| scripts/quality/verify-realtime-eur.mjs | `` fetch(`${BASE}/iex/?tickers=${tickers.join(",")}`, `` |
| scripts/quality/vu3-regression-qa.mjs | ` require(arg('playwright', process.env.PLAYWRIGHT_PATH &#124;&#124; 'playwright')) ` |
| scripts/quality/vu3-regression-qa.mjs | ` fetch(base + '/supertrader/data/build.json').then((r) => r.json()).then((j) => (j.slices && j.slices.stock) &#124;&#124; []).catch(() => []) ` |
| scripts/quant/assert-product-completeness.mjs | ` require(join(ROOT, "quant/engines/product-language.js")) ` |
| scripts/quant/assert-product-completeness.mjs | ` require(join(ROOT, enginePath)) ` |
| scripts/quant/backtest-generation-freeze.cjs | ` import(path.join(ROOT,'scripts/market/build-security-master-identity-blocklist.mjs')) ` |
| scripts/quant/build-backtest-certification.mjs | ` require(P("quant/engines/backtest-certification.js")) ` |
| scripts/quant/build-backtest-certification.mjs | ` require(P("quant/engines/profile-backtest.js")) ` |
| scripts/quant/build-backtest-certification.mjs | ` require(P("quant/engines/signal-backtest.js")) ` |
| scripts/quant/build-backtest-certification.mjs | ` require(P("quant/engines/backtest-artifact-consistency.js")) ` |
| scripts/quant/build-backtest-certification.mjs | ` require(P("quant/engines/setup-oos.cjs")) ` |
| scripts/quant/build-backtest-certification.mjs | ` require(P("quant/engines/survivorship-control.js")) ` |
| scripts/quant/build-backtest-readiness.mjs | ` require(join(ROOT, "quant/engines/backtest-artifact-consistency.js")) ` |
| scripts/quant/build-emerging-leaders-study.mjs | ` require(join(ROOT, "quant/engines/emerging-leaders.js")) ` |
| scripts/quant/build-emerging-leaders-study.mjs | ` require(join(ROOT, "quant/engines/survivorship-control.js")) ` |
| scripts/quant/build-emerging-leaders-study.mjs | ` require(join(ROOT, "quant/engines/history-store.js")) ` |
| scripts/quant/build-emerging-leaders-study.mjs | ` require(join(ROOT, "quant/engines/zero-cost-guard.js")) ` |
| scripts/quant/build-emerging-leaders-study.mjs | ` import(join(ROOT, "scripts/market/storage/s3-driver.mjs")) ` |
| scripts/quant/build-evidence-status.mjs | ` require(P("quant/engines/historical-cases.js")) ` |
| scripts/quant/build-factor-evidence.mjs | ` require(join(ROOT, "quant/engines/factor-evidence.js")) ` |
| scripts/quant/build-factor-evidence.mjs | ` require(join(ROOT, "quant/engines/change-engine.js")) ` |
| scripts/quant/build-factor-evidence.mjs | ` require(join(ROOT, "quant/engines/fundamental-inputs.js")) ` |
| scripts/quant/build-factor-evidence.mjs | ` require(join(ROOT, "quant/engines/published-close.js")) ` |
| scripts/quant/build-factor-evidence.mjs | ` require(join(ROOT, "quant/engines/catalog.js")) ` |
| scripts/quant/build-factor-evidence.mjs | ` require(join(ROOT, "quant/engines/quant-radar.js")) ` |
| scripts/quant/build-factor-evidence.mjs | ` require(join(ROOT, "quant/engines/us-security-master.js")) ` |
| scripts/quant/build-factor-evidence.mjs | ` require(join(ROOT, "quant/engines/survivorship-control.js")) ` |
| scripts/quant/build-factor-evidence.mjs | ` require(join(ROOT, "quant/engines/market-cap.js")) ` |
| scripts/quant/build-golden-five-pit-coverage.mjs | ` require(join(root, "providers", "sec", "adapter.js")) ` |
| scripts/quant/build-market-regime.mjs | ` require(join(ROOT, "quant/engines/market-regime.js")) ` |
| scripts/quant/build-methodology-index.mjs | ` require(join(ROOT, "quant/engines/product-language.js")) ` |
| scripts/quant/build-pattern-match.mjs | ` require(join(ROOT, "quant/engines/pattern-research.js")) ` |
| scripts/quant/build-pattern-match.mjs | ` require(join(ROOT, "quant/engines/pit-fundamental-history.js")) ` |
| scripts/quant/build-pattern-research-fundamentals.mjs | ` require(join(ROOT, "quant/engines/pattern-research.js")) ` |
| scripts/quant/build-pattern-research-fundamentals.mjs | ` require(join(ROOT, "quant/engines/pit-fundamental-history.js")) ` |
| scripts/quant/build-pattern-research.mjs | ` require(join(ROOT, "quant/engines/pattern-research.js")) ` |
| scripts/quant/build-product-language-doc.mjs | ` require(join(ROOT, "quant/engines/product-language.js")) ` |
| scripts/quant/build-quant-radar.mjs | ` require(join(ROOT, "quant/engines/quant-radar.js")) ` |
| scripts/quant/build-quant-radar.mjs | ` require(join(ROOT, "quant/engines/setup-engine.js")) ` |
| scripts/quant/build-quant-radar.mjs | ` require(join(ROOT, "quant/engines/historical-cases.js")) ` |
| scripts/quant/build-quant-radar.mjs | ` require(join(ROOT, "quant/engines/us-security-master.js")) ` |
| scripts/quant/build-quant-radar.mjs | ` require(join(ROOT, "quant/engines/survivorship-control.js")) ` |
| scripts/quant/build-quant-radar.mjs | ` require(join(ROOT, "quant/engines/factor-evidence.js")) ` |
| scripts/quant/build-quant-radar.mjs | ` require(join(ROOT, "quant/engines/radar-event-quarantine.js")) ` |
| scripts/quant/build-quant-radar.mjs | ` require(join(ROOT, "quant/app/view-model.js")) ` |
| scripts/quant/build-sec-quant-panel.mjs | ` require(join(root, "core", "identity.js")) ` |
| scripts/quant/build-sec-quant-panel.mjs | ` require(join(engines, "schema.js")) ` |
| scripts/quant/build-sec-quant-panel.mjs | ` require(join(engines, "factors.js")) ` |
| scripts/quant/build-sec-quant-panel.mjs | ` require(join(engines, "sec-fact-panel.js")) ` |
| scripts/quant/build-sec-quant-panel.mjs | ` require(join(engines, "panel-builder.js")) ` |
| scripts/quant/build-sec-quant-panel.mjs | ` require(join(engines, "published-close.js")) ` |
| scripts/quant/build-sec-quant-panel.mjs | ` require(join(root, "providers", "sec", "adapter.js")) ` |
| scripts/quant/build-setup-backtest.mjs | ` require(join(ROOT, "quant/engines/signal-backtest.js")) ` |
| scripts/quant/build-setup-backtest.mjs | ` require(join(ROOT, "quant/engines/canonical-total-return.js")).VERSION ` |
| scripts/quant/build-setup-observations.mjs | ` require(join(ROOT, "quant/engines/setup-engine.js")) ` |
| scripts/quant/build-setup-observations.mjs | ` require(join(ROOT, "quant/engines/catalog.js")) ` |
| scripts/quant/build-setup-outcomes.mjs | ` require(join(ROOT, "quant/engines/signal-backtest.js")) ` |
| scripts/quant/build-sic-peer-taxonomy.mjs | ` require(join(root, "quant", "engines", "sic-peer-taxonomy.js")) ` |
| scripts/quant/build-signal-backtest.mjs | ` require(join(ROOT, "quant/engines/signal-backtest.js")) ` |
| scripts/quant/build-signal-backtest.mjs | ` require(join(ROOT, "quant/engines/market-quality.js")) ` |
| scripts/quant/build-signal-backtest.mjs | ` require(join(ROOT, "quant/engines/canonical-total-return.js")) ` |
| scripts/quant/build-strategy-index.mjs | ` require(join(ROOT, "quant/engines/strategy-match.js")) ` |
| scripts/quant/build-strategy-index.mjs | ` require(join(ROOT, "quant/engines/query.js")) ` |
| scripts/quant/build-survivorship-control.mjs | ` require(join(ROOT, "core", "identity.js")) ` |
| scripts/quant/build-survivorship-control.mjs | ` require(join(ROOT, "quant/engines/survivorship-control.js")) ` |
| scripts/quant/build-survivorship-control.mjs | ` require(join(ROOT, "quant/engines/market-quality.js")) ` |
| scripts/quant/build-survivorship-control.mjs | ` require(join(ROOT, "quant/engines/canonical-total-return.js")) ` |
| scripts/quant/build-survivorship-control.mjs | ` require(join(ROOT, "quant/engines/history-store.js")) ` |
| scripts/quant/build-survivorship-control.mjs | ` require(join(ROOT, "quant/engines/zero-cost-guard.js")) ` |
| scripts/quant/build-survivorship-control.mjs | ` import(join(ROOT, "scripts/market/storage/s3-driver.mjs")) ` |
| scripts/quant/cli.py | ` import (aggregate_coverage, build_consumer_bundle, read_history_shards, write_history_shards, load_fiscal_year_end_hints, ` |
| scripts/quant/lib/daily-prices.mjs | ` require(join(ROOT, "quant/engines/technical/canonical-bars.js")) ` |
| scripts/quant/lib/daily-prices.mjs | ` require(join(ROOT, "quant/engines/market-quality.js")) ` |
| scripts/quant/lib/daily-prices.mjs | ` require(join(ROOT, "quant/engines/canonical-total-return.js")) ` |
| scripts/quant/lib/daily-prices.mjs | ` require(join(ROOT, "quant/engines/survivorship-control.js")) ` |
| scripts/quant/lib/emerging-leaders-inputs.mjs | ` require(join(ROOT, "quant/engines/return-series.js")) ` |
| scripts/quant/lib/emerging-leaders-inputs.mjs | ` require(join(ROOT, "quant/engines/pit-fundamental-history.js")) ` |
| scripts/quant/lib/emerging-leaders-inputs.mjs | ` require(join(ROOT, "core/identity.js")) ` |
| scripts/quant/lib/emerging-leaders-inputs.mjs | ` require(join(ROOT, "discover/engines/scoring.js")) ` |
| scripts/quant/lib/pattern-study.mjs | ` require(join(ROOT, "quant/engines/pattern-research.js")) ` |
| scripts/quant/measure-backtest-certification.mjs | ` require(P("quant/engines/backtest-certification.js")) ` |
| scripts/quant/measure-backtest-certification.mjs | ` require(P("quant/engines/signal-backtest.js")) ` |
| scripts/quant/measure-backtest-certification.mjs | ` require(P("quant/engines/quant-radar.js")) ` |
| scripts/quant/measure-backtest-signal-intelligence.mjs | ` require(join(ROOT, "quant/api/product-services.js")) ` |
| scripts/quant/measure-backtest-signal-intelligence.mjs | ` require(join(ROOT, "quant/engines/signal-backtest.js")) ` |
| scripts/quant/measure-backtest-signal-intelligence.mjs | ` require(join(ROOT, "quant/engines/quant-radar.js")) ` |
| scripts/quant/measure-backtest-signal-intelligence.mjs | ` require(join(ROOT, "quant/engines/display-policy.js")), queryEngine: require(join(ROOT, "quant/engines/query.js")) ` |
| scripts/quant/measure-decision-intelligence.mjs | ` require(join(ROOT, "quant/api/product-services.js")) ` |
| scripts/quant/measure-decision-intelligence.mjs | ` require(join(ROOT, "quant/engines/display-policy.js")), queryEngine: require(join(ROOT, "quant/engines/query.js")) ` |
| scripts/quant/measure-local-coverage-levers.mjs | ` require(join(ROOT, "quant/engines/fundamental-inputs.js")) ` |
| scripts/quant/measure-methodology-change.mjs | ` require(join(ROOT, "quant/engines/return-basis-comparison.js")) ` |
| scripts/quant/measure-name-type-evidence.mjs | ` require(join(ROOT, "quant/engines/instrument-classification.js")) ` |
| scripts/quant/measure-naming-contract.mjs | ` require(join(ROOT, "quant/engines/company-naming-contract.js")) ` |
| scripts/quant/measure-naming-contract.mjs | ` require(join(ROOT, "quant/api/product-services.js")) ` |
| scripts/quant/measure-naming-contract.mjs | ` require(join(ROOT, "quant/engines/display-policy.js")) ` |
| scripts/quant/measure-naming-contract.mjs | ` require(join(ROOT, "quant/engines/query.js")) ` |
| scripts/quant/measure-pipeline-freshness.mjs | ` require(join(ROOT, "quant/engines/realtime/trading-session.js")) ` |
| scripts/quant/measure-security-type-safety.mjs | ` require(join(ROOT, "quant/engines/instrument-classification.js")) ` |
| scripts/quant/measure-security-type-safety.mjs | ` require(join(ROOT, "quant/engines/factor-evidence.js")) ` |
| scripts/quant/portfolio/model-depots.cjs | ` require(path.join(ROOT, 'scripts/quant/portfolio/model-portfolios.cjs')) ` |
| scripts/quant/portfolio/model-depots.cjs | ` require(path.join(ROOT, 'quant/engines/portfolio-backtest.cjs')) ` |
| scripts/quant/portfolio/model-depots.cjs | ` require(path.join(ROOT, 'quant/engines/portfolio-construction.cjs')) ` |
| scripts/quant/portfolio/model-depots.cjs | ` require(path.join(ROOT, 'quant/engines/published-close.js')) ` |
| scripts/quant/portfolio/model-depots.cjs | ` require(path.join(ROOT, 'core/identity.js')) ` |
| scripts/quant/portfolio/model-portfolios.cjs | ` require(path.join(ROOT, 'quant/engines/return-series.js')) ` |
| scripts/quant/portfolio/model-portfolios.cjs | ` require(path.join(ROOT, 'vorsorge/engines/series-codec.js')) ` |
| scripts/quant/portfolio/model-portfolios.cjs | ` require(path.join(ROOT, 'quant/engines/portfolio-backtest.cjs')) ` |
| scripts/quant/portfolio/model-portfolios.cjs | ` require(path.join(ROOT, 'quant/engines/portfolio-construction.cjs')) ` |
| scripts/quant/portfolio/model-portfolios.cjs | ` require(path.join(ROOT, 'quant/engines/portfolio-pit-factors.cjs')) ` |
| scripts/quant/portfolio/model-portfolios.cjs | ` require(path.join(ROOT, 'quant/engines/portfolio-risk.cjs')) ` |
| scripts/quant/portfolio/model-portfolios.cjs | ` require(path.join(ROOT, 'quant/engines/research-delisted-series.cjs')) ` |
| scripts/quant/refresh-real-backtest.cjs | ` require() cache. ` |
| scripts/quant/replay-setup-history.mjs | ` require(join(ROOT, "quant/engines/technical/technical-analysis.js")) ` |
| scripts/quant/replay-setup-history.mjs | ` require(join(ROOT, "quant/engines/technical/canonical-bars.js")) ` |
| scripts/quant/replay-setup-history.mjs | ` require(join(ROOT, "quant/engines/setup-engine.js")) ` |
| scripts/quant/research/backtest-coverage-matrix.cjs | ` require(path.join(ROOT, p)) ` |
| scripts/quant/research/backtest-runner.cjs | ` require(path.join(ROOT, p)) ` |
| scripts/quant/research/backtest-spec-builder.cjs | ` require(path.join(ROOT, 'quant/engines/signal-backtest.js')) ` |
| scripts/quant/research/backtest-spec-builder.cjs | ` require(path.join(ROOT, 'scripts/quant/v10/factor/factors.cjs')) ` |
| scripts/quant/research/backtest-spec-builder.cjs | ` require(path.join(ROOT, 'quant/engines/backtest-kinds.cjs')) ` |
| scripts/quant/research/pit-snapshot-integrity.cjs | ` require(P('quant/engines/profile-backtest.js')) ` |
| scripts/quant/run-sec-gates.mjs | ` require(path.join(ROOT, "quant", "engines", "gate-tests.js")) ` |
| scripts/quant/run-sec-gates.mjs | ` require(path.join(ROOT, "providers", "sec", "adapter.js")) ` |
| scripts/quant/sec/derived.py | ` import (     NormalizedFact, Provenance, SOURCE_DERIVED, TRANSFORM_FORMULA, ` |
| scripts/quant/sec/normalize.py | ` import (     Provenance, SOURCE_SEC, TRANSFORM_NONE, QUALITY_HIGH, QUALITY_MEDIUM, ` |
| scripts/quant/sec/periods.py | ` import (     NormalizedFact, Provenance, SOURCE_SEC, TRANSFORM_NONE, TRANSFORM_YTD_DIFF, ` |
| scripts/quant/sec/persist-fundamentals.mjs | ` require(join(root, "quant", "engines", "zero-cost-guard.js")) ` |
| scripts/quant/sec/persist-fundamentals.mjs | ` import(join(root, "scripts", "market", "storage", "fs-driver.mjs")) ` |
| scripts/quant/sec/persist-fundamentals.mjs | ` import(join(root, "scripts", "market", "storage", "s3-driver.mjs")) ` |
| scripts/quant/sec/reconciliation.py | ` import (DEPTH_YEARS, IN_PRODUCT, REPORT_METRICS, ` |
| scripts/quant/tests/test_derived.py | ` import (     SOURCE_DERIVED, SOURCE_SEC, TRANSFORM_FORMULA, CompanyProfile, ` |
| scripts/quant/tests/test_http_and_provider.py | ` import (     DiskCache, RateLimiter, SECHTTPError, SECHttpClient, ` |
| scripts/quant/tests/test_http_and_provider.py | ` import (     SECProvider, TickerNotFound, normalize_cik, PERIODIC_FORMS, ` |
| scripts/quant/tests/test_normalize_periods.py | ` import (     TRANSFORM_YTD_DIFF, TRANSFORM_FY_MINUS_YTD, TRANSFORM_NONE, TRANSFORM_SUM, ` |
| scripts/quant/tests/test_pipeline_and_store.py | ` import (     IngestionPipeline, STATUS_FAILED, STATUS_INGESTED, STATUS_UNCHANGED, ` |
| scripts/quant/tests/test_restatements.py | ` import (     CompanyFactBook, FactTimeline, Observation, POLICY_AS_OF_LATEST, ` |
| scripts/quant/tests/test_secpit_v9_corrections.py | ` import (     FiscalCalendar, REJECTED_IMPLAUSIBLE_FILING_FY, REJECTED_LABEL_NOT_INCREASING, ` |
| scripts/quant/tests/test_secpit_v9_corrections.py | ` import (     ISSUE_FUTURE_PERIOD_END, build_availability_map, normalize_company, ` |
| scripts/quant/tests/test_universe_resolution.py | ` import (_canonical_ticker, _declared_tickers, _load_universe, ` |
| scripts/quant/v10/corporate-actions/before-after.cjs | ` require(path.join(root, 'quant/engines/research-weekly-loader.cjs')) ` |
| scripts/quant/v10/corporate-actions/before-after.cjs | ` require(path.join(root, 'quant/engines/weekly-real-adapter.cjs')) ` |
| scripts/quant/v10/corporate-actions/build-ca-registry.cjs | ` require(path.join(root, 'quant/engines/corporate-action-evidence.js')) ` |
| scripts/quant/v10/corporate-actions/run-tr-ledger.cjs | ` require(path.join(ROOT, 'quant/engines/research-portfolio.cjs')) ` |
| scripts/quant/v10/corporate-actions/run-tr-ledger.cjs | ` require(path.join(ROOT, 'quant/engines/research-contract.cjs')) ` |
| scripts/quant/v10/corporate-actions/run-tr-ledger.cjs | ` require(path.join(ROOT, 'quant/engines/realtime/trading-session.js')) ` |
| scripts/quant/v10/corporate-actions/run-tr-ledger.cjs | ` require(path.join(ROOT, 'quant/engines/research-weekly-loader.cjs')) ` |
| scripts/quant/v10/factor/common.cjs | ` require(ROOT + '/quant/engines/research-weekly-loader.cjs') ` |
| scripts/quant/v10/factor/common.cjs | ` require(ROOT + '/quant/engines/weekly-benchmark.cjs') ` |
| scripts/quant/v10/factor/common.cjs | ` require(ROOT + '/quant/engines/research-contract.cjs') ` |
| scripts/quant/v10/factor/factors.cjs | ` require(ROOT + '/quant/engines/factor-evidence.js') ` |
| scripts/quant/v10/factor/factors.cjs | ` require(ROOT + '/quant/engines/fundamental-inputs.js') ` |
| scripts/quant/v10/factor/factors.cjs | ` require(ROOT + '/quant/engines/market-cap.js') ` |
| scripts/quant/v10/factor/factors.cjs | ` require(ROOT + '/quant/engines/return-series.js') ` |
| scripts/quant/v10/factor/factors.cjs | ` require(ROOT + '/quant/methodology/quant-v2.json') ` |
| scripts/quant/v10/factor/strategy.cjs | ` require(F.ROOT + '/quant/engines/research-portfolio.cjs') ` |
| scripts/quant/v10/factor/strategy.cjs | ` require(F.ROOT + '/quant/engines/research-validation.cjs') ` |
| scripts/quant/v10/factor/study.cjs | ` require(F.ROOT + '/quant/engines/research-studies.cjs') ` |
| scripts/quant/v10/factor/study.cjs | ` require(F.ROOT + '/quant/engines/research-validation.cjs') ` |
| scripts/quant/v10/factor/study.cjs | ` require(F.ROOT + '/scripts/quant/v9/sensitivity/dependence.cjs') ` |
| scripts/quant/v10/population/b1_identity.py | ` fetch(cik, f, prefix): ` |
| scripts/quant/v10/population/b1_identity.py | ` fetch(cik, f, ANNUAL_PREFIX) ` |
| scripts/quant/v10/population/b1_identity.py | ` fetch(cik, f, ANNUAL_PREFIX if f['form'] in ANNUAL else OTHER_PREFIX) ` |
| scripts/quant/v10/population/before-after.cjs | ` require(path.join(root, 'quant/engines/weekly-real-adapter.cjs')) ` |
| scripts/quant/v10/population/before-after.cjs | ` require(path.join(root, 'quant/engines/research-weekly-loader.cjs')) ` |
| scripts/quant/v10/population/build-registers.cjs | ` require(file))) ` |
| scripts/quant/v10/population/build-registers.cjs | ` require(file)) above does not see it, so it is carried over verbatim (correction after the independent V12 review, LARGECAP m9). ` |
| scripts/quant/v10/population/reasons.cjs | ` require(path.join(root, 'quant/engines/research-weekly-loader.cjs')) ` |
| scripts/quant/v10/population/reasons.cjs | ` require(path.join(root, 'quant/engines/weekly-real-adapter.cjs')) ` |
| scripts/quant/v10/setup/build-setup-independence-decision.cjs | ` require(path.join(ROOT, 'quant/engines/research-contract.cjs')) ` |
| scripts/quant/v10/setup/run-setup-reconstruction.cjs | ` require(path.join(ROOT, 'quant/engines/research-contract.cjs')) ` |
| scripts/quant/v10/setup/run-setup-reconstruction.cjs | ` require(path.join(ROOT, 'quant/engines/research-studies.cjs')) ` |
| scripts/quant/v10/setup/run-setup-reconstruction.cjs | ` require(path.join(ROOT, 'quant/engines/research-validation.cjs')) ` |
| scripts/quant/v10/setup/run-setup-reconstruction.cjs | ` require(path.join(ROOT, 'quant/engines/weekly-benchmark.cjs')) ` |
| scripts/quant/v10/setup/run-setup-reconstruction.cjs | ` require(path.join(ROOT, 'quant/engines/research-weekly-loader.cjs')) ` |
| scripts/quant/v10/setup/setup-original-inventory.cjs | ` require(path.join(ROOT, 'quant/engines/research-contract.cjs')) ` |
| scripts/quant/v10/setup/setup-reconstruction-feasibility.mjs | ` import(join(ROOT, "scripts/quant/replay-setup-history.mjs")) ` |
| scripts/quant/v10/setup/setup-reconstruction-feasibility.mjs | ` require(join(ROOT, "quant/engines/technical/technical-analysis.js")) ` |
| scripts/quant/v10/setup/setup-reconstruction-feasibility.mjs | ` require(join(ROOT, "quant/engines/technical/canonical-bars.js")) ` |
| scripts/quant/v10/setup/setup-reconstruction-feasibility.mjs | ` require(join(ROOT, "quant/engines/setup-engine.js")) ` |
| scripts/quant/v10/setup/setup-reconstruction-feasibility.mjs | ` require(join(ROOT, "quant/engines/research-weekly-loader.cjs")) ` |
| scripts/quant/v10/setup/setup-reconstruction-feasibility.mjs | ` require(join(ROOT, "quant/engines/research-contract.cjs")) ` |
| scripts/quant/v10/studies/common.cjs | ` require(ROOT + '/quant/engines/research-contract.cjs') ` |
| scripts/quant/v10/studies/common.cjs | ` require(ROOT + '/quant/engines/research-weekly-loader.cjs') ` |
| scripts/quant/v10/studies/common.cjs | ` require(ROOT + '/quant/engines/research-studies.cjs') ` |
| scripts/quant/v10/studies/common.cjs | ` require(ROOT + '/quant/engines/research-validation.cjs') ` |
| scripts/quant/v10/studies/common.cjs | ` require(ROOT + '/quant/engines/weekly-benchmark.cjs') ` |
| scripts/quant/v10/studies/common.cjs | ` require(ROOT + '/quant/engines/signal-backtest.js') ` |
| scripts/quant/v10/studies/pattern-study.cjs | ` require(K.ROOT + '/quant/engines/pattern-research.js') ` |
| scripts/quant/v10/studies/signal-study.cjs | ` require(K.ROOT + '/quant/engines/research-portfolio.cjs') ` |
| scripts/quant/v11/decomposition/portfolio.cjs | ` require(K.ROOT + '/quant/engines/research-portfolio.cjs') ` |
| scripts/quant/v11/decomposition/register.cjs | ` require(ROOT + '/quant/engines/research-validation.cjs') ` |
| scripts/quant/v11/discovery/lib.cjs | ` require(ROOT + '/scripts/quant/v10/studies/common.cjs') ` |
| scripts/quant/v11/discovery/lib.cjs | ` require(ROOT + '/quant/engines/research-portfolio.cjs') ` |
| scripts/quant/v11/discovery/lib.cjs | ` require(ROOT + '/quant/engines/research-validation.cjs') ` |
| scripts/quant/v11/discovery/lib.cjs | ` require(ROOT + '/quant/engines/research-contract.cjs') ` |
| scripts/quant/v11/winners/build.cjs | ` require(K.ROOT + '/quant/engines/fundamental-inputs.js').compute(v.doc, cutoff, W.finite(mc.value) ? mc.value : null) ` |
| scripts/quant/v11/winners/registration.cjs | ` require(ROOT + '/quant/engines/research-validation.cjs') ` |
| scripts/quant/v12/indexpop/build-outputs.cjs | ` require(path.join(ROOT, 'quant/engines/return-series.js')) ` |
| scripts/quant/v12/indexpop/map-members.cjs | ` require(path.join(ROOT, 'core/identity.js')) ` |
| scripts/quant/v12/indexpop/map-members.cjs | ` require(path.join(ROOT, 'quant/engines/return-series.js')) ` |
| scripts/quant/v12/indexpop/qualify.cjs | ` require(path.join(ROOT, 'quant/engines/research-weekly-loader.cjs')) ` |
| scripts/quant/v12/indexpop/run-pipeline.sh | ` fetch (inventory.py, fetch_docs.py, fates.py fetch separately). ` |
| scripts/quant/v12/largecap/export-ca-frame.cjs | ` require(path.join(root, 'quant/engines/corporate-action-evidence.js')) ` |
| scripts/quant/v12/largecap/export-ca-frame.cjs | ` require(path.join(root, 'quant/engines/research-weekly-loader.cjs')) ` |
| scripts/quant/v12/largecap/qualify-sets.cjs | ` require(path.join(ROOT, 'quant/engines/research-weekly-loader.cjs')) ` |
| scripts/quant/v12/mcap/classify.cjs | ` require(ROOT + '/quant/engines/research-pit-market-cap.cjs') ` |
| scripts/quant/v12/mcap/panel.cjs | ` require(F.ROOT + '/quant/engines/research-pit-market-cap.cjs') ` |
| scripts/quant/v12/mcap/review-correction.cjs | ` require(path.join(ROOT, 'scripts/quant/v10/factor/panel.cjs')) ` |
| scripts/quant/v12/mcap/winners-preload.cjs | ` require(ROOT + '/scripts/quant/v10/studies/common.cjs') ` |
| scripts/quant/v12/mcap/winners-preload.cjs | ` require(ROOT + '/scripts/quant/v10/factor/factors.cjs') ` |
| scripts/quant/v12/mcap/winners-preload.cjs | ` require(ROOT + '/scripts/quant/v10/factor/common.cjs') ` |
| scripts/quant/v12/mcap/winners-preload.cjs | ` require(ROOT + '/quant/engines/research-pit-market-cap.cjs') ` |
| scripts/quant/v12/requal/lib.cjs | ` require(ROOT + '/quant/engines/research-index-population.cjs') ` |
| scripts/quant/v12/requal/lib.cjs | ` require(ROOT + '/quant/engines/research-listing-lifecycle.cjs').records, cases = [] ` |
| scripts/quant/v12/requal/p5a-population.cjs | ` require(L.ROOT + '/scripts/quant/v10/studies/common.cjs') ` |
| scripts/quant/v12/requal/p5b-signals.cjs | ` require(L.ROOT + '/scripts/quant/v10/studies/common.cjs') ` |
| scripts/quant/v12/requal/p5b-signals.cjs | ` require(o.p5a), p5aSha = L.shaFile(o.p5a) ` |
| scripts/quant/v12/requal/p5b-signals.cjs | ` require(L.ROOT + '/docs/quant-recovery/v11/decomposition/decomposition-results.json').A1_decomposition.cells ` |
| scripts/quant/v12/requal/p5c-factor.cjs | ` require(L.ROOT + '/scripts/quant/v10/factor/factors.cjs') ` |
| scripts/quant/v12/requal/p5c-factor.cjs | ` require(L.ROOT + '/docs/quant-recovery/v10/factor/factor-study-1.0.0.json').table ` |
| scripts/quant/v12/requal/p5d-attribution.cjs | ` require(D('p5a-population-1.1.0.json')), b = require(D('p5b-signals-1.1.0.json')), c = require(D('p5c-factor-1.1.0.json')), s = require(D('p6-strategies-1.1.0.json')) ` |
| scripts/quant/v12/requal/p6-strategies.cjs | ` require(o.p5a) ` |
| scripts/quant/v12/spxpop/build-population.cjs | ` require(path.join(ROOT, 'scripts/quant/v12/indexpop/lib.cjs')) ` |
| scripts/quant/v12/spxpop/build-population.cjs | ` require(path.join(ROOT, 'quant/engines/research-index-population.cjs')) ` |
| scripts/quant/v12/spxpop/build-population.cjs | ` require(path.join(ROOT, 'quant/engines/return-series.js')) ` |
| scripts/quant/v12/spxpop/build-population.cjs | ` require(path.join(ROOT, 'quant/engines/research-contract.cjs')) ` |
| scripts/quant/v12/spxpop/build-population.cjs | ` require(path.join(ROOT, 'quant/engines/research-pit-market-cap.cjs')) ` |
| scripts/quant/v12/spxpop/build-population.cjs | ` require(path.join(ROOT, 'quant/engines/research-listing-lifecycle.cjs')).records ` |
| scripts/quant/v13/largecap/evaluate.cjs | ` require(path.join(ROOT, 'quant/engines/corporate-action-evidence.js')) ` |
| scripts/quant/v13/largecap/evaluate.cjs | ` require(path.join(ROOT, 'quant/engines/weekly-real-adapter.cjs')) ` |
| scripts/quant/v13/studies/lib.cjs | ` require(ROOT + '/scripts/quant/v10/studies/common.cjs') ` |
| scripts/quant/v13/studies/run-frame.cjs | ` require(W.ROOT + '/quant/engines/research-delisted-series.cjs') ` |
| scripts/quant/v13/studies/run-frame.cjs | ` require(W.ROOT + '/scripts/quant/v10/studies/signal-study.cjs') ` |
| scripts/quant/v13/studies/run-s3.cjs | ` require(W.ROOT + '/scripts/quant/v12/requal/lib.cjs') ` |
| scripts/quant/v13/studies/run-s3.cjs | ` require(W.ROOT + '/scripts/quant/v12/requal/p5a-population.cjs') ` |
| scripts/quant/v13/studies/run-s3.cjs | ` require(W.ROOT + '/quant/engines/research-delisted-series.cjs') ` |
| scripts/quant/v13/studies/run-s3.cjs | ` require(W.ROOT + '/scripts/quant/v12/requal/plan.cjs') ` |
| scripts/quant/v13b/f1w/run.cjs | ` require(W.ROOT + '/quant/engines/research-delisted-series.cjs') ` |
| scripts/quant/v13b/f1w/run.cjs | ` require(W.ROOT + '/scripts/quant/v10/studies/signal-study.cjs') ` |
| scripts/quant/v13b/f1w/run.cjs | ` require(W.ROOT + '/scripts/quant/v13/studies/run-frame.cjs') ` |
| scripts/quant/v13b/largecap-strict/evaluate-1.1.0.cjs | ` require(path.join(ROOT, 'scripts/quant/v13/largecap/evaluate.cjs')) ` |
| scripts/quant/v13b/largecap-strict/evaluate-1.1.0.cjs | ` require(path.join(ROOT, 'quant/engines/weekly-real-adapter.cjs')) ` |
| scripts/quant/v13c/lib.cjs | ` require(W.ROOT + '/quant/engines/research-delisted-series.cjs') ` |
| scripts/quant/v13c/run-frame.cjs | ` require(W.ROOT + '/scripts/quant/v10/studies/signal-study.cjs') ` |
| scripts/quant/v13c/run-frame.cjs | ` require(W.ROOT + '/scripts/quant/v13/studies/run-frame.cjs') ` |
| scripts/quant/v13c/run-s3.cjs | ` require(W.ROOT + '/scripts/quant/v12/requal/lib.cjs') ` |
| scripts/quant/v13c/run-s3.cjs | ` require(W.ROOT + '/scripts/quant/v12/requal/p5a-population.cjs') ` |
| scripts/quant/v13c/run-s3.cjs | ` require(W.ROOT + '/scripts/quant/v13/studies/run-s3.cjs') ` |
| scripts/quant/v13c/run-s3.cjs | ` require(W.ROOT + '/scripts/quant/v12/requal/plan.cjs') ` |
| scripts/quant/v9-followups/ca-registry/before-after.cjs | ` require(path.join(root, 'quant/engines/research-weekly-loader.cjs')) ` |
| scripts/quant/v9-followups/ca-registry/before-after.cjs | ` require(path.join(root, 'quant/engines/research-ca-evidence.cjs')) ` |
| scripts/quant/v9-followups/ca-registry/export-frame.cjs | ` require(path.join(root, 'quant/engines/corporate-action-evidence.js')) ` |
| scripts/quant/v9-followups/ca-registry/export-frame.cjs | ` require(path.join(root, 'quant/engines/research-weekly-loader.cjs')) ` |
| scripts/quant/v9-followups/ca-registry/export-frame.cjs | ` require(path.join(root, 'quant/engines/research-identity-evidence.cjs')) ` |
| scripts/quant/v9-followups/identity/before-after.cjs | ` require(enginePath) ` |
| scripts/quant/v9-followups/identity/before-after.cjs | ` require(path.join(root, 'quant/engines/research-weekly-loader.cjs')) ` |
| scripts/quant/v9-followups/identity/before-after.cjs | ` require(path.join(root, 'quant/engines/research-identity-evidence.cjs')) ` |
| scripts/quant/v9-followups/ledger/build_before_after.cjs | ` require(path.join(ROOT, 'quant/engines/research-contract.cjs')) ` |
| scripts/quant/v9-followups/ledger/build_before_after.cjs | ` require(path.join(ROOT, 'quant/engines/research-portfolio.cjs')) ` |
| scripts/quant/v9-followups/ledger/build_before_after.cjs | ` require(path.resolve(arg('old-engine'))) ` |
| scripts/quant/v9-followups/ledger/run_ca_ledger.cjs | ` require(path.join(ROOT, 'quant/engines/research-portfolio.cjs')) ` |
| scripts/quant/v9-followups/ledger/run_ca_ledger.cjs | ` require(path.join(ROOT, 'quant/engines/research-contract.cjs')) ` |
| scripts/quant/v9-followups/ledger/run_ca_ledger.cjs | ` require(path.join(ROOT, 'quant/engines/realtime/trading-session.js')) ` |
| scripts/quant/v9-followups/ledger/run_ca_ledger.cjs | ` require(path.join(ROOT, 'quant/engines/return-series.js')) ` |
| scripts/quant/v9-followups/ledger/run_ca_ledger.cjs | ` require(path.resolve(arg('old-engine'))) ` |
| scripts/quant/v9-followups/ledger/v8_node_shim.cjs | ` require(path.resolve(process.env.ENGINE)) ` |
| scripts/quant/v9/corporate-actions/proposal_dryrun.cjs | ` require(path.join(ROOT, 'quant/engines/weekly-real-adapter.cjs')) ` |
| scripts/quant/v9/corporate-actions/proposal_dryrun.cjs | ` require(path.join(ROOT, 'quant/engines/corporate-action-evidence.js')) ` |
| scripts/quant/v9/corporate-actions/triage.cjs | ` require(path.join(ROOT, 'quant/engines/weekly-real-adapter.cjs')) ` |
| scripts/quant/v9/corporate-actions/triage.cjs | ` require(path.join(ROOT, 'quant/engines/corporate-action-evidence.js')) ` |
| scripts/quant/v9/events/harvest_8k_items.py | ` fetch(out): ` |
| scripts/quant/v9/events/harvest_8k_items.py | ` fetch(o) if a.phase == 'fetch' else parse(o) ` |
| scripts/quant/v9/events/population.cjs | ` require(path.join(ROOT, 'quant/engines/weekly-real-adapter.cjs')) ` |
| scripts/quant/v9/events/run-v9-events.cjs | ` require(path.join(ROOT, 'quant/engines/research-studies.cjs')) ` |
| scripts/quant/v9/events/run-v9-events.cjs | ` require(path.join(ROOT, 'quant/engines/research-validation.cjs')) ` |
| scripts/quant/v9/events/run-v9-events.cjs | ` require(path.join(ROOT, 'quant/engines/research-contract.cjs')) ` |
| scripts/quant/v9/events/run-v9-events.cjs | ` require(path.join(ROOT, 'quant/engines/realtime/trading-session.js')) ` |
| scripts/quant/v9/identity/dry-run-qualification.cjs | ` require(path.join(root, 'quant/engines/weekly-real-adapter.cjs')) ` |
| scripts/quant/v9/identity/reproduce-weekly-reasons.cjs | ` require(path.join(root, 'quant/engines/weekly-real-adapter.cjs')) ` |
| scripts/quant/v9/portfolio/run_ledger.cjs | ` require(path.join(ROOT, 'quant/engines/research-portfolio.cjs')) ` |
| scripts/quant/v9/portfolio/run_ledger.cjs | ` require(path.join(ROOT, 'quant/engines/research-contract.cjs')) ` |
| scripts/quant/v9/portfolio/run_ledger.cjs | ` require(path.join(ROOT, 'quant/engines/realtime/trading-session.js')) ` |
| scripts/quant/v9/portfolio/run_ledger.cjs | ` require(path.join(ROOT, 'quant/engines/return-series.js')) ` |
| scripts/quant/v9/portfolio/run_terminal_ledger.cjs | ` require(path.join(ROOT, 'quant/engines/research-portfolio.cjs')) ` |
| scripts/quant/v9/portfolio/run_terminal_ledger.cjs | ` require(path.join(ROOT, 'quant/engines/research-contract.cjs')) ` |
| scripts/quant/v9/portfolio/run_terminal_ledger.cjs | ` require(path.join(ROOT, 'quant/engines/realtime/trading-session.js')) ` |
| scripts/quant/v9/secpit/impact.mjs | ` require(join(ROOT, "quant/engines/fundamental-inputs.js")) ` |
| scripts/quant/v9/secpit/impact.mjs | ` require(join(ROOT, "quant/engines/pit-fundamental-history.js")) ` |
| scripts/quant/v9/sensitivity/run-v9-sensitivity.cjs | ` require(ROOT + '/quant/engines/research-contract.cjs'), A = require(ROOT + '/quant/engines/weekly-real-adapter.cjs') ` |
| scripts/quant/v9/sensitivity/run-v9-sensitivity.cjs | ` require(ROOT + '/quant/engines/research-studies.cjs'), V = require(ROOT + '/quant/engines/research-validation.cjs'), B = require(ROOT + '/quant/engines/weekly-benchmark ` |
| scripts/quant/v9_followups/sec_pipeline/before-after.mjs | ` require(join(ROOT, "quant/engines/fundamental-inputs.js")) ` |
| scripts/quant/v9_followups/sec_pipeline/before-after.mjs | ` require(join(ROOT, "quant/engines/market-cap.js")) ` |
| scripts/quant/v9_followups/sec_pipeline/verify_quarantine_detection.py | ` require(process.argv[1]) ` |
| scripts/quant/verify-golden-five-backtest-readiness.mjs | ` require(join(root, "core", "identity.js")) ` |
| scripts/quant/verify-golden-five-backtest-readiness.mjs | ` require(join(root, "providers", "sec", "adapter.js")) ` |
| scripts/research/edge/edge-quant.test.cjs | ` require(path.join(ROOT, 'quant/engines/portfolio-backtest.cjs')) ` |
| scripts/research/edge/quant-e3.cjs | ` require(path.join(ROOT, 'quant/engines/research-portfolio.cjs')) ` |
| scripts/research/edge/quant-e3.cjs | ` require(path.join(ROOT, 'quant/engines/backtest-metrics.cjs')) ` |
| scripts/research/edge/quant-e3.cjs | ` require(path.join(ROOT, 'quant/engines/portfolio-pit-factors.cjs')) ` |
| scripts/research/edge/quant-e3.cjs | ` require(path.join(ROOT, 'quant/engines/portfolio-construction.cjs')) ` |
| scripts/research/edge/quant-e3.cjs | ` require(path.join(ROOT, 'quant/engines/portfolio-backtest.cjs')) ` |
| scripts/research/edge/run-e3.cjs | ` require(path.join(ROOT, 'vorsorge/engines/series-codec.js')) ` |
| scripts/research/edge/run-e3.cjs | ` require(path.join(ROOT, 'scripts/quant/portfolio/model-portfolios.cjs')) ` |
| scripts/research/edge/run-e3.cjs | ` require(path.join(ROOT, 'vorsorge/engines/series-codec.js')) ` |
| scripts/research/edge/st-e3.cjs | ` require(path.resolve(__dirname, '../../../quant/engines/portfolio-construction.cjs')) ` |
| scripts/research/edge2/blind.cjs | ` require(path.join(ROOT, 'quant/engines/portfolio-pit-factors.cjs')) ` |
| scripts/research/edge2/blind.cjs | ` require(path.join(ROOT, 'quant/engines/portfolio-construction.cjs')) ` |
| scripts/research/edge2/blind.cjs | ` require(path.join(ROOT, 'quant/engines/research-portfolio.cjs')) ` |
| scripts/research/edge2/dna.cjs | ` require(path.join(ROOT, 'quant/engines/portfolio-pit-factors.cjs')) ` |
| scripts/research/edge2/dna.cjs | ` require(path.join(ROOT, 'quant/engines/portfolio-construction.cjs')) ` |
| scripts/research/edge2/dna.cjs | ` require(path.join(ROOT, 'quant/engines/portfolio-backtest.cjs')) ` |
| scripts/research/edge2/dna.cjs | ` require(path.join(ROOT, 'quant/engines/research-portfolio.cjs')) ` |
| scripts/research/edge2/edge2.cjs | ` require(path.join(ROOT, 'quant/engines/portfolio-construction.cjs')) ` |
| scripts/research/edge2/edge2.cjs | ` require(path.join(ROOT, 'quant/engines/portfolio-backtest.cjs')) ` |
| scripts/research/edge2/edge2.cjs | ` require(path.join(ROOT, 'quant/engines/research-portfolio.cjs')) ` |
| scripts/research/edge2/ki-export.cjs | ` require(path.join(ROOT, 'quant/engines/published-close.js')) ` |
| scripts/research/edge2/ki-forward.cjs | ` require(path.join(ROOT, 'quant/engines/published-close.js')) ` |
| scripts/research/edge2/ki-forward.cjs | ` require(path.join(ROOT, 'scripts/quant/portfolio/model-portfolios.cjs')), MD = require(path.join(ROOT, 'scripts/quant/portfolio/model-depots.cjs')) ` |
| scripts/research/edge2/paper.cjs | ` require(path.join(ROOT, 'scripts/quant/portfolio/model-portfolios.cjs')), MD = require(path.join(ROOT, 'scripts/quant/portfolio/model-depots.cjs')) ` |
| scripts/research/edge2/paper.cjs | ` import(path.join(ROOT, 'scripts/research/signals/study.mjs')).then(S1 => { ` |
| scripts/research/edge2/paper.cjs | ` require(path.join(ROOT, 'quant/engines/technical/trade-setup.js')) }) ` |
| scripts/research/edge2/run-blind.cjs | ` require(path.join(ROOT, 'quant/engines/portfolio-backtest.cjs')) ` |
| scripts/research/edge2/run-blind.cjs | ` require(path.join(ROOT, 'quant/engines/portfolio-construction.cjs')) ` |
| scripts/research/edge2/run-blind.cjs | ` import(path.join(ROOT, 'scripts/supertrader/validation/lib.mjs')) ` |
| scripts/research/edge2/run-blind.cjs | ` import(path.join(ROOT, 'scripts/market/storage/s3-driver.mjs')) ` |
| scripts/research/edge2/run-blind.cjs | ` require(path.join(ROOT, 'scripts/quant/portfolio/model-portfolios.cjs')) ` |
| scripts/research/edge2/run-dna.cjs | ` require(path.join(ROOT, 'scripts/quant/portfolio/model-portfolios.cjs')), E3 = require('../edge/run-e3.cjs') ` |
| scripts/research/edge2/run-dna.cjs | ` import(path.join(ROOT, 'scripts/supertrader/validation/lib.mjs')) ` |
| scripts/research/edge2/run-edge2.cjs | ` require(path.join(ROOT, 'scripts/quant/portfolio/model-portfolios.cjs')) ` |
| scripts/research/edge2/run-edge2.cjs | ` require(path.join(ROOT, 'quant/engines/research-delisted-series.cjs')) ` |
| scripts/research/edge2/run-edge2.cjs | ` require(path.join(ROOT, 'scripts/quant/portfolio/model-portfolios.cjs')), E3 = require('../edge/run-e3.cjs') ` |
| scripts/research/edge2/run-edge2.cjs | ` import(path.join(ROOT, 'scripts/research/signals/study.mjs')) ` |
| scripts/research/edge2/run-edge2.cjs | ` require(path.join(ROOT, 'quant/engines/technical/trade-setup.js')) ` |
| scripts/research/edge2/run-edge2.cjs | ` import(path.join(ROOT, 'scripts/supertrader/validation/lib.mjs')) ` |
| scripts/research/holdout/combine.mjs | ` import(path.join(ROOT, 'scripts/supertrader/validation/lib.mjs')) ` |
| scripts/research/holdout/holdout.test.cjs | ` import(path.join(ROOT, 'scripts/supertrader/source-faithful/research/run-st-holdout.mjs')) ` |
| scripts/research/holdout/holdout.test.cjs | ` import(path.join(__dirname, 'ledger.mjs')) ` |
| scripts/research/holdout/holdout.test.cjs | ` import(path.join(ROOT, 'scripts/supertrader/source-faithful/research/run-st-holdout.mjs')) ` |
| scripts/research/holdout/holdout.test.cjs | ` import(path.join(__dirname, 'combine.mjs')) ` |
| scripts/research/holdout/quant-holdout.cjs | ` import(path.join(ROOT, 'scripts/research/holdout/ledger.mjs')) ` |
| scripts/research/holdout/quant-holdout.cjs | ` import(path.join(ROOT, 'scripts/market/storage/s3-driver.mjs')) ` |
| scripts/research/holdout/quant-holdout.cjs | ` require(path.join(ROOT, 'scripts/quant/portfolio/model-portfolios.cjs')), E3 = require('../edge/run-e3.cjs') ` |
| scripts/research/holdout/quant-holdout.cjs | ` import(path.join(ROOT, 'scripts/supertrader/validation/lib.mjs')) ` |
| scripts/research/labor/build-insider.mjs | ` require(path.join(ROOT, 'quant/engines/ownership-signals.js')) ` |
| scripts/research/labor/build-insider.mjs | ` import(path.join(ROOT, 'scripts/market/build-ownership-signals.mjs')) ` |
| scripts/research/labor/etf-engine.cjs | ` require(path.join(ROOT, 'vorsorge/engines/series-codec.js')) ` |
| scripts/research/labor/run-labor.cjs | ` require(path.join(ROOT, 'scripts/quant/portfolio/model-portfolios.cjs')) ` |
| scripts/research/labor/run-labor.cjs | ` require(path.join(ROOT, 'scripts/research/edge/quant-e3.cjs')) ` |
| scripts/research/labor/run-labor.cjs | ` require(path.join(ROOT, 'vorsorge/engines/series-codec.js')) ` |
| scripts/research/labor/signals.cjs | ` require(path.join(ROOT, 'quant/engines/portfolio-pit-factors.cjs')) ` |
| scripts/research/labor/stats.cjs | ` require(path.join(__dirname, '../edge/study.cjs')) ` |
| scripts/research/labor/stock-engine.cjs | ` require(path.join(ROOT, 'quant/engines/research-portfolio.cjs')) ` |
| scripts/research/labor/stock-engine.cjs | ` require(path.join(ROOT, 'quant/engines/portfolio-construction.cjs')) ` |
| scripts/research/labor/stock-engine.cjs | ` require(path.join(ROOT, 'quant/engines/portfolio-pit-factors.cjs')) ` |
| scripts/research/labor/stock-engine.cjs | ` require(path.join(ROOT, 'scripts/research/edge/quant-e3.cjs')) ` |
| scripts/screener/browser-qa.mjs | ` require(process.env.PLAYWRIGHT_PATH &#124;&#124; '/opt/node22/lib/node_modules/playwright') ` |
| scripts/social/approval-center-readiness.mjs | ` require(join(ROOT, "social/engines/owner-decision.js")) ` |
| scripts/social/assert-no-secrets.mjs | ` require(join(ROOT, "social/engines/provider.js")) ` |
| scripts/social/assess-creative-quality.mjs | ` require(join(ROOT, "social/engines/story-selection.js")) ` |
| scripts/social/assess-creative-quality.mjs | ` require(join(ROOT, "social/engines/creative-quality.js")) ` |
| scripts/social/assess-creative-quality.mjs | ` require(join(ROOT, "social/engines/score-decomposition.js")) ` |
| scripts/social/asset-hashtag-done.mjs | ` require(join(ROOT, "social/engines/hashtags.js")) ` |
| scripts/social/asset-hashtag-done.mjs | ` require(join(ROOT, "social/engines/content-ladder.js")) ` |
| scripts/social/asset-hashtag-done.mjs | ` require(join(ROOT, "social/engines/owner-decision.js")) ` |
| scripts/social/asset-hashtag-done.mjs | ` require(join(ROOT, "social/engines/approval-projection.js")) ` |
| scripts/social/asset-hashtag-done.mjs | ` fetch(WORKER + pfad, { method: "GET" }) ` |
| scripts/social/backfill-account-memory.mjs | ` require(join(ROOT, "social/engines/evidence-regime.js")) ` |
| scripts/social/build-opportunity-slate.mjs | ` require(join(ROOT, "social/engines/content-universe.js")) ` |
| scripts/social/build-opportunity-slate.mjs | ` require(join(ROOT, "social/engines/discover-evidence.js")) ` |
| scripts/social/build-opportunity-slate.mjs | ` require(join(ROOT, "social/engines/signals.js")) ` |
| scripts/social/build-opportunity-slate.mjs | ` require(join(ROOT, "social/engines/german-text.js")) ` |
| scripts/social/build-opportunity-slate.mjs | ` require(join(ROOT, "social/engines/fact-check.js")) ` |
| scripts/social/build-research-package.mjs | ` require(join(ROOT, "social/engines/research-package.js")) ` |
| scripts/social/build-research-package.mjs | ` fetch(url, { signal: controller.signal, redirect: "follow", ` |
| scripts/social/check-asset-reachability.mjs | ` require(join(ROOT, "social/engines/asset-delivery.js")) ` |
| scripts/social/check-asset-reachability.mjs | ` fetch(url, { method: "GET", redirect: "manual" }) ` |
| scripts/social/check-hard-invariants.mjs | ` require(join(ROOT, "social/engines/hard-invariants.js")) ` |
| scripts/social/check-hard-invariants.mjs | ` require(join(ROOT, "social/engines/source-registry.js")) ` |
| scripts/social/check-hard-invariants.mjs | ` require(join(ROOT, "social/engines/creative-job.js")) ` |
| scripts/social/check-hard-invariants.mjs | ` import(     join(ROOT, "workers/vision-universe-social/src/index.js"))).default ` |
| scripts/social/check-hard-invariants.mjs | ` fetch(new Request( ` |
| scripts/social/creative-job-report.mjs | ` require(join(ROOT, "social/engines/creative-job.js")) ` |
| scripts/social/decide-candidate.mjs | ` require(join(ROOT, "social/engines/content-hash.js")) ` |
| scripts/social/decide-candidate.mjs | ` require(join(ROOT, "social/engines/owner-decision.js")) ` |
| scripts/social/diagnose-creative-provider.mjs | ` require(join(ROOT, "social/providers/authoring/chatgpt-work/adapter.js")) ` |
| scripts/social/discover-creators.mjs | ` require(join(ROOT, "social/engines/creator-universe.js")) ` |
| scripts/social/discover-creators.mjs | ` require(join(ROOT, "social/engines/youtube-source.js")) ` |
| scripts/social/discover-creators.mjs | ` require(join(ROOT, "social/engines/youtube-query-portfolio.js")) ` |
| scripts/social/discover-creators.mjs | ` fetch(url, { headers: { "X-goog-api-key": key } }) ` |
| scripts/social/dispatch-creative-job.mjs | ` require(join(ROOT, "social/engines/creative-job.js")) ` |
| scripts/social/dispatch-creative-job.mjs | ` require(join(ROOT, "social/providers/authoring/chatgpt-work/adapter.js")) ` |
| scripts/social/dispatch-publications.mjs | ` require(join(ROOT, "social/engines/publishing.js")) ` |
| scripts/social/dispatch-publications.mjs | ` require(join(ROOT, "social/engines/autonomy.js")) ` |
| scripts/social/dispatch-publications.mjs | ` require(join(ROOT, "social/engines/kill-switch.js")) ` |
| scripts/social/enrich-youtube-metrics.mjs | ` require(join(ROOT, "social/engines/youtube-source.js")) ` |
| scripts/social/enrich-youtube-metrics.mjs | ` require(join(ROOT, "social/engines/external-patterns.js")) ` |
| scripts/social/enrich-youtube-metrics.mjs | ` require(join(ROOT, "social/engines/external-intelligence.js")) ` |
| scripts/social/enrich-youtube-metrics.mjs | ` fetch(url, { headers: { "X-goog-api-key": key } }) ` |
| scripts/social/fetch-meta-status.mjs | ` fetch(workerUrl + path, { ` |
| scripts/social/ig-reel.mjs | ` fetch(req.url, { method: req.method, headers: Object.assign({ authorization: "Bearer " + key }, ` |
| scripts/social/ig.mjs | ` fetch(url, { headers: { authorization: "Bearer " + key } }) ` |
| scripts/social/ingest-creative.mjs | ` require(join(ROOT, "social/providers/authoring/chatgpt-work/adapter.js")) ` |
| scripts/social/ingest-creative.mjs | ` require(join(ROOT, "social/engines/asset-integrity.js")) ` |
| scripts/social/ingest-creative.mjs | ` require(join(ROOT, "social/engines/invocation-ledger.js")) ` |
| scripts/social/ingest-creative.mjs | ` require(join(ROOT, "social/engines/creative-contract.js")) ` |
| scripts/social/ingest-creative.mjs | ` require(join(ROOT, "social/engines/creative-job.js")) ` |
| scripts/social/ingest-external-observation.mjs | ` require(join(ROOT, "social/engines/external-intelligence.js")) ` |
| scripts/social/ingest-external-observation.mjs | ` require(join(ROOT, "social/engines/hashtag-portfolio.js")) ` |
| scripts/social/ingest-external-observation.mjs | ` require(join(ROOT, "social/engines/external-patterns.js")) ` |
| scripts/social/ingest-open-creative-jobs.mjs | ` require(join(ROOT, "social/engines/creative-job.js")) ` |
| scripts/social/ingest-owner-decisions.mjs | ` fetch(WORKER + "/social/approval/decisions", { ` |
| scripts/social/ingest-performance.mjs | ` require(join(ROOT, "social/engines/schema.js")) ` |
| scripts/social/ingest-performance.mjs | ` require(join(ROOT, "social/engines/measurement-window.js")) ` |
| scripts/social/make-carousel-candidates.mjs | ` require(join(ROOT, "social/engines/content-hash.js")) ` |
| scripts/social/make-carousel-candidates.mjs | ` require(join(ROOT, "social/engines/style-references.js")) ` |
| scripts/social/make-carousel-candidates.mjs | ` require(join(ROOT, "quant/engines/hash.js")) ` |
| scripts/social/make-carousel-candidates.mjs | ` require(join(ROOT, "social/engines/creative-gate.js")) ` |
| scripts/social/make-carousel-candidates.mjs | ` require(join(ROOT, "social/providers/authoring/chatgpt-work/adapter.js")) ` |
| scripts/social/make-carousel-candidates.mjs | ` require(join(ROOT, "social/engines/creative-contract.js")) ` |
| scripts/social/make-carousel-candidates.mjs | ` require(join(ROOT, "social/config/cadence.json")) ` |
| scripts/social/make-publish-candidate.mjs | ` require(join(ROOT, "social/engines/content-hash.js")) ` |
| scripts/social/make-publish-candidate.mjs | ` require(join(ROOT, "social/engines/hashtags.js")) ` |
| scripts/social/make-publish-candidate.mjs | ` require(join(ROOT, "social/engines/owner-decision.js")) ` |
| scripts/social/make-publish-candidate.mjs | ` require(join(ROOT, "quant/engines/hash.js")) ` |
| scripts/social/make-publish-candidate.mjs | ` require(join(ROOT, "social/engines/creative-gate.js")) ` |
| scripts/social/make-publish-candidate.mjs | ` require(join(ROOT, "social/engines/manual-mode.js")) ` |
| scripts/social/make-test-asset.mjs | ` fetch(       "https://fonts.googleapis.com/css2?family=Inter:wght@400 ` |
| scripts/social/make-test-asset.mjs | ` fetch(url).then((r) => r.arrayBuffer())) ` |
| scripts/social/manual-now-web-candidate.mjs | ` require(join(ROOT, "social/engines/content-hash.js")) ` |
| scripts/social/manual-now-web-candidate.mjs | ` require(join(ROOT, "social/engines/owner-decision.js")) ` |
| scripts/social/manual-now-web-candidate.mjs | ` require(join(ROOT, "quant/engines/hash.js")) ` |
| scripts/social/manual-now-web-candidate.mjs | ` require(join(ROOT, "social/engines/creative-gate.js")) ` |
| scripts/social/manual-now-web-candidate.mjs | ` require(join(ROOT, "social/providers/authoring/chatgpt-work/adapter.js")) ` |
| scripts/social/manual-now-web-candidate.mjs | ` require(join(ROOT, "social/config/cadence.json")) ` |
| scripts/social/open-creative-request.mjs | ` require(join(ROOT, "social/engines/creative-job.js")) ` |
| scripts/social/open-creative-request.mjs | ` require(join(ROOT, "social/providers/authoring/chatgpt-work/adapter.js")) ` |
| scripts/social/order-d-done.mjs | ` require(join(ROOT, "social/engines/hard-invariants.js")) ` |
| scripts/social/order-d-done.mjs | ` require(join(ROOT, "social/engines/no-post.js")) ` |
| scripts/social/order-d-done.mjs | ` require(join(ROOT, "social/engines/run-lease.js")) ` |
| scripts/social/order-d-done.mjs | ` require(join(ROOT, "social/engines/frequency-learning.js")) ` |
| scripts/social/order-d-done.mjs | ` fetch(WORKER + pfad, init) ` |
| scripts/social/plan-hashtag-observation.mjs | ` require(join(ROOT, "social/engines/hashtag-portfolio.js")) ` |
| scripts/social/preflight-worker.mjs | ` fetch(request, ` |
| scripts/social/preflight-worker.mjs | ` fetch(API + path, Object.assign({ ` |
| scripts/social/product-proof.mjs | ` require(join(ROOT, "social/engines/brand.js")) ` |
| scripts/social/product-proof.mjs | ` require(join(ROOT, "social/engines/visual-grammar.js")) ` |
| scripts/social/product-proof.mjs | ` require(join(ROOT, "social/engines/scroll-stop.js")) ` |
| scripts/social/product-proof.mjs | ` require(join(ROOT, "social/engines/content.js")) ` |
| scripts/social/product-proof.mjs | ` require(join(ROOT, "social/engines/hashtags.js")) ` |
| scripts/social/product-proof.mjs | ` require(join(ROOT, "social/engines/learning-unit.js")) ` |
| scripts/social/product-proof.mjs | ` require(join(ROOT, "social/engines/audience-frame.js")) ` |
| scripts/social/product-proof.mjs | ` require(   join(ROOT, "social/engines/visual-intelligence.js")) ` |
| scripts/social/product-proof.mjs | ` require(   join(ROOT, "social/engines/visual-composition.js")) ` |
| scripts/social/production-readiness.mjs | ` require(join(ROOT, "social/engines/production-readiness.js")) ` |
| scripts/social/production-readiness.mjs | ` require(join(ROOT, "social/engines/source-registry.js")) ` |
| scripts/social/production-readiness.mjs | ` require(join(ROOT, "social/engines/orchestrator.js")) ` |
| scripts/social/production-readiness.mjs | ` require(join(ROOT, "social/engines/visual-intelligence.js")) ` |
| scripts/social/production-readiness.mjs | ` require(join(ROOT, "social/engines/visual-quality.js")) ` |
| scripts/social/production-readiness.mjs | ` require(join(ROOT, "social/engines/creative-job.js")) ` |
| scripts/social/production-readiness.mjs | ` require(join(ROOT, "social/engines/own-performance.js")) ` |
| scripts/social/production-readiness.mjs | ` require(join(ROOT, "social/engines/schema.js")) ` |
| scripts/social/production-readiness.mjs | ` require(join(ROOT, "social/engines/learning.js")) ` |
| scripts/social/production-readiness.mjs | ` require(join(ROOT, "social/engines/owner-decision.js")) ` |
| scripts/social/production-readiness.mjs | ` import(${JSON.stringify(join(ROOT, pfad))}) ` |
| scripts/social/prove-loop-closure.mjs | ` require(join(ROOT, "social/engines/evidence-regime.js")) ` |
| scripts/social/provision-cloudflare.mjs | ` fetch(API + path, Object.assign({ ` |
| scripts/social/publish-approval-queue.mjs | ` require(join(ROOT, "social/engines/owner-decision.js")) ` |
| scripts/social/publish-approval-queue.mjs | ` require(join(ROOT, "social/engines/approval-projection.js")) ` |
| scripts/social/publish-approval-queue.mjs | ` require(join(ROOT, "social/engines/asset-delivery.js")) ` |
| scripts/social/publish-approval-queue.mjs | ` require(join(ROOT, "social/engines/content-hash.js")) ` |
| scripts/social/publish-approval-queue.mjs | ` require(join(ROOT, "social/engines/hashtags.js")) ` |
| scripts/social/publish-approval-queue.mjs | ` fetch(url, { method: "GET", redirect: "manual" }) ` |
| scripts/social/rank-social-opportunities.mjs | ` require(join(ROOT, "social/engines/opportunity.js")) ` |
| scripts/social/rank-social-opportunities.mjs | ` require(join(ROOT, "social/engines/social-opportunity.js")) ` |
| scripts/social/rank-social-opportunities.mjs | ` require(join(ROOT, "social/engines/brand.js")) ` |
| scripts/social/rank-social-opportunities.mjs | ` require(join(ROOT, "social/engines/audience-frame.js")) ` |
| scripts/social/rank-social-opportunities.mjs | ` require(join(ROOT, "social/engines/memory.js")) ` |
| scripts/social/rank-social-opportunities.mjs | ` require(join(ROOT, "social/engines/source-registry.js")) ` |
| scripts/social/rank-social-opportunities.mjs | ` require(join(ROOT, "social/engines/own-performance.js")) ` |
| scripts/social/rank-social-opportunities.mjs | ` require(join(ROOT, "social/engines/learning.js")) ` |
| scripts/social/reconcile-creative-jobs.mjs | ` require(join(ROOT, "social/engines/creative-job.js")) ` |
| scripts/social/recover-asset-transfer.mjs | ` require(join(ROOT, "social/providers/authoring/chatgpt-work/adapter.js")) ` |
| scripts/social/recover-asset-transfer.mjs | ` require(join(ROOT, "social/engines/asset-transport.js")) ` |
| scripts/social/recover-asset-transfer.mjs | ` require(join(ROOT, "social/engines/asset-integrity.js")) ` |
| scripts/social/recover-creative-request.mjs | ` require(join(ROOT, "social/providers/authoring/chatgpt-work/adapter.js")) ` |
| scripts/social/recover-creative-request.mjs | ` require(join(ROOT, "social/engines/provider-lifecycle.js")) ` |
| scripts/social/recover-creative-request.mjs | ` require(join(ROOT, "social/engines/invocation-ledger.js")) ` |
| scripts/social/render-asset.mjs | ` require(   join(dirname(fileURLToPath(import.meta.url)), "..", "..", "social/engines/visual-quality.js")) ` |
| scripts/social/render-asset.mjs | ` require(   join(dirname(fileURLToPath(import.meta.url)), "..", "..", "social/engines/visual-grammar.js")) ` |
| scripts/social/render-asset.mjs | ` require(   join(dirname(fileURLToPath(import.meta.url)), "..", "..", "social/engines/scroll-stop.js")) ` |
| scripts/social/render-asset.mjs | ` require(   join(dirname(fileURLToPath(import.meta.url)), "..", "..", "social/engines/brand.js")) ` |
| scripts/social/render-asset.mjs | ` require(   join(dirname(fileURLToPath(import.meta.url)), "..", "..", "social/engines/content-intelligence.js")) ` |
| scripts/social/render-asset.mjs | ` require(   join(dirname(fileURLToPath(import.meta.url)), "..", "..", "social/engines/visual-composition.js")) ` |
| scripts/social/request-carousel.mjs | ` require(join(ROOT, "social/providers/authoring/chatgpt-work/adapter.js")) ` |
| scripts/social/request-carousel.mjs | ` require(join(ROOT, "social/engines/invocation-ledger.js")) ` |
| scripts/social/request-carousel.mjs | ` require(join(ROOT, "social/engines/social-learnings.js")) ` |
| scripts/social/request-carousel.mjs | ` require(join(ROOT, "social/engines/brand.js")) ` |
| scripts/social/request-carousel.mjs | ` require(join(ROOT, "social/engines/style-references.js")) ` |
| scripts/social/request-creative-revision.mjs | ` require(join(ROOT, "social/providers/authoring/chatgpt-work/adapter.js")) ` |
| scripts/social/request-creative-revision.mjs | ` require(join(ROOT, "social/engines/story-selection.js")) ` |
| scripts/social/request-creative-revision.mjs | ` require(join(ROOT, "social/engines/creative-quality.js")) ` |
| scripts/social/request-creative-revision.mjs | ` require(join(ROOT, "social/engines/creative-job.js")) ` |
| scripts/social/request-creative-revision.mjs | ` require(join(ROOT, "social/engines/creative-contract.js")) ` |
| scripts/social/request-creative-revision.mjs | ` require(join(ROOT, "social/engines/authoring.js")) ` |
| scripts/social/request-creative-revision.mjs | ` require(join(ROOT, "social/engines/asset-store.js")) ` |
| scripts/social/request-creative-web.mjs | ` require(join(ROOT, "social/engines/content-brief.js")) ` |
| scripts/social/request-creative-web.mjs | ` require(join(ROOT, "social/providers/authoring/chatgpt-work/adapter.js")) ` |
| scripts/social/request-creative-web.mjs | ` require(join(ROOT, "social/engines/invocation-ledger.js")) ` |
| scripts/social/request-creative-web.mjs | ` require(join(ROOT, "social/engines/brand.js")) ` |
| scripts/social/request-creative.mjs | ` require(join(ROOT, "social/engines/evidence-package.js")) ` |
| scripts/social/request-creative.mjs | ` require(join(ROOT, "social/engines/content-brief.js")) ` |
| scripts/social/request-creative.mjs | ` require(join(ROOT, "social/providers/authoring/chatgpt-work/adapter.js")) ` |
| scripts/social/request-creative.mjs | ` require(join(ROOT, "social/engines/invocation-ledger.js")) ` |
| scripts/social/request-creative.mjs | ` require(join(ROOT, "social/engines/visual-motif.js")) ` |
| scripts/social/request-creative.mjs | ` require(join(ROOT, "social/engines/creative-job.js")) ` |
| scripts/social/research-web-story.mjs | ` require(join(ROOT, "social/engines/web-research.js")) ` |
| scripts/social/research-web-story.mjs | ` require(join(ROOT, "social/engines/rss-parse.js")) ` |
| scripts/social/research-web-story.mjs | ` fetch(quelle.url, { ` |
| scripts/social/run-orchestrator.mjs | ` require(join(ROOT, "social/engines/orchestrator.js")) ` |
| scripts/social/run-orchestrator.mjs | ` require(join(ROOT, "social/engines/source-registry.js")) ` |
| scripts/social/run-orchestrator.mjs | ` require(join(ROOT, "social/engines/measurement-window.js")) ` |
| scripts/social/run-orchestrator.mjs | ` require(join(ROOT, "social/engines/creative-job.js")) ` |
| scripts/social/run-orchestrator.mjs | ` require(join(ROOT, "social/engines/evidence-package.js")) ` |
| scripts/social/run-orchestrator.mjs | ` require(join(ROOT, "social/engines/content-cadence.js")) ` |
| scripts/social/run-orchestrator.mjs | ` require(join(ROOT, "social/engines/no-post.js")) ` |
| scripts/social/run-orchestrator.mjs | ` require(join(ROOT, "social/engines/content-ladder.js")) ` |
| scripts/social/run-orchestrator.mjs | ` require(join(ROOT, "social/engines/hard-invariants.js")) ` |
| scripts/social/run-orchestrator.mjs | ` require(join(ROOT, "social/engines/run-lease.js")) ` |
| scripts/social/run-orchestrator.mjs | ` require(join(ROOT, "social/engines/frequency-learning.js")) ` |
| scripts/social/run-orchestrator.mjs | ` require(join(ROOT, "social/engines/manual-mode.js")) ` |
| scripts/social/run-orchestrator.mjs | ` require(join(ROOT, "social/providers/authoring/chatgpt-work/adapter.js")) ` |
| scripts/social/run-orchestrator.mjs | ` require(join(ROOT, "social/engines/hook.js")) ` |
| scripts/social/run-orchestrator.mjs | ` require(join(ROOT, "social/engines/audience-frame.js")) ` |
| scripts/social/run-post-job.mjs | ` require(join(ROOT, "social/engines/post-queue.js")) ` |
| scripts/social/run-post-job.mjs | ` require(join(ROOT, "social/engines/creative-job.js")) ` |
| scripts/social/run-social-cycle.mjs | ` require(join(ROOT, "social/engines/schema.js")) ` |
| scripts/social/run-social-cycle.mjs | ` require(join(ROOT, "social/engines/strategy-memory.js")) ` |
| scripts/social/run-social-cycle.mjs | ` require(join(ROOT, "social/engines/signals.js")) ` |
| scripts/social/run-social-cycle.mjs | ` require(join(ROOT, "social/engines/trend-score.js")) ` |
| scripts/social/run-social-cycle.mjs | ` require(join(ROOT, "social/engines/opportunity.js")) ` |
| scripts/social/run-social-cycle.mjs | ` require(join(ROOT, "social/engines/strategy.js")) ` |
| scripts/social/run-social-cycle.mjs | ` require(join(ROOT, "social/engines/content.js")) ` |
| scripts/social/run-social-cycle.mjs | ` require(join(ROOT, "social/engines/visual-composition.js")) ` |
| scripts/social/run-social-cycle.mjs | ` require(join(ROOT, "social/engines/visual-intelligence.js")) ` |
| scripts/social/run-social-cycle.mjs | ` require(join(ROOT, "social/engines/learning-unit.js")) ` |
| scripts/social/run-social-cycle.mjs | ` require(join(ROOT, "social/engines/visual-grammar.js")) ` |
| scripts/social/run-social-cycle.mjs | ` require(join(ROOT, "social/engines/hook.js")) ` |
| scripts/social/run-social-cycle.mjs | ` require(join(ROOT, "social/engines/memory.js")) ` |
| scripts/social/run-social-cycle.mjs | ` require(join(ROOT, "social/engines/fatigue.js")) ` |
| scripts/social/run-social-cycle.mjs | ` require(join(ROOT, "social/engines/publishing.js")) ` |
| scripts/social/run-social-cycle.mjs | ` require(join(ROOT, "social/engines/analytics.js")) ` |
| scripts/social/run-social-cycle.mjs | ` require(join(ROOT, "social/engines/performance.js")) ` |
| scripts/social/run-social-cycle.mjs | ` require(join(ROOT, "social/engines/learning.js")) ` |
| scripts/social/run-social-cycle.mjs | ` require(join(ROOT, "social/engines/experiments.js")) ` |
| scripts/social/run-social-cycle.mjs | ` require(join(ROOT, "social/engines/evidence-regime.js")) ` |
| scripts/social/run-social-cycle.mjs | ` require(join(ROOT, "social/engines/measurement-window.js")) ` |
| scripts/social/run-social-cycle.mjs | ` require(join(ROOT, "social/engines/explain.js")) ` |
| scripts/social/run-social-cycle.mjs | ` require(join(ROOT, "social/engines/health.js")) ` |
| scripts/social/run-social-cycle.mjs | ` require(join(ROOT, "social/engines/autonomy.js")) ` |
| scripts/social/run-social-cycle.mjs | ` require(join(ROOT, "social/engines/kill-switch.js")) ` |
| scripts/social/run-social-cycle.mjs | ` require(join(ROOT, "social/engines/audit-log.js")) ` |
| scripts/social/run-social-cycle.mjs | ` require(join(ROOT, "social/engines/provider.js")) ` |
| scripts/social/run-social-cycle.mjs | ` require(join(ROOT, "social/engines/capabilities.js")) ` |
| scripts/social/run-social-cycle.mjs | ` require(join(ROOT, "social/engines/brand.js")) ` |
| scripts/social/run-social-cycle.mjs | ` require(join(ROOT, "social/engines/authoring.js")) ` |
| scripts/social/run-social-cycle.mjs | ` require(join(ROOT, "social/engines/content-brief.js")) ` |
| scripts/social/run-social-cycle.mjs | ` require(join(ROOT, "social/engines/evidence-package.js")) ` |
| scripts/social/run-social-cycle.mjs | ` require(join(ROOT, "social/providers/authoring/template/adapter.js")) ` |
| scripts/social/run-social-cycle.mjs | ` require(join(ROOT, "social/providers/authoring/model/adapter.js")) ` |
| scripts/social/run-social-cycle.mjs | ` require(join(ROOT, "social/providers/authoring/chatgpt-work/adapter.js")) ` |
| scripts/social/run-social-cycle.mjs | ` require(join(ROOT, "social/engines/provider-lifecycle.js")) ` |
| scripts/social/run-social-cycle.mjs | ` require(join(ROOT, "social/engines/creative-contract.js")) ` |
| scripts/social/run-social-cycle.mjs | ` require(join(ROOT, "social/engines/audience-fit.js")) ` |
| scripts/social/run-social-cycle.mjs | ` require(join(ROOT, "social/engines/audience-frame.js")) ` |
| scripts/social/run-social-cycle.mjs | ` require(join(ROOT, "social/engines/content-ladder.js")) ` |
| scripts/social/run-social-cycle.mjs | ` require(join(ROOT, "social/engines/learning-dimensions.js")) ` |
| scripts/social/run-social-cycle.mjs | ` require(join(ROOT, "social/engines/content-universe.js")) ` |
| scripts/social/run-social-cycle.mjs | ` require(join(ROOT, "social/engines/invocation-ledger.js")) ` |
| scripts/social/run-social-cycle.mjs | ` require(join(ROOT, "social/engines/creative-job.js")) ` |
| scripts/social/run-social-cycle.mjs | ` require(join(ROOT, "social/providers/mock/adapter.js")) ` |
| scripts/social/run-social-cycle.mjs | ` require(join(ROOT, "social/providers/meta/adapter.js")) ` |
| scripts/social/social-os-ready.mjs | ` require(join(ROOT, "social/engines/product-readiness.js")) ` |
| scripts/social/social-os-ready.mjs | ` require(join(ROOT, "social/engines/visual-intelligence.js")) ` |
| scripts/social/social-os-ready.mjs | ` require(join(ROOT, pfad)) ` |
| scripts/social/social-os-ready.mjs | ` require(join(ROOT, "social/engines/content.js")) ` |
| scripts/social/social-os-ready.mjs | ` require(join(ROOT, "social/engines/audience-frame.js")) ` |
| scripts/social/social-os-ready.mjs | ` require(join(ROOT, pfad)) ` |
| scripts/social/social-os-ready.mjs | ` require(join(ROOT, "social/engines/content.js")) ` |
| scripts/social/social-os-ready.mjs | ` require(join(ROOT, pfad)) ` |
| scripts/social/social-os-ready.mjs | ` import("file://" + join(ROOT, "scripts/social/render-asset.mjs")) ` |
| scripts/social/social-os-ready.mjs | ` require(join(ROOT, pfad)) ` |
| scripts/social/social-os-ready.mjs | ` import(     "file://" + join(ROOT, "scripts/social/render-asset.mjs")) ` |
| scripts/social/social-os-ready.mjs | ` require(join(ROOT, pfad)) ` |
| scripts/social/social-os-ready.mjs | ` require(join(ROOT, "social/engines/content-cadence.js")) ` |
| scripts/social/social-os-ready.mjs | ` require(join(ROOT, "social/engines/orchestrator.js")) ` |
| scripts/social/social-os-ready.mjs | ` require(join(ROOT, "social/engines/content-cadence.js")) ` |
| scripts/social/social-os-ready.mjs | ` require(join(ROOT, pfad)) ` |
| scripts/social/social-os-ready.mjs | ` require(join(ROOT, "social/engines/content.js")) ` |
| scripts/social/social-os-ready.mjs | ` require(join(ROOT, "social/engines/memory.js")) ` |
| scripts/social/store-asset.mjs | ` require(join(ROOT, "social/engines/asset-store.js")) ` |
| scripts/social/store-asset.mjs | ` require(join(ROOT, "social/providers/authoring/chatgpt-work/adapter.js")) ` |
| scripts/social/sync-creative-invocations.mjs | ` require(join(ROOT, "social/engines/invocation-ledger.js")) ` |
| scripts/social/sync-creative-invocations.mjs | ` require(join(ROOT, "social/engines/provider-lifecycle.js")) ` |
| scripts/social/verify-approval-center.mjs | ` fetch(WORKER + pfad, Object.assign({ redirect: "manual" }, init)) ` |
| scripts/social/verify-creative-dispatch.mjs | ` require(join(ROOT, "social/engines/creative-job.js")) ` |
| scripts/social/verify-hashtag-access.mjs | ` require(join(ROOT, "social/engines/hashtag-access.js")) ` |
| scripts/social/verify-hashtag-access.mjs | ` require(join(ROOT, "social/engines/hashtag-portfolio.js")) ` |
| scripts/social/verify-hashtag-access.mjs | ` fetch(WORKER + pfad, { ` |
| scripts/social/verify-manual-dispatch.mjs | ` fetch(WORKER + pfad, Object.assign({ redirect: "manual" }, init)) ` |
| scripts/social/verify-meta-capabilities.mjs | ` require(join(ROOT, "social/providers/meta/adapter.js")) ` |
| scripts/social/verify-meta-capabilities.mjs | ` require(join(ROOT, "social/engines/capabilities.js")) ` |
| scripts/social/verify-revision-result.mjs | ` require(join(ROOT, "social/providers/authoring/chatgpt-work/adapter.js")) ` |
| scripts/social/verify-revision-result.mjs | ` require(join(ROOT, "social/engines/creative-contract.js")) ` |
| scripts/social/verify-revision-result.mjs | ` require(join(ROOT, "social/engines/asset-store.js")) ` |
| scripts/social/verify-worker.mjs | ` fetch(baseUrl + path, Object.assign({ redirect: "manual" }, init)) ` |
| scripts/social/verify-worker.mjs | ` fetch(bildUrl, { method: "HEAD", redirect: "follow" }) ` |
| scripts/supertrader/house/live.mjs | ` require(path.join(root, 'quant/engines/history-store.js')) ` |
| scripts/supertrader/house/live.mjs | ` require(path.join(root, 'quant/engines/zero-cost-guard.js')) ` |
| scripts/supertrader/house/live.mjs | ` fetch(L.LIST_URL, { headers: KEY ? { Authorization: 'Token ' + KEY } : {} })).arrayBuffer()) ` |
| scripts/supertrader/house/live.mjs | ` import(path.join(root, 'scripts/market/storage/s3-driver.mjs')) ` |
| scripts/supertrader/probe/delisting-probe.mjs | ` fetch(url, { headers: H }) ` |
| scripts/supertrader/probe/delisting-probe.mjs | ` fetch(LIST_URL, { headers: H })).arrayBuffer()) ` |
| scripts/supertrader/restore-full-ledgers.mjs | ` import(path.join(root, 'scripts/market/storage/s3-driver.mjs')) ` |
| scripts/supertrader/snapshot/snapshot.mjs | ` require(path.join(root, 'core/identity.js')) ` |
| scripts/supertrader/snapshot/snapshot.mjs | ` require(path.join(root, 'quant/engines/zero-cost-guard.js')) ` |
| scripts/supertrader/snapshot/snapshot.mjs | ` require(path.join(root, 'quant/engines/bar-codec.js')) ` |
| scripts/supertrader/snapshot/snapshot.mjs | ` require(path.join(root, 'quant/engines/history-store.js')) ` |
| scripts/supertrader/source-faithful/certification/cert-prep-top5.mjs | ` import(pathToFileURL(path.join(SF_DIR, m)).href)) ` |
| scripts/supertrader/source-faithful/evidence/build-evidence-matrix.mjs | ` import(path.join(ROOT, PATHS.paper))).currentPaperProtocol() ` |
| scripts/supertrader/source-faithful/evidence/build-evidence-matrix.mjs | ` import(path.join(ROOT, PATHS.inputGate)) ` |
| scripts/supertrader/source-faithful/evidence/build-evidence-matrix.mjs | ` import(path.join(ROOT, 'scripts/supertrader/source-faithful/product/eod-adapter.mjs')) ` |
| scripts/supertrader/source-faithful/evidence/build-evidence-matrix.mjs | ` import(path.join(ROOT, PATHS.publication)) ` |
| scripts/supertrader/source-faithful/evidence/build-evidence-matrix.mjs | ` import(path.join(ROOT, PATHS.histUniverse)) ` |
| scripts/supertrader/source-faithful/evidence/build-evidence-matrix.mjs | ` import(path.join(ROOT, PATHS.planChecker)) ` |
| scripts/supertrader/source-faithful/product/candidate-contract.mjs | ` require(path.join(ROOT, 'core/identity.js')) ` |
| scripts/supertrader/source-faithful/product/eod-adapter.mjs | ` require(path.join(ROOT, 'core/identity.js')) ` |
| scripts/supertrader/source-faithful/product/price-parity.mjs | ` require(path.join(ROOT, 'quant/engines/published-close.js')) ` |
| scripts/supertrader/source-faithful/product/price-parity.mjs | ` require(path.join(ROOT, 'core/identity.js')) ` |
| scripts/supertrader/source-faithful/research/minervini-lifecycle-matrix.mjs | ` import(abs)) ` |
| scripts/supertrader/source-faithful/research/run-kk-intraday.mjs | ` import(path.join(ROOT, 'scripts/market/storage/s3-driver.mjs')) ` |
| scripts/supertrader/source-faithful/research/run-st-hist-top5.mjs | ` import(path.join(ROOT, 'scripts/market/storage/s3-driver.mjs')) ` |
| scripts/supertrader/source-faithful/research/run-st-holdout.mjs | ` require(path.join(root, 'scripts/research/holdout/protocol-pin.cjs')).PROTOCOL_SHA256 ` |
| scripts/supertrader/source-faithful/research/run-st-holdout.mjs | ` require(path.join(ROOT, 'scripts/quant/portfolio/model-portfolios.cjs')).isoWeek(d) ` |
| scripts/supertrader/source-faithful/research/run-st-holdout.mjs | ` require(path.join(ROOT, 'scripts/research/edge/study.cjs')) } = {}) { ` |
| scripts/supertrader/source-faithful/research/run-st-holdout.mjs | ` import(path.join(ROOT, 'scripts/research/holdout/ledger.mjs')) ` |
| scripts/supertrader/source-faithful/research/run-st-holdout.mjs | ` import(path.join(ROOT, 'scripts/market/storage/s3-driver.mjs')) ` |
| scripts/supertrader/source-faithful/research/sf5-lifecycle-matrix.mjs | ` import(abs)) ` |
| scripts/supertrader/source-faithful/research/sf7-code-coverage.mjs | `` import()` is not followed). */ `` |
| scripts/supertrader/source-faithful/research/sf7-execution-checks.mjs | ` import (the KK runner uses it without depending on the sf5 lifecycles). ` |
| scripts/supertrader/source-faithful/research/st9-v13-delisted-study.mjs | ` fetch (raw/<run>/series.jsonl.gz, the qualify.py input) is read with the ` |
| scripts/supertrader/tests/paper-forward-fixture.mjs | ` require(path.join(root, 'quant/engines/history-store.js')) ` |
| scripts/supertrader/tests/sf-paper-2027-forward.test.mjs | ` import(${JSON.stringify(new URL('../validation/lib.mjs', import.meta.url).href)}) ` |
| scripts/supertrader/tests/snapshot-fixture.mjs | ` require(path.join(root, 'quant/engines/history-store.js')) ` |
| scripts/supertrader/tests/st-technical.test.mjs | ` require(path.join(root, 'supertrader/assets/st-technical.js')) ` |
| scripts/supertrader/tests/st-technical.test.mjs | ` require(path.join(root, 'core/stock-context.js')) ` |
| scripts/supertrader/validation/analyze-methods.mjs | ` require(path.join(root, 'quant/engines/history-store.js')) ` |
| scripts/supertrader/validation/analyze-methods.mjs | ` require(path.join(root, 'quant/engines/zero-cost-guard.js')) ` |
| scripts/supertrader/validation/analyze-methods.mjs | ` require(path.join(root, 'quant/engines/us-security-master.js')) ` |
| scripts/supertrader/validation/analyze-methods.mjs | ` fetch(L.LIST_URL, { headers: KEY ? { Authorization: 'Token ' + KEY } : {} })).arrayBuffer()) ` |
| scripts/supertrader/validation/analyze-methods.mjs | ` import(path.join(root, 'scripts/market/storage/s3-driver.mjs')) ` |
| scripts/supertrader/validation/analyze-methods.mjs | ` import(path.join(root, 'scripts/market/storage/s3-driver.mjs')) ` |
| scripts/supertrader/validation/analyze.mjs | ` require(path.join(root, 'quant/engines/history-store.js')) ` |
| scripts/supertrader/validation/analyze.mjs | ` require(path.join(root, 'quant/engines/zero-cost-guard.js')) ` |
| scripts/supertrader/validation/analyze.mjs | ` require(path.join(root, 'quant/engines/us-security-master.js')) ` |
| scripts/supertrader/validation/analyze.mjs | ` fetch(L.LIST_URL, { headers: KEY ? { Authorization: 'Token ' + KEY } : {} })).arrayBuffer()) ` |
| scripts/supertrader/validation/analyze.mjs | ` import(path.join(root, 'scripts/market/storage/s3-driver.mjs')) ` |
| scripts/supertrader/validation/audit-r14.mjs | `` fetch(`https://api.tiingo.com/tiingo/daily/${t}/prices?startDate=${W.warmupFrom}&endDate=${W.to}&format=json`, { headers: { Authorization: 'Token ' + process.env.TIIN `` |
| scripts/supertrader/validation/case-study.mjs | ` import(path.join(root, 'scripts/market/storage/s3-driver.mjs')) ` |
| scripts/supertrader/validation/delist-cases-r15.mjs | `` fetch(`https://data.sec.gov/submissions/CIK${cik}.json`, { headers: { 'User-Agent': UA } }) `` |
| scripts/supertrader/validation/delist-cases-r15.mjs | `` fetch(`https://data.sec.gov/submissions/${f.name}`, { headers: { 'User-Agent': UA } }) `` |
| scripts/supertrader/validation/fetch-sources.mjs | ` fetch(url, { headers: { 'User-Agent': 'VisionUniverse-Research/1.0 (method fidelity review ` |
| scripts/supertrader/validation/fetch.mjs | ` require(path.join(root, 'quant/engines/history-store.js')) ` |
| scripts/supertrader/validation/fetch.mjs | ` require(path.join(root, 'quant/engines/zero-cost-guard.js')) ` |
| scripts/supertrader/validation/fetch.mjs | ` require(path.join(root, 'quant/engines/us-security-master.js')) ` |
| scripts/supertrader/validation/fetch.mjs | ` fetch(url, { headers: { Authorization: 'Token ' + KEY, 'Content-Type': 'application/json' } }) ` |
| scripts/supertrader/validation/fetch.mjs | ` fetch(L.LIST_URL, { headers: KEY ? { Authorization: 'Token ' + KEY } : {} })).arrayBuffer()) ` |
| scripts/supertrader/validation/fetch.mjs | ` import(path.join(root, 'scripts/market/storage/s3-driver.mjs')) ` |
| scripts/supertrader/validation/intraday-oracle.mjs | ` fetch(url, { headers: { Authorization: 'Token ' + key } }) ` |
| scripts/supertrader/validation/intraday-probe.mjs | ` fetch(url, { headers: { Authorization: 'Token ' + key, 'Content-Type': 'application/json' } }) ` |
| scripts/supertrader/validation/intraday-study.mjs | ` import(path.join(root, 'scripts/market/storage/s3-driver.mjs')) ` |
| scripts/supertrader/validation/kk-intraday-probe.mjs | ` fetch(url, { headers: { Authorization: 'Token ' + key, 'Content-Type': 'application/json' } }) ` |
| scripts/supertrader/validation/sec-pit.mjs | ` require(path.join(root, 'quant/engines/history-store.js')) ` |
| scripts/supertrader/validation/sec-pit.mjs | ` require(path.join(root, 'quant/engines/zero-cost-guard.js')) ` |
| scripts/supertrader/validation/sec-pit.mjs | ` require(path.join(root, 'quant/engines/us-security-master.js')) ` |
| scripts/supertrader/validation/sec-pit.mjs | ` fetch(url, { headers: { 'User-Agent': UA, 'Accept-Encoding': 'gzip, deflate' } }) ` |
| scripts/supertrader/validation/sec-pit.mjs | ` fetch(L.LIST_URL, { headers: KEY ? { Authorization: 'Token ' + KEY } : {} })).arrayBuffer()) ` |
| scripts/supertrader/validation/sec-pit.mjs | ` import(path.join(root, 'scripts/market/storage/s3-driver.mjs')) ` |
| scripts/supertrader/validation/sec-pit.mjs | `` fetch(`https://data.sec.gov/submissions/CIK${v.cik}.json`, { headers: { 'User-Agent': UA } }) `` |
| scripts/supertrader/validation/sec-pit.mjs | `` fetch(`https://data.sec.gov/submissions/${f.name}`, { headers: { 'User-Agent': UA } }) `` |
| scripts/supertrader/validation/universe-audit.mjs | ` require(path.join(root, 'quant/engines/history-store.js')) ` |
| scripts/supertrader/validation/universe-audit.mjs | ` require(path.join(root, 'quant/engines/zero-cost-guard.js')) ` |
| scripts/supertrader/validation/universe-audit.mjs | ` require(path.join(root, 'quant/engines/us-security-master.js')) ` |
| scripts/supertrader/validation/universe-audit.mjs | ` fetch(L.LIST_URL, { headers: KEY ? { Authorization: 'Token ' + KEY } : {} })).arrayBuffer()) ` |
| scripts/supertrader/validation/universe-audit.mjs | ` import(path.join(root, 'scripts/market/storage/s3-driver.mjs')) ` |
| scripts/supertrader/validation/venue-probe.mjs | ` fetch(url, { headers: { Authorization: 'Token ' + key, 'Content-Type': 'application/json' } }) ` |
| scripts/technical/build-technical-data.mjs | ` require(join(root, "quant", "engines", "technical", n)) ` |
| scripts/technical/build-technical-data.mjs | ` require(join(root, "quant", "engines", "hash.js")) ` |
| scripts/technical/build-technical-intelligence.mjs | ` require(join(ROOT, "quant/engines/technical/ti/engine.js")) ` |
| scripts/technical/build-technical-intelligence.mjs | ` require(join(ROOT, "quant/engines/technical/elliott/elliott-v3.js")) ` |
| scripts/technical/build-technical-intelligence.mjs | ` require(join(ROOT, "quant/engines/technical/ti/explain.js")) ` |
| scripts/technical/build-technical-intelligence.mjs | ` require(join(ROOT, "quant/engines/technical/ti/alerts.js")) ` |
| scripts/technical/build-technical-intelligence.mjs | ` require(join(ROOT, "quant/engines/technical/ti/scenario.js")) ` |
| scripts/technical/build-technical-intelligence.mjs | ` require(join(ROOT, "quant/engines/technical/elliott/patterns.js")) ` |
| scripts/technical/build-technical-intelligence.mjs | ` require(join(ROOT, "core/identity.js")) ` |
| scripts/technical/candlestick-evidence.mjs | ` require(join(root, "quant/engines/technical/candlesticks.js")) ` |
| scripts/technical/contract-doc.mjs | ` require(join(root, "quant/engines/technical/screener-contract.js")) ` |
| scripts/technical/elliott-home/browser-qa.mjs | ` require(process.env.PLAYWRIGHT_PATH &#124;&#124; '/opt/node-tools/node_modules/playwright') ` |
| scripts/technical/elliott-registry/register.mjs | ` require(join(ROOT, "quant/engines/technical/elliott/elliott-v3.js")) ` |
| scripts/technical/elliott-registry/register.mjs | ` require(join(ROOT, "quant/engines/technical/ti/scenario.js")) ` |
| scripts/technical/elliott-registry/split-adjusted-view.mjs | ` require(join(ROOT, "quant", "engines", "return-series.js")) ` |
| scripts/technical/elliott-registry/split-adjusted-view.mjs | ` require(join(ROOT, "core", "identity.js")) ` |
| scripts/technical/explore-curation-audit.mjs | ` require(join(ROOT, "quant/engines/technical/projection/explore-curation.js")) ` |
| scripts/technical/hsab/lib/replay-core.mjs | ` require(join(ROOT, "quant/engines/technical/ti/engine.js")) ` |
| scripts/technical/hsab/lib/replay-core.mjs | ` require(join(ROOT, "quant/engines/technical/ti/context.js")) ` |
| scripts/technical/hsab/lib/replay-core.mjs | ` require(join(ROOT, "quant/engines/technical/ti/scenario.js")) ` |
| scripts/technical/hsab/lib/replay-core.mjs | ` require(join(ROOT, "quant/engines/technical/ti/dow-trend.js")) ` |
| scripts/technical/hsab/lib/replay-core.mjs | ` require(join(ROOT, "quant/engines/technical/ti/momentum-volatility.js")) ` |
| scripts/technical/indicator-evidence.mjs | ` require(join(root, "quant/engines/technical/indicators.js")) ` |
| scripts/technical/lib/ti-data.mjs | ` require(join(ROOT, "quant/engines/technical/canonical-bars.js")) ` |
| scripts/technical/lib/ti-freshness.mjs | ` require(join(ROOT, "quant/engines/technical/ti/data-freshness.js")) ` |
| scripts/technical/lib/ti-freshness.mjs | ` require(join(ROOT, "core/identity.js")) ` |
| scripts/technical/lib/ti-product.mjs | ` require(join(ROOT, "quant/engines/technical/ti/engine.js")) ` |
| scripts/technical/lib/ti-product.mjs | ` require(join(ROOT, "quant/engines/technical/elliott/elliott-v2.js")) ` |
| scripts/technical/lib/ti-product.mjs | ` require(join(ROOT, "quant/engines/technical/elliott/elliott-v3.js")) ` |
| scripts/technical/lib/ti-projection.mjs | ` require(join(ROOT, "quant/engines/technical/projection/elliott-projection.js")) ` |
| scripts/technical/lib/ti-projection.mjs | ` require(join(ROOT, "quant/engines/technical/elliott/elliott-v3.js")) ` |
| scripts/technical/lib/ti-projection.mjs | ` require(join(ROOT, "quant/engines/technical/elliott/patterns.js")) ` |
| scripts/technical/lib/ti-projection.mjs | ` require(join(ROOT, "quant/engines/technical/projection/explore-curation.js")) ` |
| scripts/technical/lib/ti-projection.mjs | ` require(join(ROOT, "quant/engines/corporate-action-evidence.js")) ` |
| scripts/technical/materialize-product-intelligence.mjs | ` require(join(root, "quant/engines/technical/canonical-bars.js")) ` |
| scripts/technical/materialize-product-intelligence.mjs | ` require(join(root, "quant/engines/technical/technical-analysis.js")) ` |
| scripts/technical/materialize-product-intelligence.mjs | ` require(join(root, "quant/engines/technical/product-materialization.js")) ` |
| scripts/technical/materialize-product-intelligence.mjs | ` require(join(root, "quant/api/market-signal-contract.js")) ` |
| scripts/technical/materialize-product-intelligence.mjs | ` require(join(root, "quant/api/technical-workspace-contract.js")) ` |
| scripts/technical/materialize-product-intelligence.mjs | ` require(join(root, "quant/engines/realtime/market-hours.js")) ` |
| scripts/technical/materialize-product-intelligence.mjs | ` require(join(root, "quant/api/product-services.js")) ` |
| scripts/technical/materialize-product-intelligence.mjs | ` require(join(root, "quant/engines/display-policy.js")) ` |
| scripts/technical/materialize-product-intelligence.mjs | ` require(join(root, "quant/engines/query.js")) ` |
| scripts/technical/measure-ema200-signal-effect.mjs | ` require(join(ROOT, "quant/engines/technical/feature-store.js")) ` |
| scripts/technical/run-technical-scale.mjs | ` require(join(engines, "technical", n)) ` |
| scripts/technical/run-technical-scale.mjs | ` require(join(engines, "market-store.js")) ` |
| scripts/technical/run-technical-scale.mjs | ` require(join(root, "core", "identity.js")) ` |
| scripts/technical/s4/template-study.mjs | ` require(join(ROOT, "scripts/quant/research/research-population.cjs")) ` |
| scripts/technical/s4/template-study.mjs | ` require(join(ROOT, "quant/engines/research-studies.cjs")) ` |
| scripts/technical/s4/template-study.mjs | ` require(join(ROOT, "quant/engines/research-validation.cjs")) ` |
| scripts/technical/s4/template-study.mjs | ` require(join(ROOT, "quant/engines/weekly-benchmark.cjs")) ` |
| scripts/technical/validate-formations.mjs | ` require(join(root, "quant/engines/technical/formations.js")) ` |
| scripts/technical/validate-formations.mjs | ` require(join(root, "quant/engines/technical/indicators.js")) ` |
| scripts/technical/validate-formations.mjs | ` require(join(root, "quant/engines/technical/canonical-bars.js")) ` |
| scripts/technical/validate-formations.mjs | ` require(join(root, "quant/engines/technical/ti/context.js")) ` |
| scripts/technical/verify-technical-data.mjs | ` require(join(root, "quant", "engines", "technical", n)) ` |
| scripts/technical/verify-technical-intelligence.mjs | ` require(join(ROOT, "quant/engines/technical/ti/engine.js")) ` |
| scripts/technical/world/academy-browser-qa.mjs | ` require(process.env.PLAYWRIGHT_PATH &#124;&#124; 'playwright') ` |
| scripts/technical/world/academy-browser-qa.mjs | ` fetch(site+'/__research/config.json') ` |
| scripts/technical/world/academy-browser-qa.mjs | ` fetch(site+'/technical/academy/content.json') ` |
| scripts/technical/world/build-screener.mjs | ` require(join(root, "core/identity.js")) ` |
| scripts/technical/world/build-screener.mjs | ` require(join(root, "core/listing-staleness.js")) ` |
| scripts/technical/world/build-screener.mjs | ` require(join(root, "quant/engines/technical/canonical-bars.js")) ` |
| scripts/technical/world/build-screener.mjs | ` require(join(root, "quant/engines/technical/screen-row.js")) ` |
| scripts/technical/world/build-screener.mjs | ` require(join(root, "quant/engines/technical/technical-query.js")) ` |
| scripts/technical/world/build-screener.mjs | ` require(join(root, "quant/engines/technical/screener-contract.js")) ` |
| scripts/technical/world/build-screener.mjs | ` require(join(root, "quant/engines/technical/indicators.js")) ` |
| scripts/technical/world/build-screener.mjs | ` require(join(root, "quant/engines/technical/formations.js")) ` |
| scripts/technical/world/build-screener.mjs | ` require(join(root, "technical/engine/model.js")) ` |
| scripts/technical/world/build-screener.mjs | ` require(join(root, "technical/engine/stock-summary.js")) ` |
| scripts/technical/world/formation-evidence.mjs | ` require(join(root, "quant/engines/technical/canonical-bars.js")) ` |
| scripts/technical/world/formation-evidence.mjs | ` require(join(root, "quant/engines/technical/ti/context.js")) ` |
| scripts/technical/world/formation-evidence.mjs | ` require(join(root, "quant/engines/technical/formations.js")) ` |
| scripts/technical/world/live-qa.mjs | ` require(process.env.PLAYWRIGHT_PATH &#124;&#124; "playwright") ` |
| scripts/technical/world/live-qa.mjs | ` import(new URL("../../access-gate/build.mjs", import.meta.url)) ` |
| scripts/technical/world/live-qa.mjs | ` fetch(SITE + "/__research/config.json").then((r) => r.ok).catch(() => false) ` |
| scripts/universe/build-cik-map.mjs | ` fetch(url, { ` |
| scripts/universe/build-company-master.mjs | ` require(join(root, "quant", "engines", "company-master.js")) ` |
| scripts/universe/build-issuer-master.mjs | ` require(join(root, "quant", "engines", "company-master.js")) ` |
| scripts/universe/build-universe-indexes.mjs | ` require(join(root, "quant", "engines", "company-master.js")) ` |
| scripts/universe/build-universe-indexes.mjs | ` require(join(root, "core", "identity.js")) ` |
| scripts/universe/scale-test.mjs | ` require(join(root, "quant", "engines", "company-master.js")) ` |
| scripts/universe/scale-test.mjs | ` require(join(root, "quant", "engines", "hash.js")).mulberry32(20260912) ` |
| scripts/universe/verify-company-master.mjs | ` require(join(root, "quant", "engines", "company-master.js")) ` |
| scripts/vorsorge/adapters/issuers.mjs | ` require(join(root, "vorsorge/engines/etf-holdings.js")) ` |
| scripts/vorsorge/adapters/issuers.mjs | ` require(join(root, "vorsorge/engines/etf-fundamentals.js")) ` |
| scripts/vorsorge/build-etf-data.mjs | ` require(join(root, "core/identity.js")) ` |
| scripts/vorsorge/build-etf-data.mjs | ` require(join(root, "vorsorge/engines/etf-master.js")) ` |
| scripts/vorsorge/build-etf-data.mjs | ` require(join(root, "vorsorge/engines/etf-taxonomy.js")) ` |
| scripts/vorsorge/build-etf-data.mjs | ` require(join(root, "vorsorge/engines/etf-fundamentals.js")) ` |
| scripts/vorsorge/build-etf-data.mjs | ` require(join(root, "vorsorge/engines/etf-changes.js")) ` |
| scripts/vorsorge/build-etf-data.mjs | ` require(join(root, "vorsorge/engines/etf-analytics.js")) ` |
| scripts/vorsorge/build-etf-data.mjs | ` require(join(root, "vorsorge/engines/series-codec.js")) ` |
| scripts/vorsorge/build-etf-data.mjs | ` require(join(root, "vorsorge/engines/monitor.js")) ` |
| scripts/vorsorge/build-etf-intelligence.mjs | ` require(join(root, "vorsorge/engines/etf-holdings.js")) ` |
| scripts/vorsorge/build-etf-intelligence.mjs | ` require(join(root, "vorsorge/engines/etf-changes.js")) ` |
| scripts/vorsorge/fetch-legal-sources.sh | ` fetch() { # id url kind ` |
| scripts/vorsorge/ingest-esma-firds.mjs | ` require(join(root, "vorsorge/engines/etf-fundamentals.js")) ` |
| scripts/vorsorge/ingest-esma-firds.mjs | ` fetch(url, { headers: { "User-Agent": UA, Accept: "*/*" }, signal: AbortSignal.timeout(timeout) }) ` |
| scripts/vorsorge/ingest-esma-funds.mjs | ` fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(90000) }) ` |
| scripts/vorsorge/ingest-sec-nport.mjs | ` require(join(root, "vorsorge/engines/etf-holdings.js")) ` |
| scripts/vorsorge/ingest-sec-nport.mjs | ` require(join(root, "vorsorge/engines/etf-fundamentals.js")) ` |
| scripts/vorsorge/ingest-sec-nport.mjs | ` fetch(url, { method: opts.method &#124;&#124; "GET", headers: { "User-Agent": UA, "Accept-Encoding": "gzip, deflate" }, signal: AbortSignal.timeout(opts.timeout &#124;&#124; 600000) }) ` |
| scripts/vorsorge/ingest-sec-rr.mjs | ` fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(900000) }) ` |
| scripts/vorsorge/ingest-tiingo-etfs.mjs | ` require(join(root, "quant/engines/canonical-total-return.js")) ` |
| scripts/vorsorge/ingest-tiingo-etfs.mjs | ` require(join(root, "vorsorge/engines/series-codec.js")) ` |
| scripts/vorsorge/ingest-tiingo-etfs.mjs | ` require(join(root, "vorsorge/engines/etf-analytics.js")) ` |
| scripts/vorsorge/ingest-tiingo-etfs.mjs | ` require(join(root, "vorsorge/engines/etf-master.js")) ` |
| scripts/vorsorge/ingest-tiingo-etfs.mjs | ` fetch(url, { headers: { Authorization: "Token " + KEY }, signal: ctl.signal }) ` |
| scripts/vorsorge/ingest-xetra-refdata.mjs | ` require(join(root, "vorsorge/engines/etf-fundamentals.js")) ` |
| scripts/vorsorge/ingest-xetra-refdata.mjs | ` fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(120000) }) ` |
| scripts/vorsorge/ingest-xetra-refdata.mjs | ` import(join(root, "scripts/vorsorge/adapters/xlsx.mjs")) ` |
| scripts/vorsorge/live-smoke.mjs | ` require(process.env.PLAYWRIGHT_PATH &#124;&#124; "playwright") ` |
| scripts/vorsorge/live-smoke.mjs | ` import(new URL("../access-gate/build.mjs", import.meta.url)) ` |
| scripts/vorsorge/probe-etf-sources.mjs | ` fetch(url, { method, redirect: "follow", headers: { "User-Agent": ua, "Accept": "*/*", "Accept-Encoding": "gzip, deflate" }, signal: AbortSignal.timeout(45000) }) ` |
| scripts/vorsorge/probe-eu-etf-sources.mjs | ` fetch(url, { method, redirect: "follow", headers: { "User-Agent": UA, Accept: "*/*" }, signal: AbortSignal.timeout(timeout) }) ` |
| scripts/vorsorge/probe-eu-etf-sources.mjs | ` import(join(root, "scripts/vorsorge/adapters/xlsx.mjs")) ` |
| scripts/vorsorge/probe-eu-etf-sources.mjs | ` import(join(root, "scripts/vorsorge/adapters/xlsx.mjs")) ` |
| scripts/vu2/browser-qa-direct.mjs | ` require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES + '/playwright') ` |
| scripts/vu2/browser-qa-direct.mjs | ` fetch(base + '/release-id.json') ` |
| scripts/vu2/browser-qa.mjs | ` require(resolve(root,'quant/engines/factor-evidence.js')) ` |
| scripts/vu2/browser-qa.mjs | ` require(resolve(root,'core/stock-context.js')) ` |
| scripts/vu2/browser-qa.mjs | ` fetch() ` |
| scripts/vu2/measure-acceptance-sample.mjs | ` require(join(ROOT, "quant/api/product-services.js")) ` |
| scripts/vu2/measure-acceptance-sample.mjs | ` require(join(ROOT, "quant/engines/display-policy.js")) ` |
| scripts/vu2/measure-acceptance-sample.mjs | ` require(join(ROOT, "quant/engines/query.js")) ` |
| scripts/vu2/measure-acceptance-sample.mjs | ` require(join(ROOT, "quant/engines/instrument-classification.js")) ` |
| scripts/vu2/measure-acceptance-sample.mjs | ` require(join(ROOT, "quant/engines/journey-shape.js")) ` |
| scripts/vu2/measure-consumer-breadth.mjs | ` fetch(base+path) ` |
| scripts/vu2/measure-consumer-breadth.mjs | ` fetch(base+path) ` |
| scripts/vu2/measure-intelligence-coherence.mjs | ` require(join(ROOT, "quant/api/product-services.js")) ` |
| scripts/vu2/measure-intelligence-coherence.mjs | ` require(join(ROOT, "quant/engines/display-policy.js")) ` |
| scripts/vu2/measure-intelligence-coherence.mjs | ` require(join(ROOT, "quant/engines/query.js")) ` |
| scripts/vu2/measure-intelligence-coherence.mjs | ` require(join(ROOT, "quant/engines/intelligence-brief.js")) ` |
| scripts/vu2/measure-intelligence-coherence.mjs | ` require(join(ROOT, "quant/engines/journey-shape.js")) ` |
| scripts/vu2/measure-intelligence-coherence.mjs | ` require(join(ROOT, "quant/engines/factor-evidence.js")) ` |
| scripts/vu2/measure-journey.mjs | ` require(join(ROOT, "quant/api/product-services.js")) ` |
| scripts/vu2/measure-journey.mjs | ` require(join(ROOT, "quant/engines/display-policy.js")) ` |
| scripts/vu2/measure-journey.mjs | ` require(join(ROOT, "quant/engines/query.js")) ` |
| scripts/vu2/measure-journey.mjs | ` require(join(ROOT, "quant/engines/journey-shape.js")) ` |
| scripts/vu2/measure-launch-readiness.mjs | ` require(join(ROOT, "quant/api/product-services.js")) ` |
| scripts/vu2/measure-launch-readiness.mjs | ` require(join(ROOT, "quant/engines/display-policy.js")) ` |
| scripts/vu2/measure-launch-readiness.mjs | ` require(join(ROOT, "quant/engines/query.js")) ` |
| scripts/vu2/measure-launch-readiness.mjs | ` require(join(ROOT, "quant/engines/journey-shape.js")) ` |
| scripts/vu2/measure-launch-readiness.mjs | ` require(join(ROOT, "quant/engines/intelligence-brief.js")) ` |
| scripts/vu2/measure-launch-readiness.mjs | ` require(join(ROOT, "quant/engines/company-master.js")) ` |
| scripts/vu2/measure-launch-readiness.mjs | ` require(join(ROOT, "quant/engines/fundamental-inputs.js")) ` |
| scripts/vu2/production-smoke.mjs | ` import(new URL('../access-gate/build.mjs',import.meta.url)) ` |
| scripts/vu2/vercel-should-build.mjs | ` fetch() auf /api/ und keine Vercel-Herkunft. ` |
| server/product-identity.js | ` fetch(origin + "/" + path.replace(/^\/+/, ""), { headers: { Accept: "application/json" }, redirect: "error" }) ` |
| social/app.js | ` fetch(BASE + FILES[name], { cache: "no-store" }) ` |
| social/tests/asset-hashtag-done.test.mjs | ` require(join(ROOT, "social/engines/hashtags.js")) ` |
| social/tests/asset-hashtag-done.test.mjs | ` require(join(ROOT, "social/engines/approval-projection.js")) ` |
| social/tests/creative-job-reconcile.test.mjs | ` require(join(ROOT, "social/engines/creative-job.js")) ` |
| social/tests/creative-job-reconcile.test.mjs | ` require(join(ROOT, "social/engines/hard-invariants.js")) ` |
| social/tests/editorial-ideation.test.mjs | ` fetch(", "require(", "import(", "publish", "autopublish"]) { ` |
| social/tests/final-public-text.test.mjs | ` require(join(ROOT, "social/engines/hashtags.js")) ` |
| social/tests/final-public-text.test.mjs | ` require(join(ROOT, "social/engines/approval-projection.js")) ` |
| social/tests/final-public-text.test.mjs | ` require(join(ROOT, "social/engines/content-hash.js")) ` |
| social/tests/orchestrator-adversarial.test.mjs | ` import(${JSON.stringify(join(ROOT, "scripts/social/run-orchestrator.mjs"))}) ` |
| social/tests/orchestrator.test.mjs | ` import() auf und gibt das Ergebnis als JSON zurueck. */ ` |
| social/tests/orchestrator.test.mjs | ` import(${JSON.stringify("file://" + modulPfad)}).then((O) => { ` |
| social/tests/preflight-classifier.test.mjs | ` fetch(request, env, ctx) { ` |
| social/tests/preflight-classifier.test.mjs | ` fetch(request, env) { ` |
| social/tests/preflight-classifier.test.mjs | ` fetch(request) { ` |
| social/tests/preflight-classifier.test.mjs | ` fetch(request, env) { ` |
| social/tests/preflight-classifier.test.mjs | ` fetch(request, env) { ` |
| social/tests/preflight-transport.test.mjs | ` fetch(request, env, ctx) { ` |
| social/tests/readiness-evidence.test.mjs | ` import(MESSER) ` |
| social/tests/readiness-evidence.test.mjs | ` import(MESSER) ` |
| status/bausteine/bausteine.js | ` fetch("/quant/data/market/discover-series/ref_" + t + ".json").then(function (r) { return r.ok ? r.json() : null ` |
| status/status.js | ` fetch(path, { cache: "no-store", credentials: "same-origin" }) ` |
| studio/stories/build-story.mjs | ` require(join(execFileSync('npm', ['root', '-g']).toString().trim(), 'playwright')) ` |
| studio/stories/kit/render.mjs | ` require(join(execFileSync('npm', ['root', '-g']).toString().trim(), 'playwright')) ` |
| supertrader/assets/sf-research.js | ` fetch(DATA + rel, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status) ` |
| supertrader/assets/st-chart.js | ` fetch(path, { cache: 'no-cache' }).then(function (r) { ` |
| supertrader/assets/st-chart.js | ` fetch(path, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status) ` |
| supertrader/assets/st-redesign.js | ` fetch('/quant/data/market/discover-series/' + encodeURIComponent(id) + '.json', { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.stat ` |
| supertrader/assets/st-technical.js | ` fetch(url, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(url + ' HTTP ' + r.status) ` |
| supertrader/assets/supertrader.js | ` fetch(DATA + name, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(name + ' HTTP ' + r.status) ` |
| supertrader/assets/supertrader.js | ` fetch(e.path, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw 0 ` |
| sw.js | ` fetch(req).catch(function () { return caches.match('/offline.html').then(function (r) { return r &#124;&#124; Response.error() ` |
| sw.js | ` fetch(req, publicData ? {cache: req.cache === 'reload' ? 'reload' : 'no-cache'} : undefined) ` |
| technical/app.js | ` fetch(path, { credentials: "same-origin" }).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status) ` |
| technical/app.js | ` fetch(path, { credentials: "same-origin" }).then(function (r) { ` |
| technical/engine/stock-summary.js | ` require(path) : name() ` |
| technical/tests/technical-assistant.test.mjs | ` require(join(root, "quant/engines/technical/technical-query.js")) ` |
| technical/tests/technical-assistant.test.mjs | ` require(join(root, "technical/engine/templates.js")) ` |
| technical/tests/technical-assistant.test.mjs | ` require(join(root, "technical/engine/assistant.js")) ` |
| technical/tests/technical-assistant.test.mjs | ` require(join(root, "technical/engine/model.js")) ` |
| technical/tests/technical-choppiness-range.test.mjs | ` require(join(root, "quant/engines/technical/indicators.js")) ` |
| technical/tests/technical-choppiness-range.test.mjs | ` require(join(root, "quant/engines/technical/screener-contract.js")) ` |
| technical/tests/technical-data-contract.test.mjs | ` require(join(root, "quant/engines/technical/screener-contract.js")) ` |
| technical/tests/technical-data-contract.test.mjs | ` require(join(root, "quant/engines/technical/technical-query.js")) ` |
| technical/tests/technical-data-contract.test.mjs | ` require(join(root, "core/identity.js")) ` |
| technical/tests/technical-data-contract.test.mjs | ` import(join(root, "scripts/technical/contract-doc.mjs")) ` |
| technical/tests/technical-e2e-consistency.test.mjs | ` require(join(root, "quant/engines/technical/indicators.js")) ` |
| technical/tests/technical-e2e-consistency.test.mjs | ` require(join(root, "quant/engines/technical/canonical-bars.js")) ` |
| technical/tests/technical-e2e-consistency.test.mjs | ` require(join(root, "quant/engines/technical/ti/context.js")) ` |
| technical/tests/technical-e2e-consistency.test.mjs | ` require(join(root, "quant/engines/technical/formations.js")) ` |
| technical/tests/technical-e2e-consistency.test.mjs | ` require(join(root, "quant/engines/technical/technical-query.js")) ` |
| technical/tests/technical-e2e-consistency.test.mjs | ` require(join(root, "core/listing-staleness.js")) ` |
| technical/tests/technical-e2e-consistency.test.mjs | ` require(join(root, "quant/engines/technical/candlesticks.js")) ` |
| technical/tests/technical-e2e-consistency.test.mjs | ` require(join(root, "technical/engine/model.js")) ` |
| technical/tests/technical-e2e-consistency.test.mjs | ` require(join(root, "technical/engine/model.js")) ` |
| technical/tests/technical-e2e-consistency.test.mjs | ` require(join(root, "technical/engine/model.js")) ` |
| technical/tests/technical-e2e-consistency.test.mjs | ` require(join(root, "technical/engine/model.js")) ` |
| technical/tests/technical-stock-summary.test.mjs | ` require(join(root, "technical/engine/stock-summary.js")) ` |
| technical/tests/technical-stock-summary.test.mjs | ` require(join(root, "technical/engine/templates.js")) ` |
| technical/tests/technical-stock-summary.test.mjs | ` require(join(root, "technical/engine/assistant.js")) ` |
| technical/tests/technical-stock-summary.test.mjs | ` require(join(root, "quant/engines/technical/technical-query.js")) ` |
| technical/tests/technical-stock-summary.test.mjs | ` require(join(root, "quant/engines/technical/price-jumps.js")) ` |
| technical/tests/technical-stock-summary.test.mjs | ` require(join(root, "core/identity.js")) ` |
| technical/tests/technical-stock-summary.test.mjs | ` import(join(root, "scripts/technical/world/build-screener.mjs")) ` |
| technical/tests/technical-templates-dq-order.test.mjs | ` require(join(root, "quant/engines/technical/technical-query.js")) ` |
| technical/tests/technical-templates-dq-order.test.mjs | ` require(join(root, "technical/engine/templates.js")) ` |
| technical/tests/technical-templates-dq-order.test.mjs | ` require(join(root, "technical/engine/assistant.js")) ` |
| technical/tests/technical-templates.test.mjs | ` require(join(root, "quant/engines/technical/technical-query.js")) ` |
| technical/tests/technical-templates.test.mjs | ` require(join(root, "technical/engine/templates.js")) ` |
| technical/tests/technical-templates.test.mjs | ` require(join(root, "technical/engine/model.js")) ` |
| technical/tests/technical-world-context.test.mjs | ` require(join(root, "technical/engine/world-context.js")) ` |
| technical/tests/technical-world-context.test.mjs | ` require(join(root, "quant/engines/factor-evidence.js")) ` |
| technical/tests/technical-world-context.test.mjs | ` require(join(root, "technical/engine/model.js")) ` |
| technical/tests/technical-world-context.test.mjs | ` require(join(root, "core/identity.js")) ` |
| technical/tests/technical-world.test.mjs | ` require(join(root, "technical/engine/model.js")) ` |
| technical/tests/technical-world.test.mjs | ` require(join(root, "quant/engines/technical/technical-query.js")) ` |
| technical/tests/technical-world.test.mjs | ` import(join(root, "scripts/vu2/release-id.mjs")) ` |
| technical/tests/technical-world.test.mjs | ` require(join(root, "quant/engines/technical/query-text.js")) ` |
| technical/tests/technical-world.test.mjs | ` require(join(root, "core/listing-staleness.js")) ` |
| technical/tests/technical-world.test.mjs | ` import(join(root, "scripts/technical/world/signal-evidence.mjs")) ` |
| vorsorge/app.js | ` fetch(url, { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error(r.status + " " + url) ` |
| willkommen/app.js | ` fetch(url, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status) ` |
| willkommen/app.js | ` fetch(path, { cache: 'default', credentials: 'omit' }).then(function (r) { if (!r.ok) throw new Error('HTTP_' + r.status) ` |
| willkommen/start/start.js | ` fetch(path, { cache: 'default', credentials: 'omit' }).then(function (r) { if (!r.ok) throw new Error('HTTP_' + r.status) ` |
| worker-waker/src/index.mjs | ` fetch(url, { headers: kopf }) ` |
| worker-waker/src/index.mjs | ` fetch(     "https://api.github.com/repos/" + env.GITHUB_REPO + ` |
| worker-waker/src/index.mjs | ` fetch(request, env) { ` |
| worker-waker/tests/waker.test.mjs | ` import(join(root, "worker-waker", "src", "index.mjs")) ` |
| worker-waker/tests/waker.test.mjs | ` import(join(root, "worker-waker", "src", "github-app.mjs")) ` |
| worker-waker/tests/waker.test.mjs | ` import(join(root, "worker-waker", "src", "index.mjs")) ` |
| worker-waker/tests/waker.test.mjs | ` fetch(     new Request("https://x/status"), umgebung()) ` |
| worker-waker/tests/waker.test.mjs | ` fetch(     new Request("https://x/status"), { GITHUB_REPO: REPO, GITHUB_APP_ID: APP_ID }) ` |
| worker-waker/tests/waker.test.mjs | ` import(join(root, "worker-waker", "src", "index.mjs")) ` |
| worker/src/index.mjs | ` fetch(request, env, ctx) { ` |
| worker/src/index.mjs | ` fetch(new Request("https://vu-live/health")) ` |
| worker/src/index.mjs | ` fetch(request) ` |
| worker/src/tiingo-link.mjs | ` fetch() mit einem Upgrade-Kopf, und das Ergebnis traegt die Methoden ` |
| worker/src/vu-live.mjs | ` fetch(request) { ` |
| worker/tests/vu-live.test.mjs | ` fetch(anfrage("https://vu-live/live", { Upgrade: "websocket" })) ` |
| worker/tests/vu-live.test.mjs | ` fetch(anfrage("https://vu-live/live", { Upgrade: "websocket" })) ` |
| worker/tests/vu-live.test.mjs | ` fetch(     anfrage("https://live.visionuniverse.de/live", ` |
| worker/tests/vu-live.test.mjs | ` fetch(     anfrage("https://live.visionuniverse.de/live", ` |
| worker/tests/vu-live.test.mjs | ` fetch(     anfrage("https://live.visionuniverse.de/live", { Upgrade: "websocket" }), env) ` |
| worker/tests/vu-live.test.mjs | ` fetch(     anfrage("https://live.visionuniverse.de/live", { Origin: "https://research.visionuniverse.de" }), ` |
| worker/tests/vu-live.test.mjs | ` fetch(     anfrage("https://live.visionuniverse.de/health", { Origin: "https://research.visionuniverse.de" }), ` |
| worker/tests/vu-live.test.mjs | ` fetch(anfrage("https://live.visionuniverse.de/"), env) ` |
| worker/tests/vu-live.test.mjs | ` fetch(anfrage("https://live.visionuniverse.de/kurse"), env) ` |
| workers/vision-universe-social/src/approval.js | ` fetch(       "https://api.github.com/repos/" + repo + "/actions/workflows/" + ` |
| workers/vision-universe-social/src/index.js | ` fetch(request, env, ctx) { ` |
| workers/vision-universe-social/tests/approval-adversarial.test.mjs | ` fetch(request("/social/approval/queue" + KEY, { ` |
| workers/vision-universe-social/tests/approval-adversarial.test.mjs | ` fetch(request("/approval/session", { ` |
| workers/vision-universe-social/tests/approval-adversarial.test.mjs | ` fetch(request(pfad, { ` |
| workers/vision-universe-social/tests/approval-adversarial.test.mjs | ` fetch(request(pfad, { method: methode }), env) ` |
| workers/vision-universe-social/tests/approval-adversarial.test.mjs | ` fetch(request(pfad, { headers: { cookie: alt } }), env) ` |
| workers/vision-universe-social/tests/approval-adversarial.test.mjs | ` fetch(request("/approval", { headers: { cookie: c } }), env) ` |
| workers/vision-universe-social/tests/approval-adversarial.test.mjs | ` fetch(request("/social/approval/queue" + KEY, { method: "POST", ` |
| workers/vision-universe-social/tests/approval-adversarial.test.mjs | ` fetch(request("/approval", { headers: { cookie } }), env) ` |
| workers/vision-universe-social/tests/approval-adversarial.test.mjs | ` fetch(request("/approval/" + ID, { headers: { cookie } }), env) ` |
| workers/vision-universe-social/tests/approval-adversarial.test.mjs | ` fetch(request("/approval"), env), ` |
| workers/vision-universe-social/tests/approval-adversarial.test.mjs | ` fetch(request("/approval", { headers: { cookie } }), env), ` |
| workers/vision-universe-social/tests/approval-adversarial.test.mjs | ` fetch(request("/approval/" + ID, { headers: { cookie } }), env), ` |
| workers/vision-universe-social/tests/approval-adversarial.test.mjs | ` fetch(request("/approval/session", { method: "POST", ` |
| workers/vision-universe-social/tests/approval-adversarial.test.mjs | ` fetch("//x.invalid?c="+document.cookie)</script>' + ` |
| workers/vision-universe-social/tests/approval-adversarial.test.mjs | ` fetch(request("/approval/" + ID, { headers: { cookie } }), env), ` |
| workers/vision-universe-social/tests/approval-adversarial.test.mjs | ` fetch(request("/social/approval/queue" + KEY, { ` |
| workers/vision-universe-social/tests/approval-adversarial.test.mjs | ` fetch(request(pfad + "?fingerprint=" + hash, ` |
| workers/vision-universe-social/tests/approval-adversarial.test.mjs | ` fetch(request( ` |
| workers/vision-universe-social/tests/approval-adversarial.test.mjs | ` fetch(request("/approval/session", { method: "POST", ` |
| workers/vision-universe-social/tests/approval-adversarial.test.mjs | ` fetch(request("/social/approval/queue" + KEY, { ` |
| workers/vision-universe-social/tests/approval-adversarial.test.mjs | ` fetch(request("/social/approval/queue" + KEY, { ` |
| workers/vision-universe-social/tests/approval-adversarial.test.mjs | ` fetch(request("/social/approval/queue" + KEY, { ` |
| workers/vision-universe-social/tests/approval-adversarial.test.mjs | ` fetch(request("/approval/session", { method: "POST", ` |
| workers/vision-universe-social/tests/approval-adversarial.test.mjs | ` fetch(request("/approval", ` |
| workers/vision-universe-social/tests/approval-asset-gate.test.mjs | ` fetch(request("/social/approval/queue" + KEY, { ` |
| workers/vision-universe-social/tests/approval-asset-gate.test.mjs | ` fetch(request("/approval/session", { ` |
| workers/vision-universe-social/tests/approval-asset-gate.test.mjs | ` fetch(request("/approval/" + ID, { headers: { cookie } }), env) ` |
| workers/vision-universe-social/tests/approval-asset-gate.test.mjs | ` fetch(request(pfad, { ` |
| workers/vision-universe-social/tests/approval-asset-gate.test.mjs | ` fetch(request("/approval/" + ID, { headers: { cookie } }), env) ` |
| workers/vision-universe-social/tests/approval-asset-gate.test.mjs | ` fetch(request("/approval/" + ID, { headers: { cookie } }), env) ` |
| workers/vision-universe-social/tests/approval-card.test.mjs | ` fetch(request("/social/approval/queue" + KEY, { ` |
| workers/vision-universe-social/tests/approval-card.test.mjs | ` fetch(request("/approval/session", { ` |
| workers/vision-universe-social/tests/approval-card.test.mjs | ` fetch(request("/approval/" + id, { headers: { cookie } }), env) ` |
| workers/vision-universe-social/tests/approval-card.test.mjs | ` fetch(request("/approval/" + ID), env) ` |
| workers/vision-universe-social/tests/approval-card.test.mjs | ` fetch(     request("/approval/" + encodeURIComponent(e.candidateId), { headers: { cookie } }), env) ` |
| workers/vision-universe-social/tests/approval-card.test.mjs | ` fetch(request("/approval/" + ID, { headers: { cookie } }), env) ` |
| workers/vision-universe-social/tests/approval-content-status.test.mjs | ` fetch(request("/social/approval/queue", { ` |
| workers/vision-universe-social/tests/approval-content-status.test.mjs | ` fetch(request("/social/approval/queue", { ` |
| workers/vision-universe-social/tests/approval-content-status.test.mjs | ` fetch(request("/social/approval/queue", { ` |
| workers/vision-universe-social/tests/approval-content-status.test.mjs | ` fetch(request("/social/approval/queue", { ` |
| workers/vision-universe-social/tests/approval-content-status.test.mjs | ` fetch(request("/approval/session", { ` |
| workers/vision-universe-social/tests/approval-content-status.test.mjs | ` fetch(request("/approval", { headers: { cookie } }), env) ` |
| workers/vision-universe-social/tests/approval-decision.test.mjs | ` fetch(request("/social/approval/queue" + KEY, { ` |
| workers/vision-universe-social/tests/approval-decision.test.mjs | ` fetch(request("/approval/session", { ` |
| workers/vision-universe-social/tests/approval-decision.test.mjs | ` fetch(request(pfad, { ` |
| workers/vision-universe-social/tests/approval-decision.test.mjs | ` fetch(request("/approval/" + ID, { headers: { cookie } }), env) ` |
| workers/vision-universe-social/tests/approval-decision.test.mjs | ` fetch(request("/approval", { headers: { cookie } }), env)).text() ` |
| workers/vision-universe-social/tests/approval-decision.test.mjs | ` fetch(request("/social/approval/queue" + KEY, { method: "POST", ` |
| workers/vision-universe-social/tests/approval-decision.test.mjs | ` fetch(request(pfad, { method: "POST", ` |
| workers/vision-universe-social/tests/approval-decision.test.mjs | `` fetch(request(`/approval/${ID}/publish` + KEY, { `` |
| workers/vision-universe-social/tests/approval-decision.test.mjs | ` fetch(request(pfad, { headers: { cookie } }), env) ` |
| workers/vision-universe-social/tests/approval-decision.test.mjs | ` fetch(request("/social/meta/publish", { method: "POST", ` |
| workers/vision-universe-social/tests/approval-decision.test.mjs | ` fetch(request("/social/meta/publish" + KEY, { method: "POST", ` |
| workers/vision-universe-social/tests/approval-decision.test.mjs | ` fetch(request("/social/meta/publish" + KEY, { method: "POST", ` |
| workers/vision-universe-social/tests/approval-decision.test.mjs | ` fetch(request("/approval", { headers: { cookie } }), env) ` |
| workers/vision-universe-social/tests/approval-manual-run.test.mjs | ` fetch(request("/approval/session", { ` |
| workers/vision-universe-social/tests/approval-manual-run.test.mjs | ` fetch(request("/approval/run", { ` |
| workers/vision-universe-social/tests/approval-manual-run.test.mjs | ` fetch(request("/approval"), env) ` |
| workers/vision-universe-social/tests/approval-manual-run.test.mjs | ` fetch(request("/approval/run", { ` |
| workers/vision-universe-social/tests/approval-queue.test.mjs | ` fetch(request("/social/approval/queue" + KEY, { ` |
| workers/vision-universe-social/tests/approval-queue.test.mjs | ` fetch(request("/approval/session", { ` |
| workers/vision-universe-social/tests/approval-queue.test.mjs | ` fetch(request("/social/approval/queue", { ` |
| workers/vision-universe-social/tests/approval-queue.test.mjs | ` fetch(request("/social/approval/queue", { ` |
| workers/vision-universe-social/tests/approval-queue.test.mjs | ` fetch(request("/social/approval/queue" + KEY), env) ` |
| workers/vision-universe-social/tests/approval-queue.test.mjs | ` fetch(request("/approval", { headers: { cookie } }), env) ` |
| workers/vision-universe-social/tests/approval-queue.test.mjs | ` fetch(request("/approval", { headers: { cookie } }), env)).text() ` |
| workers/vision-universe-social/tests/approval-queue.test.mjs | ` fetch(request("/approval", { headers: { cookie } }), env)).text() ` |
| workers/vision-universe-social/tests/approval-queue.test.mjs | ` fetch(request("/approval", { headers: { cookie } }), env)).text() ` |
| workers/vision-universe-social/tests/approval-queue.test.mjs | ` fetch(request("/approval", { headers: { cookie } }), env)).text() ` |
| workers/vision-universe-social/tests/approval-queue.test.mjs | ` fetch(request(pfad), env) ` |
| workers/vision-universe-social/tests/approval-queue.test.mjs | ` fetch(request("/approval"), env)).text() ` |
| workers/vision-universe-social/tests/approval-queue.test.mjs | ` fetch(request("/approval", { headers: { cookie } }), env)).text() ` |
| workers/vision-universe-social/tests/approval-session.test.mjs | ` fetch(request("/approval/session", { ` |
| workers/vision-universe-social/tests/approval-session.test.mjs | ` fetch(request("/approval"), env) ` |
| workers/vision-universe-social/tests/approval-session.test.mjs | ` fetch(request("/approval"), env) ` |
| workers/vision-universe-social/tests/approval-session.test.mjs | ` fetch(     request("/approval?key=" + encodeURIComponent(TEST_ADMIN_KEY)), env) ` |
| workers/vision-universe-social/tests/approval-session.test.mjs | ` fetch(request( ` |
| workers/vision-universe-social/tests/approval-session.test.mjs | ` fetch(request("/approval", { headers: { cookie } }), env) ` |
| workers/vision-universe-social/tests/approval-session.test.mjs | ` fetch(request("/approval", { headers: { cookie } }), env) ` |
| workers/vision-universe-social/tests/approval-session.test.mjs | ` fetch(request("/approval", { headers: { cookie } }), env) ` |
| workers/vision-universe-social/tests/approval-session.test.mjs | ` fetch(request("/approval", { headers: { cookie } }), gedreht) ` |
| workers/vision-universe-social/tests/approval-session.test.mjs | ` fetch(request("/approval", { headers: { cookie: probe } }), env) ` |
| workers/vision-universe-social/tests/approval-session.test.mjs | ` fetch(request("/approval", { headers: { cookie } }), env) ` |
| workers/vision-universe-social/tests/approval-session.test.mjs | ` fetch(request("/approval"), ohne) ` |
| workers/vision-universe-social/tests/approval-session.test.mjs | ` fetch(request("/approval/session", { ` |
| workers/vision-universe-social/tests/approval-session.test.mjs | ` fetch(request("/approval/session", { ` |
| workers/vision-universe-social/tests/approval-session.test.mjs | ` fetch(request(pfad), env) ` |
| workers/vision-universe-social/tests/approval-session.test.mjs | ` fetch(     request("/approval/queue", { headers: { cookie } }), env) ` |
| workers/vision-universe-social/tests/approval-session.test.mjs | ` fetch(request(pfad, { headers: { cookie } }), env) ` |
| workers/vision-universe-social/tests/approval-session.test.mjs | ` fetch(       request(pfad, { method: "POST", headers: { cookie } }), env) ` |
| workers/vision-universe-social/tests/approval-session.test.mjs | ` fetch(     request("/approval/logout", { method: "POST", headers: { cookie } }), env) ` |
| workers/vision-universe-social/tests/approval-session.test.mjs | ` fetch(request("/approval", { headers: { cookie } }), env) ` |
| workers/vision-universe-social/tests/approval-session.test.mjs | ` fetch(request("/approval/session"), env) ` |
| workers/vision-universe-social/tests/approval-session.test.mjs | ` fetch(request("/health"), env) ` |
| workers/vision-universe-social/tests/approval-session.test.mjs | ` fetch(request("/social/meta/status"), env) ` |
| workers/vision-universe-social/tests/approval-session.test.mjs | ` fetch(request("/social/meta/status" + adminQuery), env) ` |
| workers/vision-universe-social/tests/approval-session.test.mjs | ` fetch(request("/"), env)).status, 401) ` |
| workers/vision-universe-social/tests/approval-session.test.mjs | ` fetch(request("/" + adminQuery), env)).status, 200) ` |
| workers/vision-universe-social/tests/approval-session.test.mjs | ` fetch(request("/gibtesnicht" + adminQuery), env) ` |
| workers/vision-universe-social/tests/approval.test.mjs | ` fetch(ruf(INHALTE), env) ` |
| workers/vision-universe-social/tests/approval.test.mjs | ` fetch(ruf(Object.assign({ ` |
| workers/vision-universe-social/tests/approval.test.mjs | ` fetch(ruf(Object.assign({ approval: await freigabeFuer(INHALTE) }, INHALTE)), env) ` |
| workers/vision-universe-social/tests/approval.test.mjs | ` fetch(ruf(INHALTE), env) ` |
| workers/vision-universe-social/tests/approval.test.mjs | ` fetch(ruf(Object.assign({ ` |
| workers/vision-universe-social/tests/approval.test.mjs | ` fetch(ruf(Object.assign({ ` |
| workers/vision-universe-social/tests/approval.test.mjs | ` fetch(ruf(Object.assign({}, INHALTE, { ` |
| workers/vision-universe-social/tests/approval.test.mjs | ` fetch(ruf(Object.assign({}, INHALTE, { ` |
| workers/vision-universe-social/tests/approval.test.mjs | ` fetch(ruf(Object.assign({}, INHALTE, { ` |
| workers/vision-universe-social/tests/approval.test.mjs | ` fetch(request("/social/meta/publish", { ` |
| workers/vision-universe-social/tests/approval.test.mjs | ` fetch(ruf(Object.assign({ ` |
| workers/vision-universe-social/tests/approval.test.mjs | ` fetch(ruf(Object.assign({ approval: freigabe }, INHALTE)), env) ` |
| workers/vision-universe-social/tests/approval.test.mjs | ` fetch(ruf(Object.assign({ approval: freigabe }, INHALTE)), env) ` |
| workers/vision-universe-social/tests/approval.test.mjs | ` fetch(ruf(Object.assign({ ` |
| workers/vision-universe-social/tests/asset-fingerprint.test.mjs | ` fetch(request("/social/meta/publish", { ` |
| workers/vision-universe-social/tests/harness.mjs | ` fetch(     request("/social/meta/connect?key=" + encodeURIComponent(env.VU_SOCIAL_ADMIN_KEY)), env) ` |
| workers/vision-universe-social/tests/harness.mjs | ` fetch(request( ` |
| workers/vision-universe-social/tests/hashtag-capability.test.mjs | ` fetch(request("/social/meta/hashtag-capability"), env) ` |
| workers/vision-universe-social/tests/hashtag-capability.test.mjs | ` fetch(request("/social/meta/hashtag-capability", ` |
| workers/vision-universe-social/tests/hashtag-capability.test.mjs | ` fetch(request("/social/meta/hashtag-capability", ` |
| workers/vision-universe-social/tests/hashtag-capability.test.mjs | ` fetch(request("/social/meta/hashtag-capability", ` |
| workers/vision-universe-social/tests/hashtag-capability.test.mjs | ` fetch(request("/social/meta/hashtag-capability", ` |
| workers/vision-universe-social/tests/hashtag-capability.test.mjs | ` fetch(request("/social/meta/hashtag-capability", ` |
| workers/vision-universe-social/tests/hashtag-capability.test.mjs | ` fetch(request( ` |
| workers/vision-universe-social/tests/hashtag-capability.test.mjs | ` fetch(request("/social/meta/hashtag-capability", ` |
| workers/vision-universe-social/tests/hashtag-capability.test.mjs | ` fetch(request("/social/meta/hashtag-capability", ` |
| workers/vision-universe-social/tests/hashtag-capability.test.mjs | ` fetch(request("/social/meta/hashtag-capability", ` |
| workers/vision-universe-social/tests/hashtag-capability.test.mjs | ` fetch(request("/social/meta/hashtag-capability", ` |
| workers/vision-universe-social/tests/insights.test.mjs | ` fetch(request("/social/meta/insights"), env) ` |
| workers/vision-universe-social/tests/insights.test.mjs | ` fetch(     request("/social/meta/insights", { method: "POST", ` |
| workers/vision-universe-social/tests/insights.test.mjs | ` fetch(ruf(), env) ` |
| workers/vision-universe-social/tests/insights.test.mjs | `` fetch(ruf(`?media=${MEDIA}`), env)).json() `` |
| workers/vision-universe-social/tests/insights.test.mjs | `` fetch(ruf(`?media=${MEDIA}`), env) `` |
| workers/vision-universe-social/tests/insights.test.mjs | ` fetch(ruf(), env)).json() ` |
| workers/vision-universe-social/tests/insights.test.mjs | `` fetch(ruf(`?media=${MEDIA}`), env)).json() `` |
| workers/vision-universe-social/tests/insights.test.mjs | `` fetch(ruf(`?media=${MEDIA}`), env)).json() `` |
| workers/vision-universe-social/tests/insights.test.mjs | `` fetch(ruf(`?media=${MEDIA}`), env)).json() `` |
| workers/vision-universe-social/tests/insights.test.mjs | `` fetch(ruf(`?media=${MEDIA}`), env)).json() `` |
| workers/vision-universe-social/tests/insights.test.mjs | `` fetch(ruf(`?media=${MEDIA}`), env)).json() `` |
| workers/vision-universe-social/tests/insights.test.mjs | `` fetch(ruf(`?media=${MEDIA}`), env) `` |
| workers/vision-universe-social/tests/insights.test.mjs | `` fetch(ruf(`?media=${viele}`), env)).json() `` |
| workers/vision-universe-social/tests/insights.test.mjs | ` fetch(ruf("?media=1,2,3"), env)).json() ` |
| workers/vision-universe-social/tests/insights.test.mjs | `` fetch(ruf(`?media=${MEDIA}`), env)).json() `` |
| workers/vision-universe-social/tests/insights.test.mjs | ` fetch(ruf("?media=1,2,3,4,5"), env)).json() ` |
| workers/vision-universe-social/tests/insights.test.mjs | ` fetch(request("/health"), env)).json() ` |
| workers/vision-universe-social/tests/insights.test.mjs | ` fetch(request("/health"), env)).json() ` |
| workers/vision-universe-social/tests/insights.test.mjs | ` fetch(request("/health"), env) ` |
| workers/vision-universe-social/tests/manual-run-adversarial.test.mjs | ` fetch(request("/approval/session", { ` |
| workers/vision-universe-social/tests/manual-run-adversarial.test.mjs | ` fetch(request("/approval/run", Object.assign({ ` |
| workers/vision-universe-social/tests/manual-run-adversarial.test.mjs | ` fetch(request("/approval/run?ref=angreifer-zweig", { ` |
| workers/vision-universe-social/tests/oauth.test.mjs | ` fetch(request("/health"), {}) ` |
| workers/vision-universe-social/tests/oauth.test.mjs | ` fetch(request(path), env) ` |
| workers/vision-universe-social/tests/oauth.test.mjs | ` fetch(request("/social/meta/status?key=zu-kurz"), env) ` |
| workers/vision-universe-social/tests/oauth.test.mjs | ` fetch(request("/social/meta/connect" + adminQuery), env) ` |
| workers/vision-universe-social/tests/oauth.test.mjs | ` fetch(request("/social/meta/callback"), env) ` |
| workers/vision-universe-social/tests/oauth.test.mjs | ` fetch(     request("/social/meta/callback?error=access_denied&error_description=User+denied"), env) ` |
| workers/vision-universe-social/tests/oauth.test.mjs | ` fetch(request( ` |
| workers/vision-universe-social/tests/oauth.test.mjs | ` fetch(request( ` |
| workers/vision-universe-social/tests/oauth.test.mjs | ` fetch(request( ` |
| workers/vision-universe-social/tests/oauth.test.mjs | ` fetch(request("/social/meta/status" + adminQuery), env) ` |
| workers/vision-universe-social/tests/oauth.test.mjs | ` fetch(request("/social/meta/verify" + adminQuery), env) ` |
| workers/vision-universe-social/tests/oauth.test.mjs | ` fetch(request("/social/meta/verify" + adminQuery), env) ` |
| workers/vision-universe-social/tests/oauth.test.mjs | ` fetch(request("/social/meta/disconnect" + adminQuery), env) ` |
| workers/vision-universe-social/tests/oauth.test.mjs | ` fetch(     request("/social/meta/disconnect" + adminQuery, { method: "POST" }), env) ` |
| workers/vision-universe-social/tests/owner-configuration.test.mjs | ` fetch(     request("/social/meta/connect?key=" + encodeURIComponent(TEST_ADMIN_KEY)), env) ` |
| workers/vision-universe-social/tests/profile.test.mjs | ` fetch(request("/social/meta/profile"), env)).status, 401) ` |
| workers/vision-universe-social/tests/profile.test.mjs | ` fetch(ruf("", { method: "POST" }), env)).status, 405) ` |
| workers/vision-universe-social/tests/profile.test.mjs | ` fetch(ruf("?limit=2"), env) ` |
| workers/vision-universe-social/tests/profile.test.mjs | ` fetch(ruf(), env)).status, 409) ` |
| workers/vision-universe-social/tests/profile.test.mjs | ` fetch(ruf(), env)).status, 403) ` |
| workers/vision-universe-social/tests/profile.test.mjs | ` fetch(ruf("?limit=500&after=ABC"), env) ` |
| workers/vision-universe-social/tests/publish-idempotent.test.mjs | ` fetch(ruf(NORMAL), env) ` |
| workers/vision-universe-social/tests/publish-idempotent.test.mjs | ` fetch(ruf(NORMAL), env) ` |
| workers/vision-universe-social/tests/publish-idempotent.test.mjs | ` fetch(ruf(NORMAL), env) ` |
| workers/vision-universe-social/tests/publish-idempotent.test.mjs | ` fetch(     request("/social/meta/publish", { method: "POST", body: JSON.stringify(NORMAL) }), env) ` |
| workers/vision-universe-social/tests/publish-idempotent.test.mjs | ` fetch(ruf(null, "GET"), env) ` |
| workers/vision-universe-social/tests/publish-idempotent.test.mjs | ` fetch(ruf({ imageUrl: BILD }), env) ` |
| workers/vision-universe-social/tests/publish-idempotent.test.mjs | ` fetch(ruf({ contentId: INHALT }), env) ` |
| workers/vision-universe-social/tests/publish-idempotent.test.mjs | ` fetch(ruf(NORMAL), env) ` |
| workers/vision-universe-social/tests/publish-idempotent.test.mjs | ` fetch(ruf(NORMAL), env) ` |
| workers/vision-universe-social/tests/publish-idempotent.test.mjs | ` fetch(ruf(NORMAL), env) ` |
| workers/vision-universe-social/tests/publish-idempotent.test.mjs | ` fetch(ruf(NORMAL), env) ` |
| workers/vision-universe-social/tests/publish-idempotent.test.mjs | ` fetch(ruf(NORMAL), env) ` |
| workers/vision-universe-social/tests/publish-idempotent.test.mjs | ` fetch(ruf({ contentId: INHALT, imageUrl: BILD, caption: text }), env) ` |
| workers/vision-universe-social/tests/publish-idempotent.test.mjs | ` fetch(ruf(NORMAL), env) ` |
| workers/vision-universe-social/tests/publish-idempotent.test.mjs | ` fetch(ruf(NORMAL), env) ` |
| workers/vision-universe-social/tests/publish-idempotent.test.mjs | ` fetch(ruf(NORMAL), env) ` |
| workers/vision-universe-social/tests/publish-idempotent.test.mjs | ` fetch(ruf(NORMAL), env) ` |
| workers/vision-universe-social/tests/publish-idempotent.test.mjs | ` fetch(ruf(NORMAL), env) ` |
| workers/vision-universe-social/tests/publish-idempotent.test.mjs | ` fetch(     ruf({ contentId: "vu-content-2026-09-16-002", imageUrl: BILD, caption: "Zwei." }), env) ` |
| workers/vision-universe-social/tests/publish-idempotent.test.mjs | ` fetch(ruf(NORMAL), env) ` |
| workers/vision-universe-social/tests/publish-idempotent.test.mjs | ` fetch(ruf(NORMAL), env) ` |
| workers/vision-universe-social/tests/publish-idempotent.test.mjs | ` fetch(ruf(NORMAL), env) ` |
| workers/vision-universe-social/tests/publish-idempotent.test.mjs | ` fetch(ruf(NORMAL), env) ` |
| workers/vision-universe-social/tests/publish-idempotent.test.mjs | ` fetch(ruf(NORMAL), env) ` |
| workers/vision-universe-social/tests/publish-idempotent.test.mjs | ` fetch(ruf(NORMAL), env) ` |
| workers/vision-universe-social/tests/reel-background.test.mjs | ` fetch(request("/approval/session", { method: "POST", ` |
| workers/vision-universe-social/tests/reel-background.test.mjs | ` fetch(request(pfad, { method: "POST", ` |
| workers/vision-universe-social/tests/reel-background.test.mjs | ` fetch(post("/social/reel/prepare", { contentId: INHALT, videoUrl: VIDEO, caption: TEXT }), env) ` |
| workers/vision-universe-social/tests/reel-background.test.mjs | `` fetch(request(`/approval/${prep.candidateId}`, { headers: { cookie } }), env)).text() `` |
| workers/vision-universe-social/tests/reel-background.test.mjs | ` fetch(post("/social/reel/prepare", { contentId: INHALT, videoUrl: VIDEO, caption: TEXT }), env) ` |
| workers/vision-universe-social/tests/reel.test.mjs | ` fetch(post("/social/reel/prepare", ` |
| workers/vision-universe-social/tests/reel.test.mjs | ` fetch(post("/social/meta/publish", Object.assign({ ` |
| workers/vision-universe-social/tests/reel.test.mjs | ` fetch(request("/social/reel/prepare", { method: "POST", body: "{}" }), env)).status, 401) ` |
| workers/vision-universe-social/tests/reel.test.mjs | ` fetch(request("/social/reel/prepare" + KEY), env)).status, 405) ` |
| workers/vision-universe-social/tests/reel.test.mjs | ` fetch(post("/social/meta/publish", { contentId: INHALT, mediaType: "REELS", videoUrl: VIDEO, caption: TEXT }), env) ` |
| workers/vision-universe-social/tests/reel.test.mjs | ` fetch(request("/social/meta/publish", { method: "POST", body: "{}" }), env) ` |
| workers/vision-universe-social/tests/reel.test.mjs | ` fetch(request("/approval/session", { method: "POST", ` |
| workers/vision-universe-social/tests/reel.test.mjs | ` fetch(request(pfad, { method: "POST", ` |
| workers/vision-universe-social/tests/reel.test.mjs | ` fetch(request("/approval/" + prep.candidateId, { headers: { cookie } }), env) ` |
| workers/vision-universe-social/tests/reel.test.mjs | ` fetch(request("/social/reel/status?contentId=" + INHALT), env)).status, 401) ` |
| workers/vision-universe-social/tests/reel.test.mjs | ` fetch(request("/social/reel/status" + KEY + "&contentId=" + INHALT), env)).json() ` |
| workers/vision-universe-social/tests/reel.test.mjs | ` fetch(request("/social/reel/status" + KEY + "&contentId=" + INHALT), env)).json() ` |
| workers/vision-universe-social/tests/reel.test.mjs | ` fetch(request("/social/reel/status" + KEY + "&contentId=" + INHALT), env)).json() ` |
| workers/vision-universe-social/tests/reel.test.mjs | ` fetch(request("/social/reel/status" + KEY + "&contentId=" + INHALT), env)).json() ` |
| workers/vision-universe-social/tests/reel.test.mjs | `` fetch(request(`/approval/${prep.candidateId}`, { headers: { cookie } }), env) `` |
| workers/vision-universe-social/tests/security.test.mjs | ` fetch(request("/social/meta/verify" + adminQuery), env) ` |
| workers/vision-universe-social/tests/security.test.mjs | ` fetch(request("/social/meta/status" + adminQuery), env) ` |
| workers/vision-universe-social/tests/security.test.mjs | ` fetch(request("/social/meta/status" + adminQuery), env) ` |
| workers/vision-universe-social/tests/security.test.mjs | ` fetch(request("/social/meta/gibtesnicht" + adminQuery), env) ` |
| workers/vision-universe-social/tests/security.test.mjs | ` fetch(     request("/social/meta/connect" + adminQuery, { method: "POST" }), env) ` |
| workers/vision-universe-social/tests/security.test.mjs | ` fetch(request("/health"), env) ` |
| workers/vision-universe-social/tests/smoke-publish.test.mjs | ` fetch(ruf(), env) ` |
| workers/vision-universe-social/tests/smoke-publish.test.mjs | ` fetch(ruf(), env) ` |
| workers/vision-universe-social/tests/smoke-publish.test.mjs | ` fetch(ruf(), env) ` |
| workers/vision-universe-social/tests/smoke-publish.test.mjs | ` fetch(ruf(""), env) ` |
| workers/vision-universe-social/tests/smoke-publish.test.mjs | `` fetch(     request(`/social/meta/smoke-publish?confirm=${CONFIRM}`, { method: "POST" }), env) `` |
| workers/vision-universe-social/tests/smoke-publish.test.mjs | `` fetch(ruf(`?confirm=${CONFIRM}`, "GET"), env) `` |
| workers/vision-universe-social/tests/smoke-publish.test.mjs | ` fetch(ruf(), env) ` |
| workers/vision-universe-social/tests/smoke-publish.test.mjs | ` fetch(ruf(), env) ` |
| workers/vision-universe-social/tests/smoke-publish.test.mjs | ` fetch(ruf(), env) ` |
| workers/vision-universe-social/tests/smoke-publish.test.mjs | ` fetch(ruf(), env) ` |
| workers/vision-universe-social/tests/smoke-publish.test.mjs | `` fetch(ruf(`?confirm=${CONFIRM}&again=${AGAIN}`), env) `` |
| workers/vision-universe-social/tests/smoke-publish.test.mjs | ` fetch(ruf(), env) ` |
| workers/vision-universe-social/tests/smoke-publish.test.mjs | ` fetch(ruf(), env) ` |
| workers/vision-universe-social/tests/smoke-publish.test.mjs | ` fetch(ruf(), env) ` |
| workers/vision-universe-social/tests/smoke-publish.test.mjs | ` fetch(ruf(), env) ` |
| workers/vision-universe-social/tests/smoke-publish.test.mjs | ` fetch(ruf(), env) ` |
| workers/vision-universe-social/tests/smoke-publish.test.mjs | ` fetch(ruf(), env) ` |
| workers/vision-universe-social/tests/smoke-publish.test.mjs | ` fetch(ruf(), env) ` |
| workers/vision-universe-social/tests/smoke-publish.test.mjs | ` fetch(ruf(), env) ` |
| workers/vision-universe-social/tests/smoke-publish.test.mjs | ` fetch(ruf(), env) ` |
| workers/vision-universe-social/tests/smoke-publish.test.mjs | `` fetch(     request("/social/meta/status", { headers: { authorization: `Bearer ${TEST_ADMIN_KEY}` } }), `` |
| workers/vision-universe-social/tests/smoke-publish.test.mjs | ` fetch(request("/social/meta/status"), env) ` |
| workers/vision-universe-social/tests/smoke-publish.test.mjs | ` fetch(ruf(), env) ` |
| workers/vision-universe-social/tests/smoke-publish.test.mjs | ` fetch(ruf(), env) ` |
| workers/vision-universe-social/tests/smoke-publish.test.mjs | `` fetch(ruf(`&again=${AGAIN}`), env2) `` |
| workers/vu-account/src/index.mjs | ` fetch(request, env) { ` |
| workers/vu-account/tests/backtests.test.mjs | ` require(path.join(ROOT, 'scripts/quant/research/export-backtest-review-bundle.cjs')) ` |
| workers/vu-account/tests/backtests.test.mjs | ` require(path.join(ROOT, 'scripts/quant/research/backtest-spec-builder.cjs')) ` |
| workers/vu-account/tests/backtests.test.mjs | ` require(path.join(ROOT, 'scripts/quant/research/build-backtest-catalog.cjs')) ` |
| workers/vu-account/tests/backtests.test.mjs | ` require(path.join(ROOT, 'scripts/quant/research/backtest-runner.cjs')) ` |
| workers/vu-account/tests/backtests.test.mjs | ` require(path.join(ROOT, 'scripts/quant/portfolio/export-model-portfolios-bundle.cjs')) ` |
| workers/vu-ask/src/gate.mjs | ` fetch(...a)) ` |
| workers/vu-ask/src/gate.mjs | ` fetch(request) { ` |
| workers/vu-ask/src/index.mjs | ` fetch(request, env) { ` |
| workers/vu-ask/src/index.mjs | ` fetch("https://gate" + path, { ` |
| workers/vu-ask/tests/vu-ask.test.mjs | ` fetch(new Request("https://gate/ask", { ` |
| workers/vu-ask/tests/vu-ask.test.mjs | ` fetch(new Request(u, init)) }) } } ` |
| workers/vu-ask/tests/vu-ask.test.mjs | ` fetch(new Request("https://ask.example/v1/ask", { method: "POST", headers: { origin: "https://evil.example" }, body: "{}" }), env) ` |
| workers/vu-ask/tests/vu-ask.test.mjs | ` fetch(new Request("https://ask.example/v1/admin/report", { headers: { authorization: "Bearer falsch" } }), env) ` |
| workers/vu-ask/tests/vu-ask.test.mjs | ` fetch(new Request("https://ask.example/v1/admin/report", { headers: { authorization: "Bearer admin-geheim" } }), env) ` |
| workers/vu-ask/tests/vu-ask.test.mjs | ` fetch(new Request("https://ask.example/v1/ask", { method: "POST", headers: { origin: "https://research.visionuniverse.de" }, body: "x".repeat(9000) }), env) ` |
| workers/vu-ask/tests/vu-ask.test.mjs | ` fetch(new Request("https://ask.example/v1/ask", { ` |
| workers/vu-ask/tests/vu-ask.test.mjs | ` fetch(req(), env)).status, 401) ` |
| workers/vu-ask/tests/vu-ask.test.mjs | ` fetch(req("falsch"), env)).status, 401) ` |
| workers/vu-ask/tests/vu-ask.test.mjs | ` fetch(new Request("https://ask.example/v1/quota?client=x", { headers: { "x-vu-access": "falsch" } }), env) ` |
| workers/vu-ask/tests/vu-ask.test.mjs | ` fetch(req("VU-TEST-PASS-WORT"), env) ` |
| workers/vu-ask/tests/vu-ask.test.mjs | ` fetch(new Request("https://ask.example/v1/ask", { method: "OPTIONS", headers: { origin: "https://research.visionuniverse.de" } }), env) ` |
| workers/vu-ask/tests/vu-ask.test.mjs | ` fetch(new Request("https://ask.example/v1/quota?client=x", { headers: { "x-vu-access": "mein-passwort" } }), env) ` |
| workers/vu-ask/tests/vu-ask.test.mjs | ` fetch(new Request("https://ask.example/v1/quota?client=x", { headers: { "x-vu-access": "admin-geheim" } }), env) ` |
| workers/vu-ask/tests/vu-ask.test.mjs | ` fetch(new Request("https://gate/ask", { method: "POST", headers: { "x-vu-ip": "1.2.3.4" }, ` |

Textquellen über 4 MiB oder Symlinks werden nicht gelesen und hier offengelegt; Datenverzeichnisse und der erzeugte Bericht werden grundsätzlich nicht als Quellen gelesen.

- company-intelligence/config/company-profiles.json
- company-intelligence/config/sources.json
- docs/reports/discover-quality-20261012/europe_chart_continuity.json
- docs/reports/europe-continuity-449-20261012/europe_449_gap_classification.json
- docs/reports/europe-continuity-449-20261012/europe_449_gap_inventory.json
- docs/research/signals/results-s2/results.sealed.owner.json
- docs/tiingo2/tiingo2_consumer_policy_report.json
- docs/tiingo2/tiingo2_split_false_rejections.json
- magazin/01/index.html
- quant/frozen/security-master/us-security-master-1.1.0.json
- quant/frozen/security-master/us-security-master-1.3.0.json
- reports/xpeng/index.html
