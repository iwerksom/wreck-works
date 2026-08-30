import { NextResponse } from "next/server";
import { update } from "../../../../lib/store";
import { listProjects, getProject } from "../../../../lib/projects";

export const dynamic = "force-dynamic";

// A worker claims the oldest queued job. With no ?project= the worker serves
// every configured project, which is the point of a factory.
export async function POST(req) {
  let scope;
  try {
    const id = new URL(req.url).searchParams.get("project");
    scope = id ? [getProject(id)] : listProjects();
  } catch {
    scope = [];
  }
  for (const project of scope) {
    let claimed = null;
    update(project, db => {
      const job = db.jobs.find(j => j.status === "queued");
      if (job) {
        job.status = "running";
        job.claimed = Date.now();
        job.projectId = job.projectId || project.id;
        job.cwd = job.cwd || project.root;
        const st = db.steps[job.stepId] || {};
        st.status = "running";
        db.steps[job.stepId] = st;
        claimed = job;
      }
    });
    if (claimed) return NextResponse.json({ job: claimed });
  }
  return NextResponse.json({ job: null });
}
