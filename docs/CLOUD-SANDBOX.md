# Working away from the desktop

How to make progress on this project from a laptop that has no development
environment — on a train, in a cafe, on a machine too old to run a Next.js dev
server comfortably. One rule governs the whole document:

> **The panel and the worker are separate processes on purpose, and only the
> worker needs the toolchain.** Every recommendation below is a consequence of
> that split, which `README.md` § "Deploying the panel" already describes.

## 1. Three activities that need different answers

The mistake is treating "work on Wreck Works" as one thing. It is three, and the
dividing line is *not* panel-versus-desktop — it is whether a toolchain is
involved:

| | What it is | Where it runs | Desktop powered on? |
|---|---|---|---|
| **A. Changing the factory** | editing `web/`, API routes, gate logic, `tools/`, docs | a cloud sandbox | no |
| **B. Driving the panel** | the board, the step drawer, SIGN OFF | the laptop | no |
| **C. Running the gates** | RUN GATE, training, anything spawning `bash -lc` | the desktop | yes |

Only C is genuinely constrained. A is ordinary Node development. B was assumed
to need the desktop when this document was first written, and measurement said
otherwise — see §3.

Most cafe sessions are A and B, and neither needs the desktop awake.

## 2. What each machine is for

| Machine | Role | Needs |
|---|---|---|
| Laptop | reading code, reviewing diffs, **and running the panel** | git, portable node |
| Cloud sandbox | activity A — edit, build, test, push a branch | Linux, node 22+ |
| Desktop | activity C — the worker, with the real toolchain | godot, python+torch, Playwright |

## 3. The laptop runs the panel

Audited 2026-09-10 on the travel laptop (Windows 10 Home), node added 2026-09-11:

| Component | State | Note |
|---|---|---|
| git | 2.55.0.windows.5 | `C:\Program Files\Git` |
| bash | present | Git Bash — ships with Git for Windows, no WSL distro needed |
| curl | 8.21.0 | also from Git Bash; `tools/up.sh` needs it |
| Git Credential Manager | active, system level | browser sign-in; no tokens to store |
| node / npm | **portable, not installed** | v22.23.2 / 10.9.8 in `~/node-portable` |
| WSL | present, **zero distributions** | nothing to run Linux in |
| Repos | clones under `~/projects` | `wreck-works` + `ghost-in-the-wreck`, ~32 MB |

### Portable node, not an install

The original rule here was "no node on the laptop", on the reasoning that having
it invites running the expensive loop on the weakest machine. The reasoning
stands; the prohibition was too blunt. A portable node keeps the pull without
the push — it is there when you want the panel, and it is a directory you can
delete.

Download, verify and extract — the checksum step is not optional, this is a
runtime you are about to execute:

```bash
line=$(curl -s https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt | grep 'win-x64.zip$')
file=${line##* }
curl -sLO "https://nodejs.org/dist/latest-v22.x/$file"
echo "$line" | sha256sum -c -     # must print OK; stop here if it does not
mkdir -p ~/node-portable
tar -xf "$file" -C ~/node-portable --strip-components=1
```

The filename is derived from the checksum file rather than written out.
`latest-v22.x` is a moving alias: hard-code a version beside it and the day
Node 22.23.3 ships, the URL 404s while the checksum line describes an archive
you never downloaded — a verification step that silently stops verifying.
Pin `dist/v22.23.2/` instead if you want a fixed version; do not mix the two.

100 MB on disk, and it never joins the system `PATH`.

### Running things without the prefix

`tools/with-node.sh` puts node on `PATH` for one command, wherever this machine
keeps it:

```bash
bash tools/with-node.sh                 # starts the panel — the cafe case
bash tools/with-node.sh npm run build
bash tools/with-node.sh npm run worker
```

On a machine with a real node install it is a passthrough and prints nothing —
the same command works on the desktop and the laptop, which is the point. It
only goes looking when `node` is absent, so it can never shadow a working
install with a portable one and leave the panel and the gates on different
versions. `NODE_PORTABLE=/some/path` overrides where it looks.

