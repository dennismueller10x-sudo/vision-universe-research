# Wie ein Content Object zu seinem Bild kommt

Produktionsarchitektur. Jedes Content Object erhält ein **individuelles**
Visual; Vision Universe entscheidet pro Objekt, wer es erzeugt.

---

## 1. Zwei Fragen, nicht eine

    "Was soll das Bild ZEIGEN?"   inhaltlich   →  VISUAL STRATEGY
    "Wer soll es ZEICHNEN?"       technisch    →  VISUAL PROVIDER

Solange beides `visualType` hieß, fiel es zusammen — und ein unsicherer
Binärtransport drohte mit einem inhaltlichen Verzicht beantwortet zu
werden. Getrennt betrachtet stellt sich die Frage gar nicht: die meisten
Strategien sind aus VU-eigenen Daten zeichenbar.

## 2. Die Zuordnung

| Strategie | Provider | Woraus das Bild bei *diesem* Objekt entsteht |
|---|---|---|
| `CHART` | VU Renderer | Kursverlauf dieses Instruments |
| `SCORE` | VU Renderer | die Beiträge seines Scores |
| `PERFORMANCE` | VU Renderer | seine Entwicklungen über die Horizonte |
| `COMPARISON` / `RANKING` | VU Renderer | es gegen die Gruppe des Laufs |
| `TECHNICAL` | VU Renderer | Trend, Momentum, Volatilität |
| `FUNDAMENTAL` | VU Renderer | seine Fundamentalkennzahlen |
| `DATA_CARD` / `NUMBER_VISUAL` / `MINIMAL_TYPOGRAPHY` | VU Renderer | Zahl, Bezeichnung, Aussage |
| `FUTURE_TECH`, `ATLAS_SCENE`, `ROBOTICS`, `AI_INFRASTRUCTURE`, `SEMICONDUCTOR_WORLD`, `CINEMATIC_MARKET_STORY` | ChatGPT Work | eine eigene Szene zum Thema |
| `GENERATIVE` | ChatGPT Work | ein übernommenes Agentenbild |

`social/engines/visual-provider.js` führt die Tabelle; sie ist die
einzige Stelle, an der ein Provider zugeordnet wird.

## 3. Individuell heißt gerechnet, nicht ausgewählt

Keine Bildbibliothek, keine Vorlage mit ausgetauschter Zahl. Eine
Kursreihe von 270 Punkten ergibt einen Pfad, den genau dieses Instrument
in genau diesem Zeitraum hat. Sechs Score-Beiträge ergeben sechs Balken
mit genau diesen Längen.

Belegt am realen Lauf: drei gezeichnete Charts, drei verschiedene
SHA-256.

## 4. Eine Strategie ohne Daten wird nicht gewählt

Jede Strategie nennt, was sie braucht (`needs`). Fehlt es, fällt sie weg
— **bevor** irgendetwas gezeichnet wird. Ein leeres Chart mit
beschrifteten Achsen ist schlimmer als kein Chart: es sieht nach
Information aus.

Dieselbe Regel eine Ebene tiefer: `visual-composition.js` verweigert
einen Verlauf aus weniger als 20 Punkten, eine flache Reihe, einen Score
aus einem Beitrag, einen Vergleich aus einem Wert.

## 5. Der Weg eines generativen Bildes

    ERZEUGUNG                      TRANSPORT
    ──────────                     ─────────
    IMAGE_GENERATION_REQUESTED     ASSET_NOT_TRANSFERRED
    IMAGE_GENERATION_SUCCESS   →   ASSET_HANDED_OFF
                                   ASSET_INGESTED
                                   ASSET_STORED
                                   ASSET_VERIFIED

Zwei Lebensläufe, getrennt geführt. Fällt der Transport aus, wird die
**Erzeugung nicht wiederholt**: der Agent hat seine Arbeit getan, ein
neuer Lauf kostete eine begrenzte Ressource, ergäbe ein *anderes* Bild
und würfe eine erbrachte Leistung weg.

    ASSET GENERATED → TRANSFER FAILED → TRANSPORT RECOVERY → VERIFY → PIPELINE

Nur eine technisch **verlorene Quelle** rechtfertigt eine neue Erzeugung
— und dann als neuer versionierter Vorgang, nicht als stiller Retry.

## 6. Der Integritätsvertrag

Vor jeder Übernahme, gleich über welchen Weg:

    Typ · innere Struktur · Abmessungen · Größe · SHA-256
    · frisches Zurücklesen vom Ziel

`AGENT_REPORTED_COMPLETED` genügt nie. Ein beschädigtes Asset ist
`ASSET_TRANSPORT_INTEGRITY_FAILED` — **niemals** `CONTENT_FAILED`,
`HOOK_FAILED`, `VISUAL_STRATEGY_FAILED` oder `EVIDENCE_FAILED`. Sonst
lernte das System, dass `FUTURE_TECH` schlecht läuft, weil einmal eine
Leitung abbrach.

Ein geerbtes Asset (bei einer Textrevision) wird **erneut vollständig
geprüft**. Ein Vertrauen, das sich auf eine früher bestandene Prüfung
beruft, prüft nichts.

## 7. Wo das Binärasset liegt

    GitHub        Verträge, Briefs, Result JSON, Provenance, Code, Strategie
    VU Storage    das Binärasset
    Content       stabiler Verweis + SHA-256 + Größe + Maße + MIME + Herkunft

Der Speicher ist der bestehende S3/R2-Treiber der Quant-Historie, gegen
Zugangsdaten, die als Repository-Secrets bereits gesetzt sind. Kein neuer
Dienst, keine neuen laufenden Kosten.

Der Verweis trägt **keine erfundene URL**: ob und unter welcher Adresse
ein Asset öffentlich erreichbar ist, entscheidet die Infrastruktur.

## 8. Das Invocation-Budget

    1 processing_key  →  max. 1 VU-dispatchter logischer Creative Job

Fail closed, in `social/engines/creative-job.js`. Dazu: keine parallelen
Anläufe je Content Object, getrennte Grenzen für **Anläufe**
(Wiederholung von Gescheitertem) und **Revisionen** (Überarbeitung von
Gelungenem), null diagnostische Jobs im Produktionspfad.

Was VU **nicht** steuern kann, steht in
`VU_CREATIVE_TRIGGER_PRODUCTION_READINESS.md`: die anbieterinterne
Wiederholung eines scheiternden Laufs.

## 9. Was das im Betrieb bedeutet

Ein Zyklus über vier Content Objects, real gemessen:

    4 Content Objects
      3 × CHART        deterministisch gezeichnet    0 Work-Ausführungen
      1 × GENERATIVE   Agentenbild übernommen        1 Work-Ausführung

Die Chatliste läuft nicht mehr voll, weil die meisten Bilder den Agenten
gar nicht brauchen — nicht, weil generative Bilder abgeschaltet wären.
Sie bleiben für das, was ein Datensatz nicht hergibt: eine Szene.
