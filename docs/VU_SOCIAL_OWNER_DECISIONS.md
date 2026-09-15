# VU SOCIAL — OFFENE OWNER-ENTSCHEIDUNGEN

Stand: 2026-09-15 · Zweig `claude/vision-universe-social-os-eudjmx`

§55 des Auftrags nennt die Faelle, in denen der Build anhalten und fragen soll.
Dieses Dokument enthaelt genau diese Faelle — nicht mehr. Alles Uebrige wurde
gebaut, getestet und dokumentiert.

Jede Entscheidung ist so beschrieben, dass sie ohne Rueckfrage getroffen werden
kann: Lage, Optionen, Kosten, Empfehlung, Konsequenz.

---

## ENTSCHEIDUNG 1 — Wo laeuft der OAuth-Callback? (blockierend fuer §9)

### Lage

Facebook Login for Business braucht einen HTTP-Endpunkt, der den Redirect mit
`code` und `state` entgegennimmt, und einen serverseitigen Ort, an dem
`META_APP_SECRET` den Code gegen ein Token tauscht.

Vision Universe laeuft auf **GitHub Pages**. GitHub Pages liefert statische
Dateien aus. Es gibt keinen Request-Handler und keine Server-Laufzeit.

`exchangeCode()` ist in `social/providers/meta/adapter.js` vollstaendig
implementiert und getestet (`social/tests/meta-auth.test.mjs`, M5–M7). Was fehlt,
ist ausschliesslich ein Ort, an dem sie laufen kann.

### Optionen

| # | Weg | Laufende Kosten | Aufwand | Folge fuer die Architektur |
|---|---|---|---|---|
| **A** | **Einmalige manuelle Token-Beschaffung** ueber den Graph API Explorer; das langlebige Token wird als GitHub-Secret hinterlegt | 0 € | ~20 Minuten, alle ~60 Tage wiederholen | Keine. Der Adapter verlaengert das Token selbst (`refreshToken()`); nur die Erstbeschaffung ist Handarbeit |
| **B** | **Cloudflare Worker** als Callback-Endpunkt | 0 € im Free Tier (100k Anfragen/Tag) | ~1 Tag inkl. `wrangler`, Deployment, Secret-Verwaltung | Fuehrt Cloudflare Workers als **neue Laufzeit** ins Projekt ein. Bislang gibt es keine — R2 wird ueber einen eigenen S3-Treiber angesprochen, ohne Worker |
| **C** | **GitHub Action mit `workflow_dispatch`**: der Owner fuegt den `code` aus der Browser-Adresszeile von Hand ein, die Action tauscht ihn | 0 € | ~2 Stunden | Keine neue Laufzeit. Umstaendlicher als A, aber der Tausch laeuft serverseitig und protokolliert |

### Empfehlung: A jetzt, B erst bei Bedarf

Option A loest das Problem heute vollstaendig und kostet nichts. Der einzige
Nachteil — alle 60 Tage 20 Minuten — faellt erst ins Gewicht, wenn mehrere Konten
und mehrere Plattformen dazukommen.

Option B ist die richtige Antwort auf ein Problem, das es noch nicht gibt. Sie
fuehrt eine zweite Laufzeit ein, die dann gewartet, ueberwacht und bezahlt werden
will — und §35 sagt ausdruecklich: keine Technologie einsetzen, nur weil sie
existiert.

**Konsequenz von A:** Die Capability bleibt
`serverSideTokenExchange: MANUAL_REQUIRED`. Das ist kein Mangel des Codes,
sondern eine wahrheitsgemaesse Angabe ueber den Betrieb.

### Was der Owner tun muss (Option A)

1. Meta-App anlegen bzw. oeffnen, Instagram-Professional-Konto mit einer
   Facebook-Seite verbinden.
2. Im Graph API Explorer ein Token mit den Rechten `instagram_basic`,
   `instagram_content_publish`, `instagram_manage_insights`,
   `instagram_manage_comments`, `pages_show_list`, `pages_read_engagement` holen.
3. Es in ein langlebiges Token tauschen.
4. Als GitHub-Secrets hinterlegen — **nur diese Namen, niemals Werte in ein
   Repository, einen Chat oder ein Ticket**:

   ```
   META_APP_ID
   META_APP_SECRET
   META_LONG_LIVED_TOKEN
   META_IG_ACCOUNT_ID
   META_WEBHOOK_SECRET      (erst fuer Webhooks noetig)
   ```

5. `node scripts/social/verify-meta-capabilities.mjs` ausfuehren. Der Lauf
   veroeffentlicht nichts; er liest Konto, Rechte und Kennzahlen und sagt, was
   belegt ist und was nicht.

---

## ENTSCHEIDUNG 2 — Wann wird Autopublish freigeschaltet? (blockierend fuer §16 Stufe 4)

### Lage

`social/config/kill-switch.json` hat `GLOBAL_AUTOPUBLISH: false`. Eine CI-Pruefung
(`social-ci.yml`) und ein Test (`social/tests/loop.test.mjs`, E1) sorgen dafuer,
dass das so bleibt, bis jemand es ausdruecklich aendert.

Das ist **kein Platzhalter**. §16 nennt die Voraussetzungen, und keine davon ist
im Produktionsbetrieb nachgewiesen: kein Provider ist konfiguriert, kein Beitrag
wurde je veroeffentlicht, keine Kennzahl wurde je eingelesen.

### Der dependency-correcte Weg dorthin

