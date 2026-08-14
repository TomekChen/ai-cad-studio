#!/bin/bash
# ai-cad-studio-marker
export PATH=/root/miniconda3/bin
export LD_LIBRARY_PATH=/root/miniconda3/lib
export PYTHONIOENCODING=utf-8
export VIEWER_CAD_PYTHON=/workspace/root/projects/ai-cad-studio/app/viewer/.venv/bin/python3
cd /workspace/root/projects/ai-cad-studio/app/viewer
exec node src/server/server.mjs --host 0.0.0.0 --port 8800
