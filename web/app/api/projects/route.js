import { NextResponse } from "next/server";
import { listProjects, getProject } from "../../../lib/projects";
import { scaffoldProject } from "../../../lib/scaffold";

export const dynamic = "force-dynamic";

export async function GET() {
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
// `recipes` is the optional prose refinement from /api/scope/refine.
export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad request body" }, { status: 400 });
  }
  try {
    const created = scaffoldProject(body);
    return NextResponse.json({ ok: true, project: created });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
