/* =========================================================================
   VU SOCIAL — KLASSIFIKATION DES VORHANDENEN WORKER-CODES

   Diese Funktion entscheidet, ob ein Deployment fremde produktive Logik
   ueberschreiben wuerde. Sie ist damit die einzige Stelle im Projekt, an
   der ein Irrtum nicht rueckgaengig zu machen ist: ein Worker-Deployment
   ersetzt den vorhandenen Code vollstaendig, und was dort lag, ist weg.

   -------------------------------------------------------------------------
   WARUM ES DIESE FUNKTION GIBT
   -------------------------------------------------------------------------

   Der erste Entwurf hat nach Byte-Groesse entschieden: alles ab 400 Bytes
   galt als fremde Logik. Der erste reale Lauf hat damit Cloudflares
   eigene "Hello World"-Vorlage (752 Bytes) als fremde Produktivlogik
   gemeldet und das Deployment gesperrt.

   Die Sperre war richtig — der Grund war falsch. Eine Groesse sagt nichts
   darueber, was ein Programm TUT.

   Behoben wurde das nicht, indem die Schwelle hochgesetzt wurde. Das
   haette denselben Fehler in die andere Richtung gemacht: ein kompaktes
   produktives Skript waere dann als Vorlage durchgegangen.

   -------------------------------------------------------------------------
   DIE RICHTUNG DES ZWEIFELS
   -------------------------------------------------------------------------

   Im Zweifel `custom-logic`. Ein falscher Alarm kostet eine Minute,
   ein uebersehener Fund kostet fremde Produktivlogik.

   Die Tests pruefen beide Richtungen: dass Vorlagen durchgelassen werden
   (P1-P3) UND dass alles, was nach Betrieb aussieht, haengen bleibt
   (P4-P9).
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";

import { classifyScript } from "../../scripts/social/preflight-worker.mjs";

/* Cloudflares Standardvorlage, wie sie beim Anlegen eines Workers
   entsteht. Das ist der Fall, der den ersten Lauf gesperrt hat. */
const CLOUDFLARE_DEFAULT = `/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run \`npm run dev\` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run \`npm run deploy\` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

export default {
  async fetch(request, env, ctx) {
    return new Response("Hello World!");
  },
};
`;

test("P1 · Cloudflares Standardvorlage darf ersetzt werden", () => {
  const result = classifyScript(CLOUDFLARE_DEFAULT);
  assert.equal(result.id, "cloudflare-default-template");
  assert.equal(result.safeToReplace, true);
  /* Der Fall, der den ersten Lauf gesperrt hat: die Groesse liegt weit
     ueber der alten 400-Byte-Schwelle. */
  assert.ok(result.signals.bytes > 400, "Die Vorlage ist groesser als die alte Schwelle");
  assert.equal(result.signals.externalHosts, 0, "developers.cloudflare.com steht nur im Kommentar");
  assert.equal(result.signals.usesEnvBindings, false);
});

test("P2 · Ein leerer Platzhalter darf ersetzt werden", () => {
  const result = classifyScript(`export default { fetch: () => new Response("ok") };`);
  assert.equal(result.safeToReplace, true);
  assert.equal(result.id, "minimal-stub");
});

test("P3 · Unser eigener Worker wird als solcher erkannt", () => {
  const ours = `
    // vision-universe-social
    import { createState } from "./state.js";
    export default {
      async fetch(request, env) {
        const url = new URL(request.url);
        if (url.pathname === "/social/meta/callback") return new Response("cb");
        return new Response("ok");
      }
    };`;
  const result = classifyScript(ours);
  assert.equal(result.id, "this-repository");
  assert.equal(result.safeToReplace, true);
  assert.equal(result.signals.hasOurRoutes, true);
});

test("P4 · Ein Skript mit ausgehenden Aufrufen bleibt haengen", () => {
  const result = classifyScript(`
    export default {
      async fetch(request) {
        const upstream = await fetch("https://api.example-partner.com/v1/orders");
        return upstream;
      }
    };`);
  assert.equal(result.id, "custom-logic");
  assert.equal(result.safeToReplace, false);
  assert.ok(result.signals.externalHosts >= 1);
  assert.match(result.note, /ausgehende Adresse/);
});

test("P5 · Ein Skript, das Bindungen liest, bleibt haengen", () => {
  const result = classifyScript(`
    export default {
      async fetch(request, env) {
        const value = await env.SOME_KV.get("key");
        return new Response(value);
      }
    };`);
  assert.equal(result.safeToReplace, false);
  assert.equal(result.signals.usesEnvBindings, true);
  assert.equal(result.signals.referencesKV, true);
});

test("P6 · Ein Skript mit Zugangsdaten wird weder ersetzt noch gesichert", () => {
  /* Zusammengesetzt statt hingeschrieben — ein Token-Literal in einer
     Testdatei ist von einem echten nicht zu unterscheiden. */
  const withToken = `const t = "EA${"A".repeat(45)}";\nexport default { fetch: () => new Response(t) };`;
  const result = classifyScript(withToken);
  assert.equal(result.id, "contains-credentials");
  assert.equal(result.safeToReplace, false);
  assert.equal(result.signals.containsTokenShape, true);
  assert.match(result.note, /weder gesichert\s+noch ersetzt|weder gesichert noch ersetzt/);
});

test("P7 · Auch eine Vorlage MIT ausgehendem Aufruf bleibt haengen", () => {
  /* Die Vorlagen-Signatur allein genuegt nicht: wer "Hello World" stehen
     laesst und darunter etwas Produktives baut, faellt sonst durch. */
  const result = classifyScript(`
    export default {
      async fetch(request, env) {
        await fetch("https://hooks.slack.com/services/T000/B000/XXXX", { method: "POST" });
        return new Response("Hello World!");
      }
    };`);
  assert.equal(result.id, "custom-logic");
  assert.equal(result.safeToReplace, false);
});

test("P8 · Eine grosse Datei ohne Vorlagen-Signatur bleibt haengen", () => {
  const result = classifyScript("// nur Kommentar\n".repeat(200) + "export default {};");
  assert.equal(result.id, "custom-logic");
  assert.equal(result.safeToReplace, false);
  assert.match(result.note, /keine Vorlagen-Signatur/);
});

test("P9 · Leerer oder unlesbarer Inhalt fuehrt nicht zu einem Freibrief", () => {
  /* Ein leeres Skript ist ein Stub und darf ersetzt werden — aber
     `undefined` darf nicht als "klein und harmlos" durchgehen. */
  assert.equal(classifyScript("").safeToReplace, true);
  const undef = classifyScript(undefined);
  assert.equal(undef.signals.bytes, 0);
  assert.equal(typeof undef.id, "string");
});

test("P10 · Die Klassifikation gibt niemals Quelltext zurueck", () => {
  const secretish = `const password = "sehr-geheimes-passwort-1234567890";\n` +
                    `export default { fetch: () => new Response("x") };`;
  const result = classifyScript(secretish);
  const serialized = JSON.stringify(result);
  assert.ok(!serialized.includes("sehr-geheimes-passwort"),
    "Der Bericht darf keine Zeile des vorhandenen Codes enthalten");
  assert.ok(!serialized.includes("export default"));
  /* Was er zurueckgibt, sind ausschliesslich Signale. */
  for (const key of Object.keys(result.signals)) {
    const value = result.signals[key];
    assert.ok(typeof value === "number" || typeof value === "boolean",
      `Signal ${key} ist weder Zahl noch Ja/Nein — es koennte Inhalt tragen`);
  }
});
