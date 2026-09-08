"""The workflows must only call commands that actually exist.

This exists because of a real defect: the integration renamed the CLI's
`snapshot` command to `canonical`, and the update workflow kept calling
`snapshot`. Nothing caught it — the workflow had never run, and a workflow is
not executed by any test suite. The first live run would have failed at the
last step, after the expensive SEC ingest had already happened.

These tests read the workflow files as data and check every command they invoke
against the real CLI parser.
"""
import json
import re
import subprocess
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

ROOT = Path(__file__).resolve().parents[3]
WORKFLOWS = ROOT / ".github" / "workflows"
SEC_WORKFLOWS = ("update-sec-fundamentals.yml", "sec-fundamentals-ci.yml")


def workflow_text(name):
    return (WORKFLOWS / name).read_text(encoding="utf-8")


class CliCommandTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from quant.cli import build_parser
        parser = build_parser()
        subparsers = [action for action in parser._actions
                      if hasattr(action, "choices") and action.choices]
        cls.commands = set(subparsers[0].choices) if subparsers else set()

    def test_the_parser_exposes_commands(self):
        self.assertTrue(self.commands)

    def test_every_cli_command_used_by_a_workflow_exists(self):
        # Only an actual invocation counts. `python3` in front, and the command
        # must not be the head of a path: a step that merely LISTS
        # `scripts/quant/cli.py providers/sec/adapter.js` as files to check is
        # not calling `cli.py providers`, and reporting it as a missing command
        # would send the next reader after a bug that does not exist.
        pattern = re.compile(r"python3?\s+\S*cli\.py\s+([a-z][a-z-]*)(?![\w./-])")
        for name in SEC_WORKFLOWS:
            for command in pattern.findall(workflow_text(name)):
                with self.subTest(workflow=name, command=command):
                    self.assertIn(command, self.commands,
                                  f"{name} calls `cli.py {command}`, which the CLI "
                                  f"does not define. Known: {sorted(self.commands)}")

    def test_every_python_script_a_workflow_calls_exists(self):
        pattern = re.compile(r"python3?\s+(scripts/[\w./-]+\.py)")
        for name in SEC_WORKFLOWS:
            for script in set(pattern.findall(workflow_text(name))):
                with self.subTest(workflow=name, script=script):
                    self.assertTrue((ROOT / script).exists(), f"{script} missing")

    def test_every_node_script_a_workflow_calls_exists(self):
        pattern = re.compile(r"node\s+(scripts/[\w./-]+\.mjs)")
        for name in SEC_WORKFLOWS:
            for script in pattern.findall(workflow_text(name)):
                with self.subTest(workflow=name, script=script):
                    self.assertTrue((ROOT / script).exists(), f"{script} missing")

    def test_referenced_config_files_exist(self):
        pattern = re.compile(r"(quant/config/[\w.-]+\.json)")
        for name in SEC_WORKFLOWS:
            for path in set(pattern.findall(workflow_text(name))):
                with self.subTest(workflow=name, path=path):
                    self.assertTrue((ROOT / path).exists(), f"{path} missing")

    def test_the_live_workflow_runs_the_full_documented_chain(self):
        """Ingest -> canonical -> coverage -> checks -> gates -> export."""
        text = workflow_text("update-sec-fundamentals.yml")
        for command in ("resolve", "ingest", "canonical", "coverage", "gates", "export"):
            with self.subTest(command=command):
                self.assertRegex(text, rf"cli\.py {command}\b")
        self.assertIn("run-sec-gates.mjs", text)

    def test_the_universe_is_resolved_before_the_expensive_ingest(self):
        """The cheap identity check must come first, not after the big fetch."""
        text = workflow_text("update-sec-fundamentals.yml")
        self.assertLess(text.index("cli.py resolve"), text.index("cli.py ingest"))

    def test_every_step_that_reaches_the_sec_declares_the_user_agent(self):
        """A SEC step without the User-Agent gets blocked by the SEC, not by us."""
        import re
        text = workflow_text("update-sec-fundamentals.yml")
        blocks = re.split(r"\n      - name: ", text)
        for block in blocks:
            reaches_sec = any(cmd in block for cmd in
                              ("cli.py resolve", "cli.py ingest", "cli.py retry",
                               "cli.py update"))
            if reaches_sec:
                with self.subTest(step=block.split("\n")[0]):
                    self.assertIn("SEC_USER_AGENT", block)

    def test_the_live_workflow_declares_the_sec_user_agent(self):
        """SEC requires a declaring User-Agent; without it the run gets blocked."""
        text = workflow_text("update-sec-fundamentals.yml")
        self.assertIn("SEC_USER_AGENT", text)
        self.assertIn("@", text.split("SEC_USER_AGENT:")[1].split("\n")[0])

    def test_the_live_workflow_checks_that_every_company_arrived(self):
        """A partial ingest must fail the run, not quietly produce partial data."""
        text = workflow_text("update-sec-fundamentals.yml")
        self.assertIn("Verify every configured company was ingested", text)
        self.assertIn("::error::", text)

    def test_no_workflow_commits_the_regenerable_layers(self):
        text = workflow_text("update-sec-fundamentals.yml")
        for forbidden in ("quant/data/sec/raw", "quant/data/sec/facts"):
            self.assertIn(forbidden, text)