| Stufe | Voraussetzung | Nachweis |
|---|---|---|
| 1 | Eine Signalquelle liefert taeglich | `social/data/signals.json` mit `publishable > 0` an mehreren Tagen |
| 2 | Content-Pipeline laeuft im Betrieb durch | `cycle-report.json` mit `packages > 0`, wiederholt |
| 3 | Brand- und Faktenvalidierung greifen im Betrieb | mindestens ein echter Fall, in dem eine Pruefung etwas gestoppt hat |
| 4 | Provider stabil, Analytics korrekt, Security Review erfolgt | `verify-meta-capabilities.mjs` = VERIFIED; erste Beitraege manuell freigegeben; Kennzahlen plausibel |
| 5 | Belastbare Lernbeobachtungen und ein entschiedenes Experiment | `sufficient: true` bei n ≥ 5 je Arm |

Vor Stufe 4 ist ein **Security Review** Pflicht (§50). Was er pruefen muss, steht
in `docs/VU_SOCIAL_ARCHITECTURE.md`, Abschnitt Sicherheit.

**Empfehlung:** Stufe 3 anstreben (das System plant, der Owner gibt frei), und
Stufe 4 erst nach mindestens 20 manuell freigegebenen Beitraegen mit vollstaendiger
Analytics-Kette. Vorher gibt es keine Vergleichsbasis — und ohne Vergleichsbasis
liefert der Performance Score bewusst gar keine Zahl.

---

## ENTSCHEIDUNG 3 — Externe Trend- und Publikumsquellen (blockierend fuer §5 in voller Tiefe)

### Lage

Die Trend Intelligence Engine ist gebaut und getestet. Sie hat heute **keine
externe Datenquelle** und enthaelt sich deshalb: kein Trend Score, keine Zahl.

Das ist §45 in Funktion — aber es bedeutet auch, dass die Dimension "was passiert
gerade draussen" fehlt. Die Gelegenheiten entstehen derzeit ausschliesslich aus
internen VU-Signalen.

### Optionen

| Quelle | Lage | Kosten |
|---|---|---|
| **Instagram/Meta eigene Insights** | ueber den bestehenden Adapter erreichbar, sobald verbunden — liefert die EIGENE Wirkung, nicht externe Trends | 0 € |
| **X/Twitter API** | Trenddaten nur in kostenpflichtigen Stufen | ab ~100 $/Monat |
| **News-Provider** (`NewsDataProvider` ist bereits definiert) | Lizenzfrage; die bestehende Provider-Checkliste gilt | variiert |
| **Google Trends (inoffiziell)** | keine offizielle API; Nutzungsbedingungen pruefen | 0 €, rechtlich unklar |

**Empfehlung:** Zunaechst ohne externe Trendquelle arbeiten. Die eigenen
Publikumssignale (Kommentare der eigenen Beitraege) sind die naechstliegende und
sauberste Erweiterung — sie kommen mit dem Meta-Adapter ohne Zusatzkosten und
ohne Lizenzfrage.

Eine gekaufte Trendquelle lohnt sich erst, wenn genug eigene Beitraege existieren,
um ihren Nutzen zu messen.

---

## ENTSCHEIDUNG 4 — Bildgenerierung und Atlas (nicht blockierend)

### Lage

Die Visual Strategy Layer entscheidet, WELCHE Bildform ein Beitrag braucht, und
erzeugt einen Visual Brief. Sie erzeugt **kein Bild**. Die Atlas-Regel ist als
Code hinterlegt: nur Transformation eines vorhandenen Assets, niemals
Text-zu-Bild (§12).

Fuer die Umsetzung fehlen:

- Chart-Vorlagen im Social-Format (1:1, 4:5, 9:16) — koennten aus dem bestehenden
  `quant/ui/charts.js` abgeleitet werden
- Brand Templates, Fonts, freigegebene Atlas-Varianten
- ein Bildgenerator fuer die Faelle, die kein Chart sind

**Empfehlung:** Mit Charts und Data Cards beginnen — sie lassen sich aus
vorhandenen Daten deterministisch rendern, brauchen keinen Generator und
entsprechen der VU-Bildwelt (§13). Atlas-Kompositionen und Video erst danach.

Das ist auch der kostenguenstigste Weg: ein gerendertes Chart kostet nichts, eine
Bildgenerierung kostet je Bild.

---

## Was KEINE Owner-Entscheidung war

Zur Abgrenzung — diese Fragen sind im Build entschieden und begruendet worden,
ohne anzuhalten:

- **Kein Cloudflare Worker, kein D1, kein KV.** Es gibt sie im Projekt nicht;
  sie einzufuehren waere eine Parallelarchitektur (§0, §35). Details in
  `docs/VU_SOCIAL_PHASE_A_AUDIT.md`, Abschnitt 2.1.
- **Kein zweites Modulformat.** Die Engines folgen dem UMD-Muster aus
  `quant/engines/` und laufen in Browser und Node (MASTER §31.12).
- **Kein LLM in der Content-Pipeline.** Die Stufen RESEARCH bis DRAFT sind ein
  austauschbares Interface; heute erfuellt sie eine deterministische Vorlage.
  Ein Modell anzubinden ist eine spaetere, unabhaengige Entscheidung — die
  Pruefstufen bleiben in jedem Fall deterministisch (§40).
- **Mindestabdeckung der Opportunity Engine auf 0.55 statt 0.6.** Begruendet im
  Quelltext (`social/engines/opportunity.js`): ein Kaltstart-System kann
  hoechstens 0.56 erreichen, eine Schwelle von 0.6 waere nicht streng, sondern
  unerfuellbar. Sie gehoert hinauf, sobald Analytics und Publikumssignale laufen.
