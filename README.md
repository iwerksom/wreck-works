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

- Pilot project: [Ghost in the Wreck](../ghost-in-the-wreck) — 19 steps, an
  embedded 2.9M-param transformer, shipped.
- Why the steps are the steps: [`docs/WHY-THESE-STEPS.md`](docs/WHY-THESE-STEPS.md)
  — the five rules the pilot's pipeline turns out to obey, and the condition
  that decides whether a new project needs each step.
- The design behind the pipeline: [`docs/FACTORY-PIPELINE.md`](docs/FACTORY-PIPELINE.md)
- Writing a `pipeline.json`: [`docs/PIPELINE-SCHEMA.md`](docs/PIPELINE-SCHEMA.md)
- What building the pilot actually taught us: [`docs/AGENT-LEARNINGS.md`](docs/AGENT-LEARNINGS.md)
  — the playbook for the next one. Read this first if you are starting a game.
- Working from a laptop with no toolchain: [`docs/CLOUD-SANDBOX.md`](docs/CLOUD-SANDBOX.md)

## Layout

    web/        Next.js control panel: pipeline board, step drawer, job queue
                API, LLM step runner (Vercel AI SDK + Anthropic)
    worker/     Job runner daemon. Executes gate commands in the project repo.
                node, python+torch, godot and playwright live HERE, not on Vercel.
    projects.json        which projects this factory builds (gitignored; local)
    projects.example.json  the committed template
    templates/  a real, complete pipeline.json to copy for a new game
    PLAN.md     the Language Models in Games program: prose plan above,
                machine-readable plan-state below. tools/plan-lint.js gates it.
    POSITIONING.md  the thesis the plan's evidence is built to support
    docs/       pipeline design, schema reference, the build playbook, and
                per-toolchain setup notes

Run state is **not** stored here. Each project keeps its own at
`<project>/.factory/`, so the factory stays stateless and a project carries its
own history.

## Running it

Needs bash: the worker spawns `bash -lc` and gates are shell commands. WSL
Ubuntu or Linux, node 22+ — the `ai` and `@ai-sdk` packages declare
`engines.node >= 22`.

    git clone <this repo> ~/projects/wreck-works
    git clone <game repo>  ~/projects/ghost-in-the-wreck
    cd ~/projects/wreck-works
    cp projects.example.json projects.json     # roots are relative — siblings just work
    npm run setup

One terminal:

    npm run up         # panel on http://localhost:3100, plus the worker

Or separately, if you want to restart one without the other:

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

Toolchain the worker machine needs for the pilot's gates: node 22+, python3 with
torch, `godot` on PATH, and Playwright (`cd ../ghost-in-the-wreck/test && npm install`).
Gates degrade individually — a missing tool fails only its own steps.

## Starting a game

Press **+ NEW GAME** in the panel. Answer what the game is and whether it has a
language model in it — embedded, a hosted API, or none — and the factory picks
the steps: each one is included only when the condition that justifies it holds.
The preview updates as you answer, and says which steps it is leaving out and
why.

Step *selection* is deterministic and needs no API key. **REFINE RECIPES WITH
CLAUDE** is optional and only rewrites the prose inside the steps already
chosen, so the recipes talk about your game instead of the pilot's.

Creating writes a sibling directory:

    ../<slug>/
      pipeline.json   the steps, with the `why` behind each one
      Makefile        `make gate-<id>` per automated gate, each failing until
                      you implement it — an unwritten gate has not passed
      README.md       the profile it was generated from, and the step list

and registers it in `projects.json`. The rules behind the choices are in
[`docs/WHY-THESE-STEPS.md`](docs/WHY-THESE-STEPS.md); the mapping itself is
`web/lib/catalogue.js`.

To bring in a game that already exists, add it to `projects.json` by hand and
put a `pipeline.json` at its root —
`templates/ghost-in-the-wreck.pipeline.json` is a complete one to copy.

## Deploying the panel

`web/` deploys as a normal Next.js app, with two consequences.

**The store assumes a persistent disk.** `web/lib/store.js` is four small
functions over JSON files; on Vercel, replace them with Vercel KV or Postgres.
They are the only storage touchpoint.

**The worker still runs on your machine** — it must, since it runs training,
Godot and Playwright. Point it at the deployment:

    HARNESS=https://your-app.vercel.app npm run worker

**List the deployment's hostname.** The panel answers only `localhost`, IP
addresses and the names in `FACTORY_ALLOWED_HOSTS`, so set
`FACTORY_ALLOWED_HOSTS=your-app.vercel.app` in the deployment's environment, or
every API request, the worker's included, gets a 403. This is DNS-rebinding
protection, not authentication; see `docs/CLOUD-SANDBOX.md`.

A deployed panel also cannot read project files for artifact previews or LLM
step inputs; that path assumes the panel and the projects share a filesystem.
Run the panel locally while that matters. LLM steps themselves are fine
serverless — they are just API calls.

## Where this could go

Replace the proposal flow with spawning a Claude Code session per step
(multi-file edits, self-verification against the gate before it ever reports
back). The queue and status model already accommodate it: a job is a command, a
cwd, and an exit code.
