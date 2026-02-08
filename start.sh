#!/usr/bin/env sh
set -e
PORT_TO_USE=${PORT:-8080}
exec uvicorn api.main:app --host 0.0.0.0 --port "$PORT_TO_USE"
