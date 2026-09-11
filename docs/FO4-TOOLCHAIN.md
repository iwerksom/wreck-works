# Fallout 4 toolchain

The pinned, reproducible build environment for every Fallout 4 milestone in this
program (M0.3 onward). One rule governs the whole document:

> **Nothing here floats.** Game version, F4SE build, library commit and compiler
> are all pinned and recorded. A Fallout 4 toolchain that auto-updates will break
> mid-milestone, and the plan's own risk table says so.

## 1. The version decision

Target: **the current next-gen runtime, 1.11.240.**

Fallout 4 has three live modding worlds, and they do not mix:

| Runtime | F4SE build | Who is there |
|---|---|---|
| 1.10.163 | 0.6.23 | The old-gen holdouts. Most tutorials and older plugins. |
| 1.10.984 | 0.7.2 | The original April 2024 next-gen update. |
| **1.11.240** | **0.7.9** | **What Steam ships today. Our target.** |

Chosen deliberately over downgrading to 1.10.163: it is the largest current
player base, it is what a fresh Steam install gives you, and it is the version a
studio would ask about. The cost is a thinner ecosystem and exposure to future
Bethesda patches — which §6 exists to handle.

`libxse/commonlibf4` defines `RUNTIME_LATEST = 1.11.240`, so the library and the
target runtime are currently in exact agreement. That will not stay true forever;
check it after any library update.

### Pin the version at install time

The moment Steam finishes, record the real number — do not trust this document
to still be right:

```bash
# From WSL, against the Steam install:
exiftool "/mnt/c/Program Files (x86)/Steam/steamapps/common/Fallout 4/Fallout4.exe" | grep -i "file version"
```

or in PowerShell:

```powershell
(Get-Item "C:\Program Files (x86)\Steam\steamapps\common\Fallout 4\Fallout4.exe").VersionInfo.FileVersion
```

Write the result into §7 below, in the same commit that closes M0.3. The plugin
also logs it on every load (`REL::GetFileVersion("Fallout4.exe")`), so the F4SE
log is a second, self-maintaining record.

### Turn off auto-updates immediately

In Steam: **Fallout 4 → Properties → Updates → "Only update this game when I
launch it"**, and then always launch through `f4se_loader.exe`, never through
Steam's Play button. This is the single highest-value five seconds in the whole
setup. Mantella lost a working Skyrim toolchain to exactly this in August 2026.

## 2. Prerequisites, and where this machine actually stands

Audited 2026-09-07. Checked items need no action.

| Component | Required | On this machine | Action |
|---|---|---|---|
| Fallout 4 | 1.11.240, Steam | **1.11.240.0 installed**, buildid `24564252` | Disable auto-updates (§1) |
| Free space | headroom for CK, MO2, builds | C: 51 GB of 931 GB (95% used); **D: 908 GB of 932 GB** | Put new installs on D: — §3 |
| MSVC | 2022 Build Tools, C++23 (19.4x) | **2019 Build Tools 16.11, MSVC 14.29** | Install Build Tools 2022 — §2.2 |
| Windows SDK | 10.0.22621+ | 10.0.19041 | Comes with the above |
| xmake | 3.0.0+ | **Not installed** | `winget install xmake-io.xmake` |
| Node.js | **22+** | v20.10.0 Windows-side; also in WSL since 2026-09-09 | **Below the floor — see §5** |
| F4SE | 0.7.9 | Not installed | f4se.silverlock.org |
| Address Library for F4SE Plugins | next-gen version | Not installed | Nexus mod 47327 |
| Creation Kit | latest | Not installed | Bethesda launcher — needed for `PapyrusCompiler.exe` |
| Mod Organizer 2 | 2.5+ | **Not installed** | github.com/ModOrganizer2 |

### 2.2 Getting MSVC 2022 — you do not need the Visual Studio IDE

You need the **compiler**, not the IDE. **Visual Studio Build Tools 2022** with
the "Desktop development with C++" workload is a free, command-line-only install
that provides MSVC 19.4x and the Windows SDK. VS Code plus the `xmake` and
`clangd` extensions is then a perfectly good editor — `xmake project -k
compile_commands` generates the index clangd needs.

What will *not* work is the MSVC 14.29 already on this machine. CommonLibF4 sets
`set_languages("c++23")`; VS 2019 tops out at C++20. This is a hard stop, not a
warning.

