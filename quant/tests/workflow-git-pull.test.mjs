/* Ein blankes `git pull` in einem Daten-Workflow holt jeden Zweig des
   Repositorys. Am 03.10.2026 dauerte das im Lauf der langen Kursreihen
   49 Minuten; der Job lief in seine Grenze, die gebauten Reihen kamen nie
   an. Jeder Workflow holt deshalb nur seinen eigenen Zweig. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", ".github", "workflows");

test("WG1 · kein Workflow holt mit einem blanken git pull alle Zweige", () => {
  const blank = [];
  for (const f of readdirSync(DIR).filter((n) => /\.ya?ml$/.test(n))) {
    readFileSync(join(DIR, f), "utf8").split("\n").forEach((line, i) => {
      const code = line.replace(/#.*$/, "").trim();
      if (/^git pull\b/.test(code) && !/\bgit pull\b[^\n]*\borigin\s+\S+/.test(code)) blank.push(f + ":" + (i + 1) + "  " + code);
    });
  }
  assert.deepEqual(blank, []);
});
