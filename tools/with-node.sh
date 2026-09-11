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
#
# An explicitly exported NODE_PORTABLE beats the file: local.env is this
# machine's default, not an override of what the caller just asked for.
env_node_portable=${NODE_PORTABLE:-}
# shellcheck source=/dev/null
[ -f local.env ] && . ./local.env
[ -n "$env_node_portable" ] && NODE_PORTABLE="$env_node_portable"

# The floor comes from web/package.json's engines field — the canonical
# declaration — rather than a number repeated here that can drift from it.
# Parsed with sed because reading it with node would need the node we are
# still looking for.
NODE_MIN=$(sed -n 's/.*"node" *: *">=\([0-9][0-9]*\)".*/\1/p' web/package.json 2>/dev/null | head -1)
NODE_MIN=${NODE_MIN:-22}

# Usable means all three: node, npm, and a version at or above the floor.
# Checking only for node is not enough — the default command and every
# documented use run npm, and a node below the floor gets rejected by
# cloud-setup.sh's preflight moments later.
usable_node() {
    command -v node >/dev/null 2>&1 || return 1
    command -v npm >/dev/null 2>&1 || return 1
    major=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null) || return 1
    [ -n "$major" ] && [ "$major" -ge "$NODE_MIN" ] 2>/dev/null
}

# A usable install always wins: never shadow one with a portable directory, or
# the panel and the gates end up on different versions.
if ! usable_node; then
    original_path="$PATH"
    found=""
    # Quoted: an unquoted expansion word-splits and globs, so a portable
    # directory under "Program Files" would be tested as two fragments.
    for dir in "${NODE_PORTABLE:-}" "$HOME/node-portable"; do
        [ -n "$dir" ] || continue
        # node.exe at the root for the Windows zip; bin/node for POSIX tarballs.
        [ -x "$dir/node.exe" ] || [ -x "$dir/bin/node" ] || continue
        PATH="$dir:$dir/bin:$original_path"
        if usable_node; then
            found="$dir"
            break
        fi
        PATH="$original_path"
    done
    if [ -z "$found" ]; then
        echo "[with-node] no usable node (>= $NODE_MIN, with npm) on PATH, and none found." >&2
        echo "[with-node] looked in: ${NODE_PORTABLE:+$NODE_PORTABLE, }$HOME/node-portable" >&2
        echo "[with-node] see docs/CLOUD-SANDBOX.md §3, or set NODE_PORTABLE in local.env." >&2
        exit 1
    fi
    export PATH
    echo "[with-node] using portable node $(node --version) from $found"
fi
# No arguments is the cafe case: start the panel.
if [ "$#" -eq 0 ]; then
    set -- npm run dev
fi

exec "$@"
