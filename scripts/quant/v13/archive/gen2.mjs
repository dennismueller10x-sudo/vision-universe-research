#!/usr/bin/env node
// V13 – Schlüsselprüfung und zweite Archivgeneration (nur in GitHub Actions; Secrets nur aus env).
//
//   --mode keyaudit --manifests a.json,b.json,... --out <bericht.json>
//       Entpackt jeden wrappedKeyB64 mit V13_ARCHIVE_PRIVATE_KEY im Speicher und meldet je Teil NUR die Gesamtlänge des
//       Datenschlüssels und die wirksame Passphrasenlänge (Bytes vor dem ersten \n bzw. NUL – so liest `openssl enc
//       -pass file:`), dazu weak (< 32) und empty (= 0). Nie Schlüsselbytes, nie Hashes von Schlüsselbytes. Kein R2.
//   --mode regen --old-manifest <1.2.0> --old-prefix <P1> --prefix <P2> --version 2.0.0 --out-dir <dir>
//       Neue Generation aus der geprüften Wiederherstellung der alten: je Teil altes Objekt lesen, Chiffre-, Klartext-,
//       Inventar- und Datei-Hashes gegen das alte Manifest prüfen, den bytegleichen Klartext mit seal-part.sh (Hex-
//       Schlüssel) neu verschlüsseln und unter dem NEUEN Präfix hochladen. Vor jedem PUT: HEAD; existiert das Objekt,
//       bricht der Lauf ab (nichts wird überschrieben). Der alte Präfix wird nur gelesen. Ausgabe: manifest-<v>.json.
//   --mode verify2 --manifest <2.0.0> --old-manifest <1.2.0> --prefix <P2> --out <bericht.json>
//       Unabhängige Probe (eigener Lauf, frischer Runner): nur die neue Generation lesen, entschlüsseln und je Teil
//       Chiffre-, Klartext-, Inventar- und Datei-Hashes gegen das neue UND das alte Manifest prüfen; Schlüsselformat
//       (65 Byte, wirksam 64 Hex-Zeichen) und das Manifest-Objekt im Eimer (bytegleich mit dem committeten) prüfen.
// Der private Archivschlüssel steht nur in env und in einer 600er-Datei unter RUNNER_TEMP, die am Ende überschrieben
// wird. Log: nur Teilnamen, Zählungen, Längen und OK/Fehlercodes – keine Schlüssel, URLs oder Eimerpfade.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PREFIX_RE = /^research-snapshots\/quant-v13\/archive-\d+\.\d+\.\d+\/$/;

/** Wirksame Länge einer Passphrase, wie `openssl enc -pass file:` sie liest: bis zum ersten \n bzw. NUL. */
export function effectivePassLength(buf) {
  for (let i = 0; i < buf.length; i++) if (buf[i] === 0x0a || buf[i] === 0x00) return i;
  return buf.length;
}
/** Bewertung eines entpackten Datenschlüssels – nur Längen und Format, nie Inhalt. */
export function keyFacts(buf) {
  const eff = effectivePassLength(buf);
  const hex64Lf = buf.length === 65 && buf[64] === 0x0a && /^[0-9a-f]{64}$/.test(buf.subarray(0, 64).toString("latin1"));
  return { totalBytes: buf.length, effectiveBytes: eff, weak: eff < 32, empty: eff === 0, hex64Lf };
}
/** Zusammenfassung je Generation. */
export function auditSummary(rows) {
  return { parts: rows.length, weak: rows.filter(r => r.weak).length, empty: rows.filter(r => r.empty).length,
    le3: rows.filter(r => r.effectiveBytes <= 3).length, full: rows.filter(r => !r.weak).length,
    minEffective: rows.length ? Math.min(...rows.map(r => r.effectiveBytes)) : null, hex64Lf: rows.filter(r => r.hex64Lf).length };
}
/** Manifest der neuen Generation aus altem Manifest und neu versiegelten Teilen (rein, getestet). */
export function buildGen2Manifest({ old, oldManifestSha256, oldPrefix, prefix, version, createdAt, sealed }) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw Error("VERSION");
  if (prefix === oldPrefix) throw Error("PREFIX_MUST_DIFFER");
  if (sealed.length !== old.parts.length) throw Error("PART_COUNT");
  return {
    schemaVersion: "v13-research-archive-manifest-" + version,
    createdAt,
    cipher: "openssl enc -aes-256-cbc -pbkdf2 -iter 100000 -salt -pass file:<key>",
    keyFormat: "hex64-lf",
    keyWrap: old.keyWrap,
    archivePublicKeySha256Der: old.archivePublicKeySha256Der,
    storagePrefix: prefix,
    predecessor: { schemaVersion: old.schemaVersion, manifestSha256: oldManifestSha256, storagePrefix: oldPrefix,
      relation: "gleicher Klartext je Teil (plainSha256, inventorySha256 identisch), neu verschluesselt mit Hex-Datenschluesseln" },
    parts: old.parts.map((p, i) => {
      const s = sealed[i];
      if (s.part !== p.part) throw Error("PART_ORDER");
      return { part: p.part, object: p.object, files: p.files, plainSha256: p.plainSha256, plainBytes: p.plainBytes,
        cipherSha256: s.cipherSha256, cipherBytes: s.cipherBytes, inventorySha256: p.inventorySha256, wrappedKeyB64: s.wrappedKeyB64 };
    })
  };
}

