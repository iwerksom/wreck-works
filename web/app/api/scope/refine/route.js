import { NextResponse } from "next/server";
import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { selectSteps } from "../../../../lib/catalogue";
import { cleanBrief } from "../../../../lib/scaffold";
import { readJson } from "../../../../lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// POST {name, description, profile} -> per-step recipes rewritten for this
// specific game.
//
// The *selection* of steps is done by rule in lib/catalogue.js and never by a
// model. This route only rewrites the prose inside the chosen steps, which is
// the part a model is actually better at: turning "a detective game where the
// suspect lies" into a corpus recipe that mentions suspects and lies. It
// returns a patch for the panel to apply; it writes nothing.
const SYSTEM = [
  "You write the worker instructions for one game's production pipeline.",
  "For each step you are given, rewrite three fields so they speak about THIS game, concretely:",
  "  llm_recipe    - what an LLM worker should do. Imperative, specific, <= 60 words.",
  "  manual_recipe - the same job done by a person, naming the tool they would use. <= 40 words.",
  "  criteria      - the definition of done. It must be checkable by someone who did not write it.",
  "Keep every step's purpose intact: the 'why' given is the failure the step exists to prevent.",
  "Never invent new steps, never drop steps, never rename ids.",
  "If a step's criteria states a hard rule (for example that a human must listen), preserve that rule.",
  "Reply with JSON only: {\"<step id>\": {\"llm_recipe\": \"...\", \"manual_recipe\": \"...\", \"criteria\": \"...\"}}",
].join("\n");

// Models wrap JSON in prose or fences no matter how firmly you ask. Take the
// outermost braces rather than trusting the response to be bare JSON.
function parseJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("no JSON object in the reply");
  return JSON.parse(text.slice(start, end + 1));
}

export async function POST(req) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "Set ANTHROPIC_API_KEY in web/.env.local to refine recipes. The pipeline works without it — the recipes just stay generic." },
      { status: 400 }
    );
  }
  // Bounded and validated before any provider client exists, so an oversized
  // or malformed request costs nothing.
  let body, brief;
  try {
    body = await readJson(req);
    brief = cleanBrief(body);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.status || 400 });
  }
  const { profile } = body;
  const { steps } = selectSteps(profile);

  const stepList = steps.map(s =>
    `--- ${s.id} (${s.phase}: ${s.name})\nwhy: ${s.why}\ncurrent criteria: ${s.gate.criteria}\ngate kind: ${s.gate.kind}`
  ).join("\n");

  try {
    const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const { text } = await generateText({
      model: anthropic(process.env.FACTORY_MODEL || "claude-sonnet-4-5"),
      system: SYSTEM,
      prompt:
        `GAME: ${brief.name}\n` +
        `DESCRIPTION: ${brief.description || "(none given)"}\n` +
        `MODEL ARCHITECTURE: ${profile?.architecture || "embedded"}\n\n` +
        `STEPS TO REWRITE:\n${stepList}`,
    });
    const patch = parseJson(text);
    // Only keep keys that name a real selected step, so a hallucinated id can
    // never introduce a step the rules did not choose.
    const ids = new Set(steps.map(s => s.id));
    const recipes = {};
    for (const [id, v] of Object.entries(patch)) {
      if (ids.has(id) && v && typeof v === "object") recipes[id] = v;
    }
    return NextResponse.json({ recipes, count: Object.keys(recipes).length });
  } catch (e) {
    return NextResponse.json({ error: "Refine failed: " + e.message }, { status: 502 });
  }
}
