/* Logo-Folge fuer www (Steuerung 27.11.2026).
   www (landing/) zeigt Logos der Insights-Artikel (landing/web/img/news/logo-<TICKER>.png, Erzeuger scripts/website/www-news.mjs).
   Am 27.11. brachte der Logo-Lauf (04:21 UTC) ein Logo fuer WSM, landing/ folgte nicht, und WWW-1 war auf jedem PR rot.
   Vertrag: Jeder Workflow-Job, der discover/logos committet, baut im selben Job landing/ mit www-news.mjs neu und committet es mit.
   Nur Workflow-Text. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WF_DIR = join(ROOT, ".github/workflows");

function jobs(text) {
  const flat = text.replace(/\\\n\s*/g, " ");
  const start = flat.search(/^jobs:\s*$/m);
  if (start < 0) return [];
  const out = [];
  let cur = null;
  for (const line of flat.slice(start).split("\n").slice(1)) {
    const m = line.match(/^  ([A-Za-z0-9_-]+):\s*$/);
    if (m) { cur = { id: m[1], lines: [] }; out.push(cur); continue; }
    if (cur) cur.lines.push(line);
  }
  return out.map((j) => ({ id: j.id, text: j.lines.join("\n") }));
}

const committetLogos = (text) => /git commit/.test(text) && (text.match(/git add [^\n]+/g) || []).some((a) => /discover\/logos/.test(a));

const schreiber = [];
for (const datei of readdirSync(WF_DIR).filter((n) => /\.ya?ml$/.test(n)).sort()) {
  const text = readFileSync(join(WF_DIR, datei), "utf8");
  for (const job of jobs(text)) if (committetLogos(job.text)) schreiber.push({ datei, ...job });
}

test("LW-1 · der Logo-Schreiber wird erkannt (liest der Test noch das Richtige?)", () => {
  assert.ok(schreiber.some((s) => s.datei === "pipeline-weekly.yml" && s.id === "logos"), "pipeline-weekly.yml#logos committet discover/logos, wird aber nicht erkannt");
});

test("LW-2 · jeder Job, der discover/logos committet, zieht landing/ mit www-news.mjs nach und committet es", () => {
  for (const s of schreiber) {
    const wo = s.datei + "#" + s.id;
    assert.match(s.text, /node scripts\/website\/www-news\.mjs(?!\S)/, wo + ": Logos ohne Nachzug von landing/");
    const adds = s.text.match(/git add [^\n]+/g) || [];
    assert.ok(adds.some((a) => /\blanding\b/.test(a)), wo + ": landing/ wird nicht mitcommittet");
    assert.ok(s.text.indexOf("www-news.mjs") < s.text.lastIndexOf("git commit"), wo + ": www-news.mjs muss vor dem Commit laufen");
  }
});