It has to be a shell script. An npm script — `npm run dev:portable` — cannot
work, because running it requires npm already on `PATH`, which is the very
thing being arranged.

**Or put it in your profile.** Nothing is wrong with adding

```bash
export PATH="$HOME/node-portable:$PATH"
```

to `~/.bashrc` and then using plain `npm run dev`. An earlier version of this
document warned against that on the grounds that always-available node invites
running expensive work on the weakest machine; §3's measurements then showed
the laptop handles the panel comfortably, so the warning outlived its reason.
The tradeoff that remains is only this: a profile export helps one user on one
machine and leaves no trace in the repo, while the script works for anyone who
clones it. Do both if you like — the script is a no-op once node is on `PATH`.

### First run on a fresh checkout

`web/node_modules` and `projects.json` do not exist yet, so starting the panel
would fail on a missing `next` binary and then, once installed, show a board
with no project. Provision first:

```bash
bash tools/with-node.sh bash tools/cloud-setup.sh   # once
bash tools/with-node.sh                             # every time after
```

### What it actually costs, measured

Measured 2026-09-11 on the travel laptop, cold:

| | node 20 + next 14 | node 22 + next 16 |
|---|---|---|
| `npm ci` (33 packages) | 45s | 59s |
| `next dev` ready | 18s | **1.9s** |
| first page compile | 37s | sub-second |
| `next build` | passes | passes |
| `EBADENGINE` warnings | 5 | **none** |
| `npm audit` | 1 critical, 1 high | **clean** |

Every cell is a real run, not an estimate. The `EBADENGINE` and `npm audit` rows
are why both versions moved — see §9. The startup difference is Turbopack, which
is the default bundler in Next 16; it is the single biggest quality-of-life
change for working on a slow machine.

That is well inside usable. The prediction that this laptop was too slow for
`next dev` was wrong: the board renders all 19 steps, the step drawer opens, and
both `/api/pipeline` and `/api/projects` return real data resolved against the
sibling repo.

**Not** artifact previews, despite the name. `readArtifact` in
`web/lib/pipeline.js` calls itself a "read-only artifact preview" and the README
uses the phrase, but its only caller is `web/app/api/llm/route.js`, where it
builds model input. The drawer's ARTIFACTS section renders `step.inputs` and
`step.outputs` as comma-separated paths — no content, no preview route. Sharing
a filesystem with the projects is what makes RUN LLM STEP work, not an operator
preview that does not exist.

What does **not** work here is any gate needing python+torch, Godot or
Playwright. Gates degrade individually, so the board stays usable and only those
steps fail.

**`core.autocrlf` must be `input` here, not the Windows default `true`.**
`tools/up.sh` is a bash script and `worker/worker.js` spawns `bash -lc` for every
gate. Checking those out with CRLF endings breaks them under bash — including
Git Bash — with an error that points at the shell rather than at git.

## 4. Activity A: changing the factory from a sandbox

Run `tools/cloud-setup.sh`. It checks for git, node 22+ and npm before touching
anything. `web/package.json` declares `engines.node >= 22`, but npm only warns
on a mismatch unless `engine-strict` is set, so the preflight is what actually
stops an under-floor node before it produces a confusing failure later. Then it
handles the two things a fresh sandbox gets wrong:

**The pilot game must be cloned as a sibling.** `projects.example.json` sets
`root` to `../ghost-in-the-wreck`. Clone only this repo and `npm run setup` still
succeeds — the panel then reports "No pipeline found", which reads as a broken
panel rather than a missing checkout.

**Use `npm ci`, not `npm install`.** `web/package-lock.json` is committed, so
`ci` is reproducible and fails loudly on drift. The root package has no
dependencies at all; every script just delegates into `web/`.

The script is at `tools/cloud-setup.sh` rather than the more obvious
`.claude/setup.sh` because `.gitignore` excludes `.claude/` by an explicit
decision (2026-09-03). A setup script there is never committed, so a fresh clone
would not have it — exactly when it is needed.

### What a sandbox cannot tell you

