#!/usr/bin/env bash
echo "=== START SCRIPT RUNNING ==="
python -V
pip -V
# Force reinstall to ensure all dependencies are up to date
pip install --force-reinstall --no-cache-dir -r requirements.txt
echo "=== STARTING UVICORN ==="
uvicorn server:app --host 0.0.0.0 --port "${PORT:-8001}" --log-level debug
