---
name: mp-grill
description: 'Interviews the user relentlessly about a plan, design, or requirements until reaching shared understanding, updating project docs with decisions. Use when: "grill me", "grill requirements"'
argument-hint: "[topic, requirements text, or path to requirements file]"
allowed-tools: Read, Write, Edit, Glob, Grep, Agent
metadata:
  author: MartinoPolo
  version: "2.1"
  category: planning
---

# Grill

Interview the user relentlessly about every aspect of their plan, design, or requirements until reaching shared understanding. Walk down each branch of the decision tree, resolving dependencies one by one.
Avoid using AskUserQuestion tool, ask directly in the conversation.

## Step 1: Detect Project Docs

Check for `.mpx/` documentation (see `skills/shared/DOCUMENTATION_STRATEGY.md` for format details):

- `.mpx/CONTEXT.md` — project summary, domain language, feature index, constraints
- `.mpx/DECISIONS.md` — settled architectural and design decisions with rationale

If any exist, read them silently as grilling context. Reference their domain language and constraints during the session.
If none exist (or outside a repo), proceed as a pure conversational grill.

## Step 2: Resolve Input

- If `$ARGUMENTS` is inline text, use as the grilling subject.
- If `$ARGUMENTS` is a topic or plan description, use directly.
- If no arguments, ask the user what to grill.

## Step 3: Grill

Interview relentlessly. For each branch of the decision tree:

1. If a question can be answered by exploring the codebase, spawn an `Explore` agent with `model: "sonnet"` instead of asking.
2. **Batch related questions** into thematic groups. Present each group in one round.
3. **Only split into follow-up rounds** when answers to earlier questions would materially change later ones.
4. **Provide a recommended answer** with each question.

For requirements specifically, clarify each one:

- Ambiguity — vague terms, edge cases, error handling
- Acceptance criteria — what does "done" look like?
- Dependencies — blocks or blocked by other requirements?
- Scope — what's in, what's out?

Continue until every branch is resolved and shared understanding is reached.

## Step 4: Update Project Docs

After grilling concludes, check which docs exist and have relevant updates.
We're trying to keep these files concise and on point, so think twice before adding anything. It should be the most important context and decisions for the project.
If not sure if important enough, ask user.

**CONTEXT.md** — If new terms, features, or constraints emerged:

- § Domain Language: for each candidate term, show the full proposed entry (`**Term** — One-sentence definition.`) and ask the user whether to add it. Write only confirmed terms.
- § Core Features: update feature index (name + status + PRD#)
- § Key Constraints: add newly settled constraints
- § Flagged Ambiguities: record any resolved term conflicts

**DECISIONS.md** — If architectural or design decisions were settled:

- Add entries grouped by domain (Platform, UI, Data, Session)
- Each entry: `### Title` + `Decided: date` + `What:` + `Why:` + `Rejected:`
- Only add entries for settled decisions (open questions stay in the conversation until resolved).

## Report

Summarize the grilling session: key decisions made, requirements clarified, docs updated (if any), and open items remaining.
