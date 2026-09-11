#!/usr/bin/env bash
# Run a command with node on PATH, wherever this machine keeps it.
#
# The point is one command that works on every machine. On a box with a real
# node install this is a passthrough. On a laptop whose node is a portable
# directory deliberately kept off the system PATH, it finds that directory
# first.
#
# This has to be a shell script rather than an npm script — `npm run dev:x`
# would need npm already on PATH, which is the very thing being arranged.
#
#   bash tools/with-node.sh                 # starts the panel (npm run dev)
#   bash tools/with-node.sh npm run build
#   bash tools/with-node.sh npm run worker
#   NODE_PORTABLE=/opt/node bash tools/with-node.sh
#
# Machine-specific settings can also go in a gitignored local.env, which this
# script sources if present.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

# Machine-specific settings live in a gitignored local.env, the same way
# projects.json and web/.env.local already do. Sourced, not parsed, so it is
# ordinary shell — and it is your own file, so that is a feature rather than a
# risk. Typically one line:
#
#     NODE_PORTABLE=/c/Users/you/node-portable
#
# shellcheck source=/dev/null
[ -f local.env ] && . ./local.env

# A real install always wins. Prepending a portable directory in front of a
# working node is how you end up running the panel on one version and the gates
# on another, on the machine where that matters most.
if ! command -v node >/dev/null 2>&1; then
    found=""
    for dir in ${NODE_PORTABLE:-} "$HOME/node-portable"; do
        [ -n "$dir" ] || continue
        # node.exe on Windows, bin/node on Linux and macOS.
        if [ -x "$dir/node.exe" ] || [ -x "$dir/bin/node" ]; then
            found="$dir"
            break
        fi
    done
    if [ -z "$found" ]; then
        echo "[with-node] no node on PATH, and no portable node found." >&2
        echo "[with-node] looked in: ${NODE_PORTABLE:+$NODE_PORTABLE, }$HOME/node-portable" >&2
        echo "[with-node] see docs/CLOUD-SANDBOX.md §3, or set NODE_PORTABLE." >&2
        exit 1
    fi
    # bin/ for POSIX layouts; the directory itself for the Windows zip, which
    # puts node.exe and npm.cmd at its root.
    PATH="$found:$found/bin:$PATH"
    export PATH
    echo "[with-node] using portable node $(node --version) from $found"
fi

# No arguments is the cafe case: start the panel.
if [ "$#" -eq 0 ]; then
    set -- npm run dev
fi

exec "$@"
