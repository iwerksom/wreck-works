# Working away from the desktop

How to make progress on this project from a laptop that has no development
environment — on a train, in a cafe, on a machine too old to run a Next.js dev
server comfortably. One rule governs the whole document:

> **The panel and the worker are separate processes on purpose, and only the
> worker needs the toolchain.** Every recommendation below is a consequence of
> that split, which `README.md` § "Deploying the panel" already describes.

## 1. Two activities that need different answers

The mistake is treating "work on Wreck Works" as one thing. It is two, and they
live on different machines:

| | What it is | Where it runs | Desktop powered on? |
|---|---|---|---|
| **A. Changing the factory** | editing `web/`, API routes, gate logic, `tools/`, docs | a cloud sandbox | no |
| **B. Running the factory** | driving the board, RUN GATE, RUN LLM STEP, training | the desktop | yes |

Only B is genuinely constrained. A is ordinary Node development and moves
anywhere. Most cafe sessions should be A.

## 2. What each machine is for

| Machine | Role | Needs |
|---|---|---|
| Laptop | reading code, reviewing diffs, a browser tab | git, a browser |
| Cloud sandbox | activity A — edit, build, test, push a branch | Linux, node 20+ |
| Desktop | activity B — the panel and the worker, together | the full toolchain |

## 3. The laptop is a thin client, deliberately

Audited 2026-09-10 on the travel laptop (Windows 10 Home, PowerShell 5.1):

| Component | State | Note |
|---|---|---|
| git | 2.55.0.windows.5 | `C:\Program Files\Git` |
| bash | present | Git Bash — ships with Git for Windows, no WSL distro needed |
| Git Credential Manager | active, system level | browser sign-in; no tokens to store |
| node / npm | **absent** | deliberate — see below |
| WSL | present, **zero distributions** | nothing to run Linux in |
| Repos | shallow clones under `~/projects` | `wreck-works` + `ghost-in-the-wreck`, ~32 MB |

**Node is deliberately not installed.** The only thing it buys a laptop is
running `next dev` locally, which is the single most expensive thing this
project asks of a machine — dev server, plus a worker polling twice a second,
plus streaming API calls. And the worker needs bash anyway, so on Windows a real
setup also wants a WSL distro, whose VM costs memory an old laptop does not
have. Installing Node is what quietly pulls the work back onto the weakest
machine.

**`core.autocrlf` must be `input` here, not the Windows default `true`.**
`tools/up.sh` is a bash script and `worker/worker.js` spawns `bash -lc` for every
gate. Checking those out with CRLF endings breaks them under bash — including
Git Bash — with an error that points at the shell rather than at git.

## 4. Activity A: changing the factory from a sandbox

Run `tools/cloud-setup.sh`. It handles the two things a fresh sandbox gets wrong:

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

## 9. Not yet verified

Stated plainly so nobody mistakes this document for a tested procedure:

- **`npm ci` and `next build` have not been run for this project on any machine
  in this workflow.** `tools/cloud-setup.sh` is written from the code and the
  lockfile, not from a successful run. The first cloud session should run it and
  correct this document.
- The desktop's toolchain state is unaudited — §7 is an empty table on purpose.
