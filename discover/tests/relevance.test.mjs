import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const R = require("../engines/relevance.js");

const karte = (symbol, perzentil) => ({ symbol, metrics: { leadershipPercentile: perzentil } });
/* Perzentile unter 99, damit kein Testtitel versehentlich "aussergewoehnlich" ist. */
const liste = (syms) => syms.map((s, i) => karte(s, 90 - i));
const rec = { AAPL: { tier: 1 }, MU: { tier: 2 }, XYZ: { tier: 1 } };

test("Discovery-Reihenfolge: dieselbe Menge geht hinein und kommt heraus", () => {
  const eingabe = liste(["A", "B", "AAPL", "C", "D", "E", "F", "G"]);
  const { cards } = R.discoveryOrder(eingabe, { recognition: rec });
  assert.deepEqual(cards.map((c) => c.symbol).sort(), eingabe.map((c) => c.symbol).sort());
  assert.equal(cards.length, eingabe.length);
});

test("Ohne Bekanntheitsliste bleibt die Rangliste unveraendert", () => {
  const eingabe = liste(["A", "B", "C", "D", "E", "F"]);
  const { cards } = R.discoveryOrder(eingabe, {});
  assert.deepEqual(cards.map((c) => c.symbol), ["A", "B", "C", "D", "E", "F"]);
});

test("Ein bekannter Name im oberen Fenster rueckt nach vorn - aber nur um den Bonus", () => {
  const eingabe = liste(["A", "B", "AAPL", "C", "D", "E", "F", "G", "H", "I"]);
  const { cards, trace } = R.discoveryOrder(eingabe, { recognition: rec });
  const pos = cards.findIndex((c) => c.symbol === "AAPL");
  assert.ok(pos < 2, "AAPL rueckt vor B");
  const t = trace.find((x) => x.symbol === "AAPL");
  assert.equal(t.tier, 1); assert.equal(t.bonus, 0.18); assert.equal(t.quantRank, 3);
});

test("Ein bekannter Name aus der unteren Haelfte wird NICHT gehoben", () => {
  const eingabe = liste(["A", "B", "C", "D", "E", "F", "G", "H", "XYZ", "J"]);
  const { cards, trace } = R.discoveryOrder(eingabe, { recognition: rec });
  assert.equal(cards.findIndex((c) => c.symbol === "XYZ"), 8);
  assert.equal(trace.find((x) => x.symbol === "XYZ").bonus, 0);
});

test("Kurze Listen bleiben, wie sie sind", () => {
  const eingabe = liste(["A", "AAPL", "C"]);
  assert.deepEqual(R.discoveryOrder(eingabe, { recognition: rec }).cards.map((c) => c.symbol), ["A", "AAPL", "C"]);
});

test("Deterministisch: zweimal dasselbe ergibt dasselbe", () => {
  const eingabe = liste(["A", "B", "MU", "AAPL", "C", "D", "E", "F"]);
  const a = R.discoveryOrder(eingabe, { recognition: rec }).cards.map((c) => c.symbol);
  const b = R.discoveryOrder(eingabe, { recognition: rec }).cards.map((c) => c.symbol);
  assert.deepEqual(a, b);
});

test("Diversity: ein Titel fuehrt hoechstens eine Surface an", () => {
  const s1 = { id: "eins", cards: liste(["VLO", "PSX", "A", "B", "C", "D", "E", "F"]), show: 4 };
  const s2 = { id: "zwei", cards: liste(["VLO", "PSX", "G", "H", "I", "J", "K", "L"]), show: 4 };
  const [e, z] = R.diversify([s1, s2]);
  assert.deepEqual(e.cards.map((c) => c.symbol), ["VLO", "PSX", "A", "B"]);
  assert.ok(!z.cards.slice(0, 2).some((c) => c.symbol === "VLO" || c.symbol === "PSX"),
    "VLO und PSX fuehren die zweite Surface nicht an: " + z.cards.map((c) => c.symbol));
  assert.equal(z.hidden, 2);
});

test("Diversity: aussergewoehnliche Titel duerfen zweimal fuehren", () => {
  const top = (s, p) => ({ symbol: s, metrics: { leadershipPercentile: p } });
  const s1 = { id: "eins", cards: [top("VLO", 99.5), ...liste(["A", "B", "C", "D", "E", "F"])], show: 4 };
  const s2 = { id: "zwei", cards: [top("VLO", 99.5), ...liste(["G", "H", "I", "J", "K", "L"])], show: 4 };
  const [, z] = R.diversify([s1, s2]);
  assert.equal(z.cards[0].symbol, "VLO");
});

