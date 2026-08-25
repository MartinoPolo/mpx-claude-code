---
name: notebooklm
description: "Full programmatic API for Google NotebookLM: create notebooks, add sources, generate every artifact type, and download in multiple formats."
disable-model-invocation: true
metadata:
  author: MartinoPolo
  version: "0.7.4"
  category: productivity
---
<!-- notebooklm-py v0.7.3 -->
# NotebookLM Automation

Complete programmatic access to Google NotebookLM—including capabilities not exposed in the web UI. Create notebooks, add sources (URLs, YouTube, PDFs, audio, video, images), chat with content, generate all artifact types, and download results in multiple formats.

## Installation

**From PyPI (Recommended for AI agents — Python-version-aware):**
```bash
pip install "notebooklm-py[browser]"   # mandatory; errors must propagate

# [cookies] (rookiepy) is optional and known to FAIL TO BUILD on Python 3.13+.
# Skip it deliberately on 3.13+ rather than swallowing the error — that lets
# *real* install failures (typos, network, PyPI outages) surface for the agent.
if python -c "import sys; sys.exit(0 if sys.version_info < (3, 13) else 1)"; then
    pip install "notebooklm-py[cookies]"   # errors propagate
else
    echo "Skipping [cookies] on Python 3.13+ (rookiepy unavailable). Use 'notebooklm login' interactively."
fi
```

