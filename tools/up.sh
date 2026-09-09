#!/usr/bin/env bash
# Start the panel and the worker together; Ctrl+C stops both.
#
# They are separate processes on purpose — the panel can be deployed while the
# worker stays on a machine that has the toolchain — but locally you almost
# always want both, and a half-started factory just reports "worker offline".
set -u
cd "$(dirname "${BASH_SOURCE[0]}")/.."

PORT=${PORT:-3100}
HARNESS=${HARNESS:-http://localhost:$PORT}

if curl -sf -o /dev/null --max-time 2 "$HARNESS/" 2>/dev/null; then
    echo "Something is already serving $HARNESS. Stop it first:"
    echo "    pkill -f 'next dev -p $PORT'"
    exit 1
fi

# kill 0 signals this script's whole process group, so next-server and the
# worker's node process go too — not just the npm wrappers.
trap 'trap - EXIT INT TERM; echo; echo "[up] stopping"; kill 0' EXIT INT TERM

# sed -u, or its block buffer holds a quiet stream for minutes. The claim
# poll is a heartbeat twice a second and would drown everything else, so
# only the successful ones are dropped — a failing claim still shows.
npm run dev 2>&1 \
    | grep --line-buffered -v 'POST /api/jobs/claim 200' \
    | sed -u 's/^/[panel]  /' &

printf '[up] waiting for the panel on %s ' "$HARNESS"
for _ in $(seq 1 90); do
    if curl -sf -o /dev/null --max-time 2 "$HARNESS/" 2>/dev/null; then
        echo "- ready"
        break
    fi
    printf '.'
    sleep 1
done

# Started second and only once the panel answers, so the worker does not open
# with a screen of "harness unreachable".
HARNESS="$HARNESS" npm run worker 2>&1 | sed -u 's/^/[worker] /' &

wait
