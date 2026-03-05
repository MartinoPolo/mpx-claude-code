---
name: mp-review-design
description: 'Visual inspection of websites to identify and fix design issues. Triggers on: "review design", "check the UI", "fix layout", "find design problems", "test responsive"'
compatibility: Requires chrome-devtools MCP server
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, Grep, AskUserQuestion, Task
metadata:
  author: MartinoPolo
  version: "0.1"
  category: code-review
---

# Web Design Reviewer

Visual inspection workflow using chrome-devtools MCP to identify and fix design issues.

Use `mp-chrome-devtools-tester` as the dedicated DevTools agent for browser operations. Do not call DevTools MCP tools directly from this skill.

Chrome DevTools MCP allowed only through `mp-chrome-devtools-tester`.

## Prerequisites

1. Website running (localhost or remote)
2. chrome-devtools MCP available
3. Access to source code (for fixes)

## Workflow

```
1. Information Gathering → 2. Visual Inspection → 3. Issue Fixing → 4. Verification
                                    ↑__________________________|
```

## Step 1: Information Gathering

### Get URL

If not provided, ask:

> "What URL should I review? (e.g., http://localhost:3000)"

### Detect Project

Check for:

- `package.json` → Framework (React, Vue, Next.js)
- `tailwind.config.*` → Tailwind CSS
- `*.module.css` → CSS Modules
- `styled.*` in code → styled-components

## Step 2: Visual Inspection

### Viewport Testing

Test at 4 breakpoints using `mcp__chrome-devtools__resize_page`:

| Viewport | Width | Height |
| -------- | ----- | ------ |
| Mobile   | 375   | 812    |
| Tablet   | 768   | 1024   |
| Desktop  | 1280  | 800    |
| Wide     | 1920  | 1080   |

### For Each Viewport:

1. **Resize**: `mcp__chrome-devtools__resize_page`
2. **Screenshot**: `mcp__chrome-devtools__take_screenshot`
3. **Snapshot**: `mcp__chrome-devtools__take_snapshot` (DOM structure)
4. **Analyze** for issues

### Issue Categories

#### P1 - Critical (Fix Immediately)

- Element overflow causing horizontal scroll
- Element overlap blocking content
- Content completely hidden
- Buttons/links unusable

#### P2 - Important (Fix Next)

- Alignment inconsistencies
- Spacing irregularities
- Text clipping/truncation
- Contrast issues (< 4.5:1)

#### P3 - Minor (Fix If Time)

- Slight positioning differences
- Minor spacing variations
- Non-critical visual polish

### Visual Checklist

**Layout:**

- [ ] No horizontal scrollbar
- [ ] Content fits viewport
- [ ] Elements don't overlap unintentionally
- [ ] Grid/flex alignment correct

**Typography:**

- [ ] Text readable size (min 16px body)
- [ ] Line height appropriate (1.5-1.8)
- [ ] No text clipping
- [ ] Long words wrap properly

**Responsive:**

- [ ] Mobile: Touch targets 44x44px+
- [ ] Tablet: Layout optimized
- [ ] Desktop: Max-width set
- [ ] Smooth breakpoint transitions

**Accessibility:**

- [ ] Contrast ratio 4.5:1+
- [ ] Focus states visible
- [ ] Images have alt text

## Step 3: Issue Fixing

### Identify Source File

1. Get selector from screenshot/snapshot
2. Search codebase:
   ```
   Glob: src/**/*.{css,scss,tsx,jsx,vue}
   Grep: ".selector-name"
   ```

### Apply Minimal Fix

**Principle:** Smallest change that resolves the issue.

**Common fixes:**

```css
/* Overflow */
.container {
  max-width: 100%;
  overflow-x: hidden;
}

/* Flex item overflow */
.flex-item {
  min-width: 0;
}

/* Grid item overflow */
.grid-item {
  min-width: 0;
  word-wrap: break-word;
}

/* Text clipping */
.text {
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Contrast */
.text {
  color: #374151;
} /* Increase from light gray */
```

## Step 4: Verification

1. Wait for HMR or refresh
2. Re-screenshot fixed viewport
3. Compare before/after
4. Check for regressions in other viewports

**Iteration limit:** If 3+ attempts fail, consult user.

## Output Format

```markdown
# Design Review: [URL]

## Summary

| Item             | Value        |
| ---------------- | ------------ |
| Framework        | Next.js      |
| Styling          | Tailwind CSS |
| Viewports Tested | 4            |
| Issues Found     | 3            |
| Issues Fixed     | 2            |

## Issues

### [P1] Horizontal overflow on mobile

- **Page**: /dashboard
- **Element**: `.data-table`
- **Issue**: Table exceeds viewport width
- **Fix**: Added `overflow-x: auto` to table container
- **File**: `src/components/DataTable.tsx:45`

### [P2] Low contrast text

- **Element**: `.description`
- **Issue**: Gray text (#9ca3af) on white fails WCAG AA
- **Fix**: Changed to #6b7280 (4.8:1 ratio)
- **File**: `src/styles/globals.css:120`

## Unfixed Issues

### [P3] Minor alignment at 1920px

- **Reason**: Would require significant refactor
- **Recommendation**: Consider for next sprint

## Recommendations

- Add `max-width: 100%` to all images globally
- Consider container queries for card component
```

## Troubleshooting

| Problem                     | Solution                                                       |
| --------------------------- | -------------------------------------------------------------- |
| Screenshots are blank/empty | Verify chrome-devtools MCP is connected and a page is open     |
| "Tool not found" errors     | Run `ToolSearch` for `chrome-devtools` to load MCP tools first |
| Page not loading            | Check URL is accessible, try navigating manually first         |
| HMR not reflecting changes  | Hard refresh or re-navigate to the URL after code edits        |

## Chrome DevTools MCP Tools

| Task         | Tool                                    |
| ------------ | --------------------------------------- |
| Navigate     | `mcp__chrome-devtools__navigate_page`   |
| Resize       | `mcp__chrome-devtools__resize_page`     |
| Screenshot   | `mcp__chrome-devtools__take_screenshot` |
| DOM snapshot | `mcp__chrome-devtools__take_snapshot`   |
| Run JS       | `mcp__chrome-devtools__evaluate_script` |

### Useful Scripts

```javascript
// Detect overflow elements
document.querySelectorAll("*").forEach((el) => {
  if (el.scrollWidth > el.clientWidth) console.log("Overflow:", el);
});

// Outline all elements
document.querySelectorAll("*").forEach((el) => {
  el.style.outline = "1px solid red";
});
```

## Best Practices

**DO:**

- Screenshot before any fix
- Fix one issue at a time
- Verify each fix before moving on
- Follow existing code patterns

**DON'T:**

- Large refactors without confirmation
- Fix multiple issues at once
- Ignore design system/brand guidelines
- Skip regression testing
