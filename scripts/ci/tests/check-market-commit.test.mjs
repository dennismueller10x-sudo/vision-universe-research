import { test } from "node:test";
import assert from "node:assert/strict";
import { abendtakt, beurteilen } from "../check-market-commit.mjs";

const jetzt = new Date("2026-11-25T00:35:00Z");
const lauf = (o) => ({ created_at: "2026-11-24T22:30:10Z", event: "workflow_dispatch", status: "completed", conclusion: "success", html_url: "https://x/run/1", ...o });
const commit = (date) => ({ sha: "abcdef0123456789", commit: { message: "Marktdaten-Refresh: Tageskurse, Faktoren", committer: { date } } });

test("CMC-1 der Abendtakt ist 22:30 UTC des Vortags, am Abend derselbe Tag", () => {
  assert.equal(abendtakt(jetzt).toISOString(), "2026-11-24T22:30:00.000Z");
  assert.equal(abendtakt(new Date("2026-11-24T23:10:00Z")).toISOString(), "2026-11-24T22:30:00.000Z");
});
test("CMC-2 beendeter Lauf mit success ist gruen (auch ohne Commit, Feiertag)", () => {
  assert.equal(beurteilen({ jetzt, runs: [lauf()], commits: [] }).ergebnis, "success");
});
test("CMC-3 haengender Lauf ohne Commit ist rot, mit Commit gruen", () => {
  const l = lauf({ status: "in_progress", conclusion: null });
  const r = beurteilen({ jetzt, runs: [l], commits: [] });
  assert.equal(r.ergebnis, "failure"); assert.match(r.grund, /laeuft seit 125 min/);
  assert.equal(beurteilen({ jetzt, runs: [l], commits: [commit("2026-11-24T23:50:00Z")] }).ergebnis, "success");
});
test("CMC-4 fehlgeschlagener Lauf ist rot, auch wenn die Kurse draussen sind (Hinweis im Text)", () => {
  const r = beurteilen({ jetzt, runs: [lauf({ conclusion: "failure" })], commits: [commit("2026-11-24T23:50:00Z")] });
  assert.equal(r.ergebnis, "failure"); assert.match(r.grund, /veroeffentlicht/);
});
test("CMC-5 kein Lauf seit dem Abendtakt ist rot; ein alter Lauf zaehlt nicht", () => {
  assert.equal(beurteilen({ jetzt, runs: [], commits: [] }).ergebnis, "failure");
  assert.equal(beurteilen({ jetzt, runs: [lauf({ created_at: "2026-11-23T22:30:10Z" })], commits: [] }).ergebnis, "failure");
});
test("CMC-6 Push-Laeufe (uebersprungen) zaehlen nicht als Abendlauf", () => {
  assert.equal(beurteilen({ jetzt, runs: [lauf({ event: "push", conclusion: "skipped" })], commits: [] }).ergebnis, "failure");
});
