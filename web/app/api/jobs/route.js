import { NextResponse } from "next/server";
import { loadPipeline } from "../../../lib/pipeline";
import { update, readDb } from "../../../lib/store";
import { projectFrom } from "../../../lib/projects";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const project = projectFrom(req);
  const db = readDb(project);
  return NextResponse.json({ jobs: db.jobs.slice(-100).reverse() });
}

// enqueue a job: {stepId, kind: "gate"}
export async function POST(req) {
  const project = projectFrom(req);
  const { stepId, kind = "gate" } = await req.json();
  const pipeline = loadPipeline(project);
  const step = pipeline.steps.find(s => s.id === stepId);
  if (!step) return NextResponse.json({ error: "unknown step" }, { status: 400 });
  if (kind === "gate" && (!step.gate || !step.gate.cmd)) {
    return NextResponse.json(
      { error: "this step's gate is a human review; use the review buttons" },
      { status: 400 }
    );
  }
  let job;
  update(project, db => {
    job = {
      id: db.nextJobId++,
      projectId: project.id,
      cwd: project.root,          // the worker runs the gate here, not in the factory
      stepId, kind,
      cmd: kind === "gate" ? step.gate.cmd : null,
      status: "queued", log: "", created: Date.now(),
      claimed: null, finished: null, exitCode: null,
    };
    db.jobs.push(job);
    db.steps[stepId] = Object.assign({}, db.steps[stepId], { status: "queued", lastJobId: job.id });
  });
  return NextResponse.json({ job });
}
