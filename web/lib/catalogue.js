// The step catalogue: every step the factory knows how to scope, with the
// condition under which a project needs it.
//
// This is docs/WHY-THESE-STEPS.md made executable. The pilot pipeline arrived
// with no stated rationale; the table there reverse-engineered one, and this
// file is that table as code so a new project is scoped by rule instead of by
// analogy to Ghost in the Wreck.
//
// A profile answers a handful of questions about a game. `selectSteps` turns a
// profile into a pipeline. Nothing here calls a model: scoping is deterministic
// and works with no API key. Claude is used afterwards, to write the
// project-specific recipes that only a model can write.

// A project profile. Every field has a defensible default for "a small game
// with a language model in it", which is what this factory is for.
export const DEFAULT_PROFILE = {
  architecture: "embedded", // "none" | "embedded" | "api"
  levels: true,             // the game has spatial levels a player moves through
  narrative: true,          // there are fixed story beats, not only generated text
  economy: true,            // there are resources or numbers worth tuning
  sound: true,              // the game makes noise
  voices: true,             // more than one authored voice/character
  modelGatesPlay: true,     // model output decides what happens, not just what is said
  modelWritesText: true,    // the model produces text a player reads
};

// `when` returns true if a project with this profile needs the step. `why` is
// shown in the panel: what the step exists to prevent. Keep both honest — a
// step whose gate you cannot name is a step you have not justified.
const CATALOGUE = [
  // ---- World -------------------------------------------------------------
  {
    id: "concept", phase: "World", name: "Concept & mechanics thesis",
    when: () => true,
    why: "Stops you building a game whose mechanics don't actually need the model. The premise becomes a document every later step can be held against.",
    inputs: [], outputs: ["docs/CONCEPT.md"],
    llm_recipe: "Draft 3 premises where the model's strengths are core mechanics and its weaknesses are diegetic. Include the 'unscriptable moment' for each.",
    manual_recipe: "Write or pick the premise; decide platform targets and scope.",
    gate: { kind: "review", cmd: null, criteria: "A named reviewer approves: premise, target platform, model-driven mechanics list, scope." },
    depends_on: [],
  },
  {
    id: "canon", phase: "World", name: "World bible & voice bibles",
    when: p => p.voices || p.narrative || p.architecture !== "none",
    why: "Stops parallel writers producing an incoherent world, and stops voices a classifier cannot tell apart. This is the synchronisation point before any writing fan-out.",
    inputs: ["docs/CONCEPT.md"], outputs: ["CANON.md"],
    llm_recipe: "Write world facts, timeline, and per-character voice bibles with mechanically distinct vocabulary and tics (a classifier only sees statistics).",
    manual_recipe: "Author or edit CANON.md directly.",
    gate: { kind: "review", cmd: null, criteria: "Voices are pairwise distinguishable on paper; timeline has no contradictions; every gameplay noun is named." },
    depends_on: ["concept"],
  },
  {
    id: "format_spec", phase: "World", name: "Training-data format spec",
    when: p => p.architecture === "embedded",
    why: "Stops unparseable training data being discovered hours later at dataset time. This is the bridge step: after it, gates are commands instead of opinions.",
    inputs: ["CANON.md"], outputs: ["FORMAT.md"],
    llm_recipe: "Define sample types with exact marker grammar, length bounds, charset rules; write the matching parser.",
    manual_recipe: "Edit FORMAT.md; keep the parser in sync.",
    gate: { kind: "automated", criteria: "Parser round-trips every sample type with 0 rejects." },
    depends_on: ["canon"],
  },

  // ---- Content -----------------------------------------------------------
  {
    id: "corpus", phase: "Content", name: "Corpus writing",
    when: p => p.architecture === "embedded",
    why: "Thin or off-spec training data is the single biggest quality lever there is. Fan out one writer per slice; every writer reads the spec first.",
    inputs: ["CANON.md", "FORMAT.md"], outputs: ["corpus/raw/*.txt"],
    llm_recipe: "Fan out one writer agent per slice (per character, per theme); each reads both spec docs. Plan two rounds, the second targeting whatever round one lacked. Include a gibberish-handling slice.",
    manual_recipe: "Human writers produce slices against the same FORMAT.md; drop files into corpus/raw/.",
    gate: { kind: "automated", criteria: "0 unparsed blocks; token count >= target (>=400k); per-type minimum counts met." },
    depends_on: ["format_spec"],
  },
  {
    id: "maps", phase: "Content", name: "Level design",
    when: p => p.levels,
    why: "Catches unreachable content, void leaks, and two engines disagreeing about the same level file.",
    inputs: ["docs/CONCEPT.md", "CANON.md"], outputs: ["data/maps.json"],
    llm_recipe: "Generate layouts plus entity metadata as JSON; iterate against the lint.",
    manual_recipe: "Edit maps.json by hand, or paint in the editor and export back to JSON.",
    gate: { kind: "automated", criteria: "Every entity reachable, no void leaks, every engine agrees." },
    depends_on: ["canon"],
  },
  {
    id: "story_data", phase: "Content", name: "Fixed story beats & endings",
    when: p => p.narrative,
    why: "Generated text carries atmosphere; hand-written anchors carry plot. Without this step the plot drifts with the weights.",
    inputs: ["CANON.md"], outputs: ["data/story.json"],
    llm_recipe: "Draft the canonical recordings, intro, finale questions and ending frames the generated text hangs on.",
    manual_recipe: "Edit data/story.json.",
    gate: { kind: "automated", criteria: "Schema valid; every story key referenced by content exists." },
    depends_on: ["canon"],
  },
  {
    id: "tuning", phase: "Content", name: "Economy & tuning knobs",
    when: p => p.economy,
    why: "Keeps balance numbers out of code, where changing one means a rebuild and a re-review.",
    inputs: ["docs/CONCEPT.md"], outputs: ["data/tuning.json"],
    llm_recipe: "Propose defaults with rationale; revise from playtest telemetry.",
    manual_recipe: "Edit data/tuning.json.",
    gate: { kind: "automated", criteria: "Schema valid." },
    depends_on: ["concept"],
  },
];

