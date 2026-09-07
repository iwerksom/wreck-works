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
| Fallout 4 | 1.11.240, Steam | **Not installed** — download queued, 0 bytes fetched | See §3 |
| Free space on C: | ~60 GB during install | **51 GB free of 931 GB** | **Blocking — see §3** |
| MSVC | 2022 Build Tools, C++23 (19.4x) | **2019 Build Tools, MSVC 14.29** | Install VS 2022 Build Tools |
| Windows SDK | 10.0.22621+ | 10.0.19041 | Comes with the above |
| xmake | 3.0.0+ | **Not installed** | `winget install xmake-io.xmake` |
| Node.js | any LTS | v20.10.0 (Windows-side only) | See §5 |
| F4SE | 0.7.9 | Not installed | f4se.silverlock.org |
| Address Library for F4SE Plugins | next-gen version | Not installed | Nexus mod 47327 |
| Creation Kit | latest | Not installed | Bethesda launcher — needed for `PapyrusCompiler.exe` |
| Mod Organizer 2 | 2.5+ | **Not installed** | github.com/ModOrganizer2 |

### You do not need the Visual Studio IDE

You need the **compiler**, not the IDE. **Visual Studio Build Tools 2022** with
the "Desktop development with C++" workload is a free, command-line-only install
that provides MSVC 19.4x and the Windows SDK. VS Code plus the `xmake` and
`clangd` extensions is then a perfectly good editor — `xmake project -k
compile_commands` generates the index clangd needs.

What will *not* work is the MSVC 14.29 already on this machine. CommonLibF4 sets
`set_languages("c++23")`; VS 2019 tops out at C++20. This is a hard stop, not a
warning.

## 3. Blocking: disk space

`appmanifest_377160.acf` currently reads:

    BytesToDownload   27,324,171,488   (~27.3 GB)
    BytesToStage      28,918,512,137   (~28.9 GB)
    BytesDownloaded   0

Against **51 GB free**. Steam stages content before committing it to the install
folder, so peak usage during a fresh install approaches the sum of both figures —
roughly 56 GB. This download is likely to fail partway through, after hours.

Do one of these before letting it run:

1. **Free ~20 GB on C:.** The Steam library on this machine already holds several
   30–60 GB titles (Metro Exodus ~61 GB, Witcher 3 ~30 GB, Truck sims ~38 GB);
   uninstalling one and reinstalling it later is the cheapest fix.
2. **Install to a different drive.** Steam → Settings → Storage → add a library
   folder, then set Fallout 4's install location before the download starts.
   Everything in this document works unchanged; set `FO4_PATH` accordingly.

Whichever you pick, note that the modding install wants headroom beyond the game
itself: MO2 profiles, a full Creation Kit, unpacked base scripts and build
artifacts add up to several GB more.

## 4. Install order

The order matters — each step's verification depends on the previous one.

1. **Fallout 4**, from Steam. Launch it once, to the main menu, so it writes
   `Documents\My Games\Fallout4\`. Quit. Disable auto-updates (§1).
2. **Record the version** (§1) and write it into §7.
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
9. **The plugin repo**:

   ```bash
   git clone --recurse-submodules <fo4-hello> && cd fo4-hello
   xmake build
   ```

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

Fill in when M0.3's gate passes. Append, never overwrite.

| Date | Game runtime | Steam BuildID | F4SE | commonlibf4 commit | MSVC |
|---|---|---|---|---|---|
| _pending_ | _expected 1.11.240_ | `24564252` (target) | _expected 0.7.9_ | `16cff687` | _pending_ |

## 8. The M0.3 gate

```bash
cd ../fo4-hello && xmake build
cd ../wreck-works && "/mnt/c/Program Files/nodejs/node.exe" tools/verify-dll.js
```

`tools/verify-dll.js` checks two independent things, because either alone is easy
to fool:

- **Static** — the artifact is a 64-bit PE DLL exporting `F4SEPlugin_Version`.
  Catches a build that produced the wrong kind of thing.
- **Dynamic** — the plugin's log at
  `Documents\My Games\Fallout4\F4SE\FO4Hello.log` is **newer than the DLL** and
  contains the load line, the registration line, and a `GetAnswer -> 42` result.
  The freshness comparison is the load-bearing part: without it, a log from last
  week passes the gate forever.

To produce the log, launch via `f4se_loader.exe` and run in the console:

    cgf "FO4Hello.GetAnswer"
    cgf "FO4Hello.GetGreeting" "Jonas"

`cgf` (Call Global Function) is why M0.3 needs no ESP, no quest and no form — the
Papyrus script is declared `Native Hidden`, so the console can call its globals
directly. The Creation Kit is needed only for `PapyrusCompiler.exe`.
