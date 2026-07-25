#!/usr/bin/env node
/**
 * mp-tutorial-create compiler.
 * Usage: node compile.js <source.md> [--out <dir>] [--no-index]
 *
 * Compiles a compact `<slug>.source.md` (see reference/SOURCE_FORMAT.md) into a
 * self-contained interactive HTML tutorial using TEMPLATE.html, then regenerates
 * the OneDrive tutorials index. Zero runtime dependencies in the output.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { parse as parseYaml } from "yaml";
import { createHighlighter, bundledLanguages } from "shiki";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = join(SCRIPT_DIR, "..", "TEMPLATE.html");
const TUTORIALS_ROOT = process.env.TUTORIALS_ROOT || "C:/Users/snapy/OneDrive/tutorials";
const SHIKI_THEME = "one-dark-pro";

/* ---------------- helpers ---------------- */

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fail(message) {
  console.error(`[compile] ERROR: ${message}`);
  process.exit(1);
}

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

/* ---------------- inline markup ---------------- */

/**
 * Renders inline markup: `code`, **bold**, [text](url), ((glossary term)).
 * Escapes HTML first; code spans are protected from further processing.
 */
function renderInline(text) {
  let html = escapeHtml(text);
  const codeSpans = [];
  html = html.replace(/`([^`]+)`/g, (_, code) => {
    codeSpans.push(`<code>${code}</code>`);
    return `\x00${codeSpans.length - 1}\x00`;
  });
  // glossary: ((display|key)) or ((key))
  html = html.replace(/\(\(([^)|]+)(?:\|([^)]+))?\)\)/g, (_, a, b) => {
    const display = a.trim();
    const key = (b || a).trim();
    return `<span class="gloss" tabindex="0" data-term="${escapeHtml(key)}">${display}</span>`;
  });
  // links: [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) => {
    if (url.startsWith("file://")) {
      return `<a class="inline-file-link" href="${url}" target="_blank" rel="noopener noreferrer"><span aria-hidden="true">\u{1F4C1}</span>${label}</a>`;
    }
    return `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  });
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\x00(\d+)\x00/g, (_, i) => codeSpans[Number(i)]);
  return html;
}

/* ---------------- source parsing ---------------- */

