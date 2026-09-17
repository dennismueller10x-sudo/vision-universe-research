/* =========================================================================
   VISION UNIVERSE SOCIAL — social/tests/ingest-creative.test.mjs

   Das Einlesen wird gegen ein ECHTES git-Repository geprueft, nicht
   gegen einen Doppelgaenger von git. Der Blob-SHA ist der Kern der
   ganzen Kennungsrechnung; ihn gegen eine Nachbildung zu pruefen hiesse,
   die Nachbildung zu pruefen.

   Angelegt wird dafuer ein Wegwerf-Repo im Temp-Verzeichnis. Es kostet
   eine halbe Sekunde und beantwortet dafuer die Frage, die zaehlt: ob
   git und wir dieselbe Zahl fuer dieselben Bytes nennen.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

import { pruefeErgebnis, zeigeDatei, blobShaImRef } from "../../scripts/social/ingest-creative.mjs";

const require = createRequire(import.meta.url);
const ChatGptWork = require("../providers/authoring/chatgpt-work/adapter.js");

/* ------------------------------------------------------------------ */
/* EIN ECHTES, VOLLSTAENDIGES PNG                                      */
/* ------------------------------------------------------------------ */

function crc32(buf) {
  let c, tabelle = [];
  for (let n = 0; n < 256; n += 1) {
    c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    tabelle[n] = c >>> 0;
  }
  let crc = 0xFFFFFFFF;
  for (const b of buf) crc = tabelle[(crc ^ b) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function chunk(typ, daten) {
  const laenge = Buffer.alloc(4);
  laenge.writeUInt32BE(daten.length);
  const koerper = Buffer.concat([Buffer.from(typ, "ascii"), daten]);
  const pruef = Buffer.alloc(4);
  pruef.writeUInt32BE(crc32(koerper));
  return Buffer.concat([laenge, koerper, pruef]);
}

function png(breite, hoehe) {
  const zlib = require("node:zlib");
  const zeile = Buffer.concat([Buffer.from([0]),
    Buffer.concat(Array.from({ length: breite }, () => Buffer.from([10, 20, 60])))]);
  const roh = Buffer.concat(Array.from({ length: hoehe }, () => zeile));
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(breite, 0); ihdr.writeUInt32BE(hoehe, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(roh)),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

/* ------------------------------------------------------------------ */
/* DAS WEGWERF-REPOSITORY                                              */
/* ------------------------------------------------------------------ */

const CID = "vu-test-20260917";
const BREITE = 64, HOEHE = 80;

function baueRepo(anpassung) {
  const wurzel = mkdtempSync(join(tmpdir(), "vu-ingest-"));
  const g = (...a) => execFileSync("git", a, { cwd: wurzel, stdio: "ignore" });
  g("init", "-q");
  g("config", "user.email", "test@example.invalid");
  g("config", "user.name", "Test");

  const verzeichnis = join(wurzel, ChatGptWork.requestDir(CID));
  mkdirSync(join(verzeichnis, "assets"), { recursive: true });

  const brief = {
    schema_version: "1.0", brief_id: "brief_test", content_id: CID,
    hook_strategy: { hook_type: "value_first" }, publishing_allowed: false
  };
  const briefRoh = Buffer.from(JSON.stringify(brief, null, 2) + "\n", "utf8");
  writeFileSync(join(verzeichnis, "authoring-brief.json"), briefRoh);
  const sha = ChatGptWork.blobSha(briefRoh);

  const bild = png(BREITE, HOEHE);
  const assetPfad = ChatGptWork.requestDir(CID) + "/assets/visual-01.png";

  const hid = (i) => CID + ":" + sha + ":value_first:" + String(i).padStart(2, "0");
  const ergebnis = {
    schema_version: "1.0", brief_id: "brief_test", content_id: CID,
    author: { type: "chatgpt_work", role: "creative_agent" },
    hook_strategy: { hook_type: "value_first" },
    hook_variants: [
      { hook_variant_id: hid(1), hook_type: "value_first", text: "Erster Haken." },
      { hook_variant_id: hid(2), hook_type: "value_first", text: "Zweiter Haken." }
    ],
    recommended_hook: { recommended_hook_variant_id: hid(1), is_canonical_selection: false },
    caption: "Eine Bildunterschrift ohne Behauptung.",
    visual_variants: [{
      visual_variant_id: CID + ":" + sha + ":visual:FUTURE_TECH:01",
      visual_strategy: "FUTURE_TECH", brief_revision: sha,
      asset_path: assetPfad,
      asset_sha256: require("node:crypto").createHash("sha256").update(bild).digest("hex"),
      mime_type: "image/png", width: BREITE, height: HOEHE
    }],
    publishing_allowed: false
  };

  /* Erst der Brief allein — das ist der Stand, den der Zyklus sieht,
     solange der Agent noch arbeitet. */
  g("add", "-A");
  g("commit", "-q", "-m", "brief");
  const refNurBrief = execFileSync("git", ["rev-parse", "HEAD"],
    { cwd: wurzel, encoding: "utf8" }).trim();

  const gebaut = anpassung ? anpassung({ ergebnis, bild, sha }) : { ergebnis, bild };
  writeFileSync(join(verzeichnis, "authoring-result.json"),
    JSON.stringify(gebaut.ergebnis, null, 2) + "\n");
  writeFileSync(join(verzeichnis, "assets", "visual-01.png"), gebaut.bild);

  g("add", "-A");
  g("commit", "-q", "-m", "ergebnis");
  const ref = execFileSync("git", ["rev-parse", "HEAD"],
    { cwd: wurzel, encoding: "utf8" }).trim();
  return { wurzel, ref, refNurBrief, sha, assetPfad };
}


/* ------------------------------------------------------------------ */

test("IC1 · git und wir nennen denselben Blob-SHA", () => {
  /* Die Kennung jeder Hook-Variante haengt daran. Weichen die beiden
     Rechnungen ab, ist jede Variante formal falsch, obwohl niemand
     etwas falsch gemacht hat. */
  const repo = baueRepo();
  try {
    const pfad = ChatGptWork.requestDir(CID) + "/authoring-brief.json";
    const vonGit = blobShaImRef(repo.ref, pfad, repo.wurzel);
    assert.equal(vonGit, repo.sha);
  } finally { rmSync(repo.wurzel, { recursive: true, force: true }); }
});

test("IC2 · Ein vollstaendiges Ergebnis wird bestaetigt", () => {
  const repo = baueRepo();
  try {
    const b = pruefeErgebnis(repo.ref, CID, { repoRoot: repo.wurzel });
    assert.equal(b.state, "COMPLETED", b.explanation);
    assert.equal(b.ok, true);
    assert.equal(b.briefBlobSha, repo.sha);
    assert.equal(b.assets.state, "READBACK_VERIFIED");
  } finally { rmSync(repo.wurzel, { recursive: true, force: true }); }
});

test("IC3 · Ein abgeschnittenes Asset kommt nicht durch", () => {
  /* Der Befund aus dem echten Bildproof: der Anfang war intakt. Ein
     PNG, das mit der richtigen Signatur beginnt, ist noch kein PNG. */
  const repo = baueRepo(({ ergebnis, bild }) =>
    ({ ergebnis, bild: bild.subarray(0, Math.floor(bild.length * 0.6)) }));
  try {
    const b = pruefeErgebnis(repo.ref, CID, { repoRoot: repo.wurzel });
    assert.notEqual(b.state, "COMPLETED");
    assert.equal(b.ok, false);
    assert.match(b.explanation, /Asset/);
  } finally { rmSync(repo.wurzel, { recursive: true, force: true }); }
});

test("IC4 · Eine fremde Varianten-Kennung wird abgewiesen", () => {
  const repo = baueRepo(({ ergebnis, bild }) => {
    ergebnis.hook_variants[1].hook_variant_id = CID + ":deadbeef:value_first:02";
    return { ergebnis, bild };
  });
  try {
    const b = pruefeErgebnis(repo.ref, CID, { repoRoot: repo.wurzel });
    assert.equal(b.ok, false);
    assert.ok(b.verification.findings.some((f) => f.id === "hookIdMismatch"));
  } finally { rmSync(repo.wurzel, { recursive: true, force: true }); }
});

test("IC5 · Ein Agent, der die kanonische Auswahl trifft, wird abgewiesen", () => {
  const repo = baueRepo(({ ergebnis, bild }) => {
    ergebnis.selected_hook = ergebnis.hook_variants[0].hook_variant_id;
    return { ergebnis, bild };
  });
  try {
    const b = pruefeErgebnis(repo.ref, CID, { repoRoot: repo.wurzel });
    assert.equal(b.ok, false);
    assert.ok(b.verification.findings.some((f) => f.id === "canonicalSelectionByAgent"));
  } finally { rmSync(repo.wurzel, { recursive: true, force: true }); }
});

test("IC6 · Ohne Ergebnis ist der Zustand PENDING und kein Fehler", () => {
  const repo = baueRepo();
  try {
    const b = pruefeErgebnis(repo.ref, "vu-gibt-es-nicht", { repoRoot: repo.wurzel });
    assert.equal(b.state, "NO_BRIEF");
    assert.equal(b.pending, false);

    /* Und mit Brief, aber ohne Ergebnis: das ist der Normalfall. */
    const ohne = pruefeErgebnis(repo.refNurBrief, CID, { repoRoot: repo.wurzel });
    assert.equal(ohne.state, "PENDING");
    assert.equal(ohne.pending, true);
  } finally { rmSync(repo.wurzel, { recursive: true, force: true }); }
});
