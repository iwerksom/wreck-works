import { NextResponse } from "next/server";
import { listProjects, getProject } from "../../../lib/projects";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const projects = listProjects().map(p => ({ id: p.id, name: p.name, root: p.root }));
    const active = projects.length ? getProject().id : null;
    return NextResponse.json({ projects, active });
  } catch (e) {
    return NextResponse.json({ projects: [], active: null, error: e.message });
  }
}
