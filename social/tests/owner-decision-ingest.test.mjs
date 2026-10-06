/* =========================================================================
   VISION UNIVERSE SOCIAL — social/tests/owner-decision-ingest.test.mjs

   DER RUECKWEG EINER OWNER-ENTSCHEIDUNG

   -------------------------------------------------------------------------
   DIE LUECKE, DIE DIESER WEG SCHLIESST
   -------------------------------------------------------------------------

   Der Owner entscheidet im Browser. Der Worker haelt die Entscheidung
   fest - er kann nicht ins Repository schreiben. Dort aber gehoert sie
   hin: dort liegen die Kandidaten, dort steht die Zustandsmaschine,
   dort wertet decide-candidate.mjs einen Ablehnungsgrund als
   Rueckmeldung ueber die AUSWAHL aus.

   Ohne diesen Rueckweg waere die Entscheidung eine Zeile in einem
   Schluessel-Wert-Speicher am Rand des Netzes. Der naechste
   Orchestratorlauf wuesste nichts davon, boete denselben Kandidaten
   erneut an - und der Ablehnungsgrund, um dessentwillen die Ablehnung
   ueberhaupt einen Pflichttext hat, lernte nichts.

   -------------------------------------------------------------------------
   WAS HIER GEPRUEFT WIRD
   -------------------------------------------------------------------------

   Nicht, dass ein Skript laeuft. Sondern dass am Ende im Repository
   steht, was der Owner entschieden hat - und zwar durch den
   BESTEHENDEN Weg, mit allem, was daran haengt.

   Die Tests arbeiten auf einem eigenen Datenstand. Der produktive wird
   nicht angefasst.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ContentHash = require("../engines/content-hash.js");

const { befehleFuer, hole } = await import("../../scripts/social/ingest-owner-decisions.mjs");

const INHALT = "pkg_ingest_probe";
const BILD = "https://research.visionuniverse.de/assets/social/pkg_ingest_probe.jpg";
const TEXT = "Ein Beitrag, ueber den entschieden wird.";

/** Ein eigener Datenstand mit genau einem wartenden Kandidaten. */
function datenstand(candidateId = "cand_20260920_probe") {
  const wurzel = mkdtempSync(join(tmpdir(), "vu-ingest-"));
  const dir = join(wurzel, "publish-candidates");
  mkdirSync(dir, { recursive: true });

  const kandidat = {
    candidateId, version: 1, state: "AWAITING_APPROVAL",
    createdAt: "2026-09-20T08:00:00.000Z",
    content: { contentId: INHALT, imageUrl: BILD, caption: TEXT },
    contentHash: ContentHash.contentHash({ contentId: INHALT, imageUrl: BILD, caption: TEXT }),
    presentation: { topic: "Probe", hook: "Ein Hook.", caption: TEXT,
      mediaFormat: "IMAGE", visualType: "CHART", plannedHourUtc: 18 },
    provenance: { signalIds: ["sig_probe"], opportunityId: "opp_probe",
      archetype: "STOCK_STORY", hook: "Ein Hook.", mediaFormat: "IMAGE",
      visualType: "CHART", strategyVersion: "strategy_initial",
      approval: null, mediaId: null, measurements: [] }
  };
  writeFileSync(join(dir, candidateId + ".json"), JSON.stringify(kandidat, null, 2));
  return { wurzel, dir, candidateId, kandidat };
}

function lies(pfad) {
  return existsSync(pfad) ? JSON.parse(readFileSync(pfad, "utf8")) : null;
}

/* ------------------------------------------------- Die Uebersetzung */

test("OI1 · Eine Ablehnung wird zum bestehenden Ablehnungsaufruf", () => {
  const befehle = befehleFuer({
    candidateId: "cand_x", decision: "REJECTED",
    reason: "Der Hook ist zu technisch.", decidedBy: "owner",
    decidedAt: "2026-09-20T12:00:00.000Z"
  }, { dir: "irgendwo" });

  assert.equal(befehle.length, 1);
  const b = befehle[0];
  assert.equal(b[0], "scripts/social/decide-candidate.mjs",
    "Es wird der bestehende Weg gerufen und kein zweiter.");
  assert.ok(b.includes("--reject"));
  assert.ok(b.includes("Der Hook ist zu technisch."));
  assert.ok(!b.includes("--approve"));
});

