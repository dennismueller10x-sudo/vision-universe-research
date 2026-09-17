/* =========================================================================
   VU SOCIAL — Der Inhaltsabdruck (CH1–CH8)

   Dieselbe Rechnung steht zweimal im Projekt: einmal hier im Repository,
   einmal im Worker. Der Worker laeuft bei Cloudflare und kann nichts aus
   diesem Repository laden; eine geteilte Datei gaebe es nur um den Preis
   eines Build-Schritts, den dieses Projekt bewusst nicht hat.

   Zwei Implementierungen derselben Frage laufen frueher oder spaeter
   auseinander. Hier waere die Folge besonders unangenehm: eine Freigabe,
   die der Worker ablehnt, obwohl sich nichts geaendert hat — oder
   schlimmer, eine, die er annimmt, obwohl sich etwas geaendert hat.

   CH5 ist deshalb der eigentliche Gegenstand dieser Datei: er ruft BEIDE
   Funktionen mit denselben Eingaben auf. Er ist die Verbindung zwischen
   den zwei Dateien, und ohne ihn gaebe es keine.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

import { contentHash as workerHash } from
  "../../workers/vision-universe-social/src/redact.js";

const require = createRequire(import.meta.url);
const Repo = require("../engines/content-hash.js");

const BEISPIELE = [
  { contentId: "pkg_a", imageUrl: "https://x.invalid/a.jpg", caption: "Ein Text." },
  { contentId: "pkg_b", imageUrl: "https://x.invalid/b.jpg", caption: "" },
  { contentId: "pkg_c", imageUrl: "https://x.invalid/c.jpg" },
  { contentId: "pkg_d", imageUrl: "https://x.invalid/d.jpg", caption: null },
  /* Umlaute, Emoji, Zeilenumbrueche, Anfuehrungszeichen: alles, woran
     sich zwei Implementierungen unterscheiden koennten. */
  { contentId: "pkg_e", imageUrl: "https://x.invalid/e.jpg",
    caption: "Große Überprüfung — \"zitiert\"\nZeile zwei\t\u{1F4C8}" },
  { contentId: "pkg_f", imageUrl: "https://x.invalid/f.jpg?a=1&b=2#frag", caption: "a\\b/c" }
];

test("CH1 · Der Abdruck ist stabil", () => {
  const a = Repo.contentHash(BEISPIELE[0]);
  const b = Repo.contentHash(BEISPIELE[0]);
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
});

test("CH2 · Jeder der drei Teile aendert ihn", () => {
  const basis = Repo.contentHash(BEISPIELE[0]);
  for (const feld of ["contentId", "imageUrl", "caption"]) {
    const anders = Object.assign({}, BEISPIELE[0], { [feld]: BEISPIELE[0][feld] + "x" });
    assert.notEqual(Repo.contentHash(anders), basis, feld);
  }
});

test("CH3 · Was nicht oeffentlich wird, aendert ihn nicht", () => {
  /* Sonst waere eine Freigabe schon dadurch ungueltig, dass jemand sie
     erneut aufschreibt — mit anderem Zeitstempel oder anderem Namen. */
  const basis = Repo.contentHash(BEISPIELE[0]);
  const mitBeiwerk = Repo.contentHash(Object.assign({}, BEISPIELE[0], {
    approvedAt: "2026-01-01T00:00:00Z", approvedBy: "jemand",
    strategyVersion: "v9", candidateId: "cand_1", hashtags: ["a", "b"]
  }));
  assert.equal(mitBeiwerk, basis);
});

test("CH4 · Leerer Text und fehlender Text sind derselbe Abdruck", () => {
  /* Beide haben dieselbe oeffentliche Wirkung: kein Text. Sie
     verschieden zu behandeln haette eine Freigabe an einer Stelle
     scheitern lassen, an der sich nichts geaendert hat. */
  const ohne = Repo.contentHash({ contentId: "a", imageUrl: "b" });
  assert.equal(Repo.contentHash({ contentId: "a", imageUrl: "b", caption: "" }), ohne);
  assert.equal(Repo.contentHash({ contentId: "a", imageUrl: "b", caption: null }), ohne);
});

test("CH5 · Repository und Worker rechnen dasselbe", async () => {
  /* Der eigentliche Gegenstand dieser Datei. */
  for (const spec of BEISPIELE) {
    const hier = Repo.contentHash(spec);
    const dort = await workerHash(spec);
    assert.equal(hier, dort, "Abweichung bei " + JSON.stringify(spec).slice(0, 90));
  }
});

test("CH6 · Auch bei Umlauten und Emoji", async () => {
  /* Ein Zeichen jenseits der Basic Multilingual Plane ist der Fall, an
     dem sich eine Byte- von einer Zeichenrechnung unterscheidet. */
  const spec = { contentId: "pkg_u", imageUrl: "https://x.invalid/u.jpg",
    caption: "\u{1F680}\u{1F4C8} Größe: 38 %" };
  assert.equal(Repo.contentHash(spec), await workerHash(spec));
});

test("CH7 · Die kanonische Form hat eine feste Reihenfolge", () => {
  /* Nicht sortiert, sondern festgelegt — und an beiden Stellen dieselbe.
     Eine Sortierung waere eine zweite Regel, die auch auseinanderlaufen
     koennte. */
  assert.equal(Repo.canonical({ caption: "c", imageUrl: "b", contentId: "a" }),
    '{"contentId":"a","imageUrl":"b","caption":"c"}');
});

test("CH8 · Zahlen und Objekte werden zu Text, nicht zu Fehlern", () => {
  /* Eine Kennung, die als Zahl hereinkommt, darf nicht einen anderen
     Abdruck ergeben als dieselbe Kennung als Text. */
  assert.equal(Repo.contentHash({ contentId: 123, imageUrl: "b", caption: "c" }),
               Repo.contentHash({ contentId: "123", imageUrl: "b", caption: "c" }));
});
