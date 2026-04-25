#!/usr/bin/env bash
# =============================================================================
# CareerLens — Startup Script
# =============================================================================
# Usage:
#   ./start.sh            Start all services (dev profile)
#   ./start.sh --build    Force rebuild before starting
#   ./start.sh --stop     Stop all services
#   ./start.sh --status   Show service status
#   ./start.sh --logs     Tail logs from all services
#   ./start.sh --reset    Stop, remove volumes, and restart fresh

set -euo pipefail

APP_NAME="CareerLens"
COMPOSE_FILE="docker-compose.yml"
PROFILE="dev"
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

cd "$PROJECT_DIR"

# — Colors ——————————————————————————————————————————————————————————————————————
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${CYAN}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
fail()  { echo -e "${RED}[FAIL]${NC}  $*"; exit 1; }

# — Preflight checks ———————————————————————————————————————————————————————————
preflight() {
    info "Running preflight checks..."

    if ! command -v docker &>/dev/null; then
        fail "Docker is not installed. Install it from https://docker.com"
    fi

    if ! docker info &>/dev/null; then
        fail "Docker daemon is not running. Start Docker Desktop and try again."
    fi
    ok "Docker is running"

    if ! docker compose version &>/dev/null; then
        fail "Docker Compose v2 is required. Update Docker Desktop."
    fi
    ok "Docker Compose available"

    if [ ! -f ".env" ]; then
        warn ".env file not found — copying from .env.example"
        cp .env.example .env

        if grep -q '^JWT_SECRET=$' .env; then
            local jwt_secret
            jwt_secret=$(openssl rand -hex 32)
            if [[ "$OSTYPE" == "darwin"* ]]; then
                sed -i '' "s/^JWT_SECRET=$/JWT_SECRET=${jwt_secret}/" .env
            else
                sed -i "s/^JWT_SECRET=$/JWT_SECRET=${jwt_secret}/" .env
            fi
            ok "Generated JWT_SECRET"
        fi
    fi
    ok ".env file present"

    if grep -q '^JWT_SECRET=$' .env 2>/dev/null; then
        warn "JWT_SECRET is empty in .env — generating one"
        local jwt_secret
        jwt_secret=$(openssl rand -hex 32)
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' "s/^JWT_SECRET=$/JWT_SECRET=${jwt_secret}/" .env
        else
            sed -i "s/^JWT_SECRET=$/JWT_SECRET=${jwt_secret}/" .env
        fi
        ok "Generated JWT_SECRET"
    fi
}

# — Commands ————————————————————————————————————————————————————————————————————
cmd_start() {
    local build_flag=""
    if [ "${1:-}" = "--build" ]; then
        build_flag="--build"
    fi

    preflight

    echo ""
    info "Starting ${APP_NAME}..."
    echo ""

    docker compose --profile "$PROFILE" up -d $build_flag

    echo ""
    info "Waiting for services to be healthy..."
    echo ""

    local max_wait=120
    local elapsed=0
    local all_healthy=false

    while [ $elapsed -lt $max_wait ]; do
        local unhealthy
        unhealthy=$(docker compose ps --format json 2>/dev/null | \
            python3 -c "
import sys, json
lines = sys.stdin.read().strip().split('\n')
count = 0
for line in lines:
    if not line: continue
    svc = json.loads(line)
    health = svc.get('Health', '')
    if health and health != 'healthy':
        count += 1
print(count)
" 2>/dev/null || echo "unknown")

        if [ "$unhealthy" = "0" ]; then
            all_healthy=true
            break
        fi
        sleep 3
        elapsed=$((elapsed + 3))
        echo -n "."
    done

    echo ""
    echo ""

    if $all_healthy; then
        ok "All services are healthy!"
    else
        warn "Some services may still be starting (waited ${max_wait}s)"
    fi

    cmd_status

    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}  ${APP_NAME} is running!${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "  Frontend:   ${CYAN}http://localhost:3300${NC}"
    echo -e "  Backend:    ${CYAN}http://localhost:8300${NC}"
    echo -e "  API Docs:   ${CYAN}http://localhost:8300/docs${NC}"
    echo -e "  Database:   ${CYAN}localhost:5600${NC}"
    echo -e "  Mock OIDC:  ${CYAN}http://localhost:10190${NC}"
    echo ""
    echo -e "  Logs:       ${CYAN}./start.sh --logs${NC}"
    echo -e "  Stop:       ${CYAN}./start.sh --stop${NC}"
    echo ""
}

cmd_stop() {
    info "Stopping ${APP_NAME}..."
    docker compose --profile "$PROFILE" down
    ok "All services stopped"
}

cmd_status() {
    docker compose --profile "$PROFILE" ps
}

cmd_logs() {
    docker compose --profile "$PROFILE" logs -f --tail 100
}

cmd_reset() {
    warn "This will destroy all data (database, volumes) and rebuild."
    echo -n "Continue? [y/N] "
    read -r confirm
    if [[ "$confirm" =~ ^[Yy]$ ]]; then
        info "Stopping and removing volumes..."
        docker compose --profile "$PROFILE" down -v
        ok "Volumes removed"
        cmd_start --build
    else
        info "Cancelled."
    fi
}

# — Main ———————————————————————————————————————————————————————————————————————
case "${1:-}" in
    --stop)    cmd_stop ;;
    --status)  cmd_status ;;
    --logs)    cmd_logs ;;
    --reset)   cmd_reset ;;
    --build)   cmd_start --build ;;
    --help|-h)
        echo "Usage: $0 [option]"
        echo ""
        echo "Options:"
        echo "  (none)     Start all services"
        echo "  --build    Force rebuild before starting"
        echo "  --stop     Stop all services"
        echo "  --status   Show service status"
        echo "  --logs     Tail logs from all services"
        echo "  --reset    Stop, remove volumes, and restart fresh"
        echo "  --help     Show this help"
        ;;
    "")        cmd_start ;;
    *)         fail "Unknown option: $1 (try --help)" ;;
esac
