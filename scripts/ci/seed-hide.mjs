#!/usr/bin/env node
/* Teil von scripts/ci/seed-data-branch.sh: eingespielte Datenzweig-Dateien fuer Git unsichtbar machen.
   Bekannte (in main eingefrorene) Dateien -> git update-index --skip-worktree; neue -> .git/info/exclude.
   So committet `git add -A` in einem Lauf nie Daten aus dem Datenzweig nach main.
   Aufruf: node scripts/ci/seed-hide.mjs <bericht.json aus overlay-data-branch.mjs> */
import { readFileSync, appendFileSync, existsSync, statSync, readdirSync, mkdirSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { execFileSync } from "node:child_process";

export function hide(rows, cwd = process.cwd(), env = process.env) {
  const git = (...a) => execFileSync("git", a, { cwd, env, encoding: "utf8" });
  const files = [];
  const walk = (p) => {
    const abs = join(cwd, p);
    if (!existsSync(abs)) return;
    if (statSync(abs).isDirectory()) for (const e of readdirSync(abs)) walk(join(p, e));
    else files.push(p);
  };
  for (const r of rows) if (r.status === "IDENTICAL" || r.status === "OVERLAID") walk(r.path.replace(/\/$/, ""));
  if (!files.length) return { hidden: 0, excluded: 0 };
  const tracked = new Set(git("ls-files", "-z", "--", ...new Set(rows.map((r) => r.path.replace(/\/$/, "")))).split("\0").filter(Boolean));
  const known = files.filter((f) => tracked.has(f)), fresh = files.filter((f) => !tracked.has(f));
  for (let i = 0; i < known.length; i += 500) git("update-index", "--skip-worktree", "--", ...known.slice(i, i + 500));
  if (fresh.length) {
    const ex = join(cwd, git("rev-parse", "--git-path", "info/exclude").trim());
    mkdirSync(dirname(ex), { recursive: true });
    appendFileSync(ex, "\n# Datenzweig (seed-data-branch.sh)\n" + fresh.map((f) => "/" + f).join("\n") + "\n");
  }
  return { hidden: known.length, excluded: fresh.length };
}

if (process.argv[2]) {
  const rep = JSON.parse(readFileSync(process.argv[2], "utf8"));
  const r = hide(rep.rows);
  console.log(`[datenzweig] fuer Git unsichtbar: ${r.hidden} bekannte Dateien (skip-worktree), ${r.excluded} neue (exclude)`);
}
