// The factory builds *projects*. A project is any repo that contains a
// pipeline.json; the harness has no knowledge of any particular game.
//
// projects.json lives at the repo root (override with FACTORY_PROJECTS).
// Relative roots resolve against that file's directory, so a checkout that
// sits next to its projects works with no absolute paths at all.
import fs from "fs";
import path from "path";

export const CONFIG_PATH =
  process.env.FACTORY_PROJECTS || path.resolve(process.cwd(), "..", "projects.json");

function readConfig() {
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    return Array.isArray(raw) ? { projects: raw } : raw;
  } catch {
    return { projects: [] };
  }
}

// Why projects.json cannot be used, or null if it can. A missing file is not a
// problem, it is a first run. Anything else (unreadable, not JSON, no projects
// array) is, and must reach the operator rather than look like an empty
// factory: readConfig above treats all of these as "no projects", and the
// new-game flow would then overwrite a file someone could still recover.
export function configProblem() {
  let text;
  try {
    text = fs.readFileSync(CONFIG_PATH, "utf8");
  } catch (e) {
    return e.code === "ENOENT" ? null : `Cannot read ${CONFIG_PATH}: ${e.message}.`;
  }
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return `${CONFIG_PATH} is not valid JSON: ${e.message}.`;
  }
  const projects = Array.isArray(raw) ? raw : raw && raw.projects;
  return Array.isArray(projects) ? null : `${CONFIG_PATH} has no "projects" array.`;
}

function normalise(p) {
  const base = path.dirname(CONFIG_PATH);
  return {
    id: p.id,
    name: p.name || p.id,
    root: path.resolve(base, p.root),
    pipeline: p.pipeline || "pipeline.json",
  };
}

export function listProjects() {
  return readConfig().projects.map(normalise);
}

export function getProject(id) {
  const all = listProjects();
  if (!all.length) {
    throw new Error(
      `No projects configured. Add one to ${CONFIG_PATH} — see projects.example.json.`
    );
  }
  const want = id || process.env.FACTORY_PROJECT || readConfig().active;
  return all.find(p => p.id === want) || all[0];
}

// Resolve the project a request is talking about: ?project=<id>.
export function projectFrom(req) {
  let id = null;
  try {
    id = new URL(req.url).searchParams.get("project");
  } catch {}
  return getProject(id);
}

export function pipelinePath(project) {
  const primary = path.join(project.root, project.pipeline);
  if (fs.existsSync(primary)) return primary;
  const legacy = path.join(project.root, "data", "pipeline.json"); // pre-split layout
  if (fs.existsSync(legacy)) return legacy;
  return primary;
}

export function stateDir(project) {
  return path.join(project.root, ".factory");
}