**The existing Visual Studio Installer will not offer you 2022.** It is a
2019-era installer pinned to the 2019 channel and does not know 2022 products
exist. Run Microsoft's 2022 bootstrapper instead: it upgrades the installer
itself, then installs Build Tools 2022 *side by side* with 2019. Nothing is
removed.

Get it from Microsoft only — <https://aka.ms/vs/17/release/vs_BuildTools.exe>,
or via Downloads → "Tools for Visual Studio" → "Build Tools for Visual
Studio 2022" at <https://visualstudio.microsoft.com/downloads/>. Anything
offering "VS Build Tools 2022" from the Visual Studio Marketplace is a
third-party extension, not the compiler, and will not work.

With winget:

```powershell
winget install --id Microsoft.VisualStudio.2022.BuildTools --override `
  "--quiet --wait --norestart --installPath D:\VS\BuildTools2022 --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

Or from the downloaded bootstrapper:

```powershell
.\vs_BuildTools.exe --installPath D:\VS\BuildTools2022 `
  --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended --passive --norestart
```

**The `--add` is the whole point.** Installing Build Tools 2022 without it
succeeds, registers in `vswhere`, and gives you MSBuild and nothing else — no
`cl.exe`, no MSVC toolset, no C++ at all. It looks installed and is not. This
happened here on 2026-09-07: `VC\Tools\MSVC\` was simply absent. To repair an
install already in that state, re-run the same command — it modifies in place —
or use the Visual Studio Installer GUI: Build Tools 2022 → Modify → check
**Desktop development with C++** → Modify.

Confirm the compiler component actually exists before believing any of it:

```powershell
& "C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe" `
  -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 `
  -format value -property installationPath
