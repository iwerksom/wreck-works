import fs from "fs";
import path from "path";
import { pipelinePath } from "./projects";

export function loadPipeline(project) {
  return JSON.parse(fs.readFileSync(pipelinePath(project), "utf8"));
}

export function readArtifact(project, rel, maxBytes = 200000) {
  // read-only artifact preview, guarded to the project root
  const root = path.resolve(project.root);
  const abs = path.resolve(root, rel);
  if (abs !== root && !abs.startsWith(root + path.sep)) throw new Error("outside project");
  const st = fs.statSync(abs);
  if (st.isDirectory()) return { kind: "dir", entries: fs.readdirSync(abs).slice(0, 200) };
  const buf = fs.readFileSync(abs);
  return {
    kind: "file",
    size: st.size,
    mtime: st.mtimeMs,
    text: buf.slice(0, maxBytes).toString("utf8"),
    truncated: st.size > maxBytes,
  };
}
