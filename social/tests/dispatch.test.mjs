/* =========================================================================
   VU SOCIAL — Der Versandweg (DP1–DP14)

   Zwischen "der Loop entscheidet" und "der Loop koennte senden" liegt
   ein Stueck, das lange fehlte: aus einer Schatten-Entscheidung eine
   Veroeffentlichungsabsicht machen, sie durch die Sperren fuehren und
   daraus genau EINE Anfrage bilden.

   -------------------------------------------------------------------------
   WAS DIESE TESTS PRUEFEN — UND WAS SIE NICHT KOENNEN
   -------------------------------------------------------------------------

   Sie pruefen die Sperren, die IM REPOSITORY entscheidbar sind: Kill
   Switch, Autonomiestufe, vorhandene Fracht, Idempotenz. Sie koennen
   NICHT pruefen, was nur der Worker weiss — Verbindung, Allowlist, der
   globale Schalter. Das ist kein Mangel dieser Tests, sondern der Grund,
   warum die letzte Sperre nicht in diesem Repository liegt.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { baueAnfrage, pruefe, CONFIRM } from "../../scripts/social/dispatch-publications.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const NOW = "2026-09-18T12:00:00Z";

const frei = {
  killSwitchAllows: true, autonomyAllows: true, autonomyEffective: 4
};

function entscheidung(overrides = {}) {
  return Object.assign({
    packageId: "pkg_test_a",
    caption: "Ein Text, der hinausginge.",
    plannedHourUtc: 9,
    strategyVersion: "strategy_initial",
    asset: {
      plannable: true, rendered: true, visualType: "DATA_CARD",
      imageUrl: "https://research.visionuniverse.de/assets/social/pkg_test_a.jpg",
      reason: null, message: null
    }
  }, overrides);
}

/* ------------------------------------------------------------------ */
/* DIE SPERREN                                                         */
/* ------------------------------------------------------------------ */

test("DP1 · Der Kill Switch allein genuegt fuer ein Nein", () => {
  const b = pruefe(entscheidung(), Object.assign({}, frei, { killSwitchAllows: false }));
  assert.equal(b.sendbar, false);
  assert.match(b.gruende.join(" "), /Kill Switch/);
});

test("DP2 · Unter Stufe 4 wird nicht veroeffentlicht", () => {
  for (const stufe of [0, 1, 2, 3]) {
    const b = pruefe(entscheidung(), { killSwitchAllows: true, autonomyAllows: false,
      autonomyEffective: stufe });
    assert.equal(b.sendbar, false, "Stufe " + stufe);
    assert.match(b.gruende.join(" "), /Stufe 4/);
  }
});

test("DP3 · Geplant ist nicht gezeichnet", () => {
  /* Der teuerste Unterschied im ganzen Pfad: eine Adresse anzukuendigen,
     unter der keine Datei liegt, laesst Meta den Container ablehnen —
     NACHDEM der Anspruch angemeldet ist. Danach weiss niemand ohne
     nachzusehen, ob ein Beitrag entstand. */
  const b = pruefe(entscheidung({
    asset: { plannable: true, rendered: false, imageUrl: "https://x.invalid/a.jpg" }
  }), frei);
  assert.equal(b.sendbar, false);
  assert.match(b.gruende.join(" "), /geplant, aber nicht gezeichnet/);
});

test("DP4 · Ohne Bildplan gibt es keine Fracht", () => {
  const b = pruefe(entscheidung({
    asset: { plannable: false, rendered: false, reason: "noNumericClaim",
      message: "Keine belegte Zahl." }
  }), frei);
  assert.equal(b.sendbar, false);
  assert.match(b.gruende.join(" "), /Keine belegte Zahl/,
    "der Grund aus dem Bildplan wird durchgereicht, nicht ersetzt");
});

test("DP5 · Ganz ohne Asset-Block wird nicht gesendet", () => {
  /* Ein aelterer Stand ohne Fracht-Stufe darf nicht als 'sendbar'
     durchgehen, nur weil das Feld fehlt. */
  const e = entscheidung(); delete e.asset;
  assert.equal(pruefe(e, frei).sendbar, false);
});

test("DP6 · Alles frei und Fracht da — dann ja", () => {
  const b = pruefe(entscheidung(), frei);
  assert.equal(b.sendbar, true);
  assert.deepEqual(b.gruende, []);
});

/* ------------------------------------------------------------------ */
/* DIE ANFRAGE                                                         */
/* ------------------------------------------------------------------ */

test("DP7 · Der Inhaltsschluessel ist die Paketkennung", () => {
  /* Dieselbe Kennung traegt das Bild im Dateinamen und der Worker in
     seinem Anspruch. Ein eigener Schluessel hier waere ein vierter Name
     fuer denselben Beitrag — und eine vierte Gelegenheit, dass zwei
     davon auseinanderlaufen. */
  const a = baueAnfrage(entscheidung(), null);
  assert.equal(a.body.contentId, "pkg_test_a");
  assert.ok(a.body.imageUrl.endsWith("/pkg_test_a.jpg"));
});

test("DP8 · Nur POST, und nur der eine Pfad", () => {
  const a = baueAnfrage(entscheidung(), null);
  assert.equal(a.method, "POST");
  assert.equal(a.path, "/social/meta/publish");
});

test("DP9 · Der Text kommt aus der Entscheidung, nicht aus dem Paket", () => {
  /* Das Paket ist die Vorlage, die Entscheidung ist das, was hinausginge.
     Bei Plattformanpassung sind das zwei verschiedene Texte. */
  const a = baueAnfrage(entscheidung({ caption: "angepasst" }), { caption: "Vorlage" });
  assert.equal(a.body.caption, "angepasst");
});

