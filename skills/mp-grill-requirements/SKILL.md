---
name: mp-grill-requirements
description: Grill user on raw requirements, then create structured requirements in REQUIREMENTS.md. Use when "add requirements", "grill requirements", "parse raw requirements".
argument-hint: "[requirements text or path to RAW_REQUIREMENTS.md]"
disable-model-invocation: true
allowed-tools: Read, Write, Edit, AskUserQuestion, Glob, Grep
category: project-management
---

Grill the user on raw requirements, clarify each one, then produce structured requirements in `.mpx/REQUIREMENTS.md`.

## Input Resolution

1. If `$ARGUMENTS` is a file path, read it.
2. If `$ARGUMENTS` is inline text, use directly.
3. If no arguments, look for `.mpx/RAW_REQUIREMENTS.md` in the project root. If not found, ask the user for requirements.

## Process

Parse raw requirements into individual items, then for EACH requirement:

1. **Clarify ambiguity** — ask about vague terms, edge cases, error handling.
2. **Define acceptance criteria** — what does "done" look like?
3. **Ask about dependencies** — does this depend on or block other requirements?
4. **Confirm scope** — what's in, what's out?

Rules for grilling:
- Ask ONE question at a time per requirement.
- Provide a recommended answer with each question.
- If a question can be answered by exploring the codebase, explore the codebase instead of asking.
- Never skip the grilling step — every requirement must be clarified.

## Output

After grilling all requirements, write to `.mpx/REQUIREMENTS.md`:

- If `.mpx/` doesn't exist, create it.
- Append to existing REQUIREMENTS.md — never overwrite existing content.
- Group requirements by functional area.
- Each requirement gets: clear title, description, acceptance criteria.
- No checkboxes (GitHub issues track completion).

If input came from `.mpx/RAW_REQUIREMENTS.md`, remove grilled items from that file after writing structured output.

## Report

Summarize what was added: count of requirements, functional areas touched, any items deferred or needing follow-up.
