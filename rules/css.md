---
paths:
  - "**/*.css"
  - "**/*.scss"
  - "**/*.pcss"
---

# CSS & Styling

- Follow the 60-30-10 color distribution: 60% of the UI surface should use neutral or cool background tones (white, light gray, light blue), 30% for secondary UI elements like cards and sidebars, and only 10% for accent colors used on CTAs and interactive highlights.
- Background colors must be neutral or cool-toned: white, off-white (#f9fafb), light grays (#f3f4f6, #e5e7eb), or subtle cool blues. Never use red, orange, yellow, purple, magenta, or pink as background colors for any surface area.
- All text must meet WCAG AA contrast requirements (minimum 4.5:1 ratio). Use dark text on light backgrounds (#1f2937, #111827, #374151) and light text on dark backgrounds (#f9fafb, #e5e7eb). Never use yellow or pink as text colors because they have poor readability at any size.
- Reserve hot colors (red, orange, yellow, amber) exclusively for semantic purposes: error states, validation messages, warnings, destructive action buttons, and required field indicators. Never use them for decorative elements, regular buttons, or large UI areas.
- Keep gradient color shifts minimal and within the same color family (e.g., #E6F2FF to #F5F7FA). Prefer linear gradients over radial for background surfaces. Never combine warm and cool colors in a single gradient.
