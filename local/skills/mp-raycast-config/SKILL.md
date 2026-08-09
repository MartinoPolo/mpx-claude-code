---
name: mp-raycast-config
description: "Decrypts a Raycast .rayconfig export, audits quicklinks for stale targets and orphaned aliases, adds or repairs entries under fixed naming rules, and rebuilds an importable config."
argument-hint: "<path to the .rayconfig export> [add <what> | audit | repair | rename]"
disable-model-invocation: true
allowed-tools: Bash, PowerShell, Read, Write, Edit, Glob, AskUserQuestion
metadata:
  author: MartinoPolo
  version: "0.2"
  category: utility
---

# Raycast config

Read and rewrite the Raycast quicklink set — including aliases and hotkeys, which no
other export route carries. $ARGUMENTS

Format spec, record schemas, import semantics and the naming rules:
[REFERENCE.md](REFERENCE.md). Read it before editing any config.

Scripts live in `${CLAUDE_SKILL_DIR}/scripts/`:

| Script | Purpose |
| --- | --- |
| `rayconfig.mjs` | `decode` / `encode` a `.rayconfig` |
| `audit.mjs` | Report stale targets, orphan aliases, duplicates |
| `passphrase.ps1` | Store and read the passphrase as a DPAPI secret |

## Process

1. Locate the export
2. Resolve the passphrase
3. Decode and audit
4. Agree the changes
5. Edit the payload
6. Rebuild and hand back for import
7. Confirm and clean up

### Step 1: Locate the export

When `$ARGUMENTS` carries a path to a `.rayconfig`, use it. Otherwise **ask the user where
the export is** with `AskUserQuestion` — never pick a file on their behalf. The rebuilt
file replaces the live quicklink set wholesale, so editing the wrong export silently
deletes whatever the right one contained.

Offer the newest `Raycast-*.rayconfig` found under the user's Desktop and Downloads as
options, each labelled with its modified time, so the usual case is one keystroke. Resolve
the home directory from the environment rather than writing it out. When nothing is found,
say so and ask for the path.

When the chosen export is older than the session's work, or the user has changed
quicklinks in the Raycast UI since, ask for a fresh one: **Raycast → Ctrl+, → Advanced →
Export Settings & Data**, passphrase of 8+ characters, saved to the Desktop.

### Step 2: Resolve the passphrase

Read the stored secret:

```bash
powershell -File "${CLAUDE_SKILL_DIR}/scripts/passphrase.ps1" -Action get
```

`MISSING` on stdout means nothing is stored yet. Ask the user for the passphrase and tell
them where their copy lives: **Raycast settings, search for "export passphrase"**. Then
store it so later runs are unattended:

```bash
powershell -File "${CLAUDE_SKILL_DIR}/scripts/passphrase.ps1" -Action set -Passphrase '<passphrase>'
```

The secret is DPAPI-protected under `%LOCALAPPDATA%\mp-raycast-config\`, readable only by
this user on this machine, and deliberately outside this repo, which is public.

A wrong passphrase surfaces as `unable to authenticate data` from Step 3 — say so plainly
and ask again rather than retrying variations.

### Step 3: Decode and audit

Decode into the session scratchpad. The payload contains clipboard history in clear text,
so it stays out of synced and version-controlled folders:

```bash
node "${CLAUDE_SKILL_DIR}/scripts/rayconfig.mjs" decode "<export>.rayconfig" "<scratchpad>/rayconfig-decoded.json" '<passphrase>'
node "${CLAUDE_SKILL_DIR}/scripts/audit.mjs" "<scratchpad>/rayconfig-decoded.json"
```

`audit.mjs` reports `dead-path`, `dead-vault`, `dead-script`, `duplicate-link`,
`duplicate-name`, `orphan-alias`, `disabled` and `missing-keyword`. These are advisory —
a duplicate link across two browser profiles is deliberate. Verify each finding against
the filesystem before proposing a deletion.

`invalid-id`, `duplicate-id` and `unpaired-openwith` are **not** advisory: each one makes
Raycast reject the entire quicklinks category at import. Never hand back a file that
reports them.

### Step 4: Agree the changes

Present the audit as a table and, alongside it, the entries to add. Give every proposed
entry its `name`, `alias` and `link` up front, and check them against the naming rules in
REFERENCE.md § Naming rules.

Use `AskUserQuestion` for choices that change the outcome: which stale entries to drop,
which alias wins the bare word in a family, which projects are in scope. Apply the
existing config's own conventions where they are already consistent — the user's muscle
memory outranks any scheme proposed here.

### Step 5: Edit the payload

Edit the decoded JSON with a Node script written to the scratchpad, never by hand — the
file runs to hundreds of thousands of lines. The script:

- **Deletes** by omitting the quicklink from `quicklinks.quicklinks`, and drops its
  matching `settings.commands[]` entry so no orphan alias is left behind
- **Renames or repoints** by editing a record in place, keeping its `id` so `openCount`
  and frecency survive
- **Adds** with a **real ULID** `id` (see REFERENCE.md § Ids — a merely ULID-shaped string
  is rejected at import), `openCount: 0`, `icon: "default"`, `rawContent: null`,
  `tags: []`, and ISO timestamps for `createdAt` / `updatedAt`
- **Sets an alias** by appending to `settings.commands[]` with exactly four fields:
  `id: "c:r:quicklinks::*::quicklink::=::<quicklink id>"`, `extensionId: "e:r:quicklinks"`,
  `enabled: true`, `alias`
- **Sets `openWith`** by copying an id from an existing quicklink that opens the same
  application, writing it to **both** `openWith` and `applicationId`, and mirroring it into
  `quicklinks.openWithPlatforms`

Every new record must carry the same key set as the existing records of its kind — Raycast
validates each one and rejects the whole category on the first failure. Diff the key sets
before rebuilding.

Re-run `audit.mjs` on the edited payload. It should report only findings the user
accepted.

### Step 6: Rebuild and hand back for import

```bash
node "${CLAUDE_SKILL_DIR}/scripts/rayconfig.mjs" encode "<scratchpad>/rayconfig-edited.json" "<output>.rayconfig" '<passphrase>'
```

Resolve `MPX_AI_GENERATED` with `env | grep '^MPX_'` — written as `$MPX_AI_GENERATED` it is
literal text, not a path, until it is looked up. Write the rebuilt file to a per-run folder
under `MPX_AI_GENERATED/_RAYCAST/`, and fail with the variable's name when that root is
unresolvable. Copy the original export alongside it as the rollback.

Then tell the user, in these words: **Raycast → Ctrl+, → Advanced → Import Settings &
Data → pick the rebuilt file → passphrase → tick Quicklinks and Settings only.**

State plainly that the import mirrors the file: anything dropped from it is deleted from
Raycast, and the original export next to it is the way back.

### Step 7: Confirm and clean up

Ask the user to confirm the import landed — spot-check two or three renamed entries and
one new alias. On confirmation, delete the decoded payloads from the scratchpad; they
hold clipboard history.

## Report

Close with what changed, as a table: entries added, renamed, repointed and deleted, with
each one's alias. Name the rebuilt file's path and the rollback export's path.
