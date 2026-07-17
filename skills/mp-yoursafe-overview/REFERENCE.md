# mp-yoursafe-overview — reference

Detailed inventory, design contract, and capture interpretation for the Yoursafe/Verotel onboarding page.
Target document: `C:\_MP_work\Yoursafe\Yoursafe-Onboarding-Overview.html` (self-contained, offline, `file://` links).

## Resource inventory (what to re-read)

| Group | Paths | Live source |
|---|---|---|
| Wiki mirror | `C:\_MP_work\Yoursafe\wiki\*.md` (index, nastaveni-pracovniho-prostredi, git-ssh-gerrit, openvpn, oracle-v-dockeru, jak-funguje-gerrit-a-hudson, safeelements, yoursafe-flowguard, team-e, team-e-rotation-of-gitlab-tokens, uzitecne-snipety) | https://wiki.yoursafe.com/ (each file's frontmatter has its page URL) |
| Obsidian | `C:\Users\snapy\OneDrive\Obsidian\ObsidianMP\Yoursafe\*.md` (Yoursafe General, AI tips, PCI školení) | — |
| Slack summary | `C:\_MP_work\Yoursafe\team-e-private-summary*.txt` | Slack #team-e-private |
| Repos | `C:\_MP_work\{yoursafe-components,verotel,safe-elements,safe-elements-api,flowguard-proxy}` — README, `package.json` scripts, `Makefile`/AGENTS.md | GitLab `bitsafe/*`; verotel on Gerrit |
| Onboarding scripts | `C:\_MP_work\netsafe-setup\` (apply-nrpt.ps1, import-*, HANDOFF-*.md, onboarding-checklist.html), `C:\_MP_work\netsafe-ca\` (import-ca.ps1, *.crt), `C:\_MP_work\verotel\util\bin\devel-services-win.py`, `C:\_MP_work\verotel\devel\docker\hosts` | — |
| Sessions (optional) | `~\.claude\projects\C--Users-snapy--claude\`, `~\.claude*\projects\C---MP-work-verotel\`, `…\C---MP-work-yoursafe-components\` | Claude Code transcripts |

Always delegate reading to **Sonnet** `general-purpose` sub-agents (grep-first on session JSONL; never load whole large files).

## Design contract (must be preserved)

The page is one HTML file with an inline `<style>` and a tiny theme-toggle/TOC `<script>`. Keep:

- **Callout boxes** — `<div class="box explain|tip|warn|hint|naming|live">` with a `<div class="t">` title line and an emoji. Meaning:
  - `explain` (🔵 blue) — "what & why", skippable; every chapter opens with one, tagged `<span class="skip">`.
  - `tip` (🟢 green) — do-this / quick check.
  - `warn` (🔴 red) — gotcha / warning.
  - `hint` (🟠 amber) — password HINT (never a real secret).
  - `naming` (🟣 purple) — old→new renaming note.
  - `live` (🟦 teal) — captured command output + one-line commentary.
- **Shell badges** before code blocks — `<span class="badge b-gitbash|b-ps|b-cmd|b-develbox|b-remote|b-file">`.
- **Sidebar TOC** (`<nav>`) with one `<a href="#id">` per `<section id>`; keep them in sync.
- Code in `<pre><code>` with HTML-escaped `<`,`>`,`&`; comments wrapped in `<span class="c">`, ok/green in `.o`, warn in `.w`.
- Tables use `class="tbl"`. Grid pairs use `class="grid2"`.

### Chapter order (sections)
intro, naming, admin, passwords, vpn, dns, ca, ssh, git, docker, devapp, localremote, sysinfo, develbox, components, verotel, flowguard, develop, testing, deploy, links, pci, resources. Add new chapters by copying an existing section's structure (explainer box first) and adding the TOC link.

## Password policy — HINTS ONLY

Never write real secrets. Reproduce only the user's mnemonic hints exactly as in Obsidian, clearly labelled as hints:
- Production/Admin LDAP (`admin.verotel.com`, wiki) — user `martas` — hint "J password derived from **verotel**".
- Devel LDAP (`webgate`, Gerrit, dev.app SSH, `docker login dock.build.netsafe.cz`) — user `martas` — hint "J password derived from **ldap**".
- Emob team box (RDP "Windows App" / `ssh teame@emob`) — user `teame` — hint `ema-meme-masloo`.
The AI must never type these; the user runs credential commands via the `!` prefix.

## Naming / dedup canonical facts

Bitsafe → **Yoursafe** (GitLab group + wiki space `BIT` + many hosts still say bitsafe). Safe Elements → **Flowguard**
(repos `safe-elements`/`safe-elements-api` still carry the old name; `flowguard-proxy` is new-named). **Verotel** = company +
backend/gateway for Yoursafe (not a former name). **netsafe.cz** = internal network domain (Gerrit, registry, dev.app) —
unchanged, never customer-facing. **Tokenator** = PCI card vault both products depend on.

## Live captures

`scripts/capture-local.sh` → local Docker (version, context, `docker info` NCPU/MemTotal, `docker ps`, `system df`) + Windows
host RAM/CPU + WSL VMs (via `powershell.exe`). Always works.

`scripts/capture-remote.sh [host] [user]` → SSHes to `dev.app.netsafe.cz` (user `martas`) via **Windows OpenSSH**
(`C:/Windows/System32/OpenSSH/ssh.exe`) so the passphrase key in the Windows ssh-agent is reused — no password prompt, no
secret embedded. Needs the **gate2 VPN** up. Exits `2` + `UNREACHABLE` if the VPN is down or the key isn't authorized;
on that exit, keep the existing remote `live` block and note it wasn't refreshed.

Interpretation to fold into the page: `free -h` **available** column = spare RAM; `docker ps` compose-project label
`devel_<user>` = whose stack is whose on the shared box; `who`/`ls /home` = presence/accounts; `docker info MemTotal/NCPU`
locally = the Docker Desktop WSL2 VM allocation (not the whole laptop).