function parseSource(raw) {
  const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!fmMatch) fail("missing YAML frontmatter");
  const meta = parseYaml(fmMatch[1]);
  for (const field of ["title", "type", "category", "slug", "date"]) {
    if (!meta[field]) fail(`frontmatter missing required field: ${field}`);
  }
  if (!["topic", "code-showcase"].includes(meta.type)) fail(`type must be topic|code-showcase, got: ${meta.type}`);
  const body = raw.slice(fmMatch[0].length);
  const lines = body.split(/\r?\n/);

  const sections = [];
  let quiz = null;
  let current = null;
  let i = 0;

  const pushParagraph = (buffer) => {
    const text = buffer.join(" ").trim();
    if (text && current) current.blocks.push({ kind: "p", text });
    buffer.length = 0;
  };

  let para = [];
  while (i < lines.length) {
    const line = lines[i];

    const heading = line.match(/^# +([a-z0-9-]+) *\| *(.+)$/);
    if (heading) {
      pushParagraph(para);
      current = { slug: heading[1], title: heading[2].trim(), blocks: [] };
      sections.push(current);
      i++;
      continue;
    }

    const fence = line.match(/^```(\w+)?(?: +(.+))?$/);
    if (fence && current) {
      pushParagraph(para);
      const { block, next } = parseCodeFence(lines, i);
      current.blocks.push(block);
      i = next;
      continue;
    }

    const container = line.match(/^:::(\w+)(?: +(.+))?$/);
    if (container) {
      pushParagraph(para);
      const name = container[1];
      const arg = (container[2] || "").trim();
      const inner = [];
      i++;
      while (i < lines.length && lines[i].trim() !== ":::") {
        inner.push(lines[i]);
        i++;
      }
      i++; // skip closing :::
      if (name === "quiz") {
        quiz = parseQuiz(inner);
      } else if (current) {
        current.blocks.push(parseContainer(name, arg, inner));
      }
      continue;
    }

    if (line.trim() === "") {
      pushParagraph(para);
    } else {
      para.push(line.trim());
    }
    i++;
  }
  pushParagraph(para);

  if (!sections.length) fail("no sections found (use `# slug | Title` headings)");
  return { meta, sections, quiz };
}

/** Parses a fenced code block starting at lines[start]; consumes trailing @N: annotation lines. */
function parseCodeFence(lines, start) {
  const open = lines[start].match(/^```(\w+)?(?: +(.+))?$/);
  const lang = open[1] || "text";
  const fname = (open[2] || "").trim();
  const codeLines = [];
  let i = start + 1;
  while (i < lines.length && !lines[i].startsWith("```")) {
    codeLines.push(lines[i]);
    i++;
  }
  i++; // closing fence

  if (lang === "mermaid") {
    return { block: { kind: "mermaid", code: codeLines.join("\n") }, next: i };
  }

  // strip //@N or #@N markers, remember which line owns which note
  const noteByLine = {};
  const cleaned = codeLines.map((codeLine, index) => {
    const marker = codeLine.match(/^(.*?)\s*(?:\/\/|#)@(\d+)\s*$/);
    if (marker) {
      noteByLine[index] = Number(marker[2]);
      return marker[1].replace(/\s+$/, "");
    }
    return codeLine;
  });

  // trailing @N: Title | body lines
  const notes = {};
  while (i < lines.length) {
    const note = lines[i].match(/^@(\d+): *([^|]+?) *\| *(.+)$/);
    if (!note) break;
    notes[Number(note[1])] = { title: note[2].trim(), body: note[3].trim() };
    i++;
  }

  const annotated = Object.keys(noteByLine).length > 0;
  return {
    block: { kind: annotated ? "annotated-code" : "code", lang, fname, code: cleaned.join("\n"), noteByLine, notes },
    next: i,
  };
}

function parseContainer(name, arg, inner) {
  if (name === "info" || name === "warn") {
    return { kind: "callout", tone: name, title: arg || (name === "info" ? "Good to know" : "Watch out"), body: inner.join(" ").trim() };
  }
  if (name === "recap") {
    const bullets = inner.filter((l) => l.trim().startsWith("- ")).map((l) => l.trim().slice(2));
    return { kind: "recap", bullets };
  }
  if (name === "reveal") {
    return { kind: "reveal", question: arg, body: inner.join(" ").trim() };
  }
  if (name === "walkthrough") {
    return parseWalkthrough(inner);
  }
  if (name === "playground") {
    return parsePlayground(inner);
  }
  fail(`unknown container :::${name}`);
}

/* ---------------- playground parsing ---------------- */

const PLAYGROUND_LABEL_POOL = ["A", "B — wide", "C", "D — wider still", "E", "F — wide"];
const PLAYGROUND_MIN_ITEMS = 2;
const PLAYGROUND_MAX_ITEMS = 6;

function parsePlaygroundControls(raw) {
  const controls = {};
  for (const [prop, value] of Object.entries(raw || {})) {
    const text = String(value).trim();
    const range = text.match(/^(-?\d+)\.\.(-?\d+)(?: +step +(\d+))?$/);
    if (range) {
      controls[prop] = {
        type: "range",
        min: Number(range[1]),
        max: Number(range[2]),
        step: range[3] ? Number(range[3]) : 1,
        unit: prop === "gap" ? "px" : "",
        default: Number(range[1]),
      };
    } else {
      const values = text.split("|").map((v) => v.trim()).filter(Boolean);
      if (values.length < 2) fail(`playground: control "${prop}" needs "a | b" enum or "min..max" range, got: ${text}`);
      controls[prop] = { type: "enum", values, default: values[0] };
    }
  }
  return controls;
}

function validatePlaygroundTarget(scope, controls, target, challengeTitle) {
  const out = {};
  for (const [prop, value] of Object.entries(target || {})) {
    const control = controls[prop];
    if (!control) fail(`playground challenge "${challengeTitle}": target uses undeclared ${scope} control "${prop}"`);
    if (control.type === "enum") {
      if (!control.values.includes(String(value))) {
        fail(`playground challenge "${challengeTitle}": ${prop}: ${value} is not among declared values`);
      }
      out[prop] = String(value);
    } else {
      const num = Number(value);
      if (Number.isNaN(num) || num < control.min || num > control.max) {
        fail(`playground challenge "${challengeTitle}": ${prop}: ${value} outside range ${control.min}..${control.max}`);
      }
      out[prop] = num;
    }
  }
  return out;
}

function clampItemCount(n, fallback) {
  const num = Number(n);
  if (!num) return fallback;
  return Math.min(PLAYGROUND_MAX_ITEMS, Math.max(PLAYGROUND_MIN_ITEMS, num));
}

function parsePlayground(inner) {
  let raw;
  try {
    raw = parseYaml(inner.join("\n"));
  } catch (error) {
    fail(`playground: invalid YAML — ${error.message}`);
  }
  if (!raw || typeof raw !== "object") fail("playground: empty config");

  const container = parsePlaygroundControls(raw.container);
  const item = parsePlaygroundControls(raw.item);
  if (!Object.keys(container).length) fail("playground: needs at least one container control");

  const itemCount = clampItemCount(raw.items, 3);
  const authoredLabels = typeof raw["item-labels"] === "string"
    ? raw["item-labels"].split("|").map((s) => s.trim()).filter(Boolean)
    : [];
  const itemLabels = [];
  for (let i = 0; i < PLAYGROUND_MAX_ITEMS; i++) itemLabels.push(authoredLabels[i] || PLAYGROUND_LABEL_POOL[i]);

  const challenges = (raw.challenges || []).map((challenge, index) => {
    if (!challenge || !challenge.title || !challenge.target) fail(`playground challenge ${index + 1}: needs title and target`);
    const target = challenge.target;
    const nested = Boolean(target.container) || Object.keys(target).some((k) => /^item-\d+$/.test(k));
    const targetContainer = validatePlaygroundTarget("container", container, nested ? target.container : target, challenge.title);
    const targetItems = {};
    const count = clampItemCount(challenge.items, itemCount);
    if (nested) {
      for (const [key, value] of Object.entries(target)) {
        if (key === "container") continue;
        const match = key.match(/^item-(\d+)$/);
        if (!match) fail(`playground challenge "${challenge.title}": unknown target key "${key}"`);
        const n = Number(match[1]);
        if (n < 1 || n > count) fail(`playground challenge "${challenge.title}": item-${n} outside 1..${count}`);
        targetItems[n] = validatePlaygroundTarget("item", item, value, challenge.title);
      }
    }
    return {
      title: String(challenge.title),
      brief: String(challenge.brief || ""),
      hint: challenge.hint ? String(challenge.hint) : "",
      items: count,
      target: { container: targetContainer, items: targetItems },
    };
  });

  return { kind: "playground", config: { itemCount, itemLabels, container, item, challenges } };
}

function parseWalkthrough(inner) {
  let code = null;
  const steps = [];
  let i = 0;
  while (i < inner.length) {
    const line = inner[i];
    if (line.startsWith("```")) {
      const { block, next } = parseCodeFence(inner, i);
      code = block;
      i = next;
      continue;
    }
    const step = line.match(/^== *(\d+(?:-\d+)?) *\| *(.+)$/);
    if (step) {
      steps.push({ range: step[1], title: step[2].trim(), body: [] });
      i++;
      continue;
    }
    if (steps.length && line.trim()) steps[steps.length - 1].body.push(line.trim());
    i++;
  }
  if (!code || !steps.length) fail("walkthrough needs a code fence and at least one `== range | title` step");
  return { kind: "walkthrough", code, steps };
}

function parseQuiz(inner) {
  const questions = [];
  let q = null;
  for (const line of inner) {
    const question = line.match(/^Q: *(.+)$/);
    if (question) {
      q = { text: question[1].trim(), options: [], explanation: "" };
      questions.push(q);
      continue;
    }
    const option = line.match(/^- \[([ x])\] *(.+)$/);
    if (option && q) {
      q.options.push({ correct: option[1] === "x", text: option[2].trim() });
      continue;
    }
    const explain = line.match(/^> *(.+)$/);
    if (explain && q) {
      q.explanation += (q.explanation ? " " : "") + explain[1].trim();
    }
  }
  if (!questions.length) fail("quiz container has no questions");
  for (const question of questions) {
    if (!question.options.some((o) => o.correct)) fail(`quiz question has no correct option: ${question.text}`);
  }
  return questions;
}

/* ---------------- code highlighting ---------------- */

let highlighter = null;

async function initHighlighter(langs) {
  const valid = [...new Set(langs)].filter((l) => l in bundledLanguages);
  highlighter = await createHighlighter({ themes: [SHIKI_THEME], langs: valid.length ? valid : ["javascript"] });
}

/** Returns per-line HTML (token spans, fully escaped). */
function highlightLines(code, lang) {
  const effectiveLang = lang in bundledLanguages ? lang : "text";
  if (effectiveLang === "text" || !highlighter) {
    return code.split("\n").map((l) => escapeHtml(l) || " ");
  }
  const { tokens } = highlighter.codeToTokens(code, { lang: effectiveLang, theme: SHIKI_THEME });
  return tokens.map((lineTokens) => {
    if (!lineTokens.length) return " ";
    return lineTokens
      .map((t) => (t.color ? `<span style="color:${t.color}">${escapeHtml(t.content)}</span>` : escapeHtml(t.content)))
      .join("");
  });
}

/* ---------------- HTML rendering ---------------- */

const SVG = {
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  checkThin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/></svg>',
  warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
  quiz: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/><circle cx="12" cy="12" r="10"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>',
  tap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3 8-8"/><path d="M21 12A9 9 0 1 1 3 12"/></svg>',
  okSmall: '<svg class="ok-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  errSmall: '<svg class="err-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
};

let revealCounter = 0;
let mermaidCounter = 0;
let mermaidRenderer; // lazy-resolved once

async function getMermaidRenderer() {
  if (mermaidRenderer !== undefined) return mermaidRenderer;
  try {
    const mod = await import("@mermaid-js/mermaid-cli");
    mermaidRenderer = mod;
  } catch {
    mermaidRenderer = null;
  }
  return mermaidRenderer;
}

const MERMAID_THEMES = {
  light: { theme: "neutral" },
  dark: { theme: "dark" },
};

async function renderMermaidVariant(renderer, code, workDir, variant) {
  const input = join(workDir, `diagram-${mermaidCounter}-${variant}.mmd`);
  const output = join(workDir, `diagram-${mermaidCounter}-${variant}.svg`);
  writeFileSync(input, code, "utf8");
  await renderer.run(input, output, {
    quiet: true,
    outputFormat: "svg",
    puppeteerConfig: { headless: "new" },
    parseMMDOptions: {
      backgroundColor: "transparent",
      svgId: `mermaid-${mermaidCounter}-${variant}`,
      mermaidConfig: {
        ...MERMAID_THEMES[variant],
        fontFamily: '"Segoe UI", system-ui, sans-serif',
        flowchart: { nodeSpacing: 30, rankSpacing: 36 },
      },
    },
  });
  return readFileSync(output, "utf8").replace(/^<\?xml[^>]*\?>\s*/, "");
}

async function renderMermaid(code) {
  const renderer = await getMermaidRenderer();
  if (!renderer) {
    console.warn("[compile] WARNING: diagram skipped — install @mermaid-js/mermaid-cli to render mermaid blocks");
    return "<!-- mermaid diagram skipped: @mermaid-js/mermaid-cli not installed -->";
  }
  mermaidCounter++;
  const workDir = join(tmpdir(), `mp-tutorial-mermaid-${process.pid}`);
  mkdirSync(workDir, { recursive: true });
  try {
    const lightSvg = await renderMermaidVariant(renderer, code, workDir, "light");
    const darkSvg = await renderMermaidVariant(renderer, code, workDir, "dark");
    return `<figure class="diagram"><div class="diagram-light">${lightSvg}</div><div class="diagram-dark">${darkSvg}</div></figure>`;
  } catch (error) {
    console.warn(`[compile] WARNING: diagram skipped — mermaid render failed: ${error.message}`);
    return "<!-- mermaid diagram skipped: render failed -->";
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

function codeTopbar(fname, lang) {
  return `<div class="code-topbar"><span class="dots"><i></i><i></i><i></i></span>${
    fname ? `<span class="fname">${escapeHtml(fname)}</span>` : ""
  }<span class="lang">${escapeHtml(lang)}</span></div>`;
}

function renderPlainCode(block) {
  const lines = highlightLines(block.code, block.lang);
  const body = lines.map((h) => `<span class="cl">${h}</span>`).join("");
  return `<div class="code-block plain">${codeTopbar(block.fname, block.lang)}<pre class="code"><code>${body}</code></pre></div>`;
}

function renderAnnotatedCode(block) {
  const lines = highlightLines(block.code, block.lang);
  let codeHtml = "";
  const railCards = [];
  lines.forEach((lineHtml, index) => {
    const noteNum = block.noteByLine[index];
    const note = noteNum ? block.notes[noteNum] : null;
    if (note) {
      codeHtml +=
        `<span class="cl has-note" data-line="${noteNum}" role="button" tabindex="0" aria-expanded="false">${lineHtml}` +
        `<span class="note-badge">${noteNum}</span></span>` +
        `<span class="cl-note-inline" data-inline="${noteNum}">` +
        `<span class="nih"><span class="nn">${noteNum}</span>${renderInline(note.title)}</span>` +
        `<span>${renderInline(note.body)}</span></span>`;
      railCards.push(
        `<div class="anno" data-anno="${noteNum}"><div class="anno-head"><span class="anno-num">${noteNum}</span>` +
          `<span class="anno-title">${renderInline(note.title)}</span></div>` +
          `<div class="anno-body">${renderInline(note.body)}</div></div>`
      );
    } else {
      codeHtml += `<span class="cl">${lineHtml}</span>`;
    }
  });
  return (
    `<div class="mobile-hint">${SVG.tap}Tap a numbered badge in the code to read its note.</div>` +
    `<div class="code-region"><div class="code-block">${codeTopbar(block.fname, block.lang)}` +
    `<pre class="code"><code>${codeHtml}</code></pre></div>` +
    `<div class="annos">${railCards.join("")}</div></div>`
  );
}

function renderWalkthrough(block) {
  const lines = highlightLines(block.code.code, block.code.lang);
  const codeHtml = lines.map((h, i) => `<span class="cl" data-wtline="${i + 1}">${h}</span>`).join("");
  const total = block.steps.length;
  const cards = block.steps
    .map(
      (step, i) =>
        `<div class="wt-card" data-step="${i + 1}" data-range="${step.range}" role="button" tabindex="0" aria-pressed="false">` +
        `<div class="wt-step-head"><span class="wt-step-num">${i + 1}</span>` +
        `<span class="wt-step-title">${renderInline(step.title)}</span>` +
        `<span class="wt-step-nav">${i + 1} / ${total}</span></div>` +
        `<div class="wt-step-body">${renderInline(step.body.join(" "))}</div></div>`
    )
    .join("");
  return (
    `<div class="wt-region"><div class="wt-steps" role="list">${cards}</div>` +
    `<div class="wt-code-col"><div class="wt-code"><div class="code-block">${codeTopbar(block.code.fname, block.code.lang)}` +
    `<pre class="code"><code>${codeHtml}</code></pre></div></div></div></div>`
  );
}

function renderCallout(block) {
  return (
    `<div class="callout ${block.tone}"><span class="cico">${block.tone === "info" ? SVG.info : SVG.warn}</span>` +
    `<span class="cbody"><span class="ctitle">${renderInline(block.title)}</span>${renderInline(block.body)}</span></div>`
  );
}

function renderRecap(block) {
  const items = block.bullets.map((b) => `<li>${renderInline(b)}</li>`).join("");
  return `<div class="recap"><div class="recap-head"><span class="rmark">✦</span>Key takeaways</div><ul>${items}</ul></div>`;
}

function renderReveal(block) {
  revealCounter++;
  const id = `revealAns${revealCounter}`;
  return (
    `<div class="reveal"><div class="reveal-q"><span class="rq-emoji">\u{1F914}</span>` +
    `<span class="rq-text">Check yourself — ${renderInline(block.question)}</span></div>` +
    `<button class="reveal-btn" type="button" aria-expanded="false" aria-controls="${id}">${SVG.chevron}<span class="rb-label">Reveal answer</span></button>` +
    `<div class="reveal-ans" id="${id}">${renderInline(block.body)}</div></div>`
  );
}

/* ---------------- playground rendering ---------------- */

function shikiTokenSpan(color, text) {
  const escaped = escapeHtml(text);
  return color ? `<span style="color:${color}">${escaped}</span>` : escaped;
}

/**
 * Highlights one CSS line whose [valueStart, valueEnd) range is a mutable value.
 * The value range is re-emitted as a single <span class="pg-slot"> (fixed color)
 * so runtime JS can swap textContent without losing highlighting.
 */
function renderSlotLine(lineTokens, valueStart, valueEnd, slotId, rawValue) {
  let column = 0;
  let before = "";
  let after = "";
  let slotColor = null;
  for (const token of lineTokens) {
    const start = column;
    const end = column + token.content.length;
    column = end;
    if (end <= valueStart) {
      before += shikiTokenSpan(token.color, token.content);
    } else if (start >= valueEnd) {
      after += shikiTokenSpan(token.color, token.content);
    } else {
      if (start < valueStart) before += shikiTokenSpan(token.color, token.content.slice(0, valueStart - start));
      if (!slotColor) slotColor = token.color || null;
      if (end > valueEnd) after += shikiTokenSpan(token.color, token.content.slice(valueEnd - start));
    }
  }
  const colorAttr = slotColor ? ` style="color:${slotColor}"` : "";
  return `${before}<span class="pg-slot" data-slot="${slotId}"${colorAttr}>${escapeHtml(rawValue)}</span>${after}`;
}

function controlValueText(control, value) {
  return String(value) + (control.unit || "");
}

/** Builds the Shiki-highlighted CSS readout with slot spans and rule/decl metadata. */
function renderPlaygroundReadout(config) {
  const cssLines = [];
  const lineMeta = [];
  const pushLine = (text, meta) => {
    cssLines.push(text);
    lineMeta.push(meta || {});
  };

  pushLine(".container {");
  pushLine("  display: flex;");
  for (const [prop, control] of Object.entries(config.container)) {
    const value = controlValueText(control, control.default);
    pushLine(`  ${prop}: ${value};`, { slot: `c:${prop}`, value });
  }
  pushLine("}");

  const itemProps = Object.entries(config.item);
  if (itemProps.length) {
    for (let n = 1; n <= PLAYGROUND_MAX_ITEMS; n++) {
      pushLine("", { rule: n, hidden: true });
      pushLine(`.item:nth-child(${n}) {`, { rule: n, hidden: true });
      for (const [prop, control] of itemProps) {
        const value = controlValueText(control, control.default);
        pushLine(`  ${prop}: ${value};`, { rule: n, hidden: true, slot: `i${n}:${prop}`, decl: `i${n}:${prop}`, value });
      }
      pushLine("}", { rule: n, hidden: true });
    }
  }

  const cssText = cssLines.join("\n");
  let tokenLines;
  if (highlighter && "css" in bundledLanguages) {
    tokenLines = highlighter.codeToTokens(cssText, { lang: "css", theme: SHIKI_THEME }).tokens;
  } else {
    tokenLines = cssLines.map((line) => [{ content: line, color: null }]);
  }

  const htmlLines = cssLines.map((line, index) => {
    const meta = lineMeta[index];
    const tokens = tokenLines[index] || [];
    let inner;
    if (meta.slot) {
      const valueStart = line.indexOf(": ") + 2;
      const valueEnd = valueStart + meta.value.length;
      inner = renderSlotLine(tokens, valueStart, valueEnd, meta.slot, meta.value);
    } else if (!tokens.length || !line) {
      inner = " ";
    } else {
      inner = tokens.map((t) => shikiTokenSpan(t.color, t.content)).join("");
    }
    const classes = ["cl"];
    if (meta.hidden) classes.push("pg-line-hidden");
    const ruleAttr = meta.rule ? ` data-pgrule="${meta.rule}"` : "";
    const declAttr = meta.decl ? ` data-pgdecl="${meta.decl}"` : "";
    return `<span class="${classes.join(" ")}"${ruleAttr}${declAttr}>${inner}</span>`;
  });

  return (
    `<div class="code-block pg-readout">${codeTopbar("playground.css", "css")}` +
    `<pre class="code"><code>${htmlLines.join("")}</code></pre></div>`
  );
}

function renderPlaygroundControlRow(scope, prop, control) {
  const label = `<span class="pg-ctrl-label"><code>${escapeHtml(prop)}</code></span>`;
  if (control.type === "enum") {
    const buttons = control.values
      .map(
        (value) =>
          `<button type="button" class="pg-seg-btn" data-value="${escapeHtml(value)}" aria-pressed="${value === control.default}">${escapeHtml(value)}</button>`
      )
      .join("");
    return `<div class="pg-ctrl" data-scope="${scope}" data-prop="${escapeHtml(prop)}" data-kind="enum">${label}<div class="pg-seg" role="group" aria-label="${escapeHtml(prop)}">${buttons}</div></div>`;
  }
  return (
    `<div class="pg-ctrl" data-scope="${scope}" data-prop="${escapeHtml(prop)}" data-kind="range">${label}` +
    `<div class="pg-step"><button type="button" class="pg-step-btn" data-dir="-1" aria-label="Decrease ${escapeHtml(prop)}">−</button>` +
    `<span class="pg-step-val">${controlValueText(control, control.default)}</span>` +
    `<button type="button" class="pg-step-btn" data-dir="1" aria-label="Increase ${escapeHtml(prop)}">+</button></div></div>`
  );
}

function renderPlayground(block, sectionSlug) {
  const config = { section: sectionSlug, ...block.config };
  const uid = `pg-${sectionSlug}`;

  const tabs = [
    `<button type="button" class="pg-tab active" data-mode="explore" aria-pressed="true">Explore</button>`,
    ...config.challenges.map(
      (challenge, i) =>
        `<button type="button" class="pg-tab" data-mode="challenge" data-challenge="${i}" aria-pressed="false">` +
        `<span class="pg-tab-num">${i + 1}</span>${escapeHtml(challenge.title)}<span class="pg-tab-check" hidden>✓</span></button>`
    ),
  ].join("");

  const challengeInfos = config.challenges
    .map((challenge, i) => {
      const hint = challenge.hint
        ? `<div class="pg-hint"><button type="button" class="reveal-btn" data-show-label="Show hint" data-hide-label="Hide hint" aria-expanded="false" aria-controls="${uid}-hint-${i}">${SVG.chevron}<span class="rb-label">Show hint</span></button>` +
          `<div class="reveal-ans" id="${uid}-hint-${i}">${renderInline(challenge.hint)}</div></div>`
        : "";
      const next = i + 1 < config.challenges.length
        ? `<button type="button" class="pg-next" data-next="${i + 1}">Next challenge →</button>`
        : "";
      return (
        `<div class="pg-chal-info" data-chal-info="${i}" hidden>` +
        `<p class="pg-brief"><span class="pg-brief-num">${i + 1}</span>${renderInline(challenge.brief)}</p>${hint}` +
        `<div class="pg-success" hidden>${SVG.checkThin}<span>Solved — the ghosts agree.</span>${next}</div></div>`
      );
    })
    .join("");

  const containerRows = Object.entries(config.container)
    .map(([prop, control]) => renderPlaygroundControlRow("container", prop, control))
    .join("");
  const itemRows = Object.entries(config.item)
    .map(([prop, control]) => renderPlaygroundControlRow("item", prop, control))
    .join("");
  const itemGroup = itemRows
    ? `<div class="pg-ctrl-group pg-item-group"><div class="pg-ctrl-title">Item <span class="pg-item-which"></span></div>` +
      `<div class="pg-item-hint">Select an item in the preview to adjust it.</div>` +
      `<div class="pg-item-ctrls" hidden>${itemRows}</div></div>`
    : "";

  const realItems = Array.from(
    { length: config.itemCount },
    (_, i) => `<button type="button" class="pg-item">${escapeHtml(config.itemLabels[i])}</button>`
  ).join("");

  const configJson = JSON.stringify(config).replace(/</g, "\\u003c");

  return (
    `<div class="pg-region" data-pg-section="${sectionSlug}" data-mode="explore">` +
    `<script type="application/json" class="pg-config">${configJson}</script>` +
    `<div class="pg-tabs" role="group" aria-label="Playground mode">${tabs}</div>` +
    challengeInfos +
    `<div class="pg-body">` +
    `<div class="pg-controls">` +
    `<div class="pg-ctrl-group"><div class="pg-ctrl-title">Container</div>${containerRows}</div>` +
    itemGroup +
    `<div class="pg-actions">` +
    `<button type="button" class="pg-action-btn pg-add">+ item</button>` +
    `<button type="button" class="pg-action-btn pg-remove">− item</button>` +
    `<button type="button" class="pg-action-btn pg-reset">Reset</button>` +
    `</div></div>` +
    `<div class="pg-stage">` +
    `<div class="pg-canvas"><div class="pg-flex pg-ghost" aria-hidden="true"></div><div class="pg-flex pg-real">${realItems}</div></div>` +
    renderPlaygroundReadout(config) +
    `</div></div></div>`
  );
}

async function renderBlock(block, nextBlock, sectionSlug) {
  switch (block.kind) {
    case "p": {
      const introNext = nextBlock && ["annotated-code", "code", "walkthrough", "mermaid", "playground"].includes(nextBlock.kind);
      return `<p${introNext ? ' class="intro-line"' : ""}>${renderInline(block.text)}</p>`;
    }
    case "code":
      return renderPlainCode(block);
    case "annotated-code":
      return renderAnnotatedCode(block);
    case "walkthrough":
      return renderWalkthrough(block);
    case "callout":
      return renderCallout(block);
    case "recap":
      return renderRecap(block);
    case "reveal":
      return renderReveal(block);
    case "playground":
      return renderPlayground(block, sectionSlug);
    case "mermaid":
      return await renderMermaid(block.code);
    default:
      fail(`unknown block kind: ${block.kind}`);
  }
}

async function renderSection(section, index) {
  const num = String(index + 1).padStart(2, "0");
  const parts = [];
  for (let i = 0; i < section.blocks.length; i++) {
    parts.push(await renderBlock(section.blocks[i], section.blocks[i + 1], section.slug));
  }
  return `    <section class="section" id="${section.slug}" data-slug="${section.slug}">
      <div class="section-head">
        <h2><span class="snum">${num}</span>${renderInline(section.title)}</h2>
        <button class="understand-btn" data-understand="${section.slug}" aria-pressed="false">
          <span class="ic"><svg class="ring-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/></svg><svg class="check-ic" style="display:none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>
          <span class="btn-label">Mark as understood</span>
        </button>
      </div>
      <div class="section-body">
${parts.join("\n")}
        <div class="done-banner">${SVG.checkThin}Section understood — nicely done.</div>
      </div>
    </section>`;
}

function renderTocItems(sections) {
  return sections
    .map(
      (s, i) =>
        `          <li><a class="toc-link" href="#${s.slug}" data-toc="${s.slug}">` +
        `<span class="toc-dot">${SVG.check}</span>` +
        `<span class="toc-num">${String(i + 1).padStart(2, "0")}</span><span class="toc-label">${renderInline(s.title)}</span></a></li>`
    )
    .join("\n");
}

function renderVideos(videos) {
  if (!videos || !videos.length) return "";
  const cards = videos
    .map(
      (v) =>
        `        <a class="video-card" href="${escapeHtml(v.url)}" target="_blank" rel="noopener noreferrer" aria-label="Watch: ${escapeHtml(v.title)} on ${escapeHtml(v.channel)}">
          <span class="video-thumb"><span class="play">${SVG.play}</span></span>
          <span class="video-info">
            <span class="vtitle">${escapeHtml(v.title)}</span>
            <span class="vmeta">${escapeHtml(v.channel)} <span class="dur">${SVG.clock}${escapeHtml(v.duration || "")}</span></span>
          </span>
        </a>`
    )
    .join("\n");
  return `\n      <div class="videos">\n${cards}\n      </div>`;
}

function renderReferences(references) {
  if (!references || !references.length) return "";
  const docs = references.filter((r) => r.url);
  const locals = references.filter((r) => r.file);
  const group = (title, items) => {
    if (!items.length) return "";
    const list = items
      .map((r) => {
        if (r.url) {
          let sub = r.url;
          try { sub = new URL(r.url).hostname; } catch { /* keep raw */ }
          return `            <li><a class="ref-link" href="${escapeHtml(r.url)}" target="_blank" rel="noopener noreferrer"><span class="rl-mark">\u{1F4C4}</span><span class="rl-body"><span class="rl-title">${escapeHtml(r.title)}</span><span class="rl-sub">${escapeHtml(sub)}</span></span><span class="rl-arrow" aria-hidden="true">↗</span></a></li>`;
        }
        const fileUrl = "file:///" + String(r.file).replace(/\\/g, "/").replace(/^\/+/, "");
        const sub = String(r.file).replace(/\\/g, "/").split("/").slice(-2).join("/");
        return `            <li><a class="ref-link" href="${escapeHtml(fileUrl)}"><span class="rl-mark">\u{1F4C1}</span><span class="rl-body"><span class="rl-title">${escapeHtml(r.title)}</span><span class="rl-sub">${escapeHtml(sub)}</span></span></a></li>`;
      })
      .join("\n");
    return `        <div class="refs-group">\n          <h3>${title}</h3>\n          <ul class="refs-list">\n${list}\n          </ul>\n        </div>`;
  };
  return `    <div class="refs">
      <div class="refs-head">
        <span class="ribadge">${SVG.book}</span>
        <div>
          <h2>References &amp; further reading</h2>
          <p>Docs to go deeper, plus where this lives in your codebase</p>
        </div>
      </div>
      <div class="refs-groups">
${[group("Docs", docs), group("In your code", locals)].filter(Boolean).join("\n")}
      </div>
    </div>`;
}

function renderQuiz(questions) {
  if (!questions) return "";
  const qHtml = questions
    .map((q, qi) => {
      const letters = ["A", "B", "C", "D", "E"];
      const correctLetter = letters[q.options.findIndex((o) => o.correct)];
      const opts = q.options
        .map(
          (o, oi) =>
            `          <button class="option" data-opt="${letters[oi]}">
            <span class="marker"><span class="opt-letter">${letters[oi]}</span>${SVG.okSmall}${SVG.errSmall}</span>
            ${renderInline(o.text)}
          </button>`
        )
        .join("\n");
      return `      <div class="question" data-correct="${correctLetter}">
        <div class="qtext"><span class="qn">Q${qi + 1}.</span>${renderInline(q.text)}</div>
        <div class="options">
${opts}
        </div>
        <div class="explain good" data-for="${correctLetter}">${SVG.checkThin}<span><b>Correct.</b> ${renderInline(q.explanation)}</span></div>
      </div>`;
    })
    .join("\n");
  return `    <div class="quiz-wrap">
      <div class="quiz-head">
        <span class="qibadge">${SVG.quiz}</span>
        <div>
          <h2>Quick check</h2>
          <p>${questions.length} question${questions.length > 1 ? "s" : ""} · answers reveal instantly</p>
        </div>
      </div>
${qHtml}
    </div>`;
}

/* ---------------- reading time ---------------- */

function estimateReadMinutes(sections) {
  let words = 0;
  let codeBlocks = 0;
  for (const section of sections) {
    for (const block of section.blocks) {
      if (block.kind === "p") words += block.text.split(/\s+/).length;
      else if (block.kind === "callout") words += block.body.split(/\s+/).length;
      else if (block.kind === "recap") words += block.bullets.join(" ").split(/\s+/).length;
      else if (block.kind === "reveal") words += (block.question + " " + block.body).split(/\s+/).length;
      else if (block.kind === "walkthrough") {
        codeBlocks++;
        words += block.steps.map((s) => s.title + " " + s.body.join(" ")).join(" ").split(/\s+/).length;
      } else codeBlocks++;
    }
  }
  return Math.max(1, Math.round(words / 130 + codeBlocks * 0.7));
}

/* ---------------- index generation ---------------- */

function collectTutorials(root) {
  const tutorials = [];
  if (!existsSync(root)) return tutorials;
  for (const entry of readdirSync(root)) {
    const categoryDir = join(root, entry);
    if (!statSync(categoryDir).isDirectory()) continue;
    for (const file of readdirSync(categoryDir)) {
      if (!file.endsWith(".html")) continue;
      const filePath = join(categoryDir, file);
      const head = readFileSync(filePath, "utf8").slice(0, 4000);
      const metaMatch = head.match(/<!--tutorial-meta (.*?)-->/s);
      let meta = null;
      if (metaMatch) {
        try { meta = JSON.parse(metaMatch[1]); } catch { /* fall through */ }
      }
      if (!meta) {
        const titleMatch = head.match(/<title>([^<]*)<\/title>/);
        meta = { title: titleMatch ? titleMatch[1] : file, slug: basename(file, ".html"), sections: [] };
      }
      tutorials.push({ ...meta, category: entry, href: `${entry}/${file}` });
    }
  }
  return tutorials;
}

function generateIndex(root) {
  const tutorials = collectTutorials(root);
  if (!existsSync(root)) {
    console.warn(`[compile] WARNING: tutorials root not found, index skipped: ${root}`);
    return;
  }
  const byCategory = {};
  for (const t of tutorials) (byCategory[t.category] ??= []).push(t);

  const groups = Object.keys(byCategory)
    .sort()
    .map((category) => {
      const cards = byCategory[category]
        .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
        .map((t) => {
          const sections = JSON.stringify((t.sections || []).map((s) => s.slug || s));
          const typeLabel = t.type === "code-showcase" ? "Code showcase" : "Topic tutorial";
          return `      <a class="tut-card" href="${escapeHtml(t.href)}" data-slug="${escapeHtml(t.slug)}" data-sections='${escapeHtml(sections)}'>
        <span class="tc-eyebrow">${typeLabel}</span>
        <span class="tc-title">${escapeHtml(t.title || t.slug)}</span>
        ${t.subtitle ? `<span class="tc-sub">${escapeHtml(t.subtitle)}</span>` : ""}
        <span class="tc-meta">${t.date ? `<span class="chip">${escapeHtml(String(t.date))}</span>` : ""}${t.readMin ? `<span class="chip">~${t.readMin} min</span>` : ""}</span>
        <span class="tc-progress"><span class="tc-bar"><span class="tc-fill"></span></span><span class="tc-count"></span></span>
      </a>`;
        })
        .join("\n");
      return `    <section class="cat">
      <h2>${escapeHtml(category)}</h2>
      <div class="grid">
${cards}
      </div>
    </section>`;
    })
    .join("\n");

  const empty = tutorials.length ? "" : '    <p class="empty">No tutorials yet. Compile one with mp-tutorial-create.</p>';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="color-scheme" content="light dark" />
<title>Tutorials</title>
<script>
  (function () {
    try {
      var stored = localStorage.getItem('tutorial-theme') || 'system';
      var mql = window.matchMedia('(prefers-color-scheme: dark)');
      var resolved = stored === 'system' ? (mql.matches ? 'dark' : 'light') : stored;
      document.documentElement.setAttribute('data-theme', resolved);
    } catch (e) { document.documentElement.setAttribute('data-theme', 'light'); }
  })();
</script>
<style>
  :root {
    --font: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    --mono: ui-monospace, "SF Mono", "Cascadia Code", "Consolas", "Menlo", monospace;
    --accent-1: #7c5cff;
    --accent-grad: linear-gradient(135deg, #7c5cff 0%, #5b6dff 55%, #4aa8ff 100%);
  }
  html[data-theme="light"] {
    --bg: #f4f5fb; --surface: #ffffff; --surface-2: #f7f8fd; --surface-3: #eef1fa;
    --border: #e4e7f2; --border-strong: #d3d8ea;
    --text: #1a1c2e; --text-2: #4a5069; --text-3: #757b96;
    --shadow-card: 0 1px 2px rgba(24,28,55,.06), 0 8px 24px -12px rgba(24,28,55,.16);
    --shadow-pop: 0 4px 12px rgba(24,28,55,.10), 0 24px 48px -16px rgba(24,28,55,.28);
    --ring-track: #e6e9f5;
  }
  html[data-theme="dark"] {
    --bg: #0d0d13; --surface: #16161f; --surface-2: #1b1c27; --surface-3: #22232f;
    --border: #262735; --border-strong: #33344a;
    --text: #ecedf6; --text-2: #b3b6cc; --text-3: #7f8299;
    --shadow-card: 0 1px 1px rgba(0,0,0,.4), 0 12px 32px -18px rgba(0,0,0,.7);
    --shadow-pop: 0 8px 40px -8px rgba(90,80,220,.35), 0 24px 60px -20px rgba(0,0,0,.8);
    --ring-track: #262735;
  }
  * { box-sizing: border-box; }
  html, body { max-width: 100%; overflow-x: hidden; }
  body { margin: 0; font-family: var(--font); background: var(--bg); color: var(--text); line-height: 1.6; -webkit-font-smoothing: antialiased; transition: background .35s ease, color .35s ease; }
  html[data-theme="dark"] body {
    background: radial-gradient(1000px 500px at 15% -10%, rgba(124,92,255,.10), transparent 60%),
                radial-gradient(900px 500px at 100% 0%, rgba(74,168,255,.07), transparent 55%), var(--bg);
  }
  .topbar { position: sticky; top: 0; z-index: 50; display: flex; align-items: center; justify-content: space-between; gap: 16px;
    padding: 12px clamp(16px, 4vw, 40px); background: color-mix(in srgb, var(--bg) 78%, transparent);
    backdrop-filter: saturate(1.4) blur(14px); border-bottom: 1px solid var(--border); }
  .brand { display: flex; align-items: center; gap: 10px; font-weight: 700; letter-spacing: -.01em; font-size: 15px; }
  .brand .logo { width: 28px; height: 28px; border-radius: 9px; background: var(--accent-grad); display: grid; place-items: center;
    box-shadow: 0 4px 14px -4px rgba(124,92,255,.6); flex: none; }
  .brand .logo svg { width: 16px; height: 16px; color: #fff; }
  .theme-toggle { display: inline-flex; padding: 3px; gap: 2px; background: var(--surface-2); border: 1px solid var(--border); border-radius: 11px; }
  .theme-toggle button { display: grid; place-items: center; width: 34px; height: 30px; border: none; border-radius: 8px; background: transparent;
    color: var(--text-3); cursor: pointer; transition: background .2s ease, color .2s ease; }
  .theme-toggle button svg { width: 17px; height: 17px; }
  .theme-toggle button:hover { color: var(--text); background: var(--surface-3); }
  .theme-toggle button[aria-pressed="true"] { background: var(--surface); color: var(--accent-1); box-shadow: var(--shadow-card); }
  .wrap { max-width: 1200px; margin: 0 auto; padding: 40px clamp(16px, 4vw, 40px) 96px; }
  h1 { font-size: clamp(30px, 5vw, 42px); letter-spacing: -.03em; margin: 0 0 6px; font-weight: 820; }
  .sub { color: var(--text-2); margin: 0 0 34px; font-size: 16px; }
  .cat h2 { font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: .09em; color: var(--text-3); margin: 34px 0 14px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; }
  .tut-card { display: flex; flex-direction: column; gap: 8px; padding: 20px; background: var(--surface); border: 1px solid var(--border);
    border-radius: 18px; text-decoration: none; color: inherit; box-shadow: var(--shadow-card);
    transition: transform .22s cubic-bezier(.16,1,.3,1), box-shadow .22s ease, border-color .22s ease; }
  .tut-card:hover { transform: translateY(-3px); box-shadow: var(--shadow-pop); border-color: var(--border-strong); }
  .tc-eyebrow { display: inline-flex; align-self: flex-start; padding: 4px 10px; border-radius: 999px;
    background: color-mix(in srgb, var(--accent-1) 12%, transparent); color: var(--accent-1); font-size: 11px; font-weight: 700; letter-spacing: .02em; }
  .tc-title { font-weight: 750; font-size: 17px; letter-spacing: -.02em; line-height: 1.25; }
  .tc-sub { font-size: 13.5px; color: var(--text-2); line-height: 1.45; }
  .tc-meta { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 2px; }
  .chip { display: inline-flex; align-items: center; padding: 3px 10px; background: var(--surface-2); border: 1px solid var(--border);
    border-radius: 999px; font-size: 11.5px; color: var(--text-3); font-weight: 600; }
  .tc-progress { display: flex; align-items: center; gap: 10px; margin-top: 6px; }
  .tc-bar { flex: 1; height: 6px; border-radius: 999px; background: var(--ring-track); overflow: hidden; }
  .tc-fill { display: block; height: 100%; width: 0; border-radius: 999px; background: var(--accent-grad); transition: width .5s cubic-bezier(.16,1,.3,1); }
  .tc-count { font-size: 11.5px; font-weight: 700; color: var(--text-3); font-variant-numeric: tabular-nums; white-space: nowrap; }
  .empty { color: var(--text-3); }
  @media (prefers-reduced-motion: reduce) { * { animation-duration: .001ms !important; transition-duration: .001ms !important; } }
</style>
</head>
<body>
<header class="topbar">
  <div class="brand">
    <span class="logo" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg></span>
    <span>Learn <small style="color:var(--text-3);font-weight:500">· all tutorials</small></span>
  </div>
  <div class="theme-toggle" role="group" aria-label="Color theme">
    <button data-set="light" title="Light" aria-label="Light theme" aria-pressed="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg></button>
    <button data-set="dark" title="Dark" aria-label="Dark theme" aria-pressed="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/></svg></button>
    <button data-set="system" title="System" aria-label="System theme" aria-pressed="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg></button>
  </div>
</header>
<div class="wrap">
  <h1>Tutorials</h1>
  <p class="sub">Interactive, offline-ready tutorial pages. Progress is saved in this browser.</p>
${groups}
${empty}
</div>
<script>
(function () {
  "use strict";
  var mql = window.matchMedia('(prefers-color-scheme: dark)');
  function currentPref() { return localStorage.getItem('tutorial-theme') || 'system'; }
  function applyTheme(pref) {
    var resolved = pref === 'system' ? (mql.matches ? 'dark' : 'light') : pref;
    document.documentElement.setAttribute('data-theme', resolved);
    document.querySelectorAll('.theme-toggle button').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.set === pref));
    });
  }
  document.querySelectorAll('.theme-toggle button').forEach(function (b) {
    b.addEventListener('click', function () { localStorage.setItem('tutorial-theme', b.dataset.set); applyTheme(b.dataset.set); });
  });
  mql.addEventListener('change', function () { if (currentPref() === 'system') applyTheme('system'); });
  applyTheme(currentPref());

  // Per-tutorial progress read from localStorage at view time.
  document.querySelectorAll('.tut-card').forEach(function (card) {
    var slug = card.dataset.slug;
    var sections = [];
    try { sections = JSON.parse(card.dataset.sections || '[]'); } catch (e) {}
    if (!sections.length) { card.querySelector('.tc-progress').style.display = 'none'; return; }
    var done = sections.filter(function (s) {
      return localStorage.getItem('tutorial-progress:' + slug + ':' + s) === '1';
    }).length;
    card.querySelector('.tc-fill').style.width = Math.round((done / sections.length) * 100) + '%';
    card.querySelector('.tc-count').textContent = done + '/' + sections.length;
  });
})();
</script>
</body>
</html>
`;
  writeFileSync(join(root, "index.html"), html, "utf8");
  console.log(`[compile] index regenerated: ${join(root, "index.html")} (${tutorials.length} tutorial${tutorials.length === 1 ? "" : "s"})`);
}

/* ---------------- main ---------------- */

async function main() {
  const args = process.argv.slice(2);
  const sourceArg = args.find((a) => !a.startsWith("--"));
  if (!sourceArg) fail("usage: node compile.js <source.md> [--out <dir>] [--no-index]");
  const outFlag = args.indexOf("--out");
  const outDir = outFlag >= 0 ? resolve(args[outFlag + 1]) : null;
  const skipIndex = args.includes("--no-index");

  const sourcePath = resolve(sourceArg);
  if (!existsSync(sourcePath)) fail(`source not found: ${sourcePath}`);
  const raw = readFileSync(sourcePath, "utf8");
  const { meta, sections, quiz } = parseSource(raw);

  if (meta.type === "code-showcase" && quiz) fail("code-showcase tutorials must not contain a quiz");
  if (meta.type === "topic" && !quiz) console.warn("[compile] WARNING: topic tutorial has no quiz (expected one)");

  // collect languages for shiki
  const langs = [];
  for (const section of sections) {
    for (const block of section.blocks) {
      if (block.kind === "code" || block.kind === "annotated-code") langs.push(block.lang);
      if (block.kind === "walkthrough") langs.push(block.code.lang);
      if (block.kind === "playground") langs.push("css");
    }
  }
  await initHighlighter(langs);

  const readMin = estimateReadMinutes(sections);
  const typeLabel = meta.type === "code-showcase" ? "Code showcase" : "Topic tutorial";
  const sectionHtml = [];
  for (let i = 0; i < sections.length; i++) sectionHtml.push(await renderSection(sections[i], i));

  const glossary = {};
  for (const [key, def] of Object.entries(meta.glossary || {})) {
    glossary[key] = { term: key.charAt(0).toUpperCase() + key.slice(1), def: renderInline(def) };
  }

  const indexMeta = {
    title: meta.title,
    subtitle: meta.subtitle || "",
    type: meta.type,
    category: meta.category,
    slug: meta.slug,
    date: String(meta.date),
    readMin,
    sections: sections.map((s) => ({ slug: s.slug, title: s.title })),
  };
  const metaComment = `<!--tutorial-meta ${JSON.stringify(indexMeta).replace(/--/g, "-\\u002d")}-->`;

  const countWord = sections.length <= 10 ? NUMBER_WORDS[sections.length] : String(sections.length);

  let html = readFileSync(TEMPLATE_PATH, "utf8");
  const replacements = {
    "{{META_COMMENT}}": metaComment,
    "{{TITLE}}": escapeHtml(meta.title),
    "{{SUBTITLE}}": renderInline(meta.subtitle || ""),
    "{{BRAND_SMALL}}": meta.track ? ` <small>· ${escapeHtml(meta.track)}</small>` : "",
    "{{TYPE_LABEL}}": typeLabel,
    "{{TYPE_LABEL_LOWER}}": typeLabel.toLowerCase(),
    "{{DATE}}": escapeHtml(String(meta.date)),
    "{{READ_MIN}}": String(readMin),
    "{{SECTION_COUNT}}": String(sections.length),
    "{{SECTION_COUNT_WORD}}": countWord,
    "{{SLUG}}": meta.slug,
    "{{TOC_ITEMS}}": renderTocItems(sections),
    "{{VIDEOS}}": renderVideos(meta.videos),
    "{{SECTIONS}}": sectionHtml.join("\n"),
    "{{REFERENCES}}": renderReferences(meta.references),
    "{{QUIZ}}": meta.type === "topic" ? renderQuiz(quiz) : "",
    "{{GLOSSARY_JSON}}": JSON.stringify(glossary, null, 2),
    "{{SLUGS_JSON}}": JSON.stringify(sections.map((s) => s.slug)),
  };
  for (const [key, value] of Object.entries(replacements)) {
    html = html.split(key).join(value);
  }

  const leftover = html.match(/\{\{[A-Z_]+\}\}/);
  if (leftover) fail(`unfilled template placeholder: ${leftover[0]}`);

  const targetDir = outDir || dirname(sourcePath);
  mkdirSync(targetDir, { recursive: true });
  const outPath = join(targetDir, `${meta.slug}.html`);
  writeFileSync(outPath, html, "utf8");
  console.log(`[compile] wrote ${outPath}`);

  if (!skipIndex) generateIndex(TUTORIALS_ROOT);
}

main().catch((error) => {
  console.error(`[compile] ERROR: ${error.stack || error.message}`);
  process.exit(1);
});
