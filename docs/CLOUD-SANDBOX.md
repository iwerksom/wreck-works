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
| **B. Driving the panel** | the board, step drawer, artifact previews, SIGN OFF | the laptop | no |
| **C. Running the gates** | RUN GATE, training, anything spawning `bash -lc` | the desktop | yes |

Only C is genuinely constrained. A is ordinary Node development. B was assumed
to need the desktop when this document was first written, and measurement said
otherwise — see §3.

Most cafe sessions are A and B, and neither needs the desktop awake.

## 2. What each machine is for

| Machine | Role | Needs |
|---|---|---|
| Laptop | reading code, reviewing diffs, **and running the panel** | git, portable node |
| Cloud sandbox | activity A — edit, build, test, push a branch | Linux, node 20+ |
| Desktop | activity C — the worker, with the real toolchain | godot, python+torch, Playwright |

## 3. The laptop runs the panel

Audited 2026-09-10 on the travel laptop (Windows 10 Home), node added 2026-09-11:

| Component | State | Note |
|---|---|---|
| git | 2.55.0.windows.5 | `C:\Program Files\Git` |
| bash | present | Git Bash — ships with Git for Windows, no WSL distro needed |
| curl | 8.21.0 | also from Git Bash; `tools/up.sh` needs it |
| Git Credential Manager | active, system level | browser sign-in; no tokens to store |
| node / npm | **portable, not installed** | v20.20.2 / 10.8.2 in `~/node-portable` |
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
curl -s https://nodejs.org/dist/latest-v20.x/SHASUMS256.txt | grep 'win-x64.zip$'
curl -sL -o node20.zip https://nodejs.org/dist/latest-v20.x/node-v20.20.2-win-x64.zip
sha256sum node20.zip          # must match the line above
mkdir -p ~/node-portable
tar -xf node20.zip -C ~/node-portable --strip-components=1
```

85 MB on disk. It never joins the system `PATH`; scope it per command instead:

```bash
PATH="$HOME/node-portable:$PATH" npm run dev
```

### What it actually costs, measured

Measured 2026-09-11, first run on the travel laptop:

| | |
|---|---|
| `npm ci` (33 packages) | 45s |
| `next dev` ready | 18s |
| first page compile | 37s |
| after warm-up | responsive |

That is well inside usable. The prediction that this laptop was too slow for
`next dev` was wrong, and the board — 19 steps, artifact previews, the step
drawer — works. Previews work specifically because the panel and the game repo
share this filesystem, which is the same reason §5 argues against deploying the
panel away from the projects.

What does **not** work here is any gate needing python+torch, Godot or
Playwright. Gates degrade individually, so the board stays usable and only those
steps fail.

**`core.autocrlf` must be `input` here, not the Windows default `true`.**
`tools/up.sh` is a bash script and `worker/worker.js` spawns `bash -lc` for every
gate. Checking those out with CRLF endings breaks them under bash — including
Git Bash — with an error that points at the shell rather than at git.

## 4. Activity A: changing the factory from a sandbox

Run `tools/cloud-setup.sh`. It checks for git, node 20+ and npm before touching
anything — `web/package.json` has no `engines` field, so nothing else catches a
too-old node until `next build` fails much later with an error that no longer
mentions node. Then it handles the two things a fresh sandbox gets wrong:

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

## 5. Activity B: running the factory from a cafe

**Run both halves on the desktop and reach the panel over a private tunnel.**
The laptop is a browser tab.

    desktop:  npm run up          # panel :3100 + worker, one filesystem
    laptop:   browser → tunnel → desktop:3100

### Why not deploy the panel and keep only the worker home

That split is supported — `HARNESS=https://your-app.vercel.app npm run worker` —
and `README.md` documents it. It is still the wrong choice here, for two reasons
the README states plainly:

1. **`web/lib/store.js` assumes a persistent disk.** It is four small functions
   over JSON files. Deploying means replacing them with KV or Postgres first.
2. **A deployed panel cannot read project files.** Artifact previews and LLM step
   inputs both assume the panel and the projects share a filesystem. Deploy the
   panel and that whole class of feature goes dark.

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

**Do not set up any tunnel while the panel is on `next@14.2.35`.** `npm audit`
on 2026-09-11 reports a critical advisory for unauthenticated remote code
execution on Windows-hosted Next.js servers, plus a high on `postcss`, both
fixed only by `next@16.3.4` — a breaking major. Bound to `localhost` the
exposure is limited; the entire point of a tunnel is to stop it being bound to
localhost. Upgrade first, then tunnel.

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
node --version; npm --version          # need node 20+
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
The key belongs on the panel machine and nowhere else — never on the laptop,
which never runs the panel.

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
  both API routes and artifact previews, on portable node 20.20.2 under Windows
  — 2026-09-11. Numbers in §3.
- **Our node floor is below what the dependencies ask for.** `ai@7.0.84` and
  four `@ai-sdk/*` packages declare `engines.node >= 22`; the README, the
  `tools/cloud-setup.sh` preflight and CI all say 20. npm emits `EBADENGINE` and
  continues, and `next build` passes, so this is a warning rather than a
  breakage — but the LLM step runner is the part running below its own stated
  floor, and that is the part hardest to notice failing. Unresolved.
- **The FO4 gate's WSL-node combination is still untested** — see
  `FO4-TOOLCHAIN.md` §8. The committed config assumes Windows Node, and
  switching it needs a machine where the DLL exists.
- **The desktop's toolchain state is unaudited** — §7 is an empty table on
  purpose.
