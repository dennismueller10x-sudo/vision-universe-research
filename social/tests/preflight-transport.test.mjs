/* =========================================================================
   VU SOCIAL — DIE TRANSPORTHUELLE VOR DER BEURTEILUNG ABZIEHEN

   Cloudflare liefert einen Modul-Worker als multipart/form-data aus, mit
   einer bei jedem Abruf neu gewuerfelten Trennmarke.

   Aufgefallen ist das an einer Ungereimtheit in zwei echten Laeufen:
   derselbe unveraenderte Worker meldete beide Male 752 Bytes, aber
   verschiedene sha256-Praefixe (471d36efc10d8fcd und 0dbc53bb2a91da4a).

   Gleiche Groesse, anderer Fingerabdruck — das kann kein Inhalt sein,
   der sich geaendert hat. Eine Trennmarke fester Laenge mit zufaelligem
   Inhalt erklaert genau dieses Muster.

   Ein Fingerabdruck, der bei gleichem Inhalt wechselt, ist keiner. Er
   haette spaeter eine echte Aenderung am Worker nicht von Rauschen
   unterscheiden koennen — und die Sicherung vor einem Deployment haette
   kein lauffaehiges JavaScript enthalten, sondern ein Formular.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { extractWorkerSource, classifyScript } from "../../scripts/social/preflight-worker.mjs";

const CODE = `export default {
  async fetch(request, env, ctx) {
    return new Response("Hello World!");
  },
};
`;

/* So sieht die Antwort der Cloudflare-API aus. Die Trennmarke ist der
   einzige Teil, der sich zwischen zwei Abrufen unterscheidet. */
function multipartResponse(boundary) {
  return `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="worker.js"; filename="worker.js"\r\n` +
    `Content-Type: application/javascript+module\r\n\r\n` +
    CODE +
    `\r\n--${boundary}--\r\n`;
}

const CT = (b) => `multipart/form-data; boundary=${b}`;

test("T1 · Der Quelltext kommt ohne Huelle heraus", () => {
  const raw = multipartResponse("formdata-undici-0475830583");
  const result = extractWorkerSource(raw, CT("formdata-undici-0475830583"));
  assert.equal(result.multipart, true);
  assert.equal(result.parts, 1);
  assert.equal(result.source.trim(), CODE.trim());
  assert.ok(!result.source.includes("Content-Disposition"),
    "Kopfzeilen duerfen nicht im Ergebnis stehen");
});

test("T2 · Derselbe Code ergibt denselben Fingerabdruck, egal welche Trennmarke", () => {
  /* Das ist der eigentliche Befund: zwei Abrufe, zwei Trennmarken,
     ein Inhalt. */
  const a = extractWorkerSource(multipartResponse("formdata-undici-0475830583"),
    CT("formdata-undici-0475830583"));
  const b = extractWorkerSource(multipartResponse("formdata-undici-0999111222"),
    CT("formdata-undici-0999111222"));

  const hash = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16);
  assert.equal(hash(a.source), hash(b.source),
    "Gleicher Inhalt muss denselben Fingerabdruck ergeben");
});

test("T3 · Ohne Auspacken waere der Fingerabdruck verschieden gewesen", () => {
  /* Der Gegenbeweis zu T2 — er zeigt, dass der Test etwas pruefen kann. */
  const rawA = multipartResponse("formdata-undici-0475830583");
  const rawB = multipartResponse("formdata-undici-0999111222");
  const hash = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16);
  assert.notEqual(hash(rawA), hash(rawB));
  assert.equal(rawA.length, rawB.length,
    "Gleiche Laenge bei anderem Inhalt — genau das Muster aus den echten Laeufen");
});

test("T4 · Die Trennmarke wird auch ohne Content-Type erkannt", () => {
  /* Auf die Kopfzeilen allein soll das nicht beruhen: fehlt der
     Content-Type, steht die Trennmarke immer noch in der ersten Zeile. */
  const result = extractWorkerSource(multipartResponse("formdata-undici-0475830583"), "");
  assert.equal(result.multipart, true);
  assert.equal(result.source.trim(), CODE.trim());
});

test("T5 · Nackter Quelltext bleibt unveraendert", () => {
  const result = extractWorkerSource(CODE, "application/javascript");
  assert.equal(result.multipart, false);
  assert.equal(result.source, CODE);
});

test("T6 · Metadaten-Teile gehoeren nicht in die Beurteilung", () => {
  const boundary = "formdata-undici-0123456789";
  const raw =
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="metadata"\r\n` +
    `Content-Type: application/json\r\n\r\n` +
    `{"main_module":"worker.js"}\r\n` +
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="worker.js"; filename="worker.js"\r\n` +
    `Content-Type: application/javascript+module\r\n\r\n` +
    CODE +
    `\r\n--${boundary}--\r\n`;
  const result = extractWorkerSource(raw, CT(boundary));
  assert.equal(result.parts, 1, "Nur der Code-Teil zaehlt");
  assert.ok(!result.source.includes("main_module"));
});

test("T7 · Die Huelle haette die Groesse verfaelscht", () => {
  const raw = multipartResponse("formdata-undici-0475830583");
  const mitHuelle = classifyScript(raw).signals.bytes;
  const ohneHuelle = classifyScript(extractWorkerSource(raw, CT("formdata-undici-0475830583")).source).signals.bytes;
  assert.ok(mitHuelle > ohneHuelle,
    "Die gemeldeten 752 Bytes enthielten Trennmarken und Kopfzeilen");
});

test("T8 · Laesst sich nichts herausloesen, wird der Rohtext beurteilt", () => {
  /* Lieber zu viel beurteilen als zu wenig: ein unverstandenes Format
     darf nicht dazu fuehren, dass gar nichts geprueft wird. */
  const raw = `--formdata-undici-0123456789\r\nkaputt\r\n`;
  const result = extractWorkerSource(raw, CT("formdata-undici-0123456789"));
  assert.equal(result.parts, 0);
  assert.equal(result.source, raw);
});

test("T9 · Die ausgepackte Vorlage wird weiterhin als Vorlage erkannt", () => {
  /* Der Anschluss an die Klassifikation: das Auspacken darf das Urteil
     aus dem echten Lauf nicht kippen. */
  const raw = multipartResponse("formdata-undici-0475830583");
  const verdict = classifyScript(extractWorkerSource(raw, CT("formdata-undici-0475830583")).source);
  assert.equal(verdict.id, "cloudflare-default-template");
  assert.equal(verdict.safeToReplace, true);
});

test("T10 · Ein Token im Rumpf wird auch durch die Huelle hindurch gefunden", () => {
  /* Die Huelle darf kein Versteck sein. */
  const boundary = "formdata-undici-0123456789";
  const token = "EA" + "A".repeat(45);
  const raw =
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="worker.js"; filename="worker.js"\r\n` +
    `Content-Type: application/javascript+module\r\n\r\n` +
    `const t = "${token}";\nexport default { fetch: () => new Response(t) };\r\n` +
    `--${boundary}--\r\n`;
  const verdict = classifyScript(extractWorkerSource(raw, CT(boundary)).source);
  assert.equal(verdict.signals.containsTokenShape, true);
  assert.equal(verdict.safeToReplace, false);
});
