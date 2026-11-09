#!/usr/bin/env node
// V13 – vorsignierte R2-URLs für das verschlüsselte Research-Archiv (nur in GitHub Actions, Secrets aus env).
// Modi:
//   --mode usage: nur lesen (Belegung, Grenze, Praefix)
//   --mode put  : Nullkostenprüfung (Belegung des Eimers + Archivgröße ≤ Grenze), dann PUT-URLs je Objekt
//   --mode get  : GET-URLs je Objekt (Wiederherstellungsprobe außerhalb von Actions)
//   --mode verify: jedes Objekt herunterladen, SHA-256 gegen das Manifest prüfen (keine URLs)
// URLs werden nie ausgegeben: --out schreibt eine JSON-Datei, die der Workflow verschlüsselt. Log: nur Zählungen.
import fs from "node:fs";
import { createHash, createHmac } from "node:crypto";
import { uriEncode, createS3DriverFromEnv } from "../../../market/storage/s3-driver.mjs";

const hmac = (k, d) => createHmac("sha256", k).update(d).digest();
// SigV4-Query-Signatur (rein; Test gegen das AWS-Beispiel in quant/tests/v13-archive.test.mjs).
export function presignUrl({ method, origin, host, path, accessKeyId, secretAccessKey, region, amzDate, expires }) {
  const date = amzDate.slice(0, 8), scope = `${date}/${region}/s3/aws4_request`;
  const q = { "X-Amz-Algorithm": "AWS4-HMAC-SHA256", "X-Amz-Credential": `${accessKeyId}/${scope}`, "X-Amz-Date": amzDate, "X-Amz-Expires": String(expires), "X-Amz-SignedHeaders": "host" };
  const cq = Object.keys(q).sort().map(k => uriEncode(k, true) + "=" + uriEncode(q[k], true)).join("&");
  const creq = [method, path, cq, `host:${host}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
  const sts = ["AWS4-HMAC-SHA256", amzDate, scope, createHash("sha256").update(creq).digest("hex")].join("\n");
  const kSig = hmac(hmac(hmac(hmac("AWS4" + secretAccessKey, date), region), "s3"), "aws4_request");
  return `${origin}${path}?${cq}&X-Amz-Signature=${createHmac("sha256", kSig).update(sts).digest("hex")}`;
}
function presign(method, key, env = process.env, expires = 10800) {
  const url = new URL(env.VU_HISTORY_S3_ENDPOINT.replace(/\/+$/, ""));
  return presignUrl({ method, origin: url.origin, host: url.host, path: "/" + uriEncode(env.VU_HISTORY_S3_BUCKET, false) + "/" + uriEncode(key, false),
    accessKeyId: env.VU_HISTORY_S3_ACCESS_KEY_ID, secretAccessKey: env.VU_HISTORY_S3_SECRET_ACCESS_KEY, region: env.VU_HISTORY_S3_REGION || "auto",
    amzDate: new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""), expires });
}

if (import.meta.url === `file://${process.argv[1]}`) await main();

async function main() {
  const args = process.argv.slice(2);
  const opt = (k, d = null) => { const i = args.indexOf(k); return i < 0 ? d : args[i + 1]; };
  const mode = opt("--mode");
  const manifest = JSON.parse(fs.readFileSync(opt("--manifest"), "utf8"));
  const prefix = opt("--prefix");
  const expires = Number(opt("--expires", "10800"));
  const ceilingBytes = Number(opt("--ceiling-bytes", String(8e9)));
  if (!/^research-snapshots\/quant-v13\/archive-\d+\.\d+\.\d+\/$/.test(prefix)) { console.error("ungueltiger Praefix"); process.exit(2); }
  const env = process.env;
  for (const k of ["VU_HISTORY_S3_ENDPOINT", "VU_HISTORY_S3_BUCKET", "VU_HISTORY_S3_ACCESS_KEY_ID", "VU_HISTORY_S3_SECRET_ACCESS_KEY"]) if (!env[k]) { console.error("Secret fehlt: " + k); process.exit(2); }
  const objects = [...manifest.parts.map(p => ({ key: prefix + p.object, sha256: p.cipherSha256, bytes: p.cipherBytes })), { key: prefix + "manifest.json", sha256: null, bytes: null }];

  const driver = createS3DriverFromEnv(env);
  if (mode === "usage" || mode === "put") {
    let used = 0, n = 0;
    for (const o of await driver.list("")) { used += Number(o.size || 0); n++; }
    const add = manifest.parts.reduce((a, p) => a + p.cipherBytes, 0);
    const existing = (await driver.list(prefix)).length;
    console.log(JSON.stringify({ bucketObjects: n, bucketBytes: used, archiveBytes: add, ceilingBytes, existingUnderPrefix: existing }));
    if (existing > 0 && mode === "put") { console.error("PREFIX_NOT_EMPTY: Archivversion existiert bereits (unveraenderlich)"); process.exit(3); }
    if (used + add > ceilingBytes) { console.error("ZERO_COST_GUARD_BLOCKED"); process.exit(3); }
    if (mode === "put") fs.writeFileSync(opt("--out"), JSON.stringify({ mode, expiresSeconds: expires, objects: objects.map(o => ({ ...o, url: presign("PUT", o.key, env, expires) })) }));
  } else if (mode === "get") {
    fs.writeFileSync(opt("--out"), JSON.stringify({ mode, expiresSeconds: expires, objects: objects.map(o => ({ ...o, url: presign("GET", o.key, env, expires) })) }));
  } else if (mode === "verify") {
    const listed = new Map((await driver.list(prefix)).map(o => [o.key, Number(o.size || 0)]));
    const result = [];
    for (const o of objects) {
      if (!listed.has(o.key)) { result.push({ key: o.key.slice(prefix.length), status: "MISSING" }); continue; }
      if (o.sha256 === null) { result.push({ key: o.key.slice(prefix.length), status: "PRESENT", bytes: listed.get(o.key) }); continue; }
      const got = await driver.get(o.key);
      const sha = createHash("sha256").update(got).digest("hex");
      result.push({ key: o.key.slice(prefix.length), status: sha === o.sha256 && listed.get(o.key) === o.bytes ? "OK" : "MISMATCH", bytes: listed.get(o.key) });
    }
    console.log(JSON.stringify({ verified: result }, null, 1));
    if (result.some(r => r.status === "MISSING" || r.status === "MISMATCH")) process.exit(1);
  } else { console.error("--mode put|get|verify"); process.exit(2); }
}
