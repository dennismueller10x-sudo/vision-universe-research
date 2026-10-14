/* Umgebung fuer git-Aufrufe in Test-Fixtures: nie das umgebende Repository.
   git wertet GIT_DIR, GIT_WORK_TREE und GIT_INDEX_FILE vor dem cwd aus. Wer
   Tests mit gesetztem GIT_DIR startet (Pruefagent, pre-commit-/pre-push-Hook),
   schriebe sonst aus einer Fixture in das echte .git: HEAD, Index, core.worktree
   und die lokale Identitaet. Deshalb werden ALLE GIT_*-Variablen entfernt und
   nur die unten genannten gesetzt. Die echte lokale und globale Konfiguration
   bleibt unberuehrt (GIT_CONFIG_GLOBAL/NOSYSTEM zeigen nur fuer das Kindprozess-
   Environment ins Leere). Die Fixture-Identitaet steht nur im Environment des
   Kindprozesses; sie schreibt nie `git config`. Wer eine Identitaet pruefen will,
   uebergibt die GIT_AUTHOR- und GIT_COMMITTER-Variablen ueber `extra`. */
export function isolatedGitEnv(extra = {}, base = process.env) {
  const env = {};
  for (const [k, v] of Object.entries(base)) if (!k.startsWith("GIT_")) env[k] = v;
  return {
    ...env,
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "Fixture", GIT_AUTHOR_EMAIL: "fixture@example.invalid",
    GIT_COMMITTER_NAME: "Fixture", GIT_COMMITTER_EMAIL: "fixture@example.invalid",
    GIT_TERMINAL_PROMPT: "0",
    ...extra,
  };
}
