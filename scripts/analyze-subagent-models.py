"""Forensic analysis of Claude Code session transcripts.

Answers: which model did each spawned subagent ACTUALLY run on?

Two independent evidence sources:
  A) main-session `toolUseResult.resolvedModel` -- recorded by the harness at spawn time
  B) sidechain `message.model` on assistant entries in subagents/agent-<id>.jsonl

Usage:  python3 analyze_subagent_models.py [projects_root]
"""

import json
import os
import sys
import glob
import re
from collections import Counter, defaultdict

PROJECTS_ROOT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.expanduser("~"), ".claude", "projects")
# Write the report next to the caller, not into the repo — argv[2] overrides.
OUT_DIR = sys.argv[2] if len(sys.argv) > 2 else os.getcwd()

SONNET_REQUEST_RE = re.compile(r"\bsonnet\b", re.IGNORECASE)
HAIKU_REQUEST_RE = re.compile(r"\bhaiku\b", re.IGNORECASE)
OPUS_REQUEST_RE = re.compile(r"\bopus\b", re.IGNORECASE)


def model_family(model_id):
    """Normalize a raw model id into a family bucket."""
    if not model_id:
        return "<none>"
    m = model_id.lower()
    for fam in ("opus", "sonnet", "haiku", "fable"):
        if fam in m:
            return fam
    return model_id


def iter_json_lines(path):
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as fh:
            for lineno, raw in enumerate(fh, 1):
                raw = raw.strip()
                if not raw:
                    continue
                try:
                    yield lineno, json.loads(raw)
                except Exception:
                    continue
    except OSError:
        return


def content_blocks(entry):
    msg = entry.get("message")
    if not isinstance(msg, dict):
        return []
    c = msg.get("content")
    return c if isinstance(c, list) else []


# ---------------------------------------------------------------- pass 1: subagent transcripts
def scan_subagent_files(root):
    """agentId -> observed models in that sidechain."""
    agents = {}
    files = glob.glob(os.path.join(root, "*", "*", "subagents", "*.jsonl"))
    for path in files:
        session_id = os.path.basename(os.path.dirname(os.path.dirname(path)))
        project = os.path.basename(os.path.dirname(os.path.dirname(os.path.dirname(path))))
        agent_id = None
        models = Counter()
        versions = Counter()
        attribution = Counter()
        n_asst = 0
        n_lines = 0
        ts_first = ts_last = None
        sidechain_flags = Counter()
        for _lineno, o in iter_json_lines(path):
            n_lines += 1
            agent_id = agent_id or o.get("agentId")
            sidechain_flags[o.get("isSidechain")] += 1
            if o.get("version"):
                versions[o["version"]] += 1
            if o.get("attributionAgent"):
                attribution[o["attributionAgent"]] += 1
            ts = o.get("timestamp")
            if ts:
                ts_first = ts_first or ts
                ts_last = ts
            if o.get("type") == "assistant":
                mdl = (o.get("message") or {}).get("model")
                if mdl:
                    models[mdl] += 1
                    n_asst += 1
        if not agent_id:
            agent_id = os.path.basename(path).replace("agent-", "").replace(".jsonl", "")
        agents[agent_id] = {
            "path": path,
            "project": project,
            "session_id": session_id,
            "models": models,
            "n_assistant_turns": n_asst,
            "n_lines": n_lines,
            "versions": versions,
            "attribution_agent": attribution,
            "ts_first": ts_first,
            "ts_last": ts_last,
            "sidechain_flags": sidechain_flags,
        }
    return agents, len(files)


