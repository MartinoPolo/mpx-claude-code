---
name: mp-yoursafe-overview
description: 'Re-read every Yoursafe/Verotel onboarding resource (wiki mirror, Obsidian notes, Slack summary, local repos, onboarding scripts) plus fresh live snapshots of the local Docker stack and the dev.app remote box, then regenerate the self-contained HTML onboarding reference. Use when: "update yoursafe overview", "refresh onboarding doc", "regenerate yoursafe reference", "rebuild the yoursafe onboarding page"'
argument-hint: "[optional: 'skip-live' to reuse the existing local + dev.app snapshots]"
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Agent, AskUserQuestion, SendUserFile
metadata:
  author: MartinoPolo
  version: "0.1"
  category: utility
---

# Yoursafe Onboarding Overview

Regenerate the Windows dev-environment onboarding reference at
`C:\_MP_work\Yoursafe\Yoursafe-Onboarding-Overview.html` from the current state of every source.

Full resource inventory, the HTML design contract, and capture-output interpretation live in
[REFERENCE.md](REFERENCE.md). Read it before editing so the document's look and structure are preserved.

## Step 1: Load the design contract

Read [REFERENCE.md](REFERENCE.md) and the current
`C:\_MP_work\Yoursafe\Yoursafe-Onboarding-Overview.html`. The regenerated page MUST keep:
colour-coded callout classes (`explain`/`tip`/`warn`/`hint`/`naming`/`live`), shell badges
(`b-gitbash`/`b-ps`/`b-cmd`/`b-develbox`/`b-remote`/`b-file`), the sidebar TOC, `file://` links, the
naming/dedup table, the local-vs-remote table, and the Linux system-info cheat-sheet. Passwords appear
as **hints only, never real secrets** (see REFERENCE.md § Password policy). If the target file is missing,
recreate it from scratch (`Write`) following the design contract; otherwise update it in place (Step 5).

## Step 2: Re-read static resources (parallel Sonnet sub-agents)

Spawn `general-purpose` sub-agents with `model: sonnet`, one per group, each returning a structured
markdown report of changes vs. what the current HTML says. Groups (paths in REFERENCE.md):

1. **Wiki** — every `.md` in `C:\_MP_work\Yoursafe\wiki\`; note commands, URLs, renaming clues.
2. **Obsidian + Slack** — `...\ObsidianMP\Yoursafe\*.md` and `C:\_MP_work\Yoursafe\team-e-private-summary*.txt`; extract password HINTS, admin facts, project/network renaming.
3. **Repos** — READMEs / `package.json` scripts / `Makefile` targets for `yoursafe-components`, `verotel`, `safe-elements`, `safe-elements-api`, `flowguard-proxy` under `C:\_MP_work\`; note dev/test/deploy commands and staging/prod URLs.
4. **Onboarding scripts** — `C:\_MP_work\netsafe-setup\` and `C:\_MP_work\netsafe-ca\` (quote `apply-nrpt.ps1`, `import-ca.ps1`, handoffs) and `C:\_MP_work\verotel\util\bin\devel-services-win.py`.

## Step 3: Re-mine recent Claude sessions for NEW setup steps (optional)

If setup work continued since the last generation, spawn `general-purpose` sub-agents (`model: sonnet`) to scan session transcripts in
`~/.claude\projects\C--Users-snapy--claude\`, `~/.claude*\projects\C---MP-work-verotel\`, and
`...\C---MP-work-yoursafe-components\` (both `.claude` and `.claude-work`). Grep first for setup keywords
(`openvpn|knock|nrpt|gerrit|docker login|devel-services|entrypoint|safe.directory|mkcert|hosts`), read only
matched regions, and report any new commands/files/gotchas not already in the HTML.

## Step 4: Capture live snapshots

Unless `$ARGUMENTS` contains `skip-live`, refresh both snapshot blocks:

```bash
bash "${CLAUDE_SKILL_DIR}/scripts/capture-local.sh"        # local Docker + Windows RAM (always works)
bash "${CLAUDE_SKILL_DIR}/scripts/capture-remote.sh"       # dev.app.netsafe.cz (needs gate2 VPN up)
```

`capture-remote.sh` exits `2` with `UNREACHABLE` if the VPN is down or the key isn't authorized. In that
case, keep the existing remote block and note it wasn't refreshed. Never embed passwords; the remote
script uses Windows OpenSSH so the work key in the ssh-agent is reused (no password prompt).

## Step 5: Merge into the HTML

Apply **targeted `Edit`s**, do not rewrite the file wholesale:

- Update the two `<div class="box live">` blocks with fresh capture output + one-line commentary.
- Update the local-vs-remote table with new CPU/RAM/container counts.
- Fold any changed commands, URLs, or renaming facts into the matching chapter.
- Bump the "Compiled" / footer dates to the capture date. Convert relative dates to absolute.
- If a sub-agent reports a genuinely new setup topic, add a chapter following the existing pattern
  (blue explainer box first, then shell-labelled commands) and add its TOC entry.

If any source conflicts with the current doc, present the conflict via `AskUserQuestion` before overwriting.

## Step 6: Validate & report

- Confirm the file still opens (well-formed HTML; every `<section id>` has a matching TOC `<a href="#id">`).
- Report the absolute saved path; when interactive, also deliver it with `SendUserFile` (`display: render`). Do not use Artifact/rendered-link tools — the user works from the persistent local file.
- Report: which sources changed, whether the remote snapshot refreshed, chapters added/edited, and any
  conflicts resolved or credentials found in sources that should be rotated.