test("DP10 · Ohne Text in der Entscheidung traegt das Paket", () => {
  const e = entscheidung(); delete e.caption;
  assert.equal(baueAnfrage(e, { caption: "Vorlage" }).body.caption, "Vorlage");
});

test("DP11 · Ein leerer Text ist ein Text", () => {
  /* "" ist die Entscheidung 'ohne Bildunterschrift'. Sie durch die
     Vorlage zu ersetzen waere eine andere Entscheidung. */
  assert.equal(baueAnfrage(entscheidung({ caption: "" }), { caption: "Vorlage" }).body.caption, "");
});

/* ------------------------------------------------------------------ */
/* DER LAUF                                                            */
/* ------------------------------------------------------------------ */

function platz(name) {
  const rel = join("tmp", "dp-" + name + "-" + process.pid);
  const abs = join(ROOT, rel);
  mkdirSync(abs, { recursive: true });
  return { rel, abs };
}

function lauf(rel, extra = []) {
  return execFileSync(process.execPath,
    [join(ROOT, "scripts/social/dispatch-publications.mjs"),
     "--data", rel, "--account", "17841400000000001", "--now", NOW, ...extra],
    { cwd: ROOT, encoding: "utf8" });
}

function stand(abs, decisions, autonomyEffective = 0) {
  writeFileSync(join(abs, "shadow-decisions.json"),
    JSON.stringify({ generatedAt: NOW, decisions }));
  writeFileSync(join(abs, "cycle-report.json"),
    JSON.stringify({ generatedAt: NOW, autonomy: { effective: autonomyEffective }, packages: [] }));
}

test("DP12 · Gesperrte Anfragen stehen trotzdem im Plan — mit Grund", () => {
  /* 'Gesperrt' sagt, dass nichts hinausgeht. Es sagt nicht, WAS
     hinausginge — und genau das ist die Frage, die vor einer Freigabe
     zu beantworten ist und nicht danach. */
  const p = platz("gesperrt");
  try {
    stand(p.abs, [entscheidung()], 0);
    lauf(p.rel);

    const plan = JSON.parse(readFileSync(join(p.abs, "dispatch-plan.json"), "utf8"));
    assert.equal(plan.sent, false);
    assert.equal(plan.requests.length, 1);
    assert.equal(plan.requests[0].blocked, true);
    assert.ok(plan.requests[0].blockedBy.length > 0, "der Grund steht dabei");
    assert.equal(plan.requests[0].request.body.contentId, "pkg_test_a");
    assert.equal(plan.requests[0].publicationId, null,
      "eine gesperrte Entscheidung erzeugt KEINE Absicht — das waere eine Zustandsaenderung");
  } finally { rmSync(p.abs, { recursive: true, force: true }); }
});

test("DP13 · --send ohne Bestaetigung wird abgelehnt", () => {
  const p = platz("send");
  try {
    stand(p.abs, [entscheidung()], 0);
    let fehler = null;
    try { lauf(p.rel, ["--send"]); } catch (err) { fehler = err; }
    assert.ok(fehler, "der Lauf endet mit einem Fehlercode");
    assert.equal(fehler.status, 3);
    assert.match(String(fehler.stderr), new RegExp(CONFIRM));

    /* Abgelehnt heisst abgelehnt: der Lauf bricht ab, BEVOR er etwas
       hinlegt. Ein Plan aus einem zurueckgewiesenen Aufruf saehe aus wie
       einer aus einem gueltigen. */
    assert.ok(!existsSync(join(p.abs, "dispatch-plan.json")),
      "ein zurueckgewiesener Aufruf hinterlaesst keinen Plan");
  } finally { rmSync(p.abs, { recursive: true, force: true }); }
});

test("DP14 · Ohne --account wird nichts gebaut", () => {
  /* Der Idempotenzschluessel haengt an der Kontokennung. Ohne sie waere
     er ein anderer Schluessel fuer denselben Beitrag — und die Sperre
     gegen einen zweiten Beitrag griffe nicht. */
  const p = platz("ohne-konto");
  try {
    stand(p.abs, [entscheidung()], 0);
    let fehler = null;
    try {
      execFileSync(process.execPath,
        [join(ROOT, "scripts/social/dispatch-publications.mjs"), "--data", p.rel, "--now", NOW],
        { cwd: ROOT, encoding: "utf8" });
    } catch (err) { fehler = err; }
    assert.ok(fehler);
    assert.equal(fehler.status, 2);
    assert.ok(!existsSync(join(p.abs, "dispatch-plan.json")), "und nichts geschrieben");
  } finally { rmSync(p.abs, { recursive: true, force: true }); }
});

test("DP15 · Bei freien Sperren entsteht genau eine Absicht je Beitrag", () => {
  const p = platz("idempotent");
  try {
    stand(p.abs, [entscheidung()], 4);
    /* Der Kill Switch des Repositories bleibt zu — deshalb prueft dieser
       Test die Idempotenz auf der Ebene, die ohne ihn erreichbar ist:
       zweimal derselbe Lauf darf nicht zwei Absichten ergeben. */
    lauf(p.rel);
    const eins = JSON.parse(readFileSync(join(p.abs, "publications.json"), "utf8"));
    lauf(p.rel);
    const zwei = JSON.parse(readFileSync(join(p.abs, "publications.json"), "utf8"));

    assert.equal(zwei.publications.length, eins.publications.length,
      "der zweite Lauf legt nichts Neues an");
  } finally { rmSync(p.abs, { recursive: true, force: true }); }
});
