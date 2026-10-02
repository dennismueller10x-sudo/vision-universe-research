/**
 * Kandidaten-Bilder fuer Titel, bei denen keine Quelle automatisch ein Logo
 * findet (Websites blocken, SEC-Bilder ohne "logo" im Namen).
 *
 * Holt aus den juengsten Einreichungen je Titel (DEF 14A, ARS, 10-K, 20-F)
 * die ersten Bilder des Dokuments, verkleinert sie als Vorschau und legt
 * sie mit ihrer Adresse unter .logo-candidates/ ab. Der Workflow schiebt den
 * Ordner auf einen Wegwerf-Branch; dort wird von Hand das richtige Bild
 * gewaehlt und seine Adresse in discover/config/logo-urls.json
 * eingetragen. Ins Produkt gelangt hier nichts.
 *
 *   SEC_USER_AGENT="Name mail@example.com" node scripts/discover/logo-candidates.mjs --symbols=BRO,CIEN
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const i = a.indexOf("="); return i < 0 ? [a.slice(2), true] : [a.slice(2, i), a.slice(i + 1)]; }));
const ua = process.env.SEC_USER_AGENT;
if (!ua) { console.error("SEC_USER_AGENT fehlt."); process.exit(1); }
const symbole = String(args.symbols || "").toUpperCase().split(",").map((s) => s.trim()).filter((s) => /^[A-Z0-9.\-]{1,24}$/.test(s));
const OUT = join(root, ".logo-candidates");
const sharp = (await import("sharp")).default;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let letzte = 0;
async function sec(url) {
  const warte = letzte + 150 - Date.now();
  if (warte > 0) await sleep(warte);
  letzte = Date.now();
  const res = await fetch(url, { headers: { "User-Agent": ua, Accept: "application/json,text/html,image/*,*/*" }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(res.status + " " + url);
  return Buffer.from(await res.arrayBuffer());
}

const names = JSON.parse(readFileSync(join(root, "quant", "data", "market", "security-master", "company-names.json"), "utf8")).rows || [];
const cikOf = new Map(names.filter((r) => r.ticker && r.cik).map((r) => [r.ticker, String(Number(r.cik))]));
const FORMEN = ["DEF 14A", "ARS", "10-K", "20-F", "40-F", "DEFA14A", "8-K"];

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const index = {};
for (const sym of symbole) {
  const cik = cikOf.get(sym);
  index[sym] = [];
  if (!cik) { console.log(sym + ": keine CIK"); continue; }
  try {
    const sub = JSON.parse((await sec("https://data.sec.gov/submissions/CIK" + cik.padStart(10, "0") + ".json")).toString("utf8"));
    const r = sub.filings && sub.filings.recent;
    const docs = [];
    for (const form of FORMEN) {
      for (let i = 0; r && i < r.form.length && docs.filter((d) => d.form === form).length < 1; i++) {
        if (r.form[i] === form && /\.htm/i.test(r.primaryDocument[i] || "")) {
          docs.push({ form, url: "https://www.sec.gov/Archives/edgar/data/" + cik + "/" + r.accessionNumber[i].replace(/-/g, "") + "/" + r.primaryDocument[i] });
        }
      }
    }
    mkdirSync(join(OUT, sym), { recursive: true });
    let n = 0;
    for (const d of docs.slice(0, 4)) {
      const html = (await sec(d.url)).toString("utf8");
      const quellen = [...new Set([...html.matchAll(/<img\b[^>]*\bsrc\s*=\s*["']?([^"'\s>]+)/gi)].map((m) => m[1]).filter((s) => !/^data:/i.test(s)))].slice(0, 6);
      for (const src of quellen) {
        if (n >= 16) break;
        let url;
        try { url = new URL(src, d.url).href; } catch (e) { continue; }
        if (index[sym].some((k) => k.url === url)) continue;
        try {
          const buf = await sec(url);
          const meta = await sharp(buf).metadata();
          const datei = String(++n).padStart(2, "0") + ".png";
          await sharp(buf).resize(320, 200, { fit: "inside" }).flatten({ background: "#ffffff" }).png().toFile(join(OUT, sym, datei));
          index[sym].push({ file: sym + "/" + datei, url, form: d.form, doc: d.url, width: meta.width, height: meta.height });
        } catch (e) { console.log(sym + ": " + e.message); }
      }
    }
    console.log(sym + ": " + index[sym].length + " Bilder");
  } catch (e) { console.log(sym + ": " + e.message); }
}
writeFileSync(join(OUT, "index.json"), JSON.stringify(index, null, 1) + "\n");
