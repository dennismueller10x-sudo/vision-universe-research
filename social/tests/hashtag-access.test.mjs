/* =========================================================================
   VISION UNIVERSE SOCIAL — social/tests/hashtag-access.test.mjs

   DER UNTERSCHIED, DER EINEN OWNER-SCHRITT WERT IST

   Nach dem ersten echten Lauf kamen acht Hashtag-Abfragen mit
   `permissionRevoked` zurueck, und die naheliegende Erklaerung lautete:
   ein Recht fehlt, also noch einmal autorisieren.

   Sie war falsch. Die Hashtag-Suche braucht zweierlei von Meta:

     RECHTE          aus der Autorisierung - ein erneuter OAuth-Lauf
                     holt sie nach
     FREISCHALTUNG   "Instagram Public Content Access", ein FEATURE der
                     App aus der App-Ueberpruefung - keine Autorisierung
                     der Welt holt es nach

   Meta antwortet in beiden Faellen gleich. Wer daraus den falschen
   Schluss zieht, verbraucht eine einmalige Owner-Aktion fuer nichts
   und steht danach vor derselben Meldung.

   Diese Tests halten die Unterscheidung fest - und vor allem den
   dritten Fall: wenn wir es nicht wissen, folgt kein Owner-Schritt.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const H = require("../engines/hashtag-access.js");

const ALLE_RECHTE = ["instagram_basic", "pages_read_engagement",
  "instagram_manage_insights", "instagram_content_publish"];

/* -------------------------------------------- Fehlendes Recht: behebbar */

test("HA1 · Fehlt ein Recht, hilft ein erneuter OAuth-Lauf", () => {
  const d = H.diagnose({
    grantedScopes: ["instagram_basic", "pages_read_engagement"],
    probe: { ok: false, reason: "permissionRevoked" }
  });
  assert.equal(d.state, H.DIAGNOSE.MISSING_SCOPE);
  assert.deepEqual(d.missingScopes, ["instagram_manage_insights"]);
  assert.equal(d.reauthorizationHelps, true);
  assert.equal(d.ownerActionRequired.kind, "REAUTHORIZE");
  assert.equal(d.ownerActionRequired.oneTime, true);
});

/* ------------------------------------- Fehlendes Feature: NICHT behebbar */

test("HA2 · Alle Rechte da und trotzdem abgewiesen heisst: Feature fehlt", () => {
  const d = H.diagnose({
    grantedScopes: ALLE_RECHTE,
    probe: { ok: false, reason: "permissionRevoked" }
  });
  assert.equal(d.state, H.DIAGNOSE.MISSING_APP_REVIEW_FEATURE);
  assert.deepEqual(d.missingScopes, []);
  assert.equal(d.featureLikelyMissing, true);
  assert.equal(d.ownerActionRequired.kind, "APP_REVIEW");
  assert.equal(d.ownerActionRequired.feature, "Instagram Public Content Access");
});

test("HA3 · In diesem Fall wird ausdruecklich VOR der Reautorisierung gewarnt", () => {
  /* Der teure Fehler, gegen den diese Datei geschrieben ist. */
  const d = H.diagnose({
    grantedScopes: ALLE_RECHTE,
    probe: { ok: false, reason: "permissionRevoked" }
  });
  assert.equal(d.reauthorizationHelps, false);
  assert.match(d.ownerActionRequired.doNot, /Keine erneute Autorisierung/);
});

test("HA4 · Das Feature ist kein Recht — und sagt das von sich selbst", () => {
  assert.equal(H.BENOETIGTES_FEATURE.grantableByReauthorization, false);
  assert.equal(H.BENOETIGTES_FEATURE.grantedBy, "APP_REVIEW");
  assert.equal(H.BENOETIGTE_RECHTE.includes("Instagram Public Content Access"), false,
    "Ein Feature gehoert nicht in die Rechteliste");
});

/* -------------------------------------------- Unbekannt bleibt unbekannt */

test("HA5 · Unlesbare Rechte plus Abweisung ergeben KEINEN Owner-Schritt auf Verdacht", () => {
  /* Der haeufigste Fall bei der Business-Anmeldung: die Rechtemenge
     steht in einer Konfiguration bei Meta. `null` ist nicht "keine". */
  const d = H.diagnose({
    grantedScopes: null,
    probe: { ok: false, reason: "permissionRevoked" }
  });
  assert.equal(d.state, H.DIAGNOSE.UNKNOWN);
  assert.equal(d.ownerActionRequired.kind, "MEASURE_FIRST");
  assert.equal(d.reauthorizationHelps, null);
  assert.match(d.ownerActionRequired.measure, /debug_token/);
});

test("HA6 · Ohne Messung wird gar nichts behauptet", () => {
  const d = H.diagnose({});
  assert.equal(d.state, H.DIAGNOSE.UNKNOWN);
  assert.equal(d.ownerActionRequired, null);
  assert.match(d.explanation, /Abwesenheit einer Messung/);
  /* Und der Hinweis, dass der Versuch nichts kostet. */
  assert.match(d.explanation, /kostet keinen Platz/);
});

/* ------------------------------------------------- Was KEIN Befund ist */

test("HA7 · Ein Token- oder Ratenfehler sagt ueber Rechte nichts", () => {
  for (const grund of ["tokenExpired", "rateLimited", "providerOutage"]) {
    const d = H.diagnose({ grantedScopes: ALLE_RECHTE,
      probe: { ok: false, reason: grund } });
    assert.equal(d.state, H.DIAGNOSE.UNKNOWN, grund);
    assert.equal(d.ownerActionRequired, null, grund);
  }
});

