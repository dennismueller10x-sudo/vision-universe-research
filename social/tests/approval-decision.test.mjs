/* =========================================================================
   VU SOCIAL — APPROVE und REJECT (AD1–AD14)

   -------------------------------------------------------------------------
   DIE UNTERSCHEIDUNG, UM DIE ES HIER GEHT
   -------------------------------------------------------------------------

   Ein abgelehnter Beitrag wurde nie veroeffentlicht. Er hat keine
   Reichweite, keine Interaktionsrate und keine Zielerreichung — nicht
   eine schlechte, sondern GAR KEINE.

   Ihn als Leistung mit dem Wert 0 zu verbuchen waere die Aussage "dieses
   Format hat versagt", und sie waere frei erfunden: gemessen wurde
   nichts. Das System wuerde daraufhin Archetypen meiden, ueber die es
   nichts weiss — und der Owner haette mit einer Ablehnung aus
   Geschmacksgruenden eine Leistungsaussage erzeugt, die er nie gemacht
   hat.

   AD6 und AD7 sind die Tests dazu.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

import { feedbackEintrag, anfrageAusKandidat } from "../../scripts/social/decide-candidate.mjs";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ContentHash = require("../engines/content-hash.js");

const NOW = "2026-09-17T14:00:00Z";

function kandidat(over = {}) {
  const content = { contentId: "pkg_1",
    imageUrl: "https://research.visionuniverse.de/assets/social/pkg_1.jpg",
    caption: "Ein Text." };
  return Object.assign({
    candidateId: "cand_test_1",
    createdAt: NOW,
    state: "AWAITING_APPROVAL",
    content,
    contentHash: ContentHash.contentHash(content),
    presentation: { topic: "Thema A", hook: "Ein Hook.", plannedHourUtc: 9 },
    provenance: {
      signalIds: ["sig_1"], opportunityId: "opp_a", strategyVersion: "strategy_initial",
      archetype: "EXPLAIN_THE_MOVE", hook: "Ein Hook.", mediaFormat: "IMAGE",
      visualType: "DATA_CARD", caption: content.caption, plannedHourUtc: 9,
      experimentId: null, decidedMode: "EXPLOIT",
      approval: null, mediaId: null, measurements: [], learning: null
    }
  }, over);
}

function platz(name) {
  const rel = join("tmp", "ad-" + name + "-" + process.pid);
  const abs = join(ROOT, rel);
  mkdirSync(abs, { recursive: true });
  return { rel, abs };
}

function lauf(rel, id, extra) {
  return execFileSync(process.execPath,
    [join(ROOT, "scripts/social/decide-candidate.mjs"),
     "--candidate", id, "--dir", rel, "--now", NOW, ...extra],
    { cwd: ROOT, encoding: "utf8" });
}

function legeAn(abs, k) {
  writeFileSync(join(abs, k.candidateId + ".json"), JSON.stringify(k, null, 2));
}

/* ------------------------------------------------------------------ */
/* DIE FREIGABE                                                        */
/* ------------------------------------------------------------------ */

test("AD1 · Freigabe setzt Zustand, Abdruck und Herkunft", () => {
  const p = platz("approve");
  try {
    legeAn(p.abs, kandidat());
    const aus = lauf(p.rel, "cand_test_1", ["--approve", "--by", "owner"]);
    assert.match(aus, /FREIGEGEBEN von owner/);

    const k = JSON.parse(readFileSync(join(p.abs, "cand_test_1.json"), "utf8"));
    assert.equal(k.state, "APPROVED");
    assert.equal(k.approval.approvedBy, "owner");
    assert.equal(k.approval.contentHash, k.contentHash);
    /* Auch in der Kette — sie ist der Ort, an dem spaeter gefragt wird. */
    assert.equal(k.provenance.approval.approvedBy, "owner");
  } finally { rmSync(p.abs, { recursive: true, force: true }); }
});

