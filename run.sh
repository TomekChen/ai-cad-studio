#!/bin/bash
# ai-cad-studio-marker
export PATH="/root/tools/node/bin:/usr/local/bin:$PATH"
export PYTHONIOENCODING=utf-8
export VIEWER_CAD_PYTHON=/root/projects/ai-cad-studio/app/viewer/.venv/bin/python
cd /root/projects/ai-cad-studio/app/viewer
exec node src/server/server.mjs --host 0.0.0.0 --port 8800
