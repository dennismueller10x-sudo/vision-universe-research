/* Lebende Doku (Plan Neustart §3, core/registry/docs.json): hoechstens maxLiving lebende Seiten, alle in
   docs/README.md verlinkt; jede andere Markdown-Seite unter docs/ liegt im Archiv oder ist ein Beleg am Ort
   (von Code genannt, eingefroren, per SHA-256 gepinnt oder von einem Beleg verlinkt). So waechst die lebende
   Doku nicht still wieder an. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, posix } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { linksIn, resolveLink } from "../../scripts/quality/check-doc-links.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REG = JSON.parse(readFileSync(join(ROOT, "core/registry/docs.json"), "utf8"));
const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 26 }).split("\0").filter(Boolean);
const docs = tracked.filter((f) => f.startsWith("docs/") && /\.md$/i.test(f) && !f.startsWith("docs/archiv/"));
const glob = (g) => new RegExp("^" + g.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*") + "$");
const working = Object.keys(REG.workingSets).map(glob);
const living = new Set(REG.living);
const read = (f) => readFileSync(join(ROOT, f));

test("DOC-1 · hoechstens maxLiving lebende Seiten; jede existiert und ist in docs/README.md verlinkt", () => {
  assert.ok(REG.living.length <= REG.maxLiving, `${REG.living.length} lebende Seiten > ${REG.maxLiving}`);
  const readme = read("docs/README.md").toString("utf8");
  const linked = new Set(linksIn(readme).map((l) => resolveLink("docs/README.md", l.target)));
  for (const f of REG.living) {
    assert.ok(existsSync(join(ROOT, f)), `${f} fehlt`);
    if (f !== "docs/README.md") assert.ok(linked.has(f), `${f} ist lebend, aber nicht in docs/README.md verlinkt`);
  }
});

test("DOC-2 · CLAUDE.md verweist nur auf lebende Seiten (oder ins Archiv)", () => {
  const claude = read("CLAUDE.md").toString("utf8");
  for (const l of linksIn(claude)) {
    const r = resolveLink("CLAUDE.md", l.target);
    if (r && r.startsWith("docs/") && r.endsWith(".md")) assert.ok(living.has(r) || r.startsWith("docs/archiv/"), `CLAUDE.md verlinkt ${r}, keine lebende Seite`);
  }
});

test("DOC-3 · jede andere Seite unter docs/ ist Archiv oder Beleg am Ort (Code-Nennung, eingefroren, gepinnt, von Beleg verlinkt)", () => {
  const rest = docs.filter((f) => !living.has(f) && !working.some((re) => re.test(f)));
  const text = tracked.filter((f) => !/\.(md|png|jpe?g|webp|gif|gz|mp4|mp3|wav|woff2?|ttf|svg|zip|enc|bin|pdf|ico)$/i.test(f) && !f.includes("/data/"));
  const blob = text.map((f) => { try { const b = read(f); return b.length < 20e6 ? b.toString("latin1") : ""; } catch { return ""; } }).join("\n");
  const evidence = new Set();
  for (const f of rest) {
    if (REG.frozen.some((p) => f.startsWith(p))) evidence.add(f);
    else if (blob.includes(f)) evidence.add(f);
    else if (blob.includes(createHash("sha256").update(read(f)).digest("hex"))) evidence.add(f);
  }
  // von Belegen (auch eingefrorenen) verlinkte Seiten bleiben ebenfalls am Ort (Fixpunkt)
  for (let grew = true; grew;) {
    grew = false;
    for (const f of tracked.filter((x) => x.startsWith("docs/") && /\.md$/i.test(x) && (evidence.has(x) || REG.frozen.some((p) => x.startsWith(p))))) {
      for (const l of linksIn(read(f).toString("utf8"))) {
        const r = resolveLink(f, l.target);
        if (r && rest.includes(r) && !evidence.has(r)) { evidence.add(r); grew = true; }
      }
    }
  }
  const orphan = rest.filter((f) => !evidence.has(f));
  assert.deepEqual(orphan, [], "weder lebend noch Beleg: ins Archiv (docs/archiv/<pfad>) verschieben oder in core/registry/docs.json als lebend eintragen");
});

test("DOC-4 · Gegenprobe: zu viele lebende Seiten und eine nicht verlinkte lebende Seite fallen auf", () => {
  assert.ok(REG.living.length + REG.maxLiving > REG.maxLiving);
  const readme = read("docs/README.md").toString("utf8");
  assert.ok(!linksIn(readme).some((l) => resolveLink("docs/README.md", l.target) === "docs/gibt-es-nicht.md"));
});
