---
name: mp-gemini-fetch
description: "Fetches content from sites Claude cannot reach, using the Gemini CLI as a fallback."
compatibility: Requires Gemini CLI installed and authenticated
disable-model-invocation: true
allowed-tools: Bash, Read, Write
metadata:
  author: MartinoPolo
  version: "0.2"
  category: utility
---

# Gemini CLI Fetch

Fetches content from websites that Claude cannot directly access using Gemini CLI as a fallback.

## Prerequisites

- Gemini CLI must be installed: `npm install -g @google/gemini-cli` or equivalent
- Gemini must be authenticated (run `gemini auth` first)

## Usage

Invoke with a URL:

```
/mp-gemini-fetch https://reddit.com/r/programming/top
```

## Workflow

### Step 1: Validate URL

Check if the URL is provided and valid.

### Step 2: Execute Gemini CLI

**IMPORTANT:** Use `-p` flag for non-interactive mode. Without it, Gemini expects stdin and fails.

```bash
gemini -p "Fetch and summarize the main content from this URL: [URL]. Include key points, any code snippets, and relevant discussion highlights."
```

Use longer timeout for complex pages:

```bash
gemini -p "..." --timeout 120000
```

### Step 3: Capture Output

Parse the Gemini response and format it for use.

### Step 4: Return Results

Present the fetched content to the user:

> "**Fetched from:** [URL]
>
> **Content:**
> [Gemini's summary/content]
>
> **Note:** This content was fetched via Gemini CLI as a fallback."

## Common Use Cases

- Reddit threads (blocked by default)
- Sites with aggressive bot detection
- Content behind soft paywalls
- Forums and discussion boards

## Error Handling

If Gemini CLI fails:

1. **"No input provided via stdin"** → You forgot the `-p` flag. Use `gemini -p "prompt"`
2. Check if Gemini is installed: `gemini --version`
3. Check authentication: `gemini auth`
4. Try with simpler prompt
5. Report error to user with troubleshooting steps

## Notes

- This is a fallback for sites Claude cannot access directly
- Gemini CLI must be installed and authenticated separately
- Response quality depends on Gemini's access to the site
- Some sites may still be inaccessible