# ---------------------------------------------------------------- pass 2: main sessions
def scan_main_sessions(root):
    spawns = []
    sessions = []
    inline_sidechain_files = 0
    session_files = sorted(glob.glob(os.path.join(root, "*", "*.jsonl")))
    for path in session_files:
        project = os.path.basename(os.path.dirname(path))
        session_id = os.path.basename(path).replace(".jsonl", "")
        pending = {}       # tool_use_id -> spawn dict
        current_skill = None
        current_skill_line = None
        has_inline_sidechain = False
        n_lines = 0
        ts_first = ts_last = None
        versions = Counter()
        main_models = Counter()
        for lineno, o in iter_json_lines(path):
            n_lines += 1
            if o.get("isSidechain") is True:
                has_inline_sidechain = True
            ts = o.get("timestamp")
            if ts:
                ts_first = ts_first or ts
                ts_last = ts
            if o.get("version"):
                versions[o["version"]] += 1
            if o.get("type") == "assistant" and not o.get("isSidechain"):
                mdl = (o.get("message") or {}).get("model")
                if mdl:
                    main_models[mdl] += 1

            for b in content_blocks(o):
                if b.get("type") != "tool_use":
                    continue
                name = b.get("name")
                inp = b.get("input") if isinstance(b.get("input"), dict) else {}
                if name == "Skill":
                    current_skill = inp.get("skill") or inp.get("name")
                    current_skill_line = lineno
                elif name in ("Task", "Agent"):
                    prompt = inp.get("prompt") or ""
                    pending[b.get("id")] = {
                        "project": project,
                        "session_id": session_id,
                        "session_path": path,
                        "spawn_line": lineno,
                        "timestamp": o.get("timestamp"),
                        "version": o.get("version"),
                        "tool_name": name,
                        "subagent_type": inp.get("subagent_type") or "<unset>",
                        "requested_model": inp.get("model"),
                        "description": inp.get("description"),
                        "prompt_len": len(prompt),
                        "prompt_mentions_sonnet": bool(SONNET_REQUEST_RE.search(prompt)),
                        "prompt_mentions_haiku": bool(HAIKU_REQUEST_RE.search(prompt)),
                        "prompt_mentions_opus": bool(OPUS_REQUEST_RE.search(prompt)),
                        "under_skill": current_skill,
                        "skill_line": current_skill_line,
                        "resolved_model": None,
                        "agent_id": None,
                        "result_line": None,
                    }

            # tool_result -> attach resolvedModel / agentId
            tr = o.get("toolUseResult")
            if isinstance(tr, dict):
                tuid = None
                for b in content_blocks(o):
                    if b.get("type") == "tool_result":
                        tuid = b.get("tool_use_id")
                        break
                rec = pending.get(tuid) if tuid else None
                if rec is None and tr.get("agentId"):
                    # fall back: match by agentId not yet assigned, newest spawn
                    for r in reversed(list(pending.values())):
                        if r["agent_id"] is None:
                            rec = r
                            break
                if rec is not None and (tr.get("agentId") or tr.get("resolvedModel")):
                    rec["agent_id"] = tr.get("agentId")
                    rec["resolved_model"] = tr.get("resolvedModel")
                    rec["result_line"] = lineno

        spawns.extend(pending.values())
        if has_inline_sidechain:
            inline_sidechain_files += 1
        sessions.append({
            "project": project, "session_id": session_id, "n_lines": n_lines,
            "ts_first": ts_first, "ts_last": ts_last,
            "versions": versions, "main_models": main_models,
        })
    return spawns, sessions, inline_sidechain_files, len(session_files)


def fmt_table(headers, rows):
    out = ["| " + " | ".join(headers) + " |",
           "|" + "|".join(["---"] * len(headers)) + "|"]
    for r in rows:
        out.append("| " + " | ".join(str(x) for x in r) + " |")
    return "\n".join(out)


