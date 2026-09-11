import { NextResponse } from "next/server";
import { update } from "../../../../lib/store";
import { projectFrom } from "../../../../lib/projects";

export const dynamic = "force-dynamic";

// PATCH {worker} — choose llm/human/auto for a step
// POST {action: "review_pass"|"review_fail"|"reset", note}
// params is a promise from Next 15 on, so it must be awaited before use. The
// old synchronous form does not throw — `params.id` is simply undefined, so
// writes land on db.steps["undefined"] and the real step is never touched.
export async function PATCH(req, { params }) {
  const { id } = await params;
  const project = projectFrom(req);
  const { worker } = await req.json();
  update(project, db => {
    db.steps[id] = Object.assign({}, db.steps[id], { worker });
  });
  return NextResponse.json({ ok: true });
}

export async function POST(req, { params }) {
  const { id } = await params;
  const project = projectFrom(req);
  const { action, note = "" } = await req.json();
  update(project, db => {
    const st = db.steps[id] || {};
    if (action === "review_pass") { st.status = "passed"; st.note = note; }
    if (action === "review_fail") { st.status = "failed"; st.note = note; }
    if (action === "reset") { st.status = "todo"; st.note = null; }
    db.steps[id] = st;
  });
  return NextResponse.json({ ok: true });
}
