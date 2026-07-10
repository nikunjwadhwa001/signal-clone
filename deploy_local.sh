#!/usr/bin/env bash
# One-command local deployment for the Signal clone (backend + frontend).
# Mirrors the deploy_local.sh pattern used in b2b_portal_sprintvisa: full
# container cleanup, rebuild, then poll a real health endpoint instead of a
# blind sleep before declaring success.
#
#   ./deploy_local.sh          build + seed + run everything
#   ./deploy_local.sh reseed   wipe and reseed demo data
#   ./deploy_local.sh down     stop everything
#   ./deploy_local.sh logs     tail logs
#
# Requires Docker (OrbStack, Docker Desktop, or colima). Nothing else.
set -euo pipefail
cd "$(dirname "$0")"

ACTION="${1:-up}"

if ! docker info >/dev/null 2>&1; then
  echo "✖ Docker isn't running. Start OrbStack (or Docker Desktop) and retry."
  exit 1
fi

case "$ACTION" in
  reseed)
    echo "📦 Reseeding demo data..."
    docker compose exec backend python -m app.seed
    exit 0
    ;;
  down)
    docker compose down
    exit 0
    ;;
  logs)
    docker compose logs -f
    exit 0
    ;;
  up) ;;
  *)
    echo "Usage: ./deploy_local.sh [up|reseed|down|logs]"
    exit 1
    ;;
esac

echo "🚀 Deploying Signal clone locally..."

echo "📦 Cleaning up old containers..."
docker compose down --remove-orphans 2>/dev/null || true

echo "🔨 Building and starting containers..."
docker compose up --build -d

echo "⏳ Waiting for the backend to become healthy..."
MAX_WAIT_SECONDS=90
WAITED=0
until curl -sf http://localhost:8000/health >/dev/null 2>&1; do
  if [ "$WAITED" -ge "$MAX_WAIT_SECONDS" ]; then
    echo "✗ Backend failed to start after ${MAX_WAIT_SECONDS}s — check logs: docker compose logs backend"
    exit 1
  fi
  echo "  ⏳ Waiting for backend... (${WAITED}/${MAX_WAIT_SECONDS}s)"
  sleep 2
  WAITED=$((WAITED + 2))
done
echo "✓ Backend is healthy!"

echo "📦 Seeding demo data..."
docker compose exec -T backend python -m app.seed

echo ""
echo "📊 Running containers:"
docker compose ps

echo ""
echo "✅ Deployment complete!"
echo "🌐 Frontend:    http://localhost:3000"
echo "📘 API docs:    http://localhost:8000/docs"
echo "🔑 Demo login:  username 'alice', password 'password', OTP '123456'"
echo "📝 Logs:        ./deploy_local.sh logs"
echo "🛑 Stop:        ./deploy_local.sh down"
