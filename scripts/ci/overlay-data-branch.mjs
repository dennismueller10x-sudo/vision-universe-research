#!/usr/bin/env node
/* Datenzweig in die Auslieferung legen (Plan Neustart §3, Pilot News).

   Pages baut die Seite aus main (scripts/vu2/build-release.mjs). Danach legt dieser Schritt die Dateien
   der Datenarten aus core/registry/data-branch.json aus dem Datenzweig darueber. Fail closed fuer die
   Vollstaendigkeit: Am Ende muss jeder registrierte Pfad in der Seite liegen, sonst Exit 1.

   Je Pfad (Ergebnis im Bericht):
     IDENTICAL  Datenzweig = main (Phase DUAL_WRITE: der Nachweis, dass der Weg traegt)
     OVERLAID   Datenzweig neuer als main, uebernommen
     KEPT_MAIN  Datenzweig fehlt, ist ungueltig (JSON, Mindestzahl Datensaetze) oder aelter als main
     MISSING    weder Datenzweig noch main -> Exit 1

   Aufruf: node scripts/ci/overlay-data-branch.mjs --data <datenzweig-dir> --site <site-dir> [--root .] [--out bericht.json] */
import { readFileSync, existsSync, copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const sha = (b) => createHash("sha256").update(b).digest("hex");

function pick(obj, path) { return String(path).split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj); }

/* Datenart aus core/registry/domains.json zum Pfad: liefert Zeitstempel- und Datensatzfelder. */
export function contractFor(domains, path) {
  const list = Array.isArray(domains) ? domains : domains.domains || [];
  return list.find((d) => String(d.artifact || "").replace(/^\//, "") === path) || null;
}

export function inspect(bytes, contract) {
  let json;
  try { json = JSON.parse(bytes.toString("utf8")); } catch { return { ok: false, reason: "INVALID_JSON" }; }
  let ts = null;
  for (const f of (contract && contract.timestamp) || []) { const v = pick(json, f); if (v && !Number.isNaN(Date.parse(v))) { ts = new Date(v).toISOString(); break; } }
  if (contract && contract.records) {
    const r = pick(json, contract.records), n = Array.isArray(r) ? r.length : (r && typeof r === "object" ? Object.keys(r).length : 0);
    if (contract.minRecords && n < contract.minRecords) return { ok: false, reason: `TOO_FEW_RECORDS:${n}<${contract.minRecords}`, ts };
    return { ok: true, ts, records: n };
  }
  return { ok: true, ts };
}

export function overlay({ root, dataDir, siteDir, manifest, domains }) {
  const rows = [];
  for (const d of manifest.domains) {
    for (const p of d.paths) {
      const site = join(siteDir, p), main = join(root, p), branch = join(dataDir, p);
      const contract = contractFor(domains, p);
      const row = { domain: d.id, phase: d.phase, path: p };
      const mainBytes = existsSync(main) ? readFileSync(main) : null;
      const brBytes = existsSync(branch) ? readFileSync(branch) : null;
      const mainInfo = mainBytes ? inspect(mainBytes, contract) : null;
      const brInfo = brBytes ? inspect(brBytes, contract) : null;
      if (brBytes) row.branchSha256 = sha(brBytes);
      if (mainBytes) row.mainSha256 = sha(mainBytes);
      if (brBytes && mainBytes && sha(brBytes) === sha(mainBytes)) row.status = "IDENTICAL";
      else if (brBytes && brInfo.ok && (!mainInfo || !mainInfo.ok || !mainInfo.ts || !brInfo.ts || brInfo.ts >= mainInfo.ts)) row.status = "OVERLAID";
      else if (mainBytes) row.status = "KEPT_MAIN", row.reason = !brBytes ? "NOT_ON_BRANCH" : !brInfo.ok ? brInfo.reason : "BRANCH_OLDER";
      else row.status = "MISSING", row.reason = brBytes ? brInfo.reason : "NOWHERE";
      if (row.status === "IDENTICAL" || row.status === "OVERLAID") { mkdirSync(dirname(site), { recursive: true }); copyFileSync(branch, site); }
      else if (row.status === "KEPT_MAIN" && !existsSync(site)) { mkdirSync(dirname(site), { recursive: true }); copyFileSync(main, site); }
      row.delivered = existsSync(site) ? sha(readFileSync(site)) : null;
      row.branchTs = brInfo && brInfo.ts || null; row.mainTs = mainInfo && mainInfo.ts || null;
      rows.push(row);
    }
  }
  const complete = rows.every((r) => r.delivered);
  const count = (s) => rows.filter((r) => r.status === s).length;
  return { schema: "vu-data-branch-delivery-1", branch: manifest.branch, complete, counts: { IDENTICAL: count("IDENTICAL"), OVERLAID: count("OVERLAID"), KEPT_MAIN: count("KEPT_MAIN"), MISSING: count("MISSING") }, rows };
}

function main(argv) {
  const o = { root: "." };
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i].replace(/^--/, ""); if (!["data", "site", "root", "out"].includes(k) || argv[i + 1] == null) throw Error("INVALID_ARGUMENTS:" + argv[i]);
    o[k] = argv[i + 1];
  }
  if (!o.data || !o.site) throw Error("--data und --site sind Pflicht");
  const root = resolve(o.root);
  const manifest = JSON.parse(readFileSync(join(root, "core/registry/data-branch.json"), "utf8"));
  const domains = JSON.parse(readFileSync(join(root, "core/registry/domains.json"), "utf8"));
  const rep = overlay({ root, dataDir: resolve(o.data), siteDir: resolve(o.site), manifest, domains });
  if (o.out) writeFileSync(o.out, JSON.stringify(rep, null, 2) + "\n");
  for (const r of rep.rows) console.log(`[datenzweig] ${r.domain} ${r.path}: ${r.status}${r.reason ? " (" + r.reason + ")" : ""}`);
  console.log(`[datenzweig] vollstaendig: ${rep.complete} ${JSON.stringify(rep.counts)}`);
  return rep.complete ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(process.argv.slice(2)); } catch (e) { console.error("ABBRUCH: " + e.message); process.exitCode = 2; }
}