> Full install matrix (extras, headless servers, contributor flow): [Installation guide on GitHub](https://github.com/teng-lin/notebooklm-py/blob/main/docs/installation.md).

**From GitHub (use latest release tag, NOT main branch):**
```bash
# Get the latest release tag (using curl)
LATEST_TAG=$(curl -s https://api.github.com/repos/teng-lin/notebooklm-py/releases/latest | grep '"tag_name"' | cut -d'"' -f4)
# Includes [browser] so the interactive `notebooklm login` flow works.
pip install "notebooklm-py[browser] @ git+https://github.com/teng-lin/notebooklm-py@${LATEST_TAG}"
```

⚠️ **DO NOT install from main branch** (`pip install git+https://github.com/teng-lin/notebooklm-py`). The main branch may contain unreleased/unstable changes. Always use PyPI or a specific release tag, unless you are testing unreleased features.

**Skill install methods:**

- `notebooklm skill install` installs this skill into the supported local agent directories managed by the CLI.
- `npx skills add teng-lin/notebooklm-py` installs this skill from the GitHub repository into compatible agent skill directories.
- If you are already reading this file inside an agent skill directory, the skill is already installed. You only need the Python package and authentication below.

**CLI-managed install:**
```bash
notebooklm skill install
```

## Prerequisites

**IMPORTANT:** Before using any command, you MUST authenticate:

```bash
notebooklm login          # Opens browser for Google OAuth
notebooklm list           # Verify authentication works
```

If commands fail with authentication errors, re-run `notebooklm login`.

### CI/CD, Multiple Accounts, and Parallel Agents

For automated environments, multiple accounts, or parallel agent workflows:

| Variable | Purpose |
|----------|---------|
| `NOTEBOOKLM_HOME` | Custom config directory (default: `~/.notebooklm`) |
| `NOTEBOOKLM_PROFILE` | Active profile name (default: `default`) |
| `NOTEBOOKLM_AUTH_JSON` | Inline auth JSON - no file writes needed |

**CI/CD setup:** Set `NOTEBOOKLM_AUTH_JSON` from a secret containing your `storage_state.json` contents.

**Multiple accounts:** Use named profiles (`notebooklm profile create work`, then `notebooklm -p work login`). Alternatively, use different `NOTEBOOKLM_HOME` directories per account.

**Parallel agents:** The CLI stores notebook context per profile (`~/.notebooklm/profiles/<profile>/context.json`, with a legacy fallback to `~/.notebooklm/context.json` for the implicit default profile). Multiple concurrent agents that share a profile and use `notebooklm use` can overwrite each other's context — use one of the isolation strategies below.

**Solutions for parallel workflows:**
1. **Always use explicit notebook ID** (recommended): Pass `-n <notebook_id>` (for `wait`/`download` commands) or `--notebook <notebook_id>` (for others) instead of relying on `use`
2. **Per-agent isolation via profiles:** `export NOTEBOOKLM_PROFILE=agent-$ID` (each profile gets its own context file)
3. **Per-agent isolation via home:** Set unique `NOTEBOOKLM_HOME` per agent: `export NOTEBOOKLM_HOME=/tmp/agent-$ID`
4. **Use full UUIDs:** Avoid partial IDs in automation (they can become ambiguous)

## Agent Setup Verification

Before starting workflows, verify auth is in place. **Use `--test --json` (not bare `--json`)** — bare `--json` only proves the cookie file parses; `--test` makes a network call and proves the cookies still authenticate against Google.

1. `notebooklm auth check --test --json` → require BOTH `"status": "ok"` AND `"checks.token_fetch": true`. Bare `"status": "ok"` (without `--test`) is a false-positive trap — a stale cookie file passes the parse check.
2. `notebooklm list --json` → expect valid JSON (may be empty for new accounts).
3. **If auth fails or is missing → run `notebooklm login` first.** This is the primary auth path: opens a browser, the user signs in to Google once, and the resulting `storage_state.json` is reused on every subsequent run. Works on any environment with a display.
   - For headless contexts where opening a browser is not feasible, use `notebooklm login --browser-cookies <browser>` instead — extracts the user's already-logged-in cookies from Chrome/Firefox/etc. (requires the `[cookies]` extra; rookiepy may not install on Python 3.13+). Use `chrome::<profile-name-or-directory>` to target one Chromium user-profile, or `firefox::<container-name>` / `firefox::none` to target one Firefox container.
   - To survey signed-in Google accounts before picking one: `notebooklm auth inspect --browser <browser>` (read-only; pass `-v` to see which Chromium user-profile each account came from, or `--json` for tooling). Scoped forms such as `notebooklm auth inspect --browser 'chrome::Profile 1'` inspect only that browser profile.
   - Re-run step 1 after login to confirm.
4. **If auth was working but cookies went stale** (Google rotated SIDTS, or you signed in fresh in the browser) **→ refresh the active profile in place instead of full re-login:**
   - `notebooklm auth refresh` — server-side SIDTS refresh against the existing `storage_state.json`. Cheap and silent; safe to run on a schedule (cron / launchd / systemd) at 15–20 min cadence to keep an unattended profile warm.
   - `notebooklm auth refresh --browser-cookies <browser>` — re-extract cookies from a running browser and match them back to the profile's recorded email in `context.json`. Use when the on-disk `storage_state.json` is too stale for the server-side refresh path but you've just signed back into Google in the browser. For Chromium-family browsers with multiple user-profiles (Chrome's `Default`, `Profile 1`, …), refresh fans out across all profiles to find the email — same path as `auth inspect` (issue #571). Use `chrome::<profile-name-or-directory>` when you already know the exact browser profile.
   - Both forms preserve the same `--profile` (no new profile is created).

> **Note:** `notebooklm status` reports *context state* (selected notebook); do not use it to verify auth.

## When This Skill Activates

**Explicit:** User says "/notebooklm", "use notebooklm", or mentions the tool by name

**Intent detection:** Recognize requests like:
- "Create a podcast about [topic]"
- "Summarize these URLs/documents"
- "Generate a quiz from my research"
- "Turn this into an audio overview"
- "Create flashcards for studying"
- "Generate a video explainer"
- "Make an infographic"
- "Create a mind map of the concepts"
- "Download the quiz as markdown"
- "Add these sources to NotebookLM"

## Autonomy Rules

**Run automatically (no confirmation):**
- `notebooklm status` - check context
- `notebooklm auth check` - diagnose auth issues
- `notebooklm auth inspect` - list Google accounts visible to a browser (read-only)
- `notebooklm auth refresh` - server-side SIDTS refresh of the active profile (no new profile, no destructive writes)
- `notebooklm auth refresh --browser-cookies <browser>` - re-extract cookies from a browser into the active profile (rebuilds `storage_state.json` for the same `--profile`, not a new one)
- `notebooklm list` - list notebooks
- `notebooklm source list` - list sources
- `notebooklm artifact list` - list artifacts
- `notebooklm language list` - list supported languages
- `notebooklm language get` - get current language
- `notebooklm language set` - set language (global setting)
- `notebooklm artifact wait` - wait for artifact completion (in subagent context)
- `notebooklm source wait` - wait for source processing (in subagent context)
- `notebooklm research status` - check research status
- `notebooklm research wait` - wait for research (in subagent context)
- `notebooklm use <id>` - set context (⚠️ SINGLE-AGENT ONLY - use `-n` flag in parallel workflows)
- `notebooklm create` - create notebook
- `notebooklm ask "..."` - chat queries (without `--save-as-note`)
- `notebooklm history` - display conversation history (read-only)
- `notebooklm source add` - add sources
- `notebooklm profile list` - list profiles
- `notebooklm profile create` - create profile
- `notebooklm profile switch` - switch active profile
- `notebooklm doctor` - check environment health

**Ask before running:**
- `notebooklm delete` / `source delete` / `note delete` / `share remove` / `profile delete` - destructive. Once approved, pass `--yes`/`-y` to skip the confirmation prompt (uniform across every destructive command). On the commands that also expose `--json` (e.g. `delete`, `source delete`, `note delete`, `share remove`), `--json` implies `--yes` so non-interactive callers never hang on the prompt; `profile delete` has no `--json`, so pass `--yes` explicitly there.
- `notebooklm generate *` - long-running, may fail
- `notebooklm download *` - writes to filesystem
- `notebooklm artifact wait` - long-running (when in main conversation)
- `notebooklm source wait` - long-running (when in main conversation)
- `notebooklm research wait` - long-running (when in main conversation)
- `notebooklm ask "..." --save-as-note` - writes a note
- `notebooklm history --save` - writes a note


## Branch router

Use live `notebooklm --help` or `notebooklm <group> --help` for ordinary command lookup, then load only the reference required by the request:

- [COMMANDS.md](COMMANDS.md) — non-obvious command constraints, machine-readable output, and schemas.
- [ARTIFACTS.md](ARTIFACTS.md) — generation types, download formats, prompts, and language behavior.
- [WORKFLOWS.md](WORKFLOWS.md) — podcast, document, bulk-import, and deep-research sequences.
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) — failures, exit codes, long prompts, timing, and limitations.

## Common execution contract

State each operation briefly. Use `--json` when consuming output programmatically, retain every returned notebook/source/artifact ID, and verify the response contains the expected object before advancing. Start long generation and return its artifact ID in the main conversation; wait only in a subagent or when the user explicitly approves waiting. On failure, offer retry, skip, or investigation and leave every requested operation either completed with an observable ID/output or explicitly reported as unresolved.