const sha256File = (f) => { const h = createHash("sha256"); const fd = fs.openSync(f, "r"); const b = Buffer.alloc(1 << 22); let n;
  while ((n = fs.readSync(fd, b, 0, b.length, null)) > 0) h.update(b.subarray(0, n)); fs.closeSync(fd); return h.digest("hex"); };
const sha256 = (b) => createHash("sha256").update(b).digest("hex");

if (import.meta.url === `file://${process.argv[1]}`) {
  let code = 1;
  try { code = await main(); } catch (e) { console.error("FEHLER: " + String(e && e.message || e).split("\n")[0].slice(0, 200)); code = 1; }
  process.exitCode = code;
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (k, d = null) => { const i = args.indexOf(k); return i < 0 ? d : args[i + 1]; };
  const mode = opt("--mode");
  if (!["keyaudit", "regen", "verify2"].includes(mode)) { console.error("--mode keyaudit|regen|verify2"); return 2; }
  const runnerTemp = process.env.RUNNER_TEMP ? path.resolve(process.env.RUNNER_TEMP) : null;
  if (!runnerTemp) { console.error("nur in GitHub Actions (RUNNER_TEMP fehlt)"); return 2; }
  const keyPem = process.env.V13_ARCHIVE_PRIVATE_KEY || "";
  if (!keyPem.trim()) { console.log(JSON.stringify({ keycheck: "SECRET_MISSING" })); return 3; }
  const work = fs.mkdtempSync(path.join(runnerTemp, "v13g2-"));
  fs.chmodSync(work, 0o700);
  const keyFile = path.join(work, "k.pem");
  fs.writeFileSync(keyFile, keyPem.endsWith("\n") ? keyPem : keyPem + "\n", { mode: 0o600 });
  try {
    const der = execFileSync("openssl", ["pkey", "-in", keyFile, "-pubout", "-outform", "DER"], { stdio: ["ignore", "pipe", "ignore"] });
    const fp = sha256(der);
    const unwrap = (b64) => execFileSync("openssl", ["pkeyutl", "-decrypt", "-inkey", keyFile, "-pkeyopt", "rsa_padding_mode:oaep", "-pkeyopt", "rsa_oaep_md:sha256"],
      { input: Buffer.from(b64, "base64"), stdio: ["pipe", "pipe", "ignore"], maxBuffer: 1 << 16 });
    const ctx = { opt, work, keyFile, fp, unwrap, runnerTemp };
    if (mode === "keyaudit") return keyaudit(ctx);
    if (mode === "regen") return await regen(ctx);
    return await verify2(ctx);
  } finally {
    try { execFileSync("shred", ["-u", keyFile], { stdio: "ignore" }); } catch { fs.rmSync(keyFile, { force: true }); }
    fs.rmSync(work, { recursive: true, force: true });
  }
}