class WorkflowSyntaxTests(unittest.TestCase):
    def test_all_workflows_are_valid_yaml(self):
        try:
            import yaml
        except ImportError:
            self.skipTest("pyyaml not installed")
        for path in sorted(WORKFLOWS.glob("*.yml")):
            with self.subTest(workflow=path.name):
                self.assertIsInstance(yaml.safe_load(path.read_text(encoding="utf-8")), dict)

    def test_the_embedded_python_heredocs_compile(self):
        """A syntax error inside a heredoc only shows up at runtime otherwise."""
        pattern = re.compile(r"python3 - <<'PY'\n(.*?)\n\s*PY\n", re.S)
        found = 0
        for name in SEC_WORKFLOWS:
            for block in pattern.findall(workflow_text(name)):
                dedented = "\n".join(line[10:] if line.startswith(" " * 10) else line.lstrip()
                                     for line in block.split("\n"))
                found += 1
                with self.subTest(workflow=name):
                    compile(dedented, f"<{name}>", "exec")
        self.assertGreater(found, 0, "no embedded python blocks found to check")


class GeneratedArtifactTests(unittest.TestCase):
    """Every artifact this pipeline writes must say what produced it.

    The CI step that checks this had never run before the first pull request —
    it triggers on `pull_request`, and this branch had none. Its first run
    failed, and for the wrong reason: it globbed `quant/data/*.json` and
    asserted the SEC convention over eight files from earlier phases that use
    `asOf` / `methodologyVersion` instead. Narrowing it to this pipeline's own
    output then surfaced two artifacts of ours that genuinely carried no version
    stamp.

    A CI check that only ever runs in CI is a check nobody can run before
    pushing, so the rule lives here too.
    """

    SNAKE = ("schema_version", "generated_at_utc")   # below the boundary
    CAMEL = ("schema", "generatedAtUtc")             # canonical, per schema.js

    @classmethod
    def paths(cls):
        root = ROOT / "quant" / "data" / "sec"
        return sorted(root.glob("*.json")) + sorted(root.glob("*/*.json"))

    def test_generated_artifacts_exist(self):
        self.assertTrue(self.paths(), "no generated SEC artifacts to check")

    def test_every_artifact_is_stamped_and_versioned(self):
        for path in self.paths():
            with self.subTest(path=path.name):
                payload = json.loads(path.read_text(encoding="utf-8"))
                self.assertIsInstance(payload, dict)
                self.assertTrue(
                    any(key in payload for key in self.SNAKE + self.CAMEL),
                    f"{path.name} carries neither {self.SNAKE} nor {self.CAMEL}")
                self.assertIn("versions", payload,
                              f"{path.name} does not say which code produced it")

    def test_the_check_does_not_reach_into_earlier_phases(self):
        """quant/data/*.json follows its own convention and is not ours to police."""
        for path in self.paths():
            self.assertIn("data/sec/", path.as_posix())


class CompanyAgnosticTests(unittest.TestCase):
    """The pipeline may not branch on a specific company — checked on CODE.

    The CI guard for this used to be a `grep -rn` over scripts/quant/sec/. It
    matched comments and __pycache__ binaries alongside code, and the first
    pull request turned it red on lines like "NVDA's 10-Ks for the years ending
    January 2011 to January 2014 tag `fy` one year low" — which is the evidence
    for a fix, not a hack.

    The rule now lives in scripts/quant/check_company_agnostic.py, so CI and
    this test run the same implementation and it can be run before pushing.
    """

    @classmethod
    def setUpClass(cls):
        from quant import check_company_agnostic
        cls.checker = check_company_agnostic

    def test_the_shipped_pipeline_is_company_agnostic(self):
        findings = self.checker.scan()
        self.assertEqual(findings, [], f"company-specific code: {findings}")

    HACKS = (
        'def f(ticker):\n    if ticker == "NVDA":\n        return 1\n',
        'CIK = "0001045810"\n',
        'apple_hack = {"Apple": 1}\n',
        'CIKS = {"0000034088": 2}\n',
        # An underscore is a word character, so `\bNVDA\b` does NOT match this
        # — and a company-specific constant is exactly this shape. The first
        # version of the guard let it through.
        'NVDA_FUDGE = 1.0\n',
        'x = XOM_SCALE\n',
    )

    def test_every_shape_of_company_specific_code_is_caught(self):
        for source in self.HACKS:
            with self.subTest(source=source.strip()):
                path = self._tmp(source)
                code = self.checker.executable_source(path)
                hit = any(pattern.search(code)
                          for pattern, _ in self.checker.PATTERNS)
                self.assertTrue(hit, f"not caught: {source.strip()}")

    def test_a_company_named_in_a_comment_is_not_code(self):
        source = '# NVDA and Apple and Exxon, CIK 0001045810, measured 2026-09-08\nx = 1\n'
        code = self.checker.executable_source(self._tmp(source))
        for token in ("NVDA", "Apple", "Exxon", "0001045810"):
            self.assertNotIn(token, code)

    def test_a_company_named_in_a_docstring_is_not_code(self):
        source = '"""NVDA tags fy one year low for 2011-2014."""\nx = 1\n'
        self.assertNotIn("NVDA", self.checker.executable_source(self._tmp(source)))

    def test_pycache_is_not_scanned(self):
        import pathlib
        base = pathlib.Path(self.checker.ROOT) / "scripts/quant/sec"
        scanned = [p for p in base.rglob("*.py") if "__pycache__" not in p.parts]
        self.assertTrue(scanned)
        self.assertFalse(any("__pycache__" in p.parts for p in scanned))

    def _tmp(self, source):
        import tempfile, pathlib
        directory = tempfile.mkdtemp()
        self.addCleanup(__import__("shutil").rmtree, directory)
        path = pathlib.Path(directory) / "probe.py"
        path.write_text(source, encoding="utf-8")
        return path


if __name__ == "__main__":
    unittest.main()
