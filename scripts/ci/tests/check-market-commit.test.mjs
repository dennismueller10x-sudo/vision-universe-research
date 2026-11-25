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
test("CMC-3 haengender Lauf ohne Commit (01:30) ist rot, mit Commit gruen", () => {
  const l = lauf({ status: "in_progress", conclusion: null });
  const r = beurteilen({ jetzt, runs: [l], commits: [], phase: "spaet" });
  assert.equal(r.ergebnis, "failure"); assert.match(r.grund, /laeuft seit 125 min/);
  assert.equal(beurteilen({ jetzt, runs: [l], commits: [commit("2026-11-24T23:50:00Z")] }).ergebnis, "success");
});
test("CMC-4 fehlgeschlagener Lauf ist rot, auch wenn die Kurse draussen sind (Hinweis im Text)", () => {
  const r = beurteilen({ jetzt, runs: [lauf({ conclusion: "failure" })], commits: [commit("2026-11-24T23:50:00Z")] });
  assert.equal(r.ergebnis, "failure"); assert.match(r.grund, /veroeffentlicht/);
});
test("CMC-5 kein Lauf seit dem Abendtakt ist rot; ein alter Lauf zaehlt nicht", () => {
  assert.equal(beurteilen({ jetzt, runs: [], commits: [], phase: "spaet" }).ergebnis, "failure");
  assert.equal(beurteilen({ jetzt, runs: [lauf({ created_at: "2026-11-23T22:30:10Z" })], commits: [], phase: "spaet" }).ergebnis, "failure");
});
test("CMC-6 Push-Laeufe (uebersprungen) zaehlen nicht als Abendlauf", () => {
  assert.equal(beurteilen({ jetzt, runs: [lauf({ event: "push", conclusion: "skipped" })], commits: [], phase: "spaet" }).ergebnis, "failure");
});

test("CMC-7 00:35: fehlender oder roter Lauf ohne Commit startet den Neustart, haengender Lauf wartet", () => {
  assert.equal(beurteilen({ jetzt, runs: [], commits: [] }).aktion, "neustart");
  const rot = beurteilen({ jetzt, runs: [lauf({ conclusion: "failure" })], commits: [] });
  assert.equal(rot.aktion, "neustart"); assert.equal(rot.ergebnis, "");
  const haengt = beurteilen({ jetzt, runs: [lauf({ status: "in_progress", conclusion: null })], commits: [] });
  assert.equal(haengt.aktion, undefined); assert.equal(haengt.ergebnis, "", "bis 01:30 abwarten");
});
test("CMC-8 nur ein Neustart pro Nacht: nach dem Neustart bei Rot Alarm", () => {
  const neu = lauf({ created_at: "2026-11-25T00:36:00Z", display_title: "Marktdaten-Refresh · Takt 30 22 * * 1-5 Neustart 00:35", conclusion: "failure", html_url: "https://x/run/2" });
  const r = beurteilen({ jetzt: new Date("2026-11-25T03:00:00Z"), runs: [neu, lauf()], commits: [] });
  assert.equal(r.aktion, undefined); assert.equal(r.ergebnis, "failure");
});
test("CMC-9 01:30: haengender Lauf ohne Commit ist Alarm; laufender Neustart wird abgewartet", () => {
  const spaet = new Date("2026-11-25T01:30:00Z");
  const haengt = lauf({ status: "in_progress", conclusion: null });
  assert.equal(beurteilen({ jetzt: spaet, runs: [haengt], commits: [] }).ergebnis, "failure");
  const neu = lauf({ created_at: "2026-11-25T00:36:00Z", display_title: "x Neustart 00:35", status: "in_progress", conclusion: null });
  const r = beurteilen({ jetzt: spaet, runs: [neu, lauf({ conclusion: "failure" })], commits: [] });
  assert.equal(r.ergebnis, ""); assert.match(r.grund, /Neustart/);
  assert.equal(beurteilen({ jetzt: spaet, runs: [], commits: [] }).ergebnis, "failure");
});
