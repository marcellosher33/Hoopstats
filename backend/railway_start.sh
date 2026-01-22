#!/usr/bin/env bash
echo "=== START SCRIPT RUNNING ==="
python -V
pip -V
# Install dependencies (will skip already installed)
pip install -r requirements.txt
# Explicitly install packages that might be missing from cache
pip install PyJWT==2.10.1
pip install email-validator
echo "=== STARTING UVICORN ==="
uvicorn server:app --host 0.0.0.0 --port "${PORT:-8001}" --log-level debug