test("AD2 · Die Anfrage traegt die Freigabe mit", () => {
  const p = platz("anfrage");
  try {
    legeAn(p.abs, kandidat());
    lauf(p.rel, "cand_test_1", ["--approve"]);
    const a = JSON.parse(readFileSync(join(p.abs, "cand_test_1.request.json"), "utf8"));

    assert.equal(a.method, "POST");
    assert.equal(a.path, "/social/meta/publish");
    assert.equal(a.body.contentId, "pkg_1");
    assert.equal(a.body.approval.candidateId, "cand_test_1");
    assert.ok(a.body.approval.contentHash);
  } finally { rmSync(p.abs, { recursive: true, force: true }); }
});

test("AD3 · Ein nachtraeglich veraenderter Kandidat wird nicht freigegeben", () => {
  /* Zwischen dem Erzeugen und der Entscheidung ist die Datei eine Datei.
     Freigegeben wird der NACHGERECHNETE Abdruck, nicht der eingetragene. */
  const p = platz("veraendert");
  try {
    const k = kandidat();
    k.content.caption = "Etwas ganz anderes. Jetzt kaufen!";
    legeAn(p.abs, k);

    let fehler = null;
    try { lauf(p.rel, "cand_test_1", ["--approve"]); } catch (e) { fehler = e; }
    assert.ok(fehler);
    assert.equal(fehler.status, 4);
    assert.match(String(fehler.stderr), /ein anderer Kandidat/);

    const danach = JSON.parse(readFileSync(join(p.abs, "cand_test_1.json"), "utf8"));
    assert.equal(danach.state, "AWAITING_APPROVAL", "der Zustand bleibt unveraendert");
  } finally { rmSync(p.abs, { recursive: true, force: true }); }
});

test("AD4 · Zweimal entscheiden geht nicht", () => {
  const p = platz("zweimal");
  try {
    legeAn(p.abs, kandidat());
    lauf(p.rel, "cand_test_1", ["--approve"]);

    let fehler = null;
    try { lauf(p.rel, "cand_test_1", ["--reject", "--reason", "doch nicht"]); }
    catch (e) { fehler = e; }
    assert.ok(fehler, "die zweite Entscheidung wird abgelehnt");
    assert.equal(fehler.status, 3);
  } finally { rmSync(p.abs, { recursive: true, force: true }); }
});

test("AD5 · Beides oder keines ist keine Entscheidung", () => {
  const p = platz("unklar");
  try {
    legeAn(p.abs, kandidat());
    for (const args of [[], ["--approve", "--reject", "--reason", "x"]]) {
      let fehler = null;
      try { lauf(p.rel, "cand_test_1", args); } catch (e) { fehler = e; }
      assert.ok(fehler, JSON.stringify(args));
      assert.equal(fehler.status, 2);
    }
  } finally { rmSync(p.abs, { recursive: true, force: true }); }
});

/* ------------------------------------------------------------------ */
/* DIE ABLEHNUNG                                                       */
/* ------------------------------------------------------------------ */

test("AD6 · Eine Ablehnung erzeugt KEINE Leistungsaussage", () => {
  /* Der wichtigste Test dieser Datei. Ein Feld, das es nicht gibt, kann
     auch nicht versehentlich gefuellt werden. */
  const e = feedbackEintrag(kandidat(), "REJECT", { reason: "Ton zu werblich", now: NOW });

  assert.equal("performance" in e, false, "kein Leistungsfeld — auch nicht als null");
  assert.equal("score" in e, false);
  assert.equal("metrics" in e, false);
  assert.equal(e.decision, "REJECT");
  assert.equal(e.reason, "Ton zu werblich");
  assert.match(e.note, /nie\s+veroeffentlicht/);
  assert.match(e.note, /keinen Leistungsvergleich/);
});

test("AD7 · Die Ablehnung ist trotzdem auswertbar", () => {
  /* Sie ist eine Rueckmeldung ueber die AUSWAHL: lehnt der Owner
     bestimmte Archetypen ab? Bestimmte Uhrzeiten? Ohne die Herkunft
     waere die Ablehnung nur ein Satz. */
  const e = feedbackEintrag(kandidat(), "REJECT", { reason: "zu technisch", now: NOW });
  assert.equal(e.archetype, "EXPLAIN_THE_MOVE");
  assert.equal(e.visualType, "DATA_CARD");
  assert.equal(e.mediaFormat, "IMAGE");
  assert.equal(e.plannedHourUtc, 9);
  assert.equal(e.strategyVersion, "strategy_initial");
  assert.deepEqual(e.signalIds, ["sig_1"]);
  assert.equal(e.opportunityId, "opp_a");
});

