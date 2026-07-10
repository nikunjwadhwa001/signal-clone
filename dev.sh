#!/usr/bin/env bash
# One-command local dev launcher for the Signal clone.
#
#   ./dev.sh          build + seed + run both services (docker compose)
#   ./dev.sh reseed   wipe the database and reseed demo data
#   ./dev.sh down     stop everything
#   ./dev.sh logs     tail logs
#
# Requires Docker (OrbStack, Docker Desktop, or colima). Nothing else.
set -euo pipefail
cd "$(dirname "$0")"

if ! docker info >/dev/null 2>&1; then
  echo "✖ Docker isn't running. Start OrbStack (or Docker Desktop) and retry."
  exit 1
fi

case "${1:-up}" in
  up)
    echo "→ Building and starting backend (:8000) + frontend (:3000)…"
    docker compose up --build -d
    echo
    echo "✓ Up. Frontend:  http://localhost:3000"
    echo "  API docs:      http://localhost:8000/docs"
    echo "  Demo login:    username 'alice', password 'password', OTP '123456'"
    echo "  Logs:          ./dev.sh logs"
    ;;
  reseed)
    echo "→ Reseeding demo data…"
    docker compose exec backend python -m app.seed
    ;;
  down)
    docker compose down
    ;;
  logs)
    docker compose logs -f
    ;;
  *)
    echo "Usage: ./dev.sh [up|reseed|down|logs]"
    exit 1
    ;;
esac