function auditManifest(m, ctx) {
  if (m.archivePublicKeySha256Der !== ctx.fp) throw Error("KEY_MISMATCH");
  return m.parts.map((p) => { const k = ctx.unwrap(p.wrappedKeyB64); const f = keyFacts(k); k.fill(0); return { part: p.part, ...f }; });
}

function writeSummary(md) { if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + "\n"); }
function auditMarkdown(report) {
  const out = ["## V13-Archiv: Schluesselpruefung", "", "| Generation | Teil | Laenge | wirksam | weak |", "|---|---|---:|---:|---|"];
  for (const g of report.generations) for (const r of g.rows) out.push(`| ${g.schemaVersion.replace("v13-research-archive-manifest-", "")} | ${r.part} | ${r.totalBytes} | ${r.effectiveBytes} | ${r.weak} |`);
  out.push("", "| Generation | Teile | weak | leer | <=3 B | min. wirksam |", "|---|---:|---:|---:|---:|---:|");
  for (const g of report.generations) out.push(`| ${g.schemaVersion.replace("v13-research-archive-manifest-", "")} | ${g.summary.parts} | ${g.summary.weak} | ${g.summary.empty} | ${g.summary.le3} | ${g.summary.minEffective} |`);
  return out.join("\n");
}

function keyaudit(ctx) {
  const files = String(ctx.opt("--manifests", "")).split(",").filter(Boolean);
  const out = ctx.opt("--out");
  if (!files.length || !out) { console.error("--manifests und --out noetig"); return 2; }
  const generations = files.map((f) => {
    const m = JSON.parse(fs.readFileSync(f, "utf8"));
    const rows = auditManifest(m, ctx);
    return { manifest: path.basename(f), schemaVersion: m.schemaVersion, uploaded: null, rows, summary: auditSummary(rows) };
  });
  const report = { schema: "v13-archive-keyaudit-1.0.0", rule: "wirksam = Bytes vor dem ersten \\n bzw. NUL (openssl enc -pass file:); weak = wirksam < 32",
    keyMaterialReported: false, generations };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report, null, 1) + "\n");
  for (const g of generations) console.log(JSON.stringify({ generation: g.schemaVersion, ...g.summary }));
  writeSummary(auditMarkdown(report));
  return 0;
}

/** Alter Teil → geprüfter Klartext-Tar (Chiffre-, Klartext-, Inventar- und Datei-Hashes). Gibt den Tar-Pfad zurück. */
function restorePart(p, encFile, ctx, dir, keyCheck) {
  if (sha256File(encFile) !== p.cipherSha256 || fs.statSync(encFile).size !== p.cipherBytes) throw Error(p.part + ": CIPHER_SHA256_MISMATCH");
  const kf = path.join(dir, "d.key");
  const k = ctx.unwrap(p.wrappedKeyB64);
  const facts = keyFacts(k);
  if (keyCheck) keyCheck(facts);
  fs.writeFileSync(kf, k, { mode: 0o600 }); k.fill(0);
  const tar = path.join(dir, p.part + ".tar");
  try { execFileSync("openssl", ["enc", "-d", "-aes-256-cbc", "-pbkdf2", "-iter", "100000", "-pass", "file:" + kf, "-in", encFile, "-out", tar], { stdio: "ignore" }); }
  finally { try { execFileSync("shred", ["-u", kf], { stdio: "ignore" }); } catch { fs.rmSync(kf, { force: true }); } }
  if (sha256File(tar) !== p.plainSha256 || fs.statSync(tar).size !== p.plainBytes) throw Error(p.part + ": PLAIN_SHA256_MISMATCH");
  const x = path.join(dir, "x");
  fs.mkdirSync(x);
  execFileSync("tar", ["-xf", tar, "-C", x], { stdio: "ignore" });
  const inv = path.join(x, "_inventory.tsv");
  if (sha256File(inv) !== p.inventorySha256) throw Error(p.part + ": INVENTORY_SHA256_MISMATCH");
  const lines = fs.readFileSync(inv, "utf8").split("\n").filter(Boolean).length;
  if (lines !== p.files) throw Error(p.part + ": FILE_COUNT_MISMATCH");
  try { execFileSync("sha256sum", ["--quiet", "-c", "_inventory.tsv"], { cwd: x, stdio: "ignore" }); } catch { throw Error(p.part + ": FILE_SHA256_MISMATCH"); }
  fs.rmSync(x, { recursive: true, force: true });
  return { tar, facts };
}