test("Diversity: nummerierte Ranglisten werden nie veraendert, zaehlen aber", () => {
  const s1 = { id: "top", pure: true, cards: liste(["VLO", "PSX", "A", "B", "C", "D", "E", "F"]), show: 3 };
  const s2 = { id: "zwei", cards: liste(["VLO", "PSX", "G", "H", "I", "J", "K", "L"]), show: 4 };
  const [t, z] = R.diversify([s1, s2]);
  assert.deepEqual(t.cards.map((c) => c.symbol), ["VLO", "PSX", "A"]);
  assert.notEqual(z.cards[0].symbol, "VLO");
});

test("Diversity: kurze Listen werden nicht gekuerzt", () => {
  const s1 = { id: "eins", cards: liste(["ABM", "NX", "A", "B", "C", "D", "E", "F"]), show: 4 };
  const s2 = { id: "kurz", cards: liste(["ABM", "NX", "NRT", "AIRT"]), show: 4 };
  const [, k] = R.diversify([s1, s2]);
  assert.equal(k.cards.length, 4);
  assert.equal(k.hidden, 0);
});

test("Diversity: es wird entfernt, nie umsortiert", () => {
  const s1 = { id: "eins", cards: liste(["A", "B", "C", "D", "E", "F", "G", "H"]), show: 3 };
  const s2 = { id: "zwei", cards: liste(["B", "X", "A", "Y", "Z", "Q", "W", "V"]), show: 4 };
  const [, z] = R.diversify([s1, s2]);
  const reihenfolge = z.cards.map((c) => c.symbol);
  const original = s2.cards.map((c) => c.symbol).filter((s) => reihenfolge.includes(s));
  assert.deepEqual(reihenfolge, original);
});

test("Diversity: hoechstens zwei Auftritte je Titel auf der ganzen Seite", () => {
  const mk = (id) => ({ id, cards: liste(["Z", "Y", "X", "A", "B", "C", "D", "E"]), show: 6 });
  const out = R.diversify([mk("1"), mk("2"), mk("3"), mk("4")]);
  const auftritte = {};
  out.forEach((s) => s.cards.forEach((c) => { auftritte[c.symbol] = (auftritte[c.symbol] || 0) + 1; }));
  assert.ok(Object.values(auftritte).every((n) => n <= 2), JSON.stringify(auftritte));
});

/* Der Befund vom 18.09.2026: nach dem EOD-Nachlauf stand VLO im 99,97.
   Perzentil und fuehrte drei Ranglisten an. Der Verifier schlug an, die
   Engine konnte nichts tun - eine Rangliste darf sie nicht anfassen.
   Diese beiden Tests halten fest, was die Engine wirklich zusagt. */

test("Diversity: eine Rangliste bleibt unveraendert - auch wenn derselbe Titel schon fuehrt", () => {
  const spitze = karte("VLO", 99.97);
  const reihe = { id: "row1", cards: [spitze, ...liste(["A", "B", "C", "D", "E", "F", "G"])], show: 6 };
  const rang1 = { id: "top-momentum", pure: true, cards: [spitze, ...liste(["H", "I", "J", "K", "L", "M"])], show: 10 };
  const rang2 = { id: "top-staerke", pure: true, cards: [spitze, ...liste(["N", "O", "P", "Q", "R", "S"])], show: 10 };
  const out = R.diversify([reihe, rang1, rang2]);
  assert.equal(out[1].cards[0].symbol, "VLO", "die Rangliste wurde veraendert");
  assert.equal(out[2].cards[0].symbol, "VLO", "die zweite Rangliste wurde veraendert");
  assert.equal(out[1].hidden, 0);
  assert.equal(out[2].hidden, 0);
});

test("Diversity: in redaktionellen Reihen fuehrt kein Titel ein drittes Mal", () => {
  const spitze = karte("VLO", 99.97);
  const reihe = (id, rest) => ({ id, cards: [spitze, ...liste(rest)], show: 6 });
  const out = R.diversify([
    reihe("row1", ["A", "B", "C", "D", "E", "F", "G"]),
    reihe("row2", ["H", "I", "J", "K", "L", "M", "N"]),
    reihe("row3", ["O", "P", "Q", "R", "S", "T", "U"])
  ]);
  let fuehrt = 0;
  out.forEach((s) => s.cards.forEach((c, i) => { if (i < 2 && c.symbol === "VLO") fuehrt++; }));
  assert.ok(fuehrt <= 2, "VLO fuehrt " + fuehrt + " redaktionelle Reihen an");
});
