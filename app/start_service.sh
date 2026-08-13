#!/bin/bash
# AI CAD Studio - Docker 容器启动脚本
export PYTHONIOENCODING=utf-8
export VIEWER_CAD_PYTHON=/usr/bin/python3
cd /app/viewer
exec node src/server/server.mjs --host 0.0.0.0 --port 4178
