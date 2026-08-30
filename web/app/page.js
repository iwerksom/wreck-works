"use client";
import { useEffect, useRef, useState, useCallback } from "react";

export default function Factory() {
  const [projects, setProjects] = useState([]);
  const [proj, setProj] = useState(null);      // active project id
  const [data, setData] = useState(null);      // {project, pipeline, status}
  const [err, setErr] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [sel, setSel] = useState(null);        // selected step id
  const [llmStream, setLlmStream] = useState(null);
  const streamRef = useRef(null);

  const q = proj ? `?project=${encodeURIComponent(proj)}` : "";

  useEffect(() => {
    fetch("/api/projects").then(r => r.json()).then(r => {
      setProjects(r.projects || []);
      setProj(cur => cur || r.active);
      if (r.error) setErr(r.error);
    });
  }, []);

  const refresh = useCallback(async () => {
    const [p, j] = await Promise.all([
      fetch("/api/pipeline" + q).then(r => r.json()),
      fetch("/api/jobs" + q).then(r => r.json()),
    ]);
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

  if (err) return <div className="empty">{err}</div>;
  if (!data) return <div className="empty">reading pipeline ...</div>;
  const { pipeline, status } = data;
  const step = pipeline.steps.find(s => s.id === sel);
  const st = sel ? status[sel] : null;
  const lastJob = st && st.lastJobId ? jobs.find(j => j.id === st.lastJobId) : null;
  const workerAlive = jobs.some(j => j.claimed && Date.now() - j.claimed < 60000) ||
    jobs.some(j => j.finished && Date.now() - j.finished < 60000);

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

  return (
    <>
      <div className="top">
        <h1>THE WRECK WORKS</h1>
        {projects.length > 1 ? (
          <select className="projsel" value={proj || ""} onChange={e => { setProj(e.target.value); setSel(null); setData(null); }}>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        ) : (
          <span className="sub">{data.project ? data.project.name : ""}</span>
        )}
        <span className="sub">{pipeline.steps.length} steps · pipeline v{pipeline.version}{data.project ? " · " + data.project.root : ""}</span>
        <span className="spacer" />
        <span className={"workerdot " + (workerAlive ? "on" : "off")}>
          {workerAlive ? "● worker active" : "○ worker offline — run: node worker/worker.js"}
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
        {!step && <div className="drawer"><div className="empty">select a step</div></div>}
      </div>
    </>
  );
}
