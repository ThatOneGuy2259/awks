#!/usr/bin/env bash
set -euo pipefail

# AWKS Production Deploy Script
# Builds frontend + backend from source, starts containers, runs the server.
# Usage: ./deploy.sh [--rebuild] [--build-only]
#   --rebuild     Force rebuild even if binaries exist
#   --build-only  Build without starting the server (for systemd deploys)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

REBUILD=false
BUILD_ONLY=false
for arg in "$@"; do
  case "$arg" in
    --rebuild) REBUILD=true ;;
    --build-only) BUILD_ONLY=true ;;
  esac
done

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

if [ "$BUILD_ONLY" = true ]; then
  log "Build complete (--build-only). Skipping server start."
  exit 0
fi

# ── Run server ────────────────────────────────────────────────────────

export STATIC_DIR="$DIST_DIR"

log "Starting AWKS server..."
log "Frontend: $DIST_DIR"
log "Backend:  $BINARY"
echo ""

cd "$BACKEND_DIR"
exec ./awks-server
