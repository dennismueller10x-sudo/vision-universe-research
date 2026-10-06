/* =========================================================================
   VISION UNIVERSE SOCIAL — social/tests/asset-transport.test.mjs

   PR 106 hat zwei Dinge gleichzeitig gezeigt, die nichts miteinander zu
   tun haben: der Agent hat ein Bild ERZEUGT, und das Bild ist nicht
   ANGEKOMMEN.

   Diese Tests halten die Trennung fest - und pruefen den Transport mit
   einem BEKANNT GUTEN Bild aus einem erfolgreichen Proof, ohne ein
   einziges neues Bild erzeugen zu lassen. Transport und Bilderzeugung
   sind getrennte Fragen und werden getrennt geprueft.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const T = require("../engines/asset-transport.js");
const I = require("../engines/asset-integrity.js");

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/* Das bekannt gute Bild: das Asset aus dem verifizierten Bildproof.
   Es liegt im Repository, also kostet dieser Test keinen Work-Aufruf. */
const GUT_REF = "origin/authoring/request/vu-image-trigger-proof-20260917-001:" +
  "authoring/requests/vu-image-trigger-proof-20260917-001/assets/visual-01.png";

function bekanntGut() {
  return execFileSync("git", ["show", GUT_REF],
    { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 });
}

const HABEN_WIR = (() => {
  try { return bekanntGut().length > 0; } catch { return false; }
})();

const wenn = HABEN_WIR ? {} :
  { skip: "Das bekannt gute Asset ist in diesem Klon nicht erreichbar." };

/* ------------------------------------------------------------------ */
/* DER BEKANNT GUTE TRANSPORT                                          */
/* ------------------------------------------------------------------ */

test("AT1 · Ein bekannt gutes Bild ueberlebt Schreiben und Ruecklesen byteidentisch",
  wenn, () => {
  /* Der Kern: Transport unabhaengig von Bilderzeugung pruefen. Das Bild
     ist bereits erzeugt und verifiziert - was hier geprueft wird, ist
     allein der Weg durch git. */
  const bild = bekanntGut();
  const wurzel = mkdtempSync(join(tmpdir(), "vu-transport-"));
  try {
    const g = (...a) => execFileSync("git", a, { cwd: wurzel, stdio: "ignore" });
    g("init", "-q");
    g("config", "user.email", "test@example.invalid");
    g("config", "user.name", "Test");

    mkdirSync(join(wurzel, "assets"), { recursive: true });
    writeFileSync(join(wurzel, "assets/visual-01.png"), bild);
    g("add", "-A");
    g("commit", "-q", "-m", "asset");

    /* FRISCH vom Commit gelesen, nicht aus dem Puffer von oben. */
    const zurueck = execFileSync("git", ["show", "HEAD:assets/visual-01.png"],
      { cwd: wurzel, maxBuffer: 64 * 1024 * 1024 });

    const befund = T.verifyTransfer(zurueck, {
      asset_path: "assets/visual-01.png",
      asset_sha256: I.sha256(bild),
      mime_type: "image/png",
      width: 1254, height: 1254,
      byte_size: bild.length
    }, { freshReadback: true });

    assert.equal(befund.ok, true, befund.explanation);
    assert.equal(befund.state, "TRANSFER_VERIFIED");
    assert.equal(befund.measured.sha256, I.sha256(bild));
    assert.equal(befund.measured.byteSize, bild.length);
    assert.equal(befund.measured.structure.ok, true);
  } finally { rmSync(wurzel, { recursive: true, force: true }); }
});

test("AT2 · Ein an derselben Stelle wie PR 106 beschaedigtes Bild faellt durch",
  wenn, () => {
  /* Nachgestellt aus dem echten Befund: die Kette brach bei Offset
     416.983, die Datei endete auf exakt 768 KiB plus zwoelf Bytes, die
     wie ein IEND-Chunk aussahen und keiner waren. */
  const bild = bekanntGut();
  const KAPUTT = Buffer.concat([
    bild.subarray(0, 416983),
    Buffer.alloc(786432 - 416983, 0x5a),
    Buffer.from("000000049454e44ae4260820", "hex")
  ]);

  const befund = T.verifyTransfer(KAPUTT, {
    asset_path: "assets/visual-01.png",
    asset_sha256: I.sha256(bild),
    mime_type: "image/png", width: 1254, height: 1254,
    byte_size: bild.length
  }, { freshReadback: true });

  assert.equal(befund.ok, false);
  assert.equal(befund.state, "ASSET_TRANSPORT_INTEGRITY_FAILED");
  const geprueft = befund.findings.map((f) => f.check);
  assert.ok(geprueft.includes("imageStructureValid"));
  assert.ok(geprueft.includes("sha256Match"));
  assert.ok(geprueft.includes("byteSizeValid"));
});