test("OI2 · Eine Freigabe ohne Versand traegt keine Medien-ID nach", () => {
  const befehle = befehleFuer({ candidateId: "cand_x", decision: "APPROVED",
    published: false, mediaId: null });
  assert.equal(befehle.length, 1);
  assert.ok(befehle[0].includes("--approve"));
});

test("OI3 · Eine veroeffentlichte Freigabe traegt sie nach", () => {
  /* Die Medien-ID ist der Beleg, an dem spaeter die Messung haengt.
     Ohne sie liesse sich die Leistung dieses Beitrags nie zuordnen -
     und der Rueckweg des Loops waere an dieser Stelle unterbrochen. */
  const befehle = befehleFuer({ candidateId: "cand_x", decision: "APPROVED",
    published: true, mediaId: "media_555", permalink: "https://x.invalid/p/1" });
  assert.equal(befehle.length, 2);
  assert.equal(befehle[1].art, "publication");
});

test("OI4 · Ein unbekannter Zustand wird nicht geraten", () => {
  /* Er wird auch nicht quittiert. Ein Brief, den niemand versteht,
     bleibt im Briefkasten, statt geoeffnet und weggeworfen zu werden. */
  for (const zustand of ["HELD_FOR_ENRICHMENT", "IRGENDWAS", null, undefined]) {
    assert.equal(befehleFuer({ candidateId: "cand_x", decision: zustand }), null,
      String(zustand));
  }
});

/* ------------------------------------------- Der Weg bis ins Repository */

test("OI5 · Eine abgeholte Ablehnung steht danach wirklich im Datenstand", (t) => {
  const { wurzel, dir, candidateId } = datenstand();
  t.after(() => rmSync(wurzel, { recursive: true, force: true }));

  const befehle = befehleFuer({
    candidateId, decision: "REJECTED", reason: "Das Thema traegt nicht.",
    decidedBy: "owner", decidedAt: "2026-09-20T12:00:00.000Z"
  }, { dir });

  execFileSync("node", befehle[0].concat(["--write"]), { cwd: ROOT, stdio: "pipe" });

  const k = lies(join(dir, candidateId + ".json"));
  assert.equal(k.state, "REJECTED", "Der Zustand ist nicht uebergegangen.");

  /* Und der Grund liegt dort, wo das Lernen ihn sucht. */
  const feedback = lies(join(wurzel, "approval-feedback.json"));
  assert.ok(feedback, "Die Rueckmeldung wurde nicht geschrieben.");
  const eintrag = (feedback.entries || feedback).find
    ? (feedback.entries || feedback).find((e) => e.candidateId === candidateId)
    : null;
  assert.ok(eintrag, "Kein Eintrag zu diesem Kandidaten.");
  assert.equal(eintrag.reason, "Das Thema traegt nicht.");
  /* "REJECT" und nicht "REJECTED": die Rueckmeldung haelt die HANDLUNG
     fest, der Kandidat seinen ZUSTAND. Zwei Vokabulare, jedes an der
     richtigen Stelle - und dieser Test hat sie im ersten Anlauf
     verwechselt. `befehleFuer` uebersetzt zwischen ihnen, und das ist
     die einzige Stelle, an der uebersetzt werden darf. */
  assert.equal(eintrag.decision, "REJECT");

  /* DIE WICHTIGE HAELFTE: keine Leistungsaussage. Der Beitrag ging nie
     hinaus; er hat keine Reichweite, weder eine schlechte noch eine
     gute. */
  assert.ok(!("performance" in eintrag));
  assert.match(eintrag.note, /nie\s+veroeffentlicht/);
  /* Die Herkunft reist mit, damit sich spaeter fragen laesst, ob der
     Owner bestimmte Archetypen oder Hooks ablehnt. */
  assert.equal(eintrag.archetype, "STOCK_STORY");
  assert.deepEqual(eintrag.signalIds, ["sig_probe"]);
});

