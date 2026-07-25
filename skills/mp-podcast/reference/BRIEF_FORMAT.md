# Brief and Prompt Format

The two artifacts `mp-podcast` writes. Validated on a 33.5-minute Shadow DOM episode
(2026-07-24).

Division of labour: the **brief** is the only material NotebookLM has — it knows nothing else
about the topic or the listener. The **prompt** steers style, order and depth. A fact missing
from the brief cannot appear in the episode; a fact present in the brief will be narrated as
true.

---

## 1. `<slug>-resource.md` — the source brief

**Shape**

```markdown
# <Topic> Deep Dive — Podcast Resource (target <N> minutes)

## Part 1: <what it is and where it fits>
<3-6 dense paragraphs>

## Part 2: <the core API or mechanism>
...
## Part N: In Your Own Code
```

- 200-250 lines, 8-10 parts, ordered from primitive → API → edge cases → when to use it.
- Each part is prose paragraphs. Bullet lists read badly aloud.
- Write from the sources the research phase gathered. Name real APIs, options, defaults,
  version numbers and measured figures.

**Direct language.** No metaphors, analogies or figurative comparisons — they are what makes
generated podcasts feel empty. Say the mechanism:

> Mode closed: the shadowRoot property returns null. Only the code that called attachShadow
> holds the reference. Closed mode is not a security boundary — devtools and various tricks
> still reach it — it only signals intent.

**Spell syntax out for text-to-speech.** The hosts read this aloud, so punctuation-heavy syntax
becomes words:

| Written in the brief | Instead of |
| ---------------------------------------- | ----------------- |
| the colon host pseudo-class | `:host` |
| double-colon part | `::part` |
| element double-colon part open-paren label close-paren | `el::part(label)` |
| the class svelte dash hash | `.svelte-<hash>` |
| h1 through h6 | `h1`–`h6` |

Plain identifiers stay as they are: `attachShadow`, `ShadowRoot`, `adoptedStyleSheets`.

**Contrast against what he already uses.** A part that compares the topic to the tool he
reaches for daily is worth more than a part that defines it — for example shadow DOM's runtime
two-way encapsulation against Svelte's compile-time class scoping.

### The final part: `## Part N: In Your Own Code`

Built from the personalization sweep and nothing else. Per hit:

```markdown
In <repo>, `src/lib/x.ts:214` calls attachShadow with mode open to <purpose>. The surrounding
code re-queries the shadow root on every render, which is the outdated pattern — caching the
reference removes a lookup per frame and makes the slotchange handler idempotent.
```

- Every claim carries a real `file:line` the sweep returned.
- Personal-project snippets stay around 15 lines; work-repo material is described in prose.
- Sweep found nothing → delete this part and its prompt topic. A brief with no evidence
  produces an episode with no invented examples, which is the point.

---

## 2. `<slug>-prompt.txt` — the customize instruction

**Hard cap: 308 words / 2263 characters.** Count both before saving; trim a general topic
first, keeping the personalization topic.

Fixed skeleton, in this order:

1. **Format line** — `Generate a discussion-style podcast between two people about <topic>.`
2. **Listener context** — 1-2 sentences, derived from the vault learning-system and assessment
   notes: what he works with daily, what he already owns, what he has never used. This line is
   what makes the hosts skip the basics.
3. **Tone** — one sentence, e.g. `Technical and conversational. Two experienced developers
   going deep. Be specific and precise.`
4. **CRITICAL block** — verbatim:

   > CRITICAL: NO metaphors. NO analogies. NO figurative language. Use direct, literal,
   > technical terms. Name actual APIs and mechanisms — attachShadow, ShadowRoot, slots,
   > ElementInternals — not comparisons. Every minute must have substance. No filler, no
   > rhetorical questions, no restating.

   Swap the example API names for the current topic's.
5. **Numbered topics** — one line per brief part, mirroring its order, with key sub-topics in
   parentheses. The personalization part gets its own numbered line so the hosts reach it.
6. **Target duration** — the line from the length table in SKILL.md § Step 5.

**Worked example** (the validated Shadow DOM prompt, opening and one topic line):

```
Generate a discussion-style podcast between two people about Shadow DOM. The listener is a
senior frontend developer who works daily with Svelte and knows compile-time style scoping
well, but has never used shadow DOM directly and wants to understand it as a platform
primitive.

Tone: Technical and conversational. Two experienced developers going deep. Be specific and
precise.

CRITICAL: ...

Cover these topics in order, spending proportional time based on complexity:

1. What shadow DOM is: shadow host, shadow root, light DOM, encapsulation from document
   queries, user-agent shadow roots in built-in elements
...
8. Where it already appears in your own code: <repo> uses ..., <repo> does ...

Target duration: 15 minutes.
```

That listener-context sentence is exactly what Step 3 derives from the vault notes rather than
hardcoding.
