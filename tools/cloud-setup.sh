#!/usr/bin/env bash
# Provision a fresh Linux sandbox (cloud session, container, new WSL distro) to
# the point where the panel builds and runs. Idempotent — safe to re-run.
#
# Deliberately NOT at .claude/setup.sh: .gitignore excludes .claude/ (decision
# 2026-09-03), so a script there is never committed and a fresh sandbox would
# clone the repo without it.
#
# This provisions the *panel*, not the gates. Godot, torch and the Fallout 4
# toolchain are not installed here and mostly cannot be — see
# docs/CLOUD-SANDBOX.md §5.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

GAME_REPO=${GAME_REPO:-https://github.com/iwerksom/ghost-in-the-wreck.git}

# The factory is stateless and reads the game from a sibling directory:
# projects.example.json points root at ../ghost-in-the-wreck. Clone only this
# repo and `npm run setup` still succeeds — the panel then renders "No pipeline
# found", which looks like a broken panel rather than a missing checkout.
if [ ! -d ../ghost-in-the-wreck ]; then
    echo "[setup] cloning the pilot game as a sibling"
    git clone --depth 1 "$GAME_REPO" ../ghost-in-the-wreck
else
    echo "[setup] ../ghost-in-the-wreck already present"
fi

# gitignored and local-only; roots inside it are relative, so siblings just work.
if [ ! -f projects.json ]; then
    cp projects.example.json projects.json
    echo "[setup] wrote projects.json from the template"
fi

# npm ci, not npm install: web/package-lock.json is committed, so ci is
# reproducible and fails loudly on a lockfile that has drifted. The root package
# has no dependencies and no lockfile of its own — nothing to install here.
echo "[setup] installing panel dependencies"
cd web && npm ci

cat <<'EOF'

[setup] done. Still needed before RUN LLM STEP works:

    echo 'ANTHROPIC_API_KEY=sk-ant-...' > web/.env.local

The board, artifact previews and RUN GATE all work without it. Only the LLM
step runner hard-fails (web/app/api/llm/route.js).

    npm run dev     # panel on http://localhost:3100
    npm run up      # panel + worker together (needs bash and curl)
EOF
