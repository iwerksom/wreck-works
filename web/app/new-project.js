"use client";
import { useCallback, useEffect, useRef, useState } from "react";

// Starting a new game.
//
// The step list is decided by rule, not by a model: every toggle re-runs
// /api/scope, which is pure, so the preview updates instantly and works with no
// API key. Claude is optional and only rewrites the prose inside the steps the
// rules already chose. See docs/WHY-THESE-STEPS.md for where the rules come
// from.

const ARCHITECTURES = [
  {
    id: "none",
    label: "No language model",
    blurb: "An ordinary game. Drops the corpus, training and calibration steps entirely.",
  },
  {
    id: "embedded",
    label: "Embedded — trained from scratch",
    blurb: "Weights you train and ship inside the build. No server, no API key, no per-player cost. This is what the pilot did.",
  },
  {
    id: "api",
    label: "Remote — a hosted API",
    blurb: "Somebody else's weights behind an HTTP call. Adds a prompt spec, a held-out eval set, a cost budget and a fallback path.",
  },
];

const TRAITS = [
  { id: "levels", label: "Spatial levels", blurb: "Places a player moves through. Adds level design with a reachability lint." },
  { id: "narrative", label: "Fixed story beats", blurb: "Hand-written anchors that carry plot, so generated text carries only atmosphere." },
  { id: "economy", label: "Resources worth tuning", blurb: "Numbers that belong in a data file rather than in code. Also adds the balance pass." },
  { id: "sound", label: "Sound", blurb: "Adds the audio step, whose gate is always a human with headphones." },
  { id: "voices", label: "More than one voice", blurb: "Distinct characters. Adds the world and voice bibles that keep parallel writers consistent." },
];

const MODEL_TRAITS = [
  { id: "modelGatesPlay", label: "Model output decides what happens", blurb: "Not just what is said. Adds threshold calibration, because guessed thresholds are the classic failure." },
  { id: "modelWritesText", label: "Model writes text players read", blurb: "Adds the sample review that catches repetition and flattened voice." },
];

const INITIAL = {
  architecture: "embedded",
  levels: true, narrative: true, economy: true, sound: true, voices: true,
  modelGatesPlay: true, modelWritesText: true,
};

