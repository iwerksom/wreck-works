// Tiny JSON-file store, one database per project. Local-first by design: a
// project's run state lives with the project, at <project.root>/.factory/.
// On Vercel the filesystem is ephemeral; swap these functions for KV/Postgres
// if you deploy the panel (see README).
import fs from "fs";
import path from "path";
import { stateDir } from "./projects";

const dbPath = project => path.join(stateDir(project), "db.json");

function blank() {
  return { steps: {}, jobs: [], nextJobId: 1 };
}

export function readDb(project) {
  try {
    return JSON.parse(fs.readFileSync(dbPath(project), "utf8"));
  } catch {
    return blank();
  }
}

export function writeDb(project, db) {
  fs.mkdirSync(stateDir(project), { recursive: true });
  const file = dbPath(project);
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 1));
  fs.renameSync(tmp, file);
}

export function update(project, fn) {
  const db = readDb(project);
  const out = fn(db) || db;
  writeDb(project, out);
  return out;
}

export function saveProposal(project, stepId, text) {
  const dir = path.join(stateDir(project), "proposals");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${stepId}-${Date.now()}.md`);
  fs.writeFileSync(file, text);
  return path.relative(project.root, file);
}
