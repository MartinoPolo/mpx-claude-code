---
name: mp-grill
description: 'Interview the user relentlessly about a plan, design, or requirements until reaching shared understanding. Auto-detects project docs and updates them with decisions. Use when: "grill me", "stress-test plan", "grill requirements", "add requirements"'
argument-hint: "[topic, requirements text, or path to requirements file]"
allowed-tools: Read, Write, Edit, Glob, Grep, Agent
metadata:
  author: MartinoPolo
  version: "1.1"
  category: planning
---

# Grill

Interview the user relentlessly about every aspect of their plan, design, or requirements until reaching shared understanding. Walk down each branch of the decision tree, resolving dependencies one by one.

## Step 1: Detect Project Docs

Check for `.mpx/` documentation:

- `.mpx/REQUIREMENTS.md`
- `.mpx/VOCABULARY.md`
- `.mpx/ARCHITECTURE.md`

If any exist, read them silently as grilling context. Reference their vocabulary and constraints during the session.

If none exist (or outside a repo), proceed as a pure conversational grill.

## Step 2: Resolve Input

- If `$ARGUMENTS` is a file path, read it as the grilling subject.
- If `$ARGUMENTS` is inline text, use as the grilling subject.
- If `$ARGUMENTS` is a topic or plan description, use directly.
- If no arguments, ask the user what to grill.

## Step 3: Grill

Interview relentlessly. For each branch of the decision tree:

1. **Batch related questions** into thematic groups. Present each group in one round.
2. **Only split into follow-up rounds** when answers to earlier questions would materially change later ones.
3. **Provide a recommended answer** with each question.
4. If a question can be answered by exploring the codebase, spawn an `Explore` agent with `model: "sonnet"` instead of asking.

For requirements specifically, clarify each one:

- Ambiguity — vague terms, edge cases, error handling
- Acceptance criteria — what does "done" look like?
- Dependencies — blocks or blocked by other requirements?
- Scope — what's in, what's out?

Continue until every branch is resolved and shared understanding is reached.

## Step 4: Update Project Docs

After grilling concludes, check which docs exist and have relevant updates:

**REQUIREMENTS.md** — If new or clarified requirements emerged:
- Append to existing content, grouped by functional area
- Each requirement: clear title, description, acceptance criteria

**VOCABULARY.md** — If new domain terms crystallized or existing definitions sharpened:
- Present new/updated terms to user before writing
- Only update after user confirms

**ARCHITECTURE.md** — If architectural decisions were made:
- Update relevant sections with decisions and rationale

Skip any doc that doesn't exist or has nothing new to add. Ask before writing: "Should I update [doc] with [summary of changes]?"

## Report

Summarize the grilling session: key decisions made, requirements clarified, docs updated (if any), and open items remaining.
