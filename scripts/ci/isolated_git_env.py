"""Umgebung fuer git-Aufrufe in Test-Fixtures: nie das umgebende Repository.

Spiegel von isolated-git-env.mjs. Alle GIT_*-Variablen des Aufrufers werden
entfernt (GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE ... gewinnen sonst gegen cwd).
"""
import os


def isolated_git_env(extra=None, base=None):
    base = os.environ if base is None else base
    env = {k: v for k, v in base.items() if not k.startswith("GIT_")}
    env.update({
        "GIT_CONFIG_GLOBAL": "/dev/null",
        "GIT_CONFIG_NOSYSTEM": "1",
        "GIT_AUTHOR_NAME": "Fixture", "GIT_AUTHOR_EMAIL": "fixture@example.invalid",
        "GIT_COMMITTER_NAME": "Fixture", "GIT_COMMITTER_EMAIL": "fixture@example.invalid",
        "GIT_TERMINAL_PROMPT": "0",
    })
    env.update(extra or {})
    return env