export default function NewProject({ onClose, onCreated, firstRun }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [profile, setProfile] = useState(INITIAL);
  const [preview, setPreview] = useState(null);
  const [recipes, setRecipes] = useState(null);
  const [busy, setBusy] = useState(null);   // "refine" | "create" | null
  const [err, setErr] = useState(null);

  // Both requests below can finish out of order: toggles fire faster than the
  // server answers, and refinement takes seconds while the brief stays
  // editable. Each response is applied only if nothing changed since it was
  // asked for — otherwise the preview or the recipes would describe a game
  // that is no longer the one on screen.
  const scopeSeq = useRef(0);
  const briefSeq = useRef(0);

  const scope = useCallback(async p => {
    const seq = ++scopeSeq.current;
    try {
      const r = await fetch("/api/scope", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ profile: p }),
      }).then(r => r.json());
      if (seq === scopeSeq.current) setPreview(r);
    } catch {
      if (seq === scopeSeq.current) setPreview(null);
    }
  }, []);

  useEffect(() => { scope(profile); }, [profile, scope]);

  // Any change to the brief (name, description or profile) invalidates recipes
  // written against the old one, including a refinement still in flight.
  function touch() {
    briefSeq.current++;
    setRecipes(null);
    setErr(null);
  }

  function set(patch) {
    setProfile(p => Object.assign({}, p, patch));
    touch();
  }

  async function refine() {
    if (!name.trim()) { setErr("Give the game a name first — the recipes are written about it."); return; }
    const seq = ++briefSeq.current;
    setBusy("refine"); setErr(null); setRecipes(null);
    try {
      const r = await fetch("/api/scope/refine", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, description, profile }),
      }).then(r => r.json());
      if (seq !== briefSeq.current) {
        setErr("You changed the game while Claude was writing, so those recipes were discarded. Refine again.");
      } else if (r.error) {
        setErr(r.error);
      } else {
        setRecipes(r.recipes);
      }
    } catch (e) {
      if (seq === briefSeq.current) setErr("Refine failed: " + e.message);
    }
    setBusy(null);
  }

  async function create() {
    if (!name.trim()) { setErr("Give the game a name."); return; }
    setBusy("create"); setErr(null);
    try {
      const r = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, description, profile, recipes }),
      }).then(r => r.json());
      if (r.error) { setErr(r.error); setBusy(null); return; }
      onCreated(r.project);
    } catch (e) {
      setErr("Could not create the project: " + e.message);
      setBusy(null);
    }
  }

  const hasModel = profile.architecture !== "none";
  const byPhase = {};
  if (preview) for (const s of preview.steps) (byPhase[s.phase] ||= []).push(s);

  return (
    <div className="modalwrap" onClick={e => { if (e.target === e.currentTarget && !firstRun) onClose(); }}>
      <div className="modal">
        <div className="modalhead">
          <h2>NEW GAME</h2>
          <p className="hint">
            Answer these and the factory picks the steps. Every step exists to prevent one
            specific failure — hover any of them on the right to see which.
          </p>
        </div>

        <div className="modalbody">
          <div className="formcol">
            <label className="fld">
              <span>NAME</span>
              <input value={name} onChange={e => { setName(e.target.value); touch(); }}
                     placeholder="Ghost in the Wreck" maxLength={80} autoFocus />
            </label>
            <label className="fld">
              <span>WHAT IS IT?</span>
              <textarea value={description} onChange={e => { setDescription(e.target.value); touch(); }} rows={3} maxLength={2000}
                        placeholder="One or two sentences. Used to write the step recipes, if you refine them." />
            </label>

            <div className="fld">
              <span>LANGUAGE MODEL</span>
              {ARCHITECTURES.map(a => (
                <label key={a.id} className={"opt" + (profile.architecture === a.id ? " on" : "")}>
                  <input type="radio" name="arch" checked={profile.architecture === a.id}
                         onChange={() => set({ architecture: a.id })} />
                  <span className="optlabel">{a.label}</span>
                  <span className="optblurb">{a.blurb}</span>
                </label>
              ))}
            </div>

            <div className="fld">
              <span>THE GAME HAS</span>
              {TRAITS.map(t => (
                <label key={t.id} className={"opt" + (profile[t.id] ? " on" : "")}>
                  <input type="checkbox" checked={!!profile[t.id]} onChange={e => set({ [t.id]: e.target.checked })} />
                  <span className="optlabel">{t.label}</span>
                  <span className="optblurb">{t.blurb}</span>
                </label>
              ))}
            </div>

            {hasModel && (
              <div className="fld">
                <span>THE MODEL</span>
                {MODEL_TRAITS.map(t => (
                  <label key={t.id} className={"opt" + (profile[t.id] ? " on" : "")}>
                    <input type="checkbox" checked={!!profile[t.id]} onChange={e => set({ [t.id]: e.target.checked })} />
                    <span className="optlabel">{t.label}</span>
                    <span className="optblurb">{t.blurb}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="previewcol">
            <div className="previewhead">
              {preview ? <><b>{preview.count}</b> steps · {preview.phases.join(" · ")}</> : "scoping ..."}
              {recipes && <span className="refined">recipes refined for this game</span>}
            </div>
            {preview && preview.phases.map(ph => (
              <div className="pvphase" key={ph}>
                <h4>{ph.toUpperCase()}</h4>
                {byPhase[ph].map(s => (
                  <div className="pvstep" key={s.id} title={s.why}>
                    <span className={"pvdot " + s.gate} />
                    <span className="pvname">{s.name}</span>
                    <span className="pvgate">{s.gate === "review" ? "human" : "auto"}</span>
                  </div>
                ))}
              </div>
            ))}
            {preview && preview.excluded.length > 0 && (
              <div className="pvphase excl">
                <h4>NOT INCLUDED</h4>
                {preview.excluded.map(e => (
                  <div className="pvstep" key={e.id} title={e.reason}>
                    <span className="pvname">{e.name}</span>
                    <span className="pvwhy">{e.reason}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {err && <div className="modalerr">{err}</div>}

        <div className="modalfoot">
          <span className="hint">
            Creates <code>../{slug(name) || "<name>"}/</code> with pipeline.json, a README and a
            Makefile of empty gate targets.
          </span>
          <span className="spacer" />
          {!firstRun && <button className="btn ghost" onClick={onClose} disabled={!!busy}>CANCEL</button>}
          <button className="btn purple" onClick={refine} disabled={!!busy}>
            {busy === "refine" ? "WRITING RECIPES ..." : "REFINE RECIPES WITH CLAUDE"}
          </button>
          <button className="btn" onClick={create} disabled={!!busy}>
            {busy === "create" ? "CREATING ..." : "CREATE PROJECT"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Mirrors slugify() in lib/scaffold.js, for the path shown in the footer.
function slug(s) {
  return String(s).toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}
