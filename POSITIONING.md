# Positioning: gates, not generators

*Written 2026-09-03. Cites the landscape survey and Ghost in the Wreck
measurements in `PLAN.md`. Read aloud in under four minutes.*

## The thesis

Dynamic game content is not a generation problem. It is a gating problem.

A language model can invent a quest, a map, a line of dialogue, an item.
What decides whether it ships is whether a machine can prove, before the
player ever sees it, that the thing is playable, reachable, in-canon, and
non-embarrassing. The generator is commodity — every studio can call an
API. The validator is the product, and almost nobody in games is building
one.

Two independent academic studies of LLM-powered NPCs land on the same
finding from different directions. An ICIDS/Springer case study of
Mantella in Skyrim found immersion and agency rose, but "technical
integration issues damaged immersion and believability when LLM
capabilities exceeded game design constraints." A VR interrogation study
(arXiv 2507.10469, 18 participants, GPT-4 Turbo) scored believability
6.67/10, with *agency* the weakest sub-score at 5.34/10 — the model talks
fine, it just can't act on what it says. An NPC offers to meet you at the
mill; there is no mill; the game cannot bind the offer to anything real.
That is not a model-quality failure. It is an unvalidated-binding failure,
and it is the same failure both studies independently found.

## Three differentiators

**1. In-process small models as mechanics, not chatbots.** Judging beats
generating at small scale: log-prob style scoring hit 85% top-1 accuracy on
held-out paraphrases in Ghost in the Wreck (2.9M-parameter transformer,
trained from scratch), which turns "type anything" into a real mechanic
that is visibly unscriptable. A model that small embeds directly in a
game's own process — 4 MB of int8 weights, no server, no API key, no
per-player cost — a category difference from the 7 GB remote-brain installs
every shipped Bethesda AI-NPC mod requires today. Scoring a single
candidate is one forward pass, not a generate+STT+TTS round trip, so it's a
different *class* of latency, not a percentage improvement on one.

**2. Gated dynamic assets.** Quests, maps, dialogue and items generated as
data, then passed through an executable validator before the player sees
them, with a handwritten fallback whenever the gate fails. Never hard-gate
the critical path on model output. This is the lesson both academic studies
above independently rediscovered, and it's already built: Ghost in the
Wreck's format parser, flood-fill map lint, PyTorch↔JS parity test, and
calibration harness are exactly this pattern, proven on a shipped game.

**3. Numbers, in a field of vibes.** Every claim ships with a measured
figure and a script that reproduces it. This document is the first
instance of that habit; the table below is the reusable artifact.

## Competitive landscape

| Project | Game | Endorsements* | Version | Last updated | Architecture |
|---|---|---|---|---|---|
| Mantella | Skyrim SE | 3,206 | 0.14 | 2026-04-28 | STT → LLM → TTS via SKSE DLLs; cloud or local backend |
| CHIM | Skyrim SE | 1,135 | 3.2.6 | 2026-09-03 | Requires DwemerDistro, a bundled Linux distro, as the AI backend |
| Mantella | Fallout 4 | 224 | 0.13.0 | 2025-03-31 | F4SE + Address Library; ~7 GB base install; 6 GB free RAM/VRAM for a local model. Stale 17 months — the direct incumbent. |
| Numen | Fallout: New Vegas | 43 | 1.7.1 | 2026-08-17 | xNVSE + JIP LN NVSE; cloud or local (Gemma 4 12B, ~2 s) |

*\*Endorsements are a Nexus engagement proxy, not a download count — Nexus
does not expose downloads publicly. Re-verify current numbers on the mod
pages before citing this table outside this program.*

Every mod above is a remote-brain architecture: the game talks HTTP to a
7B+ model server plus separate TTS/STT services, on a multi-gigabyte
install. **None of them publishes any evaluation of output quality** — no
benchmark, no accuracy metric, no A/B test. The sharpest illustration:
Mantella's author fine-tuned and shipped a Llama-3-8B on 8,800+ real
interactions, then deprecated it as "performs worse than newer,
non-fine-tuned models" — with no numbers behind the claim. The only
quantified figures anywhere in that project are latency *targets* (aim for
an LLM under 0.5 s), not measurements of what shipped.

*No widely-used Bethesda AI mod embeds its model in-process today, as far
as this survey found — worth re-confirming immediately before repeating
that claim to a studio or in public.*

## Six studio objections, answered with numbers

| Objection | Answer | Measured / sourced |
|---|---|---|
| **Cost** | The model runs client-side; there is no per-player API bill and no inference server to operate. | 4 MB int8 weight footprint at 2.9M params (fits the 16 MB page/mod budget up to ~10M params) — Ghost in the Wreck, `AGENT-LEARNINGS.md` §2 |
| **Latency** | Judging is one forward pass over a short candidate, not a full generate+STT+TTS loop — a different latency class, not a percentage cut. | ~100 tok/s pure-JS inference on a laptop-class core, Ghost in the Wreck, vs. **6.9 s mean** (range 2.0–24.4 s) full interaction loop measured for a remote-brain NPC — arXiv 2507.10469 |
| **Determinism** | A parity test forces the runtime engine to reproduce the training-time model's output exactly; thresholds are derived, not guessed, and re-derived after every retrain. | JS engine reproduces PyTorch's top-10 logit ids and ordering exactly on a fixed prompt set — Ghost in the Wreck parity test, `AGENT-LEARNINGS.md` §7 |
| **Safety** | Nonsense input is caught by a cheap, reliable signal before it ever reaches a player-facing response, and the reply to nonsense is itself in-character, not an error state. | Gibberish separates cleanly on tokens/char ratio: ≥0.74 for nonsense vs ≤0.43 for real English, fully separated in calibration — `AGENT-LEARNINGS.md` §6.3 |
| **Certification** | Weights are self-trained on an authored corpus, never third-party voice data; the model card exposes a live next-token probability readout so the mechanic is auditable in-game, not a black box. | 85% top-1 accuracy on fresh (held-out) paraphrases, from a calibration harness re-run after every retrain, not a one-off number — Ghost in the Wreck, `AGENT-LEARNINGS.md` §6.2 |
| **Failure modes** | Generated content never reaches a player without passing an executable gate first, and failures fall back to handwritten content rather than breaking the critical path. | A 9-mission adversarial playtest squad found 19 real pre-launch issues (including an XSS render-sink and a dead finale button) before any human playtester saw the build — Ghost in the Wreck, `AGENT-LEARNINGS.md` §9 |

## Status

This draft satisfies milestone M0.2's content requirement — thesis, three
differentiators, competitive table, six-objections table, each answer
sourced to a measured figure rather than an opinion. It is marked
`in_progress`, not `done`, in `PLAN.md`: the milestone's gate is a review
gate ("read aloud in under four minutes," approved by Jonas), which this
agent cannot self-certify. Two claims are explicitly flagged above as
needing re-verification before external use: the Nexus endorsement figures
(proxy, not downloads) and the "no widely-used Bethesda AI mod embeds
in-process" claim (asserted from the current survey, not exhaustively
checked against every mod on Nexus).
