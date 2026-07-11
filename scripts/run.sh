#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

SERVICE="${1:-all}"
STAGE="dev"
DETACH=""

for arg in "$@"; do
  case "$arg" in
    prod|dev)      STAGE="$arg" ;;
    -d|--detach)   DETACH="-d" ;;
  esac
done

ensure_image() {
  local image="$1"
  if ! docker image inspect "$image" > /dev/null 2>&1; then
    echo "  → Image not found. Building $image..."
    "$SCRIPT_DIR/build.sh" "$2" "$STAGE"
  fi
}

run_frontend() {
  local name="kicktick-frontend"
  local image="kicktick-frontend:${STAGE}"
  ensure_image "$image" "frontend"

  echo "→ Starting $name ($STAGE)..."
  docker run --rm $DETACH \
    --name "$name" \
    -v "$PROJECT_DIR/frontend:/app" \
    -p 3000:3000 \
    "$image"
}

run_contracts() {
  local name="kicktick-contracts"
  local image="kicktick-contracts:${STAGE}"
  ensure_image "$image" "contracts"

  local vol_solana=""
  local solana_key="$HOME/.config/solana"
  [ -d "$solana_key" ] && vol_solana="-v $solana_key:/home/${USER_NAME:-${USER:-builder}}/.config/solana"

  stop_service "$name"

  echo "→ Starting $name ($STAGE)..."
  docker run --rm -d \
    --name "$name" \
    -v "$PROJECT_DIR/kicktick:/workspace" \
    -v kicktick_cargo-cache:/usr/local/cargo/registry \
    -v kicktick_cargo-git-cache:/usr/local/cargo/git \
    $vol_solana \
    "$image" \
    sleep infinity

  echo ""
  echo "Container running. Enter with:"
  echo "  docker exec -it $name bash"
}

run_relayer() {
  local name="kicktick-relayer"
  local image="kicktick-relayer:${STAGE}"
  ensure_image "$image" "relayer"

  local env_file="$PROJECT_DIR/relayer/.env"
  local env_opt=""
  [ -f "$env_file" ] && env_opt="--env-file $env_file"

  local vol_solana=""
  local solana_key="$HOME/.config/solana"
  [ -d "$solana_key" ] && vol_solana="-v $solana_key:/root/.config/solana:ro"

  local vol_keypair=""
  [ -f "$PROJECT_DIR/keypair.json" ] && vol_keypair="-v $PROJECT_DIR/keypair.json:/app/keypair.json:ro"

  echo "→ Starting $name ($STAGE)..."
  docker run --rm $DETACH \
    --name "$name" \
    $env_opt \
    -v "$PROJECT_DIR/relayer:/app" \
    $vol_solana \
    $vol_keypair \
    -p 8080:8080 \
    "$image"
}

stop_service() {
  local name="$1"
  if docker ps -a -q --filter "name=$name" | grep -q .; then
    echo "  Removing old container $name..."
    docker rm -f "$name" > /dev/null 2>&1 || true
  fi
}

PARALLEL_PIDS=()

cleanup() {
  for pid in "${PARALLEL_PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
}
trap cleanup EXIT

case "$SERVICE" in
  all)
    stop_service "kicktick-frontend"
    stop_service "kicktick-relayer"
    stop_service "kicktick-contracts"

    if [ -n "$DETACH" ]; then
      run_contracts
      run_frontend
      run_relayer
      echo ""
      echo "All services running. View logs:"
      echo "  docker logs -f kicktick-contracts"
      echo "  docker logs -f kicktick-frontend"
      echo "  docker logs -f kicktick-relayer"
    else
      run_contracts
      run_frontend &
      PARALLEL_PIDS+=($!)
      run_relayer &
      PARALLEL_PIDS+=($!)
      echo "→ All services starting. Press Ctrl+C to stop all."
      wait
    fi
    ;;
  frontend)
    stop_service "kicktick-frontend"
    run_frontend
    ;;
  relayer)
    stop_service "kicktick-relayer"
    run_relayer
    ;;
  contracts)
    run_contracts
    ;;
  *)
    echo "Usage: $0 [all|frontend|relayer|contracts] [dev|prod] [-d]"
    exit 1
    ;;
esac
