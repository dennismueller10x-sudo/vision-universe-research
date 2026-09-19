# YOUTUBE DATA API — DER EINE MANUELLE SCHRITT

Stand: 2026-09-19

Dieses Dokument ist die Klickfolge fuer genau einen Owner-Schritt: ein
Google-Cloud-Projekt und einen API-Schluessel anlegen, den Schluessel als
Repository-Secret hinterlegen. Danach laeuft alles Weitere ohne
Rueckfrage.

---

## WARUM DIESER SCHRITT NICHT AUTOMATISIERBAR IST

Ein Google-Cloud-Projekt gehoert einem Google-Konto und entsteht nur
darin. Es gibt keinen Weg, ihn von hier aus zu gehen, der nicht
bedeutete, dass jemand anders Zugangsdaten des Owners benutzt.

Alles andere ist vorbereitet:

| Was | Zustand |
|---|---|
| Kontingentmodell (10.000/Tag, Suche 100, Detail 1) | `social/engines/youtube-source.js` |
| Suchphrasen aus dem Content Universe | 50 abgeleitet, 0 kuratiert |
| Entdeckungs- und Ernteschritt | `scripts/social/discover-creators.mjs` |
| Watch Universe, versioniert und lernend | `social/engines/creator-universe.js` |
| Ausloeser | `.github/workflows/social-creator-discovery.yml` |

Der Workflow laeuft schon jetzt gruen — ohne Schluessel plant er und
sucht nicht. Was fehlt, ist der Schluessel.

---

## WAS DAS KOSTET

Nichts. Die YouTube Data API v3 verlangt fuer das kostenlose Kontingent
keine Zahlungsmethode. Das Kontingent ist auch nicht erweiterbar durch
Bezahlung — mehr als 10.000 Einheiten am Tag gibt es nur ueber ein
manuelles Antragsverfahren, und das waere ein NEUES Owner-Gate. Dieser
Schritt hier loest keines aus.

---

## DIE KLICKFOLGE

### Teil 1 — Projekt anlegen

1. <https://console.cloud.google.com> oeffnen und mit dem
   Vision-Universe-Google-Konto anmelden.
