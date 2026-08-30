# The LLM Game Factory — pipeline map

Companion to `data/pipeline.json` (the machine-readable version your React
harness should consume). This document explains the design of the factory;
the JSON is the source of truth for steps, artifacts, and gates.

## The core idea

Every step of making an LLM game is defined by four things:

1. **Input artifacts** — files it reads (all engine-neutral, all in git).
2. **Output artifacts** — files it must produce.
3. **Two recipes** — one written for an LLM worker (a prompt plus attached
   inputs), one for a human worker (instructions plus the right tool, often
   the Godot editor). The factory UI lets the user pick per step.
4. **A quality gate** — the definition of done. Wherever possible the gate
   is an executable command with an exit code (parser, lint, parity test,
   calibration accuracy), so the harness can show red/green without opinion.
   A few gates are irreducibly human (see Audio).

The deep lesson from building Ghost in the Wreck: **the gates matter more
than the workers.** The same validators that caught LLM mistakes (format
parser, map lint, parity test, calibration harness, playtest squad) would
catch human mistakes identically. Once gates are solid, LLM-vs-manual
becomes a per-step convenience choice instead of a trust decision.

## The 18 steps

**World** — concept → canon (world + voice bibles) → format spec.
Mostly review-gated; this is where taste lives.

**Content** — corpus writing, level design (`maps.json`), fixed story beats
(`story.json`), tuning knobs (`tuning.json`). All four outputs are plain
JSON/text shared byte-for-byte between the HTML and Godot builds (proven by
the vertical slice). Corpus is the factory's biggest LLM win: parallel
writer agents against a strict spec. Level design is the biggest manual
win: painting maps in the Godot editor beats typing ASCII.

**Model** — dataset build → train → export/quantize → parity → calibrate →
sample review. Almost fully automated; the human/LLM choice only appears in
watching the loss curve and writing calibration paraphrases. Iron rule:
recalibrate after every retrain; thresholds do not survive new weights.

**Game** — engine/systems code, art pass, audio pass. Code is gate-friendly
(lint + smoke tests). Art is screenshot-review gated. **Audio is the one
step whose gate must always be a human**: the first synthesized soundscape
shipped with fatiguing static and comic beeps precisely because no ear ever
gated it. The factory should hard-code "a human listens for ten minutes"
as an unskippable gate on this step.

**Release** — adversarial playtest (the 9-mission agent squad is reusable
as-is), balance from measured runs, build/package, publish. Publishing to
stores (itch.io etc.) is inherently a human step because of accounts.

## Dependency shape

```
concept → canon → format_spec → corpus ─┐
             │                          ├→ dataset → train → export → calibrate ─┐
             ├→ maps ──┐                │                        └→ sample_review ├→ playtest → balance → build → publish
             ├→ story_data ├→ engine → art/audio ─────────────────────────────────┘
concept ────→ tuning ──┘
```

Engine work never waits for the model: a stub LM backend (keyword judge +
canned text) lets the whole game be built and tested before weights exist.

## Harness architecture (for the React/Vercel build-out)

- **Vercel**: the control panel. Step graph view, artifact browser with
  versions, gate status, worker picker, recipe editor, run history.
- **Job queue + worker**: a small runner on a real machine (your PC or a
  cheap VM) executes automated steps and gates: Python training, Godot
  headless tests, Playwright playtests, builds. Vercel functions cannot do
  these (time limits, no GPU/CPU control, no browsers).
- **LLM steps**: the harness sends recipe + input artifacts to the Anthropic
  API (or spawns a Claude Code session for multi-file steps) and writes the
  returned artifacts back to the repo branch, where the gate runs.
- **Git is the database.** Every artifact is a file; every step run is a
  commit; every gate is CI. You get history, diffs, and rollback for free,
  and the harness stays thin.

## Suggested build order for the harness itself

1. Repo with `pipeline.json` + gates runnable locally (`make gate-<step>`).
2. Worker daemon: polls a queue table (e.g. Vercel Postgres/KV), runs gate
   or step commands, posts results.
3. React UI: read-only pipeline view first (graph + gate status), then the
   worker picker and LLM-step runner, then artifact diff views.
4. Only after that: multi-project support (the same factory, new game).