test("AT3 · Ein Bild mit gutem Ende und kaputter Mitte faellt auf", wenn, () => {
  /* Die eigentliche Lehre aus PR 106. Die Endepruefung war eine
     Stichprobe an einer Stelle; sie hat nur zugeschlagen, weil die
     Verschiebung zufaellig auch diese Stelle traf. Ein Bild mit intaktem
     IEND und zerstoerter Mitte haette sie passieren lassen. */
  const bild = bekanntGut();
  const mitte = Math.floor(bild.length / 2);
  const KAPUTT = Buffer.concat([
    bild.subarray(0, mitte),
    bild.subarray(mitte + 5000)          /* 5000 Bytes fehlen mittendrin */
  ]);

  /* Das Ende ist unversehrt - die alte Pruefung sagt "vollstaendig". */
  assert.equal(I.isComplete(KAPUTT, "image/png").ok, true,
    "die Endepruefung sollte hier nichts merken - das ist der Punkt");

  /* Die Kettenpruefung nicht. */
  assert.equal(I.structure(KAPUTT, "image/png").ok, false);

  const befund = T.verifyTransfer(KAPUTT, {
    asset_path: "a.png", asset_sha256: I.sha256(bild),
    mime_type: "image/png", width: 1254, height: 1254, byte_size: bild.length
  }, { freshReadback: true });
  assert.equal(befund.state, "ASSET_TRANSPORT_INTEGRITY_FAILED");
});

/* ------------------------------------------------------------------ */
/* COMPLETED IST NICHT COMPLETED                                       */
/* ------------------------------------------------------------------ */

test("AT4 · Der Agent darf `completed` melden, ohne dass es gilt", wenn, () => {
  /* Der reale Fall: processing.status = completed im selben Commit wie
     ein beschaedigtes Asset. Der Agent hat nicht gelogen - er hat
     berichtet, was er von seiner Seite sehen konnte. Nur ist das eine
     andere Frage. */
  const bild = bekanntGut();
  const KAPUTT = Buffer.concat([bild.subarray(0, 416983),
    Buffer.from("000000049454e44ae4260820", "hex")]);

  const transfer = T.verifyTransfer(KAPUTT, {
    asset_path: "a.png", asset_sha256: I.sha256(bild),
    mime_type: "image/png", width: 1254, height: 1254, byte_size: bild.length
  }, { freshReadback: true });

  const abschluss = T.verifyCompletion({
    agentStatus: "completed", resultJsonValid: true, identitiesValid: true,
    transfer: transfer
  });

  assert.equal(abschluss.agentReportedCompleted, true);
  assert.equal(abschluss.vuVerifiedCompleted, false);
  assert.ok(abschluss.missing.length > 0);
  assert.match(abschluss.explanation, /Aussage ueber seinen Lauf/);
});

test("AT5 · Erst wenn ALLE neun Pruefungen stehen, gilt VU_VERIFIED_COMPLETED",
  wenn, () => {
  const bild = bekanntGut();
  const transfer = T.verifyTransfer(bild, {
    asset_path: "a.png", asset_sha256: I.sha256(bild),
    mime_type: "image/png", width: 1254, height: 1254, byte_size: bild.length
  }, { freshReadback: true });

  const ganz = T.verifyCompletion({ agentStatus: "completed",
    resultJsonValid: true, identitiesValid: true, transfer });
  assert.equal(ganz.vuVerifiedCompleted, true);
  assert.deepEqual(ganz.missing, []);

  /* Eine einzige fehlende Pruefung genuegt. */
  const ohneIdentitaet = T.verifyCompletion({ agentStatus: "completed",
    resultJsonValid: true, identitiesValid: false, transfer });
  assert.equal(ohneIdentitaet.vuVerifiedCompleted, false);
  assert.deepEqual(ohneIdentitaet.missing, ["identitiesValid"]);
});

