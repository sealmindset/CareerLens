#!/usr/bin/env bash
# MLX Local Inference Server Manager for CareerLens
# Runs on macOS host (NOT in Docker)
#
# Prerequisites:
#   pip install mlx-lm
#
# Usage:
#   ./scripts/mlx-server.sh start      Start the MLX inference server
#   ./scripts/mlx-server.sh stop       Stop all MLX servers
#   ./scripts/mlx-server.sh status     Check server health
#   ./scripts/mlx-server.sh download   Pre-download models

set -euo pipefail

MLX_PORT="${MLX_PORT:-8080}"
MLX_MODEL="${MLX_MODEL:-mlx-community/Qwen2.5-72B-Instruct-4bit}"
PID_DIR="${HOME}/.career-lens-mlx"
PID_FILE="${PID_DIR}/server.pid"
LOG_FILE="${PID_DIR}/server.log"

ensure_pid_dir() {
    mkdir -p "$PID_DIR"
}

cmd_start() {
    ensure_pid_dir

    if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
        echo "MLX server already running (PID $(cat "$PID_FILE"))"
        echo "Use '$0 stop' first, or '$0 status' to check health."
        exit 1
    fi

    local mem_gb
    mem_gb=$(sysctl -n hw.memsize 2>/dev/null | awk '{printf "%.0f", $1/1073741824}')
    echo "System memory: ${mem_gb}GB unified"
    if [ "$mem_gb" -lt 48 ]; then
        echo "WARNING: ${mem_gb}GB may not be enough for ${MLX_MODEL}."
        echo "Consider using a smaller model (e.g., mlx-community/Qwen2.5-7B-Instruct-4bit)."
    fi

    echo "Starting MLX server on port ${MLX_PORT} with model: ${MLX_MODEL}"
    echo "Log: ${LOG_FILE}"

    nohup python3 -m mlx_lm.server \
        --model "$MLX_MODEL" \
        --port "$MLX_PORT" \
        > "$LOG_FILE" 2>&1 &

    local pid=$!
    echo "$pid" > "$PID_FILE"
    echo "MLX server started (PID ${pid})"

    echo -n "Waiting for server to be ready"
    for i in $(seq 1 60); do
        if curl -sf "http://localhost:${MLX_PORT}/v1/models" > /dev/null 2>&1; then
            echo " ready!"
            cmd_status
            return 0
        fi
        echo -n "."
        sleep 5
    done

    echo ""
    echo "WARNING: Server did not respond within 5 minutes."
    echo "It may still be loading the model. Check: $0 status"
}

cmd_stop() {
    if [ ! -f "$PID_FILE" ]; then
        echo "No PID file found. Server may not be running."
        return 0
    fi

    local pid
    pid=$(cat "$PID_FILE")
    if kill -0 "$pid" 2>/dev/null; then
        echo "Stopping MLX server (PID ${pid})..."
        kill "$pid"
        sleep 2
        if kill -0 "$pid" 2>/dev/null; then
            echo "Server still running, sending SIGKILL..."
            kill -9 "$pid"
        fi
        echo "Server stopped."
    else
        echo "Server not running (stale PID file)."
    fi
    rm -f "$PID_FILE"
}

cmd_status() {
    local url="http://localhost:${MLX_PORT}/v1/models"
    echo "Checking MLX server at ${url}..."

    if curl -sf "$url" > /dev/null 2>&1; then
        echo "MLX server: HEALTHY"
        curl -sf "$url" | python3 -m json.tool 2>/dev/null || true
    else
        echo "MLX server: NOT RESPONDING"
        if [ -f "$PID_FILE" ]; then
            local pid
            pid=$(cat "$PID_FILE")
            if kill -0 "$pid" 2>/dev/null; then
                echo "Process ${pid} is running but not responding yet (model may be loading)."
            else
                echo "Process ${pid} is not running (stale PID file)."
            fi
        fi
        return 1
    fi
}

cmd_download() {
    echo "Pre-downloading models for offline use..."
    echo ""
    echo "Standard model: ${MLX_MODEL}"
    python3 -c "from mlx_lm import load; load('${MLX_MODEL}')" && \
        echo "  -> Downloaded successfully" || \
        echo "  -> Failed to download"

    local light_model="mlx-community/Qwen2.5-7B-Instruct-4bit"
    echo ""
    echo "Light model: ${light_model}"
    python3 -c "from mlx_lm import load; load('${light_model}')" && \
        echo "  -> Downloaded successfully" || \
        echo "  -> Failed to download"

    local embed_model="nomic-ai/nomic-embed-text-v1.5"
    echo ""
    echo "Embedding model: ${embed_model}"
    python3 -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('${embed_model}')" && \
        echo "  -> Downloaded successfully" || \
        echo "  -> Failed (install sentence-transformers: pip install sentence-transformers)"

    echo ""
    echo "Done. Models cached in ~/.cache/huggingface/"
}

case "${1:-}" in
    start)    cmd_start ;;
    stop)     cmd_stop ;;
    status)   cmd_status ;;
    download) cmd_download ;;
    *)
        echo "Usage: $0 {start|stop|status|download}"
        echo ""
        echo "Environment variables:"
        echo "  MLX_PORT   Server port (default: 8080)"
        echo "  MLX_MODEL  Model to serve (default: mlx-community/Qwen2.5-72B-Instruct-4bit)"
        exit 1
        ;;
esac
