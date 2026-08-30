import { NextResponse } from "next/server";
import { loadPipeline } from "../../../lib/pipeline";
import { readDb } from "../../../lib/store";
import { projectFrom } from "../../../lib/projects";

export const dynamic = "force-dynamic";

export async function GET(req) {
  let project;
  try {
    project = projectFrom(req);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
  let pipeline;
  try {
    pipeline = loadPipeline(project);
  } catch {
    return NextResponse.json(
      { error: `No pipeline found for "${project.id}" at ${project.root}.` },
      { status: 400 }
    );
  }
  const db = readDb(project);
  const status = {};
  for (const s of pipeline.steps) {
    const st = db.steps[s.id] || {};
    const depsPassed = s.depends_on.every(d => (db.steps[d] || {}).status === "passed");
    status[s.id] = {
      worker: st.worker || (s.automated ? "auto" : "llm"),
      status: st.status || "todo",
      note: st.note || null,
      lastJobId: st.lastJobId || null,
      ready: depsPassed,
    };
  }
  return NextResponse.json({
    project: { id: project.id, name: project.name, root: project.root },
    pipeline,
    status,
  });
}
