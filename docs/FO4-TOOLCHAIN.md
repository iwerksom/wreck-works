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
| Node.js | any LTS | v20.10.0 (Windows-side only) | See §5 |
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
6. **Address Library for F4SE Plugins** (Nexus 47327) — the *next-gen* file, not
   the 1.10.163 one. Installs to `Data\F4SE\Plugins\`.
7. **Mod Organizer 2**, with a Fallout 4 instance. Create a clean profile named
   `dev` and leave it empty — M0.4's gate needs a genuinely clean profile, and
   it is much easier to keep one than to make one later.
8. **Creation Kit**, from the Bethesda launcher. Then unpack
   `Data\Scripts\Source\Base.zip` in place — the Papyrus compiler needs those
   sources on its import path.
9. **The plugin repo** — it lives at `D:\dev\fo4-hello`, on the **Windows**
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

`node` is not on the WSL `PATH`; only the Windows install is present. The gate
scripts therefore run as:

```bash
"/mnt/c/Program Files/nodejs/node.exe" tools/verify-dll.js
```

This applies to `plan-lint.js` too. Worth adding a shell alias, or installing
Node inside WSL, before this becomes a daily papercut.

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

**Those paths are Windows paths, not WSL mount paths.** The gate runs under the
Windows Node install because there is no `node` in WSL, so `/mnt/d/...` is
invisible to it and every check silently fails at the first hurdle. Write
`D:\dev\...`, not `/mnt/d/dev/...`.

The `dll` key accepts a list and takes the first entry that exists, because
which subdirectory xmake writes to depends on the active mode (`release` vs
`releasedbg`) — easy to change, easy to forget.

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
Open the console with the tilde key (`~`, left of `1`), type, press Escape.

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
