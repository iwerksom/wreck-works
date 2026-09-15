# pipeline.json — the contract between a project and the factory

The factory has no knowledge of any particular game. It renders whatever a
project's `pipeline.json` says. A new game is a new `pipeline.json`, not a new
harness.

## Top level

```jsonc
{
  "name": "...",              // shown in the panel
  "version": "1.0",
  "description": "...",
  "profile": { /* see below */ },  // optional; what the steps were chosen from
  "phases": ["World", "Content", "Model", "Game", "Release"],
  "steps": [ /* see below */ ]
}
```

`phases` is the column order on the board. Every step names one of them. A
project only lists the phases it actually uses: a game with no language model
has no Model column, and the board simply does not draw one.

### `profile` — the answers a pipeline was generated from

The panel's new-game flow writes this block. It is a record, not an instruction:
nothing re-reads it to decide anything, and editing it changes no steps. It is
there so that six months later you can see *why* this pipeline has the steps it
has.

```jsonc
"profile": {
  "architecture": "embedded",  // "none" | "embedded" | "api"
  "levels": true,              // spatial levels -> maps
  "narrative": true,           // fixed story beats -> story_data
  "economy": true,             // resources -> tuning, balance
  "sound": true,               // -> audio, whose gate is always human
  "voices": true,              // more than one voice -> canon
  "modelGatesPlay": true,      // model decides outcomes -> calibrate
  "modelWritesText": true      // model writes player-facing text -> sample_review
}
```

The mapping from these answers to steps lives in `web/lib/catalogue.js` and is
deterministic — no model is involved in choosing steps, only in writing the
recipe prose inside them.

## A step

```jsonc
{
  "id": "calibrate",              // unique, stable; used in URLs and state
  "phase": "Model",
  "name": "Calibrate thresholds",
  "why": "...",                   // the failure this step exists to prevent
  "inputs":  ["game/weights.js"], // project-relative; attached to LLM prompts
  "outputs": ["game/calibration.js"],
  "llm_recipe": "...",            // the prompt, when an LLM does this step
  "manual_recipe": "...",         // instructions, when a human does it
  "gate": {
    "kind": "automated",          // "automated" | "review"
    "cmd": "node test/calibrate.js",
    "criteria": "Top-1 accuracy on fresh paraphrases >= 80%."
  },
  "depends_on": ["export"]
}
```

### Rules the harness relies on

- **`why` is the step's justification, and the panel shows it** as *why this step
  exists*. Write the failure it prevents, not what it does — the name already
  says what it does. A step whose `why` you cannot write is a step that has not
  earned its place; see [`WHY-THESE-STEPS.md`](WHY-THESE-STEPS.md) for the five
  rules the pilot's own steps turn out to obey.

- **`gate.cmd` runs with `cwd` = the project root**, under `bash -lc`, on the
  worker machine. Write it exactly as you would type it there. A meaningful
  exit code is the whole contract: 0 passes, anything else fails.
- **`gate.kind: "review"` means `cmd` must be `null`.** The panel shows sign-off
  buttons instead of a run button and records who approved and why.
- **Some gates must stay human.** Audio is the canonical case: the first
  synthesised soundscape shipped fatiguing static precisely because no ear ever
  gated it. Encode that as a review gate, not as a TODO.
- `inputs` entries containing `*` are listed to the LLM by name only, not read.
- `depends_on` drives the *blocked* state; it does not stop you running a gate.

### Keep gates and local commands identical

A project should expose each gate as `make gate-<id>` running the byte-identical
command. Then a green local run and a green dot in the panel mean the same
thing, and a gate can never quietly drift from what developers actually run.

## Wiring a project up

Add it to `projects.json` at the factory root:

```json
{
  "active": "ghost-in-the-wreck",
  "projects": [
    { "id": "ghost-in-the-wreck", "name": "Ghost in the Wreck", "root": "../ghost-in-the-wreck" }
  ]
}
```

`root` may be relative (resolved against `projects.json`) or absolute. Relative
is better: it survives moving the whole tree between machines, or from Windows
into WSL.

Run state for each project is written to `<root>/.factory/db.json` and
`<root>/.factory/proposals/`. It lives with the project on purpose — the
factory stays stateless and a project carries its own history.
