# Building a game around an embedded LLM — agent playbook

Learnings from Ghost in the Wreck (Aug 2026): a browser game with a 2.9M-param
transformer trained from scratch, embedded as int8 weights, inferenced in pure
JS. Written for the agent building the next one. Paths and numbers refer to
that project (/home/claude/ghostwreck) so you can lift code directly:
model/model_def.py, model/prepare.py, model/train.py, model/export.py,
game/lm.js, test/calibrate.js, test/playtest_workflow.js.

## 1. Strategy: design the game around the model's weaknesses

A from-scratch model at 1-5M params speaks in-style but dreamlike: real words,
broken grammar, no factual reliability. Do not fight this; cast it. A damaged
ship-mind, an oracle, a ghost, a dream — fictions where strange speech is
correct. Never promise Q&A competence. The showcase mechanics that DO work at
this scale, in order of reliability:

1. Judging (log-prob scoring of player text under prompt prefixes) — the star.
   5-way style classification hit 85% top-1 on fresh paraphrases. It makes
   "type anything" a mechanic and is visibly unscriptable.
2. Conditional generation in trained formats (logs, replies) — good enough
   with tight sampling and cleanup; unique per run, which players notice.
3. Gibberish detection — trivially reliable via tokens-per-char (see 6.3).
4. Embedding similarity (mean-pooled hidden states vs anchor centroids) —
   weak but usable for coarse A/B semantic intent. Test before you trust it.