test("AT6 · Ohne frischen Rueckleseweg gibt es kein Bestehen", wenn, () => {
  /* Gegen den Puffer zu pruefen, aus dem geschrieben wurde, prueft den
     Transport nicht - es prueft nur, dass wir richtig abgeschrieben
     haben. */
  const bild = bekanntGut();
  const befund = T.verifyTransfer(bild, {
    asset_path: "a.png", asset_sha256: I.sha256(bild),
    mime_type: "image/png", width: 1254, height: 1254, byte_size: bild.length
  }, { freshReadback: false });

  assert.equal(befund.ok, false);
  assert.ok(befund.findings.some((f) => f.check === "freshReadbackValid"));
});

/* ------------------------------------------------------------------ */
/* TRANSPORT IST KEIN INHALTSURTEIL                                    */
/* ------------------------------------------------------------------ */

test("AT7 · Ein abgerissener Transfer sagt nichts ueber den Inhalt", wenn, () => {
  /* Der wichtigste Test dieser Datei. Es der Hook, der Visual Strategy
     oder der Evidenz anzulasten, dass eine Datei unterwegs zerbrochen
     ist, wuerde kuenftige Inhalte nach etwas aussortieren, das mit
     Inhalt nichts zu tun hat. */
  const bild = bekanntGut();
  const KAPUTT = bild.subarray(0, 416983);
  const befund = T.verifyTransfer(KAPUTT, {
    asset_path: "a.png", asset_sha256: I.sha256(bild),
    mime_type: "image/png", width: 1254, height: 1254, byte_size: bild.length
  }, { freshReadback: true });

  assert.equal(befund.contentJudgement, false);
  assert.equal(befund.failureType, "ASSET_TRANSPORT_INTEGRITY_FAILED");
  assert.notEqual(befund.failureType, "RESULT_INVALID");
});

test("AT8 · Eine fehlende Groessenangabe besteht nicht stillschweigend", wenn, () => {
  /* Fehlt die Ankuendigung, ist das ein Befund ueber den Vertrag. Ein
     stilles "ok" waere eine Pruefung, die nichts geprueft hat. */
  const bild = bekanntGut();
  const befund = T.verifyTransfer(bild, {
    asset_path: "a.png", asset_sha256: I.sha256(bild),
    mime_type: "image/png", width: 1254, height: 1254
  }, { freshReadback: true });
  assert.equal(befund.checks.byteSizeValid, null);
});

/* ------------------------------------------------------------------ */
/* DIE WIEDERHERSTELLUNG OHNE GESCHICHTSFAELSCHUNG                     */
/* ------------------------------------------------------------------ */

const R = await import("../../scripts/social/recover-asset-transfer.mjs");

test("AT9 · Das beschaedigte Asset behaelt einen Platz", wenn, () => {
  /* Der erste Bildproof brauchte einen Force-Update. Als einmalige
     Rettung in Ordnung, als Produktionspfad das Gegenteil von
     Provenance: der Beweis, DASS etwas schiefging, verschwaende mit dem
     Schaden. */
  assert.equal(R.quarantaenePfad("a/b/visual-01.png", 1),
    "a/b/visual-01.failed-01.png");
  assert.equal(R.quarantaenePfad("a/b/visual-01.png", 2),
    "a/b/visual-01.failed-02.png");
  assert.equal(R.quarantaenePfad("ohne-endung", 1), "ohne-endung.failed-01");
});

test("AT10 · Eine Quelle mit falschem Hash wird abgewiesen", wenn, () => {
  /* Ein Recovery, das sich seine Wahrheit selbst ausdenkt, ist keines.
     Die Quelle muss den Hash tragen, den der Agent angekuendigt hat -
     sonst waere sie ein anderes Bild, und das Ergebnis behauptete etwas
     Falsches. */
  const bild = bekanntGut();
  const wurzel = mkdtempSync(join(tmpdir(), "vu-recover-src-"));
  try {
    const p = join(wurzel, "fremd.png");
    writeFileSync(p, bild);

    const befund = R.pruefeQuelle(p, {
      asset_path: "a.png",
      asset_sha256: "0".repeat(64),      /* ein anderer Hash */
      mime_type: "image/png", width: 1254, height: 1254
    });
    assert.equal(befund.ok, false);
    assert.equal(befund.reason, "sourceInvalid");
  } finally { rmSync(wurzel, { recursive: true, force: true }); }
});

