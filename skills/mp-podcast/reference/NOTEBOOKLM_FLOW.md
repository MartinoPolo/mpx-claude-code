# NotebookLM Backend Flow

The generation path, validated end to end on 2026-07-24 (Shadow DOM, 33.5 min, zero manual
browser steps) with `notebooklm-py` 0.7.3.

Full CLI surface — every command, flag and JSON schema — lives in
[`../../notebooklm/SKILL.md`](../../notebooklm/SKILL.md). This file covers only the podcast
path and the quirks the test run exposed.

Pass `-n <notebook_id>` (or `--notebook`) on every command. Relying on the CLI's implicit
context breaks the moment two agents run at once.

## The sequence

```bash
# 1. Notebook — capture the id
notebooklm create "Podcast: <Topic>" --json      # → .notebook.id

# 2. Brief as a source — capture the id
notebooklm source add <slug>-resource.md --notebook <nb> --json   # → .source.id

# 3. Indexing must finish before generation
notebooklm source wait <source_id> -n <nb> --timeout 600

# 4. Optional: let NotebookLM add its own web research (fast mode, ~30s-2min)
notebooklm source add-research "<topic> <specific angle>" --notebook <nb> --mode fast

# 5. Kick off audio — capture the task id
notebooklm generate audio --prompt-file <slug>-prompt.txt \
  --format deep-dive --length <short|default|long> \
  --notebook <nb> --retry 3 --json                # → .task_id

# 6. Download once complete
notebooklm download audio ./<slug>-raw.mp3 -a <task_id> -n <nb>
```

Step 5 returns immediately with `status: pending`. Audio takes 10-20 minutes.

## Waiting without blocking

Hand the wait to a background `general-purpose` sub-agent with `model: "sonnet"` — it declares
no model of its own ([`../../shared/SUBAGENT_PROTOCOL.md`](../../shared/SUBAGENT_PROTOCOL.md)
§ 3). Give it the notebook id, the task id, the output path, and this instruction:

> Run `notebooklm artifact wait <task_id> -n <nb> --timeout 1200`. Exit code 2, or stderr
> saying `Timeout after Ns`, means still rendering — re-check with
> `notebooklm artifact list -n <nb> --json`, and when that artifact's `status` is `pending` or
> `in_progress`, wait again. Treat it as failed only when `artifact list` reports an error
> status or the artifact has vanished. Once `status` is `completed`, run
> `notebooklm download audio <path> -a <task_id> -n <nb>` and report the file path and size.

## Quirks the test run exposed

| Quirk | What to do |
| ------------------------------------------------------ | ------------------------------------------------ |
| `artifact wait` exits 1 with `Timeout after Ns` while the artifact is still pending | Confirm with `artifact list --json` and wait again — a timeout is a status report, not a failure |
| `download audio` rejects `--yes` (no such flag) | Call it without the flag |
| Partial UUIDs go ambiguous once a few notebooks exist | Pass full UUIDs everywhere in automation |
| `--length` is a hint | `long` plus a 15-minute prompt line produced 33.5 minutes; overshoot is fine |
| `notebooklm status` reports notebook context, not auth | Verify auth only with `auth check --test --json` |

## Failure handling

| Symptom | Cause | Action |
| ------------------------------------------- | ---------------------- | ----------------------------------------------------------- |
| `auth check --test` gives `token_fetch: false` | Google rotated the session cookies | `notebooklm auth refresh`; still failing → ask the user for one interactive `notebooklm login`, then re-check |
| `No result found for RPC ID` | Rate limiting | Wait 5-10 minutes, retry once |
| `GENERATION_FAILED` | Google-side rate limit | `--retry 3` already backs off; on repeat failure switch backends |
| Third generation of the day refused | Free tier allows 3 audio overviews per day | Offer [`GEMINI_TTS.md`](GEMINI_TTS.md) now, or tomorrow's quota |
| `notebooklm` not found on PATH | Shell predates the install | Use `$LOCALAPPDATA\Python\pythoncore-3.14-64\Scripts\notebooklm.exe` |
| Download fails right after generation | Artifact incomplete | Check `artifact list --json` before retrying |

Every one of these gets reported to the user as a plain sentence naming the cause and the
concrete next command — including which backend to switch to.

## Post-processing

```bash
ffmpeg -i <slug>-raw.mp3 -codec:a libmp3lame -b:a 64k -ac 1 "$MPX_ONEDRIVE/Podcasts/<slug>.mp3"
```

NotebookLM ships a high-bitrate stereo file; a 33-minute episode measured 62 MB and came out at
about 15 MB after this re-encode. Two voices in a dialogue carry fine at 64 kbps mono.

Delete the raw download once the re-encode verifies, unless it is within 20% of the original
size — then the re-encode bought nothing and the original stays.