5. Conditional likelihood of anchor CONTINUATIONS ("which reply is more
   probable after the player's line") — DID NOT WORK at this scale. No
   separation. Don't budget a mechanic on it without measuring first.

Keep one fixed-text channel for story-critical beats (we embedded 5 canonical
"archive" recordings). Generated text carries atmosphere; hand-written anchors
carry plot. Players cannot tell where the seam is.

## 2. Feasibility numbers (calibrate your plan against these)

- 2 CPU cores, PyTorch: ~5,700 tok/s train throughput on a 2.9M model,
  batch 24x256. A useful model = 30M+ tokens seen = ~2.5 h. Budget wall-clock.
- Corpus need: val loss was still falling when 425k tokens ran out. Half that
  corpus bottomed at val 3.08; full corpus reached 2.80. More clean data was
  the single biggest quality lever. Target >= 400k tokens (~1.2 MB text);
  more is better.
- Pure-JS inference (typed arrays, unrolled matvec, KV cache): ~100 tok/s on
  a laptop-class core for 2.9M params. Comfortably playable; phones ~3-5x
  slower, still fine with streaming display.
- int8 weights + scales ≈ params in bytes; base64 x1.33. A 2.9M model = 4 MB
  page weight. The 16MB artifact budget fits up to ~10M params.
- BPE vocab 1024 gives ~2.9 chars/token on stylized English. Prefer BPE over
  char-level: 3x less compute per char and whole-word spelling for free.

## 3. Corpus production (the creative core — spend effort here)

- Write CANON.md (world facts, timeline, PER-CHARACTER VOICE BIBLES with
  concrete tics and vocabulary) and FORMAT.md (exact sample grammar, marker
  syntax, length bounds, "no dashes/unicode", separation rules) BEFORE
  spawning writers. Every writer reads both. This is what made 26 parallel
  agents produce a coherent single world with a 100% parse rate.
- Fan out one agent per slice (per character's logs, per dialogue theme,
  voice lines, system text). ~30-45 KB of handcrafted text per agent is
  realistic. Two rounds: after training round one, you'll know what the model
  lacks (we went dialogue-heavy in round two, and added a gibberish->static
  reply slice that trained the model to handle nonsense IN CHARACTER).
- Make voices MECHANICALLY distinct (vocabulary, sentence length, tics like
  "Reyne out."), not just tonally — the classifier can only see statistics.
- Simple, clean, short sentences train a small model better than ornate prose.
  Say so in the writer prompts.
- Validate ruthlessly in prepare.py: regex-parse every sample, dedupe, report
  rejects. Split samples on the [END] marker, not on blank lines (multi-
  paragraph samples otherwise shatter — cost us 30 samples in round one).
- Free augmentation: extract 30-140 char sentences from each character's logs
  as extra [VOICE:X] lines (capped per author for balance). Massively feeds
  the classifier with zero extra writing.

## 4. Model and training decisions that paid off

- Special tokens for every structural marker ([END], [HEAR], [ECHO],
  [VOICE:X], [LOG:X:D). Exact stop conditions, cheap prefixes, no marker
  leakage. Ban all specials except [END] at generation time.
- Digits as single tokens -> day numbers and counts generalize.
- Weight tying (emb = head) saves ~200k params at vocab 1024.
- Time-budgeted cosine schedule: measure step time on the fly, fix total
  steps to fit the wall-clock budget (HOURS env var).
- Checkpoint every 250 steps, keep best-by-val. Small corpora overfit HARD
  (train loss 1.0 while val rises); best-val checkpointing is your safety
  net, and watching val tells you when more data beats more steps.
- Dropout 0.1 for the data-doubled run; sample-type weighting (dialogue x2)
  to bias toward the gameplay-critical distributions.
- Val loss is a compass, not the goal: eyeball generations at multiple
  checkpoints. We killed a run 40% through once val plateaued; the best.pt
  guard means an early kill costs nothing.

## 5. The tokenization trap (the most important single bug)

Prompts and scoring prefixes MUST tokenize exactly as training text did.
BPE attaches the leading space to the following word (" the" is one token), so:

- WRONG: generate("[VOICE:KIT] ") — the dangling " " token is off-
  distribution; the model often emits [END] immediately (our hint feature
  silently returned empty ~50% of the time) or degenerate text.
- RIGHT: generate("[VOICE:KIT]") and let the model emit " word" itself.
- WRONG: scorePrefixes(prefix="[VOICE:KIT] ", text="The crew...") — text
  encodes "The" spaceless, unlike training.
- RIGHT: prefix="[VOICE:KIT]", text=" The crew..." — fixed +10 points of
  classifier accuracy and eliminated our worst-separated character.

Corollary: normalize player input to the training distribution (sentence case,
terminal punctuation) before scoring. Lowercase player text scores erratically
against a capitalized corpus.

## 6. Judgment mechanics: recipes

### 6.1 Style classifier (doors)
avg log P(text | [VOICE:X]) per candidate; softmax over candidates with a
CALIBRATED temperature (ours: 12). Threshold on argmax probability (ours:
0.28; relax per-character if calibration shows one voice is weakly separable).
Display the full distribution as live bars — it is the single best "this is a
real neural net" moment in the game.

### 6.2 Calibration harness (non-negotiable)
A Node script that loads the SHIPPING JS engine + weights and measures:
corpus-line accuracy, fresh-paraphrase accuracy (write these yourself — they
are the real test), per-class misses, gibberish separation, and derived
temperature/thresholds written to a calibration.js the game imports. Re-run
after every retrain; thresholds do not survive retraining.

### 6.3 Gibberish gate
tokens/chars ratio: nonsense shatters into byte-fallback tokens (>=0.74)
vs real English (<=0.43). Cleaner than any log-prob floor; combine both.
Also seed the corpus with gibberish->"your voice is static" pairs so the
REPLY to nonsense is also in-character.

### 6.4 Semantic intent (endings)
Mean-pool the final-layer hidden state over the text, cosine against anchor-
sentence centroids per intent. Weak signal — verify separation on a written
probe set, place the boundary empirically, and back it with a non-model
resource (our trust score) so a misread degrades gracefully into an adjacent
ending rather than a wrong-feeling one.

## 7. Pure-JS inference engine

- f32 dequantized weights in Float32Arrays; 4x-unrolled matvec; per-head
  attention over a KV cache. ~400 lines total, no deps. Parity-test it:
  export writes dequantized values back into PyTorch and dumps top-10 logits
  for a fixed prompt; the JS side must reproduce ids and ordering exactly.
- Cooperative scheduling: yield every ~11 ms. Race requestAnimationFrame with
  a setTimeout(60) — rAF alone stalls in occluded tabs (a playtester lost 6
  minutes to this).
- Stream tokens into the UI; ~100 tok/s already IS the typewriter effect.
- Seed RNG per (feature x entity x run) for unique-but-reproducible content.
- Post-process generations: strip trailing marker fragments, leading debris,
  stray brackets; trim to the last sentence boundary. Cheap, hides most
  small-model embarrassments.

## 8. Pipeline discipline

- Prove the WHOLE pipeline on a 40-step throwaway model before the real
  training run: prepare -> train -> export -> parity -> in-browser speed. We
  caught export/JS bugs in minutes instead of after 2.5 hours.
- Keep training a nohup background job with a log; build the game while it
  runs. A stub fallback in the LM wrapper (keyword classifier + canned text)
  lets the entire game be developed and UI-tested before weights exist.
- ASCII-map decks + a flood-fill lint (spawn reachability, entity
  reachability, void leaks) catches level bugs instantly. Never hand-verify
  maps.
- Artifact CSP: no external scripts/assets except Google Fonts (with a real
  fallback stack). Single-file build script that inlines everything and
  strips module-export shims; keep a dev index.html with separate files.

## 9. Multi-agent usage that worked

- Corpus writers: 13 agents/round, strict spec docs, each returns structured
  stats and writes files directly to disk. Two rounds, ~1.4M agent tokens
  total, the decisive quality investment.
- Adversarial playtesters: 9 agents, each a narrow mission (new-player,
  doors, hostile input, economy, full-run, mobile, persistence, model
  quality, performance), Playwright boilerplate + game API cheat-sheet in
  the prompt, structured findings schema with severities and repro steps.
  They found 19 real issues including the trailing-space bug, a dead finale
  button, an XSS sink in the journal renderer, and the rAF stall. Worth it.
- Give playtesters permission to teleport/state-poke for deep tests but
  require at least one honest no-cheat run.
- Workflow resume (resumeFromRunId) recovers cleanly from rate-limit
  failures: completed agents replay from cache, only failures re-run.

## 10. Game-design learnings specific to LLM games

- Pause resource drain while any reading/dialogue overlay is open. Never tax
  the player for engaging with the model's text.
- Every model latency needs diegetic cover: "reconstructing fragment...",
  "ECHO is listening...". Players read 2 s of themed waiting as atmosphere
  and 2 s of silence as a hang.
- Fail-forward on judgment mechanics: small cost + in-character rebuff +
  hints after 2 fails (generate hints with the model itself). Never hard-gate
  the critical path on classifier perfection; keep optional doors stricter.
- Tell players it's real, in-fiction and out: a "model card" panel with a
  live next-token probability probe converts skeptics, and fine-print lines
  under each mechanic ("it learned each speaker from their logs; no keywords")
  teach the mechanic and market the tech at once.
- Trust/affinity economies inflate: measure a completionist run and set
  ending thresholds from it, not from intuition.
- Every text field that renders player or model text: escape it. Model
  output goes through innerHTML sinks too.

## 11. What I would do differently next time

- Write the two-round corpus plan from the start; round one alone was ~40%
  of final quality.
- Add a few "instruction-ish" trained formats (e.g. [ASK:TOPIC] -> short
  answer) to give dialogue more apparent comprehension.
- Consider 4-5M params / vocab 2048 if targeting desktop-first: the 16 MB
  budget allows it and val was data-bound, not capacity-bound, at 2.9M.
- Bench int8 dot-products in JS (dequantize-free inference) for phones.
- Build the calibration harness BEFORE designing door thresholds; I tuned
  twice because mechanics preceded measurement.
