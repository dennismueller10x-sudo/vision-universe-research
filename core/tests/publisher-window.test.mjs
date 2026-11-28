/* Veroeffentlicher und Boersenfenster (Steuerung 28.11.2026), Vertragstest PW.
   Am Fr 27.11. 16:47-17:59 UTC lief company-intelligence-profile-source (72 min). pages-release zaehlte den laufenden Lauf als
   "Veroeffentlicher" und machte jeden Takt zum Voll-Release (15-20 min statt ~4); die Auslieferung lag 15-25 min hinter dem
   Repository, der Intraday-Waechter war sechsmal rot (RUNBOOK §14). Ausgeloest hatte es #2456 (Takt 03:47 -> 16:47 UTC).
   Vertrag: Die Liste der Veroeffentlicher steht nur im Schritt "Veroeffentlicher seit dem Basis-Paket?" von pages-release.yml
   (einzige Wahrheit, hier gelesen, nicht nachgepflegt). Ein Workflow, dessen LAUFENDER Lauf dort zaehlt, darf im Boersenfenster
   (Mo-Fr 13:30-21:30 UTC, RUNBOOK §14) keinen Termin in core/registry/schedule.json haben. Geprueft wird der Start; ein Lauf, der
   davor beginnt und ins Fenster reicht, faellt nicht darunter (Dauer steht nicht im Register). */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadRegistry } from "../../scripts/core/schedule-registry.mjs";
import { leseCron, cronTrifft } from "../../worker-waker/src/zeitplan.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WF = readFileSync(join(ROOT, ".github/workflows/pages-release.yml"), "utf8");
const REG = loadRegistry(ROOT);

/* Der Schritt steht im Job intraday-schnell. */
const JOB = WF.slice(WF.indexOf("\n  intraday-schnell:\n"), WF.indexOf("\n  deploy-schnell:\n"));
const PUBLISHERS = (JOB.match(/for wf in ([a-z0-9 -]+); do/) || [])[1]?.trim().split(/\s+/) || [];
/* Workflows mit eigener Regel (if/elif "$wf" = name): ihr LAUFENDER Lauf zaehlt nicht. */
const OHNE_LAUFT_NOCH = new Set([...JOB.matchAll(/(?:if|elif) \[ "\$wf" = ([a-z0-9-]+) \]/g)].map((m) => m[1]));
const ZAEHLT_LAUFEND = PUBLISHERS.filter((w) => !OHNE_LAUFT_NOCH.has(w));

const WOCHE = Date.UTC(2026, 10, 30); // Montag 30.11.2026 00:00 UTC
function imBoersenfenster(zeitMs) {
  const d = new Date(zeitMs), tag = d.getUTCDay(), min = d.getUTCHours() * 60 + d.getUTCMinutes();
  return tag >= 1 && tag <= 5 && min >= 13 * 60 + 30 && min < 21 * 60 + 30;
}
function startsImFenster(cron) {
  const c = leseCron(cron), treffer = [];
  for (let m = 0; m < 7 * 24 * 60; m++) { const t = WOCHE + m * 60000; if (imBoersenfenster(t) && cronTrifft(c, t)) treffer.push(new Date(t).toISOString().slice(0, 16)); }
  return treffer;
}

test("PW-1 · die Liste der Veroeffentlicher wird aus pages-release.yml gelesen (liest der Test noch das Richtige?)", () => {
  for (const w of ["company-intelligence-profile-source", "company-intelligence-refresh", "pages-release-marker"]) assert.ok(PUBLISHERS.includes(w), w + " fehlt in der Liste");
  assert.ok(OHNE_LAUFT_NOCH.has("company-intelligence-refresh") && OHNE_LAUFT_NOCH.has("company-intelligence-profile-source"));
  assert.ok(ZAEHLT_LAUFEND.length > 0 && !ZAEHLT_LAUFEND.includes("company-intelligence-profile-source"));
});

test("PW-2 · die Fenster-Pruefung erkennt den Fall vom 27.11. (16:47 UTC taeglich liegt im Fenster, 03:47 nicht)", () => {
  assert.ok(startsImFenster("47 16 * * *").length === 5, "Mo-Fr je ein Start");
  assert.equal(startsImFenster("47 3 * * *").length, 0);
  assert.equal(startsImFenster("30 21 * * *").length, 0, "21:30 gehoert nicht mehr zum Fenster");
  assert.equal(startsImFenster("29 13 * * *").length, 0);
});

test("PW-3 · kein Workflow, dessen laufender Lauf einen Voll-Release erzwingt, hat einen Termin im Boersenfenster", () => {
  for (const e of REG.entries) {
    const name = e.workflow.replace(/\.ya?ml$/, "");
    if (!ZAEHLT_LAUFEND.includes(name)) continue;
    const hits = startsImFenster(e.cron);
    assert.equal(hits.length, 0, e.id + " (" + e.cron + ") startet im Boersenfenster " + hits.slice(0, 2).join(", ") +
      ": sein laufender Lauf macht jeden Intraday-Takt zum Voll-Release (pages-release.yml, Schritt Veroeffentlicher)");
  }
});
