import { streamText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { loadPipeline, readArtifact } from "../../../lib/pipeline";
import { saveProposal, update } from "../../../lib/store";
import { projectFrom } from "../../../lib/projects";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// POST {stepId, extra?} -> streams an LLM proposal for the step.
// The proposal is saved under <project>/.factory/proposals/ for a human (or
// the worker, later) to apply; the step moves to "review". Deliberately does
// NOT write game artifacts directly: the gate + a human stay in the loop.
export async function POST(req) {
  const project = projectFrom(req);
  const { stepId, extra = "" } = await req.json();
  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(
      JSON.stringify({ error: "Set ANTHROPIC_API_KEY in web/.env.local to run LLM steps." }),
      { status: 400 }
    );
  }
  const pipeline = loadPipeline(project);
  const step = pipeline.steps.find(s => s.id === stepId);
  if (!step || !step.llm_recipe) {
    return new Response(JSON.stringify({ error: "step has no LLM recipe" }), { status: 400 });
  }

  // attach input artifacts (bounded)
  let inputs = "";
  for (const rel of step.inputs) {
    if (rel.includes("*")) continue; // glob inputs listed by name only
    try {
      const a = readArtifact(project, rel, 60000);
      if (a.kind === "file")
        inputs += `\n\n===== INPUT ARTIFACT: ${rel} =====\n${a.text}${a.truncated ? "\n[truncated]" : ""}`;
    } catch { /* artifact may not exist yet */ }
  }

  const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const result = streamText({
    model: anthropic(process.env.FACTORY_MODEL || "claude-sonnet-4-5"),
    system:
      "You are a worker in an LLM game factory. Produce ONLY the deliverable for your assigned step, ready to be applied to the repository. " +
      "Follow the step recipe exactly. If the deliverable is a file, output its complete contents preceded by a line 'FILE: <repo-relative path>'. " +
      "Multiple files: repeat that pattern. No commentary outside the deliverable.",
    prompt:
      `PROJECT: ${project.name}\n` +
      `STEP: ${step.name} (${step.id})\n` +
      `RECIPE: ${step.llm_recipe}\n` +
      `EXPECTED OUTPUTS: ${step.outputs.join(", ")}\n` +
      `QUALITY GATE (your work must pass): ${step.gate.criteria}\n` +
      (extra ? `OPERATOR NOTES: ${extra}\n` : "") +
      inputs,
    onFinish: ({ text }) => {
      const file = saveProposal(project, stepId, text);
      update(project, db => {
        db.steps[stepId] = Object.assign({}, db.steps[stepId], { status: "review", note: "proposal: " + file });
        db.jobs.push({
          id: db.nextJobId++, projectId: project.id, stepId, kind: "llm", cmd: null,
          status: "done", log: "proposal saved to " + file,
          created: Date.now(), finished: Date.now(), exitCode: 0,
        });
      });
    },
  });
  return result.toTextStreamResponse();
}
