#!/usr/bin/env node
/* R2-Audit: rein lesend. Misst den Speicher der produktiven Ablage und vergleicht ihn mit der
   eigenen Decke (quant/engines/zero-cost-guard.js) und dem kostenlosen Kontingent.

   - S3 (nur LIST ueber den bestehenden Treiber, dessen Zero-Cost-Schutz nur GET/HEAD/LIST erlaubt)
   - Cloudflare-API (nur GET/Abfragen): Bucket-Liste, Zugangsart, Monatsverbrauch laut Analytics
   Schreibt nichts, legt nichts an. Gibt keine Schluessel, Endpunkte oder Konto-IDs aus. */
import { createRequire } from "node:module";
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createS3DriverFromEnv } from "../market/storage/s3-driver.mjs";

const require = createRequire(import.meta.url);
const Guard = require("../../quant/engines/zero-cost-guard.js");

const CLASS_A = new Set(["ListBuckets", "PutBucket", "ListObjects", "PutObject", "CopyObject", "CompleteMultipartUpload",
  "CreateMultipartUpload", "ListMultipartUploads", "UploadPart", "UploadPartCopy", "ListParts", "PutBucketEncryption",
  "PutBucketCors", "PutBucketLifecycleConfiguration", "LifecycleStorageTierTransition"]);
const CLASS_B = new Set(["HeadBucket", "HeadObject", "GetObject", "UsageSummary", "GetBucketEncryption", "GetBucketLocation",
  "GetBucketCors", "GetBucketLifecycleConfiguration"]);
const FREE_OPS = new Set(["DeleteObject", "DeleteBucket", "DeleteMultipartUpload", "AbortMultipartUpload"]);

export function classifyOp(actionType) {
  if (CLASS_A.has(actionType)) return "A";
  if (CLASS_B.has(actionType)) return "B";
  if (FREE_OPS.has(actionType)) return "frei";
  return "unklassifiziert";
}

/* Summe und Aufteilung nach den ersten `levels` Pfadteilen. */
export function summarise(objects, levels = 3) {
  const byPrefix = new Map();
  let bytes = 0;
  for (const o of objects) {
    bytes += o.size;
    const key = String(o.key || "");
    const parts = key.split("/");
    const prefix = parts.length > levels ? parts.slice(0, levels).join("/") + "/" : (parts.length > 1 ? parts.slice(0, -1).join("/") + "/" : "(Wurzel)");
    const e = byPrefix.get(prefix) || { prefix, objects: 0, bytes: 0 };
    e.objects += 1; e.bytes += o.size; byPrefix.set(prefix, e);
  }
  const prefixes = [...byPrefix.values()].sort((a, b) => b.bytes - a.bytes);
  return { objects: objects.length, bytes, prefixes };
}

export function pct(part, whole) { return whole ? Math.round((part / whole) * 1000) / 10 : null; }

/* Urteil gegen Decke und Freikontingent. Alles in 1000^3-Bytes, wie der Wachter. */
export function evaluate({ storageBytes, classA = null, classB = null }) {
  const c = Guard.SAFETY_CEILING; const f = Guard.FREE_TIER;
  const row = (id, used, ceiling, free) => used == null ? { id, used: null, ceiling, free, verdict: "UNGEMESSEN" } : {
    id, used, ceiling, free, pctOfCeiling: pct(used, ceiling), pctOfFree: pct(used, free),
    headroomToCeiling: ceiling - used, headroomToFree: free - used,
    verdict: used > free ? "UEBER_FREIGRENZE" : used > ceiling ? "UEBER_DECKE" : used >= ceiling * 0.7 ? "WARNUNG" : "OK"
  };
  return [row("STORAGE_BYTES", storageBytes, c.storageBytes, f.storageBytes),
    row("CLASS_A_MONTH", classA, c.classAOperations, f.classAOperations),
    row("CLASS_B_MONTH", classB, c.classBOperations, f.classBOperations)];
}

const HEX32 = /[0-9a-f]{32}/gi;
const safe = (s) => String(s).replace(HEX32, "<id>").slice(0, 300);

async function cf(path, token, body) {
  const res = await fetch("https://api.cloudflare.com/client/v4" + path, {
    method: body ? "POST" : "GET",
    headers: { authorization: "Bearer " + token, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined });
  const j = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok && j.success !== false, json: j };
}

async function analytics(accountId, token, now) {
  const s = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const query = `query($acc:String!,$s:Time!,$e:Time!){viewer{accounts(filter:{accountTag:$acc}){
    ops:r2OperationsAdaptiveGroups(limit:200,filter:{datetime_geq:$s,datetime_leq:$e}){sum{requests} dimensions{actionType bucketName}}
    stor:r2StorageAdaptiveGroups(limit:200,filter:{datetime_geq:$s,datetime_leq:$e},orderBy:[datetime_DESC]){max{payloadSize metadataSize objectCount} dimensions{bucketName datetime}}}}}`;
  const r = await cf("/graphql", token, { query, variables: { acc: accountId, s, e: now.toISOString() } });
  const acc = r.json && r.json.data && r.json.data.viewer && r.json.data.viewer.accounts && r.json.data.viewer.accounts[0];
  if (!acc) return { readable: false, status: r.status, error: safe(JSON.stringify((r.json && r.json.errors) || r.json).slice(0, 200)) };
  const ops = { A: 0, B: 0, frei: 0, unklassifiziert: 0 }; const perBucketOps = {};
  for (const g of acc.ops || []) {
    const k = classifyOp(g.dimensions.actionType); ops[k] += g.sum.requests;
    perBucketOps[g.dimensions.bucketName] = (perBucketOps[g.dimensions.bucketName] || 0) + g.sum.requests;
  }
  const latest = new Map();
  for (const g of acc.stor || []) if (!latest.has(g.dimensions.bucketName)) latest.set(g.dimensions.bucketName, g);
  const storage = [...latest.entries()].map(([bucket, g]) => ({ bucket, payloadBytes: g.max.payloadSize,
    metadataBytes: g.max.metadataSize, objects: g.max.objectCount, at: g.dimensions.datetime }));
  return { readable: true, since: s, ops, perBucketOps, storage };
}

