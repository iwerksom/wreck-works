// Creating a new project on disk.
//
// The factory deliberately never writes game *artifacts* — that stays with the
// gate and a human. Scaffolding is different: pipeline.json is the contract
// between a project and the factory, not content, and a project that does not
// exist yet cannot have a human apply a proposal to it.
//
// New projects are created as siblings of the factory checkout, which is what
// makes the relative roots in projects.json portable between machines.
import fs from "fs";
import path from "path";
import { CONFIG_PATH, listProjects } from "./projects";
import { buildPipeline, selectSteps } from "./catalogue";

// Apostrophes are dropped rather than turned into separators, so "The Liar's
// Room" is the-liars-room and not the-liar-s-room.
export function slugify(name) {
  return String(name)
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

// Where a new project goes: alongside projects.json, which sits at the factory
// root, so `../<slug>` from the factory is `<slug>` from the config's directory.
export function projectsDir() {
  const factoryRoot = path.dirname(CONFIG_PATH);
  const parent = path.dirname(factoryRoot);
  // path.dirname of a filesystem root returns the root again; in that one case
  // put the project inside the factory rather than trying to escape upwards.
  return parent === factoryRoot ? factoryRoot : parent;
}

function makefile(pipeline) {
  const auto = pipeline.steps.filter(s => s.gate.cmd);
  const lines = [
    "# Gate commands for " + pipeline.name + ".",
    "#",
    "# The factory runs `make gate-<id>` for every automated gate, so a green dot",
    "# in the panel and a green run in this terminal mean exactly the same thing.",
    "# Each target below fails until you implement it — that is honest, not broken:",
    "# an unwritten gate has not passed.",
    "",
    ".PHONY: gates " + auto.map(s => "gate-" + s.id).join(" "),
    "",
    "gates: " + auto.map(s => "gate-" + s.id).join(" "),
    "",
  ];
  for (const s of auto) {
    lines.push("# " + s.name);
    lines.push("# DONE WHEN: " + s.gate.criteria);
    lines.push("gate-" + s.id + ":");
    lines.push("\t@echo 'gate-" + s.id + " is not implemented yet.'");
    lines.push("\t@echo 'It must prove: " + s.gate.criteria.replace(/'/g, "") + "'");
    lines.push("\t@exit 1");
    lines.push("");
  }
  return lines.join("\n");
}

function readme(pipeline) {
  const byPhase = {};
  for (const s of pipeline.steps) (byPhase[s.phase] ||= []).push(s);
  const out = [
    "# " + pipeline.name,
    "",
    pipeline.description,
    "",
    "Built with [The Wreck Works](../wreck-works). The pipeline for this project",
    "is `pipeline.json`; the panel renders it and runs its gates. Every gate is",
    "also `make gate-<id>` here, so the panel and this terminal agree.",
    "",
    "## Profile",
    "",
    "| Question | Answer |",
    "| --- | --- |",
    "| Model architecture | " + pipeline.profile.architecture + " |",
    "| Spatial levels | " + (pipeline.profile.levels ? "yes" : "no") + " |",
    "| Fixed story beats | " + (pipeline.profile.narrative ? "yes" : "no") + " |",
    "| Economy / tuning | " + (pipeline.profile.economy ? "yes" : "no") + " |",
    "| Sound | " + (pipeline.profile.sound ? "yes" : "no") + " |",
    "",
    "These answers chose the steps below. See",
    "`../wreck-works/docs/WHY-THESE-STEPS.md` for the rule behind each one.",
    "",
    "## Steps",
    "",
  ];
  for (const ph of pipeline.phases) {
    out.push("### " + ph, "");
    for (const s of byPhase[ph]) {
      out.push("- **" + s.name + "** (`" + s.id + "`) — " + s.why);
    }
    out.push("");
  }
  out.push("## Next", "");
  out.push("1. Implement the gates in the `Makefile`, cheapest first.");
  out.push("2. Run the first step in the panel: `concept`, a review gate.");
  out.push("3. Nothing downstream unblocks until its dependencies pass.");
  out.push("");
  return out.join("\n");
}

// Fold Claude's rewritten prose into a pipeline built by the rules. Only the
// three prose fields can be replaced: ids, phases, gate kinds and dependencies
// come from the catalogue and are not a model's to change. gate.cmd is never
// touched either, so `make gate-<id>` keeps matching the Makefile.
function applyRecipes(pipeline, recipes) {
  if (!recipes) return pipeline;
  for (const step of pipeline.steps) {
    const r = recipes[step.id];
    if (!r) continue;
    if (typeof r.llm_recipe === "string" && r.llm_recipe.trim()) step.llm_recipe = r.llm_recipe.trim();
    if (typeof r.manual_recipe === "string" && r.manual_recipe.trim()) step.manual_recipe = r.manual_recipe.trim();
    if (typeof r.criteria === "string" && r.criteria.trim()) step.gate.criteria = r.criteria.trim();
  }
  return pipeline;
}

// Create the project directory, its pipeline, and register it. Returns the new
// projects.json entry. Throws with a readable message rather than a stack.
export function scaffoldProject({ name, description, profile, recipes }) {
  const clean = String(name || "").trim();
  if (!clean) throw new Error("A project needs a name.");
  const id = slugify(clean);
  if (!id) throw new Error(`"${clean}" has no letters or digits to make an id from.`);

  if (listProjects().some(p => p.id === id)) {
    throw new Error(`A project called "${id}" is already registered.`);
  }

  const root = path.join(projectsDir(), id);
  if (fs.existsSync(root) && fs.readdirSync(root).length) {
    throw new Error(`${root} already exists and is not empty. Move it aside, or pick another name.`);
  }

  const pipeline = buildPipeline({ name: clean, description, profile });
  applyRecipes(pipeline, recipes);

  fs.mkdirSync(path.join(root, "docs"), { recursive: true });
  fs.mkdirSync(path.join(root, "data"), { recursive: true });
  fs.writeFileSync(path.join(root, "pipeline.json"), JSON.stringify(pipeline, null, 2) + "\n");
  fs.writeFileSync(path.join(root, "Makefile"), makefile(pipeline));
  fs.writeFileSync(path.join(root, "README.md"), readme(pipeline));
  fs.writeFileSync(
    path.join(root, ".gitignore"),
    ".factory/\nnode_modules/\n"
  );

  // Forward slash, not path.join: projects.json is read on Windows and inside
  // WSL against the same checkout, and a backslash here does not survive that.
  const entry = { id, name: clean, root: "../" + id, pipeline: "pipeline.json" };
  registerProject(entry, id);
  return { id, name: clean, root, steps: pipeline.steps.length, phases: pipeline.phases };
}

// Add an entry to projects.json and make it active. Written whole and renamed,
// so an interrupted write cannot leave the factory with no projects at all.
export function registerProject(entry, makeActive) {
  let cfg = { active: null, projects: [] };
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    cfg = Array.isArray(raw) ? { active: null, projects: raw } : raw;
  } catch {
    // no config yet: the first project creates it
  }
  cfg.projects = (cfg.projects || []).filter(p => p.id !== entry.id).concat([entry]);
  if (makeActive) cfg.active = makeActive;
  const tmp = CONFIG_PATH + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2) + "\n");
  fs.renameSync(tmp, CONFIG_PATH);
  return cfg;
}

// Preview only: what a profile would produce, with no writes. The panel calls
// this on every toggle, so it must stay pure and cheap.
export function previewProfile(profile) {
  const sel = selectSteps(profile);
  return {
    count: sel.steps.length,
    phases: sel.phases,
    steps: sel.steps.map(s => ({
      id: s.id, phase: s.phase, name: s.name, why: s.why,
      gate: s.gate.kind, depends_on: s.depends_on,
    })),
    excluded: sel.excluded,
  };
}
