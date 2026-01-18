#!/usr/bin/env bash
set -euxo pipefail
python -V
pip -V
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port "${PORT}"
