"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import NewProject from "./new-project";

export default function Factory() {
  const [projects, setProjects] = useState([]);
  const [proj, setProj] = useState(null);      // active project id
  const [data, setData] = useState(null);      // {project, pipeline, status}
  const [err, setErr] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [sel, setSel] = useState(null);        // selected step id
  const [llmStream, setLlmStream] = useState(null);
  const [link, setLink] = useState("ok");   // panel reachable? "ok" | "down"
  const [booted, setBooted] = useState(false); // has /api/projects answered once?
  const [showNew, setShowNew] = useState(false);
  const [configErr, setConfigErr] = useState(null); // projects.json exists but is unusable
  const streamRef = useRef(null);

  const q = proj ? `?project=${encodeURIComponent(proj)}` : "";

  const loadProjects = useCallback(async () => {
    try {
      const r = await fetch("/api/projects").then(r => r.json());
      setConfigErr(r.configError || null);
      setProjects(r.projects || []);
      setProj(cur => cur || r.active);
      if (r.error) setErr(r.error);
      return r;
    } catch {
      setLink("down");   // the poll below retries
      return null;
    } finally {
      setBooted(true);
    }
  }, []);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  async function projectCreated(created) {
    await loadProjects();
    setProj(created.id);
    setSel(null);
    setData(null);
    setShowNew(false);
  }

  const refresh = useCallback(async () => {
    let p, j;
    try {
      [p, j] = await Promise.all([
        fetch("/api/pipeline" + q).then(r => r.json()),
        fetch("/api/jobs" + q).then(r => r.json()),
      ]);
    } catch {
      // The panel is restarting, or this tab has outlived it. Keep the last
      // board on screen rather than throwing: this runs every 2.5s, so an
      // unhandled rejection here is a crash overlay on every dev reload, and
      // the next tick is already the retry.
      setLink("down");
      return;
    }
    setLink("ok");
    if (p.error) { setErr(p.error); setData(null); return; }
    setErr(null);
    setData(p);
    setJobs(j.jobs || []);
  }, [q]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 2500);
    return () => clearInterval(t);
  }, [refresh]);

  // The wizard is an overlay, so it has to survive the early returns below —
  // the commonest time to want it is when there is no pipeline to show.
  // A broken projects.json is not a first run: offering to create a game there
  // would invite the one action that could overwrite the file.
  const firstRun = booted && !configErr && projects.length === 0;
  const overlay = (showNew || firstRun) ? (
    <NewProject firstRun={firstRun} onClose={() => setShowNew(false)} onCreated={projectCreated} />
  ) : null;

  if (!booted) return <div className="empty">starting ...</div>;
  if (configErr) {
    return (
      <div className="empty">
        {configErr}
        <br />
        Fix the file by hand, then reload. The panel will not write to it while it is broken.
      </div>
    );
  }
  if (firstRun) return overlay;
  if (err) return <>{overlay}<div className="empty">{err}</div></>;
  if (!data) return <>{overlay}<div className="empty">reading pipeline ...</div></>;
  const { pipeline, status } = data;
  const step = pipeline.steps.find(s => s.id === sel);
  const st = sel ? status[sel] : null;
  const lastJob = st && st.lastJobId ? jobs.find(j => j.id === st.lastJobId) : null;
  // The worker heartbeats on every poll of /api/jobs/claim (POLL_MS, 2s by
  // default), so anything inside a few missed polls is live. This used to be
  // inferred from job timestamps, which called a healthy idle worker offline
  // 60s after its last job.
  const workerAlive = data.workerSeen > 0 && Date.now() - data.workerSeen < 10000;

  async function setWorker(id, worker) {
    await fetch(`/api/steps/${id}${q}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ worker }) });
    refresh();
  }
  async function runGate(id) {
    await fetch("/api/jobs" + q, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ stepId: id, kind: "gate" }) });
    refresh();
  }
  async function review(id, action) {
    const note = action === "review_pass" ? prompt("Sign-off note (who approved, what was checked):") : prompt("What failed?");
    if (note === null) return;
    await fetch(`/api/steps/${id}${q}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, note }) });
    refresh();
  }
  async function resetStep(id) {
    await fetch(`/api/steps/${id}${q}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "reset" }) });
    refresh();
  }
  async function runLLM(id) {
    setLlmStream("");
    const res = await fetch("/api/llm" + q, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ stepId: id }) });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      setLlmStream("ERROR: " + (e.error || res.statusText));
      return;
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let acc = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      acc += dec.decode(value);
      setLlmStream(acc);
      if (streamRef.current) streamRef.current.scrollTop = streamRef.current.scrollHeight;
    }
    refresh();
  }

  function effStatus(id) {
    const s = status[id];
    if (s.status === "todo" && !s.ready) return "blocked";
    return s.status;
  }

  const done = pipeline.steps.filter(s => status[s.id].status === "passed").length;
  // What to do next: the first step in pipeline order that is unblocked and not
  // already finished. Pipeline order is dependency order, so the first match is
  // also the earliest useful one.
  const next = pipeline.steps.find(s => {
    const es = effStatus(s.id);
    return es !== "passed" && es !== "blocked" && es !== "running" && es !== "queued";
  });

  return (
    <>
      {overlay}
      <div className="top">
        <h1>THE WRECK WORKS</h1>
        <select className="projsel" value={proj || ""} onChange={e => { setProj(e.target.value); setSel(null); setData(null); }}>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button className="newbtn" onClick={() => setShowNew(true)}>+ NEW GAME</button>
        <span className="sub">{pipeline.steps.length} steps · pipeline v{pipeline.version}{data.project ? " · " + data.project.root : ""}</span>
        <span className="spacer" />
        <span className={"workerdot " + (link === "ok" && workerAlive ? "on" : "off")}>
          {link === "down"
            ? "○ panel unreachable — is npm run up still running?"
            : workerAlive ? "● worker active" : "○ worker offline — run: npm run worker"}
        </span>
      </div>
      <div className="wrap">
        <div className="board">
          {pipeline.phases.map(ph => (
            <div className="phase" key={ph}>
              <h2>[ {ph.toUpperCase()} ]</h2>
              <div className="cards">
                {pipeline.steps.filter(s => s.phase === ph).map(s => {
                  const es = effStatus(s.id);
                  return (
                    <button className={"card" + (sel === s.id ? " sel" : "")} key={s.id} onClick={() => { setSel(s.id); setLlmStream(null); }}>
                      <div className="row1">
                        <span className={"dot " + es} />
                        <span className="name">{s.name}</span>
                      </div>
                      <div className="meta">
                        <span className={"chip " + status[s.id].worker}>{status[s.id].worker}</span>
                        <span className="chip gatekind">{s.gate.kind === "review" ? "human gate" : "auto gate"}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {step && (
          <div className="drawer">
            <div>
              <h3>{step.name}</h3>
              <div className={"status " + st.status}>{effStatus(step.id).toUpperCase()}{st.note ? " · " + st.note : ""}</div>
              <div className="deps">
                needs: {step.depends_on.length === 0 ? "nothing" : step.depends_on.map(d => (
                  <span key={d} className={(status[d] || {}).status === "passed" ? "met" : "unmet"}>{d} </span>
                ))}
              </div>
            </div>

            {step.why && (
              <div className="sect why">
                <h4>WHY THIS STEP EXISTS</h4>
                <p>{step.why}</p>
              </div>
            )}

            <div className="sect">
              <h4>WORKER</h4>
              <select value={st.worker} onChange={e => setWorker(step.id, e.target.value)}>
                <option value="llm">LLM</option>
                <option value="human">human (manual)</option>
                <option value="auto">automated</option>
              </select>
            </div>

            <div className="sect">
              <h4>{st.worker === "human" ? "MANUAL RECIPE" : "LLM RECIPE"}</h4>
              <p>{(st.worker === "human" ? step.manual_recipe : step.llm_recipe) || "fully automated; no recipe needed"}</p>
            </div>

            <div className="sect">
              <h4>ARTIFACTS</h4>
              <div className="filelist">in: {step.inputs.join(", ") || "—"}</div>
              <div className="filelist">out: {step.outputs.join(", ")}</div>
            </div>

            <div className="sect">
              <h4>QUALITY GATE ({step.gate.kind})</h4>
              {step.gate.cmd && <p><code>{step.gate.cmd}</code></p>}
              <p>{step.gate.criteria}</p>
            </div>

            <div className="btnrow">
              {step.gate.cmd && <button className="btn" onClick={() => runGate(step.id)} disabled={st.status === "running" || st.status === "queued"}>RUN GATE</button>}
              {st.worker === "llm" && step.llm_recipe && <button className="btn purple" onClick={() => runLLM(step.id)}>RUN LLM STEP</button>}
              {step.gate.kind === "review" && <button className="btn" onClick={() => review(step.id, "review_pass")}>SIGN OFF: PASS</button>}
              {step.gate.kind === "review" && <button className="btn red" onClick={() => review(step.id, "review_fail")}>SIGN OFF: FAIL</button>}
              <button className="btn ghost" onClick={() => resetStep(step.id)}>RESET</button>
            </div>

            {llmStream !== null && (
              <div className="sect">
                <h4>LLM PROPOSAL (saved under the project&apos;s .factory/proposals/)</h4>
                <div className="log" ref={streamRef}>{llmStream || "thinking ..."}</div>
              </div>
            )}

            {lastJob && (
              <div className="sect">
                <h4>LAST RUN · job #{lastJob.id} · {lastJob.status}{lastJob.exitCode !== null ? " · exit " + lastJob.exitCode : ""}</h4>
                <div className="log">{lastJob.log || "(no output yet)"}</div>
              </div>
            )}
          </div>
        )}
        {!step && (
          <div className="drawer">
            <div>
              <h3>{data.project ? data.project.name : "THIS FACTORY"}</h3>
              <div className="deps">{done} of {pipeline.steps.length} gates passed</div>
            </div>

            <div className="sect why">
              <h4>HOW THIS WORKS</h4>
              <p>
                A step is done when its <b>gate</b> passes — whoever did the work. Pick a worker
                per step (Claude, yourself, or a script), do the work, then run the gate. That is
                the whole loop.
              </p>
            </div>

            {next ? (
              <div className="sect">
                <h4>START HERE</h4>
                <p><b>{next.name}</b> — {next.why || next.gate.criteria}</p>
                <div className="btnrow" style={{ marginTop: 10 }}>
                  <button className="btn" onClick={() => setSel(next.id)}>OPEN {next.id.toUpperCase()}</button>
                </div>
              </div>
            ) : (
              <div className="sect">
                <h4>NOTHING UNBLOCKED</h4>
                <p>
                  Every remaining step is waiting on a dependency. Open one to see what it needs,
                  or re-run a gate that failed.
                </p>
              </div>
            )}

            <div className="sect">
              <h4>WHAT THE DOTS MEAN</h4>
              <ul className="legend">
                <li><span className="dot todo" /> not started</li>
                <li><span className="dot blocked" /> blocked — a dependency has not passed</li>
                <li><span className="dot running" /> gate running</li>
                <li><span className="dot review" /> a proposal is waiting for you to apply it</li>
                <li><span className="dot passed" /> gate passed</li>
                <li><span className="dot failed" /> gate failed — open it for the log</li>
              </ul>
            </div>

            <div className="sect">
              <h4>IF NOTHING RUNS</h4>
              <p>
                Gates execute on the worker, not in this tab: <code>npm run worker</code> (or
                <code> npm run up</code> for both). LLM steps need <code>ANTHROPIC_API_KEY</code> in
                <code> web/.env.local</code>. Every gate here is also <code>make gate-&lt;id&gt;</code>
                {" "}in the project, so you can run the identical command yourself.
              </p>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