// ---- Model: embedded (weights you train and ship) ------------------------
CATALOGUE.push(
  {
    id: "dataset", phase: "Model", name: "Dataset build (tokenize + augment)",
    when: p => p.architecture === "embedded",
    why: "Catches silent data loss between the corpus and the trainer. Cheapest failure in the Model phase (minutes to fix), which is exactly why it is its own step.",
    inputs: ["corpus/raw/*.txt", "FORMAT.md"], outputs: ["corpus/build/dataset.npz", "corpus/build/tokenizer.json"],
    llm_recipe: null, manual_recipe: null, automated: true,
    gate: { kind: "automated", criteria: "Reject count 0; derived-augmentation counts balanced per character." },
    depends_on: ["corpus"],
  },
  {
    id: "train", phase: "Model", name: "Train the model",
    when: p => p.architecture === "embedded",
    why: "The expensive failure, measured in hours of wall clock. Split from the steps either side of it so that a cheap mistake never costs a retrain.",
    inputs: ["corpus/build/dataset.npz"], outputs: ["model/ckpt/best.pt", "model/train.log"],
    llm_recipe: "Monitor val loss; stop when it rises for 3+ evals. If val was still falling when the data ran out, order another corpus round instead of more steps.",
    manual_recipe: "Same, by a human watching the log.",
    automated: true,
    gate: { kind: "automated", criteria: "Checkpoint exists; val loss <= the agreed threshold." },
    depends_on: ["dataset"],
  },
  {
    id: "export", phase: "Model", name: "Quantize & export weights",
    when: p => p.architecture === "embedded",
    why: "Catches the runtime engine silently disagreeing with the training engine after quantization: invisible without a parity test, fatal in play.",
    inputs: ["model/ckpt/best.pt"], outputs: ["game/weights.js", "model/test_vectors.json"],
    llm_recipe: null, manual_recipe: null, automated: true,
    gate: { kind: "automated", criteria: "Runtime reproduces training-time token ids and top-10 logit order exactly; size within budget." },
    depends_on: ["train"],
  },

  // ---- Model: remote API -------------------------------------------------
  // None of these four exist in the pilot pipeline, which only ever described
  // a from-scratch embedded model. They are the same five rules applied to an
  // architecture where the weights belong to someone else.
  {
    id: "prompt_spec", phase: "Model", name: "Prompt & system-message spec",
    when: p => p.architecture === "api",
    why: "The API equivalent of FORMAT.md: it makes the contract with the model explicit and checkable, instead of a string that drifts every time someone edits it.",
    inputs: ["CANON.md", "docs/CONCEPT.md"], outputs: ["docs/PROMPTS.md", "data/prompts.json"],
    llm_recipe: "Specify every system message, the exact output schema expected back, refusal and empty-response handling, and the token budget per call.",
    manual_recipe: "Author docs/PROMPTS.md and data/prompts.json by hand.",
    gate: { kind: "automated", criteria: "Every prompt validates against its declared output schema on a recorded sample response." },
    depends_on: ["canon"],
  },
  {
    id: "eval_set", phase: "Model", name: "Held-out eval set",
    when: p => p.architecture === "api",
    why: "The positioning claim is that nobody in this field measures output quality. A frozen eval set is what lets you change prompt or model and know which way it moved.",
    inputs: ["docs/PROMPTS.md"], outputs: ["test/evalset.json", "docs/eval-report.md"],
    llm_recipe: "Write held-out cases per prompt family with expected-behaviour assertions, including adversarial and out-of-canon inputs. Never reuse text that appears in the prompts.",
    manual_recipe: "A human writes the cases and the pass criteria.",
    gate: { kind: "automated", criteria: "Eval suite runs end to end and reports a score; pass rate >= the agreed threshold." },
    depends_on: ["prompt_spec"],
  },
  {
    id: "budget", phase: "Model", name: "Cost & latency budget",
    when: p => p.architecture === "api",
    why: "A remote brain has a per-player bill and a multi-second loop, both of which are design constraints rather than ops details. Measure them before the design depends on them.",
    inputs: ["data/prompts.json", "test/evalset.json"], outputs: ["docs/budget.md"],
    llm_recipe: "Measure tokens and wall clock per interaction over the eval set; state cost per player-hour and p50/p95 latency; name the design limit each must stay under.",
    manual_recipe: "Run the same measurements and record them.",
    gate: { kind: "automated", criteria: "Measured p95 latency and cost per player-hour are both within the stated budget." },
    depends_on: ["eval_set"],
  },
  {
    id: "fallback", phase: "Model", name: "Fallback path",
    when: p => p.architecture === "api",
    why: "Never hard-gate the critical path on model output. The API will time out, refuse, or return something the gate rejects, and the player must not notice.",
    inputs: ["data/prompts.json"], outputs: ["handwritten fallback content", "fallback handler"],
    llm_recipe: "For every model-driven moment, write the handwritten content shown when the call fails or its output is rejected. In character, never an error state.",
    manual_recipe: "Author the fallback content and wire up the handler.",
    gate: { kind: "automated", criteria: "With the API forced to fail, a full playthrough completes and no error text reaches the player." },
    depends_on: ["prompt_spec"],
  },

  // ---- Model: architecture-independent -----------------------------------
  {
    id: "calibrate", phase: "Model", name: "Calibrate judgment thresholds",
    when: p => p.architecture !== "none" && p.modelGatesPlay,
    why: "Thresholds must be derived from measurement, not guessed, and they never survive new weights or a new model version. Re-run this after every change upstream.",
    inputs: [], outputs: ["game/calibration.js"],
    llm_recipe: "Write fresh out-of-corpus paraphrases per case; run the calibration harness; adjust thresholds for the intended pass-feel.",
    manual_recipe: "Same; a human writes the paraphrases and picks the thresholds.",
    gate: { kind: "automated", criteria: "Top-1 accuracy on fresh paraphrases >= 80%; nonsense input fully separated from real input." },
    depends_on: ["export", "eval_set"],
  },
  {
    id: "sample_review", phase: "Model", name: "Generation quality review",
    when: p => p.architecture !== "none" && p.modelWritesText,
    why: "Systemic failures (repetition, marker leakage, flattened voice) are invisible in aggregate metrics and obvious to anyone who reads twenty samples.",
    inputs: [], outputs: ["docs/sample-review.md"],
    llm_recipe: "Generate N samples per prompt family; score coherence / voice / lore 1-5; flag systemic failures.",
    manual_recipe: "A human reads the same samples and scores them.",
    gate: { kind: "review", cmd: null, criteria: "Median voice score >= 4; no systemic failure flagged; sampling parameters frozen." },
    depends_on: ["export", "prompt_spec"],
  },

  // ---- Game ---------------------------------------------------------------
  {
    id: "engine", phase: "Game", name: "Engine & systems code",
    when: () => true,
    why: "Systems read only from data files, so content and code move independently. A stub model backend lets all of this be built and tested before any weights exist.",
    inputs: ["data/*.json", "docs/CONCEPT.md"], outputs: ["game code"],
    llm_recipe: "Implement systems reading ONLY from data files; give every model latency diegetic cover.",
    manual_recipe: "Human implements or reviews the same.",
    gate: { kind: "automated", criteria: "Syntax, lint and smoke tests pass against a stub model backend." },
    depends_on: ["maps", "story_data", "tuning"],
  },
  {
    id: "art", phase: "Game", name: "Art pass",
    when: () => true,
    why: "Catches screens that are unreadable at the target brightness. The gate is an eye on every screenshot; no test stands in for it.",
    inputs: ["docs/CONCEPT.md"], outputs: ["art assets or draw code"],
    llm_recipe: "Procedural art from the palette; screenshot every scene and actually look at the renders.",
    manual_recipe: "Tilesets and sprites in the editor.",
    gate: { kind: "review", cmd: null, criteria: "Every screen screenshot approved; readable at target darkness." },
    depends_on: ["engine"],
  },
  {
    id: "audio", phase: "Game", name: "Audio pass",
    when: p => p.sound,
    why: "The pilot shipped fatiguing static and comic beeps precisely because no ear ever gated it. This gate must always be a human and must never be auto-passed.",
    inputs: ["docs/CONCEPT.md"], outputs: ["audio assets or synth code", "mixer"],
    llm_recipe: "Synthesised ambience with NO broadband-noise layers; ship a per-channel mixer; ticks felt, not heard.",
    manual_recipe: "A human with ears, in a DAW.",
    gate: { kind: "review", cmd: null, criteria: "A HUMAN listens for 10 minutes with headphones and approves. Never auto-pass this gate." },
    depends_on: ["engine"],
  },

  // ---- Release ------------------------------------------------------------
  {
    id: "playtest", phase: "Release", name: "Adversarial playtest",
    when: () => true,
    why: "An agent squad on fixed missions found 19 real issues in the pilot before any human playtester saw the build. The last place a bug is still cheap.",
    inputs: ["built game"], outputs: ["docs/findings.md"],
    llm_recipe: "Agent squad on fixed missions (new player, hostile input, economy, full run, mobile, persistence, performance) driving the real build; structured findings schema.",
    manual_recipe: "Human playtesters with the same mission list.",
    gate: { kind: "automated", criteria: "0 critical/major findings open; every fix re-verified against its repro." },
    depends_on: ["engine", "art", "audio", "calibrate", "sample_review", "budget", "fallback"],
  },
  {
    id: "balance", phase: "Release", name: "Balance & ending distribution",
    when: p => p.economy,
    why: "Catches thresholds set by intuition rather than by measuring a real completionist run against a real minimal run.",
    inputs: ["docs/findings.md"], outputs: ["data/tuning.json (revised)"],
    llm_recipe: "Measure a completionist run and a minimal run; set thresholds from the measurements, not from intuition.",
    manual_recipe: "Designer adjusts tuning.json from the same numbers.",
    gate: { kind: "review", cmd: null, criteria: "All endings reachable by plausible play styles; pressure matches design intent." },
    depends_on: ["playtest"],
  },
  {
    id: "build", phase: "Release", name: "Build & package",
    when: () => true,
    why: "One reproducible command that turns the repo into the thing a player runs, with size and policy budgets enforced.",
    inputs: ["everything"], outputs: ["build artifacts"],
    llm_recipe: null, manual_recipe: null, automated: true,
    gate: { kind: "automated", criteria: "Within size budget; packaging checks pass for every target." },
    depends_on: ["playtest", "balance"],
  },
  {
    id: "publish", phase: "Release", name: "Publish",
    when: () => true,
    why: "Inherently human: it involves accounts, store pages, and a decision that the thing is ready to be seen.",
    inputs: ["build artifacts"], outputs: ["live URL or store build"],
    llm_recipe: null,
    manual_recipe: "Upload the build, write the page copy, press publish.",
    gate: { kind: "review", cmd: null, criteria: "A named human confirms the live build runs and the page is correct." },
    depends_on: ["build"],
  },
);

