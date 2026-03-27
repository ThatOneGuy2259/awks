#!/usr/bin/env bash
set -euo pipefail

# AWKS Production Deploy Script
# Builds frontend + backend from source, starts containers, runs the server.
# Usage: ./deploy.sh [--rebuild]
#   --rebuild  Force rebuild even if binaries exist

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

REBUILD=false
if [[ "${1:-}" == "--rebuild" ]]; then
  REBUILD=true
fi

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[AWKS]${NC} $*"; }
warn() { echo -e "${YELLOW}[AWKS]${NC} $*"; }
err()  { echo -e "${RED}[AWKS]${NC} $*" >&2; }

# ── Check prerequisites ──────────────────────────────────────────────

check_cmd() {
  if ! command -v "$1" &>/dev/null; then
    err "Required command not found: $1"
    err "Install it and try again."
    exit 1
  fi
}

check_cmd docker
check_cmd go
check_cmd node
check_cmd npm
check_cmd yt-dlp

log "All prerequisites found."

# ── Start containers ──────────────────────────────────────────────────

log "Starting PostgreSQL and Redis containers..."
docker compose up -d

# Wait for postgres to be ready
log "Waiting for PostgreSQL..."
for i in $(seq 1 30); do
  if docker compose exec -T postgres pg_isready -U awks &>/dev/null; then
    break
  fi
  if [ "$i" -eq 30 ]; then
    err "PostgreSQL did not become ready in time."
    exit 1
  fi
  sleep 1
done
log "PostgreSQL is ready."

# ── Build frontend ────────────────────────────────────────────────────

FRONTEND_DIR="$SCRIPT_DIR/frontend"
DIST_DIR="$FRONTEND_DIR/dist"

if [ "$REBUILD" = true ] || [ ! -d "$DIST_DIR" ]; then
  log "Installing frontend dependencies..."
  (cd "$FRONTEND_DIR" && npm ci --silent)

  log "Building frontend..."
  (cd "$FRONTEND_DIR" && npm run build)

  log "Frontend built to $DIST_DIR"
else
  log "Frontend already built (use --rebuild to force)."
fi

# ── Build backend ─────────────────────────────────────────────────────

BACKEND_DIR="$SCRIPT_DIR/backend"
BINARY="$BACKEND_DIR/awks-server"

if [ "$REBUILD" = true ] || [ ! -f "$BINARY" ]; then
  log "Building backend..."
  (cd "$BACKEND_DIR" && go build -o awks-server ./cmd/server)

  log "Backend built to $BINARY"
else
  log "Backend already built (use --rebuild to force)."
fi

# ── Load environment ──────────────────────────────────────────────────

ENV_FILE="$BACKEND_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
  err "No .env file found at $ENV_FILE"
  err "Create one with your production config (see backend/.env.example)"
  exit 1
fi

log "Loaded environment from $ENV_FILE"

# ── Run server ────────────────────────────────────────────────────────

export STATIC_DIR="$DIST_DIR"

log "Starting AWKS server..."
log "Frontend: $DIST_DIR"
log "Backend:  $BINARY"
echo ""

cd "$BACKEND_DIR"
exec ./awks-server