test("AT11 · Eine geprueft korrekte Quelle wird angenommen", wenn, () => {
  const bild = bekanntGut();
  const wurzel = mkdtempSync(join(tmpdir(), "vu-recover-src-"));
  try {
    const p = join(wurzel, "gut.png");
    writeFileSync(p, bild);
    const befund = R.pruefeQuelle(p, {
      asset_path: "a.png", asset_sha256: I.sha256(bild),
      mime_type: "image/png", width: 1254, height: 1254, byte_size: bild.length
    });
    assert.equal(befund.ok, true, befund.explanation);
    assert.equal(befund.sha256, I.sha256(bild));
  } finally { rmSync(wurzel, { recursive: true, force: true }); }
});

test("AT12 · Eine fehlende Quelle erfindet nichts", wenn, () => {
  const befund = R.pruefeQuelle("/gibt/es/nicht.png", { asset_path: "a.png" });
  assert.equal(befund.ok, false);
  assert.equal(befund.reason, "sourceMissing");
});

/* ------------------------------------------------------------------ */
/* EINE PRUEFUNG, DIE NICHT LIEF, IST KEINE BESTANDENE PRUEFUNG        */
/* ------------------------------------------------------------------ */

test("AT13 · Ohne Ankuendigung besteht nichts stillschweigend", wenn, () => {
  /* Der Vertrag existiert, damit AGENT_REPORTED_COMPLETED nicht
     ausreicht. Eine Pruefung, die ohne Ankuendigung auf true springt,
     dreht genau das um: sie bescheinigt, was niemand behauptet hat. */
  const bild = bekanntGut();
  const befund = T.verifyTransfer(bild, { asset_path: "a.png" },
    { freshReadback: true });

  assert.equal(befund.ok, false);
  assert.equal(befund.checks.mimeValid, null);
  assert.equal(befund.checks.dimensionsValid, null);
  assert.equal(befund.checks.byteSizeValid, null);
  assert.equal(befund.checks.sha256Match, null);
  /* Was die Datei selbst hergibt, wird trotzdem geprueft. */
  assert.equal(befund.checks.assetExists, true);
  assert.equal(befund.checks.imageStructureValid, true);

  const ab = T.verifyCompletion({ transfer: befund, resultJsonValid: true,
    identitiesValid: true, agentStatus: "completed" });
  assert.equal(ab.agentReportedCompleted, true);
  assert.equal(ab.vuVerifiedCompleted, false);
  assert.ok(ab.missing.includes("byteSizeValid"));
});

test("AT14 · Die Groessenpruefung liest die Schreibweise des Ergebnisschemas", wenn, () => {
  /* Das Ergebnisschema schreibt `asset_byte_size`; die Pruefung erwartete
     `byte_size`. Der Unterschied blieb unsichtbar, solange eine fehlende
     Ankuendigung still bestand - die Groessenpruefung lief deshalb bei
     keinem einzigen realen Ergebnis. Beide Schreibweisen zaehlen jetzt,
     und eine falsche Groesse faellt auf. */
  const bild = bekanntGut();
  const schema = {
    asset_path: "a.png", asset_sha256: I.sha256(bild),
    mime_type: "image/png", width: 1254, height: 1254,
    asset_byte_size: bild.length
  };
  const gut = T.verifyTransfer(bild, schema, { freshReadback: true });
  assert.equal(gut.checks.byteSizeValid, true, gut.explanation);
  assert.equal(gut.ok, true, gut.explanation);

  const falsch = T.verifyTransfer(bild,
    Object.assign({}, schema, { asset_byte_size: bild.length - 1 }),
    { freshReadback: true });
  assert.equal(falsch.checks.byteSizeValid, false);
  assert.equal(falsch.failureType, T.TRANSPORT_FEHLER);
  assert.equal(falsch.contentJudgement, false);
});
