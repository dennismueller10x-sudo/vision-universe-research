"""The workflows must only call commands that actually exist.

This exists because of a real defect: the integration renamed the CLI's
`snapshot` command to `canonical`, and the update workflow kept calling
`snapshot`. Nothing caught it — the workflow had never run, and a workflow is
not executed by any test suite. The first live run would have failed at the
last step, after the expensive SEC ingest had already happened.

These tests read the workflow files as data and check every command they invoke
against the real CLI parser.
"""
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
        pattern = re.compile(r"cli\.py\s+([a-z-]+)")
        for name in SEC_WORKFLOWS:
            for command in pattern.findall(workflow_text(name)):
                with self.subTest(workflow=name, command=command):
                    self.assertIn(command, self.commands,
                                  f"{name} calls `cli.py {command}`, which the CLI "
                                  f"does not define. Known: {sorted(self.commands)}")

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


if __name__ == "__main__":
    unittest.main()
