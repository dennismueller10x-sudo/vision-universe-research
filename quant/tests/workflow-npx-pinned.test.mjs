/* Workflows, die Cloudflare-Token halten, laden Werkzeuge per npx. Eine
   Bereichsangabe wie wrangler@4 zieht bei jedem Lauf die neueste 4.x -
   ein frisch veroeffentlichtes Paket haette dann sofort Zugriff auf die
   Deploy-Geheimnisse (Security-Review 04.10.2026). Jeder npx-Aufruf nennt
   deshalb eine exakte Version. Aktualisieren: Version an allen Stellen
   gleich ersetzen; dieser Test prueft auch, dass es nur eine gibt.
   Ein npx ohne Version ist nur zulaessig, wenn derselbe Workflow das
   Paket vorher exakt installiert (npm install paket@x.y.z): npx nimmt
   dann die lokale Installation. Reine Hinweistexte (echo) fuehren
   nichts aus. Gleiches gilt fuer npm install: jedes Paket mit x.y.z. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", ".github", "workflows");
const aufrufe = [], installationen = [];
for (const f of readdirSync(dir).filter((n) => /\.ya?ml$/.test(n))) {
  const installiert = new Set();
  readFileSync(join(dir, f), "utf8").split("\n").forEach((zeile, i) => {
    if (/^\s*echo\b/.test(zeile)) return;
    if (/\bnpm\s+(?:install|i)\b/.test(zeile)) {
      for (const m of zeile.matchAll(/\s(@?[a-z0-9][\w./-]*)@\d+\.\d+\.\d+(?=\s|$)/gi)) installiert.add(m[1]);
      const rest = zeile.replace(/^.*?\bnpm\s+(?:install|i)\b/, "").split(/\s+/).filter((w) => w && !w.startsWith("-") && !w.startsWith("/"));
      for (const w of rest) installationen.push({ ort: `${f}:${i + 1}`, paket: w });
    }
    for (const m of zeile.matchAll(/\bnpx\s+(?:--yes\s+|-y\s+)?([@a-z0-9][^\s"']*)/gi)) {
      aufrufe.push({ ort: `${f}:${i + 1}`, paket: m[1], lokal: installiert.has(m[1]) });
    }
  });
}

test("jeder npx-Aufruf in Workflows nennt eine exakte Version", () => {
  assert.ok(aufrufe.length > 0, "keine npx-Aufrufe gefunden - Muster pruefen");
  const offen = aufrufe.filter((a) => !a.lokal && !/@\d+\.\d+\.\d+$/.test(a.paket));
  assert.deepEqual(offen, [], "npx ohne exakte Version: " + offen.map((a) => a.ort + " " + a.paket).join(", "));
});

test("ein Werkzeug, eine Version", () => {
  const versionen = {};
  for (const a of aufrufe) {
    const [, name, v] = a.paket.match(/^(@?[^@]+)@(.+)$/) || [];
    if (name) (versionen[name] ||= new Set()).add(v);
  }
  for (const [name, v] of Object.entries(versionen)) assert.equal(v.size, 1, `${name}: ${[...v].join(", ")}`);
});

/* Dasselbe fuer npm install in Workflows (sharp@0.34 lief in einem Job mit
   contents: write als Minor-Bereich). Pfadargumente von --prefix fallen
   oben heraus; was bleibt, ist ein Paket und braucht x.y.z. */
test("jedes per npm install in Workflows installierte Paket hat eine exakte Version", () => {
  assert.ok(installationen.length > 0, "keine npm-install-Aufrufe gefunden - Muster pruefen");
  const offen = installationen.filter((a) => !/^@?[^@]+@\d+\.\d+\.\d+$/.test(a.paket));
  assert.deepEqual(offen, [], "npm install ohne exakte Version: " + offen.map((a) => a.ort + " " + a.paket).join(", "));
});