export const PHASES = ["World", "Content", "Model", "Game", "Release"];

// Why a project might NOT need a step, for the panel's "excluded" list. Keyed
// by the profile field that turned it off.
const EXCLUDED_BECAUSE = {
  format_spec: "no model is trained here, so there is no training-data format to specify",
  corpus: "no model is trained here, so there is no training corpus to write",
  dataset: "no model is trained here",
  train: "no model is trained here",
  export: "no weights are shipped",
  prompt_spec: "the model is not a remote API",
  eval_set: "the model is not a remote API",
  budget: "the model is not a remote API",
  fallback: "the model is not a remote API",
  calibrate: "model output never decides what happens, only what is said",
  sample_review: "the model writes no player-facing text",
  maps: "the game has no spatial levels",
  story_data: "the game has no fixed story beats",
  tuning: "the game has nothing worth tuning",
  audio: "the game makes no sound",
  balance: "the game has nothing worth tuning",
  canon: "there is no authored world to keep consistent",
};

// Turn a profile into a pipeline. Pure: no model call, no filesystem.
//
// `depends_on` is pruned to steps that survived selection, which is what makes
// subtraction safe: dropping `maps` must not leave `engine` permanently blocked
// on a step that no longer exists.
export function selectSteps(profile) {
  const p = Object.assign({}, DEFAULT_PROFILE, profile || {});
  const chosen = CATALOGUE.filter(s => s.when(p));
  const ids = new Set(chosen.map(s => s.id));
  const steps = chosen.map(s => ({
    id: s.id,
    phase: s.phase,
    name: s.name,
    why: s.why,
    inputs: s.inputs,
    outputs: s.outputs,
    llm_recipe: s.llm_recipe,
    manual_recipe: s.manual_recipe,
    gate: {
      kind: s.gate.kind,
      cmd: s.gate.kind === "review" ? null : `make gate-${s.id}`,
      criteria: s.gate.criteria,
    },
    depends_on: s.depends_on.filter(d => ids.has(d)),
    ...(s.automated ? { automated: true } : {}),
  }));
  const excluded = CATALOGUE.filter(s => !ids.has(s.id)).map(s => ({
    id: s.id,
    name: s.name,
    reason: EXCLUDED_BECAUSE[s.id] || "not needed for this profile",
  }));
  return {
    steps,
    excluded,
    phases: PHASES.filter(ph => steps.some(s => s.phase === ph)),
  };
}

// The full pipeline.json for a new project.
export function buildPipeline({ name, description, profile }) {
  const { steps, phases } = selectSteps(profile);
  return {
    name,
    version: "1.0",
    description: description || `Pipeline for ${name}.`,
    profile: Object.assign({}, DEFAULT_PROFILE, profile || {}),
    worker_types: ["llm", "human", "automated"],
    phases,
    steps,
  };
}

export { CATALOGUE };