async function driverFromEnv() {
  const { createS3DriverFromEnv } = await import("../../../market/storage/s3-driver.mjs");
  for (const k of ["VU_HISTORY_S3_ENDPOINT", "VU_HISTORY_S3_BUCKET", "VU_HISTORY_S3_ACCESS_KEY_ID", "VU_HISTORY_S3_SECRET_ACCESS_KEY"]) if (!process.env[k]) throw Error("Secret fehlt: " + k);
  return createS3DriverFromEnv(process.env);
}

async function regen(ctx) {
  const oldFile = ctx.opt("--old-manifest"), oldPrefix = ctx.opt("--old-prefix"), prefix = ctx.opt("--prefix"), version = ctx.opt("--version"), outDir = ctx.opt("--out-dir");
  const ceilingBytes = Number(ctx.opt("--ceiling-bytes", String(8e9)));
  if (!PREFIX_RE.test(oldPrefix || "") || !PREFIX_RE.test(prefix || "") || prefix === oldPrefix) { console.error("ungueltiger Praefix"); return 2; }
  if (!prefix.endsWith(`archive-${version}/`)) { console.error("Praefix passt nicht zur Version"); return 2; }
  const oldBytes = fs.readFileSync(oldFile), old = JSON.parse(oldBytes);
  if (old.archivePublicKeySha256Der !== ctx.fp) { console.log(JSON.stringify({ keycheck: "KEY_MISMATCH" })); return 3; }
  const pub = path.join(HERE, "../../../../docs/quant-recovery/v13/archive/archive-pub.pem");
  const pubFp = sha256(execFileSync("openssl", ["pkey", "-pubin", "-in", pub, "-outform", "DER"]));
  if (pubFp !== old.archivePublicKeySha256Der) { console.error("PUBKEY_MISMATCH"); return 3; }
  const driver = await driverFromEnv();

  // Vorabprüfung: neuer Präfix leer, kein Zielobjekt vorhanden, Nullkostenschranke.
  let used = 0, n = 0;
  for (const o of await driver.list("")) { used += Number(o.size || 0); n++; }
  const add = old.parts.reduce((a, p) => a + p.cipherBytes, 0);
  const existing = (await driver.list(prefix)).length;
  const oldListed = new Map((await driver.list(oldPrefix)).map(o => [o.key, Number(o.size || 0)]));
  console.log(JSON.stringify({ bucketObjects: n, bucketBytes: used, newGenerationBytes: add, ceilingBytes, existingUnderNewPrefix: existing, oldGenerationObjects: oldListed.size }));
  if (existing > 0) { console.error("PREFIX_NOT_EMPTY: neue Generation existiert bereits (unveraenderlich)"); return 3; }
  if (used + add > ceilingBytes) { console.error("ZERO_COST_GUARD_BLOCKED"); return 3; }
  const targets = [...old.parts.map(p => prefix + p.object), prefix + "manifest.json"];
  for (const key of targets) if (await driver.head(key)) { console.error("OBJECT_EXISTS: " + key.slice(prefix.length)); return 3; }
  for (const p of old.parts) if (oldListed.get(oldPrefix + p.object) !== p.cipherBytes) { console.error(p.part + ": OLD_OBJECT_MISSING_OR_SIZE"); return 3; }

  fs.mkdirSync(outDir, { recursive: true });
  const sealed = [], log = [];
  for (const p of old.parts) {
    const dir = fs.mkdtempSync(path.join(ctx.work, "p-"));
    const oldEnc = path.join(dir, "old.enc");
    const buf = await driver.get(oldPrefix + p.object);
    if (!buf) throw Error(p.part + ": OLD_OBJECT_MISSING");
    fs.writeFileSync(oldEnc, buf);
    const { tar, facts } = restorePart(p, oldEnc, ctx, dir);
    fs.rmSync(oldEnc, { force: true });
    const newEnc = path.join(dir, "new.enc");
    const wrapped = execFileSync("bash", [path.join(HERE, "seal-part.sh"), tar, newEnc, pub], { env: { ...process.env, TMPDIR: dir }, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" }).trim();
    fs.rmSync(tar, { force: true });
    // Neuer Schlüssel: Format prüfen (nur Längen), dann hochladen – vorher erneut HEAD.
    const nk = ctx.unwrap(wrapped); const nf = keyFacts(nk); nk.fill(0);
    if (!nf.hex64Lf || nf.effectiveBytes !== 64) throw Error(p.part + ": NEW_KEY_FORMAT");
    const cipherSha256 = sha256File(newEnc), cipherBytes = fs.statSync(newEnc).size;
    if (cipherBytes - p.plainBytes > 32 || cipherBytes <= p.plainBytes) throw Error(p.part + ": CIPHER_SIZE");
    const key = prefix + p.object;
    if (await driver.head(key)) throw Error("OBJECT_EXISTS: " + p.object);
    await driver.put(key, fs.readFileSync(newEnc), { contentType: "application/octet-stream" });
    const h = await driver.head(key);
    if (!h || h.size !== cipherBytes) throw Error(p.part + ": UPLOAD_SIZE_MISMATCH");
    fs.rmSync(dir, { recursive: true, force: true });
    sealed.push({ part: p.part, cipherSha256, cipherBytes, wrappedKeyB64: wrapped });
    log.push({ part: p.part, files: p.files, oldRestore: "OK", oldKeyEffectiveBytes: facts.effectiveBytes, newKeyEffectiveBytes: nf.effectiveBytes, uploaded: true, cipherBytes });
    console.log(JSON.stringify(log[log.length - 1]));
  }
  const manifest = buildGen2Manifest({ old, oldManifestSha256: sha256(oldBytes), oldPrefix, prefix, version, createdAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"), sealed });
  const text = JSON.stringify(manifest, null, 1) + "\n";
  if (await driver.head(prefix + "manifest.json")) throw Error("OBJECT_EXISTS: manifest.json");
  await driver.put(prefix + "manifest.json", Buffer.from(text), { contentType: "application/json" });
  fs.writeFileSync(path.join(outDir, `manifest-${version}.json`), text);
  const report = { schema: "v13-archive-regen-1.0.0", version, manifestSha256: sha256(text), oldManifestSha256: sha256(oldBytes), parts: log,
    oldPrefixWritten: false, overwrites: 0 };
  fs.writeFileSync(path.join(outDir, "regen-report.json"), JSON.stringify(report, null, 1) + "\n");
  writeSummary(["## V13-Archiv: neue Generation " + version, "", "| Teil | Dateien | alter Schluessel wirksam | neuer Schluessel wirksam | hochgeladen |", "|---|---:|---:|---:|---|",
    ...log.map(r => `| ${r.part} | ${r.files} | ${r.oldKeyEffectiveBytes} | ${r.newKeyEffectiveBytes} | ${r.uploaded} |`), "", "Manifest-SHA-256: `" + report.manifestSha256 + "`"].join("\n"));
  return 0;
}

async function verify2(ctx) {
  const mFile = ctx.opt("--manifest"), oldFile = ctx.opt("--old-manifest"), prefix = ctx.opt("--prefix"), out = ctx.opt("--out");
  if (!PREFIX_RE.test(prefix || "")) { console.error("ungueltiger Praefix"); return 2; }
  const mBytes = fs.readFileSync(mFile), m = JSON.parse(mBytes), old = JSON.parse(fs.readFileSync(oldFile, "utf8"));
  if (m.storagePrefix !== prefix) { console.error("PREFIX_NOT_IN_MANIFEST"); return 2; }
  if (m.archivePublicKeySha256Der !== ctx.fp) { console.log(JSON.stringify({ keycheck: "KEY_MISMATCH" })); return 3; }
  const driver = await driverFromEnv();
  const listed = new Map((await driver.list(prefix)).map(o => [o.key, Number(o.size || 0)]));
  const expectedKeys = new Set([...m.parts.map(p => prefix + p.object), prefix + "manifest.json"]);
  const extra = [...listed.keys()].filter(k => !expectedKeys.has(k)).length;
  const remoteManifest = await driver.get(prefix + "manifest.json");
  const manifestInBucket = !remoteManifest ? "MISSING" : sha256(remoteManifest) === sha256(mBytes) ? "OK" : "MISMATCH";
  const oldByPart = new Map(old.parts.map(p => [p.part, p]));
  const rows = [];
  for (const p of m.parts) {
    const o = oldByPart.get(p.part);
    const row = { part: p.part, files: p.files, status: "OK" };
    try {
      if (!o) throw Error("NOT_IN_OLD_MANIFEST");
      if (o.plainSha256 !== p.plainSha256 || o.plainBytes !== p.plainBytes || o.inventorySha256 !== p.inventorySha256 || o.files !== p.files) throw Error("DIFFERS_FROM_OLD_MANIFEST");
      if (o.cipherSha256 === p.cipherSha256 || o.wrappedKeyB64 === p.wrappedKeyB64) throw Error("NOT_REENCRYPTED");
      if (listed.get(prefix + p.object) !== p.cipherBytes) throw Error("MISSING_OR_SIZE");
      const dir = fs.mkdtempSync(path.join(ctx.work, "v-"));
      const enc = path.join(dir, "new.enc");
      const buf = await driver.get(prefix + p.object);
      if (!buf) throw Error("MISSING");
      fs.writeFileSync(enc, buf);
      const { facts } = restorePart(p, enc, ctx, dir, (f) => { row.keyTotalBytes = f.totalBytes; row.keyEffectiveBytes = f.effectiveBytes; if (!f.hex64Lf || f.effectiveBytes !== 64) throw Error("KEY_NOT_HEX64"); });
      row.weak = facts.weak;
      row.plainEqualsOld = true;
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (e) { row.status = String(e.message).split(": ").pop(); }
    rows.push(row);
    console.log(JSON.stringify(row));
  }
  const ok = rows.length === old.parts.length && rows.every(r => r.status === "OK") && manifestInBucket === "OK" && extra === 0;
  const report = { schema: "v13-archive-verify2-1.0.0", manifest: m.schemaVersion, manifestSha256: sha256(mBytes), oldManifest: old.schemaVersion,
    oldManifestSha256: sha256(fs.readFileSync(oldFile)), manifestInBucket, unexpectedObjects: extra, parts: rows,
    totals: { parts: rows.length, ok: rows.filter(r => r.status === "OK").length, files: rows.reduce((a, r) => a + r.files, 0), weakKeys: rows.filter(r => r.weak).length }, result: ok ? "OK" : "FAILED" };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report, null, 1) + "\n");
  writeSummary(["## V13-Archiv: unabhaengige Wiederherstellung " + m.schemaVersion, "", "| Teil | Dateien | Status | Schluessel wirksam | Klartext = alt |", "|---|---:|---|---:|---|",
    ...rows.map(r => `| ${r.part} | ${r.files} | ${r.status} | ${r.keyEffectiveBytes ?? "-"} | ${r.plainEqualsOld ?? false} |`), "",
    `Manifest im Eimer: ${manifestInBucket}; fremde Objekte unter dem Praefix: ${extra}; Ergebnis: **${report.result}**`].join("\n"));
  console.log(JSON.stringify(report.totals), report.result);
  return ok ? 0 : 1;
}
