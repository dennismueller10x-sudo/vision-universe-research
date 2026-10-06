import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const pages = readFileSync(join(root, ".github", "workflows", "pages-release.yml"), "utf8");
const producerFiles = [
  "intraday-snapshots.yml",
  "market-data-refresh.yml",
  "sec-consumer-fundamentals.yml"
];

test("every main data producer that pushes product artifacts triggers Pages delivery", () => {
  for (const file of producerFiles) {
    const producer = readFileSync(join(root, ".github", "workflows", file), "utf8");
    const workflowName = producer.match(/^name:\s*(.+)$/m)?.[1];
    assert.ok(workflowName, `${file} has no workflow name`);
    assert.ok(pages.includes(`- "${workflowName}"`),
      `${workflowName} pushes product data but does not trigger Pages delivery`);
  }
});

test("workflow-run deployment checks out fresh main and deploys only successful producers", () => {
  assert.match(pages, /github\.event\.workflow_run\.conclusion == 'success'/);
  assert.match(pages, /github\.event_name == 'workflow_run' && 'main'/);
});
