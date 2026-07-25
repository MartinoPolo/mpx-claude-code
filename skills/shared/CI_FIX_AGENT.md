# CI Fix Agent

Instructions for a sub-agent that fixes a failing CI run on a PR branch. The caller passes: PR number, branch, failing run id (discover it if omitted), and optionally local verify commands. The caller NEVER reads CI logs — your bounded JSON return is the only channel back.

You may spawn sub-agents: `mp-executor`, `mp-checker`, `mp-git-committer`.

## Attempt Loop (max 3 attempts)

### 1. Fetch failure details yourself

```bash
gh run list --branch <branch> --limit 1 --json databaseId,conclusion --jq '.[0]'   # if run id not given
gh run view <run_id> --log-failed
```

### 2. Diagnose root cause

Extract file:line, error message, failing test/job name. Classify:

- **Lint/format/type/build error** → concrete code fix.
- **Test failure** → decide whether implementation or test is wrong relative to acceptance criteria. Never weaken a correct test to make it pass. A test that only fails intermittently is **flaky** — harden it (focus/settle guards, generous `waitFor` timeouts); a green rerun of a flaky test is not a fix.
- **Infrastructure/environment flake** (runner setup, network, quota) → `gh run rerun <run_id> --failed`, then skip to step 5's watch.
- **Environment difference vs local** (OS, headless browser, missing secret, build flag) → fix code/config if possible; a missing secret or infra outage is unfixable → return `"blocked"` immediately with the root cause.

### 3. Apply fix

- Small, clearly-scoped fix → apply directly with Edit.
- Larger or multi-file fix → spawn `mp-executor` with pre-analyzed instructions: per failure, file path, root cause, exact change to apply. Never vague "fix the CI".

### 4. Verify locally

If the caller passed local verify commands, spawn `mp-checker` with the ones relevant to the fix. Fix regressions before pushing.

### 5. Commit, push, re-watch

1. Spawn `mp-git-committer`: push: true, commit_hint: "fix: CI failure — <summary>".
2. Watch: `gh pr checks <pr_number> --watch`
3. **All green** → return `"clean"`. **Still failing** → next attempt (max 3 total).

## Return Contract (STRICT)

After success or exhausting 3 attempts, return ONLY this JSON — no logs, no prose outside it:

```json
{
  "status": "clean" | "issues_remaining" | "blocked",
  "iterations_used": 1,
  "files_changed": ["src/foo.ts"],
  "summary": "≤10 lines: root causes found, fixes applied, commits pushed",
  "blockers": [],
  "unresolved_findings": []
}
```

- `"clean"` — CI fully green; fixes (if any) committed and pushed.
- `"blocked"` — 3 attempts exhausted or failure unfixable from the repo (missing secret, infra outage). Each `blockers` entry: check/job name + root cause in ≤2 lines.
- `"issues_remaining"` — CI green but secondary out-of-scope issues surfaced; list them in `unresolved_findings` as `{"summary", "reason", "description"}`.
