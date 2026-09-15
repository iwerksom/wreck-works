import { NextResponse } from "next/server";
import { previewProfile } from "../../../lib/scaffold";

export const dynamic = "force-dynamic";

// POST {profile} -> which steps that profile produces, and which it drops and
// why. Deterministic and model-free on purpose: scoping a project must work
// before anyone has an API key, and the same profile must always give the same
// pipeline.
export async function POST(req) {
  try {
    const { profile } = await req.json();
    return NextResponse.json(previewProfile(profile));
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