2. Oben in der blauen Leiste auf die **Projektauswahl** klicken (links
   neben der Suchleiste; sie zeigt den Namen des aktuellen Projekts
   oder „Projekt auswählen").
3. Im Dialog oben rechts auf **NEUES PROJEKT**.
4. **Projektname**: `vision-universe-social`
   (Organisation/Speicherort unveraendert lassen.)
5. Auf **ERSTELLEN**. Es dauert einige Sekunden; danach ueber die
   Benachrichtigung oder die Projektauswahl in das neue Projekt
   wechseln.

> Prüfpunkt: In der blauen Leiste steht jetzt `vision-universe-social`.
> Steht dort noch ein anderes Projekt, gehen die naechsten Schritte an
> die falsche Stelle.

### Teil 2 — API aktivieren

6. Im linken Navigationsmenü (das Hamburger-Symbol ☰ oben links) auf
   **APIs und Dienste** → **Bibliothek**.
   Direktweg: <https://console.cloud.google.com/apis/library>
7. Im Suchfeld `YouTube Data API v3` eingeben und den Treffer
   anklicken.
8. Auf **AKTIVIEREN**.

> Prüfpunkt: Die Seite zeigt danach „API aktiviert" bzw. einen Knopf
> **VERWALTEN** statt **AKTIVIEREN**.

### Teil 3 — Schluessel erzeugen

9. Links auf **Anmeldedaten** (englisch: Credentials).
   Direktweg: <https://console.cloud.google.com/apis/credentials>
10. Oben auf **+ ANMELDEDATEN ERSTELLEN** → **API-Schlüssel**.
11. Ein Fenster zeigt den Schluessel. **Kopieren** — nicht
    weiterklicken, bevor er kopiert ist.

### Teil 4 — Schluessel einschraenken (empfohlen, zwei Minuten)

Ein unbeschraenkter Schluessel kann jede aktivierte Google-API dieses
Projekts aufrufen. Beschraenkt kann er genau eine.

12. Im selben Fenster auf **SCHLÜSSEL EINSCHRÄNKEN** (oder spaeter unter
    **Anmeldedaten** auf den Stift neben dem Schluessel).
13. Unter **API-Einschränkungen**: **Schlüssel einschränken** auswaehlen.
14. In der Auswahlliste **YouTube Data API v3** anhaken. Auf **OK**.
15. Unter **Anwendungseinschränkungen**: **Keine** lassen.
    (GitHub-Actions-Laeufer haben keine festen IP-Adressen; eine
    IP-Beschraenkung wuerde den Workflow zufaellig scheitern lassen.)
16. Auf **SPEICHERN**.

### Teil 5 — Als Repository-Secret hinterlegen

17. <https://github.com/dennismueller10x-sudo/vision-universe-research>
    oeffnen.
18. **Settings** (Reiter oben rechts im Repository, nicht im Profil).
19. Links **Secrets and variables** → **Actions**.
20. Auf **New repository secret**.
21. **Name**: `YOUTUBE_API_KEY` — exakt so, Grossbuchstaben und
    Unterstriche.
22. **Secret**: den kopierten Schluessel einfuegen.
23. Auf **Add secret**.

> Prüfpunkt: In der Liste steht `YOUTUBE_API_KEY`. Der Wert ist danach
> nicht mehr lesbar, auch nicht fuer den Owner — das ist so gewollt.

---

## DANACH

Nichts weiter. Der naechste Lauf von **Social Creator Discovery**
(Actions → Social Creator Discovery → Run workflow) sucht tatsaechlich
und schreibt die erste echte Version des Creator Watch Universe.

Falls der Schluessel spaeter einmal ersetzt werden muss: Schritt 20–23
mit demselben Namen wiederholen; GitHub ueberschreibt ihn.

---

## WAS DIESER SCHRITT NICHT FREIGIBT

- **Kein Publishing.** `GLOBAL_AUTOPUBLISH` und `VU_SOCIAL_AUTOPUBLISH`
  bleiben aus. Die YouTube-Quelle liest, sie schreibt nichts.
- **Keine kostenpflichtige Quelle.** Das kostenlose Kontingent verlangt
  keine Zahlungsmethode; eine Erweiterung waere ein eigenes Owner-Gate.
- **Keine Uebernahme fremder Inhalte.** Aus der Antwort kommen zwei
  Felder herueber: Kanal-ID und Handle. Titel, Beschreibungen und
  Vorschaubilder werden nicht gespeichert — `social/tests/creator-discovery.test.mjs`
  durchsucht die Ausgabe darauf.
- **Keine Bewertung fremder Accounts.** Das Watch Universe weist jedes
  Feld zurueck, das ein Urteil traegt.

---

## EINE OFFENE PRUEFUNG, DIE HIERHER GEHOERT

Die Kontingentzahlen in `youtube-source.js` sind ueber mehrere
unabhaengige Quellen aus 2026 bestaetigt, aber NICHT an der
Primaerquelle abgelesen: `developers.google.com` ist aus der
Entwicklungsumgebung nicht erreichbar (der Egress-Proxy lehnt den
CONNECT-Tunnel mit 403 ab — dieselbe Sperre, die auch
`social.visionuniverse.de` trifft).

Deshalb meldet `YouTube.pruefungFaellig()` dauerhaft „faellig", und der
Plan sagt es bei jedem Lauf. Der erste echte Lauf in GitHub Actions
loest das nebenbei: dort ist das Netz offen, und die tatsaechliche
Antwort der API ist die Primaerquelle, an der sich die Annahme messen
laesst.

Primaerquelle: <https://developers.google.com/youtube/v3/determine_quota_cost>
