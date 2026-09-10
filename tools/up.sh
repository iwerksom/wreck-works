#!/usr/bin/env bash
# Start the panel and the worker together; Ctrl+C stops both.
#
# They are separate processes on purpose — the panel can be deployed while the
# worker stays on a machine that has the toolchain — but locally you almost
# always want both, and a half-started factory just reports "worker offline".
set -u
# || exit, not set -e: this script runs traps, background subshells and wait,
# where errexit interacts badly. Without the guard a failed cd is silent — the
# script would carry on and start the panel in whatever directory it was called
# from, since set -u does not catch a failing command.
cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 1

PORT=${PORT:-3100}
HARNESS=${HARNESS:-http://localhost:$PORT}

if curl -sf -o /dev/null --max-time 2 "$HARNESS/" 2>/dev/null; then
    echo "Something is already serving $HARNESS. Stop it first:"
    echo "    pkill -f 'next dev -p $PORT'"
    exit 1
fi

# Killing the npm wrapper leaves next-server and the worker's node process
# orphaned, so walk each child's tree. `kill 0` would be shorter, but it
# signals the whole process group — fine from an interactive shell, where this
# job gets its own group, and a foot-gun from anything that starts it as part
# of a larger script.
kill_tree() {
    local pid=$1 child
    for child in $(pgrep -P "$pid" 2>/dev/null); do
        kill_tree "$child"
    done
    kill "$pid" 2>/dev/null
}

pids=()
cleanup() {
    trap - EXIT INT TERM
    echo
    echo "[up] stopping"
    local pid
    for pid in "${pids[@]}"; do
        kill_tree "$pid"
    done
}
trap cleanup EXIT INT TERM

# sed -u, or its block buffer holds a quiet stream for minutes. The claim
# poll is a heartbeat twice a second and would drown everything else, so
# only the successful ones are dropped — a failing claim still shows.
# Each pipeline runs in a subshell so $! is the parent of the whole chain.
# From a bare pipeline $! is sed, whose siblings — not children — are npm
# and next-server, so kill_tree would walk the wrong branch and orphan them.
( npm run dev 2>&1 \
    | grep --line-buffered -v 'POST /api/jobs/claim 200' \
    | sed -u 's/^/[panel]  /' ) &
pids+=($!)

printf '[up] waiting for the panel on %s ' "$HARNESS"
ready=""
for _ in $(seq 1 90); do
    if curl -sf -o /dev/null --max-time 2 "$HARNESS/" 2>/dev/null; then
        ready=1
        echo "- ready"
        break
    fi
    printf '.'
    sleep 1
done
if [ -z "$ready" ]; then
    echo "- gave up after 90s"
    echo "[up] the panel never answered; not starting a worker against nothing."
    exit 1
fi

# Started second and only once the panel answers, so the worker does not open
# with a screen of "harness unreachable".
( HARNESS="$HARNESS" npm run worker 2>&1 | sed -u 's/^/[worker] /' ) &
pids+=($!)

wait
