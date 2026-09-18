/* =========================================================================
   VISION UNIVERSE SOCIAL — social/tests/asset-store.test.mjs

   Erzeugung und Transport sind zwei Lebenslaeufe. Diese Tests halten
   fest, dass ein Transportfehler nie zu einem neuen Creative-Lauf
   fuehrt — und nie als Inhaltsurteil gelernt wird.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const S = require("../engines/asset-store.js");
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const ERGEBNIS = JSON.parse(readFileSync(
  join(ROOT, "authoring/requests/vu-xom-20260911/authoring-result.json"), "utf8"));
const VARIANTE = ERGEBNIS.visual_variants[0];
const BYTES = readFileSync(join(ROOT, VARIANTE.asset_path));

test("AS1 · Der Speicherort kommt aus der Identitaet", () => {
  /* Derselbe Inhalt landet an derselben Stelle. Ein zweiter Transport
     desselben Assets ueberschreibt sich selbst, statt eine zweite
     Kopie anzulegen — Idempotenz ohne eigenen Mechanismus. */
  const a = S.key({ sha256: "a".repeat(64), mime: "image/png" });
  const b = S.key({ sha256: "a".repeat(64), mime: "image/png" });
  assert.equal(a, b);
  assert.match(a, /^social\/assets\/aa\/a{64}\.png$/);
  assert.notEqual(a, S.key({ sha256: "b".repeat(64), mime: "image/png" }));
});

test("AS2 · Ohne SHA-256 gibt es keinen Speicherort", () => {
  /* Ein Asset ohne Hash waere nicht wiederfindbar und nicht pruefbar. */
  assert.throws(() => S.key({ mime: "image/png" }));
  assert.throws(() => S.key({ sha256: "zu-kurz", mime: "image/png" }));
});

test("AS3 · Das echte Asset wird aufgenommen und verifiziert", () => {
  const ein = S.ingest(BYTES, VARIANTE, { freshReadback: true,
    contentId: ERGEBNIS.content_id, visualVariantId: VARIANTE.visual_variant_id,
    generator: "chatgpt-work" });
  assert.equal(ein.ok, true, ein.explanation);
  assert.equal(ein.transport, "ASSET_VERIFIED");
  assert.equal(ein.reference.sha256, VARIANTE.asset_sha256);
  assert.equal(ein.reference.width, 1122);
  assert.equal(ein.reference.byteSize, VARIANTE.asset_byte_size);
});

test("AS4 · Ein Verweis traegt keine erfundene Adresse", () => {
  /* Ob und unter welcher URL ein Asset oeffentlich erreichbar ist,
     entscheidet die Infrastruktur. Eine hier geratene Adresse waere
     genau die erfundene Faehigkeit, die der Owner ausgeschlossen hat. */
  const ref = S.reference({ sha256: "c".repeat(64), mime: "image/png" });
  assert.equal(ref.url, undefined);
  assert.equal(ref.publicUrl, undefined);
  assert.equal(ref.storage, "VU_OBJECT_STORAGE");
});

test("AS5 · Ein Transportfehler loest KEINE neue Erzeugung aus", () => {
  /* Der Kern. Der Agent hat ein gueltiges Bild erzeugt; die Datei ist
     unterwegs zerbrochen. Ein neuer Lauf kostete eine begrenzte
     Ressource, erzeugte ein ANDERES Bild und wuerfe eine erbrachte
     Leistung weg. */
  const kaputt = S.ingest(BYTES.subarray(0, 5000), VARIANTE, { freshReadback: true });
  assert.equal(kaputt.ok, false);
  assert.equal(kaputt.transport, "ASSET_TRANSPORT_INTEGRITY_FAILED");
  assert.equal(kaputt.generation, "IMAGE_GENERATION_SUCCESS");
  assert.equal(kaputt.regenerate, false);
});

test("AS6 · Ein Transportfehler ist kein Inhaltsurteil", () => {
  /* Sonst lernte das System, dass FUTURE_TECH schlecht laeuft — weil
     einmal eine Leitung abbrach. */
  const kaputt = S.ingest(BYTES.subarray(0, 5000), VARIANTE, { freshReadback: true });
  assert.equal(kaputt.contentJudgement, false);
  assert.deepEqual(kaputt.mustNotLearnAs,
    ["CONTENT_FAILED", "HOOK_FAILED", "VISUAL_STRATEGY_FAILED", "EVIDENCE_FAILED"]);
});

