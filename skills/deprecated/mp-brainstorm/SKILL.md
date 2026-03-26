---
name: mp-brainstorm
description: 'Design before implementation. Explores intent, requirements and approaches through collaborative dialogue. Use when: "brainstorm", "design a...", "how should we approach..."'
disable-model-invocation: true
allowed-tools: Read, Glob, Grep, Bash(git log *), Bash(git diff *), Bash(git status *), Write, AskUserQuestion
metadata:
  author: MartinoPolo
  version: "0.1"
  category: utility
---

# Brainstorm

Explore ideas and design solutions before implementation. $ARGUMENTS

## Examples

**User says:** "brainstorm how to add authentication"
**Actions:** Explore auth patterns (JWT vs session), review existing code, discuss trade-offs
**Result:** Design document with recommended approach, file structure, and implementation notes

**User says:** "how should we approach real-time notifications?"
**Actions:** Compare WebSocket vs SSE vs polling, assess infrastructure needs
**Result:** Architecture recommendation with pros/cons for each approach

## Process

### Step 1: Understand Context

- Check project state: files, docs, recent commits, tech stack
- Read relevant code in the area being discussed

### Step 2: Explore the Idea

- Ask questions **one at a time** to refine the idea
- Prefer multiple choice when possible
- Focus: purpose, constraints, success criteria, edge cases
- Use AskUserQuestion tool for each question

### Step 3: Propose Approaches

- Present 2-3 approaches with trade-offs
- Lead with recommended option and reasoning
- Apply YAGNI — remove unnecessary features from all designs

### Step 4: Present Design

- Break into sections of 200-300 words
- Ask after each section if it looks right
- Cover: architecture, components, data flow, error handling, testing
- Go back and clarify if something doesn't fit

### Step 5: Document

- Write validated design to `docs/plans/YYYY-MM-DD-<topic>-design.md`
- Commit the design document

### Step 6: Next Steps

- Ask: "Ready to implement?"
- If yes: proceed with implementation or `/mpx-parse-spec` for larger features

## Key Principles

- **One question at a time** — don't overwhelm
- **Multiple choice preferred** — easier to answer
- **YAGNI ruthlessly** — remove unnecessary features
- **Explore alternatives** — always 2-3 approaches before settling
- **Incremental validation** — present in sections, validate each