export async function run(env = process.env, now = new Date()) {
  const out = { schema: "r2-audit-1.0.0", checkedAt: now.toISOString(), readOnly: true,
    config: Object.fromEntries(["VU_HISTORY_S3_ENDPOINT", "VU_HISTORY_S3_BUCKET", "VU_HISTORY_S3_ACCESS_KEY_ID",
      "VU_HISTORY_S3_SECRET_ACCESS_KEY", "CLOUDFLARE_API_TOKEN"].map((k) => [k, env[k] ? "gesetzt" : "FEHLT"])) };
  const accountId = (/^https:\/\/([0-9a-f]{32})\./i.exec(env.VU_HISTORY_S3_ENDPOINT || "") || [])[1] || null;

  if (env.VU_HISTORY_S3_ENDPOINT && env.VU_HISTORY_S3_BUCKET && env.VU_HISTORY_S3_ACCESS_KEY_ID && env.VU_HISTORY_S3_SECRET_ACCESS_KEY) {
    try {
      const list = await createS3DriverFromEnv(env).list("");
      out.s3 = { listed: true, listRequests: Math.max(1, Math.ceil(list.length / 1000)), ...summarise(list) };
      out.s3.prefixes = out.s3.prefixes.slice(0, 15);
    } catch (err) { out.s3 = { listed: false, error: safe(err.message) }; }
  } else out.s3 = { listed: false, error: "S3-Zugang unvollstaendig" };

  if (env.CLOUDFLARE_API_TOKEN && accountId) {
    const tok = env.CLOUDFLARE_API_TOKEN;
    const b = await cf(`/accounts/${accountId}/r2/buckets`, tok);
    if (b.ok) {
      const buckets = (b.json.result && b.json.result.buckets) || [];
      out.buckets = [];
      for (const bk of buckets) {
        const dom = await cf(`/accounts/${accountId}/r2/buckets/${encodeURIComponent(bk.name)}/domains/managed`, tok);
        const cus = await cf(`/accounts/${accountId}/r2/buckets/${encodeURIComponent(bk.name)}/domains/custom`, tok);
        out.buckets.push({ name: bk.name, created: bk.creation_date || null, location: bk.location || null,
          managedPublicAccess: dom.ok ? !!(dom.json.result && dom.json.result.enabled) : "nicht lesbar",
          customDomains: cus.ok ? ((cus.json.result && cus.json.result.domains) || []).length : "nicht lesbar" });
      }
    } else out.buckets = { readable: false, status: b.status };
    out.analytics = await analytics(accountId, tok, now);
  } else out.buckets = { readable: false, reason: "kein Token oder keine ableitbare Konto-ID" };

  const a = out.analytics && out.analytics.readable ? out.analytics : null;
  const analyticsStorage = a ? a.storage.reduce((s, x) => s + x.payloadBytes + x.metadataBytes, 0) : null;
  out.evaluation = evaluate({ storageBytes: out.s3.listed ? out.s3.bytes : analyticsStorage,
    classA: a ? a.ops.A : null, classB: a ? a.ops.B : null });
  out.evaluationNote = "Speicher: " + (out.s3.listed ? "LIST der konfigurierten Ablage (nur dieser Bucket)" : "Cloudflare-Analytics (alle Buckets)") +
    ". Operationen: Cloudflare-Analytics, konto- und monatsweit; dieser Lauf selbst zaehlt als Class A ("
    + (out.s3.listRequests || 0) + " LIST-Seiten).";
  return out;
}

export function toMarkdown(o) {
  const gb = (n) => n == null ? "n/a" : (n / 1e9).toFixed(3) + " GB";
  const L = ["# R2-Audit (nur lesen)", "", "Stand " + o.checkedAt, "", "| Messgroesse | Wert | Decke | Freigrenze | % Decke | % frei | Urteil |", "|---|---|---|---|---|---|---|"];
  for (const r of o.evaluation) {
    const fmt = (v) => r.id === "STORAGE_BYTES" ? gb(v) : (v == null ? "n/a" : v.toLocaleString("de-DE"));
    L.push(`| ${r.id} | ${fmt(r.used)} | ${fmt(r.ceiling)} | ${fmt(r.free)} | ${r.pctOfCeiling ?? "n/a"} | ${r.pctOfFree ?? "n/a"} | ${r.verdict} |`);
  }
  L.push("", o.evaluationNote, "");
  if (o.s3 && o.s3.listed) { L.push(`## Konfigurierte Ablage: ${o.s3.objects} Objekte, ${gb(o.s3.bytes)}`, "", "| Praefix | Objekte | Groesse |", "|---|---|---|");
    for (const p of o.s3.prefixes) L.push(`| ${p.prefix} | ${p.objects} | ${gb(p.bytes)} |`); }
  else L.push("S3-Liste: " + (o.s3 && o.s3.error));
  L.push("", "## Buckets (Cloudflare-API)", "", "```json", JSON.stringify(o.buckets, null, 1), "```");
  if (o.analytics) L.push("", "## Analytics (Monat bis jetzt)", "", "```json", JSON.stringify(o.analytics, null, 1), "```");
  return L.join("\n") + "\n";
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const res = await run();
  const md = toMarkdown(res);
  console.log(md);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
}
