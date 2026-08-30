import { NextResponse } from "next/server";
import { update } from "../../../../lib/store";
import { projectFrom } from "../../../../lib/projects";

export const dynamic = "force-dynamic";

// PATCH {worker} — choose llm/human/auto for a step
// POST {action: "review_pass"|"review_fail"|"reset", note}
export async function PATCH(req, { params }) {
  const project = projectFrom(req);
  const { worker } = await req.json();
  update(project, db => {
    db.steps[params.id] = Object.assign({}, db.steps[params.id], { worker });
  });
  return NextResponse.json({ ok: true });
}

export async function POST(req, { params }) {
  const project = projectFrom(req);
  const { action, note = "" } = await req.json();
  update(project, db => {
    const st = db.steps[params.id] || {};
    if (action === "review_pass") { st.status = "passed"; st.note = note; }
    if (action === "review_fail") { st.status = "failed"; st.note = note; }
    if (action === "reset") { st.status = "todo"; st.note = null; }
    db.steps[params.id] = st;
  });
  return NextResponse.json({ ok: true });
}
