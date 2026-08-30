#!/usr/bin/env node
// The factory's hands: polls the control panel for queued jobs and executes
// their commands in the project the job came from. Run this on a machine that
// has the toolchain (node, python3+torch, godot, playwright) — your WSL box or
// a VM, not Vercel.
//
//   HARNESS=http://localhost:3100 node worker/worker.js
//   HARNESS=https://your-app.vercel.app FACTORY_PROJECT=ghost-in-the-wreck node worker/worker.js
//
// With no FACTORY_PROJECT the worker serves every project in projects.json.
const { spawn } = require("child_process");

const HARNESS = process.env.HARNESS || "http://localhost:3100";
const PROJECT = process.env.FACTORY_PROJECT || null;
const POLL_MS = Number(process.env.POLL_MS || 2000);
const q = PROJECT ? `?project=${encodeURIComponent(PROJECT)}` : "";

async function api(p, opts) {
  const res = await fetch(HARNESS + p, Object.assign({ headers: { "content-type": "application/json" } }, opts));
  return res.json();
}

function runCmd(cmd, cwd, onLog) {
  return new Promise(resolve => {
    const child = spawn("bash", ["-lc", cmd], { cwd, env: process.env });
    let buf = "";
    const flush = () => { if (buf) { onLog(buf); buf = ""; } };
    const timer = setInterval(flush, 1500);
    child.stdout.on("data", d => { buf += d.toString(); });
    child.stderr.on("data", d => { buf += d.toString(); });
    child.on("close", code => { clearInterval(timer); flush(); resolve(code); });
    child.on("error", err => { clearInterval(timer); onLog("spawn error: " + err.message + "\n"); resolve(127); });
  });
}

async function loop() {
  console.log(`[worker] harness=${HARNESS} project=${PROJECT || "(all)"}`);
  while (true) {
    let job = null;
    try {
      job = (await api(`/api/jobs/claim${q}`, { method: "POST" })).job;
    } catch {
      process.stdout.write("\r[worker] harness unreachable, retrying ...   ");
      await new Promise(r => setTimeout(r, 5000));
      continue;
    }
    if (!job) {
      await new Promise(r => setTimeout(r, POLL_MS));
      continue;
    }
    const pq = job.projectId ? `?project=${encodeURIComponent(job.projectId)}` : q;
    const post = body =>
      api(`/api/jobs/${job.id}${pq}`, {
        method: "POST",
        body: JSON.stringify(Object.assign({ projectId: job.projectId }, body)),
      });

    if (!job.cwd) {
      console.error(`[worker] job #${job.id} has no cwd; is the panel out of date?`);
      await post({ status: "failed", exitCode: 126, log: "job carried no project root\n" });
      continue;
    }

    console.log(`\n[worker] job #${job.id} (${job.projectId || "?"}/${job.stepId}) in ${job.cwd}`);
    console.log(`         ${job.cmd}`);
    await post({ log: `$ cd ${job.cwd}\n$ ${job.cmd}\n` });
    const code = await runCmd(job.cmd, job.cwd, log => post({ log }).catch(() => {}));
    await post({ status: code === 0 ? "done" : "failed", exitCode: code, log: `\n[exit ${code}]\n` });
    console.log(`[worker] job #${job.id} finished, exit ${code}`);
  }
}
loop();
