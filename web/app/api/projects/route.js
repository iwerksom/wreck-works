import { NextResponse } from "next/server";
import { listProjects, getProject, configProblem } from "../../../lib/projects";
import { scaffoldProject } from "../../../lib/scaffold";
import { readJson } from "../../../lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  // A broken projects.json is reported as its own condition. Without this it
  // reads as zero projects, the panel opens the first-run wizard, and creating
  // a game would replace the file.
  const configError = configProblem();
  if (configError) return NextResponse.json({ projects: [], active: null, configError });
  try {
    const projects = listProjects().map(p => ({ id: p.id, name: p.name, root: p.root }));
    // No projects is a normal first run, not an error: the panel shows the
    // new-project flow instead of a dead end.
    const active = projects.length ? getProject().id : null;
    return NextResponse.json({ projects, active });
  } catch (e) {
    return NextResponse.json({ projects: [], active: null, error: e.message });
  }
}

// POST {name, description, profile, recipes?} -> scaffold a new game and
// register it. The steps come from the profile via the rules in lib/catalogue;
// `recipes` is the optional prose refinement from /api/scope/refine, cleaned
// and bounded by scaffoldProject before it is written anywhere.
export async function POST(req) {
  let body;
  try {
    body = await readJson(req);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.status || 400 });
  }
  try {
    const created = scaffoldProject(body);
    return NextResponse.json({ ok: true, project: created });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