test("OI6 · Eine abgeholte Freigabe steht danach als Freigabe da", (t) => {
  const { wurzel, dir, candidateId, kandidat } = datenstand("cand_20260920_frei");
  t.after(() => rmSync(wurzel, { recursive: true, force: true }));

  const befehle = befehleFuer({ candidateId, decision: "APPROVED",
    decidedBy: "owner", decidedAt: "2026-09-20T12:00:00.000Z" }, { dir });
  execFileSync("node", befehle[0].concat(["--write"]), { cwd: ROOT, stdio: "pipe" });

  const k = lies(join(dir, candidateId + ".json"));
  assert.equal(k.state, "APPROVED");
  assert.ok(k.approval, "Die Freigabe wurde nicht festgehalten.");
  /* Der Abdruck wird beim Freigeben NACHGERECHNET, nicht uebernommen -
     genau wie im Worker. Zwei Stellen, dieselbe Regel. */
  assert.equal(k.approval.contentHash, kandidat.contentHash);
  assert.equal(k.approval.approvedBy, "owner");
});

test("OI7 · Ein zweiter Brief aendert die Entscheidung nicht", (t) => {
  /* Der Fall ist real: geschrieben, aber nicht quittiert, weil der Lauf
     dazwischen abbrach. Der naechste Lauf bringt denselben Brief noch
     einmal - und darf die getroffene Entscheidung nicht ueberschreiben. */
  const { wurzel, dir, candidateId } = datenstand("cand_20260920_zweimal");
  t.after(() => rmSync(wurzel, { recursive: true, force: true }));

  const befehle = befehleFuer({ candidateId, decision: "REJECTED",
    reason: "Erster Grund.", decidedAt: "2026-09-20T12:00:00.000Z" }, { dir });
  execFileSync("node", befehle[0].concat(["--write"]), { cwd: ROOT, stdio: "pipe" });

  const zweite = befehleFuer({ candidateId, decision: "APPROVED",
    decidedAt: "2026-09-20T13:00:00.000Z" }, { dir });
  let code = 0;
  try {
    execFileSync("node", zweite[0].concat(["--write"]), { cwd: ROOT, stdio: "pipe" });
  } catch (err) { code = err.status; }

  assert.notEqual(code, 0, "Der zweite Brief ging durch.");
  const k = lies(join(dir, candidateId + ".json"));
  assert.equal(k.state, "REJECTED", "Die Owner-Entscheidung wurde ueberschrieben.");
});

/* ----------------------------------------------------- Ohne Schluessel */

test("OI8 · Ohne Admin-Schluessel wird nichts abgeholt und nichts behauptet", async () => {
  const ohne = await hole({ adminKey: null, fetchImpl: () => {
    throw new Error("Es haette gar nicht gefragt werden duerfen.");
  } });
  assert.equal(ohne.ok, false);
  assert.equal(ohne.state, "NO_ADMIN_KEY");
  assert.deepEqual(ohne.decisions, []);
});

test("OI9 · Ein Netzfehler ist kein leerer Briefkasten", async () => {
  /* Der Unterschied entscheidet, ob der naechste Lauf nachfasst oder
     annimmt, es gaebe nichts. */
  const kaputt = await hole({ adminKey: "x".repeat(40),
    fetchImpl: () => Promise.reject(new Error("connect ECONNREFUSED")) });
  assert.equal(kaputt.ok, false);
  assert.equal(kaputt.state, "NETWORK_ERROR");
  assert.deepEqual(kaputt.decisions, []);
});

test("OI10 · Gelesen wird mit dem Admin-Schluessel im Header", async () => {
  const gesehen = [];
  await hole({ adminKey: "geheim-genug-fuer-diesen-test-0123456789",
    worker: "https://worker.invalid",
    fetchImpl: async (u, init) => {
      gesehen.push({ url: u, auth: init.headers.Authorization });
      return { ok: true, status: 200,
        text: async () => JSON.stringify({ decisions: [] }) };
    } });

  assert.equal(gesehen.length, 1);
  assert.match(gesehen[0].auth, /^Bearer /);
  /* Und NICHT in der Adresszeile: sie landet in Protokollen, die
     niemand aufraeumt. */
  assert.ok(!gesehen[0].url.includes("geheim"));
});