test("HA8 · Ein gelungener Versuch schlaegt die Rechteliste", () => {
  /* Bei der Business-Anmeldung ist die Liste unvollstaendig lesbar.
     Wenn die Abfrage funktioniert, ist die Frage beantwortet - eine
     Luecke in der Liste ist dann keine Luecke in der Wirklichkeit. */
  const d = H.diagnose({
    grantedScopes: ["instagram_basic"],
    probe: { ok: true }
  });
  assert.equal(d.state, H.DIAGNOSE.OK);
  assert.equal(d.ownerActionRequired, null);
  assert.match(d.explanation, /wiegt schwerer als die Liste/);
});

/* --------------------------------------------------- Der Grund reist mit */

test("HA9 · Der kanonische Grund genuegt — Rohcodes werden auch akzeptiert", () => {
  /* Der Worker loescht Meta-Codes an seiner Grenze. Diese Datei liegt
     darueber und kommt ohne sie aus. */
  assert.equal(H.istZugriffsfehler("permissionRevoked"), true);
  assert.equal(H.istZugriffsfehler({ reason: "permissionRevoked" }), true);
  assert.equal(H.istZugriffsfehler({ code: 10 }), true);
  assert.equal(H.istZugriffsfehler({ error_subcode: 458 }), true);
  assert.equal(H.istZugriffsfehler("rateLimited"), false);
  assert.equal(H.istZugriffsfehler(null), false);
});

test("HA10 · Beide Wege fuehren zur selben Diagnose", () => {
  const kanonisch = H.diagnose({ grantedScopes: ALLE_RECHTE,
    probe: { ok: false, reason: "permissionRevoked" } });
  const roh = H.diagnose({ grantedScopes: ALLE_RECHTE,
    probe: { ok: false, error: { code: 10 } } });
  assert.equal(kanonisch.state, roh.state);
});

/* =================================== Der Versuch darf keinen Platz kosten */

test("HA11 · Probiert wird nur gegen ein noch offenes Fenster", async () => {
  const { offenerHashtag } = await import("../../scripts/social/verify-hashtag-access.mjs");
  const P = require("../engines/hashtag-portfolio.js");

  const bestand = P.record({}, [
    { hashtag: "aktien", ok: false, reason: "permissionRevoked" },
    { hashtag: "boerse", ok: false, reason: "permissionRevoked" }
  ], "2026-09-19T18:00:00Z");

  /* Innerhalb der sieben Tage: eine erneute Abfrage zaehlt nicht noch
     einmal - der Versuch ist gratis. */
  assert.ok(["aktien", "boerse"].includes(
    offenerHashtag(bestand, "2026-09-20T10:00:00Z")));

  /* Danach: KEIN Versuch. Einen neuen Platz auszugeben, nur um eine
     Fehlermeldung zu lesen, waere der teuerste aller Tests. */
  assert.equal(offenerHashtag(bestand, "2026-09-30T10:00:00Z"), null);
});

test("HA12 · Ohne Bestand wird nicht probiert", async () => {
  const { offenerHashtag } = await import("../../scripts/social/verify-hashtag-access.mjs");
  assert.equal(offenerHashtag({}, "2026-09-20T10:00:00Z"), null);
  assert.equal(offenerHashtag(null, "2026-09-20T10:00:00Z"), null);
});

test("HA13 · Gewaehlt wird der mit dem meisten Fenster", async () => {
  const { offenerHashtag } = await import("../../scripts/social/verify-hashtag-access.mjs");
  const P = require("../engines/hashtag-portfolio.js");
  let bestand = P.record({}, [{ hashtag: "alt", ok: true, observedMediaCount: 5 }],
    "2026-09-15T10:00:00Z");
  bestand = P.record(bestand, [{ hashtag: "neu", ok: true, observedMediaCount: 5 }],
    "2026-09-19T10:00:00Z");
  assert.equal(offenerHashtag(bestand, "2026-09-20T10:00:00Z"), "neu");
});

test("HA14 · Probiert wird ein KERN-Hashtag, damit kein Platz verloren gehen kann", async () => {
  /* Ob das Fenster wirklich offen ist, wissen wir nicht sicher - die
     acht vom 19.09. gelten als verbraucht, weil das die teurere und
     damit richtige Annahme war.

     Ein Kern-Hashtag loest das: ist das Fenster offen, ist die Abfrage
     gratis; ist es doch zu, kostet sie einen Platz, den wir fuer genau
     diesen Hashtag ohnehin ausgegeben haetten. Bei einem
     Erkundungs-Hashtag waere der zweite Fall ein verlorener Platz. */
  const { offenerHashtag } = await import("../../scripts/social/verify-hashtag-access.mjs");
  const P = require("../engines/hashtag-portfolio.js");

  const bestand = P.record({}, [
    { hashtag: "nvidia", role: "EXPLORATION", ok: false, reason: "permissionRevoked" },
    { hashtag: "aktien", role: "CORE", ok: false, reason: "permissionRevoked" }
  ], "2026-09-19T17:57:26Z");

  assert.equal(offenerHashtag(bestand, "2026-09-20T10:00:00Z"), "aktien");
});

test("HA15 · Ohne Kern-Hashtag wird der mit dem meisten Fenster genommen", async () => {
  const { offenerHashtag } = await import("../../scripts/social/verify-hashtag-access.mjs");
  const P = require("../engines/hashtag-portfolio.js");
  let bestand = P.record({}, [{ hashtag: "alt", role: "EXPLORATION", ok: true,
    observedMediaCount: 4 }], "2026-09-15T10:00:00Z");
  bestand = P.record(bestand, [{ hashtag: "neu", role: "EXPLORATION", ok: true,
    observedMediaCount: 4 }], "2026-09-19T10:00:00Z");
  assert.equal(offenerHashtag(bestand, "2026-09-20T10:00:00Z"), "neu");
});
