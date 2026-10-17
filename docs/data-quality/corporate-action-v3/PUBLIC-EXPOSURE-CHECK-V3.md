# Public exposure check after the history rewrite (PR #758)

Date: 2026-10-17. Read-only check, no history rewrite, no rule change, no recomputation, no calibration.
Object: the removed plaintext file `docs/data-quality/corporate-action-v3/VENDOR-EVIDENCE-V3.json`
(blob `58a95e70ac7433f825cc522fdf505934d2b26c4f`, 1,116,380 bytes; sealed copies stay in
`scripts/quant/corporate-action-v3/sealed-vendor-evidence/`). Branch head at the time of the check: `f18a4d358`.

## Result

| Channel | Finding | Exposed |
|---|---|---|
| Branch tree and history (18 commits) | path absent in every commit, blob not reachable from the branch, PR diff without the file | no |
| Old commit hashes `5d116f9ca`, `bc4f0eb7d`, `fbbb39027`, `db4b27220`, `e14612ccb` | `raw.githubusercontent.com/<repo>/<old sha>/<path>` returns 200 with 1,116,380 bytes; the web blob view and `GET /git/blobs/58a95e70…` return 200; no branch or tag points to them (`git ls-remote`) | **yes, until GitHub purges the cached objects** |
| Old commit `8629c17b1` | never contained the file (raw 404) | no |
| PR #758 body, reviews, review comments | none mention or contain the file | no |
| PR #758 issue comments (vercel[bot], cloudflare-workers-and-pages[bot]) | updated to the new head `f18a4d3`, no file content, no old SHA | no |
| PR #758 timeline | 18 commit events with the new SHAs; one force-push event (`8629c17` → `f18a4d3`, both without the file) | no |
| Workflow artifacts, run 39007119068 (`universe-keys`, `sec-part-a..d`, `vendor`; expire 2026-10-19) | created before the evidence file existed; `vendor` holds 25 BLOCKED / NOT_ATTEMPTED lines without vendor data | no |
| Workflow artifacts, run 39019906367 (`merged-inputs`; expires 2026-10-22) | public SEC / FINRA / EDGAR inputs, created before the evidence file existed | no |
| Run 39031465706 (the only run that read the file, head `5d116f9ca`) | 0 artifacts; the job log prints only the path (`--vendor-evidence …/VENDOR-EVIDENCE-V3.json`), no content; the run page links to the old commit | content no, **locator yes** |
| Runs on the other old heads (39031465745, 39037544172, 39037544158, 39037555110, 39037555133, 39037659352, 39037659342) | all jobs skipped, no artifacts; the run pages link to the old commits | content no, **locator yes** |
| Cloudflare Pages previews of the old commits (`c859e2b4`, `fc556ce8`, `1c79d1e2`, `f01cc7b3`, `f12b0fe3`, branch alias) | `docs/` is not part of the deployment: the path, and every other repository file tested, returns the 18,228-byte HTML fallback page | no |
| Vercel deployments | the static output is a single `index.html` (`scripts/vu2/build-vercel-public.mjs`), functions bundle only `server/` and engine files | no |
| `HISTORY-REWRITE-V3.json` (this branch) | holds no content, only the path, the plaintext SHA-256 and the full old → new SHA map; the map is a locator for the cached old commits | content no, **locator yes** |
| Forks | 0 forks | no |

The old SHAs are discoverable without the rewrite note as well (Actions run pages, commit statuses), so removing the map
from `HISTORY-REWRITE-V3.json` would not close the exposure; and it is kept in the history of `f18a4d358` anyway.
Only purging the objects on GitHub closes it. No further rewrite was made.

## Steps that need GitHub Support (owner)

GitHub keeps dereferenced commits of a public repository readable by SHA until its own garbage collection; a repository
owner cannot remove them alone. The documented route is "Removing sensitive data from a repository":

1. Open a request at <https://support.github.com/contact> (category: remove sensitive data / cached views) as the
   repository owner of `dennismueller10x-sudo/vision-universe-research`.
2. Ask to (a) remove the cached views and dereferenced commits of PR #758 and (b) run garbage collection, naming:
   - the old commits `5d116f9caf7fa2def0d29a903d7f95c5376215a7`, `bc4f0eb7d8c4feea907245987a93beace216eb51`,
     `fbbb39027594f2b899b8ced6acc2583f2be5c016`, `db4b2722066d12d236c02059ac9f87e4040eed11`,
     `e14612ccbe04f624246b1d6a45e4afbd5807f321`;
   - the blob `58a95e70ac7433f825cc522fdf505934d2b26c4f` and the path
     `docs/data-quality/corporate-action-v3/VENDOR-EVIDENCE-V3.json`;
   - the pull request `#758` and the confirmation that the branch has already been rewritten (new head `f18a4d358`)
     and that no fork exists.
3. After the confirmation, re-check: the raw URL and `GET /git/blobs/58a95e70…` must return 404.

Optional and owner-only, not done here: deleting the workflow runs listed above removes their links to the old SHAs
(irreversible; run 39031465706 is the evidence run of the readiness verdict, so its deletion loses the public log of the
final run). Expired artifacts disappear on their own (2026-10-19 and 2026-10-22); none of them holds the file.

## Freeze

After this note, PR #758 is frozen: Draft, verdict NOT_READY, no merge, no further rule change, no calibration,
no further history rewrite without the owner's consent.
