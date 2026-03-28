#!/bin/bash
# run_MPW.sh - Lanceur Master Pod Warden (a copier dans le home, ne pas versionner)
cd /opt/tool_MPW
git restore .
git pull --rebase
chmod +x deploy.sh
./deploy.sh