test("AD8 · Eine Ablehnung ohne Grund wird abgelehnt", () => {
  /* Der Grund ist der einzige Ertrag einer Ablehnung. Ohne ihn ist sie
     als Rueckmeldung wertlos. */
  const p = platz("ohne-grund");
  try {
    legeAn(p.abs, kandidat());
    let fehler = null;
    try { lauf(p.rel, "cand_test_1", ["--reject"]); } catch (e) { fehler = e; }
    assert.ok(fehler);
    assert.equal(fehler.status, 2);
  } finally { rmSync(p.abs, { recursive: true, force: true }); }
});

test("AD9 \u00b7 Die Ablehnung landet in einer eigenen Datei", () => {
  /* Dieser Test schrieb frueher in social/data/approval-feedback.json —
     also in den echten Bestand — und raeumte hinterher auf. Das
     Aufraeumen war der Beweis, dass er wusste, was er tat.

     Die Rueckmeldung folgt jetzt dem Datenstand. Der Test braucht kein
     Sicherungsband mehr, weil er den Produktionsbestand gar nicht mehr
     erreicht. */
  const p = platz("feedback");
  const echt = join(ROOT, "social/data/approval-feedback.json");
  const unberuehrt = existsSync(echt) ? readFileSync(echt, "utf8") : null;
  try {
    legeAn(p.abs, kandidat());
    const aus = lauf(p.rel, "cand_test_1", ["--reject", "--reason", "Ton zu werblich"]);
    assert.match(aus, /ABGELEHNT/);
    assert.match(aus, /KEINE Leistung/);

    const eigene = join(p.abs, "approval-feedback.json");
    assert.ok(existsSync(eigene), "keine Rueckmeldung im eigenen Datenstand");
    const daten = JSON.parse(readFileSync(eigene, "utf8"));
    const meins = daten.entries.filter((e) => e.candidateId === "cand_test_1");
    assert.equal(meins.length, 1);
    assert.equal(meins[0].reason, "Ton zu werblich");

    const k = JSON.parse(readFileSync(join(p.abs, "cand_test_1.json"), "utf8"));
    assert.equal(k.state, "REJECTED");
    assert.equal(k.rejection.reason, "Ton zu werblich");

    /* Und der echte Bestand hat sich nicht geruehrt. */
    assert.equal(existsSync(echt) ? readFileSync(echt, "utf8") : null, unberuehrt,
      "der Testlauf hat den Produktionsbestand veraendert");
  } finally {
    rmSync(p.abs, { recursive: true, force: true });
  }
});

test("AD10 · Ein abgelehnter Kandidat erzeugt keine Anfrage", () => {
  const p = platz("keine-anfrage");
  try {
    legeAn(p.abs, kandidat());
    lauf(p.rel, "cand_test_1", ["--reject", "--reason", "nein"]);
    assert.ok(!existsSync(join(p.abs, "cand_test_1.request.json")));
  } finally {
    rmSync(p.abs, { recursive: true, force: true });
  }
});

test("AD11 · Der Abdruck in der Anfrage deckt genau den Inhalt", () => {
  const k = kandidat({ state: "APPROVED",
    approval: { approvedBy: "owner", approvedAt: NOW,
      contentHash: ContentHash.contentHash(kandidat().content) } });
  const a = anfrageAusKandidat(k);
  assert.equal(a.body.approval.contentHash, ContentHash.contentHash({
    contentId: a.body.contentId, imageUrl: a.body.imageUrl, caption: a.body.caption }));
});

test("AD12 · Ein unbekannter Kandidat ist ein Fehler, keine leere Entscheidung", () => {
  const p = platz("unbekannt");
  try {
    let fehler = null;
    try { lauf(p.rel, "cand_gibt_es_nicht", ["--approve"]); } catch (e) { fehler = e; }
    assert.ok(fehler);
    assert.equal(fehler.status, 2);
  } finally { rmSync(p.abs, { recursive: true, force: true }); }
});
