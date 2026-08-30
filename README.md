# The Wreck Works

An LLM game factory. Every step of making a game is defined by its input
artifacts, its output artifacts, two recipes (one written for an LLM worker,
one for a human), and **a quality gate**. A step is done when its gate passes —
whoever or whatever did the work.

That last part is the whole idea. The deep lesson from building the pilot game
was that **the gates matter more than the workers**: the same validators that
caught LLM mistakes (format parser, map lint, parity test, calibration harness,
playtest squad) catch human mistakes identically. Once the gates are solid,
LLM-vs-manual stops being a trust decision and becomes a per-step convenience
choice.

The factory knows nothing about any particular game. It renders whatever a
project's `pipeline.json` says. A second game is a second `pipeline.json`.

- Pilot project: [Ghost in the Wreck](../ghost-in-the-wreck) — 18 steps, an
  embedded 2.9M-param transformer, shipped.
- The design behind the pipeline: [`docs/FACTORY-PIPELINE.md`](docs/FACTORY-PIPELINE.md)
- Writing a `pipeline.json`: [`docs/PIPELINE-SCHEMA.md`](docs/PIPELINE-SCHEMA.md)
- What building the pilot actually taught us: [`docs/AGENT-LEARNINGS.md`](docs/AGENT-LEARNINGS.md)
  — the playbook for the next one. Read this first if you are starting a game.

## Layout

    web/        Next.js control panel: pipeline board, step drawer, job queue
                API, LLM step runner (Vercel AI SDK + Anthropic)
    worker/     Job runner daemon. Executes gate commands in the project repo.
                node, python+torch, godot and playwright live HERE, not on Vercel.
    projects.json        which projects this factory builds (gitignored; local)
    projects.example.json  the committed template
    templates/  a real, complete pipeline.json to copy for a new game
    docs/       pipeline design, schema reference, and the build playbook

Run state is **not** stored here. Each project keeps its own at
`<project>/.factory/`, so the factory stays stateless and a project carries its
own history.

## Running it

Needs bash: the worker spawns `bash -lc` and gates are shell commands. WSL
Ubuntu or Linux, node 20+.

    git clone <this repo> ~/projects/wreck-works
    git clone <game repo>  ~/projects/ghost-in-the-wreck
    cd ~/projects/wreck-works
    cp projects.example.json projects.json     # roots are relative — siblings just work
    npm run setup

Two terminals:

    npm run dev        # panel on http://localhost:3100
    npm run worker     # the hands

Then pick a step and:

- **RUN GATE** — enqueues the step's gate; the worker runs it in the *project*
  directory and streams the log back. Green dot = gate passed.
- **RUN LLM STEP** — streams a proposal from Claude. Needs `ANTHROPIC_API_KEY`
  in `web/.env.local`; model override via `FACTORY_MODEL`. Proposals are saved
  to `<project>/.factory/proposals/` and the step moves to *review* — a human
  applies the proposal, then runs the gate. The harness deliberately never
  writes game artifacts itself.
- **SIGN OFF** — for human-gated steps (concept, canon, art, and always audio),
  records who approved and what they checked.

The worker serves every project in `projects.json` unless you pin one with
`FACTORY_PROJECT=<id>`. Each job carries the project root it must run in, so one
worker can drive several games.

Toolchain the worker machine needs for the pilot's gates: node 20+, python3 with
torch, `godot` on PATH, and Playwright (`cd ../ghost-in-the-wreck/test && npm install`).
Gates degrade individually — a missing tool fails only its own steps.

## Adding a game

1. `cp templates/ghost-in-the-wreck.pipeline.json <newgame>/pipeline.json`, then
   rewrite the steps and gates for that game.
2. Expose every gate as `make gate-<id>` in the game repo, running the identical
   command.
3. Add the project to `projects.json`.

## Deploying the panel

`web/` deploys as a normal Next.js app, with two consequences.

**The store assumes a persistent disk.** `web/lib/store.js` is four small
functions over JSON files; on Vercel, replace them with Vercel KV or Postgres.
They are the only storage touchpoint.

**The worker still runs on your machine** — it must, since it runs training,
Godot and Playwright. Point it at the deployment:

    HARNESS=https://your-app.vercel.app npm run worker

A deployed panel also cannot read project files for artifact previews or LLM
step inputs; that path assumes the panel and the projects share a filesystem.
Run the panel locally while that matters. LLM steps themselves are fine
serverless — they are just API calls.

## Where this could go

Replace the proposal flow with spawning a Claude Code session per step
(multi-file edits, self-verification against the gate before it ever reports
back). The queue and status model already accommodate it: a job is a command, a
cwd, and an exit code.
