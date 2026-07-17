#!/usr/bin/env bash
# Capture a system-info snapshot from the shared remote dev box for the Yoursafe onboarding page.
# Usage: capture-remote.sh [host] [user]   (defaults: dev.app.netsafe.cz martas)
# Needs the gate2 VPN up. Uses Windows OpenSSH so the passphrase-protected work key in the Windows
# ssh-agent is reused -> no password prompt, no secret handled here. Exits 2 (UNREACHABLE) if the VPN
# is down or the key is not authorized; the caller should then keep the existing remote snapshot.
set -u
HOST="${1:-dev.app.netsafe.cz}"
RUSER="${2:-martas}"

SSH="/c/Windows/System32/OpenSSH/ssh.exe"
[ -x "$SSH" ] || SSH="ssh"

# reachability + key-only probe (BatchMode = fail fast instead of prompting for a password)
if ! "$SSH" -o BatchMode=yes -o ConnectTimeout=15 -o StrictHostKeyChecking=accept-new "$RUSER@$HOST" true 2>/dev/null; then
  echo "UNREACHABLE: $RUSER@$HOST not reachable key-only. Bring up the gate2 VPN and confirm the work key is authorized (or capture manually with the devel-LDAP password)." >&2
  exit 2
fi

echo "### CAPTURED (remote $RUSER@$HOST)"; date '+%Y-%m-%d %H:%M'

"$SSH" -o ConnectTimeout=20 "$RUSER@$HOST" 'bash -s' <<'REMOTE' 2>&1
echo "### IDENTITY"; whoami; id
echo "### HOST"; hostnamectl 2>/dev/null || uname -a
echo "### OS"; sed -n '1,4p' /etc/os-release
echo "### CPU"; lscpu | grep -E "^(Architecture|CPU\(s\)|Model name|Thread|Core|Socket)"; echo "nproc: $(nproc)"
echo "### MEM"; free -h
echo "### DISK"; df -h / 2>/dev/null
echo "### UPTIME"; uptime
echo "### WHO"; who
echo "### HOMES"; echo "count: $(ls -1 /home 2>/dev/null | wc -l)"; ls -1 /home 2>/dev/null | tr '\n' ' '; echo
echo "### TOPMEM"; ps -eo user,pid,%mem,%cpu,comm --sort=-%mem | head -15
echo "### DOCKER"; docker version --format 'client {{.Client.Version}} / server {{.Server.Version}}' 2>&1 | head -1
echo "### CONTAINERS_TOTAL"; docker ps -q 2>/dev/null | wc -l
echo "### CONTAINERS_BY_OWNER"; docker ps --format '{{.Label "com.docker.compose.project"}}' 2>/dev/null | sort | uniq -c | sort -rn
REMOTE