```

Empty output means no install on the machine has the C++ compiler, whatever the
Installer's product list claims.

`--installPath` on D: keeps the ~7 GB workload off a drive at 95%. Note that a
shared component cache of roughly 1.5 GB still goes to C: regardless; that is a
Visual Studio design decision, not something the flags can override.

Verify from a Developer Command Prompt for VS 2022:

```
cl.exe            # must report 19.4x — if it says 19.29, you are in the 2019 prompt
```

## 3. Where things go: C: is full, D: is empty

C: sits at 95% used (51 GB free of 931 GB). D: is essentially untouched — 908 GB
free of 932 GB. The download landed on C: with room to spare, so nothing is
blocked, but every remaining install should default to D:.

| What | Where | Why |
|---|---|---|
| Fallout 4 (27 GB, already on C:) | move to D: | Optional but recommended. Steam → Properties → Installed Files → Move install folder. Frees 27 GB on the drive that is nearly full. |
| VS Build Tools 2022 (~7 GB) | D: | `--installPath D:\VS\BuildTools2022`. ~1.5 GB of shared cache still goes to C: regardless. |
| Creation Kit | follows the game | It installs alongside Fallout 4, so moving the game moves the CK's future home too. Do the move first. |
| Mod Organizer 2 + mods | D: | Mod staging grows without limit. Never put it on C:. |
| Build output | wherever the repo is | Small; irrelevant either way. |

### If you move the game to D:

Two things reference the install path and must follow it:

- `scripts/build-papyrus.bat` defaults to the C: Steam path. Set the override:

  ```powershell
  setx FO4_PATH "D:\SteamLibrary\steamapps\common\Fallout 4"
  ```

- If you use xmake's deploy step, set `XSE_FO4_GAME_PATH` (or
  `XSE_FO4_MODS_PATH` for an MO2 mods folder) to match.

Do the move **before** installing the Creation Kit and MO2, not after — Steam
moves the game cleanly on its own, but the CK and MO2 both record absolute paths
at install time and are far more annoying to relocate afterwards.

## 4. Install order

The order matters — each step's verification depends on the previous one.

1. ~~**Fallout 4**, from Steam.~~ **Done** — 1.11.240.0, buildid `24564252`.
   Still outstanding: launch it once to the main menu so it writes
   `Documents\My Games\Fallout4\`, quit, and **disable auto-updates** (§1).
   If moving to D:, do that first (§3).
2. ~~**Record the version.**~~ **Done** — see §7.
3. **Visual Studio Build Tools 2022**, "Desktop development with C++".
   Verify: `cl.exe` reports 19.4x from a Developer Command Prompt.
4. **xmake 3.0.0+**. Verify: `xmake --version`.
5. **F4SE 0.7.9**. Extract `f4se_loader.exe`, `f4se_*.dll` and `Data\` into the
   game root. Verify: launch `f4se_loader.exe`, open the console, type
   `getf4seversion`.
6. **Address Library for F4SE Plugins** (Nexus 47327). The F4SE download page
   links straight here, which is a good hint about how mandatory it is.

   The "All In One" archive contains a `.bin` for every runtime ever shipped
   (~170 MB). Copy only the one matching your pinned runtime into
   `Data\F4SE\Plugins\` — for 1.11.240 that is `version-1-11-240-0.bin`.
   Keeping only the matching file means the install cannot silently disagree
   with §7, and a wrong-version `.bin` is one of the few ways to get a plugin
   that loads and then behaves unpredictably rather than failing cleanly.
7. **Mod Organizer 2** (github.com/ModOrganizer2/modorganizer — GitHub or the
   project's Nexus page only; MO2 has a long history of malicious mirrors).
   Install to D:. Choose a **portable** instance, not a global one: a global
   instance stages mods under `%LOCALAPPDATA%` on C:, and mod staging grows
   without limit.

   Enable all three profile options — profile-specific INIs, profile-specific
   saves, and automatic archive invalidation. Then create two profiles:

   - `dev` — mods enabled, your working setup
   - `clean` — mods disabled, no saves, the model of a fresh user

   Two consequences worth knowing before they surprise you. Profile-specific
   saves means a new profile starts with **no** save games; the real ones stay
   in `Documents\My Games\Fallout4\Saves` and must be copied into
   `profiles\<name>\saves\` — with their `.f4se` cosaves, which carry
   serialized plugin data and are useless separated from their `.fos`. And
   profile-specific INIs are copied in once, so INI edits made outside MO2 after
   that never reach the profile.

   Keep the saves split anyway: Papyrus bakes script state into saves, so a save
   contaminated by an earlier build of a script mod produces phantom behaviour
   that reads exactly like a code bug.

   **Everything goes through MO2, nothing loose in the game folder.** The game
   directory should hold only F4SE's loader files and vanilla content; plugins
   and scripts live in `mods\<name>\` and are injected by MO2's virtual
   filesystem at launch. Verified 2026-09-08: with
   `Data\F4SE\Plugins\` empty and no `FO4Hello.pex` on disk, the M0.3 gate
   still passes end to end. That is what makes the install disposable — and it
   is a precondition for M0.4's gate, which asks whether a mod works from a
   genuinely clean state. You cannot answer that against a contaminated
   baseline.

   Launch F4SE from MO2's Run dropdown. Running `f4se_loader.exe` directly
   bypasses the virtual filesystem and loads none of it.
8. **Creation Kit** — from **Steam**, as the free app *Fallout 4: Creation Kit*
   (appid `1946160`). **Not** the Bethesda.net Launcher: that was retired in
   2022, which is the trap here — following an older guide leaves you believing
   the CK is installed when nothing landed on disk at all.

   It installs into the Fallout 4 folder and brings `Papyrus Compiler\`. Then
   unpack `Data\Scripts\Source\Base.zip` in place — the compiler needs those
   sources on its import path.

   Required, not optional: see "The .pex is not optional" in §8.
9. **Enable loose files.** Fallout 4 ships with
   `sResourceDataDirsFinal=STRINGS\` in `Fallout4.ini`, which restricts loose
   file loading to that one directory. Everything else on disk — scripts,
   meshes, textures — is ignored no matter how correctly it is placed. Append to
   `Documents\My Games\Fallout4\Fallout4Custom.ini`:

   ```ini
   [Archive]
   bInvalidateOlderFiles=1
   sResourceDataDirsFinal=
   ```

   The empty value is deliberate, not a typo: it clears the whitelist.

   This is a prerequisite for the whole program, not just M0.3 — every loose
   `.pex`, `.dll` script binding and asset from here on depends on it. It also
   fails in the least helpful way possible: nothing errors, nothing warns, the
   file is simply never read, so the symptom is a valid artifact in the right
   directory that the game behaves as though does not exist.

10. **The plugin repo** — it lives at `D:\dev\fo4-hello`, on the **Windows**
   filesystem, not in WSL. MSVC handles UNC working directories
   (`\\wsl.localhost\...`) badly and building across the 9p bridge is slow, so
   anything MSVC compiles belongs on a real Windows drive. From PowerShell:

   ```powershell
   cd D:\dev\fo4-hello
   xmake build
   ```

   Note `;` rather than `&&` if you put both on one line — Windows PowerShell
   5.1 rejects `&&` as a statement separator. PowerShell 7+ accepts it.

   xmake finds MSVC through `vswhere` on its own; a Developer Command Prompt is
   not required. The first build also fetches xmake's package dependencies.

## 5. Node.js from WSL

**Node is installed inside WSL as of 2026-09-09.** `plan-lint.js` and anything
else that only touches repo-relative paths now run the ordinary way:

```bash
node tools/plan-lint.js
```

**The floor is now node 22+** — `ai` and the `@ai-sdk` packages declare
`engines.node >= 22`, so the v20.10.0 recorded in §2 is below it and should be
upgraded on this machine. Previously only the Windows install existed, and every gate had to be invoked as
`"/mnt/c/Program Files/nodejs/node.exe" ...`. That is no longer necessary — but
it is still *sometimes correct*, because which Node runs a script now decides
how that script's paths must be written. `tools/verify-dll.js` is the one place
where it matters; see §8.

## 6. When a game update breaks everything

The scenario the risk table names, written down before it happens:

1. **Do not panic-update.** The old install still works; only Steam's copy moved.
2. Check f4se.silverlock.org for a build matching the new runtime. There is
   usually a gap of days to weeks.
3. Check whether `libxse/commonlibf4` has added the new runtime to
   `include/F4SE/Version.h` and moved `RUNTIME_LATEST`. Until it has, plugins
   built against the old header will refuse to load.
4. Only then bump the submodule, rebuild, and re-run the gate.
5. Record the new pin in §7 as a new row. Do not edit the old row — the history
   of which version shipped which release is evidence, and P1's model card will
   cite it.

The fallback, if this lands mid-milestone: the plan's risk table already says to
drop to Papyrus-only mechanics for v1 and defer the C++ work, rather than sitting
blocked waiting for an upstream release.

## 7. The pin record

Append, never overwrite — which version shipped which release is evidence.

| Date | Game runtime | Steam BuildID | F4SE | commonlibf4 commit | MSVC |
|---|---|---|---|---|---|
| 2026-09-07 | **1.11.240.0** | `24564252` | **0.7.9** | `16cff687` | **14.44.35207** (VS 17.14, cl 19.44) |

Every column is confirmed from the artifact itself, not from a download page:
the runtime from `Fallout4.exe`'s `FileVersion`, F4SE from
`f4se_1_11_240.dll`'s (`0,0,7,9`), MSVC via `vswhere -requires`. The row is
complete; the game install is now fully pinned.

Tooling, pinned the same way:

| Tool | Version | Location |
|---|---|---|
| Mod Organizer 2 | 2.5.2 (portable) | `D:\Modding\MO2` |
| xEdit / FO4Edit | 4.1.5f | `D:\Modding\xEdit.4.1.5f` |
| Creation Kit | Steam appid 1946160 | in the game folder |
| xmake | 3.x | `C:\Program Files\xmake` |

xEdit ships family binaries — `xFOEdit`, `xTESEdit`, `xSFEdit`, each with a
64-bit variant — and picks its game from its own filename. There is no
`FO4Edit.exe` in the archive; copy `xFOEdit64.exe` to `FO4Edit64.exe` to get one.
Copy rather than rename, so the originals stay usable for the rest of the family.

Register both MO2 tools as MO2 executables and launch them from there. Anything
started outside MO2 misses the virtual filesystem: F4SE loads no mods at all, and
xEdit silently reads the vanilla `Data` folder rather than what the game actually
loads — which looks like working software giving wrong answers.

The F4SE DLL is named for the runtime it supports, so `f4se_1_11_240.dll`
sitting next to a 1.11.240.0 `Fallout4.exe` is itself the compatibility check.
A mismatch here is the single most common reason F4SE silently fails to load
anything.

## 8. The M0.3 gate

Build on the Windows side (PowerShell):

```powershell
cd D:\dev\fo4-hello
xmake build
```

Then run the gate from WSL, in the wreck-works repo:

```bash
"/mnt/c/Program Files/nodejs/node.exe" tools/verify-dll.js
```

`tools/verify-dll.config.json` carries the machine-specific paths — the build
output on D: and the log under the Windows user profile — so the script itself
stays portable. `FO4HELLO_DLL` and `FO4HELLO_LOG` override either.

### The config and the interpreter must agree

**Which Node runs this gate decides how its paths must be written**, and getting
it wrong fails silently in both directions. Since 2026-09-09 there is a Node in
WSL too, so this is now a real choice rather than a given.

`loadConfig` resolves with `path.isAbsolute` and then `fs.existsSync`. Under
POSIX `path` — which is what WSL Node uses — `D:\dev\...` is **not** absolute,
so it gets resolved relative to the repo root, produces nonsense, and every
check fails at the first hurdle. Nothing errors about drive letters; the gate
simply reports a missing DLL.

Two coherent combinations, and no others:

| Interpreter | `dll` / `log` in the config | Note |
|---|---|---|
| **Windows Node** (`/mnt/c/Program Files/nodejs/node.exe`) | `D:\dev\...`, `C:\Users\...` | What the committed config assumes. Keep using this unless you change both. |
| **WSL Node** (`node`) | `/mnt/d/dev/...`, `/mnt/c/Users/...` | Also set `FO4_WINDOWS_USER` — under WSL, `process.env.USER` is the *Linux* account name, so a `%USER%` substitution in the log path silently resolves to the wrong profile. |

The committed config is the first row. Changing it to the second means editing
both entries and its `_comment` together — a half-converted config is the worst
of the three states, because the DLL check and the log check will disagree about
which filesystem they are on.

Unverified as of 2026-09-10: the WSL-Node combination has not been run. Only the
Windows-Node path has ever produced a passing static check (§8, Status).

The `dll` key accepts a list and takes the first entry that exists, because
which subdirectory xmake writes to depends on the active mode (`release` vs
`releasedbg`) — easy to change, easy to forget.

### The .pex is not optional

Measured, not assumed. With the DLL loaded and `BindNativeMethod` reporting no
error, dispatching `FO4Hello.GetAnswer` through the VM still fails:

    [I] FO4Hello: running self-test
    [E] FO4Hello: self-test GetAnswer was cancelled
    [E] FO4Hello: self-test dispatch failed — is FO4Hello.pex in Data/Scripts?

So binding a native and registering a *type* are separate things. The VM's type
table is populated from compiled scripts only; `BindNativeMethod` attaches a
function to a type that must already exist, and silently succeeds when it does
not. Without the `.pex` there is nothing to dispatch to and the stack is
cancelled before it runs.

The practical consequence: the Creation Kit is on M0.3's critical path after
all, purely for `PapyrusCompiler.exe`. A `Native Hidden` script still avoids
needing an ESP, a quest or any form — but it does not avoid needing to be
compiled.

### Status: 2026-09-07

The static half passes. `xmake build` produces a 64-bit PE32+ DLL exporting
`F4SEPlugin_Version`, which also confirms CommonLibF4's Papyrus binding API,
`BSFixedString` marshalling and `REL::GetFileVersion` all compile against the
pinned library commit. The log half is still red and needs F4SE, the Address
Library and the Creation Kit's Papyrus compiler.

`tools/verify-dll.js` checks two independent things, because either alone is easy
to fool:

- **Static** — the artifact is a 64-bit PE DLL exporting `F4SEPlugin_Version`.
  Catches a build that produced the wrong kind of thing.
- **Dynamic** — the plugin's log at
  `Documents\My Games\Fallout4\F4SE\FO4Hello.log` is **newer than the DLL** and
  contains the load line, the registration line, and a `GetAnswer -> 42` result.
  The freshness comparison is the load-bearing part: without it, a log from last
  week passes the gate forever.

To produce the log, launch via `f4se_loader.exe` — **not** Steam's Play button,
which starts the game without F4SE and produces no log at all.

`getf4seversion` and `cgf` are **in-game console** commands, not shell commands.
Open the console with the key **left of `1`**, type, press Escape.

That key is not `~` on this machine. The layout here is `0409:00000406` —
English (US) language with a **Danish keyboard** — and Fallout 4 binds the
console to a physical key position, not to a character. Left of `1` on Danish
hardware is **`½ §`**, so that is the console key. `Win+Space` to switch to the
en-US layout is the fallback if the physical key does not register.

The Papyrus VM does not start at the main menu, so `papyrus natives registered`
only appears once you are actually in the world. From the main menu console,
`coc qasmoke` teleports straight into a test cell and skips the intro entirely —
much faster than starting a new game.

Then run in the console:

    cgf "FO4Hello.GetAnswer"
    cgf "FO4Hello.GetGreeting" "Jonas"

`cgf` (Call Global Function) is why M0.3 needs no ESP, no quest and no form — the
Papyrus script is declared `Native Hidden`, so the console can call its globals
directly. The Creation Kit is needed only for `PapyrusCompiler.exe`.