def main():
    agents, n_agent_files = scan_subagent_files(PROJECTS_ROOT)
    spawns, sessions, inline_files, n_session_files = scan_main_sessions(PROJECTS_ROOT)

    # join
    for s in spawns:
        a = agents.get(s["agent_id"]) if s["agent_id"] else None
        s["sidechain_found"] = a is not None
        s["sidechain_models"] = a["models"] if a else Counter()
        s["sidechain_turns"] = a["n_assistant_turns"] if a else 0
        s["sidechain_path"] = a["path"] if a else None

    matched_agent_ids = {s["agent_id"] for s in spawns if s["agent_id"]}
    orphan_agents = [k for k in agents if k not in matched_agent_ids]

    L = []
    P = L.append

    all_ts = [s["ts_first"] for s in sessions if s["ts_first"]] + \
             [s["ts_last"] for s in sessions if s["ts_last"]]
    P("# Subagent model attribution — forensic report\n")
    P("## 0. Scale\n")
    P(fmt_table(["metric", "value"], [
        ["project dirs", len(glob.glob(os.path.join(PROJECTS_ROOT, "*/")))],
        ["main session .jsonl files", n_session_files],
        ["subagent .jsonl files (sidechains on disk)", n_agent_files],
        ["Task/Agent spawns found in main sessions", len(spawns)],
        ["spawns with resolvedModel recorded", sum(1 for s in spawns if s["resolved_model"])],
        ["spawns joined to a sidechain transcript", sum(1 for s in spawns if s["sidechain_found"])],
        ["sidechain files with no matching spawn (orphans)", len(orphan_agents)],
        ["main session files containing inline isSidechain:true", inline_files],
        ["date range", (min(all_ts)[:10] + " .. " + max(all_ts)[:10]) if all_ts else "n/a"],
    ]))

    # ---- agreement between the two evidence sources
    agree = disagree = 0
    disagreements = []
    for s in spawns:
        if not s["resolved_model"] or not s["sidechain_models"]:
            continue
        obs = set(model_family(m) for m in s["sidechain_models"])
        exp = model_family(s["resolved_model"])
        if obs == {exp}:
            agree += 1
        else:
            disagree += 1
            disagreements.append(s)
    P("\n## 0b. Evidence-source cross-check (resolvedModel vs sidechain message.model)\n")
    P(fmt_table(["result", "n"], [["agree", agree], ["disagree", disagree]]))
    for s in disagreements[:15]:
        P(f"- DISAGREE: session `{s['session_id']}` line {s['spawn_line']} "
          f"type={s['subagent_type']} resolved={s['resolved_model']} "
          f"observed={dict(s['sidechain_models'])}")

    # ---- (a) overall crosstab
    P("\n## a. Subagent spawns: subagent_type x resolved model\n")
    ct = defaultdict(Counter)
    for s in spawns:
        ct[s["subagent_type"]][s["resolved_model"] or "<unrecorded>"] += 1
    models_seen = sorted({m for c in ct.values() for m in c})
    rows = []
    for t in sorted(ct, key=lambda x: -sum(ct[x].values())):
        rows.append([t, sum(ct[t].values())] + [ct[t].get(m, "") for m in models_seen])
    rows.append(["**TOTAL**", len(spawns)] +
                [sum(ct[t].get(m, 0) for t in ct) for m in models_seen])
    P(fmt_table(["subagent_type", "n"] + models_seen, rows))

    # ---- (b) Explore
    P("\n## b. Explore agent — model actually used\n")
    ex = [s for s in spawns if s["subagent_type"] == "Explore"]
    exc = Counter(s["resolved_model"] or "<unrecorded>" for s in ex)
    P(fmt_table(["resolved model", "n", "%"],
                [[m, n, f"{100*n/max(1,len(ex)):.1f}%"] for m, n in exc.most_common()]))
    P(f"\nTotal Explore spawns: **{len(ex)}**")
    exsc = Counter()
    for s in ex:
        for m, n in s["sidechain_models"].items():
            exsc[m] += n
    P("\nIndependent confirmation from Explore sidechain transcripts (`message.model` per assistant turn):\n")
    P(fmt_table(["model", "assistant turns"], exsc.most_common()))
    P("\nSample evidence (first 12 Explore spawns):\n")
    P(fmt_table(["session", "spawn line", "description", "requested model", "resolvedModel", "sidechain models"],
                [[s["session_id"][:8], s["spawn_line"], (s["description"] or "")[:38],
                  s["requested_model"] or "-", s["resolved_model"] or "-",
                  ",".join(sorted(set(model_family(m) for m in s["sidechain_models"]))) or "-"]
                 for s in ex[:12]]))

    # ---- (c) per-skill attribution
    P("\n## c. Per-skill attribution (skill -> subagent_type -> model)\n")
    sk = defaultdict(Counter)
    for s in spawns:
        sk[s["under_skill"] or "<no skill / direct>"][
            (s["subagent_type"], model_family(s["resolved_model"]))] += 1
    rows = []
    for skill in sorted(sk, key=lambda x: -sum(sk[x].values())):
        for (t, m), n in sorted(sk[skill].items(), key=lambda x: -x[1]):
            rows.append([skill, t, m, n])
    P(fmt_table(["skill", "subagent_type", "model family", "n"], rows))

    P("\n### c2. Skill -> model family totals\n")
    sk2 = defaultdict(Counter)
    for s in spawns:
        sk2[s["under_skill"] or "<no skill / direct>"][model_family(s["resolved_model"])] += 1
    fams = sorted({f for c in sk2.values() for f in c})
    rows = [[k, sum(sk2[k].values())] + [sk2[k].get(f, "") for f in fams]
            for k in sorted(sk2, key=lambda x: -sum(sk2[x].values()))]
    P(fmt_table(["skill", "n"] + fams, rows))

    # ---- (d) obedience
    P("\n## d. Obedience check\n")
    P("### d1. Explicit `model:` parameter in the Task/Agent input\n")
    ob = Counter()
    mismatch = []
    for s in spawns:
        rm = s["requested_model"]
        if not rm:
            continue
        got = model_family(s["resolved_model"])
        want = model_family(rm)
        if want == got:
            ob[f"{want} requested -> {got} OK"] += 1
        else:
            ob[f"{want} requested -> {got} MISMATCH"] += 1
            mismatch.append(s)
    P(fmt_table(["outcome", "n"], ob.most_common()) if ob else "_no spawns carried an explicit `model` param_")
    P(f"\nSpawns with explicit model param: **{sum(1 for s in spawns if s['requested_model'])}** "
      f"/ {len(spawns)}")
    if mismatch:
        P("\nMismatch evidence:\n")
        P(fmt_table(["session", "spawn line", "result line", "subagent_type", "requested", "resolved", "sidechain observed"],
                    [[m["session_id"], m["spawn_line"], m["result_line"], m["subagent_type"],
                      m["requested_model"], m["resolved_model"],
                      ",".join(sorted(set(model_family(x) for x in m["sidechain_models"]))) or "-"]
                     for m in mismatch[:40]]))
    else:
        P("\n**Zero mismatches.** Every explicit `model` parameter was honoured.")

    P("\n### d2. Prompt text mentions 'sonnet' but no explicit model param\n")
    soft = [s for s in spawns if not s["requested_model"] and s["prompt_mentions_sonnet"]]
    sc = Counter(model_family(s["resolved_model"]) for s in soft)
    P(fmt_table(["resolved model family", "n"], sc.most_common()) if soft else "_none_")
    if soft:
        P("\nEvidence (up to 20):\n")
        P(fmt_table(["session", "spawn line", "skill", "subagent_type", "resolved"],
                    [[s["session_id"][:8], s["spawn_line"], s["under_skill"] or "-",
                      s["subagent_type"], s["resolved_model"]] for s in soft[:20]]))

    # ---- (e) timeline
    P("\n## e. Timeline — model family by month\n")
    tl = defaultdict(Counter)
    for s in spawns:
        month = (s["timestamp"] or "unknown")[:7]
        tl[month][model_family(s["resolved_model"])] += 1
    fams = sorted({f for c in tl.values() for f in c})
    rows = [[m, sum(tl[m].values())] + [tl[m].get(f, "") for f in fams] for m in sorted(tl)]
    P(fmt_table(["month", "n"] + fams, rows))

    P("\n### e2. Explore spawns by month\n")
    tle = defaultdict(Counter)
    for s in ex:
        tle[(s["timestamp"] or "unknown")[:7]][s["resolved_model"] or "<unrecorded>"] += 1
    fams = sorted({f for c in tle.values() for f in c})
    rows = [[m, sum(tle[m].values())] + [tle[m].get(f, "") for f in fams] for m in sorted(tle)]
    P(fmt_table(["month", "n"] + fams, rows))

    P("\n### e3. Claude Code version vs Explore model\n")
    tv = defaultdict(Counter)
    for s in ex:
        tv[s["version"] or "?"][s["resolved_model"] or "<unrecorded>"] += 1
    fams = sorted({f for c in tv.values() for f in c})
    rows = [[v, sum(tv[v].values())] + [tv[v].get(f, "") for f in fams]
            for v in sorted(tv, key=lambda x: [int(p) for p in x.split(".")] if x.replace(".", "").isdigit() else [0])]
    P(fmt_table(["cc version", "n"] + fams, rows))

    # ---- raw model ids seen
    P("\n## f. Raw model identifiers observed\n")
    rc = Counter(s["resolved_model"] or "<unrecorded>" for s in spawns)
    P(fmt_table(["resolvedModel (spawn record)", "n"], rc.most_common()))
    sm = Counter()
    for a in agents.values():
        for m, n in a["models"].items():
            sm[m] += n
    P("\n")
    P(fmt_table(["message.model in sidechain transcripts", "assistant turns"], sm.most_common()))

    report = "\n".join(L)
    outp = os.path.join(OUT_DIR, "report.md")
    with open(outp, "w", encoding="utf-8") as fh:
        fh.write(report)
    print(report)
    print("\n\n[written to]", outp)


if __name__ == "__main__":
    main()
