---
name: mp-architecture-review
description: "Reviews codebase architecture and opens a refactor issue with the findings."
disable-model-invocation: true
allowed-tools: Read, Glob, Grep, Bash(gh *), AskUserQuestion, Agent
metadata:
  author: MartinoPolo
  version: "0.7"
  category: planning
---

# Architecture Review

Explore a codebase like an AI would, surface architectural friction, discover opportunities for improving testability, and propose module-deepening refactors as GitHub issue RFCs.

A **deep module** (John Ousterhout, "A Philosophy of Software Design") has a small interface hiding a large implementation. Deep modules are more testable, more AI-navigable, and let you test at the boundary instead of inside.

Before starting:

1. Read `${CLAUDE_SKILL_DIR}/../shared/deep-modules.md` now — deep vs shallow module evaluation.
2. Read `${CLAUDE_SKILL_DIR}/../shared/interface-design.md` now — interface design rules for testability.
3. Read `${CLAUDE_SKILL_DIR}/REFERENCE.md` now — dependency categories and the issue template.

## Process

### 1. Explore the codebase

Spawn `Explore` sub-agent (breadth: very thorough) to navigate the codebase naturally. Explore the codebase organically, noting where you experience friction, rather than following rigid heuristics:

- Where does understanding one concept require bouncing between many small files?
- Where are modules so shallow that the interface is nearly as complex as the implementation?
- Where have pure functions been extracted just for testability, but the real bugs hide in how they're called?
- Where do tightly-coupled modules create integration risk in the seams between them?
- Which parts of the codebase are untested, or hard to test?

The friction you encounter IS the signal.

### 2. Present candidates

Present a numbered list of deepening opportunities. For each candidate, show:

- **Cluster**: Which modules/concepts are involved
- **Why they're coupled**: Shared types, call patterns, co-ownership of a concept
- **Dependency category**: See `${CLAUDE_SKILL_DIR}/REFERENCE.md` for the four categories
- **Test impact**: What existing tests would be replaced by boundary tests

Ask the user which candidate to explore next — interfaces come later, in Step 5: "Which of these would you like to explore?"

### 3. User picks a candidate

### 4. Frame the problem space

Before spawning sub-agents, write a user-facing explanation of the problem space for the chosen candidate:

- The constraints any new interface would need to satisfy
- The dependencies it would need to rely on
- A rough illustrative code sketch to make the constraints concrete — this is not a proposal, just a way to ground the constraints

Show this to the user, then immediately proceed to Step 5. The user reads and thinks about the problem while the sub-agents work in parallel.

### 5. Design multiple interfaces

Spawn 3+ `general-purpose` sub-agents in parallel with `model: "opus"`. Each must produce a **radically different** interface for the deepened module. Tell each to reason through the trade-offs before committing to a shape.

Prompt each sub-agent with a separate technical brief (file paths, coupling details, dependency category, what's being hidden). This brief is independent of the user-facing explanation in Step 4. Give each agent a different design constraint:

- Agent 1: "Minimize the interface — aim for 1-3 entry points max"
- Agent 2: "Maximize flexibility — support many use cases and extension"
- Agent 3: "Optimize for the most common caller — make the default case trivial"
- Agent 4 (if applicable): "Design around the ports & adapters pattern for cross-boundary dependencies"

Each sub-agent outputs:

1. Interface signature (types, methods, params)
2. Usage example showing how callers use it
3. What complexity it hides internally
4. Dependency strategy (how deps are handled — see `${CLAUDE_SKILL_DIR}/REFERENCE.md`)
5. Trade-offs

Present designs sequentially, then compare them in prose.

After comparing, give your own recommendation: which design you think is strongest and why. If elements from different designs would combine well, propose a hybrid. Be opinionated — the user wants a strong read, not just a menu.

### 6. User picks an interface (or accepts recommendation)

### 7. Create GitHub issue

Create a refactor RFC as a GitHub issue. Use the template in `${CLAUDE_SKILL_DIR}/REFERENCE.md`. Create the issue immediately and share the URL — skip a review step first.

```bash
gh issue create --title "refactor: [module description]" --label "refactor" --body "$(cat <<'EOF'
[Use issue template from REFERENCE.md]
EOF
)"
```

Print the issue URL.
