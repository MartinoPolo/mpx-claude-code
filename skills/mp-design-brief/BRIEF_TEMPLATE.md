# Design Brief Template

Structure for `designs/<component-name>/DESIGN_BRIEF_<COMPONENT_NAME>.md`. Every section is
mandatory unless marked optional.

```markdown
# <Component Name> — Design Brief

[One paragraph: what it does, why it matters to the user, what problem it solves.]

**Source**: [PRD #, issue #, or feature area]

---

## 1. Purpose

[Expanded purpose. What workflow does this enable? What is the user's mental model? What question
does this UI answer at a glance? Why does it deserve careful design?]

**Key value**: [one sentence — the elevator pitch for this component's existence]

---

## 2. Surrounding Context

The mockup **must** show the full viewport with all chrome at correct proportions.

### Full viewport structure

[Exhaustive description of every element visible alongside this component, top to bottom and left
to right, with real proportions in percentages or pixels. For each, say whether it is in FINAL
state — reproduce faithfully — or still being designed.]

**What the parent provides**: [nav, tab bar, panel border, resizer, layout shell]
**What this component fills**: [e.g. "content area below the active tab, full width × remaining height"]
**Excluded — belongs to the parent**: [e.g. tab bar, panel header, outer border]

**Mockup rendering instructions**:

- Full viewport at ~1440×900 proportions
- [Component area] is the focus; other areas show real content without design exploration
- [Specific proportion notes — the dominant region must read as dominant]

---

## 3. Requirements

### 3.1 [Subsection]

- What data is shown (field names, sources, types)
- What actions are available (click targets, keyboard shortcuts)
- What happens on interaction (navigation, state changes, API calls)
- Edge cases (empty, loading, error, overflow, truncation)

### 3.2 [Next subsection]

[Continue exhaustively.]

---

## 4. States

Every state this component can be in:

| State | Visual Treatment | Trigger |
| ------------------------- | ---------------- | ------- |
| Default | [description] | [when] |
| Loading | [description] | [when] |
| Empty | [description] | [when] |
| Error | [description] | [when] |
| Hover | [description] | [when] |
| Active/Focus | [description] | [when] |
| Disabled | [description] | [when] |
| [feature-specific states] | | |

---

## 5. Component Reuse Map

### Existing components (use these)

| Component | Variant/Props | Usage in this design |
| --------- | ----------------------------- | ---------------------- |
| Button | `variant="ghost"` size="icon" | Toolbar action buttons |
| Badge | `variant="success"` | Status indicators |

### Components to adopt

| Component | Source | Rationale |
| --------- | ------------------ | ------------------------------------------ |
| [name] | [library + ref id] | [why existing components don't cover this] |

### Components to design

| Component | Description | Why new |
| --------- | -------------- | --------------------------------- |
| [name] | [what it does] | [why no existing component works] |

---

## 6. Layout Constraints

- Minimum/maximum dimensions
- Grid/flex behaviour
- Responsive rules
- Spacing scale usage
- Typography hierarchy

---

## 7. Design Tokens

From `designs/tokens.css` (or the project's global stylesheet when no tokens file exists):

- Font families in play
- Specific tokens this component uses
- Color semantics: success/warning/danger/info
- Which accent colors appear and why

---

## 8. Design Constraints (non-negotiable)

- Layout rules that cannot change
- Component reuse requirements
- Accessibility requirements
- Consistency requirements with sibling components
- Technical constraints (e.g. "must work at 240px sidebar width")

---

## 9. Design Freedom

- Layout arrangement options
- Animation and transition choices
- Visual emphasis approaches
- Information hierarchy within the constraints
- Aesthetic latitude: shadows, borders, gradients

---

## 10. Visual References

- **Internal**: existing components this should feel consistent with, with file paths
- **External** (optional): inspiration links or descriptions

---

## 11. Not Included (scope exclusions)

- [Feature X — belongs to PRD #Y]
- [Interaction Z — future iteration]
```

## Writing rules

1. **Name components, not appearances.** "Use `Button variant='ghost'` size='icon'", never
   "a ghost-styled icon button". Use the real variant names read from the component source.
2. **Proportions are load-bearing.** A region that occupies 75% of the height must look like it.
3. **Human decisions outrank code.** A grilling session or issue comment saying "do X" overrides
   what the current implementation does.
4. **Enumerate every state.** A missing state is a state the designer invents inconsistently.
5. **Container context is mandatory.** Always name the parent, reproduce it faithfully, and keep
   the component from duplicating parent chrome.
6. **Reproduce settled elements exactly.** Anything already in final state gets copied, not
   reinvented.
7. **Explain WHY.** "Shows the worktree path because developers need to know which folder to cd
   into."
