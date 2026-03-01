## Phase Splitting Algorithm

Shared across all paths. Runs after phase generation or during restructure.

### When to Split

| Uncompleted tasks | Action                                                                |
| ----------------- | --------------------------------------------------------------------- |
| ≤6                | No split                                                              |
| 7–10              | Split unless all tasks under single section heading (tightly coupled) |
| >10               | Always split                                                          |

### How to Split

1. **Count** uncompleted `- [ ]` tasks per CHECKLIST.md
2. **Group** tasks by `### section headings` — keep sections together as atomic units
3. **Target** 3–6 uncompleted tasks per new phase
4. **Name** new phases from section heading semantics (e.g., `### Auth Routes` → `NN-auth-routes`)
5. **Preserve** all `- [x]` completed states in-place — never move or uncheck completed tasks
6. **Renumber** all subsequent phase directories sequentially
7. **Update ROADMAP.md:**
   - Replace the split phase entry with multiple new entries
   - Fix all dependency references to renumbered phases
   - Set status: all tasks done → Complete, mixed → In Progress, none done → Not Started
   - Keep completed phases to one-line records only
   - Remove redundant completed-phase mentions from roadmap details unless needed to explain unblocked dependencies for incomplete/blocked phases

### Splitting Rules

- **Section boundaries are atomic.** Never split tasks within a `### section`. Move entire sections together.
- **Completed tasks stay.** If a section has a mix of `- [x]` and `- [ ]`, the entire section moves to the new phase (preserving checkmarks).
- **Header content duplicates.** Each new phase CHECKLIST.md gets the same Objective/Scope header from the original, with an updated scope note.
- **Dependencies inherit.** New phases created from a split share the original phase's dependencies. Later splits depend on earlier splits from the same original.

### Example

**Before (Phase 03 has 11 uncompleted tasks):**

```
.mpx/phases/
├── 01-foundation/
├── 02-database/
├── 03-features/        ← 11 uncompleted tasks
│   └── CHECKLIST.md
├── 04-polish/
```

CHECKLIST.md sections:

```
### Auth System          (4 tasks — 0 done)
### User Profiles        (4 tasks — 0 done)
### Notifications        (3 tasks — 0 done)
```

**After split:**

```
.mpx/phases/
├── 01-foundation/
├── 02-database/
├── 03-auth-system/      ← 4 tasks (from Auth System section)
│   └── CHECKLIST.md
├── 04-user-profiles/    ← 4 tasks (from User Profiles section)
│   └── CHECKLIST.md
├── 05-notifications/    ← 3 tasks (from Notifications section)
│   └── CHECKLIST.md
├── 06-polish/           ← renumbered from 04
```

ROADMAP.md changes:

```
Before:
- [ ] Phase 3: Features (depends on: Phase 2)
- [ ] Phase 4: Polish (depends on: Phase 3)

After:
- [ ] Phase 3: Auth System (depends on: Phase 2)
- [ ] Phase 4: User Profiles (depends on: Phase 3)
- [ ] Phase 5: Notifications (depends on: Phase 3)
- [ ] Phase 6: Polish (depends on: Phase 4, Phase 5)
```

### Partially Completed Phase Split

If splitting a phase that has some completed tasks:

```
### Auth System          (4 tasks — 4 done ✓)
### User Profiles        (4 tasks — 2 done)
### Notifications        (3 tasks — 0 done)
```

Result:

- Auth System phase → status: **Complete** (all 4 done)
- User Profiles phase → status: **In Progress** (2/4 done)
- Notifications phase → status: **Not Started** (0/3 done)
