#!/usr/bin/env bash
# Capture the LOCAL Docker environment + Windows host RAM/CPU for the Yoursafe onboarding page.
# Run from Git Bash on the Windows dev machine. No arguments. Prints a labelled snapshot to stdout.
set -u

echo "### CAPTURED (local)"; date '+%Y-%m-%d %H:%M'

echo "### DOCKER_VERSION"
docker version --format 'client {{.Client.Version}} / server {{.Server.Version}}' 2>&1 | head -1
docker compose version 2>&1 | head -1

echo "### DOCKER_CONTEXT"
docker context ls 2>&1

echo "### DOCKER_INFO"
docker info --format 'NCPU={{.NCPU}}  MemTotal={{.MemTotal}}  OSType={{.OSType}}  Server={{.ServerVersion}}  Name={{.Name}}' 2>&1

echo "### DOCKER_PS"
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}' 2>&1

echo "### DOCKER_DF"
docker system df 2>&1

echo "### WINDOWS_HOST"
powershell.exe -NoProfile -Command "
  \$cs=Get-CimInstance Win32_ComputerSystem; \$os=Get-CimInstance Win32_OperatingSystem; \$cpu=Get-CimInstance Win32_Processor;
  'Model:     '+\$cs.Manufacturer+' '+\$cs.Model;
  'OS:        '+\$os.Caption+' (build '+\$os.BuildNumber+')';
  'CPU:       '+\$cpu.Name;
  'Cores/Thr: '+\$cpu.NumberOfCores+' / '+\$cpu.NumberOfLogicalProcessors;
  'Total RAM: '+[math]::Round(\$cs.TotalPhysicalMemory/1GB,1)+' GB';
  'Free RAM:  '+[math]::Round(\$os.FreePhysicalMemory/1MB,1)+' GB'
" 2>&1

echo "### WSL_VMS"
powershell.exe -NoProfile -Command "wsl -l -v" 2>&1