It builds the panel. It does not run the pilot's gates: no Godot, no torch, no
Fallout 4. A green build in a container is evidence about the factory, never
about the game. Do not read it as more than that.

## 5. Activities B and C: panel here, gates there

**Default: run the panel on the laptop.** Nothing needs to be awake but the
machine in front of you.

    laptop:   npm run dev         # panel :3100, browser → localhost

The board, the step drawer and SIGN OFF all work. RUN GATE will fail for any
step whose gate needs Godot, torch or Playwright, because none of that is here —
gates degrade individually, so the rest of the board stays usable.

### When you need the gates too

Then the worker has to run where the toolchain is, and the panel has to be
somewhere the worker can reach. Two shapes:

    both on the desktop:  npm run up      # panel :3100 + worker, one filesystem
                          laptop → private tunnel → desktop:3100

    split:                laptop: npm run dev
                          desktop: HARNESS=http://<laptop>:3100 npm run worker

The split keeps the panel local and only borrows the desktop's toolchain, but
both machines must be on the same network or mesh, and the desktop must reach
*your* port rather than the other way round. The tunnel shape is the one
`README.md` documents; see the warning below before setting either up.

### Why not deploy the panel and keep only the worker home

That split is supported — `HARNESS=https://your-app.vercel.app npm run worker` —
and `README.md` documents it. It is still the wrong choice here, for two reasons
the README states plainly:

1. **`web/lib/store.js` assumes a persistent disk.** It is four small functions
   over JSON files. Deploying means replacing them with KV or Postgres first.
