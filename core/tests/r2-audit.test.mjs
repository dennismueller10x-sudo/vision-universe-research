import test from "node:test";
import assert from "node:assert/strict";
import { classifyOp, summarise, evaluate, pct, toMarkdown } from "../../scripts/core/r2-audit.mjs";

test("classifyOp ordnet Operationen Class A/B/frei zu", () => {
  assert.equal(classifyOp("PutObject"), "A");
  assert.equal(classifyOp("ListObjects"), "A");
  assert.equal(classifyOp("GetObject"), "B");
  assert.equal(classifyOp("HeadObject"), "B");
  assert.equal(classifyOp("DeleteObject"), "frei");
  assert.equal(classifyOp("Unbekannt"), "unklassifiziert");
});

test("summarise summiert und gruppiert nach Praefix", () => {
  const s = summarise([{ key: "v1/sec/a.json", size: 10 }, { key: "v1/sec/b.json", size: 30 }, { key: "v1/hist/x/y.json", size: 5 }, { key: "root.txt", size: 1 }], 2);
  assert.equal(s.objects, 4); assert.equal(s.bytes, 46);
  assert.equal(s.prefixes[0].prefix, "v1/sec/"); assert.equal(s.prefixes[0].bytes, 40);
  assert.ok(s.prefixes.some((p) => p.prefix === "(Wurzel)"));
});

test("evaluate vergleicht mit Decke (8 GB) und Freigrenze (10 GB)", () => {
  const ok = evaluate({ storageBytes: 1e9 })[0]; assert.equal(ok.verdict, "OK");
  const warn = evaluate({ storageBytes: 6e9 })[0]; assert.equal(warn.verdict, "WARNUNG");
  const over = evaluate({ storageBytes: 8.1e9 })[0]; assert.equal(over.verdict, "UEBER_DECKE");
  assert.ok(over.headroomToFree > 1.8e9 && over.headroomToFree < 2e9);
  assert.equal(evaluate({ storageBytes: 10.5e9 })[0].verdict, "UEBER_FREIGRENZE");
  assert.equal(evaluate({ storageBytes: 1 })[1].verdict, "UNGEMESSEN");
});

test("pct und toMarkdown geben keine Schluessel aus", () => {
  assert.equal(pct(1, 4), 25);
  const md = toMarkdown({ checkedAt: "x", evaluation: evaluate({ storageBytes: 1e9 }), evaluationNote: "n", s3: { listed: false, error: "e" }, buckets: { readable: false } });
  assert.ok(md.includes("STORAGE_BYTES")); assert.ok(!/secret|access_key/i.test(md));
});
