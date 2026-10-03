import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const builder = join(repositoryRoot, "scripts", "discover", "build-company-logos.mjs");
const json = (path, value) => writeFileSync(path, JSON.stringify(value) + "\n");

test("scoped logo refresh keeps unrelated reviewed assets and never publishes an unreviewed image", () => {
  const fixture = mkdtempSync(join(tmpdir(), "vu-logo-scoped-"));
  try {
    const searchDir = join(fixture, "discover", "data", "search");
    const configDir = join(fixture, "discover", "config");
    const namesDir = join(fixture, "quant", "data", "market", "security-master");
    const instrumentDir = join(fixture, "quant", "data", "universe", "instruments");
    const output = join(fixture, "shadow-logos");
    mkdirSync(searchDir, { recursive: true });
    mkdirSync(configDir, { recursive: true });
    mkdirSync(namesDir, { recursive: true });
    mkdirSync(instrumentDir, { recursive: true });
    mkdirSync(join(output, "files"), { recursive: true });
    json(join(searchDir, "US_REAL.json"), { entries: [{ s: "KEEP", n: "Keep Corp" }, { i: "vu_new", s: "NEW", n: "New Corp" }] });
    json(join(namesDir, "company-names.json"), { rows: [{ ticker: "NEW", cik: "0000000123", companyName: "New Corp", securityId: "ref_NEW" }] });
    json(join(instrumentDir, "NE.json"), { instruments: [{ symbol: "NEW", instrumentId: "vu_new", masterMemberId: "ref_NEW",
      issuerId: "iss_cik_0000000123", cik: "0000000123", companyName: "New Corp", active: true, primaryListing: true }] });
    for (const file of ["logo-exclusions.json", "logo-urls.json", "logo-sites.json"]) json(join(configDir, file), { symbols: {} });
    json(join(configDir, "logo-rejects.json"), { urls: {}, titles: {} });
    json(join(configDir, "logo-reviewed.json"), { symbols: { KEEP: "reviewed-hash" } });
    writeFileSync(join(output, "files", "KEEP.png"), Buffer.from("preserved"));
    json(join(output, "index.json"), { count: 1, files: { KEEP: "files/KEEP.png" }, dark: ["KEEP"], wide: {} });
    json(join(output, "credits.json"), { credits: { KEEP: { source: "WEBSITE", path: "files/KEEP.png", sha1: "reviewed-hash", page: "https://keep.example/", host: "keep.example" } } });
    json(join(output, "missing.json"), { reasons: { KEEP: "OLD_STALE_REASON" } });

    const preload = join(fixture, "mock-fetch.mjs");
    writeFileSync(preload, `globalThis.fetch = async (url) => {
      const u = String(url);
      const response = (data, headers = {}) => new Response(JSON.stringify(data), { status: 200, headers });
      if (u.includes("query.wikidata.org/sparql")) return response({ results: { bindings: [{
        item: { value: "http://www.wikidata.org/entity/Q123" },
        itemLabel: { value: "New Corp" },
        logo: { value: "http://commons.wikimedia.org/wiki/Special:FilePath/New_logo.png" },
        lp: { value: "http://www.wikidata.org/prop/P154" },
        rank: { value: "http://wikiba.se/ontology#NormalRank" },
        cik: { value: "123" }
      }] } });
      if (u.includes("commons.wikimedia.org/w/api.php")) return response({ query: { pages: [{ title: "File:New logo.png", imageinfo: [{
        sha1: "new-hash", mime: "image/png", thumburl: "https://mock.example/new.png",
        descriptionurl: "https://commons.wikimedia.org/wiki/File:New_logo.png",
        extmetadata: { License: { value: "pd" }, LicenseShortName: { value: "pd" } }
      }] }] } });
      if (u === "https://mock.example/new.png") return new Response(Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAYAAADimHc4AAAACXBIWXMAAAPoAAAD6AG1e1JrAAABW0lEQVR4nO2VMQFEUQyDvhLm51/KGcrJYChDDECTfj/eytMYfMF/6gEmgATMhlAD8EE0QdxMP4AEzIZQA/BBNEHcTD+ABMyGUAPwQTRB3Ew/gATMhlAD8EE0QdxMP4AEzIZQA/BBNEHcTD+ABMyGUAPwQTRB3Ew/gATMhlAD8EE0QdxMP4AEzIZQA/BBNEHcTD+ABMyGUAPwQTRB3Ew/gATMhlAD8EE0QdxMP4AEzIZQA/BBNEHcTD+ABMyGUAPwQTRB3Ew/gATMhlAD8EE0QdxMP4AEzIZQA/BBNEHcTD+ABMyGUAPwQTRB3Ew/gATMhlAD8EE0QdxMP4AEzIZQA/BBNEHcTD+ABMyGUAPwQTRB3Ew/gATMhlAD8EE0QdxMP4AEzIZQA/BBNEHcTD+ABMyGUAPwQTRB3Ew/gATMhlAD8EE0QdxMP4AEzIZQA/BBNEHcTD+ABMyGYOYP6SFAZmB8lIYAAAAASUVORK5CYII="), c => c.charCodeAt(0)), { status: 200, headers: { "content-type": "image/png" } });
      throw new Error("Unexpected network request: " + u);
    };\n`);
    const args = ["--import", preload, builder, `--root=${fixture}`, `--output=${output}`, `--config-root=${fixture}`,
      "--tickers=NEW", "--no-name-search", "--no-web"];
    const run = spawnSync(process.execPath, args, { encoding: "utf8", timeout: 15000 });
    assert.equal(run.status, 0, run.stderr || run.stdout);
    const index = JSON.parse(readFileSync(join(output, "index.json"), "utf8"));
    const credits = JSON.parse(readFileSync(join(output, "credits.json"), "utf8")).credits;
    const missing = JSON.parse(readFileSync(join(output, "missing.json"), "utf8")).reasons;
    assert.deepEqual(index.files, { KEEP: "files/KEEP.png" });
    assert.deepEqual(index.dark, ["KEEP"]);
    assert.ok(existsSync(join(output, "files", "KEEP.png")));
    assert.ok(existsSync(join(output, "files", "NEW.png")));
    assert.equal(credits.NEW.pending, true);
    assert.equal(missing.NEW, "WARTET_AUF_SICHTPRUEFUNG");
    assert.equal(missing.KEEP, "OLD_STALE_REASON");
    assert.equal(JSON.parse(readFileSync(join(output, "summary.json"), "utf8")).scopeUniverse, 1);

    json(join(configDir, "logo-reviewed.json"), { symbols: { KEEP: "reviewed-hash", NEW: "new-hash" } });
    const approved = spawnSync(process.execPath, args, { encoding: "utf8", timeout: 15000 });
    assert.equal(approved.status, 0, approved.stderr || approved.stdout);
    assert.equal(JSON.parse(readFileSync(join(output, "index.json"), "utf8")).files.NEW, "files/NEW.png");

    json(join(namesDir, "company-names.json"), { rows: [{ ticker: "NEW", cik: "0000000123", companyName: "New Corp", securityId: "ref_OTHER" }] });
    const mismatch = spawnSync(process.execPath, [...args, "--no-wikidata"], { encoding: "utf8", timeout: 15000 });
    assert.equal(mismatch.status, 0, mismatch.stderr || mismatch.stdout);
    const rejectedIndex = JSON.parse(readFileSync(join(output, "index.json"), "utf8"));
    assert.equal(rejectedIndex.files.NEW, undefined);
    assert.equal(rejectedIndex.files.KEEP, "files/KEEP.png");
    assert.equal(existsSync(join(output, "files", "NEW.png")), false);
    assert.equal(JSON.parse(readFileSync(join(output, "missing.json"), "utf8")).reasons.NEW, "CANONICAL_IDENTITY_UNVERIFIED");
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
