import { NextResponse } from "next/server";
import { update, readDb } from "../../../../lib/store";
import { projectFrom, getProject } from "../../../../lib/projects";

export const dynamic = "force-dynamic";

// The worker posts back with ?project=<id> (it learns the id from the claimed
// job); without one we fall back to the active project.
function resolve(req, body) {
  if (body && body.projectId) {
    try { return getProject(body.projectId); } catch {}
  }
  return projectFrom(req);
}

export async function GET(req, { params }) {
  const project = resolve(req, null);
  const db = readDb(project);
  const job = db.jobs.find(j => j.id === Number(params.id));
  return NextResponse.json({ job: job || null });
}

// worker posts progress/result: {log?, status?, exitCode?, projectId?}
export async function POST(req, { params }) {
  const body = await req.json();
  const project = resolve(req, body);
  let out = null;
  update(project, db => {
    const job = db.jobs.find(j => j.id === Number(params.id));
    if (!job) return;
    if (body.log) job.log = (job.log + body.log).slice(-100000);
    if (body.status) {
      job.status = body.status;
      if (body.status === "done" || body.status === "failed") {
        job.finished = Date.now();
        job.exitCode = body.exitCode ?? null;
        const st = db.steps[job.stepId] || {};
        if (job.kind === "gate") st.status = body.status === "done" && body.exitCode === 0 ? "passed" : "failed";
        else st.status = body.status === "done" ? "review" : "failed";
        db.steps[job.stepId] = st;
      }
    }
    out = job;
  });
  return NextResponse.json({ job: out });
}
