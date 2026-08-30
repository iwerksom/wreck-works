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
  "phases": ["World", "Content", "Model", "Game", "Release"],
  "steps": [ /* see below */ ]
}
```

`phases` is the column order on the board. Every step names one of them.

## A step

```jsonc
{
  "id": "calibrate",              // unique, stable; used in URLs and state
  "phase": "Model",
  "name": "Calibrate thresholds",
  "inputs":  ["game/weights.js"], // project-relative; attached to LLM prompts
  "outputs": ["game/calibration.js"],
  "llm_recipe": "...",            // the prompt, when an LLM does this step
  "manual_recipe": "...",         // instructions, when a human does it
  "gate": {
    "kind": "cmd",                // "cmd" | "review"
    "cmd": "node test/calibrate.js",
    "criteria": "Top-1 accuracy on fresh paraphrases >= 80%."
  },
  "depends_on": ["export"]
}
```

### Rules the harness relies on

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
