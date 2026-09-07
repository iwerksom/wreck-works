# PLAN — Language Models in Games

**Owner:** Jonas Schoustrup-Thomsen
**Created:** 2026-09-03
**Horizon:** 24 weeks, 2026-09-07 → 2027-02-21
**Capacity:** 25 h/week (20 h committed, 5 h buffer)
**Goal:** Land work building games with language models in them — by being the person with the most shipped, measured evidence in the niche.

This file is both the human plan and the machine state. Prose above the state
block is the contract with yourself; the `plan-state` JSON block at the bottom is
what the plan agent reads and rewrites. Keep them consistent: when the JSON
changes materially, update the prose in the same commit.

---

## 1. The thesis

### What already exists (surveyed 2026-09-03)

| Project | Game | Endorsements | Version | Last updated |
|---|---|---|---|---|
| Mantella | Skyrim SE | 3,206 | 0.14 | 2026-04-28 |
| CHIM | Skyrim SE | 1,135 | 3.2.6 | 2026-09-03 |
| **Mantella** | **Fallout 4** | **224** | **0.13.0** | **2025-03-31** |
| Numen | New Vegas | 43 | 1.7.1 | 2026-08-17 |

Mantella is the incumbent: a speech-to-text → LLM → text-to-speech pipeline wired
into the game through script-extender DLLs, running since August 2023 (GitHub:
378 stars, 89 forks, 92 open issues, 617 commits, 3 contributors). CHIM is the
heavier rival and ships an entire Linux distro (DwemerDistro) as a prerequisite.
Both are remote-brain architectures: the game talks HTTP to a server running a
7B+ model, plus TTS and STT services, on a multi-gigabyte install. Mantella's own
Fallout 4 docs put the base install at ~7 GB and require 6 GB of free RAM/VRAM
for a local model.

**Endorsements are not downloads.** Nexus does not expose download counts
publicly; verify the real numbers on the mod pages before citing any of this
externally.

### What is not measured — which is the opening

There is no published evaluation of output quality for any of these mods. No
benchmark, no accuracy metric, no eval suite, no A/B against a baseline. The
sharpest illustration: Mantella's author fine-tuned a Llama-3-8B on 8,800+
Alpaca-style player↔NPC interactions, shipped it, and now deprecates it with
"performs worse than newer, non fine-tuned models" — **with no numbers
substantiating the claim.** A model trained, shipped and retired on vibes.

The only quantified claims in the whole project are latency targets: aim for an
LLM under 0.5 s; "Lazy" lip-file generation saves ~0.5 s; "Fast Response" mode
saves ~0.5 s. PC Gamer's assessment of the v0.14 overhaul: it "works," but is
"stilted in places," "clearly rudimentary computer babble," "an extremely cool
gimmick," AI "as wide as the ocean but as deep as a puddle."

The two real measurements in this space come from academics, not modders:

- **ICIDS/Springer, "LLM-Powered NPCs"** — a three-phase case study (interviews →
  play sessions with Mantella in Skyrim → follow-up interviews, thematic
  analysis). Qualitative. Finding: LLM NPCs raised immersion, agency and a sense
  of recurring novelty, *but* technical integration issues damaged immersion and
  believability **"when LLM capabilities exceeded game design constraints."**
- **arXiv 2507.10469** — GPT-4 Turbo VR interrogation NPCs, 18 participants. Full
  interaction loop **6.9 s mean, range 2.0–24.4 s** (STT 1.37 s, LLM 3.11 s, TTS
  2.38 s), climbing as history is reprocessed each turn. SUS 79.4/100.
  Believability 6.67/10 — strong on social relationships (8.24) and behaviour
  (8.09), weakest on **agency (5.34)** and personality (5.74).

Agency scoring lowest, and "capabilities exceeded game design constraints," are
the same finding twice: the talking is fine, the *doing* is where it breaks. An
NPC offers to meet you at the mill; there is no mill; the game cannot act on the
offer. That is not a model-quality failure. It is an unvalidated-binding failure.

### Against that, what is already proven here

Ghost in the Wreck, end to end: a 2.9M parameter transformer trained from
scratch, int8, 4 MB, pure-JS inference at ~100 tok/s, no server, no install, no
API key — and 85% top-1 style classification on fresh paraphrases, *measured*,
with a calibration harness that reruns after every retrain.

The gap nobody has closed, and the one worth owning:

> **Dynamic content is not a generation problem. It is a gating problem.**
> A model can invent a quest, a map, a line of dialogue, an item. What decides
> whether it ships is whether a machine can prove, before the player sees it,
> that the thing is playable, reachable, in-canon and non-embarrassing. The
> generator is commodity. The validator is the product.

That is a claim you can already back with receipts: the format parser, map
flood-fill lint, PyTorch↔JS parity test, calibration harness and the 9-mission
adversarial playtest squad from Ghost in the Wreck are exactly this, and the
FACTORY-PIPELINE doc already says the deep lesson out loud — *the gates matter
more than the workers.*

Everything below is in service of turning that sentence into something a studio
can see, run, and hire.

### The three differentiators to lead with

1. **In-process small models as mechanics, not chatbots.** Judging beats
   generating at small scale — log-prob style scoring hit 85% top-1 on fresh
   paraphrases in Ghost in the Wreck, which makes "type anything" a real
   mechanic that is visibly unscriptable. A ~5 MB model inside the mod's own DLL
   is a category difference from a 7 GB server install: **zero setup, works
   offline, no API key, no per-player cost.** And one forward pass over a
   candidate — no generation, no STT, no TTS — is a different latency *class*
   from 6.9 s, not a percentage off it. It fits inside a dialogue camera cut.
   No widely-used Bethesda AI mod works this way today; verify again before
   claiming it in public.
2. **Gated dynamic assets.** Quests, maps, books, barks generated as *data* and
   passed through executable validators before they reach the player, with a
   handwritten fallback when the gate fails. Fail-forward, never hard-gate the
   critical path — the lesson you already paid for, and the one the literature
   above independently arrived at.
3. **Numbers, in a field of vibes.** Every claim you make ships with a measured
   figure and a rerunnable script. Nobody else in this niche does this, and it
   is the cheapest possible differentiator because you already work this way.

### What this means for the job hunt

Studios' objections to runtime LLMs are boringly consistent: cost, latency,
determinism, safety, certification, and "what happens when it says something
insane." Every one of those is answerable with a number you will have measured
yourself. The deliverable that converts is not a demo; it is a demo plus a
one-page table of measured numbers. Write that table early (M0.2) and keep it
current — it is the single most reusable artifact in this plan.

---

## 2. The five tracks

| Track | Name | Goal |
|---|---|---|
| **A** | **Factory** (wreck-works) | Turn the harness from a personal tool into an engine-neutral pipeline that drives a browser game, a Godot game *and* a Fallout 4 mod from `pipeline.json` files. |
| **B** | **Own games** | Ghost in the Wreck (shipped) → Godot game v2 with runtime-generated, gate-validated quests and maps. |
| **C** | **Mods** | A zero-install embedded-model Fallout 4 mod on Nexus, then a quest-generating v2. |
| **D** | **Community** | Convert the contacts you've already reached out to into two real collaborations with named modders/indies. |
| **E** | **Evidence & career** | Positioning doc, devlogs, case studies, talk, CV, applications — running continuously, not at the end. |

Track E starts in week 1 and applications start in **week 9**, not week 24.
Applying while building is what turns a portfolio into interviews; applying after
building wastes the two months where your material is freshest.

---

## 3. Why Fallout 4, and how to not drown in it

Chosen over Skyrim, New Vegas, RimWorld, Stardew and Minecraft, for four reasons:

1. **You know these games.** You have played every Fallout but 76. Judging
   whether a mechanic *feels* right is not a skill you can substitute, and it is
   what separates a tech demo from a mod people install twice.
2. **The incumbent is stale and thin.** Mantella's Fallout 4 port sits at 224
   endorsements on v0.13.0, untouched since March 2025. There is no CHIM
   equivalent on Fallout at all. On Skyrim you would be arguing against a
   3,206-endorsement mod updated four months ago; on Fallout 4 the field is open.
3. **The toolchain is modern.** F4SE plus CommonLibF4 mirrors the Skyrim setup
   almost exactly — working CMake/vcpkg templates exist (`libxse/commonlibf4-template`,
   `Deweh/CommonLibF4-NG`), alongside the Creation Kit, Address Library for F4SE
   Plugins, and MO2. Close to what a studio codebase feels like.
4. **FO4's dialogue system is its most criticised feature.** The four-option
   wheel and the voiced protagonist are the standing complaint about the game.
   Giving the player real typed input is a *fix*, not an addition — an easier
   sell to an existing audience than a novelty bolt-on.

**The honest cost:** Fallout 4's AI-mod audience is roughly a tenth of Skyrim's.
Accept it. Less noise, cleaner differentiation, and the evidence you are building
is for studios and collaborators, not for a download counter.

Mitigations against the toolchain eating a month, in order:

- **Prove the whole loop on a throwaway first.** Exactly the discipline from
  AGENT-LEARNINGS §8 ("prove the pipeline on a 40-step model"), applied to
  modding: ship a small, genuinely useful, model-free mod to Nexus in the first
  two weeks. You will learn packaging, ESP/ESL flags, load order, MO2 profiles,
  permissions, the Nexus page, and user support — none of which is about AI, all
  of which will otherwise ambush you later.
- **Stub brain before real brain.** Build the mod's full interaction loop against
  a keyword-classifier stub, same as `lm.js`'s stub fallback. The mod must be
  complete and playable before weights exist.
- **Papyrus for glue, C++ for the model.** Papyrus can't do the work — no native
  HTTP, no threads, no math throughput. The DLL (CommonLibF4, Visual Studio 2022,
  vcpkg, F4SE) holds the inference engine and exposes native functions to
  Papyrus; Simple Text Field gives you the text-input widget Mantella FO4 already
  relies on. Your JS engine is ~400 lines of typed-array matvec and KV-cache
  attention — a *direct* port to C++, and the parity test you already have
  proves the port.
- **Scope the mechanic to judging.** A persuasion check where the player types
  their line and the model scores it against speaker profiles is cheap (one
  forward pass per candidate, no generation, no TTS, no STT), latency-invisible,
  and demos in ten seconds. Generation-heavy features come after.

**Candidate mod concept (decide in M1.1):** *Smooth Talker* — replace Fallout 4's
persuasion checks, and optionally the dialogue wheel itself, with a line the
player types, judged by an embedded model against the NPC's disposition and
faction archetype, weighted by the player's Charisma. Diegetic framing: a pre-war
Vault-Tec personality-analysis subroutine running on the Pip-Boy — which gives
free cover for any latency *and* turns the live probability-bar readout, the
single best "this is a real neural net" moment, into an in-fiction Pip-Boy screen
rather than a debug overlay. One mechanic, a system every player already
understands, no TTS/STT, and a handwritten fallback line on every branch.

---

## 4. Phases

### P0 · Foundations (weeks 1–2, 40 h)
Get the plan agent running, get the Fallout 4 toolchain proven with a real Nexus
release, and write the positioning doc that everything else cites.
**Exit:** a mod page live on Nexus; `plan-lint` green; POSITIONING.md answering
six studio objections with measured numbers.

### P1 · The mod POC (weeks 3–6, 80 h)
Design → stub-brain vertical slice → C++ inference port with parity → corpus,
train, calibrate → release v1 with a model card.
**Exit:** a zero-install embedded-model mod on Nexus, calibration ≥80% top-1 on
fresh paraphrases, no crash reports from three clean-profile testers in 72 h.

### P2 · Factory v2 (weeks 7–10, 80 h)
Make the factory drive the mod. `mod-pipeline.json`, worker daemon, interactive
UI. Spike the quest schema and its solvability gate. Launch the job track.
**Exit:** the mod's entire build runs from the panel with green gates; 100
generated quests validated, five known-bad quests correctly rejected; first eight
applications out.

### P3 · Dynamic Godot game (weeks 11–16, 120 h)
The Godot v2 slice, with runtime quest generation and generated maps, both gated.
Benchmark embedded-own-model vs llama.cpp GDExtension (GDLlama / godot-local-llm)
and publish the numbers.
**Exit:** 200-run soak with zero unsolvable quests reaching a player; map lint
green on 500 generated maps; no sev-1 findings open from the adversarial squad;
six devlog posts public.
*Note: this phase straddles Christmas. That is deliberate — it is the phase with
the most slack in it.*

### P4 · Collaborations (weeks 17–20, 80 h)
Two fixed-scope two-week engagements with people from your outreach: "bring your
mod or game, I embed a model in it." Write both up as case studies. Prove the
factory is multi-project.
**Exit:** two shipped collaborations with named partners; factory runs both your
projects and a third with zero factory code changes.

### P5 · Ship and convert (weeks 21–24, 80 h)
Release the Godot game. Ship mod v2 with quest generation. Long-form technical
writeup and a talk submission. The concentrated application push.
**Exit:** game published; 15 targeted applications and 5 warm introductions;
program review written and the next six months decided.

---

## 5. Standing rules

These are non-negotiable, lifted from what already worked:

- **Every generated asset has an executable gate.** If you cannot write the
  validator, you do not ship the generator.
- **Recalibrate after every retrain.** Thresholds do not survive new weights.
- **Never hard-gate the critical path on model output.** Fail-forward: small
  cost, in-character rebuff, hint after two failures, handwritten fallback.
- **Audio is a human gate.** Ten minutes of listening, every time, forever.
- **Escape everything.** Player text and model text both reach render sinks.
- **Ship something public every two weeks.** A release, a devlog, a benchmark, a
  case study. The cadence is the marketing.
- **Measure before you design.** Build the calibration harness before you set a
  threshold; you already paid for this lesson twice.
- **One repo per project, git is the database.** Every artifact a file, every
  step a commit, every gate CI.

## 6. Risks

| Risk | Trigger | Mitigation |
|---|---|---|
| Fallout 4 toolchain eats a month | No DLL building by end of week 2 | Fall back to Papyrus-only mechanics for v1 and defer the C++ port to P2 |
| C++ inference port stalls | Parity test not passing by end of week 5 | Ship v1 with the stub brain as a "coming soon" beta; port continues in P2 |
| A Fallout 4 update breaks F4SE and every DLL plugin | Game patch ships; F4SE and Address Library lag behind | Pin and record the game version in M0.3; keep a depot-locked install and never auto-update the modding machine (Mantella hit exactly this on Skyrim in Aug 2026) |
| Nexus rejects or flags AI content | Page taken down or flagged | Read Nexus AI-content and Bethesda modding terms in M0.4 *before* the first release; ship weights as your own trained artifact with a model card, never third-party voice data |
| Collaborations don't materialise | Fewer than 2 partners committed by week 16 | Substitute two self-directed case studies against popular open-source mods |
| Solo scope creep on the Godot game | P3 milestones slipping two weeks | Cut to a single 20-minute vertical slice; the gate story matters more than content volume |
| Job market slower than expected | No interviews by week 16 | Shift weight from building to consulting/contract offers (Track D) and widen geography |
| Burn-out at 25 h/week on top of everything else | Two consecutive weeks under 15 h | The 20% buffer is real slack, not overflow capacity; drop a P4 collaboration before dropping the cadence |