test("AS7 · Nur eine verlorene Quelle rechtfertigt einen neuen Lauf", () => {
  const nurTransport = S.needsRegeneration({
    generation: "IMAGE_GENERATION_SUCCESS", sourceAvailable: true });
  assert.equal(nurTransport.regenerate, false);
  assert.equal(nurTransport.reason, "transportOnly");

  const weg = S.needsRegeneration({
    generation: "IMAGE_GENERATION_SUCCESS", sourceAvailable: false });
  assert.equal(weg.regenerate, true);
  assert.equal(weg.reason, "sourceGone");
  /* Und dann ausdruecklich als neuer versionierter Vorgang. */
  assert.match(weg.message, /NEUER versionierter Creative-Vorgang/);

  const nieErzeugt = S.needsRegeneration({ generation: "IMAGE_GENERATION_FAILED" });
  assert.equal(nieErzeugt.regenerate, true);
  assert.equal(nieErzeugt.reason, "noValidSource");
});

test("AS8 · Die beiden Lebenslaeufe teilen kein Vokabular", () => {
  /* Solange ein Zustand in beiden Listen stuende, koennte eine Stelle
     ihn als Erzeugungsfehler und eine andere als Transportfehler
     lesen. */
  S.ERZEUGUNG.forEach((z) => assert.equal(S.TRANSPORT.includes(z), false, z));
  assert.ok(S.ERZEUGUNG.includes("IMAGE_GENERATION_SUCCESS"));
  assert.ok(S.TRANSPORT.includes("ASSET_TRANSPORT_INTEGRITY_FAILED"));
});

test("AS9 · Ein geerbtes Asset wird erneut vollstaendig geprueft", () => {
  /* Eine redaktionelle Ueberarbeitung erzeugt kein Bild — sie
     uebernimmt das verifizierte des Quell-Objekts. Geerbt heisst aber
     NICHT ungeprueft: dasselbe Asset kann zwischen zwei Laeufen im
     Repository beschaedigt werden, und ein Vertrauen, das sich auf eine
     frueher bestandene Pruefung beruft, prueft nichts. */
  const brief = JSON.parse(readFileSync(
    join(ROOT, "authoring/requests/vu-xom-20260911-rev1/authoring-brief.json"), "utf8"));
  const lese = (p) => readFileSync(join(ROOT, p));

  const g = S.inherit(brief, lese, { freshReadback: true,
    contentId: brief.content_id });
  assert.equal(g.ok, true, g.explanation);
  assert.equal(g.inherited, true);
  assert.equal(g.fromContentId, "vu-xom-20260911");
  assert.equal(g.transport, "ASSET_VERIFIED");
  assert.equal(g.reference.sha256, brief.reuse_visual.asset_sha256);

  /* Und ein beschaedigtes Erbe faellt auf. */
  const kaputt = S.inherit(brief, (p) => lese(p).subarray(0, 4000),
    { freshReadback: true });
  assert.equal(kaputt.ok, false);
  assert.equal(kaputt.transport, "ASSET_TRANSPORT_INTEGRITY_FAILED");
  assert.equal(kaputt.regenerate, false);
});

test("AS10 · Erst eine verlorene Quelle rechtfertigt neue Erzeugung", () => {
  const brief = JSON.parse(readFileSync(
    join(ROOT, "authoring/requests/vu-xom-20260911-rev1/authoring-brief.json"), "utf8"));
  const weg = S.inherit(brief, () => null, { freshReadback: true });
  assert.equal(weg.ok, false);
  assert.equal(weg.reason, "sourceGone");
  assert.equal(weg.sourceAvailable, false);
  assert.match(weg.explanation, /erst DAS ist ein Grund/);
});

test("AS11 · Eine Revision ohne Verweis faellt frueh auf", () => {
  /* Sonst stuende am Owner-Gate ein Kandidat ohne Bild. */
  const ohne = S.inherit({ content_id: "x" }, () => null, {});
  assert.equal(ohne.ok, false);
  assert.equal(ohne.reason, "noReuseDeclared");
});