2. **A deployed panel cannot read project files.** `readArtifact` resolves paths
   against `project.root` on local disk, and RUN LLM STEP is its only caller —
   so a panel deployed away from the projects can still queue gates, but cannot
   assemble the inputs for an LLM step. (The README calls this "artifact
   previews"; there is no preview UI, only this.)

Keeping the panel next to the projects avoids both. The tunnel is the cheaper
change by a wide margin.

### Use a private tunnel, not a public one

The panel enqueues shell commands that the worker executes, and spends an
Anthropic API key. A public URL — an ngrok or Cloudflare quick tunnel — exposes
remote code execution on the desktop to anyone who finds it. There is no
authentication in front of the board.

Prefer a private mesh (Tailscale or equivalent) that only your own devices can
reach. If a public tunnel is ever unavoidable, put HTTP auth in front of it and
treat the key as compromised afterwards.

The advisory that previously blocked this is cleared. On `next@14.2.35`,
`npm audit` reported a critical for unauthenticated remote code execution on
Windows-hosted Next.js servers plus a high on `postcss`; the panel now runs
`next@16.3.4` and audits clean. Re-run `npm audit` before exposing the panel
rather than trusting this paragraph — it is true on the date above and decays.

## 6. Which gates run where

| Gate toolchain | Sandbox | Desktop | Note |
|---|---|---|---|
| node (`tools/plan-lint.js`) | yes | yes | pure node, travels anywhere |
| `next build` | yes | yes | |
| python3 + torch | in principle | yes | heavy in a container; training belongs on the desktop |
| Godot | no | yes | needs `godot` on PATH |
| Playwright | no | yes | **not a dependency of this repo** — it lives in the game repo's `test/` |
| Fallout 4 DLL (`tools/verify-dll.js`) | **never** | yes | Windows-only, and needs the game installed — see `FO4-TOOLCHAIN.md` |

Gates degrade individually: a missing tool fails only its own steps, so a
partial toolchain is workable rather than fatal.

## 7. Auditing the desktop

Run on the desktop, in a WSL/Linux shell, before relying on it from a cafe.
Record the results here the way `FO4-TOOLCHAIN.md` §2 does — an audit nobody
wrote down is an audit nobody can trust next month.

```bash
node --version; npm --version          # need node 22+
python3 -c 'import torch; print(torch.__version__)'
command -v godot || echo "godot: MISSING"
command -v curl  || echo "curl: MISSING — npm run up needs it"
ls ../ghost-in-the-wreck >/dev/null && echo "sibling game repo: present"
test -f web/.env.local && echo "ANTHROPIC_API_KEY: configured"
```

| Date | node | torch | godot | curl | Notes |
|---|---|---|---|---|---|
| _(not yet audited)_ | | | | | |

## 8. Environment variables

There is **no `.env.example` in this repo**. The list below was read from the
code, so treat the code as authoritative if the two ever disagree.

| Variable | Default | Read by | Purpose |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | — | `web/app/api/llm/route.js` | **The only real secret.** Goes in `web/.env.local`, on the machine running the panel. Only RUN LLM STEP fails without it. |
| `FACTORY_MODEL` | `claude-sonnet-4-5` | `web/app/api/llm/route.js` | model override |
| `HARNESS` | `http://localhost:3100` | `worker/worker.js` | which panel the worker serves |
| `FACTORY_PROJECT` | — | `worker/worker.js`, `web/lib/projects.js` | pin to one project id |
| `FACTORY_PROJECTS` | `../projects.json` | `web/lib/projects.js` | override the config path |
| `POLL_MS` | `2000` | `worker/worker.js` | worker claim interval |
| `PORT` | `3100` | `tools/up.sh` | panel port |
| `FO4HELLO_DLL`, `FO4HELLO_LOG`, `FO4_WINDOWS_USER` | see config | `tools/verify-dll.js` | Fallout 4 gate only |

`web/.env.local`, `.env`, `.env.local` and `projects.json` are all gitignored.

The key belongs on **whichever machine runs the panel**, and nowhere else. Since
§5 makes that the laptop by default, that now usually means `web/.env.local` on
the laptop — the opposite of what this section said before the panel was shown
to run here. If you adopt the tunnel shape instead, the key follows the panel to
the desktop. It never needs to exist on both.

## 9. Verification status

- **`tools/cloud-setup.sh` is proven on Linux.** `.github/workflows/setup.yml`
  runs it on every pull request against a cold `ubuntu-latest` checkout — the
  sibling clone, `projects.json`, `npm ci` and `next build` all pass, with no
  `ANTHROPIC_API_KEY` present. That last part is the useful half: it confirms
  the panel builds without a key, and that only RUN LLM STEP needs one. First
  green run 2026-09-10, 38s.

  The runner is also the only place the clone branch is ever exercised. A
  developer machine always has `../ghost-in-the-wreck` already on disk, so a
  local run skips it every time.
- **The panel is proven on the travel laptop.** `npm ci`, `next dev`, the board,
  both API routes and the step drawer, under Windows — 2026-09-11. Numbers
  in §3.
- **The node floor now matches the dependencies.** `ai@7.0.84` and four
  `@ai-sdk/*` packages declare `engines.node >= 22`, while the README, the
  preflight and CI all said 20. npm only warns `EBADENGINE` and carries on, so
  nothing was visibly broken — but the LLM step runner was the piece running
  below its own stated floor, which is also the piece hardest to notice failing.
  All three now say 22. Verified on portable node 22.23.2: clean `npm ci` with
  no `EBADENGINE`, `next build` passes, and the preflight correctly rejects
  node 20 with exit 1.
- **The panel runs Next 16, and the dynamic routes were checked at runtime.**
  `params` became a promise in Next 15; the old synchronous form does not throw,
  it just yields `undefined`, so `/api/jobs/[id]` would have missed every lookup
  and `/api/steps/[id]` would have written to `db.steps["undefined"]`. A build
  cannot catch either. Verified live on 2026-09-11: `/api/jobs/1` returns the
  real job while `/api/jobs/99999` returns null, and a PATCH to
  `/api/steps/format_spec` landed under that key with no `undefined` key
  created. Test state was removed afterwards.
- **The FO4 gate's WSL-node combination is still untested** — see
  `FO4-TOOLCHAIN.md` §8. The committed config assumes Windows Node, and
  switching it needs a machine where the DLL exists.
- **The desktop's toolchain state is unaudited** — §7 is an empty table on
  purpose.