## 7. How the plan agent should use this file

Read the whole file. Only ever rewrite the `plan-state` JSON block — the prose is
the human contract and changes deliberately, in a commit of its own. Specific
rules:

- Milestones are never deleted. Set `status: "dropped"` with a `note`.
- Append to `decisions` whenever scope, sequencing or a gate changes. Never edit
  a past decision.
- `evidence` on a milestone is a list of URLs or repo paths — this is what the CV
  and case studies are built from later, so fill it in at the moment of shipping.
- `actual_hours` is logged weekly. When a phase's actuals exceed its `hours`
  budget by more than 20%, flag it rather than silently re-planning.
- A milestone may only go to `done` when its gate passes. A `review` gate needs a
  recorded approver and date.
- Report weekly: what moved, what's blocked, hours vs budget, and the single next
  action per active track.

```json plan-state
{
  "plan_version": "1.0",
  "name": "Language Models in Games",
  "owner": "Jonas Schoustrup-Thomsen",
  "created": "2026-09-03",
  "updated": "2026-09-07",
  "horizon": {
    "start": "2026-09-07",
    "end": "2027-02-21",
    "weeks": 24
  },
  "capacity": {
    "hours_per_week": 25,
    "committed_hours_per_week": 20,
    "buffer_pct": 20,
    "total_committed_hours": 480
  },
  "thesis": "Dynamic game content is a gating problem, not a generation problem. Three differentiators: in-process small models used as mechanics (judging over generating, a different latency class from the 6.9s remote-brain loop); executable validators for every generated asset; and published measurements in a niche where nobody publishes any.",
  "landscape": {
    "surveyed": "2026-09-03",
    "summary": "All shipped Bethesda AI-NPC mods are remote-brain architectures (game -> HTTP -> 7B+ model server + TTS + STT, multi-GB install). None publishes any evaluation of output quality.",
    "competitors": [
      {
        "name": "Mantella",
        "game": "Skyrim SE",
        "endorsements": 3206,
        "version": "0.14",
        "updated": "2026-04-28",
        "architecture": "STT -> LLM -> TTS via SKSE DLLs; OpenRouter/OpenAI/KoboldCpp/LM Studio/Ollama/text-generation-webui",
        "github": {
          "stars": 378,
          "forks": 89,
          "open_issues": 92,
          "commits": 617,
          "contributors": 3
        }
      },
      {
        "name": "CHIM",
        "game": "Skyrim SE",
        "endorsements": 1135,
        "version": "3.2.6",
        "updated": "2026-09-03",
        "architecture": "Requires DwemerDistro, a bundled Linux distro, as the AI backend"
      },
      {
        "name": "Mantella FO4",
        "game": "Fallout 4",
        "endorsements": 224,
        "version": "0.13.0",
        "updated": "2025-03-31",
        "architecture": "F4SE + Address Library + Simple Text Field; ~7 GB base install; 6 GB free RAM/VRAM for a local model; 600+ described NPCs; up to 5 NPCs per conversation",
        "note": "Stale for 17 months. The direct incumbent."
      },
      {
        "name": "Numen",
        "game": "Fallout New Vegas",
        "endorsements": 43,
        "version": "1.7.1",
        "updated": "2026-08-17",
        "architecture": "xNVSE + JIP LN NVSE; OpenRouter/Gemini/MiniMax or local LM Studio/llama.cpp/Ollama/vLLM; recommends Gemma 4 12B at ~2s"
      }
    ],
    "caveat": "Endorsements are a proxy; Nexus does not expose download counts publicly. Verify before citing externally.",
    "quality_evaluation": {
      "published_benchmarks": "none found",
      "illustration": "Mantella fine-tuned Llama-3-8B on 8,800+ Alpaca-style player<->NPC interactions, shipped it, and now deprecates it as performing worse than newer non-fine-tuned models, with no supporting numbers.",
      "only_quantified_claims": "Latency targets: LLM under 0.5s; Lazy lip-file generation saves ~0.5s; Fast Response mode saves ~0.5s.",
      "press": "PC Gamer on v0.14: works, but stilted, rudimentary computer babble, an extremely cool gimmick, as wide as the ocean but as deep as a puddle."
    },
    "academic_evidence": [
      {
        "source": "ICIDS / Springer, 'LLM-Powered NPCs'",
        "method": "Three-phase case study: interviews, play sessions with Mantella in Skyrim, follow-up interviews, thematic analysis",
        "quantitative": false,
        "finding": "Immersion, agency and recurring novelty improved; technical integration issues damaged immersion and believability when LLM capabilities exceeded game design constraints."
      },
      {
        "source": "arXiv 2507.10469",
        "method": "GPT-4 Turbo NPCs in a VR interrogation sim, 18 participants",
        "quantitative": true,
        "latency_mean_s": 6.9,
        "latency_range_s": [
          2,
          24.4
        ],
        "latency_breakdown_s": {
          "stt": 1.37,
          "llm": 3.11,
          "tts": 2.38
        },
        "sus": 79.44,
        "believability_10": 6.67,
        "subscores": {
          "social_relationships": 8.24,
          "behaviour": 8.09,
          "intelligence": 7.99,
          "personality": 5.74,
          "agency": 5.34
        },
        "finding": "Latency grows as chat history is reprocessed each turn; agency is the weakest dimension."
      }
    ],
    "implication": "The talking is solved enough; the doing is not. Agency scoring lowest and 'capabilities exceeded game design constraints' are the same failure: unvalidated bindings between model output and what the game can actually act on."
  },
  "status_values": [
    "planned",
    "in_progress",
    "blocked",
    "done",
    "dropped"
  ],
  "tracks": [
    {
      "id": "A",
      "name": "Factory (wreck-works)",
      "goal": "Engine-neutral pipeline driving browser game, Godot game and Fallout 4 mod from pipeline.json files."
    },
    {
      "id": "B",
      "name": "Own games",
      "goal": "Godot game v2 with runtime-generated, gate-validated quests and maps."
    },
    {
      "id": "C",
      "name": "Mods",
      "goal": "Zero-install embedded-model Fallout 4 mod on Nexus, then a quest-generating v2."
    },
    {
      "id": "D",
      "name": "Community",
      "goal": "Two shipped collaborations with named modders or indie developers."
    },
    {
      "id": "E",
      "name": "Evidence & career",
      "goal": "Positioning, devlogs, case studies, talk, applications — continuous from week 1."
    }
  ],
  "phases": [
    {
      "id": "P0",
      "name": "Foundations",
      "weeks": "1-2",
      "start": "2026-09-07",
      "end": "2026-09-20",
      "hours": 40,
      "objective": "Plan agent running, Fallout 4 toolchain proven by a real Nexus release, positioning doc written.",
      "exit_criteria": "Mod page live on Nexus; plan-lint green; POSITIONING.md answers six studio objections with measured numbers.",
      "status": "in_progress"
    },
    {
      "id": "P1",
      "name": "The mod POC",
      "weeks": "3-6",
      "start": "2026-09-21",
      "end": "2026-10-18",
      "hours": 80,
      "objective": "Ship a zero-install embedded-model Fallout 4 mod.",
      "exit_criteria": "Mod on Nexus; calibration >=80% top-1 on fresh paraphrases; no crash reports from 3 clean-profile testers in 72h.",
      "status": "planned"
    },
    {
      "id": "P2",
      "name": "Factory v2",
      "weeks": "7-10",
      "start": "2026-10-19",
      "end": "2026-11-15",
      "hours": 80,
      "objective": "Factory drives the mod build; quest schema and solvability gate spiked; job track launched.",
      "exit_criteria": "Mod build runs from the panel with green gates; 100 generated quests validated and 5 known-bad rejected; 8 applications sent.",
      "status": "planned"
    },
    {
      "id": "P3",
      "name": "Dynamic Godot game",
      "weeks": "11-16",
      "start": "2026-11-16",
      "end": "2026-12-27",
      "hours": 120,
      "objective": "Godot v2 slice with runtime-generated, gated quests and maps.",
      "exit_criteria": "200-run soak with zero unsolvable quests reaching a player; map lint green on 500 maps; no sev-1 open; 6 devlogs public.",
      "status": "planned"
    },
    {
      "id": "P4",
      "name": "Collaborations",
      "weeks": "17-20",
      "start": "2026-12-28",
      "end": "2027-01-24",
      "hours": 80,
      "objective": "Two fixed-scope engagements embedding models in other people's projects.",
      "exit_criteria": "Two shipped collaborations with named partners; factory runs a third project with zero factory code changes.",
      "status": "planned"
    },
    {
      "id": "P5",
      "name": "Ship and convert",
      "weeks": "21-24",
      "start": "2027-01-25",
      "end": "2027-02-21",
      "hours": 80,
      "objective": "Release the game, ship mod v2, concentrated application push.",
      "exit_criteria": "Game published; 15 targeted applications and 5 warm intros; program review written.",
      "status": "planned"
    }
  ],
  "milestones": [
    {
      "id": "M0.1",
      "track": "E",
      "phase": "P0",
      "name": "Plan agent v1",
      "deliverable": "A standalone Claude skill (not committed inside any project repo) that reads a plan-state block from whichever PLAN.md the user points it at, reports status, helps plan the upcoming week (next actions per track given capacity, dependencies and blocked items), and writes back status/hours/evidence updates as a single clean commit in that plan's own repo. Proposed to and saved in Jonas's personal skill library, generalized to work across multiple different PLAN.md files, not just this one. tools/plan-lint.js stays in this repo as the local gate the skill (or CI) calls to validate this specific PLAN.md.",
      "outputs": [
        "PLAN.md",
        "tools/plan-lint.js"
      ],
      "gate": {
        "kind": "cmd",
        "cmd": "node tools/plan-lint.js PLAN.md",
        "criteria": "JSON block parses, schema valid, no orphan depends_on, phase hour sums match phase budgets, and an agent round-trip of a status change produces a diff touching only the intended keys."
      },
      "depends_on": [],
      "est_hours": 8,
      "actual_hours": 5,
      "status": "done",
      "evidence": [
        "repos/wreck-works/tools/plan-lint.js",
        "repos/wreck-works/PLAN.md — gate green: node tools/plan-lint.js PLAN.md",
        "plan-agent skill proposed to Jonas's personal skill library (not committed to this repo) — generalized to read any PLAN.md following this plan-state schema"
      ]
    },
    {
      "id": "M0.2",
      "track": "E",
      "phase": "P0",
      "name": "Positioning doc",
      "deliverable": "POSITIONING.md: the gating thesis, the three differentiators, a competitive-landscape table (Mantella/CHIM/Numen adoption, architecture and the absence of any published evaluation), and a table answering the six standard studio objections (cost, latency, determinism, safety, certification, failure modes) with numbers measured from Ghost in the Wreck and cited from arXiv 2507.10469.",
      "outputs": [
        "POSITIONING.md"
      ],
      "gate": {
        "kind": "review",
        "cmd": null,
        "criteria": "Six objections each answered with a measured number and its source, not an opinion. Read aloud in under four minutes."
      },
      "depends_on": [],
      "est_hours": 6,
      "actual_hours": 5,
      "status": "in_progress",
      "evidence": [
        "repos/wreck-works/POSITIONING.md (draft complete, awaiting review sign-off per the review gate)"
      ]
    },
    {
      "id": "M0.3",
      "track": "C",
      "phase": "P0",
      "name": "Fallout 4 dev environment",
      "deliverable": "Working toolchain: Fallout 4 + F4SE + Address Library for F4SE Plugins + MO2 profiles + Creation Kit + FO4Edit + Papyrus compiler + Visual Studio 2022 + vcpkg + CommonLibF4 (libxse/commonlibf4-template or Deweh/CommonLibF4-NG), with a hello-world F4SE DLL and one native function callable from Papyrus. Pin the game version and record it; F4SE breaks on game updates.",
      "outputs": [
        "repos/fo4-hello/",
        "docs/FO4-TOOLCHAIN.md"
      ],
      "gate": {
        "kind": "cmd",
        "cmd": "xmake build && node tools/verify-dll.js",
        "criteria": "Build produces a 64-bit DLL exporting F4SEPlugin_Version; the plugin log is newer than the DLL and records the load line, native registration, and a Papyrus cgf call returning 42 from C++."
      },
      "depends_on": [],
      "est_hours": 10,
      "actual_hours": 9,
      "status": "done",
      "evidence": [
        "repos/fo4-hello/ — FO4Hello F4SE plugin (xmake, libxse/commonlibf4 @ 16cff687); Papyrus natives GetAnswer/GetGreeting bound from C++, driven by a self-test that needs no console",
        "repos/wreck-works/docs/FO4-TOOLCHAIN.md — pin record, prerequisite audit, install order, game-update breakage protocol",
        "repos/wreck-works/tools/verify-dll.js + verify-dll.config.json — the gate",
        "gate green 2026-09-07: node tools/verify-dll.js -> exit 0, 9/9 checks",
        "Pinned: game 1.11.240.0 (Steam buildid 24564252), F4SE 0.7.9, commonlibf4 16cff687, MSVC 14.44.35207",
        "Log evidence: \"GetAnswer -> 42\" / \"self-test GetAnswer returned 42\" / \"self-test GetGreeting returned \\\"Hello from C++, Jonas!\\\"\" — both directions, int and string"
      ]
    },
    {
      "id": "M0.4",
      "track": "C",
      "phase": "P0",
      "name": "Throwaway mod shipped to Nexus",
      "deliverable": "A small, genuinely useful, model-free mod published on Nexus — to learn packaging, ESL flags, load order, permissions, the mod page, AI-content rules and user support before any of it matters.",
      "outputs": [
        "repos/fo4-warmup/",
        "docs/NEXUS-RELEASE-CHECKLIST.md",
        "docs/AI-CONTENT-RULES.md"
      ],
      "gate": {
        "kind": "review",
        "cmd": null,
        "criteria": "Page live; a second person installs it on a clean MO2 profile from the Nexus download alone and it works; Nexus AI-content policy and Bethesda modding terms summarised in AI-CONTENT-RULES.md."
      },
      "depends_on": [
        "M0.3"
      ],
      "est_hours": 11,
      "actual_hours": 0,
      "status": "planned",
      "evidence": []
    },
    {
      "id": "M0.5",
      "track": "D",
      "phase": "P0",
      "name": "Outreach pipeline",
      "deliverable": "A tracked contact list from the outreach already started: who, what they build, what they'd want from an embedded model, conversation status.",
      "outputs": [
        "community/contacts.json"
      ],
      "gate": {
        "kind": "review",
        "cmd": null,
        "criteria": ">=10 named contacts logged, >=3 replies, >=1 call booked."
      },
      "depends_on": [],
      "est_hours": 5,
      "actual_hours": 0,
      "status": "planned",
      "evidence": []
    },
    {
      "id": "M1.1",
      "track": "C",
      "phase": "P1",
      "name": "Mod concept and design doc",
      "deliverable": "Decide the mechanic (default: Smooth Talker — Fallout 4 persuasion checks replaced by a typed line judged by log-prob scoring against NPC disposition and faction archetype, weighted by Charisma, with the live probability distribution shown as an in-fiction Pip-Boy readout). Canon, voice bibles, format spec, failure design, fallback lines.",
      "outputs": [
        "repos/smooth-talker/docs/CANON.md",
        "repos/smooth-talker/docs/FORMAT.md",
        "repos/smooth-talker/docs/DESIGN.md"
      ],
      "gate": {
        "kind": "review",
        "cmd": null,
        "criteria": "Every branch has a handwritten fallback; no critical path depends on classifier correctness; voices are mechanically distinct (vocabulary, length, tics), not just tonally."
      },
      "depends_on": [
        "M0.4"
      ],
      "est_hours": 6,
      "actual_hours": 0,
      "status": "planned",
      "evidence": []
    },
    {
      "id": "M1.2",
      "track": "C",
      "phase": "P1",
      "name": "Stub-brain vertical slice",
      "deliverable": "The complete in-game loop — text input via UIExtensions, native call into the DLL, judgement, dialogue outcome, UI feedback — running against a keyword-classifier stub with no real weights.",
      "outputs": [
        "repos/smooth-talker/src/",
        "repos/smooth-talker/scripts/"
      ],
      "gate": {
        "kind": "cmd",
        "cmd": "make gate-slice",
        "criteria": "Papyrus compiles clean; a scripted playthrough drives 20 typed inputs through the loop and asserts the expected outcome for each; no CTD across the run."
      },
      "depends_on": [
        "M1.1"
      ],
      "est_hours": 20,
      "actual_hours": 0,
      "status": "planned",
      "evidence": []
    },
    {
      "id": "M1.3",
      "track": "C",
      "phase": "P1",
      "name": "C++ inference engine with parity",
      "deliverable": "Port the ~400-line pure-JS engine (int8 dequant to f32, unrolled matvec, per-head attention over a KV cache, BPE tokenizer) to C++ inside the F4SE DLL, running off the game thread.",
      "outputs": [
        "repos/smooth-talker/src/lm/",
        "repos/smooth-talker/test/parity.cpp"
      ],
      "gate": {
        "kind": "cmd",
        "cmd": "make gate-parity",
        "criteria": "For a fixed prompt set, the C++ engine reproduces PyTorch's top-10 logit ids and ordering exactly; scoring latency per candidate measured and recorded; zero allocations on the game thread."
      },
      "depends_on": [
        "M1.2"
      ],
      "est_hours": 24,
      "actual_hours": 0,
      "status": "planned",
      "evidence": []
    },
    {
      "id": "M1.4",
      "track": "C",
      "phase": "P1",
      "name": "Corpus, training and calibration",
      "deliverable": "Two-round corpus via parallel writer agents against CANON.md + FORMAT.md, dataset build, training run, int8 export, calibration harness producing thresholds.",
      "outputs": [
        "repos/smooth-talker/corpus/",
        "repos/smooth-talker/model/",
        "repos/smooth-talker/game/calibration.json"
      ],
      "gate": {
        "kind": "cmd",
        "cmd": "make gate-calibrate",
        "criteria": "Top-1 accuracy on hand-written fresh paraphrases >=80%; gibberish separation clean on the tokens/char ratio; per-class misses recorded; corpus parse rate 100%."
      },
      "depends_on": [
        "M1.1"
      ],
      "est_hours": 16,
      "actual_hours": 0,
      "status": "planned",
      "evidence": []
    },
    {
      "id": "M1.5",
      "track": "C",
      "phase": "P1",
      "name": "Mod v1 release",
      "deliverable": "Nexus release with an in-game model card panel (live next-token probe), a README that states plainly that the model is embedded and offline, and a demo GIF of the probability bars.",
      "outputs": [
        "releases/smooth-talker-1.0.zip",
        "docs/MODEL-CARD.md"
      ],
      "gate": {
        "kind": "review",
        "cmd": null,
        "criteria": "Three testers install on clean profiles; zero crash reports in the first 72 hours; download size under 20 MB; no external service required to play."
      },
      "depends_on": [
        "M1.3",
        "M1.4"
      ],
      "est_hours": 14,
      "actual_hours": 0,
      "status": "planned",
      "evidence": []
    },
    {
      "id": "M2.1",
      "track": "A",
      "phase": "P2",
      "name": "mod-pipeline.json",
      "deliverable": "The Fallout 4 mod expressed as a factory project: corpus, dataset, train, export, parity, calibrate, papyrus-compile, dll-build, package, playtest — each with an executable gate exposed as make gate-<id>.",
      "outputs": [
        "repos/smooth-talker/pipeline.json",
        "repos/smooth-talker/Makefile"
      ],
      "gate": {
        "kind": "cmd",
        "cmd": "make gate-all",
        "criteria": "Every step has a gate; every gate.cmd is byte-identical to the make target; a full green run from a clean checkout."
      },
      "depends_on": [
        "M1.5"
      ],
      "est_hours": 13,
      "actual_hours": 0,
      "status": "planned",
      "evidence": []
    },
    {
      "id": "M2.2",
      "track": "A",
      "phase": "P2",
      "name": "Worker daemon",
      "deliverable": "A runner on your own machine that polls a queue, executes step commands and gates (Python training, MSBuild, Papyrus compile, headless tests), streams logs and posts results back.",
      "outputs": [
        "repos/wreck-works/worker/"
      ],
      "gate": {
        "kind": "cmd",
        "cmd": "npm run test:worker",
        "criteria": "End-to-end: an LLM step queued from the UI writes artifacts to a branch, its gate runs on the worker, and red/green reaches the panel. Survives a worker restart mid-run."
      },
      "depends_on": [
        "M2.1"
      ],
      "est_hours": 19,
      "actual_hours": 0,
      "status": "planned",
      "evidence": []
    },
    {
      "id": "M2.3",
      "track": "A",
      "phase": "P2",
      "name": "Factory UI: interactive",
      "deliverable": "React panel: step graph with gate status, artifact browser with versions and diffs, worker picker (LLM vs manual), recipe editor, run history.",
      "outputs": [
        "repos/wreck-works/app/"
      ],
      "gate": {
        "kind": "review",
        "cmd": null,
        "criteria": "A full mod build is driven end to end from the panel without touching a terminal, and recorded as a screen capture."
      },
      "depends_on": [
        "M2.2"
      ],
      "est_hours": 16,
      "actual_hours": 0,
      "status": "planned",
      "evidence": []
    },
    {
      "id": "M2.4",
      "track": "A",
      "phase": "P2",
      "name": "Quest schema and solvability gate",
      "deliverable": "Quests as engine-neutral data (objectives, preconditions, world-state effects, reward, fallback text) plus a validator that proves completability by forward search over the actual world state — the flagship artifact of the gating thesis.",
      "outputs": [
        "repos/wreck-works/schema/quest.schema.json",
        "repos/wreck-works/tools/quest-lint/"
      ],
      "gate": {
        "kind": "cmd",
        "cmd": "node tools/quest-lint/run.js --corpus test/quests",
        "criteria": "100 model-generated quests validated with zero unsolvable passing; 5 hand-written known-bad quests (unreachable objective, missing precondition, circular dependency, unobtainable item, orphan reward) all rejected with a specific reason code."
      },
      "depends_on": [
        "M2.1"
      ],
      "est_hours": 19,
      "actual_hours": 0,
      "status": "planned",
      "evidence": []
    },
    {
      "id": "M2.5",
      "track": "E",
      "phase": "P2",
      "name": "Job track launch",
      "deliverable": "CV rewritten around the gating thesis with the mod and factory as headline evidence; a one-page portfolio site linking demo, model card, benchmarks and repos; first eight targeted applications.",
      "outputs": [
        "career/CV.docx",
        "career/portfolio/",
        "career/applications.json"
      ],
      "gate": {
        "kind": "review",
        "cmd": null,
        "criteria": "8 applications sent to named studios or teams, each with a tailored first paragraph naming a specific thing they build; every claim on the CV links to a public artifact."
      },
      "depends_on": [
        "M1.5",
        "M0.2"
      ],
      "est_hours": 13,
      "actual_hours": 0,
      "status": "planned",
      "evidence": []
    },
    {
      "id": "M3.1",
      "track": "B",
      "phase": "P3",
      "name": "Godot v2 vertical slice engine",
      "deliverable": "The Godot game's core systems, reading the same engine-neutral JSON artifacts (maps, story, tuning) as the browser build, with a stub LM backend so the game is playable before weights.",
      "outputs": [
        "repos/godot-game/"
      ],
      "gate": {
        "kind": "cmd",
        "cmd": "make gate-engine",
        "criteria": "Godot headless smoke test completes a full slice; artifact parity test proves the browser and Godot builds consume byte-identical data files."
      },
      "depends_on": [],
      "est_hours": 24,
      "actual_hours": 0,
      "status": "planned",
      "evidence": []
    },
    {
      "id": "M3.2",
      "track": "B",
      "phase": "P3",
      "name": "LM backend benchmark and decision",
      "deliverable": "Measured comparison of (a) your own model via a GDExtension port of the C++ engine and (b) llama.cpp via GDLlama / godot-local-llm with a small GGUF — on latency, memory, download size, output controllability and determinism. Published as a benchmark post.",
      "outputs": [
        "repos/godot-game/docs/LM-BACKEND-BENCHMARK.md"
      ],
      "gate": {
        "kind": "cmd",
        "cmd": "make gate-bench",
        "criteria": "Both backends benchmarked on the same prompt set and hardware, with a written decision and its reasoning. Numbers reproducible from the committed script."
      },
      "depends_on": [
        "M3.1",
        "M1.3"
      ],
      "est_hours": 16,
      "actual_hours": 0,
      "status": "planned",
      "evidence": []
    },
    {
      "id": "M3.3",
      "track": "B",
      "phase": "P3",
      "name": "Runtime quest generation in-game",
      "deliverable": "Quests generated during play, passed through the solvability gate before the player ever sees them, with a handwritten fallback whenever the gate fails and telemetry recording gate pass rate.",
      "outputs": [
        "repos/godot-game/systems/quests/"
      ],
      "gate": {
        "kind": "cmd",
        "cmd": "make gate-quest-soak",
        "criteria": "200 automated runs; zero unsolvable quests reach a player; gate pass rate and fallback rate recorded; median generation latency under the diegetic-cover budget."
      },
      "depends_on": [
        "M3.1",
        "M2.4"
      ],
      "est_hours": 24,
      "actual_hours": 0,
      "status": "planned",
      "evidence": []
    },
    {
      "id": "M3.4",
      "track": "B",
      "phase": "P3",
      "name": "Generated maps with reachability gate",
      "deliverable": "Map generation as a factory step, validated by the flood-fill lint extended for spawn reachability, entity reachability, void leaks and quest-objective reachability.",
      "outputs": [
        "repos/godot-game/tools/map-lint/",
        "repos/godot-game/data/maps/"
      ],
      "gate": {
        "kind": "cmd",
        "cmd": "make gate-maps",
        "criteria": "500 generated maps linted; zero unreachable spawns or objectives pass; rejects carry a reason code; lint runtime under 60s for the batch."
      },
      "depends_on": [
        "M3.1"
      ],
      "est_hours": 19,
      "actual_hours": 0,
      "status": "planned",
      "evidence": []
    },
    {
      "id": "M3.5",
      "track": "B",
      "phase": "P3",
      "name": "Adversarial playtest squad run",
      "deliverable": "The 9-mission agent squad re-pointed at the Godot build (new-player, hostile input, economy, full-run, persistence, performance, model quality, quest generation, map generation), with structured findings.",
      "outputs": [
        "repos/godot-game/playtest/findings.json"
      ],
      "gate": {
        "kind": "cmd",
        "cmd": "make gate-playtest",
        "criteria": "All 9 missions complete; every sev-1 finding fixed or explicitly accepted with a reason; at least one honest no-cheat full run recorded."
      },
      "depends_on": [
        "M3.3",
        "M3.4"
      ],
      "est_hours": 13,
      "actual_hours": 0,
      "status": "planned",
      "evidence": []
    },
    {
      "id": "M3.6",
      "track": "E",
      "phase": "P3",
      "name": "Devlog series",
      "deliverable": "Six public posts, one per fortnight, each with a number in the title: the gating thesis; porting a transformer to a game DLL; judging vs generating at 3M params; proving a generated quest is completable; the backend benchmark; what the adversarial squad found.",
      "outputs": [
        "career/writing/"
      ],
      "gate": {
        "kind": "review",
        "cmd": null,
        "criteria": "6 posts published and cross-posted to at least two communities; each links a runnable artifact."
      },
      "depends_on": [
        "M2.5"
      ],
      "est_hours": 14,
      "actual_hours": 0,
      "status": "planned",
      "evidence": []
    },
    {
      "id": "M3.7",
      "track": "E",
      "phase": "P3",
      "name": "Applications round 2",
      "deliverable": "Ten further targeted applications plus follow-ups on round one; a short retrospective on what got replies.",
      "outputs": [
        "career/applications.json"
      ],
      "gate": {
        "kind": "review",
        "cmd": null,
        "criteria": "10 sent; response-rate retrospective written; messaging adjusted accordingly."
      },
      "depends_on": [
        "M2.5"
      ],
      "est_hours": 10,
      "actual_hours": 0,
      "status": "planned",
      "evidence": []
    },
    {
      "id": "M4.1",
      "track": "D",
      "phase": "P4",
      "name": "Collaboration offer package",
      "deliverable": "A one-page offer: two weeks fixed scope, 'bring your mod or game, I embed a small model as a mechanic', with a menu of three proven mechanics (judge, generate-in-format, gibberish gate), what you need from them, and what they get.",
      "outputs": [
        "community/OFFER.md"
      ],
      "gate": {
        "kind": "review",
        "cmd": null,
        "criteria": "Sent to >=8 contacts; >=2 accepted and scheduled."
      },
      "depends_on": [
        "M0.5",
        "M1.5"
      ],
      "est_hours": 8,
      "actual_hours": 0,
      "status": "planned",
      "evidence": []
    },
    {
      "id": "M4.2",
      "track": "D",
      "phase": "P4",
      "name": "Collaboration 1",
      "deliverable": "Two-week engagement with partner 1: their project, one embedded mechanic, gates included, shipped to their audience.",
      "outputs": [
        "community/collab-1/"
      ],
      "gate": {
        "kind": "review",
        "cmd": null,
        "criteria": "Shipped to the partner's audience; partner named and quoted with permission; the gates handed over run on their machine."
      },
      "depends_on": [
        "M4.1"
      ],
      "est_hours": 26,
      "actual_hours": 0,
      "status": "planned",
      "evidence": []
    },
    {
      "id": "M4.3",
      "track": "D",
      "phase": "P4",
      "name": "Collaboration 2",
      "deliverable": "Two-week engagement with partner 2, ideally a different engine or genre from partner 1.",
      "outputs": [
        "community/collab-2/"
      ],
      "gate": {
        "kind": "review",
        "cmd": null,
        "criteria": "Shipped; partner named and quoted with permission; retrospective on what transferred from collab 1 and what didn't."
      },
      "depends_on": [
        "M4.1"
      ],
      "est_hours": 26,
      "actual_hours": 0,
      "status": "planned",
      "evidence": []
    },
    {
      "id": "M4.4",
      "track": "E",
      "phase": "P4",
      "name": "Case studies",
      "deliverable": "Two case studies in a consistent format: the problem, the mechanic, the gate, measured before/after, what the partner said.",
      "outputs": [
        "career/case-studies/"
      ],
      "gate": {
        "kind": "review",
        "cmd": null,
        "criteria": "Both published and linked from the portfolio; each contains at least three measured numbers."
      },
      "depends_on": [
        "M4.2",
        "M4.3"
      ],
      "est_hours": 9,
      "actual_hours": 0,
      "status": "planned",
      "evidence": []
    },
    {
      "id": "M4.5",
      "track": "A",
      "phase": "P4",
      "name": "Factory multi-project",
      "deliverable": "projects.json driving the browser game, the Godot game and the Fallout 4 mod, plus one collaboration project, with per-project state under each project root.",
      "outputs": [
        "repos/wreck-works/projects.json"
      ],
      "gate": {
        "kind": "cmd",
        "cmd": "npm run test:multiproject",
        "criteria": "A fourth project is added and driven to a green gate with zero changes to factory code — only its own pipeline.json."
      },
      "depends_on": [
        "M2.3",
        "M4.2"
      ],
      "est_hours": 11,
      "actual_hours": 0,
      "status": "planned",
      "evidence": []
    },
    {
      "id": "M5.1",
      "track": "B",
      "phase": "P5",
      "name": "Godot game release",
      "deliverable": "Art pass, audio pass, balance from measured runs, build, publish to itch.io with a model card and a public postmortem.",
      "outputs": [
        "releases/godot-game-1.0/"
      ],
      "gate": {
        "kind": "review",
        "cmd": null,
        "criteria": "Human listened to ten unbroken minutes of audio and signed off; balance set from a measured completionist run, not intuition; page live."
      },
      "depends_on": [
        "M3.5"
      ],
      "est_hours": 27,
      "actual_hours": 0,
      "status": "planned",
      "evidence": []
    },
    {
      "id": "M5.2",
      "track": "C",
      "phase": "P5",
      "name": "Mod v2 with generated content",
      "deliverable": "Smooth Talker v2: quest or holotape/terminal-entry generation inside Fallout 4, gated by the same validator family, driven by the factory.",
      "outputs": [
        "releases/smooth-talker-2.0.zip"
      ],
      "gate": {
        "kind": "review",
        "cmd": null,
        "criteria": "Nexus release; generation gate pass rate published on the mod page; no regression in the v1 mechanic's calibration."
      },
      "depends_on": [
        "M2.4",
        "M1.5"
      ],
      "est_hours": 16,
      "actual_hours": 0,
      "status": "planned",
      "evidence": []
    },
    {
      "id": "M5.3",
      "track": "E",
      "phase": "P5",
      "name": "Talk and long-form writeup",
      "deliverable": "A single long-form technical piece — 'Gates, not generators: shipping dynamic content players can actually finish' — plus a submission to a conference or meetup (Nordic Game, GDC microtalk, local Copenhagen dev meetups).",
      "outputs": [
        "career/writing/gates-not-generators.md",
        "career/talks/"
      ],
      "gate": {
        "kind": "review",
        "cmd": null,
        "criteria": "Piece published; at least one talk submitted; slides exist whether or not it is accepted."
      },
      "depends_on": [
        "M4.4"
      ],
      "est_hours": 11,
      "actual_hours": 0,
      "status": "planned",
      "evidence": []
    },
    {
      "id": "M5.4",
      "track": "E",
      "phase": "P5",
      "name": "Final application push",
      "deliverable": "Fifteen targeted applications and five warm introductions requested from the community track, all citing shipped artifacts.",
      "outputs": [
        "career/applications.json"
      ],
      "gate": {
        "kind": "review",
        "cmd": null,
        "criteria": "15 applications sent, 5 warm intros requested, every one linking a specific artifact relevant to that team."
      },
      "depends_on": [
        "M5.1",
        "M4.4"
      ],
      "est_hours": 16,
      "actual_hours": 0,
      "status": "planned",
      "evidence": []
    },
    {
      "id": "M5.5",
      "track": "E",
      "phase": "P5",
      "name": "Program review",
      "deliverable": "Measure the program against its exit criteria; decide the next six months (deepen the factory as a product, push consulting, or narrow to one studio target).",
      "outputs": [
        "REVIEW-2027-02.md"
      ],
      "gate": {
        "kind": "review",
        "cmd": null,
        "criteria": "Every phase's exit criteria marked met/missed with evidence; a written decision for the next horizon."
      },
      "depends_on": [
        "M5.4"
      ],
      "est_hours": 10,
      "actual_hours": 0,
      "status": "planned",
      "evidence": []
    }
  ],
  "standing_rules": [
    "Every generated asset has an executable gate. If you cannot write the validator, do not ship the generator.",
    "Recalibrate after every retrain; thresholds do not survive new weights.",
    "Never hard-gate the critical path on model output; fail forward with a handwritten fallback.",
    "Audio gates are human: ten minutes of listening, every time.",
    "Escape all player and model text at every render sink.",
    "Ship something public every two weeks.",
    "Build the measurement harness before designing the threshold.",
    "Git is the database: every artifact a file, every step a commit, every gate CI."
  ],
  "risks": [
    {
      "id": "R1",
      "risk": "Fallout 4 toolchain eats a month",
      "trigger": "No DLL building by end of week 2",
      "mitigation": "Ship v1 with Papyrus-only mechanics; defer the C++ port to P2",
      "status": "open"
    },
    {
      "id": "R2",
      "risk": "C++ inference port stalls",
      "trigger": "Parity test not passing by end of week 5",
      "mitigation": "Release v1 on the stub brain as a public beta; continue the port in P2",
      "status": "open"
    },
    {
      "id": "R3",
      "risk": "Nexus AI-content policy blocks release",
      "trigger": "Page flagged or removed",
      "mitigation": "Read Nexus and Bethesda terms in M0.4 before first release; ship only self-trained weights with a model card; no third-party voice data",
      "status": "open"
    },
    {
      "id": "R4",
      "risk": "Collaborations do not materialise",
      "trigger": "Fewer than 2 partners committed by week 16",
      "mitigation": "Substitute two self-directed case studies against popular open-source mods",
      "status": "open"
    },
    {
      "id": "R5",
      "risk": "Scope creep on the Godot game",
      "trigger": "P3 milestones slipping two weeks",
      "mitigation": "Cut to a single 20-minute vertical slice; the gate story matters more than content volume",
      "status": "open"
    },
    {
      "id": "R6",
      "risk": "Slow job market",
      "trigger": "No interviews by week 16",
      "mitigation": "Shift weight to consulting/contract offers via Track D; widen geography beyond the Nordics",
      "status": "open"
    },
    {
      "id": "R7",
      "risk": "Burn-out",
      "trigger": "Two consecutive weeks under 15 logged hours",
      "mitigation": "The 20% buffer is slack, not capacity; drop a P4 collaboration before dropping the publishing cadence",
      "status": "open"
    },
    {
      "id": "R8",
      "risk": "A Fallout 4 update breaks F4SE and every DLL plugin",
      "trigger": "Game patch ships; F4SE and Address Library lag behind",
      "mitigation": "Pin and record the game version in M0.3; keep a Steam depot-locked install and never auto-update the modding machine; Mantella hit exactly this on Skyrim in Aug 2026",
      "status": "open"
    }
  ],
  "evidence_ledger": [
    {
      "id": "EV0",
      "name": "Ghost in the Wreck",
      "kind": "shipped_game",
      "summary": "Browser game with a 2.9M-param transformer trained from scratch, int8-embedded, pure-JS inference. 85% top-1 style classification on fresh paraphrases.",
      "url": null,
      "date": "2026-08"
    },
    {
      "id": "EV1",
      "name": "wreck-works factory v1",
      "kind": "tool",
      "summary": "18-step LLM game pipeline with executable gates; pipeline.json contract.",
      "url": null,
      "date": "2026-08"
    }
  ],
  "decisions": [
    {
      "date": "2026-09-03",
      "decision": "Fallout 4 chosen as the mod target, over Skyrim, New Vegas, RimWorld, Stardew and Minecraft.",
      "rationale": "Jonas has played every Fallout but 76, so he can judge mechanic feel. The incumbent (Mantella FO4, 224 endorsements) has been stale since March 2025 and there is no CHIM equivalent on Fallout, so the field is open where Skyrim is not. F4SE + CommonLibF4 is a modern toolchain with working CMake/vcpkg templates. FO4 four-option dialogue wheel is the game most criticised feature, so typed input reads as a fix rather than a bolt-on. Accepted cost: roughly a tenth of Skyrim AI-mod audience."
    },
    {
      "date": "2026-09-03",
      "decision": "Competitive landscape surveyed; no published quality evaluation exists anywhere in this niche.",
      "rationale": "Mantella deprecated its own fine-tuned Llama-3-8B with no supporting numbers. The only quantified figures found were Mantella latency targets and two academic studies (ICIDS/Springer qualitative Mantella case study; arXiv 2507.10469, 18 participants, 6.9s mean loop latency, believability 6.67/10 with agency lowest at 5.34). Publishing measured numbers is therefore a cheap and unoccupied differentiator."
    },
    {
      "date": "2026-09-03",
      "decision": "Lead with embedded small models and executable gates rather than remote-LLM chatbot NPCs.",
      "rationale": "Mantella and CHIM already own the remote-brain approach and both require heavyweight installs. Zero-install in-process models plus validated dynamic assets is an unoccupied and defensible position that matches proven capability."
    },
    {
      "date": "2026-09-03",
      "decision": "Applications start in week 9, not at the end of the programme.",
      "rationale": "Hiring cycles are long and the material is freshest while it is being built."
    },
    {
      "date": "2026-09-03",
      "decision": "P0 kicked off: M0.1 (plan agent + plan-lint) built and gated green; M0.2 (POSITIONING.md) drafted and awaiting Jonas's review sign-off.",
      "rationale": "M0.1 and M0.2 need no Windows/Fallout 4 tooling, so they were built first in the cloud sandbox. M0.3 (FO4 dev environment) and M0.4 (throwaway Nexus mod) are blocked on linking the Windows gaming PC (Steam, Visual Studio, vcpkg, Creation Kit) and start once that link is up. M0.5 (outreach pipeline) is blocked on Jonas supplying the actual contact list — it cannot be fabricated."
    },
    {
      "date": "2026-09-03",
      "decision": "Corrected M0.1 scope: the plan agent is a standalone personal Claude skill, not a file committed inside wreck-works. Removed .claude/skills/plan-agent/ from this repo; the skill now reads whichever PLAN.md it is pointed at (this one, or a future project's) and helps plan the week, not just this program.",
      "rationale": "Jonas corrected the original build: the agent needs to work across different plan files and live outside any one project's repo, not be tied to wreck-works specifically."
    },
    {
      "date": "2026-09-07",
      "decision": "M0.3 targets the current next-gen runtime 1.11.240 with F4SE 0.7.9, rather than downgrading to 1.10.163.",
      "rationale": "Largest current player base and what a fresh Steam install gives, which matters because M0.4 and P1 ship to real users; libxse/commonlibf4 already defines RUNTIME_LATEST as exactly 1.11.240. Cost accepted: a thinner ecosystem than 1.10.163 and exposure to future Bethesda patches, mitigated by pinning the install, disabling Steam auto-updates and writing the breakage protocol down in docs/FO4-TOOLCHAIN.md before it is needed."
    },
    {
      "date": "2026-09-07",
      "decision": "M0.3's build system is xmake against libxse/commonlibf4, not CMake+vcpkg; the gate command changes from 'cmake --build build --config Release' to 'xmake build'.",
      "rationale": "The maintained CommonLibF4 line moved to xmake, and its commonlibf4.plugin rule generates the F4SE plugin declaration and handles mod-manager deployment. Fighting that to keep a CMake gate would have been toolchain work with no milestone value. Deweh/CommonLibF4-NG, the alternative named in the original deliverable, has been stale since 2025-10."
    },
    {
      "date": "2026-09-07",
      "decision": "M0.3 needs no ESP, quest or form: the Papyrus side is a Native Hidden script called via the console cgf command.",
      "rationale": "Removes all Creation Kit content work from the milestone, leaving the CK needed only for PapyrusCompiler.exe. Keeps the boundary test honest — it proves the VM reaches C++ without a plugin file confounding the result."
    },
    {
      "date": "2026-09-07",
      "decision": "PLAN.md and POSITIONING.md moved from docs/ to the repo root, and the duplicate copy of plan-lint.js under docs/ deleted; tools/plan-lint.js is the only one.",
      "rationale": "M0.1's gate command is literally 'node tools/plan-lint.js PLAN.md' and its evidence records 'repos/wreck-works/PLAN.md', but the file sat in docs/ — so a milestone marked done had a gate command that could not actually run as written. Moving the file repairs the gate rather than rewriting the record of what was gated. docs/ keeps the technical notes (FO4-TOOLCHAIN.md and the factory docs)."
    },
    {
      "date": "2026-09-07",
      "decision": "M0.3 gate is self-driving: the plugin dispatches the Papyrus call itself on kNewGame/kPostLoadGame rather than relying on a human typing cgf into the game console.",
      "rationale": "The standing rule is that every gate is executable, and a gate needing a human at a keyboard is not. It also unblocked a real obstacle: Fallout 4 binds the console to a physical key position, and on Danish hardware under an en-US language that key is neither tilde nor reliably reachable. The dispatch goes through the same VM path the console would use, so nothing about the boundary is faked — only the human is removed."
    },
    {
      "date": "2026-09-07",
      "decision": "Corrected: a Native Hidden Papyrus script still requires compilation, so the Creation Kit is on the critical path for PapyrusCompiler.exe. It avoids needing an ESP, a quest or a form, not the compiler.",
      "rationale": "Measured, not assumed. With the DLL loaded and BindNativeMethod reporting no error, dispatch was still cancelled: binding a native and registering a type are separate operations, and the VM type table is populated from compiled scripts only. Two further traps cost a cycle each and are now written down in docs/FO4-TOOLCHAIN.md — the Creation Kit comes from Steam (appid 1946160) since the Bethesda.net Launcher was retired in 2022, and Fallout 4 ships sResourceDataDirsFinal=STRINGS\\ which silently ignores every loose file outside that one directory."
    }
  ],
  "agent_protocol": {
    "read": "Parse the fenced block tagged 'plan-state'. The prose above it is context, not state.",
    "write": "Rewrite only the plan-state block. Prose edits are separate, deliberate commits.",
    "never_delete_milestones": "Set status 'dropped' with a note instead.",
    "decisions_are_append_only": true,
    "evidence_on_ship": "Fill a milestone's evidence array at the moment it ships, not later.",
    "hours_flagging": "Flag when a phase's actual_hours exceed its budget by more than 20% rather than silently re-planning.",
    "gate_discipline": "A milestone reaches 'done' only when its gate passes. Review gates record approver and date.",
    "weekly_report": [
      "what moved",
      "what is blocked and on what",
      "hours logged vs budget",
      "single next action per active track"
    ]
  }
}
```
