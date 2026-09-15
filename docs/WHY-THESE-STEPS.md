# Why these steps exist

*Reverse-engineered 2026-09-11 from the pilot pipeline, which arrived fully
formed in `a7f0a8c` with no stated rationale. Nothing here is new design: it is
the rule that the 19 existing steps turn out to obey, written down so a second
project can be scoped deliberately instead of by analogy.*

The phases are not a taxonomy of game production. They are **an order of
de-risking**, and each step is a place where one specific failure — one that
actually happened while building Ghost in the Wreck — gets caught at its
cheapest moment.

## The five rules that generate the steps

**1. A step exists to convert an opinion into something a later step can check.**

`concept` makes the premise a document `canon` can be held against. `canon`
makes taste into facts. `format_spec` makes prose rules into a parser with an
exit code. Watch where the gates change kind: World is human-gated *except*
`format_spec`, which is the bridge — the whole job of that step is to end the
era of human gating. That is why it is last in its phase, and why a project
that never machine-checks its text does not need it.

**2. A step exists wherever a specification precedes a fan-out.**

Why are `canon` and `format_spec` separate steps rather than notes inside
`corpus`? `AGENT-LEARNINGS.md` §3 says it outright: writing both *before*
spawning writers "is what made 26 parallel agents produce a coherent single
world with a 100% parse rate." The step is a synchronisation point. Delete it
and parallel workers diverge — LLM or human, identically.

*Generalises to:* any step that precedes parallel work is a spec step, and its
gate is "can the parallel output be checked against this?"

**3. A step splits wherever a cheap failure would otherwise force expensive rework.**

`dataset → train → export → calibrate` is not four names for making a model. It
is four failures with wildly different repair costs:

| Step | Its failure | Cost to redo |
|---|---|---|
| dataset | parse rejects, unbalanced augmentation | minutes |
| train | val loss plateaus or overfits | ~2.5 h wall clock |
| export | quantised JS silently disagrees with PyTorch | minutes, but invisible without the parity test |
| calibrate | thresholds wrong — and they never survive new weights | minutes |

Fused into one step, fixing a threshold would mean retraining. The split exists
so the cheap fix stays cheap. This is the most transferable rule in the file.

**4. A step exists wherever the only available gate is a different sense organ.**

`art` (eye), `audio` (ear), `sample_review` (reading), `balance` (judgement) are
not split from `engine` because they are different work. They are split because
each needs a different *instrument* to prove done. Audio is the documented case:
the first synthesised pass shipped fatiguing static "precisely because no ear
ever gated it." A step whose gate you cannot name is a step you have not yet
justified.

**5. The phases are a parallelism seam, not a chronology.**

`Content → Model` and `Content → Game` are two independent branches off the same
canon, and the factory says so: "Engine work never waits for the model: a stub
LM backend lets the whole game be built and tested before weights exist." The
columns exist so you can see what is unblocked, not what comes next.

## What each phase therefore *is*

| Phase | Its artifacts | What can prove them done | Why it is here |
|---|---|---|---|
| **World** | documents | a named human | nothing is machine-checkable yet; the phase's job is to end |
| **Content** | data (JSON/text) | schema + lint | engine-neutral, shared byte-for-byte across builds |
| **Model** | weights | measurement against a threshold | statistical, so gates are numbers; rework is expensive and staged |
| **Game** | code + assets | tests, then eyes, then ears | the branch that can run before the model exists |
| **Release** | builds | the whole system, then a person | last place an error is still cheap to find |

Read top to bottom it is one gradient: **human judgement → schema validation →
statistical measurement → executable tests → human judgement again.** That is
the real spine, and it is the same claim `POSITIONING.md` makes — gates, not
generators.

## The payoff: when does a project need each step?

This table is the scoping rule. A step is in a project's pipeline when its
condition holds, and not otherwise.

| Step | Exists to prevent | Include when |
|---|---|---|
| concept | building a game whose mechanics don't actually need the model | always |
| canon | incoherent world across parallel writers; voices no classifier can separate | more than one authored voice, or any writing fan-out |
| format_spec | unparseable training data, discovered at dataset time | the project trains or fine-tunes on authored text |
| corpus | thin or off-spec training data | same as format_spec |
| maps | unreachable content, void leaks, engines disagreeing | the game has spatial levels |
| story_data | generated text carrying plot, and drifting | the game has fixed narrative anchors |
| tuning | balance numbers buried in code | the game has an economy or resources |
| dataset | silent data loss between corpus and training | training from scratch |
| train | a model that never converges | training from scratch |
| export | runtime engine disagreeing with the training engine | shipping weights into a client runtime |
| calibrate | thresholds guessed rather than derived | model output gates gameplay |
| sample_review | systemic generation failures shipping unseen | the model writes player-facing text |
| engine | — | always |
| art | unreadable screens | always |
| audio | fatiguing audio shipping unheard | the game has sound |
| playtest | shipping with critical bugs | always |
| balance | thresholds set by intuition | the project has tuning |
| build | — | always |
| publish | — | always |

## The gap this exposes

Applying the table to the three plausible architectures:

- **No language model.** Drop format_spec, corpus, dataset, train, export,
  calibrate, sample_review. Twelve steps remain and World collapses to
  concept + canon. The factory handles this by subtraction, fine.
- **Embedded, trained from scratch.** All nineteen. This is the pilot, and the
  only case the factory currently describes.
- **Remote / API model.** Drop dataset, train, export — there are no weights.
  But `calibrate` and `sample_review` still apply, and four steps that *should*
  exist have no equivalent anywhere in the pipeline: a prompt/system-message
  spec, a held-out eval set, a cost-and-latency budget, and a validated
  fallback path for when the API fails or returns something the gate rejects.

That third row is the most likely second project, and the pipeline cannot
currently express it. Adding those four steps is what would make the factory
architecture-agnostic rather than merely project-agnostic.
