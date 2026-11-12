/* Messung, kein Test: protokolliert in $TRACE_LOG jede Datei unter (quant|discover|supertrader|social|technical|core)/data, die ein Testprozess oeffnet.
   Aufruf siehe docs/quality/TESTARTEN.md. Schreibt nichts ins Repository. */
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { relative } from "node:path";
const ROOT = new URL("../../", import.meta.url).pathname;
const LOG = process.env.TRACE_LOG;
if (!LOG) throw new Error("TRACE_LOG fehlt");
const RE = /^(quant|discover|supertrader|social|technical|core)\/data\//;
const me = relative(ROOT, process.argv[1] || "");
const seen = new Set();
function note(p, op) {
  try {
    if (typeof p !== "string" && !(p instanceof URL) && !Buffer.isBuffer(p)) return;
    let s = p instanceof URL ? p.pathname : String(p);
    if (!s.startsWith("/")) s = process.cwd() + "/" + s;
    if (!s.startsWith(ROOT)) return;
    const r = s.slice(ROOT.length);
    if (!RE.test(r)) return;
    const k = op + " " + r.split("/").slice(0, 3).join("/");
    if (seen.has(k)) return; seen.add(k);
    fs.appendFileSync(LOG, JSON.stringify({ test: me, op, path: r }) + "\n");
  } catch {}
}
for (const n of ["readFileSync", "openSync", "readdirSync", "statSync", "existsSync", "createReadStream", "readFile", "readdir", "stat", "open"]) {
  const o = fs[n]; if (!o) continue;
  fs[n] = function (p, ...a) { note(p, n); return o.call(this, p, ...a); };
}
for (const n of ["readFile", "readdir", "stat", "open"]) {
  const o = fs.promises[n];
  fs.promises[n] = function (p, ...a) { note(p, n); return o.call(this, p, ...a); };
}
syncBuiltinESMExports();
